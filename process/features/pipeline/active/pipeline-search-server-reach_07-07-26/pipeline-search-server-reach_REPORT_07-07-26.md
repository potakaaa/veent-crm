---
phase: pipeline-search-server-reach
date: 2026-07-07
status: COMPLETE
feature: pipeline
plan: process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md
---

# EXECUTE Report — Pipeline Search Server Reach (PIPE-3 follow-up)

## What Was Done

Implemented all checklist items 1-12 (incl. 3a/6a/6b) exactly per the PASS validate-contract.

- **1-2 (`src/lib/server/db/leads.ts`):** added `search?` as the 5th param of
  `buildPipelineStageWhereClause` — pushes an escaped-ILIKE-OR condition across `crmLeads.name`,
  `COALESCE(organizers.name,'')`, `COALESCE(crmLeads.eventName,'')` using the verbatim
  `escapeLike = (x) => x.replace(/[\\%_]/g, '\\$&')` idiom from `listLeads`. Added `search?` as the
  7th param of `listPipelineStage`, threaded into the builder call.
- **3 / 3a (`src/routes/api/leads/pipeline-stage/+server.ts`):** reads `?q=` → `search`; added
  `'live'` to the local hardcoded `BOARD_STAGES` allow-list (`[...,'won','live'] as const`), keeping
  the `as const`/`BoardStage` cast plumbing intact (repairs the latent non-search `live`-column 400 too).
- **4 (`src/routes/pipeline/+page.server.ts`):** on the search path passes trimmed `initialQuery` as
  `search` with `limit=50`; unchanged (`limit=10`, no search) when empty.
- **5-10 (`src/routes/pipeline/+page.svelte`):** added `searchLeadsPerStage` / `searchTotalsPerStage`
  / `searchLoading` / `searchSeq` layer; `searchActive` derived; `runSearch()` fanning out over
  `BOARD_STAGES` (imported at 6a); hybrid `boardLeads` derived (server results when active, else
  instant `filteredLeads` fallback, else `allLeads`); `boardTotals` derived (search-response totals
  override when active); `handleSearch` triggers `runSearch` and — on clear — bumps `++searchSeq`
  FIRST then discards both layers; reset `$effect` also clears both search layers on server reload.
  `searchLoading` wired to a small "Searching…" `role="status"` indicator.
- **6b (`src/lib/components/pipeline/PipelineBoard.svelte`):** load-more sentinel gated
  `{#if hasMore && !isFiltering}` so no page-2 fetch fires while searching.
- **12 (`src/tests/pipeline-db.spec.ts`):** APPENDED cases (f) 3-field ILIKE renders, (g) search +
  filterRepId compose as AND, (h) LIKE-metachar escaping — all DB-free `.toSQL()`, outside `skipIf(SKIP_DB)`.

## Test Gate Outcomes (E4)

| Gate | Result |
|---|---|
| `bunx vitest run src/tests/pipeline-db.spec.ts` | PASS — 8 passed (5 PIPE-4 + 3 new f/g/h), 14 skipped (Phase 5 live-DB intact) |
| `bun run check` | PASS — 0 errors (2 pre-existing warnings, not introduced here) |
| `bun run lint` | PASS — 0 errors (1 pre-existing calendar warning) |
| `bunx vitest run` (full) | PASS — 430 passed, 148 skipped; PIPE-3 `pipeline-search.test.ts` green |

## Plan Deviations

- **Added `crmOrganizers` leftJoin to the `count()` query in `listPipelineStage`** (within blast
  radius — same file/function, DB query composition). Plan Decision 2 asserted the count query was
  fine as-is, but it only did `.from(crmLeads)` with no organizer join; a `search` referencing
  `COALESCE(organizers.name,…)` would raise a missing-FROM-clause error at runtime. `organizerId` is a
  1:1 FK so the join never inflates the count. Correctness necessity, not a creative change; automated
  gates (`.toSQL()` tests) don't exercise the count query so this was not caught by a red gate.

## Regression Confirmation

- No PIPE-3/PIPE-4 functionality regressed: rep-filter tests (a)-(e) still green (test (c)/(e)
  `not.toContain(' or ')` run only on no-search paths, unaffected by the search `or`).
- `pipeline-db.spec.ts` pre-existing Phase 5 live-DB tests intact and still `describe.skipIf(SKIP_DB)`.
- `'live'` stage now accepted by the endpoint for BOTH search fan-out and normal lazy-load.

## Test Infra Gaps Found

None new. DOM/e2e runtime remains a Known-Gap (C4) — no component-render harness + shared Playwright
auth fixture blocked (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). C5 (unindexed
leading-wildcard ILIKE cost) accepted for internal authed CRM. Optional backlog item (from contract):
a Fully-Automated guard asserting the endpoint's local `BOARD_STAGES` is a superset of the shared list.

## Closeout Packet

- **Selected plan:** `process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md`
- **Finished:** all checklist items 1-12 (incl. 3a/6a/6b); all Fully-Automated + Agent-Probe gates green.
- **Verified:** SQL shape/escaping/AND-composition (tests f/g/h), type consistency (`check`), code health (`lint`), no regression (full suite).
- **Unverified:** DOM runtime (Known-Gap C4 — blocked on Playwright fixture).
- **Remaining cleanup:** UPDATE PROCESS should add the "Superseded-by" pointer to
  `pipeline-search-filter_07-07-26` (plan §Follow-up Action). Plan stays in `active/` pending manual DOM verification.
- **Closeout classification:** Keep in active/testing (code-complete + Fully-Automated green; manual DOM verification pending).

## Forward Preview

- **Test Infra Found:** none new; DOM/e2e still blocked on shared Playwright auth fixture.
- **Blast Radius Changes:** 6 files (leads.ts, pipeline-stage/+server.ts, pipeline/+page.server.ts,
  pipeline/+page.svelte, PipelineBoard.svelte, pipeline-db.spec.ts) + count-query leftJoin fix in leads.ts.
- **Commands to Stay Green:** `bun run check`, `bun run lint`, `bunx vitest run`.
- **Dependency Changes:** none.
