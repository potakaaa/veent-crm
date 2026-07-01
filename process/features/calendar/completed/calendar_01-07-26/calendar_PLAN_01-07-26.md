---
name: plan:calendar
description: "Calendar page consolidating team meetings + AE-scoped follow-ups, month/week views, meeting detail route"
date: 01-07-26
feature: calendar
---

# Calendar — PLAN

**Date**: 01-07-26
**Status**: ✅ EXECUTE complete, EVL green — archived 01-07-26 (2 pre-accepted known-gaps: e2e self-skip pending shared auth fixture; AC2/AC3 DB-backed Hybrid halves pending live-DB CI harness). See `calendar_REPORT_01-07-26.md` for the full EVL confirmation.
**Complexity**: COMPLEX (5 phases, ~6 touchpoints, one hard external precondition — Meetings PR merge — plus a new route surface and a new DB query with an owner-scoping regression risk called out by INNOVATE). Calibrated against `process/context/planning/all-planning.md`.

Locked SPEC: `process/features/calendar/active/calendar_01-07-26/calendar_SPEC_01-07-26.md`
INNOVATE Decision Summary: embedded in the orchestrator handoff (see git history / session log for this task folder) — chosen approaches locked below, not re-litigated here.

## Overview

Add a single `/calendar` page (month + week grid views) that shows: (a) every team meeting (team-shared, no owner scoping) and (b) the signed-in rep's own follow-up reminders (owner-scoped). Clicking a follow-up goes to `/leads/[id]`; clicking a meeting goes to a new `/meetings/[id]` detail route. No new dependency — custom Svelte 5 grid components.

## Goals

- One nav-reachable Calendar page rendering both entry types with correct visibility scoping (AC1–AC3).
- Visually distinct entry types (AC4).
- Correct click-through targets for each entry type (AC5, AC6).
- Month/week toggle that preserves date context (AC7, AC8).
- Empty-range renders cleanly with no error (AC9).

## Scope

In scope: `/calendar` route (server load + Svelte grid UI), `getFollowUpsInRange` query, `/meetings/[id]` detail route, nav entry, click-through wiring. Out of scope: everything listed in the SPEC's "Out Of Scope" section (drag-reschedule, ICS export, day view, manual event creation, meeting duration rendering, calendar library choice already made).

## Preconditions (hard — read before starting EXECUTE)

