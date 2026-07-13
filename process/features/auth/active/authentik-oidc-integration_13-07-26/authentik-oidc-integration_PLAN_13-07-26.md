---
name: plan:authentik-oidc-integration
description: "Wire Authentik OIDC (Better Auth genericOAuth) alongside existing magic-link; persist IdP sub into crm_users.auth_subject via account.create.after hook; allowlist-by-email invariant unchanged"
date: 13-07-26
feature: auth
---

# Authentik OIDC Integration — Implementation Plan (COMPLEX, high-risk: auth/identity)

**Date**: 13-07-26  
**Status**: PLAN — pending VALIDATE  
**Complexity**: COMPLEX  
**Feature:** auth  
**Risk class:** HIGH (auth/identity/trust-boundary)

## Overview

Wire Authentik OIDC into veent-crm via Better Auth's `genericOAuth` plugin, coexisting with the live magic-link plugin. Persist the Authentik `sub` into the pre-existing `crm_users.auth_subject` column via a `databaseHooks.account.create.after` hook. The `crm_users`-email allowlist gate in `hooks.server.ts` is the unchanged security invariant. Single-app blast radius, no schema migration.

## TL;DR

Add Better Auth's `genericOAuth` plugin **alongside** the live `magicLink` plugin so allowlisted
reps can sign in with Authentik (`auth.veent.io`). The security invariant is untouched:
`hooks.server.ts` still gates every request on `crm_users WHERE email=… AND active=true`, and role/id
still come from `crm_users`, never the IdP. The one subtlety — persisting the Authentik `sub` into the
dormant `crm_users.auth_subject` column — is done in a **`databaseHooks.account.create.after`** hook
(NOT `user.create.after`), because static reads of the installed better-auth runtime prove the `sub`
lands on the `account` row and that `user.create.after` never fires for an existing magic-link rep who
links Authentik. No migration (column + unique index already exist). 6 touchpoints, ~4 code files.

TL;DR of the plan: 3 code edits + 1 verify-only file + `.env.example` + tests. High-risk manual-first
evidence handoff required before finalize.

---

## Goal

Allowlisted reps can click "Sign in with Authentik" on `/login`, complete the OIDC flow, and land in the
CRM with a valid session — while magic-link stays fully functional. The Authentik `sub` is durably stored
in `crm_users.auth_subject` for every rep who authenticates via Authentik (both brand-new and existing
magic-link users), without ever creating a `crm_users` row for a non-allowlisted identity.

## Scope

**In scope:** genericOAuth plugin wiring (server + client), the login button, `auth_subject` persistence
hook, account-linking config for the magic-link→Authentik migration path, env var declarations, tests.

