---
name: plan:manager-dashboard
description: "Manager-only per-AE performance dashboard — role gate, 6 aggregation queries, range-bucket filter, /dashboard route (GitHub #244 / DASH-1)"
date: 07-07-26
feature: manager-dashboard
---

# PLAN — Manager Performance Dashboard (Issue #244 / DASH-1)

Date: 07-07-26
Status: DRAFT — pending VALIDATE

Complexity: **SIMPLE** (single session, one plan file, no phase program — 4 touchpoint groups: server module, route, one new UI component, gate reuse).

## Phase Completion Rules

- Item 11 (`bun run check && bun run lint` exit 0) is the final gate for CODE DONE.
- A checklist item is complete only when its file exists AND the matching Verification Evidence row is green (Fully-Automated/Hybrid) or explicitly accepted as CONDITIONAL (AC5 known-gap).
- This plan reaches VERIFIED only after VALIDATE (PVL) gate is PASS or accepted-CONDITIONAL, and EXECUTE + EVL confirm all in-blast-radius gates green.

## Acceptance Criteria

Mirrors SPEC ACs 1-7 verbatim (see SPEC `manager-dashboard_SPEC_07-07-26.md` for full text):

1. Rep session hitting `/dashboard` → 403, no metric data rendered.
2. Manager/super-manager session → page loads, every active AE represented.
3. Each AE entry shows name, leads owned, stage distribution, won (all-time + range), adherence %, leads added (range).
4. Changing date-range filter changes only range-bound numbers.
5. Click-through from AE row lands on `/leads` pre-filtered to that AE (corrected target: `/leads?segment=all&owner=<repId>` — see Plan-Time Correction).
6. Soft-deleted leads excluded from every metric.
7. `bun run check` and `bun run lint` both exit 0.

## Overview

Build `/dashboard`, a manager/super-manager-only page showing one row/card per active AE with:
leads owned, pipeline-stage distribution, won count (all-time + selected range), follow-up
adherence %, and leads-added count (selected range). A 3-bucket date-range control
(this week / this month / all time) re-scopes the range-bound metrics. Each AE row links through
to `/leads` pre-filtered to that AE.

This implements the INNOVATE Decision Summary verbatim (window-function adherence query grouped by
`repId`, split won-count boundary, new `range-bucket-control` component, new `dashboard.ts` server
module, route gated by `isManagerRole()`). One correction found during PLAN research is documented
below (see **Plan-Time Correction** under Touchpoints), and one further correction found during
VALIDATE is documented under **Validate-Time Correction**.

## Goals

- Manager/super-manager sees all active AEs' key numbers in one place.
- Rep role is fully blocked (403), matching `/team`'s exact pattern.
- Date-range filter re-scopes only range-bound metrics; all-time numbers stay fixed.
- Drill-through link correctly lands on that AE's leads.
- `bun run check` and `bun run lint` exit 0.

## Scope

In scope: `src/lib/server/db/dashboard.ts` (new), `src/routes/dashboard/+page.server.ts` (new),
`src/routes/dashboard/+page.svelte` (new), `src/lib/components/ui/range-bucket-control/` (new,
3 files mirroring `week-range-control/`), nav link to `/dashboard` (manager-only).

Out of scope (per SPEC): schema/migration changes, `/reports` refactor, exports, custom date
ranges, per-AE goals/alerts, e2e proof (known-gap, pre-existing).

---

## Plan-Time Correction (flagged, non-blocking)

The INNOVATE Decision Summary's drill-through target (`/leads?rep=<id>`) does not match the real
`/leads` route contract. `src/routes/leads/+page.server.ts` reads `owner` (not `rep`) as the
query param, and `segment` defaults to `'mine'` — which filters by `locals.user.id` (the viewing
manager), not by the `owner` param. Confirmed in `src/lib/server/db/leads.ts:373` — `owner` only
takes effect when explicitly combined with a non-`'mine'` segment (see `leads.ts:390`,
`ownerId ? eq(crmLeads.ownerId, ownerId) : —`, applied on top of segment conditions).

**Corrected link target: `/leads?segment=all&owner=<repId>`.** This is a same-day PLAN-level
adjustment (not a design re-litigation) — the intent ("go straight to that AE's leads") is
unchanged; only the exact query string is corrected to match the real contract. AC5 verification
below is updated to match.

---

## Validate-Time Correction (flagged, applied 07-07-26 during VALIDATE)

