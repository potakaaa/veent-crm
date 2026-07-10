---
name: plan:ncal-4-event-ui
description: COMPLEX plan for NCAL-4 — Calendar event form UI, event detail modal, team-event rendering, and link-to-lead claim flow
date: 09-07-26
feature: calendar
---

# NCAL-4 — Calendar Event UI, Event Detail Modal, and Link-to-Lead Claim Flow

**SPEC:** `process/features/calendar/active/ncal-4-event-ui_09-07-26/ncal-4-event-ui_SPEC_09-07-26.md`
**Branch:** `feat/ncal-4-event-ui`
**Date** 09-07-26
**Status** In Progress
**Complexity** COMPLEX

---

## Overview

Four connected capabilities:

1. Type + schema extensions (CalendarEntry `'team-event'` variant, Zod optional fields, `directPatchEvent` in writer.ts)
2. Server-side team-event merge in `+page.server.ts` (CalDAV REPORT call with graceful degradation)
3. UI components: `EventFormModal.svelte` (create/edit) + `EventDetailModal.svelte` (view/edit/delete/link) + page wiring
4. API: new `POST /api/calendar/events/[uid]/link` handler with DB insert + direct CalDAV PUT + rollback

All approach decisions locked from INNOVATE. No creative decisions needed during EXECUTE.

---

## Goals

- CRM users can create team calendar events from `/calendar` without leaving the CRM
- Nextcloud-originated team events (type `'team-event'`) appear as purple chips in the calendar grid
- Clicking a team-event chip opens `EventDetailModal` for view / edit / delete
- The "Link to lead" flow inside `EventDetailModal` ties a team event to a `crm_meetings` row and patches Nextcloud directly via CalDAV PUT (bypassing n8n, which silently drops `CATEGORIES`)

---

## Phase Overview

| Phase | Files touched | Output |
|---|---|---|
| 1 — Type + schema extensions | `types/index.ts`, `zod/schemas.ts`, `caldav/writer.ts` | New type variant + Zod fields + `directPatchEvent` fn |
| 2 — Server-side team-event merge | `routes/calendar/+page.server.ts` | CalDAV REPORT call + `CalendarEntry[]` merge |
| 3 — UI components + page wiring | 2 new `.svelte` files + `+page.svelte` edit | Create/detail modals, purple chips, "Create event" button |
| 4 — Link-to-lead API + tests | New `+server.ts` + 4 test files | `/api/calendar/events/[uid]/link` route + Vitest coverage |

---

## Touchpoints

### Files Modified
- `src/lib/types/index.ts` — extend `CalendarEntry` interface + type union
- `src/lib/zod/schemas.ts` — extend `createCalendarEventSchema` + `updateCalendarEventSchema`
- `src/lib/caldav/writer.ts` — add `directPatchEvent(uid, options)` function
- `src/routes/calendar/+page.server.ts` — add CalDAV REPORT call + merge into `entries`
- `src/routes/calendar/+page.svelte` — "Create event" button + team-event chip rendering + modal wiring

### Files Created
- `src/lib/components/calendar/EventFormModal.svelte` — create/edit form modal
- `src/lib/components/calendar/EventDetailModal.svelte` — view/edit/delete/link modal
- `src/routes/api/calendar/events/[uid]/link/+server.ts` — POST handler for link-to-lead
- `src/tests/calendar-schemas.spec.ts` — Zod schema extension tests (Fully-Automated)
- `src/tests/calendar-merge.spec.ts` — team-event merge function tests (Fully-Automated)
- `src/tests/calendar-link-to-lead.spec.ts` — directPatchEvent + link handler tests (Fully-Automated)
- `src/tests/ncal4-event-ui.spec.ts` — self-skipping Playwright e2e stubs (Known-Gap)

### Files Read (context only, not modified)
- `src/lib/caldav/reader.ts` — `fetchCalendarReport`, `CalDavError`
- `src/lib/caldav/constants.ts` — `calendarCollectionUrl()`, `basicAuthHeader()`
- `src/lib/caldav/parser.ts` — `parseIcsToEvents`
- `src/lib/server/db/meetings.ts` — `createMeeting`, `updateMeetingNextcloudUid`, `softDeleteMeeting`
- `src/lib/components/meetings/MeetingFormModal.svelte` — modal/form reference pattern
- `src/lib/components/ui/combobox-freetext/ComboboxFreetext.svelte` — lead search reference

---

## Public Contracts

### Modified: `CalendarEntry` interface (`src/lib/types/index.ts`)

Before:
```
type: 'meeting' | 'followup' | 'golive' | 'eventstart'
```

After (additive — no existing field removed):
```
type: 'meeting' | 'followup' | 'golive' | 'eventstart' | 'team-event'
uid?: string          // Nextcloud event UID (team-event only)
url?: string          // CRM deep-link extracted from CRM-HREF: (team-event only)
description?: string  // raw description (team-event only)
location?: string     // location field (team-event only)
status?: string       // VEVENT STATUS (team-event only)
categories?: string   // VEVENT CATEGORIES (team-event only)
```

Change is backwards-compatible: existing consumers check `entry.type` before accessing new fields. TypeScript will enforce correct narrowing.

### Modified: Zod schemas (`src/lib/zod/schemas.ts`)

Both `createCalendarEventSchema` and `updateCalendarEventSchema` gain optional fields:
- `attendees?: string[]` (array of email strings)
- `color?: string` (hex color string)
- `status?: string` (confirmed / tentative / cancelled)
- `rrule?: string` (RRULE string, raw)

All new fields are optional — no existing callers break. Fields are passed to n8n body; n8n may silently drop attendees/color/rrule (pre-accepted known-gap, AC11).

### New: `directPatchEvent(uid, options)` in `src/lib/caldav/writer.ts`

```typescript
export async function directPatchEvent(
  uid: string,
  options: { categories: string; leadHref?: string }
): Promise<void>
```

- Server-only. Does a GET `{calendarCollectionUrl()}{uid}.ics` → patch CATEGORIES + DESCRIPTION → PUT back.
- Throws `CalDavWebhookError('Event not found')` on 404 GET.
- Throws `CalDavWebhookError('Calendar service unavailable')` on any other non-2xx (GET or PUT).
- Never surfaces credentials, URL, or upstream response in the thrown message.

