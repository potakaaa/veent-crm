---
name: plan:competitor-badges-restore
description: "Add shared CompetitorBadge (currentPlatform) to pipeline cards and All Leads grid; GitHub #280"
date: 08-07-26
feature: leads
---

# Competitor Badges — Pipeline + All Leads (GitHub #280)

**Date**: 08-07-26
**Status**: Active — PLAN written, VALIDATE pending

**Complexity**: SIMPLE

**TL;DR:** Create one shared `CompetitorBadge.svelte` (amber chip, renders only when `currentPlatform` is truthy) and drop it into pipeline lead cards (`PipelineBoard.svelte`) and the All Leads grid (`LeadGrid.svelte`). Data is already loaded via `dbRowToLead()`. No schema, no query, no server changes. Unassigned page is left byte-for-byte untouched. 1 new file + 2 edited files.

**Complexity note:** SIMPLE (pure UI wiring; no design decisions remaining).

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | leads |
| 2 | phase | PLAN |
| 3 | session-goal | Restore competitor badges on pipeline + All Leads (GitHub #280) |
| 4 | branch | development |
| 5 | worktree | main |
| 6 | context-group | tests |
| 7 | blast-radius-packages | src/lib/components/shared, src/lib/components/pipeline, src/lib/components/leads |
| 8 | active-plan | process/features/leads/active/competitor-badges-restore_08-07-26/competitor-badges-restore_PLAN_08-07-26.md |
| 9 | test-runner | bun run check \| vitest |
| 10 | validate-contract | pending |

## Goal

Render the competitor (current-platform) badge consistently on all three lead-list surfaces so a rep can see at a glance which competing platform a lead currently uses.

## Scope

**In scope:**
- New shared component `src/lib/components/shared/CompetitorBadge.svelte`.
- Wire it into `PipelineBoard.svelte` (pipeline lead cards).
- Wire it into `LeadGrid.svelte` (All Leads list — single responsive snippet covers desktop + mobile).

**Out of scope (do NOT touch):**
- `src/routes/unassigned/+page.svelte` — keep its existing inline amber chip exactly as-is (explicit user decision, no refactor).
- Lead detail page platform display — already correct.
- Any schema / query / server-side / `dbRowToLead()` change — data is already present on the `Lead` type (`currentPlatform`).
- `competitorNotes` (free-text) — badge is driven by `currentPlatform` only.

## Decisions (locked upstream — do not re-litigate)

1. **DECISION:** Badge data source is `crm_leads.current_platform` → `Lead.currentPlatform` (short label). **WHY:** matches existing Unassigned behavior exactly. **REJECTED:** `competitorNotes` (free-text, wrong shape for a chip).
2. **DECISION:** Badge renders only when `currentPlatform` is truthy. **WHY:** mirrors the Unassigned `{#if l.currentPlatform}` guard. Guard lives inside the component so callers just drop it in.
3. **DECISION:** New shared component (not inline copy) for the 2 new surfaces. **WHY:** matches the `FutureEventsBadge` / `AgeBadge` / `PlatformBadge` / `EventBadge` idiom in the same directory; single source for the 2 new callers.
4. **DECISION:** Unassigned keeps its own inline copy of the identical markup. **WHY:** explicit user decision — no refactor there. Consistency is satisfied via shared `currentPlatform` field + identical markup, not via forcing Unassigned to import the component.
5. **DECISION:** Not a regression fix — git history confirms the badge was never wired on pipeline or All Leads. This is net-new wiring.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/components/shared/CompetitorBadge.svelte` | **NEW** — amber chip, internal `{#if platform}` guard |
| `src/lib/components/pipeline/PipelineBoard.svelte` | Import + render `CompetitorBadge` in the lead card |
| `src/lib/components/leads/LeadGrid.svelte` | Import + render `CompetitorBadge` in the row snippet |

Files read for context (no change): `src/routes/unassigned/+page.svelte` (markup reference, L540-545), `src/lib/components/shared/PlatformBadge.svelte`, `src/lib/components/shared/FutureEventsBadge.svelte`.

## Public Contracts

New component API:

```svelte
<!-- src/lib/components/shared/CompetitorBadge.svelte -->
<script lang="ts">
  let { platform }: { platform?: string | null } = $props();
</script>

{#if platform}
  <span
    class="rounded-[5px] bg-amber-100 px-[6px] py-[2px] font-mono text-[10.5px] font-medium text-amber-700"
    >{platform}</span
  >
{/if}
```

- Prop: `platform?: string | null` (pass `l.currentPlatform` / `c.currentPlatform`).
- Behavior: renders nothing when falsy; renders the amber chip when truthy. Markup is byte-identical to the Unassigned inline chip (unassigned/+page.svelte L541-544).
- No new exported types, no schema, no API surface.

## Blast Radius

- **Files:** 1 new + 2 edited = 3 files, all inside `src/lib/components/` (Svelte view layer only).
- **Packages:** single app, `src/lib/components/{shared,pipeline,leads}`.
- **Risk class:** LOW — presentational only. No schema/auth/API/billing/migration surface. No data flow change (field already loaded).
- **Layout caution (LeadGrid):** the desktop grid uses `cols` = 8-column template (L47) with `lg:contents` wrappers. A new badge MUST NOT introduce a 9th grid cell or it misaligns the header/row grid. Safe placement = nest the badge inside an existing non-`lg:contents` cell (recommended: the organizer/name column beside the `siblings` "events" pill, L107-116) OR inside an already-flattened cell without adding a wrapper. Do not add a standalone `<div class="... lg:contents">` for it.

## Data Flow

`crm_leads.current_platform` → `dbRowToLead()` (`src/lib/server/db/leads.ts:117`) → `Lead.currentPlatform` → already present on the `leads` prop passed to `PipelineBoard` (as `c.currentPlatform`) and `LeadGrid` (as `l.currentPlatform`). No new data enters or exits any component; the badge only reads an existing field. Nothing to transform.

## Implementation Checklist

1. Create `src/lib/components/shared/CompetitorBadge.svelte` with the Public Contracts markup above (Svelte 5 runes: `$props()`; internal `{#if platform}` guard; amber chip classes byte-identical to unassigned/+page.svelte L541-544).
2. In `src/lib/components/pipeline/PipelineBoard.svelte`: add `import CompetitorBadge from '$lib/components/shared/CompetitorBadge.svelte';` to the `<script>` import block (alongside `PlatformBadge` / `EventBadge` imports, ~L2-4).
3. In `src/lib/components/pipeline/PipelineBoard.svelte`: render `<CompetitorBadge platform={c.currentPlatform} />` inside the card's event row (`<div class="mt-1.5 flex items-center gap-1.5">`, L147-152) beside `<EventBadge>` — side-by-side with the existing badge, do not replace or reorder `PlatformBadge`/`EventBadge`/`AppealScoreBadge`.
4. In `src/lib/components/leads/LeadGrid.svelte`: add `import CompetitorBadge from '$lib/components/shared/CompetitorBadge.svelte';` to the `<script>` import block (alongside the other `shared/*Badge` imports, ~L4-7).
5. In `src/lib/components/leads/LeadGrid.svelte`: render `<CompetitorBadge platform={l.currentPlatform} />` inside the organizer/name column beside the `siblings` "events" pill (the flex row at L107-116, inside the non-`lg:contents` name cell) — this covers both desktop and mobile via the single responsive snippet and avoids adding a 9th grid cell to the 8-column template. Do NOT place it as its own `lg:contents` grid cell.
6. Verify the Unassigned page (`src/routes/unassigned/+page.svelte`) is unchanged — its inline chip stays exactly as-is (L540-545).
7. Run the Fully-Automated regression gate (see Verification Evidence): `bun run check` then `bun run test:unit:ci`. Both must stay green.
8. Agent-Probe visual check: run the dev server, view `/pipeline` and `/leads` with a lead whose `currentPlatform` is set, confirm the amber badge renders side-by-side with existing badges; confirm no badge when `currentPlatform` is empty; confirm `/unassigned` is visually unchanged.

## Acceptance Criteria (GitHub #280, verbatim)

- **AC1:** Competitor badges render correctly on the pipeline screen. → `proven by:` Agent-Probe visual check (step 8, pipeline); `strategy:` Agent-Probe.
- **AC2:** Competitor badges render correctly on the All Leads tab. → `proven by:` Agent-Probe visual check (step 8, /leads); `strategy:` Agent-Probe.
- **AC3:** Competitor badges render correctly on the Unassigned Leads page (already true — verify no regression). → `proven by:` Agent-Probe visual check (step 8, /unassigned unchanged) + `bun run check`/`test:unit:ci` no-break; `strategy:` Agent-Probe.
- **AC4:** Badge logic consistent across all three surfaces (same data source, same display rules). → `proven by:` shared `CompetitorBadge` component + shared `currentPlatform` field + byte-identical markup vs Unassigned inline chip (code inspection in EXECUTE); `strategy:` Agent-Probe.
- **AC5:** No regression on other lead list surfaces. → `proven by:` `bun run check` + `bun run test:unit:ci` (full suite stays green) + Unassigned unchanged; `strategy:` Fully-Automated.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 (svelte-check + tsc) | Fully-Automated | AC5 (no type/compile regression); guards AC1–AC4 |
| `bun run test:unit:ci` exits 0 (Vitest full suite) | Fully-Automated | AC5 (no existing unit test breaks) |
| Dev-server visual check `/pipeline` — badge shows when `currentPlatform` set, hidden when empty | Agent-Probe | AC1 |
| Dev-server visual check `/leads` — badge shows beside existing badges, 8-col grid intact | Agent-Probe | AC2 |
| Dev-server visual check `/unassigned` — visually identical to before | Agent-Probe | AC3 |
| Code inspection — shared component + identical markup across surfaces | Agent-Probe | AC4 |
| Component render/click unit test (badge shows/hides by prop) | Known-Gap | AC1/AC2 (residual — see below) |

**Vacuous-green note:** developed behavior (badge render/hide) is proven by Agent-Probe (a real proving strategy), not by Known-Gap. The Known-Gap row is the residual automated-component-render coverage only; its backlog stub is the pre-existing `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md` (no Svelte component-test harness exists in this repo). No new backlog stub required — this class is already recorded. AC1/AC2 gates remain CONDITIONAL on Agent-Probe until a component-test harness lands.

## Test Infra Improvement Notes

(none identified yet — component render coverage blocked by the pre-existing no-Svelte-component-test-harness gap tracked at `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`.)

## Dependencies / Risks

- **Dependency:** `Lead.currentPlatform` already populated by `dbRowToLead()` — confirmed (Unassigned uses it live). No blocker.
- **Risk (LeadGrid grid alignment):** adding a badge as a new grid cell would break the 8-column desktop template. Mitigation: nest in the name column (step 5), never add an `lg:contents` wrapper. Low, fully avoidable.
- **Risk (Unassigned drift):** none if step 6 is honored — do not edit that file.

## Phase Completion Rules

This is a single-session SIMPLE plan (no phases). Completion criteria:

- **CODE DONE** = checklist steps 1-6 applied; `bun run check` and `bun run test:unit:ci` both green (step 7).
- **VERIFIED** = CODE DONE **plus** Agent-Probe visual checks (step 8) confirm badge renders on `/pipeline` and `/leads` and `/unassigned` is unchanged. Until the Agent-Probe visual pass is recorded, mark status CODE DONE, not VERIFIED.
- Do not mark VERIFIED on typecheck/unit-green alone — AC1/AC2 render proof is Agent-Probe, and automated component-render coverage is a recorded Known-Gap.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/leads/active/competitor-badges-restore_08-07-26/competitor-badges-restore_PLAN_08-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written (Gate: CONDITIONAL).
3. **Validate-contract status:** written 08-07-26 (Gate: CONDITIONAL — 1 accepted known-gap residual).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/features/leads/_GUIDE.md`, `process/features/pipeline/_GUIDE.md`, `process/context/tests/all-tests.md`; reference markup at `src/routes/unassigned/+page.svelte` L540-545.
5. **Next step for a fresh agent:** EXECUTE checklist steps 1-8 in order. Test gate commands: `bun run check` and `bun run test:unit:ci` (NOT `bun test`).

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 0/7 — single-package, 3-file presentational blast radius, no schema/API/auth/high-risk surface, one mechanical approach. No dominant fan-out signal.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | No type/compile/unit regression across lead-list surfaces | Fully-Automated | `bun run check` exits 0 AND `bun run test:unit:ci` exits 0 | A |
| AC1 | Competitor badge renders on pipeline card when `currentPlatform` truthy; hidden when falsy | Agent-Probe | Dev-server visual check `/pipeline` (lead with `currentPlatform` set → amber chip beside EventBadge; empty → no chip) | D |
| AC2 | Competitor badge renders in All Leads grid; 8-col desktop grid stays intact | Agent-Probe | Dev-server visual check `/leads` (badge in name column beside events pill; grid alignment unbroken) | D |
| AC3 | Unassigned inline badge unchanged (no regression) | Agent-Probe | Dev-server visual `/unassigned` visually identical + `bun run check`/`test:unit:ci` no-break | A (regression side) |
| AC4 | Badge logic consistent across surfaces (shared component + shared `currentPlatform` field + byte-identical markup) | Agent-Probe | Code inspection in EXECUTE (shared `CompetitorBadge` used on both new surfaces; markup byte-identical to Unassigned L541-544) | A |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to named later phase; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NOT a strategy — it is the named residual row below (automated component-render), carried via gap-resolution D.

Failing stub (Fully-Automated row AC5 — regression gate; no new behavioral test in scope, badge render is Agent-Probe):
```
test("should keep type-check and unit suite green after CompetitorBadge wiring (AC5 regression gate)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `bun run check` && `bun run test:unit:ci`, both exit 0 with no new failures")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Regression (AC5): Fully-automated: `bun run check` && `bun run test:unit:ci` — both exit 0
- Pipeline render (AC1): agent-probe: dev-server `/pipeline` visual — badge shows/hides by `currentPlatform`
- All Leads render (AC2): agent-probe: dev-server `/leads` visual — badge in name cell, 8-col grid intact
- Unassigned no-regression (AC3): agent-probe: dev-server `/unassigned` unchanged (+ automated no-break)
- Consistency (AC4): agent-probe: code inspection — shared component + byte-identical markup
- Automated component-render (AC1/AC2 residual): known-gap: documented — no Svelte component-test harness in repo; backlog stub `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`

Dimension findings:
- Infra fit: PASS — all 3 target files exist (CompetitorBadge.svelte is the intended new file); import anchors and edit targets verified in source; test commands (`bun run check`, `bun run test:unit:ci`) match the real repo commands per `tests/all-tests.md`. No container/port/runtime surface.
- Test coverage: CONCERN — AC5 regression is genuinely Fully-Automated; but developed badge-render behavior (AC1/AC2/AC4) has NO Fully-Automated or Hybrid gate — proven only by manual Agent-Probe visual pass, with automated component-render as a pre-existing documented Known-Gap. Correctly tiered; drives the CONDITIONAL net gate.
- Breaking changes: PASS — no schema/query/API/exported-type change; new component has no public type surface; `c.platform` (PlatformBadge) and `c.currentPlatform` (CompetitorBadge) are distinct fields (no collision); Unassigned explicitly untouched.
- Security surface: PASS — presentational read of an already-loaded field; no auth/billing/data/secret/trust-boundary surface. STRIDE/OWASP: trivially clean.
- Section — Implementation Checklist feasibility: PASS — mechanical feasibility confirmed by source inspection: PipelineBoard imports L2-5, event row `<div class="mt-1.5 flex items-center gap-1.5">` L147 with EventBadge L151; LeadGrid imports L4-9, 8-col template L47, name-column flex row L107-116 nested inside the non-`lg:contents` 2fr name cell L106; Unassigned chip L540-545 byte-identical to Public Contracts markup. Highest-risk edit = LeadGrid grid alignment; the plan's step-5 instruction (nest inside name cell, never add an `lg:contents` wrapper) is unambiguous and verified to add no 9th grid cell.

Open gaps:
- Automated component-render coverage for AC1/AC2 (badge show/hide by prop): known-gap: documented as pre-existing infra limitation — no Svelte component-test harness exists; tracked at `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`. Out of this plan's blast radius; not fixable by a PVL supplement. Excluded from FAIL/CONCERN count per known-gap exclusion; accepted as documented residual.
- Minor (non-blocking note): plan cites import line-anchors "~L2-4" (pipeline) / "~L4-7" (LeadGrid); actual are L2-5 / L4-9. Plan anchors semantically ("alongside PlatformBadge/EventBadge imports", "alongside other shared/*Badge imports") so the drift is harmless — execute-agent should use the semantic anchor, not the exact line number.

What this coverage does NOT prove:
- `bun run check` + `bun run test:unit:ci` (AC5): proves no TypeScript/Svelte-check or unit regression and that the new component compiles; does NOT prove the badge visually renders, positions correctly, or hides on falsy `currentPlatform` — those are Agent-Probe only.
- Agent-Probe `/pipeline` (AC1): proves a human/agent judged the amber chip visible beside existing badges; does NOT provide a deterministic CI assertion of render/hide (that is the documented Known-Gap).
- Agent-Probe `/leads` (AC2): proves visual grid alignment held for the checked viewport(s); does NOT prove every breakpoint or automatically assert the 8-col template is unbroken.
- Agent-Probe `/unassigned` (AC3): proves the page looked unchanged to the reviewer; does NOT provide a pixel-diff or automated snapshot guarantee.
- Code inspection (AC4): proves markup byte-identity and shared-component reuse by reading source; does NOT prove runtime equivalence under all data states.

Gate: CONDITIONAL (0 FAILs; 1 concern — badge-render proven by Agent-Probe only, automated component-render is a pre-existing documented Known-Gap; accepted as residual. AC5 regression Fully-Automated.)
Accepted by: session (VALIDATE, on the delegating orchestrator's pre-acceptance that the no-Svelte-component-test-harness gap is known and pre-existing) — accepted concern: "AC1/AC2/AC4 badge-render behavior has no Fully-Automated/Hybrid proving gate; proven via manual Agent-Probe visual pass; automated component-render coverage deferred to backlog component-test-harness-decision_NOTE_07-07-26."

## Autonomous Goal Block

```
SESSION GOAL: Restore competitor (current-platform) badges on pipeline cards + All Leads grid (GitHub #280)
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: standard interactive; CONDITIONAL gate accepted (documented known-gap, no PVL supplement needed — gap is out-of-scope infra). Hard stop only on irreversible/outward-facing action.
Hard stop conditions / safety constraints:
- Do NOT edit src/routes/unassigned/+page.svelte — its inline amber chip stays byte-for-byte as-is (explicit user decision).
- Do NOT add a 9th grid cell to LeadGrid's 8-col desktop template — nest the badge inside the existing name-column flex row (L107-116, inside the non-lg:contents 2fr name cell L106); never add an lg:contents wrapper for it.
- No schema/query/server/dbRowToLead change — currentPlatform is already loaded.
Next phase: EXECUTE — process/features/leads/active/competitor-badges-restore_08-07-26/competitor-badges-restore_PLAN_08-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL)
Execute start: checklist steps 1-8 in order → Fully-Automated gates `bun run check` && `bun run test:unit:ci` (both exit 0) | Agent-Probe: /pipeline, /leads render + /unassigned unchanged | high-risk pack: no
```
