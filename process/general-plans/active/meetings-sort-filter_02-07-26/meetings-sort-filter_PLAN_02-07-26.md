---
name: plan:meetings-sort-filter
description: "Add organizer/lead/date-range filters + date sort toggle to the /meetings list, integrated with infinite-scroll pagination (URL-param architecture mirroring Leads)"
date: 02-07-26
feature: meetings
---

# Meetings List — Sort + Filter PLAN

**Date**: 02-07-26
**Status**: Active — VALIDATE PASS (C1 resolved, re-verified 02-07-26); ready for EXECUTE
**Complexity**: SIMPLE
**Context**: built against `process/context/all-context.md` + `process/context/tests/all-tests.md`

**TL;DR:** Add 4 independent filters (organizer, lead, date-from, date-to) + a newest/oldest date-sort toggle to `/meetings`, driven by URL params and SvelteKit navigation (exact Leads pattern). Extend `listMeetingsPaginated` to accept a filter/sort object built as a `conditions: SQL[]` array applied identically to the page query and the `count()` query (mirror `listLeadsFiltered`). Fix `loadMoreMeetings()` so infinite scroll carries the current filter/sort params. Cross-lead mode only; single-lead mode and `listAllMeetings()` untouched. No schema changes. `SIMPLE` plan, ~5 files.

## Overview / Goals

Give the cross-lead `/meetings` list the same filter/sort ergonomics as the Leads list, without breaking the just-shipped infinite scroll.

Goals:
1. Organizer filter — single Select: "Mine" (default), "All organizers", then each teammate. **"Mine" is the true default: the absent `organizer` param resolves to the caller's own id (identical to an explicit `mine`), so a first load with no param shows the caller's own meetings, matching the "Mine" chip shown selected in the toolbar.**
2. Lead filter — Select of leads (reuse `leads` prop already on `MeetingsPanel`).
3. Date-range filter — two native `<input type="date">` (from/to), AND-combined.
4. Sort — single newest/oldest date toggle, default newest-first (`desc(startAt)`).
5. Filters/sort combine as AND; each change resets to page 1; infinite scroll continues within the filtered/sorted view.
6. `'mine'` (and the absent-param default) resolves server-side from the session — never trust a client-supplied organizerId claiming to be "mine".

Non-goals: no schema/index changes; no new sort axes; no filter UI in single-lead mode; `listAllMeetings()` (calendar) untouched.

## Classification

`SIMPLE` — one-session feature, 5 files, no schema/auth surface change (auth check unchanged; only param resolution added), single feature area (meetings).

## Phase Completion Rules

This is a single-session SIMPLE plan (no multi-phase split). Completion criteria:
- **CODE DONE** = checklist items 1–17 applied and `bun run check` passes.
- **VERIFIED** = the Verification Evidence Fully-Automated + Hybrid gates pass (Hybrid may be `SKIP_DB`-skipped and recorded as a known-gap per the Known Gaps section) AND the Agent-Probe manual walkthrough is recorded.
- Do not mark this plan VERIFIED on code-completion alone; the `bun run test:unit:ci` suite must be green and the manual filter+scroll probe recorded (or explicitly deferred as the pre-accepted e2e known-gap).

## Touchpoints

Files read for context (precedent, not modified):
- `src/routes/leads/+page.svelte:37-51` — `navigate()` / `setFilter()` URL-param helper (reset page on change).
- `src/routes/leads/+page.server.ts:16-49` — filter param read + validate + coerce pattern.
- `src/lib/server/db/leads.ts:333-443` (`listLeadsFiltered`) — `conditions: SQL[]` + `and(...)` applied to page AND count query, `COL_MAP` + sort-dir fn + `asc(id)` tiebreaker.
- `src/tests/leads-filters.spec.ts` — `SKIP_DB` DB-integration test precedent.
- `src/tests/meetings.spec.ts` — existing DB-free unit pattern (pure mapper + schema).

