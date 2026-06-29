---
phase: dev-seed
date: 2026-06-29
status: COMPLETE
feature: leads
plan: process/general-plans/active/dev-seed_29-06-26/dev-seed_PLAN_29-06-26.md
---

# Dev Seed Script — EXECUTE Report

## What Was Done

All 14 checklist items applied:

1. `scripts/seed.ts` rewritten — prod safety guard (`NODE_ENV=production` + no `--force` → exit 1), `--reset`/`--force` flag parsing, standalone postgres-js client.
2. User seed preserved (10 users, `onConflictDoNothing`).
3. `U` USER_IDS constants (JOHN…ELAY).
4. Time helpers `daysAgo` / `hoursAgo` / `todayEndManila` (Asia/Manila 23:59).
5. 25 leads (prefix `00000001-`) — exact roster, enum values reconciled to live schema (`platform` = Facebook/Instagram/Twitter/X/TikTok/Other; `category` all 25 valid; `stage`/`source` valid). `lastActivityAt` set explicitly per lead. L013/L014/L015 carry `dealValueCents` + `currency:'PHP'`. L015 won fields + `signedAt`. L016 `lostReason:'no_response'`. L017–L019 `ownerId:null`. L020/L021 `needsReview:true`. **L022/L023 owner = ELAY (non-null)** per VALIDATE correction.
6. 17 activities (prefix `00000002-`), `onConflictDoUpdate` on `id` refreshing `followUpAt` + `occurredAt`.
7. 3 history rows (prefix `00000003-`), `onConflictDoNothing`.
8. `--reset` branch — deletes only seed IDs via `inArray`, FK order history→activities→leads.
9. Insert order + conflict strategy: users/leads/history `onConflictDoNothing`, activities `onConflictDoUpdate`; wrapped in `try…finally { client.end() }`.
10. Summary output with counts + route guide + login note.
11. `package.json` — `"db:seed": "bun scripts/seed.ts"` alias added.
12. `.jsrl/loop/docs/seed-dev-data.md` — new how-to doc.
13. `.jsrl/loop/LOG.md` — entry appended (file's strict grammar).
14. `.jsrl/loop/domains/crm-build/README.md` — timeline line appended.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `bun run check` (AC9, Fully-Automated) | PASS — 0 errors, 0 warnings (1984 files) |
| `bun run test:unit -- --run` | PASS — 72/72 (22 skipped = DB-integration tests needing live PG) |
| `bun scripts/seed.ts` (AC1, Hybrid) | PASS — exit 0, summary printed |
| `bun scripts/seed.ts` x2 (AC2 idempotency) | PASS — exit 0, no dup/unique-index violation |
| `bun scripts/seed.ts --reset` (AC7) | PASS — deletes seed IDs then re-seeds, exit 0 |
| `NODE_ENV=production bun scripts/seed.ts` (AC8) | PASS — exit 1, no DB writes |
| DB row-count verification (AC3/AC5/AC6) | PASS — leads 25, activities 17, history 3; unassigned 3, needs_review 2; all 6 stages present (new:11 contacted:7 replied:2 in_discussion:3 won:1 lost:1) |

Live dev Postgres at default `DATABASE_URL` was reachable, so all Hybrid gates ran and passed (not deferred).

## Plan Deviations

1. **Pipeline summary count string corrected** — orchestrator-supplied summary text said `new(4), contacted(5)`; actual seeded data is `new(11), contacted(7)`. Fixed the hardcoded display string in `scripts/seed.ts` and the doc to match real data. Within-blast-radius display-accuracy fix; the lead roster data itself is exactly per plan.
2. **Activity `onConflictDoUpdate` set** = `{ followUpAt, occurredAt }` per orchestrator correction #4 (plan step 9 also mentioned `outcome`; followed the explicit orchestrator handoff). Re-seed still refreshes relative timestamps correctly.
3. **LOG.md / crm-build README appends** used each file's existing strict entry grammar instead of the literal one-line prompt text, to keep the files format-valid. Content is equivalent.

## What Was Skipped or Deferred

- AC4/AC5/AC6 Agent-Probe surface checks (magic-link login → visual Today buckets / Pipeline columns / sidebar badges) require a logged-in browser session — NOT auto-confirmable. Row-level DB data backing them is verified (above). Status stays `CODE DONE`, not `✅ VERIFIED`, until a user confirms via login.

## Test Infra Gaps Found

- No fully-automated compile gate covers `scripts/` — `.svelte-kit/tsconfig.json` include omits `scripts/`. Enum/column correctness is proven at DB-run time, not compile time. To close: add `tsconfig.scripts.json` + a `check:scripts` (`tsc --noEmit`) npm script (backlog).
- No DB integration test for the seed (would need an ephemeral Postgres harness).

## Closeout Packet

- Selected plan: `process/general-plans/active/dev-seed_29-06-26/dev-seed_PLAN_29-06-26.md`
- Finished: all 14 checklist items; AC1/AC2/AC3/AC5/AC6/AC7/AC8/AC9 verified green against live dev PG.
- Unverified: AC4–AC6 visual surface rendering (needs magic-link login).
- Remaining cleanup: UPDATE PROCESS archival + the optional `check:scripts` infra follow-up (backlog).
- Best next state: **Keep in active/testing** until user confirms surface rendering, then `Ready for UPDATE PROCESS archival`.

## Forward Preview

- **Test Infra Found:** scripts/ outside svelte-check; ephemeral-PG seed-test harness absent.
- **Blast Radius Changes:** `scripts/seed.ts` (rewritten), `package.json` (alias), 3 `.jsrl/loop` docs. No app code, schema, or API surface touched.
- **Commands to Stay Green:** `bun run check`; `bun run test:unit -- --run`; `bun run db:seed` (needs PG).
- **Dependency Changes:** none — `drizzle-orm` + `postgres` already present.
