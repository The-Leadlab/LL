"""Google Workspace helpers for OAuth scopes, Sheets IDs, and lead text import."""

from __future__ import annotations

import csv
import re
from datetime import datetime
from io import StringIO
from typing import Any, Dict, List, Optional, Sequence, Tuple

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


ANGLE_EMAIL_RE = re.compile(r"^(?P<name>.+?)\s*<\s*(?P<email>[^>]+@[^>]+)\s*>\s*$")

LEAD_IMPORT_FIELDS = (
    "email",
    "first_name",
    "last_name",
    "full_name",
    "company",
    "job_title",
    "unique_lead_id",
    "telephone",
    "mobile",
    "linkedin",
    "location",
)

DEFAULT_SHEET_COLUMN_MAP = {
    "email": "email",
    "e_mail": "email",
    "email_address": "email",
    "emails": "email",
    "mail": "email",
    "work_email": "email",
    "first_name": "first_name",
    "firstname": "first_name",
    "first": "first_name",
    "given_name": "first_name",
    "prenom": "first_name",
    "last_name": "last_name",
    "lastname": "last_name",
    "last": "last_name",
    "surname": "last_name",
    "family_name": "last_name",
    "name": "full_name",
    "full_name": "full_name",
    "fullname": "full_name",
    "contact_name": "full_name",
    "company": "company",
    "organisation": "company",
    "organization": "company",
    "org": "company",
    "account": "company",
    "job_title": "job_title",
    "jobtitle": "job_title",
    "title": "job_title",
    "position": "job_title",
    "role": "job_title",
    "unique_lead_id": "unique_lead_id",
    "lead_id": "unique_lead_id",
    "external_id": "unique_lead_id",
    "sheet_id": "unique_lead_id",
    "row_id": "unique_lead_id",
    "id": "unique_lead_id",
    "phone": "telephone",
    "telephone": "telephone",
    "tel": "telephone",
    "mobile": "mobile",
    "cell": "mobile",
    "linkedin": "linkedin",
    "linkedin_url": "linkedin",
    "location": "location",
    "city": "location",
}

HEADER_HINT_TOKENS = (
    "email",
    "e-mail",
    "e_mail",
    "first_name",
    "firstname",
    "last_name",
    "lastname",
    "full_name",
    "company",
    "organisation",
    "organization",
    "job_title",
    "linkedin",
)


def normalize_header_name(header: str) -> str:
    raw = (header or "").replace("\ufeff", "").strip().lower()
    for ch in (" ", "-", ".", "/", "\\"):
        raw = raw.replace(ch, "_")
    while "__" in raw:
        raw = raw.replace("__", "_")
    return raw.strip("_")


def split_full_name(value: str) -> Tuple[str, str]:
    text = (value or "").strip()
    if not text:
        return "", ""
    if "," in text:
        left, right = text.split(",", 1)
        if right.strip():
            return right.strip(), left.strip()
    parts = [part for part in text.split() if part]
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _parse_csv_text(text: str) -> List[List[str]]:
    raw = (text or "").replace("\ufeff", "").strip()
    if not raw:
        return []
    sample = raw[:4096]
    dialect: csv.Dialect
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel_tab if sample.count("\t") > sample.count(",") else csv.excel
    rows: List[List[str]] = []
    reader = csv.reader(StringIO(raw), dialect)
    for row in reader:
        cells = [(cell or "").strip() for cell in row]
        if any(cells):
            rows.append(cells)
    return rows


def _looks_like_header(row: Sequence[str]) -> bool:
    joined = " ".join(normalize_header_name(cell) for cell in row)
    return any(token in joined for token in HEADER_HINT_TOKENS)


