---
name: report:pipeline-ae-filter-e2e
description: "Follow-up stub — PIPE-4 manager AE-filter Playwright spec (dropdown render/rep-no-control/?rep= persistence) blocked on shared auth fixture"
date: 07-07-26
metadata:
  node_type: memory
  type: report
  feature: pipeline
  phase: backlog
---

# PIPE-4 — Pipeline AE Filter e2e Follow-Up (BLOCKED — waiting on shared Playwright auth fixture)

**Status:** OPEN — pre-accepted Known-Gap from `pipeline-ae-filter-color_07-07-26` VALIDATE/EVL
(Section A). Not a defect; the trust-boundary decision (`resolvePipelineRepFilter`) and the
query-composition (`buildPipelineStageWhereClause`) are BOTH fully-automated and proven. This note
tracks the residual render/e2e coverage only.

## Bottom line

The manager-only `RepFilterCombobox` render, the rep-sees-no-control gating, and `?rep=` URL
persistence across reload cannot be proven by an automated e2e until the shared Playwright
authenticated-session fixture lands. Server-side enforcement (who can actually narrow the query) is
independently Fully-Automated and does not depend on this gap — this is UX/defense-in-depth
coverage only.

## What to write once the fixture lands

A `pipeline-ae-filter.e2e.ts` Playwright spec covering:

1. A manager visiting `/pipeline` sees the `RepFilterCombobox` in the toolbar; a rep does not.
2. Selecting an AE from the combobox re-queries the board to that AE's cards only, and the URL
   updates to `?rep=<uuid>`.
3. Hard-refreshing with `?rep=<uuid>` in the URL shows the board pre-filtered (SSR `filterRepId`).
4. Clearing the filter ("All AEs") restores the team-wide board and drops `?rep=` from the URL.
5. A rep hand-crafting `?rep=<uuid>` in the address bar sees no change — still own-leads-only
   (server-side trust boundary; this case is already proven at the query layer by
   `buildPipelineStageWhereClause` unit tests, but a browser-level confirmation is still useful
   defense-in-depth once the fixture exists).

## Resume trigger

Blocked on `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — the repo-wide
missing shared Playwright authenticated-session fixture. When that fixture lands, write the spec
above against `/pipeline` and remove this note.

## Source

`process/features/pipeline/active/pipeline-ae-filter-color_07-07-26/pipeline-ae-filter-color_PLAN_07-07-26.md`
— Validate Contract AC4/AC5 Known-Gap; EVL HANDOFF SUMMARY `known_gaps` / `follow_up_stubs`.
