from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import numpy as np
import logging
from datetime import datetime
import traceback
import io

from app import crud, models, schemas
from app.schemas.response import GenericResponse
from app.api import deps
from app.schemas.lead_stage import LeadStageCreate
from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Max lengths for Lead string columns (must match backend/app/models/lead.py)
LEAD_STRING_MAX_LENGTHS = {
    "first_name": 100,
    "last_name": 100,
    "email": 255,
    "job_title": 255,
    "company": 200,
    "linkedin": 500,
    "location": 200,
    "country": 100,
    "website": 500,
    "unique_lead_id": 100,
    "est_wealth_experience": 255,
    "telephone": 50,
    "mobile": 50,
    "sector": 200,
    "time_in_current_role": 100,
    "source": 100,
}


def truncate_lead_strings(lead_data: dict, row_index: int) -> int:
    """Truncate string values in lead_data to column max lengths. Returns count truncated."""
    truncated_count = 0
    for field, max_len in LEAD_STRING_MAX_LENGTHS.items():
        if field not in lead_data:
            continue
        value = lead_data[field]
        if value is not None and isinstance(value, str) and len(value) > max_len:
            lead_data[field] = value[:max_len]
            truncated_count += 1
            logger.debug("Truncated row=%s field=%s len %s->%s", row_index, field, len(value), max_len)
    return truncated_count


def clean_value(value):
    """Clean value from NaN, empty strings, and whitespace."""
    if pd.isna(value) or value == "" or (isinstance(value, str) and value.strip() == ""):
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned if cleaned else None
    return value


def decode_csv_bytes(content: bytes) -> str:
    """Decode CSV content using common encodings with fallback."""
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1", "utf-16"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=400,
        detail="Error reading CSV file: unsupported encoding. Please save as UTF-8."
    )


