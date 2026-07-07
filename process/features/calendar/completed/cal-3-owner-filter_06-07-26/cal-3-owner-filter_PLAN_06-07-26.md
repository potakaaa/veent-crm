---
name: plan:cal-3-owner-filter
description: "SIMPLE plan for CAL-3 — Calendar owner filter: reps scoped to own leads, managers get a rep-filter combobox (?repId), meetings stay team-wide (GitHub #208)"
date: 06-07-26
feature: calendar
---

# CAL-3 — Calendar Owner Filter (GitHub #208) — Implementation Plan

Date: 06-07-26
Status: PLAN — active, pending VALIDATE
Complexity: SIMPLE (4 sequential steps, single feature, no phase program)
SPEC: `process/features/calendar/completed/cal-3-owner-filter_06-07-26/cal-3-owner-filter_SPEC_06-07-26.md`
Decision Summary source: INNOVATE — "Full Reminders Mirror" (combobox UI + additive `filterRepId?` + route-level trust boundary)
Context loaded: `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`

## TL;DR

Mirror the `/reminders` rep-filter onto `/calendar`. Add optional owner-scoping to the three
calendar lead-query functions, resolve the trust boundary at the route (`filterRepId = isManager ?
url repId : undefined`), and add a manager-only combobox to the calendar page. Meetings never
filter. 4 ordered steps: query layer → route layer → UI layer → tests.

## Overview

Right now `/calendar` mixes every user's go-live and event-start milestones together regardless of
lead owner, and reps see the whole team's milestones. This plan brings calendar data scoping in
line with Reminders / Today (the established ownership model in the app):

- **Reps** see only their own leads' follow-ups, go-live milestones, and event-start milestones. No filter control is shown.
- **Managers / super_managers** see all reps by default and can narrow to one rep via a `?repId=<uuid>` combobox (including selecting themselves for a "Mine" view).
- **Meetings** always show for everyone regardless of the filter.

The change is data-scoping only: no new entry types, no rendering/styling changes, no schema
changes, no changes to any other route. Approach and rationale are locked in the INNOVATE Decision
Summary ("Full Reminders Mirror"); this plan is the mechanical execution of that decision.

## Scope

In scope: `src/lib/server/db/leads.ts` (3 query fns + their pure WHERE-clause helpers),
`src/routes/calendar/+page.server.ts`, `src/routes/calendar/+page.svelte`,
`src/tests/calendar-db.spec.ts`. Out of scope: meetings query/shape, chip rendering/styling,
any other route, schema changes. (Full out-of-scope list in SPEC.)

---

## Design Decisions (locked before checklist)

**D1 — Uniform owner-scope rule across all three functions.** Each query resolves its owner
predicate identically:

| Caller case | Owner predicate added | Proves |
|---|---|---|
| `role === 'rep'` | `eq(crmLeads.ownerId, userId)` (strict — always own) | AC1 |
| manager/super_manager, no `filterRepId` | none (team-wide) | AC3 |
| manager/super_manager, `filterRepId` set | `eq(crmLeads.ownerId, filterRepId)` | AC5 |

**D2 — `getFollowUpsInRange` gains a `role` param (necessary refinement beyond the literal
INNOVATE snippet).** It is currently hard-scoped to `eq(ownerId, userId)` for everyone, which
would keep managers scoped to their own leads and fail AC3. Adding `role` lets managers go
team-wide while reps stay strict-owner. `role` defaults to `'rep'` so existing callers/tests
that pass only `(userId, …)` keep the strict-owner behavior — backward compatible.

**D3 — go-live / event-start keep `visibilityCondition(userId, role)`** for the restricted-lead
(`only_me` / `selected`) leak guard, AND additionally AND the D1 owner predicate. For a rep,
`visibilityCondition` already contains `owner=me`, so the extra `eq(ownerId, userId)` simply
tightens to strict-owner (satisfies AC1 without weakening the existing leak guard).

**D4 — Route trust boundary (verbatim from INNOVATE):**
`const filterRepId = isManager ? (url.searchParams.get('repId') ?? undefined) : undefined;`
A rep who hand-crafts `?repId=<other-uuid>` is ignored — `filterRepId` is dropped for reps at the
route, AND each function ignores `filterRepId` when `role === 'rep'` (defense in depth).
`filterRepId` may legitimately equal the manager's own UUID (the "Mine" view) — documented in a
code comment per INNOVATE caution.

