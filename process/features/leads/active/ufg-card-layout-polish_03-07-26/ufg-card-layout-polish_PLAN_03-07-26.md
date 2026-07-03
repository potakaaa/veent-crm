---
name: plan:ufg-card-layout-polish
description: "Mobile card field priority (#173) + inter-card spacing (#174) on /unassigned"
date: 03-07-26
feature: leads
---

# PLAN — Up for Grabs Mobile Card Layout Polish (#173 + #174)

**Date**: 03-07-26
**Status**: VALIDATE PASS — Ready for EXECUTE
**Complexity**: SIMPLE

## Overview

Single-file, CSS-only change to `src/routes/unassigned/+page.svelte`. Reorders which fields
appear first in the mobile-stacked card (via Tailwind `order-*` + `lg:order-none`, no DOM
reordering), de-emphasizes 3 secondary fields, and adds a visible gap between stacked mobile
cards. No desktop change, no `/leads` change, no schema/API/auth/logic change.

## Goals

- AC1–AC3: primary fields (organizer, event, appeal, category) read first on mobile; actions
  reachable without scrolling past all secondary fields.
- AC2: source / country / former-owner visually de-emphasized.
- AC4: visible gap between stacked mobile cards, matching an existing spacing value in the
  codebase (not an arbitrary one-off).
- AC5/AC6: zero behavior change to `/leads` or to desktop `/unassigned`.
- AC7: `bun run check` and `bun run test:unit:ci` stay green.

## Scope

In scope: `src/routes/unassigned/+page.svelte` only — the `rows` snippet's per-lead row `<div>`
(line ~405) and its child field/action `<div>`s (lines ~472–516).
Out of scope: `DataGridShell.svelte` (not touched — confirmed in SPEC that `rowClass` is fully
internal to the shell; this plan never edits that file), `/leads`, `LeadGrid.svelte`, desktop
grid, any data/logic/API/schema.

## Decision 1 — Mobile Field Order (CSS `order-*`, no DOM reorder)

**Why CSS-order, not DOM reorder:** desktop relies on implicit CSS Grid auto-placement in DOM
order to align each field under its header column (`cols =
'lg:grid-cols-[36px_2fr_1.6fr_1fr_90px_90px_90px_1fr_130px_150px]'` = select, name, event,
stage, source, country, category, lastOwner, appeal, actions). Physically moving elements in the
DOM would misalign every desktop column unless all 10 cells get an explicit position — more code
than adding `order-*` to only the 7 fields that actually move. `lg:order-none` on every field
that gets an `order-*` class resets to the desktop default (`order: 0`, a true no-op — confirmed
no other sibling in this row ever sets a non-zero order today).

**Mechanism:** all 10 row children currently render with implicit `order: 0`, so their *visual*
order today equals *document* order. To reach the target visual order below, 3 fields
(checkbox, organizer, event) stay untouched at implicit `order: 0` (they are already first in
both DOM order and desired order — no class needed). The remaining 7 fields each get an explicit
`order-N` (all N ≥ 1, so they sort strictly after the untouched order-0 group, and relative to
each other in the exact sequence below) plus `lg:order-none`.

**Target mobile visual order (top → bottom):**

| # | Field | order class (mobile) | Why here |
|---|---|---|---|
| — | checkbox (select) | none (stays implicit `order-0`) | selection control, not a content field — always first |
| — | organizer name + popover | none (stays implicit `order-0`) | primary — AC1 |
| — | event name + date | none (stays implicit `order-0`) | primary — AC1 |
| 1 | appeal score badge | `order-1 lg:order-none` | primary — AC1, moves from position 9 → 4 |
| 2 | category | `order-2 lg:order-none` | primary — AC1, moves from position 7 → 5 |
| 3 | actions (Edit/Assign/Claim) | `order-3 lg:order-none` | AC3 — reachable right after the 4 primary fields, no scroll past secondaries |
| 4 | stage chip | `order-4 lg:order-none` | secondary, pushed after actions |
| 5 | source badge | `order-5 lg:order-none` | secondary — also gets AC2 de-emphasis, see Decision 1b |
| 6 | country | `order-6 lg:order-none` | secondary — AC2 de-emphasis |
| 7 | former owner | `order-7 lg:order-none` | secondary — AC2 de-emphasis |

