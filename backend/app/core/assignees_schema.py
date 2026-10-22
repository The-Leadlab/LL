"""Ensure client_assignees / lead_assignees tables exist (Render has no Alembic migrate step)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def ensure_assignees_schema(engine: Engine) -> None:
    """Create multi-assignee join tables and backfill from singular FKs. Idempotent."""
    dialect = engine.dialect.name
    inspector = inspect(engine)

    with engine.begin() as conn:
        if inspector.has_table("clients") and not inspector.has_table("client_assignees"):
            try:
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            """
                            CREATE TABLE client_assignees (
                                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                created_at TIMESTAMPTZ DEFAULT NOW(),
                                PRIMARY KEY (client_id, user_id)
                            )
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            CREATE TABLE client_assignees (
                                client_id INT NOT NULL,
                                user_id INT NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                PRIMARY KEY (client_id, user_id)
                            )
                            """
                        )
                    )
                logger.info("Created client_assignees table")
            except Exception as exc:
                logger.warning("Could not create client_assignees: %s", exc)

        if inspector.has_table("leads") and not inspector.has_table("lead_assignees"):
            try:
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            """
                            CREATE TABLE lead_assignees (
                                lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                created_at TIMESTAMPTZ DEFAULT NOW(),
                                PRIMARY KEY (lead_id, user_id)
                            )
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            CREATE TABLE lead_assignees (
                                lead_id INT NOT NULL,
                                user_id INT NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                PRIMARY KEY (lead_id, user_id)
                            )
                            """
                        )
                    )
                logger.info("Created lead_assignees table")
            except Exception as exc:
                logger.warning("Could not create lead_assignees: %s", exc)

        # Backfill client_assignees from legacy singular assigned_user_id
        try:
            cols = {c["name"] for c in inspector.get_columns("clients")} if inspector.has_table("clients") else set()
            if "assigned_user_id" in cols and inspector.has_table("client_assignees"):
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            """
                            INSERT INTO client_assignees (client_id, user_id)
                            SELECT id, assigned_user_id FROM clients
                            WHERE assigned_user_id IS NOT NULL
                            ON CONFLICT DO NOTHING
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            INSERT IGNORE INTO client_assignees (client_id, user_id)
                            SELECT id, assigned_user_id FROM clients
                            WHERE assigned_user_id IS NOT NULL
                            """
                        )
                    )
        except Exception as exc:
            logger.warning("Could not backfill client_assignees: %s", exc)

        # Backfill lead_assignees from primary user_id so multi-select starts populated
        try:
            if inspector.has_table("leads") and inspector.has_table("lead_assignees"):
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            """
                            INSERT INTO lead_assignees (lead_id, user_id)
                            SELECT id, user_id FROM leads
                            WHERE user_id IS NOT NULL AND is_deleted = false
                            ON CONFLICT DO NOTHING
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            INSERT IGNORE INTO lead_assignees (lead_id, user_id)
                            SELECT id, user_id FROM leads
                            WHERE user_id IS NOT NULL AND is_deleted = 0
                            """
                        )
                    )
        except Exception as exc:
            logger.warning("Could not backfill lead_assignees: %s", exc)
