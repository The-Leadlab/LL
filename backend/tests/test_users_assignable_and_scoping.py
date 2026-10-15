import uuid
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.core.workspace import (
    ensure_personal_workspace_if_needed,
    provision_personal_organization,
    record_team_membership,
)
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


def _create_user(
    db: Session,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    organization_id: int | None = None,
    role: str = "user",
) -> User:
    if organization_id is None:
        org = provision_personal_organization(
            db,
            first_name=first_name,
            last_name=last_name,
            email=email,
        )
        organization_id = int(org.id)
    now = datetime.utcnow()
    user = User(
        email=email,
        username=f"{first_name.lower()}_{uuid.uuid4().hex[:8]}",
        password_hash=get_password_hash(password),
        first_name=first_name,
        last_name=last_name,
        is_active=True,
        is_superuser=False,
        role=role,
        organization_id=organization_id,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, email: str, password: str) -> dict:
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    if response.status_code != 200:
        response = client.post(
            f"{settings.API_V1_STR}/auth/login",
            data={"username": email, "password": password},
        )
    assert response.status_code == 200, response.text
    return response.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_non_admin_cannot_list_another_org(client: TestClient, db: Session):
    password = "testpass123"
    alice = _create_user(db, email=_unique("alice"), password=password, first_name="Alice", last_name="One")
    bob = _create_user(db, email=_unique("bob"), password=password, first_name="Bob", last_name="Two")
    assert int(alice.organization_id) != int(bob.organization_id)

    token = _login(client, alice.email, password)["access_token"]
    headers = _auth_header(token)

    forbidden = client.get(
        f"{settings.API_V1_STR}/users/",
        headers=headers,
        params={"organization_id": int(bob.organization_id)},
    )
    assert forbidden.status_code == 403

    own = client.get(f"{settings.API_V1_STR}/users/", headers=headers)
    assert own.status_code == 200
    payload = own.json()
    ids = {item["id"] for item in payload["items"]}
    assert alice.id in ids
    assert bob.id not in ids
    assert payload["has_more"] in (False, True)
    assert payload["total"] >= 1


def test_assignable_users_includes_caller_first(client: TestClient, db: Session):
    password = "testpass123"
    user = _create_user(db, email=_unique("self"), password=password, first_name="Casey", last_name="Caller")
    token = _login(client, user.email, password)["access_token"]

    response = client.get(f"{settings.API_V1_STR}/users/assignable", headers=_auth_header(token))
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items, "assignable list should include the caller"
    assert items[0]["id"] == user.id
    assert items[0]["is_self"] is True


def test_non_admin_teammate_can_assign_task_to_admin(client: TestClient, db: Session):
    password = "testpass123"
    admin = _create_user(
        db,
        email=_unique("admin"),
        password=password,
        first_name="Ali",
        last_name="Admin",
        role="admin",
    )
    teammate = _create_user(
        db,
        email=_unique("josh"),
        password=password,
        first_name="Josh",
        last_name="Teammate",
        organization_id=int(admin.organization_id),
    )
    record_team_membership(
        db,
        user=teammate,
        organization_id=int(admin.organization_id),
        invited_by_id=int(admin.id),
    )

    token = _login(client, teammate.email, password)["access_token"]
    headers = _auth_header(token)

    assignable = client.get(f"{settings.API_V1_STR}/users/assignable", headers=headers)
    assert assignable.status_code == 200, assignable.text
    assignable_ids = {item["id"] for item in assignable.json()["items"]}
    assert teammate.id in assignable_ids
    assert admin.id in assignable_ids

    created = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=headers,
        json={
            "title": "Follow up with Josh's lead",
            "description": "Created by teammate, assigned to admin",
            "due_date": (datetime.utcnow() + timedelta(days=2)).isoformat(),
            "priority": "MEDIUM",
            "status": "PENDING",
            "assigned_to_id": admin.id,
            "organization_id": int(admin.organization_id),
        },
    )
    assert created.status_code in (200, 201), created.text
    body = created.json()
    assert body["assigned_to_id"] == admin.id or body.get("assigned_to", {}).get("id") == admin.id
    assert int(body["organization_id"]) == int(admin.organization_id)


def test_login_after_move_returns_new_org_id(client: TestClient, db: Session):
    password = "testpass123"
    founder = _create_user(db, email=_unique("founder"), password=password, first_name="Founder", last_name="Org")
    stray = _create_user(
        db,
        email=_unique("stray"),
        password=password,
        first_name="Stray",
        last_name="User",
        organization_id=int(founder.organization_id),
    )
    original_org = int(founder.organization_id)
    assert int(stray.organization_id) == original_org

    payload = _login(client, stray.email, password)
    login_org = int(payload["user"]["organization_id"])
    assert login_org != original_org

    db.refresh(stray)
    assert int(stray.organization_id) == login_org


def test_shared_org_work_prevents_auto_move(db: Session):
    password = "testpass123"
    founder = _create_user(db, email=_unique("work-founder"), password=password, first_name="Founder", last_name="Keep")
    teammate = _create_user(
        db,
        email=_unique("work-josh"),
        password=password,
        first_name="Josh",
        last_name="Busy",
        organization_id=int(founder.organization_id),
    )
    now = datetime.utcnow()
    db.add(
        Task(
            title="Existing shared task",
            description="Should keep Josh in the org",
            due_date=now + timedelta(days=1),
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PENDING,
            assigned_to_id=teammate.id,
            organization_id=int(founder.organization_id),
        )
    )
    db.commit()

    moved = ensure_personal_workspace_if_needed(db, teammate)
    assert int(moved.organization_id) == int(founder.organization_id)


def test_organization_users_uses_same_scoping(client: TestClient, db: Session):
    password = "testpass123"
    alice = _create_user(db, email=_unique("org-alice"), password=password, first_name="Alice", last_name="Org")
    bob = _create_user(db, email=_unique("org-bob"), password=password, first_name="Bob", last_name="Other")
    token = _login(client, alice.email, password)["access_token"]
    headers = _auth_header(token)

    forbidden = client.get(
        f"{settings.API_V1_STR}/users/organization-users",
        headers=headers,
        params={"organization_id": int(bob.organization_id)},
    )
    assert forbidden.status_code == 403
