"""
CRUD operations for Email Sequence Management
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta

from app.models.email_sequence import EmailSequence, SequenceEnrollment, SequenceStep
from app.schemas.email_sequence import (
    EmailSequenceCreate, EmailSequenceUpdate,
    SequenceEnrollmentCreate, SequenceEnrollmentUpdate,
    BulkEnrollRequest
)


class CRUDEmailSequence:
    """CRUD operations for Email Sequence"""

    def get(self, db: Session, sequence_id: int) -> Optional[EmailSequence]:
        """Get sequence by ID"""
        return db.query(EmailSequence).filter(EmailSequence.id == sequence_id).first()

    def get_multi(
        self,
        db: Session,
        *,
        organization_id: int,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> List[EmailSequence]:
        """Get multiple sequences"""
        query = db.query(EmailSequence).filter(EmailSequence.organization_id == organization_id)

        if is_active is not None:
            query = query.filter(EmailSequence.is_active == is_active)

        return query.offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        *,
        obj_in: EmailSequenceCreate,
        organization_id: int,
        created_by_id: int
    ) -> EmailSequence:
        """Create new sequence"""
        # Convert steps to JSON format
        steps_data = [step.model_dump() for step in obj_in.steps]

        sequence = EmailSequence(
            name=obj_in.name,
            description=obj_in.description,
            organization_id=organization_id,
            created_by_id=created_by_id,
            is_active=obj_in.is_active,
            steps=steps_data,
            email_account_id=getattr(obj_in, "email_account_id", None),
            settings=getattr(obj_in, "settings", None),
        )
        db.add(sequence)
        db.commit()
        db.refresh(sequence)
        return sequence

    def update(
        self,
        db: Session,
        *,
        sequence: EmailSequence,
        obj_in: EmailSequenceUpdate
    ) -> EmailSequence:
        """Update sequence"""
        update_data = obj_in.model_dump(exclude_unset=True)

        # Convert steps if provided
        if "steps" in update_data and update_data["steps"]:
            update_data["steps"] = [step.model_dump() for step in update_data["steps"]]

        for field, value in update_data.items():
            setattr(sequence, field, value)

        db.add(sequence)
        db.commit()
        db.refresh(sequence)
        return sequence

    def delete(self, db: Session, *, sequence_id: int) -> bool:
        """Delete sequence (soft delete by setting inactive)"""
        sequence = self.get(db, sequence_id)
        if sequence:
            sequence.is_active = False
            db.add(sequence)
            db.commit()
            return True
        return False

    def get_statistics(self, db: Session, sequence_id: int) -> Dict[str, Any]:
        """Get sequence statistics"""
        sequence = self.get(db, sequence_id)
        if not sequence:
            return {}

        # Count active enrollments
        active_count = db.query(func.count(SequenceEnrollment.id)).filter(
            and_(
                SequenceEnrollment.sequence_id == sequence_id,
                SequenceEnrollment.status == "active"
            )
        ).scalar()

        # Calculate rates
        completion_rate = 0.0
        reply_rate = 0.0
        if sequence.total_enrolled > 0:
            completion_rate = (sequence.total_completed / sequence.total_enrolled) * 100
            reply_rate = (sequence.total_replied / sequence.total_enrolled) * 100

        # Calculate average days to complete
        avg_days = db.query(
            func.avg(
                func.julianday(SequenceEnrollment.completed_at) -
                func.julianday(SequenceEnrollment.enrolled_at)
            )
        ).filter(
            and_(
                SequenceEnrollment.sequence_id == sequence_id,
                SequenceEnrollment.status == "completed"
            )
        ).scalar()

        return {
            "id": sequence.id,
            "name": sequence.name,
            "total_enrolled": sequence.total_enrolled,
            "total_completed": sequence.total_completed,
            "total_replied": sequence.total_replied,
            "active_enrollments": active_count or 0,
            "completion_rate": round(completion_rate, 2),
            "reply_rate": round(reply_rate, 2),
            "avg_days_to_complete": round(avg_days, 1) if avg_days else None
        }


class CRUDSequenceEnrollment:
    """CRUD operations for Sequence Enrollment"""

    def get(self, db: Session, enrollment_id: int) -> Optional[SequenceEnrollment]:
        """Get enrollment by ID"""
        return db.query(SequenceEnrollment).options(
            joinedload(SequenceEnrollment.steps)
        ).filter(SequenceEnrollment.id == enrollment_id).first()

    def get_by_lead(
        self,
        db: Session,
        lead_id: int,
        sequence_id: Optional[int] = None
    ) -> List[SequenceEnrollment]:
        """Get enrollments for a lead"""
        query = db.query(SequenceEnrollment).filter(SequenceEnrollment.lead_id == lead_id)

        if sequence_id:
            query = query.filter(SequenceEnrollment.sequence_id == sequence_id)

        return query.all()

    def get_by_sequence(
        self,
        db: Session,
        sequence_id: int,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[SequenceEnrollment]:
        """Get enrollments for a sequence"""
        query = db.query(SequenceEnrollment).filter(
            SequenceEnrollment.sequence_id == sequence_id
        )

        if status:
            query = query.filter(SequenceEnrollment.status == status)

        return query.offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        *,
        obj_in: SequenceEnrollmentCreate
    ) -> Optional[SequenceEnrollment]:
        """Create new enrollment"""
        # Check if already enrolled
        existing = db.query(SequenceEnrollment).filter(
            and_(
                SequenceEnrollment.sequence_id == obj_in.sequence_id,
                SequenceEnrollment.lead_id == obj_in.lead_id,
                SequenceEnrollment.status.in_(["active", "paused"])
            )
        ).first()

        if existing:
            return None  # Already enrolled

        # Create enrollment
        enrollment = SequenceEnrollment(
            sequence_id=obj_in.sequence_id,
            lead_id=obj_in.lead_id,
            current_step=0,
            status="active"
        )
        db.add(enrollment)
        db.flush()

        # Get sequence to create steps
        sequence = db.query(EmailSequence).filter(
            EmailSequence.id == obj_in.sequence_id
        ).first()

        if sequence and sequence.steps:
            # Cumulative delay: each step waits delay_days after the previous step
            cumulative_days = 0
            ordered = sorted(sequence.steps, key=lambda s: int(s.get("step") or 0))
            for step_def in ordered:
                delay_days = int(step_def.get("delay_days") or 0)
                cumulative_days += delay_days
                scheduled_at = datetime.utcnow() + timedelta(days=cumulative_days)

                step = SequenceStep(
                    enrollment_id=enrollment.id,
                    step_number=step_def.get("step"),
                    scheduled_at=scheduled_at,
                    status="pending"
                )
                db.add(step)

            # Update sequence stats
            sequence.total_enrolled = (sequence.total_enrolled or 0) + 1
            db.add(sequence)

        db.commit()
        db.refresh(enrollment)
        return enrollment

    def update(
        self,
        db: Session,
        *,
        enrollment: SequenceEnrollment,
        obj_in: SequenceEnrollmentUpdate
    ) -> SequenceEnrollment:
        """Update enrollment"""
        update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(enrollment, field, value)

        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)
        return enrollment

    def pause(self, db: Session, enrollment_id: int) -> Optional[SequenceEnrollment]:
        """Pause enrollment"""
        enrollment = self.get(db, enrollment_id)
        if enrollment and enrollment.status == "active":
            enrollment.status = "paused"
            enrollment.paused_at = datetime.utcnow()
            db.add(enrollment)
            db.commit()
            db.refresh(enrollment)
            return enrollment
        return None

    def resume(self, db: Session, enrollment_id: int) -> Optional[SequenceEnrollment]:
        """Resume enrollment and shift pending step schedules by pause duration."""
        enrollment = self.get(db, enrollment_id)
        if enrollment and enrollment.status == "paused":
            pause_delta = timedelta(0)
            if enrollment.paused_at:
                pause_delta = datetime.utcnow() - enrollment.paused_at
            enrollment.status = "active"
            enrollment.paused_at = None
            db.add(enrollment)
            if pause_delta.total_seconds() > 0:
                pending = db.query(SequenceStep).filter(
                    SequenceStep.enrollment_id == enrollment.id,
                    SequenceStep.status == "pending",
                ).all()
                for step in pending:
                    if step.scheduled_at:
                        step.scheduled_at = step.scheduled_at + pause_delta
                        db.add(step)
            db.commit()
            db.refresh(enrollment)
            return enrollment
        return None

    def complete(self, db: Session, enrollment_id: int) -> Optional[SequenceEnrollment]:
        """Mark enrollment as completed"""
        enrollment = self.get(db, enrollment_id)
        if enrollment:
            enrollment.status = "completed"
            enrollment.completed_at = datetime.utcnow()
            db.add(enrollment)

            # Update sequence stats
            sequence = db.query(EmailSequence).filter(
                EmailSequence.id == enrollment.sequence_id
            ).first()
            if sequence:
                sequence.total_completed = (sequence.total_completed or 0) + 1
                db.add(sequence)

            db.commit()
            db.refresh(enrollment)
            return enrollment
        return None

    def mark_replied(self, db: Session, enrollment_id: int) -> Optional[SequenceEnrollment]:
        """Mark enrollment as replied"""
        enrollment = self.get(db, enrollment_id)
        if enrollment:
            enrollment.status = "replied"
            db.add(enrollment)

            # Update sequence stats
            sequence = db.query(EmailSequence).filter(
                EmailSequence.id == enrollment.sequence_id
            ).first()
            if sequence:
                sequence.total_replied = (sequence.total_replied or 0) + 1
                db.add(sequence)

            db.commit()
            db.refresh(enrollment)
            return enrollment
        return None

    def bulk_enroll(
        self,
        db: Session,
        *,
        sequence_id: int,
        lead_ids: List[int]
    ) -> Dict[str, Any]:
        """Bulk enroll leads in a sequence"""
        enrolled_count = 0
        already_enrolled_count = 0
        failed_count = 0
        enrollments = []

        for lead_id in lead_ids:
            try:
                obj_in = SequenceEnrollmentCreate(
                    sequence_id=sequence_id,
                    lead_id=lead_id
                )
                enrollment = self.create(db, obj_in=obj_in)

                if enrollment:
                    enrolled_count += 1
                    enrollments.append(enrollment)
                else:
                    already_enrolled_count += 1
            except Exception:
                failed_count += 1

        return {
            "sequence_id": sequence_id,
            "enrolled_count": enrolled_count,
            "already_enrolled_count": already_enrolled_count,
            "failed_count": failed_count,
            "enrollments": enrollments
        }


class CRUDSequenceStep:
    """CRUD operations for Sequence Step Execution"""

    def get(self, db: Session, step_id: int) -> Optional[SequenceStep]:
        """Get step by ID"""
        return db.query(SequenceStep).filter(SequenceStep.id == step_id).first()

    def get_pending_steps(self, db: Session, limit: int = 100) -> List[SequenceStep]:
        """Get pending steps that are ready to be sent (active enrollments only)."""
        return (
            db.query(SequenceStep)
            .join(SequenceEnrollment, SequenceEnrollment.id == SequenceStep.enrollment_id)
            .join(EmailSequence, EmailSequence.id == SequenceEnrollment.sequence_id)
            .filter(
                and_(
                    SequenceStep.status == "pending",
                    SequenceStep.scheduled_at <= datetime.utcnow(),
                    SequenceEnrollment.status == "active",
                    EmailSequence.is_active.is_(True),
                )
            )
            .order_by(SequenceStep.scheduled_at.asc())
            .limit(limit)
            .all()
        )

    def mark_sent(self, db: Session, step_id: int) -> Optional[SequenceStep]:
        """Mark step as sent"""
        step = self.get(db, step_id)
        if step:
            step.status = "sent"
            step.sent_at = datetime.utcnow()
            db.add(step)
            db.commit()
            db.refresh(step)

            # Update enrollment current step
            enrollment = db.query(SequenceEnrollment).filter(
                SequenceEnrollment.id == step.enrollment_id
            ).first()
            if enrollment:
                enrollment.current_step = step.step_number
                db.add(enrollment)
                db.commit()

            return step
        return None

    def mark_opened(self, db: Session, step_id: int) -> Optional[SequenceStep]:
        """Mark step email as opened"""
        step = self.get(db, step_id)
        if step and not step.opened_at:
            step.opened_at = datetime.utcnow()
            db.add(step)
            db.commit()
            db.refresh(step)
            return step
        return None

    def mark_clicked(self, db: Session, step_id: int) -> Optional[SequenceStep]:
        """Mark step email as clicked"""
        step = self.get(db, step_id)
        if step and not step.clicked_at:
            step.clicked_at = datetime.utcnow()
            # Also mark as opened if not already
            if not step.opened_at:
                step.opened_at = datetime.utcnow()
            db.add(step)
            db.commit()
            db.refresh(step)
            return step
        return None

    def mark_replied(self, db: Session, step_id: int) -> Optional[SequenceStep]:
        """Mark step email as replied"""
        step = self.get(db, step_id)
        if step and not step.replied_at:
            step.replied_at = datetime.utcnow()
            step.status = "replied"
            db.add(step)
            db.commit()
            db.refresh(step)

            # Mark enrollment as replied
            enrollment = db.query(SequenceEnrollment).filter(
                SequenceEnrollment.id == step.enrollment_id
            ).first()
            if enrollment:
                crud_enrollment.mark_replied(db, enrollment.id)

            return step
        return None


# Create instances
crud_email_sequence = CRUDEmailSequence()
crud_enrollment = CRUDSequenceEnrollment()
crud_sequence_step = CRUDSequenceStep()
