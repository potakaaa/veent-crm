# Issue #29 — Server-Backed Pagination on /leads

Implemented: Phase 9 (2026-06-30)
Route: `/leads?page=2`

---

## What It Does

The `/leads` page previously loaded every non-deleted lead from the database and filtered them client-side. Issue #29 replaces that with server-backed pagination: the database returns only the rows for the requested page, along with a total count. The UI shows Prev/Next controls and a "X–Y of Z" indicator below the lead grid.

---

## Design Decisions

### Why server-backed, not client-side?

Client-side pagination still loads every row on the initial request. With hundreds or thousands of leads, that payload grows unbounded. Server-backed pagination keeps the response payload fixed at `pageSize` rows regardless of total dataset size.

### Why LIMIT/OFFSET and not keyset/cursor?

The list is sorted by `COALESCE(last_activity_at, created_at) DESC` — a non-unique, frequently-updated timestamp. Keyset pagination on a mutable sort key is fragile: an activity update mid-browse can cause rows to jump pages. LIMIT/OFFSET on a small CRM dataset (expected: hundreds to low thousands of leads per rep) is correct and simple. The stable secondary sort on `id ASC` prevents duplicate or missing rows when two leads share the same activity timestamp.

### Page size

Fixed at **25 rows per page** (`PAGE_SIZE = 25` in `+page.server.ts`). Not user-configurable. Chosen as a sensible default for a dense CRM list view.

---

## Implementation

### DB function — `listLeadsFiltered()`

File: `src/lib/server/db/leads.ts`

```ts
const offset = (Math.max(1, page) - 1) * pageSize;

const [countResult, rows] = await Promise.all([
  db.select({ total: count() }).from(crmLeads).where(where),
  db.select().from(crmLeads)
    .where(where)
    .orderBy(
      desc(sql`COALESCE(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`),
      asc(crmLeads.id)   // stable secondary sort
    )
    .limit(pageSize)
    .offset(offset)
]);

return { leads: rows.map(dbRowToLead), total: countResult[0].total };
```

Both queries run in parallel (`Promise.all`) and share the exact same `where` clause — the count and the page rows are always in sync. The count query uses no `LIMIT`/`OFFSET` so it reflects the total matching rows, not just the current page.

### Server load — `+page.server.ts`

```ts
const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

return {
  leads: result.leads,
  total: result.total,
  pagination: {
    page,
    pageSize: PAGE_SIZE,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE))
  }
};
```

`parseInt(...) || 1` guards against `?page=abc` (NaN → 1). `Math.max(1, ...)` guards against `?page=0` or negative values. `totalPages` is at least 1 even when `total` is 0, so the component never divides by zero.

### Component — `+page.svelte`

Pagination controls render only when `totalPages > 1`:

```svelte
{#if data.pagination.totalPages > 1}
  {@const { page: pg, pageSize, total, totalPages } = data.pagination}
  {@const start = (pg - 1) * pageSize + 1}
  {@const end = Math.min(pg * pageSize, total)}
  <div class="mt-5 flex items-center justify-between text-[13px] text-ink-300">
    <span class="font-mono">{start}–{end} of {total}</span>
    <div class="flex items-center gap-2">
      <Button disabled={pg <= 1 || paging}
        onclick={() => { paging = true; navigate({ page: pg - 1 }); }}>← Prev</Button>
      <span class="font-mono">Page {pg} of {totalPages}</span>
      <Button disabled={pg >= totalPages || paging}
        onclick={() => { paging = true; navigate({ page: pg + 1 }); }}>Next →</Button>
    </div>
  </div>
{/if}
```

#### Loading state

```ts
let paging = $state(false);
afterNavigate(() => { paging = false; });
```

`paging` is set to `true` the moment either button is clicked, disabling both buttons immediately. `afterNavigate` (from `$app/navigation`) fires once the new page's server load completes and the component re-renders — at which point `paging` resets to `false`. This prevents double-clicks while the round-trip is in flight without relying on `navigating` from `$app/state` (which is a class instance and always truthy, not `null` when idle).

### Filter reset on page change

Every filter change calls `setFilter(key, value)` → `navigate({ [key]: value, page: undefined })`. Deleting the `page` param resets to page 1. This means:

- Changing segment → back to page 1
- Changing stage, platform, country → back to page 1
- Toggling stale-only → back to page 1
- Typing in search (debounced 300ms) → back to page 1

Only the Prev/Next buttons explicitly pass `page: pg ± 1`.

---

## URL Param

| Param | Values | Default |
|-------|--------|---------|
| `page` | Positive integer | `1` |

Example: `/leads?segment=all&stage=contacted&page=3`

Page 1 is the default — the param is omitted from the URL when on page 1 (deleting `page: undefined` in `navigate` removes it from the search params).

---

## Export Behaviour

The **Export CSV** button links to `/api/leads/export` with the current filter params but **no `page` param**. The export endpoint calls `listLeadsFiltered` with `pageSize: 10_000`, bypassing pagination entirely. This preserves the pre-pagination semantics: export always returns all matching filtered leads, not just the current page.

```
/leads?stage=contacted&page=3  →  Export CSV  →  /api/leads/export?stage=contacted
```

---

## Sort Stability

The primary sort key (`COALESCE(last_activity_at, created_at) DESC`) is not unique — many leads can share the same timestamp (e.g., all newly seeded leads share `created_at`). Without a secondary sort, `LIMIT/OFFSET` results are non-deterministic and the same lead can appear on multiple pages or be skipped entirely.

The secondary sort `id ASC` (UUID, always unique) guarantees a stable total order. Any two requests with the same filters and page number will return identical rows.

---

## Test Coverage

### DB Integration — `src/tests/leads-filters.spec.ts`

Skipped when `DATABASE_URL` is unset:

- `total` equals all matching rows, not just the current page ✓
- Page 1 and page 2 return different leads (with `pageSize: 1`) ✓
- Page beyond total returns empty array ✓
- `total` is consistent between page 1 and page 2 requests (same filter, same count) ✓

---

## Honest Limitations

- **LIMIT/OFFSET degrades at very large offsets.** If a single rep accumulates tens of thousands of leads, deep pages (page 500+) will be slow. Keyset pagination would be the fix, but it requires rethinking the sort key. Not a concern at current expected dataset sizes.
- **No page size control.** Page size is fixed at 25. If reps want a denser view, it requires a code change.
- **Segment counts reflect total DB counts, not current filter.** The pill buttons (Mine, All, Unassigned, Lost) show counts from `data.total` for the active segment only. Counts for inactive segments are not shown, unlike the previous client-side implementation which could compute all four counts from the full loaded dataset. This is a trade-off of server-side filtering.
- **No jump-to-page control.** Navigation is strictly sequential (Prev/Next). There is no page number input.
