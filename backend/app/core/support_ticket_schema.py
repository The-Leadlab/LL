"""Ensure support_tickets (+ attachments) exist on boot — Render has no Alembic migrate step."""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def ensure_support_tickets_schema(engine: Engine) -> None:
    """Create support_tickets and support_ticket_attachments if missing. Idempotent."""
    dialect = engine.dialect.name
    inspector = inspect(engine)

    if not inspector.has_table("support_tickets"):
        _create_tickets_table(engine, dialect)
        logger.info("Created support_tickets table")
        inspector = inspect(engine)

    if not inspector.has_table("support_tickets"):
        raise RuntimeError("support_tickets table could not be created")

    if not inspector.has_table("support_ticket_attachments"):
        _create_attachments_table(engine, dialect)
        logger.info("Created support_ticket_attachments table")

    _ensure_indexes(engine, dialect)


def _create_tickets_table(engine: Engine, dialect: str) -> None:
    if dialect == "postgresql":
        ddl = """
            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                reporter_name VARCHAR(200) NOT NULL,
                reporter_email VARCHAR(255) NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                subject VARCHAR(500) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'open',
                priority VARCHAR(40) NOT NULL DEFAULT 'normal',
                organization_id INTEGER NULL,
                reporter_user_id INTEGER NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """
    elif dialect == "mysql":
        ddl = """
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INT NOT NULL AUTO_INCREMENT,
                reporter_name VARCHAR(200) NOT NULL,
                reporter_email VARCHAR(255) NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                subject VARCHAR(500) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'open',
                priority VARCHAR(40) NOT NULL DEFAULT 'normal',
                organization_id INT NULL,
                reporter_user_id INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            )
        """
    else:
        ddl = """
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_name VARCHAR(200) NOT NULL,
                reporter_email VARCHAR(255) NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                subject VARCHAR(500) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'open',
                priority VARCHAR(40) NOT NULL DEFAULT 'normal',
                organization_id INTEGER,
                reporter_user_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _create_attachments_table(engine: Engine, dialect: str) -> None:
    if dialect == "postgresql":
        ddl = """
            CREATE TABLE IF NOT EXISTS support_ticket_attachments (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(255) NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                blob BYTEA NULL,
                uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
        """
    elif dialect == "mysql":
        ddl = """
            CREATE TABLE IF NOT EXISTS support_ticket_attachments (
                id INT NOT NULL AUTO_INCREMENT,
                ticket_id INT NOT NULL,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(255) NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                blob LONGBLOB NULL,
                uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                CONSTRAINT fk_sta_ticket FOREIGN KEY (ticket_id)
                    REFERENCES support_tickets(id) ON DELETE CASCADE
            )
        """
    else:
        ddl = """
            CREATE TABLE IF NOT EXISTS support_ticket_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(255),
                size_bytes INTEGER NOT NULL DEFAULT 0,
                blob BLOB,
                uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _ensure_indexes(engine: Engine, dialect: str) -> None:
    with engine.begin() as conn:
        try:
            if dialect == "postgresql":
                for stmt in (
                    "CREATE INDEX IF NOT EXISTS ix_support_tickets_reporter_email ON support_tickets (reporter_email)",
                    "CREATE INDEX IF NOT EXISTS ix_support_tickets_project_name ON support_tickets (project_name)",
                    "CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets (status)",
                    "CREATE INDEX IF NOT EXISTS ix_support_tickets_organization_id ON support_tickets (organization_id)",
                    "CREATE INDEX IF NOT EXISTS ix_support_tickets_reporter_user_id ON support_tickets (reporter_user_id)",
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_support_ticket_attachments_stored_name ON support_ticket_attachments (stored_name)",
                    "CREATE INDEX IF NOT EXISTS ix_support_ticket_attachments_ticket_id ON support_ticket_attachments (ticket_id)",
                ):
                    conn.execute(text(stmt))
            elif dialect == "mysql":
                # MySQL lacks IF NOT EXISTS for indexes on older versions — ignore duplicates.
                for stmt in (
                    "CREATE INDEX ix_support_tickets_reporter_email ON support_tickets (reporter_email)",
                    "CREATE INDEX ix_support_tickets_status ON support_tickets (status)",
                    "CREATE UNIQUE INDEX ix_support_ticket_attachments_stored_name ON support_ticket_attachments (stored_name)",
                    "CREATE INDEX ix_support_ticket_attachments_ticket_id ON support_ticket_attachments (ticket_id)",
                ):
                    try:
                        conn.execute(text(stmt))
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning("Could not ensure support_tickets indexes: %s", exc)
