"""In-app notification create helpers with user preference gates."""
from __future__ import annotations

import asyncio
import logging
import re
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


def _schedule_async(coro) -> None:
    """Fire-and-forget async work from sync request handlers."""

    def _runner() -> None:
        try:
            asyncio.run(coro)
        except Exception:
            logger.exception("Background notification email failed")

    threading.Thread(target=_runner, daemon=True).start()


def _absolute_app_url(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    try:
        from app.core.config import settings

        base = (settings.FRONTEND_URL or "https://the-leadlab.com").rstrip("/")
        return f"{base}{path if path.startswith('/') else '/' + path}"
    except Exception:
        return path


def _maybe_email_notification(
    db: Session,
    user_id: int,
    *,
    title: str,
    message: str,
    link: Optional[str],
    prefs: Dict[str, Any],
) -> None:
    """Send email copy when the user's email notification pref is on."""
    if not prefs.get("email", True):
        return
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not getattr(user, "email", None):
        return
    to_email = user.email
    name = (
        getattr(user, "full_name", None)
        or f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
        or None
    )
    action_url = _absolute_app_url(link)

    async def _send() -> None:
        from app.core.email import email_sender
        from app.core.user_language import get_user_language

        # Fresh session not available here; pass language default from prefs path
        lang = "en"
        try:
            # get_user_language needs a session; best-effort with a new one
            from app.db.session import SessionLocal

            with SessionLocal() as s:
                lang = get_user_language(s, int(user_id))
        except Exception:
            pass
        await email_sender.send_notification_alert(
            to_email=to_email,
            title=title,
            message=message,
            action_url=action_url,
            recipient_name=name,
            language=lang,
        )

    _schedule_async(_send())

# Pref keys stored in UserSettings.notification_preferences
DEFAULT_PREFS: Dict[str, bool] = {
    "email": True,
    "push": True,
    "leadAssigned": True,
    "dealUpdated": True,
    "taskDue": True,
    "taskAssigned": True,
    "meetingReminder": True,
    "systemUpdates": False,
    "messages": True,
    "mentions": True,
}

# Mention tokens: @email or @First Last (letters/hyphen/apostrophe)
_MENTION_EMAIL = re.compile(r"@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})")
_MENTION_NAME = re.compile(r"@([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*)?)")


def _user_notification_prefs(db: Session, user_id: int) -> Dict[str, Any]:
    try:
        from app.models.user_settings import UserSettings

        row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        if row is not None:
            return dict(row.notifications)
    except Exception as exc:
        logger.debug("Could not load notification prefs for user %s: %s", user_id, exc)
    return dict(DEFAULT_PREFS)


def _pref_allows(prefs: Dict[str, Any], pref_key: Optional[str]) -> bool:
    if not pref_key:
        return True
    if pref_key not in prefs:
        # Unknown key: allow if default says so, else allow
        return bool(DEFAULT_PREFS.get(pref_key, True))
    return bool(prefs.get(pref_key))


class NotificationService:
    @staticmethod
    def notify_user(
        db: Session,
        user_id: int,
        *,
        title: str,
        message: str,
        link: Optional[str] = None,
        notification_type: str = "info",
        priority: str = "medium",
        pref_key: Optional[str] = None,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ) -> Optional[Notification]:
        """
        Create an in-app notification for one user if prefs allow.
        Skips when user_id == actor_id. Uses commit=False to batch with parent txn.
        """
        if not user_id:
            return None
        if actor_id is not None and int(user_id) == int(actor_id):
            return None

        prefs = _user_notification_prefs(db, user_id)
        if not _pref_allows(prefs, pref_key):
            return None

        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            link=link,
            action_url=link,
            type=notification_type,
            priority=priority,
            is_read=False,
            created_at=datetime.utcnow(),
        )
        db.add(notification)
        if commit:
            try:
                db.commit()
                db.refresh(notification)
            except Exception:
                db.rollback()
                logger.exception("Failed to create notification for user %s", user_id)
                return None

        try:
            _maybe_email_notification(
                db,
                user_id,
                title=title,
                message=message,
                link=link,
                prefs=prefs,
            )
        except Exception:
            logger.exception("Failed to queue notification email for user %s", user_id)

        return notification

    @staticmethod
    def create_notification(
        db: Session,
        user_id: int,
        title: str,
        message: str,
        link: Optional[str] = None,
        notification_type: str = "info",
        priority: str = "medium",
        pref_key: Optional[str] = None,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ) -> Optional[Notification]:
        """Backward-compatible alias for notify_user."""
        return NotificationService.notify_user(
            db,
            user_id,
            title=title,
            message=message,
            link=link,
            notification_type=notification_type,
            priority=priority,
            pref_key=pref_key,
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def create_notification_for_organization(
        db: Session,
        organization_id: int,
        title: str,
        message: str,
        link: Optional[str] = None,
        notification_type: str = "info",
        priority: str = "medium",
        exclude_user_id: Optional[int] = None,
        pref_key: Optional[str] = "systemUpdates",
    ) -> List[Notification]:
        users_query = db.query(User).filter(
            User.organization_id == organization_id,
            User.is_active == True,  # noqa: E712
        )
        if exclude_user_id:
            users_query = users_query.filter(User.id != exclude_user_id)

        notifications: List[Notification] = []
        for user in users_query.all():
            n = NotificationService.notify_user(
                db,
                user.id,
                title=title,
                message=message,
                link=link,
                notification_type=notification_type,
                priority=priority,
                pref_key=pref_key,
                actor_id=exclude_user_id,
                commit=False,
            )
            if n:
                notifications.append(n)
        if notifications:
            try:
                db.commit()
                for n in notifications:
                    db.refresh(n)
            except Exception:
                db.rollback()
                logger.exception("Failed org notifications for org %s", organization_id)
                return []
        return notifications

    @staticmethod
    def create_admin_notification(
        db: Session,
        title: str,
        message: str,
        link: Optional[str] = None,
        notification_type: str = "info",
        priority: str = "medium",
    ) -> List[Notification]:
        admin_users = (
            db.query(User)
            .filter(User.role == "admin", User.is_active == True)  # noqa: E712
            .all()
        )
        notifications: List[Notification] = []
        for admin in admin_users:
            n = NotificationService.notify_user(
                db,
                admin.id,
                title=title,
                message=message,
                link=link,
                notification_type=notification_type,
                priority=priority,
                pref_key=None,
                commit=False,
            )
            if n:
                notifications.append(n)
        if notifications:
            try:
                db.commit()
            except Exception:
                db.rollback()
                return []
        return notifications

    @staticmethod
    def notify_lead_assignment(
        db: Session,
        assigned_user_id: int,
        lead_name: str,
        lead_id: int,
        assigned_by_user_name: str,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ):
        return NotificationService.notify_user(
            db,
            assigned_user_id,
            title="New Lead Assigned",
            message=f"You have been assigned a new lead: {lead_name} by {assigned_by_user_name}",
            link=f"/leads/{lead_id}",
            notification_type="info",
            priority="medium",
            pref_key="leadAssigned",
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def notify_task_assignment(
        db: Session,
        assigned_user_id: int,
        task_title: str,
        task_id: int,
        assigned_by_user_name: str,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ):
        return NotificationService.notify_user(
            db,
            assigned_user_id,
            title="Task assigned to you",
            message=f"{assigned_by_user_name} assigned you: {task_title}",
            link=f"/tasks/{task_id}",
            notification_type="info",
            priority="medium",
            pref_key="taskAssigned",
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def notify_deal_update(
        db: Session,
        user_id: int,
        deal_name: str,
        deal_id: int,
        summary: str,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ):
        return NotificationService.notify_user(
            db,
            user_id,
            title="Deal updated",
            message=f"{deal_name}: {summary}",
            link=f"/deals/{deal_id}",
            notification_type="info",
            priority="medium",
            pref_key="dealUpdated",
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def notify_new_message(
        db: Session,
        receiver_id: int,
        sender_name: str,
        preview: str,
        actor_id: Optional[int] = None,
        commit: bool = True,
    ):
        snippet = (preview or "").strip().replace("\n", " ")
        if len(snippet) > 120:
            snippet = snippet[:117] + "…"
        return NotificationService.notify_user(
            db,
            receiver_id,
            title="New message",
            message=f"{sender_name}: {snippet}" if snippet else f"New message from {sender_name}",
            link="/messages",
            notification_type="info",
            priority="medium",
            pref_key="messages",
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def notify_mention(
        db: Session,
        user_id: int,
        actor_name: str,
        context: str,
        link: str = "/messages",
        actor_id: Optional[int] = None,
        commit: bool = True,
    ):
        return NotificationService.notify_user(
            db,
            user_id,
            title="You were mentioned",
            message=f"{actor_name} mentioned you: {context[:100]}",
            link=link,
            notification_type="info",
            priority="high",
            pref_key="mentions",
            actor_id=actor_id,
            commit=commit,
        )

    @staticmethod
    def notify_team_invitation(
        db: Session,
        invited_user_id: int,
        organization_name: str,
        invited_by_name: str,
        actor_id: Optional[int] = None,
    ):
        return NotificationService.notify_user(
            db,
            invited_user_id,
            title="Team Invitation",
            message=f"You have been invited to join {organization_name} by {invited_by_name}",
            link="/team-management",
            notification_type="info",
            priority="high",
            pref_key=None,  # always notify invitees
            actor_id=actor_id,
        )

    @staticmethod
    def notify_new_user_registration(
        db: Session,
        new_user_name: str,
        new_user_email: str,
        organization_id: int,
    ):
        managers = (
            db.query(User)
            .filter(
                User.organization_id == organization_id,
                or_(User.role == "manager", User.role == "admin"),
            )
            .all()
        )
        notifications: List[Notification] = []
        for manager in managers:
            n = NotificationService.notify_user(
                db,
                manager.id,
                title="New User Registration",
                message=f"New user {new_user_name} ({new_user_email}) has registered",
                link="/team-management",
                notification_type="info",
                priority="medium",
                pref_key="systemUpdates",
                commit=False,
            )
            if n:
                notifications.append(n)
        if notifications:
            try:
                db.commit()
            except Exception:
                db.rollback()
                return []
        return notifications

    @staticmethod
    def resolve_mention_user_ids(
        db: Session,
        *,
        organization_id: int,
        text: str,
        exclude_user_id: Optional[int] = None,
    ) -> Set[int]:
        """Resolve @email / @First Last tokens to active org user ids."""
        if not text or not organization_id:
            return set()

        emails = {m.group(1).lower() for m in _MENTION_EMAIL.finditer(text)}
        # Strip email mentions before name scan to avoid double-matching
        scrubbed = _MENTION_EMAIL.sub(" ", text)
        names = []
        for m in _MENTION_NAME.finditer(scrubbed):
            token = m.group(1).strip()
            if "@" in token:
                continue
            if len(token) < 2:
                continue
            names.append(token.lower())

        users = (
            db.query(User)
            .filter(
                User.organization_id == organization_id,
                User.is_active == True,  # noqa: E712
            )
            .all()
        )
        found: Set[int] = set()
        for u in users:
            if exclude_user_id is not None and int(u.id) == int(exclude_user_id):
                continue
            email = (u.email or "").lower()
            if email and email in emails:
                found.add(int(u.id))
                continue
            full = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip().lower()
            first = (u.first_name or "").strip().lower()
            for name in names:
                if name == full or name == first:
                    found.add(int(u.id))
                    break
        return found

    @staticmethod
    def unread_count(db: Session, user_id: int) -> int:
        return (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
            .count()
        )
