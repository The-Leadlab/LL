"""Backward-compatible alias — prefer support_ticket_schema.ensure_support_tickets_schema. """
from __future__ import annotations

from sqlalchemy.engine import Engine

from app.core.support_ticket_schema import ensure_support_tickets_schema


def ensure_support_ticket_attachments_schema(engine: Engine) -> None:
    ensure_support_tickets_schema(engine)
