# Phase 4 Verification Notes

Date: 2026-06-29
Domain: crm-build
Phase: 4 — Lead list + detail + add

---

## Verdict

**Partially verified.** All DB-layer behavior verified via integration tests and static review. Full UI flow (browser create → redirect → detail) not run through Playwright — requires a live Better Auth session which cannot be scripted without additional test tooling.

---

## Gates Run

| Gate | Result |
|---|---|
| `bun run check` (svelte-check) | PASS — 0 errors, 0 warnings |
| ESLint on Phase 4 server files | PASS — 0 errors after fixing AgeType |
| Prettier on Phase 4 files | PASS — 1 file reformatted |
| `bun run test:unit:ci` (unit) | PASS — 40/40 |
| `bun run test:unit:ci` (unit + DB integration) | PASS — 48/48 |

---

## Acceptance Criteria Results

| # | Criterion | Status | Method |
|---|---|---|---|
| 1 | `/leads` loads real leads from DB | ✅ Verified | DB integration test: `listLeads()` roundtrip |
| 2 | Empty DB shows empty state | ✅ Verified | Static: `LeadGrid` `{:else}` block + DB at 0 leads |
| 3 | Existing lead opens on `/leads/[id]` | ✅ Verified | DB integration test: `getLead` roundtrip |
| 4 | Nonexistent ID returns 404 | ✅ Verified | DB test: `getLead` returns null; static: `throw error(404)` |
| 5 | `/leads/new` creates via UI | ⚠️ Partially | Static: fetch → `/api/leads` → createLead chain; UI not run |
| 6 | Created lead persists in DB | ✅ Verified | DB integration test: insert then query by ID |
| 7 | Redirect to detail after create | ⚠️ Partially | Static: `goto('/leads/${id}')` present; UI not run |
| 8 | Invalid submission no DB row | ✅ Verified | Unit test: schema rejects; static: error(400) before createLead |
| 9 | Errors surfaced without crash | ✅ Verified | Static: try/catch + error state in Svelte + `throw error(400)` in API |
| 10 | Phase 5 mutations not blockers | ✅ Verified | Static: all 5 mutations wrapped in try/catch with Phase 5/6 toasts |

---

## Bugs Found and Fixed

- **`AgeType` unused import** in `src/lib/server/db/leads.ts:8` — ESLint error (`@typescript-eslint/no-unused-vars`). Fixed by removing from import list.

---

## Pre-existing Issues (Not Introduced by Phase 4)

ESLint warnings in unchanged/pre-existing Svelte code:
- `svelte/require-each-key` in `+page.svelte` `#each` blocks — present before Phase 4
- `svelte/no-navigation-without-resolve` for `href` links in `[id]/+page.svelte` — pre-existing
- `svelte/no-navigation-without-resolve` for `goto()` in `new/+page.svelte` — the `goto()` call itself is pre-existing pattern (was in the original `crm.createLead` block); Phase 4 replaced the argument only
- Prettier formatting issues in ~150 non-Phase-4 files — pre-existing repo-wide

---

## Architecture Note: `ssr = false` + `+page.server.ts`

`+layout.ts` sets `ssr = false` for the whole app. This makes the app a client-rendered SPA (empty HTML shell on initial request). However, `+page.server.ts` load functions **still run on the server** — data is delivered to the client via SvelteKit's internal `__data.json` fetch mechanism, not baked into HTML. The leads page correctly receives real DB leads via this mechanism.

The `+layout.ts` also calls `crm.*` mock services for nav badge counts and the command bar search. These remain on mock data because Phase 4's scope is page-level loads only. The AppShell's `leads` prop (used for command bar) comes from the layout's mock `crm.listLeads()`, not from the page server loads. This is known and deferred.

---

## DB Integration Test Pattern

`src/tests/leads-db.spec.ts` — importable because:
- Vitest uses the SvelteKit Vite plugin (`vite.config.ts`)
- The plugin resolves `$env/dynamic/private` as `process.env` at test time
- `DATABASE_URL` not set → fallback `postgres://crm:crm@localhost:5432/veent_crm` used
- Docker container exposed at `127.0.0.1:5432` → connection succeeds

Test cleanup: `afterAll` hard-deletes rows with the `__inttest__` name prefix. Confirmed 0 rows remain after test run.

---

## Remaining Unverified Items

1. **UI create flow end-to-end** — Playwright e2e requires a running dev server with a valid Better Auth session. No current e2e scaffolding for authenticated flows. To verify manually: log in, go to `/leads/new`, fill and submit a valid form, confirm redirect to `/leads/{uuid}`, confirm row in DB.

2. **`+layout.ts` nav counts on real data** — The AppShell badge counts (overdue, unassigned, review) still read from mock data. This is Phase 5+ work.

---

## For Next Phase

Before Phase 5, consider:
- Adding a Playwright test fixture for auth session (session cookie injection or test-only bypass route)
- Writing one e2e spec covering: login → list → new → create → detail redirect → DB assertion
