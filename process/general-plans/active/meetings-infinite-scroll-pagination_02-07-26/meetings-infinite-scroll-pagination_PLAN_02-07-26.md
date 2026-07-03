---
name: plan:meetings-infinite-scroll-pagination
description: Add offset-based infinite-scroll pagination (8/batch) to the cross-lead Meetings list, mirroring the Pipeline board pattern; read-path only, no schema/auth changes.
date: 02-07-26
feature: meetings
---

# Meetings Infinite-Scroll Pagination — PLAN (SIMPLE)

**Date**: 02-07-26
**Status**: Active — validated (CONDITIONAL)
**Complexity**: SIMPLE
**Feature**: meetings
**Context loaded**: `process/context/all-context.md` (router). Testing conventions: `process/context/tests/all-tests.md`.

**TL;DR:** Mirror the Pipeline board's existing infinite-scroll exactly, on the cross-lead `/meetings` list only. SSR the first 8, add an `IntersectionObserver` sentinel that fetches `?page=N&limit=8` and appends deduped rows. Add a NEW paginated DB function (do not touch `listAllMeetings()` — 3 routes depend on it). ~5 files, no schema, no auth. Two pre-accepted known-gaps (no live-DB test harness, no shared Playwright auth fixture) block behavioral automation; `bun run check` is the only fully-automated gate.

## Overview / Goals

Load 8 meetings at a time on `/meetings` (cross-lead mode) and auto-append the next 8 as the user scrolls, with no full-page reload. Single-lead mode (lead detail meetings panel) is unchanged. Implementation copies the proven Pipeline board pattern (`PipelineBoard.svelte` sentinel + `pipeline/+page.svelte` `loadMoreForStage` + `/api/leads/pipeline-stage` + `listPipelineStage`).

## Scope

- **In scope:** read-path pagination for the cross-lead meetings list — new paginated DB function, paginated `/api/meetings` GET, SSR first batch, client sentinel + load-more + dedupe + skeleton + reset-on-`invalidateAll`.
- **Out of scope:** schema changes, auth changes, single-lead mode behavior, `listAllMeetings()` signature/behavior, the calendar route.

## Touchpoints

| # | File | Change | Risk |
|---|------|--------|------|
| 1 | `src/lib/server/db/meetings.ts` | ADD new sibling `listMeetingsPaginated(page, limit)` returning `{ meetings, total }`. Mirror `listPipelineStage`: one page query (`limit`/`offset`) + one `count()` query in `Promise.all`. Ordering `.orderBy(desc(crmMeetings.startAt), asc(crmMeetings.id))` — the `asc(id)` tiebreaker is REQUIRED. Reuse existing `attendeesByMeeting` helper + `dbRowToMeeting` mapper. **Do NOT modify `listAllMeetings()`** — `/calendar` and `/api/meetings` GET current path depend on its unbounded no-args behavior. | Low (additive) |
| 2 | `src/routes/api/meetings/+server.ts` | Extend GET: parse `?page=` (`Math.max(1, …)`) and `?limit=` (default 8, clamp `Math.min(50, Math.max(1, …))` — mirror pipeline-stage clamp). Call `listMeetingsPaginated(page, limit)`, return `json({ meetings, total })`. Keep 401 guard unchanged. POST unchanged. | Low |
| 3 | `src/routes/meetings/+page.server.ts` | Replace the `listAllMeetings()` call in `Promise.all` with `listMeetingsPaginated(1, 8)`; destructure `{ meetings, total }`; return `meetings`, `total`, `users`, `leads`, `me`. `listUsers()`/`listLeads()` unchanged. | Low |
| 4 | `src/lib/components/meetings/MeetingsPanel.svelte` | Add `total` prop; sentinel action (copy `PipelineBoard.svelte:60-69`); `loadMoreMeetings()` (mirror `loadMoreForStage`); `loadingMore`/`extraMeetings`/`page`/`totalOverride` `$state`; `$effect` clearing extras on server `meetings` change; sentinel + skeleton row rendered only when `crossLead && hasMore`. Sentinel is a SIBLING after the `{#each}` block, never inside a row `<div>`. | Medium (interactive; a11y/nav care) |
| 5 | `src/routes/meetings/+page.svelte` | **[Added by VALIDATE — was missing]** Forward the new loader field to the component: change the cross-lead invocation (line 15) to `<MeetingsPanel meetings={data.meetings} total={data.total} users={data.users} me={data.me} leads={data.leads} />`. WITHOUT this, `total` stays `undefined`, `hasMore` collapses to `false`, the sentinel never renders, and infinite scroll never fires (AC2 dead). Lead-detail invocation in `leads/[id]/+page.svelte:470` is UNCHANGED (no `leads` → `crossLead=false`; no `total` needed). | Low (one-line wiring; but load-bearing) |

