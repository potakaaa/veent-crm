---
name: plan:ufg-country-category-filters
description: "Country + category multi-select filters on /unassigned (Up for Grabs) — GitHub #91"
date: 01-07-26
feature: leads
---

# PLAN — Up for Grabs: Country and Category Filters (GitHub #91)

Date: 01-07-26
Complexity: Simple
Status: PLANNED

Single-session feature, ~6 files, no schema/auth/API changes, bounded server-side filter addition
following an existing sibling pattern (`listLeadsFiltered()` / `getLeadCountries()` on `/leads`).

Context loaded during PLAN per `process/context/all-context.md` routing: `process/context/tests/all-tests.md`
(test runner/commands) and `process/context/planning/all-planning.md` (plan-shape calibration).

## Overview

Add multi-select Country and Category filter controls to `/unassigned` (Up for Grabs), matching
the SPEC's 13 acceptance criteria. Filters are URL-param-driven (comma-joined CSV), applied
server-side in `listUnassignedLeads()`, and update the list via existing SvelteKit soft
navigation (`goto()` + `SvelteURLSearchParams`) — no full page reload.

## Goals

- Two new filter popovers (Country, Category) at the top of `/unassigned`.
- Multi-select per filter; selections are OR'd within a filter, AND'd across filters.
- Server-side `inArray()` filtering in `listUnassignedLeads()`.
- Country options: real distinct values scoped to the unassigned-queue predicate (new helper).
- Category options: static array from the `leadCategory` Postgres enum.
- Clear-all / per-filter clear affordance.
- Zero-match distinct empty state.
- No regression to existing claim / bulk-claim / bulk-assign / inline-edit / sort behavior.

## Scope

In scope: `/unassigned` route only (server load, DB query, UI). Out of scope: `/leads`,
`/pipeline`, new DB columns/migrations, cross-session persistence, additional filter dimensions
beyond country/category — see SPEC §Out Of Scope for the full list (this plan does not repeat it).

## Locked Decisions (from INNOVATE — do not re-decide during EXECUTE)

1. **Multi-select UI**: new page-local Svelte component composed from the existing `Popover`
   primitive (`src/lib/components/ui/popover` — `Popover.Root` / `Trigger` / `Content`). Trigger
   button shows the filter name + count when active (e.g. `Country (2)`); panel contains native
   `<input type="checkbox">` rows, one per option. No new `ui/` primitive, no new dependency.
2. **URL param encoding**: comma-joined single param per filter, reusing the existing `country`
   and `category` param names for naming consistency with `/leads` (though `/unassigned` has no
   prior `country`/`category` params to collide with) — e.g. `?country=US,PH&category=Concert,Sports`.
   - Write: `selected.join(',')` when non-empty, else `undefined` (param removed) — via the same
     `navigate()` patch-merge helper already used on this page for sort/page.
   - Read: `url.searchParams.get('country')?.split(',').filter(Boolean) ?? []` — the
     `.filter(Boolean)` is REQUIRED to strip empty-string elements from edge cases like a
     trailing comma or an empty param value, which would otherwise become a stray
     `inArray(col, [''])` clause that matches nothing but silently misrepresents "no filter."
3. **Category options**: static array from `leadCategory.enumValues` (Drizzle pgEnum export,
   `src/lib/server/db/schema.ts:25`). Never DB-queried — matches SPEC AC#12 and the "enum-derived,
   not query-derived" constraint.
4. **Country options**: NEW server helper `getUnassignedLeadCountries()` in
   `src/lib/server/db/leads.ts`. Mirrors `getLeadCountries()`'s `selectDistinct` shape (lines
   194-201) but scoped to the SAME `where` predicate `listUnassignedLeads()` uses (`isNull(ownerId)`,
   `isNull(deletedAt)`, `stage NOT IN ('won','lost')`). Do NOT reuse `getLeadCountries()` — it
   queries ALL leads unscoped and would offer country options for leads that aren't even in the
   Up for Grabs queue, violating SPEC AC#11.
5. **Server-side filtering**: add `country?: string[]` and `category?: string[]` params to
   `listUnassignedLeads()` (`src/lib/server/db/leads.ts` ~line 362), following the sibling
   `listLeadsFiltered()` pattern (~line 227-265) — use Drizzle `inArray(crmLeads.country, values)`
   / `inArray(crmLeads.category, values)` when the respective array is non-empty; omit the
   condition entirely when empty (empty selection = no restriction, per SPEC).
6. **Route wiring**: `src/routes/unassigned/+page.server.ts` reads `country`/`category` search
   params (split/filter CSV as in decision 2), passes them to `listUnassignedLeads()`, and loads
   both filter option sets (`leadCategory.enumValues` + `getUnassignedLeadCountries()`) into page
   data alongside the existing `leads`/`users`/`sort`/`dir`/`pagination` fields.
