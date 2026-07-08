---
name: plan:skeleton-mobile-fit-dashboard
description: "PLAN — fix mobile-broken skeleton loading components (GitHub #177) + add desktop/mobile /dashboard skeleton; desktop pixel-identical, Tailwind-only"
date: 07-07-26
feature: ux-enhancement
---

# PLAN: Skeleton Loading — Mobile Fit Fixes + New Dashboard Skeleton

**Complexity**: SIMPLE
**Date**: 07-07-26
**Status**: PLAN — active (VALIDATE pending)
**SPEC**: `process/general-plans/active/skeleton-mobile-fit-dashboard_07-07-26/skeleton-mobile-fit-dashboard_SPEC_07-07-26.md`
**INNOVATE**: skipped — mechanical "how"; all 3 decision points resolved in SPEC Constraints.
**Context loaded**: `process/context/all-context.md`, `process/context/tests/all-tests.md`.

## Overview

This is a SIMPLE, presentational-only plan. It fixes four existing loading skeletons that reuse a fixed desktop layout and render squished below the `lg` (1024px) breakpoint, and adds a net-new `/dashboard` loading skeleton. Every change is expressed with Tailwind `lg:`-prefix classes (or inert-`≥lg` wrappers) so desktop stays byte-identical. Being SIMPLE and single-session, this plan has no multi-phase split.

### Phase Completion Rules

Single-phase (SIMPLE). The one phase is complete only when: checklist steps 1–12 are done, `bun run check` exits 0, `git diff --stat` is confined to the 6 named files, and the Agent-Probe viewport walk (AC1–AC5, AC7–AC9) plus desktop before/after (AC6) is recorded. Code-only completion is `CODE DONE`; promotion to VERIFIED requires the recorded Agent-Probe visual outcome (no automated visual test exists). Do not mark `✅ VERIFIED` without the recorded probe result — user confirmation of the visual check stands in for the missing automated gate.

## TL;DR

Make four existing skeletons stack/scroll correctly below the `lg` (1024px) breakpoint and add a new `/dashboard` card-grid skeleton used in two places — all via Tailwind `lg:`-prefix classes so desktop rendering stays byte-identical. One new shared component (`DashboardCardGridSkeleton.svelte`), one prop added to `TableSkeleton`, edits confined to `src/lib/components/shared/skeletons/` plus the single `/dashboard` page. Verification is `bun run check` + git-diff-scope (Fully-Automated) plus manual viewport-resize (Agent-Probe) — no automated visual test exists (known test-infra gap).

## Goals

1. Below `lg`, RouteShells skeletons for `/leads` + `/unassigned` stack as single-column cards (mirror `DataGridShell` mobile shape). (AC1)
2. Below `lg`, RouteShells `/team` skeleton stays tabular but horizontally scrolls instead of squishing. (AC2)
3. Below `lg`, RouteShells `isCalendar` skeleton scrolls horizontally (mirror `CalendarGrid` wrapper). (AC3)
4. Below `lg`, `LeadRowSkeleton` stacks as a card. (AC4)
5. Below `lg`, `DashboardSectionSkeleton` avatar+pill row does not crowd. (AC5)
6. Desktop (≥`lg`) rendering of every touched skeleton is pixel-identical to today. (AC6)
7. New `DashboardCardGridSkeleton` — multi-column card grid on desktop, single column below `lg` — used in both the RouteShells `isDashboard` branch AND the page's inline `{#await}` block, replacing the wrong-shape table fallback and the "Loading dashboard…" text. (AC7, AC8, AC9)
8. No unrelated skeleton regressions. (AC10)

## Scope

**In scope (edit):**
- `src/lib/components/shared/skeletons/TableSkeleton.svelte` — add a `variant` prop (`'default' | 'stack' | 'scroll'`) driving mobile shape; desktop path untouched.
- `src/lib/components/shared/skeletons/RouteShells.svelte` — pass `variant` to the three `TableSkeleton` usages (/leads, /unassigned, /team), add scroll wrapper to `isCalendar` branch, add new `isDashboard` derived + branch, import new component.
- `src/lib/components/shared/skeletons/LeadRowSkeleton.svelte` — card-stack below `lg`.
- `src/lib/components/shared/skeletons/DashboardSectionSkeleton.svelte` — mobile-fit the row.
- `src/routes/dashboard/+page.svelte` — replace inline `{#await}` "Loading dashboard…" text with `<DashboardCardGridSkeleton />`.

