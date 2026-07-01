---
name: plan:login-redirect-callback
description: "Close remaining gaps for issue #80 — preserve/return to originally-requested URL after magic-link login, plus regression tests for hooks.server.ts redirect behavior"
date: 01-07-26
feature: auth
---

# Login Redirect Callback — Plan

**Date**: 01-07-26
**Complexity**: Simple
**Status**: PLANNED

Type: SIMPLE (mechanical — mirrors the existing `/unauthorized` `?from=` pattern; no new design decisions). SPEC and INNOVATE skipped by orchestrator for this reason, same precedent as `root-login-redirect-fix_01-07-26`.

## Overview

Issue #80 asks that unauthorized access redirect to `/login` and, after successful sign-in, return the
user to the page they originally requested. The `/login` vs `/unauthorized` split already landed via a
prior plan; this plan closes the remaining gap — carrying `?from=` through to `/login`, wiring it into
the magic-link `callbackURL`, and adding the automated regression tests issue #80 requires for
`hooks.server.ts`'s redirect behavior.

## Phase Completion Rules

This is a SIMPLE plan — one execution pass, no phase gates. "Done" means: all 10 Implementation
Checklist items complete (item 7 has 6 sub-cases, a-f), all Verification Evidence gates green (`bun run test:unit -- src/tests/hooks-server.spec.ts`,
`bun run check`, `bun run test:unit:ci`), and the Acceptance Criteria table has no unresolved NEW-work
rows. Code-complete-but-untested is `CODE DONE`, not `VERIFIED` — do not mark this plan archived until
the Verification Evidence gates have actually been run and passed.

## Context / Prior Art

`src/hooks.server.ts` already splits the redirect (confirmed correct, unauthenticated hit on `/login` is a no-op since `/login` is in `PUBLIC_PREFIXES`):

```ts
if (!isPublic && !event.locals.user) {
	if (!session?.user?.email) {
		redirect(303, '/login');
	}
	redirect(303, '/unauthorized?from=' + encodeURIComponent(path));
}
```

This landed via `process/features/auth/active/root-login-redirect-fix_01-07-26/` (plan + report) — that work is EXECUTE-complete but still sitting in `active/` pending an EVL confirmation run and UPDATE PROCESS archival. That is a **separate, still-open loose end** — this plan does not touch or attempt to close it, only references it as prior art and bundles its already-flagged stale-context-doc fix into this plan's own UPDATE PROCESS notes (see below) so the fix isn't done twice.

`src/routes/unauthorized/+page.server.ts` already implements the exact sanitize-and-echo pattern this plan needs for `/login`:

```ts
function sanitizeFrom(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith('/')) return null;
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
	if (raw.includes(':')) return null;
	return raw;
}
export const load: PageServerLoad = ({ url }) => {
	const from = sanitizeFrom(url.searchParams.get('from'));
	return { from };
};
```

## Decision (mechanical call)

