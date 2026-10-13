from fastapi import HTTPException

from app.core.signup_protection import (
    REGISTER_RATE_LIMIT,
    check_register_rate_limit,
    reject_honeypot,
    verify_turnstile_token,
)


def test_honeypot_rejects_filled_field():
    try:
        reject_honeypot("https://spam.example")
        assert False, "expected honeypot rejection"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_honeypot_allows_empty_field():
    reject_honeypot("")
    reject_honeypot(None)


def test_register_rate_limit_blocks_after_threshold():
    ip = "203.0.113.9"
    now = 1_700_000_000.0
    for index in range(REGISTER_RATE_LIMIT):
        check_register_rate_limit(ip, now=now + index)
    try:
        check_register_rate_limit(ip, now=now + REGISTER_RATE_LIMIT)
        assert False, "expected rate limit"
    except HTTPException as exc:
        assert exc.status_code == 429


def test_turnstile_is_optional_without_secret(monkeypatch):
    from app.core import signup_protection as module

    monkeypatch.setattr(module.settings, "TURNSTILE_SECRET_KEY", None, raising=False)
    verify_turnstile_token(None, "127.0.0.1")
