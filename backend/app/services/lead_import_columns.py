"""Shared helpers for lead CSV/XLSX import: header detection, aliases, mapping."""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

import unicodedata

import pandas as pd

logger = logging.getLogger(__name__)


def normalize_header_name(header: str) -> str:
    """Normalize spreadsheet headers for alias matching (BOM, punctuation, accents)."""
    raw = (header or "").replace("\ufeff", "").strip().lower()
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    for ch in (" ", "-", ".", "/", "\\", "(", ")", "[", "]", "{", "}", ":", ";", ",", "'", '"'):
        raw = raw.replace(ch, "_")
    while "__" in raw:
        raw = raw.replace("__", "_")
    return raw.strip("_")


def split_full_name(value: str):
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


# Keep in sync with google_workspace.DEFAULT_SHEET_COLUMN_MAP (+ import extras)
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
    "nom": "last_name",
    "name": "full_name",
    "full_name": "full_name",
    "fullname": "full_name",
    "contact_name": "full_name",
    "nom_complet": "full_name",
    "company": "company",
    "organisation": "company",
    "organization": "company",
    "org": "company",
    "account": "company",
    "societe": "company",
    "entreprise": "company",
    "firma": "company",
    "job_title": "job_title",
    "jobtitle": "job_title",
    "title": "job_title",
    "position": "job_title",
    "role": "job_title",
    "unique_lead_id": "unique_lead_id",
    "lead_id": "unique_lead_id",
    "external_id": "unique_lead_id",
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

# Lead fields the UI can map onto
MAPPABLE_LEAD_FIELDS = (
    "first_name",
    "last_name",
    "full_name",
    "email",
    "company",
    "job_title",
    "telephone",
    "mobile",
    "linkedin",
    "location",
    "country",
    "website",
    "sector",
    "unique_lead_id",
    "time_in_current_role",
    "lab_comments",
    "client_comments",
    "source",
    "client",
    "client_id",
)

IMPORT_ONLY_ALIASES: Dict[str, List[str]] = {
    "first_name": ["given_name"],
    "last_name": ["surname"],
    "company": ["societe", "entreprise", "firma"],
    "country": ["country", "pays", "nation"],
    "website": ["website", "web", "url", "site_web"],
    "sector": ["sector", "industry", "secteur", "industrie"],
    "time_in_current_role": ["time_in_current_role", "time_in_role", "role_duration"],
    "lab_comments": [
        "lab_comments",
        "lab_comment",
        "labcomments",
        "note",
        "notes",
        "comment",
        "comments",
    ],
    "client_comments": ["client_comments", "client_comment", "clientcomments"],
    "source": ["source", "lead_source"],
    "client": ["client", "client_name", "clientname"],
    "client_id": ["client_id", "clientid"],
    "full_name": ["full_name", "name", "fullname", "contact_name", "nom_complet"],
}

HEADER_HINT_ALIASES = frozenset(
    {
        "first_name",
        "firstname",
        "last_name",
        "lastname",
        "email",
        "e_mail",
        "company",
        "full_name",
        "prenom",
        "nom",
        "societe",
        "entreprise",
        "linkedin",
        "telephone",
        "phone",
        "mobile",
    }
)


def build_alias_field_map() -> Dict[str, List[str]]:
    """lead_field → list of normalized header aliases."""
    field_mappings: Dict[str, List[str]] = {}
    for alias, field in DEFAULT_SHEET_COLUMN_MAP.items():
        field_mappings.setdefault(field, [])
        if alias not in field_mappings[field]:
            field_mappings[field].append(alias)
    for field, aliases in IMPORT_ONLY_ALIASES.items():
        field_mappings.setdefault(field, [])
        for a in aliases:
            na = normalize_header_name(a)
            if na and na not in field_mappings[field]:
                field_mappings[field].append(na)
    return field_mappings


def clean_cell(value: Any) -> Any:
    if pd.isna(value) or value == "" or (isinstance(value, str) and value.strip() == ""):
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned if cleaned else None
    return value


def _cell_nonempty(value: Any) -> bool:
    return clean_cell(value) is not None


def _row_is_empty(row: pd.Series) -> bool:
    return not any(_cell_nonempty(v) for v in row.values)


def _header_score(cells: List[Any]) -> int:
    score = 0
    for cell in cells:
        norm = normalize_header_name(str(cell) if cell is not None and not pd.isna(cell) else "")
        if not norm or norm.startswith("unnamed") or norm.startswith("_unnamed"):
            continue
        if norm in HEADER_HINT_ALIASES or norm in DEFAULT_SHEET_COLUMN_MAP:
            score += 2
        elif any(h in norm for h in ("name", "email", "mail", "company", "phone", "tel")):
            score += 1
    return score


