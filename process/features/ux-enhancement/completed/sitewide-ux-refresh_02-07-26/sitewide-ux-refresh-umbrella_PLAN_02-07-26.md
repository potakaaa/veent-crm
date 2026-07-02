---
name: plan:sitewide-ux-refresh-umbrella
description: "Site-Wide UX Refresh — umbrella/orchestration plan for the 5-phase program"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: umbrella
---

# Site-Wide UX Refresh — Umbrella Plan

**Date:** 02-07-26
**Complexity:** COMPLEX
**Status:** ⏳ PLANNED

- Program type: PHASE PROGRAM (5 phases; Phases 2-4 parallel-safe once Phase 1 lands, Phase 5 runs last)
- Date: 02-07-26
- Feature folder: `process/features/ux-enhancement/`
- Locked SPEC: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh_SPEC_02-07-26.md`

**Process note (strategy substitution, auditable):** INNOVATE recommended an agent-team (named
teammates + SendMessage) for writing the umbrella + 5 phase plans, since Phase 1 introduces
design-token names that Phases 2-5 reference and Phase 5 depends on Phases 1-4's final shape.
`TeamCreate` is not available in this environment; the orchestrator substituted a single
vc-plan-agent session (this one) authoring all 6 files in one pass instead, since a single agent
holding the full picture avoids the cross-agent consistency risk a team would otherwise manage.
No loss of rigor: the same dependency/consistency checks a team would enforce are applied here
directly (shared token names cross-checked across all 5 phase stubs before writing).

---

## Program Goal Charter

```
Site-Wide UX Refresh — Program Goal Charter

North star:
- Veent CRM is usable, navigable, and keyboard/screen-reader accessible at every common viewport
  width, and its visual language is consistent across every major page — without a new component
  library and without touching schema/auth/API surfaces.

Definition of done (an unattended agent must be able to do all of these):
1. Load any authenticated route at a 375px viewport and reach every nav destination + sign-out via
   a mobile nav surface (not the vanishing sidebar).
2. Change a pipeline lead's stage using keyboard alone, with the same crm_lead_history audit write
   as a drag-based change.
3. Run an axe-core accessibility audit against every major route with zero critical/serious
   violations for name/role/focus-visible rules.
4. Submit Lead creation / Meeting modal / Team invite forms with one invalid field and see the
   error rendered against that specific field (aria-invalid/aria-describedby), not a flat string.
5. Grep the Nav/Topbar/Shell/Auth/Reports source for hardcoded hex/arbitrary-bracket values and
   find none outside intentional exceptions — all colors/spacing/radius resolve to tokens.css.

What "verified" means (program level):
- Every SPEC acceptance criterion (AC1-AC13) has a proven-by gate recorded in a phase
  validate-contract, tagged Fully-Automated / Hybrid / Agent-Probe (never Known-Gap as a terminal
  state for developed behavior).
- validate-contract gates must be recorded alongside phase gates and regression evidence for a
  phase to reach VERIFIED. A phase without a validate-contract (or documented skip reason) cannot
  be marked VERIFIED.
- New e2e scenarios that hit the shared-auth-fixture blocker (process/features/auth/backlog/
  e2e-auth-bootstrap_NOTE_01-07-26.md) are recorded as the SAME pre-accepted known-gap pattern
  used by calendar/meetings — not treated as new failures, and not silently dropped either (they
  still need a self-skip guard + backlog note, per the vacuous-green ban).

Scope tiers → phase mapping:
- Tier 1 (Nav & shell foundation — mobile drawer, nav-surface tokens, focus-ring token) → Phase 1
- Tier 2 (Leads/UFG grid consolidation + responsiveness) → Phase 2
- Tier 3 (Pipeline/Calendar/Reports responsiveness + keyboard stage-change + empty/overflow states)
  → Phase 3
