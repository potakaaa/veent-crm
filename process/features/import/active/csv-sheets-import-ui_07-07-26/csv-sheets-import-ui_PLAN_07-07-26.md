---
name: plan:csv-sheets-import-ui
description: "PLAN — CSV/Google-Sheets import UI for leads and organizers, shared wizard component with client-side parse, batched-dedup preview, and dual-target commit (GitHub #210, #211)"
date: 07-07-26
feature: import
---

# PLAN — CSV & Google Sheets Import UI (Leads + Organizers)

**Date**: 07-07-26
**Status**: CODE NOT STARTED — plan written, pending VALIDATE
**Complexity**: COMPLEX

## Complexity Classification

**COMPLEX** (single plan file, not a phase program). Rationale: ~9 new files + 2 modified pages,
one new client parsing module, two new server endpoints, a rune-based wizard-state class, and a
12-criterion SPEC — more than a SIMPLE one-session shape, but only 4 sequential dependency-linked
sections (not 3+ independently-validated phases each needing its own validate-contract), so it
stays one plan, structured with an internal build order instead of splitting into a phase program.

## Overview

Add a shared `ImportWizard` component reachable from both `/leads` and `/organizers`, letting a
user upload a CSV or paste a public Google Sheets URL, map columns to CRM fields, preview rows
(with duplicate flags), and commit a batch create of either leads or organizers. No schema
changes. Client-side parsing (CSV text + Sheets CSV export fetch, both same parser), two thin
server endpoints (`preview` = dedup-check only, `commit` = writes), server-side zod re-validation
on both endpoints (client data is UX-only, never a trust boundary).

## Goals

- One shared `ImportWizard` modal invocable from Leads and Organizers pages
- CSV upload and Google Sheets URL both funnel through one row-parsing path
- Column mapping UI with per-CRM-field dropdown assignment (skip allowed)
- Preview step (>=5 rows) with per-row duplicate flag + skip/import toggle (individual + bulk)
- Batched (not N+1) dedup check against existing `crm_leads`/`crm_organizers`
- Commit endpoint creates only the target entity type per run; sets `source: 'sheet_import'` for leads
- Result summary: created / skipped / errored counts with per-row error detail

## Scope

In scope: new `src/lib/components/import/` directory, wizard state class, parsing module,
mapping/preview/commit UI steps, 2 new `+server.ts` endpoints, Leads/Organizers page wiring,
associated zod schemas, unit/integration tests per SPEC's Fully-Automated criteria.

Out of scope (per SPEC): private/OAuth Sheets access, merging with
`tsv-importer-contract_29-06-26` or `organizer-ingest-seeding_06-07-26`, `category` field mapping,
post-import row editing, scheduled/recurring imports, DB uniqueness constraint changes, importing
any entity type besides leads/organizers.

## Decision Summary Carried From INNOVATE (do not re-decide)

- Single shared `ImportWizard` Svelte 5 component in `src/lib/components/import/`
- Wizard state: rune-based `.svelte.ts` class, `setContext`/`getContext` (mirrors
  `src/lib/components/ui/sidebar/context.svelte.ts` pattern)
- Both CSV file and Sheets URL parsed **client-side** with one hand-rolled parser (no new
  dependency) — RFC-4180-ish quoted-field/comma/CRLF/BOM handling
- Sheets URL fetched client-side directly (`fetch()` the `.../export?format=csv` URL from the
  browser) — confirmed CORS-viable for public/published sheets by
  `csv-sheets-import-ui_FEASIBILITY_07-07-26.md` (VIABLE verdict, `credentials: 'omit'`, default
  `redirect: 'follow'`, no server proxy needed for the public-sheet case)
- Server NEVER fetches a user-supplied URL itself (SSRF avoidance) — only the browser fetches it
- Two thin JSON endpoints: `preview` (dedup-check only, zero writes) and `commit` (writes)
- Server independently zod-validates every row on both endpoints regardless of client parse result
- Dedup check is one batched query per preview request (collect all
  `normalizedHandle`/`sourceRef` values from the parsed dataset, one `IN (...)`-shaped query, then
  in-memory match) — never N+1 per-row queries
- Reuse `findOrCreateOrganizer()` (`src/lib/server/db/organizer-find-or-create.ts`, already has
  `dryRun` mode) for organizer-target dedup/link where practical
- Leads created via this path get `source = 'sheet_import'` (existing enum value — no migration)
- No DB schema changes anywhere
- **Reuse, do not reinvent:** `src/lib/server/import-utils.ts` already exports
  `normalizeHandle()`, `normalizeCountry()`, `parseCountryFromLocation()`, `normalizePlatform()`,
  `mapCategory()` (category mapping is unused here per Out of Scope), `inferCurrentPlatform()`.
  The new commit-endpoint row-to-lead mapper reuses these directly instead of re-deriving
  normalization logic — mirrors the existing pattern in
  `src/routes/api/leads/ingest/+server.ts`.

## Internal Build Order (sequential dependency chain within this one plan)

1. **Client-side parsing + wizard state** — CSV/Sheets row parser, wizard state class (no
   server dependency)
2. **Column mapping UI + preview/dedup server endpoint** — depends on 1
3. **Commit endpoint + result summary** — depends on 2
4. **Wire shared component into Leads + Organizers page action snippets** — depends on 1-3

---

## Touchpoints

### New files

