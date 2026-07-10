---
name: plan:cal-2-two-calendar-markers
description: Add a second calendar marker (eventDate) per live lead — purple "Event Start" chips distinct from go-live (green), meetings (blue), follow-ups (amber); click-through to /leads/[id]
date: 06-07-26
feature: calendar
---

# CAL-2 Two calendar markers (event start) — Implementation Plan (SIMPLE)

**Date**: 06-07-26
**Status**: Active — VALIDATE PASS (C1-CAL2 resolved), ready for EXECUTE
**Complexity**: SIMPLE (single-phase, 15 checklist steps, 4 source files + 1 test extension)
**Context:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`
**Issue**: GitHub #207 (CAL-2) — "Show ticket sale start and event start as separate calendar markers"
**Builds on**: CAL-1 (#206, `process/features/calendar/active/calendar-golive-events_06-07-26/`) — the `goLiveDate` marker is already code-complete. CAL-2 adds a parallel FOURTH source for `eventDate`.

## Phase Completion Rules

Single-phase SIMPLE plan. The phase is `CODE DONE` when checklist steps 1–14 are applied and step 15 gates pass (`bun run check` + `bun run test:unit:ci` green). It is only `VERIFIED` after the manual Agent-Probe render/click gate is performed on `/calendar` (purple chip renders on the event day, clicks through to `/leads/[id]`, both markers visible for a lead with both dates); e2e on-grid proof stays a pre-accepted Known-Gap until the shared Playwright auth fixture lands. Code-only completion is `CODE DONE`, never `VERIFIED`.

TL;DR: Add a FOURTH calendar source, mirroring CAL-1 exactly. Live-stage leads with an `eventDate` render as purple "Event Start" milestone chips (icon `calendarDays`, no time label), team-wide (respecting `visibilityCondition`), click-through to `/leads/[id]`. Four source-file edits + one unit-test extension. No schema, no migration. Fully-Automated unit coverage for the two new pure DB helpers; e2e rendering is a pre-accepted Known-Gap (no Playwright auth fixture). A lead with both `goLiveDate` and `eventDate` shows TWO distinct markers.

## Overview

CAL-1 gave `/calendar` a third entry source (`goLiveDate`, green `check` chip) alongside meetings (blue) and follow-ups (amber). CAL-2 adds a **fourth source**: the SAME live-stage leads, shown a second time on their `eventDate` (event start day) as a **purple** `calendarDays` "Event Start" chip. The pipeline was built to slot additional source arrays in identically, so this is additive and low-risk — it is a structural clone of CAL-1 with `eventDate` substituted for `goLiveDate` and a distinct purple/`calendarDays`/"Event Start" visual identity.

## Goals

- Live-stage leads appear on the calendar on their `eventDate` as a second marker (issue req 1).
- Event-start entries are visually distinct from go-live (green), meetings (blue), follow-ups (amber) — purple chip + `calendarDays` icon + "Event Start" label (req 2).
- A lead with both `goLiveDate` and `eventDate` shows TWO markers on their respective days (req: two markers per live lead).
- Clicking an event-start entry navigates to `/leads/[id]` (req 3).

## Scope

In scope: 4 source edits + 1 test edit listed under Touchpoints — a parallel clone of the CAL-1 go-live source.
Out of scope: schema/enum/column changes (`event_date` already exists at `schema.ts:169`), migrations, owner-scoping beyond the enforced `visibilityCondition` predicate, e2e rendering proof, any refactor of the existing go-live/meeting/follow-up sources.

## Locked design decisions (do not reopen)

| Decision | Chosen approach |
|---|---|
| `type` value | `'eventstart'` (mirrors the `'golive'` naming convention) |
| Color | Purple `text-purple-700 bg-purple-50 border-l-purple-500 hover:bg-purple-100` chip family — distinct from blue/amber/green |
| Icon | `calendarDays` (confirmed present in `Icon.svelte` ICONS) — distinct from `calendar` (meeting) + `check` (go-live) |
| Label | `'Event Start'` |
| Time label | Suppressed for `eventstart` entries (all-day milestone, same as go-live) |
| Summary type | `EventStartSummary { id: string; name: string; eventStartIso: string }` |
| Date normalization | `normalizeEventDate(dateStr)` — appends `T00:00:00` to a `'YYYY-MM-DD'` string → local-midnight ISO (avoids UTC-midnight day-shift); guard returns as-is if already contains `T`. Kept as a SEPARATE pure helper from `normalizeGoLiveDate` so each is independently unit-testable. |
| Conditions helper | `buildEventStartRangeConditions(): SQL[]` → `[isNull(deletedAt), eq(stage, 'live'), isNotNull(eventDate)]` |
| Async query | `getEventDatesInRange(rangeStart, rangeEnd, userId, role): Promise<EventStartSummary[]>` — mirrors `getGoLiveDatesInRange` exactly, but on `eventDate` |
| Scoping | Team-wide, but the query applies the enforced `visibilityCondition(userId, role)` predicate (same trust-boundary requirement as CAL-1 concern C2) so restricted (`only_me`/`selected`) live leads are not leaked |
| Calendar title source | Use the lead's `name` directly as `CalendarEntry.title` (no `handle` — `handle` is not a `crmLeads` column; same C1 resolution as CAL-1) |
| Route ID | `eventstart-${l.id}` |
| Range filter | Reuse existing pure `isWithinRange` helper (post-fetch), matching the meetings + go-live pattern |

## Touchpoints

Files changed (exactly 4) + 1 test extension:

1. `src/lib/types/index.ts` (~line 160) — widen `CalendarEntry.type` union to `'meeting' | 'followup' | 'golive' | 'eventstart'`.
2. `src/lib/server/db/leads.ts` — add two pure exported helpers + one async query + one summary type (mirroring the CAL-1 go-live block ~lines 1387–1453):
   - `EventStartSummary` type: `{ id: string; name: string; eventStartIso: string }`.
   - `normalizeEventDate(dateStr: string): string` — `dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00'` (pure, unit-testable; identical logic to `normalizeGoLiveDate`, kept separate for independent testability).
   - `buildEventStartRangeConditions(): SQL[]` — `[isNull(deletedAt), eq(stage, 'live'), isNotNull(eventDate)]` (pure, `.toSQL()`-testable).
   - `getEventDatesInRange(rangeStart, rangeEnd, userId, role): Promise<EventStartSummary[]>` — selects `{ id, name, eventDate }` for live, non-deleted, non-null-`eventDate` leads that pass `visibilityCondition(userId, role)`; maps each to `{ id, name, eventStartIso }` via `normalizeEventDate`; post-filters with `isWithinRange(eventStartIso, rangeStart, rangeEnd)`. Team-wide but visibility-scoped. Selects only `name` (no `handle`).

   Files read for context: existing `getGoLiveDatesInRange` / `normalizeGoLiveDate` / `buildGoLiveRangeConditions` / `LiveLeadSummary` block (leads.ts ~1387–1453) — clone it; `isWithinRange` + `visibilityCondition` patterns; Drizzle imports (`eq`, `isNull`, `isNotNull`, `and`) already present.
