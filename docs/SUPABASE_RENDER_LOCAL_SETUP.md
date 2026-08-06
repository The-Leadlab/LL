# Supabase + LeadLab: local testing, Render, and leaving the expiring Render database

## Current production topology (explicit)

- Frontend hosting: **Vercel**
- Backend hosting: **Render** (web service)
- Current production DB host: **Render Postgres** (app still connected here until cutover)
- Target DB host: **Supabase Postgres**

### Active Supabase account / project (reactivated 2026-08-06)

| Field | Value |
|--------|--------|
| Supabase org | **aliattia10's Org** (`xirllnlqamtriwmwttzt`) |
| Project name | **LeadLab** |
| Project ref | **`mjsooxhqbhdqzipmcrrk`** |
| Region | **eu-central-1** (Frankfurt) |
| Dashboard | https://supabase.com/dashboard/project/mjsooxhqbhdqzipmcrrk |
| API URL | `https://mjsooxhqbhdqzipmcrrk.supabase.co` |
| DB host | `db.mjsooxhqbhdqzipmcrrk.supabase.co` |

The previous example project ref `kweeltjxvctzgfkjhjut` no longer resolves (deleted / expired). Do **not** use it.

DB password for the new project was generated at create time and stored only locally in `backend/.supabase_leadlab_db_password.txt` (gitignored). Copy it into Render `DATABASE_URL` after restore — never commit it.

This runbook keeps Vercel + Render in place and only swaps the database host.

This guide connects **LeadLab** to **Supabase (PostgreSQL)** for both **local development** and **Render**, so you can stop relying on Render’s PostgreSQL before it expires.

You will have **two** Supabase-related configurations:

| Piece | Purpose |
|--------|---------|
| **Backend `DATABASE_URL`** | FastAPI + SQLAlchemy talk to Postgres (same DB as Supabase hosts). |
| **Frontend `VITE_SUPABASE_*`** | Optional: Supabase JS client (Auth, Realtime, Storage). Your app can run with only the backend URL if all data goes through the API. |

---

## Prerequisites

