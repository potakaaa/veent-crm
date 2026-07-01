---
name: plan:ufg-country-category-filters-spec
description: "Product-discovery SPEC for GitHub issue #91 — country and category filters on the Up for Grabs queue"
date: 01-07-26
feature: leads
---

# SPEC — Up for Grabs: Country and Category Filters (GitHub #91)

## Summary

Reps and managers working the "Up for grabs" queue (`/unassigned`) currently have to scroll
through every unowned lead to find ones they can actually work — e.g. a rep who only handles
Philippines events, or a manager scanning for unclaimed Conference leads. This change adds
country and category filter controls to the top of the Up for Grabs page so people can narrow
the queue to the leads relevant to them, select more than one value per filter, and see results
update instantly without a page reload — matching the fast, no-reload feel the rest of the CRM
already has.

## User Stories / Jobs To Be Done

- As a rep scanning Up for Grabs, I want to filter the queue by country, so that I only see
  leads for the regions I actually work.
- As a rep scanning Up for Grabs, I want to filter the queue by category (e.g. Conference,
  Concert, Sports), so that I can focus on the event types I'm best suited to pitch.
- As a rep or manager, I want to select multiple countries or multiple categories at once, so
  that I don't have to run the same filter repeatedly to cover several regions or categories in
  one sitting.
- As a rep or manager, I want my filter choices to stay in place while I page through, sort, or
  reload the queue in the same session, so I don't have to re-select them every time I take an
  action (claim, sort, page next).
- As a rep or manager, I want the list to update immediately when I change a filter, so that
  narrowing the queue feels instant and doesn't interrupt my flow with a full page reload.

## What The User Wants (Behavioral Outcomes)

- Two filter controls — **Country** and **Category** — appear at the top of the Up for Grabs
  page, in the same visual area as the page's existing header/controls.
- Each filter supports selecting **zero, one, or multiple values**. Selecting no values in a
  filter means "no restriction on that dimension" (all values included) — matching how omitting
  a filter works everywhere else in the app.
- Choosing values updates the visible lead list **without a full page reload** — the same
  soft-navigation behavior already used for sorting and paging on this page and for all filters
  on the Leads page.
- The country list offered is the distinct set of countries actually present among leads
  currently up for grabs (not a hardcoded global list) — consistent with how the Leads page
  populates its country filter today.
- The category list offered is every category the system supports (existing fixed set of event
  categories used across the CRM).
- Filters compose: selecting a country AND a category narrows to leads matching both.
- Selecting a filter resets pagination back to page 1 (so the user doesn't land on an
  out-of-range page for a now-smaller result set) — matching existing Leads page filter
  behavior.
- The existing selection/claim/bulk-assign/sort/edit behavior on the page continues to work
  unchanged while filters are active — filtering only changes which rows are visible, not what
  the row actions do.
- When a filter combination matches zero leads, the page shows a clear "no leads match" state
  (distinct from the existing empty-queue message), so the user knows to broaden their filters
  rather than assuming the queue is actually empty.
- The user can clear an individual filter or all filters and return to the unfiltered queue.

## Flow / State Diagram

```
                        ┌────────────────────────────┐
                        │   /unassigned page loads    │
                        │ (no filters = current state)│
                        └──────────────┬───────────────┘
                                       │
                                       v
                        ┌────────────────────────────┐
                        │ User opens Country or       │
                        │ Category filter control     │
                        └──────────────┬───────────────┘
                                       │
                     picks one or more values (multi-select)
                                       │
                                       v
                        ┌────────────────────────────┐
                        │ List updates in place        │
                        │ (soft navigation, no reload) │
                        │ page resets to 1              │
                        └──────────────┬───────────────┘
                                       │
                 ┌─────────────────────┼─────────────────────────┐
                 │                     │                         │
                 v                     v                         v
      ┌───────────────────┐  ┌──────────────────┐   ┌───────────────────────┐
      │ Matches found       │  │ Zero matches      │   │ User sorts / pages /   │
      │ → normal filtered   │  │ → "no leads match  │   │ claims / bulk-assigns  │
      │   list shown         │  │   your filters"    │   │ → filters persist,     │
      │                     │  │   empty state       │   │   still no full reload │
      └───────────────────┘  └──────────────────┘   └───────────────────────┘
                 │                     │                         │
                 └─────────────────────┴─────────────────────────┘
                                       │
                          user clears one/all filters
                                       │
                                       v
                        ┌────────────────────────────┐
                        │ Back to full unowned queue   │
                        └────────────────────────────┘
```

## Acceptance Criteria (Testable Outcomes)

