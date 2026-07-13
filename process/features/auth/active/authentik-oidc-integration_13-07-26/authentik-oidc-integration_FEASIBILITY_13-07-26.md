---
slug: authentik-oidc-integration
date: 2026-07-13
verdict: VIABLE
originating-phase: spec
---

# Feasibility Verdict — Authentik OIDC via better-auth genericOAuth

## Hypothesis

`better-auth@1.6.20`'s `genericOAuth` plugin can integrate the live Authentik instance at
`https://auth.veent.io` as an OIDC provider for veent-crm, keyed on verified email (with the
IdP `sub` stored in the pre-existing dormant `crm_users.auth_subject` column).

## Mechanism Under Test

Two runtime mechanisms, both empirically checked rather than assumed from docs:

1. **Authentik side** — does `auth.veent.io` expose a working OIDC discovery document with the
   endpoints, scopes, claims, and PKCE support `genericOAuth` needs, and is there already a
   veent-crm application configured?
2. **better-auth side** — does the installed `genericOAuth` plugin's runtime code (not just its
   `.d.ts` types) actually consume `discoveryUrl`, map `email_verified` → `emailVerified`, and
   expose the raw IdP `sub` claim to `mapProfileToUser` so it can be persisted into an
   application-level column?

## Probe Family

4 — External API shape capture (Authentik discovery doc + DB read) combined with 1 — Local
process / Node script (reading the installed `better-auth` package source directly, no script
execution needed — static read of the compiled runtime `.mjs`, not the `.d.ts` types).

## Probe Cost Class

`needs-live-provider` (SSH + read-only queries against the live Authentik droplet; one live
HTTPS GET against the public discovery endpoint). Double opt-in was granted by the user in the
task instructions. Gate met — probe ran for real, no gate-not-met fallback needed.

## Probe Method

All commands read-only (SELECT / GET / file read). Zero writes anywhere.

1. SSH reachability + container inventory:
   ```
   ssh -o BatchMode=yes -o ConnectTimeout=12 authentik 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"'
   ```
2. Enumerate existing OAuth2/OIDC providers + applications (read-only SQL, redacted secrets):
   ```
   ssh authentik 'docker exec authentik-postgresql-1 psql -U authentik -d authentik -tAF"|" -c
     "SELECT a.slug, a.name, p.client_id, p.client_type, p.sub_mode, p.issuer_mode,
             p._redirect_uris::text
      FROM authentik_core_application a
      JOIN authentik_providers_oauth2_oauth2provider p ON a.provider_id = p.provider_ptr_id;"'
   ```
   (First attempt used a non-existent `p.redirect_uris` column name; corrected to the real
   column `p._redirect_uris` after Postgres returned a `HINT`.)
3. Fetch the live OIDC discovery document, once from the droplet and once from the local
   veent-crm dev box (to confirm public DNS/TLS reachability, since better-auth's server process
   will fetch this from outside the droplet):
   ```
   ssh authentik 'curl -fsS https://auth.veent.io/application/o/veent-sched/.well-known/openid-configuration'
   curl -fsS -m 10 https://auth.veent.io/application/o/veent-sched/.well-known/openid-configuration -w "HTTP_STATUS:%{http_code}\n"
   ```
4. Static read of the installed `genericOAuth` plugin's compiled runtime source (not the
   `.d.ts` type declarations) to confirm the discovery-consumption and claim-mapping logic
   actually exists in the code path that runs, not just in the type surface:
   ```
   grep -n "email_verified|emailVerified|mapProfileToUser|discoveryUrl|pkce|getUserInfo" \
     node_modules/better-auth/dist/plugins/generic-oauth/index.mjs
   grep -n "email_verified|emailVerified|email" \
     node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs
   ```
   Then read the full `getUserInfo()` helper (routes.mjs L392-419) and the plugin's
   `getUserInfo` wrapper + `mapProfileToUser` call site (index.mjs L110-136) in full.

## Evidence Captured

**Existing Authentik applications/providers (client_secret REDACTED — never queried/printed):**

| slug | name | client_type | sub_mode | redirect_uris |
|---|---|---|---|---|
| `veent-sched` | Veent Sched | confidential | `hashed_user_id` (per_provider) | `https://sched.veent.io/auth/callback`, `http://localhost:5173/auth/callback` |
| `nextcloud` | Nextcloud | confidential | `hashed_user_id` (per_provider) | `https://team.veent.io/apps/user_oidc/code` |

**No existing veent-crm/CRM application exists yet.** A new confidential-client OAuth2
provider + application must be created in Authentik for veent-crm before integration (out of
scope for this probe — this is a config step, not a feasibility blocker).

**Live discovery document** (`https://auth.veent.io/application/o/veent-sched/.well-known/openid-configuration`,
`HTTP_STATUS:200` from both the droplet and the external veent-crm dev box):

```json
{
  "issuer": "https://auth.veent.io/application/o/veent-sched/",
  "authorization_endpoint": "https://auth.veent.io/application/o/authorize/",
  "token_endpoint": "https://auth.veent.io/application/o/token/",
  "userinfo_endpoint": "https://auth.veent.io/application/o/userinfo/",
  "jwks_uri": "https://auth.veent.io/application/o/veent-sched/jwks/",
  "end_session_endpoint": "https://auth.veent.io/application/o/veent-sched/end-session/",
  "response_types_supported": ["code", "id_token", "id_token token", "code token", "code id_token", "code id_token token"],
  "grant_types_supported": ["authorization_code", "refresh_token", "implicit", "client_credentials", "password", "urn:ietf:params:oauth:grant-type:device_code"],
  "subject_types_supported": ["public"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "scopes_supported": ["openid", "email", "profile"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "auth_time", "acr", "amr", "nonce",
                        "email", "email_verified", "name", "given_name", "preferred_username",
                        "nickname", "groups"],
  "code_challenge_methods_supported": ["plain", "S256"]
}
```

