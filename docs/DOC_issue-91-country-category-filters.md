# Issue #91 — Country + Category Filters on Up for Grabs (+ Follow-Up Display Columns)

Implemented: 2026-07-01
Surfaces: `/unassigned` (filters + new table columns)

---

## What It Does

Two connected changes shipped in sequence on the same page:

1. **Country + category multi-select filters (GitHub #91).** The Up for Grabs queue
   (`/unassigned`) gets two new filter controls — **Country** and **Category** — rendered above
   the table. Each is a popover with checkboxes; a rep or manager can select zero, one, or many
   values per filter. Selections are OR'd within a filter ("US or PH") and AND'd across filters
   ("US or PH, AND Conference or Concert"). The list updates instantly via SvelteKit soft
   navigation (`goto()`), matching the existing sort/page behavior on this page — no full reload.
   Filter state lives in the URL (`?country=US,PH&category=Concert,Sports`), so it survives a
   reload of the same URL and persists across claim/bulk-claim/sort/page actions that already use
   the same `navigate()` helper.

2. **Country + Category display columns (follow-up quick fix).** After the filters shipped, the
   table itself gained dedicated **Country** and **Category** columns. Previously category was
   only visible as small print under the organizer name, and country wasn't shown anywhere in the
   table — so a rep filtering by country had no way to visually confirm which row matched which
   country without opening it. The columns are display-only (no server-side sort added).

Both changes are scoped entirely to `/unassigned`. No changes to `/leads`, `/pipeline`, schema, or
any API contract.

---

## Part 1 — Country + Category Filters

### The filter predicate: country options are scoped, category options are static

**File:** `src/lib/server/db/leads.ts`

The two filters get their option lists from very different sources, and that difference is
deliberate (SPEC AC#11, AC#12):

- **Country options** come from a new query-derived helper, `getUnassignedLeadCountries()`. It
  must offer only countries that actually exist among leads currently in the Up for Grabs queue —
  not a static list, and not every country in the whole `crm_leads` table (that's what the
  existing, unscoped `getLeadCountries()` does for `/leads`, and it was **deliberately not
  reused** here).
- **Category options** come from the `leadCategory` Postgres enum directly (`schema.ts` — pgEnum
  export) — never DB-queried. The category list is fixed and enum-derived by design.

Both `getUnassignedLeadCountries()` and `listUnassignedLeads()` share one predicate function so
they can never drift out of scope-parity with each other:

```ts
/**
 * Base predicate for the Up for Grabs (unassigned) queue: unowned, not soft-deleted,
 * and not in a terminal (won/lost) stage. Shared so the country-options helper and the
 * list query stay in scope-parity — if this predicate changes, both callers change together.
 */
const unassignedBaseConditions = (): SQL[] => [
	isNull(crmLeads.ownerId) as SQL,
	isNull(crmLeads.deletedAt) as SQL,
	ne(crmLeads.stage, 'won'),
	ne(crmLeads.stage, 'lost')
];

/**
 * Distinct non-null countries among leads currently in the Up for Grabs queue. Deliberately NOT
 * getLeadCountries(), which is unscoped and would offer countries for leads that
 * are not even in this queue.
 */
export async function getUnassignedLeadCountries(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ country: crmLeads.country })
		.from(crmLeads)
		.where(and(...unassignedBaseConditions(), isNotNull(crmLeads.country)))
		.orderBy(asc(crmLeads.country));
	return rows.map((r) => r.country as string);
}
```

Any future edit to who counts as "up for grabs" (e.g. adding another terminal stage) only needs to
change `unassignedBaseConditions()` once — both the row query and the country-options query pick
up the change automatically.

### `listUnassignedLeads()` — additive, backward-compatible filter param

**File:** `src/lib/server/db/leads.ts`

The function signature gained one new optional 5th parameter. The plan confirmed at VALIDATE that
`listUnassignedLeads` has exactly one caller in the whole codebase (`+page.server.ts`), so the
additive change carries zero breaking-change risk.

```ts
export async function listUnassignedLeads(
	page = 1,
	pageSize = 25,
	sort?: string,
	dir?: 'asc' | 'desc',
	filters?: { country?: string[]; category?: string[] }
): Promise<{ leads: Lead[]; total: number }> {
	const conditions = unassignedBaseConditions();

	// Multi-select filters: OR within a filter (inArray), AND across filters (separate conditions).
	// Empty/omitted array = no restriction (existing behavior preserved — backward compatible).
	if (filters?.country && filters.country.length > 0) {
		conditions.push(inArray(crmLeads.country, filters.country));
	}
	if (filters?.category && filters.category.length > 0) {
		conditions.push(inArray(crmLeads.category, filters.category as DbLead['category'][]));
	}

	const where = and(...conditions);
	// ... existing sort/pagination logic unchanged
}
```

Omitting `filters` (or passing empty arrays) behaves identically to before this change — the
`inArray()` conditions are only pushed onto the `conditions` array when the respective filter array
is non-empty. "No selection" means "no restriction," matching how every other filter in the app
works.

### CSV param parsing — `parseFilterCsv()`

**File:** `src/lib/server/db/leads.ts`

A small, pure, exported helper handles the URL-param encoding for both filters. It was
deliberately extracted as a named export in `leads.ts` (a within-blast-radius deviation from the
plan, which sketched it inline in `+page.server.ts`) specifically so it could be unit-tested in
isolation without a Vitest module-mock of the whole server load function.

```ts
/**
 * Parse a comma-joined CSV filter value (e.g. `?country=US,PH`) into a string array,
 * stripping empty elements. The `.filter(Boolean)` is required: a trailing comma or an
 * empty param value would otherwise yield a stray `''` element that becomes an
 * `inArray(col, [''])` clause matching nothing while misrepresenting "no filter."
 * Pure — unit-testable without a DB.
 */
export function parseFilterCsv(raw: string | null | undefined): string[] {
	return (raw ?? '').split(',').filter(Boolean);
}
```

The `.filter(Boolean)` step is not cosmetic — without it, a value like `?country=` or
`?country=US,` would silently produce a filter clause that matches zero rows, making the queue
look empty instead of unfiltered.

### Route wiring

**File:** `src/routes/unassigned/+page.server.ts`

```ts
const country = parseFilterCsv(url.searchParams.get('country'));
const category = parseFilterCsv(url.searchParams.get('category'));

const [result, users, countryOptions] = await Promise.all([
	listUnassignedLeads(page, PAGE_SIZE, sort, dir, { country, category }),
	listUsers(),
	getUnassignedLeadCountries()
]);

return {
	leads: result.leads,
	users,
	sort: sort ?? '',
	dir,
	categoryOptions: [...leadCategory.enumValues],
	countryOptions,
	filters: { country, category },
	pagination: { /* unchanged */ }
};
```

`categoryOptions`, `countryOptions`, and `filters` are new, additive fields on the page's `data`
object. Nothing existing was removed or renamed.

### `MultiSelectFilter.svelte` — new component

**File:** `src/lib/components/leads/MultiSelectFilter.svelte` (new, ~70 lines)

Per the locked INNOVATE decision, this is a page-local component composed from the existing
`Popover` primitive (`$lib/components/ui/popover` — `Popover.Root` / `Trigger` / `Content`), not a
new design-system primitive and not a new dependency. No multi-select component existed anywhere
in the codebase before this (confirmed via grep during RESEARCH), so this was genuinely new UI
surface, kept intentionally small and single-purpose.

```svelte
let {
	label,
	options,
	selected,
	onchange
}: {
	label: string;
	options: string[];
	selected: string[];
	onchange: (values: string[]) => void;
} = $props();

function toggle(option: string) {
	const next = selected.includes(option)
		? selected.filter((v) => v !== option)
		: [...selected, option];
	onchange(next);
}

function clear() {
	if (selected.length > 0) onchange([]);
}
```

The trigger button shows the filter name plus a count badge when active (e.g. `Country (2)`), and
gets a visually distinct (primary-colored) border/text when any value is selected. The popover
panel is a scrollable checkbox list (`max-h-80 overflow-y-auto`) with a per-filter "Clear" button
in the header that only renders when `selected.length > 0`. There is no separate "Apply" step —
every checkbox toggle calls `onchange` immediately, matching the SPEC's "updates instantly"
requirement.

The popover trigger's dropdown caret uses a plain `▾` glyph (`<span aria-hidden="true">`) rather
than an `Icon` component — see [Honest Limitations](#honest-limitations) for why.

### Page wiring — `+page.svelte`

**File:** `src/routes/unassigned/+page.svelte`

Two filter helpers were added, both funneling through the pre-existing `navigate()` helper (added
by the prior issue #90 inline-edit work) rather than duplicating URL-manipulation logic:

```ts
// Filters: comma-join the selection into the URL param (or drop it when empty), and always
// reset to page 1 so the filtered result starts at the beginning.
function setFilter(key: 'country' | 'category', values: string[]) {
	navigate({ [key]: values.join(',') || undefined, page: undefined });
}
function clearAllFilters() {
	navigate({ country: undefined, category: undefined, page: undefined });
}
const hasActiveFilters = $derived(
	data.filters.country.length > 0 || data.filters.category.length > 0
);
```

Passing `page: undefined` in the same `navigate()` call satisfies SPEC AC#8 (applying a filter
resets to page 1) in the same round-trip as the filter change itself — no separate effect or extra
navigation needed.

The two `MultiSelectFilter` instances render in a new row directly under `PageHeader`, followed by
a conditional "Clear all filters" text button (SPEC AC#10, an explicit checklist item rather than
an implied side-effect of the per-filter clear):

```svelte
<div class="mb-3.5 flex flex-wrap items-center gap-2">
	<MultiSelectFilter
		label="Country"
		options={data.countryOptions}
		selected={data.filters.country}
		onchange={(values) => setFilter('country', values)}
	/>
	<MultiSelectFilter
		label="Category"
		options={data.categoryOptions}
		selected={data.filters.category}
		onchange={(values) => setFilter('category', values)}
	/>
	{#if hasActiveFilters}
		<button onclick={clearAllFilters} class="...">Clear all filters</button>
	{/if}
</div>
```

### Zero-match empty state (SPEC AC#9)

The existing empty state ("No leads up for grabs — queue clear.") is now split into two visibly
distinct messages depending on whether a filter is active:

```svelte
{:else}
	<div class="p-12 text-center text-[13px] text-ink-200">
		{#if hasActiveFilters}
			No leads match your filters.
		{:else}
			No leads up for grabs — queue clear.
		{/if}
	</div>
{/each}
```

This prevents a rep from reading "queue clear" as "the whole queue is empty" when actually their
filter combination just matched nothing.

### No regression to existing row actions

Claim, bulk-claim, bulk-assign, inline-edit, and sort all continue to operate on `shadowLeads` —
the already server-filtered result set. No client-side re-filtering logic was introduced anywhere
in `+page.svelte`; filtering only changes which rows the server returns, not what any row action
does once a row is visible.

---

## Part 2 — Country + Category Display Columns (Follow-Up)

Once the filters shipped, a small follow-up added the corresponding **Country** and **Category**
columns to the table itself, so the filtered results are visually confirmable at a glance without
opening each lead.

### `Lead.country` — made optional, not required

**File:** `src/lib/types/index.ts`

```ts
export interface Lead {
	// ...
	category: Category;
	location: string;
	country?: string;
	// ...
}
```

This was a deliberate scope-guard decision, not an oversight. Making `country` a **required**
field broke `bun run check` with 18 typecheck errors across two unrelated stub mock files —
`src/lib/data/mock-data.ts` and `src/lib/services/mock-crm-client.ts` — which predate this feature
and don't set `country` on their fixture leads. Both files are out of this change's scope guard
(they're legacy mock-data stubs unrelated to the real DB path), so `country` was made **optional**
instead of touching them. See [Honest Limitations](#honest-limitations) for the resulting caveat.

### `dbRowToLead()` — real DB rows always get a value

**File:** `src/lib/server/db/leads.ts`

```ts
country: row.country ?? '—',
```

Every lead sourced from the real database gets either its actual country value or a `'—'`
placeholder — `country` is only ever `undefined` for the untouched mock-data stub files, never for
a real row.

### New table columns

**File:** `src/routes/unassigned/+page.svelte`

The `columns` array passed to `makeSortTable()` gained two new entries, both `enableSorting: false`
(display-only — no server-side sort support was added for these columns):

```ts
columns: [
	{ id: '_select', header: '', enableSorting: false },
	{ id: 'name', header: 'Organizer / page' },
	{ id: 'event', header: 'Event' },
	{ id: 'stage', header: 'Stage' },
	{ id: 'source', header: 'Source' },
	{ id: 'country', header: 'Country', enableSorting: false },
	{ id: 'category', header: 'Category', enableSorting: false },
	{ id: '_lastOwner', header: 'Last owner', enableSorting: false },
	{ id: '_actions', header: '', enableSorting: false }
],
```

The CSS-grid column template widened from 7 to 9 tracks to make room for the two new cells:

```ts
const grid = 'grid grid-cols-[36px_2fr_1.6fr_1fr_90px_100px_110px_1fr_110px] gap-3';
```

And the two new cells render between the Source and Last-owner cells:

```svelte
<div class="truncate font-mono text-[12px] text-ink-400">{l.country}</div>
<div class="truncate font-mono text-[12px] text-ink-400">{l.category}</div>
```

Category was previously only visible as small print under the organizer name (`{l.handle} ·
{l.category}`) — that inline display is unchanged; the new column is an additional, more scannable
place to see the same value, plus the new Country column which had no prior display location at
all.

---

## Public Contract Changes

| Contract | Change | Consumers |
|----------|--------|-----------|
| `listUnassignedLeads(page, pageSize, sort, dir, filters?)` | Gains optional 5th param `filters?: { country?: string[]; category?: string[] }`; omitting it behaves identically to before | `src/routes/unassigned/+page.server.ts` (sole caller — confirmed at VALIDATE) |
| `getUnassignedLeadCountries()` | **New** export from `src/lib/server/db/leads.ts` | `src/routes/unassigned/+page.server.ts` |
| `parseFilterCsv(raw)` | **New** exported pure helper from `src/lib/server/db/leads.ts` | `src/routes/unassigned/+page.server.ts` |
| `+page.server.ts` load return shape | Gains `categoryOptions: string[]`, `countryOptions: string[]`, `filters: { country: string[]; category: string[] }` — additive only | `src/routes/unassigned/+page.svelte` |
| `Lead.country` | Now `country?: string` (optional) on the `Lead` interface | All `Lead` consumers; real-DB rows always populate it, mock-data stub fixtures may omit it |
| `MultiSelectFilter` (new component) | Props: `label: string`, `options: string[]`, `selected: string[]`, `onchange: (values: string[]) => void` | `src/routes/unassigned/+page.svelte` (sole consumer) |
| `/api/leads/*` routes | No change — filtering is load-time only, never exposed as an API | — |

---

## Tests

### Part 1 — Filters (from the VALIDATE-corrected plan)

The validate-contract (`Gate: CONDITIONAL`) reclassified 9 of the original 13 planned
"Fully-Automated (Playwright)" rows after RESEARCH found the repo has **no e2e session-bootstrap
mechanism for the real Better Auth flow** — a pre-existing, repo-wide gap (introduced when
`DEV_BYPASS` was removed and real Better Auth wiring landed), not something this feature
introduced. The reclassification split 13 acceptance criteria into:

- **5 rows → Hybrid** (real-DB Vitest, via `describe.skipIf(SKIP_DB)` — same pattern already
  proven by `getLeadCountries()` tests): AC#2 (multi-country union), AC#3 (multi-category union),
  AC#4 (combined AND), AC#9-DB-half (zero-match returns empty array), AC#11
  (`getUnassignedLeadCountries()` where-scope parity).
- **2 rows → Fully-Automated** (pure functions, no DB/auth dependency): AC#12 (category options
  equal `leadCategory.enumValues` exactly), and the CSV-parse `.filter(Boolean)` risk-mitigation
  test.
- **8 rows → Known-Gap**, explicitly named rather than silently absorbed: AC#1, AC#5, AC#6, AC#7,
  AC#8, AC#9-UI-half, AC#10, AC#13. All 8 are UI/browser-level assertions blocked on the missing
  e2e-auth-bootstrap infra. Tracked at
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

`e2e/unassigned-filters.e2e.ts` was written with `test.fixme(...)` stubs for the 8 Known-Gap ACs —
these are explicit, documented skips pointing at the backlog note, not deleted or silently
disabled tests. They exist so the moment the e2e-auth-bootstrap infra lands, un-skipping them is a
one-line change per test.

**Gate status: CONDITIONAL, not PASS.** This was reviewed and explicitly accepted by the user this
session — the 8 Known-Gap rows are a pre-existing repo-wide limitation, not a defect introduced by
this feature.

**Test results at EVL:**
- `bun run check` — 0 errors (1 pre-existing unrelated warning).
- `bun run test:unit` — 216 passed / 61 skipped / 0 failed.

### Part 2 — Display columns (quick-fix scoped check)

The follow-up quick fix ran a scoped check on touched files only (no full EVL / e2e pass, per the
QUICK FIX lane protocol):

- `bun run check` — PASS (0 new errors).
- `bun run test:unit` — PASS (216 passed / 61 skipped / 0 failed — unchanged baseline from Part 1).

No manual browser verification has been performed for the new columns (no dev server was run this
session) — see [Honest Limitations](#honest-limitations).

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/server/db/leads.ts` | Added `getUnassignedLeadCountries()`, `unassignedBaseConditions()`, `parseFilterCsv()`; extended `listUnassignedLeads()` with optional `filters` param; `dbRowToLead()` now maps `country: row.country ?? '—'` |
| `src/routes/unassigned/+page.server.ts` | Parses `country`/`category` CSV params via `parseFilterCsv()`; calls `getUnassignedLeadCountries()`; passes filters into `listUnassignedLeads()`; returns `categoryOptions`/`countryOptions`/`filters` |
| `src/routes/unassigned/+page.svelte` | Added `setFilter()`/`clearAllFilters()`/`hasActiveFilters`; renders two `MultiSelectFilter` instances + "Clear all filters"; distinct zero-match empty state; **follow-up**: added `country`/`category` table columns, widened grid to 9 tracks, added two display cells |
| `src/lib/components/leads/MultiSelectFilter.svelte` | **New** — popover-based checkbox multi-select filter component |
| `src/lib/types/index.ts` | `Lead.country` changed to optional (`country?: string`) — follow-up, to avoid touching unrelated mock stub files |
| `e2e/unassigned-filters.e2e.ts` | **New** — e2e scenarios for the 13 ACs; 8 written as `test.fixme(...)` known-gap stubs pending e2e-auth-bootstrap infra |
| `src/tests/leads.spec.ts` | Appended: CSV-parse `.filter(Boolean)` test; category-options-equal-enum test |
| `src/tests/leads-filters.spec.ts` | Appended: `getUnassignedLeadCountries()` where-scope-parity test; `listUnassignedLeads()` multi-country/multi-category/combined-AND/zero-match tests (all `describe.skipIf(SKIP_DB)`) |

---

## Honest Limitations

- **8 of 13 acceptance criteria have zero automated proof today.** AC#1, AC#5, AC#6, AC#7, AC#8,
  AC#9 (UI half), AC#10, AC#13 are all blocked on a pre-existing, repo-wide missing Playwright
  e2e-auth-bootstrap mechanism — no `page.goto()` to a protected route can currently establish a
  session in a Playwright browser context, because real Better Auth (magic-link + Resend) replaced
  the old `DEV_BYPASS` stub with no test-session-seed replacement. This is not something this
  feature introduced; it predates this plan and affects the repo's existing 4 e2e specs equally.
  Tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. The validate
  gate is explicitly `CONDITIONAL`, and this was reviewed and accepted by the user this session —
  not silently absorbed as a false PASS.

- **`Lead.country` is optional, not guaranteed-present.** It was made optional specifically to
  avoid touching two unrelated, out-of-scope mock stub files (`src/lib/data/mock-data.ts`,
  `src/lib/services/mock-crm-client.ts`) that don't set `country` on their fixtures. Real DB rows
  always get a value via `dbRowToLead()`'s `?? '—'` fallback — but any future code that consumes a
  `Lead` object from a mock/stub source (rather than the real DB) must not assume `country` is
  present. If `country` is ever relied upon as guaranteed-present across all `Lead` sources, the
  mock stub files need to be updated first, or a separate typed variant introduced.

- **The new display columns have not been manually verified in a browser.** No dev server was run
  during the follow-up quick fix — only `bun run check` and `bun run test:unit` were confirmed
  green. Visual layout (grid alignment, column widths, truncation behavior on long country/category
  values) has not been eyeballed.

- **Cross-session filter persistence was explicitly out of scope.** Filter state lives in URL
  search params only — refreshing the same URL preserves filters, but navigating to `/unassigned`
  fresh with no params always starts unfiltered. No `sessionStorage`/`localStorage` usage exists
  anywhere in this codebase, and this SPEC deliberately matches that existing precedent rather than
  introducing a new persistence pattern.

- **No new filter dimensions, and no changes to `/leads` or `/pipeline`.** Both were explicit
  Out-of-Scope items in the SPEC. If country/category filtering (or additional filter dimensions
  like source, stage, or date range) is wanted elsewhere, that is separate future work.

- **This work's task folder remains in `active/`, not archived.** The plan is code-complete and
  EVL-green on every Fully-Automated and Hybrid gate, but full "VERIFIED" status is blocked on the
  same e2e-auth-bootstrap gap named above, plus the not-yet-manually-verified display columns from
  the follow-up quick fix.
</content>
