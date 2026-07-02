---
name: plan:templates-card-view
description: Add default Card grid view + tab switcher (Card/List) to the manager-only /templates page — UI-only presentation enhancement
date: 02-07-26
feature: outreach-templates
---

# Templates Card View + Tabs — Implementation Plan

> TL;DR: Add a flat responsive **card grid** (default view) and an inline **segmented-control tab switcher** to toggle between Card and the existing category-grouped List view. Single-file UI change in `src/routes/templates/+page.svelte`. Reuse existing modal create/edit + delete handlers, badge styling, and `data.templates`. No schema/DB/API/dep changes.

**Date**: 02-07-26
**Status**: Ready for VALIDATE → EXECUTE
**Complexity**: SIMPLE

## Overview / Context

Increment on the outreach-templates feature (same task folder as `outreach-templates_PLAN_02-07-26.md`). The `/templates` manager page currently renders a category-grouped list only. This plan adds a default Card grid view plus a Card/List tab switcher — presentation-only. Relevant context loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, the existing feature SPEC/PLAN, and `src/routes/templates/+page.svelte` + `+page.server.ts`.

## Goal

The manager `/templates` page loads showing templates as a grid of cards (one per template). A two-option tab switcher lets the manager flip between **Card** view (flat grid, default) and **List** view (the existing category-grouped list). Both views render the same underlying template data and share the same create/edit modal and delete action.

## Touchpoints

| File | Change |
|---|---|
| `src/routes/templates/+page.svelte` | Add `viewMode` `$state`; add inline tab switcher; add card-grid markup; wrap existing grouped list in a `{#if viewMode === 'list'}` branch. No changes to script logic (`save`/`remove`/`openEdit`/`openCreate`), load, or modal. |

No other files touched.

## Public Contracts

None. This is a presentation-only change inside one route component. No exported interfaces, props, API, or schema change. `data.templates` shape is consumed unchanged.

## Blast Radius

- **Files:** 1 (`src/routes/templates/+page.svelte`)
- **Packages:** app only (SvelteKit route)
- **Risk class:** none (no schema, auth, API, billing, migration, or trust-boundary surface)
- **Downstream consumers:** none — page is a leaf route

## Design Decisions (locked in INNOVATE)

