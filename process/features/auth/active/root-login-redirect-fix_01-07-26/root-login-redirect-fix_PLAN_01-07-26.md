---
name: plan:root-login-redirect-fix
description: "Split hooks.server.ts unauthenticated redirect into /login (no session) vs /unauthorized (session but not allowlisted)"
date: 01-07-26
feature: auth
---

# Root/Login Redirect Fix — Plan

**Date**: 01-07-26
**Complexity**: SIMPLE
**Status**: ✅ VALIDATED (Gate: PASS)
**Type:** Mechanical bug fix (no design choices — INNOVATE/SPEC skipped by orchestrator)

## Why INNOVATE/SPEC Were Skipped

The intended behavior is already encoded elsewhere in the codebase as dead code
(`src/routes/+page.server.ts:7` and `src/routes/reminders/+page.server.ts:6` both contain
`if (!locals.user) throw redirect(303, '/login')`, currently unreachable because
`hooks.server.ts` redirects to `/unauthorized` before those load functions ever run). The
`/unauthorized` page copy itself is written for "authenticated but not on the allowlist," not
"never logged in." This is a restoration of already-decided intent, not a new design decision —
there is nothing to weigh in INNOVATE, and no requirements doc is needed beyond what's captured
here. This plan goes straight from prior orchestrator research to PLAN.

## Overview

`src/hooks.server.ts`'s global session gate currently sends every unauthenticated hit on a
protected route — including `/` — to `/unauthorized?from=[path]`. It should instead distinguish
two cases:

1. **No Better Auth session at all** → redirect to `/login`.
2. **Valid Better Auth session, but no active `crm_users` allowlist row** → redirect to
   `/unauthorized?from=[path]` (unchanged, this path is already correct).

## Goals

- Fix the redirect-target bug with the smallest possible diff.
- Preserve all existing allowlist-check logic untouched.
- Do not invent a `from`/redirect param for `/login` (out of scope).
- Do not touch the now-harmless dead-code guards in `+page.server.ts` files.

## Scope

In scope: `src/hooks.server.ts` only.
Out of scope: `/login` page behavior, `+page.server.ts` guards, `process/context/all-context.md`
auth conventions note (flagged for UPDATE PROCESS, not edited here).

## Touchpoints

- `src/hooks.server.ts` — the `handle` function's final redirect branch (currently one `if`
  covering both cases; splits into two).

## Public Contracts

- Behavioral contract of the global `Handle` hook changes: unauthenticated (no session) hits on
  protected routes now redirect to `/login` instead of `/unauthorized`. Authenticated-but-
  unallowlisted hits are unchanged (`/unauthorized?from=[path]`). No route table, API shape, or
  exported function signature changes.

## Blast Radius

- 1 file changed (`src/hooks.server.ts`), ~10 line diff (one `if` block splits into two branches).
- Risk class: **auth surface** (session gate) — small, behavior-preserving except for the exact
  redirect target on the no-session path. No schema, API, or dependency changes.

## Implementation Checklist

1. Open `src/hooks.server.ts`. Locate the final block:
   ```ts
   if (!isPublic && !event.locals.user) {
       redirect(303, '/unauthorized?from=' + encodeURIComponent(path));
   }
   ```
2. Replace it with two branches that distinguish "no session at all" from "session but not
   allowlisted":
   ```ts
   if (!isPublic && !event.locals.user) {
       if (!session?.user?.email) {
           // No Better Auth session at all — send to login.
           redirect(303, '/login');
       }
       // Session exists but email isn't an active crm_users row — allowlist rejection.
       redirect(303, '/unauthorized?from=' + encodeURIComponent(path));
   }
   ```
3. Do not modify the `session?.user?.email` / `crmUsers` lookup block above it — that logic is
   correct and unrelated to this bug.
4. Do not add a `from`/redirect query param to the `/login` branch — out of scope per the
   research constraints.
5. Do not modify `src/routes/+page.server.ts` or `src/routes/reminders/+page.server.ts` — their
   dead-code `redirect(303, '/login')` guards become harmless defense-in-depth once the hook is
   fixed; leaving them alone is correct.