## Public Contracts

- **`listMeetingsPaginated(page: number, limit: number): Promise<{ meetings: Meeting[]; total: number }>`** — new export in `meetings.ts`. Ordering `startAt DESC, id ASC`. Same `Meeting` shape as `listAllMeetings` (includes `leadName`).
- **`GET /api/meetings?page=&limit=`** — response shape CHANGES from `Meeting[]` to `{ meetings: Meeting[]; total: number }`. **Consumer check performed:** the only fetch consumer of `GET /api/meetings` is the new load-more code in `MeetingsPanel.svelte` (this plan). `MeetingFormModal` / create/update/delete use POST + `/api/meetings/[id]` PATCH/DELETE — unaffected. No other reader of the GET array shape exists. Auth gate (401 on no session) unchanged.
- **`/meetings` loader** — now returns `{ meetings, total, users, leads, me }` (adds `total`). `MeetingsPanel` prop set gains `total`, and the `/meetings` page component (`+page.svelte`) MUST forward `total={data.total}` (touchpoint 5) — the loader field alone is inert without the call-site wiring.

## Blast Radius

5 files, single feature area (meetings read-path). Risk class: **none high-risk** — no schema, no auth, no billing, no migration, no public external API. `listAllMeetings()` left untouched, so `/calendar` and any other consumer are unaffected. The one changed contract (`GET /api/meetings` response shape) has exactly one in-repo consumer, updated in the same change. Call sites of `listAllMeetings` confirmed on-disk (02-07-26): `src/routes/meetings/+page.server.ts:11`, `src/routes/calendar/+page.server.ts:25`, `src/routes/api/meetings/+server.ts:8` — only the first and third are touched by this plan; `/calendar` is not.

## Implementation Checklist