**D5 — Combobox drives the existing `navigate({ repId })` patch** (NOT reminders' hardcoded
`/reminders?repId=` string). `navigate()` in calendar merges params, so `view` and `date` are
preserved → satisfies AC9 (view toggle keeps the filter) for free, and AC7 (clear removes the
param) via `navigate({ repId: undefined })`.

**D6 — Combobox placement:** a new `{#if data.isManager}` row inserted BELOW the prev/next/today/
range-label row (`+page.svelte` line ~173) and ABOVE the legend row (~175).

---

## Touchpoints

- `src/lib/server/db/leads.ts` — read + modify: `getFollowUpsInRange`, `buildFollowUpsRangeLeadConditions`, `getGoLiveDatesInRange`, `getEventDatesInRange`, `buildEventStartWhereClause`; add `buildGoLiveWhereClause`. Read-only ref: `visibilityCondition`, `listActiveReps`.
- `src/routes/calendar/+page.server.ts` — modify `load`.
- `src/routes/calendar/+page.svelte` — add manager combobox + state.
- `src/tests/calendar-db.spec.ts` — add AC1/AC3/AC5/AC8 DB-free assertions.
- Read-only patterns to mirror: `src/routes/reminders/+page.server.ts`, `src/routes/reminders/+page.svelte`, `getAllFollowUpsQueue`.

## Public Contracts

Three exported query-function signatures change (all additive / backward-compatible via defaults):

- `getFollowUpsInRange(userId, rangeStart, rangeEnd, role: Role = 'rep', filterRepId?: string)`
- `getGoLiveDatesInRange(rangeStart, rangeEnd, userId, role, filterRepId?: string)`
- `getEventDatesInRange(rangeStart, rangeEnd, userId, role, filterRepId?: string)`
- `buildFollowUpsRangeLeadConditions(userId, role: Role = 'rep', filterRepId?: string)` — extended
- `buildEventStartWhereClause(userId, role, filterRepId?: string)` — extended
- `buildGoLiveWhereClause(userId, role, filterRepId?: string)` — NEW exported composer (symmetry + DB-free testability)

Page `data` contract for `/calendar` gains: `activeReps: {id,name}[]`, `filterRepId: string | null`, `isManager: boolean`, `meId: string`. No API/schema/auth surface changes. No new dependencies (Popover/Command already in repo).

## Blast Radius

4 files, 1 package (the SvelteKit app), risk class: **low** — additive optional params with
safe defaults, no schema/migration/auth/billing surface. The single flagged risk is the
`getFollowUpsInRange` base-scope change for managers (own → team-wide); mitigated by the
`role`-default keeping rep behavior identical and by the new AC3 unit assertion.

---

## Acceptance Criteria

Testable outcomes are defined in full in the SPEC (AC1–AC11). Each is mapped to its proving gate in
the Verification Evidence table below. Summary of the "done" bar:

- AC1 — reps see only their own leads' follow-ups, go-live, and event-start entries (Hybrid, DB-free unit half).
- AC2 — reps see no owner-filter control (Agent-Probe).
- AC3 — managers see all reps by default, no `?repId` (Hybrid).
- AC4 — manager dropdown lists active reps from `listActiveReps()` (Agent-Probe).
- AC5 — selecting a rep narrows follow-ups + milestones to that rep (Hybrid).
- AC6 — selected rep reflected as `?repId=<uuid>`, survives reload (Agent-Probe).
- AC7 — clearing the filter restores team view + removes `?repId` (Agent-Probe).
- AC8 — meetings always show regardless of the rep filter (Hybrid).
- AC9 — month/week toggle preserves the active rep filter (Agent-Probe).
- AC10 — `bun run check` and `bun run lint` exit 0 (Fully-Automated).
- AC11 — existing calendar chip styling unchanged (Agent-Probe).

## Implementation Checklist

**Step 1 — Query layer (`src/lib/server/db/leads.ts`)**

