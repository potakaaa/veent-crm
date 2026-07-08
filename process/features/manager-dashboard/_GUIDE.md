# manager-dashboard

<!-- Part of veent-crm -->

## Scope

Manager-only per-AE (Account Executive) performance dashboard (GitHub issue #244 / DASH-1).
Gives managers/super-managers a single `/dashboard` page showing one row/card per active rep with:
leads owned, pipeline-stage distribution, won count (all-time + selected range), follow-up
adherence %, and leads-added count (selected range). A 3-bucket range filter (this week / this
month / all time) re-scopes range-bound metrics. Each row drills through to `/leads` pre-filtered
to that AE. Reps are hard-blocked (403). Absorbs the intent of issue #232 ("leads added per rep")
as one column of this richer view rather than a separate `/reports` addition.

## Key Source Files

- `src/lib/server/db/dashboard.ts` — all 6 aggregation queries + `getDashboardData(range)` composed entrypoint + pure `rangeToStartDate()` helper
- `src/routes/dashboard/+page.server.ts` — `isManagerRole()` + `error(403, 'Manager only')` gate (mirrors `/team`), range param parsing, streamed load
- `src/routes/dashboard/+page.svelte` — per-AE cards/rows, `RangeBucketControl`, drill-through links
- `src/lib/components/ui/range-bucket-control/` — new shared 3-bucket range filter (`RangeBucketControl.svelte`, `range-bucket-control.ts` pure helpers, `index.ts` barrel) — structurally mirrors `week-range-control/` but is a separate component, not a modification of it
- `src/lib/components/layout/AppSidebar.svelte` — manager-only nav entry added (`{ href: '/dashboard', label: 'Dashboard', icon: 'reports' }` in the `manager: NavItem[]` array; reuses the existing `reports` icon glyph)
- `src/tests/dashboard-gate.spec.ts` — Fully-Automated Vitest: 403 for `role='rep'`, pass-through for `manager`/`super_manager`
- `src/tests/dashboard-db.spec.ts` — Hybrid `describe.skipIf(!DATABASE_URL)` test: per-AE aggregation correctness, range-switching, soft-delete exclusion
- `e2e/dashboard-drillthrough.e2e.ts` — Agent-Probe click-through spec (self-skipping — known-gap, no shared Playwright auth fixture yet)

## Drill-through Contract

`/dashboard` row links to `/leads?segment=all&owner=<repId>` (NOT `?rep=<id>` — corrected during
PLAN after confirming `src/lib/server/db/leads.ts`'s actual `segment`/`owner` param contract;
`segment=all` is required to bypass the `'mine'` default filter before `owner` takes effect).

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — drill-through target; `owner`/`segment` param contract
- `process/features/reports/_GUIDE.md` — sibling manager-facing analytics surface (`/reports` is unchanged by this feature; its per-rep leaderboard was read for pattern reference only, never imported)
- `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — repo-wide missing shared Playwright authenticated-session fixture (blocks AC5 here, same as calendar/reminders/ux-enhancement)

## Current Status

Status: **in-progress** (code-complete, EVL-confirmed for everything runnable in this session's
environment; core Hybrid DB aggregation gate still needs a live-Postgres run before full sign-off).

EVL-confirmed green (07-07-26):
- `bun run test:unit -- src/tests/dashboard-gate.spec.ts` — PASS 5/5 (AC1, AC2-gate)
- `bun run check` — PASS, 0 errors (AC7 typecheck half)
- Scoped lint/prettier on this feature's 9 touched files — 0 issues (AC7 lint half, scoped)

Pending / known gaps:
- **AC2-data / AC3 / AC4 / AC6** (`dashboard-db.spec.ts`, Hybrid) — self-skips cleanly in this
  environment (`describe.skipIf(!DATABASE_URL)`, no live Postgres reachable). Needs a live-DB run
  (e.g. via `docker-compose` + `bun run db:push`) to confirm the aggregation numbers are actually
  correct — this is the repo's pre-existing "Live-DB CI harness" gap (tracked in `all-context.md`
  Remaining v1 work), not new to this feature.
- **AC5** (Playwright click-through e2e) — pre-existing repo-wide known-gap, no shared authenticated
  Playwright fixture yet. Spec written, self-skips, matches the convention already used by
  calendar/reminders/ux-enhancement. See
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- **EXPLAIN ANALYZE perf check** on the adherence window-function query (non-blocking, INNOVATE
  flag) — needs a live seeded DB; deferred alongside the Hybrid gate above.
- **Repo-wide pre-existing prettier drift** in 7 unmodified files (unrelated to this feature) —
  see `process/general-plans/backlog/lint-drift-pre-existing-files_07-07-26_NOTE.md`.

## Key Patterns (from manager-dashboard implementation)

- **`getWonInRangePerAe` uses Drizzle's native `.selectDistinctOn()`** (`.selectDistinctOn([crmLeadHistory.leadId], {...}).orderBy(leadId, desc(at))`) to get each lead's most-recent stage→`'won'` transition — same idiom already used in `leads.ts` for "current follow-up per lead". Prefer this over a raw `sql` DISTINCT ON template when Drizzle's builder already supports the shape.
- **`getFollowUpAdherencePerAe` is the one place raw `sql` is genuinely needed** — a `LEAD() OVER (PARTITION BY lead_id ORDER BY occurred_at)` window function has no first-class Drizzle builder support. WHERE is applied *before* window functions in SQL — filter `follow_up_at IS NOT NULL` and the range boundary in a later CTE (`classified`), not in the same CTE that computes `LEAD()`, or you'll silently break on-time/late classification (this was a real bug caught during EXECUTE — see the plan's Plan Deviations §1). Always pass dynamic values via the tagged-template's own interpolation (`sql\`... ${dateVar} ...\``), never string-concatenation.
- **`getActiveAeList()` filters `role='rep' AND active=true`** — dashboard rows are per-AE (rep-role users), not managers. Managers/super-managers view the dashboard but never appear as a row on it.
- **Import the pure helper module directly, not the barrel**, when only server-side/test code needs it: `.../range-bucket-control/range-bucket-control` (not `index.ts`) avoids pulling the `.svelte` component into the server/node test bundle.
- **`NavItem.icon` must be a key of `Icon.svelte`'s `ICONS` const** — reuse an existing glyph (`reports`, here) rather than adding a new SVG path when one isn't in scope.

## Folder Contents

```
process/features/manager-dashboard/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans (none yet)
  backlog/      -- deferred/future plans (none yet)
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