Files modified (Blast Radius):
1. `src/lib/server/db/meetings.ts`
2. `src/routes/api/meetings/+server.ts`
3. `src/routes/meetings/+page.server.ts`
4. `src/lib/components/meetings/MeetingsPanel.svelte`
5. `src/tests/meetings.spec.ts` (or a new `meetings-filters.spec.ts`)

`src/routes/meetings/+page.svelte` — MODIFIED: add the `filters={data.filters}` prop to `<MeetingsPanel>` (required — see step 15); no other change.

## Public Contracts

- **`listMeetingsPaginated` signature change** (internal server API, 2 callers: `+page.server.ts`, `api/meetings/+server.ts` — both in this blast radius):
  ```
  listMeetingsPaginated(
    page?: number,
    limit?: number,
    filters?: {
      organizerId?: string;   // resolved UUID only (never the 'mine'/'all' sentinel) — caller resolves
      leadId?: string;        // UUID
      dateFrom?: string;      // 'YYYY-MM-DD'
      dateTo?: string;        // 'YYYY-MM-DD'
      sortDir?: 'asc' | 'desc';
    }
  ): Promise<{ meetings: Meeting[]; total: number }>
  ```
  Default behavior with `filters` omitted/empty is byte-identical to today (`desc(startAt), asc(id)`, no filter) **at the DB layer**. Note the organizer DEFAULT now lives in `parseMeetingFilterParams` (absent → `meId`), NOT in `listMeetingsPaginated` — the DB function still applies no organizer condition when `filters.organizerId` is undefined; it is the parser that supplies `meId` for the absent/`mine` case. Both callers updated in the same change — no external package consumes this.
- **`GET /api/meetings` query params** (public HTTP contract, consumed by `loadMoreMeetings()` in `MeetingsPanel`): adds `organizer`, `lead`, `dateFrom`, `dateTo`, `sortDir`. `page`/`limit` unchanged. Unknown/invalid params are ignored (fall back to defaults) — never 500.
- **Sentinel resolution rule (security-relevant):** `organizer` absent/empty OR `=== 'mine'` → server resolves to `locals.user.id`. `organizer=all` → no organizer condition (all organizers). Any other value must be a UUID (regex-validated) → used as-is; junk → falls back to `locals.user.id` (the safe default view). A client sending `organizer=<someone-else-id>` gets exactly that id filtered (that is a normal explicit filter, not spoofing); the protection is that `mine`/absent/junk can never be redirected to another identity — it is always `locals.user.id`, server-derived, ignoring any client id.

## Blast Radius

- 5 files, 1 package (the SvelteKit app; no workspace-package fan-out).
- Risk class: **low**. No schema, no migration, no auth-gate change (the `if (!locals.user)` guard is unchanged; only param parsing added), no billing. Server-side identity resolution for the `'mine'`/absent default is the one security-sensitive line — covered by an explicit test gate.
- Reversible: pure additive params with self-scoped-default behavior; revert = restore the 5 files.

## Implementation Checklist

### DB layer — `src/lib/server/db/meetings.ts`

1. Add an exported pure helper `parseMeetingFilterParams(searchParams: URLSearchParams, meId: string): { organizerId?: string; leadId?: string; dateFrom?: string; dateTo?: string; sortDir: 'asc' | 'desc' }`. Logic:
   - `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`
   - `organizer` raw: **ABSENT/empty OR `=== 'mine'`** → `organizerId = meId` (this is the TRUE default — "Mine" is the default view, so a missing param means the same as an explicit `mine`); `=== 'all'` → `organizerId = undefined` (no organizer condition = all organizers); else `UUID_RE.test(raw)` → `organizerId = raw` (teammate, used as-is); else (junk) → `organizerId = meId` (fall back to the safe default self-view, NOT all). Concretely:
     ```
     const raw = searchParams.get('organizer');
     const organizerId =
       raw === 'all' ? undefined
       : (raw && raw !== 'mine' && UUID_RE.test(raw)) ? raw
       : meId;   // absent, 'mine', or junk → the caller's own id
     ```
   - `lead`: `UUID_RE.test(raw) ? raw : undefined`.
   - `dateFrom`/`dateTo`: keep only if matches `/^\d{4}-\d{2}-\d{2}$/` AND is a real date (reuse the `new Date(raw+'T00:00:00Z')` round-trip validation from `leads/+page.server.ts:29-33`); else `undefined`.
   - `sortDir`: `raw === 'asc' ? 'asc' : 'desc'` (allow-list; default `desc`).
   - This is the single source of truth for parsing so both the API route and the page loader share it — and it is DB-free unit-testable (covers the `'mine'`/absent → `meId` resolution AC). **Because absent resolves to `meId`, the `=== 'mine' → meId` branch is exercised by the default path; the UI never needs to emit `organizer=mine` explicitly (and either representation yields the same server result).**
