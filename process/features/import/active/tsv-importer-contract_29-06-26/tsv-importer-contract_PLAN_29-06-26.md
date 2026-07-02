---
name: plan:tsv-importer-contract
description: Cross-system TSV export contract (scraper side) + scripts/import.ts consumer pipeline (CRM side)
date: 29-06-26
feature: import
---

# TSV Importer Contract — Scraper Export Schema + CRM Import Pipeline

Complexity: COMPLEX
Status: PLANNED — not yet validated
Date: 29-06-26

**Complexity:** COMPLEX (cross-system contract; 5 implementation phases; schema-gap decision required)
**Status:** PLANNED — not yet validated
**Date:** 29-06-26
**Feature:** import

> **TL;DR.** Defines a flat, one-row-per-event TSV the scraper produces by JOINing
> `events_event → events_organizer → events_venue`, and the ordered 9-phase pipeline
> `scripts/import.ts` uses to parse, normalize, dedup, map, dry-run, and load it into
> `crm_leads` + `crm_activities`. The TSV column table in **Public Contracts** is the
> binding interface — a scraper dev can build the exporter from it alone.
> **One blocking decision (D-1):** the real `crm_activities` table has no event columns and
> requires `channel` NOT NULL — it cannot store scraper events as-is. This plan resolves D-1
> with a small additive schema migration (Phase 0) and folds the representative event onto
> `crm_leads`. VALIDATE must confirm D-1 before EXECUTE.

---

## Overview

Two independently-built sides connected by one file format:

1. **Scraper side (separate Neon DB):** a SQL/script export that flattens the relational
   scraper schema into one TSV row per event, denormalizing organizer + venue columns onto
   each row. This plan specifies that file; it does **not** implement the exporter (different
   codebase/owner).
2. **CRM side (this repo):** `scripts/import.ts` consumes the TSV and loads `crm_leads` (one
   per organizer) + `crm_activities` (one per event touchpoint), idempotently.

The TSV schema in **Public Contracts** is the contract boundary. Everything downstream of it
is CRM-internal.

## Goals

- G1. A column-exact TSV spec precise enough to build the exporter with zero further questions.
- G2. A deterministic, idempotent CRM import pipeline (9 ordered phases) with a no-write dry-run.
- G3. Lossless-enough mapping: every scraper event becomes a CRM activity; every unique
  organizer becomes exactly one CRM lead.
- G4. Honest handling of the schema gap between scraper events and the CRM data model (D-1).

## Scope

**In scope:** TSV schema definition; `scripts/import.ts` transforms; category map; source map;
handle-normalization rules; dedup; dry-run report; idempotent load; verify step; the Phase-0
additive migration that unblocks per-event activity storage.

**Out of scope (v1):** the scraper-side exporter implementation; owner/rep assignment (all leads
land unassigned — deferred until real rep emails are confirmed); the live `/api/leads/ingest`
streaming path (this is the one-time bulk file path only); multi-event-per-lead UI surfacing.

---

## Key Decisions

**DECISION D-1 — crm_activities cannot store scraper events as-is (BLOCKING).**
- WHY: The real `crm_activities` schema (`src/lib/server/db/schema.ts` L175–202) has **no**
  `event_name / event_date / event_url / category` columns and requires `channel` (NOT NULL enum)
  + a `(lead_id, rep_id, occurred_at, channel)` unique index. It models **outreach touches**, not
  events. The task brief assumed event columns that do not exist.
- RESOLUTION (recommended): **Additive, non-destructive Phase-0 migration** adds nullable
  event-provenance columns to `crm_activities`: `event_name text`, `event_date date`,
  `event_url text`, `event_category text`, and `event_source text`. Add an enum value
  `'scraped_event'` to `crm_activity_channel` so event rows satisfy the NOT-NULL `channel`
  without faking an outreach channel. `occurred_at` for a scraped-event row = `event_starts_at`
  (fallback `event_post_date`, fallback `now()`), keeping the dedupe unique index meaningful.
- ALSO: fold one **representative event** onto `crm_leads` (`eventName`, `eventDate`,
  `eventDateRaw`, `eventLink`) so the leads list shows a headline event without a join.
  Representative = the earliest upcoming event (`starts_at >= now()`), else the most recent past
  event by `starts_at`.
