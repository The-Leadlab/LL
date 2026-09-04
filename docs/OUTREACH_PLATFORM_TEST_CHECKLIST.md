# Outreach Platform — link & test checklist

After deploy, run both SQL migrations in Supabase (in order):

1. `backend/migrations/manual/010_outreach_jobs_and_sequence_account.sql`
2. `backend/migrations/manual/011_outreach_platform_phases_2_4.sql`

**Also:** backend startup now auto-creates outreach tables / adds missing columns (same pattern as marketing forms). After the next API deploy, schema should appear even if SQL was not run yet.

Set Render env: `OUTREACH_WORKER_SECRET` (and cron from `render.yaml`).

On **Runs**, use **Process queue now** to flush due jobs/steps without waiting for cron.

## Smoke path (manual)

1. **Connections** `/emails/connections`
   - Add `gmail_link` with an existing mailbox `account_id`
   - Add `webhook` → copy public token path `/api/v1/outreach/webhooks/{token}`
   - Add `google_sheets` with access token OR use import with `pasted_values` CSV via API if UI only sends spreadsheet fields

2. **Templates** `/emails/templates` — create subject/body with `{{first_name}}`

3. **Cold Outreach** `/emails/outreach`
   - Load template, Preview, Rewrite with AI
   - Queue with schedule + weekdays window → confirm batch id
   - Worker tick should move jobs to `sent`/`failed`

4. **Scenarios** `/emails/scenarios`
   - Build: trigger → wait 0 days → router_has_email → send_email
   - Activate, Run with lead ids
   - **Runs** `/emails/runs` → expand steps until completed

5. **Sequences** `/email-sequences`
   - Mailbox required; enroll a lead; wait for worker

6. **Webhook**
   ```
   POST /api/v1/outreach/webhooks/{public_token}
   {"email":"test@example.com","first_name":"Ada"}
   ```

## Automated (local)

```bash
cd backend
# with env vars set
pytest tests/test_outreach_runner.py tests/test_outreach_platform.py -q
```