3. `src/routes/calendar/+page.server.ts` — add `getEventDatesInRange` to the import; add it as a FOURTH entry in the existing `Promise.all` (destructure `eventStarts`); build `eventStartEntries: CalendarEntry[]` (`type: 'eventstart'`, `startAt: eventStartIso`, `title: name`, `href: /leads/${id}`, `id: eventstart-${id}`); append `...eventStartEntries` to the merge array before the existing `.sort(...)`.
4. `src/lib/components/calendar/CalendarEntry.svelte` — extend the existing 3-way `entry.type` handling to 4-way. Add: `isEventStart` derived, purple class family for chip/border/bg, `calendarDays` icon, `'Event Start'` label, and suppress the `timeLabel` line for `eventstart` (both `detailed` and compact branches). Keep the existing blue/amber/green branches unchanged.
5. `src/tests/calendar-db.spec.ts` (extend) — Fully-Automated unit `describe` blocks for `normalizeEventDate` and `buildEventStartRangeConditions` (mirroring the existing `normalizeGoLiveDate` + `buildGoLiveRangeConditions` blocks).

## Public Contracts

- `CalendarEntry.type` union widens from 3 to 4 values (`+ 'eventstart'`). Additive — existing consumers unaffected. Only `CalendarEntry.svelte` branches exhaustively on `type` (grep-confirmed in CAL-1; `CalendarGrid.svelte` uses it only as an annotation). The new value must be handled there (checklist steps 10–12).
- New exported symbols from `src/lib/server/db/leads.ts`: `EventStartSummary`, `normalizeEventDate`, `buildEventStartRangeConditions`, `getEventDatesInRange`. `getEventDatesInRange` takes `(rangeStart, rangeEnd, userId, role)`. Server-only module (never imported client-side) — respects the "server-side DB access only" convention.
- No API route, no schema, no enum change. `'live'` stage + `event_date` column already exist (`schema.ts:169`).

## Blast Radius

