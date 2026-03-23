"""
comps_client.py — Comparable company (comps) analysis using FMP valuation ratios.

Fetches FMP peer tickers and valuation multiples to produce a side-by-side
comparison of the subject ticker vs. its peer group medians.

ARG-50: Forward P/E added via /stable/analyst-estimates endpoint.
ARG-51: Revenue growth % added via /stable/income-statement endpoint.
"""

import asyncio
import logging
import os
from statistics import median
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_FMP_BASE = "https://financialmodelingprep.com/stable"
_MAX_PEERS = 5
_RATIO_OUTLIER_MAX = 200   # exclude multiples above this (distorts medians)
_REV_GROWTH_CAP    = 2.0   # ±200% cap for peer revenue growth

# Maps internal key → (FMP field name, display label)
_MULTIPLE_KEYS: Dict[str, tuple] = {
    "pe":        ("priceToEarningsRatio",       "P/E"),
    "ev_ebitda": ("enterpriseValueMultiple",    "EV/EBITDA"),
    "ps":        ("priceToSalesRatio",          "P/S"),
    "pfcf":      ("priceToFreeCashFlowRatio",  "P/FCF"),
}


async def fetch_peer_tickers(ticker: str) -> List[str]:
    """
    Return up to _MAX_PEERS peer ticker symbols from FMP /stable/peers.
    Returns an empty list on any failure.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_FMP_BASE}/stock-peers",
                params={"symbol": ticker, "apikey": api_key},
            )
        if response.status_code != 200:
            return []
        data = response.json()
        if isinstance(data, list):
            peers = [item["symbol"] for item in data if isinstance(item, dict) and "symbol" in item]
            return peers[:_MAX_PEERS]
    except Exception as exc:
        logger.warning("Peer fetch failed for %s: %s", ticker, exc)
    return []


async def fetch_valuation_ratios(ticker: str) -> Dict[str, Optional[float]]:
    """
    Return the most recent annual valuation ratios for *ticker* from FMP.
    Keys: pe, ev_ebitda, ps, pfcf. Any missing field is None.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_FMP_BASE}/ratios",
                params={"symbol": ticker, "limit": 1, "apikey": api_key},
            )
        if response.status_code != 200:
            return {}
        data = response.json()
        if not data or not isinstance(data, list):
            return {}
        row = data[0]
        result: Dict[str, Optional[float]] = {}
        for key, (fmp_field, _) in _MULTIPLE_KEYS.items():
            raw = row.get(fmp_field)
            result[key] = float(raw) if raw is not None else None
        return result
    except Exception as exc:
        logger.warning("Ratio fetch failed for %s: %s", ticker, exc)
        return {}


async def fetch_forward_pe(ticker: str) -> Optional[float]:
    """
    Compute forward P/E from FMP analyst EPS estimates and the live quote price.

    Uses /stable/analyst-estimates (estimatedEpsAvg) and /stable/quote (price).
    Returns None when estimatedEpsAvg is missing, zero, or negative.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            est_res, quote_res = await asyncio.gather(
                client.get(
                    f"{_FMP_BASE}/analyst-estimates",
                    params={"symbol": ticker, "limit": 1, "apikey": api_key},
                ),
                client.get(
                    f"{_FMP_BASE}/quote",
                    params={"symbol": ticker, "apikey": api_key},
                ),
            )
        if est_res.status_code != 200 or quote_res.status_code != 200:
            return None
        est_data   = est_res.json()
        quote_data = quote_res.json()
        if not isinstance(est_data, list) or not est_data:
            return None
        if not isinstance(quote_data, list) or not quote_data:
            return None
        eps   = est_data[0].get("estimatedEpsAvg")
        price = quote_data[0].get("price")
        if not eps or not price or float(eps) <= 0:
            return None
        return round(float(price) / float(eps), 1)
    except Exception as exc:
        logger.warning("Forward P/E fetch failed for %s: %s", ticker, exc)
        return None


async def fetch_peer_revenue_growth(ticker: str) -> Optional[float]:
    """
    Compute year-over-year revenue growth from the last two income statements.

    Uses /stable/income-statement?limit=2. Result is capped at ±200%.
    Returns None when data is insufficient.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_FMP_BASE}/income-statement",
                params={"symbol": ticker, "limit": 2, "apikey": api_key},
            )
        if response.status_code != 200:
            return None
        data = response.json()
        if not isinstance(data, list) or len(data) < 2:
            return None
        rev1 = data[0].get("revenue")
        rev2 = data[1].get("revenue")
        if not rev1 or not rev2 or float(rev2) == 0:
            return None
        growth = (float(rev1) - float(rev2)) / float(rev2)
        return round(max(-_REV_GROWTH_CAP, min(_REV_GROWTH_CAP, growth)), 4)
    except Exception as exc:
        logger.warning("Revenue growth fetch failed for %s: %s", ticker, exc)
        return None


