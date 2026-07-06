---
name: plan:195-editable-live-event-dates
description: Make "Ticket Sale Start" (goLiveDate relabel) and "Event Date" (eventDate) editable in the lead-detail onboarding tab
date: 06-07-26
feature: leads
---

# Editable "Ticket Sale Start" + "Event Date" on Lead Detail Onboarding Tab (GitHub #195)

**Date**: 06-07-26
**Status**: Active — planned, not executed
**Complexity**: SIMPLE (single-phase, 2 files, 8 checklist steps)
**Depends on**: #194 (live stage — already in development; onboarding tab already renders for `won` + `live` leads)

## Overview / Context and Goals

### TL;DR
Wire `eventDate` into the onboarding-tab edit form (it is already DB/API/type/Zod-ready but has no UI), and relabel the existing `goLiveDate` input from "Go-live date" to "Ticket Sale Start". No schema, migration, or API-contract changes. The one required schema edit is a validation-branch fix: `leadUpdateSchema.eventDate` (the schema the PATCH endpoint actually validates) must accept the empty-string clear path.

### Goals
1. `eventDate` is editable from the onboarding tab and persists via the existing PATCH endpoint.
2. `goLiveDate` input is relabeled "Ticket Sale Start" (behavior unchanged).
3. `leadUpdateSchema.eventDate` accepts the cleared/unset empty-string (`''`) path so saves for leads without an event date do not regress.

### Scope
- **In scope:** `src/routes/leads/[id]/+page.svelte` (state + resync + save body + input markup + relabel), `src/lib/zod/schemas.ts` (`leadUpdateSchema.eventDate` empty-string branch — the load-bearing edit; plus optional `onboardingUpdateSchema` consistency), `src/tests/schemas.spec.ts` (empty-string clear-path assertion).
- **Out of scope:** schema/migration changes, API `/api/leads/[id]` contract changes (already forwards `eventDate`), `eventDateRaw` (left untouched/hidden), the read-only Overview-tab `eventDate` display (unchanged).

### Context loaded
`process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`. Source verified against `src/routes/leads/[id]/+page.svelte` and `src/lib/zod/schemas.ts`.

## Phase Completion Rules
SIMPLE single-phase plan. The phase is complete only when: all 8 checklist steps are applied AND both automated gates (`bun run check`, `bun run test:unit:ci`) are green. Code-complete without green gates is `CODE DONE`, not `VERIFIED`. Manual/agent-probe gates (AC1–AC4 UI render + persist) are recorded but do not block VERIFIED given the known absent shared e2e auth fixture (see Test Infra Improvement Notes).

## Touchpoints
| File | Change |
|---|---|
| `src/routes/leads/[id]/+page.svelte` | Add `eventDate` `$state` (near line 89), resync in `$effect` (near line 105), add to `saveOnboarding()` body (near line 128), add `<input type="date">` in the onboarding date grid (near lines 568-578), relabel `goLiveDate` label (line 570) |
| `src/lib/zod/schemas.ts` | **Load-bearing:** add `.or(z.literal(''))` to `leadUpdateSchema.eventDate` (lines 106-109) so an empty-string clear path validates. Consistency-only: add `eventDate` regex field to `onboardingUpdateSchema` (after `goLiveDate`, near line 166) |
| `src/tests/schemas.spec.ts` | Add one assertion: `leadUpdateSchema.safeParse({ name, category, eventDate: '' })` succeeds (empty-string clear path) |

## Public Contracts
- **PATCH endpoint validation schema IS edited (load-bearing).** The PATCH `/api/leads/[id]` endpoint validates its body against `leadUpdateSchema`. That schema's `eventDate` field (schemas.ts lines 106-109) is currently `.regex(...).optional()` with **no empty-string branch**. When `lead.eventDate` is null (the common case), the onboarding form's `eventDate` state var is `''`, so the added `saveOnboarding()` body would send `eventDate: ''`, which fails the regex → 400 and regresses saves for any lead without an event date. **Fix:** add `.or(z.literal(''))` to `leadUpdateSchema.eventDate`, mirroring the exact pattern already on `goLiveDate` (lines 132-136) and `onboardingStartDate` (lines 127-131). Empty string then passes validation and is forwarded to `updateLead` as `undefined`.
- **No external API-contract shape change.** The endpoint's accepted fields are unchanged; only the `eventDate` field gains an empty-string acceptance branch to match its siblings.
- Client continues to use the repo-mandatory `safeParse()` + raw `fetch()` PATCH idiom; the `eventDate` string is sent in the existing `saveOnboarding()` body (empty string → validated → `undefined`, matching `goLiveDate`).

