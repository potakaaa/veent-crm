---
name: plan:recurring-organizer-tag
description: SIMPLE plan for GitHub #94 — add has_future_events boolean flag to crm_leads with badge (list + detail), edit checkbox, and /leads filter
date: 02-07-26
feature: leads
---

# PLAN — Recurring Organizer Tag (GitHub #94)

**Date**: 02-07-26
**Status**: ✅ COMPLETE — EVL green (typecheck/unit/Hybrid), 2 pre-accepted Known-Gaps (AC3/AC4 browser rendering — see `recurring-organizer-tag_REPORT_02-07-26.md`)
**Complexity**: SIMPLE

**TL;DR:** Add one additive boolean column `has_future_events` to `crm_leads`, mirroring the existing `bank_charges_absorbed` precedent end-to-end (schema → migration → type → mapper → update+audit → zod → edit checkbox → badge on list & detail → /leads filter toggle mirroring `staleOnly`). Single package, no auth/API-contract/billing surface. INNOVATE skipped — approach is mechanical (exact existing precedent). Classification: **SIMPLE** (~12 touchpoints, 1 additive column, 1 migration).

## Overview / Context and Goals

GitHub issue #94 asks for a way to flag an organizer as a recurring/future-events prospect so they aren't lost when the current deal isn't a fit. This plan adds a single boolean flag `hasFutureEvents` to the lead record, editable through the existing lead edit surfaces, shown as a distinct badge on the /leads list and the lead detail header, and filterable on /leads. Context loaded: SPEC (`recurring-organizer-tag_SPEC_02-07-26.md`), `process/context/all-context.md` (Drizzle / Superforms / soft-delete / audit-trail conventions), and the `process/context/tests/all-tests.md` routing chain (vitest runner + `describe.skipIf(SKIP_DB)` Hybrid pattern). The implementation mirrors the existing `bank_charges_absorbed` boolean-field precedent at every layer.

## Complexity Classification

SIMPLE. Single additive boolean field (NOT NULL DEFAULT false), one generated migration, ~16 touchpoints, no schema redesign, no auth/billing/API-contract surface, no new dependency. Precedent (`bankChargesAbsorbed`) already exists across every layer being touched.

## Phase Completion Rules

Single-phase SIMPLE plan. The phase is complete only when: (1) all 19 checklist items are done; (2) the automated test gate (vitest) and typecheck pass green; (3) Hybrid DB-backed tests pass locally with `DATABASE_URL` set (or are recorded as run); (4) the Known-Gap browser scenarios have `test.fixme` stubs written and the gate is accepted as CONDITIONAL. Code-only completion is `CODE DONE`, not `VERIFIED` — VERIFIED requires the test gates above plus user confirmation of the CONDITIONAL Known-Gaps.

## Acceptance Criteria

Mirrors the 8 testable outcomes locked in the SPEC (see Verification Evidence table for the proving gate + strategy per criterion):

1. AC1 — Rep can mark a lead from the edit screen; flag persists after save and on reopen.
2. AC2 — Rep can unmark; flag disappears from all surfaces after save.
3. AC3 — Distinct badge visible on /leads list rows, not confusable with stage chip / age badge.
4. AC4 — Badge visible on the lead detail page header.
5. AC5 — /leads list filterable to flagged-only via the existing filter-row mechanism.
6. AC6 — Flag toggle does not change stage, owner, or any other field (independent attribute).
7. AC7 — Flag change recorded in `crm_lead_history` audit trail.
8. AC8 — Flag settable regardless of pipeline stage, including lost/closed-lost.

## Precedent Anchors (verified in codebase 02-07-26)