### New: `POST /api/calendar/events/[uid]/link`

Route: `src/routes/api/calendar/events/[uid]/link/+server.ts`

Request body: `{ leadId: string }`

Response (200): `{ success: true, meetingId: string }`
Response (400): `{ success: false, errors: { leadId: string[] } }`
Response (401): Unauthorized (no session)
Response (502): CalDAV patch failed (meeting row rolled back)

UID comes from `params.uid` (server-extracted path param). Never from body.

---

## Blast Radius

| Package/Path | Risk class | Change type |
|---|---|---|
| `src/lib/types/index.ts` | Low (additive type union) | Modify |
| `src/lib/zod/schemas.ts` | Low (additive optional fields) | Modify |
| `src/lib/caldav/writer.ts` | Medium (new fn, direct Nextcloud GET+PUT) | Modify |
| `src/routes/calendar/+page.server.ts` | Medium (adds network call with degradation) | Modify |
| `src/routes/calendar/+page.svelte` | Medium (UI change) | Modify |
| `src/lib/components/calendar/EventFormModal.svelte` | Low (new file) | Create |
| `src/lib/components/calendar/EventDetailModal.svelte` | Low (new file) | Create |
| `src/routes/api/calendar/events/[uid]/link/+server.ts` | Medium (new route, DB write + CalDAV) | Create |
| `src/tests/calendar-schemas.spec.ts` | None | Create (test) |
| `src/tests/calendar-merge.spec.ts` | None | Create (test) |
| `src/tests/calendar-link-to-lead.spec.ts` | None | Create (test) |
| `src/tests/ncal4-event-ui.spec.ts` | None | Create (e2e stub) |

**Regression surfaces to protect:** existing `GET /api/calendar/events`, `POST /api/calendar/events`, `PUT/DELETE /api/calendar/events/[uid]`, and the existing `CalendarEntry` consumers in `+page.svelte` (meeting/followup/golive/eventstart chip rendering must not regress).

---

## Implementation Checklist

### Phase 1 — Type + Schema Extensions (no runtime deps)

**Step 1 — Extend `CalendarEntry` interface** (`src/lib/types/index.ts`)

- Locate `interface CalendarEntry` (currently around line 207)
- Change `type` union from `'meeting' | 'followup' | 'golive' | 'eventstart'` to add `'team-event'`
- Add optional fields after `subtitle?`:
  ```
  uid?: string;
  url?: string;
  description?: string;
  location?: string;
  status?: string;
  categories?: string;
  ```
- Run `bun run check` to confirm all existing usages still type-check (narrowing via `entry.type` already guards them)

**Step 2 — Extend Zod schemas** (`src/lib/zod/schemas.ts`)

- Locate `createCalendarEventSchema` (around line 221) and `updateCalendarEventSchema` (around line 238)
- Add to both schemas' `.object({...})` body, after `leadHref`:
  ```
  attendees: z.array(z.string().email()).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  rrule: z.string().optional(),
  ```
- Both schemas already have a `.refine(end > start)` — keep it; the new fields do not affect it
- Export types are re-inferred automatically from `z.infer<typeof ...>`
- Run `bun run check`

**Step 3 — Add `directPatchEvent` to `writer.ts`** (`src/lib/caldav/writer.ts`)

- Add import at top: `import { calendarCollectionUrl, basicAuthHeader } from './constants';`
- Also import from ical.js: `import ICAL from 'ical.js';` (already used in `parser.ts`; check that `writer.ts` can import it directly — if ical.js lacks a default export in the ESM build, use `import * as ICAL from 'ical.js'` matching how `parser.ts` imports it)
- Add the new exported function after `deleteEvent`:

```typescript
/**
 * Directly patches a Nextcloud ICS event via CalDAV GET → mutate → PUT.
 * Used for link-to-lead: writes CATEGORIES and CRM-HREF to DESCRIPTION,
 * bypassing n8n which silently drops CATEGORIES.
 *
 * Throws CalDavWebhookError('Event not found') on 404 GET.
 * Throws CalDavWebhookError (client-safe message) on any other non-2xx.
 * NEVER surfaces credentials in the thrown message.
 */
export async function directPatchEvent(
  uid: string,
  options: { categories: string; leadHref?: string }
): Promise<void> {
  const icsUrl = `${calendarCollectionUrl()}${uid}.ics`;
  const authHeader = basicAuthHeader();

  // Step A: GET the existing ICS
  let getRes: Response;
  try {
    getRes = await fetch(icsUrl, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'text/calendar' },
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE);
  }
  if (getRes.status === 404) throw new CalDavWebhookError('Event not found', 404);
  if (!getRes.ok) throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE, getRes.status);

  const icsText = await getRes.text();

  // Step B: Parse + patch
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevent = comp.getFirstSubcomponent('vevent');
  if (!vevent) throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE);

  vevent.updatePropertyWithValue('categories', options.categories);

  // Rebuild DESCRIPTION: strip existing CRM-HREF: line, prepend new one
  const existingDesc = vevent.getFirstPropertyValue('description') ?? '';
  const strippedDesc = existingDesc
    .split('\n')
    .filter((l: string) => !/^CRM-HREF:/i.test(l.trim()))
    .join('\n')
    .trim();
  const newDesc = options.leadHref
    ? `CRM-HREF:${options.leadHref}${strippedDesc ? `\n${strippedDesc}` : ''}`
    : strippedDesc || undefined;
  if (newDesc !== undefined) {
    vevent.updatePropertyWithValue('description', newDesc);
  } else {
    vevent.removeAllProperties('description');
  }

  const patchedIcs = ICAL.stringify(jcal);

  // Step C: PUT back
  let putRes: Response;
  try {
    putRes = await fetch(icsUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'text/calendar; charset=utf-8'
      },
      body: patchedIcs,
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE);
  }
  if (!putRes.ok) throw new CalDavWebhookError(CLIENT_SAFE_MESSAGE, putRes.status);
}
```

- Verify `CLIENT_SAFE_MESSAGE` constant is already defined in the file (it is, at line 35)
- Run `bun run check`

---

### Phase 2 — Server-side Team-Event Merge

