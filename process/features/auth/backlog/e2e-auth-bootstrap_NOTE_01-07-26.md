---
name: plan:e2e-auth-bootstrap-note
description: "Repo-wide gap — no e2e session bootstrap exists for real Better Auth; all Playwright specs targeting protected routes silently self-skip or fail — NEW PLAN REQUIRED"
date: 01-07-26
feature: auth
---

## e2e-auth-bootstrap — NEW PLAN REQUIRED

Date: 2026-07-01
Source: VALIDATE pass on `process/features/leads/active/ufg-country-category-filters_01-07-26/ufg-country-category-filters_PLAN_01-07-26.md` (GitHub #91) — Layer 1 Test Coverage + Layer 2 Section D feasibility check.

### Gap

Real Better Auth (magic-link + `crm_users` allowlist) is fully live-wired in `src/hooks.server.ts` —
there is **no `DEV_BYPASS` stub anymore** (confirmed: zero matches for `DEV_BYPASS` in
`hooks.server.ts`; it only appears in stale code comments inside existing e2e spec files).
Every route except `/login`, `/unauthorized`, `/health`, and the secret-authed `/api/*`
endpoints requires a real Better Auth session **and** an active `crm_users` allowlist row
(`hooks.server.ts` lines 17-59).

No e2e session-bootstrap mechanism exists anywhere in the repo:
- No Playwright `globalSetup`, no `storageState`, no `test.use({ storageState })`.
- No test-only auth shortcut, seeded session cookie, or Better Auth test helper.
- `playwright.config.ts` has no auth wiring at all.

**Consequence:** all 4 existing e2e specs (`e2e/leads-discard.e2e.ts`,
`e2e/leads-new-dedup-hover.e2e.ts`, `e2e/loading-ux.e2e.ts`, `e2e/ufg-inline-edit.e2e.ts`) —
each of which still carries a stale doc-comment claiming `DEV_BYPASS=true (hard-coded true in
hooks.server.ts)` as their precondition — currently hit the real Better Auth gate when run
against a protected route (`/unassigned`, `/leads/*`, `/review`). Since none of these specs
seed a session, every `page.goto()` to a protected route redirects to `/login`, and the
tests' own `test.skip(count === 0, 'no ... seeded')` guards then falsely interpret "redirected
to an empty /login page" as "no data seeded" — masking a real auth failure as a silent skip.
At least one strict-assertion case (`ufg-inline-edit.e2e.ts` AC5: expects `res.status() >= 400`
for `/review`) is not self-skipping and would fail outright, since the final response after
following the `/login` redirect chain is `200`, not `>= 400`.
`.github/workflows/ci.yml` does run `bunx playwright test --pass-with-no-tests` on every push/PR,
so this has been silently masking (or failing) in CI since Better Auth was wired
(commit `79a229c`, before any of the 4 e2e specs were added).

### Files outside blast radius

- `playwright.config.ts` (needs `globalSetup` / `storageState` wiring)
- A new e2e auth-bootstrap helper (e.g. `e2e/helpers/auth.ts` or similar — path TBD by the
  plan that picks this up)
- Possibly `src/lib/server/auth.ts` if a test-only session-seed API is added (design decision,
  not fixed here)
- All 4 existing e2e spec files (doc-comment corrections once the real mechanism is designed)

### New API surface

N/A — files-only infra gap, unless the chosen design needs a new test-only endpoint or Better
Auth plugin option (an INNOVATE-level decision, not fixed here).

### Suggested resolution shapes (not decided — INNOVATE work for the follow-up plan)

1. **DB-seeded session + cookie injection** — magic-link's `sendMagicLink` already
   `console.log`s the URL in dev; a Playwright `globalSetup` could complete that flow
   programmatically (fetch the magic-link URL, follow it, capture the resulting session
   cookie) and save it via `storageState`.
2. **Direct session-row seed** — insert a `baSession` row + matching cookie directly via
   Drizzle in a `globalSetup`, bypassing the email round-trip entirely (faster, more
   deterministic, but couples the e2e harness tightly to Better Auth's internal session
   schema).
3. **Better Auth test utilities** — check whether `better-auth` ships an official testing
   plugin/helper for exactly this use case before building a bespoke one.

### Recurrence (updated 01-07-26)

This gap has now blocked e2e verification for **two more features** since it was first written:

- **meeting-reminders** (`process/features/reminders/active/meeting-reminders_01-07-26/`) — no
  e2e spec was even attempted for the reminder-dispatch UI surfaces because of this gap.
- **calendar** (`process/features/calendar/completed/calendar_01-07-26/`) — `e2e/calendar.e2e.ts`
  (8 scenarios covering AC1, AC4–AC9, and the `/meetings/[id]` 404 defensive gate) is written and
  discovered by Playwright but every scenario self-skips via `test.skip()` gated on auth-redirect
  detection, the same pattern as `loading-ux.e2e.ts`. Source-verified as genuinely self-skipping
  (not silently passing) but genuinely unexercised — none of AC1/AC4/AC5/AC6/AC9/404 have live
  automated coverage yet.

This is now the single highest-leverage test-infra gap in the repo — resolving it unblocks
verification for every protected-route e2e spec written so far, not just future ones. Recommend
prioritizing a standalone test-infra plan for the shared Playwright authenticated-session fixture
(see "Suggested resolution shapes" below — a `globalSetup` that logs in via magic-link or a direct
session-row seed, then reuses `storageState` across specs, is the most promising approach).

### Interim mitigation used by the GitHub #91 filters plan

Server-side filter correctness (AC2, AC3, AC4, AC11) is proven via `Hybrid` Vitest DB-integration
tests calling `listUnassignedLeads()` / `getUnassignedLeadCountries()` directly — bypassing
HTTP and auth entirely, following the existing `describe.skipIf(SKIP_DB)` precedent in
`src/tests/leads-filters.spec.ts`. Pure UI/browser-only ACs (AC1, AC5, AC6, AC7, AC8, AC9's
empty-state render, AC10, AC13) remain genuinely unverified by automation until this gap is
resolved — see the GitHub #91 plan's validate-contract `## Known Gaps (Resolved via Backlog)`
section for the accepted-gap list.