2. Change `listMeetingsPaginated(page = 1, limit = 8)` → add third param `filters: { organizerId?: string; leadId?: string; dateFrom?: string; dateTo?: string; sortDir?: 'asc' | 'desc' } = {}`.
3. Build the conditions array (mirror `listLeadsFiltered:356-411`):
   ```
   const conditions: SQL[] = [isNull(crmMeetings.deletedAt) as SQL];
   if (filters.organizerId) conditions.push(eq(crmMeetings.organizerId, filters.organizerId));
   if (filters.leadId) conditions.push(eq(crmMeetings.leadId, filters.leadId));
   if (filters.dateFrom) conditions.push(sql`${crmMeetings.startAt} >= ${filters.dateFrom}::date`);
   if (filters.dateTo) conditions.push(sql`${crmMeetings.startAt} < (${filters.dateTo}::date + INTERVAL '1 day')`);
   const where = and(...conditions);
   ```
   Note: `dateTo` uses `< dateTo + 1 day` (not `<= dateTo`) so the "to" date is inclusive of the whole day given `startAt` is a timestamp. Document this inline.
4. `orderBy`: `const sortFn = filters.sortDir === 'asc' ? asc : desc;` then `.orderBy(sortFn(crmMeetings.startAt), asc(crmMeetings.id))` — `asc(id)` tiebreaker ALWAYS present (both directions) so pages never duplicate/skip.
5. Apply the SAME `where` to BOTH the page query and the `count()` query (it already uses one `where` var — keep that; just make it the conditions-array `where`). This keeps `total` (and therefore `hasMore`) reflecting the filtered set.
6. Do NOT touch `listAllMeetings()`, `listMeetingsForLead()`, or any mutation.

### API route — `src/routes/api/meetings/+server.ts`

7. In `GET`: after the existing `page`/`limit` parse and the `if (!locals.user)` guard, call `parseMeetingFilterParams(url.searchParams, locals.user.id)` and pass the result as the 3rd arg: `listMeetingsPaginated(page, limit, filters)`. Auth guard and 401 behavior unchanged. `POST` unchanged.

### Page loader — `src/routes/meetings/+page.server.ts`

8. Add `url` to the `load` destructure (`async ({ locals, url })`). Call `parseMeetingFilterParams(url.searchParams, locals.user.id)` and pass to `listMeetingsPaginated(1, 8, filters)` inside the existing `Promise.all`. Also return a `filters` object (the raw string values needed to hydrate the UI controls: `organizer`, `lead`, `dateFrom`, `dateTo`, `sortDir` — read from `url.searchParams`). **For the `organizer` display value: when the param is absent, return `'mine'` so the toolbar shows "Mine" selected — this is now CONSISTENT with the server, because the parser also treats absent as `meId` (= "Mine").** Default `sortDir` display to `'desc'`. `users`, `leads`, `me` already returned.

### UI — `src/lib/components/meetings/MeetingsPanel.svelte`

