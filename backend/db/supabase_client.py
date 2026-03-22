"""
Lazy Supabase client singleton.

The client is created on the first call to get_supabase_client() and reused
for the lifetime of the process — same pattern used for the DistilBERT model.

Exposes:
  get_supabase_client()          — returns the singleton Client
  write_sentiment_history(...)   — inserts one row into sentiment_history
  query_sentiment_history(...)   — reads recent rows for a ticker
  save_portfolio(...)            — inserts a saved portfolio row
  get_saved_portfolios(...)      — returns all portfolios for a user
  delete_portfolio(...)          — deletes a portfolio by id + user_id
  save_analysis_history(...)     — inserts a full analysis snapshot
  get_analysis_history(...)      — returns recent analysis list (no snapshot)
  get_analysis_detail(...)       — returns a single analysis with snapshot
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


# ── Saved portfolios ───────────────────────────────────────────────────────────

def save_portfolio(
    user_id: str,
    name: str,
    tickers: List[str],
    weights: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert a new saved portfolio and return the created row."""
    client = get_supabase_client()
    row: Dict[str, Any] = {
        "user_id": user_id,
        "name": name,
        "tickers": tickers,
        "weights": weights,
    }
    response = client.table("saved_portfolios").insert(row).execute()
    if not response.data:
        raise RuntimeError("save_portfolio: no data returned from Supabase insert")
    return response.data[0]


def get_saved_portfolios(user_id: str) -> List[Dict[str, Any]]:
    """Return all saved portfolios for a user, newest first."""
    client = get_supabase_client()
    response = (
        client.table("saved_portfolios")
        .select("id, name, tickers, weights, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return response.data or []


def delete_portfolio(portfolio_id: str, user_id: str) -> bool:
    """Delete a portfolio row, enforcing user_id ownership."""
    client = get_supabase_client()
    client.table("saved_portfolios").delete().eq("id", portfolio_id).eq("user_id", user_id).execute()
    return True


# ── Analysis history ───────────────────────────────────────────────────────────

def save_analysis_history(
    user_id: str,
    tickers: List[str],
    overall_sentiment_score: float,
    overall_sentiment_label: str,
    result_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    """Insert a full analysis snapshot for a user."""
    client = get_supabase_client()
    row: Dict[str, Any] = {
        "user_id": user_id,
        "tickers": tickers,
        "overall_sentiment_score": overall_sentiment_score,
        "overall_sentiment_label": overall_sentiment_label,
        "result_snapshot": result_snapshot,
    }
    response = client.table("analysis_history").insert(row).execute()
    if not response.data:
        raise RuntimeError("save_analysis_history: no data returned from Supabase insert")
    return response.data[0]


def get_analysis_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Return recent analyses for a user without the result_snapshot (too large for list view)."""
    client = get_supabase_client()
    response = (
        client.table("analysis_history")
        .select("id, tickers, overall_sentiment_score, overall_sentiment_label, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


def get_analysis_detail(analysis_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Return a single analysis including result_snapshot, verifying user ownership."""
    client = get_supabase_client()
    response = (
        client.table("analysis_history")
        .select("id, tickers, overall_sentiment_score, overall_sentiment_label, result_snapshot, created_at")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return response.data[0]
