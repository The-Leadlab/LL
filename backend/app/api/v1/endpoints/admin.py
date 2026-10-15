from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session
from app.models.user import User
from app.api.deps import get_db, get_current_user
from app.services.admin_service import AdminService
from app.monitoring.dashboard import get_monitoring_data, generate_monitoring_html
from app.monitoring.metrics import get_metrics
from fastapi.responses import HTMLResponse, Response, StreamingResponse
import csv
from io import StringIO
from datetime import datetime
from app.crud import lead
from app.models.marketing_form_submission import MarketingFormSubmission
import io

router = APIRouter(redirect_slashes=False)

def _decode_csv_bytes(content: bytes) -> str:
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

def check_admin_access(current_user: User = Depends(get_current_user)):
    """Superuser or role=admin (matches frontend AdminRoute / is_admin)."""
    if current_user.is_superuser:
        return current_user
    if getattr(current_user, "role", None) == "admin":
        return current_user
    raise HTTPException(
        status_code=403,
        detail="Admin access required"
    )

@router.get("/monitoring/stats")
async def get_monitoring_stats(
    current_user: User = Depends(check_admin_access)
) -> Dict[str, Any]:
    """
    Get monitoring statistics.
    Only admin users can access this endpoint.
    """
    return get_monitoring_data()

