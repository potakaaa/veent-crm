---
name: plan:pipeline-search-server-reach
description: "PIPE-3 follow-up — make pipeline search fetch server-side so it reaches leads on unloaded/unscrolled pages; supersedes the client-side-only search decision"
date: 07-07-26
feature: pipeline
---

# Pipeline Search — Server Reach (PIPE-3 follow-up)

**Date**: 07-07-26
**Status**: PVL iteration 1 re-validated — CONDITIONAL (C1/C2/C3 resolved; new C6 endpoint stage-list concern, fix E5)
**Complexity**: SIMPLE
**Feature**: pipeline
**Supersedes:** the "client-side only" search decision in
`process/features/pipeline/active/pipeline-search-filter_07-07-26/pipeline-search-filter_PLAN_07-07-26.md`
(that plan otherwise stays intact — only its client-side-only match scope is overturned here).

## TL;DR

Pipeline search today filters only cards already loaded in the browser (`matchesQuery` over
`allLeads`). Leads that match the term but sit on an un-scrolled lazy-load page never appear — a real
functional gap the user flagged. Fix: push search into the existing `buildPipelineStageWhereClause`
/ `listPipelineStage` SQL (copy the proven escaped-ILIKE-OR idiom from `listLeads`), thread `q`
through both call sites (SSR loader + lazy-load endpoint) exactly like PIPE-4 threaded `rep`, and add
a client hybrid layer: keep the instant client pre-filter for zero-latency feedback, and on the same
200ms debounce fetch the authoritative full match set per stage from the server. Clearing the box
discards the search layer and the board reverts to its normal lazy-loaded state. DB-free `.toSQL()`
tests prove the SQL; DOM behavior stays a Known-Gap (no component-render harness, e2e blocked on the
shared Playwright auth fixture).

## Overview

The pipeline board (`/pipeline`) lazy-loads 10 cards per stage initially, fetching more on scroll via
`/api/leads/pipeline-stage`. PIPE-3 shipped search as a purely client-side filter (`matchesQuery`
over the already-loaded `allLeads`), so a lead that matches the term but has not yet been scrolled
into view never appears. The user flagged this as wrong: "search should fetch from server so that it
reaches even cards that are not loaded." This plan moves the authoritative match into the SQL query
(reusing the escaped-ILIKE-OR idiom already proven in `listLeads`), threads a `q` param through both
pipeline call sites the same way PIPE-4 threaded `rep`, and layers a client hybrid model that keeps
the instant client pre-filter for zero-latency feedback while fetching the full server-side match set
per stage on the existing 200ms debounce. It reads through `process/context/all-context.md` and the
`process/context/tests/all-tests.md` routing chain for test-tier calibration.

## Goals

1. Search finds every matching lead in a stage regardless of scroll/load position.
2. Reuse the app's established, injection-safe search idiom (LIKE-metachar escaped) — no new pattern.
3. Compose cleanly with PIPE-4's manager `?rep=` filter (both are independent ANDed conditions).
4. Preserve PIPE-3 behavior: `?q=` URL persistence via `replaceState` (no full navigation), instant
   client feedback on keystroke.
5. No new dependency, no schema change, no migration.

## Scope

**In scope:** server-side search in the pipeline-stage query, threading `q` through both call sites,
client hybrid fetch/replace model, search-active totals/load-more reconciliation, new DB-free search tests.

**Out of scope (explicit):** infinite-scroll *while searching* (a single bumped-limit round-trip
returns effectively all matches per stage instead — see Decision 3); any change to `matchesQuery`'s
signature; any change to PIPE-4 rep-filter behavior; the shared Playwright auth fixture (still blocked
— see Known-Gap).

## Locked Design Decisions

1. **Extend `buildPipelineStageWhereClause(userId, role, stage, filterRepId?, search?)`** — add a 5th
   optional `search` param. When present (non-empty after `.trim()`), push the same escaped-ILIKE-OR
   condition used by `listLeads` (`src/lib/server/db/leads.ts` ~L581-595), adapted to THREE fields:
   `crmLeads.name`, `sql\`COALESCE(${crmOrganizers.name}, '')\``, `sql\`COALESCE(${crmLeads.eventName}, '')\``
   (no handle field — matches PIPE-3's three match fields). ANDed with the existing conditions (same
   composition already used for `filterRepId`). Reuse the exact `escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&')`
   escape. No `@`-strip branch (pipeline has no handle field).
2. **Extend `listPipelineStage(stage, page, limit, userId, role, filterRepId?, search?)`** — thread
   `search` into the where-clause builder call. Both the rows query and the `count()` query already
   use the same `where`, so pagination totals stay correct under search. The `crmOrganizers` leftJoin
   already present on the rows query is what makes the organizer-name ILIKE resolve at runtime.
3. **Search page size = 50** (concrete choice). The lazy-load endpoint already clamps `limit` to a
   max of 50 (`+server.ts` L17-20). Reusing 50 for the search path means one server round-trip returns
   effectively "all matches" for a stage without requiring the user to keep scrolling to trigger more
   search-scoped fetches. No new infra, no infinite-scroll-while-searching complexity.