def detect_header_row_index(raw: pd.DataFrame, max_scan: int = 20) -> int:
    """Pick the best header row among the first max_scan rows (0-based in raw)."""
    best_idx = 0
    best_score = -1
    limit = min(max_scan, len(raw))
    for i in range(limit):
        cells = list(raw.iloc[i].values)
        score = _header_score(cells)
        if score > best_score:
            best_score = score
            best_idx = i
    return best_idx if best_score > 0 else 0


def drop_empty_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Drop columns that are entirely empty (all NaN/blank)."""
    if df.empty:
        return df
    keep = []
    for col in df.columns:
        series = df[col]
        if series.map(_cell_nonempty).any():
            keep.append(col)
    return df[keep] if keep else df


def read_spreadsheet_bytes(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV/XLSX without assuming header is row 0; then promote detected header."""
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xls")):
        raw = pd.read_excel(io.BytesIO(content), header=None)
    else:
        # Try several encodings
        last_err: Optional[Exception] = None
        raw = None
        for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1", "utf-16"):
            try:
                text = content.decode(encoding)
                raw = pd.read_csv(io.StringIO(text), header=None)
                break
            except Exception as e:
                last_err = e
                continue
        if raw is None:
            raise ValueError(f"Could not decode CSV: {last_err}")

    if raw.empty:
        return raw

    header_idx = detect_header_row_index(raw)
    header_cells = [
        "" if pd.isna(c) else str(c).strip() for c in raw.iloc[header_idx].values
    ]
    # Unique labels so pandas doesn't create duplicate-name Series
    unique_headers: List[str] = []
    seen_labels: Dict[str, int] = {}
    for i, label in enumerate(header_cells):
        key = label if label else f"__blank_{i}"
        if key in seen_labels:
            seen_labels[key] += 1
            key = f"{key}_{seen_labels[key]}"
        else:
            seen_labels[key] = 0
        unique_headers.append(key if label else f"__blank_{i}")

    body = raw.iloc[header_idx + 1 :].copy()
    body.columns = unique_headers
    body = body.reset_index(drop=True)

    # Drop entirely empty columns (including leading blank spacer columns)
    keep_cols = []
    display_names: List[str] = []
    for col in body.columns:
        series = body[col]
        has_data = bool(series.map(_cell_nonempty).any())
        label = str(col)
        is_blank_spacer = label.startswith("__blank_")
        if is_blank_spacer and not has_data:
            continue
        if not has_data and is_blank_spacer:
            continue
        if not has_data and not label:
            continue
        keep_cols.append(col)
        # Restore human header for non-blank originals
        if is_blank_spacer:
            display_names.append("")
        else:
            # strip uniqueness suffix only if we added _N to a real label — keep as-is
            display_names.append(label)

    if keep_cols:
        body = body[keep_cols]
        body.columns = display_names

    return body


