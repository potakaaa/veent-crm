---
name: spec:ncal-5-calendar-source-of-truth
description: SPEC for NCAL-5 — Nextcloud as single source of truth for CRM calendar events (meetings + lead dates), replacing DB queries with CalDAV reads; emoji-prefix classification; CRM color scheme (GitHub #251)
date: 09-07-26
feature: calendar
---

# NCAL-5 — Nextcloud as Calendar Source of Truth

**Date:** 09-07-26
**Branch:** feat/ncal-5-calendar-source-of-truth
**GitHub:** #251

---

## Summary

Today's calendar page runs five DB queries in parallel to fetch meetings, go-live dates, event-start dates, follow-ups, and active reps — then fires a separate CalDAV REPORT to pull team events from Nextcloud. NCAL-5 collapses three of those five parallel DB legs (meetings, go-live dates, event-start dates) into the single CalDAV read that already happens, making Nextcloud the authoritative display source for CRM-originated calendar events. The result: fewer queries per page load and a calendar grid that shows exactly what is in Nextcloud rather than a reconstruction from DB snapshots.

To do this cleanly, NCAL-5 introduces a Nextcloud emoji-prefix convention for event titles and a matching CRM color scheme. Events written to Nextcloud by the CRM get a type-specific leading emoji (for example, "💼 Meeting with Aria Music" or "🎟️ Aria Music — Ticket Sale Start"), so the read path can classify them by parsing that emoji prefix. Since `CATEGORIES:` is silently dropped by n8n (confirmed by live API probe — all 17 events in the calendar returned `category: null`), the emoji prefix becomes the reliable classification signal.

Follow-ups stay DB-only: they are a CRM-internal concept and are never synced to Nextcloud.

---

## User Stories / Jobs To Be Done

**US-1 — Single consistent view:** As a CRM user, when I open the calendar page, I want the meeting and lead-date chips to reflect what is actually in the Nextcloud team calendar, so that what I see in the CRM exactly matches the shared calendar my team uses.

**US-2 — Visual event type clarity:** As a CRM user, when I look at the calendar grid, I want each event type to display in its own color, so that I can tell at a glance whether a chip is a meeting, a go-live milestone, an event-start date, a follow-up, or a public team event.

**US-3 — Nextcloud stays in sync (write path):** As a CRM user, when I create or edit a meeting or update a lead's key dates, I want the Nextcloud event title to carry the correct emoji prefix, so that the read path classifies the event correctly for everyone who uses the calendar.

**US-4 — Legacy events still visible:** As a CRM user, when I view the calendar after NCAL-5 is deployed, I want events that were created before the emoji-prefix convention was adopted to still appear correctly, so that no historical data is lost or misclassified.

**US-5 — Rep filter still works:** As a manager, when I use the rep filter (the CAL-3 "?repId=" combobox) on the calendar page, I want meetings and lead-date chips to still be scoped appropriately, so that the filter behavior I rely on is not broken by the switch to CalDAV reads.

**US-6 — Follow-ups unchanged:** As a CRM user, I want follow-up dots on the calendar to continue coming from the DB as they do today, so that follow-ups (which are not in Nextcloud) are not accidentally removed.

---

## What The User Wants (Behavioral Outcomes)

**Calendar page data sources after NCAL-5:**

| Entry type | Source before NCAL-5 | Source after NCAL-5 |
|---|---|---|
| `meeting` | DB (`listAllMeetings`) | CalDAV (classified by emoji prefix `💼` or `👥`) |
| `golive` | DB (`getGoLiveDatesInRange`) | CalDAV (classified by emoji prefix `🎟️`) |
| `eventstart` | DB (`getEventDatesInRange`) | CalDAV (classified by emoji prefix `🚀`) |
| `team-event` | CalDAV (unclassified / manual) | CalDAV (no emoji prefix, or `🎉`) |
| `followup` | DB (`getFollowUpsInRange`) | DB — unchanged |

**Emoji prefix convention (write path):**

When the CRM writes an event to Nextcloud via the NCAL-3 sync module, the title must carry a leading emoji from the table below. The `buildMeetingPayload`, `buildGoLiveDatePayload`, and `buildEventDatePayload` functions in `calendar-sync.ts` must be updated to prepend the correct emoji.

| CRM event type | Emoji | Example title |
|---|---|---|
| CRM meeting (with organizer/lead) | 💼 | `💼 Meeting with Aria Music` |
| CRM team meeting (no lead) | 👥 | `👥 Team Meeting` |
| Lead go-live date (ticket sale start) | 🎟️ | `🎟️ Aria Music — Ticket Sale Start` |
| Lead event-start date | 🚀 | `🚀 Aria Music — Event Date` |
| Public team event (Nextcloud-native) | 🎉 | `🎉 Veent Event` (user-authored, not CRM-written) |

**Emoji prefix classification (read path):**

When `parseIcsToEvents` returns a `CalendarEvent`, the title's leading emoji determines the CRM entry type. The `category` field on `CalendarEvent` cannot be relied upon (always `null` due to n8n limitation). The classification logic strips the emoji prefix from the display title before building the `CalendarEntry`.

Classification mapping:

| Leading emoji | `CalendarEntry.type` | Display title treatment |
|---|---|---|
| 💼 or 👥 | `meeting` | Emoji stripped; remainder becomes title |
| 🎟️ | `golive` | Emoji stripped; remainder becomes title |
| 🚀 | `eventstart` | Emoji stripped; remainder becomes title |
| 🎉 | `team-event` | Emoji stripped; remainder becomes title |
| None (no recognized emoji) | `team-event` | Title unchanged (legacy fallback) |

**Legacy event fallback (title-suffix matching):**

Events written before NCAL-5 do not carry emoji prefixes. A secondary suffix-based classifier runs after the emoji check fails:

- Title ends with `— Ticket Sale Start` → type `golive`
- Title ends with `— Event Date` → type `eventstart`
- Title starts with `Meeting with ` or equals `Team Meeting` → type `meeting`
- No match → type `team-event`

The suffix fallback is case-sensitive and operates on the full unmodified title.

**Rep-scoping for CalDAV events:**

CalDAV returns all events in the time window — there is no server-side owner filter. Rep-scoping for meetings and lead-date chips must be re-implemented on the read path using the `CRM-HREF:` link stored in each event's description. The lead ID extracted from `CRM-HREF:/leads/<id>` is used to look up the lead's owner in the DB and apply the same role/filterRepId logic as before. Events with no `CRM-HREF:` (public team events) are always shown to all users regardless of role.

Rep-scoping strategy:
- Extract lead IDs from CalDAV events that carry `CRM-HREF:/leads/<id>`.
- Batch-query those lead rows from the DB (a single `SELECT id, owner_id FROM crm_leads WHERE id IN (...)`).
- Filter: reps see only entries whose lead's `ownerId` matches their own user ID; managers see all (or filtered by `filterRepId`).
- Events without a lead link (`team-event` type) bypass the ownership filter entirely.

**CRM color scheme:**

Each event type renders in a distinct color in the calendar grid. The colors are defined in `constants.ts` under `CATEGORY_COLORS` (already exists) and applied based on the classified type, not the ICS `CATEGORIES` field.

| CRM entry type | Chip color (hex) | Current value | NCAL-5 target |
|---|---|---|---|
| `meeting` | Blue | `#3b82f6` | Unchanged |
| `golive` | Green | `#22c55e` | Unchanged |
| `eventstart` | Amber | `#f59e0b` | Unchanged |
| `team-event` | Purple | `#8b5cf6` | Unchanged |
| `followup` | Amber (dot) | existing | Unchanged |

The existing `CATEGORY_COLORS` mapping in `constants.ts` covers all types already. NCAL-5 does not change these color values — the color scheme is established. The acceptance criteria require that the color mapping remain correct after the classification moves from CATEGORIES to emoji-prefix.

**What happens to `mapTeamEvents` and `CATEGORY_MAP`:**

`mapTeamEvents` currently excludes events whose `category` field is in the CRM set (meeting, golive, eventstart). Since `category` is always `null` post-n8n, this filter effectively does nothing today — all CalDAV events pass through as `team-event`. After NCAL-5, the classification is done via emoji prefix in a new unified classification step that runs before type-specific filtering. `mapTeamEvents` may be replaced by a broader `classifyCalDavEvents` function that returns a full `CalendarEntry[]` including all types, or it may be updated to no longer use the `CRM_CATEGORIES` exclusion set.

**`CATEGORY_MAP` becomes secondary (fallback only):**

`CATEGORY_MAP` in `constants.ts` is currently the primary classification path. After NCAL-5, it becomes a secondary/legacy path only used when no emoji is recognized AND no known suffix is found. It can remain in place as a third-tier fallback (some historical events may have CATEGORIES that survived an earlier, direct-CalDAV write path not through n8n).

**`directPatchEvent` and CATEGORIES:**

`directPatchEvent` in `writer.ts` bypasses n8n and writes directly to the CalDAV endpoint, which means it CAN write the `CATEGORIES:` field. However, NCAL-5 does not wire `directPatchEvent` into the write path for classified events. The emoji-prefix convention is sufficient for classification — wiring `directPatchEvent` would add a second write path with a separate credential model and additional surface area. The `directPatchEvent` function remains available for future use but is out of scope for NCAL-5.

---

## Flow / State Diagram

### NCAL-5 calendar page load (simplified)

```
GET /calendar
        │
        ├── CalDAV REPORT (fetchCalendarReport)
        │       │
        │       ▼
        │   parseIcsToEvents → CalendarEvent[]
        │       │
        │       ▼
        │   classifyCalDavEvents (emoji → type → CalendarEntry[])
        │   ┌─────────────────────────────────────────┐
        │   │ Leading emoji present?                   │
        │   │  💼/👥 → type=meeting                   │
        │   │  🎟️  → type=golive                       │
        │   │  🚀  → type=eventstart                   │
        │   │  🎉  → type=team-event                   │
        │   │  none → suffix fallback → type=?         │
        │   └─────────────────────────────────────────┘
        │       │
        │       ▼
        │   Rep-scope filter (CRM-HREF lead lookup)
        │       │
        │   DB: SELECT id, owner_id WHERE id IN (lead IDs from CRM-HREF)
        │       │
        │       ▼
        │   Apply role/filterRepId filter on meeting + date entries
        │   team-event entries bypass filter (always shown)
        │
        ├── DB: getFollowUpsInRange (unchanged)
        │
        └── DB: listActiveReps (managers only, unchanged)

        Merge and sort → CalendarEntry[]
        Return to +page.svelte → grid render
```

### Write path with emoji prefix (NCAL-3 updated)

```
CRM mutation (create meeting / update lead date)
        │
        ▼
calendar-sync.ts
  buildMeetingPayload → title: "💼 Meeting with {label}" or "👥 Team Meeting"
  buildGoLiveDatePayload → title: "🎟️ {label} — Ticket Sale Start"
  buildEventDatePayload → title: "🚀 {label} — Event Date"
        │
        ▼
writer.ts → n8n webhook → Nextcloud event written with emoji prefix in SUMMARY
```

### Legacy event (no emoji) read path

```
CalDAV event: title = "Aria Music — Ticket Sale Start" (no emoji, pre-NCAL-5)
        │
        ▼
Emoji scan: no recognized leading emoji
        │
        ▼
Suffix scan: title ends with "— Ticket Sale Start" → type=golive
        │
        ▼
CalendarEntry { type: 'golive', title: 'Aria Music — Ticket Sale Start' }
```

---

## Acceptance Criteria (Testable Outcomes)

**AC1 — DB queries removed from calendar page for meetings/goLive/eventStart**

After NCAL-5, the calendar page load function no longer calls `listAllMeetings`, `getGoLiveDatesInRange`, or `getEventDatesInRange`. The page compiles and serves correctly without those calls. `getFollowUpsInRange` and `listActiveReps` remain.

proven by: Vitest — scan `+page.server.ts` load function for absence of the three removed import/call references; typecheck passes with no type errors.
strategy: Fully-Automated

**AC2 — Emoji-to-type classification: meeting emojis**

A CalDAV event with title `"💼 Meeting with Aria Music"` is classified as `type: 'meeting'` and the display title is `"Meeting with Aria Music"`. A title `"👥 Team Meeting"` is classified as `type: 'meeting'` with display title `"Team Meeting"`.

proven by: Vitest unit test on the classification function (pure function, no I/O).
strategy: Fully-Automated

**AC3 — Emoji-to-type classification: golive emoji**

A CalDAV event with title `"🎟️ Aria Music — Ticket Sale Start"` is classified as `type: 'golive'` and the display title is `"Aria Music — Ticket Sale Start"`.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC4 — Emoji-to-type classification: eventstart emoji**

A CalDAV event with title `"🚀 Aria Music — Event Date"` is classified as `type: 'eventstart'` and the display title is `"Aria Music — Event Date"`.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC5 — Team-event pass-through (🎉 and unrecognized)**

A CalDAV event with title `"🎉 Veent Event"` is classified as `type: 'team-event'` with display title `"Veent Event"`. An event with no recognized leading emoji and no matching suffix (e.g. `"Dinner with Partners"`) is also classified as `type: 'team-event'` with the original title unchanged.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC6 — Legacy suffix fallback: golive**

A CalDAV event with title `"Aria Music — Ticket Sale Start"` (no emoji prefix) is classified as `type: 'golive'` via the suffix fallback. The display title is the full unchanged title.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC7 — Legacy suffix fallback: eventstart**

A CalDAV event with title `"Aria Music — Event Date"` (no emoji prefix) is classified as `type: 'eventstart'` via the suffix fallback. The display title is the full unchanged title.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC8 — Legacy suffix fallback: meeting**

A CalDAV event with title `"Meeting with Aria Music"` (no emoji prefix) is classified as `type: 'meeting'` via the suffix fallback. A title equal to `"Team Meeting"` (no emoji) is also classified as `type: 'meeting'`.

proven by: Vitest unit test on the classification function.
strategy: Fully-Automated

**AC9 — Write path: meeting payload carries emoji prefix**

`buildMeetingPayload` called with a lead name produces a title that starts with `"💼 "`. `buildMeetingPayload` called with no lead/organizer name produces a title that starts with `"👥 "`.

proven by: Vitest unit test on `buildMeetingPayload` (existing test suite extended, pure function).
strategy: Fully-Automated

**AC10 — Write path: go-live payload carries emoji prefix**

`buildGoLiveDatePayload` produces a title that starts with `"🎟️ "`.

proven by: Vitest unit test on `buildGoLiveDatePayload` (existing test suite extended).
strategy: Fully-Automated

**AC11 — Write path: event-date payload carries emoji prefix**

`buildEventDatePayload` produces a title that starts with `"🚀 "`.

proven by: Vitest unit test on `buildEventDatePayload` (existing test suite extended).
strategy: Fully-Automated

**AC12 — Rep-scope filter: rep sees only own events**

When role is `rep` and the CalDAV result contains two events — one whose `CRM-HREF` links to a lead owned by the rep and one owned by another rep — the rep sees only the entry for their own lead. Team-event entries (no `CRM-HREF` / `url`) are shown regardless of role.

proven by: Vitest unit test on the rep-scope filter function (pure function, fed mock CalendarEntry + mock lead-ownership map).
strategy: Fully-Automated

**AC13 — Rep-scope filter: manager with filterRepId sees only that rep's events**

When role is `manager` and `filterRepId` is set, only entries whose lead's `ownerId` equals `filterRepId` are returned (plus team-event entries).

proven by: Vitest unit test on the rep-scope filter function.
strategy: Fully-Automated

**AC14 — Rep-scope filter: manager with no filterRepId sees all events**

When role is `manager` and `filterRepId` is absent, all classified CalendarEntry items are returned.

proven by: Vitest unit test on the rep-scope filter function.
strategy: Fully-Automated

**AC15 — Color scheme per type remains correct**

The `CATEGORY_COLORS` mapping in `constants.ts` correctly maps each classified type to its chip color: `meeting → #3b82f6`, `golive → #22c55e`, `eventstart → #f59e0b`, `team-event → #8b5cf6`. This mapping is stable after NCAL-5 refactoring.

proven by: Vitest unit test asserting `CATEGORY_COLORS` values for all four types.
strategy: Fully-Automated

**AC16 — Follow-ups unchanged**

`getFollowUpsInRange` continues to be called in `+page.server.ts` and follow-up entries continue to appear in the page data. The data contract for `type: 'followup'` entries is unchanged.

proven by: Vitest — presence of `getFollowUpsInRange` import/call in `+page.server.ts`; existing unit tests for that function continue to pass.
strategy: Fully-Automated

**AC17 — Graceful degradation: CalDAV failure**

When the CalDAV REPORT call throws, the calendar page still loads with follow-ups (and no CalDAV-sourced entries), mirroring the existing try/catch behavior. No 500 error is surfaced to the user.

proven by: Vitest unit test or Playwright e2e — mock CalDAV error, assert page data still contains followup entries and no crash.
strategy: Hybrid (Vitest for the unit logic; e2e self-skipping pending auth fixture, pre-accepted known-gap)

**AC18 — TypeScript type check passes**

`bun run check` passes with zero type errors after all NCAL-5 changes.

proven by: `bun run check` in CI / validate gate.
strategy: Fully-Automated

---

## Out Of Scope

- **Follow-up sync to Nextcloud:** Follow-ups are a CRM-internal concept and will never be written to or read from CalDAV. Their DB-only path is unchanged.
- **`directPatchEvent` for CATEGORIES writes:** Writing `CATEGORIES:` via the direct CalDAV path is not wired in. Emoji prefix is the sole classification mechanism in NCAL-5.
- **Changing the existing chip color hex values:** The current `CATEGORY_COLORS` values are accepted. Color changes require a separate design decision.
- **Backfilling emoji prefixes onto pre-NCAL-5 Nextcloud events:** Legacy events are handled by the suffix fallback read path. No migration of Nextcloud event titles is in scope.
- **NCAL-4 event creation UI:** The team-event form (GitHub #253) is a separate plan. NCAL-5 only concerns the calendar data source change.
- **Offline or cached calendar reads:** All CalDAV reads are live and synchronous. Caching or stale-while-revalidate patterns are out of scope.
- **Changing the CRM session or auth model:** NCAL-5 does not touch `hooks.server.ts`, `auth.ts`, or any session logic.
- **Removing DB query functions from `leads.ts` or `meetings.ts`:** The three functions (`listAllMeetings`, `getGoLiveDatesInRange`, `getEventDatesInRange`) may remain in place — they are used by other routes and features. NCAL-5 only stops calling them from the calendar page.
- **Per-rep CalDAV calendars:** All CalDAV reads are from the single shared team calendar. Per-user calendar separation is not in scope.

---

## Constraints

- `src/lib/caldav/` is server-only — never imported from `.svelte` files.
- CalDAV REPORT returns ALL events in the date window; there is no server-side owner/rep filter on the Nextcloud side.
- `category` on `CalendarEvent` is always `null` in production because n8n silently drops `CATEGORIES:` (confirmed by live API probe — 17/17 events returned `category: null`). The emoji-prefix classification path must not depend on `category`.
- n8n expects Manila-local date/time fields (`toManilaDateTime` UTC+8), not ISO 8601 UTC — this constraint is unchanged from NCAL-2/NCAL-3.
- `NEXTCLOUD_URL` already includes `https://`; never prepend a scheme. `NEXTCLOUD_CALENDAR_SLUG` is pre-encoded; never re-`encodeURIComponent`. These conventions are unchanged.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`) — no Svelte 4 stores.
- All DB access in `+page.server.ts` or `+server.ts` — never in `.svelte` files.
- The rep-scope DB lookup (batch-fetching lead owner IDs from `CRM-HREF` links) must handle the case where a lead referenced in CalDAV has been soft-deleted or does not exist. Unknown lead IDs must be treated as "not owned by the current rep" (exclusive default) to avoid showing cross-rep data.
- The emoji characters used as prefixes are multi-byte Unicode and may or may not be followed by a variation selector (U+FE0F). The classification function must handle both forms (e.g., `🎟️` with or without U+FE0F).
- The calendar page load must continue to degrade gracefully when Nextcloud is unreachable — the existing try/catch around the CalDAV call must be preserved.
- CAL-3 rep-scoping behavior must be preserved exactly: reps see only their own leads' events; managers see all by default or one rep when `filterRepId` is set; team-events (no CRM-HREF) are always shown to all users.
- Existing Vitest test suite must pass without regression (`bun run test:unit`).

---

## Open Questions

None — all design questions resolved in the task brief, live API probe results, and confirmed user direction above.

---

## Background / Research Findings

### Live API probe results (confirmed before SPEC)

Called `GET /api/calendar/events` against the live Nextcloud instance; 17 events returned:
- ALL 17 events have `category: null` — n8n silently drops `CATEGORIES:` on every event write. This is a confirmed production behavior, not a transient bug.
- UID prefix `event-NNN@veent.io` = manually-created team events (Nextcloud-native).
- UID prefix `veent-{hex}@veent.io` = CRM-synced events (2 found from NCAL-3).
- `CRM-HREF:` extraction via `url` field works correctly; one event confirmed `/leads/845e542d-...`.

### Current data flow (pre-NCAL-5)

`+page.server.ts` runs 5 parallel calls:
1. `getFollowUpsInRange` — DB
2. `listAllMeetings` — DB
3. `getGoLiveDatesInRange` — DB
4. `getEventDatesInRange` — DB
5. `listActiveReps` — DB (managers only)

Plus a separate CalDAV block (currently inside a try/catch) that runs `fetchCalendarReport` → `parseIcsToEvents` → `mapTeamEvents`. That block currently only surfaces `type: 'team-event'` entries.

### Why `mapTeamEvents` excludes CRM categories

`mapTeamEvents` uses a `CRM_CATEGORIES` exclusion set (`['meeting', 'golive', 'go-live', 'eventstart', 'event-start']`) to skip CalDAV events already represented by DB queries. Because `category` is always `null`, no event ever matches this filter today — all CalDAV events pass through as `team-event`. The filter logic is vestigial as of the live production state but was correct at design time (assumed CATEGORIES would round-trip).

### NCAL-3 write path (current state)

`calendar-sync.ts` `buildMeetingPayload` produces titles like `"Meeting with {label}"` or `"Team Meeting"` (no emoji). `buildLeadDatePayload` produces `"{label} — Ticket Sale Start"` or `"{label} — Event Date"` (no emoji). NCAL-5 updates these builders to prepend the correct emoji.

### CAL-3 rep-scoping (current state)

DB queries accept `(userId, role, filterRepId?)` and apply WHERE predicates server-side in Drizzle. The CalDAV replacement cannot use DB WHERE predicates, so NCAL-5 uses a post-fetch ownership filter: extract lead IDs from `CRM-HREF` links, batch-query `owner_id` from `crm_leads`, then filter entries client-side on the server (in `+page.server.ts`). This adds one extra DB query (the lead-ownership batch lookup) but removes three larger ones.

### `directPatchEvent` decision

`directPatchEvent` exists in `writer.ts` and can write `CATEGORIES:` directly to CalDAV (bypassing n8n). It is not currently called anywhere in the sync path. The decision for NCAL-5 is to leave it unwired — the emoji convention is a simpler, single-path classification strategy. Wiring `directPatchEvent` would add a second credential path (direct CalDAV credentials vs. n8n webhook), increasing complexity without a classification benefit.

### Nextcloud emoji template conventions (user-confirmed)

The Nextcloud team already uses emoji prefixes in manually-created event titles as an informal convention:
- `🎉` for public Veent events
- `🎟️` for ticket sale start dates
- `✈️` for travel/on-site events
- `💼` for client meetings/demos
- `👥` for team meetings
- `🚀` for product releases/go-lives

NCAL-5 adopts and formalizes the subset of this convention that maps to CRM event types (`💼`, `👥`, `🎟️`, `🚀`, `🎉`), so CRM-written events visually integrate with the existing team convention.

### Test infrastructure context

- Vitest runs without a live DB or Nextcloud connection (lazy pool, no connections opened in tests).
- All three payload builder functions (`buildMeetingPayload`, `buildGoLiveDatePayload`, `buildEventDatePayload`) are pure/exported — testable directly without server infrastructure.
- The classification function (to be written) will also be pure — no side effects, takes a `CalendarEvent[]` and returns `CalendarEntry[]`.
- Playwright e2e is blocked by the shared auth fixture known-gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). All e2e specs self-skip. This known-gap is pre-accepted.
