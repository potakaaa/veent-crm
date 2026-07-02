---
name: plan:touch-log-templates
description: "Add static snippet template picker to LogTouchForm.svelte notes field"
date: 01-07-26
feature: leads
---

# Touch Log Templates — Plan

**Date**: 01-07-26
**Complexity**: Simple
**Status**: ✅ COMPLETE

## Overview

Add a "Templates" picker to `LogTouchForm.svelte` (the always-visible inline log-touch card on
`/leads/[id]`, NOT a modal — `LogTouchModal.svelte` does not exist). Clicking the picker shows
snippet categories (Intro / Follow-up / Pricing); selecting a snippet copies filled-in text into
the notes textarea. No auto-submit, no DB persistence, no schema changes.

## Goals

- Rep can pick a category → snippet → have it pasted into the notes `Textarea`, with `{{page}}`
  and `{{event}}` placeholders auto-filled from the current lead's `name` / `eventName`.
- Rep can still edit the note before clicking "Log touch".

## Scope

In scope: `src/lib/data/templates.ts` (new), `LogTouchForm.svelte` (add prop + picker UI),
`+page.svelte` (pass `lead` prop). Static hardcoded templates only.

Out of scope (explicitly deferred): manager-editable/DB-backed template library, per-rep saved
templates, rich-text formatting in templates.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/data/templates.ts` | NEW — `TEMPLATES` constant + `fillTemplate()` helper |
| `src/lib/components/leads/LogTouchForm.svelte` | MODIFIED — add `lead` prop, Popover-based Templates trigger, snippet list, fill-and-assign-to-`note` handler |
| `src/routes/leads/[id]/+page.svelte` | MODIFIED — pass `{lead}` into `<LogTouchForm>` (currently only `onSubmit` is passed, line ~351) |

## Public Contracts

None new. `LogTouchForm` gains one new prop (`lead`) — this is an internal component contract,
not a public API. No route, schema, or Zod validator changes (`activityFormSchema` /
`logTouchSchema` in `src/lib/zod/schemas.ts` only validate `channel`/`outcome`/`followUpAt`/`notes`
and are unaffected — template selection happens client-side before submit).

## Blast Radius

3 files total: 1 new, 2 modified. No schema, no API route, no auth surface, no migration. Low
risk — client-side-only UI addition to an existing form. VALIDATE can fast-track.

## Acceptance Criteria

- [x] Clicking the Templates trigger inside `LogTouchForm.svelte` opens a popover showing 3
      categories: Intro / Follow-up / Pricing. (user-confirmed manual verification, 01-07-26)
- [x] Selecting a snippet pastes its filled text into the notes `Textarea` without submitting
      the form (no `onSubmit` call, no activity row created). (user-confirmed manual verification, 01-07-26)
- [x] `{{page}}` resolves to `lead.name` and `{{event}}` resolves to `lead.eventName ?? ''` in
      the pasted text.
- [x] Rep can edit the pasted text before clicking "Log touch". (user-confirmed manual verification, 01-07-26)
- [x] `src/lib/data/templates.ts` exports `TEMPLATES` and `fillTemplate` with no DB/schema
      dependency.
- [x] `bun run check` and `bun run test:unit -- src/tests/templates.spec.ts` pass.

## Implementation Checklist

1. **Create `src/lib/data/templates.ts`**:
   - Define `TemplateCategory = 'intro' | 'follow-up' | 'pricing'`.
   - Define `Template = { id: string; category: TemplateCategory; label: string; body: string }`.
   - Export `TEMPLATES: Template[]` with 3-4 entries per category (12 total). Bodies use literal
     `{{page}}` / `{{event}}` tokens, e.g.:
     - intro: `"Hi! Following up from {{page}} — saw you're organizing {{event}} and wanted to introduce our services."`
     - follow-up: `"Hey, just checking in on {{event}} for {{page}} — any updates on your end?"`
     - pricing: `"Here's our pricing breakdown for {{event}}. Let me know if you'd like a custom quote for {{page}}."`
     (Write 3-4 realistic variants per category; exact copy is not load-bearing, structure and
     placeholder usage is.)
   - Export `fillTemplate(body: string, vars: { page: string; event: string }): string` — pure
     function, `.replaceAll('{{page}}', vars.page).replaceAll('{{event}}', vars.event)`.

2. **Modify `LogTouchForm.svelte`**:
   - Import `Popover` primitives from `$lib/components/ui/popover` (confirmed present: `popover.svelte`,
     `popover-trigger.svelte`, `popover-content.svelte`, `popover-portal.svelte`, `index.ts` barrel —
     follow the existing `<Popover.Root bind:open><Popover.Trigger>...<Popover.Content>...` pattern
     used elsewhere in the codebase; grep for an existing consumer of `$lib/components/ui/popover`
     before writing to confirm the exact import names exported from `index.ts`). **[VALIDATE
     correction — see Execute-Agent Instruction E2 below: no existing consumer exists in this
     codebase; do not spend time searching for one, the exports are already confirmed.]**
   - Import `TEMPLATES`, `fillTemplate`, `Template` from `$lib/data/templates`.
   - Extend the `$props()` destructure/type: add `lead: { name: string; eventName: string | null }`
     (or the equivalent already-existing shared type used by `+page.svelte`'s `data.lead` — check
     `src/routes/leads/[id]/+page.server.ts` load return type and reuse it via `import type` rather
     than declaring a new inline shape, if a suitable exported type already exists; otherwise use
     the inline `Pick<...>` shape above — do not invent a new global type file for this). **[VALIDATE
     correction — see Execute-Agent Instruction E1 below: use `Pick<Lead, 'name' | 'eventName'>`
     from `$lib/types`; the actual field is `eventName?: string` (optional-undefined), not
     `string | null`.]**
   - Add local `let templatesOpen = $state(false)`.
   - Add a "Templates" `Button` (small/secondary style consistent with existing pill buttons) placed
     directly above or beside the `Textarea` (around line 90, before the `<Textarea>` element),
     wrapped in `<Popover.Root bind:open={templatesOpen}>`.
   - `<Popover.Content>` renders `TEMPLATES` grouped by `category` (three small labeled sections:
     "Intro" / "Follow-up" / "Pricing"), each snippet as a clickable row/button showing `label`.
   - `onclick` handler per snippet: compute
     `fillTemplate(t.body, { page: lead.name, event: lead.eventName ?? '' })`, assign the result to
     `note` (the existing `$state('')`), then set `templatesOpen = false`. Do NOT call `submit()` or
     `onSubmit` — paste-only.
   - No changes to `submit()`, channel/outcome/followUp logic, or the Zod-validated shape sent to
     `onSubmit`.

3. **Modify `src/routes/leads/[id]/+page.svelte`**:
   - Line ~351: change `<LogTouchForm onSubmit={logTouch} />` to `<LogTouchForm {lead} onSubmit={logTouch} />`.
   - `lead` is already in scope as `let lead = $derived(data.lead)` (line ~30) — no new data fetch needed.

4. **Add Vitest unit test** for `fillTemplate` in a new `src/tests/templates.spec.ts` (or append to
   existing `src/tests/schemas.spec.ts` sibling pattern — prefer a new file to keep template logic
   isolated): cover (a) both placeholders substituted, (b) missing/null eventName → empty string via
   `?? ''` at the call site (test the function directly with `event: ''`), (c) body with no
   placeholders returns unchanged, (d) placeholder appearing twice in one body is replaced at every
   occurrence (`.replaceAll` semantics).

## Phase Completion Rules

This is a SIMPLE (single-session) plan — no phase gates. The plan is complete when all
Implementation Checklist items are done and all Acceptance Criteria are checked, confirmed by the
Verification Evidence gates below (Fully-Automated gates green; Agent-Probe walkthrough performed
and confirmed by a human or agent tester).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `fillTemplate` substitutes `{{page}}`/`{{event}}` correctly (4 cases in step 4) | Fully-Automated (`bun run test:unit -- src/tests/templates.spec.ts`) | Placeholder substitution requirement |
| `bun run check` passes after prop/type changes | Fully-Automated | No TypeScript/Svelte regressions from new `lead` prop |
| Templates popover opens, selecting a snippet fills `note` without submitting | Agent-Probe (manual/browser walkthrough of `/leads/[id]`: open popover, click a snippet, confirm textarea updates, confirm no network POST / no activity row created, confirm rep can still edit before clicking Log touch) | Paste-only UX requirement; no-auto-submit requirement |
| Category grouping (Intro / Follow-up / Pricing) renders as 3 distinct sections | Agent-Probe (visual check during the same walkthrough) | Category picker requirement |

## Test Infra Improvement Notes

(none identified yet)

## Known Gaps

No Playwright/component-test harness exists today for `LogTouchForm.svelte` or the Log Touch flow
generally (confirmed via `process/context/tests/all-tests.md` — only Vitest + Playwright runners
exist, no component-test tooling). Popover open/close and paste-without-submit behavior is
therefore Agent-Probe tier, not Fully-Automated — this matches current repo test maturity and is an
accepted gap, not a regression introduced by this plan.

## Follow-ups / Out of Scope

- Manager-editable, DB-backed template library (CRUD UI + `crm_*` table) — deferred.
- Per-rep saved/custom templates — deferred.
- Rich-text formatting in templates — deferred.

## Resume and Execution Handoff

1. Selected plan file path: `process/features/leads/active/touch-log-templates_01-07-26/touch-log-templates_PLAN_01-07-26.md`
2. Last completed phase or step: VALIDATE (this document)
3. Validate-contract status: written, Gate: CONDITIONAL (see below)
4. Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/features/leads/_GUIDE.md`, direct reads of `LogTouchForm.svelte`, `+page.svelte`, `+page.server.ts`, `schema.ts`, `src/lib/types/index.ts`, `src/lib/components/ui/popover/*.svelte`
5. Next step for a fresh agent: "ENTER EXECUTE MODE" for this plan — run Implementation Checklist steps 1-4 in order, applying Execute-Agent Instructions E1/E2 from the validate-contract below.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 0/7 signals present (LOW) — single-file-domain, 3-file blast radius, no schema/auth/API/billing surface, no new dependencies. Dominant signal: none (score 0) — sequential single-agent EXECUTE is correct fit.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | `fillTemplate` substitutes `{{page}}`/`{{event}}` correctly across 4 cases (both filled, missing eventName → empty string, no placeholders present, placeholder repeated twice in one body) | Fully-Automated | `bun run test:unit -- src/tests/templates.spec.ts` | A |
| AC-2 | No TypeScript/Svelte regressions from new `lead` prop and Popover import wiring | Fully-Automated | `bun run check` | A |
| AC-3 | Templates popover opens; selecting a snippet fills `note` without submitting the form (no `onSubmit` call, no activity row created); rep can still edit before submit | Agent-Probe | Manual/browser walkthrough of `/leads/[id]`: open Templates popover, click a snippet, confirm textarea updates, confirm no network POST fires, confirm no activity row appears in the timeline, confirm text remains editable, then click "Log touch" normally | A — **PROVEN 01-07-26**: user performed the manual walkthrough and confirmed the popover renders categories, snippet selection fills the notes textarea with correct substitution, and no auto-submit occurs |
| AC-4 | Category grouping (Intro / Follow-up / Pricing) renders as 3 distinct labeled sections | Agent-Probe | Visual check during the same walkthrough as AC-3 | A — **PROVEN 01-07-26**: confirmed during the same user walkthrough |
| Known-Gap-1 | Popover keyboard/focus accessibility (tab order into trigger, focus trap while open, focus return to trigger on close/Escape) | Agent-Probe | NOT YET IMPLEMENTED — backlog stub: manual a11y audit (tab into Templates button, open with Enter/Space, Tab through snippet rows, close with Escape, confirm focus returns to trigger) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — it is a named residual row carried via gap-resolution D (Known-Gap-1 above uses `Agent-Probe` as its eventual proving strategy once the backlog stub is executed; it is not proven in this cycle).

