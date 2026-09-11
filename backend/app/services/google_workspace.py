"""Google Workspace helpers for OAuth scopes, Sheets IDs, and lead text import."""

from __future__ import annotations

import re
from datetime import datetime
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_account import EmailAccount
from app.models.outreach_platform import OutreachConnection
from app.models.user import User

SHEETS_SCOPE_MARKERS = (
    "spreadsheets",
    "drive.readonly",
    "drive.metadata.readonly",
    "drive.file",
)

EMAIL_IN_TEXT_RE = re.compile(r"([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})", re.IGNORECASE)
SPREADSHEET_PATH_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9\-_]+)")
SPREADSHEET_ID_QUERY_RE = re.compile(r"[?&]id=([a-zA-Z0-9\-_]+)")


def merged_google_oauth_scopes() -> str:
    merged: List[str] = []
    for scope_line in [
        settings.GOOGLE_CALENDAR_SCOPES,
        settings.GOOGLE_EMAIL_SCOPES,
        settings.GOOGLE_SHEETS_SCOPES,
    ]:
        for scope in (scope_line or "").split():
            if scope and scope not in merged:
                merged.append(scope)
    return " ".join(merged)


def parse_spreadsheet_id(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    match = SPREADSHEET_PATH_RE.search(raw)
    if match:
        return match.group(1)
    match = SPREADSHEET_ID_QUERY_RE.search(raw)
    if match:
        return match.group(1)
    return raw


def account_has_sheets_scope(account: Optional[EmailAccount]) -> bool:
    scopes = (account.oauth_scopes or "") if account else ""
    return any(marker in scopes for marker in SHEETS_SCOPE_MARKERS)


def google_oauth_account(db: Session, user: User) -> Optional[EmailAccount]:
    query = db.query(EmailAccount).filter(
        EmailAccount.organization_id == user.organization_id,
        EmailAccount.oauth_refresh_token.isnot(None),
    )
    own = (
        query.filter(EmailAccount.user_id == user.id)
        .order_by(EmailAccount.id.desc())
        .first()
    )
    if own:
        return own
    return query.order_by(EmailAccount.id.desc()).first()


def get_user_google_access_token(db: Session, user: User) -> str:
    from app.services.email_service import EmailService

    account = google_oauth_account(db, user)
    if not account:
        raise ValueError(
            "Connect Google first (sign in with Google or Settings → Integrations), then import from Sheets."
        )
    return EmailService(db)._get_google_access_token(account)


def ensure_sheets_connection(
    db: Session,
    user: User,
    spreadsheet_id: Optional[str] = None,
    *,
    commit: bool = True,
) -> OutreachConnection:
    existing = (
        db.query(OutreachConnection)
        .filter(
            OutreachConnection.organization_id == user.organization_id,
            OutreachConnection.user_id == user.id,
            OutreachConnection.type == "google_sheets",
        )
        .order_by(OutreachConnection.id.desc())
        .first()
    )
    sheet_id = parse_spreadsheet_id(spreadsheet_id or "")
    if existing:
        if sheet_id:
            config = dict(existing.config or {})
            config["spreadsheet_id"] = sheet_id
            existing.config = config
            existing.status = "active"
            existing.updated_at = datetime.utcnow()
            db.add(existing)
        elif existing.status != "active":
            existing.status = "active"
            existing.updated_at = datetime.utcnow()
            db.add(existing)
        if commit:
            db.commit()
            db.refresh(existing)
        return existing

    conn = OutreachConnection(
        organization_id=user.organization_id,
        user_id=user.id,
        type="google_sheets",
        display_name="Google Sheets",
        config={"spreadsheet_id": sheet_id} if sheet_id else {},
        status="active",
    )
    db.add(conn)
    if commit:
        db.commit()
        db.refresh(conn)
    return conn


def _split_row(line: str) -> List[str]:
    if "\t" in line:
        return [cell.strip() for cell in line.split("\t")]
    return [cell.strip() for cell in line.split(",")]


def parse_pasted_lead_rows(text: str) -> List[List[str]]:
    """Turn pasted CSV/TSV or a list of emails into header + data rows."""
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return []

    first_lower = lines[0].lower()
    looks_like_header = any(
        token in first_lower
        for token in ("email", "e-mail", "first_name", "firstname", "last_name", "company")
    )
    rows = [_split_row(line) for line in lines]
    if looks_like_header:
        return rows

    emails: List[str] = []
    for row in rows:
        cell = " ".join(row)
        match = EMAIL_IN_TEXT_RE.search(cell)
        if not match:
            return rows
        emails.append(match.group(1).lower())
    return [["email"]] + [[email] for email in emails]


def normalize_header_name(header: str) -> str:
    return (header or "").lower().strip().replace(" ", "_")


DEFAULT_SHEET_COLUMN_MAP = {
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


def column_field_map(
    headers: Sequence[str],
    mapping: Optional[dict] = None,
) -> dict:
    mapping = mapping or {}
    col_to_field = {}
    for index, header in enumerate(headers):
        field = mapping.get(header) or DEFAULT_SHEET_COLUMN_MAP.get(header)
        if field:
            col_to_field[index] = field
    return col_to_field
