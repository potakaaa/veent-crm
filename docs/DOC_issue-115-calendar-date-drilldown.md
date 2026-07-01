# Issue #115 — Click Day on Month Graph Should Filter Into Leads on That Day

Implemented: 2026-07-01
Surfaces: `/reports` (calendar + heatmap charts), `/leads` (date filter consumption)

---

## What It Does

From the Reports page, clicking a day cell on either of the two date-based charts navigates to
the leads list filtered down to exactly that day:

- **Month Calendar** (`MonthCalendar.svelte` — the traditional month-grid "graph"). A day cell
  with one or more leads is a link; clicking it navigates to
  `/leads?date={YYYY-MM-DD}&dateField={metric}&segment=all`.
- **Lead density by date** (`CalendarHeatmap.svelte` — the GitHub-contribution-graph-style
  heatmap). Same behavior: a day cell that has at least one lead is a link to the same URL shape.
- Both charts pass whichever metric toggle is currently active on the Reports page —
  `event_date` or `created_at` — as the `dateField` query param, so the filter always matches
  what the chart was actually counting.
- Days with **zero** leads are non-interactive on both charts (no `<a>`, no navigation) — see
  [Known Limitations](#known-limitations) for why this is existing/unchanged behavior, not new
  scope from this fix.
- Landing on `/leads` with a `date`/`dateField` pair shows a "Filtered by date" chip above the
  list naming the date and which field it matched (event date vs. created), with a "Clear" link
  back to the unfiltered segment.

---

## What Already Existed

All of the click-through UI and query plumbing predates this session — it shipped as part of
commit `77f76f5 feat(reports): click calendar dates to drill into leads list` (merged via PR #83,
branch `feat/lead-calendar-heatmap`), well before issue #115 was filed. No new feature code was
needed for the navigation itself:

1. **`MonthCalendar.svelte`** (`src/lib/components/reports/MonthCalendar.svelte`, lines
   202–219) — a day cell renders as `<a href="/leads?date={cell.date}&dateField={metric}&segment=all">`
   only when `cell.day && cell.day.total > 0`; zero-count days render a plain non-linking `<div>`
   (lines 220–230).

2. **`CalendarHeatmap.svelte`** (`src/lib/components/reports/CalendarHeatmap.svelte`, lines
   189–199) — the same href pattern, gated on `{#if cell.day}`. The gate works because the
   underlying data source (`src/routes/api/reports/heatmap/+server.ts`, calling
   `getLeadHeatmapData()`) only returns rows for dates that actually have at least one lead —
   zero-count days simply have no entry in the `HeatmapDay[]` array, so `cell.day` is `null` and
   no link is ever rendered for them. Both charts land on the same "zero = non-interactive"
   outcome via different mechanisms (explicit `total > 0` check vs. absent map entry).

3. **`src/routes/leads/+page.server.ts`** (lines 26–34, prior to this session's fix) — the `load`
   function parses `date` and `dateField` from the URL, validates the date string, and passes
   both into `listLeadsFiltered()`. `dateField` defaults to `'event_date'` unless the URL
   explicitly says `created_at` (lines 32–34).

4. **`listLeadsFiltered()`** (`src/lib/server/db/leads.ts`, lines 308–315) applies the actual SQL
   predicate:
   ```ts
   if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
   	if (dateField === 'created_at') {
   		conditions.push(sql`DATE(${crmLeads.createdAt}) = ${date}::date`);
   	} else {
   		conditions.push(sql`${crmLeads.eventDate} = ${date}::date`);
   	}
   }
   ```

5. **`src/routes/leads/+page.svelte`** (lines 170–186) renders the "Filtered by date: {date}
   ({event date|created})" chip with a "Clear" link (`/leads?segment={data.filters.segment}`)
   whenever `data.filters.date` is truthy.

---

## The Gap/Fix

The navigation and query wiring above looked complete, but the date filter was **silently
dropped on every click** — `/leads` always rendered the full unfiltered `segment=all` list no
matter which day was clicked. This was confirmed live in this session: both
`/leads?date=2026-07-02&dateField=event_date&segment=all` and
`/leads?date=2026-07-25&dateField=event_date&segment=all` rendered the identical unfiltered list.

### Root cause

`src/routes/leads/+page.server.ts`'s date validator round-trips the raw URL string through
`Date` parsing to reject malformed/invalid calendar dates (e.g. `2026-02-30`):

```ts
const rawDate = url.searchParams.get('date') ?? '';
const date = (() => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return '';
	const d = new Date(rawDate + 'T00:00:00'); // <-- parsed as LOCAL time
	return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== rawDate ? '' : rawDate;
})();
```

`new Date(rawDate + 'T00:00:00')` (no timezone suffix) parses the string as **local server
time**. The validation then round-trips through `.toISOString()`, which is always **UTC**, and
compares the result back to the original string. On any machine running in a UTC-positive
timezone — this repo deals extensively with Asia/Manila time (see `src/lib/utils/dates.ts` and
the reminders feature) — that round trip shifts the date back one calendar day before the
`.toISOString()` conversion, so `d.toISOString().slice(0, 10)` never equals `rawDate`. The
validation failed on every valid input, and `date` silently reset to `''`, causing
`listLeadsFiltered()` to receive `date: undefined` and skip the date predicate entirely — the
filter was dropped with no error, no warning, and no visible symptom other than "the list shows
everything."

The failure was reproduced deterministically with a standalone Node script run under
`TZ=Asia/Manila`, and the local dev machine's own `Intl.DateTimeFormat().resolvedOptions().timeZone`
was confirmed to resolve to `Asia/Singapore` — the same UTC+8 offset — meaning this bug was live
in local dev, not just a theoretical prod-timezone issue.

### The fix

One line, `src/routes/leads/+page.server.ts` line 29:

```diff
- const d = new Date(rawDate + 'T00:00:00');
+ const d = new Date(rawDate + 'T00:00:00Z');
```

Appending the `Z` suffix makes `new Date(...)` parse the string as UTC explicitly, matching the
UTC output of `.toISOString()` — the round-trip comparison is now timezone-independent regardless
of what timezone the server process runs in.

**Verified after the fix** (still under `TZ=Asia/Manila`): valid dates like `2026-07-02` and
`2026-07-25` now pass validation and reach `listLeadsFiltered()`; invalid calendar dates like
`2026-02-30` and garbage strings still correctly return `''` (rejected) — the invalid-date
rejection behavior is unchanged, confirming the fix only corrected the false-negative case and
did not loosen validation.

---

## AC-to-Code Mapping

| AC | Requirement | Satisfied by |
|----|-------------|--------------|
| AC1 | Clicking a day on the month calendar navigates to leads filtered to that day | `MonthCalendar.svelte` lines 202–219 (`href="/leads?date={cell.date}&dateField={metric}&segment=all"`, gated on `cell.day.total > 0`) + the fixed validator in `+page.server.ts` line 29 actually letting the date through |
| AC2 | Clicking a day on "Lead density by date" (the heatmap) does the same | `CalendarHeatmap.svelte` lines 190–199 (same href pattern, gated on `cell.day` being present) |
| AC3 | The filter respects the active metric toggle (event date vs. created date) | Both components receive `metric` as a prop from `src/routes/reports/+page.svelte` and interpolate it into the `dateField` query param; `+page.server.ts` lines 32–34 parse it back, defaulting to `'event_date'` unless `created_at` is explicit; `listLeadsFiltered()` lines 310–314 branches the SQL predicate on `dateField` |
| AC4 | The leads page shows which date/metric it's filtered by | `src/routes/leads/+page.svelte` lines 170–186 — "Filtered by date: {date} ({event date\|created})" chip, rendered when `data.filters.date` is set |
| AC5 | The filter is clearable | Same chip block, line 179–184 — "Clear" link to `/leads?segment={data.filters.segment}`, dropping `date`/`dateField` entirely |
| AC6 (bug) | The date filter must actually apply, not silently no-op | `src/routes/leads/+page.server.ts` line 29 — `T00:00:00` → `T00:00:00Z`, fixing the timezone-dependent round-trip validation that was rejecting every valid date under UTC-positive server timezones |

---

## Public Contract Changes

**None.** This was a bug fix to an existing internal date-validation expression inside a
`load` function — no route signature, URL query-param contract, exported function signature, or
component prop changed. The `/leads?date=...&dateField=...&segment=...` URL shape was already the
contract established by the prior `77f76f5` commit; this fix makes that existing contract actually
work.

---

## Tests

- `bun run check` (svelte-check) — **0 errors**, 1 pre-existing unrelated warning
  (`src/routes/leads/[id]/edit/+page.svelte:19` — not touched by this fix; confirmed present
  both before and after).
- `src/tests/leads-filters.spec.ts` is a DB-integration test suite
  (`describe.skipIf(SKIP_DB)`) that requires `DATABASE_URL` and does not exercise the
  `+page.server.ts` inline date validator directly — it was not the applicable check for this
  fix. A standalone Node reproduction script run under `TZ=Asia/Manila` was used instead to
  confirm the failure mode pre-fix and the corrected behavior post-fix (valid dates pass,
  invalid calendar dates like `2026-02-30` and garbage strings still correctly reject).
- **Manual browser verification has not been performed.** No dev server was run this session to
  click an actual day cell on either chart and confirm the leads list visually filters — see
  [Known Limitations](#known-limitations).

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/leads/+page.server.ts` | Line 29: `new Date(rawDate + 'T00:00:00')` → `new Date(rawDate + 'T00:00:00Z')` — parses the date-filter validation input as UTC so the `.toISOString()` round-trip check is timezone-independent (1 line) |

---

## Known Limitations

- **Manual browser verification is still pending.** Click-through was reproduced via a URL-level
  server-load check and a standalone timezone repro script, not by actually clicking a calendar
  day in a running browser session. Before considering this issue fully verified, confirm: (a)
  clicking a day with leads on `MonthCalendar` navigates and filters correctly, (b) clicking a day
  cell on `CalendarHeatmap` does the same, and (c) the "Filtered by date" chip and its "Clear"
  link render and behave as expected in-browser.
- **Zero-count days are intentionally non-interactive on both charts.** This is existing,
  unchanged behavior from the original `77f76f5` implementation, not a gap introduced or left open
  by this fix — `MonthCalendar` explicitly checks `cell.day.total > 0` before rendering a link,
  and `CalendarHeatmap`'s data source only returns rows for dates that have at least one lead, so
  a zero-count cell never has a `cell.day` to link from in the first place.
- **No regression test was added for the timezone-validation bug itself.** The existing
  `leads-filters.spec.ts` DB-integration suite doesn't cover the inline `load`-function date
  validator, and adding one was out of scope for this one-line fix (matching how prior
  quick-fix-scoped docs in this repo — e.g.
  [`DOC_issue-92-role-based-claim-assign.md`](./DOC_issue-92-role-based-claim-assign.md) — treat
  small bounded fixes). If this validator is touched again, consider extracting it into a
  standalone, unit-testable function the way `parseFilterCsv()` was extracted in
  [`DOC_issue-91-country-category-filters.md`](./DOC_issue-91-country-category-filters.md).
