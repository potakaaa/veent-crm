---
name: plan:calendar-spec
description: "Product-discovery requirements for a top-level Calendar page consolidating team meetings and AE-scoped follow-up reminders"
date: 01-07-26
feature: calendar
---

# Calendar — SPEC

## Summary

Sales reps and managers currently have to check two separate places to see what's coming up: the Meetings list and the Reminders/follow-up queue. This feature adds one new "Calendar" page, reachable from the main navigation, that shows both on a single month or week grid. Meetings are shown to everyone on the team (since meetings are shared), while follow-up reminders are private to each rep (you only see your own). Clicking a follow-up entry takes you straight to the related lead; clicking a meeting entry takes you to a new, dedicated meeting detail view (this feature introduces that surface) so you can act on it immediately.

## User Stories / Jobs To Be Done

- **US1 (any team member):** As a team member, I want to open a Calendar page from the main navigation, so that I can see my upcoming work without hunting across separate pages.
- **US2 (any team member):** As a team member, I want to see every scheduled team meeting on the calendar, so that I know what's happening across the team, not just my own meetings.
- **US3 (AE / rep):** As an account executive, I want to see only my own follow-up reminders on the calendar, so that my calendar isn't cluttered with other reps' work and I don't act on leads I don't own.
- **US4 (any team member):** As a team member, I want meetings and follow-ups to look visually distinct, so that I can tell at a glance which is which without opening each one.
- **US5 (any team member):** As a team member, I want to click a calendar entry and land on the right context for that entry — a follow-up takes me to the related lead, and a meeting takes me to a dedicated meeting detail view — so that I can immediately see full context and take action.
- **US6 (any team member):** As a team member, I want to switch between a month view and a week view, so that I can zoom out for planning or zoom in for a busy week.

## What The User Wants (Behavioral Outcomes)