- REJECTED ALT-A: store all events as JSON in `crm_leads.notes` — loses queryability, breaks the
  reminders/activity model. REJECTED ALT-B: skip per-event storage entirely (lead-only import) —
  discards the 2,785-event signal that is the whole point of the scraper.
- GATE: VALIDATE must confirm D-1's migration is acceptable. If rejected, the importer degrades to
  lead-only (representative event on `crm_leads`, no activity rows) — recorded as a known-gap.

**DECISION D-2 — all scraper sources collapse to CRM `source = 'scraper'`.**
- WHY: `crm_lead_source` enum is only `sheet_import | manual | scraper | other`. The granular
  source (e.g. `ticketmelon`) is preserved on the activity row via `event_source` (added in D-1),
  not lost.

**DECISION D-3 — `agent_categories` is the canonical category input; raw `category` is ignored
for mapping.** First value of the cleaned list drives the CRM category; unmapped → `Other` +
`needs_review = true`.

**DECISION D-4 — no owner assignment in v1.** All leads insert with `owner_id = NULL`
(unassigned pool). Rep mapping deferred until real rep emails confirmed.

---

## Touchpoints

| Path | Change |
|---|---|
| `scripts/import.ts` | Replace stub `run()` with the real 9-phase pipeline; add transform helpers (exported for unit tests) |
| `src/lib/server/db/schema.ts` | Phase 0 — additive nullable event columns on `crm_activities`; add `'scraped_event'` to `crm_activity_channel` enum |
| `drizzle/` | Phase 0 — generated migration from the schema change (`bun run db:generate`) |
| `src/lib/zod/schemas.ts` | Add `tsvRowSchema` (one Zod object validating a parsed TSV row) reused by the layout-validation phase |
| `src/tests/import.spec.ts` (new) | Unit tests for transform helpers (handle, category map, dedup, representative-event) |
| `process/features/import/_GUIDE.md` | Read-only context (status update deferred to UPDATE PROCESS) |

## Public Contracts

### Contract 1 — TSV Export Schema (scraper → CRM)

**File format rules (binding):**
- Encoding **UTF-8, no BOM**. Importer strips a BOM defensively but the exporter must not write one.
- **Tab-delimited** (`\t`). One header row, then one row per event.
- **Quoting:** any field containing a tab, newline, carriage return, or a double-quote MUST be
  wrapped in double-quotes (`"`), with embedded `"` doubled (`""`) — RFC-4180 quoting over a tab
  delimiter. Fields without those characters SHOULD be unquoted.
- Line terminator `\n` (LF). Embedded newlines only inside quoted fields.
- Empty/NULL value = empty string (zero characters between delimiters). The importer treats empty
  string as NULL for nullable columns.
- Timestamps: ISO-8601 UTC (`2026-06-29T14:30:00Z`). Dates: `YYYY-MM-DD`.
- **Filename:** `veent-leads-export-YYYY-MM-DD.tsv` (export date).
- **Column order is fixed** — the importer validates by position AND header name.

**Column table (one row = one event; organizer + venue denormalized onto each row):**

