---
name: spec:ncal-3-crm-sync
description: SPEC for NCAL-3 — auto-sync CRM calendar records (meetings, go-live dates, event-start dates) to Nextcloud via n8n webhooks, with a manual backfill trigger UI (GitHub #269)
date: 08-07-26
feature: calendar
---

# NCAL-3 — CRM Calendar Sync SPEC

**Date:** 08-07-26
**Branch:** feat/ncal-2-caldav-write-client (expected: feat/ncal-3-crm-sync)
**GitHub:** #269

---

## Summary

Right now the CRM can write individual Nextcloud calendar events through the NCAL-2 write client, but nothing calls that client automatically. When a rep creates a meeting, sets a go-live date, or records an event-start date on a lead, those dates never reach the shared Nextcloud team calendar. NCAL-3 wires the three CRM mutation surfaces — meeting create/edit/delete, lead go-live date, and lead event-start date — so that each write automatically pushes or removes a corresponding Nextcloud event via the existing n8n webhook. A new UID storage layer (schema columns) lets the CRM track which Nextcloud events it has created, so future edits update the right record. A manual "Sync to Nextcloud" button on the meeting detail page and the lead detail page gives users a way to force a push for records that existed before NCAL-3 was deployed (backfill path). Sync failures are silent from the user's perspective — they do not block saves — so the daily workflow is never disrupted by a Nextcloud outage.

---

## User Stories / Jobs To Be Done

**US-1 — Meeting auto-sync:** As a CRM user, when I create, edit, or delete a meeting, I want the change to automatically appear on the shared Nextcloud team calendar, so that my team sees current meeting data without me doing any extra step.

**US-2 — Go-live date auto-sync:** As a CRM user, when I set or change a lead's go-live date (Ticket Sale Start), I want that milestone event to automatically appear on the Nextcloud team calendar, so that the team can see sales deadlines alongside meetings.

**US-3 — Event-start date auto-sync:** As a CRM user, when I set or change a lead's event-start date (Event Date), I want that milestone event to automatically appear on the Nextcloud team calendar, so that the team knows when the client's actual event happens.

**US-4 — Manual backfill trigger:** As a CRM user, when I'm looking at a meeting or a lead that was created before the auto-sync was turned on, I want to press a "Sync to Nextcloud" button to push it to the calendar now, so that I don't have to recreate records.

**US-5 — Sync failure does not block saves:** As a CRM user, if the Nextcloud calendar is unreachable at the moment I save a meeting or lead, I want my save to still succeed and the failure to be handled silently (logged, not surfaced), so that a calendar outage never prevents me from doing my job.

---

## What The User Wants (Behavioral Outcomes)

**Meeting sync:**
- Creating a meeting through the CRM produces a new Nextcloud calendar event with the meeting title, start time, a synthesized end time (+1 hour from start), venue (location field), the lead deep-link in description, and the meeting's own deep-link in description. The returned Nextcloud event UID is stored on the `crm_meetings` row.
- Editing a meeting (title, time, venue, notes) updates the corresponding Nextcloud event in place. If for some reason the stored UID is missing, editing falls back to creating a new event and storing the returned UID.
- Soft-deleting a meeting (setting `deletedAt`) removes the corresponding Nextcloud event if a UID is stored.

**Lead date sync — go-live date:**
- Setting or changing a lead's go-live date creates (or updates, if a UID already exists) an all-day Nextcloud event titled "[Lead/Organizer name] — Ticket Sale Start" on that calendar date.
- Clearing a lead's go-live date removes the corresponding Nextcloud event if a UID is stored.

**Lead date sync — event-start date:**
- Setting or changing a lead's event-start date creates (or updates, if a UID already exists) a separate all-day Nextcloud event titled "[Lead/Organizer name] — Event Date" on that calendar date.
- Clearing a lead's event-start date removes the corresponding Nextcloud event if a UID is stored.

**All-day date events:**
- Go-live and event-start dates are wall-clock `YYYY-MM-DD` values (no time). They are treated as Manila midnight (Asia/Manila, UTC+8), so `YYYY-MM-DD 00:00 +08:00` is the start; `YYYY-MM-DD 23:59:59 +08:00` is the end (full calendar day). This matches how team members in Manila perceive the date.

**Manual sync button:**
- Meeting detail page (`/meetings/[id]`) shows a "Sync to Nextcloud" button. Pressing it fires a sync for that meeting regardless of whether a UID is already stored. If a UID exists, it updates; if not, it creates.
- Lead detail page (`/leads/[id]`) shows a "Sync to Nextcloud" button in the dates section. Pressing it fires a sync for both the go-live date and event-start date (if each is set). Missing dates are skipped silently.
- The button shows a loading spinner while the request is in flight and a brief success or failure indicator after.

**Sync failures:**
- Auto-sync failures (triggered during create/edit/delete) do not surface to the user. The save completes normally. The failure is logged server-side.
- Manual sync failures (button press) do surface a brief error message ("Calendar sync failed — try again") so the user knows to retry.

**No sync for empty / null dates:**
- No Nextcloud event is created for a null go-live date or null event-start date. Saving a lead with no dates set triggers no calendar call.

---

## Flow / State Diagram

### Auto-sync flow (meeting create example; edit/delete analogous)

```
User submits meeting form
        │
        ▼
POST /api/meetings
        │
        ▼
createMeeting() — DB write → crm_meetings row inserted
        │
        ▼
[fire-and-forget async]
caldav/writer.ts createEvent(payload)
        │
        ├─── n8n 2xx ──────────────────► store returned UID in crm_meetings.nextcloud_uid
        │                                  (UPDATE crm_meetings SET nextcloud_uid = ...)
        │
        └─── n8n non-2xx / timeout ────► log server-side error
                                          (crm_meetings.nextcloud_uid stays null)
        │
        ▼
200 OK to client (sync result NOT included in response)
```

### Auto-sync flow (lead date update)

```
User saves lead with goLiveDate or eventDate changed
        │
        ▼
PATCH /api/leads/[id]  →  updateLead() DB write
        │
        ▼
[fire-and-forget async — per changed date field]

For goLiveDate:
  ├─── date set + no existing UID ──► createEvent() → store UID in crm_leads.nextcloud_go_live_uid
  ├─── date set + UID exists       ──► updateEvent(uid) → UID unchanged
  └─── date cleared + UID exists  ──► deleteEvent(uid) → clear crm_leads.nextcloud_go_live_uid

For eventDate:
  ├─── date set + no existing UID ──► createEvent() → store UID in crm_leads.nextcloud_event_uid
  ├─── date set + UID exists       ──► updateEvent(uid) → UID unchanged
  └─── date cleared + UID exists  ──► deleteEvent(uid) → clear crm_leads.nextcloud_event_uid

All n8n failures → log only; lead save already committed
        │
        ▼
200 OK to client
```

### Manual sync flow (meeting detail button)

```
User clicks "Sync to Nextcloud" on /meetings/[id]
        │
        ▼
POST /api/meetings/[id]/sync  (new session-gated endpoint)
        │
        ├─── meeting.nextcloud_uid exists ──► updateEvent(uid) → 200 OK
        │
        └─── no UID                        ──► createEvent() → store UID → 200 OK
        │
        ├─── n8n non-2xx ────────────────────► 502 { error: "Calendar sync failed" }
        │
        ▼
UI: success badge or error toast
```

### UID state machine (per record)

```
State: NO_UID
  ├─── date/meeting set + sync OK  ──► State: HAS_UID
  └─── date/meeting set + sync fail ──► State: NO_UID (retry on next edit or manual sync)

State: HAS_UID
  ├─── record updated + sync OK   ──► State: HAS_UID (same UID)
  ├─── record deleted + sync OK   ──► State: DELETED (UID cleared from DB)
  ├─── update/delete sync fail    ──► State: HAS_UID (UID kept; Nextcloud may be stale)
  └─── manual sync button         ──► State: HAS_UID (createEvent or updateEvent)
```

---

## Acceptance Criteria (Testable Outcomes)

### Schema — UID storage columns

**AC1:** After the migration runs, `crm_meetings` has a nullable `nextcloud_uid` text column and `crm_leads` has two nullable text columns: `nextcloud_go_live_uid` and `nextcloud_event_uid`. All three default to null.

- `proven by:` `src/tests/schema-ncal3.spec.ts` — Vitest unit test calling `.toSQL()` on a Drizzle select and asserting the columns exist in the schema object; plus a one-time manual check of the applied migration SQL.
- `strategy:` Hybrid (schema shape: Fully-Automated via Drizzle object introspection; apply-and-query: Agent-Probe, pending live-DB CI harness — same known-gap class as NCAL-2)

### Writer integration — meeting sync logic

**AC2:** The meeting sync helper (`buildMeetingPayload`) converts a `crm_meetings` row to a writer payload with: `title` = meeting title or a fallback, `start` = `startAt` as ISO UTC, `end` = `startAt + 1 hour` as ISO UTC, `location` = `venue` if set, `description` including `CRM-HREF:/meetings/[id]` line, `leadHref` = `/leads/[leadId]` if `leadId` is set.

- `proven by:` `src/tests/ncal3-meeting-sync.spec.ts` — Vitest unit test with a sample `crm_meetings` fixture; asserts each output field.
- `strategy:` Fully-Automated

**AC3:** The lead date sync helper (`buildGoLiveDatePayload`) converts a lead's `goLiveDate` (YYYY-MM-DD) to a writer payload with: `title` = "[Organizer name] — Ticket Sale Start" (or "[Lead event name] — Ticket Sale Start" when organizer name is absent), `start` = the date at Manila midnight expressed as ISO UTC (`YYYY-MM-DDT16:00:00Z`, i.e. UTC+8 offset), `end` = same date at Manila 23:59:59 expressed as ISO UTC, `leadHref` = `/leads/[id]`.

- `proven by:` `src/tests/ncal3-lead-sync.spec.ts` — Vitest unit test with fixed date inputs; asserts UTC values exactly.
- `strategy:` Fully-Automated

**AC4:** The lead date sync helper (`buildEventDatePayload`) produces the same shape as AC3 but with title suffix "— Event Date" and uses `eventDate` as the source date.

- `proven by:` same spec file, separate test block.
- `strategy:` Fully-Automated

**AC5:** When a go-live date is set and `nextcloud_go_live_uid` is null, the sync logic calls `createEvent()` and stores the returned UID. When `nextcloud_go_live_uid` already has a value, it calls `updateEvent(uid)`. When the date is cleared and a UID exists, it calls `deleteEvent(uid)` and nulls the column. The same three-branch logic applies symmetrically to `eventDate` / `nextcloud_event_uid`.

- `proven by:` `src/tests/ncal3-lead-sync.spec.ts` — Vitest tests mocking `createEvent`, `updateEvent`, `deleteEvent`; one test per branch per date field (6 total).
- `strategy:` Fully-Automated

### Fire-and-forget — save not blocked by sync failure

**AC6:** When `createEvent()` throws a `CalDavWebhookError`, the meeting create API route still returns a 200 (or 201) response with the new meeting data. The UID column remains null. No error detail from the writer reaches the client response.

- `proven by:` `src/tests/ncal3-meeting-sync.spec.ts` — Vitest unit test that mocks `createEvent` to throw; asserts the route handler returns success and that the response body contains no `CalDavWebhookError` fields.
- `strategy:` Fully-Automated

**AC7:** When a lead save triggers a CalDAV sync failure (either date field), the PATCH response to the client still returns 200 with updated lead data. The two UID columns reflect the outcome (null if the create failed, unchanged if the update failed).

- `proven by:` `src/tests/ncal3-lead-sync.spec.ts` — Vitest unit test.
- `strategy:` Fully-Automated

### Manual sync endpoints

**AC8:** `POST /api/meetings/[id]/sync` without a valid Better Auth session returns 401. With a valid session and no stored UID, it calls `createEvent()` and returns 200 `{ success: true, uid }`. With a valid session and an existing UID, it calls `updateEvent(uid)` and returns 200 `{ success: true }`. If the writer throws, it returns 502 `{ error: "Calendar sync failed" }`.

- `proven by:` `src/tests/ncal3-meeting-sync.spec.ts` — Vitest unit tests for the route handler (session check, create-branch, update-branch, error-branch). Route-level 401 auth gate also confirmed by `e2e/caldav-write.e2e.ts` self-skipping test (pending shared auth fixture).
- `strategy:` Hybrid (unit layer: Fully-Automated; auth gate e2e: Agent-Probe — same known-gap as NCAL-2 AC7)

**AC9:** `POST /api/leads/[id]/sync` without a valid session returns 401. With a valid session, it fires sync for both `goLiveDate` and `eventDate` if set (skipping null dates), returns 200 `{ success: true }` if all attempted syncs succeed, or 502 `{ error: "Calendar sync failed" }` if any sync throws.

- `proven by:` `src/tests/ncal3-lead-sync.spec.ts` — Vitest unit tests for the route handler.
- `strategy:` Hybrid (unit: Fully-Automated; auth gate e2e: Agent-Probe — same known-gap)

### Manual sync UI

**AC10:** The meeting detail page (`/meetings/[id]`) renders a "Sync to Nextcloud" button. Pressing it calls `POST /api/meetings/[id]/sync` and shows a brief success indicator on 200 or an error message on 502.

- `proven by:` `e2e/caldav-write.e2e.ts` — Playwright test; self-skips until shared auth fixture lands (same known-gap as all calendar e2e). Component rendering verified by Agent-Probe (visual inspection of dev build).
- `strategy:` Agent-Probe (known-gap — pre-accepted; same root as NCAL-2 AC7/AC8/AC9)

**AC11:** The lead detail page (`/leads/[id]`) dates section renders a "Sync to Nextcloud" button. Pressing it calls `POST /api/leads/[id]/sync` and shows a brief success or error indicator.

- `proven by:` `e2e/ncal3-lead-sync.e2e.ts` — Playwright test; self-skips until shared auth fixture lands.
- `strategy:` Agent-Probe (same known-gap)

### No sync for null dates

**AC12:** When a lead is saved with both `goLiveDate` and `eventDate` null, no CalDAV call is made. No UID columns are written.

- `proven by:` `src/tests/ncal3-lead-sync.spec.ts` — Vitest unit test; asserts neither `createEvent` nor `updateEvent` nor `deleteEvent` was called.
- `strategy:` Fully-Automated

---

## Out Of Scope

- **NCAL-1 read path changes** — the calendar page that displays Nextcloud events is not modified in this phase. Read-side display of CRM-synced records is unchanged.
- **Backfill script / bulk migration** — no automated script to push all existing meetings or lead dates to Nextcloud. The manual sync button covers individual record backfill on demand.
- **Recurrence / RRULE** — meeting and date events created by NCAL-3 are single-occurrence only. Recurring events are not in scope.
- **Sync status dashboard** — no admin page showing which records are synced vs. not. UID presence/absence in the database is the only tracking mechanism.
- **Conflict resolution** — if a Nextcloud event was manually modified outside the CRM, NCAL-3 overwrites it on the next CRM edit. No merge or conflict detection.
- **n8n workflow configuration** — the n8n side (what the webhook does) is maintained outside the CRM codebase and is not changed by NCAL-3.
- **Role-based write restriction** — all session-authenticated users may trigger sync. Role-gating (e.g. managers only) is deferred to a future phase if product decides it is needed.
- **Sync on lead stage changes** — only explicit date field changes trigger a sync. Moving a lead between pipeline stages does not.
- **Event attendee sync** — meeting attendee records (`crm_meeting_attendees`) are not pushed to the Nextcloud event as ATTENDEE iCal properties.
- **CATEGORIES field** — known n8n limitation: CATEGORIES sent in the webhook payload are silently dropped by n8n and do not appear in the stored ICS. This is a pre-accepted non-blocking known-gap inherited from NCAL-2 (see `process/features/calendar/backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`).
- **Drizzle migration journal drift fix** — the unregistered `0014_agreements_fields.sql` stray file must be reconciled before generating the NCAL-3 migration. That reconciliation is a prerequisite step, not a scope item for the SPEC.

---

## Constraints

1. **Sync must not block saves** — CalDAV calls are fire-and-forget for auto-sync. The meeting create/edit/delete and the lead PATCH routes must respond to the client before (or without waiting for) the n8n webhook response. A Nextcloud or n8n outage must never cause a 5xx on a meeting or lead save.
2. **Manual sync failures are surfaced; auto-sync failures are not** — the two failure modes are intentionally different. Manual sync (button press) must return 502 on n8n failure so the UI can show a retry message. Auto-sync errors are logged server-side only.
3. **Two separate UID columns on `crm_leads`** — go-live date and event-start date are independent Nextcloud events and must each have their own UID column (`nextcloud_go_live_uid`, `nextcloud_event_uid`).
4. **One UID column on `crm_meetings`** — each meeting maps to exactly one Nextcloud event. `crm_meetings.nextcloud_uid` is nullable text.
5. **All-day dates use Manila midnight (UTC+8)** — `goLiveDate` and `eventDate` are `YYYY-MM-DD` wall-clock values with no time component. They MUST be converted to `YYYY-MM-DDT16:00:00Z` (Manila midnight in UTC) for the event start, and `YYYY-MM-DDT15:59:59Z` the next day for the event end (full Manila calendar day). Do not use `T00:00:00Z` (which would fall on the wrong calendar day in Manila).
6. **Meeting end = start + 1 hour** — `crm_meetings` has no `endAt` column. The writer requires `end > start`. The synthesized end is exactly 1 hour after `startAt`.
7. **Server-only module boundary** — `src/lib/caldav/writer.ts` is server-only. Sync logic lives in API route handlers or server-side helper modules, never in `.svelte` client code.
8. **`$env/dynamic/private` for env vars** — not `process.env`. Consistent with existing CalDAV and project conventions.
9. **Secret never reaches client** — `N8N_WEBHOOK_SECRET` must not appear in any response body, error message surfaced to the client, or SvelteKit client-side handler.
10. **Drizzle migration prerequisite** — before generating the NCAL-3 migration (idx 33), the unregistered `0014_agreements_fields.sql` stray file must be reconciled with the journal. This is a deploy-time precondition, not a scope change.
11. **Soft-delete triggers remove** — when a meeting's `deletedAt` is set (soft delete), the sync logic treats this as a delete event and calls `deleteEvent(uid)` if a UID is stored.
12. **n8n env vars already present** — `N8N_CALENDAR_WEBHOOK_URL`, `N8N_CALENDAR_DELETE_WEBHOOK_URL`, and `N8N_WEBHOOK_SECRET` are already in the environment from NCAL-2. No new env vars are added by NCAL-3.

---

## Open Questions

None — all five design questions from the research phase have been resolved as locked decisions above:

| # | Design question | Decision |
|---|---|---|
| DQ-1 | UID storage / dual-event per lead | Two separate nullable text columns on `crm_leads` (`nextcloud_go_live_uid`, `nextcloud_event_uid`); one nullable text column on `crm_meetings` (`nextcloud_uid`) |
| DQ-2 | Meeting end-time (no `endAt` column) | Synthesized as `startAt + 1 hour` — no product content is associated with a specific duration, and 1 hour is a safe default that renders well on any calendar |
| DQ-3 | Auto vs manual trigger | Both are in scope: auto-sync fires fire-and-forget on every mutation; manual "Sync to Nextcloud" button is available on meeting detail and lead detail pages for backfill |
| DQ-4 | All-day date to ISO conversion | Manila midnight (UTC+8): `goLiveDate`/`eventDate` YYYY-MM-DD → start: `YYYY-MM-DDT16:00:00Z`, end: `YYYY-MM-DDT15:59:59Z` (next day in UTC, equating to midnight-to-midnight Manila time) |
| DQ-5 | Sync failure behaviour | Auto-sync: fire-and-forget (log only, save always succeeds). Manual sync: 502 surfaced so the user can retry |

---

## Background / Research Findings

### What NCAL-2 provides (foundation)

`src/lib/caldav/writer.ts` is complete and verified against live Nextcloud (NCAL-2, 2026-07-08). It exports `createEvent(payload)`, `updateEvent(payload)`, and `deleteEvent(uid)`. The `toN8nBody()` helper converts UTC ISO strings to Manila-local fields that n8n expects. `CalDavWebhookError` is thrown on any n8n non-2xx. The three n8n env vars (`N8N_CALENDAR_WEBHOOK_URL`, `N8N_CALENDAR_DELETE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`) are already wired.

### What is not yet wired (NCAL-3 scope)

None of the CRM mutation paths (meeting create/edit/delete, lead PATCH for `goLiveDate`/`eventDate`) call `writer.ts`. No schema columns store Nextcloud UIDs. No sync buttons exist in the UI.

### Schema findings

- `crm_meetings` columns as of 2026-07-08: `id, leadId, organizerId, leadOrganizerId, startAt (notNull, tz), meetingUrl, venue (nullable), notes, outcome, deletedAt, dayReminderSentAt, hourReminderSentAt, createdAt, updatedAt`. No UID column.
- `crm_leads` relevant columns: `eventDate: date('event_date')` (nullable, wall-clock), `goLiveDate: date('go_live_date')` (nullable, wall-clock). No UID columns.
- Next migration idx: 33, file `0033_*`. Drizzle journal drift (`0014_agreements_fields.sql` unregistered stray) must be reconciled before `bun run db:generate`.

### Mutation surfaces (all currently CalDAV-dark)

- Meeting create: `POST /api/meetings` → `createMeeting()` in `src/lib/server/db/meetings.ts`
- Meeting update: `PATCH /api/meetings/[id]` → `updateMeeting()`
- Meeting delete: `DELETE /api/meetings/[id]` → `softDeleteMeeting()`
- Lead date update: `PATCH /api/leads/[id]` → `updateLead()` in `src/lib/server/db/leads.ts`; both `goLiveDate` and `eventDate` pass through here

### In-flight read-side plans (share `leads.ts` blast radius)

- `process/features/calendar/active/cal-2-two-calendar-markers_06-07-26/` — purple "Event Start" chips on calendar grid (display only)
- `process/features/calendar/active/calendar-golive-events_06-07-26/` — green "Go-live" chips on calendar grid (display only)

These plans touch the calendar display layer, not the write/sync layer. NCAL-3 touches the lead and meeting write layer. Blast radius overlap: `crm_leads` schema columns and `src/lib/server/db/leads.ts`. Coordinate to ensure new UID columns do not conflict with column additions from those plans.

### Test context

- Unit tests: Vitest (`bun run test:unit`). `vi.mock('$env/dynamic/private', ...)` pattern established.
- ICS fixture files: `src/tests/fixtures/*.ics` (established by NCAL-1).
- e2e: all protected-route Playwright tests self-skip until shared auth fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- No live-CalDAV CI harness: write round-trip verification is a one-time manual Agent-Probe (same class as NCAL-2 AC10 known-gap).

### User brainstorm input (from GitHub #269 and research brief)

- Auto-sync on create/edit/delete for all three record types (meetings, go-live dates, event-start dates)
- Manual sync button for backfill on meeting detail and lead detail pages
- Sync must not crash the meeting/lead save — fire-and-forget for auto-sync
- Manual sync button may surface an error so the user knows to retry
- No new n8n env vars needed (all three already present from NCAL-2)