6. Run `bunx tsc --noEmit` (or repo's typecheck script — check `package.json`) to confirm no
   type errors from the added branching.

## Acceptance Criteria

- AC1: Unauthenticated (no session/cookie) request to `/` → 303 redirect to `/login`.
- AC2: Unauthenticated request to any other protected route (e.g. `/leads`) → 303 redirect to
  `/login`.
- AC3: A request with a garbage/invalid session cookie (Better Auth cannot resolve a session) →
  303 redirect to `/login` (treated identically to no session).
- AC4: A request with a valid Better Auth session for an email NOT in the active `crm_users`
  allowlist → 303 redirect to `/unauthorized?from=[path]` (unchanged from today). **Known-gap:**
  cannot be curl-verified in this environment (Postgres not running locally — `pg_isready`
  fails, nothing listening on 5432 — so no live DB + real magic-link session cookie is
  available). See Verification Evidence below.
- AC5: Public routes (`/login`, `/health`, `/api/reminders/due`, `/api/reminders/notify`,
  `/api/leads/ingest`, `/api/auth/*`, `/unauthorized`) remain reachable without a session
  (unchanged).
- AC6: No regression to the allowlist-check query itself (crm_users lookup, role resolution).

## Dependencies

None. No new packages, no schema changes, no new routes.

## Risks

- **Low.** Two-branch conditional split of existing logic; no new code paths beyond routing the
  redirect target. The only real risk is accidentally swapping which branch checks `session` vs
  `event.locals.user` — mitigated by the exact code block given in checklist step 2.
- Known-gap: AC4 (allowlist-rejection path) is not independently curl-verifiable in this
  environment due to no local Postgres. This is accepted as a documented known-gap, not a
  blocking concern, because: (a) that code path's logic is *not* being changed — only the
  no-session branch is new; (b) the existing behavior for that branch is preserved verbatim.

## Test Infra Improvement Notes

(none identified yet)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `curl -s -D - -o /dev/null "http://localhost:5173/"` (no cookie) → expect `location: /login` | Fully-Automated | AC1 |
| `curl -s -D - -o /dev/null "http://localhost:5173/leads"` (no cookie) → expect `location: /login` | Fully-Automated | AC2 |
| `curl -s -D - -o /dev/null -b "better-auth.session_token=garbage-invalid-token-value" "http://localhost:5173/"` → expect `location: /login` | Fully-Automated | AC3 |
| `curl -s -D - -o /dev/null "http://localhost:5173/unauthorized?from=%2F"` → expect `200` | Fully-Automated | AC5 (unauthorized page itself still reachable) |
| `bunx tsc --noEmit` (or repo typecheck script) on `src/hooks.server.ts` → exits 0 | Fully-Automated | Regression guard (AC6) |
| Real magic-link login as a non-allowlisted email → expect `/unauthorized?from=[path]` | Hybrid (requires live Postgres + real Better Auth session — not available in this environment) | AC4 — **known-gap, accepted, non-blocking** |

Failing stub (TDD red-first anchor for execute-agent, not written to disk during PLAN):
```
test("unauthenticated request to / redirects to /login, not /unauthorized", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: no-session root redirect target")
})
```

## Test Coverage Waterfall Notes

- No existing automated test file covers `hooks.server.ts`'s redirect behavior (confirmed: no
  `hooks.server.spec.ts` / `.test.ts` found in `src/tests/` or alongside `hooks.server.ts`).
  This repo's verification gate for this change is therefore curl-based manual/scripted checks
  (Fully-Automated tier — deterministic curl assertions against a running dev server), not an
  existing Vitest/Playwright suite. This matches `process/context/tests/all-tests.md` guidance:
  route-level auth behavior in this repo is verified via `bun run dev` + curl until a dedicated
  hooks test harness exists (out of scope to build here).
- AC4's hybrid tier is accepted as known-gap for THIS plan only, per the vacuous-green ban: this
  behavior is pre-existing (not newly developed by this change) and is being left byte-for-byte
  unchanged — only the OTHER branch (no-session case) is new code, and that new code IS fully
  covered by the Fully-Automated curl gates above. No new developed behavior is left on
  known-gap alone.

## Validate Contract

**Status:** written inline (single-pass, lightweight — per orchestrator instruction for this
low-ambiguity, single-file, non-new-security-logic change)
**generated-by:** outer-pvl
**date:** 2026-07-01

### V1 — Structural Check
- Plan has Touchpoints, Public Contracts, Blast Radius, Verification Evidence, Test Infra
  Improvement Notes, Resume and Execution Handoff sections: PASS (all present above/below).
- No `## Inner Loop Refresh Note` exists (first pass): N/A.

### V2 — Dimension Fan-Out (lightweight, single-pass per orchestrator scope)
- **Correctness dimension:** The proposed branch split is a strict superset check —
  `!session?.user?.email` is checked first (narrower, no-session case), falling through to the
  existing allowlist-rejection redirect. No case is left unhandled: `isPublic` routes never
  reach this block; sessioned+allowlisted users never reach this block (locals.user would be
  truthy). PASS.
