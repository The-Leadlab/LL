from typing import Any, Dict, Optional, Union, List
from datetime import datetime
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.models.email_log import EmailLog  # Import EmailLog model
from app.models.communication import Communication  # Import Communication model
import logging
import time

logger = logging.getLogger(__name__)

# API schema fields that are not DB columns on User (read-only @property on model).
_SCHEMA_ONLY_USER_FIELDS = frozenset(
    {"company", "job_title", "is_admin", "organization_role", "last_login", "password"}
)

_USER_WRITABLE_COLUMNS = frozenset(
    {
        "organization_id",
        "email",
        "username",
        "password_hash",
        "first_name",
        "last_name",
        "is_active",
        "is_superuser",
        "role",
        "updated_at",
        "created_at",
    }
)


def _role_from_admin_flag(is_admin: Optional[bool], fallback: str = "user") -> str:
    if is_admin is True:
        return "admin"
    if is_admin is False:
        return fallback if fallback in ("user", "member", "viewer", "manager") else "user"
    return fallback


def _sanitize_user_write_data(data: Dict[str, Any], *, existing_role: Optional[str] = None) -> Dict[str, Any]:
    """Map API payload keys to real User columns; drop virtual properties."""
    cleaned = {k: v for k, v in data.items() if k not in _SCHEMA_ONLY_USER_FIELDS}

    is_admin = data.get("is_admin")
    if is_admin is not None:
        cleaned["role"] = _role_from_admin_flag(is_admin, existing_role or "user")
    elif "role" not in cleaned and existing_role:
        cleaned.setdefault("role", existing_role)

    if "password" in data and data["password"]:
        cleaned["password_hash"] = get_password_hash(data["password"])

    return cleaned


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    def get(self, db: Session, *, id: int) -> Optional[User]:
        return super().get(db, id=id)

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()
    
    def get_by_username(self, db: Session, *, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()
    
    def get_by_email_or_username(self, db: Session, *, identifier: str) -> Optional[User]:
        """Get user by email or username. Tries email first, then username."""
        # Try email first
        user = db.query(User).filter(User.email == identifier).first()
        if user:
            return user
        # Try username
        return db.query(User).filter(User.username == identifier).first()

    def get_multi_base(self, db: Session, *, skip: int = 0, limit: int = 100) -> List[User]:
        """Base get_multi method from CRUDBase"""
        return super().get_multi(db, skip=skip, limit=limit)

    def _filtered_query(
        self,
        db: Session,
        *,
        is_active: Optional[bool] = None,
        is_admin: Optional[bool] = None,
        organization_id: Optional[int] = None,
        exclude_tombstones: bool = True,
        order_by_name: bool = False,
    ):
        query = db.query(self.model)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        if is_admin is not None:
            if is_admin:
                query = query.filter(User.role == "admin")
            else:
                query = query.filter(User.role != "admin")
        if organization_id is not None:
            query = query.filter(User.organization_id == organization_id)
        if exclude_tombstones:
            query = query.filter(
                ~func.lower(User.email).like("%@deleted.local"),
                ~func.lower(User.email).like("deleted+user-%"),
            )
        if order_by_name:
            query = query.order_by(
                func.lower(func.coalesce(User.first_name, "")),
                func.lower(func.coalesce(User.last_name, "")),
                User.id.asc(),
            )
        return query

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None,
        is_admin: Optional[bool] = None,
        organization_id: Optional[int] = None,
        exclude_tombstones: bool = True,
        order_by_name: bool = False,
    ) -> List[User]:
        query = self._filtered_query(
            db,
            is_active=is_active,
            is_admin=is_admin,
            organization_id=organization_id,
            exclude_tombstones=exclude_tombstones,
            order_by_name=order_by_name,
        )
        return query.offset(skip).limit(limit).all()

    def count_multi(
        self,
        db: Session,
        *,
        is_active: Optional[bool] = None,
        is_admin: Optional[bool] = None,
        organization_id: Optional[int] = None,
        exclude_tombstones: bool = True,
    ) -> int:
        query = self._filtered_query(
            db,
            is_active=is_active,
            is_admin=is_admin,
            organization_id=organization_id,
            exclude_tombstones=exclude_tombstones,
        )
        return int(query.count() or 0)

    def get_organization_users(
        self,
        db: Session,
        organization_id: int
    ) -> List[User]:
        """
        Get all active users in an organization.
        """
        return (
            db.query(User)
            .filter(
                User.organization_id == organization_id,
                User.is_active == True,
                ~func.lower(User.email).like("%@deleted.local"),
                ~func.lower(User.email).like("deleted+user-%"),
            )
            .order_by(User.first_name)
            .all()
        )

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        now = datetime.utcnow()
        payload = obj_in.model_dump() if hasattr(obj_in, "model_dump") else obj_in.dict()
        write_data = _sanitize_user_write_data(payload)
        role = write_data.get("role") or _role_from_admin_flag(payload.get("is_admin"), "user")

        db_obj = User(
            organization_id=obj_in.organization_id,
            email=obj_in.email,
            username=payload.get("username"),
            password_hash=write_data.get("password_hash") or get_password_hash(obj_in.password),
            first_name=obj_in.first_name,
            last_name=obj_in.last_name,
            is_active=obj_in.is_active if obj_in.is_active is not None else True,
            is_superuser=bool(obj_in.is_superuser),
            role=role,
            created_at=now,
            updated_at=now,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: User,
        obj_in: Union[UserUpdate, Dict[str, Any]]
    ) -> User:
        if isinstance(obj_in, dict):
            update_data = dict(obj_in)
        else:
            update_data = (
                obj_in.model_dump(exclude_unset=True)
                if hasattr(obj_in, "model_dump")
                else obj_in.dict(exclude_unset=True)
            )
        update_data = _sanitize_user_write_data(update_data, existing_role=db_obj.role)
        update_data["updated_at"] = datetime.utcnow()
        for field, value in update_data.items():
            if field in _USER_WRITABLE_COLUMNS:
                setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def authenticate(self, db: Session, *, email: str, password: str) -> Optional[User]:
        try:
            logger.info(f"Attempting authentication for email: {email}")
            user = self.get_by_email(db, email=email)
            if not user:
                logger.warning(f"User not found: {email}")
                return None
            
            if not verify_password(password, user.password_hash):
                logger.warning(f"Invalid password for user: {email}")
                return None
                
            # Update last_login
            try:
                user.last_login = datetime.utcnow()
                db.commit()
                logger.info(f"Successfully authenticated user: {email}")
                return user
            except Exception as e:
                logger.error(f"Error updating last_login: {str(e)}")
                db.rollback()
                raise
                
        except Exception as e:
            logger.error(f"Authentication error for {email}: {str(e)}")
            db.rollback()
            raise

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser

    def is_admin(self, user: User) -> bool:
        return user.is_admin

    def remove(self, db: Session, *, id: int) -> Optional[User]:
        """
        Purge user identity while keeping row integrity for FK-linked records.
        Soft-deletes leads owned/created by the user so they leave Performance
        and Leads UI. Frees the original email so the same address can be reused.
        """
        user = db.query(User).filter(User.id == id).first()
        if not user:
            return None

        try:
            from app.models.lead import Lead

            now = datetime.utcnow()
            # Hide this user's leads from reports and the Leads list
            db.query(Lead).filter(
                or_(Lead.user_id == id, Lead.created_by == id),
                Lead.is_deleted.is_(False),
            ).update(
                {"is_deleted": True, "updated_at": now},
                synchronize_session=False,
            )

            # Tombstone email to release unique constraint on original address.
            tombstone_email = f"deleted+user-{id}-{int(time.time())}@deleted.local"
            user.email = tombstone_email
            if hasattr(user, "username"):
                user.username = None
            user.first_name = "Deleted"
            user.last_name = f"User {id}"
            user.is_active = False
            user.is_superuser = False
            user.role = "user"
            user.updated_at = now
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        except Exception as e:
            db.rollback()
            raise e

user = CRUDUser(User)

__all__ = ["user"]
