---
name: plan:organizer-list-pagination-filters-spec
description: "Product-discovery SPEC for pagination, sorting, search, and filters on the Organizers list page and Organizer detail page, mirroring the Leads page patterns"
date: 06-07-26
feature: organizers
---

# SPEC — Organizer List & Detail: Pagination, Sorting, Search, Filters

## Summary

The Organizers list page and each Organizer's detail page currently show everything at once, with no way to sort, search, or narrow down what you're looking at. As the number of organizers and the number of leads tied to each organizer grows, both pages become slow to scan and hard to use. This work brings the Organizers section up to the same standard as the Leads page: page through results instead of loading everything, click a column header to sort, type to search, and use dropdown filters to narrow the list — all using the exact same interaction patterns already proven on the Leads page, so the experience feels consistent across the app.

## User Stories / Jobs To Be Done

1. **As a** sales rep, **I want** the Organizers list to load in pages of 10 instead of all at once, **so that** the page stays fast even as more organizers are added.
2. **As a** sales rep, **I want** to click the "Name" or "Leads" column header on the Organizers list to sort by that column, **so that** I can quickly find the organizer with the most leads or look someone up alphabetically.
3. **As a** sales rep, **I want** to search the Organizers list by typing a name, **so that** I can jump straight to the organizer I'm looking for instead of scanning pages.
4. **As a** sales rep, **I want** to filter the Organizers list by country, **so that** I can focus on organizers in a specific market.
5. **As a** sales rep, **I want** to click the "Event" or "Event Date" column header on an organizer's detail page to sort that organizer's event history, **so that** I can see the newest or oldest events first, or group by event name.
6. **As a** sales rep, **I want** to search an organizer's event history by typing, **so that** I can find a specific past event without scrolling.
7. **As a** sales rep or manager, **I want** to filter an organizer's event history by country, owner, and stage, **so that** I can answer questions like "what has this organizer's rep tried that's still active?" without manually scanning every row.
8. **As any user**, **I want** all of this to look and behave exactly like the equivalent controls on the Leads page, **so that** I don't have to learn a new interaction pattern for a page that does the same kind of job.

## What The User Wants (Behavioral Outcomes)

**Organizers list page (`/organizers`):**
- Only 10 organizers are shown at a time, with "Page N of M" and Prev/Next controls to move between pages (matching how `/leads` paginates today — no infinite scroll).
- The "Name" and "Leads" column headers are clickable. Clicking toggles sort direction and shows an up/down arrow next to the active sort column, exactly like the arrow shown on the Leads page's "Event" header.
- A search box narrows the list to organizers matching what's typed, updating shortly after typing stops (no need to press Enter).
- A country dropdown filter narrows the list to organizers located in the selected country; the default option shows all countries regardless of location text formatting.
- Changing the search text, the filter, or the sort column always takes the user back to page 1 of the results — so they never end up on an empty or confusing page after changing what they're looking at.
- The lead count shown per organizer continues to reflect only that organizer's current (non-deleted) leads, unaffected by list-level filters.