**Out of scope (settled / external / deferred):** the Authentik app itself (already created + verified
2026-07-13); a live authorization-code round-trip (EXECUTE-phase integration test / known-gap); the
production redirect URI (deploy-time known-gap); the shared Playwright authenticated-session fixture
(pre-existing repo-wide known-gap — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

---

## Settled Design (do NOT reopen — carried from RESEARCH + VIABLE feasibility verdict)

- **Coexistence:** `genericOAuth` is ADDED to the `plugins:` array next to `magicLink`. Magic-link stays active.
- **Allowlist join key = verified email.** `hooks.server.ts` allowlist check is UNCHANGED (security invariant).
- **Role/id from `crm_users`**, never from the IdP (Authentik = authentication; CRM = authorization).
- **`sub` persisted into `crm_users.auth_subject`**, matched by email, never creating a `crm_users` row.
- **PKCE on**, scopes `openid email profile`, `email_verified`→`emailVerified` maps by default.
- Feasibility verdict: `authentik-oidc-integration_FEASIBILITY_13-07-26.md` (VIABLE).

### Design decision resolved during PLAN (closes the feasibility known-gap on hook wiring)

The feasibility note left "which hook fires / where the `sub` lives" as an EXECUTE-time check and named
`user.create.after` as the candidate. PLAN closed this with static reads of the installed better-auth
`1.6.20` runtime — it is now a **specified decision, not a punt**:

| Question | Evidence (installed `node_modules/better-auth/dist/…`) | Resolution |
|---|---|---|
| Where does the Authentik `sub` land? | `oauth2/link-account.mjs:81-95` — new user: `createOAuthUser({...restUserInfo}, accountData)` **strips `id`** (the sub) from user data; `accountData.accountId = userInfo.id.toString()`. The `sub` is written to the **`account`** row, never the `user` row. | Read `sub` from the **account** row (`account.accountId`), not the user object. `mapProfileToUser` is NOT used for this (would need `user.additionalFields` registration and still wouldn't carry `id`). |
| Does `user.create.after` fire for an existing magic-link rep linking Authentik? | `oauth2/link-account.mjs:10-49` — `findOAuthUser` matches the rep by email → `isRegister=false` → `linkAccount(...)` only. **No user create.** | `user.create.after` is INSUFFICIENT — it misses the entire migration population. |
| Which hook fires for BOTH paths? | `db/internal-adapter.mjs:86` (`createAccount`) and `:499` (`linkAccount`) both call `createWithHooks(..., "account", …)`; `db/with-hooks.mjs:31-39` runs `hooks.account.create.after(created, context)` for every account insert. | Use **`databaseHooks.account.create.after`** — fires for new-user account creation AND existing-user account link. |
| Can linking be blocked? | `oauth2/link-account.mjs:22` — link is refused unless the provider is trusted OR the local user is `emailVerified` (`requireLocalEmailVerified` defaults true). | Set `account.accountLinking.trustedProviders: ['authentik']` so the migration path is robust regardless of a magic-link user's `emailVerified` state. |

---

## Touchpoints

| # | File | Change | Verified |
|---|---|---|---|
| 1 | `src/lib/server/auth.ts` | Add `genericOAuth` to `plugins:` (after `magicLink`, before/after `dash`); add `databaseHooks.account.create.after`; add `account.accountLinking.trustedProviders:['authentik']`; import env vars. | Read L11-73 — plugins array at L46-71, no `databaseHooks`/`account` keys today. |
| 2 | `src/lib/server/oidc-sync.ts` | **NEW** file — exported testable seam `persistAuthSubject({ email, subject })` (Drizzle UPDATE of `crm_users.auth_subject` WHERE email) + `handleAuthentikAccountCreated(account)` (reads BA user email by `account.userId`, calls `persistAuthSubject`). Server-only. | New — keeps the hook body out of `auth.ts` so it is unit-testable. |
| 3 | `src/lib/auth-client.ts` | Add `genericOAuthClient()` to `plugins:` (exposes `authClient.signIn.oauth2`). | Read L1-7 — only `magicLinkClient()` today. |
| 4 | `src/routes/login/+page.svelte` | Add "Sign in with Authentik" button calling `authClient.signIn.oauth2({ providerId:'authentik', callbackURL: data.from ?? '/' })`. Keep the magic-link form. | Read L1-123 — `data.from` is already `sanitizeFrom`-sanitized server-side (`+page.server.ts`). |
| 5 | `src/hooks.server.ts` | **VERIFY ONLY — no edit.** Confirm the OIDC callback `/api/auth/oauth2/callback/authentik` is covered by the existing `/api/auth` public prefix (L25) and the allowlist gate keys on `session.user.email`. | Read L1-68 — `/api/auth` is in `PUBLIC_PREFIXES` (L25); gate at L34-64 keys on email. |
| 6 | `.env.example` | Add `AUTHENTIK_DISCOVERY_URL`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` (names + placeholder only). Confirm `BETTER_AUTH_URL` is the public origin used for redirect construction. | Read — `BETTER_AUTH_URL="http://localhost:5173"` present; no Authentik vars yet. |
| — | `src/lib/server/db/schema.ts` | **NO CHANGE, NO MIGRATION.** `crm_users.auth_subject` (L88) + `crm_users_auth_subject_uq` (L96) already exist. Better-Auth-table migrations are forbidden by convention. State this explicitly. | Read L74-104 — column + unique index confirmed present. |

---

## Public Contracts

- **New server env contract:** `AUTHENTIK_DISCOVERY_URL`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`
  read via `$env/dynamic/private` (never `process.env`). Client secret is confidential — `.env` only, never committed, never logged.
- **New client method:** `authClient.signIn.oauth2({ providerId, callbackURL })` (from `genericOAuthClient()`).
- **New public route (provided by genericOAuth, no hand-written handler):**
  `GET /api/auth/oauth2/callback/authentik` — already public via the `/api/auth` prefix.
- **New internal module `oidc-sync.ts`:** `persistAuthSubject({ email: string, subject: string }): Promise<void>`
  and `handleAuthentikAccountCreated(account): Promise<void>`. Server-only; both are idempotent and non-throwing (log-and-swallow).
- **Unchanged contract:** `SessionUser` shape, `hooks.server.ts` allowlist behavior, magic-link sign-in — all untouched.

---

## Blast Radius

- **Files changed:** 3 edited (`auth.ts`, `auth-client.ts`, `login/+page.svelte`) + 1 new (`oidc-sync.ts`) + `.env.example` + 1–2 new test files. 1 file verify-only (`hooks.server.ts`).
- **Packages:** single app (`src/`). No workspace fan-out.
- **Schema:** none (column + index pre-exist). No Drizzle migration, no Better-Auth-table migration.
- **Risk class:** HIGH — auth / identity / trust-boundary. Manual-first evidence handoff required (see below).
- **Failure containment:** the `auth_subject` sync hook is non-blocking (log-and-swallow) — a sync failure
  never aborts a login. The allowlist gate is the real security boundary and is unchanged, so a
  misconfigured Authentik client fails closed (no session → `/login`; session but not allowlisted → `/unauthorized`).

---

## Implementation Checklist (atomic, ordered)

1. **`src/lib/server/oidc-sync.ts` (NEW)** — create the testable seam first (TDD red before wiring):
   - `export async function persistAuthSubject({ email, subject }: { email: string; subject: string }): Promise<void>` —
     `await db.update(crmUsers).set({ authSubject: subject, updatedAt: new Date() }).where(eq(crmUsers.email, email))`.
     Do NOT `insert` — a non-allowlisted email simply matches zero rows (gate rejects them by design).
     Idempotent: re-running with the same `(email, subject)` is a no-op UPDATE; the per-user `sub` is unique
     so `crm_users_auth_subject_uq` cannot 23505 from this path.
   - `export async function handleAuthentikAccountCreated(account): Promise<void>` — guard
     `if (account?.providerId !== 'authentik' || !account.accountId || !account.userId) return;`
     then read the BA user email: `select({ email: baUser.email }).from(baUser).where(eq(baUser.id, account.userId)).limit(1)`;
     if an email is found, `await persistAuthSubject({ email, subject: account.accountId })`.
     Wrap the whole body in try/catch that logs (no secret/PII beyond email) and returns — never throw.
2. **`src/lib/server/auth.ts`** — imports: add
   `import { genericOAuth } from 'better-auth/plugins/generic-oauth';` and
   `import { handleAuthentikAccountCreated } from './oidc-sync';`.
3. **`src/lib/server/auth.ts`** — inside `betterAuth({…})`, add a top-level
   `account: { accountLinking: { enabled: true, trustedProviders: ['authentik'] } }` key (enables the
   magic-link→Authentik link path regardless of local `emailVerified`; ref `link-account.mjs:22`).
4. **`src/lib/server/auth.ts`** — add `databaseHooks: { account: { create: { after: async (account) => { await handleAuthentikAccountCreated(account); } } } }` to the `betterAuth({…})` config.
5. **`src/lib/server/auth.ts`** — append to the `plugins:` array:
   ```
   genericOAuth({
     config: [{
       providerId: 'authentik',
       discoveryUrl: env.AUTHENTIK_DISCOVERY_URL,
       clientId: env.AUTHENTIK_CLIENT_ID,
       clientSecret: env.AUTHENTIK_CLIENT_SECRET,
       scopes: ['openid', 'email', 'profile'],
       pkce: true
     }]
   })
   ```
   Do NOT supply `mapProfileToUser` — the `sub` is captured from the account row in step 1, and a mapper
   returning `authSubject` would require `user.additionalFields` registration and still not carry `id`.
6. **`src/lib/auth-client.ts`** — add `import { genericOAuthClient } from 'better-auth/client/plugins';`
   and add `genericOAuthClient()` to the `plugins:` array.
7. **`src/routes/login/+page.svelte`** — add an async `signInAuthentik()` calling
   `authClient.signIn.oauth2({ providerId: 'authentik', callbackURL: data.from ?? '/' })`, and render a
   "Sign in with Authentik" button below the magic-link block (inside the `{:else}` branch, after the
   magic-link CTA). Reuse the existing `data.from` (already sanitized) and the existing `error` state for
   any returned error. Svelte 5 runes only (`$state`).
8. **`src/hooks.server.ts`** — VERIFY ONLY: confirm no edit is needed (callback under `/api/auth`,
   allowlist keys on email). Record the confirmation in the phase report. Make NO change.
9. **`.env.example`** — add under the Better Auth block: `AUTHENTIK_DISCOVERY_URL="https://auth.veent.io/application/o/veent-crm/.well-known/openid-configuration"`,
   `AUTHENTIK_CLIENT_ID=""`, `AUTHENTIK_CLIENT_SECRET=""` (placeholder empty — real values go in `.env` at EXECUTE, never committed).
10. **Tests** — write the fully-automated unit tests (see Verification Evidence). Add a `SKIP_DB`-gated
    Hybrid spec for the `auth_subject` persistence.
11. **Run gates** — `bun run check`, `bun run test:unit:ci`, `bun run lint` (see test plan).
12. **High-risk evidence pack** — assemble the manual-first evidence (see High-Risk Handoff) once client
    id/secret land on the dev `.env`: perform one real Authentik login round-trip and capture the result.

---

## Data Flow

1. Rep clicks "Sign in with Authentik" → `authClient.signIn.oauth2({ providerId:'authentik', callbackURL })`.
2. genericOAuth fetches the discovery doc, builds the PKCE authorize URL, redirects to Authentik.
3. Rep authenticates at Authentik → redirect back to `/api/auth/oauth2/callback/authentik` (public route).
4. genericOAuth exchanges the code (PKCE), fetches userinfo → `{ id: sub, email, emailVerified, … }`.
5. `handleOAuthUserInfo` (`link-account.mjs`): looks up user by email.
   - **New user:** `createOAuthUser` → creates BA `user` (no `sub`) + `account` (`accountId=sub`) → `account.create.after` fires.
   - **Existing magic-link rep:** `linkAccount` → creates `account` (`accountId=sub`) → `account.create.after` fires.
6. `account.create.after` → `handleAuthentikAccountCreated(account)` → read BA user email by `account.userId`
   → `persistAuthSubject({ email, subject: account.accountId })` → UPDATE `crm_users.auth_subject WHERE email` (0 rows if not allowlisted).
7. genericOAuth creates the session. Next request → `hooks.server.ts` gate: session email must match an
   active `crm_users` row → `event.locals.user` (role/id from `crm_users`). Non-allowlisted → `/unauthorized`.

---

## Failure Modes

| Failure | Behavior | Handling |
|---|---|---|
| Authentik client misconfigured / discovery unreachable | OIDC flow errors; no session created | Fails closed → `/login`. No CRM access granted. |
| `auth_subject` sync hook throws (DB blip) | Login still succeeds (hook is non-blocking) | try/catch log-and-swallow in `oidc-sync.ts`; `auth_subject` re-syncs is NOT automatic on later logins (account link fires once) — see known-gap. |
| Authentik user's email not in `crm_users` (or `active=false`) | Session created but gate rejects | `/unauthorized` redirect (existing behavior). No `crm_users` row created. |
| Existing magic-link rep, link refused | Would block Authentik sign-in for that rep | Mitigated by `trustedProviders:['authentik']` (step 3). |
| Client secret leaked to logs/client | Trust-boundary breach | Secret is `$env/dynamic/private` only; never logged; hook logs only email. |

---


### Scope decision — `auth_subject` one-shot sync (no re-sync path in this plan)

**Decision (recorded, not deferred):** `persistAuthSubject` runs exactly ONCE per rep, via
`account.create.after` (the account-link event fires a single time per provider account). On a failed
first UPDATE (DB blip; the hook logs-and-swallows and never aborts login), `crm_users.auth_subject` stays
NULL and is **not re-synced on subsequent logins** — this plan intentionally adds **no re-sync path**.

**Why this is non-blocking:** the login gate keys on `session.user.email` (+ `active=true`), never on
`auth_subject`. A NULL `auth_subject` forfeits only the future robustness key (IdP-`sub` join); it does
NOT weaken the allowlist gate or block sign-in. Contained by the non-blocking hook design.

**Follow-up:** a re-sync-on-subsequent-login enhancement is logged as a backlog stub for a future plan —
`process/features/auth/backlog/auth-subject-resync-on-login_NOTE_13-07-26.md`. Execute-agent instruction
E-2 already carries the "log the email on failure so the miss is recoverable" requirement.

## Security (STRIDE quick scan — auth/identity/trust-boundary)

- **Spoofing / Elevation:** identity is authenticated by Authentik; **authorization is the CRM allowlist by
  email** (unchanged). Role is ALWAYS from `crm_users` — the IdP `groups` claim is never consulted. A valid
  Authentik login for a non-allowlisted email yields `/unauthorized`, not access.
- **Tampering:** `sub` arrives via the PKCE-protected token exchange (better-auth verifies); persisted verbatim to `auth_subject`.
- **Info disclosure:** client secret confined to `.env`/`$env/dynamic/private`; sync hook logs email only, never the secret or tokens (better-auth encrypts stored tokens via `setTokenUtil`).
- **Repudiation:** account link + session creation are better-auth-managed on its own tables; `auth_subject` write is idempotent.
- **Residual (known-gap):** the real runtime value of `email_verified` for an Authentik user is unverified
  (feasibility was read-only). The allowlist gate keys on `session.user.email` regardless, so an unverified
  email still cannot bypass the allowlist — but confirm `email_verified=true` during the round-trip.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `persistAuthSubject` builds `UPDATE crm_users SET auth_subject WHERE email` (assert via `.toSQL()`; no INSERT) | Fully-Automated (vitest) | `sub` persisted to correct column/row; non-allowlisted email → 0 rows (no row creation) |
| `handleAuthentikAccountCreated` guard: non-`authentik` providerId → no DB call; missing accountId/userId → early return | Fully-Automated (vitest, mocked db) | Hook is scoped to Authentik + safe on malformed input |
| genericOAuth config presence: `auth.ts` plugins include a provider with `providerId:'authentik'`, `scopes` = `['openid','email','profile']`, `pkce:true`, discovery/clientId/secret bound to env | Fully-Automated (vitest structural / import assert) | Provider wired per settled design |
| `account.accountLinking.trustedProviders` includes `'authentik'` and `databaseHooks.account.create.after` is defined | Fully-Automated (vitest structural) | Migration path enabled; sync hook registered |
| `genericOAuthClient()` present in `auth-client.ts` plugins; `authClient.signIn.oauth2` is a function | Fully-Automated (vitest) | Client method exposed for the login button |
| `hooks.server.ts` `PUBLIC_PREFIXES` includes `/api/auth`; no diff to `hooks.server.ts` | Fully-Automated (grep + `git diff --quiet`) | Callback reachable; security gate unchanged (verify-only touchpoint) |
| Seed a `crm_users` row + invoke `handleAuthentikAccountCreated` against live PG → `auth_subject` populated; non-allowlisted email → still absent | Hybrid (vitest, `SKIP_DB`-gated live Postgres) | End-to-end persistence with a real DB |
| Full authorization-code round-trip (redirect → Authentik login → callback → session → gate), incl. real `email_verified` | Known-Gap (agent-probe, EXECUTE-phase once client secret on dev `.env`) | Live sign-in works; carried forward from feasibility |
| Login button renders + click starts OIDC redirect | Known-Gap (e2e — shared Playwright auth fixture) | UI wiring; blocked on `e2e-auth-bootstrap_NOTE_01-07-26.md` |
| Production redirect URI registered in Authentik | Known-Gap (deploy-time) | Prod parity; dev URI only today |

### High-risk minimum-tier note
Auth/identity is a high-risk class → at least a Hybrid gate is required and present (the `SKIP_DB`
persistence spec). The live round-trip is a documented, pre-accepted Known-Gap (read-only feasibility +
no dev client secret yet), closing at EXECUTE once the secret lands — NOT a silent PASS.

### TDD failing stubs (for the validate-contract Test Gates section)
```
test("persistAuthSubject updates crm_users.auth_subject by email, no insert", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: persistAuthSubject UPDATE-by-email");
})
test("handleAuthentikAccountCreated ignores non-authentik providerId", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: hook provider guard");
})
test("auth.ts wires genericOAuth authentik provider with pkce+scopes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: genericOAuth config presence");
})
```

---

## Known Gaps (Resolved via Backlog)

The following are **pre-accepted residuals** — each has a resolution pointer and is excluded from the
CONCERN/FAIL count on any re-validation. They are documented gaps, not open defects, and do NOT bar EXECUTE.

| # | Known gap | Pre-accepted resolution / pointer |
|---|---|---|
| 1 | Live authorization-code round-trip + real `email_verified` value | Closes at EXECUTE once `AUTHENTIK_CLIENT_SECRET` is on the dev `.env`; deferred to the manual `vc-risk-evidence-pack` high-risk evidence handoff (E-3). Read-only feasibility could not exercise a live token exchange — pre-accepted residual. |
| 2 | Login-button render/click e2e | Blocked on the shared Playwright authenticated-session fixture — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Repo-wide pre-existing blocker; no new fixture built by this plan — pre-accepted residual. |
| 3 | Production redirect URI registration in Authentik | Deploy-time step (Vercel vs `crm.veent.io` origin unresolved); dev redirect `http://localhost:5173/api/auth/oauth2/callback/authentik` only today — pre-accepted residual. |
| 4 | `auth_subject` one-shot re-sync edge | See §"Scope decision — `auth_subject` one-shot sync" above; backlog stub `process/features/auth/backlog/auth-subject-resync-on-login_NOTE_13-07-26.md` — pre-accepted residual, contained by the non-blocking hook. |

These four residuals are the pre-accepted Known-Gaps referenced in the Validate Contract's Open Gaps and
Phase Completion Rules. A re-validation MUST exclude them from the CONCERN/FAIL tally.

## Test Infra Improvement Notes

- Reuses the existing repo-wide known-gap: shared Playwright authenticated-session fixture
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — the login-button e2e cannot run
  until that lands. No new fixture is built by this plan.
- Reuses the `SKIP_DB`-gated Hybrid vitest pattern (`describe.skipIf(SKIP_DB)`, `.toSQL()` assertions,
  `vi.mock('$env/dynamic/private')`) already established in `src/tests/`.
- New potential gap: no automated harness exercises a real OIDC token exchange; the round-trip stays a
  manual/agent-probe check until an Authentik test client + live-DB CI harness exist. (Same live-DB CI
  harness gap several features already carry.)

---

## Dependencies & Risks

- **Dependency:** `better-auth@^1.6.20` (installed) exports `genericOAuth` (`better-auth/plugins/generic-oauth`)
  and `genericOAuthClient` (`better-auth/client/plugins`) — confirmed via feasibility static reads.
- **Dependency:** Authentik veent-crm app exists (verified 2026-07-13); client secret must be placed in dev
  `.env` at EXECUTE before the round-trip.
- **Risk:** account-linking refusal for existing magic-link reps — mitigated by `trustedProviders:['authentik']`; confirm during round-trip.
- **Risk:** `email_verified` real value unverified — allowlist gate contains the blast; confirm at round-trip.
- **Backwards compatibility:** magic-link path untouched; `hooks.server.ts` untouched; no schema change → fully backward compatible.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/auth/active/authentik-oidc-integration_13-07-26/authentik-oidc-integration_PLAN_13-07-26.md`
2. **Last completed step:** PLAN written (hook mechanism closed via static better-auth reads). No source edited.
3. **Validate-contract status:** pending — vc-validate-agent must write `## Validate Contract` before EXECUTE.
4. **Supporting context loaded:** `authentik-oidc-integration_FEASIBILITY_13-07-26.md`,
   `veent-crm-authentik-blueprint.yaml`, `process/context/all-context.md` (§Auth/session, §Drizzle, §Env),
   `process/features/auth/_GUIDE.md`, `process/context/tests/all-tests.md`,
   `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`, and better-auth runtime
   (`node_modules/better-auth/dist/oauth2/link-account.mjs`, `db/internal-adapter.mjs`, `db/with-hooks.mjs`).
5. **Next step for a fresh agent:** after VALIDATE, EXECUTE steps 1→12 in order (TDD: write `oidc-sync.ts`
   tests red first). The live round-trip (step 12) needs `AUTHENTIK_CLIENT_SECRET` in dev `.env` — if absent,
   complete steps 1–11, mark the round-trip Known-Gap, and surface the high-risk evidence pack for the
   manual round-trip. Do NOT edit `hooks.server.ts` (verify-only) and do NOT generate any migration.

### High-Risk Manual-First Evidence Handoff (auth/identity/trust-boundary)
Before this work is treated as finalize-ready, assemble the manual-first evidence pack (per
`vc-risk-evidence-pack`): (a) one real Authentik login round-trip for a new allowlisted rep and for an
existing magic-link rep; (b) DB proof that `crm_users.auth_subject` is populated for both and absent for a
non-allowlisted login; (c) confirmation the magic-link path still works; (d) confirmation `hooks.server.ts`
is byte-unchanged; (e) confirmation the client secret is not in logs or committed. Automated gates alone do
NOT close this high-risk class.

---

## Acceptance Criteria

1. `genericOAuth` is present in `auth.ts` `plugins:` alongside `magicLink` (magic-link still works).
2. Authentik provider configured with `providerId:'authentik'`, `scopes:['openid','email','profile']`, `pkce:true`, env-bound discovery/clientId/secret.
3. `databaseHooks.account.create.after` persists the Authentik `sub` into `crm_users.auth_subject` matched by email, for BOTH a new OIDC user and an existing magic-link rep — and creates NO `crm_users` row for a non-allowlisted email.
4. `account.accountLinking.trustedProviders` includes `'authentik'` (migration path robust).
5. `auth-client.ts` exposes `authClient.signIn.oauth2`; `/login` renders a working "Sign in with Authentik" button using the sanitized `data.from` callback.
6. `hooks.server.ts` is byte-unchanged; the OIDC callback is reachable via the `/api/auth` public prefix.
7. No Drizzle migration and no Better-Auth-table migration generated.
8. All Fully-Automated + Hybrid gates green; the live round-trip is recorded as a pre-accepted Known-Gap until the dev client secret lands.

## Phase Completion Rules

- This is a single-plan COMPLEX feature (not a phase program). It is `CODE DONE` when checklist steps 1–11 land and all Fully-Automated + Hybrid gates are green. It is `✅ VERIFIED` ONLY after the high-risk manual-first evidence pack (live Authentik round-trip for new + existing rep, DB proof of `auth_subject`, magic-link still works, `hooks.server.ts` unchanged, no secret leakage) is captured and user-confirmed.
- Do not mark VERIFIED on automated gates alone — auth/identity is high-risk.

## Next Step

Say **ENTER VALIDATE MODE** to run plan validation (required before EXECUTE). Per RIPER-5, VALIDATE writes the `## Validate Contract` section below before any implementation.

## Validate Contract

Status: CONDITIONAL (terminal / accepted — EXECUTE-legal)
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-13 (outer-pvl) — outer-pvl re-validation after PVL cycle 1 supplement has current evidence

Parallel strategy: sequential
Rationale: Signal score 2/7 (S2 auth surface + S6 high-risk class present; S1/S3/S4/S5/S7 absent). Single-app blast radius, 3 edited + 1 new code file, no multi-package fan-out. Sequential vc-execute-agent fits; do not fan out.

Net gate: CONDITIONAL (terminal / accepted) — 0 FAILs, 0 CONCERNs (all 3 first-pass CONCERNs resolved by the PVL cycle-1 supplement — see Dimension findings), 8 PASS dimensions. The gate is CONDITIONAL, NOT terminal PASS, for exactly one reason: the net-gate vacuous-green ban. Two behaviors this plan develops — the rendered `/login` Authentik button (render/click) and the integrated end-to-end sign-in flow — have no Fully-Automated or Hybrid gate proving the *integrated* behavior; their coverage is Known-Gap (button e2e, blocked on the repo-wide Playwright auth fixture — KG-2) and Agent-Probe (live round-trip — KG-1). Per the vacuous-green rule this bars the terminal PASS *label* but does NOT bar EXECUTE. This CONDITIONAL is terminal and EXECUTE-legal because ≥1 PVL fix cycle has completed (results.tsv: baseline + cycle 1) AND the plan's `## Known Gaps (Resolved via Backlog)` section formally pre-accepts every named residual. Improvement vs first pass: 3 CONCERNs → 0; residuals moved from unresolved to formally-excluded pre-accepted Known-Gaps.

Re-validation (PVL cycle 1) result: the 2 supplement gaps landed and hold. (1) `## Known Gaps (Resolved via Backlog)` section present (plan §Known Gaps) — the 4 residuals are correctly formatted as pre-accepted and excluded from the CONCERN/FAIL tally. (2) One-shot `auth_subject` scope decision documented (plan §"Scope decision — auth_subject one-shot sync") + backlog stub created (`process/features/auth/backlog/auth-subject-resync-on-login_NOTE_13-07-26.md`) → Section A CONCERN resolved. Load-bearing runtime facts re-confirmed on disk, no design drift: `magicLink` plugin present (auth.ts L47), `crm_users.auth_subject` column + `crm_users_auth_subject_uq` present (schema.ts L88/L96 — no migration), `/api/auth` in `PUBLIC_PREFIXES` (hooks.server.ts L25, verify-only), `magicLinkClient()`-only client today (auth-client.ts L6), `oidc-sync.ts` correctly absent (new file). Live feasibility probe NOT re-run — VIABLE verdict settled.

### Net gate derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS (first-pass CONCERN resolved — residual now excluded Known-Gap KG-1 + E-3) |

| Layer 2 sections | Status |
|---|---|
| Section A — `oidc-sync.ts` seam + hook | PASS (first-pass CONCERN resolved — scope decision + backlog KG-4 + E-2) |
| Section B — `auth.ts` wiring | PASS (first-pass CONCERN resolved — residual now excluded Known-Gap KG-1 + E-3) |
| Section C — client + login button | PASS |
| Section D — `hooks.server.ts` verify-only + `.env` | PASS |

Totals: 0 FAILs / 0 CONCERNs / 8 PASSes (Known Gaps KG-1..KG-4 excluded per V3 known-gap exclusion).
→ Net Gate: CONDITIONAL (terminal / accepted) — barred from terminal PASS solely by the vacuous-green ban (KG-1 end-to-end flow, KG-2 login-button render); EXECUTE-legal (≥1 PVL cycle + residuals pre-accepted).

### Test gates (C3 5-column — additive; legacy line form retained below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | `persistAuthSubject` builds `UPDATE crm_users SET auth_subject WHERE email` — never INSERT; non-allowlisted email → 0 rows | Fully-Automated | `bun run test:unit:ci` — `.toSQL()` asserts UPDATE-by-email, asserts no `insert` | A |
| AC3 | `handleAuthentikAccountCreated` guard: non-`authentik` providerId → no DB call; missing accountId/userId → early return | Fully-Automated | `bun run test:unit:ci` — mocked `db`, guard branches | A |
| AC2 | `auth.ts` plugins include provider `providerId:'authentik'`, `scopes:['openid','email','profile']`, `pkce:true`, env-bound discovery/clientId/secret | Fully-Automated | `bun run test:unit:ci` — structural / import assert on `auth.ts` | A |
| AC4 | `account.accountLinking.trustedProviders` includes `'authentik'` AND `databaseHooks.account.create.after` is defined | Fully-Automated | `bun run test:unit:ci` — structural assert | A |
| AC5 | `genericOAuthClient()` in `auth-client.ts` plugins; `authClient.signIn.oauth2` is a function | Fully-Automated | `bun run test:unit:ci` | A |
| AC6 | `hooks.server.ts` `PUBLIC_PREFIXES` includes `/api/auth` AND `hooks.server.ts` byte-unchanged | Fully-Automated | `grep -q "/api/auth" src/hooks.server.ts && git diff --quiet -- src/hooks.server.ts` (exit 0) | A |
| AC1–AC8 | whole change typechecks | Fully-Automated | `bun run check` (exit 0) | A |
| AC1–AC8 | formatting / lint clean | Fully-Automated | `bun run lint` (exit 0) | A |
| AC3 | seed a `crm_users` row + invoke `handleAuthentikAccountCreated` against live PG → `auth_subject` populated; non-allowlisted email → still absent | Hybrid | `bun run test:unit:ci` with `SKIP_DB` unset + live `DATABASE_URL` (precondition: live Postgres, seeded row) | B |
| AC8 | full authorization-code round-trip (redirect → Authentik login → callback → session → gate), incl. real `email_verified` value | Agent-Probe | manual Authentik round-trip + `vc-risk-evidence-pack` at EXECUTE once `AUTHENTIK_CLIENT_SECRET` on dev `.env` | C |

gap-resolution legend: A — proven now · B — gate added by this plan's checklist (the live-DB *run* is a named residual, see Known Gaps) · C — deferred to EXECUTE (manual evidence pack) · D — backlog stub.

C-4 note: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). The two pure Known-Gaps (login-button e2e KG-2, prod redirect URI KG-3) are NOT strategy rows — they are named residuals in Known Gaps.

Failing stubs (Fully-Automated rows only — TDD red-first for execute-agent):
```
test("persistAuthSubject updates crm_users.auth_subject by email, no insert", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: persistAuthSubject UPDATE-by-email");
})
test("handleAuthentikAccountCreated ignores non-authentik providerId", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: hook provider guard");
})
test("auth.ts wires genericOAuth authentik provider with pkce+scopes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: genericOAuth config presence");
})
test("auth.ts sets accountLinking.trustedProviders=['authentik'] and databaseHooks.account.create.after", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: accountLinking + account.create.after");
})
test("auth-client.ts exposes authClient.signIn.oauth2 via genericOAuthClient", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: genericOAuthClient method presence");
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- oidc-sync persistence: Fully-automated: `bun run test:unit:ci` (persistAuthSubject `.toSQL()` + hook-guard unit specs) | hybrid: `bun run test:unit:ci` with live `DATABASE_URL`, `SKIP_DB` unset — precondition: live Postgres + seeded `crm_users` row
- config wiring: Fully-automated: `bun run test:unit:ci` (structural asserts on `auth.ts` / `auth-client.ts`) + `bun run check`
- security invariant: Fully-automated: `grep -q '/api/auth' src/hooks.server.ts && git diff --quiet -- src/hooks.server.ts`
- lint: Fully-automated: `bun run lint`
- live sign-in round-trip: agent-probe: manual Authentik round-trip + evidence pack at EXECUTE
- login button render/click: known-gap: shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- production redirect URI: known-gap: deploy-time (dev URI `http://localhost:5173/api/auth/oauth2/callback/authentik` only today)

### Dimension findings
- Infra fit: PASS — single-app (`src/`), no container/port/worker surfaces. All 6 touchpoints re-verified present and uniquely matchable on disk: `auth.ts` `magicLink` plugin at L47 (no `databaseHooks`/`account` keys today), new `oidc-sync.ts` seam correctly ABSENT (new file), `auth-client.ts` `magicLinkClient()`-only (L6), `login/+page.svelte` uses sanitized `data.from` (`$props()`, Svelte 5), `hooks.server.ts` `/api/auth` public prefix (L25), `.env.example` Better Auth block present with no Authentik vars yet.
- Test coverage: PASS — Fully-Automated unit gates concrete (`bun run test:unit:ci`) and the high-risk minimum Hybrid gate (`SKIP_DB`-gated live-PG persistence) is present, matching the established `src/tests/*-db.spec.ts` pattern. Live round-trip (KG-1) + button e2e (KG-2) are pre-accepted, documented Known-Gaps (not silent passes).
- Breaking changes: PASS — `genericOAuth` is ADDED alongside `magicLink` (magic-link untouched). No existing `account.create.after` hook or `accountLinking` config exists today, so the new keys override nothing. `SessionUser` shape, `hooks.server.ts` behavior, and magic-link sign-in are all unchanged. Fully backward compatible.
- Security surface: PASS (was CONCERN — resolved) — trust-boundary invariant preserved (allowlist gate byte-unchanged, keyed on `session.user.email AND active=true`; role/id from `crm_users`, never the IdP `groups` claim). Secret hygiene sound (`$env/dynamic/private`, hook logs email only). The first-pass CONCERN was `accountLinking.trustedProviders:['authentik']` bypassing `requireLocalEmailVerified`, so the auto-link path's safety rests on Authentik actually verifying emails. That residual — the real runtime `email_verified` value — is now a formally-excluded pre-accepted Known-Gap (KG-1) confirmed at the E-3 evidence-pack round-trip, and is contained regardless by the unchanged email allowlist (linking only matters between two already-allowlisted reps; magic-link locals are email-verified by construction). No open security defect remains.
- Section A (`oidc-sync.ts` seam + hook) feasibility: PASS (was CONCERN — resolved) — mechanically feasible (new file, testable seam). The first-pass CONCERN (the `account.create.after` link fires ONCE; a failed first `persistAuthSubject` UPDATE leaves `auth_subject` NULL with no re-sync) is now a recorded scope decision (plan §"Scope decision — auth_subject one-shot sync") + backlog stub (KG-4, `auth-subject-resync-on-login_NOTE_13-07-26.md`) + execute-agent instruction E-2 (log email on failure). Contained by the non-blocking hook + email-keyed gate. Documented residual, not an open defect.
- Section B (`auth.ts` wiring) feasibility: PASS (was CONCERN — resolved) — plugins array + `databaseHooks` + `account.accountLinking` keys go inside `betterAuth({…})` in `createAuth()`; no collision (no such keys today). The first-pass CONCERN (the `trustedProviders` email-verified assumption) is the same residual now excluded as Known-Gap KG-1 + carried by E-3. `handleAuthentikAccountCreated` reads the BA user email via `baUser` by `account.userId` (both `baUser`/`baAccount` exports confirmed present).
- Section C (client + login button) feasibility: PASS — `genericOAuthClient` confirmed exported from `better-auth/client/plugins` (1.6.20); `data.from` already `$props()`/Svelte-5 and server-sanitized.
- Section D (`hooks.server.ts` verify-only + `.env`) feasibility: PASS — no edit needed; `/api/auth` prefix covers the OIDC callback; gate keys on email. `.env.example` additions are names/placeholders only.

### Execute-agent instructions
| # | Instruction | Trigger condition |
|---|---|---|
| E-1 | TDD red-first: write the 5 Fully-Automated stubs above (persistAuthSubject, hook guard, config presence, accountLinking+databaseHooks, client method) as failing tests BEFORE wiring `auth.ts`/`oidc-sync.ts`. | Checklist step 1/10 |
| E-2 | In `oidc-sync.ts`, the `account.create.after` link fires once — a failed first `persistAuthSubject` UPDATE leaves `auth_subject` NULL permanently. Keep the try/catch log-and-swallow (never abort login) BUT log the email on failure so the miss is recoverable, and record this one-shot-sync residual in the phase report. Do NOT add a re-sync path in this plan (scope) — the follow-up is backlogged as KG-4. | Writing `handleAuthentikAccountCreated` |
| E-3 | HIGH-RISK evidence pack (auth/identity) — assemble per `vc-risk-evidence-pack` in `{task-folder}/harness/` before treating work as finalize-ready: (a) real Authentik round-trip for a NEW allowlisted rep AND an EXISTING magic-link rep; (b) DB proof `crm_users.auth_subject` populated for both, ABSENT for a non-allowlisted login; (c) magic-link still works; (d) `hooks.server.ts` byte-unchanged (`git diff --quiet`); (e) client secret not in logs/commits; (f) confirm `email_verified=true` in userinfo (closes the KG-1 `trustedProviders` residual). Automated gates alone do NOT close this class. | Before finalize / after `AUTHENTIK_CLIENT_SECRET` lands on dev `.env` |
| E-4 | Do NOT edit `hooks.server.ts` (verify-only touchpoint) and do NOT run `db:generate`/`db:push` — `crm_users.auth_subject` + `crm_users_auth_subject_uq` already exist; no migration. Confirm byte-unchanged in the phase report. | `hooks.server.ts` / schema steps |
| E-5 | Route the login button `callbackURL` through the already-sanitized `data.from ?? '/'` — do NOT read `from` from the URL directly in the component. | `login/+page.svelte` edit |

### Known Gaps (pre-accepted — EXCLUDED from CONCERN/FAIL count)
Sourced from the plan's `## Known Gaps (Resolved via Backlog)` section. Per V3 known-gap exclusion these are pre-classified residuals and do NOT count toward CONDITIONAL/BLOCKED determination. KG-1 and KG-2 are the two named behaviors that trigger the vacuous-green bar on the terminal PASS *label*.
- KG-1 — Live authorization-code round-trip incl. real `email_verified` value: Agent-Probe → resolution C, manual `vc-risk-evidence-pack` at EXECUTE once `AUTHENTIK_CLIENT_SECRET` lands on dev `.env` (E-3). Carried from the VIABLE feasibility verdict. [vacuous-green: integrated end-to-end sign-in flow]
- KG-2 — Login-button render/click e2e: Known-Gap → blocked on the shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Repo-wide pre-existing blocker; no new fixture built here. [vacuous-green: rendered `/login` Authentik button]
- KG-3 — Production redirect URI registration in Authentik: Known-Gap → deploy-time step (dev redirect `http://localhost:5173/api/auth/oauth2/callback/authentik` only today).
- KG-4 — `auth_subject` one-shot re-sync edge (E-2): documented residual → backlog stub `process/features/auth/backlog/auth-subject-resync-on-login_NOTE_13-07-26.md`; contained by the non-blocking hook + email-keyed gate.

### Open gaps (CONCERN/FAIL-counting)
None — all 3 first-pass CONCERNs (Security surface, Section A, Section B) were resolved by the PVL cycle-1 supplement. The only residuals are the pre-accepted Known-Gaps KG-1..KG-4 above, which do not count toward the gate tally.

### What This Coverage Does NOT Prove
- `bun run test:unit:ci` (Fully-Automated): proves the SQL shape, hook guard, and static config wiring. Does NOT prove a real OIDC token exchange, that Authentik returns the expected claim shape at runtime, or that a live session is created — no live provider or DB in the unit run.
- `SKIP_DB` Hybrid gate: proves `auth_subject` persistence against a real Postgres. Does NOT prove the OIDC redirect/callback flow, the account-link path, or session issuance — it invokes the hook directly, bypassing the OAuth exchange.
- `grep` + `git diff --quiet` on `hooks.server.ts`: proves the security gate file is byte-unchanged and the callback prefix is public. Does NOT prove the gate rejects a non-allowlisted Authentik login at runtime (that is the KG-1 round-trip agent-probe).
- `bun run check` / `bun run lint`: prove types and formatting. Prove nothing about runtime auth behavior.
- Agent-probe round-trip (KG-1): closes end-to-end sign-in + `email_verified`. Until captured, the integrated auth flow and the rendered login button (KG-2) are UNPROVEN by automation — this is exactly the vacuous-green residual that keeps the gate CONDITIONAL rather than terminal PASS.

Gate: CONDITIONAL (terminal / accepted — EXECUTE-legal: 0 FAILs, 0 CONCERNs; terminal PASS barred solely by the vacuous-green ban on two Known-Gap/Agent-Probe-only behaviors — rendered login button KG-2 + integrated sign-in flow KG-1; high-risk end-to-end proof deferred to the manual evidence pack per plan Phase Completion Rules)
Accepted by: session (VALIDATE re-validation, PVL cycle 1) — basis: (a) ≥1 completed PVL fix cycle (results.tsv = header + baseline + cycle-1 supplement row) and (b) the plan's own `## Known Gaps (Resolved via Backlog)` section, which formally pre-accepts each named residual (KG-1 live round-trip, KG-2 login-button e2e, KG-3 prod redirect URI, KG-4 one-shot re-sync edge) and states they do NOT bar EXECUTE. No in-session user was present to add a separate acceptance; the accepted concern-classes carried into EXECUTE are the vacuous-green residuals KG-1 (end-to-end sign-in / `email_verified`, closed by the E-3 high-risk manual evidence pack) and KG-2 (login-button render, closed by the repo-wide shared Playwright fixture).

## Autonomous Goal Block

```
SESSION GOAL: Wire Authentik OIDC (Better Auth genericOAuth) into veent-crm alongside magic-link; persist the IdP sub into crm_users.auth_subject via account.create.after; keep the email allowlist gate unchanged.
Charter + umbrella plan: N/A — single standalone plan (process/features/auth/active/authentik-oidc-integration_13-07-26/authentik-oidc-integration_PLAN_13-07-26.md)
Autonomy: standard interactive RIPER-5 (no /goal program). VALIDATE gate is CONDITIONAL — user/orchestrator must accept the named known-gaps before EXECUTE. No source edits by orchestrator; spawn vc-execute-agent for all implementation.
Hard stop conditions / safety constraints:
- Do NOT weaken or edit hooks.server.ts — the crm_users email+active allowlist gate is the security boundary and must stay byte-unchanged (git diff --quiet).
- Never log or commit AUTHENTIK_CLIENT_SECRET; server-only via $env/dynamic/private.
- Never create a crm_users row for a non-allowlisted identity (UPDATE-by-email only, no INSERT).
- No Drizzle migration and no Better-Auth-table migration (auth_subject column + unique index already exist).
- HIGH-RISK auth/identity: do not mark VERIFIED on automated gates alone — the manual-first evidence pack (vc-risk-evidence-pack) is required.
Next phase: EXECUTE (after user accepts the CONDITIONAL known-gaps) — plan path above; checklist steps 1→12 in order, TDD red-first.
Validate contract: inline in plan (## Validate Contract, Gate: CONDITIONAL, generated-by: outer-pvl).
Execute start: Fully-automated gates: `bun run check` | `bun run test:unit:ci` | `bun run lint`. Hybrid (precondition live PG): `bun run test:unit:ci` with SKIP_DB unset. Agent-probe: manual Authentik round-trip + evidence pack. high-risk pack: yes (E-3).
```