| File | Purpose |
|---|---|
| `src/lib/components/import/ImportWizard.svelte` | Top-level modal/dialog shell; renders the active step component based on wizard state |
| `src/lib/components/import/ImportWizard.svelte.ts` | Rune-based wizard state class (`.svelte.ts`, `$state`) — current step, source, target, raw rows, header row, column mapping, per-row skip/import choices, result summary. Exposed via `setContext`/`getContext` (module-level `IMPORT_WIZARD_KEY` symbol, mirrors `src/lib/components/ui/sidebar/context.svelte.ts`) |
| `src/lib/components/import/steps/SourceStep.svelte` | Step 1: file input (`.csv`) or Sheets URL text input, source-fetch/parse trigger, inline error surface (AC4) |
| `src/lib/components/import/steps/TargetStep.svelte` | Step 2: Leads/Organizers radio choice; suppressed (auto-set, no UI) when `defaultTarget`/locked-target prop is passed (AC12) |
| `src/lib/components/import/steps/MappingStep.svelte` | Step 3: per-column dropdown mapped to CRM field list (target-dependent field list), "Don't import" option |
| `src/lib/components/import/steps/PreviewStep.svelte` | Step 4: table of >=5 rows w/ mapped values, per-row duplicate badge + skip/import toggle, bulk-toggle-all-flagged control |
| `src/lib/components/import/steps/ResultStep.svelte` | Step 6: created/skipped/errored counts + per-row error list |
| `src/lib/utils/import-parse.ts` | Pure CSV-text-to-rows parser (`parseCsvText(text): { headers: string[]; rows: string[][] }`) — RFC-4180-ish quoted-field/comma/CRLF/BOM handling. Zero SvelteKit/DB imports (mirrors `import-utils.ts` isolation convention) so it is trivially unit-testable |
| `src/lib/utils/import-sheets-fetch.ts` | `buildSheetsExportUrl(sheetUrl: string): string \| null` (extracts sheet ID, builds `.../export?format=csv`) + `fetchSheetAsCsvText(url: string): Promise<string>` wrapping `fetch()` with the specific error classification for AC4 (non-200 / HTML-redirect-to-login response → thrown typed error with the plain-language message) |
| `src/lib/utils/import-mapping.ts` | Pure functions: `validateMapping(mapping, target): { valid: boolean; reason?: string }` (AC5 minimum-field check), `buildPreviewRows(rows, headers, mapping): PreviewRow[]` (AC6, never calls a write function) |
| `src/lib/utils/import-dedup.ts` | Pure function: `flagDuplicates(previewRows, existingHandles: Set<string>, existingSourceRefs: Set<string>): PreviewRow[]` — in-memory matching only, no DB import (AC7) |
| `src/routes/api/import/preview/+server.ts` | `POST` — server zod-revalidates rows, runs ONE batched dedup query per target, returns per-row duplicate flags. Zero writes. |
| `src/routes/api/import/commit/+server.ts` | `POST` — server zod-revalidates rows again, applies per-row skip/import user choices, batch-inserts only the target entity type, returns `{ created, skipped, errored, errors: [...] }` (AC8, AC9, AC10, AC11) |
| `src/lib/zod/schemas.ts` (append, not new file) | `importPreviewRequestSchema`, `importCommitRequestSchema` — target-discriminated (`z.discriminatedUnion('target', [...])` or equivalent), row shape validated per target's minimum-required-field rule (AC5) |

### Modified files

| File | Change |
|---|---|
| `src/routes/leads/+page.svelte` | Add `<Button>` "Import" inside the existing `{#snippet actions()}` block (next to "Export CSV", line ~178-181), opens `<ImportWizard>` with no locked target |
| `src/routes/organizers/+page.svelte` | Add a NET-NEW `{#snippet actions()}` prop to the existing `<PageHeader title="Organizers" subtitle=... />` call (currently has no `actions` snippet at all — confirmed via Read), containing an "Import" button; `<ImportWizard defaultTarget="organizers" locked />` |

### What is explicitly NOT touched

- `src/lib/server/db/schema.ts` — no migration
- `src/lib/server/import-utils.ts` — read-only reuse, no edits
- `src/lib/server/db/organizer-find-or-create.ts` — read-only reuse, no edits
- `process/features/import/active/tsv-importer-contract_29-06-26/` and
  `process/features/import/active/organizer-ingest-seeding_06-07-26/` — independent surfaces,
  zero code overlap

---

## Public Contracts

**Auth guard (PVL supplement 07-07-26):** both endpoints below are NOT in `hooks.server.ts`'s
`PUBLIC_PREFIXES` list, so the global session gate already redirects unauthenticated browser
navigation — but per the sibling convention in `src/routes/api/leads/+server.ts`, each handler
must ALSO start with an explicit `if (!locals.user) throw error(401, 'Unauthorized')` guard. This
gives fetch() callers a clean JSON 401 instead of relying on the hooks-level HTML redirect (which
fetch() would otherwise follow and fail to `.json()`-parse cleanly) if a session expires
mid-wizard. This is not new auth logic — it mirrors the existing pattern, not a new mechanism.

### `POST /api/import/preview`

Request (JSON): `{ target: 'leads' | 'organizers'; rows: Array<Record<string, string>> }` (rows
already column-mapped client-side to CRM field keys — server does not see raw sheet headers).

**Row cap (PVL supplement 07-07-26):** `rows` is capped at 2000 entries in
`importPreviewRequestSchema`/`importCommitRequestSchema` (`z.array(...).max(2000)`, mirroring
the existing `ingestBatchSchema.leads.max(1000)` pattern in `schemas.ts`) — prevents an
unbounded `IN (...)` dedup query and unbounded batch-insert from a pathologically large CSV/Sheet
upload. A payload exceeding the cap is rejected by server zod validation (surfaces as a validation
error, same path as any other server-schema-invalid payload).

Response: `{ previews: Array<{ index: number; data: Record<string, unknown>; isDuplicate: boolean; duplicateReason?: 'normalizedHandle' | 'sourceRef' }> }`

