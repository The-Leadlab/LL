-- Phase 1 Outreach Platform: queued jobs + sequence mailbox + lead do-not-email
-- Run in Supabase SQL Editor (or psql) against the LeadLab database.

-- Cold outreach / campaign send queue
CREATE TABLE IF NOT EXISTS outreach_jobs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    account_id INTEGER NOT NULL REFERENCES email_accounts(id),
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    batch_id VARCHAR(64),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    format VARCHAR(10) NOT NULL DEFAULT 'text',
    scheduled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    settings JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    sent_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_outreach_jobs_org ON outreach_jobs (organization_id);
CREATE INDEX IF NOT EXISTS ix_outreach_jobs_status_sched ON outreach_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_outreach_jobs_batch ON outreach_jobs (batch_id);
CREATE INDEX IF NOT EXISTS ix_outreach_jobs_lead ON outreach_jobs (lead_id);
CREATE INDEX IF NOT EXISTS ix_outreach_jobs_account ON outreach_jobs (account_id);
CREATE INDEX IF NOT EXISTS ix_outreach_jobs_user ON outreach_jobs (user_id);

-- Sequence: which mailbox sends + campaign timing settings
ALTER TABLE email_sequences
    ADD COLUMN IF NOT EXISTS email_account_id INTEGER REFERENCES email_accounts(id);

ALTER TABLE email_sequences
    ADD COLUMN IF NOT EXISTS settings JSONB;

CREATE INDEX IF NOT EXISTS ix_email_sequences_account ON email_sequences (email_account_id);

-- Pause bookkeeping for resume delay shift
ALTER TABLE sequence_enrollments
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITHOUT TIME ZONE;

-- Soft compliance flags on leads
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_leads_do_not_email ON leads (do_not_email) WHERE do_not_email = TRUE;
