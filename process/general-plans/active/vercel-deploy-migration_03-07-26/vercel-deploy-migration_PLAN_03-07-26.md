---
name: plan:vercel-deploy-migration
description: "Migrate SvelteKit/Bun CRM to Vercel free-tier (adapter swap) plus 5 deployment-readiness fixes"
date: 03-07-26
feature: general
---

# Vercel Deploy Migration + Deployment-Readiness Fixes — PLAN

**Date**: 03-07-26
**Status**: Active — partially executed (03-07-26). Sections A (adapter swap), B (reminders fail-closed), F (log-gate + env doc), and G-reminders (fail-closed tests) are DONE and green. Sections C/D/E (journal reconciliation + `pending_welcome` DB column + Set-removal wiring) are DEFERRED — blocked by a pre-existing drizzle snapshot drift far broader than the plan's D4 scoped (see `## Current Execution State` + `## Deviations` below and the updated backlog note `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`).
**Complexity**: COMPLEX (single plan artifact — multi-surface, schema migration + deploy/runtime, high-risk class present). Not a phase program.

**TL;DR:** Swap the SvelteKit adapter from `svelte-adapter-bun` to `@sveltejs/adapter-vercel` (Node serverless runtime), then land five serverless-correctness/readiness fixes: (1) reminders `due` endpoint fail-closed, (2) `pending_welcome` moves from an in-memory `Set` to a DB column (serverless has no shared process memory), (3) reconcile the drizzle migration-journal drift BEFORE generating the new column migration, (4) dev-gate the magic-link `console.log`, (5) document `BETTER_AUTH_API_KEY` in `.env.example`. SPEC/INNOVATE skipped — mechanical work.

---

## Overview

The app currently builds for Bun via `svelte-adapter-bun` and runs as a long-lived single process (Docker/Compose/Caddy). Vercel free-tier runs each request in ephemeral Node serverless functions. Two things break under that model unless fixed:

1. **Module-level in-memory state** (`pendingWelcomeEmails` Set) is written by one invocation (`POST /api/users`) and read by a *different* invocation (`sendMagicLink`). Different serverless processes → the Set is empty at read time → new users silently get the login-email copy instead of the welcome copy.
2. **A fail-open auth check** on `/api/reminders/due` (allows the request when the secret env var is unset) — must fail closed before a public deploy.

The remaining items are bundled readiness fixes surfaced during audit.

## Goals

- App deploys and runs on Vercel free-tier using `@sveltejs/adapter-vercel` (default Node serverless runtime — NOT edge; postgres-js and `$env/dynamic/private` require Node).
- Welcome-vs-login email selection is correct under serverless (DB-backed flag).
- `/api/reminders/due` fails closed, consistent with its sibling `/api/reminders/notify`.
- Drizzle migration journal is internally consistent before any new migration is generated.
- No working login URLs leak into production logs.
- `.env.example` documents every env var the code reads.
- All existing tests still pass; new tests cover the two behavior changes where reasonably scoped.

## Scope

**In scope:** adapter swap, dependency changes, the 5 fixes above, the new `pending_welcome` column + migration, journal-drift reconciliation, tests for the reminders fix and pending_welcome flow, a manual deployment-steps note.

**Out of scope (do NOT touch):**
- HTTP security headers (CSP/HSTS/etc.)
- Timing-safe secret comparison
- Sentry wiring
- Actual Vercel account/project creation and Neon connection-string retrieval (user actions — captured as a manual note only)

---

## Touchpoints

| File | Change |
|---|---|
| `vite.config.ts` | Swap adapter import (line ~5) `svelte-adapter-bun` → `@sveltejs/adapter-vercel`; update the stale comment above it. `adapter: adapter()` call site (line ~20) unchanged (default Node runtime). |
| `package.json` | Add `@sveltejs/adapter-vercel` (^5.x) to devDependencies; remove `svelte-adapter-bun`. Keep `@sveltejs/adapter-node`. |
| `src/routes/api/reminders/due/+server.ts` | Fail-closed: `if (secret && provided !== secret)` → `if (!secret || provided !== secret)`. Update the stale STUB comment. |
| `src/lib/server/db/schema.ts` | Add `pendingWelcome: boolean('pending_welcome').notNull().default(false)` to `crmUsers`. |
| `drizzle/` + `drizzle/meta/_journal.json` | (a) Reconcile the orphaned `0014_agreements_fields.sql` drift; (b) generate the new `pending_welcome` migration. |
| `src/lib/server/db/users.ts` | `createUser` sets `pendingWelcome: true` on insert (replaces the Set add at the API layer — see Public Contracts note). |
| `src/routes/api/users/+server.ts` | Remove `pendingWelcomeEmails.add(email)` / `.delete(email)`; the flag is now set inside `createUser`. |
| `src/lib/server/auth.ts` | `sendMagicLink` reads+clears the DB flag (atomic update returning previous value) instead of the Set; dev-gate the `console.log` behind `import { dev } from '$app/environment'`; drop the `pendingWelcomeEmails` import. |
| `src/lib/server/email-templates.ts` | Remove `export const pendingWelcomeEmails` and its doc comment. |
| `.env.example` | Add `BETTER_AUTH_API_KEY=""` with a comment. |
| `src/tests/*.spec.ts` | New/updated tests: reminders fail-closed; pending_welcome flag read+clear logic. |
| `Dockerfile` | Add a comment marking the Bun run path as currently non-functional (see Decision D1). |

## Public Contracts

