---
name: plan:organizer-ingest-seeding
description: SPEC — auto-create/link organizer records during lead ingest, backfill existing leads, and seed sample organizers for dev
date: 06-07-26
feature: import
---

# SPEC — Organizer Creation & Backfill for Import/Ingest Pipeline

## Summary

Right now the CRM has an "Organizer" concept (`crm_organizers` table, `/organizers` list and
detail pages, manual "tag a lead to an organizer" action) but the table is completely empty —
nothing has ever written to it automatically. Every lead that comes in from the scraper, or
already sits in the database, has no organizer record behind it, so the Organizers section is
an empty shell and reps can't see "this lead is one of 5 events run by the same recurring
organizer" unless someone manually creates and tags an organizer by hand.

This change makes organizer records appear automatically: when a new lead is ingested from the
scraper, the system finds or creates the matching organizer and links the lead to it. A one-time
backfill does the same thing retroactively for every lead already in the database. A small
dev-seed addition gives local development some sample organizer data to look at and test with.

## User Stories / Jobs To Be Done

1. **As a sales rep browsing the Organizers page**, I want organizer records to already exist for
   the events/pages that have been scraped, so that I can see grouped history (all events run by
   the same page) without anyone doing manual data entry first.

2. **As a sales rep opening a lead's detail page**, I want a new lead from the scraper to already
   be linked to its organizer (when that organizer's other leads already exist), so I immediately
   see "this same page has run 3 other events with us" instead of a blank organizer field.

3. **As the person operating the scraper ingest pipeline**, I want every new incoming lead to
   automatically get an organizer record (new or existing, whichever applies) without needing a
   manual follow-up step, so that the data stays consistent going forward with no extra ops work.

4. **As an engineer/ops owner doing the one-time rollout**, I want a backfill I can run once
   against the existing lead data, so historical leads retroactively gain the same organizer
   linking that new leads get — instead of the Organizers page only ever showing leads ingested
   after the change ships.

5. **As a developer working locally**, I want the dev-seed script to include a few sample
   organizer records (with some dev leads linked to them), so I can see and test the Organizers UI
   without needing real scraped data or the backfill script.

## What The User Wants (Behavioral Outcomes)

- When a new lead is ingested through the scraper endpoint, the system determines whether an
  organizer already exists for that page (using the page's normalized handle — the same
  identity concept already used to de-duplicate leads). If one exists, the lead is linked to it.
  If none exists, a new organizer record is created from the lead's details (name, handle,
  socials, location, contact info) and the lead is linked to that new organizer.
- This happens silently, as part of the existing ingest flow — no new visible step, no new
  request the scraper has to make, no change to the ingest response shape that scraper operators
  depend on today (aside from the fact that leads created this way now show up grouped under an
  organizer).
