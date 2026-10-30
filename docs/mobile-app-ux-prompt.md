# LeadLab mobile app — UX super prompt

Living brief for phone-only UI. Desktop (`md+`) stays unchanged. All phone work uses `max-md:` / `md:hidden` / mobile components.

## Product

LeadLab is a B2B CRM: leads, tasks, email/outreach, deals, calendar. The phone app is the same React app inside a Capacitor WebView (`com.theleadlab.app`).

## Brand

- Primary: LeadLab blue system (existing Tailwind `primary-*` / design-system tokens)
- Dark mode: class on `html`; use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `border-input`)
- Avoid: purple/indigo glow themes, cream+terracotta AI clichés, emoji decoration, multi-layer shadows, pill spam

## Phone chrome

- Top context bar: logo or screen title, notification bell, theme/language overflow as needed; respect `safe-area-inset-top`
- Bottom tabs (primary): Dashboard, Leads, Tasks, Email, More
- More: Vaul bottom sheet with remaining nav (Deals, Messages, Calendar, CPQ, Settings, Admin, …)
- Desktop: keep `ModernSidebar`; never replace it with tabs at `md+`

## Interaction rules

- Touch targets ≥ 44×44px
- Primary CTAs in thumb zone (bottom of content or FAB above tab bar)
- Filters / secondary actions → bottom sheets, not hover menus
- Lists → full-screen detail (one pane at a time); no dual-pane inbox on phone
- Do not use wide tables as the primary phone UX; use cards or stacked rows
- Main scroll gets bottom padding for tab bar + `safe-area-inset-bottom`

## Capacitor

- StatusBar style follows light/dark theme
- Keyboard: resize / avoid so compose fields stay visible
- SplashScreen on launch
- Deep links: `https://the-leadlab.com/*` open in-app router when native

## Screen patterns

| Screen | Phone pattern |
|--------|----------------|
| Dashboard | Compact KPI strip, stacked charts, tight padding |
| Leads | Card list; filters sheet; primary CTA above tabs |
| Tasks | List-first; board optional / horizontal |
| Email | Folders → list → detail stack |
| Outreach / Campaigns | Stacked forms; sticky send |
| Other modules | Stack, sheets, no table-only UI |

## Implementation guardrails

- Shared nav config drives sidebar, tabs, and More
- Prefer CSS `max-md:` over JS; use `useIsPhone` only when layout must branch in JS
- Do not change desktop visual IA while shipping phone layouts