4. **Both call sites thread `q` (mirrors PIPE-4's `rep` threading exactly):**
   - `src/routes/pipeline/+page.server.ts` (SSR initial load) reads `?q=` (already read as
     `initialQuery`) and, when non-empty, passes it as `search` into each `listPipelineStage` call
     with `limit = 50` (search path). When empty, unchanged behavior (`limit = 10`).
   - `src/routes/api/leads/pipeline-stage/+server.ts` accepts a `q` query param, passes it as `search`
     into `listPipelineStage`. Keep the existing `limit` clamp (client will request `limit=50` on the
     search path). This is now the THIRD param both sites keep in sync: role-visibility, rep-filter,
     search.
5. **Client hybrid model (`src/routes/pipeline/+page.svelte`) — separate state layer:**
   - KEEP the existing instant `matchesQuery` client pre-filter over already-loaded `allLeads` for
     zero-latency keystroke feedback (do NOT remove it).
   - On the SAME debounced trigger `SearchInput` already fires (200ms, via `handleSearch`), when the
     trimmed value is non-empty, issue a `fetch()` per board stage to
     `/api/leads/pipeline-stage?stage=X&page=1&limit=50&q=<value>[&rep=<filterRepId>]` and store each
     stage's response (`leads` AND `total`) in a NEW dedicated state layer `searchLeadsPerStage` /
     `searchTotalsPerStage` — it NEVER mutates `shadowLeads` / `extraLeads`.
   - Board leads become a `$derived`: when search is active AND server results have arrived, show the
     flattened `searchLeadsPerStage`; while the fetch is still in flight, fall back to the instant
     client-filtered `allLeads`; when not searching, show `allLeads`.
   - **On clear** (trimmed value empty): discard `searchLeadsPerStage` (set to `{}`). Because the base
     `allLeads` was never mutated, the board reverts to its normal lazy-loaded initial state
     automatically via the `$derived` — no re-fetch, no `invalidateAll()` needed. This is the
     lowest-risk clear path and is the concrete choice over "re-fetch page 1 per stage on clear."
   - **Stale-response guard:** debounced search fetches can race. Add a monotonically increasing
     `searchSeq` token captured per debounce; ignore any response whose token is not the latest. The
     clear path ALSO bumps `searchSeq` (see Decision 9(c)).
   - **Loading:** set a per-stage (or single board-level) search-loading flag while fetches are in
     flight so the board can show skeletons/spinner consistent with existing `loadingPerStage` UX.
6. **URL persistence unchanged** — `?q=` still synced via `replaceState` (not `goto`); the new server
   call is a plain `fetch()`, not a SvelteKit navigation, so the "no full page reload" requirement
   holds.
7. **Composition with PIPE-4 rep filter** — the search fetch appends `&rep=<data.filterRepId>` when a
   rep filter is active (mirroring `loadMoreForStage`). Server applies both as independent ANDed
   conditions (search narrows within the already-rep-scoped set). A dedicated test confirms this.
8. **Testing** — extend the DB-free `buildPipelineStageWhereClause` `.toSQL()` block in
   `src/tests/pipeline-db.spec.ts` (the un-skipped PIPE-4 block, L334-390). This tier is
   Fully-Automated, no live DB.
9. **Search-active board reconciliation — totals badge + load-more suppression (resolves PVL open gap C1 / execute instruction E3).**
   Under active server-search the base lazy-load count and the load-more sentinel are wrong for the
   search result set. Two coordinated changes fix this:
   - **(a) Override the per-stage total badge.** `listPipelineStage` / the `/api/leads/pipeline-stage`
     endpoint already return `{ leads, total }` (confirmed: `leads.ts` L638/L808; endpoint returns
     `{ ...result, leads }`). Capture each stage's search-response `total` into a new
     `searchTotalsPerStage` state layer, and pass a search-aware `totalsPerStage` to `PipelineBoard`
     so the `{cards.length}/{total}` badge (`PipelineBoard.svelte` L96) reflects the match count under
     search, not the base lazy-load stage total.
   - **(b) Suppress the load-more sentinel while searching.** Gate the `IntersectionObserver` sentinel
     in `src/lib/components/pipeline/PipelineBoard.svelte` — change the `{#if hasMore}` at L197 to
     `{#if hasMore && !isFiltering}`. `isFiltering={searchActive}` is ALREADY passed from `+page.svelte`
     (checklist 9), so no new prop is required. This stops `onLoadMore → loadMoreForStage` from firing
     a `limit=10`, no-`q` page-2 fetch that would pollute `extraLeads` with non-matching leads while a
     search is active. Gating the sentinel on the existing `isFiltering` prop is the simplest change
     given the current state model (chosen over a search-aware synthetic `hasMore`).
   - **(c) Bump `searchSeq` on clear (resolves PVL open gap C2 / execute instruction E1).** The clear
     branch of `handleSearch` bumps `++searchSeq` BEFORE discarding `searchLeadsPerStage`, so any
     in-flight pre-clear fetch is discarded by `runSearch`'s `seq !== searchSeq` stale-guard rather
     than relying on the `searchActive` gate alone (which masks but does not prevent the stale write).

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/leads.ts` | Add `search?` (5th param) to `buildPipelineStageWhereClause`; push escaped-ILIKE-OR over name/organizer/event when non-empty. Add `search?` (7th param) to `listPipelineStage`, thread into builder. |
| `src/routes/pipeline/+page.server.ts` | Pass `initialQuery` (when non-empty) as `search`, use `limit=50` on the search path; unchanged when empty. |
| `src/routes/api/leads/pipeline-stage/+server.ts` | Read `q` param, pass as `search` into `listPipelineStage`. **Also add `'live'` to the endpoint's local `BOARD_STAGES` allow-list (L7)** so it matches the 6-stage `$lib/utils/stages` `BOARD_STAGES` the client fans out over — fixes gap C6 AND a pre-existing latent `live`-column lazy-load 400. |
| `src/routes/pipeline/+page.svelte` | Add `searchLeadsPerStage` + `searchTotalsPerStage` state layers, `searchSeq` stale guard (bumped on both search and clear), search-loading flag; import `BOARD_STAGES`; debounced per-stage server fetch in `handleSearch`; `$derived` board leads + `$derived` search-aware `totalsPerStage`; clear discards both layers. **Largest / riskiest touchpoint.** |
| `src/lib/components/pipeline/PipelineBoard.svelte` | Gate the load-more sentinel on `!isFiltering`: change `{#if hasMore}` (L197) to `{#if hasMore && !isFiltering}` so no page-2 fetch fires while a search is active (Decision 9(b) / gap C1). `isFiltering` prop already exists. |
| `src/tests/pipeline-db.spec.ts` | New DB-free cases: search → 3-field ILIKE renders; search + filterRepId compose; LIKE-metachar escaping. |

## Public Contracts

- `buildPipelineStageWhereClause` — new optional 5th param `search?: string`. Backward compatible
  (existing 4-arg callers unaffected). When present/non-empty, adds an ANDed `OR(ilike name, ilike
  COALESCE(organizer), ilike COALESCE(event))` predicate.
- `listPipelineStage` — new optional 7th param `search?: string`. Backward compatible.
- `/api/leads/pipeline-stage` — now honors an optional `q` query param. Absent `q` = current behavior.
- `PipelineBoard.svelte` — no prop-shape change; the existing `isFiltering` prop now also gates the
  load-more sentinel (previously it only affected the empty-column message at L193). Backward
  compatible (callers already pass `isFiltering`).

## Blast Radius

- 6 files, one package (SvelteKit app). Risk class: **DB query composition** (search predicate on a
  read path driven by user keystrokes) + a new keystroke-driven server round-trip (mild query-cost /
  DoS surface — mitigated by the proven LIKE-metachar escaping and the existing 50-row limit clamp).
  No schema, no migration, no auth/identity change, no billing. Read-only queries (no writes).
- Security note motivating non-skippable VALIDATE: the ILIKE-escaping pattern is already proven safe
  in `listLeads`, but this plan newly exposes it on the pipeline read path and adds a debounced
  per-keystroke fan-out of up to 5 stage fetches — worth a security-dimension look at V2.

## Implementation Checklist

1. `src/lib/server/db/leads.ts` — add `search?: string` as the 5th param of
   `buildPipelineStageWhereClause`. After the `filterRepId` block, add: `const s = search?.trim(); if
   (s) { const escapeLike = (x: string) => x.replace(/[\\%_]/g, '\\$&'); const like =
   \`%${escapeLike(s)}%\`; conditions.push(or(ilike(crmLeads.name, like),
   ilike(sql\`COALESCE(${crmOrganizers.name}, '')\`, like), ilike(sql\`COALESCE(${crmLeads.eventName},
   '')\`, like))!); }`. Confirm `or`, `ilike` are already imported (they are — used by `listLeads`).
2. `src/lib/server/db/leads.ts` — add `search?: string` as the 7th param of `listPipelineStage`; pass
   it as the 5th arg to `buildPipelineStageWhereClause`. No other change (rows + count already share
   `where`; organizer leftJoin already present).
3. `src/routes/api/leads/pipeline-stage/+server.ts` — read `const q = url.searchParams.get('q') ??
   undefined;` and pass as the 7th arg to `listPipelineStage`. Keep the existing `limit` clamp.
3a. `src/routes/api/leads/pipeline-stage/+server.ts` — **(gap C6 / validate-contract execute-instruction E5)**
   add `'live'` to the endpoint's local hardcoded `BOARD_STAGES` allow-list at L7 so it becomes
   `['new', 'contacted', 'replied', 'in_discussion', 'won', 'live'] as const` — aligning it with the
   shared `$lib/utils/stages` `BOARD_STAGES` (L20, 6 stages incl. `'live'`) that the client `runSearch`
   (step 7) fans out over. **Use this one-element-addition approach, NOT an import of the shared export:**
   the local `as const` array drives the derived `BoardStage` type used in the L30 cast
   (`stage as BoardStage as Stage`), so adding `'live'` keeps all existing type machinery intact,
   whereas importing the shared `Stage[]` export would force removing the `as const`/`BoardStage` cast
   plumbing (larger, riskier diff). Without this, `runSearch` fetching `stage=live&q=…` gets a 400 (L13),
   is silently dropped client-side, and the `live` column returns zero interactive-search results —
   undercutting AC1 for 1 of 6 board stages. **Welcome side-effect (not scope creep):** this same
   allow-list gap also silently broke NORMAL (non-search) lazy-load scrolling on the `live` column —
   a pre-existing latent bug found while implementing this plan's own dependency on the same endpoint;
   this fix repairs both paths.
4. `src/routes/pipeline/+page.server.ts` — when `initialQuery.trim()` is non-empty, call
   `listPipelineStage(stage, 1, 50, ..., filterRepId, initialQuery)`; otherwise keep `PAGE_LIMIT`
   (10) and omit search. (A direct-link/refresh with `?q=` then SSR-renders the full server match set
   per stage.)
5. `src/routes/pipeline/+page.svelte` — add state: `let searchLeadsPerStage =
   $state<Partial<Record<Stage, LeadWithAppeal[]>>>({})`, `let searchTotalsPerStage =
   $state<Partial<Record<Stage, number>>>({})`, `let searchLoading = $state(false)`, `let
   searchSeq = 0`.
6. `src/routes/pipeline/+page.svelte` — add `const searchActive = $derived(query.trim().length > 0)`.
6a. `src/routes/pipeline/+page.svelte` — **(gap C3 / execute instruction E2)** add
   `import { BOARD_STAGES } from '$lib/utils/stages';` to the module imports BEFORE writing `runSearch`
   (step 7 fans out over `BOARD_STAGES`). Confirmed export path: `src/lib/utils/stages.ts` L20. Do NOT
   skip — `runSearch` will not typecheck without it.
6b. `src/lib/components/pipeline/PipelineBoard.svelte` — **(gap C1(b) / execute instruction E3, sentinel half)**
   change the load-more block at L197 from `{#if hasMore}` to `{#if hasMore && !isFiltering}` so the
   `use:sentinel` IntersectionObserver never fires `onLoadMore` while a search is active. `isFiltering`
   is an existing prop (L17/L25); no new prop needed.
7. `src/routes/pipeline/+page.svelte` — extract a `runSearch(term)` async fn: capture `const seq =
   ++searchSeq`; set `searchLoading = true`; `Promise.all` over `BOARD_STAGES` fetching
   `/api/leads/pipeline-stage?stage=${stage}&page=1&limit=50&q=${encodeURIComponent(term)}${data.filterRepId
   ? \`&rep=${data.filterRepId}\` : ''}`; if `seq !== searchSeq` bail (stale); else assemble a fresh
   `Record<Stage, LeadWithAppeal[]>` from each response's `leads` AND a parallel
   `Record<Stage, number>` from each response's `total`, and assign to `searchLeadsPerStage` /
   `searchTotalsPerStage`; `finally` clear `searchLoading` only when `seq === searchSeq`. Ignore
   non-ok responses per stage (empty array / total 0).
8. `src/routes/pipeline/+page.svelte` — in `handleSearch(v)`: keep existing `query = v` + `replaceState`
   `?q=` sync. Then: if `v.trim()` → `runSearch(v.trim())`; else (clear branch) →
   `++searchSeq; searchLeadsPerStage = {}; searchTotalsPerStage = {}` — **bump `searchSeq` FIRST**
   (gap C2 / execute instruction E1) so any in-flight pre-clear fetch's response is discarded by
   `runSearch`'s `seq !== searchSeq` stale-guard rather than relying on the `searchActive` gate alone,
   THEN discard both layers (board auto-reverts). Note: `SearchInput` already debounces at 200ms, so
   `handleSearch` is already the debounced trigger — no extra debounce needed.
9. `src/routes/pipeline/+page.svelte` — replace the board's `leads` source with a `$derived`
   `boardLeads`: `searchActive ? (Object.keys(searchLeadsPerStage).length > 0 ?
   Object.values(searchLeadsPerStage).flat() : filteredLeads) : allLeads`. Keep `filteredLeads` (the
   instant client pre-filter) as the in-flight fallback. **Also add a search-aware totals derived**
   (gap C1(a) / execute instruction E3, totals half): `const boardTotals = $derived(searchActive &&
   Object.keys(searchTotalsPerStage).length > 0 ? searchTotalsPerStage : data.totalsPerStage)`. Pass
   `leads={boardLeads}`, `totalsPerStage={boardTotals}`, and `isFiltering={searchActive}` to
   `PipelineBoard`.
10. `src/routes/pipeline/+page.svelte` — ensure the `$effect` that resets `extraLeads`/`pagesPerStage`
    on `data.leads` change also clears BOTH search layers (a server reload invalidates prior search
    results). Add `searchLeadsPerStage = {}; searchTotalsPerStage = {}` there.
11. `src/tests/pipeline-db.spec.ts` — extend the `buildPipelineStageWhereClause — DB-free` describe
    with: (f) search term present → WHERE contains `ilike` and references `name`, `organizers`.`name`,
    and `event_name` (all three fields); (g) search + valid `filterRepId` (manager) → both the
    `owner_id` predicate AND the three ILIKE fields render (compose as AND); (h) a search term with
    `%`, `_`, `\` renders escaped bound params (assert the bound param equals `%\%\_\\%`-style escaped
    string, mirroring how `listLeads` escaping is verified — check for an existing escaping test to
    mirror; if none, assert the param string contains the backslash-escaped sequence). These stay
    OUTSIDE `describe.skipIf(SKIP_DB)` (DB-free, CI-mandatory).
12. Run `bun run check`, `bun run lint`, `bunx vitest run` — fix any failures in blast radius; confirm
    the existing PIPE-4 tests (a)-(e) still pass (test (c)/(e)'s `not.toContain(' or ')` assertions
    run only on the no-search rep/manager paths, so they stay green).

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | Search matches a lead in a stage even when that lead is on an un-loaded lazy page | server SQL renders 3-field ILIKE (test f) + manual DOM check | Fully-Automated (SQL) + Known-Gap (DOM) |
| AC2 | Search uses the escaped, injection-safe LIKE idiom | test (h) escaping assertion | Fully-Automated |
| AC3 | Search composes with the manager `?rep=` filter (AND, narrows further) | test (g) | Fully-Automated |
| AC4 | Both call sites thread `q` consistently (SSR + lazy endpoint) | `bun run check` type-consistency + code review | Fully-Automated (typecheck) |
| AC5 | Clearing the box reverts the board to normal lazy-loaded state with no re-fetch | code review of separate-state-layer design + `++searchSeq`-on-clear guard + manual DOM check | Agent-Probe (code) + Known-Gap (DOM) |
| AC6 | `?q=` persists via `replaceState`, no full navigation | code review (fetch, not goto) | Agent-Probe (code) + Known-Gap (DOM) |
| AC7 | Instant client feedback preserved before server round-trip | `filteredLeads` retained as fallback (code review) | Agent-Probe (code) |
| AC8 | Under active search, the count badge reflects match count and the load-more sentinel does not fire (no non-matching leads pulled in) | code review of `boardTotals` derived + `{#if hasMore && !isFiltering}` sentinel gate | Agent-Probe (code) + Known-Gap (DOM) |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bunx vitest run` — test (f) search renders 3-field ILIKE | Fully-Automated | AC1 (SQL half) |
| `bunx vitest run` — test (h) LIKE-metachar escaping | Fully-Automated | AC2 |
| `bunx vitest run` — test (g) search + filterRepId compose as AND | Fully-Automated | AC3 |
| `bunx vitest run` — PIPE-4 tests (a)-(e) still green (regression) | Fully-Automated | no rep-filter regression |
| `bun run check` | Fully-Automated | AC4 (both call sites type-consistent) + BOARD_STAGES import present (6a) |
| `bun run lint` | Fully-Automated | code health |
| Code review — `++searchSeq` on clear branch; `boardTotals` search-aware derived; `{#if hasMore && !isFiltering}` sentinel gate | Agent-Probe | AC5 (clear stale-guard), AC8 (totals + sentinel reconciliation) |
| Manual: type a term, confirm a lead from an un-scrolled page appears; confirm badge shows match count and no extra page-2 cards load; clear, confirm revert | Known-Gap | AC1/AC5/AC8 DOM (blocked: no component-render harness + shared Playwright auth fixture) |

**Latent-bug repair note (gap C6 fix, checklist 3a):** adding `'live'` to the endpoint allow-list also
repairs a pre-existing latent bug — normal (non-search) lazy-load scrolling on the `live` column was
already silently broken by this same allow-list gap (a `stage=live` lazy-load fetch returned 400 before
this plan). This is a welcome side-effect found while wiring this plan's own dependency on the endpoint,
not new scope. Automated proof of both the search AND the lazy-load `live`-column paths remains a
Known-Gap (same blocked shared Playwright auth fixture); the one-line allow-list correctness is covered
by code review + `bun run check`.

Testing context: read `process/context/tests/all-tests.md` and its routing chain for runner
selection. Post-phase testing gates (`bun run check`, `bun run lint`, `bunx vitest run`) run after the
DB changes (checklist 1-4) and again after the client change (checklist 5-11).

## Test Infra Improvement Notes

(none identified yet — DOM/e2e proof remains blocked on the pre-existing shared Playwright auth
fixture gap, tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` and the
pipeline-search e2e note `process/features/pipeline/backlog/pipeline-search-e2e_NOTE_07-07-26.md`;
not new to this plan. The search-active totals/sentinel reconciliation (gap C1) is likewise
DOM-behavior that only the same blocked harness could prove automatically.)

## Known-Gap (carried over, not new)

The actual DOM behavior — typing triggers a real network fetch, results update, previously-unloaded
matching cards now render, the badge shows match count, the load-more sentinel stays quiet, clearing
reverts — remains a Known-Gap for automated proof. Reason (unchanged from the original PIPE-3 plan):
no jsdom/component-render harness in this repo and e2e is blocked on the shared Playwright
authenticated-session fixture. This is the same accepted limitation, not a new or different gap.

## Dependencies & Risks

- **Dependency:** none new. Relies on existing `or`/`ilike`/`sql` drizzle imports, the existing
  `crmOrganizers` leftJoin in `listPipelineStage`, and the existing `BOARD_STAGES` export
  (`$lib/utils/stages`) and `isFiltering`/`totalsPerStage` props on `PipelineBoard`.
- **Risk (client state):** the hybrid layer is the riskiest change — a race between debounced fetches
  is mitigated by the `searchSeq` stale-guard (checklist 7) which is now also bumped on the clear path
  (checklist 8). A server reload mid-search is handled by clearing both search layers in the reset
  `$effect` (checklist 10). The search-active board state (badge total + load-more) is reconciled by
  Decision 9 so search never shows a misleading `matches/total` or pulls in non-matching page-2 leads.
- **Risk (query cost):** up to 5 stage fetches per debounced keystroke. Bounded by the 200ms debounce
  + 50-row limit clamp; acceptable for an internal CRM. Flagged for V2 security look.
- **Backwards compatibility:** all signature additions are trailing optional params; the `isFiltering`
  prop already exists on `PipelineBoard` (only its effect widens to gate the sentinel); existing
  callers and the no-`q` endpoint path are unchanged.

## Phase Completion Rules

- This is a SIMPLE single-phase plan. The phase is `CODE DONE` when all checklist items (1-12, incl.
  6a/6b) are applied and `bun run check`, `bun run lint`, `bunx vitest run` are green.
- The phase is NOT `VERIFIED` until the DOM/e2e Known-Gap is closed (blocked on the shared Playwright
  auth fixture) — the plan stays in `active/` after EXECUTE, pending manual DOM verification, exactly
  as the original PIPE-3 plan did.
- Fully-Automated gates (tests f/g/h + PIPE-4 regression + check + lint) MUST be green before EXECUTE
  is considered complete; a red gate blocks completion.

## Follow-up Action (do NOT do now)

During this plan's UPDATE PROCESS pass, add a one-line "Superseded-by" pointer to
`process/features/pipeline/active/pipeline-search-filter_07-07-26/pipeline-search-filter_PLAN_07-07-26.md`
noting that its client-side-only search decision is superseded by
`pipeline-search-server-reach_07-07-26`. (Noted here as a follow-up only — that plan is reference,
not edited by this plan.)

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md`
2. **Last completed step:** PLAN written + PVL-supplement applied (gaps C1/C2/C3). No code changed yet.
3. **Validate-contract status:** CONDITIONAL (first-pass, outer-pvl) — PVL-supplement now applied for
   C1/C2/C3; orchestrator should re-run PVL from V1 to confirm the supplement resolves the CONCERNs.
4. **Supporting context loaded:** `process/context/all-context.md`; `src/lib/server/db/leads.ts`
   (L560-829), `src/routes/pipeline/+page.svelte`, `src/routes/pipeline/+page.server.ts`,
   `src/routes/api/leads/pipeline-stage/+server.ts`, `src/lib/components/pipeline/PipelineBoard.svelte`,
   `src/lib/utils/stages.ts`, `src/tests/pipeline-db.spec.ts`; prior plan `pipeline-search-filter_07-07-26`.
5. **Next step for a fresh agent:** re-run PVL (V1-V7) to confirm the supplement, then EXECUTE
   checklist items 1-12 (incl. 6a/6b) in order, running the test gates after the DB changes (1-4) and
   again after the client change (5-11, incl. the PipelineBoard sentinel gate 6b).

## Validate Contract

Status: PASS
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl
supersedes: 2026-07-07 (outer-pvl, PVL iteration 1) — iteration 2 re-run: C6 (endpoint stage allow-list) verified resolved by checklist 3a; C1/C2/C3 re-confirmed against source; net gate PASS. This contract replaces the iteration-1 CONDITIONAL contract.

PVL iteration: 2 (fresh V1–V7 re-run after the C6 supplement cycle; not a patch). Iteration history: iter1 resolved C1/C2/C3 (client hybrid layer); iter2 resolved C6 (endpoint `'live'` stage allow-list). results.tsv rows: iter0 baseline (Gate CONDITIONAL, 3 concerns) → iter1 apply (C1/C2/C3) → iter2 re-validate (C6 surfaced) → iter3 apply (checklist 3a). This contract is the iteration-2 re-validate verdict.

Parallel strategy: parallel-subagents (executed inline, Simple Mode)
Rationale: 3/7 signals — S2 (public API: endpoint `q` param + exported-fn signature changes on a user-keystroke read path), S6 (public-API contract surface), S7 (6 files). MEDIUM. Dominant signal: API/security surface.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 (SQL) | Search WHERE renders a 3-field ILIKE (name / COALESCE organizer / COALESCE event) | Fully-Automated | `bunx vitest run src/tests/pipeline-db.spec.ts` — new test (f) | A |
| AC2 | Search uses the escaped injection-safe LIKE idiom (`\`, `%`, `_` escaped in bound param) | Fully-Automated | `bunx vitest run src/tests/pipeline-db.spec.ts` — new test (h) | A |
| AC3 | Search composes with the manager `?rep=` filter as an AND (never widens) | Fully-Automated | `bunx vitest run src/tests/pipeline-db.spec.ts` — new test (g) | A |
| AC4 | Both call sites (SSR loader + lazy endpoint) thread `q` type-consistently | Fully-Automated | `bun run check` exits 0 | A |
| C6 (endpoint stage list) | Lazy/search endpoint accepts `stage=live` (local allow-list includes `'live'`, matches shared 6-stage BOARD_STAGES) | Agent-Probe | Code review of `+server.ts` L7 (`…'won','live'] as const`) + `bun run check`; corroborated by `pipeline.spec.ts:109` asserting shared BOARD_STAGES = 6 stages incl `live` | B |
| PIPE-4 regression | Rep/manager no-search paths still render no `or` | Fully-Automated | `bunx vitest run src/tests/pipeline-db.spec.ts` — existing (a)-(e) | A |
| AC8 | Under search: badge shows match count (`boardTotals` override) + load-more sentinel gated off (`{#if hasMore && !isFiltering}`) | Agent-Probe | Code review of `boardTotals` derived + PipelineBoard L197 sentinel gate | B |
| AC5 | Clearing reverts board; pre-clear in-flight fetch discarded by `++searchSeq`-on-clear stale-guard | Agent-Probe | Code review of `handleSearch` clear branch (`++searchSeq` FIRST) | B |
| AC6 / AC7 | `?q=` synced via `replaceState` (not `goto`); instant `filteredLeads` fallback retained | Agent-Probe | Code review of `handleSearch` + `boardLeads` `$derived` fallback | A |
| AC1 (DOM) | Typing renders previously-unloaded matching cards; clearing reverts | Known-Gap | — (no jsdom/component harness; e2e blocked on shared Playwright auth fixture) | D |

gap-resolution legend: A — proven now; B — gate added by this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained for existing consumers):
- DB query SQL (name/organizer/event ILIKE + escaping + rep-AND): Fully-automated: `bunx vitest run src/tests/pipeline-db.spec.ts`
- Call-site type consistency: Fully-automated: `bun run check`
- Code health: Fully-automated: `bun run lint`
- Endpoint `'live'` stage allow-list correctness (C6): agent-probe: code review of `+server.ts` L7 + `bun run check`
- Client hybrid fetch/replace/clear runtime (DOM): known-gap: documented — blocked on shared Playwright auth fixture + no component-render harness (not new to this plan)

Failing stubs (Fully-Automated rows only):

test("(f) search term present → WHERE renders 3-field ILIKE over name, organizers.name, event_name", () => { throw new Error("NOT IMPLEMENTED — TDD stub: search renders 3-field ILIKE") })

test("(g) search + valid manager filterRepId → owner_id predicate AND the three ILIKE fields (compose as AND)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: search composes with rep filter as AND") })

test("(h) search term with % _ \\ renders a backslash-escaped bound param (LIKE-metachar escaping)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: LIKE-metachar escaping") })

