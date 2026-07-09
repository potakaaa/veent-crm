# Calendar Feature Guide

Last updated: 2026-07-08

## Status

Code-complete across all shipped plans. EVL green. e2e gates self-skip pending the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

NCAL-2 CalDAV write client: ✅ VERIFIED 08-07-26 — POST/PUT/DELETE calendar events via n8n webhooks; live round-trip confirmed.

## What Is Implemented

### CAL-1 — Base calendar (`completed/calendar_01-07-26/`)

- `/calendar` route with month/week grid
- Follow-up dots, go-live milestone chips, meeting chips
- `navigate(patch)` helper in `+page.svelte` — merges URL params via `goto()`

### CAL-2 — Dual calendar markers (PR #207, `cal-2-two-calendar-markers_06-07-26`)

- Dual entry markers per live lead: event date + color legend
- `buildEventStartWhereClause` and `buildGoLiveWhereClause` introduced to `leads.ts`

### CAL-3 — Owner filter (PR #208, `completed/cal-3-owner-filter_06-07-26/`)

- Reps see only their own leads' follow-ups, go-live dates, and event-start dates. No filter control is shown to reps.
- Managers (`role === 'manager' || role === 'super_manager'`) see all reps by default and can narrow to one rep via a `?repId=<uuid>` combobox.
- Meetings are never filtered — always team-wide.

## Owner Filter Architecture (CAL-3)

### URL param

`?repId=<uuid>` — present when a manager has selected a specific rep. Absent means "all reps" (default manager view).

The `navigate({ repId })` calendar helper (in `+page.svelte`) is used to set/clear `?repId` while preserving the current `view` and `date` params. Passing `repId: undefined` clears the filter.

### Server-side trust boundary (`+page.server.ts`)

```ts
const isManager = role === 'manager' || role === 'super_manager';
const filterRepId = isManager ? (url.searchParams.get('repId') ?? undefined) : undefined;
```

A rep who hand-crafts `?repId=<other-uuid>` is ignored — `filterRepId` is undefined for any non-manager. Defense-in-depth: `filterRepId` is also ignored inside each query function when `role === 'rep'`.

### D1 — Uniform owner-scope rule (query layer, `leads.ts`)

| Caller case | WHERE predicate added |
|---|---|
| `role === 'rep'` | `eq(crm_leads.ownerId, userId)` — strict own leads only |
| manager, no `filterRepId` | none — team-wide (no owner predicate) |
| manager, `filterRepId` set | `eq(crm_leads.ownerId, filterRepId)` — that rep only |

This rule is applied consistently in:
- `buildFollowUpsRangeLeadConditions(userId, role, filterRepId?)`
- `buildGoLiveWhereClause(userId, role, filterRepId?)`
- `buildEventStartWhereClause(userId, role, filterRepId?)`

### Changed query function signatures (`leads.ts`)

All three changes are additive with backward-compatible defaults:

```ts
getFollowUpsInRange(userId, rangeStart, rangeEnd, role: Role = 'rep', filterRepId?: string)
getGoLiveDatesInRange(rangeStart, rangeEnd, userId, role, filterRepId?: string)
getEventDatesInRange(rangeStart, rangeEnd, userId, role, filterRepId?: string)
```

Existing callers that omit `role`/`filterRepId` retain the strict-owner `rep` behavior unchanged.

### Page data contract (`/calendar`)

```ts
{
  // ... existing cal-1/cal-2 fields ...
  activeReps: { id: string; name: string }[];  // empty for reps
  filterRepId: string | null;                  // null = no filter active
  isManager: boolean;
  meId: string;
}
```

### Combobox UI (`+page.svelte`)

Placed in a `{#if data.isManager}` block between the nav-controls row and the legend row. Uses `Popover` + `Command` components (already in repo). Label shows:
- "All reps" — no filter active
- "Mine" — `filterRepId === data.meId`
- rep name — specific rep selected

`Quick filters` group: Mine (`navigate({ repId: data.meId })`), All reps (`navigate({ repId: undefined })`).

### NCAL-1 — CalDAV read client (`completed/ncal-1-caldav-reader_08-07-26/`)

