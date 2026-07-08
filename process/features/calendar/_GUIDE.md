# Calendar Feature Guide

Last updated: 2026-07-07

## Status

Code-complete across all shipped plans. EVL green. e2e gates self-skip pending the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

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

## Plans

| Plan | Status |
|---|---|
| `completed/calendar_01-07-26/` | CAL-1 — complete |
| `completed/cal-3-owner-filter_06-07-26/` | CAL-3 — code-complete, EVL green |
| `active/cal-2-two-calendar-markers_06-07-26/` | CAL-2 — check status; PR #207 merged |
| `active/calendar-golive-events_06-07-26/` | go-live events — check status |