| # | Header | Source field | Req? | Notes |
|---|---|---|---|---|
| 1 | `__row_type` | constant | REQ | Always literal `veent_event_v1`. Format sentinel — importer rejects rows whose value ≠ this. |
| 2 | `export_version` | constant | REQ | Semver of the schema, e.g. `1.0`. Importer warns (not rejects) on minor mismatch, rejects on major. |
| 3 | `event_id` | `events_event.id` | REQ | Stable scraper PK; used for export traceability. |
| 4 | `event_name` | `events_event.name` | REQ | |
| 5 | `event_slug` | `events_event.slug` | NULL | |
| 6 | `event_category_raw` | `events_event.category` | NULL | Messy raw value — informational only, NOT used for mapping. |
| 7 | `event_category_clean` | `events_event.agent_categories` | NULL | **JSONB → single column: pipe-delimited** (`Fun Run\|Sports`). Importer maps the **first** value. Empty array → empty string. |
| 8 | `event_starts_at` | `events_event.starts_at` | NULL | ISO-8601 UTC. |
| 9 | `event_ends_at` | `events_event.ends_at` | NULL | ISO-8601 UTC. |
| 10 | `event_post_date` | `events_event.post_date` | NULL | ISO-8601 UTC. Fallback for `occurred_at` when `starts_at` null. |
| 11 | `event_price` | `events_event.price` | NULL | Free text (e.g. `Free`, `PHP 500`). |
| 12 | `event_source` | `events_event.source` | REQ | Granular source token (see Source map). |
| 13 | `event_source_url` | `events_event.source_url` | NULL | |
| 14 | `event_registration_url` | `events_event.registration_url` | NULL | |
| 15 | `event_image_url` | `events_event.image_url` | NULL | |
| 16 | `event_raw_text` | `events_event.raw_text` | NULL | **Must be quoted** (contains tabs/newlines). Importer truncates to 2,000 chars. |
| 17 | `organizer_ref_id` | `events_event.organizer_ref_id` | NULL | Empty → name-only fallback (col 18 still required). |
| 18 | `organizer_name` | `events_organizer.name` OR `events_event.organizer` | REQ | If `organizer_ref_id` present → organizer table name; else event's `organizer` string fallback. NEVER empty. |
| 19 | `organizer_slug` | `events_organizer.slug` | NULL | |
| 20 | `organizer_status` | `events_organizer.status` | NULL | `pending\|confirmed\|rejected`. Empty for name-only rows. |
| 21 | `organizer_facebook_url` | `events_organizer.facebook_url` | NULL | Primary handle source. |
| 22 | `organizer_instagram_url` | `events_organizer.instagram_url` | NULL | Secondary handle source. |
| 23 | `organizer_website` | `events_organizer.website` | NULL | → `crm_leads.page_url`. |
| 24 | `organizer_email` | `events_organizer.email` | NULL | → `crm_leads.contact_email`. |
| 25 | `organizer_phone` | `events_organizer.phone` | NULL | No CRM column — appended to `crm_leads.notes` as `phone: …`. |
| 26 | `organizer_source` | `events_organizer.source` | NULL | |
| 27 | `organizer_enrichment_source` | `events_organizer.enrichment_source` | NULL | |
| 28 | `organizer_scraped_at` | `events_organizer.scraped_at` | NULL | ISO-8601 UTC. |
| 29 | `venue_name` | `events_venue.name` (via `events_event.venue_id`) | NULL | |
| 30 | `venue_address` | `events_venue.address` | NULL | |
| 31 | `venue_city` | `events_venue.city` | NULL | → contributes to `crm_leads.location`. |
| 32 | `venue_country` | `events_venue.country` | NULL | → contributes to `crm_leads.location`. |
| 33 | `venue_latitude` | `events_venue.latitude` | NULL | |
| 34 | `venue_longitude` | `events_venue.longitude` | NULL | |

**Required columns (export must always populate):** `__row_type`, `export_version`, `event_id`,
`event_name`, `event_source`, `organizer_name`. All others nullable (empty string allowed).

**Name-only organizer fallback (col 17 empty):** the exporter sets `organizer_name` from
`events_event.organizer`, leaves cols 19–28 empty. The importer still creates a lead, keyed on the
slugified name (see handle normalization), and sets `needs_review = true`.

### Contract 2 — CRM target mapping (TSV → CRM rows)

| CRM table.column | Sourced from | Transform |
|---|---|---|
| `crm_leads.name` | col 18 `organizer_name` | trim |
| `crm_leads.normalized_handle` | cols 21/22/23/18 | see Phase 3 |
| `crm_leads.category` | col 7 `event_category_clean` (first value) | Category map; unmapped → `Other` |
| `crm_leads.needs_review` | derived | `true` if category unmapped OR name-only organizer OR no socials |
| `crm_leads.social_facebook` | col 21 | as-is URL |
| `crm_leads.social_instagram` | col 22 | as-is URL |
| `crm_leads.page_url` | col 23 `organizer_website` | as-is |
| `crm_leads.contact_email` | col 24 | lowercase, trim |
| `crm_leads.location` | cols 31+32 | `"{city}, {country}"` (skip empties) |
| `crm_leads.platform` | derived | `Facebook` if FB url, else `Instagram` if IG, else null |
| `crm_leads.source` | constant | `'scraper'` (D-2) |
| `crm_leads.event_name` / `event_date` / `event_date_raw` / `event_link` | representative event (D-1) | earliest-upcoming-else-latest |
| `crm_leads.notes` | col 25 phone + provenance | `"phone: …\nimported scraper event_id=…"` |
| `crm_activities.lead_id` | FK | resolved post-lead-insert |
| `crm_activities.channel` | constant | `'scraped_event'` (D-1 enum addition) |
| `crm_activities.occurred_at` | col 8 → 10 → now | `event_starts_at` ?? `event_post_date` ?? `now()` |
| `crm_activities.event_name/event_date/event_url/event_category/event_source` | cols 4/8/13/7/12 | D-1 added columns |
| `crm_activities.rep_id` | — | NULL (D-4) |

