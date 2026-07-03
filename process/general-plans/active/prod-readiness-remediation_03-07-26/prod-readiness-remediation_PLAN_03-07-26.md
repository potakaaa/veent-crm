---
name: plan:prod-readiness-remediation
description: "Mechanical production-readiness remediation — remove shipped mock CRM client, fail-fast DB env guard, fix runtime dep classification, correct stale context docs"
date: 03-07-26
feature: null
---

# Production-Readiness Remediation — PLAN

**Date**: 03-07-26
**Status**: Active — VALIDATE complete (Gate: CONDITIONAL); ready for EXECUTE
**Complexity**: SIMPLE (one session, mechanical/deletion-heavy; no phases)

## Overview / Context

This plan remediates production-readiness findings from a completed RESEARCH audit of the veent-crm app. All design choices were resolved by user decisions upstream, so SPEC and INNOVATE were skipped. The work is mechanical: delete a mock CRM client that ships fake PII to the browser, add a fail-fast DB env guard, correct `package.json` dependency classification, and fix stale context docs/comments. It is deletion-heavy with two bounded judgment gates (shadowing re-verify, DB-guard test-safety).

**Classification:** Ready-to-execute after VALIDATE. SPEC/INNOVATE intentionally skipped — user decisions resolved all design choices.

## TL;DR

Four remediation buckets from a completed RESEARCH audit, all mechanical:
1. **Delete the mock CRM client** that ships to the browser (`ssr=false` bundles ~22KB of fake PII). Remove unused mock calls + the security-adjacent mock `getCurrentUser()` fallback from `+layout.ts`; delete `src/lib/services/`, `src/lib/data/mock-data.ts`, `src/lib/server/mock.ts`, `src/lib/components/StubNote.svelte`.
2. **DB env fail-fast** — replace the hardcoded `postgres://crm:crm@localhost:...` fallback with a clear "unset" guard matching the repo's existing `email.ts` throw convention.
3. **Fix dependency classification** — move 6 runtime-imported packages from `devDependencies` → `dependencies`.
4. **Doc/comment cleanup** — correct two stale claims in `all-context.md` (reports + email are live, not stubbed), and resolve the stale `schema.ts:397` Better-Auth TODO. Record Sentry as an accepted known-gap.

**This is a subtraction plan.** Do not add new server-load logic, do not wire Sentry, do not touch `Caddyfile`/`Dockerfile`/`docker-compose.yml` (user KEEP decision).

---

## Research Correction (important — supersedes one RESEARCH claim)

RESEARCH stated the `crm.listUsers()` / `crm.listLeads()` results in `+layout.ts` are "UNUSED." That is true for `+layout.svelte` (which only reads `data.currentUser` + `data.counts`), but **`data.users` / `data.leads` ARE inherited by child routes** under SvelteKit's data model (layout `load` data merges into every descendant page's `data`).

**Full consumer set re-verified during VALIDATE (corrects the earlier "4 known" claim).** SvelteKit layout data flows to ALL descendant routes, not just 4. A repo-wide grep (`data.users` / `data.leads`) finds **11 consumer routes**, not 4. Every one supplies its OWN real-DB `users`/`leads` (whichever field it reads) from its own `+page.server.ts`, so the layout mock is **fully shadowed** in every consumer → removal is safe:

| Consumer route | Reads | Own `+page.server.ts` returns |
|---|---|---|
| `/` (`+page.svelte`) | `data.leads` | `{ me, leads }` |
| `pipeline` | `data.leads`, `data.users` | `{ leads, totalsPerStage, users }` |
| `leads` | `data.leads`, `data.users` | `{ leads, …, users }` |
| `leads/new` | `data.users`, `data.leads` | `{ leads, users }` |
| `leads/[id]` | `data.users` | `{ lead, …, me, users, templates }` |
| `leads/[id]/edit` | `data.users` | `{ lead, me, users }` |
| `unassigned` | `data.leads`, `data.users` | `{ leads, users, … }` |
| `team` | `data.users` | `{ users, leads, … }` |
| `meetings` | `data.users` | `{ meetings, total, users, … }` |
| `meetings/[id]` | `data.users` | `{ meeting, users, me }` |
| `reminders` | `data.leads` | `{ leads }` |
| `reports` | `data.users` | `{ …, users, … }` (real DB query, `+page.server.ts` L177-188) |