Server behavior: re-runs `importPreviewRequestSchema` (or `importCommitRequestSchema` minus
write-only fields) against every row — a client-side-valid row that fails server zod is reported
as a validation error entry, not silently accepted. One batched query per target:
- `leads`: `SELECT normalizedHandle, sourceRef FROM crm_leads WHERE deletedAt IS NULL AND (normalizedHandle IN (...) OR sourceRef IN (...))`
- `organizers`: `SELECT normalizedHandle FROM crm_organizers WHERE lower(normalizedHandle) IN (...)` (case-insensitive, matches `findOrCreateOrganizer`'s existing lookup)

Zero writes. No `INSERT`/`UPDATE` anywhere in this handler — enforced as a Fully-Automated test
gate (grep-assert or explicit spy on the db client in a route test).

### `POST /api/import/commit`

Request (JSON): `{ target: 'leads' | 'organizers'; rows: Array<{ data: Record<string, string>; skip: boolean }> }`
(same mapped-row shape as preview, plus the user's final per-row skip/import decision from the
Preview step).

Response: `{ created: number; skipped: number; errored: number; errors: Array<{ index: number; message: string }> }`

Server behavior: re-validates every non-skipped row's zod shape (independent of what preview
already checked — no shared mutable state between the two requests); for `target: 'leads'`,
inserts only into `crm_leads` with `source: 'sheet_import'`, `stage: 'new'`, `ownerId: null` (new
leads land unassigned, matching the ingest-endpoint convention), reusing `normalizeHandle` /
`normalizeCountry` / `parseCountryFromLocation` / `normalizePlatform` / `inferCurrentPlatform`
from `import-utils.ts` for any field not explicitly present in the mapped row; for
`target: 'organizers'`, calls `findOrCreateOrganizer()` per non-skipped, non-duplicate row (no
`dryRun`) or increments `skipped` when the row is user-marked-skip. **Never inserts into both
tables in one call** (AC8 — enforced structurally: one `if (target === 'leads') {...} else {...}`
branch, no shared insert path).

### `ImportWizard.svelte` props

```ts
interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTarget?: 'leads' | 'organizers';
  /** When true, Step 2 (target choice) is skipped/hidden — target is locked to defaultTarget. */
  locked?: boolean;
}
```

---

## Blast Radius

- **Package/app scope:** single SvelteKit app (`veent-crm`), no cross-package impact
- **New files:** 12 (component + steps + 3 util modules + 2 server endpoints, per Touchpoints
  table above)
- **Modified files:** 2 (`src/routes/leads/+page.svelte`, `src/routes/organizers/+page.svelte`) +
  1 append-only edit (`src/lib/zod/schemas.ts` — new schemas, no existing schema changed)
- **Risk class:** none of auth/billing/schema-migration/public-API-contract-break/secrets — this
  is a net-new internal write path gated by the same session auth as every other protected route
  (no new auth logic). Dedup/creation writes to `crm_leads`/`crm_organizers` are the same shape as
  existing `findOrCreateOrganizer()`/ingest-endpoint writes, not a new mutation class.
- **Schema/DB:** zero migrations; reads/writes existing columns only
- **Total distinct files touched:** 14

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| e2e: `/leads` and `/organizers` render an "Import" action that opens the wizard | Agent-Probe (blocked on shared Playwright auth fixture — pre-accepted repo-wide known-gap) | AC1 |
| Unit: `parseCsvText()` on a sample CSV fixture (quoted fields, commas-in-quotes, CRLF, BOM) returns correct header + data rows | Fully-Automated | AC2 |
| Integration: `fetchSheetAsCsvText()` with mocked `fetch()` returning a canned CSV response reaches the same row-parse path as file upload | Fully-Automated | AC3 |
| Unit: `fetchSheetAsCsvText()` with mocked non-200 / HTML-login-redirect response throws the AC4 plain-language error, surfaced verbatim by `SourceStep.svelte`'s error state | Fully-Automated | AC4 |
| Unit: `validateMapping()` accepts partial mappings when target's true-minimum fields are present; rejects with a stated reason when a minimum field is missing | Fully-Automated | AC5 |
| Unit: `buildPreviewRows()` returns >=5 (or all, if fewer) row objects reflecting current mapping; asserts zero calls to any write/insert function (spy) | Fully-Automated | AC6 |
| Unit: `flagDuplicates()` against a seeded/mocked existing-record set — exact + case-insensitive `normalizedHandle` matches and `sourceRef` matches all flagged; separate unit test on the commit-payload builder confirms per-row skip/import choice is honored | Fully-Automated | AC7 |
| Integration: `POST /api/import/commit` with `target: 'leads'` creates only `crm_leads` rows; same input with `target: 'organizers'` creates only `crm_organizers` rows | Fully-Automated | AC8 |
| Integration: `POST /api/import/commit` (`target: 'leads'`) — created rows assert `source = 'sheet_import'` | Fully-Automated | AC9 |
| Unit: result-summary builder on a mixed valid/invalid/skipped-duplicate input set returns correct `created`/`skipped`/`errored` counts and per-row error messages | Fully-Automated | AC10 |
| Integration: a user-skipped duplicate row is absent from the DB post-commit AND present in the `skipped` count (not `errored`) | Fully-Automated | AC11 |
| e2e: Organizers-page Import button renders `ImportWizard` with target locked to Organizers (no Step 2 UI) | Hybrid — Fully-Automated for the `locked`/`defaultTarget` prop suppressing Step 2 (component-level render assertion); Agent-Probe/e2e for the visible click-through (blocked on shared auth fixture) | AC12 |
| `POST /api/import/preview` performs zero writes (route-level spy on db client asserting no insert/update calls invoked during the request) | Fully-Automated | Carried-forward constraint: server-side zod re-validation + no-write preview |
| Zod re-validation on `preview`/`commit`: a payload that is client-shape-valid but server-schema-invalid (e.g. forged/tampered request) is rejected by the server, not silently accepted | Fully-Automated | Carried-forward constraint: server never trusts client-parsed data |
| Grep/static check: no mappable-field dropdown option lists `category` | Fully-Automated | Carried-forward constraint: `category` excluded (migration 0028) |
| Unit: `buildSheetsExportUrl()` on a malformed/non-Sheets URL (missing ID, wrong domain) returns `null`; on a valid Sheets URL (any of the common URL shapes — `/edit`, `/edit#gid=...`, bare `/d/{id}`) returns the correct `.../export?format=csv` URL | Fully-Automated | (PVL supplement 07-07-26) URL-parse correctness gap found during VALIDATE — was previously only covered indirectly via the fetch-error test |
| Unit: wizard state class (`ImportWizard.svelte.ts`) — step advances only when the current step's validation passes, `locked`/`defaultTarget` prevents target-step mutation, per-row skip/import toggle mutates only the targeted row | Fully-Automated | (PVL supplement 07-07-26) Wizard-state-class gap found during VALIDATE — Phase Completion Rules referenced this test but Verification Evidence had no row/stub for it |
| Unit: `importPreviewRequestSchema`/`importCommitRequestSchema` reject a `rows` array exceeding the 2000-row cap | Fully-Automated | (PVL supplement 07-07-26) Batch-size guard gap found during VALIDATE — no cap existed on the new schemas prior to this supplement |

