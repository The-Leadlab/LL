#!/usr/bin/env python3
"""
One-shot admin script: re-stagger deferred outreach jobs for org 196.

All deferred/pending jobs for org_id=196 get rescheduled to
now + 5min * (index+1), oldest-scheduled first.  This prevents the
existing 30 jobs (all clustered at the same timestamp) from firing in
a burst on the next tick.

Usage (from the backend directory):
    python -m scripts.restagger_org196_deferred

Or via the DB directly (paste in a psql/mysql session):

    -- Preview
    SELECT id, scheduled_at, status, last_error
      FROM outreach_jobs
     WHERE organization_id = 196
       AND status IN ('pending','deferred')
     ORDER BY scheduled_at;

    -- Re-stagger (PostgreSQL)
    WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_at) AS rn
          FROM outreach_jobs
         WHERE organization_id = 196
           AND status IN ('pending','deferred')
    )
    UPDATE outreach_jobs
       SET scheduled_at = NOW() + (numbered.rn * INTERVAL '5 minutes'),
           status = 'pending',
           last_error = 'Re-staggered by admin script'
      FROM numbered
     WHERE outreach_jobs.id = numbered.id;

    -- MySQL equivalent
    SET @rn := 0;
    UPDATE outreach_jobs
       SET scheduled_at = DATE_ADD(NOW(), INTERVAL (@rn := @rn + 1) * 5 MINUTE),
           status = 'pending',
           last_error = 'Re-staggered by admin script'
     WHERE organization_id = 196
       AND status IN ('pending','deferred')
     ORDER BY scheduled_at;
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

# Allow running from the backend directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ORG_ID = 196
GAP_SECONDS = 300


def main() -> None:
    from app.database import SessionLocal
    from app.models.outreach_job import OutreachJob

    db = SessionLocal()
    try:
        jobs = (
            db.query(OutreachJob)
            .filter(
                OutreachJob.organization_id == ORG_ID,
                OutreachJob.status.in_(["pending", "deferred"]),
            )
            .order_by(OutreachJob.scheduled_at.asc())
            .all()
        )
        if not jobs:
            print(f"No pending/deferred jobs for org {ORG_ID}.")
            return

        now = datetime.utcnow()
        print(f"Re-staggering {len(jobs)} jobs for org {ORG_ID} starting at {now.isoformat()}Z")
        for i, job in enumerate(jobs):
            new_time = now + timedelta(seconds=GAP_SECONDS * (i + 1))
            old_time = job.scheduled_at
            job.scheduled_at = new_time
            job.status = "pending"
            job.last_error = "Re-staggered by admin script"
            job.updated_at = now
            db.add(job)
            print(f"  job {job.id}: {old_time} -> {new_time.isoformat()}Z")

        db.commit()
        print(f"Done. {len(jobs)} jobs re-staggered with {GAP_SECONDS}s gap.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