**In scope (create):**
- `src/lib/components/shared/skeletons/DashboardCardGridSkeleton.svelte` — new shared component (one shape reused in both dashboard usage sites).

**Out of scope (do NOT touch — SPEC-locked):**
- `ui/skeleton/skeleton.svelte` base primitive.
- `DataGridShell.svelte`'s own inline skeleton (read-only reference for the card pattern).
- `DetailSkeleton`, `CardSkeleton`, and the RouteShells branches for Today / Pipeline / Reports / Templates / Meetings / MeetingDetail / LeadNew / LeadDetail.
- The generic `{:else}` fallback (`TableSkeleton rows=5 cols=4` at RouteShells L276–280) — leave default variant, unchanged.
- Any data-fetch / `navLoading` / loading-trigger logic; any JS media-query hook.

## Design Decisions (resolved, no creative choice left for EXECUTE)

**D1 — Breakpoint:** `lg:` (1024px) everywhere. Matches `DataGridShell` and `CalendarGrid` real-content precedent (SPEC Constraint).

**D2 — TableSkeleton split via one `variant` prop** (not two components):
- `variant='default'` (unchanged) — current `flex gap-4` rows. Used by the generic `{:else}` fallback only.
- `variant='stack'` — /leads + /unassigned. At `≥lg` renders byte-identical to `default`; `<lg` each row becomes a bordered single-column card. Mirrors the `DataGridShell` mobile pattern (real path `src/lib/components/leads/DataGridShell.svelte` — card chrome below `lg`, `lg:border-0 lg:rounded-none` reset above; VALIDATE-corrected from the earlier `shared/skeletons/` path, which does not exist).
- `variant='scroll'` — /team. Wraps the container in `overflow-x-auto`; inner gets `min-w-[720px] lg:min-w-0` so columns keep width and scroll `<lg`, and collapse to normal `≥lg` (no desktop change). Team real content is a genuine scrollable `<Table>`, so it stays tabular (SPEC Constraint — NOT converted to cards).

**D3 — Dashboard skeleton = one new shared component** (`DashboardCardGridSkeleton.svelte`), reused in both sites. Rationale: RouteShells branches already own bespoke per-branch markup, but the SPEC requires the *same shape* in two places (cross-route + same-route); a shared component is DRY and guarantees both sites can't drift. Consistent with the existing pattern of small shared skeleton primitives (`CardSkeleton`, `DashboardSectionSkeleton`, `LeadRowSkeleton`).

**D4 — Desktop-identical technique:** every mobile change is expressed as base (`<lg`) classes that are explicitly reset with `lg:` overrides back to the current values, OR as additive wrappers that are inert `≥lg` (`overflow-x-auto` + `lg:min-w-0`). Verified by diffing only classes that apply below `lg:`; never remove/alter existing `lg:`-and-above classes.

## Touchpoints