@router.get("/monitoring/dashboard", response_class=HTMLResponse)
async def get_monitoring_dashboard(
    current_user: User = Depends(check_admin_access)
) -> HTMLResponse:
    """
    Get monitoring dashboard HTML.
    Only admin users can access this endpoint.
    """
    data = get_monitoring_data()
    html_content = generate_monitoring_html(
        data["errors"],
        data["access_logs"],
        data["performance_logs"]
    )
    
    # Add admin panel styling
    return HTMLResponse(content=f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>LeadLab Admin - Monitoring</title>
        <style>
            body {{
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f8f9fa;
            }}
            .monitoring-dashboard {{
                max-width: 1200px;
                margin: 0 auto;
            }}
            .card {{
                background: white;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                padding: 20px;
                margin-bottom: 20px;
            }}
            h1, h2 {{
                color: #1a1a1a;
                margin-top: 0;
            }}
            .stats {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }}
            .stat-item {{
                padding: 15px;
                border-radius: 6px;
                background: #f8f9fa;
            }}
            .stat-label {{
                display: block;
                color: #666;
                font-size: 0.9em;
                margin-bottom: 5px;
            }}
            .stat-value {{
                display: block;
                font-size: 1.5em;
                font-weight: 600;
                color: #1a1a1a;
            }}
            .table-wrapper {{
                overflow-x: auto;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }}
            th, td {{
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #eee;
            }}
            th {{
                background: #f8f9fa;
                font-weight: 500;
                color: #666;
            }}
            tr:hover {{
                background: #f8f9fa;
            }}
        </style>
    </head>
    <body>
        <div class="monitoring-dashboard">
            <h1>System Monitoring</h1>
            {html_content}
        </div>
    </body>
    </html>
    """)

@router.get("/monitoring/metrics")
async def get_prometheus_metrics(
    current_user: User = Depends(check_admin_access)
) -> Response:
    """
    Get Prometheus metrics.
    Only admin users can access this endpoint.
    """
    return Response(
        content=get_metrics(),
        media_type="text/plain"
    )

@router.post("/import-leads")
async def import_leads(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    assigned_user_id: str = None,
    tag_id: str = None,
    new_tag_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_admin_access)
) -> Any:
    """Import leads from CSV file"""
    try:
        content = await file.read()
        csv_content = _decode_csv_bytes(content)
        errors = []
        
        # Process assigned user if provided
        assigned_user = None
        target_organization_id = current_user.organization_id
        
        if assigned_user_id:
            assigned_user = db.query(User).filter(User.id == int(assigned_user_id)).first()
            if not assigned_user:
                errors.append(f"User with ID {assigned_user_id} not found")
            else:
                # Use assigned user's organization_id for all operations
                target_organization_id = assigned_user.organization_id
        
        # Parse CSV content
        leads_data = []
        reader = csv.DictReader(StringIO(csv_content))
        
        for row in reader:
            # Skip completely empty rows
            if not any(value.strip() for value in row.values()):
                continue
                
            # Clean and validate row data
            lead_data = {}
            for key, value in row.items():
                if key:  # Skip empty column names
                    cleaned_value = value.strip() if value else ""
                    lead_data[key.lower().replace(" ", "_")] = cleaned_value
            
            # Check if lead has at least one main field filled
            main_fields = ['first_name', 'last_name', 'company', 'email', 'telephone', 'mobile']
            if any(lead_data.get(field) for field in main_fields):
                leads_data.append(lead_data)
        
        # Process tag if provided
        selected_tag = None
        if tag_id and tag_id != "none":
            # Use existing tag
            selected_tag = db.query(Tag).filter(Tag.id == int(tag_id)).first()
            if not selected_tag:
                errors.append(f"Tag with ID {tag_id} not found")
        elif new_tag_name:
            # Create new tag
            try:
                from app.crud import tag
                from app.schemas.tag import TagCreate
                from datetime import datetime
                
                # Check if tag with this name already exists in the target organization
                existing_tag = db.query(Tag).filter(
                    Tag.name == new_tag_name,
                    Tag.organization_id == target_organization_id
                ).first()
                
                if existing_tag:
                    selected_tag = existing_tag
                else:
                    # Create new tag with the target organization ID
                    tag_data = {
                        "name": new_tag_name,
                        "organization_id": target_organization_id,
                        "created_at": datetime.utcnow()
                    }
                    selected_tag = tag.create(db=db, obj_in=tag_data)
            except Exception as e:
                errors.append(f"Failed to create tag: {str(e)}")
        
        # Process valid leads
        imported_count = 0
        skipped_count = 0
        
        for lead_data in leads_data:
            try:
                # Add required fields
                lead_data["organization_id"] = target_organization_id
                
                # Use assigned user if provided, otherwise use current user
                lead_data["user_id"] = assigned_user.id if assigned_user else current_user.id
                lead_data["created_by"] = current_user.id
                lead_data["created_at"] = datetime.utcnow()
                
                # Create lead
                new_lead = lead.create(db=db, obj_in=lead_data)
                imported_count += 1
                
                # Add tag to lead if selected
                if selected_tag:
                    try:
                        lead.add_tag(db=db, lead=new_lead, tag=selected_tag)
                    except Exception as e:
                        errors.append(f"Failed to add tag to lead {new_lead.id}: {str(e)}")
                
            except ValueError as e:
                skipped_count += 1
                errors.append(f"Skipped lead: {str(e)}")
                continue
                
            except Exception as e:
                skipped_count += 1
                errors.append(f"Error processing lead: {str(e)}")
                continue
        
        return {
            "success": True,
            "message": f"Import completed. Imported: {imported_count}, Skipped: {skipped_count}",
            "errors": errors if errors else None
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error importing leads: {str(e)}"
        )

@router.post("/validate/csv", response_model=Dict[str, Any])
async def validate_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_admin_access)
):
    """
    Validate CSV file without importing.
    Only admin users can access this endpoint.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        # Read file content
        content = await file.read()
        file_content = _decode_csv_bytes(content)

        # Initialize CSV importer and validate
        importer = AdminService(db)
        validation_result = await importer.validate_csv(file_content)

        return {
            'success': True,
            'validation_result': validation_result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/leads/template", response_class=StreamingResponse)
async def download_admin_csv_template(
    current_user: User = Depends(check_admin_access),
):
    """
    Download a CSV template with sample data for admin lead imports
    Includes unique_lead_id field for admin use
    """
    # Create a StringIO object to write CSV data
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write headers - Admin template includes UNIQUE_LEAD_ID
    headers = [
        'FIRSTNAME', 'LASTNAME', 'COMPANY', 'JOB_TITLE', 'LOCATION', 'COUNTRY',
        'EMAILS', 'TELEPHONE', 'MOBILE', 'LINKEDIN', 'WEBSITE', 'SECTOR', 
        'UNIQUE_LEAD_ID', 'NOTE'
    ]
    writer.writerow(headers)
    
    # Write sample data rows
    sample_data = [
        [
            'John', 'Doe', 'Tech Corp', 'Senior Developer', 'San Francisco', 'USA',
            'john.doe@techcorp.com', '+1-555-0123', '+1-555-4567', 
            'https://linkedin.com/in/johndoe', 'https://techcorp.com',
            'Technology', 'TECH001', 'Experienced developer with cloud expertise'
        ],
        [
            'Jane', 'Smith', 'Finance Inc', 'Investment Manager', 'London', 'UK',
            'jane.smith@financeinc.com', '+44-20-1234', '+44-77-5678',
            'https://linkedin.com/in/janesmith', 'https://financeinc.com',
            'Finance', 'FIN002', 'Specializes in portfolio management'
        ]
    ]
    
    for row in sample_data:
        writer.writerow(row)
    
    # Create the response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            'Content-Disposition': 'attachment; filename=admin_leads_template.csv'
        }
    )


@router.get("/marketing-form-submissions")
def list_marketing_form_submissions(
    db: Session = Depends(get_db),
    _: User = Depends(check_admin_access),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    form_type: Optional[str] = Query(None, description="Filter: business_diagnostic | data_request | pitch_your_idea"),
) -> Dict[str, Any]:
    """List public marketing form submissions (superuser only)."""
    q = db.query(MarketingFormSubmission).order_by(MarketingFormSubmission.created_at.desc())
    if form_type:
        q = q.filter(MarketingFormSubmission.form_type == form_type)
    total = q.count()
    rows = q.offset(skip).limit(limit).all()
    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": r.id,
                "form_type": r.form_type,
                "full_name": r.full_name,
                "email": r.email,
                "company": r.company,
                "phone": r.phone,
                "subject": r.subject,
                "payload": r.payload_dict(),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return {"items": items, "total": total, "skip": skip, "limit": limit}