### TDD Failing Stubs (Fully-Automated rows — for execute-agent red-first start)

```
Failing stub — AC2:
test("parseCsvText splits header + data rows from a sample CSV fixture with quoted fields, commas-in-quotes, CRLF, and BOM", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: parseCsvText header/row split")
})

Failing stub — AC3:
test("fetchSheetAsCsvText mocked fetch reaches the same row-parse path as file upload", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: sheets-fetch shares parse path with CSV upload")
})

Failing stub — AC4:
test("fetchSheetAsCsvText throws the plain-language sharing error on non-200/login-redirect response", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: sheet-not-accessible error message")
})

Failing stub — AC5:
test("validateMapping accepts partial mappings when minimum-required target fields are present, rejects with a reason otherwise", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: mapping-validation minimum-field rule")
})

Failing stub — AC6:
test("buildPreviewRows returns >=5 mapped preview rows and calls zero write functions", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: preview-row-builder no-write guarantee")
})

Failing stub — AC7:
test("flagDuplicates flags exact and case-insensitive normalizedHandle matches and sourceRef matches; per-row skip choice honored in final payload", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: duplicate flagging + skip/import choice")
})

Failing stub — AC8:
test("commit endpoint with target=leads creates only crm_leads rows; target=organizers creates only crm_organizers rows from same input", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: single-target-only writes")
})

Failing stub — AC9:
test("commit endpoint leads-target rows have source='sheet_import'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: sheet_import source tagging")
})

Failing stub — AC10:
test("result-summary builder returns correct created/skipped/errored counts and per-row error messages for a mixed input", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: result-summary counts and error detail")
})

Failing stub — AC11:
test("user-skipped duplicate row is absent from DB post-commit and counted in skipped (not errored)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: skip-not-error accounting")
})

Failing stub — AC12 (Fully-Automated slice):
test("ImportWizard with locked+defaultTarget='organizers' suppresses the target-choice step", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: locked-target step suppression")
})

Failing stub — preview no-write guarantee:
test("POST /api/import/preview never calls db.insert or db.update", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: preview endpoint zero-write guarantee")
})

Failing stub — server re-validation guarantee:
test("POST /api/import/commit rejects a tampered payload that is client-shape-valid but server-schema-invalid", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: server-side zod re-validation is authoritative")
})
```

Failing stub — buildSheetsExportUrl (PVL supplement):
test("buildSheetsExportUrl returns null for a malformed/non-Sheets URL and the correct export CSV URL for valid Sheets URL shapes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: sheets-url parse correctness")
})

Failing stub — wizard state class (PVL supplement):
test("ImportWizard.svelte.ts wizard state: step advance gated on validation, locked target immutable, per-row skip toggle scoped to one row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: wizard-state-class transitions")
})

Failing stub — row-cap guard (PVL supplement):
test("importPreviewRequestSchema/importCommitRequestSchema reject a rows array exceeding the 2000-row cap", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: batch row-count cap enforcement")
})

### Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Live click-through of the full 6-step wizard flow in a real browser | Blocked on shared Playwright authenticated-session fixture (repo-wide known-gap, `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) | Accept as known-gap, matching the pattern already accepted across calendar/reminders/manager-dashboard/pipeline; e2e specs written but self-skipping per existing convention |
| Real Google Sheets CORS behavior against a live, non-mocked public sheet | Feasibility already empirically probed and confirmed VIABLE (see FEASIBILITY doc); re-probing per-test-run would be a live external dependency, not appropriate for CI | Accept as known-gap for automated CI; the FEASIBILITY doc's curl evidence stands as the one-time empirical proof; mocked `fetch()` covers the code-path logic |
| Private/restricted Google Sheet CORS/error behavior | Explicitly out of scope per SPEC; FEASIBILITY doc's "what remains uncertain" section flags this as untested | Out of scope — no resolution needed this plan; documented as a known-gap carried from FEASIBILITY |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Risks

| Risk | Mitigation |
|---|---|
| Client-side CSV/Sheets parser drifts from server zod validation, producing preview/commit mismatches | Server independently re-validates every row on both `preview` and `commit` (never trusts client parse) — carried-forward constraint, enforced as its own test gate above |
| Google's undocumented CORS behavior on the Sheets export endpoint changes in the future (no public API contract guarantees it) | Documented as an accepted known-gap per the FEASIBILITY doc; AC4's error path is the long-term safety net if CORS ever breaks — a broken fetch surfaces the same "sheet not accessible" message rather than crashing |
| N+1 dedup queries accidentally introduced during EXECUTE (e.g. a naive per-row loop) | Public Contracts section above locks the batched-query shape explicitly; EXECUTE must implement the single `IN (...)`-shaped query per target, not a loop |
| Organizers page currently has zero `actions` snippet — risk of PageHeader prop-shape mismatch | Confirmed via Read: `PageHeader` already supports an `actions` snippet (used identically on `/leads`) — this is additive, not a new PageHeader capability |

## Dependencies

- None on the other two active import plans (`tsv-importer-contract_29-06-26`,
  `organizer-ingest-seeding_06-07-26`) — this plan does not wait on or call into either
- `findOrCreateOrganizer()` (`src/lib/server/db/organizer-find-or-create.ts`) — already exists,
  already has `dryRun` mode, no changes needed to it