Verified: `order-1` through `order-7` and `order-none` are all standard (non-arbitrary) Tailwind
utilities already available via the project's default Tailwind 4 config — no `tailwind.config`
safelist or arbitrary-value syntax needed.

### Decision 1b — De-emphasis of source / country / former-owner (AC2)

Per INNOVATE: reuse this file's own existing ad hoc text tiers, do not invent a new shared
token/class.

- **Country, former owner** (plain `text-ink-400` text today): drop one existing tier to
  `text-ink-300` — this file already uses `text-ink-300` as its de-emphasized/default-state tier
  (line ~388, unsorted table-header buttons: `text-ink-300 hover:text-ink-600`), so this is reuse
  of an existing precedent, not a new token. Also reduce font size from `text-[12px]` to
  `text-[11px]` — `text-[11px]` is already used in this exact file for a secondary/sub-line of
  info (event date sub-line, line ~463: `text-[11px] text-ink-400`), so `text-[11px]` +
  `text-ink-300` together is the "lightest/smallest existing tier already used somewhere in this
  file" per the INNOVATE brief.
- **Source badge**: its color/background come from `sourceLabel(l.source).class`, a dynamic
  helper — it is not a plain `text-ink-*` string this plan can swap. Wrap it in `opacity-70` on
  its containing `<div>` instead. Precedent: this exact file already uses opacity as a
  de-emphasis/reduced-prominence signal (`disabled:opacity-50` on all three action buttons,
  lines ~487, ~500, ~510), so `opacity-70` for a "less prominent but still fully visible" badge
  is consistent with an existing in-file convention, not a new pattern.
- **Category is a PRIMARY field (AC1)** — it keeps its current `text-[12px] text-ink-400`
  styling unchanged; only its position moves (`order-2 lg:order-none`). Do not de-emphasize it.

**Known-gap (accepted trade-off, not to be fixed by this plan):** CSS `order` changes *visual*
order only. DOM order, tab order, and screen-reader traversal order remain unchanged (checkbox →
organizer → event → stage → source → country → category → former-owner → appeal → actions).
Mobile screen-reader / keyboard-tab users will still encounter fields in the original document
order, not the new visual order. SPEC's ACs are visual/behavioral-only (AC1–AC4), so this is an
accepted trade-off, not a regression against any stated AC. Record this as a known-gap in the
validate-contract; do not attempt a DOM-reorder fix under this plan (it would break the desktop
grid per the Decision 1 rationale above).

## Decision 2 — Inter-Card Spacing (AC4)

Add spacing directly to `/unassigned`'s own per-lead row `<div>` (line ~405–407) — this div is
page-owned markup passed into the `rows` snippet, not part of `DataGridShell.svelte` itself, so
this change cannot leak into `/leads` (AC5).

**Spacing value chosen:** `mb-3 lg:mb-0` + `last:mb-0`.
- `mb-3` (0.75rem / 12px) was chosen because it reuses the exact numeric step (`3`) already used
  by this same file's shared shell for grid spacing (`DataGridShell.svelte` line 48:
  `gap-1.5 lg:gap-3` — the `lg:gap-3` desktop inter-column gap). No stronger cross-page
  inter-card precedent was found (`reminders/+page.svelte` and `calendar/+page.svelte` were
  checked — neither has a comparable stacked-card gap pattern to reuse), so per the INNOVATE
  fallback rule this plan defaults to the closest in-repo numeric precedent (`3`) rather than an
  arbitrary value.
- `lg:mb-0` guarantees zero desktop visual change (desktop grid rows are separated by
  `border-b` only, unchanged) — required by AC6.
