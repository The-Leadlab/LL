from typing import Any, List, Optional
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.api import deps
from datetime import datetime
import uuid
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
import logging
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import joinedload

logger = logging.getLogger(__name__)

router = APIRouter()

class LeadTagUpdate(BaseModel):
    tags: List[int]

class BulkLeadTagUpdate(BaseModel):
    leadIds: List[int]
    tags: List[int]


class BulkMoveClientRequest(BaseModel):
    """Move leads to another client. Provide lead_ids and/or from_client_id."""
    to_client_id: int
    lead_ids: Optional[List[int]] = None
    from_client_id: Optional[int] = None
    # When true with from_client_id, move every matching lead in the org (not only selected)
    move_all_from_client: bool = False
    # Optional ISO datetime — only move leads created at/after this time
    created_after: Optional[datetime] = None


class LeadStatsResponse(BaseModel):
    total: int
    new: int
    qualified: int
    contacted: int
    converted: int
    hot_prospects: int
    qualification_rate: float


def _lead_stage_bucket(stage_name: Optional[str]) -> str:
    """
    Map lead stage display name to dashboard buckets (New / Qualified / Contacted / Converted).
    Unknown stages default to 'contacted' mid-funnel.
    """
    if not stage_name:
        return "new"
    n = stage_name.strip().lower()
    if "renew" in n:
        return "contacted"
    if "lost" in n or "disqualified" in n:
        return "contacted"
    if any(k in n for k in ("closed won", "converted", "customer")):
        return "converted"
    if "won" in n and "new" not in n[:4]:
        return "converted"
    if "convert" in n:
        return "converted"
    if "contact" in n:
        return "contacted"
    if "qualif" in n:
        return "qualified"
    if "new" in n:
        return "new"
    return "contacted"


@router.get("/stats", response_model=LeadStatsResponse)
def get_lead_statistics(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
) -> Any:
    """
    Lead statistics for the dashboard. Non-admin users are scoped to their organization;
    admins see all leads (same as legacy behavior).
    """
    try:
        # Build organization filter
        filters = [
            models.Lead.is_deleted == False
        ]

        # Add organization filter for non-admin users
        if not current_user.is_admin:
            filters.append(models.Lead.organization_id == current_user.organization_id)

        leads = (
            db.query(models.Lead)
            .options(joinedload(models.Lead.stage))
            .filter(*filters)
            .all()
        )

        total_leads = len(leads)
        cnt_new = cnt_qualified = cnt_contacted = cnt_converted = 0

        for lead in leads:
            name = lead.stage.name if lead.stage else ""
            bucket = _lead_stage_bucket(name)
            if bucket == "new":
                cnt_new += 1
            elif bucket == "qualified":
                cnt_qualified += 1
            elif bucket == "contacted":
                cnt_contacted += 1
            else:
                cnt_converted += 1

        # Hot prospects — heuristics (email + sector/source/title)
        hot_sectors = [
            "technology",
            "finance",
            "healthcare",
            "consulting",
            "software",
            "it",
            "medical",
            "tech",
            "fintech",
        ]
        hot_sources = ["referral", "linkedin", "website", "partner", "recommendation"]
        hot_prospects_count = 0

        for lead in leads:
            has_email = bool(lead.email and lead.email.strip())
            is_hot_sector = False
            if lead.sector and lead.sector.strip():
                sector_lower = lead.sector.lower()
                is_hot_sector = any(hot_sector in sector_lower for hot_sector in hot_sectors)
            is_hot_source = False
            if lead.source and lead.source.strip():
                source_lower = lead.source.lower()
                is_hot_source = any(hot_source in source_lower for hot_source in hot_sources)
            has_job_title = bool(lead.job_title and lead.job_title.strip())
            if has_email and (is_hot_sector or is_hot_source or has_job_title):
                hot_prospects_count += 1

        # Qualification rate: % of leads in a "Qualified" stage (name contains qualif)
        qualification_rate = (
            (cnt_qualified / total_leads * 100) if total_leads > 0 else 0.0
        )

        logger.info(
            "Lead Statistics for org %s: Total=%s new=%s qual=%s contact=%s conv=%s hot=%s",
            current_user.organization_id,
            total_leads,
            cnt_new,
            cnt_qualified,
            cnt_contacted,
            cnt_converted,
            hot_prospects_count,
        )

        return LeadStatsResponse(
            total=total_leads,
            new=cnt_new,
            qualified=cnt_qualified,
            contacted=cnt_contacted,
            converted=cnt_converted,
            hot_prospects=hot_prospects_count,
            qualification_rate=round(qualification_rate, 1),
        )
        
    except Exception as e:
        logger.error(f"Error retrieving lead statistics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while retrieving lead statistics: {str(e)}"
        )

