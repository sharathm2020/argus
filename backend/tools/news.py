"""
News fetching and stock info retrieval tools.

- Batch-fetches news for all tickers in a single Alpaca API call.
- Fetches basic stock fundamentals (price, sector, market cap) via yfinance.
"""

import os
import logging
import time
from typing import Dict, List, Any

import requests
import yfinance as yf

logger = logging.getLogger(__name__)

# Alpaca News API endpoint
ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news"

# Maximum articles to fetch per ticker
MAX_ARTICLES_PER_TICKER = 5
ALPACA_MAX_LIMIT = 50


def fetch_news_batch(tickers: List[str]) -> Dict[str, List[str]]:
    """
    Fetch recent news headlines for all tickers in a single Alpaca API call.

    Args:
        tickers: List of ticker symbols (e.g., ["AAPL", "MSFT"]).

    Returns:
        Dict mapping ticker -> list of headline strings.
        Returns an empty list for any ticker that had no news or on error.
    """
    api_key = os.environ.get("ALPACA_API_KEY", "")
    secret_key = os.environ.get("ALPACA_SECRET_KEY", "")

    # Initialize result dict with empty lists so every ticker has an entry
    result: Dict[str, List[str]] = {ticker: [] for ticker in tickers}

    if not api_key or not secret_key:
        logger.warning("Alpaca API keys not configured — skipping news fetch.")
        return result

    symbols_param = ",".join(tickers)

    try:
        response = requests.get(
            ALPACA_NEWS_URL,
            headers={
                "APCA-API-KEY-ID": api_key,
                "APCA-API-SECRET-KEY": secret_key,
            },
            params={
                "symbols": symbols_param,
                "limit": min(MAX_ARTICLES_PER_TICKER * len(tickers), ALPACA_MAX_LIMIT),
                "sort": "desc",
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        # Alpaca returns {"news": [...]} — each article has "symbols" and "headline"
        articles = data.get("news", [])

        # Group headlines by ticker
        ticker_counts: Dict[str, int] = {ticker: 0 for ticker in tickers}
        for article in articles:
            headline = article.get("headline", "").strip()
            article_symbols = [s.upper() for s in article.get("symbols", [])]

            for ticker in tickers:
                if ticker in article_symbols and ticker_counts[ticker] < MAX_ARTICLES_PER_TICKER:
                    result[ticker].append(headline)
                    ticker_counts[ticker] += 1

    except requests.RequestException as exc:
        logger.error("Alpaca news fetch failed: %s", exc)
        # Return whatever was collected; all tickers default to []

    return result


def fetch_stock_info_batch(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch basic stock fundamentals using Financial Modeling Prep API.
    Falls back to empty values if unavailable.
    """
    api_key = os.environ.get("FMP_API_KEY", "")
    result: Dict[str, Dict[str, Any]] = {}

    for ticker in tickers:
        try:
            if not api_key:
                raise ValueError("FMP_API_KEY not configured")

            url = f"https://financialmodelingprep.com/stable/profile?symbol={ticker}"
            response = requests.get(
                url,
                headers={"apikey": api_key},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                raise ValueError(f"No data returned for {ticker}")

            # New stable API returns a dict directly, not a list
            profile = data if isinstance(data, dict) else data[0]
            result[ticker] = {
                "current_price": profile.get("price"),
                "sector": profile.get("sector", "Unknown"),
                "market_cap": profile.get("mktCap"),
                "company_name": profile.get("companyName", ticker),
            }
            time.sleep(0.2)

        except Exception as exc:
            logger.warning("Stock info fetch failed for %s: %s", ticker, str(exc).split("apikey=")[0])
            result[ticker] = {
                "current_price": None,
                "sector": "Unknown",
                "market_cap": None,
                "company_name": ticker,
            }

    return result