def normalize_dataframe_headers(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """
    Returns (df with normalized unique column names, original_headers, normalized_headers).
    """
    original = [str(c).strip() if c is not None else "" for c in df.columns]
    normalized: List[str] = []
    seen: Dict[str, int] = {}
    for i, orig in enumerate(original):
        base = normalize_header_name(orig) or f"_unnamed_{i}"
        if base in seen:
            seen[base] += 1
            base = f"{base}_{seen[base]}"
        else:
            seen[base] = 0
        normalized.append(base)
    out = df.copy()
    out.columns = normalized
    return out, original, normalized


def suggest_column_mapping(
    original_headers: List[str],
    normalized_headers: List[str],
) -> Dict[str, str]:
    """
    lead_field → original source header (for UI dropdowns).
    Uses first matching alias per field; each source header used at most once.
    """
    aliases = build_alias_field_map()
    used_headers: set = set()
    suggested: Dict[str, str] = {}

    # Prefer higher-value fields first so email/name win over weaker aliases
    priority = list(MAPPABLE_LEAD_FIELDS)
    for field in priority:
        if field == "status":
            continue
        possible = aliases.get(field, [])
        for i, norm in enumerate(normalized_headers):
            orig = original_headers[i] if i < len(original_headers) else norm
            if orig in used_headers:
                continue
            if norm in possible or normalize_header_name(orig) in possible:
                suggested[field] = orig
                used_headers.add(orig)
                break
    return suggested


def apply_column_mapping_to_row(
    row: pd.Series,
    *,
    original_headers: List[str],
    normalized_headers: List[str],
    column_mapping: Optional[Dict[str, str]],
    alias_map: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Build lead field dict from a row.
    column_mapping: lead_field → original header label (from preview UI).
    """
    # Map original header → normalized col name on the series
    orig_to_norm = {
        original_headers[i]: normalized_headers[i]
        for i in range(min(len(original_headers), len(normalized_headers)))
    }

    lead_data: Dict[str, Any] = {}

    if column_mapping:
        for field, source_header in column_mapping.items():
            if not field or not source_header or field == "status":
                continue
            if field not in MAPPABLE_LEAD_FIELDS and field not in ("full_name",):
                continue
            col = orig_to_norm.get(source_header)
            if col is None:
                # Try match by normalized source
                src_norm = normalize_header_name(source_header)
                for i, n in enumerate(normalized_headers):
                    if n == src_norm or normalize_header_name(original_headers[i]) == src_norm:
                        col = n
                        break
            if col is None or col not in row.index:
                continue
            value = row[col]
            if hasattr(value, "iloc"):
                value = value.iloc[0] if len(value) else None
            lead_data[field] = _coerce_field_value(field, value)
    else:
        for db_field, possible_names in alias_map.items():
            if db_field == "status":
                continue
            matching_col = next((c for c in possible_names if c in row.index), None)
            if matching_col is None:
                continue
            value = row[matching_col]
            if hasattr(value, "iloc"):
                value = value.iloc[0] if len(value) else None
            lead_data[db_field] = _coerce_field_value(db_field, value)

    # Split full_name
    full = lead_data.pop("full_name", None)
    if full and not (lead_data.get("first_name") or lead_data.get("last_name")):
        first, last = split_full_name(str(full))
        if first:
            lead_data["first_name"] = first
        if last:
            lead_data["last_name"] = last
    elif full:
        if not lead_data.get("first_name"):
            first, last = split_full_name(str(full))
            if first:
                lead_data["first_name"] = first
            if last and not lead_data.get("last_name"):
                lead_data["last_name"] = last

    return lead_data


def _coerce_field_value(field: str, value: Any) -> Any:
    if field in ("mobile", "telephone"):
        if isinstance(value, (int, float)) and not pd.isna(value):
            value = str(int(value))
        return clean_cell(value)
    if field == "client_id":
        if isinstance(value, (int, float)) and not pd.isna(value):
            return int(value)
        cleaned = clean_cell(value)
        return int(cleaned) if cleaned and str(cleaned).isdigit() else None
    return clean_cell(value)


def row_has_identity(lead_data: Dict[str, Any]) -> bool:
    """True if row has enough identity to import (name or email)."""
    if lead_data.get("email"):
        return True
    if lead_data.get("first_name") or lead_data.get("last_name"):
        return True
    if lead_data.get("full_name"):
        return True
    return False


def prepare_import_dataframe(
    content: bytes, filename: str
) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """Read file, detect header, drop empty cols, normalize headers."""
    df = read_spreadsheet_bytes(content, filename)
    if df.empty:
        return df, [], []
    return normalize_dataframe_headers(df)


def preview_import_file(content: bytes, filename: str) -> Dict[str, Any]:
    df, original_headers, normalized_headers = prepare_import_dataframe(content, filename)
    if df.empty:
        return {
            "headers": [],
            "normalized_headers": [],
            "suggested_mapping": {},
            "sample_rows": [],
            "total_rows": 0,
            "skippable_empty_rows": 0,
            "mappable_fields": list(MAPPABLE_LEAD_FIELDS),
        }

    suggested = suggest_column_mapping(original_headers, normalized_headers)
    alias_map = build_alias_field_map()

    samples: List[Dict[str, Any]] = []
    skippable = 0
    identity_count = 0
    for _, row in df.iterrows():
        if _row_is_empty(row):
            skippable += 1
            continue
        lead_data = apply_column_mapping_to_row(
            row,
            original_headers=original_headers,
            normalized_headers=normalized_headers,
            column_mapping=suggested,
            alias_map=alias_map,
        )
        if not row_has_identity(lead_data):
            skippable += 1
            continue
        identity_count += 1
        if len(samples) < 5:
            sample = {}
            for i, orig in enumerate(original_headers):
                if not orig:
                    continue
                col = normalized_headers[i]
                if col in row.index:
                    v = clean_cell(row[col])
                    if v is not None:
                        sample[orig] = v
            samples.append(
                {
                    "raw": sample,
                    "mapped": {
                        k: v
                        for k, v in lead_data.items()
                        if v is not None and k in MAPPABLE_LEAD_FIELDS
                    },
                }
            )

    return {
        "headers": [h for h in original_headers if h],
        "all_headers": original_headers,
        "normalized_headers": normalized_headers,
        "suggested_mapping": suggested,
        "sample_rows": samples,
        "total_rows": int(len(df)),
        "identity_rows": identity_count,
        "skippable_empty_rows": skippable,
        "mappable_fields": list(MAPPABLE_LEAD_FIELDS),
    }