Legacy line form (retained so existing validate-contract consumers still parse):
- `src/lib/data/templates.ts`: Fully-automated: `bun run test:unit -- src/tests/templates.spec.ts` | Fully-automated: `bun run check`
- `LogTouchForm.svelte` / `+page.svelte` Popover UI: Agent-probe: manual walkthrough per AC-3/AC-4 above | known-gap: Popover keyboard/focus a11y (documented, backlog stub)

Failing stub (AC-1 only — the only row with a scenario-based test file target; AC-2 is a static
typecheck/build gate, not a scenario, so no red-first stub applies to it):

```
test("should substitute {{page}} and {{event}} placeholders correctly across 4 cases (both filled, missing eventName as empty string, no placeholders present, placeholder repeated twice in one body)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: fillTemplate placeholder substitution")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/runtime surface touched; client-side-only UI addition.
- Test coverage: PASS — Fully-Automated/Agent-Probe tiering is appropriate given confirmed absence of a component-test harness (`process/context/tests/all-tests.md` Known Gaps); not a blocking gap.
- Breaking changes: PASS — `LogTouchForm` gains one new prop only; no route/schema/Zod-validator changes; no downstream consumers beyond the single call site at `+page.svelte:351`.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface; template text is assigned to a bound textarea value (not `{@html}` / `innerHTML`), so no XSS vector from interpolated `lead.name`/`lead.eventName`.
- Section: Implementation Checklist (single section) — CONCERN — mechanical feasibility mostly confirmed (edit target at `+page.svelte:351` is unique and present; Popover exports confirmed via `index.ts` read) but two plan-text inaccuracies found and corrected via Execute-Agent Instructions E1/E2 below; no conflicts with repo conventions found; highest-risk edit is the `LogTouchForm.svelte` prop-type change (mitigated by E1).

Open gaps:
- Popover keyboard/focus a11y behavior untested at any tier in this plan (Known-Gap-1 above) — known-gap: documented, accepted per repo's current lack of a11y test tooling; low risk for this internal small UI addition. Resolution options: A) manual a11y audit (~30 min) — recommended as a quick follow-up, not blocking; B) N/A (no infra to add); C) accept as known-gap (chosen) — rationale: consistent with repo-wide absence of a11y test tooling, non-blocking for a low-risk internal rep tool; D) backlog artifact `popover-a11y-audit_NOTE_01-07-26.md` in `process/features/leads/backlog/` if the team wants it tracked.
- No component-test harness exists for Popover open/close or paste-without-submit interaction (pre-existing repo gap, not introduced by this plan) — already documented in the plan's own `## Known Gaps` section; resolution: C) accept as known-gap — rationale: Agent-Probe walkthrough (AC-3/AC-4) sufficiently covers the acceptance criteria for this low-risk client-side addition; building a full component-test harness is out of scope for a 3-file plan.

