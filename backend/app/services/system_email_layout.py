"""Shared LeadLab transactional email chrome.

Brand: primary blue #2563eb → indigo #4f46e5, logo on www, table + inline styles.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

# Always use the public CDN host — never localhost (recipients cannot load it).
EMAIL_LOGO_URL = "https://www.the-leadlab.com/images/leadlab-logo.png"
BRAND_PRIMARY = "#2563eb"
BRAND_INDIGO = "#4f46e5"
PAGE_BG = "#f1f5f9"
TEXT_DARK = "#0f172a"
TEXT_BODY = "#334155"
TEXT_MUTED = "#64748b"
TEXT_FAINT = "#94a3b8"
FONT_STACK = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
    "'Helvetica Neue',Arial,sans-serif"
)


def _year() -> int:
    return datetime.utcnow().year


def _cta_block(label: str, url: str) -> str:
    return f"""
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;">
                          <tr>
                            <td align="center" style="border-radius:12px;background:linear-gradient(135deg,{BRAND_PRIMARY} 0%,{BRAND_INDIGO} 100%);">
                              <a href="{url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
                                {label}
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:{TEXT_FAINT};word-break:break-all;">
                          Button not working? Paste this link into your browser:<br />
                          <a href="{url}" style="color:{BRAND_PRIMARY};text-decoration:underline;">{url}</a>
                        </p>
"""


def render_system_email(
    *,
    title: str,
    body_html: str,
    preheader: str = "",
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    footer_note: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Return (html, plain_text) for a branded LeadLab system email.
    body_html should be fragment paragraphs/divs (no outer document).
    """
    preheader_html = ""
    if preheader:
        preheader_html = (
            f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">'
            f"{preheader}</div>"
        )

    cta_html = ""
    if cta_label and cta_url:
        cta_html = _cta_block(cta_label, cta_url)

    note = footer_note or "This is an automated message — please do not reply."
    year = _year()

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:{PAGE_BG};font-family:{FONT_STACK};color:{TEXT_DARK};">
  {preheader_html}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:{PAGE_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbeafe;box-shadow:0 10px 30px rgba(37,99,235,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,{BRAND_PRIMARY} 0%,{BRAND_INDIGO} 100%);padding:28px 32px;text-align:center;">
              <img src="{EMAIL_LOGO_URL}" alt="LeadLab" width="160" style="display:block;margin:0 auto 12px auto;max-width:160px;height:auto;border:0;" />
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">{title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px 28px;">
              {body_html}
              {cta_html}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px 28px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:{TEXT_MUTED};text-align:center;">
                Need help? Contact
                <a href="mailto:info@the-leadlab.com" style="color:{BRAND_PRIMARY};text-decoration:none;font-weight:600;">info@the-leadlab.com</a>
              </p>
              <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:{TEXT_FAINT};text-align:center;">
                © {year} LeadLab · the-leadlab.com<br />
                {note}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    # Rough plain-text fallback from body (callers should pass better text when needed)
    text = f"{title}\n\n(See the HTML version of this email for full formatting.)\n\n© {year} LeadLab · the-leadlab.com\ninfo@the-leadlab.com\n"
    return html, text


def p(text: str, *, strong: bool = False) -> str:
    weight = "600" if strong else "400"
    return (
        f'<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;'
        f'color:{TEXT_BODY};font-weight:{weight};">{text}</p>'
    )


def muted(text: str) -> str:
    return (
        f'<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:{TEXT_MUTED};">'
        f"{text}</p>"
    )


def info_card(inner_html: str) -> str:
    return (
        f'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;'
        f'padding:18px 20px;margin:0 0 20px 0;">{inner_html}</div>'
    )


def badge(label: str) -> str:
    return (
        f'<span style="display:inline-block;background:{BRAND_PRIMARY};color:#ffffff;'
        f'padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">'
        f"{label}</span>"
    )