- `import-utils.ts` normalization helpers — already exist, no changes needed

## Acceptance Criteria

Mirrors the 12 SPEC acceptance criteria verbatim (see SPEC doc for full "proven by" text); this
plan's Verification Evidence table above maps each to its concrete test strategy:

1. Import button reachable from both `/leads` and `/organizers`.
2. CSV upload reaches column-mapping with the file's real header row.
3. Google Sheets URL paste reaches the same column-mapping step via exported CSV data.
4. Inaccessible Sheets URL surfaces a clear, specific error (not a silent failure/crash).
5. Column mapping supports partial mapping; only true entity-minimum fields are hard-required.
6. Preview shows >=5 rows (or all, if fewer) with mapped values, before any write.
7. Preview flags per-row duplicates (`normalizedHandle`/`sourceRef`); user can skip/import
   per-row or via bulk toggle before confirming.
8. Confirming import creates only the chosen target entity type, never both from one run.
9. Leads created via this path have `source = 'sheet_import'`.
10. Result summary shows created/skipped/errored counts with per-row error detail.
11. User-skipped duplicate rows are absent from the DB and counted as skipped, not errored.
12. Organizers-page Import button opens the same shared wizard, locked to Organizers target.

Testable/measurable per row in the Verification Evidence table — "done" for each criterion means
its named Fully-Automated/Hybrid/Agent-Probe gate is green, not a subjective judgment call.

## Phase Completion Rules

This is a single COMPLEX plan (no phase-program split), so "phase completion" refers to the
4-step Internal Build Order above, gated by the per-section Fully-Automated test rows in
Verification Evidence and validated per `process/context/tests/all-tests.md`'s default
verification order (`bun run check` → `bun run test:unit` → `bun run test:e2e`):

- **Step 1 (parsing + wizard state) complete when:** `parseCsvText` and wizard-state-class unit
  tests are green; no server/UI dependency yet, so this step has no blocking gate on later steps.
- **Step 2 (mapping UI + preview endpoint) complete when:** AC5, AC6, AC7 Fully-Automated gates
  and the preview-endpoint zero-write gate are green.
- **Step 3 (commit endpoint + result summary) complete when:** AC8, AC9, AC10, AC11 gates and the
  server-side re-validation gate are green.
- **Step 4 (page wiring) complete when:** AC1, AC12's Fully-Automated slice are green; AC1/AC12's
  e2e/Agent-Probe portions remain a documented known-gap per Verification Evidence.
- **Plan-level `CODE DONE`** requires all 4 steps' Fully-Automated/Hybrid gates green — NOT
  `VERIFIED` until a human confirms the click-through flow once the shared Playwright auth
  fixture lands (explicit user-confirmation language required before any `✅ VERIFIED` marker is
  used, per plan-artifact convention).

## Post-Phase Testing / Test Procedure

Per `process/context/all-context.md` and `process/context/tests/all-tests.md`: run
`bun run check` first (catches most regressions fastest), then `bun run test:unit` for every
Fully-Automated gate listed in Verification Evidence above, then `bun run test:e2e` for the
AC1/AC12 e2e specs (expected to self-skip per the repo-wide shared-auth-fixture known-gap until
that fixture lands — this is an accepted, documented gap, not a silent failure).

## Validate Contract

Status: CONDITIONAL
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: single COMPLEX plan (not a phase program), 14 total files, all mechanical evidence
gathered via direct Read/Grep against the live repo in one pass — no independent investigation
directions requiring fan-out; V2 Layer 1 (4 dimensions) + Layer 2 (4 build-order sections) were
each run as one focused analysis pass, not spawned as separate agents (tool environment had no
Agent/Task tool available this session — see Execution Notes below).

### Execution Notes (V2 method)

This VALIDATE pass ran without an Agent/Task tool available in the session — Layer 1 (4
dimensions) and Layer 2 (4 sections) were each analyzed directly against live repo evidence
(Read/Grep/Bash) rather than spawned as parallel subagents. Per `vc-agent-strategy-compare`,
this plan scores LOW on the 7-signal table (single package, no 3+ directions, not a phase
program) — sequential/single-pass analysis was the correct-fit strategy regardless of tool
availability, so no capability was lost by this constraint.

One genuine BLOCKED-caliber gap set was found during V2 (missing row-cap, missing auth-guard
convention note, 2 missing test rows) and was resolved via a same-session PVL-supplement pass
(plan text patched directly — see the 4 `(PVL supplement 07-07-26)` markers in Public Contracts
and Verification Evidence above) rather than a separate spawned vc-plan-agent round-trip, per
this session's explicit autonomy grant to run the fix loop directly instead of stopping to ask.
This counts as 1 completed PVL supplement cycle for the VALIDATE → EXECUTE gate check.

### Layer 1 — Dimension Findings

| Finding | Severity | Proposed fix |
|---|---|---|
| `hooks.server.ts` `PUBLIC_PREFIXES` correctly excludes `/api/import/*` — global session gate already applies with zero new code | PASS | — |
| Sibling API routes (`/api/leads/+server.ts`) add an explicit `if (!locals.user) throw error(401, ...)` guard in addition to the hooks-level redirect; original plan text omitted this for the 2 new endpoints | CONCERN | Fixed in plan — added explicit auth-guard note to Public Contracts (PVL supplement); carried to Execute-Agent Instruction E1 below |
| No cap on `rows` array size in the new preview/commit request schemas — unbounded CSV/Sheet upload could produce an oversized `IN (...)` dedup query | CONCERN | Fixed in plan — added 2000-row cap mirroring existing `ingestBatchSchema.leads.max(1000)` (PVL supplement) |
| No schema migration; `schemas.ts` edit is strictly additive (new exports only) | PASS | — |
| AC1/AC12 e2e click-through remains Agent-Probe, functionally self-skipping (no shared Playwright auth fixture) — same repo-wide pre-accepted pattern as calendar/reminders/manager-dashboard/pipeline | CONCERN (known, carried forward per user instruction — not a new finding) | Accepted as known-gap; see Known Gaps below |
| AC8/AC9/AC11 were labeled "Fully-Automated" in the plan's Verification Evidence, but they assert real `crm_leads`/`crm_organizers` row creation — the repo's established convention for this exact kind of assertion is the `*-db.spec.ts` SKIP_DB-gated pattern (e.g. `organizers-db.spec.ts`), which is a Hybrid gate (precondition: a local Postgres container running), not Fully-Automated | CONCERN | Retiered in this contract's Test Gates table below (B — fixed via this plan's checklist: reuse the existing `*-db.spec.ts` convention, no new test infra needed); carried to Execute-Agent Instruction E2 |
| Two missing Fully-Automated test rows found: `buildSheetsExportUrl()` URL-parse correctness (only the fetch-error path was covered) and the wizard-state class's own transition logic (referenced by Phase Completion Rules but absent from Verification Evidence) | CONCERN | Fixed in plan — 2 new Verification Evidence rows + TDD stubs added (PVL supplement) |