1. Country and Category filter controls are visible at the top of the Up for Grabs page on
   load, before any filter is applied.
   `proven by:` Playwright e2e — Up for Grabs page render check.
   `strategy:` Fully-Automated

2. The Country filter accepts multiple selected values in one session; when multiple countries
   are selected, the visible leads are the union of leads from any of the selected countries.
   `proven by:` Playwright e2e — multi-select country filter scenario.
   `strategy:` Fully-Automated

3. The Category filter accepts multiple selected values in one session; when multiple
   categories are selected, the visible leads are the union of leads from any of the selected
   categories.
   `proven by:` Playwright e2e — multi-select category filter scenario.
   `strategy:` Fully-Automated

4. Selecting both a country and a category narrows results to leads matching both dimensions
   (AND across filter types, OR within a filter type's selected values).
   `proven by:` Playwright e2e — combined filter scenario.
   `strategy:` Fully-Automated

5. Changing a filter selection updates the visible lead list without a full browser page
   reload (SvelteKit soft navigation, matching existing sort/page behavior on this page).
   `proven by:` Playwright e2e — network/navigation assertion (no full document reload) on
   filter change.
   `strategy:` Fully-Automated

6. Filter selections remain applied when the user sorts a column, changes pages, claims a
   lead, bulk-claims, or bulk-assigns while on the filtered view — the filter is not silently
   dropped by these other in-page actions.
   `proven by:` Playwright e2e — filter-persistence-across-actions scenario.
   `strategy:` Fully-Automated

7. Filter selections persist across a browser reload of the same URL within the session (URL
   carries the filter state).
   `proven by:` Playwright e2e — reload-with-filter-in-URL scenario.
   `strategy:` Fully-Automated

8. Applying filters resets the visible page back to page 1 of the filtered result set.
   `proven by:` Playwright e2e — filter-then-page-reset scenario.
   `strategy:` Fully-Automated

9. When a filter combination matches no unowned leads, the page displays a distinct
   "no leads match your filters" empty state rather than the default "queue clear" message.
   `proven by:` Playwright e2e — zero-match empty-state scenario.
   `strategy:` Fully-Automated

10. The user can clear all filters (single action) and return to the full, unfiltered Up for
    Grabs queue.
    `proven by:` Playwright e2e — clear-filters scenario.
    `strategy:` Fully-Automated

11. The country options offered in the filter reflect countries actually present among current
    unowned leads (not a static/hardcoded list unrelated to real data).
    `proven by:` Vitest — `listUnassignedLeads`/country-options server query unit test.
    `strategy:` Fully-Automated

12. The category options offered in the filter cover the full set of lead categories supported
    by the system.
    `proven by:` Vitest — category options source unit test (enum-derived, not query-derived).
    `strategy:` Fully-Automated

13. Applying filters does not change or interfere with existing row actions (claim, bulk claim,
    bulk assign, inline edit, sort) — those continue to operate only on the currently visible,
    filtered rows.
    `proven by:` Playwright e2e — regression pass on existing Up for Grabs interaction suite
    with a filter active.
    `strategy:` Fully-Automated

## Out Of Scope

- Changing filter UI/behavior on `/leads` or `/pipeline` — this SPEC covers `/unassigned` only.
  If similar filters are desired elsewhere later, that is separate follow-up work.
- Adding new database columns, enum values, or migrations — `country` and `category` already
  exist on `crm_leads` and are sufficient for this feature.
- Saving a user's filter preferences beyond the current browser session/URL (e.g. a persisted
  "default filter" per user, cross-device sync, or server-stored filter presets). See Open
  Questions for the session-persistence definition being assumed.
- Adding filters beyond country and category (e.g. source, stage, date range) to the Up for
  Grabs page — only the two filters named in the issue are in scope.
- Any change to how leads become "up for grabs" (claim eligibility, ownership rules) — this is
  purely a filtering/visibility feature on top of the existing queue.
- Building a new reusable multi-select design-system component beyond what's needed to satisfy
  this feature (the specific implementation approach, including whether to build vs. adopt a
  library primitive, is an INNOVATE decision, not fixed here).

## Constraints

