# Cursor Super Prompt: LeadLab Outreach Platform (Make.com-style)

## Applied in this repo (Phase 1)

- **Queue model:** `outreach_jobs` + SQL `backend/migrations/manual/010_outreach_jobs_and_sequence_account.sql` (run in Supabase).
- **Worker:** `POST /api/v1/outreach/worker/tick` with `X-Outreach-Worker-Secret` processes due jobs + sequence steps (`app/services/outreach_runner.py`).
- **Cold Outreach UI:** schedule start, business-hours window, weekdays-only, max/hour, queue mode, cancel batch.
- **Sequences:** cumulative step delays, pause shifts schedules on resume, pause-aware due query, `email_account_id` + `settings` on sequences; nav `showEmailSequences: true`.
- **Deploy:** `render.yaml` cron every 2 minutes; set `OUTREACH_WORKER_SECRET` in Render.
- **Still Phase 2+:** Google Sheets/Docs connections, visual scenario canvas, AI nodes.

## Applied in this repo (Phases 2–4)

- **SQL:** `backend/migrations/manual/011_outreach_platform_phases_2_4.sql` — connections, scenarios, runs, run_steps, templates.
- **API:** `/outreach/connections`, `/scenarios`, `/runs`, `/templates`, `/ai/rewrite`, `/webhooks/{token}`, Sheets import (+ pasted CSV fallback).
- **Worker:** also processes `outreach_run_steps` (Wait / Router / Send / AI / A-B / Update lead).
- **UI:** Email → Connections, Scenarios (+ builder), Runs, Templates; Cold Outreach AI rewrite + templates.
- **AI:** `FreeAIService.rewrite_email` (Gemini when keyed, else passthrough).

Use this prompt in Cursor when building or extending **Cold Outreach** into a full outreach automation platform: connections, timers, campaign scheduling, inter-email pauses, Google Sheets/Docs, AI steps, and visual scenarios.

**Status today (baseline):**
- Ship: `/emails/outreach` one-shot personalized send (text/HTML, preview, client lead sync, delay 0–10s, batches of 25).
- Exists but incomplete: `email_sequences` CRUD + enroll API; **no worker** that sends `sequence_steps`; nav `showEmailSequences = false`.
- Exists partially: visual `workflows` models + UI; not wired as the outreach engine.
- Send path: connected mailbox (`EmailAccount` + SMTP / Gmail OAuth scopes / Resend fallback via `EMAIL_PROVIDER`).

---

