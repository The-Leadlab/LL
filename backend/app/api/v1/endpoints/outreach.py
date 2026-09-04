"""
Internal outreach worker tick + job status APIs.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.models.outreach_job import OutreachJob
from app.models.user import User
from app.services.outreach_runner import OutreachRunner

router = APIRouter()


def _assert_worker_secret(x_outreach_worker_secret: Optional[str]) -> None:
    expected = getattr(settings, "OUTREACH_WORKER_SECRET", None)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OUTREACH_WORKER_SECRET is not configured",
        )
    if not x_outreach_worker_secret or x_outreach_worker_secret != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker secret")


@router.post("/worker/tick")
def outreach_worker_tick(
    db: Session = Depends(deps.get_db),
    x_outreach_worker_secret: Optional[str] = Header(None, alias="X-Outreach-Worker-Secret"),
    limit: int = Query(25, ge=1, le=100),
) -> Dict[str, Any]:
    """
    Process due outreach jobs and sequence steps.
    Call from Render Cron every 1–5 minutes with the shared secret header.
    """
    _assert_worker_secret(x_outreach_worker_secret)
    batch = getattr(settings, "OUTREACH_WORKER_BATCH_SIZE", 25) or 25
    runner = OutreachRunner(db)
    return runner.tick(limit=min(limit, batch))


@router.get("/jobs")
def list_outreach_jobs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    batch_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Dict[str, Any]:
    """List queued/sent outreach jobs for the current organization."""
    q = db.query(OutreachJob).filter(OutreachJob.organization_id == current_user.organization_id)
    if batch_id:
        q = q.filter(OutreachJob.batch_id == batch_id)
    if status_filter:
        q = q.filter(OutreachJob.status == status_filter)
    total = q.count()
    rows: List[OutreachJob] = (
        q.order_by(OutreachJob.scheduled_at.desc()).offset(skip).limit(limit).all()
    )
    return {
        "total": total,
        "items": [
            {
                "id": job.id,
                "batch_id": job.batch_id,
                "lead_id": job.lead_id,
                "account_id": job.account_id,
                "status": job.status,
                "scheduled_at": job.scheduled_at.isoformat() if job.scheduled_at else None,
                "sent_at": job.sent_at.isoformat() if job.sent_at else None,
                "last_error": job.last_error,
                "subject": job.subject[:120] if job.subject else None,
            }
            for job in rows
        ],
    }


@router.post("/jobs/{batch_id}/cancel")
def cancel_outreach_batch(
    batch_id: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Cancel pending/deferred jobs in a batch."""
    jobs = (
        db.query(OutreachJob)
        .filter(
            OutreachJob.organization_id == current_user.organization_id,
            OutreachJob.batch_id == batch_id,
            OutreachJob.status.in_(["pending", "deferred"]),
        )
        .all()
    )
    for job in jobs:
        job.status = "cancelled"
        db.add(job)
    db.commit()
    return {"cancelled": len(jobs), "batch_id": batch_id}
