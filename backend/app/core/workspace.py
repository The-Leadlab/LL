"""Per-user CRM workspaces. Team membership is the only way to share leads/clients."""
from __future__ import annotations

import logging
import re
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
# Prefer this mailbox as the canonical home for @the-leadlab.com teammates.
PREFERRED_DOMAIN_OWNERS = {
    "the-leadlab.com": "ali@the-leadlab.com",
}
# Consumer / free-mail domains never auto-share a workspace.
CONSUMER_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.co.uk",
        "hotmail.com",
        "outlook.com",
        "live.com",
        "msn.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "gmx.com",
        "gmx.net",
        "mail.com",
        "yandex.com",
        "yandex.ru",
        "zoho.com",
        "fastmail.com",
        "hey.com",
        "pm.me",
        "mailinator.com",
        "deleted.local",
    }
)
PERSONAL_ORG_SENTINEL = 0
MOVED_USER_LOG_RE = re.compile(
    r"Moved user (\d+) from org (\d+) to personal workspace (\d+)",
    re.IGNORECASE,
)


def parse_moved_user_log_lines(text: str) -> list[tuple[int, int, int]]:
    """Parse isolation log lines into (user_id, from_org, to_org) tuples."""
    return [
        (int(user_id), int(from_org), int(to_org))
        for user_id, from_org, to_org in MOVED_USER_LOG_RE.findall(text or "")
    ]


def _is_tombstone_email(email: Optional[str]) -> bool:
    value = (email or "").strip().lower()
    return value.endswith("@deleted.local") or value.startswith("deleted+user-")


def _normalized_email(email: Optional[str]) -> str:
    return (email or "").strip().lower()


def email_domain(email: Optional[str]) -> Optional[str]:
    value = _normalized_email(email)
    if "@" not in value:
        return None
    domain = value.rsplit("@", 1)[-1].strip().lower()
    return domain or None


def is_shared_business_domain(domain: Optional[str]) -> bool:
    """True for company domains that should share one LeadLab organization."""
    if not domain:
        return False
    if domain in CONSUMER_EMAIL_DOMAINS:
        return False
    # Reject obvious disposable / single-label hosts
    if "." not in domain:
        return False
    return True


def is_protected_workspace_user(user: User) -> bool:
    return _normalized_email(getattr(user, "email", None)) in PROTECTED_WORKSPACE_EMAILS


def find_organization_id_for_business_domain(
    db: Session,
    email: Optional[str],
    *,
    exclude_user_id: Optional[int] = None,
) -> Optional[int]:
    """
    If this email uses a shared business domain (e.g. @the-leadlab.com,
    @deluxepad.com), return the existing org that domain peers already use.
    Prefers a configured domain owner (Ali for LeadLab) when present.
    """
    domain = email_domain(email)
    if not is_shared_business_domain(domain):
        return None
    assert domain is not None

    preferred_owner = PREFERRED_DOMAIN_OWNERS.get(domain)
    if preferred_owner:
        owner = (
            db.query(User)
            .filter(
                func.lower(User.email) == preferred_owner,
                User.is_active == True,  # noqa: E712
            )
            .first()
        )
        if owner and owner.organization_id:
            return int(owner.organization_id)

    query = (
        db.query(User)
        .filter(
            func.lower(User.email).like(f"%@{domain}"),
            User.is_active == True,  # noqa: E712
            User.organization_id.isnot(None),
            ~func.lower(User.email).like("%@deleted.local"),
            ~func.lower(User.email).like("deleted+user-%"),
        )
        .order_by(User.created_at.asc(), User.id.asc())
    )
    if exclude_user_id is not None:
        query = query.filter(User.id != int(exclude_user_id))
    peer = query.first()
    if peer and peer.organization_id:
        return int(peer.organization_id)
    return None


