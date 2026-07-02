---
phase: phase-1-schema-accessor-validators-substitution
date: 2026-07-02
status: COMPLETE
feature: outreach-templates
plan: process/features/outreach-templates/active/outreach-templates_02-07-26/outreach-templates_PLAN_02-07-26.md
---

# Outreach Templates — Phase 1 EXECUTE Report

**TL;DR:** Phase 1 (schema + accessor + validators + 3-key substitution) is CODE DONE. Both gates green: `bun run check` = 0 errors, `bun run test:unit:ci` = 264 passed / 75 skipped. One forced within-blast-radius deviation: a minimal `LogTouchForm.svelte` call-site shim + static-token rename were required because the Phase-1 `fillTemplate` signature change breaks the Phase-4 call site — the plan under-specified this.

## What Was Done

Checklist items 1–9 all implemented:

1. `crmMessageTemplates` pgTable added to `src/lib/server/db/schema.ts` (reuses `leadCategory` enum, `default('Other')`, uuid PK `defaultRandom`, `title`/`body` text notNull, nullable `deletedAt` timestamptz, created/updated timestamptz). Added `CrmMessageTemplate` inferred-select type export.
2. Migration generated via `bun run db:generate` → `drizzle/0013_milky_human_fly.sql` (additive CREATE TABLE only; not hand-edited).
3. `MessageTemplate` interface added to `src/lib/types/index.ts` using the real exported `Category` type (no `deletedAt` in the surface type).
4. `src/lib/server/db/templates.ts` created: pure `dbRowToTemplate` mapper + `listTemplates`/`getTemplate`/`createTemplate`/`updateTemplate`/`softDeleteTemplate`, all reads `and(isNull(deletedAt), …)`. Exposed `listTemplatesQuery()` so the DB-free `.toSQL()` backstop can introspect the list query.
5. `templateFormSchema` + `TemplateForm` type added to `src/lib/zod/schemas.ts` (reuses `LEAD_CATEGORIES`).
6. `fillTemplate` in `src/lib/data/templates.ts` changed to 3-key signature `{ organizerName, eventName, repName }`, same `.replaceAll` approach, missing values degrade to `''`. Static `TEMPLATES` array kept.
7. `src/tests/templates.spec.ts` rewritten for the 3-key signature (all-present, empty-degrade, no-token passthrough, repeated-token). Old 2-key + `TEMPLATES`-iteration case dropped in this phase.
8. `src/tests/templates-db.spec.ts` created: `SKIP_DB`-gated CRUD/soft-delete/double-delete-no-op + two DB-free `.toSQL()` assertions proving `deleted_at IS NULL` filter and category/title ordering (these run in CI without a DB).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bun run check` | PASS — 0 errors, 1 pre-existing unrelated warning (`leads/[id]/edit/+page.svelte`) |
| Unit tests | `bun run test:unit:ci` | PASS — 264 passed / 75 skipped |
| New specs (isolated) | `bun run test:unit:ci -- src/tests/templates.spec.ts src/tests/templates-db.spec.ts` | PASS — 6 passed (4 fillTemplate + 2 DB-free `.toSQL()`), 5 DB CRUD self-skip (no `DATABASE_URL`) |

## Plan Deviations

**DEV-1 (within blast radius): `LogTouchForm.svelte` minimal call-site shim + static-token rename.**
- File paths: `src/lib/components/leads/LogTouchForm.svelte` (line ~38 call site only), `src/lib/data/templates.ts` (static `TEMPLATES` bodies + doc comment).
- Deviation: The plan sequenced all `LogTouchForm.svelte` changes to Phase 4 and said to leave the static `TEMPLATES` bodies untouched in Phase 1. But the Phase-1 `fillTemplate` signature change (item 6) breaks `LogTouchForm`'s existing 2-key `fillTemplate(t.body, { page, event })` call, which fails the mandatory Phase-1 `bun run check` gate. The plan did not account for this call site.
- Resolution: applied the MINIMAL forced change only — updated the single `applyTemplate` call to the 3-key form (`repName: ''`, inert since no static body uses that token) and renamed the static `TEMPLATES` tokens `{{page}}→{{organizerName}}`, `{{event}}→{{eventName}}` so rep-facing substitution stays behavior-equivalent through Phases 1–3. The Phase-4 composer rework (props, group-by-category, replace-with-confirm, static-import retirement) was NOT done.
- Impact: rep-facing behavior unchanged (organizerName←lead.name, eventName←lead.eventName, same as before). No schema/auth/API surface touched. Phase 4 still owns the real composer rework and `TEMPLATES` retirement.

## What Was Skipped or Deferred

- Phases 2 (manager CRUD route/API), 3 (seed script), 4 (composer integration) — out of this spawn's scope.
- DB CRUD roundtrip tests self-skip without `DATABASE_URL` (repo-wide `SKIP_DB` convention); the DB-free `.toSQL()` filter assertion is the CI-green backstop as required by the plan.

## Test Infra Gaps Found

None new. Existing repo-wide gaps unchanged (no live-DB CI harness; no Playwright auth fixture).

## Closeout Packet

- Selected plan: `process/features/outreach-templates/active/outreach-templates_02-07-26/outreach-templates_PLAN_02-07-26.md`
- Finished: Phase 1 checklist items 1–9, both gates green.
- Verified: typecheck + all Fully-Automated Phase-1 gates (Zod, fillTemplate, DB-free soft-delete filter assertion). Unverified: DB roundtrip (needs live Postgres — self-skips).
- Remaining cleanup/context: none for Phase 1. Migration `0013` must be applied to a real DB before Phase 2/3 Hybrid steps.
- Best next state: Keep plan in active/ — Phase 1 CODE DONE; Phases 2–4 remain.
- Classification: **Keep in active/testing** (multi-phase plan; Phase 1 of 4 complete).

## Forward Preview

### Test Infra Found
No new harness. `SKIP_DB` + `.toSQL()` DB-free backstop pattern (from `leads-db.spec.ts`) reused successfully for templates.

### Blast Radius Changes
Added: `crm_message_templates` table + migration `0013_milky_human_fly.sql`; `src/lib/server/db/templates.ts`; `MessageTemplate` type; `templateFormSchema`. Modified: `schema.ts`, `types/index.ts`, `schemas.ts`, `data/templates.ts`, plus forced shim in `LogTouchForm.svelte`.

### Commands to Stay Green
`bun run check` && `bun run test:unit:ci`

### Dependency Changes
None. No new packages.
