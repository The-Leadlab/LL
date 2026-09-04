-- Outreach Platform Phases 2–4
-- Run in Supabase SQL Editor after 010_outreach_jobs_and_sequence_account.sql

CREATE TABLE IF NOT EXISTS outreach_connections (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(40) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    config JSONB,
    encrypted_credentials TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_outreach_connections_org ON outreach_connections (organization_id);
CREATE INDEX IF NOT EXISTS ix_outreach_connections_type ON outreach_connections (type);

CREATE TABLE IF NOT EXISTS outreach_scenarios (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    flow_definition JSONB NOT NULL DEFAULT '{"modules":[]}',
    schedule_config JSONB,
    settings JSONB,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_outreach_scenarios_org ON outreach_scenarios (organization_id);
CREATE INDEX IF NOT EXISTS ix_outreach_scenarios_status ON outreach_scenarios (status);

CREATE TABLE IF NOT EXISTS outreach_runs (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER NOT NULL REFERENCES outreach_scenarios(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    trigger_type VARCHAR(40) NOT NULL DEFAULT 'manual',
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    stats JSONB,
    created_by_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ix_outreach_runs_org ON outreach_runs (organization_id);
CREATE INDEX IF NOT EXISTS ix_outreach_runs_scenario ON outreach_runs (scenario_id);
CREATE INDEX IF NOT EXISTS ix_outreach_runs_status ON outreach_runs (status);

CREATE TABLE IF NOT EXISTS outreach_run_steps (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES outreach_runs(id) ON DELETE CASCADE,
    node_id VARCHAR(64) NOT NULL,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    scheduled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    executed_at TIMESTAMP WITHOUT TIME ZONE,
    input JSONB,
    output JSONB,
    error TEXT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_outreach_run_steps_due ON outreach_run_steps (status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_outreach_run_steps_run ON outreach_run_steps (run_id);

CREATE TABLE IF NOT EXISTS outreach_templates (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    format VARCHAR(10) NOT NULL DEFAULT 'text',
    ab_subjects JSONB,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_outreach_templates_org ON outreach_templates (organization_id);

-- Webhook secret token on marketing-style inbound enroll
ALTER TABLE outreach_connections
    ADD COLUMN IF NOT EXISTS public_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outreach_connections_public_token
    ON outreach_connections (public_token)
    WHERE public_token IS NOT NULL;
