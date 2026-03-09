"""
Argus Portfolio Risk Copilot — FastAPI backend entry point.

Exposes:
  POST /api/analyze  — full portfolio risk analysis
  GET  /health       — liveness check
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables before importing any module that reads them
load_dotenv()

from agent import run_portfolio_analysis
from models.schemas import PortfolioRequest, PortfolioRiskResponse
from tools.edgar import fetch_risk_factors_batch
from tools.news import fetch_news_batch, fetch_stock_info_batch
from tools.portfolio import parse_portfolio

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("argus.main")


# ── App factory ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Argus backend starting up…")
    yield
    logger.info("Argus backend shutting down.")


app = FastAPI(
    title="Argus Portfolio Risk Copilot",
    description="AI-powered portfolio risk analysis using SEC filings and live news.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow requests from the Vite dev server (and same origin in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"])
async def health_check():
    """Liveness probe — returns 200 when the server is running."""
    return {"status": "ok"}


@app.post(
    "/api/analyze",
    response_model=PortfolioRiskResponse,
    tags=["analysis"],
    summary="Analyze portfolio risk",
)
async def analyze_portfolio(request: PortfolioRequest) -> PortfolioRiskResponse:
    """
    Accept a portfolio of tickers + weights and return a comprehensive risk analysis.

    Steps:
    1. Parse and validate the portfolio.
    2. Fetch news (Alpaca) and stock info (yfinance) + 10-K risk factors (EDGAR) in parallel.
    3. Pass all pre-fetched data to the LangChain agent for LLM analysis.
    4. Return structured PortfolioRiskResponse.
    """
    # Step 1 — validate and parse
    try:
        positions = parse_portfolio(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    tickers = [ticker for ticker, _ in positions]
    logger.info("Analyzing portfolio: %s", tickers)

    # Step 2 — fetch external data in parallel
    #   news_batch and edgar_batch can be slow (network I/O); run concurrently
    #   yfinance is synchronous so we run it in a thread pool via asyncio.to_thread
    try:
        news_task = asyncio.to_thread(fetch_news_batch, tickers)
        stock_info_task = asyncio.to_thread(fetch_stock_info_batch, tickers)
        edgar_task = asyncio.to_thread(fetch_risk_factors_batch, tickers)

        news_data, stock_info, risk_factors = await asyncio.gather(
            news_task, stock_info_task, edgar_task
        )
    except Exception as exc:
        logger.exception("Data fetching failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to retrieve external data: {exc}",
        ) from exc

    logger.info(
        "Data fetched — news: %s headlines total, EDGAR: %s filings",
        sum(len(v) for v in news_data.values()),
        sum(1 for v in risk_factors.values() if "unavailable" not in v.lower()),
    )

    # Step 3 — run agent
    try:
        response = await run_portfolio_analysis(
            positions=positions,
            news_data=news_data,
            stock_info=stock_info,
            risk_factors=risk_factors,
        )
    except Exception as exc:
        logger.exception("Agent analysis failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Risk analysis failed: {exc}",
        ) from exc

    logger.info("Analysis complete — overall sentiment: %.3f", response.overall_sentiment)
    return response