def resolve_registration_organization_id(
    db: Session,
    *,
    email: Optional[str],
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    company: Optional[str] = None,
) -> tuple[int, bool]:
    """
    Pick org for a new signup.
    Returns (organization_id, joined_existing_team).
    Same business-email domain → join that company's existing org.
    """
    existing = find_organization_id_for_business_domain(db, email)
    if existing:
        return existing, True
    org = provision_personal_organization(
        db,
        first_name=first_name,
        last_name=last_name,
        email=email,
        company=company,
    )
    return int(org.id), False


def ensure_business_domain_workspace(db: Session, user: User) -> User:
    """
    On login: if the user has a company email and peers already share an org,
    move them into that org and record membership so isolation won't split them.
    """
    try:
        if _is_tombstone_email(getattr(user, "email", None)):
            return user
        if is_protected_workspace_user(user):
            return user
        target_org = find_organization_id_for_business_domain(
            db, user.email, exclude_user_id=int(user.id) if user.id else None
        )
        if not target_org:
            return user
        current = int(user.organization_id) if user.organization_id else None
        if current == target_org:
            if not has_team_membership(db, user):
                record_team_membership(
                    db,
                    user=user,
                    organization_id=target_org,
                    invited_by_id=int(user.id),
                )
            return user

        previous = current
        user.organization_id = target_org
        user.updated_at = datetime.utcnow()
        db.add(user)
        db.query(EmailAccount).filter(EmailAccount.user_id == user.id).update(
            {"organization_id": target_org},
            synchronize_session=False,
        )
        db.commit()
        db.refresh(user)
        record_team_membership(
            db,
            user=user,
            organization_id=target_org,
            invited_by_id=int(user.id),
        )
        logger.info(
            "Joined user %s (%s) from org %s into business-domain org %s",
            user.id,
            _normalized_email(user.email),
            previous,
            target_org,
        )
        return user
    except Exception:
        logger.exception(
            "Business-domain workspace join failed for user %s",
            getattr(user, "id", None),
        )
        db.rollback()
        return user


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


def user_has_shared_org_work(db: Session, user: User) -> bool:
    """True if the user already has tasks, leads, or activity in their current org."""
    if not user.organization_id or not user.id:
        return False
    org_id = int(user.organization_id)
    user_id = int(user.id)
    from app.models.activity import Activity
    from app.models.lead import Lead
    from app.models.task import Task

    if (
        db.query(Task.id)
        .filter(Task.assigned_to_id == user_id, Task.organization_id == org_id)
        .first()
    ):
        return True
    if (
        db.query(Lead.id)
        .filter(Lead.user_id == user_id, Lead.organization_id == org_id)
        .first()
    ):
        return True
    if (
        db.query(Activity.id)
        .filter(Activity.user_id == user_id, Activity.organization_id == org_id)
        .first()
    ):
        return True
    return False


def _org_has_same_business_domain_peer(db: Session, user: User) -> bool:
    """Keep shared org when another active teammate shares the company email domain."""
    domain = email_domain(getattr(user, "email", None))
    if not is_shared_business_domain(domain) or not user.organization_id:
        return False
    assert domain is not None
    peer = (
        db.query(User.id)
        .filter(
            User.organization_id == user.organization_id,
            User.id != user.id,
            User.is_active == True,  # noqa: E712
            func.lower(User.email).like(f"%@{domain}"),
            ~func.lower(User.email).like("%@deleted.local"),
        )
        .first()
    )
    return peer is not None


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
    if _org_has_same_business_domain_peer(db, user):
        return True
    if user_has_shared_org_work(db, user):
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

    Fast path: once a user already has an organization_id, skip peer/founder
    scans on every authenticated request (was a major per-tab tax).
    Users with no org still get a personal workspace.
    """
    try:
        if _is_tombstone_email(getattr(user, "email", None)):
            return user
        if is_protected_workspace_user(user):
            return user
        if user.organization_id:
            return user
        return move_user_to_personal_workspace(db, user)
    except Exception:
        logger.exception("Workspace isolation failed for user %s", getattr(user, "id", None))
        db.rollback()
        return user