- A [Supabase](https://supabase.com) account and a **new project** (choose a region close to you or to Render, e.g. Frankfurt).
- [PostgreSQL client tools](https://www.postgresql.org/download/) installed locally (`psql`, `pg_dump`, `pg_restore`) if you migrate from Render Postgres.
- Python backend deps installed: `cd backend && pip install -r requirements.txt` (includes `psycopg2-binary`).
- Node frontend deps: `cd frontend && npm install`.

---

## Part 1 — Supabase: URLs and keys

1. Open your project → **Project Settings** → **API**.
   - Copy **Project URL** (e.g. `https://xxxxx.supabase.co`).
   - Copy the **anon** / **publishable** key (public; safe for the browser).

2. Open **Project Settings** → **Database**.
   - Find the **connection string** for Postgres. Supabase usually shows:
     - **Direct** connection (`db.<project-ref>.supabase.co`, port **5432**) — best for migrations and for a long-running server like your FastAPI app on Render.
     - **Pooler** (port **6543**) — often used for serverless; you can try it later if needed.

3. Note the **database password** you set when creating the project (or reset it under Database settings).

---

## Part 2 — Build `DATABASE_URL` for SQLAlchemy (backend)

SQLAlchemy in this repo expects a URL like:

```text
postgresql+psycopg2://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

- Replace `USER`, `PASSWORD`, `HOST`, `DATABASE` with values from Supabase (**Database** settings).
- **URL-encode** the password if it contains `@`, `#`, `%`, etc. (e.g. `@` → `%40`).
- Always include **`sslmode=require`** for Supabase.

**Example shape** (do not copy literally; use your own host/user/db):

```env
DATABASE_URL=postgresql+psycopg2://postgres:YOUR_ENCODED_PASSWORD@db.mjsooxhqbhdqzipmcrrk.supabase.co:5432/postgres?sslmode=require
```

If the connection fails from Render only, check Supabase docs for **IPv4** add-ons or try the **Session pooler** host/port they provide — network issues vary by region.

---

## Part 3 — Move your data into Supabase

Pick **one** source of truth.

### Option A — Current database is **Render PostgreSQL**

1. In Render → your **PostgreSQL** service → **Connections**, copy the **External Database URL** (or use `pg_dump` with that URL).
2. Take a **logical backup**:

   ```bash
   pg_dump "RENDER_EXTERNAL_URL" -Fc -f leadlab_from_render.dump
   ```

   Or plain SQL:

   ```bash
   pg_dump "RENDER_EXTERNAL_URL" -f leadlab_from_render.sql
   ```

3. Restore into Supabase using the **Supabase connection string** (direct `5432` is simplest for restore):

   ```bash
   pg_restore --dbname="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require" --verbose --no-owner --no-privileges leadlab_from_render.dump
   ```

   For a `.sql` file:

   ```bash
   psql "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require" -f leadlab_from_render.sql
   ```

4. Fix errors if any (extensions, permissions). Re-run restore or apply missing objects as needed.

### Option B — Current database is **local MySQL**

Use the project script (see `DEPLOYMENT_GUIDE.md`):

1. Create an **empty** Supabase database (same project); tables can be created by the script.
2. From `backend`, with env vars set in PowerShell or `.env`:

   ```text
   SOURCE_DATABASE_URL=mysql+pymysql://USER:PASS@localhost:3306/leadlab?charset=utf8mb4
   TARGET_DATABASE_URL=postgresql+psycopg2://postgres:PASS@db.xxx.supabase.co:5432/postgres?sslmode=require
   TRUNCATE_TARGET=true
   CREATE_TABLES=true
   ```

3. Run:

   ```bash
   cd backend
   py scripts/migrate_mysql_to_postgres.py
   ```

Adjust `SOURCE_DATABASE_URL` to match your local MySQL user, password, and database name.

---

## Part 4 — Local backend (test against Supabase)

1. Copy `backend/.env.example` → `backend/.env` if you do not have it yet.

2. Set at least:

   ```env
   DATABASE_URL=postgresql+psycopg2://postgres:YOUR_ENCODED_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require
   SECRET_KEY=...
   TOKEN_ENCRYPTION_KEY=...
   API_SECRET_KEY=...
   ```

3. Test the connection:

   ```bash
   cd backend
   py scripts/check_db_connection.py
   ```

   Expect: `OK: Database connection successful.`

4. Start the API:

   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Open `http://localhost:8000/api/v1/health` (or the health route your app exposes) and confirm the database is healthy.

---

## Part 5 — Local frontend (optional Supabase JS)

1. In `frontend/.env.development` set:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key
   ```

2. Restart Vite:

   ```bash
   cd frontend
   npm run dev
   ```

3. The shared client lives in `frontend/src/lib/supabaseClient.ts`. Until you import it in pages, the UI still uses your existing FastAPI + axios flow.

---

## Part 6 — Render: point the **web service** at Supabase (keep hosting, drop Render Postgres)

You are **not** required to leave Render as a host; you only replace **where the database lives**.

1. In Render, open your **Web Service** (e.g. `leadlab-backend`), **not** the old PostgreSQL add-on.

2. **Environment** → set **`DATABASE_URL`** to the **same** `postgresql+psycopg2://...?sslmode=require` value you used locally (with the same password encoding).

3. Ensure other secrets remain set (`SECRET_KEY`, `TOKEN_ENCRYPTION_KEY`, `API_SECRET_KEY`, email keys, etc.).

4. **Save** and **Manual Deploy** (or wait for auto-deploy).

5. After a successful deploy, call your production health URL and run a quick login / CRUD test.

6. **Deactivate the expiring Render PostgreSQL** only after you are sure production works on Supabase for at least a full day:
   - Take a **final** `pg_dump` from Render if you still need a backup.
   - Delete or suspend the Render Postgres instance to avoid confusion and accidental use.

---

## Rollback plan (if cutover fails)

1. Keep a final `pg_dump` from Render and from Supabase before switching.
2. In Render web service env vars, restore old Render `DATABASE_URL`.
3. Redeploy backend and re-run health checks (`/api/v1/health`, login, lead list, emails).
4. Keep Supabase data for investigation; do not delete until root cause is found.
5. Re-attempt cutover during low-traffic window.

---

## Known app-specific troubleshooting

- **Email Sequences create shows 404**
  - Verify frontend route includes `/email-sequences/create`.
  - Verify backend router includes `/api/v1/email-sequences`.
- **Email settings loop (Gmail connect)**
  - Use SMTP account creation flow under Email account settings first; OAuth can loop if not fully configured.
- **File upload failures (messages/conversations)**
  - Confirm backend upload limits and writable upload directory on Render.
  - Check API calls for multipart `Content-Type` and endpoint path correctness.

---

## Supabase security: Advisors (`rls_disabled_in_public`, `sensitive_columns_exposed`)

LeadLab’s API uses **FastAPI + `DATABASE_URL`** (usually the `postgres` role, which **bypasses RLS** in the dashboard). The **Supabase Data API** (PostgREST) still exposes `public` tables to **`anon` / `authenticated`** unless you enable **Row Level Security**.

1. In Supabase → **SQL Editor**, run the manual migration:
   - `backend/migrations/manual/007_enable_rls_public_tables_supabase_advisor.sql`  
   It enables RLS on every base table in `public`, so unauthenticated API clients get **no rows** by default (no broad policies). Re-run is safe.
2. In **Database → Advisors**, confirm the critical RLS / sensitive-data issues are cleared.
3. Never put **`service_role`** in `VITE_*` or the frontend bundle; use **anon** + Project URL only (`frontend/src/lib/supabaseClient.ts`).
4. Super-prompt (full checklist): `docs/CURSOR_SUPER_PROMPT_SUPABASE_RLS_SECURITY.md`.

If you later use Supabase Auth in the browser for some tables, add **explicit** `CREATE POLICY` rules (e.g. `auth.uid() = user_id`); do not rely on this script alone for that path.

---

## Part 7 — End-to-end checklist

- [ ] Data restored or migrated into Supabase Postgres.
- [ ] `py scripts/check_db_connection.py` succeeds locally with Supabase `DATABASE_URL`.
- [ ] Local API + frontend smoke test passes.
- [ ] Render `DATABASE_URL` updated; production health and main flows OK.
- [ ] Optional: `VITE_SUPABASE_*` set in Vercel/hosting for the frontend if you use the Supabase JS client in production builds.
- [ ] Supabase **Advisors** clean for RLS: run `007_enable_rls_public_tables_supabase_advisor.sql` if the project uses Supabase-hosted Postgres.
- [ ] Old Render Postgres backed up and removed or marked deprecated.

---

## Troubleshooting

| Symptom | What to try |
|--------|--------------|
| `SSL connection` / certificate errors | Add or fix `?sslmode=require` on `DATABASE_URL`. |
| Password rejected | Reset DB password in Supabase; URL-encode special characters in the URL. |
| `could not translate host name` | Typo in host; use **direct** `db.*.supabase.co` from the dashboard. |
| Works locally but not on Render | Render outbound network vs Supabase IP restrictions; check Supabase **Database** → connection docs and IPv4/IPv6. |
| Still connecting to old DB | Search Render env for duplicate `DATABASE_URL`; clear build cache if needed. |

---

## Reference files in this repo

- `backend/.env.example` — required backend variables.
- `backend/scripts/check_db_connection.py` — quick DB connectivity test.
- `backend/scripts/migrate_mysql_to_postgres.py` — MySQL → Postgres migration.
- `DEPLOYMENT_GUIDE.md` — Render build commands and related notes.
- `frontend/src/lib/supabaseClient.ts` — browser Supabase client (optional).
- `backend/migrations/manual/007_enable_rls_public_tables_supabase_advisor.sql` — enable RLS on all `public` tables (Supabase Advisor).
- `docs/CURSOR_SUPER_PROMPT_SUPABASE_RLS_SECURITY.md` — RLS + sensitive data hardening prompt.

---

*Last updated for LeadLab Vite + FastAPI layout. Supabase UI labels and connection hostnames may change; always copy live values from your Supabase project settings.*
