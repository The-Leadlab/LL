"""
Outreach platform APIs: worker, jobs, connections, scenarios, runs, templates, AI, webhooks.
"""

from __future__ import annotations

import json
import logging
import secrets
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    spreadsheet_id: str
    range: str = "Sheet1!A1:Z500"
    header_row: int = 1
    mapping: Optional[Dict[str, str]] = None
    # Dev fallback: paste CSV/TSV instead of live Sheets API
    pasted_values: Optional[str] = None


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
    return runner.tick(limit=min(limit, batch))


@router.post("/worker/process-now")
def outreach_process_now(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    limit: int = Query(25, ge=1, le=100),
) -> Dict[str, Any]:
    """
    Authenticated tick for the current org — use from the Runs UI while cron is warming up.
    Processes global due work (same runner); safe because sends are org-scoped on each job/step.
    """
    runner = OutreachRunner(db)
    result = runner.tick(limit=limit)
    result["requested_by"] = current_user.id
    result["organization_id"] = current_user.organization_id
    return result


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


@router.post("/connections/{connection_id}/sheets/import")
def import_from_sheets(
    connection_id: int,
    body: SheetsImportBody,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """Import leads from Google Sheets values API or pasted CSV/TSV."""
    conn = _org_connection(db, connection_id, current_user.organization_id)
    if conn.type not in {"google_sheets", "google_docs"}:
        raise HTTPException(status_code=400, detail="Connection is not a Sheets type")

    rows: List[List[str]] = []
    if body.pasted_values:
        for line in body.pasted_values.strip().splitlines():
            if "\t" in line:
                rows.append([c.strip() for c in line.split("\t")])
            else:
                rows.append([c.strip() for c in line.split(",")])
    else:
        token = None
        if conn.encrypted_credentials:
            try:
                token = decrypt_password(conn.encrypted_credentials)
            except Exception:
                token = None
        if not token:
            raise HTTPException(
                status_code=400,
                detail="No access token on connection. Paste access_token on the connection or provide pasted_values CSV.",
            )
        try:
            import requests

            url = (
                f"https://sheets.googleapis.com/v4/spreadsheets/{body.spreadsheet_id}/values/{body.range}"
            )
            resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
            if resp.status_code != 200:
                conn.last_error = resp.text[:500]
                db.add(conn)
                db.commit()
                raise HTTPException(status_code=502, detail=f"Sheets API error: {resp.status_code}")
            values = resp.json().get("values") or []
            rows = [[str(c) for c in r] for r in values]
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    if not rows:
        return {"imported": 0, "skipped": 0, "leads": []}

    header_idx = max(0, (body.header_row or 1) - 1)
    headers = [h.lower().strip().replace(" ", "_") for h in rows[header_idx]]
    mapping = body.mapping or {}
    # default map common headers
    default_map = {
        "email": "email",
        "e-mail": "email",
        "first_name": "first_name",
        "firstname": "first_name",
        "last_name": "last_name",
        "lastname": "last_name",
        "company": "company",
        "job_title": "job_title",
        "title": "job_title",
    }
    col_to_field: Dict[int, str] = {}
    for i, h in enumerate(headers):
        field = mapping.get(h) or mapping.get(headers[i]) or default_map.get(h)
        if field:
            col_to_field[i] = field

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
    created_ids: List[int] = []
    for row in rows[header_idx + 1 :]:
        data = {field: (row[i] if i < len(row) else "").strip() for i, field in col_to_field.items()}
        email = (data.get("email") or "").strip()
        if not email or "@" not in email:
            skipped += 1
            continue
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
            skipped += 1
            created_ids.append(existing.id)
            continue
        lead = Lead(
            first_name=data.get("first_name") or None,
            last_name=data.get("last_name") or None,
            email=email,
            company=data.get("company") or None,
            job_title=data.get("job_title") or None,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            stage_id=stage.id,
            created_by=current_user.id,
            created_at=datetime.utcnow(),
            source="google_sheets",
            is_deleted=False,
        )
        db.add(lead)
        db.flush()
        created_ids.append(lead.id)
        imported += 1

    config = dict(conn.config or {})
    config["spreadsheet_id"] = body.spreadsheet_id
    config["range"] = body.range
    conn.config = config
    conn.last_error = None
    conn.updated_at = datetime.utcnow()
    db.add(conn)
    db.commit()
    return {"imported": imported, "skipped": skipped, "lead_ids": created_ids}


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
