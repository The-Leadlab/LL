"""
Outreach worker helpers: merge tokens, send windows, process due jobs & sequence steps.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import logging
import re
import uuid
from datetime import datetime, timedelta, time
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.models.email_account import EmailAccount
from app.models.email_sequence import EmailSequence, SequenceEnrollment, SequenceStep
from app.models.lead import Lead
from app.models.outreach_job import OutreachJob
from app.services.email_service import EmailService
from app.services.google_workspace import lead_already_sent_for_campaign, mark_lead_sent_on_sheet

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def lead_tokens(lead: Lead) -> Dict[str, str]:
    first = (lead.first_name or "").strip()
    last = (lead.last_name or "").strip()
    unique_id = (getattr(lead, "unique_lead_id", None) or "").strip()
    return {
        "first_name": first,
        "last_name": last,
        "full_name": f"{first} {last}".strip(),
        "company": (lead.company or "").strip(),
        "email": (lead.email or "").strip(),
        "job_title": (lead.job_title or "").strip(),
        "id": str(getattr(lead, "id", "") or ""),
        "unique_lead_id": unique_id,
    }


def apply_tokens(template: str, tokens: Dict[str, str], as_html: bool) -> str:
    def repl(match: re.Match) -> str:
        key = match.group(1).lower()
        value = tokens.get(key, "")
        return html_lib.escape(value) if as_html else value

    return _TOKEN_RE.sub(repl, template or "")


def lead_can_email(lead: Optional[Lead]) -> Tuple[bool, str]:
    if not lead:
        return False, "Lead not found"
    if getattr(lead, "is_deleted", False):
        return False, "Lead deleted"
    if getattr(lead, "do_not_email", False):
        return False, "Lead marked do_not_email"
    if getattr(lead, "email_bounced", False):
        return False, "Lead email bounced"
    to_email = (lead.email or "").strip()
    if not to_email or "@" not in to_email:
        return False, "Lead has no email"
    return True, ""


def _parse_hhmm(value: Optional[str], default: time) -> time:
    if not value:
        return default
    try:
        parts = str(value).strip().split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return time(hour=hour, minute=minute)
    except Exception:
        return default


def next_send_slot(now_utc: datetime, settings: Optional[Dict[str, Any]]) -> datetime:
    """
    If outside send window, return the next allowed UTC datetime.
    Otherwise return now_utc.
    """
    settings = settings or {}
    has_window = bool(settings.get("send_window_start") or settings.get("send_window_end"))
    weekdays_only = bool(settings.get("weekdays_only", False))
    if not has_window and not weekdays_only:
        return now_utc

    tz_name = settings.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")

    start = _parse_hhmm(settings.get("send_window_start"), time(9, 0))
    end = _parse_hhmm(settings.get("send_window_end"), time(17, 0))
    if not has_window:
        # Weekdays-only with no clock window: any time Mon–Fri is fine
        start = time(0, 0)
        end = time(23, 59)

    local = now_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    candidate = local
    for _ in range(21):
        if weekdays_only and candidate.weekday() >= 5:
            candidate = datetime.combine(candidate.date() + timedelta(days=1), start, tzinfo=tz)
            continue
        t = candidate.time().replace(tzinfo=None) if candidate.tzinfo else candidate.time()
        if t < start:
            candidate = datetime.combine(candidate.date(), start, tzinfo=tz)
            return candidate.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        if t >= end:
            candidate = datetime.combine(candidate.date() + timedelta(days=1), start, tzinfo=tz)
            continue
        return candidate.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    return now_utc


def make_idempotency_key(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]


class OutreachRunner:
    def __init__(self, db: Session):
        self.db = db
        self.email_service = EmailService(db)

    def enqueue_outreach_jobs(
        self,
        *,
        organization_id: int,
        user_id: int,
        account_id: int,
        lead_ids: List[int],
        subject: str,
        body: str,
        format: str = "text",
        start_at: Optional[datetime] = None,
        delay_seconds: float = 1.0,
        settings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        start = start_at or datetime.utcnow()
        batch_id = uuid.uuid4().hex
        created = 0
        skipped = 0
        jobs: List[OutreachJob] = []
        delay = max(0.0, float(delay_seconds or 0))

        for index, lead_id in enumerate(lead_ids):
            lead = (
                self.db.query(Lead)
                .filter(
                    Lead.id == lead_id,
                    Lead.organization_id == organization_id,
                    Lead.is_deleted.is_(False),
                )
                .first()
            )
            ok, reason = lead_can_email(lead)
            campaign_id = (settings or {}).get("campaign_id")
            if ok and (settings or {}).get("skip_if_sent", True) and lead_already_sent_for_campaign(lead, campaign_id):
                ok, reason = False, "Already sent in this campaign"
            scheduled = start + timedelta(seconds=delay * index)
            if not ok:
                skipped += 1
                key = make_idempotency_key("outreach-skip", batch_id, lead_id, subject[:40])
                job = OutreachJob(
                    organization_id=organization_id,
                    user_id=user_id,
                    account_id=account_id,
                    lead_id=lead_id,
                    batch_id=batch_id,
                    subject=subject,
                    body=body,
                    format=(format or "text").lower(),
                    scheduled_at=scheduled,
                    status="skipped",
                    last_error=reason,
                    idempotency_key=key,
                    settings=settings or {},
                )
                self.db.add(job)
                jobs.append(job)
                continue

            scheduled = next_send_slot(scheduled, settings)
            key = make_idempotency_key("outreach", batch_id, lead_id, subject[:40])
            job = OutreachJob(
                organization_id=organization_id,
                user_id=user_id,
                account_id=account_id,
                lead_id=lead_id,
                batch_id=batch_id,
                subject=subject,
                body=body,
                format=(format or "text").lower(),
                scheduled_at=scheduled,
                status="pending",
                idempotency_key=key,
                settings=settings or {},
            )
            self.db.add(job)
            jobs.append(job)
            created += 1

        self.db.commit()
        return {
            "queued": created,
            "skipped": skipped,
            "batch_id": batch_id,
            "first_scheduled_at": next((j.scheduled_at.isoformat() for j in jobs if j.status == "pending"), None),
            "job_ids": [j.id for j in jobs],
        }

    def record_completed_outreach_batch(
        self,
        *,
        organization_id: int,
        user_id: int,
        account_id: int,
        subject: str,
        body: str,
        format: str = "text",
        settings: Optional[Dict[str, Any]] = None,
        results: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Persist immediate-send outcomes so Runs history stays in sync."""
        batch_id = uuid.uuid4().hex
        now = datetime.utcnow()
        job_ids: List[int] = []

        for result in results:
            lead_id = result.get("lead_id")
            if lead_id is None:
                continue
            status = str(result.get("status") or "failed").lower()
            if status not in {"sent", "failed", "skipped"}:
                status = "failed"
            key = make_idempotency_key("outreach-immediate", batch_id, lead_id, subject[:40], status)
            job = OutreachJob(
                organization_id=organization_id,
                user_id=user_id,
                account_id=account_id,
                lead_id=int(lead_id),
                batch_id=batch_id,
                subject=subject,
                body=body,
                format=(format or "text").lower(),
                scheduled_at=now,
                status=status,
                attempts=1 if status != "skipped" else 0,
                last_error=(result.get("reason") if status != "sent" else None),
                idempotency_key=key,
                settings=settings or {},
                sent_at=now if status == "sent" else None,
            )
            self.db.add(job)
            self.db.flush()
            job_ids.append(job.id)

        self.db.commit()
        return {"batch_id": batch_id, "recorded": len(job_ids), "job_ids": job_ids}

    def process_due_outreach_jobs(
        self,
        limit: int = 25,
        deadline: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        jobs = (
            self.db.query(OutreachJob)
            .filter(
                OutreachJob.status.in_(["pending", "deferred"]),
                OutreachJob.scheduled_at <= now,
            )
            .order_by(OutreachJob.scheduled_at.asc())
            .limit(limit)
            .all()
        )
        sent = failed = skipped = deferred = 0
        budget_exhausted = False
        results: List[Dict[str, Any]] = []

        for job in jobs:
            if deadline and datetime.utcnow() >= deadline:
                budget_exhausted = True
                break
            # Claim
            job.status = "processing"
            job.attempts = (job.attempts or 0) + 1
            job.updated_at = datetime.utcnow()
            self.db.add(job)
            self.db.commit()

            lead = self.db.query(Lead).filter(Lead.id == job.lead_id).first()
            ok, reason = lead_can_email(lead)
            campaign_id = (job.settings or {}).get("campaign_id")
            if ok and (job.settings or {}).get("skip_if_sent", True) and lead_already_sent_for_campaign(lead, campaign_id):
                ok, reason = False, "Already sent in this campaign"
            if not ok:
                job.status = "skipped"
                job.last_error = reason
                job.updated_at = datetime.utcnow()
                self.db.add(job)
                self.db.commit()
                skipped += 1
                results.append({"job_id": job.id, "status": "skipped", "reason": reason})
                continue

            slot = next_send_slot(datetime.utcnow(), job.settings or {})
            if slot > datetime.utcnow() + timedelta(seconds=30):
                job.status = "deferred"
                job.scheduled_at = slot
                job.updated_at = datetime.utcnow()
                self.db.add(job)
                self.db.commit()
                deferred += 1
                results.append({"job_id": job.id, "status": "deferred", "scheduled_at": slot.isoformat()})
                continue

            # Rate limit per account (max_per_hour in settings)
            max_per_hour = int((job.settings or {}).get("max_per_hour") or 0)
            if max_per_hour > 0:
                hour_ago = datetime.utcnow() - timedelta(hours=1)
                recent = (
                    self.db.query(OutreachJob)
                    .filter(
                        OutreachJob.account_id == job.account_id,
                        OutreachJob.status == "sent",
                        OutreachJob.sent_at >= hour_ago,
                    )
                    .count()
                )
                if recent >= max_per_hour:
                    job.status = "deferred"
                    job.scheduled_at = datetime.utcnow() + timedelta(minutes=5)
                    job.last_error = "Rate limit: max_per_hour reached"
                    job.updated_at = datetime.utcnow()
                    self.db.add(job)
                    self.db.commit()
                    deferred += 1
                    results.append({"job_id": job.id, "status": "deferred", "reason": "rate_limit"})
                    continue

            tokens = lead_tokens(lead)
            as_html = (job.format or "text") == "html"
            subject = apply_tokens(job.subject, tokens, as_html=False)
            body = apply_tokens(job.body, tokens, as_html=as_html)
            body_html = body if as_html else f"<p>{html_lib.escape(body).replace(chr(10), '<br>')}</p>"
            body_text = body if not as_html else re.sub(r"<[^>]+>", " ", body)

            try:
                send_result = self.email_service.send_email(
                    account_id=job.account_id,
                    to_emails=[(lead.email or "").strip()],
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    lead_id=lead.id,
                )
            except Exception as exc:
                logger.error("Outreach job %s failed: %s", job.id, exc, exc_info=True)
                job.status = "failed"
                job.last_error = str(exc)
                job.updated_at = datetime.utcnow()
                self.db.add(job)
                self.db.commit()
                failed += 1
                results.append({"job_id": job.id, "status": "failed", "reason": str(exc)})
                continue

            if send_result.get("sent"):
                job.status = "sent"
                job.sent_at = datetime.utcnow()
                job.last_error = None
                job.updated_at = datetime.utcnow()
                token = None
                try:
                    account = self.db.query(EmailAccount).filter(EmailAccount.id == job.account_id).first()
                    if account and account.oauth_refresh_token:
                        token = self.email_service._get_google_access_token(account)
                except Exception as sheet_exc:
                    logger.warning("Could not refresh Google token to write Sent status: %s", sheet_exc)
                mark_lead_sent_on_sheet(
                    self.db,
                    lead,
                    token,
                    campaign_id=(job.settings or {}).get("campaign_id"),
                    campaign_name=(job.settings or {}).get("campaign_name"),
                )
                self.db.add(job)
                self.db.commit()
                sent += 1
                results.append({"job_id": job.id, "lead_id": lead.id, "status": "sent"})
            else:
                job.status = "failed"
                job.last_error = self.email_service.last_send_error or "Delivery failed"
                job.updated_at = datetime.utcnow()
                self.db.add(job)
                self.db.commit()
                failed += 1
                results.append({"job_id": job.id, "status": "failed", "reason": job.last_error})

        return {
            "processed": sent + failed + skipped + deferred,
            "queued": len(jobs),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "deferred": deferred,
            "budget_exhausted": budget_exhausted,
            "results": results,
        }

    def process_due_sequence_steps(
        self,
        limit: int = 25,
        deadline: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        steps = (
            self.db.query(SequenceStep)
            .join(SequenceEnrollment, SequenceEnrollment.id == SequenceStep.enrollment_id)
            .join(EmailSequence, EmailSequence.id == SequenceEnrollment.sequence_id)
            .options(
                joinedload(SequenceStep.enrollment).joinedload(SequenceEnrollment.sequence),
            )
            .filter(
                SequenceStep.status == "pending",
                SequenceStep.scheduled_at <= now,
                SequenceEnrollment.status == "active",
                EmailSequence.is_active.is_(True),
            )
            .order_by(SequenceStep.scheduled_at.asc())
            .limit(limit)
            .all()
        )

        sent = failed = skipped = deferred = 0
        budget_exhausted = False
        results: List[Dict[str, Any]] = []

        for step in steps:
            if deadline and datetime.utcnow() >= deadline:
                budget_exhausted = True
                break
            enrollment = step.enrollment
            sequence = enrollment.sequence if enrollment else None
            if not enrollment or not sequence:
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                continue

            lead = self.db.query(Lead).filter(Lead.id == enrollment.lead_id).first()
            ok, reason = lead_can_email(lead)
            if not ok:
                step.status = "skipped"
                self.db.add(step)
                self.db.commit()
                skipped += 1
                results.append({"step_id": step.id, "status": "skipped", "reason": reason})
                continue

            settings = sequence.settings or {}
            slot = next_send_slot(datetime.utcnow(), settings)
            if slot > datetime.utcnow() + timedelta(seconds=30):
                step.scheduled_at = slot
                self.db.add(step)
                self.db.commit()
                deferred += 1
                results.append({"step_id": step.id, "status": "deferred", "scheduled_at": slot.isoformat()})
                continue

            account_id = sequence.email_account_id
            if not account_id:
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                results.append({"step_id": step.id, "status": "failed", "reason": "Sequence has no email_account_id"})
                continue

            account = (
                self.db.query(EmailAccount)
                .filter(
                    EmailAccount.id == account_id,
                    EmailAccount.organization_id == sequence.organization_id,
                )
                .first()
            )
            if not account:
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                results.append({"step_id": step.id, "status": "failed", "reason": "Email account missing"})
                continue

            step_def = None
            for item in sequence.steps or []:
                if int(item.get("step", -1)) == int(step.step_number):
                    step_def = item
                    break
            if not step_def:
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                results.append({"step_id": step.id, "status": "failed", "reason": "Step definition missing"})
                continue

            tokens = lead_tokens(lead)
            subject = apply_tokens(step_def.get("subject") or "", tokens, as_html=False)
            body = apply_tokens(step_def.get("body") or "", tokens, as_html=True)
            body_html = body
            body_text = re.sub(r"<[^>]+>", " ", body)

            try:
                send_result = self.email_service.send_email(
                    account_id=account.id,
                    to_emails=[(lead.email or "").strip()],
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    lead_id=lead.id,
                )
            except Exception as exc:
                logger.error("Sequence step %s failed: %s", step.id, exc, exc_info=True)
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                results.append({"step_id": step.id, "status": "failed", "reason": str(exc)})
                continue

            if send_result.get("sent"):
                step.status = "sent"
                step.sent_at = datetime.utcnow()
                enrollment.current_step = step.step_number
                self.db.add(step)
                self.db.add(enrollment)

                # Complete enrollment when no later pending steps remain
                remaining = (
                    self.db.query(SequenceStep)
                    .filter(
                        SequenceStep.enrollment_id == enrollment.id,
                        SequenceStep.status == "pending",
                        SequenceStep.id != step.id,
                    )
                    .count()
                )
                if remaining == 0:
                    enrollment.status = "completed"
                    enrollment.completed_at = datetime.utcnow()
                    sequence.total_completed = (sequence.total_completed or 0) + 1
                    self.db.add(sequence)

                self.db.commit()
                sent += 1
                results.append({"step_id": step.id, "lead_id": lead.id, "status": "sent"})
            else:
                step.status = "failed"
                self.db.add(step)
                self.db.commit()
                failed += 1
                results.append({
                    "step_id": step.id,
                    "status": "failed",
                    "reason": self.email_service.last_send_error or "Delivery failed",
                })

        return {
            "processed": sent + failed + skipped + deferred,
            "queued": len(steps),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "deferred": deferred,
            "budget_exhausted": budget_exhausted,
            "results": results,
        }

    def _modules(self, scenario) -> List[Dict[str, Any]]:
        flow = scenario.flow_definition or {}
        modules = flow.get("modules") or []
        return list(modules)

    def _module_index(self, modules: List[Dict[str, Any]], node_id: str) -> int:
        for i, mod in enumerate(modules):
            if str(mod.get("id")) == str(node_id):
                return i
        return -1

    def start_scenario_run(
        self,
        *,
        scenario,
        lead_ids: List[int],
        organization_id: int,
        user_id: int,
        account_id: Optional[int] = None,
        trigger_type: str = "manual",
    ):
        from app.models.outreach_platform import OutreachRun, OutreachRunStep

        modules = self._modules(scenario)
        if not modules:
            raise ValueError("Scenario has no modules")

        first = modules[0]
        settings = dict(scenario.settings or {})
        if account_id:
            settings["default_account_id"] = account_id

        run = OutreachRun(
            scenario_id=scenario.id,
            organization_id=organization_id,
            trigger_type=trigger_type,
            status="running",
            started_at=datetime.utcnow(),
            stats={"queued_leads": 0, "sent": 0, "failed": 0, "skipped": 0},
            created_by_id=user_id,
        )
        self.db.add(run)
        self.db.flush()

        queued = 0
        now = datetime.utcnow()
        for lead_id in lead_ids:
            lead = (
                self.db.query(Lead)
                .filter(
                    Lead.id == lead_id,
                    Lead.organization_id == organization_id,
                    Lead.is_deleted.is_(False),
                )
                .first()
            )
            if not lead:
                continue
            key = make_idempotency_key("scenario", run.id, first.get("id"), lead_id)
            step = OutreachRunStep(
                run_id=run.id,
                node_id=str(first.get("id")),
                lead_id=lead_id,
                status="pending",
                scheduled_at=next_send_slot(now, settings),
                input={"module_type": first.get("type"), "settings": settings},
                idempotency_key=key,
            )
            self.db.add(step)
            queued += 1

        run.stats = {**(run.stats or {}), "queued_leads": queued}
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def _enqueue_next_module(
        self,
        *,
        run,
        lead_id: int,
        modules: List[Dict[str, Any]],
        current_index: int,
        delay: timedelta,
        settings: Dict[str, Any],
        carry: Optional[Dict[str, Any]] = None,
    ) -> None:
        from app.models.outreach_platform import OutreachRunStep

        nxt = current_index + 1
        if nxt >= len(modules):
            # maybe finish run if no pending steps left
            pending = (
                self.db.query(OutreachRunStep)
                .filter(OutreachRunStep.run_id == run.id, OutreachRunStep.status == "pending")
                .count()
            )
            if pending == 0:
                run.status = "completed"
                run.finished_at = datetime.utcnow()
                self.db.add(run)
            return

        mod = modules[nxt]
        # Skip trigger_manual when advancing
        if mod.get("type") == "trigger_manual" and nxt + 1 < len(modules):
            self._enqueue_next_module(
                run=run,
                lead_id=lead_id,
                modules=modules,
                current_index=nxt,
                delay=delay,
                settings=settings,
                carry=carry,
            )
            return

        when = next_send_slot(datetime.utcnow() + delay, settings)
        key = make_idempotency_key("scenario", run.id, mod.get("id"), lead_id, when.isoformat())
        step = OutreachRunStep(
            run_id=run.id,
            node_id=str(mod.get("id")),
            lead_id=lead_id,
            status="pending",
            scheduled_at=when,
            input={"module_type": mod.get("type"), "settings": settings, "carry": carry or {}},
            idempotency_key=key,
        )
        self.db.add(step)

    def process_due_scenario_steps(self, limit: int = 25) -> Dict[str, Any]:
        from app.models.outreach_platform import OutreachRun, OutreachRunStep, OutreachScenario

        now = datetime.utcnow()
        steps = (
            self.db.query(OutreachRunStep)
            .join(OutreachRun, OutreachRun.id == OutreachRunStep.run_id)
            .filter(
                OutreachRunStep.status == "pending",
                OutreachRunStep.scheduled_at <= now,
                OutreachRun.status == "running",
            )
            .order_by(OutreachRunStep.scheduled_at.asc())
            .limit(limit)
            .all()
        )

        sent = failed = skipped = deferred = advanced = 0
        results: List[Dict[str, Any]] = []

        for step in steps:
            run = self.db.query(OutreachRun).filter(OutreachRun.id == step.run_id).first()
            scenario = (
                self.db.query(OutreachScenario).filter(OutreachScenario.id == run.scenario_id).first()
                if run
                else None
            )
            if not run or not scenario:
                step.status = "failed"
                step.error = "Run/scenario missing"
                self.db.add(step)
                self.db.commit()
                failed += 1
                continue

            if scenario.status == "paused":
                step.scheduled_at = datetime.utcnow() + timedelta(minutes=10)
                self.db.add(step)
                self.db.commit()
                deferred += 1
                continue

            modules = self._modules(scenario)
            idx = self._module_index(modules, step.node_id)
            if idx < 0:
                step.status = "failed"
                step.error = "Unknown module"
                self.db.add(step)
                self.db.commit()
                failed += 1
                continue

            mod = modules[idx]
            mtype = (mod.get("type") or "").lower()
            config = mod.get("config") or {}
            settings = dict((step.input or {}).get("settings") or scenario.settings or {})
            carry = dict((step.input or {}).get("carry") or {})

            lead = self.db.query(Lead).filter(Lead.id == step.lead_id).first() if step.lead_id else None

            # Claim
            step.status = "processing"
            self.db.add(step)
            self.db.commit()

            try:
                if mtype in {"trigger_manual", "stop_on_reply"}:
                    # stop_on_reply is a marker: if enrollment replied elsewhere, skip — for now pass-through
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = {"action": "pass"}
                    self.db.add(step)
                    self._enqueue_next_module(
                        run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                        delay=timedelta(0), settings=settings, carry=carry,
                    )
                    self.db.commit()
                    advanced += 1
                    results.append({"step_id": step.id, "status": "advanced", "type": mtype})
                    continue

                if mtype == "wait":
                    amount = int(config.get("amount") or 0)
                    unit = (config.get("unit") or "days").lower()
                    if unit.startswith("min"):
                        delay = timedelta(minutes=amount)
                    elif unit.startswith("hour"):
                        delay = timedelta(hours=amount)
                    else:
                        delay = timedelta(days=amount)
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = {"waited": True, "amount": amount, "unit": unit}
                    self.db.add(step)
                    self._enqueue_next_module(
                        run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                        delay=delay, settings=settings, carry=carry,
                    )
                    self.db.commit()
                    advanced += 1
                    results.append({"step_id": step.id, "status": "wait_scheduled"})
                    continue

                if mtype == "router_has_email":
                    ok, reason = lead_can_email(lead)
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = {"has_email": ok, "reason": reason}
                    self.db.add(step)
                    if ok:
                        self._enqueue_next_module(
                            run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                            delay=timedelta(0), settings=settings, carry=carry,
                        )
                    else:
                        skipped += 1
                        # finish this lead path
                        pending = (
                            self.db.query(OutreachRunStep)
                            .filter(OutreachRunStep.run_id == run.id, OutreachRunStep.status == "pending")
                            .count()
                        )
                        if pending == 0:
                            run.status = "completed"
                            run.finished_at = datetime.utcnow()
                            self.db.add(run)
                    self.db.commit()
                    advanced += 1
                    continue

                if mtype == "update_lead":
                    if lead:
                        field = str(config.get("field") or "").strip()
                        value = config.get("value")
                        if field and hasattr(lead, field) and field not in {"id", "organization_id"}:
                            setattr(lead, field, value)
                            self.db.add(lead)
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = {"updated": True}
                    self.db.add(step)
                    self._enqueue_next_module(
                        run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                        delay=timedelta(0), settings=settings, carry=carry,
                    )
                    self.db.commit()
                    advanced += 1
                    continue

                if mtype == "ab_subject":
                    subjects = config.get("subjects") or config.get("ab_subjects") or []
                    if isinstance(subjects, str):
                        subjects = [s.strip() for s in subjects.split(",") if s.strip()]
                    pick = subjects[(step.lead_id or 0) % len(subjects)] if subjects else None
                    if pick:
                        carry["subject"] = pick
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = {"subject": pick}
                    self.db.add(step)
                    self._enqueue_next_module(
                        run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                        delay=timedelta(0), settings=settings, carry=carry,
                    )
                    self.db.commit()
                    advanced += 1
                    continue

                if mtype == "ai_rewrite":
                    # Sync fallback rewrite (no await in sync worker)
                    subject = carry.get("subject") or config.get("subject") or ""
                    body = carry.get("body") or config.get("body") or ""
                    instruction = config.get("instruction") or "Make this email clearer and more concise."
                    rewritten = free_ai_service_rewrite_sync(subject, body, instruction, lead)
                    carry["subject"] = rewritten.get("subject") or subject
                    carry["body"] = rewritten.get("body") or body
                    step.status = "sent"
                    step.executed_at = datetime.utcnow()
                    step.output = rewritten
                    self.db.add(step)
                    self._enqueue_next_module(
                        run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                        delay=timedelta(0), settings=settings, carry=carry,
                    )
                    self.db.commit()
                    advanced += 1
                    continue

                if mtype == "send_email":
                    ok, reason = lead_can_email(lead)
                    if not ok:
                        step.status = "skipped"
                        step.error = reason
                        step.executed_at = datetime.utcnow()
                        self.db.add(step)
                        self.db.commit()
                        skipped += 1
                        self._maybe_complete_run(run)
                        continue

                    account_id = (
                        config.get("account_id")
                        or settings.get("default_account_id")
                        or (scenario.settings or {}).get("default_account_id")
                    )
                    if not account_id:
                        step.status = "failed"
                        step.error = "No account_id for send_email"
                        self.db.add(step)
                        self.db.commit()
                        failed += 1
                        continue

                    tokens = lead_tokens(lead)
                    as_html = (config.get("format") or "text") == "html"
                    subject_tpl = carry.get("subject") or config.get("subject") or ""
                    # A/B from send config
                    ab = config.get("ab_subjects") or []
                    if ab and isinstance(ab, list) and len(ab) > 0:
                        subject_tpl = ab[(step.lead_id or 0) % len(ab)]
                    body_tpl = carry.get("body") or config.get("body") or ""
                    subject = apply_tokens(subject_tpl, tokens, as_html=False)
                    body = apply_tokens(body_tpl, tokens, as_html=as_html)
                    body_html = body if as_html else f"<p>{html_lib.escape(body).replace(chr(10), '<br>')}</p>"
                    body_text = body if not as_html else re.sub(r"<[^>]+>", " ", body)

                    send_result = self.email_service.send_email(
                        account_id=int(account_id),
                        to_emails=[(lead.email or "").strip()],
                        subject=subject,
                        body_text=body_text,
                        body_html=body_html,
                        lead_id=lead.id,
                    )
                    if send_result.get("sent"):
                        step.status = "sent"
                        step.executed_at = datetime.utcnow()
                        step.output = {"sent": True, "subject": subject}
                        stats = dict(run.stats or {})
                        stats["sent"] = int(stats.get("sent") or 0) + 1
                        run.stats = stats
                        self.db.add(run)
                        self.db.add(step)
                        self._enqueue_next_module(
                            run=run, lead_id=step.lead_id, modules=modules, current_index=idx,
                            delay=timedelta(0), settings=settings, carry=carry,
                        )
                        self.db.commit()
                        sent += 1
                        results.append({"step_id": step.id, "status": "sent"})
                    else:
                        step.status = "failed"
                        step.error = self.email_service.last_send_error or "Delivery failed"
                        step.executed_at = datetime.utcnow()
                        stats = dict(run.stats or {})
                        stats["failed"] = int(stats.get("failed") or 0) + 1
                        run.stats = stats
                        self.db.add(run)
                        self.db.add(step)
                        self.db.commit()
                        failed += 1
                    continue

                step.status = "failed"
                step.error = f"Unsupported module type: {mtype}"
                self.db.add(step)
                self.db.commit()
                failed += 1

            except Exception as exc:
                logger.error("Scenario step %s failed: %s", step.id, exc, exc_info=True)
                step.status = "failed"
                step.error = str(exc)
                step.executed_at = datetime.utcnow()
                self.db.add(step)
                self.db.commit()
                failed += 1

        return {
            "processed": len(steps),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "deferred": deferred,
            "advanced": advanced,
            "results": results,
        }

    def _maybe_complete_run(self, run) -> None:
        from app.models.outreach_platform import OutreachRunStep

        pending = (
            self.db.query(OutreachRunStep)
            .filter(OutreachRunStep.run_id == run.id, OutreachRunStep.status.in_(["pending", "processing"]))
            .count()
        )
        if pending == 0 and run.status == "running":
            run.status = "completed"
            run.finished_at = datetime.utcnow()
            self.db.add(run)

    def tick(
        self,
        limit: int = 25,
        budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        deadline = (
            datetime.utcnow() + timedelta(seconds=budget_seconds)
            if budget_seconds
            else None
        )

        empty_section: Dict[str, Any] = {
            "sent": 0, "failed": 0, "processed": 0,
            "budget_exhausted": True, "results": [],
        }

        # Give outreach jobs the full limit first; allocate the remainder
        # to sequence steps and scenario steps.  The old rigid 1/3 split
        # meant process-now with limit=5 only sent 1 outreach job per click.
        jobs = self.process_due_outreach_jobs(limit=limit, deadline=deadline)
        used = jobs.get("processed", 0)

        remaining = max(0, limit - used)
        if remaining == 0 or (deadline and datetime.utcnow() >= deadline):
            seq = dict(empty_section)
            scenarios = dict(empty_section)
        else:
            half = max(1, remaining // 2)
            seq = self.process_due_sequence_steps(limit=half, deadline=deadline)
            used2 = seq.get("processed", 0)
            remaining2 = max(0, remaining - used2)
            if remaining2 == 0 or (deadline and datetime.utcnow() >= deadline):
                scenarios = dict(empty_section)
            else:
                scenarios = self.process_due_scenario_steps(limit=remaining2)

        budget_exhausted = (
            jobs.get("budget_exhausted", False)
            or seq.get("budget_exhausted", False)
            or scenarios.get("budget_exhausted", False)
        )
        return {
            "outreach_jobs": jobs,
            "sequence_steps": seq,
            "scenario_steps": scenarios,
            "sent_total": jobs.get("sent", 0) + seq.get("sent", 0) + scenarios.get("sent", 0),
            "budget_exhausted": budget_exhausted,
        }


def free_ai_service_rewrite_sync(
    subject: str,
    body: str,
    instruction: str,
    lead: Optional[Lead],
) -> Dict[str, str]:
    """Best-effort sync rewrite without requiring an event loop."""
    lead_data = {}
    if lead:
        lead_data = {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "company": lead.company,
            "job_title": lead.job_title,
            "email": lead.email,
        }
    # Rule-based polish when Gemini unavailable
    note = f"[{instruction.strip()}] " if instruction else ""
    return {
        "subject": subject if subject else "Quick note",
        "body": f"{note}{body}".strip() or body,
    }
