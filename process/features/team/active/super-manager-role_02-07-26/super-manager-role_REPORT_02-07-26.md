---
phase: super-manager-role
date: 2026-07-02
status: COMPLETE_WITH_GAPS
feature: team
plan: process/features/team/active/super-manager-role_02-07-26/super-manager-role_PLAN_02-07-26.md
---

# EXECUTE Report — super_manager singleton role (GitHub #73)

## TL;DR
All 16 checklist items implemented. Both automated gates green: `bun run check` exits 0,
`bun run test:unit -- --run` passes 276 tests (incl. new super_manager assertions). One
plan deviation (migration split into two files per E1) and one within-blast-radius scope
expansion (widening ~10 direct `role === 'manager'` checks across the app so super_manager
actually inherits manager powers — required by AC#5). Hybrid live-DB gates remain
pre-accepted known-gaps. Plan stays ACTIVE (code-complete, manual gates pending).

## What Was Done
- **Schema** (`schema.ts`): `crm_user_role` enum gains `super_manager`; added partial unique
  index `crm_users_single_super_manager_uq` on `role` WHERE `role='super_manager' AND active=true`.
- **Migration** (E1-compliant split): `0015_super_manager_role.sql` (`ALTER TYPE … ADD VALUE`)
  and `0016_single_super_manager_idx.sql` (`CREATE UNIQUE INDEX …`) as SEPARATE migration files
  so the new enum value commits in its own transaction before the index references it. Added
  matching `_journal.json` entries (idx 15, 16) and chained snapshots (0015, 0016).
- **Zod/roles**: `USER_ROLES` gains `super_manager`; `ROLE_LABEL.super_manager = 'Super Manager'`.
- **Permissions** (`permissions.ts`): added `isSuperManager`, `canDeactivateManager`,
  `canPromoteToSuperManager`; widened `isManager` to include super_manager (so
  canReassign/canAccessTeam/canManageUsers cascade). Role-only helpers now accept a `RoleBearer`
  ({ role: Role }) shape so endpoints can pass `locals.user` (SessionUser) directly.
- **DB layer** (`users.ts`): `createUser` role widened to `Role`; added `PermissionError`,
  `deactivateUser` (server-side lead reassignment in-transaction, replaces the mock reassign),
  `reactivateUser`, `updateUserRole` (rep↔manager only), `promoteSuperManager` (atomic transfer:
  demote current super_manager → promote target, index-guarded).
- **Endpoints**: POST `/api/users` actor check → `canManageUsers`, plus a guard rejecting direct
  `role='super_manager'` creation. NEW `PATCH /api/users/[id]` (deactivate/reactivate/role) and
  NEW `PATCH /api/users/[id]/promote-super`. Permission errors → 403, `23505` → 409.
- **Team page**: server gate → `canAccessTeam` (+ null guard for TS narrowing); svelte gets gold
  badge for super_manager, permission-gated Deactivate (reps always; managers/super_managers only
  by a super_manager, never self), a "Promote to Super Manager" action + confirm modal, real
  endpoint calls (dropped `crm.updateUser`/`crm.reassignLeads`), and the add-rep role select now
  excludes super_manager.
- **Tests**: `schemas.spec.ts` asserts `USER_ROLES` contains super_manager and
  `roleLabel('super_manager') === 'Super Manager'`.
- **SessionUser** (`auth.ts`): `role` widened to include `super_manager`.

## What Was Skipped or Deferred
- Hybrid live-DB manual gates (promote atomicity, manager-cannot-deactivate-manager 403,
  super_manager self-deactivate rejected, second active super_manager → 23505) — pre-accepted
  known-gap (no live-DB CI). Not exercised.
- e2e team-page gating — pre-accepted known-gap (no shared auth Playwright fixture).

## Test Gate Outcomes

| Gate | Tier | Result |
|---|---|---|
| `bun run check` | Fully-Automated | PASS (0 errors; 1 pre-existing unrelated warning in leads/[id]/+page.svelte) |
| `bun run test:unit -- --run` | Fully-Automated | PASS (276 passed, 82 skipped) |
| Hybrid live-DB permission/singleton gates | Hybrid | NOT RUN (pre-accepted known-gap) |
| e2e team-page gating | Known-gap | NOT RUN (pre-accepted) |

## Plan Deviations
1. **Migration split (E1 mitigation, anticipated).** Plan item 3 said a single `0015` file;
   implemented as `0015` (enum add) + `0016` (index) because PostgreSQL cannot use a newly-added
   enum value in the same transaction it was added in, and drizzle wraps a migration file's
   statements in one transaction. E1 explicitly permitted "keep enum-add in its own earlier
   migration." Rationale: correctness — a single-file version would fail at `db:migrate`.
2. **Auth widening beyond the 12 listed touchpoints (within blast radius; required by AC#5).**
   The plan assumed widening `isManager` was sufficient, but ~10 sites compare `role` directly and
   bypass `isManager`. Without widening them, a promoted super_manager would LOSE manager powers
   (couldn't see all leads, reassign owners, move others' leads, edit meetings). Widened:
   `leads.ts` `visibilityCondition` + `moveLeadStage` (param type → `Role`, `!== 'manager'` →
   `=== 'rep'`); endpoints `snooze`, `discard`, `activities`, `touch`, `owner`, `meetings/[id]`
   (GET/DELETE); components `AppSidebar.svelte`, `MeetingsPanel.svelte`, `meetings/[id]/+page.svelte`.
   All are the same semantic operation (manager gate → manager-or-super-manager) and stay within
   the auth/permissions blast radius. **Surfaced for review** — this is an auth-surface change
   broader than the literal checklist.
3. **Added `reactivateUser` + POST super_manager-creation guard + add-rep select filter.** Not
   itemized separately in the checklist but implied by item 12 (reactivate branch) and the SPEC
   (super_manager only via promote). Within scope.

## Test Infra Gaps Found
- `bun run db:generate` is **pre-existingly broken** (unrelated to this task): `0013_snapshot.json`
  and `0014_snapshot.json` both set `prevId` to `0012`'s id — a snapshot-chain collision. drizzle
  refuses to generate. I hand-authored the `0015/0016` SQL + journal + snapshots (runtime
  `db:migrate` only needs journal + .sql). Recommend a follow-up to repair the 0013/0014 snapshot
  chain so `db:generate` works again.

## Closeout Packet
- Selected plan: `process/features/team/active/super-manager-role_02-07-26/super-manager-role_PLAN_02-07-26.md`
- Finished: full 16-item checklist; both automated gates green.
- Verified: type-safety + role enum/label unit coverage. Unverified: all permission/transaction/
  singleton behavior (Hybrid live-DB known-gap) and team-page gating (e2e known-gap).
- Remaining: run the 4 Hybrid live-DB manual gates against a real DB before marking VERIFIED;
  optional follow-up to fix the pre-existing db:generate snapshot collision.
- Best next state: **Keep in active/testing** — code-complete, manual live-DB gates pending.
- Risk class: auth/permissions + schema migration (high-risk). No evidence pack produced — the
  accepted CONDITIONAL gate explicitly recorded live-DB verification as a known-gap.

## Forward Preview
- **Test Infra Found:** no live-DB CI, no shared auth Playwright fixture (repo-wide, pre-accepted);
  `db:generate` broken by pre-existing 0013/0014 snapshot collision.
- **Blast Radius Changes:** widened from the 12 planned files to ~22 (auth/permissions surface —
  see Deviation 2). Single package (SvelteKit app).
- **Commands to Stay Green:** `bun run check` and `bun run test:unit -- --run`.
- **Dependency Changes:** none.
