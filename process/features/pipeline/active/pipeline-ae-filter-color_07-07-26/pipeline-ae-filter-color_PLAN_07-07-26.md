---
name: plan:pipeline-ae-filter-color
description: "PIPE-4 — manager AE filter (?rep=) + role-gated pipeline visibility, plus BLOCKED per-AE card color-coding (waiting on Jela palette)"
date: 07-07-26
feature: pipeline
---

# PIPE-4 — Pipeline AE Filter + Color-Coding — PLAN (SIMPLE)

**Date**: 07-07-26
**Status**: ACTIVE — Section A EXECUTE complete, EVL confirmation run clean (independent vc-tester re-run, no fix cycles needed, 07-07-26). Section A = `VERIFIED`. Section B (color-coding) remains BLOCKED on Jela's palette decision — plan stays in `active/` until Section B resolves.
**Complexity**: SIMPLE
**Feature**: pipeline

**TL;DR:** Add a manager-only AE (owner) filter to the pipeline board, mirroring the CAL-3 pattern exactly: extend `listPipelineStage` with an optional `filterRepId`, read a UUID-validated manager-only `?rep=` param in both the page loader and the lazy-load endpoint, render `RepFilterCombobox` gated behind `isManager`, and persist the filter in the URL. Reps see only their own cards with no filter control (already enforced by `visibilityCondition`). **Color-coding (card left-border by AE + legend) is BLOCKED on Jela's palette** and is isolated in its own checklist section — the rest ships independently. VALIDATE is REQUIRED (this changes which leads a query returns per role — a data-visibility/trust-boundary surface).

## Overview

Managers can filter the pipeline board to a single AE (account executive = lead owner) via a searchable dropdown in the toolbar, with the selection persisted in the URL as `?rep=<uuid>`. Reps never see the control and always see only their own cards. Card color-coding by AE is designed and structurally wired but its color values are deferred until a stakeholder (Jela) defines the palette.

## Goals

- Manager can filter the pipeline to one AE via a dropdown; selection persists in `?rep=`.
- Rep sees only their own cards, with no filter control rendered.
- Filter is a real server re-query (changes which leads are fetched), consistent with CAL-3.
- Structurally ready color hook in the card markup, values dropped in later (see BLOCKED section).

## Scope

**In scope (buildable now):** manager AE dropdown, `?rep=` URL persistence, role-gated server query (`filterRepId` in `listPipelineStage` + both call sites), rep trust-boundary enforcement, pure unit-testable filter-resolution helper.

**In scope but BLOCKED (gated on Jela):** card left-border color per AE, AE->color legend.

**Out of scope:** cross-surface color consistency (calendar/reports color-coding) — future-work note only in the backlog note. No schema change. No change to drag-drop stage logic.

## Assumptions / Dependencies

- **PIPE-3 toolbar lands first.** This plan places the dropdown in the same toolbar row PIPE-3 introduces (search bar). If PIPE-3 has not landed at EXECUTE time, the dropdown is placed in a minimal toolbar row created here; reconcile with PIPE-3's toolbar on merge. (Note: the current `src/routes/pipeline/+page.svelte` has NO toolbar/search and NO URL-nav helper yet — both are expected from PIPE-3.)
- **Color sub-section depends on** `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md` being resolved by Jela.
- Reuse `RepFilterCombobox` (`src/lib/components/ui/rep-filter-combobox/RepFilterCombobox.svelte`) unmodified.

## Acceptance Criteria

Traced from the PIPE-4 request. In-scope = Section A (unblocked); color items = Section B (blocked on Jela).

