---
name: plan:bundled-migration-188-191-194-199
description: Bundle GitHub #188/#191/#194/#199 into one PR — 4 sequenced DB migrations (organizers, notes table, live stage, template createdBy) + supporting API/UI
date: 06-07-26
feature: null
phase: null
metadata:
  node_type: plan
  type: plan
  complexity: COMPLEX
---

# Bundled Migration PR — #188 / #191 / #194 / #199

Date: 06-07-26
Status: DRAFT — awaiting VALIDATE
Complexity: COMPLEX

**TL;DR:** Land four linked schema changes as one PR with a clean `0020 → 0023` migration sequence. Schema is edited in `schema.ts` in **four discrete passes** (one `db:generate` per pass so each change gets its own numbered file), with a hand-appended raw-SQL data migration in `0022`. Supporting API/UI changes surface the new `live` stage and open template creation to all roles. All 17 acceptance criteria map to gates in the Verification Evidence table.

## Overview

Bundle 4 GitHub issues, all labelled `migration`, into a single PR on a fresh branch off `fix/neon-http-driver`:

- **#188 [ORG-1]** — new `crm_organizers` table + nullable `organizerId` FK on `crm_leads` (additive; flat fields stay).
- **#194 [PIPE-1]** — add `live` to `crm_lead_stage` enum + surface it in pipeline/lead-detail UI.
- **#191 [NOTE-1]** — new `crm_notes` table (author + lead/organizer polymorphic target + check constraint) + data-migrate existing `crm_leads.notes`. Depends on #188.
- **#199 [TPL-1]** — add `createdBy` FK to `crm_message_templates` + let reps create templates.

The ordering is deliberate so the migration sequence is dependency-clean in one PR: organizers (0020) before notes (0022, which FKs organizers).

## Goals

1. One PR, one clean migration chain `0020 → 0023` that applies via `bun run db:push`.
2. Additive-only schema (no drops, no visibility reductions); existing notes data preserved by migration, not loss.
3. Reps can create message templates; managers retain edit/delete.
4. `live` stage usable end-to-end in the pipeline board and lead detail.

## Scope

**In scope:** `src/lib/server/db/schema.ts`, generated `drizzle/0020–0023`, `src/lib/zod/schemas.ts`, stage constants/tokens, pipeline board, lead-detail onboarding gate, template API + DB fn + templates page, lead↔organizer tagging API.

