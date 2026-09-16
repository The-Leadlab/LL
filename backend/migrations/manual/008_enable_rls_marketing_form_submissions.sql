-- 008_enable_rls_marketing_form_submissions.sql
--
-- Supabase Advisor: rls_disabled_in_public on public.marketing_form_submissions
-- Strategy A: FastAPI uses DATABASE_URL (postgres bypasses RLS).
-- Lock PostgREST anon/authenticated out of this table.
--
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.marketing_form_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY deny_all_api_marketing_form_submissions
    ON public.marketing_form_submissions
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
