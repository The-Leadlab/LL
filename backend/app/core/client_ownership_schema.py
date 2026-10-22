"""Ensure clients ownership columns exist on boot (Render has no Alembic migrate step)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_COLUMNS = (
    ("created_by", "INTEGER", "INT"),
    ("assigned_user_id", "INTEGER", "INT"),
)


def ensure_client_ownership_schema(engine: Engine) -> None:
    """Add created_by / assigned_user_id to clients if missing. Idempotent."""
    dialect = engine.dialect.name
    inspector = inspect(engine)

    if not inspector.has_table("clients"):
        logger.info("clients table not present yet; skipping ownership columns")
        return

    existing = {col["name"] for col in inspector.get_columns("clients")}
    with engine.begin() as conn:
        for name, pg_type, mysql_type in _COLUMNS:
            if name in existing:
                continue
            col_type = pg_type if dialect == "postgresql" else mysql_type
            try:
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            f"ALTER TABLE clients ADD COLUMN {name} {col_type} NULL "
                            f"REFERENCES users(id) ON DELETE SET NULL"
                        )
                    )
                else:
                    conn.execute(
                        text(f"ALTER TABLE clients ADD COLUMN {name} {col_type} NULL")
                    )
                logger.info("Added clients.%s", name)
            except Exception as exc:
                logger.warning("Could not add clients.%s: %s", name, exc)

        for name in ("created_by", "assigned_user_id"):
            idx = f"ix_clients_{name}"
            try:
                if dialect == "postgresql":
                    conn.execute(
                        text(f"CREATE INDEX IF NOT EXISTS {idx} ON clients ({name})")
                    )
                elif dialect == "mysql":
                    # MySQL lacks IF NOT EXISTS for indexes on older versions; ignore dupes
                    try:
                        conn.execute(text(f"CREATE INDEX {idx} ON clients ({name})"))
                    except Exception:
                        pass
            except Exception as exc:
                logger.warning("Could not ensure index %s: %s", idx, exc)
