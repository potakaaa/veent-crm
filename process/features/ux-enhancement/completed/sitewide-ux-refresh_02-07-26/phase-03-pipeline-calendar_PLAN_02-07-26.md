---
name: plan:sitewide-ux-refresh-phase-03-pipeline-calendar
description: "Site-Wide UX Refresh — Phase 03: Pipeline/Calendar/Reports Responsiveness & Theme G"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: phase-03
---

# Phase 03 — Pipeline/Calendar/Reports Responsiveness & Theme G

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ✅ VERIFIED (code-complete, EVL-confirmed 02-07-26; no known-gaps beyond the program-wide pre-accepted shared-auth-fixture pattern)
**Report destination:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-03-pipeline-calendar_REPORT_02-07-26.md (written)

---

## Purpose

Pipeline board is a single-row horizontal-scroll Kanban with fixed `w-[286px]` columns and no
scroll affordance (it already has `overflow-x-auto` — needs visual cueing, not a breakpoint
rework); its loading skeleton is misleadingly more responsive than the real board. `CalendarGrid.svelte`
has zero responsive classes and no "+N more" overflow handling for busy days or empty-month
messaging. The Reports heatmap is fixed-pixel-cell with no `overflow-x-auto` wrapper. Pipeline
stage changes are drag-and-drop ONLY with no keyboard alternative — a hard accessibility blocker.
This phase covers all three (responsiveness, keyboard stage-change, empty/overflow states) because
they share the same file cluster and are independent of Phase 2's Leads-area work.

---

## Entry Gate