- Leads that are recognized as duplicates of an existing lead (today's existing dedup behavior)
  are unaffected — this change only affects the "create a new lead" path, not the "skip, already
  have this one" path.
- A one-time backfill operation can be run (by an operator, from the command line, the same way
  other one-time backfill scripts already run in this repo) that goes through every existing lead
  that has no organizer yet, and finds-or-creates + links an organizer for each one, using the
  same matching logic as the live ingest path. It is safe to re-run — leads that already have an
  organizer are left alone, and running it twice does not create duplicate organizer records for
  the same handle.
- After the backfill runs, the `/organizers` page shows real organizer rows (not an empty page),
  and each organizer's detail page shows its linked leads/event history.
- In local development, running the seed script produces a handful of sample organizer records,
  with some of the seeded sample leads pointing at them — so developers see a populated
  Organizers page without doing anything extra.
- None of this changes any organizer-tagging behavior a rep does manually today (the existing
  "assign this lead to an organizer" action from the lead detail page keeps working exactly as
  it does now, independent of this auto-linking logic).

## Flow / State Diagram

### Live ingest flow (new lead path only)

```
Scraper POSTs a batch → /api/leads/ingest
        │
        ▼
  For each lead in the batch:
        │
        ▼
  Existing dedup check (sourceRef or normalizedHandle)
        │
   ┌────┴─────┐
   │           │
 duplicate   new lead
   │           │
   ▼           ▼
 (existing   Compute the lead's normalized handle
  skip/patch  (same helper used for lead dedup today)
  behavior,        │
  unchanged)        ▼
              Look up an organizer with this normalized handle
                    │
             ┌──────┴───────┐
             │               │
       organizer found   no organizer found
             │               │
             ▼               ▼
       reuse that ID    create a new organizer record
             │           from this lead's details
             │               │
             └───────┬───────┘
                     ▼
          Insert the new crm_leads row
          with organizer_id set to that ID
```

### One-time backfill flow (existing leads)

```
Operator runs the backfill script
        │
        ▼
  Select every crm_leads row where organizer_id IS NULL
  and deleted_at IS NULL
        │
        ▼
  For each such lead:
        │
        ▼
  Compute its normalized handle (same shared logic)
        │
        ▼
  Find-or-create organizer for that handle (same shared
  logic the live ingest path uses)
        │
        ▼
  Update that lead's organizer_id
        │
        ▼
  Report summary: N leads linked, M organizers created,
  K leads skipped (e.g. no usable handle)
```

### Dev-seed flow

```
Developer runs bun run db:seed (scripts/seed.ts)
        │
        ▼
  Existing seed logic creates sample leads/activities/history
        │
        ▼
  NEW: seed a handful of sample organizer rows
        │
        ▼
  NEW: link a subset of the seeded leads to those organizers
        │
        ▼
  /organizers page shows sample data locally
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — New ingested lead with no matching organizer gets a brand-new organizer, linked.**
When the scraper ingests a lead whose normalized handle does not match any existing organizer,
a new organizer record is created (populated from the lead's name/handle/socials/location/
contact fields) and the new lead's `organizerId` points at it.
- proven by: `src/tests/leads-ingest-organizer-db.spec.ts` (new Hybrid `*-db.spec.ts`, `SKIP_DB`-gated, mirrors `organizers-db.spec.ts` convention) — case "no existing organizer for handle → creates one and links it"
- strategy: Hybrid

**AC2 — New ingested lead with a matching existing organizer gets linked, no duplicate organizer created.**
When the scraper ingests a lead whose normalized handle matches an organizer that already
exists, the lead is linked to that existing organizer's ID and no second organizer row is
created for the same handle.
- proven by: `src/tests/leads-ingest-organizer-db.spec.ts` — case "existing organizer for handle → reuses it, no duplicate created"
- strategy: Hybrid

**AC3 — Duplicate-lead path is unaffected.**
When an incoming lead is recognized as a duplicate of an existing lead (today's dedup check),
no organizer lookup/creation happens and today's skip/patch behavior is unchanged.
- proven by: existing `src/tests/leads-ingest-db.spec.ts` regression suite (unchanged assertions continue to pass) + new case confirming no organizer side-effect occurs on the duplicate path
- strategy: Hybrid

**AC4 — Ingest response shape and scraper-facing contract are unchanged.**
The `/api/leads/ingest` endpoint's request/response schema and secret-auth behavior are
unchanged by this work — scraper operators need no changes on their end.
- proven by: `bun run test:unit -- src/tests/schemas.spec.ts` (existing `ingestBatchSchema`/`ingestLeadSchema` cases keep passing unmodified) + new endpoint-level Hybrid case asserting response shape parity
- strategy: Fully-Automated (schema cases) / Hybrid (endpoint case)

**AC5 — Backfill script links every eligible existing lead to a found-or-created organizer.**
Running the backfill script against the current `crm_leads` table sets `organizerId` on every
non-deleted lead that previously had none, using the same find-or-create-by-handle logic as
live ingest.
- proven by: new backfill script test (Hybrid, `SKIP_DB`-gated), mirroring `scripts/backfill-event-dates.ts`/`scripts/backfill-reps.ts` test conventions — case "backfill links all organizer-less leads"
- strategy: Hybrid

**AC6 — Backfill is idempotent (safe to re-run).**
Running the backfill script a second time makes no further changes: no new organizers are
created, and no lead's `organizerId` is altered, because every eligible lead was already linked
by the first run.
- proven by: backfill script test — case "second run is a no-op: organizer count and lead links unchanged"
- strategy: Hybrid

**AC7 — Backfill does not touch leads that already have an organizer.**
Leads with a non-null `organizerId` before the backfill runs are left exactly as they were
(their `organizerId` value is not reassigned, even if the computed handle would technically
match a different organizer record).
- proven by: backfill script test — case "lead with existing organizerId is skipped, unchanged"
- strategy: Hybrid

**AC8 — Backfill handles leads with no usable handle gracefully.**
A lead whose name/handle/socials/website cannot produce any normalized handle is skipped (not
linked, not errored) and counted in the backfill's "skipped" summary, so the operator sees an
accurate run report.
- proven by: backfill script test — case "lead with no derivable handle is skipped and counted"
- strategy: Hybrid

**AC9 — Dev-seed produces sample organizer data.**
Running `bun run db:seed` creates a handful of sample `crm_organizers` rows and links a subset
of the seeded sample leads to them, so a fresh local dev environment shows populated data on the
`/organizers` list and detail pages.
- proven by: `src/tests/seed-organizers.spec.ts` (Hybrid, `SKIP_DB`-gated) — asserts organizer rows exist after seed run and at least one seeded lead has a non-null `organizerId` pointing at a seeded organizer
- strategy: Hybrid

**AC10 — Organizers page shows real data after backfill/seed, unaffected by manual tagging.**
After running the backfill (or the dev seed), the existing `/organizers` list and detail pages
(shipped in `organizer-listing-detail_06-07-26`) render the newly-created organizer rows and
their linked lead/event history using their existing, unmodified query logic — no changes
needed to `listOrganizersWithLeadCount`/`getOrganizer`/`listLinkedLeadsForOrganizer`. The
existing manual "tag lead to organizer" PATCH endpoint continues to work exactly as before,
independent of this auto-linking logic.
- proven by: existing `src/tests/organizers-db.spec.ts` suite continuing to pass unmodified against data produced by the new find-or-create path (regression, no new assertions needed) + manual code-read confirmation that no changes touch that file
- strategy: Hybrid

## Out Of Scope

- **`scripts/import.ts` (the one-time historical TSV importer)** is NOT updated to write
  `crm_organizers` in this change. It already has its own organizer-field MERGE logic operating
  at the lead-row level; wiring it to the shared find-or-create organizer table is deferred
  unless the TSV importer is confirmed to still be used for ongoing imports (open question,
  flagged below — default assumption is it is legacy/closed for ongoing use).
- **No database uniqueness constraint or migration** is added on `crm_organizers.normalizedHandle`
  in this change. Dedup is enforced at the application level (find-then-create), matching the
  existing pattern for `crm_leads.normalizedHandle`. The known race-condition risk (two concurrent
  ingests for the same new handle both missing the SELECT and creating two organizer rows) is
  accepted for v1, consistent with how lead-level dedup already works in this repo.
- **`scraperOrgId` is not used as the organizer dedup key.** Matching is done exclusively via
  `normalizedHandle`, using the same helper already used for lead-level dedup.
- **No reconciliation logic** is built for the case where a rep has manually created/tagged an
  organizer whose normalized handle differs from what the scraper would compute for the same
  real-world organizer. This is accepted as a known v1 gap — there is no evidence of manual
  organizer creation happening today (no organizer-creation UI exists yet), so the scenario is
  currently theoretical.
- **No organizer CRUD UI** (create/edit/merge organizers by hand) is added. Organizer detail/list
  viewing already exists (`organizer-listing-detail_06-07-26`); this SPEC only adds automatic
  organizer creation from ingest/backfill/seed, not manual management tooling.
- **No changes to the scraper's payload contract.** The scraper continues sending the same fields
  it sends today (`pageName`, `handle`, `url`, `facebookUrl`, `instagramUrl`, `location`, `email`,
  `phone`, `scraperOrgId`); this work only changes what the CRM does with fields it already
  receives.

## Constraints

- Must reuse the existing `normalizeHandle()` helper (`src/lib/server/import-utils.ts`) for
  identity matching — not introduce a second, divergent normalization scheme.
- The find-or-create organizer logic must be implemented once and shared by both the live ingest
  endpoint and the backfill script (not duplicated in two places).
- Must not modify the existing manual organizer-tagging code path (`PATCH /api/leads/[id]/organizer`)
  — that remains a separate, untouched feature.
- Must not modify `src/lib/server/db/organizers.ts`'s existing read functions
  (`listOrganizersWithLeadCount`, `getOrganizer`, `listLinkedLeadsForOrganizer`) — only add new
  write capability alongside them.
- Must follow repo convention: soft-delete awareness (`deletedAt IS NULL`) wherever leads are
  scanned; Hybrid-tier tests follow the `*-db.spec.ts` / `SKIP_DB` convention already used
  throughout the repo (e.g. `organizers-db.spec.ts`, `leads-ingest-db.spec.ts`).
- The backfill script must follow the existing one-time-script shape already used in this repo
  (`scripts/backfill-event-dates.ts`, `scripts/backfill-reps.ts`) — runnable via `bun run`, with a
  clear summary output, not a Drizzle migration.
- No new database migration is required for this SPEC's scope (no schema changes — `crm_organizers`
  and `crmLeads.organizerId` already exist from GitHub #188).

## Open Questions

None outstanding for this SPEC. One item is explicitly resolved by assumption and flagged here
for PLAN/INNOVATE to confirm rather than left as a blocking question:

- **Owner: PLAN/INNOVATE.** Whether `scripts/import.ts` (bulk TSV importer) needs the same
  find-or-create wiring. Default assumption locked into this SPEC's Out Of Scope: it does NOT,
  unless PLAN's own research confirms the TSV importer is still actively used for ongoing
  (non-historical) imports — in which case PLAN should raise it back to the user before excluding
  it permanently.

## Background / Research Findings

- The scraper ingest payload (`ingestLeadSchema`, `src/lib/zod/schemas.ts:326-343`) already
  carries organizer-identifying fields (`pageName`, `handle`, `url`, `facebookUrl`,
  `instagramUrl`, `location`, `email`, `phone`, `scraperOrgId`), but
  `src/routes/api/leads/ingest/+server.ts` only uses them to build the `crm_leads` row — none
  currently populate `crm_organizers` or set `crmLeads.organizerId`.
- `normalizeHandle(fbUrl?, igUrl?, website?, name?)` (`src/lib/server/import-utils.ts:53-66`,
  priority FB → IG → website → slugify(name)) is the existing, reused identity helper — already
  used for lead-level dedup in both the ingest endpoint and `scripts/import.ts`.
- `scripts/import.ts` already has organizer-level MERGE logic at the lead-grouping stage
  (`groupByHandle()` + `firstNonEmpty()`), directly adaptable in shape to an organizer-row
  payload builder, but this SPEC does not require touching that script (see Out Of Scope).
- `crm_organizers` schema (`src/lib/server/db/schema.ts:128-140`): `id`, `name`,
  `normalizedHandle`, `socialFacebook`, `socialInstagram`, `website`, `email`, `phone`,
  `location`, `createdAt`, `updatedAt`. No uniqueness constraint on `normalizedHandle` today.
  `crmLeads.organizerId` (schema.ts:182-184) references `crmOrganizers.id`, nullable,
  `onDelete: 'set null'`.
- `src/lib/server/db/organizers.ts` currently has read-only exports
  (`listOrganizersWithLeadCount`, `getOrganizer`, `listLinkedLeadsForOrganizer`) built in the
  just-completed `organizer-listing-detail_06-07-26` phase (feature: `organizers`,
  status `COMPLETE_WITH_GAPS`, EVL-pending Hybrid DB gate). A shared `findOrCreateOrganizer()`
  export will need to live alongside these.
- The existing `PATCH /api/leads/[id]/organizer` manual-tagging endpoint (from #188) is an
  unrelated, unaffected code path — it tags a lead to an already-existing organizer chosen by a
  rep; it is not reused for and does not conflict with this SPEC's find-or-create logic.
- Test-tier convention confirmed from `process/context/tests/all-tests.md`: Hybrid DB-touching
  specs use the `*-db.spec.ts` naming + `SKIP_DB` self-skip pattern repo-wide (auto-skips without
  a live `DATABASE_URL`/local Postgres) — this is the expected tier for the find-or-create logic
  and the backfill script, consistent with `organizers-db.spec.ts`'s own currently-unrun-locally
  status (same known repo-wide gap, not new to this SPEC).
- User confirmation (from clarification round, already resolved):
  1. Scope covers three concrete deliverables: (a) live ingest find-or-create + link, (b) one-time
     backfill script for existing leads, (c) dev-seed sample organizer data.
  2. Dedup key is `normalizedHandle` only (not `scraperOrgId`) — matches the column's designed
     purpose and reuses the already-proven-in-repo normalization helper.
  3. `scraperOrgId` stability was never verified and is not relied on.
  4. DB-level uniqueness constraint on `normalizedHandle` is accepted as a v1 known-gap /
     out-of-scope, matching the existing lead-dedup risk tolerance.
