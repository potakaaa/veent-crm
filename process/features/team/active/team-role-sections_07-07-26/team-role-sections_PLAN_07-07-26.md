---
name: plan:team-role-sections
description: "Restructure /team flat roster table into 3 stacked role-section mini tables (Super Manager / Managers / Reps), presentation-layer only"
date: 07-07-26
feature: team
---

# /team Role-Sections Restructure — PLAN (07-07-26)

Date: 07-07-26
Status: PLANNED (not yet user-confirmed VERIFIED)
Complexity: Simple

## Overview

`/team` currently renders one flat, paginated `Table` of all `crmUsers`, sorted with `active DESC,
name ASC` server-side. This plan restructures it into three always-visible, stacked mini
sections — **Super Manager → Managers → Reps** — each with its own section header (colored
accent dot + title + row-count badge, mirroring the `/reminders` section-header pattern) and its
own small `Table` inside a `Card`. Pagination is dropped entirely (team rosters are small; no
`LIMIT`/`OFFSET` needed). This is presentation-layer only: no schema change, no new endpoint, no
new permission logic. All existing interactive affordances (edit name, promote, demote, promote to
super manager, deactivate/reactivate, add rep/manager) are preserved with identical gating, just
redistributed across the 3 section tables.

## Design Decisions (from INNOVATE — locked, not re-derived here)

1. **Layout**: 3 stacked sections, vertical order Super Manager → Managers → Reps. Each section =
   header (colored dot + `font-serif text-[15px] font-semibold` title + count badge
   `rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px] text-ink-300`, mirroring
   `/reminders` `+page.svelte` lines ~192-201) + its own mini `Table` inside a `Card`.
2. **Fetch/pagination model**: drop server-side pagination entirely. `+page.server.ts` fetches ALL
   `crmUsers` rows (no `LIMIT`/`OFFSET`, no `count()` query, no `pagination` object in load return).
   Grouping into 3 arrays happens server-side in the load function (natural extension of the
   existing `.map(dbUserToUser)` pass) — returns `{ superManager: User[], managers: User[], reps: User[] }`.
3. **Empty sections**: all 3 sections always render, never hidden, even at 0 rows.
   - Managers/Reps at 0 rows → single compact inline muted `TableRow` spanning all columns
     ("No managers yet" / "No reps yet"), NOT the full `EmptyState.svelte` component.
   - Super Manager at 0 rows → distinct, slightly more prominent empty-state line: "No Super
     Manager assigned — promote a manager below." Informational only — no new CTA button; the
     promote action stays on the Manager section's existing crown-icon per-row button.
4. **Search/filter**: explicitly OUT OF SCOPE (see Out of Scope below).
5. **Sort mechanism**: reuse existing `makeSortTable` (`src/lib/utils/tableSort.ts`) — 3 separate
   instantiations, one per section's row array. Column defs per section drop `role` (redundant —
   section IS the role) but keep `name`/`email`/`active`/`_leads`/`_actions`. Sort state is local
   per-section `$state` (no URL persistence needed for 3 sort states — simplification accepted;
   this repo's existing URL-driven single-table sort pattern does not need to be replicated 3x for
   small role-partitioned lists).
6. **Super Manager section chrome**: keep `makeSortTable` instantiation for consistency even though
   sorting is moot at 0-1 rows. No search box, no pagination. Visually distinct via existing crown
   icon (`Icon name="crown"`) and existing purple accent used for the `super_manager` role Badge
   (`color:#7c3aed;background:#f3effe`) reused as the section header's dot/accent color.
7. **Hard carry-over constraint (DO NOT VIOLATE)** — every existing interactive affordance and its
   EXACT permission gating is preserved, just redistributed:
   - Edit name (icon button) — `canManage`, every row in every section.
   - Promote to Manager (arrow-up) — `isSuper` only, Reps section rows only.
   - Demote to Rep (arrow-down) — `isSuper` only, Managers section rows only.
   - Promote to Super Manager (crown) — `canPromote` (=isSuper), Managers section rows only, `u.active` only.
   - Deactivate/Reactivate — Reps section: `canManage`. Managers/Super-Manager sections: `isSuper && !isSelf`.
   - Add rep/manager modal — unchanged, stays global in `PageHeader` actions.
   - All 4 existing modals (add-user, confirm-role-change, promote-to-super, edit-name) unchanged in
     behavior — only which section's row triggers them differs.
   - No new role/status editing surface. No touching `/api/users/*`, `permissions.ts`, `users.ts`.
     Does not reopen the super_manager-only role-change model (locked per
     `super-manager-role_02-07-26` SPEC) or the name-only Edit modal constraint (locked per
     `team-member-profile-edit_07-07-26` plan, EXECUTEd on this branch).
