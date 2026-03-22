"""
Argus Portfolio Risk Copilot — FastAPI backend entry point.

Exposes:
  POST /api/analyze        — submit a portfolio for async analysis
  GET  /api/jobs/{job_id}  — poll the status / results of a submitted job
  GET  /health             — liveness check
"""

import asyncio
import base64
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List as _List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from openai import AsyncOpenAI
from pydantic import BaseModel

# Load environment variables before importing any module that reads them
load_dotenv()

from agent import run_portfolio_analysis
from job_store import JobResult, JobStatus, job_store
from models.schemas import PortfolioRequest
from db.supabase_client import (
    query_sentiment_history,
    save_portfolio,
    get_saved_portfolios,
    delete_portfolio,
    get_analysis_history,
    get_analysis_detail,
)
from tools.edgar import clean_risk_factors_batch, fetch_risk_factors_batch
from tools.news import fetch_news_batch, fetch_stock_info_batch
from tools.portfolio import parse_portfolio


# ── Request/response models ────────────────────────────────────────────────────

class SavePortfolioRequest(BaseModel):
    name: str
    tickers: _List[str]
    weights: Optional[Dict[str, float]] = None

# ── JWT helper ────────────────────────────────────────────────────────────────

def _extract_user_id(request: Request) -> Optional[str]:
    """
    Best-effort extraction of the Supabase user_id (sub claim) from an
    Authorization: Bearer <token> header.

    Decodes without signature verification — we trust Supabase issued the
    token; we only need the sub claim to tag Supabase rows with the caller.
    Returns None on any failure (missing header, malformed token, etc.).
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        import jwt  # PyJWT
        # algorithms must be specified in PyJWT 2.x even when skipping verification.
        # verify_exp=False avoids failures on slightly-expired tokens.
        payload = jwt.decode(
            token,
            algorithms=["HS256", "RS256"],
            options={"verify_signature": False, "verify_exp": False},
        )
        user_id = payload.get("sub") or None
        logger.debug("JWT extracted user_id=%s", user_id)
        return user_id
    except Exception as exc:
        logger.warning("JWT decode failed — user_id will not be recorded: %s", exc)
        return None


# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("argus.main")


# ── CORS origins ──────────────────────────────────────────────────────────────

def _build_allowed_origins() -> list[str]:
    """
    Always allow the Vite dev server. Append the production frontend URL
    when FRONTEND_URL is set (e.g. your Railway frontend domain).
    """
    origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    frontend_url = os.environ.get("FRONTEND_URL", "").strip()
    if frontend_url:
        origins.append(frontend_url)
        logger.info("CORS: added production origin %s", frontend_url)
    return origins


# ── App factory ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Argus backend starting up…")

    from sentiment_analyzer import preload_model
    await asyncio.to_thread(preload_model)
    logger.info("Sentiment model preloaded and ready.")

    # Background task: purge expired jobs every 10 minutes
    async def _cleanup_loop() -> None:
        while True:
            await asyncio.sleep(600)
            job_store.cleanup_expired()

    cleanup_task = asyncio.create_task(_cleanup_loop())

    yield

    cleanup_task.cancel()
    logger.info("Argus backend shutting down.")


app = FastAPI(
    title="Argus Portfolio Risk Copilot",
    description="AI-powered portfolio risk analysis using SEC filings and live news.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return consistent JSON for any unhandled 500 — never expose an HTML error page."""
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected error occurred.", "detail": str(exc)},
    )


# ── Background analysis pipeline ─────────────────────────────────────────────

async def _run_analysis_background(job_id: str, request: PortfolioRequest, user_id: Optional[str] = None) -> None:
    """
    Full data-fetch + LLM analysis pipeline, run as a FastAPI BackgroundTask.

    Status messages are pushed to job_store at each major phase so the
    frontend's polling loop can display real-time progress.
    """
    try:
        positions = parse_portfolio(request)
        tickers = [ticker for ticker, _ in positions]
        logger.info("Job %s — tickers: %s", job_id, tickers)

        # ── Phase 1: news + stock fundamentals (run in parallel) ────────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Fetching latest news and headlines...")

        news_data, stock_info = await asyncio.gather(
            asyncio.to_thread(fetch_news_batch, tickers),
            asyncio.to_thread(fetch_stock_info_batch, tickers),
        )

        # ── Phase 2: SEC EDGAR 10-K filings ─────────────────────────────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Downloading SEC 10-K filings from EDGAR...")

        risk_factors = await asyncio.to_thread(fetch_risk_factors_batch, tickers)
        risk_factors = await clean_risk_factors_batch(risk_factors)

        # ── Phase 3: signal extraction complete — hand off to agent ─────────
        job_store.update_job(job_id, JobStatus.PROCESSING, "Extracting risk factors from filings...")

        logger.info(
            "Job %s — data ready: %d headlines, %d filings",
            job_id,
            sum(len(v) for v in news_data.values()),
            sum(1 for v in risk_factors.values() if "unavailable" not in v.lower()),
        )

        # ── Phases 4-6: LLM analysis (agent manages its own status updates) ─
        await run_portfolio_analysis(
            positions=positions,
            news_data=news_data,
            stock_info=stock_info,
            risk_factors=risk_factors,
            job_id=job_id,
            user_id=user_id,
        )

    except Exception as exc:
        logger.exception("Job %s pipeline error: %s", job_id, exc)
        job_store.update_job(
            job_id,
            JobStatus.FAILED,
            "",
            error=str(exc),
        )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"])
