---
name: plan:collapsible-sidebar-spec
description: "Product-discovery SPEC for making the app's left sidebar collapsible using the shadcn-svelte Sidebar component (GitHub issue #158)"
date: 03-07-26
feature: ux-enhancement
metadata:
  node_type: memory
  type: spec
  feature: ux-enhancement
  phase: collapsible-sidebar
---

# Collapsible Sidebar — SPEC

Source issue: GitHub #158 — "make sidebar collapsible #158 use npx shadcn-svelte@latest add sidebar"

## Summary

Right now the left navigation rail is always fully expanded on desktop, taking a fixed 236px
of screen width with no way to shrink it. This SPEC covers giving users a way to collapse that
sidebar down to a slim icon-only rail (and expand it back), so people working on smaller
laptop screens or wanting more room for the main content area can reclaim that space, while
still being able to reach every nav destination in one click. It also locks in that we build
this using the shadcn-svelte `Sidebar` component set (as instructed in the source issue),
which the app's `components.json` is already configured to receive.

## User Stories / Jobs To Be Done

1. As a rep working on a smaller/laptop screen, I want to collapse the sidebar to a slim
   icon-only rail, so that I have more horizontal space for the leads table, pipeline board,
   or calendar grid I'm actually working in.

2. As a rep who collapsed the sidebar, I want to expand it back to full width with one click,
   so that I can see the text labels again when I need them.

3. As a rep who collapsed the sidebar, I want to still be able to navigate to every page
   (Today, My Leads, Pipeline, Up for grabs, Reminders, Calendar, Meetings, Templates, and —
   for managers — Reports/Team) using just the icons, so that collapsing doesn't cost me any
   functionality.

4. As a returning user, I want the sidebar to remember whether I had it collapsed or expanded
   last time, so that I don't have to re-collapse it every session.

5. As a keyboard user, I want a keyboard shortcut to toggle the sidebar, so that I don't have
   to reach for the mouse every time I want to switch between modes.

6. As a mobile/tablet user, I want the existing off-canvas nav drawer behavior (hamburger menu
   opens a full slide-in menu, closes on navigate) to keep working exactly as it does today —
   the collapse feature is a desktop concept and should not change how navigation works on a
   phone-sized screen.

## What The User Wants (Behavioral Outcomes)

- On desktop/tablet widths (≥880px, the existing breakpoint), the sidebar has two visual
  states: **expanded** (current look — icon + label, 236px wide) and **collapsed** (icon-only,
  narrow rail).
- A visible toggle control switches between the two states. Clicking/tapping it immediately
  animates the sidebar to the other state — no page reload, no jump/flash.
- In the collapsed state, every nav item is still present and clickable by its icon alone.
  Hovering (or focusing, for keyboard users) an icon in the collapsed state reveals the item's
  label so the meaning of each icon is never a guessing game.
- The active-page highlight, unread/overdue badges (the red count badges on Today and Up for
  Grabs), the brand mark, the presence dot, and the user footer (avatar, name, role, sign-out)
  all continue to render sensibly in both states — nothing gets cut off or silently disappears
  in collapsed mode (badges may relocate onto/near the icon rather than at the row's trailing
  edge).
- The collapse/expand state persists across page navigation and across browser sessions (a
  returning user sees the sidebar in the same state they left it in).
- A keyboard shortcut toggles the sidebar (shadcn-svelte's Sidebar ships `Cmd/Ctrl+B` by
  default) without needing to tab to the toggle button first.
- Mobile behavior (below the 880px breakpoint) is unchanged: hamburger button in the topbar
  opens the existing off-canvas drawer; the collapse/expand concept does not apply on mobile
  (the drawer is already a hide/show toggle, not a width toggle).
- Manager-only nav items (Reports, Team) continue to only appear for manager-role users, in
  both collapsed and expanded states.
- Sign-out, active-route highlighting, and every existing nav destination continue to work
  identically to today — this is a presentation change to the sidebar, not a navigation change.

## Flow / State Diagram