What this coverage does NOT prove:
- AC-1/AC-2 (Fully-Automated): do not prove the popover UI renders correctly, that categories group visually as expected, or that the textarea actually receives the filled text at runtime — those are covered by AC-3/AC-4 (Agent-Probe) instead.
- AC-3/AC-4 (Agent-Probe): a one-time manual/agent walkthrough does not prove regression-safety on future changes (no automated UI test exists to re-run), does not prove keyboard/focus accessibility (see Known-Gap-1), and does not prove behavior across all browsers/viewports — only the walkthrough environment used at EXECUTE/EVL time.
- Known-Gap-1: not proven in this cycle at all; it is a named residual, not a passed gate.

Execute-agent instructions:
- E1 (trigger: `LogTouchForm.svelte` prop typing, Implementation Checklist step 2): The plan's suggested inline `lead` prop type `{ name: string; eventName: string | null }` does not match the actual `Lead` type in `src/lib/types/index.ts` (`eventName?: string` — optional/undefined, not nullable). Use `Pick<Lead, 'name' | 'eventName'>` imported via `import type { Lead } from '$lib/types'` for the `lead` prop, and guard with `lead.eventName ?? ''` (not a null check) when calling `fillTemplate`.
- E2 (trigger: `LogTouchForm.svelte` Popover import wiring, Implementation Checklist step 2): No existing consumer of `$lib/components/ui/popover` exists anywhere in this codebase (confirmed via repo-wide grep) — do not spend time searching for one; the step 2 instruction to "grep for an existing consumer" will find nothing. Import directly per the confirmed `index.ts` barrel exports: `Popover` (aliased `Root`), `PopoverTrigger`, `PopoverContent`, `PopoverPortal`. `Popover` (`Root`) accepts `bind:open` (bits-ui `RootProps`, confirmed in `popover.svelte`); `PopoverTrigger` renders as an unstyled bits-ui trigger (wrap the existing `Button` component as its child, the standard bits-ui trigger+child-button composition pattern); `PopoverContent` accepts `sideOffset`, `align`, and `class` and renders inside a `PopoverPortal` automatically (confirmed in `popover-content.svelte`).

