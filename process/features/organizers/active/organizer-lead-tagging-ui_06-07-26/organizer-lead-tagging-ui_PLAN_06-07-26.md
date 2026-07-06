---
name: plan:organizer-lead-tagging-ui
description: "SIMPLE plan — add an Organizer tag/change/clear control to the lead detail page, reusing PATCH /api/leads/[id]/organizer and mirroring ReassignModal exactly"
date: 06-07-26
feature: organizers
---

# PLAN — Tag Lead to Organizer (Lead Detail UI)

**Date**: 06-07-26
**Status**: Ready for EXECUTE (VALIDATE complete — see Validate Contract)
**Complexity**: SIMPLE (INNOVATE skipped per SPEC — mechanical reuse of an existing pattern and endpoint, no new backend work, no design decisions left open).

Source SPEC: `process/features/organizers/active/organizer-lead-tagging-ui_06-07-26/organizer-lead-tagging-ui_SPEC_06-07-26.md`

## PLAN-Time Verification (resolves SPEC's Open Question)

Read the actual code (`src/lib/server/db/leads.ts`, `src/routes/leads/[id]/+page.server.ts`):

- `dbRowToLead` (leads.ts:52-128) does **NOT** map `organizerId` or resolve `organizerName` today — despite the `Lead` type (`src/lib/types/index.ts:141-142`) already declaring both fields. `enrichWithOwnerNames` (leads.ts:1558-1580) only resolves owner names, not organizer names.
- `+page.server.ts` load function currently loads zero organizer data (no organizer list, no organizer name resolution).
- **Resolution:** this work must (a) add `organizerId: row.organizerId` to `dbRowToLead`, and (b) resolve `organizerName` for the single lead being loaded via a direct `getOrganizer(lead.organizerId)` call in `+page.server.ts` (not a new `enrichWithOrganizerNames` batch helper — this page loads exactly one lead, so batch enrichment is unnecessary complexity per YAGNI), and (c) load the full organizer list via `listOrganizersWithLeadCount()` for the picker.

## Overview

Add a "Organizer" row to the lead detail page's "Lead & event" info-card grid, with a tag/change/clear affordance that opens a plain button-list picker (mirroring `ReassignModal.svelte` exactly), calling the existing `PATCH /api/leads/[id]/organizer` endpoint with optimistic update + rollback-on-failure + toast + `invalidateAll()`.

## Goals

- Sales rep can tag, retag, and untag a lead's organizer from the lead detail page.
- Zero backend changes — reuse `PATCH /api/leads/[id]/organizer` exactly as-is.
- Zero new interaction pattern — mirror `ReassignModal.svelte` structurally (new sibling component, not a modification of `ReassignModal` itself, since it is owner-specific).

## Scope

In scope: new `OrganizerTagModal.svelte` component, new small pure helper (`organizer-tag.ts`), new "Organizer" info-card row + button, `+page.server.ts` load additions, `+page.svelte` state/handler additions, unit tests for the new helper and handler logic.

Out of scope (per SPEC): organizer creation, searchable/combobox picker, changes to `PATCH /api/leads/[id]/organizer` or its schema, changes to Organizers listing/detail pages, bulk tagging, schema/migration changes.

## Acceptance Criteria

Mirrors SPEC's 8 acceptance criteria verbatim (all testable outcomes; see Verification Evidence below for the gate that proves each):

1. A sales rep can tag a lead that currently has no organizer to an existing organizer, and the lead detail page then shows that organizer's name.
2. A sales rep can change a lead's tagged organizer to a different existing organizer, and the displayed value updates to the new organizer.
3. A sales rep can clear (untag) an organizer from a lead, and the lead detail page then shows the "not tagged" state.
4. The organizer picker only shows existing organizers as a plain selectable list — there is no way to create a new organizer from this UI.
5. The picker is a plain button-list (no search/filter/combobox input), consistent with the existing Reassign Owner picker pattern on the same page.
6. If the save (PATCH) fails, the lead detail page reverts to showing the organizer value it had before the attempted change, and an error message is shown.
7. After a successful tag or untag, the change is reflected in the lead's history/audit trail the same way other field changes are (reuses the already-tested backend behavior — no new test needed beyond confirming the UI calls the endpoint correctly).
8. The organizer field/picker is placed as its own visible row in the lead detail page's info-card area (not hidden inside the separate onboarding edit form).

## Implementation Checklist

1. **`src/lib/server/db/leads.ts`** — In `dbRowToLead` (after line 92, alongside `ownerId: row.ownerId`), add:
   ```
   organizerId: row.organizerId,
   ```
   (Field already exists on `DbLead`/`crmLeads` schema per `schema.ts:182`; `Lead` type already declares `organizerId: string | null` at `src/lib/types/index.ts:141`.) No other change to this function. **Confirmed at VALIDATE:** line 92 is exactly `ownerId: row.ownerId,` — anchor is precise.

