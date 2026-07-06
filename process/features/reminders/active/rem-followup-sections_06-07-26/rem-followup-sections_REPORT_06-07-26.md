---
phase: rem-followup-sections
date: 2026-07-06
status: COMPLETE_WITH_GAPS
feature: reminders
plan: process/features/reminders/active/rem-followup-sections_06-07-26/rem-followup-sections_PLAN_06-07-26.md
---

# EXECUTE Report — REM-1 / REM-2 Follow-Up Sections (GitHub #204, #205)

## What Was Done

Implemented the plan in strict dependency order (DB → route → UI). All changes additive.

- **Step 0 — grep confirmations:** re-ran at EXECUTE start. `getAllFollowUpsQueue` had no name
  collision; `LeadListRow` consumers confirmed as root `src/routes/+page.svelte` + `src/routes/reminders/+page.svelte`
  ONLY (matches VALIDATE's corrected Blast Radius); no existing "list active reps" query.
- **Step 1 — DB layer (`src/lib/server/db/leads.ts`):**
  - `enrichWithOwnerNames(leads)` — single batched `crmUsers` lookup over distinct non-null owner
    ids; `"Unassigned"` for null owner; returns new objects, does not mutate inputs.
  - `getAllFollowUpsQueue(userId, role, opts?)` — base scope is `visibilityCondition(userId, role)`
    **ALONE** (NOT ANDed with `eq(ownerId, userId)`); `filterRepId` narrows additively and only for
    `role !== 'rep'`. DISTINCT-ON-per-lead latest follow-up, filtered to any booked follow-up (no
    window cap), sorted ascending by `followUpAt` with `id` tiebreak.
  - `listActiveReps()` — `crmUsers WHERE role='rep' AND active=true`, ordered by name.
  - `getTodayQueue`, `getRemindersQueue`, `computeAge`, `Urgency` left byte-for-byte unchanged
    (verified — all new symbols appended after the existing functions).
- **Step 2 — Route (`src/routes/reminders/+page.server.ts`):** `Promise.all` over
  `getRemindersQueue` + `getAllFollowUpsQueue` + `listActiveReps` (reps get an empty rep list).
  Single batched owner-name enrichment over the union of all leads, re-mapped by id back onto each
  array (one `crmUsers` query, not five). `filterRepId` read from `?repId=` search param and only
  passed through for manager/super_manager. Widened page data:
  `{ overdue, due, upcoming, cold, allFollowUps, activeReps, filterRepId, isManager }`.
- **Step 3 — UI:**
  - `LeadListRow.svelte` — added one opt-in `showFollowUpMeta` boolean prop (default `false`). When
    on, renders a due-date + owner-name line (mobile + desktop) and an "Overdue" flag derived from
    `lead.urgency === 'overdue'` using `riskMeta` color. Off by default → Today page unchanged.
  - `reminders/+page.svelte` — wrapped the view in the shared `Tabs.svelte` (`variant="underline"`):
    "Sections" panel = the existing bucketed render (unchanged aside from `showFollowUpMeta`), "All
    Follow-Ups" panel = flat `allFollowUps` list. Manager-only rep-filter `<select>` drives a
    `?repId=` navigation (server reload). Snooze/nudge parity added for the new tab (`'all'` bucket
    in the optimistic snooze handler).
- **Step 4 — overdue flag:** reused `riskMeta` styling in `LeadListRow`; no new component.
- **Tests (`src/tests/reminders-db.spec.ts`):** added 5 new Hybrid DB describe blocks —
  `enrichWithOwnerNames` (name map + null→Unassigned), `getAllFollowUpsQueue` +10d uncapped
  membership (AC4), ascending sort (AC5), rep scoping incl. filterRepId-ignored + only_me hidden
  (AC6), and the hardened manager multi-owner assertion (`owners.size >= 2` when `filterRepId`
  omitted) plus filter-narrowing (AC7).

## What Was Skipped or Deferred

- Agent-Probe render/interaction scenarios (AC1, AC2 render, AC3 visual, AC6 dropdown-absent, AC7 UI,
  AC8, AC9) — not automatable here (no shared Playwright auth fixture). Pre-accepted Known-Gap per
  the plan. Manual-verification-pending.

## Test Gate Outcomes

| Gate | Result | Notes |
|---|---|---|
| `bun run check` | PASS (0 errors) | 1 warning is pre-existing in `leads/[id]/+page.svelte`, not my code |
| `bun run lint` (my files) | PASS | All 6 touched files pass `prettier --check`; eslint clean |
| `bun run lint` (whole repo) | RED — PRE-EXISTING | `index.ts`, root `+page.svelte`, `unassigned/*`, `package.json` fail prettier; these are UNMODIFIED from committed HEAD (`git diff --name-only HEAD` returns nothing) → drift already on `development`, not introduced by this work |
| `bun run test:unit:ci` | PASS (340 passed, 114 skipped) | New Hybrid DB specs self-skip via `SKIP_DB` (no `DATABASE_URL` in this env) — pre-accepted Known-Gap pattern |
| Hybrid DB specs (live Postgres) | NOT RUN | No `DATABASE_URL` available here; specs compile (proven by `check` pass) and self-skip. Must run under live Postgres to close AC4-AC7 at the query layer |

## Plan Deviations (all within blast radius, none hard-stop)

1. **`LeadListRow` prop shape** — used a single `showFollowUpMeta: boolean` gate prop instead of the
   plan's literally-listed `followUpAt?` / `ownerName?` / `overdue?` props. Rationale: `ownerName` is
   now a `Lead` field (added this cycle), `followUpAt` already exists on `Lead`, and `overdue` is
   derivable from `lead.urgency` — three separate props would duplicate lead fields (DRY). The gate
   prop defaults `false`, keeping the Today page byte-for-byte unchanged (hard constraint #5). The
   plan explicitly permitted this: Public Contracts said "(or similar)" and the Design Decision said
   to "confirm in EXECUTE whether existing risk derivation already covers the combined list's overdue
   case, since urgency is present on every Lead." Same component, same semantic operation.
2. **Page-data shape** — added `filterRepId` and `isManager` alongside the plan's named `allFollowUps`
   / `activeReps` keys (needed by the UI for the dropdown state + manager gating). Additive, only
   consumer is `+page.svelte`.

## Test Infra Gaps Found

- **Pre-existing repo-wide prettier drift** blocks the whole-repo `bun run lint` gate independent of
  this change (4 files unmodified from HEAD already fail `prettier --check`). Recommend a separate
  `bun run format` housekeeping commit on `development` — out of scope for this plan (touching those
  files would be an out-of-scope deviation).
- No live-DB harness in this environment → Hybrid DB specs (AC2, AC4-AC7 query-layer proof) remain
  self-skipped, consistent with the repo-wide known-gap.

## Closeout Packet

- **Selected plan:** `process/features/reminders/active/rem-followup-sections_06-07-26/rem-followup-sections_PLAN_06-07-26.md`
- **Finished:** all Checklist Steps 0-4; 5 new Hybrid DB specs written; `check` + `test:unit:ci` green;
  my touched files lint-clean.
- **Verified:** type-safety (AC10 check), regression suite (AC3), no modification to the 4 frozen
  symbols.
- **Still unverified:** Hybrid DB specs under live Postgres (AC2/AC4-AC7 query layer); all Agent-Probe
  render/interaction ACs (AC1, AC2, AC3 visual, AC6, AC7, AC8, AC9) — pending live DB + manual pass.
- **Best next state:** Keep in active/testing — code-complete, but Hybrid + Agent-Probe verification
  pending (live DB run + manual browser confirmation). Not yet Ready for UPDATE PROCESS archival.

## Forward Preview

### Test Infra Found
- Pre-existing prettier drift on `development` (4 files) — whole-repo lint gate red regardless of this
  change. Live-DB test harness still absent.

### Blast Radius Changes
- Matches VALIDATE's corrected radius: `db/leads.ts`, `reminders/+page.server.ts`,
  `reminders/+page.svelte`, `LeadListRow.svelte`, `types/index.ts`, `reminders-db.spec.ts`.
  `LeadListRow` change is opt-in (`showFollowUpMeta` default false) so the only other consumer (root
  Today page) is unaffected.

### Commands to Stay Green
- `bun run check` · `bun run test:unit:ci` · `bunx prettier --check <the 6 touched files>`
- Under live Postgres: `bun run test:unit:ci` (unskips the new Hybrid specs).

### Dependency Changes
- None. No new packages, no schema/migration, no new route.
