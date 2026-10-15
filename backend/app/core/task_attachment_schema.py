"""Ensure the task_attachments table exists on boot (Render has no Alembic migrate step)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_COLUMNS = (
    ("task_id", "INTEGER", "INT"),
    ("organization_id", "INTEGER", "INT"),
    ("filename", "VARCHAR(255)", "VARCHAR(255)"),
    ("stored_name", "VARCHAR(255)", "VARCHAR(255)"),
    ("content_type", "VARCHAR(255)", "VARCHAR(255)"),
    ("size_bytes", "BIGINT", "BIGINT"),
    ("blob", "BYTEA", "LONGBLOB"),
    ("uploaded_at", "TIMESTAMP WITHOUT TIME ZONE", "DATETIME"),
)


def ensure_task_attachments_schema(engine: Engine) -> None:
    """Create task_attachments and add any missing columns. Idempotent."""
    dialect = engine.dialect.name
    inspector = inspect(engine)

    if not inspector.has_table("task_attachments"):
        _create_table(engine, dialect)
        logger.info("Created task_attachments table")
        inspector = inspect(engine)

    if not inspector.has_table("task_attachments"):
        raise RuntimeError("task_attachments table could not be created")

    existing = {col["name"] for col in inspector.get_columns("task_attachments")}
    with engine.begin() as conn:
        for name, pg_type, mysql_type in _COLUMNS:
            if name in existing:
                continue
            col_type = pg_type if dialect == "postgresql" else mysql_type
            null_sql = "NULL" if name in {"content_type", "blob"} else "NULL"
            try:
                conn.execute(
                    text(f"ALTER TABLE task_attachments ADD COLUMN {name} {col_type} {null_sql}")
                )
                logger.info("Added task_attachments.%s", name)
            except Exception as exc:
                logger.warning("Could not add task_attachments.%s: %s", name, exc)

        try:
            if dialect == "postgresql":
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_task_attachments_stored_name "
                        "ON task_attachments (stored_name)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_task_attachments_task_id "
                        "ON task_attachments (task_id)"
                    )
                )
            elif dialect == "mysql":
                conn.execute(text("CREATE UNIQUE INDEX ix_task_attachments_stored_name ON task_attachments (stored_name)"))
        except Exception as exc:
            logger.warning("Could not ensure task_attachments indexes: %s", exc)


def _create_table(engine: Engine, dialect: str) -> None:
    if dialect == "postgresql":
        ddl = """
            CREATE TABLE IF NOT EXISTS task_attachments (
                id SERIAL PRIMARY KEY,
                task_id INTEGER NOT NULL,
                organization_id INTEGER NOT NULL,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(255) NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                blob BYTEA NULL,
                uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """
    elif dialect == "mysql":
        ddl = """
            CREATE TABLE IF NOT EXISTS task_attachments (
                id INT NOT NULL AUTO_INCREMENT,
                task_id INT NOT NULL,
                organization_id INT NOT NULL,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(255) NULL,
                size_bytes BIGINT NOT NULL DEFAULT 0,
                blob LONGBLOB NULL,
                uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            )
        """
    else:
        ddl = """
            CREATE TABLE IF NOT EXISTS task_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                organization_id INTEGER NOT NULL,
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