2. **`src/routes/leads/[id]/+page.server.ts`** — Add two imports and two load additions:
   - Import `getOrganizer` from `$lib/server/db/organizers` and `listOrganizersWithLeadCount` from the same module.
   - Add `listOrganizersWithLeadCount()` as a 4th entry to the EXISTING first `Promise.all` (the one that currently loads `lead, users, templates`): `const [lead, users, templates, organizers] = await Promise.all([getLead(...), listUsers(), listTemplates(), listOrganizersWithLeadCount()]);` — this call has no dependency on `lead`, so it is safe to run concurrently.
   - **[VALIDATE fix — P1]** The organizer-name resolution CANNOT be an entry inside that same `Promise.all` (it depends on `lead.organizerId`, which is only known after the array resolves). Place it AFTER the existing `if (!lead) throw error(404, 'Lead not found');` guard: `const organizer = lead.organizerId ? await getOrganizer(lead.organizerId) : null; lead.organizerName = organizer?.name;` (direct mutation of the returned `Lead` object before it is returned from `load` — there is no existing precedent for this exact pattern in this file, but it is type-safe since `organizerName` is declared optional on `Lead`).
   - Return `organizers` alongside the existing return fields (`{ lead, activities, meetings, leadHistory, me, users, templates, organizers }`).

3. **New file: `src/lib/components/leads/organizer-tag.ts`** — **[VALIDATE fix — P2]** Small pure helper extracted so the tag/retag/clear decision logic is unit-testable without a component-render harness (this repo has none — see Verification Evidence). Exports:
   ```ts
   import type { OrganizerWithCount } from '$lib/server/db/organizers';

   export function buildOrganizerTagPatch(
       organizerId: string | null,
       organizers: OrganizerWithCount[]
   ): {
       body: { organizerId: string | null };
       optimisticPatch: { organizerId: string | null; organizerName: string | undefined };
   } {
       const tagged = organizerId ? organizers.find((o) => o.id === organizerId) : undefined;
       return {
           body: { organizerId },
           optimisticPatch: { organizerId, organizerName: tagged?.name }
       };
   }
   ```
   This does NOT change the async fetch/rollback/toast wiring pattern mirrored from `confirmReassign` — only the "what to send + what to optimistically show" decision is extracted into a plain function so it can be unit-tested (see AC1/AC2/AC3 Vitest rows in Verification Evidence).

