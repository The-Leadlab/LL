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


def _build_account(**overrides):
    defaults = dict(
        id=1,
        email="user@example.com",
        display_name="User",
        smtp_host="smtp.gmail.com",
        smtp_port=465,
        smtp_use_tls=False,
        password_encrypted="encrypted",
        organization_id=1,
        auth_type="password",
        oauth_refresh_token=None,
        provider_type="gmail",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_send_email_auto_falls_back_to_api_when_from_matches(monkeypatch):
    """API fallback is allowed when Resend From matches the account email."""
    account = _build_account(email="noreply@the-leadlab.com")
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["transport"] == "api"


def test_send_email_returns_provider_error_when_all_transports_fail(monkeypatch):
    account = _build_account(email="noreply@the-leadlab.com")
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
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


# ---------------------------------------------------------------------------
# Custom SMTP fallback guard: From-rewrite prevention
# ---------------------------------------------------------------------------


def test_custom_smtp_account_no_resend_fallback_on_from_mismatch(monkeypatch):
    """Custom SMTP account must NOT fall back to Resend when From would change."""
    account = _build_account(
        email="contact@serenidien.ch",
        provider_type="custom",
        smtp_host="mail.infomaniak.com",
        smtp_port=465,
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)

    api_called = {"value": False}

    def _spy_api(*args, **kwargs):
        api_called["value"] = True
        return True

    monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False, "Should NOT silently send as noreply"
    assert api_called["value"] is False, "Provider API must not be called"
    assert "rewrite" in (service.last_send_error or "").lower()


def test_custom_smtp_account_allows_fallback_when_from_matches(monkeypatch):
    """If Resend From happens to match the custom account email, fallback is fine."""
    account = _build_account(
        email="contact@serenidien.ch",
        provider_type="custom",
        smtp_host="mail.infomaniak.com",
        smtp_port=465,
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "contact@serenidien.ch")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is True
    assert result["transport"] == "api"


def test_google_oauth_path_unchanged(monkeypatch):
    """Google OAuth accounts still use Gmail API regardless of provider mode."""
    account = _build_account(
        auth_type="oauth",
        oauth_refresh_token="refresh-token",
        provider_type="gmail",
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(service, "_send_email_gmail_api", lambda *args, **kwargs: True)

    def _must_not_call(*args, **kwargs):
        raise AssertionError("Should not reach SMTP or Resend for Google OAuth")

    monkeypatch.setattr(service, "_send_email_smtp", _must_not_call)
    monkeypatch.setattr(service, "_send_email_provider_api", _must_not_call)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["transport"] == "gmail_api"


def test_explicit_smtp_mode_no_fallback(monkeypatch):
    """provider_mode=smtp never tries the API, even for non-custom accounts."""
    account = _build_account()
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)

    api_called = {"value": False}

    def _spy_api(*args, **kwargs):
        api_called["value"] = True
        return True

    monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is False
    assert api_called["value"] is False


def test_explicit_api_mode_uses_mailbox_smtp_when_from_would_rewrite(monkeypatch):
    """EMAIL_PROVIDER=api must still send from the linked mailbox, not no-reply."""
    account = _build_account(
        email="contact@serenidien.ch",
        provider_type="custom",
        smtp_host="mail.infomaniak.com",
        smtp_port=465,
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "api")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: True)

    api_called = {"value": False}

    def _spy_api(*args, **kwargs):
        api_called["value"] = True
        return True

    monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "<p>Hi</p>")
    assert result["sent"] is True
    assert result["transport"] == "smtp"
    assert api_called["value"] is False


def test_explicit_api_mode_uses_api_when_from_matches(monkeypatch):
    """provider_mode=api sends via API only when From stays the linked address."""
    account = _build_account(email="noreply@the-leadlab.com")
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "api")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    def _must_not_smtp(*args, **kwargs):
        raise AssertionError("Matching From may use API directly")

    monkeypatch.setattr(service, "_send_email_smtp", _must_not_smtp)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["transport"] == "api"


