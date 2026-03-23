"""
DCF (Discounted Cash Flow) intrinsic value calculator.

Fetches financial data from the FMP stable API and runs a 5-year DCF model.
Returns {"available": False, "reason": "..."} for any asset where the model
cannot be meaningfully applied (ETFs, cryptos, negative FCF, missing data).

ARG-27: Discount rate is now CAPM-derived per ticker:
    discount_rate = risk_free_rate + beta * EQUITY_RISK_PREMIUM
  capped between 6% and 20%.  Caller fetches risk_free_rate once via
  fetch_risk_free_rate() and passes it in to avoid redundant API calls.
"""

import asyncio
import logging
import os
from typing import Any, Dict

import httpx

logger = logging.getLogger(__name__)

_FMP_BASE = "https://financialmodelingprep.com/stable"
_PROJECTION_YEARS = 5

# CAPM parameters
_EQUITY_RISK_PREMIUM = 0.055   # Damodaran estimate
_RISK_FREE_RATE_FALLBACK = 0.043  # 4.3% — used when treasury fetch fails
_CAPM_MIN = 0.06
_CAPM_MAX = 0.20


async def fetch_risk_free_rate() -> float:
    """
    Fetch the current 10-year US Treasury yield from FMP.

    Returns a decimal (e.g. 0.043 for 4.3%). Falls back to
    _RISK_FREE_RATE_FALLBACK on any failure. Intended to be called once
    per analysis job and shared across all calculate_dcf() calls.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return _RISK_FREE_RATE_FALLBACK
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_FMP_BASE}/treasury-rates",
                params={"apikey": api_key},
            )
        if response.status_code != 200:
            return _RISK_FREE_RATE_FALLBACK
        data = response.json()
        if isinstance(data, list) and data:
            raw = data[0].get("year10")
            if raw and float(raw) > 0:
                rate = float(raw)
                # FMP returns percentage form (e.g. 4.3); convert to decimal
                if rate > 1:
                    rate /= 100
                return rate
    except Exception as exc:
        logger.warning("Treasury rate fetch failed: %s", exc)
    return _RISK_FREE_RATE_FALLBACK


async def calculate_dcf(
    ticker: str,
    risk_free_rate: float = _RISK_FREE_RATE_FALLBACK,
) -> Dict[str, Any]:
    """
    Compute a 5-year DCF intrinsic value estimate for *ticker*.

    All four FMP endpoints are fetched concurrently. Returns immediately with
    available=False if any required field is missing, zero, or negative.

    Args:
        ticker:         Ticker symbol.
        risk_free_rate: 10-year Treasury yield as a decimal (e.g. 0.043).
                        Fetch once per job via fetch_risk_free_rate().

    Returns:
        On success:
            {
                "available": True,
                "current_price": float,
                "intrinsic_value": float,
                "margin_of_safety": float,   # percentage, e.g. 23.4 or -15.2
                "verdict": "Undervalued" | "Overvalued" | "Fairly Valued",
                "inputs": {
                    "free_cash_flow": float,
                    "growth_rate": float,
                    "discount_rate": float,
                    "beta": float,
                    "terminal_growth_rate": 0.025,
                    "projection_years": 5,
                    "shares_outstanding": float,
                },
            }
        On failure:
            {
                "available": False,
                "reason": "<explanation>",
                "insufficient_data": True,   # present when equity data is missing/incomplete
            }
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return {"available": False, "reason": "FMP_API_KEY not configured"}

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            cf_res, quote_res, income_res, profile_res = await asyncio.gather(
                client.get(
                    f"{_FMP_BASE}/cash-flow-statement",
                    params={"symbol": ticker, "limit": 1, "apikey": api_key},
                ),
                client.get(
                    f"{_FMP_BASE}/quote",
                    params={"symbol": ticker, "apikey": api_key},
                ),
                client.get(
                    f"{_FMP_BASE}/income-statement",
                    params={"symbol": ticker, "limit": 2, "apikey": api_key},
                ),
                client.get(
                    f"{_FMP_BASE}/profile",
                    params={"symbol": ticker, "apikey": api_key},
                ),
            )

        cf_data      = cf_res.json()      if cf_res.status_code == 200      else []
        quote_data   = quote_res.json()   if quote_res.status_code == 200   else []
        income_data  = income_res.json()  if income_res.status_code == 200  else []
        profile_data = profile_res.json() if profile_res.status_code == 200 else []

        # ── Free Cash Flow ────────────────────────────────────────────────────
        if not cf_data or not isinstance(cf_data, list):
            return {"available": False, "reason": "No free cash flow data available", "insufficient_data": True}
        fcf = cf_data[0].get("freeCashFlow")
        if fcf is None:
            return {"available": False, "reason": "No free cash flow data available", "insufficient_data": True}
        if fcf <= 0:
            return {"available": False, "reason": "DCF requires positive free cash flow", "insufficient_data": True}

        # ── Price + Shares Outstanding ────────────────────────────────────────
        if not quote_data or not isinstance(quote_data, list):
            return {"available": False, "reason": "No quote data available", "insufficient_data": True}
        quote = quote_data[0]
        current_price = quote.get("price")
        if not current_price:
            return {"available": False, "reason": "Missing price or shares outstanding data", "insufficient_data": True}

        # ── Revenue Growth Rate ───────────────────────────────────────────────
        if not income_data or not isinstance(income_data, list) or len(income_data) < 2:
            return {"available": False, "reason": "Insufficient revenue history for growth calculation", "insufficient_data": True}
        rev_year1 = income_data[0].get("revenue")
        rev_year2 = income_data[1].get("revenue")
        if not rev_year1 or not rev_year2 or rev_year2 == 0:
            return {"available": False, "reason": "Revenue data unavailable", "insufficient_data": True}
        raw_growth = (rev_year1 - rev_year2) / rev_year2
        # Cap growth between 2% and 40% (raised ceiling for high-growth companies)
        growth_rate = max(0.02, min(0.40, raw_growth))

        # Dynamic terminal growth rate based on raw (uncapped) growth trajectory
        if raw_growth > 0.25:
            terminal_growth_rate = 0.040
        elif raw_growth > 0.15:
            terminal_growth_rate = 0.035
        else:
            terminal_growth_rate = 0.025

        shares_outstanding = income_data[0].get("weightedAverageShsOut")
        if not shares_outstanding or shares_outstanding <= 0:
            return {"available": False, "reason": "Missing price or shares outstanding data", "insufficient_data": True}

        # ── CAPM Discount Rate ────────────────────────────────────────────────
        # freeCashFlow from FMP is levered FCF (post-interest).
        # CAPM (cost of equity) is the correct discount rate for levered FCF.
        # Using WACC here would be incorrect.
        sector = "Unknown"
        beta = 1.0
        if profile_data and isinstance(profile_data, list):
            profile = profile_data[0]
            sector = profile.get("sector", "Unknown")
            raw_beta = profile.get("beta")
            if raw_beta is not None:
                try:
                    beta = float(raw_beta)
                except (TypeError, ValueError):
                    beta = 1.0

        capm_rate = risk_free_rate + beta * _EQUITY_RISK_PREMIUM
        discount_rate = max(_CAPM_MIN, min(_CAPM_MAX, capm_rate))

        # Enforce terminal_growth_rate < discount_rate - 0.01 to keep Gordon Growth Model valid
        terminal_growth_rate = min(terminal_growth_rate, discount_rate - 0.01)

        # ── DCF Model ─────────────────────────────────────────────────────────
        projected_fcfs = [
            fcf * (1 + growth_rate) ** yr
            for yr in range(1, _PROJECTION_YEARS + 1)
        ]
        discounted_fcfs = [
            pf / (1 + discount_rate) ** yr
            for yr, pf in enumerate(projected_fcfs, 1)
        ]

        year5_fcf = projected_fcfs[-1]
        terminal_value = (
            year5_fcf * (1 + terminal_growth_rate)
        ) / (discount_rate - terminal_growth_rate)
        discounted_tv = terminal_value / (1 + discount_rate) ** _PROJECTION_YEARS

        total_intrinsic = sum(discounted_fcfs) + discounted_tv
        intrinsic_per_share = total_intrinsic / shares_outstanding

        if intrinsic_per_share <= 0:
            return {
                "available": False,
                "reason": "DCF model produced a non-positive intrinsic value",
                "insufficient_data": True,
            }

        # ── Margin of Safety + Verdict ────────────────────────────────────────
        margin_of_safety = (
            (intrinsic_per_share - current_price) / intrinsic_per_share
        ) * 100

        if margin_of_safety > 20:
            verdict = "Undervalued"
        elif margin_of_safety < -20:
            verdict = "Overvalued"
        else:
            verdict = "Fairly Valued"

        return {
            "available": True,
            "sector": sector if sector and sector != "Unknown" else "Unknown",
            "current_price": round(float(current_price), 2),
            "intrinsic_value": round(float(intrinsic_per_share), 2),
            "margin_of_safety": round(float(margin_of_safety), 1),
            "verdict": verdict,
            "inputs": {
                "free_cash_flow": float(fcf),
                "growth_rate": round(float(growth_rate), 4),
                "revenue_growth": round(float(raw_growth), 4),  # uncapped, for comps pass-through
                "discount_rate": round(float(discount_rate), 4),
                "beta": round(float(beta), 2),
                "terminal_growth_rate": terminal_growth_rate,
                "projection_years": _PROJECTION_YEARS,
                "shares_outstanding": float(shares_outstanding),
            },
        }

    except Exception as exc:
        logger.warning("DCF calculation failed for %s: %s", ticker, exc)
        return {"available": False, "reason": f"Data retrieval error: {type(exc).__name__}"}


