---
name: plan:done-stage-revenue-tagging
description: COMPLEX plan — GitHub #273: add a "Done" pipeline stage after Live, capture post-event revenue on the Done transition, edit it inline on the lead detail page, and surface per-AE revenue totals on the manager dashboard
date: 09-07-26
feature: pipeline
---

# PLAN — Done Stage with Post-Event Revenue Tagging (GitHub #273)

**Date**: 09-07-26
**Status**: Active — PLAN written, VALIDATE pending
**Complexity**: COMPLEX (schema/native-enum migration + new column + new capture modal + net-new inline-edit UI + 7th dashboard aggregation; ~13 files; high-risk class present).

**High-risk class:** YES — Postgres native-enum migration + new column (schema/migration), financial data (revenue), and a new authorization-adjacent PATCH surface (inline edit). VALIDATE must NOT be skipped. EXECUTE requires the manual-first 5-artifact evidence handoff (see `vc-risk-evidence-pack`).

## Overview / Context

Extends the veent-crm pipeline (SvelteKit 2 + Drizzle + Postgres) with a `done` stage that captures actual post-event revenue, then rolls it up per-AE on the manager dashboard. Reads `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (test routing), and the SPEC in this task folder for locked decisions. Builds on established repo patterns: native-enum migration (`0021` precedent), the `WonCaptureModal` capture flow, `moveLeadStage` discriminated-union handling, and the 6-query `getDashboardData` aggregation pattern.

## TL;DR

Add `done` to the `crm_lead_stage` enum (after `live`) + a nullable `revenue_cents` column via migration `0035`. Keep the Zod `LEAD_STAGES` list in sync (the `Stage` type auto-derives — no manual type edit). Add a `done` branch to `moveStageSchema` (revenue + currency BOTH required) and to `moveLeadStage` (writes revenue+currency+2 history rows, leaves `deal_value_cents`/`won_org_name` untouched). Add `DoneCaptureModal.svelte` (copy of `WonCaptureModal`) wired into both stage-change entry points. Add an inline revenue editor on `/leads/[id]` that PATCHes through the existing guarded `leadUpdateSchema`/`canEditLead` path (and audit-logs the change via `updateLead`'s `tracked` history array). Add `getRevenuePerAe` as the 7th dashboard aggregation and a "Revenue (range)" card, guarded on current stage = `done`.

---

## Goals

1. A `done` stage exists in the pipeline, ordered after `live` (AC1).
2. Moving a lead to Done requires revenue amount + currency before the transition completes (AC2).
3. A successful Done transition persists revenue+currency and writes audit-trail rows (AC3).
4. Revenue is visible and independently editable inline on `/leads/[id]` without re-triggering Done (AC4).
5. The manager dashboard shows a per-AE revenue total for the selected date range (AC5).
6. Only `done`-stage leads contribute to that total (AC6).
7. Existing `deal_value_cents` behavior is unaffected (AC7).

## Scope

In scope: schema/migration, Zod + type sync, move-stage schema/server branch, DoneCaptureModal, pipeline board + detail-page stage wiring, inline revenue editor, `getRevenuePerAe` + dashboard card.

Out of scope (from SPEC, do not touch): `deal_value_cents` reuse, any new events/revenue table, `/reports`, Better Auth tables/migration tooling, bulk revenue editing, cross-currency dashboard rollups.

---

## Touchpoints

Files to be **modified**:

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `done` to `crmLeadStage` pgEnum (after `live`); add `revenueCents: integer('revenue_cents')` column on `crm_leads` |
| `src/lib/zod/schemas.ts` | Add `'done'` to `LEAD_STAGES` (after `'live'`); add `done` branch to `moveStageSchema`; add optional `revenueCents`/`currency` to `leadUpdateSchema` |
| `src/lib/types/index.ts` | Add `revenueCents?: number` to `MoveStagePayload`. `Stage` auto-derives from `LEAD_STAGES` — NO manual edit needed (confirm). |
| `src/lib/design/tokens.ts` | Add `done` entry to `STAGE_TOKENS` (label "Done", color/hex) |
| `src/lib/utils/stages.ts` | Add `done` to `STAGE_ORDER` (after `live`) and `BOARD_STAGES`; add `requiresDoneCapture` helper |
| `src/lib/server/db/leads.ts` | Add `done` branch to `moveLeadStage`; extend `Lead` mapping (`dbLeadToLead`) + `updateLead` to carry `revenueCents` AND audit-log it in the `tracked` history array |
| `src/lib/server/db/dashboard.ts` | Add `getRevenuePerAe(range)`; add to `getDashboardData` `Promise.all`; add field to `AeDashboardRow` |
| `src/routes/api/leads/[id]/+server.ts` | Forward `revenueCents`/`currency` from parsed body into `updateLead` |
| `src/routes/leads/[id]/+page.svelte` | Add `done` stage handling to `selectStage`; render `DoneCaptureModal`; add inline revenue editor widget |
| `src/routes/pipeline/+page.svelte` | Add `done` handling to `onMove`; render + wire `DoneCaptureModal` (`confirmDone`) |
| `src/routes/dashboard/+page.svelte` | Render "Revenue (range)" per-AE card |
| `src/tests/schemas.spec.ts` | Extend for AC1 (LEAD_STAGES) + AC2 (moveStageSchema done branch) |
| `src/tests/dashboard-db.spec.ts` | Extend for AC5/AC6 (`getRevenuePerAe`) |

Files to be **created**:

| File | Purpose |
|---|---|
| `src/lib/components/leads/DoneCaptureModal.svelte` | Revenue + currency capture modal (copy-and-diverge from `WonCaptureModal.svelte`) |
| `drizzle/0035_*.sql` | Generated migration (enum ADD VALUE + column) — do NOT hand-write |

Files **read for context** (not modified): `WonCaptureModal.svelte`, `StageControl.svelte`, `PipelineBoard.svelte`, `src/lib/utils/optimistic.ts`, `src/lib/utils/permissions.ts` (`canEditLead`).

---

## Public Contracts

- **DB enum `crm_lead_stage`** gains value `done` (ordered after `live`). Additive/non-destructive. Visible to every query filtering/reading stage.
- **`crm_leads.revenue_cents`** — new nullable `integer` column. No default, no constraint (app-enforced non-negative).
- **`moveStageSchema` `done` branch** (public request contract for `PATCH /api/leads/[id]/stage`):
  ```ts
  z.object({
    stage: z.literal('done'),
    revenueCents: z.number().int().nonnegative(),   // REQUIRED (unlike won's optional dealValueCents)
    currency: z.enum(CURRENCIES).default('PHP')
  })
  ```
- **`leadUpdateSchema`** gains OPTIONAL `revenueCents: z.number().int().nonnegative().optional()` and reuses existing optional `currency` (add if absent). Because these are optional, a normal full-page edit that omits them is unaffected. The inline editor PATCHes the existing `/api/leads/[id]` endpoint.
- **`MoveStagePayload`** interface gains `revenueCents?: number` (currency already present).
- **`getRevenuePerAe(range: DashboardRange): Promise<Map<string, number>>`** — new server function; sums `revenue_cents` per `ownerId` for leads whose most-recent stage→`done` transition falls in range AND whose current stage is `done` (current-stage guard — see E2 below).
- **`AeDashboardRow`** gains one new field (e.g. `revenueCentsInRange: number`).

### Critical contract note — inline edit and the auth gate

`PATCH /api/leads/[id]` runs `leadUpdateSchema.safeParse` then `canEditLead(me, existing)`. `leadUpdateSchema` REQUIRES `name` (min 1). Therefore the inline revenue PATCH MUST send `{ name: lead.name, revenueCents, currency }` — NOT a bare `{ revenueCents }` (which would 400 on missing `name`). Sending `name: lead.name` (already on the page) preserves the existing `canEditLead` authorization gate exactly — the gate is genuinely inherited, not bypassed, because the same handler + same schema + same permission check run. `updateLead` must be extended to persist `revenueCents`/`currency` when present (forward-only, mirroring the onboarding-fields `=== undefined ? undefined : …` pattern so a normal edit never wipes revenue) AND to audit-log revenue changes in its `tracked` history array (see E1 / step 12b).

---

## Blast Radius

- **Files:** 13 modified + 2 created (~15 files).
- **Packages/areas:** DB schema + migration, Zod validators, shared types, design tokens, stage utils, server DB layer (leads + dashboard), 1 API route, 2 Svelte route pages, 1 dashboard page, 2 new/edited test files, 1 new component.
- **Risk class:** HIGH — schema/native-enum migration + new column (data), financial field (revenue), auth-adjacent PATCH surface (inline edit). Also a novel UI pattern (inline editor — no prior precedent in this codebase).
- **Regression surface:** `won`/`lost`/active-stage branches of `moveLeadStage` (must stay byte-identical in behavior), existing 6 dashboard aggregations, existing full-page lead edit flow, `schemas.spec.ts` stage-count assertion (currently `.toBe(7)` → must become `8`).

---

## Migration Safety Note

- Combine BOTH statements in migration `0035` (enum `ADD VALUE 'done' AFTER 'live'` + `ADD COLUMN revenue_cents integer`). Safe in one transaction because neither statement READS/INSERTS `'done'` as a value — Postgres's "new enum value cannot be used in same transaction" restriction does not apply here (we only add the label and add an unrelated column).
- **Generate via `bun run db:generate` — do NOT hand-number or hand-write the SQL.** Before generating, per the repo Drizzle convention: confirm `drizzle/meta/_journal.json`'s last `idx` matches the highest-numbered `.sql` file, and scan for duplicate-prefix/stray files. Handoff says idx 34 (from #275), next = 35; git status shows an untracked `0033_name_split_first_last.sql` — VERIFY the journal/file alignment on read and reconcile any drift BEFORE generating. If the generator picks a different number than `0035`, accept the generator's number (do not force `0035`).
- Additive, non-destructive, follows precedent `0021` (`ALTER TYPE … ADD VALUE`). Migration is generated but NOT applied to any live DB in this environment (deploy-time step).

---

## Acceptance Criteria

All 7 criteria carry an explicit `proven by:` scenario and a `strategy:` tag (one of Fully-Automated / Hybrid / Agent-Probe). See the Verification Evidence table for the criterion ↔ gate back-reference.

- **AC1** — `done` is a valid `crm_lead_stage` value ordered immediately after `live`.
  - proven by: `schemas.spec.ts` LEAD_STAGES assertion (contains `done`, length 8, `done` index = `live` index + 1). strategy: Fully-Automated.
- **AC2** — moving to Done requires revenue amount + currency before the transition completes.
  - proven by: `schemas.spec.ts` `moveStageSchema` done-branch test (valid accepted; missing revenue rejected; negative rejected). strategy: Fully-Automated.
- **AC3** — a successful Done transition persists `revenue_cents`+`currency` and writes audit rows.
  - proven by: `moveLeadStage` done-branch DB test (values written; `stage` + `revenue_cents` history rows created; `deal_value_cents`/`won_org_name` untouched). strategy: Hybrid.
- **AC4** — revenue is visible and independently editable inline on `/leads/[id]` without re-triggering Done, AND the inline edit writes a `crm_lead_history` audit row (E1).
  - proven by: agent-probe walkthrough of the inline editor; audit-row write proven by the `updateLead` `tracked`-array unit assertion where feasible / Hybrid DB test otherwise. strategy: Agent-Probe.
- **AC5** — the dashboard shows a per-AE revenue total for the selected range.
  - proven by: `dashboard-db.spec.ts` `getRevenuePerAe` correct-sums test. strategy: Hybrid.
- **AC6** — only leads CURRENTLY in `done` stage contribute; Won/Live with a revenue value, and leads that transitioned into `done` but later moved OUT, are excluded (current-stage guard, E2).
  - proven by: same aggregation test, exclusion cases (Won-with-revenue excluded; done→moved-out excluded). strategy: Hybrid.
- **AC7** — existing `deal_value_cents` behavior is unaffected.
  - proven by: existing `moveLeadStage` won-branch regression tests pass unchanged. strategy: Fully-Automated.

---

## Phase Completion Rules

This is a single COMPLEX plan with dependency-grouped checklist sections (not a phase program). A group is **CODE DONE** when all its checklist steps are implemented and its section-level test gate is green (or self-skips for Hybrid tiers without live Postgres). The plan is **VERIFIED** only when: (a) all Fully-Automated gates (AC1, AC2, AC7) are green; (b) all Hybrid gates (AC3, AC5, AC6) are green OR recorded as self-skipped known-gaps with backlog stubs; (c) the AC4 Agent-Probe scenario is executed or recorded as the pre-accepted e2e-auth-bootstrap known-gap; (d) `bun run check` + `bun run test:unit:ci` + `bun run lint` all pass. Any developed behavior resting only on a Known-Gap keeps its gate CONDITIONAL — never a silent terminal PASS. Code-complete-but-unverified status is `CODE DONE`, not `VERIFIED`.

---

## Implementation Checklist

Grouped by dependency. Groups 3, 4, 5 are parallel-safe with each other once 1+2 land.

### Group 1 — Schema + migration + Zod/type sync (no deps)

1. `src/lib/server/db/schema.ts`: add `'done'` to the `crmLeadStage` pgEnum value list, positioned after `'live'`, before `'lost'`. Add `revenueCents: integer('revenue_cents')` to the `crmLeads` table definition (nullable, no default), near `dealValueCents`.
2. `src/lib/zod/schemas.ts`: add `'done'` to `LEAD_STAGES` after `'live'` (before `'lost'`) to match DB enum order.
3. Confirm `src/lib/types/index.ts` `Stage` = `(typeof LEAD_STAGES)[number]` auto-derives `'done'` — no manual edit. Grep the file for any hardcoded stage array; if none, no change here beyond step 12's `MoveStagePayload`.
4. Run `bun run db:generate` (after the journal-drift check above) to produce `drizzle/0035_*.sql`. Verify the generated SQL contains both the `ALTER TYPE … ADD VALUE 'done'` and `ADD COLUMN "revenue_cents"` statements; do not edit by hand.
5. `src/lib/design/tokens.ts`: add `{ key: 'done', label: 'Done', color: 'var(--color-stage-done)', hex: '<pick a distinct hex, e.g. #0891b2 teal>' }` to `STAGE_TOKENS`, positioned after `live`. Add the matching `--color-stage-done` CSS var wherever the other `--color-stage-*` vars are declared (grep `--color-stage-live`).
6. `src/lib/utils/stages.ts`: add `'done'` to `STAGE_ORDER` (after `live`) and to `BOARD_STAGES` (after `live`). Add `export const requiresDoneCapture = (stage: Stage): boolean => stage === 'done';`.
7. **Test gate (AC1):** `src/tests/schemas.spec.ts` — update the existing `LEAD_STAGES.length).toBe(7)` assertion to `8`; add `expect(LEAD_STAGES).toContain('done')`; assert `LEAD_STAGES.indexOf('done') === LEAD_STAGES.indexOf('live') + 1` (ordered after live). Run `bun run test:unit -- src/tests/schemas.spec.ts` → green.

### Group 2 — move-stage schema + server branch + regression (deps: Group 1)

8. `src/lib/zod/schemas.ts`: add a `done` branch to `moveStageSchema` discriminated union (BOTH fields required, per Public Contracts above — `revenueCents` non-optional, `currency` defaulted PHP). Do NOT restructure existing `won`/`live`/`lost` branches. NOTE: `done` is NOT terminal — the generic first branch (`z.object({ stage: z.enum(PIPELINE_STAGES) })`) still permits moving a lead OUT of `done` into another pipeline stage; this is the reason the E2 current-stage guard in Group 5 is required.
9. `src/lib/types/index.ts`: add `revenueCents?: number` to `MoveStagePayload` (currency already present).
10. `src/lib/server/db/leads.ts`: add a dedicated `else if (stage === 'done')` branch in `moveLeadStage` BEFORE the generic `else` (active-stage clearing) branch. It sets `stage: 'done'`, `revenueCents: payload.revenueCents`, `currency: payload.currency ?? 'PHP'`, `lastActivityAt: now`, `updatedAt: now`. It MUST NOT touch/null `dealValueCents`, `wonOrgName`, `signedAt`, or `lostReason` — leave them exactly as the lead's prior state. (Do NOT route through the generic branch — that branch nulls `currency` and would clobber the value being written.)
11. In the same function's history-rows block, add (for `stage === 'done'`) a second history row `field: 'revenue_cents'`, `oldValue: null`, `newValue: String(payload.revenueCents)`, mirroring how `won` logs `deal_value_cents`. The base `field: 'stage'` row (oldValue=live/newValue=done) is already emitted by the shared code.
12. `src/lib/server/db/leads.ts`: extend the `Lead` mapping (`dbLeadToLead`) to include `revenueCents` from the row, and extend `updateLead`'s accepted input + SET clause to persist `revenueCents`/`currency` forward-only (`=== undefined ? undefined : …`), so the inline editor (Group 4) can write through it without wiping on normal edits.
12b. **Audit trail (E1 — mandatory, financial field).** In the SAME `updateLead` function, add a `revenue_cents` entry to the existing `tracked` history array (`Array<[string, string | null, string | null]>` at `src/lib/server/db/leads.ts:1090`), following the EXACT tuple pattern the numeric fields already use (`transaction_fee_pct`, `convenience_fee_pesos`): `['revenue_cents', existing.revenueCents != null ? String(existing.revenueCents) : null, updated.revenueCents != null ? String(updated.revenueCents) : null]`. The existing `changed = tracked.filter(([, oldVal, newVal]) => oldVal !== newVal)` logic (line ~1159) then writes a `crm_lead_history` row automatically, and ONLY when revenue actually changed. Rationale: repo convention (`all-context.md` §Audit trail — "All stage changes, owner changes, deal value changes write a row to crm_lead_history") requires deal-value/revenue edits to be audit-logged; an inline revenue PATCH via `PATCH /api/leads/[id]` that leaves no history row violates it. This mirrors how the Won deal-value is audit-logged via `moveLeadStage` (step 11) — inline revenue edits must be logged the same way through `updateLead`. (Placed here with step 12 because both extend `updateLead`; it is a Group 4 dependency — the inline editor's audit trail.)
13. **Test gate (AC2):** `src/tests/schemas.spec.ts` — add `moveStageSchema` done-branch tests: valid `{ stage:'done', revenueCents:50000, currency:'PHP' }` parses; `{ stage:'done' }` (missing revenue) rejected; `{ stage:'done', revenueCents:-1 }` rejected. Run vitest → green.
14. **Test gate (AC7 regression):** run the existing `moveLeadStage` / won-branch tests (grep `src/tests` for won-stage coverage) unchanged → must stay green, proving `deal_value_cents` logic is unaffected.

### Group 3 — DoneCaptureModal + stage-change wiring (deps: Group 2; parallel-safe with 4, 5)

15. Create `src/lib/components/leads/DoneCaptureModal.svelte` as a near-verbatim copy of `WonCaptureModal.svelte`'s post-#279 structure (props: `open`, `leadName`, `onclose`, `onconfirm`, `saving`). Replace the org-name/signed-date inputs with: a required revenue-amount `Input` (numeric, strip non-`[0-9.]`, parse to cents — input is major units → `Math.round(value*100)`) and a required currency `Select` (uncomment/reuse the `CURRENCIES` Select markup already present-but-commented in `WonCaptureModal`). Default currency from the lead's existing `currency` (fallback `'PHP'`). `onconfirm` emits `{ revenueCents, currency }`. Disable the confirm button until a valid non-negative revenue is entered. Title e.g. "Mark done — capture the revenue".
16. `src/routes/leads/[id]/+page.svelte`: in `selectStage`, add `if (stage === 'done') return void (doneOpen = true);` (mirroring the `won`/`lost` early returns). Add `doneOpen` `$state`. Add a `confirmDone(payload)` handler mirroring `confirmWon` (optimistic `patchRecord`, PATCH `/api/leads/${id}/stage` with `{ stage:'done', ...payload }`, keep modal open on failure, `invalidateAll()` + toast on success). Render `<DoneCaptureModal>` in the `{#if doneOpen}` block.
17. `src/routes/pipeline/+page.svelte`: in `onMove`, add `if (stage === 'done') return void (doneLead = lead);`. Add `doneLead` + `savingDone` `$state`. Add `confirmDone(payload)` mirroring `confirmWon` (optimistic `patchInList` on both lists, PATCH stage endpoint, rollback on failure). Render `<DoneCaptureModal>` in a `{#if doneLead}` block.
18. Confirm `PipelineBoard.svelte` renders the new `done` column automatically from `BOARD_STAGES` (it iterates the stage list). If the board hardcodes columns anywhere, add `done`. Verify `stageColor`/`stageLabel` resolve `done` via the token added in step 5.

### Group 4 — Inline revenue editor on /leads/[id] (deps: Group 1 + steps 12, 12b; parallel-safe with 3, 5)

19. `src/lib/zod/schemas.ts`: add `revenueCents: z.number().int().nonnegative().optional()` to `leadUpdateSchema`. Ensure `currency: z.enum(CURRENCIES).optional()` exists on that schema (add if absent). Both optional → normal edits unaffected.
20. `src/routes/api/leads/[id]/+server.ts`: forward `revenueCents` and `currency` from `parsed.data` into the `updateLead(...)` input object, forward-only (`data.revenueCents === undefined ? undefined : data.revenueCents`). No change to the `canEditLead` gate — it stays as-is and now covers revenue edits automatically.
21. `src/routes/leads/[id]/+page.svelte`: add the inline revenue editor widget (net-new UI — spec its states exactly, see "Inline Revenue Editor — Interaction Spec" below). Render it only when the lead is in `done` stage (or has a `revenueCents` value). On Save, PATCH `/api/leads/${id}` with `{ name: lead.name, revenueCents, currency }`; optimistic `patchRecord`; `invalidateAll()` on success; rollback + toast on failure. Gate the whole widget behind the same `canEdit` boolean the page already computes for other edits. MUST NOT reopen `DoneCaptureModal` or re-trigger the Done transition (SPEC user story 3). The audit-trail row for this edit is written by `updateLead` (step 12b) — no extra history write is needed here.
22. **Test gate (AC4 — Agent-Probe / known-gap):** e2e click-through is blocked by the shared Playwright auth-fixture gap. Write the interaction as an Agent-Probe scenario in the validate-contract; register a backlog stub (see Test Infra Improvement Notes). Optionally add a Vitest unit test for any extracted pure helper (e.g. cents parse/format) if one is created. Where feasible, also assert (unit or Hybrid) that an inline revenue change produces a `revenue_cents` `crm_lead_history` row (E1) — otherwise carry it as a Hybrid live-DB residual.

### Group 5 — getRevenuePerAe + dashboard card (deps: Group 1; parallel-safe with 3, 4)

23. `src/lib/server/db/dashboard.ts`: add `getRevenuePerAe(range)` exactly mirroring `getWonInRangePerAe`'s `.selectDistinctOn([crmLeadHistory.leadId], {...})` shape, but: select `revenueCents: crmLeads.revenueCents` too; `where` filters `field='stage' AND newValue='done' AND eq(crmLeads.stage, 'done') AND isNull(deletedAt)`; in the reduce loop, skip rows with null `ownerId` OR null `revenueCents`, apply the same `start`-range guard, and accumulate `revenueCents` (not `+1`). Return `Map<ownerId, totalCents>`. **E2 (mandatory current-stage guard):** the additional `eq(crmLeads.stage, 'done')` condition on the join to `crmLeads` ensures ONLY leads CURRENTLY in `done` contribute — not merely leads that ever transitioned into `done`. This closes the AC6 edge case where a lead moved into `done` and then LATER moved to a different stage: `done` is NOT terminal (the generic `moveStageSchema` branch permits it — see step 8), and the generic `moveLeadStage` clearing branch does NOT null `revenueCents`, so without this guard such a lead would keep both its `revenue_cents` value AND its stage→`done` history row and be double-counted despite no longer being "in Done". The guard costs nothing and makes AC6 genuinely correct (`getWonInRangePerAe` carries the same latent inaccuracy for `won`; note the divergence in the phase report but do NOT retrofit won here — out of scope).
24. `src/lib/server/db/dashboard.ts`: add `getRevenuePerAe(range)` as a 7th member of `getDashboardData`'s `Promise.all`; add `revenueCentsInRange` to the `AeDashboardRow` build (default 0 when the map has no entry for an owner).
25. `src/routes/dashboard/+page.svelte`: add a "Revenue (range)" `<dl>` card in the per-AE grid, formatting cents→currency with a fixed "PHP" label (single-currency-in-practice limitation — documented, sums raw cents regardless of currency; do NOT build per-currency breakdown, SPEC defers it).
26. **Test gate (AC5 + AC6 — Hybrid):** `src/tests/dashboard-db.spec.ts` — add a `getRevenuePerAe` test mirroring the existing `getWonInRangePerAe` test: correct per-AE sums for a range (AC5); a Won-stage lead with a `revenue_cents` value present is EXCLUDED from the sum (AC6); AND a lead that transitioned to `done` in range but whose CURRENT stage is no longer `done` is EXCLUDED (AC6 current-stage-guard case, E2). These self-skip without live Postgres (existing `SKIP_DB` convention). Run vitest → green-or-skipped.

### Group 6 — Full regression sweep (deps: all)

27. Run `bun run check` (types), `bun run test:unit:ci` (full Vitest), `bun run lint`. All green (Hybrid DB tests may self-skip). Confirm AC7 won-branch tests still pass.

---

## Inline Revenue Editor — Interaction Spec (concrete, per vc-predict CAUTION)

This is net-new UI with no precedent in the codebase, so interaction states are specified here to remove EXECUTE-time guesswork.

- **Display state (default):** a read row rendered as `Revenue: ₱X,XXX.XX PHP` (formatted from `revenueCents`). When `canEdit` is true, the amount text is a click target styled as an editable field (subtle underline/hover affordance, `role="button"`, `tabindex="0"`, `aria-label="Edit revenue"`). When `revenueCents` is null, show `Revenue: — ` with an "Add" affordance (still only in `done` stage).
- **Enter edit mode:** click OR Enter/Space on the target swaps the read row for a 2-field mini-form inline (no modal): amount `Input` (pre-filled with current major-unit value, autofocused, `inputmode="decimal"`) + currency `Select` (pre-selected current currency) + `Save` and `Cancel` buttons. Reuse the `Input`/`Select` components used in `WonCaptureModal`.
- **Edit-mode boundaries:** the swap is scoped to this one field row only — no other page state changes; the Done transition is NOT re-triggered; the capture modal does NOT open.
- **Keyboard:** `Escape` cancels (reverts to display state, discards input). `Enter` inside the amount field submits Save. `Tab` moves amount → currency → Save → Cancel.
- **Save:** validate amount is a non-negative number; on invalid, show inline error and keep edit mode. On valid, PATCH `{ name: lead.name, revenueCents, currency }`; apply optimistic `patchRecord`; disable buttons while saving (`saving` flag); on success `invalidateAll()` + success toast + return to display state; on failure rollback to snapshot + error toast + stay in edit mode (preserve input). The PATCH audit-logs the change via `updateLead`'s `tracked` array (step 12b).
- **Cancel:** discard input, return to display state, no network call.
- **Concurrency guard:** ignore Save if a mutation is already in flight (`mutating` flag), mirroring `selectStage`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `schemas.spec.ts`: `LEAD_STAGES` contains `done`, length 8, `done` ordered immediately after `live` | Fully-Automated | AC1 |
| `schemas.spec.ts`: `moveStageSchema` done branch — valid payload accepted; missing `revenueCents` rejected; negative `revenueCents` rejected | Fully-Automated | AC2 |
| `moveLeadStage` done-branch DB test — `revenue_cents`+`currency` written; `stage` + `revenue_cents` history rows created; `deal_value_cents`/`won_org_name` untouched | Hybrid (self-skips without live Postgres) | AC3 |
| Agent-probe walkthrough of `/leads/[id]` inline revenue edit (display→edit→save→persist, Escape cancel); PLUS inline edit writes a `revenue_cents` `crm_lead_history` audit row (E1 — unit-assert on `updateLead` `tracked` array where feasible, else Hybrid live-DB) | Agent-Probe (walkthrough blocked by e2e-auth-bootstrap; audit-row Hybrid self-skips without live Postgres) | AC4 |
| `dashboard-db.spec.ts`: `getRevenuePerAe` correct per-AE sums for a range | Hybrid (self-skips without live Postgres) | AC5 |
| `dashboard-db.spec.ts`: Won-stage lead with `revenue_cents` present is EXCLUDED; AND a lead that transitioned to `done` in range but whose CURRENT stage ≠ `done` is EXCLUDED (E2 current-stage guard) | Hybrid (self-skips without live Postgres) | AC6 |
| Existing `moveLeadStage` won-branch regression tests continue passing unchanged | Fully-Automated | AC7 |

Every developed behavior is proven by one of the three proving strategies (Fully-Automated / Hybrid / Agent-Probe) — no behavior rests on Known-Gap. The Hybrid self-skip (no live Postgres in CI) and the Agent-Probe (no shared Playwright auth fixture) are pre-accepted project-convention residuals recorded as backlog stubs below; the AC3/AC4/AC5/AC6 gates stay CONDITIONAL until a live-DB CI harness + auth fixture exist.

---

## Test Infra Improvement Notes

- **Live-DB CI harness (Hybrid gates AC3/AC4-audit/AC5/AC6):** `moveLeadStage`, `updateLead` audit-row, and `getRevenuePerAe` DB tests self-skip without live Postgres — same pre-accepted known-gap class as manager-dashboard/calendar. Backlog stub to register at EXECUTE/EVL: `process/features/pipeline/backlog/done-revenue-live-db-harness_NOTE_09-07-26.md` (only if not already covered by an existing live-DB harness backlog note).
- **Shared Playwright auth fixture (Agent-Probe gate AC4):** inline-edit e2e click-through blocked by `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. No new backlog note needed — reference the existing one.

---

## Dependencies, Risks, Failure Modes

- **Dep:** Group 1 must land before all others. Groups 3/4/5 are parallel-safe after 1(+2 for Group 3, +steps 12/12b for Group 4).
- **Risk — migration journal drift:** untracked `0033_name_split_first_last.sql` in the working tree; journal idx may not be 34 as assumed. Mitigation: run the journal/file alignment check (step 4) and reconcile BEFORE `db:generate`; accept the generator's chosen number.
- **Risk — inline edit 400 on missing `name`:** `leadUpdateSchema` requires `name`. Mitigation: PATCH always includes `name: lead.name` (step 21). Do not attempt a bare revenue PATCH.
- **Risk — clobbering won metadata on Done:** the generic non-won/non-lost branch nulls `currency`/`dealValueCents`/`wonOrgName`. Mitigation: dedicated `done` branch (step 10) that touches only revenue/currency/timestamps.
- **Risk — missing audit trail on inline revenue edit (E1):** without step 12b, a financial-field edit leaves no `crm_lead_history` row, violating the repo audit convention. Mitigation: add the `revenue_cents` tuple to `updateLead`'s `tracked` array (step 12b).
- **Risk — AC6 over-count on done→moved-out lead (E2):** `done` is not terminal and the generic clearing branch does not null `revenueCents`, so a stale done-transition history row would be summed. Mitigation: `eq(crmLeads.stage, 'done')` current-stage guard in `getRevenuePerAe` (step 23).
- **Risk — `.toBe(7)` stage-count assertion breaks:** expected; update to `8` (step 7) — this is the AC1 signal, not a failure.
- **Failure mode — cents convention mismatch:** modal input is major units; must `Math.round(x*100)` to cents consistently in both DoneCaptureModal and the inline editor. Spec'd in steps 15/21.
- **Rollback:** migration is additive and generated-only (not applied in this env); code changes are revertible per group. No destructive data operation.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pipeline/active/done-stage-revenue-tagging_09-07-26/done-stage-revenue-tagging_PLAN_09-07-26.md`
2. **Last completed step:** PLAN written + PVL-supplement cycle 1 applied (E1 audit trail → step 12b; E2 current-stage guard → step 23). No execution started.
3. **Validate-contract status:** CONDITIONAL (inline below); PVL supplement cycle 1 applied — re-validation pending.
4. **Supporting context loaded:** SPEC (same folder), `process/context/all-context.md`, `process/context/tests/all-tests.md`, and the touchpoint source files listed above.
5. **Next step for a fresh agent:** re-run VALIDATE (`vc-validate-agent`) to confirm the supplement closes E1/E2, then EXECUTE Group 1 first. EXECUTE requires the manual-first 5-artifact high-risk evidence pack (schema/migration + financial + auth-adjacent PATCH). Pass the exact plan path to `vc-execute-agent`.

## Validate Contract

Status: CONDITIONAL
Date: 09-07-26
date: 2026-07-09
generated-by: outer-pvl
supersedes: 09-07-26 (outer-pvl) — outer PVL cycle 1 re-validation has current evidence after E1/E2 supplement applied and source-verified
pvl-cycle: 1

Parallel strategy: parallel-subagents
Rationale: 5/7 signals (S1 multi-package, S2 schema/API/auth, S6 high-risk class, S7 5+ files, S3 3+ feasibility groups). Dominant signal: high-risk schema/auth/financial surface. Layer 1 (4 dimensions) + Layer 2 (3 feasibility groups) fan-out; results synthesized, no mid-run coordination needed.

### Net gate

Totals: 0 FAILs / 7 CONCERNs / all critical claims PASS.
Net Gate: CONDITIONAL — no FAILs; developed behavior AC3/AC4/AC5/AC6 rests on Hybrid-self-skip + Agent-Probe residuals (no live Postgres, no shared auth fixture in this env), so per the vacuous-green ban this cannot be a terminal PASS. All high-risk critical validations (auth gate, migration safety, stage-count regression, Stage auto-derive, moveLeadStage branch, getRevenuePerAe shape) passed against actual source.

**PVL supplement cycle 1 (09-07-26) — RE-VALIDATED against source, both fixes CONFIRMED:** E1 (inline-revenue audit trail) promoted to explicit checklist step 12b; E2 (AC6 current-stage guard) promoted to step 23. This cycle-1 re-run independently verified BOTH fixes against actual source (not a rubber-stamp):

- **Step 12b (E1) — CONFIRMED ACCURATE.** The `tracked` array is exactly at `src/lib/server/db/leads.ts:1090`, typed `Array<[string, string|null, string|null]>`. The numeric-field tuple pattern step 12b cites — `transaction_fee_pct` (lines 1123-1127) and `convenience_fee_pesos` (1128-1132) — matches the proposed `revenue_cents` tuple verbatim; `existing.`/`updated.` var names match; the `changed = tracked.filter(...)` at line 1159 writes the `crm_lead_history` row only on actual change. `revenue_cents` is correctly absent today (it is an addition, not a duplicate). The current `updateLead` SET clause also lacks `revenueCents`/`currency` — step 12 must add both (currency is wholly new to `updateLead`).
- **Step 23 (E2) — CONFIRMED ACCURATE + genuinely required.** `getWonInRangePerAe` (`src/lib/server/db/dashboard.ts:182-209`) uses `.selectDistinctOn([crmLeadHistory.leadId])` + `.innerJoin(crmLeads)` with WHERE `field='stage', newValue='won', isNull(deletedAt)` and has NO `eq(crmLeads.stage,'won')` guard — proving both that won carries the same latent over-count and that E2's `eq(crmLeads.stage,'done')` guard is a real correctness fix. `moveLeadStage`'s generic `else` branch (leads.ts:1307-1321) nulls `wonOrgName/dealValueCents/currency/signedAt/lostReason` but NOT `revenueCents`, so a done→moved-out lead keeps its `revenueCents` + stale done-transition history row — exactly the AC6 double-count E2 closes.

No high-risk claim from cycle 0 drifted: migration numbering, auth-gate resolution, stage-count regression, Stage auto-derive, `moveLeadStage` branch structure, and `getRevenuePerAe` shape all remain correct against source. No NEW fixable gap found on the fresh-eyes pass (financial + auth + migration surface); only 3 minor phase-report observations recorded in Open Gaps.

### Test gates (C3 table — additive; legacy line form below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `done` is a valid stage ordered immediately after `live` | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` — LEAD_STAGES contains `done`, length 8, indexOf('done')===indexOf('live')+1 | A |
| AC2 | move-to-Done requires revenue + currency | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` — moveStageSchema done branch: valid accepted, missing revenue rejected, negative rejected | A |
| AC7 | existing `deal_value_cents` behavior unaffected | Fully-Automated | `bun run test:unit:ci` — existing moveLeadStage won-branch tests pass unchanged | A |
| AC3 | Done transition persists revenue+currency, writes audit rows, leaves won/lost metadata | Hybrid | `bun run test:unit -- src/tests/dashboard-db.spec.ts` / moveLeadStage DB test — precondition: live Postgres (`DATABASE_URL`); self-skips via `SKIP_DB` otherwise | D |
| AC5 | dashboard shows per-AE revenue total for range | Hybrid | `bun run test:unit -- src/tests/dashboard-db.spec.ts` — getRevenuePerAe correct sums; precondition: live Postgres; self-skips otherwise | D |
| AC6 | only leads CURRENTLY in `done` contribute (Won-with-revenue excluded; done→moved-out excluded, E2) | Hybrid | `bun run test:unit -- src/tests/dashboard-db.spec.ts` — exclusion cases incl. current-stage-guard; precondition: live Postgres; self-skips otherwise | D |
| AC4 | revenue editable inline on `/leads/[id]` without re-triggering Done, + audit-logged (E1) | Agent-Probe | Agent-probe walkthrough (display→edit→save→persist, Escape cancel); audit-row via `updateLead` tracked array; walkthrough blocked by shared Playwright auth fixture | D |

gap-resolution legend: A = proven now; B = fixed in this plan's checklist; C = deferred to named later phase; D = backlog test-building stub (named residual, keep-active).

C-4 reconciliation: `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the Hybrid self-skip and Agent-Probe block are carried as gap-resolution D residuals with backlog stubs, never as the reason a behavior "passes."

Legacy line form (retained for existing consumers):
- schema/enum + Zod sync (AC1): Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- move-stage done branch (AC2): Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- won-branch regression (AC7): Fully-automated: `bun run test:unit:ci`
- moveLeadStage done DB persist + history (AC3): hybrid: `bun run test:unit -- src/tests/dashboard-db.spec.ts` + precondition live Postgres (DATABASE_URL); self-skips via SKIP_DB
- getRevenuePerAe sums (AC5) + exclusion incl. current-stage guard (AC6): hybrid: `bun run test:unit -- src/tests/dashboard-db.spec.ts` + precondition live Postgres; self-skips
- inline revenue editor + audit row (AC4): agent-probe: display→edit→save→persist walkthrough + updateLead tracked-array audit; walkthrough blocked by shared Playwright auth fixture

Failing stub (AC1):
test("should order done immediately after live in LEAD_STAGES", () => { throw new Error("NOT IMPLEMENTED — TDD stub: LEAD_STAGES contains 'done', length 8, indexOf('done')===indexOf('live')+1") })

Failing stub (AC2):
test("should require revenue and currency on move-to-done", () => { throw new Error("NOT IMPLEMENTED — TDD stub: moveStageSchema done branch accepts valid, rejects missing revenue, rejects negative revenue") })

Failing stub (AC7):
test("should leave deal_value_cents behavior unaffected", () => { throw new Error("NOT IMPLEMENTED — TDD stub: existing moveLeadStage won-branch tests pass unchanged after done branch added") })

### Dimension findings

- Infra fit: PASS — Migration numbering verified CLEAN against actual state: journal last idx = 34 (`0034_user_color`), highest `.sql` = `0034`; next generated = `0035` exactly as the plan assumes. The untracked git state of `0033_name_split_first_last.sql` is cosmetic — drizzle-kit reads the journal (idx 33 registered), not git, so it does not affect numbering. `integer` is imported in schema.ts; the `currency` column ALREADY exists on `crm_leads` (`text('currency').default('PHP')`). All test/build commands exist and are exact (`bun run check`, `bun run lint`, `bun run test:unit:ci`, `bun run db:generate`). Plan-artifact validator: 0 failures / 0 warnings.
- Test coverage: CONCERN — AC1/AC2/AC7 Fully-Automated (solid). AC3/AC5/AC6 Hybrid self-skip via the confirmed `SKIP_DB = !DATABASE_URL` convention (pre-accepted known-gap class, same as manager-dashboard/calendar). AC4 Agent-Probe blocked by the shared Playwright auth fixture. No behavior rests on Known-Gap alone; residuals carry backlog stubs. Net gate stays CONDITIONAL until a live-DB CI harness + auth fixture exist.
- Breaking changes: PASS — `schemas.spec.ts:39` `LEAD_STAGES.length).toBe(7)` correctly identified in plan step 7 for update to 8 (confirmed present — not a surprise). `Stage = (typeof LEAD_STAGES)[number]` at `types/index.ts:20` CONFIRMED auto-derives — no manual type edit needed. `StageKey = (typeof STAGE_TOKENS)[number]['key']` also auto-derives (plan step 5 adds the `done` token, so this propagates). Enum add is additive/non-destructive; won/lost/generic moveLeadStage branches preserved by the dedicated `done` branch.
- Security surface: PASS (critical) — Auth-gate resolution CONFIRMED CORRECT against actual source. `PATCH /api/leads/[id]` runs `leadUpdateSchema.safeParse` → `getLead(id, user.id, user.role)` (visibility-scoped: a rep who cannot see the lead gets null → 404) → `canEditLead(me, existing)` (manager→true; unowned→true; else `ownerId===user.id` else 403) → `updateLead`. Sending `{ name: lead.name, revenueCents, currency }` runs the SAME gate — a rep CANNOT PATCH revenue on a lead they don't own (403). `leadUpdateSchema` requires `name` (min 1) — confirmed — so `name: lead.name` is required to avoid a 400 and does NOT weaken auth (same value already on the page). revenueCents/currency added OPTIONAL → normal edits unaffected. High-risk 5-artifact evidence pack (schema/migration + financial + auth-adjacent PATCH) is REQUIRED before finalize (see E5).
- Section: Group 1 (schema/migration/Zod/type sync) feasibility: PASS — enum order confirmed (`won, live, lost` → insert `done` after `live`); Zod `LEAD_STAGES` order matches. Migration safety CONFIRMED: both statements (`ALTER TYPE … ADD VALUE 'done'` + `ADD COLUMN revenue_cents`) are safe in one PG12+ transaction because neither reads/compares/inserts `'done'` as a value — the "new enum value unusable in same tx" restriction does not apply. Precedent `0021` did the same ADD VALUE.
- Section: Group 2 (move-stage schema + server branch) feasibility: PASS — `moveLeadStage` structure confirmed `if won / else if lost / else (generic clearing that nulls currency/dealValueCents/wonOrgName)`. A dedicated `else if (stage === 'done')` inserted BEFORE the generic `else` (plan step 10) is correct and necessary — the generic branch would clobber currency. History-row block correctly places the `revenue_cents` row alongside won/lost logging (plan step 11). Highest-risk edit: not touching won metadata in the done branch — mitigated by the dedicated branch.
- Section: Group 4 (inline editor + PATCH) feasibility: PASS — `updateLead` currently has NEITHER `revenueCents` NOR `currency` in its input/SET; step 12 must add BOTH (currency is wholly new to `updateLead`, not just revenue). `updateLead` uses the `...(x !== undefined ? { col } : {})` spread idiom — execute must follow that actual pattern (the plan's `=== undefined ? undefined` phrasing is loose but equivalent). E1 audit-trail gap now closed by explicit step 12b (add `revenue_cents` to the `tracked` history array at leads.ts:1090, following the numeric-field tuple pattern).
- Section: Group 5 (getRevenuePerAe + card) feasibility: PASS (was CONCERN) — `getWonInRangePerAe` `.selectDistinctOn([leadId], {...})` shape confirmed; `getRevenuePerAe` mirror (newValue='done', select revenueCents, accumulate cents, skip null ownerId/revenueCents) is feasible. AC6 semantic concern E2 now closed by explicit step 23 current-stage guard (`eq(crmLeads.stage, 'done')`) — confirmed `done` is not terminal so the guard is required, not merely defensive.

### Execute-agent instructions (binding — EXECUTE must follow)

| # | Instruction | Trigger |
|---|---|---|
| E1 | Add `revenue_cents` audit logging to `updateLead`'s `tracked` history array — now a first-class checklist step (step 12b). Follow the exact tuple pattern the numeric fields use at leads.ts:1090: `['revenue_cents', existing.revenueCents!=null?String(existing.revenueCents):null, updated.revenueCents!=null?String(updated.revenueCents):null]`. The existing `changed` filter writes the `crm_lead_history` row only when revenue changed. Repo convention: "deal value changes write a row to crm_lead_history." | Group 4 / step 12b |
| E2 | In `getRevenuePerAe`, add `eq(crmLeads.stage, 'done')` to the WHERE so only leads CURRENTLY in `done` contribute — now folded into the step 23 query spec. Confirmed `done` is NOT terminal (generic `moveStageSchema` branch permits moving out; generic `moveLeadStage` clearing branch does NOT null `revenueCents`), so without the guard a done→moved-out lead keeps its `revenue_cents` and stale done-transition history row and is over-counted. `getWonInRangePerAe` carries the same latent inaccuracy for `won` — note the divergence in the phase report; do NOT retrofit won (out of scope). | Group 5 / step 23 |
| E3 | Locate the `--color-stage-*` CSS variable declaration site (grep `--color-stage-live`; per tokens.ts comment it is `src/lib/styles/tokens.css`) AND verify the Tailwind `bg-stage-*`/`text-stage-*` mapping covers `done`. If any component uses a dynamic `bg-stage-{key}` utility, the `done` variant must be registered or it renders with no color. The board itself uses `stageColor()` (hex) so inline usage is safe; the Tailwind-utility path is the risk. | Group 1 / step 5 |
| E4 | The `dashboard-db.spec.ts` gate: there is NO standalone `getWonInRangePerAe` unit test — won-in-range is exercised via `getDashboardData` composite assertions. Add the `getRevenuePerAe` test as either a standalone `describe.skipIf(SKIP_DB)` DB test OR extend the `getDashboardData` assertions; do not look for a nonexistent mirror test. Include the E2 current-stage-guard exclusion case. | Group 5 / step 26 |
| E5 | Produce the manual-first 5-artifact high-risk evidence pack (`risk-gate.json`, `context-snippets.json`, `verification.json`, `review-decision.json`, `adversarial-validation.json`) in `{task-folder}/harness/` BEFORE reporting DONE. Risk class covers schema/migration + financial data + auth-adjacent PATCH. `adversarial-validation.json` MUST include the scenario "rep PATCHes revenueCents on a lead they don't own → expect 403" and confirm it is ruled out. | Before finalize |
| E6 | Confirm whether `done` should be added to `isClosed()` in `stages.ts` (currently `won||lost`). `done` is a board column (in BOARD_STAGES), so likely NOT closed — but verify no downstream logic mis-treats done as an active stage, and record the decision. | Group 1 / step 6 |

### Open gaps

- AC3 (Done DB persist + history): known-gap — Hybrid self-skips without live Postgres. Backlog stub: `process/features/pipeline/backlog/done-revenue-live-db-harness_NOTE_09-07-26.md` (register at EXECUTE if not already covered).
- AC5/AC6 (getRevenuePerAe DB): known-gap — same live-DB self-skip class; same backlog stub. AC6 now includes the E2 current-stage-guard exclusion case.
- AC4 (inline editor e2e + audit row): known-gap — walkthrough blocked by shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); audit-row assertion is Hybrid live-DB self-skip. Reference existing note, no new stub beyond the live-DB one.
- Minor: WonCaptureModal carries `TODO(#279): restore deal value + currency … once #273 ships`. This plan creates a separate DoneCaptureModal and does NOT restore WonCaptureModal's commented block. Confirm this deferral is intentional (not an oversight) or fold the #279 restoration into scope.
- Minor (fresh-eyes, cycle 1 — non-blocking phase-report notes; NOT gate-changing):
  - **(a) Integer ceiling on `revenue_cents`.** Step 1 types it `integer('revenue_cents')`, capping at 2,147,483,647 cents (₱21,474,836.47) per lead — plausibly exceeded for very large events. This MIRRORS the existing `dealValueCents` integer convention, so it is a pre-existing repo pattern, not introduced here; changing to `bigint` would be scope expansion. Record in the phase report; do NOT change without a scope decision.
  - **(b) Step 11 `revenue_cents` transition-history `oldValue`.** Step 11 hardcodes `oldValue: null` for the Done-transition history row. The won pattern (leads.ts:1350) uses `existing.dealValueCents` for oldValue. For a rare done→out→done re-capture, hardcoded null is slightly less accurate. Minor; Done transitions are typically first-time captures. EXECUTE may mirror won's `oldValue: existing.revenueCents` for consistency — optional refinement, not required.
  - **(c) Inline editor render predicate on stale revenue.** Step 21 renders the inline editor when the lead is in `done` stage OR has a `revenueCents` value. Because E2 keeps `revenueCents` non-nulled on done→out moves (guarded only at the dashboard layer), a lead that left `done` still shows the inline revenue editor. This is a deliberate, permissive choice (lets a user view/correct stale revenue) consistent with how won-metadata is not universally nulled; flagged for EXECUTE awareness, not a correctness FAIL.

### What this coverage does NOT prove

- `bun run test:unit -- src/tests/schemas.spec.ts` (AC1/AC2): proves the stage list + move-stage request schema shape. Does NOT prove the DB enum actually gained `done` (migration apply), that `moveLeadStage` persists revenue, or that the inline editor renders/PATCHes.
- `bun run test:unit:ci` (AC7): proves existing won-branch logic is untouched at unit level. Does NOT prove behavior against a live DB.
- Hybrid gates (AC3/AC5/AC6): self-skip in this env — prove NOTHING here until a live Postgres CI harness runs them. Revenue persistence, history rows (incl. the inline-edit audit row, E1), per-AE sums, the Won-exclusion, and the E2 current-stage-guard exclusion are UNVERIFIED until then.
- Agent-Probe (AC4): the full inline display→edit→save→persist→Escape-cancel interaction and the "Done not re-triggered" invariant are UNVERIFIED until a shared auth fixture or manual walkthrough runs.
- No gate here proves the migration applies cleanly to a live DB (generated-only in this env), nor that E1/E2/E3 were implemented — those are execute-time obligations (E1/E2 now have explicit checklist steps 12b/23).

Gate: CONDITIONAL (TERMINAL — 0 FAILs; PVL cycle 1 complete: the two cycle-0 SUPPLEMENT REQUEST items E1/E2 are RESOLVED — promoted to checklist steps 12b/23 AND source-verified this cycle. NO remaining fixable concerns. The ONLY residuals are the pre-accepted, environment-structural Hybrid live-DB self-skip (AC3/AC5/AC6) + Agent-Probe auth-fixture block (AC4) — not fixable in this plan; each carries a backlog stub. Per the vacuous-green ban, developed behavior resting on Hybrid/Agent-Probe residuals cannot be a terminal PASS, so terminal CONDITIONAL is the correct end state. 6 binding execute-instructions (E1–E6) recorded; E1/E2 now also explicit checklist steps.)
Accepted by: session (autonomous, /goal execution — PVL cycle 1) — RESOLVED this cycle (no longer open concerns): E1 revenue audit-logging (→ checklist step 12b, source-verified), E2 AC6 current-stage guard (→ checklist step 23, source-verified). Accepted residual known-gaps (structural, not fixable here): (1) AC3/AC5/AC6 Hybrid live-DB self-skip — backlog stub `done-revenue-live-db-harness_NOTE_09-07-26.md`; (2) AC4 Agent-Probe auth-fixture block — existing `e2e-auth-bootstrap_NOTE_01-07-26.md`. Accepted binding execute-instructions carried forward: (3) E3 Tailwind stage-color mapping; (4) E4 dashboard test shape; (5) E5 high-risk 5-artifact evidence pack before finalize; (6) E6 done-in-isClosed decision; (7) WonCaptureModal #279 TODO deferral confirmation. Fresh-eyes cycle-1 minor observations (a)/(b)/(c) recorded as phase-report notes only.

## Autonomous Goal Block

```
SESSION GOAL: Done Stage with Post-Event Revenue Tagging (GitHub #273) — add a `done` pipeline stage after Live, capture post-event revenue on the Done transition, edit it inline on the lead detail page, and surface per-AE revenue totals on the manager dashboard.
Charter + umbrella plan: N/A — single COMPLEX plan (process/features/pipeline/active/done-stage-revenue-tagging_09-07-26/done-stage-revenue-tagging_PLAN_09-07-26.md)
Autonomy: /goal autonomous execution — self-decide reversible steps; BLOCKED items → backlog + continue. Hard stop only on irreversible/outward-facing actions without contract instruction.
Hard stop conditions / safety constraints:
- HIGH-RISK class: schema/native-enum migration + new column + financial data (revenue) + auth-adjacent PATCH surface. Produce the manual-first 5-artifact evidence pack (harness/) BEFORE finalize (E5).
- Do NOT apply migration 0035 to any live DB in this env (generate only; deploy-time step).
- Do NOT weaken the canEditLead gate: inline revenue PATCH MUST send `{ name: lead.name, revenueCents, currency }` through the existing leadUpdateSchema/canEditLead path.
- Do NOT touch dealValueCents/wonOrgName in the moveLeadStage `done` branch (use a dedicated branch before the generic clearing branch).
- Reconcile drizzle journal/file alignment before db:generate; accept the generator's chosen number.
Next phase: EXECUTE — start Group 1 (schema + migration + Zod/type sync), then Groups 3/4/5 (parallel-safe after 1+2). Honor E1 (step 12b audit trail) + E2 (step 23 current-stage guard).
Validate contract: inline in plan (## Validate Contract, Gate: CONDITIONAL) — honor binding execute-instructions E1–E6; E1/E2 are explicit checklist steps 12b/23.
Execute start: Fully-auto: `bun run test:unit -- src/tests/schemas.spec.ts` (AC1/AC2), `bun run test:unit:ci` (AC7), `bun run check`, `bun run lint`, `bun run db:generate` | Hybrid (self-skip w/o DATABASE_URL): `bun run test:unit -- src/tests/dashboard-db.spec.ts` (AC3/AC5/AC6) | Agent-probe: inline revenue editor walkthrough (AC4) | high-risk pack: yes (E5)
```
