---
name: plan:cat-1-custom-lead-categories
description: COMPLEX plan — replace hardcoded leadCategory pgEnum with editable crm_categories + many-to-many join table (GitHub #248)
date: 07-07-26
feature: categories
---

# CAT-1 — Custom Lead Categories PLAN

**Issue:** GitHub #248 · **SPEC:** `cat-1-custom-lead-categories_SPEC_07-07-26.md` (same folder)

**Date**: 07-07-26
**Status**: Planned — pending VALIDATE
**Complexity**: COMPLEX (5 phases, schema migration, multi-surface blast radius)
**Feature**: categories

## Overview

Replace the single hardcoded `leadCategory` enum column on `crm_leads` with a flexible `crm_categories` table + `crm_lead_categories` many-to-many join, delivered across 5 ordered phases. Context files: `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (test gates), `process/context/planning/all-planning.md`, plus the sibling SPEC. See §Session Goal for the definition of done and §Phased Delivery Plan for the checklist.

**TL;DR:** Replace the single hardcoded `leadCategory` enum column on `crm_leads` with a flexible `crm_categories` table + `crm_lead_categories` many-to-many join. Five ordered phases: DB schema+migrations → server logic → lead-detail UI → leads-list UI → TypeScript cleanup. Migrations are all hand-written (`db:generate` is blocked by pre-existing snapshot-chain corruption). Three blast-radius surprises must be handled: `crm_message_templates.category` also uses the enum (convert to `text`, backed by a new local `TEMPLATE_CATEGORIES` vocabulary — see §Design Decisions), the `/api/leads/ingest` handler inserts `category` (must be dropped before the column drop), and the `0014` journal drift must be respected.

---

## Session Goal

Ship editable, multi-value lead categories end to end: users create/assign/remove categories from lead detail, see chips on detail and list rows, filter the list by category, and managers can rename/soft-delete — all 20 legacy enum values seeded and existing lead data preserved. Definition of done = all 11 SPEC acceptance criteria met, `bun run check` + `bun run lint` + `bun run test:unit:ci` green, migrations applied cleanly in order, old enum column/type gone.

---

## Hard Pre-Conditions (MUST resolve before writing any migration file)

These gate Phase 1. Do not author `0026`+ until each is satisfied.

1. **Migration numbering starts at `0026`.** Journal (`drizzle/meta/_journal.json`) last `idx = 25` (`0025_mature_aaron_stack`). Highest `.sql` prefix on disk = `0025` (plus the known orphan `0014_agreements_fields.sql`). Confirmed 07-07-26.
2. **`0014` orphan drift is documented, NOT reconciled here.** `drizzle/0014_agreements_fields.sql` is unregistered in the journal (see `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`). This plan does NOT fix it — it only avoids compounding it (see #3).
3. **`bun run db:generate` is BLOCKED and MUST NOT be run.** Per the drift note's 03-07-26 update, the snapshot chain has duplicate ids (15≡16 share `id=2123a194`; 17≡18≡19 share `id=e7b44582`) and the head snapshot is missing 10 `crm_leads` columns + the entire `crm_message_templates` table. `drizzle-kit generate` hard-errors on the duplicate ids. **Therefore all three migration files (0026, 0027, 0028) are HAND-WRITTEN.** Do not attempt `db:generate` or `db:push` for this feature. Full snapshot-chain reconciliation stays the separate backlog item.
4. **Journal + snapshot policy for the 3 new migrations:** Append `idx: 26/27/28` entries to `_journal.json` by hand (tag = the file basename without `.sql`). Do NOT author matching `meta/00NN_snapshot.json` files — this continues the existing documented drift pattern (0016/0017 already ship snapshot-less; see drift note). Add a one-line comment to the drift backlog note recording that 0026–0028 were added snapshot-less by intent.
5. **Every migration file carries a header comment:** `-- HAND-WRITTEN: do not regenerate (db:generate blocked by snapshot-chain drift — see drizzle-migration-journal-drift_02-07-26.md)`.

---

## Blast-Radius Surprise: `crm_message_templates.category` also uses the enum

`src/lib/server/db/schema.ts:408` declares `crm_message_templates.category = leadCategory('category').notNull().default('Other')`, consumed by `src/lib/components/leads/LogTouchForm.svelte` to group outreach templates by event category. This is a SEPARATE feature from lead categories and is NOT being migrated to the join table.

**Locked decision (this plan):** Convert `crm_message_templates.category` from the `leadCategory` enum to a plain `text` column as part of migration `0028`, BEFORE `DROP TYPE crm_lead_category`. Postgres cannot `DROP TYPE` while a column still depends on it. `text` preserves all existing string values and the `LogTouchForm` grouping logic (which operates on string values) is unaffected. In `schema.ts`, change the templates column to `text('category').notNull().default('Other')` in Phase 5. The Zod `messageTemplateSchema` (schemas.ts:268, `category: z.enum(LEAD_CATEGORIES)`) becomes `category: z.string().min(1)` — templates keep accepting the same values but are no longer enum-bound.

This is surfaced for VALIDATE to confirm the enum→text conversion is acceptable rather than keeping the enum alive solely for templates.

---

## Design Decisions

**DECISION 1 — `TEMPLATE_CATEGORIES` local constant replaces `LEAD_CATEGORIES` for the templates surface.**
Deleting `LEAD_CATEGORIES` (Gap-3 root cause) removes the vocabulary source that four template/import surfaces depend on: `src/lib/server/db/templates.ts`, `src/lib/server/import-utils.ts`, `src/routes/templates/+page.svelte`, `src/routes/templates/+page.server.ts`. Message-template categories are a SEPARATE concept from editable lead categories (they group outreach snippets, not leads) and must NOT read from the new `crm_categories` table.

- **WHY:** Templates need a stable, closed vocabulary; lead categories are now open/user-editable. Coupling templates to the dynamic `crm_categories` table would let a manager's category rename/delete silently break template grouping. A local frozen constant keeps templates behavior-preserving.
- **WHAT:** Introduce `export const TEMPLATE_CATEGORIES` — the same 20 names as the seeded lead-category defaults (`Sports … Other`) — defined once in `src/lib/server/db/templates.ts` (or a small sibling module) and imported where needed. It is the replacement vocabulary for: the template category `<select>` dropdown, the template category validation (`z.string().min(1)` stays the wire type; `TEMPLATE_CATEGORIES` drives the UI options + membership checks), and `import-utils.ts` `CATEGORY_MAP`.
- **REJECTED:** (a) Point templates at `crm_categories` — rejected: couples a closed concept to a mutable table. (b) Leave templates validating against `leadCategory.enumValues` — rejected: the enum is dropped in 0028, so `enumValues` no longer exists.
- `import-utils.ts` `CATEGORY_MAP` + `mapCategory` validate/target `TEMPLATE_CATEGORIES` instead of `leadCategory.enumValues`.

---

## Touchpoints

| Path | Change |
|---|---|
| `src/lib/server/db/schema.ts` | + `crmCategories`, `crmLeadCategories` tables; − `leadCategory` enum + `crmLeads.category`; templates `category` → `text` |
| `drizzle/0026_cat1_add_tables.sql` | NEW hand-written: create both tables + seed 20 values |
| `drizzle/0027_cat1_data_migrate.sql` | NEW hand-written: backfill join rows from `crm_leads.category` |
| `drizzle/0028_cat1_drop_enum_column.sql` | NEW hand-written: templates enum→text, drop `crm_leads.category`, drop type |
| `drizzle/meta/_journal.json` | + idx 26/27/28 entries |
| `src/lib/server/db/categories.ts` | NEW: all category query helpers |
| `src/lib/server/db/leads.ts` | + `buildCategoryFilterConditions()`; wire into `listLeadsFiltered` |
| `src/lib/server/db/templates.ts` | NEW `TEMPLATE_CATEGORIES` const (§Design Decisions); update `CategoryValue` + cast + membership check (:65,67,68) to the now-`text` column / `TEMPLATE_CATEGORIES` |
| `src/lib/server/import-utils.ts` | `CrmLeadCategory` type + `CATEGORY_MAP` + `mapCategory` (:8,69,103) target `TEMPLATE_CATEGORIES` instead of `leadCategory.enumValues` |
| `src/lib/zod/schemas.ts` | + category schemas; − `LEAD_CATEGORIES` + enum refs; templates schema enum→string |
| `src/lib/types/index.ts` | `LEAD_CATEGORIES` import + `Category` type (:12,23) consumed by `Lead`/`MessageTemplate`/`ReviewItem`/`LeadFilters`/`CreateLeadInput` — retarget to `TEMPLATE_CATEGORIES` (templates) / drop for `Lead` (categories now loaded separately) |
| `src/routes/api/leads/ingest/+server.ts` | remove `category: lead.category` from crm_leads INSERT (:102) — unblocks 0028 column drop (Gap 2) |
| `src/routes/templates/+page.svelte` | render category `<select>` from `TEMPLATE_CATEGORIES` instead of `LEAD_CATEGORIES` (:16,249,551) |
| `src/routes/templates/+page.server.ts` | validate `rawCategory` against `TEMPLATE_CATEGORIES` instead of `LEAD_CATEGORIES` (:5,27) |
| `src/routes/unassigned/+page.server.ts` | strip `leadCategory` enum import + `categoryOptions` (:8,40,63); stub to `[]` with deferred-redesign TODO (Gap 5) |
| `src/lib/design/tokens.ts` | verify/adjust `LEAD_CATEGORIES` comment/hue-map reference (:68) — low risk |
| `src/routes/api/categories/+server.ts` | NEW: GET list, POST create |
| `src/routes/api/categories/[id]/+server.ts` | NEW: PATCH rename, DELETE soft-delete (manager-only) |
| `src/routes/api/leads/[id]/categories/+server.ts` | NEW: GET/POST/DELETE per-lead assignment |
| `src/routes/leads/[id]/+page.server.ts` | + load lead categories + all active categories |
| `src/routes/leads/[id]/+page.svelte` | replace enum display with chip row + assign panel + manager modal |
| `src/routes/leads/+page.server.ts` | + `categoryIds` filter param |
| `src/routes/leads/+page.svelte` | + category chips on rows + category FilterDropdown |
| `src/lib/components/categories/CategoryChip.svelte` | NEW |
| `src/lib/components/categories/CategoryAssignPanel.svelte` | NEW (assign + inline create) |
| `src/lib/components/categories/CategoryManager.svelte` | NEW (rename/delete modal, manager-only) |
| `src/routes/leads/new/+page.svelte` | remove enum `category` select (or leave optional — see Phase 5) |
| `src/routes/leads/[id]/edit/+page.svelte`, `src/lib/components/leads/LeadEditModal.svelte` | remove `lead.category` enum select |
| `src/lib/components/OrganizerHoverCard.svelte` | remove `lead.category` reference (line 12) |
| `src/lib/components/pipeline/PipelineBoard.svelte` | remove `c.category` reference (line 148) |
| `src/lib/components/leads/LogTouchForm.svelte` | drop `lead.category` grouping usage (keeps `template.category` string grouping) |
| `src/tests/schemas.spec.ts` | + category schema tests |
| `src/tests/categories-db.spec.ts` | NEW: `buildCategoryFilterConditions()` + manager-gate + soft-delete query tests |
| `src/tests/leads.spec.ts` | 3 breaking assertions: `:112` (`r.data.category`), `:177` (`lead.category` from dbRowToLead), `:455` + import `:17` (AC#12 == `leadCategory.enumValues`) — retire/rewrite all three (Gap 4) |
| `src/tests/leads-db.spec.ts` | asserts `lead.category` field (:61) — update fixture/assert (Gap 4) |
| `src/tests/import.spec.ts` | asserts mapped category value (:287) — update to `TEMPLATE_CATEGORIES` vocabulary (Gap 4) |

Read for context (not modified): `src/lib/utils/permissions.ts` (`isManagerRole`), `src/lib/components/ui/filter-dropdown/`, `src/routes/api/leads/[id]/notes/+server.ts` (route pattern), `src/lib/components/ui/badge`.

---

## Public Contracts

**New tables** (see SPEC Constraints 1–3):
- `crm_categories` — `id uuid PK`, `name text NOT NULL`, `color text NULL`, `created_by uuid → crm_users(id) ON DELETE SET NULL`, `deleted_at timestamptz NULL`, `created_at`/`updated_at`. Unique index on `LOWER(name)`; index on `deleted_at`.
- `crm_lead_categories` — surrogate `id uuid PK`, `lead_id uuid → crm_leads(id) ON DELETE CASCADE`, `category_id uuid → crm_categories(id) ON DELETE CASCADE`, `created_at`. Unique index on `(lead_id, category_id)`.

**New API routes** (all: server-side DB only; `if (!locals.user) throw error(401)`):
| Route | Method | Auth | Body / result |
|---|---|---|---|
| `/api/categories` | GET | any authed | `{ categories: {id,name,color}[] }` active only, alpha sorted |
| `/api/categories` | POST | any authed | `{ name, color? }` → 201 `{category}`; 409 on case-insensitive dup |
| `/api/categories/[id]` | PATCH | manager only (403 for rep) | `{ name }` → `{category}` |
| `/api/categories/[id]` | DELETE | manager only (403 for rep) | soft-delete + hard-delete join rows → 204 |
| `/api/leads/[id]/categories` | GET | any authed (+ lead visibility guard) | `{ categories: {id,name,color}[] }` for lead |
| `/api/leads/[id]/categories` | POST | any authed (+ visibility guard) | `{ categoryId }` → 201 (idempotent on unique pair) |
| `/api/leads/[id]/categories` | DELETE | any authed (+ visibility guard) | `{ categoryId }` → 204 |

**New Zod schemas** (schemas.ts): `categoryCreateSchema` (`{ name: string trimmed min 1 max 60, color?: hex }`), `categoryRenameSchema` (`{ name }` same rules), `assignCategoriesSchema` (`{ categoryId: uuid }`).

**Removed contract:** `LEAD_CATEGORIES` const + `leadCategory` enum + `crm_leads.category` column. `Lead` type loses `category: string`; gains nothing (categories loaded separately per lead). Templates category vocabulary migrates to the local `TEMPLATE_CATEGORIES` constant (§Design Decisions), NOT the new table.

---

## Blast Radius

- **~30 files touched** across 5 packages/surfaces (schema, migrations, server db, API routes, UI components, tests) — count raised from ~24 after Gap-1/2/4/5 enum-consumer discovery.
- **Risk class: HIGH — schema/data migration + destructive column drop.** Manual-first evidence expected for the migration run (SPEC AC-9). Irreversible `DROP COLUMN` / `DROP TYPE` — no automated rollback; recovery = restore from backup. Data-migration correctness (0027) is the single highest-risk step.
- **Secondary risk: enum→text conversion of `crm_message_templates.category`** (unplanned surface, see above) + the `TEMPLATE_CATEGORIES` vocabulary split.
- **Tertiary risk: enum-consumer sweep** — 8 files import `LEAD_CATEGORIES`/`leadCategory` beyond the lead surface (types, ingest, templates ×2, import-utils, unassigned, tokens); ALL must be retargeted or stripped or `bun run check`/`DROP TYPE` fails. Enumerated in Phase 5.
- **Not touched / deferred:** `/unassigned` category filter redesign (import stripped, functionality stubbed), `/api/leads/ingest` category *assignment* (INSERT field only removed — no join-row backfill for new ingests), standalone `/categories` admin page (all SPEC Out of Scope).

---

## Implementation Checklist / Phased Delivery Plan

Phases are ordered by dependency. Phase 4 is parallel-safe with Phase 3. Phase 5 (and thus migration 0028) MUST run last, after all `lead.category` references AND all `LEAD_CATEGORIES`/`leadCategory` enum consumers are removed/retargeted — `bun run check` is the gate that proves no references remain before the column/type drops.

### Phase 1 — DB schema + migrations
- [ ] 1.1 Verify pre-conditions #1–#5 above (journal idx = 25, `db:generate` NOT run, header comments planned).
- [ ] 1.2 Add `crmCategories` table to `schema.ts` (exact shape in task/Public Contracts: uniqueIndex on `sql\`LOWER(${t.name})\``, index on `deletedAt`).
- [ ] 1.3 Add `crmLeadCategories` table to `schema.ts` (surrogate UUID PK, uniqueIndex on `(leadId, categoryId)`, both FKs `onDelete: 'cascade'`).
- [ ] 1.4 Write `drizzle/0026_cat1_add_tables.sql` (hand-written, header comment): `CREATE TABLE crm_categories`, `CREATE TABLE crm_lead_categories`, unique/normal indexes, then `INSERT INTO crm_categories (id, name) VALUES` for the 20 enum values verbatim (`Sports … Other`, gen_random_uuid() ids).
- [ ] 1.5 Write `drizzle/0027_cat1_data_migrate.sql` (hand-written, header comment): `INSERT INTO crm_lead_categories (lead_id, category_id) SELECT l.id, c.id FROM crm_leads l JOIN crm_categories c ON c.name = l.category WHERE l.deleted_at IS NULL` (verify: every non-deleted lead's `category` matches a seeded name).
- [ ] 1.6 Write `drizzle/0028_cat1_drop_enum_column.sql` (hand-written, header comment): `ALTER TABLE crm_message_templates ALTER COLUMN category TYPE text;` → `ALTER TABLE crm_leads DROP COLUMN category;` → `DROP TYPE crm_lead_category;` (order matters — templates conversion first so DROP TYPE succeeds).
- [ ] 1.7 Append idx 26/27/28 entries to `_journal.json` (tags = file basenames). Do NOT author snapshots (per pre-condition #4).
- [ ] 1.8 Add one-line note to `drizzle-migration-journal-drift_02-07-26.md` recording 0026–0028 added snapshot-less by intent.
- [ ] Gate: `bun run check` passes (schema.ts compiles with new tables; `crm_leads.category` and enum still present until Phase 5 — this phase does NOT drop them from `schema.ts`; migration 0028 file exists but is applied only after Phase 5).

> Sequencing note: The 0028 `.sql` file is authored in Phase 1 for atomicity of the migration set, but the `schema.ts` removal of `crm_leads.category` / `leadCategory` happens in Phase 5. Applying 0028 to a DB is a manual, post-Phase-5 step (SPEC AC-9 manual gate).

### Phase 2 — Server logic
- [ ] 2.1 Create `src/lib/server/db/categories.ts` with helpers: `getActiveCategories()` (filter `deletedAt IS NULL`, alpha sort), `getCategoriesForLead(leadId)`, `createCategory({name, color, createdBy})` (handle 23505 → 409), `assignCategory(leadId, categoryId)` (idempotent via unique pair), `removeAssignment(leadId, categoryId)`, `renameCategory(id, name)`, `softDeleteCategory(id)` (set `deletedAt` + hard-delete join rows in one transaction).
- [ ] 2.2 Add Zod schemas to `schemas.ts`: `categoryCreateSchema`, `categoryRenameSchema`, `assignCategoriesSchema`.
- [ ] 2.3 `src/routes/api/categories/+server.ts` — GET (list active), POST (create; 401 guard, safeParse, 409 on dup).
- [ ] 2.4 `src/routes/api/categories/[id]/+server.ts` — PATCH rename + DELETE soft-delete; both `if (!isManagerRole(locals.user.role)) throw error(403)`.
- [ ] 2.5 `src/routes/api/leads/[id]/categories/+server.ts` — GET/POST/DELETE; 401 guard + lead visibility guard (mirror `api/leads/[id]/notes/+server.ts`), safeParse.
- [ ] 2.6 Add `buildCategoryFilterConditions(categoryIds: string[]): SQL[]` to `leads.ts` (DB-free, `.toSQL()`-testable; empty array → no condition; returns EXISTS subquery against `crm_lead_categories`).
- [ ] Gate: `bun run check` + `bun run test:unit:ci` (new schema + `buildCategoryFilterConditions` + manager-gate + soft-delete tests green).

### Phase 3 — Lead detail UI
- [ ] 3.1 `src/routes/leads/[id]/+page.server.ts` — load `getCategoriesForLead(id)` + `getActiveCategories()`; expose `isManager` from `locals.user.role`.
- [ ] 3.2 `CategoryChip.svelte` (NEW) — Badge-based chip, optional remove `X` button (prop-gated).
- [ ] 3.3 `CategoryAssignPanel.svelte` (NEW) — multi-select of active categories + inline "create new" (safeParse + fetch POST `/api/categories`, then assign).
- [ ] 3.4 `CategoryManager.svelte` (NEW) — `Modal.svelte`-based rename/soft-delete list, manager-only, with delete confirmation ("removes from N leads").
- [ ] 3.5 `src/routes/leads/[id]/+page.svelte` — replace `lead.category` enum display with chip row; wire assign panel; render "Manage categories" button + modal `{#if isManager}`.
- [ ] Gate: `bun run check` + `bun run test:unit:ci`. (Chip render / assign flow = Agent-Probe, blocked by e2e auth fixture — known-gap.)

### Phase 4 — Leads list UI (parallel-safe with Phase 3)
- [ ] 4.1 `src/routes/leads/+page.server.ts` — parse `categoryIds` param (via `parseFilterCsv`), pass to `listLeadsFiltered`; load per-lead categories for visible rows.
- [ ] 4.2 Wire `buildCategoryFilterConditions()` into `listLeadsFiltered` in `leads.ts`.
- [ ] 4.3 `src/routes/leads/+page.svelte` — add category chips to rows (no placeholder when empty); add category `FilterDropdown` (`multiple` prop) matching platform/stage filters.
- [ ] Gate: `bun run check` + `bun run test:unit:ci` (`buildCategoryFilterConditions` zero/one/multi cases). UI = Agent-Probe known-gap.

### Phase 5 — TypeScript cleanup + enum removal (LAST)

**Enum-consumer sweep:** `bun run check` (step 5.10) is the hard safety gate. It CANNOT pass — and 0028's `DROP TYPE`/`DROP COLUMN` are unsafe — until every `LEAD_CATEGORIES` / `leadCategory` / `lead.category` consumer below is retargeted or stripped. Steps 5.4–5.9 enumerate all of them.

- [ ] 5.1 Introduce `TEMPLATE_CATEGORIES` per §Design Decisions (20 names verbatim, exported from `src/lib/server/db/templates.ts` or a small sibling module) BEFORE deleting `LEAD_CATEGORIES`, so template surfaces have a vocabulary source.
- [ ] 5.2 Remove `LEAD_CATEGORIES` const + all `z.enum(LEAD_CATEGORIES)` refs from `schemas.ts` (leadCreate:73, leadUpdate:100, messageTemplate:268 → `z.string().min(1)`, :353 optional). Verify ingest schema (`event_category_raw/clean` at 379–380 are unrelated free-text — leave).
- [ ] 5.3 Change `crm_message_templates.category` in `schema.ts` from `leadCategory('category')` to `text('category').notNull().default('Other')`.
- [ ] 5.4 Remove `leadCategory` pgEnum + `crm_leads.category` column from `schema.ts`; remove `category` from `dbRowToLead` / `Lead` type in `leads.ts`.
- [ ] 5.5 **Enum-consumer retargets (Gap 1 — each with file:line + edit):**
  - [ ] `src/lib/types/index.ts:12,23` — `LEAD_CATEGORIES` import + `Category` type (consumed by `Lead`/`MessageTemplate`/`ReviewItem`/`LeadFilters`/`CreateLeadInput`): drop `category` from `Lead`/`LeadFilters`/`CreateLeadInput` (categories loaded separately); retarget `MessageTemplate.category` to `string`/`TEMPLATE_CATEGORIES`; **retarget or remove `ReviewItem.category` (`:218`, currently `Category | 'Uncategorized'`) — Review Queue was removed 01-07-26, so confirm whether `ReviewItem` is dead code and delete it, else repoint its `category` to `string`;** remove/repoint the `Category` type export so no dangling `LEAD_CATEGORIES` import remains.
  - [ ] `src/lib/server/db/templates.ts:65,67,68` — `CategoryValue` type + cast + membership check now operate on the `text` column: replace `leadCategory`-derived vocabulary with `TEMPLATE_CATEGORIES` membership; keep the runtime cast valid against `text`.
  - [ ] `src/lib/server/import-utils.ts:8,69,103` — `CrmLeadCategory` type + `CATEGORY_MAP` + `mapCategory`: validate/target `TEMPLATE_CATEGORIES` instead of `leadCategory.enumValues`.
  - [ ] `src/routes/templates/+page.svelte:16,249,551` — render category `<select>` from `TEMPLATE_CATEGORIES` (both select sites) instead of `LEAD_CATEGORIES`.
  - [ ] `src/routes/templates/+page.server.ts:5,27` — validate `rawCategory` against `TEMPLATE_CATEGORIES` instead of `LEAD_CATEGORIES`.
  - [ ] `src/lib/design/tokens.ts:68` — verify the `LEAD_CATEGORIES` comment/hue-map reference; if it imports the const, drop or inline the hue names (low risk — verify at edit time).
- [ ] 5.6 Update all `lead.category` reader surfaces: `leads/new/+page.svelte`, `leads/[id]/edit/+page.svelte`, `LeadEditModal.svelte`, `OrganizerHoverCard.svelte:12`, `PipelineBoard.svelte:148`, `LogTouchForm.svelte` (drop `lead.category` first-group sorting; keep `template.category` string grouping).
- [ ] 5.7 **Ingest handler (Gap 2):** remove `category: lead.category` from the `crm_leads` INSERT in `src/routes/api/leads/ingest/+server.ts:102`. This INSERT targets the column being dropped in 0028 — the field MUST be gone before 0028 applies. No join-row backfill for ingested leads is in scope (deferred — SPEC Out of Scope).
- [ ] 5.8 **Unassigned page (Gap 5):** strip the `leadCategory` enum import + `categoryOptions` usage from `src/routes/unassigned/+page.server.ts:8,40,63`. Replace `categoryOptions` with an empty array (`const categoryOptions = []`) and add `// TODO(CAT-1 deferred): rebuild unassigned category filter against crm_categories — SPEC Out of Scope`. The filter redesign is deferred; this step only removes the import so `bun run check` passes when the enum drops.
- [ ] 5.9 **Breaking-test fixes (Gap 4) — three files, and `leads.spec.ts` breaks in THREE places:**
  - [ ] `src/tests/leads.spec.ts` — **all three break-points must be fixed, not just AC#12:**
    - [ ] `:17` import `{ leadCategory }` — remove (enum no longer exists after 5.4).
    - [ ] `:112` `expect(r.data.category).toBe('Other')` (inside `leadFormSchema (create-lead validation)`) — remove/rewrite; `leadFormSchema` no longer carries `category` after 5.2.
    - [ ] `:177` `expect(lead.category).toBe('Sports')` (inside `dbRowToLead mapper`) — remove/rewrite; `dbRowToLead` no longer emits `category` after 5.4 (also drop `category` from the `makeRow()` fixture if it sets it).
    - [ ] `:449-461` AC#12 assertion `[...leadCategory.enumValues]` — retire or rewrite for dynamic categories (assert against `getActiveCategories()` shape / `buildCategoryFilterConditions`, not a static enum).
  - [ ] `src/tests/leads-db.spec.ts:61` — asserts `lead.category` field: update the fixture/assert to drop `category` from the `Lead` shape.
  - [ ] `src/tests/import.spec.ts:287` — asserts a mapped category value (`expect(clay.lead.category).toBe('Other')`): update the expected value to match the `TEMPLATE_CATEGORIES` vocabulary / new `CATEGORY_MAP` behavior.
- [ ] 5.10 `bun run check` — MUST exit 0 (proves zero remaining `lead.category` / `LEAD_CATEGORIES` / `leadCategory` references across ALL surfaces above; this is the safety gate before migration 0028 is applied).
- [ ] 5.11 `bun run lint` — MUST exit 0.
- [ ] 5.12 Apply migrations 0026→0027→0028 in order against dev DB (manual, risk-evidence: `SELECT COUNT(*) FROM crm_categories` = 20, spot-check join rows) — SPEC AC-9 Hybrid manual gate.
- [ ] Gate: `bun run check` + `bun run lint` + `bun run test:unit:ci` all green.

---

## Acceptance Criteria

All 11 SPEC acceptance criteria (AC-1 … AC-11) in `cat-1-custom-lead-categories_SPEC_07-07-26.md` are the testable done-bar. Each is mapped to a gate in §Verification Evidence below. Summary: create/assign/remove categories from lead detail (AC-1/2/6), chips on detail + list (AC-3/4), multi-select filter (AC-5), soft-delete removes everywhere (AC-7), manager-only rename/delete (AC-8), 20 seeded defaults + preserved lead data (AC-9), case-insensitive uniqueness (AC-10), `bun run check` + `bun run lint` green (AC-11).

## Phase Completion Rules

- A phase is **CODE DONE** only when its per-phase Gate line passes (`bun run check` + the phase's unit tests green). Code-only completion is CODE DONE, never VERIFIED.
- A phase reaches **✅ VERIFIED** only after its mapped SPEC acceptance criteria have evidence AND (for UI phases) user-confirmed manual dev-instance verification, since e2e is a known-gap. Do not mark VERIFIED without user confirmation.
- Phase 5 + migration application (0026→0027→0028) is strictly LAST; `bun run check` exiting 0 in step 5.10 is the hard safety gate proving no `lead.category`/`LEAD_CATEGORIES`/`leadCategory` references remain before the destructive column/type drop.
- Phase 4 may run in parallel with Phase 3 (disjoint files). All other phases are sequential.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `categoryCreateSchema` rejects empty/blank, trims (`schemas.spec.ts`) | Fully-Automated | AC-1 (create), AC-10 (uniqueness validation surface) |
| `assignCategoriesSchema` / join query accepts array of category IDs (`categories-db.spec.ts` `.toSQL()`) | Fully-Automated | AC-2 (multiple per lead) |
| `buildCategoryFilterConditions()` SQL for 0 / 1 / N ids (`.toSQL()`) | Fully-Automated | AC-5 (multi-select filter) |
| DELETE assignment schema validates `{leadId, categoryId}` pair | Fully-Automated | AC-6 (remove assignment) |
| `softDeleteCategory` sets `deletedAt` + `getActiveCategories` excludes deleted (`.toSQL()`/query test) | Fully-Automated | AC-7 (soft-delete removes everywhere) |
| PATCH/DELETE handler returns 403 for `role='rep'` (unit) | Fully-Automated | AC-8 (manager-only) |
| Seed array contains all 20 verbatim enum names (unit assertion) | Fully-Automated | AC-9 (seeded defaults present) |
| `LOWER(name)` unique index → 409 on case dup (unit on handler error mapping) | Fully-Automated | AC-10 (case-insensitive uniqueness) |
| `import.spec.ts` mapped-category assertion updated to `TEMPLATE_CATEGORIES` vocabulary (Gap 4) | Fully-Automated | AC-11 (import mapping intact after vocab split) |
| `leads-db.spec.ts` / `leads.spec.ts` retargeted off `lead.category` / `leadCategory.enumValues` (Gap 4) | Fully-Automated | AC-11 (test suite green after enum removal) |
| `bun run check` + `bun run lint` exit 0 (all enum consumers retargeted/stripped) | Fully-Automated | AC-11 (typecheck/lint after enum removal) |
| Run 0026→0028 on dev DB; `COUNT(*)=20`, spot-check join rows | Hybrid (manual) | AC-9 (migration outcome) |
| Rep dev-instance flow: create+assign, multi-chip, remove, filter, manager rename/delete | Agent-Probe (manual) | AC-1, AC-3, AC-4, AC-6, AC-7, AC-8 (UI rendering) |

---

## Test Infra Improvement Notes

- e2e verification for AC-3/AC-4 (chip rendering on detail + list) is blocked by the shared Playwright auth-fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — pre-accepted known-gap, no new infra built here.
- Migration correctness (AC-9) has no live-DB CI harness — Hybrid gate stays manual one-time. Same standing gap as other features.
- Consider a DB-free seed-completeness unit test that imports the seed array directly so AC-9's "20 names" assertion runs in CI without a DB.

---

## Known Gaps

1. **e2e Playwright coverage** — all chip/assign/filter UI flows self-skip against protected routes (auth fixture gap). Manual dev-instance verification only. Pre-accepted.
2. **Live-DB migration CI** — 0026–0028 applied and verified manually; no automated migration smoke test. Pre-accepted.
3. **Snapshot-chain reconciliation NOT done** — `db:generate` remains blocked; 0026–0028 ship snapshot-less by intent (continues existing drift). Full reconciliation stays `drizzle-migration-journal-drift_02-07-26.md`.
4. **`crm_message_templates.category` enum→text + `TEMPLATE_CATEGORIES` split** — surfaced for VALIDATE confirmation; behavior-preserving but touches an out-of-feature surface. **VALIDATE cycle-2 confirmed acceptable** (see validate-contract).
5. **Out of scope (SPEC):** `/unassigned` category filter redesign (import stripped + stubbed to `[]` with TODO — Gap 5), ingest category *assignment* (INSERT field removed, no join backfill — Gap 2), standalone admin page, category ordering.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/categories/active/cat-1-custom-lead-categories_07-07-26/cat-1-custom-lead-categories_PLAN_07-07-26.md`
2. **Last completed phase/step:** none — plan written + supplemented (5 PVL gaps applied) + VALIDATE cycle-2 complete (contract CONDITIONAL, accepted). Ready for EXECUTE.
3. **Validate-contract status:** written (07-07-26) — CONDITIONAL, accepted (see §Validate Contract).
4. **Supporting context loaded:** SPEC (same folder), `all-context.md`, `tests/all-tests.md`, `planning/all-planning.md`, `schema.ts`, `leads.ts` (helper index), `schemas.ts` (category refs), `types/index.ts`, `templates.ts`, `import-utils.ts`, ingest + unassigned + templates routes, migration journal + drift note, `filter-dropdown.ts`.
5. **Next step for a fresh agent:** EXECUTE phase by phase in order; Phase 4 may run parallel to Phase 3; Phase 5 (full enum-consumer sweep steps 5.5–5.9) + migration application is strictly last. Migrations are HAND-WRITTEN — never run `bun run db:generate`. Honor the two execute-agent instructions (E1, E2) in the validate-contract.

---

## Validate Contract

Status: CONDITIONAL
Date: 07-07-26
date: 2026-07-07
generated-by: inner-pvl: phase-1

Parallel strategy: parallel-subagents
Rationale: 3/7 signals present (S2 schema/API surface, S6 high-risk schema/migration, S7 5+ files); dominant signal = high-risk destructive migration. Executed as consolidated Layer 1 + Layer 2 review on the re-validation pass.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | create category rejects empty/blank, trims | Fully-Automated | `categoryCreateSchema` cases in `src/tests/schemas.spec.ts`; `bun run test:unit:ci` | B |
| AC-2 | multiple categories per lead (join accepts array of ids) | Fully-Automated | `assignCategoriesSchema` + join query `.toSQL()` in `src/tests/categories-db.spec.ts` | B |
| AC-5 | multi-select category filter | Fully-Automated | `buildCategoryFilterConditions()` 0/1/N `.toSQL()` in `categories-db.spec.ts` | B |
| AC-6 | remove assignment | Fully-Automated | DELETE assignment schema validates `{leadId, categoryId}` pair | B |
| AC-7 | soft-delete removes everywhere | Fully-Automated | `softDeleteCategory` sets `deletedAt` + `getActiveCategories` excludes deleted (`.toSQL()`/query test) | B |
| AC-8 | manager-only rename/delete | Fully-Automated | PATCH/DELETE handler returns 403 for `role='rep'` (unit) | B |
| AC-9 | 20 seeded defaults present | Fully-Automated | seed array contains all 20 verbatim enum names (DB-free unit assertion) | B |
| AC-9 | migration applied, existing lead data preserved | Hybrid | run 0026→0028 on dev DB; `SELECT COUNT(*) FROM crm_categories`=20 + spot-check join rows | C |
| AC-10 | case-insensitive uniqueness | Fully-Automated | `LOWER(name)` unique index → 409 on case dup (unit on handler error mapping) | B |
| AC-11 | typecheck/lint/test green after enum removal | Fully-Automated | `bun run check` + `bun run lint` + `bun run test:unit:ci` exit 0 | B |
| AC-3/AC-4 | chips render on detail + list rows | Agent-Probe | manual rep dev-instance flow (e2e blocked by auth fixture) | D |

gap-resolution legend: A — proven now; B — fixed in this plan (gate added by this plan's checklist); C — deferred to a named later manual/CI gate; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value.

Failing stubs (Fully-Automated rows only — TDD red-first, destined for the named spec files, NOT written to disk during VALIDATE):

```
// src/tests/schemas.spec.ts — AC-1
test("should reject empty/blank category name and trim surrounding whitespace", () => { throw new Error("NOT IMPLEMENTED — TDD stub: categoryCreateSchema empty/blank/trim") })
// src/tests/categories-db.spec.ts — AC-2
test("should accept an array of category ids for a single lead (join query)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: assignCategoriesSchema array + join .toSQL()") })
// src/tests/categories-db.spec.ts — AC-5
test("should build category filter conditions for 0, 1, and N ids", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildCategoryFilterConditions 0/1/N .toSQL()") })
// src/tests/categories-db.spec.ts — AC-6
test("should validate a leadId/categoryId pair for DELETE assignment", () => { throw new Error("NOT IMPLEMENTED — TDD stub: DELETE assignment pair validation") })
// src/tests/categories-db.spec.ts — AC-7
test("should set deletedAt on soft-delete and exclude deleted from getActiveCategories", () => { throw new Error("NOT IMPLEMENTED — TDD stub: softDeleteCategory + getActiveCategories exclusion") })
// src/tests/categories-db.spec.ts — AC-8
test("should return 403 for role=rep on PATCH and DELETE category", () => { throw new Error("NOT IMPLEMENTED — TDD stub: manager-only 403 gate") })
// src/tests/categories-db.spec.ts — AC-9
test("should seed all 20 verbatim category names", () => { throw new Error("NOT IMPLEMENTED — TDD stub: seed array 20 names") })
// src/tests/categories-db.spec.ts — AC-10
test("should map a case-insensitive duplicate name to 409", () => { throw new Error("NOT IMPLEMENTED — TDD stub: LOWER(name) unique → 409") })
```

Legacy line form (retained for existing validate-contract consumers):
- Schema/API/server logic (categories.ts, filter, handlers): Fully-automated: `bun run test:unit:ci`
- Typecheck/enum-removal sweep: Fully-automated: `bun run check`
- Lint: Fully-automated: `bun run lint`
- Migration outcome (0026→0028 on dev DB): hybrid: manual apply + `SELECT COUNT(*) FROM crm_categories` = 20 (precondition: dev DB reachable, backup taken)
- Chip/assign/filter UI rendering: agent-probe: manual rep dev-instance walkthrough
- e2e Playwright chip/filter flows: known-gap: documented (shared auth-fixture gap)

Dimension findings:
- Infra fit: PASS — all 27 referenced source paths resolve; 3 NEW targets correctly absent; migration numbering 0026–0028 verified against journal (idx=25) + disk (highest=0025); `db:generate`-blocked/hand-written decision correct; 0014 orphan documented not compounded; gate commands (`check`/`lint`/`test:unit:ci`) all real.
- Test coverage: CONCERN — Fully-Automated coverage exists for AC-1/2/5/6/7/8/9/10/11 via `.toSQL()` + schema unit tests; AC-3/4 e2e is a pre-accepted known-gap; AC-9 migration is a Hybrid manual gate. CONCERN: step 5.9's `leads.spec.ts` fixes now enumerate all three break-points (`:17` import, `:112`, `:177`, `:455`) after cycle-2 supplement — the final `test:unit:ci` gate mechanically forces completeness regardless.
- Breaking changes: PASS — all 8+ enum consumers enumerated with accurate file:line (verified on disk: types:12/23, templates.ts:8/65/67/68, import-utils:6/8/103, templates route:5/27 + svelte:16/249/551, unassigned:8/40/63, tokens:68, LeadEditModal, leads/new, leads/[id]/edit); lead.category readers (OrganizerHoverCard:12, PipelineBoard:148, LogTouchForm) covered in 5.6; ingest INSERT:102 confirmed + covered in 5.7; `bun run check` at 5.10 is a genuine compile-level safety gate before the destructive DROP.
- Security surface: PASS — risk class HIGH (schema/data migration + destructive DROP COLUMN/DROP TYPE); all new API routes carry `if (!locals.user) throw error(401)`; manager routes gate via `isManagerRole` → 403; per-lead routes mirror the notes-route visibility guard; no billing/secret/trust-boundary surface beyond manager gating. Irreversible migration requires the manual-first evidence pack at EXECUTE (SPEC AC-9 Hybrid gate) — correctly deferred to execute-time, not a plan defect.
- Phase 1 (schema + migrations) feasibility: PASS — highest-risk edit = 0027 data-migrate (`JOIN c ON c.name = l.category`); safe because seed = exact 20 enum values = current column domain; `WHERE deleted_at IS NULL` correct.
- Phase 2 (server logic) feasibility: PASS — helpers + routes mechanically feasible; `buildCategoryFilterConditions` `.toSQL()`-testable; 409-via-23505 + soft-delete transaction sound.
- Phase 3 (lead detail UI) feasibility: PASS — chip/assign/manager-modal feasible; manager gate via `isManager`; UI proof = Agent-Probe known-gap.
- Phase 4 (leads list UI) feasibility: PASS — file-disjoint from Phase 3 (`leads/+page.*` vs `leads/[id]/+page.*`), parallel-safe confirmed; `FilterDropdown multiple` reuse consistent with existing unified filter components.
- Phase 5 (TS cleanup + enum removal) feasibility: CONCERN — highest-risk edit = 0028 `DROP TYPE`/`DROP COLUMN`, gated by 5.10 `bun run check`==0; templates enum→text ordered BEFORE DROP TYPE (correct Postgres dependency order). CONCERN: cycle-2 found `ReviewItem.category` (types/index.ts:218) retarget under-specified — now added to step 5.5 with dead-code check; `bun run check` catches any residual.

Open gaps: 
- e2e Playwright chip/assign/filter coverage: known-gap: documented (shared auth-fixture — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Pre-accepted.
- Live-DB migration CI harness: known-gap: documented (0026–0028 verified manually). Pre-accepted.
- Snapshot-chain reconciliation: known-gap: documented (`db:generate` blocked; 0026–0028 snapshot-less by intent). Tracked in `drizzle-migration-journal-drift_02-07-26.md`.

What this coverage does NOT prove:
- `bun run test:unit:ci` (Fully-Automated) proves schema validators, `buildCategoryFilterConditions` SQL shape, manager-gate 403 mapping, soft-delete exclusion, and seed completeness — it does NOT prove the categories actually render as chips on the lead-detail or list pages (no e2e), nor that assign/remove round-trips through the real DB, nor manager rename/delete UI behavior.
- `bun run check` (Fully-Automated) proves zero dangling `leadCategory`/`LEAD_CATEGORIES`/`lead.category` type references remain — it does NOT prove the migrations were applied, nor that runtime data was correctly backfilled.
- The Hybrid migration gate (manual) proves `COUNT(*)=20` + spot-checked join rows on ONE dev DB run — it does NOT prove behavior on production data volume, nor rollback (there is none; recovery = restore from backup), nor concurrent-write safety during the migration.
- The Agent-Probe UI walkthrough proves a human saw chips/assign/filter work once — it does NOT provide a regression guard; any later UI change can silently break it until the shared auth fixture unblocks e2e.

Gate: CONDITIONAL (2 CONCERNs, no FAILs; both mechanically caught by the plan's own hard gates; accepted after cycle-2 supplement)
Accepted by: session (autonomous, /goal execution) — accepted concerns: (1) `leads.spec.ts` breaking-test enumeration (now expanded in step 5.9 to cover `:17`/`:112`/`:177`/`:455`; `test:unit:ci` final gate forces completeness); (2) `ReviewItem.category` retarget under-specification (now added to step 5.5 with dead-code check; `bun run check` catches residual).

Execute-Agent Instructions (concerns not fully closable in plan text):
- E1 (Phase 5, step 5.9): When fixing `src/tests/leads.spec.ts`, fix ALL FOUR break-points, not just the AC#12 assertion: remove the `:17` `leadCategory` import, remove/rewrite `:112` (`r.data.category`), remove/rewrite `:177` (`lead.category` from `dbRowToLead`, and drop `category` from the `makeRow()` fixture if set), and retire/rewrite `:449-461` (AC#12 enumValues). `bun run test:unit:ci` MUST exit 0 before Phase 5 is CODE DONE.
- E2 (Phase 5, step 5.5): Resolve `src/lib/types/index.ts:218` `ReviewItem.category`. Review Queue was removed 01-07-26 — first confirm whether `ReviewItem` is still referenced anywhere; if dead, delete the type; if live, repoint `category` to `string`. Do not leave a dangling `Category`/`LEAD_CATEGORIES` reference. `bun run check` must exit 0.
- E3 (Phase 5, step 5.12): This is HIGH-RISK (schema/data migration + irreversible DROP). Before applying 0028, take a dev-DB backup and produce the manual-first evidence (row counts, join-row spot-check) per SPEC AC-9. Never run `bun run db:generate`/`db:push` — migrations are hand-written.

---

## Autonomous Goal Block

```
SESSION GOAL: CAT-1 — replace hardcoded leadCategory enum with editable crm_categories + crm_lead_categories join (GitHub #248)
Charter + umbrella plan: N/A — single COMPLEX plan (5 phases in one file)
Autonomy: /goal autonomous execution — self-decide at reversible gates; CONDITIONAL → apply fixes/proceed; BLOCKED → backlog + continue. Every subagent first action = vc-context-discovery + vc-plan-discovery; every phase-END invokes vc-agent-strategy-compare. No inline execution — EXECUTE work is always a spawned vc-execute-agent; EVL gate always a spawned vc-tester.
Hard stop conditions / safety constraints:
- NEVER run `bun run db:generate` or `bun run db:push` — snapshot chain is corrupt; all 3 migrations (0026/0027/0028) are HAND-WRITTEN.
- Migration 0028 (DROP COLUMN crm_leads.category + DROP TYPE crm_lead_category) is IRREVERSIBLE — apply only after step 5.10 `bun run check` exits 0, and only after a dev-DB backup + manual evidence (SPEC AC-9). Recovery = restore from backup.
- Templates category column MUST be converted enum→text BEFORE DROP TYPE (Postgres dependency), in 0028 order.
- Phase 5 + migration application is strictly LAST. Phase 4 may run parallel to Phase 3 (disjoint files).
Next phase: EXECUTE — process/features/categories/active/cat-1-custom-lead-categories_07-07-26/cat-1-custom-lead-categories_PLAN_07-07-26.md (start Phase 1)
Validate contract: inline in plan (§Validate Contract) — Gate CONDITIONAL, accepted; generated-by inner-pvl: phase-1
Execute start: Fully-auto gates: `bun run check` | `bun run lint` | `bun run test:unit:ci`. Hybrid: manual apply 0026→0028 on dev DB + COUNT=20. Agent-probe: rep dev-instance chip/assign/filter walkthrough. High-risk pack: yes (schema/data migration + destructive DROP).
```

---

## Next Step

VALIDATE complete (cycle 2, CONDITIONAL accepted). Say **ENTER EXECUTE MODE** to implement Phase 1 → Phase 5 in order (Phase 4 parallel-safe with Phase 3; Phase 5 + migration application strictly last). Honor execute-agent instructions E1–E3 in the validate-contract. Do NOT run `bun run db:generate` at any point — migrations are hand-written.