- 4 source files + 1 test file. Single feature (calendar). All within `src/`.
- Risk class: **low overall, BUT touches a trust-boundary surface** (lead visibility) — identical class to CAL-1. No auth, no billing, no schema/migration, no public API contract, no destructive writes. Read-only DB query (SELECT). Additive union widening.
- `getEventDatesInRange` is a new rep-facing lead read; the repo enforces `visibilityCondition` on every rep-facing lead read (leads.ts:192,204). The query applies that predicate so restricted (`only_me`/`selected`) live leads never leak onto the shared calendar.
- Handle-derivation risk avoided: the query selects only `name` for the calendar title; `handle` is derived in `dbRowToLead`, not a `crmLeads` column.
- Regression surface: `/calendar` render path only. `CalendarEntry.svelte` is shared by all four types, so the 4-way extension must not alter the existing blue/amber/green output (keep those branches byte-stable; covered by `bun run check`).

## Implementation Checklist

1. `src/lib/types/index.ts` (~line 160): widen `CalendarEntry.type` to `'meeting' | 'followup' | 'golive' | 'eventstart'`; update the doc comment to mention eventstart → `/leads/[id]`.
2. `src/lib/server/db/leads.ts`: add `EventStartSummary` type `{ id: string; name: string; eventStartIso: string }` (no `handle`; title uses `name` directly). Place adjacent to the existing `LiveLeadSummary` block.
3. `src/lib/server/db/leads.ts`: add pure `normalizeEventDate(dateStr: string): string` — returns `dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00'`.
4. `src/lib/server/db/leads.ts`: add pure `buildEventStartRangeConditions(): SQL[]` returning `[isNull(deletedAt), eq(stage, 'live'), isNotNull(eventDate)]`.
5. `src/lib/server/db/leads.ts`: add async `getEventDatesInRange(rangeStart, rangeEnd, userId, role)` — `db.select({ id: crmLeads.id, name: crmLeads.name, eventDate: crmLeads.eventDate }).from(crmLeads).where(and(...buildEventStartRangeConditions(), visibilityCondition(userId, role)))`; map each row to `EventStartSummary` using `row.name` (do NOT read/derive `handle`), `eventStartIso` via `normalizeEventDate(row.eventDate!)`; post-filter with `isWithinRange(eventStartIso, rangeStart, rangeEnd)`; return array.
5a. `src/lib/server/db/leads.ts` (visibility — trust boundary): confirm `getEventDatesInRange` accepts `userId: string` and `role: Role` and applies `visibilityCondition(userId, role)` inside the `and(...)` WHERE clause — same pattern as `getGoLiveDatesInRange` / `getFollowUpsInRange` (leads.ts:192,204). Restricted (`only_me`/`selected`) live leads must not appear on other users' calendars.
5b. `src/tests/calendar-db.spec.ts` (visibility regression guard — VALIDATE concern C1-CAL2): add a Fully-Automated DB-free `.toSQL()` test asserting that `and(...buildEventStartRangeConditions(), visibilityCondition('user-1', 'rep')).toSQL()` composes the visibility predicate into the WHERE clause (assert the SQL text includes the visibility columns the predicate emits — e.g. `owner_id` / `visibility`). This is the automated regression guard that a future refactor cannot silently drop `visibilityCondition(...)` from `getEventDatesInRange` and leak restricted live leads. Mirror the `buildEventStartRangeConditions().toSQL()` assertion style already used for the base conditions.
6. `src/routes/calendar/+page.server.ts`: add `getEventDatesInRange` to the import from `$lib/server/db/leads`.
7. `src/routes/calendar/+page.server.ts`: add `getEventDatesInRange(start, end, locals.user.id, locals.user.role)` as a FOURTH promise in the existing `Promise.all` (destructure `eventStarts`). `locals.user` is non-null on this protected route.
8. `src/routes/calendar/+page.server.ts`: build `eventStartEntries: CalendarEntry[]` mapping each `eventStarts` row → `{ id: eventstart-${l.id}, type: 'eventstart', startAt: l.eventStartIso, title: l.name, href: /leads/${l.id} }` (no `subtitle`).
9. `src/routes/calendar/+page.server.ts`: include `...eventStartEntries` in the merge array before `.sort(...)`; keep the same sort comparator.
10. `src/lib/components/calendar/CalendarEntry.svelte`: add `isEventStart = $derived(entry.type === 'eventstart')`; extend `typeLabel` to 4-way (add `'Event Start'`).
11. `src/lib/components/calendar/CalendarEntry.svelte`: extend the wrapper `class` 3-way to 4-way — purple branch `border-l-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100`. Keep meeting (blue), follow-up (amber), and go-live (green) class strings byte-identical.
12. `src/lib/components/calendar/CalendarEntry.svelte`: 4-way the icon (`calendarDays` for eventstart) and the `detailed`-branch chip classes (purple `bg-purple-100 text-purple-700`); suppress the `{timeLabel}` span when `isEventStart` in both branches (same as `isGoLive`).
13. `src/tests/calendar-db.spec.ts`: add a `describe` block for `normalizeEventDate` (day-shift-safe: `'2026-07-15'` → `'2026-07-15T00:00:00'`; idempotent on already-ISO input) and for `buildEventStartRangeConditions` (`.toSQL()` asserts WHERE contains `deleted_at is null`, `stage = 'live'`, `event_date is not null`).
14. (reserved — no-op; keeps numbering stable after the 5a visibility insertion.)
15. Run verification gates (see below): `bun run check` → `bun run test:unit -- src/tests/calendar-db.spec.ts` → full `bun run test:unit:ci`.

