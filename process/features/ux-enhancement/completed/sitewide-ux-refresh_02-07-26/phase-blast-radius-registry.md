---
name: plan:sitewide-ux-refresh-blast-radius-registry
description: "Site-Wide UX Refresh — per-phase blast-radius claim registry (append-only)"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: registry
---

# Site-Wide UX Refresh — Phase Blast-Radius Registry

Append-only. Each phase's blast-radius claim is added as its own `## Phase N` section. Never
overwrite a prior phase's section — only append new sections or add a `## Potential Blast Radius
Conflicts` note if overlap is detected.

Written at kickoff (single-agent pass substituting for the recommended agent-team, per the process
note in the umbrella plan) so all 5 phases' claims are cross-checked for overlap in one pass.

---

## Phase 1 — Nav & Shell Foundation

Claimed files:
- `src/lib/components/layout/AppShell.svelte`
- `src/lib/components/layout/AppSidebar.svelte`
- `src/lib/components/layout/AppTopbar.svelte`
- `src/lib/styles/tokens.css` (WRITE — nav-surface tokens + focus-ring token/utility)

Status: DONE (EXECUTE + EVL complete 02-07-26; see phase-01-nav-shell_REPORT_02-07-26.md)

---

## Phase 2 — Leads/UFG Grid Consolidation & Responsiveness

Claimed files:
- `src/lib/components/leads/LeadGrid.svelte`
- Up-for-Grabs grid file (path TBD during RESEARCH — likely `src/routes/unassigned/+page.svelte`
  or a sibling component)
- `src/routes/leads/new/+page.svelte` (SHARED with Phase 4 — see Potential Blast Radius Conflicts
  below; Phase 2 owns date-picker extraction only)
- New shared grid/date-picker/hover-popover component files: `DataGridShell.svelte`,
  `DatePickerField.svelte`, `src/lib/utils/hover-popover.svelte.ts`, `src/lib/utils/owner.ts`
- `src/lib/styles/tokens.css` (READ-ONLY — honored, no writes)

Status: DONE (UPDATE PROCESS closeout 02-07-26 — ✅ VERIFIED). `LeadGrid.svelte` +
`unassigned/+page.svelte` consolidation DONE; `leads/new/+page.svelte` C1/C2 wiring reconciled in a
follow-up EXECUTE pass after Phase 4 landed (no regression to Phase 4's field-error work). EVL
confirmation (orchestrator-run, independent): `bun run check` PASS, `bun run test:unit:ci` PASS
(313/313), `/unassigned` preserved-functionality + dedup-hover reactivity confirmed unaffected,
`leads-grid-responsive.e2e.ts` self-skips on the pre-accepted shared-auth-fixture known-gap. 3
known-gaps recorded (all backlogged, non-blocking): shared auth-fixture (program-wide,
pre-existing); nested-worktree Playwright/ENOSPC env blocker (new —
`process/features/ux-enhancement/backlog/nested-worktree-playwright-env-blocker_NOTE_02-07-26.md`);
`OrganizerHoverCard.svelte` a11y audit (new —
`process/features/leads/backlog/organizerhovercard-a11y-audit_NOTE_02-07-26.md`). See
`phase-02-leads-grid_REPORT_02-07-26.md` for full EVL Confirmation + SPEC Achievement detail.

---

## Phase 3 — Pipeline/Calendar/Reports Responsiveness & Theme G

Claimed files:
- `src/lib/components/pipeline/PipelineBoard.svelte`
- `src/lib/components/calendar/CalendarGrid.svelte`
- `src/lib/components/calendar/CalendarEntry.svelte`
- `src/lib/components/reports/CalendarHeatmap.svelte`
- `src/lib/components/reports/MonthCalendar.svelte`
- New keyboard stage-change control component (path TBD during EXECUTE)
- `src/lib/styles/tokens.css` (READ-ONLY)

Status: DONE (EXECUTE + EVL complete 02-07-26; see phase-03-pipeline-calendar_REPORT_02-07-26.md)

---

## Phase 4 — Forms

Claimed files:
- `src/routes/leads/new/+page.svelte` (SHARED with Phase 2 — see Potential Blast Radius Conflicts
  below; Phase 4 owns per-field error wiring only — the Superforms conversion was dropped at PVL
  Cycle 0; the `Dialog.Trigger` date fields keep their inline markup, now with an
  `aria-invalid`/`aria-describedby`-friendly wiring Phase 2 can consume when it extracts them)
- `src/lib/components/meetings/MeetingFormModal.svelte`
- `src/routes/team/+page.svelte`
- New shared field-error component — FINALIZED: `src/lib/components/ui/field-error/`
  (`field-error.ts` pure ARIA helper + `FieldError.svelte` + `index.ts`)
- Tests: `src/tests/field-error.spec.ts`, `src/tests/leads-new-dedup-reactivity.spec.ts`,
  `e2e/lead-creation-form.e2e.ts`, `e2e/meeting-form.e2e.ts`, `e2e/team-invite-form.e2e.ts`
- `src/lib/styles/tokens.css` (READ-ONLY — reused `--color-focus-ring` for the invalid-date ring)

Status: DONE — EXECUTE + EVL complete 02-07-26; `bun run check` 0 errors, unit gates green (26 new +
full suite 313 passed), e2e self-skip under pre-accepted auth-fixture known-gap (a separate e2e run
attempt hit a dev-server port collision, environment not code — follow-up clean run recommended).
Phase 4 ran first on `leads/new` (Phase 2 had not landed yet at EXECUTE time); EVL independently
confirmed Phase 2's later date-picker extraction and Phase 4's field-error wiring genuinely coexist
in the file (true merge, not an overwrite) — see phase-04-forms_REPORT_02-07-26.md "EVL
Confirmation". SPEC: AC6 met, AC7 (revised) met, AC7 (literal wording) Unmet/Known-Gap (pre-accepted
permanent deviation).

---

## Phase 5 — Token Sweep Completion, Theme F, Remaining A11y

Claimed files:
- `src/routes/login/+page.svelte`
- `src/routes/unauthorized/+page.svelte`
- `src/routes/+error.svelte`
- `src/lib/components/reports/*` (token-swap scope only)
- Reminders/Today snooze-button component (path TBD during RESEARCH — likely `LeadListRow.svelte`
  or equivalent)
- Tab and chip component call sites across Leads/Lead-detail and Calendar/Meeting-modal
- `src/lib/styles/tokens.css` (completes the sweep — writes remaining token consumers, does not
  redefine token names from Phase 1)
- `ui/button`, form inputs, calendar cells (focus-ring utility application — remaining sweep beyond
  Phase 1's nav-only application)

Status: DONE (EXECUTE + EVL complete 02-07-26; see phase-05-token-sweep_REPORT_02-07-26.md). Final
phase of the program — Phase 1-4 artifacts independently re-confirmed still present at EVL, no
cross-phase regression.

---

## Potential Blast Radius Conflicts

- **`src/routes/leads/new/+page.svelte` — Phase 2 (date-picker extraction) vs. Phase 4 (Superforms
  conversion + field-error wiring).** Resolution: both phases touch this file but own disjoint
  concerns within it (Phase 2 = date-picker markup extraction; Phase 4 = form submission mechanism
  + error display). Sequencing rule recorded in both phase plans' Entry Gate sections: whichever
  phase's EXECUTE starts second must re-check the file's current state against its own plan before
  making changes, to avoid a silent merge conflict. Neither phase blocks the other from starting
  RESEARCH/INNOVATE in parallel — only EXECUTE ordering on this specific file needs coordination.
- **`src/lib/styles/tokens.css` — Phase 1 (WRITE) vs. Phases 2/3/4 (READ-ONLY) vs. Phase 5
  (completes the sweep).** Resolution: classified `parallel-safe` in the umbrella's Pre-PVL
  Conflict Resolution section — Phases 2-4 only read token names Phase 1 establishes, never
  redefine them. Phase 5 is sequenced last by design (depends on Phases 1-4's final shape), so it
  never runs concurrently with the read-only phases.

No other overlaps detected. Phases 2, 3, and 4 are otherwise fully disjoint file sets.
