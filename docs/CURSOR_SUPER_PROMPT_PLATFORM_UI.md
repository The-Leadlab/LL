# LeadLab platform UI — Atlas super prompt

Single brief for the full visual redesign (marketing + CRM + Capacitor). Implementers and later AI passes follow this; do not invent a parallel look.

## Direction: Atlas

Editorial-modern B2B CRM. Ink neutrals, one LeadLab blue accent (`#2563eb` / `primary-600`), expressive type, quiet motion.

Not: purple→indigo gradients, cream+terracotta AI defaults, Inter/system UI as the brand face, emoji icons, card-in-card, multi-layer glow, pill spam.

## Tokens (source of truth)

- CSS roles live in `frontend/src/styles/design-system.css`
- shadcn HSL vars in `frontend/src/index.css` must map to the same roles
- Tailwind `primary-*` + `fontFamily.sans|display|mono` stay in sync
- Prefer `bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary` over raw hex

## Typography

| Role | Face |
|------|------|
| UI / CRM | Plus Jakarta Sans (`font-sans`) |
| Marketing display | Instrument Serif (`font-display`) — heroes and section titles only |
| Mono | JetBrains Mono (`font-mono`) |

## Marketing anatomy

- First viewport: brand (logo/name) hero-level, one headline, one supporting sentence, one CTA group, one full-bleed visual plane
- No stats strips, card grids, or floating badges in the hero
- Sections: one job, one headline, short support

## CRM density

- Sidebar + content: clear hierarchy, tighter radius on controls (`--radius` 0.5rem)
- Tables OK on `md+`; phone uses cards / stacked rows
- Primary actions readable in light and dark

## Phone IA (unchanged structure)

See `docs/mobile-app-ux-prompt.md`. Tabs: Dashboard, Leads, Tasks, Email, More. Desktop sidebar at `md+`.

## Floors (craft)

- Every interactive control has `:focus-visible`
- Animations: opacity/transform 150–200ms; honor `prefers-reduced-motion`
- Never `transition: all`
- Touch targets ≥ 44px on phone
- Safe-area insets on phone chrome

## Device matrix

| Surface | Breakpoint | Notes |
|---------|------------|--------|
| Phone | `max-md` | Tab bar, cards, sheets |
| Tablet | `md`–`lg` | Sidebar or condensed chrome |
| Desktop | `lg+` | Full sidebar + dense tables |

## File ownership order

1. Tokens / fonts / Tailwind / MUI soft-align  
2. Button, Card, PageContainer  
3. ModernLayout, Sidebar, MobileTabBar / More  
4. HomePage, MarketingNav, PublicAuthShell, SignIn/SignUp  
5. Dashboard, Leads, Tasks, Email, Deals  
6. Remaining Modern* / Calendar / Messages / Reports / CPQ / Admin / Intake / Settings  
