---
name: plan:csv-sheets-import-ui
description: "SPEC — CSV/Google-Sheets import UI for leads and organizers, with a per-row duplicate-review preview step (GitHub #210, #211)"
date: 07-07-26
feature: import
---

# SPEC — CSV & Google Sheets Import UI (Leads + Organizers)

## Summary

Right now, getting a list of leads or organizers into the CRM means someone manually re-typing rows one at a time, or waiting on a one-off scraper/CLI import. This feature gives managers and reps a self-serve "Import" button — on both the Leads page and the Organizers page — that lets them upload a CSV file (the main path) or paste a link to a public Google Sheet (a secondary, "Anyone with the link" path), match the sheet's columns to CRM fields, preview exactly what will be created — including a clear flag on anything that looks like a duplicate — and then confirm the import with a summary of what happened. This replaces ad-hoc manual entry with a guided, safe, reviewable bulk-import flow.

## User Stories / Jobs To Be Done

1. **As a manager with a spreadsheet of leads**, I want to upload that CSV directly into the CRM, so that I don't have to re-type dozens of rows by hand.
2. **As a manager with a shared Google Sheet of leads or organizers**, I want to paste the sheet's link instead of downloading/uploading a file, so that the import stays in sync with however my team already tracks the list.
3. **As any user importing data**, I want to tell the system which of my sheet's columns map to which CRM fields, so that the import works even when my column names or order don't match the CRM's fields exactly.
4. **As any user importing data**, I want to see a preview of what will be created before anything is saved, so that I can catch mistakes (wrong file, bad mapping) before they hit the database.
5. **As any user importing data**, I want to be warned, row by row, when a row looks like it might already exist in the CRM, so that I don't create duplicate leads or organizers by accident — but I still want the choice to import it anyway if I know it's actually a new, distinct record.
6. **As a user managing organizers specifically**, I want an "Import" button right on the Organizers page (not just on Leads), so that importing a batch of organizer records doesn't require me to detour through the Leads page.
7. **As any user who just ran an import**, I want a clear result summary (created / skipped / errored), so that I know the import actually did what I expected.

## What The User Wants (Behavioral Outcomes)

