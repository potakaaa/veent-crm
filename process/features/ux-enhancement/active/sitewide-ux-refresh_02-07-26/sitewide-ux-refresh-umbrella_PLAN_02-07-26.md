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
| 0 — Pre-program (plan creation) | ⏳ PLANNED |
| 01 — Nav & Shell Foundation | ✅ VERIFIED |
| 02 — Leads/UFG Grid Consolidation & Responsiveness | ✅ VERIFIED (UPDATE PROCESS closeout 02-07-26) |
| 03 — Pipeline/Calendar/Reports Responsiveness & Theme G | ✅ VERIFIED |
| 04 — Forms | ✅ VERIFIED |
| 05 — Token Sweep Completion, Theme F, Remaining A11y | ⏳ PLANNED |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

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

Last updated: 02-07-26 (Phase 2 UPDATE PROCESS closeout; reconciled against concurrent Phase 3/Phase
4 UPDATE PROCESS closeouts found already complete in the registry/plan at write time)
Completed phases: Phase 0 (Planning), Phase 1 (Nav & Shell Foundation — ✅ VERIFIED, code-complete,
EVL-confirmed; 2 known-gaps recorded — see phase-01-nav-shell_REPORT_02-07-26.md), Phase 2
(Leads/UFG Grid Consolidation & Responsiveness — ✅ VERIFIED, code-complete, EVL-confirmed; 3
known-gaps recorded, all backlogged — see phase-02-leads-grid_REPORT_02-07-26.md), Phase 3
(Pipeline/Calendar/Reports Responsiveness & Theme G — ✅ VERIFIED, code-complete, EVL-confirmed;
no known-gaps beyond program-wide pre-accepted shared-auth-fixture pattern — see
phase-03-pipeline-calendar_REPORT_02-07-26.md), Phase 4 (Forms — ✅ VERIFIED, code-complete,
EVL-confirmed by a concurrent session; AC7 literal wording pre-accepted Known-Gap — see
phase-04-forms_REPORT_02-07-26.md)

Phase 1 status: ✅ VERIFIED. All checklist items (A1-A3, B1-B3, C1-C6) done. EVL confirmation
(orchestrator-run, independent of execute-agent): `bun run check` PASS, `test:unit:ci` PASS
(301/0 fail), AC8 hex grep PASS, `git diff --stat` matches blast radius exactly. SPEC Achievement:
AC8 met; AC1 and AC4 scored Unmet/Known-Gap (AC1 — pre-existing shared-auth-fixture e2e self-skip;
AC4 — `@axe-core/playwright` devDependency not installed, Agent-Probe fallback used). New backlog
note: `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`
(program-level decision, also blocks Phase 3/5 AC4 gates). Nav-surface + focus-ring tokens now
exist in `tokens.css` and are stable public contract for Phases 2-5 (final names recorded in
`phase-01-nav-shell_REPORT_02-07-26.md` "Final Chosen Token Names"). Execution changes NOT yet
committed — commit recommended before further phase EXECUTE work (see Commit Checkpoint below).