**False positive (not a layout consumer):** `src/lib/components/meetings/LeadCombobox.svelte` references `data.leads`, but that `data` is a LOCAL `const data = await res.json()` from a `GET /api/leads` fetch — unrelated to layout data. Ignore it in the E1a gate.

**This full list must be re-confirmed during EXECUTE (step E1a), not assumed.** SvelteKit merges page data over layout data, so any consumer whose own `+page.server.ts` does NOT return a field it reads would silently break after the mock removal.

---

## Goals

- Ship zero mock/fake-PII code to the browser bundle.
- Fail fast with a clear message when `DATABASE_URL` is unset instead of silently connecting to a phantom localhost DB.
- Make `package.json` honest so a future `--omit=dev`/production install before build cannot break the app.
- Stop feeding downstream agents wrong status from `all-context.md`.
- Keep all existing tests green (hard constraint).

## Non-Goals (explicit)

- Wiring Sentry (accepted known-gap — see Verification Evidence).
- Removing `ssr = false` from `+layout.ts` (flagged as a design smell but out of scope — subtraction only).
- Any `Caddyfile` / `Dockerfile` / `docker-compose.yml` change (user KEEP decision).
- Adding new server-load logic beyond what keeps the layout functioning with real data.

---

## Touchpoints

Files changed or deleted:

| Path | Action | Notes |
|---|---|---|
| `src/routes/+layout.ts` | edit | Remove `crm` import; remove `crm.listUsers()`/`crm.listLeads()`; remove mock `getCurrentUser()` fallback; drop `users`/`leads` from returns. Keep `ssr=false`, `currentUser` (from `data.user`), `counts` (from `/api/nav-counts`). |
| `src/lib/services/index.ts` | delete | Mock client barrel. |
| `src/lib/services/mock-crm-client.ts` | delete | ~9.5KB mock impl. |
| `src/lib/services/crm-client.ts` | delete | `CrmClient` type — confirmed ZERO importers outside `src/lib/services/` (grep clean). |
| `src/lib/data/mock-data.ts` | delete | ~13KB fake PII; only importer is `mock-crm-client.ts` (also deleted). |
| `src/lib/server/mock.ts` | delete | Zero importers (grep confirmed). |
| `src/lib/components/StubNote.svelte` | delete | Zero usages (grep confirmed). |
| `src/lib/server/db/index.ts` | edit | Replace hardcoded fallback with unset-guard throw. |
| `package.json` | edit | Move 6 deps devDependencies → dependencies. |
| `bun.lock` | regenerate | Via `bun install` after package.json edit. |
| `src/lib/server/db/schema.ts` (~L395-398) | edit | Resolve stale `TODO (when Better Auth is wired)` comment. |
| `process/context/all-context.md` | edit | Correct reports + email status (2 sections). |

Files READ for context (not modified): the eleven consuming `+page.server.ts` / `+page.svelte` routes (see Research Correction table), `src/lib/server/email.ts` (env-throw convention reference), `src/tests/*-db.spec.ts` (db-import impact).

---

## Public Contracts

- **`$lib/services` module removed entirely.** Any import of `crm` / `CrmClient` / `mockCrmClient` becomes a build error. Grep confirms the ONLY external importer is `src/routes/+layout.ts:2` (removed in E1). No other package/route imports the type.
- **`+layout.ts` data contract narrows:** stops returning `users` and `leads`. Callers relying on layout-inherited `data.users`/`data.leads` would break — verified NONE do (all 11 consumers self-provide; see Research Correction table). E1a re-verifies.
- **`db` module (`$lib/server/db/index`) behavior change:** throws at module-load when `DATABASE_URL` is unset (previously connected to a hardcoded localhost string lazily). Contract for callers that set `DATABASE_URL` is unchanged. **Test-import caveat:** the throw fires at module IMPORT — see E4a for why this interacts with the `*-db.spec.ts` self-skip pattern.
- **`package.json` classification change** is build-transparent today (Vite bundles regardless); the contract change is for future production installs.

---

## Blast Radius