## Acceptance Criteria

- AC1 (issue req 1): a live-stage lead with `eventDate` in the visible calendar range appears as an entry on its event day. Proven by: `getEventDatesInRange` condition + range-filter unit coverage (Fully-Automated); on-grid render is Known-Gap.
- AC2 (issue req 2): event-start entries are purple with `calendarDays` icon + "Event Start" label, distinct from green go-live / blue meetings / amber follow-ups. Proven by: `bun run check` (type-safe 4-way) + Agent-Probe visual review; automated visual = Known-Gap.
- AC3 (issue req 3): clicking an event-start entry navigates to `/leads/[id]`. Proven by: `href: /leads/${id}` mapping in `+page.server.ts` (code inspection / type check); click-through e2e = Known-Gap.
- AC4 (day-shift safety): `eventDate` `'YYYY-MM-DD'` buckets on the correct local day. Proven by: `normalizeEventDate` unit test (Fully-Automated).
- AC5 (two markers): a lead with BOTH `goLiveDate` and `eventDate` shows two distinct markers on their respective days. Proven by: independent go-live + event-start sources both merged (code inspection + type check); on-grid render = Agent-Probe / Known-Gap.
- AC6 (no regression): meetings, follow-ups, and go-live entries still render blue/amber/green unchanged. Proven by: `bun run check` + full `bun run test:unit:ci` green.
- AC7 (visibility — no leak): restricted-visibility live leads do NOT appear on other users' calendars. Proven by: `visibilityCondition(userId, role)` applied in the query (type-checked + DB-free `.toSQL()` composition guard, step 5b + Agent-Probe); live-DB row-filtering assertion = Known-Gap.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `normalizeEventDate('2026-07-15')` returns `'2026-07-15T00:00:00'`; idempotent on ISO input — `bun run test:unit -- src/tests/calendar-db.spec.ts` | Fully-Automated | AC4 (day-shift safety) |
| `buildEventStartRangeConditions()` `.toSQL()` WHERE contains `deleted_at is null` + `stage = 'live'` + `event_date is not null` | Fully-Automated | AC1 (correct live-lead selection) |
| `and(...buildEventStartRangeConditions(), visibilityCondition('user-1','rep'))` `.toSQL()` WHERE composes the visibility predicate (step 5b) | Fully-Automated | AC7 (trust-boundary composition — no-leak regression guard) |
| `isWithinRange(eventStartIso, start, end)` boundary behavior reused (already covered in calendar-db.spec) | Fully-Automated | AC1 (range windowing) |
| `bun run check` (svelte-check + tsc) green — 4-way `type` union type-safe + `getEventDatesInRange(rangeStart, rangeEnd, userId, role)` signature type-checks across the route call | Fully-Automated | AC2, AC3, AC5, AC6 (type-safe contract + no regression) |
| `bun run test:unit:ci` full suite green (263+ passing) | Fully-Automated | AC6 (no regression) |
| Manual: load `/calendar` with a seeded live lead having both dates; confirm purple `calendarDays` chip on the event day AND green `check` chip on the go-live day, click purple → `/leads/[id]` | Agent-Probe | AC1, AC2, AC3, AC5 (rendered behavior + two markers) |
| Manual: as a user WITHOUT visibility on a restricted (`only_me`) live lead, confirm its event-start marker does NOT appear on the calendar | Agent-Probe | AC7 (visibility scoping — live-DB no leak) |
| e2e rendering + click-through spec | Known-Gap | AC1–AC3, AC5 on-grid — no Playwright auth fixture (pre-accepted) |

