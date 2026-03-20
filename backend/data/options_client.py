"""
options_client.py — Fetch and filter options chain data via yfinance.

All network calls are synchronous (yfinance) so they must be dispatched
via asyncio.to_thread() from async contexts.
"""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List

import yfinance as yf

logger = logging.getLogger(__name__)

# Put candidate filter parameters
_MIN_DAYS = 21
_MAX_DAYS = 60
_MIN_MONEYNESS = 0.80   # 80% of current price (floor)
_MAX_MONEYNESS = 1.00   # 100% of current price (ATM cap)
_MIN_OPEN_INTEREST = 100
_MAX_CANDIDATES = 3


def fetch_options_chain(ticker: str) -> List[Dict[str, Any]]:
    """
    Fetch put contracts for *ticker* across all expiry dates that fall
    21–60 days from today, using yfinance.

    Synchronous — intended to be called via asyncio.to_thread().

    Returns:
        List of contract dicts with keys: strike, expiration,
        impliedVolatility, bid, ask, openInterest, optionType.
        Returns an empty list at every failure point.
    """
    try:
        ticker_obj = yf.Ticker(ticker)

        try:
            expirations = ticker_obj.options
        except Exception as exc:
            logger.warning("Could not fetch options expirations for %s: %s", ticker, exc)
            return []

        if not expirations:
            logger.warning("No options expirations available for %s", ticker)
            return []

        today = date.today()
        min_exp = today + timedelta(days=_MIN_DAYS)
        max_exp = today + timedelta(days=_MAX_DAYS)

        valid_expiries = [
            exp for exp in expirations
            if min_exp <= date.fromisoformat(exp) <= max_exp
        ]

        if not valid_expiries:
            logger.warning("No options in 21-60 day window for %s", ticker)
            return []

        contracts: List[Dict[str, Any]] = []
        for expiry in valid_expiries:
            try:
                puts = ticker_obj.option_chain(expiry).puts
                if puts is None or puts.empty:
                    continue
                for _, row in puts.iterrows():
                    try:
                        contracts.append({
                            "strike":            float(row.get("strike", 0)),
                            "expiration":        expiry,
                            "impliedVolatility": float(row.get("impliedVolatility", 0)),
                            "bid":               float(row.get("bid", 0)),
                            "ask":               float(row.get("ask", 0)),
                            "openInterest":      int(row.get("openInterest", 0)),
                            "optionType":        "put",
                        })
                    except Exception:
                        continue
            except Exception as exc:
                logger.warning("Failed to fetch chain for %s expiry %s: %s", ticker, expiry, exc)
                continue

        return contracts

    except Exception as exc:
        logger.warning("Options chain fetch failed for %s: %s", ticker, exc)
        return []


def filter_put_candidates(
    contracts: List[Dict[str, Any]],
    current_price: float,
) -> List[Dict[str, Any]]:
    """
    Filter *contracts* to liquid near-term put candidates.

    Criteria:
      - optionType == "put"
      - expiration 21–60 days from today
      - strike between 80% and 100% of current_price
      - openInterest >= 100

    Returns top 3 by implied volatility (descending), each with
    keys: strike, expiration, impliedVolatility (as %), bid, ask,
    openInterest.
    """
    today = date.today()
    min_exp = today + timedelta(days=_MIN_DAYS)
    max_exp = today + timedelta(days=_MAX_DAYS)
    min_strike = current_price * _MIN_MONEYNESS
    max_strike = current_price * _MAX_MONEYNESS

    candidates: List[Dict[str, Any]] = []
    for c in contracts:
        if c.get("optionType", "").lower() != "put":
            continue

        try:
            exp = date.fromisoformat(str(c.get("expiration", "")))
        except (ValueError, TypeError):
            continue
        if not (min_exp <= exp <= max_exp):
            continue

        try:
            strike = float(c["strike"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (min_strike <= strike <= max_strike):
            continue

        if (c.get("openInterest") or 0) < _MIN_OPEN_INTEREST:
            continue

        candidates.append(c)

    # Sort highest IV first (most expensive protection = strongest signal)
    candidates.sort(
        key=lambda x: float(x.get("impliedVolatility") or 0),
        reverse=True,
    )

    result: List[Dict[str, Any]] = []
    for c in candidates[:_MAX_CANDIDATES]:
        iv = c.get("impliedVolatility")
        result.append({
            "strike": float(c["strike"]),
            "expiration": str(c["expiration"]),
            # FMP returns IV as a decimal (e.g. 0.35); convert to percentage
            "impliedVolatility": round(float(iv) * 100, 1) if iv is not None else None,
            "bid": c.get("bid"),
            "ask": c.get("ask"),
            "openInterest": c.get("openInterest"),
        })
    return result
