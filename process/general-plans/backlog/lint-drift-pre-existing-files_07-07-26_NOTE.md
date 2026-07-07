---
name: note:lint-drift-pre-existing-files
description: "Repo-wide pre-existing prettier drift in 7 unmodified files — blocks a clean `bun run lint` repo-wide; unrelated to any single feature."
date: 07-07-26
metadata:
  node_type: memory
  type: note
  feature: null
  phase: known-gap
---

# Known-Gap: Pre-existing repo-wide prettier drift (7 files)

**Origin:** discovered during `manager-dashboard_07-07-26` EVL confirmation (07-07-26). Confirmed
via `git status` on the clean `development` branch that none of the 7 files below are modified by
that feature — this drift predates it.

## Gap

`prettier --check .` (and therefore `bun run lint` repo-wide) fails on 7 files that are not part of
any currently in-flight plan's blast radius:

- `src/lib/components/pipeline/PipelineBoard.svelte`
- `src/lib/components/ui/rep-filter-combobox/RepFilterCombobox.svelte`
- `src/lib/server/db/leads.ts`
- `src/routes/leads/+page.server.ts`
- `src/routes/leads/+page.svelte`
- `src/routes/pipeline/+page.svelte`
- `src/routes/team/+page.svelte`

Scoped lint/prettier checks (run against only the files a given feature touches) pass cleanly —
this is purely a repo-wide `bun run lint` false-negative caused by these 7 files, not a regression
introduced by any single feature's changes.

## Why not fixed inline

Three of the 7 (`leads/+page.server.ts`, `leads/+page.svelte`, `pipeline/+page.svelte`) are
explicit hard-stop "do-not-touch" route surfaces for several concurrently active plans (including
`manager-dashboard_07-07-26`). Reformatting all 7 in the course of an unrelated feature would
expand that feature's blast radius well beyond its declared scope and touch files under active
do-not-touch constraints.

## Resolution

Run a dedicated repo-hygiene pass: `bunx prettier --write` on the 7 files above (or repo-wide),
as its own standalone commit, once no other active plan has a hard-stop constraint on any of
them. Re-run `bun run lint` repo-wide to confirm.

## Cross-references

- First observed by: `process/features/manager-dashboard/active/manager-dashboard_07-07-26/manager-dashboard_REPORT_07-07-26.md` (Test Infra Gaps Found)
