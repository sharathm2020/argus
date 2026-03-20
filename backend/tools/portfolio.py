"""
Portfolio validation and parsing utilities.
Extracts a clean list of (ticker, weight) pairs from a PortfolioRequest.
"""

import logging
import re
from typing import List, Tuple

from models.schemas import PortfolioRequest

logger = logging.getLogger(__name__)

_MAX_TICKERS = 50
_LARGE_PORTFOLIO_THRESHOLD = 20


def parse_portfolio(request: PortfolioRequest) -> List[Tuple[str, float]]:
    """
    Validate and parse a PortfolioRequest into a list of (ticker, weight) tuples.

    Raises ValueError with a descriptive message if validation fails.
    Returns:
        List of (ticker_symbol, weight) tuples, weights already normalized to [0, 1].
    """
    if not request.portfolio:
        raise ValueError("Portfolio is empty. Please provide at least one ticker.")

    if len(request.portfolio) > _MAX_TICKERS:
        raise ValueError(
            f"Portfolio exceeds maximum of {_MAX_TICKERS} tickers. "
            "Please reduce your portfolio size."
        )

    seen_tickers = set()
    parsed: List[Tuple[str, float]] = []

    for item in request.portfolio:
        ticker = item.ticker.upper().strip()

        # Guard against duplicate tickers
        if ticker in seen_tickers:
            raise ValueError(f"Duplicate ticker '{ticker}' found in portfolio.")
        seen_tickers.add(ticker)

        # Extra format guard (Pydantic validator already runs, but explicit is clear)
        if not re.match(r"^[A-Z]{1,5}$", ticker):
            raise ValueError(
                f"Ticker '{ticker}' is invalid. Only 1-5 uppercase letters are allowed."
            )

        if item.weight <= 0 or item.weight > 1:
            raise ValueError(
                f"Weight for '{ticker}' must be in (0, 1]. Got {item.weight}."
            )

        parsed.append((ticker, item.weight))

    # Double-check sum (Pydantic model_validator runs first, but belt-and-suspenders)
    total_weight = sum(w for _, w in parsed)
    if abs(total_weight - 1.0) > 0.01:
        raise ValueError(
            f"Portfolio weights sum to {total_weight:.4f}, but must sum to 1.0 (±0.01)."
        )

    if len(parsed) > _LARGE_PORTFOLIO_THRESHOLD:
        logger.warning(
            "Large portfolio detected: %d tickers. Analysis will use chunked processing.",
            len(parsed),
        )

    return parsed
