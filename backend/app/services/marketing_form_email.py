"""HTML/text email bodies for marketing form submissions."""
from html import escape
from typing import Any, Dict, List, Tuple

from app.services.system_email_layout import info_card, p, render_system_email


def _esc(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, list):
        return escape(", ".join(str(v) for v in value)) if value else "—"
    return escape(str(value))


def _row(label: str, value: Any) -> str:
    return (
        f"<tr><td style='padding:6px 12px 6px 0;font-weight:600;vertical-align:top;"
        f"color:#0f172a;'>{escape(label)}</td>"
        f"<td style='padding:6px 0;color:#334155;'>{_esc(value)}</td></tr>"
    )


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

    table = (
        "<table style='border-collapse:collapse;font-size:14px;width:100%;'>"
        + "".join(rows)
        + "</table>"
    )

    body_html = (
        info_card(
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Name:</strong> {_esc(body.full_name)}</p>"
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Email:</strong> {_esc(body.email)}</p>"
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Company:</strong> {_esc(body.company)}</p>"
            f"<p style='margin:0;font-size:14px;color:#334155;'><strong>Phone:</strong> {_esc(body.phone)}</p>"
        )
        + p("<strong>Questionnaire answers</strong>")
        + table
    )
    html, _ = render_system_email(
        title="New data request submission",
        preheader=f"Data request from {_esc(body.full_name)}",
        body_html=body_html,
        footer_note="Internal ops notification from marketing forms.",
    )
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
    body_html = (
        info_card(
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Form type:</strong> {escape(body.form_type)}</p>"
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Name:</strong> {escape(body.full_name)}</p>"
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Email:</strong> {escape(body.email)}</p>"
            f"<p style='margin:0 0 6px 0;font-size:14px;color:#334155;'><strong>Company:</strong> {escape(body.company or '-')}</p>"
            f"<p style='margin:0;font-size:14px;color:#334155;'><strong>Phone:</strong> {escape(body.phone or '-')}</p>"
        )
        + p("<strong>Payload</strong>")
        + f"<pre style='font-size:12px;line-height:1.5;color:#334155;white-space:pre-wrap;word-break:break-word;"
        f"background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;'>{escape(payload_pretty)}</pre>"
    )
    html, _ = render_system_email(
        title="New marketing form submission",
        preheader=f"{body.form_type} from {body.full_name}",
        body_html=body_html,
        footer_note="Internal ops notification from marketing forms.",
    )
    text = (
        f"New marketing form submission\n"
        f"Form type: {body.form_type}\n"
        f"Name: {body.full_name}\n"
        f"Email: {body.email}\n\n"
        f"Payload:\n{payload_pretty}"
    )
    return html, text
