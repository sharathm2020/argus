"""
Argus LangChain agent.

Orchestrates per-ticker risk analysis and portfolio-level summary
using GPT-4o. News and filing data are pre-fetched before the agent runs,
so no external calls happen inside the agent itself.
"""

import logging
from typing import Any, Dict, List, Tuple

from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

from models.schemas import PortfolioRiskResponse, TickerRiskResult
from prompts.risk_narrative import (
    build_ticker_prompt,
    build_portfolio_summary_prompt,
    json_output_parser,
)

logger = logging.getLogger(__name__)

# ── LLM setup ────────────────────────────────────────────────────────────────

def _get_llm(temperature: float = 0.2) -> ChatOpenAI:
    """Instantiate the GPT-4o LLM. API key is read from OPENAI_API_KEY env var."""
    return ChatOpenAI(
        model="gpt-4o",
        temperature=temperature,
    )


# ── Per-ticker analysis ───────────────────────────────────────────────────────

async def analyze_ticker(
    ticker: str,
    weight: float,
    news_headlines: List[str],
    stock_info: Dict[str, Any],
    risk_factors: str,
    llm: ChatOpenAI,
) -> TickerRiskResult:
    """
    Run the risk narrative LLM call for a single ticker.

    Args:
        ticker:          Ticker symbol.
        weight:          Portfolio weight (0-1).
        news_headlines:  Pre-fetched headlines list.
        stock_info:      Dict with sector, market_cap, current_price, company_name.
        risk_factors:    Pre-fetched 10-K Item 1A text.
        llm:             Shared LLM instance.

    Returns:
        TickerRiskResult with all fields populated.
    """
    sector = stock_info.get("sector", "Unknown")
    market_cap = stock_info.get("market_cap")

    # Build prompt (all static vars pre-filled via .partial())
    prompt = build_ticker_prompt(
        ticker=ticker,
        weight=weight,
        sector=sector,
        market_cap=market_cap,
        news_headlines=news_headlines,
        risk_factors=risk_factors,
    )

    # Chain: prompt -> LLM -> JSON parser
    chain = prompt | llm | json_output_parser

    try:
        parsed: Dict[str, Any] = await chain.ainvoke({})
    except Exception as exc:
        logger.error("LLM call failed for %s: %s", ticker, exc)
        # Return a safe fallback so one bad ticker doesn't abort the whole run
        parsed = {
            "risk_summary": f"Risk analysis for {ticker} could not be completed at this time.",
            "key_risks": ["Analysis unavailable"],
            "sentiment_score": 0.0,
        }

    # Clamp sentiment_score to valid range
    sentiment = float(parsed.get("sentiment_score", 0.0))
    sentiment = max(-1.0, min(1.0, sentiment))

    return TickerRiskResult(
        ticker=ticker,
        weight=weight,
        risk_summary=parsed.get("risk_summary", ""),
        key_risks=parsed.get("key_risks", []),
        sentiment_score=sentiment,
        news_headlines=news_headlines,
    )


# ── Portfolio summary ─────────────────────────────────────────────────────────

async def generate_portfolio_summary(
    results: List[TickerRiskResult],
    llm: ChatOpenAI,
) -> str:
    """
    Generate a portfolio-level risk summary by synthesizing individual results.

    Args:
        results: List of per-ticker TickerRiskResult objects.
        llm:     Shared LLM instance.

    Returns:
        Plain text portfolio summary string.
    """
    # Build a structured text block of position summaries
    position_lines: List[str] = []
    for r in results:
        position_lines.append(
            f"- {r.ticker} ({r.weight * 100:.1f}% weight, "
            f"sentiment={r.sentiment_score:+.2f}): {r.risk_summary}"
        )
    position_summaries = "\n".join(position_lines)

    prompt = build_portfolio_summary_prompt()
    chain = prompt | llm | StrOutputParser()

    try:
        summary: str = await chain.ainvoke({"position_summaries": position_summaries})
    except Exception as exc:
        logger.error("Portfolio summary LLM call failed: %s", exc)
        summary = (
            "A portfolio-level summary could not be generated at this time. "
            "Please review individual ticker assessments above."
        )

    return summary.strip()


# ── Main orchestrator ─────────────────────────────────────────────────────────

async def run_portfolio_analysis(
    positions: List[Tuple[str, float]],
    news_data: Dict[str, List[str]],
    stock_info: Dict[str, Dict[str, Any]],
    risk_factors: Dict[str, str],
) -> PortfolioRiskResponse:
    """
    Orchestrate the full portfolio risk analysis.

    Args:
        positions:    List of (ticker, weight) tuples.
        news_data:    Dict mapping ticker -> list of headline strings.
        stock_info:   Dict mapping ticker -> yfinance fundamentals dict.
        risk_factors: Dict mapping ticker -> 10-K risk factors text.

    Returns:
        PortfolioRiskResponse with per-ticker results and portfolio summary.
    """
    llm = _get_llm()

    # Analyze all tickers concurrently using asyncio.gather (called from main.py)
    import asyncio

    tasks = [
        analyze_ticker(
            ticker=ticker,
            weight=weight,
            news_headlines=news_data.get(ticker, []),
            stock_info=stock_info.get(ticker, {}),
            risk_factors=risk_factors.get(ticker, ""),
            llm=llm,
        )
        for ticker, weight in positions
    ]

    results: List[TickerRiskResult] = list(await asyncio.gather(*tasks))

    # Generate portfolio-level summary
    portfolio_summary = await generate_portfolio_summary(results, llm)

    # Compute weighted-average overall sentiment
    overall_sentiment = sum(r.sentiment_score * r.weight for r in results)
    overall_sentiment = max(-1.0, min(1.0, overall_sentiment))

    return PortfolioRiskResponse(
        results=results,
        portfolio_summary=portfolio_summary,
        overall_sentiment=round(overall_sentiment, 4),
    )
