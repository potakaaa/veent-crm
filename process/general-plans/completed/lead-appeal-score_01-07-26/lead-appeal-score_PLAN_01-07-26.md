---
name: plan:lead-appeal-score
description: SIMPLE plan — auto-calculated Lead Appeal Score (derived, unpersisted) with shared badge + appeal sort across leads/unassigned/pipeline views
date: 01-07-26
feature: leads
---

# Lead Appeal Score — Implementation Plan (SIMPLE)

**Date**: 01-07-26
**Status**: VALIDATED — Gate CONDITIONAL; approved for EXECUTE with documented, accepted gaps
**Complexity**: SIMPLE (one session, single plan artifact, ~9 ordered steps)
**Feature**: leads (written to `general-plans/active/` — 0 prior artifacts in the feature folder)
**Decision source**: approved RESEARCH findings + INNOVATE Decision Summary (encoded, not relitigated)

**TL;DR:** Add a pure, unpersisted `computeAppealScore()` function (0–100, two 50/50 sub-scores) derived from three date fields, add 2 additive-nullable columns to `crm_leads` (+ one Drizzle migration), seed mock data with edge cases, render a shared `AppealScoreBadge.svelte` in all 5 lead views (list, detail card, unassigned, pipeline, review), and add `?sort=appeal` + a `SortToggle.svelte` control to the 3 list/pipeline views. No score is ever stored — it recomputes at render/sort time, so it is never stale. **VALIDATE has run — Gate: CONDITIONAL (2 concerns fixed in-plan + on-record); safe to EXECUTE.**

## Overview

Reps need to know which leads to chase first. This feature computes an appeal score that is highest when a lead was reached out to soon after it was announced (early-mover advantage) AND the event is still 2+ months away (enough runway to close). The score is a pure function of three date fields, computed at render/sort time — never persisted — so it updates automatically whenever any date changes. It shows as a shared badge on every lead view, and the list/unassigned/pipeline views gain an appeal-score sort. Context read for this plan: `process/context/all-context.md`, `process/context/tests/all-tests.md`.

---

## Goals

1. Auto-calculate a 0–100 appeal score that helps reps prioritize leads, higher when reach-out was close to announcement AND event still has 2+ months runway.
2. Score derives purely from existing/new date fields — never persisted, so it auto-updates whenever any date field changes.
3. Score visible on the lead card and the lead list view (shared badge component).
4. Unassigned ("Up for Grabs") and pipeline views support sorting by appeal score.

## Scope

**In scope:** 2 additive-nullable schema columns + 1 migration; pure scoring function + unit tests; mock-data extension with edge cases; shared score badge; badge wired into 5 view sites (list, detail card, unassigned, pipeline, review); `?sort=appeal` in 3 load functions + a shared sort-toggle control.

**Out of scope (documented decisions, not gaps):**
- **No score persistence.** Score is a pure render/sort-time function (INNOVATE decision 3). Nothing to cache, nothing to backfill, nothing to invalidate.
- **No `crm_lead_history` audit rows for score changes.** The audit trail (schema.ts ~207-222) is keyed to a human `actorUserId` field change (stage/owner/deal-value). The appeal score is derived and has no human actor — it does not fit that table's pattern. Confirmed NOT applicable. This is a decision, not a missing feature.
- **No Zod schema / form changes.** `leadFormSchema` (`src/lib/zod/schemas.ts` ~53-63) is NOT touched — acceptance criteria require only *display + sort* of the derived score. `announcedAt`/`firstReachedOutAt` are app/ingest-populated (`firstReachedOutAt` app-maintained on first activity, mirroring `lastActivityAt`), not v1 form inputs. Mock seed rows provide the demo/edge-case data instead of a manual-entry UI. If a future milestone needs manual date entry, that is a separate plan.
- **No sort control on `review/` view.** Review gets the display badge only (INNOVATE decision 7); the sorting requirement names unassigned + pipeline + leads list only.

---

## Touchpoints

Exact files, create vs modify, with the change:

