---
name: plan:templates-open-edit-delete
description: "Remove manager role-gating from template EDIT and DELETE (delete-all) — API guards + UI conditionals + copy + inverted guard tests (GitHub #276)"
date: 08-07-26
feature: leads
---

# Templates Editable by All Users — PLAN (GitHub #276)

- **Date**: 08-07-26
- **Status**: Active
- **Complexity**: SIMPLE

**TL;DR:** Pure permission-guard removal. On the templates API (PATCH + DELETE), swap the two
`requireManager()` calls for an auth-only `if (!locals.user) throw error(401)` guard (removes the
manager gate, keeps the authentication gate), drop the `canManage` UI gating (6 usages + the derived
var + its `isManager` import), fix two copy strings, and invert two guard tests to expect success
instead of 403 (plus a new unauth-401 assertion). No schema, no query, no design decisions
remaining. Delete scope = **delete-all** (locked).

## Overview

GitHub #276 asks that all authenticated users can create, edit, and delete message templates.
Create is already open (shipped by #199). This plan removes the manager-only gate from **edit**
(PATCH) and **delete** (DELETE) at both the API and UI layers, and updates the now-false
"manager-only" copy — while preserving the authentication requirement (still 401 for no user).

Classification: **SIMPLE** (single-session, ~6 atomic edits across 3 files, no schema/query/design work).

## Goals

- All authenticated users can edit any existing template (API + UI).
- All authenticated users can delete any template — **delete-all**, not delete-own (locked decision).
- Authentication still required — an unauthenticated PATCH/DELETE still returns 401 (never opened up).
- No stale "manager-only" copy remains on the templates page.
- Guard tests reflect the new open contract.

## Scope

**In scope:** replacing role-gating with an auth-only guard on the 2 template-CRUD API write verbs
(PATCH, DELETE) and removing the 6 UI `canManage` conditionals + derived var + import; copy fixes;
inverting the 2 guard tests + adding an unauth-401 assertion.

**Out of scope (explicit — do not touch):**
- Create path, `templateFormSchema` (no role logic there), read path.
- `crm_message_templates` table structure; surfacing `createdBy` to the client; any owner-based
  permission logic (delete-all was chosen precisely to avoid this).
- `requireManager()` / `isManager()` **helper definitions** — still used elsewhere in the app for
  other manager-only features. Only their *usage at the template-CRUD call sites* is removed.

## Touchpoints

| File | Change |
|---|---|
| `src/routes/api/templates/+server.ts` | Replace `requireManager(locals)` at line 40 (PATCH) and line 69 (DELETE) with an auth-only `if (!locals.user) throw error(401, 'Unauthorized');`. Remove the now-unused local `requireManager` fn (lines 12–16) and the `isManager` import (line 10) — confirmed the only references are these two call sites, so both the fn and the import become dead and should be removed. Update the PATCH/DELETE header comments (lines 38, 67) that say "403 non-manager". |
| `src/routes/templates/+page.svelte` | Remove `canManage` gating at 6 sites (see checklist). Remove the derived `canManage` (line 23) and the `isManager` import (line 15) — confirmed the references are the derived def (line 23) + 6 usages (205/299/320/368/409/461); all get removed/rewritten, so both the var and import become dead. |
| `src/tests/templates-guard.spec.ts` | Invert PATCH (97–99) and DELETE (100–102) rep cases to expect success; add an unauth-401 assertion for PATCH/DELETE; update header docstring (1–12) + describe block (90). Keep `isManager` predicate tests (76–87) unchanged. |

**Note on `+page.svelte` line 299:** the empty-state ternary uses `canManage` to decide between
"No templates yet. Add your first one above." and "No templates yet." Since create is already open
to all users (`canCreate = !!data.currentUser`, line 25), this must be rewritten to show the "Add
your first one above" copy unconditionally — this is the 6th `canManage` reference and MUST be
resolved for the variable to be fully removable. It was not in the original handoff touchpoint list;
it is included here.

## Public Contracts

- `PATCH /api/templates` — behavior change: no longer returns 403 for non-managers; a valid
  authenticated request now updates and returns 200 + row (or 404 if missing). **401 unauth is
  explicitly preserved** (in-handler auth-only guard, mirroring POST line 22).
- `DELETE /api/templates` — behavior change: no longer returns 403 for non-managers; a valid
  authenticated request now soft-deletes any template and returns 204 (or 404 if missing). **401
  unauth is explicitly preserved.**
- No schema, request-body, or response-shape changes. Purely the authorization precondition is
  narrowed from "manager" to "any authenticated user".

## Blast Radius

- **Files:** 3 (`+server.ts`, `+page.svelte`, `templates-guard.spec.ts`). **Package:** single app (`src/`).
- **Risk class:** permission/trust-boundary change (authorization *relaxation*). Low blast — no data
  migration, no query change, no new surface. The relaxation is intentional and product-approved
  (the GitHub issue). Note for reviewers: delete-all means any user can soft-delete any template;
  soft-delete (not hard-delete) preserves recoverability, and this was the accepted design tradeoff.
  The authentication boundary is unchanged — only the manager boundary is removed.

## Implementation Checklist

1. `src/routes/api/templates/+server.ts:40` — **replace** `requireManager(locals);` in the PATCH handler with the auth-only guard `if (!locals.user) throw error(401, 'Unauthorized');`. Do NOT plain-delete: `requireManager` bundled the auth check (`!locals.user` → 403) with the manager check; only the manager check is being removed. This mirrors the POST handler (line 22) and preserves the "401 unauth unchanged" contract as in-handler defense-in-depth (`error` is already imported at line 1).
2. `src/routes/api/templates/+server.ts:69` — **replace** `requireManager(locals);` in the DELETE handler with the auth-only guard `if (!locals.user) throw error(401, 'Unauthorized');` (same rationale as step 1).
3. `src/routes/api/templates/+server.ts:12-16` — delete the now-unused `requireManager` function; `src/routes/api/templates/+server.ts:10` — delete the `import { isManager } from '$lib/utils/permissions';` line. Both are dead after steps 1–2 (the local `requireManager` fn was `isManager`'s only in-file reference); the replacement 401 lines use `error`, already imported at line 1. Verified: `isManager` in `permissions.ts` is a shared exported helper (untouched, 20+ other consumers); the removed `requireManager` is file-local to `+server.ts` only.
4. `src/routes/api/templates/+server.ts:38,67` — update header comments: PATCH `403 non-manager` → drop it (leave `200 / 400 invalid / 401 unauthed / 404 missing`); DELETE `403 non-manager` → drop it (leave `204 / 401 unauthed / 404 missing`).
5. `src/routes/templates/+page.svelte:320,368,409,461` — remove the four `{#if canManage}` … `{/if}` wrappers around the edit/delete button groups so those buttons render for all authenticated users (keep the button markup inside).
6. `src/routes/templates/+page.svelte:205-211` — remove the entire `{#if !canManage}` banner block ("You can create templates. Editing and deleting are manager-only.") — the statement is no longer true.
7. `src/routes/templates/+page.svelte:194` — update the `subtitle` copy to drop "Managed by managers" (e.g. "Reusable outreach messages reps can insert from a lead, organized by event category.").
8. `src/routes/templates/+page.svelte:299` — rewrite the empty-state ternary so the "No templates yet. Add your first one above." copy shows unconditionally (removes the last `canManage` reference). `canCreate` (line 25) is independent of `canManage` and is NOT touched.
9. `src/routes/templates/+page.svelte:23` — delete the derived `const canManage = ...`; `src/routes/templates/+page.svelte:15` — delete the `import { isManager } from '$lib/utils/permissions';` line (both now dead — verified references at the derived def (line 23) + usages 205/299/320/368/409/461 are all removed by steps 5–8).
10. `src/tests/templates-guard.spec.ts:97-99` — invert PATCH rep case: call `PATCH(repEvent('PATCH'))` and expect it NOT to throw 403 (mock `updateTemplate` to return a row, assert `res.status === 200`).
11. `src/tests/templates-guard.spec.ts:100-102` — invert DELETE rep case: mock `softDeleteTemplate` to return `true`, call `DELETE(repEvent('DELETE'))`, assert `res.status === 204`.
11b. `src/tests/templates-guard.spec.ts` — **add** an unauth-401 assertion for both write verbs: build a `nullUserEvent(method)` helper (identical to `repEvent` but `locals: { user: null }`) and assert `PATCH(nullUserEvent('PATCH'))` and `DELETE(nullUserEvent('DELETE'))` each reject with `{ status: 401 }`. This locks the "authentication still required" contract (steps 1–2) as Fully-Automated coverage. (The existing `expect403` helper can be generalized or a small `expectStatus(fn, code)` added.)
12. `src/tests/templates-guard.spec.ts:1-12,90` — update docstring + describe title to state "edit/delete are open to all authenticated users (GitHub #276); auth-only guard runs before DB; unauth still 401". Keep the `isManager` predicate unit tests (76–87) unchanged.
13. Run Fully-Automated gates: `bun run check` then `bun run test:unit:ci`. Fix any red before closeout.

**Test-mock note (steps 10–11):** the existing spec mocks `updateTemplate` → `null` and
`softDeleteTemplate` → `false` at the module level (lines 31–32). The inverted cases need a row /
`true` instead — override per-test with `vi.mocked(updateTemplate).mockResolvedValueOnce(...)` and
`vi.mocked(softDeleteTemplate).mockResolvedValueOnce(true)` so the other tests (404 paths, if any)
stay intact. Import the mocked fns alongside the existing imports. The unauth-401 cases (step 11b)
throw before any DB call, so they need no mock override.

## Acceptance Criteria

- **AC1 — create unchanged:** all authenticated users can still create templates (no regression).
  `proven by:` existing POST-open test (spec line 91–96, unchanged) · `strategy:` Fully-Automated.
- **AC2 — edit open:** a non-manager (rep) PATCH succeeds (200 + row) instead of 403.
  `proven by:` inverted PATCH guard test (step 10) · `strategy:` Fully-Automated.
- **AC3 — delete open (delete-all):** a non-manager (rep) DELETE succeeds (204) instead of 403 for
  ANY template. `proven by:` inverted DELETE guard test (step 11) · `strategy:` Fully-Automated.
- **AC4 — role-gating removed from UI + API:** no `requireManager` at the 2 CRUD call sites, no
  `canManage` gating in the template UI, no "manager-only" copy.
  `proven by:` `bun run check` (type-clean after var/import removal) + grep-absence of `canManage`
  in `+page.svelte` and `requireManager` in the PATCH/DELETE handlers (Fully-Automated); edit/delete
  buttons *rendering* for a rep in the browser is `strategy:` Agent-Probe (see Known-Gap below).
- **AC5 — authentication preserved:** an unauthenticated PATCH/DELETE still returns 401 (the gate is
  narrowed to any-authenticated-user, NOT opened to anonymous). `proven by:` new unauth-401 assertion
  (step 11b) · `strategy:` Fully-Automated. (Added by VALIDATE — trust-boundary preservation.)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit:ci` — inverted PATCH rep case returns 200 (not 403) | Fully-Automated | AC2 |
| `bun run test:unit:ci` — inverted DELETE rep case returns 204 (not 403) | Fully-Automated | AC3 |
| `bun run test:unit:ci` — existing POST-open rep case returns 201 (unchanged) | Fully-Automated | AC1 |
| `bun run test:unit:ci` — PATCH/DELETE with `user: null` reject with 401 (auth preserved) | Fully-Automated | AC5 |
| `bun run test:unit:ci` — `isManager` predicate tests still pass (helper untouched) | Fully-Automated | AC4 (helper preserved for other features) |
| `bun run check` — type-clean after removing `canManage` derived + both `isManager` imports | Fully-Automated | AC4 |
| grep: 0 `canManage` in `+page.svelte`; 0 `requireManager` calls in PATCH/DELETE handlers | Fully-Automated | AC4 |
| Rep user sees Edit/Delete buttons rendered on `/templates` in a real browser | Agent-Probe | AC4 (UI render) — CONDITIONAL, see Known-Gap |

**Why guard-inversion is Fully-Automated with no DB:** the manager guard runs *before* any DB
access (confirmed in code — `requireManager` was the first statement of each handler; the auth-only
replacement is likewise the first statement). With the DB layer mocked (as the existing spec already
does), removing the guard means the handler proceeds to the mocked
`updateTemplate`/`softDeleteTemplate` and returns success — deterministic, no live Postgres needed.
The unauth-401 cases throw before reaching the mock, so they are equally deterministic.

## Known-Gap (UI button visibility)

The Agent-Probe row above (rep actually seeing Edit/Delete buttons render in a browser) cannot be
proven Fully-Automated: the repo has **no shared Playwright authenticated-session fixture** — every
e2e spec against a protected route self-skips (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`,
and `process/context/tests/all-tests.md` §Known Gaps). This is a pre-existing, repo-wide infra gap,
not introduced by this plan.

Per the vacuous-green rule: the CORE behavior (edit/delete open to all authenticated users) IS
proven Fully-Automated at the API layer (AC2/AC3), the auth-boundary preservation is proven
Fully-Automated (AC5), and the removed UI gating logic (`{#if canManage}` removed) is proven
type-clean by `bun run check`. No developed behavior rests solely on the known-gap, so the plan is
not vacuously green. The UI-render scenario stays CONDITIONAL and is covered by the existing
shared-auth-fixture backlog note (no new stub needed — it references the same root-cause backlog
item).

## Test Infra Improvement Notes

(none identified yet — the UI-render known-gap is the pre-existing shared Playwright auth fixture,
already tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.)

## Dependencies

- None. No new packages, no migration, no ordering constraints. All edits are independent except
  that the `isManager`/`canManage` removals (steps 3, 9) must come after their usage removals
  (steps 1–2, 5–8) to keep the file type-clean at each intermediate state (or do them together).

## Risks

| Risk | Mitigation |
|---|---|
| Plain-deleting `requireManager(locals);` would silently drop the in-handler `!locals.user` → 401 auth check (it bundled auth + manager) | Steps 1–2 **replace** with `if (!locals.user) throw error(401)`, not delete. Runtime is still gated by `hooks.server.ts` (redirects unauth before the handler; `/api/templates` is not public), but the in-handler 401 matches POST's defense-in-depth and is now asserted by step 11b. |
| Removing `isManager` import while it's still referenced elsewhere in the file → type error | Confirmed in this plan: after steps 1–8 there are zero remaining references in each file. `bun run check` (step 13) catches any missed reference. |
| Deleting the shared `requireManager`/`isManager` helper *definitions* by mistake | Explicitly out of scope — only the `+server.ts`-local `requireManager` fn (dead after steps 1–2) and the two import lines are removed. The helper in `src/lib/utils/permissions.ts` is untouched (20+ other consumers verified). |
| Delete-all surprises a user (anyone deletes anyone's template) | Accepted product decision (locked). Soft-delete preserves recoverability. Out of scope to add owner checks. |

## Phase Completion Rules

SIMPLE plan — single phase. Completion criteria:

- All 13 (+11b) checklist items applied.
- `bun run check` passes (type-clean after `canManage` + both `isManager` import removals).
- `bun run test:unit:ci` passes, including the inverted PATCH (200) and DELETE (204) rep cases, the
  new unauth-401 cases (step 11b), and the unchanged `isManager` predicate + POST-open tests.
- grep confirms 0 `canManage` in `+page.svelte` and 0 `requireManager` calls in the PATCH/DELETE handlers.
- Status is `CODE DONE` after gates green; only promote to `VERIFIED` once the Agent-Probe UI-render
  scenario is confirmed or its known-gap is explicitly accepted at closeout.

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals present (S2 API/auth surface, S6 permission/trust-boundary class); 3-file confined blast radius, one mechanical approach — sequential fits (fit over tier per vc-agent-strategy-compare).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | non-manager (rep) PATCH succeeds (200) instead of 403 | Fully-Automated | `bun run test:unit:ci` — inverted PATCH rep case (spec step 10), `updateTemplate` mocked to a row, assert `res.status === 200` | B |
| AC3 | non-manager (rep) DELETE succeeds (204) instead of 403 (delete-all) | Fully-Automated | `bun run test:unit:ci` — inverted DELETE rep case (spec step 11), `softDeleteTemplate` mocked true, assert `res.status === 204` | B |
| AC1 | authenticated create still works (no regression) | Fully-Automated | `bun run test:unit:ci` — existing POST-open rep case returns 201 (spec line 91–96, unchanged) | A |
| AC5 | unauthenticated PATCH/DELETE still returns 401 (auth boundary preserved) | Fully-Automated | `bun run test:unit:ci` — new `nullUserEvent` cases (spec step 11b) reject `{ status: 401 }` | B |
| AC4 | role-gating removed from UI + API; helper defs preserved | Fully-Automated | `bun run check` type-clean + grep `0 canManage` in `+page.svelte` / `0 requireManager` calls in PATCH/DELETE | B |
| AC4-render | rep sees Edit/Delete buttons render in a real browser | Agent-Probe | Manual browser probe on `/templates` as a rep (blocked — no shared Playwright auth fixture) | D |

gap-resolution legend: A — proven now · B — fixed in this plan (gate added by this plan's checklist) · C — deferred to a named later phase/plan · D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained for existing consumers):
- API edit/delete open: Fully-automated: `bun run test:unit:ci` (inverted PATCH 200 / DELETE 204 rep cases)
- Auth boundary preserved: Fully-automated: `bun run test:unit:ci` (unauth PATCH/DELETE → 401, step 11b)
- Gating removed (type + grep): Fully-automated: `bun run check` + grep-absence of `canManage`/`requireManager`
- UI button render for rep: known-gap: documented — pre-existing shared Playwright auth-fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

Dimension findings:
- Infra fit: PASS — correct runners (`bun run check`, `bun run test:unit:ci` = vitest); no container/port/runtime surface; test file paths verified; `/api/templates` gated by hooks.server.ts (not public).
- Test coverage: PASS (after refinement) — core edit/delete-open behavior is Fully-Automated at the API layer; a new unauth-401 assertion (step 11b) was added to lock the auth boundary; only the browser UI-render is a pre-existing known-gap. Not vacuously green.
- Breaking changes: PASS — public API behavior change (403→200/204 for non-managers) is intentional and documented; no schema/request/response-shape change; the only consumer (templates UI) is updated in the same plan.
- Security surface: CONCERN (mitigated in plan) — `requireManager()` bundled auth (`!locals.user`) + manager checks; original checklist steps 1–2 ("delete the line") would have dropped the in-handler auth check. Runtime stays safe (hooks.server.ts redirects unauth before the handler), but to honor the plan's "401 unauth unchanged" contract and match POST's defense-in-depth, steps 1–2 were rewritten to REPLACE with `if (!locals.user) throw error(401)`, and AC5/step 11b now assert it. No auth bypass exists; concern resolved via plan update.
- Section — Implementation Checklist feasibility: PASS — all edit targets verified present and uniquely matchable (independent grep). Highest-risk edit = the requireManager→401 swap (steps 1–2), mitigated by the replacement pattern + AC5 assertion + `bun run check`.

Open gaps:
- UI button-render for a rep in a real browser: known-gap: documented — pre-existing repo-wide shared Playwright auth-fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Excluded from CONCERN/FAIL count (pre-classified known-gap). Not a NEW PLAN REQUIRED item — tracked by existing backlog note.

What this coverage does NOT prove:
- `bun run test:unit:ci` (inverted PATCH/DELETE): proves the handlers return 200/204 for an authenticated rep with mocked DB; does NOT prove real Postgres updates/soft-deletes the row (DB layer mocked), nor that the buttons render/click in a browser.
- `bun run test:unit:ci` (unauth-401): proves the handler throws 401 when `locals.user` is null; does NOT prove hooks.server.ts redirect behavior for a real unauthenticated HTTP request.
- `bun run check` + grep: proves type-cleanliness and textual absence of gating; does NOT prove the buttons visually appear for a rep or that the empty-state copy renders correctly.
- Agent-Probe (UI render): NOT executed — blocked by the missing shared Playwright auth fixture (known-gap).

Execute-agent instructions:
- E1 (steps 1–2, mandatory): REPLACE `requireManager(locals);` with `if (!locals.user) throw error(401, 'Unauthorized');` in BOTH PATCH and DELETE. Do NOT plain-delete — that would remove the authentication gate. `error` is already imported at `+server.ts:1`.
- E2 (step 3): only remove the file-local `requireManager` fn and the `isManager` import in `+server.ts`. Do NOT touch `src/lib/utils/permissions.ts` (shared helper, 20+ consumers).
- E3 (step 11b): add the unauth-401 assertions before closing — AC5 is not satisfied without them.

Gate: CONDITIONAL (one security-surface concern found in first pass and resolved via plan update; auth-boundary now explicitly preserved + asserted; one pre-existing known-gap for UI render, excluded from count)
Accepted by: session (vc-validate-agent, delegated) — accepted concern: "security-surface auth-only preservation" — resolved by rewriting checklist steps 1–2 to replace-with-401 and adding AC5/step 11b; known-gap "UI button render" accepted as pre-existing shared-auth-fixture backlog item.

## Autonomous Goal Block

```
SESSION GOAL: Open message-template edit + delete to all authenticated users (GitHub #276) — remove manager gating from API + UI, preserve authentication, invert guard tests.
Charter + umbrella plan: N/A — single plan
Autonomy: standard RIPER-5; EXECUTE requires explicit "ENTER EXECUTE MODE"; CONDITIONAL gate — proceed with the E1–E3 execute-agent instructions on record.
Hard stop conditions / safety constraints:
- Do NOT plain-delete requireManager(locals) — REPLACE with `if (!locals.user) throw error(401)` on both PATCH and DELETE (removing manager gate must not remove the auth gate).
- Do NOT edit src/lib/utils/permissions.ts (shared isManager/isManagerRole helper; 20+ consumers).
- Keep delete as soft-delete (no hard-delete); delete-all is the locked product decision.
Next phase: EXECUTE: process/features/leads/active/templates-open-edit-delete_08-07-26/templates-open-edit-delete_PLAN_08-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL)
Execute start: apply checklist 1–13 (+11b) in order → gates `bun run check` then `bun run test:unit:ci` | known-gap: UI button render (shared Playwright auth fixture) | high-risk pack: no (relaxation, no bypass; auth preserved + asserted)
```

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/leads/active/templates-open-edit-delete_08-07-26/templates-open-edit-delete_PLAN_08-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written (Gate: CONDITIONAL); checklist steps 1–3 refined for auth-boundary preservation; step 11b (unauth-401) + AC5 added.
3. **Validate-contract status:** written 08-07-26 (Gate: CONDITIONAL; generated-by: outer-pvl).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`;
   live code confirmed in `src/routes/api/templates/+server.ts`, `src/routes/templates/+page.svelte`,
   `src/tests/templates-guard.spec.ts`, `src/lib/utils/permissions.ts`, `src/hooks.server.ts`.
5. **Next step for a fresh agent:** EXECUTE the 13-item (+11b) checklist in order following execute-agent
   instructions E1–E3, then confirm `bun run check` + `bun run test:unit:ci` green.
