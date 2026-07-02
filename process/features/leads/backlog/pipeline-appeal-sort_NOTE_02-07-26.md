---
name: report:pipeline-appeal-sort-note
description: Backlog — pipeline per-column appeal sort descoped from the lead-appeal-score rewire (badge-only shipped)
date: 02-07-26
metadata:
  node_type: memory
  type: report
  feature: leads
  phase: backlog
---

# Pipeline: per-column Appeal sort — DESCOPED (backlog)

Status: DEFERRED (user-accepted descope, 02-07-26)

## What shipped instead

The Lead Appeal Score rewire onto `origin/development` shipped the pipeline board with
**badge-only** Appeal display: each pipeline card renders `<AppealScoreBadge>`
(`src/lib/components/pipeline/PipelineBoard.svelte`), score computed per card in
`src/routes/pipeline/+page.server.ts` via `computeAppealScore()`. No sort UI/state was added.

## What was descoped

Per-column appeal **sort** on the pipeline board (ordering cards within a stage column by
appeal score). PR #125 originally shipped a mock-based pipeline `sort === 'appeal'` branch that
called `sortByAppealScore`; that code path was removed during the rewire because:

- development's pipeline loader is `listPipelineStage`-based (real DB, per-stage paginated), with
  no per-column sort parameter surface;
- the leads/unassigned list views got the real SQL-authoritative `?sort=appeal` branch instead;
- adding per-column sort to the Kanban board is a larger UX/query change than the rewire scope.

## To implement later

1. Add an `appeal` sort option to `listPipelineStage` (SQL `ORDER BY` using the same
   `appealScoreExpr` fragment already defined in `src/lib/server/db/leads.ts`).
2. Add a per-column sort control to `PipelineBoard.svelte` (or a board-wide sort toggle).
3. Decide interaction with the existing default ordering (event-date-forward, then last activity).

Related: `process/features/leads/backlog/appeal-score-e2e-specs_NOTE_01-07-26.md` (E2E badge-render
specs are separately tracked).
