---
name: plan:calendar-golive-events
description: Show live-stage lead goLiveDate milestones on the calendar, visually distinct (green) from meetings/follow-ups, click-through to /leads/[id]
date: 06-07-26
feature: calendar
---

# Calendar go-live events — Implementation Plan (SIMPLE)

**Date**: 06-07-26
**Status**: Active — plan written, pending VALIDATE
**Complexity**: SIMPLE (single-phase, 15 checklist steps, 4 source files)
**Context:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`

## Phase Completion Rules

Single-phase SIMPLE plan. The phase is `CODE DONE` when checklist steps 1–14 are applied and step 15 gates pass (`bun run check` + `bun run test:unit:ci` green). It is only `VERIFIED` after the manual Agent-Probe render/click gate is performed on `/calendar`; e2e on-grid proof stays a pre-accepted Known-Gap until the shared Playwright auth fixture lands. Code-only completion is `CODE DONE`, never `VERIFIED`.

TL;DR: Add a third calendar source. Live-stage leads with a `goLiveDate` render as green "go-live" milestone chips (icon `check`, no time label), team-wide (respecting `visibilityCondition`), click-through to `/leads/[id]`. Four source-file edits + one unit-test extension. No schema, no migration. Fully-Automated unit coverage for the new DB helpers; e2e rendering is a pre-accepted Known-Gap (no Playwright auth fixture).

## Overview

The calendar (`/calendar`) currently renders two entry sources — meetings and follow-ups — merged into one sorted `CalendarEntry[]`. This plan adds a **third source**: leads in the `'live'` stage that have a `goLiveDate`, shown on their go-live day. The pipeline is designed to slot a third source array in identically, so this is additive and low-risk.

## Goals

- Live-stage leads appear on the calendar on their `goLiveDate` (GitHub issue req 1).
- Go-live entries are visually distinct from meetings (blue) and follow-ups (amber) — green chip + `check` icon + "Go-live" label (req 2).
- Clicking a go-live entry navigates to `/leads/[id]` (req 3).

## Scope

In scope: 4 source edits + 1 test edit listed under Touchpoints.
Out of scope: schema/enum/column changes (all exist in `development` via PR #220), migrations, owner-scoping/filtering of go-live entries beyond the enforced `visibilityCondition` predicate, e2e rendering proof.

## Locked design decisions (do not reopen)

| Decision | Chosen approach |
|---|---|
| Date normalization | Server mapper converts `goLiveDate` `'YYYY-MM-DD'` → local-midnight ISO by appending `T00:00:00` (avoids UTC-midnight day-shift in negative-offset zones) |
| Scoping | Team-wide — all authenticated users see live leads' go-live dates, BUT the query still applies the enforced `visibilityCondition(userId, role)` predicate so restricted (`only_me` / `selected`) live leads are not leaked (VALIDATE concern C2 — resolved in checklist step 5a). |
| Calendar title source | Use the lead's `name` directly as the `CalendarEntry.title` (VALIDATE concern C1 — resolved via option (b): the query selects only `name`, avoiding the derived `handle` field which is NOT a `crmLeads` column). No `subtitle`/handle on go-live entries. |
| Icon | `check` (confirmed present in `Icon.svelte` ICONS) |
| Time label | Suppressed for `golive` entries (all-day milestone) |
| Color | Green `text-green-700 bg-green-50 border-l-green-500` chip family (aligns with `--color-stage-live: #16a34a`) |
| `type` value | `'golive'` |
| Range filter | Reuse existing pure `isWithinRange` helper (post-fetch), matching the meetings pattern in `+page.server.ts` |

## Touchpoints

Files changed (exactly 4) + 1 test extension:

