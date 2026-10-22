from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional
import json
import logging
from datetime import datetime
import traceback
import io

from app import crud, models, schemas
from app.schemas.response import GenericResponse
from app.api import deps
from app.schemas.lead_stage import LeadStageCreate
from app.services.lead_import_columns import (
    apply_column_mapping_to_row,
    build_alias_field_map,
    clean_cell,
    prepare_import_dataframe,
    preview_import_file,
    row_has_identity,
)

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)

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
    return clean_cell(value)


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


def _parse_column_mapping(raw: Optional[str]) -> Optional[Dict[str, str]]:
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid column_mapping JSON: {e}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="column_mapping must be a JSON object")
    out: Dict[str, str] = {}
    for k, v in data.items():
        if v is None or v == "" or v == "__skip__":
            continue
        out[str(k)] = str(v)
    return out or None


@router.post("/import/preview")
async def preview_leads_import(
    *,
    current_user: models.User = Depends(deps.get_current_user),
    file: UploadFile = File(...),
    column_mapping: Optional[str] = Form(None),
):
    """
    Preview a CSV/XLSX: headers, suggested column mapping, and sample rows.
    Pass column_mapping (JSON lead_field → header) to recompute identity counts
    after the user remaps columns (Apollo-style mapping UI).
    """
    _ = current_user
    filename_lower = (file.filename or "").lower()
    allowed_ext = (".csv", ".xlsx", ".xls")
    if not any(filename_lower.endswith(ext) for ext in allowed_ext):
        raise HTTPException(
            status_code=400,
            detail="Only CSV or Excel (.xlsx, .xls) files are allowed",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    try:
        mapping = _parse_column_mapping(column_mapping)
        return preview_import_file(
            content,
            file.filename or "upload.csv",
            column_mapping=mapping,
        )
    except Exception as e:
        logger.error("Import preview failed: %s", e)
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"Could not preview file: {e}")