- **`crm_users` gains `pending_welcome boolean NOT NULL DEFAULT false`.** Additive, non-breaking; follows Drizzle conventions (snake_case, `crm_` table). Soft-delete convention N/A (no delete of user rows here).
- **`createUser({name, email, role})` behavior change:** now also sets `pending_welcome = true`. Signature unchanged. Callers: `POST /api/users` only.
- **`pendingWelcomeEmails` export is REMOVED** from `email-templates.ts`. Importers: `auth.ts`, `api/users/+server.ts` — both updated in this plan. No external package imports it (single app, no workspace consumers).
- **`sendMagicLink` welcome-selection contract:** reads the DB flag for the email, and if true, clears it (set false) and sends the welcome template; else sends login. The read+clear MUST be a single atomic UPDATE ... RETURNING to avoid a double-welcome race (see Decision D2).
- No API route signatures or response shapes change. `/api/reminders/due` response unchanged; only the auth gate tightens.

## Blast Radius

- **~11 files** across one package (the app). No workspace-package fan-out.
- **Risk class: HIGH** — schema/data migration + deploy/runtime config change + auth-adjacent (welcome email path touches the magic-link flow and the `crm_users` allowlist table). Per repo convention this triggers the risk-evidence-pack / manual-first handoff at EXECUTE (see Risks).
- Migration touches the live Neon DB. The journal-drift reconciliation is the single highest-risk step — a wrong move can generate an ALTER that conflicts with existing live columns.

---

## Key Decisions (locked — no creative choice left for EXECUTE)

**D1 — Docker/Bun path becomes dead, and that is accepted.** SvelteKit supports exactly ONE adapter. Once `adapter-vercel` is active, `bun run build` no longer produces the `svelte-adapter-bun` server output that `Dockerfile`/`docker-compose`/`Caddyfile` expect, so the Docker run path is non-functional. Per the user's "keep the files for now" decision, we KEEP those files but add a one-line comment at the top of the `Dockerfile` server-run section: `# NOTE (03-07-26): non-functional while adapter-vercel is active — SvelteKit allows one adapter only. Re-add svelte-adapter-bun in vite.config.ts to restore this path.` Do NOT try to keep both adapters. `@sveltejs/adapter-node` stays in devDependencies (harmless, already documented as fallback).

**D2 — pending_welcome read+clear is atomic.** In `sendMagicLink`, do NOT do a SELECT then a separate UPDATE. Use a single `UPDATE crm_users SET pending_welcome = false WHERE email = ? AND pending_welcome = true RETURNING id` (Drizzle: `.update(crmUsers).set({pendingWelcome:false}).where(and(eq(email), eq(pendingWelcome, true))).returning(...)`). If a row is returned → this was a pending welcome → send welcome (name looked up as today). If no row → send login. This preserves the original "consume-once" semantics of `Set.delete()` and is race-safe across concurrent serverless invocations.

**D3 — reminders `due` fail-closed pattern = match the sibling `notify` endpoint exactly.** Use `if (!secret || provided !== secret) throw error(401, 'unauthorized')`. Rationale: `/api/reminders/notify` (same directory, same n8n caller, same secret) already uses this exact pattern. Do NOT adopt the `/api/leads/ingest` two-branch 500+401 pattern — it uses a different secret and adds an inconsistent 500 for the `due` sibling. Also update the misleading `// STUB: ... allow` comment.

**D4 — Journal-drift reconciliation strategy (investigate-then-resolve, DB-state-driven).** Confirmed facts: `0014_agreements_fields.sql` exists on disk, is NOT in `_journal.json` (idx 14 = `0014_nasty_master_mold`), and the agreements columns (`fee_structure`, `transaction_fee_pct`, `convenience_fee_pesos`, `service_fee_pct`, `service_fee_per_ticket_pesos`, `bank_charges_absorbed`) appear in `schema.ts` but in **no drizzle snapshot** (`drizzle/meta/*.json`). This means drizzle's tracked state does not know these columns exist. Consequence: a naive `bun run db:generate` will diff `schema.ts` against snapshot 0019 and emit ALTER ADD COLUMN for the agreements columns **plus** `pending_welcome` together — and the agreements ALTERs would fail/conflict on a live DB that already has them. Resolution is in the checklist (steps 8–12): verify live-DB column presence first, then either (a) fold the agreements columns into the drizzle snapshot state so the generator stops re-emitting them, or (b) if live DB lacks them, let the generated migration create them with the new one. The generated `pending_welcome` migration must ultimately contain ONLY the `pending_welcome` column (plus any genuinely-missing agreements columns if the live DB truly lacks them). This step is a hard prerequisite gate before any new migration is committed.

---

## Implementation Checklist (atomic, ordered)

### A. Adapter migration (mechanical)
1. In `vite.config.ts`: replace `import adapter from 'svelte-adapter-bun';` with `import adapter from '@sveltejs/adapter-vercel';`. Leave the `adapter: adapter()` call unchanged (default Node serverless runtime — do NOT pass `runtime: 'edge'`).
2. In `vite.config.ts`: replace the stale comment block above the import (currently references `svelte-adapter-bun` as production target) with a note that production target = Vercel Node serverless, `adapter-node` remains the self-host fallback.
3. In `package.json`: add `"@sveltejs/adapter-vercel": "^5.0.0"` to `devDependencies`; remove the `"svelte-adapter-bun": "^1.0.1"` line. Keep `@sveltejs/adapter-node`.
4. Run `bun install` to update `bun.lock`.
5. In `Dockerfile`: add the D1 non-functional NOTE comment at the server-run section. Do not otherwise modify Docker/Compose/Caddy.
6. Gate: `bun run build` completes and emits Vercel adapter output (`.vercel/output/` or `.svelte-kit` Vercel build) with no adapter-resolution error.

