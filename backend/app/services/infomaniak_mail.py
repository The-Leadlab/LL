"""
Infomaniak HTTPS webmail API transport.

Sends email via Infomaniak's mail API (create-draft then send-draft) so
outbound delivery works on hosts that block SMTP ports 465/587 (e.g. Render free).

API reference: https://github.com/Infomaniak/mcp-server-mail
Base URL: https://mail.infomaniak.com/api
Auth: Bearer token from INFOMANIAK_MAIL_TOKEN env var.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://mail.infomaniak.com/api"
REQUEST_TIMEOUT = 20


class InfomaniakMailError(Exception):
    """Raised when the Infomaniak API returns an error or is unreachable."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class InfomaniakMailClient:
    """Thin wrapper around the Infomaniak webmail REST API."""

    def __init__(self, token: str):
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self._mailboxes: List[Dict[str, Any]] = []

    def _api(
        self,
        method: str,
        path: str,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{API_BASE}{path}"
        try:
            resp = requests.request(
                method,
                url,
                headers=self._headers,
                json=json_body,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.Timeout as exc:
            raise InfomaniakMailError(
                f"Infomaniak API timeout: {exc}", retryable=True
            ) from exc
        except requests.RequestException as exc:
            raise InfomaniakMailError(
                f"Infomaniak API request failed: {exc}", retryable=True
            ) from exc

        if resp.status_code in {401, 403}:
            raise InfomaniakMailError(
                f"Infomaniak auth failed ({resp.status_code}). "
                "Check INFOMANIAK_MAIL_TOKEN.",
                retryable=False,
            )

        if resp.status_code >= 400:
            body = resp.text[:500]
            retryable = resp.status_code >= 500
            raise InfomaniakMailError(
                f"Infomaniak API error ({resp.status_code}): {body}",
                retryable=retryable,
            )

        data = resp.json()
        if data.get("result") != "success":
            raise InfomaniakMailError(
                f"Infomaniak API non-success: {resp.text[:500]}",
                retryable=False,
            )
        return data

    def list_mailboxes(self) -> List[Dict[str, Any]]:
        if not self._mailboxes:
            data = self._api(
                "GET", "/mailbox?with=aliases,permissions,accountId,count_users"
            )
            self._mailboxes = data.get("data") or []
        return self._mailboxes

    def find_mailbox_uuid(self, email: str) -> Optional[str]:
        """Return the mailbox UUID for *email*, or None if not found."""
        email_lower = email.strip().lower()
        for mb in self.list_mailboxes():
            if (mb.get("email") or "").strip().lower() == email_lower:
                return mb.get("uuid")
            for alias in mb.get("aliases") or []:
                if (alias if isinstance(alias, str) else alias.get("email", "")).strip().lower() == email_lower:
                    return mb.get("uuid")
        return None

    def _mailbox_info(self, mailbox_uuid: str) -> Dict[str, Any]:
        for mb in self.list_mailboxes():
            if mb.get("uuid") == mailbox_uuid:
                return mb
        raise InfomaniakMailError(f"Mailbox {mailbox_uuid} not found in cache")

    def send_email(
        self,
        *,
        mailbox_uuid: str,
        from_name: str,
        from_email: str,
        to: List[Dict[str, str]],
        subject: str,
        body_html: str,
        cc: Optional[List[Dict[str, str]]] = None,
        bcc: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Create a draft and immediately send it.

        Returns the API response data on success.
        Raises InfomaniakMailError on failure.
        """
        draft_payload: Dict[str, Any] = {
            "uuid": None,
            "subject": subject,
            "body": body_html,
            "quote": None,
            "mime_type": "text/html",
            "from": {
                "id": None,
                "name": from_name,
                "email": from_email,
            },
            "reply_to": {
                "name": from_name,
                "email": from_email,
            },
            "to": to,
            "cc": cc,
            "bcc": bcc,
            "references": "",
            "in_reply_to": None,
            "in_reply_to_uid": None,
            "forwarded_uid": None,
            "attachments": [],
            "identity_id": None,
            "ack_request": False,
            "st_uuid": None,
            "uid": None,
            "resource": None,
            "priority": "normal",
            "encrypted": False,
            "encryption_password": "",
            "event_poll_uuid": None,
            "action": "save",
            "delay": 0,
        }

        # Step 1: create draft
        create_resp = self._api(
            "POST",
            f"/mail/{mailbox_uuid}/draft",
            json_body=draft_payload,
        )
        draft_uuid = (create_resp.get("data") or {}).get("uuid")
        draft_uid = (create_resp.get("data") or {}).get("uid")
        if not draft_uuid:
            raise InfomaniakMailError(
                "Infomaniak createDraft did not return a draft UUID"
            )

        # Step 2: send draft (PUT with action=send)
        send_payload = dict(draft_payload)
        send_payload["uuid"] = draft_uuid
        send_payload["uid"] = draft_uid
        send_payload["action"] = "send"
        send_payload["delay"] = 0
        send_payload["resource"] = f"/api/mail/{mailbox_uuid}/draft/{draft_uuid}"

        send_resp = self._api(
            "PUT",
            f"/mail/{mailbox_uuid}/draft/{draft_uuid}",
            json_body=send_payload,
        )
        return send_resp.get("data") or {}


def _get_client(token: str) -> InfomaniakMailClient:
    """Factory — can be replaced in tests."""
    return InfomaniakMailClient(token)