async def calculate_comps(
    ticker: str,
    subject_price: Optional[float] = None,
    revenue_growth: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Compute a comparable-company analysis for *ticker*.

    ARG-50: Includes forward P/E alongside trailing P/E.
    ARG-51: Includes revenue growth % for subject and peer median.

    Args:
        ticker:          Subject ticker symbol.
        subject_price:   Pre-fetched current price (from DCF) — avoids a redundant
                         quote API call when computing forward P/E for the subject.
        revenue_growth:  Pre-computed revenue growth for the subject (from DCF
                         inputs.revenue_growth, uncapped).

    Returns:
        On success:
            {
                "available": True,
                "ticker": str,
                "peers_used": [...],
                "multiples": {
                    "pe":          {ticker_value, peer_median, premium_discount_pct, label},
                    "forward_pe":  {ticker_value, peer_median, premium_discount_pct, label,
                                    note, badge_threshold},
                    "ev_ebitda":   {...},
                    "ps":          {...},
                    "pfcf":        {...},
                },
                "revenue_growth":              float | None,
                "peer_revenue_growth_median":  float | None,
                "rev_growth_vs_peers":         float | None,
            }
        On failure:
            {"available": False, "reason": str}
    """
    try:
        peers = await fetch_peer_tickers(ticker)
        if not peers:
            return {"available": False, "reason": "No peer tickers found"}

        all_symbols = [ticker] + peers

        # ── Fetch all data concurrently ──────────────────────────────────────
        # Three parallel gather groups:
        #   1. Valuation ratios for all symbols
        #   2. Forward P/E for all symbols (subject + peers)
        #   3. Peer revenue growth (only peers; subject value is passed in)
        (
            ratio_results,
            fwd_pe_results,
            peer_rev_growth_results,
        ) = await asyncio.gather(
            asyncio.gather(*[fetch_valuation_ratios(sym) for sym in all_symbols],  return_exceptions=True),
            asyncio.gather(*[fetch_forward_pe(sym)       for sym in all_symbols],  return_exceptions=True),
            asyncio.gather(*[fetch_peer_revenue_growth(sym) for sym in peers],     return_exceptions=True),
        )

        # ── Resolve subject results ──────────────────────────────────────────
        subject_ratios: Dict[str, Optional[float]] = (
            ratio_results[0] if not isinstance(ratio_results[0], Exception) else {}
        )
        subject_fwd_pe: Optional[float] = (
            fwd_pe_results[0] if not isinstance(fwd_pe_results[0], Exception) else None
        )

        # ── Build per-peer dicts ─────────────────────────────────────────────
        peer_data: List[Dict[str, Any]] = []
        for i, peer in enumerate(peers):
            ratios     = ratio_results[i + 1]
            fwd_pe     = fwd_pe_results[i + 1]
            rev_growth = peer_rev_growth_results[i]
            if not isinstance(ratios, Exception) and isinstance(ratios, dict):
                peer_data.append({
                    "symbol":       peer,
                    "ratios":       ratios,
                    "forward_pe":   fwd_pe     if not isinstance(fwd_pe,     Exception) else None,
                    "rev_growth":   rev_growth if not isinstance(rev_growth, Exception) else None,
                })

        peers_used = [p["symbol"] for p in peer_data]

        # ── Build multiples dict (insertion order matters for frontend) ──────
        multiples: Dict[str, Dict[str, Any]] = {}

        for key, (_, label) in _MULTIPLE_KEYS.items():
            ticker_val: Optional[float] = subject_ratios.get(key) if subject_ratios else None

            peer_vals: List[float] = []
            for p in peer_data:
                v = p["ratios"].get(key)
                if v is not None and 0 < v <= _RATIO_OUTLIER_MAX:
                    peer_vals.append(v)

            peer_med: Optional[float] = median(peer_vals) if len(peer_vals) >= 2 else None
            prem_disc: Optional[float] = None
            if ticker_val is not None and peer_med is not None:
                prem_disc = ((ticker_val - peer_med) / peer_med) * 100

            multiples[key] = {
                "ticker_value":        round(ticker_val, 1) if ticker_val is not None else None,
                "peer_median":         round(peer_med,  1)  if peer_med  is not None else None,
                "premium_discount_pct": round(prem_disc, 1) if prem_disc is not None else None,
                "label": label,
            }

            # ── Insert forward_pe immediately after trailing pe ──────────────
            if key == "pe":
                peer_fwd_pes: List[float] = [
                    p["forward_pe"] for p in peer_data
                    if p["forward_pe"] is not None and 0 < p["forward_pe"] <= _RATIO_OUTLIER_MAX
                ]
                peer_fwd_med: Optional[float] = (
                    median(peer_fwd_pes) if len(peer_fwd_pes) >= 2 else None
                )
                fwd_prem_disc: Optional[float] = None
                if subject_fwd_pe is not None and peer_fwd_med is not None:
                    fwd_prem_disc = ((subject_fwd_pe - peer_fwd_med) / peer_fwd_med) * 100

                # Only include the row when at least one meaningful value exists
                if subject_fwd_pe is not None or peer_fwd_med is not None:
                    multiples["forward_pe"] = {
                        "ticker_value":        subject_fwd_pe,
                        "peer_median":         round(peer_fwd_med, 1) if peer_fwd_med is not None else None,
                        "premium_discount_pct": round(fwd_prem_disc, 1) if fwd_prem_disc is not None else None,
                        "label":           "Fwd P/E",
                        "note":            "Based on analyst EPS estimates",
                        "badge_threshold": 15,
                    }

        # ── Revenue growth (ARG-51) ──────────────────────────────────────────
        peer_rev_growths: List[float] = [
            p["rev_growth"] for p in peer_data if p["rev_growth"] is not None
        ]
        peer_rev_growth_med: Optional[float] = (
            median(peer_rev_growths) if len(peer_rev_growths) >= 2 else None
        )
        rev_growth_vs_peers: Optional[float] = None
        if revenue_growth is not None and peer_rev_growth_med is not None:
            rev_growth_vs_peers = round(revenue_growth - peer_rev_growth_med, 4)

        return {
            "available":                   True,
            "ticker":                      ticker,
            "peers_used":                  peers_used,
            "multiples":                   multiples,
            "revenue_growth":              round(revenue_growth, 4) if revenue_growth is not None else None,
            "peer_revenue_growth_median":  round(peer_rev_growth_med, 4) if peer_rev_growth_med is not None else None,
            "rev_growth_vs_peers":         rev_growth_vs_peers,
        }

    except Exception as exc:
        logger.warning("Comps calculation failed for %s: %s", ticker, exc)
        return {"available": False, "reason": str(exc)}
