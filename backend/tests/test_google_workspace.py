from app.services.google_workspace import (
    column_field_map,
    parse_pasted_lead_rows,
    parse_spreadsheet_id,
    preview_mapped_rows,
    split_full_name,
)


def test_parse_spreadsheet_id_from_url_and_raw():
    url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
    assert parse_spreadsheet_id(url) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
    assert parse_spreadsheet_id("  abc_123-x  ") == "abc_123-x"
    assert parse_spreadsheet_id("") == ""


def test_parse_pasted_emails_without_header():
    rows = parse_pasted_lead_rows("ada@example.com\nBob <bob@example.com>\n")
    assert rows[0] == ["email", "first_name", "last_name"]
    assert rows[1][0] == "ada@example.com"
    assert rows[2][0] == "bob@example.com"
    assert rows[2][1] == "Bob"


def test_parse_pasted_csv_with_header():
    rows = parse_pasted_lead_rows("email,first_name,company\nada@example.com,Ada,Analytical\n")
    assert rows[0][0] == "email"
    assert rows[1][1] == "Ada"
    mapped = column_field_map(["email", "first_name", "company"])
    assert mapped[0] == "email"
    assert mapped[1] == "first_name"


def test_parse_csv_friendly_headers_and_full_name():
    rows = parse_pasted_lead_rows(
        "Email Address,First Name,Last Name,Company,Job Title\n"
        "ada@example.com,Ada,Lovelace,Analytical Engines,Mathematician\n"
    )
    preview = preview_mapped_rows(rows)
    assert preview["has_email"] is True
    assert preview["mapping"]["Email Address"] == "email"
    assert preview["mapping"]["First Name"] == "first_name"
    assert preview["sample"][0]["first_name"] == "Ada"
    assert preview["sample"][0]["job_title"] == "Mathematician"


def test_parse_name_column_splits_full_name():
    rows = parse_pasted_lead_rows("name,email\nAli Attia,ali@the-leadlab.com\n")
    preview = preview_mapped_rows(rows)
    assert preview["sample"][0]["first_name"] == "Ali"
    assert preview["sample"][0]["last_name"] == "Attia"
    assert preview["sample"][0]["email"] == "ali@the-leadlab.com"


def test_infer_columns_without_header():
    rows = parse_pasted_lead_rows("Ali,Attia,ali@the-leadlab.com\nAda,Lovelace,ada@example.com\n")
    assert rows[0][2] == "email"
    preview = preview_mapped_rows(rows)
    assert preview["sample"][0]["first_name"] == "Ali"
    assert preview["sample"][0]["email"] == "ali@the-leadlab.com"


def test_split_full_name_last_first():
    assert split_full_name("Attia, Ali") == ("Ali", "Attia")
    assert split_full_name("Ada Lovelace") == ("Ada", "Lovelace")
