---
name: report:calendar-integration-backlog
description: "RESOLVED 01-07-26 — calendar view shipped as its own feature; see process/features/calendar/completed/calendar_01-07-26/"
date: 01-07-26
metadata:
  node_type: memory
  type: report
  feature: meetings
  phase: backlog
  status: resolved
---

# Calendar Integration — Backlog Note

**STATUS: RESOLVED (01-07-26).** The calendar view described below shipped as its own feature —
`process/features/calendar/completed/calendar_01-07-26/` (`/calendar` route, month/week grid,
team-shared meetings + owner-scoped follow-ups, new `/meetings/[id]` detail route for
click-through). Followed exactly the "Action when picked up" instruction at the bottom of this
note: ran RESEARCH → SPEC → INNOVATE → PLAN → VALIDATE → EXECUTE as a dedicated feature, did not
reopen the meetings plan. Code-complete, automated gates green; e2e written but currently
self-skipping pending the shared Playwright auth fixture (tracked in
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Kept below verbatim for
history.

**TL;DR:** The Meetings feature ships CRUD + a lead-detail tab + a top-level list, but NOT a calendar view. This note records the descoped calendar acceptance criterion so it is not lost.

## What Was Needed (historical — resolved, kept for context)

- A calendar view (month/week) rendering meetings by `crm_meetings.startAt`. Shipped as the `/calendar` route (day view was descoped — see the calendar feature's SPEC).
- At the time this note was written, the repo had **no calendar view component** — only a bits-ui date-*picker* under `src/lib/components/ui/calendar/` (not a calendar view). The shipped grid is a custom Svelte 5 component; no new charting dependency was added (`layerchart` remains the only charting library in the repo — ECharts was never installed).

## Why it's out of scope now

- The original feature request's third acceptance criterion ("Meetings appear in the calendar view") references a *related calendar issue* — there is no existing calendar to slot into.
- Building a calendar view is its own design + library-selection effort with no existing precedent in the codebase; folding it into the meetings CRUD plan would blur scope and delay the core logging capability.
- INNOVATE decision #5 explicitly descopes calendar integration from the meetings plan.

## Data readiness

The meetings schema is calendar-ready: `crm_meetings.startAt` (timestamptz) is the single source a calendar view would query. No schema changes are expected to be required for a future calendar view (single start time only — no end/duration yet; a calendar may later want a duration column).

## Pointer

- Parent plan: `process/features/meetings/active/meetings_01-07-26/meetings_PLAN_01-07-26.md`
- Action when picked up: run RESEARCH → SPEC for a dedicated calendar-view feature; do not reopen the meetings plan.
