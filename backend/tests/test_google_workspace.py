from app.services.google_workspace import (
    column_field_map,
    parse_pasted_lead_rows,
    parse_spreadsheet_id,
)


def test_parse_spreadsheet_id_from_url_and_raw():
    url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
    assert parse_spreadsheet_id(url) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
    assert parse_spreadsheet_id("  abc_123-x  ") == "abc_123-x"
    assert parse_spreadsheet_id("") == ""


def test_parse_pasted_emails_without_header():
    rows = parse_pasted_lead_rows("ada@example.com\nBob <bob@example.com>\n")
    assert rows[0] == ["email"]
    assert rows[1] == ["ada@example.com"]
    assert rows[2] == ["bob@example.com"]


def test_parse_pasted_csv_with_header():
    rows = parse_pasted_lead_rows("email,first_name,company\nada@example.com,Ada,Analytical\n")
    assert rows[0][0] == "email"
    assert rows[1][1] == "Ada"
    mapped = column_field_map(["email", "first_name", "company"])
    assert mapped[0] == "email"
    assert mapped[1] == "first_name"
