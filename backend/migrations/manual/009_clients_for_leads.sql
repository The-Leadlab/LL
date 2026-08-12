-- 009_clients_for_leads.sql
--
-- Org-scoped Clients as exclusive containers for leads.
-- Creates clients table, seeds "General" per organization, adds leads.client_id, backfills.
-- Safe to re-run (IF NOT EXISTS / guards).

-- 1) clients table
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_org_name
    ON clients (organization_id, name);

CREATE INDEX IF NOT EXISTS ix_clients_organization_id
    ON clients (organization_id);

CREATE INDEX IF NOT EXISTS ix_clients_org_archived
    ON clients (organization_id, is_archived);

-- 2) Seed General for every organization that lacks a default client
INSERT INTO clients (organization_id, name, is_default, is_archived, created_at)
SELECT o.id, 'General', TRUE, FALSE, NOW()
FROM organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.organization_id = o.id AND c.is_default = TRUE
);

-- 3) Add leads.client_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'client_id'
    ) THEN
        ALTER TABLE leads
            ADD COLUMN client_id INTEGER NULL REFERENCES clients(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_leads_client_id ON leads (client_id);

-- 4) Backfill leads to their org's General client
UPDATE leads l
SET client_id = c.id
FROM clients c
WHERE c.organization_id = l.organization_id
  AND c.is_default = TRUE
  AND l.client_id IS NULL;
