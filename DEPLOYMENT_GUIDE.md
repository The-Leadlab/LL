## LeadLab Deployment Guide

This document consolidates setup, configuration, deployment, and remaining tasks.

## Repositories
- Primary org repo: `https://github.com/The-Leadlab/V4`
- Alternate repo: `https://github.com/alilead/LL`

## Frontend (Vercel)
Project root: `frontend`

Build settings:
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Environment variables:
- `VITE_API_URL` = `https://api.the-leadlab.com` (or Render URL until DNS/SSL is ready)

Vercel domains:
- `the-leadlab.com`
- `www.the-leadlab.com`

## Backend (Render)
Service type: Web Service
Root directory: `backend`

Build command:
```
pip install -r requirements.txt
```

Start command:
```
gunicorn main:app -k uvicorn.workers.UvicornWorker -w 2 --bind 0.0.0.0:$PORT
```

Required environment variables:
- `DATABASE_URL`
- `SECRET_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `API_SECRET_KEY`
- `ENV=production`
- `EMAILS_FROM_EMAIL=noreply@the-leadlab.com` (Resend-verified main domain)
- `RESEND_API_KEY` (Resend API key for email sending)
- `EMAIL_PROVIDER=auto` (`smtp`, `api`, or `auto`)
- `RESEND_FROM_EMAIL=noreply@the-leadlab.com`

Optional environment variables (can be added later):
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (only if not using Resend)
- `EMAIL_PROVIDER_TIMEOUT_SECONDS=12`

Render health check:
- `https://api.the-leadlab.com/api/v1/health`
- Expect: `database: "healthy"`, `environment: "production"`

## Database (Render Postgres)
Create a Render Postgres database and copy the External Database URL into `DATABASE_URL`.

If migrating from local MySQL:
- Script: `backend/scripts/migrate_mysql_to_postgres.py`
- Required env vars when running locally:
  - `SOURCE_DATABASE_URL=mysql+pymysql://root:admin123@localhost:3306/leadlab?charset=utf8mb4`
  - `TARGET_DATABASE_URL=<Render External DB URL>`
  - `TRUNCATE_TARGET=true`
  - `CREATE_TABLES=true`

Migration results (latest):
- organizations: 28
- users: 29
- leads: 8095
- currencies: 20
- lead_stages: 15
- tags: 36
- deals: 3
- tasks: 5
- activities: 91
- events: 22
- team_invitations: 2
- notes/messages/files/tokens/transactions: 0
- notifications skipped (table missing in target schema)

## Admin Access
Admin visibility depends on the user returned by the API.

Current admin user:
- `ali@the-leadlab.com` (role: `admin`, `is_superuser: true`)

If admin button does not appear:
1) Log out and back in
2) Hard refresh browser
3) Verify frontend points to correct API (`VITE_API_URL`)

## Email Configuration (Resend)
To use Resend for email delivery (recommended):

1) **Set environment variables in Render:**
   - `EMAILS_FROM_EMAIL=noreply@the-leadlab.com` (must match a verified domain in Resend)
   - `RESEND_API_KEY=<your-resend-api-key>`
   - `SMTP_FROM_NAME=LeadLab` (optional, defaults to "LeadLab")

2) **About send.the-leadlab.com:**
   - This is Resend's provided domain - already verified by Resend
   - You don't need to verify it yourself
   - DNS records are already configured by Resend
   - Just use `noreply@send.the-leadlab.com` as the from email

**Transport modes:**
- `EMAIL_PROVIDER=api` → use Resend API only (recommended on Render).
- `EMAIL_PROVIDER=smtp` → use SMTP only.
- `EMAIL_PROVIDER=auto` → try SMTP first, then fallback to Resend API.

**Note:** In `auto`, a blocked SMTP egress path no longer prevents delivery when Resend is configured.

## Custom API Domain
To enable `api.the-leadlab.com`:
1) Render → Service → Settings → Custom Domains → add `api.the-leadlab.com`
2) Add DNS CNAME:
   - Name: `api`
   - Value: `<render-service>.onrender.com`
3) Wait for SSL to be issued

## Known Issues / Remaining Work
- Ensure `ENV=production` is set in Render to avoid `environment: development`
- Verify `database: healthy` at `/api/v1/health`
- Confirm DNS + SSL for `api.the-leadlab.com` are fully propagated
- Optional: add missing `notifications` table to Postgres and migrate

## Troubleshooting
### Frontend shows API errors
- Check `VITE_API_URL`
- Use Render URL directly if DNS not ready

### Backend error: missing tables
- Run the migration script again with `CREATE_TABLES=true`

### Build cache issues on Render
- Deploys → Manual Deploy → Clear build cache & deploy
