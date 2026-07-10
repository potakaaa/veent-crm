---
phase: name-split-first-last-execute
date: 2026-07-08
status: COMPLETE_WITH_GAPS
feature: team
plan: process/features/team/active/name-split-first-last_08-07-26/name-split-first-last_PLAN_08-07-26.md
---

# Name Split (First/Last) — EXECUTE Report

GitHub #277. Implemented the full 27-item checklist (G1-G8) from the CONDITIONAL validate-contract in dependency order.

## What Was Done

**G1 — Schema + migration**
- `src/lib/server/db/schema.ts`: `crm_users.name` replaced with `firstName: text('first_name').notNull()` + `lastName: text('last_name')` (nullable).
- `bun run db:generate` could not run — blocked repo-wide by the pre-existing drizzle snapshot-chain drift (duplicate parent-snapshot collision; see `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`). This is the same blocker that forced CAT-1 (migrations 0026-0028) to be hand-written and snapshot-less. Followed the identical precedent: hand-wrote `drizzle/0033_name_split_first_last.sql` (add first_name -> backfill -> set-not-null -> add last_name -> drop name, with `--> statement-breakpoint` markers between every statement) and registered it in `drizzle/meta/_journal.json` at `idx: 33`, snapshot-less by intent.
- Confirmed journal `idx=32` before this session (matches plan's stated preflight) and no stray `0033` file existed.
- Confirmed the migration touches ONLY `crm_users` — no Better Auth (`user`/`account`/`session`/`verification`) statements (AC10).
- Did NOT run `bun run db:migrate` — no live Postgres in this dev env; deploy-time step, per hard safety constraint.

**G2 — Shared helper**
- `src/lib/utils/format-name.ts`: `formatFullName(firstName, lastName)` — pure, total, single-space join.
- `src/tests/format-name.spec.ts`: 6 cases incl. the AC8 verbatim-backfill equivalence assertion.

**G3 — Types + mapper/hydration sites**
- `src/lib/types/index.ts` `User`: added `firstName`/`lastName`, kept `name`.
- `src/lib/server/auth.ts` `SessionUser`: same additions.
- `src/lib/server/db/leads.ts` `dbUserToUser`: composes `name` via `formatFullName`.
- `src/lib/server/db/users.ts` `sessionToUser`: same, plus `createUser` signature updated to `{firstName, lastName?, email, role}`.
- `src/hooks.server.ts`: session hydration composes `name` via `formatFullName`.
- `bun run check` run after G3 (and again after G8) — 0 errors, confirming every `.name`/`crmUsers.name` migration site was found and fixed.

**G4 — Zod schemas**
- `userFormSchema`: `name` -> `firstName` (required) + `lastName` (optional).
- `userNameEditSchema = userFormSchema.pick({ firstName: true, lastName: true })`.

**G5 — API endpoints**
- `PATCH /api/users/[id]`: `patchSchema` + `.set()` + self/other-edit permission gating all updated to `firstName`/`lastName`.
- `POST /api/users`: destructures and passes `firstName`/`lastName` to `createUser`.

**G6 — UI edit surfaces (3)**
- `/team` add-member form: two inputs (First Name required, Last Name optional), `FieldError` wired to both.
- `/team` edit-name modal: same two-field pattern, seeded from `u.firstName`/`u.lastName`.
- `/profile`: same two-field pattern; confirmed `/profile/+page.server.ts` exposes both via `sessionToUser`.

**G7 — Template system**
- `TemplateVars` gained `repFirstName`/`repLastName`; `fillTemplate` adds 2 `replaceAll` calls; existing 3 unchanged.
- `leads/[id]/+page.svelte` + `LogTouchForm.svelte`: threaded `repFirstName`/`repLastName` props through (required updating `leads/[id]/+page.server.ts`'s `me: User` construction to include the two new required fields).
- `templates/+page.svelte:538` help text updated to list both new tokens.
- `src/tests/templates.spec.ts`: rewritten to the 5-key `TemplateVars` shape; added AC6 (new-token substitution + blank-last degrade) and AC7 (repName regression) assertions. `templates-db.spec.ts` needed no change — it never calls `fillTemplate` directly, only stores a literal `{{repName}}` token string in a DB fixture.

**G8 — SQL-layer read-sites (all 8 files, 21 refs)**
- `auth.ts` (welcome-email lookup), `team/+page.server.ts` (orderBy), `notes.ts` (SQL-concat compose, preserves `authorName` shape), `reports/+page.server.ts` (2 selects + 2 orderBys), `api/reports/export/+server.ts` (2 selects + 1 orderBy), `meetings.ts` (5 join sites — attendee + organizer names across 4 query functions), `leads.ts` (`listUsers` orderBy, `listActiveReps`, `enrichWithOwnerNames` owner-map), `dashboard.ts` (`getActiveAeList` search/select/orderBy).
- All `orderBy`/`ilike` switched to `firstName` (byte-identical ordering/search behavior for verbatim-backfilled rows, per plan's explicit instruction — no deviation).

**Final gates**
- `bun run check`: PASS, 0 errors (6 pre-existing unrelated warnings).
- `bun run test:unit:ci`: PASS, 541 passed / 165 skipped (pre-existing DB/fixture self-skips) / 0 failed.
- `bun run lint`: PASS on all 34 files touched by this plan (0 eslint problems; ran eslint directly against the touched-file list). Repo-wide `prettier --check .` reports pre-existing drift in 11 files, NONE touched by this plan — matches `process/general-plans/backlog/lint-drift-pre-existing-files_07-07-26_NOTE.md`.

**High-risk evidence pack** — written to `harness/`: `risk-gate.json`, `context-snippets.json`, `verification.json`, `review-decision.json` (APPROVE). `adversarial-validation.json` NOT produced — plan explicitly marks it not required (display-name-only change, no auth-bypass/secret-exfiltration path).

## What Was Skipped or Deferred

- `bun run db:migrate` — no live Postgres in this dev env (hard safety constraint, deploy-time step).
- AC1-AC4, AC8-hybrid, AC9 — CONDITIONAL, harness-blocked known-gaps (live-DB CI harness, shared Playwright auth fixture), accepted on record in the plan's validate-contract before EXECUTE began. Unchanged by this session.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `bun run check` | PASS — 0 errors |
| `bun run test:unit:ci` | PASS — 541/541 non-skipped tests green |
| `bun run lint` (touched files) | PASS — 0 eslint problems |
| Migration diff review | PASS — only `crm_users`, correct ordering, breakpoints present |

## Plan Deviations

None against the approved checklist. One incidental fix required by G7 that wasn't spelled out at the line-item level: `src/routes/leads/[id]/+page.server.ts`'s `me: User` object construction needed `firstName`/`lastName` added (it builds a `User` literal from `locals.user`) — this is a direct, mechanical consequence of the G3 type change and was required for `bun run check` to pass; not a scope expansion.

## Test Infra Gaps Found

None new. Inherits the two standing repo gaps already tracked (live-DB CI harness; shared Playwright auth fixture) plus the pre-existing drizzle snapshot-chain drift (already documented, not newly discovered — worked around per established CAT-1 precedent of hand-writing + snapshot-less journal registration).

## Closeout Packet

- **Selected plan:** `process/features/team/active/name-split-first-last_08-07-26/name-split-first-last_PLAN_08-07-26.md`
- **Finished:** All 27 checklist items (G1-G8); all 3 final gates green; high-risk evidence pack (4 of 5 artifacts, 5th correctly omitted per plan).
- **Verified vs unverified:** Fully-Automated gates (AC5, AC6, AC7, AC8-auto, AC8-SQL, AC10) are genuinely proven. Hybrid/Manual gates (AC1-4, AC8-hybrid, AC9) remain unverified — harness-blocked, matching the CONDITIONAL gate accepted before EXECUTE.
- **Remaining:** EVL confirmation run (independent re-run of the gate commands, per orchestration.md — execute-agent's internal green claims are not a substitute); eventual live-DB migration apply + Playwright verification once those harnesses exist.
- **Best next valid state:** Plan stays in `active/` (code-complete, verification harness-blocked) — mirrors the `team-member-profile-edit_07-07-26` precedent. Recommend orchestrator spawn `vc-tester` for the EVL confirmation run next.

## Forward Preview

### Test Infra Found
- Confirmed (again) that `bun run db:generate` is unusable while the snapshot-chain drift is unresolved — every future migration on this repo will need the same hand-write + snapshot-less-journal-registration workaround until the reconciliation pass in `drizzle-migration-journal-drift_02-07-26.md` happens.

### Blast Radius Changes
- Final touched-file count: 24 source files + 2 new files (`format-name.ts`, `format-name.spec.ts`) + 1 new migration + 1 journal edit + 4 evidence-pack JSON files + this report. Slightly above the plan's revised ~22-file estimate due to the incidental `leads/[id]/+page.server.ts` `me: User` fix (see Plan Deviations).

### Commands to Stay Green
- `bun run check`
- `bun run test:unit:ci`
- `bun run lint` (repo-wide will still show the 11 pre-existing unrelated files — that's expected, not a regression)

### Dependency Changes
- None. No new packages added.