def compute_sensitivity_table(
    base_fcf: float,
    shares_outstanding: float,
    base_discount_rate: float,
    base_terminal_growth: float,
    base_revenue_growth: float,
    current_price: float,
) -> dict | None:
    """
    Build a 5×5 sensitivity grid varying discount rate and terminal growth rate.

    Discount rate axis (columns):      base ± 2% in 1% steps.
    Terminal growth rate axis (rows):  base ± 2% in 1% steps.

    Each cell runs the same 5-year DCF formula with those rate substitutions.
    Cell values are capped at 10× current_price to suppress extreme outliers.

    Returns None when inputs are insufficient.
    """
    if not base_fcf or base_fcf <= 0 or not shares_outstanding or shares_outstanding <= 0:
        return None
    if not current_price or current_price <= 0:
        return None

    try:
        discount_rates     = [round(base_discount_rate     + (i - 2) * 0.01, 4) for i in range(5)]
        terminal_growths   = [round(base_terminal_growth   + (i - 2) * 0.01, 4) for i in range(5)]

        # Clamp to sensible minimums
        discount_rates   = [max(0.01, dr)  for dr in discount_rates]
        terminal_growths = [max(0.001, tgr) for tgr in terminal_growths]

        growth_rate = base_revenue_growth  # use capped revenue growth from main DCF
        cap = current_price * 10.0

        intrinsic_values: list[list] = []
        for tgr in terminal_growths:
            row: list = []
            for dr in discount_rates:
                try:
                    if dr <= tgr:
                        # Gordon Growth Model requires dr > tgr
                        row.append(None)
                        continue
                    projected_fcfs = [base_fcf * (1 + growth_rate) ** yr for yr in range(1, 6)]
                    discounted_fcfs = [pf / (1 + dr) ** yr for yr, pf in enumerate(projected_fcfs, 1)]
                    year5_fcf = projected_fcfs[-1]
                    terminal_value = (year5_fcf * (1 + tgr)) / (dr - tgr)
                    discounted_tv  = terminal_value / (1 + dr) ** _PROJECTION_YEARS
                    total = sum(discounted_fcfs) + discounted_tv
                    val   = total / shares_outstanding
                    if val <= 0:
                        row.append(None)
                    else:
                        row.append(round(min(val, cap), 2))
                except Exception:
                    row.append(None)
            intrinsic_values.append(row)

        return {
            "discount_rates":       discount_rates,
            "terminal_growth_rates": terminal_growths,
            "intrinsic_values":     intrinsic_values,
            "current_price":        current_price,
            "base_discount_rate":   base_discount_rate,
            "base_terminal_growth": base_terminal_growth,
        }

    except Exception as exc:
        logger.warning("compute_sensitivity_table failed: %s", exc)
        return None
