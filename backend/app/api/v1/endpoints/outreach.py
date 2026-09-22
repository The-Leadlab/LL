"""
Outreach platform APIs: worker, jobs, connections, scenarios, runs, templates, AI, webhooks.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.core.config import settings
from app.core.security import encrypt_password, decrypt_password
from app.models.email_account import EmailAccount
from app.models.lead import Lead
from app.models.lead_stage import LeadStage
from app.models.outreach_job import OutreachJob
from app.models.outreach_platform import (
    OutreachConnection,
    OutreachRun,
    OutreachRunStep,
    OutreachScenario,
    OutreachTemplate,
)
from app.models.user import User
from app.services.free_ai_service import free_ai_service
from app.services.google_workspace import (
    account_can_write_sheets,
    account_has_sheets_scope,
    column_field_map,
    column_index_to_letter,
    ensure_sheets_connection,
    get_user_google_access_token,
    google_oauth_account,
    is_sent_status,
    list_drive_spreadsheets,
    mapped_lead_from_row,
    normalize_header_name,
    parse_pasted_lead_rows,
    parse_spreadsheet_id,
    preview_mapped_rows,
    range_start_row,
    sheet_title_from_range,
)
from app.services.outreach_runner import OutreachRunner

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------- schemas ----------

class ConnectionCreate(BaseModel):
    type: str
    display_name: str
    config: Optional[Dict[str, Any]] = None
    access_token: Optional[str] = None


class ConnectionUpdate(BaseModel):
    display_name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    access_token: Optional[str] = None
    status: Optional[str] = None


class SheetsImportBody(BaseModel):
    spreadsheet_id: str = ""
    range: str = "Sheet1!A1:Z500"
    header_row: int = 1
    mapping: Optional[Dict[str, str]] = None
    pasted_values: Optional[str] = None
    client_id: Optional[int] = None


class LeadsFromTextBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=500_000)
    source: str = "outreach_paste"
    header_row: int = 1
    mapping: Optional[Dict[str, str]] = None
    client_id: Optional[int] = None


class LeadRowsPreviewBody(BaseModel):
    text: Optional[str] = Field(None, max_length=500_000)
    spreadsheet_id: str = ""
    range: str = "Sheet1!A1:Z500"
    header_row: int = 1
    mapping: Optional[Dict[str, str]] = None


class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "draft"
    flow_definition: Optional[Dict[str, Any]] = None
    schedule_config: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    flow_definition: Optional[Dict[str, Any]] = None
    schedule_config: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None


class RunScenarioBody(BaseModel):
    lead_ids: List[int] = Field(..., min_length=1, max_length=100)
    account_id: Optional[int] = None


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str
    format: str = "text"
    ab_subjects: Optional[List[str]] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    format: Optional[str] = None
    ab_subjects: Optional[List[str]] = None


class RewriteBody(BaseModel):
    subject: str
    body: str
    instruction: str
    lead: Optional[Dict[str, Any]] = None


# ---------- helpers ----------

def _assert_worker_secret(x_outreach_worker_secret: Optional[str]) -> None:
    expected = getattr(settings, "OUTREACH_WORKER_SECRET", None)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OUTREACH_WORKER_SECRET is not configured",
        )
    if not x_outreach_worker_secret or x_outreach_worker_secret != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker secret")


def _conn_out(c: OutreachConnection) -> Dict[str, Any]:
    return {
        "id": c.id,
        "organization_id": c.organization_id,
        "user_id": c.user_id,
        "type": c.type,
        "display_name": c.display_name,
        "config": c.config,
        "status": c.status,
        "last_error": c.last_error,
        "public_token": c.public_token,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        # never expose encrypted_credentials
    }


def _scenario_out(s: OutreachScenario) -> Dict[str, Any]:
    return {
        "id": s.id,
        "organization_id": s.organization_id,
        "name": s.name,
        "description": s.description,
        "status": s.status,
        "flow_definition": s.flow_definition or {"modules": []},
        "schedule_config": s.schedule_config,
        "settings": s.settings,
        "created_by_id": s.created_by_id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _run_out(r: OutreachRun, include_steps: bool = False) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "id": r.id,
        "scenario_id": r.scenario_id,
        "organization_id": r.organization_id,
        "trigger_type": r.trigger_type,
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "stats": r.stats,
        "created_by_id": r.created_by_id,
    }
    if r.scenario:
        data["scenario"] = {"id": r.scenario.id, "name": r.scenario.name, "status": r.scenario.status}
    if include_steps:
        data["steps"] = [
            {
                "id": st.id,
                "run_id": st.run_id,
                "node_id": st.node_id,
                "lead_id": st.lead_id,
                "status": st.status,
                "scheduled_at": st.scheduled_at.isoformat() if st.scheduled_at else None,
                "executed_at": st.executed_at.isoformat() if st.executed_at else None,
                "input": st.input,
                "output": st.output,
                "error": st.error,
                "created_at": st.created_at.isoformat() if st.created_at else None,
            }
            for st in (r.steps or [])
        ]
    return data


def _template_out(t: OutreachTemplate) -> Dict[str, Any]:
    return {
        "id": t.id,
        "organization_id": t.organization_id,
        "name": t.name,
        "subject": t.subject,
        "body": t.body,
        "format": t.format,
        "ab_subjects": t.ab_subjects,
        "created_by_id": t.created_by_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _org_connection(db: Session, connection_id: int, org_id: int) -> OutreachConnection:
    conn = (
        db.query(OutreachConnection)
        .filter(OutreachConnection.id == connection_id, OutreachConnection.organization_id == org_id)
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


def _google_status_payload(db: Session, current_user: User) -> Dict[str, Any]:
    account = google_oauth_account(db, current_user)
    conn = (
        db.query(OutreachConnection)
        .filter(
            OutreachConnection.organization_id == current_user.organization_id,
            OutreachConnection.user_id == current_user.id,
            OutreachConnection.type == "google_sheets",
        )
        .order_by(OutreachConnection.id.desc())
        .first()
    )
    return {
        "connected": bool(account and account.oauth_refresh_token),
        "has_sheets_scope": account_has_sheets_scope(account),
        "can_write_sheets": account_can_write_sheets(account),
        "email": account.email if account else None,
        "connection_id": conn.id if conn else None,
        "spreadsheet_id": (conn.config or {}).get("spreadsheet_id") if conn else None,
    }


def _resolve_import_client_id(
    db: Session,
    current_user: User,
    client_id: Optional[int],
) -> Optional[int]:
    if not client_id:
        return None
    from app.crud.crud_client import client as crud_client

    resolved = crud_client.get_for_org(
        db, id=client_id, organization_id=current_user.organization_id
    )
    if not resolved or getattr(resolved, "is_archived", False):
        raise HTTPException(status_code=400, detail="Invalid or archived client")
    return resolved.id


def _fetch_google_sheet_rows(
    db: Session,
    current_user: User,
    spreadsheet_id: str,
    range_name: str,
    connection: Optional[OutreachConnection] = None,
) -> List[List[str]]:
    sheet_id = parse_spreadsheet_id(spreadsheet_id)
    if not sheet_id or sheet_id.lower() == "pasted":
        raise HTTPException(status_code=400, detail="Choose a spreadsheet or paste a Google Sheets URL.")
    token = None
    try:
        token = get_user_google_access_token(db, current_user)
    except ValueError:
        token = None
    if not token and connection and connection.encrypted_credentials:
        try:
            token = decrypt_password(connection.encrypted_credentials)
        except Exception:
            token = None
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Connect Google Sheets first, then import.",
        )
    try:
        url = (
            f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/"
            f"{quote(range_name or 'Sheet1!A1:Z500', safe='')}"
        )
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if resp.status_code in {401, 403}:
        if connection:
            connection.last_error = (resp.text or "")[:500]
            db.add(connection)
            db.commit()
        raise HTTPException(
            status_code=400,
            detail=(
                "Google refused Sheets access. Click Connect Google Sheets once to grant "
                "spreadsheet permission, then try again."
            ),
        )
    if resp.status_code != 200:
        if connection:
            connection.last_error = (resp.text or "")[:500]
            db.add(connection)
            db.commit()
        raise HTTPException(status_code=502, detail=f"Sheets API error: {resp.status_code}")
    values = resp.json().get("values") or []
    return [[str(cell) for cell in row] for row in values]


def _import_lead_rows(
    db: Session,
    current_user: User,
    rows: List[List[str]],
    *,
    header_row: int = 1,
    mapping: Optional[Dict[str, str]] = None,
    source: str = "google_sheets",
    commit: bool = True,
    client_id: Optional[int] = None,
    sheet_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not rows:
        return {"imported": 0, "skipped": 0, "updated": 0, "lead_ids": []}

    header_idx = max(0, (header_row or 1) - 1)
    if header_idx >= len(rows):
        return {"imported": 0, "skipped": 0, "updated": 0, "lead_ids": []}
    raw_headers = [(cell or "").strip() for cell in rows[header_idx]]
    normalized_headers = [normalize_header_name(header) for header in raw_headers]
    col_to_field = column_field_map(raw_headers, mapping) or column_field_map(normalized_headers, mapping)
    if not col_to_field or "email" not in col_to_field.values():
        raise HTTPException(
            status_code=400,
            detail="Could not find an email column. Include a header named email, or paste one address per line.",
        )

    resolved_client_id = _resolve_import_client_id(db, current_user, client_id)

    stage = (
        db.query(LeadStage)
        .filter(LeadStage.organization_id == current_user.organization_id)
        .order_by(LeadStage.id.asc())
        .first()
    )
    if not stage:
        raise HTTPException(status_code=400, detail="No lead stage configured for organization")

    imported = 0
    skipped = 0
    updated = 0
    created_ids: List[int] = []
    ready_ids: List[int] = []
    already_sent = 0
    status_col_idx = next((idx for idx, field in col_to_field.items() if field == "status"), None)
    status_column = column_index_to_letter(status_col_idx) if status_col_idx is not None else None
    sheet_title = ""
    spreadsheet_id = ""
    start_row = 1
    if sheet_context:
        sheet_title = str(sheet_context.get("sheet_title") or sheet_title_from_range(str(sheet_context.get("range") or "")))
        spreadsheet_id = parse_spreadsheet_id(str(sheet_context.get("spreadsheet_id") or ""))
        start_row = int(sheet_context.get("start_row") or range_start_row(str(sheet_context.get("range") or "")))

    fill_fields = (
        "first_name",
        "last_name",
        "company",
        "job_title",
        "unique_lead_id",
        "telephone",
        "mobile",
        "linkedin",
        "location",
    )
    for offset, row in enumerate(rows[header_idx + 1 :]):
        data = mapped_lead_from_row(row, col_to_field)
        email = (data.get("email") or "").strip()
        if not email or "@" not in email:
            skipped += 1
            continue
        sheet_row_number = start_row + header_idx + 1 + offset
        outreach_meta = None
        if spreadsheet_id:
            outreach_meta = {
                "spreadsheet_id": spreadsheet_id,
                "sheet_title": sheet_title,
                "row": sheet_row_number,
                "status_column": status_column,
                "status": (data.get("status") or "").strip(),
            }
        elif data.get("status"):
            outreach_meta = {"status": (data.get("status") or "").strip()}
        existing = (
            db.query(Lead)
            .filter(
                Lead.organization_id == current_user.organization_id,
                Lead.email == email,
                Lead.is_deleted.is_(False),
            )
            .first()
        )
        if existing:
            changed = False
            for field in fill_fields:
                incoming = (data.get(field) or "").strip()
                if incoming and not (getattr(existing, field, None) or "").strip():
                    setattr(existing, field, incoming[:255] if field != "linkedin" else incoming[:500])
                    changed = True
            if resolved_client_id and not existing.client_id:
                existing.client_id = resolved_client_id
                changed = True
            if outreach_meta:
                existing.outreach_meta = outreach_meta
                changed = True
            if changed:
                db.add(existing)
                updated += 1
            else:
                skipped += 1
            created_ids.append(existing.id)
            if not is_sent_status((outreach_meta or {}).get("status") or ""):
                ready_ids.append(existing.id)
            else:
                already_sent += 1
            continue
        lead = Lead(
            first_name=data.get("first_name") or None,
            last_name=data.get("last_name") or None,
            email=email,
            company=data.get("company") or None,
            job_title=data.get("job_title") or None,
            unique_lead_id=data.get("unique_lead_id") or None,
            telephone=data.get("telephone") or None,
            mobile=data.get("mobile") or None,
            linkedin=data.get("linkedin") or None,
            location=data.get("location") or None,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            stage_id=stage.id,
            created_by=current_user.id,
            created_at=datetime.utcnow(),
            source=(source or "outreach_paste")[:100],
            is_deleted=False,
            client_id=resolved_client_id,
            outreach_meta=outreach_meta,
        )
        db.add(lead)
        db.flush()
        created_ids.append(lead.id)
        imported += 1
        if not is_sent_status((outreach_meta or {}).get("status") or ""):
            ready_ids.append(lead.id)
        else:
            already_sent += 1

    if commit:
        db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "updated": updated,
        "lead_ids": created_ids,
        "ready_ids": ready_ids,
        "already_sent": already_sent,
    }


# ---------- worker / jobs ----------

@router.post("/worker/tick")
def outreach_worker_tick(
    db: Session = Depends(deps.get_db),
    x_outreach_worker_secret: Optional[str] = Header(None, alias="X-Outreach-Worker-Secret"),
    limit: int = Query(25, ge=1, le=100),
) -> Dict[str, Any]:
    _assert_worker_secret(x_outreach_worker_secret)
    batch = getattr(settings, "OUTREACH_WORKER_BATCH_SIZE", 25) or 25
    runner = OutreachRunner(db)
    return runner.tick(limit=min(limit, batch), budget_seconds=45)


@router.post("/worker/process-now")
def outreach_process_now(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    limit: int = Query(50, ge=1, le=200),
) -> Dict[str, Any]:
    """
    Authenticated single-tick for the current org — use from the Runs UI.

    Sends **at most one** due outreach email per email account this request
    and defers the rest with 5-minute spacing. The in-process scheduler and
    cron keep draining the queue automatically — you do not need to click again.
    """
    runner = OutreachRunner(db)
    result = runner.tick(limit=limit, budget_seconds=15)

    jobs_section = result.get("outreach_jobs") or {}
    sent = result.get("sent_total", 0)
    failed_details: List[str] = []
    for section_key in ("outreach_jobs", "sequence_steps", "scenario_steps"):
        section = result.get(section_key) or {}
        for item in section.get("results", []):
            if item.get("status") == "failed":
                failed_details.append(item.get("reason", "Unknown error"))

    deferred_count = jobs_section.get("deferred", 0)
    if sent > 0 and deferred_count > 0:
        message = f"Sent {sent} email(s). {deferred_count} remaining — spaced 5 min apart."
    elif sent > 0:
        message = f"Sent {sent} email(s)."
    elif deferred_count > 0:
        message = f"No emails due right now. {deferred_count} deferred — next one in ~5 min."
    else:
        message = "No due jobs found."

    merged = dict(result)
    merged.update({
        "sent_total": sent,
        "total_processed": jobs_section.get("processed", 0),
        "budget_exhausted": False,
        "failed_reasons": failed_details,
        "requested_by": current_user.id,
        "organization_id": current_user.organization_id,
        "message": message,
    })
    return merged


@router.get("/jobs")
def list_outreach_jobs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    batch_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Dict[str, Any]:
    q = db.query(OutreachJob).filter(OutreachJob.organization_id == current_user.organization_id)
    if batch_id:
        q = q.filter(OutreachJob.batch_id == batch_id)
    if status_filter:
        q = q.filter(OutreachJob.status == status_filter)
    total = q.count()
    rows = q.order_by(OutreachJob.scheduled_at.desc()).offset(skip).limit(limit).all()
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
                "campaign_id": (job.settings or {}).get("campaign_id"),
                "campaign_name": (job.settings or {}).get("campaign_name"),
            }
            for job in rows
        ],
    }


@router.post("/jobs/cancel-all")
def cancel_all_pending_jobs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Cancel every pending/deferred outreach job for the current organization."""
    jobs = (
        db.query(OutreachJob)
        .filter(
            OutreachJob.organization_id == current_user.organization_id,
            OutreachJob.status.in_(["pending", "deferred"]),
        )
        .all()
    )
    batch_ids = set()
    for job in jobs:
        job.status = "cancelled"
        if job.batch_id:
            batch_ids.add(job.batch_id)
        db.add(job)
    db.commit()
    return {"cancelled": len(jobs), "batch_ids": sorted(batch_ids)}


