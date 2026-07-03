---
name: note:layout-client-load-test-harness
description: "Known-gap — no automated coverage for src/routes/+layout.ts (client load, ssr=false). Blocked on shared authed-session fixture."
date: 03-07-26
metadata:
  node_type: memory
  type: note
  feature: null
  phase: known-gap
---

# Known-Gap: `+layout.ts` client-load automated test harness

**Origin:** `prod-readiness-remediation_03-07-26` (EXECUTE, 03-07-26). Recorded per the plan's
Verification Evidence table (KG-1) and the CONDITIONAL validate-contract.

## Gap

`src/routes/+layout.ts` is a **client load** with `export const ssr = false;` and has **no
automated test coverage**. The remediation plan corrected its behavior (the mock
`getCurrentUser()` fallback was removed; `currentUser` now derives solely from the real
server session `data.user`, rendering `null` when there is no session instead of a fabricated
identity). That corrected runtime render path is currently proven only indirectly:

- `bun run check` (types) — no dangling imports, correct shape.
- `bun run build` — bundle compiles.
- SEC-A manual/agent-probe nav (login as manager, visit `/unauthorized`) — no automated harness.

What is NOT proven automatically: the actual `ssr=false` client-load render (that an authed
manager session renders manager-gated UI with the real role, and that `/unauthorized` renders
the shell with no fabricated user).

## Blocker / Dependency

Depends on the repo-wide **shared Playwright authenticated-session fixture** gap already tracked
in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`, which blocks e2e for
2+ features. Until that fixture exists, `+layout.ts` behavior stays Agent-Probe (manual) +
Known-Gap (automated).

## Resolution (when unblocked)

Once the shared authed-session fixture lands, add a client-load render assertion for
`+layout.ts`: assert `currentUser` reflects the real session role for an authed manager, and
asserts `currentUser === null` (no fabricated identity) on `/unauthorized`.
