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

Last updated: 2026-06-25

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
- **DEV_BYPASS in e2e** — Playwright tests will hit the real session gate; set `DEV_BYPASS = true` during e2e to avoid auth flows until Better Auth is wired
- **Playwright browser install** — `playwright install` is run automatically by `test:e2e` script; if browsers are missing, run `bunx playwright install` manually
- **Type errors vs test errors** — always run `bun run check` first; many "test failures" are actually TypeScript errors caught earlier

---

## Known Gaps

- Only one unit test file exists: `src/tests/schemas.spec.ts` (Zod schema validation)
- No unit tests yet for `src/lib/server/` logic (auth stubs, reminders, mock data)
- No e2e test specs written yet — Playwright is configured but has no test files
- No test coverage for Drizzle queries (all surfaces still on mock data)
- Integration tests (real DB) are not set up — will be needed for v1 DB wiring
