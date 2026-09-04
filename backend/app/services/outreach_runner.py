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

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def lead_tokens(lead: Lead) -> Dict[str, str]:
    first = (lead.first_name or "").strip()
    last = (lead.last_name or "").strip()
    return {
        "first_name": first,
        "last_name": last,
        "full_name": f"{first} {last}".strip(),
        "company": (lead.company or "").strip(),
        "email": (lead.email or "").strip(),
        "job_title": (lead.job_title or "").strip(),
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
            if not ok:
                skipped += 1
                continue

            scheduled = start + timedelta(seconds=delay * index)
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
            "first_scheduled_at": jobs[0].scheduled_at.isoformat() if jobs else None,
            "job_ids": [j.id for j in jobs],
        }

    def process_due_outreach_jobs(self, limit: int = 25) -> Dict[str, Any]:
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
        results: List[Dict[str, Any]] = []

        for job in jobs:
            # Claim
            job.status = "processing"
            job.attempts = (job.attempts or 0) + 1
            job.updated_at = datetime.utcnow()
            self.db.add(job)
            self.db.commit()

            lead = self.db.query(Lead).filter(Lead.id == job.lead_id).first()
            ok, reason = lead_can_email(lead)
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
            "processed": len(jobs),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "deferred": deferred,
            "results": results,
        }

    def process_due_sequence_steps(self, limit: int = 25) -> Dict[str, Any]:
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
        results: List[Dict[str, Any]] = []

        for step in steps:
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
            "processed": len(steps),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "deferred": deferred,
            "results": results,
        }

    def tick(self, limit: int = 25) -> Dict[str, Any]:
        half = max(1, limit // 2)
        jobs = self.process_due_outreach_jobs(limit=half)
        steps = self.process_due_sequence_steps(limit=limit - half + (limit % 2))
        return {
            "outreach_jobs": jobs,
            "sequence_steps": steps,
            "sent_total": jobs.get("sent", 0) + steps.get("sent", 0),
        }
