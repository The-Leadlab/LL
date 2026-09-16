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
</body>
</html>"""


def wrap_outbound_html(html: str) -> str:
    """Wrap a fragment in the outbound envelope; leave full HTML documents alone."""
    trimmed = (html or "").strip()
    if not trimmed:
        return ""
    if _HTML_DOC_RE.search(trimmed):
        return trimmed
    return f"{OUTBOUND_HTML_WRAPPER_START}{trimmed}{OUTBOUND_HTML_WRAPPER_END}"
