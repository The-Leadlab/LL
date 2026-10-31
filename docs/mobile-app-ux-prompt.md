# LeadLab mobile app — UX super prompt

Phone-only IA and interaction rules. Visual language follows **Atlas** — see [`CURSOR_SUPER_PROMPT_PLATFORM_UI.md`](./CURSOR_SUPER_PROMPT_PLATFORM_UI.md).

Desktop (`md+`) uses the sidebar shell. Phone work uses `max-md:` / `md:hidden` / mobile components.

## Product

LeadLab is a B2B CRM: leads, tasks, email/outreach, deals, calendar. The phone app is the same React app inside a Capacitor WebView (`com.theleadlab.app`).

## Brand (Atlas)

- UI: Plus Jakarta Sans; marketing display: Instrument Serif where needed
- Accent: LeadLab blue (`primary-600`)
- Semantic tokens: `bg-background`, `text-foreground`, `bg-card`, `border-border`
- Avoid: purple/indigo glow, cream+terracotta clichés, emoji decoration, multi-layer shadows

## Phone chrome

- Top context bar: logo, notification bell, theme/language; `safe-area-inset-top`
- Bottom tabs: Dashboard, Leads, Tasks, Email, More
- More: Vaul sheet for remaining nav
- Desktop: `ModernSidebar` at `md+` only

## Interaction rules

- Touch targets ≥ 44×44px
- Primary CTAs in thumb zone
- Filters → bottom sheets
- Lists → full-screen detail; no dual-pane inbox on phone
- Cards/stacked rows instead of wide tables as primary UX
- Main scroll: padding for tab bar + `safe-area-inset-bottom`

## Capacitor

- StatusBar follows light/dark
- Keyboard resize for compose
- SplashScreen on launch
- Deep links: `https://the-leadlab.com/*` → in-app router

## Screen patterns

| Screen | Phone pattern |
|--------|----------------|
| Dashboard | Compact KPI strip, stacked charts |
| Leads | Card list; filters sheet |
| Tasks | List-first |
| Email | Folders → list → detail |
| Outreach / Campaigns | Stacked forms; sticky send |
| Other | Stack, sheets |

## Guardrails

- Shared nav config for sidebar, tabs, More
- Prefer CSS `max-md:`; `useIsPhone` only when JS branch required
