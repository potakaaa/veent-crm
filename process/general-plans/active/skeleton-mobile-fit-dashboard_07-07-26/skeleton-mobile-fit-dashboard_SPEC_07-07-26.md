---
name: plan:skeleton-mobile-fit-dashboard
description: SPEC — fix mobile-broken skeleton loading components (GitHub #177) and add desktop+mobile skeletons for the new /dashboard page
date: 07-07-26
feature: ux-enhancement
---

# SPEC: Skeleton Loading — Mobile Fit Fixes + New Dashboard Skeleton

## Summary

When a page is loading, users briefly see a "skeleton" placeholder shaped like the real content, so the screen doesn't feel empty or broken. Several of these skeletons were built to match the desktop layout only — on a phone, they render as squished multi-column rows instead of the stacked single-column look the real page uses, so the moment the real content pops in there's a visible jump ("layout shift") and a jarring mismatch. This work fixes those specific mobile-broken skeletons (desktop is untouched) and adds a proper loading skeleton for the `/dashboard` manager page, which currently has no matching skeleton at all — it briefly shows a wrong-shaped generic table, or plain "Loading dashboard…" text.

## User Stories / Jobs To Be Done

1. As a mobile user browsing Leads, Unassigned, Team, or Calendar, I want the loading placeholder to already look like the stacked mobile layout, so that the page doesn't visibly jump or reflow when the real data appears.
2. As a mobile user on the Today page or Reminders/Notifications sections, I want the loading rows to fit my screen width without cramming, so that the app feels polished instead of broken on my phone.
3. As a manager opening `/dashboard` (desktop or mobile), I want to see a loading skeleton shaped like the real per-AE dashboard cards, so that I know the page is working and not stuck on a blank/wrong-looking state.
4. As any user, I want desktop rendering of every existing skeleton to look exactly as it does today, so that this fix doesn't introduce any desktop regression.

## What The User Wants (Behavioral Outcomes)

**Group 1 — Fix mobile-broken skeletons (GitHub #177):**
- On narrow/mobile viewports, the cross-route navigation skeleton (shown while a new page's data is loading) stacks into single-column cards for Leads, Unassigned, and Team, matching how those pages actually render on mobile.
- The Calendar loading skeleton scrolls horizontally on mobile instead of squishing 7 day-columns into a narrow screen, matching the real calendar grid's mobile scroll behavior.
- The Today page's lead-row loading skeleton stacks as a card on mobile instead of cramming a horizontal row with trailing chips.
- The Reminders/Notifications section loading skeleton (avatar + trailing pill rows) fits mobile width without cramping.
- None of the above changes anything about how these same skeletons render on desktop widths.

**Group 2 — New /dashboard skeleton (net-new):**
- Opening `/dashboard` while data is loading shows a skeleton shaped like the real per-AE card grid (name + count, a 3-stat row, wrapped stage chips) — on both desktop (multi-column grid) and mobile (single column) — instead of a wrong-shaped generic table or plain loading text.

## Flow / State Diagram

```
Mobile nav-loading skeleton flow (Group 1 — RouteShells dispatcher)
────────────────────────────────────────────────────────────────────
User clicks nav link (e.g. /leads)
        │
        ▼
+layout.svelte enters navLoading state
        │
        ▼
RouteShells.svelte branches on pathname
        │
        ├─ isLeads / isUnassigned ──▶ [FIX] list-skeleton: stacks single-column cards <lg
        ├─ isTeam ──────────────────▶ [FIX] table-skeleton: scroll-wraps / reduced cols <lg
        ├─ isCalendar ──────────────▶ [FIX] adds overflow-x-auto + min-w wrapper <lg
        └─ (Today/Pipeline/Reports/Templates — already correct, NOT touched)
        │
        ▼
Real page data resolves → real content replaces skeleton
        │
        ▼
[VERIFY] no visible layout jump, mobile shape matches real shape

Dashboard skeleton flow (Group 2 — net-new)
────────────────────────────────────────────────────────────────────
Manager/super-manager navigates to /dashboard
        │
        ├─ Cross-route nav (RouteShells) ──▶ [NEW] isDashboard branch:
        │                                      desktop: multi-col card grid skeleton
        │                                      mobile (<lg): single-col card skeleton
        │
        └─ Same-route data refetch (page's own {#await data.dashboard}) ──▶
                                              [NEW] same skeleton component reused,
                                              replacing plain "Loading dashboard…" text
        │
        ▼
Real per-AE cards render → skeleton replaced, no shape mismatch
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — Leads/Unassigned mobile stacking**
On viewports narrower than the `lg` breakpoint (1024px), the RouteShells skeleton for `/leads` and `/unassigned` renders as stacked single-column cards, matching `DataGridShell`'s own established mobile card shape, instead of a horizontal `flex` row of columns.
- proven by: Manual/visual verification — dev server, resize browser below 1024px, confirm stacked card skeleton on nav to /leads and /unassigned.
- strategy: Agent-Probe (visual/viewport verification; blocked from full e2e automation by the repo-wide shared-Playwright-auth-fixture known-gap).

**AC2 — Team mobile handling**
On viewports narrower than `lg`, the RouteShells skeleton for `/team` either horizontally scroll-wraps (matching the real `<Table>`'s scroll behavior) or reduces to fewer visible skeleton columns — team's real content stays genuinely tabular, so it is NOT converted to the stacked-card shape used for Leads/Unassigned.
- proven by: Manual/visual verification — dev server, resize browser below 1024px, confirm /team skeleton scrolls/reduces rather than squishing columns.
- strategy: Agent-Probe.

**AC3 — Calendar mobile scroll**
On viewports narrower than `lg`, the RouteShells calendar skeleton has the same `overflow-x-auto` + `min-w-[640px] sm:min-w-0` scroll wrapper as the real `CalendarGrid.svelte`, so 7 day-columns scroll horizontally instead of squishing.
- proven by: Manual/visual verification — dev server, resize browser below 1024px, confirm calendar skeleton scrolls horizontally on nav to /calendar.
- strategy: Agent-Probe.

**AC4 — Today page lead-row stacking**
On viewports narrower than `lg`, `LeadRowSkeleton` stacks as a card (matching the real Today-page lead row's mobile card shape) instead of a horizontal row with trailing chips.
- proven by: Manual/visual verification — dev server, resize browser below 1024px, confirm Today page lead-row skeleton stacks.
- strategy: Agent-Probe.

**AC5 — Reminders/Notifications section fit**
On viewports narrower than `lg`, `DashboardSectionSkeleton` (used by /reminders and /notifications) does not crowd its avatar + trailing-pill row — it adapts to mobile width without visual cramping.
- proven by: Manual/visual verification — dev server, resize browser below 1024px, confirm /reminders and /notifications section skeletons don't crowd.
- strategy: Agent-Probe.

**AC6 — Desktop unchanged (regression guard)**
Every skeleton component touched in AC1–AC5 renders pixel-identical to its pre-fix desktop appearance at viewports ≥ `lg` (1024px) — no desktop markup, spacing, or column count changes.
- proven by: `bun run check` (typecheck/svelte-check passes with no structural errors) as a baseline compile gate, plus manual/visual side-by-side comparison at desktop width before/after the change.
- strategy: Hybrid (Fully-Automated typecheck gate + Agent-Probe visual comparison).

**AC7 — New /dashboard skeleton, desktop shape**
On `/dashboard` at desktop widths, the loading skeleton (both the cross-route RouteShells skeleton and the page's own same-route loading state) shows a multi-column card grid shaped like the real per-AE cards (name/count line, 3-stat row, wrapped chip row), not a generic table fallback.
- proven by: Manual/visual verification — dev server, load /dashboard as manager/super-manager role, confirm shaped skeleton appears before real data renders, at desktop width.
- strategy: Agent-Probe (also blocked from e2e by the same shared-auth-fixture known-gap noted for this feature's other recent work).

**AC8 — New /dashboard skeleton, mobile shape**
On `/dashboard` at viewports narrower than `lg`, the same new skeleton collapses to a single-column stack of per-AE cards, matching the real page's `sm:grid-cols-2 lg:grid-cols-3` responsive behavior at its narrowest state.
- proven by: Manual/visual verification — dev server, resize browser below 1024px on /dashboard, confirm single-column skeleton stack.
- strategy: Agent-Probe.

**AC9 — Dashboard skeleton replaces both currently-broken states**
The new dashboard skeleton is used in both places `/dashboard` currently shows a wrong or missing loading state: the RouteShells cross-route dispatcher (currently falls through to the generic table fallback) AND the page's own inline `{#await data.dashboard}` block (currently plain "Loading dashboard…" text).
- proven by: Manual/visual verification — dev server, trigger both a cross-route nav to /dashboard and a same-route data refetch (e.g. changing the date-range filter), confirm the shaped skeleton appears in both cases, not the old table fallback or text string.
- strategy: Agent-Probe.

**AC10 — No unrelated skeleton regressions**
The RouteShells branches for Today, Pipeline, Reports, and Templates, `DataGridShell`'s own inline skeleton, `DetailSkeleton`'s outer layout, `CardSkeleton`, and the base `ui/skeleton/skeleton.svelte` primitive are all byte-for-byte unchanged.
- proven by: `git diff` review confined to the touched skeleton files only (no changes outside `src/lib/components/shared/skeletons/` plus the two new dashboard usage sites), verified during code review before merge.
- strategy: Fully-Automated (diff-scope check is mechanically verifiable).

## Out Of Scope

- No changes to desktop rendering of any existing skeleton component — every fix in Group 1 is mobile-viewport-only.
- No changes to the base `ui/skeleton/skeleton.svelte` primitive (the shimmer/pulse building block itself is correct and unrelated to this layout-shape problem).
- No new JS media-query hook for skeletons — stays CSS/Tailwind breakpoint-only, consistent with the existing SSR-flash-avoidance rationale (the existing `IsMobile` JS hook at 880px is out of scope and not to be wired into skeletons).
- No changes to `DataGridShell.svelte`'s own inline loading skeleton — it is already correct for /leads and /unassigned same-route loading; only the separate RouteShells cross-route dispatcher skeleton is being fixed.
- No changes to `DetailSkeleton`'s outer two-column layout (the minor inner `grid-cols-2` info-block nit noted in research is non-blocking and explicitly deferred, not part of this SPEC).
- No changes to any skeleton usage site's data-fetching logic, loading-state trigger conditions, or `navLoading` derivation — only the visual/markup shape of the skeleton itself.
- No new automated visual-regression or viewport-resize test infrastructure is being built as part of this SPEC — verification relies on manual/visual checks per the repo's existing known-gap for shared Playwright auth fixtures.
- No work on any other pages' skeletons beyond the six named in Group 1 (Leads, Unassigned, Team, Calendar, Today, Reminders/Notifications) and the new Group 2 Dashboard skeleton.

## Constraints

- Desktop rendering must not change at all — this is a hard, non-negotiable constraint restated from the user's own clarification ("all desktop skeleton laoding are good the mobile onlt is problem").
- Skeletons stay CSS/Tailwind-only — no JS mediaquery hook, to avoid the SSR flash the codebase already deliberately avoids.
- Breakpoint standardization: the SPEC adopts `lg:` (1024px) as the mobile/desktop skeleton-stacking threshold, not the literal `<768px` wording in the original GitHub issue text. Rationale: the codebase's actual established precedent for card↔table stacking (`DataGridShell.svelte`, the lead-detail page) already uses `lg:`, and skeletons must match the real content's actual breakpoint or the mismatch this SPEC is fixing will simply reappear at a different width. This is a resolved decision, not an open question — see Background for the full research basis.
- `TableSkeleton` is treated as two distinct behaviors rather than one fix-all component: a list-skeleton shape for Leads/Unassigned (mirroring `DataGridShell`'s card-stack) and a differently-treated table-skeleton shape for Team (keeps genuine tabular shape, scroll-wraps or reduces columns on mobile rather than becoming cards). This is a resolved decision — Team's real content is a horizontally-scrollable table, not a card list, so forcing it into the same card shape as Leads/Unassigned would create a new mismatch rather than fixing one.
- The dashboard skeleton work covers BOTH the RouteShells `isDashboard` branch (cross-route nav) AND the page's own inline `{#await}` block (same-route loading) — resolved as in-scope for both, since leaving either one showing a mismatched or missing state defeats the purpose of adding a shaped skeleton at all.
- No new test infrastructure investment — verification accepts the existing Agent-Probe/manual tier as primary for this visual-only work, consistent with how the rest of this feature area (calendar, reminders, manager-dashboard) has already accepted the same shared-auth-fixture known-gap.

## Open Questions

None. All three decision points flagged in the originating task (breakpoint value, TableSkeleton split, dashboard inline-await replacement) are resolved above in Constraints, with rationale grounded in existing codebase precedent gathered during RESEARCH. If a reviewer disagrees with any of these three resolutions, treat it as PLAN-time feedback rather than a SPEC blocker — the decisions are documented, not left ambiguous.

## Background / Research Findings

- Skeletons live in `src/lib/components/shared/skeletons/`: `RouteShells.svelte` (281-line cross-route dispatcher, branches on pathname), `TableSkeleton.svelte`, `LeadRowSkeleton.svelte`, `DashboardSectionSkeleton.svelte`, `DetailSkeleton.svelte`, `CardSkeleton.svelte`, plus the base `ui/skeleton/skeleton.svelte` primitive (untouched).
- Two skeleton mechanisms exist: RouteShells (cross-route nav skeleton) and per-page inline skeletons driven by a `navLoading` derived state (same-route filter/paging changes).
- No custom Tailwind breakpoints are defined in this project (defaults: sm=640/md=768/lg=1024). The established card↔table stacking pattern in real pages (`DataGridShell.svelte`, lead-detail page) uses `lg:` (1024px). A JS `IsMobile` hook exists (880px, `src/lib/hooks/is-mobile.svelte.ts`) but is used only for nav chrome, not skeletons — skeletons are deliberately CSS-only to avoid an SSR flash.
- Mobile-broken today (reuse fixed desktop structure instead of stacking):
  - `TableSkeleton` — horizontal `flex gap-4` row of N `flex-1` columns, never stacks. Used by RouteShells for /leads (cols=5), /unassigned (cols=6), /team (cols=5), and an else-fallback (cols=4, currently also incorrectly used by /dashboard). Real /leads and /unassigned pages use `DataGridShell.svelte`, which already stacks correctly below `lg` — its own inline loading skeleton is correct; only the RouteShells-branch skeleton is mismatched.
  - RouteShells `isCalendar` branch — bare `grid grid-cols-7`, missing the real `CalendarGrid.svelte`'s `overflow-x-auto` + `min-w-[640px] sm:min-w-0` scroll wrapper.
  - `LeadRowSkeleton` — horizontal row with fixed trailing chips; real Today-page lead rows stack as cards below `lg`.
  - `DashboardSectionSkeleton` — horizontal rows (avatar + trailing pill); used by /reminders and /notifications, same cramping risk on narrow mobile.
- Already mobile-correct and explicitly untouched: RouteShells Today/Pipeline/Reports/Templates branches, `DataGridShell`'s own inline skeleton, `DetailSkeleton`'s outer 2-col layout, `CardSkeleton`.
- `/dashboard` real layout: `PageHeader` + `SearchInput` + `RangeBucketControl`, then a per-AE card grid `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`; each card shows name+count, a `grid-cols-3` stat row, and wrap-flex stage chips, with optional pagination. Currently RouteShells has no `isDashboard` branch (falls to the wrong-shape 4-col table fallback), and the page's own inline `{#await data.dashboard}` shows plain "Loading dashboard…" text — no skeleton at all.
- Test coverage: zero tests exist for any skeleton component (pure-visual Svelte, no dedicated component-test harness decided yet — see `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`). Responsive-fit verification is additionally blocked by the repo-wide shared-Playwright-auth-fixture known-gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), so acceptance criteria here rely on manual/visual dev-server verification as the primary tier, consistent with how calendar/reminders/manager-dashboard already handle this same gap.
- User's own clarification (verbatim, authoritative scope-setter): "all desktop skeleton laoding are good the mobile onlt is problem cause some of them uses the desktop skeleton, also create a desktop and mobile skeleton loading for the new page dashboard."
- A related but distinct existing plan, `process/general-plans/active/skeleton-loading-templates-meetings-calendar_02-07-26/`, added RouteShells branches for /templates, /meetings, /meetings/[id], and /calendar (issue #132) — that work is about coverage gaps (pages with no skeleton at all), while this SPEC is about mobile-shape correctness for pages that already have a skeleton plus one net-new page (/dashboard). No file overlap expected other than possibly `RouteShells.svelte`'s calendar branch, which should be checked for merge conflicts at PLAN/EXECUTE time.