@router.post("/import/csv", response_model=GenericResponse)
async def import_leads_from_csv(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    assigned_user_id: int = Form(...),  # User ID to assign leads to
    tag_id: int = Form(None),  # Optional tag ID to assign to leads
    new_tag_name: str = Form(None),  # Optional new tag name to create and assign
    client_id: Optional[int] = Form(None),  # Optional client; defaults to General when omitted
    column_mapping: Optional[str] = Form(None),  # JSON: lead_field → source header
    file: UploadFile = File(...),
):
    """
    Import leads from CSV/XLSX file.
    Optional column_mapping JSON maps lead fields to file headers (from preview UI).
    Empty rows (no name and no email) are skipped.
    """
    mapping = _parse_column_mapping(column_mapping)

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

    filename_lower = (file.filename or "").lower()
    allowed_ext = (".csv", ".xlsx", ".xls")
    if not any(filename_lower.endswith(ext) for ext in allowed_ext):
        raise HTTPException(
            status_code=400,
            detail="Only CSV or Excel (.xlsx, .xls) files are allowed",
        )

    try:
        logger.info(f"Starting lead import for file: {file.filename}")

        content = await file.read()
        if len(content) == 0:
            logger.error("Empty file uploaded")
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty"
            )

        try:
            df, original_headers, normalized_headers = prepare_import_dataframe(
                content, file.filename or "upload.csv"
            )
        except Exception as parse_err:
            logger.error("Import parse failed: %s", parse_err)
            raise HTTPException(
                status_code=400,
                detail=f"Could not read file: {parse_err}",
            )

        if len(df) == 0:
            logger.error("Import file has no data rows")
            raise HTTPException(
                status_code=400,
                detail="The file contains no data rows"
            )

        logger.info(
            "Successfully prepared import with %s rows, mapping=%s",
            len(df),
            bool(mapping),
        )

        successful_imports = []
        updated_imports = []
        failed_imports = []
        skipped_empty = 0
        leads_to_create = []
        seen_emails_in_batch = set()  # type: set
        org_id = assigned_user.organization_id
        alias_map = build_alias_field_map()

        # Fields safe to refresh on an existing lead when importing into a list
        _MERGE_FIELDS = (
            "first_name",
            "last_name",
            "company",
            "job_title",
            "telephone",
            "mobile",
            "location",
            "linkedin",
            "country",
            "website",
            "sector",
            "unique_lead_id",
            "lab_comments",
            "client_comments",
            "source",
            "est_wealth_experience",
        )

        for index, row in df.iterrows():
            try:
                lead_data = apply_column_mapping_to_row(
                    row,
                    original_headers=original_headers,
                    normalized_headers=normalized_headers,
                    column_mapping=mapping,
                    alias_map=alias_map,
                )

                if not row_has_identity(lead_data):
                    skipped_empty += 1
                    continue

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
                            organization_id=org_id,
                        )
                        if cobj and not cobj.is_archived:
                            resolved_client_id = cobj.id
                    elif row_client_name:
                        cobj = crud_client.get_by_name(
                            db,
                            organization_id=org_id,
                            name=str(row_client_name),
                        )
                        if cobj and not cobj.is_archived:
                            resolved_client_id = cobj.id

                wpi_raw = None
                if "wpi" in row.index:
                    wpi_raw = clean_value(row.get("wpi", ""))

                lead_data.update({
                    "psychometrics": None,
                    "wpi": float(wpi_raw) if wpi_raw is not None else None,
                    "stage_id": default_stage.id,
                    "client_id": resolved_client_id,
                    "user_id": assigned_user_id,
                    "organization_id": org_id,
                    "created_by": current_user.id,
                    "created_at": datetime.utcnow(),
                    "source": lead_data.get("source") or "Partner",
                })

                email_raw = lead_data.get("email")
                email_key = str(email_raw).strip().lower() if email_raw else ""

                if email_key:
                    if email_key in seen_emails_in_batch:
                        failed_imports.append({
                            "row": int(index) + 2,
                            "error": f"Duplicate email in this file: {email_raw}",
                        })
                        continue
                    seen_emails_in_batch.add(email_key)

                    existing_lead = crud.lead.get_by_email_any_status(
                        db, email=email_raw, organization_id=org_id
                    )
                    if existing_lead:
                        # Merge into target list instead of silently failing the import
                        was_deleted = bool(existing_lead.is_deleted)
                        same_client = existing_lead.client_id == resolved_client_id
                        if same_client and not was_deleted:
                            failed_imports.append({
                                "row": int(index) + 2,
                                "error": (
                                    f"Lead with email {email_raw} already exists "
                                    f"in this list"
                                ),
                            })
                            continue

                        merge_payload = {
                            k: lead_data[k]
                            for k in _MERGE_FIELDS
                            if k in lead_data and lead_data[k] not in (None, "")
                        }
                        merge_payload["client_id"] = resolved_client_id
                        merge_payload["is_deleted"] = False
                        if was_deleted:
                            merge_payload["user_id"] = assigned_user_id
                        truncated = truncate_lead_strings(
                            merge_payload, int(index) + 2
                        )
                        if truncated:
                            logger.info(
                                "Row %s: truncated %s field(s) on merge",
                                int(index) + 2,
                                truncated,
                            )
                        for key, value in merge_payload.items():
                            setattr(existing_lead, key, value)
                        existing_lead.updated_at = datetime.utcnow()
                        db.add(existing_lead)
                        updated_imports.append(int(index) + 2)
                        continue

                truncated = truncate_lead_strings(lead_data, int(index) + 2)
                if truncated:
                    logger.info(
                        "Row %s: truncated %s field(s) to fit column limits",
                        int(index) + 2,
                        truncated,
                    )

                lead_create = schemas.LeadCreate(**lead_data)
                leads_to_create.append(lead_create)
                successful_imports.append(int(index) + 2)

            except Exception as e:
                logger.error(f"Error processing row {int(index) + 2}: {str(e)}")
                failed_imports.append({
                    "row": int(index) + 2,
                    "error": str(e)
                })

        if updated_imports:
            try:
                db.commit()
                logger.info("Updated/moved %s existing leads during import", len(updated_imports))
            except Exception as e:
                db.rollback()
                logger.error(f"Error committing lead updates: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating existing leads: {str(e)}",
                )

        if leads_to_create:
            try:
                created_leads = crud.lead.create_bulk(db, obj_in_list=leads_to_create)
                logger.info(f"Successfully created {len(created_leads)} leads")

                # Seed lead_assignees with primary owner
                try:
                    for lead in created_leads:
                        db.execute(
                            models.associations.lead_assignees.insert().values(
                                lead_id=lead.id,
                                user_id=lead.user_id,
                            )
                        )
                    db.commit()
                except Exception as assignee_err:
                    logger.warning("Could not seed lead_assignees: %s", assignee_err)

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
        updated_count = len(updated_imports)
        failed_count = len(failed_imports)

        return GenericResponse(
            success=True,
            message="Import completed",
            data={
                "total_rows": total_rows,
                "successful_imports": successful_count + updated_count,
                "created_imports": successful_count,
                "updated_imports": updated_count,
                "failed_imports": failed_count,
                "skipped_empty_rows": skipped_empty,
                "failed_details": failed_imports[:50],
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