**Known-Gap rationale (pre-accepted):** e2e rendering/click proof requires an authenticated Playwright session. No shared auth fixture exists — every protected-route e2e self-skips (see `all-tests.md` Known Gaps + `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is the repo-wide highest-leverage test-infra gap, not specific to this plan. Backlog stub: when the shared auth fixture lands, add an `e2e/calendar-eventstart.e2e.ts` scenario asserting the purple chip renders and clicks through to `/leads/[id]`, and that a two-date lead shows both markers. Manual Agent-Probe covers the gap in the interim; AC1–AC3 + AC5 rendered behavior remains CONDITIONAL on the manual gate, not vacuously green.

## Dependencies

- CAL-1 (#206, `calendar-golive-events` plan) — the 3-source pipeline + 3-way `CalendarEntry.svelte` this plan extends. CAL-1 must be merged/present before CAL-2 EXECUTE (this plan clones its structure). If CAL-1 is not yet on the working branch, the `isGoLive`/green branch and `getGoLiveDatesInRange` referenced here will not exist — confirm CAL-1 state at RESEARCH/EXECUTE entry. **VALIDATE confirmed CAL-1 is PRESENT on branch `feat/195-editable-live-event-dates` (`getGoLiveDatesInRange` imported at `+page.server.ts:3`; `isGoLive`/green branch at `CalendarEntry.svelte:10,26-27`; clone template at `leads.ts:1395-1450`).**
- `event_date` column already exists (`schema.ts:169`, within `crmLeads` 145–245) — no migration.
- Pure helper `isWithinRange` (leads.ts:1336) + `visibilityCondition` (leads.ts:204) patterns in `leads.ts` (already present).
- No new packages. No migration.

## Risks

- **CAL-1 not-yet-landed** (VALIDATE-RESOLVED — CAL-1 confirmed present on the branch): CAL-2 extends CAL-1's 3-way component + go-live source. Verified at VALIDATE V1 scout — the green branch and `getGoLiveDatesInRange` exist. If a later branch diverges, re-confirm at EXECUTE entry.
- **Day-shift regression** (medium likelihood, low impact): mitigated by `normalizeEventDate` + its unit test. Do NOT pass bare `eventDate` to `new Date()`.
- **Shared-component regression** (low likelihood, medium impact): `CalendarEntry.svelte` renders all four types; keep blue/amber/green branch output identical during the 4-way extension. Mitigated by `bun run check` + full unit suite. No component render test exists — the byte-stable claim rests on type check + manual Agent-Probe.
- **`eventDate` null-typing**: Drizzle returns `string | null`; the query filters `isNotNull` in SQL, so the mapper may use `row.eventDate!` safely (non-null asserted post-filter).
- **Visibility bypass** (VALIDATE concern C1-CAL2): `visibilityCondition(userId, role)` applied in the query WHERE clause (checklist steps 5, 5a, 7); restricted live leads are not returned. A DB-free `.toSQL()` composition test (step 5b) now guards against a refactor silently dropping the predicate.

## Test Infra Improvement Notes

(none identified yet — the e2e auth-fixture gap is a pre-existing repo-wide backlog item, not new to this plan. The live-DB row-filtering assertion for AC7 remains a repo-wide Known-Gap pending a live-DB CI harness.)

## Resume and Execution Handoff

1. Selected plan file: `process/features/calendar/active/cal-2-two-calendar-markers_06-07-26/cal-2-two-calendar-markers_PLAN_06-07-26.md`
2. Last completed step: VALIDATE re-run from V1 (PASS). First pass returned CONDITIONAL (1 concern C1-CAL2 — AC7 automated visibility-composition gate); PVL supplement applied inline (checklist step 5b + AC7 + Verification Evidence row). Re-run confirmed C1-CAL2 resolved — supplement is empirically feasible (mirrors the `owner_id` `.toSQL()` guard at calendar-db.spec.ts:23-38; `visibilityCondition('user-1','rep')` emits `owner_id`+`visibility`).
3. Validate-contract status: written (06-07-26) — Gate PASS (1 PVL supplement cycle); concern C1-CAL2 resolved by the applied supplement (step 5b), confirmed feasible at the re-run.
4. Supporting context loaded: `all-context.md`, `tests/all-tests.md`, `planning/all-planning.md`; CAL-1 plan (`calendar-golive-events_PLAN_06-07-26.md`) as the structural template; source files `+page.server.ts`, `CalendarEntry.svelte`, `types/index.ts`, `leads.ts` (go-live block + `visibilityCondition` pattern), `calendar-db.spec.ts`.
5. Next step for a fresh agent: EXECUTE checklist steps 1–15 (incl. 5b) in order; confirm CAL-1 presence on the branch first; run gates from Verification Evidence. VALIDATE is PASS — proceed to EXECUTE.

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl
supersedes: 06-07-26 (outer-pvl) — first-pass CONDITIONAL contract superseded after 1 PVL supplement cycle (step 5b) resolved concern C1-CAL2

Parallel strategy: sequential
Rationale: signal score 2/7 (S6 — trust-boundary surface; S7 — 5 files in blast radius). Four tightly-coupled edits in one feature with a sequential data dependency (type → query → route → component → test) plus one test extension; one vc-execute-agent on opus is the right fit. Not fan-out-shaped. Layer 1 (4 dimensions) + Layer 2 (5 sections) fan-out was run inline (Simple Mode, sequential) — all evidence loaded, structural clone of already-validated CAL-1, no cross-agent coordination needed.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | `normalizeEventDate('2026-07-15')` → `'2026-07-15T00:00:00'`, idempotent on ISO input (day-shift safe) | Fully-Automated | `bun run test:unit -- src/tests/calendar-db.spec.ts` (new `describe('normalizeEventDate')`) | B |
| AC1 | `buildEventStartRangeConditions()` WHERE = `deleted_at is null` + `stage = 'live'` + `event_date is not null` | Fully-Automated | `.toSQL()` assertion in `src/tests/calendar-db.spec.ts` | B |
| AC7 | `getEventDatesInRange` composes `visibilityCondition(userId, role)` into the query WHERE (trust-boundary no-leak regression guard) | Fully-Automated | NEW (step 5b): `and(...buildEventStartRangeConditions(), visibilityCondition('user-1','rep')).toSQL()` WHERE includes the visibility predicate | B |
| AC1 | Range windowing of event-start dates (`isWithinRange(eventStartIso, start, end)`) | Fully-Automated | existing `isWithinRange` coverage in `calendar-db.spec.ts` | A |
| AC2/AC3/AC5/AC6 | 4-way `CalendarEntry.type` union is type-safe across component + mappers | Fully-Automated | `bun run check` exits 0 | B |
| AC6 | No regression across the unit suite (meetings/follow-ups/go-live unaffected) | Fully-Automated | `bun run test:unit:ci` exits 0 (263+ passing) | A |
| AC1/AC2/AC3/AC5 | Rendered purple `calendarDays` chip on event day + green `check` on go-live day + click → `/leads/[id]` + two markers | Agent-Probe | Manual: load `/calendar` with a two-date live lead | D |
| AC7 | Restricted (`only_me`) live lead hidden from other users' calendar (live-DB row filtering) | Agent-Probe | Manual: as a non-visible user, confirm the event-start marker is absent | D |
| AC1–AC3, AC5 | On-grid e2e render + click-through | (Known-Gap residual) | — no shared Playwright auth fixture | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a strategy value — it is a named residual carried via gap-resolution D.

Failing stub (AC4 — Fully-Automated):
```ts
test("should normalize 'YYYY-MM-DD' to local-midnight ISO without day-shift", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: normalizeEventDate('2026-07-15') === '2026-07-15T00:00:00'")
})
```

Failing stub (AC1 conditions — Fully-Automated):
```ts
test("should build WHERE with deleted_at is null, stage = 'live', event_date is not null", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildEventStartRangeConditions().toSQL() WHERE clause")
})
```

Failing stub (AC7 visibility composition — Fully-Automated, step 5b):
```ts
test("should compose visibilityCondition into the event-start query WHERE (no restricted-lead leak)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: and(...buildEventStartRangeConditions(), visibilityCondition('user-1','rep')).toSQL() WHERE includes the visibility predicate")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- DB helpers (leads.ts): Fully-automated: `bun run test:unit -- src/tests/calendar-db.spec.ts`
- Visibility composition guard (leads.ts / conditions): Fully-automated: `.toSQL()` assertion on composed event-start WHERE (step 5b)
- Type contract (types + component + route): Fully-automated: `bun run check`
- Regression: Fully-automated: `bun run test:unit:ci`
- Rendered chip + click-through + two markers: agent-probe: load `/calendar`, seed a two-date live lead, confirm purple `calendarDays` chip + green `check` chip + click → `/leads/[id]`
- Live-DB visibility no-leak: agent-probe: as a non-visible user, confirm restricted live lead's marker is absent
- On-grid e2e: known-gap: documented — no shared Playwright auth fixture (pre-accepted, repo-wide)

