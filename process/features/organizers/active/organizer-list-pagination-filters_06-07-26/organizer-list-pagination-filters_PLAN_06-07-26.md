---
name: plan:organizer-list-pagination-filters
description: "SIMPLE plan — add pagination, sorting, search, and filters to /organizers and /organizers/[id], mirroring /leads exactly; relocate parseCountryFromLocation to import-utils.ts"
date: 06-07-26
feature: organizers
---

# PLAN — Organizer List & Detail: Pagination, Sorting, Search, Filters

Date: 06-07-26
Complexity: Simple
Status: PLANNED

Locked SPEC: `organizer-list-pagination-filters_SPEC_06-07-26.md` (same folder)

## Overview

Bring `/organizers` (list) and `/organizers/[id]` (detail) up to the same interaction standard as
`/leads`: classic Prev/Next pagination, sortable column headers via `makeSortTable`, debounced
search, and dropdown filters — all query-param-driven, all server-side SQL where the SPEC requires
it, all styled/wired identically to the leads reference implementation. No schema changes. No new
shared component. `/leads` is read-only reference and is never modified.

## Goals

1. `/organizers`: 10/page pagination, sortable `name`/`leads` columns, debounced name/handle search, country filter — all via SQL, then post-SQL country filter + final JS pagination (per locked decision #2).
2. `/organizers/[id]`: paginated, sortable (`event`/`eventDate`), searchable, filterable (country/owner/stage) event-history table — fetched once per request (visibility-scoped), then filtered/sorted/paginated entirely in JS (per locked decision #3).
3. Relocate `parseCountryFromLocation` out of the ingest route into `import-utils.ts` as an exported function, with zero behavior change to ingest or `/leads`.
4. Reuse `normalizeCountry()` for country derivation on both organizer pages — no new column, no migration.


## Acceptance Criteria

(Mirrors SPEC AC1-AC13 verbatim - see organizer-list-pagination-filters_SPEC_06-07-26.md.)

1. [x] /organizers shows 10/page with Prev/Next + "Page N of M"; never fewer than 10 except last page.
2. [x] Clicking "Name" header sorts alphabetically; toggles asc/desc; arrow indicator shown.
3. [x] Clicking "Leads" header sorts by lead count aggregate, either direction.
4. [x] Typing in list search narrows to name/handle matches, debounced (no Enter needed).
5. [x] Country dropdown narrows by normalized location; default shows all.
6. [x] Sort/search/country change always resets to page 1.
7. [x] Lead count per organizer reflects only that organizer's non-deleted leads, unaffected by list filters.
8. [x] Detail page "Event"/"Event Date" headers sort event history, toggle asc/desc, arrow shown.
9. [x] Detail page search narrows event-history rows, debounced.
10. [x] Detail page country/owner/stage filters combine (AND) with each other and search.
11. [x] Detail page never shows a lead outside visibilityCondition() scope, filters applied within that scope.
12. [x] Detail page sort/search/filter change resets to page 1.
13. [x] All new controls match /leads exactly (component types, debounce timing, arrow style, navigate() plumbing) - Agent-Probe/Known-Gap pending shared Playwright auth fixture.


## Implementation Checklist

1. **Relocate parseCountryFromLocation**
   - Add exported `parseCountryFromLocation(location?: string | null): string | null` to `src/lib/server/import-utils.ts` (identical comma-split/trim logic as the current private helper in `ingest/+server.ts`).
   - Remove the private helper from `src/routes/api/leads/ingest/+server.ts`; import the relocated function instead. No other change to ingest behavior.

2. **organizers.ts: list query + sort allowlist**
   - Add `export const ORGANIZERS_SORT_COLS = ['name', 'leads'] as const;` and a validated-input `type OrganizersSortCol`.
   - Add `listOrganizersFiltered({ search?, country?, sort?, dir?, page?, pageSize? }): Promise<{ organizers: OrganizerWithCount[]; total: number }>`: SQL ilike search on name/handle + SQL sort (name column asc/desc; leads via ORDER BY count(...) asc/desc), then in JS: filter by country (via normalizeCountry(location) match), then paginate the JS-filtered array; total/totalPages from the post-country-filter array length.
   - Do not modify `listOrganizersWithLeadCount()`.

3. **organizers.ts: extend listLinkedLeadsForOrganizer**
   - Grep repo-wide for all callers of `listLinkedLeadsForOrganizer` to confirm `organizers/[id]/+page.server.ts` is the only consumer before changing its signature/return shape.
   - Add optional 4th param `opts?: { search?, country?, owner?, stage?, sort?, dir?, page?, pageSize? }`.
   - Add `export const DETAIL_SORT_COLS = ['event', 'eventDate'] as const;`.
   - Keep the existing DB fetch (visibilityCondition() + full non-deleted rows for the organizer) unchanged; apply opts filters/sort/pagination in JS after enrichWithOwnerNames().
   - Preserve return shape for the 3-arg call (no opts): return Lead[] as today. When opts includes page/pageSize, return { leads: Lead[]; total: number }.

4. **/organizers page wiring**
   - `+page.server.ts`: parse q, country, sort (allowlist ORGANIZERS_SORT_COLS), dir, page (default pageSize 10) from url.searchParams; call listOrganizersFiltered(); also fetch distinct organizer countries (derive via normalizeCountry(location) over all organizers, mirroring getLeadCountries() shape) for the filter dropdown; return organizers, countries, filters, sort, dir, pagination.
   - `+page.svelte`: add debounced (300ms) Input search box; add country Select/SelectTrigger/SelectContent/SelectItem (default "All countries"); wire name/leads headers through makeSortTable; add Prev/Next pagination block adapted from leads/+page.svelte lines 344-373; reuse the shared navigate(patch) helper pattern (merge/delete URLSearchParams, goto()), resetting page on every filter/sort change.

5. **/organizers/[id] page wiring**
   - `+page.server.ts`: parse q, country, owner, stage, sort (allowlist DETAIL_SORT_COLS), dir, page (default pageSize 10) from url.searchParams; call extended listLinkedLeadsForOrganizer(...); derive country/owner dropdown option lists from the same unfiltered per-organizer fetch (no separate query, no listUsers()); return leads, countries, owners, filters, sort, dir, pagination.
   - `+page.svelte`: add debounced search Input; add country/owner/stage Selects (stage options from LEAD_STAGES); wire event/eventDate headers through makeSortTable; add Prev/Next pagination block adapted from /leads; same navigate(patch) plumbing, resetting page on every change.

6. **Tests**
   - `src/tests/organizers-db.spec.ts` **already exists** (written for organizer-listing-detail, #189/#190) — EXTEND it, do not create/overwrite it. Append new `describe.skipIf(SKIP_DB)(...)` blocks covering: list pagination boundaries, name sort asc/desc/asc cycle, leads-count sort both directions, search match (name+handle), country filter + default-all, page-reset-on-change, lead-count integrity unaffected by filters; detail-page event/eventDate sort cycle, search match, country+owner+stage AND-combination, visibility-scoping preserved under filters, page-reset-on-change. Preserve every existing describe block (`listOrganizersWithLeadCount`, `getOrganizer`, `listLinkedLeadsForOrganizer`, `createLead organizerId persistence`) exactly as-is — do not delete or rewrite them.
   - **Tier correction (found at VALIDATE):** this file is `SKIP_DB`-gated — identical convention to every other `*-db.spec.ts` file in the repo (`leads-db.spec.ts`, `pipeline-db.spec.ts`, `reminders-db.spec.ts`, etc.). It requires a running Postgres (`docker compose up -d db`) and `DATABASE_URL` set, and silently self-skips when `DATABASE_URL` is absent (e.g. plain CI). This makes it a **Hybrid**-tier gate, not Fully-Automated — see corrected Verification Evidence table below. Run the repo's configured Vitest/Bun command per process/context/tests/all-tests.md **with `DATABASE_URL` set** until all new tests are green; a `SKIP_DB`-skipped run is not proof of green.

7. **Regression pass**
   - Re-run existing organizers.ts-adjacent tests (if any from organizer-listing-detail/organizer-lead-tagging-ui work) plus import.spec.ts (normalizeCountry suite) to confirm the parseCountryFromLocation relocation didn't break ingest or existing coverage.


## Phase Completion Rules

This is a SIMPLE plan - implement continuously without approval gates between checklist items. The
6 sequencing steps above are logical groupings, not stop points. Before EXECUTE begins,
vc-validate-agent must write the Validate Contract section - do not start EXECUTE against the
placeholder. Mark this plan complete only when every Implementation Checklist item is done AND all
Fully-Automated rows in Verification Evidence are green (Agent-Probe/Known-Gap rows remain
pre-accepted per SPEC AC13 test-tier split until the shared Playwright auth fixture lands).


## Testing Context

See process/context/tests/all-tests.md for runner selection and commands. All Hybrid gates in this
plan use the repo's existing `*-db.spec.ts` / `SKIP_DB` convention (mirrors organizers.ts and
leads.ts query-level test files already in src/tests/). No new test infra is introduced.

## Scope

In scope: `import-utils.ts`, `organizers.ts` (additive), `organizers/+page.server.ts` + `.svelte`, `organizers/[id]/+page.server.ts` + `.svelte`, `ingest/+server.ts` (import swap only), new/extended tests.

Out of scope (per SPEC): schema changes, infinite scroll, shared pagination component extraction, `/leads` changes, Add Event flow changes, bulk actions/export, cross-organizer owner filtering.

## Locked Decisions (from INNOVATE — implement exactly)

1. **Relocate `parseCountryFromLocation`**: move from private helper in `ingest/+server.ts` to an exported function in `import-utils.ts`. Update ingest's import. Behavior identical (comma-split, last segment, trim) — pure relocation.
2. **Organizers list**: SQL handles name/handle search (`ilike`) and sort (`name` asc/desc, `leads` aggregate count asc/desc via `ORDER BY count(...)`). Country filter + final pagination (page/pageSize=10) happen in JS AFTER the SQL-filtered/sorted set is fetched. `total`/`totalPages` computed from the post-country-filter JS array length — NOT raw SQL row count. New additive function `listOrganizersFiltered(...)` in `organizers.ts`. Do NOT modify `listOrganizersWithLeadCount()` (external consumer: `leads/[id]/+page.server.ts`'s organizer picker — verify this consumer during EXECUTE).
3. **Detail page**: fetch the full visibility-scoped, unfiltered lead set for one organizer once per request (reuse `visibilityCondition()` + `enrichWithOwnerNames()`, unchanged). Derive country + owner dropdown option lists from that same unfiltered set in JS. Apply search/country/owner/stage filters + sort (`event`/`eventDate` via `makeSortTable`) + pagination, all in JS. Extend `listLinkedLeadsForOrganizer(...)` with an optional filters/pagination param object (single consumer — safe in-place extension), not a parallel function.
4. **Sort allowlists**: two new allowlists mirroring `LEADS_SORT_COLS_SET` — organizers list (`name`, `leads`), detail event history (`event`, `eventDate`).
5. **Pagination markup**: copy/adapt the `/leads` inline Prev/Next JSX (lines 344–373 of `leads/+page.svelte`) into both organizer pages. No shared component extracted. `/leads` itself untouched.
6. **Owner-filter dropdown (detail page)**: derive distinct owners from the same unfiltered per-organizer fetch — no separate query, no reuse of global `listUsers()`.
7. **Country filter UX**: match `/leads` exactly — "All countries" default + distinct clean values via `normalizeCountry()`/`parseCountryFromLocation()`.

## Sequencing

1. Relocate `parseCountryFromLocation` → `import-utils.ts`; update ingest import.
2. `organizers.ts`: add `listOrganizersFiltered()` + `ORGANIZERS_SORT_COLS_SET`.
3. `organizers.ts`: extend `listLinkedLeadsForOrganizer()` with filters/pagination param object + `DETAIL_SORT_COLS_SET`.
4. `/organizers` page wiring (`+page.server.ts`, `+page.svelte`).
5. `/organizers/[id]` page wiring (`+page.server.ts`, `+page.svelte`).
6. Tests (extend existing `organizers-db.spec.ts`, Hybrid/SKIP_DB-gated; existing `organizer-lead-tagging-ui`/`organizer-listing-detail` test conventions as reference).

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/import-utils.ts` | Add exported `parseCountryFromLocation(location?: string \| null): string \| null` (relocated, unchanged logic) |
| `src/routes/api/leads/ingest/+server.ts` | Remove local `parseCountryFromLocation`; import it from `import-utils.ts` instead. No other change. |
| `src/lib/server/db/organizers.ts` | Add `ORGANIZERS_SORT_COLS = ['name', 'leads'] as const` + `listOrganizersFiltered(params)`. Extend `listLinkedLeadsForOrganizer(organizerId, userId, role, opts?)` with optional `{ search?, country?, owner?, stage?, sort?, dir?, page?, pageSize? }` and `DETAIL_SORT_COLS = ['event', 'eventDate'] as const`. `listOrganizersWithLeadCount()` and the base 3-arg call shape of `listLinkedLeadsForOrganizer` remain unchanged/backward-compatible. |
| `src/routes/organizers/+page.server.ts` | Parse `q`/`country`/`sort`/`dir`/`page` URL params (allowlist-validated), call `listOrganizersFiltered()`, return `organizers`, `countries`, `filters`, `sort`, `dir`, `pagination` |
| `src/routes/organizers/+page.svelte` | Add search `Input`, country `Select`, sortable `name`/`leads` headers via `makeSortTable`, Prev/Next pagination block (adapted from `/leads`) |
| `src/routes/organizers/[id]/+page.server.ts` | Parse `q`/`country`/`owner`/`stage`/`sort`/`dir`/`page` URL params, call extended `listLinkedLeadsForOrganizer()`, return `leads`, `countries`, `owners`, `filters`, `sort`, `dir`, `pagination` |
| `src/routes/organizers/[id]/+page.svelte` | Add search `Input`, country/owner/stage `Select`s, sortable `event`/`eventDate` headers, Prev/Next pagination block |
| `src/tests/organizers-db.spec.ts` (existing — extend) | Add Hybrid/SKIP_DB-gated query-level tests: pagination, sort (both cols, both directions), search, country filter, page-reset, lead-count integrity, detail-page sort/search/multi-filter/visibility/page-reset — appended to the existing file alongside its current describe blocks |

## Public Contracts

- `listOrganizersFiltered(params: { search?: string; country?: string; sort?: string; dir?: 'asc' \| 'desc'; page?: number; pageSize?: number }): Promise<{ organizers: OrganizerWithCount[]; total: number }>` — new, additive.
- `listLinkedLeadsForOrganizer(organizerId: string, userId: string, role: Role, opts?: { search?: string; country?: string; owner?: string; stage?: string; sort?: string; dir?: 'asc' \| 'desc'; page?: number; pageSize?: number }): Promise<{ leads: Lead[]; total: number } | Lead[]>` — **decision needed at EXECUTE time**: keep return-type backward compatible for the 3-arg call shape (return `Lead[]` as today) vs. always return `{ leads, total }` once `opts` includes pagination. Recommended: when `opts` is provided AND includes `page`/`pageSize`, return `{ leads, total }`; when `opts` is omitted (3-arg call), return `Lead[]` unchanged — preserves the existing signature's return shape for any untouched caller. Verify no other caller besides `organizers/[id]/+page.server.ts` exists before finalizing (grep `listLinkedLeadsForOrganizer` repo-wide). **Confirmed at VALIDATE (06-07-26):** repo-wide grep found exactly one non-test caller (`organizers/[id]/+page.server.ts`, current 3-arg call) plus the existing `organizers-db.spec.ts` test file (also 3-arg calls) — no other consumer exists.
- `parseCountryFromLocation(location?: string | null): string | null` — new export from `import-utils.ts`, identical logic to the removed private helper.
- No public API route contracts change. No schema/migration change.

## Blast Radius

- ~8 files touched (2 relocations/extensions in server DB layer, 1 import-utils addition, 1 ingest import swap, 4 route files, 1 extended test file).
- Risk class: none of auth/billing/schema/migration/public-API/container — pure additive read-path query + UI wiring. No high-risk class per `vc-agent-strategy-compare` S2/S6 signals.
- Signal score for strategy purposes: 1 file touched >5 hmm — actual distinct files = 8 (S7 present: 5+ files). No S1 (single package, single Svelte app). No S2 (no schema/API/auth). Score ≈ 1/7 → **Sequential** execution is appropriate; no fan-out needed for EXECUTE.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `organizers-db.spec.ts`: `listOrganizersFiltered` returns 10/page with correct `total`/`totalPages` across page boundaries | Hybrid — precondition: `DATABASE_URL` set / `docker compose up -d db` running; `SKIP_DB`-gated | AC1 |
| `organizers-db.spec.ts`: sort by `name` asc→desc→asc cycle | Hybrid — same precondition | AC2 (query logic) |
| Agent-Probe: name-header arrow renders + click cycles direction on `/organizers` | Agent-Probe / Known-Gap (pre-accepted, pending shared Playwright auth fixture) | AC2 (visual) |
| `organizers-db.spec.ts`: sort by `leads` (aggregate count) asc/desc | Hybrid — same precondition | AC3 |
| `organizers-db.spec.ts`: search `q` matches name and handle via `ilike`, case-insensitive | Hybrid — same precondition | AC4 (query logic) |
| Agent-Probe: 300ms debounce before navigation fires | Agent-Probe / Known-Gap | AC4 (debounce timing) |
| `organizers-db.spec.ts`: country filter narrows via `normalizeCountry(location)`; default shows all | Hybrid — same precondition | AC5 |
| `organizers-db.spec.ts`: changing sort/search/country resets to page 1 | Hybrid — same precondition | AC6 |
| `organizers-db.spec.ts`: lead count per organizer unaffected by list-level filters (re-verify existing `listOrganizersWithLeadCount`-style count query used inside `listOrganizersFiltered`) | Hybrid — same precondition | AC7 |
| `organizers-db.spec.ts`: detail-page sort by `event`/`eventDate` asc/desc cycle | Hybrid — same precondition | AC8 (query logic) |
| Agent-Probe: event/eventDate header arrow on `/organizers/[id]` | Agent-Probe / Known-Gap | AC8 (visual) |
| `organizers-db.spec.ts`: detail-page search narrows event-history rows | Hybrid — same precondition | AC9 (query logic) |
| Agent-Probe: detail search debounce | Agent-Probe / Known-Gap | AC9 (debounce timing) |
| `organizers-db.spec.ts`: country + owner + stage + search combine with AND | Hybrid — same precondition | AC10 |
| `organizers-db.spec.ts`: `visibilityCondition()` still excludes non-visible leads with filters applied (extends existing visibility test pattern from `leads.ts` / `organizer-listing-detail`) | Hybrid — same precondition | AC11 |
| `organizers-db.spec.ts`: detail-page filter/sort/search change resets page to 1 | Hybrid — same precondition | AC12 |
| Manual visual diff against `/leads` (component types, debounce timing, arrow style, `navigate()` plumbing) | Agent-Probe / Known-Gap (pre-accepted repo-wide gap, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) | AC13 |

**Tier correction note (added at VALIDATE, 06-07-26):** every `organizers-db.spec.ts` row above was
originally labeled "Fully-Automated" in this plan. Direct inspection of the existing file
(`src/tests/organizers-db.spec.ts`, already on disk from organizer-listing-detail #189/#190) shows
it is `describe.skipIf(SKIP_DB)`-gated — it requires a live Postgres connection and self-skips
without `DATABASE_URL`, identical to every other `*-db.spec.ts` file in this repo (`leads-db.spec.ts`,
`pipeline-db.spec.ts`, `reminders-db.spec.ts`, etc. — confirmed via repo-wide grep). Per
`vc-test-coverage-plan`'s tier definition ("Fully-automated ... must be runnable in CI without setup
beyond env vars"), and per `all-tests.md`'s own statement that CI has no postgres service, this is a
**Hybrid** gate, not Fully-Automated. This is corrected above. This does not introduce a new gap —
it is the same pre-accepted, repo-wide "no live-DB CI harness" limitation already documented in
`process/context/all-context.md` ("Remaining v1 work" #2) and `all-tests.md` ("Known Gaps" — no
live-DB CI harness). No new plan/action required; tracked as an existing known-gap, not a fresh one.

## Test Infra Improvement Notes

- (Not new to this plan) All `organizers-db.spec.ts` gates in this plan are Hybrid/`SKIP_DB`-gated
  and require a locally running Postgres + `DATABASE_URL`. This inherits the repo-wide known-gap
  "no live-DB CI harness for Hybrid-tier test gates" (see `process/context/all-context.md`
  "Remaining v1 work" #2). No action item added by this plan — execute-agent must run these tests
  with `DATABASE_URL` set locally to get real green/red signal; a skipped run must not be reported
  as passing.

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/organizers/active/organizer-list-pagination-filters_06-07-26/organizer-list-pagination-filters_PLAN_06-07-26.md`
2. **Last completed phase or step**: VALIDATE complete (V1–V7), validate-contract written below. No EXECUTE started.
3. **Validate-contract status**: written — see `## Validate Contract` below. Gate: PASS.
4. **Supporting context files loaded**: process/context/all-context.md (root router), SPEC (this folder); `src/routes/leads/+page.server.ts`, `+page.svelte`; `src/lib/utils/tableSort.ts`; `src/lib/server/db/leads.ts` (`listLeadsFiltered`, `getLeadCountries`, `visibilityCondition`, `enrichWithOwnerNames`); `src/lib/server/db/organizers.ts`; `src/routes/organizers/+page.server.ts`/`+page.svelte`; `src/routes/organizers/[id]/+page.server.ts`/`+page.svelte`; `src/routes/api/leads/ingest/+server.ts`; `src/lib/server/import-utils.ts`; `src/tests/organizers-db.spec.ts` (existing file, confirmed at VALIDATE); `src/tests/import.spec.ts`.
5. **Next step for a fresh agent picking up mid-execution**: `ENTER EXECUTE MODE` — validate-contract is PASS. If resuming mid-EXECUTE, check which of the 6 sequencing steps above are done by diffing `organizers.ts`, both organizer route pairs, and `import-utils.ts`/`ingest/+server.ts` against this plan's Touchpoints table. Before extending `listLinkedLeadsForOrganizer`, the repo-wide caller grep has already been done at VALIDATE (see Public Contracts) — no other caller exists. When touching `src/tests/organizers-db.spec.ts`, APPEND new describe blocks; do not overwrite the file's existing tests.

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Blast-radius signal score 1/7 (only S7 — 8 files, single Svelte app, no schema/auth/API/billing/container surface) — per `vc-agent-strategy-compare` threshold table this is LOW (0-1), so a single sequential validate pass (Layer 1 + Layer 2 performed inline by one validator, no parallel fan-out) is the correct-fit strategy; no agent-count math applies.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `/organizers` list returns 10/page with correct total/totalPages across page boundaries | Hybrid | `organizers-db.spec.ts` — `listOrganizersFiltered` pagination boundary cases (DATABASE_URL required) | B |
| AC2 | Name-column sort asc/desc/asc cycle (query logic) | Hybrid | `organizers-db.spec.ts` — name sort cases | B |
| AC2 (visual) | Name-header arrow renders, click toggles direction | Agent-Probe | Manual: click header on `/organizers`, observe arrow flip | D |
| AC3 | Leads-count aggregate sort both directions | Hybrid | `organizers-db.spec.ts` — leads-count sort cases | B |
| AC4 (query) | Search `q` matches name/handle via ilike, case-insensitive | Hybrid | `organizers-db.spec.ts` — search match cases | B |
| AC4 (debounce) | 300ms debounce before navigation fires | Agent-Probe | Manual: type in search box, observe delayed navigation | D |
| AC5 | Country filter narrows via normalizeCountry(location); default all | Hybrid | `organizers-db.spec.ts` — country filter cases | B |
| AC6 | Sort/search/country change resets to page 1 | Hybrid | `organizers-db.spec.ts` — page-reset-on-change case | B |
| AC7 | Lead count per organizer unaffected by list filters | Hybrid | `organizers-db.spec.ts` — lead-count integrity case | B |
| AC8 (query) | Detail event/eventDate sort asc/desc cycle | Hybrid | `organizers-db.spec.ts` — detail sort cases | B |
| AC8 (visual) | Event/eventDate header arrow on `/organizers/[id]` | Agent-Probe | Manual: click header, observe arrow | D |
| AC9 (query) | Detail search narrows event-history rows | Hybrid | `organizers-db.spec.ts` — detail search case | B |
| AC9 (debounce) | Detail search debounce | Agent-Probe | Manual: type in detail search, observe delayed nav | D |
| AC10 | Country+owner+stage+search combine with AND | Hybrid | `organizers-db.spec.ts` — multi-filter AND case | B |
| AC11 | visibilityCondition() still excludes non-visible leads under filters | Hybrid | `organizers-db.spec.ts` — visibility-under-filters case | B |
| AC12 | Detail sort/search/filter change resets page to 1 | Hybrid | `organizers-db.spec.ts` — detail page-reset case | B |
| AC13 | Controls match `/leads` exactly (component types, debounce, arrow style, navigate() plumbing) | Agent-Probe / Known-Gap | Manual visual diff vs `/leads`; blocked on shared Playwright auth fixture | D (pre-accepted repo-wide gap, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) |
| — | `parseCountryFromLocation` relocation preserves ingest behavior | Hybrid | `import.spec.ts` `normalizeCountry` suite + manual ingest smoke (existing coverage, re-run as regression) | A |
| — | `listOrganizersWithLeadCount` unmodified / no regression for `leads/[id]` organizer picker | Fully-Automated | `bun run check` (typecheck) + existing `organizers-db.spec.ts` `listOrganizersWithLeadCount` describe block (unchanged) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist, tier corrected at VALIDATE)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: `strategy:` column carries only Fully-Automated / Hybrid / Agent-Probe. No row uses Known-Gap as a strategy value — AC13's row is Agent-Probe with a named, pre-accepted residual (gap-resolution D), not a bare Known-Gap strategy.

Legacy line form (retained for existing validate-contract consumers):
- organizers list query (pagination/sort/search/country/page-reset/lead-count): Hybrid — `bun run test:unit` (Vitest) `src/tests/organizers-db.spec.ts`, precondition: `DATABASE_URL` set / `docker compose up -d db`
- organizer detail query (sort/search/multi-filter/visibility/page-reset): Hybrid — same command/precondition as above
- visual/debounce/arrow behavior: Agent-Probe — manual browser check against `/leads` reference
- full end-to-end visual parity with `/leads` (AC13): Known-Gap — pre-accepted, pending shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- typecheck regression guard: Fully-Automated — `bun run check`

Dimension findings:
- Infra fit: PASS — no container/infra/port/runtime surface touched; pure SvelteKit route handlers + Drizzle query-layer changes within the existing single-app architecture.
- Test coverage: CONCERN (resolved in-plan) — plan originally labeled all `organizers-db.spec.ts` rows "Fully-Automated"; confirmed by direct file read that this file is `SKIP_DB`-gated (Hybrid), matching every other `*-db.spec.ts` in the repo. Corrected in the Verification Evidence table above (all rows now Hybrid with the `DATABASE_URL` precondition stated); this is a pre-existing, pre-accepted repo-wide known-gap (no live-DB CI harness), not new to this plan.
- Breaking changes: PASS — repo-wide grep confirmed (a) `listOrganizersWithLeadCount()` has exactly one other consumer (`src/routes/leads/[id]/+page.server.ts`), and the plan does not modify this function; (b) `listLinkedLeadsForOrganizer()` has exactly one other caller (`src/routes/organizers/[id]/+page.server.ts`, current 3-arg shape) plus the existing test file (also 3-arg calls) — the plan's "only one caller" claim is verified TRUE. The 4th-param extension is optional and additive, so both existing call sites remain unaffected.
- Security surface: PASS — no auth/session/billing/secret/trust-boundary surface touched; both route files retain their existing `if (!locals.user) throw error(401, ...)` session gate; no new public API endpoints; `parseCountryFromLocation` relocation is a pure internal helper move with no behavior change.
- Section — DB layer (organizers.ts relocate/extend): PASS — mechanical feasibility confirmed by direct read of `src/lib/server/db/organizers.ts`; target function names (`listOrganizersWithLeadCount`, `listLinkedLeadsForOrganizer`) and shapes match the plan's description exactly; no naming collisions for the new exports (`listOrganizersFiltered`, `ORGANIZERS_SORT_COLS`, `DETAIL_SORT_COLS`).
- Section — parseCountryFromLocation relocation: PASS — confirmed identical logic in `ingest/+server.ts` (comma-split, last segment, trim), confirmed no existing `parseCountryFromLocation` export collision in `import-utils.ts`, confirmed both call sites in the ingest route will need the import swap (2 usages, both mechanical).
- Section — page wiring (`/organizers`, `/organizers/[id]`): PASS — confirmed `makeSortTable` API surface, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` components, `LEAD_STAGES` export, and the `navigate(patch)`/`goto()` pattern in `leads/+page.svelte` (lines 50-60) all exist and match the plan's description; pagination JSX (lines 344-373) confirmed present and adaptable.
- Section — Tests: CONCERN (resolved in-plan) — same finding as Test coverage dimension above, plus a second gap: the plan's checklist said "Create" `organizers-db.spec.ts` when the file already exists with 4 passing describe blocks (organizer-listing-detail work) — corrected to "Extend, preserve existing blocks" in the checklist and Touchpoints table above to prevent EXECUTE from overwriting existing coverage.

Open gaps: none blocking. AC13 (full visual parity) and the two debounce/arrow Agent-Probe rows remain Known-Gap/Agent-Probe pending the shared Playwright auth-fixture backlog item (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — this is an existing, repo-wide, pre-accepted gap, not new to this plan.

What this coverage does NOT prove:
- The Hybrid `organizers-db.spec.ts` gates prove Drizzle query-layer correctness only (pagination math, sort, search, filter, visibility, page-reset) when run against a live Postgres with `DATABASE_URL` set. They do NOT prove: (a) the `+page.svelte` UI actually renders the arrow/Select/Input controls correctly — that is Agent-Probe/Known-Gap; (b) the 300ms debounce timing is correct in the browser — Agent-Probe/Known-Gap; (c) visual/interaction parity with `/leads` (component types, styling, exact `navigate()` behavior) — Known-Gap pending the shared Playwright auth fixture; (d) behavior under concurrent requests or with a very large organizer set (the JS-side pagination design fetches the full SQL-filtered/sorted set before paginating in JS — acceptable at current data volumes per the locked INNOVATE decision, but not load-tested).
- `bun run check` (typecheck) proves type-level regression safety for the `listOrganizersWithLeadCount()` non-modification claim, not runtime behavior — runtime behavior is additionally covered by the existing (unchanged) `organizers-db.spec.ts` `listOrganizersWithLeadCount` describe block, which is itself Hybrid/SKIP_DB-gated.

Gate: PASS (no unresolved FAILs or CONCERNs; the 2 CONCERNs found — test-tier mislabeling and "create" vs "extend" wording — were fixed directly in this plan's text during VALIDATE; no gaps deferred to execute-agent instructions or backlog beyond the pre-existing, pre-accepted repo-wide known-gaps already documented in `all-context.md`/`all-tests.md`)

## Autonomous Goal Block

SESSION GOAL: Ship pagination, sorting, search, and country/owner/stage filters on `/organizers` and `/organizers/[id]`, mirroring `/leads` exactly, plus relocate `parseCountryFromLocation` into `import-utils.ts`.
Charter + umbrella plan: N/A — single SIMPLE plan (not a phase program).
Autonomy: Standard RIPER-5 gates apply — EXECUTE requires explicit "ENTER EXECUTE MODE"; no standing /goal autonomy is granted by this block. If resumed under an active /goal, CONDITIONAL findings during EXECUTE/EVL may proceed autonomously per orchestration.md §Autonomous /goal Phase Program Execution; BLOCKED items go to backlog and continue.
Hard stop conditions / safety constraints:
- Do not modify `listOrganizersWithLeadCount()` — it has a live consumer (`leads/[id]/+page.server.ts` organizer picker) outside this plan's scope.
- Do not change the 3-arg return shape of `listLinkedLeadsForOrganizer()` for callers that omit `opts` — must stay backward compatible.
- Do not overwrite `src/tests/organizers-db.spec.ts` — append only; existing describe blocks (`listOrganizersWithLeadCount`, `getOrganizer`, `listLinkedLeadsForOrganizer`, `createLead organizerId persistence`) must remain intact.
- Do not touch `/leads` route files, schema, auth, or any public API contract — out of scope per SPEC.
- Treat `organizers-db.spec.ts` gates as Hybrid (require `DATABASE_URL`) — a `SKIP_DB`-skipped run must never be reported as a passing gate.
Next phase: EXECUTE: process/features/organizers/active/organizer-list-pagination-filters_06-07-26/organizer-list-pagination-filters_PLAN_06-07-26.md
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: fully-auto: `bun run check` then `bun run test:unit` (with `DATABASE_URL` set) against extended `src/tests/organizers-db.spec.ts` | e2e spec: none (AC13 Known-Gap, no Playwright auth fixture) | probe scenario: manual visual diff of `/organizers` and `/organizers/[id]` against `/leads` (arrow style, debounce timing, control types) | high-risk pack: no (no auth/billing/schema/API/container surface)
