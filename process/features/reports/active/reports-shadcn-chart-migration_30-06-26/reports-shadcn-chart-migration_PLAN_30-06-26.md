# Reports — Migrate Leaderboard Chart from ECharts to shadcn-svelte Chart

**Date**: 30-06-26
**Complexity**: SIMPLE (single-session)
**Feature folder**: `process/features/reports/`
**Status**: ⏳ PLANNED

---

## Quick Links

- [Overview](#overview)
- [Goals and Success Metrics](#goals-and-success-metrics)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Functional Requirements](#functional-requirements)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Risks and Mitigations](#risks-and-mitigations)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

---

## Overview

The Reports page currently uses ECharts for the "Rep leaderboard" horizontal grouped bar chart
(Wins / Touches / Replies per rep). This plan migrates that chart to the shadcn-svelte Chart
component (backed by `layerchart`) for visual consistency with the project's existing shadcn-svelte
UI kit, and removes ECharts as a dependency.

Only **one file** changes: `src/routes/reports/+page.svelte`. The `echarts` package is removed
from `package.json`. No server-side code, schema, or API is touched.

Related prior plan: `reports-echarts-review-queue_PLAN_29-06-26.md` (ECharts implementation —
READ-ONLY reference, do not modify).

---

## Goals and Success Metrics

| Goal | Metric |
|------|--------|
| Replace ECharts chart with shadcn Chart | leaderboard chart renders using `layerchart` components |
| Visual parity | Colors match: Wins `#22c55e`, Touches `#6366f1`, Replies `#0e9f6e` |
| Legend visible and correct | Three legend items below the chart, not overlapping bars |
| Tooltip works | Hovering a bar shows rep name + series value |
| Responsive | Chart resizes when panel width changes |
| Dependency removed | `echarts` absent from `package.json` and `bun.lock` after `bun install` |
| Type check clean | `bun run check` exits 0 |

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** — Works with other system pieces
2. **Manual Test** — User can see the chart and interact with it in the browser
3. **Data Verification** — Bars reflect actual DB data (same counts as the table below)
4. **Error Handling** — Empty leaderboard (0 reps) handled gracefully
5. **User Confirmation** — User says "it works"

Status meanings:
- ⏳ PLANNED — Not started
- 🔨 CODE DONE — Written but not E2E tested
- 🧪 TESTING — Currently being tested
- ✅ VERIFIED — Tested AND confirmed working
- 🚧 BLOCKED — Has issues

---

## Execution Brief

### Phase 1 — Install shadcn Chart component

**What happens:** Run `npx shadcn-svelte@latest add chart`. This installs `layerchart` as a
dependency and copies chart UI primitives into `src/lib/components/ui/chart/`. The installer also
injects `--chart-1` … `--chart-5` CSS variables into the configured Tailwind CSS file
(`src/routes/layout.css`, per `components.json`).

**Test:** `bun run check` exits 0 after install.

**Done when:** `layerchart` appears in `package.json` dependencies; chart component files exist
under `src/lib/components/ui/chart/`.

---

### Phase 2 — Replace ECharts with shadcn Chart in the Reports page

**What happens:** Rewrite the `<script>` block in `src/routes/reports/+page.svelte` to use
shadcn-svelte Chart primitives instead of ECharts. Remove the `echarts.init` / `$effect` setup,
`ResizeObserver` wiring, and all `echarts/core` imports.

Key implementation decisions:
- Data must be reshaped from `report.leaderboard[]` (one object per rep with `wins/touches/replies`
  fields) into the format `layerchart` expects for grouped bar charts.
- The chart is horizontal (reps on Y axis, counts on X axis) with three grouped series.
- Use CSS variable tokens already present in `src/lib/styles/tokens.css` where possible; fall
  back to explicit hex values for the three series colors.
- Chart height: `h-[272px]` (match existing wrapper class or adjust as needed for label fit).
- Legend: below the chart, showing Wins / Touches / Replies with matching colors.
- **Preserve unrelated logic:** `maxCount` ($derived from `report.funnel`, line 15) and the entire
  funnel/currency markup are NOT part of this migration — leave them intact.

**Test:** Navigate to `/reports` in the browser; confirm the leaderboard chart renders with bars,
legend, and tooltip.

**Done when:** Chart renders correctly; data matches the table beneath it; ECharts import lines
are gone from the file.

---

### Phase 3 — Remove ECharts dependency

**What happens:** `bun remove echarts` removes the package. `bun run check` + `bun run test:unit`
confirm nothing is broken.

**Test:** `grep -r "echarts" src/` returns no results. `bun run check` exits 0.

**Done when:** `echarts` is absent from `package.json` and `bun.lock`.

---

### Expected Outcome

- `src/routes/reports/+page.svelte` uses only shadcn-svelte Chart components (no ECharts)
- `layerchart` in dependencies; `echarts` absent
- `bun run check` and `bun run test:unit` both green
- Reports page fully functional; leaderboard chart visually matches prior ECharts output

---

## Scope

### In scope

- `src/routes/reports/+page.svelte` — remove ECharts, add shadcn Chart
- `package.json` / `bun.lock` — add `layerchart`, remove `echarts`
- `src/lib/components/ui/chart/` — files added by `shadcn-svelte add chart` (generated, not hand-edited)
- `src/routes/layout.css` — `--chart-*` CSS variables injected by `shadcn-svelte add chart` (generated, not hand-edited)

### Out of scope

- Any other chart, page, or route
- Server-side data layer (`+page.server.ts`) — no changes
- Adding new chart types or series beyond Wins / Touches / Replies
- Changing the data table beneath the chart

---

## Functional Requirements

1. The leaderboard chart renders a horizontal grouped bar chart with three series: Wins, Touches, Replies.
2. Series colors match existing values: Wins `#22c55e`, Touches `#6366f1`, Replies `#0e9f6e`.
3. A legend below the chart identifies each series with its color.
4. Hovering a bar shows a tooltip with the rep's name and value for that series.
5. The chart responds to panel width changes (responsive).
6. When `report.leaderboard` is empty, no chart is rendered (same guard as current `{#if report.leaderboard.length > 0}`).
7. `bun run check` exits 0 after the migration.

---

## Acceptance Criteria

- [ ] `src/routes/reports/+page.svelte` contains zero `echarts` imports
- [ ] `package.json` lists `layerchart` in `dependencies`; `echarts` is absent
- [ ] `/reports` renders the leaderboard chart using shadcn Chart components
- [ ] Three bars per rep (Wins, Touches, Replies) are visible and color-coded correctly
- [ ] Legend is visible below the chart and does not overlap bars
- [ ] Tooltip appears on hover with rep name and value
- [ ] Chart reflects live DB data (same numbers as the table beneath)
- [ ] Empty leaderboard renders no chart (existing `{#if}` guard preserved)
- [ ] `bun run check` exits 0
- [ ] `bun run test:unit` exits 0 (unit tests unaffected — no Zod/server logic changed)

---

## Implementation Checklist

> Execute in order. Tick each step before moving to the next.

- [ ] **Step 1:** Run `npx shadcn-svelte@latest add chart` from the project root
- [ ] **Step 2:** Confirm `layerchart` appears in `package.json` and `src/lib/components/ui/chart/` exists
- [ ] **Step 3:** Read the generated `src/lib/components/ui/chart/index.ts` to discover available exports (chart primitives to import in the page)
- [ ] **Step 4:** Read the layerchart docs / generated component to understand the horizontal grouped bar API (check for `BarChart`, `layout="horizontal"`, `group` prop, or equivalent)
- [ ] **Step 5:** Reshape `report.leaderboard` data into the format layerchart expects; define series config with explicit hex colors
- [ ] **Step 6:** Replace the ECharts `<script>` block in `src/routes/reports/+page.svelte`:
  - Remove: `import * as echarts`, `BarChart`, `GridComponent`, `TooltipComponent`, `LegendComponent`, `CanvasRenderer`, `echarts.use(...)`, `let chartEl`, `let chart`, the full `$effect(...)` block
  - Add: shadcn Chart component imports + reactive data transform
  - Keep: `maxCount` $derived (line 15) and all funnel/currency markup — unrelated to this migration
- [ ] **Step 7:** Replace the `<div bind:this={chartEl} class="mb-5 h-[272px] w-full">` with the shadcn Chart markup; preserve the `{#if report.leaderboard.length > 0}` guard
- [ ] **Step 8:** Run `bun run check` — fix any TypeScript errors before proceeding
- [ ] **Step 9:** Start dev server (`bun run dev`) and navigate to `/reports`; visually confirm chart renders with correct colors, legend, and tooltip
- [ ] **Step 10:** Run `bun remove echarts` to remove the ECharts package
- [ ] **Step 11:** Run `bun run check` again — confirm clean after removal
- [ ] **Step 12:** Run `bun run test:unit` — confirm all 62 unit tests still pass

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `layerchart` horizontal grouped bar chart API differs from ECharts API significantly | Medium | Read generated chart component + layerchart source before writing any code (Step 3–4 are research steps) |
| shadcn-svelte chart component does not support horizontal layout | Low | layerchart supports `layout="horizontal"` on bar charts; if missing, use vertical with rep names on X axis as fallback |
| CSS variable conflicts between shadcn chart tokens and project tokens | Low | Project uses `stone` base color which matches shadcn default; inspect generated CSS and adjust `--chart-*` variables if needed |
| `bun remove echarts` breaks an import somewhere else | Very low | Only one file imports ECharts; confirmed by `grep -r "echarts" src/` before removal |
| Tooltip not working without ECharts `axisPointer` | Low | layerchart ships its own tooltip primitives; configure with the exported `Tooltip` component |

---

## Touchpoints

| File | Change type | Notes |
|------|------------|-------|
| `src/routes/reports/+page.svelte` | Modify | Remove ECharts, add shadcn Chart |
| `package.json` | Modify | Add `layerchart`, remove `echarts` |
| `bun.lock` | Auto-updated | Updated by `bun install` / `bun remove` |
| `src/lib/components/ui/chart/` | Generated (new) | Created by `shadcn-svelte add chart`; do not hand-edit |
| `src/routes/layout.css` | Generated (modified) | `--chart-*` CSS vars injected by `shadcn-svelte add chart`; do not hand-edit |

---

## Public Contracts

**No public contracts change.** The leaderboard chart is a pure display component. The
`+page.server.ts` data shape (`report.leaderboard[]`) is unchanged. No API endpoints, Zod
schemas, or DB schema are touched.

---

## Blast Radius

- **Files changed:** 2 hand-edited (`+page.svelte`, `package.json`) + 2 auto-generated (`ui/chart/` dir, `--chart-*` vars in `layout.css`)
- **Risk class:** Low — UI-only, no server logic, no schema, no auth surface
- **Packages affected:** `reports` route only
- **Dependent surfaces:** None — no other file imports from `+page.svelte`; `echarts` imported only by `+page.svelte` (grep-confirmed)

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|----------------|----------|-----------------------|
| `bun run check` exits 0 | Fully-Automated | No TypeScript regressions; shadcn chart types are correct |
| `bun run test:unit` — 62 tests green | Fully-Automated | No unit-test regressions (Zod/server logic untouched) |
| `/reports` renders leaderboard chart with 3 colored bar series | Agent-Probe (manual browse + visual inspect) | Chart renders; series colors match spec |
| Hovering a bar shows tooltip with rep name + value | Agent-Probe (manual hover) | Tooltip functional |
| Chart resizes when browser window narrows | Agent-Probe (manual resize) | Responsive behavior preserved |
| `grep -r "echarts" src/` returns no matches | Fully-Automated | ECharts fully removed from source |
| `echarts` absent from `package.json` | Fully-Automated | Dependency removed |
| Empty leaderboard (0 reps) — no chart rendered | Agent-Probe (comment out leaderboard data temporarily) | `{#if}` guard preserved |

---

## Test Infra Improvement Notes

UI chart rendering (bars / legend / tooltip / responsive) has no automated gate in this repo —
visual verification would require Playwright visual-comparison specs, which are out of scope for
this SIMPLE plan. Documented as a known-gap residual in the Validate Contract. Backlog candidate:
add a Playwright smoke spec for `/reports` that asserts the chart container and legend render
(non-visual DOM assertion) once an e2e harness exists.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reports/active/reports-shadcn-chart-migration_30-06-26/reports-shadcn-chart-migration_PLAN_30-06-26.md`
2. **Last completed phase/step:** ⏳ Not started
3. **Validate-contract status:** Written 30-06-26 — Gate: CONDITIONAL (see Validate Contract). Cleared for EXECUTE with documented residuals.
4. **Supporting context files:**
   - `process/context/all-context.md` (project stack + conventions)
   - `process/context/tests/all-tests.md` (test commands)
   - `src/routes/reports/+page.svelte` (file under change)
   - `src/routes/reports/+page.server.ts` (data shape reference — read-only)
   - `components.json` (shadcn-svelte config)
5. **Next step for a fresh executor:**
   - Read this plan fully
   - Run `npx shadcn-svelte@latest add chart` (Step 1 of checklist)
   - Read the generated `src/lib/components/ui/chart/index.ts` before writing any chart code
   - Follow the Implementation Checklist in order; do not skip Steps 3–4 (research the layerchart API first)

---

## Cursor + RIPER-5 Guidance

- **Cursor Plan mode:** import the Implementation Checklist; execute Steps 1–12 in order; after Step 9 (visual confirm), stop and verify before running `bun remove echarts`
- **RIPER-5:** this plan is now at the PLAN phase; next step is `ENTER VALIDATE MODE`, then `ENTER EXECUTE MODE` after validate-contract is written
- **Do not skip Steps 3–4** — the layerchart API must be understood before any code is written to avoid a rewrite mid-session

---

## Validate Contract

Status: CONDITIONAL
Date: 30-06-26
date: 2026-06-30
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 0/7 (no multi-package, schema/auth, multi-direction, phase-program, depth-request, high-risk, or 5+-file signals). Single-file UI migration — one agent in strict order.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-check | No TS/Svelte regressions; shadcn chart types correct | Fully-Automated | `bun run check` exits 0 | A |
| AC-unit | No unit-test regressions (62 Vitest tests) | Fully-Automated | `bun run test:unit` exits 0 | A |
| AC-grep-src | ECharts fully removed from source | Fully-Automated | `grep -r "echarts" src/` returns no matches | A |
| AC-grep-pkg | `echarts` removed from manifest | Fully-Automated | `grep '"echarts"' package.json` returns no match | A |
| AC-layerchart-dep | `layerchart` added as dependency | Fully-Automated | `grep '"layerchart"' package.json` returns a match | A |
| AC-render | Leaderboard renders 3 colored bar series (Wins/Touches/Replies, exact hex) | Agent-Probe | Run `bun run dev`, open `/reports`, visually confirm 3 series + colors | D |
| AC-legend | Legend visible below chart, not overlapping bars | Agent-Probe | Same browse session, inspect legend placement | D |
| AC-tooltip | Hover shows rep name + series value | Agent-Probe | Hover a bar in `/reports` | D |
| AC-responsive | Chart resizes on panel/window width change | Agent-Probe | Narrow the browser window on `/reports` | D |
| AC-empty-guard | Empty leaderboard renders no chart (`{#if}` guard preserved) | Agent-Probe | Temporarily empty `report.leaderboard`, confirm no chart node | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value.

Legacy line form (retained so existing validate-contract consumers still parse):
- Type check: Fully-automated: `bun run check` exits 0
- Unit tests: Fully-automated: `bun run test:unit` exits 0 (62 tests)
- ECharts removal (source): Fully-automated: `grep -r "echarts" src/` empty
- ECharts removal (manifest): Fully-automated: `grep '"echarts"' package.json` empty
- layerchart present: Fully-automated: `grep '"layerchart"' package.json` matches
- Chart render / legend / tooltip / responsive / empty-guard: Agent-probe: manual browse of `/reports` per scenarios above (no automated visual gate — Playwright visual out of scope, documented residual)

Failing stubs (Fully-automated rows; command-gates — the command IS the gate, vitest stubs advisory):
- AC-check: `bun run check` — gate is the command exit code (no new vitest test).
- AC-unit: existing Vitest suite must stay green — `bun run test:unit` exit code is the gate.
- AC-grep-src: `grep -r "echarts" src/` must return empty — command exit is the gate.
- AC-grep-pkg / AC-layerchart-dep: manifest grep assertions — command exit is the gate.

Dimension findings:
- Infra fit: CONCERN — shadcn-svelte configured (components.json, ui alias, stone base); correct runners (`bun run check` / `bun run test:unit`, NOT `bun test`). `add chart` also injects `--chart-*` vars into `src/routes/layout.css` and needs network at EXECUTE time; blast radius updated to include `layout.css` (plan update P1 applied).
- Test coverage: CONCERN — automated gates (check/unit/grep) cover types, regression, and removal; chart visual behavior (render/legend/tooltip/responsive/empty-guard) has no automated gate, proven only by Agent-Probe (documented residual, gap-resolution D).
- Breaking changes: PASS — no API/schema/auth/public-contract change; `report.leaderboard[]` shape unchanged; `echarts` imported only by `+page.svelte` (grep-confirmed); no downstream consumers.
- Security surface: PASS — no auth/billing/secrets/trust-boundary; removing echarts shrinks supply-chain surface; layerchart is the official shadcn-svelte chart backing library.
- Section feasibility (ECharts to shadcn migration): CONCERN — all edit targets uniquely matchable (imports L6-11, `$effect` L20-84, chart div L146); highest-risk edit is the unknown layerchart horizontal grouped-bar API — mitigated by mandatory Steps 3-4 (read generated API before coding) enforced as execute-agent instruction E1.

Execute-agent instructions:
- E1: Do NOT write chart code before completing Steps 3-4 (read `src/lib/components/ui/chart/index.ts` and the generated component to learn the horizontal grouped-bar API). If `layout="horizontal"` is unsupported, use the documented vertical-fallback (rep names on X axis) and note the deviation in the phase report.
- E2: Treat `src/lib/components/ui/chart/` and the `--chart-*` vars in `src/routes/layout.css` as generated — do not hand-edit beyond what the chart config requires.
- E3: Preserve `maxCount` ($derived, line 15) and all funnel/currency markup — they are outside this migration's scope.
- E4: Run `bun run check` after Step 6 (before `bun remove echarts`) and again after removal (Steps 8 + 11); run `bun run test:unit` last (Step 12).

Open gaps:
- Chart visual rendering (bars/legend/tooltip/responsive/empty-guard): known-gap — no automated visual gate in this repo (Playwright visual specs out of scope). Verified by Agent-Probe manual browse at EXECUTE; backlog candidate noted in Test Infra Improvement Notes.

What This Coverage Does NOT Prove:
- `bun run check` proves types compile; does NOT prove the chart renders, the bars are the right colors, the legend/tooltip appear, or the layout is horizontal.
- `bun run test:unit` proves Zod/server unit tests still pass; does NOT touch or prove anything about the chart component (no unit tests exist for it).
- `grep -r "echarts" src/` and the manifest greps prove ECharts is textually removed and layerchart is declared; do NOT prove the new chart is wired up correctly or visually equivalent.
- The Agent-Probe gates are manual judgments at EXECUTE time; nothing automated guards against future visual regressions.

Gate: CONDITIONAL (no FAILs; 1 CONCERN resolved via plan update P1 [layout.css added to blast radius]; 2 CONCERNs accepted as documented residuals — visual coverage is Agent-Probe-only, layerchart API confirmed at EXECUTE via Steps 3-4)
Accepted by: session — accepted concerns: (1) test-coverage: chart visual behavior has no automated gate, verified by Agent-Probe + documented backlog residual; (2) section-feasibility: layerchart horizontal grouped-bar API unknown until generation, mitigated by mandatory Steps 3-4 / instruction E1.

---

## Autonomous Goal Block

```
SESSION GOAL: Migrate the Reports rep-leaderboard chart from ECharts to the shadcn-svelte Chart component (layerchart) and remove the echarts dependency.
Charter + umbrella plan: N/A — single plan
Autonomy: standard interactive RIPER-5 (no /goal program). EXECUTE requires explicit "ENTER EXECUTE MODE".
Hard stop conditions / safety constraints:
- If layerchart cannot produce a horizontal grouped bar (no horizontal layout AND no acceptable fallback), stop and report before rewriting markup.
- Do not run `bun remove echarts` until Step 9 (visual confirm in browser) passes.
- Do not hand-edit generated files (`src/lib/components/ui/chart/`, `--chart-*` vars in `src/routes/layout.css`).
Next phase: EXECUTE: process/features/reports/active/reports-shadcn-chart-migration_30-06-26/reports-shadcn-chart-migration_PLAN_30-06-26.md
Validate contract: inline in plan (Gate: CONDITIONAL, generated-by: outer-pvl)
Execute start: fully-auto gates -> `bun run check` + `bun run test:unit` + `grep -r "echarts" src/` (empty) + `grep '"layerchart"' package.json` (match) | agent-probe -> manual browse of /reports (render/legend/tooltip/responsive/empty-guard) | high-risk pack: no
```