## Blast Radius
- **Files:** 3 (`+page.svelte`, `schemas.ts`, `schemas.spec.ts`).
- **Packages:** 1 (the SvelteKit app; leads feature only).
- **Risk class:** LOW — UI edit + a Zod validation-branch addition on the PATCH-validated schema + one unit-test assertion. No migration, no auth, no billing, no new API surface. The load-bearing runtime change is the `leadUpdateSchema.eventDate` empty-string branch (prevents a 400 regression) plus the input binding.
- **`onboardingUpdateSchema` edit is consistency-only / dead code:** `onboardingUpdateSchema` is not imported by the PATCH endpoint or anywhere else in `src/` — it has **zero runtime effect**. The endpoint uses `leadUpdateSchema` exclusively. Retained only for schema symmetry; not required for correctness.

## Implementation Checklist
1. `src/routes/leads/[id]/+page.svelte` — add `let eventDate = $state('');` immediately after `let goLiveDate = $state('');` (line 89).
2. `src/routes/leads/[id]/+page.svelte` — in the `$effect` resync block, add `eventDate = lead.eventDate ?? '';` after `goLiveDate = lead.goLiveDate ?? '';` (line 105).
3. `src/routes/leads/[id]/+page.svelte` — in the `saveOnboarding()` PATCH body, add `eventDate,` after `goLiveDate,` (line 128).
4. `src/routes/leads/[id]/+page.svelte` — relabel the existing `goLiveDate` input label (line 570): `Go-live date` → `Ticket Sale Start`.
5. `src/routes/leads/[id]/+page.svelte` — add a new date input inside the onboarding date grid (the `grid grid-cols-2` block containing `onboardingStartDate` + `goLiveDate`, ~lines 568-578), mirroring the `goLiveDate` `<div>`/`<label for="ob-eventdate">`/`<input id="ob-eventdate" type="date" bind:value={eventDate}>` pattern with identical classes; label text "Event Date". (A third item in the 2-col grid wraps to a new row — acceptable.)
5b. `src/lib/zod/schemas.ts` — **(load-bearing)** add `.or(z.literal(''))` to `leadUpdateSchema.eventDate` (the field validated by the PATCH endpoint, lines 106-109), mirroring the exact pattern already used for `goLiveDate` (lines 132-136) and `onboardingStartDate` (lines 127-131). This ensures a cleared/unset event date (`''`) passes validation and is forwarded to `updateLead` as `undefined` — without this, saving any lead with no event date returns 400.
6. `src/lib/zod/schemas.ts` — **(consistency-only / dead code — zero runtime effect; the endpoint uses `leadUpdateSchema` exclusively)** add an `eventDate` field to `onboardingUpdateSchema` (after `goLiveDate`, ~line 166), copying the exact `goLiveDate` shape: `.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(''))`.
7. `src/tests/schemas.spec.ts` — add one assertion that `leadUpdateSchema.safeParse({ name: 'X', category: 'Y', eventDate: '' })` succeeds, proving the empty-string clear path validates. Then run verification gates (`bun run check` + `bun run test:unit:ci`) and confirm green.

## Acceptance Criteria
- **AC1:** The onboarding tab renders an editable "Event Date" `<input type="date">` bound to `eventDate`, pre-filled from `lead.eventDate`.
- **AC2:** The `goLiveDate` input label reads "Ticket Sale Start" (not "Go-live date").
- **AC3:** Saving the onboarding form PATCHes `eventDate`; after `invalidateAll()` the new value round-trips and the input reflects server truth.
- **AC4:** Clearing the Event Date field and saving omits/nulls it (empty-string path validates via `leadUpdateSchema.eventDate` `.or(z.literal(''))`, same as `goLiveDate`) with no validation error / no 400.
- **AC5:** `leadUpdateSchema.eventDate` accepts an empty string (`''`); `onboardingUpdateSchema` contains `eventDate` matching the `goLiveDate` regex shape; `bun run test:unit:ci` schema suite stays green including the new empty-string assertion.
- **AC6:** No schema/migration/API-contract changes introduced; typecheck passes.

