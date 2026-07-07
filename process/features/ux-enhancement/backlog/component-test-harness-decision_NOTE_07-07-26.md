---
name: report:component-test-harness-decision
description: "Deferred devDependency decision — Svelte component-test harness (@testing-library/svelte + happy-dom) for ComboboxFreetext render/click coverage (GitHub #250)"
date: 07-07-26
metadata:
  node_type: memory
  type: report
  feature: ux-enhancement
  phase: combobox-suggest-freetext
---

# NOTE — Deferred: Svelte component-test harness for ComboboxFreetext (GitHub #250)

**Status:** OPEN — devDependency decision deferred (Resolution B applied instead).

## TL;DR

`ComboboxFreetext.svelte` (GitHub #250) ships with its "never block free-text" contract proven
Fully-Automated via the extracted pure-logic module `combobox-freetext-logic.ts` (Resolution B).
The DOM-level render/click/keyboard proof (AC2 dropdown renders, AC4 click-to-fill) remains
e2e-only and self-skips today (shared-auth-fixture known-gap). Closing that gap at the
component level needs a new Svelte component-test harness — a **new devDependency decision**
that was NOT taken during EXECUTE.

## What was deferred (Resolution A)

Adding, per the plan's Test Infra Improvement Notes:

- a second Vitest project in `vite.config.ts` named `client` with `environment: 'happy-dom'`
  and `include: ['src/**/*.svelte.{test,spec}.{js,ts}']`
- devDeps `@testing-library/svelte` + `happy-dom` (both confirmed ABSENT in `package.json`)

This would make AC2/AC4/AC5 render/click assertions Fully-Automated via a `.svelte.test.ts`.

## What was applied instead (Resolution B, always-on)

- `combobox-freetext-logic.ts` + `combobox-freetext-logic.spec.ts` prove the AC5 never-block
  invariant, the AC2 `shouldShowDropdown` decision, the AC4 `applySelection` exact-value return,
  and the latest-wins guard — all Fully-Automated under the existing `node` vitest project.
- No AC rests on a Known-Gap alone (vacuous-green ban honored).

## Residual coverage that stays e2e-only (CONDITIONAL) until this is resolved

- AC2 — the dropdown actually renders in the DOM as the user types (all 3 organizer entry points).
- AC4 — a real click on a suggestion fills the `<input>` and closes the listbox.
- ARIA attributes + keyboard nav (ArrowDown/ArrowUp/Enter/Escape) behave in a browser.

## Precedent / grouping

Same root class as the already-open `@axe-core/playwright` devDep decision
(`process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`).
Consider deciding both together.

## Decision needed from

Team/orchestrator — approve adding the two devDeps + the `client` vitest project, or keep the
render/click proof e2e-gated until the shared Playwright auth fixture lands.
