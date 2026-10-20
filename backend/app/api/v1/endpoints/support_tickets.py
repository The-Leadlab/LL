"""Public issue reports (formerly support tickets) — anyone with the link can submit."""
from __future__ import annotations

import html
import logging
import os
import uuid
from typing import Any, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session, defer

from app import crud, schemas
from app.api import deps
from app.core.config import settings
from app.core.email import email_sender
from app.core.support_ticket_schema import ensure_support_tickets_schema
from app.models.support_ticket import SupportTicket
from app.models.support_ticket_attachment import SupportTicketAttachment
from app.models.user import User as UserModel
from app.schemas.support_ticket import (
    SupportTicketAttachmentOut,
    SupportTicketCreate,
    SupportTicketList,
    SupportTicketOut,
    SupportTicketUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(redirect_slashes=False)

_optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)

# Dev admins who always get ticket email notifications.
DEV_ADMIN_EMAILS = frozenset({"ali@the-leadlab.com"})
ALLOWED_STATUSES = frozenset({"open", "in_progress", "resolved", "closed"})
ALLOWED_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})

# Screenshots, images, videos, and common docs.
MAX_REPORT_ATTACHMENT_BYTES = 50 * 1024 * 1024  # 50 MB per file
MAX_REPORT_ATTACHMENTS = 5
# Keep email payloads under typical provider limits (Resend/Gmail).
MAX_EMAIL_ATTACHMENT_BYTES = 12 * 1024 * 1024
ALLOWED_ATTACHMENT_PREFIXES = (
    "image/",
    "video/",
)
ALLOWED_ATTACHMENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "application/zip",
        "application/octet-stream",
    }
)


