"""Notify teammates when they are assigned / mentioned on a task or lead."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.email import email_sender
from app.crud import crud_user
from app.models.user import User

logger = logging.getLogger(__name__)


def _display_name(user: Optional[User]) -> str:
    if not user:
        return "A teammate"
    parts = [getattr(user, "first_name", None) or "", getattr(user, "last_name", None) or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or (getattr(user, "email", None) or "A teammate")


def schedule_assignment_mention(
    background_tasks: BackgroundTasks,
    *,
    db: Session,
    assignee_id: Optional[int],
    mentioner: User,
    entity_type: str,
    entity_id: int,
    entity_title: str,
    organization_name: Optional[str] = None,
) -> None:
    """Queue a confirmation email when someone is tagged on a task/lead.

    Skips self-assignment and missing/invalid assignees. Failures are logged
    and never block the API response.
    """
    if not assignee_id:
        return
    try:
        if int(assignee_id) == int(mentioner.id):
            return
    except (TypeError, ValueError):
        return

    assignee = crud_user.user.get(db, id=assignee_id)
    if not assignee or not getattr(assignee, "email", None):
        return
    if int(assignee.organization_id) != int(mentioner.organization_id):
        logger.warning(
            "Skipping mention email: assignee %s not in mentioner org %s",
            assignee_id,
            mentioner.organization_id,
        )
        return

    base = (settings.FRONTEND_URL or "https://the-leadlab.com").rstrip("/")
    entity = (entity_type or "item").lower()
    if entity == "task":
        path = f"/tasks/{entity_id}"
    elif entity == "lead":
        path = f"/leads/{entity_id}"
    else:
        path = f"/{entity}s/{entity_id}"
    entity_url = f"{base}{path}"

    async def _send() -> None:
        try:
            from app.core.user_language import get_user_language

            assignee_lang = get_user_language(db, int(assignee.id))
            sent = await email_sender.send_assignment_mention(
                to_email=assignee.email,
                recipient_name=_display_name(assignee),
                mentioner_name=_display_name(mentioner),
                entity_type=entity,
                entity_title=entity_title or f"Untitled {entity}",
                entity_url=entity_url,
                organization_name=organization_name,
                language=assignee_lang,
            )
            if not sent:
                logger.warning(
                    "Assignment mention email returned false for %s on %s %s",
                    assignee.email,
                    entity,
                    entity_id,
                )
        except Exception:
            logger.exception(
                "Failed to send assignment mention email to %s for %s %s",
                assignee.email,
                entity,
                entity_id,
            )

    background_tasks.add_task(_send)
