from decimal import Decimal

from app.api.v1.endpoints.activities import _safe_sort_by
from app.schemas.deal import DealCreate


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