## Blast Radius

- **Files:** 5 changed (`scripts/import.ts`, `schema.ts`, generated migration, `zod/schemas.ts`,
  new `import.spec.ts`).
- **Packages:** single app (no monorepo packages).
- **Risk class:** **schema/data migration (HIGH)** — Phase 0 alters `crm_activities` and a pgEnum.
  Additive + nullable, but enum changes are non-trivial to reverse in Postgres. Also **bulk data
  write** (HIGH) — ~2,785 activities + ~800 leads in one transaction.
- **Reversibility:** import is idempotent (skip-if-exists on `normalized_handle`); a full undo =
  `DELETE` of `source='scraper'` rows (soft-delete via `deleted_at` preferred per project
  convention). Enum addition is forward-only; document rollback as a new migration.

## Implementation Checklist

**Phase 0 — Schema unblock (D-1) [HIGH RISK — VALIDATE gate first]**
1. In `src/lib/server/db/schema.ts`, add `'scraped_event'` to the `crm_activity_channel` pgEnum array.
2. Add nullable columns to `crm_activities`: `eventName text('event_name')`, `eventDate date('event_date')`, `eventUrl text('event_url')`, `eventCategory text('event_category')`, `eventSource text('event_source')`.
3. Run `bun run db:generate` to produce the migration; review the generated SQL for the enum-add + column-adds (no data backfill).
4. Run `bun run check` — confirm `CrmActivity` type now includes the new fields.

**Phase 1 — Parse & hygiene**
5. Implement `readTsv(path): RawRow[]` — read UTF-8, strip leading BOM (`﻿`), split on LF respecting quoted fields (RFC-4180 over tab delimiter).
6. Implement `hygiene(value): string` — normalize smart quotes (`“”’` → `"'`), decode `&#13;`/`&#10;`/`&amp;`, collapse stray CR, trim.
7. Validate every row has exactly 34 columns; rows with wrong count → `skipped[]` with reason `column_count`.

**Phase 2 — Layout validation**
8. Add `tsvRowSchema` to `src/lib/zod/schemas.ts` (Zod object, all 34 keys, required cols `.min(1)`).
9. For each row: assert `__row_type === 'veent_event_v1'` and `export_version` major == `1`; on mismatch → `skipped[]` reason `bad_row_type` / `bad_version`. Parse through `tsvRowSchema`; Zod failures → `skipped[]` reason `schema`.

**Phase 3 — Normalize handle**
10. Implement `normalizeHandle(row): string` — priority: FB url → IG url → website host → slugify(`organizer_name`). Extraction: take the first path segment after the host (`facebook.com/ManilaBookFair` → `manilabookfair`), strip query/trailing slash, lowercase, strip non-alphanumerics. Fallback slugify: lowercase, spaces→`-`, strip punctuation.

**Phase 4 — Dedup leads**
11. Implement `groupByHandle(rows): Map<handle, RawRow[]>` — one `crm_lead` per unique `normalized_handle`. Merge organizer fields by first-non-empty wins; collect ALL events of the group for activity rows.
12. Implement `pickRepresentativeEvent(events): RawRow` — earliest `starts_at >= now()`; else latest `starts_at`; else first by `event_post_date`.

**Phase 5 — Category mapping**
13. Implement `mapCategory(clean: string): { category, needsReview }` — first pipe value through the **Category map** table; miss → `{ 'Other', true }`.

**Phase 6 — Owner assignment**
14. No-op in v1 — set `ownerId = null` for all leads (D-4). Documented constant, not a TODO.

**Phase 7 — Dry-run report (no DB writes)**
15. Implement reconciliation report (console only): `rowsRead`, `leadsBuilt`, `activitiesBuilt`, `eventsPerLead` (min/median/max), `skipped` (by reason), `needsReviewCount`, `categoryToOtherCount`, and a category distribution histogram. `--dry-run` returns here without opening a DB connection.

