from types import SimpleNamespace

from app.services.google_workspace import (
    lead_already_sent_for_campaign,
    lead_already_sent_on_sheet,
)


def test_campaign_scoped_sent_allows_new_campaign():
    lead = SimpleNamespace(
        outreach_meta={
            "status": "Sent",
            "campaigns": {"12": {"status": "Sent", "name": "Wave 1"}},
        }
    )
    assert lead_already_sent_on_sheet(lead) is True
    assert lead_already_sent_for_campaign(lead, 12) is True
    assert lead_already_sent_for_campaign(lead, 99) is False