Phase 2 status: ✅ VERIFIED (UPDATE PROCESS closeout 02-07-26). All checklist items (A1, B1-B2,
C1-C3, D1-D2) done — C1/C2 `leads/new` wiring was BLOCKED at the first EXECUTE pass on Phase 4's
concurrent field-error overlap, then resolved in a follow-up EXECUTE pass once Phase 4 landed
(`DatePickerField` gained an additive optional `errors` prop; Phase 4's per-field
`aria-invalid`/`aria-describedby` wiring on the event-date field survives unchanged). EVL
confirmation (orchestrator-run, independent of execute-agent): `bun run check` PASS (0 errors),
`bun run test:unit:ci` PASS (313/313), `/unassigned` preserved-functionality (inline-edit,
bulk-claim/assign, filters, sort, pagination, dual empty-states) confirmed present via grep,
dedup-hover reactivity confirmed unaffected, `leads-grid-responsive.e2e.ts` runs clean (self-skips
on the known shared-auth-fixture gap). SPEC Achievement: C2-OVERLAP (Agent-Probe) met; AC10 scored
Partially Met (Vitest + code-level import check Fully-Automated PASS; e2e regression leg
env-blocked, not run — scored Unmet per the vacuous-green ban rather than rounded up); AC2
(Leads/UFG portion) and the PERF-RISK gate scored Unmet/Known-Gap (both env-blocked this cycle).
3 known-gaps recorded, all backlogged: (1) shared Playwright auth-fixture (program-wide,
pre-existing — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); (2)
nested-worktree Playwright module duplication + intermittent ENOSPC — a DISTINCT env blocker from
(1), newly backlogged this session (`process/features/ux-enhancement/backlog/nested-worktree-playwright-env-blocker_NOTE_02-07-26.md`)
and affects Phase 1/3/4's e2e confirmations too, not just Phase 2; (3) `OrganizerHoverCard.svelte`
keyboard/focus a11y audit — flagged twice during VALIDATE, written this session
(`process/features/leads/backlog/organizerhovercard-a11y-audit_NOTE_02-07-26.md`). Execution changes
NOT yet committed — commit recommended (see Commit Checkpoint below).

Phase 3 status: ✅ VERIFIED. All checklist items (A1-A5, B1-B4, C1-C3) done, including the Cycle 2
PVL re-validate additions (A3a card restructure + E2/E3/E4 execute-agent instructions). EVL
confirmation (orchestrator-run, independent of execute-agent): `bun run check` PASS (0 errors),
`bunx vitest --run` PASS (313/313), `git diff --stat` matches all 10 claimed files exactly, the
pipeline card's drag-and-drop confirmed structurally intact (native-link-drag hijack suppressed,
`StageSelect` a sibling not nested), the Reports heatmap overflow fix confirmed real (wrapper +
explicit min-width, not just the wrapper alone), and both new e2e specs
(`pipeline-keyboard-stage.e2e.ts`, `calendar-overflow.e2e.ts`) run clean — all 8 scenarios self-skip
on the known shared-auth-fixture gap, no hard failures. SPEC Achievement: AC2/AC3/AC11/AC12 met;
AC4 met with Agent-Probe fallback for the axe-specific sub-gate (same shared
`@axe-core/playwright` devDependency decision as Phase 1 — no new backlog note needed). No new
known-gaps beyond the program-wide pre-accepted shared-auth-fixture pattern. Execution changes NOT
yet committed — commit recommended (see Commit Checkpoint below).

Phase 4 status: ✅ VERIFIED (closed out by a concurrent UPDATE PROCESS session — reconciled here,
not re-derived). All checklist items (A0-A3, B1-B4 + B2a, E1, E4) done. EVL confirmation
(orchestrator-run, independent of execute-agent, per that session): `bun run check` PASS (0
errors), `test:unit:ci` PASS (313/313 full suite + 12/12 isolated new specs), grep confirmed zero
`sveltekit-superforms`/`superForm(` usage anywhere in `src/`, and the Phase 2/Phase 4 concurrent
edit to `leads/new/+page.svelte` independently confirmed as a genuine merge (FieldError +
DatePickerField both present, error wiring correctly threaded) rather than one phase overwriting
the other. e2e hit a dev-server port collision (environment artifact, not a regression) — recorded
inconclusive, a clean isolated e2e run is still recommended. SPEC Achievement: AC6 met, AC7
(revised fetch+per-field-error intent) met; AC7 (literal `superForm()`/`use:enhance` wording)
scored Unmet — pre-accepted permanent Known-Gap (typebox@1.3.0 breaks the Superforms adapters
barrel; zero real `superForm()` precedent exists in the repo). Backlog notes from that session:
`sveltekit-superforms-typebox-conflict` and a doc-drift reconciliation item for `all-context.md`
§Mandatory Conventions (still says "Superforms + Zod for all forms"; real idiom is client
`safeParse` + `fetch`) — both outside this Phase-3-scoped session's remit to action, flagged here
for whichever session next touches `all-context.md`. Execution changes NOT yet committed.

