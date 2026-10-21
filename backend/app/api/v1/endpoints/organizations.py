from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status, Form, File, UploadFile
from datetime import datetime
from app.models.lead import Lead
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.api import deps
from app import crud
from app.models.user import User
from app.schemas.organization import Organization, OrganizationCreate, OrganizationUpdate
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(redirect_slashes=False, tags=["organizations"])

# Configure static file serving for organization logos
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))), "uploads")
ORGANIZATIONS_DIR = os.path.join(UPLOAD_DIR, "organizations")
os.makedirs(ORGANIZATIONS_DIR, exist_ok=True)

@router.get("/logo/{org_id}/{filename}")
async def get_organization_logo(org_id: int, filename: str):
    """
    Serve organization logo file
    """
    file_path = os.path.join(ORGANIZATIONS_DIR, str(org_id), "logo", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(file_path)

@router.get("", response_model=List[Organization])
@router.get("/", response_model=List[Organization])
async def get_organizations(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = Query(False, description="Include deactivated teams (admin org management only)"),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve organizations.

    By default only active teams are returned so deleted/deactivated workspaces
    do not appear in assignment dropdowns. Pass include_inactive=true on the
    Organization Management screen to reactivate or review them.
    """
    try:
        # Check if user exists and is active
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
            
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user"
            )
            
        # Get organizations based on user role
        if current_user.is_admin:
            logger.debug(f"Admin user {current_user.email} requesting organizations (include_inactive={include_inactive})")
            organizations = crud.organization.get_multi(
                db,
                skip=skip,
                limit=max(limit, 500),
            )
            # Treat null is_active as active for legacy rows; hide deactivated teams by default
            if not include_inactive:
                organizations = [o for o in organizations if o.is_active is not False]
            return organizations
        else:
            # Non-admin users can only see their own organization (if still active)
            logger.debug(f"Non-admin user {current_user.email} requesting their organization")
            if not current_user.organization_id:
                return []
            
            organization = crud.organization.get(db, id=current_user.organization_id)
            if not organization or organization.is_active is False:
                return []
            return [organization]

    except HTTPException as he:
        logger.error(f"HTTP error in get_organizations: {str(he)}")
        raise he
    except Exception as e:
        logger.error(f"Error in get_organizations: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/{organization_id}", response_model=Organization)
@router.get("/{organization_id}/", response_model=Organization)
async def get_organization(
    organization_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get organization by ID.
    """
    try:
        if not current_user.is_admin and current_user.organization_id != organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
            
        organization = crud.organization.get(db=db, id=organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
            
        return organization
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("", response_model=Organization)
@router.post("/", response_model=Organization)
async def create_organization(
    *,
    db: Session = Depends(deps.get_db),
    name: str = Form(...),
    description: str = Form(None),
    website: str = Form(None),
    is_active: bool = Form(True),
    logo: UploadFile = File(None),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new organization.
    """
    try:
        logger.info(f"Creating organization with name: {name}, description: {description}, website: {website}, is_active: {is_active}")
        
        if not current_user.is_admin:
            logger.warning(f"Non-admin user {current_user.email} attempted to create organization")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )

        # Validate name
        if not name or not name.strip():
            logger.warning("Organization creation failed: Empty name")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Organization name is required"
            )

        # Create organization data
        organization_data = {
            "name": name.strip(),
            "description": description.strip() if description else None,
            "website": website.strip() if website else None,
            "is_active": is_active,
            "logo_filename": logo.filename if logo else None,
            "logo_content_type": logo.content_type if logo else None,
            "logo_path": None  # Will be updated after saving the file
        }
        
        logger.info(f"Organization data prepared: {organization_data}")

        # Create organization
        try:
            organization = crud.organization.create(db=db, obj_in=organization_data)
            logger.info(f"Organization created with ID: {organization.id}")
        except Exception as e:
            logger.error(f"Database error while creating organization: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to create organization: {str(e)}"
            )

        # Save logo file if provided
        if logo:
            try:
                logger.info(f"Processing logo file: {logo.filename}, content_type: {logo.content_type}")
                
                # Validate file size (max 5MB)
                file_content = await logo.read()
                file_size = len(file_content)
                logger.info(f"Logo file size: {file_size} bytes")
                
                if file_size > 5 * 1024 * 1024:  # 5MB
                    logger.warning(f"Logo file too large: {file_size} bytes")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Logo file size must be less than 5MB"
                    )
                
                # Create directory if it doesn't exist
                logo_dir = os.path.join(ORGANIZATIONS_DIR, str(organization.id), "logo")
                os.makedirs(logo_dir, exist_ok=True)
                
                # Save the file
                file_path = os.path.join(logo_dir, logo.filename)
                logger.info(f"Saving logo file to: {file_path}")
                
                with open(file_path, "wb") as file_object:
                    file_object.write(file_content)
                    
                # Update organization with logo path
                relative_path = os.path.relpath(file_path, ORGANIZATIONS_DIR)
                organization = crud.organization.update(
                    db=db,
                    db_obj=organization,
                    obj_in={"logo_path": relative_path}
                )
                logger.info("Logo file saved and organization updated successfully")
            except HTTPException as he:
                raise he
            except Exception as e:
                logger.error(f"Error saving logo file: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Organization was created but logo upload failed. Please try updating the logo later."
                )

        return organization
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Unexpected error creating organization: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while creating the organization"
        )

@router.patch("/{organization_id}", response_model=Organization)
@router.patch("/{organization_id}/", response_model=Organization)
async def update_organization(
    *,
    organization_id: int,
    name: str = Form(None),
    description: str = Form(None),
    website: str = Form(None),
    is_active: bool = Form(None),
    logo: UploadFile = File(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update organization.
    """
    try:
        if not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
            
        organization = crud.organization.get(db=db, id=organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        # Create update data
        update_data = {}
        if name is not None:
            update_data["name"] = name
        if description is not None:
            update_data["description"] = description
        if website is not None:
            update_data["website"] = website
        if is_active is not None:
            update_data["is_active"] = is_active

        # Handle logo upload if provided
        if logo:
            try:
                logger.info(f"Processing logo file: {logo.filename}, content_type: {logo.content_type}")
                
                # Validate file size (max 5MB)
                file_content = await logo.read()
                file_size = len(file_content)
                logger.info(f"Logo file size: {file_size} bytes")
                
                if file_size > 5 * 1024 * 1024:  # 5MB
                    logger.warning(f"Logo file too large: {file_size} bytes")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Logo file size must be less than 5MB"
                    )
                
                # Create directory if it doesn't exist
                logo_dir = os.path.join(ORGANIZATIONS_DIR, str(organization.id), "logo")
                os.makedirs(logo_dir, exist_ok=True)
                
                # Save the file
                file_path = os.path.join(logo_dir, logo.filename)
                logger.info(f"Saving logo file to: {file_path}")
                
                with open(file_path, "wb") as file_object:
                    file_object.write(file_content)
                    
                # Update logo metadata in database
                relative_path = os.path.relpath(file_path, ORGANIZATIONS_DIR)
                update_data["logo_filename"] = logo.filename
                update_data["logo_content_type"] = logo.content_type
                update_data["logo_path"] = relative_path
                
                logger.info("Logo file saved successfully")
            except HTTPException as he:
                raise he
            except Exception as e:
                logger.error(f"Error saving logo file: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Failed to upload logo. Please try again."
                )

        organization = crud.organization.update(
            db=db,
            db_obj=organization,
            obj_in=update_data
        )
        return organization
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Error in update_organization: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/{organization_id}", response_model=Organization)
@router.delete("/{organization_id}/", response_model=Organization)
async def delete_organization(
    *,
    organization_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Soft-delete a team/workspace: deactivate it, soft-delete its leads, and
    tombstone its users so they leave Performance, Reports, and assignment UIs.
    Hard delete is avoided because FK-linked rows usually block it.
    """
    try:
        if not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
            
        organization = crud.organization.get(db=db, id=organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        import time as _time

        now = datetime.utcnow()
        # Soft-delete all leads in this team
        db.query(Lead).filter(
            Lead.organization_id == organization_id,
            Lead.is_deleted.is_(False),
        ).update({"is_deleted": True, "updated_at": now}, synchronize_session=False)

        # Deactivate + tombstone users still on this team (keep current admin)
        org_users = (
            db.query(User)
            .filter(User.organization_id == organization_id)
            .all()
        )
        for u in org_users:
            if int(u.id) == int(current_user.id):
                continue
            if (u.email or "").lower().endswith("@deleted.local"):
                u.is_active = False
                continue
            u.email = f"deleted+user-{u.id}-{int(_time.time())}@deleted.local"
            if hasattr(u, "username"):
                u.username = None
            u.first_name = "Deleted"
            u.last_name = f"User {u.id}"
            u.is_active = False
            u.is_superuser = False
            u.role = "user"
            u.updated_at = now
            db.add(u)

        organization.is_active = False
        organization.updated_at = now
        db.add(organization)
        db.commit()
        db.refresh(organization)
        return organization
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{organization_id}/stats", response_model=dict)
@router.get("/{organization_id}/stats/", response_model=dict)
async def get_organization_stats(
    organization_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get organization statistics.
    """
    try:
        if not current_user.is_admin and current_user.organization_id != organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
            
        organization = crud.organization.get(db=db, id=organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
            
        # Get organization statistics
        stats = crud.organization.get_stats(db=db, organization_id=organization_id)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
