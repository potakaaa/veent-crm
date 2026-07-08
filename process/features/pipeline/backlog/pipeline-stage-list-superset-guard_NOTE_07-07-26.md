---
name: report:pipeline-stage-list-superset-guard
description: "Optional non-blocking test-infra item — assert the pipeline-stage endpoint's local BOARD_STAGES is a superset of the shared $lib/utils/stages BOARD_STAGES"
date: 07-07-26
metadata:
  node_type: memory
  type: report
  feature: pipeline
  phase: backlog
---

# Pipeline Stage-List Superset Guard (optional, non-blocking test-infra item)

**Status:** OPEN — small, optional follow-up surfaced by `pipeline-search-server-reach_07-07-26`'s
validate-contract. Not required for that plan's gate (which is already PASS); registered here so it
isn't lost.

## Bottom line

`src/routes/api/leads/pipeline-stage/+server.ts` keeps its own hardcoded local `BOARD_STAGES`
allow-list (`as const`, drives the `BoardStage` cast) that must stay a superset of the shared
`$lib/utils/stages` `BOARD_STAGES` the client fans out over. This plan (C6) found and fixed one
real divergence — the endpoint's list was missing `'live'`, silently 400ing both search and normal
lazy-load scrolling for that column. `bun run check` does NOT catch this class of bug (both lists
are valid `Stage` subsets after the fix, so they can re-diverge silently again).

## Suggested fix

Add a cheap Fully-Automated Vitest case (e.g. in `src/tests/pipeline-db.spec.ts` or a small new
spec) asserting the endpoint's local `BOARD_STAGES` array is a superset of (or equal to) the shared
`$lib/utils/stages` `BOARD_STAGES` export. This turns a future re-divergence (the C6 class of bug)
into a red gate caught by `bunx vitest run` instead of relying on code review alone.

## Source

`process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md`
— Validate Contract "Test infra improvement (optional, non-blocking)" note; EXECUTE report `## Test
Infra Gaps Found`.