1. Extend `buildFollowUpsRangeLeadConditions(userId, role: Role = 'rep', filterRepId?: string)`: keep `isNull(deletedAt)`, `ne(stage,'won')`, `ne(stage,'lost')`; then apply D1 — if `role === 'rep'` push `eq(ownerId, userId)`, else if `filterRepId` push `eq(ownerId, filterRepId)`, else no owner predicate. Update the JSDoc to describe the three cases and the `filterRepId`-may-equal-manager-UUID note (D4).
2. Update `getFollowUpsInRange` signature to `(userId, rangeStart, rangeEnd, role: Role = 'rep', filterRepId?: string)` and pass `role, filterRepId` into `buildFollowUpsRangeLeadConditions`. No other body change (DISTINCT-ON follow-up logic untouched).
3. Add exported `buildGoLiveWhereClause(userId, role, filterRepId?: string)`: `and(...buildGoLiveRangeConditions(), visibilityCondition(userId, role), ownerNarrow)` where `ownerNarrow` follows D1 (`role==='rep' → eq(ownerId,userId)`; else `filterRepId → eq(ownerId,filterRepId)`; else omit). Refactor `getGoLiveDatesInRange` to accept `(rangeStart, rangeEnd, userId, role, filterRepId?)` and use `buildGoLiveWhereClause`.
4. Extend `buildEventStartWhereClause(userId, role, filterRepId?: string)` with the same D1 owner-narrow term. Update `getEventDatesInRange` signature to `(rangeStart, rangeEnd, userId, role, filterRepId?)` and pass `filterRepId` through.
5. Confirm `buildGoLiveRangeConditions()` / `buildEventStartRangeConditions()` (no-arg pure helpers) are left UNCHANGED so the existing cal-2 / golive in-flight tests keep passing.

**Step 2 — Route layer (`src/routes/calendar/+page.server.ts`)**

6. Add imports: `listActiveReps` from `$lib/server/db/leads`.
7. In `load`, after the existing auth guard, compute `const { id, role } = locals.user;` and `const isManager = role === 'manager' || role === 'super_manager';` and the D4 trust boundary: `const filterRepId = isManager ? (url.searchParams.get('repId') ?? undefined) : undefined;` with a code comment stating a rep's `?repId` is dropped here and `filterRepId` may equal the manager's own UUID (Mine view).
8. Update the `Promise.all`: pass `role, filterRepId` to `getFollowUpsInRange`; pass `role, filterRepId` to `getGoLiveDatesInRange` and `getEventDatesInRange`; add `isManager ? listActiveReps() : Promise.resolve([])`. Leave `listAllMeetings()` UNCHANGED (AC8 — meetings never filtered).
9. Extend the returned object with `activeReps`, `filterRepId: filterRepId ?? null`, `isManager`, `meId: id`.

**Step 3 — UI layer (`src/routes/calendar/+page.svelte`)**

10. Add imports mirroring reminders: `Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty` from `$lib/components/ui/command`; `Popover, PopoverTrigger, PopoverContent` from `$lib/components/ui/popover`.
11. Add combobox state: `let repOpen = $state(false); let repQuery = $state('');` and `const filteredReps = $derived(...)` (client-side name filter over `data.activeReps`), copied from reminders.
12. Add `function navigateRepFilter(repId: string | undefined)` that calls the EXISTING `navigate({ repId })` patch (D5) — passing `undefined` clears the param and preserves `view`/`date`.
13. Insert a `{#if data.isManager}` combobox block BETWEEN the nav-controls row (ends ~line 173) and the legend row (~line 175) (D6). Reuse the reminders markup verbatim: trigger label shows `All reps` / `Mine` (when `filterRepId === data.meId`) / rep name; `Quick filters` group (Mine → `navigateRepFilter(data.meId)`, All reps → `navigateRepFilter(undefined)`); `Search reps` group over `filteredReps`. Do NOT render the block for reps (AC2).

**Step 4 — Tests (`src/tests/calendar-db.spec.ts`)**

> Execute-agent note (E2): label all NEW CAL-3 tests with namespaced AC ids in their `describe` strings — `CAL3-AC1`, `CAL3-AC3`, `CAL3-AC5`, `CAL3-AC8` — to avoid colliding with the existing `AC3`/`AC7` blocks already in `calendar-db.spec.ts` from CAL-2.

