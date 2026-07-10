---
name: plan:deal-value-remove-won-stage
description: "Comment out deal-value input + currency selector from WonCaptureModal (GitHub #279)"
date: 08-07-26
feature: leads
---

# Remove Deal Value Field from Won Stage — PLAN (GitHub #279)

**Date**: 08-07-26
**Status**: Active — awaiting VALIDATE
**Complexity**: SIMPLE — single-file, mechanical comment-out, no design decisions remaining.

## TL;DR

Comment out (not delete) the deal-value input, the currency selector, and their supporting state/parse/emit logic in `src/lib/components/leads/WonCaptureModal.svelte`. No schema, server, query, or other-file changes. The Won-capture modal keeps working — it just stops collecting deal value + currency. All other issue ACs are already satisfied by prior work (`#196`/LEAD-1); this plan only closes the one remaining UI gap.

## Overview

GitHub #279 asks to remove the deal value field from the Won stage. RESEARCH established that everything except the Won-capture modal already meets the ACs:

- Validation never required deal value (Zod `wonFormSchema`/`moveStageSchema` `.optional()`; server transition never throws if absent) → AC2 already met.
- Pipeline Kanban (`PipelineBoard.svelte`) never showed deal value → AC4 already met.
- Lead detail + reports already hide it via `#196` `TODO(LEAD-1)` comment blocks → do NOT touch.
- DB column `crm_leads.deal_value_cents` stays as-is (nullable, no constraint) → AC3 met by doing nothing.

Only `WonCaptureModal.svelte` still renders the deal-value input + currency selector. This plan removes them via the same comment-out style used by `#196`.

## Goals