@router.get("", response_model=schemas.LeadListResponse)
@router.get("/", response_model=schemas.LeadListResponse)
def read_leads(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    search: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    sort_desc: bool = True,
    tag: Optional[str] = None,
    client_id: Optional[int] = Query(None, description="Filter by client id"),
) -> Any:
    """
    Retrieve leads.
    Admin users can see all leads, normal users only see their organization's leads.
    """
    try:
        # Convert tag to tag_id if provided
        tag_id = None
        if tag and tag != 'all':
            try:
                tag_id = int(tag)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid tag ID format"
                )

        # Get leads with organization filter
        leads, total = crud.lead.get_multi(
            db=db,
            skip=skip,
            limit=limit,
            organization_id=current_user.organization_id,
            search=search,
            sort_by=sort_by,
            sort_desc=sort_desc,
            tag_id=tag_id,
            client_id=client_id,
            is_admin=current_user.is_admin
        )

        # Psychometrics is now automatically corrected via hybrid_property

        page_idx = skip // limit if limit else 0
        return schemas.LeadListResponse(
            results=leads,
            total=total,
            page=page_idx,
            size=len(leads),
            has_more=(skip + len(leads)) < total,
        )
        
    except Exception as e:
        logger.error(f"Error retrieving leads: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while retrieving leads: {str(e)}"
        )


@router.get("/export/csv")
def export_leads_csv(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    search: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    sort_desc: bool = True,
    tag: Optional[str] = None,
    client_id: Optional[int] = Query(None, description="Filter by client id"),
) -> Any:
    """
    Export leads matching list filters as CSV (same scoping as GET /leads/).
    Root cause fix: frontend called /leads/export/csv but no route existed (404).
    """
    try:
        tag_id = None
        if tag and tag != "all":
            try:
                tag_id = int(tag)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid tag ID format")

        def row_for(lead: models.Lead) -> List[str]:
            stage_name = lead.stage.name if getattr(lead, "stage", None) else ""
            return [
                str(lead.id),
                lead.first_name or "",
                lead.last_name or "",
                lead.email or "",
                lead.company or "",
                lead.job_title or "",
                lead.telephone or "",
                lead.mobile or "",
                lead.location or "",
                lead.country or "",
                str(lead.stage_id) if lead.stage_id is not None else "",
                stage_name,
                str(lead.client_id) if lead.client_id is not None else "",
                (lead.client.name if getattr(lead, "client", None) else "") or "",
                lead.source or "",
                lead.created_at.isoformat() if lead.created_at else "",
            ]

        def generate():
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(
                [
                    "id",
                    "first_name",
                    "last_name",
                    "email",
                    "company",
                    "job_title",
                    "telephone",
                    "mobile",
                    "location",
                    "country",
                    "stage_id",
                    "stage_name",
                    "client_id",
                    "client_name",
                    "source",
                    "created_at",
                ]
            )
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

            skip = 0
            batch_size = 2000
            while True:
                leads, _total = crud.lead.get_multi(
                    db=db,
                    skip=skip,
                    limit=batch_size,
                    organization_id=current_user.organization_id,
                    search=search,
                    sort_by=sort_by,
                    sort_desc=sort_desc,
                    tag_id=tag_id,
                    client_id=client_id,
                    is_admin=current_user.is_admin,
                )
                if not leads:
                    break
                for lead in leads:
                    writer.writerow(row_for(lead))
                chunk = buffer.getvalue()
                buffer.seek(0)
                buffer.truncate(0)
                if chunk:
                    yield chunk
                if len(leads) < batch_size:
                    break
                skip += batch_size

        filename = f"leads-export-{datetime.utcnow().date().isoformat()}.csv"
        return StreamingResponse(
            generate(),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting leads CSV: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while exporting leads: {str(e)}",
        )