8. **Responsive**: reuse the existing `overflow-x-auto` wrapper precedent (Pipeline/Calendar,
   `sitewide-ux-refresh` Phase 3) per section table if overflow risk exists on narrow viewports. No
   new table-to-card mobile-stack pattern (no precedent in this codebase).
9. **Design tokens**: reuse `.focus-ring:focus-visible`, `--shadow-frame`/`--shadow-raised`/
   `--shadow-pop`, `--radius-control`, `--color-panel-subtle`/`--color-panel-sunken`/
   `--color-hairline` — all already in use on this page or `/reminders`. No new `--color-nav-*`
   token consumption.
10. **No new shared components** — compose from existing `Card`/`Table`/`Badge`/`makeSortTable`/
    inline conditionals. No new stat-tile component. No `EmptyState.svelte` reuse (per #3).

## Scope

- Restructure `/team` roster display into 3 stacked role-section mini tables.
- Remove server-side pagination (all rows fetched, grouped by role in the load function).
- Preserve all existing action buttons, gating logic, and modals exactly, only redistributing which
  section's rows trigger them.
- Add per-section empty-state handling (2 variants: compact inline row for Managers/Reps, more
  prominent single line for Super Manager).
- Visual polish: section header pattern mirroring `/reminders`, purple crown accent for Super
  Manager section.

## Out of Scope

- **Search/filter** (per-section or global) — explicitly deferred. No search box, no filter UI
  added in this plan.
- **Any new pagination mechanism** — this plan permanently removes pagination for `/team`; no
  future "load more" or infinite-scroll pattern is introduced here.
- **New shared components** — no new stat-tile, no `EmptyState.svelte` reuse for the compact
  empty-row cases, no generalized "SectionedTable" abstraction (only 1 page uses this pattern
  today; extracting a shared component is premature).
- **Any schema, endpoint, or permission change** — `/api/users/*`, `permissions.ts`, `roles.ts`,
  and the DB schema are untouched.
- **Mobile card-stack table pattern** — no new responsive table-to-card transform; only the
  existing `overflow-x-auto` precedent is reused if needed.
- **Role-change model or name-only Edit modal redesign** — both are locked by prior
  SPEC/PLAN decisions (`super-manager-role_02-07-26`, `team-member-profile-edit_07-07-26`) and are
  not reopened here.

## Functional Requirements

FR1. `/team` loads ALL `crmUsers` rows (no `LIMIT`/`OFFSET`), still ordered `active DESC, name ASC`
     (or equivalent) as the base ordering before role-partitioning.
FR2. Load function returns 3 grouped arrays: `superManager: User[]` (0 or 1 row), `managers:
     User[]`, `reps: User[]` — partition is server-side.
FR3. `+page.svelte` renders 3 stacked sections in fixed order: Super Manager, Managers, Reps.
     Each section always renders regardless of row count.
FR4. Each section header shows: colored accent dot, `font-serif text-[15px] font-semibold` title,
     and a row-count badge (`rounded-[5px] bg-panel-sunken px-[7px] py-0.5 font-mono text-[11px]
     text-ink-300`).
FR5. Each section has its own `makeSortTable` instance and local sort state (`$state`), sorting
     only that section's rows. Column defs: `name`, `email`, `active` (Status), `_leads`, `_actions`
     — `role` column dropped from all 3 (redundant).
FR6. Managers/Reps sections at 0 rows render one `TableRow` with a `colspan` spanning all 5 columns,
     centered muted text ("No managers yet" / "No reps yet").
FR7. Super Manager section at 0 rows renders a distinct informational line: "No Super Manager
     assigned — promote a manager below." (no new CTA button).
FR8. All existing per-row action buttons (edit name, promote/demote, promote-to-super,
     deactivate/reactivate) render in the section matching their existing gating logic (see Design
     Decision 7) — identical `canManage`/`isSuper`/`canPromote`/`isSelf` checks, unchanged.
FR9. Pagination UI block is fully removed from `+page.svelte`.
FR10. All 4 existing modals (add-user, confirm-role-change, promote-to-super, edit-name) remain
      functionally identical; only the triggering row's section differs.
FR11. Skeleton loading state (`navLoading`) — replace the single 6-row skeleton with a skeleton
      variant that reflects the 3-section layout the way `/reminders` uses
      `DashboardSectionSkeleton`, OR (simpler, in-scope fallback) keep the existing per-table
      `Skeleton` row approach but apply it inside each of the 3 section tables. EXECUTE should
      prefer the simpler in-scope fallback (3x existing skeleton-row block) unless
      `DashboardSectionSkeleton` trivially accepts a `sections={3}` count with equivalent visual
      result — do not introduce a new skeleton component variant.
      **[VALIDATE fix]** Each section's skeleton row must render **5** `TableCell`s (not the
      original 6) — the current block does `{#each Array(6) as _, c (c)}` matching the flat
      table's 6 columns (`name`/`email`/`role`/`active`/`_leads`/`_actions`); since `role` is
      dropped (FR5), every per-section skeleton-row instantiation must use `Array(5)` to match
      the new 5-column layout, or the skeleton will render a mismatched extra cell per row.

