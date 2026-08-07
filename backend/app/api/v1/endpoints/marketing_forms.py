"""
Public marketing form submissions (Business Diagnostic, Data Request, Pitch Your Idea).
Persists to DB and emails info@the-leadlab.com with full details.
"""
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.email import EmailSender
from app.models.marketing_form_submission import MarketingFormSubmission
from app.schemas.marketing_forms import MarketingFormSubmissionCreate
from app.services.marketing_form_email import build_data_request_email, build_generic_email

router = APIRouter()
logger = logging.getLogger(__name__)

PRIMARY_INBOX = "info@the-leadlab.com"


def _ensure_marketing_table(db: Session) -> None:
    """Create marketing_form_submissions if missing (idempotent)."""
    try:
        bind = db.get_bind()
        MarketingFormSubmission.__table__.create(bind=bind, checkfirst=True)
    except Exception as exc:
        logger.warning("Could not ensure marketing_form_submissions table: %s", exc)


@router.post("/submit", response_model=dict)
async def submit_marketing_form(
    body: MarketingFormSubmissionCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Save submission and email info@the-leadlab.com with the full payload.
    Does not fan out to every admin (avoids spam / junk admin accounts).
    """
    _ensure_marketing_table(db)

    row_id = None
    try:
        row = MarketingFormSubmission(
            form_type=body.form_type,
            full_name=body.full_name,
            email=str(body.email),
            company=body.company,
            phone=body.phone,
            subject=body.subject,
            payload_json=json.dumps(body.payload, ensure_ascii=False, default=str) if body.payload else None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        row_id = row.id
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist marketing form submission: %s", exc, exc_info=True)

    # Only the LeadLab inbox — never blast all DB admins.
    recipients = [PRIMARY_INBOX]

    subject = body.subject or f"New {body.form_type.replace('_', ' ')} submission"
    payload = body.payload or {}
    if body.form_type == "data_request":
        html_content, text_content = build_data_request_email(body, payload)
    else:
        html_content, text_content = build_generic_email(body, payload)

    emailed_ok = False
    email_errors = []
    email_error_detail = None
    try:
        sender = EmailSender()
        logger.info(
            "Marketing email attempt provider=%s resend_key=%s from=%s",
            (settings.EMAIL_PROVIDER or "").strip(),
            "set" if sender.resend_api_key else "missing",
            sender.resend_from_email or sender.from_email,
        )
        for recipient in recipients:
            try:
                ok = await sender.send_email(
                    to_email=recipient,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                )
                if ok:
                    emailed_ok = True
                    logger.info("Marketing form email sent to %s", recipient)
                else:
                    detail = sender.last_error or "send returned false"
                    email_error_detail = detail
                    email_errors.append(f"{recipient}: {detail}")
                    logger.error("Marketing form email failed for %s: %s", recipient, detail)
            except Exception as send_exc:
                email_error_detail = str(send_exc)
                email_errors.append(f"{recipient}: {send_exc}")
                logger.error("Marketing form email error for %s: %s", recipient, send_exc, exc_info=True)
    except Exception as exc:
        email_error_detail = str(exc)
        logger.error("Marketing form email setup failed: %s", exc, exc_info=True)
        email_errors.append(str(exc))

    if row_id is None and not emailed_ok:
        raise HTTPException(
            status_code=500,
            detail="We could not save or email your submission. Please try again or email info@the-leadlab.com.",
        )

    if not emailed_ok:
        logger.warning(
            "Marketing form %s saved (id=%s) but email failed: %s",
            body.form_type,
            row_id,
            "; ".join(email_errors) or "unknown",
        )

    return {
        "msg": "Thank you — we received your submission and will be in touch soon.",
        "id": row_id,
        "emailed": emailed_ok,
        "email_error": email_error_detail if not emailed_ok else None,
    }
