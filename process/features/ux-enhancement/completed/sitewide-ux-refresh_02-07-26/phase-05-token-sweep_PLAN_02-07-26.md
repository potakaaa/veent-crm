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

## Inner Loop Refresh Note (02-07-26)

RESEARCH completed against Phases 1-4's actual landed code (not just their plans) and folded 5
findings into this plan — no new plan file created, this is a supplement to the existing Phase 5
plan. Summary of what changed:

1. **Definitive 12-route ARIA-sweep list** (resolves validate-contract E1) — Step D3 now enumerates
   exact routes with per-route notes on what Phases 1-4 already did vs. what remains, so EXECUTE
   sweeps only the real gaps instead of re-doing prior-phase work.
2. **Auth pages confirmed to reuse Phase 1's `--color-nav-*` tokens** (not a new `--color-auth-*`
   group) — Step A1 updated with the exact token group and the specific focus-ring/ARIA gaps found
   on the login form.
3. **Reports card-vs-div unification explicitly marked OUT OF SCOPE** for this phase (prevents
   EXECUTE scope creep) — Step A2 updated with exact line numbers for the real hex-sweep targets and
   a note on which dynamic-style usages are already token-sourced and should NOT be flagged.
4. **Tab/chip unification approach confirmed**: one shared Tab component for both existing patterns;
   NOT one identical Chip component (different interaction models) — instead a shared token/visual
   contract plus a real `aria-pressed`/`role="group"` gap called out on the Meeting-modal attendee
   chips. Step B1/B2 updated.
5. **Reminders/Today snooze gap confirmed exact** (Today has `snoozing` state, optimistic
   `shadowLeads` removal via `removeFromList()`, per-lead rollback; Reminders has none of this and
   never passes `snoozing` to `LeadListRow.svelte`) — Step C3's cross-reference citation corrected to
   `loading-ux_30-06-26` items 12 (Today) and 19 (Reminders), not item 21.

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ✅ VERIFIED (EXECUTE + EVL complete 02-07-26 — final phase of the 5-phase program)
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
- Reminders/Today snooze-button component — confirmed: `src/lib/components/leads/LeadListRow.svelte`
  (already supports a `snoozing` prop, defaulting to `false`; Reminders never passes it)
- Tab component call sites: `src/routes/leads/+page.svelte:96-108` (segmented-pill toolbar, zero
  ARIA) and `src/routes/leads/[id]/+page.svelte:427-459` (bordered `role="tablist"` pattern, has
  ARIA, no `.focus-ring`)
- Chip component call sites: `src/lib/components/calendar/CalendarEntry.svelte:22,32` (display-only
  badges) and `src/lib/components/meetings/MeetingFormModal.svelte:176-180` (interactive attendee
  toggle-chips, missing `aria-pressed`/`role="group"`)
- `src/routes/+page.svelte:20-21,65-94` (Today — reference pattern, read-only for this phase) and
  `src/routes/reminders/+page.svelte:31-50` (Reminders — write target for AC13)

---

## Implementation Checklist

### Step A — Remaining design-token sweep (Auth + Reports)

