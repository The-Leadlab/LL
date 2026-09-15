"""Per-user CRM workspaces. Team membership is the only way to share leads/clients."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.email_account import EmailAccount
from app.models.team_invitation import TeamInvitation
from app.models.user import User

logger = logging.getLogger(__name__)

PROTECTED_WORKSPACE_EMAILS = frozenset({"ali@the-leadlab.com"})
PERSONAL_ORG_SENTINEL = 0


def _is_tombstone_email(email: Optional[str]) -> bool:
    value = (email or "").strip().lower()
    return value.endswith("@deleted.local") or value.startswith("deleted+user-")


def _normalized_email(email: Optional[str]) -> str:
    return (email or "").strip().lower()


def is_protected_workspace_user(user: User) -> bool:
    return _normalized_email(getattr(user, "email", None)) in PROTECTED_WORKSPACE_EMAILS


def provision_personal_organization(
    db: Session,
    *,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
    company: Optional[str] = None,
) -> object:
    from app.crud.organization import organization as crud_organization
    from app.crud.crud_client import client as crud_client

    label = (company or "").strip()
    if not label:
        full = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
        label = f"{full}'s workspace" if full else f"{(email or 'user').split('@')[0]} workspace"
    org = crud_organization.create_with_owner(db, name=label)
    crud_client.ensure_general(db, organization_id=int(org.id))
    return org


def record_team_membership(
    db: Session,
    *,
    user: User,
    organization_id: int,
    invited_by_id: Optional[int] = None,
) -> None:
    """Persist that this user joined an org as a teammate so they are not auto-split."""
    email = _normalized_email(user.email)
    if not email or not organization_id:
        return
    existing = (
        db.query(TeamInvitation)
        .filter(
            func.lower(TeamInvitation.email) == email,
            TeamInvitation.organization_id == organization_id,
            TeamInvitation.status == "accepted",
        )
        .first()
    )
    if existing:
        return
    now = datetime.utcnow()
    invitation = TeamInvitation(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role="member",
        invitation_token=secrets.token_urlsafe(24),
        status="accepted",
        organization_id=organization_id,
        invited_by_id=invited_by_id or user.id,
        expires_at=now + timedelta(days=3650),
        accepted_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(invitation)
    db.commit()


def has_team_membership(db: Session, user: User) -> bool:
    email = _normalized_email(user.email)
    if not email or not user.organization_id:
        return False
    row = (
        db.query(TeamInvitation.id)
        .filter(
            func.lower(TeamInvitation.email) == email,
            TeamInvitation.organization_id == user.organization_id,
            TeamInvitation.status == "accepted",
        )
        .first()
    )
    return row is not None


def is_org_founder(db: Session, user: User) -> bool:
    if not user.organization_id:
        return False
    founder = (
        db.query(User)
        .filter(
            User.organization_id == user.organization_id,
            User.is_active == True,  # noqa: E712
            ~func.lower(User.email).like("%@deleted.local"),
            ~func.lower(User.email).like("deleted+user-%"),
        )
        .order_by(User.created_at.asc(), User.id.asc())
        .first()
    )
    return bool(founder and founder.id == user.id)


def _active_org_peer_ids(db: Session, user: User) -> list[int]:
    rows = (
        db.query(User.id)
        .filter(
            User.organization_id == user.organization_id,
            User.id != user.id,
            User.is_active == True,  # noqa: E712
            ~func.lower(User.email).like("%@deleted.local"),
            ~func.lower(User.email).like("deleted+user-%"),
        )
        .limit(2)
        .all()
    )
    return [int(r[0]) for r in rows]


def user_should_keep_shared_org(db: Session, user: User) -> bool:
    if is_protected_workspace_user(user):
        return True
    if not user.organization_id:
        return False
    if not _active_org_peer_ids(db, user):
        return True
    if is_org_founder(db, user):
        return True
    if has_team_membership(db, user):
        return True
    return False


def move_user_to_personal_workspace(db: Session, user: User) -> User:
    previous_org = user.organization_id
    org = provision_personal_organization(
        db,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
    )
    user.organization_id = org.id
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.query(EmailAccount).filter(EmailAccount.user_id == user.id).update(
        {"organization_id": org.id},
        synchronize_session=False,
    )
    db.commit()
    db.refresh(user)
    logger.info(
        "Moved user %s from org %s to personal workspace %s",
        user.id,
        previous_org,
        org.id,
    )
    return user


def ensure_personal_workspace_if_needed(db: Session, user: User) -> User:
    """
    New / misplaced accounts must not inherit another user's leads and clients.
    Founders and accepted teammates stay on the shared org.
    """
    try:
        if _is_tombstone_email(getattr(user, "email", None)):
            return user
        if user_should_keep_shared_org(db, user):
            return user
        return move_user_to_personal_workspace(db, user)
    except Exception:
        logger.exception("Workspace isolation failed for user %s", getattr(user, "id", None))
        db.rollback()
        return user
