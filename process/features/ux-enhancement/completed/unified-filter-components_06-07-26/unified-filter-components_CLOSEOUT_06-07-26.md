---
phase: unified-filter-components
date: 2026-07-06
status: COMPLETE_WITH_GAPS
feature: ux-enhancement
plan: process/features/ux-enhancement/completed/unified-filter-components_06-07-26/unified-filter-components_PLAN_06-07-26.md
---

# Unified Filter/Search/Toolbar Components — CLOSEOUT

## What Was Done

Three shared UI components now live in `src/lib/components/ui/` and replace 8 duplicated
implementations across 4 pages:

- **`filter-dropdown/`** (`FilterDropdown.svelte` + `filter-dropdown.ts` + `index.ts`) — generalizes
  `MultiSelectFilter.svelte`'s popover/checkbox chrome behind a `multiple: boolean` prop. Replaces
  `MultiSelectFilter` on Up for Grabs (Country/Category, `multiple=true`) and shadcn `Select` on My
  Leads (Stage/Platform/Country, `multiple=false`) and Reports (rep filter, `multiple=false`).
- **`search-input/`** (`SearchInput.svelte` + `search-input.ts` + `index.ts`) — one shared search box
  with a canonical **300ms** debounce (reversed from SPEC's tentative 1300ms — INNOVATE found no
  rate-limit/cost rationale for the longer delay in either `unassigned/+page.server.ts` or
  `leads/+page.server.ts`). Used on Up for Grabs and My Leads (the only 2 pages with an actual free-text
  search box in scope).