Dimension findings:
- Infra fit: PASS — no container/port/runtime surface; reuses the existing authed `/api/leads/pipeline-stage` endpoint and `buildPipelineStageWhereClause`; all referenced paths resolve on disk.
- Test coverage: PASS (with documented known-gap C4) — SQL layer fully automated (tests f/g/h + PIPE-4 regression + typecheck); every AC has ≥1 Fully-Automated or Agent-Probe proving row (no behavior rests on Known-Gap alone — the Known-Gap rows are the DOM-runtime residual of behaviors otherwise covered); the DOM residual (C4) is the accepted repo-wide limitation (no component harness + Playwright fixture blocked), a named residual with backlog stub.
- Breaking changes: PASS — all signature additions are trailing optional params; the no-`q` endpoint path is unchanged; adding `'live'` to the endpoint allow-list only WIDENS accepted stages (backward compatible); supersedes the prior client-side-only decision doc-only.
- Security surface: PASS — `escapeLike` is an exact copy of `listLeads` L584 applied to all 3 fields via one escaped `like`; ILIKE uses parameterized bound values; the search `or` is ANDed into the same `conditions` array as `visibilityCondition`, so a rep can never see another rep's leads via search; endpoint enforces auth (`+server.ts` L11). Cost note carried as C5 (accepted).
- Section A (DB query): PASS — mechanically exact against `leads.ts`; `or`/`ilike`/`sql` confirmed imported (used by `listLeads`); `escapeLike` copy verbatim; AND-composition correct; `crmOrganizers` leftJoin present so organizer ILIKE resolves.
- Section B (call-site threading): PASS (C6 RESOLVED this pass) — SSR loader threads `q` via the shared 6-stage BOARD_STAGES (correct for `'live'`). C6 verified resolved by checklist 3a: the endpoint (`+server.ts`) has EXACTLY ONE hardcoded stage list (L7); adding `'live'` (`['new','contacted','replied','in_discussion','won','live'] as const`) closes the L13 guard and keeps the L8 `BoardStage` type + L30 cast intact. Full-file sweep confirms no other hardcoded stage list needs `'live'`. The SSR loader ALREADY calls `listPipelineStage('live', …)` via shared BOARD_STAGES with no error, proving the DB layer has no stage allow-list — the endpoint L13 guard was the sole `'live'` rejection point.
- Section C (client hybrid): PASS — C1/C2/C3 re-verified against source this pass (see Resolved gaps). Mechanically feasible; state model sound.
- Section D (tests): PASS — regression claim accurate; new f/g/h are separate `it()` blocks with no assertion conflict; escaping assertion approach sound.