- `last:mb-0` prevents a trailing gap after the final card in the list (matches the existing
  `last:border-b-0` pattern already on this same div).

**Final row div class (before → after):**
```
BEFORE: "{rowClass} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fcfbfd]"
AFTER:  "{rowClass} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fcfbfd] mb-3 last:mb-0 lg:mb-0"
```

## Implementation Checklist

All edits are inside `src/routes/unassigned/+page.svelte`, `rows` snippet, current line numbers
as of 03-07-26 (re-locate by content if the file has drifted before EXECUTE runs):

1. **Row wrapper div (line ~405–407)** — append ` mb-3 last:mb-0 lg:mb-0` to the existing class
   string (Decision 2). No other attributes change.
2. **Stage chip div (line ~472)** — `<div><StageChip .../></div>` → add `class="order-4 lg:order-none"` to the wrapping div.
3. **Source badge wrapper div (line ~473–479)** — add `class="order-5 lg:order-none opacity-70"` to the wrapping div (the inner `<span>`'s dynamic `sourceLabel(...).class` stays untouched).
4. **Country div (line ~480)** — change class from `"truncate font-mono text-[12px] text-ink-400"` to `"order-6 lg:order-none truncate font-mono text-[11px] text-ink-300"`.
5. **Category div (line ~481)** — change class from `"truncate font-mono text-[12px] text-ink-400"` to `"order-2 lg:order-none truncate font-mono text-[12px] text-ink-400"` (order only — no de-emphasis, this is a primary field).
6. **Former owner div (line ~482)** — change class from `"font-mono text-[12px] text-ink-400"` to `"order-7 lg:order-none font-mono text-[11px] text-ink-300"`.
7. **Appeal score div (line ~483)** — `<div><AppealScoreBadge .../></div>` → add `class="order-1 lg:order-none"` to the wrapping div.
8. **Actions div (line ~484)** — change class from `"flex items-center gap-1.5"` to `"order-3 lg:order-none flex items-center gap-1.5"`.
9. Run `bun run check` — must exit 0 (AC7, no type/svelte-check regressions from the class-only edits).
10. Run `bun run test:unit:ci` — must stay green (AC7 — no unit test in this repo asserts on this markup's classes today, so this is a regression-only gate, not new coverage).
11. Manual/Agent-Probe mobile-viewport pass of `/unassigned` against AC1–AC4 (see Verification Evidence).
12. Manual/Agent-Probe desktop-viewport pass of `/unassigned` against AC6 (confirm `lg:order-none`/`lg:mb-0` fully neutralize the mobile changes).
13. Manual/Agent-Probe pass of `/leads` (before/after, or diff-only since `DataGridShell.svelte` is untouched) against AC5.
14. If a working e2e claim-flow spec exists and does not self-skip, run it as a Hybrid check for AC3 (see Verification Evidence row 3); otherwise this remains an accepted, pre-existing repo-wide known-gap and is not blocking.

## Touchpoints

- `src/routes/unassigned/+page.svelte` — the ONLY file modified. Specifically the `rows` snippet
  inside `<DataGridShell>` (line ~403–519): the per-lead row wrapper div and 6 of its child field
  divs (stage, source, country, category, former-owner, appeal-score) plus the actions div.

No other file is read for modification. `src/lib/components/leads/DataGridShell.svelte` is read
during RESEARCH/SPEC only to confirm its prop surface has no spacing/order hook to worry about —
it is not edited.

## Public Contracts

None changed. No component props, no exported functions, no API routes, no DB schema. The `rows`
snippet signature (`{#snippet rows(rowClass)}`) and its usage of `rowClass` from
`DataGridShell.svelte` are unchanged — this plan only adds static utility classes alongside the
existing `{rowClass}` interpolation.

## Blast Radius

- **1 file**, `src/routes/unassigned/+page.svelte`.
- **Risk class:** none of the high-risk classes (no auth, no billing, no schema/migration, no
  public API, no container/proxy/gateway, no secrets/trust-boundary logic). Pure presentational
  CSS-class change.
- **Shared-component risk:** zero — `DataGridShell.svelte` is not touched, so `/leads` (which
  also consumes it via `LeadGrid.svelte`) cannot regress from this change (AC5 is structurally
  guaranteed, not just visually verified).
- **Desktop risk:** mitigated by pairing every `order-*` addition with `lg:order-none` and the
  spacing addition with `lg:mb-0` — every new class has an explicit desktop no-op partner.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Structural check: `grep -n "order-1\|order-2\|order-3\|order-4\|order-5\|order-6\|order-7" src/routes/unassigned/+page.svelte` shows all 7 expected `order-N lg:order-none` pairs present on the correct fields | Fully-Automated | AC1 (structural half — code-level proof the markup order classes exist as specified) |
| Manual/Agent-Probe: view `/unassigned` at mobile viewport width, confirm visual top-to-bottom order is checkbox → organizer → event → appeal → category → actions → stage → source → country → former-owner | Agent-Probe | AC1, AC3 |
| Manual/Agent-Probe: view `/unassigned` at mobile viewport width, confirm source/country/former-owner render visibly lighter/smaller than organizer/event/appeal/category | Agent-Probe | AC2 |
| Manual/Agent-Probe (or Hybrid if an unskipped e2e claim spec is available): confirm Claim/Assign/Edit buttons are reachable without scrolling past all 4 secondary fields | Hybrid (when e2e auth-fixture gap is resolved) / Agent-Probe (until then) | AC3 |
| Manual/Agent-Probe: view `/unassigned` at mobile viewport width, confirm a visible gap (not just the 1px border) separates each stacked card, and the last card has no trailing gap | Agent-Probe | AC4 |
| Code-level diff review: confirm `DataGridShell.svelte` has zero diff (file untouched) | Fully-Automated | AC5 (structural guarantee) |
| Manual/Agent-Probe: view `/leads` before/after, confirm unchanged mobile card appearance | Agent-Probe | AC5 (visual confirmation) |
| Manual/Agent-Probe: view `/unassigned` at `lg` breakpoint and above, confirm grid layout, column order, and spacing are pixel-identical to before | Agent-Probe | AC6 |
| `bun run check` exits 0 | Fully-Automated | AC7 |
| `bun run test:unit:ci` exits 0 (all existing specs green) | Fully-Automated | AC7 |

Known-gap carried from SPEC (not created by this plan): no automated visual-regression/
component-snapshot infra exists in this repo, and e2e specs on protected routes currently
self-skip pending the shared Playwright auth fixture
(`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is why AC1–AC4 and
AC6 are Agent-Probe rather than Fully-Automated — accepted per SPEC, not a gap introduced here.

New known-gap introduced by this plan's own design (Decision 1): CSS `order-*` does not change
DOM/tab/screen-reader traversal order — see "Known-gap" callout under Decision 1 above. No
resolution path exists within this plan's scope (a DOM reorder would break the desktop grid);
carry forward as an accepted trade-off in the validate-contract, not silently absorbed.

## Acceptance Criteria

Mirrors the locked SPEC's AC1-AC7 verbatim (see  for
full / text; summarized here for plan self-containment):

1. Decision-relevant fields (organizer, event, appeal, category) appear before secondary fields
   (source, country, former owner) on mobile.
2. Source, country, former owner are visually de-emphasized vs. primary fields.
3. Claim/Assign/Edit actions are reachable without scrolling past the full secondary-field stack.
4. Visible gap (not just 1px border) separates each stacked mobile card; matches an existing
   in-app spacing value.
5.  page mobile appearance is unchanged.
6. Desktop (+)  layout is unchanged.
7.  and  remain green.

## Phase Completion Rules

- This is a SIMPLE, single-phase, single-file plan — no phase sub-statuses apply.
- Plan is  only after all 14 Implementation Checklist steps are completed and
  Verification Evidence gates 9-10 (, ) are green.
- Plan is  only after the Agent-Probe/Hybrid visual gates (AC1-AC4, AC6) are
  explicitly confirmed and reported back, plus the AC5 structural diff-review gate — code-only
  completion without that confirmation must not be marked VERIFIED.

Test procedure and verification gates are defined in the Verification Evidence table above, cross-referenced against process/context/tests/all-tests.md (no component-snapshot/visual-regression infra exists in this repo per that doc, hence the Agent-Probe strategy tiers used throughout).

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

Status: PASS
Date: 03-07-26
date: 2026-07-03
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 0/7 signals present (single file, no multi-package scope, no schema/API/auth/billing surface, no 3+ directions, not a phase program, no user-requested depth, blast radius = 1 file). Sequential vc-execute-agent (opus) is sufficient — no fan-out needed for EXECUTE.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 (structural half) | 7 `order-N`/`lg:order-none` pairs present on the correct fields | Fully-Automated | `grep -n "order-1\|order-2\|order-3\|order-4\|order-5\|order-6\|order-7" src/routes/unassigned/+page.svelte` shows all 7 pairs | A |
| AC1 (visual half) | Mobile top-to-bottom order: checkbox → organizer → event → appeal → category → actions → stage → source → country → former-owner | Agent-Probe | Manual/agent mobile-viewport pass of `/unassigned` | A |
| AC2 | Source/country/former-owner visually de-emphasized vs. primary fields | Agent-Probe | Manual/agent mobile-viewport pass confirming lighter/smaller styling | A |
| AC3 | Claim/Assign/Edit reachable without scrolling past full secondary stack | Hybrid (blocked) / Agent-Probe (interim) | `e2e/unassigned-filters.e2e.ts` (currently `test.fixme()` — self-skips, pre-existing repo-wide e2e-auth-bootstrap gap) / manual mobile-viewport scroll check | C (Hybrid deferred to auth-fixture backlog item; Agent-Probe proves now) |
| AC4 | Visible gap between stacked mobile cards, no trailing gap on last card | Agent-Probe | Manual mobile-viewport pass confirming `mb-3`/`last:mb-0` gap | A |
| AC5 (structural half) | `/leads` unaffected — shared `DataGridShell.svelte` has zero diff | Fully-Automated | `git diff --stat src/lib/components/leads/DataGridShell.svelte` shows no changes | A |
| AC5 (visual half) | `/leads` mobile card appearance unchanged before/after | Agent-Probe | Manual before/after visual pass of `/leads` | A |
| AC6 | Desktop (`lg`+) layout, column order, spacing pixel-identical to before | Agent-Probe | Manual desktop-viewport pass of `/unassigned` confirming every `order-*`/`mb-3` addition is neutralized by its `lg:` reset | A |
| AC7 | No type/lint/unit regressions | Fully-Automated | `bun run check` exits 0; `bun run test:unit:ci` exits 0 | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: strategy column carries only Fully-Automated / Hybrid / Agent-Probe. No Known-Gap strategy value used above — the DOM/tab-order trade-off (see Open gaps) is a named residual, not a value in this column.

Legacy line form (retained for existing validate-contract consumers):
- Field-order structural check: Fully-automated: `grep -n "order-[1-7]" src/routes/unassigned/+page.svelte`
- Field-order/de-emphasis/spacing/desktop-parity visual checks: Agent-probe: manual mobile+desktop viewport pass of `/unassigned` and `/leads` against AC1–AC6
- Claim-reachability e2e: Hybrid: `e2e/unassigned-filters.e2e.ts` + precondition: shared Playwright auth-fixture (currently unmet — spec self-skips via `test.fixme()`)
- Type/unit regression: Fully-automated: `bun run check` && `bun run test:unit:ci`

Failing stub (AC1 structural, Fully-Automated):
```
test("should show all 7 order-N/lg:order-none pairs on the correct fields", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: order-1..order-7 with lg:order-none not yet present in src/routes/unassigned/+page.svelte")
})
```

Failing stub (AC5 structural, Fully-Automated):
```
test("should leave DataGridShell.svelte with zero diff after the /unassigned-only change", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: confirm git diff --stat src/lib/components/leads/DataGridShell.svelte is empty")
})
```

Failing stub (AC7, Fully-Automated):
```
test("should keep bun run check and bun run test:unit:ci green after the class-only edits", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run bun run check && bun run test:unit:ci, confirm both exit 0")
})
```

Dimension findings:
- Infra fit: PASS — pure Tailwind CSS class edits in one Svelte page component; no container, port, worker, or runtime surface touched.
- Test coverage: PASS — tiers realistic given this repo's documented lack of visual-regression infra and the pre-existing e2e-auth-bootstrap gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); one CONCERN found and fixed in-plan (see below).
- Breaking changes: PASS — no schema/API/prop-contract changes; confirmed by direct read that `DataGridShell.svelte` and `LeadGrid.svelte` are unedited and the `rows` snippet signature is unchanged.
- Security surface: PASS — no auth, billing, secrets, or trust-boundary surface touched.
- Section A feasibility (Decision 1 — field order + de-emphasis): PASS — mechanical feasibility confirmed by direct source read (all line numbers and class strings in the Implementation Checklist match the live file exactly at lines 405–484); target order table cross-checked field-by-field against DOM order and reduces to the exact SPEC AFTER-diagram sequence; no pre-existing `order-*` utility found on this file (no conflicts); highest-risk edit is the source-badge wrapper (adds a class to a previously bare `<div>` while leaving the inner dynamic `sourceLabel(...).class` span untouched) — low risk, no mitigation beyond the plan's existing approach needed.
- Section B feasibility (Decision 2 — spacing): PASS — mechanical feasibility confirmed (row-div before/after class string matches the live file at line 406 exactly); `gap-1.5 lg:gap-3` precedent in `DataGridShell.svelte` line 48 confirmed real; no gaps or conflicts.
- Section C feasibility (Verification Evidence / test plan): CONCERN found and FIXED IN PLAN — the plan originally cited `bun run test:unit`, which per `package.json` maps to bare `vitest` (interactive watch mode, does not exit) rather than the CI-safe `bun run test:unit:ci` (`vitest --run`) documented in `process/context/tests/all-tests.md`. Corrected to `bun run test:unit:ci` in 3 locations (Goals section, Implementation Checklist step 10, Verification Evidence table) as part of this VALIDATE pass. Status after fix: PASS.

Open gaps:
- Known-gap (carried from SPEC, not introduced here): no automated visual-regression/component-snapshot infra exists in this repo, and e2e specs on protected routes self-skip pending the shared Playwright auth fixture — this is why AC1–AC4 and AC6 use Agent-Probe rather than Fully-Automated. Tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. known-gap: documented as NEW PLAN REQUIRED — see backlog/e2e-auth-bootstrap_NOTE_01-07-26.md (pre-existing, not created by this plan).
- New known-gap introduced by this plan's own design (Decision 1): CSS `order-*` changes visual order only — DOM order, tab order, and screen-reader traversal order remain unchanged (checkbox → organizer → event → stage → source → country → category → former-owner → appeal → actions). No SPEC AC requires DOM/tab/screen-reader reordering (AC1–AC4 are visual/behavioral-only), so this is an accepted trade-off, not a regression. No resolution path within this plan's scope — a DOM reorder would break the desktop grid per Decision 1's stated rationale. Carried forward as a named residual, not silently absorbed.

What this coverage does NOT prove:
- The structural `order-N` grep check (AC1) proves the classes exist in markup; it does NOT prove the browser actually renders them in the intended visual sequence (relies on the paired Agent-Probe visual check for that).
- The `DataGridShell.svelte` zero-diff check (AC5) proves the shared file is byte-identical; it does NOT independently re-verify `/leads`'s live visual rendering (relies on the paired Agent-Probe check of `/leads`).
- `bun run check` and `bun run test:unit:ci` prove no type/lint/existing-unit regressions; neither asserts anything about this markup's new classes, since no unit test in this repo targets Svelte template class strings.
- Agent-Probe visual passes (AC1 visual half, AC2, AC3 interim, AC4, AC5 visual half, AC6) are one-time manual/agent judgment calls, not regression-proof automated gates — a future refactor could silently break any of these without a failing test catching it.
- The Hybrid claim-reachability e2e (AC3) proves nothing today — the spec is `test.fixme()` and does not execute until the shared auth-fixture gap is resolved.
- No coverage proves or disproves the accepted DOM/tab/screen-reader-order known-gap either way — it is an explicitly out-of-scope trade-off, not a tested-and-passing claim.

Gate: PASS (no FAILs, one CONCERN found and fixed in plan during this VALIDATE pass)
Accepted by: N/A — Gate is PASS; no unresolved concerns require user acceptance.

## Autonomous Goal Block

SESSION GOAL: Ship #173 (mobile card field priority) + #174 (inter-card spacing) on `/unassigned`, CSS-only, zero desktop/`/leads` change.
Charter + umbrella plan: N/A — single plan (no umbrella program governs this task).
Autonomy: Standard RIPER-5 approval gates apply — EXECUTE requires explicit "ENTER EXECUTE MODE"; no standing /goal autonomy granted for this task.
Hard stop conditions / safety constraints:
- Never touch `src/lib/components/leads/DataGridShell.svelte` or `LeadGrid.svelte` — doing so risks regressing `/leads` (AC5 structural guarantee depends on zero diff to these files).
- Every `order-*` or spacing class added on mobile MUST be paired with its `lg:` reset (`lg:order-none` / `lg:mb-0`) — no desktop visual change is permitted (AC6).
- No schema, auth, API, or billing surface may be touched by this plan.
Next phase: EXECUTE: process/features/leads/active/ufg-card-layout-polish_03-07-26/ufg-card-layout-polish_PLAN_03-07-26.md
Validate contract: inline in plan (this section)
Execute start: `bun run check` && `bun run test:unit:ci` (fully-automated) | Agent-Probe mobile/desktop viewport pass of `/unassigned` + `/leads` per AC1–AC6 | high-risk pack: no

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/leads/active/ufg-card-layout-polish_03-07-26/ufg-card-layout-polish_PLAN_03-07-26.md`
2. **Last completed phase/step:** VALIDATE — validate-contract written, Gate: PASS.
3. **Validate-contract status:** written (03-07-26) — see `## Validate Contract` section above.
4. **Supporting context files loaded:** `process/context/all-context.md`; `process/context/tests/all-tests.md`; `ufg-card-layout-polish_SPEC_03-07-26.md` (locked SPEC, same task folder); `src/routes/unassigned/+page.svelte` (lines 380–519, live markup — every line/class cited in the plan was verified against this live read); `src/lib/components/leads/DataGridShell.svelte` and `src/lib/components/leads/LeadGrid.svelte` (both confirmed unedited — AC5 structural guarantee); `package.json` (confirmed `bun run test:unit:ci` is the correct CI-safe command — plan corrected from bare `bun run test:unit` during this VALIDATE pass); `e2e/unassigned-filters.e2e.ts` (confirmed `test.fixme()` self-skip, matching the documented AC3 known-gap).
5. **Next step for a fresh agent:** Run `ENTER EXECUTE MODE` against this plan file. Follow the Implementation Checklist (14 steps) exactly; run the Test Gates from the validate-contract; report back against AC1–AC7.

---

VALIDATE complete — Gate: PASS. Say **"ENTER EXECUTE MODE"** when ready to proceed to implementation.
