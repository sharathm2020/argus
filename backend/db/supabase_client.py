"""
Lazy Supabase client singleton.

The client is created on the first call to get_supabase_client() and reused
for the lifetime of the process — same pattern used for the DistilBERT model.

Exposes:
  get_supabase_client()          — returns the singleton Client
  write_sentiment_history(...)   — inserts one row into sentiment_history
  query_sentiment_history(...)   — reads recent rows for a ticker
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_client = None


def get_supabase_client():
    """Return the lazy-initialized Supabase client singleton."""
    global _client
    if _client is not None:
        return _client

    from supabase import create_client  # noqa: PLC0415

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY environment variables must be set."
        )

    _client = create_client(url, key)
    logger.info("Supabase client initialized.")
    return _client


def write_sentiment_history(
    ticker: str,
    sentiment_label: Optional[str],
    confidence: Optional[float],
    sentiment_score: float,
    user_id: Optional[str] = None,
) -> None:
    """
    Insert one row into the sentiment_history table.

    Intended to be called via asyncio.to_thread() from async contexts so it
    does not block the event loop.
    """
    client = get_supabase_client()

    # Cooldown: skip write if a row for this ticker was written within the last 15 minutes
    _COOLDOWN = timedelta(minutes=15)
    recent = (
        client.table("sentiment_history")
        .select("analyzed_at")
        .eq("ticker", ticker)
        .order("analyzed_at", desc=True)
        .limit(1)
        .execute()
    )
    if recent.data:
        last_str = recent.data[0]["analyzed_at"]
        last_dt = datetime.fromisoformat(last_str.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - last_dt < _COOLDOWN:
            logger.debug(
                "sentiment_history write skipped for %s — last write was %s ago (cooldown %s)",
                ticker, datetime.now(timezone.utc) - last_dt, _COOLDOWN,
            )
            return

    row: Dict[str, Any] = {
        "ticker": ticker,
        "sentiment_label": sentiment_label,
        "confidence": confidence,
        "sentiment_score": sentiment_score,
        "user_id": user_id,
    }
    logger.debug("sentiment_history insert for %s — user_id=%s", ticker, user_id)
    client.table("sentiment_history").insert(row).execute()
    logger.debug("sentiment_history row written for %s", ticker)


def query_sentiment_history(
    ticker: str,
    limit: int = 90,
) -> List[Dict[str, Any]]:
    """
    Return the most recent `limit` sentiment_history rows for `ticker`.

    Intended to be called via asyncio.to_thread() from async contexts.
    """
    client = get_supabase_client()
    response = (
        client.table("sentiment_history")
        .select("ticker, sentiment_label, confidence, sentiment_score, analyzed_at")
        .eq("ticker", ticker)
        .order("analyzed_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []
