"""
comps_client.py — Comparable company (comps) analysis using FMP valuation ratios.

Fetches FMP peer tickers and valuation multiples to produce a side-by-side
comparison of the subject ticker vs. its peer group medians.
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

# Maps internal key → (FMP field name, display label)
_MULTIPLE_KEYS: Dict[str, tuple] = {
    "pe":        ("priceToEarningsRatio",        "P/E"),
    "ev_ebitda": ("enterpriseValueMultiple",     "EV/EBITDA"),
    "ps":        ("priceToSalesRatio",           "P/S"),
    "pfcf":      ("priceToFreeCashFlowRatio",   "P/FCF"),
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
        # FMP returns a flat list of peer objects: [{"symbol": "MSFT"}, ...]
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
    Returns an empty dict on any failure.
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


async def calculate_comps(ticker: str) -> Dict[str, Any]:
    """
    Compute a comparable-company analysis for *ticker*.

    Steps:
      1. Fetch peer tickers (sequential — needed before gather).
      2. Fetch valuation ratios for the subject ticker + all peers concurrently.
      3. For each multiple, compute peer median (≥2 valid values required) and
         the premium/discount of the subject ticker vs. that median.

    Returns:
        On success:
            {
                "available": True,
                "ticker": str,
                "peers_used": [...],
                "multiples": {
                    "pe": {
                        "ticker_value": float | None,
                        "peer_median":  float | None,
                        "premium_discount_pct": float | None,
                        "label": "P/E",
                    },
                    ... (ev_ebitda, ps, pfcf)
                }
            }
        On failure:
            {"available": False, "reason": str}
    """
    try:
        peers = await fetch_peer_tickers(ticker)
        if not peers:
            return {"available": False, "reason": "No peer tickers found"}

        # Fetch ratios for subject ticker + all peers concurrently
        all_symbols = [ticker] + peers
        ratio_results = await asyncio.gather(
            *[fetch_valuation_ratios(sym) for sym in all_symbols],
            return_exceptions=True,
        )

        subject_ratios: Dict[str, Optional[float]] = (
            ratio_results[0]
            if not isinstance(ratio_results[0], Exception)
            else {}
        )

        # Build peer (symbol, ratios) pairs, skipping gather exceptions
        peer_data: List[tuple] = []
        for i, peer in enumerate(peers):
            result = ratio_results[i + 1]
            if not isinstance(result, Exception) and isinstance(result, dict):
                peer_data.append((peer, result))

        peers_used = [sym for sym, r in peer_data if r]

        multiples: Dict[str, Dict[str, Any]] = {}
        for key, (_, label) in _MULTIPLE_KEYS.items():
            ticker_val: Optional[float] = (
                subject_ratios.get(key) if subject_ratios else None
            )

            # Collect valid peer values, excluding outliers
            peer_vals: List[float] = []
            for _, ratios in peer_data:
                v = ratios.get(key)
                if v is not None and 0 < v <= _RATIO_OUTLIER_MAX:
                    peer_vals.append(v)

            peer_med: Optional[float] = (
                median(peer_vals) if len(peer_vals) >= 2 else None
            )

            prem_disc: Optional[float] = None
            if ticker_val is not None and peer_med is not None:
                prem_disc = ((ticker_val - peer_med) / peer_med) * 100

            multiples[key] = {
                "ticker_value": round(ticker_val, 1) if ticker_val is not None else None,
                "peer_median":  round(peer_med, 1)   if peer_med  is not None else None,
                "premium_discount_pct": round(prem_disc, 1) if prem_disc is not None else None,
                "label": label,
            }

        return {
            "available": True,
            "ticker": ticker,
            "peers_used": peers_used,
            "multiples": multiples,
        }

    except Exception as exc:
        logger.warning("Comps calculation failed for %s: %s", ticker, exc)
        return {"available": False, "reason": str(exc)}
