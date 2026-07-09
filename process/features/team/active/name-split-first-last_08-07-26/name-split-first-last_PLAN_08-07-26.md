---
name: plan:name-split-first-last
description: "COMPLEX plan for GitHub #277 — split crm_users.name into first_name + last_name with derived full-name backward-compat and {{repFirstName}}/{{repLastName}} template tokens"
date: 08-07-26
feature: team
---

# Name Split (First/Last) — PLAN

**GitHub issue:** #277
**SPEC:** `process/features/team/active/name-split-first-last_08-07-26/name-split-first-last_SPEC_08-07-26.md`
**Date**: 08-07-26
**Status**: Active — VALIDATE PVL cycle 1 returned CONDITIONAL (FAIL-1 cleared via G8 supplement; only pre-existing harness-blocked known-gaps remain; see Validate Contract)
**Complexity**: COMPLEX (schema/migration change + derived-field refactor across type/mapper/API/UI/template layers)
**Risk class:** HIGH — schema/data migration on `crm_users` (destructive `DROP COLUMN name`). Requires the manual-first 5-artifact evidence handoff at EXECUTE before finalize; VALIDATE must NOT be skipped.
**Context router:** `process/context/all-context.md` (read first; tests group `process/context/tests/all-tests.md` loaded for gate commands).

---

## TL;DR

Add `first_name` (NOT NULL, backfilled verbatim from `name`) and `last_name` (nullable) to `crm_users`, drop the `name` column, and reconstruct the combined display name as a plain field computed once at object-construction time via a new `formatFullName()` helper in the three mapper/hydration sites. Update the two Zod schemas, both API endpoints, the three UI edit surfaces, and add two template tokens. ~20 downstream render surfaces are untouched — they keep reading `.name` on the `User`/`SessionUser` objects, which the mappers still populate.