## Acceptance Criteria

- AC1: `/team` renders 3 stacked sections in fixed order Super Manager, Managers, Reps — always,
  regardless of row counts (FR3).
- AC2: Each section header shows a colored accent dot, serif title, and a row-count badge matching
  the `/reminders` section-header visual pattern (FR4).
- AC3: Each section sorts independently via its own `makeSortTable` instance with `role` column
  dropped from all 3 (FR5).
- AC4: Managers/Reps sections at 0 rows show a compact inline muted table row, not a full-page
  `EmptyState` (FR6).
- AC5: Super Manager section at 0 rows shows the distinct "No Super Manager assigned — promote a
  manager below." line with no new CTA button (FR7).
- AC6: All 6 existing action affordances (edit name, promote-to-manager, demote-to-rep,
  promote-to-super, deactivate, reactivate) render only in their locked section with identical
  `canManage`/`isSuper`/`canPromote`/`isSelf` gating as before this change (FR8, Design Decision 7).
- AC7: Pagination UI is fully removed — no `Prev`/`Next` controls render regardless of row count
  (FR9).
- AC8: All 4 existing modals (add-user, confirm-role-change, promote-to-super, edit-name) retain
  identical behavior; only the triggering row's section differs (FR10).
- AC9: `bun run check`, `bun run lint`, and `bun run test:unit:ci` all exit 0 after the change.
- AC10: No schema, `/api/users/*` endpoint, `permissions.ts`, or `roles.ts` file is modified.

## Phase Completion Rules

This is a SIMPLE (single-session) plan — no phase gates apply. The plan is considered CODE DONE
when all Implementation Checklist steps 1-6 are complete and `bun run check` / `bun run lint` /
`bun run test:unit:ci` all pass (Fully-Automated gates in Verification Evidence). The plan is
considered VERIFIED only after the Hybrid (manual) rows in Verification Evidence have also been
walked through and confirmed. Do not mark this plan `Status: ✅ VERIFIED` on Fully-Automated gates
alone — the manual/Hybrid rows are required for the carry-over-constraint (Design Decision 7) to be
considered proven, since permission gating correctness cannot be asserted by `bun run check`/`lint`
alone.

## Implementation Checklist

1. **`src/routes/team/+page.server.ts`** — remove `PAGE_SIZE`, `count` import usage, and the
   `page`/`pagination` computation. Fetch all `crmUsers` rows via one `db.select().from(crmUsers)
   .orderBy(desc(crmUsers.active), fn(COL_MAP[sort]), asc(crmUsers.id))` query (keep the existing
   `SORT_COLS`/`COL_MAP`/sort-param parsing as-is — sort still governs the base query ordering,
   but see step 2 for whether it needs to persist per-section instead).
   - Reassess: since sort becomes per-section client state (Design Decision 5), the server-side
     `sort`/`dir` query params on `/team` become unused for role-partitioned display. Simplify:
     drop the `sort`/`dir` URL-param handling from `+page.server.ts` entirely, fetch with a fixed
     stable order (`active DESC, name ASC, id ASC`), and let each section's client-side
     `makeSortTable` own its own sort state independently. Confirm this simplification during
     EXECUTE by checking no other consumer reads `data.sort`/`data.dir` from this load (`grep -rn
     "data.sort\|data.dir" src/routes/team/`).
   - After fetching + mapping via `dbUserToUser` + attaching `leadCount` (unchanged join logic with
     `listPipelineLeads()`), partition the mapped `users` array into `superManager` (role ===
     'super_manager'), `managers` (role === 'manager'), `reps` (role === 'rep') in JS (no separate
     DB queries — one query, one partition pass).
   - Return `{ superManager, managers, reps, leads, currentUser }` — remove `sort`, `dir`,
     `pagination`, `users` (flat) from the return shape.
