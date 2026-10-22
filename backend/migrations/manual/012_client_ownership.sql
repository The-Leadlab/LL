-- 012_client_ownership.sql
-- Ownership / assignment for client lists (CRM buckets).
-- created_by: who created the list
-- assigned_user_id: which team member the list is assigned to (NULL = shared with org)
-- Safe to re-run.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE clients
            ADD COLUMN created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'assigned_user_id'
    ) THEN
        ALTER TABLE clients
            ADD COLUMN assigned_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_clients_created_by ON clients (created_by);
CREATE INDEX IF NOT EXISTS ix_clients_assigned_user_id ON clients (assigned_user_id);