## Verification Evidence
| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` (svelte-check typecheck) exits 0 | Fully-Automated | AC6 — no type/API regressions; `eventDate` binding + schema field typecheck |
| `bun run test:unit:ci` (Vitest `src/tests/schemas.spec.ts`) exits 0 — includes the new `leadUpdateSchema.safeParse({ ..., eventDate: '' })` success assertion | Fully-Automated | AC5, AC4 — `leadUpdateSchema` accepts empty-string clear path + valid `eventDate`, rejects malformed date |
| Manual: open a `won`/`live` lead → onboarding tab → confirm "Event Date" input pre-filled + "Ticket Sale Start" label | Agent-Probe | AC1, AC2 — UI render + label copy |
| Manual: edit Event Date, Save, confirm toast + persisted value after reload; also save a lead with no event date and confirm no 400 | Agent-Probe | AC3, AC4 — persist + round-trip + clear path (Hybrid coverage blocked by absent shared e2e auth fixture) |

## Post-Phase Testing
Testing context: `process/context/tests/all-tests.md`. Automated gates run at the end of the single phase (checklist step 7): `bun run check` (svelte-check) and `bun run test:unit:ci` (Vitest schema suite `src/tests/schemas.spec.ts`, invokes `vitest --run`). Manual/agent-probe verification (AC1–AC4) is performed against a `won`/`live` lead detail page.

## Test Infra Improvement Notes
Manual/agent-probe gates for AC1–AC4 exist because the repo has no shared Playwright authenticated-session fixture (tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Once that fixture lands, AC3/AC4 (persist + round-trip + no-400 clear path) should be promoted to a Hybrid Playwright e2e gate on the lead-detail onboarding tab. No new gap introduced by this plan.

## Dependencies, Risks, Integration Notes
- **Dependency:** #194 live-stage work — onboarding tab already renders for `won` + `live` leads (`+page.svelte` line 64); no additional gating needed.
- **Risk:** LOW. Novel paths are the input binding and the `leadUpdateSchema.eventDate` empty-string branch. Without the branch, saving a lead with no event date regresses to a 400 — this is the primary correctness fix and is covered by the new unit assertion. `eventDate` already persists via `updateLead` (writes `crm_lead_history` audit row automatically).
- **Integration note:** `eventDateRaw` (`text('event_date_raw')`) is intentionally left untouched — do not surface or bind it.
- **Convention:** follow Svelte 5 runes (`$state`/`$effect`) and the `safeParse()` + `fetch()` form idiom; do NOT introduce Superforms.

## Resume and Execution Handoff
1. **Selected plan file:** `process/features/leads/active/195-editable-live-event-dates_06-07-26/195-editable-live-event-dates_PLAN_06-07-26.md`
2. **Last completed step:** none — plan authored, not yet executed.
3. **Validate-contract status:** PASS (written 06-07-26; PVL cycle 1 after supplement).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`; source verified at `src/routes/leads/[id]/+page.svelte` (lines 89, 105, 128, 570, 568-578) and `src/lib/zod/schemas.ts` (`leadUpdateSchema.eventDate` lines 106-110, `onboardingUpdateSchema` lines 154-176).
5. **Next step for a fresh agent:** execute checklist steps 1-7 (including 5b) in order; both source files are small edits mirroring the existing `goLiveDate` wiring verbatim. The one load-bearing edit is step 5b (`leadUpdateSchema.eventDate` empty-string branch). Run `bun run check` + `bun run test:unit:ci` as the closing gate.

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 0/7 — single-file-domain (3 files, 1 package), LOW risk, no schema/API/auth/multi-package surface. Dominant signal: none present.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4/AC5 | `leadUpdateSchema` accepts empty-string `eventDate` clear path (prevents 400 regression on leads with no event date) | Fully-Automated | `bun run test:unit:ci` — new assertion `leadUpdateSchema.safeParse({ name:'X', category:'Y', eventDate:'' })` returns `success: true` | A |
| AC6 | `eventDate` binding + schema field typecheck; no type/API-contract regression | Fully-Automated | `bun run check` (svelte-check) exits 0 | A |
| AC1 | "Event Date" `<input type="date">` renders, bound to `eventDate`, pre-filled from `lead.eventDate` | Agent-Probe | Open a `won`/`live` lead → onboarding tab → confirm input present + pre-filled | D |
| AC2 | `goLiveDate` label reads "Ticket Sale Start" (not "Go-live date") | Agent-Probe | Visual check of onboarding date-grid label copy | D |
| AC3 | Save PATCHes `eventDate`; value round-trips after `invalidateAll()` | Agent-Probe | Edit Event Date → Save → reload → confirm persisted value reflects server truth | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue). Residual for AC1/AC2/AC3 = shared Playwright authenticated-session fixture, tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Pre-existing repo-wide gap; NOT introduced by this plan.

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — the e2e-automation residual for AC1/AC2/AC3 is carried as gap-resolution D, not as a strategy value.