async def health_check():
    """Liveness probe — returns 200 when the server is running."""
    return {"status": "ok"}


@app.post(
    "/api/analyze",
    tags=["analysis"],
    summary="Submit a portfolio for async risk analysis",
    response_description="Job ID and initial status",
)
async def analyze_portfolio(
    request: PortfolioRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
):
    """
    Validate the portfolio, create a job, and immediately return a job_id.
    The analysis runs asynchronously — poll GET /api/jobs/{job_id} for results.
    """
    # Validate early so the client gets a 422 synchronously, not via polling
    try:
        parse_portfolio(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Best-effort: extract Supabase user_id to tag sentiment_history rows
    user_id = _extract_user_id(http_request)

    job_id = uuid.uuid4().hex
    job_store.create_job(job_id)

    background_tasks.add_task(_run_analysis_background, job_id, request, user_id)

    logger.info("Job %s created and queued (user_id=%s).", job_id, user_id or "anonymous")
    return {"job_id": job_id, "status": "pending"}


@app.get(
    "/api/jobs/{job_id}",
    response_model=JobResult,
    tags=["analysis"],
    summary="Poll the status and results of a submitted job",
)
async def get_job(job_id: str) -> JobResult:
    """
    Return the current state of a job.
    Returns 404 if the job was never created or has expired (older than 30 min).
    """
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return job


@app.get(
    "/api/sentiment-history/{ticker}",
    tags=["analysis"],
    summary="Retrieve historical sentiment scores for a ticker",
)
async def get_sentiment_history(ticker: str):
    """
    Return the 90 most recent sentiment_history rows for the given ticker,
    ordered newest first.
    """
    ticker_upper = ticker.upper().strip()
    try:
        rows = await asyncio.to_thread(query_sentiment_history, ticker_upper, 90)
    except Exception as exc:
        logger.error("sentiment_history query failed for %s: %s", ticker_upper, exc)
        raise HTTPException(status_code=503, detail="Sentiment history temporarily unavailable.")
    return {"ticker": ticker_upper, "history": rows}


# ── Saved portfolios ───────────────────────────────────────────────────────────

@app.post("/api/portfolios", tags=["portfolios"], summary="Save a portfolio")
async def create_portfolio(request: SavePortfolioRequest, http_request: Request):
    user_id = _extract_user_id(http_request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        portfolio = await asyncio.to_thread(
            save_portfolio, user_id, request.name, request.tickers, request.weights
        )
        return portfolio
    except Exception as exc:
        logger.error("Failed to save portfolio for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to save portfolio.")


@app.get("/api/portfolios", tags=["portfolios"], summary="List saved portfolios")
async def list_portfolios(http_request: Request):
    user_id = _extract_user_id(http_request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        portfolios = await asyncio.to_thread(get_saved_portfolios, user_id)
        return {"portfolios": portfolios}
    except Exception as exc:
        logger.error("Failed to fetch portfolios for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch portfolios.")


@app.delete(
    "/api/portfolios/{portfolio_id}",
    tags=["portfolios"],
    summary="Delete a saved portfolio",
    status_code=204,
)
async def remove_portfolio(portfolio_id: str, http_request: Request):
    user_id = _extract_user_id(http_request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        await asyncio.to_thread(delete_portfolio, portfolio_id, user_id)
    except Exception as exc:
        logger.error("Failed to delete portfolio %s: %s", portfolio_id, exc)
        raise HTTPException(status_code=500, detail="Failed to delete portfolio.")
    return Response(status_code=204)


# ── Analysis history ───────────────────────────────────────────────────────────

@app.get("/api/history", tags=["history"], summary="List analysis history")
async def list_analysis_history(http_request: Request):
    user_id = _extract_user_id(http_request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        history = await asyncio.to_thread(get_analysis_history, user_id)
        return {"history": history}
    except Exception as exc:
        logger.error("Failed to fetch analysis history for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch analysis history.")


@app.get("/api/history/{analysis_id}", tags=["history"], summary="Get analysis detail with snapshot")
async def get_analysis(analysis_id: str, http_request: Request):
    user_id = _extract_user_id(http_request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        detail = await asyncio.to_thread(get_analysis_detail, analysis_id, user_id)
    except Exception as exc:
        logger.error("Failed to fetch analysis %s: %s", analysis_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch analysis.")
    if detail is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return detail


_PARSE_IMAGE_SYSTEM_PROMPT = (
    "You are a financial data parser. The user will provide a screenshot of their "
    "brokerage portfolio. Extract all stock/ETF/crypto tickers and their current dollar "
    "values. Return ONLY a JSON array like: "
    '[{"ticker": "AAPL", "value": 1500.00}, {"ticker": "GOOGL", "value": 800.00}] '
    "Do not include any explanation or markdown. Only return the raw JSON array."
)


async def _parse_single_image(file: UploadFile, client: AsyncOpenAI) -> list[dict]:
    """
    Send one image to GPT-4o Vision and return its raw parsed holdings list.
    Returns an empty list if the image cannot be parsed (so other images still succeed).
    """
    if file.content_type not in ("image/jpeg", "image/png"):
        logger.warning("Skipping unsupported file type: %s", file.content_type)
        return []

    image_bytes = await file.read()
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime = file.content_type

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _PARSE_IMAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_image}",
                                "detail": "high",
                            },
                        }
                    ],
                },
            ],
            max_tokens=1024,
            temperature=0,
        )
    except Exception as exc:
        logger.error("GPT-4o Vision call failed for %s: %s", file.filename, exc)
        return []

    raw_text = response.choices[0].message.content or ""

    # Strip markdown code fences if GPT-4o wraps the response
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        parsed: list[dict] = json.loads(raw_text)
        if not isinstance(parsed, list):
            raise ValueError("Response is not a JSON array")
        validated = []
        for item in parsed:
            if "ticker" not in item or "value" not in item:
                continue
            float(item["value"])  # skip non-numeric values
            validated.append(item)
        return validated
    except Exception as exc:
        logger.warning("Unparseable GPT-4o response for %s: %s — raw: %s", file.filename, exc, raw_text[:200])
        return []