- Tier 4 (Forms: Superforms conversion + shared field-error component) → Phase 4
- Tier 5 (Remaining token sweep + loading-state alignment + remaining ARIA sweep) → Phase 5
- This program retires Themes A-G from the SPEC (Theme H explicitly deferred, out of scope below).

Explicitly out of scope (deferred tier):
- Theme H (StubNote.svelte dead code, context-doc staleness) — separate tiny follow-up, not this
  program.
- Any new component library or CSS framework — stays within Tailwind 4 + shadcn-svelte + tokens.css.
- Any schema, auth, or public API contract change.
- Reports chart-library migration scope owned by reports-echarts-review-queue_29-06-26 and
  reports-shadcn-chart-migration_30-06-26 — this program's chart-adjacent findings (leaderboard
  duplication, hardcoded colors) are input to those plans, not absorbed here.
- Leads-area work already tracked in lead-visibility-scoping, leads-new-organizer-hover,
  ufg-country-category-filters, ufg-inline-edit-review-removal, and the
  popover-a11y-audit_NOTE_01-07-26.md backlog note.
- Re-scoping loading-ux_30-06-26's existing Reminders-snooze exclusion — Phase 5 makes an explicit
  SPEC AC13 decision that supersedes it, but does not silently diverge; both plans must reference
  each other.
- Solving the calendar/meetings shared-auth-fixture e2e gap — new scenarios record the same
  known-gap pattern, this program does not build the fixture.

Hard safety constraints (non-negotiable, per phase):
- No schema, auth, or API contract changes anywhere in this program.
- No new dependency, component library, or CSS framework.
- Must not regress any currently-passing Vitest/Playwright coverage for Leads, Pipeline, Calendar,
  Reminders, or Reports (run `bun run test:unit:ci` and `bun run test:e2e` — or the relevant subset
  — at every phase EVL).
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context
  commits separate from execution commits.
```

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: ux-enhancement — Site-Wide UX Refresh
Ref: process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md

TARGET: Complete ALL 5 phases until:
- SPEC AC1-AC13 each have a proven-by gate recorded in a phase validate-contract
- No hardcoded hex/arbitrary-bracket values remain in Nav/Topbar/Shell/Auth/Reports (grep check green)
- axe-core critical/serious violations = 0 across all major routes
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State → loop step + validate-contract status
2. Phase plan ## Phase Loop Progress → first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R -> I -> P -> PVL -> E -> EVL -> UP, never skip, never
reorder; SKIPS SPEC — SPEC runs once in the outer program loop, already locked):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a — clean")
- PVL NEVER skipped; contract must follow example-validate-output.md full format; partial contract
  (missing Plan updates applied / Execute-agent instructions / Test gates) = blocked same as
  placeholder
- Every subagent FIRST ACTION: run vc-context-discovery (load context group files + all-tests.md
  routing chain) AND vc-plan-discovery (same-feature full depth + other-features active-only +
  general-plans active)
- Every phase-END: invoke vc-agent-strategy-compare for next step strategy recommendation

Phases 2, 3, 4 are parallel-safe once Phase 1 lands (disjoint file sets — see
phase-blast-radius-registry.md). Phase 5 MUST run after Phases 1-4 are in final shape.

Report via phase reports. No approval between phases unless hard stop hit.

HARD STOPS (pause, wait for user):
- Irreversible/outward-facing action without explicit validate-contract instruction
- Net gate = BLOCKED with no backlog resolution path
- Plan file marks "pause required" or agent count > 100
- Validate-contract is placeholder and vc-validate-agent cannot run
- Any change that would touch schema/auth/API/billing surfaces (out of scope — halt and ask)

SAFETY (never override):
- No new component library or CSS framework
- Must not regress currently-passing Vitest/Playwright coverage for Leads/Pipeline/Calendar/
  Reminders/Reports
- Commit each phase before advancing; process and execution commits separate

TEST GATES (every phase exit):
  bun run check
  bun run test:unit:ci
  bun run test:e2e -- [phase-scoped spec file(s)]
  node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
  node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <phase-plan-path>

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan before EXECUTE.

START: Phase 1, loop step RESEARCH (pending). Spawn vc-research-agent for Phase 1 — Nav & Shell Foundation.
```

