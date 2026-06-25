# import

<!-- Part of veent-crm -->

## Scope

Data ingestion — one-time TSV bulk import from the Google Sheet export plus the ongoing scraper
ingest API endpoint. Covers: TSV transform and normalization, dedup logic (normalized_handle +
contactEmail advisory), reconciliation report, and the secret-authed `/api/leads/ingest` endpoint
for future scraper use. The import script is currently a stub pipeline.

## Key Source Files

- `scripts/import.ts` — one-time TSV importer (currently stub)
- `src/routes/api/leads/ingest/+server.ts` — secret-authed ingest API (stub)
- `src/lib/zod/schemas.ts` — import/ingest validators
- `src/lib/server/db/schema.ts` — `crm_leads` (source, normalizedHandle, needsReview)

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — shares lead schema and dedup rules

## Current Status

Status: not-started (stub pipeline only)

## Folder Contents

```
process/features/import/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
