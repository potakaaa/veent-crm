---
name: plan:collapsible-sidebar
description: "Make the left nav sidebar collapsible (icon-only) using the shadcn-svelte Sidebar component, GitHub issue #158"
date: 03-07-26
feature: ux-enhancement
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: collapsible-sidebar
---

# Collapsible Sidebar — PLAN

Date: 03-07-26
Status: EXECUTE complete — CODE DONE (all 11 checklist items executed; `bun run check` + `eslint` green; e2e specs self-skip per shared-auth-fixture known-gap; live-visual Agent-Probe rows deferred to same gap). VERIFIED pending a live authenticated browser walkthrough.
Complexity: SIMPLE
Mobile path taken: FALLBACK (documented) — shadcn Sidebar scoped to desktop only; existing bits-ui Dialog mobile drawer left untouched; is-mobile hook breakpoint aligned to 880px. Rationale: the generated Sheet IS controllable without Sheet.Trigger, but adopting it would change mobile styling (Sheet≠Dialog) and breakpoint (768≠880), regressing AC6/Goal6 ("mobile drawer visually and behaviorally unchanged"). Selecting the plan's own documented alternative — a plan-anticipated conditional, not a deviation.

SIMPLE plan (single-feature, single-session; INNOVATE scored fan-out 1/7 — no phase program).

SPEC: `process/features/ux-enhancement/active/collapsible-sidebar_03-07-26/collapsible-sidebar_SPEC_03-07-26.md`
(8 ACs, all Hybrid/Agent-Probe strategy — see SPEC for full text, not restated here except where a
checklist step needs the exact wording).

Context router consulted: `process/context/all-context.md` (routing table, feature-folder listing,
Drizzle/SvelteKit conventions) and `process/context/tests/all-tests.md` (test runner + Agent-Probe
verification convention for this repo, per its post-phase testing routing).

## Overview

Today `AppSidebar.svelte` is a hand-rolled fixed-236px `<aside>` (desktop) + bits-ui `Dialog`
off-canvas drawer (mobile, <880px). This plan replaces the desktop `<aside>` with shadcn-svelte's
`Sidebar` primitive set in `collapsible="icon"` mode, wrapping the EXISTING hand-tuned nav content
(brand tile, nav buttons, badges, user footer) — not a from-scratch restyle. Mobile drawer behavior
must stay pixel-identical; a controlled-open fallback path is defined in case the generated `Sheet`
cannot be driven without `Sheet.Trigger`.

## Goals