### B. Reminders fail-closed fix
7. In `src/routes/api/reminders/due/+server.ts`: change the auth guard to `if (!secret || provided !== secret) throw error(401, 'unauthorized');` (Decision D3) and replace the misleading `// STUB: ... allow` comment with a note matching the `notify` sibling ("require a configured secret; fail closed"). Keep the read-only GET semantics (still MUST NOT mark anything sent).

### C. Journal-drift reconciliation (HARD PREREQUISITE — before any new migration)
**Precondition / STOP gate (PVL supplement):** EXECUTE requires `DATABASE_URL` access to the target Neon DB for step 9 (live-truth check) and step 12 (dry-diff). If unavailable: STOP Sections C/D, do NOT guess the reconciliation, defer the migration to the manual deploy gate as a known-gap, and never run `db:generate`/`db:push` blind.
8. Read `all-context.md` §Drizzle conventions "before running db:generate" checklist and re-confirm the drift: `_journal.json` last idx (19) vs highest `.sql` on disk (0019), and the orphaned `0014_agreements_fields.sql`.
9. Determine live-DB truth: check whether the agreements columns already exist on `crm_leads` in the target Neon DB (via `bun run db:studio` or a `\d crm_leads` / `information_schema.columns` query). Record the finding in the phase report.
10. If agreements columns EXIST in live DB (expected case): reconcile drizzle's snapshot state so the generator no longer re-emits them — regenerate/repair the snapshot to include the agreements columns (or register `0014_agreements_fields.sql` into the journal + snapshot chain so its columns are considered applied). The orphaned file must end up either (a) deleted after its columns are represented in a snapshot, or (b) properly journaled. Choose per what leaves `db:generate` emitting a clean diff.
11. If agreements columns do NOT exist in live DB: leave them to be created by the upcoming generated migration (they will appear in the same ALTER as `pending_welcome`), and delete the orphaned duplicate-prefix `0014_agreements_fields.sql` to remove the prefix collision.
12. Verify reconciliation: a dry `bun run db:generate` (or diff inspection) shows drizzle would emit ONLY `pending_welcome` (case 10) — or `pending_welcome` + genuinely-missing agreements columns (case 11) — and no duplicate-prefix / unregistered-file warnings remain.

### D. pending_welcome column + migration
13. In `src/lib/server/db/schema.ts`: add `pendingWelcome: boolean('pending_welcome').notNull().default(false)` to the `crmUsers` table body (after `authSubject`, before the timestamps, matching column grouping).
14. Run `bun run db:generate` — only after step 12 passes. Confirm the generated `.sql` adds `pending_welcome` to `crm_users` and nothing unexpected. Confirm `_journal.json` gets exactly one new sequential idx (20) with a unique tag.
15. (Deployment-time, documented in the manual note — NOT run blind here) `bun run db:push` / `db:migrate` against the target DB.

### E. pending_welcome wiring (replace the in-memory Set)
16. In `src/lib/server/db/users.ts`: in `createUser`, add `pendingWelcome: true` to the `.insert(crmUsers).values({...})` object.
17. In `src/routes/api/users/+server.ts`: remove `import { pendingWelcomeEmails }`; remove the `pendingWelcomeEmails.add(email)` call (now handled in `createUser`); remove the `pendingWelcomeEmails.delete(email)` call in the signInMagicLink catch block. (On send-failure the flag stays `true` so a later magic-link retry still gets the welcome copy — acceptable and arguably more correct than the old delete-on-failure behavior; note this in the phase report.)
18. In `src/lib/server/auth.ts`: add `and` to the `drizzle-orm` import (currently `import { eq }` → `import { and, eq }`), then replace the `pendingWelcomeEmails.has/delete` block in `sendMagicLink` with the atomic read+clear (Decision D2): `.update(crmUsers).set({ pendingWelcome: false }).where(and(eq(crmUsers.email, email), eq(crmUsers.pendingWelcome, true))).returning({ name: crmUsers.name })` — if a row returns, send `welcomeEmail(row.name ?? 'there', url)`; else send `loginEmail(url)`. Remove the `pendingWelcomeEmails` import. (Note: the existing separate name-lookup SELECT can be folded into this RETURNING, dropping one query.)
19. In `src/lib/server/email-templates.ts`: remove `export const pendingWelcomeEmails = new Set<string>()` and update the module doc comment (drop the Set paragraph; keep the IMPORT-PURE note).
20. Grep to confirm zero remaining references: `grep -rn pendingWelcomeEmails src/` returns nothing.

### F. Log-leak + env doc fixes
21. In `src/lib/server/auth.ts`: gate the magic-link `console.log` behind `dev` — add `import { dev } from '$app/environment';` and wrap: `if (dev) console.log(...)`. (Resend sends the real email in prod, so the log is dev-only convenience.)
22. In `.env.example`: add `BETTER_AUTH_API_KEY=""` with a comment (e.g. `# Better Auth dashboard plugin key (dash()) — STUB in v0`) grouped with the other Better Auth vars.