1. `src/lib/types/index.ts` (~line 159) — widen `CalendarEntry.type` union to `'meeting' | 'followup' | 'golive'`.
2. `src/lib/server/db/leads.ts` — add two pure exported helpers + one async query:
   - `buildGoLiveRangeConditions(): SQL[]` — `isNull(deletedAt)`, `eq(stage, 'live')`, `isNotNull(goLiveDate)` (pure, `.toSQL()`-testable, mirrors `buildFollowUpsRangeLeadConditions`).
   - `normalizeGoLiveDate(dateStr: string): string` — appends `T00:00:00` to a `'YYYY-MM-DD'` string → local-midnight ISO (pure, unit-testable).
   - `getGoLiveDatesInRange(rangeStart: Date, rangeEnd: Date, userId: string, role: string): Promise<LiveLeadSummary[]>` — selects `{ id, name, goLiveDate }` for live, non-deleted, non-null-goLiveDate leads that pass `visibilityCondition(userId, role)`; maps each to `{ id, name, goLiveIso }` via `normalizeGoLiveDate`; post-filters with `isWithinRange(goLiveIso, rangeStart, rangeEnd)`. Team-wide but visibility-scoped (concern C2). Selects only `name` for the calendar title, avoiding the derived `handle` field (concern C1).
   - `LiveLeadSummary` type: `{ id: string; name: string; goLiveIso: string }` (define adjacent to the query, or inline).

   Files read for context: existing `getFollowUpsInRange` / `isWithinRange` / `buildFollowUpsRangeLeadConditions` / `visibilityCondition` patterns (lines 192–1384); Drizzle imports (`eq`, `isNull`, `isNotNull`, `and`) already imported in the module.
3. `src/routes/calendar/+page.server.ts` — call `getGoLiveDatesInRange(start, end, locals.user.id, locals.user.role)` inside the existing `Promise.all`; build a `goLiveEntries: CalendarEntry[]` array (`type: 'golive'`, `startAt: goLiveIso`, `title: name`, `href: /leads/${id}`, `id: golive-${id}`); append to the merge array before the existing `.sort(...)`.
4. `src/lib/components/calendar/CalendarEntry.svelte` — convert the `isMeeting` binary to a 3-way `entry.type` check. Add: `isGoLive` derived, green class family for chip/border/bg, `check` icon for golive, "Go-live" label, and suppress the `timeLabel` line for golive (both `detailed` and compact branches). Keep the existing blue/amber branches unchanged.
5. `src/tests/calendar-db.spec.ts` (extend) — Fully-Automated unit tests for the two new pure helpers (see Verification Evidence).

## Public Contracts

- `CalendarEntry.type` union widens from 2 to 3 values. Additive — existing `'meeting'`/`'followup'` consumers unaffected. Any exhaustive `switch`/conditional over `type` must handle the new value (only `CalendarEntry.svelte` branches on it; grep confirms no other exhaustive consumer — `CalendarGrid.svelte` uses the type only as an annotation).
- New exported symbols from `src/lib/server/db/leads.ts`: `buildGoLiveRangeConditions`, `normalizeGoLiveDate`, `getGoLiveDatesInRange`, `LiveLeadSummary`. `getGoLiveDatesInRange` takes `(rangeStart, rangeEnd, userId, role)`. Server-only module (never imported client-side) — respects the "server-side DB access only" convention.
- No API route, no schema, no enum change. `'live'` stage + `go_live_date` column already exist in `development`.

## Blast Radius

- 4 source files + 1 test file. Single feature (calendar). All within `src/`.
- Risk class: **low overall, BUT touches a trust-boundary surface** (lead visibility). No auth, no billing, no schema/migration, no public API contract, no destructive writes. Read-only DB query (SELECT). Additive union widening. `getGoLiveDatesInRange` is a new rep-facing lead read; the repo enforces `visibilityCondition` on every rep-facing lead read (leads.ts:192,204), so the query applies that predicate (concern C2, checklist step 5a) — restricted live leads never leak onto the shared calendar.
- Handle-derivation risk removed: the query selects only `name` for the calendar title and never reads a `handle` field (`handle` is derived in `dbRowToLead`, not a `crmLeads` column — concern C1, resolved via option (b) in checklist steps 2 + 5).
- Regression surface: `/calendar` render path only; `CalendarEntry.svelte` is shared by meeting+followup rendering, so the 3-way refactor must not alter the existing blue/amber output (covered by keeping those branches byte-stable and by `bun run check`).