- **BLOCKING:** The Meetings feature (`crm_meetings` / `crm_meeting_attendees` schema, `src/lib/server/db/meetings.ts` — `listAllMeetings()`, `getMeetingDetail()`, `dbRowToMeeting()`, the `Meeting`/`MeetingAttendee` types in `$lib/types`, the `/meetings` route, `MeetingFormModal.svelte`) exists ONLY on `origin/feat/meetings-and-reminders` (open PR #112). None of this exists on `development` today (confirmed via `git show origin/feat/meetings-and-reminders:src/lib/server/db/meetings.ts` — file returns nothing on `development`).
- Phases 3–5 below (anything touching meetings data or the `/meetings/[id]` route) CANNOT start EXECUTE until PR #112 merges into `development`, or this plan is explicitly rebased onto that branch. Phase 1 and Phase 2 (follow-up query + grid components) have NO dependency on Meetings and can execute now, independent of merge status.
- Orchestrator decides sequencing at EXECUTE time (wait for merge vs. branch off `feat/meetings-and-reminders`); this plan documents the dependency, it does not resolve it.
- **VALIDATE-confirmed (01-07-26):** re-checked live at VALIDATE time — PR #112 is still OPEN (`gh pr view 112`: `state: OPEN`, `baseRefName: development`, `mergedAt: null`). `git show development:src/lib/server/db/meetings.ts` still fails ("does not exist"). No route collision risk: `src/routes/meetings/[id]/` does not exist on either `development` or the `feat/meetings-and-reminders` branch, so Phase 3 is free to create it once unblocked. Precondition stands as documented — this is a legitimate accepted external dependency, not a VALIDATE-blocking gap (Phase 1/2 execute now; Phase 3+ wait).

## Confirmed reference signatures (verified by reading `origin/feat/meetings-and-reminders`)

```ts
// src/lib/server/db/meetings.ts (on feat/meetings-and-reminders, NOT on development yet)
export async function listAllMeetings(): Promise<Meeting[]>          // no date-range param today — team-shared, no owner scoping, orderBy startAt desc
export async function getMeetingDetail(id: string): Promise<Meeting | null>
export function dbRowToMeeting(row, attendees, organizerName?, leadName?): Meeting
```

```
// getMeetingDetail confirmed at VALIDATE time: selects crm_meetings joined to crm_users (organizer)
// and crm_leads, filtered only by eq(crmMeetings.id, id) + isNull(crmMeetings.deletedAt) — NO
// organizerId/attendee scoping predicate. Confirms AC2 team-shared visibility is structurally
// correct on the Meetings branch as-is; no additional scoping work needed in this plan.
```

```ts
// Meeting shape (src/lib/types/index.ts on feat/meetings-and-reminders, confirmed at VALIDATE time):
export interface Meeting {
  id: string;
  leadId: string;
  leadName?: string;
  organizerId: string | null;
  organizerName?: string;
  startAt: string;       // ISO, point-in-time only, no end
  meetingUrl?: string;
  notes?: string;
  outcome?: string;
  attendees: MeetingAttendee[];
  createdAt: string;
}
```

```ts
// src/lib/server/db/leads.ts (on development today)
export async function getTodayQueue(userId: string): Promise<Lead[]>
// Confirmed at VALIDATE time — real two-step shape:
//   1) SELECT active leads WHERE ownerId=userId AND deletedAt IS NULL AND stage NOT IN ('won','lost')
//   2) Batch-fetch each returned lead's CURRENT follow-up via
//      selectDistinctOn([crmActivities.leadId], {leadId, followUpAt})
//      .where(inArray(leadId, batchIds) AND isNotNull(followUpAt))
//      .orderBy(crmActivities.leadId, desc(crmActivities.occurredAt))
// getFollowUpsInRange adapts this: keep the DISTINCT-ON "current follow-up per lead" step
// unchanged, then filter to leads whose current followUpAt falls within [rangeStart, rangeEnd]
// instead of "= today". `between()` is available from drizzle-orm (confirmed).
```

```
// src/lib/components/shared/Icon.svelte — ICONS map (module-level const)
// 'calendar' icon key already exists in Icon.svelte on `development` (used today by
// src/routes/leads/new + leads/[id]/edit inline date-picker triggers), and is ALSO the icon
// key the Meetings branch's AppSidebar.svelte assigns to the /meetings nav entry
// (`{ href: '/meetings', label: 'Meetings', icon: 'calendar' }` — confirmed via
// `git show origin/feat/meetings-and-reminders:...AppSidebar.svelte`). A NEW icon key is
// required for /calendar (do not reuse 'calendar') — confirmed collision risk is real.
```

```ts
// src/routes/leads/+page.svelte — confirmed URL-param navigate pattern to generalize:
import { goto } from '$app/navigation';
import { SvelteURLSearchParams } from 'svelte/reactivity';
function navigate(patch: Record<string, string | number | boolean | undefined>) {
  const params = new SvelteURLSearchParams(page.url.searchParams);
  // ...apply patch, delete undefined keys...
  goto(`?${params}`, { keepFocus: true });
}
```

## Touchpoints

| # | File | Change | Phase |
|---|---|---|---|
| 1 | `src/lib/server/db/leads.ts` | New function `getFollowUpsInRange(userId: string, rangeStart: Date, rangeEnd: Date): Promise<Lead[]>` | 1 |
| 2 | `src/lib/components/calendar/CalendarGrid.svelte` (new) | Single grid component parameterized by `view: 'month' \| 'week'`, renders entries as day/time markers | 2 |
| 3 | `src/lib/components/calendar/CalendarEntry.svelte` (new, optional — inline in grid if simpler) | Renders one entry chip with type-based visual distinction | 2 |
| 4 | `src/routes/meetings/[id]/+page.server.ts` (new) | Server load: call `getMeetingDetail(params.id)`, 404 if null/deleted | 3 |
| 5 | `src/routes/meetings/[id]/+page.svelte` (new) | Read-first detail view: organizer, lead link, attendees, notes, outcome, meeting URL, date/time; "Edit" action opens existing `MeetingFormModal.svelte` | 3 |
| 6 | `src/routes/calendar/+page.server.ts` (new) | Server load: parse `?view=month\|week&date=YYYY-MM-DD`, compute range, call `getFollowUpsInRange` + `listAllMeetings()` (filtered to range), return combined entries | 4 |
| 7 | `src/routes/calendar/+page.svelte` (new) | Renders `CalendarGrid`, view toggle, prev/next nav, click-through wiring | 4, 5 |
| 8 | `src/lib/components/layout/AppSidebar.svelte` | Add `{ href: '/calendar', label: 'Calendar', icon: '<new-icon-name>' }` to `work` array | 4 |
| 9 | `src/lib/components/shared/Icon.svelte` | Add new `ICONS` entry (e.g. `calendarDays`) distinct from existing `calendar` key used by `/meetings` | 4 |
| 10 | `src/lib/server/db/meetings.ts` (on the meetings branch/after merge) | OPTIONAL: add date-range param to `listAllMeetings(rangeStart?, rangeEnd?)` — see Open Decision below | 4 |

## Public Contracts

- New server function `getFollowUpsInRange(userId, rangeStart, rangeEnd): Promise<Lead[]>` in `src/lib/server/db/leads.ts` — additive, no existing signature changed. MUST preserve `eq(crmLeads.ownerId, userId)` scoping (flagged by vc-predict as the AC3 regression risk).
- New route `GET /meetings/[id]` — read-only detail page, no new API endpoint (uses existing server-load pattern, not a `+server.ts`).
- New route `GET /calendar?view=month|week&date=YYYY-MM-DD` — bookmarkable, no new API endpoint.
- `listAllMeetings()` signature: EXECUTE must decide whether to add an optional `(rangeStart?: Date, rangeEnd?: Date)` param (server-side filter, preferred per INNOVATE) or leave signature unchanged and filter the returned array in `+page.server.ts` after fetch. Either satisfies SPEC (no AC depends on the mechanism) — record the chosen approach in the phase report for touchpoint #10/#6.
- No schema changes, no new DB tables, no new API secrets.

## Blast Radius

- **Files touched:** ~10 (6 new files, 4 modified files). Risk class: none of the high-risk classes (auth/billing/schema-migration/public-API-contract/deploy/secrets) apply — this is a pure read-surface feature with one new low-risk query function and two new UI routes. VALIDATE independently confirmed this classification (Layer 1 security-surface dimension) — see Validate Contract below.
- **Packages:** single SvelteKit app (`src/`), no multi-package spread.
- **Regression surface to watch:** `getFollowUpsInRange` reuses the `getTodayQueue`/`getRemindersQueue` pattern in `leads.ts` but is a NEW function — it does not modify `getTodayQueue` itself, so today's-queue and reminders-queue behavior is untouched by construction. The one regression risk is a copy-paste error dropping the `ownerId` scoping predicate when adapting the pattern (explicitly flagged in INNOVATE) — verification evidence below covers this directly (AC3). **VALIDATE finding:** as originally scoped this regression guard's Fully-Automated unit-test half was not mechanically buildable without a live DB (see Validate Contract Execute-Agent Instruction E1) — resolved via contract instruction, not a plan rewrite.
- **External dependency risk:** Phases 3–5 blocked on PR #112 merge (see Preconditions). If merged mid-plan, `listAllMeetings()`/`getMeetingDetail()`/`Meeting` types become available on `development` and this plan proceeds unchanged.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `calendar-nav-link-visible-and-navigates` — e2e: sidebar has `/calendar` link, click navigates and page renders | Fully-Automated | AC1 |
| `calendar-meetings-team-shared-visibility` — unit test on the query composition (no `ownerId`/`organizerId` filter applied to meetings fetch) + Hybrid DB-backed check: seed 2 users' meetings, confirm both visible to either signed-in user | Hybrid | AC2 |
| `calendar-followups-owner-scoped-visibility` — unit test asserting `getFollowUpsInRange` query includes `eq(crmLeads.ownerId, userId)` predicate (regression guard against the flagged copy-paste risk) + Hybrid DB-backed check: seed follow-ups for 2 owners, confirm each signed-in user sees only their own | Hybrid | AC3 |
| `calendar-entry-visual-distinction` — e2e: render grid with 1 meeting + 1 follow-up entry, assert distinct CSS class/data-attribute/icon on each entry type via rendered markup | Fully-Automated | AC4 |
| `calendar-meeting-clickthrough-to-detail-view` — e2e: click meeting entry, assert URL is `/meetings/[id]` (not `/leads/[id]`), assert detail content renders | Fully-Automated | AC5 |
| `calendar-followup-clickthrough-to-lead` — e2e: click follow-up entry, assert URL is `/leads/[id]` | Fully-Automated | AC6 |
| `calendar-view-toggle-month-week` — e2e: toggle control switches grid between month/week layout | Fully-Automated | AC7 |
| `calendar-view-toggle-preserves-date-context` — e2e: navigate to a non-current month/week, toggle view, assert `date` URL param / visible date range stays in the same neighborhood (not reset to today) | Fully-Automated | AC8 |
| `calendar-empty-range-no-error` — e2e: navigate to a date range with zero meetings and zero follow-ups, assert grid renders with no error boundary / no 500 | Fully-Automated | AC9 |
| `meetings-detail-route-404-on-missing` — unit/e2e: `GET /meetings/[bad-id]` returns 404, not a crash | Fully-Automated | Supports AC5 robustness (not a numbered AC, defensive gate) |

**Failing stubs (TDD red-first, per `vc-test-coverage-plan` — for Fully-Automated rows):**

```
test("should include eq(crmLeads.ownerId, userId) predicate in getFollowUpsInRange query", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-followups-owner-scoped-visibility (unit half)")
})
test("should have no ownerId/organizerId filter in meetings fetch for calendar", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-meetings-team-shared-visibility (unit half)")
})
test("calendar nav link is visible and navigates to /calendar", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-nav-link-visible-and-navigates")
})
test("meeting and follow-up entries are visually distinct in rendered markup", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-entry-visual-distinction")
})
test("clicking a meeting entry navigates to /meetings/[id], not /leads/[id]", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-meeting-clickthrough-to-detail-view")
})
test("clicking a follow-up entry navigates to /leads/[id]", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-followup-clickthrough-to-lead")
})
test("view toggle switches between month and week grid layouts", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-view-toggle-month-week")
})
test("toggling view preserves the currently viewed date range", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-view-toggle-preserves-date-context")
})
test("calendar renders empty grid with no error when range has no entries", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: calendar-empty-range-no-error")
})
test("GET /meetings/[bad-id] returns 404", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: meetings-detail-route-404-on-missing")
})
```

Hybrid gates (AC2, AC3) have no on-disk stub per `vc-test-coverage-plan` rule (hybrid/agent-probe/known-gap tiers don't get stubs) — they require a DB-backed check; no live-DB integration harness exists yet per `process/context/tests/all-tests.md` Known Gaps. The unit-test half of each (query-shape assertion) IS Fully-Automated and does get a stub above.

**Missing test areas:**

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Full DB-backed multi-user visibility check (AC2/AC3 Hybrid halves) | No live-DB integration test harness exists yet (`process/context/tests/all-tests.md` Known Gaps) | Accept as known-gap for the Hybrid half; the unit-test half (query predicate assertion) provides fully-automated regression coverage in the interim. Manual DB-backed verification during EXECUTE/EVL as a one-time check. **VALIDATE precedent:** identical gap category accepted in the Meeting Reminders feature's VALIDATE pass (`process/features/reminders/active/meeting-reminders_01-07-26/results.tsv`, iteration 2 — "2 pre-accepted known-gaps remain (AC3/AC5 no CI-DB-harness...)"); treated consistently here. |

## Acceptance Criteria

This plan implements SPEC acceptance criteria AC1–AC9 verbatim (see locked SPEC). Restated as plan-level completion criteria:

- AC1: `/calendar` nav link visible and navigable.
- AC2: All non-deleted team meetings visible to every signed-in user (no owner/organizer scoping).
- AC3: Follow-up reminders shown are scoped to `ownerId = signed-in user` only.
- AC4: Meeting vs follow-up entries are visually distinguishable via markup (color/icon/data-attribute).
- AC5: Clicking a meeting entry navigates to `/meetings/[id]` (new dedicated detail route), not `/leads/[id]`.
- AC6: Clicking a follow-up entry navigates to `/leads/[id]`.
- AC7: Month and week view toggle exists and functions.
- AC8: Toggling view preserves the currently-viewed date neighborhood (no reset to today).
- AC9: Empty date range renders a clean empty grid, no error.

Full traceability (proven-by / strategy per criterion) is in the Verification Evidence table below.

## Phase Completion Rules

- A phase is `CODE DONE` when its checklist steps are implemented and its Fully-Automated test stubs pass green. It is NOT `✅ VERIFIED` until the Hybrid/manual portions relevant to that phase (if any) have also been checked and the phase report records that check.
- Phase 1 and Phase 2 may reach `✅ VERIFIED` independently of Meetings PR status (no Hybrid gates block them beyond their own unit tests).
- Phase 3 cannot start EXECUTE (not even `CODE DONE`) until PR #112 is merged into `development`, per Preconditions.
- Phase 4 reaches `CODE DONE` only after Phases 1–3 are each at least `CODE DONE`; it reaches `✅ VERIFIED` only after the AC2/AC3 Hybrid DB-backed checks are manually run once (see Verification Evidence "Missing test areas" — accepted known-gap for automation, not for verification).
- Phase 5 is a verification-only phase — it does not introduce new code, only confirms Phase 4's click-through wiring end-to-end; it is `✅ VERIFIED` when AC5/AC6 e2e stubs are green against the fully wired page.
- No phase may be marked `✅ VERIFIED` on the strength of code completion alone — user confirmation or a green automated/hybrid gate is required per the repo's plan-lifecycle rules.

## Test Procedure

Post-phase testing follows `process/context/tests/all-tests.md` default order: `bun run check` → `bun run test:unit` → `bun run test:e2e` (once e2e specs for this feature exist). Per-phase gates are enumerated in the Verification Evidence table; run the Fully-Automated rows relevant to each phase immediately after that phase's checklist steps, per this plan's Phase Completion Rules.

## Implementation Checklist

**Phase 1 — Follow-up range query (independent, can start immediately)**
1. Add `getFollowUpsInRange(userId: string, rangeStart: Date, rangeEnd: Date): Promise<Lead[]>` to `src/lib/server/db/leads.ts`, adapting the `getTodayQueue` DISTINCT ON pattern — replace the "today" predicate with `between(crmActivities.followUpAt, rangeStart, rangeEnd)`, KEEP `eq(crmLeads.ownerId, userId)` and `isNull(crmLeads.deletedAt)` predicates unchanged. Do NOT modify `getTodayQueue` or `getRemindersQueue`. **See Validate Contract Execute-Agent Instruction E1** for how to structure the WHERE-clause so the regression-guard unit test can run without a live DB.
2. Write the unit test stub for the ownerId-predicate regression guard (see stub above) and a basic range-filter behavior test.

**Phase 2 — Custom calendar grid components (independent, parallel-safe with Phase 1)**
3. Create `src/lib/components/calendar/CalendarGrid.svelte` — Svelte 5 runes, accepts `view: 'month' | 'week'`, `entries: CalendarEntry[]`, `visibleRangeStart: Date` as props; renders month or week layout using Tailwind grid utilities and `@internationalized/date` for date math (reference the existing `src/lib/components/ui/calendar/` bits-ui date-picker for structural date-math patterns only — do not import or reuse its code).
4. Define a `CalendarEntry` type (e.g. in `src/lib/types` or colocated) with `{ id, type: 'meeting' | 'followup', startAt: string, title: string, href: string }` shape — this is the common shape both meeting and follow-up data map into before reaching the grid.
5. Pick concrete visual-distinction tokens now: e.g. `type: 'meeting'` renders with a blue badge/left-border + a small calendar-dot icon; `type: 'followup'` renders with an amber badge/left-border + a clock icon. Encode as a `data-entry-type` attribute + distinct Tailwind class on the entry chip (verifiable by AC4's markup-inspection e2e test).
6. Write the e2e stub for `calendar-entry-visual-distinction` scenario markup.

**Phase 3 — Meeting detail route (BLOCKED on PR #112 merge — see Preconditions)**
7. Create `src/routes/meetings/[id]/+page.server.ts` — load function calls `getMeetingDetail(params.id)` from `src/lib/server/db/meetings.ts`; `error(404)` if null. **See Validate Contract Execute-Agent Instruction E2** for the local `locals.user` guard convention used by sibling routes.
8. Create `src/routes/meetings/[id]/+page.svelte` — read-first layout: title/lead link/organizer/date-time/attendees list/notes/outcome/meeting URL; "Edit" button opens existing `MeetingFormModal.svelte` (import from wherever it lives on the merged Meetings branch — confirm exact path during EXECUTE, not guessed here since the branch isn't merged yet; VALIDATE confirms it currently lives at `src/lib/components/meetings/MeetingFormModal.svelte` on `feat/meetings-and-reminders`, re-check after merge).
9. Write the 404 stub test + the click-through-lands-on-detail e2e stub.

**Phase 4 — Calendar page wiring (depends on Phase 1 + Phase 2 + Phase 3; meetings data half also blocked on PR #112)**
10. Decide and implement the `listAllMeetings()` range-filtering approach (server-side param addition preferred per INNOVATE, OR post-fetch filter in `+page.server.ts` — record the choice in the phase report).
11. Create `src/routes/calendar/+page.server.ts` — parse `?view=month|week&date=YYYY-MM-DD` (default `view=month`, `date=today`), compute `rangeStart`/`rangeEnd` from view+date, call `getFollowUpsInRange(locals.user.id, rangeStart, rangeEnd)` and the meetings fetch (range-filtered per step 10), map both into the common `CalendarEntry[]` shape (meeting → `href: /meetings/${id}`, followup → `href: /leads/${leadId}`), return combined + sorted entries.
12. Create `src/routes/calendar/+page.svelte` — renders `CalendarGrid`, a month/week toggle control, prev/next range navigation, using the `navigate()` URL-searchParam pattern generalized from `src/routes/leads/+page.svelte` (`SvelteURLSearchParams` + `goto(?params)`), driving `view` and `date` params. On toggle, recompute `date` param such that the new range's window still contains the previously-visible date (satisfies AC8 — do not reset to today on toggle).
13. Add a new `ICONS` entry to `src/lib/components/shared/Icon.svelte` (e.g. `calendarDays`) distinct from the existing `calendar` key.
14. Add `{ href: '/calendar', label: 'Calendar', icon: 'calendarDays' }` to the `work` array in `src/lib/components/layout/AppSidebar.svelte` (position: after `/reminders`, before manager-only items — match existing ordering convention).
15. Write e2e stubs for nav-link, view-toggle, view-toggle-preserves-date-context, empty-range-no-error.

**Phase 5 — Click-through wiring verification (depends on Phase 4)**
16. Confirm `CalendarEntry.href` values render as actual navigable links/buttons in `CalendarGrid.svelte`/entry component (not just visual markup).
17. Run the full e2e stub set for AC5/AC6 click-through scenarios end-to-end against the wired page.

## Dependencies

- **Hard, blocking:** PR #112 (`feat/meetings-and-reminders`) merge into `development` — blocks Phase 3 fully, blocks the meetings-data half of Phase 4 (steps 10–11's meetings portion). Phase 1, Phase 2, and the follow-ups half of Phase 4 do not depend on it.
- **Soft, sequencing:** Phase 4 depends on Phase 1 + Phase 2 + Phase 3 all being complete (it wires their outputs together). Phase 5 depends on Phase 4.
- No new package dependencies. `@internationalized/date` already present (used by existing date-picker) — confirmed in `package.json` at VALIDATE time.

## Risks (with Risk Predictions from INNOVATE)

| Risk | Mitigation |
|---|---|
| **PR #112 never merges or merges with a different `Meeting`/`listAllMeetings()` shape than documented here** | Preconditions section documents exact confirmed signatures as of this plan's write date; EXECUTE must re-confirm signatures against `development` at Phase 3 start (re-research step) before writing code against them. VALIDATE re-confirmed signatures live (01-07-26) and they match. |
| **Copy-paste regression on `ownerId` scoping when writing `getFollowUpsInRange`** (explicitly flagged by INNOVATE) | Dedicated unit-test stub asserts the `ownerId` predicate is present; do not overload `getTodayQueue` — keep as a wholly separate function per INNOVATE's explicit instruction. **VALIDATE addition:** see Execute-Agent Instruction E1 — the codebase has no precedent for asserting Drizzle WHERE-clause predicates without a live DB, so the query's condition-building must be structured to be testable in isolation. |
| **`listAllMeetings()` range-filter approach adds server load if filtered client-side on a growing dataset** | INNOVATE recommends server-side filtering; Phase 4 step 10 requires an explicit decision recorded in the phase report, not silently deferred. |
| **Reusing `calendar` icon name collides with existing `/meetings` sidebar entry** | Explicit new `ICONS` key required (step 13) — verified by reading `Icon.svelte` during RESEARCH; `calendar` key confirmed already in use, and VALIDATE additionally confirmed the Meetings branch's AppSidebar assigns `icon: 'calendar'` to the `/meetings` entry, so the collision is real and step 13 is required, not precautionary. |
| **No live-DB integration harness for AC2/AC3 Hybrid halves** | Accepted as known-gap per Verification Evidence "Missing test areas" table; unit-test halves (query predicate assertions) provide automated regression coverage in the interim; one-time manual DB check during EVL. Consistent with the Meeting Reminders precedent (see Validate Contract). |

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/calendar/active/calendar_01-07-26/calendar_PLAN_01-07-26.md`
2. **Last completed phase or step:** VALIDATE phase — validate-contract written, gate CONDITIONAL, EXECUTE-ready.
3. **Validate-contract status:** written 01-07-26 — Gate: CONDITIONAL (see below).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, locked SPEC (`calendar_SPEC_01-07-26.md`), live repo reads of `src/lib/server/db/leads.ts`, `src/lib/components/layout/AppSidebar.svelte`, `src/lib/components/shared/Icon.svelte`, `src/routes/leads/+page.svelte`, `src/lib/server/db/schema.ts`, `src/tests/leads-db.spec.ts`, `src/hooks.server.ts`, `src/app.d.ts`, and live reads of `origin/feat/meetings-and-reminders` (`src/lib/server/db/meetings.ts`, `src/lib/types/index.ts`, `src/lib/components/layout/AppSidebar.svelte`, route tree) — re-confirmed via `git show`/`git ls-tree` at VALIDATE time, plus a live `gh pr view 112` check.
5. **Next step for a fresh agent picking up mid-execution:** ENTER EXECUTE MODE for Phase 1 + Phase 2 (parallel-safe, no PR #112 dependency). At EXECUTE time for Phase 3/4, re-confirm PR #112 merge status and re-verify the `listAllMeetings()`/`getMeetingDetail()`/`Meeting` type signatures against current `development` — do not trust this plan's confirmed signatures blindly if significant time has passed or the branch has moved. Apply Execute-Agent Instructions E1 and E2 from the Validate Contract below.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential (with a fan-out exception)
Rationale: 7-signal score = 1/7 (only S7 — 5+ files in blast radius, ~10 files touched; no multi-package spread, no schema/API/auth surface, not a phase-program, no user-requested depth, no high-risk class). LOW threshold → base recommendation is sequential per-phase EXECUTE. Exception: the plan itself flags Phase 1 and Phase 2 as independent/parallel-safe (disjoint files, no shared state) — orchestrator MAY spawn 2 parallel `vc-execute-agent` subagents for Phase 1 + Phase 2 as a scoped fan-out within an otherwise-sequential program (Fan-Out-Level Invocation Rule), rather than escalating the whole EXECUTE strategy tier. Phase 3 is externally gated (PR #112, not a strategy decision); Phase 4 depends on 1+2+3; Phase 5 depends on 4. Model: opus for the `vc-execute-agent` code-writing leg only; sonnet for `vc-tester` (EVL confirmation) and all other roles.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Calendar nav link visible and navigates to `/calendar` | Fully-Automated | `calendar-nav-link-visible-and-navigates` (Playwright e2e) | A |
| AC2 (unit half) | Meetings fetch applies no ownerId/organizerId scoping (team-shared) | Fully-Automated | `calendar-meetings-team-shared-visibility` — unit test on the entry-combination/mapping helper with a multi-organizer fixture array | A |
| AC2 (DB half) | Two different signed-in users see the identical full meeting set | Hybrid | DB-backed multi-user seed check, manual at EVL (`SKIP_DB` precedent) | D — known-gap, tracked in `process/context/tests/all-tests.md` Known Gaps; precedent: meeting-reminders VALIDATE 01-07-26 |
| AC3 (unit half) | `getFollowUpsInRange` query includes `eq(crmLeads.ownerId, userId)` predicate | Fully-Automated | `calendar-followups-owner-scoped-visibility` (unit half) — **requires E1** (see below) to be genuinely DB-free | A, pending E1 |
| AC3 (DB half) | Two different owners each see only their own follow-ups | Hybrid | DB-backed multi-user seed check, manual at EVL (`SKIP_DB` precedent) | D — known-gap, tracked in `process/context/tests/all-tests.md` Known Gaps; precedent: meeting-reminders VALIDATE 01-07-26 |
| AC4 | Meeting vs follow-up entries visually distinct in markup | Fully-Automated | `calendar-entry-visual-distinction` (Playwright e2e) | A |
| AC5 | Meeting click-through lands on `/meetings/[id]`, not `/leads/[id]` | Fully-Automated | `calendar-meeting-clickthrough-to-detail-view` (Playwright e2e) | A |
| AC6 | Follow-up click-through lands on `/leads/[id]` | Fully-Automated | `calendar-followup-clickthrough-to-lead` (Playwright e2e) | A |
| AC7 | Month/week toggle exists and functions | Fully-Automated | `calendar-view-toggle-month-week` (Playwright e2e) | A |
| AC8 | Toggle preserves date-range context | Fully-Automated | `calendar-view-toggle-preserves-date-context` (Playwright e2e) | A |
| AC9 | Empty range renders cleanly, no error | Fully-Automated | `calendar-empty-range-no-error` (Playwright e2e) | A |
| (defensive) | `GET /meetings/[bad-id]` returns 404 | Fully-Automated | `meetings-detail-route-404-on-missing` (unit/e2e) | A |

gap-resolution legend: A — proven now (gate passes in this cycle) · D — backlog/known residual (named, justified, tracked centrally, keep-active).

C-4 reconciliation: `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe); Known-Gap is never a `strategy` value here — the AC2/AC3 DB halves are Hybrid strategy with gap-resolution D (the DB-backed execution itself is the named residual, not the strategy).

**Failing stubs** (verbatim from Verification Evidence section above — 10 Fully-Automated TDD stubs, one per row: `calendar-followups-owner-scoped-visibility` unit half, `calendar-meetings-team-shared-visibility` unit half, `calendar-nav-link-visible-and-navigates`, `calendar-entry-visual-distinction`, `calendar-meeting-clickthrough-to-detail-view`, `calendar-followup-clickthrough-to-lead`, `calendar-view-toggle-month-week`, `calendar-view-toggle-preserves-date-context`, `calendar-empty-range-no-error`, `meetings-detail-route-404-on-missing`). Hybrid/Agent-Probe/Known-Gap rows do not receive stubs (none of that shape here beyond the D-resolution DB halves, which are Hybrid — no stub per rule).

Legacy line form (retained so existing validate-contract consumers still parse):
- Calendar nav + grid UI: Fully-automated: `bun run check && bun run test:unit && bun run test:e2e` | hybrid: n/a | agent-probe: n/a | known-gap: n/a
- Meetings/follow-ups visibility scoping (AC2/AC3): Fully-automated (unit halves): `bun run test:unit` | hybrid (DB halves, precondition: `docker compose up -d db` + `DATABASE_URL` set, then `bun run test:unit:ci`): manual one-time check at EVL | agent-probe: n/a | known-gap: accepted, no CI DB harness (tracked in `process/context/tests/all-tests.md`)

Dimension findings:
- Infra fit: PASS — no container/infra/port/env changes; SvelteKit route/component conventions match existing patterns exactly; all referenced existing files (`leads.ts`, `AppSidebar.svelte`, `Icon.svelte`, `leads/+page.svelte`) confirmed present on disk; `@internationalized/date` confirmed already a dependency (`package.json:31`); no naming collisions for any new file/dir (`src/lib/components/calendar/`, `src/routes/calendar/`, `src/routes/meetings/[id]/` all confirmed absent on both `development` and the Meetings branch).
- Test coverage: CONCERN (resolved via execute-agent instruction E1, see below) — AC3's Fully-Automated unit-test half was described without a mechanism to build it DB-free; the codebase has zero precedent for asserting Drizzle WHERE-clause predicates without a live connection (every existing DB-layer test is `SKIP_DB`-gated). Resolved as E1. AC2/AC3 Hybrid DB-backed halves remain an accepted known-gap, precedent-matched to meeting-reminders VALIDATE (01-07-26).
- Breaking changes: PASS — every touchpoint is additive (new function, new routes, new nav entry, new icon key); the one open decision on `listAllMeetings()` is an optional-param addition, backward compatible either way; no downstream consumer of any modified file is broken.
- Security surface: PASS (minor style note, resolved via execute-agent instruction E2) — new `/meetings/[id]` route sits behind the existing global session-gate hook (`src/hooks.server.ts`, `PUBLIC_PREFIXES` does not include `/meetings`), so unauthenticated access is blocked by default; `getMeetingDetail()` confirmed to have no organizer/attendee scoping, correctly matching AC2's team-shared requirement; no auth/billing/schema/secrets surface touched.
- Section 1 (Follow-up range query) feasibility: PASS — edit target `src/lib/server/db/leads.ts` confirmed, `getTodayQueue`'s real two-step DISTINCT-ON shape read and reconciled with the plan's adaptation instructions (updated in Preconditions above); highest-risk edit is the ownerId predicate copy-paste (mitigated by E1 + existing stub).
- Section 2 (Calendar grid components) feasibility: PASS — no file collisions, dependency confirmed present, no gaps found.
- Section 3 (Meeting detail route) feasibility: PASS (contingent on PR #112) — confirmed no existing `/meetings/[id]` route on either branch (no collision once unblocked); `MeetingFormModal.svelte` path confirmed on the Meetings branch; highest-risk edit is the redundant-auth-check convention gap, mitigated by E2.
- Section 4 (Calendar page wiring) feasibility: PASS — URL-param `navigate()` pattern confirmed reusable from `src/routes/leads/+page.svelte`; icon-collision risk confirmed real and correctly mitigated by the plan's own step 13; highest-risk edit is the AC8 date-preservation-on-toggle logic (no dedicated mitigation beyond the e2e stub — acceptable, this is exactly what that stub proves).
- Section 5 (Click-through verification) feasibility: PASS — verification-only phase, no new code, no gaps.

Open gaps:
- AC2/AC3 Hybrid DB-backed halves have no CI live-DB harness — accepted known-gap, tracked centrally in `process/context/tests/all-tests.md` Known Gaps (not a new backlog artifact; precedent: `process/features/reminders/active/meeting-reminders_01-07-26/results.tsv`).
- PR #112 (`feat/meetings-and-reminders`) remains OPEN as of VALIDATE time (01-07-26) — Phase 3 and the meetings-data half of Phase 4 cannot start EXECUTE until it merges. Documented precondition, not a VALIDATE-blocking defect; Phase 1/2 are unaffected and EXECUTE-ready now.

Execute-Agent Instructions:
- **E1** — When implementing `getFollowUpsInRange` (Touchpoint #1 / checklist step 1), structure the WHERE-clause condition list as a locally isolable value BEFORE it reaches `db.select()...where()` — e.g. build `const conditions = [eq(crmLeads.ownerId, userId), isNull(crmLeads.deletedAt), between(crmActivities.followUpAt, rangeStart, rangeEnd)]` and pass `and(...conditions)` to `.where()`, OR extract a small pure helper (e.g. `buildFollowUpsRangeConditions(userId, rangeStart, rangeEnd)`) that returns the condition array and is imported directly by the unit test. Either shape lets the `calendar-followups-owner-scoped-visibility` unit-test stub assert the `ownerId` predicate is present without a live DB connection or `SKIP_DB` gating. Trigger condition: Phase 1, checklist step 1/2.
- **E2** — When creating `src/routes/meetings/[id]/+page.server.ts` (Touchpoint #4 / checklist step 7), add the same local `if (!locals.user) throw error(401, 'Unauthorized')` defense-in-depth guard used by `src/routes/leads/[id]/+page.server.ts`, even though the global session-gate hook already blocks unauthenticated access — this matches existing repo convention (redundant-but-typed narrowing of `locals.user`) rather than relying solely on the hook. Trigger condition: Phase 3, checklist step 7.

What this coverage does NOT prove:
- The Fully-Automated e2e suite (AC1, AC4–AC9, 404 defensive gate) proves UI wiring and click-through correctness in a single-user, mocked/dev-session context — it does NOT prove multi-user data isolation under concurrent load or with a large seeded dataset.
- The Fully-Automated unit halves of AC2/AC3 prove query/composition SHAPE correctness (predicate present, no filter applied) — they do NOT prove the predicate behaves correctly against real Postgres rows (index usage, timezone handling in `between()` range comparisons, DISTINCT ON tie-breaking with real concurrent activity rows). That gap is exactly what the accepted Hybrid DB-backed known-gap leaves open until a live-DB CI harness exists.
- No test in this plan proves behavior under the "PR #112 merges with a different shape than documented" risk — that risk is mitigated procedurally (re-confirm signatures at EXECUTE time), not via an automated gate.
- No load/performance test exists for `listAllMeetings()` range-filtering on a growing dataset (flagged as a risk, mitigated by design choice — server-side filtering — not by a test gate).

Gate: CONDITIONAL (0 FAILs, 2 CONCERNs both resolved via execute-agent instructions E1/E2 embedded above — no plan-checklist supplement required; 1 pre-accepted known-gap remains). EXECUTE-ready: Phase 1 + Phase 2 immediately; Phase 3+ upon PR #112 merge.
Accepted by: session (orchestrator pre-authorized precedent-consistent treatment of the AC2/AC3 no-CI-DB-harness known-gap in the VALIDATE invocation prompt, 01-07-26, quoting: "this same gap was already surfaced and accepted during the recent Meeting Reminders feature's VALIDATE pass ... treat it consistently with that prior precedent (known-gap, not a new blocking concern)"; the two newly-found CONCERNs (E1, E2) required no separate acceptance as they were fully resolved in-contract via execute-agent instructions, per the standard net-gate rule "CONDITIONAL: ... N as execute-agent instructions ... Proceed to EXECUTE with gaps on record.")

## Autonomous Goal Block

SESSION GOAL: Ship the `/calendar` page (month/week grid, team-shared meetings + owner-scoped follow-ups, meeting detail route) per locked SPEC `calendar_SPEC_01-07-26.md`.
Charter + umbrella plan: N/A — single plan, no umbrella/phase-program.
Autonomy: Standard RIPER-5 autonomy per `process/development-protocols/orchestration.md` §Autonomy Mode — EXECUTE still requires explicit "ENTER EXECUTE MODE"; no standing /goal is active for this task.
Hard stop conditions / safety constraints:
- Do not start EXECUTE on Phase 3 (or the meetings-data half of Phase 4) until PR #112 (`feat/meetings-and-reminders`) is merged into `development` — re-verify merge status and re-confirm `listAllMeetings()`/`getMeetingDetail()`/`Meeting` signatures against current `development` before writing any Phase 3/4 meetings-data code.
- Do not drop or weaken the `eq(crmLeads.ownerId, userId)` predicate in `getFollowUpsInRange` — this is the single explicitly-flagged regression risk (AC3) in this plan.
- Do not reuse the `calendar` icon key for the new `/calendar` nav entry — it collides with the Meetings branch's `/meetings` entry.
Next phase: EXECUTE (Phase 1 + Phase 2 first — parallel-safe, no external blocker; Phase 3+ gated on PR #112).
Validate contract: inline in plan (this file, `## Validate Contract` section above).
Execute start: Phase 1 — `bun run test:unit` (unit stubs for `getFollowUpsInRange` + ownerId regression guard) | Phase 2 — `bun run check` + Playwright e2e for `calendar-entry-visual-distinction` once written | e2e spec: none yet on disk, created during EXECUTE per the Failing stubs above | high-risk pack: no (no high-risk class touched — auth/billing/schema/migration/public-API/deploy/secrets all confirmed absent from this plan's blast radius).