```
You are a senior full-stack engineer working in the LeadLab monorepo (FastAPI + React + Postgres/Supabase).

## Product goal

Turn Email → Cold Outreach into a Make.com-inspired **Outreach Platform**:
- Visual (or step-list) scenarios with modules/nodes.
- First-class **Connections** (Gmail/SMTP, Google Sheets, Google Docs, webhooks, AI).
- **Timers**: wait X minutes/hours/days; schedule campaign start; send windows (business hours / timezone).
- **Pauses**: delay between recipients; delay between campaign steps; pause/resume enrollments.
- Lead sources: Clients + Leads inside LeadLab, Google Sheets rows, optional CSV import.
- Personalization + AI draft/rewrite nodes.
- Safe delivery: rate limits, bounce/unsubscribe handling, audit log per send.

Do NOT rebuild Make.com as a generic iPaaS. Scope is **B2B outreach + CRM leads**. Reuse LeadLab leads, clients, email accounts, sequences, and workflows where possible.

## Non-goals (v1)

- Full Zapier/Make marketplace of 1000 apps.
- Arbitrary code sandboxes for end users.
- Multi-channel SMS/LinkedIn automation in Phase 1 (document as Phase 4+).
- Silent “success” when delivery fails.

## Architecture principles

1. **Scenario = directed graph of modules** stored as JSON (nodes + edges), org-scoped.
2. **Connections = encrypted credentials** per org/user (reuse EmailAccount pattern; never store raw tokens in frontend).
3. **Runner = background worker** (not request-thread `sleep` for long waits). HTTP APIs only enqueue / schedule.
4. **One email per lead** (personalized), never BCC blast of the whole list.
5. **Idempotency**: each step execution has a unique key; retries must not double-send.
6. **Org isolation**: every query filters `organization_id`; leads must belong to the org.
7. Feature-flag UI: extend `featureFlags.navigation` (e.g. `showOutreachScenarios`) so incomplete UI can stay off in prod.

## Existing code to extend (inspect first)

Frontend:
- frontend/src/pages/Emails/ColdOutreach.tsx
- frontend/src/pages/Emails/index.tsx
- frontend/src/pages/EmailSequences/*
- frontend/src/pages/Workflows/* (node/edge patterns)
- frontend/src/services/emailAPI.ts
- frontend/src/config/featureFlags.ts
- frontend/src/components/ModernSidebar.tsx
- frontend/src/router.tsx

Backend:
- backend/app/api/v1/endpoints/email.py (`POST /email/outreach`)
- backend/app/api/v1/endpoints/email_sequences.py
- backend/app/models/email_sequence.py
- backend/app/models/workflow.py
- backend/app/services/email_service.py
- backend/app/core/email.py
- backend/app/models/email_account.py
- backend/app/models/lead.py
- backend/app/api/v1/endpoints/clients.py (or clients module)

Prefer evolving `email_sequences` + a dedicated `outreach_scenarios` runner over duplicating three campaign systems. If keeping Workflows separate, Outreach Scenarios should be the outbound product surface; Workflows remain CRM automation.

## Module catalog (Make.com-inspired — implement in phases)

### Connections / Triggers
- Trigger: Manual run
- Trigger: Schedule (cron / one-shot datetime + timezone)
- Trigger: New/updated Lead (client filter)
- Trigger: Google Sheet new row / on interval poll
- Trigger: Webhook inbound (lead JSON)
- Trigger: Form submission (marketing forms → enroll)

### Flow control
- Wait / Delay (minutes, hours, days)
- Wait until (datetime or next business day)
- Send window (only Mon–Fri 09:00–17:00 in lead or org TZ)
- Filter / Router (if lead has email; if stage = X; if replied → stop)
- Iterator / Batch (chunk N leads; max concurrency)
- Aggregator (optional later)
- Pause scenario / Pause enrollment / Resume
- Error handler path (on fail → notify + retry policy)

### Actions — Outreach
- Send email (connected mailbox; text or HTML; merge tokens)
- Reply in thread (Gmail thread_id when available)
- Enroll in sequence / Advance step
- Update lead field / stage / tags
- Create task / deal note
- Skip if already contacted in last N days

### Actions — Google
- Google Sheets: read range, append row, update row by lead email
- Google Docs: create doc from template, export text into email body
- Google Drive: attach file (Phase 3+)

### Actions — AI
- AI: draft email from brief + lead context
- AI: rewrite / shorten / tone change
- AI: classify reply (interested / OOO / unsubscribe / bounce)
- AI: extract meeting intent → create calendar task

### Actions — Ops
- HTTP webhook outbound
- Slack / Teams notify (reuse existing webhook helpers if present)
- Log to outreach run history
- Credit / rate-limit check before send

## Data model (target)

outreach_connections
- id, organization_id, user_id, type (gmail|smtp|google_sheets|google_docs|webhook|ai),
  display_name, config JSON, encrypted_credentials, status, last_error, timestamps

outreach_scenarios
- id, organization_id, name, description, status (draft|active|paused|archived),
  flow_definition JSON, schedule_config JSON, settings JSON (rate_limit, send_window, default_account_id),
  created_by_id, timestamps

outreach_runs
- id, scenario_id, organization_id, trigger_type, status, started_at, finished_at, stats JSON

outreach_run_steps
- id, run_id, node_id, lead_id nullable, status, scheduled_at, executed_at,
  input JSON, output JSON, error, idempotency_key UNIQUE

Reuse SequenceEnrollment / SequenceStep for multi-touch email campaigns OR migrate them under outreach_scenarios as “email chain” subgraph. Do not leave two competing workers.

## API surface (Phase 1–2)

- CRUD connections
- CRUD scenarios (draft save, activate, pause)
- POST /outreach/scenarios/{id}/run (manual)
- GET /outreach/runs, GET /outreach/runs/{id}
- POST /outreach/preview (merge + optional AI draft, no send)
- Keep POST /email/outreach for simple one-shot from Cold Outreach UI
- Worker endpoints internal or Celery/ARQ/ cron job: process due run_steps

## UI IA

Under Email:
1. Inbox (existing)
2. Cold Outreach — keep as “Quick send” (simple list + compose + preview)
3. Scenarios — visual or step builder (Make-like)
4. Connections — manage Gmail, Sheets, Docs, AI keys
5. Runs — history, failures, retries
6. Sequences — either merge into Scenarios or enable behind flag once worker exists

Cold Outreach page enhancements (quick wins before full builder):
- Schedule send at datetime + timezone
- Business-hours only toggle
- Per-recipient delay (already partial) + max emails/hour
- Stop-on-reply / exclude recently emailed
- Sheet sync source selector (behind connection)
- Save as Scenario draft from current compose

## Delivery & compliance

- Respect unsubscribe / bounced flags on lead
- Cap: configurable max sends/hour/day per org and per mailbox
- Confirm dialog for N > threshold
- Store per-lead send result (sent|failed|skipped|deferred)
- Never log full email body in plaintext logs in production if avoidable; store in DB with org ACL

## Phased delivery

### Phase 0 — Harden current Cold Outreach (done / polish)
- Preview, HTML/text, client sync, batch send, delay
- Auto-select mailbox, clear errors, no fake success

### Phase 1 — Campaign timing + worker foundation
- Schedule “send at”
- Send window + timezone
- Persistent queue for delayed sends (replace long HTTP sleep)
- Pause/resume enrollment
- Enable sequence worker for delay_days steps OR map steps → outreach_run_steps
- Feature flag + nav: Scenarios / Sequences

### Phase 2 — Connections hub
- Connection CRUD UI
- Google Sheets OAuth + read leads into selection / enroll
- Google Docs template → body
- Webhook trigger

### Phase 3 — Visual scenario builder
- Drag modules (reuse Workflows UX patterns)
- Router + Wait + Send Email + Update Lead
- Run history UI
- AI draft/rewrite nodes (org AI key or LeadLab credits)

### Phase 4 — Platform polish
- Reply classification + auto-stop
- A/B subject lines
- Analytics (open/click if tracking exists)
- Templates library
- Team permissions (who can send as which mailbox)

## Implementation rules

- One focused PR/commit per phase slice; push only when asked or when user says push to main.
- Add tests: token merge, idempotent step, schedule deferral, org isolation, connection credential not leaked in API responses.
- Update featureFlags before exposing unfinished nav.
- Prefer asyncio worker / Redis queue; do not block API workers with multi-minute sleeps.
- Document env vars in backend/.env.example (Google Sheets scopes, worker URL, AI provider).

## Verification checklist

1) Quick send still works from /emails/outreach
2) Scheduled send creates run_step with future scheduled_at and worker sends later
3) Pause stops further steps; resume continues
4) Sheets connection imports rows → leads or temporary recipient list with email required
5) Scenario with Wait 1 day → Send does not send early
6) Failed SMTP returns failed status in run history, not success toast alone
7) Org A cannot see Org B scenarios/connections/runs

## Deliverable when executing this prompt

- Implement the agreed phase only
- List files changed
- Short test evidence
- Remaining gaps vs this catalog
```

