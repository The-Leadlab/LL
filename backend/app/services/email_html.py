"""Shared HTML envelope for outreach preview and actual sends."""
import re

_HTML_DOC_RE = re.compile(r"<html[\s>]", re.IGNORECASE)

# Keep this markup in sync with wrapHtmlPreviewDocument in ColdOutreach.tsx.
# Inline styles matter: Gmail ignores most <style> blocks, so the preview
# iframe and the received message must share the same table wrapper.
OUTBOUND_HTML_WRAPPER_START = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style type="text/css">
img { max-width: 100%; height: auto; }
a { color: #0b57d0; }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;">
<tr>
<td style="padding:16px;font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;line-height:1.5;color:#111111;">
"""

OUTBOUND_HTML_WRAPPER_END = """
</td>
</tr>
</table>
"""

# Postal address already published on the-leadlab.com legal page.
MARKETING_FOOTER = """<p style="margin:24px 0 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:12px;line-height:1.5;color:#666666;">
Lead Lab, Elite Park Plaza Floor 5, Umraniye, Istanbul.
<a href="https://www.the-leadlab.com/legal?policy=privacy" style="color:#0b57d0;">Privacy</a>
· <a href="mailto:info@the-leadlab.com?subject=Unsubscribe" style="color:#0b57d0;">Unsubscribe</a>
</p>
"""


def _with_marketing_footer(html: str) -> str:
    """CAN-SPAM: every outbound marketing message names a postal address and an unsubscribe path."""
    if re.search(r"unsubscribe", html, re.IGNORECASE) and re.search(r"Umraniye", html, re.IGNORECASE):
        return html
    footer = MARKETING_FOOTER
    if re.search(r"</body>", html, re.IGNORECASE):
        return re.sub(r"</body>", footer + "</body>", html, count=1, flags=re.IGNORECASE)
    return html + footer


def wrap_outbound_html(html: str) -> str:
    """Wrap a fragment in the outbound envelope and attach the marketing footer."""
    trimmed = (html or "").strip()
    if not trimmed:
        return ""
    if _HTML_DOC_RE.search(trimmed):
        return _with_marketing_footer(trimmed)
    return _with_marketing_footer(
        f"{OUTBOUND_HTML_WRAPPER_START}{trimmed}{OUTBOUND_HTML_WRAPPER_END}</body>\n</html>"
    )
