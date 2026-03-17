"""
Argus LangChain agent.

Orchestrates per-ticker risk analysis and portfolio-level summary
using GPT-4o. News and filing data are pre-fetched before the agent runs,
so no external calls happen inside the agent itself.
"""

import asyncio
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
from job_store import job_store, JobStatus
from sentiment_analyzer import analyze_sentiment
from tools.dcf import calculate_dcf
from tools.hedging import generate_hedging_suggestions

logger = logging.getLogger(__name__)

# Maximum wall-clock seconds allowed for the full LLM analysis phase
_AGENT_TIMEOUT_SECONDS = 180


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

    On LLM failure, returns a safe placeholder result so one bad ticker
    never aborts the entire job.
    """
    sector = stock_info.get("sector", "Unknown")
    market_cap = stock_info.get("market_cap")

    prompt = build_ticker_prompt(
        ticker=ticker,
        weight=weight,
        sector=sector,
        market_cap=market_cap,
        news_headlines=news_headlines,
        risk_factors=risk_factors,
    )

    chain = prompt | llm | json_output_parser

    # Run the LLM narrative chain and DCF calculation concurrently
    llm_result, dcf_data = await asyncio.gather(
        chain.ainvoke({}),
        calculate_dcf(ticker),
        return_exceptions=True,
    )

    if isinstance(llm_result, Exception):
        logger.warning("LLM call failed for %s: %s", ticker, llm_result)
        parsed: Dict[str, Any] = {
            "risk_summary": "Analysis unavailable for this position.",
            "key_risks": ["Data could not be retrieved"],
        }
        result_headlines = []  # don't surface partial data for a failed ticker
    else:
        parsed = llm_result
        result_headlines = news_headlines

    if isinstance(dcf_data, Exception):
        logger.warning("DCF calculation failed for %s: %s", ticker, dcf_data)
        dcf_data = {"available": False, "reason": "Calculation error"}

    # ── Sentiment via DistilBERT (falls back to GPT-4o output on error) ───────
    sentiment_text = " ".join(news_headlines) if news_headlines else risk_factors[:512]
    confidence_score: float | None = None
    try:
        sentiment_result = analyze_sentiment(sentiment_text)
        label = sentiment_result["label"]
        confidence_score = sentiment_result["score"]
        # Map categorical label → signed float in [-1, 1]
        if label == "positive":
            sentiment = confidence_score
        elif label == "negative":
            sentiment = -confidence_score
        else:
            sentiment = 0.0
    except Exception as exc:
        logger.warning(
            "DistilBERT sentiment failed for %s (%s) — falling back to GPT-4o score.",
            ticker, exc,
        )
        sentiment = float(parsed.get("sentiment_score", 0.0))
        sentiment = max(-1.0, min(1.0, sentiment))

    # Build a short excerpt from the raw 10-K risk factors text
    edgar_excerpt: str | None = None
    if risk_factors:
        raw = risk_factors[:400]
        # Try to truncate cleanly at the last sentence boundary within the limit
        for punct in (".", "!", "?"):
            last = raw.rfind(punct)
            if last > 50:  # ensure we keep a meaningful chunk
                raw = raw[: last + 1]
                break
        edgar_excerpt = raw.strip() or None

    return TickerRiskResult(
        ticker=ticker,
        weight=weight,
        risk_summary=parsed.get("risk_summary", ""),
        key_risks=parsed.get("key_risks", []),
        sentiment_score=sentiment,
        news_headlines=result_headlines,
        edgar_excerpt=edgar_excerpt,
        confidence_score=round(confidence_score, 4) if confidence_score is not None else None,
        dcf_data=dcf_data,
    )


# ── Portfolio summary ─────────────────────────────────────────────────────────

async def generate_portfolio_summary(
    results: List[TickerRiskResult],
    llm: ChatOpenAI,
) -> str:
    """
    Generate a portfolio-level risk summary by synthesizing individual results.
    Falls back to a placeholder on LLM failure.
    """
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


# ── Sector concentration ──────────────────────────────────────────────────────

def calculate_sector_concentration(results: List[TickerRiskResult]) -> Dict[str, Any]:
    """
    Group portfolio weights by sector and flag any sector >= 40%.

    Sector is read from result.dcf_data["sector"] when DCF data is available;
    tickers without DCF data (ETFs, crypto, etc.) contribute to "Unknown".
    """
    sector_weights: Dict[str, float] = {}
    for r in results:
        sector = "Unknown"
        if r.dcf_data and r.dcf_data.get("available") and r.dcf_data.get("sector"):
            sector = r.dcf_data["sector"]
        sector_weights[sector] = sector_weights.get(sector, 0.0) + r.weight

    breakdown = {s: round(w * 100, 1) for s, w in sector_weights.items()}

    flags = [
        {
            "sector": s,
            "weight": w,
            "message": f"{w}% of your portfolio is concentrated in {s}",
        }
        for s, w in breakdown.items()
        if w >= 40.0
    ]

    return {"breakdown": breakdown, "flags": flags, "has_flags": len(flags) > 0}


# ── Main orchestrator ─────────────────────────────────────────────────────────

async def run_portfolio_analysis(
    positions: List[Tuple[str, float]],
    news_data: Dict[str, List[str]],
    stock_info: Dict[str, Dict[str, Any]],
    risk_factors: Dict[str, str],
    job_id: str,
) -> PortfolioRiskResponse:
    """
    Orchestrate the full LLM analysis phase.

    Emits job status updates throughout. Wrapped in a timeout guard and a
    broad try/except — failures mark the job as FAILED rather than crashing
    the server. Does not re-raise on error.

    Args:
        positions:    List of (ticker, weight) tuples.
        news_data:    Dict mapping ticker -> list of headline strings.
        stock_info:   Dict mapping ticker -> fundamentals dict.
        risk_factors: Dict mapping ticker -> 10-K risk factors text.
        job_id:       Job identifier for status updates.
    """

    async def _inner() -> PortfolioRiskResponse:
        llm = _get_llm()

        # ── Phase 4: per-ticker LLM calls ────────────────────────────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Running AI risk analysis per position...")

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

        # ── Phase 5: portfolio summary ────────────────────────────────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Synthesizing portfolio-level summary...")

        portfolio_summary = await generate_portfolio_summary(results, llm)

        # ── Compute weighted-average sentiment ────────────────────────────
        overall_sentiment = sum(r.sentiment_score * r.weight for r in results)
        overall_sentiment = max(-1.0, min(1.0, overall_sentiment))

        # ── Sector concentration ──────────────────────────────────────────
        sector_concentration = calculate_sector_concentration(results)

        # ── Phase 5b: hedging suggestions (sequential — depends on all results) ──
        job_store.update_job(job_id, JobStatus.PROCESSING, "Generating hedging suggestions...")
        hedging_suggestions = await generate_hedging_suggestions(
            ticker_results=results,
            sector_concentration=sector_concentration,
            overall_sentiment=overall_sentiment,
        )

        response = PortfolioRiskResponse(
            results=results,
            portfolio_summary=portfolio_summary,
            overall_sentiment=round(overall_sentiment, 4),
            sector_concentration=sector_concentration,
            hedging_suggestions=hedging_suggestions,
        )

        # ── Phase 6: mark complete ────────────────────────────────────────
        job_store.update_job(
            job_id,
            JobStatus.COMPLETE,
            "Analysis complete.",
            results=response,
        )
        logger.info("Job %s complete — overall sentiment: %.3f", job_id, overall_sentiment)
        return response

    # ── Timeout + error guard ─────────────────────────────────────────────
    try:
        return await asyncio.wait_for(_inner(), timeout=float(_AGENT_TIMEOUT_SECONDS))

    except asyncio.TimeoutError:
        msg = "Analysis timed out. Please try again with fewer tickers."
        logger.error("Job %s timed out after %ds.", job_id, _AGENT_TIMEOUT_SECONDS)
        job_store.update_job(job_id, JobStatus.FAILED, "", error=msg)

    except Exception as exc:
        logger.error("Job %s agent failed: %s", job_id, exc, exc_info=True)
        job_store.update_job(job_id, JobStatus.FAILED, "", error=str(exc))
