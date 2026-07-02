---
phase: lead-visibility-scoping
date: 2026-07-02
status: COMPLETE_WITH_GAPS
feature: leads
plan: process/features/leads/active/lead-visibility-scoping_01-07-26/lead-visibility-scoping_PLAN_01-07-26.md
---

# EXECUTE Report — Lead Visibility / Privacy Scoping (GitHub #87)

**TL;DR:** All 4 phases implemented per plan + E1–E6. `bun run check`, `bun run test:unit -- --run`
(252 pass / 82 Hybrid-DB skip), and migration-safety gate are GREEN. Hybrid DB gates and UI-render
halves are NOT RUN here (no DATABASE_URL/docker; e2e blocked on e2e-auth-bootstrap) — new DB test
cases are written and self-skip, ready for EVL/CI against a live DB. Plan should stay in `active/`
until EVL re-runs the DB gates. HIGH-risk evidence pack written + validator-green.

## What Was Done

- **Phase 1 (schema/migration):** `leadVisibility` pgEnum; `crm_leads.visibility NOT NULL DEFAULT
  'everyone'`; `crm_lead_visibility_grants` junction (mirror of attendees: uuid PK, leadId FK cascade,
  userId FK set-null, unique index, createdAt only). Migration `drizzle/0013_nasty_master_mold.sql`
  generated + inspected: additive backfill, **no Better Auth tables**. Types: `Visibility` type,
  `Lead.visibility` + `Lead.selectedUserIds?`, `CreateLeadInput` fields; `dbRowToLead` carries visibility.
- **Phase 2 (query):** one shared `visibilityCondition(userId, role)` (manager → `sql\`true\``; rep →
  OR of own / everyone / unowned / EXISTS-grant). Wired into all 7 read fns: `listLeads`,
  `listLeadsFiltered`, `listPipelineStage`, `getLead` (→ null/404), `getTodayQueue`, `getNavCounts`,
  `getRemindersQueue`. Signatures threaded from `locals.user` at every call site.
- **Phase 3 (writes):** `createLead` (now transactional) + `updateLead` persist visibility + grants;
  `updateLead` writes a `crm_lead_history` `visibility` row on change and replaces/clears grants;
  `claimLead`/`unclaimLead`/`reassignLead` reset `visibility='everyone'` + delete grants in-transaction.
  Zod `leadFormSchema`/`leadUpdateSchema` gain `visibility` (default everyone) + `selectedUserIds`
  (refine: non-empty when selected). API POST/PATCH pass both fields.
- **Phase 4 (UI):** visibility selector + conditional teammate multi-select on create (`leads/new`)
  and detail-edit (`leads/[id]/edit`, pre-filled from current visibility + loaded grants via new
  `getLeadVisibilityGrants`). e2e stub `e2e/lead-visibility.e2e.ts` written as `test.fixme`.
- Tests added: schemas.spec (6 visibility cases), leads.spec (visibilityCondition SQL-shape via
  PgDialect), leads-db.spec (9 visibility DB cases), leads-filters.spec (4 visibility DB cases).

## E1–E6 Resolution

- **E1:** All 6 getLead production callers updated to `getLead(id, userId, role)`. `CrmClient`
  interface (`crm-client.ts`) is a separate abstraction (routes import the DB fn directly) — NOT
  bridged, left unchanged. Non-permitted rep now gets 404 from action endpoints (intended).
- **E2:** `listPipelineLeads` left unwired with an explicit exemption comment (only caller `/team` is
  manager-gated). No rep-facing route calls it.
- **E3:** Enforcement flows through `getTodayQueue` (owner-scoped; wiring is defensive no-op). `role`
  threaded (optional default `'rep'` on the 3 owner-scoped fns). `getNavCounts` unassigned sub-count
  left EXEMPT (commented).
- **E4:** `listLeads` ripple updated at both unlisted callers — `leads/new/+page.server.ts` (create
  dedup) and `meetings/+page.server.ts`. Behavioral change documented in code + here: create-form
  dedup no longer surfaces duplicates of leads the rep cannot see (accepted under privacy).
- **E5:** grant `userId onDelete: 'set null'` implemented as locked. Alternative (`cascade`) noted:
  set-null can leave orphan null-userId rows (harmless — EXISTS won't match null; unique index permits
  multiple NULLs). Kept as specified.
