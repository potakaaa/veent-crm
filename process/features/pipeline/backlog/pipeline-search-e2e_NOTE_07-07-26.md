---
name: report:pipeline-search-e2e
description: "Follow-up stub — pipeline-search Playwright spec (DOM filter/no-results/?q= sync, incl. server-reach + AE-filter compose + live column) blocked on shared auth fixture"
date: 07-07-26
metadata:
  node_type: memory
  type: report
  feature: pipeline
  phase: backlog
---

# PIPE-3 — Pipeline Search e2e Follow-Up (BLOCKED — waiting on shared Playwright auth fixture)

**Status:** OPEN — pre-accepted Known-Gap from `pipeline-search-filter_07-07-26` VALIDATE/EVL,
extended 07-07-26 by `pipeline-search-server-reach_07-07-26` (C4). Not a defect; the filter/search
logic itself is fully proven (client predicate + server SQL both fully-automated-tested). This note
tracks the residual DOM/e2e coverage for both the original client-side filter and the server-reach
follow-up — kept as one note rather than duplicated, since both share the same root-cause blocker.

## Bottom line

`PipelineBoard`/`+page.svelte` DOM rendering for the PIPE-3 search filter — "typing filters cards
live", "empty column shows a no-results state", and "`?q=` syncs via `replaceState` and survives a
refresh" — is not unit-testable in this repo (Vitest is node-only, no jsdom/component-render
harness) and cannot be proven by Playwright yet because there is no shared authenticated-session
fixture. The pure `matchesQuery` predicate IS fully-automated and proven
(`src/routes/pipeline/pipeline-search.test.ts`, 7 cases, green).

## What to write once the fixture lands

A `pipeline-search.e2e.ts` Playwright spec covering:

1. Typing a term into the pipeline search box filters visible cards across all columns
   (case-insensitive substring on lead name / organizer name / event title).
2. A column that empties out under the active query shows the muted "no results" line.
3. `?q=` updates in the URL as the user types, without a full page navigation/reload.
4. Hard-refreshing with `?q=foo` in the URL shows the board pre-filtered (SSR `initialQuery`).
5. Clearing the search box restores all cards and clears `?q=`.

## Server-reach follow-up scenarios (added 07-07-26 — `pipeline-search-server-reach_07-07-26`, C4)

The server-reach fix makes search hit leads that were never scrolled into view. Once the shared
fixture lands, extend the spec above with:

6. Typing a term that matches a lead NOT yet scrolled into view (i.e. beyond the initial 10-per-stage
   lazy-load page) makes it appear on the board — this is the core new server-reach behavior.
7. The same scenario combined with an active manager `?rep=` AE filter (search narrows further within
   the rep-scoped set; never widens past it).
8. The `'live'` stage/column specifically — this column had a pre-existing endpoint allow-list bug
   (fixed by this plan) that silently 400'd both search AND normal lazy-load scrolling; confirm both
   paths now work for `live`.
9. Match-count badge shows the server's true total (not just the client-loaded count) while searching.
10. Clearing the search box while a fetch is in flight reverts the board with no stale/late write
    (the `searchSeq` stale-guard) — hardest to reproduce manually but worth a deliberate slow-network
    or throttled attempt if the fixture supports it.

## Resume trigger

Blocked on `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — the repo-wide
missing shared Playwright authenticated-session fixture. When that fixture lands, write ONE spec
covering both the original 5 scenarios and the 5 server-reach scenarios above against `/pipeline`,
then remove this note.

## Source

`process/features/pipeline/active/pipeline-search-filter_07-07-26/pipeline-search-filter_PLAN_07-07-26.md`
— Validate Contract AC1/AC3/AC4 Known-Gap; EVL HANDOFF SUMMARY `known_gaps` / `follow_up_stubs`.

`process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md`
— Validate Contract C4 Known-Gap (DOM/e2e runtime); EVL HANDOFF SUMMARY `known_gaps`.
