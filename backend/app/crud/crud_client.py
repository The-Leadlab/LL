from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from fastapi import HTTPException

from app.models.client import Client
from app.models.lead import Lead
from app.schemas.client import ClientCreate, ClientUpdate


GENERAL_NAME = "General"


class CRUDClient:
    def get(self, db: Session, id: int) -> Optional[Client]:
        return db.query(Client).filter(Client.id == id).first()

    def get_for_org(self, db: Session, *, id: int, organization_id: int) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(Client.id == id, Client.organization_id == organization_id)
            .first()
        )

    def get_default(self, db: Session, *, organization_id: int) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                Client.is_default == True,  # noqa: E712
            )
            .first()
        )

    def ensure_general(self, db: Session, *, organization_id: int) -> Client:
        """Return the org's General client, creating it if missing."""
        existing = self.get_default(db, organization_id=organization_id)
        if existing:
            return existing

        # Prefer existing row named General (e.g. after partial seed)
        named = (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                Client.name == GENERAL_NAME,
            )
            .first()
        )
        if named:
            named.is_default = True
            named.is_archived = False
            named.updated_at = datetime.utcnow()
            db.add(named)
            db.commit()
            db.refresh(named)
            return named

        client = Client(
            organization_id=organization_id,
            name=GENERAL_NAME,
            is_default=True,
            is_archived=False,
            created_at=datetime.utcnow(),
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    def list_for_org(
        self,
        db: Session,
        *,
        organization_id: int,
        include_archived: bool = False,
    ) -> List[Client]:
        self.ensure_general(db, organization_id=organization_id)
        q = db.query(Client).filter(Client.organization_id == organization_id)
        if not include_archived:
            q = q.filter(Client.is_archived == False)  # noqa: E712
        return q.order_by(Client.is_default.desc(), Client.name.asc()).all()

    def lead_counts_by_client(
        self, db: Session, *, organization_id: int
    ) -> dict[int, int]:
        rows = (
            db.query(Lead.client_id, func.count(Lead.id))
            .filter(
                Lead.organization_id == organization_id,
                Lead.is_deleted == False,  # noqa: E712
                Lead.client_id.isnot(None),
            )
            .group_by(Lead.client_id)
            .all()
        )
        return {cid: int(cnt) for cid, cnt in rows if cid is not None}

    def check_name_conflict(
        self,
        db: Session,
        *,
        organization_id: int,
        name: str,
        exclude_id: Optional[int] = None,
    ) -> Optional[Client]:
        q = db.query(Client).filter(
            and_(
                Client.organization_id == organization_id,
                Client.name == name,
            )
        )
        if exclude_id is not None:
            q = q.filter(Client.id != exclude_id)
        return q.first()

    def create(self, db: Session, *, organization_id: int, obj_in: ClientCreate) -> Client:
        name = (obj_in.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Client name cannot be empty")
        if name.lower() == GENERAL_NAME.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot create another client named General; use the default General client",
            )
        if self.check_name_conflict(db, organization_id=organization_id, name=name):
            raise HTTPException(
                status_code=400,
                detail=f"Client '{name}' already exists in your organization",
            )
        client = Client(
            organization_id=organization_id,
            name=name,
            is_default=False,
            is_archived=False,
            created_at=datetime.utcnow(),
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    def rename(
        self, db: Session, *, db_obj: Client, obj_in: ClientUpdate
    ) -> Client:
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be renamed",
            )
        if obj_in.name is None:
            return db_obj
        name = obj_in.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Client name cannot be empty")
        if name.lower() == GENERAL_NAME.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot rename a client to General",
            )
        if self.check_name_conflict(
            db,
            organization_id=db_obj.organization_id,
            name=name,
            exclude_id=db_obj.id,
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Client '{name}' already exists in your organization",
            )
        db_obj.name = name
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def archive(self, db: Session, *, db_obj: Client) -> Client:
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be archived",
            )
        db_obj.is_archived = True
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def restore(self, db: Session, *, db_obj: Client) -> Client:
        # If restoring would collide with an active same-name client, block
        conflict = (
            db.query(Client)
            .filter(
                Client.organization_id == db_obj.organization_id,
                Client.name == db_obj.name,
                Client.id != db_obj.id,
                Client.is_archived == False,  # noqa: E712
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=f"An active client named '{db_obj.name}' already exists; rename before restoring",
            )
        db_obj.is_archived = False
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_by_name(
        self, db: Session, *, organization_id: int, name: str
    ) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                func.lower(Client.name) == name.strip().lower(),
            )
            .first()
        )


client = CRUDClient()