---

## Phase Sequence

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 0 (pre-program) | this file | Confirm folder structure, this umbrella + 5 phase stubs + registry created | — |
| 1 — Nav & Shell Foundation | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_PLAN_02-07-26.md` | Mobile drawer nav, nav-surface tokens, centralized focus-ring token/utility | Phase 0 |
| 2 — Leads/UFG Grid Consolidation & Responsiveness | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-02-leads-grid_PLAN_02-07-26.md` | Consolidate LeadGrid+UFG grid, date picker, hover-card/dedup-popover; then card-switch responsive behavior | Phase 1 (tokens only — not blocking) |
| 3 — Pipeline/Calendar/Reports Responsiveness & Theme G | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-03-pipeline-calendar_PLAN_02-07-26.md` | Pipeline scroll-affordance + keyboard stage-change, Calendar/Heatmap overflow wrapper, "+N more", empty states | Phase 1 (tokens only — not blocking) |
| 4 — Forms | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-04-forms_PLAN_02-07-26.md` | Lead creation Superforms conversion (+ dedup-preview reactivity re-verification), shared field-error component across 3 forms | Phase 1 (tokens only — not blocking) |
| 5 — Token Sweep Completion, Theme F, Remaining A11y | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_PLAN_02-07-26.md` | Auth/Reports token swap, Reminders/Today snooze alignment (AC13), remaining per-component ARIA sweep | Phases 1+2+3+4 (final shape) |

### Join Conditions

- Phases 2, 3, and 4 MUST NOT start until Phase 1's exit gate passes (they only need Phase 1's
  token names to exist and be stable — they do not need Phase 1 fully merged/committed to begin
  their own research/innovate work, but MUST NOT execute token-consuming checklist items until
  Phase 1 EXECUTE is green).
- Phases 2, 3, and 4 MAY run in parallel with each other — their blast radii are disjoint (see
  `phase-blast-radius-registry.md`).
- Phase 5 MUST NOT start until Phases 1, 2, 3, AND 4 all reach their exit gates — token-sweeping
  or ARIA-sweeping a component that Phase 2/3/4 is about to rewrite would be wasted work.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry | Exit gate |
|---|---|---|
| 0 | Program start | Umbrella + 5 phase plans + registry created; structural validators pass |
| 1 | Phase 0 complete | Mobile drawer reachable at 375px (AC1); nav-surface + focus-ring tokens exist and are consumed by AppShell/AppSidebar/AppTopbar; no regression in existing nav-adjacent tests |
| 2 | Phase 1 exit met | Single shared grid component replaces LeadGrid+UFG grid with no behavior loss (AC10); responsive card-switch below breakpoint (AC2, Leads/UFG); date picker + hover-popover consolidated to one implementation each |
| 3 | Phase 1 exit met | Pipeline/Calendar/Reports-heatmap responsive or scroll-affordanced (AC2); keyboard stage-change control functional with audit-trail parity (AC3); calendar "+N more" + empty states render (AC11, AC12) |
| 4 | Phase 1 exit met | Lead creation uses superForm()/use:enhance (AC7); dedup-preview reactivity re-verified explicitly; shared field-error component wired into Lead creation + Meeting modal + Team invite (AC6) |
| 5 | Phases 1+2+3+4 exits met | Auth+Reports token swap complete (AC8); tab/chip unification complete (AC9); Reminders snooze aligned to Today's pattern per AC13; remaining ARIA sweep complete (AC4, AC5) |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`. This inner
loop SKIPS SPEC — SPEC runs once in the outer program loop (already locked in
`sitewide-ux-refresh_SPEC_02-07-26.md`), not per phase. The 7 steps map to:

