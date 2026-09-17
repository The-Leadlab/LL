"""Tests for the Infomaniak HTTPS webmail API transport."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.infomaniak_mail import (
    InfomaniakMailClient,
    InfomaniakMailError,
)
from app.services.email_service import EmailService
from app.core.config import settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _build_generic_account(**overrides):
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


# ---------------------------------------------------------------------------
# InfomaniakMailClient unit tests
# ---------------------------------------------------------------------------


class TestInfomaniakMailClient:
    def _mock_response(self, status_code=200, json_data=None, text=""):
        resp = MagicMock()
        resp.status_code = status_code
        resp.json.return_value = json_data or {"result": "success", "data": []}
        resp.text = text or json.dumps(json_data or {})
        return resp

    def test_list_mailboxes_success(self):
        client = InfomaniakMailClient("test-token")
        mailboxes = [
            {"uuid": "mb-uuid-1", "email": "contact@serenidien.ch", "aliases": []},
            {"uuid": "mb-uuid-2", "email": "info@other.com", "aliases": []},
        ]
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(
                json_data={"result": "success", "data": mailboxes}
            )
            result = client.list_mailboxes()
            assert len(result) == 2
            assert result[0]["uuid"] == "mb-uuid-1"

    def test_find_mailbox_uuid_exact_match(self):
        client = InfomaniakMailClient("test-token")
        mailboxes = [
            {"uuid": "mb-uuid-1", "email": "contact@serenidien.ch", "aliases": []},
        ]
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(
                json_data={"result": "success", "data": mailboxes}
            )
            uuid = client.find_mailbox_uuid("contact@serenidien.ch")
            assert uuid == "mb-uuid-1"

    def test_find_mailbox_uuid_case_insensitive(self):
        client = InfomaniakMailClient("test-token")
        mailboxes = [
            {"uuid": "mb-uuid-1", "email": "Contact@Serenidien.ch", "aliases": []},
        ]
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(
                json_data={"result": "success", "data": mailboxes}
            )
            uuid = client.find_mailbox_uuid("contact@serenidien.ch")
            assert uuid == "mb-uuid-1"

    def test_find_mailbox_uuid_not_found(self):
        client = InfomaniakMailClient("test-token")
        mailboxes = [
            {"uuid": "mb-uuid-1", "email": "other@domain.com", "aliases": []},
        ]
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(
                json_data={"result": "success", "data": mailboxes}
            )
            uuid = client.find_mailbox_uuid("contact@serenidien.ch")
            assert uuid is None

    def test_send_email_creates_draft_then_sends(self):
        client = InfomaniakMailClient("test-token")
        client._mailboxes = [
            {"uuid": "mb-1", "email": "contact@serenidien.ch", "aliases": []},
        ]
        call_log = []

        def _fake_request(method, url, **kwargs):
            call_log.append((method, url))
            if method == "POST" and "/draft" in url:
                return self._mock_response(
                    json_data={
                        "result": "success",
                        "data": {"uuid": "draft-uuid-123", "uid": "uid-456"},
                    }
                )
            if method == "PUT" and "draft-uuid-123" in url:
                return self._mock_response(
                    json_data={"result": "success", "data": {"sent": True}}
                )
            return self._mock_response()

        with patch("app.services.infomaniak_mail.requests.request", side_effect=_fake_request):
            result = client.send_email(
                mailbox_uuid="mb-1",
                from_name="Serenidien",
                from_email="contact@serenidien.ch",
                to=[{"name": "", "email": "lead@example.com"}],
                subject="Hello",
                body_html="<p>Hello World</p>",
            )
            assert len(call_log) == 2
            assert call_log[0][0] == "POST"
            assert "/draft" in call_log[0][1]
            assert call_log[1][0] == "PUT"
            assert "draft-uuid-123" in call_log[1][1]

    def test_auth_failure_raises_non_retryable(self):
        client = InfomaniakMailClient("bad-token")
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(status_code=401, text="Unauthorized")
            with pytest.raises(InfomaniakMailError) as exc_info:
                client.list_mailboxes()
            assert not exc_info.value.retryable
            assert "auth" in str(exc_info.value).lower()

    def test_server_error_raises_retryable(self):
        client = InfomaniakMailClient("test-token")
        with patch("app.services.infomaniak_mail.requests.request") as mock_req:
            mock_req.return_value = self._mock_response(
                status_code=500, text="Internal Server Error"
            )
            with pytest.raises(InfomaniakMailError) as exc_info:
                client.list_mailboxes()
            assert exc_info.value.retryable


# ---------------------------------------------------------------------------
# EmailService integration tests — Infomaniak transport
# ---------------------------------------------------------------------------


class TestEmailServiceInfomaniakTransport:

    def test_infomaniak_https_preferred_when_token_set(self, monkeypatch):
        """When INFOMANIAK_MAIL_TOKEN is set, Infomaniak HTTPS is used instead of SMTP."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

        smtp_called = {"value": False}

        def _spy_smtp(*args, **kwargs):
            smtp_called["value"] = True
            return True

        monkeypatch.setattr(service, "_send_email_smtp", _spy_smtp)
        monkeypatch.setattr(service, "_send_email_infomaniak_api", lambda *args, **kwargs: True)
        monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is True
        assert result["transport"] == "infomaniak_api"
        assert smtp_called["value"] is False, "SMTP should be skipped when Infomaniak HTTPS is configured"

    def test_infomaniak_https_falls_back_to_smtp(self, monkeypatch):
        """If Infomaniak HTTPS fails, SMTP is tried as fallback."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

        def _ik_fail(*args, **kwargs):
            service._set_send_error("INFOMANIAK_API_ERROR", "timeout", True, 503)
            return False

        monkeypatch.setattr(service, "_send_email_infomaniak_api", _ik_fail)
        monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: True)
        monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is True
        assert result["transport"] == "smtp"

    def test_smtp_fails_then_infomaniak_https_tried(self, monkeypatch):
        """SMTP failure on Infomaniak account triggers HTTPS API attempt."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", None)  # not pre-configured
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

        def _smtp_fail(*args, **kwargs):
            service._set_send_error("SMTP_TIMEOUT", "timed out", True, 503)
            return False

        monkeypatch.setattr(service, "_send_email_smtp", _smtp_fail)
        monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

        # No token → should not try infomaniak, should fail with rewrite block
        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is False

        # Now set token — SMTP fails, Infomaniak HTTPS should be tried
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")

        ik_called = {"value": False}

        def _ik_success(*args, **kwargs):
            ik_called["value"] = True
            return True

        monkeypatch.setattr(service, "_send_email_infomaniak_api", _ik_success)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is True
        assert result["transport"] == "infomaniak_api"
        assert ik_called["value"] is True

    def test_infomaniak_no_resend_fallback_on_from_mismatch(self, monkeypatch):
        """Infomaniak account must not fall back to Resend noreply when From would change."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

        def _ik_fail(*args, **kwargs):
            service._set_send_error("INFOMANIAK_API_ERROR", "timeout", True, 503)
            return False

        def _smtp_fail(*args, **kwargs):
            service._set_send_error("SMTP_TIMEOUT", "timed out", True, 503)
            return False

        monkeypatch.setattr(service, "_send_email_infomaniak_api", _ik_fail)
        monkeypatch.setattr(service, "_send_email_smtp", _smtp_fail)

        api_called = {"value": False}

        def _spy_api(*args, **kwargs):
            api_called["value"] = True
            return True

        monkeypatch.setattr(service, "_send_email_provider_api", _spy_api)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is False, "Should NOT silently send as noreply"
        assert api_called["value"] is False, "Resend must not be called (From mismatch)"

    def test_non_infomaniak_account_unaffected(self, monkeypatch):
        """Non-Infomaniak accounts should use normal SMTP path regardless of INFOMANIAK_MAIL_TOKEN."""
        account = _build_generic_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
        monkeypatch.setattr(service, "_send_email_smtp", lambda *args, **kwargs: True)
        monkeypatch.setattr(service, "_persist_sent_email", lambda **kw: None)

        ik_called = {"value": False}

        def _spy_ik(*args, **kwargs):
            ik_called["value"] = True
            return True

        monkeypatch.setattr(service, "_send_email_infomaniak_api", _spy_ik)

        result = service.send_email(1, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is True
        assert result["transport"] == "smtp"
        assert ik_called["value"] is False, "Infomaniak should not be used for non-Infomaniak accounts"

    def test_infomaniak_token_missing_returns_clear_error(self, monkeypatch):
        """Calling _send_email_infomaniak_api without token gives a clear error."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", None)

        result = service._send_email_infomaniak_api(
            account, ["lead@example.com"], None, None, "Hello", "<p>body</p>"
        )
        assert result is False
        assert service.last_send_error_code == "INFOMANIAK_NOT_CONFIGURED"

    def test_infomaniak_mailbox_not_found_returns_clear_error(self, monkeypatch):
        """When the token is valid but the mailbox isn't found, error is clear."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")

        def _fake_get_client(token):
            client = MagicMock()
            client.find_mailbox_uuid.return_value = None
            return client

        monkeypatch.setattr(
            "app.services.email_service._get_infomaniak_client", _fake_get_client
        )

        result = service._send_email_infomaniak_api(
            account, ["lead@example.com"], None, None, "Hello", "<p>body</p>"
        )
        assert result is False
        assert service.last_send_error_code == "INFOMANIAK_MAILBOX_NOT_FOUND"
        assert "contact@serenidien.ch" in service.last_send_error

    def test_infomaniak_api_error_sets_retryable(self, monkeypatch):
        """API errors with retryable flag propagate correctly."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")

        def _fake_get_client(token):
            client = MagicMock()
            client.find_mailbox_uuid.return_value = "mb-uuid-1"
            client.send_email.side_effect = InfomaniakMailError("timeout", retryable=True)
            return client

        monkeypatch.setattr(
            "app.services.email_service._get_infomaniak_client", _fake_get_client
        )

        result = service._send_email_infomaniak_api(
            account, ["lead@example.com"], None, None, "Hello", "<p>body</p>"
        )
        assert result is False
        assert service.last_send_error_code == "INFOMANIAK_API_ERROR"
        assert service.last_send_retryable is True

    def test_transport_persisted_as_infomaniak_api(self, monkeypatch):
        """Successful Infomaniak sends persist the correct transport indicator."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))
        captured = {}

        def _capture_persist(**kwargs):
            captured.update(kwargs)

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", "ik-test-token")
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")
        monkeypatch.setattr(service, "_send_email_infomaniak_api", lambda *args, **kwargs: True)
        monkeypatch.setattr(service, "_persist_sent_email", _capture_persist)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is True
        assert result["transport"] == "infomaniak_api"
        assert captured.get("transport") == "infomaniak_api"
        assert captured.get("actual_from_email") == "contact@serenidien.ch"

    def test_existing_smtp_tests_still_pass_without_infomaniak(self, monkeypatch):
        """Verifies that existing SMTP-based tests are unaffected."""
        account = _build_infomaniak_account()
        service = EmailService(_FakeDB(account))

        monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
        monkeypatch.setattr(settings, "INFOMANIAK_MAIL_TOKEN", None)  # No token
        monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "noreply@the-leadlab.com")

        def _smtp_timeout(*args, **kwargs):
            service._set_send_error("SMTP_TIMEOUT", "timed out", True, 503)
            return False

        monkeypatch.setattr(service, "_send_email_smtp", _smtp_timeout)

        result = service.send_email(3, ["lead@example.com"], "Hello", "body", "<p>body</p>")
        assert result["sent"] is False
        assert "rewrite" in (service.last_send_error or "").lower()