@router.post("/import/csv", response_model=GenericResponse)
async def import_leads_from_csv(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    assigned_user_id: int = Form(...),  # User ID to assign leads to
    tag_id: int = Form(None),  # Optional tag ID to assign to leads
    new_tag_name: str = Form(None),  # Optional new tag name to create and assign
    client_id: Optional[int] = Form(None),  # Optional client; defaults to General when omitted
    file: UploadFile = File(...),
):
    """
    Import leads from CSV file.
    The leads will be assigned to the specified user.
    Optionally, a tag can be assigned to all imported leads.

    Client assignment:
    - If form `client_id` is provided, ALL imported leads use that client
      (CSV Client / client_name columns are ignored so a template "General"
      column cannot override the UI selection).
    - If form `client_id` is omitted, per-row CSV client/client_id is used,
      falling back to the org General client.
    """
    # Non-admins can only assign to themselves
    if not current_user.is_admin and assigned_user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only assign leads to yourself."
        )

    # Get the assigned user
    try:
        assigned_user = crud.user.get(db, id=assigned_user_id)
        if not assigned_user:
            raise HTTPException(
                status_code=404,
                detail="Assigned user not found"
            )
        if not assigned_user.organization_id:
            raise HTTPException(
                status_code=400,
                detail="Assigned user must be associated with an organization"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting assigned user: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Error with assigned user: {str(e)}"
        )

    # Get default stage_id for new leads
    try:
        default_stage = crud.lead_stage.get_by_order_index(
            db,
            order_index=1,
            organization_id=assigned_user.organization_id
        )
        if not default_stage:
            try:
                default_stage = crud.lead_stage.create(
                    db=db,
                    obj_in=LeadStageCreate(
                        name="New",
                        description="Default stage for new leads",
                        color="#808080",
                        order=1,
                        organization_id=assigned_user.organization_id,
                        is_active=True
                    )
                )
                logger.info(f"Created default stage: {default_stage.id}")
            except Exception as e:
                logger.error(f"Error creating default stage: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail="Could not create default lead stage. Please create at least one lead stage first."
                )
    except Exception as e:
        logger.error(f"Error getting/creating default stage: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=400,
            detail=f"Error with lead stages: {str(e)}"
        )

    # Handle tag - either use existing tag or create new one
    tag = None
    if tag_id:
        tag = crud.tag.get(db, id=tag_id)
        if not tag:
            raise HTTPException(
                status_code=404,
                detail=f"Tag with ID {tag_id} not found"
            )
        logger.info(f"Leads will be tagged with existing tag '{tag.name}'")
    elif new_tag_name:
        try:
            existing_tag = crud.tag.check_duplicate(
                db=db,
                name=new_tag_name,
                organization_id=current_user.organization_id
            )

            if existing_tag:
                tag = existing_tag
                logger.info(f"Using existing tag '{new_tag_name}' with ID {tag.id}")
            else:
                tag_data = {
                    "name": new_tag_name,
                    "organization_id": current_user.organization_id,
                    "created_at": datetime.utcnow()
                }
                logger.info(f"Attempting to create new tag with data: {tag_data}")

                try:
                    new_tag = models.Tag(**tag_data)
                    db.add(new_tag)
                    db.commit()
                    db.refresh(new_tag)
                    tag = new_tag
                    logger.info(f"Successfully created new tag '{new_tag_name}' with ID {tag.id}")
                except Exception as create_error:
                    logger.error(f"Error in tag creation: {str(create_error)}")
                    logger.error(traceback.format_exc())
                    db.rollback()
                    raise create_error
        except Exception as e:
            logger.error(f"Error handling tag creation: {str(e)}")
            logger.error(traceback.format_exc())
            tag = None

    from app.crud.crud_client import client as crud_client
    general_client = crud_client.ensure_general(
        db, organization_id=assigned_user.organization_id
    )
    default_import_client = general_client
    if client_id:
        resolved = crud_client.get_for_org(
            db, id=client_id, organization_id=assigned_user.organization_id
        )
        if not resolved or resolved.is_archived:
            raise HTTPException(
                status_code=400,
                detail="Invalid or archived client",
            )
        default_import_client = resolved

    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are allowed"
        )

    try:
        logger.info(f"Starting CSV import for file: {file.filename}")

        content = await file.read()
        if len(content) == 0:
            logger.error("Empty CSV file uploaded")
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty"
            )

        csv_text = decode_csv_bytes(content)
        df = pd.read_csv(io.StringIO(csv_text))

        if len(df) == 0:
            logger.error("CSV file has no data rows")
            raise HTTPException(
                status_code=400,
                detail="The CSV file contains no data rows"
            )

        logger.info(f"Successfully read CSV file with {len(df)} rows")

        # Normalize headers: strip, lowercase, spaces and dashes to underscores (so Excel template columns match)
        def normalize_header(col):
            if not isinstance(col, str):
                col = str(col).strip()
            s = col.strip().lower().replace(" ", "_").replace("-", "_")
            while "__" in s:
                s = s.replace("__", "_")
            return s.strip("_") or None

        df.columns = [normalize_header(col) or f"_unnamed_{i}" for i, col in enumerate(df.columns)]

        successful_imports = []
        failed_imports = []
        leads_to_create = []

        # Map CSV column names (any subset is OK; missing headers leave that field null)
        field_mappings = {
            "first_name": ["first_name", "firstname", "first"],
            "last_name": ["last_name", "lastname", "last"],
            "email": ["email", "email_address", "emails"],
            "job_title": ["job_title", "jobtitle", "title", "position"],
            "company": ["company", "organization"],
            "linkedin": ["linkedin", "linkedin_url", "linkedinurl"],
            "location": ["location", "city"],
            "country": ["country"],
            "website": ["website", "web", "url"],
            "telephone": ["telephone", "phone", "tel"],
            "mobile": ["mobile", "cell", "mobile_phone"],
            "sector": ["sector", "industry"],
            "time_in_current_role": ["time_in_current_role", "time_in_role", "role_duration"],
            "unique_lead_id": ["unique_lead_id", "lead_id"],
            "lab_comments": ["lab_comments", "lab_comment", "labcomments", "note"],
            "client_comments": ["client_comments", "client_comment", "clientcomments"],
            "source": ["source", "lead_source"],
            "client": ["client", "client_name", "clientname"],
            "client_id": ["client_id", "clientid"],
        }

        for index, row in df.iterrows():
            try:
                lead_data = {}
                for db_field, possible_names in field_mappings.items():
                    matching_col = next((c for c in possible_names if c in df.columns), None)
                    if matching_col:
                        value = row[matching_col]
                        if hasattr(value, "iloc"):
                            value = value.iloc[0] if len(value) else None
                        if db_field in ["mobile", "telephone"]:
                            if isinstance(value, (int, float)) and not pd.isna(value):
                                value = str(int(value))
                            value = clean_value(value)
                        elif db_field == "client_id":
                            if isinstance(value, (int, float)) and not pd.isna(value):
                                value = int(value)
                            else:
                                cleaned = clean_value(value)
                                value = int(cleaned) if cleaned and str(cleaned).isdigit() else None
                        else:
                            value = clean_value(value)
                        lead_data[db_field] = value
                    # else: column missing -> field not set; LeadCreate will use default (None)

                if "email" not in lead_data:
                    lead_data["email"] = None

                # Resolve client:
                # - Form client_id (UI selection) wins for the whole batch
                # - Otherwise per-row CSV client / client_id, then General
                row_client_id = lead_data.pop("client_id", None)
                row_client_name = lead_data.pop("client", None)
                if client_id:
                    resolved_client_id = default_import_client.id
                else:
                    resolved_client_id = general_client.id
                    if row_client_id:
                        cobj = crud_client.get_for_org(
                            db,
                            id=int(row_client_id),
                            organization_id=assigned_user.organization_id,
                        )
                        if cobj and not cobj.is_archived:
                            resolved_client_id = cobj.id
                    elif row_client_name:
                        cobj = crud_client.get_by_name(
                            db,
                            organization_id=assigned_user.organization_id,
                            name=str(row_client_name),
                        )
                        if cobj and not cobj.is_archived:
                            resolved_client_id = cobj.id

                lead_data.update({
                    "psychometrics": None,
                    "wpi": float(clean_value(row.get("wpi", 0))) if clean_value(row.get("wpi", "")) else None,
                    "stage_id": default_stage.id,
                    "client_id": resolved_client_id,
                    "user_id": assigned_user_id,
                    "organization_id": assigned_user.organization_id,
                    "created_by": current_user.id,
                    "created_at": datetime.utcnow(),
                    "source": lead_data.get("source", "Partner")
                })

                if lead_data.get("email"):
                    existing_lead = crud.lead.get_by_email(db, email=lead_data["email"])
                    if existing_lead:
                        failed_imports.append({
                            "row": index + 2,
                            "error": f"Lead with email {lead_data['email']} already exists"
                        })
                        continue

                truncated = truncate_lead_strings(lead_data, index + 2)
                if truncated:
                    logger.info("Row %s: truncated %s field(s) to fit column limits", index + 2, truncated)

                lead_create = schemas.LeadCreate(**lead_data)
                leads_to_create.append(lead_create)
                successful_imports.append(index + 2)

            except Exception as e:
                logger.error(f"Error processing row {index + 2}: {str(e)}")
                failed_imports.append({
                    "row": index + 2,
                    "error": str(e)
                })

        if leads_to_create:
            try:
                created_leads = crud.lead.create_bulk(db, obj_in_list=leads_to_create)
                logger.info(f"Successfully created {len(created_leads)} leads")

                if tag and created_leads:
                    try:
                        for lead in created_leads:
                            db.execute(
                                models.associations.lead_tags.insert().values(
                                    lead_id=lead.id,
                                    tag_id=tag.id,
                                    organization_id=lead.organization_id,
                                    created_at=datetime.utcnow()
                                )
                            )
                        db.commit()
                        logger.info(f"Successfully tagged {len(created_leads)} leads with tag '{tag.name}'")
                    except Exception as tag_error:
                        logger.error(f"Error tagging leads: {str(tag_error)}")
            except Exception as e:
                logger.error(f"Error during bulk creation: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Error creating leads: {str(e)}"
                )

        total_rows = len(df)
        successful_count = len(successful_imports)
        failed_count = len(failed_imports)

        return GenericResponse(
            success=True,
            message="Import completed",
            data={
                "total_rows": total_rows,
                "successful_imports": successful_count,
                "failed_imports": failed_count,
                "failed_details": failed_imports
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during CSV import: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error importing leads: {str(e)}"
        )


from fastapi.responses import StreamingResponse
import csv


@router.get("/template", response_class=StreamingResponse)
async def download_csv_template(
    current_user: models.User = Depends(deps.get_current_user),
):
    """
    Download a CSV template with sample data for lead imports
    """
    try:
        output = io.StringIO()
        writer = csv.writer(output)

        # Headers match Excel template; any subset of columns is accepted on import
        headers = [
            "First_Name", "Last_Name", "Company", "Job_Title", "Email", "Telephone", "Mobile",
            "Location", "LINKEDIN", "Country", "Website", "SECTOR", "Unique_Lead_ID", "Time in Current Role",
            "Note", "Client"
        ]
        writer.writerow(headers)

        sample_data = [
            [
                "John", "Doe", "Tech Corp", "Senior Developer", "john.doe@techcorp.com",
                "+1-555-0123", "+1-555-4567", "San Francisco", "https://linkedin.com/in/johndoe",
                "USA", "https://techcorp.com", "Technology", "EXT-001", "2 years",
                "Experienced developer with cloud expertise", "General"
            ],
            [
                "Jane", "Smith", "Finance Inc", "Investment Manager", "jane.smith@financeinc.com",
                "+44-20-1234", "+44-77-5678", "London", "https://linkedin.com/in/janesmith",
                "UK", "https://financeinc.com", "Finance", "EXT-002", "1 year",
                "Specializes in portfolio management", ""
            ]
        ]

        for row in sample_data:
            writer.writerow(row)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=leads_template.csv"
            }
        )
    except Exception as e:
        logger.error(f"Error generating CSV template: {str(e)}")
        logger.exception("Template generation exception:")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating template: {str(e)}"
        )