1. **Tabs = inline segmented control** backed by `let viewMode = $state<'card' | 'list'>('card')`. Two buttons; active state styled via existing button/utility classes. No new component, no bits-ui wrapper, no URL param.
2. **Card view = flat grid** (not category-grouped). Grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` (matches `/reports` idiom). One card per template.
3. **Card content:** category `Badge` (reuse exact inline style from list view: `style="color:#6b6470;background:#f1eff3;border-color:transparent"`), title (`text-[13px] font-semibold text-ink-600`), body preview (`line-clamp-3 text-[12.5px] text-ink-500` — NO `whitespace-pre-wrap` to keep clamp working), and (manager-only) Edit/Delete buttons in the card footer reusing `openEdit(t)` / `remove(t)`.
4. **Card default = 'card'** so the page loads in Card view.
5. **Empty state** rendered inside each tab body (both branches share the existing `{#if grouped.length === 0}` / card-count check — factor the empty check to `data.templates.length === 0`).

## Implementation Checklist

1. In `src/routes/templates/+page.svelte` `<script>`: add `let viewMode = $state<'card' | 'list'>('card');`. (`grouped` derived and all handlers stay as-is.)
2. Between `PageHeader`/manager-note and the content block, add an inline tab switcher: a small `flex` row of two buttons ("Cards" / "List") using `Button` (or a bordered segmented `div`), where the active `viewMode` button is visually emphasized (e.g. `variant` swap or an active class). Set `onclick={() => (viewMode = 'card')}` / `'list'`.
3. Replace the single content block with a shared empty-state guard (`{#if data.templates.length === 0}` → existing "No templates yet" Card) followed by `{:else}` containing two branches:
   - `{#if viewMode === 'card'}` → card grid.
   - `{:else}` → the existing category-grouped list markup (moved verbatim).
4. Build the card grid: `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">` iterating `data.templates` (key `t.id`). Each item is a `Card` with: top row = category `Badge` (reused style); title; `line-clamp-3` body preview; and `{#if canManage}` footer with Edit/Delete `Button`s (`size="sm" variant="outline"`) wired to `openEdit(t)` / `remove(t)`.
5. Keep the List branch markup identical to the current grouped implementation (category badge header + count + stacked `Card` rows). No logic change.
6. Run gates (see Verification Evidence). Fix any type/lint issues (e.g. unused imports, `line-clamp` class availability — confirm Tailwind `line-clamp` is enabled; if not, use manual `overflow-hidden` + max-height or the `@tailwindcss/typography`/core clamp utility).

## Acceptance Criteria

1. `/templates` loads with the **Card** view active by default (flat grid, one card per template).
2. A visible tab switcher toggles between **Cards** and **List**; List view is the existing category-grouped layout, unchanged.
3. Each card shows: category badge, title, truncated body preview, and (manager-only) Edit/Delete actions that open the existing modal / trigger the existing delete confirm.
4. `bun run check`, `bun run lint`, and `bun run test:unit` all exit 0.
5. No changes to schema, DB, `/api/templates`, `LogTouchForm.svelte`, or dependencies.

## Phase Completion Rules

- **CODE DONE:** checklist items 1–6 implemented; `bun run check` + `bun run lint` + `bun run test:unit` green.
- **VERIFIED:** manual probe confirms Card default + tab toggle + Edit/Delete-from-card; only then eligible for UPDATE PROCESS archival.
- Code-only completion is `CODE DONE`, never `VERIFIED`.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | No TS/Svelte type regressions from new `$state`/markup |
| `bun run lint` exits 0 | Fully-Automated | Prettier/ESLint clean (no unused imports, formatting) |
| `bun run test:unit` exits 0 | Fully-Automated | Existing schema/unit suite unaffected (no logic change) |
| Manual: page loads in Card grid; clicking "List" shows grouped list; clicking "Cards" returns; Edit/Delete open modal/confirm from a card | Agent-Probe / Manual | Card view is default; tab toggle works; shared modal/delete reachable from cards |

## Test Infra Improvement Notes

(none identified yet — repo has no authenticated Playwright fixture for manager routes; manual verification stands in per existing feature known-gap.)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/outreach-templates/active/outreach-templates_02-07-26/templates-card-view_PLAN_02-07-26.md`
2. **Last completed step:** plan written; VALIDATE run inline (contract below).
3. **Validate-contract status:** written (see `## Validate Contract`).
4. **Supporting context loaded:** `all-context.md`, `tests/all-tests.md`, `templates/+page.svelte`, `+page.server.ts`, existing feature SPEC/PLAN.
5. **Next step for fresh agent:** implement checklist items 1–6 in `src/routes/templates/+page.svelte` only; run `bun run check` + `bun run lint` + `bun run test:unit`; verify Card is default and tab toggle works.

## Validate Contract

generated-by: outer-pvl
date: 2026-07-02

**Gate: PASS**

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS — single Svelte route, existing primitives, no runtime surface |
| Test coverage | PASS — check/lint/unit cover it; manual probe for visual toggle (accepted known-gap: no auth e2e fixture) |
| Breaking changes | PASS — no public contract, no exports changed |
| Security surface | PASS — no auth/data/secret change; manager gate unchanged |

| Layer 2 sections | Status |
|---|---|
| Card grid view | PASS — `data.templates` present; `Card`/`Badge`/`Button` importable; grid idiom proven in `/reports` |
| Tab switcher | PASS — `$state` toggle mechanical; no new dep |
| List branch (moved verbatim) | PASS — existing markup, no logic change |

**Totals: 0 FAILs / 0 CONCERNs / 7 PASSes → Net Gate: PASS**

### Execute-Agent Instructions

- E1 (checklist step 6): Confirm Tailwind `line-clamp-*` utility is available in this repo before relying on it. If unavailable, fall back to `overflow-hidden` with a fixed `max-h`. Document which was used in the phase report.
- E2: Do NOT modify `save`/`remove`/`openEdit`/`openCreate`/load/modal — reuse verbatim.
- E3: Empty-state guard must key off `data.templates.length === 0` so it shows once (not per-tab). List/Card branches sit under the `{:else}`.

### Test Gates
1. `bun run check` — exits 0
2. `bun run lint` — exits 0
3. `bun run test:unit` — exits 0
4. Manual probe: default = Card grid; toggle to List and back; Edit/Delete reachable from a card.