| File | Change | Desktop-safety |
|---|---|---|
| `src/lib/components/shared/skeletons/TableSkeleton.svelte` | Add `variant?: 'default'\|'stack'\|'scroll'` prop (default `'default'`). Wrap markup logic: `scroll` → `overflow-x-auto` outer + `min-w-[720px] lg:min-w-0` inner; `stack` → container borders become `lg:`-gated, each row `flex-col` + card chrome `<lg`, `lg:flex-row`/`lg:border-0` reset. `default` path emits today's exact markup. | `default` and `≥lg` output of `stack`/`scroll` unchanged. |
| `src/lib/components/shared/skeletons/RouteShells.svelte` | (a) `/leads` L97 → `<TableSkeleton rows={8} cols={5} variant="stack" />`; (b) `/unassigned` L115 → `variant="stack"`; (c) `/team` L155 → `variant="scroll"`; (d) `isCalendar` grid block (L253–274) → wrap current bordered container in `overflow-x-auto` + apply `min-w-[640px] sm:min-w-0` to the bordered container itself (mirroring `CalendarGrid.svelte:53–60`); (e) add `const isDashboard = $derived(pathname === '/dashboard')` + a new `{:else if isDashboard}` branch rendering PageHeader "Team dashboard" + `<DashboardCardGridSkeleton />`; (f) `import DashboardCardGridSkeleton from './DashboardCardGridSkeleton.svelte'`. | Fallback `{:else}` untouched; all other branches untouched; calendar bordered chrome (bugfix #3, already on disk) preserved. |
| `src/lib/components/shared/skeletons/LeadRowSkeleton.svelte` | Row: `flex items-center` → `flex-col items-start gap-2 ... lg:flex-row lg:items-center lg:gap-3`; trailing chips move below name stack `<lg`, reset to trailing `≥lg`. | `lg:` overrides restore current horizontal row exactly. |
| `src/lib/components/shared/skeletons/DashboardSectionSkeleton.svelte` | Inner row: allow avatar + text to keep row but let the trailing pill wrap/shrink `<lg` (`flex-wrap` or `lg:` trailing reset) so it doesn't crowd; identical `≥lg`. | `lg:` reset restores current row. |
| `src/lib/components/shared/skeletons/DashboardCardGridSkeleton.svelte` (NEW) | Outer `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` (matches `dashboard/+page.svelte:75`); each card: `rounded-[10px] border border-hairline bg-panel p-4` with a name+count line (`flex justify-between`), a `grid grid-cols-3 gap-2` stat row, and a `flex flex-wrap gap-1.5` chip row — mirroring the real card at `dashboard/+page.svelte:77–125`. Render ~6 placeholder cards. | New file — no desktop regression risk to existing surfaces. |
| `src/routes/dashboard/+page.svelte` | L64–65: replace `<p ...>Loading dashboard…</p>` inside `{#await data.dashboard}` with `<DashboardCardGridSkeleton />`; add import. `{:then}` / `{:catch}` unchanged. | Only the pending-state branch changes; resolved/error UI untouched. |

## Public Contracts

- `TableSkeleton` gains one optional prop `variant?: 'default' | 'stack' | 'scroll'` (default `'default'`). Backward-compatible: existing callers that omit it get today's behavior. No other prop or signature changes.
- `DashboardCardGridSkeleton` — new component, no required props (optional `cards?: number` default 6). Internal presentational only.
- No server, schema, API, auth, or data-flow contracts touched. Purely presentational Svelte.

## Blast Radius

- **Files:** 6 (5 edited + 1 new), all within `src/lib/components/shared/skeletons/` except one `/dashboard` page edit.
- **Packages:** 1 (single SvelteKit app).
- **Risk class:** LOW — presentational-only, no server code, no schema/auth/API/billing/migration surface. No high-risk class per `vc-test-coverage-plan` high-risk list.
- **Coordination — related active plan `skeleton-loading-templates-meetings-calendar_02-07-26`:** that plan (issue #132) also edits the RouteShells `isCalendar` branch. Its bugfix #3 bordered-grid structure is ALREADY on disk (VALIDATE-confirmed against live file: RouteShells L253–274 has `overflow-hidden rounded-control border border-hairline bg-panel` container + bordered `grid grid-cols-7` weekday header L255 + bordered day cells L265). This plan's calendar change is **additive and independent-of-outcome**: wrap the existing on-disk bordered container in `overflow-x-auto` + add `min-w-[640px] sm:min-w-0` to the bordered container. **Do NOT revert or alter the bordered chrome** — layer the scroll wrapper on top of current disk state. No sequencing block; if that plan re-EXECUTEs its `isCalendar` body afterward it must re-apply this scroll wrapper. Both plans otherwise touch disjoint branches.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 (svelte-check + tsc, incl. new `variant` prop union + new component) | Fully-Automated | AC6 (compile baseline), AC7–AC9 (new component compiles) |
| `git diff --stat` shows changes ONLY in the 6 named files (5 skeletons + dashboard page); no edits to `ui/skeleton/skeleton.svelte`, `DataGridShell`, `DetailSkeleton`, `CardSkeleton`, or Today/Pipeline/Reports/Templates/Meetings branches | Fully-Automated | AC10 (diff-scope) |
| Diff review: every mobile class is `<lg` base with a matching `lg:` reset, OR an inert-`≥lg` wrapper; no existing `lg:`-and-above class removed/changed | Fully-Automated (diff read) + Agent-Probe (visual) | AC6 (desktop pixel-identical) |
| Dev server, resize <1024px, nav to `/leads` + `/unassigned` → stacked single-column card skeleton | Agent-Probe | AC1 |
| Dev server, resize <1024px, nav to `/team` → skeleton horizontally scrolls, stays tabular (not cards) | Agent-Probe | AC2 |
| Dev server, resize <1024px, nav to `/calendar` → skeleton scrolls horizontally, bordered chrome intact | Agent-Probe | AC3 |
| Dev server, resize <1024px, Today page → `LeadRowSkeleton` stacks as card | Agent-Probe | AC4 |
| Dev server, resize <1024px, `/reminders` + `/notifications` → `DashboardSectionSkeleton` row not crowded | Agent-Probe | AC5 |
| Dev server (manager role), desktop width, load `/dashboard` → multi-column card-grid skeleton before data | Agent-Probe | AC7 |
| Dev server, resize <1024px, `/dashboard` → single-column card-stack skeleton | Agent-Probe | AC8 |
| Dev server: trigger cross-route nav to `/dashboard` (RouteShells isDashboard) AND same-route refetch (change date-range) → shaped skeleton in both, not table fallback or "Loading…" text | Agent-Probe | AC9 |
| Desktop side-by-side before/after each touched skeleton → visually identical | Agent-Probe | AC6 |

Note: AC1–AC5 and AC7–AC9 are proven by **Agent-Probe** (a valid proving strategy for visual/viewport behavior), not Known-Gap. The absence of an automated visual/component-render test is a test-infra residual (see below), not a proving gap for these criteria.

## Test Infra Improvement Notes

- No component-render/visual-regression harness exists for skeletons (pure-visual Svelte). Automated assertion of mobile-stack/scroll shape is a **Known-Gap residual** — recorded, not a proving strategy. Existing backlog: `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`.
- Viewport-resize e2e is additionally blocked by the repo-wide shared-Playwright-auth-fixture gap: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. No new test infra is built by this plan (SPEC out-of-scope). No new backlog stub required — both residuals already have backlog notes.

## Implementation Checklist

1. Add `variant?: 'default' | 'stack' | 'scroll'` prop (default `'default'`) to `src/lib/components/shared/skeletons/TableSkeleton.svelte`; implement `scroll` (overflow-x-auto outer + `min-w-[720px] lg:min-w-0` inner) and `stack` (`<lg` per-row card chrome with `lg:` reset to current `flex gap-4` rows, container borders `lg:`-gated), keeping `default` byte-identical to today.
2. In `RouteShells.svelte`, set `/leads` (L97) and `/unassigned` (L115) `TableSkeleton` to `variant="stack"`.
3. In `RouteShells.svelte`, set `/team` (L155) `TableSkeleton` to `variant="scroll"`.
4. In `RouteShells.svelte` `isCalendar` branch, wrap the existing on-disk bordered container (L253–274) with `overflow-x-auto` and add `min-w-[640px] sm:min-w-0` to the **bordered container itself** (the L253 `div`, inside the new wrapper) — NOT to just one of the two inner `grid grid-cols-7` blocks. The weekday-header grid (L255) and the day-cells grid (L265) must share one min-width so they scroll together and stay column-aligned. Preserve all bordered chrome.
5. Create `src/lib/components/shared/skeletons/DashboardCardGridSkeleton.svelte` mirroring the real `/dashboard` card grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`, per-card name+count line, `grid-cols-3` stat row, wrap-flex chip row; ~6 cards).
6. In `RouteShells.svelte`, import `DashboardCardGridSkeleton`, add `const isDashboard = $derived(pathname === '/dashboard')`, and add an `{:else if isDashboard}` branch (PageHeader "Team dashboard" + the component) placed before the generic `{:else}` fallback.
7. Edit `LeadRowSkeleton.svelte` to stack as a card `<lg` (`flex-col` + `lg:flex-row` reset), moving trailing chips below the name stack on mobile.
8. Edit `DashboardSectionSkeleton.svelte` inner row so the trailing pill wraps/shrinks `<lg` without crowding; `≥lg` identical.
9. In `src/routes/dashboard/+page.svelte`, import `DashboardCardGridSkeleton` and replace the `{#await data.dashboard}` "Loading dashboard…" `<p>` (L64–65) with `<DashboardCardGridSkeleton />`; leave `{:then}`/`{:catch}` unchanged.
10. Run `bun run check` — fix any type/svelte-check errors until it exits 0.
11. Run `git diff --stat` — confirm only the 6 named files changed; confirm no `lg:`-and-above class was removed/altered in any diff hunk.
12. Agent-Probe: dev server, resize below and above 1024px, walk AC1–AC5 + AC7–AC9, and desktop before/after for AC6.

## Test Procedure / Verification

Automated gates: `bun run check` (from `process/context/tests/all-tests.md` default verification order) and `git diff --stat` scope check. Manual gates: the Agent-Probe viewport walk in the Verification Evidence table (dev server resize above/below 1024px). No `bun run test:unit`/`test:e2e` gate applies — no unit-testable logic and e2e is auth-fixture-blocked (known gap).

## Acceptance Criteria

All ten SPEC criteria (AC1–AC10) are carried verbatim from the SPEC and mapped in the Verification Evidence table above. Each criterion names its proving gate and strategy there (REQ-TEST-LINK): AC1–AC5/AC7–AC9 → Agent-Probe; AC6 → Hybrid (`bun run check` + Agent-Probe); AC10 → Fully-Automated (git-diff-scope). Done = checklist 1–12 complete, `bun run check` green, diff-scope clean, and the Agent-Probe walk recorded.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/skeleton-mobile-fit-dashboard_07-07-26/skeleton-mobile-fit-dashboard_PLAN_07-07-26.md`
2. **Last completed step:** VALIDATE run (PASS contract written 07-07-26). Ready for EXECUTE.
3. **Validate-contract status:** written — Gate PASS (see `## Validate Contract` below).
4. **Supporting context loaded:** SPEC (same folder); `RouteShells.svelte`, `TableSkeleton.svelte`, `LeadRowSkeleton.svelte`, `DashboardSectionSkeleton.svelte`, `src/lib/components/leads/DataGridShell.svelte` (real path — card pattern reference), `CalendarGrid.svelte`, `dashboard/+page.svelte`; `process/context/all-context.md`; `process/context/tests/all-tests.md`; related plan `skeleton-loading-templates-meetings-calendar_02-07-26`.
5. **Next step for a fresh agent:** EXECUTE checklist 1–12 in order. Preserve the on-disk calendar bordered chrome; keep desktop (`≥lg`) byte-identical; edit only the 6 named files. Follow the two VALIDATE execute-agent instructions (E1 calendar min-w placement, E2 corrected DataGridShell reference path).

## Next Step

VALIDATE complete (Gate PASS). Say **ENTER EXECUTE MODE** to implement checklist 1–12.

## Validate Contract

Status: PASS
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 5+ files in blast radius); LOW band → sequential. Presentational-only, single package, no schema/API/auth surface; no coordination needed between edits. EXECUTE leg runs on opus (code execution); validate fan-out ran sequential Simple Mode.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC6 / AC7–AC9 (compile) | New `variant` prop union + new `DashboardCardGridSkeleton` compile clean; no type/svelte-check errors | Fully-Automated | `bun run check` exits 0 | A |
| AC10 (diff scope) | Only the 6 named files changed; no `lg:`-and-above class removed/altered; no edit to base primitive / DataGridShell / DetailSkeleton / CardSkeleton / untouched branches | Fully-Automated | `git diff --stat` confined to 6 files + per-hunk `lg:` class-preservation review | A |
| AC1 (leads/unassigned mobile stack) | `<lg` stacked single-column card skeleton on /leads + /unassigned | Agent-Probe | Dev server, resize <1024px, nav to /leads + /unassigned | A |
| AC2 (team mobile scroll) | `<lg` horizontal scroll, stays tabular (not cards) | Agent-Probe | Dev server, resize <1024px, nav to /team | A |
| AC3 (calendar mobile scroll) | `<lg` overflow-x scroll, bordered chrome intact | Agent-Probe | Dev server, resize <1024px, nav to /calendar | A |
| AC4 (Today lead-row stack) | `<lg` LeadRowSkeleton stacks as card | Agent-Probe | Dev server, resize <1024px, Today page | A |
| AC5 (reminders/notifications fit) | `<lg` DashboardSectionSkeleton row not crowded | Agent-Probe | Dev server, resize <1024px, /reminders + /notifications | A |
| AC7 (dashboard desktop grid) | Multi-column card-grid skeleton before data (manager role) | Agent-Probe | Dev server, manager role, desktop width, load /dashboard | A |
| AC8 (dashboard mobile stack) | `<lg` single-column card-stack skeleton | Agent-Probe | Dev server, resize <1024px, /dashboard | A |
| AC9 (both broken states replaced) | Shaped skeleton in RouteShells isDashboard branch AND inline `{#await}` (not table fallback / "Loading…" text) | Agent-Probe | Dev server, cross-route nav to /dashboard + same-route date-range refetch | A |
| Automated visual/component-render regression | Machine assertion of mobile stack/scroll shape | (residual — no proving strategy) | — | D |

gap-resolution legend: A — proven now (compile/diff pass this cycle; Agent-Probe walk executed at EXECUTE completion); B — fixed in this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy:` column carries ONLY proving strategies (Fully-Automated / Agent-Probe here). The final row is a Known-Gap named residual (gap-resolution D), NOT a strategy that proves a behavior. No developed behavior rests on Known-Gap alone — every AC is proven by Fully-Automated or Agent-Probe. Not vacuously green.

Legacy line form (retained so existing validate-contract consumers still parse):
- Compile baseline: Fully-automated: `bun run check` exits 0
- Diff scope: Fully-automated: `git diff --stat` confined to 6 named files + `lg:` class-preservation hunk review
- Mobile shapes (AC1–AC5, AC7–AC9): agent-probe: dev-server viewport-resize walk above/below 1024px
- Automated visual regression: known-gap: documented — no component-render harness (backlog note exists)

Dimension findings:
- Infra fit: PASS — Pure Svelte/Tailwind presentational; no container/port/runtime surface. All 5 edit-target files verified on disk; the 1 new file correctly absent. `bun run check` is the real gate command per tests context.
- Test coverage: PASS (with documented known-gap residual) — Fully-Automated gates (`bun run check` + `git diff --stat`) plus Agent-Probe for all visual ACs (a valid proving strategy). No automated visual/component-render harness is a named residual with existing backlog notes; excluded from CONCERN count. No developed behavior rests on Known-Gap alone.
- Breaking changes: PASS — `TableSkeleton.variant` is optional (default `'default'`), backward-compatible. All callers verified on disk: RouteShells L97/L115/L155 (receive variant), L279 else-fallback (stays default), `index.ts` barrel re-export (passes no props). No unlisted caller breaks. `DashboardCardGridSkeleton` is net-new, no consumers. No schema/API/auth/public contract touched.
- Security surface: PASS — No auth, billing, data, secrets, or trust-boundary surface. Pure presentational skeleton markup; no STRIDE/OWASP surface.
- Section A (TableSkeleton variant prop): PASS — Mechanically feasible; current props rows/cols/header, adding optional union is clean. Highest-risk edit: `stack` variant `lg:`-gating of container borders must reset byte-identical `≥lg`; mitigation: diff only `<lg` base classes.
- Section B (RouteShells wirings + calendar wrapper + isDashboard branch): PASS (was CONCERN, resolved in-plan) — All edit targets verified on disk (L97/L115/L155, calendar L253–274, else L279). Calendar has TWO `grid grid-cols-7` blocks; min-w placement clarified to the shared bordered container (checklist step 4 + E1) so header + cells scroll aligned. Calendar coordination with `skeleton-loading-templates-meetings-calendar_02-07-26` verified additive-compatible against live disk.
- Section C (LeadRowSkeleton card-stack): PASS — Standard `flex-col` ↔ `lg:flex-row` reset; feasible.
- Section D (DashboardSectionSkeleton mobile-fit): PASS — `flex-wrap` / `lg:` trailing reset; feasible.
- Section E (DashboardCardGridSkeleton NEW): PASS — Real card grid verified (dashboard L75–124); plan's mirror spec is accurate. New file, no regression risk.
- Section F (dashboard/+page.svelte await swap): PASS — L64–65 `Loading dashboard…` `<p>` verified; swap for component + import; `{:then}`/`{:catch}` untouched.

Execute-agent instructions:
- E1 — Calendar min-w placement: apply `min-w-[640px] sm:min-w-0` to the bordered container (RouteShells L253 `div`, inside the new `overflow-x-auto` wrapper), NOT to only one of the two inner `grid grid-cols-7` blocks. Both the weekday-header grid (L255) and day-cells grid (L265) must share one min-width so they scroll together and stay column-aligned. Preserve all bordered chrome; do not revert the on-disk bordered structure from the related calendar plan.
- E2 — DataGridShell reference path: the `stack` card-stack pattern precedent lives at `src/lib/components/leads/DataGridShell.svelte` (real `lg:border-0 lg:rounded-none` reset-above pattern), NOT the `shared/skeletons/DataGridShell.svelte` path cited in earlier plan text. Read the real file if mirroring exact classes; the pattern is also described inline in D2.
- E3 — Desktop-identical guard: for every `<lg` mobile class added, include a matching `lg:` reset (or use an inert-`≥lg` wrapper). Never remove or alter an existing `lg:`-and-above class. Verify via the AC6 diff-read gate before marking CODE DONE.

Open gaps:
- Automated visual/component-render regression test: known-gap: documented as backlog — see `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`. Not new; no new stub required.
- Viewport-resize e2e: known-gap: documented — blocked by shared-Playwright-auth-fixture gap, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Not new.

What this coverage does NOT prove:
- `bun run check` (compile gate): proves the `variant` union type + new component type-check and svelte-check clean. Does NOT prove any visual/layout outcome — a component can compile and still render the wrong mobile shape. Does NOT prove desktop pixel-identity.
- `git diff --stat` (diff-scope gate): proves only the 6 named files changed and no forbidden file was touched. Does NOT prove the changes are correct, that `lg:`-gating is complete, or that desktop is unchanged (the per-hunk `lg:` class-preservation read is a separate human/agent diff review, not asserted by `--stat`).
- Agent-Probe viewport walk (AC1–AC5, AC7–AC9, and AC6 visual half): proves the observed mobile stack/scroll shapes and desktop before/after equivalence AT THE TESTED VIEWPORTS AND ROUTES during the manual walk. Does NOT prove behavior at untested intermediate widths, does NOT prove no regression on future edits (no automated guard), and is not reproducible in CI (manual tier).

Failing stubs: none applicable. Both Fully-Automated rows are command-invocation gates (`bun run check`, `git diff --stat`), not unit-test `test(...)` scenarios — the plan has no unit-testable logic (presentational-only). Per `vc-test-coverage-plan`, red-first `test()` stubs apply only to unit-test-shaped Fully-automated rows; command gates and Agent-Probe/Known-Gap rows receive no stub.

Gate: PASS (no FAILs; 2 mechanical CONCERNs resolved via in-plan clarifications + execute-agent instructions E1/E2; test-infra known-gap is a documented residual excluded from the blocking count)
Accepted by: session (autonomous VALIDATE, orchestrator-delegated) — no CONDITIONAL concerns outstanding; both mechanical concerns resolved to PASS in-plan. Known-gap residuals (automated visual regression, viewport e2e) carried on record with existing backlog notes.

## Autonomous Goal Block

```
SESSION GOAL: Skeleton Loading — fix 4 mobile-broken skeletons + add /dashboard skeleton (GitHub #177), desktop pixel-identical, Tailwind-only
Charter + umbrella plan: N/A — single SIMPLE plan (no phase program)
Autonomy: standard EXECUTE gate applies — say ENTER EXECUTE MODE to implement. Under /goal: proceed autonomously; presentational LOW-risk, no irreversible/outward-facing actions.
Hard stop conditions / safety constraints:
- Desktop (≥lg / 1024px) rendering must stay byte-identical — never remove or alter an existing lg:-and-above class; every mobile change is a <lg base class with a matching lg: reset OR an inert-≥lg wrapper (AC6, hard non-negotiable).
- Edit ONLY the 6 named files (5 skeletons in src/lib/components/shared/skeletons/ + src/routes/dashboard/+page.svelte). Do NOT touch ui/skeleton/skeleton.svelte, DataGridShell, DetailSkeleton, CardSkeleton, or Today/Pipeline/Reports/Templates/Meetings branches (AC10).
- Preserve the on-disk calendar bordered chrome from the related skeleton-loading-templates-meetings-calendar plan — layer the scroll wrapper additively; do not revert L253–274.
Next phase: EXECUTE: process/general-plans/active/skeleton-mobile-fit-dashboard_07-07-26/skeleton-mobile-fit-dashboard_PLAN_07-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate PASS)
Execute start: fully-auto: `bun run check` (exit 0) + `git diff --stat` (6-file scope) | agent-probe: dev-server viewport-resize walk AC1–AC5/AC7–AC9 + desktop before/after AC6 | high-risk pack: no
Execute instructions: E1 calendar min-w on bordered container (both grids aligned); E2 DataGridShell real path src/lib/components/leads/DataGridShell.svelte; E3 lg:-reset every mobile class.
```