- **Security dimension:** No new attack surface. The allowlist enforcement (the actual security
  boundary — was this email verified as an active team member) is completely untouched; only
  the redirect *destination* for the pre-allowlist-check "not logged in at all" case changes.
  A garbage/forged session token still resolves to `session?.user?.email` being falsy (Better
  Auth's `getSession` returns null for invalid tokens), so it correctly routes to `/login`, not
  granted access. PASS.
- **Regression dimension:** `/unauthorized` page, its copy, and the allowlist-rejection path are
  byte-for-byte unchanged. Public route list unchanged. No import/dependency changes. PASS.
- **Scope dimension:** Single file, ~10 lines, no schema/API/billing surface. Confirmed within
  QUICK-FIX-adjacent bounds even though this went through full PLAN per orchestrator choice.
  PASS.

### V3 — Synthesis
No FAILs. One documented, justified known-gap (AC4 hybrid path, pre-existing/unchanged logic).

### V4 — Validate Menu / Strategy for EXECUTE
Recommended execution strategy: **Sequential** — single vc-execute-agent, one file, no
fan-out needed (Score: 0/7 signals — single file, no schema/auth/API/billing *new* surface, no
3+ directions, not a phase program). Model: opus (EXECUTE leg).

### V5 — Accept
Gate verdict below constitutes the accept decision; known-gap AC4 explicitly accepted as
documented, non-blocking.

### V6 — Contract Fields
- `generated-by: outer-pvl`
- `date: 2026-07-01`

### V7 — Gate Verdict

**Gate: PASS**

No unresolved FAILs. One accepted, justified known-gap (AC4 — pre-existing/unchanged
allowlist-rejection path, not independently curl-verifiable without live Postgres in this
environment). All newly-developed behavior (the no-session → `/login` branch) is fully covered
by Fully-Automated gates per the vacuous-green ban.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/auth/active/root-login-redirect-fix_01-07-26/root-login-redirect-fix_PLAN_01-07-26.md`
2. **Last completed phase or step:** PLAN (with inline Validate Contract, Gate: PASS)
3. **Validate-contract status:** written (PASS) — see `## Validate Contract` above
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/features/auth/_GUIDE.md` (auth feature guide — not directly read this session but
   is the canonical feature doc to consult), existing `src/hooks.server.ts`,
   `src/routes/+page.server.ts`, `src/routes/reminders/+page.server.ts`,
   `src/routes/unauthorized/+page.svelte` (all read during prior orchestrator research, not
   re-read here per instruction).
5. **Next step for a fresh agent picking up mid-execution:** Say `ENTER EXECUTE MODE` for this
   plan. vc-execute-agent should apply the exact code block in Implementation Checklist step 2 to
   `src/hooks.server.ts`, run the typecheck gate, then hand off to the orchestrator-driven EVL
   confirmation run (vc-tester spawns to re-run the curl gates in Verification Evidence — dev
   server must be started first, e.g. `bun run dev`). UPDATE PROCESS should flag the
   `process/context/all-context.md` auth conventions note (currently states redirect target is
   `/unauthorized` for all unauthenticated hits) for a follow-up context-doc correction — do not
   edit context docs during EXECUTE.

## Phase Completion Rules

- PLAN is complete: this plan file, including inline Validate Contract, is written (done).
- VALIDATE is complete inline above (Gate: PASS) — no separate VALIDATE pass needed before EXECUTE.
- EXECUTE is complete when: the code block in Implementation Checklist step 2 is applied to
  `src/hooks.server.ts`, `bunx tsc --noEmit` (or repo typecheck) passes, and all Fully-Automated
  curl gates in Verification Evidence return the expected `location` headers / status codes.
- EVL (orchestrator-driven confirmation run) is complete when vc-tester independently re-runs the
  same curl gates against a running dev server and confirms green.
- UPDATE PROCESS is complete when: this plan is archived to `process/features/auth/completed/`,
  and the `process/context/all-context.md` auth-conventions note (flagged above) is corrected.

## Notes for UPDATE PROCESS (flagged, not actioned here)

`process/context/all-context.md` §Auth / session conventions currently reads: "Unauthenticated
hits on protected routes redirect to `/unauthorized?from=[encoded-path]` (not `/login`)." This
line will become stale once this fix lands and should be updated to reflect the two-branch
behavior (no-session → `/login`; session-but-unallowlisted → `/unauthorized`).
