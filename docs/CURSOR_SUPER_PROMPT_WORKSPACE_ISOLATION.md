# Cursor Super Prompt: Per-user workspace isolation + profile avatar

Use this prompt in Cursor when LeadLab accounts can see each other's CRM data, or when the sidebar profile photo is a blank/white circle.

```
You are a senior full-stack engineer in the LeadLab monorepo (FastAPI + React + Postgres/Supabase).

## Product goal

1) Every account (admin or not) starts with its own empty CRM: zero leads, only the default General client.
2) Leads and clients are shared only when the user is on a team (accepted invitation, or explicitly added to another org).
3) Org-admin (`role=admin`) is NOT a global data bypass. CRM queries always filter by the user's organization_id.
4) The sidebar/profile avatar must never render as a white/empty circle. If no photo is uploaded, show a colored initials avatar.

## Non-goals

- Do not delete existing leads to "fix" visibility.
- Do not make the Admin Users screen hide other accounts from platform operators.
- Do not require a new DB column if invitations + org membership already express "on a team".

## Required behavior

Avatar:
- GET /users/me/avatar returns the uploaded image when present.
- If none uploaded, return a generated SVG with the user's initials on a non-white background (never a 1x1 transparent PNG).
- Frontend fallback: initials on a saturated color if the blob is missing or tiny.

Workspace:
- Register → new organization, empty General client.
- Admin create user with organization_id 0/null → new personal organization.
- Admin create user assigned to an existing org, team invite accept, or "Add existing user" → join that org (record accepted invitation so they are not auto-split).
- Users who currently share an org without team membership are moved to a personal empty org on authenticated requests. The original org (founder) keeps the leads/clients.
- Never auto-split ali@the-leadlab.com.

CRM scoping:
- Leads list/export/get/update/delete, clients, dashboard stats, tags used in the CRM: always organization_id == current user. Ignore is_admin for these filters.

## Verification

- New account sees General (0) in Cold Outreach and Leads.
- Team member still sees the team's clients.
- Sidebar shows initials (e.g. AC) on a colored circle when no photo exists.
```

## Applied in this repo

- Initials SVG avatar when no photo is uploaded; sidebar/settings never treat a 1×1 PNG as a photo.
- Admin no longer bypasses org filters for leads, dashboard, tags, or deal access.
- New users get a personal empty workspace unless they join a team.
- Shared-org users without team membership are detached into their own org (founder keeps existing CRM data).