---

## Feature list (Make.com-inspired → LeadLab Outreach)

Use this as the product backlog under **Outreach**. Priority = P0 ship-next, P1 soon, P2 platform, P3 advanced.

### Connections (like Make “Connections”)
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| C1 | Connections hub UI | P1 | Gmail/SMTP, Sheets, Docs, Webhook, AI |
| C2 | Gmail / SMTP mailbox (existing) | P0 | Already used by Cold Outreach |
| C3 | Google Sheets read / append / update | P1 | Lead source + logging replies status |
| C4 | Google Docs template → email body | P2 | Merge fields into doc then send |
| C5 | Inbound webhook trigger | P2 | External forms / Zapier-in |
| C6 | AI provider connection | P2 | Draft/rewrite using credits or BYO key |

### Timers & scheduling (like Make “Sleep” / Schedule)
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| T1 | Delay between each recipient | P0 | Partial (0–10s); raise + persist for large lists |
| T2 | Delay between campaign steps | P0 | Hours/days via worker |
| T3 | Schedule campaign start (datetime + TZ) | P1 | |
| T4 | Business-hours send window | P1 | |
| T5 | Wait until condition (reply / date) | P2 | |
| T6 | Pause / resume scenario or enrollment | P1 | |
| T7 | Max emails per hour / day | P1 | Protect domain reputation |