Outer PVL (VALIDATE, Step 4) complete for ALL 5 phases — terminal gates:
- Phase 1 (Nav & Shell): CONDITIONAL, accepted as-is (2 concerns resolved via Execute-Agent Instructions, no plan-text supplement) — **now EXECUTE+EVL complete, see above**
- Phase 2 (Leads Grid): CONDITIONAL (Cycle 1), superseded by Cycle 2 PASS after both open items were
  closed by RESEARCH — **now EXECUTE+EVL complete and UPDATE PROCESS closed out, see above**
- Phase 3 (Pipeline & Calendar): PASS, clean — **now EXECUTE+EVL complete, see above**
- Phase 4 (Forms): CONDITIONAL as of Cycle 1 re-validate (Cycle 0 BLOCKED on Gap A0 — sveltekit-superforms import broken, resolved via plan-supplement dropping Superforms conversion for a fetch+safeParse restructure; Cycle 1 confirmed independently, 3 residual concerns pre-accepted — see phase-04 Phase Loop Progress note) — **now EXECUTE+EVL complete, see above**
- Phase 5 (Token Sweep): CONDITIONAL, accepted (1 concern: ARIA-sweep route enumeration missing 3 routes, resolved via Execute-Agent Instruction E1) — still MUST NOT start until Phases 2/3/4 also reach exit gates

Current phase: Phases 1, 2, 3, and 4 all closed out (VERIFIED). Phase 5 MUST run after Phases 1-4
are in final shape (unchanged dependency ordering) — now unblocked; all 4 dependency phases have
reached their exit gates.
Current loop step: RESEARCH (Step 1) — next for Phase 5 (Token Sweep Completion, Theme F, Remaining
A11y). No other phase has open loop steps.
Validate-contract status: written for all 5 phases (outer-pvl) — see each phase's `## Validate
Contract` section for full V1-V7 detail. Cycle counts: Phases 1/2/3/5 = 1 cycle (first-pass, Phase
2 additionally re-validated at Cycle 2 after its Inner Loop Refresh Note); Phase 4 = 2 cycles
(Cycle 0 BLOCKED, Cycle 1 CONDITIONAL). Phases 1, 2, 3, and 4 all completed their full 7-step inner
loop (Steps 4-7 done; PVL artifact non-placeholder, EXECUTE/EVL/UPDATE-PROCESS complete for all
four).
Program Net Gate: CONDITIONAL (0 phases BLOCKED-unresolved; 4 phases VERIFIED — Phase 1, Phase 2,
Phase 3, Phase 4; 1 phase queued — Phase 5, now unblocked and ready to start RESEARCH)
Latest validator run: 02-07-26 — see Verification Evidence section above (run at kickoff time)

Commit checkpoint: Phase 1, Phase 2, Phase 3, AND Phase 4 execution changes are all uncommitted
(tokens.css, AppShell/AppSidebar/AppTopbar, e2e/mobile-nav.e2e.ts from Phase 1; DataGridShell.svelte,
DatePickerField.svelte, hover-popover.svelte.ts, owner.ts, LeadGrid.svelte, unassigned/+page.svelte,
leads-grid-responsive.e2e.ts from Phase 2; PipelineBoard.svelte, StageSelect.svelte,
CalendarGrid/CalendarEntry/CalendarHeatmap.svelte, pipeline/calendar/reports routes,
e2e/pipeline-keyboard-stage.e2e.ts, e2e/calendar-overflow.e2e.ts from Phase 3; field-error/,
leads/new/+page.svelte (shared Phase 2+Phase 4 merge, confirmed clean), team/+page.svelte,
MeetingFormModal.svelte + 5 new test files from Phase 4). Recommend one execution commit covering
all four verified phases via `vc-git-manager` before Phase 5's EXECUTE work begins, kept separate
from process-artifact changes (phase reports, plan updates, backlog notes). Not created by this
agent — requires explicit user instruction (this UPDATE PROCESS session was scoped to Phase 2 only
and does not create commits).

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "validate-contract status" before spawning any
subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

Note: The Stable Program Goal above is fixed. This section is the only part that changes —
update-process-agent rewrites it after every phase closeout (overwrite, not append — git history
is the audit log).

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
