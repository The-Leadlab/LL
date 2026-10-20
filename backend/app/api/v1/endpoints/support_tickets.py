"""Support / error ticketing for client projects."""
from __future__ import annotations

import html
import logging
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import crud, schemas
from app.api import deps
from app.core.config import settings
from app.core.email import email_sender
from app.models.support_ticket import SupportTicket
from app.models.user import User as UserModel
from app.schemas.support_ticket import (
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

# Dev admins who always get ticket email notifications.
DEV_ADMIN_EMAILS = frozenset({"ali@the-leadlab.com"})
ALLOWED_STATUSES = frozenset({"open", "in_progress", "resolved", "closed"})
ALLOWED_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})


def _dev_admin_recipients() -> List[str]:
    extra = (getattr(settings, "DEV_ADMIN_EMAILS", None) or "").strip()
    emails = set(DEV_ADMIN_EMAILS)
    if extra:
        for part in extra.split(","):
            cleaned = part.strip().lower()
            if cleaned and "@" in cleaned:
                emails.add(cleaned)
    return sorted(emails)


def _ticket_email_html(snapshot: dict) -> str:
    return f"""
    <h2>New support ticket #{snapshot['id']}</h2>
    <p><strong>Project:</strong> {html.escape(snapshot['project_name'])}</p>
    <p><strong>Subject:</strong> {html.escape(snapshot['subject'])}</p>
    <p><strong>Priority:</strong> {html.escape(snapshot['priority'])}</p>
    <p><strong>From:</strong> {html.escape(snapshot['reporter_name'])}
       (&lt;{html.escape(snapshot['reporter_email'])}&gt;)</p>
    <p><strong>Description:</strong></p>
    <p>{html.escape(snapshot['description']).replace(chr(10), '<br/>')}</p>
    <p style="color:#64748b;font-size:12px;">
      Open Admin → Support tickets in LeadLab to update status.
    </p>
    """


async def _notify_dev_admins(snapshot: dict) -> None:
    subject = (
        f"[LeadLab Ticket #{snapshot['id']}] "
        f"{snapshot['project_name']}: {snapshot['subject']}"
    )
    body = _ticket_email_html(snapshot)
    for to_email in _dev_admin_recipients():
        try:
            await email_sender.send_email(
                to_email=to_email,
                subject=subject,
                html_content=body,
            )
        except Exception:
            logger.exception(
                "Failed to email ticket %s to %s", snapshot.get("id"), to_email
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


@router.post("", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    ticket_in: SupportTicketCreate,
    current_user: Optional[UserModel] = Depends(get_optional_user),
) -> Any:
    """
    Create a support / error ticket.
    Works for signed-in users and public reporters.
    Always emails ali@the-leadlab.com (dev admin).
    """
    # Prefer authenticated identity when present
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
    ticket = _create_ticket(db, ticket_in, current_user=current_user)
    snapshot = {
        "id": ticket.id,
        "project_name": ticket.project_name,
        "subject": ticket.subject,
        "priority": ticket.priority,
        "reporter_name": ticket.reporter_name,
        "reporter_email": ticket.reporter_email,
        "description": ticket.description,
    }
    background_tasks.add_task(_notify_dev_admins, snapshot)
    return ticket


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
    return SupportTicketList(items=items, total=total)


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
    return ticket