4. **New file: `src/lib/components/leads/OrganizerTagModal.svelte`** — New sibling component to `ReassignModal.svelte`, same structure:
   - Props: `{ open: boolean; organizers: OrganizerWithCount[]; currentOrganizerId?: string | null; onclose: () => void; onconfirm: (organizerId: string | null) => void }` (note the `string | null` param — `ReassignModal`'s `onconfirm` only takes `string` since owner can't be cleared; this component's `onconfirm` must accept `null` for the "Clear tag" case).
   - `$state` `selected` synced from `currentOrganizerId` via `$effect` on `open`, exactly like `ReassignModal.svelte:21-27`.
   - Body: `Modal` wrapper (same `width={420}` convention), plain `<div class="flex flex-col gap-1.5">` of `<Button variant="outline">` rows — one per organizer in the `organizers` prop, each showing `org.name` (mirror `ReassignModal.svelte:41-53` layout minus the `Avatar`/role column — organizers have no avatar/role concept; show `org.location` as the trailing meta text instead of `role`, or omit the trailing span if `location` is null).
   - If `organizers.length === 0`: render an empty-state message inside the scroll area instead of the button list (per SPEC: "picker shows an empty state, not an error").
   - **"Clear tag" option**: only rendered when `currentOrganizerId` is truthy — a distinct `<Button variant="outline">` row (e.g. "Clear tag — no organizer") that calls `onconfirm(null)` directly, placed above or below the organizer list (place above, so it's always the first, most-discoverable action when present).
   - Footer: `Cancel` (outline) + confirm button, `disabled={!selected}` for the organizer-selection path — but the "Clear tag" row bypasses the footer confirm button entirely (clicking it calls `onconfirm(null)` immediately, same single-click-to-confirm pattern already used for stage transitions elsewhere on this page — do NOT require a second "confirm" click for clearing).
   - No search/filter input anywhere in the component (locks SPEC AC5).
   - No "create new organizer" affordance anywhere in the component (locks SPEC AC4).

5. **`src/routes/leads/[id]/+page.svelte`** — Additions mirroring the Reassign pattern exactly:
   - Import `OrganizerTagModal` from `$lib/components/leads/OrganizerTagModal.svelte`.
   - Import `buildOrganizerTagPatch` from `$lib/components/leads/organizer-tag.ts`. **[VALIDATE fix — P2]**
   - Add `let organizerTagOpen = $state(false);` near `let reassignOpen = $state(false);` (line ~155).
   - Add `confirmOrganizerTag` handler, placed directly after `confirmReassign` (after line 378), structurally identical to `confirmReassign` but delegating the decision logic to `buildOrganizerTagPatch`:
     ```
     async function confirmOrganizerTag(organizerId: string | null) {
         if (mutating) return;
         mutating = true;
         organizerTagOpen = false;
         const snapshot = lead;
         const { body, optimisticPatch } = buildOrganizerTagPatch(organizerId, data.organizers);
         lead = patchRecord(lead, optimisticPatch);
         try {
             const res = await fetch(`/api/leads/${lead.id}/organizer`, {
                 method: 'PATCH',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(body)
             });
             if (!res.ok) {
                 const msg = await res.text().catch(() => 'Server error');
                 lead = snapshot;
                 toasts.push(`Organizer tag failed: ${msg}`);
                 return;
             }
         } catch {
             lead = snapshot;
             toasts.push('Organizer tag failed — server error');
             return;
         } finally {
             mutating = false;
         }
         await invalidateAll();
         toasts.success(organizerId ? 'Lead tagged to organizer' : 'Organizer tag cleared');
     }
     ```
   - Add a new "Organizer" row to the "Lead & event" info-card grid (inside the `{#each fields as f}` block's containing div, `+page.svelte:790-818`) — **NOT** added as another entry in the `fields` array (that array renders plain read-only text; the Organizer row needs an interactive button). Instead, add a dedicated `<div>` block immediately after the `{#each fields as f (f.label)}{/each}` loop closes (after line 816, before the grid's closing `</div>` at line 817) inside the same `grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2` container, so it lays out as one more grid cell. **Confirmed at VALIDATE:** line 816 is exactly `{/each}` and line 817 is exactly the grid's closing `</div>` — anchor is precise.
     ```
     <div>
         <div class="mb-0.5 text-[11px] text-ink-300">Organizer</div>
         <div class="flex items-center gap-2">
             <span class="font-mono text-[13px] text-ink">{lead.organizerName ?? 'Not tagged'}</span>
             <button
                 type="button"
                 class="font-mono text-[11px] text-blue-600 underline hover:text-blue-800"
                 onclick={() => (organizerTagOpen = true)}
             >
                 {lead.organizerId ? 'Change' : 'Tag'}
             </button>
         </div>
     </div>
     ```
   - Add the modal render block alongside the existing `{#if reassignOpen}...{/if}` block (after line 982):
     ```
     {#if organizerTagOpen}
         <OrganizerTagModal
             open={true}
             organizers={data.organizers}
             currentOrganizerId={lead.organizerId}
             onclose={() => (organizerTagOpen = false)}
             onconfirm={confirmOrganizerTag}
         />
     {/if}
     ```

6. **`src/lib/utils/optimistic.ts`** — Read `patchRecord`'s signature before wiring step 5; **confirmed at VALIDATE**: `patchRecord<T>(record: T, patch: Partial<T>): T` is already fully generic — no change needed.

## Phase Completion Rules

This is a SIMPLE single-plan task (no phase program). Completion is binary:

- **CODE DONE**: all 6 checklist items implemented, `bun run check` passes, all Fully-Automated Vitest gates in Verification Evidence are green.
- **VERIFIED**: CODE DONE, plus the Agent-Probe code-review gates (AC4/AC5/AC8) explicitly confirmed during EXECUTE/EVL, plus this plan's Validate Contract gate is `PASS` or an accepted `CONDITIONAL`.
- Do not mark this plan `✅ VERIFIED` on code-completion alone — the code-review gates and the validate-contract gate must both be explicitly recorded first.
- The Playwright e2e known-gap (AC1-AC3 manual layer) does NOT block VERIFIED — it is pre-accepted per SPEC and Test Infra Improvement Notes. The AC6 rollback-wiring known-gap (see Verification Evidence + backlog note) likewise does NOT block VERIFIED — it is an accepted, documented residual.

## Public Contracts

- No new API routes, no changes to `PATCH /api/leads/[id]/organizer` or `organizerTagSchema` (locked by SPEC constraint).
- `Lead` type: no shape change (fields already exist) — only a change in what `dbRowToLead`/the load function actually populate at runtime.
- New component prop contract: `OrganizerTagModal` (new file) — internal to `src/lib/components/leads/`, not exported/consumed outside this page.
- New pure-helper contract: `buildOrganizerTagPatch` (new file, `organizer-tag.ts`) — internal to `src/lib/components/leads/`, not exported/consumed outside this page/its test file.
- `+page.server.ts` load return shape gains one new key: `organizers: OrganizerWithCount[]`.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/leads.ts` | Add `organizerId` mapping to `dbRowToLead` (1 line) |
| `src/routes/leads/[id]/+page.server.ts` | Add organizer name resolution + organizer list load (imports + ~5 lines, see P1 fix) |
| `src/lib/components/leads/organizer-tag.ts` | New file (~15 lines) — pure `buildOrganizerTagPatch` helper (P2 fix) |
| `src/lib/components/leads/OrganizerTagModal.svelte` | New file (~60-70 lines, mirrors `ReassignModal.svelte`) |
| `src/routes/leads/[id]/+page.svelte` | Add state, handler, info-card row, modal render block (~40 lines total) |
| `src/lib/utils/optimistic.ts` | Read-only check — confirmed generic, no change needed |
| `src/tests/organizer-tag.spec.ts` (new) | Unit tests for `buildOrganizerTagPatch` (see Verification Evidence) |
| `src/tests/leads-db.spec.ts` (extended) | Unit test for `dbRowToLead`'s new `organizerId` mapping |

## Blast Radius

- 1 package (`veent-crm` — single SvelteKit app, no monorepo boundary).
- 4 existing files touched (1-line, ~5-line, ~40-line, read-only-check), 2 new component/helper files, 2 new/extended test files.
- Risk class: **none of the high-risk classes apply** — no schema/migration, no auth change, no billing, no new public API, no destructive write (the endpoint being reused already has its own transaction + audit trail, unchanged here).
- No new dependency, no new runtime surface.

## Verification Evidence

Test-infra reality check (via `process/context/tests/all-tests.md`; confirmed at VALIDATE via `package.json` — no `@testing-library/svelte` dependency present): this repo has **no component-rendering test harness** — only Vitest (pure logic/schema/DB-mapper tests) and Playwright (e2e, currently self-skipping on all protected routes per the repo-wide missing auth-fixture known-gap). SPEC's AC4/AC5/AC8 framed these as "Fully-Automated component-level test/code-review check" — reframed below to match actual available infra: these become **code-review checks performed during EXECUTE/EVL** (not an automated component-render test), which is an Agent-Probe-equivalent judgment applied to the diff itself, not a runtime test. This is called out explicitly in Test Infra Improvement Notes below.

**[VALIDATE fix]** SPEC's AC1/AC2/AC3/AC6 originally proposed testing `confirmOrganizerTag` directly. That function is a non-exported handler defined inside `+page.svelte`'s `<script>` block, which is not importable/testable by Vitest without a component-render harness (confirmed: the existing precedent `confirmReassign` has ZERO test coverage today — `src/tests/optimistic.spec.ts` only tests the generic `patchRecord`/`removeFromList` helpers, never the `.svelte`-embedded handler). Resolution (per Implementation Checklist items 3 and 5): the tag/retag/clear **decision logic** (what body to send, what to optimistically show) is extracted into a plain, exported, unit-testable function (`buildOrganizerTagPatch`) — this covers AC1/AC2/AC3. The fetch-failure **rollback wiring** itself (AC6) remains inside the untestable inline handler and is reclassified to Known-Gap, in parity with the pre-existing `confirmReassign` rollback path (not a new gap introduced by this work) — see backlog note.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest: `dbRowToLead` maps `organizerId` from a `DbLead` row (add to existing `leads-db.spec.ts`-style pure-mapper test, no DB needed) | Fully-Automated | Prerequisite for AC1-AC3 (name resolution depends on `organizerId` reaching the `Lead` object) |
| Vitest: `buildOrganizerTagPatch(organizerId, organizers)` — tag path: given no current organizer and a target organizer id, returns `{ body: { organizerId: <id> }, optimisticPatch: { organizerId: <id>, organizerName: <target.name> } }` | Fully-Automated | AC1 |
| Vitest: `buildOrganizerTagPatch`, retag path — given a different target organizer id than the one currently tagged, returns the NEW id in both `body` and `optimisticPatch` (not the previous one) | Fully-Automated | AC2 |
| Vitest: `buildOrganizerTagPatch`, clear path — called with `organizerId: null`, returns `{ body: { organizerId: null }, optimisticPatch: { organizerId: null, organizerName: undefined } }` | Fully-Automated | AC3 |
| Code review at EXECUTE/EVL: `OrganizerTagModal.svelte` renders only from the `organizers` prop list, contains no create/add-new affordance | Agent-Probe (code-review, no component-render harness available) | AC4 |
| Code review at EXECUTE/EVL: `OrganizerTagModal.svelte` contains no `<input>`/search/combobox element | Agent-Probe (code-review) | AC5 |
| Pre-existing (unchanged): `PATCH /api/leads/[id]/organizer` writes `crm_lead_history` row with `field: 'organizer_id'` in a transaction | Fully-Automated (already covered by existing route tests — not re-tested here per SPEC AC7, "no new test needed beyond confirming the UI calls the existing endpoint correctly", which the AC1-AC3 helper tests above already do) | AC7 |
| Code review at EXECUTE/EVL: new "Organizer" row renders inside the "Lead & event" info-card grid, independent of the onboarding form's `editingOnboarding` state | Agent-Probe (code-review) | AC8 |
| `confirmOrganizerTag`'s fetch-failure rollback wiring (lead reverts to snapshot, toast shown) | Known-Gap — no component-render harness to drive the inline handler; parity with the equally-untested pre-existing `confirmReassign` rollback path (not a new gap). See `process/features/organizers/backlog/organizer-tag-rollback-test-gap_NOTE_06-07-26.md` for the backlog test-building stub (resolution option D) | AC6 |
| Playwright click-through: tag/retag/clear flow end-to-end on the real page | Known-Gap (pre-accepted — blocked by repo-wide missing Playwright auth-fixture; same pattern as `organizer-listing-detail_06-07-26`) | AC1, AC2, AC3 (manual/e2e layer only — the `buildOrganizerTagPatch` unit tests above already prove the decision logic) |

### Failing stubs (TDD red-first — Fully-Automated rows only)

```
test("should build patch for tag path (no current organizer -> target organizer)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildOrganizerTagPatch tag path")
})

