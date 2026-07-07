---
name: plan:unified-filter-components-spec
description: "Product-discovery SPEC — unify duplicated search/filter/toolbar UI (search inputs, filter dropdowns, week-range segmented control) across Up for Grabs, My Leads, Reminders, and Reports"
date: 06-07-26
feature: ux-enhancement
---

# Unified Filter/Search/Toolbar Components — SPEC

## Summary

Four pages in the CRM — Up for Grabs, My Leads, Reminders, and Reports — each rebuilt their own
version of the same three UI pieces: a search box, a dropdown filter, and a "how far ahead in time"
selector. Because each page built its own copy, they look and behave slightly differently even
though they do the same job, and any future fix (styling, accessibility, bug) has to be applied up
to three times instead of once. This work consolidates those duplicated pieces into shared
components with one visual language, using the Up for Grabs page (the version the user likes best)
as the starting point for how things should look and feel. No page's filtering behavior changes
except where explicitly called out below — this is a consistency and maintainability pass, not a
new-feature pass.

## User Stories / Jobs To Be Done

- As a rep using any list page (Up for Grabs, My Leads, Reminders, Reports), I want the search box
  to look, feel, and respond the same way everywhere, so that I don't have to relearn timing or
  interaction quirks when I switch pages.
- As a rep filtering by a dropdown (Country, Category, Stage, Platform, rep), I want the same visual
  dropdown/checkbox/popover experience everywhere it applies, so that filtering feels like one
  consistent tool instead of three different-looking widgets.