- Schema column: `src/lib/server/db/schema.ts:177` — `bankChargesAbsorbed: boolean('bank_charges_absorbed')` (note: existing precedent is nullable; **this new column is NOT NULL DEFAULT false** per locked decision #1).
- Migration pattern: `drizzle/0014_agreements_fields.sql` — `ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS ...`.
- Type: `src/lib/types/index.ts:94` — `bankChargesAbsorbed?: boolean`.
- Mapper: `src/lib/server/db/leads.ts:109` — `bankChargesAbsorbed: row.bankChargesAbsorbed ?? undefined`.
- `updateLead` inline input-type: `src/lib/server/db/leads.ts:658` — `bankChargesAbsorbed?: boolean` (the input parameter object type; the new field MUST be added here too or the conditional-spread will not typecheck).
- Update conditional-spread: `src/lib/server/db/leads.ts:720-721`.
- Audit row: `src/lib/server/db/leads.ts:787-789` — `'bank_charges_absorbed'` history entry.
- Filter param: `src/lib/server/db/leads.ts:241,265,297-301` — `staleOnly` param (`ListLeadsParams` interface line 241, destructure default line 265, condition push line 297) + conditions push.
- Zod: `src/lib/zod/schemas.ts:117,141` — `bankChargesAbsorbed: z.boolean().optional()` (two schemas).
- PATCH handler: `src/routes/api/leads/[id]/+server.ts:70`.
- Detail edit state: `src/routes/leads/[id]/+page.svelte:62,74,96,679-694`.
- List row badge cluster: `src/lib/components/leads/LeadListRow.svelte:43-46` (StageChip + AgeBadge).
- Filter toolbar toggle: `src/routes/leads/+page.svelte:78,156-157` (staleOnly button) + `src/routes/leads/+page.server.ts:24,49,76`.
- Shared Badge primitive: `src/lib/components/ui/badge/badge.svelte` (confirmed present).
- DB-test skip pattern: `describe.skipIf(SKIP_DB)` with `const SKIP_DB = !process.env.DATABASE_URL` (e.g. `src/tests/leads-filters.spec.ts:17`).

## Touchpoints

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/server/db/schema.ts` | Add `hasFutureEvents: boolean('has_future_events').notNull().default(false)` to `crmLeads`, near `bankChargesAbsorbed` (~line 177). |
| 2 | `drizzle/` (new migration) | Generate via `bun run db:generate` (do NOT hand-write). Expected: `ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "has_future_events" boolean DEFAULT false NOT NULL`. |
| 3 | `src/lib/types/index.ts` | Add `hasFutureEvents: boolean;` to `Lead` (~line 94). Non-optional — column is NOT NULL so mapper always yields a boolean. |
| 4 | `src/lib/server/db/leads.ts` — `dbRowToLead` (~109) | Map `hasFutureEvents: row.hasFutureEvents ?? false`. |
| 5 | `src/lib/server/db/leads.ts` — `updateLead` input type (~658) + persist (~720) | (a) Add `hasFutureEvents?: boolean;` to the `updateLead` inline input-type object at ~658 (alongside `bankChargesAbsorbed?: boolean`) — REQUIRED for the spread to typecheck. (b) Add conditional spread `...(input.hasFutureEvents !== undefined ? { hasFutureEvents: input.hasFutureEvents } : {})` at ~720. |
| 6 | `src/lib/server/db/leads.ts` — `updateLead` audit (~787) | Add `crm_lead_history` entry with field `'has_future_events'`, mirroring the bank_charges_absorbed old/new-value block. |
| 7 | `src/lib/server/db/leads.ts` — `listLeadsFiltered` (~241/265/297) | Add optional `hasFutureEvents?: boolean` to the `ListLeadsParams` interface (~241), a destructure default `hasFutureEvents = false` (~265), and push `eq(crmLeads.hasFutureEvents, true)` into `conditions` when true (~297). |
| 8 | `src/lib/types/index.ts` — filters type (~175) | Add `hasFutureEvents?: boolean;` to the leads filters interface (mirror `staleOnly`). |
| 9 | `src/lib/zod/schemas.ts` (~117 & ~141) | Add `hasFutureEvents: z.boolean().optional()` to both schemas carrying `bankChargesAbsorbed` (leadUpdateSchema + sibling). |
| 10 | `src/routes/api/leads/[id]/+server.ts` (~70) | Pass `hasFutureEvents: data.hasFutureEvents` into the `updateLead` call, mirroring `bankChargesAbsorbed`. |
| 11 | `src/lib/components/leads/LeadListRow.svelte` (~43-46) | Import Badge; render a distinct-colored "Future Events" badge in the StageChip/AgeBadge cluster when `lead.hasFutureEvents`. |
| 12 | `src/routes/leads/[id]/+page.svelte` (~62/74/96 + header ~361-367) | Add `hasFutureEvents` edit state; bind checkbox in edit block (mirror bankChargesAbsorbed buttons ~679-694); include in save payload; render badge in detail header. |
| 13 | `src/lib/components/leads/LeadEditModal.svelte` | Add a checkbox bound to `hasFutureEvents`, consistent with the modal's existing boolean-field editing. |
| 14 | `src/routes/leads/[id]/edit/+page.svelte` | Add the same checkbox bound to `hasFutureEvents`. |
| 15 | `src/routes/leads/+page.server.ts` (~24/49/76) | Read `url.searchParams.get('hasFutureEvents') === '1'`; pass to `listLeadsFiltered`; include in returned `filters`. |
| 16 | `src/routes/leads/+page.svelte` (~78/156-157) | Add query-string emit (`if (data.filters.hasFutureEvents) p.set('hasFutureEvents','1')`) and a toolbar toggle button mirroring the staleOnly button, styled with a distinct color. |

## Public Contracts

- **DB schema:** new NOT NULL DEFAULT false column `crm_leads.has_future_events`. Additive; existing rows backfill to `false` via the default. No breaking change to existing readers.
- **PATCH `/api/leads/[id]`:** now accepts optional `hasFutureEvents: boolean` in the body via `leadUpdateSchema`. Omitting it leaves the field unchanged (conditional-spread). No change to existing fields' behavior.
- **`/leads?hasFutureEvents=1`:** new optional query param. Absent/`0` = no filter (existing behavior preserved).
- **`Lead` type:** gains non-optional `hasFutureEvents: boolean`. Callers already destructuring `Lead` are unaffected (additive).
- **Leads export (`/api/leads/export`):** intentionally NOT modified this iteration (SPEC out-of-scope). The export endpoint calls `listLeadsFiltered` with its own param subset; the new `hasFutureEvents` param defaults to false, so export behavior is unchanged and does not filter on the flag. Known limitation: an active `hasFutureEvents=1` filter on /leads is not reflected in a subsequent export. Accepted out-of-scope for #94.

## Blast Radius

- **Scope:** single package (`veent-crm`), single feature (leads). ~16 file touches, 1 generated migration.
- **Risk class:** LOW. Additive schema column with a safe default; no auth, no billing, no API-contract removal, no destructive migration, no cross-package impact.
- **Migration safety:** `ADD COLUMN ... DEFAULT false NOT NULL` is non-blocking on Postgres (metadata-only for a non-volatile default on PG 11+) for the row counts in this CRM and backfills existing rows to `false`. Rollback = `ALTER TABLE crm_leads DROP COLUMN has_future_events` (no data of value lost — internal visibility flag only).

## Implementation Checklist

1. `src/lib/server/db/schema.ts`: add `hasFutureEvents: boolean('has_future_events').notNull().default(false)` to `crmLeads` near line 177.
2. Run `bun run db:generate` to produce the migration; verify the generated SQL uses `ADD COLUMN IF NOT EXISTS ... DEFAULT false NOT NULL`. Do not hand-edit generated SQL.
3. `src/lib/types/index.ts`: add `hasFutureEvents: boolean;` to `Lead` (~94) and `hasFutureEvents?: boolean;` to the filters interface (~175).
4. `src/lib/server/db/leads.ts` `dbRowToLead` (~109): map `hasFutureEvents: row.hasFutureEvents ?? false`.
5. `src/lib/server/db/leads.ts` `updateLead`: (a) add `hasFutureEvents?: boolean;` to the inline input-type object at ~658 (next to `bankChargesAbsorbed?: boolean`) — REQUIRED or `input.hasFutureEvents` will be a TypeScript error; (b) add the conditional-spread persistence line at ~720.
6. `src/lib/server/db/leads.ts` `updateLead` audit (~787): add the `'has_future_events'` `crm_lead_history` entry (old/new stringified), mirroring bank_charges_absorbed.
7. `src/lib/server/db/leads.ts` `listLeadsFiltered` (~241/265/297): add `hasFutureEvents?: boolean` to `ListLeadsParams` (~241), destructure default `hasFutureEvents = false` (~265), and push `eq(crmLeads.hasFutureEvents, true)` when true (~297).
8. `src/lib/zod/schemas.ts`: add `hasFutureEvents: z.boolean().optional()` to both schemas (~117 & ~141) alongside `bankChargesAbsorbed`.
9. `src/routes/api/leads/[id]/+server.ts` (~70): pass `hasFutureEvents: data.hasFutureEvents` into `updateLead`.
10. `src/lib/components/leads/LeadListRow.svelte` (~43-46): render the distinct-color "Future Events" Badge in the badge cluster when `lead.hasFutureEvents`.
11. `src/routes/leads/[id]/+page.svelte`: add `hasFutureEvents` edit state (~62/74), include in save payload (~96), add the checkbox in the edit block (mirror ~679-694), and render the badge in the detail header (~361-367).
12. `src/lib/components/leads/LeadEditModal.svelte`: add the checkbox bound to `hasFutureEvents`.
13. `src/routes/leads/[id]/edit/+page.svelte`: add the same checkbox bound to `hasFutureEvents`.
14. `src/routes/leads/+page.server.ts` (~24/49/76): read the `hasFutureEvents=1` param, pass to `listLeadsFiltered`, include in returned `filters`.
15. `src/routes/leads/+page.svelte` (~78/156-157): emit the query param and add the toolbar toggle button mirroring the staleOnly toggle (distinct color).
16. Extend unit tests: `dbRowToLead` maps the new field; `leadUpdateSchema` accepts/ignores `hasFutureEvents`.
17. Extend Hybrid (`describe.skipIf(SKIP_DB)`) tests in `src/tests/leads.spec.ts` / `src/tests/leads-filters.spec.ts`: `updateLead` persists flag + writes correct audit row + leaves adjacent fields unchanged + works on a lost-stage lead; `listLeadsFiltered` filters on the flag.
18. Add `test.fixme(...)` stubs for the browser-level component scenarios (list badge, detail badge, edit checkbox save/reload, filter toggle) — blocked on the repo-wide Playwright e2e-auth-bootstrap fixture (Known-Gap, pre-accepted).
19. Run the automated test gate (`bun run test` / vitest) and typecheck; fix failures in blast radius until green.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `leadUpdateSchema` accepts `hasFutureEvents: true/false` and rejects non-boolean (vitest, no DB) — extend `src/tests/schemas.spec.ts` | Fully-Automated | AC1, AC2 (schema layer) |
| `dbRowToLead` maps `has_future_events` → `hasFutureEvents` boolean (pure-fn unit, no DB) | Fully-Automated | AC1 (mapping layer) |
| `updateLead` persists flag; reopen returns it — `describe.skipIf(SKIP_DB)` in `src/tests/leads.spec.ts` | Hybrid (precondition: `DATABASE_URL`) | AC1 (persistence) |
| `updateLead` toggle-off clears flag; reload reflects false — Hybrid | Hybrid | AC2 (persistence) |
| `listLeadsFiltered({hasFutureEvents:true})` returns only flagged; false/absent returns all — `src/tests/leads-filters.spec.ts` | Hybrid (precondition: `DATABASE_URL`) | AC5 |
| `updateLead` leaves stage/owner/other fields unchanged when only flag changes — Hybrid regression assertion | Hybrid | AC6 |
| `updateLead` writes a `crm_lead_history` row with field `'has_future_events'` + correct old/new — Hybrid | Hybrid | AC7 |
| `updateLead` sets flag on a lost-stage lead — Hybrid cross-stage case | Hybrid | AC8 |
| List-row badge renders when `hasFutureEvents`, distinct from StageChip/AgeBadge — `test.fixme` stub | Known-Gap (backlog stub; gate CONDITIONAL) | AC3 |
| Detail-header badge renders when `hasFutureEvents` — `test.fixme` stub | Known-Gap (backlog stub; gate CONDITIONAL) | AC4 |
| Edit-checkbox save→reload round-trip in browser + filter-toggle UI — `test.fixme` stubs | Known-Gap (backlog stub; gate CONDITIONAL) | AC1, AC2, AC5 (UI layer) |

**Testing context:** verification tiers were assigned from the loaded `process/context/tests/all-tests.md` routing chain and discovery of existing blast-radius test files (`src/tests/leads.spec.ts`, `leads-filters.spec.ts`, `leads-db.spec.ts`, `schemas.spec.ts`). Runner: vitest. Post-phase testing = the automated gate (checklist step 19) plus the Hybrid DB tier.

**Vacuous-green note:** AC3, AC4, and the UI-layer portions of AC1/AC2/AC5 are assigned Known-Gap ONLY for their browser-rendering proof, blocked on the repo-wide missing Playwright e2e-auth-bootstrap fixture (same treatment as issue-91's CONDITIONAL gate). VALIDATE confirmed (02-07-26) that the repo has NO Svelte component-test harness — no `@testing-library/svelte`, no `@vitest/browser`, no jsdom/happy-dom; the vitest config carries only a `node` server project and excludes `*.svelte.spec` files. So AC3/AC4 badge-rendering (which the SPEC optimistically labelled "Fully-Automated component test") genuinely cannot be automated without new dev-dependency infra, which the SPEC forbids — the Known-Gap downgrade is justified, not under-testing. Each has a `test.fixme` stub written now (residual recorded, not dropped) and their gates stay CONDITIONAL. Crucially, no acceptance criterion rests on Known-Gap alone: AC1/AC2 are also proven Fully-Automated at the schema layer and Hybrid at the persistence layer; AC5 is proven Hybrid at the query layer. The badge/checkbox rendering is the only residual, and it is a pre-existing repo-wide infra gap, not new missing coverage for this feature.

## Test Infra Improvement Notes

- Repo-wide gap: no shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This blocks browser-level proof of AC3/AC4 and the UI round-trip of AC1/AC2/AC5. Not introduced by this plan; carried as pre-accepted Known-Gap. When the fixture lands, promote the `test.fixme` stubs to real e2e specs.
- Secondary observation (VALIDATE 02-07-26): no Svelte component-test harness exists either. If lightweight component rendering coverage is ever wanted (badge/checkbox render without a full auth session), adding `@testing-library/svelte` + a `client` vitest project is the smaller alternative to the full Playwright auth fixture. Out of scope for #94 (SPEC forbids new deps).

## Dependencies

- None new. No new npm package, agent, or runtime surface (SPEC constraint). Requires a running Postgres (`DATABASE_URL`) only to exercise the Hybrid tier locally — same as every existing DB-backed leads test.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generated migration differs from expected `ADD COLUMN IF NOT EXISTS` shape | Low | Inspect the `bun run db:generate` output before applying; compare against `drizzle/0014_agreements_fields.sql`. Do not hand-write. |
| Forgetting to add `hasFutureEvents?: boolean` to the `updateLead` input type (~658) → conditional-spread TS error | Low | Checklist step 5(a) names line 658 explicitly; typecheck gate (step 19) is the backstop. |
| Missing one of the two zod schemas carrying `bankChargesAbsorbed` (~117 & ~141) | Low | Checklist step 8 names both line anchors explicitly; grep `bankChargesAbsorbed` in `schemas.ts` to confirm parity before finishing. |
| Badge color not visually distinct from StageChip/AgeBadge | Low | Use a color outside the stage/age palette; verify in the (fixme) component scenario when the e2e fixture exists. |
| Type made optional causing `undefined` badge checks | Low | Column is NOT NULL + mapper defaults to `false`; `Lead.hasFutureEvents` is non-optional boolean. |

## Backwards Compatibility

Additive only. Existing rows backfill to `false` via the column default. Existing PATCH callers that omit the field are unaffected (conditional-spread). `/leads` without the new param behaves exactly as today. Rollback is a single `DROP COLUMN` with no meaningful data loss.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/leads/active/recurring-organizer-tag_02-07-26/recurring-organizer-tag_PLAN_02-07-26.md`
2. **Last completed step:** VALIDATE complete (validate-contract written below). No code changed yet.
3. **Validate-contract status:** written (02-07-26) — Gate CONDITIONAL (browser-UI Known-Gap pre-accepted).
4. **Supporting context loaded:** SPEC (`recurring-organizer-tag_SPEC_02-07-26.md`), `process/context/all-context.md` (Drizzle/Superforms/soft-delete/audit conventions), `process/context/tests/all-tests.md` routing chain, precedent grep of `bankChargesAbsorbed` and `staleOnly`, `src/tests/*` SKIP_DB pattern.
5. **Next step for a fresh agent:** EXECUTE the 19-item checklist in order — schema+migration first (steps 1-2), then data layer (3-9), then UI (10-15), then tests (16-19). Gate is CONDITIONAL (accepted Known-Gaps for browser-level scenarios).

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S2 schema surface — single additive column). Single-package, ~16 file touches, mechanical mirror of an existing precedent; no fan-out benefit. Sequential vc-execute-agent (opus for the code-execution leg).

