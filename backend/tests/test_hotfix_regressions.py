from decimal import Decimal

from app.api.v1.endpoints.activities import _safe_sort_by
from app.crud.crud_lead import lead_search_tokens
from app.schemas.deal import DealCreate, DealUpdate


def test_empty_valid_until_coerces_to_none():
    deal = DealCreate(
        name="Pipeline deal",
        amount=Decimal("1000"),
        currency_id=1,
        status="Lead",
        assigned_to_id=1,
        lead_id=1,
        valid_until="",
    )
    assert deal.valid_until is None


def test_activity_sort_falls_back_when_column_missing():
    assert _safe_sort_by("created_at") == "created_at"
    assert _safe_sort_by("completed_at") in {"created_at", "id"}
    assert _safe_sort_by("not_a_column") in {"created_at", "id"}


def test_empty_valid_until_on_update_coerces_to_none():
    deal = DealUpdate(valid_until="")
    assert deal.valid_until is None


def test_lead_search_tokens_split_on_spaces():
    assert lead_search_tokens("QA TE") == ["QA", "TE"]
    assert lead_search_tokens("  QA TEST L ") == ["QA", "TEST", "L"]


def test_task_attachments_schema_creates_blob_column(tmp_path):
    from sqlalchemy import create_engine, inspect

    from app.core.task_attachment_schema import ensure_task_attachments_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'att.db'}")
    ensure_task_attachments_schema(engine)
    columns = {col["name"] for col in inspect(engine).get_columns("task_attachments")}
    assert "blob" in columns
    assert "stored_name" in columns
    ensure_task_attachments_schema(engine)
