from types import SimpleNamespace

from app.core.avatars import avatar_color_for_user, initials_avatar_svg, user_initials
from app.core.workspace import (
    PERSONAL_ORG_SENTINEL,
    is_protected_workspace_user,
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
