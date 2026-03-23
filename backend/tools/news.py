"""
News fetching and stock info retrieval tools.

- Batch-fetches news for all tickers in a single Alpaca API call.
- Falls back to Finnhub for any ticker that Alpaca returns 0 headlines for.
- Fetches basic stock fundamentals (price, sector, market cap) via FMP API.

ARG-34: Finnhub fallback for non-Alpaca tickers.
ARG-55: Returns article dicts with published_at timestamps for weighted
        sentiment aggregation.
"""

import asyncio
import logging
import os
import time
from typing import Any, Dict, List

import httpx
import requests

from data.finnhub_client import fetch_finnhub_news

logger = logging.getLogger(__name__)

# Alpaca News API endpoint
ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news"

# Maximum articles to fetch per ticker
MAX_ARTICLES_PER_TICKER = 5
ALPACA_MAX_LIMIT = 50


async def fetch_news_batch(tickers: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetch recent news articles for all tickers.

    Primary source: Alpaca Markets batch API (single request for all symbols).
    Fallback (ARG-34): Finnhub company-news for any ticker Alpaca returns 0 for.

    Args:
        tickers: List of ticker symbols (e.g., ["AAPL", "MSFT"]).

    Returns:
        Dict mapping ticker -> list of article dicts:
            {
                "headline":     str,
                "published_at": str | None,   # ISO 8601 UTC from Alpaca/Finnhub
            }
        Every ticker gets an entry; missing tickers map to [].
    """
    result: Dict[str, List[Dict[str, Any]]] = {ticker: [] for ticker in tickers}

    # ── Alpaca batch fetch ────────────────────────────────────────────────────
    api_key    = os.environ.get("ALPACA_API_KEY", "")
    secret_key = os.environ.get("ALPACA_SECRET_KEY", "")

    if api_key and secret_key:
        symbols_param = ",".join(tickers)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    ALPACA_NEWS_URL,
                    headers={
                        "APCA-API-KEY-ID":     api_key,
                        "APCA-API-SECRET-KEY": secret_key,
                    },
                    params={
                        "symbols": symbols_param,
                        "limit":   min(MAX_ARTICLES_PER_TICKER * len(tickers), ALPACA_MAX_LIMIT),
                        "sort":    "desc",
                    },
                )
            response.raise_for_status()
            data = response.json()

            # Alpaca returns {"news": [...]}
            # Each article has: headline, symbols, created_at, updated_at, …
            articles = data.get("news", [])
            ticker_counts: Dict[str, int] = {t: 0 for t in tickers}

            for article in articles:
                headline = article.get("headline", "").strip()
                if not headline:
                    continue
                article_symbols = [s.upper() for s in article.get("symbols", [])]
                published_at    = article.get("created_at")  # ISO 8601 from Alpaca

                for ticker in tickers:
                    if (
                        ticker in article_symbols
                        and ticker_counts[ticker] < MAX_ARTICLES_PER_TICKER
                    ):
                        result[ticker].append({
                            "headline":     headline,
                            "published_at": published_at,
                        })
                        ticker_counts[ticker] += 1

        except Exception as exc:
            logger.error("Alpaca news fetch failed: %s", exc)
    else:
        logger.warning("Alpaca API keys not configured — skipping Alpaca news fetch.")

    # ── ARG-34: Finnhub fallback for tickers with zero Alpaca articles ───────
    tickers_needing_fallback = [t for t in tickers if len(result[t]) == 0]

    if tickers_needing_fallback:
        fallback_results = await asyncio.gather(
            *[fetch_finnhub_news(ticker) for ticker in tickers_needing_fallback],
            return_exceptions=True,
        )

        for ticker, finnhub_articles in zip(tickers_needing_fallback, fallback_results):
            if isinstance(finnhub_articles, Exception):
                logger.warning(
                    "Finnhub fallback raised an exception for %s: %s",
                    ticker,
                    finnhub_articles,
                )
                continue

            if finnhub_articles:
                result[ticker] = [
                    {
                        "headline":     a["headline"],
                        "published_at": a.get("published_at"),
                    }
                    for a in finnhub_articles
                    if a.get("headline")
                ]
                logger.info(
                    "Alpaca returned 0 headlines for %s, fetching from Finnhub — got %d headlines",
                    ticker,
                    len(result[ticker]),
                )
            else:
                logger.info(
                    "Alpaca returned 0 headlines for %s, Finnhub also returned 0 — no news available.",
                    ticker,
                )

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
                "sector":        profile.get("sector", "Unknown"),
                "industry":      profile.get("industry", ""),
                "market_cap":    profile.get("mktCap"),
                "company_name":  profile.get("companyName", ticker),
                "is_etf":        profile.get("isEtf", False) is True,
            }
            time.sleep(0.2)

        except Exception as exc:
            logger.warning(
                "Stock info fetch failed for %s: %s",
                ticker,
                str(exc).split("apikey=")[0],
            )
            result[ticker] = {
                "current_price": None,
                "sector":        "Unknown",
                "industry":      "",
                "market_cap":    None,
                "company_name":  ticker,
                "is_etf":        False,
            }

    return result
