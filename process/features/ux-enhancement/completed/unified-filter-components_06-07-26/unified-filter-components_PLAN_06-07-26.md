---
name: plan:unified-filter-components
description: "COMPLEX plan — unify duplicated search/filter/week-range UI into 3 shared components (FilterDropdown, SearchInput, WeekRangeControl) across Up for Grabs, My Leads, Reports, Reminders"
date: 06-07-26
feature: ux-enhancement
---

# Unified Filter/Search/Toolbar Components — PLAN

**Date**: 06-07-26
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (single bounded plan, not a phase program — INNOVATE fan-out signal score 1/7)
Spec: `process/features/ux-enhancement/active/unified-filter-components_06-07-26/unified-filter-components_SPEC_06-07-26.md`
Prior art: `process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/` (Tabs.svelte, chip token contract, nav design tokens)

## Overview

Three new shared UI components (`FilterDropdown`, `SearchInput`, `WeekRangeControl`) replace 8
duplicated implementations across 4 pages (Up for Grabs, My Leads, Reports, Reminders). No
behavioral/data changes — pure component consolidation. All decisions below are locked from
INNOVATE; this PLAN does not re-decide them.

## Locked INNOVATE Decisions (baked in, not re-litigated)

1. **WeekRangeControl** — new purpose-built component, NOT a `Tabs.svelte` reuse. Combines preset
   toggle buttons (4w/8w/12w/All) + free-text number override in one compound control. Uses
   `role="radiogroup"` (or toggle-group semantics with `aria-pressed` on each button) — NOT
   `role="tablist"`/`"tab"` (Tabs.svelte's roving-tabindex tab-panel model cannot cleanly host an
   embedded text input). Visually borrows Tabs' `variant="segment"` pill styling for preset buttons.
2. **FilterDropdown** — ONE component generalized from `MultiSelectFilter.svelte` + a `multiple: boolean`
   prop. Only 2 branch points: (a) item-click handler — toggle-and-stay-open (`multiple=true`) vs
   select-and-close (`multiple=false`); (b) option row markup — checkbox input vs plain clickable row.
   Everything else (Popover.Root/Trigger/Content, label+count badge, Clear button, scrollable list,
   empty state) is identical to current `MultiSelectFilter`. Replaces both `MultiSelectFilter` raw
   usage (Up for Grabs Country/Category) and shadcn `Select` raw usage in scope (My Leads
   Stage/Platform/Country — stays single-select, restyle only). Team's `Select` (role field) is OUT
   of scope — form field, not list-filter.
3. **SearchInput** — new shared component. Canonical debounce = **300ms** (reverses SPEC's tentative
   1300ms suggestion — INNOVATE found no rate-limit/cost rationale in either
   `unassigned/+page.server.ts` or `leads/+page.server.ts` for the longer delay; 300ms is already
   proven in-repo on My Leads and is within conventional debounce range). **Flagged reversal —
   requires a manual side-by-side Hybrid-tier UX check confirming Up for Grabs doesn't feel "too
   twitchy" at 300ms before AC2 is called done** (see Verification Evidence AC2 row).
4. **Location**: all 3 new components go in `src/lib/components/ui/` (e.g. `ui/filter-dropdown/`,
   `ui/search-input/`, `ui/week-range-control/`), following the `Tabs.svelte` precedent.
   `MultiSelectFilter.svelte`'s current `src/lib/components/leads/` location is retired — delete once
   all call sites (currently only Up for Grabs) are migrated (checklist item 8).
