# Team Member Profile Edit — Edit Button + Self-Service Name Edit + #227 Copy Fix

**Date**: 2026-07-07
**Complexity**: SIMPLE
**Feature**: team
**Plan path**: `process/features/team/active/team-member-profile-edit_07-07-26/team-member-profile-edit_PLAN_07-07-26.md`
**Status**: 🔨 CODE DONE (all 3 phases implemented; `check`/`lint`/`test:unit:ci` green; Hybrid live-DB + #227 browser gates pending manual verification)

---

## Quick Links

- [Overview](#overview)
- [Terminology Note (Card → Row)](#terminology-note-card--row)
- [Goals and Success Metrics](#goals-and-success-metrics)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Design Decisions](#design-decisions)
- [Scope](#scope)
- [Assumptions and Constraints](#assumptions-and-constraints)
- [Functional Requirements](#functional-requirements)
- [Acceptance Criteria (AC Mapping)](#acceptance-criteria-ac-mapping)
- [Implementation Checklist](#implementation-checklist)
- [Risks and Mitigations](#risks-and-mitigations)
- [Integration Notes](#integration-notes)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Out of Scope](#out-of-scope)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

---

## Overview

Team member profiles on `/team` are read-only after creation — there is no way to fix a
mistyped name, and reps have no way to edit their own name at all (the whole `/team` route
is manager-gated). This plan adds:

1. A per-row **Edit** button on `/team` that opens a small modal for editing a team
   member's **name** (managers+ editing anyone's row).
2. A new self-service **`/profile`** page reachable by any authenticated user (rep,
   manager, or super_manager) to edit their **own** name.
3. A fix for GitHub **#227** — the "Add a rep" copy on `/team` never reflects the
   selected role in the add-user modal, so picking "Manager" in the role dropdown still
   shows "Add a rep" everywhere.

Role changes and active/status changes already have dedicated, shipped UI on `/team`
(the promote/demote arrow buttons + confirm modal, and the Deactivate/Reactivate button) —
see [Design Decisions](#design-decisions) for why this plan does not duplicate those with a
second control inside the new Edit modal.

## Terminology Note (Card → Row)

The original GitHub ticket says "team member card." `/team` is implemented as a **table**
(`Table`/`TableRow` in `src/routes/team/+page.svelte`), not a card grid. This plan builds the
Edit affordance as a **per-row button** in the existing actions cell — no layout redesign.
Do not re-litigate this; it is a confirmed terminology mapping, not an open question.

---

## Goals and Success Metrics

| Goal | Metric |
|---|---|
| Managers can fix a team member's name after creation | Edit button on every `/team` row opens a working name-edit modal |
| Reps (and everyone else) can fix their own name | `/profile` loads for any authenticated user and PATCH succeeds for self |
| Role-change permission model stays exactly as shipped (#73) | No change to `updateUserRole`/`promoteSuperManager` gating; role field never appears in the new modals |
| #227 copy bug fixed | Header button, modal title, and submit button on the add-user modal all say "Manager" when role=manager is selected |
| No regressions | `bun run check` and `bun run lint` exit 0 |

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** — Works with other system pieces (existing deactivate/promote flows unaffected)
2. **Manual Test** — A manager can edit a name from `/team`, and a rep can edit their own name from `/profile`
3. **Data Verification** — `crm_users.name` row confirmed updated in DB
4. **Error Handling** — 403 on illegal self-edits (role/active) and on cross-user edits by non-managers
5. **User Confirmation** — User says "it works"

| Marker | Meaning |
|---|---|
| ⏳ PLANNED | Not started |
| 🔨 CODE DONE | Code written, NOT tested E2E |
| 🧪 TESTING | Code done, currently testing |
| ✅ VERIFIED | Tested AND user confirmed working |
| 🚧 BLOCKED | Has issues preventing completion |

---

## Execution Brief

**IMPORTANT:** This is a SIMPLE (one-session) plan — implement continuously without approval
gates beyond the standard RIPER-5 VALIDATE → EXECUTE gate. The phases below are logical
groupings for understanding flow, not stop points, but running `bun run check` after each
phase is cheap insurance.

### Phase 1 — Zod schema + PATCH endpoint

**What happens:** Add a narrow `userNameEditSchema` (name-only) to `src/lib/zod/schemas.ts`.
Extend `patchSchema` in `src/routes/api/users/[id]/+server.ts` to accept an optional `name`,
and add the self-edit branch so a self-targeted PATCH can only ever change `name` — `role`
and `active` are rejected (403) on self-edits regardless of the actor's role.

### Phase 2 — `/team` Edit modal + #227 fix

**What happens:** Add an Edit icon button to every `/team` row (visible when `canManage`),
wired to a new small Modal with a single Name field, using the existing
`fetch()` + `safeParse()` + `FieldError` convention. Separately, fix the three hardcoded
"Add a rep" copy occurrences to derive from the selected `role` state.

### Phase 3 — `/profile` self-service page

**What happens:** New `src/routes/profile/+page.server.ts` (loads for any authenticated
user, no manager gate) and `src/routes/profile/+page.svelte` (Name editable, email/role/
status read-only display), using the same schema + fetch convention as Phase 2.

### Test Gates

1. `bun run check` — exits 0 `[automated]`
2. `bun run lint` — exits 0 `[automated]`
3. `bun run test:unit:ci` — no regressions in existing 263+ passing tests `[automated]`
4. New unit test(s) for `userNameEditSchema` (and USER_ROLES-adjacent assertions if any) `[automated]`
5. Manual: manager edits another user's name from `/team`, row updates immediately `[hybrid — live DB]`
6. Manual: rep opens `/profile`, edits their own name, save persists `[hybrid — live DB]`
7. Manual: a crafted self-targeted PATCH with `{role: 'manager'}` or `{active: false}` → 403 `[hybrid — live DB / curl]`
8. e2e (Playwright) for role-gated `/team` and `/profile` behavior — **known-gap**, see
   [Verification Evidence](#verification-evidence) (no shared Playwright auth fixture yet)

### Expected Outcome

- `/team` row → Edit button → name-only modal → save → row reflects new name immediately
- `/profile` → any authenticated user can edit their own name; role/status shown read-only
- Add-user modal copy on `/team` correctly says "manager" vs "rep" based on the selected role
- `bun run check` and `bun run lint` both exit 0

---

## Design Decisions

These are locked calls made during planning — EXECUTE should implement them as-is, not
re-derive or second-guess them.

1. **Role-change permission is untouched and stays super_manager-only.** This matches the
   shipped, locked #73 spec (`super-manager-role_SPEC_02-07-26.md`) and is enforced in
   `src/routes/api/users/[id]/+server.ts` and `src/lib/server/db/users.ts`
   (`updateUserRole` throws unless `isSuperManager(actor)`). The ticket's own AC ("Role
   change is manager-only") is superseded by the locked super_manager-only model — do not
   loosen it. The new Edit modal and `/profile` page never expose a role control.

2. **The new Edit modal is name-only — it does not duplicate the existing status/role
   controls.** `/team` already ships dedicated, tested affordances for both:
   - Role change: the promote/demote arrow icon buttons (`isSuper && u.role === 'rep'/'manager'`)
     + `confirmRoleChange` modal + `applyRoleChange()` (`+page.svelte` lines ~330–349, ~472–495).
   - Status change: the Deactivate/Reactivate button + `toggleActive()` (`+page.svelte`
     lines ~362–375, ~118–148).
   Adding role/status controls to a third modal would create two ways to mutate the same
   field with no added value and real risk of UX/state drift. The ticket's ACs "Name and
   status fields are editable by managers" and "Role change is manager-only" are satisfied
   by: name → the new Edit modal (this plan); status → the existing Deactivate/Reactivate
   button (already shipped); role → the existing promote/demote flow (already shipped,
   permission model locked per #73). **Do not re-implement status or role editing as part of
   this plan.**

3. **Self-edit permission enforcement lives inline in the PATCH endpoint, not as a new
   `users.ts` helper.** `src/lib/server/db/users.ts` already has `deactivateUser`,
   `reactivateUser`, and `updateUserRole` functions with the "load actor+target, check
   permission, throw `PermissionError`" shape — but **none of them are actually called from
   `src/routes/api/users/[id]/+server.ts`** (confirmed via `grep -rn` across `src/` —
   only `promoteSuperManager` is wired, from the separate `promote-super` sub-route). The
   generic `PATCH /api/users/[id]` endpoint does its own raw inline `db.update(crmUsers)...`
   with inline role/active permission checks, bypassing those `users.ts` functions entirely.
   This plan follows the endpoint's **actual, current** convention (inline checks + one raw
   update) for the new `name` field, rather than introducing a new `users.ts` function that
   would be the *only* one actually wired in, deepening an existing inconsistency. **This is
   a pre-existing wiring gap, not something this plan fixes** — flagged below under
   [Out of Scope](#out-of-scope) as a recommended follow-up backlog note.

4. **Both the `/team` Edit modal and `/profile` reuse the same PATCH endpoint and the same
   narrow Zod schema** (`userNameEditSchema` — name only). The endpoint tells the two cases
   apart by comparing `params.id` to `locals.user.id` (self vs. other), not by the caller's
   route.

---

## Scope

### In Scope

- `userNameEditSchema` (name-only Zod schema) in `src/lib/zod/schemas.ts`
- `PATCH /api/users/[id]` — accept optional `name`; self-edit branch (name-only, server-enforced)
- `/team` — Edit icon button per row + name-edit Modal + `saveEditName()` handler
- `/team` — #227 copy fix (3 hardcoded "Add a rep" occurrences → derived from `role` state)
- New `/profile` route (`+page.server.ts` + `+page.svelte`) — self-service name edit, any authenticated user
- Small polish check on `RouteShells.svelte` skeleton subtitle (see checklist item 10 — confirmed non-issue, no functional change expected)

### Out of Scope

See [Out of Scope](#out-of-scope) section below (kept separate per plan convention — do not
fold into In Scope).

---

## Assumptions and Constraints

- `locals.user` is populated by the real Better Auth session gate in `hooks.server.ts` for
  any protected route — `/profile` needs no manager-role gate, only an authenticated-session
  check (mirroring how `/team`'s own `+page.server.ts` checks `if (!locals.user)` before its
  additional manager-role check).
- `sessionToUser()` (exported from `src/lib/server/db/users.ts`) is reused to build the
  `/profile` load's `currentUser` — same helper the `/team` page load already uses.
- No new dependencies, no schema/migration changes, no new DB columns.
- The existing `patchSchema` in `[id]/+server.ts` combining `role`/`active` in one raw
  update is left structurally as-is; this plan only adds `name` alongside it.

---

## Functional Requirements

1. `PATCH /api/users/[id]` accepts `{ name?: string; role?: Role; active?: boolean }` (all optional).
2. When `params.id === locals.user.id` (self-edit): `role` and `active` in the body are
   **rejected with 403** even if present — only `name` may change. This applies regardless
   of the actor's own role (a super_manager hitting their own row through this endpoint
   still cannot self-promote/self-deactivate through it).
3. When editing another user's row: `name` requires the actor to be `manager` or
   `super_manager` (`isManagerRole`); existing `role`/`active` permission checks are
   unchanged.
4. `/team` Edit modal: visible to any user for whom `canManageUsers(data.currentUser)` is
   true (i.e. `canManage` — already computed in `+page.svelte`). Submits `{ name }` only.
5. `/profile`: loads for any authenticated user regardless of role. Displays name
   (editable), email/role/status (read-only). Submits `{ name }` only, PATCHing their own id.
6. On successful save in either surface: `invalidateAll()` so the row/page reflects the new
   name immediately (per AC "Changes persist on save and reflect in the card immediately").
7. #227 fix: the header "Add a rep" button, the add-user modal title, and the modal's submit
   button all derive their copy from the currently-selected `role` state
   (`role === 'manager' ? 'Add a manager' : 'Add a rep'`), instead of being hardcoded.

---

## Acceptance Criteria (AC Mapping)

Mapping the original ticket's ACs to concrete implementation items — explicit so nobody
re-litigates the "card"→"row" or role/status interpretation later:

| Ticket AC | Implementation |
|---|---|
| Edit button visible on team member **cards** | New Edit icon button on every `/team` **row** (table, not card grid — see [Terminology Note](#terminology-note-card--row)) |
| Name and status fields are editable by managers | **Name**: new Edit modal (this plan). **Status**: already editable via the existing Deactivate/Reactivate button (shipped) — not re-implemented (see [Design Decisions](#design-decisions) #2) |
| Role change is manager-only | Superseded by the locked #73 model: role change is **super_manager-only**, already shipped via the promote/demote arrow buttons — not re-implemented, not loosened (see [Design Decisions](#design-decisions) #1) |
| AE can edit their own name only | New `/profile` page; server-enforced self-edit branch rejects role/active on self-targeted PATCHes |
| Changes persist on save and reflect in the card immediately | `invalidateAll()` after a successful PATCH on both `/team` and `/profile` |
| `bun run check` + `bun run lint` exit 0 | Test Gates 1–2 |
| (Related) #227 "adding manager button still says add rep" | 3 hardcoded copy sites in `+page.svelte` fixed to derive from `role` state |

---

## Implementation Checklist

> Execute in order. Run `bun run check` after each phase.

### Phase 1 — Zod schema + PATCH endpoint  — 🔨 CODE DONE

1. `src/lib/zod/schemas.ts` — add, near `userFormSchema` (after line 263):
   ```ts
   // --- Edit an existing team member's name (managers editing others, or self) ---
   export const userNameEditSchema = userFormSchema.pick({ name: true });
   export type UserNameEditForm = z.infer<typeof userNameEditSchema>;
   ```
2. `src/routes/api/users/[id]/+server.ts`:
   - Add `name: z.string().min(1).optional()` to `patchSchema` (currently lines 11–14).
   - Destructure `name` alongside `role`/`active` (currently line 22).
   - Add an `isSelf = params.id === locals.user.id` check and branch:
     - If `isSelf`: if `role !== undefined || active !== undefined` → `throw error(403, 'You cannot change your own role or status')`.
     - Else (editing someone else): keep the existing `role`/`active` checks unchanged; add
       `if (name !== undefined && !isManagerRole(locals.user.role)) throw error(403, 'Forbidden')`.
   - Add `...(name !== undefined ? { name } : {})` to the `.set({...})` object (currently lines 36–40).
3. `bun run check` — zero errors before continuing.

### Phase 2 — `/team` Edit modal + #227 fix  — 🔨 CODE DONE

> **EXECUTE note (item 8 placement deviation):** the `addLabel` `$derived` was placed
> immediately after the `role = $state('rep')` declaration (line ~78), NOT near the other
> `$derived`s at line ~33 as the checklist text suggested — putting it at line ~33 caused a
> compile error (`Block-scoped variable 'role' used before its declaration`, TDZ). Same
> intent, correct location. Item 7 Edit-name Modal was placed after all three existing modals
> (per the V2b non-blocking placement nit), reading cleanest.

4. `src/routes/team/+page.svelte` — add state (near existing `confirmRoleChange`/`promoteTarget` state, ~line 151):
   ```ts
   let editTarget = $state<User | null>(null);
   let editName = $state('');
   let editSaving = $state(false);
   let editFieldErrors = $state<Record<string, string[] | undefined>>({});
   ```
5. Add `openEdit(u: User)` (sets `editTarget = u; editName = u.name; editFieldErrors = {};`)
   and `async function saveEditName()` mirroring the existing `applyRoleChange()`/`toggleActive()`
   shape: `userNameEditSchema.safeParse({ name: editName })` → on fail set `editFieldErrors`;
   on success `fetch(\`/api/users/${editTarget.id}\`, { method: 'PATCH', body: JSON.stringify({ name: editName }) })`
   → handle non-ok (403/404) via `toasts.push(...)`; on success `editTarget = null`,
   `await invalidateAll()`, `toasts.success(...)`.
6. In the row actions cell (inside the existing `{#if canManage}` block, ~line 327), add an
   Edit icon button as the first action (mirrors the `unassigned/+page.svelte` edit-button
   pattern but uses this file's own `Button variant="outline" size="icon"` convention already
   used for Promote/Demote/Crown):
   ```svelte
   <Button variant="outline" size="icon" title="Edit name" onclick={() => openEdit(u)}>
     <Icon name="edit" size={14} stroke={2.2} />
   </Button>
   ```
7. Add a new `<Modal>` block (mirroring the existing add-rep Modal structure, ~after line 495):
   title `Edit name`, single Name `Input` + `FieldError` bound to `editFieldErrors.name`,
   footer Cancel/Save (`disabled={editSaving}`, label `Saving…` while saving).
8. #227 fix — add `const addLabel = $derived(role === 'manager' ? 'Add a manager' : 'Add a rep');`
   near the other `$derived`s (~line 33) and replace the three hardcoded occurrences:
   - Header button text, line ~228: `Add a rep` → `{addLabel}`
   - Add-user Modal `title` prop, line ~425: `"Add a rep"` → `{addLabel}`
   - Submit button text, line ~468: `Add rep` → `{addLabel}` (note: normalizes this button's
     copy from "Add rep" to "Add a rep"/"Add a manager" for consistency with the other two —
     a deliberate small copy tweak, not a regression)
9. `bun run check` — zero errors.

### Phase 3 — `/profile` self-service page  — 🔨 CODE DONE

10. Confirm-only, no code change expected: inspect `src/lib/components/shared/skeletons/RouteShells.svelte`
    line ~153 (`isTeam` branch `subtitle`). It is a static, role-agnostic copy string
    ("This list is the magic-link allowlist. Add a rep here and they can sign in.") that
    mirrors the real page's own static subtitle (`+page.svelte` line ~223) — **not** part of
    the #227 role-toggle bug (neither instance ever varied by role; both are the page
    subtitle, unrelated to the add-user button/modal). Leave unchanged; note in the phase
    report that this was inspected and confirmed to be a non-issue.
11. Create `src/routes/profile/+page.server.ts`:
    ```ts
    import type { PageServerLoad } from './$types';
    import { error } from '@sveltejs/kit';
    import { sessionToUser } from '$lib/server/db/users';

    export const load: PageServerLoad = async ({ locals }) => {
      if (!locals.user) error(401, 'Unauthorized');
      return { currentUser: sessionToUser(locals.user) };
    };
    ```
    No role gate — any authenticated, allowlisted user (rep/manager/super_manager) may load this page.
12. Create `src/routes/profile/+page.svelte`:
    - `let { data } = $props();`
    - `let name = $state(data.currentUser.name); let saving = $state(false); let fieldErrors = $state<Record<string, string[] | undefined>>({});`
    - `async function save()` — same `userNameEditSchema.safeParse({ name })` → fetch
      `PATCH /api/users/${data.currentUser.id}` with `{ name }` → on success `invalidateAll()`
      (re-runs load, refreshing `data.currentUser.name`) + `toasts.success('Profile updated')`.
    - Read-only display: `data.currentUser.email`, `roleLabel(data.currentUser.role)`,
      `statusLabel(data.currentUser.active)` (reuse `$lib/utils/roles` helpers already used
      on `/team`).
    - Reuse `Input`, `Label`, `FieldError`/`fieldErrorAttrs`, `Button`, `Card` — same import
      set as `/team`'s add-rep form, for visual/behavioral consistency.
13. `bun run check` — zero errors.
14. `bun run lint` — zero errors.
15. `bun run test:unit:ci` — all existing tests still green.
16. Add a small unit test in `src/tests/schemas.spec.ts` (existing file — read its style
    first, e.g. the `describe('super_manager role (GitHub #73)', ...)` block at line ~104)
    asserting `userNameEditSchema.safeParse({ name: '' })` fails and
    `userNameEditSchema.safeParse({ name: 'Marites' })` succeeds.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Adding `name` to the shared `patchSchema` accidentally weakens the existing role/active guards | Self-edit branch is checked FIRST and is exclusive (role/active always rejected on self); non-self branch keeps the existing role/active checks byte-for-byte, only adding a new `name` check |
| A malicious client PATCHes their own id with `{role: 'super_manager', name: 'x'}` hoping only role is checked | The self-edit branch rejects the WHOLE request (403) if `role` or `active` is present at all — it does not silently strip them and apply `name` alone. Confirm this exact behavior in EXECUTE and the manual test gate |
| Two UI paths (Edit modal + Deactivate button) both able to touch `active` causes confusion | Avoided entirely — the new Edit modal is name-only, never sends `active` (see Design Decisions #2) |
| `/profile` accidentally requires manager role (copy-paste from `/team`'s load function) | `+page.server.ts` for `/profile` must NOT call `isManagerRole` — only the `locals.user` existence check, confirmed in checklist item 11 |
| Existing `deactivateUser`/`reactivateUser`/`updateUserRole` dead-code-wiring gap gets "fixed" as a drive-by, expanding blast radius | Explicitly out of scope (Design Decisions #3, Out of Scope) — do not touch those functions or their call sites in this plan |

---

## Integration Notes

- `sessionToUser()` — `src/lib/server/db/users.ts` — reused unchanged for `/profile`'s load, same as `/team`.
- `isManagerRole` — `src/lib/utils/permissions.ts` — reused unchanged for the non-self name-edit permission check in the PATCH endpoint. No new permission helper is needed (self-edit is a plain `params.id === locals.user.id` comparison, not a role predicate).
- `roleLabel`/`statusLabel` — `src/lib/utils/roles.ts` — reused for `/profile`'s read-only display, same helpers `/team` already uses.
- `FieldError`/`fieldErrorAttrs` — `src/lib/components/ui/field-error/` — reused exactly as used at `+page.svelte:437–439, 448–450` for both new forms.
- `Modal` — `src/lib/components/shared/Modal.svelte` — reused for the `/team` Edit modal (existing `open`/`title`/`onclose`/`footer` snippet API, unchanged).
- `userFormSchema` — `src/lib/zod/schemas.ts` — `.pick({ name: true })` reused to derive `userNameEditSchema` (DRY: keeps the `'Name is required'` message in one place).

---

## Touchpoints

| File | Change type | Notes |
|---|---|---|
| `src/lib/zod/schemas.ts` | **EDIT** | Add `userNameEditSchema` (`.pick` off `userFormSchema`) |
| `src/routes/api/users/[id]/+server.ts` | **EDIT** | Add `name` to `patchSchema`; add self-edit branch; add `name` to the update `.set({...})` |
| `src/routes/team/+page.svelte` | **EDIT** | Edit icon button + name-edit Modal + `saveEditName()`; #227 copy fix (3 sites) |
| `src/routes/profile/+page.server.ts` | **NEW** | Load for any authenticated user; `sessionToUser()` |
| `src/routes/profile/+page.svelte` | **NEW** | Self-service name edit; read-only email/role/status |
| `src/lib/components/shared/skeletons/RouteShells.svelte` | **READ (no change expected)** | Confirm-only inspection of line ~153, see checklist item 10 |
| `src/tests/schemas.spec.ts` | **EDIT** | New unit test for `userNameEditSchema` |
| `src/lib/utils/permissions.ts` | **READ** | `isManagerRole` reused, no change |
| `src/lib/server/db/users.ts` | **READ** | `sessionToUser` reused, no change; `deactivateUser`/`reactivateUser`/`updateUserRole` explicitly NOT touched |

---

## Public Contracts

| Contract | Details |
|---|---|
| `PATCH /api/users/[id]` | Body now `{ name?: string; role?: Role; active?: boolean }` (all optional). New behavior: if `params.id === locals.user.id`, `role`/`active` in the body → 403; only `name` may change on self. Non-self behavior for `role`/`active` unchanged. Response unchanged: `User` JSON via `dbUserToUser`. |
| `userNameEditSchema` | `z.object({ name: string (min 1, 'Name is required') })` — exported from `src/lib/zod/schemas.ts` |
| `GET /profile` (page load) | New route. Loads for any authenticated user (no role gate). Returns `{ currentUser: User }` |
| `crm_users` DB schema | No schema changes |

---

## Blast Radius

- **Files changed:** 4 edits + 2 new (+ 1 read-only confirm-inspection, no diff expected)
- **Packages:** single SvelteKit app — `src/lib/zod/`, `src/routes/api/users/[id]/`, `src/routes/team/`, new `src/routes/profile/`, `src/tests/`
- **Risk class:** auth/permission-adjacent (the shared `PATCH /api/users/[id]` endpoint gains a new field and a new branch) but **not** a schema/migration change, **not** a new API surface (existing endpoint extended), and does **not** touch the locked #73 role-change permission model. Primary risk is regressing the existing role/active guards on that shared endpoint — mitigated by keeping the non-self branch byte-for-byte unchanged and adding the self-edit branch as a separate, exclusive check first.
- **Regression surfaces:** `/team` page (existing Deactivate/Reactivate + promote/demote flows must keep working unchanged), the shared PATCH endpoint (existing role/active callers: `applyRoleChange()`, `toggleActive()`).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | No type regressions from new schema/route |
| `bun run lint` exits 0 | Fully-Automated | Ticket AC — `bun run lint` exit 0 |
| `bun run test:unit:ci` — all existing tests green | Fully-Automated | No regressions |
| New `userNameEditSchema` unit test (empty name fails, valid name passes) | Fully-Automated | New schema behaves as specified |
| Manual: manager edits another user's name from `/team`, row updates immediately | Hybrid (live DB) | AC "Name... editable by managers" + "reflect... immediately" |
| Manual: rep opens `/profile`, edits own name, save persists | Hybrid (live DB) | AC "AE can edit their own name only" |
| Manual: rep's `/profile` PATCH crafted with `{role:'manager'}` or `{active:false}` → 403 | Hybrid (live DB / curl) | Self-edit hardening — role/active never mutate via self-edit |
| Manual: non-manager attempts `PATCH /api/users/[otherId]` with `{name}` → 403 | Hybrid (live DB / curl) | Only managers+ can edit others' names |
| Manual: existing Deactivate/Reactivate + promote/demote flows still work unchanged | Hybrid (live DB) | Regression guard — Design Decision #2 (no duplicate controls) |
| Manual: add-user modal — select "Manager" role, header/title/submit all say "manager" | Manual (browser) | #227 fix |
| e2e (Playwright) for `/team` Edit modal and `/profile` role-gating | Known-gap | No shared authenticated-session Playwright fixture yet — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Any e2e spec added for this surface must self-skip against the protected-route redirect per the existing `loading-ux.e2e.ts`/`calendar.e2e.ts` pattern (see `process/context/tests/all-tests.md` §Debugging Quick Reference) |

**Explicit test-coverage callout (per task instructions):** the known e2e-auth-fixture gap
means Playwright cannot exercise the role-gated behavior end-to-end this cycle. This is
called out here as a known-gap, not silently omitted — VALIDATE should carry it into the
validate-contract's gap-resolution rather than treat it as missing/forgotten coverage.

---

## Test Infra Improvement Notes

(none identified yet — updated during EVL if test infrastructure gaps are found)

---

## Out of Scope

- **Audit trail for user profile changes.** `crm_lead_history` is lead-scoped only; this
  plan does not add a `crm_user_history` table or any equivalent. Name changes are not
  logged anywhere beyond `updatedAt`.
- **Reopening the #73 role-change permission matrix.** Role change stays super_manager-only.
  Do not add a "manager can change role" path even though the original ticket's AC implied it.
- **Loosening `/team`'s manager-only page gate.** `/team` remains gated to
  `isManagerRole(locals.user.role)` in `+page.server.ts`. Rep self-edit is solved via the
  separate `/profile` route, not by opening `/team` to reps.
- **Any card-grid redesign of `/team`.** It stays a table; see [Terminology Note](#terminology-note-card--row).
- **Fixing the pre-existing `deactivateUser`/`reactivateUser`/`updateUserRole` dead-code
  wiring gap** discovered during planning (these `users.ts` functions — including the
  lead-reassignment-on-deactivate transaction — are never actually called; the PATCH
  endpoint does its own raw update instead). This is a real, separate issue worth a backlog
  note, but fixing it is out of scope here — it would expand blast radius into the existing,
  shipped deactivate/reactivate/role-change flows this plan explicitly must not regress.
  **Recommended follow-up:** file `process/features/team/backlog/patch-endpoint-users-ts-wiring-gap_NOTE_07-07-26.md`
  during UPDATE PROCESS if not already tracked elsewhere.
- **A nav link/menu entry to `/profile`.** The route is directly navigable
  (`/profile`) but this plan does not add a header/nav affordance to reach it. Acceptable
  for v1 discoverability; flag as a fast-follow if the user wants it surfaced in the nav.
- **Adding a status (active) toggle or role field to the new Edit modal or `/profile`.** See
  Design Decisions #2 — these already have dedicated, shipped UI.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/team/active/team-member-profile-edit_07-07-26/team-member-profile-edit_PLAN_07-07-26.md`
2. **Last completed phase:** EXECUTE — all 3 phases 🔨 CODE DONE (2026-07-07). Files changed:
   `src/lib/zod/schemas.ts` (added `userNameEditSchema`), `src/routes/api/users/[id]/+server.ts`
   (added `name` to `patchSchema` + self-edit branch + non-self name-requires-manager check + `name`
   in `.set`), `src/routes/team/+page.svelte` (Edit icon button + `openEdit`/`saveEditName` +
   Edit-name Modal + #227 `addLabel` fix at 3 sites), `src/tests/schemas.spec.ts` (new
   `userNameEditSchema` describe block). New files: `src/routes/profile/+page.server.ts`,
   `src/routes/profile/+page.svelte`. `RouteShells.svelte` inspected, confirmed non-issue, unchanged.
3. **Validate-contract status:** written 2026-07-07 — `Gate: PASS` (one accepted, non-blocking Security concern; see [Validate Contract](#validate-contract)). Cleared for EXECUTE.
   **EXECUTE result:** automated gates green — `bun run check` 0 errors, `bun run lint` 0 errors,
   `bun run test:unit:ci` 400 passed / 148 skipped (+2 new schema tests, no regressions).
   Pending manual/Hybrid verification (no live DB / shared Playwright auth fixture in this session):
   Test Gates 5–11 (manager edits another's name, rep self-edit via `/profile`, crafted self-edit
   `{role}`/`{active}` → 403, non-manager cross-user rename → 403, deactivate/promote regression,
   #227 browser check, e2e known-gap). One accepted-concern backlog note (actor-role-only permission
   check on non-self name/active edits) to be filed in UPDATE PROCESS.
4. **Supporting context files loaded during planning:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - `process/context/planning/all-planning.md`
   - `process/features/team/active/super-manager-role_02-07-26/super-manager-role_PLAN_02-07-26.md` (shape/tone reference + locked #73 permission model)
   - `process/features/team/active/super-manager-role_02-07-26/super-manager-role_SPEC_02-07-26.md` (locked role matrix — do not reopen)
   - `process/features/team/active/team-invite_30-06-26/team-invite_PLAN_30-06-26.md` (shape/tone reference)
   - `src/routes/team/+page.svelte`, `+page.server.ts`
   - `src/routes/api/users/[id]/+server.ts`, `src/routes/api/users/[id]/promote-super/+server.ts`
   - `src/lib/server/db/users.ts`, `src/lib/utils/permissions.ts`, `src/lib/utils/roles.ts`
   - `src/lib/zod/schemas.ts`, `src/lib/server/db/schema.ts` (crm_users table)
   - `src/lib/components/shared/Modal.svelte`, `src/lib/components/ui/field-error/`
   - `src/routes/unassigned/+page.svelte` (edit-button + `editTarget`/`saveEdit()` UI precedent)
   - `src/lib/components/shared/skeletons/RouteShells.svelte`
   - `src/tests/schemas.spec.ts`
5. **Key confirmed-during-planning fact for the next agent:** `deactivateUser`,
   `reactivateUser`, and `updateUserRole` in `users.ts` are NOT called anywhere in `src/`
   (verified via `grep -rn` across `src/`) — the generic PATCH endpoint uses its own inline
   raw update instead. Do not assume calling these functions is required or even currently
   wired; this plan's Phase 1 edits the endpoint's existing inline logic directly (see
   Design Decisions #3).
6. **Next step for fresh executor:** EXECUTE complete (all automated gates green). Remaining:
   run the Hybrid live-DB manual gates (Test Gates 5–11) once a live DB / running app is available,
   then EVL confirmation + UPDATE PROCESS (file the accepted-concern backlog note and the
   `deactivateUser`/`reactivateUser`/`updateUserRole` dead-code-wiring backlog note per Out of Scope).

---

## Validate Contract

**generated-by:** outer-pvl
**date:** 2026-07-07
**Gate:** PASS

### V1 — Structural Check

All required sections present: Design Decisions, Scope, Out of Scope, Touchpoints, Public
Contracts, Blast Radius, Verification Evidence, Resume and Execution Handoff. No `## Inner Loop
Refresh Note` exists (first-pass outer-loop SIMPLE plan, not a phase-program inner loop). PASS.

### V2 — Layer 1 Dimension Findings

**Dimension: Infra**
Status: PASS
Findings:
- `PATCH /api/users/[id]` extension (new optional `name` field + self-edit branch) fits the
  existing SvelteKit `+server.ts` RequestHandler convention exactly — no new route, no new
  runtime surface.
- New `/profile` route (`+page.server.ts` + `+page.svelte`) follows the identical
  load-function shape already used by every other protected route (`if (!locals.user) error(401/redirect)`).
  No new env vars, no new deploy config, no new dependency.
- No schema/migration change — confirmed against `src/lib/server/db/schema.ts` `crmUsers` table
  (name/email/role/active/authSubject only — plan does not touch this).
Confidence: HIGH

**Dimension: Test coverage**
Status: PASS
Findings:
- Tier assignments in the plan's Verification Evidence table are correctly assigned per the
  `vc-test-coverage-plan` waterfall: Fully-Automated for `bun run check`/`bun run lint`/
  `bun run test:unit:ci`/new schema unit test; Hybrid (live DB) for the manager-edits-other,
  rep-edits-self, and the two crafted-403 self-edit scenarios; Manual (browser) for the #227
  copy fix; Known-gap for e2e role-gating.
- This plan's blast radius is an **auth/permission-adjacent** high-risk class (per
  `vc-test-coverage-plan` §High-Risk Classes) — the minimum required tier is Hybrid, and the
  plan correctly assigns Hybrid (not known-gap) to both self-edit-hardening scenarios (gates 7–8
  in the Verification Evidence table). Requirement satisfied.
- Cross-checked the e2e known-gap against `process/context/tests/all-tests.md` — confirmed
  current, accurate: "There is NO Playwright auth-bootstrap mechanism... every e2e spec that
  `goto()`s a protected route redirects to `/login` and must self-skip." The plan's known-gap
  rationale (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) is the correct,
  live backlog reference — not stale.
- `bun run test:unit:ci` regression baseline ("263+ passing tests") matches `all-tests.md`'s
  recorded count (263 passed / 70 skipped as of 2026-07-01).
Confidence: HIGH

**Dimension: Breaking changes**
Status: PASS
Findings:
- Read the actual current `src/routes/api/users/[id]/+server.ts` (47 lines). The plan's
  described current behavior is byte-accurate: `patchSchema` at lines 11–14, destructure at
  line 22, role-check at line 25 (`locals.user.role !== 'super_manager'`), active-check at line
  30 (`isManagerRole`), `.set({...})` at lines 36–40. No drift between plan prose and file.
- Checked both existing callers of this endpoint (`applyRoleChange()` and `toggleActive()` in
  `src/routes/team/+page.svelte`) and the separate `promote-super` sub-route
  (`src/routes/api/users/[id]/promote-super/+server.ts`, uses `promoteSuperManager()` — a
  different function entirely, unaffected by this plan).
- Neither existing caller ever targets `locals.user`'s own id with `role` or `active` in the
  body: `applyRoleChange()`'s promote/demote arrow buttons never render on the actor's own row
  (role-based UI gating: arrows only show for `role === 'rep'`/`'manager'` rows, never on a
  `super_manager`'s own `super_manager`-role row), and `toggleActive()`'s button is explicitly
  gated `u.role === 'rep' || (isSuper && !isSelf)` — self is already excluded in the UI. Grepped
  `src/` for all `/api/users/` fetch call sites (3 total, all in `+page.svelte`) — confirmed
  exhaustive, no other caller exists.
- Conclusion: the new self-edit branch (reject the whole request if `role`/`active` present on
  a self-targeted PATCH) has **zero interaction surface** with existing callers — it only
  activates on a request shape (self-targeted + role/active present) that no shipped caller ever
  produces. It is a net-new hardening, not a regression risk. It also *closes* a pre-existing gap
  (before this plan, a crafted self-targeted PATCH with `{active: false}` would have succeeded
  server-side, since the current code only checks `isManagerRole`, not self-vs-other) — a
  positive side effect, correctly noted in the plan's Risks table.
Confidence: HIGH

**Dimension: Security**
Status: CONCERN (non-blocking)
Findings:
- The self-edit branch design (reject whole request if `role`/`active` present on self-PATCH)
  does correctly close the privilege-escalation risk in the plan's Risks table — confirmed by
  code-level trace above. PASS on that specific question.
- **New finding, not previously flagged in the plan:** the non-self name-edit permission check
  (`if (name !== undefined && !isManagerRole(locals.user.role)) throw error(403)`) checks only
  the **actor's** role, not the **target's** role. This means a plain `manager` (not
  `super_manager`) can rename another `manager`'s row or the `super_manager`'s own row via a
  crafted `PATCH {name}` — the Edit modal itself is gated only by `canManage` (=`isManagerRole`,
  true for both manager and super_manager) and shows on every row, including super_manager rows.
  Severity: **low** — this is cosmetic (a display name), not a permission/data-access change, and
  it exactly mirrors the pre-existing `active`-toggle check on this same endpoint (line 30 also
  only checks `isManagerRole`, not target role — the UI hides the Deactivate button for
  manager/super rows unless the actor `isSuper`, but the server itself has never enforced that
  restriction). This plan does not introduce a new class of gap; it extends an existing
  server-side permission granularity gap to one more field. Recommend accepting as a documented
  known-gap for this plan (name changes are low-stakes) with a backlog note recommending the
  `active`/`name` non-self checks both be tightened to require `isSuperManager` when the target's
  role is `manager` or `super_manager` — filed as a follow-up, not blocking this plan.
- New `/profile` route's load function (`sessionToUser(locals.user)`) returns only the caller's
  own `{id, email, name, role, active: true}` — confirmed via `src/lib/server/db/users.ts:240-247`.
  No leak beyond the user's own row; no manager-role gate needed since it exposes nothing but
  the caller's own data. PASS.
Confidence: HIGH

### V2b — Layer 2 Feasibility (spot-check)

Read `src/routes/api/users/[id]/+server.ts` current source directly (not just the plan's prose)
to confirm line-number references. Result: every line reference in the plan's Implementation
Checklist Phase 1 (lines 11–14, 22, 36–40) is exact. Also spot-checked every `src/routes/team/+page.svelte`
line reference in Design Decisions #2 and the Implementation Checklist (state block ~151,
`{#if canManage}` block at exactly line 327, `$derived`s at line 33, header button text at
exactly line 228, add-user Modal `title` at exactly line 425, submit button text at exactly line
468, `FieldError` usage at exactly lines 437–439/448–450, `confirmRoleChange` Modal at exactly
lines 472–495, `toggleActive()` at lines 118–148, Deactivate/Reactivate button at exactly lines
362–375) — all confirmed exact against the live file. `RouteShells.svelte` line ~153 (checklist
item 10) also confirmed exact and confirmed a non-issue (static, role-agnostic subtitle string).
No mechanical-feasibility gaps found; no VC-FEASIBILITY-PROBE-NEEDED triggers (nothing in this
plan hinges on unverified runtime/network/third-party behavior — it is pure in-repo CRUD logic).

One minor placement nit (non-blocking): checklist item 7 says to add the new Edit-name Modal
"~after line 495," which is between the existing `confirmRoleChange` Modal (ends 495) and the
`promoteTarget` Modal (497–513) rather than after all three existing modals. Cosmetic only —
does not affect behavior; EXECUTE may place it wherever reads cleanest (e.g. after line 513).

### V3 — Net Gate Synthesis

No FAILs. One non-blocking Security CONCERN (manager-can-rename-any-row via crafted request,
low severity, exactly mirrors an already-shipped gap on the `active` field, backlog-worthy but
not a regression this plan introduces). One cosmetic Layer-2 nit (modal insertion point).

**Gate: PASS** — proceed to EXECUTE. The CONCERN is accepted as a documented, low-severity,
pattern-consistent gap; it does not block EXECUTE.

### Accepted Concerns (carried into EXECUTE / UPDATE PROCESS)

1. **Non-self name-edit check is actor-role-only, not target-role-aware** (mirrors the
   pre-existing `active`-toggle gap on the same endpoint). Recommend EXECUTE proceed as planned;
   recommend UPDATE PROCESS file a backlog note (e.g.
   `process/features/team/backlog/patch-endpoint-actor-only-permission-gap_NOTE_07-07-26.md`)
   covering both the `name` and pre-existing `active` actor-only checks together, alongside the
   already-flagged `deactivateUser`/`reactivateUser`/`updateUserRole` dead-code-wiring backlog
   item from this same plan's Out of Scope section.
2. **e2e known-gap** — no shared Playwright authenticated-session fixture exists yet
   (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Confirmed current and
   accurate against `process/context/tests/all-tests.md`. Accepted as known-gap per plan.

### Test Gates EXECUTE Must Run

1. `bun run check` — exits 0
2. `bun run lint` — exits 0
3. `bun run test:unit:ci` — no regressions (baseline: 263 passed / 70 skipped)
4. New unit test(s) for `userNameEditSchema` in `src/tests/schemas.spec.ts` (empty name fails,
   valid name passes) — part of `test:unit:ci` above once added
5. Manual (Hybrid, live DB): manager edits another user's name from `/team` — row updates
   immediately via `invalidateAll()`
6. Manual (Hybrid, live DB): rep opens `/profile`, edits own name, save persists
7. Manual (Hybrid, live DB / curl): crafted self-targeted PATCH with `{role:'manager'}` or
   `{active:false}` → 403, whole request rejected (not silently stripped)
8. Manual (Hybrid, live DB / curl): non-manager attempts `PATCH /api/users/[otherId]` with
   `{name}` → 403
9. Manual (Hybrid, live DB): existing Deactivate/Reactivate + promote/demote flows still work
   unchanged (regression guard)
10. Manual (browser): add-user modal — select "Manager" role, header/title/submit all say
    "manager" (#227 fix)
11. e2e (Playwright) — known-gap, accepted, see Accepted Concerns #2 above

---

_Validated 2026-07-07 by vc-validate-agent. PHASE_COMPLETE: VALIDATE — Gate: PASS._