2. **`src/routes/team/+page.svelte`** — script section:
   - Remove `SvelteURLSearchParams`, `navigate()` helper, `paging` state, and the single `table`
     `$derived` block tied to `data.users`/`data.sort`/`data.dir`.
   - Add 3 local sort states: `let sortSuper = $state({ col: 'name', dir: 'asc' as 'asc' | 'desc' })`
     (or equivalent per-section shape) and matching for `sortManagers`, `sortReps`. Confirm exact
     shape against `makeSortTable`'s `onToggle(id, descDir)` signature — store `{ sort: string,
     dir: 'asc'|'desc' }` and update via `onToggle` closures.
   - Add 3 `$derived` table instances: `superTable`, `managersTable`, `repsTable`, each calling
     `makeSortTable({ data: data.superManager / data.managers / data.reps, columns: [...without
     role...], sort: <section>.sort, dir: <section>.dir, onToggle: (id, descDir) => { <section> =
     { sort: id, dir: descDir ? 'desc' : 'asc' } } })`.
   - Keep all existing handler functions (`addRep`, `toggleActive`, `openEdit`, `saveEditName`,
     `applyRoleChange`, `confirmPromote`) and all `$state` declarations for modals unchanged.
3. **`src/routes/team/+page.svelte`** — markup section, replace the single `<Card><Table>...`
   block (current lines ~295-444) with 3 section blocks in order Super Manager → Managers → Reps:
   - Each section: header div mirroring `/reminders` lines 192-201 (dot + `h2` + count badge), then
     `<Card class="gap-0 overflow-hidden rounded-control py-0"><Table>...</Table></Card>` (reuse
     existing table markup structure, sourced from the section's own `*Table` instance and rows).
   - Super Manager section: accent dot `style="background:#7c3aed"` (existing purple used for the
     super_manager Badge); crown icon may be shown inline next to the title text as an extra visual
     cue (optional per Design Decision 6 — keep minimal, do not add new components).
   - Managers/Reps sections: pick a distinct-but-unobtrusive accent dot color per section (reuse
     existing role Badge colors: managers `#e11d2a`, reps `#6b6470` — consistent with existing
     Badge styling already on this page) so 3 sections are visually distinguishable at a glance.
   - Each section table body: if row array is empty, render the appropriate empty-state row (FR6 /
     FR7) instead of `{#each}`. Wrap each section's table in `overflow-x-auto` if row content risks
     horizontal overflow on narrow viewports (Design Decision 8) — confirm during EXECUTE whether
     existing column widths need it (check current `/team` page for existing horizontal-scroll
     wrapper precedent already present, if any, before adding a new one).
   - Preserve exact per-row action button conditionals from the current single table (lines
     ~379-435) inside each section, adjusted to only include the buttons relevant to that section
     per Design Decision 7 (e.g. Reps section rows never render the arrow-down/demote button since
     that only applies to Managers rows).
4. **`src/routes/team/+page.svelte`** — remove the pagination UI block entirely (current lines
   ~446-474: the `{#if data.pagination.totalPages > 1}` block, `Prev`/`Next` buttons, and the
   now-unused `paging` state / `navigate()` calls tied to `page`).
5. **`src/routes/team/+page.svelte`** — update/replace the `navLoading` skeleton block (current
   lines ~334-341) per FR11: apply the skeleton-row rendering inside each of the 3 section table
   bodies (simplest in-scope approach — do not add a new skeleton component).
6. Run `bun run check` (svelte-check + tsc) and `bun run lint` after markup changes to confirm no
   type errors from the return-shape change or unused-import removal (`count`, `PAGE_SIZE`,
   `SvelteURLSearchParams`, `navigate`, `paging`).
7. Run `bun run test:unit:ci` (Vitest) — confirm no existing unit test references the removed
   `data.pagination`/`data.sort`/`data.dir`/`data.users` shape from this route's load (see Public
   Contracts below for the search performed).
8. Manual verification pass (see Verification Evidence) — visually confirm all 3 sections render,
   empty states show correctly (temporarily test by filtering data or reasoning through code), and
   every action button still fires correctly for a row in its correct section.

## Touchpoints

- `src/routes/team/+page.server.ts` — load function: remove pagination/count query, add role
  partitioning, simplify sort handling.
- `src/routes/team/+page.svelte` — replace single flat table with 3 stacked section blocks, remove
  pagination UI, add per-section sort state + empty-state handling.

No other files are touched. No changes to `src/lib/server/db/schema.ts`, `src/lib/server/db/
leads.ts`, `src/lib/server/db/users.ts`, `src/lib/utils/permissions.ts`, `src/lib/utils/roles.ts`,
`src/lib/zod/schemas.ts`, or any `/api/users/*` route.

## Public Contracts

