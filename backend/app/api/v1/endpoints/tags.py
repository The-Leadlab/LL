from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.tag import Tag
from app.models.lead import Lead
from app.models.organization import Organization
from app.schemas.tag import TagCreate, TagUpdate, Tag as TagSchema, LeadTagCreate
import logging
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from sqlalchemy import Table, text
from app.models.associations import lead_tags  # lead_tags tablosunu import et
from app.crud import lead as crud_lead
from app.crud import tag as crud_tag

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("", response_model=List[TagSchema])
@router.get("/", response_model=List[TagSchema])
async def get_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all tags for the current user's organization."""
    try:
        tags = db.query(Tag).filter(
            Tag.organization_id == current_user.organization_id
        ).all()
            
        # Get organization names for all tags
        for tag in tags:
            org = db.query(Organization).filter(
                Organization.id == tag.organization_id
            ).first()
            tag.organization_name = org.name if org else f"Organization ID: {tag.organization_id}"
            
        return tags
    except Exception as e:
        logger.error(f"Error getting tags: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=TagSchema)
@router.post("/", response_model=TagSchema)
async def create_tag(
    tag: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new tag"""
    try:
        # Validate tag name
        if not tag.name or not tag.name.strip():
            raise HTTPException(status_code=400, detail="Tag name cannot be empty")
        
        # Normalize tag name
        tag.name = tag.name.strip()
        
        # Check if tag with same name exists in SAME ORGANIZATION
        existing_tag = db.query(Tag).filter(
            Tag.organization_id == current_user.organization_id,
            Tag.name == tag.name
        ).first()
        
        if existing_tag:
            raise HTTPException(
                status_code=400, 
                detail=f"Tag '{tag.name}' already exists in your organization"
            )

        # Create new tag
        new_tag = Tag(
            name=tag.name,
            organization_id=current_user.organization_id,
            created_at=datetime.utcnow()
        )
        
        db.add(new_tag)
        db.commit()
        db.refresh(new_tag)
        
        return new_tag
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error creating tag: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create tag: {str(e)}"
        )

@router.put("/{tag_id}", response_model=TagSchema)
@router.put("/{tag_id}/", response_model=TagSchema)
async def update_tag(
    tag_id: int,
    tag_update: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a tag"""
    # Admin kullanıcılar tüm etiketleri güncelleyebilir
    if current_user.is_admin:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
    else:
        tag = db.query(Tag).filter(
            Tag.id == tag_id,
            Tag.organization_id == current_user.organization_id
        ).first()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    try:
        # Check if new name conflicts with existing tag
        if tag_update.name and tag_update.name != tag.name:
            # Admin kullanıcılar için organizasyon kontrolü farklı
            if current_user.is_admin:
                existing_tag = db.query(Tag).filter(
                    Tag.organization_id == tag.organization_id,
                    Tag.name == tag_update.name,
                    Tag.id != tag_id
                ).first()
            else:
                existing_tag = db.query(Tag).filter(
                    Tag.organization_id == current_user.organization_id,
                    Tag.name == tag_update.name,
                    Tag.id != tag_id
                ).first()
            
            if existing_tag:
                raise HTTPException(status_code=400, detail="Tag with this name already exists")

        for field, value in tag_update.dict(exclude_unset=True).items():
            setattr(tag, field, value)
        db.commit()
        db.refresh(tag)
        return tag
    except HTTPException as e:
        db.rollback()
        raise e
    except Exception as e:
        logger.error(f"Error updating tag: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{tag_id}", response_model=TagSchema)
@router.delete("/{tag_id}/", response_model=TagSchema)
async def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a tag"""
    # Admin kullanıcılar tüm etiketleri silebilir
    # Diğer kullanıcılar sadece kendi organizasyonlarındaki etiketleri silebilir
    if current_user.is_admin:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
    else:
        tag = db.query(Tag).filter(
            Tag.id == tag_id,
            Tag.organization_id == current_user.organization_id
        ).first()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    try:
        db.delete(tag)
        db.commit()
        return tag
    except Exception as e:
        logger.error(f"Error deleting tag: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def create_error_response(status_code: int, detail: str) -> HTTPException:
    """Create a standardized error response"""
    return HTTPException(status_code=status_code, detail=detail)

def validate_tag_name(name: Optional[str]) -> str:
    """Validate and normalize tag name"""
    if not name or not name.strip():
        raise create_error_response(400, "Tag name cannot be empty")
    return name.strip()

def check_existing_tag(db: Session, name: str, organization_id: int) -> None:
    """Check if tag already exists in organization"""
    existing = db.query(Tag).filter(
        Tag.organization_id == organization_id,
        Tag.name == name
    ).first()
    
    if existing:
        raise create_error_response(
            400, 
            f"Tag '{name}' already exists in your organization"
        )

def get_lead_and_tag(
    db: Session,
    lead_id: int,
    tag_id: int,
    organization_id: int
) -> tuple[Lead, Tag]:
    """Get lead and tag, ensuring they exist and belong to organization"""
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.organization_id == organization_id
    ).first()
    if not lead:
        raise create_error_response(404, "Lead not found")

    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.organization_id == organization_id
    ).first()
    if not tag:
        raise create_error_response(404, "Tag not found")

    return lead, tag

@router.delete("/leads/{lead_id}/tags/{tag_id}", response_model=Dict[str, Any])
async def remove_lead_tag(
    lead_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Remove a tag from a lead"""
    try:
        logger.info(f"Removing tag {tag_id} from lead {lead_id}")
        
        # Get the lead
        lead = crud_lead.get(db, id=lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Admin kullanıcılar tüm leadler üzerinde işlem yapabilir
        # Normal kullanıcılar sadece kendi organizasyonlarındaki leadler üzerinde işlem yapabilir
        if lead.organization_id != current_user.organization_id:
            logger.error(f"Authorization failed: Lead {lead_id} belongs to organization {lead.organization_id}, but user {current_user.id} belongs to organization {current_user.organization_id}")
            raise HTTPException(status_code=403, detail="Not authorized to modify this lead")

        # Get the tag
        tag = crud_tag.get(db, id=tag_id)
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        # Admin kullanıcılar tüm etiketler üzerinde işlem yapabilir
        # Normal kullanıcılar sadece kendi organizasyonlarındaki etiketler üzerinde işlem yapabilir
        if tag.organization_id != current_user.organization_id:
            logger.error(f"Authorization failed: Tag {tag_id} belongs to organization {tag.organization_id}, but user {current_user.id} belongs to organization {current_user.organization_id}")
            raise HTTPException(status_code=403, detail="Not authorized to use this tag")

        # Check if the association exists
        existing = db.query(lead_tags).filter(
            lead_tags.c.lead_id == lead_id,
            lead_tags.c.tag_id == tag_id
        ).first()

        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found for this lead")

        # Remove the association
        stmt = lead_tags.delete().where(
            lead_tags.c.lead_id == lead_id,
            lead_tags.c.tag_id == tag_id
        )
        db.execute(stmt)
        db.commit()

        logger.info(f"Successfully removed tag {tag_id} from lead {lead_id}")
        return {
            "message": "Tag removed from lead successfully",
            "lead_id": lead_id,
            "tag_id": tag_id
        }

    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        logger.error(f"Error removing tag from lead: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove tag from lead: {str(e)}"
        )