def test_gmail_password_account_no_resend_fallback_on_from_mismatch(monkeypatch):
    """Password Gmail accounts must not fall back to no-reply either."""
    account = _build_account(
        email="user@gmail.com",
        provider_type="gmail",
        auth_type="password",
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: False)

    api_called = {"value": False}

    def _spy_api(*args, **kwargs):
        api_called["value"] = True
        return True

    monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)
    monkeypatch.setattr(service, "_persist_sent_email", lambda *args, **kwargs: None)

    result = service.send_email(1, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False
    assert api_called["value"] is False
    assert "rewrite" in (service.last_send_error or "").lower()


def test_persist_records_actual_from_when_api_transport(monkeypatch):
    """API sends persist the Resend From address, not a rewritten local copy."""
    account = _build_account(email="noreply@the-leadlab.com")
    service = EmailService(_FakeDB(account))
    captured = {}

    def _capture_persist(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "api")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)
    monkeypatch.setattr(service, "_persist_sent_email", _capture_persist)

    result = service.send_email(1, ["to@example.com"], "Subject", "Text", "Html")
    assert result["sent"] is True
    assert result["persisted"] is True
    assert captured.get("actual_from_email") == "noreply@the-leadlab.com"
    assert captured.get("transport") == "api"


def test_smtp_failure_surfaces_error_for_custom_account(monkeypatch):
    """last_send_error must clearly describe why the send was not attempted via API."""
    account = _build_account(
        email="contact@serenidien.ch",
        provider_type="custom",
        smtp_host="mail.infomaniak.com",
        smtp_port=465,
    )
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    def _smtp_timeout(*args, **kwargs):
        service._set_send_error("SMTP_TIMEOUT", "Connection timed out", True, 503)
        return False

    monkeypatch.setattr(service, "_send_email_smtp", _smtp_timeout)
    monkeypatch.setattr(service, "_send_email_provider_api", lambda *args, **kwargs: True)

    result = service.send_email(1, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False
    assert service.last_send_error is not None
    assert "rewrite" in service.last_send_error.lower()
    assert "noreply@the-leadlab.com" in service.last_send_error
    assert "SMTP" in (service.last_send_error_code or "")


def test_wrap_outbound_html_envelope_matches_preview():
    from app.services.email_html import wrap_outbound_html

    wrapped = wrap_outbound_html("<p>Hello {{first_name}}</p>")
    assert wrapped.startswith("<!DOCTYPE html>")
    assert "Georgia" in wrapped
    assert "<p>Hello {{first_name}}</p>" in wrapped
    full = "<html><body><p>Designed</p></body></html>"
    assert wrap_outbound_html(full) == full
    assert wrap_outbound_html("  ") == ""


# ---------------------------------------------------------------------------
# SMTP timeout → port-fallback and retry tests
# ---------------------------------------------------------------------------


def _build_infomaniak_account(**overrides):
    defaults = dict(
        id=3,
        email="contact@serenidien.ch",
        display_name="Serenidien",
        smtp_host="mail.infomaniak.com",
        smtp_port=465,
        smtp_use_tls=False,
        password_encrypted="encrypted",
        organization_id=1,
        auth_type="password",
        oauth_refresh_token=None,
        provider_type="custom",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_smtp_timeout_on_587_falls_back_to_465_ssl(monkeypatch):
    """When configured port 587 times out, retry on 465 SSL should succeed."""
    account = _build_infomaniak_account(smtp_port=587, smtp_use_tls=True)
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(
        "app.services.email_service.decrypt_password", lambda _: "password"
    )
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    call_log = []

    def _fake_try(self, host, port, use_ssl, use_starttls, pw, addr, msg, recip, timeout):
        call_log.append((port, use_ssl))
        if port == 587:
            return False, "timeout", "timed out"
        return True, None, None

    monkeypatch.setattr(EmailService, "_try_smtp_send", _fake_try)
    monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is True
    assert result["transport"] == "smtp"
    assert call_log[0] == (587, False), "First attempt should be configured port 587"
    assert call_log[1] == (465, True), "Fallback should be 465 SSL"


def test_smtp_timeout_on_465_falls_back_to_587_starttls(monkeypatch):
    """When configured port 465 times out, retry on 587 STARTTLS should succeed."""
    account = _build_infomaniak_account(smtp_port=465)
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(
        "app.services.email_service.decrypt_password", lambda _: "password"
    )
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    call_log = []

    def _fake_try(self, host, port, use_ssl, use_starttls, pw, addr, msg, recip, timeout):
        call_log.append((port, use_ssl))
        if port == 465:
            return False, "timeout", "timed out"
        return True, None, None

    monkeypatch.setattr(EmailService, "_try_smtp_send", _fake_try)
    monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is True
    assert result["transport"] == "smtp"
    assert call_log[0] == (465, True), "First attempt should be configured port 465 SSL"
    assert call_log[1] == (587, False), "Fallback should be 587 STARTTLS"


def test_smtp_all_attempts_timeout_reports_retryable(monkeypatch):
    """When all 3 attempts time out the job should be retryable."""
    account = _build_infomaniak_account(smtp_port=465)
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(
        "app.services.email_service.decrypt_password", lambda _: "password"
    )
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    call_log = []

    def _fake_try(self, host, port, use_ssl, use_starttls, pw, addr, msg, recip, timeout):
        call_log.append(port)
        return False, "timeout", "timed out"

    monkeypatch.setattr(EmailService, "_try_smtp_send", _fake_try)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False
    assert len(call_log) == 3, "Should make 3 attempts (primary, alt, retry)"
    assert service.last_send_error_code == "SMTP_TIMEOUT"
    assert service.last_send_retryable is True


def test_smtp_timeout_no_noreply_rewrite_on_custom_account(monkeypatch):
    """Custom SMTP timeout must NOT fall back to Resend noreply — From would change."""
    account = _build_infomaniak_account()
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    def _smtp_always_timeout(*args, **kwargs):
        service._set_send_error("SMTP_TIMEOUT", "timed out", True, 503)
        return False

    monkeypatch.setattr(service, "_send_email_smtp", _smtp_always_timeout)

    api_called = {"value": False}

    def _spy_api(*args, **kwargs):
        api_called["value"] = True
        return True

    monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False, "Must not silently send as noreply"
    assert api_called["value"] is False, "Provider API must not be called"
    assert "rewrite" in (service.last_send_error or "").lower()
    assert "noreply@the-leadlab.com" in (service.last_send_error or "")


def test_smtp_auth_error_aborts_immediately(monkeypatch):
    """Authentication errors should not try further ports."""
    account = _build_infomaniak_account(smtp_port=465)
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(
        "app.services.email_service.decrypt_password", lambda _: "password"
    )
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    call_log = []

    def _fake_try(self, host, port, use_ssl, use_starttls, pw, addr, msg, recip, timeout):
        call_log.append(port)
        return False, "auth", "bad credentials"

    monkeypatch.setattr(EmailService, "_try_smtp_send", _fake_try)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is False
    assert len(call_log) == 1, "Auth error should abort after first attempt"
    assert service.last_send_error_code == "SMTP_AUTH_FAILED"
    assert service.last_send_retryable is False


def test_smtp_retry_succeeds_on_third_attempt(monkeypatch):
    """Both primary and alt fail, but the final retry of the primary port works."""
    account = _build_infomaniak_account(smtp_port=465)
    service = EmailService(_FakeDB(account))

    monkeypatch.setattr(
        "app.services.email_service.decrypt_password", lambda _: "password"
    )
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

    call_count = {"n": 0}

    def _fake_try(self, host, port, use_ssl, use_starttls, pw, addr, msg, recip, timeout):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            return False, "timeout", "timed out"
        return True, None, None

    monkeypatch.setattr(EmailService, "_try_smtp_send", _fake_try)
    monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

    result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
    assert result["sent"] is True
    assert call_count["n"] == 3