**Out of scope (do NOT touch):**
- The pre-existing `drizzle/0014` journal drift (`0014_agreements_fields.sql` untracked vs `0014_nasty_master_mold.sql` at idx 14) — backlog item `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`. Recognise it during pre-flight, do not reconcile here.
- Dropping `crm_leads.notes` (deprecate only).
- Any Better Auth table (`user`/`account`/`session`/`verification`).
- A notes-reading UI (#191 AC is schema + migration + attach capability, not a notes viewer). Note render/CRUD UI is a follow-up.

## Key Decisions

1. **DECISION: four discrete `db:generate` passes, not one.** Editing all of `schema.ts` then generating once produces a SINGLE migration file, not four. To get `0020/0021/0022/0023` each scoped to one issue, edit `schema.ts` incrementally and run `bun run db:generate` after each edit. WHY: the issue-specified sequence is a hard requirement; per-issue files keep the PR reviewable and roll-back granular. REJECTED: one combined migration (loses per-issue traceability and the requested idx mapping).

2. **DECISION: `live` placed BEFORE `lost` in every enum/const array.** Placing `live` before `lost` in the `crm_lead_stage` pgEnum array makes drizzle-kit emit `ALTER TYPE ... ADD VALUE 'live' BEFORE 'lost'`, giving logical order `… won → live → lost`. WHY: matches issue #194 stage order and keeps `lost` terminal. REJECTED: append at end (physical order `… lost, live` reads wrong in enum introspection; UI order is controlled by arrays anyway, but keep DB order sane).

3. **DECISION: `crm_notes.authorId` is `notNull` with no `onDelete` clause (restrict).** WHY: a note must record its author (#191 AC7); `crm_users` are soft-deleted (`active=false`), never hard-deleted, so restrict never fires. The data migration is guarded by `WHERE EXISTS (SELECT 1 FROM crm_users)` so a userless DB migrates zero rows gracefully instead of failing the FK. REJECTED: `onDelete: set null` + nullable author (contradicts "records author").

4. **DECISION: template creation authorization split from edit/delete.** `createTemplate` gains a `createdBy` param sourced from `locals.user.id` (NOT the zod form — it is not user input). Remove `requireManager` from POST only; PATCH/DELETE stay manager-gated. On the templates page, introduce a separate `canCreate` (any authenticated user) while `canManage` (`isManager`) keeps gating edit/delete affordances. WHY: #199 scope. REJECTED: adding `createdBy` to `templateFormSchema` (would let a client spoof authorship).

5. **DECISION: templates remain globally visible (no per-creator query filter).** #199 says "templates created by reps are visible to creator and managers." Current `listTemplates` returns all non-deleted templates to everyone; keeping that satisfies "visible to creator and managers" as a superset. WHY: simplest, no read-path change, no regression risk. Recorded as an explicit product decision — if stricter visibility is later required it is a follow-up. AC15 is satisfied by global visibility.

6. **DECISION: lead-detail onboarding tab + `goLiveDate` editability gate extended to `stage === 'won' || stage === 'live'`.** WHY: #194 AC12 requires `goLiveDate` editable when stage is `live`; that field currently only surfaces on the `won` onboarding tab. Extend the two `=== 'won'` gates in `src/routes/leads/[id]/+page.svelte`.

## Touchpoints

Files changed or read, grouped by issue.

**Shared / schema:**
- `src/lib/server/db/schema.ts` — all 4 schema edits (source of truth; edit-then-generate 4×).
- `drizzle/0020_*.sql … 0023_*.sql` — generated; `0022` hand-edited to append data migration.
- `drizzle/meta/_journal.json` + `drizzle/meta/*_snapshot.json` — regenerated by drizzle-kit (do not hand-edit).

**#188 organizers:**
- `schema.ts` — new `crmOrganizers` table + `organizerId` FK column on `crmLeads` + type export.
- Lead↔organizer tagging API: `src/routes/api/leads/[id]/organizer/+server.ts` (NEW) OR extend existing lead-update endpoint — see checklist step 11 (execute-agent picks the minimal existing surface; verify whether `src/routes/api/leads/pipeline-stage/+server.ts` pattern or a lead PATCH endpoint already exists before adding a new route).
- `src/lib/zod/schemas.ts` — optional organizer-tag validator if a new endpoint is added.

**#194 live stage:**
- `src/lib/zod/schemas.ts:6` — `LEAD_STAGES` const (canonical Stage-type source): add `'live'` before `'lost'`.
- `src/lib/design/tokens.ts:13` — `STAGE_TOKENS`: add `{ key: 'live', label: 'Live', color: 'var(--color-stage-live)', hex: '<pick>' }` before the `lost` entry; add matching `--color-stage-live` CSS var wherever stage vars are declared.
- `src/lib/utils/stages.ts` — `STAGE_ORDER` and `BOARD_STAGES`: add `'live'` (STAGE_ORDER after `won` before `lost`; BOARD_STAGES after `won`). Confirm `isClosed` intent — keep `live` OPEN (not closed) so it stays actionable; document if changed.
- `src/routes/pipeline/+page.server.ts:7` — local `BOARD_STAGES`: add `'live'` after `'won'`.
- `src/routes/leads/[id]/+page.svelte` — extend onboarding-tab + `goLiveDate` gates to include `'live'`.
- Stage selector components (`src/lib/components/leads/StageControl.svelte`, `src/lib/components/pipeline/StageSelect.svelte`, `src/lib/components/shared/StageChip.svelte`) — verify `live` renders as a valid transition target and chip (they read from the shared arrays/tokens, so should pick it up; confirm no hardcoded stage list).

**#191 notes:**
- `schema.ts` — new `crmNotes` table + `.check()` constraint + type export.
- `drizzle/0022_*.sql` — append raw `INSERT INTO crm_notes ... SELECT ... FROM crm_leads WHERE notes IS NOT NULL` below generated DDL.

**#199 templates:**
- `schema.ts` — `crmMessageTemplates`: add `createdBy` nullable FK → `crmUsers` `onDelete: set null`.
- `src/lib/server/db/templates.ts:113` — `createTemplate(input, createdBy?)` persists `createdBy`.
- `src/routes/api/templates/+server.ts` — remove `requireManager` from POST only; pass `locals.user.id`.
- `src/routes/templates/+page.svelte` — add `canCreate` (authenticated) gate for the "New Template" button; keep `canManage` for edit/delete.

## Public Contracts

- **`crm_lead_stage` enum** gains `live` — visible to any consumer introspecting the DB/enum; additive, safe.
- **`crm_organizers` table** — new public table; `crm_leads.organizerId` nullable FK.
- **`crm_notes` table** — new; check constraint `(leadId IS NOT NULL) <> (organizerId IS NOT NULL)` (exactly one non-null).
- **`crm_message_templates.createdBy`** — new nullable FK column.
- **POST `/api/templates`** — authorization relaxed from manager-only to any authenticated user; response shape unchanged (now includes `createdBy`). PATCH/DELETE unchanged (manager-only).
- **Lead tagging API** — a lead can be assigned an `organizerId` (endpoint per step 11).
- `Stage` TS union (`src/lib/zod/schemas.ts`) gains `'live'` — compile-time contract for all stage consumers.

## Blast Radius

- **Files:** ~11 source files + 4 generated migrations. Risk class: **schema/data migration** (high-risk) + **public API contract change** (medium).
- **Packages:** single app (`veent-crm`), no workspace fan-out.
- **Highest-risk items:** (1) the `0022` raw-SQL data migration (data movement, must be idempotent-safe and userless-safe); (2) enum `ALTER TYPE ADD VALUE` (cannot run inside a transaction on some PG paths — drizzle-kit handles via statement-breakpoints; verify the generated `0021` has a breakpoint and no wrapping BEGIN); (3) auth relaxation on POST `/api/templates`.

## Migration Sequence (execution-critical)

Pre-flight (step 1) MUST pass before any generate. Then four passes:

| idx | Issue | schema.ts edit | Generate | Post-generate hand-edit |
|---|---|---|---|---|
| 0020 | #188 | add `crmOrganizers` + `crmLeads.organizerId` | `bun run db:generate` | none |
| 0021 | #194 | add `'live'` before `'lost'` in `leadStage` pgEnum | `bun run db:generate` | verify `ADD VALUE ... BEFORE 'lost'` + statement-breakpoint present |
| 0022 | #191 | add `crmNotes` + `.check()` | `bun run db:generate` | append data-migration `INSERT … SELECT` block |
| 0023 | #199 | add `crmMessageTemplates.createdBy` | `bun run db:generate` | none |

Data migration SQL to append to `0022` (below the generated DDL):

```sql
--> statement-breakpoint
INSERT INTO crm_notes (content, author_id, lead_id, created_at, updated_at)
SELECT l.notes,
       (SELECT id FROM crm_users ORDER BY created_at ASC LIMIT 1),
       l.id,
       now(), now()
FROM crm_leads l
WHERE l.notes IS NOT NULL
  AND l.notes <> ''
  AND EXISTS (SELECT 1 FROM crm_users);
```

(`author_id`/`lead_id` are the snake_case column names drizzle generates; confirm against the generated DDL before appending.)

## Implementation Checklist

1. **Pre-flight journal check.** Confirm `drizzle/meta/_journal.json` last `idx` = 19 (`0019_amusing_eternity`). Scan `drizzle/*.sql`: expect the known duplicate `0014_agreements_fields.sql` + `0014_nasty_master_mold.sql` pair — recognise as pre-existing backlog drift, do NOT touch, do NOT block. Confirm no OTHER duplicate-prefix or journal-unregistered `.sql` files beyond that pair. If new drift found → STOP and surface.
2. **Branch.** Create the working branch off `fix/neon-http-driver` (user creates; confirm current branch before edits).
3. **#188 schema.** Add `crmOrganizers` pgTable (`id` uuid PK defaultRandom; `name` text notNull; `normalizedHandle`, `socialFacebook`, `socialInstagram`, `website`, `email`, `phone`, `location` text; `createdAt`/`updatedAt` tz notNull defaultNow). Add `organizerId: uuid('organizer_id').references(() => crmOrganizers.id, { onDelete: 'set null' })` to `crmLeads`. Add `CrmOrganizer` type export. Consider an index on `crmLeads.organizerId`.
4. **Generate 0020.** `bun run db:generate`; confirm exactly one new file `0020_*.sql`, journal idx 20.
5. **#194 schema.** In `leadStage` pgEnum, insert `'live'` between `'won'` and `'lost'`. Add `'live'` to `LEAD_STAGES` in `src/lib/zod/schemas.ts:6` (before `'lost'`).
6. **Generate 0021.** `bun run db:generate`; confirm `0021_*.sql` contains `ALTER TYPE "crm_lead_stage" ADD VALUE 'live' BEFORE 'lost'` with a statement-breakpoint and no wrapping transaction. Journal idx 21.
7. **#191 schema.** Add `crmNotes` pgTable (`id` uuid PK; `content` text notNull; `authorId` uuid notNull references `crmUsers.id` [no onDelete]; `leadId` uuid references `crmLeads.id` onDelete cascade, nullable; `organizerId` uuid references `crmOrganizers.id` onDelete cascade, nullable; `createdAt`/`updatedAt`). Add `.check('crm_notes_target_ck', sql\`("lead_id" IS NOT NULL) <> ("organizer_id" IS NOT NULL)\`)` in the table config array. Add `CrmNote` type export. No `deletedAt` (per issue scope).
8. **Generate 0022 + append data migration.** `bun run db:generate` → `0022_*.sql`. Confirm the generated DDL column names, then append the guarded `INSERT INTO crm_notes … SELECT … WHERE notes IS NOT NULL AND EXISTS(SELECT 1 FROM crm_users)` block (see Migration Sequence). Journal idx 22.
9. **#199 schema.** Add `createdBy: uuid('created_by').references(() => crmUsers.id, { onDelete: 'set null' })` (nullable) to `crmMessageTemplates`.
10. **Generate 0023.** `bun run db:generate` → `0023_*.sql`, journal idx 23.
11. **#188 tagging API.** Verify whether an existing lead-update endpoint can carry `organizerId` (inspect `src/routes/api/leads/pipeline-stage/+server.ts` and any lead PATCH route). If yes, extend it (+ zod field). If no minimal surface exists, add `src/routes/api/leads/[id]/organizer/+server.ts` (POST/PATCH: set `organizerId`, auth-gated like sibling lead endpoints, writes `crm_lead_history` row per audit convention). Keep it minimal.
12. **#194 stage constants/tokens.** Add `'live'` to `STAGE_ORDER` (after `won`) and `BOARD_STAGES` in `src/lib/utils/stages.ts`; add `'live'` to `BOARD_STAGES` in `src/routes/pipeline/+page.server.ts:7`; add a `live` entry to `STAGE_TOKENS` in `src/lib/design/tokens.ts` (before `lost`) + a `--color-stage-live` CSS var. Keep `isClosed` returning false for `live` unless a reason to close it emerges (document).
13. **#194 lead-detail.** In `src/routes/leads/[id]/+page.svelte`, extend the onboarding-tab visibility and `goLiveDate` editable gates from `stage === 'won'` to `stage === 'won' || stage === 'live'`. Confirm `won → live` transition is offered by the stage selector (StageControl/StageSelect read shared arrays — verify no hardcoded allow-list blocks it).
13b. **#194 stage-move validator (VALIDATE supplement — GAP-1).** Add a `z.object({ stage: z.literal('live') })` variant to `moveStageSchema` in `src/lib/zod/schemas.ts`. The discriminated union currently accepts only the four `PIPELINE_STAGES` + `'won'` + `'lost'`, so PATCH `/api/leads/[id]/stage` (which validates the body against `moveStageSchema`) returns 400 for `stage: 'live'` — making AC11 (won→live) and AC12 (goLiveDate editable when live) UNREACHABLE even though the StageControl selector (reads `STAGE_ORDER`) offers `live`. `moveLeadStage` in `src/lib/server/db/leads.ts` needs NO change (it treats any non-won/non-lost stage as a plain column set). Add a `pipeline.spec.ts` case asserting `moveStageSchema.safeParse({ stage: 'live' }).success === true`.
14. **#199 DB fn.** Update `createTemplate` in `src/lib/server/db/templates.ts:113` to accept `createdBy?: string` and include it in `.values({ …, createdBy })`.
15. **#199 API.** In `src/routes/api/templates/+server.ts`: remove `requireManager(locals)` from the POST handler (keep the authenticated-user check — reject if `!locals.user`); pass `locals.user.id` as `createdBy` to `createTemplate`. Leave PATCH/DELETE `requireManager` intact.
16. **#199 UI.** In `src/routes/templates/+page.svelte`: add `const canCreate = $derived(!!data.currentUser)` (or equivalent authenticated check); gate the "New Template" button on `canCreate` instead of `canManage`; keep edit/delete affordances on `canManage`.
17. **Typecheck + unit.** Run `bun run check` then `bun run test:unit:ci` (NOT `bun run test:unit` — that is watch mode; `:ci` runs `vitest --run`). Fix stage-enumerating tests: `src/tests/pipeline.spec.ts` (~line 108 hard-asserts `BOARD_STAGES` equals the exact array — add `'live'` after `'won'`; also add the `moveStageSchema` accepts-`live` case from step 13b) and `src/tests/labels.spec.ts` (iterates `LEAD_STAGES` — picks up `live` automatically; confirm `stageLabel('live')` returns a label). **VALIDATE supplement — GAP-2:** `src/tests/templates-guard.spec.ts` currently asserts `POST → 403` for a rep (the manager guard); after removing `requireManager` from POST this assertion is wrong — invert it so a rep POST no longer 403s (it should reach validation/DB), while keeping the `PATCH → 403` and `DELETE → 403` rep assertions intact.
18. **Apply migrations.** Run `bun run db:push` against a dev DB; confirm all 4 apply cleanly in order and the data migration moved existing `notes` rows. (Hybrid gate — needs live DB.)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` compiles with `crm_organizers` in schema + `CrmOrganizer` type | Fully-Automated | AC1 (table exists), AC2 (organizerId FK) |
| Migration `0020` present, journal idx 20, `bun run db:push` creates `crm_organizers` + `organizer_id` col | Hybrid (live DB) | AC1, AC2, AC17 |
| Tag a lead via API, re-fetch, `organizerId` set; tag two leads to same organizer | Hybrid (live DB) | AC3 (tag via API), AC4 (multiple leads → one organizer) |
| `bun run check` compiles with `crm_notes` + `.check()` + `CrmNote` type | Fully-Automated | AC5 (table exists) |
| Migration `0022` DDL + check constraint applies; insert note with only leadId, only organizerId, and reject both/neither | Hybrid (live DB) | AC5, AC6 (attach lead or organizer), AC7 (author+timestamp via notNull authorId + createdAt) |
| Seed `crm_leads.notes`, run `0022` data migration, assert matching `crm_notes` rows created + attributed to first user | Hybrid (live DB) | AC8 (existing notes migrated) |
| `bun run test:unit` stage tests pass with `live` in `LEAD_STAGES` | Fully-Automated | AC9 (enum has live) |
| Migration `0021` emits `ADD VALUE 'live' BEFORE 'lost'`; `db:push` applies | Hybrid (live DB) | AC9, AC17 |
| Load `/pipeline`; a `Live` board column renders after `Won` | Agent-Probe (e2e blocked by shared auth fixture — known-gap) | AC10 (live column visible) |
| From a `won` lead, change stage to `live` succeeds; `goLiveDate` input editable on lead detail when stage=live | Agent-Probe (e2e blocked — known-gap) | AC11 (won→live allowed), AC12 (goLiveDate editable) |
| Unit test: `createTemplate` persists `createdBy`; POST `/api/templates` succeeds for a rep-role user; PATCH/DELETE still 403 for rep | Fully-Automated (vitest) | AC13 (reps create), AC16 (createdBy FK) |
| `bun run check` compiles with `createdBy` on `crmMessageTemplates`; migration `0023` applies | Fully-Automated + Hybrid | AC16, AC17 |
| Load `/templates` as a rep; "New Template" button visible and functional | Agent-Probe (e2e blocked — known-gap) | AC14 (creation UI for all roles) |
| `listTemplates` returns rep-created template to creator and to managers (global visibility) | Fully-Automated (unit) | AC15 (visible to creator + managers) |
| Full sequence `bun run db:push` on clean dev DB applies 0020→0023 with no error | Hybrid (live DB) | AC17 (all migrations apply cleanly) |

**Known-gap note:** e2e-tier gates (AC10, AC11, AC12, AC14) are blocked by the missing shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — a repo-wide pre-existing gap. These remain CONDITIONAL: proven by agent-probe + manual verification, with e2e backlog stubs registered. They are NOT declared PASS on known-gap alone.

## Test Infra Improvement Notes

- e2e auth fixture gap blocks automated proof of all four UI-facing ACs (AC10/11/12/14) — same blocker tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Register e2e stubs for: pipeline `live` column, won→live transition, goLiveDate-editable-when-live, rep template creation.
- No live-DB CI harness — all Hybrid migration/data gates run locally against a dev DB and are recorded as manual evidence. (Pre-accepted repo pattern.)

## Failure Modes & Rollback

- **`db:generate` produces a combined file (multiple changes in one migration):** means `schema.ts` was over-edited before a generate. Revert the generated file + snapshot, re-run one pass at a time.
- **`0021` wrapped in a transaction:** `ALTER TYPE ADD VALUE` can fail mid-transaction on some PG versions. Confirm drizzle emitted a statement-breakpoint; if not, split manually.
- **Data migration on userless DB:** guarded by `EXISTS (SELECT 1 FROM crm_users)` → migrates zero rows, no FK failure. Acceptable (no users = no authored notes).
- **Rollback:** PR-level revert. Enum `ADD VALUE` is not reversible via down-migration in PG, but the value is inert if unused; document that `live` cannot be dropped once added. Tables/columns are droppable if the PR is reverted before merge.
- **Auth relaxation regression:** verify PATCH/DELETE still 403 for rep in the unit gate before merge.

## Dependencies

- **#191 depends on #188** — `crm_notes.organizerId` FKs `crm_organizers`; 0020 must precede 0022. Enforced by pass order.
- #194 and #199 are independent of the others and of each other.
- A dev PostgreSQL DB (`DATABASE_URL`) for Hybrid gates.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/bundled-migration-188-191-194-199_06-07-26/bundled-migration-188-191-194-199_PLAN_06-07-26.md`
2. **Last completed step:** steps 1–17 DONE (code-complete; `bun run check` + `bun run test:unit:ci` both green as of 06-07-26). Step 18 (`db:push` Hybrid gate) DEFERRED — no `DATABASE_URL` in env, `.env` privacy-blocked; run manually against a dev DB.
3. **Validate-contract status:** written (06-07-26, Gate CONDITIONAL, inline in plan).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `src/lib/server/db/schema.ts`, `drizzle/meta/_journal.json`.
5. **Next step for a fresh agent:** run pre-flight (checklist step 1); then execute the 4-pass generate sequence in strict order (do NOT batch schema edits); hand-append the `0022` data migration; then API/UI steps 11–16; verify with step 17–18. Migration sequencing in `schema.ts` edit order is the load-bearing detail — one `db:generate` per issue.

## Phase Completion Rules

This is a single-session COMPLEX plan (one PR), not a phase program. Completion rules:

- **CODE DONE** when checklist steps 1–16 are applied and `bun run check` + `bun run test:unit:ci` pass (Fully-Automated tier green).
- **VERIFIED** requires the Hybrid live-DB gates (step 18 `db:push`, data-migration assertion, tagging/notes insert checks) to pass against a dev DB AND user confirmation of the e2e-blocked UI ACs (AC10/11/12/14) via agent-probe/manual check. Do not mark VERIFIED on code-compile alone.
- e2e-tier ACs stay CONDITIONAL with registered backlog stubs until the shared Playwright auth fixture lands — they are never declared PASS on known-gap alone.

## Next Step

Plan complete. Say **ENTER VALIDATE MODE** to convert this into an executable validate-contract (required before EXECUTE). Do not route to EXECUTE until VALIDATE writes the contract.

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: inner-pvl: phase-1
Parallel strategy: sequential
Rationale: Signal score 2/7 (S2 schema/API/auth surface, S6 high-risk class: schema/data migration + auth relaxation). Single app, one PR, dependency-ordered migration chain — inherently sequential; no multi-package fan-out.

### Test gates (C3 5-column table — ADDITIVE; legacy line form below remains parseable)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC2 | `crm_organizers` table + `crm_leads.organizerId` FK compile into schema | Fully-Automated | `bun run check` exits 0 with `crmOrganizers` + `CrmOrganizer` type + `organizerId` column | A |
| AC1/AC2/AC17 | `0020` creates `crm_organizers` + `organizer_id` on live DB | Hybrid | `bun run db:push` applies `0020`; `\d crm_organizers` shows table + FK — precondition: dev Postgres | D |
| AC3/AC4 | tag a lead's `organizerId` via API; two leads → one organizer | Hybrid | tagging endpoint (step 11) PATCH sets `organizerId`; re-fetch confirms — precondition: dev Postgres | D |
| AC5 | `crm_notes` table + `.check()` + `CrmNote` type compile | Fully-Automated | `bun run check` exits 0 with `crmNotes` + check constraint config + `CrmNote` type | A |
| AC5/AC6/AC7 | `0022` DDL + check constraint applies; insert with only leadId / only organizerId passes, both / neither rejected | Hybrid | `bun run db:push` applies `0022`; manual inserts exercise the XOR constraint — precondition: dev Postgres | D |
| AC8 | existing `crm_leads.notes` rows migrate into `crm_notes` attributed to first user | Hybrid | seed `crm_leads.notes`, run `0022` data-migration block, assert matching `crm_notes` rows — precondition: dev Postgres | D |
| AC9 | `crm_lead_stage` enum + `LEAD_STAGES` gain `live`; labels/board pick it up | Fully-Automated | `bun run test:unit:ci` — `labels.spec.ts` humanizes `live`; `pipeline.spec.ts` BOARD_STAGES includes `live` | B |
| AC9/AC17 | `0021` emits `ADD VALUE 'live' BEFORE 'lost'` with statement-breakpoint, no wrapping txn; applies | Hybrid | inspect generated `0021_*.sql`; `bun run db:push` applies — precondition: dev Postgres | D |
| AC10 | `Live` board column renders after `Won` on `/pipeline` | Agent-Probe | manual/agent load of `/pipeline` (e2e blocked by shared auth fixture) | D |
| AC11 | `won → live` stage transition accepted end-to-end | Fully-Automated | `bun run test:unit:ci` — `pipeline.spec.ts` asserts `moveStageSchema.safeParse({ stage: 'live' }).success === true` (requires GAP-1 supplement step 13b) | B |
| AC12 | `goLiveDate` input editable on lead detail when `stage === 'live'` | Agent-Probe | manual/agent verification after moving a lead to `live` (e2e blocked) | D |
| AC13/AC16 | `createTemplate` persists `createdBy`; rep POST `/api/templates` succeeds; rep PATCH/DELETE still 403 | Fully-Automated | `bun run test:unit:ci` — `templates-db.spec.ts` createdBy roundtrip + `templates-guard.spec.ts` inverted POST assertion (GAP-2 supplement step 17) | B |
| AC14 | "New Template" button visible + functional for a rep on `/templates` | Agent-Probe | manual/agent load as rep (e2e blocked) | D |
| AC15 | `listTemplates` returns rep-created template to creator and managers (global visibility) | Fully-Automated | `bun run test:unit:ci` — `templates-db.spec.ts` list roundtrip | A |
| AC17 | full `0020 → 0023` chain applies cleanly in order | Hybrid | `bun run db:push` on clean dev DB, no error — precondition: dev Postgres | D |

gap-resolution legend: A — proven now · B — fixed in this plan (checklist/supplement adds the gate) · C — deferred to named later phase · D — backlog test-building stub (named residual; keep-active).

C-4 reconciliation: `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — it is carried as gap-resolution D (named residual).

Legacy line form (retained for existing consumers):
- schema/type compile (AC1/2/5/16, `live` union): Fully-automated: `bun run check`
- unit behaviors (AC9/11/13/15/16 + guard): Fully-automated: `bun run test:unit:ci`
- migrations 0020-0023 + data migration + XOR constraint + enum ADD VALUE (AC1-8/17): hybrid: `bun run db:push` + precondition: dev Postgres (`DATABASE_URL`)
- pipeline live column / won→live UI / goLiveDate-when-live / rep template-create UI (AC10/11/12/14): agent-probe: manual verification | known-gap: e2e blocked by missing shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

Failing stub (AC11 — moveStageSchema accepts live):
test("moveStageSchema accepts the live stage", () => { throw new Error("NOT IMPLEMENTED — TDD stub: moveStageSchema.safeParse({ stage: 'live' }).success === true") })

Failing stub (AC13 — rep can POST a template):
test("POST /api/templates no longer 403s for a rep", () => { throw new Error("NOT IMPLEMENTED — TDD stub: rep POST reaches validation/DB, not the manager guard") })

Failing stub (AC16 — createTemplate persists createdBy):
test("createTemplate persists createdBy", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createTemplate(input, userId) writes created_by") })

Failing stub (AC9 — board includes live):
test("BOARD_STAGES includes live after won", () => { throw new Error("NOT IMPLEMENTED — TDD stub: BOARD_STAGES === [...,'won','live']") })

### Dimension findings

- Infra fit: PASS — single SvelteKit/Bun app, no container/port/worker surfaces; drizzle 4-pass generate flow is well-understood; migration runners (`db:generate`/`db:push`) confirmed in package.json.
- Test coverage: CONCERN — automated gate command must be `bun run test:unit:ci` (`vitest --run`), NOT `bun run test:unit` (watch mode); two existing tests need updating (`templates-guard.spec.ts` POST assertion, `pipeline.spec.ts` BOARD_STAGES exact-equality); 4 UI ACs (AC10/11/12/14) blocked from automated proof by the missing shared Playwright auth fixture (pre-accepted repo-wide gap).
- Breaking changes: CONCERN — schema is additive/safe, BUT the `Stage` union gains `live` and downstream consumer `moveStageSchema` was NOT updated in the original checklist; without the supplement the `won → live` PATCH returns 400 (AC11/AC12 unreachable). Resolved by supplement step 13b. `Stage` type itself derives from `LEAD_STAGES` (`src/lib/types/index.ts:21`) so it propagates automatically.
- Security surface: PASS (with advisory) — POST `/api/templates` auth relaxation is correctly scoped: manager gate removed from POST only, authenticated-user check retained, `createdBy` sourced server-side from `locals.user.id` (no authorship spoofing), PATCH/DELETE stay manager-gated. `0022` data migration is userless-guarded (`EXISTS (SELECT 1 FROM crm_users)`). Advisory: this touches two high-risk classes (schema/data migration + trust-boundary) — a `vc-risk-evidence-pack` (risk-gate + verification + review-decision) is recommended before merge, manual-first.
- Section #188 organizers: PASS — additive table + nullable FK, mechanically clean; tagging API (step 11) is an explore-existing-surface step, acceptable.
- Section #194 live stage: CONCERN — highest-risk edit is the missed `moveStageSchema` variant (GAP-1, now supplemented); also `--color-stage-live` CSS var location pinned to `src/lib/styles/tokens.css` (~line 103), STAGE_TOKENS `hex` placeholder must be filled; `isClosed` correctly left returning false for `live`.
- Section #191 notes: PASS (with note) — table + XOR check constraint feasible; execute-agent must confirm generated snake_case column names before appending the `0022` data-migration block (plan flags this); the INSERT is not idempotent but migrations run once via journal — acceptable.
- Section #199 templates: CONCERN — `createTemplate` signature change and POST handler relaxation are mechanically clean, but the existing regression test `templates-guard.spec.ts` asserts `POST → 403` for a rep and WILL break after relaxation (GAP-2, now supplemented in step 17).

### Net gate derivation

Totals: 0 FAILs / 4 CONCERNs / balance PASS. Two fixable CONCERNs (GAP-1, GAP-2) applied as plan supplements in this pass (checklist steps 13b + 17). Remaining CONCERN basis is the pre-accepted, repo-wide known-gaps (e2e auth fixture; no live-DB CI harness). → Net Gate: CONDITIONAL.

### Open gaps

- AC10/AC11-UI/AC12/AC14 automated e2e proof: known-gap: documented — blocked by missing shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Proven by agent-probe + manual verification; register e2e backlog stubs (pipeline live column, won→live transition, goLiveDate-editable-when-live, rep template creation).
- Hybrid live-DB migration/data gates (AC1-8/17 `db:push` + data-migration assertion + XOR constraint + enum ADD VALUE): known-gap: documented — no live-DB CI harness; run locally against dev Postgres and record as manual evidence (pre-accepted repo pattern).
- Risk evidence pack for the auth-relaxation + data-migration surfaces: recommended (manual-first), not blocking.

### What this coverage does NOT prove

- `bun run check` proves types compile — does NOT prove any migration applies, any row moves, or any constraint enforces at runtime.
- `bun run test:unit:ci` proves `moveStageSchema` accepts `live`, `createTemplate` persists `createdBy`, POST auth is relaxed, board/label constants include `live`, and global template visibility — does NOT prove the enum value exists in the live DB, the pipeline renders the `Live` column, the won→live UI flow works, `goLiveDate` is editable in the browser, or the rep-create button renders.
- `bun run db:push` (Hybrid, manual) proves the 0020→0023 chain applies and the data migration moves notes on a dev DB — does NOT prove behavior on a production-shaped DB, does NOT prove idempotency on re-run, and is NOT run in CI.
- Agent-probe/manual checks prove UI plausibility — do NOT provide regression-safe automated coverage for AC10/11/12/14 until the shared auth fixture lands.

Gate: CONDITIONAL (0 FAILs; GAP-1 and GAP-2 resolved via plan supplement in this pass; remaining gaps are pre-accepted repo-wide known-gaps on record)
Accepted by: session (autonomous, inner-PVL execution) — accepted concerns: (1) e2e auth-fixture known-gap for AC10/AC11-UI/AC12/AC14; (2) no live-DB CI harness → Hybrid migration/data gates are manual/local; (3) test:unit:ci command correction and two test-file updates folded into checklist steps 13b/17; (4) risk-evidence-pack recommended-not-required for the high-risk surfaces.

## Autonomous Goal Block

```
SESSION GOAL: Land GitHub #188/#191/#194/#199 as one PR — 4 sequenced DB migrations (0020 organizers → 0021 live stage → 0022 notes+data-migration → 0023 template createdBy) plus supporting API/UI.
Charter + umbrella plan: N/A — single COMPLEX plan (one PR), not a phase program.
Autonomy: reversible edits auto-proceed; migration sequence is edit-then-generate ONE issue per db:generate pass (never batch schema edits into one migration).
Hard stop conditions / safety constraints:
- New/unexpected drizzle journal drift beyond the known 0014_agreements_fields.sql + 0014_nasty_master_mold.sql pair → STOP and surface; do NOT reconcile the 0014 drift here.
- 0021 must emit ALTER TYPE ... ADD VALUE 'live' BEFORE 'lost' with a statement-breakpoint and NO wrapping transaction — if not, split manually before applying.
- Auth relaxation is POST /api/templates ONLY; PATCH/DELETE stay manager-gated; createdBy is sourced from locals.user.id, never from the request body.
- 0022 data migration must keep the WHERE EXISTS (SELECT 1 FROM crm_users) guard (userless-safe) and confirm generated snake_case column names before appending.
Next phase: EXECUTE — process/general-plans/active/bundled-migration-188-191-194-199_06-07-26/bundled-migration-188-191-194-199_PLAN_06-07-26.md
Validate contract: inline in plan (## Validate Contract) — Gate CONDITIONAL
Execute start: bun run check | bun run test:unit:ci | bun run db:push (Hybrid, dev DB) | agent-probe/manual for AC10/11/12/14 | high-risk pack: recommended (schema-migration + auth-relaxation)
```
