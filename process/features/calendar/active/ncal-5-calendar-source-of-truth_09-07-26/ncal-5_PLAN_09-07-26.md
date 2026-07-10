---
name: plan:ncal-5-calendar-source-of-truth
description: COMPLEX plan for NCAL-5 — make Nextcloud/CalDAV the display source of truth for the calendar page. New classify.ts (emoji-prefix + suffix-fallback classifier), rewrite calendar +page.server.ts to replace 3 DB queries with CalDAV reads + CRM-HREF rep-scoping, add emoji prefixes to calendar-sync.ts write builders. (GitHub #251)
date: 09-07-26
feature: calendar
---

# NCAL-5 — Nextcloud as Calendar Source of Truth — PLAN

Date: 09-07-26
Status: PLANNED — not yet started
Complexity: COMPLEX (4 phases; read path + write path + new module + rep-scoping/trust-boundary surface)
Branch: feat/ncal-5-calendar-source-of-truth
GitHub: #251
**SPEC:** `process/features/calendar/active/ncal-5-calendar-source-of-truth_09-07-26/ncal-5_SPEC_09-07-26.md`

---

## TL;DR

Replace 3 of the 5 parallel DB queries on the calendar page (`listAllMeetings`, `getGoLiveDatesInRange`, `getEventDatesInRange`) with a single CalDAV read that is classified by emoji-prefix into `meeting` / `golive` / `eventstart` / `team-event`. Rep-scoping moves to a post-fetch `CRM-HREF` → `crm_leads.owner_id` batch lookup. The write path (`calendar-sync.ts`) prepends type emojis so the read path can classify. Follow-ups stay DB-only. 4 phases, all proof is Fully-Automated Vitest + `bun run check`, except AC17 graceful degradation (Hybrid — Vitest unit + pre-accepted e2e known-gap).

---

## Overview

Today `+page.server.ts` runs 5 parallel DB calls + a separate CalDAV block that only surfaces `team-event` chips. NCAL-5 collapses meetings/golive/eventstart into the CalDAV read, classifies them by leading emoji (with a legacy suffix fallback), re-implements CAL-3 rep-scoping via a `CRM-HREF` → `owner_id` batch lookup, and updates the write-path builders to emit the emoji prefixes. `src/lib/caldav/team-events.ts` is deleted (its only consumer is being rewritten).

## Goals

1. Calendar page shows meetings/golive/eventstart chips sourced from Nextcloud, not DB snapshots.
2. Classification is emoji-prefix-first with a case-sensitive suffix fallback for legacy events.
3. CAL-3 rep-scoping preserved exactly via post-fetch ownership filter (exclusive default for unknown/soft-deleted leads).
4. Write path stamps type emojis so round-trip classification works.
5. Zero regression to follow-ups, `listActiveReps`, the existing NCAL-3 sync orchestrators, or the `/meetings` route.

## Scope

In scope: new `classify.ts`, rewrite of calendar `+page.server.ts`, emoji prefixes in the 3 `calendar-sync.ts` builders, deletion of `team-events.ts`, extension of two existing NCAL-3 test files, one new classify test file. Out of scope: everything in the SPEC "Out Of Scope" section (follow-up sync, `directPatchEvent` wiring, color hex changes, Nextcloud title backfill, NCAL-4 UI, caching, auth/session, removing the DB functions from `leads.ts`/`meetings.ts`).

---

## Locked Decisions (from SPEC + INNOVATE — do not reopen)

- New pure `classifyCalDavEvents(events: CalendarEvent[]): CalendarEntry[]` in `src/lib/caldav/classify.ts`.
- `src/lib/caldav/team-events.ts` is DELETED.
- `filterByOwnership(...)` is a separate pure function (defined in / importable from `+page.server.ts`).
- Rep-scoping via `CRM-HREF` batch DB lookup: extract lead IDs from `entry.url`, batch `SELECT id, owner_id FROM crm_leads WHERE id IN (...) AND deleted_at IS NULL`, filter post-classification.
- `getFollowUpsInRange` and `listActiveReps` stay unchanged.
- Emoji prefixes prepended in `buildMeetingPayload`, `buildGoLiveDatePayload`, `buildEventDatePayload`.
- `directPatchEvent` NOT wired in.

### Emoji mapping (write + read)

| CRM type | Emoji | Write example |
|---|---|---|
| Meeting with lead/organizer | 💼 | `💼 Meeting with Aria Music` |
| Team meeting (no lead) | 👥 | `👥 Team Meeting` |
| Go-live date | 🎟️ | `🎟️ Aria Music — Ticket Sale Start` |
| Event date | 🚀 | `🚀 Aria Music — Event Date` |
| Team event (not CRM-written) | 🎉 | `🎉 Veent Event` |

### Classification order (read path)

1. Leading emoji present → map to type, strip emoji + following space from display title.
2. No emoji → case-sensitive suffix fallback on the FULL unmodified title: `— Ticket Sale Start` → `golive`; `— Event Date` → `eventstart`; starts with `Meeting with ` OR equals `Team Meeting` → `meeting`.
3. No match → `team-event` (title unchanged).

### Rep-scope filter rules

- Rep: only entries whose lead `ownerId === userId`, PLUS all `team-event` entries (no `url`).
- Manager + `filterRepId`: only entries whose lead `ownerId === filterRepId`, PLUS all `team-event` entries.
- Manager, no `filterRepId`: all entries.
- Unknown / soft-deleted / missing lead ID → **exclusive default** (NOT shown to a rep; NOT shown under a `filterRepId` match). Only reachable-and-owned leads pass.

---

## Corrections to the task brief (verified against repo)

1. **Ownership column is `crmLeads.ownerId` (`owner_id`), NOT `organizerId`.** Confirmed at `src/lib/server/db/schema.ts:155` (`ownerId: uuid('owner_id')`). `organizerId` (`organizer_id`, line 158) is a different column (the crm_organizers FK) and is the WRONG one for rep-scoping. The batch query and the `filterByOwnership` map MUST use `owner_id`. CAL-3's existing DB queries also scope on `ownerId`.
2. **Two test files change, not one.** Meeting title assertions live in `src/tests/ncal3-meeting-sync.spec.ts` (e.g. line 80 `sets title to "Team Meeting"`). Go-live/event-date title assertions live in `src/tests/ncal3-lead-sync.spec.ts` (e.g. line 137 `'Summer Fest — Ticket Sale Start'`). BOTH must be updated in Phase 3.
3. **Test runner is Vitest**, invoked via `bun run test:unit` (watch) / `bun run test:unit:ci` (one-shot, `vitest --run`). Typecheck is `bun run check` (`svelte-kit sync && svelte-check`).
4. **`CalendarEntry` type lives at `src/lib/types/index.ts:207`** (union `'meeting' | 'followup' | 'golive' | 'eventstart' | 'team-event'`). The `url`, `uid`, `description`, `location`, `status`, `categories` fields are already optional on it — `classify.ts` reuses them exactly as `mapTeamEvents` did.

---

## Touchpoints

| Path | Action | Why |
|---|---|---|
| `src/lib/caldav/classify.ts` | CREATE | New pure classifier `classifyCalDavEvents` |
| `src/lib/caldav/team-events.ts` | DELETE | Only consumer (`+page.server.ts`) is being rewritten; superseded by classify.ts |
| `src/routes/calendar/+page.server.ts` | REWRITE (load fn) | Drop 3 DB queries; add classify + CRM-HREF batch lookup + `filterByOwnership` |
| `src/lib/server/n8n/calendar-sync.ts` | EDIT (3 builders) | Prepend type emojis to titles |
| `src/tests/caldav-classify.spec.ts` | CREATE | Unit tests for classify.ts + filterByOwnership (AC2–AC8, AC12–AC14) |
| `src/tests/ncal3-meeting-sync.spec.ts` | EDIT | Meeting title assertions now expect 💼/👥 prefix (AC9) |
| `src/tests/ncal3-lead-sync.spec.ts` | EDIT | Golive/eventstart title assertions now expect 🎟️/🚀 prefix (AC10, AC11) |
| `src/tests/calendar-merge.spec.ts` | DELETE or REWRITE | This suite's entire subject is `mapTeamEvents` (imports it directly). Deleting `team-events.ts` breaks its import → `bun run check` + full-suite fail. Delete this spec (its team-event mapping is now covered by `caldav-classify.spec.ts`) OR rewrite it to import `classifyCalDavEvents` and assert team-event pass-through. Decide during execute; document choice. (VALIDATE P1 mitigation) |

Read-only context: `src/lib/caldav/parser.ts` (`CalendarEvent` type), `src/lib/caldav/reader.ts` (`fetchCalendarReport`), `src/lib/caldav/constants.ts` (`CATEGORY_COLORS`, `CATEGORY_MAP`), `src/lib/types/index.ts` (`CalendarEntry`), `src/lib/server/db/schema.ts` (`crmLeads.ownerId`, `deletedAt`), `src/lib/server/db/leads.ts` (`getFollowUpsInRange`, `listActiveReps`, `isWithinRange`).

## Public Contracts

- **New export:** `classifyCalDavEvents(events: CalendarEvent[]): CalendarEntry[]` — pure, no I/O. Server-only module (imports a `$lib/types` type only; safe but conventionally server-only alongside siblings).
- **Deleted export:** `mapTeamEvents` (from `team-events.ts`). No consumer remains after Phase 2. Grep must confirm zero references before deletion.
- **Changed behavior (not signature):** `buildMeetingPayload`, `buildGoLiveDatePayload`, `buildEventDatePayload` now return titles with a leading emoji + space. Signatures unchanged. Any consumer asserting on exact titles (the 2 NCAL-3 test files) must update.
- **New DB read:** batch `SELECT id, owner_id FROM crm_leads WHERE id IN (...) AND deleted_at IS NULL` in the calendar load. No schema change, no write, no migration.
- **`+page.server.ts` return shape unchanged:** still `{ entries, view, date, activeReps, filterRepId, isManager, meId }`. `.svelte` grid untouched.

## Blast Radius

- **Files changed/created/deleted:** 7 (1 create module, 1 delete module, 1 rewrite route load, 1 edit sync builders, 1 create test, 2 edit tests).
- **Packages:** 1 (the SvelteKit app; no workspace-package fan-out).
- **Risk class:** trust-boundary (rep-scoping / CAL-3 data-visibility). The exclusive-default soft-delete guard is the load-bearing correctness rule — a bug here leaks cross-rep events. This elevates Phase 2 to the highest-scrutiny phase and requires the ownership-filter unit tests (AC12–AC14) plus an explicit unknown-lead test before Phase 2 is VERIFIED.
- **No schema/migration/auth/billing surface.** `hooks.server.ts`, `auth.ts`, session logic untouched.

---

## Phase Breakdown / Implementation Checklist

Phase ordering is strictly sequential — each phase's tests gate the next.

```
Phase 1  New classify.ts + unit tests  ──►  Phase 2  Rewrite +page.server.ts (classify + CRM-HREF rep-scope + delete team-events.ts)
                                                          │
                                                          ▼
Phase 4  bun run check + full vitest run  ◄──  Phase 3  calendar-sync.ts emoji prefixes + update 2 NCAL-3 test files
```

---

### Phase 1 — New `classify.ts` + unit tests

**Goal:** Land the pure classifier with full emoji + suffix-fallback coverage. No consumer wired yet.

**Checklist:**

1. Create `src/lib/caldav/classify.ts`. Imports: `import type { CalendarEvent } from './parser';` and `import type { CalendarEntry } from '$lib/types';`.
2. Define an internal emoji-to-type table. Recognized prefixes and their `CalendarEntry['type']`:
   - `💼` → `meeting`, `👥` → `meeting`, `🎟️` → `golive`, `🚀` → `eventstart`, `🎉` → `team-event`.
3. **Variation-selector (U+FE0F) handling — CRITICAL.** `🎟️` may arrive with or without a trailing U+FE0F variation selector. Before any prefix comparison, `.normalize('NFC')` the title. Match each emoji in BOTH forms: build the recognized-emoji set to include both the bare code point (`🎟`, `\u{1F39F}`) and the presentation-selector form (`🎟️`, `\u{1F39F}️`). Implementation: iterate recognized emojis longest-first (so the U+FE0F form is tested before the bare form) and check `title.startsWith(emoji)`. When matched, strip `emoji.length` chars PLUS one following space (only if the next char is a literal space). Do NOT strip a following space that is not present.
   - Note: `👥`, `💼`, `🚀`, `🎉` are typically single scalar (no U+FE0F); `🎟️` is the one that commonly carries U+FE0F. Handle both defensively for all five by including any U+FE0F-suffixed form in the recognized set.
4. Emoji-match path: on match, set `type` from the table; display title = the stripped remainder (emoji + optional one space removed), then `.trim()` is NOT applied (SPEC says "remainder becomes title" — only the emoji + single following space is removed; do not further trim, to preserve intentional titles). Verify against AC2 expected `"Meeting with Aria Music"`.
5. Suffix-fallback path (only when NO recognized emoji matched). Operate on the FULL unmodified (post-NFC) title, case-sensitive:
   - `title.endsWith('— Ticket Sale Start')` → `golive`, display title = full unchanged title.
   - `title.endsWith('— Event Date')` → `eventstart`, display title = full unchanged title.
   - `title.startsWith('Meeting with ')` OR `title === 'Team Meeting'` → `meeting`, display title = full unchanged title.
   - else → `team-event`, display title = full unchanged title.
6. Build the `CalendarEntry` per event mirroring the old `mapTeamEvents` field mapping, but with the classified `type` and stripped `title`:
   - `id`: `` `${type}-${e.uid}` `` (keeps IDs unique + type-prefixed; team-event previously used `team-event-${uid}`).
   - `startAt: e.start`, `title: <display title>`, `href: e.url ?? ''`, `uid: e.uid`, `url: e.url ?? undefined`, `description: e.description ?? undefined`, `location: e.location ?? undefined`, `status: e.status ?? undefined`, `categories: e.category ?? undefined`.
   - Fallback title when `e.title` is empty: `'(No title)'` (match old behavior).
7. Export `classifyCalDavEvents(events: CalendarEvent[]): CalendarEntry[]` returning `events.map(classifyOne)`.
8. Create `src/tests/caldav-classify.spec.ts`. Cover: AC2 (💼 and 👥 → meeting, stripped titles), AC3 (🎟️ with AND without U+FE0F → golive), AC4 (🚀 → eventstart), AC5 (🎉 → team-event stripped; unrecognized `"Dinner with Partners"` → team-event unchanged), AC6 (`"Aria Music — Ticket Sale Start"` no-emoji → golive, full title), AC7 (`"Aria Music — Event Date"` no-emoji → eventstart), AC8 (`"Meeting with Aria Music"` and `"Team Meeting"` no-emoji → meeting). Add an explicit U+FE0F edge test: assert `"🎟️ X"` and `"🎟 X"` both classify to golive with display title `"X"`.

**Phase 1 test gate:** `bun run test:unit:ci src/tests/caldav-classify.spec.ts` → all green. `bun run check` → no type errors in `classify.ts`.

---

### Phase 2 — Rewrite calendar `+page.server.ts` (classify + CRM-HREF rep-scope + delete team-events.ts)

**Goal:** Wire CalDAV as the source of truth; re-implement CAL-3 rep-scoping post-fetch; delete `team-events.ts`.

**Checklist:**

1. **Imports.** Remove `listAllMeetings` (from `$lib/server/db/meetings`), and remove `getGoLiveDatesInRange`, `getEventDatesInRange` from the `$lib/server/db/leads` import (KEEP `getFollowUpsInRange`, `listActiveReps`, `isWithinRange`). Remove `import { mapTeamEvents } from '$lib/caldav/team-events';`. Add `import { classifyCalDavEvents } from '$lib/caldav/classify';`. Add a DB client import for the batch ownership query (use the same Drizzle access pattern already used in `$lib/server/db/*` — prefer adding a small named helper `getLeadOwners(ids: string[]): Promise<Map<string,string>>` to `src/lib/server/db/leads.ts` rather than importing `db` into the route; this keeps DB access in the db layer per repo convention). **Decide during execute:** if a suitable helper is trivial, add `getLeadOwners` to `leads.ts` and import it; document the choice in the phase report.
2. **Preserve the existing rep-filter guard block verbatim** (UUID_RE, `rawRepId`, `filterRepId`) — the CAL-3 trust boundary is unchanged.
3. **Parallel query block.** Reduce the `Promise.all` to the surviving DB legs only:
   ```
   const [followUps, activeReps] = await Promise.all([
     getFollowUpsInRange(id, start, end, role, filterRepId),
     isManager ? listActiveReps() : Promise.resolve([])
   ]);
   ```
4. **CalDAV block (preserve try/catch — AC17).** Inside the existing `try`:
   ```
   const blobs = await fetchCalendarReport({ start, end });
   const allEvents = blobs.flatMap((blob) => parseIcsToEvents(blob, { start, end }));
   const classified = classifyCalDavEvents(allEvents);
   // range-filter classified entries the same way meetings were (isWithinRange on startAt)
   const inRange = classified.filter((e) => isWithinRange(e.startAt, start, end));
   // batch ownership lookup for rep-scoping
   const leadIds = [...new Set(
     inRange
       .filter((e) => e.url?.startsWith('/leads/'))
       .map((e) => e.url!.split('/')[2])
       .filter((x): x is string => !!x)
   )];
   const leadOwners = leadIds.length ? await getLeadOwners(leadIds) : new Map<string,string>();
   calDavEntries = filterByOwnership(inRange, leadOwners, id, role, filterRepId);
   ```
   Declare `let calDavEntries: CalendarEntry[] = [];` before the try so the catch degrades to `[]` (AC17).
5. **`filterByOwnership` pure function** (module-scope in `+page.server.ts`; exported so it can be unit-tested — OR co-locate a copy in a testable module. Prefer: export it from `+page.server.ts` and import in the test. If SvelteKit route-module test import is awkward, place `filterByOwnership` in a small `src/lib/caldav/rep-scope.ts` and import from both the route and the test. **Decide during execute; document choice.**):
   ```
   function filterByOwnership(
     entries: CalendarEntry[],
     leadOwners: Map<string, string>, // leadId → ownerId (only reachable, non-deleted leads present)
     userId: string,
     role: string,
     filterRepId?: string | null
   ): CalendarEntry[]
   ```
   Logic:
   - `isManager = role === 'manager' || role === 'super_manager'`.
   - For each entry: if it has no `url` starting `/leads/` → it is a team-event/public event → ALWAYS keep.
   - Else extract `leadId = url.split('/')[2]`; `ownerId = leadOwners.get(leadId)`.
   - **Exclusive default:** if `ownerId` is undefined (unknown / soft-deleted / missing) → DROP for reps and for manager+filterRepId; (for manager-no-filter, all entries are kept anyway).
   - Manager, no `filterRepId` → keep all entries (including lead-linked ones regardless of owner).
   - Manager, `filterRepId` set → keep only entries where `ownerId === filterRepId` (plus team-events, already kept above).
   - Rep → keep only entries where `ownerId === userId` (plus team-events, already kept above).
6. **Remove** the old `meetingEntries`, `goLiveEntries`, `eventStartEntries` blocks. KEEP `followUpEntries`.
7. **Merge + sort.** `entries = [...followUpEntries, ...calDavEntries].sort(byStartAt)`. Return shape unchanged.
8. **Delete `src/lib/caldav/team-events.ts`.** First run `grep -rn "team-events\|mapTeamEvents" src/` and confirm zero remaining references. **VERIFIED at VALIDATE: `src/tests/calendar-merge.spec.ts` imports `mapTeamEvents` from `team-events.ts` (line 10) and its entire suite tests that function.** Deleting `team-events.ts` WILL break that spec's import (fails `bun run check` and the full-suite run). Before/alongside the delete, resolve `calendar-merge.spec.ts`: either (a) DELETE it (its `mapTeamEvents` team-event pass-through coverage is superseded by the AC5 team-event cases in `caldav-classify.spec.ts`), or (b) REWRITE it to import and exercise `classifyCalDavEvents`. Do NOT delete `team-events.ts` while any `.spec.ts` still imports it. The rewritten route no longer imports it. Re-run the grep after resolving to confirm zero dangling refs.
9. Add ownership-filter unit tests to `src/tests/caldav-classify.spec.ts` (or the rep-scope test module chosen in step 5): AC12 (rep sees only own; team-event always shown), AC13 (manager+filterRepId), AC14 (manager no filter → all), plus explicit unknown-lead exclusive-default test (leadOwners map missing an ID → dropped for rep).

**Phase 2 test gate:** `bun run test:unit:ci src/tests/caldav-classify.spec.ts` green (incl. new ownership tests). `bun run check` green (route + new helper typecheck). Grep confirms `team-events.ts` deleted with zero dangling refs.

---

### Phase 3 — `calendar-sync.ts` emoji prefixes + update 2 NCAL-3 test files

**Goal:** Write path emits emoji prefixes; existing title assertions updated.

**Checklist:**

1. `buildMeetingPayload` (`calendar-sync.ts` ~line 100): change the title assignment. Current: `title: label ? \`Meeting with ${label}\` : 'Team Meeting'`. New: `title: label ? \`💼 Meeting with ${label}\` : '👥 Team Meeting'`. (`label = meeting.leadOrganizerName ?? meeting.leadName ?? null`.)
2. `buildLeadDatePayload` (shared, ~line 121) currently produces `` `${label} — ${titleSuffix}` ``. Do NOT hard-code an emoji here (it serves both golive and eventstart with different emojis). Instead prepend the emoji in the two public wrappers:
   - `buildGoLiveDatePayload` → wrap: build via `buildLeadDatePayload(lead, lead.goLiveDate, 'Ticket Sale Start')`, then set `payload.title = \`🎟️ ${payload.title}\``. Simplest: after the delegate returns, reassign title. Return the modified payload.
   - `buildEventDatePayload` → same, prepend `🚀 `.
   - Alternative (cleaner): add an optional `emojiPrefix` param to `buildLeadDatePayload` and prepend inside it. **Decide during execute; document choice.** Either yields identical output: `🎟️ Aria Music — Ticket Sale Start` / `🚀 Aria Music — Event Date`.
3. Use the exact emoji characters incl. U+FE0F for 🎟️ so the read-path (which handles both) and any manual Nextcloud events stay consistent. The 🚀 and 👥 and 💼 forms are bare scalars.
4. **Update `src/tests/ncal3-meeting-sync.spec.ts`:** the `sets title to "Team Meeting"` assertion (line ~80) → expect `'👥 Team Meeting'`. Any `Meeting with X` assertion → expect `'💼 Meeting with X'`. Scan the whole file for `.title` assertions on `buildMeetingPayload`.
5. **Update `src/tests/ncal3-lead-sync.spec.ts`:** golive title assertions (e.g. `'Summer Fest — Ticket Sale Start'` line ~137, `'Rock Night — Ticket Sale Start'` line ~147, `'Lead — Ticket Sale Start'` line ~157) → prepend `'🎟️ '`. `toContain('Ticket Sale Start')` assertions stay valid (still a substring). eventstart title assertions (e.g. `'Jazz Night — Event Date'` line ~216) → prepend `'🚀 '`. `toContain('Event Date')` stays valid.
6. Add fresh assertions proving the prefix explicitly (AC9/AC10/AC11): `expect(payload.title.startsWith('💼 ')).toBe(true)` / `startsWith('👥 ')` / `startsWith('🎟️ ')` / `startsWith('🚀 ')`.

**Phase 3 test gate:** `bun run test:unit:ci src/tests/ncal3-meeting-sync.spec.ts src/tests/ncal3-lead-sync.spec.ts` green. `bun run check` green.

---

### Phase 4 — Full typecheck + full unit test run (regression gate)

**Goal:** Confirm zero regression across the whole suite.

**Checklist:**

1. `bun run check` → zero type errors (AC18).
2. `bun run test:unit:ci` → full Vitest suite green (Constraint: existing suite must pass without regression). Pay attention to `calendar-merge.spec.ts`, `calendar-db.spec.ts`, `calendar-events-endpoint.spec.ts` — any of these may reference `mapTeamEvents` or the old entry shapes.
3. Add AC15 assertion (if not already present anywhere): a test asserting `CATEGORY_COLORS` maps `meeting → #3b82f6`, `golive → #22c55e`, `eventstart → #f59e0b`, `team-event → #8b5cf6`. Put it in `src/tests/caldav-classify.spec.ts`.
4. Confirm AC16: `getFollowUpsInRange` import/call still present in `+page.server.ts` (grep).
5. Confirm AC1: `listAllMeetings`, `getGoLiveDatesInRange`, `getEventDatesInRange` no longer imported/called in `+page.server.ts` (grep for absence).

**Phase 4 test gate:** `bun run check` && `bun run test:unit:ci` both green. Grep assertions for AC1 (absence) and AC16 (presence) pass.

---

## Emoji edge cases (explicit — must be honored in classify.ts)

1. **U+FE0F variation selector.** `🎟️` = `\u{1F39F}️`; the bare form `🎟` = `\u{1F39F}`. Both must classify to golive. Recognized-emoji set includes both forms; match longest-first. Covered by an explicit test in Phase 1 step 8.
2. **`.normalize('NFC')` the title before comparison** to canonicalize combining sequences.
3. **Strip exactly one following space**, and only if present. `"💼Meeting"` (no space) → strip only the emoji → title `"Meeting"`. `"💼 Meeting"` → strip emoji + one space → `"Meeting"`.
4. **Multi-scalar emojis are single-prefix here** — none of the five are ZWJ sequences, so `startsWith` on the (possibly U+FE0F-suffixed) string is sufficient; no grapheme segmentation needed.
5. **Emoji appearing mid-title (not leading)** does NOT trigger the emoji path — only `startsWith`. Falls through to suffix fallback.

## Soft-delete / unknown-lead guard (explicit)

- The batch query is `... WHERE id IN (leadIds) AND deleted_at IS NULL` — soft-deleted leads never enter `leadOwners`.
- `filterByOwnership` treats any `leadId` absent from `leadOwners` as **not owned** (exclusive default). For a rep or a manager+filterRepId, that entry is DROPPED. This prevents leaking a chip for a deleted/unknown lead to a rep who cannot verify ownership.
- Team-event entries (no `/leads/` url) bypass this entirely and are always shown.
- Manager-no-filter keeps all lead-linked entries regardless of ownership map completeness (managers see everything by default — matches CAL-3).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit:ci src/tests/caldav-classify.spec.ts` — 💼/👥 → meeting, stripped title | Fully-Automated | AC2 |
| Same suite — 🎟️ (with + without U+FE0F) → golive | Fully-Automated | AC3 |
| Same suite — 🚀 → eventstart | Fully-Automated | AC4 |
| Same suite — 🎉 stripped + unrecognized unchanged → team-event | Fully-Automated | AC5 |
| Same suite — `— Ticket Sale Start` no-emoji → golive (full title) | Fully-Automated | AC6 |
| Same suite — `— Event Date` no-emoji → eventstart (full title) | Fully-Automated | AC7 |
| Same suite — `Meeting with `/`Team Meeting` no-emoji → meeting | Fully-Automated | AC8 |
| `ncal3-meeting-sync.spec.ts` — title starts `💼 `/`👥 ` | Fully-Automated | AC9 |
| `ncal3-lead-sync.spec.ts` — title starts `🎟️ ` | Fully-Automated | AC10 |
| `ncal3-lead-sync.spec.ts` — title starts `🚀 ` | Fully-Automated | AC11 |
| `caldav-classify.spec.ts` — rep sees only own; team-event always shown | Fully-Automated | AC12 |
| Same suite — manager+filterRepId scoped | Fully-Automated | AC13 |
| Same suite — manager no filter → all | Fully-Automated | AC14 |
| Same suite — unknown/soft-deleted leadId dropped for rep (exclusive default) | Fully-Automated | Constraint (soft-delete guard) |
| Same suite — `CATEGORY_COLORS` per-type hex assertions | Fully-Automated | AC15 |
| Grep `+page.server.ts` — `getFollowUpsInRange` present | Fully-Automated | AC16 |
| Grep `+page.server.ts` — 3 removed calls absent + `bun run check` | Fully-Automated | AC1 |
| Try/catch degradation: mock CalDAV throw → entries still contain followups, no crash | Hybrid (Vitest unit for logic; e2e self-skips pending shared auth fixture — pre-accepted known-gap) | AC17 |
| `bun run check` zero type errors | Fully-Automated | AC18 |

## Test Infra Improvement Notes

- **getLeadOwners DB query is not directly unit-tested (VALIDATE P2, known-gap).** The rep-scope tests (AC12–AC14 + unknown-lead) feed `filterByOwnership` a MOCK `Map<leadId,ownerId>` and prove the pure filter logic exhaustively. The actual `getLeadOwners` SQL — `SELECT id, owner_id FROM crm_leads WHERE id IN (...) AND deleted_at IS NULL` — is proven only transitively (its output shape is a `Map`, which the filter tests assume correct). Testing the SQL itself (esp. the `deleted_at IS NULL` clause that makes the exclusive-default guard sound) requires a live Postgres — same class as the repo-wide pre-accepted live-DB CI harness known-gap. **Execute-agent MUST keep `getLeadOwners` a thin, obvious query** (no ownership logic inside it — all filtering lives in the tested `filterByOwnership`) so the untested surface stays trivial. Record the final `getLeadOwners` SQL verbatim in the phase report for review.
- AC17 e2e leg remains blocked by the pre-accepted shared Playwright auth-fixture known-gap: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. No new e2e infra gap introduced by NCAL-5.

---

## Phase Completion Rules

A phase is `CODE DONE` when its checklist items are implemented and its per-phase test gate is green. A phase is only `VERIFIED` after: (a) its own test gate is green, AND (b) the running full-suite regression (`bun run test:unit:ci`) shows no new failures introduced by that phase. Phases are strictly sequential — do not start phase N+1 until phase N is `CODE DONE`. `CODE DONE` is not `VERIFIED`: the whole-suite regression and `bun run check` (Phase 4) must pass before the plan is marked `VERIFIED`.

Per-phase exit gates:
- **Phase 1:** `bun run test:unit:ci src/tests/caldav-classify.spec.ts` green; `bun run check` clean on `classify.ts`.
- **Phase 2:** classify + ownership tests green; `bun run check` clean; `team-events.ts` deleted with zero dangling refs (grep-proven).
- **Phase 3:** both updated NCAL-3 test files green; `bun run check` clean.
- **Phase 4 (VERIFIED gate):** `bun run check` && `bun run test:unit:ci` both fully green; AC1 absence-grep and AC16 presence-grep pass.

## Acceptance Criteria

The full testable AC list (AC1–AC18) is owned by the SPEC (`ncal-5_SPEC_09-07-26.md` §Acceptance Criteria) and is not restated here to avoid drift. Each AC's proving gate + strategy is mapped 1:1 in the **Verification Evidence** table above (every AC1–AC18 appears there with its `Proves SPEC criterion` cell). "Done" for this plan = every row in that table green, with the Phase 4 VERIFIED gate satisfied. AC17 is the single Hybrid criterion (Vitest unit proves the logic; the e2e leg self-skips under the pre-accepted shared-auth-fixture known-gap).

---

## Context & Testing References

Context router: `process/context/all-context.md` (feature: calendar; test routing: `process/context/tests/all-tests.md`). Post-phase testing is mandatory — every phase runs its Vitest gate before advancing, and Phase 4 runs the full `bun run test:unit:ci` suite + `bun run check` as the regression gate (see Phase Completion Rules).

## Dependencies

- Depends on NCAL-1 (parser, `CalendarEvent.url` from `CRM-HREF`), NCAL-2 (writer/n8n path), NCAL-3 (`calendar-sync.ts` builders + existing tests) — all VERIFIED and merged. No external/library additions. No new env vars. No migration.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cross-rep data leak via bad ownership filter | Exclusive-default rule + dedicated AC12–AC14 + unknown-lead unit tests; Phase 2 flagged highest-scrutiny |
| U+FE0F mismatch silently misclassifies 🎟️ | Explicit dual-form recognized set + dedicated edge test (Phase 1 step 8) |
| Deleting `team-events.ts` breaks an unseen consumer | Mandatory grep gate before deletion (Phase 2 step 8) |
| Existing calendar tests assert old entry shape/titles | Phase 4 full-suite run + explicit review of `calendar-merge/db/endpoint` specs |
| Rewriting `+page.server.ts` breaks the graceful-degradation try/catch | Preserve `let calDavEntries = []` + try/catch; AC17 test |

## Backwards Compatibility

- `CalendarEntry` return shape unchanged → `.svelte` grid untouched.
- Legacy (pre-emoji) Nextcloud events handled by suffix fallback (AC6–AC8).
- The 3 DB functions remain in `leads.ts`/`meetings.ts` for other routes — only the calendar page stops calling them.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/calendar/active/ncal-5-calendar-source-of-truth_09-07-26/ncal-5_PLAN_09-07-26.md`
2. **Last completed phase/step:** none — plan written, VALIDATE PASS (re-run). EXECUTE pending.
3. **Validate-contract status:** written — Gate PASS (inner-pvl: phase-1 re-run; supersedes the first-pass CONDITIONAL).
4. **Supporting context loaded:** SPEC (above); `parser.ts` (`CalendarEvent`), `team-events.ts` (to delete), `constants.ts` (`CATEGORY_COLORS`/`CATEGORY_MAP`), `+page.server.ts` (current 5-query load), `calendar-sync.ts` (3 builders), `ncal3-meeting-sync.spec.ts` + `ncal3-lead-sync.spec.ts` (title assertions), `schema.ts` (`crmLeads.ownerId` = `owner_id`, NOT `organizerId`; `deletedAt`), `types/index.ts:207` (`CalendarEntry`).
5. **Next step for a fresh agent:** EXECUTE Phase 1 (create `classify.ts` + `caldav-classify.spec.ts`). Phases are strictly sequential; each phase's test gate must be green before the next. Two execute-time decisions to record in the phase report: (a) `getLeadOwners` helper location (leads.ts vs inline `db` import — prefer leads.ts helper); (b) `filterByOwnership` location (exported from `+page.server.ts` vs new `src/lib/caldav/rep-scope.ts` — pick whichever tests import cleanly). CRITICAL correctness rules: ownership column is `owner_id`; exclusive-default for unknown leads; U+FE0F dual-form emoji matching.

---

## Validate Contract

Status: PASS
Date: 09-07-26
date: 2026-07-09
generated-by: inner-pvl: phase-1
supersedes: 2026-07-09 (inner-pvl: phase-1) — same-cycle re-run; first-pass CONDITIONAL root-cause gaps (P1 + P2) mitigated in-plan and re-verified PASS

Parallel strategy: sequential (validated in-thread, Simple Mode)
Rationale: 2/7 signals (S6 trust-boundary, S7 7 files); single-package, self-contained plan with all context loaded — inline Layer 1 + Layer 2 assessment, no spawn needed.

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | 💼/👥 title → meeting, emoji+space stripped | Fully-Automated | `bun run test:unit:ci src/tests/caldav-classify.spec.ts` | B |
| AC3 | 🎟️ (with AND without U+FE0F) → golive, stripped | Fully-Automated | same suite — dual-form U+FE0F edge test | B |
| AC4 | 🚀 → eventstart, stripped | Fully-Automated | same suite | B |
| AC5 | 🎉 stripped→team-event; unrecognized unchanged→team-event | Fully-Automated | same suite | B |
| AC6 | `— Ticket Sale Start` no-emoji → golive (full title) | Fully-Automated | same suite | B |
| AC7 | `— Event Date` no-emoji → eventstart (full title) | Fully-Automated | same suite | B |
| AC8 | `Meeting with `/`Team Meeting` no-emoji → meeting | Fully-Automated | same suite | B |
| AC9 | buildMeetingPayload title starts `💼 `/`👥 ` | Fully-Automated | `bun run test:unit:ci src/tests/ncal3-meeting-sync.spec.ts` | B |
| AC10 | buildGoLiveDatePayload title starts `🎟️ ` | Fully-Automated | `bun run test:unit:ci src/tests/ncal3-lead-sync.spec.ts` | B |
| AC11 | buildEventDatePayload title starts `🚀 ` | Fully-Automated | same suite | B |
| AC12 | rep sees only own lead events; team-event always shown | Fully-Automated | caldav-classify.spec.ts filterByOwnership (mock Map) | B |
| AC13 | manager+filterRepId → only that rep's; +team-events | Fully-Automated | same suite | B |
| AC14 | manager no filter → all entries | Fully-Automated | same suite | B |
| Constraint (soft-delete guard) | unknown/soft-deleted leadId → DROPPED for rep (exclusive default) | Fully-Automated | same suite — explicit unknown-lead test (mock Map missing id) | B |
| AC15 | CATEGORY_COLORS per-type hex correct | Fully-Automated | same suite — assert #3b82f6/#22c55e/#f59e0b/#8b5cf6 | B |
| AC16 | getFollowUpsInRange still imported/called in +page.server.ts | Fully-Automated | grep presence in +page.server.ts | A |
| AC1 | 3 removed DB calls absent + no dangling team-events ref | Fully-Automated | grep absence in +page.server.ts; grep -rn team-events src/ = 0 | B |
| AC17 | CalDAV throw → page still loads with followups, no 500 | Hybrid | Vitest unit for degradation logic; e2e leg self-skips (auth fixture) | D |
| AC18 | bun run check zero type errors | Fully-Automated | `bun run check` | B |
| getLeadOwners SQL correctness (deleted_at IS NULL) | batch owner lookup returns only reachable, non-deleted leads | — | not directly unit-tested; proven transitively via mocked-Map filter tests | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase; D — backlog test-building stub / named residual (keep-active).

C-4 reconciliation: the strategy column carries only the 3 proving strategies (Fully-Automated / Hybrid). Known-Gap is never a strategy — the two D rows (AC17 e2e leg, getLeadOwners SQL) are named residuals, not a strategy proving a behavior.

Failing stub (AC2, Fully-Automated):
```
test("should classify 💼/👥 prefixed titles as meeting with emoji+space stripped", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: 💼/👥 title → meeting, emoji+space stripped")
})
```

Failing stub (AC3, Fully-Automated):
```
test("should classify 🎟️ with and without U+FE0F as golive, stripped", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: 🎟️ dual-form U+FE0F → golive stripped")
})
```

Failing stub (AC12, Fully-Automated):
```
test("should show a rep only their own lead events; team-event always shown", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rep sees only own; team-event always shown")
})
```

Failing stub (Constraint soft-delete guard, Fully-Automated):
```
test("should drop unknown/soft-deleted leadId for rep (exclusive default)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: unknown-lead exclusive-default drop for rep")
})
```

Legacy line form (retained for existing consumers):
- classify.ts (emoji + suffix classification): Fully-automated: `bun run test:unit:ci src/tests/caldav-classify.spec.ts`
- filterByOwnership (rep-scoping / trust boundary): Fully-automated: same suite (AC12–AC14 + unknown-lead exclusive-default, mock ownership Map)
- calendar-sync.ts emoji prefixes: Fully-automated: `bun run test:unit:ci src/tests/ncal3-meeting-sync.spec.ts src/tests/ncal3-lead-sync.spec.ts`
- full regression + typecheck: Fully-automated: `bun run test:unit:ci` + `bun run check`
- getLeadOwners DB SQL: known-gap: documented — needs live Postgres (repo-wide live-DB CI harness known-gap); keep the helper thin so the untested surface is trivial
- AC17 e2e leg: known-gap: documented — shared Playwright auth fixture (pre-accepted)

Dimension findings:
- Infra fit: PASS — 1 package, no container/worker/proxy surface; test runner `vitest --run` and `bun run check` verified real in package.json; all 12 referenced source paths exist on disk; 2 CREATE targets correctly absent.
- Test coverage: PASS — developed behavior (classify + filterByOwnership rep-scope) is Fully-Automated proven end-to-end at the unit level. The two untested surfaces are named D residuals with written justification (getLeadOwners SQL → live-DB CI harness class, contained by the thin-helper rule; AC17 e2e leg → shared auth fixture, pre-accepted) — not vacuous-green: no developed behavior rests on a known-gap alone. Prior CONCERN was the disposition of these residuals, now correctly documented in-plan (P2) — resolved.
- Breaking changes: PASS — prior CONCERN root cause FIXED at VALIDATE (P1): deleting team-events.ts breaks `src/tests/calendar-merge.spec.ts` (mapTeamEvents import at line 10; whole suite tests it) — re-verified real this pass. Now a Touchpoint (DELETE-or-REWRITE) and Phase 2 step 8 gates the delete on resolving it, with a mandatory post-resolution grep. `+page.server.ts` return shape unchanged; `.svelte` grid untouched.
- Security surface: PASS — STRIDE-I (cross-rep information disclosure) is the sole trust-boundary risk. Mitigated by exclusive-default rule + `deleted_at IS NULL` batch query + dedicated AC12–AC14 + unknown-lead unit tests (all mandated by plan). No new secret/credential/auth surface; hooks.server.ts/auth.ts untouched.

Layer 2 section verdicts: Phase 1 PASS; Phase 2 PASS (calendar-merge.spec.ts break resolved in-plan, delete gated on resolution + grep); Phase 3 PASS; Phase 4 PASS (full-suite regression ordering hazard removed — calendar-merge.spec.ts is resolved in Phase 2 before Phase 4 runs).

Net gate: PASS — 0 FAILs, 0 CONCERNs. This is the supplement re-run of the first-pass CONDITIONAL. Both root-cause gaps (P1 calendar-merge.spec.ts import break; P2 getLeadOwners untested SQL) were mitigated in-plan at the prior V6 and both mitigations are verified present and correct this pass. Remaining residuals (getLeadOwners SQL, AC17 e2e) are pre-accepted named known-gap class (live-DB / auth-fixture), excluded from the CONCERN/FAIL count — no developed behavior rests on them alone.

Open gaps:
- getLeadOwners DB SQL correctness: known-gap: documented — needs live Postgres CI harness (repo-wide accepted class). Named residual; keep helper thin.
- AC17 e2e leg: known-gap: documented — shared Playwright auth fixture, pre-accepted (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

What this coverage does NOT prove:
- `bun run test:unit:ci src/tests/caldav-classify.spec.ts` proves the pure classify + filterByOwnership logic against in-memory inputs; it does NOT prove the live CalDAV read returns emoji-prefixed titles, nor that getLeadOwners' SQL actually excludes soft-deleted rows against a real DB.
- The NCAL-3 title suites prove the builders emit emoji prefixes; they do NOT prove n8n/Nextcloud preserves the emoji in the written ICS SUMMARY (out of scope; NCAL-2/3 round-trip already verified emoji-free titles survive).
- `bun run check` proves types compile; it does NOT prove runtime rep-scoping behavior end-to-end (that is AC17's e2e leg — self-skipped).
- The full `bun run test:unit:ci` regression proves no unit-level regression across the spec suite AFTER calendar-merge.spec.ts is resolved; it does NOT prove browser/grid rendering (no component-test harness).

Gate: PASS (no unresolved FAILs; 0 CONCERNs after P1+P2 mitigations re-verified; residuals are pre-accepted known-gap class)
Accepted by: session (autonomous, /goal execution) — residuals carried as pre-accepted known-gaps: "getLeadOwners DB SQL untested" (P2, live-DB harness class, contained by thin-helper rule); "AC17 e2e leg" (shared-auth-fixture, pre-accepted). Both first-pass CONCERN root causes (calendar-merge.spec.ts break, getLeadOwners disposition) resolved in-plan — not carried as concerns.

---

## Autonomous Goal Block

```
SESSION GOAL: NCAL-5 — make Nextcloud/CalDAV the display source of truth for the calendar page (emoji-prefix classification + CRM-HREF rep-scoping), replacing 3 DB queries.
Charter + umbrella plan: N/A — single plan (no NCAL umbrella with ## Stable Program Goal on disk)
Autonomy: /goal autonomous execution — reversible edits auto-proceed; CONDITIONAL gaps applied and continue; hard stop only on irreversible/outward-facing actions not in the contract.
Hard stop conditions / safety constraints:
- Rep-scoping trust boundary: exclusive-default rule for unknown/soft-deleted leads MUST hold — any change that could show a lead chip to a rep who does not own it is a hard stop. AC12–AC14 + unknown-lead test must be green before Phase 2 is VERIFIED.
- Do NOT delete src/lib/caldav/team-events.ts while ANY .spec.ts still imports it — resolve src/tests/calendar-merge.spec.ts first (delete or rewrite).
- Keep getLeadOwners a thin query (no ownership logic inside it) — all filtering stays in the tested filterByOwnership.
- No schema/migration/auth changes — if any surface, hard stop.
Per-phase loop: research → validate → execute → update-process; validate never skipped; every phase runs its Vitest gate before advancing; Phase 4 runs full bun run test:unit:ci + bun run check.
Next phase: EXECUTE — Phase 1 (create src/lib/caldav/classify.ts + src/tests/caldav-classify.spec.ts)
Validate contract: inline in plan (Gate: PASS — supplement re-run; 2 root-cause gaps mitigated in-plan and re-verified; residuals pre-accepted known-gap class)
Test gates: bun run test:unit:ci src/tests/caldav-classify.spec.ts (Phase 1/2) | bun run test:unit:ci src/tests/ncal3-meeting-sync.spec.ts src/tests/ncal3-lead-sync.spec.ts (Phase 3) | bun run test:unit:ci + bun run check (Phase 4 regression)
Execute start: EXECUTE Phase 1 — create classify.ts (pure classifyCalDavEvents; U+FE0F dual-form emoji match; suffix fallback) + caldav-classify.spec.ts (AC2–AC8). High-risk pack: no (trust-boundary covered by unit tests, no live-provider/billing/migration surface).
```