- `src/lib/caldav/reader.ts` — `fetchCalendarReport({ start, end })` sends CalDAV REPORT, extracts `.ics` blobs via `fast-xml-parser`
- `src/lib/caldav/parser.ts` — `parseIcsToEvents()` + `extractCrmHref()` (reads `CRM-HREF:` from DESCRIPTION for `event.url`)
- `GET /api/calendar/events` — session-gated; returns `CalendarEvent[]` JSON
- Live Nextcloud round-trip confirmed; 360 unit tests green at verification

### NCAL-2 — CalDAV write client (`completed/ncal-2-caldav-write_08-07-26/`)

- `src/lib/caldav/writer.ts` — `createEvent` / `updateEvent` / `deleteEvent`; POSTs to n8n webhooks with `x-webhook-secret`
- **n8n body format:** n8n expects Manila-local date/time (`toManilaDateTime` UTC+8 fixed offset → `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`), NOT ISO 8601 UTC. `toN8nBody(payload)` assembles the final body.
- `POST /api/calendar/events` — session-gated create; returns `{ success: true, uid }`
- `PUT /api/calendar/events/[uid]` — session-gated update; returns `{ success: true }`
- `DELETE /api/calendar/events/[uid]` — session-gated delete; returns `{ success: true }`
- `CRM-HREF:/leads/<id>` embedded as first DESCRIPTION line when `leadHref` supplied; `extractCrmHref()` strips it on read-back
- 3 new env vars: `N8N_CALENDAR_WEBHOOK_URL`, `N8N_CALENDAR_DELETE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`
- 544 unit tests green; live round-trip confirmed; known-gaps: AC7/AC8/AC9-route (pre-accepted shared auth fixture), n8n drops CATEGORIES (non-blocking, see `backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`)

## Known Gaps (Pre-Accepted)

All e2e render/interaction acceptance criteria (AC2/AC4/AC6/AC7/AC9/AC11) are blocked by the missing shared Playwright authenticated-session fixture. Tracked at:
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

Same pre-accepted known-gap as reminders and ux-enhancement.

## Key Files

| File | Role |
|---|---|
| `src/routes/calendar/+page.server.ts` | Load: auth guard, isManager, filterRepId trust boundary, 3 lead queries + meetings |
| `src/routes/calendar/+page.svelte` | Grid rendering, month/week toggle, owner-filter combobox (manager only) |
| `src/lib/server/db/leads.ts` | `getFollowUpsInRange`, `getGoLiveDatesInRange`, `getEventDatesInRange`, `buildGoLiveWhereClause`, `buildEventStartWhereClause`, `buildFollowUpsRangeLeadConditions` |
| `src/lib/server/db/meetings.ts` | `listAllMeetings` — no owner filter, always team-wide |
| `src/tests/calendar-db.spec.ts` | DB-free `.toSQL()` assertions for CAL-2 and CAL-3 scoping |
| `src/lib/caldav/reader.ts` | CalDAV REPORT fetcher (NCAL-1) |
| `src/lib/caldav/parser.ts` | ICS → CalendarEvent[] parser; `extractCrmHref()` for `CRM-HREF:` (NCAL-1/NCAL-2) |
| `src/lib/caldav/writer.ts` | n8n webhook caller (`createEvent`/`updateEvent`/`deleteEvent`); Manila-local body format (NCAL-2) |
| `src/lib/caldav/constants.ts` | CalDAV + n8n env accessors (NCAL-1/NCAL-2) |
| `src/routes/api/calendar/events/+server.ts` | GET (read CalDAV) + POST (create via n8n) |
| `src/routes/api/calendar/events/[uid]/+server.ts` | PUT (update via n8n) + DELETE (delete via n8n) |

## Plans

| Plan | Status |
|---|---|
| `completed/calendar_01-07-26/` | CAL-1 — complete |
| `completed/cal-3-owner-filter_06-07-26/` | CAL-3 — code-complete, EVL green |
| `completed/ncal-1-caldav-reader_08-07-26/` | NCAL-1 — ✅ VERIFIED |
| `completed/ncal-2-caldav-write_08-07-26/` | NCAL-2 — ✅ VERIFIED |
| `active/cal-2-two-calendar-markers_06-07-26/` | CAL-2 — check status; PR #207 merged |
| `active/calendar-golive-events_06-07-26/` | go-live events — check status |
