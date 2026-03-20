"""
asset_classifier.py — Classify a ticker as equity, ETF, or crypto.

Used by the analysis pipeline to route each position to the appropriate
data source and narrative framing.
"""

from typing import Literal

# Known crypto tickers tracked by Argus
_CRYPTO_TICKERS: frozenset[str] = frozenset({
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "MATIC",
    "DOT", "LINK", "LTC", "BCH", "XLM", "ALGO", "ATOM", "UNI", "AAVE",
    "CRO", "FTM",
})


def classify_ticker(
    ticker: str,
    fmp_profile: dict,
) -> Literal["equity", "etf", "crypto"]:
    """
    Classify a ticker as "equity", "etf", or "crypto".

    Priority:
      1. Crypto — matched against the hardcoded _CRYPTO_TICKERS set.
      2. ETF    — fmp_profile contains is_etf=True (sourced from FMP profile).
      3. Equity — everything else.

    Args:
        ticker:      Uppercase ticker symbol.
        fmp_profile: Dict returned by fetch_stock_info_batch for this ticker.
                     Must include an "is_etf" boolean key.
    """
    if ticker.upper() in _CRYPTO_TICKERS:
        return "crypto"
    if fmp_profile.get("is_etf") is True:
        return "etf"
    return "equity"
