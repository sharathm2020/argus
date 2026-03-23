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
from db.supabase_client import write_sentiment_history, save_analysis_history
from sentiment_analyzer import analyze_sentiment
from tools.dcf import calculate_dcf, fetch_risk_free_rate, compute_sensitivity_table
from tools.hedging import generate_hedging_suggestions, generate_options_hedge
from tools.portfolio_analysis import calculate_sector_concentration
from utils.asset_classifier import classify_ticker
from data.coingecko_client import get_crypto_data
from data.comps_client import calculate_comps

logger = logging.getLogger(__name__)

# Maximum wall-clock seconds allowed for the full LLM analysis phase
_AGENT_TIMEOUT_SECONDS = 180

# Model rotation thresholds and model IDs
SMALL_PORTFOLIO_THRESHOLD = 10   # use GPT-4o below or at this count
LARGE_PORTFOLIO_THRESHOLD = 20   # chunk above this count
MODEL_FULL = "gpt-4o"
MODEL_MINI = "gpt-4o-mini"


# ── LLM setup ────────────────────────────────────────────────────────────────

def _get_llm(temperature: float = 0.2, model: str = MODEL_FULL) -> ChatOpenAI:
    """Instantiate a ChatOpenAI LLM. API key is read from OPENAI_API_KEY env var."""
    return ChatOpenAI(
        model=model,
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
    model: str = MODEL_FULL,
    risk_free_rate: float = 0.043,
    user_id: str | None = None,
) -> TickerRiskResult:
    """
    Run the risk narrative LLM call for a single ticker.

    On LLM failure, returns a safe placeholder result so one bad ticker
    never aborts the entire job.
    """
    sector = stock_info.get("sector", "Unknown")
    market_cap = stock_info.get("market_cap")
    current_price: float | None = stock_info.get("current_price")

    # Classify asset type; for crypto, fetch CoinGecko data for market cap + price
    asset_type = classify_ticker(ticker, stock_info)
    if asset_type == "crypto":
        crypto_raw = await asyncio.to_thread(get_crypto_data, ticker)
        if crypto_raw.get("market_cap"):
            market_cap = crypto_raw["market_cap"]
        if crypto_raw.get("price"):
            current_price = crypto_raw["price"]

    prompt = build_ticker_prompt(
        ticker=ticker,
        weight=weight,
        sector=sector,
        market_cap=market_cap,
        news_headlines=news_headlines,
        risk_factors=risk_factors,
        asset_type=asset_type,
    )

    ticker_llm = _get_llm(temperature=0.2, model=model)
    chain = prompt | ticker_llm | json_output_parser

    # Run LLM + DCF concurrently for equities; skip DCF for crypto/ETF.
    # Comps runs after DCF so it can receive DCF-derived revenue_growth + current_price.
    if asset_type == "equity":
        llm_result, dcf_data = await asyncio.gather(
            chain.ainvoke({}),
            calculate_dcf(ticker, risk_free_rate=risk_free_rate),
            return_exceptions=True,
        )

        # ── Resolve DCF exception before comps so we can pass through data ──
        if isinstance(dcf_data, Exception):
            logger.warning("DCF calculation failed for %s: %s", ticker, dcf_data)
            dcf_data = {"available": False, "reason": "Calculation error"}

        # ── ARG-52: attach sensitivity table when DCF succeeded ──────────────
        if isinstance(dcf_data, dict) and dcf_data.get("available"):
            try:
                _inp = dcf_data.get("inputs", {})
                dcf_data["sensitivity_table"] = compute_sensitivity_table(
                    base_fcf=_inp["free_cash_flow"],
                    shares_outstanding=_inp["shares_outstanding"],
                    base_discount_rate=_inp["discount_rate"],
                    base_terminal_growth=_inp["terminal_growth_rate"],
                    base_revenue_growth=_inp["growth_rate"],
                    current_price=dcf_data["current_price"],
                )
            except Exception as exc:
                logger.warning("Sensitivity table failed for %s: %s", ticker, exc)
                dcf_data["sensitivity_table"] = None

        # ── ARG-50/51: pass DCF-derived data through to comps ────────────────
        _dcf_inputs = dcf_data.get("inputs", {}) if dcf_data.get("available") else {}
        try:
            comps_data = await calculate_comps(
                ticker,
                subject_price=dcf_data.get("current_price") if dcf_data.get("available") else None,
                revenue_growth=_dcf_inputs.get("revenue_growth"),
            )
        except Exception as exc:
            logger.warning("Comps failed for %s: %s", ticker, exc)
            comps_data = None
    else:
        llm_result = await chain.ainvoke({})
        reason = (
            "DCF analysis is not applicable to cryptocurrency assets."
            if asset_type == "crypto"
            else "DCF analysis is not applicable to ETF positions."
        )
        dcf_data = {"available": False, "reason": reason}
        comps_data = None

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

    # DCF exception is now resolved above for equities; handle the non-equity path
    if isinstance(dcf_data, Exception):
        logger.warning("DCF calculation failed for %s: %s", ticker, dcf_data)
        dcf_data = {"available": False, "reason": "Calculation error"}

    # ── Sentiment via DistilBERT (falls back to GPT-4o output on error) ───────
    sentiment_text = " ".join(news_headlines) if news_headlines else risk_factors[:512]
    confidence_score: float | None = None
    sentiment_label: str | None = None
    try:
        sentiment_result = analyze_sentiment(sentiment_text)
        label = sentiment_result["label"]
        sentiment_label = label
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

    # ── Persist sentiment to Supabase (non-blocking, never breaks analysis) ──
    try:
        await asyncio.to_thread(
            write_sentiment_history,
            ticker,
            sentiment_label,
            confidence_score,
            sentiment,
            user_id,
        )
    except Exception as exc:
        logger.warning("Supabase sentiment_history write failed for %s: %s", ticker, exc)

    # ── Options-based hedge recommendation ───────────────────────────────────
    # Refine current_price from DCF data if available (more accurate than FMP profile)
    if (
        asset_type == "equity"
        and isinstance(dcf_data, dict)
        and dcf_data.get("available")
        and dcf_data.get("current_price")
    ):
        current_price = dcf_data["current_price"]

    dcf_mos: float | None = None
    if isinstance(dcf_data, dict) and dcf_data.get("available"):
        dcf_mos = dcf_data.get("margin_of_safety")

    try:
        options_hedge = await generate_options_hedge(
            ticker=ticker,
            current_price=current_price,
            asset_type=asset_type,
            sentiment_label=sentiment_label,
            confidence=confidence_score,
            dcf_margin_of_safety=dcf_mos,
        )
    except Exception as exc:
        logger.warning("Options hedge failed for %s: %s", ticker, exc)
        options_hedge = None

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
        asset_type=asset_type,
        industry=stock_info.get("industry") or "",
        comps_data=comps_data,
        options_hedge=options_hedge,
    )


