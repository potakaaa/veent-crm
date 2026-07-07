---
name: plan:cat-1-custom-lead-categories-spec
description: Product-discovery SPEC for GitHub issue #248 — custom lead categories replacing the hardcoded leadCategory pgEnum
date: 07-07-26
feature: categories
---

# CAT-1 — Custom Lead Categories SPEC

**Issue:** GitHub #248
**Date:** 07-07-26
**Feature folder:** `process/features/categories/`

---

## Summary

Today every lead is tagged with exactly one category chosen from 20 hardcoded values baked into a Postgres enum. That enum cannot be edited without a schema migration, so the team is stuck with categories that may not match their actual events. This feature replaces the single hardcoded enum field with a flexible many-to-many system: a `crm_categories` table managers can edit, and a join table that lets any lead carry zero or more category tags. Reps and managers can create new categories and assign them to leads directly from the lead detail page. Managers can also rename or soft-delete categories when the list gets stale. All 20 existing enum values are seeded automatically on first migration so no historical data is lost.

---

## User Stories / Jobs To Be Done

**US-1 — Assign a category**
As an AE or manager on the lead detail page, I want to pick one or more categories from a dropdown and attach them to the lead, so I can tag leads with multiple relevant event types.

**US-2 — Create a new category**
As an AE or manager, when the category I need does not exist, I want to type a new name and create it inline from the same dropdown, so I do not have to ask a manager to first add it to a list.

**US-3 — Remove a category assignment**
As an AE or manager, I want to remove a category chip from a lead, so I can correct a wrong tag without affecting other leads that share that category.

**US-4 — View categories on lead detail**
As any CRM user, I want to see the categories assigned to a lead as chips on the lead detail page, so I can understand the event type at a glance.

**US-5 — View categories on lead list rows**
As any CRM user, I want to see category chips on each lead row in the My Leads list, so I can scan event types without opening every lead.

**US-6 — Filter leads by category**
As any CRM user, I want to filter the My Leads list by one or more categories, so I can quickly narrow to leads of a specific event type.

**US-7 — Rename a category (manager only)**
As a manager, I want to rename a category, so I can correct a typo or clarify an ambiguous name across all leads that use it at once.

**US-8 — Soft-delete a category (manager only)**
As a manager, I want to remove a category from the system, so it disappears from all leads and no rep can assign it again — without destroying historical data.

**US-9 — Seeded defaults on first use**
As any user after the migration runs, I want the 20 previously hardcoded categories to already be present, so existing leads are correctly tagged and no one has to re-create them.

---

## What The User Wants (Behavioral Outcomes)

**Category assignment on lead detail:**
A multi-select dropdown on the lead detail page shows all active (non-deleted) categories. Selecting one adds a chip to the lead. Each chip has a remove button. Creating a new category (typing a name not in the list and confirming) adds it to the global list and tags the current lead in one action.

**Category chips on lead list:**
Every row in the My Leads list displays the categories assigned to that lead as small chips. Rows with no categories show nothing (not a placeholder).

**Category filter on leads list:**
The My Leads filter toolbar includes a multi-select "Category" dropdown (same style as the existing platform/stage filters). Selecting one or more categories narrows the list to leads that have at least one of those categories assigned. Leads with no categories are excluded when any category is active in the filter.

**Manager category management:**
From the lead detail page (or a simple inline UI adjacent to the category chips), a manager can rename or soft-delete a category. Soft-deleting a category immediately removes its join rows across all leads; it no longer appears in the dropdown or as a chip on any lead. Reps cannot see the rename/delete controls.

**Migration outcome:**
After the migration runs, all 20 previously hardcoded enum values exist as rows in `crm_categories`. Every lead that previously had a category value has a matching join row in `crm_lead_categories`. The old `category` column on `crm_leads` and the `leadCategory` pgEnum are gone.

---

## Flow / State Diagram

### Lead detail — assign/remove category

```
User opens lead detail
        |
        v
Category section visible (chips + dropdown trigger)
        |
        +---> Opens dropdown
        |           |
        |           +---> Picks existing category --> chip added to lead (join row inserted)
        |           |
        |           +---> Types new name not in list
        |                       |
        |                       v
        |                 Confirm "Create" option
        |                       |
        |                       v
        |                 New crm_categories row + join row inserted
        |                 Chip appears on lead
        |
        +---> Clicks X on chip --> join row deleted, chip removed
```

### Manager soft-delete category

```
Manager on lead detail (or category management control)
        |
        v
Opens category rename/delete controls (manager-only)
        |
        +---> Rename: updates crm_categories.name; chips on all leads reflect new name
        |
        +---> Delete:
                |
                v
        Confirmation shown ("This removes the category from N leads")
                |
                v
        crm_categories.deletedAt set (soft-delete)
        All crm_lead_categories rows for this category: hard-deleted (cascade)
        Category disappears from all chip sets and dropdown
```

### My Leads filter flow

```
User on /leads (My Leads)
        |
        v
Opens Category multi-select filter
        |
        v
Selects one or more categories (e.g. "Sports", "Concert")
        |
        v
URL param updated (?categories=Sports,Concert)
        |
        v
Lead rows: only leads with at least one matching category shown
```

