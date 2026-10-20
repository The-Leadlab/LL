"""Resolve preferred UI/email language for a user."""
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.email import normalize_email_language
from app.models.user_settings import UserSettings


def language_from_request(request: Optional[Request]) -> str:
    if request is None:
        return "en"
    header = request.headers.get("accept-language") or ""
    # Take first tag, e.g. "fr-FR,fr;q=0.9" -> fr-FR
    first = header.split(",")[0].strip().split(";")[0].strip()
    return normalize_email_language(first)


def get_user_language(
    db: Session,
    user_id: Optional[int] = None,
    *,
    request: Optional[Request] = None,
    fallback: Optional[str] = None,
) -> str:
    """Prefer user_settings.language, then Accept-Language, then fallback/en."""
    if user_id is not None:
        settings_row = (
            db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        )
        if settings_row and settings_row.language:
            return normalize_email_language(settings_row.language)
    if fallback:
        return normalize_email_language(fallback)
    return language_from_request(request)