- **File count:** ~12 files (7 deletions, 5 edits) + 1 lockfile regen.
- **Packages:** single app (no monorepo packages).
- **Risk classes present:**
  - **auth/identity-adjacent** (the mock `getCurrentUser()` fallback removal in `+layout.ts`) — see Security Note.
  - **build integrity** (dependency reclassification + bundle contents).
  - **DB connection surface** (env guard — could throw at module load and affect the `*-db.spec.ts` files that import `db`).
- **Overall risk:** LOW-MEDIUM. Deletion-heavy; the two non-deletion judgment points (DB guard test-safety, layout shadowing) are bounded and test-verifiable.

---

## Security Note (auth-adjacent surface)

Per this repo's risk-evidence-pack convention, flagging the one security-adjacent touch:

- **`+layout.ts` mock `getCurrentUser()` fallback removal.** Today: `const currentUser = serverUser ? {...} : await crm.getCurrentUser();`. If a server session were ever null on a route that renders the layout, the UI would render a **fabricated mock identity** instead of failing.
- **Not purely dead code (VALIDATE correction).** On protected routes `hooks.server.ts` (L50-57) redirects to `/login`/`/unauthorized` before the layout load runs, so `serverUser` is always non-null there → the fallback is dead. BUT on the **public `/unauthorized` route** `serverUser` IS null today → the fallback FIRES and renders a fake identity in the app shell. Removal changes that page (fabricated identity → `null`). This is the intended hardening, not a regression — an unauthorized user should never see a synthesized identity.
- **Post-removal behavior:** `currentUser` must derive solely from `data.user` (the real `crm_users`-backed session). When `serverUser` is null (`/login`, `/unauthorized`, edge), return `currentUser: null` — never a synthesized identity. The `/login` branch already returns `currentUser: null` and `+layout.svelte` passes `user={data.currentUser}` to `AppShell`, which already tolerates `null` — so the `/unauthorized` null path is already supported.
- **Manual evidence required** (Agent-Probe gate V-A): (1) log in as a manager, confirm manager-gated UI still renders (real role preserved); (2) confirm no page renders a fake identity; (3) specifically visit `/unauthorized` (or a session-but-not-allowlisted state) and confirm the shell renders with no fabricated user. This is manual-first because there is no automated authed-session harness (see Test Infra Improvement Notes).

---

## Implementation Checklist

### Bucket 1 — Remove shipped mock CRM client

1. **E1 — Edit `src/routes/+layout.ts`:**
   - Remove `import { crm } from '$lib/services';`.
   - Remove the `crm.getCurrentUser()` fallback: change `currentUser` to `serverUser ? { ...serverUser, active: true as const } : null`.
   - Remove `crm.listUsers()` and `crm.listLeads(...)` from the `Promise.all`; keep only the `fetch('/api/nav-counts')` call (unwrap accordingly).
   - Remove `users`/`leads` from BOTH return objects (the `/login` early-return and the main return).
   - Keep `export const ssr = false;` unchanged (out of scope to remove).
2. **E1a — Re-verify shadowing BEFORE deleting service files:** run `grep -rn "data\.users\|data\.leads" src/routes src/lib` and confirm every hit is in a route whose own `+page.server.ts` returns the field it reads. **Check ALL 11 consumer routes in the Research Correction table — not just `/`, `pipeline`, `leads`, `leads/new`.** The extra 7 (`leads/[id]`, `leads/[id]/edit`, `unassigned`, `team`, `meetings`, `meetings/[id]`, `reminders`, `reports`) were verified shadowed at VALIDATE; re-confirm they are still so. The `LeadCombobox.svelte` hit is a known false positive (local fetch var — ignore). If any consumer WITHOUT its own server-provided field is found → STOP, do not delete; surface as a blocker.
3. **E2 — Delete files:** `src/lib/services/index.ts`, `src/lib/services/mock-crm-client.ts`, `src/lib/services/crm-client.ts` (whole `src/lib/services/` dir), `src/lib/data/mock-data.ts`, `src/lib/server/mock.ts`, `src/lib/components/StubNote.svelte`.
4. **E3 — Grep-clean gate:** `grep -rn "lib/services\|mock-data\|server/mock\|StubNote\|mockCrmClient\|CrmClient" src/` returns ZERO hits. Any hit = incomplete removal, fix before proceeding.

### Bucket 2 — DB env fail-fast