# ── Risk-based ticker selector for large portfolios ──────────────────────────

def select_top_risk_tickers(
    results: List[TickerRiskResult],
    n: int = 5,
) -> List[TickerRiskResult]:
    """
    Return the top *n* tickers ranked by a composite risk score.

    risk_score = abs(sentiment_score) * confidence
                 + (abs(dcf_margin_of_safety) / 100  if DCF available  else 0)

    Applies to all asset types. Used to cap the hedging prompt size
    for large portfolios and avoid GPT-4o output-limit truncation.
    """
    def _score(r: TickerRiskResult) -> float:
        confidence = r.confidence_score if r.confidence_score is not None else 0.0
        sentiment_component = abs(r.sentiment_score) * confidence
        dcf_component = 0.0
        if r.dcf_data and r.dcf_data.get("available"):
            mos = r.dcf_data.get("margin_of_safety")
            if mos is not None:
                dcf_component = abs(float(mos)) / 100
        return sentiment_component + dcf_component

    return sorted(results, key=_score, reverse=True)[:n]


# ── Portfolio summary ─────────────────────────────────────────────────────────

async def generate_portfolio_summary(
    results: List[TickerRiskResult],
    llm: ChatOpenAI,
    model: str = MODEL_FULL,
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
    summary_llm = _get_llm(temperature=0.2, model=model)
    chain = prompt | summary_llm | StrOutputParser()

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
    job_id: str,
    user_id: str | None = None,
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
        n_tickers = len(positions)

        # Determine routing strategy based on portfolio size
        if n_tickers <= SMALL_PORTFOLIO_THRESHOLD:
            strategy = "full"
        elif n_tickers <= LARGE_PORTFOLIO_THRESHOLD:
            strategy = "mini"
        else:
            strategy = "chunked"

        logger.info(
            "Job %s — portfolio size: %d tickers, using %s strategy",
            job_id, n_tickers, strategy,
        )

        # Fetch risk-free rate once; shared across all per-ticker DCF calls
        risk_free_rate = await fetch_risk_free_rate()
        logger.info("Job %s — risk-free rate: %.4f", job_id, risk_free_rate)

        # ── Phase 4: per-ticker LLM calls ────────────────────────────────
        completed = [0]

        async def _analyze_with_progress(ticker: str, weight: float, model: str) -> TickerRiskResult:
            result = await analyze_ticker(
                ticker=ticker,
                weight=weight,
                news_headlines=news_data.get(ticker, []),
                stock_info=stock_info.get(ticker, {}),
                risk_factors=risk_factors.get(ticker, ""),
                llm=_get_llm(model=model),
                model=model,
                risk_free_rate=risk_free_rate,
                user_id=user_id,
            )
            completed[0] += 1
            pct = 40 + int(completed[0] / n_tickers * 40)
            job_store.update_job_progress(
                job_id, pct,
                f"Analyzed {completed[0]}/{n_tickers} position{'s' if n_tickers != 1 else ''}..."
            )
            return result

        if strategy == "full":
            job_store.update_job(
                job_id, JobStatus.PROCESSING,
                f"Analyzing {n_tickers} positions with GPT-4o...",
                progress=40,
            )
            results: List[TickerRiskResult] = list(await asyncio.gather(*[
                _analyze_with_progress(ticker, weight, MODEL_FULL)
                for ticker, weight in positions
            ]))
            summary_model = MODEL_FULL

        elif strategy == "mini":
            job_store.update_job(
                job_id, JobStatus.PROCESSING,
                f"Analyzing {n_tickers} positions with optimized model routing...",
                progress=40,
            )
            results = list(await asyncio.gather(*[
                _analyze_with_progress(ticker, weight, MODEL_MINI)
                for ticker, weight in positions
            ]))
            summary_model = MODEL_FULL

        else:  # chunked
            job_store.update_job(
                job_id, JobStatus.PROCESSING,
                f"Analyzing {n_tickers} positions in parallel batches...",
                progress=40,
            )
            chunk_size = 10
            chunks = [
                positions[i: i + chunk_size]
                for i in range(0, n_tickers, chunk_size)
            ]
            chunk_results = await asyncio.gather(*[
                asyncio.gather(*[
                    _analyze_with_progress(ticker, weight, MODEL_MINI)
                    for ticker, weight in chunk
                ])
                for chunk in chunks
            ])
            # Flatten while preserving original ticker order
            results = [r for chunk in chunk_results for r in chunk]
            summary_model = MODEL_FULL

        # ── Phase 5: portfolio summary ────────────────────────────────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Synthesizing portfolio-level summary...", progress=82)

        portfolio_summary = await generate_portfolio_summary(
            results, llm=_get_llm(model=summary_model), model=summary_model
        )

        # ── Compute weighted-average sentiment ────────────────────────────
        overall_sentiment = sum(r.sentiment_score * r.weight for r in results)
        overall_sentiment = max(-1.0, min(1.0, overall_sentiment))

        # ── Sector concentration ──────────────────────────────────────────
        sector_concentration = calculate_sector_concentration(results)

        # ── Phase 5b: hedging suggestions (sequential — depends on all results) ──
        job_store.update_job(job_id, JobStatus.PROCESSING, "Generating hedging suggestions...", progress=90)
        if n_tickers > SMALL_PORTFOLIO_THRESHOLD:
            hedging_tickers = select_top_risk_tickers(results, n=5)
            logger.info(
                "Job %s — large portfolio: selecting top 5 risk tickers for hedging: %s",
                job_id,
                [r.ticker for r in hedging_tickers],
            )
        else:
            hedging_tickers = results
        hedging_suggestions = await generate_hedging_suggestions(
            ticker_results=hedging_tickers,
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

        # ── Save analysis history for authenticated users ──────────────────
        if user_id:
            try:
                if overall_sentiment > 0.2:
                    sentiment_label_str = "positive"
                elif overall_sentiment < -0.2:
                    sentiment_label_str = "negative"
                else:
                    sentiment_label_str = "neutral"
                await asyncio.to_thread(
                    save_analysis_history,
                    user_id,
                    [r.ticker for r in results],
                    round(overall_sentiment, 4),
                    sentiment_label_str,
                    response.model_dump(mode="json"),
                )
                logger.debug("Job %s — analysis history saved for user %s", job_id, user_id)
            except Exception as exc:
                logger.warning("Failed to save analysis history for job %s: %s", job_id, exc)

        # ── Phase 6: mark complete ────────────────────────────────────────
        job_store.update_job(
            job_id,
            JobStatus.COMPLETE,
            "Analysis complete.",
            results=response,
            progress=100,
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
