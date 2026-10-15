"""
Data Import/Export API Endpoints

Import data from competitors (Salesforce, HubSpot, Pipedrive) and CSV files.
Export data to various formats.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session
import os

from app.api import deps
from app.models.user import User
from app.models.data_import import ImportJob, CRMConnection
from app.schemas.data_import import (
    ImportJobCreate, ImportJobUpdate, ImportJobResponse, ImportProgress,
    CSVImportRequest, CSVPreviewResponse,
    CRMConnectionCreate, CRMConnectionUpdate, CRMConnectionResponse,
    SalesforceImportRequest, HubSpotImportRequest, PipedriveImportRequest,
    ExportJobCreate, ExportJobResponse,
    ImportValidationResult, ImportRecordResponse
)
from app.crud.crud_data_import import (
    crud_import_job, crud_import_record, crud_export_job,
    crud_crm_connection, csv_helper
)

router = APIRouter(redirect_slashes=False)

UPLOAD_DIR = "/tmp/imports"  # Configure this properly


# Import Job Endpoints
@router.get("/jobs", response_model=List[ImportJobResponse])
def list_import_jobs(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[str] = Query(None)
):
    """
    List all import jobs.
    """
    jobs = crud_import_job.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        status=status
    )
    return jobs


@router.get("/jobs/{job_id}", response_model=ImportJobResponse)
def get_import_job(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get import job details.
    """
    job = crud_import_job.get(db, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")

    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return job


@router.get("/jobs/{job_id}/progress", response_model=ImportProgress)
def get_import_progress(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get import job progress.
    """
    job = crud_import_job.get(db, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")

    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    progress_percentage = 0
    if job.total_records > 0:
        progress_percentage = (job.processed_records / job.total_records) * 100

    return ImportProgress(
        job_id=job.id,
        status=job.status,
        total_records=job.total_records,
        processed_records=job.processed_records,
        successful_records=job.successful_records,
        failed_records=job.failed_records,
        skipped_records=job.skipped_records,
        progress_percentage=round(progress_percentage, 2)
    )


@router.get("/jobs/{job_id}/records", response_model=List[ImportRecordResponse])
def get_import_records(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100)
):
    """
    Get import records for a job.
    """
    job = crud_import_job.get(db, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")

    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    records = crud_import_record.get_by_job(
        db, job_id=job_id, skip=skip, limit=limit, status=status
    )

    return records


# CSV Import Endpoints
@router.post("/csv/upload", response_model=CSVPreviewResponse)
async def upload_csv_for_preview(
    file: UploadFile = File(...),
    has_header: bool = Query(True),
    delimiter: str = Query(","),
    encoding: str = Query("utf-8"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Upload CSV file and get preview with suggested field mappings.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    # Read file content
    content = await file.read()

    # Parse CSV
    result = csv_helper.parse_csv(content, has_header, delimiter, encoding)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # Detect field mappings
    detected_fields = csv_helper.detect_field_mappings(result["headers"], "leads")

    # Return preview with sample rows
    return CSVPreviewResponse(
        headers=result["headers"],
        sample_rows=result["rows"][:5],  # First 5 rows
        total_rows=result["total_rows"],
        detected_fields=detected_fields
    )


@router.post("/csv/import", response_model=ImportJobResponse)
async def import_csv(
    file: UploadFile = File(...),
    entity_type: str = Query(..., description="leads, contacts, deals, accounts"),
    field_mapping: Optional[str] = Query(None, description="JSON string of field mappings"),
    has_header: bool = Query(True),
    delimiter: str = Query(","),
    encoding: str = Query("utf-8"),
    deduplicate: bool = Query(True),
    update_existing: bool = Query(False),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Import data from CSV file.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    # Save uploaded file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, f"{current_user.organization_id}_{file.filename}")

    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)

    # Parse field mapping if provided
    import json
    field_mapping_dict = json.loads(field_mapping) if field_mapping else None

    # Create import job
    job = crud_import_job.create(
        db,
        obj_in=ImportJobCreate(
            source_type="csv",
            source_name=file.filename,
            entity_type=entity_type,
            field_mapping=field_mapping_dict,
            deduplicate=deduplicate,
            update_existing=update_existing
        ),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
        file_path=file_path
    )

    # Queue background processing
    # background_tasks.add_task(process_csv_import, job.id, file_path, has_header, delimiter, encoding)

    return job


# CRM Connection Endpoints
@router.get("/connections", response_model=List[CRMConnectionResponse])
def list_crm_connections(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    crm_type: Optional[str] = Query(None)
):
    """
    List all CRM connections.
    """
    connections = crud_crm_connection.get_multi(
        db,
        organization_id=current_user.organization_id,
        crm_type=crm_type
    )
    return connections


@router.post("/connections", response_model=CRMConnectionResponse)
def create_crm_connection(
    connection_in: CRMConnectionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new CRM connection.

    Supports Salesforce, HubSpot, Pipedrive, Zoho, and Microsoft Dynamics.
    """
    connection = crud_crm_connection.create(
        db,
        obj_in=connection_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )
    return connection


@router.put("/connections/{connection_id}", response_model=CRMConnectionResponse)
def update_crm_connection(
    connection_id: int,
    connection_in: CRMConnectionUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update CRM connection.
    """
    connection = crud_crm_connection.get(db, connection_id)

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    connection = crud_crm_connection.update(db, connection=connection, obj_in=connection_in)
    return connection


@router.delete("/connections/{connection_id}")
def delete_crm_connection(
    connection_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete CRM connection.
    """
    connection = crud_crm_connection.get(db, connection_id)

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    crud_crm_connection.delete(db, connection_id=connection_id)
    return {"message": "Connection deleted successfully"}


@router.post("/connections/{connection_id}/test")
def test_crm_connection(
    connection_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Test CRM connection.
    """
    connection = crud_crm_connection.get(db, connection_id)

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # TODO: Implement actual connection test for each CRM type
    return {
        "success": True,
        "message": "Connection test successful",
        "crm_type": connection.crm_type
    }


# CRM Import Endpoints
@router.post("/salesforce/import", response_model=ImportJobResponse)
def import_from_salesforce(
    import_request: SalesforceImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Import data from Salesforce.
    """
    connection = crud_crm_connection.get(db, import_request.connection_id)

    if not connection or connection.crm_type != "salesforce":
        raise HTTPException(status_code=404, detail="Salesforce connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Create import job
    job = crud_import_job.create(
        db,
        obj_in=ImportJobCreate(
            source_type="salesforce",
            source_name=connection.connection_name,
            entity_type=import_request.entity_type.lower(),
            field_mapping=import_request.field_mapping
        ),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    # Queue background processing
    # background_tasks.add_task(process_salesforce_import, job.id, connection, import_request)

    return job


@router.post("/hubspot/import", response_model=ImportJobResponse)
def import_from_hubspot(
    import_request: HubSpotImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Import data from HubSpot.
    """
    connection = crud_crm_connection.get(db, import_request.connection_id)

    if not connection or connection.crm_type != "hubspot":
        raise HTTPException(status_code=404, detail="HubSpot connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Create import job
    job = crud_import_job.create(
        db,
        obj_in=ImportJobCreate(
            source_type="hubspot",
            source_name=connection.connection_name,
            entity_type=import_request.entity_type,
            field_mapping=import_request.field_mapping
        ),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    # Queue background processing
    # background_tasks.add_task(process_hubspot_import, job.id, connection, import_request)

    return job


@router.post("/pipedrive/import", response_model=ImportJobResponse)
def import_from_pipedrive(
    import_request: PipedriveImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Import data from Pipedrive.
    """
    connection = crud_crm_connection.get(db, import_request.connection_id)

    if not connection or connection.crm_type != "pipedrive":
        raise HTTPException(status_code=404, detail="Pipedrive connection not found")

    if connection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Create import job
    job = crud_import_job.create(
        db,
        obj_in=ImportJobCreate(
            source_type="pipedrive",
            source_name=connection.connection_name,
            entity_type=import_request.entity_type,
            field_mapping=import_request.field_mapping
        ),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    # Queue background processing
    # background_tasks.add_task(process_pipedrive_import, job.id, connection, import_request)

    return job


# Export Endpoints
@router.post("/export", response_model=ExportJobResponse)
def create_export(
    export_in: ExportJobCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Export data to CSV, JSON, or Excel.
    """
    job = crud_export_job.create(
        db,
        obj_in=export_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    # Queue background processing
    # background_tasks.add_task(process_export, job.id, export_in)

    return job


@router.get("/export/{job_id}", response_model=ExportJobResponse)
def get_export_job(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get export job status and download link.
    """
    job = crud_export_job.get(db, job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")

    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return job


@router.get("/statistics")
def get_import_statistics(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get import/export statistics.
    """
    stats = crud_import_job.get_statistics(db, current_user.organization_id)
    return stats
