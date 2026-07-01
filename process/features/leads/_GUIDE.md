# leads

<!-- Part of veent-crm -->

## Scope

Lead management — the core CRM entity. Covers the full lifecycle from creation (manual or import)
through stage transitions to Won/Lost. Includes: leads list with search/filter, lead detail view,
lead creation form, and the Up for Grabs (unassigned) leads queue with claim + inline-edit flows.

**The Review Queue (`/review`) and `needs_review` flag were fully removed 01-07-26** (GitHub #90 —
see `active/ufg-inline-edit-review-removal_01-07-26/`). There is currently no "needs attention"
signal anywhere in the app — per that change's SPEC, no replacement signal was introduced.

Leads list, lead detail, lead creation, and Up for Grabs all query the real Drizzle DB (not mock
data) — see Current Status below.

## Key Source Files

- `src/routes/leads/+page.server.ts` / `+page.svelte` — leads list (real DB)
- `src/routes/leads/[id]/+page.server.ts` / `+page.svelte` — lead detail (real DB; also hosts the
  sole Discard action — `DiscardIssueModal` → `DELETE /api/leads/{id}/discard`)
- `src/routes/leads/new/+page.server.ts` / `+page.svelte` — lead creation (real DB)
- `src/routes/unassigned/+page.server.ts` / `+page.svelte` — Up for Grabs queue (claim flow +
  per-row inline edit via `LeadEditModal`, real DB)
- `src/lib/server/db/leads.ts` — Drizzle query layer for all of the above (`listLeadsFiltered`,
  `getLead`, `listUnassignedLeads`, `listPipelineStage`, etc.)
- `src/lib/server/db/schema.ts` — `crm_leads`, `crm_lead_history`, `crm_activities` tables
  (`needs_review` column dropped — migration `drizzle/0009_mushy_vapor.sql` generated, apply
  pending — see the plan above)
- `src/lib/zod/schemas.ts` — Zod validators for lead forms
- `src/lib/server/mock.ts` — mock data (isolated; still used by other not-yet-wired surfaces —
  see `process/context/all-context.md` Feature Folders table for per-feature status)

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/context/tests/all-tests.md` — test commands

## Current Status

Status: in-progress — leads list, lead detail, lead creation, and Up for Grabs all query the real
DB (`src/lib/server/db/leads.ts`), not mock data. Review Queue removed entirely (01-07-26).
Remaining gaps: stage-transition audit-trail completeness and pipeline claim/won/lost UI polish
are tracked under the `pipeline` feature, not here.

## Folder Contents

```
process/features/leads/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
