import asyncio
from types import SimpleNamespace

from app.services.email_service import EmailService
from app.core.email import EmailSender
from app.core.config import settings
from app.api.v1.endpoints import team_invitations as team_invitations_endpoint
from fastapi import HTTPException


class _FakeQuery:
    def __init__(self, account):
        self._account = account

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._account


class _FakeDB:
    def __init__(self, account):
        self._account = account
        self.added = []
        self.commits = 0

    def query(self, model):
        return _FakeQuery(self._account)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1

    def rollback(self):
        return None


def _build_account():
    return SimpleNamespace(
        id=1,
        email="user@example.com",
        display_name="User",
        smtp_host="smtp.gmail.com",
        smtp_port=465,
        smtp_use_tls=False,
        password_encrypted="encrypted",
        organization_id=1,
    )


def test_send_email_auto_falls_back_to_api(monkeypatch):
    account = _build_account()
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["transport"] == "api"


def test_send_email_returns_provider_error_when_all_transports_fail(monkeypatch):
    account = _build_account()
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)

    def _provider_fail(*args, **kwargs):
        service._set_send_error("PROVIDER_UNAVAILABLE", "Provider timeout", True, 503)
        return False

    monkeypatch.setattr(service, "_send_email_provider_api", _provider_fail)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is False
    assert service.last_send_error_code == "PROVIDER_UNAVAILABLE"
    assert service.last_send_retryable is True
    assert service.last_send_status_code == 503


def test_send_email_google_oauth_uses_gmail_api_not_resend(monkeypatch):
    account = _build_account()
    account.auth_type = "oauth"
    account.oauth_refresh_token = "refresh-token"
    account.provider_type = "gmail"
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "api")
    monkeypatch.setattr(service, "_send_email_gmail_api", lambda *args, **kwargs: True)

    def _must_not_resend(*args, **kwargs):
        raise AssertionError("OAuth mailbox must not send via Resend no-reply")

    monkeypatch.setattr(service, "_send_email_provider_api", _must_not_resend)
    monkeypatch.setattr(service, "_send_email_smtp", _must_not_resend)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["transport"] == "gmail_api"


def test_send_email_raises_for_missing_account(monkeypatch):
    service = EmailService(_FakeDB(None))
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")

    try:
        service.send_email(999, ["to@example.com"], "Subject")
        assert False, "Expected ValueError for missing account"
    except ValueError as exc:
        assert "Email account not found" in str(exc)


def test_email_sender_production_missing_smtp_returns_false(monkeypatch):
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    sender = EmailSender()
    sender.smtp_user = None
    sender.smtp_password = None

    result = asyncio.run(
        sender.send_email(
            to_email="invitee@example.com",
            subject="Invite",
            html_content="<p>Join</p>",
            text_content="Join",
        )
    )

    assert result is False


def test_email_sender_development_missing_smtp_uses_mock(monkeypatch):
    monkeypatch.setattr(settings, "ENV", "development")
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    sender = EmailSender()
    sender.smtp_user = None
    sender.smtp_password = None

    result = asyncio.run(
        sender.send_email(
            to_email="invitee@example.com",
            subject="Invite",
            html_content="<p>Join</p>",
            text_content="Join",
        )
    )

    assert result is True


def test_email_sender_auto_prefers_smtp_before_resend(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    sender = EmailSender()
    calls = []

    async def _fake_smtp(**kwargs):
        calls.append("smtp")
        return True

    async def _fake_resend(**kwargs):
        calls.append("api")
        return True

    monkeypatch.setattr(sender, "_send_via_smtp", _fake_smtp)
    monkeypatch.setattr(sender, "_send_via_resend_api", _fake_resend)

    result = asyncio.run(
        sender.send_email(
            to_email="invitee@example.com",
            subject="Invite",
            html_content="<p>Join</p>",
            text_content="Join",
        )
    )

    assert result is True
    assert calls == ["smtp"]


def test_email_sender_auto_falls_back_to_resend_when_smtp_fails(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    sender = EmailSender()
    calls = []

    async def _fake_smtp(**kwargs):
        calls.append("smtp")
        return False

    async def _fake_resend(**kwargs):
        calls.append("api")
        return True

    monkeypatch.setattr(sender, "_send_via_smtp", _fake_smtp)
    monkeypatch.setattr(sender, "_send_via_resend_api", _fake_resend)

    result = asyncio.run(
        sender.send_email(
            to_email="invitee@example.com",
            subject="Invite",
            html_content="<p>Join</p>",
            text_content="Join",
        )
    )

    assert result is True
    assert calls == ["smtp", "api"]


def test_invitation_wrapper_awaits_async_sender(monkeypatch):
    called = {"value": False}

    async def _fake_send_team_invitation(*args, **kwargs):
        called["value"] = True
        return True

    monkeypatch.setattr(
        team_invitations_endpoint.email_sender,
        "send_team_invitation",
        _fake_send_team_invitation,
    )

    asyncio.run(
        team_invitations_endpoint._send_invitation_email_or_raise(
            email="invitee@example.com",
            inviter_name="Ali Attia",
            organization_name="LeadLab",
            invitation_link="https://the-leadlab.com/invite/token-123",
            role="member",
            message="Welcome",
        )
    )

    assert called["value"] is True


def test_invitation_wrapper_raises_http_exception_when_send_returns_false(monkeypatch):
    async def _fake_send_team_invitation(*args, **kwargs):
        return False

    monkeypatch.setattr(
        team_invitations_endpoint.email_sender,
        "send_team_invitation",
        _fake_send_team_invitation,
    )

    try:
        asyncio.run(
            team_invitations_endpoint._send_invitation_email_or_raise(
                email="invitee@example.com",
                inviter_name="Ali Attia",
                organization_name="LeadLab",
                invitation_link="https://the-leadlab.com/invite/token-123",
                role="member",
                message="Welcome",
            )
        )
        assert False, "Expected HTTPException when invitation delivery fails"
    except HTTPException as exc:
        assert exc.status_code == 502