9. Add imports: `goto` (already imported), `page` from `$app/state`, `SvelteURLSearchParams` from `svelte/reactivity`, and the `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` components (`$lib/components/ui/select`) — mirror `leads/+page.svelte:1-13`.
10. Add a `filters` prop (optional, cross-lead only): `filters?: { organizer: string; lead: string; dateFrom: string; dateTo: string; sortDir: 'asc' | 'desc' }`. Passed from `+page.svelte` (step 15).
11. Add `navigate(patch)` and `setFilter(key, value)` helpers copied from `leads/+page.svelte:37-51` (delete param when empty/undefined; always include `page: undefined` to reset pagination).
12. Render a filter toolbar ABOVE the meeting list, gated behind `{#if crossLead}`:
    - Organizer `Select` bound to `filters.organizer` (default `'mine'` — the loader supplies `'mine'` when the param is absent, step 8): items = `mine` ("Mine"), `all` ("All organizers"), then `{#each users}` → `<SelectItem value={u.id}>{u.name}</SelectItem>`. `onValueChange` → **`setFilter('organizer', v)` — pass the literal picked value (`'mine'` / `'all'` / uuid) UNCHANGED. Do NOT delete the param when "Mine" is picked.** Chosen URL approach (pick ONE, stated here): **write the literal value, including `organizer=mine`.** This keeps the URL param and the toolbar in lockstep and avoids relying on the absent-param equivalence at the UI layer. (The parser still treats absent ≡ `mine` as a safety net — e.g. a hand-edited URL — but the UI always emits an explicit value.)
    - Lead `Select` bound to `filters.lead`: item "" ("All leads") + `{#each leads}` → `<SelectItem value={l.id}>{l.name}</SelectItem>`. `onValueChange` → `setFilter('lead', v)`.
    - Two `<input type="date">` (from/to) bound to `filters.dateFrom`/`filters.dateTo`, `onchange` → `setFilter('dateFrom', e.currentTarget.value)` / `setFilter('dateTo', ...)`. Match native-date styling from `reports/+page.svelte` / `WonCaptureModal.svelte`.
    - Sort toggle: a button that flips newest/oldest → `setFilter('sortDir', filters.sortDir === 'asc' ? undefined : 'asc')` (delete param = default `desc`/newest). Label shows current: "Newest first" / "Oldest first".
13. **Fix `loadMoreMeetings()` (line ~56):** build the fetch URL from the CURRENT params. Replace the hardcoded string with:
    ```
    const params = new SvelteURLSearchParams(page.url.searchParams);
    params.set('page', String(nextPage));
    params.set('limit', '8');
    const res = await fetch(`/api/meetings?${params}`);
    ```
    This carries organizer/lead/dateFrom/dateTo/sortDir into every "load more" fetch so infinite scroll stays within the filtered/sorted view. (Do NOT hand-copy individual filter keys — reflecting the live URL is DRY and future-proof.)
14. **Confirm (do NOT re-implement):** the existing `$effect` at lines 43-48 already resets `extraMeetings=[]`, `page=1`, `totalOverride=undefined` whenever the SSR `meetings` prop changes. Because every filter/sort change triggers a full SvelteKit navigation (new SSR `meetings` prop), this reset fires automatically — the "reset to page 1 on filter change" AC is satisfied for free. Add a one-line code comment noting this dependency so it is not accidentally removed.

### Page — `src/routes/meetings/+page.svelte`

15. Pass `filters={data.filters}` to `<MeetingsPanel>` (single added prop). No other change.

### Tests

16. Add DB-free unit tests for `parseMeetingFilterParams` in `src/tests/meetings.spec.ts` (or new `src/tests/meetings-filters.spec.ts`): **`'mine'` → resolves to `meId`; ABSENT/empty param → resolves to `meId` (same as `'mine'`, the default self-view); `'all'` → `undefined` (no organizer condition); a foreign UUID → passed as-is; non-UUID junk → `meId` (safe default, NOT undefined)**; `sortDir` allow-list (`'asc'`→`'asc'`, anything else→`'desc'`); invalid date strings → `undefined`; valid `YYYY-MM-DD` → kept.
17. Add a `SKIP_DB`-gated (`!process.env.DATABASE_URL`) integration test for `listMeetingsPaginated` mirroring `leads-filters.spec.ts`: seed 2 organizers/2 leads/varied `startAt`, assert organizer filter, lead filter, date-range bounds (inclusive `dateTo`), sort direction, and that `total` reflects the filtered count. Clean up seeded rows in `afterAll`.

