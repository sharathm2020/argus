"""
finnhub_client.py — Fallback news fetch from Finnhub's company-news endpoint.

Used when Alpaca returns zero headlines for a ticker, which is common for
small-cap, international, or recently listed equities.

ARG-34: Finnhub news fallback
"""

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)

_FINNHUB_BASE = "https://finnhub.io/api/v1"
_MAX_ARTICLES = 10


async def fetch_finnhub_news(
    ticker: str,
    days_back: int = 7,
) -> List[Dict[str, Any]]:
    """
    Fetch recent company news from Finnhub for *ticker*.

    Args:
        ticker:    Ticker symbol (e.g. "AAPL").
        days_back: Calendar days of history to fetch (default 7).

    Returns:
        List of normalized article dicts (newest first, up to 10):
            {
                "headline":     str,
                "summary":      str,
                "published_at": str | None,   # ISO 8601 UTC
                "source":       str,
                "url":          str,
            }
        Returns [] on any error or when FINNHUB_API_KEY is not set.
    """
    api_key = os.environ.get("FINNHUB_API_KEY", "")
    if not api_key:
        logger.warning(
            "FINNHUB_API_KEY not configured — skipping Finnhub fallback for %s.", ticker
        )
        return []

    try:
        today = date.today()
        from_date = today - timedelta(days=days_back)

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_FINNHUB_BASE}/company-news",
                params={
                    "symbol": ticker,
                    "from":   from_date.strftime("%Y-%m-%d"),
                    "to":     today.strftime("%Y-%m-%d"),
                    "token":  api_key,
                },
            )

        if response.status_code != 200:
            logger.warning(
                "Finnhub news returned HTTP %d for %s",
                response.status_code,
                ticker,
            )
            return []

        data = response.json()
        if not isinstance(data, list):
            return []

        articles: List[Dict[str, Any]] = []
        for item in data:
            try:
                ts = item.get("datetime")
                published_at: str | None = None
                if ts is not None:
                    published_at = datetime.fromtimestamp(
                        int(ts), tz=timezone.utc
                    ).isoformat()

                headline = str(item.get("headline", "")).strip()
                if not headline:
                    continue

                articles.append({
                    "headline":     headline,
                    "summary":      str(item.get("summary", "")).strip(),
                    "published_at": published_at,
                    "source":       str(item.get("source", "Finnhub")).strip(),
                    "url":          str(item.get("url", "")).strip(),
                })
            except Exception:
                continue

        # Sort newest first (Finnhub ordering is inconsistent), return top N
        articles.sort(key=lambda x: x["published_at"] or "", reverse=True)
        return articles[:_MAX_ARTICLES]

    except Exception as exc:
        logger.warning("Finnhub news fetch failed for %s: %s", ticker, exc)
        return []