### Campaign / scenario builder (like Make scenarios)
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| S1 | Quick send (list + compose + preview) | P0 | Shipped `/emails/outreach` |
| S2 | Multi-step email sequence worker | P0 | Unblock existing sequences |
| S3 | Visual scenario canvas | P2 | Reuse Workflows patterns |
| S4 | Router / filters (if-else) | P2 | Skip no-email, stop on reply |
| S5 | Iterator over leads / sheet rows | P1 | |
| S6 | Save Quick Send as Scenario | P1 | |
| S7 | Templates library | P2 | |
| S8 | A/B subject lines | P3 | |

### Lead sources & CRM
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| L1 | Sync from Clients | P0 | Shipped |
| L2 | Select / search leads | P0 | Shipped |
| L3 | Import from Google Sheet | P1 | |
| L4 | CSV upload | P2 | |
| L5 | Exclude contacted in last N days | P1 | |
| L6 | Stop sequence on reply | P1 | Needs inbound mail parse |
| L7 | Update lead stage after send/reply | P1 | |

### Email content
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| E1 | Plain text + HTML | P0 | Shipped |
| E2 | Preview with merge tokens | P0 | Shipped |
| E3 | Merge tokens (`{{first_name}}`…) | P0 | Shipped |
| E4 | AI draft from brief | P2 | |
| E5 | AI rewrite / tone | P2 | |
| E6 | Attachments | P3 | |
| E7 | Reply-in-thread follow-ups | P2 | Gmail thread |

### Observability & safety (like Make execution history)
| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| O1 | Per-send results (sent/failed/skipped) | P0 | API returns; surface in UI table |
| O2 | Run history with retry | P1 | |
| O3 | Bounce / unsubscribe handling | P1 | |
| O4 | Slack/Teams notify on failures | P2 | Existing webhook helpers |
| O5 | Analytics opens/clicks | P3 | Tracking pixels exist partially |
| O6 | Team permissions per mailbox | P3 | |

### Make.com concepts to adopt (named mapping)
- **Scenario** → Outreach Scenario  
- **Module** → Node (Send, Wait, Sheets, AI, Router)  
- **Connection** → Outreach Connection  
- **Scheduling** → scenario `schedule_config` + worker  
- **Sleep** → Wait module / inter-recipient delay  
- **Iterator** → lead/sheet batch processor  
- **Execution history** → `outreach_runs` + step log  
- **Error handler** → failed path + retry policy  
- **Data stores** → Leads + optional Sheet as external store  

---

## Suggested build order (engineering)

1. **Worker + schedule + pause** on top of sequences / outreach queue (unlocks “campaigns with timers”).  
2. **Connections hub** + Google Sheets lead sync.  
3. **Runs UI** (Make-like execution log).  
4. **Visual scenario builder** (merge Sequences + Workflow UX).  
5. **AI + Docs + reply classification**.

## Git / docs

- Keep this file as the source of truth for Cursor agents.
- When implementing a phase, add a short “Applied” section at the top (same pattern as RLS super prompt).
- Do not commit dumps, `.env`, or OAuth secrets.