Failing stub (Fully-Automated AC4/AC5 row):
```
test("should accept empty-string eventDate clear path on leadUpdateSchema", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: leadUpdateSchema.safeParse({ name:'X', category:'Y', eventDate:'' }) returns success: true")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Schema empty-string validation: Fully-automated: `bun run test:unit:ci` (new `leadUpdateSchema` empty-string assertion in `src/tests/schemas.spec.ts`)
- Typecheck: Fully-automated: `bun run check` (svelte-check)
- UI render + label + persist (AC1/AC2/AC3): agent-probe: manual `won`/`live` lead onboarding-tab check | known-gap: e2e Playwright auth fixture absent (backlog `e2e-auth-bootstrap_NOTE_01-07-26.md`)

Dimension findings:
- Infra fit: PASS — SvelteKit `+page.svelte`/Zod pattern, no container/port/runtime surface; runners `bun run check` + `bun run test:unit:ci` correct per tests context.
- Test coverage: PASS — the only NEW logic (schema empty-string branch, the 400-regression fix) has a Fully-Automated unit gate; UI behaviors covered by Agent-Probe; e2e automation is a pre-accepted repo-wide Known-Gap residual, no new gap.
- Breaking changes: PASS — empty-string branch is additive (widens acceptance, narrows nothing); sole consumer is the PATCH endpoint (`api/leads/[id]/+server.ts:17`), which benefits. `onboardingUpdateSchema` edit is dead code (never imported).
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface; date regex retained for non-empty values; empty string maps to `undefined`, no injection vector.
- Section "Implementation Checklist" feasibility: PASS — all 5 svelte anchors (state 89, resync 105, save-body `goLiveDate,` 128, label 570, `ob-golive` grid div 568-578) and the schema anchor (leadUpdateSchema.eventDate 106-109) verified present + uniquely matchable; test spec already imports `leadUpdateSchema`. Highest-risk edit = step 5b (empty-string branch), mitigated by the step-7 unit assertion and correctly sequenced.

Open gaps:
- AC1/AC2/AC3 UI-level e2e automation: known-gap: documented as pre-existing repo-wide gap (shared Playwright auth fixture) — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Excluded from CONCERN/FAIL count (pre-accepted, no new gap introduced).

What this coverage does NOT prove:
- `bun run test:unit:ci` proves ONLY the schema-layer empty-string acceptance and valid/invalid `eventDate` parsing. It does NOT prove: the `<input type="date">` actually renders in the onboarding tab, the label text change, the client `saveOnboarding()` body includes `eventDate`, or the end-to-end PATCH → DB persist → `invalidateAll()` round-trip.
- `bun run check` proves ONLY type-correctness of the binding + schema field. It does NOT prove any runtime UI behavior.
- Agent-Probe (manual) checks cover AC1/AC2/AC3 render+persist but are not automated/CI-repeatable until the shared Playwright auth fixture lands.

Prior-gap verification (PVL cycle 1 — supplement applied, prior gate BLOCKED on 3 gaps):
- F1 (was FAIL) — RESOLVED: checklist step 5b adds `.or(z.literal(''))` to `leadUpdateSchema.eventDate`; current source (schemas.ts 106-109) confirms the branch is absent, so the fix is real + load-bearing.
- F2 (was CONCERN) — RESOLVED: Touchpoints/Public Contracts/Blast Radius correctly record the load-bearing `leadUpdateSchema` edit and mark `onboardingUpdateSchema` as dead code. Verified: PATCH endpoint imports `leadUpdateSchema` only; `onboardingUpdateSchema` never imported in `src/`.
- F3 (was CONCERN) — RESOLVED: zero bare `bun test` in plan; 6 uses of `bun run test:unit:ci`.

Gate: PASS (no FAILs, no unresolved CONCERNs, all 3 prior gaps resolved, plan structurally valid)
Accepted by: session — PASS gate, no CONDITIONAL concerns to accept.

## Autonomous Goal Block

```
SESSION GOAL: Make "Event Date" (eventDate) editable and relabel "Go-live date" → "Ticket Sale Start" on the lead-detail onboarding tab (GitHub #195)
Charter + umbrella plan: N/A — single plan
Autonomy: standing EXECUTE consent for this plan; reversible edits auto-proceed; hard-stop only on irreversible/outward-facing actions not in this contract (feedback_autonomous_phase_execution.md)
Hard stop conditions / safety constraints:
- Do NOT introduce schema/migration/API-contract changes (out of scope; would break the "no new API surface" guarantee)
- Do NOT surface or bind eventDateRaw (intentionally hidden)
- Do NOT introduce Superforms — use the repo safeParse() + fetch() idiom
Next phase: EXECUTE: process/features/leads/active/195-editable-live-event-dates_06-07-26/195-editable-live-event-dates_PLAN_06-07-26.md
Validate contract: inline in plan (Gate: PASS)
Execute start: apply checklist steps 1-7 (incl. load-bearing 5b: leadUpdateSchema.eventDate .or(z.literal(''))) | fully-auto gates: `bun run check` + `bun run test:unit:ci` | agent-probe: manual won/live lead onboarding-tab render+persist check | high-risk pack: no
```