1. **RESEARCH** — spawn research-agent: load context, read prior phase reports, check plan drift, document findings
2. **INNOVATE** — spawn innovate-agent: decide approach; write Decision Summary (chosen approach + rejected alternatives) — largely pre-decided by the program-level Decision Summary, but per-phase INNOVATE still runs to catch phase-specific drift
3. **PLAN-SUPPLEMENT** — spawn plan-agent: if research/innovate found gaps/pre-conditions not in checklist, add them; otherwise mark "n/a — research clean"
4. **PVL** — spawn vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` format (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by)
5. **EXECUTE** — spawn vc-execute-agent per approved plan and validate-contract
6. **EVL** — spawn vc-tester: run phase test gates to green; register follow-up stubs; write EVL HANDOFF SUMMARY
7. **UPDATE-PROCESS** — write phase report to durable report path, rewrite umbrella `## Current Execution State` section (overwrite, not append — git history is the audit log)

**PVL is NEVER skipped.** A placeholder `## Validate Contract` = blocked. Do not spawn execute-agent
while the Validate Contract section reads "(placeholder — vc-validate-agent writes this section
before EXECUTE)".

---

## Autonomous Execution Rules (During /goal)

During /goal execution of a phase program:
- Agent self-decides at all V5 gates — no user approval needed between phases
- CONDITIONAL net gate: proceed autonomously, fixes applied in-flight, gaps on record
- BLOCKED net gate: document items in backlog, continue with remaining phase plans; backlog is
  always a valid resolution — always find a path forward
- Hard stops (must pause for user approval):
  - Irreversible/outward-facing action without explicit contract instruction (push to remote,
    deploy to production, schema migration on live DB)
  - Plan file explicitly marks "pause required" at a step
  - Any drift toward schema/auth/API/billing surfaces (out of scope per SPEC constraint)
- Agent writes phase reports, updates phase plans, creates new sub-plans as needed — all autonomously
- The phase report is the communication channel for conflicts, errors, and learnings — not inline questions

---

## Pre-PVL Conflict Resolution

Shared-package classification for Phases 2, 3, 4 (the parallel-safe set):

| Shared surface | Classification | Notes |
|---|---|---|
| `src/lib/styles/tokens.css` (nav-surface + focus-ring tokens) | parallel-safe | Written once in Phase 1; Phases 2-4 only READ these token names, never redefine them |
| `src/lib/components/leads/LeadGrid.svelte` + UFG grid | reassign — Phase 2 owns | No other phase touches Leads-area grid files |
| `src/lib/components/pipeline/PipelineBoard.svelte`, calendar/reports components | reassign — Phase 3 owns | No other phase touches Pipeline/Calendar/Reports files |
| `src/routes/leads/new/+page.svelte`, `MeetingFormModal.svelte`, Team invite modal | reassign — Phase 4 owns | No other phase touches these form files |

No package conflicts among Phases 2, 3, 4 — all three are parallel-safe given the token-read-only
constraint above. Phase 1 and Phase 5 are intentionally broader/overlapping by design (Phase 1
writes the shared tokens; Phase 5 sweeps everything after the others finish) and are NOT run
concurrently with the Phase 2/3/4 set.

---

## Global Constraints

- No schema, auth, or public API contract changes anywhere in this program.
- No new component library, CSS framework, or UI dependency — stay within Tailwind 4 +
  shadcn-svelte + `tokens.css`.
- After every phase that touches agent/harness files, run the parity validator and confirm it
  exits 0 before declaring the phase DONE (not expected to apply here — this program touches only
  `src/` — but keep the rule in case a phase report itself needs a frontmatter fix).
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context
  commits separate from execution commits.
- Cross-reference (never duplicate) `loading-ux_30-06-26`, `reports-echarts-review-queue_29-06-26`,
  `reports-shadcn-chart-migration_30-06-26`, and the leads-area active plans listed in the SPEC's
  Out Of Scope section.

---

## Durable Report Destinations