Backlog artifacts to create during durable capture (optional, non-blocking):
- `popover-a11y-audit_NOTE_01-07-26.md` in `process/features/leads/backlog/` — tracks the deferred manual keyboard/focus a11y audit for the Templates popover (Known-Gap-1).

Known gaps on record:
- Known-Gap-1: Popover keyboard/focus a11y — accepted, rationale above. Accepted by: session (validate-agent) — low-risk internal UI, consistent with repo-wide a11y test tooling absence.
- Component-test harness absence for Popover UI (pre-existing, plan-documented) — accepted, rationale above.

Gate: CONDITIONAL (0 FAILs, 2 CONCERNs — both resolved via Execute-Agent Instructions E1/E2 above; 2 known-gaps accepted and documented; no unresolved architectural or design problems — proceed to EXECUTE with E1/E2 and the known-gaps on record)
Accepted by: session (validate-agent, autonomous acceptance of minor Layer-2 mechanical-feasibility concerns fully resolved via inline execute-agent instructions, plus the two low-risk, pre-existing/repo-consistent known-gaps documented above — no user input was required to escalate this back to PLAN since neither concern indicates a design flaw)

## Post-EXECUTE Closeout (UPDATE PROCESS, 01-07-26)

- Both Fully-Automated gates confirmed green: `bun run test:unit -- src/tests/templates.spec.ts` (5/5), `bun run check` (0 errors).
- AC-3/AC-4 (previously Agent-Probe open gap) confirmed via user manual walkthrough on 01-07-26 — see updated Acceptance Criteria and Test gates table above.
- Remaining accepted known-gaps (NOT resolved by this closeout, still on record for future work):
  - Known-Gap-1: Popover keyboard/focus a11y (tab order, focus trap, focus return on close/Escape) — untested. Tracked at `process/features/leads/backlog/popover-a11y-audit_NOTE_01-07-26.md`.
  - No component-test harness exists for `LogTouchForm.svelte` / Popover interactions — pre-existing repo-wide gap, not introduced by this plan.