- **`load` return shape change** (`src/routes/team/+page.server.ts`): removes `users` (flat array),
  `sort`, `dir`, `pagination`; adds `superManager`, `managers`, `reps` (3 grouped arrays). This is
  the only public-contract-shaped change in this plan.
- **Consumer check performed**: `+page.svelte` is the sole consumer of this load's `data` (SvelteKit
  page load data is not shared cross-route by default). No other route or component imports from
  `src/routes/team/+page.server.ts`. Confirmed no existing test file references `data.pagination`,
  `data.sort`, `data.dir`, or `data.users` for this specific route (search via `grep -rn
  "routes/team" src/tests/ 2>/dev/null` returned no route-specific test file at plan-write time —
  EXECUTE must re-confirm this with a fresh grep before removing the shape, since any drift since
  plan-write would be a blast-radius surprise).
- No `/api/*` endpoint contracts change. No schema change.

## Blast Radius

- **Files touched**: 2 (`src/routes/team/+page.server.ts`, `src/routes/team/+page.svelte`).
- **Risk class**: presentation-layer only. No schema, auth, API, or billing surface. No new
  dependency, agent, or runtime surface.
- **Packages affected**: none beyond the single SvelteKit route pair above (this is a single-app
  repo, not a monorepo with separate packages).
- Overall blast radius is SMALL — this plan does not require VALIDATE Layer 2 feasibility probes or
  a security STRIDE scan (no auth/billing/secrets surface touched).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` (svelte-check + tsc) exits 0 | Fully-Automated | No type errors from load-shape change or removed pagination code (FR1, FR2, FR9) |
| `bun run lint` exits 0 | Fully-Automated | No unused-import/lint violations from removed pagination code (FR9) |
| `bun run test:unit:ci` (Vitest) exits 0, no test references removed `data.pagination`/`data.sort`/`data.dir`/`data.users` shape | Fully-Automated | Public Contract change (load return shape) does not break existing unit coverage |
| Manual: load `/team` as a manager, confirm 3 sections render in order Super Manager → Managers → Reps, each with header (dot + title + count badge) | Hybrid (manual, requires running dev server + authenticated session) | FR3, FR4 |
| Manual: confirm each section's sort-header click sorts only that section's rows independently (no cross-section sort bleed) | Hybrid (manual) | FR5 |
| Manual: temporarily simulate 0-row Managers/Reps (or confirm via seed data) — confirm compact inline muted row renders, not full-page EmptyState | Hybrid (manual) | FR6 |
| Manual: temporarily simulate no active Super Manager — confirm the distinct informational line renders, no new CTA button appears | Hybrid (manual) | FR7 |
| Manual: for each of the 6 action affordances (edit name, promote-to-manager, demote-to-rep, promote-to-super, deactivate, reactivate), confirm it appears only in its locked section with unchanged gating (`canManage`/`isSuper`/`canPromote`/`isSelf`) and unchanged modal behavior | Hybrid (manual) | FR8, FR10, Design Decision 7 (hard carry-over constraint) |
| Manual: confirm pagination UI is fully absent from the rendered page regardless of row count | Hybrid (manual) | FR9 |
| Manual: confirm skeleton loading state renders sensibly across 3 sections during navigation | Hybrid (manual) | FR11 |
| E2E (Playwright) spec covering `/team` role-sections rendering | Known-gap | Repo-wide shared authenticated Playwright fixture is not yet available (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — same pre-accepted known-gap pattern as other features in this repo. No new e2e spec is written in this plan; this is a pre-accepted, repo-wide, non-blocking gap, not a new one introduced here. |

## Test Infra Improvement Notes

(none identified yet — test runner and verification conventions confirmed against `process/context/tests/all-tests.md` during PLAN; no gaps found beyond the pre-accepted repo-wide Playwright auth-fixture known-gap noted in Verification Evidence)

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/team/active/team-role-sections_07-07-26/team-role-sections_PLAN_07-07-26.md`
2. **Last completed phase or step**: PLAN — this document. No EXECUTE work has started.
3. **Validate-contract status**: pending — VALIDATE has not yet run. Placeholder below.
4. **Supporting context files loaded during PLAN**: `process/context/all-context.md`,
   `process/features/team/active/team-member-profile-edit_07-07-26/team-member-profile-edit_PLAN_07-07-26.md`
   (name-only Edit modal constraint), `process/features/team/active/super-manager-role_02-07-26/
   super-manager-role_SPEC_02-07-26.md` (locked role-change permission model, referenced via prior
   context — not re-read verbatim this session due to effort scoping; EXECUTE should re-confirm
   the exact locked constraints before touching role-change logic if any ambiguity arises),
   `src/routes/team/+page.svelte`, `src/routes/team/+page.server.ts`, `src/routes/reminders/
   +page.svelte` (section-header precedent), `src/lib/utils/tableSort.ts`, `src/lib/utils/
   permissions.ts`.