### G. Tests
23. Add/extend a spec for `/api/reminders/due` fail-closed behavior: unset secret → 401; wrong secret → 401; matching secret → 200. **The 200-match case MUST mock `getDueReminders`/`getDueMeetingReminders` (the 200 path calls `getDueMeetingReminders()` → DB after the guard); if clean mocking is impractical, record that row as Hybrid rather than Fully-Automated.** Follow the existing endpoint-test idiom (see `src/tests/hooks-server.spec.ts` for the throw-error assertion pattern). If the handler cannot be unit-invoked cleanly, cover the guard logic at the smallest testable unit and record any gap.
24. Add/extend a spec for the pending_welcome selection logic: given a pending row, read+clear returns the row and yields welcome copy; given no pending row, yields login copy; and the clear is idempotent (second call yields login). Prefer testing the pure selection/branch; DB-touching assertions are Hybrid-tier (need live DB — see Verification Evidence).
25. Run the full suite (`bun run test` / vitest) — all 30 existing spec files plus new ones green.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run build` completes with adapter-vercel, no adapter-resolution error | Fully-Automated | AC1 — app builds for Vercel Node serverless |
| `grep -rn "svelte-adapter-bun" vite.config.ts` returns nothing; `grep adapter-vercel vite.config.ts` matches | Fully-Automated | AC1 — adapter swapped |
| Vitest: `/api/reminders/due` returns 401 when secret unset, 401 on mismatch, 200 on match | Fully-Automated | AC2 — reminders endpoint fails closed |
| Vitest: pending_welcome selection — pending row → welcome copy + flag cleared; no row → login copy; idempotent | Fully-Automated (pure branch) / Hybrid (DB read+clear) | AC3 — welcome email correct under serverless |
| `grep -rn pendingWelcomeEmails src/` returns nothing | Fully-Automated | AC3 — in-memory Set fully removed |
| `db:generate` dry diff emits only `pending_welcome` (+ genuinely-missing agreements cols), no dup-prefix warning; `_journal.json` last idx = 20 unique tag | Hybrid | AC4 — journal drift reconciled before new migration |
| Applied migration adds `pending_welcome boolean NOT NULL DEFAULT false` to `crm_users` | Hybrid (needs target DB) | AC4/AC3 — column exists per Drizzle conventions |
| `grep -n "if (dev)" src/lib/server/auth.ts` wraps the magic-link log | Fully-Automated | AC5 — no login-URL leak in prod logs |
| `grep BETTER_AUTH_API_KEY .env.example` matches | Fully-Automated | AC6 — env var documented |
| Full vitest suite (30 existing + new) green | Fully-Automated | AC7 — no regressions |
| Manual: deploy to Vercel, complete a real magic-link login for a newly-created user, confirm welcome email received | Agent-Probe / manual | AC3 end-to-end (deferred to deployment — see manual note) |

Acceptance criteria (derived, since SPEC skipped):
- **AC1** App builds and is deployable on Vercel free-tier via adapter-vercel (Node runtime).
- **AC2** `/api/reminders/due` fails closed (401 when secret unset or mismatched).
- **AC3** Welcome-vs-login email selection is correct under serverless (DB-backed, race-safe).
- **AC4** Migration journal is consistent before the new column migration is generated/committed.
- **AC5** No working login URLs in production logs.
- **AC6** `.env.example` documents `BETTER_AUTH_API_KEY`.
- **AC7** All existing tests pass.

---

## Dependencies & Sequencing

- **Hard order:** Journal reconciliation (steps 8–12) MUST complete before `db:generate` (step 14). Schema edit (13) before generate (14). Generate/apply before the wiring that reads the column can be DB-tested (16–18 depend on the column existing for Hybrid tests, but the code edits themselves can be written first; only the live/Hybrid gate needs the applied migration).
- Set-removal (steps 16–20) must be atomic as a group — removing the export (19) before updating both importers (17, 18) breaks the build.
- Adapter swap (A) and reminders fix (B) and log/env fixes (F) are independent of the DB work and can land in any order relative to C/D/E.
- New dependency: `@sveltejs/adapter-vercel@^5.x` (compatible with `@sveltejs/kit ^2.63.0`).

## Risks

**Risk predictions (high-risk class — schema migration + deploy/runtime + auth-adjacent):**
- **R1 (highest) — journal drift compounds:** running `db:generate` before reconciliation emits conflicting agreements-column ALTERs against a live DB that already has them → migration failure or, worse, partial apply. Mitigation: steps 8–12 gate; inspect the generated SQL before applying; never `db:push` blind. This is the manual-first, evidence-required step of the plan.
- **R2 — double-welcome race:** two concurrent magic-link sends for the same new user could both send welcome copy if read+clear is not atomic. Mitigation: Decision D2 atomic UPDATE...RETURNING.
- **R3 — Docker path silently broken:** someone later tries `docker compose up` and it fails. Mitigation: D1 explicit NOTE comment in Dockerfile.
- **R4 — edge runtime misconfig:** if `runtime: 'edge'` were set, postgres-js + `$env/dynamic/private` break at runtime. Mitigation: keep default Node runtime; step 1 explicitly forbids edge.
- **R5 — send-failure flag semantics change:** old code deleted the pending flag on send failure; new code leaves it true (step 17). This is intentional (retry still gets welcome) but is a behavior change — recorded in the phase report.

**High-risk evidence handoff:** at EXECUTE, treat the migration apply as manual-first — inspect generated SQL, confirm live-DB column state, and capture the applied-migration evidence before marking the DB work VERIFIED. Follow the repo risk-evidence-pack convention.

## Backwards Compatibility

- New column is additive with a default → existing rows and queries unaffected.
- Existing `crm_users` reads (`db/users.ts`, `hooks.server.ts`) do not select `pending_welcome` and are unaffected.
- API response shapes unchanged; only the `due` auth gate tightens (a previously-accepted unauthenticated call now correctly 401s — this is the intended fix, not a regression).

## Deployment Steps (manual — user actions, outside code)

1. Create the Vercel project and link this repo.
2. In Vercel env vars, set `DATABASE_URL` to the Neon **pooled** connection string (the `-pooler` host — `db/index.ts` already sets `prepare: false` for neon.tech hosts, no code change needed).
3. Set `BETTER_AUTH_URL` to the real Vercel deployment URL (and `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `REMINDERS_ENDPOINT_SECRET`, `INGEST_SECRET`, `BETTER_AUTH_API_KEY` as needed).
4. Apply the new migration to the Neon DB (`bun run db:migrate` or `db:push`) — after the code lands and the migration SQL has been reviewed per R1.
5. Deploy; complete a real magic-link login for a freshly-created user to confirm the welcome email path (AC3 end-to-end).

