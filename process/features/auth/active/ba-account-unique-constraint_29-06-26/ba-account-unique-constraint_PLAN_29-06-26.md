# ba-account-unique-constraint PLAN

Date: 29-06-26
Complexity: Simple
Status: ⏳ PLANNED
Feature: auth
Branch: feat/ba-account-unique-constraint

## Overview

Add a composite unique constraint on `(provider_id, account_id)` to the Better Auth `account`
table so a provider+account pair cannot be duplicated. Because the `account` table is owned by
Better Auth (CLAUDE.md: "Never write Drizzle migrations for Better Auth tables"), this constraint
must be delivered as a **hand-authored SQL migration** — not via `db:generate` / Drizzle schema
diff. `schema.ts` gains a comment annotation only; no Drizzle-managed index is added there.

---

## Quick Links

- [Goals](#goals-and-success-metrics)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Implementation Checklist](#implementation-checklist)
- [Touchpoints](#touchpoints)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

---

## Goals and Success Metrics

- `account` table has a `UNIQUE(provider_id, account_id)` constraint in the live database.
- Duplicate inserts with the same `(provider_id, account_id)` pair are rejected at the DB level.
- Drizzle's migration journal and snapshot are consistent with the applied SQL.
- `schema.ts` `baAccount` definition is annotated but NOT modified to add a Drizzle-managed index.
- `bun run check` and `bun run test:unit` remain green.

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** — Works with other system pieces
2. **Manual Test** — User can perform the action
3. **Data Verification** — Database/state changes confirmed
4. **Error Handling** — Failure cases handled gracefully
5. **User Confirmation** — User says "it works"

Status meanings:
- ⏳ PLANNED — Not started
- 🔨 CODE DONE — Written but not E2E tested
- 🧪 TESTING — Currently being tested
- ✅ VERIFIED — Tested AND confirmed working
- 🚧 BLOCKED — Has issues

---

## Execution Brief

### Phase 1 — Hand-author the SQL migration
Write `drizzle/0003_ba_account_unique.sql` with a single `ALTER TABLE` statement.
Update `drizzle/meta/_journal.json` to register the new entry.
Copy `drizzle/meta/0002_snapshot.json` → `0003_snapshot.json` and add the unique constraint to
the `account` table definition inside the snapshot.
Add a one-line comment in `schema.ts` near `baAccount` pointing at the manual migration.

**Done when:** files exist on disk; `bun run check` passes; `bun run test:unit` passes.

### Phase 2 — Apply and verify (requires live Postgres)
Run `bun run db:migrate` against a live DB (local compose or dev droplet) with the full migration
chain. Verify the constraint exists with `\d account` in psql and attempt a duplicate insert to
confirm the DB rejects it.

**Done when:** migration applies cleanly; duplicate insert attempt raises
`ERROR: duplicate key value violates unique constraint`.

---

## Implementation Checklist

- [ ] **1. Write the SQL migration**
  Create `drizzle/0003_ba_account_unique.sql`:
  ```sql
  ALTER TABLE "account"
    ADD CONSTRAINT "account_provider_id_account_id_unique"
    UNIQUE ("provider_id", "account_id");
  ```

- [ ] **2. Register in journal**
  Append to `drizzle/meta/_journal.json` entries array:
  ```json
  {
    "idx": 3,
    "version": "7",
    "when": <current-unix-ms>,
    "tag": "0003_ba_account_unique",
    "breakpoints": true
  }
  ```
  (Existing entries use version `"7"` — match that value. The journal-tag `0003_ba_account_unique`
  MUST exactly match the SQL filename stem so `drizzle-kit migrate` resolves it.)

- [ ] **3. Create snapshot 0003**
  Copy `drizzle/meta/0002_snapshot.json` → `drizzle/meta/0003_snapshot.json`.
  Inside the copy, find the account table definition under `"tables"` — its key is
  **`"public.account"`** (schema-qualified), NOT `"account"` — and add the unique
  constraint to its `"uniqueConstraints"` object (which currently exists as `{}`):
  ```json
  "account_provider_id_account_id_unique": {
    "name": "account_provider_id_account_id_unique",
    "nullsNotDistinct": false,
    "columns": ["provider_id", "account_id"]
  }
  ```

- [ ] **4. Annotate schema.ts**
  Above `export const baAccount = pgTable(...)` (line ~250) add:
  ```ts
  // Composite unique constraint (provider_id, account_id) is enforced via
  // drizzle/0003_ba_account_unique.sql — not managed by Drizzle schema diff
  // per project convention (Better Auth owns this table's migration lifecycle).
  // TODO (when Better Auth is wired): confirm the adapter handles the unique
  // violation gracefully (ON CONFLICT) rather than surfacing a 500.
  ```

- [ ] **5. Type-check + unit tests**
  ```bash
  bun run check       # must pass — 0 errors
  bun run test:unit   # must pass — vitest, all green (NOT `bun test`; that runs Bun's
                      # native runner, not the project's configured vitest)
  ```

- [ ] **6. Apply migration (live DB required)**
  Pre-flight dedup check FIRST (the constraint creation aborts if existing rows violate it):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
  docker compose exec db psql -U crm veent_crm -c \
    "SELECT provider_id, account_id, COUNT(*) FROM account GROUP BY 1,2 HAVING COUNT(*)>1;"
  # Expect: 0 rows. If any rows returned, deduplicate before migrating.
  DATABASE_URL=postgres://crm:crm@127.0.0.1:5432/veent_crm bun run db:migrate
  ```

- [ ] **7. Verify constraint in DB**
  ```bash
  docker compose exec db psql -U crm veent_crm -c "\d account"
  # Expect: "account_provider_id_account_id_unique" UNIQUE constraint listed
  ```

- [ ] **8. Smoke-test duplicate rejection**
  `account.user_id` is a NOT NULL FK to `user.id`. Seed a throwaway `user` row FIRST, or the
  account INSERTs fail with a foreign-key violation BEFORE the unique constraint is exercised:
  ```bash
  docker compose exec db psql -U crm veent_crm -c "
    INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('u-smoke','Smoke User','smoke@test.local', false, now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
    VALUES ('test-1','acct-x','google','u-smoke', now(), now());
    INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
    VALUES ('test-2','acct-x','google','u-smoke', now(), now());
  "
  # Expect: second INSERT raises
  #   ERROR: duplicate key value violates unique constraint "account_provider_id_account_id_unique"
  # Clean up (accounts first — FK — then the throwaway user):
  docker compose exec db psql -U crm veent_crm -c "
    DELETE FROM account WHERE id IN ('test-1','test-2');
    DELETE FROM \"user\" WHERE id = 'u-smoke';
  "
  ```

- [ ] **9. Commit**
  ```bash
  git add drizzle/0003_ba_account_unique.sql drizzle/meta/_journal.json drizzle/meta/0003_snapshot.json src/lib/server/db/schema.ts
  git commit -m "feat(auth): add composite unique constraint on (provider_id, account_id) in account table"
  ```

---

## Touchpoints

| File | Change type |
|---|---|
| `drizzle/0003_ba_account_unique.sql` | New — hand-authored migration SQL |
| `drizzle/meta/_journal.json` | Modified — new entry appended |
| `drizzle/meta/0003_snapshot.json` | New — copy of 0002 + unique constraint added |
| `src/lib/server/db/schema.ts` | Modified — comment annotation only (no schema change) |

---

## Public Contracts

- **DB constraint name:** `account_provider_id_account_id_unique` on table `account` — any code
  that inserts into `account` with a duplicate `(provider_id, account_id)` will now receive a
  PostgreSQL unique-violation error. Better Auth's own insert logic should handle this gracefully
  (it uses `ON CONFLICT DO NOTHING` or similar in most adapters); verify when Better Auth is wired.
- No SvelteKit routes, API endpoints, or TypeScript types change.

---

## Blast Radius

- **Scope:** 4 files, 1 table, auth feature only.
- **Risk class:** Low-but-touches-two-high-risk-classes — additive DDL only (auth/identity table +
  schema migration). No existing rows should violate the constraint (Better Auth generates unique
  `accountId` per provider per user by design). No data is deleted; no auth logic, trust boundary,
  or secret changes.
- **Packages affected:** none (migration is DB-only; no TS compilation units change).
- **Drizzle schema diff:** `schema.ts` gains a comment only — `db:generate` will NOT emit a new
  migration for this change because no Drizzle-tracked schema element is modified. The snapshot
  is updated manually to keep the journal self-consistent.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` — 0 errors | Fully-Automated | No TypeScript regressions from schema.ts annotation |
| `bun run test:unit` — all pass | Fully-Automated | No unit-test regressions |
| `bun run db:migrate` exits 0 | Hybrid (needs live Postgres) | Migration applies without error |
| `\d account` shows constraint | Hybrid (psql inspect) | Constraint exists in live DB |
| Duplicate `(provider_id, account_id)` INSERT rejected | Hybrid (manual psql + seeded user) | DB enforces uniqueness |

---

## Test Infra Improvement Notes

(none identified yet — no new test file is warranted for a pure DDL addition; the smoke test in checklist step 8 is sufficient.)

---

## Acceptance Criteria

- [ ] `drizzle/0003_ba_account_unique.sql` exists with the `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` statement.
- [ ] `drizzle/meta/_journal.json` contains an entry with `"tag": "0003_ba_account_unique"`.
- [ ] `drizzle/meta/0003_snapshot.json` contains the `account_provider_id_account_id_unique` entry in the `public.account` table's `uniqueConstraints`.
- [ ] `schema.ts` `baAccount` block has a comment noting the manual migration and the project convention.
- [ ] `bun run check` exits 0 (no TypeScript errors).
- [ ] `bun run test:unit` exits 0 (vitest, all unit tests pass).
- [ ] `bun run db:migrate` applies without error against a live Postgres instance.
- [ ] `\d account` in psql shows `account_provider_id_account_id_unique` as a unique constraint.
- [ ] A duplicate `(provider_id, account_id)` INSERT is rejected by the DB with a unique-violation error.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Existing `account` rows already violate the constraint | Pre-migration: `SELECT provider_id, account_id, COUNT(*) FROM account GROUP BY 1,2 HAVING COUNT(*)>1;` — if any rows returned, deduplicate before applying (now wired into checklist step 6). |
| Smoke-test INSERT fails on `user_id` FK before testing uniqueness | Seed a throwaway `user` row first (checklist step 8); clean up accounts before the user. |
| Snapshot version mismatch (Drizzle upgrades) | Copy from the most recent snapshot and add only the new `uniqueConstraints` entry; do not hand-edit other snapshot fields. |
| Better Auth's own insert code doesn't handle unique violation gracefully | Acceptable known-gap for v0 (Better Auth not wired yet); noted as a TODO in the comment added to `schema.ts`. Re-verify when auth is wired. |

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/auth/active/ba-account-unique-constraint_29-06-26/ba-account-unique-constraint_PLAN_29-06-26.md`
2. **Last completed phase:** none — ⏳ PLANNED
3. **Validate-contract status:** written (29-06-26) — Gate CONDITIONAL
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `src/lib/server/auth.ts`, `src/lib/server/db/schema.ts`, `drizzle/meta/_journal.json`
5. **Next step for a fresh agent:** Start at checklist item 1 — write `drizzle/0003_ba_account_unique.sql`. Do not run `db:generate`. Apply the migration only against a live Postgres instance (compose + `docker-compose.local.yml`). Run the pre-flight dedup check, then verify with psql before committing.

---

## Cursor + RIPER-5 Guidance

- **Cursor Plan mode:** import the Implementation Checklist; execute steps 1–5 first (no live DB), then steps 6–9 with compose running.
- **RIPER-5:** this plan is post-PLAN. Next: `ENTER VALIDATE MODE`, then `ENTER EXECUTE MODE`.
- After step 7, stop and verify the constraint in psql before proceeding to step 8.

---

## Validate Contract

Status: CONDITIONAL
Date: 29-06-26
date: 2026-06-29
generated-by: inner-pvl: phase-1

Parallel strategy: parallel-subagents (fan-out executed in Simple Mode; self-contained plan)
Rationale: 4 Layer 1 dimensions + 2 Layer 2 sections, no cross-agent coordination needed. EXECUTE recommendation: sequential (score 2/7 — dependent, ordered steps, 4 files, single agent).

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-check | schema.ts annotation introduces no TS regressions | Fully-Automated | `bun run check` exits 0 | A — proven at EXECUTE |
| AC-unit | existing unit suite stays green | Fully-Automated | `bun run test:unit` exits 0 (vitest) | A — proven at EXECUTE |
| AC-migrate | hand-authored 0003 migration applies cleanly through the chain | Hybrid | `bun run db:migrate` exits 0 (precondition: live Postgres via compose + `docker-compose.local.yml` + `DATABASE_URL`) | A — proven at EXECUTE against live DB |
| AC-constraint | constraint exists in live DB | Hybrid | `docker compose exec db psql -U crm veent_crm -c "\d account"` shows `account_provider_id_account_id_unique` (precondition: migration applied) | A — proven at EXECUTE against live DB |
| AC-reject | DB rejects a duplicate `(provider_id, account_id)` pair | Hybrid | step-8 dual-INSERT (precondition: live DB + seeded `user` row for the FK) raises `duplicate key value violates unique constraint` | A — proven at EXECUTE against live DB |
| AC-ba-insert | Better Auth adapter handles the unique violation gracefully (no 500) | Agent-Probe | deferred — Better Auth not wired in v0 | D — backlog known-gap; re-verify when auth is wired |

gap-resolution legend: A — proven now/at EXECUTE; B — fixed in this plan; C — deferred to named later phase; D — backlog known-gap stub.

C-4 reconciliation: `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). AC-ba-insert is a named residual (gap-resolution D), not a proving strategy.

Legacy line form (retained for existing consumers):
- TypeScript: Fully-automated: `bun run check` exits 0
- Unit tests: Fully-automated: `bun run test:unit` exits 0 (vitest — NOT `bun test`)
- Migration apply: hybrid: `bun run db:migrate` exits 0 + precondition: live Postgres (compose + local override + DATABASE_URL)
- Constraint exists: hybrid: `psql "\d account"` + precondition: migration applied
- Duplicate rejection: hybrid: step-8 dual-INSERT + precondition: live DB + seeded user row
- BA adapter conflict handling: known-gap: documented — Better Auth not wired (v0)

Failing stubs: none. The two Fully-Automated rows (`bun run check`, `bun run test:unit`) are
regression command-gates over existing surfaces, not new-behavior unit tests — the plan correctly
notes no new test file is warranted for a pure DDL addition. The constraint's runtime behavior is
proven by Hybrid psql gates, which do not receive TDD stubs.

Dimension findings:
- Infra fit: PASS — `db:migrate` = `drizzle-kit migrate` (confirmed); journal tag↔SQL-filename match confirmed; compose + `docker-compose.local.yml` present; hand-authored-SQL + manual-journal/snapshot is the correct way to deliver a constraint on a Better-Auth-owned table without `db:generate`.
- Test coverage: CONCERN (fixed in plan) — plan named `bun test` (Bun native runner) where the project uses `bun run test:unit` (vitest); corrected in Goals + checklist step 5. High-risk minimum-tier rule satisfied: auth/identity + schema/migration both carry Hybrid gates (psql inspect + duplicate-reject smoke test).
- Breaking changes: PASS — additive DDL; no API/type/route changes. Downstream (Better Auth insert path) documented as a v0 known-gap.
- Security surface: CONCERN (accepted) — touches two high-risk classes (auth/identity table + schema migration), but additive constraint only: no auth logic, trust-boundary, or secret change, no data deletion. Hybrid verification gates satisfy the minimum-tier requirement; full 5-artifact risk-evidence-pack not required for an additive constraint on an unwired v0 table.
- Section 1 feasibility (author migration files): CONCERN (fixed in plan) — edit targets all present and uniquely matchable (`baAccount` line 250; `_journal.json` entries array; `0002_snapshot.json` `public.account.uniqueConstraints` = `{}` ready to receive entry; columns `provider_id`/`account_id` confirmed). Snapshot key is `public.account` (schema-qualified), not `account` as originally written — corrected in step 3.
- Section 2 feasibility (apply + verify): CONCERN (fixed in plan) — highest-risk edit was the step-8 smoke test: `account.user_id` is a NOT NULL FK to `user.id`, so the original INSERT (`user_id='u-manager'`) would raise a FK violation BEFORE exercising the unique constraint. Fixed by seeding a throwaway `user` row first and ordering cleanup (accounts before user). Pre-flight dedup check wired into step 6 so `db:migrate` does not abort on pre-existing duplicates.

Open gaps:
- Better Auth adapter unique-violation handling: known-gap: documented — Better Auth not wired in v0; re-verify when auth is wired (TODO added to schema.ts comment).
- Hybrid gates (AC-migrate / AC-constraint / AC-reject) require live Postgres and cannot run in a DB-less CI step; they must be run at EXECUTE against compose + `docker-compose.local.yml`.

What this coverage does NOT prove:
- `bun run check` / `bun run test:unit`: prove no TS or unit regression from the schema.ts comment; do NOT prove the constraint exists or behaves (no DB touched by unit tests).
- `bun run db:migrate`: proves the migration chain applies; does NOT prove the constraint rejects duplicates (only that DDL ran) and does NOT prove behavior against pre-existing duplicate data (guarded separately by the step-6 dedup check).
- `\d account`: proves the constraint is present in catalog; does NOT prove it actually rejects an insert at runtime.
- step-8 dual-INSERT: proves runtime rejection for the `google/acct-x` pair; does NOT prove Better Auth's own insert path handles the rejection gracefully (known-gap), and does NOT cover NULL-column edge cases (`nullsNotDistinct: false` means NULL pairs are treated as distinct — untested).

Gate: CONDITIONAL (no FAILs; 5 CONCERNs — 4 fixed in plan, 1 v0 known-gap; live-DB hybrid gates run at EXECUTE)
Accepted by: session — concerns accepted with mitigations applied directly to the plan this session (test-command correction, snapshot-key correction, smoke-test FK precondition, dedup pre-flight, db:migrate tier correction). Residual known-gap (Better Auth adapter conflict handling) accepted as a v0 deferral.

---

## Autonomous Goal Block

```
SESSION GOAL: Add composite UNIQUE(provider_id, account_id) constraint to the Better Auth `account` table via a hand-authored SQL migration (no db:generate).
Charter + umbrella plan: N/A — single plan
Autonomy: standard RIPER-5 — explicit ENTER EXECUTE MODE required; live-DB steps (6–8) are manual-verify checkpoints.
Hard stop conditions / safety constraints:
- NEVER run `db:generate` — the `account` table is Better-Auth-owned (CLAUDE.md convention).
- Run the pre-flight dedup check BEFORE `db:migrate`; do not migrate if duplicate (provider_id, account_id) rows exist.
- Do not hard-delete or mutate real `account`/`user` data; smoke-test rows use throwaway ids and are cleaned up.
Next phase: EXECUTE: process/features/auth/active/ba-account-unique-constraint_29-06-26/ba-account-unique-constraint_PLAN_29-06-26.md
Validate contract: inline in plan (## Validate Contract — Gate CONDITIONAL)
Execute start: fully-auto: `bun run check` + `bun run test:unit` | hybrid (live Postgres): `bun run db:migrate`, `psql "\d account"`, step-8 dual-INSERT | high-risk pack: no (additive DDL on unwired v0 table)
```