5. **E4 — Edit `src/lib/server/db/index.ts`:** replace `const rawUrl = env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/veent_crm';` with a fail-fast guard matching the `email.ts` convention:
   ```
   if (!env.DATABASE_URL) throw new Error('DATABASE_URL env var is not set');
   const rawUrl = env.DATABASE_URL;
   ```
   Keep the `channel_binding` strip, Neon detection, and pool config unchanged.
6. **E4a — Test-safety verification (decision gate) — HARDENED at VALIDATE:** the throw fires at MODULE IMPORT, before any spec's `SKIP_DB = !process.env.DATABASE_URL` guard can skip. So the decision must be made against the CI-representative condition:
   - **Run `bun run test:unit:ci` in a shell where `DATABASE_URL` is UNSET** (this mirrors a CI unit run with no Postgres service — the condition under which the `*-db.spec.ts` files self-skip). Do NOT decide based only on a local run that has `DATABASE_URL` set in `.env`, because that masks the CI-unset import breakage.
     - If green with `DATABASE_URL` unset (the db-spec files still import `db` cleanly and self-skip) → keep the explicit throw. **(preferred)** Note: this requires the module to remain importable without `DATABASE_URL`, so a bare throw likely fails here — see next bullet.
     - If any `*-db.spec.ts` breaks at IMPORT solely because `DATABASE_URL` is unset → the bare throw is not import-safe in that environment. **Do NOT fall back to `const rawUrl = env.DATABASE_URL;` alone** — that is ALSO unsafe: `db/index.ts:13` calls `rawUrl.replace(...)`, so an `undefined` `rawUrl` throws a cryptic `TypeError` at module load (worse than the current behavior). Instead choose ONE of:
       - **(b1) Confirm CI always sets `DATABASE_URL`** for the unit job (check the ci-cd workflow once it lands) and keep the throw — the throw is correct in every environment that sets the var.
       - **(b2) Lazy-guard variant** — keep the module importable without `DATABASE_URL` by deferring the failure past import: guard the `.replace()` (`const connectionString = (env.DATABASE_URL ?? '').replace(...)`) and/or move the throw into a getter/first-query path so unit specs import `db` and self-skip cleanly while a real connection still fails fast at query time.
   - Document which path (throw / b1 / b2) was taken and the exact environment the E4a gate was run in, in the phase report.

### Bucket 3 — Dependency classification