**Step 4 — Add CalDAV REPORT call + merge in `+page.server.ts`** (`src/routes/calendar/+page.server.ts`)

- Add imports at the top:
  ```typescript
  import { fetchCalendarReport } from '$lib/caldav/reader';
  import { parseIcsToEvents } from '$lib/caldav/parser';
  ```
- After the existing `const [followUps, meetings, goLives, eventStarts, activeReps] = await Promise.all([...])` block, add:
  ```typescript
  // Team events from Nextcloud (type: 'team-event') — graceful degradation on error
  let teamEventEntries: CalendarEntry[] = [];
  try {
    const blobs = await fetchCalendarReport({ start, end });
    teamEventEntries = blobs.flatMap((blob) => {
      const events = parseIcsToEvents(blob, { start, end });
      return events
        .filter((e) => e.type === 'team-event')
        .map((e) => ({
          id: `team-event-${e.uid ?? e.id}`,
          type: 'team-event' as const,
          startAt: e.start?.toISOString() ?? new Date().toISOString(),
          title: e.title ?? '(No title)',
          href: e.url ?? '',
          uid: e.uid,
          url: e.url,
          description: e.description,
          location: e.location,
          status: e.status,
          categories: e.categories
        }));
    });
  } catch {
    // Degrade gracefully — calendar still loads without Nextcloud events
    teamEventEntries = [];
  }
  ```
  Note: `fetchCalendarReport` already uses a `AbortSignal.timeout` internally via the underlying HTTP call. If needed, wrap with a 5-second top-level timeout using `Promise.race([fetchCalendarReport({start, end}), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))])` — check `reader.ts` to confirm whether it already has a timeout before adding one.
- Change the `const entries = [...]` merge line to include `...teamEventEntries`:
  ```typescript
  const entries = [
    ...meetingEntries,
    ...followUpEntries,
    ...goLiveEntries,
    ...eventStartEntries,
    ...teamEventEntries
  ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  ```
- Extract the team-event mapping to a pure exported function `mapTeamEvents(events: ParsedEvent[], range: {start: Date; end: Date}): CalendarEntry[]` above the `load` function — this enables unit testing without IO (needed for `calendar-merge.spec.ts`)
- Run `bun run check`

---

### Phase 3 — UI Components

**Step 5 — Create `EventFormModal.svelte`** (`src/lib/components/calendar/EventFormModal.svelte`)

New file. Pattern mirrors `MeetingFormModal.svelte`.

Props interface:
```typescript
export interface EventFormPayload {
  title: string;
  start: string; // ISO datetime
  end: string;   // ISO datetime
  allDay: boolean;
  location?: string;
  description?: string;
  color?: string;
  status?: string; // 'confirmed' | 'tentative' | 'cancelled'
}

let {
  open,
  event = null, // null = create mode; existing CalendarEntry = edit mode
  saving = false,
  onclose,
  onsubmit
}: {
  open: boolean;
  event?: CalendarEntry | null;
  saving?: boolean;
  onclose: () => void;
  onsubmit: (payload: EventFormPayload) => void;
} = $props();
```

Fields to render:
- `title` — `<Input>` required. Field error key: `title`.
- `start` — `<Input type="datetime-local">` required. Field error key: `start`.
- `end` — `<Input type="datetime-local">` required. Field error key: `end`. Must be after `start`.
- `allDay` toggle — `<input type="checkbox">`. When checked: set start time to `00:00`, end time to `23:59` on same date; hide the time portion of the datetime inputs (show only date pickers).
- `location` — `<Input>` optional.
- `description` — `<Textarea>` optional. Add a subtle hint: "Note: some fields may not appear in all calendar clients."
- `color` — `<Input type="color">` optional (hex). Known-gap note: color may be dropped by calendar sync.
- `status` — `<Select>` optional. Options: confirmed, tentative, cancelled.

Validation (client-side, hand-rolled — no Superforms):
- `title` required — error if blank
- `start` required + valid datetime — error if invalid
- `end` required + valid datetime + after start — error: "End must be after start"
- Use `FieldError` + `fieldErrorAttrs` from `$lib/components/ui/field-error`

`$effect` re-seeds fields when `open` changes to `true` (populate from `event` prop if edit mode).

On submit: call `onsubmit(payload)` — parent handles the `fetch` call.

Svelte 5 runes: `$state`, `$derived`, `$effect`.

Uses: `Modal.svelte` wrapper, `Input`, `Label`, `Button`, `Textarea`, `Select`.

**Step 6 — Create `EventDetailModal.svelte`** (`src/lib/components/calendar/EventDetailModal.svelte`)

New file.

Props:
```typescript
let {
  open,
  event,   // CalendarEntry with type === 'team-event'
  saving = false,
  onclose,
  onedit,   // opens EventFormModal in edit mode
  ondelete, // triggers DELETE /api/calendar/events/[uid]
  onlink    // triggers POST /api/calendar/events/[uid]/link
}: {
  open: boolean;
  event: CalendarEntry | null;
  saving?: boolean;
  onclose: () => void;
  onedit: () => void;
  ondelete: (uid: string) => void;
  onlink: (uid: string, leadId: string) => void;
} = $props();
```

Sections to render:
1. **Header** — event title + close button
2. **Details** — date/time (formatted from `event.startAt`), location, description, status
3. **Linked lead** — if `event.url` is set: show "Linked to: [Lead name link → /leads/id]". Parse the lead ID from the URL path. If `event.url` is null/empty: show "Link to Lead" section (Step 6b below).
4. **Actions** — Edit button (calls `onedit()`), Delete button (triggers confirm dialog)

**Delete confirmation** (inline in modal):
- Show a `$state` flag `confirmingDelete = false`
- Delete button click → set `confirmingDelete = true` → show "Are you sure? This will permanently delete the calendar event." + "Confirm delete" / "Cancel" buttons
- "Confirm delete" click → call `ondelete(event.uid)`

**Step 6b — "Link to Lead" section** (inside `EventDetailModal.svelte`):
- Only shown when `!event.url`
- Uses `LeadCombobox` in assign mode (same import pattern as `MeetingFormModal.svelte`) for lead search
- "Link" button — disabled until a lead is selected; on click → call `onlink(event.uid, selectedLeadId)`
- Shows inline loading state (`saving`) and error message on failure
- On success: parent invalidates page data; modal reflects the new link