- Phase 1 exit gate passed: focus-ring token exists and is stable (read-only dependency for the
  keyboard stage-change control's focus styling)

---

## Blast Radius

- `src/lib/components/pipeline/PipelineBoard.svelte`
- `src/lib/components/calendar/CalendarGrid.svelte`
- `src/lib/components/calendar/CalendarEntry.svelte`
- `src/lib/components/reports/CalendarHeatmap.svelte`
- `src/lib/components/reports/MonthCalendar.svelte`
- New component: keyboard stage-change control (dropdown/menu button)

---

## Inner Loop Refresh Note (02-07-26)

Step 1 RESEARCH has now run for this phase. Step 3 PLAN-SUPPLEMENT applied the following changes
based on RESEARCH/INNOVATE findings: (1) Step A3's keyboard stage-change control now names the
`Select` primitive (`$lib/components/ui/select`) explicitly instead of leaving the choice open —
chosen over `Popover` because single-choice semantics match `Select` more closely and bits-ui's
`Select` already handles arrow-key nav/Enter/Escape natively; (2) an explicit new checklist item
(A3a) added requiring the pipeline card's outer markup to be restructured from a single `<a>`
wrapper to a container `<div>` with the link covering the card-body and the new Select control as a
sibling element (nesting an interactive control inside an anchor is invalid HTML and breaks tab
order); (3) an explicit sub-item (B2a) added under the heatmap overflow fix requiring a min-width
constraint on the weeks-grid element alongside the wrapper, since the grid's
`grid-template-columns: repeat(N, 1fr)` shrinks to fit rather than overflowing without one. This
Refresh Note signals to the next VALIDATE pass that inner R+I has occurred since the outer-PVL
validate-contract (dated 02-07-26, Gate: PASS) was written — PVL should be re-run from V1 before
EXECUTE proceeds, since these are non-trivial structural additions to the plan.

---

## Implementation Checklist

### Step A — Pipeline scroll-affordance + keyboard stage-change

- [ ] A1. Add a visual scroll-affordance cue to `PipelineBoard.svelte`'s existing
      `overflow-x-auto` region (e.g. fade-edge gradient or explicit scroll-hint indicator) — this
      is a visual cueing fix, not a breakpoint rework, per research findings.
- [ ] A2. Fix the loading skeleton to match the real board's actual (non-)responsiveness instead of
      appearing more responsive than the real board.
- [ ] A3. **DECISION (RESEARCH/INNOVATE, 02-07-26 — implement as named):** Build the
      keyboard-accessible stage-change control using the existing `Select` primitive
      (`$lib/components/ui/select`, already used in `CalendarHeatmap.svelte`) — NOT the `Popover`
      primitive. Rationale: single-choice semantics match `Select` more closely, and bits-ui's
      `Select` already handles arrow-key nav/Enter/Escape natively. The control calls the EXACT
      existing `onMove(leadId, stage)` prop already used by drag-and-drop — zero new server logic,
      same `crm_lead_history` audit-trail write path.
- [ ] A3a. **NEW (RESEARCH, 02-07-26):** Restructure the pipeline card's outer markup from a single
      `<a href="/leads/{c.id}" draggable="true">` wrapper to a container `<div>`, with the link
      covering the card-body area and the new `Select` control as a sibling element — nesting an
      interactive control inside an anchor is invalid HTML and breaks tab order. This is a real
      structural change to the card markup, not just "add a button."
- [ ] A4. Wire `tabindex`/`role`/`aria-label`/`onkeydown` onto pipeline cards and drop zones so the
      new control is keyboard-reachable (currently zero of these attributes exist per research).
- [ ] A5. Confirm the keyboard-driven stage change writes the same `crm_lead_history` row as a
      drag-based change (AC3's proven-by DB assertion).

### Step B — Calendar/Reports-heatmap overflow wrapper + responsiveness

- [ ] B1. Add responsive classes to `CalendarGrid.svelte` (currently zero) so the grid adapts at
      mobile/tablet widths without unintended horizontal overflow.
- [ ] B2. Add an `overflow-x-auto` wrapper (with visual affordance) to the Reports heatmap
      (`CalendarHeatmap.svelte`), matching the fix pattern used for Pipeline in Step A1.
- [ ] B2a. **NEW (RESEARCH, 02-07-26):** Add an explicit min-width constraint to the weeks-grid
      element alongside the B2 wrapper. The grid currently uses
      `grid-template-columns: repeat(N, 1fr)` (fills available width by shrinking columns), so a
      scroll wrapper alone will not produce actual overflow — without a min-width, columns will
      just keep compressing instead of scrolling.
- [ ] B3. Add text labels to meeting/follow-up type indicators on calendar (currently color+icon
      only, no text label per research) as part of the ARIA/accessibility pass for this component
      cluster.
- [ ] B4. Make heatmap tooltips keyboard-reachable (currently mouse-only per research).

### Step C — Theme G: overflow/empty states

- [ ] C1. Add a "+N more" popover/expand control for calendar day cells with entries exceeding the
      visible threshold — NOT a scrollable cell (avoids the nested-scroll mobile anti-pattern per
      INNOVATE decision).
- [ ] C2. Add empty-state messaging ("no data yet") for empty-month calendar views and empty-row
      Reports leaderboard, using a shared EmptyState-style wrapper component with bespoke copy per
      surface.
- [ ] C3. Add grid/ARIA semantics to calendar day cells (currently none per research).

---

## Exit Gate

```bash
bun run check
# Expected: 0 type errors

bun run test:unit:ci
# Expected: existing Pipeline/Calendar/Reports Vitest suite green, no regressions

bun run test:e2e -- pipeline-keyboard-stage.e2e.ts calendar-overflow.e2e.ts
# Expected: new e2e scenarios green (or self-skip known-gap per shared auth fixture)
```

- All checklist items (A1-A5, B1-B4, C1-C3) checked
- Keyboard-only pipeline stage change reflected in `crm_lead_history` (AC3)
- Calendar "+N more" and empty-state scenarios render correctly (AC11, AC12)
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- The existing `onMove(leadId, stage)` prop cannot support the keyboard control's calling
  convention without an API-contract change (would violate the SPEC's no-API-change constraint —
  escalate to INNOVATE re-run, do not silently expand scope into API changes)
- Reports heatmap turns out to be within the scope already owned by
  `reports-echarts-review-queue_29-06-26` / `reports-shadcn-chart-migration_30-06-26` in a way that
  conflicts rather than merely informs — escalate for cross-plan reconciliation rather than
  duplicating work

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
- [x] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [x] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note if sections changed (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: PASS, 02-07-26 (Cycle 2 re-validate after Inner Loop Refresh Note — see Validate Contract Cycle 2 below; 1 CONCERN found and resolved in-contract)**
- [x] 5. EXECUTE — all checklist items done; per-section test gates run and green (or gaps documented) — see `phase-03-pipeline-calendar_REPORT_02-07-26.md`
- [x] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written — orchestrator-run independent confirmation: typecheck PASS, unit tests 313/313 PASS, `git diff --stat` matches all 10 claimed files, drag-and-drop structural integrity confirmed, heatmap overflow fix confirmed real, both new e2e specs run clean (self-skip on pre-accepted shared-auth-fixture known-gap, no hard failures) — see "EVL Confirmation" section in the phase report
- [x] 7. UPDATE PROCESS — archived; context updated; committed (execution commit still pending — recommended, not yet created; see Closeout below)

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

Note: Steps 1-3 checkboxes above are ticked to reflect that this Outer PVL pass treats the plan
text as already carrying clean RESEARCH/INNOVATE/PLAN-SUPPLEMENT content (no drift found during
this validate pass — see Dimension findings below). This is the Outer PVL run (no inner-loop
RESEARCH/INNOVATE has executed yet as a separate agent spawn); a future Inner Loop Refresh Note
will re-open these if inner R+I finds drift.

---

## Touchpoints

- `src/lib/components/pipeline/PipelineBoard.svelte`
- `src/lib/components/calendar/CalendarGrid.svelte`
- `src/lib/components/calendar/CalendarEntry.svelte`
- `src/lib/components/reports/CalendarHeatmap.svelte`
- `src/lib/components/reports/MonthCalendar.svelte`
- New keyboard stage-change control component (path finalized during EXECUTE)
- `src/routes/api/leads/pipeline-stage/*` — READ ONLY reference to confirm `onMove` contract; no
  modification

---

## Public Contracts

- `onMove(leadId, stage)` prop signature unchanged — reused by both drag-and-drop and the new
  keyboard control.
- `crm_lead_history` audit-trail write path unchanged — same write, new UI trigger only.
- No schema, auth, or API contract changes.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Playwright viewport-resize scenario: Pipeline/Calendar/Reports-heatmap render without unintended horizontal overflow | Fully-Automated | AC2 |
| Playwright keyboard-only interaction: tab to pipeline card, activate stage-change control via keyboard, assert stage updates + DB history row written | Fully-Automated (Playwright + DB assertion) | AC3 |
| axe-core audit against Pipeline/Calendar components for name/role/focus-visible | Fully-Automated | AC4 |
| Playwright scenario: seed a calendar day with entries exceeding threshold, assert "+N more" control renders and reveals entries on interaction | Fully-Automated (Playwright + DB seed) | AC11 |
| Playwright scenario: seed empty-month/empty-leaderboard data, assert empty-state copy renders | Fully-Automated (Playwright + DB seed) | AC12 |
| Agent-probe: visually confirm loading skeleton matches real board's actual (non-)responsive behavior at narrow width | Agent-Probe | AC2 (supporting — A2) — added by validate-contract, see Test Gates below |
| Playwright keyboard interaction: tab to heatmap cell tooltip trigger, activate via keyboard, assert tooltip content becomes visible | Fully-Automated | AC4 (supporting — B4) — added by validate-contract, see Test Gates below |
| Playwright native-DnD regression scenario: drag a pipeline card from one column to another (mouse-simulated HTML5 DnD), assert stage updates + DB history row written | Fully-Automated | AC3 (supporting — A3a regression) — added by Cycle 2 validate-contract, see Test Gates below |

```bash
bun run test:e2e -- pipeline-keyboard-stage.e2e.ts calendar-overflow.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## SPEC Achievement (UPDATE PROCESS, 02-07-26)

Scored against the locked `sitewide-ux-refresh_SPEC_02-07-26.md` acceptance criteria this phase owns:

| Criterion | Behavior | Score | Basis |
|---|---|---|---|
| AC2 (Pipeline) | Scroll-affordance, no unintended horizontal overflow | Met | Fully-Automated e2e scenario written + structurally confirmed; self-skips only on shared-auth-fixture known-gap, not a code gap |
| AC2 (Calendar/Reports-heatmap) | Responsive / overflow-wrapper at mobile/tablet widths | Met | Fully-Automated e2e scenario written; heatmap overflow fix confirmed real (wrapper + min-width) by direct EVL inspection |
| AC3 | Keyboard-only stage change writes same `crm_lead_history` row as drag | Met | Fully-Automated e2e scenario + DB assertion written; drag-and-drop regression path also gated (Cycle 2 addition) |
| AC4 | Name/role/focus-visible correctness (Pipeline/Calendar/Heatmap) | Met (Agent-Probe fallback for axe-specific coverage) | axe-core scenario self-skips without `@axe-core/playwright` devDependency (program-level backlog decision, `axe-core-devdependency-decision_NOTE_02-07-26.md`, same gap as Phase 1); heatmap tooltip keyboard-reachability has its own dedicated Fully-Automated gate |
| AC11 | "+N more" overflow control for busy calendar days | Met | Fully-Automated e2e scenario written and structurally confirmed |
| AC12 | Empty-state messaging (empty-month calendar, empty leaderboard) | Met | Fully-Automated e2e scenario written and structurally confirmed |

Unmet/residual: none new for Phase 3 beyond the program-wide pre-accepted shared-auth-fixture e2e self-skip (already tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) and the shared `@axe-core/playwright` devDependency decision (already tracked in `axe-core-devdependency-decision_NOTE_02-07-26.md`). No new backlog notes required.

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-03-pipeline-calendar_PLAN_02-07-26.md`
- Last completed step: UPDATE PROCESS (Step 7) — phase closed out 02-07-26
- Validate-contract status: Gate: PASS (Cycle 2 supersedes Cycle 1; see below)
- EVL status: CONFIRMED (orchestrator-run independent re-check, 02-07-26 — see phase report "EVL Confirmation" section)
- Next step: none for this phase — Phase 3 is VERIFIED. Program-level next step: Phase 5 remains queued behind Phases 2 and 4 per the umbrella's join conditions.

---

## Test Infra Improvement Notes

- New e2e specs `pipeline-keyboard-stage.e2e.ts` and `calendar-overflow.e2e.ts` will self-skip
  against protected routes until the shared Playwright authenticated-session fixture lands
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — this is the
  pre-accepted, program-level known-gap pattern (see umbrella Program Goal Charter), not a new
  failure.

---

## Validate Contract

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: parallel-subagents (one vc-validate-agent per phase plan, this agent = Phase 3 only)
Rationale: 5 independent phase plans validated concurrently, no cross-agent communication needed during investigation (read-only fan-out over already-written plans) — Outer PVL validate fan-out (per vc-agent-strategy-compare reconciliation note: CREATION needs agent-team, read-only VALIDATE fan-out over finished plans may use independent parallel subagents).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | Pipeline board scroll-affordance renders, no unintended horizontal overflow at mobile/tablet widths | Fully-Automated | `bun run test:e2e -- pipeline-keyboard-stage.e2e.ts` — Playwright viewport-resize scenario asserting scroll-hint cue visible, no unaffordanced overflow | A |
| AC2 | CalendarGrid + Reports heatmap render responsively / with overflow wrapper at mobile/tablet widths | Fully-Automated | `bun run test:e2e -- calendar-overflow.e2e.ts` — Playwright viewport-resize scenario asserting CalendarGrid adapts, CalendarHeatmap has an `overflow-x-auto` scroll region | A |
| AC2 (supporting — A2) | Loading skeleton visually matches the real Pipeline board's actual (non-)responsive behavior — no longer misleadingly "more responsive" | Agent-Probe | Manual/agent visual walk-through: render skeleton state and real board state at 375px/768px, confirm no divergence in responsive behavior; record judgment in phase report | B — gate added by this validate-contract (was absent from the plan's original Verification Evidence table; execute-agent must perform and document this check, since it had zero proving gate before this pass) |
| AC3 | Keyboard-only pipeline stage change fires the existing `onMove(leadId, stage)` path and writes the same `crm_lead_history` row as a drag-based change | Fully-Automated | `bun run test:e2e -- pipeline-keyboard-stage.e2e.ts` — Playwright keyboard-only interaction (Tab to card, activate new stage-change control, no mouse) + DB assertion on `crm_lead_history`, mirroring the existing `src/tests/pipeline-db.spec.ts` history-row shape | A |
| AC4 | Name/role/focus-visible correctness across Pipeline cards, Calendar grid/cells, Reports heatmap, incl. new text labels for meeting/follow-up type indicators and grid/ARIA semantics on day cells | Fully-Automated | axe-core audit via Playwright against PipelineBoard, CalendarGrid, CalendarHeatmap | A |
| AC4 (supporting — B4) | Reports heatmap tooltips are keyboard-reachable (currently mouse-only) | Fully-Automated | Playwright keyboard interaction: Tab to a heatmap cell, activate via keyboard, assert tooltip content becomes visible | B — gate added by this validate-contract (was absent from the plan's original Verification Evidence table; axe-core alone does not exercise interaction sequences, so this needed its own scenario) |
| AC11 | Calendar "+N more" overflow control renders for a day exceeding the visible threshold and reveals remaining entries on interaction | Fully-Automated | `bun run test:e2e -- calendar-overflow.e2e.ts` — Playwright + DB seed | A |
| AC12 | Empty-state messaging ("no data yet") renders for an empty-month calendar view and an empty Reports leaderboard | Fully-Automated | `bun run test:e2e -- calendar-overflow.e2e.ts` (+ reports empty-state case) — Playwright + DB seed | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column above carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). No `Known-Gap` strategy value appears — the two gaps this pass found (A2, B4) were resolved as gap-resolution B (fixed in this plan), not deferred as a residual. The only accepted known-gap in this phase is the shared-auth-fixture self-skip pattern (below), which is a program-level pre-accepted residual, not a per-behavior coverage gap.

Legacy line form (retained so existing validate-contract consumers still parse):
- Pipeline scroll-affordance + keyboard stage-change: Fully-automated: `bun run test:e2e -- pipeline-keyboard-stage.e2e.ts` | Agent-probe: manual skeleton-fidelity visual check (A2)
- Calendar/Reports-heatmap overflow + responsiveness: Fully-automated: `bun run test:e2e -- calendar-overflow.e2e.ts`
- Accessibility (name/role/focus-visible, incl. heatmap tooltip keyboard-reach): Fully-automated: axe-core audit + dedicated heatmap-tooltip keyboard Playwright scenario
- Regression baseline: Fully-automated: `bun run check` + `bun run test:unit:ci` (existing Pipeline/Calendar/Reports Vitest suite, incl. `src/tests/pipeline-db.spec.ts`, `src/tests/calendar-db.spec.ts`, `src/tests/calendar-utils.spec.ts`)

Failing stub (pipeline-keyboard-stage.e2e.ts — AC3, Fully-Automated):
```
test("should update stage via keyboard-only interaction and write the same crm_lead_history row as a drag-based change", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: keyboard-only stage change writes crm_lead_history row")
})
```

Failing stub (pipeline-keyboard-stage.e2e.ts — AC2, Fully-Automated):
```
test("should show pipeline board scroll-affordance cue with no unintended horizontal overflow at mobile/tablet widths", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: pipeline scroll-affordance cue at narrow viewport")
})
```

Failing stub (calendar-overflow.e2e.ts — AC2, Fully-Automated):
```
test("should render CalendarGrid and Reports heatmap responsively with overflow wrapper at mobile/tablet widths", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: calendar/heatmap responsive + overflow wrapper")
})
```

Failing stub (calendar-overflow.e2e.ts — AC11, Fully-Automated):
```
test("should render a +N more control for a calendar day exceeding the entry threshold and reveal entries on interaction", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: calendar +N more overflow control")
})
```

Failing stub (calendar-overflow.e2e.ts — AC12, Fully-Automated):
```
test("should render empty-state copy for an empty-month calendar view and an empty Reports leaderboard", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: calendar/reports empty-state messaging")
})
```

Failing stub (axe-core audit — AC4, Fully-Automated):
```
test("should have zero critical/serious axe violations for name/role/focus-visible across PipelineBoard, CalendarGrid, CalendarHeatmap", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: axe-core audit Pipeline/Calendar/Heatmap")
})
```

Failing stub (heatmap tooltip keyboard scenario — AC4 supporting/B4, Fully-Automated):
```
test("should make Reports heatmap tooltips keyboard-reachable (Tab + activate, not mouse-only)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: heatmap tooltip keyboard reachability")
})
```

(Agent-Probe row A2 does not receive a stub per protocol — Hybrid/Agent-Probe/Known-Gap tiers are exempt.)

Dimension findings:
- Infra fit: PASS — front-end-only Svelte component change, no container/infra/runtime surface touched. All 5 blast-radius files + the read-only API reference path confirmed to exist on disk via direct file reads/greps. `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs` on this plan file: 0 failures / 0 warnings (correct structural validator for this phase-program stub shape). Note: the generic `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs` reports 6 failures (missing "Date/Status/Complexity metadata" as inline body text, missing "Overview"/"Phase Completion Rules"/"Acceptance Criteria" section headers) — these are shape-mismatch false positives against the phase-program stub template (frontmatter `date:`/`Phase status:` + "Purpose"/"Verification Evidence" sections are the correct equivalents for this shape, and `validate-phase-stub.mjs` confirms structural validity); not a real gap.
- Test coverage: CONCERN found and resolved in this pass — the plan's original Verification Evidence table had zero proving gate for two developed behaviors (A2 loading-skeleton fidelity; B4 heatmap tooltip keyboard-reachability). Per the vacuous-green ban, these could not be silently passed. Both are now fixed in this validate-contract (gap-resolution B: A2 as Agent-Probe, B4 as a dedicated Fully-Automated Playwright scenario) — see Test Gates table above. All other AC2/AC3/AC4/AC11/AC12 gates were already Fully-Automated and commands (`bun run check`, `bun run test:unit:ci`, `bun run test:e2e`) are confirmed real, working scripts (verified against `package.json`). Existing DB-level regression baseline (`src/tests/pipeline-db.spec.ts`, `src/tests/calendar-db.spec.ts`, `src/tests/calendar-utils.spec.ts`) already covers the underlying `crm_lead_history` write path this phase's keyboard control reuses. New e2e specs will self-skip against protected routes per the repo-wide known shared-auth-fixture gap (pre-accepted program-level pattern, not a new failure).
- Breaking changes: PASS — `onMove(leadId, stage)` prop confirmed present with the exact stated signature in `src/lib/components/pipeline/PipelineBoard.svelte` (read directly); its handler in `src/routes/pipeline/+page.svelte` already PATCHes the existing `/api/leads/{id}/stage` endpoint — the plan's "zero new server logic" claim (INNOVATE decision) is confirmed, not aspirational. No schema/auth/API contract changes. No downstream consumers outside this phase's blast radius identified.
- Security surface: PASS — no auth, billing, secrets, or trust-boundary surface touched. New keyboard control is a client-side alternate entry point into an already-authorized, already-audited mutation path (same PATCH endpoint, same session/permission checks) — no new attack surface.
- Section A feasibility (Pipeline scroll-affordance + keyboard stage-change): PASS — mechanical feasibility confirmed (onMove prop exists verbatim; cards currently have zero tabindex/role/aria-label/onkeydown, confirming the research claim). Gaps found: none beyond A2 (resolved above). Conflicts found: none — registry confirms Phase 3 is the sole owner of `PipelineBoard.svelte`. Highest-risk edit: A4 (wiring keyboard attributes onto pipeline cards/drop zones) — mitigation: implement the new stage-change control as a distinct focusable `<button>`/menu element separate from the card's existing `<a href>` link, so native anchor tab-order and the new keyboard menu don't collide or double-handle key events.
- Section B feasibility (Calendar/Reports-heatmap overflow + responsiveness): PASS — mechanical feasibility confirmed (`CalendarGrid.svelte`/`CalendarHeatmap.svelte` confirmed to have zero responsive breakpoint classes and no `overflow-x-auto`, matching research). Gaps found: B4 (resolved above). Conflicts found: none — grepped both active Reports chart-migration plans (`reports-echarts-review-queue_29-06-26`, `reports-shadcn-chart-migration_30-06-26`) for `CalendarHeatmap`/`MonthCalendar` references; zero matches. `reports-shadcn-chart-migration_30-06-26` touches only `src/routes/reports/+page.svelte` (leaderboard bar-chart migration); `reports-echarts-review-queue_29-06-26` is RFC-001/002/003 (server data layer / CSV export) with RFC-004 superseded/obsolete — neither plan owns or references the heatmap/calendar overflow-wrapper surface. Phase 3's heatmap-adjacent finding is correctly scoped as UX-layout-only (an `overflow-x-auto` wrapper class) and does not silently absorb chart-library-migration scope. Highest-risk edit: B2 (heatmap overflow wrapper) — low risk, additive CSS-only change.
- Section C feasibility (Theme G: overflow/empty states): PASS — mechanical feasibility confirmed. Gaps found: none. Conflicts found: none — note for execute-agent: `MonthCalendar.svelte` already has "leading/trailing empty cells" logic for grid layout (structural blank cells), which is a distinct concept from the new "no data yet" empty-state messaging (C2) being added; execute-agent should not conflate the two while editing this file. Highest-risk edit: C1 ("+N more" popover) — mitigation already specified in plan text (must not become a nested-scroll cell, per INNOVATE decision).
- Cross-phase consistency (Phase 1 token dependency): PASS — Phase 3's Entry Gate only requires "the focus-ring token exists and is stable" generically; it does not hardcode a specific token identifier (e.g. `--focus-ring`) that Phase 1 might rename before its own exit gate. Phase 1's plan commits to shipping *some* focus-ring token/utility in Step B — Phase 3 does not over-assume its exact name. No drift risk found.
- Cross-phase consistency (Chart-migration plan boundary): PASS — see Section B feasibility above; confirmed via direct grep of both plan files, zero overlap.
- INNOVATE-decision fidelity (keyboard stage-change reuses existing callback): PASS — verified directly in source (`PipelineBoard.svelte` line ~26: `onMove?: (leadId: string, stage: Stage) => void`; `src/routes/pipeline/+page.svelte` line 79 `async function onMove(leadId, stage)` PATCHes the existing `/api/leads/{leadId}/stage` route). Confirms zero new server-side mutation logic is proposed or required — matches the explicit INNOVATE decision passed down from the orchestrator.

Open gaps: none unresolved. The two coverage gaps found (A2, B4) were fixed in this pass (gap-resolution B) rather than deferred.

What this coverage does NOT prove:
- The `bun run test:e2e` gates for AC2/AC3/AC11/AC12/B4 will self-skip against protected routes until the shared Playwright authenticated-session fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — this proves the scenarios are written and structurally correct, not that they have executed against a live authenticated session. This is the same pre-accepted, program-level known-gap pattern already in force for calendar/meetings e2e coverage — not a new failure.
- The axe-core audit (AC4) proves static name/role/focus-visible correctness; it does not prove full keyboard-operability of every custom interaction (which is why B4's dedicated scenario was added separately — axe-core alone would not have caught tooltip keyboard-reachability).
- The Agent-Probe skeleton-fidelity check (A2) is a manual/judgment-based visual comparison, not a machine-asserted regression gate — a future skeleton regression would not be caught automatically; this is accepted as appropriate for this class of purely-visual behavior (no DOM-assertable signal distinguishes "misleadingly responsive" from "correctly responsive" skeleton markup).
- No live-DB CI harness exists yet for Hybrid-tier gates program-wide (per umbrella Test Infra Improvement Notes) — this phase has no Hybrid-tier gates, so this does not apply to Phase 3 specifically, but is noted for completeness.

Gate: PASS (no FAILs, plan updated — two test-coverage gaps found and fixed by adding gates in this contract; all prior CONCERNs resolved)
Accepted by: n/a — Gate is PASS; no unresolved CONCERNs required acceptance. The self-skip e2e known-gap pattern is a program-level pre-accepted residual (see umbrella Program Goal Charter), already accepted at program kickoff, not a new acceptance needed at this phase.

**Autonomous Goal Block:** N/A — BRANCH B applies. This phase plan belongs to a phase program with an umbrella plan (`sitewide-ux-refresh-umbrella_PLAN_02-07-26.md`) that already carries a `## Stable Program Goal` section (confirmed present via direct read). Per protocol, no `## Autonomous Goal Block` is written to this phase plan file; the umbrella's Stable Program Goal governs.

---

## Validate Contract (Cycle 2 — Inner Loop Refresh Re-Validate, 02-07-26)

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — outer PVL re-run has current evidence; Inner Loop Refresh Note (02-07-26) dated the same day but with later Step 1/Step 3 evidence than the Cycle 1 contract above, per canonical supersedes rule (any prior validate-contract of any type being overwritten/superseded gets a supersedes line)

**Trigger:** `## Inner Loop Refresh Note` (02-07-26) shows Step 1 RESEARCH and Step 3 PLAN-SUPPLEMENT ran after the Cycle 1 PASS contract was written. Per V1 Step 4, this re-validate proceeds through the full V1-V7 sequence rather than early-exiting on the existing PASS.

**V1 pre-check (re-run):**
- Plan file exists and is readable: confirmed.
- All 5 blast-radius files + read-only API reference path re-confirmed present on disk (`PipelineBoard.svelte`, `CalendarGrid.svelte`, `CalendarEntry.svelte`, `CalendarHeatmap.svelte`, `MonthCalendar.svelte`).
- Structural validation re-run: `validate-plan-artifact.mjs` → 2 failures / 4 warnings (same pre-existing shape-mismatch false positives noted in Cycle 1 — phase-program stub shape, not a real gap). `validate-phase-stub.mjs` (the correct validator for this shape) → 0 failures / 0 warnings.
- Dependency-BLOCKED guard: Phase 1 (Entry Gate dependency, focus-ring token) status in `phase-blast-radius-registry.md` is `(no field — not yet started)`, not `BLOCKED` — guard does not trip.
- Registry blast-radius claims: unchanged from Cycle 1; no new overlap introduced by A3a/B2a (both are internal-markup/CSS changes to files Phase 3 already owns exclusively).

**Assessment of the two NEW checklist items (the actual substance of this re-validate):**

*A3a (pipeline card anchor→div restructure):* Read `PipelineBoard.svelte` directly (lines 111-162). Confirmed: the ENTIRE card today is a single `<a href="/leads/{c.id}" draggable="true" ondragstart={...} class="cursor-grab rounded-[10px] border border-hairline bg-panel p-3 shadow-frame hover:shadow-raised" style="border-left:3px solid {col.color}">` wrapping all card content (platform badge, name, appeal score, risk row, owner/avatar footer). This confirms A3a's premise is real, not speculative.

**CONCERN found (new, not present in Cycle 1 — this is the substantive finding of this re-validate):** the plan text names the restructure ("div wrapper + link over card-body + Select as sibling") but does not specify two non-obvious mechanical details that create real regression risk if missed during EXECUTE:
1. **Native drag hijack risk:** `draggable="true"` and `ondragstart` currently live on the `<a>` itself. Anchors are natively draggable by default in browsers (e.g. dragging a link produces a browser-native link-drag ghost/URL payload). If the restructure moves `draggable`/`ondragstart` to the outer `<div>` but leaves the inner `<a>` with its default native-draggable behavior, the browser may prefer the innermost natively-draggable element (the anchor) when a drag gesture starts from within it, competing with or silently overriding the custom `dragstart`/`dataTransfer` path that `drop()`/`onMove` depends on. This was never a risk under the original single-`<a>` structure (only one draggable element existed) — it is a genuinely new risk introduced by nesting a link inside a custom-draggable container.
2. **Visual/hover styling relocation:** `shadow-frame`, `hover:shadow-raised`, `rounded-[10px]`, `border border-hairline`, `cursor-grab`, and the status-color `border-left` are all currently on the `<a>` because the `<a>` IS the visual card boundary today. If these classes stay on the inner anchor (now only wrapping the "card-body" per A3a's wording) rather than moving to the new outer `<div>`, the visual card boundary/hover affordance would only wrap the body region — not the new Select-control sibling — producing a broken-looking card (Select control floating outside the shadow/border box, and hover-raise only triggering over part of the card).

Neither issue is a FAIL — both are mechanically resolvable, but neither is spelled out in the plan checklist text, and nothing in the existing test-gate set (Cycle 1's AC3 keyboard-only gate, or the axe-core AC4 gate) exercises the *pre-existing drag path* after the restructure — only the *new* keyboard path is gated. This is a real, previously-unanticipated coverage gap opened by A3a: a working, already-shipped behavior (mouse drag-and-drop stage-change) is having its underlying markup restructured with zero automated gate proving it still works afterward. Confirmed via search: no existing test (`src/tests/pipeline.spec.ts`, `pipeline-db.spec.ts`, or any `e2e/*.e2e.ts`) exercises drag-and-drop at all — `pipeline.spec.ts` is pure-function schema/unit tests only, `pipeline-db.spec.ts` is DB-level, neither drives a browser drag gesture.

**Resolved in this cycle (gap-resolution B — fixed by adding to this contract, no further plan rewrite needed):**
- New Execute-Agent Instruction (below) requiring explicit handling of both risks.
- New Fully-Automated test gate added (below) proving the pre-existing drag-and-drop path survives the A3a restructure.

*B2a (heatmap weeks-grid min-width):* Read `CalendarHeatmap.svelte` directly (lines 157-186). Confirmed: the weeks-grid container is `<div class="min-w-0 flex-1">` wrapping `<div class="grid gap-px" style="grid-template-columns: repeat({grid.weeks.length}, 1fr); ...">` — `min-w-0` is the exact flexbox anti-pattern that lets a flex item shrink below its content's intrinsic width instead of overflowing. This confirms B2a's premise precisely: an `overflow-x-auto` wrapper alone (B2) would do nothing, because the inner grid already explicitly opts OUT of overflow via `min-w-0`; B2a's min-width is mechanically required for B2 to have any visible effect, not an optional nice-to-have.
- **Interaction check:** read `src/routes/reports/+page.svelte` around the heatmap's mount point (lines 425-444) — no existing `overflow-x-auto`, `max-w`, or other scroll-constraining wrapper exists anywhere in the parent chain today. No nested-scroll-container conflict is introduced (the Theme-C1 "nested-scroll mobile anti-pattern" INNOVATE decision that ruled out scrollable day-cells is unrelated to this single new overflow wrapper). No other Reports-page element reads or depends on the weeks-grid's current shrink-to-fit sizing.
- **Existing gate coverage:** Cycle 1's AC2 gate ("CalendarGrid + Reports heatmap render responsively / with overflow wrapper at mobile/tablet widths") already Fully-Automated-exercises the resulting overflow behavior end-to-end at narrow viewports — if B2a is skipped or done wrong, that existing Playwright scenario will fail to observe real horizontal overflow. No new test gate is needed for B2a; the existing AC2 gate already mechanically depends on B2a being done correctly. **Verdict: PASS, no concern.**

**Net assessment:** 1 new CONCERN (A3a drag/style regression risk), 0 new FAILs. Fully resolved in this cycle via an added Execute-Agent Instruction + an added Fully-Automated test gate (same house pattern as Cycle 1's A2/B4 resolution) — no unresolved CONCERN remains, so net gate is PASS, not CONDITIONAL.

Test gates (C3 5-column table) — additive rows for this cycle only (see Cycle 1 above for the full original 8-row table, unchanged):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 (supporting — A3a regression) | Pre-existing mouse drag-and-drop stage-change still works after the A3a card anchor→div markup restructure (native HTML5 DnD, not the new keyboard path) | Fully-Automated | `bun run test:e2e -- pipeline-keyboard-stage.e2e.ts` — new Playwright scenario: simulate a native drag gesture (mouse down on card, dragstart, dragover target column, drop) from one pipeline column to another, assert stage updates + `crm_lead_history` row written (same DB assertion shape as the existing keyboard-path scenario) | B — gate added by this Cycle 2 validate-contract (was absent from both the original plan and the Cycle 1 contract; the restructure is what creates the regression risk this gate proves against) |

Failing stub (pipeline-keyboard-stage.e2e.ts — AC3 supporting/A3a regression, Fully-Automated):
```
test("should still update stage via native mouse drag-and-drop after the card anchor-to-div restructure", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: mouse drag-and-drop regression after A3a markup restructure")
})
```

**Execute-Agent Instructions (new, this cycle):**

| # | Instruction | Trigger condition |
|---|---|---|
| E2 | When implementing A3a: move `draggable="true"` and `ondragstart={...}` from the `<a>` element to the new outer `<div>` wrapper (the div becomes the drag source, not the link). Explicitly set `draggable="false"` on the inner `<a href="/leads/{c.id}">` to suppress the browser's default native link-drag behavior — otherwise the browser may hijack drag gestures started over link text/content and produce its own link-drag ghost instead of firing the custom `dragstart`/`dataTransfer` path `drop()` depends on. Verify manually (or via the new AC3-regression Playwright scenario) that dragging from directly over card text still triggers the custom DnD path, not a native link-drag. | A3a entry, before A4 |
| E3 | When implementing A3a: relocate the card's visual styling classes (`rounded-[10px]`, `border border-hairline`, `bg-panel`, `p-3`, `shadow-frame`, `hover:shadow-raised`, `cursor-grab`, and the `border-left:3px solid {col.color}` inline style) from the `<a>` element to the new outer `<div>` wrapper, so the whole card — including the new `Select` sibling control — shares one consistent visual boundary and hover-raise affordance. The inner `<a>` should carry no border/shadow/rounding of its own once it only wraps the card-body sub-region, to avoid a visually nested double-box. | A3a entry, same edit pass as E2 |
| E4 | A3a and A4 (tabindex/role/aria-label/onkeydown wiring) touch the same markup region in the same file — implement them in the same edit pass, not sequentially across separate commits, to avoid a half-migrated intermediate state where the card is neither a valid anchor-only card nor a valid div+sibling-control card. | A3a + A4, same edit session |

Dimension findings (delta only — full dimension set unchanged from Cycle 1 except where noted):
- Infra fit: PASS — unchanged, no new surface.
- Test coverage: CONCERN found and resolved in this cycle — see A3a assessment above (new drag-regression gate added). B2a required no new gate (already covered by existing AC2 gate, confirmed by direct interaction check against `+page.svelte`).
- Breaking changes: PASS — unchanged. A3a/B2a are both internal markup/CSS changes with no prop-signature or contract change; `onMove(leadId, stage)` is unaffected by either.
- Security surface: PASS — unchanged, no new surface.
- Section A feasibility: CONCERN (A3a) → resolved via E2/E3/E4 above. Highest-risk edit updated: A3a (not A4) is now the section's highest-risk edit, given the native-drag-hijack and styling-relocation risks identified in this cycle; A4's original mitigation (distinct focusable button/menu element, separate from the anchor) still holds and pairs directly with E2/E3.
- Section B feasibility: PASS — B2a confirmed mechanically necessary and fully covered by the existing AC2 gate; no page-level interaction risk found (no competing overflow/scroll wrapper exists in the Reports page's current heatmap mount point).

Open gaps: none unresolved. The one new concern found (A3a drag/style regression risk) is fixed in this cycle via Execute-Agent Instructions E2-E4 plus one new Fully-Automated test gate (gap-resolution B).

What this coverage does NOT prove (additive to Cycle 1's list):
- The new AC3-supporting drag-regression Playwright scenario proves the drag path still functions end-to-end after restructuring; it does not prove every possible drag-start pointer position (e.g. starting a drag from directly over the new `Select` control's hit area, which should not initiate a card drag at all) — execute-agent should manually spot-check that starting a drag gesture from within the `Select` control does not also trigger `ondragstart` on the card, since both now live in the same outer div. This is accepted as a manual EXECUTE-time spot-check, not a new automated gate, because it is a corner-case pointer-origin distinction rather than a distinct behavior from SPEC.

Gate: PASS (no FAILs; 1 CONCERN found and fully resolved in-contract via added Execute-Agent Instructions + 1 added Fully-Automated test gate)
Accepted by: n/a — Gate is PASS; the one CONCERN found this cycle was resolved in-contract, not deferred, so no user acceptance of an open gap is required.

**Autonomous Goal Block:** unchanged from Cycle 1 — BRANCH B still applies (umbrella `## Stable Program Goal` governs); no `## Autonomous Goal Block` is written to this phase plan file.