14. AC1 (rep strict-owner): for each of the three WHERE composers, assert `.toSQL()` with `role='rep'` contains `owner_id` bound to the rep `userId` and NOT to any other id. Use `buildFollowUpsRangeLeadConditions(userId,'rep')`, `buildGoLiveWhereClause(userId,'rep')`, `buildEventStartWhereClause(userId,'rep')`.
15. AC3 (manager team-wide default): assert `.toSQL()` with `role='manager'` and no `filterRepId` does NOT bind any specific `ownerId` narrowing param (i.e. no owner-narrow term beyond `visibilityCondition`'s manager `true`). Assert the manager path produces `true` visibility (no per-owner predicate).
16. AC5 (manager + filterRepId): assert `.toSQL()` with `role='manager'` and `filterRepId=X` contains `owner_id` bound to `X`.
17. AC8 (meetings invariance): assert (via route-shape reasoning / a focused unit) that the calendar meetings source is `listAllMeetings()` called with no rep argument — i.e. add a guard test that `listAllMeetings` signature takes no owner/rep param, documenting that meetings are structurally un-filterable by rep. (DB-free: assert the function arity / that the route does not thread `filterRepId` into it.)
17b. AC8 route-source guard (implements E1 — closes the arity-only blind spot): add a static-source guard test asserting the `listAllMeetings(...)` call site in `src/routes/calendar/+page.server.ts` is argument-free — i.e. the route NEVER passes `filterRepId` (or any rep/owner argument) into `listAllMeetings`. An optional `filterRepId?` param would keep `listAllMeetings.length === 0` and slip past item 17's arity check, and the arity check cannot see route-level threading; this guard (read/grep the `+page.server.ts` source and assert no `filterRepId` token appears inside the `listAllMeetings(` call) covers the real regression vector. DB-free — no live DB or auth fixture needed. (Proves SPEC AC8, Hybrid DB-free half.)
18. Run the full test suite and fix any red before handoff.

## Phase Completion Rules

This is a SIMPLE single-phase plan. It is complete only when ALL of the following hold (honest
status — code-only completion is `CODE DONE`, not `VERIFIED`):

- All 18 checklist items applied.
- Test gates 1–3 (`bun run check`, `bun run lint`, `bun run test:unit:ci`) all exit 0.
- AC1/AC3/AC5/AC8 DB-free unit assertions present and green in `src/tests/calendar-db.spec.ts`.
- AC2/AC4/AC6/AC7/AC9/AC11 remain CONDITIONAL (Agent-Probe / manual) pending the shared Playwright auth fixture — recorded as pre-accepted known-gaps, never marked silently PASS.
- No change to `listAllMeetings` and no broadening of reps beyond strict-owner.

Mark the plan `VERIFIED` only after EVL confirms the automated gates green; otherwise it stays
`CODE DONE` in `active/`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Unit `.toSQL()`: rep path binds `owner_id = userId` on all 3 composers | Hybrid (DB-free unit half) | AC1 |
| Rendered rep session shows no rep-filter control | Agent-Probe (blocked by shared Playwright auth fixture) | AC2 |
| Unit `.toSQL()`: manager + no `filterRepId` → no owner-narrow term (team-wide) | Hybrid (DB-free unit half) | AC3 |
| Rendered manager session shows dropdown populated from `listActiveReps()` | Agent-Probe (auth-fixture blocked) | AC4 |
| Unit `.toSQL()`: manager + `filterRepId=X` binds `owner_id = X` on all 3 composers | Hybrid (DB-free unit half) | AC5 |
| Rep selection sets `?repId=<uuid>`; reload re-applies filter | Agent-Probe (auth-fixture blocked) | AC6 |
| Clearing filter restores full team view + removes `?repId` | Agent-Probe (auth-fixture blocked) | AC7 |
| Unit: meetings source `listAllMeetings()` takes no rep arg; route never threads `filterRepId` to it (checklist 17 + 17b) | Hybrid (DB-free unit half) | AC8 |
| `?repId` survives month/week toggle (via shared `navigate()` param merge) | Agent-Probe (auth-fixture blocked) | AC9 |
| `bun run check` exits 0; `bun run lint` exits 0 | Fully-Automated | AC10 |
| Chip colors (amber/green/purple/blue) unchanged | Agent-Probe (visual) | AC11 |

Note: AC2/AC4/AC6/AC7/AC9/AC11 close via Agent-Probe / manual confirmation until the shared
Playwright authenticated-session fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
— the same pre-accepted known-gap pattern used across calendar, reminders, and ux-enhancement.
These are recorded residuals, not silent terminal passes; their gates stay CONDITIONAL pending the fixture.

## Test Gates

Run in order (all must be green before EVL handoff):

1. `bun run check` — TypeScript + svelte-check (AC10)
2. `bun run lint` — Prettier + ESLint (AC10)
3. `bun run test:unit:ci` — Vitest, runs `src/tests/calendar-db.spec.ts` (AC1/AC3/AC5/AC8 DB-free)

Note: use `bun run test:unit:ci` (Vitest) — NOT `bun test` (Bun's native runner, wrong runner per
`process/context/tests/all-tests.md`). e2e (`bun run test:e2e`) self-skips on protected routes
until the auth fixture lands, so it proves nothing here — do not gate on it.

## Test Infra Improvement Notes

(none identified yet — the Agent-Probe residuals above are blocked on the pre-existing shared
Playwright auth-fixture backlog item, not a new infra gap introduced by this plan.)

## Dependencies

- Depends on `getGoLiveDatesInRange` and `getEventDatesInRange` existing (introduced by the two
  in-flight calendar plans `cal-2-two-calendar-markers_06-07-26` and `calendar-golive-events_06-07-26`).
  Confirmed present in `leads.ts` at time of planning — if those plans are reverted, this plan is blocked.
- `listActiveReps()`, `visibilityCondition()`, Popover + Command UI components: all already present. No new installs.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `getFollowUpsInRange` manager base-scope change (own → team-wide) silently alters an existing caller | Low | `role` defaults to `'rep'` (strict-owner) → all existing callers unchanged; only the calendar route opts managers into team-wide; AC3 unit asserts the new path |
| Rep spoofs `?repId=<other>` to see another rep's leads | Low | Dropped at route (D4) AND ignored in-function when `role==='rep'` (defense in depth); no unit needed but covered by AC1 strict-owner assertion |
| Changing `buildEventStartWhereClause` signature breaks in-flight golive-plan tests | Low | `filterRepId` is optional/trailing — existing 2-arg calls unaffected; keep no-arg `buildEventStartRangeConditions()` untouched |

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/calendar/completed/cal-3-owner-filter_06-07-26/cal-3-owner-filter_PLAN_06-07-26.md`
2. **Last completed step:** none — plan written + validated (2 passes), not yet executed.
3. **Validate-contract status:** written — Gate CONDITIONAL (terminal, second pass); EXECUTE-ready.
4. **Supporting context loaded:** SPEC (same folder); `process/context/all-context.md`; `process/context/tests/all-tests.md`; `reminders/+page.server.ts` + `+page.svelte` (mirror pattern); `calendar/+page.server.ts` + `+page.svelte` (targets); `leads.ts` lines 214-233 (visibilityCondition), 721 (listActiveReps), 1330-1540 (three query fns + helpers), 1740-1785 (getAllFollowUpsQueue filterRepId pattern); `calendar-db.spec.ts` (existing tests).
5. **Next step for a fresh agent:** start at Checklist Step 1 (query layer). Execute steps in order (query → route → UI → tests); run the per-step test gates after Step 4. Do not touch `listAllMeetings` (AC8). Do not broaden reps beyond strict-owner (AC1).

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl
supersedes: 2026-07-06 (outer-pvl) — second-pass outer PVL after 1 supplement cycle folded E1 into checklist item 17b and recorded E2; this contract carries the current evidence

Parallel strategy: sequential
Rationale: Signal score 1/7 (only a mild trust-boundary signal, mirroring the shipped `/reminders` pattern). SIMPLE 4-file additive plan, single package, locked INNOVATE decision — inline sequential validation is the right fit; no fan-out team warranted.

Second-pass resolution summary (this contract supersedes the first-pass CONDITIONAL): the two enumerated first-pass test CONCERNs are now RESOLVED by the supplement:
- C1 (AC8 arity-only blind spot) → RESOLVED. Checklist item 17b folds E1's route-source guard into the plan itself — a static-source test asserting `+page.server.ts` never threads `filterRepId` into `listAllMeetings(...)`. Verified mechanically feasible: `listAllMeetings()` at `meetings.ts:200` takes no params and the live call site at `+page.server.ts:30` is argument-free, so the guard passes and catches the real regression vector (route-level threading) the bare arity check could not see.
- C2 (AC-number collision in shared `calendar-db.spec.ts`) → RESOLVED. E2 recorded as the Step 4 checklist note — new tests namespaced `CAL3-AC1/AC3/AC5/AC8`. Collision confirmed real: existing `AC3` describe block at `calendar-db.spec.ts:26` and `AC7` at `:145`.

Why this is a TERMINAL CONDITIONAL and NOT a PASS: the remaining CONDITIONAL driver is not a fixable concern — the UI-render developed behavior (AC2/AC4/AC6/AC7/AC9/AC11) rests on auth-fixture-blocked Agent-Probe only, with no runnable Fully-Automated or Hybrid gate this cycle. The vacuous-green ban forbids a terminal PASS while developed behavior has coverage that cannot execute. This is therefore a terminal CONDITIONAL: all fixable concerns are resolved; only the pre-accepted, documented, codebase-wide auth-fixture known-gap remains, and it is explicitly accepted. EXECUTE may proceed.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Rep sees only own leads' follow-ups/go-live/event-start (strict owner) | Fully-Automated | `bun run test:unit:ci` — `.toSQL()` on `buildFollowUpsRangeLeadConditions(userId,'rep')`, `buildGoLiveWhereClause(userId,'rep')`, `buildEventStartWhereClause(userId,'rep')` each binds `owner_id`=userId, no other id | A |
| AC3 | Manager sees all reps by default (no owner-narrow term) | Fully-Automated | `bun run test:unit:ci` — `.toSQL()` with `role='manager'`, no `filterRepId` → no per-owner narrowing param beyond `visibilityCondition` manager `true` | A |
| AC5 | Manager + filterRepId narrows to that rep only | Fully-Automated | `bun run test:unit:ci` — `.toSQL()` with `role='manager'`, `filterRepId=X` binds `owner_id`=X on all 3 composers | A |
| AC8 | Meetings always show regardless of rep filter | Hybrid | `bun run test:unit:ci` arity guard (`listAllMeetings.length === 0`, item 17) + route-source guard that `+page.server.ts` never threads `filterRepId` into `listAllMeetings(...)` (item 17b, folds E1 into checklist); data-level = Agent-Probe (auth-fixture blocked) | B (route-source guard now a checklist item) / D (data-level residual) |
| AC10 | No type/lint regressions | Fully-Automated | `bun run check` exits 0; `bun run lint` exits 0 | A |
| AC2 | Rep sees no owner-filter control | Agent-Probe | Rendered rep session shows no combobox | D |
| AC4 | Manager dropdown lists `listActiveReps()` | Agent-Probe | Rendered manager session shows populated dropdown | D |
| AC6 | Selected rep reflected as `?repId=<uuid>`, survives reload | Agent-Probe | Select rep → URL param set → reload re-applies | D |
| AC7 | Clearing filter restores team view + removes `?repId` | Agent-Probe | Clear → full team + no param | D |
| AC9 | Month/week toggle preserves the filter | Agent-Probe | Toggle keeps `?repId` (via `navigate()` param merge, D5) | D |
| AC11 | Existing chip styling unchanged | Agent-Probe | Chip colors amber/green/purple/blue unchanged | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a named later phase; D — backlog test-building stub / named residual (auth-fixture-blocked probe).

C-4 reconciliation: `strategy` column carries only proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the auth-fixture-blocked residuals are carried via gap-resolution D.

Legacy line form (retained for existing consumers):
- Query-scoping (AC1/AC3/AC5): Fully-automated: `bun run test:unit:ci` (`.toSQL()` predicate assertions, DB-free)
- Type/lint (AC10): Fully-automated: `bun run check`; `bun run lint`
- Meetings invariance (AC8): hybrid: `bun run test:unit:ci` arity guard (item 17) + route-source guard (item 17b, E1 folded into checklist) | known-gap: data-level meeting-count-under-filter documented (auth-fixture blocked)
- Render/interaction (AC2/AC4/AC6/AC7/AC9/AC11): agent-probe: manual session inspection | known-gap: automated proof documented pending shared Playwright auth fixture

Dimension findings:
- Infra fit: PASS — all edit-target files exist (`leads.ts`, `calendar/+page.server.ts`, `calendar/+page.svelte`, `calendar-db.spec.ts`); `bun run test:unit:ci` (=`vitest --run`), `bun run check`, `bun run lint` all present in package.json; Popover + Command UI components present in `src/lib/components/ui/` with all six Command exports and all three Popover exports the plan imports; `listAllMeetings()` confirmed argument-free at `meetings.ts:200` (17b guard feasible). No container/infra/runtime surface.
- Test coverage: CONCERN — C1 (AC8 arity blind spot) now RESOLVED by checklist item 17b (route-source guard). Sole remaining driver is the vacuous-green classification: UI-render developed behavior (AC2/AC4/AC6/AC7/AC9/AC11) rests on auth-fixture-blocked Agent-Probe — a pre-accepted, documented, codebase-wide known-gap. Forces net CONDITIONAL (not PASS); not a fixable concern this cycle.
- Breaking changes: PASS — all three signature changes are additive/backward-compatible (`role` defaults to `'rep'`; `filterRepId` optional trailing). Exactly one production caller each (`calendar/+page.server.ts` lines 29/31/32), all updated by Step 2. No test calls the async fns directly (tests exercise the pure helpers). No external/public API contract, no schema, no auth surface.
- Security surface: PASS — trust boundary mirrors the shipped `/reminders` pattern verbatim (`filterRepId = isManager ? url repId : undefined`) with defense-in-depth (route drops rep `?repId` AND each fn ignores `filterRepId` when `role==='rep'`). `visibilityCondition(managerId,'manager')` returns `sql\`true\`` — correctly bypasses per-lead restriction while the D1 owner-narrow does the rep-X scoping; the restricted-lead (`only_me`/`selected`) leak guard is preserved for reps and additionally tightened to strict-owner. No new secrets/auth/billing.
- Section 1 (Query layer) feasibility: PASS — all named functions/helpers uniquely matchable in `leads.ts` (1339–1540); `buildGoLiveRangeConditions()`/`buildEventStartRangeConditions()` no-arg helpers left untouched keeps cal-2/golive tests green. Highest-risk edit: `getFollowUpsInRange` base-scope change (own→team-wide for managers) — mitigated by `role` default.
- Section 2 (Route layer) feasibility: PASS — trust-boundary block mirrors reminders lines 15–20 verbatim; `listAllMeetings()` call left unchanged (AC8); `listActiveReps` import available.
- Section 3 (UI layer) feasibility: PASS — reminders combobox markup (repOpen/repQuery/filteredReps + Popover/Command block) fully mirror-able; calendar's `navigate()` patch (line 48) merges params over current `page.url.searchParams`, so D5's `navigate({ repId })` preserves `view`/`date` and earns AC9 for free. Note: a naive verbatim copy of reminders' `navigateRepFilter` (hardcoded `/reminders?repId=` string) would DROP `view`/`date` and break AC9 — the plan's D5 divergence is correct and load-bearing.
- Section 4 (Tests) feasibility: PASS — C1 and C2 (the first-pass CONCERNs) both resolved by the supplement. Item 17b adds the route-source guard (verified feasible against the arg-free `listAllMeetings()` call site); E2 namespacing (`CAL3-AC*`) avoids the confirmed collision with existing `AC3`/`AC7` describe blocks in `calendar-db.spec.ts`. All named composers uniquely matchable and DB-free-testable via `.toSQL()`.

Execute-agent instructions:
- E1 (addresses first-pass C1 — AC8 robustness) → PROMOTED to checklist item 17b. No longer an open execute-instruction; it is now a plan-owned test step: a static-source guard asserting `+page.server.ts` never passes `filterRepId` (or any rep arg) into `listAllMeetings(...)`. Structural separation (meetings filtered only by `isWithinRange`, no ownerId path) remains the primary protection; the guard makes the tripwire cover the real vector. Trigger: Step 4, item 17b.
- E2 (addresses first-pass C2 — test hygiene) → recorded as the Step 4 checklist note. Namespace all NEW CAL-3 tests as `CAL3-AC1 / CAL3-AC3 / CAL3-AC5 / CAL3-AC8` in their describe strings — the existing `calendar-db.spec.ts` already has "AC3" (line 26) and "AC7" (line 145) describe blocks from prior calendar plans, so unnamespaced reuse would produce two conflicting "AC3" blocks. Trigger: Step 4, items 14–17b.

Open gaps:
- AC8 data-level (meeting count unchanged under active `?repId`): known-gap: documented as auth-fixture-blocked Agent-Probe — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Structural separation + the item-17b route-source guard are the automated compensating controls.
- AC2/AC4/AC6/AC7/AC9/AC11 (render/interaction): known-gap: documented as auth-fixture-blocked Agent-Probe — same backlog note; the standard pre-accepted pattern shared across calendar/reminders/ux-enhancement.

What this coverage does NOT prove:
- The Fully-Automated `.toSQL()` gates (AC1/AC3/AC5) prove the WHERE-clause SQL string/params are correct; they do NOT prove end-to-end row selection against a live Postgres (Hybrid DB-half self-skips without `DATABASE_URL`), and do NOT prove the rendered calendar visually reflects the scoping.
- The AC8 arity + route-source guard (items 17/17b) proves `listAllMeetings` is called without a rep arg and that the route never threads `filterRepId` into it; it does NOT prove, at data level, that the visible meeting count is identical with and without `?repId` (that is the auth-fixture-blocked Agent-Probe).
- `bun run check` / `bun run lint` (AC10) prove type-safety and style; they prove nothing about runtime scoping behavior.
- No Agent-Probe (AC2/AC4/AC6/AC7/AC9/AC11) can run until the shared Playwright authenticated-session fixture lands — combobox visibility, URL-param round-trip, view-toggle persistence, and chip styling are unproven by automation this cycle.

Gate: CONDITIONAL (0 FAILs; both first-pass test CONCERNs — C1 AC8 tripwire and C2 test-name collision — RESOLVED by the supplement (17b + E2); the sole remaining CONDITIONAL driver is the vacuous-green ban applied to the auth-fixture-blocked UI-render Agent-Probes, a pre-accepted codebase-wide known-gap). TERMINAL CONDITIONAL — all fixable concerns resolved, only pre-accepted known-gaps remain, explicitly accepted → EXECUTE may proceed. Not a terminal PASS: the vacuous-green ban forbids PASS while developed UI-render behavior rests only on a blocked probe.
Accepted by: session — pre-accepted known-gaps: AC8-data-level, AC2, AC4, AC6, AC7, AC9, AC11 (all auth-fixture-blocked Agent-Probe, consistent with shipped calendar/reminders/ux-enhancement). First-pass execute-instructions E1/E2 are now folded into the plan (17b + Step 4 note); no open execute-instruction CONCERNs remain this cycle.

---

## Autonomous Goal Block

```
SESSION GOAL: CAL-3 — Calendar owner filter (GitHub #208): reps scoped to own leads, managers get a rep-filter combobox (?repId), meetings stay team-wide.
Charter + umbrella plan: N/A — single SIMPLE plan (no phase program)
Autonomy: reversible edits auto-proceed; this is a low-risk additive data-scoping change mirroring the shipped /reminders pattern. Hard-stop only on irreversible/outward-facing actions not in this contract.
Hard stop conditions / safety constraints:
- Do NOT change listAllMeetings or thread filterRepId into the meetings pipeline (AC8 — meetings always team-wide).
- Do NOT broaden reps beyond strict-owner (AC1) — keep visibilityCondition + the D1 owner-narrow term; never drop the restricted-lead leak guard.
- Do NOT touch buildGoLiveRangeConditions()/buildEventStartRangeConditions() no-arg helpers (keeps cal-2/golive tests green).
- Rep `?repId` spoof must be dropped at the route AND ignored in-function (defense in depth).
Next phase: EXECUTE — process/features/calendar/completed/cal-3-owner-filter_06-07-26/cal-3-owner-filter_PLAN_06-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL — terminal, second pass after 1 supplement cycle; generated-by: outer-pvl)
Execute start: fully-auto gates → `bun run check`; `bun run lint`; `bun run test:unit:ci` | e2e: n/a (auth-fixture blocked) | probe: manager/rep render + ?repId round-trip (manual) | high-risk pack: no
Execute-agent instructions (from contract): E1 — folded into checklist item 17b (route-source guard that +page.server.ts never passes filterRepId to listAllMeetings); E2 — namespace new tests as CAL3-AC1/AC3/AC5/AC8 to avoid collision with existing AC3/AC7 blocks in calendar-db.spec.ts.
```