## Test Infra Improvement Notes

- No live-DB CI harness exists (known repo gap, see `all-context.md` §Remaining v1 work #3). The `pending_welcome` DB read+clear and the applied-migration assertion are Hybrid-tier and cannot run in CI until that harness lands — pure branch/selection logic is covered Fully-Automated; the DB-touching assertions are recorded as Hybrid known-gaps for the deployment/manual gate.
- Endpoint handler unit-invocation for `/api/reminders/due`: confirm during EXECUTE whether the existing test idiom can invoke the RequestHandler directly; if not, note the smallest-testable-unit fallback.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/vercel-deploy-migration_03-07-26/vercel-deploy-migration_PLAN_03-07-26.md`
2. **Last completed step:** PLAN written + one PVL supplement cycle applied (P1–P3 folded). No code changed yet.
3. **Validate-contract status:** PASS (re-validated after PVL supplement cycle 1). Ready for EXECUTE.
4. **Supporting context loaded:** `process/context/all-context.md` (Drizzle conventions, serverless-relevant patterns), `all-planning.md`; source files read and quoted in Touchpoints/Decisions (vite.config.ts, all 3 secret-authed endpoints, auth.ts, email-templates.ts, api/users, db/users.ts, schema.ts, drizzle journal + 0014_agreements_fields.sql, .env.example).
5. **Next step for a fresh agent:** start at Checklist A (adapter swap) OR jump to Checklist C (journal reconciliation) first if preferring to de-risk the DB path early; C→D is the hard-ordered critical path. Do NOT run `db:generate` until step 12 passes. Treat the migration apply as manual-first per R1. Follow execute-agent instructions E1–E5 in the contract.

## Phase Completion Rules

This is a single-phase COMPLEX plan (no sub-phases). Completion = all of:

- All Checklist A–G items done.
- Every Verification Evidence Fully-Automated gate green (build, greps, vitest suite incl. new tests).
- Journal-drift reconciliation (steps 8–12) proven before any migration was generated/committed (R1 evidence captured).
- Hybrid/manual gates (DB read+clear, applied migration, Vercel deploy welcome-email e2e) are recorded: green where a target DB is available, else logged as accepted known-gaps for the deployment/manual step per Test Infra Improvement Notes.
- Code-only completion is `CODE DONE`; `VERIFIED` requires the migration applied to a real DB and the manual deploy welcome-email check (per testing context in `process/context/tests/all-tests.md`).

Post-phase testing: run the full vitest suite (`bun run test`) after the last checklist section, not batched earlier; treat any red as a fix-inline gate before closeout.

## Current Execution State

Last updated: 03-07-26 (EXECUTE pass 1)

| Checklist section | Status | Evidence |
|---|---|---|
| A. Adapter migration (1–6) | DONE | `bun run build` green with `@sveltejs/adapter-vercel@5.10.3`; `svelte-adapter-bun` removed from `package.json` + `bun.lock`; vite.config comment updated; Dockerfile D1 NOTE added |
| B. Reminders fail-closed (7) | DONE | `due/+server.ts` guard now `if (!secret || provided !== secret)`; STUB comment replaced |
| C. Journal-drift reconciliation (8–12) | **DEFERRED** | Live-DB truth confirmed (case-10) but drift is broader than D4 scoped — deferred (see Deviations) |
| D. pending_welcome column + migration (13–15) | **DEFERRED** | Coupled to C — no clean `pending_welcome`-only migration can be generated until the snapshot chain is reconciled |
| E. pending_welcome wiring / Set removal (16–20) | **DEFERRED** | Coupled to D — removing the working in-memory Set before the DB column exists would break the magic-link welcome path on deploy |
| F. Log-leak + env doc (21–22) | DONE | `auth.ts` magic-link log wrapped in `if (dev)` + `import { dev }`; `BETTER_AUTH_API_KEY=""` added to `.env.example` |
| G. Tests (23–25) | PARTIAL | 23 DONE (`src/tests/reminders-due-endpoint.spec.ts`, 4/4 green); 24 DEFERRED with E; 25 DONE (full suite 328 passed / 96 pre-existing skips / 0 failed) |

Fully-Automated gates green: build (AC1), adapter grep (AC1), reminders 401×3 + 200 (AC2), dev-gate grep (AC5), env-doc grep (AC6), full suite (AC7), `bun run check` (0 errors).
Deferred/known-gap: AC3 (pending_welcome serverless fix) and AC4 (journal reconciliation) — blocked by the drizzle drift backlog item, NOT by this plan's own work.

## Deviations

**DEV-1 — Section C reconciliation scope was materially larger than D4 assumed; Sections C/D/E deferred as a unit.**
- **Plan premise (D4):** only the 6 agreements columns were adrift; a snapshot fold + orphan delete would make `db:generate` emit only `pending_welcome`.
- **Verified reality (read-only live Neon DB probe, case-10):** snapshot 0019 is missing **10** `crm_leads` columns (4 onboarding + 6 agreements), is missing the **entire `crm_message_templates` table**, AND the snapshot `id`/`prevId` chain is corrupt with duplicate ids (15≡16, 17≡18≡19) so `drizzle-kit generate` hard-errors. Full scope + concrete recipe recorded in `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md` (Update 03-07-26).
- **Why deferred:** reconciling a live-DB-ahead-of-snapshot state needs a human migration-baseline decision (mark-applied vs idempotent catch-up vs baseline reset) on a HIGH-risk schema surface with no CI harness — exactly the R1 manual-first step. Improvising it autonomously is out of scope. Per the plan's own R1 STOP philosophy and EXECUTE-mode "return to PLAN on structural mismatch", the trial `drizzle/` edits were fully reverted (migration folder unchanged from committed state) and the DB chain (C+D+E) is deferred coherently: E cannot land without D's applied column, and shipping E without the column would break the deploy welcome path.
- **Impact:** the Vercel adapter migration itself (the plan headline) is complete. The serverless `pending_welcome` correctness fix (Overview item #1) remains unshipped until the drizzle-drift backlog item is resolved. No live DB was mutated; only read-only `information_schema` SELECTs ran.
- **Recommended next step:** a short PLAN/INNOVATE pass on the drizzle-drift backlog item (baseline-decision), then resume Sections C→D→E of this plan.

**DEV-2 — Dockerfile D1 NOTE placement.** Added the non-functional NOTE at the `runtime` stage (above the `COPY --from=build /app/build` line) rather than a generic "server-run section". Within blast-radius; matches D1 intent exactly.

## Validate Contract

Status: PASS
Date: 03-07-26
date: 2026-07-03
generated-by: outer-pvl
supersedes: 03-07-26 (outer-pvl) — outer PVL re-run after supplement cycle 1 has current evidence (P1–P3 folded into checklist)

Parallel strategy: sequential (VALIDATE fan-out run in simple mode — self-contained single-package plan, all ground truth loaded inline)
Rationale: 3/7 signals (S2 schema/auth surface, S6 high-risk class, S7 5+ files). MEDIUM score, but the checklist is a hard-ordered interdependent critical path (C→D→E, atomic Set-removal group) — fit favors a single sequential execute-agent over fan-out.

### PVL supplement resolution (cycle 1)

The first-pass contract was CONDITIONAL with three plan-defect CONCERNs. vc-plan-agent applied one supplement cycle; all three are now folded and verified present in the checklist:

| Prior gap | Supplement (verified) | Status |
|---|---|---|
| P1 — Section C had no explicit DB-access precondition / STOP gate (highest-risk step could be guessed blind) | §C now opens with "Precondition / STOP gate (PVL supplement)" — STOP C/D + defer to manual gate if no `DATABASE_URL`; never run `db:generate`/`db:push` blind (grep: 4 hits) | RESOLVED |
| P2 — `auth.ts` imports only `eq`; D2 atomic UPDATE needs `and` → would be a TS/build error | Step 18 now instructs `import { eq }` → `import { and, eq }` (grep: 1 hit; auth.ts confirmed still on `import { eq }` — instruction accurate) | RESOLVED |
| P3 — reminders "200 on match" mislabeled Fully-Automated (path hits DB via `getDueMeetingReminders`) | Step 23 now requires mocking `getDueReminders`/`getDueMeetingReminders` OR recording that row as Hybrid (grep: 2 hits) | RESOLVED |

### Net gate derivation

Layer 1 dimensions:

| Layer 1 dimension | Status |
|---|---|
| Infra / setup fit | PASS |
| Test coverage | PASS (was CONCERN — 200-match mislabel corrected by P3) |
| Breaking changes | PASS |
| Security surface | PASS (net improvement) |

Layer 2 sections:

| Layer 2 section | Status |
|---|---|
| A — Adapter migration | PASS |
| B — Reminders fail-closed | PASS |
| C — Journal-drift reconciliation | PASS (was CONCERN — STOP gate added by P1; residual DB-access is an execute-time precondition, not a plan defect) |
| D — pending_welcome column + migration | PASS (gated on C STOP gate) |
| E — pending_welcome wiring (Set removal) | PASS (was CONCERN — `and` import added by P2) |
| F — Log-leak + env doc | PASS |
| G — Tests | PASS (was CONCERN — tier mislabel corrected by P3) |

Totals: 0 FAILs / 0 CONCERNs / 11 PASSes → Net Gate: PASS

Remaining non-blocking items are execute-agent instructions (E1–E5, carried below — these are runtime constraints, not plan defects) and pre-accepted repo-wide Hybrid known-gaps (DB read+clear, applied migration, deploy e2e — excluded from CONCERN count per known-gap rule; each backed by a Hybrid gate, so the vacuous-green ban is not triggered).

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | App builds for Vercel Node serverless | Fully-Automated | `bun run build` exits 0 with adapter-vercel output (`.vercel/output/`), no adapter-resolution error | A |
| AC1 | Adapter swapped in the only config site | Fully-Automated | `grep -rn "svelte-adapter-bun" vite.config.ts` empty AND `grep adapter-vercel vite.config.ts` matches | A |
| AC2 | `/api/reminders/due` fails closed — secret unset → 401 | Fully-Automated | Vitest: mock `$env/dynamic/private` `{env:{}}`, invoke GET, assert throws 401 (throw precedes any DB call) | B |
| AC2 | `/api/reminders/due` fails closed — mismatch → 401 | Fully-Automated | Vitest: secret set, wrong bearer, assert throws 401 | B |
| AC2 | `/api/reminders/due` allows on match → 200 | Fully-Automated | Vitest: matching secret → 200 — REQUIRES mocking `getDueReminders` + `getDueMeetingReminders` (200 path calls `getDueMeetingReminders()` → DB). If mocking is impractical, downgrade this row to Hybrid | B (see E1) |
| AC3 | Welcome-vs-login selection branch (pure) | Fully-Automated | Vitest on the selection helper: row returned → welcome copy; no row → login copy; second call → login (idempotent) | B |
| AC3 | Atomic read+clear against real DB (race-safe consume-once) | Hybrid | `UPDATE crm_users SET pending_welcome=false WHERE email=? AND pending_welcome=true RETURNING name` returns exactly one row under two concurrent sends — precondition: live/target Postgres | D |
| AC3 | In-memory Set fully removed | Fully-Automated | `grep -rn pendingWelcomeEmails src/` returns nothing | A |
| AC4 | Journal drift reconciled before new migration | Hybrid | Dry `bun run db:generate` diff emits ONLY `pending_welcome` (+ genuinely-missing agreements cols in case-11), no dup-prefix / unregistered-file warning; `_journal.json` last idx = 20, unique tag — precondition: DATABASE_URL to target Neon DB | D |
| AC4 | Applied migration adds the column | Hybrid | Post-apply: `pending_welcome boolean NOT NULL DEFAULT false` present on `crm_users` — precondition: target DB + manual-first apply | D |
| AC5 | No login-URL leak in prod logs | Fully-Automated | `grep -n "if (dev)" src/lib/server/auth.ts` wraps the magic-link `console.log`; `import { dev } from '$app/environment'` present | A |
| AC6 | Env var documented | Fully-Automated | `grep BETTER_AUTH_API_KEY .env.example` matches | A |
| AC7 | No regressions | Fully-Automated | `bun run check` clean; `bun run test:unit:ci` — all existing specs (29 files) + new ones green | A |
| AC3-e2e | Deploy welcome-email end-to-end | Agent-Probe | Deploy to Vercel, create a user, complete a real magic-link login, confirm welcome email received | C (deferred to manual deploy gate) |

gap-resolution legend: A — proven now · B — fixed in this plan's checklist · C — deferred to a named later phase/gate · D — backlog test-building stub (named residual; keep-active)

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy here — the DB-touching rows are Hybrid with an explicit precondition, carried as gap-resolution D (named residual) because no live-DB CI harness exists (documented repo limitation, `all-context.md` §Remaining v1 work #3).

Legacy line form (retained for existing consumers):
- Build/adapter: Fully-automated: `bun run build` + greps
- Reminders 401 paths: Fully-automated: vitest with `$env/dynamic/private` mock
- Reminders 200 path: Hybrid-leaning: needs `getDueReminders`/`getDueMeetingReminders` mocked (else DB)
- pending_welcome selection (pure branch): Fully-automated: vitest
- pending_welcome DB read+clear: Hybrid: precondition live Postgres
- Journal-drift dry-diff + applied migration: Hybrid: precondition DATABASE_URL to target Neon DB, manual-first
- Log-gate / env doc / Set-removal grep / full suite: Fully-automated

Failing stubs (Fully-Automated rows — red-first starting point for execute-agent):

```
test("should return 401 when REMINDERS_ENDPOINT_SECRET is unset", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reminders/due unset secret → 401")
})
test("should return 401 when provided bearer does not match secret", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reminders/due mismatch → 401")
})
test("should select welcome copy for a pending row and login copy otherwise (idempotent)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: pending_welcome selection branch")
})
test("should have zero remaining pendingWelcomeEmails references in src/", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: grep pendingWelcomeEmails src/ empty")
})
```

### Dimension findings

- Infra fit: PASS — Adapter swap targets the ONLY adapter config site (no `svelte.config.js` exists; adapter is passed via the `sveltekit()` vite plugin at `vite.config.ts:20`, import at `:5`). Default Node runtime correct (edge would break postgres-js + `$env/dynamic/private`; step 1 forbids edge). Neon pooled connection-string guidance is the right serverless mitigation. Minor note: postgres-js pool `max:10` per invocation is generous for serverless — the Neon `-pooler` string absorbs it; optional to lower.
- Test coverage: PASS — 401 paths and pure-branch/grep gates are cleanly Fully-Automated. The reminders "200 on match" mislabel is corrected by supplement P3 (step 23 now mandates mocking `getDueReminders`/`getDueMeetingReminders` or recording the row as Hybrid). DB read+clear and applied-migration remain legitimately Hybrid (no live-DB CI harness — documented repo gap, accepted known-gap).
- Breaking changes: PASS — new column additive (`NOT NULL DEFAULT false`); `createUser` signature unchanged; exactly 2 code importers of the removed `pendingWelcomeEmails` export (`auth.ts`, `api/users/+server.ts`), both updated. `/api/reminders/due` auth tightening is the intended fix, not a regression — see E4 for the deploy-coordination note.
- Security surface: PASS (net improvement) — the change REMOVES two live issues: a fail-open secret gate on a public endpoint and unconditional magic-link-URL logging in prod. D2 atomic `UPDATE ... WHERE pending_welcome=true RETURNING` is race-safe (Postgres row-lock serializes concurrent sends → exactly one welcome; the second send sees the flag already false and sends login). No new trust boundary. HIGH-RISK class (schema/migration + deploy/runtime + auth-adjacent) → manual-first evidence pack REQUIRED at EXECUTE (E5).
- Section C feasibility (journal drift): PASS — supplement P1 added the explicit precondition + STOP gate, so the highest-risk step can no longer be run blind. Investigate-then-resolve approach is sound; the go/no-go gate (step 12 dry-diff emits ONLY `pending_welcome`) is concrete. Drift facts all verified: `0014_agreements_fields.sql` is an orphan prefix-collision with idx-14 `0014_nasty_master_mold`; agreements columns are in `schema.ts` but in NO snapshot; the orphan uses idempotent `ADD COLUMN IF NOT EXISTS`. Residual (live-DB access) is an execute-time precondition captured by E2, not a plan defect.
- Section E feasibility (Set removal): PASS — supplement P2 added the `and` import instruction to step 18 (`auth.ts` confirmed still on `import { eq }` — the instruction is accurate and prevents the build error). All edit targets uniquely matchable. Set-removal lands as an atomic group (plan already flags the ordering).

### Execute-agent instructions (written to contract; follow at EXECUTE)

| # | Instruction | Trigger |
|---|---|---|
| E1 | For the reminders "200 on match" test, mock `getDueReminders` and `getDueMeetingReminders` (they run after the guard and touch the DB). If clean mocking is impractical, cover only the guard and record the 200-path as Hybrid. | Section G |
| E2 | Section C is DB-state-dependent. Confirm `DATABASE_URL` reaches the target Neon DB before starting. Run step 9 (live-truth check) first; branch to case-10 or case-11 per the result; step 12 dry-diff must show ONLY `pending_welcome`. If no DB access → STOP C/D, defer to manual deploy gate as a known-gap, never apply blind. | Section C entry |
| E3 | Add `and` to the `drizzle-orm` import in `auth.ts` before writing the atomic UPDATE...RETURNING. | Section E, step 18 |
| E4 | `/api/reminders/due` now 401s when `REMINDERS_ENDPOINT_SECRET` is unset. Ensure the secret is set in the target env (and on the n8n caller) at/before deploy or due-polling breaks. Already listed in Deployment Steps §3 — confirm it. | Deploy |
| E5 | HIGH-RISK class (schema/migration + deploy/runtime + auth-adjacent). Produce the manual-first risk-evidence pack in the task folder before marking the DB work VERIFIED: `risk-gate.json`, `context-snippets.json`, `verification.json` (incl. inspected generated migration SQL + live-DB column-state finding), `review-decision.json`. Do NOT report VERIFIED on the migration without it. `CODE DONE` is allowed without live DB; `VERIFIED` is not. | Before finalizing DB work |

### Known gaps (accepted residuals — documented, justified)

- DB read+clear (D2) and applied-migration assertions are Hybrid and cannot run in CI: no live-DB CI harness exists (repo-wide limitation, `all-context.md` §Remaining v1 work #3; `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Coverage is Fully-Automated for pure-branch/greps/build/401s; DB-touching proof is deferred to the manual deploy gate. This is the same pre-accepted known-gap other features in this repo carry.
- Vercel deploy welcome-email end-to-end (AC3-e2e) is Agent-Probe / manual, deferred to the deployment step.