- As a rep using a "how far ahead" time-range control (e.g. Up for Grabs' 4w/8w/12w/All), I want it
  to look and behave the same everywhere the pattern appears, so the control is instantly familiar.
- As a manager reviewing Reminders' rep filter, I want its search-as-you-type behavior to keep
  working exactly as it does today, just restyled to match the rest of the app, so nothing about
  how I use it changes.
- As a developer maintaining this codebase, I want one shared component per UI pattern (search,
  filter dropdown, segmented control) instead of three to five near-duplicates, so that a future
  fix or accessibility improvement only has to be made once.

## What The User Wants (Behavioral Outcomes)

- Every search box on Up for Grabs, My Leads, Reminders, and Reports looks the same (size, border,
  icon/clear affordance if any) and reacts to typing the same way (same debounce feel), while still
  searching only the fields each page already searches today (no new search scope).
- Every dropdown-style filter used for picking one or more values from a list (Country, Category,
  Stage, Platform on My Leads; Country/Category on Up for Grabs) opens, displays, and closes the
  same way, using the checkbox-popover look Up for Grabs already has. Single-choice filters (like My
  Leads' Stage/Platform/Country) keep picking exactly one value each — only their visual chrome
  changes, not their pick-one-vs-many behavior.
- The "how many weeks ahead" style control (currently three different hand-built versions) becomes
  one shared, consistently-styled control wherever that pattern is used.
- Reminders' rep search-as-you-type filter keeps working exactly the same way it does today — same
  typing behavior, same result narrowing — just restyled to match the rest of the app's borders,
  focus states, and sizing.
- Reports' filter bar (date range + rep) adopts the shared search/filter look wherever it applies
  without changing what can be filtered or how results update.
- Nobody using any of these four pages today notices a loss of functionality — only a more
  consistent look and feel.

## Flow / State Diagram

```
BEFORE (today) — 3 to 5 different implementations per UI pattern:

  Up for Grabs -----> raw <input>, 1300ms debounce -----\
  My Leads     -----> shadcn Input, 300ms debounce  ------> 3 different search boxes
  Reports      -----> raw <input>, no debounce      -----/

  Up for Grabs -----> MultiSelectFilter (checkbox popover) ---\
  My Leads     -----> shadcn Select (single-value)         ----> 3 different filter dropdowns
  Reminders    -----> Command combobox (search-to-filter)  ---/       (Reminders stays distinct)

  Up for Grabs -----> inline hand-rolled segmented buttons  ---\
  My Leads     -----> "Filters" popover, locally-styled chips --> 3 different week-range controls
                       (each with its own CSS classes)       ---/


AFTER (target state):

  ┌─────────────────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
  │   SearchInput (shared)   │     │  FilterDropdown (shared)  │     │ SegmentedControl /  │
  │  - one debounce timing   │     │  - `multiple` prop:        │     │ Tabs.svelte (shared)│
  │  - one visual style       │     │    true  = checkbox popover│     │  - one look, one    │
  └───────────┬──────────────┘     │    false = single-select   │     │    keyboard model   │
              │                    │  - same trigger/popover     │     └──────────┬──────────┘
              │                    │    chrome for both modes    │                │
  ┌───────────┴───────────┐        └──────────────┬─────────────┘     ┌───────────┴───────────┐
  │ Up for Grabs           │                       │                  │ Up for Grabs           │
  │ My Leads               │        ┌──────────────┴─────────────┐    │ My Leads               │
  │ Reminders               │        │ Up for Grabs (Country/Cat.) │    └────────────────────────┘
  │ Reports                 │        │ My Leads (Stage/Platform/   │
  └────────────────────────┘        │           Country, single)  │
                                     └─────────────────────────────┘

  Reminders rep filter (Command combobox) -----> stays its own distinct pattern,
                                                   restyled only (border/focus/sizing)
                                                   to match the shared visual language.

  Reports date-range inputs -----> stay native date inputs (different input type than
                                     text search) — see Open Questions for confirmation.
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — One shared SearchInput component used on all 4 in-scope pages.**
Up for Grabs, My Leads, Reminders, and Reports each render their search box via a single shared
component (not four separate local markup blocks), with one documented debounce timing applied
consistently.
- proven by: Vitest component test asserting a single canonical `SearchInput` import path across
  all 4 route files (code-level import-consolidation check, same pattern used for AC9/AC10 in the
  prior sitewide-ux-refresh program) + Vitest unit test of the component's debounce behavior using
  fake timers.
- strategy: Fully-Automated

**AC2 — Debounce timing does not regress existing UX.**
The chosen canonical debounce value (default: standardize on Up for Grabs' current feel, subject to
team confirmation — see Open Questions) does not make any of the 4 pages feel slower or less
responsive than they do today.
- proven by: Vitest unit test asserting the shared component's debounce delay matches the agreed
  canonical value; manual side-by-side review noted in the execute report for the two pages whose
  timing changes (My Leads 300ms -> canonical, Reports none -> canonical).
- strategy: Hybrid

**AC3 — One shared FilterDropdown component with a `multiple` prop.**
A single component replaces both the raw `MultiSelectFilter` usage (Up for Grabs) and the raw
shadcn `Select` usage (My Leads' Stage/Platform/Country) in scope, visually based on
`MultiSelectFilter`'s popover/checkbox chrome, with `multiple` controlling multi-select vs
single-select behavior.
- proven by: Vitest component tests covering both `multiple={true}` (checkbox multi-pick) and
  `multiple={false}` (single-pick, closes popover on selection) variants + code-level
  import-consolidation check across Up for Grabs and My Leads filter call sites.
- strategy: Fully-Automated

**AC4 — My Leads' Stage/Platform/Country filters keep single-select behavior.**
After restyling onto the shared FilterDropdown, My Leads' Stage/Platform/Country filters still let
the user pick exactly one value each — no accidental change to multi-vs-single cardinality.
- proven by: Vitest component test asserting only one value can be active at a time for these three
  filters when rendered with `multiple={false}`.
- strategy: Fully-Automated

**AC5 — Up for Grabs' Country/Category filters keep multi-select behavior.**
Up for Grabs' Country and Category filters keep letting the user pick more than one value at once
after migrating onto the shared component.
- proven by: Vitest component test asserting multiple simultaneous selections remain possible when
  rendered with `multiple={true}`.
- strategy: Fully-Automated

**AC6 — One shared week-range / segmented control replaces the 3 duplicated inline versions.**
Up for Grabs' inline 4w/8w/12w/All control, My Leads' "Filters" popover sub-control, and any other
duplicated week-range reimplementation all render through one shared component (adopting the
existing `Tabs.svelte` where its interaction model fits, or a purpose-built `SegmentedControl` if
`Tabs.svelte`'s semantics don't match a "select one range" use case — decision left to INNOVATE).
- proven by: Vitest component test confirming keyboard/ARIA behavior (roving tabindex or equivalent,
  matching the standard already set by `Tabs.svelte` in the prior sitewide-ux-refresh program) +
  code-level import-consolidation check across all call sites.
- strategy: Fully-Automated

**AC7 — Reminders' rep combobox is restyled only, not replaced.**
Reminders' Command-based search-to-filter rep combobox keeps its exact current search-as-you-type
behavior and component identity; only its visual chrome (border, focus ring, sizing) changes to
match the shared language established by SearchInput/FilterDropdown.
- proven by: Vitest test confirming the Reminders rep filter still imports from
  `src/lib/components/ui/command/` (unchanged component identity) + manual/code-review confirmation
  that typing-to-filter behavior is unchanged.
- strategy: Hybrid

**AC8 — Reports' filter bar adopts the shared components where applicable.**
Reports' rep filter (and any dropdown-style filter in its filter bar) uses the shared
FilterDropdown/SearchInput components; date-range inputs are explicitly excluded from this
migration (see Open Questions) and may remain native date inputs.
- proven by: Code-level import-consolidation check confirming Reports' non-date filter controls
  import the shared components.
- strategy: Fully-Automated

**AC9 — No visual regression to existing filtering functionality on any of the 4 pages.**
After migration, every filter, search box, and week-range control on Up for Grabs, My Leads,
Reminders, and Reports still filters/searches/narrows results exactly as it did before this work —
only the shared look changes.
- proven by: Existing Playwright e2e specs covering these pages (`unassigned-filters.e2e.ts`,
  and any equivalent specs for My Leads/Reminders/Reports if present) re-run against the migrated
  components; per the repo's pre-existing known-gap, these currently self-skip on the missing
  shared authenticated-session fixture — treated as a Known-Gap residual, not silently rounded to
  "proven," consistent with how the prior sitewide-ux-refresh program scored the same gap.
- strategy: Agent-Probe (manual/code-review verification as the practical fallback until the e2e
  fixture gap is resolved)

**AC10 — No accessibility regression on the migrated controls.**
The shared SearchInput, FilterDropdown, and week-range control expose at least the same
name/role/focus-visible semantics the individual implementations had before consolidation (in
particular, `MultiSelectFilter`'s popover/checkbox semantics and `Tabs.svelte`'s existing ARIA/
keyboard model are preserved or improved, never reduced).
- proven by: Manual/code-review accessibility check (Agent-Probe), consistent with this program's
  pre-existing accepted fallback for automated axe-core gates (`@axe-core/playwright` is not yet a
  devDependency — see Constraints).
- strategy: Agent-Probe

## Out Of Scope

- Pipeline and Calendar pages — neither currently has a search/filter toolbar; adding one is not
  part of this SPEC.
- Team page's `Select` usage for the role field — this is a single-value form field, not a
  list-filter toolbar, and is a different use case from the filter-dropdown pattern being unified
  here.
- Any new filter capability, new filterable field, or change to what can be searched/filtered on any
  of the 4 in-scope pages — this is a visual/component consolidation pass only.
- Writing or fixing the shared Playwright authenticated-session fixture — the e2e self-skip pattern
  is a pre-existing, program-wide known-gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
  and is explicitly not addressed by this work.
- Deciding whether to add `@axe-core/playwright` as a devDependency — that decision remains open in
  `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md` and is
  not re-litigated here.
- Reports' date-range inputs are not migrated onto SearchInput/FilterDropdown (different input type
  — see Open Questions); this SPEC does not redesign date-range filtering.
- Any change to Reminders' rep combobox behavior (search-as-you-type logic) — restyle only, per
  DECISION 2 (see Background).

## Constraints

- MultiSelectFilter's popover/checkbox visuals are the required base look for the shared
  FilterDropdown component (user-stated preference, locked decision).
- My Leads' Stage/Platform/Country filters must keep single-select cardinality; Up for Grabs'
  Country/Category filters must keep multi-select cardinality — no behavior change, styling only,
  per DECISION 1 (see Background).
- Reminders' rep combobox is not folded into the shared FilterDropdown — it stays a distinct
  Command-based pattern, restyled only, per DECISION 2 (see Background).
- `@axe-core/playwright` is not currently installed; automated accessibility gates fall back to
  Agent-Probe per the existing program-wide pattern (`axe-core-devdependency-decision_NOTE_02-07-26.md`).
- No Playwright authenticated-session fixture exists; e2e specs touching protected routes must
  continue to use the existing `test.skip()` self-skip guard pattern
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- Must reuse already-existing shared components where they already solve the problem
  (`Tabs.svelte`, chip token contract, `ui/input/`, `ui/select/`, `ui/command/`) rather than
  building new ones that duplicate them — consistent with `all-context.md`'s mandatory conventions
  (Svelte 5 runes, server-side DB access unaffected since this is UI-only).
- This SPEC covers UI/component consolidation only; no schema, auth, or API surface is touched.

## Open Questions

- **Canonical debounce timing.** Up for Grabs currently uses 1300ms, My Leads uses 300ms, Reports
  uses none. This SPEC recommends standardizing on Up for Grabs' 1300ms (explicitly the user's
  preferred reference page) as the default, but the team should confirm this doesn't make My
  Leads/Reports feel sluggish before INNOVATE locks it in. Owner: user/reviewer, to confirm at
  Phase-End Recommendation Gate or during INNOVATE.
- **Reports' date-range inputs.** These are a genuinely different input type (date picker vs. text
  search) from the SearchInput/FilterDropdown pattern. This SPEC treats them as out of scope for
  migration (native date inputs stay as-is) unless the reviewer wants them wrapped in a shared
  date-range component as a follow-up. Owner: user/reviewer to confirm scope boundary is correct.
- **Week-range control mechanism (`Tabs.svelte` reuse vs. new `SegmentedControl`).** Whether the
  existing `Tabs.svelte` component's interaction model (tab panel semantics) is the right fit for a
  "pick one time range" control, or whether a purpose-built `SegmentedControl` component is more
  appropriate, is left as an explicit INNOVATE-phase decision — not resolved in this SPEC, since it
  is an implementation-approach question, not a requirements question.

None of the above block SPEC completion — they are scoped decisions for INNOVATE/PLAN or fast
confirmations at the Phase-End Recommendation Gate, not missing information about user intent.

## Background / Research Findings

This SPEC is a follow-on to the completed `sitewide-ux-refresh_02-07-26` program (see
`process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-program_CLOSEOUT_02-07-26.md`).
That program already delivered: the shared `Tabs.svelte` segmented-control component (AC9, full
ARIA + roving-tabindex), a chip visual/token contract (not one forced chip component, by explicit
INNOVATE decision), mobile nav drawer, and design tokens (`--color-nav-*`, `--color-focus-ring`,
`--shadow-nav-*`). This SPEC does not re-propose any of that — it extends the same consolidation
philosophy to the search/filter/toolbar surfaces that program did not cover.

**Reference/canonical pattern (user-preferred):** Up for Grabs (`src/routes/unassigned/+page.svelte`,
~lines 330-389) — debounced (1300ms) raw `<input>` search box with specific Tailwind classes;
`MultiSelectFilter.svelte` (`src/lib/components/leads/MultiSelectFilter.svelte`), a Popover-based
checkbox multi-select used for Country/Category — confirmed as the only genuinely reusable filter
dropdown found in the full audit; and a hand-rolled "Beyond 4w/8w/12w/All" segmented control with
`aria-pressed` + free-text number input, fully inline, not using `Tabs.svelte`.

**Duplication found (from RESEARCH):**
1. Three different filter-dropdown implementations: `MultiSelectFilter` (Up for Grabs only), shadcn
   `Select` (My Leads' Stage/Platform/Country, Team's role field), and a Command-based searchable
   combobox (Reminders' rep filter).
2. Three duplicated "weeks ahead" segmented/chip control reimplementations (Up for Grabs inline; My
   Leads' "Filters" popover sub-control with locally-defined `chipActive`/`chipActiveStale`/
   `chipActiveFresh`/`chipInactive` classes; each styled differently) — none use `Tabs.svelte`.
3. Three differently-styled search inputs: Up for Grabs (raw `<input>`, 1300ms debounce, no
   icon/clear button), My Leads (shadcn `Input`, `ml-auto h-8 w-44`, 300ms debounce, placeholder
   "Search…"), Reports (raw `<input>`, no debounce, `bind:value`).
4. Reports' filter bar (`src/routes/reports/+page.svelte`, ~lines 195-230) uses three raw `<input>`
   elements (date range + rep) with zero shared-component reuse.
5. Pipeline and Calendar have no search/filter toolbar at all — confirmed out of scope.

**Already-shared components confirmed to exist (do not re-invent):** `src/lib/components/ui/tabs/Tabs.svelte`
(used inconsistently), `src/lib/components/leads/MultiSelectFilter.svelte` (Up for Grabs only),
`src/lib/components/ui/select/` (shadcn Select, single-value), `src/lib/components/ui/command/`
(shadcn Command primitives, Reminders only), `src/lib/components/ui/input/input.svelte` (My Leads
and Team only).

**User decisions already locked (baked into Acceptance Criteria, not re-asked):**
- DECISION 1: One shared filter-dropdown component with a `multiple` prop, supporting both
  multi-select (Up for Grabs' current `MultiSelectFilter` behavior) and single-select (My Leads'
  current Stage/Platform/Country behavior, cardinality unchanged) — same visual chrome for both.
- DECISION 2: Reminders' rep combobox (Command-based search-to-filter) stays a distinct pattern —
  not folded into the shared filter-dropdown — restyled only to match shared visual conventions
  (border/focus/sizing), keeping its search-as-you-type behavior.

**Test-context grounding (per `process/context/tests/all-tests.md`):** Vitest is used for
component/unit-level behavior (debounce timing, prop-driven variants, import-path consolidation
checks); Playwright e2e specs exist for these pages but self-skip against protected routes due to
the pre-existing missing shared authenticated-session fixture — this known-gap is explicitly
inherited, not newly introduced, and is scored the same way the completed sitewide-ux-refresh
program scored it (Met-with-known-gap, never silently rounded up to fully "Met"). `@axe-core/playwright`
is not installed, so accessibility acceptance criteria fall back to Agent-Probe per the existing
program-wide accepted pattern.
