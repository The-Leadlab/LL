"""Generated profile avatars (initials) when no photo is uploaded."""
from __future__ import annotations

import html
from typing import Optional

# Saturated colors — never white / near-white so the sidebar circle stays visible.
_AVATAR_COLORS = (
    "#1D4ED8",
    "#0F766E",
    "#7C3AED",
    "#C2410C",
    "#BE123C",
    "#0369A1",
    "#15803D",
    "#A16207",
)


def user_initials(first_name: Optional[str], last_name: Optional[str], email: Optional[str] = None) -> str:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    if first and last:
        return f"{first[0]}{last[0]}".upper()
    if first:
        return first[:2].upper()
    if last:
        return last[:2].upper()
    local = (email or "").split("@")[0].strip()
    if len(local) >= 2:
        return local[:2].upper()
    if local:
        return (local[0] * 2).upper()
    return "U"


def avatar_color_for_user(user_id: int) -> str:
    return _AVATAR_COLORS[abs(int(user_id or 0)) % len(_AVATAR_COLORS)]


def initials_avatar_svg(
    *,
    user_id: int,
    first_name: Optional[str],
    last_name: Optional[str],
    email: Optional[str] = None,
    size: int = 128,
) -> bytes:
    initials = html.escape(user_initials(first_name, last_name, email))
    color = avatar_color_for_user(user_id)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="{initials}">
  <rect width="100%" height="100%" fill="{color}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, Segoe UI, sans-serif" font-size="{int(size * 0.42)}" font-weight="700" fill="#FFFFFF">{initials}</text>
</svg>
"""
    return svg.encode("utf-8")
