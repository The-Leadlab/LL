"""
Email Sequence API Endpoints

Automated email campaigns with multi-step sequences.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.models.email_sequence import EmailSequence, SequenceEnrollment
from app.schemas.email_sequence import (
    EmailSequenceCreate, EmailSequenceUpdate, EmailSequenceResponse, EmailSequenceStats,
    SequenceEnrollmentCreate, SequenceEnrollmentUpdate, SequenceEnrollmentResponse,
    SequenceEnrollmentDetail, SequenceStepResponse,
    BulkEnrollRequest, BulkEnrollResponse,
    SequencePerformance
)
from app.crud.crud_email_sequence import (
    crud_email_sequence, crud_enrollment, crud_sequence_step
)

router = APIRouter(redirect_slashes=False)


# Email Sequence Endpoints
@router.get("", response_model=List[EmailSequenceResponse])
@router.get("/", response_model=List[EmailSequenceResponse])
def list_sequences(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    is_active: Optional[bool] = Query(None)
):
    """
    List all email sequences.
    """
    sequences = crud_email_sequence.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        is_active=is_active
    )

    return sequences


@router.get("/stats", response_model=List[EmailSequenceStats])
def get_sequences_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get statistics for all sequences.
    """
    sequences = crud_email_sequence.get_multi(
        db,
        organization_id=current_user.organization_id,
        limit=1000
    )

    stats = []
    for sequence in sequences:
        sequence_stats = crud_email_sequence.get_statistics(db, sequence.id)
        stats.append(EmailSequenceStats(**sequence_stats))

    return stats


@router.get("/{sequence_id}", response_model=EmailSequenceResponse)
def get_sequence(
    sequence_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get sequence by ID.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return sequence


@router.get("/{sequence_id}/stats", response_model=EmailSequenceStats)
def get_sequence_stats(
    sequence_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get detailed statistics for a sequence.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    stats = crud_email_sequence.get_statistics(db, sequence_id)

    return EmailSequenceStats(**stats)


@router.post("", response_model=EmailSequenceResponse)
@router.post("/", response_model=EmailSequenceResponse)
def create_sequence(
    sequence_in: EmailSequenceCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new email sequence.

    Define the steps with delays, subjects, and email bodies.
    """
    sequence = crud_email_sequence.create(
        db,
        obj_in=sequence_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    return sequence


@router.put("/{sequence_id}", response_model=EmailSequenceResponse)
def update_sequence(
    sequence_id: int,
    sequence_in: EmailSequenceUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update email sequence.

    Note: Updating steps will not affect already enrolled leads.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    sequence = crud_email_sequence.update(db, sequence=sequence, obj_in=sequence_in)

    return sequence


@router.delete("/{sequence_id}")
def delete_sequence(
    sequence_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete email sequence (soft delete).

    Sets the sequence as inactive. Active enrollments will continue.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    crud_email_sequence.delete(db, sequence_id=sequence_id)

    return {"message": "Sequence deleted successfully"}


# Enrollment Endpoints
@router.get("/{sequence_id}/enrollments", response_model=List[SequenceEnrollmentResponse])
def list_sequence_enrollments(
    sequence_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100)
):
    """
    List all enrollments for a sequence.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    enrollments = crud_enrollment.get_by_sequence(
        db,
        sequence_id=sequence_id,
        status=status,
        skip=skip,
        limit=limit
    )

    return enrollments


@router.get("/enrollments/{enrollment_id}", response_model=SequenceEnrollmentDetail)
def get_enrollment(
    enrollment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get enrollment details with all steps.
    """
    enrollment = crud_enrollment.get(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check access via sequence
    sequence = crud_email_sequence.get(db, enrollment.sequence_id)
    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return enrollment


@router.post("/{sequence_id}/enroll", response_model=SequenceEnrollmentResponse)
def enroll_lead(
    sequence_id: int,
    enrollment_in: SequenceEnrollmentCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Enroll a lead in an email sequence.

    The lead will start receiving emails according to the sequence steps.
    """
    sequence = crud_email_sequence.get(db, sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not sequence.is_active:
        raise HTTPException(status_code=400, detail="Cannot enroll in inactive sequence")

    # Ensure sequence_id matches
    enrollment_in.sequence_id = sequence_id

    enrollment = crud_enrollment.create(db, obj_in=enrollment_in)

    if not enrollment:
        raise HTTPException(status_code=400, detail="Lead is already enrolled in this sequence")

    return enrollment


@router.post("/enroll/bulk", response_model=BulkEnrollResponse)
def bulk_enroll_leads(
    bulk_request: BulkEnrollRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Bulk enroll multiple leads in a sequence.
    """
    sequence = crud_email_sequence.get(db, bulk_request.sequence_id)

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not sequence.is_active:
        raise HTTPException(status_code=400, detail="Cannot enroll in inactive sequence")

    result = crud_enrollment.bulk_enroll(
        db,
        sequence_id=bulk_request.sequence_id,
        lead_ids=bulk_request.lead_ids
    )

    return BulkEnrollResponse(**result)


@router.post("/enrollments/{enrollment_id}/pause", response_model=SequenceEnrollmentResponse)
def pause_enrollment(
    enrollment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Pause an enrollment.

    No further emails will be sent until resumed.
    """
    enrollment = crud_enrollment.get(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check access
    sequence = crud_email_sequence.get(db, enrollment.sequence_id)
    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    enrollment = crud_enrollment.pause(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=400, detail="Cannot pause enrollment")

    return enrollment


@router.post("/enrollments/{enrollment_id}/resume", response_model=SequenceEnrollmentResponse)
def resume_enrollment(
    enrollment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Resume a paused enrollment.
    """
    enrollment = crud_enrollment.get(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check access
    sequence = crud_email_sequence.get(db, enrollment.sequence_id)
    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    enrollment = crud_enrollment.resume(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=400, detail="Cannot resume enrollment")

    return enrollment


@router.post("/enrollments/{enrollment_id}/complete", response_model=SequenceEnrollmentResponse)
def complete_enrollment(
    enrollment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Manually complete an enrollment.
    """
    enrollment = crud_enrollment.get(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check access
    sequence = crud_email_sequence.get(db, enrollment.sequence_id)
    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    enrollment = crud_enrollment.complete(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=400, detail="Cannot complete enrollment")

    return enrollment


@router.delete("/enrollments/{enrollment_id}")
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Remove a lead from a sequence.

    This will stop all future emails from being sent.
    """
    enrollment = crud_enrollment.get(db, enrollment_id)

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check access
    sequence = crud_email_sequence.get(db, enrollment.sequence_id)
    if sequence.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Complete instead of delete to maintain stats
    crud_enrollment.complete(db, enrollment_id)

    return {"message": "Enrollment removed successfully"}


# Step Tracking Endpoints (for webhook callbacks)
@router.post("/steps/{step_id}/opened")
def mark_step_opened(
    step_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Mark an email step as opened.

    Called by email tracking pixel webhook.
    """
    step = crud_sequence_step.mark_opened(db, step_id)

    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    return {"message": "Step marked as opened"}


@router.post("/steps/{step_id}/clicked")
def mark_step_clicked(
    step_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Mark an email step link as clicked.

    Called by email link tracking webhook.
    """
    step = crud_sequence_step.mark_clicked(db, step_id)

    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    return {"message": "Step marked as clicked"}


@router.post("/steps/{step_id}/replied")
def mark_step_replied(
    step_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Mark an email step as replied.

    Called when a reply is detected. Will pause the sequence.
    """
    step = crud_sequence_step.mark_replied(db, step_id)

    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    return {"message": "Step marked as replied, sequence paused"}
