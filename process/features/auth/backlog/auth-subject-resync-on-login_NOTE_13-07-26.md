---
name: report:auth-subject-resync-on-login
description: "Backlog: re-sync crm_users.auth_subject on subsequent Authentik login (one-shot account.create.after miss)"
date: 13-07-26
metadata:
  node_type: memory
  type: report
  feature: auth
  phase: backlog
---

# Backlog NOTE — Re-sync `crm_users.auth_subject` on subsequent login

**Status:** Open (deferred — non-blocking).
**Origin:** `authentik-oidc-integration_13-07-26` PLAN, PVL supplement (Gap 2, execute-agent instruction E-2).

## The edge

The Authentik `sub` is persisted into `crm_users.auth_subject` by a
`databaseHooks.account.create.after` hook, which fires **exactly once** per rep — when the
Authentik `account` row is first created/linked. If that first `persistAuthSubject` UPDATE fails
(transient DB blip; the hook logs-and-swallows and never aborts login), `auth_subject` stays NULL
and is **never re-synced** on later logins, because `account.create.after` does not fire again for
an already-linked account.

## Why it is non-blocking (not fixed in the originating plan)

- The login gate (`hooks.server.ts`) keys on `session.user.email` + `active=true`, **never on
  `auth_subject`**. A NULL `auth_subject` does not block sign-in and does not weaken the allowlist.
- It only forfeits the future robustness key (the IdP-`sub` join). No current feature reads
  `auth_subject`.
- The originating plan intentionally scoped OUT any re-sync path to keep the auth blast radius minimal.

## Proposed fix (future plan)

Add an idempotent re-sync on session establishment: on each Authentik login (or in a
`session.create` / request-time hook), if the resolved `crm_users` row has `auth_subject IS NULL`
and the current session carries an Authentik `sub`, run `persistAuthSubject({ email, subject })`
once. Keep it non-blocking (log-and-swallow) and UPDATE-by-email only (never INSERT), matching the
original invariant. Cheap fully-automated coverage: `.toSQL()` assert the conditional UPDATE +
a guard test that a non-NULL `auth_subject` is left untouched.

## Pointer

Originating plan: `process/features/auth/active/authentik-oidc-integration_13-07-26/authentik-oidc-integration_PLAN_13-07-26.md`
(§"Scope decision — `auth_subject` one-shot sync", Failure Modes, and Validate Contract E-2).
