"""Attach CORS headers to every HTTP response, including errors and redirects.

Starlette's CORSMiddleware can miss responses produced by BaseHTTPMiddleware
exception paths and by unhandled 500s. Browsers then report a CORS failure
instead of the real 422/500 (audit B16, B21).
"""

from __future__ import annotations

import re
from typing import Iterable, Optional

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "https://the-leadlab.com",
    "https://www.the-leadlab.com",
    "https://api.the-leadlab.com",
    "https://ll-alilead.vercel.app",
}

_VERCEL_ORIGIN = re.compile(r"https://.*\.vercel\.app$")


def origin_is_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    return bool(_VERCEL_ORIGIN.match(origin))


class CORSOnErrorMiddleware:
    """Pure ASGI middleware. Add it last so it is the outermost user middleware."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        origin = _header(scope, b"origin")
        allowed = origin_is_allowed(origin)

        async def send_with_cors(message):
            if allowed and message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                names = {name.lower() for name, _ in headers}
                if b"access-control-allow-origin" not in names:
                    headers.append((b"access-control-allow-origin", origin.encode()))
                    headers.append((b"access-control-allow-credentials", b"true"))
                if b"vary" not in names:
                    headers.append((b"vary", b"Origin"))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_cors)
        except Exception:
            body = b'{"detail":"Internal server error"}'
            headers = [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ]
            if allowed:
                headers.append((b"access-control-allow-origin", origin.encode()))
                headers.append((b"access-control-allow-credentials", b"true"))
                headers.append((b"vary", b"Origin"))
            await send({"type": "http.response.start", "status": 500, "headers": headers})
            await send({"type": "http.response.body", "body": body})


def _header(scope, name: bytes) -> Optional[str]:
    for key, value in scope.get("headers") or []:
        if key.lower() == name:
            return value.decode("latin-1")
    return None
