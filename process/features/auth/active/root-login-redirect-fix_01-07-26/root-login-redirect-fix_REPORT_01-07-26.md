---
phase: root-login-redirect-fix
date: 2026-07-01
status: COMPLETE
feature: auth
plan: process/features/auth/active/root-login-redirect-fix_01-07-26/root-login-redirect-fix_PLAN_01-07-26.md
---

# Root/Login Redirect Fix — Execute Report

## What Was Done

Applied Implementation Checklist step 2 to `src/hooks.server.ts` — split the single
unauthenticated-redirect branch into two:

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

Single file changed. The session/crmUsers lookup block above was left untouched. No other files
modified. Exact plan diff applied (~5 added lines).

## What Was Skipped or Deferred

- AC4 (valid session for a non-allowlisted email → `/unauthorized`) — accepted known-gap per the
  plan. Not curl-verifiable: no local Postgres + no real Better Auth session available. The logic
  for that branch is unchanged (byte-for-byte preserved), so no new developed behavior sits on the
  gap.
- `process/context/all-context.md` auth-conventions note correction — flagged for UPDATE PROCESS,
  not edited during EXECUTE (per constraint).

## Test Gate Outcomes

| Gate | Strategy | Result | AC |
|---|---|---|---|
| `bun run check` (svelte-check typecheck) | Fully-Automated | PASS — 0 errors (1 pre-existing unrelated warning in `leads/[id]/edit/+page.svelte`) | AC6 |
| `curl / ` (no cookie) | Fully-Automated | PASS — `303`, `location: /login` | AC1 |
| `curl /leads` (no cookie) | Fully-Automated | PASS — `303`, `location: /login` | AC2 |
| `curl / ` (garbage session cookie) | Fully-Automated | PASS — `303`, `location: /login` | AC3 |
| `curl /unauthorized?from=%2F` | Fully-Automated | PASS — `200` | AC5 |
| `curl /health` | Fully-Automated | PASS — `200` (public route unaffected) | AC5 |
| Real magic-link login as non-allowlisted email → `/unauthorized` | Hybrid | KNOWN-GAP (no live Postgres) | AC4 |

## Plan Deviations

None. Implementation matches the approved plan exactly.

## Test Infra Gaps Found

No automated test file covers `hooks.server.ts` redirect behavior — verification is curl-based
against a running dev server. Building a dedicated hooks test harness is out of scope for this fix
(pre-existing gap, unchanged).

## Closeout Packet

- **Selected plan:** `process/features/auth/active/root-login-redirect-fix_01-07-26/root-login-redirect-fix_PLAN_01-07-26.md`
- **Finished:** code change applied, typecheck green, all 5 Fully-Automated curl gates green.
- **Verified:** AC1, AC2, AC3, AC5, AC6.
- **Unverified:** AC4 (accepted known-gap — no live DB).
- **Remaining cleanup:** UPDATE PROCESS should (a) archive this plan to `completed/`, and
  (b) correct the stale `process/context/all-context.md` auth-conventions redirect note.
- **Best next state:** Ready for UPDATE PROCESS archival (after orchestrator-driven EVL
  confirmation run by vc-tester).

## Forward Preview

### Test Infra Found
No `hooks.server.spec.ts` exists; curl-against-dev-server is the verification path.

### Blast Radius Changes
1 file (`src/hooks.server.ts`), auth session-gate redirect branch only.

### Commands to Stay Green
- `bun run check`
- The 5 curl gates in the plan's Verification Evidence table (dev server on :5173).

### Dependency Changes
None.

## Follow-up Stubs Created
None.

## CONTEXT_PARTIAL Items
None.
