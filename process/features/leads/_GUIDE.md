# leads

<!-- Part of veent-crm -->

## Scope

Lead management — the core CRM entity. Covers the full lifecycle from creation (manual or import)
through stage transitions to Won/Lost. Includes: leads list with search/filter, lead detail view,
lead creation form, unassigned leads queue (claim flow), and the review queue (needs_review flag).
All pages currently render mock data; v1 replaces all mocks with real Drizzle queries.

## Key Source Files

- `src/routes/leads/+page.server.ts` / `+page.svelte` — leads list
- `src/routes/leads/[id]/+page.server.ts` / `+page.svelte` — lead detail
- `src/routes/leads/new/+page.svelte` — lead creation
- `src/routes/unassigned/+page.server.ts` / `+page.svelte` — unassigned leads queue
- `src/routes/review/+page.server.ts` / `+page.svelte` — review queue (needs_review=true)
- `src/lib/server/db/schema.ts` — `crm_leads`, `crm_lead_history`, `crm_activities` tables
- `src/lib/zod/schemas.ts` — Zod validators for lead forms
- `src/lib/server/mock.ts` — mock data (must stay isolated from real queries)
- `src/lib/components/leads/LogTouchForm.svelte` — inline log-touch card on `/leads/[id]`; includes
  the Templates snippet picker (Popover-based)
- `src/lib/data/templates.ts` — static Log Touch snippet templates (`TEMPLATES`, `fillTemplate()`)

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/context/tests/all-tests.md` — test commands

## Current Status

Status: not-started (all surfaces show mock data)

## Folder Contents

```
process/features/leads/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