5. **Next step for a fresh agent picking up mid-execution**: if EXECUTE has not started, proceed to
   VALIDATE mode against this plan. If EXECUTE has started, check git diff against the 2 touched
   files listed in Touchpoints and cross-reference against the Implementation Checklist steps 1-8
   to determine which steps are complete; resume from the first incomplete step.

## Validate Contract

**generated-by:** outer-pvl
**date:** 2026-07-07
**Gate:** PASS

### V1 — Structural Check

All required sections present: Design Decisions, Scope, Out of Scope, Touchpoints, Public
Contracts, Blast Radius, Verification Evidence, Resume and Execution Handoff. No `## Inner Loop
Refresh Note` exists (first-pass outer-loop SIMPLE plan, not a phase-program inner loop). PASS.

### V2 — Layer 1 Dimension Findings

**Dimension: Infra**
Status: PASS
Findings:
- Presentation-only change to an existing SvelteKit route pair (`+page.server.ts` load function
  + `+page.svelte`). No new route, no new runtime surface, no new env var, no new dependency.
- Removing `.limit(PAGE_SIZE).offset(...)` and the `count()` query is a straightforward query
  simplification — confirmed both exist at the claimed locations in the live file (lines 47–48
  for limit/offset, line 49 for the `count()` query, line 10 for `PAGE_SIZE`, line 5 for the
  `count` import).
- No schema/migration change — confirmed against `src/lib/server/db/schema.ts`: `crmUsers.role`
  is a `pgEnum('crm_user_role', ['rep', 'manager', 'super_manager'])` (line 25) — exactly the 3
  values the plan partitions into `superManager`/`managers`/`reps`. The partition is exhaustive;
  no user role value can silently fall outside all 3 groups.
Confidence: HIGH