**Extract `sanitizeFrom` into a shared helper** — `src/lib/server/sanitize-redirect.ts` — imported by both `unauthorized/+page.server.ts` (refactored to import, not redefine) and the new `login/+page.server.ts`. Rationale: two independent copies of open-redirect-sanitization logic drifting apart is a real security-adjacent risk (this is exactly the kind of logic where a "fix one copy, forget the other" bug is costly); a ~10-line shared helper costs nothing extra to maintain. Rejected alternative: duplicate the function in the new file (smaller diff, but rejected — drift risk on security-relevant code outweighs the trivial duplication savings).

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/sanitize-redirect.ts` (NEW) | Extracted `sanitizeFrom(raw: string \| null): string \| null` — moved verbatim from `unauthorized/+page.server.ts` |
| `src/routes/unauthorized/+page.server.ts` | Remove local `sanitizeFrom` definition; import from `$lib/server/sanitize-redirect` instead |
| `src/routes/login/+page.server.ts` (NEW) | `load` — read `?from=`, sanitize via shared helper, return `{ from }` |
| `src/routes/login/+page.svelte` | Accept `data` prop (`let { data } = $props();`); use `callbackURL: data.from ?? '/'` in `authClient.signIn.magicLink(...)` instead of hardcoded `'/'` |
| `src/hooks.server.ts` | Line 53: `redirect(303, '/login')` → `redirect(303, '/login?from=' + encodeURIComponent(path));` |
| `src/tests/hooks-server.spec.ts` (NEW) | Vitest unit tests for `handle()` redirect behavior (see Verification Evidence) |

Nice-to-have, explicitly optional, include only if trivial to add without expanding scope: mirror `unauthorized/+page.svelte`'s "you were trying to reach X" messaging on the login page when `data.from` is present. Not required by issue #80's acceptance criteria — do not block the plan on this.

## Public Contracts

- New exported function `sanitizeFrom(raw: string | null): string | null` in `src/lib/server/sanitize-redirect.ts` — same signature/behavior as the existing inline version, now a shared server-only utility. No other package imports it yet; blast radius is internal to `src/routes/*` and `src/hooks.server.ts`.
- `login/+page.server.ts` `load` return shape: `{ from: string | null }` — same shape contract already established by `unauthorized/+page.server.ts`, so `+page.svelte` consumption pattern is consistent across both routes.
- No API route, schema, or DB contract changes.

## Blast Radius

- 6 files touched (1 new helper, 1 new server load, 1 new test file, 3 edited files).
- Single feature area (auth), single package (the SvelteKit app itself — no monorepo package boundary here).
- Risk class: none of auth/identity-session-creation, billing, schema/migration, public API, or secrets are touched — this only changes *where* an already-authenticated redirect points, using the exact sanitization pattern already reviewed and shipped for `/unauthorized`. Not a high-risk class per the risk-class list (session/redirect *routing*, not session *issuance* or *trust* logic) — but the sanitize helper remains a bright-line: any future change to `sanitizeFrom` itself should be treated as a security-relevant open-redirect guard. **VALIDATE note:** because of this bright-line classification, the shared helper now gets its own direct Fully-Automated unit test (checklist step 7e) rather than relying solely on indirect coverage through the two route callers.

## Explicit constraints (do not touch)

- Do not touch the allowlist / `crmUsers` lookup logic in `hooks.server.ts` (lines 33-48) — unrelated, working.
- Do not touch the dead-code `redirect(303, '/login')` guards in `src/routes/+page.server.ts` / `src/routes/reminders/+page.server.ts` — pre-existing, harmless, out of scope (same exclusion the prior plan used).
- Do not attempt to close out `root-login-redirect-fix_01-07-26` (its own EVL/UPDATE PROCESS is a separate open item) — only bundle its already-flagged context-doc fix into this plan's UPDATE PROCESS step (see below).

## Implementation Checklist

1. Create `src/lib/server/sanitize-redirect.ts` — move `sanitizeFrom` verbatim from `src/routes/unauthorized/+page.server.ts` (same doc comment, same 4 rejection branches: empty, missing leading slash, protocol-relative `//`, backslash-relative `/\`, scheme-containing `:`), exported as a named function.
2. Edit `src/routes/unauthorized/+page.server.ts` — delete the local `sanitizeFrom` definition; add `import { sanitizeFrom } from '$lib/server/sanitize-redirect';`. No behavior change — confirm `load` still returns `{ from }` identically.
3. Create `src/routes/login/+page.server.ts` — `import type { PageServerLoad } from './$types'; import { sanitizeFrom } from '$lib/server/sanitize-redirect'; export const load: PageServerLoad = ({ url }) => ({ from: sanitizeFrom(url.searchParams.get('from')) });`
4. Edit `src/hooks.server.ts` line 53 — change `redirect(303, '/login');` to `redirect(303, '/login?from=' + encodeURIComponent(path));`
5. Edit `src/routes/login/+page.svelte` — add `let { data } = $props();` at top of `<script>` block; change `callbackURL: '/'` (line 19) to `callbackURL: data.from ?? '/'`.
6. (Optional, only if trivial) Add a small "You were trying to reach `{data.from}`" line to `login/+page.svelte`, mirroring `unauthorized/+page.svelte`'s existing messaging pattern — read that file first for the exact wording/style before adding.
7. Create `src/tests/hooks-server.spec.ts` — Vitest unit tests exercising the exported `handle` function from `src/hooks.server.ts`:
   - Mock `$lib/server/auth`'s `auth.api.getSession` via `vi.mock('$lib/server/auth', ...)`.
   - Mock the Drizzle chain via `vi.mock('$lib/server/db/index', ...)` — mock `db.select().from().where().limit()` to resolve `[]` (no session) or `[{ id, email, name, role, active: true }]` (allowlisted user) per test case.
   - Follow the existing `vi.mock('$env/dynamic/private', () => ({ env: {} }));` pattern from `src/tests/reminders.spec.ts` for any env mocking needed (Sentry init is a no-op stub — confirm no env access blocks the test; mock `$lib/server/sentry`'s `initSentry` if it throws without env vars).
   - Use `@sveltejs/kit`'s `isRedirect()` to assert on the thrown redirect's `.status` / `.location` (SvelteKit's `redirect()` throws — it does not return).
   - Test cases (map 1:1 to Acceptance Criteria below):
     a. Unauthenticated request to a protected route (e.g. `/leads`) → thrown redirect, `status === 303`, `location === '/login'`.
     b. Authenticated request (mocked session + matching active `crmUsers` row) to a protected route → no redirect thrown; `resolve` is called; `event.locals.user` is populated.
     c. Session exists but email has no active `crmUsers` row → thrown redirect, `status === 303`, `location` starts with `/unauthorized?from=`.
     d. Unauthenticated request to `/login` itself → no redirect thrown (public prefix, no loop).
     e. **[Added by VALIDATE — closes a test-coverage gap found in Layer 1/2 fan-out]** Direct unit tests for the shared `sanitizeFrom` helper (`src/lib/server/sanitize-redirect.ts`), either inline in this file or in a new `src/tests/sanitize-redirect.spec.ts`: assert each rejection branch returns `null` (empty string / null, missing leading `/`, `//` protocol-relative, `/\` backslash-relative, any value containing `:`) AND assert a valid same-origin path (e.g. `/leads/123`) passes through unchanged. Rationale: this is the security-relevant open-redirect guard now shared by two callers (`unauthorized/+page.server.ts` and the new `login/+page.server.ts`); prior to this plan it had zero direct test coverage on either caller, and the extraction step (checklist item 1) is exactly the kind of mechanical move where a bracket typo silently reintroduces an open-redirect hole with no test to catch it.
     f. **[Added by VALIDATE]** Direct unit test for the new `login/+page.server.ts` `load` function: call `load({ url: new URL('http://x/login?from=%2Fleads') } as any)` and assert it returns `{ from: '/leads' }`; call with a malicious/no `from` param and assert `{ from: null }`. Proves the from-preservation wiring mechanically (this file has no other test coverage — it is entirely new).
8. Run `bun run test:unit -- src/tests/hooks-server.spec.ts` (and `src/tests/sanitize-redirect.spec.ts` if created as a separate file) — iterate until green.
9. Run `bun run check` (svelte-check) — confirm no type errors across all touched files.
10. Run full `bun run test:unit:ci` as a regression pass (all existing specs, not just the new ones) to confirm nothing else broke.

## Acceptance Criteria (issue #80 → gate mapping)

| # | Acceptance criterion | Status | Proven by |
|---|---|---|---|
| 1 | Unauthorized access to a protected page redirects to `/login` | Already true (regression guard) | Checklist step 7a |
| 2 | No protected content flashes before redirect | Already true structurally (hooks run server-side pre-render) — checked assumption, not new work | N/A — structural, not gated by a new test |
| 3 | Login preserves the originally-requested URL and redirects back after successful sign-in | NEW work (checklist items 1-5) | Checklist steps 7e/7f prove the wiring mechanically (sanitize helper + `login/+page.server.ts` load()); the full magic-link email-click round trip is Manual/agent-probe (see Verification Evidence — genuine infra-availability known-gap, not a code-stub gap; see corrected rationale below) |
| 4 | Authenticated users continue to access protected pages normally | Regression guard | Checklist step 7b |
| 5 | No redirect loops, especially already on `/login` | Regression guard | Checklist step 7d |
| 6 | Automated tests per this plan, all passing | NEW work | Checklist steps 7-10 |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit -- src/tests/hooks-server.spec.ts` — case 7a (unauth → `/login`) | Fully-Automated | AC #1 |
| `bun run test:unit -- src/tests/hooks-server.spec.ts` — case 7b (auth allowlisted → passthrough) | Fully-Automated | AC #4 |
| `bun run test:unit -- src/tests/hooks-server.spec.ts` — case 7c (auth, not allowlisted → `/unauthorized?from=`) | Fully-Automated | Regression guard for existing allowlist behavior (not a new AC, but must not regress) |
| `bun run test:unit -- src/tests/hooks-server.spec.ts` — case 7d (unauth → `/login` itself, no loop) | Fully-Automated | AC #5 |
| `bun run test:unit` — case 7e (`sanitizeFrom` all rejection branches + valid pass-through) | Fully-Automated | Security-regression guard for the shared open-redirect helper (used by both `/unauthorized` and `/login`) — **added by VALIDATE** |
| `bun run test:unit` — case 7f (`login/+page.server.ts` `load()` returns sanitized `from`) | Fully-Automated | AC #3 (partial — proves the from-preservation wiring mechanically) — **added by VALIDATE** |
| `bun run check` (svelte-check) | Fully-Automated | Type-safety regression gate across all touched files |
| `bun run test:unit:ci` (full existing suite) | Fully-Automated | Regression guard — confirms `unauthorized/+page.server.ts` refactor (item 2) didn't break its own behavior; confirms no unrelated suite broke |
| Manual: log in via magic-link after hitting a protected route while logged out, confirm redirect lands back on the originally-requested page | Agent-Probe / Manual | AC #3 (full round trip only) — cannot be fully automated in this environment: no live Postgres and no `RESEND_API_KEY`/live inbox are available to complete a real magic-link email click. **Corrected rationale (VALIDATE):** `src/lib/server/auth.ts` and `src/lib/server/email.ts` are NOT stubs — `auth.ts` is a live `betterAuth()` config with a real `drizzleAdapter` + `magicLink` plugin, and `email.ts` sends via real Resend when `RESEND_API_KEY`/`RESEND_FROM` are set; `hooks.server.ts` has no `DEV_BYPASS` reference at all. The gap is test-infra availability (no Postgres/Resend test harness exists anywhere in this repo yet — same class of gap already accepted for the 4 Hybrid reminders/activities gates in `process/context/tests/all-tests.md`), not a "Better Auth is a stub" code-gap. This matches the more accurate framing already used in `root-login-redirect-fix_01-07-26`'s own accepted known-gap ("no local Postgres + no real Better Auth session available"). The `_GUIDE.md`/`all-context.md` "DEV_BYPASS active" language is stale documentation, already flagged for a UPDATE PROCESS fix (see below) — do not re-cite it as the reason for this gap. |

## Test Infra Improvement Notes

No new test infra gaps introduced by this plan beyond the pre-existing one already logged in `process/context/tests/all-tests.md` (§Known Gaps: no automated coverage for `hooks.server.ts` redirect behavior) — this plan closes that gap for the 4 mockable `hooks.server.ts` cases (7a-7d) plus two additional gaps found during VALIDATE (7e: the shared `sanitizeFrom` helper had zero direct test coverage on either caller; 7f: the new `login/+page.server.ts` load function had none). The end-to-end magic-link redirect-back round trip (AC #3, full click-through only) remains a known-gap — this is an infra-availability gap (no live Postgres + no `RESEND_API_KEY`/live inbox in this environment, same class as the existing reminders/activities Hybrid gaps), not a "Better Auth is stubbed" code-gap; see the corrected Verification Evidence rationale above. `src/lib/server/auth.ts` is real, live-wired Better Auth — this is a stale-documentation finding, not a code state this plan needs to fix (bundled into UPDATE PROCESS below alongside the pre-existing flagged fix).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/auth/active/login-redirect-callback_01-07-26/login-redirect-callback_PLAN_01-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (validate-contract below); no EXECUTE work started yet.
3. **Validate-contract status:** written — Gate: PASS (see below).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/features/auth/_GUIDE.md`, `process/context/tests/all-tests.md`, `src/hooks.server.ts`, `src/routes/unauthorized/+page.server.ts`, `src/routes/login/+page.svelte`, `src/lib/server/auth.ts`, `src/lib/server/email.ts`, `src/tests/reminders.spec.ts` (mocking pattern reference), prior plan/report at `process/features/auth/active/root-login-redirect-fix_01-07-26/`.
5. **Next step for a fresh agent picking up mid-execution:** Route to `vc-execute-agent` with this plan path. If EXECUTE already started, check which of the 10 checklist items (item 7 has sub-cases a-f) are done (git diff against Touchpoints table) and resume from the first incomplete item — items are ordered so each is independently checkable via the Verification Evidence commands.

## UPDATE PROCESS notes (for later — do not action during PLAN/EXECUTE)

- Fix the stale `process/context/all-context.md` §Auth/session conventions line that still says all unauthenticated hits go to `/unauthorized`, AND that `DEV_BYPASS = true` is active in `hooks.server.ts` (it is not present in the file at all — Better Auth is live-wired). This fix was already flagged by `root-login-redirect-fix_01-07-26`'s own report and independently re-confirmed during this plan's VALIDATE pass — do this ONE edit covering both plans' flagged fix, don't duplicate. Also correct `process/features/auth/_GUIDE.md` §Current Status ("not-started (v0 stub — DEV_BYPASS active)") in the same pass.
- Note in the phase report that `root-login-redirect-fix_01-07-26` remains open (EVL + UPDATE PROCESS archival pending) as a separate, pre-existing loose end — do not conflate its closure with this plan's closure.

## Validate Contract

Status: PASS
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: Score 2/7 (S6 security-adjacent surface touched via the shared open-redirect helper; S7 not met — 6 files, under the 5+ threshold is met at exactly 6). MEDIUM band — Layer 1 (4 dimension agents) + Layer 2 (2 section agents: Implementation Checklist feasibility, Known-Gap/AC mapping) ran as independent parallel subagents (no agent needed another's mid-run output); orchestrator synthesized. Agent count: 4 (Layer 1) + 2 (Layer 2) = 6. Model: sonnet for all validate agents (no code-execution leg in VALIDATE).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Unauthenticated hit on protected route → `/login` | Fully-Automated | `bun run test:unit -- src/tests/hooks-server.spec.ts` case 7a | A |
| AC4 | Authenticated allowlisted user passes through normally | Fully-Automated | `bun run test:unit -- src/tests/hooks-server.spec.ts` case 7b | A |
| regression | Authenticated non-allowlisted → `/unauthorized?from=` unchanged | Fully-Automated | `bun run test:unit -- src/tests/hooks-server.spec.ts` case 7c | A |
| AC5 | No redirect loop when already on `/login` | Fully-Automated | `bun run test:unit -- src/tests/hooks-server.spec.ts` case 7d | A |
| security-regression | Shared `sanitizeFrom` helper rejects all 4 bad-input branches + passes valid paths | Fully-Automated | `bun run test:unit` case 7e (`sanitize-redirect.spec.ts` or inline) — **added by VALIDATE** | B |
| AC3-partial | `login/+page.server.ts` load() returns sanitized `from` | Fully-Automated | `bun run test:unit` case 7f — **added by VALIDATE** | B |
| type-safety | No type errors across all touched files | Fully-Automated | `bun run check` | A |
| full-suite-regression | No unrelated existing spec broke | Fully-Automated | `bun run test:unit:ci` | A |
| AC3-full | Full magic-link email-click round trip lands back on originally-requested URL | Agent-Probe | Manual: log in via magic-link after hitting a protected route while logged out, confirm redirect target | D |

gap-resolution legend: A — proven now. B — fixed in this plan (gate added by this plan's checklist, this VALIDATE pass). C — deferred to a named later phase/plan. D — backlog test-building stub (named residual; keep-active; continue).

Legacy line form:
- hooks.server.ts redirect behavior: Fully-automated: `bun run test:unit -- src/tests/hooks-server.spec.ts` (cases 7a-7d)
- shared sanitize-redirect helper: Fully-automated: `bun run test:unit` case 7e (added by VALIDATE)
- login/+page.server.ts load(): Fully-automated: `bun run test:unit` case 7f (added by VALIDATE)
- type-safety: Fully-automated: `bun run check`
- full regression: Fully-automated: `bun run test:unit:ci`
- AC3 full magic-link round trip: known-gap: documented — infra-availability gap (no live Postgres + no RESEND_API_KEY/live inbox in this environment), not a code-stub gap; consistent with existing accepted Hybrid gaps for reminders/activities in `process/context/tests/all-tests.md`.

Dimension findings:
- Infra fit: PASS — pure SvelteKit route/helper files; no container, port, or runtime-surface changes; commands (`bun run check`, `bun run test:unit`, `bun run test:unit:ci`) match `process/context/tests/all-tests.md`.
- Test coverage: PASS (after plan-fix applied) — original checklist item 7 (cases 7a-7d) covered `hooks.server.ts` correctly and maps 1:1 to the 3 scenarios issue #80 requires (unauthenticated→login, authenticated→allowed, login-route-no-self-redirect), but the extracted `sanitizeFrom` helper and the entirely-new `login/+page.server.ts` load() had ZERO direct test coverage — a vacuous-green risk (developed behavior proven only by "static review", not a gate). Fixed in-plan by adding checklist items 7e/7f + 2 Verification Evidence rows.
- Breaking changes: PASS — no schema/API/DB contract changes; `sanitizeFrom`'s signature is unchanged by extraction; `login/+page.server.ts` load return shape matches the existing `unauthorized/+page.server.ts` `{ from }` contract; `/login?from=...` is additive (query param), `/login` was already in `PUBLIC_PREFIXES` pre-plan.
- Security surface: PASS (after plan-fix applied) — verified byte-for-byte: the plan's described extraction target (4 if-branches covering empty / missing-leading-slash / `//`-or-`/\` protocol/backslash-relative / scheme-containing `:`) matches the current `unauthorized/+page.server.ts` source exactly, and both callers (refactored `unauthorized/+page.server.ts` + new `login/+page.server.ts`) route through the same shared helper per checklist items 2-3 — no drift risk introduced. Given the plan's own bright-line classification of this helper as "security-relevant," the missing direct test (now checklist item 7e) was flagged and fixed rather than left implicit.
- Implementation Checklist feasibility (Layer 2): PASS — mechanical feasibility confirmed live: `src/hooks.server.ts:53` is exactly `redirect(303, '/login');` and `src/routes/login/+page.svelte:19` is exactly `callbackURL: '/'` as the plan describes; all 5 touchpoint files exist except the 3 explicitly-new ones. No conflicts found. Highest-risk edit: `hooks.server.ts` line 53 (the session-gate file) — mitigation already specified in the plan (single-line diff, explicit constraint against touching lines 33-48, full regression suite as checklist step 10).
- Known-Gap / AC mapping (Layer 2): PASS (after plan-fix applied) — the AC#3 known-gap ACCEPTANCE is directionally valid (no live Postgres/Resend test harness exists anywhere in this repo per `all-tests.md`), but the plan's original RATIONALE TEXT was stale/inaccurate: it claimed Better Auth is "stubbed" and cited `DEV_BYPASS active`, but `src/lib/server/auth.ts` is a live `betterAuth()` config (real `drizzleAdapter` + `magicLink` + Resend `sendEmail`) and `hooks.server.ts` has no `DEV_BYPASS` reference at all — confirmed by direct file read. Corrected in-plan to the accurate infra-availability framing (matches `root-login-redirect-fix_01-07-26`'s own more honest framing) and folded into this plan's existing UPDATE PROCESS note (which already planned to fix the same stale-doc issue in `all-context.md`).

Open gaps: none unresolved. AC3-full (magic-link round trip) is an accepted named residual (gap-resolution D), not an open CONCERN — see Test Infra Improvement Notes for rationale.

What this coverage does NOT prove:
- `bun run test:unit -- src/tests/hooks-server.spec.ts` (7a-7d): does not prove the real Better Auth session cookie format is parsed correctly by `auth.api.getSession` — `getSession` itself is mocked. Does not prove DB round-trip correctness for the `crmUsers` allowlist query — Drizzle chain is mocked.
- Case 7e (sanitize-redirect): proves the pure function's branch logic only — does not prove either route's SvelteKit `load` wiring calls it correctly with the right param name (`from`) beyond what 7f/existing `unauthorized` behavior asserts.
- Case 7f (login load()): proves the load function's sanitize-and-return logic only — does not prove `+page.svelte`'s `callbackURL: data.from ?? '/'` consumption of that data, which remains unverified beyond static code review (Svelte component render/prop-passing is not covered by this plan's Vitest scope).
- `bun run check`: proves type-level correctness only — does not prove runtime behavior.
- `bun run test:unit:ci`: proves no *existing* spec regressed — does not add new assertions about this plan's own changed files beyond what 7a-7f already assert.
- Manual/agent-probe AC3-full: this is the only gate that would prove the actual end-to-end user-visible outcome (land back on the originally-requested page after clicking the real magic-link email) — it is not automated in this environment.

Gate: PASS (no FAILs, plan updated to close the 2 test-coverage gaps found during fan-out)
Accepted by: session (VALIDATE plan-fix applied in-place; no unresolved CONCERNs remain requiring separate user acceptance)

## Autonomous Goal Block

SESSION GOAL: Close GitHub issue #80 — redirect unauthenticated users to `/login`, preserve the originally-requested URL, and add regression tests.
Charter + umbrella plan: N/A — single plan (not part of a phase program).
Autonomy: Standard RIPER-5 gates apply; EXECUTE requires explicit "ENTER EXECUTE MODE" (no standing /goal has been established for this session).
Hard stop conditions / safety constraints:
- Do not touch the allowlist/`crmUsers` lookup logic in `hooks.server.ts` (lines 33-48).
- Do not touch the dead-code `redirect(303, '/login')` guards in `+page.server.ts` / `reminders/+page.server.ts`.
- Do not attempt to close out `root-login-redirect-fix_01-07-26` — separate open item.
- Treat any future change to `sanitizeFrom` itself as a security-relevant open-redirect guard change (re-VALIDATE, don't quick-fix).
Next phase: EXECUTE — `process/features/auth/active/login-redirect-callback_01-07-26/login-redirect-callback_PLAN_01-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: `bun run test:unit -- src/tests/hooks-server.spec.ts` (TDD red-first, then implement checklist items 1-7) | `bun run check` | `bun run test:unit:ci` | high-risk pack: no (not a high-risk class per Blast Radius)
