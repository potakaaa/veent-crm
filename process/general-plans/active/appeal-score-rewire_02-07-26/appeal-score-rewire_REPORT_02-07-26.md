---
phase: appeal-score-rewire
date: 2026-07-02
status: COMPLETE_WITH_GAPS
feature: leads
plan: process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md
---

# EXECUTE Report — Lead Appeal Score rewire onto origin/development

## TL;DR

All 17 checklist steps applied; E1–E4 honored. Fully-Automated gates GREEN: `bun run check`
(0 errors), `bun run test:unit -- --run` (269 passed / 72 skipped / 0 failed), `grep -r
sortByAppealScore src/` empty, `git diff origin/development -- drizzle/` empty. Two documented
gaps: (1) the Hybrid SQL/TS parity test is skipped (no `DATABASE_URL` in this env) — `CODE DONE`,
not `VERIFIED`; (2) `bun run db:generate` no-diff can't be shown green due to **pre-existing dev
drift** (dev ships migration `0014_agreements_fields.sql` with no matching `meta/0014_snapshot.json`)
— its AC5/AC6 property is proven instead by the empty `drizzle/` diff + byte-identical `schema.ts`.

## What Was Done

- **Step 1 — schema revert:** `src/lib/server/db/schema.ts` made byte-identical to dev (our
  `announcedAt`/`firstReachedOutAt` cols gone; dev's `firstAnnouncedDate`/`firstReachedOutDate` kept).
- **Step 2 / E1 — migration reconciliation:** removed our `drizzle/0001_rainy_patriot.sql`;
  materialized dev's full `0000`–`0014` chain + `meta/*`. `git diff origin/development -- drizzle/`
  is EMPTY (byte-identical). No new migration from us.
- **Step 3:** deleted `src/lib/components/SortToggle.svelte`.
- **Step 4:** deleted `src/routes/review/+page.server.ts` + `+page.svelte` (route gone on dev).
- **Step 5:** `src/lib/server/mock.ts` reverted to dev (byte-identical).
- **Step 6 — badge re-skin:** `AppealScoreBadge.svelte` now uses dev semantic tokens via the
  `AgeBadge` inline-hex pattern (high→fresh #059669, mid→stale #d97706, low→overdue #dc2626,
  none→ink-300 #9b95a0); `null → "Not enough data"` preserved.
- **Step 7:** deleted `sortByAppealScore` from `appeal-score.ts` (0 callers remain); added a pure
  `today()` UTC-date-floor helper for E3.
- **Step 8 — SQL sort:** `leads.ts` gained a module-level `appealScoreExpr` SQL fragment mirroring
  `computeAppealScore` exactly (GREATEST/LEAST=clamp, single ROUND, integer date-subtraction,
  CURRENT_DATE for null reach-out), `'appeal'` added to both `LEADS_SORT_COLS`/`UNASSIGNED_SORT_COLS`,
  and an `'appeal'` `DESC/ASC NULLS LAST, id ASC` branch in both order builders.
- **Steps 9/10/14 — loaders (E2):** `/leads`, `/unassigned`, `/pipeline` loaders attach a derived
  `appealScore` per row with `now` floored to date via `today()`. Pipeline uses dev's real
  `listPipelineStage` base, badge-only, NO sort UI. All three former `sortByAppealScore` callers
  are gone (dev versions never called it), so step-7 deletion is compile-safe.
- **Steps 11/12/13/14 — views:** Appeal column added to `LeadGrid.svelte` (8-track grid, sortable
  header round-trips `?sort=appeal`) and `/unassigned` grid; badge on lead detail header cluster;
  badge on pipeline cards. `Lead.appealScore?: number | null` added to `$lib/types`.
- **Step 15 — parity test (E3):** `src/tests/leads-filters.spec.ts` gained a `skipIf(SKIP_DB)`
  describe asserting `listLeadsFiltered({sort:'appeal'})` and `listUnassignedLeads(...,'appeal')`
  order == `computeAppealScore()` ranking (nulls last), with `now` pinned to Postgres `CURRENT_DATE`.
- **Step 16 — backlog note:** `process/features/leads/backlog/pipeline-appeal-sort_NOTE_02-07-26.md`.

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `bun run check` | Fully-Automated | PASS (0 errors, 2 pre-existing dev warnings, exit 0) |
| `bun run test:unit -- --run` | Fully-Automated | PASS (269 passed / 72 skipped / 0 failed) |
| `grep -r "sortByAppealScore" src/` | Fully-Automated | PASS (empty) |
| `git diff origin/development -- drizzle/` | Fully-Automated | PASS (empty — byte-identical) |
| `bun run db:generate` no-diff | Fully-Automated | NOT GREEN — pre-existing dev drift (see gaps); subsumed |
| DB parity test (AC1/AC2) | Hybrid | SKIPPED (no `DATABASE_URL`) — CODE DONE, not VERIFIED |
| Badge render (AC3/AC4) | Agent-Probe | Not run (no live browser); backlog E2E note exists |

## Plan Deviations

1. **Full dev tree materialized in the worktree (beyond touchpoints).** To make `bun run check` /
   `test:unit` actually runnable, dev's entire `src/`, `scripts/`, `drizzle/` and build config
   (`package.json`, `bun.lock`, `tsconfig`, `vite.config`, `components.json`, `eslint`) were
   materialized file-by-file via `git show origin/development:<path>` (the mandated approach — the
   blanket `git restore` was correctly denied), and `bun install` was run. This is the merge-resolution
   content the orchestrator will commit; the harness/process dirs (`.claude/`, `process/`, `docs/`,
   `.github/`) were intentionally left for the orchestrator's merge. Within blast radius (all changes
   are the appeal feature + adopting dev's authoritative versions).
2. **Mid-execution regression, self-corrected.** A bash loop intended to overwrite only *non-edited*
   dev files clobbered all 10 dev-tracked touchpoint edits (exclusion logic failed). Detected via a
   post-edit wiring grep, and all 10 edits were re-applied and re-verified green. Two latent type
   errors surfaced on re-apply (createLead has no `eventDate` param → set via `db.update`;
   `AppealScoreBadge` prop widened to `number | null | undefined`) and were fixed.
3. **`today()` helper added to `appeal-score.ts`** (not named in the plan) to satisfy E3's
   "floor `now` to date in production loaders" — keeps the pure module DRY across 4 call sites.

## Test Infra Gaps Found

- **No `DATABASE_URL` in this environment** → the Hybrid parity gate (AC1/AC2) and `db:generate`
  cannot execute. Classification: `harness-drift` (missing local Postgres), matching `all-tests.md`
  "Integration tests (real DB) are not set up." The parity test is written, type-checks, and skips
  cleanly; it will run when a real Postgres is provided.
- **Pre-existing dev migration-snapshot drift:** `origin/development` tracks `0014_agreements_fields.sql`
  with NO `meta/0014_snapshot.json`, so `bun run db:generate` regenerates a spurious `0014_fresh_zarek`
  diff on dev itself. Classification: `stale-command-drift` in the dev baseline, NOT introduced here.
  The spurious generated files were discarded to keep `drizzle/` byte-identical to dev. Backlog
  candidate: dev should commit the missing `meta/0014_snapshot.json`.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md`
- **Finished:** all 17 steps; 4/5 Fully-Automated gates green; feature fully wired onto dev's tree.
- **Verified vs unverified:** compile + unit + dead-code + migration-reconciliation VERIFIED. SQL/TS
  runtime sort parity (Hybrid) and badge render (Agent-Probe) UNVERIFIED (no DB / no browser here).
- **Cleanup remaining:** orchestrator to run the actual `git merge origin/development` using this
  worktree's resolved files; run the Hybrid parity test once a Postgres `DATABASE_URL` is available.
- **Closeout classification:** `Keep in active/testing` — code-complete (`CODE DONE`), but the
  Hybrid parity gate stays pending a live Postgres before `VERIFIED`.
- **Follow-up stubs created:** `process/features/leads/backlog/pipeline-appeal-sort_NOTE_02-07-26.md`.
- **CONTEXT_PARTIAL:** none.

## Forward Preview

- **Test Infra Found:** DB parity + `db:generate` need `DATABASE_URL`; dev is missing `meta/0014_snapshot.json`.
- **Blast Radius Changes:** appeal feature spans `src/lib/appeal-score.ts`, `AppealScoreBadge.svelte`,
  `leads.ts`, `types/index.ts`, leads/unassigned/pipeline loaders + views, lead detail, `PipelineBoard.svelte`,
  `leads-filters.spec.ts`. `drizzle/`, `schema.ts`, `mock.ts` byte-identical to dev.
- **Commands to Stay Green:** `bun run check` && `bun run test:unit -- --run` && `grep -r
  sortByAppealScore src/` (empty) && `git diff origin/development -- drizzle/` (empty).
- **Dependency Changes:** adopted dev's `package.json`/`bun.lock` (ran `bun install`); no new deps
  introduced by the appeal feature itself.