## Acceptance Criteria

- [ ] Organizer (Mine/All/teammate), lead, and date-range filters each work independently and AND-combine when multiple set.
- [ ] **"Mine" is the default view: first load with no `organizer` param shows only the caller's own meetings (absent param resolves to `meId` server-side), and the toolbar shows "Mine" selected — display and server result agree.**
- [ ] Selecting "All organizers" (`organizer=all`) shows every organizer's meetings; selecting a teammate shows only that teammate's.
- [ ] Changing any filter or the sort toggle resets the list to page 1 (via existing reset `$effect`, triggered by SSR reload).
- [ ] Loading more while filters active fetches the NEXT page WITHIN the current filtered/sorted view.
- [ ] `organizer=mine` (and the absent-param default) resolves server-side to the authenticated user's id; a client cannot spoof another user's "mine" view.
- [ ] Single-lead mode (lead detail page) shows no filter UI and is unaffected.
- [ ] `listAllMeetings()` untouched (calendar unaffected).
- [ ] `bun run check` and `bun run test:unit:ci` pass with no new errors/failures.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | Signature change + prop wiring type-safe across all 5 files; no new TS errors |
| `parseMeetingFilterParams` unit: `'mine'`→meId, ABSENT→meId, `'all'`→undefined, foreign UUID→as-is, junk→meId | Fully-Automated | "`mine`/absent resolves server-side to caller / no spoofing" + "Mine" default + organizer filter correctness |
| `parseMeetingFilterParams` unit: sortDir allow-list + date validation | Fully-Automated | Sort toggle + date-range param safety (invalid → ignored, never 500) |
| `listMeetingsPaginated` filter/sort integration (`SKIP_DB` when no `DATABASE_URL`) | Hybrid | AND-combination, inclusive date range, sort direction, filtered `total`/`hasMore` |
| Manual: apply each filter in browser, scroll to load more, confirm filtered results persist across pages | Agent-Probe | Infinite-scroll-carries-filters + reset-to-page-1 end-to-end (no shared e2e auth fixture) |
| `bun run test:unit:ci` full suite green | Fully-Automated | No regression in existing 263 passing unit tests |

Failing stub (Fully-Automated — organizer resolution):
```
test("parseMeetingFilterParams resolves 'mine' AND an absent param to the caller id, never a client value", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: mine/absent resolves server-side to meId")
})
```
Failing stub (Fully-Automated — 'all' clears the organizer condition):
```
test("parseMeetingFilterParams maps 'all' to undefined (no organizer filter)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: all → undefined")
})
```
Failing stub (Fully-Automated — sortDir allow-list):
```
test("parseMeetingFilterParams defaults sortDir to desc for any non-'asc' value", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: sortDir allow-list")
})
```

## Known Gaps (pre-accepted — matching prior two plans this session)

- **No live-DB CI harness:** the Hybrid `listMeetingsPaginated` integration test self-skips when `DATABASE_URL` is absent (mirrors `leads-filters.spec.ts`). Filter/sort SQL correctness is proven manually / one-time against a local DB until the live-DB CI harness exists. Blast-radius-appropriate; do not block on it. Since the sole gate proving the Hybrid AND-combination/date-range behavior may be skipped, that behavior's verification stays CONDITIONAL until run against a local DB — recorded here, not silently passed.
- **No shared Playwright authenticated-session fixture:** the Agent-Probe end-to-end row (browser: apply filters + scroll) cannot be an automated e2e until `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` is resolved. Any e2e written now must self-skip via `test.skip()` per the `calendar.e2e.ts` pattern.
- **Missing DB indexes on `crm_meetings.startAt` / `organizerId`:** filtering/sorting on unindexed columns is fine at small-team CRM scale; noted as an out-of-scope perf gap, not addressed here.