@router.post("", response_model=schemas.LeadResponse)
@router.post("/", response_model=schemas.LeadResponse)
def create_lead(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    lead_in: schemas.LeadCreate,
) -> Any:
    """
    Create new lead.
    """
    try:
        # Log incoming data
        logger.info(f"Received lead creation request with data: {lead_in.model_dump()}")
        
        # Add organization_id, user_id, and created_by
        lead_data = lead_in.model_dump()
        lead_data["organization_id"] = current_user.organization_id
        lead_data["user_id"] = current_user.id
        lead_data["created_by"] = current_user.id
        lead_data["created_at"] = datetime.utcnow()
        lead_data["is_deleted"] = False
        lead_data["visible"] = True

        # Ensure psychometrics is a dict if provided
        if lead_data.get("psychometrics") == "":
            lead_data["psychometrics"] = None

        # Log enriched data
        logger.info(f"Enriched lead data: {lead_data}")

        # If stage_id is not provided, get or create default stage
        if not lead_data.get("stage_id"):
            logger.info("No stage_id provided, getting or creating default stage")
            default_stage = crud.lead_stage.get_by_order_index(
                db, 
                order_index=1, 
                organization_id=current_user.organization_id
            )
            if not default_stage:
                logger.info("Creating default stage")
                default_stage = crud.lead_stage.create(
                    db=db,
                    obj_in={
                        "name": "New",
                        "description": "Default stage for new leads",
                        "order_index": 1,
                        "organization_id": current_user.organization_id
                    }
                )
            lead_data["stage_id"] = default_stage.id
            logger.info(f"Set stage_id to {default_stage.id}")

        # Resolve client (default General when omitted / skip)
        from app.crud.crud_client import client as crud_client
        general = crud_client.ensure_general(db, organization_id=current_user.organization_id)
        requested_client_id = lead_data.get("client_id")
        if requested_client_id:
            client_obj = crud_client.get_for_org(
                db, id=requested_client_id, organization_id=current_user.organization_id
            )
            if not client_obj or client_obj.is_archived:
                raise HTTPException(status_code=400, detail="Invalid or archived client")
            lead_data["client_id"] = client_obj.id
        else:
            lead_data["client_id"] = general.id

        # Create lead
        try:
            lead = crud.lead.create(db=db, obj_in=lead_data)
            logger.info(f"Successfully created lead with ID: {lead.id}")
            
            # Handle tags if provided
            tags = []
            if lead_in.tags and len(lead_in.tags) > 0:
                logger.info(f"Adding tags to lead {lead.id}: {lead_in.tags}")
                
                # Add tags to the lead
                for tag_id in lead_in.tags:
                    tag = crud.tag.get(db=db, id=tag_id)
                    if tag and (current_user.is_admin or tag.organization_id == current_user.organization_id):
                        # Insert new association with organization_id
                        db.execute(
                            models.associations.lead_tags.insert().values(
                                lead_id=lead.id,
                                tag_id=tag_id,
                                organization_id=lead.organization_id,
                                created_at=datetime.utcnow()
                            )
                        )
                        tags.append({"id": tag.id, "name": tag.name})
                    else:
                        logger.warning(f"Tag {tag_id} not found or not accessible to user {current_user.id}")
                
                # Commit changes for tags
                db.commit()
                db.refresh(lead)
                logger.info(f"Successfully added tags to lead {lead.id}")
            
            # Convert lead object to dictionary
            lead_dict = {
                "id": lead.id,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company": lead.company,
                "job_title": lead.job_title,
                "email": lead.email,
                "telephone": lead.telephone,
                "mobile": lead.mobile,
                "location": lead.location,
                "linkedin": lead.linkedin,
                "country": lead.country,
                "website": lead.website,
                "sector": lead.sector,
                "organization_id": lead.organization_id,
                "user_id": lead.user_id,
                "stage_id": lead.stage_id,
                "created_by": lead.created_by,
                "created_at": lead.created_at,
                "is_deleted": lead.is_deleted,
                "visible": lead.visible,
                "psychometrics": lead.psychometrics or {},
                "notes": [],
                "tags": tags
            }
            
            return schemas.LeadResponse(
                success=True,
                message="Lead created successfully",
                data=lead_dict
            )
        except Exception as e:
            logger.error(f"Error creating lead in database: {str(e)}")
            raise

    except Exception as e:
        logger.error(f"Error in create_lead: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error creating lead: {str(e)}"
        )