A per-application discovery doc will exist once a veent-crm app/provider is created in
Authentik (path pattern `/application/o/<slug>/.well-known/openid-configuration`); the shape
above (endpoints/scopes/claims/PKCE) is instance-wide and will be identical for a new app —
only `issuer`/`jwks_uri`/`end_session_endpoint` change per-slug.

**better-auth `genericOAuth` runtime source (compiled `.mjs`, actually executed — not just
`.d.ts` types):**

- `index.mjs` L43-113: when `c.discoveryUrl` is set, the plugin fetches it via `betterFetch`
  at authorization-URL-build time, token-exchange time, and token-refresh time, and derives
  `authorization_endpoint` / `token_endpoint` / `userinfo_endpoint` from the discovery response
  rather than requiring them to be hand-listed.
- `index.mjs` L63: `codeVerifier: c.pkce ? data.codeVerifier : void 0` — `pkce: true` is
  consumed at the OAuth2 authorize-URL-build step.
- `routes.mjs` L392-419 (`getUserInfo` helper, used when no custom `c.getUserInfo` is
  supplied): decodes the ID token JWT (or falls back to a `GET` on the discovered
  `userinfo_endpoint`) and returns `{ id: decoded.sub, emailVerified: decoded.email_verified,
  email: profile?.email, emailVerified: profile?.email_verified ?? false, ... }` — the
  OIDC `email_verified` claim (confirmed present in Authentik's `claims_supported` above) is
  mapped directly onto `emailVerified` by default, no custom mapper required.
- `index.mjs` L116-133 (plugin's `getUserInfo` wrapper): calls `c.mapProfileToUser?.(userInfo)`
  with the **raw IdP profile including `.id`/`.sub`**, then spreads the mapper's return value
  (`userMap`) onto the final `user` object: `{ email, emailVerified, image, name, ...userMap,
  id: String(rawId) }`. This confirms the raw Authentik `sub` claim (available as
  `userInfo.id`/`userInfo.sub`) reaches application code inside `mapProfileToUser`, where it
  can be captured and persisted (e.g. via a `databaseHooks.user.create.after` hook) into
  `crm_users.auth_subject` — the merge point that lands fields on the core Better Auth `user`
  table is `...userMap` on the `user:` object, so any app-level column not on that table
  needs an explicit hook, not automatic mapping.

## Verdict: VIABLE

## Probe Cost Class

`needs-live-provider` — read-only SSH + one live public HTTPS GET. Double opt-in was granted;
gate met; probe ran for real (not gate-not-met/INCONCLUSIVE).

## Resulting Design Constraint

- **What this licenses:** The design may configure `genericOAuth` with
  `discoveryUrl: 'https://auth.veent.io/application/o/<crm-slug>/.well-known/openid-configuration'`
  instead of hand-listing the four OAuth2 endpoints — the discovery document is live, public,
  reachable from outside the droplet, and returns everything genericOAuth's discovery-consuming
  code path (index.mjs L43-113) reads. `pkce: true` is viable (`S256` is advertised and
  code-path-consumed). The `email` claim will land on `session.user.email` by default (no
  custom mapper needed) via `routes.mjs` L210/229, so the existing `crm_users` allowlist gate in
  `hooks.server.ts` keeps working unchanged. `email_verified` maps to `emailVerified` by default
  with zero custom code. The raw IdP `sub` is available as `userInfo.id`/`userInfo.sub` inside
  `mapProfileToUser`, and per the existing `veent-sched`/`nextcloud` providers' `sub_mode:
  hashed_user_id` (per_provider) convention, `sub` will be stable per-user-per-application —
  safe to persist into `crm_users.auth_subject` via a `databaseHooks.user.create.after` (or
  equivalent) hook, since `mapProfileToUser`'s return only merges onto the core `user` table,
  not arbitrary app tables.
- **What this forbids:** Do NOT assume a veent-crm application/provider already exists in
  Authentik — none does today (only `veent-sched` and `nextcloud`); one must be created
  (confidential client, redirect URI to veent-crm's callback route) before any code change can
  be tested end-to-end. Do NOT rely on `mapProfileToUser`'s return value alone to populate
  `crm_users.auth_subject` — it only writes fields onto the Better Auth core `user` object, so
  the `auth_subject` persistence needs an explicit `databaseHooks` step, not implicit mapping.
- **What remains uncertain (known-gap):** A full authorization-code round-trip (redirect →
  Authentik login → callback → token exchange → `crm_users` row match) was NOT run — this probe
  is read-only by the double-opt-in cost-class rules and no veent-crm app credentials exist yet
  in Authentik. The `email_verified` value's *actual* runtime content for a real Authentik user
  (true/false) is unverified — only that the claim exists in `claims_supported` and that
  better-auth's code path correctly reads it when present. Treat the full round-trip as an
  EXECUTE-phase integration test, not settled by this probe.