**Phase 8 — Load (idempotent transaction)**
16. Under `--load`: open one transaction. For each lead group: `INSERT crm_leads ... ON CONFLICT` skip-if-exists keyed on `normalized_handle` (advisory index is non-unique → SELECT-then-insert guard inside the txn). Capture inserted `lead_id`.
17. Bulk `INSERT crm_activities` for every event of inserted leads; rely on `crm_activities_dedupe_uq` `(lead_id, rep_id, occurred_at, channel)` to no-op re-runs (`ON CONFLICT DO NOTHING`).
18. Commit; on any error, roll back the whole transaction.

**Phase 9 — Verify**
19. Post-load: `SELECT count(*)` of `crm_leads WHERE source='scraper'` and `crm_activities WHERE channel='scraped_event'`; assert equal to dry-run `leadsBuilt` / `activitiesBuilt`. Print PASS/FAIL reconciliation diff.

## Mapping Tables

### Category map (`agent_categories` first value → `crm_lead_category`)

CRM enum: `Sports, Workshop, Church, Theater, Bar/DJ, Conference, Music Fest, Fan Fair, School,
Concert, Live Band, Expo, Screening, Camp, Competition, Convention, Film, Modelling, Resort, Other`.

| Scraper value | CRM category | Notes |
|---|---|---|
| Fun Run | Sports | |
| Triathlon/Duathlon | Sports | |
| Sports | Sports | |
| Concert | Concert | |
| Live Band | Live Band | |
| Music Fest | Music Fest | |
| Festival | Music Fest | broad; `needs_review` left to per-lead derivation |
| Workshop | Workshop | |
| Webinar | Workshop | online workshop |
| Theater | Theater | |
| Conference | Conference | |
| Convention | Convention | |
| Expo | Expo | |
| Competition | Competition | |
| Church | Church | |
| Fan Fair | Fan Fair | |
| School | School | |
| Film | Film | |
| Screening | Screening | |
| Bar/DJ | Bar/DJ | |
| Club | Bar/DJ | nightlife ≈ Bar/DJ |
| Community | Other | no CRM equivalent |
| Travel and Tours | Other | |
| Art | Other | |
| Health | Other | |
| Pet | Other | |
| Restaurant | Other | |
| Adventure Parks | Other | |
| Charity/Fundraiser | Other | |
| Other | Other | |
| *(any unmapped / empty)* | Other | sets `needs_review = true` |

> Rule: only values that hit a real CRM enum row (other than `Other`) leave `needs_review` driven
> by other signals. Any value landing in `Other` via miss (the bottom block) forces
> `needs_review = true` so a human re-categorizes.

### Source map (`events_event.source` → `crm_lead_source`)

All real scraper sources collapse to `scraper` (D-2). Granular token preserved on
`crm_activities.event_source`.

| Scraper source | CRM `source` |
|---|---|
| myruntime, ticketmelon, sistic, clickthecity, facebook_events, allevents_in, eventbrite, facebook_posts, eventsize, meetup, ticket2me, eventalways, luma, happeningnext_cdo, eventbookings, racemeister_events, instagram_posts, tessera, planout, eventbee | `scraper` |
| *(unrecognized token)* | `scraper` (+ `needs_review=true`) |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 after Phase 0 schema change | Fully-Automated | AC-1 (schema migration type-safe; `CrmActivity` includes event cols) |
| `bun run test:unit -- src/tests/import.spec.ts` — `normalizeHandle` cases (FB/IG/website/name-only) | Fully-Automated | AC-2 (handle extraction matches spec examples) |
| import.spec.ts — `mapCategory` covers every scraper value incl. unmapped→Other+needs_review | Fully-Automated | AC-3 (category map total & correct) |
| import.spec.ts — `groupByHandle` collapses multi-event organizer to one lead + N activities | Fully-Automated | AC-4 (dedup: one lead per organizer) |
| import.spec.ts — `pickRepresentativeEvent` upcoming-else-latest ordering | Fully-Automated | AC-5 (representative event selection) |
| import.spec.ts — layout validation rejects bad `__row_type` / wrong column count | Fully-Automated | AC-6 (format sentinel + layout guard) |
| `bun run scripts/import.ts --file fixture.tsv --dry-run` prints report, opens no DB connection | Fully-Automated | AC-7 (dry-run is write-free) |
| `--load` against a live Postgres then re-run = zero new rows (idempotency) | Hybrid (needs live DB) | AC-8 (idempotent load on normalized_handle + dedupe index) |
| Phase 9 verify count matches dry-run totals on a seeded fixture | Hybrid (needs live DB) | AC-9 (post-load reconciliation) |
| Manual review of generated Drizzle migration SQL (enum add + nullable cols, no destructive op) | Agent-Probe | AC-10 (migration is additive/non-destructive — HIGH risk class) |