## Implementation Checklist

1. `src/lib/types/index.ts` (~line 159): widen `CalendarEntry.type` to `'meeting' | 'followup' | 'golive'`; update the doc comment to mention golive → `/leads/[id]`.
2. `src/lib/server/db/leads.ts`: add `LiveLeadSummary` type `{ id: string; name: string; goLiveIso: string }` (no `handle` — the calendar title uses `name` directly; C1 option (b)).
3. `src/lib/server/db/leads.ts`: add pure `normalizeGoLiveDate(dateStr: string): string` — returns `dateStr + 'T00:00:00'` (guard: if already contains `T`, return as-is).
4. `src/lib/server/db/leads.ts`: add pure `buildGoLiveRangeConditions(): SQL[]` returning `[isNull(deletedAt), eq(stage, 'live'), isNotNull(goLiveDate)]`.
5. `src/lib/server/db/leads.ts`: add async `getGoLiveDatesInRange(rangeStart, rangeEnd, userId, role)` — `db.select({ id: crmLeads.id, name: crmLeads.name, goLiveDate: crmLeads.goLiveDate }).from(crmLeads).where(and(...buildGoLiveRangeConditions(), visibilityCondition(userId, role)))`; map each row to `LiveLeadSummary` using `row.name` as the display name (do NOT read/derive `handle`), `goLiveIso` via `normalizeGoLiveDate(row.goLiveDate!)`; post-filter with `isWithinRange(goLiveIso, rangeStart, rangeEnd)`; return array. (C1 + C2 resolved.)
5a. `src/lib/server/db/leads.ts` (visibility — concern C2): confirm `getGoLiveDatesInRange` accepts `userId: string` and `role: string` and applies `visibilityCondition(userId, role)` inside the `and(...)` WHERE clause — same pattern as `getFollowUpsInRange` / `listPipelineStage` (leads.ts:192,204). This is the trust-boundary guard: restricted (`only_me` / `selected`) live leads must not appear on other users' calendars. If a `LiveLeadSummary` local type is declared in `src/lib/types/index.ts`, keep it in sync (it carries no `userId`/`role` — those are query params, not summary fields).
6. `src/routes/calendar/+page.server.ts`: add `getGoLiveDatesInRange` to the import from `$lib/server/db/leads`.
7. `src/routes/calendar/+page.server.ts`: add `getGoLiveDatesInRange(start, end, locals.user.id, locals.user.role)` as a third promise in the existing `Promise.all` (destructure `goLives`). Pass `locals.user.id` and the user's role (concern C2); confirm `locals.user` is non-null on this protected route (it is — `/calendar` is behind the session gate).
8. `src/routes/calendar/+page.server.ts`: build `goLiveEntries: CalendarEntry[]` mapping each `goLives` row → `{ id: golive-${l.id}, type: 'golive', startAt: l.goLiveIso, title: l.name, href: /leads/${l.id} }` (no `subtitle` — go-live chips show the lead name only).
9. `src/routes/calendar/+page.server.ts`: include `...goLiveEntries` in the merge array before `.sort(...)`; keep the same sort comparator.
10. `src/lib/components/calendar/CalendarEntry.svelte`: add `isGoLive = $derived(entry.type === 'golive')`; change `typeLabel` to a 3-way (`Meeting` / `Follow-up` / `Go-live`).
11. `src/lib/components/calendar/CalendarEntry.svelte`: convert the wrapper `class` blue/amber ternary to a 3-way — green branch `border-l-green-500 bg-green-50 text-green-700 hover:bg-green-100`. Keep the meeting (blue) and follow-up (amber) class strings byte-identical.
12. `src/lib/components/calendar/CalendarEntry.svelte`: 3-way the icon (`check` for golive) and the `detailed`-branch chip classes (green `bg-green-100 text-green-700`); suppress the `{timeLabel}` span when `isGoLive` in both branches.
13. `src/tests/calendar-db.spec.ts`: add a `describe` block for `normalizeGoLiveDate` (day-shift-safe: `'2026-07-15'` → `'2026-07-15T00:00:00'`; idempotent on already-ISO input) and for `buildGoLiveRangeConditions` (`.toSQL()` asserts WHERE contains `deleted_at is null`, `stage = 'live'`, `go_live_date is not null`).
14. (reserved — no-op; keeps downstream numbering stable after the C2 insertion at 5a.)
15. Run verification gates (see below): `bun run check` → `bun run test:unit -- src/tests/calendar-db.spec.ts` → full `bun run test:unit:ci`.