| Phase | Report path (inside task folder) |
|---|---|
| 0 (pre-program) | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-00-plan-kickoff_REPORT_02-07-26.md` |
| 1 — Nav & Shell Foundation | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_REPORT_{dd-mm-yy}.md` |
| 2 — Leads/UFG Grid Consolidation | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-02-leads-grid_REPORT_{dd-mm-yy}.md` |
| 3 — Pipeline/Calendar/Reports Responsiveness | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-03-pipeline-calendar_REPORT_{dd-mm-yy}.md` |
| 4 — Forms | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-04-forms_REPORT_{dd-mm-yy}.md` |
| 5 — Token Sweep Completion | `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_REPORT_{dd-mm-yy}.md` |

---

## Program Status Table

| Phase | Status |
|---|---|
| 0 — Pre-program (plan creation) | ✅ VERIFIED |
| 01 — Nav & Shell Foundation | ✅ VERIFIED |
| 02 — Leads/UFG Grid Consolidation & Responsiveness | ✅ VERIFIED (UPDATE PROCESS closeout 02-07-26) |
| 03 — Pipeline/Calendar/Reports Responsiveness & Theme G | ✅ VERIFIED |
| 04 — Forms | ✅ VERIFIED |
| 05 — Token Sweep Completion, Theme F, Remaining A11y | ✅ VERIFIED (UPDATE PROCESS closeout 02-07-26 — final phase) |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

**Program status: ✅ COMPLETE.** All 5 phases VERIFIED. See
`sitewide-ux-refresh-program_CLOSEOUT_02-07-26.md` (same task folder) for the full whole-program
closeout: what shipped per phase, SPEC AC1-AC13 achievement scoring, and the consolidated
known-gaps/backlog list.

---

## Touchpoints

- `src/lib/components/layout/AppShell.svelte`, `AppSidebar.svelte`, `AppTopbar.svelte` (Phase 1)
- `src/lib/styles/tokens.css` (Phase 1 write; Phase 2-4 read-only; Phase 5 completes the sweep)
- `src/lib/components/leads/LeadGrid.svelte`, `src/routes/unassigned/+page.svelte`,
  `src/routes/leads/new/+page.svelte` and any newly-extracted shared components (Phase 2 + Phase 4)
- `src/lib/components/pipeline/PipelineBoard.svelte`, `src/lib/components/calendar/CalendarGrid.svelte`,
  `src/lib/components/calendar/CalendarEntry.svelte`, `src/lib/components/reports/CalendarHeatmap.svelte`,
  `src/lib/components/reports/MonthCalendar.svelte`, `src/routes/api/leads/pipeline-stage/*` (read-only
  reference only — no API contract change) (Phase 3)
- `src/lib/components/meetings/MeetingFormModal.svelte`, `src/routes/team/+page.svelte` (Phase 4)
- `src/routes/login/+page.svelte`, `src/routes/unauthorized/+page.svelte`, `src/routes/+error.svelte`,
  `src/lib/components/reports/*` (Phase 5)
- `src/lib/components/shared/LeadListRow.svelte` or equivalent snooze-button component (Phase 5, AC13)

---

## Public Contracts

- No schema, auth, or public API contract changes.
- `crm_lead_history` audit-trail write behavior for pipeline stage changes is preserved exactly
  (same write path, new UI trigger only) — Phase 3.
- Existing nav item arrays (`work[]`/`manager[]`) in AppSidebar are reused unchanged by the new
  mobile drawer — Phase 1.
- `onMove(leadId, stage)` prop used by drag-and-drop is reused unchanged by the new keyboard
  stage-change control — Phase 3.

---

## Blast Radius

Files directly modified or created (by phase — see `phase-blast-radius-registry.md` for the
authoritative per-phase claim list):

- Phase 1: 3-4 layout files + tokens.css (token additions)
- Phase 2: LeadGrid.svelte, unassigned/+page.svelte, leads/new/+page.svelte, 2-3 new shared
  component files (grid, date picker, hover-popover)
- Phase 3: PipelineBoard.svelte, CalendarGrid.svelte, CalendarEntry.svelte, CalendarHeatmap.svelte,
  MonthCalendar.svelte, 1 new stage-change control component
- Phase 4: leads/new/+page.svelte (shared with Phase 2 — see registry note), MeetingFormModal.svelte,
  team/+page.svelte, 1 new shared field-error component
- Phase 5: login/+page.svelte, unauthorized/+page.svelte, +error.svelte, reports components,
  Reminders/Today snooze-button wiring, remaining ARIA attributes across all above

Estimated total: ~20-25 files across the program. No single phase exceeds ~8 files.

---

## Verification Evidence

```bash
# Structural validity of every plan artifact written by this kickoff
node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
# Expected: PASS, no structural failures

node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_PLAN_02-07-26.md
# Expected: PASS (repeat for phase-02 through phase-05)

# Program-level regression baseline (run once per phase EVL, not just at kickoff)
bun run check && bun run test:unit:ci
# Expected: 0 type errors; existing Vitest suite green (263+ passed, known skips only)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md`
- Last completed phase: Phase 0 (this umbrella plan file = Phase 0 artifact)
- Validate-contract status: pending (vc-validate-agent writes per-phase)
- Supporting context files loaded: `process/context/all-context.md`, `process/context/planning/all-planning.md`,
  `process/context/tests/all-tests.md`, `process/development-protocols/phase-programs.md`,
  `process/development-protocols/plan-lifecycle.md`
- Next step for a fresh agent: Read this umbrella plan, read the Phase 1 plan
  (`phase-01-nav-shell_PLAN_02-07-26.md`), then run the Phase 1 research subagent before any
  EXECUTE work.
- Current phase: Phase 1 — Nav & Shell Foundation
- Next action: Spawn vc-research-agent for Phase 1
- Execute-agent start instruction: Read this file. Read Phase 1 plan. Run research subagent first.
  Do NOT spawn vc-execute-agent until Phase 1's `## Validate Contract` section is a real (non-
  placeholder) contract with Gate: PASS or an accepted CONDITIONAL.

---

## Current Execution State

Last updated: 02-07-26 (Phase 5 + WHOLE-PROGRAM UPDATE PROCESS closeout — this is the terminal
update to this section; the program is complete)

**PROGRAM STATUS: ✅ COMPLETE.** All 5 phases VERIFIED, EXECUTE + EVL complete. Full whole-program
closeout (per-phase summary, SPEC AC1-AC13 achievement scoring, consolidated known-gaps list) is in
`sitewide-ux-refresh-program_CLOSEOUT_02-07-26.md` (same task folder) — this section is now a
condensed pointer, not the full record.

Completed phases: Phase 0 (Planning), Phase 1 (Nav & Shell Foundation — ✅ VERIFIED; 2 known-gaps —
see phase-01-nav-shell_REPORT_02-07-26.md), Phase 2 (Leads/UFG Grid Consolidation & Responsiveness —
✅ VERIFIED; 3 known-gaps, all backlogged — see phase-02-leads-grid_REPORT_02-07-26.md), Phase 3
(Pipeline/Calendar/Reports Responsiveness & Theme G — ✅ VERIFIED; no new known-gaps beyond the
program-wide pre-accepted shared-auth-fixture pattern — see phase-03-pipeline-calendar_REPORT_02-07-26.md),
Phase 4 (Forms — ✅ VERIFIED; AC7 literal-wording pre-accepted Known-Gap — see
phase-04-forms_REPORT_02-07-26.md), Phase 5 (Token Sweep Completion, Theme F, Remaining A11y — ✅
VERIFIED, FINAL phase; EVL independently re-confirmed all gates green/clean-self-skip AND confirmed
no cross-phase regression to Phases 1-4's artifacts — see phase-05-token-sweep_REPORT_02-07-26.md
"EVL Confirmation" section).

Outer PVL (VALIDATE, Step 4) terminal gates, all 5 phases:
- Phase 1 (Nav & Shell): CONDITIONAL, accepted — EXECUTE+EVL complete
- Phase 2 (Leads Grid): CONDITIONAL (Cycle 1) superseded by Cycle 2 PASS — EXECUTE+EVL complete, UPDATE PROCESS closed out
- Phase 3 (Pipeline & Calendar): PASS, clean — EXECUTE+EVL complete
- Phase 4 (Forms): CONDITIONAL (Cycle 1, after Cycle 0 BLOCKED on Gap A0, resolved via plan-supplement) — EXECUTE+EVL complete
- Phase 5 (Token Sweep): CONDITIONAL (Cycle 2, after Cycle 1 outer-pvl), accepted — EXECUTE+EVL complete, FINAL phase

Program Net Gate: **CONDITIONAL** (0 phases BLOCKED-unresolved; 5 phases VERIFIED — 2 PASS clean
[Phase 2's Cycle 2, Phase 3], 3 CONDITIONAL-accepted [Phase 1, Phase 4, Phase 5]; 0 phases queued —
program complete).

Current phase: none — all 5 phases closed out. No further phase work remains in this program.
Current loop step: n/a — program terminal. (Historical: last active loop step was Phase 5 Step 7
UPDATE-PROCESS, now complete.)
Validate-contract status: written for all 5 phases (outer-pvl) — see each phase's `## Validate
Contract` section for full V1-V7 detail. Cycle counts: Phase 1/3 = 1 cycle; Phase 2/5 = 2 cycles
(Cycle 2 re-validate after Inner Loop Refresh Note); Phase 4 = 2 cycles (Cycle 0 BLOCKED, Cycle 1
CONDITIONAL). All 5 phases completed their full 7-step inner loop (Steps 1-7 done for all).
Latest validator run: 02-07-26 — see Verification Evidence section above (run at kickoff time;
per-phase EVL gate re-runs recorded in each phase report and in `results.tsv`).

Commit checkpoint: ALL FIVE phases' execution changes remain uncommitted as of this UPDATE PROCESS
session (this agent does not create commits — see Constraints). Recommend ONE execution commit
covering all 5 phases' `src/` + `e2e/` changes (tokens.css, AppShell/AppSidebar/AppTopbar,
DataGridShell/DatePickerField/hover-popover/owner.ts, LeadGrid/unassigned, PipelineBoard/StageSelect/
CalendarGrid/CalendarEntry/CalendarHeatmap/MonthCalendar, field-error/, leads/new, team,
MeetingFormModal, login/unauthorized/+error, reports/+page, leads/+page, leads/[id]/+page, Today
(`+page.svelte`), reminders/+page, new `ui/tabs/`, all new e2e specs), via `vc-git-manager`, followed
by a SEPARATE process-artifact commit (this UPDATE PROCESS session's report/plan/registry/context
edits + the active/ → completed/ folder move). Not created by this agent — requires explicit user
instruction.

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule (historical, retained for audit): read "Current loop step" and "validate-contract
status" before spawning any subagent. Program is now terminal — no further subagent spawns expected
against this umbrella plan.

Note: The Stable Program Goal above is fixed. This section was the only part that changed across
the program's life — update-process-agent rewrote it after every phase closeout (overwrite, not
append — git history is the audit log). This is its final rewrite; the plan folder is being moved
to `completed/` by this same UPDATE PROCESS session.

---

## Test Infra Improvement Notes

- e2e/Playwright authenticated-session fixture remains the single highest-leverage test-infra gap
  in the repo (see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Every new
  e2e scenario this program adds for AC1-AC3, AC5-AC7, AC11-AC13 will self-skip against protected
  routes until that fixture exists — record consistently as known-gaps, not new failures.
- No live-DB CI harness exists yet for Hybrid-tier gates (AC8, AC9) — visual/token-regression
  checks stay grep-based + manual review until that harness lands.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