### What this coverage does NOT prove

- `bun run build`: proves the adapter resolves and SvelteKit emits Vercel output; does NOT prove the deployed function actually runs on Vercel infra or that env vars are wired there.
- Reminders 401 vitest: proves the guard rejects unset/mismatched secrets; does NOT prove n8n's real bearer header round-trips in production.
- pending_welcome pure-branch vitest: proves the selection logic; does NOT prove the atomic UPDATE is race-safe against real concurrent Postgres transactions (Hybrid, deferred).
- Journal dry-diff: proves drizzle would emit a clean diff locally; does NOT prove the migration applies cleanly to the live Neon DB (Hybrid + manual-first apply required).
- grep gates (Set-removal, log-gate, env doc): prove textual presence/absence; do NOT prove runtime behavior.

Open gaps: none blocking. See Known gaps for accepted residuals.

Gate: PASS (0 FAILs, 0 CONCERNs; PVL supplement cycle 1 folded P1–P3; remaining items are execute-agent instructions + pre-accepted repo-wide Hybrid known-gaps)
Accepted by: session (VALIDATE re-run after PVL supplement cycle 1) — three plan-defect CONCERNs (P1 Section-C STOP gate, P2 auth.ts `and` import, P3 reminders-200 tier label) resolved in-plan and verified; execute-agent instructions E1–E5 carried forward; two Hybrid/manual known-gaps (DB read+clear, deploy e2e) accepted as pre-existing repo-wide residuals.