5. **Reminders' Command-based combobox (rep filter)** — OUT of the FilterDropdown fold-in. Restyle
   only (border/focus/sizing to match new shared components' visual conventions). No behavior or
   component-structure change.
6. **Reports' date-range inputs** — stay native date inputs, out of scope. Reports' rep filter (raw
   `<select>` bound via `bind:value` around line 220 of `src/routes/reports/+page.svelte`) migrates
   onto `FilterDropdown(multiple=false)`.

## Scope

**In scope:** `FilterDropdown`, `SearchInput`, `WeekRangeControl` components; migration of Up for
Grabs, My Leads, Reports (non-date filters), and Reminders (restyle only) onto them; retirement of
`MultiSelectFilter.svelte`.

**Out of scope:** Pipeline/Calendar (no toolbar), Team's `Select` role field, any new filter
capability, Reports' date-range inputs, the shared Playwright auth fixture, the `@axe-core/playwright`
devDependency decision, any change to Reminders' search-as-you-type logic.

## Touchpoints

New files:
- `src/lib/components/ui/filter-dropdown/FilterDropdown.svelte` (+ `index.ts` barrel, matching `ui/tabs/` precedent)
- `src/lib/components/ui/search-input/SearchInput.svelte` (+ `index.ts`)
- `src/lib/components/ui/week-range-control/WeekRangeControl.svelte` (+ `index.ts`)

Modified files:
- `src/routes/unassigned/+page.svelte` (~lines 330-389: search input, MultiSelectFilter x2, inline weeks-ahead control)
- `src/routes/leads/+page.svelte` (~lines 250-300+: Filters popover — staleOnly/hasFutureEvents chips stay local, weeksAhead sub-control migrates to WeekRangeControl; shadcn `Select` Stage/Platform/Country → FilterDropdown(multiple=false); search input → SearchInput)
- `src/routes/reports/+page.svelte` (~lines 195-230: rep `<select>` → FilterDropdown(multiple=false); any text search if present → SearchInput; date inputs untouched)
- `src/routes/reminders/+page.svelte` (~lines 220-275: Command-based rep combobox — restyle only, no structural/behavioral change)

Deleted files:
- `src/lib/components/leads/MultiSelectFilter.svelte` (checklist item 8, after confirming zero remaining imports)

Read-only reference (not modified):
- `src/lib/components/ui/tabs/Tabs.svelte` (visual/token precedent for WeekRangeControl segment styling)
- `process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_REPORT_02-07-26.md` (design token conventions)

## Public Contracts

- `FilterDropdown` props: `{ label: string; options: string[]; selected: string[] | string; multiple: boolean; onchange: (values: string[] | string) => void }`. When `multiple=false`, `selected`/`onchange` operate on a single string value (empty string = none), preserving current My Leads/Reports single-value semantics; when `multiple=true`, identical to current `MultiSelectFilter` array contract.
- `SearchInput` props: `{ value: string; oninput: (value: string) => void; placeholder?: string; ariaLabel: string; debounceMs?: number (default 300) }`. Component owns its own debounce timer internally (mirrors current per-page `onSearchInput` handler pattern) rather than each page re-implementing `setTimeout`.
- `WeekRangeControl` props: `{ presets: number[]; value: number | null; onchange: (weeks: number | 'all') => void; overrideValue: string; onOverrideInput: (value: string) => void }`. `value === null` means "All" is active. Semantics preserved 1:1 from both current implementations (Up for Grabs inline control + My Leads Filters-popover sub-control).
- No schema, API route, or server-side contract changes — this plan is UI-component-only, consistent with `all-context.md`'s "server-side DB access only" convention being unaffected (no `+page.server.ts` files are modified).

## Blast Radius

- 3 new component files (+ 3 barrel `index.ts` files) — new surface, zero existing consumers until migration steps run.
- 4 modified route files (`unassigned/+page.svelte`, `leads/+page.svelte`, `reports/+page.svelte`, `reminders/+page.svelte`).
- 1 deleted file (`MultiSelectFilter.svelte`), contingent on zero remaining imports.
- Risk class: **none of the 6 high-risk classes** (no auth/identity, billing/credits, schema/migration, public API, container/proxy/gateway, or secrets/trust-boundary surface touched) — pure client-side UI consolidation.
- Total files touched: ~10 (6 new + 4 modified) + 1 deleted = within COMPLEX-but-single-plan bound; strategy-compare confirms sequential/single-agent execution is appropriate (see Resume and Execution Handoff).

## Implementation Checklist

Ordering matches INNOVATE's dependency graph: items 1-3 are independent and parallel-safe; items
4-7 depend on 1-3; item 8 depends on item 4's confirmation.

1. **Build `FilterDropdown`** (`src/lib/components/ui/filter-dropdown/FilterDropdown.svelte`) — generalize `MultiSelectFilter.svelte`'s markup verbatim (Popover.Root/Trigger/Content, label+count badge, Clear button, scrollable `<ul>`, empty-state paragraph), add `multiple: boolean` prop. Branch only: (a) `toggle()` function — array-toggle-and-stay-open when `multiple`, vs `select(option)` — set single value and call `Popover.Root`'s close (no dependency on 2-3).
   - **Pure-logic extraction (PVL supplement, mirrors `field-error.ts`/`field-error.spec.ts` precedent):** export the core branch logic as a plain `.ts` function `toggleOption(multiple: boolean, current: string[] | string, value: string): string[] | string` in a companion `src/lib/components/ui/filter-dropdown/filter-dropdown.ts` module (framework-free, no Svelte imports) — `FilterDropdown.svelte` imports and calls it rather than inlining the branch. This is what makes AC3/AC4/AC5 testable under this repo's node-only Vitest project (no jsdom/`@testing-library/svelte` configured).
2. **Build `WeekRangeControl`** (`src/lib/components/ui/week-range-control/WeekRangeControl.svelte`) — new component combining preset toggle buttons + free-text number input, `role="radiogroup"`/`aria-pressed` semantics (not tablist/tab), visually borrowing Tabs' `variant="segment"` pill classes. No dependency on 1 or 3.
   - **Pure-logic extraction (PVL supplement, mirrors `field-error.ts`/`field-error.spec.ts` precedent):** export the preset-selection/ARIA derivation as a plain `.ts` function `computeAriaPressed(presetValue: number, activeValue: number | null): boolean` (plus any preset-selection helper) in a companion `src/lib/components/ui/week-range-control/week-range-control.ts` module (framework-free, no Svelte imports) — `WeekRangeControl.svelte` imports and calls it. This is what makes AC6's aria-pressed/preset logic testable under this repo's node-only Vitest project.
3. **Build `SearchInput`** (`src/lib/components/ui/search-input/SearchInput.svelte`) — new component, internal debounce timer defaulting to 300ms, visually matching Up for Grabs' current search-box classes (canonical look per SPEC). No dependency on 1 or 2.
   - **Pure-logic extraction (PVL supplement, mirrors `field-error.ts`/`field-error.spec.ts` precedent):** export the debounce timing logic as a plain `.ts` function `createDebouncer(callback: (value: string) => void, ms?: number): (value: string) => void` in a companion `src/lib/components/ui/search-input/search-input.ts` module (framework-free, no Svelte imports) — `SearchInput.svelte` imports and calls it. This is what makes AC1/AC2's debounce timing testable via `vi.useFakeTimers()` under this repo's node-only Vitest project.
4. **Migrate Up for Grabs** (`src/routes/unassigned/+page.svelte`) onto all 3 new components — replace raw `<input>` search box, both `MultiSelectFilter` usages (Country/Category, `multiple=true`), and the inline weeks-ahead block (lines ~359-388) with `WeekRangeControl`. Depends on 1-3.
5. **Migrate My Leads** (`src/routes/leads/+page.svelte`) onto `FilterDropdown(multiple=false)` for Stage/Platform/Country, `WeekRangeControl` for the weeksAhead sub-control inside the Filters popover (staleOnly/hasFutureEvents chip buttons stay local — not part of this consolidation, they're not duplicated elsewhere), and `SearchInput` for the search box. Depends on 1-3.
   - **Execute-agent instruction (mandatory, PVL supplement — single-select cardinality regression guard):** `multiple={false}` MUST be passed EXPLICITLY as a literal prop value at all 3 `FilterDropdown` call sites (Stage, Platform, Country) in this file. Never omit the prop or rely on a component default — current code is explicit `type="single"` at `leads/+page.svelte:170` and this migration must preserve that explicitness verbatim, not implicitly.
6. **Migrate Reports** (`src/routes/reports/+page.svelte`) — rep `<select>` (~line 220) → `FilterDropdown(multiple=false)`; any raw text search input in the filter bar → `SearchInput`; date-range `<input type="date">` elements at ~lines 195-215 are explicitly untouched. Depends on 1 and 3.
7. **Restyle Reminders' Command combobox** (`src/routes/reminders/+page.svelte`, ~lines 220-275) — chrome only: adjust border/focus-ring/sizing classes on the `Popover`/`Command`/`CommandInput` wrapper to match the shared visual language established by FilterDropdown/SearchInput. Do not touch `shouldFilter`, `navigateRepFilter`, `CommandItem` click handlers, or any search-as-you-type logic. Depends on 3 (for shared visual-token reference only).
8. **Delete `MultiSelectFilter.svelte`** (`src/lib/components/leads/MultiSelectFilter.svelte`) — run `grep -rn "MultiSelectFilter" src/` first to confirm zero remaining imports outside the deleted file itself, then delete. Depends on 4 (Up for Grabs is the only current consumer).

## Acceptance Criteria

This plan carries forward the SPEC's AC1-AC10 verbatim (see SPEC file for full text). Summary —
all 10 are testable and each is bound to a proving gate in Verification Evidence below:

- AC1: One shared SearchInput used on all 4 pages, one documented debounce timing.
- AC2: Debounce timing (300ms canonical) does not regress UX — requires manual side-by-side check.
- AC3: One shared FilterDropdown with a `multiple` prop replacing MultiSelectFilter + raw Select.
- AC4: My Leads Stage/Platform/Country keep single-select cardinality after migration.
- AC5: Up for Grabs Country/Category keep multi-select cardinality after migration.
- AC6: One shared WeekRangeControl replaces all 3 duplicated week-range implementations.
- AC7: Reminders' rep combobox is restyled only — component identity and behavior unchanged.
- AC8: Reports' filter bar adopts shared components for non-date filters only.
- AC9: No visual/functional regression to filtering on any of the 4 pages (Known-Gap e2e residual).
- AC10: No accessibility regression on migrated controls (Agent-Probe fallback, no axe-core yet).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest: single canonical `SearchInput` import path across all 4 route files (grep/import-consolidation check, same pattern as prior program's AC9/AC10) | Fully-Automated | AC1 |
| Vitest: extracted pure `createDebouncer(callback, 300)` fires at 300ms using fake timers (`vi.useFakeTimers()`) — component logic, no render needed (`field-error.ts` precedent) | Fully-Automated | AC1 |
| Vitest: extracted pure `createDebouncer` default value matches agreed canonical 300ms constant | Fully-Automated | AC2 (part) |
| **Manual side-by-side Hybrid check**: compare Up for Grabs search feel at 300ms vs prior 1300ms; confirm not "too twitchy"; record outcome in execute report | Hybrid | AC2 (part — required before AC2 can be called done, per reversal note) |
| Vitest: extracted pure `toggleOption(true, current, value)` called repeatedly asserts 2+ simultaneous active values (component logic, no render needed — pure-logic extraction, `field-error.ts` precedent) | Fully-Automated | AC3, AC5 |
| Vitest: extracted pure `toggleOption(false, current, value)` called repeatedly always closes the "would-be-open" state and holds exactly 1 active value (component logic, no render needed) | Fully-Automated | AC3, AC4 |
| Vitest: import-consolidation check — Up for Grabs + My Leads filter call sites import `FilterDropdown`, not `MultiSelectFilter`/shadcn `Select` | Fully-Automated | AC3 |
| Vitest: extracted pure `toggleOption(false, ...)` called with each of My Leads' Stage/Platform/Country values in turn holds only 1 active value at a time post-migration (component logic, no render needed) | Fully-Automated | AC4 |
| Vitest: extracted pure `toggleOption(true, ...)` called with Up for Grabs' Country/Category values holds 2+ simultaneous active values post-migration (component logic, no render needed) | Fully-Automated | AC5 |
| Vitest: extracted pure `computeAriaPressed(...)`/preset-selection logic asserts correct `aria-pressed` per preset (component logic, no render needed); import-consolidation check across Up for Grabs + My Leads call sites (Fully-Automated); actual keyboard focus-order/roving-tabindex behavior stays Agent-Probe (manual) — real DOM focus needs component rendering, which this repo cannot do | Fully-Automated (logic + import) / Agent-Probe (keyboard) | AC6 |
| **Cardinality regression guard (new row, PVL supplement):** extracted pure `toggleOption(false, current, value)` called 3+ times in sequence with different values always yields exactly 1 active value (never accumulates) — proves My Leads' Stage/Platform/Country selection replaces rather than appends when `multiple=false` | Fully-Automated | AC4 |
| Vitest: Reminders rep filter still imports from `src/lib/components/ui/command/` (component identity unchanged) | Fully-Automated | AC7 (part) |
| Manual/code-review: Reminders typing-to-filter behavior unchanged (compare `navigateRepFilter`/`filteredReps` logic before/after) | Hybrid | AC7 (part) |
| Vitest: import-consolidation check — Reports' rep filter (and any text search) imports shared components; date inputs unchanged | Fully-Automated | AC8 |
| Existing Playwright specs re-run: `e2e/unassigned-filters.e2e.ts` + equivalent specs for other 3 pages if present | Agent-Probe (Known-Gap residual — self-skips per pre-existing missing auth fixture) | AC9 |
| Manual/code-review accessibility check of migrated SearchInput/FilterDropdown/WeekRangeControl (name/role/focus-visible parity or improvement vs prior implementations) | Agent-Probe | AC10 |

**Known-gap disclosure (not a silent PASS):** AC9's e2e proof is a pre-existing, inherited Known-Gap
(no shared Playwright authenticated-session fixture exists — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
Per the vacuous-green ban, this keeps AC9's gate **CONDITIONAL**, not silently rounded to PASS: the
Agent-Probe (manual/code-review) fallback is the actual proving strategy for AC9 in this plan, and
the e2e Known-Gap is recorded as a backlog residual — same treatment the completed
`sitewide-ux-refresh_02-07-26` program used for the identical gap.

## Test Infra Improvement Notes

(none identified yet — beyond the already-tracked, pre-existing Playwright auth-fixture gap and the
`@axe-core/playwright` devDependency decision, both explicitly out of scope for this plan per SPEC
Constraints/Out-of-Scope)

## Phase Completion Rules

This is a single-plan COMPLEX task (not a phase program) — there is one phase: EXECUTE against the
8-item Implementation Checklist above. Completion rule: the plan is **CODE DONE** when all 8
checklist items are applied and the Fully-Automated Verification Evidence gates are green; it is
**VERIFIED** only after the Hybrid-tier manual side-by-side debounce check (AC2) and the
Agent-Probe accessibility/regression checks (AC9, AC10) are also recorded, with AC9's known e2e
gap explicitly logged as CONDITIONAL (not silently rounded to PASS) per the vacuous-green ban.

## Risks

- **Debounce reversal (1300ms → 300ms) is a UX judgment call**, not purely mechanical — mitigated by
  the mandatory Hybrid-tier manual side-by-side check before AC2 is called done (see Verification
  Evidence). If the manual check finds 300ms genuinely too twitchy for Up for Grabs' data volume,
  the fallback is to raise the canonical constant (single source of truth in `SearchInput`), not to
  fork per-page debounce values.
- **My Leads Filters popover mixes migrated (weeksAhead) and non-migrated (staleOnly/hasFutureEvents
  chip buttons) controls** in the same popover — checklist item 5 must be careful to only touch the
  weeksAhead sub-control and leave the two chip-button filters using their existing local
  `chipActive*`/`chipInactive` classes untouched (they are not part of this SPEC's duplication set).
- **MultiSelectFilter deletion (item 8) is irreversible-in-spirit but low-risk** — mitigated by
  running the `grep -rn "MultiSelectFilter"` check first; if any additional call site is discovered
  beyond Up for Grabs, defer deletion and add that site to the migration scope instead of deleting
  early.

## Dependencies

- No new npm/bun package dependencies required — components use existing `$lib/components/ui/popover`, `$lib/components/ui/command` (read-only for Reminders), and existing Tailwind token classes.
- Checklist items 1-3 have no dependencies on each other (parallel-safe).
- Items 4-6 each depend on the relevant subset of 1-3 (see per-item dependency notes above).
- Item 7 depends only on 3 (visual-token reference, not a functional dependency).
- Item 8 depends on item 4's completion + confirmation.

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/ux-enhancement/active/unified-filter-components_06-07-26/unified-filter-components_PLAN_06-07-26.md` (this file)
2. **Last completed phase or step**: PLAN written; VALIDATE cycle 2 complete (PVL-supplement cycle 1 applied and re-validated); no EXECUTE steps started
3. **Validate-contract status**: written — CONDITIONAL (vacuous-green-ban override only; see `## Validate Contract` below)
4. **Supporting context files loaded**: `process/context/all-context.md`, `process/context/tests/all-tests.md`, this feature's SPEC file, `process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/` (Tabs.svelte + token precedent), `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (Known-Gap context for AC9), `src/lib/components/ui/field-error/` (pure-logic-extraction precedent, re-confirmed during cycle 2)
5. **Next step for a fresh agent picking up mid-execution**: confirm which checklist items (1-8) are complete by checking for the existence of `src/lib/components/ui/filter-dropdown/`, `ui/search-input/`, `ui/week-range-control/` and whether `src/lib/components/leads/MultiSelectFilter.svelte` still exists; resume at the first incomplete item in dependency order.

**Strategy note (fed to `vc-agent-strategy-compare` at phase-end):** signal score 1/7 (S7 — 5+
files in blast radius, borderline at ~10 files but no other signals present: no multi-package
scope, no schema/API/auth surface, no phase-program classification, no explicit user request for
depth, no high-risk class). Recommended strategy for EXECUTE: **sequential single vc-execute-agent**
given the tight dependency chain (items 4-8 all gate on 1-3); items 1-3 could optionally run as 3
parallel subagents but the coordination overhead is not worth it for 3 small, independent files.
Re-confirmed unchanged at VALIDATE cycle 2 — the supplement added checklist sub-steps, not new
independent surfaces, so the signal score and strategy recommendation are unaffected.

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl
supersedes: 06-07-26 (outer-pvl) — cycle 2 re-validation after PVL-supplement cycle 1 (pure-logic-extraction for `toggleOption`/`computeAriaPressed`/`createDebouncer` + explicit `multiple={false}` execute-agent instruction + My Leads cardinality-guard row); this contract overwrites the cycle-1 CONDITIONAL contract recorded the same date

Parallel strategy: sequential
Rationale: signal score 1/7 (S7 borderline — ~10 files in blast radius, no other signal present); tight dependency chain (checklist items 4-8 all gate on 1-3) makes sequential the right fit, matching the plan's own strategy note. Unchanged from cycle 1 — re-confirmed at cycle 2: the supplement added checklist sub-steps, not new independent surfaces or new signals.

**Cycle 2 re-validation summary:** Fresh V1-V7 pass (not a rubber-stamp of the SUPPLEMENT_APPLIED signal). Verified directly: (1) `src/lib/components/ui/field-error/field-error.ts` + `field-error.spec.ts` read in full — the supplement's pure-logic-extraction pattern (companion framework-free `.ts` module, co-located with the `.svelte` component, tested via plain `describe`/`it` Vitest blocks with no render) matches this precedent exactly; (2) `vite.config.ts` re-read — confirms exactly one Vitest project (`"server"`, `environment: 'node'`), no jsdom, and `package.json` has no `@testing-library/svelte`/jsdom entries, confirming the "component-render tests are impossible" claim and that the pure-function extraction is the correct (only) fix; (3) `leads/+page.svelte:170` re-read — `type="single"` still explicit, confirming the My Leads cardinality risk this supplement targets; (4) `grep -rn "MultiSelectFilter" src/` re-run — still exactly 2 matches, both in `unassigned/+page.svelte`, unchanged from cycle 1; (5) Sections B/D/E/F (Up for Grabs, Reports, Reminders, deletion-safety) re-read at their stated line ranges — all unchanged and still accurate, since no EXECUTE has happened yet (only the plan text changed between cycle 1 and cycle 2).

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Single shared SearchInput imported on all 4 route files | Fully-Automated | Vitest: `readFileSync`-based import-path check across `unassigned/+page.svelte`, `leads/+page.svelte`, `reports/+page.svelte`, `reminders/+page.svelte` asserting each source-text-imports `$lib/components/ui/search-input` | A |
| AC1 (debounce) | SearchInput's internal debounce timer fires at the documented ms value | Fully-Automated | Vitest: unit test against an extracted `createDebouncer(ms)` pure function using `vi.useFakeTimers()` — NOT a rendered-`.svelte`-component test, since this repo has no jsdom / `@testing-library/svelte` (re-confirmed cycle 2: `vite.config.ts` defines only one Vitest project, `"server"`, `environment: 'node'`) | B |
| AC2 | 300ms canonical debounce (reversed from SPEC's tentative 1300ms) does not regress UX on any of the 4 pages | Hybrid | Manual side-by-side comparison (300ms vs prior 1300ms on Up for Grabs), recorded in the execute report, required before AC2 is called done — already scheduled in the plan's own Risks section | A (mandatory EXECUTE step, already present in plan) |
| AC3 | One shared FilterDropdown with a `multiple` prop replaces MultiSelectFilter + raw Select | Fully-Automated | Vitest: `readFileSync` import-consolidation check — Up for Grabs + My Leads filter call sites import `$lib/components/ui/filter-dropdown`, not `MultiSelectFilter`/shadcn `Select` | A |
| AC3 (behavior) | `multiple=true` toggle-and-stay-open vs `multiple=false` select-and-close branch logic | Fully-Automated | Vitest: unit test against an extracted pure `toggleOption(multiple, current, value)` function (mirrors the existing `field-error.ts`/`field-error.spec.ts` precedent, re-confirmed cycle 2 by direct read) — NOT a rendered-component interaction test | B |
| AC4 | **My Leads Stage/Platform/Country keep single-select cardinality** (flagged breaking-change risk — current shadcn `Select` usage is explicit `type="single"`, re-confirmed cycle 2 at `leads/+page.svelte:170`) | Fully-Automated | Vitest: `toggleOption(false, current, value)` called twice with different values asserts exactly 1 active value each time, PLUS an execute-agent instruction requiring `multiple={false}` to be passed explicitly (never defaulted) at all 3 My Leads call sites | B |
| AC5 | Up for Grabs Country/Category keep multi-select cardinality | Fully-Automated | Vitest: `toggleOption(true, current, value)` called twice with different values asserts 2 simultaneous active values | B |
| AC6 | One shared WeekRangeControl; ARIA/keyboard semantics preserved | Fully-Automated (import + logic) / Agent-Probe (keyboard) | Vitest import-consolidation check (Fully-Automated); extracted `computeAriaPressed(...)`/preset-selection pure-logic test (Fully-Automated); actual keyboard focus-order/roving-tabindex behavior stays Agent-Probe (manual) — real DOM focus behavior needs component rendering, which this repo cannot do | B (import + logic rows) / A (manual keyboard probe, unchanged from plan) |
| AC7 | Reminders rep combobox restyled only, behavior unchanged | Fully-Automated + Hybrid | Vitest `readFileSync` check confirming continued import from `ui/command/` (Fully-Automated); manual/code-review diff confirming no non-class-attribute lines changed in `navigateRepFilter`/`shouldFilter`/`CommandItem` handlers (Hybrid) | A |
| AC8 | Reports filter bar adopts shared components (non-date only) | Fully-Automated | Vitest `readFileSync` import-consolidation check on `reports/+page.svelte`; targeted grep confirms the two `<input type="date">` elements (~lines 195-215) are unchanged | A |
| AC9 | No visual/functional regression across all 4 pages | Known-Gap | Existing Playwright specs (`unassigned-filters.e2e.ts` + equivalents) re-run but self-skip on the pre-existing missing shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — inherited, already disclosed by the plan, not silently rounded to PASS; this is the sole driver of the CONDITIONAL gate below (vacuous-green ban) | D |
| AC10 | No accessibility regression | Agent-Probe | Manual/code-review accessibility check (name/role/focus-visible parity vs prior implementations); `@axe-core/playwright` not installed (open backlog decision, `axe-core-devdependency-decision_NOTE_02-07-26.md`) | C (rationale: no automated a11y harness exists repo-wide yet; identical accepted pattern used by the completed sitewide-ux-refresh program; not vacuous-green-ban-triggering since Agent-Probe is a legitimate proving strategy) |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — pure-logic-extraction sub-steps now present in items 1, 2, 3, 5; not yet executed since EXECUTE has not started)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap (AC9) is a named residual row, never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- SearchInput import + debounce (AC1/AC2): Fully-automated: `bun run test:unit:ci` (once EXECUTE adds the debounce-factory + import-check tests per checklist items 1-3) | Hybrid: manual side-by-side UX check (AC2), recorded in execute report
- FilterDropdown multiple/single logic (AC3/AC4/AC5): Fully-automated: `bun run test:unit:ci` (pure-logic tests, checklist items 1 + 5) | agent-probe: keyboard/ARIA manual walkthrough (AC6, AC10)
- Reminders restyle (AC7): Fully-automated: `bun run test:unit:ci` (import-identity check) | hybrid: manual diff review of Command handlers
- Reports migration (AC8): Fully-automated: `bun run test:unit:ci` (import-consolidation + date-input grep)
- MultiSelectFilter deletion safety (checklist item 8): Fully-automated: `grep -rn "MultiSelectFilter" src/` (must return zero matches outside the deleted file before item 8 runs) — re-confirmed during this cycle-2 VALIDATE pass: still exactly 2 matches, both in `unassigned/+page.svelte`
- e2e regression (AC9): known-gap: documented — self-skips on missing Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

Failing stubs (Fully-Automated rows):

```
test("should import SearchInput on all 4 route files (unassigned, leads, reports, reminders)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1 import-consolidation check")
})
test("should fire SearchInput's debounce callback at the canonical 300ms via createDebouncer + vi.useFakeTimers", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1 debounce timing (pure-function extraction)")
})
test("should import FilterDropdown (not MultiSelectFilter/shadcn Select) on Up for Grabs + My Leads call sites", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3 import-consolidation check")
})
test("should toggle-and-stay-open when multiple=true vs select-and-close when multiple=false (toggleOption pure function)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3 behavior (pure-function extraction)")
})
test("should hold exactly 1 active value across repeated toggleOption(false, ...) calls (My Leads Stage/Platform/Country)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4 single-select cardinality regression guard")
})
test("should hold 2+ simultaneous active values across repeated toggleOption(true, ...) calls (Up for Grabs Country/Category)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5 multi-select cardinality guard")
})
test("should import WeekRangeControl on Up for Grabs + My Leads call sites and compute aria-pressed correctly per preset", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6 import-consolidation + aria-pressed pure-logic check")
})
test("should still import Reminders rep filter from src/lib/components/ui/command/ (component identity unchanged)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7 import-identity check")
})
test("should import shared components on Reports' non-date filters; date <input type=\"date\"> elements remain unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8 import-consolidation + date-input grep guard")
})
```

Dimension findings:
- Infra fit: PASS — pure client-side Svelte 5 component consolidation; no schema/API/server/container/auth surface touched (confirmed: none of the 4 modified route files' co-located `+page.server.ts` are in the Touchpoints list); new components' location (`src/lib/components/ui/{filter-dropdown,search-input,week-range-control}/`) matches the existing `ui/tabs/` precedent exactly. Unchanged from cycle 1.
- Test coverage: **PASS (cycle 2 — RESOLVED, was CONCERN in cycle 1).** The pure-logic-extraction supplement (checklist items 1, 2, 3 now export `toggleOption`/`computeAriaPressed`/`createDebouncer` as framework-free companion `.ts` modules) is confirmed, by direct read of both `src/lib/components/ui/field-error/field-error.ts` and `field-error.spec.ts` during this cycle, to mirror that precedent exactly: co-located companion module with no Svelte imports, tested via plain `describe`/`it` Vitest blocks with zero component rendering. `vite.config.ts` re-confirmed: exactly one Vitest project (`"server"`, `environment: 'node'`), no jsdom; `package.json` has no `@testing-library/svelte`/jsdom entries. The Verification Evidence rows for AC1/AC3/AC4/AC5/AC6 now describe testable, executable Vitest strategies (pure-function unit tests, fake timers for debounce, import-path greps) — no remaining component-render claims anywhere in the table. AC9's e2e Known-Gap remains correctly and explicitly disclosed (unchanged, not a new finding).
- Breaking changes: **PASS (cycle 2 — RESOLVED, was CONCERN in cycle 1).** The My Leads single-select cardinality risk now has (a) a concrete proving mechanism — the new cardinality-guard Verification Evidence row: `toggleOption(false, ...)` called 3+ times in sequence with different values always yields exactly 1 active value — and (b) an explicit execute-agent instruction requiring `multiple={false}` to be passed literally (never defaulted) at all 3 My Leads FilterDropdown call sites, directly citing the current explicit `type="single"` at `leads/+page.svelte:170` (re-confirmed present, unchanged, during this cycle). No schema/API/public-contract breakage found (unchanged from cycle 1).
- Security surface: PASS — no auth/identity/billing/secrets/trust-boundary surface touched; quick STRIDE/OWASP scan finds nothing applicable (pure client-rendered list-filter UI, zero new data flows, zero new endpoints). Unchanged from cycle 1.

Layer 2 sections:
- Section A — New Components (checklist items 1-3): **PASS (cycle 2 — RESOLVED, was CONCERN in cycle 1).** Checklist items 1, 2, 3 now each carry an explicit pure-logic-extraction sub-step producing framework-free companion `.ts` modules (`filter-dropdown.ts`, `week-range-control.ts`, `search-input.ts`), matching the `field-error.ts` precedent read in full during this cycle. No file-path collisions confirmed: none of the 3 new component directories (`ui/filter-dropdown/`, `ui/search-input/`, `ui/week-range-control/`) exist yet on disk. Highest-risk edit unchanged: `FilterDropdown`'s `toggle()`/`select()` branch — now correctly mitigated via TDD against the extracted pure function before wiring the component markup.
- Section B — Up for Grabs Migration (item 4): PASS — unchanged from cycle 1; re-confirmed `unassigned/+page.svelte` lines ~330-383 (search input + both `MultiSelectFilter` usages + inline weeks-ahead block) still match the plan's stated range.
- Section C — My Leads Migration (item 5): **PASS (cycle 2 — RESOLVED, was CONCERN in cycle 1, the single highest-risk section in the whole plan).** The explicit `multiple={false}` execute-agent instruction is now present in checklist item 5 (mandatory, PVL supplement note), plus the new cardinality-guard Verification Evidence row directly proves the extracted logic never accumulates values under repeated single-select calls. Re-confirmed `leads/+page.svelte:170-205` `Select` block (`type="single"` explicit) unchanged since cycle 1.
- Section D — Reports Migration (item 6): PASS — unchanged from cycle 1; re-confirmed `reports/+page.svelte` rep `<select>` block (~lines 195-230) and the two `<input type="date">` elements are correctly scoped out.
- Section E — Reminders Restyle (item 7): PASS — unchanged from cycle 1; re-confirmed `reminders/+page.svelte` `Command`/`Popover` combobox block (~lines 220-280) with `navigateRepFilter`/`filteredReps`/`shouldFilter={false}` intact.
- Section F — MultiSelectFilter Deletion (item 8): PASS — unchanged from cycle 1; re-ran `grep -rn "MultiSelectFilter" src/` during this cycle-2 pass — still exactly 2 matches, both in `unassigned/+page.svelte` (matches the plan's "only current consumer" claim exactly).

### Layer 1 dimensions

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

### Layer 2 sections

| Layer 2 sections | Status |
|---|---|
| Section A — New Components (items 1-3) | PASS |
| Section B — Up for Grabs Migration (item 4) | PASS |
| Section C — My Leads Migration (item 5) | PASS |
| Section D — Reports Migration (item 6) | PASS |
| Section E — Reminders Restyle (item 7) | PASS |
| Section F — MultiSelectFilter Deletion (item 8) | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 10 PASSes**

**→ Net Gate: CONDITIONAL (vacuous-green-ban override — NOT a dimension/section failure)**

All 4 Layer-1 dimensions and all 6 Layer-2 sections are now PASS — cycle 1's 2 real CONCERNs
(test-harness realism, single-select proof) are resolved by the PVL supplement. The gate is
nonetheless CONDITIONAL, not PASS, because of the **Net-Gate Vacuous-Green Ban**: AC9 (no
visual/functional regression across all 4 pages) has ZERO Fully-Automated or Hybrid gate proving it
— its only coverage is a Known-Gap (Playwright e2e specs that self-skip on the pre-existing missing
shared auth fixture). This is a classification gate, not a fresh unresolved concern: the gap is
already named, already justified in writing (this plan's own Acceptance Criteria + Known-gap
disclosure sections, both unchanged since cycle 0), and already linked to a backlog artifact
(`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). It is identical in nature
and treatment to the accepted precedent in the completed `sitewide-ux-refresh_02-07-26` program. No
further PVL-supplement cycle can resolve it — writing the shared Playwright auth fixture is
explicitly out of scope for this plan (see SPEC Out of Scope).

Known Gaps (excluded from CONCERN/FAIL count, pre-classified; unchanged from cycle 1):
- AC9 e2e residual — known-gap: documented as NEW PLAN REQUIRED — see backlog `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (pre-existing, inherited, program-wide gap; this is the sole driver of the CONDITIONAL classification, per the vacuous-green ban)
- AC10 automated accessibility gate — known-gap: documented — see backlog `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md` (open program-level decision, not re-litigated here; does NOT trigger the vacuous-green ban since AC10's proving strategy is Agent-Probe, a legitimate proving strategy, not Known-Gap-only)

Open gaps:
- Cycle 1's 2 open gaps (test-harness realism proving mechanism for AC3/AC4/AC5/AC6; missing explicit `multiple={false}` instruction for My Leads) are **RESOLVED** as of this cycle-2 pass — see `unified-filter-components-pvl-iteration-001_REPORT_06-07-26.md`.
- AC9's e2e regression proof remains a named, accepted, backlog-linked residual (vacuous-green-ban classification; NEW PLAN REQUIRED to resolve — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Not a new gap — inherited unchanged from cycle 0/1.

What this coverage does NOT prove:
- Import-consolidation `readFileSync` checks (AC1, AC3, AC7, AC8) prove source-text import paths only — they do NOT prove the rendered component looks or behaves correctly in a browser.
- Pure-logic tests (AC1 debounce, AC3/AC4/AC5 toggle behavior, AC6 aria-pressed) prove the extracted branch logic is correct — they do NOT prove the actual `.svelte` component wires that logic correctly into its markup/event handlers (no component-render harness exists to prove that link). This is an accepted, inherent limit of the pure-logic-extraction approach, not a defect introduced by the supplement.
- The Hybrid manual side-by-side debounce check (AC2) and the Hybrid Reminders diff review (AC7) are one-time human judgment calls at EXECUTE time — they do NOT provide ongoing regression protection against future changes.
- Agent-Probe accessibility review (AC10) and Agent-Probe keyboard/focus-order check (AC6) are manual/code-review judgment — they do NOT provide automated regression protection (no `@axe-core/playwright`, no jsdom).
- The AC9 Known-Gap means there is currently ZERO automated end-to-end proof that filtering/searching still functions correctly in a real browser session on any of the 4 pages after migration. This is the specific gap driving the CONDITIONAL gate above.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: CONDITIONAL (vacuous-green-ban override only — all dimension/section CONCERNs from cycle 1 are resolved; the sole remaining driver is AC9's pre-existing, out-of-scope, backlog-linked Known-Gap residual)
Accepted by: session (autonomous validate re-run, orchestrator-directed) — accepting AC9's Known-Gap residual as the CONDITIONAL driver, consistent with (a) this plan's own pre-written Acceptance Criteria disclosure explicitly invoking the vacuous-green ban for AC9, (b) the identical accepted precedent in the completed `sitewide-ux-refresh_02-07-26` program, and (c) `orchestration.md` §PVL routing's mechanical legality gate — this is PVL cycle 2, with cycle 1's supplement already recorded in `results.tsv` (3 lines: header + baseline + cycle-1 row), satisfying "Gate: CONDITIONAL with N≥1 recorded fix cycles." No further supplement cycle is warranted or would help: AC9's gap is structurally unfixable within this plan's scope (the shared Playwright auth fixture is explicitly out of scope per SPEC Out of Scope).

## Autonomous Goal Block

SESSION GOAL: Unify duplicated search/filter/toolbar UI (FilterDropdown, SearchInput, WeekRangeControl) across Up for Grabs, My Leads, Reports, Reminders — zero behavior change except the locked 300ms debounce reversal (see Locked INNOVATE Decisions).
Charter + umbrella plan: N/A — single plan (`process/features/ux-enhancement/active/unified-filter-components_06-07-26/unified-filter-components_PLAN_06-07-26.md`)
Autonomy: Standard RIPER-5 autonomy — the cycle-2 CONDITIONAL gate (vacuous-green-ban override on AC9's pre-existing, out-of-scope Known-Gap) is accepted per orchestration.md §PVL routing's mechanical legality rule (≥1 recorded supplement cycle); irreversible/outward-facing actions and the EXECUTE approval gate still require explicit confirmation.
Hard stop conditions / safety constraints:
- Do not delete `MultiSelectFilter.svelte` (checklist item 8) until a fresh `grep -rn "MultiSelectFilter" src/` confirms zero remaining imports outside the file itself.
- Do not let My Leads' Stage/Platform/Country FilterDropdown instances default away from `multiple={false}` — this is the plan's single highest breaking-change risk (current code is explicit `type="single"`); pass it literally at all 3 call sites, per the mandatory execute-agent instruction in checklist item 5.
- Do not change Reminders' `shouldFilter`/`navigateRepFilter`/`CommandItem` search-as-you-type logic — restyle (class/border/focus/sizing) only.
- Do not touch Reports' `<input type="date">` date-range elements.
- Do not add `@axe-core/playwright` or a jsdom/`@testing-library/svelte` devDependency to close the AC9 Known-Gap — that decision is explicitly out of scope for this plan; the pure-logic-extraction approach (`field-error.ts` precedent) is the accepted mitigation for testability, and AC9's e2e gap itself is accepted as a named residual, not solved by a new dependency.
Next phase: EXECUTE — validate-contract gate is CONDITIONAL (vacuous-green-ban override only, all real CONCERNs resolved); ready to route to `vc-execute-agent` against the 8-item Implementation Checklist above.
Validate contract: inline in this plan file (`## Validate Contract` section above)
Execute start: `bun run check` · `bun run test:unit:ci` (once checklist items 1-3/5 land the pure-logic modules + tests) · `grep -rn "MultiSelectFilter" src/` (pre-deletion check, item 8) · manual Hybrid debounce side-by-side (AC2) · Hybrid manual diff review (AC7) · Agent-Probe accessibility + keyboard review (AC6, AC10) · Known-Gap e2e self-skip (AC9, pre-accepted, drives the CONDITIONAL gate). High-risk pack: no (risk class: none of the 6 — pure client-side UI consolidation, no schema/auth/API/billing/container/secrets surface).


---

PHASE_COMPLETE: PLAN — process/features/ux-enhancement/active/unified-filter-components_06-07-26/unified-filter-components_PLAN_06-07-26.md written. Proceed to VALIDATE.