Resolved gaps:
- C1 (search-active totals + load-more) → RESOLVED (iter1, re-verified iter2). `boardTotals` derived overrides per-stage `total` from each search response so the `PipelineBoard` badge (L96, `total = totalsPerStage[stage] ?? cards.length` at L78) shows an accurate match count; the sentinel gate change to `{#if hasMore && !isFiltering}` (L197) with `isFiltering={searchActive}` stops `onLoadMore → loadMoreForStage` firing a `limit=10`, no-`q` page-2 fetch during search. Verified against the real component (badge L78/L96; sentinel L197; IntersectionObserver L63-72).
- C2 (`searchSeq` on clear) → RESOLVED (iter1). Clear branch bumps `++searchSeq` FIRST, then discards layers; `runSearch` captures `seq = ++searchSeq` and bails on `seq !== searchSeq`, so a pre-clear in-flight response is discarded — not merely masked by the `searchActive` gate.
- C3 (`BOARD_STAGES` import) → RESOLVED (iter1). `$lib/utils/stages` L20 exports the 6-stage BOARD_STAGES (incl `'live'`); import path `$lib/utils/stages` correct; `runSearch` will typecheck. (Confirmed: current `+page.svelte` L14 imports only `stageLabel` — checklist 6a adds the `BOARD_STAGES` import.)
- C6 (endpoint stage allow-list omits `'live'`) → RESOLVED (iter2). Checklist 3a adds `'live'` to `+server.ts` L7 — a complete, one-line fix (only one hardcoded stage list in the file, confirmed by full-file sweep). Also repairs a pre-existing latent non-search `live`-column lazy-load 400.