Test gates (C3 5-column table — ADDITIVE; the legacy line form below is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC2 (schema) | `leadUpdateSchema` accepts `hasFutureEvents: true/false`, rejects non-boolean | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` (new cases) | A — proven now |
| AC1 (mapping) | `dbRowToLead` maps `has_future_events` → boolean, defaults false | Fully-Automated | `bun run test:unit -- src/tests/leads.spec.ts` (pure-fn map case) | A — proven now |
| AC1 (persist) | `updateLead` persists flag; reopen returns it | Hybrid | `DATABASE_URL=... bun run test:unit -- src/tests/leads.spec.ts` (`describe.skipIf(SKIP_DB)`) | A — proven now (precondition: live Postgres) |
| AC2 (persist) | `updateLead` toggle-off clears flag; reload reflects false | Hybrid | same suite, toggle-off case | A — proven now (precondition: live Postgres) |
| AC5 (filter) | `listLeadsFiltered({hasFutureEvents:true})` returns only flagged; false/absent returns all | Hybrid | `DATABASE_URL=... bun run test:unit -- src/tests/leads-filters.spec.ts` | A — proven now (precondition: live Postgres) |
| AC6 (isolation) | `updateLead` leaves stage/owner/other fields unchanged when only flag changes | Hybrid | leads.spec.ts adjacent-field regression assertion | A — proven now (precondition: live Postgres) |
| AC7 (audit) | `updateLead` writes `crm_lead_history` row field `'has_future_events'` + correct old/new | Hybrid | leads.spec.ts audit-row assertion | A — proven now (precondition: live Postgres) |
| AC8 (cross-stage) | `updateLead` sets flag on a lost-stage lead | Hybrid | leads.spec.ts cross-stage case | A — proven now (precondition: live Postgres) |
| AC3 (list badge) | Distinct "Future Events" badge renders on /leads row, not confusable with StageChip/AgeBadge | Agent-Probe | manual visual check + `test.fixme` stub in e2e (promote when auth fixture lands) | D — backlog test-building stub (repo-wide Playwright auth-fixture gap) |
| AC4 (detail badge) | Badge renders on lead detail header | Agent-Probe | manual visual check + `test.fixme` stub in e2e | D — backlog test-building stub |
| AC1/AC2/AC5 (UI round-trip) | Edit-checkbox save→reload + filter-toggle in-browser | Agent-Probe | manual UI check + `test.fixme` stub in e2e | D — backlog test-building stub |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to a named later phase/plan; D — backlog test-building stub (named residual; keep-active).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the browser-rendering rows are carried as gap-resolution D (named residual, backlog stub), and manually probed until the auth fixture lands.

Legacy line form (retained so existing validate-contract consumers still parse):
- Schema/zod layer: Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- Mapping layer: Fully-automated: `bun run test:unit -- src/tests/leads.spec.ts`
- Persistence/audit/filter/isolation/cross-stage: Hybrid: `DATABASE_URL=... bun run test:unit -- src/tests/leads.spec.ts src/tests/leads-filters.spec.ts` (precondition: live Postgres reachable)
- Typecheck gate: Fully-automated: `bun run check`
- Browser badge/checkbox/filter rendering: known-gap: documented — `test.fixme` stubs; blocked on repo-wide Playwright e2e-auth-bootstrap fixture

Failing stub (AC1/AC2 schema — Fully-Automated):
```
test("should accept hasFutureEvents true/false and reject non-boolean on leadUpdateSchema", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: leadUpdateSchema accepts hasFutureEvents boolean, rejects non-boolean")
})
```

Failing stub (AC1 mapping — Fully-Automated):
```
test("should map has_future_events row column to hasFutureEvents boolean (default false)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: dbRowToLead maps has_future_events -> hasFutureEvents")
})
```

Dimension findings:
- Infra fit: PASS — single-package leads feature, no container/worker/proxy surface; vitest runner + `describe.skipIf(SKIP_DB)` Hybrid pattern already established; all 16 target files verified present on disk.
- Test coverage: CONCERN — DB/schema/query layers fully covered (Fully-Automated + Hybrid); browser rendering (AC3/AC4 + UI round-trip of AC1/AC2/AC5) is a named residual blocked on the repo-wide missing Playwright auth fixture. No component-test harness exists, so Known-Gap is justified, not under-testing.
- Breaking changes: PASS — additive NOT NULL DEFAULT false column (backfills existing rows to false); PATCH gains one optional body field (conditional-spread, omission = unchanged); `/leads` gains one optional query param (absent = existing behavior). No contract removal. Leads export intentionally untouched (SPEC out-of-scope) and unaffected (new param defaults false).
- Security surface: PASS — internal boolean visibility flag; no auth/billing/secret/trust-boundary change; edited via the existing authenticated PATCH endpoint under the same authz as every other lead field; zod-validated boolean, no injection surface. Not a high-risk class → no evidence pack required.
- Schema + migration (Section, touchpoints 1–2): PASS — mirrors `bank_charges_absorbed`/`0014_agreements_fields.sql`; generated migration (not hand-written); `ADD COLUMN IF NOT EXISTS ... DEFAULT false NOT NULL` is metadata-only on PG 11+.
- Data layer (Section, touchpoints 3–8): CONCERN (resolved in plan) — checklist step 5 originally named only the conditional-spread (~720) and not the `updateLead` inline input-type at `leads.ts:658`; without adding `hasFutureEvents?: boolean` there, `input.hasFutureEvents` is a TS error. Plan step 5 amended by VALIDATE to name line 658 explicitly. Highest-risk edit; typecheck gate is the backstop.
- Zod + PATCH (Section, touchpoints 9–10): PASS — both zod schemas (~117 & ~141) verified to carry `bankChargesAbsorbed`; adding an optional boolean is purely additive and does not loosen validation of existing fields.
- UI (Section, touchpoints 11–16): CONCERN — mechanically feasible (all edit targets + `staleOnly`/badge-cluster precedents verified) but rendering cannot be automated in-repo (no component/e2e auth harness). Highest-risk UI edit: badge color must be outside the stage/age palette to satisfy AC3's "not confusable" requirement — mitigate by choosing a distinct color and probing manually.

Open gaps:
- Browser-rendering proof for AC3, AC4, and the UI round-trip of AC1/AC2/AC5: known-gap: documented — `test.fixme` stubs written now; blocked on repo-wide Playwright e2e-auth-bootstrap fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Pre-accepted (same treatment as issue-91).
- Leads export filter-parity with the new flag: out-of-scope per SPEC (export untouched this iteration); no breakage. Observational only.

What this coverage does NOT prove:
- The Fully-Automated schema/mapping gates do NOT prove the badge actually renders in a browser, that the checkbox saves through the real edit UI, or that the /leads toggle button visibly filters the on-screen list.
- The Hybrid persistence/filter/audit/isolation/cross-stage gates prove server-side behavior against a live Postgres but do NOT prove any DOM/rendering behavior, and do NOT run in CI unless `DATABASE_URL` is set (self-skip via `describe.skipIf(SKIP_DB)`).
- The typecheck gate (`bun run check`) proves type correctness but not runtime behavior.
- Nothing here proves badge color is visually distinct enough to satisfy AC3's "not confusable with stage chip / age badge" — that is an Agent-Probe / manual visual judgment until the e2e fixture lands.

Gate: CONDITIONAL (0 FAILs; browser-UI rendering carried as pre-accepted Known-Gap residual; one plan-completeness concern already applied to the checklist)
Accepted by: session (SPEC-pre-accepted browser-UI Known-Gap, documented in SPEC scope and matching the issue-91 precedent; data/schema/query layers fully covered by Fully-Automated + Hybrid gates — the residual is a pre-existing repo-wide test-infra gap, not new missing coverage). Accepted concerns: (1) browser-rendering Known-Gap for AC3/AC4 + UI round-trip of AC1/AC2/AC5; (2) SPEC-vs-plan strategy reclassification of AC3/AC4 from Fully-Automated to Known-Gap (justified — no component harness); (3) leads-export filter-parity out-of-scope note.

## Autonomous Goal Block

```
SESSION GOAL: Implement GitHub #94 — recurring-organizer "Has future events" boolean flag on crm_leads (badge on /leads list + lead detail header, edit checkbox, /leads filter toggle), mirroring the bank_charges_absorbed precedent end-to-end.
Charter + umbrella plan: N/A — single SIMPLE plan.
Autonomy: standard /goal autonomous execution — auto-proceed on reversible steps; CONDITIONAL gate already accepted (browser-UI Known-Gap). No user gate required to enter EXECUTE.
Hard stop conditions / safety constraints:
- Do NOT hand-write the Drizzle migration — generate via `bun run db:generate` and verify it matches `ADD COLUMN IF NOT EXISTS ... DEFAULT false NOT NULL`.
- Do NOT introduce any new npm dependency, agent, or runtime surface (SPEC constraint).
- Do NOT modify ingest (`/api/leads/ingest`) or export (`/api/leads/export`) behavior — out of scope for #94.
- Do NOT alter pipeline-stage, ownership, or scoring logic — the flag is a fully independent additive attribute.
- Stop and surface if the generated migration is destructive or requires a table rewrite/backfill beyond the DEFAULT.
Next phase: EXECUTE — process/features/leads/active/recurring-organizer-tag_02-07-26/recurring-organizer-tag_PLAN_02-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate CONDITIONAL).
Execute start: fully-auto: `bun run check` + `bun run test:unit -- src/tests/schemas.spec.ts src/tests/leads.spec.ts` | hybrid (needs DATABASE_URL): `bun run test:unit -- src/tests/leads.spec.ts src/tests/leads-filters.spec.ts` | agent-probe: manual badge/checkbox/filter visual check | high-risk pack: no.
```

## Next Step

DONE. EXECUTE completed all 19 checklist items; EVL confirmation run (independent vc-tester
re-spawn) passed all Fully-Automated/Hybrid gates. Archived via UPDATE PROCESS 02-07-26 — see
`recurring-organizer-tag_REPORT_02-07-26.md` for the closeout packet, SPEC achievement scoring
(6/8 met, AC3/AC4 unmet — both tracked as the shared repo-wide e2e-auth-fixture gap), and gate
results. No further phase for this plan.