7. **Client wiring**: `src/routes/unassigned/+page.svelte` gets the new filter popover(s) rendered
   near `PageHeader`, wired through the EXISTING `navigate()` helper already in this file (added by
   the prior `ufg-inline-edit-review-removal` work, lines 74-81) — reuse it, do not duplicate it.
   Selecting a filter value must also reset `page` (pass `page: undefined` in the same `navigate()`
   patch call, matching the sort-toggle precedent at line 98).
8. **Explicit risk-mitigation checklist items** (from vc-predict — do not assume, verify in EXECUTE):
   - Clear-all / per-filter clear affordance (SPEC AC#10) is an explicit checklist item below, not
     an implied side-effect of the popover UI.
   - CSV parse MUST `.filter(Boolean)` after `.split(',')` (decision 2) — add this as an explicit
     assertion in the Vitest unit test for the parsing helper.
   - `getUnassignedLeadCountries()` MUST exactly mirror `listUnassignedLeads()`'s where-scope — add
     a unit test asserting the two functions' filter predicates stay in sync (see Verification
     Evidence, gate #11).
9. **Out of scope** (do not touch): `/leads`, `/pipeline` filter UI/logic; no new DB columns or
   migrations; no Superforms/Zod (GET-based read filters — manual array validation in
   `+page.server.ts`, consistent with `/leads`' existing `url.searchParams.get(...)` style, not a
   Superforms submission).

## Touchpoints

| File | Change | Est. lines |
|---|---|---|
| `src/lib/server/db/leads.ts` | Add `getUnassignedLeadCountries()` (~15 lines, mirrors `getLeadCountries()` lines 194-201); extend `listUnassignedLeads()` signature + `where` builder to accept `country?: string[]` / `category?: string[]` and add `inArray()` conditions (~15 lines changed in the existing function body, lines 362-410) | ~30 |
| `src/routes/unassigned/+page.server.ts` | Parse `country`/`category` CSV params; call `getUnassignedLeadCountries()`; pass filter arrays into `listUnassignedLeads()`; add `categoryOptions`/`countryOptions`/`filters` to returned page data | ~20 |
| `src/routes/unassigned/+page.svelte` | Add two `MultiSelectFilter` component instances near `PageHeader`; wire `onchange` to existing `navigate()` helper with `page: undefined` reset; add zero-match empty state branch (distinct from "queue clear" message); add "Clear all filters" action when any filter is active | ~40 |
| `src/lib/components/leads/MultiSelectFilter.svelte` (NEW) | Reusable page-local popover multi-select: trigger button (`Label (N)`) + checkbox list panel; props: `label`, `options: string[]`, `selected: string[]`, `onchange: (values: string[]) => void` | ~70 (new file) |
| `src/tests/leads.spec.ts` (**CORRECTED at VALIDATE — this file already exists**: pure-function Vitest tests, no DB. Append the CSV-parse `.filter(Boolean)` test and the category-options-equal-enum test here; do not create a new file.) | Vitest unit tests: CSV-parse `.filter(Boolean)` behavior; category options are enum-derived | append, ~30 |
| `src/tests/leads-filters.spec.ts` (**CORRECTED at VALIDATE — this file already exists** and already has a `describe.skipIf(SKIP_DB)` real-DB integration pattern testing `getLeadCountries()`. Append `getUnassignedLeadCountries()` where-scope-parity tests and `listUnassignedLeads()` country/category multi-select tests here, following the exact same pattern — do not invent a new mocking strategy.) | Vitest Hybrid (DB) tests: multi-country union, multi-category union, combined AND, `getUnassignedLeadCountries()` where-scope parity, zero-match-returns-empty-array | append, ~60 |
| `e2e/unassigned-filters.e2e.ts` (**CORRECTED at VALIDATE — path and extension were wrong**. `playwright.config.ts`'s `testMatch` is `**/*.e2e.{ts,js}`; the repo's e2e directory is `e2e/` (4 specs already live there: `leads-discard.e2e.ts`, `leads-new-dedup-hover.e2e.ts`, `loading-ux.e2e.ts`, `ufg-inline-edit.e2e.ts`). The original `tests/unassigned-filters.spec.ts` path would never be collected by Playwright at all.) | e2e scenarios for the UI-level ACs that remain runnable once the e2e-auth-bootstrap gap (see Test Infra Improvement Notes) is resolved — write the spec now as a **known-gap stub** (see Validate Contract) so it is ready the moment that infra lands; do not block this plan's EXECUTE on writing it fully green today | new file |

No changes to: `src/lib/server/db/schema.ts`, `src/lib/zod/schemas.ts`, any `/leads` or `/pipeline`
route, `src/lib/types/` (no new fields needed — filters are plain `string[]` params, not typed
domain objects).

## Public Contracts

- `listUnassignedLeads(page, pageSize, sort, dir, filters?)` — signature gains an optional 5th
  param `filters?: { country?: string[]; category?: string[] }` (or equivalent positional/object
  shape decided at EXECUTE — keep backward compatible: omitting the param must behave identically
  to today, since `getNavCounts()` and any other caller does not pass filters).
  **Confirmed at VALIDATE**: `listUnassignedLeads` has exactly ONE caller in the entire codebase
  (`src/routes/unassigned/+page.server.ts:15`) — the backward-compatibility claim is safe and the
  additive-signature approach carries zero breaking-change risk.
- New export `getUnassignedLeadCountries(): Promise<string[]>` from `src/lib/server/db/leads.ts`.
- `+page.server.ts` load return shape gains `categoryOptions: string[]`, `countryOptions: string[]`,
  `filters: { country: string[]; category: string[] }` — additive only, no existing field removed
  or renamed (verify `+page.svelte` and any other consumer of this load's `data` are unaffected by
  the additive shape).
- No changes to `/api/leads/*` route contracts — filtering is load-time only, not exposed as an API.

## Blast Radius

- **Files touched**: 7 (1 new component, 1 new e2e spec, 2 appended existing test files, 3
  modified) — see Touchpoints table (corrected at VALIDATE: `src/tests/leads.spec.ts` and
  `src/tests/leads-filters.spec.ts` already exist; only `MultiSelectFilter.svelte` and
  `e2e/unassigned-filters.e2e.ts` are genuinely new files).
- **Packages**: single SvelteKit app (`veent-crm`), no monorepo package boundary crossed.
- **Risk class**: none of the high-risk classes apply (no auth, no billing, no schema/migration,
  no public API contract change, no container/proxy/gateway, no secrets). Standard read-path
  feature risk only. (Note: VALIDATE surfaced a *pre-existing, repo-wide* auth-adjacent test-infra
  gap — see Validate Contract — but this plan's own change does not touch auth surfaces.)
- **Regression surface**: `/unassigned` claim / bulk-claim / bulk-assign / inline-edit / sort /
  pagination — all must continue working unchanged with filters active (SPEC AC#13, Constraint 1).

## Implementation Checklist

1. Read `leadCategory.enumValues` full list directly from `src/lib/server/db/schema.ts` (do not
   hardcode categories anywhere in UI or tests — SPEC explicitly calls this out).
2. In `src/lib/server/db/leads.ts`: add `getUnassignedLeadCountries()` — `selectDistinct` on
   `crmLeads.country`, `where` = same predicate as `listUnassignedLeads()` (`isNull(ownerId)`,
   `isNull(deletedAt)`, `ne(stage,'won')`, `ne(stage,'lost')`), `isNotNull(country)`, ordered `asc`.
3. In `src/lib/server/db/leads.ts`: extend `listUnassignedLeads()` to accept `country?: string[]`
   and `category?: string[]`; when non-empty, add `inArray(crmLeads.country, country)` /
   `inArray(crmLeads.category, category)` to the `and(...)` where-builder; when empty/omitted, add
   no condition (existing behavior unchanged — confirms backward compatibility).
4. In `src/routes/unassigned/+page.server.ts`: parse `country`/`category` from
   `url.searchParams.get(...)`, `.split(',').filter(Boolean)`, default to `[]`; call
   `getUnassignedLeadCountries()` alongside the existing `listUnassignedLeads()`/`listUsers()`
   `Promise.all`; pass parsed filter arrays into `listUnassignedLeads()`; return `categoryOptions`
   (from `leadCategory.enumValues`), `countryOptions`, and `filters: { country, category }` in the
   load result.
5. Create `src/lib/components/leads/MultiSelectFilter.svelte`: `Popover.Root` +
   `Popover.Trigger` (button showing `{label}{selected.length ? ` (${selected.length})` : ''}`) +
   `Popover.Content` (checkbox list, one `<input type="checkbox">` per option, each toggling
   membership in a local working `selected` array) + an in-panel "Clear" button that empties the
   selection for that filter only. Calls `onchange(newSelected: string[])` on every toggle/clear
   (no separate "Apply" step — matches the SPEC's "updates instantly" requirement).
6. In `src/routes/unassigned/+page.svelte`: render two `MultiSelectFilter` instances (Country,
   Category) near `PageHeader`, sourcing `options` from `data.countryOptions`/`data.categoryOptions`
   and `selected` from `data.filters.country`/`data.filters.category`; `onchange` handler calls the
   existing `navigate()` helper with `{ country: values.join(',') || undefined, page: undefined }`
   (and the category equivalent).
7. Add a page-level "Clear all filters" action (visible only when `data.filters.country.length ||
   data.filters.category.length` is true) that calls `navigate({ country: undefined, category:
   undefined, page: undefined })` in one call — satisfies SPEC AC#10 as an explicit, testable item
   (not assumed from the per-filter clear in step 5).
8. Add the zero-match empty state: when `shadowLeads.length === 0` AND any filter is active, render
   `"No leads match your filters."` (or equivalent copy) instead of the existing `"No leads up for
   grabs — queue clear."` message (`+page.svelte` line ~377) — the two states must be visibly
   distinct per SPEC AC#9.
9. Verify existing claim / bulk-claim / bulk-assign / inline-edit / sort / pagination handlers in
   `+page.svelte` are untouched — they operate on `shadowLeads` (server-filtered result), so no
   client-side re-filtering logic should be introduced anywhere in this file.
10. Append Vitest unit tests to the EXISTING `src/tests/leads.spec.ts` (**corrected at VALIDATE —
    do not create a new file**): CSV-parse-and-filter-Boolean behavior; category options equal
    `leadCategory.enumValues` exactly.
11. Append Vitest Hybrid (DB-integration) tests to the EXISTING `src/tests/leads-filters.spec.ts`
    (**corrected at VALIDATE — do not invent a new mock strategy; follow its established
    `describe.skipIf(SKIP_DB)` real-Postgres pattern**, same as its existing `getLeadCountries`
    tests): `getUnassignedLeadCountries()` returns only countries from unowned/non-won/non-lost/
    non-deleted leads; `listUnassignedLeads()` multi-country union; multi-category union; combined
    AND-across-filter-types; zero-match combination returns an empty array.
12. Write Playwright e2e spec at `e2e/unassigned-filters.e2e.ts` (**corrected at VALIDATE — path/
    extension fixed to match `playwright.config.ts`'s `testMatch: '**/*.e2e.{ts,js}'`**) covering
    the UI-level ACs (AC#1, AC#5, AC#6, AC#7, AC#8, AC#9's empty-state render, AC#10, AC#13). Per
    the Validate Contract, these are currently a documented **Known-Gap** (blocked on the repo-wide
    e2e-auth-bootstrap gap — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
    Write the spec now with `test.fixme(...)` or an equivalent explicit skip + a comment pointing at
    the backlog note, so it is ready to un-skip the moment the auth-bootstrap infra lands — do not
    block EXECUTE completion on making this file fully green today.
13. Run `bun run check`, `bun run test:unit` (per `all-tests.md` Default Verification Order) and
    fix any failures before considering the plan EXECUTE-complete. `bun run test:e2e` is expected
    to still report 0 meaningfully-passing assertions for the new spec (fixme'd) — this is the
    accepted CONDITIONAL gap, not a regression to chase during this EXECUTE pass.

## Verification Evidence

| Gate / Scenario | Strategy (corrected at VALIDATE) | Proves SPEC criterion |
|---|---|---|
| Playwright: Up for Grabs page renders Country + Category filter controls on load | Known-Gap (e2e-auth-bootstrap missing) | AC#1 |
| Vitest (Hybrid, real DB): `listUnassignedLeads({ country: [A,B] })` returns the union of both countries' leads | Hybrid | AC#2 |
| Vitest (Hybrid, real DB): `listUnassignedLeads({ category: [A,B] })` returns the union of both categories' leads | Hybrid | AC#3 |
| Vitest (Hybrid, real DB): `listUnassignedLeads({ country: [A], category: [B] })` returns only leads matching both | Hybrid | AC#4 |
| Playwright: filter change triggers no full document reload | Known-Gap (e2e-auth-bootstrap missing) | AC#5 |
| Playwright: with a filter active, sort/page/claim/bulk-claim/bulk-assign → filter selection remains applied | Known-Gap (e2e-auth-bootstrap missing) | AC#6 |
| Playwright: apply filter, reload the same URL → filter selection persists | Known-Gap (e2e-auth-bootstrap missing) | AC#7 |
| Playwright: on page 2+, apply a filter → page resets to 1 | Known-Gap (e2e-auth-bootstrap missing) | AC#8 |
| Vitest (Hybrid, real DB): filter combination matching zero leads returns an empty array from `listUnassignedLeads()` | Hybrid | AC#9 (DB half) |
| Playwright: zero-match combination shows the distinct "no leads match your filters" UI state | Known-Gap (e2e-auth-bootstrap missing) | AC#9 (UI half) |
| Playwright: with filters active, click "Clear all filters" → full unfiltered queue returns, URL params removed | Known-Gap (e2e-auth-bootstrap missing) | AC#10 |
| Vitest (Hybrid, real DB): `getUnassignedLeadCountries()` returns only countries present among unowned/active leads (matches `listUnassignedLeads()`'s where-scope) | Hybrid | AC#11 |
| Vitest (Fully-Automated, no DB): category filter options equal `leadCategory.enumValues` exactly | Fully-Automated | AC#12 |
| Playwright: regression pass — claim, bulk-claim, bulk-assign, inline-edit, sort all function correctly with a filter active | Known-Gap (e2e-auth-bootstrap missing) | AC#13 |
| Vitest (Fully-Automated, no DB): CSV parse of `country`/`category` search params strips empty strings via `.filter(Boolean)` | Fully-Automated | Risk mitigation (decision 8) |

**VALIDATE correction summary**: 9 of the original 13 "Fully-Automated (Playwright)" rows are
reclassified. 5 rows move to **Hybrid** (real-DB Vitest, following the existing
`describe.skipIf(SKIP_DB)` precedent in `src/tests/leads-filters.spec.ts` — provably correct
today, no infra gap). 8 rows (AC1, AC5, AC6, AC7, AC8, AC9-UI-half, AC10, AC13) move to
**Known-Gap**, blocked on a repo-wide e2e-auth-bootstrap gap that predates this plan — see Validate
Contract below and `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. 2 rows
(AC12, CSV-parse) remain genuinely **Fully-Automated** (pure functions, no DB/auth dependency).

## Test Infra Improvement Notes

**CORRECTED AT VALIDATE (both bullets below were factually wrong in the original PLAN — see
Validate Contract for full findings):**

- ~~"No Playwright e2e spec files exist anywhere in this repo yet... first e2e spec... DEV_BYPASS
  = true"~~ — **False.** Four e2e specs already exist: `e2e/leads-discard.e2e.ts`,
  `e2e/leads-new-dedup-hover.e2e.ts`, `e2e/loading-ux.e2e.ts`, `e2e/ufg-inline-edit.e2e.ts`.
  `src/hooks.server.ts` has **zero** `DEV_BYPASS` references — that stub was removed when real
  Better Auth (magic-link + Resend + `crm_users` allowlist) was wired (commit `79a229c`). All 4
  existing specs still carry a stale doc-comment claiming `DEV_BYPASS=true` as their precondition;
  in reality, **no e2e session-bootstrap mechanism exists for the real auth flow** — every
  `page.goto()` to a protected route (including `/unassigned`) currently redirects to `/login`.
  This is a genuine, repo-wide, pre-existing infra gap, tracked at
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (written during this
  VALIDATE pass). It is NOT scoped to this plan to fix — see the Validate Contract's Known Gaps
  section for how this plan proceeds despite it.
- ~~"No existing Vitest fixture/mock pattern for `db.selectDistinct`-style queries..."~~ —
  **False.** `src/tests/leads-filters.spec.ts` already has a working `describe.skipIf(SKIP_DB)`
  real-Postgres integration-test pattern that directly tests `getLeadCountries()` (a
  `selectDistinct` query) — gated on `DATABASE_URL`, skipped automatically in CI (no Postgres
  service configured), runnable locally via `docker compose up -d db`. `getUnassignedLeadCountries()`
  tests should follow this exact precedent (see Implementation Checklist step 11), not invent a new
  mocking strategy.
- `process/context/tests/all-tests.md`'s "Known Gaps" section is also stale as of this VALIDATE
  pass (claims "No e2e test specs written yet" and "No test coverage for Drizzle queries" — both
  contradicted by the files above). Flagged as a non-blocking context-maintenance item for UPDATE
  PROCESS; not fixed inline here since it is out of this plan's blast radius.

## Phase Loop Progress (Phase Completion Rules)

- [x] 1a. Research updated — context and codebase scan complete (this PLAN was written directly
      from a research-equivalent codebase scan of `leads.ts`, `/unassigned`, `/leads`, and the
      `popover` primitive; no separate research report needed for a SIMPLE plan)
- [x] 1b. Plan supplemented — VALIDATE (this pass) corrected the e2e file path/extension, the
      "first e2e spec"/DEV_BYPASS claims, the test-tier assignments for 9 of 13 ACs, and the
      DB-mock-pattern claim; see Validate Contract and inline `**CORRECTED AT VALIDATE**` markers
      above.
- [ ] 2. Validate contract written — vc-validate-agent gate verdict is CONDITIONAL (first pass) —
      NOT yet accepted; do not proceed to EXECUTE until the gate is PASS or a user explicitly
      accepts the CONDITIONAL gaps below.
- [ ] 3. Execute complete — all 13 checklist items done, `bun run check` / `test:unit` pass;
      `test:e2e` expected to remain non-green for the fixme'd e2e spec until the e2e-auth-bootstrap
      backlog item resolves (accepted gap, not a regression).
- [ ] 4. Update process — plan archived, `process/features/leads/_GUIDE.md` status updated,
      `process/context/tests/all-tests.md` Known Gaps section refreshed (see Test Infra Improvement
      Notes), memory notes written if any durable pattern was discovered.
- [ ] 5. Report written — execute report filed inside this task folder.

> **IMPORTANT:** Step 2 is never skippable. A placeholder Validate Contract is a blocker — do not
> proceed to step 3 (EXECUTE) until a vc-validate-agent gate verdict (PASS or accepted CONDITIONAL)
> is present in the `## Validate Contract` section below. This plan currently has a first-pass
> CONDITIONAL — a plan-validate-fix supplement cycle (or explicit user acceptance of the Known Gaps
> below) is required before EXECUTE.

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/leads/active/ufg-country-category-filters_01-07-26/ufg-country-category-filters_PLAN_01-07-26.md`
2. **Last completed phase or step**: VALIDATE (V1-V7) complete — first-pass CONDITIONAL gate.
   Plan text corrected in place per the findings below; a plan-validate-fix supplement cycle or
   explicit user acceptance of the Known Gaps is the next step before EXECUTE.
3. **Validate-contract status**: written below — Gate: CONDITIONAL (first pass, not yet accepted).
4. **Supporting context files loaded during PLAN + VALIDATE**: `process/context/all-context.md`
   (root router), SPEC (`ufg-country-category-filters_SPEC_01-07-26.md`),
   `process/context/planning/all-planning.md`, `process/features/leads/_GUIDE.md`,
   `process/context/tests/all-tests.md`, `src/lib/server/db/leads.ts`,
   `src/routes/unassigned/+page.server.ts`, `src/routes/unassigned/+page.svelte`,
   `src/routes/leads/+page.svelte`, `src/routes/leads/+page.server.ts`,
   `src/lib/components/ui/popover/index.ts`, `src/lib/server/db/schema.ts`,
   `src/hooks.server.ts`, `src/lib/server/auth.ts`, `src/tests/hooks-server.spec.ts`,
   `src/tests/leads-db.spec.ts`, `src/tests/leads-filters.spec.ts`, `src/tests/leads.spec.ts`,
   `e2e/ufg-inline-edit.e2e.ts`, `e2e/leads-discard.e2e.ts`, `playwright.config.ts`,
   `.github/workflows/ci.yml`.
5. **Next step for a fresh agent picking up mid-execution**: resolve the CONDITIONAL gate first
   (plan-validate-fix supplement cycle, or explicit user acceptance of the Known Gaps section
   below), THEN EXECUTE the Implementation Checklist in order (steps 1-13). Steps 2-3 (DB layer)
   must land before steps 4-9 (route/UI) can compile against the new signatures. Steps 10-12
   (tests) can be written TDD-first alongside 2-9 per the tier assignments above.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 present — 6-7 files in blast radius; no multi-package
scope, no schema/API/auth surface, no phase program, no high-risk class, single locked direction
from INNOVATE). `vc-agent-strategy-compare` recommends sequential/direct analysis over any fan-out
spawn for this VALIDATE pass — confirmed by running the full Layer 1 + Layer 2 check directly
against real source files rather than spawning parallel dimension agents.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC#1 | Country + Category filter controls visible on `/unassigned` load | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd — blocked on e2e-auth-bootstrap) | D |
| AC#2 | Multi-country selection returns union of leads across selected countries | Hybrid | `bun run test:unit -- src/tests/leads-filters.spec.ts` (new `listUnassignedLeads` multi-country describe block) — precondition: `DATABASE_URL` set / `docker compose up -d db` | A |
| AC#3 | Multi-category selection returns union of leads across selected categories | Hybrid | `bun run test:unit -- src/tests/leads-filters.spec.ts` (new multi-category describe block) — same precondition | A |
| AC#4 | Country + category combine as AND across filter types | Hybrid | `bun run test:unit -- src/tests/leads-filters.spec.ts` (new combined-filter describe block) — same precondition | A |
| AC#5 | Filter change causes no full document reload | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#6 | Filter selection persists across sort/page/claim/bulk-claim/bulk-assign | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#7 | Filter selection persists across a same-URL reload | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#8 | Applying a filter resets to page 1 | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#9 (DB half) | Zero-match filter combination returns an empty leads array | Hybrid | `bun run test:unit -- src/tests/leads-filters.spec.ts` (new zero-match describe block) — same precondition | A |
| AC#9 (UI half) | Zero-match combination renders distinct "no leads match your filters" state | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#10 | "Clear all filters" returns to unfiltered queue, URL params removed | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| AC#11 | `getUnassignedLeadCountries()` matches `listUnassignedLeads()`'s where-scope | Hybrid | `bun run test:unit -- src/tests/leads-filters.spec.ts` (new `getUnassignedLeadCountries` describe block, following the existing `getLeadCountries` `describe.skipIf(SKIP_DB)` pattern) — same precondition | A |
| AC#12 | Category filter options equal `leadCategory.enumValues` exactly | Fully-Automated | `bun run test:unit -- src/tests/leads.spec.ts` | A |
| AC#13 | Claim/bulk-claim/bulk-assign/inline-edit/sort unaffected by an active filter | Known-Gap | `e2e/unassigned-filters.e2e.ts` (fixme'd) | D |
| Risk mitigation (decision 8) | CSV parse of `country`/`category` strips empty strings via `.filter(Boolean)` | Fully-Automated | `bun run test:unit -- src/tests/leads.spec.ts` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle, once Implementation Checklist steps 10-11 are written)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue) — tracked at
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

C-4 reconciliation: the `strategy:` column above carries only the 3 proving strategies
(Fully-Automated / Hybrid / Agent-Probe). Known-Gap rows above are named residuals proven by
NOTHING today — they are carried via gap-resolution D, not treated as a proving strategy. This is
why the net gate below is CONDITIONAL, not PASS: 8 of 14 rows have zero automated gate today.

Legacy line form (retained so existing validate-contract consumers still parse):
- DB filter logic (AC2, AC3, AC4, AC9-DB, AC11): Hybrid: `bun run test:unit -- src/tests/leads-filters.spec.ts` (precondition: `DATABASE_URL` / local Postgres via `docker compose up -d db`)
- Pure-function logic (AC12, CSV-parse): Fully-automated: `bun run test:unit -- src/tests/leads.spec.ts`
- UI/browser behavior (AC1, AC5, AC6, AC7, AC8, AC9-UI, AC10, AC13): known-gap: documented as NEW PLAN REQUIRED — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

Dimension findings:
- Infra fit: PASS — single SvelteKit app, no container/infra/worker surface crossed; all
  touchpoint file paths and line references verified against real source (`leads.ts` lines
  194-201, 362-410; `+page.svelte` lines 74, 98, 377) and are accurate.
- Test coverage: CONCERN — original plan's e2e strategy was mechanically broken (wrong
  path/extension — would never be collected by Playwright) and rested on two false factual
  claims ("first e2e spec", "DEV_BYPASS exists"). Real root cause: a repo-wide, pre-existing
  e2e-auth-bootstrap gap (real Better Auth has no session-seed mechanism for Playwright) blocks
  9 of 13 ACs from genuine automated proof. Mitigated by reclassifying 5 rows to Hybrid
  (DB-level proof, existing precedent) and explicitly naming the remaining 8 as Known-Gap
  (backlog-tracked, not silently absorbed). See "What This Coverage Does NOT Prove" below.
- Breaking changes: PASS — `listUnassignedLeads` confirmed to have exactly one caller
  (`+page.server.ts:15`); new optional trailing param is additive and backward-compatible; no
  other consumer of the load-data shape exists.
- Security surface: PASS — no auth, billing, schema/migration, public-API-contract, container/
  proxy/gateway, or secrets/trust-boundary surface touched by this plan's own change. (The
  e2e-auth-bootstrap gap found during this VALIDATE is auth-*adjacent test infra*, not a security
  regression introduced by this plan.)
- Touchpoints/DB layer feasibility: PASS — `getUnassignedLeadCountries()` and the
  `listUnassignedLeads()` extension are mechanically confirmed against real source; no conflicts.
- Route/UI feasibility: PASS — `navigate()` helper (line 74), `PageHeader` (line 238), and the
  empty-state message (line 377) all confirmed at the exact claimed locations; Popover primitive
  exports confirmed present.
- Test-infra feasibility: FAIL→CORRECTED — original claims about e2e-spec count, DEV_BYPASS, and
  the absence of a DB-mock pattern were all factually wrong; corrected inline in the plan body
  above (Touchpoints, Test Infra Improvement Notes, Verification Evidence sections).

Open gaps:
- AC1, AC5, AC6, AC7, AC8, AC9 (UI half), AC10, AC13: known-gap: documented as NEW PLAN REQUIRED
  — see backlog/e2e-auth-bootstrap_NOTE_01-07-26.md
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- `process/context/tests/all-tests.md` Known Gaps section is stale (claims no e2e specs / no
  Drizzle query coverage exist — both false) — non-blocking context-maintenance item, defer to
  UPDATE PROCESS.

What this coverage does NOT prove:
- The Hybrid gates (AC2, AC3, AC4, AC9-DB, AC11) prove server-side filter correctness against a
  real Postgres instance. They do NOT prove the browser ever renders the resulting leads, that
  the `navigate()` call actually reaches the server with the right params, or that the popover UI
  correctly reflects `selected` state — those are exactly the Known-Gap rows.
- The Fully-Automated gates (AC12, CSV-parse) prove pure-function correctness in isolation. They
  do NOT prove `+page.server.ts` actually calls `.split(',').filter(Boolean)` correctly on a real
  incoming `URL` object, nor that the enum list is rendered correctly in the checkbox panel.
- The Known-Gap rows (AC1, AC5, AC6, AC7, AC8, AC9-UI, AC10, AC13) prove nothing today. Manual
  verification (click through `/unassigned` locally with a real session) is the only current
  evidence source for these until the e2e-auth-bootstrap backlog item resolves. EXECUTE must not
  report these as "tested" — only as "manually spot-checked" or "unverified", explicitly.
- None of the gates above prove concurrent-filter-change race conditions, extremely large
  selected-value counts (URL length limits), or cross-browser popover rendering differences —
  out of scope for this plan's tier, not tracked as a gap (low-probability, low-impact for an
  internal CRM tool).

Known Gaps (Resolved via Backlog):
- e2e-auth-bootstrap (AC1, AC5, AC6, AC7, AC8, AC9-UI, AC10, AC13): known-gap: documented as NEW
  PLAN REQUIRED — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. This
  gap pre-dates this plan (introduced when DEV_BYPASS was removed and real Better Auth was wired,
  commit `79a229c`) and affects all 4 pre-existing e2e specs equally — it is not scoped to this
  plan's blast radius to fix under a SIMPLE classification.

Gate: CONDITIONAL (0 FAILs at dimension level after in-place plan corrections; 1 CONCERN cluster
— Test coverage — carrying 8 Known-Gap rows that are honestly named per the vacuous-green-ban
rule, not silently absorbed as a false PASS)
Accepted by: PENDING — first-pass CONDITIONAL. Not yet accepted by user/session. Per protocol, do
NOT proceed to EXECUTE until either (a) a plan-validate-fix supplement cycle runs and the gate
reaches PASS, or (b) the user/session explicitly accepts the 8 Known-Gap rows above by name in a
follow-up turn (at which point this line should be updated to
`Accepted by: user — accepted AC1, AC5, AC6, AC7, AC8, AC9-UI, AC10, AC13 as known-gaps`).

## Autonomous Goal Block

SESSION GOAL: Add multi-select Country + Category filters to `/unassigned` (Up for Grabs) — GitHub issue #91, SPEC's 13 acceptance criteria.
Charter + umbrella plan: N/A — single SIMPLE plan, no phase program, no umbrella governs this work.
Autonomy: standard interactive RIPER-5 (no standing /goal was active for this session). VALIDATE ran autonomously through V1-V7 per explicit orchestrator delegation; EXECUTE still requires an explicit "ENTER EXECUTE MODE" and resolution of the CONDITIONAL gate below.
Hard stop conditions / safety constraints:
- Do not proceed to EXECUTE while Gate: CONDITIONAL is unresolved (see Validate Contract "Accepted by: PENDING").
- Do not silently mark the 8 Known-Gap e2e rows as "tested" in the EXECUTE report — they are honestly unverified pending the e2e-auth-bootstrap backlog item.
- Do not expand this plan's blast radius to include building the e2e-auth-bootstrap infra itself — that is tracked separately at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` as NEW PLAN REQUIRED.
- No schema/auth/API/billing surface may be touched by this plan — if EXECUTE discovers a need to touch one, stop and return to PLAN.
Next phase: plan-validate-fix supplement cycle (recommended) OR explicit user acceptance of the 8 Known-Gap rows, THEN EXECUTE MODE for this plan.
Validate contract: inline in plan (`## Validate Contract` section above).
Execute start: `bun run check` then `bun run test:unit -- src/tests/leads.spec.ts src/tests/leads-filters.spec.ts` (Hybrid gates need `DATABASE_URL` / `docker compose up -d db` locally; skip automatically in CI) | e2e spec: `e2e/unassigned-filters.e2e.ts` written fixme'd, not required green this pass | high-risk pack: no (no high-risk class touched).
