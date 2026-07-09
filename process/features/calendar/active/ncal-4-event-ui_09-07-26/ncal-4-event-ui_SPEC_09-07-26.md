---
name: spec:ncal-4-event-ui
description: SPEC for NCAL-4 — Calendar event creation form, team-event rendering in grid, event detail/edit/delete modal, and Link-to-Lead claim flow (GitHub #253)
date: 09-07-26
feature: calendar
---

# NCAL-4 — Calendar Event UI, Event Detail Modal, and Link-to-Lead Claim Flow

**GitHub:** #253
**Branch:** feat/ncal-4-event-ui
**Phase:** SPEC

---

## Summary

Right now, CRM users can only see events that come from CRM data (meetings, follow-up dates, go-live dates) on the calendar — they cannot create standalone team events from the calendar itself, and Nextcloud-originated "team events" (created outside the CRM) are invisible in the grid. NCAL-4 fixes this by adding four connected capabilities: a "Create event" form that posts new events to Nextcloud via the existing n8n write path; a team-event rendering layer so those events appear in the calendar grid; an event detail modal for viewing, editing, and deleting team events; and a "Link to lead" claim flow inside that modal that ties a team event to a specific CRM lead by creating a `crm_meetings` row and patching Nextcloud directly via CalDAV PUT (bypassing n8n to reliably write back CATEGORIES and URL).

---

## User Stories / Jobs To Be Done

**US1 — Create a team event from the calendar**
As a CRM user, I want to click a "Create event" button on the calendar page and fill in a form (title, date/time, all-day toggle, location, description, color, status, recurring rule), so that a new shared event is written to the Nextcloud team calendar without leaving the CRM.

**US2 — See team events in the calendar grid**
As a CRM user, I want calendar events that originated in Nextcloud (type: team-event) to appear as chips in the month/week calendar grid alongside meetings and lead dates, so I have a single view of everything on the team's schedule.

**US3 — View, edit, and delete a team event**
As a CRM user, I want to click a team-event chip in the grid to open a detail modal showing the event's full information, and from there be able to edit any field or delete the event entirely, so I can manage the team calendar without switching to Nextcloud.

**US4 — Link a team event to a CRM lead**
As a CRM user, I want to use a lead picker inside the event detail modal to claim an unlinked team event as a CRM meeting, so the event appears in that lead's meeting history and its Nextcloud entry is updated to carry the CRM deep-link.

---

## What The User Wants (Behavioral Outcomes)

**Create event flow:**
- The calendar header has a "Create event" button, always visible.
- Clicking it opens a modal form with fields: title (required), date (required), start time, end time, all-day toggle (when on, hides time fields), location, description, color picker, status (confirmed / tentative / cancelled), recurring rule.
- Submitting the form creates the event in Nextcloud (via the existing POST `/api/calendar/events` route) tagged as a team event. The calendar grid refreshes to show the new event.
- If creation fails (n8n unavailable), the user sees an inline error message and the form stays open.

**Team-event rendering:**
- The calendar page fetches Nextcloud events via `GET /api/calendar/events` alongside the existing CRM data and merges them into the display list.
- Team events render as purple chips (color `#8b5cf6`) in the grid, distinct from meetings (blue), follow-up dots (amber), go-live chips (green), and event-start chips (the existing purple "CAL-2" variant — see open question OQ1 for visual disambiguation).
- Clicking a team-event chip opens the event detail modal (not a lead or meeting page).

**Event detail modal:**
- Shows: title, date/time, location, description, attendees (if present), status, and a "Linked lead" indicator (empty or a link to the lead page if the event has a `CRM-HREF`).
- "Edit" button opens the same form fields populated with current values. Save submits PUT `/api/calendar/events/[uid]`.
- "Delete" button asks for confirmation, then submits DELETE `/api/calendar/events/[uid]`. On success the modal closes and the chip disappears from the grid.

**Link-to-lead claim flow:**
- Inside the event detail modal, when the event has no linked lead, a "Link to lead" section shows a lead search combobox (same free-text combobox pattern used elsewhere in the CRM).
- The user searches by lead name or organizer name and picks one result.
- Confirming creates a `crm_meetings` row for that lead (via a new server action or API route) and patches the Nextcloud event directly via CalDAV PUT to write `CATEGORIES:crm-meeting` and `URL:<CRM-HREF>` — this direct PUT path is required because n8n silently discards the CATEGORIES field.
- After success, the detail modal shows the linked lead's name as a clickable link.
- If either the DB insert or the CalDAV PATCH fails, the user sees an error and the link is not saved.

---

## Flow / State Diagram

### Create Event Flow

```
Calendar page
  │
  ├─ [Create event button] ──► EventFormModal (open)
  │                               │
  │                           User fills form
  │                               │
  │                           [Submit]
  │                               ├─ POST /api/calendar/events ──► n8n ──► Nextcloud
  │                               │     success → modal closes, grid refreshes
  │                               │     error   → inline error shown, form stays open
  │                               │
  │                           [Cancel] → modal closes, no changes
```

### Calendar Grid — Team Event Rendering

```
GET /calendar (page load)
  │
  ├─ Existing CRM data: meetings, followUps, goLives, eventStarts (from Drizzle)
  │
  └─ NEW: GET /api/calendar/events (Nextcloud events in range)
           │
           └─ filter type === 'team-event'
                    │
                    └─ merge into display list as CalendarEntry { type: 'team-event', ... }
                             │
                             └─ render purple chip in grid cell

User clicks purple chip
  └─ EventDetailModal (open, populated with event data)
```

### Event Detail Modal — States

```
EventDetailModal
  │
  ├─ [Read state] shows title, date/time, location, description, attendees, status, linked lead
  │     │
  │     ├─ [Edit] ──► EditFormModal (pre-populated) ──► PUT /api/calendar/events/[uid]
  │     │                    success → modal updates, grid chip updates
  │     │                    error   → inline error shown
  │     │
  │     ├─ [Delete] ──► confirm dialog ──► DELETE /api/calendar/events/[uid]
  │     │                    success → modal closes, chip removed from grid
  │     │                    error   → inline error shown
  │     │
  │     └─ [Link to lead] section (only when no linked lead)
  │               │
  │               └─ LeadCombobox search ──► user picks lead ──► [Confirm link]
  │                         │
  │                         ├─ POST /api/calendar/events/[uid]/link
  │                         │     server: INSERT crm_meetings + CalDAV PUT (direct, not n8n)
  │                         │     success → modal shows linked lead name + link
  │                         │     error   → inline error, no partial state saved
  │                         │
  │                         └─ [Cancel] → combobox cleared, no changes
```

### Link-to-Lead Server Path

```
POST /api/calendar/events/[uid]/link
  │
  ├─ 1. Validate session + body (leadId)
  │
  ├─ 2. Fetch lead record (name, ownerId)
  │
  ├─ 3. INSERT crm_meetings (leadId, title, startAt from event, uid via updateMeetingNextcloudUid)
  │       └─ using existing createMeeting() → then updateMeetingNextcloudUid(meetingId, uid)
  │
  ├─ 4. CalDAV PUT to Nextcloud (direct, bypasses n8n)
  │       └─ patches CATEGORIES:crm-meeting and URL:/leads/<leadId>
  │          uses basicAuthHeader() + calendarCollectionUrl() from constants.ts
  │          builds full ICS from existing event data + new CATEGORIES + CRM-HREF in DESCRIPTION
  │
  └─ 5. Return { success: true, leadId, meetingId } or error(502)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC1 — Create event button visible on calendar page**
A "Create event" button appears in the calendar page header for all authenticated users.
`proven by:` E2E scenario: `calendar-event-form.e2e.ts` — navigate to `/calendar`, assert button presence (self-skips without auth fixture; written with skip guard per existing pattern).
`strategy:` Hybrid — unit: DOM structure assertable; e2e: self-skipping known-gap pending shared auth fixture.

**AC2 — EventFormModal fields present and submittable**
Opening the create-event form shows all required fields (title, date, start time, end time, all-day toggle, location, description, status). All-day toggle hides time fields. Submitting a valid form posts to `POST /api/calendar/events` with `categories: "team-event"` and `source: "sales-crm"` in the payload.
`proven by:` Unit: `src/tests/calendar-event-form.spec.ts` — Zod schema validation for required fields + payload shape. E2e: `calendar-event-form.e2e.ts` (self-skipping).
`strategy:` Hybrid — Zod schema unit test Fully-Automated; UI interaction e2e self-skipping known-gap.

**AC3 — Team events fetched and merged on calendar page load**
On calendar page load, `GET /api/calendar/events` is called with the current date range and events with `type === 'team-event'` are merged into the display list alongside CRM-sourced entries.
`proven by:` Unit: `src/tests/calendar-merge.spec.ts` — tests the merge logic (pure function) that combines CRM entries + Nextcloud entries into a unified display list.
`strategy:` Fully-Automated — merge logic is a pure function, no live DB or network required.

**AC4 — Team-event chips render in the calendar grid**
Team events render as chips with the purple color `#8b5cf6` in their grid cell, visually distinct from meeting chips (blue), follow-up dots (amber), go-live chips (green), and event-start chips.
`proven by:` E2e: `calendar-event-form.e2e.ts` chip color assertion (self-skipping known-gap). Unit: `CalendarEntry` type union includes `'team-event'` variant — enforced by TypeScript compile.
`strategy:` Hybrid — TypeScript compile Fully-Automated; chip color e2e self-skipping known-gap.

**AC5 — Clicking a team-event chip opens the event detail modal**
Clicking a team-event chip in the calendar grid opens `EventDetailModal` populated with the event's title, date/time, location, description, status, and linked-lead indicator.
`proven by:` E2e: `calendar-event-form.e2e.ts` click-to-modal assertion (self-skipping known-gap).
`strategy:` Hybrid — modal open/field population is an e2e concern; self-skipping known-gap.

**AC6 — Edit event submits PUT and updates the grid**
From the event detail modal, editing fields and saving submits `PUT /api/calendar/events/[uid]`. On success, the modal closes and the grid chip reflects updated data.
`proven by:` Unit: `src/tests/calendar-event-api.spec.ts` — tests that the PUT route handler calls `updateEvent()` from `writer.ts` with the correct payload. E2e: self-skipping known-gap.
`strategy:` Hybrid — API handler unit test Fully-Automated; UI round-trip e2e self-skipping known-gap.

**AC7 — Delete event submits DELETE and removes the chip**
From the event detail modal, confirming delete submits `DELETE /api/calendar/events/[uid]`. On success, the modal closes and the chip is removed from the grid.
`proven by:` Unit: `src/tests/calendar-event-api.spec.ts` — tests that the DELETE route handler calls `deleteEvent()` from `writer.ts`. E2e: self-skipping known-gap.
`strategy:` Hybrid — API handler unit test Fully-Automated; UI round-trip e2e self-skipping known-gap.

**AC8 — Link-to-lead creates a crm_meetings row**
Linking a team event to a lead via `POST /api/calendar/events/[uid]/link` inserts a `crm_meetings` row with the correct `leadId`, `title`, `startAt`, and associates the Nextcloud UID via `updateMeetingNextcloudUid`.
`proven by:` Unit: `src/tests/calendar-link-to-lead.spec.ts` — tests the handler logic with mocked DB calls (`.toSQL()` assertion pattern or SKIP_DB-gated).
`strategy:` Hybrid — handler logic unit test Fully-Automated; live-DB integration is a known-gap (same class as existing Hybrid gates).

**AC9 — Link-to-lead patches Nextcloud via direct CalDAV PUT**
The link-to-lead server handler performs a direct CalDAV PUT to Nextcloud (using `basicAuthHeader()` and `calendarCollectionUrl()` from `constants.ts`) that writes `CATEGORIES:crm-meeting` and embeds `CRM-HREF:/leads/<leadId>` as the first line of DESCRIPTION — bypassing n8n because n8n silently discards CATEGORIES.
`proven by:` Unit: `src/tests/calendar-link-to-lead.spec.ts` — mock the `fetch()` call and assert the PUT request includes the correct headers and ICS body with CATEGORIES + CRM-HREF.
`strategy:` Fully-Automated — fetch is mockable in Vitest; no live Nextcloud required for the unit assertion.

**AC10 — Link-to-lead error handling: no partial state**
If the `crm_meetings` INSERT succeeds but the CalDAV PUT fails (non-2xx), the server returns an error response and the client shows an error message. The `crm_meetings` row must be rolled back (or the API must ensure atomicity) so the event is not partially linked.
`proven by:` Unit: `src/tests/calendar-link-to-lead.spec.ts` — test the error branch (mock CalDAV PUT to return 502; assert error propagation and that meetingId is not returned).
`strategy:` Fully-Automated — error branch is unit-testable with mocked fetch.

**AC11 — n8n field-drop known-gap documented**
Fields submitted via the create/edit form that n8n silently discards (CATEGORIES, color, attendees) are documented as known-gaps in the SPEC and noted inline in the form UI (e.g., "Some fields may not appear in all calendar clients"). No form field is hidden solely because n8n drops it — we send the data and document the limitation.
`proven by:` Agent-Probe — manual review of the UI tooltip/hint text and the known-gap note in this SPEC and the task report.
`strategy:` Agent-Probe — documentation check, not automatable.

**AC12 — CalendarEventPayload Zod schema extended**
The Zod schema for the event payload (used by `POST /api/calendar/events` and `PUT /api/calendar/events/[uid]`) includes optional fields for attendees, color, status, and rrule.
`proven by:` Unit: `src/tests/schemas.spec.ts` or a new `src/tests/calendar-schemas.spec.ts` — parse valid and invalid payloads against the updated schema.
`strategy:` Fully-Automated — Zod schema unit tests run without DB or network.

---

## Out Of Scope

- **Recurring event expansion in the grid.** Recurring rules submitted via the form are passed to n8n as RRULE data, but rendering expanded recurrence instances on the calendar grid (beyond what Nextcloud already returns via the CalDAV REPORT) is not in scope for NCAL-4.
- **Attendee management UI.** The form accepts an attendees field but no attendee-invitation email flow or RSVP tracking is built in this phase.
- **Color storage in Nextcloud.** The form includes a color picker and the value is sent to n8n, but n8n may or may not persist it in the ICS. No workaround for n8n color-drop is in scope.
- **Editing CRM meetings (from Drizzle) in the event detail modal.** Clicking a blue "meeting" chip that originated from `crm_meetings` still routes to the existing `MeetingFormModal` / `/meetings/[id]` page — the new `EventDetailModal` is only for `type: 'team-event'` entries from Nextcloud.
- **Multi-lead linking.** A team event can be linked to at most one CRM lead per claim. Linking to multiple leads or re-linking to a different lead after initial claim is out of scope.
- **Attendees rendered as external contact profiles.** Attendee data from the ICS is displayed as plain text (name/email string); no lookup against CRM contacts is performed.
- **n8n CATEGORIES fix.** The known backlog item for n8n silently discarding CATEGORIES (`process/features/calendar/backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`) is NOT resolved in this phase — the direct CalDAV PUT in the link-to-lead path is the workaround for that specific case.

---

## Constraints

1. **n8n body format.** All event creates/updates sent via n8n must use Manila-local date/time fields via `toManilaDateTime()` (UTC+8 fixed offset) — NOT raw ISO 8601 UTC. This is a hard constraint inherited from NCAL-2.
2. **Direct CalDAV PUT for link-to-lead patch only.** The direct CalDAV PUT (bypassing n8n) is scoped exclusively to the link-to-lead CATEGORIES+URL patch. All other create/update/delete operations continue to route through n8n webhooks.
3. **Credentials never client-visible.** `NEXTCLOUD_APP_PASSWORD`, `N8N_WEBHOOK_SECRET`, and all other env secrets must never appear in any client response, error message, or log line.
4. **Svelte 5 runes only.** All new UI components use `$state`, `$derived`, `$effect` — no Svelte 4 stores.
5. **Server-side DB access only.** All Drizzle queries (including `createMeeting()` / `updateMeetingNextcloudUid()`) execute in `+server.ts` or `+page.server.ts` — never imported into `.svelte` client scripts.
6. **Form validation pattern.** Client-side validation uses Zod `safeParse()` + raw `fetch()` POST/PUT — Superforms is not used (broken transitive dependency in this repo).
7. **E2e specs must include self-skip guard.** Any new Playwright e2e spec that navigates to a protected route must guard with `test.skip()` per the existing pattern (no shared auth fixture exists yet).
8. **`crm_meetings` uid wiring.** `createMeeting()` does not accept `nextcloudUid` on insert — the UID must be written afterward via `updateMeetingNextcloudUid(meetingId, uid)`. The link-to-lead handler must follow this two-step pattern.
9. **n8n CATEGORIES limitation is a known-gap, not a blocker.** The form may include attendees, color, and rrule fields even though n8n may discard some; the UI must note the limitation and the SPEC scores it as a documented known-gap (AC11).

---

## Open Questions

**OQ1 (product decision — user):** The existing CAL-2 "Event Start" chips already use purple (`#8b5cf6`). Team events are also specified as purple. Are two purple chip types visually acceptable, or should one color be changed? Recommend: differentiate by label text ("Event" vs. "Start") and optionally use a slightly different shade or chip border for team events. This decision should be locked before visual implementation begins.

*Recommendation:* Document as a known-gap if the product owner is unavailable; implement team events as `#7c3aed` (one shade darker) with a label "Team event" to allow visual distinction, and revisit with the product owner post-ship.

**OQ2 (scope question — user):** Should the "Link to lead" flow also link the event to a specific meeting organizer (from `crm_organizers`), or is linking to the lead record sufficient for NCAL-4? The `crm_meetings` table has an `organizerId` FK. Recommend: link to lead only for NCAL-4; organizer pre-fill is handled by the existing "meeting-organizer-prefill" plan.

*Recommendation:* Link to lead only. Mark organizer field as optional/null in the new `crm_meetings` insert. No blocker.

**OQ3 (technical — engineering):** The link-to-lead path performs a DB insert and then a CalDAV PUT as two non-atomic operations. If the CalDAV PUT fails after a successful insert, how should the server respond? Options: (a) roll back the DB insert (requires a transaction wrapper or a follow-up delete), (b) leave the DB row and retry CalDAV asynchronously, (c) leave the DB row and return a partial-success response so the client can retry. AC10 specifies "no partial state" — option (a) is recommended. Confirm before PLAN begins.

*Recommendation:* Wrap the two operations: if CalDAV PUT fails, delete the just-inserted `crm_meetings` row before returning the error. This is clean-enough atomicity for this use case without a full transaction.

---

## Background / Research Findings

The following findings from the task prompt informed these requirements:

- **Calendar grid only reads Drizzle today.** The `/calendar` page load currently assembles its display list from `crm_meetings`, follow-up dates, go-live dates, and event-start dates — all from the Drizzle DB. No call to `GET /api/calendar/events` is made on the page. Adding team-event rendering requires the page server to call the API and merge the results (AC3).

- **`CalendarEntry` type union needs a `'team-event'` variant.** `src/lib/types/index.ts` defines the union that drives grid rendering; a `'team-event'` variant must be added alongside the existing variants (AC4).

- **`CalendarEventPayload` does not include attendees, color, status, or rrule.** The write client in `writer.ts` was built for basic event create/update. These fields need to be added to the Zod schema and payload builder, even though n8n may silently discard some (AC12, OQ-field-drop).

- **No direct CalDAV PUT exists in `src/lib/caldav/writer.ts`.** All writes go through n8n webhooks. n8n silently discards `CATEGORIES` (documented in `backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`). A direct CalDAV PUT using `basicAuthHeader()` and `calendarCollectionUrl()` from `constants.ts` is needed for the link-to-lead CATEGORIES+URL patch (AC9).

- **`createMeeting()` two-step UID wiring.** The existing meeting creation API writes `nextcloudUid` as a follow-up step via `updateMeetingNextcloudUid(id, uid)` — the initial insert does not accept it. The link-to-lead handler must follow this pattern (Constraint 8).

- **`GET /api/calendar/events` already returns `type: 'team-event'`.** The NCAL-1 parser maps `CATEGORIES: team-event` to the `type` field. No parser changes are required for team-event ingestion — only the calendar page needs to call the API and consume the results.

- **UI reference patterns.** `MeetingFormModal.svelte` and `Modal.svelte` are the established modal/form component patterns. `ComboboxFreetext.svelte` (from `ux-enhancement`) is the lead-search input reference for the link-to-lead picker.

- **n8n field-drop known-gaps (pre-accepted).** Attendees, color, and rrule may be sent in the payload but n8n does not guarantee writing them to the ICS. These are documented as known-gaps per the existing pattern rather than blocking the form fields.