**Infra fit: PASS** — no container/port/env changes; session gate is automatic.
**Test coverage: CONCERN** — resolved to CONDITIONAL-acceptable after supplement (3 new gates added, 3 gates retiered Hybrid); one named residual remains (AC1/AC12 e2e), pre-accepted.
**Breaking changes: PASS** — additive only, no existing contract altered.
**Security surface: PASS** (after supplement) — SSRF avoided by design (server never fetches user-supplied URL); explicit 401 guard now specified; batch size capped.

### Layer 2 — Section Findings (Internal Build Order)

| Section | Status | Mechanical feasibility | Gaps found | Conflicts found | Highest-risk edit + mitigation |
|---|---|---|---|---|---|
| 1 — Parsing + wizard state | PASS | `src/lib/components/ui/sidebar/context.svelte.ts` confirmed as a valid rune-class + `setContext`/`getContext` pattern to mirror; no existing file collisions for any of the 4 new files in this section (confirmed via direct filesystem check) | Wizard-state-class had no dedicated test row — fixed via supplement | None | Wizard state must not leak between wizard opens (stale rows from a prior import) — mitigate by re-instantiating state on `open` transition from false→true, not reusing a singleton |
| 2 — Mapping UI + preview endpoint | PASS | `crm_leads.normalizedHandle` (indexed, not unique) and `sourceRef` (unique index `crm_leads_source_ref_uq`) confirmed at schema.ts:139/197/208-215; `crm_organizers.normalizedHandle` confirmed present with NO unique constraint and NO `sourceRef` column, matching plan's dedup-query claims exactly; `PageHeader.svelte` confirmed to accept an optional `actions: Snippet` prop (already used identically on `/leads`); `z.discriminatedUnion` precedent confirmed at `schemas.ts:265` (`moveStageSchema`) | No row-cap on preview payload — fixed via supplement | None | Batched `IN (...)` dedup query must not become a per-row loop — Public Contracts section explicitly locks the single-query shape; mitigate by making this an explicit Execute-Agent Instruction (E3) |
| 3 — Commit endpoint + result summary | PASS | `leadSource` enum confirmed to include `'sheet_import'` at schema.ts:47; `crm_leads.name`/`crm_organizers.name` confirmed `notNull` (the true AC5 minimum fields); `findOrCreateOrganizer()`'s `dryRun` option confirmed present, no changes needed | Missing explicit auth-guard convention note — fixed via supplement; AC8/AC9/AC11 tier correction (see Layer 1) | None | Never-both-tables-in-one-call structural guarantee (AC8) — mitigate with a single top-level `if (target === 'leads') {...} else {...}` branch, no shared insert helper, as the plan already specifies |
| 4 — Page wiring | PASS | `src/routes/leads/+page.svelte` confirmed to have an `actions` snippet with "Export CSV" at lines 177-182 (Import button is a sibling addition); `src/routes/organizers/+page.svelte` confirmed to have a bare `<PageHeader title=... subtitle=... />` self-closing call at line 94 with NO `actions` snippet today — additive-only change, not a new `PageHeader` capability | None beyond the pre-accepted e2e known-gap | None | Organizers-page `actions` snippet is net-new on that page — mitigate by keeping the added snippet minimal (single Import button) to avoid scope creep into unrelated Organizers-page toolbar work |

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | CONCERN |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| Section 1 — Parsing + wizard state | PASS |
| Section 2 — Mapping UI + preview endpoint | PASS |
| Section 3 — Commit endpoint + result summary | PASS |
| Section 4 — Page wiring | PASS |

**Totals: 0 FAILs / 1 CONCERN / 7 PASSes**

**→ Net Gate: CONDITIONAL**