Dimension findings:
- Infra fit: PASS — no container/port/runtime surface. All 5 target paths exist; CAL-1's 3-source pipeline + 3-way component confirmed PRESENT on branch `feat/195-editable-live-event-dates` (`getGoLiveDatesInRange` imported at `+page.server.ts:3`; `isGoLive`/green branch at `CalendarEntry.svelte:10,26-27`; clone template at `leads.ts:1395-1450`); `crmLeads.eventDate` valid (`schema.ts:169`, inside `crmLeads` 145-245); `calendarDays` icon present (`Icon.svelte:23`); Drizzle ops (`eq`/`isNull`/`isNotNull`/`and`) already imported; test commands (`bun run check`, `bun run test:unit:ci`) verified against `tests/all-tests.md`.
- Test coverage: PASS — the two new pure helpers (`normalizeEventDate`, `buildEventStartRangeConditions`) get Fully-Automated coverage mirroring the established go-live blocks; `isWithinRange` reuse + `bun run check` + full suite cover selection/type/regression. AC7 (visibility predicate composed into `getEventDatesInRange`) — originally the sole CONCERN (no Fully-Automated gate) — is now covered by checklist step 5b, a DB-free `.toSQL()` composition guard (gap-resolution B). Re-run confirmed the guard is empirically feasible: it clones the existing `owner_id` `.toSQL()` regression guard at `calendar-db.spec.ts:23-38`, and `visibilityCondition('user-1','rep')` returns the non-manager `or(...)` clause emitting `owner_id`+`visibility` (not the manager `sql`true`` short-circuit). Every developed DB behavior now has a Fully-Automated gate (not vacuously green). Rendered AC2/AC3/AC5 rest on `bun run check` + Agent-Probe; live-DB AC7 row-filtering + e2e on-grid are pre-accepted named-residual Known-Gaps.
- Breaking changes: PASS — `CalendarEntry.type` widens 3→4 (additive); only `CalendarEntry.svelte` branches exhaustively on it (grep-confirmed in CAL-1; `CalendarGrid.svelte` uses it only as an annotation); new symbols are server-only; no schema/enum/API change; `event_date` column pre-exists (no migration).
- Security surface: PASS — the plan APPLIES `visibilityCondition(userId, role)` inside `getEventDatesInRange` (steps 5, 5a, 7), closing the trust boundary at the code level (STRIDE Information Disclosure mitigated — restricted `only_me`/`selected` live leads are not returned), AND step 5b now adds a Fully-Automated DB-free `.toSQL()` composition guard so a future refactor cannot silently drop `visibilityCondition(...)` from the `and(...)` and leak restricted leads. Re-run confirmed the guard is feasible (mirrors the proven `owner_id` guard pattern in the same spec file). Not a high-risk auth/billing surface — read-only visibility-scoped SELECT; no evidence pack required.
- Section A (types union widen): PASS — mechanically trivial additive widening at `types/index.ts:160`; only `CalendarEntry.svelte` branches on `type`. Highest-risk edit: none.
- Section B (leads.ts helpers + query): PASS — mechanically feasible; clone template present (`leads.ts:1395-1450`, with `getGoLiveDatesInRange` composing `visibilityCondition` at :1441), `crmLeads.eventDate` valid (`schema.ts:169`), Drizzle ops imported. The AC7 automated visibility-composition gate gap is closed by step 5b. Conflicts: none. Highest-risk edit: `getEventDatesInRange` visibility composition — mirror `getGoLiveDatesInRange` exactly; the step 5b `.toSQL()` test now regression-guards the trust boundary rather than leaving it manual-only.
- Section C (+page.server.ts 4th source): PASS — current 3-source `Promise.all` (lines 23-27), `goLiveEntries` mapping (51-57), merge+sort (59-61) all confirmed; adding a 4th destructure + `eventStartEntries` + spread is a clean additive clone; `locals.user` non-null guard present (line 9). Highest-risk edit: destructure order in `Promise.all` must align with the added 4th promise — mirror the go-live wiring exactly.
- Section D (CalendarEntry.svelte 4-way): PASS — current 3-way handling confirmed at every branch point (`isMeeting`/`isGoLive` at 9-10, `typeLabel`/`iconName` ternaries 12-13, wrapper class 3-way 24-30, detailed chip 3-way 36-40, `!isGoLive` time suppression 42-44). 4-way extension is mechanical; keep blue/amber/green byte-stable (`bun run check` + manual). Style note (non-blocking): the ternary chains become 4-deep — a lookup map would read cleaner, but a 4-way ternary is acceptable and lower-risk (byte-stable existing branches).
- Section E (calendar-db.spec.ts): PASS — mirror `describe` pattern established (`normalizeGoLiveDate` block at :84, `buildGoLiveRangeConditions` block at :95); adding `normalizeEventDate` + `buildEventStartRangeConditions` + the step-5b composition block is a direct clone.