**Organizer detail page (`/organizers/[id]`):**
- The event-history table (the list of every lead ever linked to this organizer) gains the same kind of interactive header on "Event" and "Event Date" — click to sort, arrow shows direction.
- A search box narrows the event history to rows matching what's typed.
- Three dropdown filters — country, owner, and stage — narrow the event history further, each independently combinable with the others and with search.
- All of the above only ever shows leads the viewing user is already allowed to see (existing visibility scoping is unaffected — filters narrow within what's visible, they never reveal additional leads).
- Because this list can be long for organizers with many events, the same kind of paging behavior used on the list page should apply here as well so the detail page doesn't have to render an unbounded table.

## Flow / State Diagram

```
/organizers
┌─────────────────────────────────────────────────────────┐
│ [Search box]         [Country: All ▾]                    │
│ Name ↑          Handle      Location      Leads          │
│ ------------------------------------------------------- │
│ (10 rows per page, click a row to open detail)           │
│ ------------------------------------------------------- │
│                 [Prev]  Page 1 of 4  [Next]               │
└─────────────────────────────────────────────────────────┘
        │ type in search / change country / click header
        ▼
   URL updates (?q=&country=&sort=&dir=&page=1) → reload page 1
        │ click a row
        ▼
/organizers/[id]
┌─────────────────────────────────────────────────────────┐
│ Organizer name / handle / location                        │
│ [Add Event]                                                │
│ [Search box] [Country ▾] [Owner ▾] [Stage ▾]              │
│ Event ↑    Event Date    Stage    Owner                   │
│ ------------------------------------------------------- │
│ (paged rows of linked leads, visibility-scoped)            │
│ ------------------------------------------------------- │
│                 [Prev]  Page 1 of N  [Next]                │
└─────────────────────────────────────────────────────────┘
        │ type in search / change any filter / click header
        ▼
   URL updates (?q=&country=&owner=&stage=&sort=&dir=&page=1) → reload page 1
```

## Acceptance Criteria (Testable Outcomes)

1. **Organizers list shows 10 organizers per page, with Prev/Next controls and a "Page N of M" indicator.** Navigating pages never shows fewer than 10 rows except on the last page.
   proven by: DB-query-level pagination test on the organizers list query (mirrors `listLeadsFiltered` pagination coverage)
   strategy: Fully-Automated

2. **Clicking the "Name" column header on the Organizers list sorts alphabetically; clicking again reverses the direction; an arrow indicator shows the active sort column and direction.**
   proven by: sort-toggle unit/integration test on the organizers list query (asc → desc → asc cycle, matching `tableSort.ts` behavior)
   strategy: Fully-Automated (query logic) / Agent-Probe (visual arrow rendering — pending shared Playwright auth fixture)

3. **Clicking the "Leads" column header on the Organizers list sorts by each organizer's current lead count, in either direction.**
   proven by: sort-by-aggregate-count query test
   strategy: Fully-Automated

4. **Typing in the Organizers list search box narrows results to organizers whose name (or handle) matches, and updates automatically after a short pause without needing to press Enter.**
   proven by: search-filter query test (`ilike` match against organizer name/handle) — mirrors leads search convention
   strategy: Fully-Automated (query logic) / Agent-Probe (debounce timing — pending shared Playwright auth fixture)

5. **Selecting a country in the Organizers list filter narrows results to organizers whose (normalized) location matches that country; the default option shows all organizers regardless of country.**
   proven by: country-filter query test using the existing `normalizeCountry()` utility against organizer `location` values
   strategy: Fully-Automated

6. **Changing sort, search, or the country filter on the Organizers list always resets the current page back to 1.**
   proven by: page-reset-on-filter-change query/integration test
   strategy: Fully-Automated

7. **The lead count shown for each organizer on the list reflects only that organizer's current, non-deleted linked leads — unaffected by any list-level search/filter/sort applied to the organizers themselves.**
   proven by: lead-count-integrity test (existing organizer lead-count query, re-verified alongside new pagination/filter logic)
   strategy: Fully-Automated

8. **On the Organizer detail page, clicking the "Event" or "Event Date" column header sorts the event-history table by that column, with a visible direction arrow, toggling asc/desc on repeated clicks.**
   proven by: sort-toggle query test on `listLinkedLeadsForOrganizer` (or its replacement)
   strategy: Fully-Automated (query logic) / Agent-Probe (visual arrow — pending shared Playwright auth fixture)

9. **Typing in the Organizer detail page's search box narrows the event-history rows to matches, updating automatically after a short pause.**
   proven by: search-filter query test scoped to one organizer's linked leads
   strategy: Fully-Automated (query logic) / Agent-Probe (debounce timing)

10. **Selecting a country, owner, or stage filter on the Organizer detail page narrows the event-history rows accordingly; the three filters combine (AND) with each other and with search.**
    proven by: multi-filter combination query test (country + owner + stage + search applied together)
    strategy: Fully-Automated

11. **The Organizer detail page's event-history list never shows a lead the viewing user is not otherwise allowed to see — visibility scoping (`visibilityCondition()`) applies before or alongside all new filters, not instead of them.**
    proven by: visibility-scoping regression test on `listLinkedLeadsForOrganizer` with filters applied (existing owner-scoping preserved)
    strategy: Fully-Automated

12. **Changing sort, search, or any filter on the Organizer detail page resets that page's pagination back to page 1.**
    proven by: page-reset-on-filter-change test scoped to the detail page
    strategy: Fully-Automated

13. **All new controls (search input, dropdown filters, sortable headers, Prev/Next pagination) visually and behaviorally match the equivalent controls already shipped on `/leads`** (same component types, same debounce timing, same arrow indicator style, same URL-param-driven `navigate()` plumbing).
    proven by: manual visual comparison against `/leads` + Agent-Probe pass once the shared Playwright auth fixture lands
    strategy: Agent-Probe / Known-Gap (pre-accepted repo-wide gap — no authenticated e2e harness yet)

## Out Of Scope

- Any schema change to `crm_organizers` (no new `country` column — country values are derived at query time from the existing `location` field via the existing `normalizeCountry()` utility).
- Infinite-scroll pagination (the pattern used by `/meetings`) — this work uses classic Prev/Next pagination only, matching `/leads`.
- Building a new shared, reusable pagination-controls component — unless INNOVATE decides extraction is warranted, the leads page's inline pagination markup is copied/adapted, not abstracted.
- Any change to the Leads page itself (`/leads`) — it is the reference pattern, not a target of this work.
- Any change to how the organizer detail page's "Add Event" button, event-history data model, or lead-creation flow works — those are unaffected by adding pagination/sort/search/filter.
- Bulk actions, exports, or saved-filter/saved-search features — not requested.
- Filtering the organizer detail page's owner filter beyond the leads currently linked to that one organizer (i.e., no cross-organizer owner filtering here).

## Constraints

- No new database columns or migrations for `crm_organizers` — country derivation must reuse `normalizeCountry()` (`src/lib/server/import-utils.ts`) against the existing `location` field, with no schema change.
- Must reuse existing shared UI primitives exactly as used on `/leads`: shadcn `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` for filters, shadcn `Input` for search, and the headless `makeSortTable` utility (`src/lib/utils/tableSort.ts`) for sortable headers — no new sorting or filter UI pattern may be invented.
- Must reuse the existing URL-param-driven `navigate(patch)` plumbing pattern from `/leads` (merge/delete `URLSearchParams`, call `goto()`) for every control (search, filters, sort, pagination) on both pages.
- Server-side sort columns must be validated against an explicit allowlist (mirroring `LEADS_SORT_COLS_SET`) before being used in a query — never pass raw user input into `ORDER BY`.
- The organizer detail page's existing visibility scoping (`visibilityCondition()`) and owner-name enrichment (`enrichWithOwnerNames()`) must continue to apply — new filters narrow within the visibility-scoped set, they do not replace or bypass it.
- Pagination page size on `/organizers` is fixed at 10 per the user's explicit request (distinct from Leads' page size of 25 — do not default to matching Leads' constant).
- Must not modify `/leads` or its server logic — read-only reference only.

## Open Questions

None — all items the user was asked about were pre-resolved in this session (country-derivation approach was locked by the user with no schema change; page-size of 10 was explicit). Two implementation-shape questions are intentionally deferred to INNOVATE, not blocking SPEC sign-off:

- Owner-filter scope on the detail page: should the owner dropdown list only owners actually present among that organizer's linked leads, or the full team/user list (same as `/leads`)? (INNOVATE decision — does not change the user-visible acceptance criteria above, only which values populate the dropdown.)
- How to implement sorting the list page's "Leads" column (a `count()` aggregate) server-side — subquery vs. window function vs. post-query sort. (INNOVATE/PLAN decision — the acceptance criterion is the observable sort behavior, not the query shape.)

## Background / Research Findings

- Reference implementation is `src/routes/leads/+page.server.ts` (134 lines) + `src/routes/leads/+page.svelte`: `PAGE_SIZE` constant, `page` URL param, Drizzle LIMIT/OFFSET with a parallel `count()` query, "Page N of M" + Prev/Next rendered inline (no shared component). This is a classic pagination pattern, distinct from `/meetings`' infinite-scroll pattern — the user explicitly wants the classic pattern mirrored, not infinite scroll.
- Sorting on `/leads` uses `sort`/`dir` URL params validated server-side against an explicit allowlist (`LEADS_SORT_COLS_SET`), plus a reusable **headless** client utility `src/lib/utils/tableSort.ts` (`makeSortTable` — `getHeaderGroups`, `getCanSort`, `getIsSorted`, `getToggleSortingHandler`). It is not a visual component; it drives whichever markup the page defines. Click cycles asc → desc → asc and shows a ↑/↓ suffix. Any sort change resets to page 1.
- Search on `/leads` is a plain shadcn `<Input>` with `oninput` debounced 300ms, calling `navigate({q, page: undefined})`; server applies `ilike()` against name + normalizedHandle equivalents.
- Filters on `/leads` use shadcn `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, single-select, calling `setFilter(key, value)` → `navigate()`, resetting page to 1.
- All controls funnel through one shared `navigate(patch)` helper that merges/deletes `URLSearchParams` and calls `goto()` — this exact plumbing is the pattern to replicate, not a new one.
- The country filter's dropdown UX (screenshot-confirmed) shows "All countries" as the default option plus the distinct clean country values present in the data (currently "Philippines"/"Singapore").
- Current state of `/organizers` (`+page.server.ts`, 10 lines): calls `listOrganizersWithLeadCount()` with zero params — no page, sort, search, or filter support exists today. `+page.svelte` (88 lines) is a static table.
- Current state of `/organizers/[id]` (`+page.server.ts`, 18 lines): calls `getOrganizer(id)` then `listLinkedLeadsForOrganizer(organizer.id, userId, role)` with zero query/filter params — plain `.orderBy(eventDate DESC NULLS LAST)`, no LIMIT, no search/stage/owner/country params today. It already applies `visibilityCondition()` (owner-scoping) and `enrichWithOwnerNames()`, both of which must be preserved.
- **Country filter design decision (user-locked, no schema change):** `crm_organizers` has no `country` column, only free-text `location`. The existing `normalizeCountry()` utility (`src/lib/server/import-utils.ts`, originally built for lead country-normalization) maps variant location text (e.g. "Makati City, Philippines", "PH", "Pilipinas") to canonical values ("Philippines"/"Singapore"). This SPEC requires reusing that exact utility to derive organizers' country values from their existing `location` field at query time — no migration, no new column, and the resulting dropdown UX must match `/leads`' country filter exactly.
- `makeSortTable` and the shared UI primitives (`Select`, `Input`, `Button`) are directly reusable with no new component to invent. No shared classic-pagination-controls component currently exists separate from the leads page's inline JSX — extracting one is optional and left to INNOVATE, not required by this SPEC.
- Sorting the list page's "Leads" column requires sorting by an aggregate (`count()` of linked leads per organizer) — a different query shape than the simple-column sorts `/leads` already does. Flagged for INNOVATE/PLAN, not a SPEC blocker.
- The organizer detail page's owner/stage/country filters apply only to the child leads within one organizer (not cross-organizer). Whether the owner-filter dropdown is scoped to owners actually present among that organizer's leads, or the full org-wide user list (matching `/leads`' `listUsers()` pattern), is left open for INNOVATE.
- Test tier split: DB-query-level pagination/sort/filter logic is Fully-Automated (mirrors the existing `leads.ts` test convention); UI interaction verification (debounce timing, arrow rendering, click-through) is Agent-Probe/Known-Gap because this repo has a pre-accepted, repo-wide missing shared Playwright authenticated-session fixture blocking e2e proof for several other features already (see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- Related prior/adjacent work already in this feature folder: `organizer-listing-detail_06-07-26` (built the base list/detail pages this SPEC extends) and `organizer-lead-tagging-ui_06-07-26` (unrelated — tagging a lead to an organizer from the lead side). Neither conflicts with this scope.
