"""
correlation_client.py — Portfolio correlation matrix and parametric VaR.

Fetches 90-day price history via yfinance, computes pairwise return
correlations, and estimates portfolio VaR at 95% and 99% confidence.

ARG-54: Correlation matrix heatmap data
ARG-59: Value at Risk (VaR) estimation
"""

import asyncio
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def compute_correlation_matrix(
    tickers: list[str],
    weights: dict[str, float] | None = None,
) -> dict | None:
    """
    Fetch 90-day closing prices and compute correlations + portfolio VaR.

    Args:
        tickers: List of ticker symbols (all asset types are included).
        weights: Dict mapping ticker → portfolio weight (0–1 floats summing
                 to 1). If None, equal weights are used for VaR.

    Returns:
        {
            "tickers": [...],               # tickers with valid data
            "matrix": [[float, ...], ...],  # N×N correlation matrix
            "var_95": float | None,         # 1-day 95% VaR as decimal
            "var_99": float | None,         # 1-day 99% VaR as decimal
            "portfolio_volatility": float | None,   # daily std dev
            "annualized_volatility": float | None,  # daily * sqrt(252)
        }
        None if fewer than 2 tickers have sufficient price history.
    """
    if len(tickers) < 2:
        return None

    try:
        return await asyncio.to_thread(_fetch_and_compute, tickers, weights)
    except Exception as exc:
        logger.warning("compute_correlation_matrix failed: %s", exc)
        return None


def _fetch_and_compute(
    tickers: list[str],
    weights: dict[str, float] | None,
) -> dict | None:
    """Synchronous helper — dispatched via asyncio.to_thread."""
    import yfinance as yf
    import pandas as pd

    # Suppress yfinance progress output
    raw = yf.download(
        tickers,
        period="90d",
        auto_adjust=True,
        progress=False,
        threads=False,
    )

    if raw is None or raw.empty:
        return None

    # yfinance returns MultiIndex columns for multiple tickers:
    #   level 0 = price type (Open, High, Low, Close, Volume)
    #   level 1 = ticker symbol
    # For a single ticker it returns flat columns — shouldn't happen here
    # (we check len >= 2) but handle defensively.
    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" not in raw.columns.get_level_values(0):
            return None
        close = raw["Close"]
    else:
        # Flat single-ticker fallback
        if "Close" not in raw.columns:
            return None
        close = raw[["Close"]]
        close.columns = [tickers[0]]

    # Drop tickers that returned all-NaN (e.g. invalid symbols)
    close = close.dropna(axis=1, how="all")
    valid_tickers = list(close.columns)

    if len(valid_tickers) < 2:
        return None

    # Require at least 30 trading days of data
    if len(close.dropna(how="all")) < 30:
        return None

    returns = close.pct_change().dropna(how="all")
    # Drop columns that still have NaN after pct_change (insufficient data)
    returns = returns.dropna(axis=1)
    valid_tickers = list(returns.columns)

    if len(valid_tickers) < 2:
        return None

    if len(returns) < 20:
        return None

    # ── Correlation matrix ────────────────────────────────────────────────
    corr = returns.corr()
    matrix = [
        [round(float(corr.loc[t1, t2]), 2) for t2 in valid_tickers]
        for t1 in valid_tickers
    ]

    # ── Portfolio VaR (parametric, variance-covariance method) ───────────
    var_95 = None
    var_99 = None
    portfolio_volatility = None
    annualized_volatility = None

    try:
        if weights is not None:
            w = np.array(
                [weights.get(t, 0.0) for t in valid_tickers],
                dtype=float,
            )
            total = w.sum()
            if total > 0:
                w = w / total  # renormalize after dropped tickers
        else:
            w = np.ones(len(valid_tickers), dtype=float) / len(valid_tickers)

        portfolio_returns = returns[valid_tickers].dot(w)
        daily_vol = float(portfolio_returns.std())

        var_95 = round(1.645 * daily_vol, 6)
        var_99 = round(2.326 * daily_vol, 6)
        portfolio_volatility = round(daily_vol, 6)
        annualized_volatility = round(daily_vol * np.sqrt(252), 4)
    except Exception as exc:
        logger.warning("VaR computation failed: %s", exc)

    return {
        "tickers": valid_tickers,
        "matrix": matrix,
        "var_95": var_95,
        "var_99": var_99,
        "portfolio_volatility": portfolio_volatility,
        "annualized_volatility": annualized_volatility,
    }
