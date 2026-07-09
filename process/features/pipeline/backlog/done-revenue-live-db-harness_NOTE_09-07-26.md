---
name: plan:done-revenue-live-db-harness-note
description: Backlog note — GitHub #273 AC3/AC5/AC6 Hybrid DB tests self-skip without a live Postgres CI harness
date: 09-07-26
feature: pipeline
---

# NOTE — Live-DB CI harness needed for Done-stage revenue tests (GitHub #273)

**Discovered during:** `done-stage-revenue-tagging_09-07-26` EXECUTE (GitHub #273).

## What self-skips

- `src/tests/pipeline-db.spec.ts` — `describe.skipIf(SKIP_DB)('moveLeadStage — done capture
  (GitHub #273)')`: DB persist of `revenue_cents`/`currency` on the done transition, the
  `revenue_cents` audit-trail history row, and the "won metadata untouched by done" guard.
- `src/tests/dashboard-db.spec.ts` — `describe.skipIf(SKIP_DB)('getRevenuePerAe — GitHub #273
  AC5/AC6')`: per-AE revenue sums (AC5), Won-with-revenue exclusion (AC6), and the E2
  current-stage-guard exclusion (AC6).

All self-skip via the existing `SKIP_DB = !process.env.DATABASE_URL` convention — same
pre-accepted structural known-gap class as `manager-dashboard`/`calendar`
(no live Postgres available in this development environment).

## Recommended next step

Same fix as previously flagged for manager-dashboard/calendar: stand up a live-Postgres CI
harness (`docker compose up -d db && bun run db:push && bun run db:seed`) so these
`describe.skipIf(SKIP_DB)` blocks actually run in CI, rather than perpetually skipping. Until
then, these three ACs (AC3, AC5, AC6) remain code-complete but formally unverified.