## Acceptance Criteria

- AC1 (issue req 1): a live-stage lead with `goLiveDate` in the visible calendar range appears as an entry on its go-live day. Proven by: `getGoLiveDatesInRange` condition + range-filter unit coverage (Fully-Automated); on-grid render is Known-Gap.
- AC2 (issue req 2): go-live entries are green with `check` icon + "Go-live" label, distinct from blue meetings / amber follow-ups. Proven by: `bun run check` (type-safe 3-way) + Agent-Probe visual review; automated visual = Known-Gap.
- AC3 (issue req 3): clicking a go-live entry navigates to `/leads/[id]`. Proven by: `href: /leads/${id}` mapping in `+page.server.ts` (code inspection / type check); click-through e2e = Known-Gap.
- AC4 (day-shift safety): `goLiveDate` `'YYYY-MM-DD'` buckets on the correct local day. Proven by: `normalizeGoLiveDate` unit test (Fully-Automated).
- AC5 (no regression): meetings and follow-ups still render blue/amber unchanged. Proven by: `bun run check` + full `bun run test:unit:ci` green.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `normalizeGoLiveDate('2026-07-15')` returns `'2026-07-15T00:00:00'`; idempotent on ISO input — `bun run test:unit -- src/tests/calendar-db.spec.ts` | Fully-Automated | AC4 (day-shift safety) |
| `buildGoLiveRangeConditions()` `.toSQL()` WHERE contains `deleted_at is null` + `stage = 'live'` + `go_live_date is not null` | Fully-Automated | AC1 (correct live-lead selection) |
| `isWithinRange(goLiveIso, start, end)` boundary behavior reused (already covered in calendar-db.spec) | Fully-Automated | AC1 (range windowing) |
| `bun run check` (svelte-check + tsc) green — 3-way `type` union type-safe + `getGoLiveDatesInRange(rangeStart, rangeEnd, userId, role)` signature type-checks across the route call | Fully-Automated | AC2, AC3, AC5 (type-safe contract + no regression) |
| `bun run test:unit:ci` full suite green (263+ passing) | Fully-Automated | AC5 (no regression) |
| Manual: load `/calendar` with a seeded live lead; confirm green `check` chip on the go-live day, click → `/leads/[id]` | Agent-Probe | AC1, AC2, AC3 (rendered behavior) |
| Manual: as a user WITHOUT visibility on a restricted (`only_me`) live lead, confirm it does NOT appear on the calendar | Agent-Probe | C2 (visibility scoping — no leak) |
| e2e rendering + click-through spec | Known-Gap | AC1–AC3 on-grid — no Playwright auth fixture (pre-accepted) |