Open gaps (accepted documented known-gaps — excluded from CONCERN/FAIL count per known-gap exclusion rule):
- C4 (test coverage, known-gap: documented): client hybrid DOM runtime has no automated proof — blocked on the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) + no component-render harness (`process/features/pipeline/backlog/pipeline-search-e2e_NOTE_07-07-26.md`). Not new to this plan.
- C5 (security, known-gap: accepted): unindexed leading-wildcard ILIKE + up to ~6 stage queries per keystroke-batch; no explicit rate limit beyond the 200ms debounce + 50-row clamp + auth. Accepted for an internal authed CRM.

Test infra improvement (optional, non-blocking): add a cheap Fully-Automated guard asserting the endpoint's local `BOARD_STAGES` (`+server.ts` L7) is a superset of the shared `$lib/utils/stages` BOARD_STAGES, so a future re-divergence (the C6 class of bug) is caught by `bunx vitest run` rather than only code review. Suggested as a backlog test-building item; not required for this plan's gate.

Execute-agent instructions:
- E1 → folded into plan checklist 8 (clear branch `++searchSeq` FIRST). Confirm present at EXECUTE.
- E2 → folded into plan checklist 6a (`import { BOARD_STAGES } from '$lib/utils/stages'`).
- E3 → folded into plan checklist 6b/9/10 (totals override + sentinel gate). Do NOT ship a misleading `matches/total` badge silently.
- E4 (trigger: after DB changes 1-4 AND after client changes 5-11): run `bun run check`, `bun run lint`, `bunx vitest run`; confirm PIPE-4 (a)-(e) stay green; a red Fully-Automated gate blocks completion.
- E5 → folded into plan checklist 3a (add `'live'` to endpoint `+server.ts` L7 local `BOARD_STAGES` allow-list; keep `as const`). Verified complete this pass. Confirm present at EXECUTE.