### Database migration sequence

```
Step 1: Add crm_categories + crm_lead_categories tables
        + Seed 20 existing enum values as crm_categories rows
        (crm_leads.category column still exists at this point)

Step 2: Data-migrate crm_leads.category values
        → crm_lead_categories join rows
        (each lead gets one join row matching its old category value)

Step 3: Drop crm_leads.category column
        Drop leadCategory pgEnum
        (all TypeScript references to lead.category removed before this runs)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — AEs and managers can create new categories from lead detail**
Any logged-in rep or manager can type a new category name in the category dropdown on the lead detail page, confirm it, and see the new category created and assigned to the lead in one action. The new category is immediately available for other leads.
- `proven by:` Vitest unit test: `buildCategoryCreateSchema` validates non-empty trimmed names; DB insert logic (`.toSQL()` assertion). Agent-Probe (manual): rep user flow on dev instance.
- `strategy:` Hybrid

**AC-2 — Multiple categories per lead**
A single lead can have two or more categories assigned simultaneously. Each appears as a separate chip on the lead detail page.
- `proven by:` Vitest unit test: join-table query builder accepts array of category IDs; condition assertion on multi-value input.
- `strategy:` Fully-Automated (unit)

**AC-3 — Category chips visible on lead detail**
All categories assigned to a lead appear as chips in the category section of the lead detail page. The chips reflect the current `crm_categories.name` value (renamed categories update immediately on next page load).
- `proven by:` Agent-Probe (manual dev-instance verification — blocked by Playwright auth fixture gap, pre-accepted known-gap).
- `strategy:` Agent-Probe

**AC-4 — Category chips visible on lead list rows**
Each row in the My Leads list renders chips for every category assigned to that lead. Leads with no categories render no chips (no placeholder text).
- `proven by:` Agent-Probe (manual dev-instance verification — blocked by Playwright auth fixture gap, pre-accepted known-gap).
- `strategy:` Agent-Probe

**AC-5 — Multi-select category filter on leads list**
The leads list filter bar includes a "Category" multi-select dropdown. Selecting one or more categories filters the list to leads carrying at least one of the selected categories. Deselecting all categories removes the filter and shows the full list.
- `proven by:` Vitest unit test: `buildCategoryFilterConditions()` helper — assert SQL condition output for zero / one / multiple selected category IDs. Agent-Probe (manual) for UI rendering.
- `strategy:` Hybrid

**AC-6 — Removing a category assignment**
A rep or manager can remove a category chip from a lead. The chip disappears immediately and the join row is deleted. Other leads sharing the same category are unaffected.
- `proven by:` Vitest unit test: DELETE endpoint schema validation (correct leadId + categoryId pair). Agent-Probe (manual).
- `strategy:` Hybrid

**AC-7 — Soft-delete removes category from all leads**
After a manager soft-deletes a category, it no longer appears in any lead's chip set, is absent from the category dropdown, and the `crm_categories.deletedAt` field is non-null. The hard-delete of `crm_lead_categories` join rows for that category cascades automatically.
- `proven by:` Vitest unit test: soft-delete query sets `deletedAt`; `getActiveCategories` query excludes rows where `deletedAt IS NOT NULL`. Agent-Probe (manual manager flow).
- `strategy:` Hybrid

**AC-8 — Manager-only rename/delete controls**
Rename and delete controls for categories are only visible to users with `role = 'manager'` or `role = 'super_manager'`. Reps see the chips and the assignment dropdown but not the management controls.
- `proven by:` Vitest unit test: `isManagerRole()` gate in the PATCH/DELETE handler — assert 403 for rep-role input. Agent-Probe (manual role verification).
- `strategy:` Hybrid

**AC-9 — Seeded default categories present after migration**
After running the migration, all 20 previously hardcoded enum values exist as active rows in `crm_categories` (deletedAt IS NULL, names match the enum values verbatim). Each lead that previously had a `category` value has exactly one matching join row in `crm_lead_categories`.
- `proven by:` Vitest unit test: seed list completeness (assert the 20 names appear in the seed array in application code). Hybrid (manual: run migration on dev DB, query `SELECT COUNT(*) FROM crm_categories` = 20 and spot-check a few leads).
- `strategy:` Hybrid

**AC-10 — Case-insensitive category uniqueness**
Creating a category whose name matches an existing active category (case-insensitive) is rejected with a clear error. "Sports" and "sports" cannot both exist.
- `proven by:` Vitest unit test: `LOWER(name)` unique-index conflict surfaces as a DB error; server handler returns a 409-style error response.
- `strategy:` Hybrid

**AC-11 — Type check and lint pass**
`bun run check` and `bun run lint` both exit 0 after removing all references to `lead.category` (the old enum column) and the `leadCategory` pgEnum and `LEAD_CATEGORIES` constant.
- `proven by:` `bun run check` + `bun run lint` in CI (Fully-Automated gate).
- `strategy:` Fully-Automated

---

## Out Of Scope

- `/unassigned` (Up for Grabs) category filter — that page had a filter targeting the old single-value enum column. With the enum gone the filter needs redesign; defer to a follow-up issue.
- Separate `/categories` management page — rename and delete are accessible inline from the lead detail page only; no standalone admin screen.
- Bulk category assignment or import-time category mapping — this is a per-lead manual action only.
- e2e Playwright tests — blocked by the pre-existing shared auth-fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); pre-accepted known-gap.
- Live-DB CI harness for Hybrid gates — not in scope for this issue; same standing known-gap as other features.
- The `ingest` pipeline (`/api/leads/ingest`) category field handling — the ingest schema currently accepts a free-text category string; updating ingest to look up or create `crm_categories` rows is a follow-up once the base feature is stable.
- Ordering/sorting categories in the dropdown — categories are shown in alphabetical order; custom ordering is not in scope.

---

## Constraints

1. **Surrogate UUID PK on join table:** `crm_lead_categories` uses a surrogate UUID primary key plus a unique index on the `(leadId, categoryId)` pair — NOT a composite PK.
2. **Soft-delete `crm_categories`, hard-delete join rows:** When a manager deletes a category, `crm_categories.deletedAt` is set (soft). All `crm_lead_categories` rows referencing that category are hard-deleted at the same time (the join table is a pure relation; orphan join rows are meaningless).
3. **Case-insensitive name uniqueness:** `crm_categories.name` enforces uniqueness via a `LOWER(name)` unique index in Drizzle.
4. **Migration journal drift:** `0014` journal drift must be reconciled (`process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`) before running `bun run db:generate`. Migration numbering starts at `0026`.
5. **Three-step migration sequence must run in order:** Add tables + seed → data-migrate existing values → drop old column + enum. These cannot be combined into a single step because step 2 reads the old column.
6. **All surfaces reading `lead.category` must be updated before the migration drops the column:** `crm_leads.category`, `leadCategory` pgEnum, and `LEAD_CATEGORIES` constant in `schemas.ts` are all being removed. TypeScript check (`bun run check`) will catch any reference not updated.
7. **Server-side DB access only:** all Drizzle queries go in `+page.server.ts` or `+server.ts` route handlers — no client-side db imports.
8. **Role gate via `isManagerRole()`:** rename/delete controls and their API handlers check `isManagerRole(locals.user.role)` and return 403 for reps.
9. **Soft-delete filter on all reads:** every query that lists or resolves categories must filter `WHERE deleted_at IS NULL`.
10. **No Superforms:** client-side validation uses `schema.safeParse()` + raw `fetch()`, consistent with the existing codebase convention.

---

## Open Questions

None. All design decisions were locked during the research/intent phase:
- PK shape: surrogate UUID + unique index (not composite PK)
- Delete behavior: soft-delete `crm_categories`, hard-delete join rows
- Enum replacement: full replacement (not extension)
- Case-insensitive uniqueness: `LOWER(name)` unique index
- Feature folder: `process/features/categories/`
- Seeded defaults: all 20 verbatim, managers clean up later

---

## Background / Research Findings

**Existing schema state (as of 07-07-26):**
- `leadCategory` pgEnum defined in `schema.ts:27-48` — 20 hardcoded values
- `crmLeads.category` = `leadCategory('category').notNull().default('Other')` — single required column
- `LEAD_CATEGORIES` constant in `schemas.ts:18` — mirrors the enum values for Zod
- No `crm_categories` or join table exists — clean slate

**Surfaces that currently read `lead.category` (all must be updated):**
- Lead edit modal (category select)
- Lead detail page (category display)
- Unassigned page filter (category multi-select against enum — deferred, see Out of Scope)
- Outreach templates category grouping (currently groups templates by lead category)

**Pattern precedents in the codebase:**
- Join table shape: `crmMeetingAttendees` / `crmLeadVisibilityGrants` (UUID PK + unique index on pair + `onDelete: 'cascade'` FKs)
- Creator attribution: `crmMessageTemplates.createdBy` (`uuid().references(() => crmUsers.id, { onDelete: 'set null' })`)
- Role gate: `isManagerRole(locals.user.role)` in `permissions.ts`
- Filter predicate helper: mirrors `buildFollowUpsRangeLeadConditions` pattern
- Multi-select filter UI: `FilterDropdown` with `multiple` prop (`src/lib/components/ui/filter-dropdown/`)
- Category chips: `Badge` component at `$lib/components/ui/badge`; badge row already used on `[id]/+page.svelte:444`
- API route pattern: `src/routes/api/leads/[id]/notes/+server.ts` (401 guard → visibility guard → `request.json()` → `schema.safeParse()` → DB call → `json()`)

**Migration context:**
- Next migration = `0026` (last journal idx = 25)
- Pre-existing `0014` journal drift documented at `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md` — must be reconciled before running `bun run db:generate`

**Known risks:**
- All TypeScript surfaces referencing `lead.category` (enum column) will have type errors until updated. `bun run check` will catch all of them before the migration drops the column.
- The migration must run in three steps in order; combining steps 1 and 3 would fail because step 2 reads the old column to produce join rows.