@router.post("/jobs/{batch_id}/cancel")
def cancel_outreach_batch(
    batch_id: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
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


class ClearBounceBody(BaseModel):
    lead_ids: List[int] = Field(..., min_length=1)
    campaign_id: Optional[int] = None


@router.post("/leads/clear-bounce")
def clear_bounce_for_resend(
    body: ClearBounceBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Clear bounce/failed flags so leads can be selected and re-queued."""
    from app.services.google_workspace import clear_lead_bounce_for_resend

    leads = (
        db.query(Lead)
        .filter(
            Lead.id.in_(body.lead_ids),
            Lead.organization_id == current_user.organization_id,
            Lead.is_deleted.is_(False),
        )
        .all()
    )
    for lead in leads:
        clear_lead_bounce_for_resend(db, lead, campaign_id=body.campaign_id)
    db.commit()
    return {"cleared": len(leads), "lead_ids": [lead.id for lead in leads]}


@router.get("/delivery-stats")
def outreach_delivery_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    client_id: Optional[int] = Query(None),
    campaign_id: Optional[int] = Query(None),
    days: Optional[int] = Query(None, ge=1, le=365),
) -> Dict[str, Any]:
    """Aggregate sent/failed/bounced tracking for Cold Outreach."""
    from app.models.client import Client

    org_id = current_user.organization_id
    lead_q = db.query(Lead).filter(Lead.organization_id == org_id, Lead.is_deleted.is_(False))
    if client_id:
        lead_q = lead_q.filter(Lead.client_id == client_id)
    if days:
        since = datetime.utcnow() - timedelta(days=days)
        lead_q = lead_q.filter(Lead.created_at >= since)

    leads = lead_q.all()
    bounced_leads = [lead for lead in leads if getattr(lead, "email_bounced", False)]
    failed_leads = []
    for lead in leads:
        meta = lead.outreach_meta or {}
        status_val = ""
        if campaign_id and isinstance(meta, dict):
            entry = (meta.get("campaigns") or {}).get(str(campaign_id))
            if isinstance(entry, dict):
                status_val = str(entry.get("status") or "")
            elif entry:
                status_val = str(entry)
        if not status_val and isinstance(meta, dict):
            status_val = str(meta.get("status") or "")
        if status_val.strip().lower() in {"failed", "bounced", "bounce"}:
            failed_leads.append(lead)

    job_q = db.query(OutreachJob).filter(OutreachJob.organization_id == org_id)
    if campaign_id:
        # settings JSON — filter in Python for portability
        jobs = job_q.order_by(OutreachJob.scheduled_at.desc()).limit(2000).all()
        jobs = [j for j in jobs if (j.settings or {}).get("campaign_id") == campaign_id]
    else:
        jobs = job_q.order_by(OutreachJob.scheduled_at.desc()).limit(2000).all()
    if days:
        since = datetime.utcnow() - timedelta(days=days)
        jobs = [j for j in jobs if (j.sent_at or j.scheduled_at or datetime.min) >= since]
    if client_id:
        lead_ids = {lead.id for lead in leads}
        jobs = [j for j in jobs if j.lead_id in lead_ids]

    by_status: Dict[str, int] = {}
    for job in jobs:
        by_status[job.status] = by_status.get(job.status, 0) + 1

    client_name = None
    if client_id:
        client = db.query(Client).filter(Client.id == client_id, Client.organization_id == org_id).first()
        client_name = client.name if client else None

    bounce_samples = [
        {
            "id": lead.id,
            "email": lead.email,
            "name": f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
            "company": lead.company,
            "status": (lead.outreach_meta or {}).get("status") if isinstance(lead.outreach_meta, dict) else None,
        }
        for lead in bounced_leads[:50]
    ]

    return {
        "client_id": client_id,
        "client_name": client_name,
        "campaign_id": campaign_id,
        "days": days,
        "leads_total": len(leads),
        "leads_bounced": len(bounced_leads),
        "leads_failed_or_bounced_meta": len(failed_leads),
        "jobs_by_status": by_status,
        "jobs_failed_errors": [
            {
                "job_id": j.id,
                "lead_id": j.lead_id,
                "error": j.last_error,
                "scheduled_at": j.scheduled_at.isoformat() if j.scheduled_at else None,
            }
            for j in jobs
            if j.status == "failed"
        ][:40],
        "bounced_samples": bounce_samples,
    }


# ---------- connections ----------

@router.get("/connections")
def list_connections(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> List[Dict[str, Any]]:
    rows = (
        db.query(OutreachConnection)
        .filter(OutreachConnection.organization_id == current_user.organization_id)
        .order_by(OutreachConnection.id.desc())
        .all()
    )
    return [_conn_out(c) for c in rows]


@router.post("/connections", status_code=201)
def create_connection(
    body: ConnectionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    ctype = (body.type or "").strip().lower()
    allowed = {"google_sheets", "google_docs", "webhook", "ai", "gmail_link", "smtp"}
    if ctype not in allowed:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(allowed)}")

    config = dict(body.config or {})
    encrypted = None
    public_token = None

    if body.access_token:
        encrypted = encrypt_password(body.access_token)
    if ctype == "webhook":
        public_token = secrets.token_urlsafe(24)
    if ctype == "gmail_link":
        account_id = config.get("account_id")
        if not account_id:
            raise HTTPException(status_code=400, detail="gmail_link requires config.account_id")
        account = (
            db.query(EmailAccount)
            .filter(
                EmailAccount.id == int(account_id),
                EmailAccount.organization_id == current_user.organization_id,
            )
            .first()
        )
        if not account:
            raise HTTPException(status_code=404, detail="Email account not found")

    conn = OutreachConnection(
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        type=ctype,
        display_name=body.display_name.strip(),
        config=config,
        encrypted_credentials=encrypted,
        status="active",
        public_token=public_token,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return _conn_out(conn)


@router.patch("/connections/{connection_id}")
def update_connection(
    connection_id: int,
    body: ConnectionUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    conn = _org_connection(db, connection_id, current_user.organization_id)
    if body.display_name is not None:
        conn.display_name = body.display_name.strip()
    if body.config is not None:
        conn.config = body.config
    if body.status is not None:
        conn.status = body.status
    if body.access_token:
        conn.encrypted_credentials = encrypt_password(body.access_token)
    conn.updated_at = datetime.utcnow()
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return _conn_out(conn)


@router.delete("/connections/{connection_id}")
def delete_connection(
    connection_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    conn = _org_connection(db, connection_id, current_user.organization_id)
    db.delete(conn)
    db.commit()
    return {"deleted": True}


@router.get("/google/status")
def google_sheets_status(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    return _google_status_payload(db, current_user)


@router.get("/google/spreadsheets")
def list_google_spreadsheets(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    status_payload = _google_status_payload(db, current_user)
    if not status_payload["connected"]:
        return {**status_payload, "files": [], "drive_error": None}
    if not status_payload["has_sheets_scope"]:
        return {
            **status_payload,
            "files": [],
            "drive_error": "Reconnect Google to grant Sheets access, or paste a spreadsheet URL below.",
        }
    try:
        token = get_user_google_access_token(db, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    files, error_code, drive_error = list_drive_spreadsheets(token)
    return {
        **status_payload,
        "files": files,
        "drive_error": drive_error or None,
        "drive_error_code": error_code,
    }


@router.get("/google/spreadsheets/{spreadsheet_id}/tabs")
def list_spreadsheet_tabs(
    spreadsheet_id: str,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    sheet_id = parse_spreadsheet_id(spreadsheet_id)
    if not sheet_id:
        raise HTTPException(status_code=400, detail="Provide a spreadsheet URL or ID.")
    try:
        token = get_user_google_access_token(db, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        resp = requests.get(
            f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}",
            params={"fields": "sheets.properties(sheetId,title)"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="Could not read worksheet tabs. Reconnect Google Sheets and try again.")
    tabs = []
    for item in (resp.json().get("sheets") or []):
        props = item.get("properties") or {}
        title = props.get("title")
        if title:
            tabs.append({"title": title, "sheet_id": props.get("sheetId")})
    return {"spreadsheet_id": sheet_id, "tabs": tabs}


@router.post("/leads/preview")
def preview_leads_from_source(
    body: LeadRowsPreviewBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    rows: List[List[str]] = []
    if (body.text or "").strip():
        rows = parse_pasted_lead_rows(body.text or "")
    elif body.spreadsheet_id.strip():
        rows = _fetch_google_sheet_rows(
            db,
            current_user,
            body.spreadsheet_id,
            body.range,
        )
    else:
        raise HTTPException(status_code=400, detail="Paste CSV/emails or choose a Google Sheet.")
    preview = preview_mapped_rows(rows, header_row=body.header_row, mapping=body.mapping)
    if not preview["headers"]:
        raise HTTPException(status_code=400, detail="No rows found to preview.")
    return preview


@router.post("/leads/from-text")
def import_leads_from_text(
    body: LeadsFromTextBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    rows = parse_pasted_lead_rows(body.text)
    if not rows:
        raise HTTPException(status_code=400, detail="Paste at least one email or a CSV with an email column.")
    source = (body.source or "outreach_paste").strip() or "outreach_paste"
    return _import_lead_rows(
        db,
        current_user,
        rows,
        header_row=body.header_row,
        mapping=body.mapping,
        source=source,
        client_id=body.client_id,
    )


@router.post("/google/sheets/import")
def import_google_sheet_direct(
    body: SheetsImportBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    conn = ensure_sheets_connection(db, current_user, body.spreadsheet_id, commit=False)
    if body.pasted_values:
        rows = parse_pasted_lead_rows(body.pasted_values)
        sheet_id = parse_spreadsheet_id(body.spreadsheet_id)
    else:
        sheet_id = parse_spreadsheet_id(body.spreadsheet_id) or parse_spreadsheet_id(
            str((conn.config or {}).get("spreadsheet_id") or "")
        )
        rows = _fetch_google_sheet_rows(db, current_user, sheet_id, body.range, connection=conn)
    result = _import_lead_rows(
        db,
        current_user,
        rows,
        header_row=body.header_row,
        mapping=body.mapping,
        source="google_sheets",
        commit=False,
        client_id=body.client_id,
        sheet_context={
            "spreadsheet_id": sheet_id,
            "range": body.range,
            "sheet_title": sheet_title_from_range(body.range),
            "start_row": range_start_row(body.range),
        }
        if sheet_id and not body.pasted_values
        else None,
    )
    config = dict(conn.config or {})
    if sheet_id and sheet_id.lower() != "pasted":
        config["spreadsheet_id"] = sheet_id
    config["range"] = body.range
    conn.config = config
    conn.last_error = None
    conn.updated_at = datetime.utcnow()
    db.add(conn)
    db.commit()
    return result


@router.post("/connections/{connection_id}/sheets/import")
def import_from_sheets(
    connection_id: int,
    body: SheetsImportBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Import leads from Google Sheets via mailbox OAuth, or pasted CSV/TSV."""
    conn = _org_connection(db, connection_id, current_user.organization_id)
    if conn.type not in {"google_sheets", "google_docs"}:
        raise HTTPException(status_code=400, detail="Connection is not a Sheets type")

    sheet_id = parse_spreadsheet_id(body.spreadsheet_id) or parse_spreadsheet_id(
        str((conn.config or {}).get("spreadsheet_id") or "")
    )
    if body.pasted_values:
        rows = parse_pasted_lead_rows(body.pasted_values)
    else:
        rows = _fetch_google_sheet_rows(db, current_user, sheet_id, body.range, connection=conn)

    result = _import_lead_rows(
        db,
        current_user,
        rows,
        header_row=body.header_row,
        mapping=body.mapping,
        source="google_sheets" if not body.pasted_values else "outreach_paste",
        commit=False,
        client_id=body.client_id,
        sheet_context={
            "spreadsheet_id": sheet_id,
            "range": body.range,
            "sheet_title": sheet_title_from_range(body.range),
            "start_row": range_start_row(body.range),
        }
        if sheet_id and not body.pasted_values
        else None,
    )
    config = dict(conn.config or {})
    if sheet_id and sheet_id.lower() != "pasted":
        config["spreadsheet_id"] = sheet_id
    config["range"] = body.range
    conn.config = config
    conn.last_error = None
    conn.updated_at = datetime.utcnow()
    db.add(conn)
    db.commit()
    return result


# ---------- scenarios ----------

@router.post("/scenarios/seed-demo", status_code=201)
def seed_demo_scenario(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Create a starter Wait → Router → Send scenario for the current org (if none exists)."""
    existing = (
        db.query(OutreachScenario)
        .filter(
            OutreachScenario.organization_id == current_user.organization_id,
            OutreachScenario.name == "Demo: Wait → Check email → Send",
        )
        .first()
    )
    if existing:
        return _scenario_out(existing)

    account = (
        db.query(EmailAccount)
        .filter(
            EmailAccount.organization_id == current_user.organization_id,
            EmailAccount.user_id == current_user.id,
        )
        .order_by(EmailAccount.id.asc())
        .first()
    )
    account_id = account.id if account else None
    flow = {
        "modules": [
            {"id": "m1", "type": "trigger_manual", "config": {}},
            {"id": "m2", "type": "wait", "config": {"amount": 0, "unit": "minutes"}},
            {"id": "m3", "type": "router_has_email", "config": {}},
            {
                "id": "m4",
                "type": "send_email",
                "config": {
                    "account_id": account_id,
                    "format": "text",
                    "subject": "Quick hello {{first_name}}",
                    "body": "Hi {{first_name}},\n\nWanted to reach out from LeadLab outreach.\n\nBest",
                },
            },
        ]
    }
    scenario = OutreachScenario(
        organization_id=current_user.organization_id,
        name="Demo: Wait → Check email → Send",
        description="Starter Make-style scenario. Set mailbox on the send module if empty, activate, then Run.",
        status="draft",
        flow_definition=flow,
        settings={"default_account_id": account_id} if account_id else {},
        created_by_id=current_user.id,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return _scenario_out(scenario)


@router.post("/scenarios", status_code=201)
def create_scenario(
    body: ScenarioCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    scenario = OutreachScenario(
        organization_id=current_user.organization_id,
        name=body.name.strip(),
        description=body.description,
        status=body.status or "draft",
        flow_definition=body.flow_definition or {"modules": []},
        schedule_config=body.schedule_config,
        settings=body.settings,
        created_by_id=current_user.id,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return _scenario_out(scenario)


@router.get("/scenarios/{scenario_id}")
def get_scenario(
    scenario_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    scenario = (
        db.query(OutreachScenario)
        .filter(
            OutreachScenario.id == scenario_id,
            OutreachScenario.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _scenario_out(scenario)


@router.patch("/scenarios/{scenario_id}")
def update_scenario(
    scenario_id: int,
    body: ScenarioUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    scenario = (
        db.query(OutreachScenario)
        .filter(
            OutreachScenario.id == scenario_id,
            OutreachScenario.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    for field in ("name", "description", "status", "flow_definition", "schedule_config", "settings"):
        val = getattr(body, field)
        if val is not None:
            setattr(scenario, field, val.strip() if field == "name" and isinstance(val, str) else val)
    scenario.updated_at = datetime.utcnow()
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return _scenario_out(scenario)


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    scenario = (
        db.query(OutreachScenario)
        .filter(
            OutreachScenario.id == scenario_id,
            OutreachScenario.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    db.delete(scenario)
    db.commit()
    return {"deleted": True}


@router.post("/scenarios/{scenario_id}/run")
def run_scenario(
    scenario_id: int,
    body: RunScenarioBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    scenario = (
        db.query(OutreachScenario)
        .filter(
            OutreachScenario.id == scenario_id,
            OutreachScenario.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if scenario.status == "archived":
        raise HTTPException(status_code=400, detail="Scenario is archived")

    runner = OutreachRunner(db)
    try:
        run = runner.start_scenario_run(
            scenario=scenario,
            lead_ids=body.lead_ids,
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            account_id=body.account_id,
            trigger_type="manual",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    run = (
        db.query(OutreachRun)
        .options(joinedload(OutreachRun.scenario), joinedload(OutreachRun.steps))
        .filter(OutreachRun.id == run.id)
        .first()
    )
    return _run_out(run, include_steps=True)


# ---------- runs ----------

@router.get("/runs")
def list_runs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
) -> List[Dict[str, Any]]:
    q = (
        db.query(OutreachRun)
        .options(joinedload(OutreachRun.scenario))
        .filter(OutreachRun.organization_id == current_user.organization_id)
    )
    if status_filter:
        q = q.filter(OutreachRun.status == status_filter)
    rows = q.order_by(OutreachRun.started_at.desc()).offset(skip).limit(limit).all()
    return [_run_out(r) for r in rows]


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    run = (
        db.query(OutreachRun)
        .options(joinedload(OutreachRun.scenario), joinedload(OutreachRun.steps))
        .filter(OutreachRun.id == run_id, OutreachRun.organization_id == current_user.organization_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_out(run, include_steps=True)


# ---------- templates ----------

@router.get("/templates")
def list_templates(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> List[Dict[str, Any]]:
    rows = (
        db.query(OutreachTemplate)
        .filter(OutreachTemplate.organization_id == current_user.organization_id)
        .order_by(OutreachTemplate.id.desc())
        .all()
    )
    return [_template_out(t) for t in rows]


@router.post("/templates", status_code=201)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    tpl = OutreachTemplate(
        organization_id=current_user.organization_id,
        name=body.name.strip(),
        subject=body.subject,
        body=body.body,
        format=body.format or "text",
        ab_subjects=body.ab_subjects,
        created_by_id=current_user.id,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _template_out(tpl)


@router.patch("/templates/{template_id}")
def update_template(
    template_id: int,
    body: TemplateUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    tpl = (
        db.query(OutreachTemplate)
        .filter(
            OutreachTemplate.id == template_id,
            OutreachTemplate.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    for field in ("name", "subject", "body", "format", "ab_subjects"):
        val = getattr(body, field)
        if val is not None:
            setattr(tpl, field, val)
    tpl.updated_at = datetime.utcnow()
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _template_out(tpl)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    tpl = (
        db.query(OutreachTemplate)
        .filter(
            OutreachTemplate.id == template_id,
            OutreachTemplate.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"deleted": True}


# ---------- AI ----------

@router.post("/ai/rewrite")
async def ai_rewrite(
    body: RewriteBody,
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    result = await free_ai_service.rewrite_email(
        subject=body.subject,
        body=body.body,
        instruction=body.instruction,
        lead_data=body.lead or {},
    )
    return result


# ---------- webhook inbound ----------

@router.post("/webhooks/{public_token}")
async def webhook_enroll(
    public_token: str,
    request: Request,
    db: Session = Depends(deps.get_db),
) -> Dict[str, Any]:
    """Inbound webhook: JSON lead fields → create/find lead; optional scenario_id in connection config."""
    conn = (
        db.query(OutreachConnection)
        .filter(
            OutreachConnection.public_token == public_token,
            OutreachConnection.type == "webhook",
            OutreachConnection.status == "active",
        )
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Webhook not found")

    payload = await request.json()
    email = (payload.get("email") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="email required")

    stage = (
        db.query(LeadStage)
        .filter(LeadStage.organization_id == conn.organization_id)
        .order_by(LeadStage.id.asc())
        .first()
    )
    if not stage:
        raise HTTPException(status_code=400, detail="No lead stage")

    lead = (
        db.query(Lead)
        .filter(
            Lead.organization_id == conn.organization_id,
            Lead.email == email,
            Lead.is_deleted.is_(False),
        )
        .first()
    )
    if not lead:
        lead = Lead(
            first_name=payload.get("first_name"),
            last_name=payload.get("last_name"),
            email=email,
            company=payload.get("company"),
            job_title=payload.get("job_title"),
            user_id=conn.user_id,
            organization_id=conn.organization_id,
            stage_id=stage.id,
            created_by=conn.user_id,
            created_at=datetime.utcnow(),
            source="webhook",
            is_deleted=False,
        )
        db.add(lead)
        db.commit()
        db.refresh(lead)

    scenario_id = (conn.config or {}).get("scenario_id")
    run_id = None
    if scenario_id:
        scenario = (
            db.query(OutreachScenario)
            .filter(
                OutreachScenario.id == int(scenario_id),
                OutreachScenario.organization_id == conn.organization_id,
            )
            .first()
        )
        if scenario and scenario.status in {"active", "draft"}:
            runner = OutreachRunner(db)
            run = runner.start_scenario_run(
                scenario=scenario,
                lead_ids=[lead.id],
                organization_id=conn.organization_id,
                user_id=conn.user_id,
                account_id=(conn.config or {}).get("account_id"),
                trigger_type="webhook",
            )
            run_id = run.id

    return {"ok": True, "lead_id": lead.id, "run_id": run_id}
