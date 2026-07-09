---
phase: template-category-combobox
date: 2026-07-09
status: COMPLETE_WITH_GAPS
feature: ux-enhancement
plan: process/features/ux-enhancement/active/template-category-combobox_09-07-26/template-category-combobox_PLAN_09-07-26.md
---

## What Was Done

Implemented GitHub #274 (scoped to the Template Category field only), following the approved plan exactly, Option A (enum tightening) as confirmed:

1. **`src/lib/utils/template-category-suggest.ts`** (new) — `filterTemplateCategories(q)`: pure, case-insensitive substring filter over `TEMPLATE_CATEGORIES`, empty query returns the full list, wrapped in `Promise.resolve`.
2. **`src/tests/template-category-suggest.spec.ts`** (new) — 5 cases: empty→full list, prefix match, substring match, case-insensitive, no-match→`[]`. All green.
3. **`src/lib/zod/schemas.ts`** — `templateFormSchema.category` tightened from `z.string().min(1)` to `z.enum(TEMPLATE_CATEGORIES, { message: 'Choose a valid category' })`; added `import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';`.
4. **`src/tests/schemas.spec.ts`** — added `templateFormSchema` describe block: valid category passes, off-list (`'Sportz'`) rejected, plus 2 regression checks (missing title / missing body still rejected). Imported `templateFormSchema`. All existing cases untouched and still passing.
5. **`src/routes/templates/+page.svelte`** — added imports for `ComboboxFreetext` and `filterTemplateCategories`; replaced the create/edit form's `<Select type="single" bind:value={category}>...</Select>` block with `<ComboboxFreetext id="tpl-category" bind:value={category} search={filterTemplateCategories} placeholder="Category" />`, keeping the existing `<Label for="tpl-category">`. The `Select`-family import (line 13) was kept since the category FILTER select and sort select still use it.

## What Was Skipped or Deferred

- Agent-Probe rows (AC1, AC3, AC5 — combobox render, keyboard nav, edit-prefill) deferred to EVL per the plan's Phase Completion Rules — code is `CODE DONE`, not yet `VERIFIED`.
- Known-gaps carried from the plan (no code change needed): component-test harness absence, live-DB off-list-row check.

## Test Gate Outcomes

- `bun run test:unit -- src/tests/template-category-suggest.spec.ts src/tests/schemas.spec.ts` → 2 files, 74 tests passed.
- `bun run check` → 0 errors, 6 pre-existing warnings in unrelated files (no new warnings).
- `bun run test:unit:ci` (full suite) → 52 passed, 9 skipped (pre-existing skips) / 565 tests passed, 165 skipped. No regressions.

## Plan Deviations

None. Implementation matches the plan's Implementation Checklist (steps 1-7) and touchpoints exactly.

## Test Infra Gaps Found

None new. Existing known-gaps (component-test harness, live-DB check) apply unchanged — see plan's Validate Contract "Open gaps".

## Closeout Packet

- **Selected plan:** `process/features/ux-enhancement/active/template-category-combobox_09-07-26/template-category-combobox_PLAN_09-07-26.md`
- **Finished:** all 5 Fully-Automated gates green; category FILTER Select (list page, `+page.svelte:233-245`) and sort Select (`+page.svelte:247-264`) confirmed untouched via grep; `Select` import retained; `category` state binding unchanged so existing saved categories still load/display correctly on edit (same `openEdit()` load path, same bound variable now passed to `ComboboxFreetext`'s `value` prop).
- **Verified vs unverified:** code-level behavior fully verified (automated). UI-render behavior (combobox visual render, keyboard nav, ARIA, edit-prefill visual confirmation) still needs the Agent-Probe pass at EVL per the plan's Phase Completion Rules.
- **Cleanup remaining:** none beyond the standard EVL confirmation run + agent-probe.
- **Best next valid state:** proceed to EVL confirmation run (spawn vc-tester to independently re-run the 4 Fully-Automated gates), then Agent-Probe pass for AC1/AC3/AC5/AC6/AC7, then UPDATE PROCESS to archive.

## Forward Preview

### Test Infra Found
No new test infra gaps. Runner is vitest via `bun run test:unit`.

### Blast Radius Changes
Exactly the 5 files declared in the plan's Blast Radius section: 2 new (`template-category-suggest.ts`, `template-category-suggest.spec.ts`), 3 edited (`schemas.ts`, `schemas.spec.ts`, `templates/+page.svelte`). No schema/migration/API changes — `crm_message_templates.category` column type unchanged (still `text`).

### Commands to Stay Green
- `bun run test:unit -- src/tests/template-category-suggest.spec.ts src/tests/schemas.spec.ts`
- `bun run check`
- `bun run test:unit:ci`

### Dependency Changes
None. Reuses existing `ComboboxFreetext` (#250) unchanged.