Open gaps:
- C1-CAL2 (AC7 automated visibility-composition gate) — **RESOLVED** (1 PVL supplement cycle): `visibilityCondition` IS applied in the query (code-level trust-boundary closed); the Fully-Automated DB-free `.toSQL()` composition guard added as checklist step 5b (gap-resolution B) prevents a refactor from silently dropping the predicate. Re-run confirmed feasibility — the guard clones the proven `owner_id` `.toSQL()` pattern (`calendar-db.spec.ts:23-38`) and `visibilityCondition('user-1','rep')` emits `owner_id`+`visibility`. No open concerns remain.
- known-gap (AC7 live-DB row filtering): known-gap: documented — no live-DB CI harness; the assertion that a restricted live lead is actually filtered OUT at runtime is manual Agent-Probe until a live-DB test harness lands (repo-wide, pre-accepted). Excluded from CONCERN count.
- known-gap (e2e on-grid render/click + two markers): known-gap: documented as pre-accepted repo-wide — no shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Backlog stub: `e2e/calendar-eventstart.e2e.ts`. Excluded from CONCERN count.

What this coverage does NOT prove:
- `bun run test:unit -- src/tests/calendar-db.spec.ts` proves the two pure helpers (`normalizeEventDate`, `buildEventStartRangeConditions`) in isolation; it does NOT prove the `getEventDatesInRange` row→summary assembly against real data — that runs against no DB in unit scope.
- The step-5b `.toSQL()` composition test proves `visibilityCondition` is COMPOSED into the WHERE; it does NOT prove that at runtime a restricted (`only_me`/`selected`) live lead is actually filtered OUT of the result set (that needs a live DB — Agent-Probe + Known-Gap).
- `bun run check` proves the 4-way union + the 4-arg query signature are type-safe; it does NOT prove the rendered purple chip class strings, the `calendarDays` icon, the suppressed time label, or that blue/amber/green output is byte-identical (no component render test exists).
- `bun run test:unit:ci` proves no unit regression; it does NOT exercise `/calendar` SSR, the calendar grid render, click-through navigation, or the two-marker layout.
- Agent-Probe proves rendered appearance + one click path + two markers for a seeded lead; it does NOT prove behavior across timezones or empty ranges.