| # | File | Action | Change |
|---|---|---|---|
| 1 | `src/lib/server/db/schema.ts` | modify | In `crmLeads` (table starts ~line 114): add `announcedAt: date('announced_at')` (nullable) and `firstReachedOutAt: timestamp('first_reached_out_at', { withTimezone: true })` (nullable), near `eventDate` (~136) / `lastActivityAt` (~150). `date` + `timestamp` are already imported/used — no new import needed. No index (sort is over in-memory mock arrays for v1). |
| 2 | `drizzle/` (generated) | create | New migration file from `bun run db:generate` (additive `ADD COLUMN ... NULL` for both columns — no backfill, no data-loss risk; next file is `0001_*`, existing is `0000_medical_betty_ross.sql`). Do NOT hand-edit. Do NOT touch Better Auth tables. |
| 3 | `src/lib/appeal-score.ts` | create | Pure module exporting `computeAppealScore(eventDate, announcedAt, firstReachedOutAt, now?)` + helpers `diffDays`, `clamp`, and `appealTier(score): 'high'\|'mid'\|'low'\|'none'`. Takes primitive date args (string \| Date \| null), returns `number \| null`. NO `db` import — safe for `$lib` (client+server importable). |
| 4 | `src/tests/appeal-score.spec.ts` | create | Vitest unit spec covering the formula (see Verification Evidence for the exact case matrix). |
| 5 | `src/lib/server/mock.ts` | modify | Extend `MockLead` type (~26-37) with `eventDate: string \| null`, `announcedAt: string \| null`, `firstReachedOutAt: string \| null` (NOTE: confirmed `MockLead` does NOT currently have `eventDate` — all 3 fields are new). Add these 3 fields to all 9 `MOCK_LEADS` rows (~39-49), including ≥2 deliberately null/edge cases (e.g. `l-8`/`l-9` with `announcedAt: null` → "Not enough data"; one row with `firstReachedOutAt: null` but both other dates set → still scores via delay-so-far; one near-event and one long-delay row to exercise low scores). |
| 6 | `src/lib/components/AppealScoreBadge.svelte` | create | Props: `score: number \| null`. Renders numeric badge with color by `appealTier()`; `null` → gray "—" / "Not enough data" badge. Optional tooltip with sub-score breakdown. Svelte 5 runes only. Markup is badge-only (NOT a LeadCard). |
| 7 | `src/lib/components/SortToggle.svelte` | create | Minimal control: reads current `sort` value (prop), renders a link/button toggling `?sort=appeal` vs default (preserves existing query params like `q`). Svelte 5 runes only. |
| 8 | `src/routes/leads/+page.svelte` | modify | Table row (~47-66, `{#each data.leads as lead}`): render `<AppealScoreBadge score={lead.appealScore} />`; mount `<SortToggle sort={data.sort} />` in the list header. |
| 9 | `src/routes/leads/+page.server.ts` | modify | Read `url.searchParams.get('sort')`; map each lead to include `appealScore` via `computeAppealScore`. When `sort === 'appeal'`: sort by score desc with `null` scores forced to bottom. Else keep existing `lastActivityAt` desc default. Return `sort` too. Currently returns `{ leads, q }` — add `appealScore` per lead + `sort`. |
| 10 | `src/routes/unassigned/+page.svelte` | modify | Flex list row (~15-25, `{#each data.leads as lead}`): render badge; mount `<SortToggle>`. |
| 11 | `src/routes/unassigned/+page.server.ts` | modify | Add `url` param to `load` (currently takes none); add `appealScore` to each lead; `?sort=appeal` → score desc, null bottom; default → current insertion order. |
| 12 | `src/routes/pipeline/+page.svelte` | modify | Kanban card (~21-26, `{#each col.leads as lead}`): render badge; mount `<SortToggle>`. |
| 13 | `src/routes/pipeline/+page.server.ts` | modify | Add `url` param to `load` (currently takes none); returns `{ columns }` (grouped by stage) — add `appealScore` per lead; `?sort=appeal` → sort **within each stage column** by score desc, null bottom; default → current order. |
| 14 | `src/routes/review/+page.svelte` | modify | Flex list row (~15-22, `{#each data.leads as lead}`): render badge only. **No SortToggle.** |
| 15 | `src/routes/review/+page.server.ts` | modify | CONFIRMED PRESENT (returns `{ leads: MOCK_LEADS.filter(l => l.needsReview) }`). Add `appealScore` mapping per returned lead (display-only; no `?sort`). |
| 16 | `src/routes/leads/[id]/+page.server.ts` | modify | **[Added by VALIDATE — was missing]** Lead-detail ("lead card") server load. CONFIRMED PRESENT (returns `{ lead, activities }` via `MOCK_LEADS.find`). Add `appealScore` to the returned `lead` (or return alongside) so the detail card can render the badge. Display-only; no sort. |
| 17 | `src/routes/leads/[id]/+page.svelte` | modify | **[Added by VALIDATE — was missing]** Lead-detail card view (renders single lead header ~line 13-15). Mount `<AppealScoreBadge score={data.lead.appealScore} />` in the header row next to the stage badge. This satisfies Goal 3 / Acceptance "badge renders on lead **card**" (distinct from the list). |

