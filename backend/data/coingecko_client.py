"""
coingecko_client.py — Fetch current market data for crypto assets via CoinGecko.

Uses the /coins/markets endpoint so a single call returns price, market cap,
volume, and 24-hour price change for a given coin.

API key is read from COINGECKO_API_KEY environment variable and passed as the
x-cg-demo-api-key header (required for the CoinGecko Demo tier).
"""

import logging
import os
from typing import Dict

import requests

logger = logging.getLogger(__name__)

# Maps Argus ticker symbols → CoinGecko coin IDs
COINGECKO_ID_MAP: Dict[str, str] = {
    "BTC":   "bitcoin",
    "ETH":   "ethereum",
    "SOL":   "solana",
    "BNB":   "binancecoin",
    "XRP":   "ripple",
    "ADA":   "cardano",
    "DOGE":  "dogecoin",
    "AVAX":  "avalanche-2",
    "MATIC": "matic-network",
    "DOT":   "polkadot",
    "LINK":  "chainlink",
    "LTC":   "litecoin",
    "BCH":   "bitcoin-cash",
    "XLM":   "stellar",
    "ALGO":  "algorand",
    "ATOM":  "cosmos",
    "UNI":   "uniswap",
    "AAVE":  "aave",
    "CRO":   "crypto-com-chain",
    "FTM":   "fantom",
}

_COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets"


def get_crypto_data(ticker: str) -> Dict:
    """
    Fetch current market data for a crypto ticker from CoinGecko.

    Intended to be called via asyncio.to_thread() from async contexts.

    Returns:
        {
            "price":               float | None,
            "market_cap":          float | None,
            "volume_24h":          float | None,
            "price_change_24h_pct": float | None,
        }
        Returns an empty dict on any failure.
    """
    coin_id = COINGECKO_ID_MAP.get(ticker.upper())
    if not coin_id:
        logger.warning("No CoinGecko ID mapping for ticker %s", ticker)
        return {}

    headers: Dict[str, str] = {}
    api_key = os.environ.get("COINGECKO_API_KEY", "").strip()
    if api_key:
        headers["x-cg-demo-api-key"] = api_key

    try:
        response = requests.get(
            _COINGECKO_MARKETS_URL,
            params={"vs_currency": "usd", "ids": coin_id},
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if not data:
            logger.warning("CoinGecko returned empty response for %s (%s)", ticker, coin_id)
            return {}

        coin = data[0]
        return {
            "price":                coin.get("current_price"),
            "market_cap":           coin.get("market_cap"),
            "volume_24h":           coin.get("total_volume"),
            "price_change_24h_pct": coin.get("price_change_percentage_24h"),
        }

    except Exception as exc:
        logger.warning("CoinGecko fetch failed for %s: %s", ticker, exc)
        return {}