async def get_optional_user(
    request: Request,
    db: Session = Depends(deps.get_db),
    token: Optional[str] = Depends(_optional_oauth2),
) -> Optional[UserModel]:
    """Return the current user when a valid Bearer token is present; otherwise None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_data = schemas.TokenPayload(**payload)
        if token_data.sub is None:
            return None
        user = crud.user.get(db, id=int(token_data.sub))
        if not user or not getattr(user, "is_active", False):
            return None
        return user
    except (JWTError, ValidationError, ValueError, TypeError):
        return None


def _dev_admin_recipients() -> List[str]:
    extra = (getattr(settings, "DEV_ADMIN_EMAILS", None) or "").strip()
    emails = set(DEV_ADMIN_EMAILS)
    if extra:
        for part in extra.split(","):
            cleaned = part.strip().lower()
            if cleaned and "@" in cleaned:
                emails.add(cleaned)
    return sorted(emails)


def _ensure_tables(db: Session) -> None:
    ensure_support_tickets_schema(db.get_bind())


def _attachment_allowed(content_type: Optional[str], filename: str) -> bool:
    ctype = (content_type or "application/octet-stream").lower().split(";")[0].strip()
    if any(ctype.startswith(prefix) for prefix in ALLOWED_ATTACHMENT_PREFIXES):
        return True
    if ctype in ALLOWED_ATTACHMENT_TYPES:
        return True
    # Screenshots / phone videos sometimes arrive without a useful MIME type.
    ext = os.path.splitext(filename or "")[1].lower()
    return ext in {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".heic",
        ".mp4",
        ".mov",
        ".webm",
        ".mkv",
        ".pdf",
        ".txt",
        ".zip",
        ".doc",
        ".docx",
    }


def _row_to_attachment(row: SupportTicketAttachment) -> SupportTicketAttachmentOut:
    return SupportTicketAttachmentOut(
        id=int(row.id),
        filename=row.filename,
        stored_name=row.stored_name,
        content_type=row.content_type,
        size_bytes=int(row.size_bytes or 0),
        uploaded_at=row.uploaded_at,
    )


def _ticket_to_out(ticket: SupportTicket, attachments: Optional[List[SupportTicketAttachment]] = None) -> SupportTicketOut:
    att_rows = attachments
    if att_rows is None:
        att_rows = []
    return SupportTicketOut(
        id=ticket.id,
        reporter_name=ticket.reporter_name,
        reporter_email=ticket.reporter_email,
        project_name=ticket.project_name,
        subject=ticket.subject,
        description=ticket.description,
        status=ticket.status,
        priority=ticket.priority,
        organization_id=ticket.organization_id,
        reporter_user_id=ticket.reporter_user_id,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        attachments=[_row_to_attachment(r) for r in att_rows],
    )


def _list_attachments(db: Session, ticket_id: int) -> List[SupportTicketAttachment]:
    _ensure_tables(db)
    return (
        db.query(SupportTicketAttachment)
        .options(defer(SupportTicketAttachment.blob))
        .filter(SupportTicketAttachment.ticket_id == ticket_id)
        .order_by(SupportTicketAttachment.uploaded_at.asc())
        .all()
    )


def _ticket_email_html(snapshot: dict) -> str:
    attached = snapshot.get("email_attachment_names") or []
    skipped = snapshot.get("skipped_attachment_names") or []
    parts: List[str] = []
    if attached:
        file_bits = "".join(f"<li>{html.escape(name)}</li>" for name in attached)
        parts.append(
            "<p><strong>Attachments included in this email:</strong></p>"
            f"<ul>{file_bits}</ul>"
            "<p>Open the attached files in your mail client to view screenshots/videos.</p>"
        )
    if skipped:
        skip_bits = "".join(f"<li>{html.escape(name)}</li>" for name in skipped)
        parts.append(
            "<p><strong>Too large to attach by email</strong> "
            f"(over {MAX_EMAIL_ATTACHMENT_BYTES // (1024 * 1024)} MB) — "
            "download them in Admin → Issue reports:</p>"
            f"<ul>{skip_bits}</ul>"
        )
    if not parts:
        parts.append("<p><em>No attachments</em></p>")
    files_html = "".join(parts)
    return f"""
    <h2>New issue report #{snapshot['id']}</h2>
    <p><strong>Project:</strong> {html.escape(snapshot['project_name'])}</p>
    <p><strong>Subject:</strong> {html.escape(snapshot['subject'])}</p>
    <p><strong>Priority:</strong> {html.escape(snapshot['priority'])}</p>
    <p><strong>From:</strong> {html.escape(snapshot['reporter_name'])}
       (&lt;{html.escape(snapshot['reporter_email'])}&gt;)</p>
    <p><strong>Description:</strong></p>
    <p>{html.escape(snapshot['description']).replace(chr(10), '<br/>')}</p>
    {files_html}
    <p style="color:#64748b;font-size:12px;">
      You can also open Admin → Issue reports in LeadLab to update status or re-download files.
    </p>
    """


async def _notify_dev_admins(snapshot: dict) -> None:
    subject = (
        f"[LeadLab Report #{snapshot['id']}] "
        f"{snapshot['project_name']}: {snapshot['subject']}"
    )
    body = _ticket_email_html(snapshot)
    email_files = snapshot.get("email_attachments") or []
    for to_email in _dev_admin_recipients():
        try:
            await email_sender.send_email(
                to_email=to_email,
                subject=subject,
                html_content=body,
                attachments=email_files or None,
            )
        except Exception:
            logger.exception(
                "Failed to email report %s to %s", snapshot.get("id"), to_email
            )


def _create_ticket(
    db: Session,
    data: SupportTicketCreate,
    *,
    current_user: Optional[UserModel] = None,
) -> SupportTicket:
    priority = (data.priority or "normal").strip().lower()
    if priority not in ALLOWED_PRIORITIES:
        priority = "normal"
    ticket = SupportTicket(
        reporter_name=data.reporter_name.strip(),
        reporter_email=str(data.reporter_email).strip().lower(),
        project_name=data.project_name.strip(),
        subject=data.subject.strip(),
        description=data.description.strip(),
        status="open",
        priority=priority,
        organization_id=int(current_user.organization_id)
        if current_user and current_user.organization_id
        else None,
        reporter_user_id=int(current_user.id) if current_user else None,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


async def _save_uploads(
    db: Session,
    ticket_id: int,
    files: List[UploadFile],
) -> List[SupportTicketAttachment]:
    if not files:
        return []
    usable = [f for f in files if f is not None and (f.filename or "").strip()]
    if len(usable) > MAX_REPORT_ATTACHMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_REPORT_ATTACHMENTS} attachments are allowed",
        )
    _ensure_tables(db)
    saved: List[SupportTicketAttachment] = []
    for upload in usable:
        content = await upload.read()
        if len(content) == 0:
            continue
        if len(content) > MAX_REPORT_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Attachment '{upload.filename}' exceeds "
                    f"{MAX_REPORT_ATTACHMENT_BYTES // (1024 * 1024)} MB"
                ),
            )
        safe_name = os.path.basename(upload.filename or "attachment")
        ctype = upload.content_type or "application/octet-stream"
        if not _attachment_allowed(ctype, safe_name):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File type not allowed for '{safe_name}'. "
                    "Use images, screenshots, videos, PDF, or common documents."
                ),
            )
        stored_name = f"{uuid.uuid4().hex}_{safe_name}"
        row = SupportTicketAttachment(
            ticket_id=ticket_id,
            filename=safe_name,
            stored_name=stored_name,
            content_type=ctype,
            size_bytes=len(content),
            blob=content,
        )
        db.add(row)
        saved.append(row)
    if saved:
        db.commit()
        for row in saved:
            db.refresh(row)
    return saved


def _schedule_notify(
    background_tasks: BackgroundTasks,
    ticket: SupportTicket,
    attachments: List[SupportTicketAttachment],
) -> None:
    email_attachments: List[dict] = []
    email_attachment_names: List[str] = []
    skipped_attachment_names: List[str] = []
    for row in attachments:
        raw = bytes(row.blob or b"")
        name = row.filename or "attachment"
        if not raw:
            continue
        if len(raw) > MAX_EMAIL_ATTACHMENT_BYTES:
            skipped_attachment_names.append(f"{name} ({int(row.size_bytes or 0)} bytes)")
            continue
        email_attachments.append(
            {
                "filename": name,
                "content": raw,
                "content_type": row.content_type or "application/octet-stream",
            }
        )
        email_attachment_names.append(name)

    snapshot = {
        "id": ticket.id,
        "project_name": ticket.project_name,
        "subject": ticket.subject,
        "priority": ticket.priority,
        "reporter_name": ticket.reporter_name,
        "reporter_email": ticket.reporter_email,
        "description": ticket.description,
        "email_attachments": email_attachments,
        "email_attachment_names": email_attachment_names,
        "skipped_attachment_names": skipped_attachment_names,
    }
    background_tasks.add_task(_notify_dev_admins, snapshot)


@router.post("", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Optional[UserModel] = Depends(get_optional_user),
) -> Any:
    """
    Create an issue report (public — no login required).
    Accepts JSON or multipart/form-data with optional file uploads
    (screenshots, images, videos).
    """
    content_type = (request.headers.get("content-type") or "").lower()
    uploads: List[UploadFile] = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        reporter_name = str(form.get("reporter_name") or "").strip()
        reporter_email = str(form.get("reporter_email") or "").strip()
        project_name = str(form.get("project_name") or "").strip()
        subject = str(form.get("subject") or "").strip()
        description = str(form.get("description") or "").strip()
        priority = str(form.get("priority") or "normal").strip()

        raw_files = form.getlist("files") or form.getlist("file") or []
        for item in raw_files:
            if hasattr(item, "read") and getattr(item, "filename", None):
                uploads.append(item)  # type: ignore[arg-type]

        if current_user is not None:
            name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            reporter_name = reporter_name or name or "LeadLab user"
            reporter_email = reporter_email or (current_user.email or "")

        try:
            ticket_in = SupportTicketCreate(
                reporter_name=reporter_name,
                reporter_email=reporter_email,  # type: ignore[arg-type]
                project_name=project_name,
                subject=subject,
                description=description,
                priority=priority,
            )
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc
    else:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Expected JSON or multipart form") from exc
        try:
            ticket_in = SupportTicketCreate(**body)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc
        if current_user is not None:
            name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            ticket_in = SupportTicketCreate(
                reporter_name=ticket_in.reporter_name or name or "LeadLab user",
                reporter_email=ticket_in.reporter_email or current_user.email,
                project_name=ticket_in.project_name,
                subject=ticket_in.subject,
                description=ticket_in.description,
                priority=ticket_in.priority,
            )

    _ensure_tables(db)
    ticket = _create_ticket(db, ticket_in, current_user=current_user)
    try:
        attachments = await _save_uploads(db, ticket.id, uploads)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to store report attachments for ticket %s", ticket.id)
        raise HTTPException(
            status_code=503,
            detail=f"Could not store attachments: {type(exc).__name__}: {exc}",
        ) from exc

    _schedule_notify(background_tasks, ticket, attachments)
    return _ticket_to_out(ticket, attachments)


@router.get("", response_model=SupportTicketList)
@router.get("/", response_model=SupportTicketList)
def list_support_tickets(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
) -> Any:
    q = db.query(SupportTicket)
    if status_filter:
        q = q.filter(SupportTicket.status == status_filter.strip().lower())
    total = q.count()
    items = (
        q.order_by(SupportTicket.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    out_items = []
    for ticket in items:
        out_items.append(_ticket_to_out(ticket, _list_attachments(db, ticket.id)))
    return SupportTicketList(items=out_items, total=total)


@router.get("/{ticket_id}/attachments/{stored_name}")
def download_ticket_attachment(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    ticket_id: int,
    stored_name: str,
) -> Response:
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    _ensure_tables(db)
    row = (
        db.query(SupportTicketAttachment)
        .filter(
            SupportTicketAttachment.ticket_id == ticket_id,
            SupportTicketAttachment.stored_name == stored_name,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    headers = {
        "Content-Disposition": f'attachment; filename="{row.filename or stored_name}"'
    }
    return Response(
        content=bytes(row.blob or b""),
        media_type=row.content_type or "application/octet-stream",
        headers=headers,
    )


@router.patch("/{ticket_id}", response_model=SupportTicketOut)
def update_support_ticket(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    ticket_id: int,
    ticket_in: SupportTicketUpdate,
) -> Any:
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket_in.status is not None:
        status_value = ticket_in.status.strip().lower()
        if status_value not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        ticket.status = status_value
    if ticket_in.priority is not None:
        priority = ticket_in.priority.strip().lower()
        if priority not in ALLOWED_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        ticket.priority = priority
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return _ticket_to_out(ticket, _list_attachments(db, ticket.id))
