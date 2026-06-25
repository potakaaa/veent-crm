# pipeline

<!-- Part of veent-crm -->

## Scope

Sales pipeline view — Kanban-style or list view of leads grouped by stage (new → contacted →
replied → in_discussion → won → lost). Covers stage transition logic, audit trail writes to
`crm_lead_history`, won capture form (org name, deal value, currency, signed date), and lost
capture (lost reason). All transitions must be recorded in `crm_lead_history`.

## Key Source Files

- `src/routes/pipeline/+page.server.ts` / `+page.svelte` — pipeline view
- `src/lib/server/db/schema.ts` — `crm_leads` (stage, lost_reason, won fields), `crm_lead_history`
- `src/lib/zod/schemas.ts` — Zod validators for stage transitions and won/lost capture

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — leads feature (shares DB schema)

## Current Status

Status: not-started (mock data only)

## Folder Contents

```
process/features/pipeline/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