test("should build patch for retag path (current organizer A -> target organizer B, uses B's id)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildOrganizerTagPatch retag path")
})

test("should build patch for clear path (organizerId: null)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: buildOrganizerTagPatch clear path")
})

test("should map organizerId from a DbLead row in dbRowToLead", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: dbRowToLead organizerId mapping")
})
```

## Test Procedure

1. `bun run check` — must pass with zero errors before any test gate is considered meaningful.
2. `bun run test:unit -- src/tests/organizer-tag.spec.ts src/tests/leads-db.spec.ts` — all Fully-Automated Vitest rows above must be green.
3. Manual code-review pass on the diff for `OrganizerTagModal.svelte` and the info-card row addition — confirm the three Agent-Probe rows (AC4, AC5, AC8) explicitly.
4. Record the Playwright known-gap and the AC6 rollback-wiring known-gap explicitly in the phase report — do not silently skip either.

## Test Infra Improvement Notes

- This repo has no component-rendering test harness (`@testing-library/svelte` not installed — confirmed absent from `package.json` at VALIDATE). SPEC's AC4/AC5/AC8 assumed "component-level test" was available as a Fully-Automated tier; in practice these are code-review checks during EXECUTE/EVL, not executable tests. The same gap also blocks a true automated test of AC6's rollback wiring (see backlog note). If a future feature needs true component-render assertions, adding `@testing-library/svelte` + `@testing-library/jest-dom` (or an equivalent Vitest-Svelte adapter) would let all of these become real Fully-Automated tests instead of Agent-Probe code review / Known-Gap. Not proposed as in-scope work here (YAGNI — one feature's need doesn't justify adding new test infra now).
- e2e coverage for this flow is blocked by the same repo-wide missing Playwright auth-fixture gap tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — no new gap introduced, just another instance of the existing one.
- AC6's rollback-wiring test gap is tracked at `process/features/organizers/backlog/organizer-tag-rollback-test-gap_NOTE_06-07-26.md` — parity with the pre-existing, equally-untested `confirmReassign` rollback path, not a new gap introduced by this work.

## Dependencies

- No new npm/bun packages.
- Depends on `listOrganizersWithLeadCount()` and `getOrganizer()` already existing in `src/lib/server/db/organizers.ts` (confirmed present — #189/#190 work).
- Depends on `PATCH /api/leads/[id]/organizer` already existing and tested (confirmed present, `src/routes/api/leads/[id]/organizer/+server.ts`).

## Risks

| Risk | Mitigation |
|---|---|
| `patchRecord` util might be narrowly typed and reject `{ organizerId, organizerName }` | Checklist item 6 — verified at VALIDATE: already fully generic, no change needed |
| Info-card grid row placement might visually crowd the 2-column grid on narrow viewports | New row uses the same `<div>` shape as existing field cells — inherits the existing `sm:grid-cols-2` responsive behavior, no new CSS needed |
| Forgetting to add `organizers` to the load return breaks the picker silently (empty list, not an error) | Explicit checklist step 2 + code-review gate (AC4/AC8 row) checks the load function |
| Organizer-name resolution mistakenly written as a `Promise.all` entry depending on `lead` (invalid — `lead` isn't resolved yet inside that same array) | Checklist item 2 (P1 fix) spells out the correct placement: after the `Promise.all` resolves and after the `if (!lead) throw error(404...)` guard |

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/organizers/active/organizer-lead-tagging-ui_06-07-26/organizer-lead-tagging-ui_PLAN_06-07-26.md` (this file)
2. **Last completed phase or step:** VALIDATE — plan validated, validate-contract written below (Gate: CONDITIONAL — see backlog note for the one accepted residual)
3. **Validate-contract status:** written (06-07-26), `generated-by: outer-pvl`
4. **Supporting context files loaded:** SPEC (this task folder), `process/context/all-context.md`, `process/context/tests/all-tests.md`, `src/routes/leads/[id]/+page.svelte`, `src/routes/leads/[id]/+page.server.ts`, `src/lib/server/db/leads.ts`, `src/lib/server/db/organizers.ts`, `src/lib/components/leads/ReassignModal.svelte`, `src/routes/api/leads/[id]/organizer/+server.ts`, `src/lib/zod/schemas.ts`, `src/lib/types/index.ts`, `src/lib/server/db/schema.ts`, `src/lib/utils/optimistic.ts`, `src/tests/optimistic.spec.ts`, `src/tests/leads.spec.ts`, `package.json`
5. **Next step for a fresh agent:** Run EXECUTE (`ENTER EXECUTE MODE`) against this plan. Follow Implementation Checklist items 1-6 in order (item 3, the new `organizer-tag.ts` helper, must exist before item 5 wires `+page.svelte` to it). Confirm the two accepted Known-Gaps (Playwright e2e, AC6 rollback-wiring test) are recorded in the phase report, not silently dropped.

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 1/7 (S7 — 4+ existing files touched is borderline; no multi-package scope, no schema/API/auth surface, no phase-program classification, no user-requested depth, no high-risk class, and the plan is a single SIMPLE task with no independent parallel directions). Sequential dimension checks (Layer 1) plus 2 Layer 2 section checks (Data layer, UI layer) were run as a single-agent pass — no fan-out warranted.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1-prereq | `dbRowToLead` maps `organizerId` from DB row | Fully-Automated | `bun run test:unit -- src/tests/leads-db.spec.ts` (new case) | A |
| AC1 | Tag path: no organizer -> target organizer, correct PATCH body + optimistic patch | Fully-Automated | `bun run test:unit -- src/tests/organizer-tag.spec.ts` (new file, tests `buildOrganizerTagPatch`) | A |
| AC2 | Retag path: current organizer A -> target B, uses B's id not A's | Fully-Automated | `bun run test:unit -- src/tests/organizer-tag.spec.ts` | A |
| AC3 | Clear path: `organizerId: null` produces null body + cleared optimistic name | Fully-Automated | `bun run test:unit -- src/tests/organizer-tag.spec.ts` | A |
| AC4 | Picker shows only existing organizers, no create-new affordance | Agent-Probe | Manual code-review of `OrganizerTagModal.svelte` diff at EXECUTE/EVL | B |
| AC5 | Picker has no search/filter/combobox input | Agent-Probe | Manual code-review of `OrganizerTagModal.svelte` diff at EXECUTE/EVL | B |
| AC6 | Fetch-failure rollback (lead reverts, error toast shown) | Known-Gap | — (no component-render harness; see backlog note) | D |
| AC7 | Audit trail row written on tag/untag | Fully-Automated | Pre-existing route test coverage for `PATCH /api/leads/[id]/organizer` (unchanged) + AC1-3 handler tests confirm the UI calls the endpoint correctly | A |
| AC8 | Organizer row renders in info-card grid, independent of onboarding form state | Agent-Probe | Manual code-review of `+page.svelte` diff at EXECUTE/EVL | B |
| AC1-3 (e2e layer) | End-to-end click-through of tag/retag/clear on the real page | Known-Gap | — (blocked by repo-wide missing Playwright auth-fixture; pre-accepted, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle, at EXECUTE)
- B — fixed in this plan (gate added by this plan's checklist — code-review step is part of Test Procedure)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- Data layer (leads.ts, +page.server.ts): Fully-automated: `bun run test:unit -- src/tests/leads-db.spec.ts` | agent-probe: n/a | known-gap: n/a
- Helper logic (organizer-tag.ts): Fully-automated: `bun run test:unit -- src/tests/organizer-tag.spec.ts`
- UI component (OrganizerTagModal.svelte, +page.svelte info-card row): agent-probe: code-review at EXECUTE/EVL for AC4/AC5/AC8 | known-gap: documented (AC6 rollback wiring — see backlog note; Playwright e2e — pre-existing repo-wide gap)

Dimension findings:
- Infra fit: PASS — single SvelteKit app, no container/infra/port surface, no new runtime surface, no new dependency. `+page.server.ts` load additions confirmed to sit behind the existing `if (!locals.user) throw error(401)` gate.
- Test coverage: CONCERN (resolved via Plan Update, gate remains CONDITIONAL for the named residual) — original plan proposed testing a non-exported `.svelte`-embedded handler directly, which is not executable in this repo's Vitest setup (confirmed: no `@testing-library/svelte`, and the precedent `confirmReassign` has zero existing test coverage of its own logic). Fix applied: extracted `buildOrganizerTagPatch` pure helper (Implementation Checklist item 3) covering AC1/AC2/AC3 as genuinely Fully-Automated. AC6's fetch-failure rollback wiring remains a named Known-Gap (parity with `confirmReassign`, not a new gap) — see backlog note. Per the net-gate vacuous-green rule, this residual keeps the gate at CONDITIONAL rather than PASS.
- Breaking changes: PASS — no changes to `PATCH /api/leads/[id]/organizer` or its Zod schema; `Lead` type shape unchanged (fields already declared, only runtime population changes); `+page.server.ts` load return gains one additive key (`organizers`); new component/helper files are internal, not consumed elsewhere.
- Security surface: PASS — no auth/session/secret/trust-boundary changes; reused endpoint already auth-gated (401/404/422 checks unchanged); new load additions execute after the existing session check.
- Section A feasibility (Data layer — leads.ts, +page.server.ts): PASS after fix — mechanical feasibility confirmed exact (line 92 `ownerId: row.ownerId,` anchor verified byte-for-byte; `getOrganizer`/`listOrganizersWithLeadCount` signatures confirmed in `organizers.ts`). Gap found: original wording implied the organizer-name resolution ran inside the same `Promise.all` as `lead` — technically impossible since it depends on `lead`'s resolved value. Fixed via Plan Update P1 (checklist item 2 now specifies correct placement after the guard). No conflicts with repo conventions.
- Section B feasibility (UI layer — organizer-tag.ts, OrganizerTagModal.svelte, +page.svelte): CONCERN, addressed via Plan Update P2 — `OrganizerTagModal.svelte` design confirmed to genuinely mirror `ReassignModal.svelte` (same `Modal` `width={420}`, same `$effect`-synced `selected` state, same outline-button-list body, same disabled-until-selected footer pattern; differences — no Avatar/role column, `location` trailing text instead, added "Clear tag" row — are justified by organizers lacking an avatar/role concept and by SPEC's explicit clear/untag requirement). Gap found: Verification Evidence's Fully-Automated Vitest rows for AC1/AC2/AC3/AC6 were not actually executable against the literal inline `.svelte` handler described in the original checklist item 4 (`confirmOrganizerTag`). Fixed by extracting `buildOrganizerTagPatch` (covers AC1-3); AC6 reclassified to Known-Gap with backlog stub. Highest-risk edit: the `+page.svelte` info-card row insertion point — confirmed exact (`{/each}` at line 816, grid-closing `</div>` at line 817) — mitigation: none needed beyond the confirmed anchor, execute-agent should re-confirm line numbers haven't drifted before editing (standard practice) since intervening unrelated edits could shift them slightly.

Open gaps:
- AC6 (fetch-failure rollback wiring): known-gap — no component-render harness exists in this repo to drive the inline `.svelte` handler; parity with the pre-existing, equally-untested `confirmReassign` rollback path. Backlog test-building stub: `process/features/organizers/backlog/organizer-tag-rollback-test-gap_NOTE_06-07-26.md`.
- AC1-AC3 e2e/manual click-through layer: known-gap — pre-accepted, blocked by the repo-wide missing Playwright auth-fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Not a new gap introduced by this plan.

What this coverage does NOT prove:
- The `buildOrganizerTagPatch` unit tests prove the CORRECT DATA is computed for tag/retag/clear — they do NOT prove the UI actually renders the updated value, that the fetch is actually issued with that body over the network, or that a real user can click through the flow (that layer is the Known-Gap above).
- The Agent-Probe code-review rows (AC4/AC5/AC8) prove the code AS WRITTEN matches the described shape — they do NOT prove runtime rendering behavior (e.g. that Svelte actually renders the empty-state message correctly when `organizers.length === 0`, or that the "Clear tag" row visually appears only when expected) since there is no component-render test to execute this.
- The pre-existing `PATCH /api/leads/[id]/organizer` route tests (AC7) prove the ENDPOINT's transaction/audit-trail behavior — they do NOT prove the new UI code correctly triggers that endpoint at runtime (only the extracted helper's body-shape output is proven; the actual `fetch()` call site inside `+page.svelte` is not directly exercised by any automated test).
(Required until C3 is implemented — temporary C3 mitigation)

Gate: CONDITIONAL (0 FAILs; 1 accepted residual concern — AC6 rollback-wiring test gap, named, justified, backlog stub written; all other CONCERNs fixed via Plan Updates P1/P2 applied above)
Accepted by: session (VALIDATE agent, first-pass CONDITIONAL — accepted concern: "AC6 fetch-failure rollback wiring has no automated test coverage; parity with pre-existing untested `confirmReassign` path; tracked via backlog note `organizer-tag-rollback-test-gap_NOTE_06-07-26.md`")

## Deviations (recorded at EXECUTE, 06-07-26)

1. **Added `organizerId: string | null` + `organizerName?: string` to the `Lead` interface (`src/lib/types/index.ts`).**
   - **What deviated:** The plan (PLAN-Time Verification + Checklist item 1) asserted the `Lead` type already declared `organizerId`/`organizerName` at `src/lib/types/index.ts:141-142`. On inspection at EXECUTE, lines 141-142 belong to the `Meeting` interface (starts line 136), NOT `Lead` (interface spans 49-118). The `Lead` interface did not declare either field.
   - **Why:** Without these fields the plan's own specified edits — `dbRowToLead` returning `organizerId`, `lead.organizerName = organizer?.name` in `+page.server.ts`, and `lead.organizerId`/`lead.organizerName` reads in `+page.svelte` — would not typecheck (`bun run check` would fail). The change is required to implement the plan as intended.
   - **Impact:** Type-only, additive. Mirrors the existing `ownerId: string | null` / `ownerName?: string` pattern. The `organizerId` column already exists on `crm_leads` (no schema/migration change). All `Lead` constructors go through `dbRowToLead` (now supplies `organizerId`) or `as Lead` casts, so no existing fixture/test broke. `bun run check` = 0 errors; full `test:unit` = 350 passed / 129 skipped / 0 failures.
   - **Class:** within-blast-radius (Lead data-layer type), not a hard-stop class (no auth/billing/schema-migration/public-API/container change). `src/lib/types/index.ts` was not in the plan's Touchpoints table but is squarely within the semantic data-layer blast radius the plan already touches (`leads.ts`, `+page.server.ts`).

## Autonomous Goal Block

SESSION GOAL: Ship the lead-detail "Organizer" tag/change/clear control (organizer-lead-tagging-ui_06-07-26), reusing PATCH /api/leads/[id]/organizer and mirroring ReassignModal.svelte exactly.
Charter + umbrella plan: N/A — single SIMPLE plan, no phase program, no umbrella governs this task.
Autonomy: Standard RIPER-5 autonomy rules apply (process/development-protocols/orchestration.md). VALIDATE is complete (Gate: CONDITIONAL, one named/accepted residual). EXECUTE requires explicit "ENTER EXECUTE MODE" — no standing execute consent implied by this block.
Hard stop conditions / safety constraints:
- No changes to PATCH /api/leads/[id]/organizer, its Zod schema, or its response codes (locked by SPEC).
- No schema/migration changes (organizerId already exists on crm_leads).
- No searchable/combobox picker — plain button-list only (locks SPEC AC5).
- No "create new organizer" affordance anywhere in this UI (locks SPEC AC4).
- If bun run check fails or any Fully-Automated Vitest gate goes red, treat as EXECUTE-blocking — do not mark CODE DONE.
Next phase: EXECUTE — process/features/organizers/active/organizer-lead-tagging-ui_06-07-26/organizer-lead-tagging-ui_PLAN_06-07-26.md
Validate contract: inline in plan (see "## Validate Contract" section above)
Execute start: bun run check && bun run test:unit -- src/tests/organizer-tag.spec.ts src/tests/leads-db.spec.ts | e2e spec: none (Playwright known-gap, pre-accepted) | probe scenario: manual code-review of OrganizerTagModal.svelte + info-card row diff for AC4/AC5/AC8 | high-risk pack: no


---

Next Step (RIPER-5): Say **ENTER EXECUTE MODE** to implement this plan. VALIDATE is complete (Gate: CONDITIONAL, one named/accepted residual — see Validate Contract above). If this is a first-pass CONDITIONAL requiring a supplement cycle per orchestrator policy, the orchestrator may instead route one PVL supplement cycle before EXECUTE.
