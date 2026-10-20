from types import SimpleNamespace

from app.core.avatars import avatar_color_for_user, initials_avatar_svg, user_initials
from app.core.workspace import (
    PERSONAL_ORG_SENTINEL,
    email_domain,
    is_protected_workspace_user,
    is_shared_business_domain,
    parse_moved_user_log_lines,
    user_should_keep_shared_org,
)


def test_user_initials_from_first_and_last():
    assert user_initials("Anneka", "Callot", "contact@serendien.ch") == "AC"


def test_user_initials_from_email_when_name_missing():
    assert user_initials("", "", "contact@serendien.ch") == "CO"


def test_initials_avatar_svg_is_not_a_tiny_placeholder():
    svg = initials_avatar_svg(
        user_id=7,
        first_name="Anneka",
        last_name="Callot",
        email="contact@serendien.ch",
    )
    text = svg.decode("utf-8")
    assert text.startswith("<svg")
    assert "AC" in text
    assert "#FFFFFF" in text
    assert avatar_color_for_user(7) in text
    assert len(svg) > 200


def test_protected_workspace_user():
    assert is_protected_workspace_user(SimpleNamespace(email="ali@the-leadlab.com")) is True
    assert is_protected_workspace_user(SimpleNamespace(email="contact@serendien.ch")) is False


def test_business_email_domains_share_org():
    assert email_domain("joshua@the-leadlab.com") == "the-leadlab.com"
    assert is_shared_business_domain("the-leadlab.com") is True
    assert is_shared_business_domain("deluxepad.com") is True
    assert is_shared_business_domain("autothineta.com") is True
    assert is_shared_business_domain("gmail.com") is False
    assert is_shared_business_domain("yahoo.com") is False


def test_solo_user_keeps_workspace():
    class _Query:
        def filter(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def all(self):
            return []

    db = SimpleNamespace(query=lambda *_args, **_kwargs: _Query())
    user = SimpleNamespace(id=2, email="contact@serendien.ch", organization_id=1)
    assert user_should_keep_shared_org(db, user) is True


def test_personal_org_sentinel():
    assert PERSONAL_ORG_SENTINEL == 0


def test_user_with_shared_org_work_is_kept(monkeypatch):
    monkeypatch.setattr("app.core.workspace.is_protected_workspace_user", lambda _user: False)
    monkeypatch.setattr("app.core.workspace._active_org_peer_ids", lambda _db, _user: [1])
    monkeypatch.setattr("app.core.workspace.is_org_founder", lambda _db, _user: False)
    monkeypatch.setattr("app.core.workspace.has_team_membership", lambda _db, _user: False)
    monkeypatch.setattr("app.core.workspace.user_has_shared_org_work", lambda _db, _user: True)
    user = SimpleNamespace(id=9, email="joshua@the-leadlab.com", organization_id=4)
    assert user_should_keep_shared_org(None, user) is True


def test_parse_moved_user_log_lines():
    text = "Moved user 42 from org 7 to personal workspace 99\nnoise\nMoved user 8 from org 7 to personal workspace 100"
    assert parse_moved_user_log_lines(text) == [(42, 7, 99), (8, 7, 100)]