Gate: PASS (0 FAILs, 0 CONCERNs after 1 PVL supplement cycle — concern C1-CAL2 resolved by step 5b, confirmed feasible at the V1→V7 re-run. Two Known-Gaps — live-DB AC7 row-filtering + e2e on-grid render — are pre-accepted, documented named residuals, excluded from the concern count and not the sole proof of any developed behavior. Not vacuously green: every developed DB behavior has a Fully-Automated gate; rendered behavior has `bun run check` + Agent-Probe.)
Accepted by: session — PASS gate, no outstanding concerns. C1-CAL2 resolved by 1 PVL supplement cycle (step 5b). The two pre-accepted Known-Gaps (live-DB visibility filtering, e2e on-grid render) remain on record (repo-wide, documented in Verification Evidence + Open gaps).

## Autonomous Goal Block

```text
SESSION GOAL: CAL-2 two calendar markers — render live-stage leads' eventDate as purple "Event Start" milestone chips on /calendar (icon calendarDays), distinct from go-live (green), meetings (blue), follow-ups (amber); a lead with both dates shows two markers; click-through to /leads/[id].
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: standard RIPER-5; feedback_autonomous_phase_execution rules — reversible edits auto-proceed, surface only hard stops.
Hard stop conditions / safety constraints:
- Do not leak restricted-visibility (only_me / selected) live leads onto the shared calendar — visibilityCondition(userId, role) applied in getEventDatesInRange (steps 5, 5a, 7) AND regression-guarded by the step-5b .toSQL() composition test.
- Do not read a nonexistent crmLeads.handle column — the query selects only name, used as the calendar title.
- Keep meeting (blue) + follow-up (amber) + go-live (green) CalendarEntry.svelte class strings byte-identical during the 4-way extension.
- No schema / migration / enum changes (event_date already exists at schema.ts:169).
- CAL-1 (#206) confirmed present on the branch (VALIDATE-verified) — CAL-2 extends its 3-way component + go-live source.
Next phase: EXECUTE (VALIDATE PASS — C1-CAL2 resolved): process/features/calendar/active/cal-2-two-calendar-markers_06-07-26/cal-2-two-calendar-markers_PLAN_06-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate PASS, supplement step 5b applied and confirmed)
Execute start: fully-auto: bun run check ; bun run test:unit -- src/tests/calendar-db.spec.ts ; bun run test:unit:ci | agent-probe: load /calendar with a seeded live lead having both dates, confirm purple calendarDays chip + green check chip, click purple → /leads/[id]; confirm restricted live lead hidden | high-risk pack: no (visibility-scoped)
```