7. **E5 — Edit `package.json`:** move these 6 from `devDependencies` → `dependencies`: `drizzle-orm`, `postgres`, `layerchart`, `bits-ui`, `@lucide/svelte`, `@internationalized/date`. (Leave `drizzle-kit` in devDependencies — it is a build-time CLI, not runtime-imported.) VALIDATE confirmed all 6 are currently in `devDependencies` and are runtime-imported by production `src/` code (drizzle-orm 17 files, bits-ui 43, @internationalized/date 8, @lucide/svelte 5, layerchart 2, postgres in db client).
8. **E6 — Regenerate lockfile:** run `bun install`; confirm `bun.lock` updates with no version drift.
9. **E7 — Build gate:** run `bun run build`; confirm success (proves runtime imports resolve from `dependencies` and the mock deletions didn't break the bundle).

### Bucket 4 — Doc + comment cleanup

10. **E8 — Correct `process/context/all-context.md`:**
    - "Current Project State" section: change reports from "still renders mock data" → reports is real-DB-backed (Drizzle) as of this cleanup (VALIDATE confirmed `reports/+page.server.ts` is fully DB-backed); and email/Resend from "stubbed" → live (`RESEND_API_KEY`/`RESEND_FROM`, real Resend client in `src/lib/server/email.ts`).
    - Feature-status table row for `reports`: update from "not-started (mock data only)" to reflect real-DB-backed status.
11. **E9 — Resolve `src/lib/server/db/schema.ts` ~L397 TODO:** the `TODO (when Better Auth is wired)` framing is stale (Better Auth IS live-wired). Reword to drop the "when wired" framing. The underlying concern (whether the adapter handles the `(provider_id, account_id)` unique violation gracefully via ON CONFLICT vs surfacing a 500) is genuinely unverified → keep it as a `NOTE:` (not a TODO), stating Better Auth is live but the ON-CONFLICT behavior remains unverified. Do NOT delete the concern outright.

### Final regression gate

12. **E10 — Full check suite:** run `bun run check` (svelte-check/typecheck — catches any dangling mock import) then `bun run test:unit:ci` (all existing tests green). Both must pass. This is the hard constraint.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `grep -rn "lib/services\|mock-data\|server/mock\|StubNote\|mockCrmClient\|CrmClient" src/` → 0 hits | Fully-Automated | Mock CRM client fully removed from source (Goal 1) |
| `bun run build` exits 0 | Fully-Automated | Mock deletions + dep reclassification produce a working bundle; no fake PII in browser bundle (Goal 1, Goal 3) |
| `bun run check` exits 0 | Fully-Automated | No dangling mock imports / type breakage after `$lib/services` removal (Goal 1) |
| `bun run test:unit:ci` all green | Fully-Automated | Existing behavior preserved; DB env guard doesn't break db-importing tests (hard constraint, Goal 2) |
| `grep -n "\"drizzle-orm\"\|\"postgres\"\|\"layerchart\"\|\"bits-ui\"\|\"@lucide/svelte\"\|\"@internationalized/date\"" package.json` all under `dependencies` | Fully-Automated | Runtime deps correctly classified (Goal 3) |
| DB module throws clear error when `DATABASE_URL` unset (temporarily unset in a scratch shell, import db, observe message) | Fully-Automated | Fail-fast guard works (Goal 2) |
| `grep -n "mock data only\|stubbed" all-context.md` in reports/email context → 0 stale hits | Fully-Automated | Doc drift corrected (Goal 4) |
| Manual authed nav: login as manager, confirm real role preserved + no fabricated identity rendered; visit `/unauthorized` and confirm no fake user in shell | Agent-Probe | `+layout.ts` mock-fallback removal preserves real identity (Security Note) — **CONDITIONAL: no automated authed-session harness exists** |
| `+layout.ts` corrected client-load runtime render path (currentUser from serverUser only) | Known-Gap → backlog stub | Runtime render of the client load with `ssr=false` — no vitest harness for `+layout.ts`; keeps gate CONDITIONAL, proven indirectly by `check` (types) + `build` + the Agent-Probe manual nav |
| Sentry error tracking | Known-Gap (pre-accepted) | **Explicitly accepted per user decision** — NOT wired in this plan; recorded here so it is not silently ignored |

**Known-Gap backlog stubs required at EXECUTE/UPDATE-PROCESS:**
- `layout-client-load-test-harness_NOTE_03-07-26.md` — no automated coverage for `+layout.ts` (client load, `ssr=false`). Depends on the shared authed-session fixture gap already tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

---

## Test Infra Improvement Notes

Post-phase testing / verification context: `process/context/tests/all-tests.md` (test runner + command reference). Verification gates are defined in the Verification Evidence table above.

- `+layout.ts` is a client load with `ssr = false` and no existing test coverage (RESEARCH-confirmed). Automated verification of its corrected behavior is blocked on the repo-wide **shared Playwright authenticated-session fixture** gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), which already blocks e2e for 2+ features. Once that fixture exists, add a client-load render assertion. Until then the layout behavior is Agent-Probe (manual) + Known-Gap (automated).
- The DB env guard (E4) has no dedicated unit test; it is covered indirectly by the full `test:unit:ci` run (db-importing tests exercise the module) plus the scratch-shell unset check. The `*-db.spec.ts` files self-skip via `SKIP_DB = !process.env.DATABASE_URL` but import `db` at module top — E4a addresses the module-import-vs-skip ordering.

---

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A route WITHOUT its own server `users`/`leads` silently relies on the layout mock | Low (all 11 consumers verified self-provide at VALIDATE) | E1a hard gate re-greps all 11 before deletion; STOP if any unshadowed consumer found |
| DB env throw breaks db-importing tests at IMPORT when `DATABASE_URL` unset | Medium | E4a decision gate (hardened): test in a `DATABASE_URL`-unset shell; keep throw only if import-safe there, else use b1 (CI sets the var) or b2 (lazy guard) — NOT the bare-fallback which also crashes on `.replace()` |
| `bun install` introduces version drift when moving deps | Low | E6 confirms lockfile diff is classification-only, no version bumps |
| Incomplete mock removal leaves a dangling import | Low | E3 + E10 grep/typecheck gates |

