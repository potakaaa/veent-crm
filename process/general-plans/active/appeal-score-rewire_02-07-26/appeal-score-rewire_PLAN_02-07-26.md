---
name: plan:appeal-score-rewire
description: Rewire the shipped Lead Appeal Score feature (PR #125, mock-data + own schema cols) onto origin/development's real DB-backed leads implementation, using SQL-authoritative sort.
date: 02-07-26
feature: leads
---

# Lead Appeal Score — Rewire onto `origin/development` (PLAN)

Date: 02-07-26
Status: ACTIVE — VALIDATE pending (VALIDATE has NOT run yet; required before EXECUTE)
Complexity: SIMPLE (single feature, one execution session, well-bounded)
Feature: leads

## Overview

PR #125 built Lead Appeal Score against the old mock-data architecture plus two new schema
columns. `origin/development` has since deleted that mock architecture, added real DB-backed
leads (`listLeadsFiltered` / `listUnassignedLeads` / `listPipelineStage`), added its own
`first_announced_date` / `first_reached_out_date` columns (commit `db289f4`, #88/#103), deleted
the `review/` route, and replaced `SortToggle.svelte` with a headless `makeSortTable` helper +
clickable column headers. This plan (a) drops everything in our branch that development now
supersedes, (b) keeps the pure scoring function + its unit tests, (c) re-skins the badge onto
development's design tokens, and (d) does the real rewire: an **SQL-authoritative** `'appeal'`
sort branch that mirrors `computeAppealScore()`, plus per-row badges on all lead views. Pipeline
sort-within-column is **descoped** (badge-only) — recorded in a real backlog note.

This plan describes the CODE CHANGES to apply on top of development's tree. It does NOT describe
git merge mechanics — the orchestrator handles the merge separately.

---

## Goals

1. Lead Appeal Score survives the rewire onto development with zero reliance on mock data or on
   our branch's superseded schema columns.
2. Sort by appeal is **SQL-authoritative** (computed in the ORDER BY at query time, never persisted,
   never a stored column), producing the same relative ranking as `computeAppealScore()`.
3. Badge renders on every real lead view (leads list, unassigned, lead detail, pipeline cards).
4. No dead code, no orphaned migrations, no resurrected deleted routes.

## Scope

**In scope:** appeal-score TS (keep), badge re-skin, removal of superseded branch artifacts,
SQL `'appeal'` sort branch (leads + unassigned), sort-param validation, per-view badge wiring,
one DB parity test, one backlog note.

**Out of scope:** pipeline sort-within-column (DESCOPED — badge-only this session), any change to
development's own schema/migrations, resurrecting the `review/` route, wiring real auth.

---

## Verified Current State of `origin/development` (re-checked this session)

| Fact | Evidence |
|---|---|
| `review/` route deleted on dev | `git show origin/development:src/routes/review/+page.server.ts` → "exists on disk but not in origin/development" |
| Date columns already exist on dev | `schema.ts` L143-144: `firstAnnouncedDate: date('first_announced_date')`, `firstReachedOutDate: date('first_reached_out_date')` — both `date` type. Migration commit `db289f4` (#88/#103) |
| Leads list sort cols | `leads.ts` L232: `LEADS_SORT_COLS = ['name','event','stage','platform','lastActivity']`; order-by builder L341-355 (`leadsOrder: SQL[]`) |
| Unassigned sort cols | `leads.ts` L382: `UNASSIGNED_SORT_COLS = ['name','event','stage','source']`; order-by builder L445-460 (`order: SQL[]`) |
| Leads loader sort validation | `src/routes/leads/+page.server.ts` L36: `LEADS_SORT_COLS_SET = new Set(['name','event','stage','platform','lastActivity'])` |
| Unassigned loader sort validation | `src/routes/unassigned/+page.server.ts` L14: `UNASSIGNED_SORT_COLS_SET = new Set(['name','event','stage','source'])` |
| Leads list UI | `src/routes/leads/+page.svelte` → renders `LeadGrid.svelte`; grid template L30 `grid-cols-[28px_2.4fr_1.7fr_1fr_0.9fr_1fr_0.7fr]`; columns array L35-42 via `makeSortTable` |
| Sort helper | `$lib/utils/tableSort.ts` (`makeSortTable`, TanStack-shaped headless API) — replaces our `SortToggle.svelte` |
| Pipeline | `src/routes/pipeline/+page.server.ts` uses `listPipelineStage`; UI renders `PipelineBoard.svelte` |
| Lead detail | `src/routes/leads/[id]/+page.svelte` — tabbed (overview/meetings/onboarding); header uses `AgeBadge`, `StageChip`, `PlatformBadge` |
| Design tokens | `src/lib/styles/tokens.css` `@theme` (Tailwind v4): `--color-fresh:#059669`, `--color-stale:#d97706`, `--color-overdue:#dc2626`, `--color-ink-300:#9b95a0` → utilities `text-fresh`/`bg-fresh`/`text-stale`/`text-overdue`/`text-ink-300`. Reference badge pattern: `src/lib/components/shared/AgeBadge.svelte` (shadcn `Badge` + inline hex `color/background/border-color`) |
| `dbRowToLead` already returns date fields | `leads.ts` L85-88: `eventDate`, `firstAnnouncedDate`, `firstReachedOutDate` on the `Lead` object |
| Our branch schema (to revert) | `schema.ts` L140-141: `announcedAt: date('announced_at')`, `firstReachedOutAt: timestamp('first_reached_out_at', {withTimezone})` — WRONG names/types, superseded by dev |
| Our branch migration (to delete) | `drizzle/0001_rainy_patriot.sql` (adds `announced_at` + `first_reached_out_at`), `drizzle/meta/0001_snapshot.json`, entry in `drizzle/meta/_journal.json` |

> EXECUTE must re-verify exact line numbers against the live tree at execution time — development
> was 275+ commits ahead at last check and may have moved further.

---

## Touchpoints

**Keep unchanged:**
- `src/lib/appeal-score.ts` — `computeAppealScore` / `appealTier` / `clamp` / `diffDays` (SQL branch mirrors this; see formula below). `sortByAppealScore` becomes unused → deleted (step 7).
- `src/tests/appeal-score.spec.ts` — pure formula unit tests, unchanged.

**Re-skin (cosmetic only):**
- `src/lib/components/AppealScoreBadge.svelte` — swap raw Tailwind color classes for development's
  semantic tokens (`high→fresh`, `mid→stale`, `low→overdue`, `none→ink-300`), matching the
  `AgeBadge.svelte` pattern.

**Remove entirely (superseded by development):**
- `drizzle/0001_rainy_patriot.sql`, `drizzle/meta/0001_snapshot.json`, and the `0001` entry in
  `drizzle/meta/_journal.json`.
- `src/lib/server/db/schema.ts` L140-141 (`announcedAt` / `firstReachedOutAt`) — revert to dev.
- `src/lib/components/SortToggle.svelte` — delete.
- `src/routes/review/+page.server.ts` + `src/routes/review/+page.svelte` — delete (dev deleted route).
- `src/lib/server/mock.ts` — revert our edits to development's version (mock is dead for real routes).

**New rewire work:**
- `src/lib/server/db/leads.ts` — add `'appeal'` to `LEADS_SORT_COLS` + `UNASSIGNED_SORT_COLS`; add
  `appealScoreExpr` SQL fragment; add `'appeal'` branch to both order-by builders.
- `src/routes/leads/+page.server.ts` — add `'appeal'` to `LEADS_SORT_COLS_SET`; rewrite loader to
  dev's real DB shape (drop mock import); attach `appealScore` per returned lead.
- `src/routes/unassigned/+page.server.ts` — add `'appeal'` to `UNASSIGNED_SORT_COLS_SET`; attach
  `appealScore` per lead.
- `src/lib/components/leads/LeadGrid.svelte` — add `{ id: 'appeal', header: 'Appeal' }` column def;
  extend grid template with one column; render `<AppealScoreBadge score={l.appealScore} />` per row.
- `src/routes/unassigned/+page.svelte` — add Appeal column + badge (mirrors LeadGrid pattern).
- `src/routes/leads/[id]/+page.svelte` — render `<AppealScoreBadge>` near the header badge cluster.
- `src/routes/pipeline/+page.server.ts` + `src/lib/components/pipeline/PipelineBoard.svelte` (and
  its card sub-component) — compute `appealScore` per card and render badge. **NO sort UI.**
- `src/tests/leads-filters.spec.ts` (or a new `src/tests/appeal-sort-db.spec.ts` sibling) — DB
  parity test, `describe.skipIf(SKIP_DB)` gated by `DATABASE_URL`.
- `process/features/leads/backlog/pipeline-appeal-sort_NOTE_02-07-26.md` — new backlog note.

---

## Public Contracts

- **URL param:** `?sort=appeal` becomes a valid sort value on `/leads` and `/unassigned` (new
  clickable column header). `&dir=asc|desc` still applies; default presentation is highest-appeal
  first. No new query params introduced.
- **Loader return shape:** each lead object returned by the `/leads`, `/unassigned`, and
  `/pipeline` loaders gains a derived `appealScore: number | null` field. This is a derived
  display value — never persisted, recomputed every load (per repo convention in `all-context.md`).
- **DB:** no schema change, no new column, no migration. The `'appeal'` ORDER BY is an inline
  expression only.
- **`appeal-score.ts` exports:** `sortByAppealScore` is removed from the public surface (no external
  caller remains after rewire — see step 7).

## Blast Radius

- **Files:** ~13 touched (2 keep, 1 re-skin, 6 removals/reverts, ~7 rewire edits, 1 test, 1 note).
- **Packages:** single app (`veent-crm`), no workspace fan-out.
- **Risk class:** LOW-to-MEDIUM. Touches DB query ORDER BY (read-only, no writes, no schema
  change) and several SSR loaders/views. No auth, no billing, no migration-apply, no destructive
  writes. The one nuance: SQL/TS parity correctness (mitigated by the parity test + high-risk-free
  read-only nature).

---

## SQL Formula (must mirror `computeAppealScore` exactly)

TS reference (`src/lib/appeal-score.ts`): early-mover = `clamp(50 - (daysToReachOut/30)*50, 0, 50)`
where `daysToReachOut = (reachedOut ?? now) - announced`; runway = `daysToEvent<=0 ? 0 :
clamp((daysToEvent/60)*50, 0, 50)` where `daysToEvent = event - now`; `score = round(early+runway)`;
`null` when `event` OR `announced` is missing.

Postgres equivalent (date subtraction yields integer days; both cols are `date`):

```
appealScoreExpr =
  CASE
    WHEN <eventDate> IS NULL OR <firstAnnouncedDate> IS NULL THEN NULL
    ELSE ROUND(
      GREATEST(0, LEAST(50,
        50 - ((COALESCE(<firstReachedOutDate>, CURRENT_DATE) - <firstAnnouncedDate>)::numeric / 30) * 50))
      +
      CASE WHEN (<eventDate> - CURRENT_DATE) <= 0 THEN 0
           ELSE GREATEST(0, LEAST(50, ((<eventDate> - CURRENT_DATE)::numeric / 60) * 50)) END
    )
  END
```

Order-by branch (both builders): `dir === 'asc'` → `[sql`${appealScoreExpr} ASC NULLS LAST`,
asc(crmLeads.id)]`; else → `[sql`${appealScoreExpr} DESC NULLS LAST`, asc(crmLeads.id)]`. NULLS LAST
always (missing event/announce date sorts to the bottom, matching `sortByAppealScore`).

> Parity caveat to verify in the test: TS `diffDays` rounds ms-to-days; Postgres `date - date` is
> exact integer days. Because both source columns are `date` (no time component), the two agree.
> The parity test must use `date`-only fixtures to stay deterministic.

> VALIDATE ADDENDUM (parity caveat is INCOMPLETE — see Validate Contract concern C3): the caveat
> above only covers the two *stored* date columns. It misses the `now` / `CURRENT_DATE` asymmetry:
> the TS loader calls `computeAppealScore(...)` with the default `now = new Date()` (a wall-clock
> timestamp WITH a time component), while the SQL `CURRENT_DATE` is midnight-today. For the
> null-`firstReachedOutDate` early-mover branch (`now − announced`) and the runway branch
> (`event − now`), TS rounds a fractional day while SQL uses an exact integer, so the two can
> diverge by up to 1 day → rare adjacent-rank flips between the displayed badge score and the SQL
> sort position. EXECUTE must resolve this (see Validate Contract → Execute-Agent Instructions E3).

---

## Implementation Checklist (atomic, ordered)

1. **Revert schema.** In `src/lib/server/db/schema.ts`, remove L140-141 (`announcedAt` /
   `firstReachedOutAt`). Confirm dev's `firstAnnouncedDate` / `firstReachedOutDate` remain present.
2. **Delete our migration.** Delete `drizzle/0001_rainy_patriot.sql` and
   `drizzle/meta/0001_snapshot.json`; remove the `0001` entry from `drizzle/meta/_journal.json`
   (leave `0000_*` intact). Verify `bun run db:generate` reports no pending diff vs dev schema.
   > VALIDATE ADDENDUM (step 2 is WRONG for the post-merge tree — see Validate Contract concern C1):
   > our branch diverged from dev at `0000`; dev has `0000`–`0014`, ours has `0000` +
   > `0001_rainy_patriot`. Post-merge, dev's full `0000`–`0014` chain is authoritative. Do NOT
   > "remove the 0001 entry / leave 0000 intact" against the merged journal — that would delete
   > dev's legitimate `0001_acoustic_malice`. Correct end-state: `drizzle/` and `drizzle/meta/`
   > must be **byte-identical to `origin/development`** (our appeal columns are reverted out of
   > `schema.ts`, so no new migration is needed). VERIFY: `git diff origin/development -- drizzle/`
   > returns empty. This supersedes the literal wording of step 2 above.
3. **Delete `SortToggle.svelte`** (`src/lib/components/SortToggle.svelte`).
4. **Delete `review/` edits** — remove `src/routes/review/+page.server.ts` and
   `src/routes/review/+page.svelte` (route deleted on dev).
5. **Revert `mock.ts`** to development's version (`git checkout origin/development -- src/lib/server/mock.ts`
   at EXECUTE time, or manually strip our 3 added date fields).
6. **Re-skin badge.** In `AppealScoreBadge.svelte`, replace `tierClass` values with semantic tokens:
   `high → text-fresh` bg `bg-fresh/10`, `mid → text-stale` bg `bg-stale/10`, `low → text-overdue`
   bg `bg-overdue/10`, `none → text-ink-300` bg `bg-panel-sunken` (verify exact utility availability
   against `tokens.css`; prefer the `AgeBadge.svelte` inline-hex pattern if `/10` opacity utilities
   are not generated). Keep the `null → "Not enough data"` state.
7. **Delete `sortByAppealScore`** from `src/lib/appeal-score.ts` (grep confirms only the 3 loaders
   call it; those are rewritten in steps 9-10 to use SQL sort). Keep `computeAppealScore`,
   `appealTier`, `clamp`, `diffDays`.
   > VALIDATE ADDENDUM (dead-code caller count — see Validate Contract concern C2): grep confirms
   > `sortByAppealScore` has **3** callers, not 2 — `/leads` (step 9), `/unassigned` (step 10),
   > AND `/pipeline` (`src/routes/pipeline/+page.server.ts` L4 import + L18 call). Step 14 must drop
   > the pipeline import + call too, else this deletion breaks `bun run check`. Removal order:
   > rewrite all 3 callers (steps 9, 10, 14) BEFORE deleting the function.
8. **Add SQL sort branch** in `src/lib/server/db/leads.ts`:
   a. Add `'appeal'` to `LEADS_SORT_COLS` (L232) and `UNASSIGNED_SORT_COLS` (L382).
   b. Define `appealScoreExpr` (formula above) once, reusable by both builders.
   c. Add `else if (validSort === 'appeal')` branch to `leadsOrder` (L341-355) and to the
      unassigned `order` builder (L445-460), using the NULLS LAST ordering rule.
9. **Rewrite `/leads` loader** (`src/routes/leads/+page.server.ts`): drop the `MOCK_LEADS` /
   `sortByAppealScore` import; add `'appeal'` to `LEADS_SORT_COLS_SET` (L36); map returned leads to
   attach `appealScore: computeAppealScore(l.eventDate, l.firstAnnouncedDate, l.firstReachedOutDate)`.
   (Confirm dev's loader already returns those date fields on each lead; `dbRowToLead` L85-88 does.)
10. **Update `/unassigned` loader** (`src/routes/unassigned/+page.server.ts`): add `'appeal'` to
    `UNASSIGNED_SORT_COLS_SET` (L14); attach `appealScore` per lead (same expression).
11. **Add Appeal column to `LeadGrid.svelte`:** add `{ id: 'appeal', header: 'Appeal' }` to the
    columns array (L35-42); add one track to the grid template (L30, e.g.
    `grid-cols-[28px_2.4fr_1.7fr_1fr_0.9fr_1fr_0.7fr_0.7fr]`); render
    `<AppealScoreBadge score={l.appealScore} />` in the matching body cell. Wire the header through
    the existing `onSortChange` so `?sort=appeal` round-trips.
12. **Add Appeal column to `/unassigned` view** (`src/routes/unassigned/+page.svelte`) mirroring the
    LeadGrid pattern (column def + badge cell + sortable header via `makeSortTable`).
13. **Add badge to lead detail** (`src/routes/leads/[id]/+page.svelte`): render `<AppealScoreBadge
    score={computeAppealScore(lead.eventDate, lead.firstAnnouncedDate, lead.firstReachedOutDate)} />`
    near the existing header badge cluster (next to `AgeBadge`/`StageChip`).
14. **Pipeline badge-only** (`src/routes/pipeline/+page.server.ts` + `PipelineBoard.svelte` card):
    compute `appealScore` per card lead and render `<AppealScoreBadge>`. **Add NO sort UI/state.**
    > VALIDATE ADDENDUM (step 14 under-specified — see Validate Contract concern C2): the current
    > pipeline loader is MOCK-based (`MOCK_LEADS`, `l.announcedAt`/`l.firstReachedOutAt`, plus a
    > `sort === 'appeal'` branch calling `sortByAppealScore`). Step 14 must give pipeline the SAME
    > treatment steps 9-10 gave leads/unassigned: (a) drop `MOCK_LEADS`, rewrite to dev's real
    > `listPipelineStage` shape; (b) drop the `sortByAppealScore` import + call and REMOVE the
    > `sort === 'appeal'` branch entirely (descoped); (c) use dev's field names
    > (`firstAnnouncedDate`/`firstReachedOutDate`) in the `computeAppealScore` call. Prefer
    > `git checkout origin/development -- src/routes/pipeline/+page.server.ts` then add badge-only
    > compute on top.
15. **Add DB parity test** in `src/tests/leads-filters.spec.ts` (or new
    `src/tests/appeal-sort-db.spec.ts`): under `describe.skipIf(SKIP_DB)`, create a fixture set of
    leads with varied `first_announced_date` / `first_reached_out_date` / `event_date` (incl. null
    cases via `createLead` + `db.update`), call `listLeadsFiltered({..., sort:'appeal'})`, and assert
    the returned order equals the ranking produced by `computeAppealScore()` over the same fixtures
    (nulls last). Match the existing PREFIX + `afterAll` cleanup pattern.
    > VALIDATE ADDENDUM (see Execute-Agent Instruction E3): the parity test MUST pin `now` to
    > midnight-today (pass an explicit `now` arg to `computeAppealScore` equal to Postgres
    > `CURRENT_DATE`) so the assertion is deterministic and actually exercises SQL/TS parity rather
    > than masking the wall-clock divergence.
16. **Write backlog note** `process/features/leads/backlog/pipeline-appeal-sort_NOTE_02-07-26.md`
    (mirror `appeal-score-e2e-specs_NOTE_01-07-26.md`) recording: "Pipeline: add per-column appeal
    sort — DESCOPED from the lead-appeal-score rewire onto development. PR #125 originally shipped
    mock-based pipeline sort; badge-only shipped in the rewire."
17. **Run verification gates** (see Verification Evidence). Fix failures inline before closeout.

---

## Acceptance Criteria (testable)

1. `?sort=appeal` on `/leads` returns leads ordered highest-appeal-first, nulls last, matching
   `computeAppealScore()` ranking. `proven by:` DB parity test (step 15) — `strategy: Hybrid`.
2. `?sort=appeal` on `/unassigned` behaves identically. `proven by:` same parity test extended to
   `listUnassignedLeads` — `strategy: Hybrid`.
3. `<AppealScoreBadge>` renders per row on `/leads` and `/unassigned`, with tier colors from
   development's tokens and a "Not enough data" state for null scores. `proven by:` badge-render
   agent probe — `strategy: Agent-Probe`.
4. `<AppealScoreBadge>` renders on lead detail (`/leads/[id]`) and on pipeline cards. `proven by:`
   agent probe — `strategy: Agent-Probe`.
5. No appeal score is ever persisted; no schema column, no migration added; `bun run db:generate`
   shows no pending diff vs dev. `proven by:` `db:generate` no-diff check + `git status` — `strategy: Fully-Automated`.
6. All superseded artifacts removed: our `0001` migration + meta + journal entry, `SortToggle.svelte`,
   `review/` edits, `announcedAt`/`firstReachedOutAt` schema lines, `mock.ts` reverted, and
   `sortByAppealScore` deleted with zero remaining callers. `proven by:` `bun run check` (compiles
   clean) + `grep -r sortByAppealScore src/` empty + `git status` — `strategy: Fully-Automated`.
7. `bun run check` and `bun run test:unit -- --run` both pass (formula unit tests green; no type
   errors). `proven by:` those two commands — `strategy: Fully-Automated`.
8. ~~Pipeline sortable by appeal~~ — **DESCOPED, badge-only this session.** Per-column appeal sort on
   pipeline is deferred to backlog (`pipeline-appeal-sort_NOTE_02-07-26.md`). No pipeline sort UI is
   added. This is an intentional, user-accepted descope, not an omission.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 (svelte-check + tsc) | Fully-Automated | AC6, AC7 (compiles clean, no dead refs, no type errors) |
| `bun run test:unit -- --run` exits 0 (incl. `appeal-score.spec.ts`) | Fully-Automated | AC7 (formula unchanged, tests green) |
| `grep -r "sortByAppealScore" src/` returns empty | Fully-Automated | AC6 (helper deleted, no callers) |
| `bun run db:generate` reports no pending schema diff + `git status` shows migration/meta removals | Fully-Automated | AC5, AC6 (no schema change, superseded artifacts gone) |
| `git diff origin/development -- drizzle/` returns empty (migration chain identical to dev) | Fully-Automated | AC5, AC6 (migration reconciliation — see concern C1) |
| DB parity test (`skipIf(SKIP_DB)`, `DATABASE_URL` set): SQL `sort=appeal` order == `computeAppealScore()` ranking for a fixed fixture set incl. null cases, on `/leads` and `/unassigned` | Hybrid (needs live Postgres) | AC1, AC2 |
| Manual/agent visual probe: badge renders with correct tier colors + "Not enough data" state on `/leads`, `/unassigned`, `/leads/[id]`, pipeline cards | Agent-Probe | AC3, AC4 |

Failing stub (for AC1/AC2, consumed by execute-agent as red-first starting point):
```
test("sort=appeal returns leads ordered by computeAppealScore ranking, nulls last", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: SQL appeal ORDER BY parity with computeAppealScore")
})
```

## Test Infra Improvement Notes

- The appeal-sort parity gate is **Hybrid**: it needs a live Postgres (`DATABASE_URL`) and is
  skipped in CI (`describe.skipIf(SKIP_DB)`), per `all-tests.md` "Integration tests (real DB) are
  not set up". Until a test DB is wired into CI, AC1/AC2 are proven only when the DB test is run
  locally against a real Postgres — CONDITIONAL until then. Backlog candidate: stand up a CI test
  Postgres so the parity gate runs automatically.
- Badge rendering (AC3/AC4) is Agent-Probe only because Playwright has no specs yet (`all-tests.md`
  Known Gaps). E2E badge-render specs already tracked in
  `process/features/leads/backlog/appeal-score-e2e-specs_NOTE_01-07-26.md`.

---

## Dependencies & Risks

- **Dependency:** this plan assumes development's `dbRowToLead` returns `eventDate`,
  `firstAnnouncedDate`, `firstReachedOutDate` (verified L85-88). If a future dev commit renames
  these, steps 9-14 must use the new names — EXECUTE re-verifies at runtime.
- **Risk (SQL/TS parity):** Postgres integer date-subtraction vs TS `diffDays` rounding. Mitigated
  because both source columns are `date`-typed (no time). Parity test enforces it. (Refined by
  Validate Contract concern C3 — the residual risk is the `now`/`CURRENT_DATE` asymmetry.)
- **Risk (grid template drift):** `LeadGrid` grid-template column count must match the header +
  body cell count after adding Appeal; a mismatch misaligns the table. Verified by the visual probe.
- **Risk (merge):** git merge of PR #125 onto development is handled separately by the orchestrator;
  this plan describes only the resulting code state.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md`
2. **Last completed step:** PLAN written; VALIDATE run (validate-contract below); no EXECUTE work started.
3. **Validate-contract status:** WRITTEN — Gate CONDITIONAL (see below). Resolve C1/C2/C3 (plan
   supplement or accept as execute-agent instructions) before/at EXECUTE.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`; live `origin/development` tree inspected for
   `leads.ts`, `+page.server.ts`/`+page.svelte` (leads/unassigned/pipeline/detail), `LeadGrid.svelte`,
   `tableSort.ts`, `tokens.css`, `AgeBadge.svelte`, `leads-filters.spec.ts`, `schema.ts`, `drizzle/`.
5. **Next step for a fresh agent:** EXECUTE the 17-step checklist top-to-bottom, re-verifying live
   line numbers against `origin/development` first (it moves fast). Removal steps (1-5,7) before
   rewire steps (8-14); test + note last. Honor Execute-Agent Instructions E1–E4 below.

---

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 3/7 signals present (S2 DB/schema surface, S6 schema/migration high-risk class, S7 13 files in blast radius). MEDIUM band → Layer-1 + Layer-2 fan-out ran as independent read-only subagents against the live `origin/development` tree.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 | Type/compile clean; formula unit tests green | Fully-Automated | `bun run check` exits 0; `bun run test:unit -- --run` exits 0 | A |
| AC6a | `sortByAppealScore` deleted, zero callers | Fully-Automated | `grep -r "sortByAppealScore" src/` returns empty | B |
| AC5 | No schema change / no migration added; no pending diff | Fully-Automated | `bun run db:generate` reports no pending diff + `git status` shows migration/meta removals | A |
| AC6b | Migration chain identical to dev (reconciliation) | Fully-Automated | `git diff origin/development -- drizzle/` returns empty | B |
| AC1 | `/leads ?sort=appeal` order == `computeAppealScore()` ranking, nulls last | Hybrid | DB parity test (`describe.skipIf(SKIP_DB)`, `DATABASE_URL`) in `leads-filters.spec.ts` asserting `listLeadsFiltered({sort:'appeal'})` order == TS ranking, `now` pinned to `CURRENT_DATE` | B |
| AC2 | `/unassigned ?sort=appeal` order == `computeAppealScore()` ranking, nulls last | Hybrid | Same parity test extended to `listUnassignedLeads` | B |
| AC3 | Badge renders per row on `/leads` + `/unassigned`, tier colors + "Not enough data" | Agent-Probe | Visual probe of both list views incl. null-score row | C |
| AC4 | Badge renders on `/leads/[id]` and pipeline cards | Agent-Probe | Visual probe of detail + pipeline board | C |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value.

Legacy line form (retained so existing validate-contract consumers still parse):
- Type/compile + unit: Fully-automated: `bun run check` && `bun run test:unit -- --run`
- Dead-code: Fully-automated: `grep -r "sortByAppealScore" src/` (must be empty)
- No-schema-change: Fully-automated: `bun run db:generate` (no pending diff) + `git status`
- Migration reconciliation: Fully-automated: `git diff origin/development -- drizzle/` (must be empty)
- SQL/TS sort parity: hybrid: DB parity test in `leads-filters.spec.ts` — precondition: `DATABASE_URL` set (real Postgres); `now` pinned to `CURRENT_DATE`
- Badge render: agent-probe: visual check on `/leads`, `/unassigned`, `/leads/[id]`, pipeline cards

Failing stub (Fully-Automated rows — AC1/AC2 parity is Hybrid so advisory only):
```
test("sort=appeal returns leads ordered by computeAppealScore ranking, nulls last", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: SQL appeal ORDER BY parity with computeAppealScore")
})
```

Dimension findings:
- Infra fit: CONCERN — All target files/paths/tokens verified present on live `origin/development` (schema L143-144 `date` cols; `leads.ts` L232/L382 sort-col arrays + order builders L341-353/L446-459; `tokens.css` fresh/stale/overdue/ink-300/panel-sunken; `LeadGrid.svelte` grid-cols + `makeSortTable` columns; `AgeBadge.svelte`; `leads-filters.spec.ts` SKIP_DB/PREFIX/afterAll/createLead pattern; backlog mirror note). CONCERN: step-2 migration instruction is wrong for the post-merge tree (concern C1).
- Test coverage: CONCERN — Hybrid parity test target file + pattern confirmed real on dev; Fully-Automated gates are solid and runnable. CONCERN: AC1/AC2 stay CONDITIONAL (no CI Postgres, per `all-tests.md`), and the parity test must pin `now` to `CURRENT_DATE` or it masks the C3 divergence.
- Breaking changes: PASS — no schema change, no migration, no new query params; loader return shape gains an additive derived `appealScore` field; `?sort=appeal` is additive; `sortByAppealScore` removed from the public surface with all 3 callers rewritten/removed. No external consumers.
- Security surface: PASS — read-only inline `ORDER BY`, no writes, no migration-apply, no auth/billing/secrets/trust-boundary. LOW risk class; no evidence pack required.
- Section A (schema/migration removal): CONCERN — data-safe (v0 mock-only, no rows exist against `announced_at`/`first_reached_out_at`), but step 2's "delete our 0001, leave 0000 intact" is mis-modeled for the post-merge tree; highest-risk edit (concern C1).
- Section B (SQL sort branch — highest risk): CONCERN — SQL structurally mirrors TS (GREATEST/LEAST = clamp, sum-then-ROUND once = single Math.round, integer date-subtraction for `date` cols, NULLS LAST). Residual: `now`/`CURRENT_DATE` precision asymmetry (concern C3).
- Section C (badge re-skin): PASS — current raw-Tailwind classes confirmed; tokens + AgeBadge inline-hex fallback valid; `null → "Not enough data"` state preserved.
- Section D (per-view badge wiring): PASS — LeadGrid columns/grid-cols/onSortChange confirmed; detail + unassigned mechanically feasible; grid-track count guard noted (visual probe).
- Section E (pipeline badge-only): CONCERN — step 14 under-specified vs steps 9-10; current pipeline loader is MOCK-based + calls `sortByAppealScore` + has a `sort==='appeal'` branch that must all be removed/rewritten (concern C2).
- Section F (dead-code removal): CONCERN — `sortByAppealScore` has 3 callers, not 2 (leads L20, unassigned L16, pipeline L18); step 7 parenthetical credits only steps 9-10 (concern C2). Compile-break risk unless all 3 rewritten before deletion.
- Section G (parity test + backlog note): PASS — SKIP_DB pattern + backlog mirror confirmed real.
- Section H (descope framing): PASS — AC8 shown struck-through; step 16 is a real Implementation Checklist item writing the backlog note. Descope is visible and has a concrete step; user-accepted this session.

Totals: 0 FAILs / 7 CONCERNs (C1–C3 substantive; the rest are dimension roll-ups of the same three) / net PASS-leaning on everything else.

Net Gate: CONDITIONAL (0 FAILs; correctable CONCERNs C1–C3, all with well-defined end-states and mechanical verification).

Execute-Agent Instructions (written to contract for execute-agent to follow):
- E1 (C1 — migration reconciliation): Ignore the literal wording of step 2 ("remove the 0001 entry / leave 0000 intact"). After the merge, make `drizzle/` and `drizzle/meta/` byte-identical to `origin/development` (dev's `0000`–`0014` chain is authoritative; our appeal columns are reverted out of `schema.ts`, so no new migration is needed). MANDATORY VERIFY before closeout: `git diff origin/development -- drizzle/` returns empty. Do NOT delete or edit any of dev's `0001_acoustic_malice`…`0014_agreements_fields` entries.
- E2 (C2 — pipeline dead-code + rewrite): Rewrite `/pipeline` loader with the same treatment steps 9-10 give leads/unassigned: drop `MOCK_LEADS`, drop the `sortByAppealScore` import + call, remove the `sort==='appeal'` branch entirely (descoped), rewrite to dev's real `listPipelineStage` shape, use dev field names (`firstAnnouncedDate`/`firstReachedOutDate`) in the badge's `computeAppealScore` call. Rewrite all 3 callers (steps 9, 10, 14) BEFORE deleting `sortByAppealScore` (step 7) so `bun run check` never sees a dangling import.
- E3 (C3 — SQL/TS `now` parity): In the parity test (step 15) pin `now` to midnight-today (pass an explicit `now` arg to `computeAppealScore` equal to Postgres `CURRENT_DATE`) so the assertion is deterministic. Additionally decide, and document in the phase report, whether the production TS loader calls should floor `now` to date (to eliminate the ≤1-day / rare-rank-flip divergence between the displayed badge score and the SQL sort position) OR accept it as a documented cosmetic known-gap. Recommended: floor `now` to date in the loader `computeAppealScore` calls for exact parity.
- E4 (line-number drift): Re-verify all cited line numbers against the live `origin/development` tree at EXECUTE time before each edit; leads-order builder is at L341-353 and unassigned at L446-459 as of this validation (plan cites 341-355 / 445-460).

Open gaps:
- AC1/AC2 (SQL/TS sort parity) remain CONDITIONAL until a live Postgres runs the Hybrid parity test — no CI test DB exists (`all-tests.md`: "Integration tests (real DB) are not set up"). Not a blocker; code-complete without this run is `CODE DONE`, not `VERIFIED`.
- AC3/AC4 (badge render) are Agent-Probe only — Playwright has no specs (E2E badge-render already tracked in `process/features/leads/backlog/appeal-score-e2e-specs_NOTE_01-07-26.md`).

What this coverage does NOT prove:
- `bun run check` / `test:unit --run`: prove types compile and the pure `computeAppealScore` formula is unchanged. Do NOT prove the SQL `ORDER BY` produces the same ranking as the TS function (that is the Hybrid parity gate), nor that badges render.
- `grep sortByAppealScore` empty + `db:generate` no-diff + `git diff origin/development -- drizzle/` empty: prove dead code is gone, no schema/migration drift, and the migration chain matches dev. Do NOT prove runtime sort correctness or visual rendering.
- Hybrid DB parity test: proves SQL ranking == TS ranking for the fixture set (with `now` pinned) on `/leads` + `/unassigned`. Does NOT prove: production wall-clock divergence (C3) is absent unless the loader floors `now`; pipeline ordering (descoped); performance of the inline expression under large tables; that CI runs it (it is skipped without `DATABASE_URL`).
- Agent-probe badge render: a human/agent judgment of tier colors + "Not enough data" state. Does NOT prove pixel accuracy, grid-track alignment across breakpoints, or accessibility.

Gate: CONDITIONAL (concerns C1–C3 noted; pipeline descope AC8 accepted by user this session; C1–C3 routed to PVL supplement — see SUPPLEMENT REQUEST at handoff)
Accepted by: session — pipeline sort-within-column descope (AC8) accepted by user this session. Concerns C1 (migration reconciliation), C2 (pipeline dead-code/rewrite), C3 (SQL/TS `now` parity) are NOT yet accepted — routed to a plan-validate-fix supplement cycle via the SUPPLEMENT REQUEST block. The addendum notes inserted into steps 2/7/14/15 already encode the corrections in-plan.

## Phase Completion Rules

This is a SIMPLE single-phase plan. Completion bar: all 17 checklist steps applied AND all
Fully-Automated verification gates green (`bun run check`, `bun run test:unit -- --run`,
`db:generate` no-diff, `git diff origin/development -- drizzle/` empty, empty `sortByAppealScore`
grep). The Hybrid parity gate (AC1/AC2) is CONDITIONAL — it passes only when run against a live
Postgres (`DATABASE_URL`); until a CI test DB exists it stays a known-conditional, not a silent
PASS. Agent-Probe badge checks (AC3/AC4) record a judgment. Code-complete without the parity gate
run is `CODE DONE`, not `VERIFIED`.

## Autonomous Goal Block

```
SESSION GOAL: Rewire the shipped Lead Appeal Score feature (PR #125) onto origin/development's real DB-backed leads — SQL-authoritative ?sort=appeal + per-view badges; pipeline sort descoped (badge-only).
Charter + umbrella plan: N/A — single plan (process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md)
Autonomy: single-session SIMPLE plan; standard RIPER-5 gates (ENTER EXECUTE MODE approval still required). Auto-proceed on reversible edits; surface only hard stops.
Hard stop conditions / safety constraints:
- Do NOT edit or delete any of origin/development's drizzle migrations 0001_acoustic_malice..0014_agreements_fields (E1). drizzle/ MUST end byte-identical to dev.
- Do NOT persist appealScore or add any schema column/migration — inline ORDER BY only.
- Rewrite all 3 sortByAppealScore callers (leads, unassigned, pipeline) BEFORE deleting the function (E2) so the build never breaks.
- Do NOT add pipeline sort UI (descoped, user-accepted).
Next phase: EXECUTE: process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md
Validate contract: inline in plan (Gate: CONDITIONAL; C1–C3 corrections encoded in step addenda + Execute-Agent Instructions E1–E4)
Execute start: fully-auto: bun run check && bun run test:unit -- --run && grep -r sortByAppealScore src/ (empty) && bun run db:generate (no diff) && git diff origin/development -- drizzle/ (empty) | hybrid e2e: DB parity test in leads-filters.spec.ts (needs DATABASE_URL) | probe: badge render on /leads,/unassigned,/leads/[id],pipeline | high-risk pack: no
```

## Next Step

VALIDATE has run — Gate is **CONDITIONAL**. The orchestrator drives one plan-validate-fix supplement
cycle for concerns C1–C3 (see SUPPLEMENT REQUEST at the agent handoff), then re-runs VALIDATE from
V1. After PASS (or explicit acceptance of C1–C3), say **ENTER EXECUTE MODE** for
`process/general-plans/active/appeal-score-rewire_02-07-26/appeal-score-rewire_PLAN_02-07-26.md`.
Testing context: `process/context/tests/all-tests.md`.