**Step 7 — Wire up `+page.svelte`** (`src/routes/calendar/+page.svelte`)

Changes to the calendar page:

7a. **"Create event" button** — add to the calendar header (top-right area, near existing view/nav controls):
```svelte
<button onclick={() => createOpen = true} class="...">Create event</button>
```
State: `let createOpen = $state(false);`

7b. **Import new components**:
```svelte
import EventFormModal from '$lib/components/calendar/EventFormModal.svelte';
import EventDetailModal from '$lib/components/calendar/EventDetailModal.svelte';
```

7c. **State for modals**:
```svelte
let createOpen = $state(false);
let createSaving = $state(false);
let detailOpen = $state(false);
let selectedEvent = $state<CalendarEntry | null>(null);
let detailSaving = $state(false);
let editOpen = $state(false);
```

7d. **Team-event chip rendering** — in the existing grid cell loop, when `entry.type === 'team-event'`:
```svelte
{#if entry.type === 'team-event'}
  <button
    class="rounded px-1 py-0.5 text-xs font-medium text-white truncate"
    style="background-color: #7c3aed;"
    onclick={() => { selectedEvent = entry; detailOpen = true; }}
  >
    Team event — {entry.title}
  </button>
{/if}
```
Keep existing rendering logic for `meeting`, `followup`, `golive`, `eventstart` unchanged.

7e. **Create event handler**:
```svelte
async function handleCreateEvent(payload: EventFormPayload) {
  createSaving = true;
  const res = await fetch('/api/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, categories: 'team-event', source: 'sales-crm' })
  });
  createSaving = false;
  if (res.ok) {
    createOpen = false;
    await invalidateAll();
  } else {
    // surface error inline — EventFormModal handles via returned errors field
  }
}
```

7f. **Edit event handler** (from `EventDetailModal` → `onedit`):
- Set `editOpen = true`, passing `selectedEvent` to `EventFormModal` in edit mode.
- On `EventFormModal` submit in edit mode: `PUT /api/calendar/events/[uid]` → `invalidateAll()`.

7g. **Delete event handler**:
```svelte
async function handleDeleteEvent(uid: string) {
  detailSaving = true;
  const res = await fetch(`/api/calendar/events/${uid}`, { method: 'DELETE' });
  detailSaving = false;
  if (res.ok) {
    detailOpen = false;
    selectedEvent = null;
    await invalidateAll();
  }
}
```

7h. **Link-to-lead handler**:
```svelte
async function handleLinkToLead(uid: string, leadId: string) {
  detailSaving = true;
  const res = await fetch(`/api/calendar/events/${uid}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId })
  });
  detailSaving = false;
  if (res.ok) {
    await invalidateAll();
    // EventDetailModal will re-render with the linked lead (via invalidateAll)
  }
}
```

7i. **Render modals** in the page template:
```svelte
<EventFormModal
  open={createOpen}
  saving={createSaving}
  onclose={() => createOpen = false}
  onsubmit={handleCreateEvent}
/>

<EventDetailModal
  open={detailOpen}
  event={selectedEvent}
  saving={detailSaving}
  onclose={() => { detailOpen = false; selectedEvent = null; }}
  onedit={() => editOpen = true}
  ondelete={handleDeleteEvent}
  onlink={handleLinkToLead}
/>

<!-- Edit mode: reuse EventFormModal with pre-populated event -->
<EventFormModal
  open={editOpen}
  event={selectedEvent}
  saving={detailSaving}
  onclose={() => editOpen = false}
  onsubmit={handleEditEvent}
