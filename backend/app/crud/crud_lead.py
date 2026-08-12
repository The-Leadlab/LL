from typing import List, Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc, func, exists, and_, or_, update, text
from fastapi.encoders import jsonable_encoder
from datetime import datetime
import logging
from fastapi import HTTPException

from app.crud.base import CRUDBase
from app.models.lead import Lead
from app.models.tag import Tag
from app.models.deal import Deal
from app.models.task import Task
from app.models.lead_stage import LeadStage
from app.models.user import User
from app.models.associations import lead_tags
from app.schemas.lead import LeadCreate, LeadUpdate

logger = logging.getLogger(__name__)

# Lead ORM has read-only @property fields (no DB column); Pydantic LeadBase still includes them.
_LEAD_ORM_EXCLUDE = frozenset({
    "email_guidelines", "visible", "full_name", "client_name", "tags", "notes",
})
_INT_OR_NONE_FIELDS = frozenset({
    "client_id", "stage_id", "organization_id", "user_id", "created_by",
})


def _lead_dict_for_orm(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove schema-only keys so Lead(**data) does not hit read-only properties."""
    out = {k: v for k, v in data.items() if k not in _LEAD_ORM_EXCLUDE}
    for key in _INT_OR_NONE_FIELDS:
        if key in out and out[key] == "":
            out[key] = None
    return out


class CRUDLead(CRUDBase[Lead, LeadCreate, LeadUpdate]):
    def get(self, db: Session, id: int) -> Optional[Lead]:
        """Get a lead by ID"""
        return db.query(Lead).filter(Lead.id == id).first()

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 200,
        organization_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        client_id: Optional[int] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_desc: bool = False,
        filters: Optional[Dict[str, Any]] = None,
        is_admin: bool = False
    ) -> tuple[List[Lead], int]:
        """Get multiple leads with filters and pagination. Returns (items, total_count)."""
        # Start with a subquery to get lead IDs with the specified tag
        if tag_id and tag_id > 0:
            logger.info(f"Filtering leads for tag_id: {tag_id}")
            # Get lead IDs that have the specified tag
            lead_ids_with_tag = (
                db.query(lead_tags.c.lead_id)
                .filter(lead_tags.c.tag_id == tag_id)
                .subquery()
            )
            
            # Main query using the lead IDs from subquery
            query = (
                db.query(Lead)
                .filter(Lead.id.in_(lead_ids_with_tag))
                .filter(Lead.is_deleted == False)
            )
        else:
            # If no tag filter, start with normal query
            query = db.query(Lead).filter(Lead.is_deleted == False)
        
        # Add organization filter only if user is not admin
        if organization_id is not None and not is_admin:
            query = query.filter(Lead.organization_id == organization_id)

        if client_id is not None and client_id > 0:
            query = query.filter(Lead.client_id == client_id)

        # Add search filter if provided
        if search:
            search_filter = or_(
                Lead.first_name.ilike(f"%{search}%"),
                Lead.last_name.ilike(f"%{search}%"),
                Lead.email.ilike(f"%{search}%"),
                Lead.company.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)

        # Add custom filters
        if filters:
            for key, value in filters.items():
                if hasattr(Lead, key):
                    column = getattr(Lead, key)
                    if isinstance(value, list) and value:  # If value is a non-empty list
                        # Case-insensitive IN query
                        query = query.filter(func.lower(column).in_([v.lower() for v in value]))
                    elif isinstance(value, str) and ',' in value:  # Handle comma-separated string values
                        values = [v.strip().lower() for v in value.split(',')]
                        # Case-insensitive IN query
                        query = query.filter(func.lower(column).in_(values))
                    elif value is not None:  # If value is a single non-None value
                        # Case-insensitive equality
                        query = query.filter(func.lower(column) == value.lower())

        # Add sorting
        if sort_by and hasattr(Lead, sort_by):
            sort_column = getattr(Lead, sort_by)
            order_by = desc(sort_column) if sort_desc else asc(sort_column)
            query = query.order_by(order_by)

        # Add pagination
        total = query.count()
        logger.info(f"Total leads before pagination: {total}")
        logger.info(f"Returning {limit} leads after pagination")

        items = query.offset(skip).limit(limit).all()
        return items, total

    def count(
        self,
        db: Session,
        *,
        organization_id: int,
        search: Optional[str] = None,
        stage_id: Optional[int] = None,
        assigned_to_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        is_admin: bool = False
    ) -> int:
        """
        Get total count of leads with filters.
        """
        query = db.query(func.count(Lead.id))
        
        # Admin users can see all leads in the database (including deleted ones)
        if not is_admin:
            # Normal users can only see non-deleted leads from their organization
            query = query.filter(
                Lead.organization_id == organization_id,
                Lead.is_deleted == False
            )

        if search:
            search_filter = or_(
                Lead.first_name.ilike(f"%{search}%"),
                Lead.last_name.ilike(f"%{search}%"),
                Lead.email.ilike(f"%{search}%"),
                Lead.company.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)

        if stage_id is not None:
            query = query.filter(Lead.stage_id == stage_id)

        if assigned_to_id is not None:
            query = query.filter(Lead.user_id == assigned_to_id)

        if tag_id is not None:
            query = query.join(Lead.tags).filter(Lead.tags.any(id=tag_id))

        return query.scalar()

    def get_by_email(self, db: Session, *, email: str) -> Optional[Lead]:
        return db.query(Lead).filter(Lead.email == email).first()

    def get_by_organization(
        self,
        db: Session,
        *,
        organization_id: int
    ) -> List[Lead]:
        return (
            db.query(Lead)
            .filter(Lead.organization_id == organization_id)
            .all()
        )

    def get_by_user(self, db: Session, *, user_id: int) -> List[Lead]:
        return db.query(Lead).filter(Lead.user_id == user_id).all()

    def get_by_stage(self, db: Session, *, stage_id: int) -> List[Lead]:
        return db.query(Lead).filter(Lead.stage_id == stage_id).all()

    def get_by_unique_id(self, db: Session, unique_lead_id: str) -> Optional[Lead]:
        return db.query(Lead).filter(Lead.un_lead_id == unique_lead_id).first()

    def search(
        self,
        db: Session,
        *,
        organization_id: int,
        search_term: str,
        skip: int = 0,
        limit: Optional[int] = None
    ) -> List[Lead]:
        """
        Search leads by name, company, or email.
        """
        query = (
            db.query(self.model)
            .filter(self.model.organization_id == organization_id)
            .filter(
                or_(
                    self.model.first_name.ilike(f"%{search_term}%"),
                    self.model.last_name.ilike(f"%{search_term}%"),
                    self.model.company.ilike(f"%{search_term}%"),
                    self.model.email.ilike(f"%{search_term}%"),
                )
            )
            .order_by(self.model.created_at.desc())
        )

        if skip:
            query = query.offset(skip)
        if limit:
            query = query.limit(limit)

        return query.all()

    def count_search(
        self,
        db: Session,
        *,
        organization_id: int,
        search_term: str
    ) -> int:
        """
        Count total number of leads matching the search criteria.
        """
        return (
            db.query(func.count(self.model.id))
            .filter(self.model.organization_id == organization_id)
            .filter(
                or_(
                    self.model.first_name.ilike(f"%{search_term}%"),
                    self.model.last_name.ilike(f"%{search_term}%"),
                    self.model.company.ilike(f"%{search_term}%"),
                    self.model.email.ilike(f"%{search_term}%"),
                )
            )
            .scalar()
        )

    def check_duplicate(
        self,
        db: Session,
        *,
        first_name: str,
        last_name: str,
        company: str,
        email: str,
        exclude_id: Optional[int] = None
    ) -> Optional[Lead]:
        """
        Check if a lead with similar details already exists.
        """
        query = db.query(Lead).filter(
            func.lower(Lead.first_name) == func.lower(first_name or ''),
            func.lower(Lead.last_name) == func.lower(last_name or ''),
            func.lower(Lead.company) == func.lower(company or ''),
            func.lower(Lead.email) == func.lower(email or '')
        )
        
        if exclude_id:
            query = query.filter(Lead.id != exclude_id)
            
        return query.first()

    def is_empty_lead(self, lead_data: Dict[str, Any]) -> bool:
        """
        Check if a lead is completely empty (all main fields are empty strings or None)
        """
        main_fields = ['first_name', 'last_name', 'company', 'email', 'telephone', 'mobile']
        return all(
            not lead_data.get(field) or str(lead_data.get(field)).strip() == ''
            for field in main_fields
        )

    def create(
        self,
        db: Session,
        *,
        obj_in: Union[LeadCreate, Dict[str, Any]]
    ) -> Lead:
        """
        Create a new lead after checking for duplicates and empty data.
        """
        if isinstance(obj_in, dict):
            create_data = obj_in
        else:
            create_data = obj_in.model_dump()

        # Check if lead is completely empty
        if self.is_empty_lead(create_data):
            raise ValueError("Cannot create an empty lead. Please provide at least one main field.")

        # Clean empty strings and None values (keep int FKs as None)
        _keep_none = {"client_id", "stage_id", "organization_id", "user_id", "created_by", "psychometrics", "sales_intelligence"}
        for key, value in list(create_data.items()):
            if isinstance(value, str):
                create_data[key] = value.strip() if value else ""
            elif value is None and key not in _keep_none:
                create_data[key] = ""

        # Add timestamps
        now = datetime.utcnow()
        create_data["created_at"] = now
        create_data["updated_at"] = now

        create_data = _lead_dict_for_orm(create_data)

        db_obj = self.model(**create_data)
        db.add(db_obj)
        db.commit()
        return db_obj

    def create_bulk(self, db: Session, *, obj_in_list: List[LeadCreate]) -> List[Lead]:
        """
        Create multiple leads at once.
        
        Args:
            db: Database session
            obj_in_list: List of LeadCreate objects
            
        Returns:
            List of created Lead objects
        """
        db_objs = []
        for obj_in in obj_in_list:
            obj_in_data = jsonable_encoder(obj_in)
            
            # Ensure tags is initialized as an empty list, not None
            if 'tags' not in obj_in_data or obj_in_data['tags'] is None:
                obj_in_data['tags'] = []

            obj_in_data = _lead_dict_for_orm(obj_in_data)
                
            db_obj = Lead(**obj_in_data)
            db_objs.append(db_obj)
            
        db.add_all(db_objs)
        db.commit()
        return db_objs

    def update(
        self,
        db: Session,
        *,
        db_obj: Lead,
        obj_in: Union[LeadUpdate, Dict[str, Any]]
    ) -> Lead:
        """
        Update a lead after checking for empty data.
        """
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        # Clean empty strings and None values
        for key, value in update_data.items():
            if isinstance(value, str):
                update_data[key] = value.strip() if value else ""
            elif value is None:
                update_data[key] = ""

        # Check if update would make the lead completely empty
        temp_data = {**db_obj.__dict__, **update_data}
        if self.is_empty_lead(temp_data):
            raise ValueError("Update would result in an empty lead. Please provide at least one main field.")

        # Update timestamp
        update_data["updated_at"] = datetime.utcnow()

        return super().update(db=db, db_obj=db_obj, obj_in=update_data)

    def remove(self, db: Session, *, id: int) -> Lead:
        obj = db.query(self.model).get(id)
        if not obj:
            raise HTTPException(status_code=404, detail="Lead not found")
            
        # First, delete related deals
        db.query(Deal).filter(Deal.lead_id == id).delete()
        
        # Then delete the lead
        db.delete(obj)
        db.commit()
        return obj

    def add_tag(self, db: Session, *, lead: Lead, tag: Tag) -> Lead:
        """Add a tag to a lead"""
        try:
            # Check if the tag is already assigned to the lead
            tag_exists = db.query(exists().where(
                lead_tags.c.lead_id == lead.id,
                lead_tags.c.tag_id == tag.id
            )).scalar()
            
            if not tag_exists:
                # Add the tag to the lead
                stmt = lead_tags.insert().values(
                    lead_id=lead.id,
                    tag_id=tag.id,
                    organization_id=lead.organization_id,
                    created_at=datetime.utcnow()
                )
                db.execute(stmt)
                db.commit()
                logger.info(f"Tag '{tag.name}' added to Lead ID {lead.id}")
            else:
                logger.info(f"Tag '{tag.name}' is already assigned to Lead ID {lead.id}")
            
            # Refresh the lead object to reflect changes
            db.refresh(lead)
            return lead
        except Exception as e:
            db.rollback()
            logger.error(f"Error adding tag to lead: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to add tag to lead: {str(e)}"
            )
    
    def remove_tag(self, db: Session, *, lead: Lead, tag: Tag) -> Lead:
        """Remove a tag from a lead"""
        try:
            stmt = lead_tags.delete().where(
                lead_tags.c.lead_id == lead.id,
                lead_tags.c.tag_id == tag.id
            )
            db.execute(stmt)
            db.commit()
            logger.info(f"Tag '{tag.name}' removed from Lead ID {lead.id}")
            
            # Refresh the lead object to reflect changes
            db.refresh(lead)
            return lead
        except Exception as e:
            db.rollback()
            logger.error(f"Error removing tag from lead: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to remove tag from lead: {str(e)}"
            )

lead = CRUDLead(Lead)

__all__ = ["lead"]