- Deal value input + currency selector no longer visible in the Won-capture modal.
- No regression: modal still marks a lead won on `signedOrg` + `signedAt`.
- No regression to validation, DB, or Pipeline views (all already correct — verify, don't change).

## Scope

**In scope:** `src/lib/components/leads/WonCaptureModal.svelte` (one file).

**Out of scope (do NOT touch):** DB schema / migrations, `src/lib/server/db/leads.ts`, Zod schemas, `PipelineBoard.svelte`, `src/routes/leads/[id]/+page.svelte`, `src/routes/reports/+page.svelte`, `src/routes/pipeline/+page.svelte`.

## Touchpoints

| File | Change | Read-only? |
|---|---|---|
| `src/lib/components/leads/WonCaptureModal.svelte` | Comment out deal-value + currency state, parse/emit logic, and markup | No — edited |
| `src/lib/types/index.ts` | `MoveStagePayload` — confirm all fields optional (they are: L318-326) | Yes — reference only |
| `src/routes/pipeline/+page.svelte` (~L367) | Confirm handler degrades to `undefined` for omitted fields | Yes — reference only |
| `src/routes/leads/[id]/+page.svelte` (~L1186) | Same confirmation | Yes — reference only |

## Public Contracts

- **Emit shape (`onconfirm(payload: MoveStagePayload)`):** all `MoveStagePayload` fields are optional (`wonOrgName?`, `dealValueCents?`, `currency?`, `signedAt?`, `lostReason?` — verified L318-326). After the change, `confirm()` emits `{ wonOrgName, signedAt }` and omits `dealValueCents`/`currency`. This is a valid `MoveStagePayload`. Consumers that destructure `dealValueCents`/`currency` receive `undefined` — graceful, no consumer changes needed.
- No API, DB, or route-contract change.

## Blast Radius

- **Files changed:** 1 (`WonCaptureModal.svelte`).
- **Packages:** none crossed — single Svelte component.
- **Risk class:** LOW. Pure presentational/UI comment-out. No schema, auth, billing, API, or migration surface. No new dependencies.

## Implementation Checklist

Removal style = comment out (NOT delete), matching `#196`. Use a consistent restore comment, e.g.:
`// TODO(#279): restore deal value + currency input once Done-stage revenue tagging (#273) ships`

1. In `WonCaptureModal.svelte` `<script>`: comment out the `dealValue` state var (L25) and the `currency` state var (L26), each with the `TODO(#279)` restore comment.
2. In the `$effect` reset block (L30-37): comment out `dealValue = '';` (L33) and `currency = 'PHP';` (L34). Leave `signedOrg`, `signedDate` resets intact.
3. In `confirm()` (L39-50): comment out the `normalized`/`parsedDealValue` parse lines (L40-42) and the `dealValueCents`/`currency` fields in the `onconfirm({...})` call (L46-47). The emitted payload becomes `{ wonOrgName: signedOrg.trim() || undefined, signedAt: signedDate }`. Keep the `wonOrgName` and `signedAt` fields.
4. In the markup: comment out the entire deal-value + currency row — the `<div class="mb-3.5 flex gap-3">…</div>` block (L63-79), which contains BOTH the deal value `<Input>` and the currency `<Select>`. Leave the signed-org block (L54-62) and signed-date block (L80-85) intact.
5. Handle now-unused imports to keep `bun run check` clean: comment out (or remove from) the imports that become unused after step 4 — `CURRENCIES` (L7), the `Select*` components (L6), and the `Currency` type (L8, if no longer referenced). Verify `Currency`/`MoveStagePayload` are still needed by remaining code before commenting; keep whatever is still used. **NOTE (from VALIDATE):** L8 is `import type { Currency, MoveStagePayload }` — comment out ONLY `Currency` (unused after L47), KEEP `MoveStagePayload` (still needed at props L20).
6. Confirm the "Mark won" button still gates only on `!signedOrg.trim()` (L95) — no change needed, verify only.
7. Run Fully-Automated gates: `bun run check` and `bun run test:unit:ci`. Fix any type/unused-import fallout from steps 1-5.
8. If any existing spec (`pipeline.spec.ts`, `pipeline-db.spec.ts`, `leads.spec.ts`, `leads-db.spec.ts`) asserts the MODAL collects/emits a deal value, update that assertion to match the new emit shape. Server-side optional-field acceptance specs must stay green untouched (do not modify server logic to satisfy a test). **NOTE (from VALIDATE):** this step is expected to be a no-op — no spec asserts modal collect/emit; all deal-value specs are server-side (`moveStageSchema`, DB `moveStage`, `dbRowToLead`). A red server-side spec means an unintended edit — stop and re-scope.

## Acceptance Criteria

| # | Criterion (from issue) | proven by | strategy |
|---|---|---|---|
| AC1 | Deal value field removed from Won stage UI (via comment-out) | Steps 1-5 applied; `bun run check` green; Agent-Probe visual check | Fully-Automated (compile) + Agent-Probe (visual) |
| AC2 | Validation requiring deal value on Won removed | Already true — `bun run test:unit:ci` stays green (no schema/server change) | Fully-Automated (regression) |
| AC3 | Existing records with stored deal value not broken | No DB change; `bun run test:unit:ci` DB specs stay green | Fully-Automated (regression) |
| AC4 | Pipeline Kanban/list no longer show deal value on Won cards | Already true — `PipelineBoard.svelte` untouched; regression spec green | Fully-Automated (regression) |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 (typecheck + svelte-check; modal compiles with fields commented out, no unused-import errors) | Fully-Automated | AC1 (field removed cleanly) |
| `bun run test:unit:ci` exits 0 (existing unit + DB specs stay green) | Fully-Automated | AC2, AC3, AC4 (no validation/DB/pipeline regression) |
| Manual: open Won-capture modal via pipeline drag-to-Won AND lead-detail stage change — confirm no deal value / currency inputs render, signed-org + signed-date remain, "Mark won" still works | Agent-Probe | AC1 (visual confirmation input no longer visible) |
| Component-render assertion that the deal-value input is absent from DOM | Known-Gap | AC1 — no Svelte component-test harness exists in repo yet (backlog stub below); AC1 stays CONDITIONAL on the Agent-Probe until a harness lands |

## Test Infra Improvement Notes

- Component-render proof of "deal-value input no longer visible" is a **Known-Gap**: no Svelte component-test harness exists in this repo. Recorded as residual, not a silent terminal PASS — AC1's mechanical proof is the Agent-Probe visual check; the DOM-absence assertion stays a backlog stub. Backlog: a Svelte component-test harness decision already tracked at `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md` — this modal's DOM-absence test should be added once that decision lands.

## Dependencies

- None. Self-contained single-file change.

## Risks

| Risk | Mitigation |
|---|---|
| Commenting out state/imports leaves unused-symbol errors that fail `bun run check` | Step 5 explicitly comments out newly-unused imports (`CURRENCIES`, `Select*`, `Currency` if unused); step 7 catches any remaining fallout |
| An existing spec asserts the modal collects/emits deal value → `test:unit:ci` goes red | Step 8: update only modal-shape assertions to the new emit shape; leave server-side optional-acceptance specs untouched. VALIDATE confirmed: no such modal-emit spec exists — step 8 is a no-op |
| Consumer handler hard-depends on `dealValueCents`/`currency` | Verified optional in `MoveStagePayload` (L318-326); both consumers spread `{ stage: 'won', ...payload }` — omitted keys absent, no hard dependency; Touchpoints table marks both consumers reference-only |

## Integration Notes

Backwards-compatible: emit shape only drops optional fields; DB unchanged; existing won leads with stored `deal_value_cents` unaffected. Rollback = uncomment the five commented blocks (trivial, single file).

## Phase Completion Rules

Single-phase SIMPLE plan. This plan is `CODE DONE` when checklist steps 1-8 are applied and both Fully-Automated gates (`bun run check`, `bun run test:unit:ci`) exit 0. It reaches `VERIFIED` only after the Agent-Probe visual check (both modal entry points) confirms the deal-value + currency inputs no longer render and "Mark won" still works. The DOM-absence Known-Gap does not block VERIFIED (Agent-Probe substitutes) but keeps AC1's automated proof CONDITIONAL until a component-test harness lands.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/leads/active/deal-value-remove-won-stage_08-07-26/deal-value-remove-won-stage_PLAN_08-07-26.md`
2. **Last completed step:** VALIDATE written (Gate: CONDITIONAL). No implementation started.
3. **Validate-contract status:** written 08-07-26 — Gate: CONDITIONAL (see below).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/features/pipeline/_GUIDE.md`, `process/features/leads/_GUIDE.md`; target file + `MoveStagePayload` type read during PLAN and re-verified during VALIDATE.
5. **Next step for a fresh agent:** EXECUTE steps 1-8 against `src/lib/components/leads/WonCaptureModal.svelte`. Gates: `bun run check` + `bun run test:unit:ci`.

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 0/7 — single-file UI comment-out, no schema/API/auth/migration surface, no multi-package scope, 1 file in blast radius. No dominant fan-out signal.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 (source) | Deal-value input + currency selector + their state/parse/emit commented out; component still compiles | Fully-Automated | `bun run check` exits 0 (svelte-check + tsc; no unused-import/dangling-ref errors after steps 1-5) | A — proven now |
| AC1 (runtime) | Deal-value + currency inputs no longer render in the Won-capture modal DOM (both entry points) | Agent-Probe | Open Won modal via pipeline drag-to-Won AND lead-detail stage change; confirm no deal-value/currency inputs, signed-org + signed-date remain, "Mark won" works | D — backlog stub (no Svelte component-test harness; see residual below) |
| AC2 | Validation no longer requires deal value on Won (already true; no schema/server change) | Fully-Automated | `bun run test:unit:ci` exits 0 — `pipeline.spec.ts` schema-optional/default specs stay green | A — proven now |
| AC3 | Existing records with stored deal value not broken (no DB change) | Fully-Automated | `bun run test:unit:ci` exits 0 — `leads.spec.ts`/`leads-db.spec.ts`/`pipeline-db.spec.ts` DB+mapping specs stay green | A — proven now |
| AC4 | Pipeline Kanban/list still don't show deal value on Won cards (already true; `PipelineBoard.svelte` untouched) | Fully-Automated | `bun run test:unit:ci` exits 0 — pipeline regression specs stay green | A — proven now |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to a named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here). Known-Gap is not a strategy — the AC1 runtime DOM-absence residual is carried as gap-resolution D (named residual row), never as a strategy that proves a behavior.

Legacy line form (retained for existing consumers):
- Modal source removal: Fully-automated: `bun run check`
- Regression (validation/DB/pipeline): Fully-automated: `bun run test:unit:ci`
- Modal runtime DOM-absence: agent-probe: open both Won-modal entry points, confirm inputs absent + "Mark won" works | known-gap: component-render DOM assertion (no Svelte component-test harness in repo)

Dimension findings:
- Infra fit: PASS — single Svelte component; correct runners (`bun run check`, `bun run test:unit:ci` = vitest, not `bun test`); no container/port/runtime surface.
- Test coverage: CONCERN — AC1 runtime DOM-absence has no Fully-Automated/Hybrid gate (no Svelte component-test harness; e2e auth-fixture also gapped). Rests on Agent-Probe + named Known-Gap. AC2/AC3/AC4 fully covered by existing regression suites.
- Breaking changes: PASS — emit shape drops only optional fields (`dealValueCents`/`currency`); both consumers spread `{ stage: 'won', ...payload }`, omitted keys simply absent; server `moveStageSchema` defaults currency→PHP + optional dealValueCents. Backward compatible, no consumer edits.
- Security surface: PASS — pure presentational comment-out; no auth/billing/data/secrets/trust-boundary. No evidence pack required (not a high-risk class).
- Section A (single-file removal feasibility): PASS — all edit targets present and uniquely matchable at the cited lines (state L25-26, reset L33-34, confirm L40-47, markup L63-79, imports L6-8). Highest-risk edit: the L8 partial import `import type { Currency, MoveStagePayload }` — execute-agent must comment out ONLY `Currency` (unused after L47) and KEEP `MoveStagePayload` (still needed at props L20); `CURRENCIES` (L7) and `Select*` (L6) become fully unused after markup removal and are commented out whole. Step 7 `bun run check` catches any residual unused-symbol fallout.

Execute-agent instructions:
- E1 (Section A entry): L8 import is partial-scope — comment out `Currency` only, keep `MoveStagePayload`. Do not delete the whole import line.
- E2 (Section A): Step 8 is expected to be a no-op — no existing spec asserts the modal collects/emits deal value (all deal-value specs are server-side: `moveStageSchema`, DB `moveStage`, `dbRowToLead`). Do NOT modify any server/schema/DB spec to satisfy a test; if a spec goes red, it means an unintended non-modal edit was made — stop and re-scope.
- E3: Comment-out (not delete) style, matching `#196`, with the `TODO(#279)` restore comment on each block.

Open gaps:
- AC1 runtime DOM-absence: known-gap: component-render DOM assertion — no Svelte component-test harness exists in repo. Tracked at `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`; this modal's DOM-absence test should be added once that decision lands. Substituted by Agent-Probe visual check for VERIFIED; keeps AC1's automated proof CONDITIONAL. NOT a NEW PLAN REQUIRED gap (pre-existing repo-wide infra gap, out of this plan's blast radius).

What this coverage does NOT prove:
- `bun run check` proves the component compiles with fields commented out and the emit is type-valid against `MoveStagePayload`; it does NOT prove the deal-value input is absent from the rendered runtime DOM.
- `bun run test:unit:ci` proves the server-side schema/DB/mapping paths are unregressed; it does NOT exercise the modal component at all (no component test), and does NOT prove the modal renders/behaves correctly at runtime (Agent-Probe covers that).
- Neither gate proves the "Mark won" button still functions end-to-end through both entry points — that is the Agent-Probe scenario, unautomatable until the shared Playwright auth fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

Failing stubs (Fully-Automated rows): N/A — the Fully-Automated gates here are pre-existing regression suites (`bun run check`, `bun run test:unit:ci`), not new red-first behaviors. The only new-behavior proof (runtime DOM-absence) is Known-Gap (no harness) and does not receive a stub. Backlog stub for when a harness lands:
`test("won-capture modal does not render a deal-value or currency input", () => { throw new Error("NOT IMPLEMENTED — TDD stub: assert WonCaptureModal DOM has no #won-value input and no #won-cur select") })`

Gate: CONDITIONAL (concerns noted, accepted — 1 CONCERN: AC1 runtime DOM-absence gate is Agent-Probe + named Known-Gap, no Fully-Automated/Hybrid runtime proof; backed by existing component-test-harness backlog note)
Accepted by: session (autonomous, subagent VALIDATE — no user present) — accepted concern: "AC1 runtime DOM-absence has no Fully-Automated/Hybrid gate (Agent-Probe + Known-Gap only), tracked at component-test-harness-decision_NOTE_07-07-26.md"

## Autonomous Goal Block

SESSION GOAL: Remove the deal-value field (input + currency selector) from the Won-stage capture modal (GitHub #279).
Charter + umbrella plan: N/A — single plan.
Autonomy: reversible single-file UI comment-out; auto-proceed on all reversible decisions. Cite feedback_autonomous_phase_execution.md.
Hard stop conditions / safety constraints:
- Do NOT touch DB schema/migrations, `src/lib/server/db/leads.ts`, Zod schemas, `PipelineBoard.svelte`, or any consumer route file — verify-only, edits are out of scope.
- Do NOT modify any server/schema/DB spec to make a test pass; if a server-side spec goes red, an unintended edit was made — stop and re-scope.
- Comment out (never delete) so rollback is uncommenting the 5 blocks.
Next phase: EXECUTE: process/features/leads/active/deal-value-remove-won-stage_08-07-26/deal-value-remove-won-stage_PLAN_08-07-26.md
Validate contract: inline in plan (this section, Gate: CONDITIONAL).
Execute start: fully-auto commands: `bun run check` + `bun run test:unit:ci` | agent-probe: open Won modal via pipeline drag-to-Won AND lead-detail stage change, confirm deal-value/currency inputs absent + "Mark won" works | high-risk pack: no.