---

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | team |
| 2 | phase | PLAN |
| 3 | session-goal | Split user name into first_name + last_name with template variable support (#277) |
| 4 | branch | development |
| 5 | worktree | main |
| 6 | context-group | tests |
| 7 | blast-radius-packages | src/lib/server/db, src/lib/utils, src/lib/types, src/lib/server/auth.ts, src/hooks.server.ts, src/lib/zod, src/routes/api/users, src/routes/team, src/routes/profile, src/lib/data/templates.ts, src/lib/components/leads, src/routes/leads/[id], src/routes/templates |
| 8 | active-plan | this file |
| 9 | test-runner | bun run check \| bun run test:unit:ci |
| 10 | validate-contract | CONDITIONAL (see below) |

---

## Goals

1. Structured name storage: `crm_users.first_name` + `last_name`; `name` column removed.
2. Zero visual regression on ~20 existing name-display surfaces via a derived combined name.
3. Two new template tokens (`{{repFirstName}}`, `{{repLastName}}`); `{{repName}}` unchanged.
4. Three edit surfaces (`/team` edit modal, `/team` add-member form, `/profile`) gain two-field First/Last inputs.
5. Better Auth tables untouched.

## Scope

**In scope:** the 7 touchpoint groups below.
**Out of scope (per SPEC):** Better Auth `user` table; name-splitting heuristics; new "full name" raw input; snake_case tokens; editing the ~20 render surfaces individually; the pre-existing actor-role-only permission gap.

---

## Touchpoints

Dependency-ordered groups (from INNOVATE):

| # | Group | Files |
|---|---|---|
| G1 | Schema + migration | `src/lib/server/db/schema.ts:79`; new `drizzle/0033_*.sql` (generated + hand-edited backfill) |
| G2 | Shared helper | new `src/lib/utils/format-name.ts`; new `src/tests/format-name.spec.ts` |
| G3 | Types + 3 mapper/hydration sites | `src/lib/types/index.ts:36-45`; `src/lib/server/auth.ts:23-28`; `src/lib/server/db/leads.ts:143-151` (`dbUserToUser`); `src/lib/server/db/users.ts:240-247` (`sessionToUser`); `src/hooks.server.ts:44` (session hydration) |
| G4 | Zod schemas | `src/lib/zod/schemas.ts:240-250` (`userFormSchema`, `userNameEditSchema`) |
| G5 | API endpoints | `src/routes/api/users/[id]/+server.ts`; `src/routes/api/users/+server.ts`; `createUser` in `src/lib/server/db/users.ts:37-52` |
| G6 | UI edit surfaces (3) | `src/routes/team/+page.svelte` (add-member form ~L116-149 + edit modal ~L198-239); `src/routes/profile/+page.svelte:15-72` |
| G7 | Template system | `src/lib/data/templates.ts:16-23`; `src/routes/leads/[id]/+page.svelte:1063`; `src/lib/components/leads/LogTouchForm.svelte:56-61`; `src/routes/templates/+page.svelte:538`; `src/tests/templates.spec.ts`; `src/tests/templates-db.spec.ts` |
| **G8** | **SQL-layer `crm_users.name` read-sites (ADDED BY VALIDATE — see FAIL-1)** | **`src/lib/server/auth.ts:51-56` (welcome-email lookup); `src/routes/team/+page.server.ts:20` (orderBy); `src/lib/server/db/notes.ts:16` (authorName join); `src/routes/reports/+page.server.ts:42,179,182`; `src/routes/api/reports/export/+server.ts:44,47,207`; `src/lib/server/db/meetings.ts:127,150,180,203,258` (organizer/attendee name joins); `src/lib/server/db/leads.ts:759,771,774,1917,1921` (`listUsers` orderBy, `listActiveReps`, owner-name map); `src/lib/server/db/dashboard.ts:75,79,82` (rep search ilike + select + orderBy)** |

---

## Public Contracts

- **DB schema:** `crm_users` gains `first_name text NOT NULL`, `last_name text` (nullable); `name` column removed. Migration `0033` only touches `crm_users` (AC10).
- **`formatFullName(firstName: string, lastName: string | null | undefined): string`** — returns `firstName + (lastName ? ' ' + lastName : '')`. Pure, total (never throws), no trimming beyond the single conditional space.
- **`User` type** gains `firstName: string`, `lastName: string | null`; keeps `name: string` (computed once at construction, not a live getter).
- **`SessionUser` type** gains `firstName: string`, `lastName: string | null`; keeps `name: string`.
- **`TemplateVars`** gains `repFirstName: string`, `repLastName: string`; keeps `repName`. `fillTemplate` adds two `replaceAll` calls; existing three unchanged.
- **`userFormSchema`:** `name` → `firstName: z.string().min(1, 'First name is required')` + `lastName: z.string().optional()`. `userNameEditSchema = userFormSchema.pick({ firstName: true, lastName: true })`.
- **`PATCH /api/users/[id]`** and **`POST /api/users`** request bodies: `name` field replaced by `firstName`/`lastName`.
- **`createUser`** signature: `{ name }` → `{ firstName, lastName }`.

---

## Blast Radius

- **~22 files changed** (was stated ~14; corrected by VALIDATE FAIL-1 to include 8 additional SQL read-site files in G8), 2 new files, 1 new migration.
- **Packages/areas:** db schema+mappers, utils, types, auth, hooks, zod, 2 API routes, 2 route pages, templates lib + 2 callers + help text + 2 test files, **plus the 8 SQL-layer read-site files in G8**.
- **Risk class:** HIGH — schema/data migration with a destructive `DROP COLUMN`. A migration ordering bug (drop before backfill) or a mapper that forgets to populate `.name` would blank names across ~20 surfaces. Mitigated by: single ordered migration (add → backfill → set-not-null → drop), the `formatFullName` regression test proving derived == old value, and `bun run check` catching every unmigrated `.name`/`row.name`/`crmUsers.name` reference at compile time.

---

## Acceptance Criteria

Carried verbatim from the SPEC (each with its `proven by:` gate and `strategy:` tag). Full gate→criterion mapping is in the Verification Evidence table below.

- **AC1** — Existing team members keep their displayed full name (row-level: `first_name` == prior `name` verbatim, `last_name` empty). `strategy:` Hybrid (known-gap: no live DB). **CONDITIONAL.**
- **AC2** — Managers edit a member's first/last from `/team`. `strategy:` Hybrid. **CONDITIONAL.**
- **AC3** — Reps edit their own first/last from `/profile`. `strategy:` Hybrid. **CONDITIONAL.**
- **AC4** — Add-team-member form asks first (required) / last (optional). `strategy:` Hybrid. **CONDITIONAL.**
- **AC5** — First Name required, Last Name optional on all three edit surfaces. `proven by:` Zod unit test. `strategy:` Fully-Automated.
- **AC6** — `{{repFirstName}}`/`{{repLastName}}` substitute correctly (blank last → empty). `proven by:` `fillTemplate` unit test. `strategy:` Fully-Automated.
- **AC7** — `{{repName}}` unchanged. `proven by:` regression unit test. `strategy:` Fully-Automated.
- **AC8** — No visual regression on name-display surfaces. `proven by:` full unit/regression suite + derived-name equivalence test. `strategy:` Fully-Automated + Hybrid (live-DB spot check known-gap).
- **AC9** — Templates page help text lists both new tokens. `strategy:` Manual (browser). **CONDITIONAL.**
- **AC10** — Better Auth tables untouched. `proven by:` migration-file review. `strategy:` Fully-Automated.

---

## Implementation Checklist

### G1 — Schema + migration

1. Edit `src/lib/server/db/schema.ts:79`: replace `name: text('name').notNull(),` with `firstName: text('first_name').notNull(),` and `lastName: text('last_name'),`. Keep all indexes unchanged.
2. Run `bun run db:generate` to produce `drizzle/0033_*.sql`. **Preflight (per project rule):** confirm `drizzle/meta/_journal.json` last `idx=32` (verified 08-07-26) and no stray/duplicate-prefix `0033` file exists before generating.
3. Hand-edit the generated `0033_*.sql` so operations run in this exact order in one file (drizzle-generate will NOT produce the backfill — it must be added manually). **Keep the drizzle `--> statement-breakpoint` marker between each statement (VALIDATE E4); the drizzle migrator splits the file on that marker.** Replace any generated `ADD COLUMN "first_name" text NOT NULL;` with the split add→backfill→set-not-null sequence below (a NOT-NULL add on a populated table fails):
   ```sql
   ALTER TABLE "crm_users" ADD COLUMN "first_name" text;
   --> statement-breakpoint
   UPDATE "crm_users" SET "first_name" = "name";
   --> statement-breakpoint
   ALTER TABLE "crm_users" ALTER COLUMN "first_name" SET NOT NULL;
   --> statement-breakpoint
   ALTER TABLE "crm_users" ADD COLUMN "last_name" text;
   --> statement-breakpoint
   ALTER TABLE "crm_users" DROP COLUMN "name";
   ```
   Confirm the file touches ONLY `crm_users` (AC10) — no `user`/`account`/`session`/`verification` statements.
4. Do NOT run `bun run db:migrate` in this dev env (no live Postgres). Migration apply is a deploy-time step recorded as a known-gap.

### G2 — Shared helper (parallel-safe with G1)

5. Create `src/lib/utils/format-name.ts` exporting `formatFullName(firstName: string, lastName: string | null | undefined): string` → `firstName + (lastName ? ' ' + lastName : '')`.
6. Create `src/tests/format-name.spec.ts` covering: first only (`'Jane'` → `'Jane'`); first+last (`'Jane','Diaz'` → `'Jane Diaz'`); `null` last → first only; `undefined` last → first only; empty-string last → first only (falsy). **AC8 regression assertion:** for a verbatim-backfilled row (`firstName = 'Jane Diaz'`, `lastName = null`) the output equals the old stored `name` string exactly.

### G3 — Types + mapper/hydration sites (depends on G2)

7. `src/lib/types/index.ts`: add `firstName: string;` and `lastName: string | null;` to `User`; keep `name: string;`.
8. `src/lib/server/auth.ts:23-28`: add `firstName: string;` and `lastName: string | null;` to `SessionUser`; keep `name: string;`.
9. `src/lib/server/db/leads.ts` `dbUserToUser`: set `firstName: row.firstName`, `lastName: row.lastName`, `name: formatFullName(row.firstName, row.lastName)`. Import `formatFullName`.
10. `src/lib/server/db/users.ts` `sessionToUser`: update the input param type to include `firstName`/`lastName`, and return `firstName`, `lastName`, `name: formatFullName(u.firstName, u.lastName)`.
11. `src/hooks.server.ts:44`: build `locals.user` with `firstName: crmUser.firstName`, `lastName: crmUser.lastName`, `name: formatFullName(crmUser.firstName, crmUser.lastName)`. Import `formatFullName`.
12. Run `bun run check` — it will flag every remaining `.name`/`row.name`/`crmUsers.name` reference that must be migrated. **CORRECTED BY VALIDATE (FAIL-1): these are NOT all safe object-reads of the derived `.name` field. Many are direct `crmUsers.name` SQL-column references (see G8) that MUST be rewritten — they cannot "stay valid".** Resolve each per the G8 checklist below.

### G4 — Zod schemas (parallel-safe with G1-G3)

13. `src/lib/zod/schemas.ts:240-245` `userFormSchema`: replace `name: z.string().min(1, 'Name is required'),` with `firstName: z.string().min(1, 'First name is required'),` and `lastName: z.string().optional(),`.
14. `schemas.ts:249` `userNameEditSchema`: `userFormSchema.pick({ firstName: true, lastName: true })`.

### G5 — API endpoints (depends on G3, G4)

15. `src/routes/api/users/[id]/+server.ts`: `patchSchema` (L11) drop `name`, add `firstName: z.string().min(1).optional()`, `lastName: z.string().optional()`. Update destructure (L23) and the `.set({...})` block (L52-56) to set `firstName`/`lastName` columns. Update the manager-permission check at L45 (currently gated on `name !== undefined`) to gate on `firstName !== undefined || lastName !== undefined`. Self-edit branch (L27-32) unchanged (branches on `role`/`active`).
16. `src/routes/api/users/+server.ts`: destructure `{ firstName, lastName, email, role }` (L22); pass `createUser({ firstName, lastName, email, role })` (L32).
17. `src/lib/server/db/users.ts` `createUser` (L37-52): input `{ firstName: string; lastName?: string | null; email; role }`; `.values({ firstName: input.firstName, lastName: input.lastName ?? null, email, role })`.

### G6 — UI edit surfaces (depends on G4, G5)

18. `src/routes/team/+page.svelte` **add-member form** (~L116-149): replace single `name` state + input with `firstName` (required) and `lastName` (optional) `$state`; validate via `userFormSchema.safeParse({ firstName, lastName, email, role, active: true })`; render two inputs each wired to `FieldError`/`fieldErrorAttrs` (First Name uses `fieldErrors.firstName`, Last Name uses `fieldErrors.lastName`); POST body `{ firstName, lastName, email, role }`.
19. `src/routes/team/+page.svelte` **edit-name modal** (~L198-239): replace `editName` with `editFirstName`/`editLastName` state seeded from `u.firstName`/`u.lastName` (`openEdit` ~L206); validate via `userNameEditSchema.safeParse({ firstName: editFirstName, lastName: editLastName })`; render two inputs with `FieldError`; PATCH body `{ firstName: editFirstName, lastName: editLastName }`.
20. `src/routes/profile/+page.svelte` (L15-72): replace `name` state (seeded `data.currentUser.name`) with `firstName`/`lastName` seeded from `data.currentUser.firstName`/`.lastName`; validate via `userNameEditSchema`; render two labeled inputs (First Name required, Last Name optional) with `FieldError`; PATCH body `{ firstName, lastName }`. Confirm `/profile/+page.server.ts` load exposes `currentUser.firstName`/`.lastName` (it maps via `User`, so both are present after G3).

### G7 — Template system (depends on G3)

21. `src/lib/data/templates.ts`: `TemplateVars` add `repFirstName: string; repLastName: string;`. `fillTemplate` add `.replaceAll('{{repFirstName}}', vars.repFirstName)` and `.replaceAll('{{repLastName}}', vars.repLastName)`; keep the existing three `replaceAll` calls unchanged.
22. `src/routes/leads/[id]/+page.svelte:1063`: pass `repFirstName={data.me.firstName}` and `repLastName={data.me.lastName ?? ''}` alongside existing `repName={data.me.name}`.
23. `src/lib/components/leads/LogTouchForm.svelte:56-61`: thread `repFirstName`/`repLastName` props through to the `fillTemplate` call.
24. `src/routes/templates/+page.svelte:538`: update the help subtitle to list `{{repFirstName}}` and `{{repLastName}}` alongside the existing tokens.
25. `src/tests/templates.spec.ts`: update every `fillTemplate` call site to the new 5-key `TemplateVars` shape; add assertions for `{{repFirstName}}` and `{{repLastName}}` (including blank last-name → empty string); add/keep the `{{repName}}` regression assertion (AC7).
26. `src/tests/templates-db.spec.ts`: same `TemplateVars` shape update + new-token assertions where it exercises `fillTemplate`.

### G8 — SQL-layer `crm_users.name` read-sites (ADDED BY VALIDATE — resolve BEFORE final gates)

> **Rule for every site below (VALIDATE E1):** `formatFullName` is a JS helper and CANNOT be used inside a Drizzle column selection. For each SELECT that projected `crmUsers.name`, either (a) select `firstName: crmUsers.firstName` + `lastName: crmUsers.lastName` and compose the display string with `formatFullName(...)` in the JS `.map()` that follows, OR (b) project a SQL concat expression `sql<string>\`${crmUsers.firstName} || case when ${crmUsers.lastName} is null or ${crmUsers.lastName} = '' then '' else ' ' || ${crmUsers.lastName} end\``. Prefer (a) where a `.map()` already exists; use (b) only where the raw `{id,name}` row shape must be preserved without a mapper. For `orderBy`/`ilike`, use `crmUsers.firstName` — for verbatim-backfilled rows `firstName == old name`, so ordering/search behaviour is byte-identical until last names are added (satisfies AC8). Any deviation from firstName-only ordering/search must be an explicit decision recorded in the phase report.

- **G8a** `src/lib/server/auth.ts:51-56` (welcome-email lookup): `.select({ name: crmUsers.name })` → `.select({ firstName: crmUsers.firstName, lastName: crmUsers.lastName })`; greeting `welcomeEmail(row ? formatFullName(row.firstName, row.lastName) : 'there', url)`. Import `formatFullName`.
- **G8b** `src/routes/team/+page.server.ts:20`: `asc(crmUsers.name)` → `asc(crmUsers.firstName)` in the orderBy chain. (The rows already flow through `dbUserToUser`/`User`, so the displayed name is derived post-G3 — only the sort key changes.)
- **G8c** `src/lib/server/db/notes.ts:16`: `authorName: crmUsers.name` in `noteSelection` → select `authorFirstName`/`authorLastName` + compose in the mapper that consumes `noteSelection`, or use the SQL concat form (b). Trace the consumer of `authorName` and keep its output field name stable.
- **G8d** `src/routes/reports/+page.server.ts:42,179,182`: `select({ name: crmUsers.name })` + `orderBy(crmUsers.name)` → compose-in-map or concat for the projection; `orderBy(crmUsers.firstName)`.
- **G8e** `src/routes/api/reports/export/+server.ts:44,47,207`: same treatment as G8d (two selects + one orderBy).
- **G8f** `src/lib/server/db/meetings.ts:127,150,180,203,258`: `name: crmUsers.name` (attendee join) and `organizerName: crmUsers.name` (organizer joins) → select first/last + compose, or concat form. Preserve the `name ?? ''` / `organizerName` output field names the callers expect.
- **G8g** `src/lib/server/db/leads.ts`: L759 `orderBy(crmUsers.name)` in `listUsers` → `orderBy(crmUsers.firstName)` (rows already map through `dbUserToUser`); L771/774 `listActiveReps` `select({id, name: crmUsers.name}).orderBy(crmUsers.name)` → select first/last + compose into `{id, name}`, orderBy firstName; L1917/1921 owner-name map `select({id, name: crmUsers.name})` → select first/last + compose into the `nameMap` (the `o.name` read at L1921 stays valid once the select composes `name`).
- **G8h** `src/lib/server/db/dashboard.ts:75,79,82`: `ilike(crmUsers.name, term)` → `ilike(crmUsers.firstName, term)` (or concat form if search-over-full-name is required — record the choice); `select({id, name: crmUsers.name})` → compose (this is `getActiveAeList`; the `ae.name` read at `getDashboardData` L320 stays valid once the select composes `name`); `orderBy(crmUsers.name)` → `orderBy(crmUsers.firstName)`.

### Final gates

27. `bun run check` (zero errors), `bun run test:unit:ci` (all green), `bun run lint` on touched files.

---

## Phase Completion Rules

This is a single-phase COMPLEX plan (not a phase program). Completion states:

- **CODE DONE** — all checklist steps applied (G1–G8); `bun run check` green; `bun run test:unit:ci` green (AC5/AC6/AC7 + AC8 automated half genuinely passing); `bun run lint` clean on touched files; the high-risk 5-artifact evidence pack produced.
- **VERIFIED** — CODE DONE plus the Hybrid/Manual CONDITIONAL gates (AC1/AC2/AC3/AC4/AC9 + AC8 hybrid half) satisfied by a live-DB + authenticated-session run. Not reachable in this dev env (no live Postgres, no shared Playwright auth fixture) — those gates stay CONDITIONAL against standing backlog notes and this plan cannot be marked VERIFIED until the harnesses exist.
- The plan stays in `active/` after CODE DONE (mirrors `team-member-profile-edit_07-07-26`), because verification is harness-blocked, not implementation-blocked.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `0033_*.sql` review: add→backfill→set-not-null order, `--> statement-breakpoint` markers present, `last_name` nullable, only `crm_users` touched | Fully-Automated (migration diff read in `bun run check` + manual diff) | AC1 (backfill design), AC10 (Better Auth untouched) |
| Live-DB row check: every pre-existing row `first_name == prior name` verbatim, `last_name` NULL | Hybrid — **known-gap** (no live Postgres in dev env; deploy-time verification) | AC1 |
| `/team` edit modal saves First/Last, row name updates | Hybrid — **known-gap** (no live-DB/auth fixture; mirrors team-member-profile-edit_07-07-26) | AC2 |
| `/profile` self-edit saves First/Last | Hybrid — **known-gap** (same) | AC3 |
| Add-team-member form shows First (req) / Last (opt) | Hybrid — **known-gap** (same) | AC4 |
| `userFormSchema`/`userNameEditSchema` unit test: blank firstName fails, blank lastName passes, both filled passes | Fully-Automated (`bun run test:unit:ci`) | AC5 |
| `fillTemplate` unit test: `{{repFirstName}}`/`{{repLastName}}` substitute correctly, blank last → empty | Fully-Automated (`src/tests/templates.spec.ts`) | AC6 |
| `fillTemplate` regression: `{{repName}}` unchanged | Fully-Automated | AC7 |
| Full unit/regression suite green + `formatFullName` derived == old `name` for verbatim-backfilled row | Fully-Automated (`src/tests/format-name.spec.ts` + `bun run test:unit:ci`) | AC8 (automated half) |
| Live-DB spot check derived name matches for seeded users | Hybrid — **known-gap** (no live DB) | AC8 (hybrid half) |
| G8 SQL read-sites: `bun run check` green after all `crmUsers.name` references rewritten | Fully-Automated (`bun run check`) | AC8 (no-regression, SQL layer) |
| Templates page help text lists both new tokens | Manual (browser) — **known-gap** (self-skipping e2e; visual check at deploy) | AC9 |

### CONDITIONAL gates + backlog (vacuous-green ban compliance)

AC1, AC2, AC3, AC4, AC9, and the Hybrid half of AC8 are developed behaviors whose only proving gate is Hybrid/Manual and currently a **known-gap** (no live-DB CI harness, no shared Playwright auth fixture). Per the vacuous-green ban these gates stay **CONDITIONAL** — they are NOT declarable PASS on known-gap alone. The residual is recorded against existing backlog notes, not silently dropped:

- Live-DB CI harness — existing repo-wide gap (see `all-tests.md` Known Gaps; multiple features carry the same pre-accepted known-gap).
- Shared Playwright authenticated-session fixture — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

The core logic (AC5/AC6/AC7 + AC8 automated half, **and the G8 SQL read-sites**) is Fully-Automated and must be genuinely green before this plan is PASS-able. This matches the accepted precedent set by `team-member-profile-edit_07-07-26`.

---

## Test Infra Improvement Notes

(none new identified — this plan inherits the two standing repo gaps: live-DB CI harness and shared Playwright auth fixture, both already tracked in backlog. No new infra gap introduced.)

---

## Dependencies, Risks, Failure Modes

- **Ordering dependency:** G3 (mappers) must import `formatFullName` from G2 before G6/G7/G8 consume `.firstName`/`.lastName`. G5 depends on G3+G4. G6 depends on G4+G5. G7 depends on G3. **G8 depends on G1+G2 (needs the renamed columns and `formatFullName`).**
- **Migration ordering (highest risk):** the `DROP COLUMN name` MUST come after the `UPDATE ... SET first_name = name` and `SET NOT NULL`. A reordering blanks all names. Enforced by the single hand-authored SQL file in step 3.
- **Compile-time safety net:** removing the `name` column from the Drizzle schema makes `row.name` AND `crmUsers.name` type errors everywhere — `bun run check` (step 12) enumerates every site (including all G8 SQL read-sites) that must migrate; nothing silently reads a dropped column. VALIDATE confirmed (cycle 0 and re-confirmed independently at cycle 1) there is NO dynamic/`any`-typed/raw-SQL access to `crmUsers.name` that could escape the typecheck — the two raw `sql\`\`` dashboard queries touch only `crm_leads`/`crm_lead_history`/`crm_activities`, and the lowercase `crm_users` literal appears only in comments/index-names, never in a raw SQL SELECT of the name column.
- **Backward-compat correctness:** every `User`/`SessionUser` is built through exactly one of the 3 mapper/hydration sites (dbUserToUser, sessionToUser, hooks). All 3 must populate `.name` via `formatFullName` or a downstream surface shows `undefined`. AC8 test guards the value; step-12 typecheck guards the presence.
- **`/profile` load:** confirm `currentUser` is mapped through `User` (exposes firstName/lastName post-G3). If it selects raw columns, add the two fields to that load.
- **Backwards compatibility / rollback:** additive-then-drop migration is not trivially reversible (the dropped `name` values are reconstructable from `first_name` since backfill is verbatim, but roll-back requires a reverse migration recreating `name` from `first_name`). Note this in the EXECUTE evidence pack. No production apply happens in this session.

---

## High-Risk Manual-First Evidence Handoff (EXECUTE)

This is a schema/data-migration change. Before finalize, EXECUTE must produce the 5-artifact evidence pack (per `vc-risk-evidence-pack`), colocated in this task folder under `harness/`: (1) `risk-gate.json` (riskClass `schema/data migration`, `mustStopBeforeFinalize: true`); (2) `context-snippets.json` (the exact `0033_*.sql` content + the G8 read-site diffs); (3) `verification.json` (`bun run check` output, `bun run test:unit:ci` output, migration diff confirming only `crm_users` is touched); (4) `review-decision.json` (explicit APPROVE/REJECT + rationale); (5) `adversarial-validation.json` NOT required (no auth-bypass/secret-exfiltration path — display-name only). Add a rollback note describing the reverse migration recreating `name` from `first_name`. VALIDATE must NOT be skipped for this plan.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/team/active/name-split-first-last_08-07-26/name-split-first-last_PLAN_08-07-26.md`
2. **Last completed step:** PLAN written; VALIDATE cycle 0 returned BLOCKED (FAIL-1); plan supplemented in-place (G8 added); VALIDATE PVL cycle 1 re-ran and returned **CONDITIONAL** — FAIL-1 cleared, only pre-existing harness-blocked known-gaps remain. No code changed.
3. **Validate-contract status:** written below — **Gate: CONDITIONAL**. FAIL-1 is resolved (G8 enumerates all 21 `crmUsers.name` read-sites across 8 files; independently re-searched at cycle 1 — no other sites, no raw-SQL escape). Ready for EXECUTE.
4. **Supporting context loaded:** SPEC (same folder); `process/context/all-context.md` router + `process/context/tests/all-tests.md`; schema/types/auth/mappers/zod/api/templates/SQL-read-sites source confirmed at the exact line numbers cited above; journal `idx=32` confirmed 08-07-26.
5. **Next step:** EXECUTE in dependency order G1→G2→G3→G4→G5→G6→G7→G8, running `bun run check` after G3 to enumerate `.name`/`crmUsers.name` migration sites. Do NOT run `db:migrate` (no live DB). Produce the high-risk evidence pack before finalize. The CONDITIONAL known-gaps (AC1-4/AC8-hybrid/AC9) are harness-blocked and stay open against standing backlog notes — they do NOT block EXECUTE (they block only the VERIFIED state).

---

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl
supersedes: 08-07-26 (outer-pvl) — PVL cycle 1 re-validation cleared FAIL-1 (G8 supplement independently confirmed complete); outer PVL has current evidence

Parallel strategy: parallel-subagents
Rationale: Score 4/7 (S2 schema/API surface, S6 high-risk schema/migration class, S7 5+ files, plus the added G8 sites) — Layer 1 four dimensions + Layer 2 three feasibility sections fanned out; results synthesized. HIGH tier; no live-provider probe needed (all checks source-readable). PVL cycle 1: re-run after in-place G8 supplement resolved the cycle-0 FAIL-1.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | First Name required / Last Name optional across the 3 edit surfaces | Fully-Automated | `bun run test:unit:ci` — `userFormSchema`/`userNameEditSchema` cases: blank firstName fails, blank lastName passes, both filled passes | A |
| AC6 | `{{repFirstName}}`/`{{repLastName}}` substitute; blank last → empty | Fully-Automated | `bun run test:unit:ci` — `src/tests/templates.spec.ts` new-token assertions | A |
| AC7 | `{{repName}}` substitution unchanged | Fully-Automated | `bun run test:unit:ci` — `src/tests/templates.spec.ts` regression assertion | A |
| AC8 (auto half) | derived `name` == old stored `name` for verbatim-backfilled row; full suite green | Fully-Automated | `bun run test:unit:ci` — `src/tests/format-name.spec.ts` equivalence + full regression run | B |
| AC8 (SQL layer) | all `crmUsers.name` read-sites (G8, 21 refs / 8 files) rewritten; no dropped-column reference remains | Fully-Automated | `bun run check` exits 0 after G1+G3+G8 | B |
| AC10 | migration touches only `crm_users`; Better Auth tables untouched | Fully-Automated | manual diff of `drizzle/0033_*.sql` + `bun run check` | B |
| AC1 | pre-existing rows: `first_name == prior name` verbatim, `last_name` NULL | Hybrid | live-DB row check after `db:migrate` (deploy-time) | D |
| AC2 | manager edits member first/last from `/team`; row name updates | Hybrid | live-DB + authed-session `/team` edit-modal run | D |
| AC3 | rep self-edits first/last from `/profile` | Hybrid | live-DB + authed-session `/profile` run | D |
| AC4 | add-team-member form shows First (req) / Last (opt) | Hybrid | live-DB + authed-session add-member run | D |
| AC8 (hybrid half) | derived name matches for seeded users on a live DB | Hybrid | live-DB spot check | D |
| AC9 | templates help text lists both new tokens | Agent-Probe | browser visual check of `templates/+page.svelte:538` help text | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a named later phase; D — backlog test-building stub (named residual; live-DB CI harness + shared Playwright auth fixture).

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the D-row residuals below are named, not silent.

Legacy line form (retained for existing consumers):
- Zod schema (AC5): Fully-automated: `bun run test:unit:ci`
- Template tokens (AC6/AC7): Fully-automated: `bun run test:unit:ci` (`src/tests/templates.spec.ts`)
- Derived-name equivalence + suite (AC8 auto): Fully-automated: `bun run test:unit:ci` (`src/tests/format-name.spec.ts`)
- SQL read-sites cleared (AC8 SQL): Fully-automated: `bun run check`
- Migration scope (AC10): Fully-automated: `bun run check` + manual `0033_*.sql` diff
- Existing-row backfill / edit surfaces (AC1–AC4, AC8 hybrid): hybrid: live-DB + authed-session — precondition: live Postgres + shared Playwright auth fixture (both known-gap)
- Templates help text (AC9): agent-probe: browser visual check — known-gap (self-skipping e2e)

Failing stubs (Fully-Automated rows — TDD red-first for EXECUTE):
```
test("userFormSchema rejects blank firstName, accepts blank lastName", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC5 first/last Zod validation") })
test("fillTemplate substitutes {{repFirstName}}/{{repLastName}}, blank last → empty", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC6 new template tokens") })
test("fillTemplate leaves {{repName}} unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC7 repName regression") })
test("formatFullName for verbatim-backfilled row equals old stored name", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC8 derived-name equivalence") })
```

Dimension findings:
- Infra fit: PASS — test runner commands correct (`bun run check`, `bun run test:unit:ci`); no live-DB apply in this dev env (correctly deferred to deploy-time known-gap); migration numbering `0033` confirmed (journal idx=32, no stray/duplicate 0033 file).
- Test coverage: CONCERN — Fully-Automated gates (Zod, fillTemplate tokens, repName regression, formatFullName equivalence, `bun run check` SQL-clean) are genuine and green-able; Hybrid/Manual gates are properly documented known-gaps against standing backlog notes. G8's DB-query functions (`listActiveReps`, dashboard search, notes/meetings joins) have no dedicated Fully-Automated coverage beyond `bun run check` — their composed-name output is only proven at deploy-time (Hybrid). Acceptable given the compile-time net, noted as residual. **Unchanged at cycle 1 — the G8 supplement added Fully-Automated (`bun run check`) coverage, not a new gap.**
- Breaking changes: **PASS (cycle 1 — was FAIL-1 at cycle 0, now RESOLVED)** — the G8 supplement enumerates all 21 direct `crmUsers.name` SQL-column read-sites across 8 files (auth welcome-email, team orderBy, notes author join, reports select+orderBy, reports-export, meetings organizer/attendee joins, leads listUsers/listActiveReps/owner-map, dashboard rep-search), each with a concrete per-site fix (compose-in-map or SQL-concat form; orderBy/ilike→firstName). VALIDATE independently re-searched at cycle 1: fresh `crmUsers.name` grep = exactly 21 refs, all covered by G8; the snake_case `crm_users` literal appears only in comments/index-names/test-seed docs — NO raw-SQL/dynamic/`any`-typed access to the name column that could escape `bun run check`. FAIL-1 cleared; no residual breaking-change risk.
- Security surface: PASS — no auth/session logic branches on `name`'s presence or shape. Better Auth's own tables (`baUser`/`baSession`/`baAccount`/`baVerification`) are separate and untouched (AC10). The only `name`-adjacent auth site is the magic-link welcome-email greeting (`auth.ts:51-56`), which is cosmetic (`row?.name ?? 'there'`) — captured under G8a, not a trust-boundary issue. No adversarial-validation artifact required. **Unchanged at cycle 1.**

Layer 2 section findings:
- Section A — Migration/schema (G1): PASS — add→backfill→set-not-null→drop ordering is valid, correctly-ordered Postgres DDL/DML; `DROP COLUMN name` is after the `UPDATE ... SET first_name = name` and `SET NOT NULL`; since `name` was `NOT NULL`, `SET NOT NULL` on `first_name` is guaranteed to succeed. CONCERN folded into E4: drizzle-generate emits `ADD COLUMN first_name text NOT NULL` (fails on populated table) and omits the backfill — the execute-agent MUST replace it with the split sequence and keep `--> statement-breakpoint` markers. **Unchanged at cycle 1.**
- Section B — Types + mappers + SQL read-sites (G3/G8): **PASS (cycle 1 — was FAIL at cycle 0)** — the 3 JS mapper sites (G3) are correct and complete; the SQL read-sites (G8) are now fully enumerated and each has a concrete, mechanically-feasible fix. Line-number spot-checks confirmed (leads.ts:1917 select + 1921 nameMap consumer; dashboard getActiveAeList + getDashboardData L320 consumer; meetings 5 joins; reports/export selects+orderBy). Resolved.
- Section C — API + UI + templates (G4/G5/G6/G7): PASS — edit-target line numbers verified; Zod pick-based `userNameEditSchema`, API patch/create signatures, and the 3 UI surfaces are mechanically feasible; `fillTemplate` extension is additive and non-breaking; existing `{{repName}}` path untouched. **Unchanged at cycle 1.**

Open gaps:
- FAIL-1 (breaking-change read-site coverage) — **RESOLVED at cycle 1** via the G8 supplement; independently re-verified (21 refs, all covered, no raw-SQL escape). No longer open.
- Live-DB CI harness — known-gap: documented against `all-tests.md` Known Gaps (repo-wide standing gap; multiple features share it). Blocks AC1/AC2/AC3/AC4/AC8-hybrid VERIFIED state.
- Shared Playwright authenticated-session fixture — known-gap: documented in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Blocks AC2/AC3/AC4 authed-session render.
- Templates help-text visual check (AC9) — known-gap: self-skipping e2e; deploy-time visual check.

(All three remaining known-gaps are pre-existing, standing, harness-blocked infrastructure gaps — NOT introduced by this plan and NOT resolvable by a plan supplement. They match the accepted `team-member-profile-edit_07-07-26` CONDITIONAL precedent. Nothing new was introduced at cycle 1.)

What this coverage does NOT prove:
- `bun run check` / `bun run test:unit:ci` (AC5/6/7/8-auto/AC8-SQL/AC10): does NOT prove the migration actually applies against a real Postgres, does NOT prove existing rows backfill correctly (no live DB), does NOT prove the rendered UI on any of the ~20 name-display surfaces or the 3 edit surfaces (no authed-session render), does NOT prove the G8 DB-query functions return the correctly-composed name at runtime (only that they type-check).
- Migration diff (AC10): proves only `crm_users` is textually touched; does NOT prove the applied schema state on a live DB.
- All Hybrid/Agent-Probe rows (AC1/2/3/4/8-hybrid/9): unproven in this environment — deferred to a live-DB + shared-auth-fixture run (named backlog residuals).

Gate: CONDITIONAL (0 FAILs; FAIL-1 cleared at PVL cycle 1; remaining CONCERNs are pre-existing harness-blocked Hybrid/Manual known-gaps, accepted on record — matching the team-member-profile-edit_07-07-26 precedent)
Accepted by: session (autonomous, PVL cycle 1 re-validation) — accepted concerns: (1) AC1/AC2/AC3/AC4/AC8-hybrid live-DB verification blocked by the repo-wide live-DB CI harness gap; (2) AC2/AC3/AC4 authed-session render blocked by the shared Playwright auth-fixture gap; (3) AC9 templates help-text visual check blocked by the self-skipping-e2e known-gap. All three are pre-existing standing gaps tracked in backlog, not introduced by this plan.

---

## Autonomous Goal Block

```
SESSION GOAL: Split crm_users.name into first_name + last_name with derived full-name backward-compat and {{repFirstName}}/{{repLastName}} template tokens (GitHub #277)
Charter + umbrella plan: N/A — single COMPLEX plan (not a phase program)
Autonomy: per feedback_autonomous_phase_execution.md — EXECUTE proceeds on the CONDITIONAL contract; the three harness-blocked known-gaps (live-DB CI, Playwright auth fixture, AC9 visual) are accepted residuals and do NOT block EXECUTE (they block only the VERIFIED state).
Hard stop conditions / safety constraints:
- This is a HIGH-risk schema/data migration (destructive DROP COLUMN name). Before finalize, EXECUTE MUST produce the 5-artifact evidence pack under {task-folder}/harness/ (risk-gate/context-snippets/verification/review-decision; adversarial-validation NOT required — display-name only) with a rollback note.
- Do NOT run bun run db:migrate in this dev env (no live Postgres) — migration apply is a deploy-time step.
- Migration ordering is load-bearing: DROP COLUMN name MUST come after UPDATE SET first_name = name and SET NOT NULL. Keep --> statement-breakpoint markers between statements.
- Do NOT touch Better Auth tables (user/account/session/verification) — migration 0033 touches ONLY crm_users (AC10).
Next phase: EXECUTE: process/features/team/active/name-split-first-last_08-07-26/name-split-first-last_PLAN_08-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL)
Execute start: implement in dependency order G1→G2→G3→G4→G5→G6→G7→G8; run `bun run check` after G3 to enumerate migration sites; final gates `bun run check` + `bun run test:unit:ci` + `bun run lint` on touched files. Fully-auto gates: bun run check, bun run test:unit:ci. Hybrid/known-gap: live-DB + authed-session (AC1-4/AC8-hybrid), AC9 visual. high-risk pack: yes.
```