## Test Infra Improvement Notes

(none identified yet)

## Dependencies / Risks / Integration Notes

- Depends on the just-shipped pagination (`listMeetingsPaginated` + `MeetingsPanel` infinite scroll) — this plan extends it, does not replace it.
- Risk: forgetting to apply the conditions `where` to the `count()` query would make `hasMore` wrong under filters → step 5 makes this explicit (one shared `where`).
- Risk: removing the `asc(id)` tiebreaker on the oldest-first path would cause page duplication → step 4 keeps it on both directions.
- Integration: `parseMeetingFilterParams` is the shared parse contract for both the loader and the API route — keeps SSR page-1 and the infinite-scroll fetches identical, preventing drift. The organizer-default semantic (absent ≡ `mine` → `meId`) lives ONLY here, so the loader, the API route, and the toolbar display all agree by construction.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/meetings-sort-filter_02-07-26/meetings-sort-filter_PLAN_02-07-26.md`
2. **Last completed step:** plan written + C1 PVL-supplement applied (organizer-default semantic aligned across steps 1 / 8 / 12 / 16 + Goal/AC). No code changed yet.
3. **Validate-contract status:** written (02-07-26) — Gate PASS; C1 resolved via supplement and re-verified against on-disk source.
4. **Supporting context loaded:** `all-context.md`, `tests/all-tests.md`; precedent files `leads/+page.svelte`, `leads/+page.server.ts`, `leads.ts` (`listLeadsFiltered`), `meetings.ts`, `MeetingsPanel.svelte`, `api/meetings/+server.ts`, `meetings/+page.server.ts`, `meetings.spec.ts`, `leads-filters.spec.ts`.
5. **Next step for a fresh agent:** re-run VALIDATE on this plan (C1 supplement applied). Then EXECUTE in checklist order 1→17; run `bun run check` after the DB-layer + wiring changes, then `bun run test:unit:ci` after tests are added.

## Validate Contract

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — outer PVL re-run (cycle 2) has current evidence; C1 organizer-default contradiction resolved via supplement and re-verified against on-disk source

Parallel strategy: sequential
Rationale: Signal score 1/7 (only S7 — 5-file blast radius). Single coherent SvelteKit-app change, one package, no cross-agent coordination needed. VALIDATE fan-out run in Simple Mode (single validator), all claims verified against on-disk source.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7-typecheck | `listMeetingsPaginated` 3rd-param signature + `filters` prop + `url` destructure type-safe across all 5 files | Fully-Automated | `bun run check` exits 0 | A |
| AC4-security | `parseMeetingFilterParams('mine', meId)` AND absent-param resolve to `meId` (server value), never a client id; junk → `meId` | Fully-Automated | `parseMeetingFilterParams` unit: `'mine'`→meId, absent→meId, foreign UUID→as-is, junk→meId | B (fix in this plan; red-first stub present) |
| AC1-parse | organizer/lead/sortDir/date param parsing (allow-list + date round-trip validation) + `'all'`→undefined | Fully-Automated | `parseMeetingFilterParams` unit: `'all'`→undefined, sortDir allow-list + invalid-date→undefined | B (fix in this plan) |
| AC1-AND-combo | AND-combination, inclusive `dateTo`, sort direction, filtered `total`/`hasMore` | Hybrid | `listMeetingsPaginated` filter/sort integration — precondition: `DATABASE_URL` set | D (SKIP_DB known-gap in CI; pre-accepted) |
| AC2/AC3-e2e | filters/sort persist across infinite-scroll pages; reset-to-page-1 on filter change | Agent-Probe | manual browser walkthrough: apply each filter, scroll to load more, confirm filtered results persist | D (backlog: e2e-auth-bootstrap fixture) |
| regression | existing 263 unit tests stay green | Fully-Automated | `bun run test:unit:ci` full suite green | A |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist (step 16); C — deferred to named later phase; D — backlog test-building stub / named residual.

C-4 reconciliation: `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy; the two D rows are named residuals, not proofs.

