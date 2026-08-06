"""HTML/text email bodies for marketing form submissions."""
from html import escape
from typing import Any, Dict, List, Tuple


def _esc(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, list):
        return escape(", ".join(str(v) for v in value)) if value else "—"
    return escape(str(value))


def _row(label: str, value: Any) -> str:
    return f"<tr><td style='padding:6px 12px 6px 0;font-weight:600;vertical-align:top;'>{escape(label)}</td><td style='padding:6px 0;'>{_esc(value)}</td></tr>"


def build_data_request_email(body: Any, payload: Dict[str, Any]) -> Tuple[str, str]:
    """Human-readable email for Typeform-parity data request submissions."""
    known_rows: List[Tuple[str, str]] = [
        ("Business sectors", "business_sectors"),
        ("Business sector (other)", "business_sector_other"),
        ("Sales representatives", "sales_representatives"),
        ("Leads per week (per rep)", "leads_per_week"),
        ("Lead sourcing", "lead_sourcing"),
        ("Lead sourcing (other)", "lead_sourcing_other"),
        ("Countries / regions", "countries"),
        ("Countries (other)", "countries_other"),
        ("Ideal customer companies", "ideal_customer_companies"),
        ("Countries out of bounds", "countries_out_of_bounds"),
        ("Target industry", "target_industry"),
        ("Job titles / roles", "job_titles"),
        ("Company sizes", "company_sizes"),
        ("LinkedIn prospect example", "linkedin_prospect_example"),
        ("Ideal customer", "ideal_customer"),
        ("Lead info required", "lead_info_required"),
        ("Additional notes", "additional_notes"),
        ("Weekly lead volume", "weekly_lead_volume"),
        ("Terms accepted", "terms_accepted"),
        ("Terms URL", "terms_url"),
        ("Submitted at", "submitted_at"),
    ]
    rows: List[str] = [_row(label, payload.get(key)) for label, key in known_rows]
    used = {key for _, key in known_rows}
    for key, value in sorted((payload or {}).items()):
        if key in used:
            continue
        rows.append(_row(key.replace("_", " ").title(), value))

    table = "<table style='border-collapse:collapse;font-family:sans-serif;font-size:14px;'>" + "".join(rows) + "</table>"

    html = f"""
    <h2 style="font-family:sans-serif;">New Data Request Form submission</h2>
    <p style="font-family:sans-serif;"><strong>Name:</strong> {_esc(body.full_name)}<br/>
    <strong>Email:</strong> {_esc(body.email)}<br/>
    <strong>Company:</strong> {_esc(body.company)}<br/>
    <strong>Phone:</strong> {_esc(body.phone)}</p>
    <h3 style="font-family:sans-serif;">Questionnaire answers</h3>
    {table}
    """
    text_lines = [
        "New Data Request Form submission",
        f"Name: {body.full_name}",
        f"Email: {body.email}",
        f"Company: {body.company or '-'}",
        f"Phone: {body.phone or '-'}",
        "",
        "Questionnaire answers:",
    ]
    for label, key in known_rows:
        val = payload.get(key)
        if val not in (None, "", [], {}):
            text_lines.append(f"{label}: {val}")
    return html, "\n".join(text_lines)


def build_generic_email(body: Any, payload: Dict[str, Any]) -> Tuple[str, str]:
    import json

    payload_pretty = json.dumps(payload or {}, ensure_ascii=False, indent=2, default=str)
    html = f"""
    <h2>New marketing form submission</h2>
    <p><strong>Form type:</strong> {escape(body.form_type)}</p>
    <p><strong>Name:</strong> {escape(body.full_name)}</p>
    <p><strong>Email:</strong> {escape(body.email)}</p>
    <p><strong>Company:</strong> {escape(body.company or '-')}</p>
    <p><strong>Phone:</strong> {escape(body.phone or '-')}</p>
    <h3>Payload</h3>
    <pre>{escape(payload_pretty)}</pre>
    """
    text = (
        f"New marketing form submission\n"
        f"Form type: {body.form_type}\n"
        f"Name: {body.full_name}\n"
        f"Email: {body.email}\n\n"
        f"Payload:\n{payload_pretty}"
    )
    return html, text