- [x] A1. Swap hardcoded hex/arbitrary-bracket values on `login/+page.svelte` (lines 40, 46, 53, 61,
      86, 96, 98, 109, 112, 118, 123, 125), `unauthorized/+page.svelte` (line 17), and
      `+error.svelte` (lines 21, 34, 43, 48) to the Phase 1 `--color-nav-*` token group already
      landed in `tokens.css` (lines 42-53) — CONFIRMED these Auth hex values are visually the SAME
      dark-espresso system as `--color-nav-*`, not a distinct visual system; do NOT create a new
      `--color-auth-*` token group. Additionally apply the existing `--color-focus-ring`/
      `.focus-ring` utility to the login form's input/button/links (currently zero focus-visible
      styling) and add `aria-invalid`/`aria-describedby` to the login error message (currently has
      none, unlike Phase 4's `FieldError` pattern on the other 3 forms) (AC8 — Auth pages slice).
- [x] A2. Swap hardcoded hex/arbitrary-bracket values in Reports components to `tokens.css`
      `@theme` values, explicitly scoped to visual-token usage only — do NOT touch chart-rendering
      logic owned by the two active chart-migration plans (cross-reference, do not duplicate or
      absorb). Exact hex-sweep targets: literal Tailwind arbitrary-hex classes at lines 240, 249,
      258, 364, 380. Card-vs-div component unification (Reports uses raw div-based cards, not the
      shadcn `Card` primitive Team page uses) is explicitly **OUT OF SCOPE** for this phase — this
      checklist only authorizes a literal hex/arbitrary-value token swap, not a card-component
      restructuring; do not silently expand scope here. Do NOT flag the dynamic
      `style="background:{f.color}"` usages at lines 328/335 as violations — they already resolve
      via `stageColor()` to existing `--color-stage-*` tokens and are out of scope for the
      grep-based sweep.
- [x] A3. Confirm via grep-based regression check: no hardcoded hex/arbitrary-bracket values remain
      in any file touched across this entire program (Nav/Topbar/Shell from Phase 1 + Auth/Reports
      from this phase). Manual visual review for sign-off (AC8's Hybrid strategy).

### Step B — Tab/chip unification

- [x] B1. Build ONE shared Tab component unifying the two existing patterns — the segmented-pill
      toolbar at `leads/+page.svelte:96-108` (zero ARIA) and the bordered `role="tablist"` pattern at
      `leads/[id]/+page.svelte:427-459` (correct ARIA, no `.focus-ring`). The shared component must
      carry correct ARIA semantics (`role="tablist"`/`role="tab"`/`aria-selected`) to BOTH call
      sites and use one consistent visual style (either existing visual language, or a blended one —
      EXECUTE's call, not a blocking decision here).
- [x] B2. Do NOT force calendar-entry display badges (`CalendarEntry.svelte:22,32`, non-interactive)
      and Meeting-modal attendee toggle-chips (`MeetingFormModal.svelte:176-180`, interactive)
      into one identical chip component — they have different interaction models. Instead define a
      shared Chip *visual/token contract* (spacing, radius, font-size — reuse existing tokens where
      possible) that both apply independently, and add `aria-pressed`/`role="group"` to the
      Meeting-modal attendee toggle-buttons specifically (a real accessibility gap independent of
      the visual-unification question). `StageChip.svelte` (Badge-based, display-only) is a
      reasonable visual reference but is NOT a required base — do not force-extend it if it doesn't
      fit.
- [x] B3. Code-level check confirming a single shared tab component is used at both prior tab call
      sites, and that both chip call sites conform to the shared Chip visual/token contract (AC9's
      proven-by requirement — token/visual unification, not forced component identity for chips).

### Step C — Theme F: Reminders/Today snooze alignment (AC13)

- [x] C1. Read `loading-ux_30-06-26`'s existing Reminders-snooze exclusion rationale before making
      any change.
- [x] C2. Align the Reminders-page Snooze button's optimistic/pending/rollback behavior UP to
      Today's pattern (Today's implementation is the more mature one per research) — this is an
      explicit SPEC AC13 decision, not a silent reversal. CONFIRMED exact gap: Today
      (`src/routes/+page.svelte:20-21,65-94`) has `snoozing` state, optimistic `shadowLeads` removal
      via `removeFromList()`, and per-lead rollback; Reminders (`src/routes/reminders/+page.svelte:
      31-50`) has none of this and never passes the `snoozing` prop to the shared
      `LeadListRow.svelte` component (which already supports it, defaulting to `false`). Replicate
      Today's exact pattern on Reminders.
- [x] C3. Update `loading-ux_30-06-26`'s plan file (or add a cross-reference note in its active
      plan) explicitly stating this phase's decision supersedes its prior Reminders exclusion, so
      the two plans stay reconciled rather than silently diverging. Cite `loading-ux_30-06-26`
      items **12 (Today)** and **19 (Reminders)** — NOT item 21 (an earlier research pass mistakenly
      cited item 21, which is unrelated).
- [x] C4. Verify the SAME `LeadListRow` snooze interaction produces the SAME loading/rollback
      behavior on both Today and Reminders pages (AC13's proven-by e2e scenario).

### Step D — Remaining per-component ARIA sweep

- [x] D1. Apply the focus-ring utility (from Phase 1) to remaining shared primitives not yet
      covered: `ui/button`, form inputs, calendar cells (Phase 1 only covered nav links + sign-out).
      Also apply `.focus-ring` to the new shared Tab component's tab buttons (Step B1) and to the
      login form controls (Step A1).
- [x] D2. Add `aria-live` announcement wiring for state-changing non-navigation actions across all
      surfaces touched by this program (e.g. claim-lead button, if not already covered by an
      earlier phase — confirm during RESEARCH to avoid duplicating Phase 3's calendar/pipeline ARIA
      work). Confirmed gap: Today's `LeadListRow` optimistic remove (`/`) has no `aria-live`.
- [x] D3. Run a final axe-core sweep across the definitive 12-route list below (program-wide
      closure, AC4/AC5's proven-by requirement). Each route note states what Phases 1-4 already
      landed (do not redo) vs. what this phase must still close:

      | Route | Prior-phase ARIA status | Remaining gap for this phase |
      |---|---|---|
      | `/` (Today) | none | `LeadListRow` optimistic remove has no `aria-live` |
      | `/leads` | none | segmented-pill toolbar (lines 96-108) has zero `role`/`aria-current`/ARIA |
      | `/leads/new` | Phase 4: `aria-invalid`/`aria-describedby`/`FieldError aria-live` landed | none — do not redo |
      | `/leads/[id]` | Phase 4 (via prior tablist): `role="tablist"`/`role="tab"`/`aria-selected` present | tab buttons need `.focus-ring` (closed by shared Tab component, Step B1/D1) |
      | `/unassigned` | none (missing from original enumeration) | claim/bulk-claim buttons have no ARIA labels — real gap |
      | `/pipeline` | Phase 3: `role="list"`/`role="listitem"`, `StageSelect` with `.focus-ring`+`aria-label` landed | none — do not redo |
      | `/calendar` | Phase 3: full `role="grid"/"row"/"columnheader"/"rowgroup"/"gridcell"` + empty-state landed | none — do not redo |
      | `/meetings/[id]` | none (missing from original enumeration); Phase 4 wired `fieldErrors` on `leadId`/`startAt` | attendee chip-group toggle buttons need `aria-pressed`/`role="group"` (closed by Step B2) |
      | `/team` | none (missing from original enumeration); Phase 4 wired `fieldErrors` | none further — do not redo |
      | `/reminders` | none | see Step C snooze-alignment work; general ARIA sweep otherwise clean-slate |
      | `/reports` | Phase 3: heatmap overflow/keyboard-tooltip fixed | rest of page (cards, funnel, leaderboard) untouched — sweep for name/role/focus-visible |
      | `/login`, `/unauthorized`, global `+error.svelte` | none | this phase's own direct responsibility (Step A1) — zero prior ARIA work |

      Do not treat "Leads"/"Forms"/"Calendar" as already covering `/unassigned`, `/team`, or
      `/meetings/[id]` — sweep them explicitly per the table above.

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
- Program-wide axe-core sweep records zero critical/serious violations across all 12 routes in the
  D3 table
- `loading-ux_30-06-26` plan updated with the AC13 supersession cross-reference citing items 12 and
  19 (not silently diverging)
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

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [x] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note written (02-07-26)
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: CONDITIONAL, 02-07-26 (outer-pvl, accepted — 1 concern: ARIA-sweep route enumeration missing 3 routes, resolved via Execute-Agent Instruction E1; no plan-text supplement needed)**
- [x] 5. EXECUTE — all checklist items done (A1-A3, B1-B3, C1-C4, D1-D3); check 0 errors, unit 313/0 regressions, corrected AC8 grep clean (documented exceptions only), lint clean; AC13 e2e + axe sweep self-skip (pre-accepted auth-fixture known-gap). E4 (Tab non-regression) + E5 (corrected grep target + legend-map decision) satisfied. See phase-05-token-sweep_REPORT_02-07-26.md (02-07-26)
- [x] 6. EVL — orchestrator-run confirmation independent of execute-agent: typecheck PASS, unit 313/313 PASS, corrected AC8 grep PASS, E4/E5 hard requirements independently re-verified true via direct code read, Reminders/Today snooze parity confirmed, `git diff --stat` matches blast radius, e2e self-skips cleanly on pre-accepted known-gap, Phase 1-4 artifacts confirmed still present (no cross-phase regression, program-wide check since this is the final phase). No follow-up fix cycle required. See phase-05-token-sweep_REPORT_02-07-26.md "EVL Confirmation" section (02-07-26)
- [x] 7. UPDATE PROCESS — phase report finalized (EVL Confirmation section added), phase-blast-radius-registry.md Phase 5 marked DONE, umbrella `## Current Execution State` rewritten to program-complete, whole 5-phase program archived active/ → completed/, all-context.md updated. Commit NOT created by this agent — recommended to orchestrator/user (see closeout packet) (02-07-26)

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

**Note:** this Inner Loop Refresh Note (02-07-26) is dated AFTER the existing validate-contract
(also 02-07-26 but recorded ahead of this supplement in the loop sequence) — per orchestration
routing, a newer Inner Loop Refresh Note triggers a fresh PVL pass from V1 before EXECUTE proceeds.

---

## Touchpoints

- `src/routes/login/+page.svelte`, `src/routes/unauthorized/+page.svelte`, `src/routes/+error.svelte`
- `src/lib/components/reports/*` (token-swap scope only; card-vs-div restructuring explicitly out of scope)
- `src/lib/components/leads/LeadListRow.svelte` (Reminders/Today snooze-button component — confirmed path)
- Tab component call sites: `src/routes/leads/+page.svelte`, `src/routes/leads/[id]/+page.svelte`
- Chip component call sites: `src/lib/components/calendar/CalendarEntry.svelte`,
  `src/lib/components/meetings/MeetingFormModal.svelte`
- `src/routes/+page.svelte` (Today, reference-only), `src/routes/reminders/+page.svelte` (write target)
- `process/features/loading-ux/active/loading-ux_30-06-26/` (cross-reference update, not
  execution scope)

---

## Public Contracts

- No schema, auth, or API contract changes.
- No chart-rendering logic changes in Reports — token/visual swap only, chart-library migration
  scope stays with `reports-echarts-review-queue_29-06-26` / `reports-shadcn-chart-migration_30-06-26`.
  Card-vs-div component restructuring is out of scope for this phase.
- `LeadListRow`'s external prop interface unchanged — only its internal Reminders-page wiring is
  aligned to Today's existing behavior (passing/using the existing `snoozing` prop).
- New shared Tab component's public interface: `role="tablist"`/`role="tab"`/`aria-selected` +
  `.focus-ring`, used at both `leads/+page.svelte` and `leads/[id]/+page.svelte` call sites. No new
  shared Chip component is introduced — only a shared token/visual contract applied independently
  at each existing chip call site.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Grep-based regression check: no hardcoded hex/arbitrary-bracket values in Auth/Reports files + manual visual review | Hybrid | AC8 |
| Code-level check: single shared tab component used at both prior tab call sites + shared chip token/visual contract applied at both chip call sites + visual regression review | Hybrid | AC9 |
| Playwright scenario: same LeadListRow snooze interaction produces same loading/rollback behavior on Today and Reminders | Fully-Automated | AC13 |
| Program-wide axe-core sweep across the definitive 12-route list (Step D3 table) | Fully-Automated | AC4, AC5 |

```bash
bun run test:e2e -- reminders-snooze-alignment.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_PLAN_02-07-26.md`
- Last completed step: PLAN-SUPPLEMENT (Step 3) — Inner Loop Refresh Note written 02-07-26, folding
  RESEARCH findings into the checklist; existing validate-contract (Gate: CONDITIONAL, 02-07-26)
  predates this supplement and per orchestration routing requires a fresh PVL pass from V1 before EXECUTE.
- Validate-contract status: written (02-07-26) — CONDITIONAL; supersession by fresh PVL pass pending
  due to newer Inner Loop Refresh Note
- Next step: Spawn vc-validate-agent for a fresh PVL pass from V1 (Step 4) — must confirm Phases 1-4
  are all at their exit gates before this phase begins EXECUTE

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

---

## Validate Contract — Cycle 2 (Inner Loop Re-Validate, post Refresh Note)

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — Cycle 2 has current evidence following the 02-07-26 `## Inner Loop Refresh Note` (Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT). Cycle 1 text above is preserved verbatim for audit history and is NOT overwritten — this plan uses an append-only validate-contract convention across cycles.

Trigger: `## Inner Loop Refresh Note` (02-07-26) dated after the Cycle 1 contract (02-07-26, same day, recorded earlier in the loop sequence) — per V1 Step 4, a newer Inner Loop Refresh Note mandates a fresh PVL pass from V1 before EXECUTE. V1 structural checks re-run below; V2 fan-out re-run scoped to the 5 changed items plus one newly-discovered item found during this pass (Item 6).

Parallel strategy: sequential
Rationale: signal score unchanged at 1/7 (S7 only — 6+ distinct blast-radius files). The Refresh Note narrows/clarifies items 1, 2, 3, 5 and confirms one net-new but single-surface deliverable (shared Tab component, item 4) — none of this adds a package, schema/auth/API surface, or high-risk class. Sequential single vc-execute-agent (opus) remains the correct fit, same as Cycle 1.

### V1 structural re-check (this cycle)

- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs` re-run: same 4 FAILs / 4 warnings as Cycle 1 baseline (missing overview/Complexity/Phase-Completion-Rules/Acceptance-Criteria headings). **Not a regression** — identical failure signature confirmed present on Phases 1-4's plans too (2-4 failures each, same categories), i.e. this is a systemic mismatch between the standalone SIMPLE/COMPLEX plan schema the validator checks for and this program's phase-plan schema (Purpose/Entry Gate/Blast Radius/Implementation Checklist/Exit Gate/Blockers/Phase Loop Progress), not something this cycle introduced or can fix by editing this one file. Carried as a non-blocking systemic note, consistent with how Phases 1-4 passed PVL/EVL despite the same signature.
- `vc-scout`-equivalent path check: every path in Blast Radius, Touchpoints, and the D3 route table was independently verified to exist on disk this cycle (see V2 Section findings below) — all resolve except one gap found in Section A (see Item 6).
- Dependency-BLOCKED guard: `phase-blast-radius-registry.md` has zero `status: BLOCKED-skipped` entries — no dependency gate issue.
- Umbrella check: `## Stable Program Goal` confirmed present in the umbrella plan → BRANCH B — no `## Autonomous Goal Block` write required to this phase plan.

### Assessment of the 5 Refresh Note items — does Item 4 (new Tab component) warrant a fuller re-check?

**Call: yes for Item 4, specifically — light re-confirm for Items 1/2/3/5.** Items 1, 2, 3, and 5 are clarifications, a locked decision, a scope narrowing, and a citation fix respectively — none of them change what files are touched or introduce a new component; they were re-confirmed by direct file inspection (12-route table cross-checked against `find`/`grep` on every named route file — all 12 exist; `--color-nav-*` token group confirmed at `tokens.css` lines 42-53 from Cycle 1's own citation, unchanged; Reports exclusion note is a narrowing, verified no new files added; `loading-ux_30-06-26` citation correction is textual only). These close cleanly with no new risk.

Item 4 is different in kind: a **new shared component**, not a token/text change, touching 2 live, already-shipped pages (`leads/+page.svelte`, `leads/[id]/+page.svelte`). That crosses from "sweep/align existing surface" into "introduce shared abstraction that both pages must render through" — worth the fuller check. Findings from that check:

- **Mechanical feasibility: PASS, and this closes Cycle 1's own C2 concern.** Both call sites now have exact, verified line ranges: `leads/+page.svelte` segmented-pill toolbar confirmed at lines 96-108 (`segDefs`/`setSegment`, zero `role`/ARIA attributes present on the buttons — confirmed by direct read); `leads/[id]/+page.svelte` bordered tablist confirmed at line 427+ (`role="tablist"`, `role="tab"`, `aria-selected` all present — confirmed by direct grep). Cycle 1 Section B flagged this exact gap ("plan does not yet name the exact second tab implementation") as a CONCERN requiring RESEARCH to resolve before B1/B2 execute — **RESOLVED** this cycle.
- **Regression risk to existing behavior/tests: CONCERN (new, narrower than Cycle 1's).** Searched the test suite (`src/tests/*.spec.ts`, `e2e/*.e2e.ts`) for any test that exercises either call site's tab markup or interaction: `src/tests/leads-filters.spec.ts` tests the **server-side segment query/filter logic** only (`segment: 'all' | 'mine' | 'lost'` as a data-layer parameter) — it does not click the toolbar or assert on DOM/ARIA. No `e2e/*.e2e.ts` file references `tablist`, `role="tab"`, `segDefs`, `setSegment`, or `activeTab`. **Confirmed: zero existing automated tests would catch a functional regression** (e.g. losing click-to-filter wiring on the segmented toolbar, or losing keyboard arrow-key/Home/End navigation and `aria-selected` state updates on the bordered tablist) if the new shared Tab component changes behavior while looking visually correct.
- This is not blocking because: (a) the plan's own Blockers section already names the exact right escalation valve for a *behavioral* divergence between the two patterns (route back to INNOVATE) — that safety net exists independent of this finding; (b) AC9's test gate is already Hybrid (human-reviewed), just under-scoped to "visual regression review" only. The fix is to widen what the Hybrid reviewer checks, not to add new plan text or reopen PLAN-SUPPLEMENT.
- **Resolution:** Execute-Agent Instruction E4 (below) — expand AC9's Hybrid check from visual-only to include an explicit functional/keyboard-interaction parity pass on both patterns, with the result recorded in the phase report.

### Item 6 (newly discovered this cycle, not in the Refresh Note's own summary) — Reports hex-sweep target file mismatch

Independent verification of A2's cited exact line numbers (240, 249, 258, 364, 380) turned up a real plan-accuracy gap: those line numbers do **not** exist in `src/lib/components/reports/*` (the Blast Radius's named target — `CalendarHeatmap.svelte` is 268 lines, `MonthCalendar.svelte` is 261 lines; line 364/380 cannot exist in either). They **do** exist, with real hex values, in `src/routes/reports/+page.svelte` (459 lines) — confirmed by direct read: line 240 (`bg-[#fdf3f2]`), line 364 (`bg-[#6366f1]`), line 380 (`bg-[#22c55e]/15` / `text-[#16a34a]`), etc. This file is the "cards, funnel, leaderboard" surface the plan's own D3 table refers to under `/reports` — but it is **not listed** in either the Blast Radius or Touchpoints sections, and critically, the **A3/AC8 grep-regression exit-gate command only scans `src/lib/components/reports`**, not `src/routes/reports`. As written, that command would report a false "0 matches" pass regardless of whether A2's actual target hex values were ever swapped, because it never looks in the file that contains them. Separately, `src/lib/components/reports/*` (the file actually named in Blast Radius) also has its own real hex values (`CalendarHeatmap.svelte:37-42`, a stage-color legend map) that A2's line-number list does not mention at all — so A2 currently conflates two different files under one "Reports components" label.

This is the same *class* of gap as Cycle 1's E1 (an incomplete file/route enumeration that would silently narrow the proven scope) — resolved the same way: an Execute-Agent Instruction, not a plan-text edit or a new supplement cycle.

### Layer 1 dimensions

| Layer 1 dimensions | Status | Change from Cycle 1 |
|---|---|---|
| Infra fit | PASS | unchanged |
| Test coverage | CONCERN | unchanged in verdict, but re-scoped: Cycle 1's AC13/axe-route concern is now resolved by the Refresh Note (see Section D below); the CONCERN carries forward via two new/narrower findings — Item 4's Tab-component test-coverage gap (E4) and Item 6's Reports grep-target mismatch (E5) |
| Breaking changes | PASS | unchanged — Public Contracts section's new-Tab-component interface description matches what was actually built into the plan |
| Security surface | PASS | unchanged |

### Layer 2 sections

| Layer 2 sections | Status | Change from Cycle 1 |
|---|---|---|
| Section A — Auth+Reports token sweep | CONCERN | **downgraded from PASS** — Item 6 above (Reports file/line mismatch); Auth-page portion (A1) still PASS, confirmed against `--color-nav-*` tokens and the login-form focus-ring/aria-invalid gaps |
| Section B — Tab/chip unification | CONCERN | narrowed — Cycle 1's "exact call sites unknown" concern (C2) is RESOLVED; new narrower concern is the Item-4 test-coverage gap, resolved via E4 |
| Section C — Theme F / AC13 | PASS | unchanged — still the strongest section; citation correction (item 5) verified accurate against `loading-ux_30-06-26` |
| Section D — ARIA sweep | **PASS (upgraded from CONCERN)** | Cycle 1's E1 concern (theme-grouped, incomplete route list) is closed — the Refresh Note's 12-route table was independently verified: all 12 route files exist on disk, and the 3 previously-missing routes (`/unassigned`, `/team`, `/meetings/[id]`) are now explicitly present with accurate prior-phase-status notes |

**Totals: 0 FAILs / 3 CONCERNs (Test coverage, Section A, Section B) / 5 PASSes (Infra fit, Breaking changes, Security surface, Section C, Section D)**

**→ Net Gate: CONDITIONAL** — same tier as Cycle 1. No FAILs. All 3 CONCERNs resolved via execute-agent instructions (E4, E5 — new; E1/E2/E3 carried from Cycle 1, E1/E2 now substantially satisfied by the Refresh Note's own content, E3 still open as a minor RESEARCH-time citation-confirmation task). No plan-text supplement required; no further PVL cycle required before EXECUTE.

Test gates (C3 5-column table — carries forward Cycle 1's 4 rows; gap-resolution notes updated):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC8 | No hardcoded hex/arbitrary-bracket values remain on Auth pages + Reports (program-wide) | Hybrid | `grep -rn "#[0-9a-fA-F]\{3,8\}" src/routes/login src/routes/unauthorized src/routes/+error.svelte src/lib/components/reports src/routes/reports/+page.svelte src/lib/components/layout` (path corrected per E5 — adds `src/routes/reports/+page.svelte`) exits with no unexpected matches + manual visual review | B (Step A3, contingent on E5) |
| AC9 | Tab and chip visual patterns unified into one shared implementation each, used at all prior call sites, with interaction behavior preserved | Hybrid | Code-level check: single shared tab import at `leads/+page.svelte` + `leads/[id]/+page.svelte` + single shared chip token/visual contract at both chip call sites + visual regression review + **functional/keyboard-interaction parity check (per E4)** | B (Step B3, contingent on E4) |
| AC13 | Reminders-page Snooze button produces the same loading/rollback behavior as Today's | Fully-Automated | `bun run test:e2e -- reminders-snooze-alignment.e2e.ts` | B (Step C4) — same pre-accepted self-skip pattern as Cycle 1 |
| AC4, AC5 | Zero critical/serious axe-core violations across every route touched by Phases 1-4 | Fully-Automated | axe-core sweep (Playwright) against the now-definitive 12-route list (Step D3 table — independently verified complete this cycle) | A (proven now — route list is closed, no longer contingent on an execute-agent instruction) |

Known Gaps: unchanged from Cycle 1 — AC13 e2e self-skip via `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`, excluded from CONCERN/FAIL count per umbrella tolerance.

Failing stubs: unchanged from Cycle 1 (AC13, AC4/AC5 stubs above still apply — not repeated here).

Dimension findings:
- Infra fit: PASS — re-confirmed this cycle: every Blast Radius / Touchpoints file exists on disk, including the 3 previously-unverified D3 route files (`src/routes/unassigned/+page.svelte`, `src/routes/team/+page.svelte`, `src/routes/meetings/[id]/+page.svelte`).
- Test coverage: CONCERN — resolved-and-replaced: Cycle 1's axe-route-enumeration concern is closed (Section D now PASS); two new/narrower concerns take its place — Item 4 (Tab-component interaction coverage, E4) and Item 6 (Reports grep-target mismatch, E5). Neither is a FAIL; both are Hybrid gates that need their scope corrected, not new automated infrastructure.
- Breaking changes: PASS — unchanged.
- Security surface: PASS — unchanged.
- Section A (Auth+Reports token sweep) feasibility: CONCERN (downgraded from Cycle 1's PASS) — see Item 6. Auth-page sub-scope (A1) remains PASS on its own.
- Section B (Tab/chip unification) feasibility: CONCERN (narrowed from Cycle 1) — mechanical call-site question is now closed; remaining concern is test-coverage for the new shared component, per the risk assessment above and E4.
- Section C (Theme F / AC13) feasibility: PASS — unchanged, still the strongest section.
- Section D (ARIA sweep) feasibility: PASS (upgraded from Cycle 1's CONCERN) — the 12-route table closes Cycle 1's E1 concern; independently re-verified complete and accurate against the actual route tree.

Execute-agent instructions:
- E1, E2, E3 (carried from Cycle 1): E1's substance is now satisfied by the Refresh Note's own 12-route table — execute-agent should treat the plan's D3 table as authoritative and does not need to re-derive it, but should still record the final swept-route list in the phase report per E1's original intent. E2 is now satisfied by the Refresh Note's confirmed exact call sites — no further RESEARCH needed for *which* files, only for confirming no behavioral divergence exists once B1/B2 are underway. E3 remains open as originally worded (confirm the exact source note in `loading-ux_30-06-26` before writing the C3 cross-reference).
- E4 (Step B1/B3 entry — REQUIRED, new this cycle): Because the new shared Tab component touches 2 live pages with zero existing automated interaction-test coverage (confirmed: `leads-filters.spec.ts` tests only server-side segment filtering; no e2e file exercises either call site's markup), expand AC9's Hybrid "visual regression review" to explicitly include a functional/keyboard-interaction parity check covering both prior patterns: (a) click-to-filter on the leads-list segmented toolbar still updates `data.filters.segment` correctly, and (b) keyboard navigation (arrow keys / Home / End) and `aria-selected` state changes on the lead-detail tablist still work post-refactor. Record this check's result explicitly in the phase report as its own line item — do not fold it silently into the general visual-review note.
- E5 (Step A2/A3 entry — REQUIRED, new this cycle): `src/routes/reports/+page.svelte` (not currently listed in Blast Radius or Touchpoints) is the actual file containing A2's cited hex values at lines 240, 249, 258, 364, 380 — treat it as an in-scope target file for this phase's Reports token-sweep work. Correct the A3/AC8 grep-regression command to scan `src/routes/reports/+page.svelte` in addition to `src/lib/components/reports` (the two are different files with different hex values — `src/lib/components/reports/CalendarHeatmap.svelte:37-42` has its own separate stage-color legend map that A2's line list does not mention). Decide during EXECUTE whether that legend map is in-scope for tokenization or is an intentional categorical-color exception (like the `stageColor()` case already excluded in A2); document the decision either way in the phase report — do not silently skip it.

Backlog artifacts: none new.

Open gaps: none blocking. Residual: E4 and E5 are both execute-agent-instruction-resolved, no plan-text edit or further supplement cycle required.

What this coverage does NOT prove:
- Everything from Cycle 1's "What this coverage does NOT prove" section still applies unchanged.
- Additionally (new this cycle): the corrected AC8 grep command (per E5) proves no literal hex/bracket matches remain in the now-complete file list — it does NOT prove the `CalendarHeatmap.svelte` legend-map colors were correctly decided one way or the other (tokenized vs. intentionally excluded) — that decision itself is not mechanically verifiable and depends on the phase-report note E5 requires.
- The E4 functional/keyboard-parity check is a manual (Agent-Probe-equivalent, folded into the existing Hybrid gate) judgment call — it does NOT constitute a new automated regression test; a future automated Playwright interaction test for both tab patterns remains a real, undocumented gap beyond this phase's scope (not escalated to a formal known-gap/backlog artifact this cycle, since the manual check is judged sufficient for this phase's exit bar — noted here for transparency only).

Gate: CONDITIONAL (0 FAILs; 3 CONCERNs, all resolved via execute-agent instructions E4/E5 plus carried E1-E3; no plan-text supplement or further PVL cycle required before EXECUTE)
Accepted by: session (inner-loop re-validate pass, 02-07-26, generated-by: outer-pvl per orchestrator instruction). Accepted concerns by name: Section-A-reports-file-mismatch (resolved via E5), Section-B-tab-component-test-coverage (resolved via E4), Test-coverage-carried-concern (resolved via E4+E5, replacing Cycle 1's now-closed axe-route-enumeration concern).
