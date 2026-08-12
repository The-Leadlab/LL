"""
CRUD operations for Data Import/Export
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from datetime import datetime, timedelta
import csv
import io

from app.models.data_import import ImportJob, ImportRecord, ExportJob, CRMConnection, FieldMapping
from app.schemas.data_import import (
    ImportJobCreate, ImportJobUpdate,
    CRMConnectionCreate, CRMConnectionUpdate,
    ExportJobCreate
)


class CRUDImportJob:
    """CRUD operations for Import Jobs"""

    def get(self, db: Session, job_id: int) -> Optional[ImportJob]:
        """Get import job by ID"""
        return db.query(ImportJob).filter(ImportJob.id == job_id).first()

    def get_multi(
        self,
        db: Session,
        *,
        organization_id: int,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None
    ) -> List[ImportJob]:
        """Get multiple import jobs"""
        query = db.query(ImportJob).filter(ImportJob.organization_id == organization_id)

        if status:
            query = query.filter(ImportJob.status == status)

        return query.order_by(ImportJob.created_at.desc()).offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        *,
        obj_in: ImportJobCreate,
        organization_id: int,
        created_by_id: int,
        file_path: Optional[str] = None
    ) -> ImportJob:
        """Create new import job"""
        job = ImportJob(
            organization_id=organization_id,
            created_by_id=created_by_id,
            source_type=obj_in.source_type,
            source_name=obj_in.source_name,
            entity_type=obj_in.entity_type,
            file_path=file_path,
            field_mapping=obj_in.field_mapping,
            deduplicate=obj_in.deduplicate,
            update_existing=obj_in.update_existing,
            options=obj_in.options,
            status="pending"
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    def update(
        self,
        db: Session,
        *,
        job: ImportJob,
        obj_in: ImportJobUpdate
    ) -> ImportJob:
        """Update import job"""
        update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(job, field, value)

        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    def start_processing(self, db: Session, job_id: int) -> ImportJob:
        """Mark job as processing"""
        job = self.get(db, job_id)
        if job:
            job.status = "processing"
            job.started_at = datetime.utcnow()
            db.add(job)
            db.commit()
            db.refresh(job)
        return job

    def complete(
        self,
        db: Session,
        job_id: int,
        success: bool = True,
        summary: Optional[Dict[str, Any]] = None
    ) -> ImportJob:
        """Complete import job"""
        job = self.get(db, job_id)
        if job:
            job.status = "completed" if success else "failed"
            job.completed_at = datetime.utcnow()
            if summary:
                job.import_summary = summary
            db.add(job)
            db.commit()
            db.refresh(job)
        return job

    def update_progress(
        self,
        db: Session,
        job_id: int,
        processed: int,
        successful: int,
        failed: int,
        skipped: int
    ) -> ImportJob:
        """Update import progress"""
        job = self.get(db, job_id)
        if job:
            job.processed_records = processed
            job.successful_records = successful
            job.failed_records = failed
            job.skipped_records = skipped
            db.add(job)
            db.commit()
            db.refresh(job)
        return job

    def add_error(
        self,
        db: Session,
        job_id: int,
        error: Dict[str, Any]
    ) -> ImportJob:
        """Add error to error log"""
        job = self.get(db, job_id)
        if job:
            if job.error_log is None:
                job.error_log = []
            job.error_log.append(error)
            db.add(job)
            db.commit()
            db.refresh(job)
        return job

    def get_statistics(self, db: Session, organization_id: int) -> Dict[str, Any]:
        """Get import statistics"""
        total_jobs = db.query(func.count(ImportJob.id)).filter(
            ImportJob.organization_id == organization_id
        ).scalar()

        completed_jobs = db.query(func.count(ImportJob.id)).filter(
            and_(
                ImportJob.organization_id == organization_id,
                ImportJob.status == "completed"
            )
        ).scalar()

        total_imported = db.query(func.sum(ImportJob.successful_records)).filter(
            ImportJob.organization_id == organization_id
        ).scalar() or 0

        return {
            "total_jobs": total_jobs or 0,
            "completed_jobs": completed_jobs or 0,
            "total_records_imported": total_imported
        }


class CRUDImportRecord:
    """CRUD operations for Import Records"""

    def get_by_job(
        self,
        db: Session,
        job_id: int,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None
    ) -> List[ImportRecord]:
        """Get records for an import job"""
        query = db.query(ImportRecord).filter(ImportRecord.import_job_id == job_id)

        if status:
            query = query.filter(ImportRecord.status == status)

        return query.offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        *,
        job_id: int,
        source_record_id: Optional[str] = None,
        source_data: Optional[Dict[str, Any]] = None
    ) -> ImportRecord:
        """Create import record"""
        record = ImportRecord(
            import_job_id=job_id,
            source_record_id=source_record_id,
            source_data=source_data,
            status="pending"
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    def update_status(
        self,
        db: Session,
        record_id: int,
        status: str,
        target_record_id: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> ImportRecord:
        """Update import record status"""
        record = db.query(ImportRecord).filter(ImportRecord.id == record_id).first()
        if record:
            record.status = status
            record.target_record_id = target_record_id
            record.error_message = error_message
            record.processed_at = datetime.utcnow()
            db.add(record)
            db.commit()
            db.refresh(record)
        return record


class CRUDExportJob:
    """CRUD operations for Export Jobs"""

    def get(self, db: Session, job_id: int) -> Optional[ExportJob]:
        """Get export job by ID"""
        return db.query(ExportJob).filter(ExportJob.id == job_id).first()

    def get_multi(
        self,
        db: Session,
        *,
        organization_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[ExportJob]:
        """Get multiple export jobs"""
        return db.query(ExportJob).filter(
            ExportJob.organization_id == organization_id
        ).order_by(ExportJob.created_at.desc()).offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        *,
        obj_in: ExportJobCreate,
        organization_id: int,
        created_by_id: int
    ) -> ExportJob:
        """Create new export job"""
        # Set expiration to 7 days from now
        expires_at = datetime.utcnow() + timedelta(days=7)

        job = ExportJob(
            organization_id=organization_id,
            created_by_id=created_by_id,
            entity_type=obj_in.entity_type,
            format=obj_in.format,
            filters=obj_in.filters,
            status="pending",
            expires_at=expires_at
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    def complete(
        self,
        db: Session,
        job_id: int,
        file_path: str,
        file_url: str,
        total_records: int
    ) -> ExportJob:
        """Complete export job"""
        job = self.get(db, job_id)
        if job:
            job.status = "completed"
            job.file_path = file_path
            job.file_url = file_url
            job.total_records = total_records
            job.completed_at = datetime.utcnow()
            db.add(job)
            db.commit()
            db.refresh(job)
        return job


class CRUDCRMConnection:
    """CRUD operations for CRM Connections"""

    def get(self, db: Session, connection_id: int) -> Optional[CRMConnection]:
        """Get CRM connection by ID"""
        return db.query(CRMConnection).filter(CRMConnection.id == connection_id).first()

    def get_multi(
        self,
        db: Session,
        *,
        organization_id: int,
        crm_type: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> List[CRMConnection]:
        """Get multiple CRM connections"""
        query = db.query(CRMConnection).filter(
            CRMConnection.organization_id == organization_id
        )

        if crm_type:
            query = query.filter(CRMConnection.crm_type == crm_type)

        if is_active is not None:
            query = query.filter(CRMConnection.is_active == is_active)

        return query.all()

    def create(
        self,
        db: Session,
        *,
        obj_in: CRMConnectionCreate,
        organization_id: int,
        created_by_id: int
    ) -> CRMConnection:
        """Create new CRM connection"""
        # TODO: Encrypt credentials before storing
        connection = CRMConnection(
            organization_id=organization_id,
            created_by_id=created_by_id,
            crm_type=obj_in.crm_type,
            connection_name=obj_in.connection_name,
            credentials=obj_in.credentials,  # Should be encrypted
            api_endpoint=obj_in.api_endpoint,
            sync_settings=obj_in.sync_settings,
            is_active=True
        )
        db.add(connection)
        db.commit()
        db.refresh(connection)
        return connection

    def update(
        self,
        db: Session,
        *,
        connection: CRMConnection,
        obj_in: CRMConnectionUpdate
    ) -> CRMConnection:
        """Update CRM connection"""
        update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(connection, field, value)

        connection.updated_at = datetime.utcnow()
        db.add(connection)
        db.commit()
        db.refresh(connection)
        return connection

    def update_sync_status(
        self,
        db: Session,
        connection_id: int,
        status: str
    ) -> CRMConnection:
        """Update sync status"""
        connection = self.get(db, connection_id)
        if connection:
            connection.last_sync_at = datetime.utcnow()
            connection.sync_status = status
            db.add(connection)
            db.commit()
            db.refresh(connection)
        return connection

    def delete(self, db: Session, *, connection_id: int) -> bool:
        """Delete CRM connection"""
        connection = self.get(db, connection_id)
        if connection:
            db.delete(connection)
            db.commit()
            return True
        return False


# CSV Helper Functions
class CSVImportHelper:
    """CSV import helper functions"""

    @staticmethod
    def parse_csv(
        file_content: bytes,
        has_header: bool = True,
        delimiter: str = ",",
        encoding: str = "utf-8"
    ) -> Dict[str, Any]:
        """Parse CSV file and return headers and rows"""
        try:
            content = file_content.decode(encoding)
            reader = csv.reader(io.StringIO(content), delimiter=delimiter)

            rows = list(reader)
            if not rows:
                return {"error": "Empty CSV file"}

            headers = rows[0] if has_header else [f"Column_{i}" for i in range(len(rows[0]))]
            data_rows = rows[1:] if has_header else rows

            return {
                "headers": headers,
                "rows": data_rows,
                "total_rows": len(data_rows)
            }
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def detect_field_mappings(headers: List[str], entity_type: str) -> Dict[str, str]:
        """Auto-detect field mappings based on header names"""
        # Common field name mappings
        common_mappings = {
            # Lead/Contact fields
            "first name": "first_name",
            "firstname": "first_name",
            "given name": "first_name",
            "last name": "last_name",
            "lastname": "last_name",
            "surname": "last_name",
            "email": "email",
            "email address": "email",
            "phone": "phone",
            "phone number": "phone",
            "mobile": "phone",
            "company": "company",
            "organization": "company",
            "company name": "company",
            "title": "job_title",
            "job title": "job_title",
            "position": "job_title",
            "website": "website",
            "address": "address",
            "city": "city",
            "state": "state",
            "country": "country",
            "zip": "postal_code",
            "postal code": "postal_code",
            "industry": "industry",
            "description": "description",
            "notes": "notes",
            "client": "client",
            "client name": "client",
            "client_name": "client",

            # Deal/Opportunity fields
            "deal name": "name",
            "opportunity name": "name",
            "amount": "amount",
            "value": "amount",
            "stage": "stage",
            "status": "status",
            "close date": "expected_close_date",
            "probability": "probability"
        }

        detected = {}
        for header in headers:
            normalized = header.lower().strip()
            if normalized in common_mappings:
                detected[header] = common_mappings[normalized]

        return detected


# Create instances
crud_import_job = CRUDImportJob()
crud_import_record = CRUDImportRecord()
crud_export_job = CRUDExportJob()
crud_crm_connection = CRUDCRMConnection()
csv_helper = CSVImportHelper()