Legacy line form (retained for existing consumers):
- parse + security + regression: Fully-automated: `bun run check` && `bun run test:unit:ci`
- listMeetingsPaginated SQL filter/sort: hybrid: `bun run test:unit:ci` — precondition: `DATABASE_URL` set (else `describe.skipIf(SKIP_DB)`)
- filters-persist-across-scroll end-to-end: agent-probe: manual browser walkthrough
- automated e2e for the above: known-gap: documented as blocked on shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

Dimension findings:
- Infra fit: PASS — 5-file SvelteKit-app change; no container/worker/port surface. On disk: `$lib/components/ui/select` exports Select/SelectTrigger/SelectContent/SelectItem; `$app/state` (`page`) + `svelte/reactivity` (`SvelteURLSearchParams`) both used by the leads precedent (`leads/+page.svelte:3-4`, `:10`). Package scripts `check` + `test:unit:ci` confirmed.
- Test coverage: PASS (with pre-accepted known-gaps) — DB-free unit gate covers the security `'mine'`/absent→meId resolution + all param-parsing behaviors; the SKIP_DB Hybrid + the e2e gap match existing repo convention (`leads-filters.spec.ts`, `calendar.e2e.ts`). No developed behavior rests on Known-Gap alone.
- Breaking changes: PASS — `listMeetingsPaginated` has exactly 2 callers (`meetings/+page.server.ts:11`, `api/meetings/+server.ts:13`), both in the blast radius, both updated together; `listAllMeetings()` untouched (sole /calendar consumer). New `GET /api/meetings` params are additive + ignored-when-invalid (never 500).
- Security surface: PASS — re-verified after the parser change. `parseMeetingFilterParams(searchParams, meId)` takes `meId` as a trusted positional arg (never read from client); both call sites pass `locals.user.id` behind the existing `if (!locals.user) throw error(401)` guard. `'mine'`/absent/junk all resolve to `meId` server-side and can never be redirected to another identity. Foreign `organizer=<uuid>` filters only over already-team-visible cross-lead meetings — no disclosure beyond current behavior.
- Section — DB layer (`meetings.ts`): PASS — conditions-array + single shared `where` (applied to BOTH page + `count()`) + `asc(id)` tiebreaker on BOTH directions is correct + mechanically feasible (mirrors `listLeadsFiltered:356-443`, verified). Current on-disk `listMeetingsPaginated` already applies one `where` to both queries (lines 133/141/145) and already has `desc(startAt), asc(id)` (line 142) — the plan generalizes `sortFn` while keeping `asc(id)` on both. C1 organizer-default semantic now internally consistent: absent≡`mine`→`meId`, `all`→`undefined`, teammate UUID→as-is, junk→`meId`.
- Section — API route (`api/meetings/+server.ts`): PASS — `meId = locals.user.id` behind the 401 guard (confirmed line 7); auth guard + 401 unchanged; POST untouched.
- Section — Page loader (`meetings/+page.server.ts`): PASS — adds `url` to destructure, `meId = locals.user.id` (confirmed line 8 guard); returns raw `filters` for UI hydration; organizer display default `'mine'` agrees with parser's absent→`meId` (C1 fixed).
- Section — UI (`MeetingsPanel.svelte`): PASS — `loadMoreMeetings()` param-carry fix is correct against the current on-disk hardcoded `?page=${nextPage}&limit=8` string (confirmed line 56); the reset `$effect` (confirmed lines 43-48, tracks `void meetings`) genuinely re-fires because a URL-param filter change triggers a full SSR reload replacing the `meetings` prop. `setFilter('organizer', v)` writes the literal picked value (incl. `organizer=mine`) via the leads-copied `navigate` (truthy value → `params.set`, not deleted) — toolbar + server agree (C1 fixed).
- Section — Page (`meetings/+page.svelte`): PASS — single added `filters={data.filters}` prop.
- Section — Tests: PASS — step-16 `parseMeetingFilterParams` assertions now pinned: absent→`meId`, `'mine'`→`meId`, `'all'`→`undefined`, foreign UUID→as-is, junk→`meId`, sortDir allow-list, date round-trip.

