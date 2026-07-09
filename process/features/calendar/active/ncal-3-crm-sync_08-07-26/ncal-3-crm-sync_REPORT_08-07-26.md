---
phase: ncal-3-phase-1-schema
date: 2026-07-08
status: COMPLETE
feature: calendar
plan: process/features/calendar/active/ncal-3-crm-sync_08-07-26/ncal-3-crm-sync_PLAN_08-07-26.md
---

# NCAL-3 Phase 1 — Schema Migration Execute Report

## What Was Done

**Step 1 — Journal drift confirmed (E5)**

Drift state confirmed as documented in `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`:
- 34 `.sql` files on disk vs 33 journal entries (idx 0–32)
- Two files share prefix `0014`: `0014_agreements_fields.sql` (unregistered stray) and `0014_nasty_master_mold.sql` (registered at idx 14)
- Additional deeper drift: `drizzle/meta/` has no snapshot files for idx 27–32; `0026_snapshot.json` and `0030_snapshot.json` both have the same `prevId` (snapshot chain collision)
- `bun run db:generate` hard-errors: `[0026_snapshot.json, 0030_snapshot.json] are pointing to a parent snapshot which is a collision`

Because `db:generate` is blocked, the migration was authored by hand — **consistent with the existing established pattern** (migrations 0027–0032 are all HAND-WRITTEN with the same header comment and no corresponding snapshot files).

**Step 2 — Schema columns added**

`src/lib/server/db/schema.ts`:
- Added to `crmMeetings` (after `hourReminderSentAt`): `nextcloudUid: text('nextcloud_uid')`
- Added to `crmLeads` (after `updatedAt`): `nextcloudGoLiveUid: text('nextcloud_go_live_uid')` and `nextcloudEventUid: text('nextcloud_event_uid')`
- All three nullable (no `.notNull()`, no `.default()`), snake_case DB names

**Step 3 — Migration file created + journal registered**

- Created `drizzle/0033_ncal3_uid_columns.sql` (3 ALTER TABLE statements, HAND-WRITTEN per repo pattern)
- Registered idx 33 tag `0033_ncal3_uid_columns` in `drizzle/meta/_journal.json`
- No snapshot created (consistent with idx 27–32 precedent; snapshot chain is already broken)

**Step 4 — getMeeting() extended**

`src/lib/server/db/meetings.ts` — `getMeeting()` now selects and returns `nextcloudUid: string | null` alongside `id` and `organizerId`. Return type updated accordingly.

**Step 5 — Lead type + dbRowToLead extended**

- `src/lib/types/index.ts` — added `nextcloudGoLiveUid?: string | null` and `nextcloudEventUid?: string | null` to `Lead` interface
- `src/lib/server/db/leads.ts` — `dbRowToLead` maps the two new columns from the DB row

**Step 6 — Schema unit test created**

`src/tests/schema-ncal3.spec.ts` — 3 tests verifying column names on the Drizzle table objects (fully automated, no DB required).

**Test fixture updates (within blast radius)**

Three existing test fixture helper functions lacked the new columns (TypeScript strict-mode type error). Added `null` defaults to match the schema's nullable type:
- `src/tests/reminders.spec.ts` — `makeLeadRow()` fixture
- `src/tests/leads.spec.ts` — `makeRow()` fixture
- `src/tests/leads-db.spec.ts` — `makeMapperRow()` fixture
- `src/tests/meetings.spec.ts` — `makeRow()` fixture

These are within blast radius (they use `dbRowToLead`/`dbRowToMeeting` which now require the new columns).

## What Was Skipped or Deferred

- `bun run db:migrate` — NOT run. Migration apply requires a live Postgres database. Deploy-time step. Document in the `drizzle-migration-journal-drift` backlog note as a follow-up.
- Phase 2, 3, 4 — not started per plan constraint.
- Snapshot file for idx 33 — not created (snapshot chain is broken; consistent with idx 27–32 precedent).

## Gate Results

| Gate | Result | Notes |
|---|---|---|
| `bun run test:unit:ci` | PASS | 547 passed, 165 skipped (712 total); `schema-ncal3.spec.ts` 3/3 green |
| `bun run check` | PASS | 0 errors, 5 pre-existing warnings |
| `bun run lint` | PASS | 0 errors; 1 pre-existing warning in `calendar/+page.svelte` (not from this PR) |

## Plan Deviations

**Deviation 1 — Hand-written migration instead of `db:generate`**

- What: `db:generate` was expected to produce `drizzle/0033_*.sql` automatically. Instead, the migration was hand-authored and the journal was manually updated.
- Why: Snapshot chain collision (`0026_snapshot.json` and `0030_snapshot.json` share the same `prevId`) causes `drizzle-kit generate` to hard-error. This is a deeper form of the documented drift — the plan's validate contract (E5) acknowledged the drift but expected `db:generate` to still succeed. It does not.
- Impact: The SQL content is correct (3 `ALTER TABLE ... ADD COLUMN text` statements). Deploy behavior is identical to a generated migration. Within blast radius (the migration file itself). The `HAND-WRITTEN` pattern is already established by 7 prior migrations.
- Classification: Within-blast-radius deviation.

**Deviation 2 — Test fixture files updated**

- What: Four test fixture helper functions in existing spec files needed the new nullable columns added as explicit `null` values to satisfy TypeScript's strict inference of `DbLead`/`DbMeeting`.
- Why: Adding columns to the schema changes the inferred `$inferSelect` type, making existing fixture objects incomplete. This is expected collateral from an additive schema change.
- Impact: No behavior changes to tests; fixture objects remain structurally correct.
- Classification: Within-blast-radius deviation.

## Test Infra Gaps Found

- `bun run db:migrate` cannot be verified in this environment (no live Postgres). Deploy-time confirmation remains a known gap (pre-accepted per plan).
- Snapshot chain collision remains unresolved — tracked in `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`.

## Closeout Packet

- Selected plan: `process/features/calendar/active/ncal-3-crm-sync_08-07-26/ncal-3-crm-sync_PLAN_08-07-26.md`
- Phase 1 complete: all checklist items done, 3 gates green
- Unverified: live Postgres migration apply (deploy-time step)
- Cleanup remaining: none for Phase 1; Phase 2 can begin immediately
- Plan status: **Keep in active** — Phase 2 work begins next

## Forward Preview

### Test Infra Found
- Vitest unit suite fully functional; schema column shape tests pattern works well for Phase 2 builder tests

### Blast Radius Changes
- `src/lib/server/db/schema.ts` — 3 new columns
- `drizzle/0033_ncal3_uid_columns.sql` — new hand-written migration
- `drizzle/meta/_journal.json` — idx 33 entry added
- `src/lib/server/db/meetings.ts` — `getMeeting()` return type extended
- `src/lib/server/db/leads.ts` — `dbRowToLead` extended
- `src/lib/types/index.ts` — `Lead` interface extended
- `src/tests/schema-ncal3.spec.ts` — new test file
- `src/tests/reminders.spec.ts`, `leads.spec.ts`, `leads-db.spec.ts`, `meetings.spec.ts` — fixture null additions

### Commands to Stay Green
```
bun run test:unit:ci
bun run check
bun run lint
```

### Dependency Changes
Phase 2 (`src/lib/server/n8n/calendar-sync.ts`) requires Phase 1 columns and the extended `getMeeting()` return shape — both now available.
