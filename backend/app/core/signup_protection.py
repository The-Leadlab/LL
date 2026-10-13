"""Signup bot protection: honeypot, in-memory rate limit, optional Turnstile."""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from threading import Lock
from typing import DefaultDict, List, Optional

import requests
from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)

_REGISTER_ATTEMPTS: DefaultDict[str, List[float]] = defaultdict(list)
_REGISTER_LOCK = Lock()
REGISTER_RATE_LIMIT = 5
REGISTER_RATE_WINDOW_SECONDS = 3600
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def reject_honeypot(value: Optional[str]) -> None:
    if value and str(value).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid submission")


def check_register_rate_limit(ip: str, *, now: Optional[float] = None) -> None:
    current = now if now is not None else time.time()
    cutoff = current - REGISTER_RATE_WINDOW_SECONDS
    with _REGISTER_LOCK:
        recent = [ts for ts in _REGISTER_ATTEMPTS[ip] if ts > cutoff]
        if len(recent) >= REGISTER_RATE_LIMIT:
            _REGISTER_ATTEMPTS[ip] = recent
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many signup attempts. Please try again later.",
            )
        recent.append(current)
        _REGISTER_ATTEMPTS[ip] = recent


def verify_turnstile_token(token: Optional[str], ip: str) -> None:
    secret = getattr(settings, "TURNSTILE_SECRET_KEY", None)
    if not secret:
        return
    if not token or not str(token).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Captcha verification is required")
    try:
        response = requests.post(
            TURNSTILE_VERIFY_URL,
            data={"secret": secret, "response": token, "remoteip": ip},
            timeout=8,
        )
        payload = response.json() if response.content else {}
    except Exception:
        logger.exception("Turnstile verification request failed")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Captcha verification failed")
    if not payload.get("success"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Captcha verification failed")