**Known-Gap rationale (pre-accepted):** e2e rendering/click proof requires an authenticated Playwright session. No shared auth fixture exists — every protected-route e2e self-skips (see `all-context.md` v1 remaining work #1 and `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is the repo-wide highest-leverage test-infra gap, not specific to this plan. Backlog stub: when the shared auth fixture lands, add an `e2e/calendar-golive.e2e.ts` scenario asserting the green chip renders and clicks through to `/leads/[id]`. Manual Agent-Probe covers the gap in the interim; AC1–AC3 remain CONDITIONAL on the manual gate, not vacuously green.

## Dependencies

- PR #220 (`'live'` stage enum value + `go_live_date` column) — already merged into `development` (current branch). Verified during VALIDATE: `'live'` at `schema.ts:64`, `goLiveDate: date('go_live_date')` at `schema.ts:207`.
- Pure helper `isWithinRange` and `visibilityCondition` patterns in `leads.ts` (already present).
- No new packages. No migration.

## Risks

- **Day-shift regression** (medium likelihood, low impact): mitigated by `normalizeGoLiveDate` + its unit test. Do NOT pass bare `goLiveDate` to `new Date()`.
- **Shared-component regression** (low likelihood, medium impact): `CalendarEntry.svelte` renders all three types; keep blue/amber branch output identical during the 3-way refactor. Mitigated by `bun run check` + full unit suite. No component render test exists — the blue/amber "byte-stable" claim rests on type check + manual Agent-Probe.
- **`goLiveDate` null-typing**: Drizzle returns `string | null`; the query filters `isNotNull` in SQL, so the mapper may use `row.goLiveDate!` safely (non-null asserted post-filter).
- **Handle-derivation (VALIDATE C1 — RESOLVED)**: avoided entirely by selecting only `name` and using it as the title (option (b)); no `handle` read.
- **Visibility bypass (VALIDATE C2 — RESOLVED)**: `visibilityCondition(userId, role)` applied in the query WHERE clause; restricted live leads are not returned.

## Test Infra Improvement Notes

(none identified yet — the e2e auth-fixture gap is a pre-existing repo-wide backlog item, not new to this plan.)

## Resume and Execution Handoff

1. Selected plan file: `process/features/calendar/active/calendar-golive-events_06-07-26/calendar-golive-events_PLAN_06-07-26.md`
2. Last completed step: VALIDATE run (CONDITIONAL, 2 concerns) → PVL supplement applied (C1 handle derivation via option (b); C2 visibility filtering added as step 5a + signature change).
3. Validate-contract status: written (06-07-26) — Gate CONDITIONAL; supplement applied, pending PVL re-run from V1.
4. Supporting context loaded: `all-context.md`, `tests/all-tests.md`, `planning/all-planning.md`; source files `+page.server.ts`, `CalendarEntry.svelte`, `types/index.ts`, `leads.ts` (`getFollowUpsInRange` + `visibilityCondition` patterns), `calendar-db.spec.ts`.
5. Next step for a fresh agent: re-run VALIDATE (V1→V7) to confirm C1 + C2 resolved → then EXECUTE checklist steps 1–15 in order on branch `development`; run gates from Verification Evidence.

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 5 files in blast radius). Four tightly-coupled edits in one feature with a sequential data dependency (type → query → route → component → test); one vc-execute-agent on opus is the right fit. Not fan-out-shaped.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | `normalizeGoLiveDate('2026-07-15')` → `'2026-07-15T00:00:00'`, idempotent on ISO input (day-shift safe) | Fully-Automated | `bun run test:unit -- src/tests/calendar-db.spec.ts` (new `describe('normalizeGoLiveDate')`) | B |
| AC1 | `buildGoLiveRangeConditions()` WHERE = `deleted_at is null` + `stage = 'live'` + `go_live_date is not null` | Fully-Automated | `.toSQL()` assertion in `src/tests/calendar-db.spec.ts` | B |
| AC1 | Range windowing of go-live dates (`isWithinRange(goLiveIso, start, end)`) | Fully-Automated | existing `isWithinRange` coverage in `calendar-db.spec.ts` | A |
| AC2/AC3/AC5 | 3-way `CalendarEntry.type` union is type-safe across component + mappers | Fully-Automated | `bun run check` exits 0 | B |
| AC5 | No regression across the unit suite (meetings/follow-ups unaffected) | Fully-Automated | `bun run test:unit:ci` exits 0 (263+ passing) | A |
| AC1/AC2/AC3 | Rendered green `check` chip on go-live day + click → `/leads/[id]` | Agent-Probe | Manual: load `/calendar` with a seeded live lead; confirm green chip, no time label, click-through | D |
| AC1–AC3 | On-grid e2e render + click-through | (Known-Gap residual) | — no shared Playwright auth fixture | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase; D — backlog test-building stub (named residual; keep-active).