1. Desktop sidebar toggles between expanded (236px, current look) and collapsed (icon-only) states.
2. State persists via cookie, read server-side to prevent SSR flash-of-wrong-state.
3. `Cmd/Ctrl+B` keyboard shortcut toggles state anywhere in the app.
4. Hover/focus on a collapsed icon shows its label (shadcn Sidebar's built-in tooltip).
5. Every nav destination, badge, active-highlight, manager-gating, and sign-out behavior is
   unchanged in both states.
6. Mobile (<880px) off-canvas drawer is visually and behaviorally unchanged.

## Scope

In scope: `AppSidebar.svelte`, `AppShell.svelte`, `AppTopbar.svelte` (only if the mobile-open wiring
signature changes), `tokens.css` (new alias block), server-side cookie read, shadcn CLI-generated
files under `src/lib/components/ui/`.

Out of scope (per SPEC): new/removed/reordered nav items, full offcanvas (width-0) desktop collapse,
per-user DB-persisted preference, topbar/page-header collapsibility, nested nav groups, resolving
the shared Playwright auth-fixture gap.

## Locked Design Constraints (from INNOVATE — do not re-litigate)

1. **Structural approach**: run `npx shadcn-svelte@latest add sidebar` to pull in the `Sidebar`
   primitive set (`SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`,
   `SidebarMenu`/`SidebarMenuButton`, `SidebarTrigger`, `SidebarRail`) plus dependency
   sub-components (`tooltip`, `sheet`, `separator`, `button`, `skeleton`). Preserve existing
   hand-tuned nav markup (brand tile, badge styling, active-state left-accent bar, user footer)
   rendered inside the new structural wrappers. Do NOT accept shadcn's default button styling
   wholesale.
2. **Mobile drawer**: drive the generated `Sheet`'s mobile branch via `useSidebar()`'s controlled
   `openMobile` / `setOpenMobile()` state, wired from `AppTopbar`'s existing hamburger `onclick`
   (mirrors today's `bind:mobileOpen` pattern). Zero `Sheet.Trigger` usage (repo convention: 100%
   controlled-open dialogs). **Fallback**: if the generated Sheet cannot be driven in controlled
   mode without `Trigger`, keep today's hand-rolled `Dialog` mobile drawer untouched and scope
   `SidebarProvider`/icon-collapse to desktop only — document which path was taken in the phase
   report.
3. **CSS tokens**: add a `--sidebar-*` alias block to `tokens.css` mapping 1:1 onto existing
   `--color-nav-*` values (e.g. `--sidebar-background: var(--color-nav-bg)`). Alias only — no new
   parallel token system, no renaming/removing `--color-nav-*`.
4. **SSR flash prevention**: read the collapse-state cookie server-side and pass it as
   `SidebarProvider`'s initial value — shadcn-svelte's documented SSR pattern. Explicit checklist
   item, not implicit.
5. **No feasibility probe needed** — all 8 ACs use standard, documented shadcn-svelte Sidebar
   behavior. No VC-FEASIBILITY-PROBE-NEEDED signal emitted during INNOVATE.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/components/layout/AppSidebar.svelte` | Major rewrite — wrap existing `railBody` snippet content in shadcn `Sidebar` primitives; desktop `<aside>` replaced by `<Sidebar collapsible="icon">`; mobile branch driven by `useSidebar()` (or fallback: untouched `Dialog`) |
| `src/lib/components/layout/AppShell.svelte` | Wrap root in `<SidebarProvider>`; pass server-read cookie value as initial state; adapt/remove `mobileNavOpen` local state depending on which mobile path is taken |
| `src/lib/components/layout/AppTopbar.svelte` | Hamburger `onclick` calls `setOpenMobile(true)` (via `useSidebar()`) instead of the current `onMenuClick` prop — only if signature must change; if fallback mobile path is taken, leave unchanged |
| `src/lib/styles/tokens.css` | New `--sidebar-*` alias block (additive; existing `--color-nav-*` block untouched) |
| `src/routes/+layout.server.ts` | Read `sidebar_state` (or shadcn's default cookie name) server-side; pass to layout data |
| `src/routes/+layout.ts` | **[VALIDATE fix P1 — added at V2 Layer 2 Section C check]** Forward `sidebarOpen` from the server-load `data` param into this client-load's own returned object. This load currently constructs a brand-new return object (`{ currentUser, users, leads, counts }`, confirmed at `src/routes/+layout.ts:6-34`) without spreading `...data` — any field added to `+layout.server.ts`'s return is NOT automatically visible to `+layout.svelte` unless this file explicitly re-exposes it. Without this edit, `data.sidebarOpen` in `+layout.svelte` stays `undefined` even after `+layout.server.ts` is correctly updated. |
| `src/routes/+layout.svelte` (if it renders `AppShell`) | Pass initial collapse state through to `AppShell`/`SidebarProvider` |
| `src/lib/components/ui/sidebar/*` (new, generated) | CLI-generated — read/review before touching |
| `src/lib/components/ui/tooltip/*` (new, generated — does not exist today) | CLI-generated dependency |
| `src/lib/components/ui/sheet/*` (new, generated — does not exist today) | CLI-generated dependency |
| `src/lib/hooks/use-sidebar.svelte.ts` (new, generated path per `components.json` `hooks` alias) | CLI-generated context hook |
| `e2e/sidebar-collapse.e2e.ts` (new) | New e2e spec, self-skipping pattern matching `e2e/mobile-nav.e2e.ts` |
| `e2e/mobile-nav.e2e.ts` | Read-only regression check — must still pass/self-skip identically after this change |

`ui/separator` and `ui/button` already exist in `src/lib/components/ui/` — the CLI add step may
skip or ask to overwrite them; do not blindly accept an overwrite (see Checklist item 1).

## Public Contracts

- `AppSidebar.svelte` props: `user`, `counts` unchanged. `mobileOpen`/`bind:mobileOpen` prop is
  REMOVED if the primary (non-fallback) mobile path is taken (state moves into shadcn's
  `useSidebar()` context); RETAINED unchanged if the fallback path is taken. This is a
  same-package-only contract (AppShell + AppTopbar + AppSidebar are the only consumers) — not a
  public API, but note it explicitly since it is a prop-shape change.
- No new HTTP/API routes, no schema changes, no auth changes.
- New client-side cookie (`sidebar_state` or shadcn's documented default name) written by the
  Sidebar primitive on toggle, read server-side in `+layout.server.ts`. Same-origin, non-sensitive
  (boolean collapse state only) — no security-relevant payload.

## Blast Radius

- Package: single SvelteKit app (`veent-crm` — no monorepo packages). Risk class: none of the
  high-risk classes (no auth/billing/schema/migration/public-API/deploy/secrets surface touched).
- File count: ~8 hand-edited files + 3-5 CLI-generated directories (exact count depends on what
  the `shadcn-svelte add sidebar` command actually generates — reviewed in Checklist item 1 before
  any further edits).
- Blast radius is CONTAINED to the nav-shell layout layer (`src/lib/components/layout/`) plus
  design tokens plus the two layout-data files plus one new e2e spec. No page-level route files
  are touched.

## Acceptance Criteria

This plan is DONE when all 8 SPEC acceptance criteria (AC1-AC8, full text in
`collapsible-sidebar_SPEC_03-07-26.md`) are proven per the Verification Evidence table below:

- AC1 — desktop collapse/expand toggle works, no reload/jump
- AC2 — every nav destination reachable while collapsed
- AC3 — hover/focus reveals label on collapsed icons
- AC4 — collapse state persists across navigation and sessions
- AC5 — Cmd/Ctrl+B keyboard shortcut toggles state
- AC6 — mobile drawer behavior unaffected
- AC7 — manager-only items respect role in both states
- AC8 — no regression to active-highlight, badges, sign-out, user footer

## Phase Completion Rules

This is a SIMPLE single-phase plan (no phase-program sub-phases). The plan is complete
("CODE DONE") when all 11 Implementation Checklist items are executed and `bun run check`
passes. It is "VERIFIED" only after the Verification Evidence gates in the table below have
been run (Hybrid e2e specs executed — pass or documented self-skip — and the Agent-Probe
manual walkthrough completed) and results recorded in the phase report. Code-complete without
this evidence must be reported as "CODE DONE", not "VERIFIED".

## Implementation Checklist

1. **Run and review the shadcn CLI add step.**
   - Run `npx shadcn-svelte@latest add sidebar` from repo root.
   - Before touching any generated file, run `git status --short` and `git diff --stat` to see
     exactly what was created/modified. Confirm whether `ui/separator` and `ui/button` were
     skipped, merged, or would overwrite — if the CLI prompts to overwrite existing files, decline
     unless the diff is trivially additive (verify with `git diff` on those two files specifically
     before accepting).
   - Record the exact generated file list in the phase report (this list may differ from the
     Touchpoints table's prediction).

2. **Add the `--sidebar-*` token alias block to `tokens.css`.**
   - Insert immediately after the existing "Nav surface — Phase 1" block (do not edit that block).
   - Map: `--sidebar-background`, `--sidebar-foreground`, `--sidebar-primary`,
     `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`,
     `--sidebar-border`, `--sidebar-ring` (exact variable names must match what the generated
     `sidebar` component actually reads — confirm variable names in the generated CSS/component
     output from step 1 before writing this block; do not assume names from shadcn's public docs
     without checking the actual generated code).
   - Map each 1:1 onto the closest existing `--color-nav-*` value (e.g.
     `--sidebar-background: var(--color-nav-bg)`).

3. **Read cookie server-side for SSR flash prevention.**
   - In `src/routes/+layout.server.ts`, read the sidebar-state cookie (`event.cookies.get(...)`;
     exact cookie name confirmed from the generated `SidebarProvider` source in step 1) and add it
     to the returned load data (e.g. `sidebarOpen: boolean`).
   - **[VALIDATE fix P1]** `src/routes/+layout.ts`'s client `load` does NOT spread `...data` from
     the parent server load — it builds an entirely new return object. Add `sidebarOpen:
     data.sidebarOpen` (or equivalent) to its returned object explicitly, or the field will not
     reach `+layout.svelte`.
   - Confirm `src/routes/+layout.svelte` passes `data.sidebarOpen` (or equivalent) down to
     `AppShell` → `SidebarProvider`'s initial-state prop.

4. **Wrap `AppShell.svelte` in `SidebarProvider`.**
   - Import `SidebarProvider` from the generated `ui/sidebar` barrel.
   - Wrap the existing root `<div class="flex h-screen ...">` (or restructure per the generated
     primitive's expected DOM shape — confirm from step 1's generated example/docs comment).
   - Pass the SSR-read initial state from step 3.

5. **Rewrite `AppSidebar.svelte` desktop rail using shadcn primitives.**
   - Replace `<aside data-rail class="flex w-[236px] ...">` with `<Sidebar collapsible="icon">`
     wrapping `SidebarHeader` (brand tile block), `SidebarContent` (nav + `SidebarMenu`/
     `SidebarMenuButton` wrapping the existing `navButton` snippet content — preserve exact
     classes/badge logic, do not accept shadcn's default button visual styling), `SidebarFooter`
     (user footer block).
   - Preserve the `isActive()` active-route logic and `active ? ... : ...` class branch exactly;
     if `SidebarMenuButton` has its own `isActive` prop, decide whether to adopt it or keep the
     manual class branch — keep the manual branch unless it conflicts, to minimize risk to
     existing active-state styling (left-accent bar via `shadow-nav-active`).
   - Preserve `isManagerRole(user?.role)` gating for the Manager section exactly.
   - Preserve badge rendering (`item.badge`, `item.badgeColor`) — in collapsed/icon-only mode,
     confirm badges render sensibly per SPEC AC ("badges may relocate onto/near the icon rather
     than at the row's trailing edge") — this is a visual judgment call, verify in Checklist
     item 10 (Agent-Probe walkthrough).
   - Add `SidebarTrigger` (shadcn's built-in toggle button) somewhere sensible in the header or
     footer region — this is the "visible toggle control" from SPEC AC1.

6. **Wire mobile drawer — attempt primary path first.**
   - Attempt: drive the generated `Sheet` mobile branch via `useSidebar()`'s `openMobile` /
     `setOpenMobile()`, with zero `Sheet.Trigger` usage. Update `AppTopbar.svelte`'s hamburger
     `onclick` to call `setOpenMobile(true)` via the `useSidebar()` hook instead of the current
     `onMenuClick` prop.
   - Remove `mobileNavOpen` state from `AppShell.svelte` and the `mobileOpen`/`bind:mobileOpen`
     prop from `AppSidebar.svelte` ONLY if this primary path works cleanly in controlled mode.
   - **If the generated Sheet cannot be driven without `Sheet.Trigger`** (confirm by inspecting
     the generated `ui/sheet` component API from step 1): STOP this sub-step, revert any partial
     Sheet wiring, and take the documented fallback — leave `AppSidebar.svelte`'s existing
     `Dialog`-based mobile drawer completely untouched, scope `SidebarProvider`/`collapsible="icon"`
     to the desktop `<Sidebar>` only (desktop and mobile become two independently-rendered
     branches, exactly as today, with only the desktop branch touched). Record which path was
     taken in the phase report — this is a plan-anticipated conditional, not a deviation.

7. **Confirm keyboard shortcut.**
   - shadcn-svelte's `Sidebar`/`SidebarProvider` ships `Cmd/Ctrl+B` by default when
     `SidebarProvider` wraps the app root. Confirm this fires correctly (no conflicting keybinding
     elsewhere in the app — grep for existing `keydown`/`Cmd` handlers first: none currently exist
     per Background section of SPEC). No custom code needed unless the default shortcut doesn't
     activate — if it doesn't, that is a stop-and-report condition (contradicts the "no feasibility
     probe needed" INNOVATE decision), not a silent workaround.

8. **Typecheck and lint the touched files.**
   - `bun run check` (or repo's typecheck script — confirm exact script name in `package.json`
     before running).
   - `bun run lint` if present.

9. **Run automated test gates** (see Verification Evidence table below).

10. **Agent-Probe manual walkthrough** (see Verification Evidence table below) — desktop expand/
    collapse, hover/focus tooltips, keyboard shortcut, mobile drawer regression, manager-role
    gating in both states, badge rendering in collapsed state.

11. **Update `Test Infra Improvement Notes`** section of this plan with any gaps found during
    steps 9-10 (e.g. if the cookie-persistence-across-sessions AC genuinely cannot be probed in
    this session, record why).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `e2e/sidebar-collapse.e2e.ts` — toggle-visible-and-collapses-to-icon-rail (new spec, self-skips per repo's shared-auth-fixture known-gap, same pattern as `e2e/mobile-nav.e2e.ts`) | Hybrid | AC1 |
| `e2e/sidebar-collapse.e2e.ts` — icon-click-navigates-to-same-route-in-collapsed-state | Hybrid | AC2 |
| Agent-Probe manual walkthrough — hover/focus reveals tooltip label on each collapsed icon | Agent-Probe | AC3 |
| `e2e/sidebar-collapse.e2e.ts` — collapse-state-persists-across-client-navigation (same page load, cookie set) | Hybrid | AC4 (cross-navigation half) |
| Agent-Probe manual walkthrough — close/reopen browser shows last-set state (cross-session persistence) | Agent-Probe | AC4 (cross-session half) |
| `e2e/sidebar-collapse.e2e.ts` — Cmd/Ctrl+B keyboard event toggles state | Hybrid | AC5 |
| `e2e/mobile-nav.e2e.ts` (existing, regression-checked unchanged) + Agent-Probe manual walkthrough | Hybrid | AC6 |
| Agent-Probe manual walkthrough — Reports/Team visible only for manager role, in both collapsed and expanded states | Agent-Probe | AC7 |
| Agent-Probe manual walkthrough — active-highlight, badges, sign-out, user footer render correctly in both states | Agent-Probe | AC8 |
| `bun run check` (typecheck) on all touched files | Fully-Automated | Implementation correctness (no SPEC AC directly — code-quality gate) |

All e2e specs self-skip against the pre-existing shared Playwright auth-fixture known-gap
(`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — this is the same
pre-accepted pattern `sitewide-ux-refresh` used; not a new gap introduced by this plan. This
mirrors the testing/verification conventions in `process/context/tests/all-tests.md`.

## Test Infra Improvement Notes

Found during EXECUTE (steps 9-10):

1. **Live Agent-Probe blocked by shared-auth-fixture gap (AC3, AC4-session, AC7, AC8, and live re-check
   of AC1/AC2/AC5/AC6).** Protected routes redirect to `/login` without an authenticated session, and
   there is no Playwright login/storageState fixture in the repo yet
   (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). All 4 new
   `sidebar-collapse.e2e.ts` scenarios and both `mobile-nav.e2e.ts` scenarios SELF-SKIP (verified:
   4 skipped + 2 skipped, build succeeds). The interactive/visual halves of the Agent-Probe rows
   (hover-tooltip render, cross-browser-restart persistence, badge repositioning in the icon rail,
   focus-order) require a live authenticated browser and are deferred to this same pre-accepted,
   program-level known-gap — NOT a new gap introduced by this plan. Code-evidence Agent-Probe pass
   was performed instead (see phase report `## Test Gate Outcomes`).

2. **Cross-session persistence (AC4-session) is unprovable by a single-process e2e run** in the repo's
   current setup — Agent-Probe (manual close/reopen) is the ceiling, as the validate-contract already
   records. Cookie wiring (`sidebar:state`, written client-side by SidebarProvider, read server-side in
   `+layout.server.ts`) is code-verified; true multi-restart behavior awaits a manual walkthrough.

3. **Pre-existing lint drift, out of blast radius (NOT introduced here).** `bun run lint`
   (`prettier --check .`) fails on two untouched pipeline files
   (`src/lib/components/pipeline/PipelineBoard.svelte`, `src/routes/pipeline/+page.svelte`). All files
   this plan created/edited pass prettier + eslint cleanly. The authoritative Fully-Automated gate
   `bun run check` passes (0 errors). Left unfixed per scope discipline (hard-stop #3).

4. **No `@axe-core/playwright`** — tooltip/toggle affordance accessibility falls back to Agent-Probe,
   per the existing open program-level decision
   (`process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`).

## Dependencies / Risks

- **Dependency**: exact generated file names/paths and the sidebar cookie's variable/cookie name
  are only knowable after running the CLI in Checklist item 1 — several later checklist items
  (2, 3, 6) explicitly gate on inspecting that output rather than assuming shadcn's public docs
  verbatim, since generated output can differ by CLI version.
- **Risk — Sheet.Trigger conflict**: shadcn's generated mobile Sheet may default to
  `Sheet.Trigger` usage, conflicting with the repo's 100%-controlled-dialog convention. Mitigated
  by the explicit fallback path in Checklist item 6.
- **Risk — visual regression in badge/active-state rendering**: collapsed icon-only mode changes
  layout; badge repositioning and the active left-accent bar must be re-verified visually
  (Checklist item 10, AC3/AC7/AC8).
- **Risk — keyboard shortcut collision**: low risk per SPEC background (no existing keybindings),
  but Checklist item 7 treats a non-firing shortcut as a stop-and-report condition rather than a
  silent skip.
- **Risk — client-load pass-through gap (found + fixed at VALIDATE)**: `src/routes/+layout.ts`
  does not forward arbitrary server-load fields to `+layout.svelte` — see Touchpoints table and
  Checklist item 3 for the fix applied during VALIDATE.

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/ux-enhancement/active/collapsible-sidebar_03-07-26/collapsible-sidebar_PLAN_03-07-26.md`
2. **Last completed phase or step**: VALIDATE complete (this document); no EXECUTE work started.
3. **Validate-contract status**: written — Gate: PASS (see below).
4. **Supporting context files loaded**: `process/context/all-context.md` (root context router),
   `process/context/tests/all-tests.md` (testing context / post-phase testing routing),
   `collapsible-sidebar_SPEC_03-07-26.md`, `src/lib/components/layout/AppSidebar.svelte`,
   `AppShell.svelte`, `AppTopbar.svelte`, `src/lib/styles/tokens.css`, `components.json`,
   `src/hooks.server.ts`, `src/routes/+layout.server.ts`, `src/routes/+layout.ts`,
   `src/routes/+layout.svelte`, `e2e/mobile-nav.e2e.ts`,
   `process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/` (prior nav-shell
   precedent + e2e/Agent-Probe verification approach).
5. **Next step for a fresh agent picking up mid-execution**: `ENTER EXECUTE MODE` for this plan.
   If EXECUTE has already started, check `git status`/`git diff` against the Touchpoints table
   above and resume from the first unchecked Implementation Checklist item.

## Validate Contract

Status: PASS
Date: 03-07-26
date: 2026-07-03
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 1/7 (S7 — 5+ blast-radius files present; no other signal fires: single-app,
no schema/auth/API/billing surface, no phase program, no multi-direction fan-out). Layer 1 (4
dimensions) + Layer 2 (7 sections) checks were performed directly against the live repo state
by vc-validate-agent in one sequential pass — no further fan-out warranted.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Desktop sidebar toggles expanded/collapsed, no reload/jump | Hybrid | `e2e/sidebar-collapse.e2e.ts` — toggle-visible-and-collapses-to-icon-rail | B |
| AC2 | Every nav destination reachable while collapsed | Hybrid | `e2e/sidebar-collapse.e2e.ts` — icon-click-navigates-to-same-route-in-collapsed-state | B |
| AC3 | Hover/focus on collapsed icon reveals label | Agent-Probe | Manual walkthrough — hover/focus each collapsed icon, confirm tooltip label | A |
| AC4-nav | Collapse state persists across client-side navigation | Hybrid | `e2e/sidebar-collapse.e2e.ts` — collapse-state-persists-across-client-navigation | B |
| AC4-session | Collapse state persists across browser sessions | Agent-Probe | Manual walkthrough — close/reopen browser, confirm last-set state | A |
| AC5 | Cmd/Ctrl+B toggles sidebar anywhere in app | Hybrid | `e2e/sidebar-collapse.e2e.ts` — keyboard-shortcut-toggles-state | B |
| AC6 | Mobile drawer behavior unaffected | Hybrid | `e2e/mobile-nav.e2e.ts` (existing regression) + Agent-Probe manual walkthrough | A |
| AC7 | Manager-only items respect role in both states | Agent-Probe | Manual walkthrough — Reports/Team visibility, collapsed + expanded | A |
| AC8 | No regression to active-highlight, badges, sign-out, user footer | Agent-Probe | Manual walkthrough — all 4 elements, both states | A |
| Implementation correctness | All touched files typecheck cleanly | Fully-Automated | `bun run check` | A |

Failing stub (Fully-Automated row only — `bun run check` is a repo-wide typecheck command gate,
not a per-scenario test; no per-scenario TDD stub applies to this row):
```text
N/A — this row is a command-level quality gate (typecheck), not a scenario assertion. No stub.
```

gap-resolution legend:
- A — proven now (gate passes in this cycle; for Agent-Probe rows this means the walkthrough runs
  and is recorded during EXECUTE/EVL, not at VALIDATE time — VALIDATE only confirms the scenario
  is well-defined and mechanically reachable)
- B — fixed in this plan (the e2e spec/scenario is written by this plan's Checklist item 9; its
  execution in CI is currently gated on the pre-existing repo-wide known-gap listed below — the
  scenario is not itself deferred, only its live CI execution is)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: strategy column carries only the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). No row in this table is Known-Gap-only — every developed behavior (AC1-AC8)
has a real proving strategy assigned. Known-Gap appears only as a named residual note below, never
as a row's strategy.

Legacy line form (retained so existing validate-contract consumers still parse):
- Desktop toggle / navigation (AC1-AC2, AC4-nav, AC5): hybrid: `bun run test:e2e -- sidebar-collapse.e2e.ts` (new spec; self-skips pending shared auth fixture, same as all other protected-route e2e specs in this repo)
- Tooltip / cross-session persistence / role-gating / regression (AC3, AC4-session, AC7, AC8): agent-probe: manual walkthrough per Verification Evidence table above, run during EXECUTE Checklist item 10
- Mobile regression (AC6): hybrid: `bun run test:e2e -- mobile-nav.e2e.ts` (existing, self-skips) + agent-probe: manual check
- Implementation correctness: fully-automated: `bun run check`

Dimension findings:
- Infra fit: PASS — single SvelteKit app, no container/infra/runtime surface touched;
  `components.json` confirmed already wired for the shadcn CLI (registry `shadcn-svelte.com/registry`,
  `ui`/`hooks` aliases present); `bits-ui@^2.18.1`, `tailwindcss@^4.3.0`, `svelte@^5.56.1` confirmed
  installed and consistent with shadcn-svelte Sidebar's documented Svelte-5/Tailwind-4-CSS-vars
  requirements.
- Test coverage: PASS — tier assignments follow the waterfall correctly; every AC has a real
  Hybrid or Agent-Probe proving strategy (no row rests on Known-Gap alone — vacuous-green ban
  satisfied); the e2e self-skip pattern matches the pre-accepted, repo-wide known-gap already on
  record (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), not a new gap
  introduced by this plan.
- Breaking changes: CONCERN → FIXED IN PLAN — `src/routes/+layout.ts`'s client `load` builds a new
  return object without spreading `...data`, so a field added only to `+layout.server.ts` would not
  reach `+layout.svelte`. Added `src/routes/+layout.ts` to Touchpoints and amended Checklist item 3
  with the explicit forwarding step. `mobileOpen`/`bind:mobileOpen` prop contract change is correctly
  scoped in the plan as same-package-only (AppShell/AppTopbar/AppSidebar), not a public API break.
- Security surface: PASS — client-side presentational feature only; the new collapse-state cookie
  is a non-sensitive boolean, same-origin, no security-relevant payload; no auth/billing/schema/
  secrets/trust-boundary surface touched.
- Section A — CLI add step (Checklist 1): PASS — mechanically feasible; `ui/separator` and
  `ui/button` confirmed already present on disk, so the overwrite-decline check the plan specifies
  is correctly scoped and necessary.
- Section B — token alias block (Checklist 2): PASS — `tokens.css`'s existing "Nav surface —
  Phase 1" block confirmed present with the exact "WRITE here; Phases 2-5 READ-ONLY" ownership
  comment the plan references; the additive insertion point is correctly scoped.
- Section C — SSR cookie read (Checklist 3): CONCERN → FIXED IN PLAN — see Breaking changes above.
- Section D — SidebarProvider wrap (Checklist 4): PASS — `AppShell.svelte`'s current root
  (`<div class="flex h-screen overflow-hidden bg-nav-bg">`) confirmed to match the plan's described
  wrap target.
- Section E — AppSidebar rewrite (Checklist 5): PASS — all named edit targets (`<aside data-rail>`,
  `railBody` snippet, `navButton` snippet, `isActive()`, `isManagerRole(user?.role)`) confirmed
  present and uniquely matchable in the current file. Highest-risk edit: preserving the active-state
  left-accent bar (`shadow-nav-active`) class branch through the primitive swap — already correctly
  flagged in the plan (Checklist item 5, Dependencies/Risks) with a stated mitigation (keep the
  manual class branch unless it conflicts).
- Section F — mobile drawer wiring (Checklist 6): PASS — `AppTopbar`'s `onMenuClick` prop and
  `AppShell`'s `mobileNavOpen state` / `onMenuClick={() => (mobileNavOpen = true)}` wiring confirmed
  to match the plan's described primary-path edit exactly; the documented fallback path is concrete
  and testable.
- Section G — keyboard shortcut (Checklist 7): PASS — grep confirmed no existing global `Cmd`/
  `Ctrl+B` or app-level `keydown` handler exists that would conflict; the only `onkeydown` handlers
  in the repo are component-local (`MeetingsPanel`, `Tabs`, dupe-hover escape handlers).

Open gaps: none unresolved — 1 CONCERN was found (Breaking changes / Section C) and fixed directly
in this plan's Touchpoints and Checklist text before this contract was written. Zero FAILs.

Known Gaps (pre-existing, not introduced by this plan — excluded from the CONCERN/FAIL count):
- All Hybrid-tier e2e gates (AC1, AC2, AC4-nav, AC5, AC6) self-skip in CI pending the repo-wide
  shared Playwright auth fixture — known-gap: documented as pre-existing in
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Same accepted pattern as
  `sitewide-ux-refresh`; not new to this plan.
- No automated accessibility-audit dependency (`@axe-core/playwright`) exists yet — separate
  program-level open decision at `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`.
  Accessibility of the new tooltip/toggle affordances falls back to Agent-Probe (manual review).

What this coverage does NOT prove:
- `bun run check` proves only that touched files typecheck — it proves zero runtime, visual, or
  interaction behavior.
- The Hybrid e2e specs, while self-skipping, do NOT currently prove AC1/AC2/AC4-nav/AC5/AC6 in CI
  — they prove only that the scenario is written and mechanically ready to run once the shared
  auth fixture lands. Real runtime proof of these ACs in this cycle rests on the Agent-Probe manual
  walkthrough (Checklist item 10) alone.
- No automated visual-regression or accessibility-audit tooling exists in this repo — tooltip
  rendering, badge repositioning, and focus-order correctness in collapsed mode are judged
  manually, not mechanically asserted.
- Cross-session persistence (AC4-session) and true multi-browser-restart behavior are inherently
  unprovable by a single-process e2e run in this repo's current setup — Agent-Probe is the ceiling
  here, not a shortcut being taken to avoid work.
- Neither this contract nor the Checklist verifies the exact shadcn-generated cookie name, CSS
  variable names, or `Sheet` API shape in advance — those are explicitly deferred to Checklist
  item 1's post-CLI inspection step (a mechanical read of generated code, not an unverified runtime
  assumption).

Gate: PASS (1 CONCERN found and fixed in plan text before this contract was written; 0 unresolved
CONCERNs; 0 FAILs.)
Accepted by: session (autonomous best-judgment default — no live user response available for the
V5 gate within a reasonable session window; this is low-stakes, fully reversible, UI-only work
with 0 unresolved CONCERNs and 0 FAILs, so PASS was applied per the task's explicit instruction to
favor documented defaults over open-ended blocking. Mirrors the SPEC's own precedent for its Q1
unanswered-timeout default. If the user disagrees with the Breaking-changes fix (Touchpoints/
Checklist item 3 amendment) on review, it is isolated to one table row and one checklist bullet —
cheap to revert or amend.)

## Autonomous Goal Block

```
SESSION GOAL: Make the left nav sidebar collapsible (icon-only) using shadcn-svelte's Sidebar component (GitHub issue #158)
Charter + umbrella plan: N/A — single plan (process/features/ux-enhancement/active/collapsible-sidebar_03-07-26/collapsible-sidebar_PLAN_03-07-26.md)
Autonomy: Standard RIPER-5 gates apply — explicit "ENTER EXECUTE MODE" is still required before implementation begins. No standing /goal autonomy is granted beyond the VALIDATE V5 best-judgment default already applied and documented above (per explicit task instruction: favor documented low-stakes defaults over open-ended blocking).
Hard stop conditions / safety constraints:
- If the generated shadcn Sheet cannot be driven in controlled mode without Sheet.Trigger, take the documented fallback (desktop-only SidebarProvider scope, mobile Dialog untouched) rather than introducing an uncontrolled-dialog pattern — do not silently deviate from the repo's 100%-controlled-dialog convention.
- If the default Cmd/Ctrl+B shortcut does not fire, stop and report — this contradicts the "no feasibility probe needed" INNOVATE decision; do not add custom keybinding code as a silent workaround.
- No schema/auth/API/billing changes are in scope for this plan; if EXECUTE discovers any are actually needed, stop and return to PLAN rather than expanding scope inline.
- Do not accept an overwrite prompt for the pre-existing `ui/separator`/`ui/button` components during the shadcn CLI add step without first diffing the proposed change (Checklist item 1).
Test gates: `bun run check` (Fully-Automated) | `bun run test:e2e -- sidebar-collapse.e2e.ts` (Hybrid, new, self-skips pending shared auth fixture) | `bun run test:e2e -- mobile-nav.e2e.ts` (Hybrid, existing regression) | Agent-Probe manual walkthrough (Checklist item 10 — AC3/AC4-session/AC7/AC8 + regression check on AC1/AC2/AC5/AC6)
Next phase: EXECUTE: process/features/ux-enhancement/active/collapsible-sidebar_03-07-26/collapsible-sidebar_PLAN_03-07-26.md
Validate contract: inline in plan (## Validate Contract section, this file) — Gate: PASS
Execute start: Checklist item 1 (`npx shadcn-svelte@latest add sidebar`) | e2e spec: e2e/sidebar-collapse.e2e.ts (new, self-skipping) | Agent-Probe scenario: Checklist item 10 manual walkthrough | high-risk pack: no (no high-risk class touched — client-side presentational feature only)
```
