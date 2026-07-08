---
name: plan:pipeline-search-filter
description: "PIPE-3 — client-side search box over the pipeline board filtering cards by lead/organizer/event name, URL-synced via ?q="
date: 07-07-26
feature: pipeline
---

# PIPE-3 — Pipeline Search Filter — PLAN

**Superseded-by:** `pipeline-search-server-reach_07-07-26` (07-07-26) — search is now server-reaching, see that plan for the current design. (This plan's client-side-only search decision, Out-of-scope §"Lazy-load reach", is overturned; everything else in this plan — the `matchesQuery` predicate, `listPipelineStage` organizer join, `?q=` URL sync — stays intact and is still the historical record of PIPE-3.)

**Date**: 07-07-26  
**Status**: EXECUTE complete, EVL green (07-07-26) — kept in `active/` pending manual DOM/e2e verification (AC1/AC3/AC4 Known-Gap; see Validate Contract)  
**Complexity**: SIMPLE  
**Feature**: pipeline

**TL;DR:** Add a `SearchInput` above the pipeline board that filters already-loaded cards
client-side (case-insensitive substring on lead name / organizer name / event title), debounced
~200ms, with the term synced to `?q=` via `replaceState` (no server round trip). One blocking
prerequisite is folded in: `listPipelineStage` must be extended to left-join `crm_organizers` so
`organizerName` is actually populated on pipeline cards. Match logic lives in a pure, unit-tested
helper. Complexity: **SIMPLE** (one session). **VALIDATE required** (touches the
`listPipelineStage` DB query) — not skip-eligible.

**Date**: 07-07-26
**Status**: EXECUTE complete, EVL green (07-07-26) — kept in `active/` pending manual DOM/e2e verification
**Complexity**: SIMPLE
**Feature**: pipeline

---

## Overview

The pipeline board (`/pipeline`) renders lead cards across the `BOARD_STAGES` columns. There is no
way to narrow the board to a specific lead/organizer/event. This plan adds a search box that filters
the visible cards in real time, entirely on the client against the already-loaded `allLeads` list,
and reflects the query in the URL for shareable/refreshable links.

## Goals

1. Search input visible above the pipeline columns.
2. Typing filters cards live across all columns (debounced ~200ms), case-insensitive substring on
   lead name, organizer name, event title.
3. Non-matching cards hidden; a column that ends up empty shows a subtle "no results" state.
4. `?q=` URL param set/cleared as the user types (via `replaceState`, no reload/re-query).
5. Clearing the search restores all cards.
6. `bun run check` + `bun run lint` exit 0.

## Scope

**In scope:** client-side filter over loaded cards, pure match predicate + Vitest test, toolbar
`SearchInput` wiring, `replaceState` URL sync, SSR initial `q` read, per-column empty state, and the
**`listPipelineStage` organizer left-join** (required so organizer-name search works at all).

**Out of scope (accepted limits):**
- **Lazy-load reach.** Each stage initially loads 10 cards; more arrive via
  `/api/leads/pipeline-stage` on scroll. Client-side filtering only reaches already-loaded cards. Not
  fixed here — documented as an accepted limitation.
- No server-side search, no pagination redesign, no per-column count-of-matches UI.
- No change to `SearchInput.svelte` itself (the `debounceMs` prop already exists).

---

## Touchpoints

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/server/db/leads.ts` (`listPipelineStage`, ~line 745-780) | **Modify** — add `leftJoin(crmOrganizers)` and pass `organizerName` into `dbRowToLead(row, undefined, organizerName)`, mirroring `getLead` (leads.ts:498-505). Change the `.select()` shape + the final `.map()`. Do not touch any other export. |
| 2 | `src/routes/pipeline/pipeline-search.ts` | **Create** — pure, framework-free `matchesQuery(lead, query): boolean` predicate (case-insensitive substring across `name`, `organizerName`, `eventName`). Mirrors the `search-input.ts` colocated-pure-logic precedent. |
| 3 | `src/routes/pipeline/pipeline-search.test.ts` | **Create** — Vitest unit test for `matchesQuery` (node env; picked up by the `src/**/*.{test,spec}.{js,ts}` glob). |
| 4 | `src/routes/pipeline/+page.server.ts` | **Modify** — read `url.searchParams.get('q')` and return it as `initialQuery` for SSR/direct-link/refresh. MUST NOT re-run any query in response to `q`. Add `url` to the load destructure. |
| 5 | `src/routes/pipeline/+page.svelte` | **Modify** — add `SearchInput` in the header `actions` region; hold `query` in `$state` seeded from `data.initialQuery`; derive `filteredLeads` from `allLeads` + `query`; feed `filteredLeads` to `<PipelineBoard>`; on debounced input, sync `?q=` via `replaceState`. |
| 6 | `src/lib/components/pipeline/PipelineBoard.svelte` | **Modify (small)** — render a subtle per-column "no results" state when a column has zero cards *and* a search query is active. Reuse existing empty-state copy/style precedent if one exists. |

---

## Public Contracts

- **`listPipelineStage` return shape is unchanged** (`{ leads: Lead[], total }`). The only behavioral
  change is that `Lead.organizerName` is now populated for pipeline cards (previously always
  `undefined`). This is additive — existing callers that ignored `organizerName` are unaffected.
- **`+page.server.ts` load return** gains one field: `initialQuery: string` (empty string when no
  `?q=`). Additive; no existing consumer breaks.
- **New pure module** `pipeline-search.ts` exports `matchesQuery(lead: Pick<Lead, 'name' | 'organizerName' | 'eventName'>, query: string): boolean`. Empty/whitespace query returns `true` for all leads (show-all default).

## Blast Radius

- **Scope:** `src/routes/pipeline/` (server load + svelte page + new helper + new test),
  `src/lib/components/pipeline/PipelineBoard.svelte` (empty-state only), and a single function in
  `src/lib/server/db/leads.ts` (`listPipelineStage` — do NOT touch unrelated exports).
- **File count:** 6 (2 new, 4 modified).
- **Risk class:** Low-to-medium. The one elevated item is the DB query edit (`listPipelineStage`) —
  a `leftJoin` that could alter row shape/count if written wrong. Mitigated by mirroring the proven
  `getLead` join pattern and by the existing pipeline load smoke path. No auth/billing/migration/API
  surface; no schema change (the join reads an existing table).
- **DB note:** `crmOrganizers` is already imported/used in `leads.ts` (see `getLead`), so no new import risk.

---

## Implementation Checklist (atomic, ordered)

1. **`leads.ts` — extend `listPipelineStage` select.** Change the `db.select()` for the rows query to
   `select({ lead: crmLeads, organizerName: crmOrganizers.name })` and add
   `.leftJoin(crmOrganizers, eq(crmLeads.organizerId, crmOrganizers.id))` before `.where(where)`.
   Keep the `count()` query untouched. Mirror `getLead` (leads.ts:498-505) exactly for the join.
2. **`leads.ts` — map organizer through.** Change the final `rows.map((row) => dbRowToLead(row))` to
   `rows.map((row) => dbRowToLead(row.lead, undefined, row.organizerName))`. Confirm `dbRowToLead`'s
   3rd param is `organizerName` (leads.ts:113).
3. **Create `src/routes/pipeline/pipeline-search.ts`.** Export `matchesQuery(lead, query)`: trim +
   lowercase the query; if empty return `true`; otherwise return whether the lowercased `name`,
   `organizerName ?? ''`, or `eventName ?? ''` contains the query substring.
4. **Create `src/routes/pipeline/pipeline-search.test.ts`.** Cover: empty query → true; name match
   (case-insensitive); organizer-name match; event-name match; no-match → false;
   undefined organizerName/eventName do not throw; leading/trailing-whitespace query is trimmed.
5. **`+page.server.ts` — read initial query.** Add `url` to the `load({ locals })` destructure →
   `load({ locals, url })`; compute `const initialQuery = url.searchParams.get('q') ?? '';` and add
   `initialQuery` to the returned object. Do NOT gate or re-run any DB query on it.
6. **`+page.svelte` — state + derived filter.** Import `SearchInput` and `matchesQuery` and
   `replaceState` from `$app/navigation` and `page` from `$app/state` (or `$app/stores` per repo
   convention — match what other pages use). Add `let query = $state(data.initialQuery ?? '')`.
   Add `const filteredLeads = $derived(allLeads.filter((l) => matchesQuery(l, query)))`. Replace the
   `allLeads` passed to `<PipelineBoard>` with `filteredLeads`.
7. **`+page.svelte` — render `SearchInput`.** Insert into the `actions` snippet region of
   `<PageHeader>` (lines ~186-194). Props: `value={query}`, `oninput={handleSearch}`,
   `debounceMs={200}` (explicit — deliberate divergence from the app 300ms default per the issue's
   ~200ms spec), `ariaLabel="Search pipeline"`, `placeholder="Search leads, organizers, events…"`.
8. **`+page.svelte` — `handleSearch` + URL sync.** `function handleSearch(v: string) { query = v; }`
   then sync the URL: build a `URL` from the current location, set/delete `q` (delete when empty),
   and call `replaceState(url, {})` — NOT `goto()` (goto re-invalidates load). Keep the box value
   bound so clearing restores all cards (filter returns all when query empty).
9. **`PipelineBoard.svelte` — empty-state.** In each column body, when the column's rendered card
   count is 0 AND a search query is active, show a subtle muted "No results" line. First check
   `PipelineBoard.svelte` / the leads list for an existing empty-state pattern and reuse its
   copy/styling; only add new minimal markup if none exists. Pass an `isFiltering`/`query` signal
   into the board (or derive per-column emptiness from the already-filtered card list).
10. **Run gates.** `bun run check` and `bun run lint` exit 0; `bun test` (or `bunx vitest run`) green
    including the new `pipeline-search.test.ts`.

---

## Acceptance Criteria

- [ ] AC1 — Search input visible above the pipeline columns. (Agent-Probe/Known-Gap — manual-verification-pending, see Known-Gap note below)
- [x] AC2 — Typing filters cards in real time across all columns (case-insensitive substring on lead name, organizer name, event title). (filter-logic predicate fully-automated-proven; live DOM render remains Known-Gap — see note)
- [ ] AC3 — Non-matching cards hidden; an empty column shows a subtle "no results" state. (Agent-Probe/Known-Gap — manual-verification-pending)
- [ ] AC4 — `?q=` URL param is set/cleared as the user types (via `replaceState`, no reload). (Agent-Probe/Known-Gap — manual-verification-pending)
- [x] AC5 — Clearing the search restores all cards. (empty-query show-all proven by `matchesQuery` test)
- [x] AC6 — `bun run check` + `bun run lint` exit 0. (EVL confirmed green 07-07-26)

## Phase Completion Rules

This is a SIMPLE single-phase plan. It is complete only when: all 10 checklist items are applied;
the fully-automated gates (`bun run check`, `bun run lint`, `bunx vitest run` incl. the new
`pipeline-search.test.ts`) are green; and the Agent-Probe/Known-Gap DOM/URL criteria (AC1/AC3/AC4)
are recorded as manual-verification-pending (not marked ✅ VERIFIED without explicit user
confirmation). Testing context: `process/context/tests/all-tests.md` (node-only Vitest; no jsdom).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bunx vitest run src/routes/pipeline/pipeline-search.test.ts` — matchesQuery cases (name/organizer/event/empty/no-match/undefined-safe/trim) | Fully-Automated | AC2 (real-time filter logic), AC5 (empty query restores all) — the pure predicate behind both |
| `bun run check` exits 0 | Fully-Automated | AC6 (typecheck clean) — proves load-return/prop wiring types line up |
| `bun run lint` exits 0 | Fully-Automated | AC6 (lint clean) |
| Manual/e2e: typing filters cards live across all columns; non-matching hidden | Agent-Probe / Known-Gap | AC1, AC2, AC3 — component render not unit-testable (node-only vitest, no jsdom); pending shared Playwright auth fixture |
| Manual/e2e: `?q=` set/cleared as user types; refresh with `?q=` shows filtered board | Agent-Probe / Known-Gap | AC4 — requires browser + authed session |
| Manual/e2e: empty column shows subtle "no results" state under active query | Agent-Probe / Known-Gap | AC3 (empty-column state) |

**Known-Gap (recorded, gate stays CONDITIONAL on manual verification):** Component-level rendering of
"typing filters cards", "no-results state", and "`?q=` URL sync" is NOT unit-testable in this repo —
Vitest is node-only (no jsdom / component-render harness), and e2e is blocked by the missing shared
Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
Backlog stub to register at EXECUTE/EVL: a pipeline-search Playwright spec to run once the shared auth
fixture lands. The pure `matchesQuery` predicate IS fully-automated and carries the filter-logic proof;
the DOM/URL wiring is the residual manual-verification gap. This is NOT declared PASS on Known-Gap
alone — the DOM-facing criteria (AC1/AC3/AC4) remain manual-verification-pending.

## Test Infra Improvement Notes

(none identified yet)

---

## Dependencies, Risks, Failure Modes

- **Dependency (folded into this plan, not deferrable):** organizer-name search requires
  `listPipelineStage` to populate `organizerName`. It currently does not (`dbRowToLead(row)` with no
  organizer arg). Steps 1-2 fix this. Without them AC2's organizer-name branch is dead.
- **Risk — `goto` vs `replaceState`:** using `goto()` for URL sync re-invalidates and re-runs the
  load function on every keystroke, defeating "no full page reload". Locked decision: use
  `replaceState` from `$app/navigation`. `+page.server.ts` reads `q` ONLY for the SSR initial value.
- **Risk — join row shape:** the `leftJoin` changes `.select()` from bare rows to `{ lead, organizerName }`. Step 2 must update the `.map()` accordingly or `dbRowToLead` receives the wrong object. Mirror `getLead` exactly.
- **Debounce divergence (intentional):** `debounceMs={200}` deviates from the app-canonical 300ms
  (`DEFAULT_DEBOUNCE_MS`) used on leads/reminders/reports. This is a deliberate, scoped exception per
  the issue's ~200ms spec — noted so a reviewer does not "fix" it back to 300.
- **Failure mode — undefined fields:** `organizerName`/`eventName` are optional on `Lead`.
  `matchesQuery` must coalesce to `''` before `.includes` (covered by a test case).

## Backwards Compatibility

Additive only. `listPipelineStage` return type is unchanged (organizerName was already an optional
`Lead` field, now populated). Load return gains `initialQuery`. No schema/migration. No consumer of
`listPipelineStage` outside `/pipeline` relies on `organizerName` being absent.

---

## VALIDATE Eligibility

**VALIDATE is REQUIRED — this plan is NOT skip-eligible.** Skip conditions fail: the change is not a
single-file <15-line edit (6 files), and it modifies a DB query function (`listPipelineStage`). Route
to `vc-validate-agent` before EXECUTE.

## Validate Contract

Status: CONDITIONAL
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (dominant signal S7 — 6 files in blast radius). SIMPLE, single-domain plan; no multi-package/schema/auth/high-risk signals. Sequential is the correct fit; no fan-out warranted.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 / AC5 | `matchesQuery` filter logic (case-insensitive substring across name/organizer/event; empty query shows all; undefined-safe; trim) | Fully-Automated | `bunx vitest run src/routes/pipeline/pipeline-search.test.ts` exits 0 | A |
| AC6 | Load-return / prop wiring + join map types line up (incl. `dbRowToLead(row.lead, undefined, row.organizerName)`) | Fully-Automated | `bun run check` exits 0 | A |
| AC6 | Lint clean | Fully-Automated | `bun run lint` exits 0 | A |
| AC1 / AC2 / AC3 | Typing filters cards live across columns; non-matching hidden; empty-column "no results" state renders | Agent-Probe | Manual DOM walkthrough at `/pipeline` (authed): type a term, confirm cards filter and an emptied column shows the muted "no results" line | D |
| AC4 | `?q=` set/cleared as user types (no reload); refresh with `?q=` shows filtered board | Agent-Probe | Manual browser check: type → observe URL updates without navigation flash; hard-refresh with `?q=foo` → board loads filtered | D |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

Failing stub (Fully-Automated row — AC2/AC5 `matchesQuery`):
```
test("should filter by name/organizer/event case-insensitively, show all on empty query, and be undefined-safe", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: matchesQuery filter logic (name/organizer/event/empty/no-match/undefined-safe/trim)")
})
```

Legacy line form (retained for existing consumers):
- matchesQuery predicate: Fully-automated: `bunx vitest run src/routes/pipeline/pipeline-search.test.ts`
- Typecheck: Fully-automated: `bun run check`
- Lint: Fully-automated: `bun run lint`
- DOM filter render / empty-state / URL sync (AC1/AC3/AC4): known-gap: documented — node-only vitest (no jsdom/component harness) + e2e blocked on shared Playwright auth fixture; backlog stub registered at EXECUTE/EVL

C-4 reconciliation: the `strategy:` column carries only proving strategies (Fully-Automated / Agent-Probe). Known-Gap is a named residual (gap-resolution D), never a strategy.

### Dimension findings

- Infra fit: PASS — `replaceState(url, state)` confirmed exported by `$app/navigation` in SvelteKit 2.63.0 (shallow routing; does not re-run load). New `pipeline-search.test.ts` is picked up by the node-env vitest glob `src/**/*.{test,spec}.{js,ts}`. `SearchInput.svelte` prop contract (`value`, `oninput:(v:string)=>void`, `debounceMs`, `ariaLabel`, `placeholder`) matches the plan's step-7 usage exactly. `crmOrganizers` is already imported in `leads.ts`.
- Test coverage: CONCERN — pure `matchesQuery` is fully-automated and well-covered (7 cases). AC1/AC3/AC4 (DOM render, empty-state, URL sync) have zero automated coverage; legitimately blocked (no jsdom/component harness; e2e self-skips on protected routes). Named residual + backlog stub — keeps gate CONDITIONAL, not FAIL.
- Breaking changes: PASS — `count()` is a physically separate query builder in `Promise.all` and receives no join; it is literally untouched. The `leftJoin(crmOrganizers, eq(crmLeads.organizerId, crmOrganizers.id))` is many-to-one (join key is the organizer PK), so the rows query cannot multiply rows. Return shape `{leads,total}` unchanged; `organizerName` now populated (additive). Load return gains `initialQuery` (additive). No consumer breaks. `visibilityCondition` in the `where` clause is preserved — the join does not widen visibility.
- Security surface: PASS — no auth/billing/migration/secret/trust-boundary surface. Reads an existing table through the existing visibility predicate. `q` is a client-side substring filter over already-loaded, already-authorized cards; it never reaches SQL. No evidence pack required (not a high-risk class).
- Section 1 (leads.ts `listPipelineStage` join): PASS — mechanically feasible; mirror `getLead` (leads.ts:498-505) exactly. Highest-risk edit: the `.select()` shape change and the `.map(row => dbRowToLead(row.lead, undefined, row.organizerName))` change must land together, or `dbRowToLead` receives the wrong object (a TS error caught by `bun run check`). Well-mitigated by the proven pattern.
- Section 2 (`pipeline-search.ts` + test): PASS — pure predicate, clear contract, comprehensive cases.
- Section 3 (`+page.server.ts` initialQuery): PASS — add `url` to destructure, compute `initialQuery = url.searchParams.get('q') ?? ''`; the "do NOT gate/re-run any DB query on `q`" instruction is present and essential.
- Section 4 (`+page.svelte` state + replaceState): CONCERN (minor, resolved via E1/E2) — `replaceState` is the correct API. Seed `query` with `$state(data.initialQuery ?? '')` (once) — not `$derived` — so the existing `invalidateAll()` (stage moves) does not clobber typed input. Build the URL from `page.url` via `$app/state` (page already imports `navigating` from `$app/state`).
- Section 5 (`PipelineBoard.svelte` empty-state): CONCERN (minor, resolved via E3) — under-specified prop threading. Columns already derive `cards = leads.filter(l => l.stage === stage)`; add an optional `isFiltering?: boolean` (or `query?: string`) prop and render a muted "No results" line when `col.cards.length === 0 && isFiltering`. No reusable per-column-body empty message exists today (the `'empty'` health label is a header indicator only) — minimal new markup needed.

### Execute-agent instructions

- E1 — In `+page.svelte`, declare `let query = $state(data.initialQuery ?? '')` (NOT `$derived`), so `invalidateAll()`-driven reloads do not reset the user's typed term. (Section 4 entry.)
- E2 — Sync the URL with `replaceState` from `$app/navigation`, never `goto()`. Build the target `URL` from `page.url` (`$app/state`); set `q` when non-empty, `delete` it when empty; call `replaceState(url, {})`. (Section 4 entry.)
- E3 — Thread an `isFiltering`/`query` signal into `PipelineBoard` and render the per-column "no results" line only when a column filters to zero cards AND a query is active. Reuse existing muted-text token styling; add minimal markup. (Section 5 entry.)
- E4 — Keep `debounceMs={200}` explicit on the pipeline `SearchInput` — this is a deliberate divergence from the app-canonical `DEFAULT_DEBOUNCE_MS` (300ms). Do not "fix" it back to 300. (Section 4 entry.)

Open gaps:
- DOM filter render / empty-state / URL sync (AC1/AC3/AC4): known-gap: documented — component render is not unit-testable (node-only vitest, no jsdom/`@testing-library/svelte`) and e2e is blocked by the missing shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Backlog stub to register at EXECUTE/EVL: a `pipeline-search` Playwright spec to run once the shared auth fixture lands. No plan supplement can close this (inherent test-infra limitation, not a plan defect).

What this coverage does NOT prove:
- `bunx vitest run src/routes/pipeline/pipeline-search.test.ts` proves the filter PREDICATE only — it does NOT prove any DOM renders, that cards visually hide/show, that the empty-column state appears, or that the `SearchInput` is wired to the board.
- `bun run check` proves TYPES align (load return, props, join map shape) — it does NOT prove runtime filtering behavior, URL sync, or that `replaceState` avoids a reload.
- `bun run lint` proves style/lint only — proves no behavior.
- Not proven by any automated gate: AC1 (input visible), AC3 (empty-column "no results" state), AC4 (`?q=` set/cleared without reload; refresh-with-`?q=` shows filtered board), and the live end-to-end of AC2 (typing filters real cards on screen). These remain manual-verification-pending.

Gate: CONDITIONAL (0 FAILs; concerns = 1 documented test-infra known-gap [AC1/AC3/AC4 DOM/URL] + 4 minor items resolved as execute-agent instructions E1–E4). The gate is CONDITIONAL rather than PASS because developed DOM-facing behavior (AC1/AC3/AC4) rests on a named Known-Gap residual, not an automated gate — per the net-gate vacuous-green ban. Filter LOGIC is fully-automated-proven; DOM WIRING is the named residual with a backlog stub.
Accepted by: session (VALIDATE) — the plan author pre-accepted this end state (Phase Completion Rules explicitly designate AC1/AC3/AC4 as manual-verification-pending and the gate as "CONDITIONAL on manual verification"). Concern accepted by name: "DOM filter render / empty-state / URL sync (AC1/AC3/AC4) — documented test-infra Known-Gap." Orchestrator/user to confirm before EXECUTE.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pipeline/active/pipeline-search-filter_07-07-26/pipeline-search-filter_PLAN_07-07-26.md`
2. **Last completed step:** PLAN written. Implementation not started.
3. **Validate-contract status:** pending (VALIDATE required — see VALIDATE Eligibility).
4. **Supporting context loaded:** `process/context/all-context.md`; `src/routes/pipeline/+page.server.ts`;
   `src/routes/pipeline/+page.svelte`; `src/lib/server/db/leads.ts` (`getLead` join at 498-505,
   `listPipelineStage` at 745-780); `src/lib/components/ui/search-input/SearchInput.svelte` +
   `search-input.ts`; `src/lib/components/pipeline/PipelineBoard.svelte`; `src/lib/types/index.ts` (`Lead`).
5. **Next step for a fresh agent:** run VALIDATE, then EXECUTE the checklist in order — start with the
   `listPipelineStage` join (steps 1-2) so organizer-name data exists before wiring the filter.

---

## Autonomous Goal Block

```
SESSION GOAL: PIPE-3 — client-side pipeline search filter (URL-synced via ?q=), incl. listPipelineStage organizer left-join
Charter + umbrella plan: N/A — single plan
Autonomy: standard RIPER-5 — EXECUTE requires explicit "ENTER EXECUTE MODE"; reversible edits auto-proceed; per feedback_autonomous_phase_execution.md
Hard stop conditions / safety constraints:
- Do NOT modify count() in listPipelineStage — add the leftJoin to the rows query only
- Do NOT use goto() for URL sync — replaceState only (goto re-runs load, defeats "no reload")
- Do NOT gate/re-run any DB query on ?q= in +page.server.ts (read it for SSR initial value only)
- Keep debounceMs={200} explicit (deliberate divergence from 300ms default)
Next phase: EXECUTE — process/features/pipeline/active/pipeline-search-filter_07-07-26/pipeline-search-filter_PLAN_07-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL — DOM/URL AC1/AC3/AC4 are documented manual-verification Known-Gap)
Execute start: fully-auto: `bunx vitest run src/routes/pipeline/pipeline-search.test.ts` + `bun run check` + `bun run lint` | agent-probe: manual DOM/URL walkthrough at /pipeline (authed) | high-risk pack: no
```
