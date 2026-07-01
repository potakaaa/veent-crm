---
phase: ufg-inline-edit-review-removal
date: 2026-07-01
status: COMPLETE_WITH_GAPS
feature: leads
plan: process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_PLAN_01-07-26.md
---

# EXECUTE Report — Inline Edit (Up for Grabs) + Review Queue / needs_review Removal

## What Was Done

All Implementation Checklist items applied (Sections A–E), including VALIDATE-added items 6b and 19b.

- **Section A (permission + inline edit):** widened `canEditLead()` with explicit `lead.ownerId === null` branch; added `editTarget`/`editSaving` state + `saveEdit()` + `LeadEditModal` render + a per-row edit affordance to `src/routes/unassigned/+page.svelte`. Made `LeadEditModal.onresolve` optional, guarded the call (`onresolve?.(...)`), and wrapped the "Resolve" button in `{#if onresolve}` (item 6b).
- **Section B (route/nav removal):** deleted `src/routes/review/{+page.server.ts,+page.svelte}` (and the now-empty dir); removed `/review` nav item + `review` count from `AppSidebar`, `reviewCount` + review icon button from `AppTopbar`, `review` from `AppShell` counts type + prop pass, the `isReview` branch from `RouteShells`, and `listReviewLeads()` + its exclusive sort helpers (`REVIEW_SORT_COLS`/`ReviewSortCol`/`REVIEW_COL_MAP`) + the `review` nav count from `getNavCounts()`.
- **Section C (needs_review data/type removal):** dropped the schema column; removed the field from `dbRowToLead`, the create insert shape, the `Lead` type + `LeadFilters` type, the ingest insert payload + comment, `mapCategory` return shape, all `scripts/import.ts` needs-review logic + report field, all mock fixtures (`mock.ts`, `mock-data.ts`, `mock-crm-client.ts` filter+value), the lead-detail flagged/clear display block, `scripts/seed.ts` fixtures + notes, and the `scripts/verify-routes.ts` review-badge check. Removed the orphaned ingest `review` counter + response field (item 19b).
- **Section D (migration):** generated `drizzle/0009_mushy_vapor.sql` — reviewed, it is exactly `ALTER TABLE "crm_leads" DROP COLUMN "needs_review";` with no bundled drift.
- **Section E (tests):** updated `import.spec.ts`, `leads.spec.ts`, `leads-db.spec.ts`, `reminders.spec.ts`; added 5 `canEditLead` unit cases (item 31); added `e2e/ufg-inline-edit.e2e.ts` and `e2e/leads-discard.e2e.ts` (items 32–33).

## What Was Skipped or Deferred

- **`bun run db:push` (item 26)** — NOT applied. Irreversible DROP COLUMN; per the plan hard-stop and the EXECUTE handoff instruction, the migration is generated + reviewed but the apply is held for a confirmed dev-Postgres target. This is the manual half of the AC8 Hybrid gate.
- **Full `bun run test:e2e` run** — not executed here (requires `build && preview` webserver + browser download + a seeded dev DB). Specs are written, discovered by Playwright (confirmed via `--list`), and self-skip on empty data. Deferred to the EVL confirmation run / seeded environment.
- **Cross-feature supersession** of `reports-echarts-review-queue_29-06-26` — explicitly deferred to UPDATE PROCESS per the plan.

## Test Gate Outcomes

- `bun run check` — PASS (0 errors; 1 pre-existing unrelated warning in `leads/[id]/edit/+page.svelte`).
- `bun run test:unit` — PASS (188 passed, 54 skipped = DB-integration SKIP_DB).
- AC8 grep gate `grep -rn "needs_review\|needsReview" src/ scripts/` — no matches (PASS).
- Item-19b gate `grep -n "review" src/routes/api/leads/ingest/+server.ts` — no matches (PASS).
- AC6 grep gate `grep -rn "/review\|reviewCount\|isReview" src/lib/components/layout/ src/lib/components/shared/skeletons/` — no matches (PASS). Manual visual confirm of AppSidebar/AppTopbar layout after icon removal: PENDING (Hybrid — no dev server run here).
- AC8 migration SQL diff — reviewed, clean single-column drop (PASS). Apply: PENDING.
- `bun run test:e2e` — PENDING (see deferred).

## Plan Deviations (all within-blast-radius, none hard-stop class)

1. **`src/routes/+layout.ts`** — removed `review` from the `counts` type + both default objects. Plan missed this consumer of `getNavCounts`; mechanically required for `bun run check` once AppShell/AppSidebar narrowed. Within the nav-counts review-removal blast radius.
2. **`src/lib/components/shared/Icon.svelte`** — added an `edit` (pencil) icon path. Required for the item-4 edit affordance since no edit icon existed and `IconName` is a strict union (would fail `check`). Within Section A inline-edit UI.
3. **`src/lib/utils/sources.ts`** — updated a stale doc comment that referenced the deleted `review/` dir. Cosmetic accuracy fix.
4. **`src/lib/server/db/leads.ts`** — removed `REVIEW_SORT_COLS`/`ReviewSortCol`/`REVIEW_COL_MAP` alongside `listReviewLeads()`. They are used exclusively by that function; the plan said "remove listReviewLeads entirely", so removing its private helpers is the faithful reading.

No CONTEXT_PARTIAL items. No auth/billing/API-contract/container deviations.

## Test Infra Gaps Found

- No auth fixture for a rep session — AC3's "same e2e under a rep session" cannot be exercised (DEV_BYPASS injects a manager). AC3/AC4 are fully covered by the new `canEditLead` unit cases instead.
- No DB-integration harness (pre-existing repo gap) — migration apply stays a manual Hybrid gate.
- No component-snapshot infra — AC6 stays grep-gate + manual visual (pre-existing, documented in plan).

## Closeout Packet

- **Selected plan:** `process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_PLAN_01-07-26.md`
- **Finished:** all code checklist items; `check` + `test:unit` green; all 3 grep gates green; migration generated + reviewed.
- **Verified vs unverified:** verified — type check, unit suite, grep gates, migration SQL shape, Playwright discovery. Unverified — migration apply (`db:push`), full e2e run, AC6 manual visual confirm.
- **Cleanup remaining:** apply migration against dev DB; run `bun run test:e2e` in a seeded env; manual AC6 visual confirm; mark `reports-echarts-review-queue` superseded (UPDATE PROCESS).
- **Best next state:** Keep plan in active/testing — code-complete, but VERIFIED status needs the migration-apply + e2e + AC6 visual confirmations.

## Forward Preview

### Test Infra Found
Playwright `e2e/*.e2e.ts` convention confirmed working (specs discovered via `--list`). Two new e2e specs added; still no rep-session auth fixture and no DB-integration harness.

### Blast Radius Changes
~28 files touched across `src/` + `scripts/` + `drizzle/` (26 planned + `+layout.ts` and `Icon.svelte` deviations). Single SvelteKit app — no cross-package impact. `crm_leads.needs_review` column removal is the only irreversible change (pending apply).

### Commands to Stay Green
`bun run check` · `bun run test:unit` · the 3 grep gates above · (post-seed) `bun run test:e2e`.

### Dependency Changes
None. No new packages. `reports-echarts-review-queue_29-06-26` is now obsolete (its `/review` + `needs_review` targets are gone) — flag for supersession in UPDATE PROCESS.
