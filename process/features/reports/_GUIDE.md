# reports

<!-- Part of veent-crm -->

## Scope

Analytics and reporting — ECharts-based dashboards showing rep performance, pipeline conversion
rates, and activity metrics. Covers the reports page, data aggregation queries, and the Today/home
page daily loop summary. Currently renders mock data; v1 wires real Drizzle queries for all charts.

## Key Source Files

- `src/routes/reports/+page.server.ts` / `+page.svelte` — main reports page (ECharts)
- `src/routes/+page.server.ts` / `+page.svelte` — Today (home, daily loop summary)
- `src/routes/team/+page.server.ts` / `+page.svelte` — team view

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — data comes from leads and activities tables

## Current Status

Status: not-started (mock data only)

## Folder Contents

```
process/features/reports/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
