"""
Argus Portfolio Risk Copilot — FastAPI backend entry point.

Exposes:
  POST /api/analyze        — submit a portfolio for async analysis
  GET  /api/jobs/{job_id}  — poll the status / results of a submitted job
  GET  /health             — liveness check
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables before importing any module that reads them
load_dotenv()

from agent import run_portfolio_analysis
from job_store import JobResult, JobStatus, job_store
from models.schemas import PortfolioRequest
from tools.edgar import fetch_risk_factors_batch
from tools.news import fetch_news_batch, fetch_stock_info_batch
from tools.portfolio import parse_portfolio

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

async def _run_analysis_background(job_id: str, request: PortfolioRequest) -> None:
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

    job_id = uuid.uuid4().hex
    job_store.create_job(job_id)

    background_tasks.add_task(_run_analysis_background, job_id, request)

    logger.info("Job %s created and queued.", job_id)
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
