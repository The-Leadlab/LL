#!/usr/bin/env python3
"""
One-off admin script to repair workspace membership after auto-isolation.

This script is NOT run automatically. Do not invoke it from CI, deploy hooks,
or application startup. It writes to the database pointed at by DATABASE_URL
only when you pass --apply.

What it can do:
  1. --backfill: create accepted TeamInvitation rows for everyone currently in
     Ali's organization so they are not auto-moved again.
  2. --emails / --restore-josh: move named users (Josh) back into Ali's org and
     record an accepted team membership row.
  3. --from-logs: parse ``Moved user <id> from org <old> to personal workspace <new>``
     lines and restore users who were moved out of Ali's org.

Josh restore (Ali confirmed Josh belongs in ali@the-leadlab.com's workspace):

  # Dry-run first (default)
  cd backend && python scripts/restore_ali_org_teammates.py --backfill --restore-josh

  # Apply against a non-production database
  cd backend && python scripts/restore_ali_org_teammates.py --backfill --restore-josh --apply

  # Explicit email if Josh's address is not joshua@the-leadlab.com
  cd backend && python scripts/restore_ali_org_teammates.py --emails josh@example.com --apply

  # Restore from app logs
  cd backend && python scripts/restore_ali_org_teammates.py --from-logs /path/to/app.log --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from typing import Iterable, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ALI_EMAIL = "ali@the-leadlab.com"
JOSH_EMAIL = "joshua@the-leadlab.com"


def _norm(email: Optional[str]) -> str:
    return (email or "").strip().lower()


def _parse_emails(values: Optional[Iterable[str]]) -> list[str]:
    emails: list[str] = []
    for value in values or []:
        for part in str(value).split(","):
            email = _norm(part)
            if email and email not in emails:
                emails.append(email)
    return emails


def emails_to_restore(emails: Optional[Iterable[str]], restore_josh: bool) -> list[str]:
    """Named restore targets. --restore-josh always includes joshua@the-leadlab.com."""
    parsed = _parse_emails(emails)
    if restore_josh and JOSH_EMAIL not in parsed:
        parsed.append(JOSH_EMAIL)
    return parsed


def restore_teammates(
    db,
    *,
    ali_email: str,
    emails: Optional[Iterable[str]] = None,
    restore_josh: bool = False,
    backfill: bool = False,
    log_text: Optional[str] = None,
    apply: bool = False,
) -> tuple[int, list[str]]:
    """
    Restore named users (including Josh) into Ali's org and record accepted
    TeamInvitation membership rows. Returns (exit_code, planned action lines).
    Does not close ``db``.
    """
    from app.core.workspace import parse_moved_user_log_lines, record_team_membership
    from app.models.email_account import EmailAccount
    from app.models.user import User

    emails = emails_to_restore(emails, restore_josh)
    log_moves = parse_moved_user_log_lines(log_text or "")
    if not backfill and not emails and not log_moves:
        return 1, ["Nothing to do. Pass --backfill, --restore-josh, --emails, and/or --from-logs."]

    ali = db.query(User).filter(User.email.ilike(ali_email)).first()
    if not ali or not ali.organization_id:
        return 1, [f"ERROR: could not find {ali_email} with an organization."]

    ali_org_id = int(ali.organization_id)
    dry_run = not apply
    planned: list[str] = []

    if backfill:
        teammates = (
            db.query(User)
            .filter(
                User.organization_id == ali_org_id,
                User.is_active == True,  # noqa: E712
            )
            .all()
        )
        for teammate in teammates:
            if _norm(teammate.email) == _norm(ali.email):
                continue
            planned.append(
                f"backfill accepted membership for {teammate.email} (id={teammate.id}) in org {ali_org_id}"
            )
            if not dry_run:
                record_team_membership(
                    db,
                    user=teammate,
                    organization_id=ali_org_id,
                    invited_by_id=int(ali.id),
                )

    restore_ids = {user_id for user_id, from_org, _to_org in log_moves if int(from_org) == ali_org_id}
    users_to_restore: dict[int, User] = {}
    for user_id in restore_ids:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            users_to_restore[int(user.id)] = user
    for email in emails:
        user = db.query(User).filter(User.email.ilike(email)).first()
        if not user:
            planned.append(f"MISSING email {email} — skipped")
            continue
        users_to_restore[int(user.id)] = user

    for user in users_to_restore.values():
        previous = int(user.organization_id) if user.organization_id else None
        planned.append(
            f"restore {user.email} (id={user.id}) from org {previous} -> Ali org {ali_org_id} "
            "and record accepted team membership"
        )
        if dry_run:
            continue
        user.organization_id = ali_org_id
        user.updated_at = datetime.utcnow()
        db.add(user)
        db.query(EmailAccount).filter(EmailAccount.user_id == user.id).update(
            {"organization_id": ali_org_id},
            synchronize_session=False,
        )
        db.commit()
        db.refresh(user)
        record_team_membership(
            db,
            user=user,
            organization_id=ali_org_id,
            invited_by_id=int(ali.id),
        )

    return 0, planned


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Backfill Ali-org membership and restore teammates (e.g. Josh). Dry-run by default."
    )
    parser.add_argument("--ali-email", default=ALI_EMAIL, help="Owner email used to locate the shared org")
    parser.add_argument(
        "--emails",
        action="append",
        default=[],
        help="Teammate email(s) to restore into Ali's org (repeat or comma-separate)",
    )
    parser.add_argument(
        "--restore-josh",
        action="store_true",
        help=f"Restore {JOSH_EMAIL} into Ali's org with an accepted membership row",
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Record accepted membership for users already in Ali's org",
    )
    parser.add_argument(
        "--from-logs",
        help="Path to a log file containing 'Moved user ...' isolation lines",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag the script only prints a dry-run plan.",
    )
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Required in addition to --apply when ENV is production. Still never run from CI.",
    )
    args = parser.parse_args(argv)

    env = ""
    try:
        from app.core.config import settings
        env = (getattr(settings, "ENV", "") or "").strip().lower()
    except Exception:
        env = (os.environ.get("ENV") or "").strip().lower()
    if env in {"production", "prod"} and args.apply and not args.allow_production:
        print(
            "Refusing to apply against production. "
            "Re-run with --allow-production only after a deliberate operator decision."
        )
        return 2

    from sqlalchemy.orm import Session

    from app.db.session import SessionLocal
    from app.models.user import User

    log_text = None
    if args.from_logs:
        with open(args.from_logs, encoding="utf-8", errors="replace") as handle:
            log_text = handle.read()

    emails = emails_to_restore(args.emails, args.restore_josh)
    if not args.backfill and not emails and not log_text:
        parser.error("Nothing to do. Pass --backfill, --restore-josh, --emails, and/or --from-logs.")

    db: Session = SessionLocal()
    dry_run = not args.apply
    try:
        ali = db.query(User).filter(User.email.ilike(args.ali_email)).first()
        if ali and ali.organization_id:
            print(f"Ali user id={ali.id} org={int(ali.organization_id)} ({ali.email})")
        print("Mode:", "DRY-RUN" if dry_run else "APPLY")
        code, planned = restore_teammates(
            db,
            ali_email=args.ali_email,
            emails=args.emails,
            restore_josh=args.restore_josh,
            backfill=args.backfill,
            log_text=log_text,
            apply=args.apply,
        )
        if code != 0:
            for line in planned:
                print(line)
            return code
        if not planned:
            print("No matching users to backfill or restore.")
            return 0
        print("Plan:")
        for line in planned:
            print(f"  - {line}")
        if dry_run:
            print("Dry-run complete. Re-run with --apply to persist.")
        else:
            print(f"Applied {len(planned)} action(s).")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