1. **`src/lib/server/db/meetings.ts`** — add `listMeetingsPaginated(page = 1, limit = 8)`. Body mirrors `listPipelineStage` (leads.ts:670-700): `const where = isNull(crmMeetings.deletedAt)`; `const offset = (Math.max(1, page) - 1) * limit`; `Promise.all` of (a) the select with `.leftJoin(crmUsers…).innerJoin(crmLeads…).where(where).orderBy(desc(crmMeetings.startAt), asc(crmMeetings.id)).limit(limit).offset(offset)` and (b) `db.select({ total: count() }).from(crmMeetings).where(where)`. Then `attendeesByMeeting(rows.map(...))` and map via `dbRowToMeeting(r.meeting, …, r.organizerName, r.leadName)`. Return `{ meetings, total }`. Add `asc` and `count` to the `drizzle-orm` import (current import at meetings.ts:10 has neither).
2. **Leave `listAllMeetings()` exactly as-is.** Do not add params, do not change ordering, do not change the export.
3. **`src/routes/api/meetings/+server.ts`** — import `listMeetingsPaginated` (keep `createMeeting`; drop `listAllMeetings` import if now unused). In GET: after the 401 guard, parse `page`/`limit` from `url.searchParams` with the clamp pattern from `pipeline-stage/+server.ts:16-20` (limit default 8, max 50, min 1). `return json(await listMeetingsPaginated(page, limit))`.
4. **`src/routes/meetings/+page.server.ts`** — import `listMeetingsPaginated`; in `Promise.all` replace `listAllMeetings()` with `listMeetingsPaginated(1, 8)`; destructure `const [{ meetings, total }, users, leadsFull] = …`; add `total` to the returned object.
4b. **`src/routes/meetings/+page.svelte`** — forward the new loader field to the component. Change line 15 from `<MeetingsPanel meetings={data.meetings} users={data.users} me={data.me} leads={data.leads} />` to `<MeetingsPanel meetings={data.meetings} total={data.total} users={data.users} me={data.me} leads={data.leads} />`. This is REQUIRED for the feature to function — without it `total` is `undefined` and the sentinel never renders. Do NOT touch `leads/[id]/+page.svelte:470` (single-lead; correct as-is).
5. **`MeetingsPanel.svelte` script** — add `total` to `$props()` (type `total?: number`, default `undefined`). Add `$state`: `let extraMeetings = $state<Meeting[]>([])`, `let page = $state(1)`, `let loadingMore = $state(false)`, `let totalOverride = $state<number | undefined>(undefined)`.
6. **`MeetingsPanel.svelte` derived** — `const allMeetings = $derived([...meetings, ...extraMeetings])`; `const liveTotal = $derived(totalOverride ?? total ?? allMeetings.length)`; `const hasMore = $derived(crossLead && allMeetings.length < liveTotal)`. Render the `{#each}` over `allMeetings` (not `meetings`). (Empty-state guard `{#if meetings.length === 0}` may stay on `meetings` — extras only append after a non-empty first load; functionally equivalent.)
7. **`MeetingsPanel.svelte` reset `$effect`** — mirror `pipeline/+page.svelte:36-41`: `$effect(() => { void meetings; extraMeetings = []; page = 1; totalOverride = undefined; })` so the client-appended extras clear whenever the SSR `meetings` prop refreshes (create/update/delete already call `invalidateAll()`).
8. **`MeetingsPanel.svelte` `loadMoreMeetings()`** — mirror `loadMoreForStage` (pipeline/+page.svelte:51-77): guard `if (loadingMore) return`; `if (allMeetings.length >= liveTotal) return`; `const nextPage = page + 1`; set `loadingMore = true`; `fetch('/api/meetings?page=' + nextPage + '&limit=8')`; on `!res.ok` return; parse `{ meetings: newMeetings, total: newTotal }`; dedupe via `new Set(allMeetings.map(m => m.id))`; append fresh to `extraMeetings`; set `page = nextPage`, `totalOverride = newTotal`; `finally { loadingMore = false }`.
9. **`MeetingsPanel.svelte` sentinel action** — copy `PipelineBoard.svelte:60-69` `sentinel` (no stage arg): `new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadMoreMeetings(); }, { threshold: 0.1 })`, observe, `destroy: () => obs.disconnect()`.
10. **`MeetingsPanel.svelte` markup** — after the `{#each allMeetings as m (m.id)}` block (currently `{/each}` at line 194) and BEFORE the closing `</div>` of `.flex.flex-col.gap-2.5` (line 195), add `{#if hasMore}` block containing the `use:sentinel` element (sibling, NOT inside a row). Inside it, when `loadingMore`, render a skeleton row matching the app skeleton language: `<div class="rounded-control border border-hairline bg-panel-subtle p-3"><Skeleton class="h-3.5 w-32" /><Skeleton class="mt-1 h-3 w-24" /></div>` (shape from `RouteShells.svelte` isMeetings branch, lines 214-218). Import `Skeleton` from `$lib/components/ui/skeleton`.
11. **Verify sentinel isolation** — the sentinel element must NOT carry `role="link"`, `tabindex`, `onclick`, or `onkeydown`; it is purely an observer target so row click/keyboard navigation (MeetingsPanel.svelte:131-142) is unaffected.
12. **Run gate:** `bun run check` — resolve any new type errors (e.g. `total` prop typing, response-shape destructure). Then `bun run test:unit:ci` (vitest regression guard — NOT `bun test`).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0, no new errors | Fully-Automated | AC8 (`bun run check` passes); also proves the new `listMeetingsPaginated` signature, the `{ meetings, total }` response destructure, the `total` prop typing, and the `+page.svelte` `total={data.total}` wiring are contract-consistent |
| `bun run test:unit:ci` (vitest, `--run`) full suite stays green — `meetings.spec.ts` `dbRowToMeeting` mapper unchanged | Fully-Automated | Regression guard: mapper reuse in `listMeetingsPaginated` does not break existing meeting mapping. (Use `bun run test:unit:ci` — `bun test` invokes Bun's native runner, not Vitest; see `all-tests.md` line 127.) |
| Manual: load `/meetings`, confirm exactly 8 rows SSR, `startAt DESC` + `id ASC`; scroll to bottom → next 8 append, no dup/skip, no reload | Hybrid (needs live DB + auth session) | AC1, AC2 — **KNOWN-GAP** (no live-DB harness, no shared Playwright auth fixture) → gate CONDITIONAL |
| Manual: skeleton row visible while a load-more fetch is in flight | Hybrid (needs live DB + browser) | AC3 — **KNOWN-GAP** → gate CONDITIONAL |
| Manual: lead detail meetings panel unchanged (full small list, no sentinel, no fetch) | Hybrid (needs live DB + auth) | AC4 — **KNOWN-GAP** → gate CONDITIONAL |
| Manual: row click-nav, Edit/Delete, meeting-URL link all still work; sentinel never navigates | Hybrid (needs browser) | AC5 — **KNOWN-GAP** → gate CONDITIONAL |
| Manual: create/update/delete → `invalidateAll()` → list re-syncs to fresh SSR data, no stale extra-page duplicates | Hybrid (needs live DB + browser) | AC6 — **KNOWN-GAP** → gate CONDITIONAL |

**Tier note (vacuous-green ban):** behavioral criteria AC1–AC6 have only Hybrid coverage that is unrunnable in this repo today (two pre-accepted infra gaps). They are recorded as known-gaps, their gates stay **CONDITIONAL**, and the backlog residual is the EXISTING note `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (shared Playwright auth fixture) plus the live-DB CI harness gap tracked in `all-context.md` §Remaining v1 work. No NEW backlog stub is created — the residuals already have durable homes. AC8 (`bun run check`) is fully proven and non-conditional.

## Test Infra Improvement Notes

- Pre-accepted known-gap: no live-DB CI harness — `listMeetingsPaginated` (offset/limit + count) and the API clamp cannot be asserted automatically. Tracked in `all-context.md` §Remaining v1 work.
- Pre-accepted known-gap: no shared Playwright authenticated-session fixture — the scroll/append/dedupe/skeleton/reset behaviors cannot be e2e-tested. Tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- Potential future fully-automated coverage (not required by this plan): extract the API `limit`/`page` clamp into a pure helper so it can be unit-tested without a DB (mirror-able for `pipeline-stage` too). Optional; note only.

## Testing

Post-phase testing after checklist step 12: run `bun run check` (typecheck — the fully-automated gate) and `bun run test:unit:ci` (vitest unit suite — regression guard; NOT `bun test`, which runs Bun's native runner per `all-tests.md` line 127). Testing conventions and runner split: `process/context/tests/all-tests.md`. Manual/Hybrid behavioral checks (AC1–AC6) are known-gaps pending live-DB + Playwright auth infra — see Test Infra Improvement Notes.

## Dependencies

- None external. Pattern source files already merged on `development`: `PipelineBoard.svelte`, `pipeline/+page.svelte`, `api/leads/pipeline-stage/+server.ts`, `leads.ts:listPipelineStage`.
- `Skeleton` primitive exists at `src/lib/components/ui/skeleton` (confirmed: `index.ts` + `skeleton.svelte`).

## Risks

| Risk | Mitigation |
|---|---|
| Changing `listAllMeetings()` breaks `/calendar` (filters full list in-memory) | Do NOT touch `listAllMeetings()`; add sibling `listMeetingsPaginated`. Checklist step 2 makes this explicit. |
| Missing `asc(id)` tiebreaker → duplicate/skipped rows across pages when meetings share `startAt` | Ordering `desc(startAt), asc(id)` mandated in checklist step 1. |
| Sentinel inheriting row nav handlers → accidental navigation on scroll | Sentinel is a sibling after `{#each}`, no `role`/`onclick`/`tabindex` (steps 10-11). |
| Client-sent `limit` unbounded → large query | Server-side clamp `Math.min(50, …)` in API handler (step 3). |
| Stale extra-page rows after create/delete | Reset `$effect` on `meetings` prop change (step 7). |
| `total` loader field not forwarded to component → `hasMore` always false → sentinel never renders → feature dead | Touchpoint 5 / checklist step 4b add `total={data.total}` at the `/meetings/+page.svelte` call site. (Gap found and fixed during VALIDATE.) |

## Backwards Compatibility

- `GET /api/meetings` response shape changes (`Meeting[]` → `{ meetings, total }`). Only in-repo consumer is the new load-more code, updated in the same commit. No external API consumers.
- `/meetings` loader adds `total`; additive. Page component forwards it via `total={data.total}`.
- Single-lead callers of `MeetingsPanel` (lead detail, `leads/[id]/+page.svelte:470`) pass no `leads` → `crossLead=false` → sentinel/fetch never render; `total` optional/undefined → unaffected.

## Acceptance Criteria

- **AC1** — `/meetings` (cross-lead) shows exactly 8 rows on SSR, sorted `startAt DESC, id ASC`. *proven by:* Manual SSR check; *strategy:* Hybrid (known-gap → CONDITIONAL).
- **AC2** — Scrolling to bottom auto-fetches and appends next 8, no dup/skip, no reload. *proven by:* Manual scroll check; *strategy:* Hybrid (known-gap → CONDITIONAL).
- **AC3** — Skeleton row shows during load-more fetch. *proven by:* Manual visual check; *strategy:* Hybrid (known-gap → CONDITIONAL).
- **AC4** — Single-lead mode unaffected. *proven by:* Manual lead-detail check; *strategy:* Hybrid (known-gap → CONDITIONAL).
- **AC5** — Row click-nav / Edit / Delete / URL-link unaffected; sentinel never navigates. *proven by:* Manual + code review of sentinel isolation; *strategy:* Hybrid + Agent-Probe (code review of step 11 is fully-checkable).
- **AC6** — After create/update/delete, list re-syncs to fresh SSR, no stale extras. *proven by:* Manual check; *strategy:* Hybrid (known-gap → CONDITIONAL).
- **AC8** — `bun run check` passes with no new errors. *proven by:* `bun run check`; *strategy:* Fully-Automated.

## Phase Completion Rules

- SIMPLE plan — single phase. The phase is `CODE DONE` when checklist steps 1–12 (including 4b) are applied and `bun run check` + `bun run test:unit:ci` pass with no new errors.
- The phase is `VERIFIED` only after the Hybrid manual behavioral checks (AC1–AC6) are run against a live DB + authenticated session. Those are pre-accepted known-gaps today, so this plan can reach `CODE DONE` but NOT `VERIFIED` until the live-DB + Playwright auth infra exists.
- Do not mark AC1–AC6 green from code inspection alone; record them as CONDITIONAL known-gaps in the phase report.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/meetings-infinite-scroll-pagination_02-07-26/meetings-infinite-scroll-pagination_PLAN_02-07-26.md`
2. **Last completed step:** VALIDATE complete (CONDITIONAL gate written). No EXECUTE started.
3. **Validate-contract status:** written (02-07-26) — CONDITIONAL. See `## Validate Contract` below.
4. **Supporting context loaded:** `process/context/all-context.md`; `process/context/tests/all-tests.md`; source files verified on-disk during VALIDATE — `MeetingsPanel.svelte`, `PipelineBoard.svelte`, `pipeline/+page.svelte`, `meetings.ts`, `meetings/+page.server.ts`, `meetings/+page.svelte`, `api/meetings/+server.ts`, `pipeline-stage/+server.ts`, `leads.ts:listPipelineStage`, `leads/[id]/+page.svelte`, `RouteShells.svelte` (skeleton shape). Confirmed `listAllMeetings` call sites: `/meetings`, `/calendar`, `/api/meetings`.
5. **Next step for a fresh agent:** EXECUTE checklist steps 1→12 (including 4b) in order, running `bun run check` + `bun run test:unit:ci` after step 12. Do not modify `listAllMeetings()`.

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 0/7 — single feature area, 5 files (< 5-file threshold effectively; no multi-package, no external API/schema/auth surface, no high-risk class, single direction). One agent, sequential; EXECUTE leg on opus.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC8 | Typecheck + Svelte check passes; new `listMeetingsPaginated` signature, `{meetings,total}` destructure, `total` prop typing, and `total={data.total}` wiring are contract-consistent | Fully-Automated | `bun run check` exits 0 | A — proven now |
| regression | Existing meeting mapper (`dbRowToMeeting`) unchanged; vitest suite stays green | Fully-Automated | `bun run test:unit:ci` exits 0 | A — proven now |
| AC1 | `/meetings` SSR shows exactly 8 rows, `startAt DESC, id ASC` | Hybrid | Manual load `/meetings` against live DB + auth session | D — backlog residual (live-DB harness + Playwright auth fixture) |
| AC2 | Scroll appends next 8, no dup/skip, no reload | Hybrid | Manual scroll to sentinel against live DB + auth | D — backlog residual |
| AC3 | Skeleton row visible during load-more fetch | Hybrid | Manual visual check in browser | D — backlog residual |
| AC4 | Single-lead panel unchanged (no sentinel/fetch) | Hybrid | Manual lead-detail check | D — backlog residual |
| AC5 | Row click-nav / Edit / Delete / URL-link intact; sentinel never navigates | Hybrid + Agent-Probe | Manual browser check + code review of sentinel isolation (step 11) | A (code-review half proven now) / D (manual half backlog) |
| AC6 | Create/update/delete → `invalidateAll()` → list re-syncs, no stale extras | Hybrid | Manual mutate-then-observe against live DB + browser | D — backlog residual |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the unrunnable Hybrid rows are carried as gap-resolution D (named residuals with existing backlog homes).

Failing stub (AC8, Fully-Automated):
```
test("should pass svelte-check + tsc with paginated meetings signature and total wiring", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: bun run check exits 0 after listMeetingsPaginated + total={data.total} wiring")
})
```

Failing stub (regression, Fully-Automated):
```
test("should keep dbRowToMeeting mapper green after listMeetingsPaginated reuse", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: bun run test:unit:ci stays green")
})
```

Legacy line form (retained for existing consumers):
- Typecheck: Fully-automated: `bun run check`
- Regression: Fully-automated: `bun run test:unit:ci`
- AC1/AC2/AC3/AC4/AC6 behavioral: known-gap: documented — Hybrid unrunnable (no live-DB harness, no shared Playwright auth fixture)
- AC5 sentinel isolation: agent-probe: code review of MeetingsPanel step 11 (no role/tabindex/onclick/onkeydown on sentinel)

Dimension findings:
- Infra fit: PASS — correct file paths, DB client, `Skeleton` primitive confirmed (`index.ts` + `skeleton.svelte`); `bun run check` is the right typecheck; pattern source files present.
- Test coverage: CONCERN — plan cited `bun test` (wrong: Bun native runner, not vitest); corrected to `bun run test:unit:ci` in plan + this contract. Behavioral ACs are pre-accepted known-gaps (unrunnable Hybrid).
- Breaking changes: PASS — `GET /api/meetings` shape change has exactly one in-repo consumer (updated same-change); `listAllMeetings()` untouched, 3 call sites confirmed on-disk, `/calendar` unaffected.
- Security surface: PASS — server-side `limit` clamp (`Math.min(50,…)`), 401 guard preserved, no schema/auth/billing/migration; not a high-risk class; no evidence pack required.
- Section 1 (meetings.ts listMeetingsPaginated): PASS — mirrors `listPipelineStage` (leads.ts:670-700) exactly; `asc(id)` + `count()` correct; import add (`asc`,`count`) verified needed.
- Section 2 (api/meetings GET): PASS — clamp mirrors `pipeline-stage/+server.ts:16-20`; 401 preserved; POST untouched.
- Section 3 (meetings/+page.server.ts): PASS — loader swap verified against current source.
- Section 4 (MeetingsPanel.svelte): PASS — sentinel placed sibling AFTER `{#each}` (between current lines 194–195), does NOT inherit row `role/onclick/onkeydown` (lines 131-142); reset `$effect` + dedupe mirror pipeline precedent.
- Section 5 (meetings/+page.svelte call-site): FAIL → RESOLVED — `total` was not forwarded to `MeetingsPanel`; missing touchpoint + checklist step would leave the feature dead. Fixed during VALIDATE via plan update P1 (touchpoint 5 + checklist step 4b).

Open gaps:
- AC1–AC6 behavioral verification: known-gap: documented — residuals have existing homes: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (Playwright auth fixture) + `all-context.md` §Remaining v1 work (live-DB CI harness). No new backlog stub created.

Plan updates applied (P1, P2):
- P1 — Added touchpoint 5 (`src/routes/meetings/+page.svelte`) + checklist step 4b: forward `total={data.total}` to `MeetingsPanel`. Resolves the mechanical FAIL (sentinel-never-renders). Also updated Blast Radius (4→5 files), Public Contracts, Risks, Backwards Compatibility, Phase Completion Rules.
- P2 — Corrected test-gate command `bun test` → `bun run test:unit:ci` throughout (Verification Evidence, Testing, Phase Completion Rules) per `all-tests.md` line 127.

Execute-agent instructions:
- E1 — Apply checklist step 4b (`total={data.total}` at `meetings/+page.svelte:15`). This is load-bearing; the feature is non-functional without it. Do NOT touch `leads/[id]/+page.svelte:470`.
- E2 — Use `bun run test:unit:ci` for the vitest regression gate, never `bun test`.
- E3 — Leave `listAllMeetings()` byte-for-byte unchanged; add `listMeetingsPaginated` as a sibling only.

What this coverage does NOT prove:
- `bun run check`: does NOT prove runtime pagination correctness, offset/limit query behavior, ordering stability across pages, dedupe correctness, sentinel intersection firing, skeleton visibility, or `invalidateAll()` reset behavior. It proves only type/contract consistency at compile time.
- `bun run test:unit:ci`: does NOT prove any of AC1–AC6 (no DB-backed or browser test exists); proves only that pure mappers/schemas unaffected by this change stay green.
- Agent-probe (AC5 code review): proves the sentinel markup carries no nav handlers by inspection; does NOT prove runtime click/keyboard behavior in a real browser.

Gate: CONDITIONAL (concerns noted, 1 mechanical FAIL resolved via in-plan fix P1, test-command CONCERN resolved via P2; behavioral known-gaps AC1–AC6 pre-accepted with existing backlog homes)
Accepted by: session (VALIDATE, per delegated authority) — accepted concerns: (1) AC1–AC6 behavioral verification deferred as pre-accepted known-gaps (no live-DB harness, no shared Playwright auth fixture; residuals tracked in existing backlog note + all-context.md §Remaining v1 work).

## Autonomous Goal Block

```
SESSION GOAL: Add offset-based infinite-scroll pagination (8/batch) to the cross-lead /meetings list, mirroring the Pipeline board pattern. Read-path only; no schema/auth changes.
Charter + umbrella plan: N/A — single plan
Autonomy: standard RIPER-5; EXECUTE requires explicit "ENTER EXECUTE MODE". CONDITIONAL gate accepted — behavioral ACs are pre-accepted known-gaps.
Hard stop conditions / safety constraints:
- Do NOT modify listAllMeetings() — 3 routes depend on its unbounded behavior (/calendar filters the full list in memory).
- Server-side clamp the client-sent limit (Math.min(50, ...)); never trust the client value.
- Sentinel must be a sibling after {#each}, carrying no role/tabindex/onclick/onkeydown (no accidental navigation on scroll).
- Use bun run test:unit:ci for vitest — never bun test (Bun native runner).
Next phase: EXECUTE — process/general-plans/active/meetings-infinite-scroll-pagination_02-07-26/meetings-infinite-scroll-pagination_PLAN_02-07-26.md
Validate contract: inline in plan (## Validate Contract), Gate: CONDITIONAL
Execute start: apply checklist steps 1→12 (incl. 4b) in order; fully-auto gates: bun run check + bun run test:unit:ci; behavioral AC1–AC6 = manual/known-gap (deferred); high-risk pack: no.
```