What this coverage does NOT prove:
- `bunx vitest run src/tests/pipeline-db.spec.ts` (tests f/g/h): proves the emitted SQL string shape, escaping of bound params, and AND-composition via drizzle `.toSQL()` — does NOT prove actual DB row matching against real data (no live DB), nor that the endpoint returns rows at runtime.
- `bun run check`: proves both call sites are type-consistent — does NOT prove the `q` param is threaded correctly at runtime. Note: after the C6 fix both the endpoint local list and the shared list are valid `Stage` subsets, so `check` would still NOT catch a future re-divergence of the two lists (see the optional test-infra improvement above).
- `bun run lint`: proves code health only.
- Agent-Probe (code review of C6/AC5/AC6/AC7/AC8): proves the source adds `'live'` to the allow-list, uses `replaceState` (not `goto`), retains `filteredLeads` fallback, bumps `++searchSeq` on clear, overrides `boardTotals`, and gates the sentinel — does NOT prove the browser behavior in a real DOM.
- Known-Gap (AC1 DOM / AC5 DOM): does NOT prove — via any automated gate — that typing triggers a real fetch, previously-unloaded matching cards render, the `live` column now returns interactive-search results, or clearing reverts the board. Blocked on the shared Playwright auth fixture + absent component-render harness.

Gate: PASS (C1/C2/C3 resolved & re-verified against source; C6 resolved by checklist 3a — verified complete via full-file sweep; no FAILs, no open CONCERNs; 2 accepted documented known-gaps C4/C5 carried as named residuals, excluded from the gate count)
Accepted by: session (autonomous, /goal execution) — C4 (DOM/e2e, Playwright-fixture-blocked) and C5 (unindexed ILIKE cost) accepted as documented residuals; all fixable correctness concerns (C1/C2/C3/C6) are now resolved.