@router.get("/{id}", response_model=schemas.LeadResponse)
@router.get("/{id}/", response_model=schemas.LeadResponse)
def read_lead(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    id: int,
) -> Any:
    """
    Get lead by ID.
    """
    logger.info(f"Fetching lead with ID: {id} for user {current_user.id}")
    lead = crud.lead.get(db=db, id=id)
    if not lead:
        logger.warning(f"Lead with ID {id} not found")
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Admin users can access any lead
    if not current_user.is_admin:
        # Non-admin users can only access leads from their organization
        if lead.organization_id != current_user.organization_id:
            logger.warning(f"User {current_user.id} attempted to access lead {id} from organization {lead.organization_id}")
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Convert lead object to dictionary
    lead_dict = {
        "id": lead.id,
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "company": lead.company,
        "job_title": lead.job_title,
        "email": lead.email,
        "telephone": lead.telephone,
        "mobile": lead.mobile,
        "location": lead.location,
        "linkedin": lead.linkedin,
        "country": lead.country,
        "website": lead.website,
        "sector": lead.sector,
        "organization_id": lead.organization_id,
        "user_id": lead.user_id,
        "stage_id": lead.stage_id,
        "client_id": lead.client_id,
        "client_name": lead.client.name if lead.client else None,
        "created_by": lead.created_by,
        "created_at": lead.created_at,
        "is_deleted": lead.is_deleted,
        "visible": lead.visible,
        "psychometrics": lead.psychometrics or {},
        "notes": [],
        "tags": [],
        "lab_comments": lead.lab_comments,
        "client_comments": lead.client_comments,
        "time_in_current_role": lead.time_in_current_role,
        "source": lead.source,
        "est_wealth_experience": lead.est_wealth_experience,
        "wpi": lead.wpi,
        "unique_lead_id": lead.unique_lead_id,
        "updated_at": lead.updated_at,
        "full_name": f"{lead.first_name} {lead.last_name}".strip()
    }

    # Add stage information if available
    if hasattr(lead, 'stage') and lead.stage:
        lead_dict["stage"] = {
            "id": lead.stage.id,
            "name": lead.stage.name
        }

    # Add user information if available
    if hasattr(lead, 'user') and lead.user:
        lead_dict["user"] = {
            "id": lead.user.id,
            "email": lead.user.email,
            "first_name": lead.user.first_name,
            "last_name": lead.user.last_name
        }

    # Add creator information if available
    if hasattr(lead, 'creator') and lead.creator:
        lead_dict["creator"] = {
            "id": lead.creator.id,
            "email": lead.creator.email,
            "first_name": lead.creator.first_name,
            "last_name": lead.creator.last_name
        }

    # Add tags if available
    if hasattr(lead, 'tags'):
        lead_dict["tags"] = [
            {
                "id": tag.id,
                "name": tag.name
            }
            for tag in lead.tags
        ]

    # Add notes if available
    if hasattr(lead, 'notes'):
        lead_dict["notes"] = [
            {
                "id": note.id,
                "content": note.content,
                "created_at": note.created_at,
                "created_by": note.created_by
            }
            for note in lead.notes
        ]
    
    return schemas.LeadResponse(
        success=True,
        message="Lead retrieved successfully",
        data=lead_dict
    )

