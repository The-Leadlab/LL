"""Smoke tests for outreach platform helpers (no DB required beyond imports)."""

from datetime import datetime

from app.services.outreach_runner import (
    apply_tokens,
    next_send_slot,
    free_ai_service_rewrite_sync,
    make_idempotency_key,
)


def test_apply_tokens_and_idempotency():
    assert apply_tokens("Hi {{ first_name }}", {"first_name": "Ada"}, False) == "Hi Ada"
    a = make_idempotency_key("scenario", 1, "m1", 9)
    b = make_idempotency_key("scenario", 1, "m1", 9)
    assert a == b
    assert a != make_idempotency_key("scenario", 1, "m1", 10)


def test_send_window_and_rewrite():
    now = datetime(2026, 6, 9, 20, 0, 0)
    slot = next_send_slot(
        now,
        {"timezone": "UTC", "send_window_start": "09:00", "send_window_end": "17:00", "weekdays_only": True},
    )
    assert slot.day == 10 and slot.hour == 9
    out = free_ai_service_rewrite_sync("Sub", "Body", "shorten", None)
    assert out["subject"] == "Sub"
    assert "Body" in out["body"]
