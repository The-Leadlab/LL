"""Ensure support_ticket_attachments exists (create_all alone is unreliable on older DBs)."""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_DDL = """
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL UNIQUE,
    content_type VARCHAR(255),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    blob BYTEA,
    uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_support_ticket_attachments_ticket_id
    ON support_ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS ix_support_ticket_attachments_stored_name
    ON support_ticket_attachments (stored_name);
"""


def ensure_support_ticket_attachments_schema(engine: Engine) -> None:
    try:
        with engine.begin() as conn:
            for stmt in _DDL.strip().split(";"):
                cleaned = stmt.strip()
                if cleaned:
                    conn.execute(text(cleaned))
    except Exception:
        logger.exception("Could not ensure support_ticket_attachments schema")