@router.put("/{lead_id}", response_model=schemas.Lead)
def update_lead(
    *,
    db: Session = Depends(deps.get_db),
    lead_id: int,
    lead_in: schemas.LeadUpdate,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update a lead.
    Admin users can update any lead, normal users can only update leads in their organization.
    """
    # Get the lead using the base class get method which expects 'id'
    lead = crud.lead.get(db=db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    # Check if user has permission to update this lead
    # Admin kullanıcılar herhangi bir lead'i güncelleyebilir
    # Normal kullanıcılar sadece kendi organizasyonlarındaki lead'leri güncelleyebilir
    if not current_user.is_admin and lead.organization_id != current_user.organization_id:
        logger.warning(f"Permission denied: User {current_user.id} attempted to update lead {lead_id} from organization {lead.organization_id}, but belongs to organization {current_user.organization_id}")
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = lead_in.model_dump(exclude_unset=True)
    if "client_id" in update_data:
        from app.crud.crud_client import client as crud_client
        requested = update_data.get("client_id")
        if requested is None:
            general = crud_client.ensure_general(
                db, organization_id=lead.organization_id
            )
            update_data["client_id"] = general.id
        else:
            client_obj = crud_client.get_for_org(
                db, id=requested, organization_id=lead.organization_id
            )
            if not client_obj or client_obj.is_archived:
                raise HTTPException(status_code=400, detail="Invalid or archived client")
            update_data["client_id"] = client_obj.id

    lead = crud.lead.update(db=db, db_obj=lead, obj_in=update_data)
    logger.info(f"Lead {lead_id} successfully updated by user {current_user.id}")
    return lead

@router.post("/{lead_id}/tags", response_model=schemas.LeadResponse)
def update_lead_tags(
    lead_id: int,
    tag_update: LeadTagUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Update tags for a lead.
    Accepts a list of tag IDs and replaces all existing tags for the lead.
    """
    try:
        logger.info(f"Updating tags for lead {lead_id}: {tag_update.tags}")
        
        # Get the lead
        lead = crud.lead.get(db=db, id=lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Check permissions
        if not current_user.is_admin and lead.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        
        # First, delete existing tag associations for this lead
        db.execute(
            models.associations.lead_tags.delete().where(
                models.associations.lead_tags.c.lead_id == lead_id
            )
        )
        
        # Add new tags
        for tag_id in tag_update.tags:
            tag = crud.tag.get(db=db, id=tag_id)
            if tag and (current_user.is_admin or tag.organization_id == current_user.organization_id):
                # Insert new association with organization_id
                db.execute(
                    models.associations.lead_tags.insert().values(
                        lead_id=lead_id,
                        tag_id=tag_id,
                        organization_id=lead.organization_id,
                        created_at=datetime.utcnow()
                    )
                )
            else:
                logger.warning(f"Tag {tag_id} not found or not accessible to user {current_user.id}")
        
        db.commit()
        db.refresh(lead)
        
        # Convert lead to dictionary for response
        lead_dict = {
            "id": lead.id,
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "tags": [{"id": tag.id, "name": tag.name} for tag in lead.tags]
        }
        
        logger.info(f"Successfully updated tags for lead {lead_id}")
        return schemas.LeadResponse(success=True, data=lead_dict)
    except Exception as e:
        logger.error(f"Error updating tags: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk/move-client", response_model=schemas.LeadResponse)
def bulk_move_leads_to_client(
    body: BulkMoveClientRequest,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Move selected leads (or all leads from a client) to another client.
    Use this to fix mistaken imports (e.g. General → Serendian).
    """
    from app.crud.crud_client import client as crud_client

    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    target = crud_client.get_for_org(
        db, id=body.to_client_id, organization_id=current_user.organization_id
    )
    if not target or target.is_archived:
        raise HTTPException(status_code=400, detail="Invalid or archived target client")

    lead_ids = list(body.lead_ids or [])
    if body.move_all_from_client:
        if body.from_client_id is None:
            raise HTTPException(
                status_code=400,
                detail="from_client_id is required when move_all_from_client is true",
            )
        q = db.query(models.Lead.id).filter(
            models.Lead.organization_id == current_user.organization_id,
            models.Lead.client_id == body.from_client_id,
            models.Lead.is_deleted == False,  # noqa: E712
        )
        if body.created_after is not None:
            q = q.filter(models.Lead.created_at >= body.created_after)
        rows = q.all()
        lead_ids = [r[0] for r in rows]
    elif body.from_client_id is not None and not lead_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide lead_ids, or set move_all_from_client=true with from_client_id",
        )

    if not lead_ids:
        raise HTTPException(status_code=400, detail="No leads to move")

    updated = 0
    for lid in lead_ids:
        lead = crud.lead.get(db=db, id=lid)
        if not lead:
            continue
        if lead.organization_id != current_user.organization_id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail=f"Not enough permissions for lead {lid}")
        if body.from_client_id is not None and lead.client_id != body.from_client_id:
            continue
        if body.created_after is not None and (
            lead.created_at is None or lead.created_at < body.created_after
        ):
            continue
        lead.client_id = target.id
        lead.updated_at = datetime.utcnow()
        db.add(lead)
        updated += 1

    db.commit()
    return schemas.LeadResponse(
        success=True,
        message=f"Moved {updated} lead(s) to {target.name}",
        data={"moved": updated, "to_client_id": target.id, "to_client_name": target.name},
    )


@router.post("/bulk/tags", response_model=schemas.LeadResponse)
def update_leads_tags_bulk(
    tag_update: BulkLeadTagUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Update tags for multiple leads in bulk
    """
    try:
        if not tag_update.leadIds:
            raise HTTPException(
                status_code=400,
                detail="No leads provided for tagging"
            )

        if not tag_update.tags:
            raise HTTPException(
                status_code=400,
                detail="No tags provided for update"
            )

        # Verify all leads exist and user has permission
        leads = []
        for lead_id in tag_update.leadIds:
            lead = crud.lead.get(db=db, id=lead_id)
            if not lead:
                raise HTTPException(
                    status_code=404,
                    detail=f"Lead with id {lead_id} not found"
                )
            if lead.organization_id != current_user.organization_id:
                raise HTTPException(
                    status_code=403,
                    detail=f"Not enough permissions for lead {lead_id}"
                )
            leads.append(lead)

        # Verify all tags exist and belong to user's organization
        tags = []
        for tag_id in tag_update.tags:
            tag = crud.tag.get(db=db, id=tag_id)
            if not tag:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tag with id {tag_id} not found"
                )
            if tag.organization_id != current_user.organization_id:
                raise HTTPException(
                    status_code=403,
                    detail=f"Not enough permissions for tag {tag_id}"
                )
            tags.append(tag)

        try:
            # First, delete existing tag associations for these leads
            for lead in leads:
                db.execute(
                    models.associations.lead_tags.delete().where(
                        models.associations.lead_tags.c.lead_id == lead.id
                    )
                )
            
            # Then create new associations
            for lead in leads:
                for tag in tags:
                    db.execute(
                        models.associations.lead_tags.insert().values(
                            lead_id=lead.id,
                            tag_id=tag.id,
                            organization_id=current_user.organization_id,
                            created_at=datetime.utcnow()
                        )
                    )
            
            # Commit all changes
            db.commit()
            
            logger.info(f"Successfully updated tags for {len(leads)} leads with tags: {[t.name for t in tags]}")
            
            return schemas.LeadResponse(
                success=True,
                data={
                    "updated_leads": len(leads),
                    "tags": [{"id": t.id, "name": t.name} for t in tags]
                }
            )
        except Exception as db_error:
            db.rollback()
            logger.error(f"Database error in bulk tag update: {str(db_error)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to update tags due to database error"
            )
            
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        logger.error(f"Error in bulk tag update: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update tags: {str(e)}"
        )

@router.delete("/{lead_id}", response_model=schemas.LeadResponse)
def delete_lead(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    lead_id: int,
    confirm: bool = Query(False, description="Confirmation flag for lead deletion")
) -> Any:
    """
    Delete a lead.
    """
    lead = crud.lead.get(db=db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Check permissions: Admin can delete any lead, regular users can only delete leads in their organization
    if not current_user.is_admin and lead.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # If not confirmed, return a confirmation request
    if not confirm:
        return schemas.LeadResponse(
            success=False,
            message="Please confirm deletion",
            data={
                "id": lead_id,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company": lead.company,
                "requires_confirmation": True
            }
        )
    
    # If confirmed, proceed with deletion
    crud.lead.remove(db=db, id=lead_id)
    return schemas.LeadResponse(
        success=True,
        message="Lead deleted successfully",
        data={"id": lead_id}
    )