/>
```

---

### Phase 4 — API Route + Tests

**Step 8 — Create link-to-lead route** (`src/routes/api/calendar/events/[uid]/link/+server.ts`)

New file. Full implementation:

```typescript
/**
 * POST /api/calendar/events/[uid]/link — session-gated.
 * Links a Nextcloud team event to a CRM lead by:
 *   1. Validating session + body (leadId UUID)
 *   2. Inserting a crm_meetings row via createMeeting()
 *   3. Patching Nextcloud directly via directPatchEvent() (bypasses n8n — n8n drops CATEGORIES)
 *   4. On CalDAV failure: rolls back by calling softDeleteMeeting(meetingId)
 *   5. On success: records the Nextcloud UID via updateMeetingNextcloudUid()
 * 
 * OQ3 resolution: if CalDAV PUT fails after DB insert → soft-delete the meeting row,
 * return error(502). No partial state.
 * OQ2 resolution: organizerId is null — link-to-lead does NOT pre-fill organizerId.
 * UID source: params.uid (server path param) — never from request body.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createMeeting, softDeleteMeeting, updateMeetingNextcloudUid } from '$lib/server/db/meetings';
import { directPatchEvent, CalDavWebhookError } from '$lib/caldav/writer';

const linkBodySchema = z.object({
  leadId: z.string().uuid()
});

export const POST: RequestHandler = async ({ locals, request, params }) => {
  // Session gate FIRST
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const parsed = linkBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { leadId } = parsed.data;
  const uid = params.uid; // server-extracted path param — never from body

  // Step 1: Insert crm_meetings row
  let meeting: Awaited<ReturnType<typeof createMeeting>>;
  try {
    meeting = await createMeeting({
      leadId,
      startAt: new Date(), // default to now — no event.start available server-side without a CalDAV fetch
      organizerId: null    // OQ2: link to lead only; organizer pre-fill deferred
    });
  } catch {
    throw error(500, 'Failed to create meeting record');
  }

  // Step 2: Patch Nextcloud directly via CalDAV PUT
  try {
    await directPatchEvent(uid, {
      categories: 'crm-meeting',
      leadHref: `/leads/${leadId}`
    });
  } catch (e) {
    // OQ3: CalDAV failed → roll back the DB insert
    await softDeleteMeeting(meeting.id).catch(() => {
      // Log rollback failure server-side only — never surface to client
    });
    if (e instanceof CalDavWebhookError && (e as CalDavWebhookError).upstreamStatus === 404) {
      throw error(404, 'Calendar event not found');
    }
    throw error(502, 'Calendar service unavailable');
  }

  // Step 3: Record the Nextcloud UID on the meeting row
  await updateMeetingNextcloudUid(meeting.id, uid).catch(() => {
    // Non-fatal: UID wiring failed but the link itself succeeded
  });

  return json({ success: true, meetingId: meeting.id });
};
```

Important design note on `startAt`: The link handler does not have the event's original `startAt` available without doing a CalDAV REPORT fetch (which would add latency and complexity). Options:
- (a) Default to `new Date()` — simple, meeting row exists, startAt may not match the event
- (b) Require `startAt` in the request body (client sends event.startAt from the already-loaded CalendarEntry)

**Decision: use option (b) — require `startAt` in body.** The client already has `selectedEvent.startAt` from the calendar page data. Extend `linkBodySchema` to include `startAt: z.iso.datetime()` and pass it to `createMeeting({ ..., startAt: new Date(parsed.data.startAt) })`. This is cleaner than defaulting to `now`.

Update `linkBodySchema`:
```typescript
const linkBodySchema = z.object({
  leadId: z.string().uuid(),
  startAt: z.iso.datetime()
});
```

Update the `handleLinkToLead` client call to pass `startAt`:
```svelte
body: JSON.stringify({ leadId, startAt: event.startAt })
```

**Step 9 — Write tests**

9a. `src/tests/calendar-schemas.spec.ts` (NEW — Fully-Automated):
- Import `createCalendarEventSchema`, `updateCalendarEventSchema` from `$lib/zod/schemas`
- Test `attendees`, `color`, `status`, `rrule` optional fields accepted (valid inputs parse successfully)
- Test `attendees` rejects non-email array elements
- Test `color` rejects non-hex strings (e.g. `"red"`)
- Test existing required fields (`title`, `start`, `end`) still enforce (empty `title` fails)
- Test `end <= start` refine still fires
- Command: `bun run test:unit -- src/tests/calendar-schemas.spec.ts`

9b. `src/tests/calendar-merge.spec.ts` (NEW — Fully-Automated):
- Import and test the pure `mapTeamEvents` function extracted in Step 4
- Test: empty array in → empty array out
- Test: event with `category: 'team-event'` maps to `CalendarEntry` with correct fields
- Test: event with `category: 'meeting'` is filtered out (only category=team-event passes)
- Test: `uid`, `url`, `location`, `description`, `status`, `category` fields mapped correctly
- Command: `bun run test:unit -- src/tests/calendar-merge.spec.ts`

9c. `src/tests/calendar-link-to-lead.spec.ts` (NEW — Fully-Automated):
- Mock `$env/dynamic/private` with `vi.mock('$env/dynamic/private', () => ({ env: { NEXTCLOUD_URL: 'https://cloud.example.com', NEXTCLOUD_USER: 'user', NEXTCLOUD_APP_PASSWORD: 'pass', NEXTCLOUD_CALENDAR_SLUG: 'veent' } }))`
- Mock `fetch` globally with `vi.stubGlobal('fetch', vi.fn())`

Test group: `directPatchEvent`
- Happy path: GET returns 200 with minimal ICS; PUT returns 204 → resolves without throwing
- 404 GET: mock fetch GET returns 404 → throws `CalDavWebhookError` with message `'Event not found'`
- Non-2xx GET (e.g. 503): throws `CalDavWebhookError` with client-safe message
- Non-2xx PUT: GET returns 200, PUT returns 502 → throws `CalDavWebhookError`
- Assert: PUT request body contains `CATEGORIES:crm-meeting` and `CRM-HREF:/leads/test-id`
- Assert: `Authorization` header present in both GET and PUT; secret/password never in thrown error message

Test group: link-to-lead handler rollback (AC10)
- Create a minimal test for the rollback logic: when `directPatchEvent` throws, `softDeleteMeeting` should be called with the inserted meeting ID
- This tests the OQ3 resolution logic
- Use mocked `createMeeting` return + mocked `directPatchEvent` that throws → assert `softDeleteMeeting` called

Command: `bun run test:unit -- src/tests/calendar-link-to-lead.spec.ts`

9d. `src/tests/ncal4-event-ui.spec.ts` (NEW — self-skipping Playwright stubs):
- Create an e2e spec file following the `e2e/calendar.e2e.ts` pattern
- Add `test.skip()` guard at the top (all tests skip — no shared auth fixture)
- Stubs for: AC1 (button visible), AC2 (form fields), AC4 (purple chip renders), AC5 (chip click → modal), AC6 (edit submits PUT), AC7 (delete removes chip), AC8 (link flow)
- Skip reason: "Skipped — pending shared Playwright auth fixture (process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md)"
- Place in `src/tests/` alongside other e2e specs
- Command: `bun run test:e2e` (self-skips; confirms the spec file itself is syntactically valid)

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` — TypeScript compile after types/schema changes | Fully-Automated | AC4 (`'team-event'` in type union), AC12 (schema additions) |
| `bun run test:unit -- src/tests/calendar-schemas.spec.ts` | Fully-Automated | AC12 — `attendees`, `color`, `status`, `rrule` optional; required fields still enforce |
| `bun run test:unit -- src/tests/calendar-merge.spec.ts` | Fully-Automated | AC3 — team-event merge logic (pure fn); empty on CalDAV error |
| `bun run test:unit -- src/tests/calendar-link-to-lead.spec.ts` | Fully-Automated | AC9 — `directPatchEvent` mock: PUT has CATEGORIES + CRM-HREF; AC10 — rollback on CalDAV fail |
| `bun run test:unit` (full suite, no regressions) | Fully-Automated | Regression guard on all existing calendar/schema/meeting tests |
| Agent-Probe: navigate to `/calendar` (with live session), confirm "Create event" button visible | Agent-Probe | AC1 — button visible for all authenticated users |
| Agent-Probe: open create form, verify all fields present, all-day toggle hides time inputs | Agent-Probe | AC2 — form fields present + all-day behavior |
| Agent-Probe: verify purple `#7c3aed` chips appear in grid after creating a team event | Agent-Probe | AC4 — team-event chips rendered in grid |
| Agent-Probe: click a team-event chip, confirm `EventDetailModal` opens with correct data | Agent-Probe | AC5 — clicking chip opens detail modal |
| Agent-Probe: edit event, save, confirm grid reflects update | Agent-Probe | AC6 — edit submits PUT, grid updates |
| Agent-Probe: delete event, confirm chip removed from grid | Agent-Probe | AC7 — delete removes chip |
| Agent-Probe: link-to-lead flow — pick a lead, confirm link, verify modal shows linked lead name | Agent-Probe | AC8 — DB insert created; AC9 — CalDAV PATCH applied |
| Agent-Probe: review UI hint text for n8n field-drop limitation | Agent-Probe | AC11 — known-gap documented in UI |
| Self-skipping e2e stubs: `bun run test:e2e` (stubs confirm syntactic validity) | Known-Gap | AC1, AC2, AC4, AC5, AC6, AC7, AC8 — e2e stubs written; execution blocked pending auth fixture |

---

## Dependencies and Risks

### Dependencies (execution order)

Phase 1 must complete before Phase 2 (TypeScript compile safety).
Phase 1 must complete before Phase 4 (schema types used in link handler).
Phase 3 depends on Phase 1 (CalendarEntry type union) and Phase 2 (team-event data in page).
Phase 4 (tests) can be written in parallel with Phase 3 but requires Phase 1 writer.ts change.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `ical.js` import in `writer.ts` — ESM default export shape may differ from `parser.ts` usage | Low | Check `parser.ts` import pattern before writing `writer.ts` import; use same form |
| CalDAV GET → parse → PUT round-trip: ICS from Nextcloud may have folded lines or VCALENDAR wrappers that `ICAL.parse` handles correctly but `ICAL.stringify` produces differently, causing Nextcloud 422 on PUT | Medium | Test with a real ICS fixture; if Nextcloud rejects the re-stringified ICS, fall back to a regex-based text patch (replace CATEGORIES/DESCRIPTION lines directly in the raw text) |
| `parseIcsToEvents` in `+page.server.ts` — the function may return a different shape than expected for team events (check `event.uid` field name vs `event.id` in parser output) | Low | Confirm the ParsedEvent shape from `parser.ts` before writing Step 4; `calendar-merge.spec.ts` will catch any mismatch |
| AbortSignal.timeout in `fetchCalendarReport` — may need a wrapper at the call site in `+page.server.ts` if `fetchCalendarReport` doesn't accept a timeout option | Low | Check `reader.ts` for existing timeout; add `Promise.race` wrapper if absent |
| `startAt` for `createMeeting` in link handler — client must pass `event.startAt` from loaded data | Low | Documented in Step 8; `linkBodySchema` includes `startAt` field |

---

## Test Infra Improvement Notes

- The rollback test for the link-to-lead handler (AC10) cannot test the actual DB call without a live Postgres — it tests the mocked function call, which is the maximum coverage achievable without the live-DB CI harness (pre-accepted known-gap, same class as NCAL-2/reminders/manager-dashboard).
- Self-skipping e2e stubs (AC1/2/4/5/6/7/8) block on the shared Playwright auth fixture. See `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- The ICS round-trip in `directPatchEvent` (GET → parse → PUT) should be covered by a live Nextcloud integration test once the `caldav-live-harness` backlog item is resolved: `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`.

---

## Acceptance Criteria

| AC | Description | Strategy | Proven by |
|---|---|---|---|
| AC1 | "Create event" button visible on calendar page for authenticated users | Hybrid | Agent-Probe (e2e self-skip) |
| AC2 | EventFormModal shows all required fields; all-day toggle hides time inputs; submit posts to POST /api/calendar/events with categories: team-event | Hybrid | calendar-schemas.spec.ts (schema shape) + Agent-Probe (UI) |
| AC3 | Team events fetched and merged into display list on page load; CalDAV error degrades gracefully | Fully-Automated | calendar-merge.spec.ts (pure fn) |
| AC4 | Team-event chips render as purple (#7c3aed) in grid; TypeScript compile enforces type union | Fully-Automated + Hybrid | bun run check + Agent-Probe |
| AC5 | Clicking a team-event chip opens EventDetailModal populated with event data | Hybrid | Agent-Probe (e2e self-skip) |
| AC6 | Edit event from modal submits PUT /api/calendar/events/[uid]; grid updates | Hybrid | Agent-Probe (e2e self-skip) |
| AC7 | Delete event from modal submits DELETE /api/calendar/events/[uid]; chip removed | Hybrid | Agent-Probe (e2e self-skip) |
| AC8 | Link-to-lead creates crm_meetings row with correct leadId, title, startAt; UID recorded | Hybrid | calendar-link-to-lead.spec.ts (mocked DB) + Agent-Probe |
| AC9 | Link-to-lead patches Nextcloud via direct CalDAV PUT with CATEGORIES and CRM-HREF | Fully-Automated | calendar-link-to-lead.spec.ts (mocked fetch) |
| AC10 | CalDAV PUT failure after DB insert rolls back the crm_meetings row; 502 returned | Fully-Automated | calendar-link-to-lead.spec.ts (mock failure branch) |
| AC11 | n8n field-drop documented in UI tooltip and SPEC known-gaps | Agent-Probe | Manual review of hint text |
| AC12 | createCalendarEventSchema and updateCalendarEventSchema accept attendees, color, status, rrule optional fields | Fully-Automated | calendar-schemas.spec.ts |

Context loaded: `process/context/all-context.md` (routing) + `process/context/tests/all-tests.md` (test runner, Vitest commands, e2e self-skip pattern).

## Phase Completion Rules

A phase is CODE DONE when all checklist steps in that phase are implemented and `bun run check` passes.
A phase is VERIFIED when all Fully-Automated gates for that phase are green (`bun run test:unit`) AND Agent-Probe gates have been confirmed manually.

The plan reaches VERIFIED overall when:
- `bun run check` exits 0 (TypeScript compile)
- `bun run test:unit` exits 0 (all Vitest gates green — no regressions)
- `bun run test:e2e` exits 0 (self-skipping stubs confirm syntactic validity)
- Agent-Probe gates AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC11 confirmed manually with a live session
- Known-gaps documented: e2e suite behind shared auth fixture; live-DB rollback test; ICS round-trip live test

ENTER EXECUTE MODE to begin implementation after VALIDATE passes.

## Validate Contract

Status: CONDITIONAL
Date: 09-07-26
date: 2026-07-09
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 3/7 (S2 schema/CalDAV surface, S6 high-risk direct PUT + rollback, S7 12 files). Work is sequentially ordered — phases 1→2→3→4 have hard dependencies. Single vc-execute-agent (opus).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3/merge | mapTeamEvents filters category=team-event and maps to CalendarEntry | Fully-Automated | `bun run test:unit -- src/tests/calendar-merge.spec.ts` | A |
| AC9/patch | directPatchEvent PUT contains CATEGORIES + CRM-HREF in body | Fully-Automated | `bun run test:unit -- src/tests/calendar-link-to-lead.spec.ts` | A |
| AC10/rollback | CalDAV fail after DB insert → softDeleteMeeting called with meeting.id | Fully-Automated | `bun run test:unit -- src/tests/calendar-link-to-lead.spec.ts` | A |
| AC12/schema | attendees/color/status/rrule optional fields accepted; required fields still enforce | Fully-Automated | `bun run test:unit -- src/tests/calendar-schemas.spec.ts` | A |
| AC4/TS | TypeScript compile enforces 'team-event' in CalendarEntry.type union | Fully-Automated | `bun run check` exits 0 | A |
| regression | Full unit suite — no existing calendar/schema/meeting tests broken | Fully-Automated | `bun run test:unit` exits 0 | A |
| AC1/2/5/6/7/8 | UI button, form fields, modal open, edit, delete, link-to-lead flow | Agent-Probe | Navigate /calendar with live session; interact with EventFormModal and EventDetailModal | D |
| ICS round-trip | GET→parse→PUT round-trip accepted by Nextcloud without Nextcloud rejecting re-stringified ICS | Known-Gap | — | D |
| live-DB insert | createMeeting actual Postgres insert in link handler | Known-Gap | — | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- D — backlog test-building stub (named residual; keep-active; continue)

Failing stubs (Fully-Automated rows):

```
test("should filter category=team-event and map to CalendarEntry", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: mapTeamEvents filters category=team-event and maps to CalendarEntry")
})
test("should PUT request body contain CATEGORIES + CRM-HREF", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: directPatchEvent PUT contains CATEGORIES + CRM-HREF in body")
})
test("should call softDeleteMeeting with meeting.id when CalDAV fails", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: CalDAV fail after DB insert → softDeleteMeeting called with meeting.id")
})
test("should accept attendees/color/status/rrule optional fields", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: attendees/color/status/rrule optional fields accepted; required fields still enforce")
})
test("should exit 0 on bun run check after CalendarEntry type union extension", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: TypeScript compile enforces 'team-event' in CalendarEntry.type union")
})
test("should pass full unit suite with no regressions", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: Full unit suite — no existing calendar/schema/meeting tests broken")
})
```

Legacy line form:
- calendar-schemas: Fully-automated: `bun run test:unit -- src/tests/calendar-schemas.spec.ts`
- calendar-merge: Fully-automated: `bun run test:unit -- src/tests/calendar-merge.spec.ts`
- calendar-link-to-lead: Fully-automated: `bun run test:unit -- src/tests/calendar-link-to-lead.spec.ts`
- full unit suite: Fully-automated: `bun run test:unit`
- TypeScript check: Fully-automated: `bun run check`
- UI/modal flows: agent-probe: navigate /calendar with live session
- ICS live round-trip: known-gap: documented as caldav-live-harness backlog
- live-DB insert: known-gap: documented as live-db-ci-harness backlog

Dimension findings:
- Infra fit: PASS — CalDAV server-only imports safe; nested route `[uid]/link/` follows existing convention (`[id]/activities/`, `[id]/claim/`); `calendarCollectionUrl()` and `basicAuthHeader()` confirmed exported from constants.ts
- Test coverage: CONDITIONAL — Fully-Automated gates cover schema/merge/directPatchEvent/rollback logic; Agent-Probe covers UI flows; ICS live round-trip and live-DB insert are named Known-Gaps (pre-accepted, same class as NCAL-2/reminders/manager-dashboard)
- Breaking changes: PASS — CalendarEntry extension additive (optional fields + union variant); Zod schema extensions all optional; new route is additive; no existing API routes modified
- Security surface: CONDITIONAL — directPatchEvent credentials handled safely (CLIENT_SAFE_MESSAGE constant exists at line 35, never surfaces in thrown errors); link handler session-gated first; UID from path param only; ICAL.stringify confirmed in ical.js ESM type definitions; runtime smoke test recommended before commit
- Phase 1 — Type + Schema Extensions: PASS — CalendarEntry at line 207 confirmed; createCalendarEventSchema at line 221, updateCalendarEventSchema at line 238 confirmed; ICAL default import matches parser.ts pattern; CLIENT_SAFE_MESSAGE at line 35 confirmed
- Phase 2 — Server-side Team-Event Merge: CONDITIONAL (FAIL converted) — CalendarEvent from parseIcsToEvents has NO 'type' field; correct filter is `e.category === 'team-event'` not `e.type === 'team-event'`; correct mapping field is `e.category` not `e.categories`; execute-agent MUST apply this fix
- Phase 3 — UI Components: CONDITIONAL — LeadCombobox confirmed accepts `bind:value` string UUID in assign mode; handleEditEvent function referenced in Step 7i but not explicitly defined in Step 7f; execute-agent must define it alongside other handlers
- Phase 4 — API Route + Tests: CONDITIONAL — createMeeting/softDeleteMeeting/updateMeetingNextcloudUid all confirmed exported from meetings.ts; route nesting convention confirmed; CalDavWebhookError.upstreamStatus access pattern correct

Open gaps:
- caldav-live-harness: known-gap: documented as NEW PLAN REQUIRED — see process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md
- e2e-auth-bootstrap: known-gap: documented as NEW PLAN REQUIRED — see process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md
- live-db-ci-harness: known-gap: documented (pre-accepted, same class as NCAL-2/reminders/manager-dashboard)

What this coverage does NOT prove:
- calendar-merge.spec.ts: does not prove the CalDAV REPORT call itself succeeds against live Nextcloud; does not prove +page.server.ts SSR render with real page data; does not prove graceful degradation behavior in actual HTTP failure conditions
- calendar-link-to-lead.spec.ts: does not prove actual Postgres insert succeeds; does not prove Nextcloud accepts the re-stringified ICS (ICAL.stringify output format may differ from Nextcloud's expectations); does not prove the rollback actually deleted the row in Postgres
- calendar-schemas.spec.ts: does not prove the schema additions work when called from actual form submissions in the browser
- bun run check: does not prove runtime behavior; does not prove all conditional branches in the merge logic; does not prove UI interactions
- bun run test:unit (full suite): does not prove ICS round-trip; does not prove live DB operations; does not prove UI flows

Execute-agent instructions (required before marking plan DONE):
- E1: Phase 2 Step 4 — replace `e.type === 'team-event'` with `e.category === 'team-event'` in the mapTeamEvents filter. CalendarEvent (from parseIcsToEvents) has no 'type' field; the correct discriminator is 'category' (singular). Also replace `categories: e.categories` with `categories: e.category` in the mapping object. This is a silent bug — TypeScript will allow `e.type` via `any` fallback but the filter will always return empty.
- E2: Phase 3 Step 7f — explicitly define `handleEditEvent` function in +page.svelte alongside other handlers. It is referenced in Step 7i (`onsubmit={handleEditEvent}`) but the plan only describes the intent, not the function body. Implement it as: `async function handleEditEvent(payload: EventFormPayload) { detailSaving = true; const res = await fetch('/api/calendar/events/' + selectedEvent?.uid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); detailSaving = false; if (res.ok) { editOpen = false; await invalidateAll(); } }`
- E3: Phase 1 Step 3 — before committing, verify `ICAL.stringify` is callable at runtime. The ical.js ESM types confirm it exists, but add a quick smoke test: `console.assert(typeof ICAL.stringify === 'function', 'ICAL.stringify missing')` in a test or run the existing parser.ts tests to confirm the import works. If ICAL.stringify is not available at runtime, fall back to the regex text-patch approach documented in the Risk table.
- E4: Test 9b (calendar-merge.spec.ts) — update test scenarios to use `category: 'team-event'` (not `type: 'team-event'`) in mock CalendarEvent input data. Remove the chip color test from 9b — chip color (#7c3aed) is set at the Svelte template level in +page.svelte, not by mapTeamEvents.

Gate: CONDITIONAL (concerns noted, accepted by session)
Accepted by: session (autonomous execution) — accepted concerns: Phase 2 filter field bug converted to execute-agent instruction E1; CalendarEvent.categories→category mapping bug converted to E2; handleEditEvent gap converted to E3; ICAL.stringify runtime verification converted to E4; ICS round-trip and live-DB insert as pre-existing known-gaps (same class as NCAL-2/reminders/manager-dashboard)

## Autonomous Goal Block

SESSION GOAL: NCAL-4 — Implement calendar event UI, EventFormModal, EventDetailModal, team-event rendering (purple chips), and link-to-lead claim flow (directPatchEvent bypasses n8n for CATEGORIES).

Charter + umbrella plan: N/A — single plan

Autonomy: auto-proceed on all reversible decisions; surface only hard stops (irreversible/outward-facing actions not in contract).

Hard stop conditions / safety constraints:
- Do not run bun test — always bun run test:unit (Vitest, not Bun native runner)
- Do not skip Execute-agent instructions E1–E4 — they are required fixes, not optional
- Do not surface Nextcloud credentials or n8n webhook URLs in any error message or log
- Do not push or deploy without completing bun run check and bun run test:unit
- Do not hardcode the directPatchEvent ICS round-trip as working — if Nextcloud rejects the re-stringified ICS, fall back to regex text patch per the Risk table

Next phase: EXECUTE: process/features/calendar/active/ncal-4-event-ui_09-07-26/ncal-4-event-ui_PLAN_09-07-26.md

Validate contract: inline in plan (## Validate Contract section)

Execute start: `bun run check` | `bun run test:unit` | high-risk pack: no (medium-risk CalDAV direct PUT; no billing/auth/schema migration surface)

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/calendar/active/ncal-4-event-ui_09-07-26/ncal-4-event-ui_PLAN_09-07-26.md`

2. **Last completed phase or step:** VALIDATE complete — contract written 09-07-26. Ready for EXECUTE.

3. **Validate-contract status:** Written — Gate: CONDITIONAL (4 execute-agent instructions, pre-accepted; known-gaps pre-accepted).

4. **Supporting context files loaded:**
   - `process/features/calendar/active/ncal-4-event-ui_09-07-26/ncal-4-event-ui_SPEC_09-07-26.md`
   - `src/lib/types/index.ts`
   - `src/lib/caldav/writer.ts`
   - `src/lib/caldav/constants.ts`
   - `src/lib/zod/schemas.ts`
   - `src/routes/calendar/+page.server.ts`
   - `src/lib/server/db/meetings.ts` (createMeeting, softDeleteMeeting, updateMeetingNextcloudUid)
   - `src/routes/api/calendar/events/+server.ts`
   - `src/routes/api/calendar/events/[uid]/+server.ts`
   - `src/lib/components/meetings/MeetingFormModal.svelte`
   - `process/context/tests/all-tests.md`

5. **Next step for a fresh agent picking up mid-execution:**
   - VALIDATE is complete. Enter EXECUTE MODE.
   - CRITICAL: apply execute-agent instructions E1–E4 before running any tests — especially E1 (Phase 2 filter fix) which is a silent runtime bug.
   - Run phases in order — Phase 1 (type/schema/writer) → Phase 2 (server merge) → Phase 3 (UI) → Phase 4 (tests).
   - After each phase, run `bun run check` + `bun run test:unit` to catch regressions early.
   - Phase 1 is the safest starting point (no UI, no network calls, pure type/schema/function changes).
   - Key constraint: never run `bun test` — always `bun run test:unit` (Vitest, not Bun native runner).
   - The `directPatchEvent` function in Phase 1 Step 3 is the highest-risk item (ICS round-trip). If Nextcloud rejects the re-stringified ICS, fall back to regex-based text patch — see Risk table.