---

## Public Contracts

- **`computeAppealScore(eventDate, announcedAt, firstReachedOutAt, now = today())` → `number | null`** — new pure public function in `$lib/appeal-score`. Primitive date args (string | Date | null) so it serves both `MockLead` and future `CrmLead` unchanged. Returns `null` when `eventDate` OR `announcedAt` is missing (UNSCORED — distinct from 0).
  ```text
  earlyMoverScore = clamp(50 - (daysToReachOut/30)*50, 0, 50)   // 0-day delay=50, →0 at 30d
  runwayScore     = daysToEvent <= 0 ? 0 : clamp((daysToEvent/60)*50, 0, 50)  // 60d+ =50, →0 at event
  return Math.round(earlyMoverScore + runwayScore)              // 0–100
  daysToReachOut  = firstReachedOutAt ? diff(firstReachedOutAt, announcedAt) : diff(now, announcedAt)
  ```
- **`appealTier(score)` → `'high' | 'mid' | 'low' | 'none'`** — concrete thresholds (plan-picked): `high` ≥ 67 (green), `mid` 34–66 (yellow/amber), `low` ≤ 33 (red/neutral), `none` = `null` (gray).
- **`AppealScoreBadge` prop contract:** `{ score: number | null }`. No DB, no fetch — pure presentational.
- **`SortToggle` prop contract:** `{ sort: string | null }`. Emits navigation to `?sort=appeal` / default; preserves other params.
- **Schema columns:** `crm_leads.announced_at` (date, null), `crm_leads.first_reached_out_at` (timestamptz, null). Additive/nullable — no consumer breaks; real queries not yet wired (v1 leads-CRUD consumes them later).
- **URL contract:** `?sort=appeal` is additive and non-breaking. Absent/unrecognized `sort` → today's exact behavior (leads: `lastActivityAt` desc; unassigned/pipeline: current order).

---

## Blast Radius

- **Scope:** 17 touchpoints — 4 create, 13 modify. Single app (SvelteKit), no multi-package fan-out.
- **Files by area:** schema (1) + 1 generated migration; scoring module (1) + spec (1); mock data (1); 2 shared components (2); 5 view `.svelte` files (list, detail card, unassigned, pipeline, review); 4 `+page.server.ts` loads (leads, unassigned, pipeline, review + detail card).
- **Risk class:** LOW. Additive-nullable schema change (no destructive migration, no backfill, no Better Auth tables). No auth/billing/API-contract/secrets surface. Sorting change is strictly additive and defaults to current behavior. Pure function is fully unit-testable and side-effect-free.
- **Not touched (confirmed):** `src/lib/zod/schemas.ts` (no form change — justified above), `crm_lead_history` (no audit rows — justified above), `crm_activities` (score derives from stored dates, not live `MIN(occurredAt)`).

---

## Verification Evidence

