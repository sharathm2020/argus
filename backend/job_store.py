"""
In-memory job store for async portfolio analysis jobs.

Jobs are created immediately when a request arrives, updated throughout
the pipeline as status progresses, and polled by the frontend.
"""

import time
import logging
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from models.schemas import PortfolioRiskResponse

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

# Easily adjustable — jobs older than this many seconds are purged from memory
JOB_EXPIRY_SECONDS = 1800  # 30 minutes


# ── Job status enum ───────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    COMPLETE   = "complete"
    FAILED     = "failed"


# ── Job result model ──────────────────────────────────────────────────────────

class JobResult(BaseModel):
    """Full state of a single analysis job. Returned verbatim by GET /api/jobs/{job_id}."""
    job_id: str
    status: JobStatus
    # Human-readable description of the current step (empty string when pending)
    status_message: str = ""
    # 0–100 integer progress for the loading screen
    progress: int = 0
    # Populated only when status == COMPLETE
    results: Optional[PortfolioRiskResponse] = None
    # Populated only when status == FAILED
    error: Optional[str] = None
    # Unix timestamp — used by cleanup_expired()
    created_at: float = Field(default_factory=time.time)


# ── Job store class ───────────────────────────────────────────────────────────

class JobStore:
    """
    Thread-safe-enough in-memory store.
    All callers run in the same asyncio event loop, so a plain dict is fine.
    """

    def __init__(self) -> None:
        self._store: dict[str, JobResult] = {}

    def create_job(self, job_id: str) -> JobResult:
        """Create a new PENDING job and persist it in the store."""
        job = JobResult(job_id=job_id, status=JobStatus.PENDING)
        self._store[job_id] = job
        logger.debug("Job %s created.", job_id)
        return job

    def update_job(
        self,
        job_id: str,
        status: JobStatus,
        status_message: str,
        results: Optional[PortfolioRiskResponse] = None,
        error: Optional[str] = None,
        progress: Optional[int] = None,
    ) -> None:
        """Update an existing job in place. No-op if job_id is unknown."""
        job = self._store.get(job_id)
        if job is None:
            logger.warning("update_job called for unknown job_id: %s", job_id)
            return
        job.status = status
        job.status_message = status_message
        if results is not None:
            job.results = results
        if error is not None:
            job.error = error
        if progress is not None:
            job.progress = progress
        logger.debug("Job %s → %s | %s", job_id, status, status_message)

    def update_job_progress(self, job_id: str, progress: int, status_message: str) -> None:
        """Lightweight helper — update progress and status_message without changing status."""
        job = self._store.get(job_id)
        if job is None:
            return
        job.progress = progress
        job.status_message = status_message

    def get_job(self, job_id: str) -> Optional[JobResult]:
        """Return the job or None if not found / already expired."""
        return self._store.get(job_id)

    def cleanup_expired(self) -> None:
        """Remove jobs that are older than JOB_EXPIRY_SECONDS."""
        cutoff = time.time() - JOB_EXPIRY_SECONDS
        expired = [jid for jid, job in self._store.items() if job.created_at < cutoff]
        for jid in expired:
            del self._store[jid]
        if expired:
            logger.info("Cleaned up %d expired jobs.", len(expired))


# ── Module-level singleton ────────────────────────────────────────────────────

# Import this anywhere: from job_store import job_store
job_store = JobStore()
