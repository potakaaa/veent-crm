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

Status: in-progress — `/pipeline` queries the real DB via `src/lib/server/db/leads.ts`
(`listPipelineStage`), not mock data. (Corrected 07-07-26 — the prior "not-started (mock data
only)" line was stale; see `process/context/all-context.md` Feature Folders table for the
authoritative status.)

PIPE-3 (client-side pipeline search filter, `?q=`-synced) is code-complete, EVL green
(`pipeline-search-filter_07-07-26`) — `listPipelineStage` now left-joins `crm_organizers` so
`organizerName` populates on cards; pure `matchesQuery` predicate is fully-automated and tested.
Known-gap: DOM filter render / empty-column "no results" state / `?q=` URL sync (AC1/AC3/AC4) are
not unit-testable (node-only Vitest, no jsdom) and e2e is blocked on the shared Playwright auth
fixture — plan stays in `active/` pending manual verification; follow-up e2e stub tracked at
`process/features/pipeline/backlog/pipeline-search-e2e_NOTE_07-07-26.md`.

**PIPE-3 follow-up — server reach (07-07-26, `pipeline-search-server-reach_07-07-26`):**
supersedes the client-side-only search decision above. Search now also reaches leads that haven't
been scrolled into view: `buildPipelineStageWhereClause` gained a 5th optional `search?` param
(same escaped-ILIKE-OR idiom, now 3-field: name/organizer/event), threaded through both the SSR
loader and the lazy-load endpoint; the client keeps its instant client-side pre-filter for
zero-latency feedback but now also fires a server fetch per stage on the same debounce, replacing
displayed cards with the authoritative full match set, with a `searchSeq` stale-response guard and
the load-more sentinel gated off while searching. Composes correctly (AND, never widens) with
PIPE-4's `?rep=` filter. Along the way, a real pre-existing latent bug was found and fixed: the
lazy-load endpoint's hardcoded stage allow-list was missing `'live'`, silently breaking both search
AND normal scroll-loading for that column. All Fully-Automated gates green (`bun run check`,
`bun run lint`, `bunx vitest run` — 430 pass/148 skip/0 fail); EVL confirmation passed clean, no fix
cycles needed. Known-gap: same DOM/e2e runtime limitation as PIPE-3 (no component-render harness +
shared Playwright auth fixture blocked) — plan stays in `active/` pending manual DOM verification;
backlog scenarios extended in the same `pipeline-search-e2e_NOTE_07-07-26.md` note. Also registered:
an optional non-blocking test-infra follow-up (endpoint-vs-shared BOARD_STAGES superset guard) at
`process/features/pipeline/backlog/pipeline-stage-list-superset-guard_NOTE_07-07-26.md`.

PIPE-4 (AE color-coding + manager rep filter) — Section A (manager-only AE filter, `?rep=`
URL persistence, role-gated re-query) is code-complete and EVL-confirmed 07-07-26
(`pipeline-ae-filter-color_07-07-26`) — `resolvePipelineRepFilter` (trust-boundary decision) and
`buildPipelineStageWhereClause` (query composition, mirrors CAL-3's `buildGoLiveWhereClause`) are
both Fully-Automated and green; `listPipelineStage` gained a trailing optional `filterRepId?`.
Known-gap: dropdown render / rep-no-control / `?rep=` reload persistence e2e blocked on the shared
Playwright auth fixture (`process/features/pipeline/backlog/pipeline-ae-filter-e2e_NOTE_07-07-26.md`).
Section B (per-AE card color-coding + legend) is BLOCKED on a palette decision from Jela
(`process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md`) and was not
started. Plan stays in `active/` until Section B resolves.

## Folder Contents

```
process/features/pipeline/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