**No blocking dependencies.** All work is self-contained in one session.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/prod-readiness-remediation_03-07-26/prod-readiness-remediation_PLAN_03-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written below (Gate: CONDITIONAL).
3. **Validate-contract status:** written 03-07-26 (see `## Validate Contract`).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; verified source: `+layout.ts`, `+layout.server.ts`, `+layout.svelte`, `services/*`, `db/index.ts`, `email.ts`, `schema.ts` (L385-405), `hooks.server.ts`, all 11 consuming `+page.server.ts` routes, `package.json`, `src/tests/` db-import inventory.
5. **Next step for a fresh agent:** EXECUTE the checklist E1→E10 in order. E1a (shadowing re-verify against ALL 11 consumers) and E4a (DB-guard test-safety, hardened) are the two mandatory decision gates — do not skip. Deletion-heavy; keep it a subtraction. Do NOT touch Docker/Caddy files, do NOT wire Sentry, do NOT remove `ssr=false`.

---

## Acceptance Criteria

All are testable; all must hold before the plan is archived:

1. `grep -rn "lib/services\|mock-data\|server/mock\|StubNote\|mockCrmClient\|CrmClient" src/` returns 0 hits.
2. `bun run build` exits 0 and the browser bundle contains no mock/fake-PII code.
3. `bun run check` exits 0 (no dangling imports / type breakage).
4. `bun run test:unit:ci` — all existing tests green (hard constraint).
5. The 6 runtime packages (`drizzle-orm`, `postgres`, `layerchart`, `bits-ui`, `@lucide/svelte`, `@internationalized/date`) appear under `dependencies` in `package.json`; `bun.lock` regenerated with no version drift.
6. `src/lib/server/db/index.ts` throws a clear error when `DATABASE_URL` is unset (or, per E4a b2 lazy-guard, fails fast at query time while remaining import-safe) — and no longer contains the hardcoded localhost string.
7. `all-context.md` no longer describes reports as "mock data only" or email as "stubbed".
8. `schema.ts` Better-Auth comment no longer uses the stale "when Better Auth is wired" TODO framing.
9. Sentry recorded as an accepted known-gap (not silently dropped).

## Phase Completion Rules

Single-phase SIMPLE plan. Completion = all 9 Acceptance Criteria met AND the EVL confirmation run (independent re-run of the gate commands) is green. Code-complete without the green EVL run is `CODE DONE`, not `VERIFIED`. The Agent-Probe manual authed-nav check (Security Note) and the two Known-Gaps (layout client-load harness, Sentry) are CONDITIONAL/accepted — they do not block completion but must be recorded as backlog stubs at UPDATE PROCESS.

## Validate Contract

Status: CONDITIONAL
Date: 03-07-26
date: 2026-07-03
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 auth-adjacent contract narrowing, S6 high-risk classes present, S7 5+ files) — self-contained single-app deletion plan; validate fan-out executed directly against source (fresh context), no coordination needed.

Test gates (C3 5-column table — ADDITIVE; the legacy line form below is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Mock CRM client fully removed from source | Fully-Automated | `grep -rn "lib/services\|mock-data\|server/mock\|StubNote\|mockCrmClient\|CrmClient" src/` → 0 hits | A |
| AC2 | Working bundle, no fake PII shipped | Fully-Automated | `bun run build` exits 0 | A |
| AC3 | No dangling mock import / type breakage | Fully-Automated | `bun run check` exits 0 | A |
| AC4 | Existing behavior preserved; DB guard doesn't break db-spec imports | Fully-Automated | `bun run test:unit:ci` all green (run per E4a in a `DATABASE_URL`-unset shell to be CI-representative) | A |
| AC5 | 6 runtime deps under `dependencies` | Fully-Automated | `grep -n "\"drizzle-orm\"\|\"postgres\"\|\"layerchart\"\|\"bits-ui\"\|\"@lucide/svelte\"\|\"@internationalized/date\"" package.json` all in deps block | A |
| AC6 | DB fails fast on unset `DATABASE_URL`; no hardcoded localhost | Fully-Automated | Unset `DATABASE_URL` in scratch shell, import `db`, observe clear error (or E4a b2 query-time failure) | A |
| AC7 | Doc drift corrected (reports/email) | Fully-Automated | `grep -n "mock data only\|stubbed" all-context.md` reports/email context → 0 stale hits | A |
| AC8 | schema.ts TODO reworded (Better Auth live) | Fully-Automated | `grep -n "when Better Auth is wired" src/lib/server/db/schema.ts` → 0 hits | A |
| SEC-A | `+layout.ts` mock-fallback removal preserves real identity, renders no fabricated user (incl. `/unauthorized`) | Agent-Probe | Manual authed nav: login as manager (real role preserved) + visit `/unauthorized` (no fake user in shell) | C — blocked on shared authed-session harness; manual until then |
| KG-1 | `+layout.ts` client-load (`ssr=false`) runtime render, automated | Agent-Probe (manual) + residual | Proven indirectly by `check` + `build` + SEC-A manual nav; no vitest harness for `ssr=false` client load | D — backlog stub `layout-client-load-test-harness_NOTE_03-07-26.md`; depends on `e2e-auth-bootstrap_NOTE_01-07-26.md` |
| KG-2 | Sentry error tracking | (none — pre-accepted residual) | Not wired in this plan | D — pre-accepted known-gap per user decision; recorded, not dropped |

gap-resolution legend: A — proven now; B — gate added by this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual, keep-active, continue).