Open gaps:
- listMeetingsPaginated SQL filter/sort correctness: known-gap: SKIP_DB-gated in CI until a live-DB harness exists — pre-accepted, matches `all-context.md` §Remaining v1 work + prior two meetings plans this session.
- Automated e2e (filters + infinite scroll persistence): known-gap: documented — blocked on the shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); any e2e written now must `test.skip()` per the `calendar.e2e.ts` pattern.
- Missing DB indexes on `crm_meetings.startAt` / `organizerId`: known-gap: out-of-scope perf note, acceptable at current CRM scale.

What this coverage does NOT prove:
- `bun run check` (AC7-typecheck): proves types compile across the 5 files; does NOT prove any runtime filter/sort result is correct, nor that "Mine" shows the intended set.
- `parseMeetingFilterParams` unit (AC4-security / AC1-parse): proves the pure parse/resolution logic (incl. `'mine'`/absent→meId, `'all'`→undefined, allow-lists); does NOT prove the SQL built from those params returns the right rows, nor that the UI wires the parsed values correctly.
- `listMeetingsPaginated` Hybrid (AC1-AND-combo): would prove SQL AND-combination / inclusive `dateTo` / sort / filtered `total`; when SKIP_DB-skipped in CI it proves NOTHING at gate time — this behavior stays a named residual until run against a local DB.
- Manual Agent-Probe (AC2/AC3-e2e): proves (when a human runs it) that filters persist across infinite-scroll pages + reset to page 1; does NOT run in CI — no automated regression guard until the e2e auth fixture exists.
- `bun run test:unit:ci` (regression): proves the existing 263 unit tests still pass; does NOT cover any new SQL or UI behavior beyond the new pure-function tests.

Gate: PASS (no FAILs, no unresolved CONCERNs; C1 resolved by supplement and re-verified against on-disk source; 3 pre-accepted known-gaps on record, non-blocking). Proceed to EXECUTE.
Accepted by: session (autonomous, /goal execution) — pre-accepted known-gaps only: (1) Hybrid `listMeetingsPaginated` SKIP_DB CI gap; (2) automated-e2e blocked on shared Playwright auth fixture; (3) missing perf indexes. C1 was NOT a residual — it was resolved by the supplement.

## Autonomous Goal Block

```
SESSION GOAL: Add organizer/lead/date-range filters + newest/oldest date-sort toggle to the /meetings list, integrated with infinite-scroll pagination (URL-param architecture mirroring Leads).
Charter + umbrella plan: N/A — single plan
Autonomy: /goal autonomous execution — proceed through EXECUTE on validate-contract; CONDITIONAL/known-gaps accepted on record; hard-stop only on irreversible/outward-facing actions not in the contract (per feedback_autonomous_phase_execution.md).
Hard stop conditions / safety constraints:
- 'mine' (and the absent-param default) MUST resolve server-side to locals.user.id (trusted meId arg), never from any client-supplied value — do not weaken this.
- Do NOT touch listAllMeetings() (only /calendar consumes it) — extend only listMeetingsPaginated.
- No schema/migration changes; purely additive params with self-scoped-default behavior.
Next phase: EXECUTE: process/general-plans/active/meetings-sort-filter_02-07-26/meetings-sort-filter_PLAN_02-07-26.md
Validate contract: inline in plan (## Validate Contract) — Gate PASS (02-07-26)
Execute start: fully-auto: `bun run check` && `bun run test:unit:ci` | hybrid: `bun run test:unit:ci` (precondition DATABASE_URL) | probe: manual browser filter+scroll walkthrough | high-risk pack: no
```