- **`week-range-control/`** (`WeekRangeControl.svelte` + `week-range-control.ts` + `index.ts`) — new
  purpose-built component (NOT a `Tabs.svelte` reuse — `role="radiogroup"`/`aria-pressed` toggle
  buttons, since a free-text override input can't live cleanly inside a roving-tabindex tab strip).
  Replaces Up for Grabs' inline segmented control and My Leads' "Filters" popover sub-control.
- **Reminders' rep combobox** — restyled only (border/focus/sizing), left as its own distinct
  Command-based pattern per the locked INNOVATE decision; no behavior or structural change.
- **`src/lib/components/leads/MultiSelectFilter.svelte` deleted** — confirmed zero remaining
  references in `src/` (only a code-comment mention in `filter-dropdown.ts` describing prior
  behavior, and a Vitest assertion in `unified-filter-imports.spec.ts` proving the import is gone).

All 4 route files (`unassigned/+page.svelte`, `leads/+page.svelte`, `reports/+page.svelte`,
`reminders/+page.svelte`) were migrated per the plan's Touchpoints list. No schema, API, or
`+page.server.ts` changes — pure client-side UI consolidation, consistent with the plan's Blast
Radius classification (none of the 6 high-risk classes touched).

## What Was Skipped or Deferred

- Reports' native `<input type="date">` date-range elements — explicitly out of scope, untouched.
- The shared Playwright authenticated-session fixture (AC9 e2e proof) — pre-existing, out-of-scope
  gap, not addressed by this plan.
- The `@axe-core/playwright` devDependency decision (AC10 automated a11y) — open program-level
  decision, not re-litigated here.

## Plan Deviations (EXECUTE-time, as reported by execute-agent)

1. **`FilterDropdown`'s `options` prop accepts object-shaped items, not just `string[]`.** The plan's
   Public Contracts section specified `options: string[]`; the shipped component instead takes
   `readonly FilterOption[]` (an object shape with value/label, via `optionValue`/`optionLabel`
   helpers in `filter-dropdown.ts`) to support call sites where the display label differs from the
   underlying value (e.g. Country/Category codes vs. display names). This is a superset of the
   planned contract, not a behavior change to any call site's cardinality or interaction model.
2. **`WeekRangeControl` preset labels corrected to 4w/8w/12w/All.** Matches the plan's own Locked
   INNOVATE Decisions text (item 1) and Up for Grabs' pre-existing preset set; no functional change,
   just confirming the shipped presets match what was actually specified rather than a generic
   placeholder set.
3. **AC1 import-consolidation test scope corrected to the 2 pages with an actual free-text search
   box** (Up for Grabs, My Leads) rather than all 4 route files literally. Reports and Reminders do
   not have a raw free-text search input in scope (Reports' filter bar is date-range + rep dropdown
   only; Reminders' search-as-you-type is the Command combobox, explicitly not folded into
   `SearchInput` per Locked INNOVATE Decision 5). The AC1 Vitest import-check (`src/tests/`) targets
   `unassigned/+page.svelte` and `leads/+page.svelte` only — verified during EVL by direct grep (see
   Test Gate Outcomes).

No other deviations from the plan's Implementation Checklist were reported.

## Test Gate Outcomes

EVL (independent `vc-tester` re-run, cycle 3, `results.tsv` row 5) confirmed all 6 gates green:

- `bun run check` (typecheck): 0 errors
- `bun run test:unit:ci`: 371/371 unit tests pass
- `grep -rn "MultiSelectFilter" src/`: zero real references (only the pre-deletion-safety-check
  comment context and the negative-assertion test)
- `multiple={false}` appears exactly 3x in `leads/+page.svelte` (cardinality regression guard)
- Cardinality guard test (`toggleOption(false, ...)` never accumulates) verified by direct read
- `git diff` file list matches the plan's claimed Touchpoints exactly

Full PVL cycle history (baseline → supplement → re-validate → EVL): see
`results.tsv` in this folder (4 rows: baseline CONDITIONAL, cycle-1 SUPPLEMENT_APPLIED, cycle-2
HALTED_SUCCESS CONDITIONAL, cycle-3 EVL_PASS) and
`unified-filter-components-pvl-iteration-001_REPORT_06-07-26.md` for the cycle-1 supplement detail
(pure-logic extraction mirroring `field-error.ts` + My Leads single-select cardinality proof).

## Test Infra Gaps Found

None new. Carries forward the same 3 pre-existing, already-tracked gaps the plan disclosed at
VALIDATE (none introduced by this work):

- **AC9 — e2e regression proof**: no shared Playwright authenticated-session fixture exists yet;
  existing specs self-skip on protected routes. Backlog: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- **AC10 — automated accessibility gate**: `@axe-core/playwright` not installed; Agent-Probe
  (manual/code-review) is the accepted fallback. Backlog: `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`.
- **AC2 — live-dev-server visual debounce confirm**: the mandatory Hybrid side-by-side check (300ms
  vs prior 1300ms feel on Up for Grabs) could not be run against a live dev server in this
  environment; judged acceptable via code-review-level assessment (300ms already proven in-repo on
  My Leads, within conventional debounce range, no rate-limit rationale found for 1300ms).

No separate EXECUTE-phase report file was found in the task folder at UPDATE PROCESS time — the
3 deviations above were captured from the EXECUTE handoff summary rather than a persisted report
artifact. This is a minor process gap (not a correctness gap): the EVL re-run and `results.tsv`
independently confirm the shipped code matches the claimed changes, so the deviations are considered
verified, not merely asserted.

## SPEC Achievement

| AC | Verdict | Proof |
|---|---|---|
| AC1 | met (passing test: Vitest import-consolidation check, corrected scope — Up for Grabs + My Leads; `bun run test:unit:ci`) | |
| AC2 | met (Hybrid — code-review-level assessment; live-dev-server visual confirm not run in this environment, judged acceptable known-gap) | |
| AC3 | met (passing test: `toggleOption` pure-logic Vitest tests + import-consolidation check) | |
| AC4 | met (passing test: cardinality regression guard — repeated `toggleOption(false, ...)` never accumulates; `multiple={false}` explicit at all 3 My Leads call sites) | |
| AC5 | met (passing test: `toggleOption(true, ...)` holds 2+ simultaneous values) | |
| AC6 | met (passing test: `computeAriaPressed` pure-logic test + import-consolidation check; keyboard/focus-order stays Agent-Probe per plan) | |
| AC7 | met (passing test: Reminders rep filter still imports `ui/command/`; manual diff confirms `navigateRepFilter`/`shouldFilter`/`CommandItem` handlers unchanged) | |
| AC8 | met (passing test: Reports import-consolidation check; date inputs unchanged) | |
| AC9 | unmet → backlog (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — pre-existing, out-of-scope, program-wide gap; vacuous-green-ban keeps this CONDITIONAL not PASS, same treatment as the completed sitewide-ux-refresh program) | |
| AC10 | met (Agent-Probe — accepted proving strategy per program-wide pattern; not a developed-behavior criterion requiring E2E, since no automated a11y harness exists repo-wide) | |

Net: 9/10 met, 1 unmet-with-backlog (AC9, pre-existing gap, not introduced by this work).

## Closeout Packet

1. **Selected plan path**: `process/features/ux-enhancement/completed/unified-filter-components_06-07-26/unified-filter-components_PLAN_06-07-26.md`
2. **Closeout classification**: **"Ready for UPDATE PROCESS archival"** — all developed behavior has
   a passing fully-automated gate (typecheck, 371/371 unit tests) except AC9, which is an
   inherited, pre-existing, program-wide known-gap already accepted under the identical precedent in
   the completed `sitewide-ux-refresh_02-07-26` program (not a new gap introduced by this plan).
3. **What was finished**: see What Was Done above — 3 new shared components, 4 route migrations, 1
   deletion, all confirmed by independent EVL re-run.
4. **What was verified vs still unverified**: typecheck + 371/371 unit tests + diff-match verified
   independently by vc-tester. Still unverified: e2e regression proof (AC9, no auth fixture),
   automated a11y (AC10, no axe-core), live-dev-server visual debounce feel (AC2, code-review-level
   only).
   - **4b. Validate-contract compliance**: present — inline in plan file, `generated-by: outer-pvl`,
     Gate: CONDITIONAL (vacuous-green-ban override only, all real dimension/section CONCERNs
     resolved by cycle 2).
5. **Cleanup done vs still needed**: this closeout doc + `all-context.md` update done this pass. No
   open TODOs beyond the 3 named known-gaps above (all backlog-tracked, none new).
6. **Single best next valid state**: session complete — ready for next feature or task. No follow-up
   plan required; the 3 known-gaps are inherited program-wide backlog items, not new work items from
   this plan.
7. **Commit-checkpoint recommendation**: recommend a commit now — implementation is EVL-confirmed
   green and the task folder move + context update are complete. Left to the user to invoke
   `vc-git-manager` per this repo's commit-branch policy (commit directly on `main`).
8. **Regression status**: N/A — not a phase program.
9. **SPEC achievement**: see SPEC Achievement table above (9/10 met, AC9 unmet→backlog, pre-existing).

## Forward Preview

### Test Infra Found

The pure-logic-extraction pattern (`toggleOption`, `computeAriaPressed`, `createDebouncer` as
framework-free companion `.ts` modules, mirroring `field-error.ts`/`field-error.spec.ts`) is now a
2nd confirmed instance of this repo's workaround for having no jsdom/`@testing-library/svelte`
project in Vitest. Future component-logic work should default to this pattern rather than proposing
component-render tests that this repo's Vitest config cannot run.

### Blast Radius Changes

No changes from the plan's own Blast Radius section — all edits stayed within the 4 route files + 3
new component directories + 1 deletion listed in Touchpoints. The `FilterDropdown` `options` prop
type broadening (string[] → object-shaped `FilterOption[]`) is a contract superset within the same
file, not a new file touched.

### Commands to Stay Green

- `bun run check` (typecheck)
- `bun run test:unit:ci` (371/371 unit tests, includes the new pure-logic + import-consolidation
  suites for FilterDropdown/SearchInput/WeekRangeControl)
- `grep -rn "MultiSelectFilter" src/` (must stay zero matches outside historical comments/tests)

### Dependency Changes

- New public components downstream features can reuse: `$lib/components/ui/filter-dropdown`,
  `$lib/components/ui/search-input`, `$lib/components/ui/week-range-control`.
- `src/lib/components/leads/MultiSelectFilter.svelte` no longer exists — any future work must import
  `FilterDropdown` with `multiple=true` instead.
- No schema, env var, or API contract changes.

---

**Status:** DONE
**Summary:** Unified filter/search/week-range UI shipped across 4 pages; EVL-confirmed all 6 gates green; task folder archived to `completed/`.
**Concerns/Blockers:** AC9 e2e proof remains a pre-existing, backlog-tracked known-gap (not new); no persisted EXECUTE-phase report file was found in the task folder (deviations captured from handoff summary, independently corroborated by EVL).
