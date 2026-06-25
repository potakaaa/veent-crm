# reminders

<!-- Part of veent-crm -->

## Scope

Follow-up reminder system. Reps set `follow_up_at` on activities; the secret-authed
`/api/reminders/due` endpoint is polled by n8n to surface due reminders. Covers: follow-up
timestamp management on `crm_activities`, the reminder query (partial index on follow_up_at),
n8n webhook integration, and the reminders UI page.

## Key Source Files

- `src/routes/reminders/+page.svelte` — reminders list UI
- `src/routes/api/reminders/due/+server.ts` — secret-authed endpoint polled by n8n
- `src/lib/server/reminders.ts` — reminder logic (stub)
- `src/lib/server/db/schema.ts` — `crm_activities.follow_up_at` + partial index

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — activities belong to leads

## Current Status

Status: not-started (stub only)

## Folder Contents

```
process/features/reminders/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