**Dimension: Test coverage**
Status: CONCERN (resolved via plan fix — see below)
Findings:
- Tier assignments in Verification Evidence follow the `vc-test-coverage-plan` waterfall
  correctly: Fully-Automated for `check`/`lint`/`test:unit:ci`; Hybrid (manual, live DB/session)
  for section rendering, per-section sort isolation, empty-state variants, the 6 action-affordance
  gating checks, pagination absence, and skeleton rendering; Known-gap for e2e (consistent,
  pre-accepted repo-wide gap — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
  This is presentation-only with no auth/billing/schema surface, so Hybrid-minimum escalation
  (`vc-test-coverage-plan` §High-Risk Classes) does not apply — Known-gap for e2e is acceptable
  here, unlike the sibling `team-member-profile-edit` plan which had to escalate the self-edit
  hardening scenarios to Hybrid because it touched a permission-adjacent endpoint.
- **Gap found (now fixed in plan):** FR11 / Implementation Checklist step 5 said to reuse the
  existing per-table skeleton-row approach across the 3 sections but did not say the cell count
  must change. The live skeleton block (`+page.svelte` lines 334–341) renders `Array(6)` cells per
  row, matching the current 6-column table (`name`/`email`/`role`/`active`/`_leads`/`_actions`).
  Since `role` is dropped (FR5, 5 columns remain), a naive per-section reuse of the existing block
  would render a mismatched 6th cell per skeleton row. **Applied directly to the plan** (FR11): each
  section's skeleton row must use `Array(5)`, not `Array(6)`. This is a plan-text fix, not an
  execute-agent instruction — the corrected column count is now explicit in FR11 itself.
- Confirmed the pre-existing `e2e/team-invite-form.e2e.ts` spec's `/team` `goto()` targets only the
  header "Add a rep" button and the add-user modal's `#rep-name`/`#rep-email` fields — none of
  which this plan touches (no changes to `PageHeader` actions, the add-user Modal, or its field
  ids). This spec is unaffected by the role-sections restructure; it is already self-skipping
  (`test.skip(!ready, ...)`) per the shared known-gap pattern, so it carries no regression risk
  from this plan either way. (Unrelated observation, not a finding against this plan: that spec's
  submit-button selector `/^Add rep$/` appears stale against the already-merged
  `team-member-profile-edit_07-07-26` copy change to `{addLabel}` — pre-existing drift from a
  different, already-executed plan, out of this plan's blast radius; not actioned here.)
Confidence: HIGH

**Dimension: Breaking changes**
Status: PASS
Findings:
- Read the live `src/routes/team/+page.server.ts` (69 lines) directly. Confirmed the load
  function's current return shape (`users`, `leads`, `sort`, `dir`, `currentUser`, `pagination`)
  matches the plan's stated "before" state exactly, and the plan's removal targets (`PAGE_SIZE`,
  `count` import/query, `page`/`pagination` computation, `sort`/`dir` URL-param parsing) are all
  present at the claimed locations.
- Grepped `src/` for any other importer of this route's types or consumer of its load data:
  `grep -rln "routes/team" src/ --include="*.ts" --include="*.svelte"` (excluding the route's own
  files) returned no matches. `+page.svelte` is confirmed the sole consumer of `data` from this
  load, matching the plan's Public Contracts claim.
- Grepped `src/tests/` for any reference to `data.sort`/`data.dir`/`data.pagination`/`data.users`
  scoped to this route: no matches — confirms the plan's own pre-write check (Public Contracts
  section) is still accurate at VALIDATE time (no drift since plan-write).
- The load-shape change (`users`/`sort`/`dir`/`pagination` → `superManager`/`managers`/`reps`) is
  therefore fully contained to the 2 touchpoint files with zero downstream breakage.
Confidence: HIGH

**Dimension: Security**
Status: PASS
Findings:
- No schema, auth, `/api/users/*`, `permissions.ts`, or `roles.ts` file is touched — confirmed via
  `git diff --stat HEAD` on those paths returning empty (no working-tree changes yet, consistent
  with a not-yet-executed plan) and via direct read of `permissions.ts`, which the plan's Design
  Decision 7 gating table depends on but does not modify.
- **Permission-gating carryover (the plan's own "hard carry-over constraint," highest-risk item)**
  verified line-by-line against the live `+page.svelte` per-row actions block (lines 379–437):
  - Edit name: gated only by the enclosing `{#if canManage}` (line 379) — renders on every row in
    every section. Plan claim ("canManage, every row in every section") — MATCH.
  - Promote to Manager (arrow-up): live condition `{#if isSuper && u.role === 'rep'}` (line 390).
    In the Reps section (role fixed to 'rep' by partition), this reduces to `isSuper`. Plan claim
    ("isSuper only, Reps section rows only") — MATCH.
  - Demote to Rep (arrow-down): live condition `{#if isSuper && u.role === 'manager'}` (line 400).
    In the Managers section, reduces to `isSuper`. Plan claim ("isSuper only, Managers section
    rows only") — MATCH.
  - Promote to Super Manager (crown): live condition
    `{#if canPromote && u.role === 'manager' && u.active}` (line 410), where
    `canPromote = canPromoteToSuperManager(currentUser) = isSuperManager(currentUser)`
    (`permissions.ts`). In the Managers section, reduces to `canPromote && u.active`. Plan claim
    ("canPromote (=isSuper), Managers section rows only, u.active only") — MATCH.
  - Deactivate/Reactivate: live condition `{#if u.role === 'rep' || (isSuper && !isSelf)}`
    (line 422), nested inside `{#if canManage}`. Per-section reduction: in the Reps section
    (`u.role === 'rep'` always true) the OR collapses to unconditionally-true, so the effective
    gate is just the enclosing `canManage` — plan claim "Reps section: canManage" — MATCH. In the
    Managers section (`u.role === 'manager'`, first disjunct always false) it reduces to
    `isSuper && !isSelf` — plan claim "Managers/Super-Manager sections: isSuper && !isSelf" —
    MATCH. For the Super Manager section (0–1 row, `role === 'super_manager'`), the same reduction
    applies (`isSuper && !isSelf`); since only one super_manager can exist, this correctly always
    evaluates to false when the viewer IS that super_manager (isSelf) and false when the viewer is
    a plain manager (not isSuper) — behavior-preserving, no new self-deactivation path opened.
  - No new role/status editing surface is introduced (confirmed: no touch to `/api/users/*`,
    `permissions.ts`, `roles.ts` in Touchpoints, and no such edits appear in the Implementation
    Checklist).
- Conclusion: every one of the 6 carried-over affordances' conditions reduces byte-for-byte to the
  plan's stated per-section gating once the section's fixed role is substituted into the live
  conditional. No permission drift risk found — this was the plan's own flagged highest-risk item
  and it checks out exactly.
Confidence: HIGH

### V2b — Layer 2 Feasibility (spot-check)

Read `src/routes/team/+page.server.ts` and `src/routes/team/+page.svelte` directly (not just the
plan's prose) to confirm every line-number reference in the Implementation Checklist and Design
Decisions:

- `+page.server.ts`: `PAGE_SIZE` (line 10), `count` import (line 5), `.limit()/.offset()`
  (lines 47–48), `count()` query (line 49) — all exact.
- `+page.svelte`: single Card/Table block spans lines 295–444 (plan: "~295-444") — exact. Pagination
  UI block spans lines 446–474 (plan: "~446-474") — exact. `navLoading` skeleton block spans lines
  334–341 (plan: "~334-341") — exact. Per-row action conditionals span lines 379–437 (plan:
  "~379-435", off by 2 lines due to closing `</div>`/`{/if}` — trivially close, non-blocking).
  Purple/red/gray accent colors (`#7c3aed`/`#e11d2a`/`#6b6470`) at lines 357–361 — exact match to
  the plan's Design Decision 6/Implementation Checklist step 3 claims. `/reminders` section-header
  pattern (dot + `font-serif text-[15px] font-semibold` + count badge) confirmed present at
  `src/routes/reminders/+page.svelte` lines ~191–199 (plan says "~192-201" — off by ~1-2 lines,
  acceptable given the "~" qualifier and that it is a visual-pattern reference, not an edit target).
- `makeSortTable` (`src/lib/utils/tableSort.ts`, 67 lines) is a plain generic function with **no
  module-level or shared mutable state** — every call builds fresh closures purely from its own
  `{ data, columns, sort, dir, onToggle }` argument object and returns a fresh object. Three
  concurrent `$derived` instantiations (`superTable`, `managersTable`, `repsTable`), each closing
  over its own section's data/columns/sort-state/onToggle, cannot interfere with each other in any
  way — there is nothing to share. The plan's claim that `makeSortTable` "supports 3 independent
  instantiations" is **confirmed TRUE** — not just plausible but structurally guaranteed by the
  function having zero internal/shared state.
- No mechanical-feasibility gaps found beyond the one FR11 skeleton-cell-count gap (now fixed
  directly in the plan text — see Test coverage dimension above). No VC-FEASIBILITY-PROBE-NEEDED
  triggers — nothing in this plan hinges on unverified runtime/network/third-party behavior; it is
  pure in-repo presentation logic over already-loaded data.

### V3 — Net Gate Synthesis

No FAILs. One Test-coverage CONCERN found (skeleton cell count 6→5 mismatch risk) — resolved by a
direct plan-text fix (FR11 now explicitly specifies `Array(5)`), so it is not carried forward as an
open concern. Zero unresolved CONCERNs remain.

**Gate: PASS** — proceed to EXECUTE. The one concern found was fixed in the plan itself (not merely
accepted), consistent with a clean PASS gate.

### Plan updates applied

- [x] FR11 — added explicit `Array(5)` (not `Array(6)`) instruction for each section's skeleton row,
      closing the column-count mismatch gap found during V2 Test-coverage review.

### Accepted Concerns (carried into EXECUTE / UPDATE PROCESS)

1. **e2e known-gap** — no shared Playwright authenticated-session fixture exists yet
   (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Confirmed current and
   accurate against `process/context/tests/all-tests.md`. Accepted as known-gap per plan — same
   repo-wide pattern as every other feature, not new to this plan.

### Test Gates EXECUTE Must Run

1. `bun run check` — exits 0
2. `bun run lint` — exits 0
3. `bun run test:unit:ci` — no regressions (existing suite; this plan adds no new unit test, per
   plan scope — confirm baseline count matches current `all-tests.md` recorded figure)
4. Manual (Hybrid, live session): `/team` renders 3 sections in fixed order Super Manager →
   Managers → Reps, each always visible regardless of row count
5. Manual (Hybrid): each section's header shows dot + serif title + row-count badge matching the
   `/reminders` pattern
6. Manual (Hybrid): each section's sort header sorts only that section's rows, no cross-section
   bleed
7. Manual (Hybrid): Managers/Reps at 0 rows show the compact inline muted row (not full EmptyState)
8. Manual (Hybrid): Super Manager at 0 rows shows the distinct "No Super Manager assigned —
   promote a manager below." line, no new CTA button
9. Manual (Hybrid): all 6 action affordances (edit name, promote-to-manager, demote-to-rep,
   promote-to-super, deactivate, reactivate) render only in their locked section with unchanged
   `canManage`/`isSuper`/`canPromote`/`isSelf` gating and unchanged modal behavior
10. Manual (Hybrid): pagination UI fully absent regardless of row count
11. Manual (Hybrid): skeleton loading state renders sensibly across the 3 sections (5 cells/row,
    not 6) during navigation
12. e2e (Playwright) — known-gap, accepted, see Accepted Concerns above

---

_Validated 2026-07-07 by vc-validate-agent. PHASE_COMPLETE: VALIDATE — Gate: PASS._