@app.post(
    "/api/parse-portfolio-image",
    tags=["analysis"],
    summary="Parse one or more brokerage portfolio screenshots using GPT-4o Vision",
)
async def parse_portfolio_image(files: _List[UploadFile] = File(...)):
    """
    Accept one or more JPEG/PNG screenshots, extract tickers and values via GPT-4o
    Vision (one call per image, run concurrently), deduplicate by ticker (taking the
    MAX value seen across images for each ticker), then return normalised holdings
    with percentage weights. Images are processed entirely in memory — never written
    to disk.
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files uploaded.")

    client = AsyncOpenAI()  # reads OPENAI_API_KEY from env

    # Run all Vision calls concurrently
    results_per_image: list[list[dict]] = await asyncio.gather(
        *[_parse_single_image(f, client) for f in files]
    )

    # Flatten all holdings from all images
    all_holdings: list[dict] = [item for batch in results_per_image for item in batch]

    if not all_holdings:
        raise HTTPException(
            status_code=422,
            detail="Could not extract portfolio from image. Please try manual entry.",
        )

    # Deduplicate by ticker: keep MAX value seen (same holding across multiple screenshots)
    deduped: dict[str, float] = {}
    for item in all_holdings:
        key = item["ticker"].strip().upper()
        value = float(item["value"])
        deduped[key] = max(deduped.get(key, 0.0), value)

    total_value = sum(deduped.values())
    if total_value <= 0:
        raise HTTPException(
            status_code=422,
            detail="Could not extract portfolio from image. Please try manual entry.",
        )

    holdings = [
        {
            "ticker": ticker,
            "weight": round(value / total_value * 100, 4),
        }
        for ticker, value in deduped.items()
    ]

    logger.info(
        "parse-portfolio-image: %d image(s) → %d deduplicated holdings, total_value=%.2f",
        len(files),
        len(holdings),
        total_value,
    )
    return {"holdings": holdings, "total_value": round(total_value, 2)}