| # | Criterion | Section | proven by | strategy |
|---|---|---|---|---|
| AC1 | Manager can filter pipeline to one AE via dropdown | A | `resolvePipelineRepFilter` unit tests + `buildPipelineStageWhereClause` composed-SQL unit tests (Fully-Automated, no live DB) | Fully-Automated (decision + query composition) + Hybrid (defense-in-depth live-DB scoping) |
| AC2 | Card left-borders color-coded by assigned AE when no filter active | B (BLOCKED) | manual render check post-palette | Known-Gap (blocked on Jela + Playwright fixture) |
| AC3 | Legend maps AE name -> color | B (BLOCKED) | manual render check post-palette | Known-Gap (blocked on Jela + Playwright fixture) |
| AC4 | Rep sees only their own cards, no filter control rendered | A | `resolvePipelineRepFilter` rep-ignored unit test + `buildPipelineStageWhereClause` rep-no-widen SQL test + `{#if isManager}` gate | Fully-Automated (helper + query) + Agent-Probe (render) |
| AC5 | Filter persists in URL (`?rep=`) | A | `navigateRepFilter` goto pattern | Agent-Probe / Known-Gap (blocked on Playwright fixture) |
| AC6 | `bun run check` + `bun run lint` exit 0 | A | gate commands | Fully-Automated |

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/leads.ts` | Extract a pure exported `buildPipelineStageWhereClause(userId, role, stage, filterRepId?)` (P1) that composes `[isNull(deletedAt), eq(stage, <stage>), visibilityCondition(userId, role)]` and pushes `eq(crmLeads.ownerId, filterRepId)` ONLY for manager/super_manager; have `listPipelineStage(stage, page, limit, userId, role, filterRepId?)` call it for BOTH the rows query and the `count()` query (replacing the inline `visibilityCondition` composition). Reps ignore `filterRepId` (already own-scoped by `visibilityCondition`). Mirror the shape of `buildGoLiveWhereClause` (leads.ts:1470) exactly. Add a small pure helper `resolvePipelineRepFilter(role, rawRepId)` for the trust-boundary decision. `listActiveReps()` already exists — reuse as-is. |
| `src/routes/pipeline/+page.server.ts` | Compute `isManager`; UUID-validate + manager-gate `?rep=` into `filterRepId`; thread `filterRepId` into every `listPipelineStage` call; add `listActiveReps()` (manager only) to the returned data; return `activeReps` + `filterRepId`. |
| `src/routes/api/leads/pipeline-stage/+server.ts` | Same manager-gated `?rep=` read; thread `filterRepId` into `listPipelineStage` so lazy-loaded pages stay consistent with the filtered initial load. |
| `src/routes/pipeline/+page.svelte` | Render `RepFilterCombobox` (gated behind `isManager`) in the toolbar row; add a `goto('?'+params, {keepFocus:true})`-style `navigateRepFilter` helper mirroring calendar; include `rep` in the lazy-load `fetch()` URL so extras respect the filter. |
| `src/lib/components/pipeline/PipelineBoard.svelte` | **(BLOCKED sub-section only)** add `border-l-4` color hook on the card container keyed on `ownerId` via a color map; default falls back to existing `border-hairline`. Legend rendering. |
| `src/tests/pipeline.spec.ts` | Add pure-function unit tests for `resolvePipelineRepFilter` (manager+valid uuid, manager+invalid uuid, rep ignores param, no param, super_manager+valid uuid). |
| `src/tests/pipeline-db.spec.ts` | **(APPEND — P1; FILE ALREADY EXISTS with live-DB Phase 5 tests — do NOT overwrite)** APPEND ONE new **un-skipped** `describe('buildPipelineStageWhereClause — DB-free', …)` block to the existing file (which currently holds `describe.skipIf(SKIP_DB)` live-DB tests for `moveLeadStage`/`reassignLead`). Reuse the `.toSQL()` predicate-isolation pattern from `calendar-db.spec.ts` — copy its `whereSql()` / `whereClauseOf()` / `ownerPredicateCount()` helpers into (or alongside) the new block. The new block must NOT be wrapped in `skipIf(SKIP_DB)`: `.toSQL()` is synchronous and opens no DB connection (proven by `calendar-db.spec.ts` running these un-skipped in CI). Cover: (a) rep → own-scoped (a stray `filterRepId` never widens; `filterRepId` ignored); (b) manager + no filter → no owner-narrow predicate in the WHERE portion (team-wide); (c) manager + valid `filterRepId` → `owner_id` predicate bound to `filterRepId`, ANDed; (d) super_manager + valid `filterRepId` → scoped identically; (e) composition is AND, never OR — a rep's own-leads restriction can never be widened by a stray `filterRepId`. This moves the security-critical query composition from de-facto-Known-Gap Hybrid to Fully-Automated with NO live DB, reusing the already-proven CAL-3 `buildGoLiveWhereClause` pattern. |
| `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md` | Companion blocker note (already created) — resume trigger for the color sub-section. |

## Public Contracts

- **`listPipelineStage` signature change** — adds a trailing OPTIONAL `filterRepId?: string`. Backward compatible: existing two call sites (loader + lazy endpoint) are the only callers; omitting the arg preserves current behavior. No other package/caller depends on it.
- **`buildPipelineStageWhereClause(userId, role, stage, filterRepId?): SQL | undefined`** (new pure exported helper) — composes the pipeline WHERE clause; `filterRepId` narrows ONLY for manager/super_manager, always ANDed. Mirrors `buildGoLiveWhereClause`.
- **`resolvePipelineRepFilter(role, rawRepId): string | undefined`** (new pure helper) — returns the UUID to scope to, or `undefined`. Manager/super_manager + valid-UUID `rawRepId` -> the UUID (may be the manager's own id = "Mine"); rep role -> always `undefined`; malformed/absent -> `undefined`.
- **URL contract** — `?rep=<uuid>` on `/pipeline`. Manager-only; a rep hand-crafting it is ignored server-side (trust boundary). Mirrors calendar's `?repId`.
- **No schema/API-response contract change** beyond the added optional `activeReps`/`filterRepId` fields in the pipeline loader payload.

## Blast Radius

- **Scope:** ~5 source files + 2 test files, all within `src/routes/pipeline/`, `src/routes/api/leads/pipeline-stage/`, `src/lib/server/db/leads.ts` (one function + two helpers), `src/lib/components/pipeline/PipelineBoard.svelte`, and reuse (no modification expected) of `src/lib/components/ui/rep-filter-combobox/`.
- **Risk class:** role-based data-visibility / trust-boundary (a DB query scoping WHO sees WHICH leads). This is exactly why VALIDATE is required and non-skippable.
- **Regression surface:** the existing rep/manager visibility behavior on the pipeline (must remain: rep sees own; manager sees team-wide when no filter). Lazy-load pagination must stay consistent with the filtered initial load. The existing `pipeline-db.spec.ts` Phase 5 live-DB tests (`moveLeadStage`/`reassignLead`) must remain intact (P1 APPENDS a block, never overwrites).

---

## Implementation Checklist — SECTION A: Buildable Now (filter + URL + role gating)

Not blocked. EXECUTE can complete this section fully and independently of Jela's palette.

1. In `src/lib/server/db/leads.ts`, add pure helper `resolvePipelineRepFilter(role: Role, rawRepId: string | null | undefined): string | undefined` — UUID-regex guard identical to CAL-3 (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`); returns `undefined` for rep role, malformed, or absent input; returns the UUID for manager/super_manager + valid UUID.
2. In `src/lib/server/db/leads.ts`, extend `listPipelineStage` to accept a trailing optional `filterRepId?: string`. When set AND role is manager/super_manager, AND the `where` clause with `eq(crmLeads.ownerId, filterRepId)`. Do NOT apply it for reps (they are already narrowed by `visibilityCondition`). Apply the same `where` to BOTH the rows query and the `count()` total query so pagination totals match the filtered set.
2a. **(P1 — extract + unit-test the WHERE composition, no live DB)** In `src/lib/server/db/leads.ts`, extract an exported pure `buildPipelineStageWhereClause(userId: string, role: Role, stage: Stage, filterRepId?: string): SQL | undefined` that composes `and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, stage), visibilityCondition(userId, role))` and pushes `eq(crmLeads.ownerId, filterRepId)` into that AND ONLY when role is manager/super_manager and `filterRepId` is set — mirroring `buildGoLiveWhereClause` (leads.ts:1470) EXACTLY. Refactor `listPipelineStage` to call this builder for BOTH the rows query and the `count()` query — replacing the current inline `and(isNull(deletedAt), stage=…, visibilityCondition(…))` composition with the single composed clause. Then **APPEND** a new **un-skipped** `describe('buildPipelineStageWhereClause — DB-free', …)` block to the EXISTING `src/tests/pipeline-db.spec.ts` (which holds `describe.skipIf(SKIP_DB)` live-DB tests for `moveLeadStage`/`reassignLead` — **do NOT overwrite it**). Copy the `whereSql()` / `whereClauseOf()` / `ownerPredicateCount()` helpers from `src/tests/calendar-db.spec.ts` and use the same `.toSQL()` string+params assertions — **no DB connection** (`.toSQL()` is synchronous; the block must NOT be `skipIf(SKIP_DB)` so it runs in CI). Cover: (a) rep sees only own leads — a stray `filterRepId` never widens (rep path stays own-scoped by `visibilityCondition`; `filterRepId` ignored); (b) manager + no filter → no owner-narrow predicate in the WHERE portion (team-wide); (c) manager + valid `filterRepId` → `owner_id` predicate bound to `filterRepId`, ANDed; (d) super_manager + valid `filterRepId` → scoped identically; (e) confirm the composition is AND, never OR — a rep's own-leads restriction can never be widened by a stray `filterRepId`. This moves the security-critical query composition from de-facto-Known-Gap Hybrid to Fully-Automated with NO live DB, reusing the already-proven CAL-3 `buildGoLiveWhereClause` pattern.
3. In `src/routes/pipeline/+page.server.ts`: compute `isManager`; call `resolvePipelineRepFilter(role, isManager ? url.searchParams.get('rep') : null)` -> `filterRepId`; thread `filterRepId` into every `listPipelineStage(...)` call in the `BOARD_STAGES.map`; add `isManager ? listActiveReps() : Promise.resolve([])` to the `Promise.all`; return `activeReps` and `filterRepId` in the payload. (The loader currently destructures only `{ locals }` — add `url`.)
4. In `src/routes/api/leads/pipeline-stage/+server.ts`: read `?rep=` with the SAME manager-gate + `resolvePipelineRepFilter`; thread `filterRepId` into the `listPipelineStage(...)` call so lazy-loaded pages honor the active filter.
5. In `src/routes/pipeline/+page.svelte`: add a `navigateRepFilter(repId: string | undefined)` helper using `goto('?'+params, { keepFocus: true })` (mirror calendar's `navigate({repId})`), preserving any other existing query params; passing falsy (`''` OR `undefined`) clears `?rep=` and returns to team-wide.
6. In `src/routes/pipeline/+page.svelte`: render `RepFilterCombobox` in the toolbar row, gated behind `{#if isManager}` (derive `isManager` from `data.user`/role), wired with `users={data.activeReps}`, `selectedId={data.filterRepId}`, `currentUserId`, `allLabel="All AEs"`, `onSelect={navigateRepFilter}`. Reps render NO control.
7. In `src/routes/pipeline/+page.svelte`: include `rep` in the lazy-load `fetch()` URL (`/api/leads/pipeline-stage?stage=...&page=...&limit=...&rep=<current>`) so extras respect the active filter.
8. In `src/tests/pipeline.spec.ts`: add a `describe('resolvePipelineRepFilter')` block — cases: (a) manager + valid UUID -> that UUID; (b) manager + own UUID -> own UUID ("Mine"); (c) manager + malformed string -> undefined; (d) rep + valid UUID -> undefined (trust boundary); (e) no param -> undefined; (f) super_manager + valid UUID -> that UUID.
9. Run gates: `bun run check` and `bun run lint` exit 0; `bun run test:unit -- src/tests/pipeline.spec.ts` and `bun run test:unit -- src/tests/pipeline-db.spec.ts` pass the new cases (the new DB-free block runs even without `DATABASE_URL`).

---

## Implementation Checklist — SECTION B: BLOCKED — Color-Coding (gated on Jela)

**DO NOT START until** `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md` is resolved (Jela delivers: hex/token per AE, roster size + overflow behavior, unassigned fallback color, legend contrast requirement). This section is a separate follow-up; Section A ships without it.

B1. Define the AE color source: a `Record<ownerId, colorToken>` (or `ownerId -> CSS custom property`) built from Jela's palette. Decide storage per the note's overflow answer (static map vs generated).
B2. In `src/lib/components/pipeline/PipelineBoard.svelte`: add `border-l-4` on the card container (~line 126) whose color resolves from the map keyed on `c.ownerId`; `ownerId = null` / unknown / deactivated falls back to the existing `border-hairline` (no color).
B3. Render the legend (AE name -> color swatch) in/near the toolbar, meeting the contrast requirement Jela specifies for legend text. Show only the AEs present on the board (or full roster per Jela's decision).
B4. Confirm color shows only when no filter is active per AC (color-code by AE when unfiltered); when filtered to one AE, the single-AE view still colors consistently (design decision to record at EXECUTE).
B5. Update the backlog note with the delivered palette; re-run `bun run check` + `bun run lint`; add a rendering verification (Known-Gap until the shared Playwright auth fixture lands — see Verification Evidence).

## Phase Completion Rules

This SIMPLE plan has two execution segments with independent completion bars:

- **Section A is COMPLETE (shippable)** when: checklist steps 1-9 done; `bun run check` + `bun run lint` exit 0; the `resolvePipelineRepFilter` unit tests AND the new `buildPipelineStageWhereClause` DB-free SQL tests pass. Section A is `VERIFIED` at that point (the security-critical query composition is now Fully-Automated; the live-DB Hybrid check is defense-in-depth, not the primary proof). Section A does NOT wait on Section B.
  - **✅ VERIFIED (07-07-26)** — EXECUTE complete (see `pipeline-ae-filter-color_REPORT_07-07-26.md`); independent EVL confirmation run (vc-tester) passed clean on the FIRST attempt: `bun run check` 0 errors, `bun run lint` exit 0, `bunx vitest run` 427 pass / 148 skip / 0 fail. No fix cycles required (`results.tsv` iteration 3, `HALTED_SUCCESS`). AC1, AC4, AC5, AC6 met. AC2/AC3 (Section B) remain open — see below.
- **Section B is COMPLETE** when: the color-palette backlog note is resolved by Jela, steps B1-B5 done, gates green, and rendering verified (or accepted as a Known-Gap pending the shared Playwright auth fixture).
- **The overall plan is not "fully verified"** until both segments meet their bars, but Section A may be merged/closed independently. Code-only completion is `CODE DONE`, never `VERIFIED`, until its evidence row is satisfied or its gap is explicitly accepted.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `resolvePipelineRepFilter` unit tests (manager valid/own/malformed, rep-ignored, no-param, super_manager valid) in `src/tests/pipeline.spec.ts` via `bun run test:unit` | Fully-Automated | AC1 trust-boundary DECISION + AC4 (rep param ignored) |
| `buildPipelineStageWhereClause` composed-SQL unit tests (rep own-scoped/no-widen, manager no-filter → no owner-narrow, manager+filter → owner-narrow ANDed, super_manager+filter → ANDed, AND-not-OR) APPENDED as an un-skipped DB-free block to `src/tests/pipeline-db.spec.ts` via `bun run test:unit` — mirrors `calendar-db.spec.ts` `.toSQL()` pattern, no live DB | Fully-Automated | AC1 (query-scoping APPLICATION) + AC4 (rep restriction cannot be widened by a stray filter) |
| `bun run check` exits 0 | Fully-Automated | AC6 |
| `bun run lint` exits 0 | Fully-Automated | AC6 |
| Filtered `listPipelineStage` returns only the selected AE's leads for a manager, team-wide when unset, own-only for a rep (needs live Postgres) | Hybrid (precondition: live DB, `DATABASE_URL`) — now redundant defense-in-depth given `buildPipelineStageWhereClause` is Fully-Automated | AC1 (server scoping, end-to-end) |
| Manager sees `RepFilterCombobox`; rep sees no control; `?rep=` persists across reload | Agent-Probe / Known-Gap (blocked on shared Playwright auth fixture) | AC4, AC5 |
| Card left-border color per AE + legend renders correctly | Known-Gap (SECTION B blocked on Jela palette; rendering also gated on Playwright auth fixture) | AC2, AC3 |

**Failing stub (TDD, for Section A step 8, consumed at EXECUTE — not written to disk during PLAN):**
```
test("resolvePipelineRepFilter: rep with a valid uuid is ignored (trust boundary)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rep role returns undefined regardless of rawRepId")
})
```

**Failing stub (TDD, for Section A step 2a — `buildPipelineStageWhereClause`, consumed at EXECUTE — not written to disk during PLAN):**
```
test("buildPipelineStageWhereClause: rep own-restriction is never widened by a stray filterRepId (AND, not OR)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rep WHERE stays own-scoped; filterRepId ignored; composition is AND")
})
```

**Known-Gap residuals (recorded, keep those specific behaviors CONDITIONAL — do NOT block the Section-A gate):**
- Manager-dropdown rendering + `?rep=` persistence + legend rendering cannot be proven by an automated e2e until the shared Playwright authenticated-session fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Covered by an Agent-Probe in the interim (server-side trust boundary is independently Fully-Automated, so this is UX/defense-in-depth only). Backlog stub for the fixture already exists.
- Live-DB Hybrid gate for end-to-end query scoping remains manual/one-time until a live-DB CI harness exists (repo-wide known-gap) — but the security-critical WHERE composition itself is now Fully-Automated via `buildPipelineStageWhereClause` (P1), so this Hybrid gate is defense-in-depth, not the primary proof.
- SECTION B (color) is a Known-Gap by construction until Jela's palette lands — backlog note `pipeline-ae-color-palette_NOTE_07-07-26.md` is the recorded residual; that section's gate stays CONDITIONAL.

## Test Infra Improvement Notes

(none new identified) — this plan is blocked by two pre-existing, already-tracked infra gaps: the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) and the absent live-DB CI harness. The P1 supplement (`buildPipelineStageWhereClause` extraction + DB-free block appended to `pipeline-db.spec.ts`) introduces NO new test-infra work — it reuses the existing DB-free `.toSQL()` pattern already proven in `src/tests/calendar-db.spec.ts`.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pipeline/active/pipeline-ae-filter-color_07-07-26/pipeline-ae-filter-color_PLAN_07-07-26.md`
2. **Last completed step:** VALIDATE PASS (iteration 1 of PVL loop). No EXECUTE work started.
3. **Validate-contract status:** WRITTEN — Gate: PASS (see `## Validate Contract`). VALIDATE was REQUIRED (role-based data-visibility surface); satisfied.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `src/lib/server/db/leads.ts` (`visibilityCondition`, `listActiveReps`, `listPipelineStage`, `buildGoLiveWhereClause`), `src/routes/pipeline/+page.server.ts`, `src/routes/pipeline/+page.svelte`, `src/routes/api/leads/pipeline-stage/+server.ts`, `src/routes/calendar/+page.server.ts` (CAL-3 precedent), `src/tests/calendar-db.spec.ts` + `src/tests/pipeline-db.spec.ts`, `src/lib/components/ui/rep-filter-combobox/RepFilterCombobox.svelte`, `src/lib/components/pipeline/PipelineBoard.svelte`.
5. **Next step for a fresh agent:** Section A is DONE (EXECUTE + EVL confirmed clean, 07-07-26) — do not re-run it. **Resume point is SECTION B only**, and only once `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md` is resolved by Jela (four deliverables). Until then this plan stays in `active/` with no further action.


## Validate Contract

Status: PASS
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl
supersedes: 07-07-26 (outer-pvl) — iteration 1 PVL supplement applied + re-validated; the query-composition coverage gap (P1) is closed at plan level, and a file-collision the supplement introduced (`pipeline-db.spec.ts` marked NEW but already holds live-DB Phase 5 tests) is resolved in-plan (APPEND, do not overwrite).

PVL history: iteration 0 (baseline) = CONDITIONAL, 0 FAIL / 2 CONCERN / 4 PASS (P1 query-composition coverage gap + Section B known-gap-by-construction). iteration 1 (this contract) = PASS, 0 FAIL / 0 unresolved CONCERN / Section B carried as accepted known-gap-by-construction. results.tsv has a completed cycle row (header + baseline + iter-1), so PHASE_COMPLETE: VALIDATE is legal.

Parallel strategy: sequential
Rationale: Signal score 3/7 (S2 trust-boundary/auth-adjacent, S6 permission-logic high-risk class, S7 ~7 files). Single domain (`src/routes/pipeline` + `src/lib/server/db/leads.ts`), self-contained plan, exact CAL-3 precedent already read into context — in-window synthesis; parallel subagents add cost with no benefit. EXECUTE (Section A only) = 1 opus agent, ~7 files.

Test gates (C3 5-column table — ADDITIVE; the legacy line form below is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC4 (decision) | `resolvePipelineRepFilter(role, rawRepId)` returns the UUID for manager/super_manager + valid UUID; `undefined` for rep role, malformed, or absent — the trust-boundary DECISION (which owner id to scope to) | Fully-Automated | `bun run test:unit -- src/tests/pipeline.spec.ts` — `describe('resolvePipelineRepFilter')` cases (a) manager+valid→uuid, (b) manager+own→own, (c) manager+malformed→undefined, (d) rep+valid→undefined, (e) no param→undefined, (f) super_manager+valid→uuid | A |
| AC1 (query application) | `listPipelineStage`/`buildPipelineStageWhereClause` applies `eq(ownerId, filterRepId)` ANDed with `visibilityCondition`, ONLY for manager/super_manager; identical `where` on rows + count queries; both call sites (loader + lazy endpoint) consistent — the row-scoping APPLICATION half | Fully-Automated | `bun run test:unit -- src/tests/pipeline-db.spec.ts` — new un-skipped DB-free `describe('buildPipelineStageWhereClause')` block asserting `.toSQL()` predicate shape (rep no-widen, manager no-filter → no owner-narrow, manager+filter → owner-narrow ANDed, super_manager+filter → ANDed, AND-not-OR) via `whereClauseOf`/`ownerPredicateCount`, mirroring `calendar-db.spec.ts` | A (via P1 supplement) |
| AC6 | `bun run check` + `bun run lint` exit 0 | Fully-Automated | `bun run check` exits 0; `bun run lint` exits 0 | A |
| AC4/AC5 (render) | Manager sees `RepFilterCombobox`; rep sees NO control; `?rep=` persists across reload | Agent-Probe | manual/agent render probe (server-side trust boundary is independently proven Fully-Automated by the helper + query guard; render gate is defense-in-depth/UX) | D (blocked on shared Playwright auth fixture — pre-existing repo-wide known-gap) |
| AC2/AC3 (Section B) | Card left-border color per AE + AE→color legend | Known-Gap | — | D (blocked on Jela palette AND Playwright fixture — documented backlog residual) |

gap-resolution legend: A — proven now; B — fixed in this plan (added by checklist); C — deferred to named later phase; D — backlog test-building stub / named residual (keep-active).

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained for existing validate-contract consumers):
- resolvePipelineRepFilter decision: Fully-automated: `bun run test:unit -- src/tests/pipeline.spec.ts`
- buildPipelineStageWhereClause query composition: Fully-automated: `bun run test:unit -- src/tests/pipeline-db.spec.ts` (DB-free `.toSQL()` block; no live DB needed)
- check/lint gates: Fully-automated: `bun run check` && `bun run lint`
- manager/rep control render + `?rep=` persistence: agent-probe now, known-gap for automated e2e: blocked on shared Playwright auth fixture
- Section B color-coding: known-gap: blocked on Jela palette (documented backlog residual)

Failing stub (Fully-Automated — AC1/AC4 decision row):
```
test("resolvePipelineRepFilter: rep with a valid uuid is ignored (trust boundary)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rep role returns undefined regardless of rawRepId")
})
```

Failing stub (Fully-Automated — AC1 query-application row):
```
test("buildPipelineStageWhereClause: rep own-restriction is never widened by a stray filterRepId (AND, not OR)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rep WHERE stays own-scoped; filterRepId ignored; composition is AND")
})
```

Dimension findings:
- Infra fit: PASS — all referenced source files exist; gate commands (`check`/`lint`/`test:unit`) all present in package.json; the db client is a lazy Proxy and `.toSQL()` opens no connection (proven by `calendar-db.spec.ts` running un-skipped DB-free `.toSQL()` assertions in CI), so the new `buildPipelineStageWhereClause` tests need no live DB.
- Test coverage: PASS — the trust-boundary DECISION (resolvePipelineRepFilter, all named security branches) AND the security-critical query-scoping APPLICATION (the WHERE composition via `buildPipelineStageWhereClause`) are BOTH now Fully-Automated with no live DB, using the proven CAL-3 `.toSQL()` predicate-isolation pattern. This was the single genuine gap that held iteration 0 at CONDITIONAL; it is closed. Every developed Section-A behavior now has a proving-strategy gate (Fully-Automated or Agent-Probe); none rests on Known-Gap alone.
- Breaking changes: PASS — `listPipelineStage` gains a trailing OPTIONAL `filterRepId?`; backward compatible; only 2 callers, both updated; no schema change; new optional payload fields (`activeReps`/`filterRepId`); no external consumer. The existing `pipeline-db.spec.ts` Phase 5 live-DB tests are preserved (P1 APPENDS a block; do-not-overwrite instruction on record — E7).
- Security surface: PASS — triple-defense against a rep hand-crafting `?rep=<uuid>`, verified against live source: (1) both call sites gate the param behind `isManager` AND route through `resolvePipelineRepFilter` (returns `undefined` for reps); (2) `buildPipelineStageWhereClause` applies the owner-narrow ONLY for manager/super_manager; (3) the filter is always ANDed (narrowing), never ORed (widening), so a rep can never widen their view. Correctly composes with `visibilityCondition` (AND, never OR), mirroring the proven `buildGoLiveWhereClause`.
- Section A feasibility: PASS — mechanically feasible; `listPipelineStage` (leads.ts:748) currently composes the WHERE inline and applies it to both the rows and `count()` queries (the exact extraction target); `buildGoLiveWhereClause` (leads.ts:1470) is an exact template; loader needs a trivial `url` destructure add, endpoint already has `url`. Independent of Section B (disjoint files — Section A never touches `PipelineBoard.svelte`).
- Section B feasibility: CONCERN (known-gap by construction) — correctly isolated behind an explicit DO-NOT-START gate; not executable until Jela's palette lands; documented resume trigger. Excluded from blocking per known-gap exclusion.

Open gaps:
- Manager-dropdown / rep-no-control render + `?rep=` persistence: known-gap for automated e2e — blocked on shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Covered by an Agent-Probe in the interim. Server-side trust boundary is independently Fully-Automated, so this is UX/defense-in-depth coverage only — does NOT block the gate.
- Live-DB Hybrid end-to-end scoping: known-gap — cannot run in CI (repo-wide, no live-DB harness). Now redundant defense-in-depth because the WHERE composition is Fully-Automated via `buildPipelineStageWhereClause`. Does NOT block the gate.
- Section B (color-coding): known-gap: documented as backlog residual — see `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md` (waiting on Jela). NOT a new-plan-required gap; it is the blocked sub-section of THIS plan. Does NOT block the Section-A gate.

<!-- What This Coverage Does NOT Prove -->
What this coverage does NOT prove:
- `bun run test:unit -- src/tests/pipeline.spec.ts` (helper cases) proves ONLY which owner id the trust-boundary decision returns per role/input — NOT that the query applies it.
- `bun run test:unit -- src/tests/pipeline-db.spec.ts` (new DB-free block) proves the composed WHERE clause shape (`owner_id` predicate present/absent, bound to the right param, ANDed) — it does NOT prove that BOTH call sites (loader + lazy endpoint) actually thread `filterRepId` into `listPipelineStage`; that call-site consistency is a code-review/Agent-Probe concern (execute-agent instruction E2), not asserted by the SQL test.
- `bun run check` / `bun run lint` prove type-safety and style only — NOT runtime scoping behavior.
- The Hybrid live-DB scoping check, when run manually, proves row scoping for the sampled roles/reps only — NOT every role×param combination, and it cannot run in CI (no live-DB harness).
- No gate here proves the manager dropdown renders, the rep sees no control, or `?rep=` survives reload (Playwright-fixture known-gap; Agent-Probe interim only).
- Nothing here proves any Section B color/legend behavior (blocked on Jela).

Proposed plan updates (applied in this contract's V6):
- Corrected Touchpoints + checklist step 2a: `pipeline-db.spec.ts` is NOT new — it already holds live-DB Phase 5 tests. Step 2a now says APPEND an un-skipped DB-free `describe` block, do NOT overwrite. Builder signature corrected to include `stage` (`buildPipelineStageWhereClause(userId, role, stage, filterRepId?)`), matching the inline WHERE that includes `eq(stage, …)`.

Execute-agent instructions:
- E1 (Section A step 2/2a): implement the query-level role guard INSIDE `buildPipelineStageWhereClause` — apply `eq(ownerId, filterRepId)` only when role is manager/super_manager. Do NOT rely solely on callers passing a pre-resolved `filterRepId`; the query must be self-defending like CAL-3's `buildGoLiveWhereClause`. Apply the identical `where` to BOTH the rows query and the `count()` total.
- E2 (Section A step 4): the lazy endpoint MUST derive `isManager` and route `?rep=` through `resolvePipelineRepFilter` exactly like the loader — never thread `url.searchParams.get('rep')` raw into `listPipelineStage`. Both call sites must be consistent or lazy-loaded pages will leak/desync from the filtered initial load.
- E3 (Section A step 3): add `url` to the loader's destructure (`async ({ locals, url })`) — it currently destructures only `{ locals }`.
- E4 (Section A step 5/6): `RepFilterCombobox.onSelect` emits `''` (empty string) for the "All AEs" clear, not `undefined`. `navigateRepFilter` must coerce falsy (`''` OR `undefined`) → drop the `?rep=` param so clearing returns a clean team-wide URL (no stray `?rep=`).
- E5 (Section A step 8): include a super_manager+valid-UUID case in the helper tests (the helper treats manager/super_manager identically but only `manager` was originally specified).
- E6 (scope fence): EXECUTE Section A ONLY. Section B (color-coding) is BLOCKED on Jela's palette — do NOT start it.
- E7 (Section A step 2a — CRITICAL, do-not-overwrite): `src/tests/pipeline-db.spec.ts` ALREADY EXISTS and holds live-DB Phase 5 tests (`moveLeadStage`/`reassignLead`, all `describe.skipIf(SKIP_DB)`). APPEND the new `buildPipelineStageWhereClause` block to that file — do NOT overwrite or replace it. The new block must NOT be wrapped in `skipIf(SKIP_DB)` (it is DB-free via `.toSQL()` and must run in CI). After the edit, confirm the pre-existing Phase 5 `describe` blocks are still present and unchanged.
- E8 (Section A step 2a — signature): `buildPipelineStageWhereClause` takes a `stage: Stage` param (the WHERE composes `eq(crmLeads.stage, stage)`), unlike `buildGoLiveWhereClause` which uses fixed range conditions. Thread the current stage from `listPipelineStage` into the builder for both the rows and `count()` queries.

Gate: PASS (no FAILs; the single genuine closeable CONCERN [P1 query-composition coverage] is closed at plan level via step 2a; the file-collision found during re-validation is resolved in-plan via corrected wording + E7/E8; Section B + Playwright-render + live-DB gaps are documented/accepted known-gaps that do not gate the shippable Section-A scope — no developed Section-A behavior rests on Known-Gap alone).
Accepted by: session (autonomous outer-PVL validate-agent, /goal execution) — accepted known-gaps (do NOT block PASS): (1) manager/rep render + `?rep=` persistence automated-e2e blocked on shared Playwright auth fixture (Agent-Probe interim); (2) live-DB Hybrid scoping gate blocked on absent live-DB CI harness (now redundant defense-in-depth); (3) Section B color-coding blocked on Jela palette. The query-composition CONCERN (P1) that held iteration 0 at CONDITIONAL is now CLOSED, not accepted-as-gap.

## Autonomous Goal Block

```
SESSION GOAL: PIPE-4 — manager-only AE (owner) filter on the pipeline board (?rep= URL persistence, role-gated server re-query) + BLOCKED per-AE card color-coding (waiting on Jela).
Charter + umbrella plan: N/A — single plan (process/features/pipeline/active/pipeline-ae-filter-color_07-07-26/pipeline-ae-filter-color_PLAN_07-07-26.md)
Autonomy: standard RIPER-5 — VALIDATE done (PASS, iteration 1 of PVL loop). Proceed to EXECUTE Section A only. No-inline-execution: all edits/gates run via spawned vc-execute-agent / vc-tester.
Hard stop conditions / safety constraints:
- Trust boundary: a rep must NEVER see another rep's leads. The ?rep= filter is manager-only, applied only for manager/super_manager, always ANDed (narrowing) with visibilityCondition, never ORed. Enforce at BOTH call sites (loader + lazy endpoint) and inside buildPipelineStageWhereClause.
- Do NOT overwrite src/tests/pipeline-db.spec.ts — it holds live-DB Phase 5 tests. APPEND an un-skipped DB-free buildPipelineStageWhereClause block (E7).
- Do NOT start Section B (color-coding) — BLOCKED until Jela delivers the palette (per-AE hex/token, roster overflow, unassigned fallback, legend contrast). Resume trigger = process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md.
- No schema change. No change to drag-drop stage logic.
Next phase: EXECUTE — Section A of pipeline-ae-filter-color_PLAN_07-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: PASS, generated-by: outer-pvl)
Execute start: Fully-auto: bun run test:unit -- src/tests/pipeline.spec.ts && bun run test:unit -- src/tests/pipeline-db.spec.ts && bun run check && bun run lint | Hybrid: live-DB query-scoping check (needs DATABASE_URL, defense-in-depth) | Agent-probe: manager sees RepFilterCombobox, rep sees none, ?rep= persists | high-risk pack: recommended (trust-boundary/permission class — capture adversarial hand-crafted ?rep= scenario)
```
