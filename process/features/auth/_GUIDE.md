# auth

<!-- Part of veent-crm -->

## Scope

Authentication and session management for the CRM. Covers Better Auth integration (magic-link
email via Resend), allowlisted user onboarding, session gate in `hooks.server.ts`, and future
Authentik OIDC migration. Better Auth is live-wired — there is no DEV_BYPASS stub in this codebase.

## Key Source Files

- `src/hooks.server.ts` — session gate; resolves a real Better Auth session, enforces the
  `crm_users` allowlist, and splits unauthenticated redirects into `/login` (no session) vs
  `/unauthorized` (session but not allowlisted)
- `src/lib/server/auth.ts` — live Better Auth configuration (`betterAuth()` + `drizzleAdapter` +
  `magicLink` plugin)
- `src/lib/server/email.ts` — Resend email integration (live; sends magic-link/welcome emails when
  `RESEND_API_KEY`/`RESEND_FROM` are set)
- `src/lib/server/sanitize-redirect.ts` — shared `sanitizeFrom` open-redirect guard used by both
  `/login` and `/unauthorized`
- `src/routes/login/+page.svelte` — login page UI

## Related Context

- `process/context/all-context.md` — stack overview
- `process/context/tests/all-tests.md` — test commands

## Current Status

Status: in-progress (Better Auth live-wired; `/login` vs `/unauthorized` redirect split and
`?from=` preservation code-complete and EVL-green — full magic-link email-click round trip remains
a known-gap pending live Postgres/Resend test infra)

## Folder Contents

```
process/features/auth/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