## Autonomous Goal Block

```
SESSION GOAL: Pipeline search reaches unloaded/unscrolled cards via a server-side escaped-ILIKE search path (PIPE-3 follow-up)
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: reversible edits proceed without pause; hard-stop only on irreversible/outward-facing actions (none expected — read-only query + client state).
Hard stop conditions / safety constraints:
- Never let the search predicate bypass rep/role scoping — search must AND with visibilityCondition, never OR (guarded by PIPE-4 tests c/e `not.toContain(' or ')` on no-search paths).
- Never drop the LIKE-metachar escaping (`escapeLike`) on any of the 3 search fields — a literal `%`/`_`/`\` must never act as a wildcard.
- A red Fully-Automated gate (tests f/g/h, PIPE-4 regression, `bun run check`, `bun run lint`) blocks EXECUTE completion.
Next phase: EXECUTE: process/features/pipeline/active/pipeline-search-server-reach_07-07-26/pipeline-search-server-reach_PLAN_07-07-26.md — apply checklist 1-12 (incl. 3a/6a/6b) in order (with E1/E2/E3/E5 from the validate-contract), running gates after DB changes (1-4, incl. 3a endpoint fix) and again after client changes (5-11).
Validate contract: inline in plan (## Validate Contract) — Gate PASS (iteration 2), generated-by outer-pvl.
Execute start: bunx vitest run src/tests/pipeline-db.spec.ts | bun run check | bun run lint | high-risk pack: no
```
