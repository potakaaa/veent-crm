# auth

<!-- Part of veent-crm -->

## Scope

Authentication and session management for the CRM. Covers Better Auth integration (magic-link
email via Resend), allowlisted user onboarding, session gate in `hooks.server.ts`, and future
Authentik OIDC migration. The DEV_BYPASS stub (fake manager injection) is temporary and must be
removed when Better Auth is wired.

## Key Source Files

- `src/hooks.server.ts` — session gate (currently stubs a fake manager via DEV_BYPASS)
- `src/lib/server/auth.ts` — Better Auth configuration (stub for v0)
- `src/lib/server/email.ts` — Resend email integration (stub for v0)
- `src/routes/login/+page.svelte` — login page UI

## Related Context

- `process/context/all-context.md` — stack overview
- `process/context/tests/all-tests.md` — test commands

## Current Status

Status: not-started (v0 stub — DEV_BYPASS active)

## Folder Contents

```
process/features/auth/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
