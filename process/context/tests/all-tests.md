---
name: context:tests
description: Test runner selection, commands, and verification guide for veent-crm
metadata:
  node_type: group-entrypoint
  type: context
  read_order: 2
  required: false
  read_when: task involves testing, verification, running tests, or debugging test failures
  keywords: [testing, vitest, playwright, test commands, verification, unit tests, e2e]
---

# veent-crm - All Tests

Last updated: 2026-07-01

Attach this file first when the task involves testing, verification, or test debugging.

---

## What This Covers

- Test runner selection (Vitest vs Playwright)
- Quick commands
- Current testing state and gaps

## Read This When

- Running tests after implementation
- Deciding between test runners
- Debugging failing tests
- Writing new tests

## Quick Routing

(No deeper test docs yet — single-app project with two runners.)

---

## Quick Decision Guide

### Use `vitest` when

- Testing Zod schemas, utility functions, or server-side logic
- The change is in `src/lib/`, `src/lib/zod/`, or `src/lib/server/` (non-auth)
- Running fast unit coverage without a live DB

### Use Playwright when

- Testing real navigation, auth redirects, or full-page rendering
- Verifying a complete user flow end-to-end (e.g., login → leads list → detail)
- The behavior depends on the real SvelteKit SSR response

---

## Default Verification Order

Unless the task clearly needs a different path:

1. `bun run check` — TypeScript + Svelte type check (fastest, catches most regressions)
2. `bun run test:unit` — Vitest unit tests
3. `bun run test:e2e` — Playwright e2e (only when UI flows are the subject)

---

## Commands

| Runner           | Command             | Notes                              |
| ---------------- | ------------------- | ---------------------------------- |
| Type check       | `bun run check`     | svelte-check + tsc — run first     |
| Vitest (unit)    | `bun run test:unit` | Runs `vitest --run`                |
| Playwright (e2e) | `bun run test:e2e`  | Installs browsers first, then runs |
| All tests        | `bun run test`      | unit + e2e (sequential)            |
| Lint             | `bun run lint`      | Prettier + ESLint                  |
| Format           | `bun run format`    | Prettier write                     |

**Single file (vitest):**

```bash
bun run test:unit -- src/tests/schemas.spec.ts
```

**Watch mode (vitest):**

```bash
bun run test:unit -- --watch
```

**DB commands (need live Postgres):**

```bash
bun run db:generate   # regenerate Drizzle migration from schema (no DB needed)
bun run db:push       # push schema directly (dev only)
bun run db:migrate    # apply migrations (needs DATABASE_URL)
```

---

## Debugging Quick Reference

- **No live DB needed for unit tests** — `src/lib/server/db/index.ts` uses a lazy pool; vitest never opens a connection unless a test calls `db.*`
- **No DEV_BYPASS anymore — real Better Auth session gate.** `DEV_BYPASS` was removed from `hooks.server.ts`; it is now a real Better Auth session check cross-referenced against a `crm_users` allowlist row. There is NO Playwright auth-bootstrap mechanism (no `globalSetup`, no `storageState`, no test-only login shortcut) — every e2e spec that `goto()`s a protected route redirects to `/login` and must self-skip via an explicit `test.skip()` guard (see the `loading-ux.e2e.ts` / `calendar.e2e.ts` pattern) until the shared auth fixture backlog item is resolved (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Do not write an e2e spec that assumes it is signed in without this guard.
- **Playwright browser install** — `playwright install` is run automatically by `test:e2e` script; if browsers are missing, run `bunx playwright install` manually
- **Playwright install `ENOSPC` (disk full)** — if `bun run test:e2e` fails downloading a browser binary (commonly WebKit) with `ENOSPC`, this is a local disk-space issue, not a code/test problem. Workaround: run the spec directly against an already-installed browser project only (e.g. `bunx playwright test e2e/{spec}.e2e.ts --project=chromium`) to confirm the spec builds/serves/self-skips correctly; do not attempt to free disk space as part of a test-fix task — flag it to the user instead.
- **Type errors vs test errors** — always run `bun run check` first; many "test failures" are actually TypeScript errors caught earlier

---

## Known Gaps

- Unit test files have grown well beyond the original 2 (schemas, reminders) — 263 passed / 70 skipped as of 2026-07-01 (`bun run test:unit:ci`). See individual feature reports for per-feature counts.
- **e2e specs now exist** (Playwright is no longer empty): `e2e/leads-discard.e2e.ts`, `e2e/leads-new-dedup-hover.e2e.ts`, `e2e/loading-ux.e2e.ts`, `e2e/ufg-inline-edit.e2e.ts`, `e2e/unassigned-filters.e2e.ts`, `e2e/calendar.e2e.ts`, `e2e/mobile-nav.e2e.ts` (added 02-07-26, ux-enhancement Phase 1). **All of them currently self-skip against protected routes** because there is no Playwright authenticated-session harness — see the auth-gate note above and `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. This is the single highest-leverage test-infra gap in the repo right now (blocks e2e verification for meeting-reminders, GitHub #91 filters, calendar, and now the ux-enhancement phase program's own new scenarios).
- **`@axe-core/playwright` not installed** — no automated accessibility-audit dependency exists yet. The `ux-enhancement` phase program's AC4 (accessibility) gates fall back to Agent-Probe (manual axe DevTools review) until this is resolved as a program-level decision — see `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`.
- No test coverage for Drizzle queries beyond what individual features add DB-free (via `.toSQL()`/condition-array assertions) or `SKIP_DB`-gated Hybrid specs
- Integration tests (real DB) not set up — several Hybrid gates across features (reminders/activities, calendar AC2/AC3) remain manual/one-time-checked until a live-DB CI harness exists

## Test Patterns (from reminders implementation)

**`$env/dynamic/private` mock in Vitest:**

To test code paths gated on missing env keys without real environment setup:

```ts
vi.mock('$env/dynamic/private', () => ({ env: {} }));
```

This forces the `!env.RESEND_API_KEY` code path deterministically. Use in any test that exercises a "key not set" fallback in `src/lib/server/email.ts` or similar.

**Vitest CI command:** `bun run test:unit:ci` (runs `vitest --run`). Do not use `bun test` — that invokes Bun's native runner, not Vitest.