0 FAILs. 1 CONCERN (test coverage — AC1/AC12 e2e click-through known-gap, pre-existing repo-wide
pattern, explicitly pre-accepted per this session's delegation instructions). 4 supplement fixes
already applied directly to plan text (row cap, auth-guard note, 2 new test rows) — these
resolved what would otherwise have been additional CONCERNs. Proceed to EXECUTE with the 1
remaining named residual on record (not vacuously green — the residual is explicitly named, not
silently absorbed into a PASS).

### Test Gates (5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Import button reachable from `/leads` and `/organizers`, opens wizard | Agent-Probe | e2e spec (self-skipping pending shared Playwright auth fixture) | D |
| AC2 | CSV upload reaches mapping step with real header row | Fully-Automated | `bun run test:unit -- src/lib/utils/import-parse.spec.ts` — `parseCsvText()` fixture test | A |
| AC3 | Sheets URL reaches same mapping step via exported CSV | Fully-Automated | `bun run test:unit -- src/lib/utils/import-sheets-fetch.spec.ts` — mocked-fetch integration test | A |
| AC4 | Inaccessible Sheets URL surfaces plain-language error | Fully-Automated | `bun run test:unit -- src/lib/utils/import-sheets-fetch.spec.ts` — non-200/redirect mock test | A |
| AC5 | Partial column mapping allowed; true-minimum fields enforced | Fully-Automated | `bun run test:unit -- src/lib/utils/import-mapping.spec.ts` — `validateMapping()` test | A |
| AC6 | Preview shows >=5 rows, zero writes before confirm | Fully-Automated | `bun run test:unit -- src/lib/utils/import-mapping.spec.ts` — `buildPreviewRows()` no-write spy test | A |
| AC7 | Per-row duplicate flagging + skip/import choice honored | Fully-Automated | `bun run test:unit -- src/lib/utils/import-dedup.spec.ts` — `flagDuplicates()` + payload-builder test | A |
| AC8 | Commit creates only the chosen target entity type | Hybrid (retiered from plan's "Fully-Automated" label) | local Postgres container running, then `bun run test:unit:ci` — `src/tests/import-commit-db.spec.ts` (SKIP_DB-gated, mirrors `organizers-db.spec.ts`) | B |
| AC9 | Leads created via this path have `source = 'sheet_import'` | Hybrid (retiered) | same `import-commit-db.spec.ts` file, additional assertion | B |
| AC10 | Result summary shows correct created/skipped/errored + error detail | Fully-Automated | `bun run test:unit` — result-summary-builder unit test (pure function, mixed input) | A |
| AC11 | User-skipped duplicate absent from DB, counted as skipped not errored | Hybrid (retiered) | same `import-commit-db.spec.ts` file, additional assertion | B |
| AC12 | Organizers-page Import opens same wizard, locked to Organizers | Hybrid | Fully-Automated slice: wizard-state-class test (`locked`/`defaultTarget` suppresses step 2 — see supplement row below); Agent-Probe slice: e2e click-through (self-skipping, same known-gap as AC1) | A (logic slice) / D (e2e slice) |
| carried-forward | `POST /api/import/preview` performs zero writes | Fully-Automated | route-level spy on db client asserting no insert/update calls | A |
| carried-forward | Server independently re-validates; tampered payload rejected | Fully-Automated | zod-reject unit test on `importCommitRequestSchema` with a client-shape-valid/server-invalid payload | A |
| carried-forward | `category` never offered as a mappable field | Fully-Automated | grep/static check — no `category` string in field-list constants | A |
| supplement | `buildSheetsExportUrl()` parse correctness (malformed URL → null; valid shapes → correct export URL) | Fully-Automated | `bun run test:unit -- src/lib/utils/import-sheets-fetch.spec.ts` — URL-parse test | A |
| supplement | Wizard-state class: step-advance gating, locked-target immutability, per-row skip-toggle scoping | Fully-Automated | `bun run test:unit -- src/lib/components/import/ImportWizard.svelte.spec.ts` | A |
| supplement | Row-cap: `rows` array rejected above 2000 entries | Fully-Automated | `bun run test:unit` — zod schema `.max(2000)` rejection test | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated
/ Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value — the D-rows above are Agent-Probe
strategy with a D gap-resolution (the e2e spec exists and is written, it self-skips pending the
shared auth fixture — this is a named residual, not a silent Known-Gap).

Legacy line form (retained for existing validate-contract consumers):
- import-parse/import-mapping/import-dedup/import-sheets-fetch: Fully-automated: `bun run test:unit`
- import-commit-db integration (AC8/AC9/AC11): Hybrid: local Postgres container running (`docker compose up -d db`), then `bun run test:unit:ci`
- AC1/AC12 e2e click-through: agent-probe: e2e spec written, self-skips pending shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- category-exclusion grep: Fully-automated: static string-absence check on mappable-field constants

### Dimension findings

- Infra fit: PASS — no container/port/env surface; hooks.server.ts session gate covers new routes automatically
- Test coverage: CONCERN — 1 named residual (AC1/AC12 e2e click-through, pre-accepted repo-wide known-gap); all other 15 gate rows are Fully-Automated or Hybrid with a concrete command
- Breaking changes: PASS — additive-only; no existing contract, schema, or route changed
- Security surface: PASS — SSRF avoided by design; explicit auth-guard convention now specified; batch size capped at 2000 rows
- Section 1 feasibility (parsing + wizard state): PASS — mechanically confirmed, no collisions, wizard-state test gap closed via supplement
- Section 2 feasibility (mapping UI + preview endpoint): PASS — schema/PageHeader/discriminatedUnion claims all confirmed against live files, row-cap gap closed via supplement
- Section 3 feasibility (commit endpoint + result summary): PASS — enum/notNull/dryRun claims confirmed, auth-guard note + AC8/9/11 tier correction applied
- Section 4 feasibility (page wiring): PASS — both page files confirmed exactly as plan describes; only residual is the pre-accepted e2e known-gap

Open gaps:
- AC1/AC12 e2e click-through: known-gap: documented as pre-accepted (shared Playwright auth fixture absent — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); matches the same pattern already accepted across calendar/reminders/manager-dashboard/pipeline; NOT a new gap introduced by this plan
- Real (non-mocked) Google Sheets CORS behavior: known-gap: documented — one-time empirical proof stands (FEASIBILITY doc, VIABLE verdict); not re-probed per CI run; mocked `fetch()` covers code-path logic
- Private/restricted Google Sheets CORS/error behavior: known-gap: documented as out of scope per SPEC; carried from FEASIBILITY's "what remains uncertain" section

What this coverage does NOT prove:
- The Fully-Automated/Hybrid gates above prove: correct CSV/Sheets parsing, correct column-mapping validation, correct preview-row construction with zero writes, correct duplicate flagging and skip/import payload construction, correct single-target-only DB writes with correct `source` tagging (once the live-DB Hybrid gate is run), correct result-summary counts/errors, correct row-cap rejection, and correct wizard-state step-gating logic.
- They do NOT prove: that a real human can actually click through the full 6-step wizard in a live browser session (AC1/AC12 e2e slice — blocked on the shared Playwright auth fixture); that Google's undocumented CORS behavior on the Sheets export endpoint remains stable indefinitely (one-time `curl`-based proof only, not a continuously-monitored contract); that a private/restricted Google Sheet fails gracefully (explicitly out of scope); that the AC8/AC9/AC11 Hybrid gates actually ran in this environment (they are SKIP_DB-gated and will self-skip without a running local Postgres container — this VALIDATE pass could not execute them, only confirm they are correctly specified against the existing `*-db.spec.ts` convention).

Gate: CONDITIONAL (concerns noted, user/session accepted)
Accepted by: session (autonomous, /goal execution) — orchestrator's delegation explicitly pre-authorized carrying forward the shared-Playwright-auth-fixture known-gap (AC1/AC12 e2e) as an accepted, non-blocking residual, matching the identical pattern already accepted for calendar, reminders, manager-dashboard, and pipeline. All other CONCERNs found during this VALIDATE pass (row cap, auth-guard note, AC8/9/11 tier correction, 2 missing test rows) were fixed directly in the plan text this same cycle (1 PVL-supplement cycle completed) rather than left open.

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Add `if (!locals.user) throw error(401, 'Unauthorized')` as the first line of both `src/routes/api/import/preview/+server.ts` and `src/routes/api/import/commit/+server.ts` handlers, mirroring `src/routes/api/leads/+server.ts`. This is redundant with the `hooks.server.ts` gate but gives `fetch()` callers a clean JSON 401 instead of an HTML redirect. | Writing either new `+server.ts` file |
| E2 | Write AC8/AC9/AC11's DB-assertion tests as a new `src/tests/import-commit-db.spec.ts` following the exact SKIP_DB early-return pattern in `src/tests/organizers-db.spec.ts` (skip when no local Postgres connection string is configured) — do NOT attempt to mock the entire `db` module for these three assertions; this repo's convention is real-DB-or-skip, not mocked-DB, for row-creation assertions. | Writing the commit-endpoint test file |
| E3 | The preview/commit dedup query MUST be a single batched `IN (...)`-shaped query per target (collect all `normalizedHandle`/`sourceRef` values first, one query, then in-memory match) — never a per-row loop. If execute-agent finds itself writing a query inside a `for` loop over rows, stop and refactor before proceeding. | Writing `src/routes/api/import/preview/+server.ts` |
| E4 | Cap `rows` at 2000 entries via `.max(2000)` on both `importPreviewRequestSchema` and `importCommitRequestSchema` in `src/lib/zod/schemas.ts`, mirroring `ingestBatchSchema.leads.max(1000)` at line 355. | Appending the new schemas to `schemas.ts` |

### Backlog Artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| (none new) | — | AC1/AC12 e2e known-gap is already tracked by the existing `e2e-auth-bootstrap_NOTE_01-07-26.md`; no new backlog artifact needed this cycle |

## Autonomous Goal Block

SESSION GOAL: Ship the CSV & Google Sheets Import UI (leads + organizers) — shared wizard,
column mapping, dedup preview, dual-target commit (GitHub #210, #211)
Charter + umbrella plan: N/A — single plan (no phase-program umbrella exists for this feature)
Autonomy: Standing autonomy granted for this task through EXECUTE. CONDITIONAL gate concerns are
pre-accepted (see Accepted by line in Validate Contract above); apply the plan-validate-fix loop
directly on any future CONCERN/FAIL rather than pausing; only an irreversible or outward-facing
action outside this contract requires a hard stop.
Hard stop conditions / safety constraints:
- Never merge or duplicate logic from `tsv-importer-contract_29-06-26` or
  `organizer-ingest-seeding_06-07-26` — this stays a third, independent import surface
- Never offer `category` as a mappable field (dropped in migration 0028)
- Never fetch a user-supplied Sheets URL from the server (client-side fetch only — SSRF avoidance)
- Never insert into both `crm_leads` and `crm_organizers` from a single commit call
- No DB schema changes / migrations of any kind for this plan
- Cap `rows` at 2000 entries on both new endpoints (E4)
Next phase: EXECUTE — `ENTER EXECUTE MODE` for this plan file, following the Internal Build
Order (1: parsing+wizard state → 2: mapping UI+preview endpoint → 3: commit endpoint+result
summary → 4: page wiring), applying Execute-Agent Instructions E1-E4 above.
Validate contract: inline in this plan file (see `## Validate Contract` above) — Gate: CONDITIONAL
Execute start: `bun run check` then `bun run test:unit` for each Fully-Automated gate in build
order | AC1/AC12 e2e specs (self-skip expected) | AC8/AC9/AC11 Hybrid gate needs a local Postgres
container before it can run green | high-risk pack: no (no auth/billing/migration/public-API surface)

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/import/active/csv-sheets-import-ui_07-07-26/csv-sheets-import-ui_PLAN_07-07-26.md` (this file)
2. **Last completed phase or step:** PLAN — plan written, not yet validated
3. **Validate-contract status:** pending (placeholder above; VALIDATE has not run yet)
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `process/development-protocols/orchestration.md`, this feature's SPEC (`csv-sheets-import-ui_SPEC_07-07-26.md`) and FEASIBILITY (`csv-sheets-import-ui_FEASIBILITY_07-07-26.md`) docs, plus direct reads of `src/lib/server/db/schema.ts`, `src/lib/server/db/organizer-find-or-create.ts`, `src/lib/server/import-utils.ts`, `src/lib/zod/schemas.ts`, `src/routes/api/leads/ingest/+server.ts`, `src/routes/leads/+page.svelte`, `src/routes/leads/new/+page.svelte`, `src/routes/organizers/+page.svelte`
5. **Next step for a fresh agent:** Run VALIDATE (`ENTER VALIDATE MODE`) against this plan file — V1-V7 sequence, write the validate-contract in place of the placeholder above, then EXECUTE in the Internal Build Order sequence (1: parsing+state → 2: mapping UI+preview endpoint → 3: commit endpoint+result summary → 4: page wiring), running the per-section Fully-Automated test gates listed in Verification Evidence after each section before moving to the next.

---

**Next:** Say `ENTER VALIDATE MODE` to proceed to plan validation (required before implementation).
