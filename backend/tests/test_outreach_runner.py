"""Unit tests for outreach token merge and send-window scheduling."""

from datetime import datetime

from app.services.outreach_runner import apply_tokens, next_send_slot


def test_apply_tokens_plain():
    out = apply_tokens("Hi {{first_name}} at {{company}}", {"first_name": "Ada", "company": "Analytica"}, as_html=False)
    assert out == "Hi Ada at Analytica"


def test_apply_tokens_html_escapes():
    out = apply_tokens("Hi {{first_name}}", {"first_name": "A <b>B</b>"}, as_html=True)
    assert "<b>" not in out
    assert "&lt;b&gt;" in out


def test_next_send_slot_noop_without_settings():
    now = datetime(2026, 6, 9, 12, 0, 0)
    assert next_send_slot(now, None) == now
    assert next_send_slot(now, {}) == now


def test_next_send_slot_defers_outside_window():
    # Tuesday 20:00 UTC with 09-17 UTC window → next morning 09:00
    now = datetime(2026, 6, 9, 20, 0, 0)
    slot = next_send_slot(
        now,
        {
            "timezone": "UTC",
            "send_window_start": "09:00",
            "send_window_end": "17:00",
            "weekdays_only": True,
        },
    )
    assert slot.hour == 9
    assert slot.day == 10