Failing stub (AC4 — Fully-Automated):
```
test("should normalize 'YYYY-MM-DD' to local-midnight ISO without day-shift", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: normalizeGoLiveDate('2026-07-15') === '2026-07-15T00:00:00'")
})
```

Failing stub (AC1 — Fully-Automated):
```
test("should build WHERE with deleted_at is null, stage = 'live', go_live_date is not null", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildGoLiveRangeConditions().toSQL() WHERE clause")
})
```

Legacy line form (retained for existing consumers):
- DB helpers (leads.ts): Fully-automated: `bun run test:unit -- src/tests/calendar-db.spec.ts`
- Type contract (types + component + route): Fully-automated: `bun run check`
- Regression: Fully-automated: `bun run test:unit:ci`
- Rendered chip + click-through: agent-probe: load `/calendar`, seed a live lead, confirm green `check` chip + navigate to `/leads/[id]`
- On-grid e2e: known-gap: documented — no shared Playwright auth fixture (pre-accepted, repo-wide)

Dimension findings:
- Infra fit: PASS — no container/port/runtime surface. All 5 target paths exist; SvelteKit `+page.server.ts` + server-only DB module pattern followed; Drizzle ops (`eq`/`isNull`/`isNotNull`/`and`) already imported in leads.ts; branch `development` correct; test commands (`bun run check`, `bun run test:unit:ci`) verified against `tests/all-tests.md`.
- Test coverage: PASS — both new pure helpers get Fully-Automated coverage; `isWithinRange` reuse + `bun run check` + full suite cover selection/type/regression. E2E rendering is a pre-accepted repo-wide Known-Gap with a written backlog stub + manual Agent-Probe interim. Developed DB behavior has automated gates (not vacuously green); rendered AC2/AC3 rest on Agent-Probe + Known-Gap and are explicitly CONDITIONAL (named residual).
- Breaking changes: PASS — `CalendarEntry.type` widens 2→3 (additive); only `CalendarEntry.svelte` branches on it (grep-confirmed; `CalendarGrid.svelte` uses it only as an annotation); new symbols are server-only; no schema/enum/API change.
- Security surface: CONCERN — `getGoLiveDatesInRange` is a new rep-facing lead read that, as written, bypasses the enforced `visibilityCondition` predicate (leads.ts:192,204). A `'live'`-stage lead with `visibility: 'only_me'`/`'selected'` would leak its name + go-live date onto every user's calendar (STRIDE: Information Disclosure). The plan mis-classified this as "no trust boundary." See concern C2. **[Supplement resolution: checklist step 5a now applies `visibilityCondition(userId, role)`; route passes `locals.user.id` + role — pending PVL re-run to confirm.]**
- Section feasibility (go-live source — leads.ts query): CONCERN — mechanically feasible except `handle`: there is NO `handle` column on `crmLeads`; it is derived in `dbRowToLead`. See concern C1. **[Supplement resolution: option (b) chosen — query selects only `name`, used as the calendar title; no `handle` read. Steps 2 + 5 updated — pending PVL re-run to confirm.]**
- Section feasibility (CalendarEntry.svelte / +page.server.ts / types / tests): PASS — `isMeeting` binary at line 9, blue/amber ternaries at lines 22–34, both `detailed` + compact branches present; `check` icon confirmed (`Icon.svelte:16`); `startAt: string` matches `goLiveIso`; test spec `.toSQL()` + `isWithinRange` patterns already established in `calendar-db.spec.ts`.

