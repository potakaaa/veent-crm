---
phase: login-redirect-callback
date: 2026-07-01
status: COMPLETE
feature: auth
plan: process/features/auth/completed/login-redirect-callback_01-07-26/login-redirect-callback_PLAN_01-07-26.md
---

# Login Redirect Callback — EXECUTE Report

TL;DR: Issue #80 gap closed. `?from=` now flows unauthenticated → `/login` → magic-link `callbackURL`.
Open-redirect sanitizer extracted to a shared helper used by both `/login` and `/unauthorized`.
13 new unit tests added; all 3 verification gates green (13/13 new, `bun run check` 0 errors,
full suite 196 passed / 0 failed).

## What Was Done

| # | Checklist item | Result |
|---|---|---|
| 1 | `src/lib/server/sanitize-redirect.ts` (NEW) — extracted `sanitizeFrom` verbatim (all 4 rejection branches) | Done |
| 2 | `src/routes/unauthorized/+page.server.ts` — removed local def, imports shared helper | Done (behavior unchanged, `{ from }` return preserved) |
| 3 | `src/routes/login/+page.server.ts` (NEW) — `load` reads `?from=`, sanitizes, returns `{ from }` | Done |
| 4 | `src/hooks.server.ts:53` — `redirect(303, '/login')` → `redirect(303, '/login?from=' + encodeURIComponent(path))` | Done (allowlist logic lines 33-48 untouched) |
| 5 | `src/routes/login/+page.svelte` — `let { data } = $props();`, `callbackURL: data.from ?? '/'` | Done |
| 6 | (Optional) "You were trying to reach `{data.from}`" line on login page, mirroring `/unauthorized` | Done (trivial; mirrors existing wording/style) |
| 7 | `src/tests/hooks-server.spec.ts` (NEW) — cases 7a–7f | Done (13 tests) |
| 8 | `bun run test:unit -- src/tests/hooks-server.spec.ts` green | Green (13/13) |
| 9 | `bun run check` green | Green (0 errors) |
| 10 | `bun run test:unit:ci` regression pass | Green (196 passed, 54 skipped, 0 failed) |

Test cases 7e (sanitizeFrom direct coverage) and 7f (login load()) were written inline in
`src/tests/hooks-server.spec.ts` rather than a separate `sanitize-redirect.spec.ts` — the plan
explicitly permits either ("either inline in this file or in a new ... spec"). No separate file created.

## What Was Skipped or Deferred

- Nothing in scope was skipped. All 10 checklist items complete.
- AC#3 full magic-link email-click round trip remains a known-gap (agent-probe/manual) — infra-availability
  gap (no live Postgres + no `RESEND_API_KEY`/live inbox in this environment), accepted by VALIDATE, not a
  code-stub gap. Same class as the pre-existing accepted Hybrid gaps for reminders/activities.
- Explicit constraints honored: allowlist/`crmUsers` lookup untouched; dead-code redirect guards in
  `+page.server.ts` / `reminders/+page.server.ts` untouched; `root-login-redirect-fix_01-07-26` not touched.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| New spec | `bun run test:unit -- src/tests/hooks-server.spec.ts` | PASS — 13/13 |
| Type-safety | `bun run check` | PASS — 0 errors, 1 pre-existing warning (`leads/[id]/edit/+page.svelte`, not a touched file) |
| Full regression | `bun run test:unit:ci` | PASS — 196 passed, 54 skipped, 0 failed |

## Plan Deviations

1. **Test 7a assertion — `location` value.** Plan checklist item 7a's one-liner (line 112) says
   `location === '/login'`, but plan item 4 (line 103), the Touchpoints table, and AC#3 all change the
   redirect to `/login?from=' + encodeURIComponent(path)`. Item 4 is authoritative — it IS the feature.
   The 7a one-liner is stale relative to item 4. The test therefore asserts the real implemented
   behavior: `location.startsWith('/login')` is true AND `location === '/login?from=%2Fleads'`. Asserting
   the literal `=== '/login'` would contradict item 4 and mark correct code red. Classification:
   within-blast-radius (test-assertion detail, not a design choice); the assertion still fully satisfies
   AC#1 ("redirects to /login") and additionally proves the from-preservation the plan's core exists to add.
2. **First test-run failure (fixed, not a deviation):** initial `vi.mock` factory referenced top-level
   `const` mock fns → Vitest hoisting error. Fixed by moving them into `vi.hoisted(...)`. Standard Vitest
   mocking pattern; no scope change.

No other deviations. `sanitizeFrom` moved byte-for-byte (all 4 rejection branches identical).

## Test Infra Gaps Found

None new. The pre-existing `hooks.server.ts` redirect-coverage gap logged in
`process/context/tests/all-tests.md` §Known Gaps is now CLOSED for the 4 mockable cases (7a–7d) plus the
2 VALIDATE-added direct-coverage gaps (7e shared helper, 7f login load()). The AC#3 full round-trip
remains a known-gap (infra availability), unchanged.

## Closeout Packet

- **Selected plan:** `process/features/auth/completed/login-redirect-callback_01-07-26/login-redirect-callback_PLAN_01-07-26.md`
- **Finished:** all 6 touchpoint files implemented; 3 verification gates green.
- **Verified:** hooks redirect routing (7a–7d), shared sanitizer branches (7e), login load() (7f),
  type-safety, full-suite regression — all via automated Vitest + svelte-check.
