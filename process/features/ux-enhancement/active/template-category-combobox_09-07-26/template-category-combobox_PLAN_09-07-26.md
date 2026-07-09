---
name: plan:template-category-combobox
description: "GitHub #274 (scoped to 1 field) — convert Template Category select to suggestion-mode ComboboxFreetext on the templates create/edit form"
date: 09-07-26
feature: ux-enhancement
---

# Template Category → ComboboxFreetext (GitHub #274, scoped to one field)

**Date**: 09-07-26
**Status**: ACTIVE — VALIDATE complete (Gate: PASS), ready for EXECUTE
**Complexity**: SIMPLE (single-field UI swap + one-line validator tightening; no migration, no new API, no new component)

## Overview

**TL;DR:** Swap the Template Category `<Select>` in the templates create/edit modal (`templates/+page.svelte`, create/edit block ~lines 529-536) for the existing suggestion-mode `ComboboxFreetext`, fed by a client-side filter over the frozen `TEMPLATE_CATEGORIES` list. The current server schema is `z.string().min(1)`, **not** `z.enum` — so "reject unrecognized values" (locked AC #4) requires a one-line schema tightening to `z.enum(TEMPLATE_CATEGORIES)`. **This is CONFIRMED as Option A by the orchestrator** (see Decision section). Category FILTER and all other dropdowns are out of scope.

Context loaded from `process/context/all-context.md` (routing) plus the touchpoint files listed below; test tiers follow `process/context/tests/all-tests.md`.

---

## Decision Resolved Before EXECUTE — Option A CONFIRMED

**Status: CONFIRMED by orchestrator (VALIDATE, 09-07-26). Option A is locked; this is no longer an open question.**

The locked approach stated "server-side validation UNCHANGED — the Zod schema stays `z.enum(TEMPLATE_CATEGORIES)`." **Repo reality contradicted this:** `src/lib/zod/schemas.ts:268` is `category: z.string().min(1, 'Category is required')` — any non-empty string passes; there is no enum enforcement today. The two locked statements ("validation UNCHANGED" + "unrecognized value rejected") could not both hold, so a one-line tightening was required to realise AC #4.

| Option | Change | Fulfils locked AC #4 (reject unknown)? | Data-integrity | Risk |
|---|---|---|---|---|
| **A — CONFIRMED** | Tighten `templateFormSchema.category` → `z.enum(TEMPLATE_CATEGORIES)` (1 line, client+server share this schema) | Yes | Preserves exact-match category grouping — no typo'd lone-groups | Very low. All existing rows came from the old frozen enum → zero existing-data rejection |
| B — rejected | Keep `z.string().min(1)` unchanged (true "suggest but never block") | No — AC #4 dropped | Weaker: typos become saveable categories, fragmenting groups | None to code; product-integrity regression |

**Orchestrator decision (locked): Option A.** Rationale confirmed during VALIDATE via static analysis — migration `drizzle/0028_cat1_drop_enum_column.sql` converted `crm_message_templates.category` off the `crm_lead_category` pgEnum with `ALTER COLUMN ... TYPE text USING "category"::text` (value-preserving); the 20 enum values are the verbatim `TEMPLATE_CATEGORIES` list; seed rows (`scripts/seed-templates.ts`) use `'Other'` (on-list); and the only write UI is the on-list `<Select>`. Therefore **zero existing rows would be rejected** by the enum tightening. Option A is a one-line validator tightening (not a DB schema/migration/API-contract change), realises the substantive locked AC, and keeps template grouping stable. (Live-DB confirmation that no off-list row was ever written via a direct DB/API path is a documented known-gap — see Validate Contract.)

---

## Goals / Scope

**In scope:** Template Category field on the create/edit modal only.
**Out of scope (explicit):** the category FILTER on the list page (`+page.svelte:231-243`), the sort select (`+page.svelte:245-262`), and every other dropdown in the app (role, stage, platform, visibility, currency, sort, all filters, all id-pickers) per the #274 RESEARCH audit.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/utils/template-category-suggest.ts` | **NEW** — `filterTemplateCategories(q: string): Promise<string[]>`: pure client-side case-insensitive filter over `TEMPLATE_CATEGORIES`, wrapped in `Promise.resolve` to satisfy `ComboboxFreetext`'s `search?: (q: string) => Promise<string[]>` prop (verified signature). No API call (local 20-item list). Mirrors the shape of `organizer-suggest.ts` (`fetchOrganizerNames`). Extracted as a standalone pure fn so it is fully-automated testable. |
| `src/routes/templates/+page.svelte` | Replace the create/edit `<Select type="single" bind:value={category}>` block (~lines 529-536) with `<ComboboxFreetext id="tpl-category" bind:value={category} search={filterTemplateCategories} placeholder="Category" />`. Keep the `<Label for="tpl-category">` (line 529). Add two imports (`ComboboxFreetext`, `filterTemplateCategories`). **Keep the `Select`-family import (line 13)** — the filter Select (231-243) and sort Select (245-262) still use it. The `category` state (`$state<string>('Other')`, lines 88/97/106) and `save()` `safeParse` (line 114) are unchanged. **Match by the `bind:value={category}` string, not by line number** — the filter Select uses `value={data.filters.category}` + `onValueChange` and must NOT be touched. |
| `src/lib/zod/schemas.ts` | Line 268: `category: z.string().min(1, 'Category is required')` → `category: z.enum(TEMPLATE_CATEGORIES, { message: 'Choose a valid category' })`. Add `import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';` (not currently imported into schemas.ts). |
| `src/tests/schemas.spec.ts` | Add cases: valid category passes; unknown string (`'Sportz'`) fails. Confirm no regression to other `templateFormSchema` fields (title/body). |
| `src/tests/template-category-suggest.spec.ts` | **NEW** — unit tests for `filterTemplateCategories` (empty query → full list; prefix/substring match; case-insensitive; no match → `[]`). |

## Public Contracts

- **`filterTemplateCategories(q)`** — new pure util, contract: returns a `Promise<string[]>` subset of `TEMPLATE_CATEGORIES`. No network, no side effects.
- **`templateFormSchema.category`** (Option A) — tightens from any non-empty string to the 20-value enum. This is the only externally-visible behavior change: the create/edit save (`safeParse` at `+page.svelte:114`) and any other caller of `templateFormSchema` now reject off-list categories. Only found consumer: `save()` at `+page.svelte:114`. No API route signature changes; no DB column change (`crm_message_templates.category` stays `text`).
- **DB / migration:** none. `category` column type unchanged.

## Blast Radius

- **Files:** 3 changed + 2 new = 5. Packages: 1 (the app).
- **Risk class:** low. No auth, billing, migration, or API-contract surface. Option A is a client+server validation tightening on a non-security field; worst case is a stricter-than-before reject of a typo, which is the desired behavior.
- **Existing-data safety:** all stored `category` values originate from the retired `crm_lead_category` pgEnum = the same 20 strings → enum tightening rejects none of them (confirmed via migration `0028` + seed static analysis). Editing an existing template loads its category into `bind:value` and it renders/validates fine.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `filterTemplateCategories` unit tests (empty→all, prefix, substring, case-insensitive, no-match→[]) — `bun run test:unit -- src/tests/template-category-suggest.spec.ts` exits 0 | Fully-Automated | AC2 (suggestions populate from TEMPLATE_CATEGORIES) |
| `templateFormSchema` cases: valid category passes; `'Sportz'` rejected — `bun run test:unit -- src/tests/schemas.spec.ts` exits 0 | Fully-Automated | AC4 (unrecognized value rejected) |
| `templateFormSchema` regression: title/body cases still pass unchanged | Fully-Automated | No regression to existing template form validation |
| `bun run check` (svelte-check/tsc) clean | Fully-Automated | Type-safe `bind:value` + prop wiring |
| Open create modal → Category field renders as combobox; type "con" → Conference/Concert/Convention suggested; arrow+Enter selects; Escape keeps typed text | Agent-Probe | AC1, AC5 (combobox render + keyboard/ARIA) |
| Edit an existing template → its saved category pre-fills the combobox input and displays correctly | Agent-Probe | AC3 (existing values load/display) |
| Category FILTER (list page) + sort select visually unchanged after the swap | Agent-Probe | AC6/AC7 (filter + other dropdowns untouched) |

Failing stubs (Fully-Automated rows, for EXECUTE red-first):
```
test("filterTemplateCategories returns full list on empty query", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: empty query → all 20 categories")
})
test("filterTemplateCategories is case-insensitive substring match", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: 'con' → Conference/Concert/Convention")
})
test("templateFormSchema rejects an off-list category (Option A)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: category 'Sportz' fails enum validation")
})
```

**Known-Gap (Agent-Probe rows):** no Svelte component-test harness exists in this repo (documented open decision — `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`). Combobox render / keyboard-nav / edit-prefill are verified by agent probe at EVL, not automated. Same pre-accepted class as #250. Not a blocker; recorded as residual.

## Implementation Checklist

1. Create `src/lib/utils/template-category-suggest.ts` exporting `filterTemplateCategories(q: string): Promise<string[]>` — case-insensitive substring filter over `TEMPLATE_CATEGORIES`, empty query returns the full list, wrapped in `Promise.resolve`.
2. Create `src/tests/template-category-suggest.spec.ts` with the cases in the Verification table; run red-first, then green.
3. Edit `src/lib/zod/schemas.ts:268` → `category: z.enum(TEMPLATE_CATEGORIES, { message: 'Choose a valid category' })`; add `import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';`.
4. Add the two `templateFormSchema` cases (valid pass, `'Sportz'` reject) to `src/tests/schemas.spec.ts`; keep existing title/body cases.
5. In `src/routes/templates/+page.svelte`: add imports for `ComboboxFreetext` (`$lib/components/ui/combobox-freetext/ComboboxFreetext.svelte`) and `filterTemplateCategories`.
6. Replace the create/edit `<Select type="single" bind:value={category}>` block (~lines 529-536) with `<ComboboxFreetext id="tpl-category" bind:value={category} search={filterTemplateCategories} placeholder="Category" />`. Keep the `<Label for="tpl-category">`. Do **not** touch the filter Select (231-243) or sort Select (245-262); keep the `Select` import (line 13). Match the edit target by the `bind:value={category}` string, not line number.
7. Run `bun run check` + the two test files (`bun run test:unit -- src/tests/template-category-suggest.spec.ts` and `bun run test:unit -- src/tests/schemas.spec.ts`); fix until green.
8. Agent-probe: create modal combobox render + keyboard nav; edit-existing prefill; confirm filter/sort selects unchanged.

## Acceptance Criteria (reframed to repo reality)

- **AC1** Template Category field (create/edit modal) renders as suggestion-mode `ComboboxFreetext`.
- **AC2** Suggestions populate from `TEMPLATE_CATEGORIES` via `filterTemplateCategories`.
- **AC3** Editing an existing template pre-fills and displays its saved category correctly.
- **AC4** (Option A — CONFIRMED) Submitting an off-list category shows the inline `FieldError`/`formError` via the existing `safeParse` path.
- **AC5** Keyboard nav + ARIA work (inherited from `ComboboxFreetext`, verified by probe).
- **AC6** Category FILTER dropdown (list page) untouched.
- **AC7** All other app dropdowns untouched.

## Phase Completion Rules

This is a single-phase SIMPLE plan. It is complete only when:

- All Fully-Automated rows in Verification Evidence are green (`bun run check` + both test files exit 0) — this is `CODE DONE`.
- Agent-Probe rows (AC1/AC3/AC5) are judged during EVL; they are `VERIFIED` only after probe confirmation, never on code-completion alone.
- Known-Gap (no component-test harness) is recorded as residual, not a blocker.

Status vocabulary: `CODE DONE` (automated green) → `VERIFIED` (probe + user confirmation). Do not mark VERIFIED without both.

## Dependencies / Risks

- Depends on `ComboboxFreetext` (#250) — already in repo, unchanged. `search?` prop signature verified: `(q: string) => Promise<string[]>`.
- Risk: `save()` currently sets `formError` from `safeParse`; confirm the enum error message surfaces through the existing `{#if formError}` block (line 547). Low — same code path as today.
- No migration, no API, no auth/billing surface.

## Test Infra Improvement Notes

(none new — the Svelte component-test harness gap is pre-existing and tracked in `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`.)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ux-enhancement/active/template-category-combobox_09-07-26/template-category-combobox_PLAN_09-07-26.md`
2. **Last completed step:** VALIDATE complete (Gate: PASS). No code changed yet.
3. **Validate-contract status:** written (Gate: PASS, 09-07-26). Option A confirmed.
4. **Context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `template-categories.ts`, `ComboboxFreetext.svelte`, `organizer-suggest.ts`, `templates/+page.svelte`, `zod/schemas.ts`, `server/db/schema.ts`, `server/db/templates.ts`, `scripts/seed-templates.ts`, `drizzle/0028_cat1_drop_enum_column.sql`.
5. **Next step for a fresh agent:** ENTER EXECUTE MODE — execute checklist steps 1-8 in order (TDD red-first on steps 1-4).

## Next Step

Say **ENTER EXECUTE MODE** for this plan (Gate: PASS, contract below).

## Validate Contract

Status: PASS
Date: 09-07-26
date: 2026-07-09
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 5 files in blast radius). Single package, no high-risk class, no independent directions. EXECUTE runs as one sequential vc-execute-agent (opus).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | `filterTemplateCategories` filters `TEMPLATE_CATEGORIES` (empty→all, prefix, substring, case-insensitive, no-match→[]) | Fully-Automated | `bun run test:unit -- src/tests/template-category-suggest.spec.ts` exits 0 | B |
| AC4 | `templateFormSchema` rejects off-list category (`'Sportz'` fails), accepts valid | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` exits 0 | B |
| — | No regression to `templateFormSchema` title/body validation | Fully-Automated | Same suite — existing title/body cases pass | A |
| AC1 | Type-safe `bind:value` + `ComboboxFreetext` prop wiring compiles | Fully-Automated | `bun run check` exits 0 | B |
| AC1, AC5 | Category field renders as combobox; "con" suggests Conference/Concert/Convention; arrow+Enter selects; Escape keeps typed text | Agent-Probe | Manual probe in create modal at EVL | C |
| AC3 | Editing an existing template pre-fills + displays its saved category | Agent-Probe | Manual probe on edit at EVL | C |
| AC6, AC7 | Filter Select (231-243) + sort Select (245-262) visually unchanged | Agent-Probe | Manual visual check at EVL | C |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to EVL agent-probe (no component-test harness); D — backlog test-building stub.

C-4 reconciliation: `strategy:` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here; Hybrid not applicable). Known-Gap is not a strategy — the component-test-harness absence is a named residual (Open Gaps), not a coverage row.

Failing stub (Fully-Automated rows):
```
test("filterTemplateCategories returns full list on empty query", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: empty query → all 20 categories")
})
```
Failing stub:
```
test("filterTemplateCategories is case-insensitive substring match", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: 'con' → Conference/Concert/Convention")
})
```
Failing stub:
```
test("templateFormSchema rejects an off-list category (Option A)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: category 'Sportz' fails enum validation")
})
```

Legacy line form (retained for existing consumers):
- filterTemplateCategories util: Fully-automated: `bun run test:unit -- src/tests/template-category-suggest.spec.ts`
- templateFormSchema enum tightening: Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- type-safety of combobox wiring: Fully-automated: `bun run check`
- combobox render / keyboard / edit-prefill (AC1/AC3/AC5): Agent-probe: manual probe at EVL
- component-test harness for AC1/AC3/AC5: known-gap: documented (component-test-harness-decision_NOTE_07-07-26.md)

Dimension findings:
- Infra fit: PASS — all touchpoint files/line-refs verified against source; `ComboboxFreetext.search?` signature `(q: string) => Promise<string[]>` matches `filterTemplateCategories` contract exactly; test runner is vitest via `bun run test:unit`. Plan's original `bun run test src/tests/X` command form was inaccurate and has been corrected to `bun run test:unit -- src/tests/X` (per `process/context/tests/all-tests.md`).
- Test coverage: PASS — Fully-Automated gates cover all code-level behaviors (util filter, enum validation, type-safety); UI-render ACs correctly tiered to Agent-Probe; component-test harness is a documented pre-accepted known-gap.
- Breaking changes: PASS — only externally-visible change is `templateFormSchema.category` tightening to enum; sole consumer is `save()` at `+page.svelte:114`; existing-data safety confirmed via migration `0028` (value-preserving `USING category::text`) + seed static analysis (zero rows rejected). No API/DB-column change.
- Security surface: PASS — no auth/billing/secrets/trust-boundary; enum tightening on a non-security text field; not a high-risk class, no evidence pack required.
- Section A feasibility (combobox swap + enum tightening): PASS — all edit targets uniquely matchable (`<Select type="single" bind:value={category}>` distinct from filter/sort selects); `Select` import correctly retained; highest-risk edit is the schemas.ts enum line, mitigated by TDD red-first on the `'Sportz'` reject case and the existing `formError` render path.

Open gaps:
- component-test harness for AC1/AC3/AC5: known-gap: documented (`process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`) — verified by Agent-Probe at EVL instead.
- live-DB off-list-row check for Option A: known-gap: documented — static analysis (migration 0028 + seed + on-list write UI) strongly supports zero-rejection, but a live-DB query confirming no off-list `category` value was ever written via a direct DB/API path is not runnable in this env (same live-DB-CI-harness class as sibling features).

What this coverage does NOT prove:
- `bun run test:unit -- src/tests/template-category-suggest.spec.ts`: proves the pure filter logic; does NOT prove the combobox renders those results in the DOM, or that keyboard nav / ARIA behave (Agent-Probe, EVL).
- `bun run test:unit -- src/tests/schemas.spec.ts`: proves the enum accepts on-list and rejects off-list at the schema layer; does NOT prove the rejection message surfaces through the `{#if formError}` block in the live modal (Agent-Probe, EVL), and does NOT prove that no existing stored row is off-list (live-DB known-gap).
- `bun run check`: proves types compile; does NOT prove runtime render/behavior.
- Agent-Probe rows: prove render/keyboard/prefill by human/agent judgment at EVL; not automated, not regression-protected.

Gate: PASS (no FAILs, no unresolved CONCERNs; Option A confirmed by orchestrator; UI-probe + live-DB items are documented known-gaps excluded from CONCERN count; plan metadata format corrected and test commands fixed in this contract)
Accepted by: session (orchestrator confirmed Option A; known-gaps pre-accepted — component-test-harness gap and live-DB off-list-row gap)

## Autonomous Goal Block

```
SESSION GOAL: Template Category field → suggestion-mode ComboboxFreetext (GitHub #274, scoped to 1 field) + tighten templateFormSchema.category to z.enum(TEMPLATE_CATEGORIES)
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: standard interactive RIPER-5; no standing /goal. Option A (enum tightening) is CONFIRMED by orchestrator — do not re-present as an open decision.
Hard stop conditions / safety constraints:
- Do NOT touch the category FILTER Select (+page.svelte:231-243) or the sort Select (245-262) — create/edit field only.
- Keep the Select-family import (line 13); filter + sort still use it.
- No DB schema / migration / API-contract change — category column stays text.
Next phase: EXECUTE — process/features/ux-enhancement/active/template-category-combobox_09-07-26/template-category-combobox_PLAN_09-07-26.md
Validate contract: inline in plan (Gate: PASS, generated-by: outer-pvl)
Execute start: TDD red-first steps 1-4, then wire the combobox (steps 5-6). Fully-auto gates: bun run check | bun run test:unit -- src/tests/template-category-suggest.spec.ts | bun run test:unit -- src/tests/schemas.spec.ts. Agent-probe at EVL: combobox render/keyboard/edit-prefill. High-risk pack: no.
```