def _infer_headers_for_data_rows(rows: List[List[str]]) -> List[str]:
    width = max((len(row) for row in rows), default=0)
    headers = [f"column_{index + 1}" for index in range(width)]
    email_idx: Optional[int] = None
    for index in range(width):
        hits = sum(
            1
            for row in rows
            if index < len(row) and EMAIL_IN_TEXT_RE.search(row[index] or "")
        )
        if hits >= max(1, (len(rows) + 1) // 2):
            email_idx = index
            break
    if email_idx is None:
        return headers
    headers[email_idx] = "email"
    others = [index for index in range(width) if index != email_idx]
    if len(others) == 1:
        headers[others[0]] = "name"
    elif len(others) >= 2:
        headers[others[0]] = "first_name"
        headers[others[1]] = "last_name"
        if len(others) >= 3:
            headers[others[2]] = "company"
    return headers


def _row_from_name_email_line(line: str) -> Optional[List[str]]:
    angled = ANGLE_EMAIL_RE.match(line.strip())
    if angled:
        first, last = split_full_name(angled.group("name"))
        return [angled.group("email").strip().lower(), first, last]
    match = EMAIL_IN_TEXT_RE.search(line)
    if not match:
        return None
    email = match.group(1).lower()
    leftover = (line[: match.start()] + line[match.end() :]).strip(" ,;<>")
    first, last = split_full_name(leftover)
    return [email, first, last]


def parse_pasted_lead_rows(text: str) -> List[List[str]]:
    """Turn pasted CSV/TSV or a list of emails into header + data rows."""
    rows = _parse_csv_text(text)
    if not rows:
        return []
    if _looks_like_header(rows[0]):
        return rows

    width = max(len(row) for row in rows)
    if width > 1:
        return [_infer_headers_for_data_rows(rows)] + rows

    parsed: List[List[str]] = []
    for row in rows:
        record = _row_from_name_email_line(" ".join(row))
        if not record:
            return [_infer_headers_for_data_rows(rows)] + rows
        parsed.append(record)
    if any(row[1] or row[2] for row in parsed):
        return [["email", "first_name", "last_name"]] + parsed
    return [["email"]] + [[row[0]] for row in parsed]


def column_field_map(
    headers: Sequence[str],
    mapping: Optional[dict] = None,
) -> Dict[int, str]:
    user_map = {
        normalize_header_name(str(key)): str(value)
        for key, value in (mapping or {}).items()
        if value
    }
    col_to_field: Dict[int, str] = {}
    used_fields = set()
    for index, header in enumerate(headers):
        original = (header or "").strip()
        normalized = normalize_header_name(original)
        field = user_map.get(normalized) or user_map.get(original)
        if not field and mapping:
            field = mapping.get(original) or mapping.get(normalized)
        if not field:
            field = DEFAULT_SHEET_COLUMN_MAP.get(normalized)
        if not field or field == "skip":
            continue
        if field in used_fields and field != "full_name":
            continue
        col_to_field[index] = field
        used_fields.add(field)
    return col_to_field


def _cell_email(value: str) -> str:
    match = EMAIL_IN_TEXT_RE.search(value or "")
    return match.group(1).lower() if match else (value or "").strip()


def mapped_lead_from_row(
    row: Sequence[str],
    col_to_field: Dict[int, str],
) -> Dict[str, str]:
    data: Dict[str, str] = {}
    for index, field in col_to_field.items():
        value = (row[index] if index < len(row) else "").strip()
        if field == "email":
            value = _cell_email(value)
        data[field] = value
    if not data.get("email"):
        for cell in row:
            found = EMAIL_IN_TEXT_RE.search(cell or "")
            if found:
                data["email"] = found.group(1).lower()
                break
    if data.get("full_name") and not (data.get("first_name") or data.get("last_name")):
        first, last = split_full_name(data["full_name"])
        data["first_name"] = first
        data["last_name"] = last
    data.pop("full_name", None)
    return {key: value for key, value in data.items() if value}


def header_mapping_labels(
    headers: Sequence[str],
    col_to_field: Dict[int, str],
) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    for index, header in enumerate(headers):
        field = col_to_field.get(index)
        if field:
            labels[(header or "").strip() or f"column_{index + 1}"] = field
    return labels


def preview_mapped_rows(
    rows: List[List[str]],
    *,
    header_row: int = 1,
    mapping: Optional[dict] = None,
    sample_limit: int = 25,
) -> Dict[str, Any]:
    if not rows:
        return {
            "headers": [],
            "mapping": {},
            "unmapped": [],
            "sample": [],
            "total_rows": 0,
            "has_email": False,
        }
    header_idx = max(0, (header_row or 1) - 1)
    if header_idx >= len(rows):
        return {
            "headers": [],
            "mapping": {},
            "unmapped": [],
            "sample": [],
            "total_rows": 0,
            "has_email": False,
        }
    headers = [(cell or "").strip() or f"column_{i + 1}" for i, cell in enumerate(rows[header_idx])]
    normalized = [normalize_header_name(header) for header in headers]
    col_to_field = column_field_map(normalized, mapping)
    if mapping:
        col_to_field = column_field_map(headers, mapping) or col_to_field
    data_rows = rows[header_idx + 1 :]
    sample = []
    for row in data_rows[: max(1, sample_limit)]:
        sample.append(mapped_lead_from_row(row, col_to_field))
    mapping_labels = header_mapping_labels(headers, col_to_field)
    mapped_indexes = set(col_to_field)
    unmapped = [header for i, header in enumerate(headers) if i not in mapped_indexes]
    return {
        "headers": headers,
        "mapping": mapping_labels,
        "unmapped": unmapped,
        "sample": sample,
        "total_rows": len(data_rows),
        "has_email": "email" in col_to_field.values(),
        "fields": list(LEAD_IMPORT_FIELDS),
    }