- An **"Import" button** is visible on the Leads list page (next to the existing "Export CSV" action) and on the Organizers list page (a new action area — the Organizers page has no action bar today).
- Clicking Import opens a guided flow with these steps, in order:
  1. **Choose source** — upload a `.csv` file, or paste a Google Sheets URL.
  2. **Choose target** — "Leads" or "Organizers" (pre-selected/locked to "Organizers" when opened from the Organizers page's Import button; free choice when opened from the Leads page).
  3. **Map columns** — the user sees the sheet's actual column headers and assigns each one to a CRM field from a dropdown (or "Don't import this column"). Not every CRM field needs a mapped column — mapping is flexible, matching however much data the sheet actually has.
  4. **Preview** — the first several rows (at least 5) are shown as they will be imported, with each row's target fields visible. Any row the system suspects is a duplicate of an existing record is **visibly flagged** right in this preview (not hidden, not deferred to after import) — with the ability to skip or still-import each flagged row.
  5. **Confirm** — the user commits the import.
  6. **Result summary** — after import runs, the user sees counts of rows created, rows skipped (including duplicates the user chose to skip), and rows that errored, with enough detail to know why a row errored.
- If a pasted Google Sheets URL is not shareable/published (not "Anyone with the link" or "Published to web"), the user sees a plain-language error explaining the sheet isn't accessible and how to fix sharing settings — no attempt to silently fall back to a private-access method.
- Imported leads are recorded with their origin as an import from a sheet, distinguishing them from manually-created or scraper-created leads.
- Duplicate detection compares against existing records so a user is never silently handed a second copy of the same lead or organizer without being told first.

## Flow / State Diagram

```
[Leads page]  ---(Import button)---> \
                                        > [Import Modal/Wizard: target = user-choice]
[Organizers page] --(Import button)-> /   (locked to Organizers when launched from Organizers page)

                         |
                         v
                 ┌───────────────┐
                 │  1. Source     │  choose: [Upload CSV] or [Paste Sheets URL]
                 └───────┬────────┘
                         │
             CSV file read locally         Sheets URL fetched as CSV
             (client-side parse)           (public export endpoint)
                         │                          │
                         └───────────┬──────────────┘
                                     v
                         Sheet not accessible? ──yes──> [Error: "Sheet isn't shareable —
                                     │                    check link sharing settings"] --> back to Step 1
                                     no
                                     v
                 ┌───────────────────────────┐
                 │  2. Target: Leads or       │  (locked if launched from Organizers page)
                 │     Organizers             │
                 └───────────┬────────────────┘
                             v
                 ┌───────────────────────────┐
                 │  3. Column Mapping         │  sheet column -> CRM field (or "skip column")
                 │     not all fields required│
                 └───────────┬────────────────┘
                             v
                 ┌───────────────────────────────────────────┐
                 │  4. Preview (>=5 rows)                     │
                 │     each row shows mapped field values      │
                 │     rows matching an existing record are    │
                 │     flagged "possible duplicate"             │
                 │     user can skip / still-import per row     │
                 │     (or bulk toggle for all flagged rows)     │
                 └───────────┬─────────────────────────────────┘
                             v
                    [Confirm Import] <--- user can go Back to any prior step
                             v
                 ┌───────────────────────────┐
                 │  5. Import runs            │
                 └───────────┬────────────────┘
                             v
                 ┌───────────────────────────────────────────┐
                 │  6. Result Summary                          │
                 │     created: N   skipped: N   errors: N     │
                 │     (skipped includes user-chosen-skip       │
                 │      duplicates + rows that failed mapping)  │
                 └───────────────────────────────────────────┘
```

## Acceptance Criteria (Testable Outcomes)

1. **An Import button is visible and reachable from both the Leads list page and the Organizers list page.**
   proven by: e2e scenario — navigate to `/leads` and `/organizers`, confirm an "Import" action is present and opens the import flow.
   strategy: Agent-Probe (blocked on shared Playwright auth fixture — see Constraints; DOM presence check is otherwise automatable once auth fixture exists)

2. **A user can upload a `.csv` file as the import source and reach the column-mapping step with the file's actual header row shown.**
   proven by: Fully-Automated unit/integration test on the client-side CSV-text-to-rows parsing function, asserting header row + data rows are correctly split from a sample CSV fixture.
   strategy: Fully-Automated

3. **A user can paste a public Google Sheets URL as the import source and reach the same column-mapping step, using the sheet's exported CSV data.**
   proven by: Fully-Automated integration test that mocks the sheet-export fetch (`.../export?format=csv`) with a canned CSV response and asserts the same row-parsing path is used as the file-upload path.
   strategy: Fully-Automated

4. **If the pasted Google Sheets URL is not publicly accessible, the user sees a clear, specific error message (not a silent failure or generic crash) telling them to check sharing settings.**
   proven by: Fully-Automated test that mocks a non-200/HTML-redirect response from the export endpoint and asserts the surfaced error message content.
   strategy: Fully-Automated

5. **The user can map each sheet column to a CRM field (or mark it unmapped), and can proceed with only a subset of fields mapped — no CRM field is hard-required to have a column mapped except the minimum fields the target entity truly needs to be created (e.g. a lead needs at minimum enough identifying info to be saved; organizers similarly).**
   proven by: Fully-Automated unit test on the mapping-validation function — asserts partial mappings pass validation as long as the minimum-required target fields are present, and fails validation with a clear reason when a true minimum field is missing.
   strategy: Fully-Automated

6. **The preview step shows at least 5 rows (or all rows if fewer than 5) with their mapped field values, before any data is written.**
   proven by: Fully-Automated unit test on the preview-row-builder function, asserting it returns row objects reflecting the current column mapping and does not call any write/insert function.
   strategy: Fully-Automated

7. **Each preview row that matches an existing lead (`normalizedHandle` or `sourceRef`) or existing organizer (`normalizedHandle`) is flagged as a possible duplicate, and the user can choose per-row (or via a bulk toggle) whether to skip or still-import that row — before confirming the import.**
   proven by: Fully-Automated unit test on the duplicate-detection function against a seeded/mocked set of existing leads/organizers, asserting correct flagging for exact and case-insensitive `normalizedHandle` matches and `sourceRef` matches; plus a Fully-Automated test asserting the per-row skip/import choice is honored when building the final import payload.
   strategy: Fully-Automated

8. **Confirming the import creates only the intended target-entity rows (leads or organizers, per the user's Step 2 choice) and never both from a single run.**
   proven by: Fully-Automated integration test asserting a Leads-target import creates only `crm_leads` rows and an Organizers-target import creates only `crm_organizers` rows, from the same input CSV.
   strategy: Fully-Automated

9. **Leads created via this import path are recorded with their origin as a sheet import, distinguishable from manually-created or scraper-ingested leads.**
   proven by: Fully-Automated test asserting created lead rows have `source = 'sheet_import'`.
   strategy: Fully-Automated

10. **After the import runs, the user sees a result summary with counts of rows created, rows skipped, and rows errored, and can see enough detail to understand why any row errored.**
    proven by: Fully-Automated unit test on the import-result-summary builder, asserting correct counts and per-row error messages for a mixed input (some valid, some invalid, some skipped-duplicate rows).
    strategy: Fully-Automated

11. **Rows that are flagged as duplicates and the user chooses to skip are not written to the database, and are reflected in the "skipped" count of the result summary (not silently dropped or miscounted as an error).**
    proven by: Fully-Automated integration test asserting a user-skipped duplicate row is absent from the DB after import and present in the skipped count.
    strategy: Fully-Automated

12. **The Organizers page Import button opens the same shared import UI used by the Leads page, pre-scoped to the Organizers target (per #211's dependency on #210's shared UI).**
    proven by: e2e scenario confirming the Organizers-page entry point renders the same import component with target locked to "Organizers"; Fully-Automated unit-level confirms the component accepts a `defaultTarget`/locked-target prop that suppresses the target-choice step.
    strategy: Hybrid (Fully-Automated for the prop/logic; Agent-Probe/e2e for the visible click-through, blocked on shared auth fixture)

## Out Of Scope

- **Private (non-shared) Google Sheets access.** No OAuth flow, no Google API credentials, no service account. If a pasted sheet URL isn't publicly viewable/published, the import fails with a clear error — it does not attempt any authenticated fallback.
- **Superseding or merging with the other two active import plans** (`process/features/import/active/tsv-importer-contract_29-06-26/` — the one-time CLI TSV scraper importer, and `process/features/import/active/organizer-ingest-seeding_06-07-26/` — the scraper-endpoint organizer find-or-create/backfill script). This feature is a third, independent, UI-driven import surface. It may reuse the same dedup logic/pattern where practical, but it does not replace, wrap, or depend on either of those two plans being complete.
- **Mapping to the `category` field.** `crm_leads.category` was removed from the schema (migration 0028) and must not be offered as a mappable target field.
- **Editing already-imported rows from within the import flow.** Once a row is created, any corrections happen through the normal lead/organizer edit surfaces, not through the import wizard.
- **Scheduled or recurring automatic imports.** This is a manual, user-initiated, one-shot-per-run flow. No polling, no webhook-triggered re-import, no "sync" concept.
- **Database-level uniqueness enforcement changes.** No new unique constraint is added to `crm_organizers.normalizedHandle`; dedup here remains an application-level check, consistent with the rest of the codebase's accepted approach.
- **Importing any entity type other than leads and organizers** (e.g. activities, meetings, templates) through this flow.

## Constraints

- **Primary path is CSV upload**; Google Sheets URL paste is secondary and only supports the public/published-to-web export-CSV URL pattern (`https://docs.google.com/spreadsheets/d/{id}/export?format=csv`). No new dependency, no new secret/credential, no `googleapis` package.
- Must follow the repo's established form convention: client-side read/parse, client `zod.safeParse()` validation, then `fetch()` POST — no Superforms (confirmed broken in this repo).
- Server-side DB access only inside `+page.server.ts` / `+server.ts` handlers, per repo convention. No client-side DB imports.
- Soft-delete convention applies: duplicate-checks and any existing-record lookups must respect `deletedAt IS NULL` filtering, consistent with the rest of the codebase.
- Dedup for leads uses `normalizedHandle` and/or `sourceRef` (mirroring existing `crm_leads` indexes); dedup for organizers uses `normalizedHandle` only (mirroring `findOrCreateOrganizer()`'s existing pattern) — no DB schema changes required for either.
- Created leads must set `source = 'sheet_import'` (already a valid value in the existing `leadSource` enum — no enum migration needed).
- No existing multipart/file-upload or CSV-parsing library exists in this repo yet — whatever is chosen (library or hand-rolled parser) is an INNOVATE/PLAN decision, not decided here.
- Must not touch or duplicate the two other independent active import plans (tsv-importer-contract, organizer-ingest-seeding).

## Open Questions

None — all decisions needed to write this SPEC were resolved and locked by the user (see the three locked decisions carried over from RESEARCH: CSV-primary/Sheets-secondary via public export URL, independence from the other two import plans while reusing dedup patterns, and per-row preview-time duplicate flagging with user choice).

## Background / Research Findings

- `crm_leads` dedup fields confirmed in `src/lib/server/db/schema.ts`: `normalizedHandle` (indexed, not unique), `sourceRef` (unique index `crm_leads_source_ref_uq`, nullable/partial), `source` enum already includes `sheet_import` as a valid value. `crm_leads.category` was dropped in migration 0028 — must not be offered as a mappable field.
- `crm_organizers` (schema line ~103–108) has a `normalizedHandle` text column but **no** `sourceRef`/dedup-key column and **no** DB-level unique constraint on `normalizedHandle` — dedup for organizers is application-level only, mirroring the existing `findOrCreateOrganizer()` helper in `src/lib/server/db/organizer-find-or-create.ts` (itself pending merge from the separate `organizer-ingest-seeding_06-07-26` plan, not yet executed).
- No CSV parsing library and no multipart/file-upload pattern exists anywhere in `src/` today. The established repo convention for all forms is: client-side `File.text()` read, client `zod.safeParse()`, then `fetch()` POST with a JSON string field — Superforms is installed but confirmed broken in this repo (typebox conflict) and must not be used.
- `src/routes/leads/+page.svelte` already has a `PageHeader` `actions` snippet containing an "Export CSV" button — the Import button is a sibling addition there.
- `src/routes/organizers/+page.svelte` has no `actions` snippet yet — ORG-3b requires adding one net-new.
- Two other active import plans exist and are intentionally out of scope / not to be duplicated: `process/features/import/active/tsv-importer-contract_29-06-26/` (one-time CLI TSV scraper importer, no UI) and `process/features/import/active/organizer-ingest-seeding_06-07-26/` (scraper-endpoint organizer find-or-create + backfill script, no UI). Both are independent surfaces from this new UI-driven import feature.
- User-locked decisions carried into this SPEC (not re-litigated): (1) CSV is the primary real-world path; Sheets support is the simple public-export-URL fetch with no OAuth; (2) this is a third, independent import surface that should reuse — not reinvent — the `normalizedHandle` dedup pattern and ideally call the same `findOrCreateOrganizer()` helper for organizer-target imports; (3) duplicate flagging happens at preview time, per row, with user-controlled skip/import choice — not as a post-commit-only report.
- Testing context (`process/context/tests/all-tests.md`): Vitest for unit/schema/server logic (no live DB needed via lazy pool), Playwright for e2e — but **all current e2e specs self-skip against protected routes** because there is no shared authenticated-session fixture yet (tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is why UI-click-through acceptance criteria above are marked Agent-Probe/Hybrid rather than Fully-Automated e2e — the underlying logic (parsing, mapping, dedup, result-summary) is fully automatable and gated as such; only the visible-DOM click-through is blocked pending that shared fixture, matching the pattern already accepted across calendar/reminders/manager-dashboard/pipeline features.