## Autonomous Goal Block

```
SESSION GOAL: Migrate veent-crm to Vercel free-tier (adapter swap) + land 5 serverless-readiness fixes (reminders fail-closed, pending_welcome DB column, journal-drift reconcile, dev-gate magic-link log, document BETTER_AUTH_API_KEY).
Charter + umbrella plan: N/A — single general plan (process/general-plans/active/vercel-deploy-migration_03-07-26/vercel-deploy-migration_PLAN_03-07-26.md)
Autonomy: PVL PASS (after supplement cycle 1). EXECUTE may proceed — single sequential vc-execute-agent (opus). Follow execute-agent instructions E1–E5 in the contract.
Hard stop conditions / safety constraints:
- Section C (journal drift): never run db:generate/db:push blind. Check live-DB column truth first; if no DATABASE_URL access, STOP C/D and defer migration to manual deploy gate.
- HIGH-RISK class (schema/migration + deploy/runtime + auth-adjacent): produce the manual-first risk-evidence pack before marking DB work VERIFIED.
- Do NOT set adapter runtime to 'edge' (breaks postgres-js + $env/dynamic/private).
- Set REMINDERS_ENDPOINT_SECRET in target env before/with deploy (endpoint now fails closed).
Next phase: EXECUTE: process/general-plans/active/vercel-deploy-migration_03-07-26/vercel-deploy-migration_PLAN_03-07-26.md (single sequential vc-execute-agent, opus)
Validate contract: inline in plan (## Validate Contract, Gate: PASS)
Execute start: bun run check + bun run test:unit:ci + bun run build (fully-auto) | reminders 401 vitest | Section C dry-diff gate (Hybrid, needs DB) | deploy welcome-email (manual probe) | high-risk pack: yes
```