C-4 reconciliation: the `strategy` column carries only proving strategies (Fully-Automated / Agent-Probe). KG-2 has no proving strategy — it is a named residual (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained for existing validate-contract consumers):
- Mock removal / grep clean: Fully-automated: `grep -rn "lib/services\|mock-data\|server/mock\|StubNote\|mockCrmClient\|CrmClient" src/` → 0
- Bundle integrity: Fully-automated: `bun run build` exits 0
- Type integrity: Fully-automated: `bun run check` exits 0
- Regression suite: Fully-automated: `bun run test:unit:ci` (E4a: run with `DATABASE_URL` unset to mirror CI)
- Dep classification: Fully-automated: grep package.json deps block for the 6 packages
- DB fail-fast: Fully-automated: scratch-shell unset `DATABASE_URL` + import db
- Doc drift: Fully-automated: `grep -n "mock data only\|stubbed" all-context.md` → 0 stale
- Security nav (identity): Agent-probe: manual authed nav incl. `/unauthorized` — precondition: a signed-in manager session + no authed-session e2e harness
- Layout client-load render: Known-gap: documented (backlog stub; blocked on shared auth fixture)
- Sentry: Known-gap: documented (pre-accepted per user decision)

Dimension findings:
- Infra fit: PASS — single app, no container/port surfaces; all 12 touchpoint paths exist; build/check/test scripts and `email.ts` throw convention confirmed.
- Test coverage: CONCERN — core gates are Fully-Automated and sound; residuals are the E4a import-vs-skip ordering (addressed via hardened decision gate) and the `+layout.ts` client-load automated harness (known-gap, blocked on shared auth fixture).
- Breaking changes: CONCERN — `$lib/services` removal has exactly one external importer (`+layout.ts:2`, confirmed); `+layout.ts` data contract narrows but all 11 layout-data consumers self-provide (verified, not the "4" originally claimed); `db` module now throws at import when `DATABASE_URL` unset.
- Security surface: PASS (note) — `getCurrentUser()` fallback removal hardens the trust boundary; hooks redirects before it fires on protected routes; the one active path (`/unauthorized`, fake identity → null) is the intended hardening and is covered by the SEC-A manual probe. No new secret/auth logic added.
- Section — Bucket 1 (mock removal): CONCERN — mechanically feasible (E3 grep confirms single external importer); gap found: plan's consumer enumeration understated (4→11), fixed in this contract + Research Correction table; highest-risk edit = deleting `$lib/services` before E1a re-greps all 11 consumers.
- Section — Bucket 2 (DB fail-fast): CONCERN — mechanically feasible; conflict found: plan's stated fallback (`const rawUrl = env.DATABASE_URL;`) crashes at `db/index.ts:13` `.replace()` on undefined — corrected E4a with CI-representative testing + b1/b2 safe alternatives; highest-risk edit = the throw breaking `*-db.spec.ts` imports if CI lacks `DATABASE_URL`.
- Section — Bucket 3 (dep reclassification): PASS — all 6 confirmed runtime-imported and currently in devDeps; `drizzle-kit` correctly retained in devDeps.
- Section — Bucket 4 (doc/comment cleanup): PASS — schema.ts L394-398 TODO target confirmed; `reports/+page.server.ts` confirmed fully DB-backed and `email.ts` confirmed live Resend, so both doc corrections are accurate.