Open gaps:
- C1 (handle derivation) — **RESOLVED via supplement**: option (b) — `getGoLiveDatesInRange` selects only `{ id, name, goLiveDate }` and uses `name` as the `CalendarEntry.title`; no `handle` field is read or derived (checklist steps 2, 5, 8). Pending PVL re-run to confirm.
- C2 (visibility filtering) — **RESOLVED via supplement**: `getGoLiveDatesInRange(rangeStart, rangeEnd, userId, role)` applies `visibilityCondition(userId, role)`; `+page.server.ts` passes `locals.user.id` + role (checklist steps 5, 5a, 7). Pending PVL re-run to confirm.
- known-gap (e2e on-grid render/click): known-gap: documented as pre-accepted repo-wide — no shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Excluded from CONCERN count.

What this coverage does NOT prove:
- `bun run test:unit -- src/tests/calendar-db.spec.ts` proves the two pure helpers in isolation; it does NOT prove the `getGoLiveDatesInRange` row→summary assembly (visibility filtering) — that runs against no DB in unit scope and is covered only by `bun run check` (types) + manual.
- `bun run check` proves the 3-way union + the 4-arg query signature are type-safe; it does NOT prove the rendered green chip class strings, the suppressed time label, or that blue/amber output is byte-identical (no component render test exists).
- `bun run test:unit:ci` proves no unit regression; it does NOT exercise `/calendar` SSR, the calendar grid render, or click-through navigation.
- Agent-Probe proves rendered appearance + one click path for a seeded lead; it does NOT prove behavior across timezones or empty ranges.
- No unit gate proves C2 (a restricted live lead is correctly hidden) against a live DB; the `visibilityCondition` application is type-checked + manual-Agent-Probe covered until the live-DB test harness lands.

Gate: CONDITIONAL (2 concerns — C1 handle derivation, C2 visibility filtering; both addressed by the applied plan-supplement cycle. First-pass CONDITIONAL — not terminal; routes to PVL re-run from V1, not EXECUTE.)
Accepted by: pending — supplement applied; re-run VALIDATE (V1→V7) to confirm C1 + C2 before EXECUTE. The pre-accepted e2e Known-Gap is already on record (repo-wide).

## Autonomous Goal Block

```
SESSION GOAL: Calendar go-live events — render live-stage leads' goLiveDate as green "Go-live" milestone chips on /calendar, distinct from meetings (blue) and follow-ups (amber), click-through to /leads/[id].
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: standard RIPER-5; feedback_autonomous_phase_execution rules — reversible edits auto-proceed, surface only hard stops.
Hard stop conditions / safety constraints:
- Do not leak restricted-visibility (only_me / selected) live leads onto the shared calendar — visibilityCondition(userId, role) applied in getGoLiveDatesInRange (concern C2, resolved step 5a).
- Do not read a nonexistent crmLeads.handle column — the query selects only name, used as the calendar title (concern C1, resolved via option (b)).
- Keep meeting (blue) + follow-up (amber) CalendarEntry.svelte class strings byte-identical during the 3-way refactor.
- No schema / migration / enum changes ('live' + go_live_date already exist in development).
Next phase: re-run VALIDATE (confirm C1 + C2) → EXECUTE: process/features/calendar/active/calendar-golive-events_06-07-26/calendar-golive-events_PLAN_06-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate CONDITIONAL, supplement applied)
Execute start: fully-auto: bun run check ; bun run test:unit -- src/tests/calendar-db.spec.ts ; bun run test:unit:ci | agent-probe: load /calendar with seeded live lead, confirm green check chip + click → /leads/[id]; confirm restricted live lead hidden | high-risk pack: no (visibility-scoped)
```