- Classification: Ready for UPDATE PROCESS archival.

## Autonomous Goal Block

SESSION GOAL: Add a static snippet-template picker (Intro/Follow-up/Pricing) to the Log Touch form on the lead detail page, with `{{page}}`/`{{event}}` auto-fill, paste-only (no auto-submit).
Charter + umbrella plan: N/A — single plan (no phase program; no umbrella `## Stable Program Goal` exists for this work)
Autonomy: No standing /goal is active for this plan. Standard RIPER-5 interactive gates apply: EXECUTE requires an explicit "ENTER EXECUTE MODE" command after this VALIDATE gate. CONDITIONAL concerns above are already resolved via Execute-Agent Instructions E1/E2 — execute-agent should apply them directly without re-litigating.
Hard stop conditions / safety constraints:
- Do not call `submit()` / `onSubmit` from the template-selection handler — selecting a snippet must only populate `note`, never create an activity row or fire a network request.
- Do not modify `activityFormSchema` / `logTouchSchema` or any Zod-validated submit payload shape.
- Do not add a DB table, API route, or persistence layer for templates — static in-file data only per Scope.
Next phase: EXECUTE: process/features/leads/active/touch-log-templates_01-07-26/touch-log-templates_PLAN_01-07-26.md
Validate contract: inline in plan (see `## Validate Contract` section above)
Execute start: fully-auto commands: `bun run test:unit -- src/tests/templates.spec.ts` + `bun run check` | agent-probe scenario: AC-3/AC-4 walkthrough of `/leads/[id]` Templates popover | high-risk pack: no
