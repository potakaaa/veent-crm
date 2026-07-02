---
name: plan:sitewide-ux-refresh-phase-05-token-sweep
description: "Site-Wide UX Refresh — Phase 05: Token Sweep Completion, Theme F, Remaining A11y"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: phase-05
---

# Phase 05 — Token Sweep Completion, Theme F, Remaining A11y

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

This phase runs LAST because it depends on Phases 1-4 being in their final shape — there is no
point token-sweeping or ARIA-sweeping a component that Phase 2/3/4 is about to rewrite. It
completes the design-token sweep on Auth pages + Reports (Phase 1 covered Nav/Topbar/Shell only),
unifies the two tab visual languages and two chip systems into one implementation each (AC9),
aligns Reminders' Snooze button UP to Today's more-mature optimistic/pending pattern (AC13 — an
explicit SPEC decision that supersedes `loading-ux_30-06-26`'s Reminders exclusion), and performs
the remaining per-component ARIA sweep across all surfaces touched by Phases 1-4.

---

## Entry Gate

- Phases 1, 2, 3, AND 4 all reach their exit gates (this phase intentionally has the broadest
  dependency footprint in the program — do not start early)
- `loading-ux_30-06-26` plan is read and its Reminders-snooze exclusion rationale is understood
  before making the AC13 supersession change

---

## Blast Radius

- `src/routes/login/+page.svelte`
- `src/routes/unauthorized/+page.svelte`
- `src/routes/+error.svelte`
- `src/lib/components/reports/*` (token-swap only — no chart-library migration scope, that belongs
  to `reports-echarts-review-queue_29-06-26` / `reports-shadcn-chart-migration_30-06-26`)
- Reminders/Today snooze-button component (likely `LeadListRow.svelte` or equivalent — confirm
  exact path during RESEARCH)
- Tab component call sites (Leads/Lead-detail) and chip component call sites (Calendar/Meeting-modal)

---

## Implementation Checklist

### Step A — Remaining design-token sweep (Auth + Reports)

- [ ] A1. Swap hardcoded hex/arbitrary-bracket values on `login/+page.svelte`,
      `unauthorized/+page.svelte`, and `+error.svelte` to `tokens.css` `@theme` values (AC8 — Auth
      pages slice).
- [ ] A2. Swap hardcoded hex/arbitrary-bracket values in Reports components to `tokens.css`
      `@theme` values, explicitly scoped to visual-token usage only — do NOT touch chart-rendering
      logic owned by the two active chart-migration plans (cross-reference, do not duplicate or
      absorb).
- [ ] A3. Confirm via grep-based regression check: no hardcoded hex/arbitrary-bracket values remain
      in any file touched across this entire program (Nav/Topbar/Shell from Phase 1 + Auth/Reports
      from this phase). Manual visual review for sign-off (AC8's Hybrid strategy).

### Step B — Tab/chip unification

- [ ] B1. Unify the two tab visual languages (segmented pill vs. bordered tablist) into one shared
      tab component, applied consistently across Leads/Lead-detail.
- [ ] B2. Unify the two chip systems (calendar entries vs. attendee selector) into one shared chip
      component with a shared token, applied consistently across Calendar/Meeting-modal.
- [ ] B3. Code-level check confirming a single shared tab component and a single shared chip
      component are used at all prior call sites (AC9's proven-by requirement).

### Step C — Theme F: Reminders/Today snooze alignment (AC13)

- [ ] C1. Read `loading-ux_30-06-26`'s existing Reminders-snooze exclusion rationale before making
      any change.
- [ ] C2. Align the Reminders-page Snooze button's optimistic/pending/rollback behavior UP to
      Today's pattern (Today's implementation is the more mature one per research) — this is an
      explicit SPEC AC13 decision, not a silent reversal.
- [ ] C3. Update `loading-ux_30-06-26`'s plan file (or add a cross-reference note in its active
      plan) explicitly stating this phase's decision supersedes its prior Reminders exclusion, so
      the two plans stay reconciled rather than silently diverging.
- [ ] C4. Verify the SAME `LeadListRow` (or equivalent) snooze interaction produces the SAME
      loading/rollback behavior on both Today and Reminders pages (AC13's proven-by e2e scenario).

### Step D — Remaining per-component ARIA sweep

- [ ] D1. Apply the focus-ring utility (from Phase 1) to remaining shared primitives not yet
      covered: `ui/button`, form inputs, calendar cells (Phase 1 only covered nav links + sign-out).
- [ ] D2. Add `aria-live` announcement wiring for state-changing non-navigation actions across all
      surfaces touched by this program (e.g. claim-lead button, if not already covered by an
      earlier phase — confirm during RESEARCH to avoid duplicating Phase 3's calendar/pipeline ARIA
      work).
- [ ] D3. Run a final axe-core sweep across ALL major routes touched by Phases 1-4 (Nav, Leads,
      Pipeline, Calendar, Forms, Auth, Reports) asserting zero critical/serious violations for
      name/role/focus-visible rules (AC4's proven-by requirement, program-wide closure).

---

## Exit Gate

```bash
bun run check
# Expected: 0 type errors

bun run test:unit:ci
# Expected: existing full suite green, no regressions across the whole program

bun run test:e2e -- reminders-snooze-alignment.e2e.ts
# Expected: new AC13 e2e scenario green (or self-skip known-gap per shared auth fixture)

grep -rn "#[0-9a-fA-F]\{3,8\}" src/routes/login src/routes/unauthorized src/routes/+error.svelte src/lib/components/reports src/lib/components/layout
# Expected: no unexpected hardcoded hex matches outside intentional exceptions (documented in report)
```

- All checklist items (A1-A3, B1-B3, C1-C4, D1-D3) checked
- Program-wide axe-core sweep records zero critical/serious violations across all touched routes
- `loading-ux_30-06-26` plan updated with the AC13 supersession cross-reference (not silently
  diverging)
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Tab/chip unification reveals a behavioral difference between the two implementations that isn't
  purely visual (e.g. different keyboard interaction models) — escalate to INNOVATE re-run rather
  than silently picking one and dropping functionality
- `loading-ux_30-06-26` plan is in active EXECUTE at the same time this phase tries to update it —
  coordinate via phase report and umbrella cross-reference, do not silently overwrite its scope
- Program-wide axe-core sweep finds violations that trace back to an earlier phase's incomplete
  work — route back to that phase's follow-up rather than absorbing the fix into this phase's
  scope silently

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note if sections changed (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: CONDITIONAL, 02-07-26 (outer-pvl, accepted — 1 concern: ARIA-sweep route enumeration missing 3 routes, resolved via Execute-Agent Instruction E1; no plan-text supplement needed)**
- [ ] 5. EXECUTE — all checklist items done; per-section test gates run and green (or gaps documented)
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `src/routes/login/+page.svelte`, `src/routes/unauthorized/+page.svelte`, `src/routes/+error.svelte`
- `src/lib/components/reports/*` (token-swap scope only)
- Reminders/Today snooze-button component (exact path confirmed during RESEARCH)
- Tab and chip component call sites across Leads/Lead-detail and Calendar/Meeting-modal
- `process/features/loading-ux/active/loading-ux_30-06-26/` (cross-reference update, not
  execution scope)

---

## Public Contracts

- No schema, auth, or API contract changes.
- No chart-rendering logic changes in Reports — token/visual swap only, chart-library migration
  scope stays with `reports-echarts-review-queue_29-06-26` / `reports-shadcn-chart-migration_30-06-26`.
- `LeadListRow` (or equivalent) component's external prop interface unchanged — only its internal
  Reminders-page wiring is aligned to Today's existing behavior.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Grep-based regression check: no hardcoded hex/arbitrary-bracket values in Auth/Reports files + manual visual review | Hybrid | AC8 |
| Code-level check: single shared tab component + single shared chip component used at all prior call sites + visual regression review | Hybrid | AC9 |
| Playwright scenario: same LeadListRow snooze interaction produces same loading/rollback behavior on Today and Reminders | Fully-Automated | AC13 |
| Program-wide axe-core sweep across all major routes touched by Phases 1-4 | Fully-Automated | AC4, AC5 |

```bash
bun run test:e2e -- reminders-snooze-alignment.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_PLAN_02-07-26.md`
- Last completed step: PVL (Step 4) — validate-contract written, Gate: CONDITIONAL
- Validate-contract status: written (02-07-26) — CONDITIONAL, accepted via execute-agent instruction (no plan-text supplement required)
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — must confirm Phases 1-4 are all at
  their exit gates before this phase begins EXECUTE

---

## Test Infra Improvement Notes

(none identified yet)

---

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: (none — first validate-contract for this plan)

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 6+ distinct touchpoints/files in blast radius: login,
unauthorized, +error, reports/*, snooze component, tab/chip call sites). No multi-package scope,
no schema/API/auth surface, no high-risk class, single locked approach per SPEC/umbrella. A single
vc-execute-agent (opus) running Steps A→D in order is the right fit — matches the same 1/7 score
and sequential recommendation already used for Phase 1 and for `loading-ux_30-06-26`.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC8 | No hardcoded hex/arbitrary-bracket values remain on Auth pages + Reports (program-wide, incl. Phase 1's Nav/Topbar/Shell files) | Hybrid | `grep -rn "#[0-9a-fA-F]\{3,8\}" src/routes/login src/routes/unauthorized src/routes/+error.svelte src/lib/components/reports src/lib/components/layout` exits with no unexpected matches + manual visual review | B (gate added by this plan, Step A3) |
| AC9 | Tab and chip visual patterns unified into one shared implementation each, used at all prior call sites | Hybrid | Code-level check: single shared tab import at Leads/Lead-detail call sites + single shared chip import at Calendar/Meeting-modal call sites + visual regression review | B (Step B3) |
| AC13 | Reminders-page Snooze button produces the same loading/rollback behavior as Today's (explicit SPEC supersession of `loading-ux_30-06-26`'s exclusion) | Fully-Automated | `bun run test:e2e -- reminders-snooze-alignment.e2e.ts` | B (Step C4) — self-skips to a documented known-gap only if the shared-auth-fixture blocker (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) is still unresolved; this is the same pre-accepted pattern used program-wide, not a new gap |
| AC4, AC5 | Zero critical/serious axe-core violations for name/role/focus-visible + `aria-live` announcements across every route touched by Phases 1-4 | Fully-Automated | axe-core sweep (Playwright) run against the enumerated route list — **see Execute-Agent Instruction E1: the checklist's D3 route list ("Nav, Leads, Pipeline, Calendar, Forms, Auth, Reports") is a theme grouping, not a literal route list, and must be expanded before the sweep runs** | B (Step D3, contingent on E1) |

Known Gaps:
- AC13 e2e self-skip: if `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`'s shared-auth-fixture gap is still open when this phase executes, `reminders-snooze-alignment.e2e.ts` self-skips per the program-wide pre-accepted pattern (Program Goal Charter, umbrella plan). Documented as `known-gap: documented as NEW PLAN REQUIRED — see backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (existing note, not a new one). Excluded from CONCERN/FAIL count per the umbrella's stated tolerance.

Legacy line form (retained so existing validate-contract consumers still parse):
- Auth/Reports token sweep: hybrid: `grep -rn "#[0-9a-fA-F]\{3,8\}" src/routes/login src/routes/unauthorized src/routes/+error.svelte src/lib/components/reports src/lib/components/layout` + manual visual review
- Tab/chip unification: hybrid: code-level import check + visual regression review
- Reminders/Today snooze parity: fully-automated: `bun run test:e2e -- reminders-snooze-alignment.e2e.ts`
- Program-wide axe-core sweep: fully-automated: axe-core Playwright sweep across the (expanded, per E1) route list
- Type/regression baseline: fully-automated: `bun run check` exits 0; `bun run test:unit:ci` exits 0 with no new failures

Failing stub (AC13):
```
test("should align Reminders Snooze button behavior to Today's snooze pattern (same loading/rollback)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reminders-snooze-alignment")
})
```

Failing stub (AC4/AC5):
```
test("should record zero critical/serious axe-core violations across every route touched by Phases 1-4", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: program-wide axe-core sweep")
})
```

Dimension findings:
- Infra fit: PASS — all named blast-radius files exist on disk (`src/routes/login/+page.svelte`, `src/routes/unauthorized/+page.svelte`, `src/routes/+error.svelte`, `src/lib/components/reports/{CalendarHeatmap,MonthCalendar}.svelte`); `LeadListRow.svelte` exists at `src/lib/components/leads/LeadListRow.svelte` (plan correctly defers the exact path to RESEARCH rather than asserting it); stack stays within Tailwind 4 + shadcn-svelte + tokens.css, no new runtime surface.
- Test coverage: CONCERN — AC13 and the axe-core sweep are both Fully-Automated in principle, but the axe-sweep's route enumeration is incomplete (see Section D below); this is the one concern driving the CONDITIONAL gate. AC13's known-gap self-skip path is pre-accepted program-wide and does not itself count as a gap.
- Breaking changes: PASS — Public Contracts section explicitly states `LeadListRow`'s external prop interface is unchanged (only internal Reminders wiring changes); no schema/auth/API touched; Reports token-swap explicitly excludes chart-rendering logic (cross-referenced, not duplicated).
- Security surface: PASS — Auth pages (`login`, `unauthorized`, `+error`) are touched for visual tokens only, no auth-logic change; confirmed by the Public Contracts section and by the umbrella's global "no schema/auth/API" constraint. No risk evidence pack required (not a high-risk class per `vc-risk-evidence-pack` definitions — this is UI-only).
- Umbrella cross-check: PASS — Phase 5's Entry Gate ("Phases 1, 2, 3, AND 4 all reach their exit gates") matches the umbrella's Join Conditions verbatim ("Phase 5 MUST NOT start until Phases 1, 2, 3, AND 4 all reach their exit gates"); the Phase Blast-Radius Registry shows Phase 5 with no `status: BLOCKED-skipped` entry and no unresolved conflict against Phases 1-4's claimed files.
- Section A (Auth+Reports token sweep) feasibility: PASS — mechanical: target files exist and are uniquely matchable; gap: none found beyond what's already scoped; conflict: none with the two active Reports chart-migration plans (A2 explicitly excludes chart-rendering logic); highest-risk edit: none — visual-only swap.
- Section B (Tab/chip unification) feasibility: CONCERN — mechanical: a real chip/tab surface exists (`StageChip.svelte`, calendar entry rendering, tablist markup at `src/routes/leads/[id]/+page.svelte`) but the plan does not yet name the exact second tab implementation ("segmented pill") or the second chip implementation ("attendee selector") — RESEARCH must locate and confirm both exact call sites before B1/B2 execute. This is not a blocking gap (the plan's own "Blockers" section already anticipates and correctly escalates a behavioral, not just visual, difference), but it is a real plan gap worth naming. Highest-risk edit: unifying two components that turn out to have divergent keyboard interaction models — plan already names the correct escalation path (INNOVATE re-run) for this case.
- Section C (Theme F / AC13 supersession) feasibility: PASS — this is the strongest section of the plan. C1 (read the exclusion rationale) → C2 (make the explicit SPEC-sanctioned decision) → C3 (write the cross-reference back into `loading-ux_30-06-26`) → C4 (prove parity via e2e) is a complete, non-silent supersession chain. Verified against `loading-ux_30-06-26_PLAN_30-06-26.md`: that plan's Blast Radius wires snooze pending+optimistic on Today (item 12) but only a page skeleton (no snooze wiring) on Reminders (item 21) — exactly the asymmetry SPEC Theme F/AC13 and this phase's Purpose section describe. No conflict — the supersession is real, targeted, and the update-back mechanism (C3) is explicit, not a silent overwrite. Highest-risk edit: C3's cross-plan-file write is coordinated via the plan's own "Blockers" section (concurrent-EXECUTE case) — adequate.
- Section D (Remaining ARIA sweep) feasibility: CONCERN — mechanical: axe-core is already usable in this stack (no new tooling). Gap found: D3's route list ("Nav, Leads, Pipeline, Calendar, Forms, Auth, Reports") is a **theme-name grouping, not a literal route enumeration**, and does not explicitly name three routes that Phases 1-4 concretely touch: `/unassigned` (Phase 2's Up-for-Grabs grid — file `src/routes/unassigned/+page.svelte`), `/team` (Phase 4's Team invite modal — file `src/routes/team/+page.svelte`), and `/meetings/[id]` (Phase 4's `MeetingFormModal.svelte`, confirmed imported at `src/routes/meetings/[id]/+page.svelte:7`). As worded, an execute-agent could reasonably read "Leads"/"Forms"/"Calendar" as not covering these three routes and skip them, silently narrowing AC4/AC5's "program-wide closure" claim. Conflict: none with other plan sections — this is a completeness gap, not a contradiction. Highest-risk edit: the axe-core sweep itself is mechanical and low-risk; the risk is entirely in under-scoping which routes get swept — mitigated by Execute-Agent Instruction E1 below.

Execute-agent instructions:
- E1 (Step D3 entry — REQUIRED): Before running the program-wide axe-core sweep, expand the checklist's theme-name route list into an explicit route enumeration and record it in the phase report. At minimum include: `/` (Today, Nav-adjacent), `/leads`, `/leads/new`, `/leads/[id]`, `/unassigned` (Phase 2 — Up-for-Grabs grid), `/pipeline`, `/calendar`, `/meetings/[id]` (Phase 4 — MeetingFormModal), `/team` (Phase 4 — Team invite modal), `/reminders`, `/reports`, `/login`, `/unauthorized`, the global error page. Do not treat "Leads"/"Forms"/"Calendar" as already covering `/unassigned`, `/team`, or `/meetings/[id]` — sweep them explicitly. If any route is intentionally excluded, state why in the phase report rather than silently dropping it.
- E2 (Step B1/B2 entry — REQUIRED): During RESEARCH, name the exact file/component for the second tab implementation ("segmented pill", as distinct from the bordered tablist already confirmed at `src/routes/leads/[id]/+page.svelte`) and the second chip implementation ("attendee selector", as distinct from calendar-entry chips) before touching either. If a behavioral (not purely visual) difference surfaces between either pair, follow the plan's own Blockers-section escalation (INNOVATE re-run) rather than silently picking one and dropping functionality.
- E3 (Step C1/C2 entry — minor): When reading `loading-ux_30-06-26`'s Reminders-snooze exclusion rationale (Decision Log item 8: "Log-touch = pending-only... Too many derived fields to shadow cleanly" — note this decision is about log-touch, not snooze; confirm during RESEARCH which exact decision/note in that plan documents the Reminders-snooze asymmetry, since it is implicit in the Blast Radius item list — items 12 vs. 21 — rather than a named Decision Log row) before writing the C3 cross-reference, so the cross-reference cites the correct source language rather than a paraphrase.

Backlog artifacts: none new — this phase reuses the existing `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` known-gap pattern; no new backlog artifact required.

Open gaps: none blocking. Residual: route-enumeration completeness (Section D) is resolved via E1 rather than a plan-text edit; tab/chip exact-call-site identification (Section B) is resolved via E2 and deferred to RESEARCH as the plan already intends.

What this coverage does NOT prove:
- The grep-based hex check (AC8): proves no *literal* hex/bracket matches remain in the checked paths — does NOT prove the swapped tokens render the *same intended look* (that is the paired manual visual review, Agent-Probe-equivalent judgment).
- The tab/chip code-level import check (AC9): proves a single component is *imported* at all call sites — does NOT prove the two prior visual languages' keyboard/interaction behavior was preserved (that risk is separately named in Section B above and in the plan's own Blockers section).
- `reminders-snooze-alignment.e2e.ts` (AC13): proves parity ONLY when Playwright can authenticate — self-skips (documented known-gap) while the shared-auth-fixture blocker is open, per the program-wide pattern; does not prove anything when skipped.
- The axe-core sweep (AC4/AC5): proves zero critical/serious violations for name/role/focus-visible rules on the routes actually included in the sweep list — does NOT prove coverage of routes omitted from that list (this is exactly why E1 exists), and does NOT prove non-critical/non-serious violations are absent (axe severity tiers below "serious" are out of scope for this gate).
- `bun run check` / `bun run test:unit:ci`: prove zero type errors and no unit-test regressions — prove nothing about visual rendering, ARIA correctness, or runtime accessibility behavior.

Gate: CONDITIONAL (1 concern group recorded as execute-agent instructions E1–E3; no FAILs; the concern is resolved via execute-agent instruction rather than a plan-text change, so no further supplement cycle is required before EXECUTE)
Accepted by: session (outer-PVL parallel validation pass, 02-07-26). Accepted concern by name: C1 axe-sweep-route-enumeration-incomplete (resolved via E1, no plan-text edit required per this pass's read-only-except-append scope). Secondary note (not a blocking concern): tab/chip exact-call-site identification deferred to RESEARCH per E2, consistent with the plan's own stated intent.
