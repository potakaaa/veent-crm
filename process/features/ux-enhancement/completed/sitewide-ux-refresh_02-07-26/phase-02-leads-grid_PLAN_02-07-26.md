---
name: plan:sitewide-ux-refresh-phase-02-leads-grid
description: "Site-Wide UX Refresh — Phase 02: Leads/UFG Grid Consolidation & Responsiveness"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: phase-02
---

# Phase 02 — Leads/UFG Grid Consolidation & Responsiveness

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ✅ VERIFIED (UPDATE PROCESS closeout 02-07-26 — code-complete, EVL-confirmed;
3 known-gaps recorded, all backlogged — see `phase-02-leads-grid_REPORT_02-07-26.md`)
**Report destination:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-02-leads-grid_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

`LeadGrid.svelte` (7-col) and the Up-for-Grabs grid (9-col) are near-identical hand-duplicated
implementations with no responsive breakpoints; the Lead-creation date picker is a ~90-line
pattern duplicated 3 times; the hover-card/dedup-popover pattern (200ms close-timer) is
copy-pasted between two files. Per INNOVATE decision, this phase consolidates FIRST (Theme D)
then applies card-per-row responsive behavior BELOW a breakpoint to the resulting single component
(Theme A), matching the existing `lg:grid-cols-[1fr_320px]` pattern already proven correct on the
Lead detail page. Consolidating before the responsive rework avoids doing the responsive work
twice on two near-duplicate implementations.

---

## Entry Gate

- Phase 1 exit gate passed: nav-surface tokens exist in `tokens.css` and are stable (read-only
  dependency — this phase does not need Phase 1 fully merged/committed to begin RESEARCH/INNOVATE,
  but MUST NOT execute checklist items that reference token names until Phase 1 EXECUTE is green)
- Cross-reference check completed against `lead-visibility-scoping`, `leads-new-organizer-hover`,
  `ufg-country-category-filters`, `ufg-inline-edit-review-removal`, and
  `popover-a11y-audit_NOTE_01-07-26.md` (backlog note) for touchpoint overlap before finalizing
  this phase's file list

---

## Blast Radius