- **E6:** `permissions.ts` header comment corrected ("Reps can SEE all leads" removed). All gate
  commands use `-- --run`. `db:push` documented as precondition in the DB spec files.

## What Was Skipped or Deferred

- Hybrid DB gates NOT executed (no DATABASE_URL/docker in this environment). New DB cases written and
  self-skip via `describe.skipIf(SKIP_DB)`.
- AC#12 (ingest defaults everyone), AC#14 (reports unfiltered), AC#6-pipeline/today, AC#7 nav-count
  DB assertions: not added as new cases — guaranteed by schema default (AC#12) / by not touching
  reports (AC#14) / by owner-scoping being unchanged (AC#6/#7). Recommend adding if EVL wants explicit
  regression rows. Deferred, low-risk.
- UI-render halves (AC#1/#3/#5/#8) — Known-Gap (e2e-auth-bootstrap), fixme'd stub written.

## Test Gate Outcomes

- `bun run check` → PASS (0 errors, 1 pre-existing unrelated warning).
- `bun run test:unit -- --run src/tests/schemas.spec.ts` → PASS.
- `bun run test:unit -- --run src/tests/leads.spec.ts` → PASS.
- `bun run test:unit -- --run` (full) → 252 pass, 82 skip (Hybrid DB).
- `bun run db:generate` diff → PASS (no Better Auth tables).
- Hybrid DB gates → SKIP (no DB). UI e2e → SKIP (Known-Gap).

## Plan Deviations

- Owner-scoped read fns (`getTodayQueue`/`getNavCounts`/`getRemindersQueue`) take `role` as OPTIONAL
  (default `'rep'`) rather than required, to avoid churn on existing green tests; safe because the
  condition is a provable no-op there (rows already filtered by `ownerId = userId`). Real callers pass
  the actual role. Within blast radius.
- Superforms decision 10: kept the existing client-fetch create flow (option a, as locked) — visibility
  fields ride the shared Zod `leadFormSchema`. No form action added. Documented deviation.
- `selectedUserIds` uses shape-only `LOOSE_UUID_RE` (not `z.string().uuid()`) so seeded non-RFC user
  ids from `listUsers()` are accepted — matches existing `ownerUpdateSchema` precedent.

## Test Infra Gaps Found

- No local DB harness in this environment (no DATABASE_URL, docker unavailable) → all Hybrid gates
  self-skip. EVL/CI must run with `docker compose up -d db` + `bun run db:push` (apply migration 0013).
- e2e-auth-bootstrap (pre-existing, repo-wide): no Playwright session-seed for Better Auth. Tracked at
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

## Closeout Packet

- **Selected plan:** `.../lead-visibility-scoping_01-07-26/lead-visibility-scoping_PLAN_01-07-26.md`
- **Finished:** all 4 phases + E1–E6; migration generated; Fully-Automated + type gates green; HIGH-risk
  evidence pack (`harness/`, validator-green).
- **Verified vs unverified:** verified = Zod, visibilityCondition shape, type-safety, migration safety,
  full non-DB suite. Unverified = row-level DB enforcement (written, unrun here) + UI render (Known-Gap).
- **Remaining:** EVL re-run of Hybrid DB gates against a live DB; manual UI spot-check; context/docs
  update at UPDATE PROCESS.
- **Best next state:** `Keep in active/testing` — code-complete but Hybrid DB verification pending.

## Forward Preview

- **Test Infra Found:** DB harness absent locally; Hybrid gates need live Postgres + migration 0013.
- **Blast Radius Changes:** `schema.ts`, `leads.ts`, `zod/schemas.ts`, `types/index.ts`, 12 route/API
  files, 2 UI pages, migration 0013, 4 test specs, e2e stub. No monorepo boundary crossed.
- **Commands to Stay Green:** `bun run check`; `bun run test:unit -- --run`; with DB: `docker compose
  up -d db && bun run db:push && bun run test:unit -- --run src/tests/leads-db.spec.ts
  src/tests/leads-filters.spec.ts src/tests/pipeline-db.spec.ts`.
- **Dependency Changes:** none (no new packages).