```text
Desktop / tablet (>=880px)
┌────────────────────────────┐        toggle click /        ┌───────────────────────┐
│   EXPANDED (current state) │ ────  Cmd/Ctrl+B  ──────────► │  COLLAPSED (icon-only) │
│  236px, icon + label       │ ◄──── toggle click /  ─────── │  narrow rail            │
│  brand + section labels    │        Cmd/Ctrl+B             │  hover/focus reveals    │
│  full user footer          │                               │  label as tooltip       │
└────────────────────────────┘                               └───────────────────────┘
        │  state persists (cookie/localStorage) across navigation + new sessions │
        └───────────────────────────────────────────────────────────────────────┘

Mobile / narrow (<880px) — UNCHANGED, separate mechanism
┌───────────────┐   hamburger tap    ┌─────────────────────────┐
│  Drawer CLOSED │ ─────────────────►│  Drawer OPEN (off-canvas)│
│  (topbar only) │ ◄───── select dest / close / outside-click ─│  full rail, all items    │
└───────────────┘                    └─────────────────────────┘
     (collapse/expand toggle does NOT appear at this width)
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — Sidebar has a working collapse/expand toggle on desktop.**
On a desktop-width screen (≥880px), a visible control toggles the sidebar between expanded
(current 236px look) and collapsed (icon-only) states, with no page reload and no layout jump.
- proven by: e2e sidebar-collapse-toggle scenario (Playwright, `e2e/sidebar-collapse.e2e.ts`,
  new) — self-skips against the pre-existing shared-auth-fixture known-gap like every other
  protected-route e2e spec in this repo, so also proven by an Agent-Probe manual walkthrough
  until that gap is resolved.
- strategy: Hybrid

**AC2 — Every nav destination remains reachable in the collapsed state.**
While collapsed, clicking any icon (Today, My Leads, Pipeline, Up for grabs, Reminders,
Calendar, Meetings, Templates, and Reports/Team for managers) navigates to the same route it
does today in the expanded state.
- proven by: e2e sidebar-collapse-toggle scenario (icon-click navigation assertions) +
  Agent-Probe manual walkthrough (same known-gap as AC1).
- strategy: Hybrid

**AC3 — Collapsed-state icons reveal their label on hover/focus.**
Hovering a mouse over, or moving keyboard focus to, any nav icon in the collapsed state shows
that item's text label (tooltip or equivalent) so meaning is never lost.
- proven by: Agent-Probe manual walkthrough (`sidebar-collapse` scenario checklist) — visual
  tooltip timing/rendering is not practically covered by an automated DOM assertion in this
  repo's current test setup.
- strategy: Agent-Probe

**AC4 — Collapse state persists across navigation and across sessions.**
After collapsing the sidebar, navigating to a different page keeps it collapsed. Closing and
reopening the browser (new session) still shows the sidebar in the last-set state.
- proven by: e2e sidebar-collapse-toggle scenario (cross-navigation assertion, same page load)
  + Agent-Probe manual walkthrough for the cross-session persistence check (requires closing
  the browser between checks, which is outside typical single-run e2e assertions).
- strategy: Hybrid

**AC5 — Keyboard shortcut toggles the sidebar.**
Pressing the sidebar's keyboard shortcut (default `Cmd/Ctrl+B` from shadcn-svelte's Sidebar)
anywhere in the app toggles collapse/expand state without needing focus on the toggle button.
- proven by: e2e sidebar-collapse-toggle scenario (keyboard event assertion) + Agent-Probe
  manual walkthrough (same known-gap as AC1).
- strategy: Hybrid

**AC6 — Mobile drawer behavior is unaffected.**
Below the 880px breakpoint, the hamburger-triggered off-canvas drawer opens/closes exactly as
it does today; no collapse/expand toggle appears at this width; the drawer still auto-closes
on destination select and sign-out.
- proven by: existing `e2e/mobile-nav.e2e.ts` spec (regression-checked, still self-skips per
  the same known-gap) + Agent-Probe manual walkthrough.
- strategy: Hybrid

**AC7 — Manager-only items respect role in both states.**
Reports and Team nav items appear only for manager-role users, identically in both collapsed
and expanded states.
- proven by: Agent-Probe manual walkthrough (role-gated visibility is already covered
  conceptually by existing `isManagerRole` unit coverage; the collapsed-state rendering itself
  is a visual check).
- strategy: Agent-Probe

**AC8 — No regression to existing nav functionality.**
Active-route highlighting, notification badges (overdue/unassigned counts), sign-out, and the
user footer continue to render and function correctly in both sidebar states.
- proven by: Agent-Probe manual walkthrough + existing unit/e2e coverage for the underlying
  nav-item data (`counts`, `isActive`) untouched by this change.
- strategy: Agent-Probe

## Out Of Scope

- Changing which pages/routes are reachable from the sidebar — no new nav items, no removed
  nav items, no reordering.
- Any change to the mobile off-canvas drawer's own trigger mechanism (hamburger button stays a
  hamburger button; it does not gain a collapse concept).
- Redesigning the visual theme/branding of the sidebar (colors, spacing values not required by
  the collapse behavior itself) — this is about adding collapse capability, not a nav redesign.
- Making other app chrome (topbar, page headers) collapsible or resizable.
- Multi-level/nested collapsible nav groups — the current flat Workspace/Manager grouping stays
  as-is.
- Per-user server-side persisted preference (e.g. a DB column) — session/browser-level
  persistence (cookie or localStorage, whichever the shadcn-svelte Sidebar primitive uses by
  default) is sufficient; this is not a "sync across devices" feature.
- Resolving the pre-existing shared Playwright auth-fixture gap — acceptance criteria route
  around it the same way every other feature in this repo currently does (Hybrid/Agent-Probe
  fallback); fixing that gap is tracked separately in
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- Full offcanvas (width-0) desktop collapse mode — explicitly rejected in favor of icon-only
  collapse (see Open Questions resolution below); if a future request wants that behavior it is
  a separate SPEC, not an amendment to this one.

## Constraints

- Must be built using the shadcn-svelte `Sidebar` component (`npx shadcn-svelte@latest add
  sidebar`), per the explicit instruction in GitHub issue #158. `components.json` is already
  configured to receive it (registry, base color, CSS-vars mode, `ui` alias all wired).
- Must use Svelte 5 runes only (`$state`, `$derived`, `$props`, `$bindable`) — no Svelte 4
  store syntax, matching the rest of the codebase including the current `AppSidebar.svelte`.
- Must preserve the existing 880px mobile breakpoint and the existing controlled-open Dialog
  convention (`bind:open`, zero `Dialog.Trigger` usage) for the mobile drawer — this repo-wide
  convention is a hard constraint on any nav-shell change, not just a preference.
- Must preserve every existing nav destination, manager-role gating (`isManagerRole`), active-
  route detection logic, and badge behavior exactly as implemented today.
- Must reconcile with the existing `--color-nav-*` / `--shadow-nav-*` design tokens in
  `src/lib/styles/tokens.css` (owned by the completed `sitewide-ux-refresh` Phase 1) — visual
  appearance in the expanded state must not regress.
- No schema, auth, or API changes are implied by this feature — it is a client-side
  presentation/state feature only.
- Collapse mode is **icon-only collapse** (shadcn-svelte's `collapsible="icon"` mode) — see
  Open Questions resolution below. Full width-0 offcanvas desktop collapse is explicitly out
  of scope.

## Open Questions

**Q1 (RESOLVED). What does "collapsible" mean for issue #158?**

Three plausible readings were surfaced during research:
- (a) **Icon-only collapse** (shadcn-svelte's standard `collapsible="icon"` mode) — sidebar
  shrinks to a narrow icon rail, labels appear on hover/focus.
- (b) Full offcanvas toggle on desktop too — sidebar disappears completely (width 0).
- (c) Something else.

**Resolution: (a) — icon-only collapse.** The user was asked to confirm via the Combined
Clarification Gate but did not respond within the session timeout. Per SPEC protocol, the
session proceeded with the recommended default rather than staying blocked indefinitely: (a)
is the out-of-the-box shadcn-svelte `Sidebar` behavior that the issue's explicit tool
instruction (`npx shadcn-svelte@latest add sidebar`) points at, and it's the standard pattern
for CRM-style nav shells. All User Stories, Behavioral Outcomes, the Flow Diagram, and every
Acceptance Criterion above were already written against this assumption during the initial
SPEC draft, so no other section required a content change to lock this in — only the
Constraints and Out Of Scope sections were updated to make the decision explicit and
unambiguous for downstream INNOVATE/PLAN work.

**Provenance note (not a full user confirmation):** This was resolved via unanswered-timeout
default, not explicit user sign-off. If the user later indicates they actually wanted (b) or
something else, this is a cheap, isolated revisit — the decision is now isolated to two spots
(a Constraints bullet and an Out Of Scope bullet) rather than scattered implicitly across the
document, precisely so it stays easy to correct without re-deriving the rest of the SPEC.

**Status:** Resolved (default-selected). No open questions remain.

## Background / Research Findings

- Current nav (`src/lib/components/layout/AppSidebar.svelte`, ~220 lines) is entirely
  hand-rolled: a fixed 236px desktop `<aside>` plus a bits-ui `Dialog`-based off-canvas mobile
  drawer below an 880px arbitrary-value breakpoint. It shares nav-item data (`work`/`manager`
  arrays) and a `railBody` snippet between both renders. None of shadcn-svelte's Sidebar
  scaffolding (`SidebarProvider`, cookie-persisted collapse state, `use-sidebar.svelte.ts`
  hook, `Cmd/Ctrl+B` shortcut) exists today.
- This nav shell was built in the completed `sitewide-ux-refresh_02-07-26` program (Phase 1,
  `phase-01-nav-shell`) — desktop-verified "by inspection" only (no automated test at the
  time); e2e verification is blocked repo-wide pending the shared Playwright auth fixture
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- Repo-wide convention: every bits-ui `Dialog` in this codebase is 100% controlled-open
  (`bind:open`, zero `Dialog.Trigger` usage) — the mobile drawer in `AppSidebar.svelte` follows
  this. shadcn-svelte's generated Sidebar mobile `Sheet` typically defaults to `Sheet.Trigger`
  usage, which would be a convention deviation; flagging this for INNOVATE to resolve (not a
  SPEC-level decision).
- `bits-ui@^2.18.1` (which shadcn's Sidebar is typically built on) and `Separator` are already
  installed. `components.json` is fully wired (registry `shadcn-svelte.com/registry`, base
  color `stone`, CSS-vars mode on, `ui` alias → `$lib/components/ui`, `hooks` alias →
  `$lib/hooks` even though that directory does not exist yet).
- `AppShell.svelte` currently owns `mobileNavOpen` state and passes it down as `bind:mobileOpen`
  to `AppSidebar`; it renders `AppSidebar` and `AppTopbar` as siblings inside a flex row.
- `src/lib/styles/tokens.css` carries the dark-espresso nav design tokens (`--color-nav-bg`,
  `--color-nav-fg`, `--color-nav-active-bg`, etc.) written during `sitewide-ux-refresh` Phase 1
  — the file's own comment marks this block "Phase 1 WRITE here; Phases 2-5 READ-ONLY", so this
  new feature will need to either extend that block or reconcile shadcn's own `--sidebar-*` CSS
  variable set against it (an INNOVATE/PLAN-level decision, not a SPEC-level one).
- Zero prior mentions of "collapsible sidebar" or issue #158 exist anywhere in `process/`
  (general-plans, all feature folders, ux-enhancement backlog) — this is fresh scope with no
  prior partial attempt to build on.
- The repo's e2e suite (`e2e/mobile-nav.e2e.ts` and others) universally self-skips against
  protected routes today due to the missing shared Playwright auth fixture — the same pattern
  will apply to any new `sidebar-collapse.e2e.ts` spec, so Acceptance Criteria above are written
  Hybrid/Agent-Probe rather than claiming a false Fully-Automated gate.