- A new "Calendar" item appears in the main navigation, alongside existing items like Leads, Pipeline, Meetings, Reminders.
- Opening the Calendar page shows a grid (month by default) populated with entries drawn from two sources: scheduled meetings (everyone's) and the signed-in rep's own follow-up reminders.
- Each entry appears on the calendar day/time matching when the meeting starts, or when the follow-up is due.
- Meeting entries and follow-up entries are visually distinguishable from one another (e.g., different color, icon, or label) without needing to click into them.
- Clicking a follow-up entry navigates to the lead record tied to that follow-up.
- Clicking a meeting entry navigates to a dedicated meeting detail view — a new surface introduced by this feature — showing that meeting's full context. It does NOT land the user on the lead detail page. The exact mechanism (a new standalone route vs. a modal opened from the calendar) is an implementation/approach decision left to INNOVATE; this SPEC only requires that a dedicated meeting detail surface exists and is what the user lands on.
- A control lets the user switch the calendar between a month layout and a week layout; switching does not lose the user's place (still viewing dates in the same neighborhood as before the switch).
- The calendar reflects only real scheduled/tracked activity — there is no separate manual calendar-entry creation in this feature.

## Flow / State Diagram

```
[User in app] --> [Clicks "Calendar" in nav]
                        |
                        v
              [Calendar page loads: month view, current month]
                        |
        +---------------+----------------+
        |                                |
        v                                v
[Sees all team meetings]      [Sees own follow-up reminders only]
        |                                |
        +---------------+----------------+
                        |
                        v
        [Meetings and follow-ups rendered with distinct look]
                        |
        +---------------+----------------+----------------+
        |                                |                |
        v                                v                v
 [Clicks "Week" toggle]       [Clicks a follow-up entry]  [Clicks a meeting entry]
        |                                |                |
        v                                v                v
 [Grid switches to week          [Navigates to the       [Navigates to a new
  layout, same date range]        linked lead record]     dedicated meeting
        |                                                 detail view]
        v
 [Can toggle back to Month]

Error / empty state:
[No meetings or follow-ups in visible range] --> [Grid renders empty, no error — just no entries]
```

## Acceptance Criteria (Testable Outcomes)

- AC1: A "Calendar" link is visible in the main navigation and clicking it opens the Calendar page.
  proven by: calendar-nav-link-visible-and-navigates (e2e)
  strategy: Fully-Automated

- AC2: On the Calendar page, every non-deleted scheduled meeting appears, regardless of which team member organized it or is attending — every signed-in user sees the same full set of meetings.
  proven by: calendar-meetings-team-shared-visibility (Hybrid: query-layer test + DB-backed check)
  strategy: Hybrid

- AC3: On the Calendar page, follow-up reminders shown belong only to leads owned by the signed-in user — a different signed-in user sees a different (their own) set of follow-ups, never another rep's.
  proven by: calendar-followups-owner-scoped-visibility (Hybrid: query-layer test + DB-backed check)
  strategy: Hybrid

- AC4: Meeting entries and follow-up entries are visually distinguishable from each other on the calendar grid (e.g., distinct color/style/icon), verifiable by inspecting rendered markup without opening either entry.
  proven by: calendar-entry-visual-distinction (e2e)
  strategy: Fully-Automated

- AC5: Clicking a meeting entry navigates the user to a dedicated meeting detail view (a new surface introduced by this feature) showing that meeting's full context — not to the lead's detail page. Whether that surface is a standalone route or a modal is an INNOVATE-level decision; either satisfies this criterion as long as the meeting's own detail (not the lead page) is what the user lands on.
  proven by: calendar-meeting-clickthrough-to-detail-view (e2e)
  strategy: Fully-Automated

- AC6: Clicking a follow-up entry navigates the user to that follow-up's linked lead record.
  proven by: calendar-followup-clickthrough-to-lead (e2e)
  strategy: Fully-Automated

- AC7: The Calendar page offers at least a month layout and a week layout, and the user can switch between them from the page itself.
  proven by: calendar-view-toggle-month-week (e2e)
  strategy: Fully-Automated

- AC8: Switching between month and week layout keeps the user oriented around the same date range they were previously viewing (no jump to today/unrelated date on toggle).
  proven by: calendar-view-toggle-preserves-date-context (e2e)
  strategy: Fully-Automated

- AC9: When a rep has no follow-ups and there are no meetings in the visible date range, the calendar renders an empty grid with no error state.
  proven by: calendar-empty-range-no-error (e2e)
  strategy: Fully-Automated

## Out Of Scope

- Drag-to-reschedule or any editing of a meeting/follow-up date directly from the calendar grid.
- Export or sync to external calendars (ICS, Google Calendar, Outlook, etc.).
- Meeting duration/end-time rendering — meetings render as point-in-time markers only (no stored end time exists today).
- Day-view layout — only month and week are required for v0 (confirmed by the user, 2026-07-01).
- Manual/ad-hoc calendar event creation not tied to an existing meeting or lead follow-up.
- Choice of calendar-rendering library or component — that is an implementation/approach decision that belongs to INNOVATE, not this SPEC.
- The exact mechanism of the new meeting detail view (standalone route vs. modal) and its internal content/layout — the requirement that a dedicated meeting detail surface must exist is in scope (see AC5); the specific mechanism is an INNOVATE decision.
- Any other change to how meetings or follow-ups are created, edited, or scheduled elsewhere in the app — this feature only consolidates/displays existing data and adds the new meeting detail surface needed for click-through.

## Constraints

- Meetings feature dependency: the Calendar page depends on `crm_meetings` schema and the meetings list query, which are not yet merged into `development` (currently on an open PR). Calendar work cannot ship ahead of that merge, though this SPEC can be written and reviewed now.
- Meeting entries have no duration — only a single start timestamp exists per meeting, so the calendar cannot render meetings as time-span blocks; it can only mark a point in time.
- Follow-up scoping must match the existing "my records only" pattern already used elsewhere in the app (today's queue, reminders queue) — a rep must never see another rep's follow-ups on the calendar.
- Meetings must always be shown to all team members regardless of who is signed in — no scoping/filtering by organizer or attendee for meeting visibility.
- No calendar-rendering library exists in this codebase today; the existing date-picker component is not a substitute for a multi-event calendar grid. Library/approach selection happens in INNOVATE, not here.
- No dedicated meeting detail route or view exists today (meetings currently open in an edit modal from the `/meetings` list, not a standalone page). Per Decision A (confirmed), this feature must introduce a new dedicated meeting detail surface for the calendar's meeting click-through to land on — the exact mechanism (new route vs. modal) is an INNOVATE-level design decision, not fixed by this SPEC.

## Decisions Requiring Sign-Off

All three decisions below were open at initial SPEC drafting and have since been confirmed directly by the user (2026-07-01). Recorded here for traceability; the Acceptance Criteria, Behavioral Outcomes, User Stories, and Out Of Scope sections above already reflect these final answers.

- **Decision A — Meeting click-through target.** **CONFIRMED (user, 2026-07-01) — OVERRIDDEN, not the recommended default.** Final answer: clicking a meeting entry navigates to a new dedicated meeting detail view/route, NOT to `/leads/[id]`. This is now a real in-scope requirement (see AC5) requiring new surface design in INNOVATE — not a trivial reuse of the existing lead page. The exact mechanism (a new `/meetings/[id]`-style route vs. a modal opened from the calendar) and what content it shows are intentionally left for INNOVATE to decide.
- **Decision B — Month/week only, or also day view?** **CONFIRMED (user, 2026-07-01) — recommended default accepted.** v0 ships month and week layouts only. Day view remains Out of Scope, unchanged from the original recommendation.
- **Decision C — Follow-up click-through target.** **CONFIRMED (user, 2026-07-01) — recommended default accepted.** Clicking a follow-up entry navigates to the lead's detail page (`/leads/[id]`), unchanged from the original recommendation.

## Open Questions

None — all three items in "Decisions Requiring Sign-Off" are confirmed by the user (2026-07-01). SPEC is locked; INNOVATE may proceed, and must now design the new meeting detail surface required by Decision A (route vs. modal, content shown) as part of its approach comparison.

## Background / Research Findings

- **Meetings data (team-shared, already query-ready):** `listAllMeetings()` in `src/lib/server/db/meetings.ts` returns every non-deleted meeting with `id`, `leadId`, `leadName`, `organizerId`, `organizerName`, `startAt` (point-in-time timestamp — no end/duration column), `meetingUrl`, `notes`, `outcome`, `attendees[]`. No new query is needed for the meetings half of this feature.
- **Follow-up data (AE-scoped, needs a new date-range query):** Follow-ups live on `crm_activities.followUpAt`, not on `crm_leads` directly (the user's original framing of a "lead follow_up_at field" was imprecise). A lead's current follow-up is derived via a `DISTINCT ON (lead_id) ... ORDER BY lead_id, occurred_at DESC` pattern already used in `getTodayQueue(userId)` and `getRemindersQueue`, both scoped by `crmLeads.ownerId = userId`. The calendar needs an analogous query scoped to a date *range* (the visible month/week window) instead of "today only" — this is new query work, not existing.
- **No calendar-rendering library exists today.** ECharts is not installed (contradicting the user's original assumption and a stale claim in the context docs) — the only chart dependency is `layerchart` (bar/line/pie/area primitives, no event-grid component). The only "calendar" UI code present is a bits-ui date-*picker* (single-date selection grid), which is a structural/date-math reference at most, not a drop-in multi-event calendar. This makes library/approach selection a genuine open decision for INNOVATE.
- **No click-through precedent for meetings exists.** There is no `/meetings/[id]` detail route today — the existing `/meetings` list page opens an edit modal in place. Decision A (confirmed by the user, 2026-07-01) requires this feature to introduce a new dedicated meeting detail view for the calendar's meeting click-through — the exact mechanism (new standalone route vs. a modal opened from the calendar) and what content it shows are left for INNOVATE to design; this is real scope work, not a reuse of the existing `/leads/[id]` Meetings tab.
- **Sequencing dependency:** The Meetings feature (`crm_meetings` schema, `listAllMeetings()`, `/meetings` route) is not yet merged into `development` — it exists on an open feature branch/PR. This is a precondition for calendar work, not a blocker to writing requirements now.
- **Nav pattern:** `src/lib/components/layout/AppSidebar.svelte` uses a flat array of `{ href, label, icon }` entries. The existing `/meetings` entry uses icon name `calendar`, so a new `/calendar` entry needs a distinct icon — a small open implementation detail, not a blocker.
- **Existing view-toggle/URL-param convention (candidate, not locked):** `src/routes/leads/+page.svelte` drives bookmarkable view state (e.g. a segment toggle) via `page.url.searchParams` plus a `navigate()` helper backed by the server load function. This looks like the natural pattern for a month/week toggle to follow, but is flagged as a candidate for INNOVATE/PLAN to confirm, not a locked SPEC decision.
- **Test infrastructure grounding (from `process/context/tests/all-tests.md`):** Vitest covers unit-level logic (schemas, query-building, scoping logic); Playwright is configured but has no test files yet — e2e navigation/rendering/click-through scenarios are the established pattern for full-page-flow verification once written. There is no live-DB integration test harness yet, which is why data-scoping criteria (AC2, AC3) are marked Hybrid rather than Fully-Automated — the query-shape logic is unit-testable, but end-to-end scoping against real DB rows needs a DB-backed check until that harness exists.
- **User's original framing corrected:** the user described this as consolidating "meetings and follow-up reminders," and described follow-ups as living on the lead record directly. Research confirms the feature intent is correct but the underlying data source for follow-ups is `crm_activities.followUpAt`, derived per-lead, not a literal lead-table column — this doesn't change any acceptance criterion, only the Background understanding for INNOVATE/PLAN.