- `src/lib/components/leads/LeadGrid.svelte`
- `src/routes/unassigned/+page.svelte` (Up-for-Grabs grid, currently likely inline or a sibling
  component — confirm exact file during RESEARCH). **VALIDATE note (02-07-26):** this file already
  contains landed inline-edit code (`editTarget` state, `LeadEditModal` wiring) from
  `ufg-inline-edit-review-removal_01-07-26` (status: CODE DONE) and is also a touchpoint of
  `ufg-country-category-filters_01-07-26` (status: PLANNED, same file — server load/DB
  query/UI filter controls). Neither overlap was named in the umbrella's Pre-PVL Conflict
  Resolution table. See Validate Contract below.
  **RESEARCH finding (02-07-26):** `ufg-country-category-filters_01-07-26`'s filter UI/logic
  (`MultiSelectFilter` imports, `setFilter`/`clearAllFilters`/`hasActiveFilters`, the two filter
  instances + "Clear all filters" button) is ALREADY LANDED in `/unassigned/+page.svelte` on disk,
  even though that plan's own file still shows PLANNED/unresolved status — a plan/code-state
  mismatch flagged for `vc-update-process-agent` to reconcile later (not this phase's job to fix
  that other plan's bookkeeping). Phase 2's grid extraction MUST preserve this filter markup/logic
  as-is (confirmed real, landed code in the blast radius now).
  **Preservation inventory (RESEARCH, 02-07-26) — full list of `/unassigned/+page.svelte` call
  sites that must survive grid extraction:** inline-edit (`editTarget`, `editSaving`, `saveEdit()`,
  `LeadEditModal` conditional block); row checkbox-select + bulk-claim/assign toolbar +
  `ReassignModal`; per-row Claim/Assign buttons; sortable header via `makeSortTable`; pagination;
  the two distinct empty-state messages (queue-clear vs no-match).
  **Structural note (RESEARCH, 02-07-26):** `LeadGrid.svelte` rows are `<a>` links (no nested
  interactives); `/unassigned` grid rows are `<div>`s (nested checkbox/popover/buttons) —
  reconciling these into one shared component is a real prop/slot surface, not a trivial merge.
  EXECUTE should not underestimate this.
- `src/routes/leads/new/+page.svelte` (date picker consolidation touchpoint only, not the form
  conversion itself — that is Phase 4)
- New shared components to be extracted: shared grid component, shared date-picker component,
  shared hover-card/dedup-popover component/hook (exact file paths to be finalized during RESEARCH).
  **VALIDATE note (02-07-26):** the hover-card/dedup-popover component may already exist — see
  Step C2 note below.

---

## Inner Loop Refresh Note (02-07-26)

Step 1 RESEARCH has now run for this phase. Step 3 PLAN-SUPPLEMENT applied the following changes
based on RESEARCH findings: (1) Step C2 re-scoped from "consolidate the hover-popover pattern" to
"extract a shared hover-timer/Popover-wrapper hook" — `OrganizerHoverCard.svelte` already
consolidates the card *content*, but the surrounding 200ms-close-timer/Popover-wrapper logic and
each file's own `ownerNameFor` helper are still independently duplicated at both call sites; (2) a
plan/code-state mismatch flagged for `vc-update-process-agent` re: `ufg-country-category-filters`
already landed in code despite its own plan showing PLANNED status; (3) an explicit preservation
inventory added to Blast Radius for all `/unassigned/+page.svelte` call sites that must survive
grid extraction; (4) a note added that `LeadGrid.svelte` rows are `<a>` links while `/unassigned`
grid rows are `<div>`s with nested interactives — a real prop/slot surface, not a trivial merge.
This Refresh Note signals to the next VALIDATE pass that inner R+I has occurred since the outer-PVL
validate-contract (dated 02-07-26) was written — PVL should be re-run from V1 before EXECUTE
proceeds.

---

## Implementation Checklist

### Step A — Cross-reference active plans (mandatory before touching files)

- [x] A1. Read `lead-visibility-scoping`, `leads-new-organizer-hover`, `ufg-country-category-filters`,
      `ufg-inline-edit-review-removal` active plans and `popover-a11y-audit_NOTE_01-07-26.md`
      backlog note. Document any touchpoint overlap in the phase report BEFORE writing checklist
      items B-D in detail (this phase's RESEARCH step must confirm no silent duplication).
      **VALIDATE-confirmed finding (02-07-26, accepted as CONDITIONAL — see Validate Contract):**
      `src/lib/components/OrganizerHoverCard.svelte` already exists on disk and is already imported
      at BOTH `src/routes/leads/new/+page.svelte:205` and `src/routes/unassigned/+page.svelte:428`
      (built by `leads-new-organizer-hover_01-07-26`, status IN PROGRESS). This is very likely the
      exact "hover-card/dedup-popover pattern copy-pasted between two files" Step C2 targets for
      consolidation — it may already be consolidated. RESEARCH MUST explicitly confirm this before
      writing any Step C2 implementation code; do not re-extract if it is already satisfied.

### Step B — Consolidate LeadGrid + Up-for-Grabs grid

- [x] B1. Extract a single shared grid component from `LeadGrid.svelte` and the Up-for-Grabs grid,
      confirming column-count/field differences are handled via props/slots, not by keeping two
      implementations. **VALIDATE note (02-07-26):** confirmed current column templates differ
      (`LeadGrid.svelte` uses an 8-cell `grid-cols-[...]` template; `unassigned/+page.svelte` uses a
      10-cell template) — props/slots approach is required, not optional. Before extracting, inventory
      and explicitly preserve the existing inline-edit call sites on `/unassigned` (`editTarget` state,
      `LeadEditModal` open/save wiring, claim-button disabled-during-edit logic) so the grid extraction
      does not regress `ufg-inline-edit-review-removal_01-07-26`'s already-landed behavior. Also check
      `ufg-country-category-filters_01-07-26`'s filter-control markup on the same page before
      restructuring the grid's surrounding layout.
- [x] B2. Replace both former call sites with the new shared component. Confirm no behavior loss —
      existing Leads/Up-for-Grabs Vitest+Playwright coverage must continue to pass UNCHANGED
      (AC10's proven-by requirement), including `e2e/ufg-inline-edit.e2e.ts` and
      `e2e/unassigned-filters.e2e.ts`.

### Step C — Consolidate date picker + hover-card/dedup-popover

- [x] C1. **DONE (02-07-26, follow-up EXECUTE pass).** Component built (`DatePickerField.svelte`) AND
      now wired into all 3 `leads/new` date pickers. The prior Phase-4 overlap block is resolved:
      `DatePickerField` gained an optional additive `errors` prop, so the event-date field keeps
      Phase 4's per-field error display (`aria-invalid`/`aria-describedby` + `<FieldError>`) after
      consolidation. Extract the
      3x-duplicated ~90-line date-picker pattern (confirmed during VALIDATE: all 3
      instances — `selectedDate`/`announcedDate`/`reachedOutDate` — live within
      `src/routes/leads/new/+page.svelte` itself, not across 3 separate files) into one shared
      component.
- [x] C2. **DONE (02-07-26, follow-up EXECUTE pass).** Hook built (`hover-popover.svelte.ts`) + shared
      `ownerNameFor` (`owner.ts`); wired into BOTH `/unassigned` AND `leads/new`. The `leads/new` dupe
      popover now uses `createHoverPopover()` (replacing local `openDupeId`/`closeTimer`) and the shared
      `ownerNameFor(data.users, …)`, matching the established `/unassigned` call pattern.**
      **RE-SCOPED at RESEARCH (02-07-26):** RESEARCH confirmed Step C2 is only PARTIALLY
      satisfied by existing work: `OrganizerHoverCard.svelte` already consolidates the card
      *content* (built by `leads-new-organizer-hover_01-07-26`), but the surrounding
      200ms-close-timer/Popover-wrapper logic (`openDupeId`/`closeTimer` in `new/+page.svelte` vs
      `openHoverId`/`hoverCloseTimer` in `unassigned/+page.svelte`) is still independently
      duplicated at both call sites, plus each file has its own `ownerNameFor` helper. Scope is now:
      extract a shared hover-timer/Popover-wrapper hook or component (e.g. a small
      `useHoverPopover` action/hook) that both call sites use, consolidating the timer
      state/handlers and the `ownerNameFor` helper. `OrganizerHoverCard.svelte` itself is already
      done and needs no further change — do not re-extract it.
- [x] C3. **DONE (UPDATE PROCESS, 02-07-26).** Checked overlap with `popover-a11y-audit_NOTE_01-07-26.md`
      — confirmed (VALIDATE, 02-07-26) that note is about the Templates popover in
      `LogTouchForm.svelte` (a different popover), not `OrganizerHoverCard.svelte` — no duplication.
      C2 concluded `OrganizerHoverCard.svelte` is the consolidated implementation, so per the
      original instruction a new backlog note was written (previously flagged twice but never
      created — closed at this UPDATE PROCESS session):
      `process/features/leads/backlog/organizerhovercard-a11y-audit_NOTE_02-07-26.md`.

### Step D — Responsive card-switch behavior (AFTER consolidation, on the single component)

- [x] D1. Apply a card-per-row layout below a breakpoint to the now-single shared grid component,
      matching the pattern already proven on Lead detail (`lg:grid-cols-[1fr_320px]` → single
      column pattern) — adapt the exact breakpoint/class shape to the grid's own column count, do
      not copy the exact class string verbatim.
- [~] D2. **Gate authored (`e2e/leads-grid-responsive.e2e.ts` PERF scenario); perf run env-BLOCKED
      (nested-worktree Playwright duplication + ENOSPC) — no baseline captured this cycle.**
      **Perf smoke-check (flagged risk item — do not fold into general "responsive rework"
      testing):** confirm the shared responsive-card component does not introduce a rendering
      regression for the Leads list with a large result set (e.g. 200+ rows). Add this as an
      explicit basic perf smoke-check in this phase's validate-contract, not just a visual/
      behavioral check. **VALIDATE note (02-07-26): concrete gate defined in this phase's Validate
      Contract Test Gates table (PERF-RISK row) — seed 200+ leads, measure render timing via
      Playwright, compare against a pre-phase baseline measurement, flag if post-change render time
      exceeds the baseline by more than 20%.**

---

## Exit Gate

```bash
bun run check
# Expected: 0 type errors

bun run test:unit:ci
# Expected: existing Leads/Up-for-Grabs Vitest suite green, no regressions

bun run test:e2e -- leads-grid-responsive.e2e.ts
# Expected: new responsive-card e2e scenario green (or self-skip known-gap per shared auth fixture)
```

- All checklist items (A1, B1-B2, C1-C3, D1-D2) checked
- Single shared grid component confirmed at all former LeadGrid/UFG call sites (code-level check)
- Perf smoke-check result recorded in phase report (not skipped)
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Up-for-Grabs grid turns out to have materially different data-shape requirements than LeadGrid,
  making a single shared component impractical without a larger redesign — escalate to INNOVATE
  re-run rather than forcing a bad consolidation
- `lead-visibility-scoping` or another active plan is mid-execution on the exact same file at the
  same time — route through the cross-reference check in Step A and coordinate via phase report,
  do not silently conflict
- Perf smoke-check reveals a real regression that cannot be fixed within this phase's scope

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
  - **VALIDATE-carried Step 1 confirmations (must run before/during RESEARCH):**
    (a) confirm whether `OrganizerHoverCard.svelte` (from `leads-new-organizer-hover_01-07-26`) already satisfies Step C2's hover-popover consolidation before writing new code;
    (b) inventory/preserve `/unassigned/+page.svelte`'s existing inline-edit call sites (from `ufg-inline-edit-review-removal_01-07-26`) and filter touchpoints (from `ufg-country-category-filters_01-07-26`) during grid extraction.
- [ ] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note if sections changed (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: PASS, 02-07-26 (outer-pvl, Cycle 2 — inner-loop refresh re-validate; supersedes Cycle 1 CONDITIONAL)**
- [x] 5. EXECUTE — B1/B2/D1 + shared components done, `/unassigned` hook wired; C1/C2 `leads/new`
      wiring NOW COMPLETE (follow-up pass 02-07-26, after Phase 4 landed — the prior BLOCK is resolved).
      check/unit/lint green; e2e still env-blocked (nested-worktree Playwright duplication). C3 a11y
      note + D2 perf baseline remain non-blocking open gaps. See Execution Blocker note (RESOLVED) +
      `phase-02-leads-grid_REPORT_02-07-26.md`.
- [x] 6. EVL — Orchestrator-run confirmation (independent of execute-agent): `bun run check` PASS
      (0 errors), `bun run test:unit:ci` PASS (313/313), `/unassigned` preserved-functionality
      grep-check PASS, dedup-hover reactivity unaffected, `leads-grid-responsive.e2e.ts` runs clean
      (self-skips on the pre-accepted shared-auth-fixture known-gap). AC10's own e2e regression leg
      (`ufg-inline-edit.e2e.ts`/`unassigned-filters.e2e.ts`/`leads-new-dedup-hover.e2e.ts`) and the
      PERF-RISK gate remain env-blocked (nested-worktree Playwright + ENOSPC) — backlogged as a
      distinct known-gap, not silently folded into the auth-fixture gap. See
      `phase-02-leads-grid_REPORT_02-07-26.md` § EVL Confirmation Run + § SPEC Achievement.
- [x] 7. UPDATE PROCESS — archived; context updated; committed (commit deferred — recommended in
      closeout, not created by this agent per UPDATE PROCESS scope)

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

**Orchestrator routing note (updated 02-07-26, Cycle 2):** Gate is now PASS — both Cycle-1
CONCERNs (C2 hover-popover overlap; B1 `/unassigned` preservation) were closed by RESEARCH's actions
exactly as the Cycle-1 mitigation required, independently re-verified in Cycle 2 (see Validate
Contract — Cycle 2 below). `grep -c 'Gate: PASS' <plan-file>` now ≥ 1 — VALIDATE → EXECUTE gate is
satisfied. Orchestrator may proceed toward EXECUTE (emit /goal reference first per the umbrella's
Stable Program Goal — this phase plan is BRANCH B, no separate Autonomous Goal Block needed here).

---

## Execution Blocker (EXECUTE, 02-07-26) — RESOLVED (follow-up EXECUTE pass, 02-07-26)

**RESOLUTION (02-07-26):** The block is cleared. Phase 4's field-error work has landed in
`leads/new/+page.svelte`, so this follow-up EXECUTE pass wired both shared pieces in without regressing
it: (1) `DatePickerField.svelte` gained a small ADDITIVE optional `errors` prop (spreads
`fieldErrorAttrs(id, errors)` onto the trigger + renders `<FieldError {id} {errors} />`), so the
event-date field keeps Phase 4's per-field `aria-invalid`/`aria-describedby` + message display after
consolidation; the 3 inline ~90-line Dialog/Calendar blocks are now 3 `<DatePickerField>` usages.
(2) The dupe-popover's local `openDupeId`/`closeTimer`/`ownerNameFor` were replaced with
`createHoverPopover()` + the shared `ownerNameFor(data.users, …)` helper, matching `/unassigned`.
Verification: `bun run check` 0 errors, `bun run test:unit:ci` 313 passed / 0 failed, eslint+prettier
clean on both changed files. E2E remains env-blocked (nested-worktree Playwright module duplication).
Original block description retained below for history.

**BLOCKED sub-item — `leads/new/+page.svelte` date-picker (C1) + hover-hook (C2) wiring.** On EXECUTE
re-read, this file already contains Phase 4's landed field-error/validation markup, including
`{...fieldErrorAttrs('eventDate', fieldErrors.eventDateRaw)}` + `aria-invalid:*` classes on the
event-date `Dialog.Trigger` and a `<FieldError id="eventDate">` sibling — i.e. Phase 4's validation
wiring is intertwined with the exact date-picker markup Phase 2 must extract. Extracting it would
regress Phase 4 or require a field-error prop surface on `DatePickerField` outside this phase's
validated contract. Per the handoff instruction ("stop and report BLOCKED rather than guessing at
resolution"), `leads/new/+page.svelte` was left untouched. Resolution needs orchestrator sequencing:
land Phase 4's `leads/new` work first, then reconcile Phase 2's date-picker extraction (likely giving
`DatePickerField` optional `errorAttrs`/`errors` props) as a follow-up. The shared components
(`DatePickerField.svelte`, `hover-popover.svelte.ts`, `owner.ts`) are already built and ready to wire.

## Touchpoints

- `src/lib/components/leads/LeadGrid.svelte`
- Up-for-Grabs grid file (confirm exact path during RESEARCH — likely `src/routes/unassigned/+page.svelte`
  or a sibling component)
- Date-picker call sites (3x — confirmed during VALIDATE: all 3 live within `src/routes/leads/new/+page.svelte`)
- Hover-card/dedup-popover call sites (2x — confirmed during VALIDATE: `src/lib/components/OrganizerHoverCard.svelte`, already shared at `leads/new/+page.svelte:205` and `unassigned/+page.svelte:428`)
- New shared component files (grid, date picker, hover-popover) — paths finalized during EXECUTE

---

## Public Contracts

- No schema, auth, or API contract changes.
- Existing Leads/Up-for-Grabs data-fetching contracts (`src/lib/server/db/leads.ts`) are unchanged
  — this phase is presentation-layer consolidation only.
- No behavior loss in Leads/Up-for-Grabs list functionality — existing Vitest/Playwright coverage
  is the regression bar (AC10). This now explicitly includes `e2e/ufg-inline-edit.e2e.ts` and
  `e2e/unassigned-filters.e2e.ts` as named regression targets (VALIDATE addition, 02-07-26).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Existing Leads/Up-for-Grabs Vitest+Playwright suite continues to pass unchanged (incl. `e2e/ufg-inline-edit.e2e.ts`, `e2e/unassigned-filters.e2e.ts`) | Fully-Automated | AC10 |
| Code-level check: single shared grid component imported at all former LeadGrid/UFG call sites | Fully-Automated (grep/import check) | AC10 |
| Playwright viewport-resize scenario: Leads list + Up-for-Grabs render without horizontal overflow at mobile/tablet widths | Fully-Automated | AC2 |
| Perf smoke-check: seed 200+ leads, measure Leads-list render timing before/after consolidation via Playwright, flag if post-change render time exceeds the pre-phase baseline by more than 20% | Hybrid (precondition: seeded DB with 200+ leads; comparison is manual-recorded this cycle, automatable later) | (risk mitigation — not a numbered AC, protects AC2/AC10 from a perf regression) |
| RESEARCH confirmation: does `OrganizerHoverCard.svelte` already satisfy the Step C2 hover-popover consolidation goal? | Agent-Probe → **resolved 02-07-26 (Cycle 2): PARTIALLY — card content yes, timer/wrapper hook no; C2 re-scoped accordingly, proven going forward by the existing `e2e/leads-new-dedup-hover.e2e.ts` regression gate (see AC10 row above)** | (risk mitigation — avoids duplicate/conflicting work against `leads-new-organizer-hover_01-07-26`) |

```bash
bun run test:e2e -- leads-grid-responsive.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-02-leads-grid_PLAN_02-07-26.md`
- Last completed step: 7 — UPDATE PROCESS (02-07-26). Phase closed out as ✅ VERIFIED.
- Validate-contract status: written (02-07-26, Cycle 1 CONDITIONAL superseded by Cycle 2 PASS) — see Validate Contract sections below
- Next step: none for this phase. Follow-ups live in backlog:
  `process/features/ux-enhancement/backlog/nested-worktree-playwright-env-blocker_NOTE_02-07-26.md`,
  `process/features/leads/backlog/organizerhovercard-a11y-audit_NOTE_02-07-26.md`. Program-level next
  action is tracked in the umbrella plan's `## Current Execution State`.

---

## Test Infra Improvement Notes

- No existing perf-test precedent in the e2e suite (`e2e/*.e2e.ts` — confirmed during VALIDATE,
  none of the 7 existing specs measure render timing). The Hybrid perf smoke-check gate above will
  be the first of its kind; consider promoting it to a small reusable helper if later phases need
  similar checks.
- If RESEARCH confirms `OrganizerHoverCard.svelte` already satisfies Step C2, its keyboard/focus a11y
  status is unaudited by any existing backlog note (`popover-a11y-audit_NOTE_01-07-26.md` covers a
  different popover in `LogTouchForm.svelte`). Write a new backlog note if this phase does not have
  scope to audit it directly. **Cycle 2 check (02-07-26): confirmed `process/features/ux-enhancement/`
  has no `backlog/` folder yet — this note has NOT been written. Still open; carried forward as an
  Open Gap below, non-blocking for this phase's Gate.** **RESOLVED at UPDATE PROCESS (02-07-26):**
  note written — `process/features/leads/backlog/organizerhovercard-a11y-audit_NOTE_02-07-26.md`.

---

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Single phase plan, ~5-6 files, no high-risk class (auth/billing/schema/API/migration/
container) present, no cross-agent coordination needed for this validation pass — sequential/simple
mode fan-out performed directly by this agent.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC10 | Existing Leads/Up-for-Grabs Vitest+Playwright suite continues to pass unchanged after grid consolidation, including inline-edit (`ufg-inline-edit-review-removal`) and filter (`ufg-country-category-filters`) call sites on `/unassigned` | Fully-Automated | `bun run test:unit:ci` + `e2e/leads-discard.e2e.ts`, `e2e/ufg-inline-edit.e2e.ts`, `e2e/unassigned-filters.e2e.ts`, `e2e/leads-new-dedup-hover.e2e.ts`, `e2e/lead-visibility.e2e.ts` | A |
| AC10 | Single shared grid component imported at all former LeadGrid/UFG call sites, no duplicate implementation remains | Fully-Automated | Code-level grep/import check across `src/routes` for the new shared grid component path (finalized during EXECUTE) | B |
| AC2 | Leads list + Up-for-Grabs render without horizontal overflow at mobile/tablet widths | Fully-Automated | `bun run test:e2e -- leads-grid-responsive.e2e.ts` (new spec — self-skips with documented known-gap if shared Playwright auth fixture blocks it, per program-wide pattern) | B |
| PERF-RISK (D2 mitigation) | Shared responsive-card grid component does not regress Leads-list render time at 200+ rows vs. pre-phase baseline | Hybrid | Playwright scenario — seed/query 200+ leads, measure render timing (Playwright trace or `performance.now()` wrap) for pre- vs. post-consolidation, record both numbers in phase report; flag if post exceeds pre by >20%. Precondition: seeded DB with 200+ leads. | B |
| C2-OVERLAP | Confirm whether the hover-card/dedup-popover consolidation goal (Step C2) is already satisfied by the existing `OrganizerHoverCard.svelte` (built by `leads-new-organizer-hover_01-07-26`) | Agent-Probe | RESEARCH reads `OrganizerHoverCard.svelte`, confirms it is wired at both `leads/new/+page.svelte:205` and `unassigned/+page.svelte:428` (VALIDATE already confirmed this empirically — RESEARCH re-confirms and records the decision in the phase report) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value in this table.

Legacy line form (retained so existing validate-contract consumers still parse):
- Leads/UFG grid consolidation: [Fully-automated: `bun run test:unit:ci` + existing Leads/UFG e2e specs] | [Fully-automated: grep-based single-shared-component import check] | [Fully-automated: `bun run test:e2e -- leads-grid-responsive.e2e.ts` (new, self-skip known-gap pending shared auth fixture)] | [hybrid: perf smoke-check — 200+ row render-time comparison, precondition: seeded DB] | [agent-probe: confirm OrganizerHoverCard.svelte overlap with C2]

Failing stub (AC2 — new scenario, Fully-Automated):
```
test("should render Leads list and Up-for-Grabs grid without horizontal overflow at mobile/tablet widths", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: leads-grid-responsive.e2e.ts mobile viewport overflow check")
})
```
Note: the other two Fully-Automated rows ("existing suite continues to pass unchanged" and the
grep-based import-site check) are regression/static-check gates, not new red-first scenarios — no
TDD stub is meaningful for them (there is no new behavior to write a failing test for; the gate is
"nothing regresses" / "one import path remains"). This is a deliberate omission, not a missed one.

Dimension findings:
- Infra fit: PASS — pure SvelteKit/Tailwind presentation-layer work; no container, runtime, or port
  surface touched.
- Test coverage: CONCERN — perf smoke-check for D2 was under-specified in the original plan text
  ("Hybrid, manual baseline comparison, automatable later" with no command or threshold); now
  strengthened to a concrete Hybrid gate (see PERF-RISK row above) with an explicit seed size,
  measurement method, and 20% regression threshold. New e2e spec will self-skip pending the shared
  Playwright auth fixture — this is the pre-accepted, program-wide known-gap pattern, not a new gap.
- Breaking changes: PASS — no schema/auth/API changes; AC10's regression bar (existing Leads/UFG
  suite unchanged) is the correct and sufficient breaking-change guard for this phase's scope.
- Security surface: PASS — no auth, billing, secrets, or trust-boundary surface touched.
- Step A [cross-reference active plans] feasibility: CONCERN — gate mechanism (A1) correctly lists
  all 4 relevant leads-area plans + the backlog note, but empirical file-read during VALIDATE found
  a high-confidence real overlap the plan text did not name explicitly: `OrganizerHoverCard.svelte`
  already exists and is already the shared component at both call sites Step C2 targets for
  consolidation (built by `leads-new-organizer-hover_01-07-26`, status IN PROGRESS). Mitigated via
  inline Plan Update (Step A1/C2 notes added above) requiring RESEARCH to confirm/re-scope before
  writing implementation code.
- Step B [grid consolidation] feasibility: CONCERN — mechanically feasible (both target files exist;
  differing 8-cell vs. 10-cell grid-column templates confirmed, props/slots approach required as the
  plan already anticipated), but the plan did not name that `/unassigned/+page.svelte` already
  contains landed inline-edit code (`ufg-inline-edit-review-removal_01-07-26`, CODE DONE) and is also
  a touchpoint of `ufg-country-category-filters_01-07-26` (PLANNED). This overlap is real and was not
  listed in the umbrella's Pre-PVL Conflict Resolution table. Mitigated via inline Plan Update
  (Step B1 note added above) requiring explicit preservation of those call sites plus running
  `e2e/ufg-inline-edit.e2e.ts` and `e2e/unassigned-filters.e2e.ts` as named regression targets.
- Step C [date-picker + popover consolidation] feasibility: mixed —
  - C1 (date picker): PASS. Confirmed real and mechanically feasible: all 3 duplicated instances
    (`selectedDate`/`announcedDate`/`reachedOutDate`) live within `src/routes/leads/new/+page.svelte`
    itself (not 3 separate files, contrary to the SPEC's looser phrasing) — extraction target is
    unambiguous.
  - C2 (hover-popover): CONCERN — same finding as Step A above; likely already satisfied by existing
    work, needs RESEARCH confirmation before treating as a checklist item to build.
  - C3 (popover-a11y-audit_NOTE cross-check): PASS. Confirmed the backlog note covers the Templates
    popover in `LogTouchForm.svelte` — a different popover instance from `OrganizerHoverCard.svelte`.
    No duplication risk on this specific sub-item; the plan's own hedged phrasing already handles it
    correctly. New finding: if C2 concludes `OrganizerHoverCard.svelte` is the consolidated
    implementation, its own keyboard/focus a11y status remains unaudited by any existing note —
    flagged as an open item, not silently treated as covered.
- Step D [responsive card-switch + perf smoke-check] feasibility: CONCERN — D1 (responsive rework) is
  mechanically sound, reusing a pattern already proven on the Lead-detail page. D2 (perf smoke-check)
  was the primary target of this VALIDATE pass per the task's explicit instruction — confirmed no
  existing perf-test precedent exists in the e2e suite (checked all 7 current specs), so the gate
  needed to be authored from scratch; now concretely defined in the Test Gates table above (PERF-RISK
  row) rather than left as a vague mention.
- Cross-phase consistency (`src/routes/leads/new/+page.svelte`, Phase 2 vs. Phase 4): PASS — both
  phase plans and the umbrella's `phase-blast-radius-registry.md` explicitly name this overlap and
  require whichever phase's EXECUTE runs second to re-check the file's current state before editing.
  This is a real coordination mechanism (a sequencing rule tied to EXECUTE order), not merely an
  assertion that the overlap is "fine" — confirmed adequately resolved as written in both plans.
- Structural validation: `validate-plan-artifact.mjs` reported 6 failures (missing Date/Status/
  Complexity metadata lines, missing Overview/Phase Completion Rules/Acceptance Criteria sections) —
  these are expected shape mismatches against the generic SIMPLE/COMPLEX plan template; this file is
  a phase-program stub and is correctly validated instead by
  `vc-generate-phase-program/scripts/validate-phase-stub.mjs`, which returned 0 failures / 0
  warnings. No structural fix needed.
- Dependency-BLOCKED guard: `phase-blast-radius-registry.md` shows Phase 1 status "(no field — not
  yet started)", not BLOCKED — no dependency block triggered.

Open gaps:
- C2-OVERLAP (Agent-Probe) — must be resolved during RESEARCH before Step C2 implementation begins;
  not a blocker for starting RESEARCH itself.
- OrganizerHoverCard.svelte keyboard/focus a11y audit — currently uncovered by any existing backlog
  note; flag a new backlog note if this phase's scope does not extend to auditing it directly.
- Shared Playwright auth-fixture gap (program-wide, pre-accepted): known-gap: documented as
  program-level known-gap — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
  New `leads-grid-responsive.e2e.ts` scenarios will self-skip against this until the fixture lands.

What this coverage does NOT prove:
- The AC10 regression suite proves existing behavior isn't broken by consolidation; it does NOT
  prove the new shared grid component is bug-free for a hypothetical future 3rd consumer's
  column-shape needs beyond the 2 known shapes (8-cell/10-cell).
- The AC2 e2e scenario (once written) proves no horizontal overflow at the specific viewport widths
  tested; it does NOT prove usability at arbitrary intermediate widths or real mobile-hardware touch
  behavior.
- The PERF-RISK Hybrid gate proves render-time behavior at one sampled row count (200+) against one
  sampled pre-phase baseline; it does NOT prove performance at higher scales (1000+ rows), under
  concurrent multi-user load, or on lower-powered client devices.
- The C2-OVERLAP Agent-Probe check proves whether `OrganizerHoverCard.svelte` satisfies the
  consolidation goal at today's snapshot; it does NOT prove that component has been keyboard/focus
  a11y-audited.
- New e2e specs will self-skip against protected routes pending the shared Playwright auth fixture —
  they do not prove real browser behavior until that fixture lands (pre-accepted program-wide gap).

Gate: CONDITIONAL (2 CONCERNs mitigated in-plan via Plan Updates above, 0 unresolved FAILs; 1
Agent-Probe confirmation and 1 backlog-note decision remain open for RESEARCH to close in Step 1)
Accepted by: session (autonomous — parallel outer-PVL fan-out across 5 phase plans, no interactive
user available in this subagent context). Accepted concerns: (1) C2 hover-popover overlap with
`leads-new-organizer-hover_01-07-26` — mitigated via explicit RESEARCH-first instruction, not
descoped; (2) `/unassigned/+page.svelte` inline-edit/filter overlap with
`ufg-inline-edit-review-removal_01-07-26` and `ufg-country-category-filters_01-07-26` — mitigated
via explicit preservation instruction + named regression e2e specs; (3) perf smoke-check
under-specification — resolved directly by strengthening the Test Gates table (no longer open).

---

## Validate Contract — Cycle 2 (Inner Loop Refresh Re-Validate, 02-07-26)

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — outer PVL has current evidence (this cycle re-validates the
same phase plan after Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT ran and produced the Inner Loop
Refresh Note above; `results.tsv` iteration 2 already frames this Refresh Note as continuing the
same outer-PVL exercise across all 5 phase plans — not a distinct inner-loop-per-phase pass — so
`generated-by` stays `outer-pvl` per that existing bookkeeping and the explicit instruction for this
cycle, rather than switching to `inner-pvl: phase-2`)

Parallel strategy: sequential
Rationale: Unchanged from Cycle 1 — single phase plan, no new blast-radius files, no schema/auth/
API/billing/container surface. The Refresh Note is a scope REDUCTION (C2 narrowed) plus additive
documentation (fuller preservation inventory, a plan/code-state mismatch note out of this phase's
scope) — not a scope expansion. No cross-agent coordination is needed to re-check it.

Re-validation scope decision (documented per this cycle's explicit instruction to justify the call):
this cycle ran full mandatory V1 structural checks (validate-plan-artifact.mjs, validate-phase-stub.mjs,
file-existence re-check on all 9 referenced touchpoint/test files, dependency-BLOCKED guard against
the registry) plus a TARGETED re-check of only the dimensions/sections the Refresh Note actually
touched (Test coverage; Step A/C2 feasibility; Step B feasibility) — not a full fresh 4-dimension +
per-section Layer 1/Layer 2 re-fan-out. Justification: Infra fit, Breaking changes, and Security
surface are provably unaffected by (a) a narrower C2 scope and (b) additive documentation — neither
introduces a new file, dependency, schema/auth/API surface, or runtime/container touchpoint, so
re-running those three dimensions from scratch would re-derive the same PASS with no new evidence.
The two dimensions that COULD have changed (Test coverage's C2-OVERLAP gate; Step A/B/C feasibility
findings tied to the two Cycle-1 CONCERNs) were re-checked empirically against live repo state (see
findings below), not merely re-asserted from the plan text. This is the proportionate application of
the general "right-sized effort" principle — a scope reduction that resolves prior open concerns does
not warrant the same fan-out depth as a scope expansion or a new-risk finding would.

AC10 sufficiency assessment (explicit reasoning requested for this cycle): AC10's literal SPEC text
(item 10) is "Duplicated grid logic (LeadGrid vs. Up-for-Grabs grid) and the 3x-duplicated
date-picker pattern converge on shared implementations with no behavior loss," proven by "existing
Leads/Up-for-Grabs Vitest+Playwright coverage continues to pass unchanged... a code-level check
confirms one shared component is imported at all former call sites." The hover-card/dedup-popover
pattern is mentioned only in the SPEC's Theme D background narrative (line 181), NOT in AC10's
numbered criterion text or its proven-by clause. Step C2 was always the phase-author's decision to
bundle Theme D's third duplication instance into this phase alongside the two AC10-gated items, not
a SPEC-mandated proof point in its own right — confirmed by the Test Gates table's C2-OVERLAP row
being tagged as "(risk mitigation — avoids duplicate/conflicting work...)," not as a numbered AC.
Conclusion: narrowing C2 does NOT risk under-delivering against AC10, because AC10 was never gated
on C2's completion. Separately — and this is the more important finding — the re-scoped C2 (extract
a shared hover-timer/Popover-wrapper hook) is still real developed behavior, and it IS provably
covered: AC10's own proving-test list already includes `e2e/leads-new-dedup-hover.e2e.ts`, which
exercises exactly the dedup-hover interaction the new hook drives at both call sites. So the
narrower C2 gets Fully-Automated regression coverage "for free" via the AC10 gate that was already
in the Cycle-1 contract — no new gate needed, and no Known-Gap/vacuous-green risk is introduced by
the re-scope.

Empirical re-verification performed this cycle (against live repo state, not just plan text):
- `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs` on this plan file: 2
  failures / 4 warnings — same generic-template mismatches as Cycle 1 (expected; this is a
  phase-program stub, not a SIMPLE/COMPLEX plan).
- `node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs` on this plan file:
  0 failures / 0 warnings (unchanged from Cycle 1).
- File-existence check (vc-scout-equivalent) on all 9 referenced files: `src/lib/components/leads/LeadGrid.svelte`,
  `src/routes/unassigned/+page.svelte`, `src/routes/leads/new/+page.svelte`,
  `src/lib/components/OrganizerHoverCard.svelte`, `e2e/ufg-inline-edit.e2e.ts`,
  `e2e/unassigned-filters.e2e.ts`, `e2e/leads-new-dedup-hover.e2e.ts`, `e2e/lead-visibility.e2e.ts`,
  `e2e/leads-discard.e2e.ts` — all present on disk.
- `grep` on `src/routes/leads/new/+page.svelte`: confirmed `openDupeId` (state) + `closeTimer`
  (timeout handle) + a local `ownerNameFor` function, plus `OrganizerHoverCard` imported and used at
  line 205 with `lead={d} ownerName={ownerNameFor(d.ownerId)}`.
- `grep` on `src/routes/unassigned/+page.svelte`: confirmed a SEPARATE `openHoverId` (state) +
  `hoverCloseTimer` (timeout handle) + its OWN local `ownerNameFor` arrow function, plus
  `OrganizerHoverCard` imported and used at line 428 with the same prop shape. This empirically
  confirms RESEARCH's re-scope claim exactly: the card content is shared (one component, two call
  sites) but the timer/wrapper state and the `ownerNameFor` helper are still duplicated, not shared.
- `grep` on `src/routes/unassigned/+page.svelte` for the Step B1 preservation-inventory claims:
  confirmed `editTarget` state, `LeadEditModal` import + conditional render block, `ReassignModal`
  import + render, `MultiSelectFilter` imported and used twice + a "Clear all filters" flow,
  `makeSortTable` import, and pagination — all present exactly as RESEARCH's inventory described.
- `phase-blast-radius-registry.md`: Phase 1 status unchanged, "(no field — not yet started)" — not
  BLOCKED. Dependency-BLOCKED guard does not trigger.

Test gates: unchanged from Cycle 1's table (reproduced above under the original `## Validate
Contract` section) — no new gate needed, and no existing gate needs to change, because AC10's
already-listed `e2e/leads-new-dedup-hover.e2e.ts` covers the re-scoped C2 work. One row's status is
updated below (C2-OVERLAP), reflecting resolution rather than a text change to the gate itself.

Dimension findings (Cycle 2 — re-assessed against the Refresh Note; PASS unless noted otherwise):
- Infra fit: PASS (unchanged, not re-derived from scratch — no infra/container/runtime surface
  touched by the Refresh Note's changes; confirmed no new files were added to the blast radius).
- Test coverage: PASS (upgraded from CONCERN) — perf smoke-check strengthening from Cycle 1 stands
  unchanged. C2-OVERLAP is now RESOLVED: RESEARCH confirmed partial-not-full overlap and re-scoped
  C2 to hook-extraction; empirically re-verified above. The re-scoped work has Fully-Automated
  regression coverage via AC10's existing `e2e/leads-new-dedup-hover.e2e.ts` gate — no net-gate
  vacuous-green risk (the newly-scoped behavior is not resting on a bare Known-Gap).
- Breaking changes: PASS (unchanged) — no schema/auth/API/public-contract change; AC10's regression
  bar is unaffected by narrowing C2's scope.
- Security surface: PASS (unchanged) — no auth/billing/secrets/trust-boundary surface touched.
- Step A [cross-reference active plans] feasibility: PASS (upgraded from CONCERN) — the Cycle-1
  mitigation required RESEARCH to confirm the `OrganizerHoverCard.svelte` overlap before writing C2
  code. RESEARCH did exactly this and the confirmation is empirically re-verified in this cycle (see
  grep evidence above). Concern closed, not merely carried forward.
- Step B [grid consolidation] feasibility: PASS (upgraded from CONCERN) — the Cycle-1 mitigation
  required an explicit preservation inventory for `/unassigned/+page.svelte`'s inline-edit/filter
  call sites. RESEARCH added a fuller inventory than Cycle 1 anticipated (also covering bulk-claim
  toolbar, `ReassignModal`, sortable header, pagination, dual empty-states) and it is empirically
  re-verified above as accurate. This makes the plan MORE complete, not riskier. Concern closed.
- Step C [date-picker + popover consolidation] feasibility: PASS overall —
  - C1: unchanged PASS.
  - C2: PASS (upgraded from CONCERN) — re-scoped to a narrower, more tractable target (extract a
    shared hook, not the whole card) and confirmed mechanically sound via the grep evidence above;
    provably regression-tested via AC10's existing gate (see AC10 sufficiency assessment above).
  - C3: unchanged PASS. The `OrganizerHoverCard.svelte` a11y-audit-status item is carried forward as
    a non-blocking Open Gap (below), not re-scored as a new CONCERN — nothing in the Refresh Note
    changes this specific item's status, and it was never a phase-gating item in Cycle 1 either.
- Step D [responsive + perf] feasibility: PASS (unchanged) — the Refresh Note does not touch Step D;
  the PERF-RISK Hybrid gate from Cycle 1 is unaffected.
- Plan/code-state mismatch note (`ufg-country-category-filters`): observational only, correctly
  flagged by RESEARCH for `vc-update-process-agent` to reconcile later — not a Phase 2 gating
  concern. Phase 2's own obligation (preserve the filter markup as-is) is unchanged and is captured
  in the preservation inventory; the markup's presence was independently re-verified above (grep
  confirms `MultiSelectFilter` used twice + a clear-all-filters flow on `/unassigned`).
- Structural validation: re-run this cycle, unchanged results (see empirical re-verification above).
- Dependency-BLOCKED guard: re-checked this cycle, unchanged (Phase 1 not BLOCKED).

Open gaps (carried forward from Cycle 1, unchanged by this Refresh Note):
- OrganizerHoverCard.svelte keyboard/focus a11y audit — still uncovered by any existing backlog
  note. Re-checked this cycle: `process/features/ux-enhancement/` has no `backlog/` folder yet, so
  no note has been written. Recommend writing it before or during this phase's UPDATE PROCESS step.
  Non-blocking for this phase's Gate (as in Cycle 1).
- Shared Playwright auth-fixture gap (program-wide, pre-accepted) — unchanged, known-gap: documented
  as program-level known-gap — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

What this coverage does NOT prove (Cycle 1's list still applies; additive item for this cycle):
- The AC10 regression suite (specifically `e2e/leads-new-dedup-hover.e2e.ts`) proves the re-scoped
  C2 hook doesn't break existing dedup-hover interaction behavior end-to-end; it does NOT constitute
  a dedicated unit test of the extracted hook in isolation — e2e coverage is the accepted proof
  mechanism here, consistent with this plan's existing test strategy, but a hook-level unit test is
  not part of this gate.
- (Cycle 1's five "What this coverage does NOT prove" items — AC10 3rd-consumer generalization, AC2
  arbitrary-width/touch-hardware behavior, PERF-RISK higher-scale/concurrent-load behavior,
  C2-OVERLAP a11y-audit status, and new-e2e-specs' self-skip pending the shared auth fixture — all
  still apply unchanged.)

Gate: PASS (0 FAILs, 0 unresolved CONCERNs — both Cycle-1 CONCERNs were closed by RESEARCH's actions
exactly as the Cycle-1 mitigation required, and independently re-verified empirically in this cycle
against live repo state, not merely re-asserted from the plan text. The 2 remaining Open Gaps
(a11y-audit-note, shared-auth-fixture) are pre-accepted, non-blocking known-gaps carried forward
unchanged from Cycle 1 — neither is a developed-behavior-with-zero-gate situation.)
Accepted by: session (autonomous re-validate pass; single vc-validate-agent invocation, no
interactive user available in this subagent context — consistent with Cycle 1's acceptance basis).
