---
name: plan:super-manager-role
description: COMPLEX plan — super_manager singleton role above manager (GitHub #73) — enum + partial unique index, transactional promote, permission-checked deactivate/updateRole, team page gating + gold badge
date: 02-07-26
feature: team
---

# PLAN — super_manager singleton role (GitHub #73)

Date: 02-07-26
Status: ACTIVE — VALIDATE next
Complexity: COMPLEX
Context: see `process/context/all-context.md` (team feature; auth/permissions + Drizzle schema conventions)

TL;DR: Add `super_manager` to the `crm_user_role` enum with a DB partial unique index enforcing at most one active holder. Add transactional `promoteSuperManager` plus permission-checked `deactivateUser` / `updateUserRole` in `users.ts`. Broaden manager permission helpers to include super_manager. Wire the team page off the mock onto two new real API endpoints, add a gold badge and a "Promote to Super Manager" confirm modal.

## Overview / Context
GitHub issue #73 introduces a `super_manager` singleton role above `manager`. Exactly one active super_manager exists at any time (DB-enforced). Super_manager is the only user who can deactivate managers, promote users to manager/super_manager, and transfer the super_manager role. All existing manager powers over reps also apply to super_manager. Full requirements: `super-manager-role_SPEC_02-07-26.md`.

## Acceptance Criteria
- [ ] Only one active `super_manager` row can exist (DB partial unique index + server transaction).
- [ ] A `manager` cannot deactivate another manager — only `super_manager` can.
- [ ] Promoting B → super_manager sets previous holder A → manager atomically.
- [ ] Team page reflects permission gates (button visibility, gold badge, promote action + confirm modal).
- [ ] All existing manager permissions also apply to `super_manager`.
- [ ] A `super_manager` cannot deactivate themselves.
- [ ] `roleLabel('super_manager')` returns "Super Manager".

## Phase Completion Rules
Single-phase plan. Phase is CODE DONE when all checklist items are implemented and `bun run check` + `bun run test:unit -- --run` pass. Phase is VERIFIED only after the Hybrid (live-DB) manual gates in Verification Evidence are exercised; until then it stays ACTIVE (code-complete, manual gates pending). e2e gating is a pre-accepted known-gap.

## Touchpoints
- `src/lib/server/db/schema.ts` — add enum value + partial unique index
- `drizzle/0015_super_manager_role.sql` — new migration (enum add + partial unique index)
- `src/lib/server/db/users.ts` — `promoteSuperManager`, `deactivateUser`, `updateUserRole`; widen `createUser` role type
- `src/lib/utils/permissions.ts` — `isSuperManager`, `canDeactivateManager`, `canPromoteToSuperManager`; widen `isManager` etc.
- `src/lib/utils/roles.ts` — ROLE_LABEL super_manager
- `src/lib/zod/schemas.ts` — `USER_ROLES` add `super_manager`
- `src/routes/api/users/+server.ts` — POST allow super_manager actor
- `src/routes/api/users/[id]/+server.ts` — NEW: PATCH deactivate + role update
- `src/routes/api/users/[id]/promote-super/+server.ts` — NEW: PATCH promote-super
- `src/routes/team/+page.server.ts` — allow manager AND super_manager
- `src/routes/team/+page.svelte` — button gating, gold badge, promote modal, real endpoint calls
- `src/tests/schemas.spec.ts` — unit test for role enum + roleLabel (read: existing test conventions)

## Public Contracts
- New Postgres enum value `super_manager` on `crm_user_role` (additive — no existing consumer breaks).
- New DB unique index `crm_users_single_super_manager_uq` (partial: `role='super_manager' AND active=true`).
- New HTTP endpoints:
  - `PATCH /api/users/[id]` — body `{ active?: boolean, role?: Role }`; actor from session. Enforces: deactivating a manager requires super_manager actor; super_manager cannot deactivate self; role changes to/from super_manager routed through promote flow (reject direct role='super_manager' here → use promote-super).
  - `PATCH /api/users/[id]/promote-super` — super_manager actor only; calls `promoteSuperManager(id)`.
- `Role` type (`$lib/types`) gains `super_manager` automatically via `USER_ROLES`.

## Blast Radius
- 12 files, single package (SvelteKit app). Risk class: **auth/permissions + schema/data migration** (high-risk). No workspace/multi-package fan-out.

## Implementation Checklist

### 1. Schema + migration
1. `schema.ts:24` — change to `pgEnum('crm_user_role', ['rep', 'manager', 'super_manager'])`.
2. `schema.ts` crm_users index array — add `uniqueIndex('crm_users_single_super_manager_uq').on(t.role).where(sql\`role = 'super_manager' AND active = true\`)`.
3. Create `drizzle/0015_super_manager_role.sql`:
   - `ALTER TYPE "public"."crm_user_role" ADD VALUE IF NOT EXISTS 'super_manager';` (own statement — enum add cannot be used in the same txn it is added in; place as first statement / separate migration file so drizzle commits it before the index).
   - `CREATE UNIQUE INDEX IF NOT EXISTS "crm_users_single_super_manager_uq" ON "crm_users" ("role") WHERE role = 'super_manager' AND active = true;`
   - E1: verify against `drizzle-kit generate` output; if generate splits enum-add and index into ordering that fails at `migrate`, keep enum-add in its own earlier migration or use the `ADD VALUE` before-index ordering. Document the final SQL in the phase report.

### 2. Zod + roles util
4. `schemas.ts:47` — `export const USER_ROLES = ['rep', 'manager', 'super_manager'] as const;`
5. `roles.ts` ROLE_LABEL — add `super_manager: 'Super Manager'`.

### 3. Permissions util
6. `permissions.ts` — add:
   - `isSuperManager = (u) => u?.role === 'super_manager'`
   - widen `isManager = (u) => u?.role === 'manager' || u?.role === 'super_manager'` (so canReassign/canAccessTeam/canManageUsers cascade — they call isManager).
   - `canDeactivateManager = (actor) => isSuperManager(actor)`
   - `canPromoteToSuperManager = (actor) => isSuperManager(actor)`
   - E2: confirm no caller depends on `isManager` meaning strictly `role==='manager'` (grep `isManager` before widening).

### 4. DB layer (users.ts)
7. Widen `createUser` input `role: 'rep' | 'manager' | 'super_manager'` (or `Role`).
8. `deactivateUser(actorId, targetId)`:
   - load actor + target rows.
   - reject if target.role is `manager`/`super_manager` and actor is not super_manager (403-class error).
   - reject if actor deactivates self AND actor is super_manager (must transfer first).
   - in a transaction: set target.active=false; null `ownerId` on target's active non-won/non-lost leads (replaces the mock reassign). Return updated user.
9. `updateUserRole(actorId, targetId, newRole)`:
   - super_manager actor only. Reject `newRole==='super_manager'` here (route through promote). Allow rep↔manager transitions. Update role.
10. `promoteSuperManager(newId)` — transaction:
    - find current active super_manager (if any) → set role='manager'.
    - set target role='super_manager'.
    - rely on partial unique index; map 23505 → surfaced as conflict.

### 5. API endpoints
11. `api/users/+server.ts:12` POST — allow `role === 'manager' || role === 'super_manager'` actor (use `canManageUsers`).
12. NEW `api/users/[id]/+server.ts` PATCH — parse `{active?, role?}`; actor=`locals.user`; call `deactivateUser`/reactivate or `updateUserRole`; map permission errors to 403, 23505 to 409.
13. NEW `api/users/[id]/promote-super/+server.ts` PATCH — `canPromoteToSuperManager(locals.user)` gate; call `promoteSuperManager(params.id)`; 409 on 23505.

### 6. Team page
14. `+page.server.ts:21` — gate on `canAccessTeam(locals.user)` (manager OR super_manager) instead of `role !== 'manager'`.
15. `+page.svelte`:
    - Deactivate button: show for reps always (when canManage); for manager/super_manager rows only when `isSuperManager(currentUser)`; hide self-deactivate for super_manager.
    - `toggleActive` → call `PATCH /api/users/[id]` real endpoint (drop mock `crm.updateUser`/`crm.reassignLeads` for deactivate; lead move now server-side). Reactivate → PATCH `{active:true}`.
    - Add "Promote to Super Manager" action (visible only when `isSuperManager(currentUser)` and target is a manager) → confirm modal explaining the transfer → `PATCH /api/users/[id]/promote-super`.
    - Badge: super_manager → gold/amber (`color:#a16207;background:#fef9c3`), manager unchanged.

### 7. Tests
16. Add/extend `src/tests/schemas.spec.ts`: `USER_ROLES` includes `super_manager`; `roleLabel('super_manager') === 'Super Manager'`. (Read existing file first for style.)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | Type cascade of Role through USER_ROLES; no tsc regressions |
| `bun run test:unit -- --run` (schemas.spec) | Fully-Automated | roleLabel('super_manager')==='Super Manager'; enum includes super_manager |
| Manual: promote B → super_manager, confirm A→manager, one active super_manager in DB | Hybrid (live DB) | Atomic transfer + singleton |
| Manual: manager deactivates manager → 403 | Hybrid (live DB) | manager cannot deactivate manager |
| Manual: super_manager self-deactivate → rejected | Hybrid (live DB) | self-deactivate blocked |
| DB: second active super_manager insert → 23505 | Hybrid (live DB) | DB-level singleton |
| e2e team-page gating | Known-gap | No shared auth Playwright fixture (repo-wide, pre-accepted) |

## Test Infra Improvement Notes
(none identified yet)

## Resume and Execution Handoff
1. Selected plan: `process/features/team/active/super-manager-role_02-07-26/super-manager-role_PLAN_02-07-26.md`
2. Last completed step: PLAN written; VALIDATE next.
3. Validate-contract: pending.
4. Context loaded: schema.ts, permissions.ts, roles.ts, users.ts, team +page.server/.svelte, api/users/+server.ts, types, zod schemas, tests/all-tests.md.
5. Next step for fresh agent: run VALIDATE, then on ENTER EXECUTE MODE implement checklist top-to-bottom (schema → migration → zod/roles → permissions → users.ts → endpoints → team page → tests), running `bun run check` after the db-layer and after the UI.

## Validate Contract

generated-by: outer-pvl
date: 2026-07-02
Date: 02-07-26
Gate: CONDITIONAL

### Gate summary
0 FAILs / 6 CONCERNs. CONCERNs accepted: (1) permission/transaction/singleton logic verified only via Hybrid live-DB manual gates — no automated coverage (repo-wide known-gap: no live-DB CI, no shared auth e2e fixture); (2) migration enum-add/index ordering carries mitigation E1. Proceed to EXECUTE with gaps on record.

### Execute-agent instructions
- E1 (Section 1): Verify the `0015` migration against `drizzle-kit generate` output. `ALTER TYPE crm_user_role ADD VALUE 'super_manager'` must be committed before the partial unique index uses the value — keep enum-add as its own statement/migration ordering. Document the final SQL in the phase report. Run `bun run check` after schema edit.
- E2 (Section 3): `grep isManager src/` confirmed no external callers — widening `isManager` to include super_manager is safe. Re-confirm before editing.
- E3 (Section 4-5): Every endpoint re-checks actor role server-side via the `users.ts` functions — never trust the client. Block super_manager self-deactivate and self-demote. Reject direct `role='super_manager'` on the generic PATCH (route through promote-super). Map permission errors → 403, 23505 → 409.
- E4 (Section 6): Switch team-page deactivate/promote to the real endpoints; leave the add-rep POST path unchanged. Lead reassignment on deactivate now happens server-side in `deactivateUser` — remove the mock `crm.reassignLeads` call for that flow.
- After UI edits, run `bun run check` and `bun run test:unit -- --run`.

### Test gates
1. `bun run check` — exits 0 (type cascade of Role; no tsc/svelte-check regressions).
2. `bun run test:unit -- --run` — schemas.spec includes `super_manager` in USER_ROLES and `roleLabel('super_manager')==='Super Manager'`.
   Failing stub:
   test("roleLabel returns 'Super Manager' for super_manager", () => {
     throw new Error("NOT IMPLEMENTED — TDD stub for: roleLabel super_manager")
   })
3. Hybrid (live-DB, manual — known-gap for CI): promote transfer atomicity, manager-cannot-deactivate-manager (403), super_manager self-deactivate rejected, second active super_manager insert → 23505.
4. e2e team-page gating — Known-gap (no shared auth Playwright fixture, pre-accepted repo-wide).

### Strategy for EXECUTE
Sequential — 1 vc-execute-agent (opus). File-dependency chain (schema→migration→utils→db→api→ui→tests). Cost guard not triggered.