> Each acceptance criterion AC-1…AC-10 is `proven by:` the named scenario with the `strategy:` tag
> in column 2. No criterion is left on Known-Gap. AC-8/AC-9 are Hybrid because no DB integration
> harness exists yet (see Test Infra Notes) — VALIDATE may accept them as CONDITIONAL until a
> seeded test DB exists.

## Test Infra Improvement Notes

- No DB integration test harness exists (`all-tests.md` §Known Gaps: "Integration tests (real DB)
  are not set up"). AC-8/AC-9 (idempotency, verify) need a seeded ephemeral Postgres. Proposed
  follow-up: a `bun run test:integration` script + disposable Postgres (docker-compose service
  already present) seeded from a small fixture TSV. Until then these two gates are Hybrid/manual.
- A canonical fixture TSV (`src/tests/fixtures/sample-export.tsv`, ~20 rows covering: multi-event
  organizer, name-only organizer, unmapped category, embedded-tab raw_text, BOM) should be created
  during EXECUTE to back the unit gates.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/import/active/tsv-importer-contract_29-06-26/tsv-importer-contract_PLAN_29-06-26.md`
2. **Last completed step:** PLAN written; not yet validated.
3. **Validate-contract status:** PENDING (placeholder below — vc-validate-agent writes it).
4. **Context loaded:** `process/context/all-context.md`, `src/lib/server/db/schema.ts`,
   `scripts/import.ts`, `src/lib/zod/schemas.ts`, `process/context/tests/all-tests.md`,
   `process/features/import/_GUIDE.md`.
5. **Next step for a fresh agent:** Run VALIDATE. The single hard gate is **D-1** — confirm the
   additive `crm_activities` migration + `'scraped_event'` enum value is acceptable before any
   EXECUTE. If D-1 is rejected, downgrade the importer to lead-only (representative event on
   `crm_leads`, no activity rows) and record the per-event-storage gap as a known-gap. Phase 0 must
   land (and `bun run check` pass) before Phases 1–9 are implemented.

## Acceptance Criteria

Testable; each maps to a Verification Evidence row.

- AC-1: Phase-0 schema change type-checks; CrmActivity includes the 5 event columns; `bun run check` exits 0. proven by: bun run check. strategy: Fully-Automated.
- AC-2: normalizeHandle returns the spec value for FB, IG, website, and name-only inputs. proven by: import.spec.ts handle cases. strategy: Fully-Automated.
- AC-3: mapCategory maps every scraper value; unmapped to Other + needs_review. proven by: import.spec.ts category cases. strategy: Fully-Automated.
- AC-4: a multi-event organizer collapses to exactly one lead with N activities. proven by: import.spec.ts groupByHandle. strategy: Fully-Automated.
- AC-5: representative event = earliest-upcoming-else-latest. proven by: import.spec.ts pickRepresentativeEvent. strategy: Fully-Automated.
- AC-6: rows with wrong __row_type or column count are skipped, not loaded. proven by: import.spec.ts layout cases. strategy: Fully-Automated.
- AC-7: --dry-run prints the report and opens no DB connection. proven by: dry-run run on fixture. strategy: Fully-Automated.
- AC-8: re-running --load inserts zero new rows (idempotent). proven by: load + re-load on live DB. strategy: Hybrid.
- AC-9: Phase-9 verify counts equal dry-run totals. proven by: seeded-fixture load. strategy: Hybrid.
- AC-10: generated migration is additive/non-destructive. proven by: migration SQL review. strategy: Agent-Probe.

## Phase Completion Rules

- A phase is CODE DONE when its checklist items are implemented and `bun run check` passes; it is VERIFIED only when its Verification Evidence gates are green (Hybrid gates green or explicitly accepted CONDITIONAL).
- Phase 0 (schema migration) MUST be VERIFIED before Phases 1-9 begin.
- Do not mark the plan VERIFIED while any developed behavior rests on a Known-Gap; AC-8/AC-9 may stay CONDITIONAL pending a DB integration harness (see Test Infra Improvement Notes).
- No "✅ VERIFIED" without user confirmation of the load against real data.

## Next Step

Run VALIDATE (`ENTER VALIDATE MODE`). VALIDATE must resolve decision D-1 before EXECUTE.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