Test context chain loaded (`process/context/tests/all-tests.md`); existing blast-radius test file discovered (`src/tests/schemas.spec.ts`, vitest). Commands are exact repo commands. **NOTE (VALIDATE correction):** `test:unit` maps to `vitest` (watch mode) in `package.json` — the `--run` flag lives only in the `test` script. All Fully-Automated unit gates below therefore use `bun run test:unit -- --run …` so they exit deterministically.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit -- --run src/tests/appeal-score.spec.ts` — both-max dates → 100 | Fully-Automated | Highest score when reach-out close to announce AND 2+ months runway (proven by: appeal-score.spec "both-max → 100") |
| Same suite — near-event date → low score (runwayScore→0) | Fully-Automated | Near event date lowers score (proven by: appeal-score.spec "near-event → low") |
| Same suite — long reach-out delay → low score (earlyMoverScore→0) | Fully-Automated | Long delay before reach-out lowers score (proven by: appeal-score.spec "long-delay → low") |
| Same suite — `eventDate` null OR `announcedAt` null → returns `null` | Fully-Automated | Unscoreable leads render distinct "Not enough data", not 0 (proven by: appeal-score.spec "missing-dates → null") |
| Same suite — `firstReachedOutAt` null, other 2 set → still scores via delay-so-far | Fully-Automated | Score computes before reach-out using delay-so-far (proven by: appeal-score.spec "no-reachout → decaying") |
| Same suite — boundaries: exactly 30-day delay=0 earlyMover, exactly 60-day runway=50, event in past→0 runway | Fully-Automated | Formula boundary correctness (proven by: appeal-score.spec "boundaries") |
| `bun run check` (svelte-check + tsc) | Fully-Automated | Schema columns, new module, component props, updated loads/views all type-check (proves additive columns + contracts wire correctly) |
| `bun run db:generate` produces one additive migration with 2 `ADD COLUMN ... NULL` and no other diff | Fully-Automated | Migration is additive/nullable, no backfill risk (proven by: generated SQL inspection) |
| Manual/agent-probe: load leads/detail/unassigned/pipeline/review views, confirm badge renders with correct color tiers + null "Not enough data" badge | Agent-Probe | Score visible on lead card + list view (proven by: visual probe — no e2e spec exists yet, see Test Infra Notes) |
| Manual/agent-probe: append `?sort=appeal`, confirm descending order with null-score leads at bottom in all 3 views (pipeline sorts within each column); remove param → default order restored | Agent-Probe | Unassigned + pipeline sortable by appeal; additive non-breaking default (proven by: visual probe) |

**Failing stubs (TDD red-first, for EXECUTE — not written to disk during PLAN/VALIDATE):**
```text
test("both-max dates → 100", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: both-max → 100") })
test("missing eventDate or announcedAt → null", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: missing-dates → null") })
test("firstReachedOutAt null but other dates set → scores via delay-so-far", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: no-reachout → decaying") })
test("boundaries: 30-day delay, 60-day runway, past event", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: boundaries") })
```

## Test Infra Improvement Notes

- No Playwright e2e specs exist in the repo yet (`test:e2e` is configured but has zero specs). The two badge-render / sort-order gates are Agent-Probe today. A future improvement: add a Playwright spec `e2e/appeal-score.spec.ts` asserting badge presence + `?sort=appeal` DOM order to promote those two Agent-Probe gates to Fully-Automated. Recorded as a known test-infra gap, not a blocker for this SIMPLE plan.
- No unit tests yet for `src/lib/server/` logic generally; this plan adds the first `src/lib/` pure-function spec, a good precedent.

---

## Implementation Checklist

1. **Schema:** add `announcedAt: date('announced_at')` and `firstReachedOutAt: timestamp('first_reached_out_at', { withTimezone: true })` (both nullable) to `crmLeads` in `src/lib/server/db/schema.ts` (imports already present). Run `bun run db:generate`; verify the migration is 2 additive nullable `ADD COLUMN`s only.
2. **Scoring function:** create `src/lib/appeal-score.ts` with `computeAppealScore`, `diffDays`, `clamp`, `appealTier`. Pure, primitive args, no `db` import.
3. **Unit tests:** create `src/tests/appeal-score.spec.ts` covering: both-max (100), near-event (low), long-delay (low), both-missing (null), only-reached-out-missing (scores via delay-so-far), boundaries (30-day delay, 60-day runway, past event). Run `bun run test:unit -- --run src/tests/appeal-score.spec.ts` → green.
4. **Mock data:** extend `MockLead` type + all 9 `MOCK_LEADS` rows in `src/lib/server/mock.ts` with `eventDate`/`announcedAt`/`firstReachedOutAt` (all 3 are new fields), including ≥2 null/edge cases and near-event + long-delay rows.
5. **Badge component:** create `src/lib/components/AppealScoreBadge.svelte` (score number + tier color + null "Not enough data" state, optional breakdown tooltip).
6. **Wire badge into 5 views:** `leads/+page.svelte` (table row), `leads/[id]/+page.svelte` (detail card header), `unassigned/+page.svelte` (flex row), `pipeline/+page.svelte` (kanban card), `review/+page.svelte` (flex row). Ensure each view's load supplies `appealScore` — add score mapping to `leads/+page.server.ts`, `unassigned/+page.server.ts`, `pipeline/+page.server.ts`, `review/+page.server.ts`, AND `leads/[id]/+page.server.ts` (all confirmed present).
7. **Sort control:** create `src/lib/components/SortToggle.svelte`; mount in leads, unassigned, pipeline views (NOT review, NOT detail card).
8. **Sorting in loads:** update `leads/+page.server.ts`, `unassigned/+page.server.ts`, `pipeline/+page.server.ts` to map `appealScore` per lead and honor `?sort=appeal` (score desc, null bottom; pipeline sorts within each column; unassigned + pipeline loads must add the `url`/`{ url }` param — they currently take none); default path unchanged.
9. **Verify:** `bun run check` → clean; `bun run test:unit -- --run` → green; agent-probe the badge (all 5 views) + `?sort=appeal` order across the 3 sortable views.

## Phase Completion Rules

This is a SIMPLE single-phase plan. The phase is complete only when ALL hold:

- All 9 checklist steps done and every file in Touchpoints changed as described.
- `bun run test:unit -- --run src/tests/appeal-score.spec.ts` green (all 6 formula cases pass).
- `bun run check` clean (type-check passes with the 2 new columns + new module/components).
- `bun run db:generate` produced exactly one additive nullable migration; no other schema diff.
- Both Agent-Probe gates (badge render on all 5 views + `?sort=appeal` ordering) observed and recorded.
- Code-only completion is `CODE DONE`, not `VERIFIED`. Promote to `✅ VERIFIED` only after the user confirms the badge + sort behave correctly in the running app.

## Acceptance Criteria

- [ ] `computeAppealScore` returns 100 for both-max, low for near-event/long-delay, `null` for missing `eventDate`/`announcedAt` — all covered by passing vitest.
- [ ] `crm_leads` has 2 new nullable columns via one additive migration; `bun run check` clean.
- [ ] Appeal badge renders on lead card (detail) + list + unassigned + pipeline + review, with a distinct null state.
- [ ] `?sort=appeal` sorts leads/unassigned/pipeline by score desc with null-score leads at bottom; default order unchanged when param absent.
- [ ] No score persisted anywhere; no `crm_lead_history` rows written for score; no Zod/form changes.

## Dependencies, Risks, Rollback

- **Dependencies:** none external. `db:generate` needs no live DB; `db:push`/`db:migrate` (needing `DATABASE_URL`) are NOT required for the mock-driven v1 build and unit gates.
- **Risks:** LOW. Only risk is a sort helper mis-ordering null scores — covered by the agent-probe gate + the null-return unit case. Additive schema cannot break existing rows.
- **Rollback:** revert the 17 touchpoints + drop the generated migration file (columns are unused by real queries, so dropping is safe). No data migration to undo.

---

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals present (S2 schema surface — additive-nullable/low-risk; S7 5+ files). LOW-risk SIMPLE single-package plan; validation dimensions are fully independent with no mid-run coordination needed → sequential/lightweight fan-out fits (dominant signal: file count, not risk). Matches the plan's own phase-end recommendation.

Test gates (5-column — additive; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Scoring formula correct (both-max→100, near-event/long-delay→low, missing→null, no-reachout→decaying, boundaries) | Fully-Automated | `bun run test:unit -- --run src/tests/appeal-score.spec.ts` exits 0 (6 cases) | B — spec added by this plan's checklist step 3 |
| AC2a | 2 additive-nullable columns + all contracts type-check | Fully-Automated | `bun run check` exits 0 | A — proven at EXECUTE |
| AC2b | Migration is additive/nullable only (2× `ADD COLUMN ... NULL`, no other diff) | Fully-Automated | `bun run db:generate` produces one `0001_*.sql`, inspect for 2 ADD COLUMN NULL | A — proven at EXECUTE |
| AC3 | Badge renders on all 5 views (list, detail card, unassigned, pipeline, review) with distinct null state + correct tier colors | Agent-Probe | Load each view; confirm badge + gray "Not enough data" for null rows | D — backlog e2e stub (no Playwright specs exist yet) |
| AC4 | `?sort=appeal` sorts desc with null at bottom (pipeline within each column); absent param → default order | Agent-Probe | Append/remove `?sort=appeal` on leads/unassigned/pipeline; observe order | D — backlog e2e stub |
| AC5 | No persistence, no `crm_lead_history` rows, no Zod/form changes | Fully-Automated | `bun run check` + grep: no writes to score, no history insert, `src/lib/zod/schemas.ts` unchanged | A — proven at EXECUTE + review |

gap-resolution legend: A — proven now/at EXECUTE; B — gate added by this plan's checklist; C — deferred to named later phase; D — backlog test-building stub (named residual; keep-active).

C-4 reconciliation: `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here; Hybrid n/a). Known-Gap is never a strategy — the absent e2e specs are carried as gap-resolution D (named residual), not as a strategy that proves a behavior.

Failing stub (AC1 — Fully-Automated row):
```text
test("both-max dates → 100", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: both-max → 100") })
test("missing eventDate or announcedAt → null", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: missing-dates → null") })
test("firstReachedOutAt null but other dates set → scores via delay-so-far", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: no-reachout → decaying") })
test("boundaries: 30-day delay, 60-day runway, past event", () => { throw new Error("NOT IMPLEMENTED — TDD stub for: boundaries") })
```

Legacy line form (retained for existing consumers):
- Scoring formula: Fully-automated: `bun run test:unit -- --run src/tests/appeal-score.spec.ts`
- Type-check + contracts: Fully-automated: `bun run check`
- Migration additivity: Fully-automated: `bun run db:generate` + inspect `drizzle/0001_*.sql`
- Badge render (5 views): agent-probe: load each view, confirm badge + null state
- Sort behavior (3 views): agent-probe: toggle `?sort=appeal`, confirm desc + null-bottom + default restore
- e2e DOM assertions: known-gap: documented — no Playwright specs exist yet; backlog stub

Dimension findings:
- Infra fit: PASS — vitest 4 + svelte-check + drizzle-kit all present; `date`/`timestamp` already imported in schema.ts; `eventDate` (nullable date) already exists at line 136; new columns are mechanically trivial. Single package, no container/worker/proxy surface.
- Test coverage: CONCERN (fixed in-plan) — `test:unit` = `vitest` (watch mode); Fully-Automated gate must use `--run` to exit deterministically. Corrected in all gate commands. Residual: badge/sort proven by Agent-Probe only (no e2e specs) — documented known-gap, acceptable for SIMPLE.
- Breaking changes: PASS — `?sort=appeal` additive with default preserved (leads default `lastActivityAt` desc; unassigned/pipeline current order); 2 additive-nullable columns break no consumer; no persisted score.
- Security surface: PASS — no auth/billing/permission/secret/trust-boundary surface; `computeAppealScore` is a pure side-effect-free function; no evidence pack required.
- Section 1 (schema + migration): PASS — additive nullable, no backfill, no NOT NULL, no Better Auth tables; next migration `0001_*`. Mechanically clean.
- Section 2 (scoring fn + spec): PASS — pure module, primitive args, no `db` import; 6-case matrix covers formula + boundaries + null path.
- Section 3 (mock data): PASS — confirmed `MockLead` has no `eventDate` today; plan adds all 3 date fields with edge cases. No collision.
- Section 4 (badge + view wiring): CONCERN (fixed in-plan) — lead detail card `leads/[id]/+page.svelte`/`+page.server.ts` were MISSING from touchpoints despite Goal 3 + AC naming the "lead card" distinct from the list. Added as touchpoints 16–17; review load added as touchpoint 15 (was conditional, confirmed present). Highest-risk edit: pipeline sort-within-column + null-bottom — mitigate with the null-return unit case + agent-probe.
- Section 5 (sort control + loads): PASS — 3 target loads confirmed; `unassigned`/`pipeline` loads currently take no `url` param (plan now notes the required addition); URL contract additive.

Open gaps: e2e DOM assertions for badge presence + `?sort=appeal` ordering — known-gap: no Playwright specs exist in repo yet (`test:e2e` configured, zero specs). Carried as Agent-Probe now + backlog test-building stub (gap-resolution D). Not a blocker for this SIMPLE plan.

What this coverage does NOT prove:
- `bun run test:unit -- --run src/tests/appeal-score.spec.ts` proves the pure formula (numbers/null) only — it does NOT prove the badge renders, colors map to tiers, or the tooltip shows; those are Agent-Probe.
- `bun run check` proves types/props wire and columns compile — it does NOT prove runtime sort order, null-bottom placement, or query-param preservation.
- `bun run db:generate` inspection proves the migration is additive-nullable — it does NOT prove the migration applies against a live DB (`db:migrate` not run in v1; mock-driven).
- Agent-probe (badge render) proves visual presence + null state on each view — it does NOT provide a regression-safe automated assertion (no e2e); a later view refactor could silently drop a badge.
- Agent-probe (sort) proves observed ordering during the probe — it does NOT prove ordering stability across all data permutations or pipeline multi-column edge cases beyond those observed.

Gate: CONDITIONAL (2 concerns, both mitigated: detail-card touchpoints added in-plan + test command corrected in-plan; residual e2e gap accepted as documented known-gap with backlog stub)
Accepted by: session (autonomous validate pass) — accepted concerns: (1) "test:unit watch-mode gate command" — resolved in-plan by adding `--run`; (2) "lead-card detail view missing from touchpoints" — resolved in-plan by adding touchpoints 16–17 + load 15; (3) "no e2e specs for badge/sort" — accepted as known-gap, backlog stub named.

---

## Autonomous Goal Block

```text
SESSION GOAL: Lead Appeal Score — derived (unpersisted) 0–100 score with shared badge across 5 lead views + `?sort=appeal` on 3 views
Charter + umbrella plan: N/A — single plan (process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md)
Autonomy: single-session SIMPLE plan; standard RIPER-5 EXECUTE gate applies (spawn vc-execute-agent; no inline execution)
Hard stop conditions / safety constraints:
- Do NOT hand-edit the generated Drizzle migration; do NOT touch Better Auth tables (user/account/session/verification)
- Do NOT persist the score anywhere and do NOT write crm_lead_history rows for score changes
- Do NOT modify src/lib/zod/schemas.ts (no form/Zod change in this plan)
- Keep the migration additive-nullable only (no NOT NULL, no backfill)
Next phase: EXECUTE (process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md)
Validate contract: inline in plan (## Validate Contract) — Gate: CONDITIONAL, generated-by: outer-pvl
Execute start: fully-auto: `bun run test:unit -- --run src/tests/appeal-score.spec.ts` | `bun run check` | `bun run db:generate` (inspect 0001_*.sql) || agent-probe: badge on 5 views + `?sort=appeal` order on 3 views | high-risk pack: no
```

---

## Resume and Execution Handoff

1. **Selected plan file (archived):** `process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md`
2. **Last completed step:** Feature fully implemented and closed out — all 17 touchpoints implemented; EXECUTE and EVL both completed against the validate-contract; merged into a PR.
3. **Validate-contract status:** SATISFIED — Gate: CONDITIONAL (2 concerns mitigated in-plan; e2e gap accepted as a known-gap and carried to backlog). EXECUTE + EVL passed against it.
4. **Supporting context:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; full EXECUTE + closeout details are in `lead-appeal-score_REPORT_01-07-26.md` (same folder).
5. **Next step:** none queued — this plan is archived and complete. The only remaining follow-up is the backlog e2e coverage note at `process/features/leads/backlog/appeal-score-e2e-specs_NOTE_01-07-26.md`.

**Next step:** None — feature complete and archived. See `lead-appeal-score_REPORT_01-07-26.md` for the full report and the backlog note for the one remaining follow-up.
</content>
</invoke>