Open gaps:
- SEC-A manual authed-nav probe — no automated authed-session harness exists (repo-wide known gap).
- `+layout.ts` client-load automated render: known-gap: documented as backlog stub `layout-client-load-test-harness_NOTE_03-07-26.md` — depends on `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- Sentry: known-gap: documented — pre-accepted per user decision (NOT a new-plan-required gap; explicitly out of scope).

What this coverage does NOT prove:
- `grep`/`build`/`check`/`test:unit:ci` prove no dangling imports, a compiling bundle, and green existing unit tests — they do NOT prove the runtime render of the `ssr=false` `+layout.ts` client load (no vitest/e2e harness for it) or that an authenticated manager session renders manager-gated UI with the real role (SEC-A manual probe covers this, not automated).
- `bun run build` proves the bundle compiles — it does NOT prove the deployed browser bundle is byte-for-byte free of mock strings (the grep-clean gate is the source-level proxy for that).
- The DB fail-fast scratch-shell check proves the module throws when `DATABASE_URL` is unset — it does NOT prove behavior in a real production boot with a malformed-but-present `DATABASE_URL`.
- The E4a decision proves import-safety only in the exact environment it was run in — CI import-safety is only guaranteed if the ci-cd unit job sets `DATABASE_URL` (b1) or the lazy-guard variant (b2) is used.

Gate: CONDITIONAL (0 FAILs; concerns accepted with documented mitigations; 2 pre-accepted known-gaps + 1 manual Agent-Probe recorded)
Accepted by: session (user explicitly requested, in the VALIDATE invocation, that Sentry and the `+layout.ts` client-load test-coverage gap be recorded as known-gaps rather than blocking FAILs — concern 5). Accepted concerns by name: (1) SEC-A manual authed-nav Agent-Probe (no automated authed-session harness); (2) KG-1 `+layout.ts` client-load automated render harness (blocked on shared auth fixture); (3) KG-2 Sentry error tracking (out of scope per user decision). The E1a-consumer-list and E4a-fallback concerns were RESOLVED via plan-text fixes in this cycle (not carried as accepted gaps).

## Autonomous Goal Block

```
SESSION GOAL: Production-readiness remediation — remove shipped mock CRM client (fake PII in browser bundle), add fail-fast DATABASE_URL guard, fix runtime dependency classification, correct stale context docs.
Charter + umbrella plan: N/A — single plan (process/general-plans/active/prod-readiness-remediation_03-07-26/prod-readiness-remediation_PLAN_03-07-26.md)
Autonomy: subtraction-only mechanical cleanup; per-goal autonomous execution permitted (reversible edits). Auto-proceed on reversible steps; the two decision gates (E1a shadowing, E4a DB-guard test-safety) must be executed, not skipped.
Hard stop conditions / safety constraints:
- E1a: if ANY of the 11 layout-data consumer routes does NOT self-provide the users/leads field it reads, STOP before deleting $lib/services — do not delete on an unshadowed consumer.
- E4a: do NOT keep the bare DB throw if it breaks *-db.spec.ts imports when DATABASE_URL is unset; and do NOT use the bare `const rawUrl = env.DATABASE_URL;` fallback (it crashes at db/index.ts:13 .replace() on undefined). Use b1 (confirm CI sets DATABASE_URL) or b2 (lazy guard) instead.
- Do NOT wire Sentry, do NOT remove `ssr=false`, do NOT touch Caddyfile/Dockerfile/docker-compose.yml.
Next phase: EXECUTE: process/general-plans/active/prod-readiness-remediation_03-07-26/prod-readiness-remediation_PLAN_03-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL, 03-07-26)
Execute start: run E1→E10 in order. Fully-auto gates: `grep -rn "lib/services|mock-data|server/mock|StubNote|mockCrmClient|CrmClient" src/` → 0 | `bun run build` | `bun run check` | `bun run test:unit:ci` (E4a: run with DATABASE_URL unset). Agent-probe: manual authed nav incl. /unauthorized. High-risk pack: no (deletion-heavy; auth-adjacent removal is a hardening, covered by SEC-A manual probe).
```