VALIDATE Layer 2 found that the Touchpoints table named `src/routes/+layout.svelte` as the file to
edit for the manager-only nav link. That is wrong: `src/routes/+layout.svelte` contains no nav
array and no `isManagerRole()` reference (confirmed via grep — zero matches). The actual nav item
array and manager-gating conditional live in `src/lib/components/layout/AppSidebar.svelte`
(`manager: NavItem[]` array at lines 59-62; `{#if isManagerRole(user?.role)}` gate at line 130,
alongside the existing `/team` entry).

VALIDATE also found the checklist did not account for the `icon` field: `NavItem.icon` must be a
key of `Icon.svelte`'s `ICONS` const (`IconName = keyof typeof ICONS`), and no `dashboard` glyph
currently exists there. Rather than adding a new SVG path (out of scope for this plan), this plan
reuses the existing `reports` icon glyph for the `/dashboard` nav entry.

**Corrected touchpoint (applied below):** edit `src/lib/components/layout/AppSidebar.svelte`
(not `+layout.svelte`) — add `{ href: '/dashboard', label: 'Dashboard', icon: 'reports' }` to the
`manager: NavItem[]` array. No edit to `Icon.svelte` is needed.

---

## Touchpoints

| File | Action | Notes |
|---|---|---|
| `src/lib/server/db/dashboard.ts` | CREATE | All 6 aggregation queries live here. Never touches `leads.ts`, `reports/+page.server.ts`, or `mock.ts`. |
| `src/routes/dashboard/+page.server.ts` | CREATE | Role gate (`isManagerRole` + `error(403, 'Manager only')`, mirrors `src/routes/team/+page.server.ts:23-26`) + range param parsing + calls into `dashboard.ts`. |
| `src/routes/dashboard/+page.svelte` | CREATE | Renders per-AE rows/cards + `RangeBucketControl` + drill-through links. |
| `src/lib/components/ui/range-bucket-control/index.ts` | CREATE | Barrel export, mirrors `week-range-control/index.ts`. |
| `src/lib/components/ui/range-bucket-control/range-bucket-control.ts` | CREATE | Pure helper functions (bucket validation, active-state derivation) — framework-free, unit-testable. |
| `src/lib/components/ui/range-bucket-control/RangeBucketControl.svelte` | CREATE | 3-button `role="radiogroup"` + `aria-pressed` + focus-ring + segmented-pill pattern, mirrors `WeekRangeControl.svelte` structurally (not a modification of it). |
| `src/lib/components/layout/AppSidebar.svelte` | EDIT | **(VALIDATE correction — was incorrectly listed as `src/routes/+layout.svelte`.)** Add `{ href: '/dashboard', label: 'Dashboard', icon: 'reports' }` to the `manager: NavItem[]` array (confirmed at lines 59-62, immediately alongside the existing `/team` entry). Reuse the existing `reports` icon glyph — do NOT add a new key to `Icon.svelte`'s `ICONS` const for this plan. |
| `src/tests/dashboard-gate.spec.ts` | CREATE | Vitest unit test: 403 for `role='rep'`, pass-through for `manager`/`super_manager` (first such gate test in repo — no existing `team.spec.ts` to copy structurally; use `reminders-db.spec.ts`'s `describe.skipIf` idiom only for the DB-dependent half, not this pure-gate half). |
| `src/tests/dashboard-db.spec.ts` | CREATE | Hybrid DB test, `describe.skipIf(!process.env.DATABASE_URL)`, mirrors `reminders-db.spec.ts` fixture/cleanup structure exactly (seed via `createLead`, `afterAll` cleanup of created rows). |

Read-only context files (no edits): `src/lib/server/db/schema.ts` (crmLeads, crmActivities,
crmLeadHistory, crmUsers columns), `src/routes/team/+page.server.ts` (gate pattern source),
`src/routes/reports/+page.server.ts` (existing won/leaderboard pattern — reused conceptually, not
imported), `src/lib/utils/permissions.ts` (`isManagerRole`), `src/lib/components/ui/week-range-control/*`
(structural template only), `src/tests/reminders-db.spec.ts` (Hybrid test template),
`src/lib/components/shared/Icon.svelte` (confirm `reports` glyph exists — it does, line 9).

## Public Contracts

- New route `GET /dashboard` — manager/super_manager only; 403 for all other roles (including
  unauthenticated, via existing `hooks.server.ts` session gate upstream).
- New query params on `/dashboard`: `?range=week|month|all` (default `week` — matches SPEC's Q3
  deferred default; INNOVATE did not specify a default explicitly, so PLAN picks `week` as the
  narrowest/most-recent bucket, consistent with `/leads`'s own week-scoped defaults elsewhere in
  the repo). Invalid/missing values fall back to `week`.
- New drill-through contract: dashboard row links to `/leads?segment=all&owner=<repId>` (corrected
  per Plan-Time Correction above) — this is the one new cross-route contract this plan introduces.
- No schema changes. No new DB columns, tables, or migrations.
- No changes to `/reports`, `/team`, or any existing route's behavior.

## Blast Radius

- **Risk class:** none of auth/billing/schema-migration/public-API/deploy/secrets — this is a new
  read-only internal manager surface reusing an existing, already-shipped gate pattern.
- **Files touched:** 8 new files + 1 small edit to `AppSidebar.svelte` (nav link only, corrected
  from `+layout.svelte` at VALIDATE) = 9 files total.
- **Packages:** single SvelteKit app (`veent-crm` is not a monorepo) — no cross-package blast radius.
- **Existing surfaces read but not modified:** `crmLeads`, `crmActivities`, `crmLeadHistory`,
  `crmUsers` tables (read-only queries); `isManagerRole()` (imported, not modified); `reports`
  icon glyph in `Icon.svelte` (read/reused, not modified).

## Implementation Checklist

1. **`src/lib/server/db/dashboard.ts`** — create module exporting one function per metric plus one
   composed `getDashboardData(range)` entrypoint:
   - `getActiveAeList()` — **Decision (resolved):** dashboard rows are per-AE, i.e. per active
     `rep`-role user (managers/super-managers do not appear as rows on their own dashboard) —
     filter `eq(crmUsers.role, 'rep')` AND `eq(crmUsers.active, true)`. This matches SPEC's "each
     AE's entry" framing; managers aren't AEs. (Use this resolved filter directly — ignore any
     earlier draft phrasing implying an OR against manager roles.)
   - `getLeadsOwnedPerAe()` — `count()` grouped by `ownerId`, `WHERE deleted_at IS NULL`, joined/filtered against the active-rep id set.
   - `getStageDistributionPerAe()` — `count()` grouped by `(ownerId, stage)`, `WHERE deleted_at IS NULL`.
   - `getWonAllTimePerAe()` — reuse `/reports`' exact pattern: `count()` grouped by `ownerId` `WHERE deleted_at IS NULL AND stage = 'won'`. Do not import from `reports/+page.server.ts` — duplicate the small query here (same shape, independent module, per Decision Summary item 2/4 — `/reports` stays untouched).
   - `getWonInRangePerAe(range)` — join `crmLeadHistory` (`field = 'stage'`, `newValue = 'won'`) against `crmLeads` (`deleted_at IS NULL`), take the most-recent `at` per lead using Drizzle's native `.selectDistinctOn([crmLeadHistory.leadId], {...}).orderBy(crmLeadHistory.leadId, desc(crmLeadHistory.at))` builder method (this exact idiom is already used in `leads.ts` for the "current follow-up per lead" pattern — prefer it over a raw `sql` DISTINCT ON template for consistency), then filter that date into the range boundary, then `count()` grouped by the lead's current `ownerId`.
   - `getFollowUpAdherencePerAe(range)` — the window-function query from the Decision Summary: `LEAD(occurredAt) OVER (PARTITION BY lead_id ORDER BY occurred_at)` on `crmActivities` rows where `followUpAt IS NOT NULL`, classify on-time/late/missed/pending per row, exclude pending, `adherence% = on_time / (on_time+late+missed)`, grouped by `repId`. Use Drizzle's `sql` template for the window-function CTE (Drizzle query builder does not have first-class `LEAD()` support — this is the one place raw `sql` is actually needed in this plan) — write as a single raw `sql` block with named CTEs, executed via `db.execute(sql\`...\`)`. Pass all dynamic values (range boundary dates) via the tagged-template's own parameter interpolation (`sql\`... ${dateVar} ...\``) — never string-concatenate into the SQL text.
   - `getLeadsAddedInRangePerAe(range)` — `count()` grouped by `ownerId`, `WHERE deleted_at IS NULL AND created_at >= [range start]`.
   - `getDashboardData(range)` — `Promise.all` the above 6 (5 metric + 1 AE-list) queries, assemble one object per AE: `{ id, name, leadsOwned, stageDistribution, wonAllTime, wonInRange, adherencePct, leadsAddedInRange }`. Reps missing from a metric map default to `0` (not absent).
   - Range boundary helper: `function rangeToStartDate(range: 'week'|'month'|'all'): Date | null` — `week` = start of ISO week (Monday) at local midnight, `month` = start of current calendar month, `all` = `null` (no lower bound). Keep this pure and exported so it's independently unit-testable without DB.

2. **`src/lib/components/ui/range-bucket-control/range-bucket-control.ts`** — pure helpers:
   - `const RANGE_BUCKETS = ['week', 'month', 'all'] as const; type RangeBucket = (typeof RANGE_BUCKETS)[number];`
   - `isValidRangeBucket(v: string): v is RangeBucket`
   - `computeAriaPressed(bucket: RangeBucket, active: RangeBucket): boolean` (mirrors `week-range-control.ts`'s `computeAriaPressed` shape but for a 3-way enum instead of numeric presets + null).

3. **`src/lib/components/ui/range-bucket-control/RangeBucketControl.svelte`** — 3 buttons ("This week" / "This month" / "All time"), `role="radiogroup"`, `aria-pressed` per button via `computeAriaPressed`, same `focus-ring`/`border-hairline`/`bg-panel`/segmented-pill Tailwind classes as `WeekRangeControl.svelte` (copy the exact class strings for visual consistency — do not invent new token names). Props: `{ value: RangeBucket; onchange: (bucket: RangeBucket) => void }`.

4. **`src/lib/components/ui/range-bucket-control/index.ts`** — barrel: `export { default as RangeBucketControl } from './RangeBucketControl.svelte'; export * from './range-bucket-control';` (mirror `week-range-control/index.ts` exactly — Read it first to confirm exact export shape before writing).

5. **`src/routes/dashboard/+page.server.ts`**:
   ```
   if (!locals.user || !isManagerRole(locals.user.role)) error(403, 'Manager only');
   const rawRange = url.searchParams.get('range') ?? 'week';
   const range = isValidRangeBucket(rawRange) ? rawRange : 'week';
   return { range, dashboard: getDashboardData(range) };
   ```
   (Streamed/promise return, matching `reports/+page.server.ts`'s pattern of returning un-awaited promises for `report`/`outreach`/`heatmap` — keep the same streaming-load idiom rather than awaiting inline, since this repo already establishes that convention on the sibling reports page.)

6. **`src/routes/dashboard/+page.svelte`** — `{#await data.dashboard}` loading state, then one row/card per AE with: name, leads owned, stage-distribution mini-breakdown, won (all-time + range), adherence %, leads added (range), and an `<a href="/leads?segment=all&owner={ae.id}">` drill-through link. Mount `<RangeBucketControl value={data.range} onchange={(b) => goto(\`?range=${b}\`)} />` at the top (use SvelteKit's `goto` for client nav on range change, consistent with existing filter-control usage patterns elsewhere in the app — confirmed via Read of `leads/+page.svelte`, which uses `SvelteURLSearchParams(page.url.searchParams)` + `goto(\`?${params}\`, { keepFocus: true })`; `/dashboard` has only the single `range` param so the simpler `goto(\`?range=${b}\`)` form is acceptable here).

7. **Nav link** — Edit `src/lib/components/layout/AppSidebar.svelte`'s `manager: NavItem[]` array (lines 59-62): add `{ href: '/dashboard', label: 'Dashboard', icon: 'reports' }` alongside the existing `/team` entry. **(Corrected at VALIDATE — see Validate-Time Correction above; do not edit `src/routes/+layout.svelte`, which contains no nav array.)**

8. **`src/tests/dashboard-gate.spec.ts`** — Vitest: import the `load` function from `dashboard/+page.server.ts`, call it with mocked `{ locals: { user: { role: 'rep' } } }` and assert it throws with status 403 (this is the first load-function-403 unit test in the repo — no direct precedent to copy; use `await expect(load(...)).rejects.toMatchObject({ status: 403 })` or equivalent, since SvelteKit's `error()` throws an `HttpError`); call with `role: 'manager'` and `role: 'super_manager'` and assert no throw (mock/stub `getDashboardData` or accept its real promise-returning shape without awaiting, since the gate check runs synchronously before the data fetch).

9. **`src/tests/dashboard-db.spec.ts`** — Hybrid, `describe.skipIf(!process.env.DATABASE_URL)`. Seed via `createLead()` (mirrors `reminders-db.spec.ts`): known set of leads per AE, at least one soft-deleted lead, activities with `followUpAt` in on-time/late/missed/pending shapes, a `crm_lead_history` row transitioning a lead to `'won'` inside vs. outside the selected range. Assert: leads-owned count, stage distribution, won-all-time, won-in-range, adherence %, leads-added-in-range all match hand-calculated expectations; assert the soft-deleted lead is excluded from every metric; assert range switching changes only range-bound numbers. `afterAll` cleanup deletes all `__dashboardtest__`-prefixed leads (same prefix-and-cleanup idiom as `TEST_PREFIX` in `reminders-db.spec.ts`).

10. **Verification step (non-blocking per INNOVATE, still required before EVL close):** run `EXPLAIN ANALYZE` on the adherence window-function query against seeded data once step 1's adherence query is written, confirm it completes in a reasonable time (no full-table-scan pathology) against the current seed volume, and record the result in the phase report's Test Infra Improvement Notes — not a blocking gate, but must be checked before closeout.

11. Run `bun run check` and `bun run lint` — both must exit 0 (explicit SPEC AC7).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `dashboard-gate.spec.ts` — `role='rep'` → 403 thrown, no data | Fully-Automated | AC1 |
| `dashboard-gate.spec.ts` — `role='manager'`/`'super_manager'` → gate passes | Fully-Automated | AC2 (gate half) |
| `dashboard-db.spec.ts` — every active rep-role AE present in `getDashboardData()` output | Hybrid | AC2 (data half) |
| `dashboard-db.spec.ts` — seeded fixture asserts name/leadsOwned/stageDistribution/wonAllTime/wonInRange/adherencePct/leadsAddedInRange match hand-calculated values | Hybrid | AC3 |
| `dashboard-db.spec.ts` — same fixture, three range values (`week`/`month`/`all`) yield different range-bound numbers and identical all-time numbers | Hybrid | AC4 |
| Playwright click-through spec (self-skipping, known-gap) | Agent-Probe — **Known-Gap** (pre-existing, accepted; see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) | AC5 — CONDITIONAL until shared auth fixture lands; keep gate CONDITIONAL, not silently PASS |
| `dashboard-db.spec.ts` — soft-deleted lead seeded alongside active ones, excluded from all 4 count-based metrics | Hybrid | AC6 |
| `bun run check && bun run lint` exit 0 | Fully-Automated | AC7 |
| `EXPLAIN ANALYZE` on adherence query (manual record in phase report, not a pass/fail gate) | Agent-Probe | Non-blocking flagged item from INNOVATE — performance sanity check |

**Known-gap vacuous-green note:** AC5's Known-Gap status does NOT authorize marking the overall
feature gate PASS on drill-through proof alone. The gate for AC5 stays CONDITIONAL and a
test-building backlog stub is required (already exists repo-wide — no new stub needed, reference
the existing `e2e-auth-bootstrap_NOTE_01-07-26.md`). All other ACs (1,2,3,4,6,7) must be genuinely
green (Fully-Automated or Hybrid) before the overall plan can reach PASS.

## Test Infra Improvement Notes

(none identified yet — the `EXPLAIN ANALYZE` step above is a checklist verification action, not a
test-infra gap; record its outcome here after EXECUTE runs it)

## Dependencies, Risks, Integration Notes

- **Dependency:** none new — reuses `isManagerRole`, `crmLeads`/`crmActivities`/`crmLeadHistory`/`crmUsers` schema, existing Drizzle client, existing `week-range-control` visual pattern (structurally mirrored, not imported).
- **Risk — window-function correctness:** the adherence query is the single most complex piece of new SQL in this plan. Mitigation: Hybrid test with all 4 classification cases (on-time/late/missed/pending) seeded explicitly, plus the non-blocking `EXPLAIN ANALYZE` check.
- **Risk — `DISTINCT ON` ordering for won-in-range:** must confirm most-recent transition to `'won'` per lead (a lead could theoretically flip stages multiple times pre-won in edge cases, though the schema doesn't model stage-reversal explicitly). Mitigation: order by `at DESC` explicitly (via `.orderBy(crmLeadHistory.leadId, desc(crmLeadHistory.at))`), and add an assertion in `dashboard-db.spec.ts` for a lead with 2+ history rows.
- **Integration note — drill-through param mismatch:** see Plan-Time Correction above; this is resolved at PLAN time, not deferred.
- **Integration note — nav edit target:** see Validate-Time Correction above; resolved at VALIDATE time, not deferred.
- No backwards-compatibility concerns — purely additive (new route, new module, new component, one new nav link).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/manager-dashboard/active/manager-dashboard_07-07-26/manager-dashboard_PLAN_07-07-26.md`
2. **Last completed phase or step:** VALIDATE — validate-contract written below (this VALIDATE pass also corrected the nav-edit touchpoint from `+layout.svelte` to `AppSidebar.svelte`); no EXECUTE work has started.
3. **Validate-contract status:** written 07-07-26 — Gate: CONDITIONAL (AC5 known-gap, pre-accepted).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `src/routes/team/+page.server.ts`, `src/lib/utils/permissions.ts`, `src/routes/reports/+page.server.ts`, `src/lib/components/ui/week-range-control/*`, `src/tests/reminders-db.spec.ts`, `src/lib/server/db/schema.ts`, `src/routes/leads/+page.server.ts`, `src/lib/server/db/leads.ts` (segment/owner interaction), `src/lib/components/layout/AppSidebar.svelte`, `src/lib/components/shared/Icon.svelte`.
5. **Next step for a fresh agent picking up mid-execution:** run `ENTER EXECUTE MODE` against this plan file next (VALIDATE is complete, Gate: CONDITIONAL, accepted). If resuming after partial EXECUTE, check which of the 9 touchpoint files' existence to determine which of the 11 checklist items are done, then resume from the first missing item — item 11 (`bun run check && bun run lint`) must be the last item run regardless of where resumption starts.

## Validate Contract

Status: CONDITIONAL
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 "5+ files in blast radius" present — 9 files; no multi-package, no schema/auth/API surface change, no phase program, no user-requested depth, no high-risk class per the plan's own risk classification, confirmed correct on inspection). LOW-score plans use sequential dimension-by-dimension review rather than a fan-out spawn; all four Layer 1 dimensions plus four Layer 2 sections were reviewed directly against the real repo files (schema.ts, team/+page.server.ts, permissions.ts, reports/+page.server.ts, leads.ts, week-range-control/*, reminders-db.spec.ts, AppSidebar.svelte, Icon.svelte) rather than inferred from plan text alone.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Rep session hitting `/dashboard` → 403, no data rendered | Fully-Automated | `bun run test:unit -- src/tests/dashboard-gate.spec.ts` (role='rep' case) | B |
| AC2-gate | Manager/super_manager session passes the role gate | Fully-Automated | same file, role='manager'/'super_manager' cases | B |
| AC2-data | Every active rep-role AE present in `getDashboardData()` output | Hybrid | `bun run test:unit:ci -- src/tests/dashboard-db.spec.ts` (requires `DATABASE_URL`) | B |
| AC3 | Per-AE fields (leadsOwned/stageDistribution/wonAllTime/wonInRange/adherencePct/leadsAddedInRange) match hand-calculated fixture | Hybrid | same file, fixture assertions | B |
| AC4 | Range switching (`week`/`month`/`all`) changes only range-bound numbers, not all-time numbers | Hybrid | same file, 3-range comparison assertion | B |
| AC5 | Click-through `/leads?segment=all&owner=<repId>` renders that AE's filtered leads | Agent-Probe | Playwright e2e spec (self-skipping — no shared auth fixture; see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) | D |
| AC6 | Soft-deleted lead excluded from every metric | Hybrid | same file, soft-delete exclusion assertion | B |
| AC7 | `bun run check` and `bun run lint` both exit 0 | Fully-Automated | `bun run check && bun run lint` | B |
| Non-AC (INNOVATE flag) | Adherence window-function query performance sanity check | Agent-Probe | `EXPLAIN ANALYZE` on seeded data; result recorded in phase report's Test Infra Improvement Notes | D (non-blocking, not a pass/fail gate) |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — it is a named residual row carried via gap-resolution D (AC5, and the non-blocking EXPLAIN ANALYZE check), never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Gate (AC1/AC2-gate): Fully-automated: `bun run test:unit -- src/tests/dashboard-gate.spec.ts`
- Data aggregation (AC2-data/AC3/AC4/AC6): Hybrid: `bun run test:unit:ci -- src/tests/dashboard-db.spec.ts` + precondition: `DATABASE_URL` set, `bun run db:push` applied
- Click-through (AC5): agent-probe: Playwright e2e spec, currently self-skipping — known-gap: documented as pre-existing repo-wide gap, tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`
- Type/lint (AC7): Fully-automated: `bun run check && bun run lint`

Failing stub (AC1):
```
test("should throw 403 for role='rep' hitting /dashboard", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: rep session hitting /dashboard is refused access (403), no metric data rendered")
})
```

Failing stub (AC2-gate):
```
test("should pass the role gate for role='manager' and role='super_manager'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: manager/super_manager session hitting /dashboard passes the gate check")
})
```

Dimension findings:
- Infra fit: PASS — single SvelteKit app, no container/infra/runtime surface; new route + server module follow the exact shape of `/team` and `/reports`, which already exist and work.
- Test coverage: PASS — tiers correctly assigned per `process/context/tests/all-tests.md` conventions (Fully-Automated for gate + lint, Hybrid for DB aggregation matching the real `reminders-db.spec.ts` template, Agent-Probe/Known-Gap for the pre-existing e2e-auth gap). Net-gate vacuous-green rule applies: AC5 has zero automated coverage, so the overall gate cannot be a terminal PASS — classified CONDITIONAL, matching the plan's own stated intent.
- Breaking changes: PASS — no schema changes, no changes to any existing route's behavior; the one new cross-route contract (`/leads?segment=all&owner=<repId>`) was independently re-verified against `src/lib/server/db/leads.ts:373-390` (`segment='all'` bypasses the `'mine'` filter; `owner` param then scopes correctly) — the Plan-Time Correction is confirmed correct.
- Security surface: PASS — no new auth/identity/billing/schema/secrets surface; gate reuses the exact `isManagerRole()` + `error(403, ...)` pattern already shipped at `/team`. `range` query param is validated against a fixed 3-value enum before use, so no unvalidated input reaches SQL. Execute-agent instruction added: dynamic date-boundary values passed into the raw-`sql` adherence query MUST use Drizzle's tagged-template parameter interpolation, never string concatenation (E2 below).
- Section A feasibility (dashboard.ts, 6 queries): PASS — all referenced schema fields confirmed to exist (`crmUsers.role/active`, `crmLeads.ownerId/stage/deletedAt/createdAt`, `crmActivities.followUpAt/occurredAt/repId`, `crmLeadHistory.field/newValue/at`). Drizzle's native `.selectDistinctOn()` builder (confirmed already used in `leads.ts` for an equivalent "latest row per lead" pattern) should be used for `getWonInRangePerAe` instead of a raw `sql` DISTINCT ON template — execute-agent instruction E1 below. Raw `sql`/`db.execute()` is correctly reserved for the true window-function (`LEAD() OVER`) adherence query, which Drizzle has no first-class builder support for.
- Section B feasibility (route + page.svelte + RangeBucketControl): PASS — `isManagerRole` import, `error(403, ...)` pattern, `week-range-control` structural template, and `reports/+page.server.ts`'s un-awaited-promise streaming-load idiom all independently confirmed to exist as described. `goto()`/searchParams pattern confirmed via `leads/+page.svelte`.
- Section C feasibility (nav link) — CORRECTED DURING THIS VALIDATE PASS: originally FAIL (plan named `src/routes/+layout.svelte`, which contains no nav array or `isManagerRole()` reference — confirmed via grep, zero matches; the actual array and gate live in `src/lib/components/layout/AppSidebar.svelte`, and no `dashboard` icon existed in `Icon.svelte`'s `ICONS` const). Both the Touchpoints table and Checklist item 7 have been corrected in this plan file (see Validate-Time Correction section above) to target `AppSidebar.svelte`'s `manager: NavItem[]` array and reuse the existing `reports` icon glyph. Now PASS.
- Section D feasibility (dashboard-gate.spec.ts, dashboard-db.spec.ts): PASS — `reminders-db.spec.ts` confirmed as a valid, currently-passing Hybrid-test template (SKIP_DB guard, TEST_PREFIX cleanup convention, `createLead()` usage). No existing repo precedent for a load-function 403-throw unit test (first of its kind, as the plan itself notes) — execute-agent instruction E3 below documents the correct assertion idiom for SvelteKit's thrown `HttpError`.

Execute-agent instructions (from Section A/D findings above):
- E1: Implement `getWonInRangePerAe` using Drizzle's native `.selectDistinctOn([crmLeadHistory.leadId], {...}).orderBy(crmLeadHistory.leadId, desc(crmLeadHistory.at))` builder method (same idiom already used in `src/lib/server/db/leads.ts` for the "current follow-up per lead" pattern) rather than a raw `sql` DISTINCT ON template.
- E2: In the adherence window-function raw-`sql` block, pass all dynamic values (range boundary dates) via Drizzle's tagged-template parameter interpolation (`sql\`... ${dateVar} ...\``) — never string-concatenate into the SQL text, even though `range` itself is already validated against a fixed enum before reaching this point.
- E3: For `dashboard-gate.spec.ts`, assert the 403 throw via `await expect(load(...)).rejects.toMatchObject({ status: 403 })` (or equivalent) — SvelteKit's `error()` throws an `HttpError`; there is no existing repo precedent to copy for this exact assertion shape.
- E4: When implementing `getActiveAeList()`, use the plan's resolved Decision (`eq(crmUsers.role, 'rep') AND eq(crmUsers.active, true)`) — ignore any earlier draft phrasing that implied an OR against manager roles.

Open gaps: none unresolved. AC5 (click-through e2e) is the sole outstanding item, carried as a pre-accepted, pre-existing repo-wide known-gap (not new to this feature) — see backlog reference below. No new backlog artifact required.

Backlog reference (pre-existing, not created by this VALIDATE pass): `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — tracks the repo-wide missing Playwright authenticated-session fixture that blocks AC5 (and every other feature's protected-route e2e coverage).

What this coverage does NOT prove:
- The Fully-Automated gate tests (AC1/AC2-gate/AC7) prove the role-gate throws/passes correctly and that the codebase typechecks/lints — they do NOT prove the page actually renders correctly in a browser, nor that the nav link appears/hides correctly for each role (no e2e coverage of the nav link itself).
- The Hybrid DB tests (AC2-data/AC3/AC4/AC6) prove the aggregation queries return mathematically correct numbers against a seeded fixture — they do NOT prove the `+page.svelte` template renders those numbers correctly, nor that `RangeBucketControl.svelte`'s click handler actually triggers the correct `goto()` navigation (no component-level or e2e test of the UI wiring).
- The Agent-Probe `EXPLAIN ANALYZE` check proves the adherence query does not exhibit obvious full-table-scan pathology against the current (small) seed volume — it does NOT prove performance at production data scale, and is explicitly non-blocking per INNOVATE.
- AC5's Known-Gap status proves nothing about the drill-through link's actual runtime behavior — it is untested until the shared Playwright auth fixture lands.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: CONDITIONAL (0 unresolved FAILs — the one FAIL found at Layer 2 Section C was corrected in this same VALIDATE pass; 0 unresolved CONCERNs; 1 pre-accepted known-gap: AC5)
Accepted by: session (orchestrator-delegated VALIDATE pass) — AC5 explicitly pre-designated as an accepted, pre-existing repo-wide known-gap per the task delegation and `e2e-auth-bootstrap_NOTE_01-07-26.md`; no new infra invented to force it green.

## Autonomous Goal Block

SESSION GOAL: Ship the manager-only per-AE performance dashboard (`/dashboard`, GitHub #244 / DASH-1) — 6 aggregation queries, a 3-bucket range filter, and a manager-gated route/nav entry.
Charter + umbrella plan: N/A — single plan (no phase-program umbrella exists for `manager-dashboard`).
Autonomy: standard RIPER-5 gates apply (EXECUTE requires explicit "ENTER EXECUTE MODE"); no standing /goal autonomy has been granted for this task.
Hard stop conditions / safety constraints:
- No schema/migration changes permitted under this plan — any discovered need for a schema change is new scope requiring its own plan/validate cycle.
- Do not touch `src/lib/server/mock.ts` or import from it.
- Do not modify `/reports`, `/team`, or any existing route's behavior.
- AC5 (click-through e2e) stays CONDITIONAL/known-gap — do not invent new Playwright auth infra to force it green; that is a separate, pre-existing repo-wide backlog item.
- `bun run check && bun run lint` must exit 0 before this plan can be considered CODE DONE (AC7, non-negotiable).
Next phase: EXECUTE — `process/features/manager-dashboard/active/manager-dashboard_07-07-26/manager-dashboard_PLAN_07-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` section above)
Execute start: `bun run test:unit -- src/tests/dashboard-gate.spec.ts` (Fully-Automated, once written) | `bun run test:unit:ci -- src/tests/dashboard-db.spec.ts` (Hybrid, once written, requires `DATABASE_URL`) | Playwright click-through probe (Known-Gap, self-skipping) | high-risk pack: no