- Must not conflict with the just-completed inline-edit / `shadowLeads` optimistic-update state
  machine already on this page (issue #90 work) — filtering must coexist with claim, bulk-claim,
  bulk-assign, and inline-edit flows without breaking their optimistic UI.
- Must follow the app's established "no full reload" filtering convention: URL search params +
  `goto()` soft navigation (SvelteKit), the same mechanism already used by `/leads` filters and
  by this page's existing sort/page controls.
- Must use server-side DB filtering (Drizzle query in `+page.server.ts`), not client-side
  filtering of an already-fetched page of results — the queue is paginated, so filtering must
  happen before pagination, not after.
- No raw `FormData` handling; if any form-like input is needed it follows existing app
  conventions, but this is fundamentally GET/query-param-driven filtering, not a Superforms
  submission (matching how `/leads` filters work today — they are plain `<Select>` +
  `SvelteURLSearchParams`, not a Superforms form).
- Soft-delete convention must be respected: filtered queries must continue to exclude
  soft-deleted leads (`deletedAt IS NULL`), matching the existing `listUnassignedLeads()`
  behavior.
- No hardcoded lists where a canonical source already exists: category options come from the
  existing `leadCategory` Postgres enum; country options come from actual data (distinct
  present values), not a static list.

## Open Questions

None. The following assumption is locked based on codebase precedent and should be flagged to
the user only if they push back at the Phase-End Recommendation Gate:

- **"Persist within the session" = URL-param persistence.** No `sessionStorage`/`localStorage`
  usage exists anywhere in this codebase (confirmed by search), and every existing filter in the
  app (Leads page: stage, platform, country, staleOnly) persists via URL search params only —
  which survives reload and back/forward navigation but resets if the user navigates to
  `/unassigned` fresh with no params. This SPEC adopts that same convention for country/category
  filters, since it matches 100% of existing precedent in this app and satisfies the issue's
  stated acceptance criteria ("persist within the session", "results update without a full page
  reload"). If the user instead wants filters to survive a fresh navigation to `/unassigned`
  with no URL params (true browser-session storage), that is a new pattern for this codebase and
  should be raised explicitly — Owner: user, to confirm at Phase-End Recommendation Gate.

## Background / Research Findings

- `/unassigned` (`src/routes/unassigned/+page.server.ts`, `src/routes/unassigned/+page.svelte`)
  currently has zero filter support — only `page`, `sort`, `dir` params. It was just modified by
  the just-completed `ufg-inline-edit-review-removal` work (inline edit modal, `shadowLeads`
  optimistic-update state machine); any new filter UI must coexist with that.
- `listUnassignedLeads()` in `src/lib/server/db/leads.ts` (~line 362-410) has a hardcoded `where`
  clause with no filter params — will need `country`/`category` params added, following the
  sibling `listLeadsFiltered()` pattern (~line 227+) used by `/leads`.
- DB columns confirmed: `crmLeads.category` — Postgres enum `leadCategory`
  (`pgEnum('crm_lead_category', [...])`, `schema.ts:25`, column at `schema.ts:120`, NOT NULL
  default `'Other'`). `crmLeads.country` — free text, indexed (`schema.ts:122`,
  `crm_leads_country_idx`). Both live directly on `crm_leads` — the issue's "event's
  country/location" and "event category/type" map to these two columns (a separate
  `eventCategory` text column exists but belongs to `crmActivities`, an unrelated table —
  confirmed not applicable here).
- `/leads` already has a working filter convention: `src/routes/leads/+page.svelte` uses a
  `setFilter(key, value)` helper that builds a `SvelteURLSearchParams` from
  `page.url.searchParams`, patches the key, and calls `goto('?'+params, { keepFocus: true })` —
  the app's established "no full reload" mechanism (SvelteKit soft navigation via `goto()`,
  re-running `load()`). Country filtering there is currently **single-select** — exact match via
  shadcn `<Select>` (Radix single-value primitive) — and its country option list comes from
  `data.countries`, a distinct-values list sourced server-side (not hardcoded).
  Category is not currently filterable on `/leads` either.
- **No multi-select UI component exists anywhere in the codebase** (confirmed via grep — zero
  `MultiSelect` matches). The issue's "Multiple values can be selected per filter" is genuinely
  new UI surface with no direct reuse candidate — this is a decision point for INNOVATE, not
  SPEC.
- **No `sessionStorage`/`localStorage` usage exists anywhere in the codebase** (confirmed via
  grep). The existing "persistence" convention is URL search params only. See Open Questions for
  how this SPEC resolves the issue's "persist within the session" wording against that
  precedent.
- `leadCategory` enum values (`schema.ts:25`): `Sports`, `Workshop`, `Church`, `Theater`,
  `Bar/DJ`, `Conference`, `Music Fest`, `Fan Fair`, `School`, `Concert`, plus additional values
  not shown in the truncated read — the full enum list should be read directly from
  `schema.ts` during PLAN/EXECUTE as the canonical source, never hardcoded into UI copy.