- **Still unverified:** AC#3 full magic-link email-click round trip (accepted known-gap — needs live
  Postgres + Resend/inbox); `+page.svelte`'s `callbackURL: data.from ?? '/'` consumption is proven only
  by static review + the load() unit test, not a component render test (out of this plan's Vitest scope).
- **Cleanup remaining (for UPDATE PROCESS):** the two stale-doc fixes bundled by the plan —
  `process/context/all-context.md` §Auth/session conventions ("DEV_BYPASS active" + "all unauth hits →
  /unauthorized") and `process/features/auth/_GUIDE.md` §Current Status ("not-started v0 stub — DEV_BYPASS
  active"). Better Auth is live-wired (`src/lib/server/auth.ts` is a real `betterAuth()` config); no
  `DEV_BYPASS` reference exists in `hooks.server.ts`. ONE edit covers both this plan's and
  `root-login-redirect-fix_01-07-26`'s flagged fix — do not duplicate.
- **Best next state:** `Ready for UPDATE PROCESS archival` (after the EVL confirmation run passes).
- **Note:** `root-login-redirect-fix_01-07-26` remains open (its own EVL + UPDATE PROCESS pending) —
  a separate, pre-existing loose end; not closed or conflated by this plan.

## Forward Preview

### Test Infra Found
Vitest `vi.hoisted` + `vi.mock` is the working pattern for mocking `$lib/server/auth` and the Drizzle
chain (`db.select().from().where().limit()`) in `hooks.server.ts` tests. `isRedirect()` from
`@sveltejs/kit` is the correct way to assert on thrown SvelteKit redirects. `$env/dynamic/private`
mock (`{ env: {} }`) reused from `reminders.spec.ts`.

### Blast Radius Changes
New exported `sanitizeFrom` in `src/lib/server/sanitize-redirect.ts` — now imported by both
`src/routes/unauthorized/+page.server.ts` and `src/routes/login/+page.server.ts`. Any future change to
`sanitizeFrom` is a security-relevant open-redirect guard change (re-VALIDATE, do not quick-fix).

### Commands to Stay Green
`bun run test:unit -- src/tests/hooks-server.spec.ts` · `bun run check` · `bun run test:unit:ci`

### Dependency Changes
None. No new packages, no schema/API/DB changes.

## Follow-up Stubs Created
None. (The two stale-doc fixes are UPDATE PROCESS notes already captured in the plan, not new backlog stubs.)

## CONTEXT_PARTIAL Items
None.

## UPDATE PROCESS Closeout (01-07-26)

**Closeout classification:** Ready for UPDATE PROCESS archival — confirmed via EVL HANDOFF SUMMARY
(`gates_green`: all 3 gates re-confirmed independently; `known_gaps`: AC3-full magic-link round trip,
an accepted infra-availability residual per the validate-contract's gap-resolution `D`;
`closeout_classification: CLEAN`).

**Actions taken this session:**
1. Archived this task folder (plan + report) from `active/` to `completed/` — `git mv` reported the
   source as untracked, so a plain `mv` was used instead; folder name unchanged (no `completed_` prefix).
2. Applied the two bundled stale-doc fixes named in the plan's `## UPDATE PROCESS notes`:
   - `process/context/all-context.md` §Auth / session conventions — corrected the single-branch
     "`/unauthorized` for all cases" + "`DEV_BYPASS = true`" claims to describe the actual two-branch
     redirect (`/login` no-session vs `/unauthorized` session-not-allowlisted) and confirm Better Auth
     is live-wired (verified directly against `src/hooks.server.ts` and `src/lib/server/auth.ts` —
     no `DEV_BYPASS` reference exists; `auth.ts` is a real `betterAuth()` config with `drizzleAdapter`
     + `magicLink` + Resend). This one edit also closes the fix flagged by the sibling
     `root-login-redirect-fix_01-07-26` plan (not duplicated).
   - `process/features/auth/_GUIDE.md` — updated Scope, Key Source Files, and Current Status to
     reflect live Better Auth wiring instead of "v0 stub — DEV_BYPASS active".
3. `root-login-redirect-fix_01-07-26` was left untouched, exactly as instructed — it remains open in
   `process/features/auth/active/` pending its own EVL + UPDATE PROCESS pass.

**Validators run:**
- `validate-context-discovery.mjs` — ran before and after the doc edits; failure count unchanged
  (83, all pre-existing and unrelated to this session's scope — see Known Pre-Existing Findings below).
  Attempted `--emit-routing` to clear one flagged staleness warning; the script is buggy on this repo
  (it dropped the `planning/` and `tests/` group rows entirely, reporting "0 group entrypoint(s)" when
  2 exist) — reverted that change and kept only the intended auth-conventions edit. Flagged as a
  backlog item, not fixed in this session (script bug, out of scope for a feature-doc closeout).
- `validate-plan-inventory.mjs` — 0 failures, 0 warnings (script scope is `process/general-plans/`
  only; feature-folder inventory is unaffected either way).

**Known Pre-Existing Findings (not introduced by this session, not fixed here):**
- `validate-context-discovery.mjs` reports 83 failures, all pre-existing: `.agents/skills/*` symlink
  targets missing (likely a Windows-symlink limitation) and ~30 `.claude/skills/*/SKILL.md` files
  missing `name`/`description` frontmatter. None of these paths were touched by this session (only
  `process/context/all-context.md` prose and `process/features/auth/_GUIDE.md` prose were edited).
  Recommend a dedicated `vc-audit-vc` / `vc-audit-context` maintenance session to address — out of
  scope for this feature-scoped doc-fix closeout.
- `discover-context.mjs --emit-routing` regenerates the `<!-- GENERATED:routing --><!-- /GENERATED:routing -->`
  block incorrectly on this repo — it fails to detect the existing `planning/` and `tests/` context
  groups and would silently delete their routing rows if applied. Flagged for a follow-up fix to the
  generator script; not attempted here.

**Next valid state:** No further action needed for this plan — archived. `root-login-redirect-fix_01-07-26`
remains the one open item in `process/features/auth/active/`, awaiting its own EVL confirmation run and
UPDATE PROCESS archival in a future session.
