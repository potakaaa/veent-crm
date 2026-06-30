# Issue #23 — Country Filter on /leads

Implemented: Phase 9 (2026-06-30)
Route: `/leads?country=Manila`

---

## What It Does

Adds a **Country** dropdown to the `/leads` toolbar. Selecting a country narrows the lead list to leads whose `location` field matches exactly. Selecting "All countries" clears the filter. The filter composes fully with all other filters (segment, stage, platform, stale-only, search, pagination).

The dropdown is hidden entirely when no leads in the database have a non-null `location` value — no empty control is shown to the user.

---

## Data Model

`location` is a free-text, nullable `text` column on `crm_leads`. There is no enum or fixed list of valid countries. Options are derived at query time from real data in the database:

```sql
SELECT DISTINCT location
FROM crm_leads
WHERE deleted_at IS NULL
  AND location IS NOT NULL
ORDER BY location ASC;
```

Mapped in `getLeadCountries()` → `string[]`.

This means:
- The dropdown always reflects what is actually in the DB, not a hardcoded list.
- New locations appear automatically once leads with that location are seeded or imported.
- Typos in the `location` field produce separate dropdown entries (no normalization layer).

---

## Implementation

### DB function — `getLeadCountries()`

File: `src/lib/server/db/leads.ts`

```ts
export async function getLeadCountries(): Promise<string[]>
```

Runs a `selectDistinct` on `crmLeads.location` filtered to non-deleted, non-null rows, ordered A–Z. Called in parallel with `listLeadsFiltered` from the page server load so it adds no serial latency.

### DB function — `listLeadsFiltered()` (country param)

When `country` is provided:

```ts
if (country) conditions.push(eq(crmLeads.location, country));
```

Exact match (case-sensitive, same as the stored value). The dropdown only ever presents values that exist in the DB, so there is no risk of a user supplying a value that would silently match nothing — they either select a real value or "All countries."

### Server load — `+page.server.ts`

```ts
const country = url.searchParams.get('country') ?? '';
// ...
getLeadCountries()  // called in parallel via Promise.all
// ...
return { ..., countries, filters: { ..., country } };
```

`countries` is passed to the component; the filter state is passed back in `data.filters.country` so the Select shows the correct selected value after navigation.

### Component — `+page.svelte`

```svelte
{#if data.countries.length > 0}
  <Select type="single" value={data.filters.country}
    onValueChange={(v) => setFilter('country', v)}>
    <SelectTrigger size="sm">{data.filters.country || 'Country'}</SelectTrigger>
    <SelectContent>
      <SelectItem value="" label="All countries">All countries</SelectItem>
      {#each data.countries as c}
        <SelectItem value={c} label={c}>{c}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/if}
```

`setFilter('country', v)` calls `navigate({ country: v, page: undefined })` which resets pagination to page 1 and triggers a SvelteKit server load with the new URL params.

### Export

The `/api/leads/export` endpoint accepts the same `country` param and passes it through to `listLeadsFiltered` (with `pageSize: 10_000`), so exported CSV always reflects the active country filter.

---

## URL Param

| Param | Values | Default |
|-------|--------|---------|
| `country` | Any string matching a DB location value, or empty | `''` (All countries) |

Example: `/leads?segment=all&country=Manila`

Absent param and empty string are treated identically — both mean "no country filter."

---

## Filter Composition

Country composes with every other filter at the SQL level. The `listLeadsFiltered` query builds a single `WHERE` clause with all active conditions before running the `COUNT` and `SELECT`. There is no client-side post-filtering.

| Filter | Composes with country? |
|--------|----------------------|
| Segment (mine/all/unassigned/lost) | Yes |
| Stage | Yes |
| Platform | Yes |
| Stale only | Yes |
| Search (name/handle) | Yes |
| Pagination | Yes |

---

## Test Coverage

### DB Integration — `src/tests/leads-filters.spec.ts`

Skipped when `DATABASE_URL` is unset:

- `getLeadCountries` returns distinct non-null locations ✓
- `getLeadCountries` does not include null locations ✓
- Country filter returns only leads with matching location ✓
- Empty country param returns all non-deleted leads (same as no filter) ✓

---

## Honest Limitations

- **Exact match only.** `location` is free text. "manila", "Manila", and "MANILA" are three different filter values. There is no normalization, fuzzy match, or alias layer.
- **Dropdown reflects raw DB values.** A typo in a scraped or manually entered location will appear as its own entry. Consider a normalization step in the ingest pipeline if consistency matters.
- **Countries from all leads, not filtered leads.** The dropdown shows every distinct location in the DB, regardless of the current segment/stage/platform/etc. This is intentional — you can always see all countries even if no leads match the current other filters.
