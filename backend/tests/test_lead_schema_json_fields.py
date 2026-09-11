from app.schemas.lead import LeadBase


def test_outreach_meta_empty_string_coerces_to_dict():
    lead = LeadBase(outreach_meta="")
    assert lead.outreach_meta == {}


def test_outreach_meta_json_string_parses():
    lead = LeadBase(outreach_meta='{"status":"Sent"}')
    assert lead.outreach_meta == {"status": "Sent"}


def test_sales_intelligence_empty_string_coerces_to_dict():
    lead = LeadBase(sales_intelligence="")
    assert lead.sales_intelligence == {}
