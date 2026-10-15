import importlib.util
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.core.workspace import provision_personal_organization
from app.models.team_invitation import TeamInvitation
from app.models.user import User

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "restore_ali_org_teammates.py"


def _load_restore_script():
    spec = importlib.util.spec_from_file_location("restore_ali_org_teammates", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


restore_script = _load_restore_script()


def _create_user(db: Session, *, email: str, first_name: str, organization_id: int | None = None) -> User:
    if organization_id is None:
        org = provision_personal_organization(
            db,
            first_name=first_name,
            last_name="Tester",
            email=email,
        )
        organization_id = int(org.id)
    now = datetime.utcnow()
    user = User(
        email=email,
        username=f"{first_name.lower()}_{uuid.uuid4().hex[:8]}",
        password_hash=get_password_hash("testpass123"),
        first_name=first_name,
        last_name="Tester",
        is_active=True,
        is_superuser=first_name.lower() == "ali",
        role="admin" if first_name.lower() == "ali" else "user",
        organization_id=organization_id,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_restore_josh_flag_includes_joshua_email():
    emails = restore_script.emails_to_restore(["teammate@example.com"], restore_josh=True)
    assert restore_script.JOSH_EMAIL in emails
    assert "teammate@example.com" in emails
    assert restore_script.emails_to_restore([], restore_josh=True) == [restore_script.JOSH_EMAIL]


def test_restore_refuses_production_apply_without_override(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    code = restore_script.main(["--restore-josh", "--apply"])
    assert code == 2


def test_restore_josh_into_ali_org_records_accepted_membership(db: Session):
    ali_email = f"ali-{uuid.uuid4().hex[:8]}@the-leadlab.com"
    josh_email = restore_script.JOSH_EMAIL
    ali = _create_user(db, email=ali_email, first_name="Ali")
    existing_josh = db.query(User).filter(User.email.ilike(josh_email)).first()
    if existing_josh:
        other_org = provision_personal_organization(
            db, first_name="Other", last_name="Org", email="other-org@example.com"
        )
        existing_josh.organization_id = int(other_org.id)
        db.add(existing_josh)
        db.commit()
        db.refresh(existing_josh)
        josh = existing_josh
    else:
        josh = _create_user(db, email=josh_email, first_name="Josh")
    assert int(josh.organization_id) != int(ali.organization_id)

    db.query(TeamInvitation).filter(
        TeamInvitation.email.ilike(josh_email),
        TeamInvitation.organization_id == int(ali.organization_id),
    ).delete(synchronize_session=False)
    db.commit()

    code, planned = restore_script.restore_teammates(
        db,
        ali_email=ali_email,
        restore_josh=True,
        apply=True,
    )
    assert code == 0, planned
    assert any("accepted team membership" in line and josh_email in line for line in planned)

    db.refresh(josh)
    assert int(josh.organization_id) == int(ali.organization_id)

    membership = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.email.ilike(josh_email),
            TeamInvitation.organization_id == int(ali.organization_id),
            TeamInvitation.status == "accepted",
        )
        .first()
    )
    assert membership is not None
    assert membership.accepted_at is not None
    assert membership.role == "member"
    assert int(membership.invited_by_id) == int(ali.id)
