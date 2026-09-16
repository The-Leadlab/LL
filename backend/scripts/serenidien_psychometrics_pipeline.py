"""
Serenidien prospect list → LeadLab import → psychometric analysis → Excel export.

Usage:
  py scripts/serenidien_psychometrics_pipeline.py --xlsx "C:\\Users\\...\\SERENIDIEN_Prospect list.xlsx"
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl
import requests

DEFAULT_API = "https://api.the-leadlab.com/api/v1"
FALLBACK_APIS = [
    "https://api.the-leadlab.com/api/v1",
    "https://the-leadlab.com/api/v1",
    "http://127.0.0.1:8000/api/v1",
]


def extract_cell(val: Any) -> Any:
    if val is None:
        return None
    if not isinstance(val, str):
        return val
    s = val.strip()
    if not s.startswith("="):
        return s or None
    # Google Sheets IFERROR(... ,"fallback") — take last quoted string
    quotes = re.findall(r'"([^"]*)"', s)
    if quotes:
        return quotes[-1] or None
    return None


def primary_email(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    parts = [p.strip() for p in str(raw).replace(";", ",").split(",") if p.strip()]
    return parts[0] if parts else None


def parse_prospects(xlsx_path: Path) -> List[Dict[str, Any]]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=False)
    sheets = ["Persona type 1", "Persona type 2", "Persona type 3"]
    leads: List[Dict[str, Any]] = []
    seen_emails: set[str] = set()

    for sheet in sheets:
        if sheet not in wb.sheetnames:
            print(f"WARN: missing sheet {sheet!r}")
            continue
        ws = wb[sheet]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header = [(str(h).strip() if h is not None else f"col{i}") for i, h in enumerate(rows[0])]
        for r in rows[1:]:
            if not any(r):
                continue
            raw = {header[i]: extract_cell(r[i]) if i < len(r) else None for i in range(len(header))}
            first = (raw.get("First Name") or "").strip() if raw.get("First Name") else None
            if not first:
                continue
            email = primary_email(raw.get("Email"))
            key = (email or f"{first}|{raw.get('Last Name')}|{raw.get('Company')}").lower()
            if key in seen_emails:
                continue
            seen_emails.add(key)
            leads.append(
                {
                    "first_name": first,
                    "last_name": (raw.get("Last Name") or "").strip() or None,
                    "company": raw.get("Company"),
                    "job_title": raw.get("Job Title"),
                    "email": email,
                    "telephone": raw.get("Telephone"),
                    "mobile": raw.get("Mobile"),
                    "country": raw.get("Country"),
                    "location": raw.get("City"),
                    "linkedin": raw.get("LINKEDIN"),
                    "website": raw.get("Website (if applicable)"),
                    "sector": raw.get("SECTOR"),
                    "time_in_current_role": raw.get("Time in Current Role"),
                    "source_persona_sheet": sheet,
                    "source_personality_type": (
                        raw.get("Personality type ") or raw.get("Personality type")
                    ),
                    "lab_comments": raw.get("Leadlab Comments"),
                    "client_comments": raw.get("Client comments ") or raw.get("Client comments"),
                    "source": "Serenidien Prospect List",
                }
            )
    return leads


def write_import_csv(leads: List[Dict[str, Any]], out_path: Path) -> Path:
    cols = [
        "first_name",
        "last_name",
        "company",
        "job_title",
        "email",
        "telephone",
        "mobile",
        "country",
        "location",
        "linkedin",
        "website",
        "sector",
        "time_in_current_role",
        "lab_comments",
        "client_comments",
        "source",
    ]
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for L in leads:
            row = {c: L.get(c) for c in cols}
            # Keep secondary emails in client comments if multi-email
            w.writerow(row)
    return out_path


def probe_api(session: requests.Session) -> Optional[str]:
    for base in FALLBACK_APIS:
        try:
            r = session.get(f"{base.replace('/api/v1', '')}/health", timeout=8)
            if r.status_code < 500:
                print(f"API probe {base}: health={r.status_code}")
        except Exception as e:
            print(f"API probe health fail {base}: {e}")
        try:
            # lightweight open endpoint or docs
            r = session.options(f"{base}/auth/login", timeout=8)
            print(f"API probe login OPTIONS {base}: {r.status_code}")
            return base
        except Exception as e:
            print(f"API probe fail {base}: {e}")
    return None


def login(session: requests.Session, api: str, email: str, password: str) -> Dict[str, Any]:
    # Primary: JSON body (UserLogin schema)
    r = session.post(
        f"{api}/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code < 400:
        return r.json()
    # Fallbacks
    attempts = [
        session.post(f"{api}/auth/login", json={"username": email, "password": password}, timeout=30),
        session.post(
            f"{api}/login/access-token",
            data={"username": email, "password": password},
            timeout=30,
        ),
    ]
    for r2 in attempts:
        if r2.status_code < 400:
            return r2.json()
    raise RuntimeError(
        f"Login failed: {r.status_code} {r.text[:300]} | "
        + " | ".join(f"{x.status_code} {x.text[:200]}" for x in attempts)
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--xlsx", required=True)
    p.add_argument("--api", default=DEFAULT_API)
    p.add_argument("--email", default="")
    p.add_argument("--password", default="")
    p.add_argument("--assigned-user-id", type=int, default=0)
    p.add_argument("--tag", default="Serenidien Prospects")
    p.add_argument("--parse-only", action="store_true")
    p.add_argument("--out-dir", default=str(Path.home() / "Downloads"))
    args = p.parse_args()

    xlsx = Path(args.xlsx)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    leads = parse_prospects(xlsx)
    print(f"Parsed {len(leads)} unique prospects")
    with_email = sum(1 for L in leads if L.get("email"))
    print(f"With email: {with_email}")

    csv_path = out_dir / "SERENIDIEN_Prospects_LeadLab_Import.csv"
    write_import_csv(leads, csv_path)
    print(f"Wrote import CSV: {csv_path}")

    meta_path = out_dir / "SERENIDIEN_Prospects_parsed.json"
    meta_path.write_text(json.dumps(leads, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote parsed JSON: {meta_path}")

    if args.parse_only:
        return 0

    if not args.email or not args.password:
        print("ERROR: --email and --password required for upload (or use --parse-only)")
        return 2

    session = requests.Session()
    api = args.api
    probed = probe_api(session)
    if probed:
        api = probed if args.api == DEFAULT_API else args.api
    print(f"Using API: {api}")

    token_data = login(session, api, args.email, args.password)
    token = token_data.get("access_token") or token_data.get("token")
    if not token:
        print("Login response missing token:", token_data)
        return 3
    headers = {"Authorization": f"Bearer {token}"}

    me = session.get(f"{api}/users/me", headers=headers, timeout=30)
    me.raise_for_status()
    me_data = me.json()
    print(f"Logged in as {me_data.get('email')} id={me_data.get('id')} org={me_data.get('organization_id')}")
    assigned = args.assigned_user_id or me_data.get("id")

    with csv_path.open("rb") as f:
        files = {"file": (csv_path.name, f, "text/csv")}
        data = {
            "assigned_user_id": str(assigned),
            "new_tag_name": args.tag,
        }
        imp = session.post(
            f"{api}/leads/import/csv",
            headers=headers,
            data=data,
            files=files,
            timeout=180,
        )
    print(f"Import status: {imp.status_code}")
    print(imp.text[:1500])
    if imp.status_code >= 400:
        return 4

    # Fetch leads tagged / source Serenidien
    lead_ids: List[int] = []
    skip = 0
    while True:
        lr = session.get(
            f"{api}/leads/",
            headers=headers,
            params={"skip": skip, "limit": 100, "search": "Serenidien"},
            timeout=60,
        )
        if lr.status_code >= 400:
            # fallback: list recent
            lr = session.get(f"{api}/leads/", headers=headers, params={"skip": skip, "limit": 100}, timeout=60)
        lr.raise_for_status()
        payload = lr.json()
        items = payload if isinstance(payload, list) else payload.get("data") or payload.get("items") or payload.get("leads") or []
        if not items:
            break
        for item in items:
            src = (item.get("source") or "")
            if "Serenidien" in src or args.tag.lower() in json.dumps(item).lower():
                lead_ids.append(item["id"])
        if len(items) < 100:
            break
        skip += 100

    # Also match by emails from parsed list
    email_set = {L["email"].lower() for L in leads if L.get("email")}
    skip = 0
    while email_set and skip < 5000:
        lr = session.get(f"{api}/leads/", headers=headers, params={"skip": skip, "limit": 100}, timeout=60)
        if lr.status_code >= 400:
            break
        payload = lr.json()
        items = payload if isinstance(payload, list) else payload.get("data") or payload.get("items") or payload.get("leads") or []
        if not items:
            break
        for item in items:
            em = (item.get("email") or "").lower()
            if em in email_set:
                lead_ids.append(item["id"])
        if len(items) < 100:
            break
        skip += 100

    lead_ids = sorted(set(lead_ids))
    print(f"Leads to analyze: {len(lead_ids)}")

    # Psychometrics per lead (more reliable than batch for export)
    results: List[Dict[str, Any]] = []
    for i, lid in enumerate(lead_ids, 1):
        try:
            pr = session.get(f"{api}/ai-insights/{lid}/psychometric", headers=headers, timeout=60)
            # endpoint may not require auth in some builds; still send header
            data = pr.json() if pr.content else {}
            insight = (data.get("data") or {}) if isinstance(data, dict) else {}
            combined = insight.get("combined_insights") or insight
            lead_r = session.get(f"{api}/leads/{lid}", headers=headers, timeout=30)
            lead = lead_r.json() if lead_r.status_code < 400 else {"id": lid}
            disc = combined.get("disc_scores") or {}
            big5 = combined.get("big_five") or {}
            sales = combined.get("sales_insights") or {}
            results.append(
                {
                    "lead_id": lid,
                    "first_name": lead.get("first_name"),
                    "last_name": lead.get("last_name"),
                    "company": lead.get("company"),
                    "job_title": lead.get("job_title"),
                    "email": lead.get("email"),
                    "linkedin": lead.get("linkedin"),
                    "sector": lead.get("sector"),
                    "personality_type": combined.get("personality_type"),
                    "personality_description": combined.get("personality_description"),
                    "disc_D": disc.get("D"),
                    "disc_I": disc.get("I"),
                    "disc_S": disc.get("S"),
                    "disc_C": disc.get("C"),
                    "big5_openness": big5.get("openness"),
                    "big5_conscientiousness": big5.get("conscientiousness"),
                    "big5_extraversion": big5.get("extraversion"),
                    "big5_agreeableness": big5.get("agreeableness"),
                    "big5_neuroticism": big5.get("neuroticism"),
                    "communication_style": (combined.get("communication_style") or {}).get("primary_style"),
                    "sales_approach": sales.get("approach"),
                    "decision_style": sales.get("decision_style"),
                    "motivators": ", ".join(sales.get("motivators") or []) if isinstance(sales.get("motivators"), list) else sales.get("motivators"),
                    "confidence_score": combined.get("confidence_score"),
                    "data_sources": ", ".join(combined.get("data_sources") or []) if isinstance(combined.get("data_sources"), list) else combined.get("data_sources"),
                    "status": "ok" if pr.status_code < 400 and data.get("success", True) else f"http_{pr.status_code}",
                }
            )
            if i % 10 == 0:
                print(f"Analyzed {i}/{len(lead_ids)}")
            time.sleep(0.15)
        except Exception as e:
            results.append({"lead_id": lid, "status": f"error: {e}"})

    # Excel export
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        wb = Workbook()
        ws = wb.active
        ws.title = "Psychometrics"
        if results:
            headers_row = list(results[0].keys())
            # unify keys
            keys: List[str] = []
            for r in results:
                for k in r:
                    if k not in keys:
                        keys.append(k)
            ws.append(keys)
            for cell in ws[1]:
                cell.font = Font(bold=True)
            for r in results:
                ws.append([r.get(k) for k in keys])
        export_path = out_dir / "SERENIDIEN_Prospects_Psychometrics.xlsx"
        wb.save(export_path)
        print(f"Wrote export: {export_path}")
    except Exception as e:
        export_csv = out_dir / "SERENIDIEN_Prospects_Psychometrics.csv"
        if results:
            keys = []
            for r in results:
                for k in r:
                    if k not in keys:
                        keys.append(k)
            with export_csv.open("w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=keys)
                w.writeheader()
                w.writerows(results)
            print(f"Wrote CSV fallback: {export_csv} (excel error: {e})")
        else:
            print(f"No results to export; excel error: {e}")

    print(json.dumps({"parsed": len(leads), "analyzed": len(results)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
