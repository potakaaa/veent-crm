---
name: plan:outreach-templates
description: "COMPLEX plan — DB-backed manager-managed outreach message templates organized by event category, replacing the static 9-snippet system; 4 phases (schema+accessor / manager CRUD / seed migration / composer integration)"
date: 02-07-26
feature: outreach-templates
---

# Outreach Message Templates — PLAN (COMPLEX)

**Date**: 02-07-26  
**Status**: Active — planned, not started  
**Complexity**: COMPLEX (4 phases, one plan, single validation gate)  
**Feature**: outreach-templates

**TL;DR:** Replace the 9 hardcoded client-side snippets with a real `crm_message_templates` DB table (soft-delete, reuses the existing 20-value `crm_lead_category` enum). Managers CRUD templates at a new `/templates` page backed by `/api/templates` (per-verb manager guard). Reps browse/insert full messages from the lead detail composer with `{{organizerName}}`/`{{eventName}}`/`{{repName}}` substitution and replace-with-confirm. A one-time seed script migrates the 9 legacy snippets. 4 phases; ~13 files; schema-migration + manager-auth surfaces. All 6 INNOVATE decisions are locked and implemented verbatim — this plan does not re-open them.

---

## Overview

Sales reps currently pick from 9 hardcoded snippets (`src/lib/data/templates.ts`) that append a fragment to the note field and can only be changed by a developer. This feature makes the message library a database-backed, manager-managed resource keyed on the same event category leads already carry, and changes composer insertion from append-fragment to replace-full-message with a confirmation guard.

### Goals

1. A `crm_message_templates` table following all repo DB conventions (UUID PK, timestamps, soft-delete).
2. A manager-only `/templates` management surface (list + create/edit/delete) mirroring the mature `/team` + `/api/users` pattern.
3. Composer integration on the lead detail page: browse-by-category, 3-variable substitution, replace-with-confirm.
4. One-time migration of the 9 legacy snippets into the DB, then retirement of the static import.

### Scope

In scope: everything in the 11 SPEC acceptance criteria. Out of scope: everything in the SPEC "Out Of Scope" list (private templates, audit/history table, usage analytics, rich text, multi-channel, extra tokens, bulk import, changes to the log-touch data model, approval workflows).

---

## Locked Decisions (from INNOVATE — implement exactly, do NOT re-litigate)

| # | Decision | Concrete rule for EXECUTE |
|---|---|---|
| D1 | New table `crm_message_templates` | `id uuid PK defaultRandom`, `category` typed as the SAME `leadCategory` pgEnum (not a new taxonomy), `title` text, `body` text (full message), `createdAt`/`updatedAt` timestamptz, `deletedAt` nullable timestamptz. Filter `WHERE deleted_at IS NULL` on every read. **No audit/history table** — accepted known-gap matching `crm_meetings` precedent (document, do not add). |
| D2 | Variable substitution | Extend `fillTemplate()` to a 3-key vars object: `{{organizerName}}` ← `lead.name`, `{{eventName}}` ← `lead.eventName`, `{{repName}}` ← `locals.user` name. Same `.replaceAll` mustache-lite approach; missing values → empty string. No variable-registry abstraction. |
| D3 | CRUD surface | New top-level route `/templates` (manager-only page, mirrors `/team`'s `if (locals.user?.role !== 'manager') error(403)` guard) + `/api/templates` REST endpoints reusing the same `if (!locals.user \|\| locals.user.role !== 'manager') throw error(403, 'Manager only')` guard idiom as `/api/users` (VALIDATE note: `/api/users` today only implements `POST` — there is no existing PATCH/DELETE handler to copy verbatim; only the guard-and-validate idiom is the precedent, not full CRUD-verb parity) — **re-check role on EVERY mutating verb individually** (flagged copy-paste risk in INNOVATE). Superforms + Zod for the create/edit form. |
| D4 | Composer integration | `leads/[id]/+page.server.ts` load fetches all non-deleted templates **server-side** and passes them as a prop (NOT a client-side fetch). `LogTouchForm.applyTemplate` changes APPEND → REPLACE, with a confirmation step only when the note field already has non-empty content. Popover groups/filters by `crm_lead_category`, surfacing the current lead's category first. |
| D5 | Legacy migration | One-time seed script (mirrors `scripts/import.ts`) reads the 9 static entries, rewrites tokens (`{{page}}`→`{{organizerName}}`, `{{event}}`→`{{eventName}}`), inserts them with category `'Other'` (old message-type taxonomy does not map 1:1 to event categories — default `'Other'`, documented below). After the script exists and is run-once documented, remove the static `TEMPLATES` import usage from `LogTouchForm.svelte`. **Keep `fillTemplate()` itself** (extended per D2) — delete only its data source. |
| D6 | Test tiers | DB accessor CRUD + soft-delete + manager-guard tests, Zod validator tests, `fillTemplate` 3-key tests = Fully-Automated (Vitest). Manager `/templates` CRUD flow + LogTouchForm browse/insert/replace-confirm = Agent-Probe (repo-wide Playwright auth-fixture gap — out of scope to build). Seed-script run = Hybrid (script + manual verification note). |

### Legacy category mapping (D5, documented)

All 9 legacy snippets belong to the old message-type taxonomy (`intro`/`follow-up`/`pricing`), which has no meaningful mapping into the 20-value event-category enum. **Every legacy row is seeded with category `'Other'`.** Titles are preserved from the existing `label` field. This is a deliberate best-effort default, not a data-quality guarantee; a manager can recategorize post-migration via the `/templates` edit flow.

---

## Touchpoints

### Phase 1 — Schema + accessor + validators + pure substitution

| File | Create/Modify | Change |
|---|---|---|
| `src/lib/server/db/schema.ts` | Modify | Add `crmMessageTemplates` pgTable after `crmMeetings`: `id uuid PK defaultRandom`, `category: leadCategory('category').notNull().default('Other')`, `title: text('title').notNull()`, `body: text('body').notNull()`, `createdAt`/`updatedAt` timestamptz `.notNull().defaultNow()`, `deletedAt: timestamp('deleted_at', { withTimezone: true })` (nullable). Reuse the existing `leadCategory` enum export — do NOT declare a new enum. |
| `drizzle/` (generated) | Create | Run `bun run db:generate` to emit the migration for the new table. Commit the generated SQL. |
| `src/lib/types/index.ts` (VALIDATE fix: plan previously said `src/lib/types.ts` — that path does not exist; `src/lib/types/` is a directory whose barrel is `index.ts`) | Modify | Add `MessageTemplate` interface: `{ id: string; category: Category; title: string; body: string; createdAt: string; updatedAt: string }` (no `deletedAt` in the surface type — it's an internal filter concern). Reuse the existing `Category` type (VALIDATE fix: plan previously said `LeadCategory`, which does not exist anywhere in the codebase — the real exported type at `src/lib/types/index.ts:23` is `Category`). |
| `src/lib/server/db/templates.ts` | Create | New DB accessor mirroring `meetings.ts`: exported pure `dbRowToTemplate(row)` mapper; `listTemplates()` (all `deletedAt IS NULL`, ordered by `category` then `title`); `createTemplate(input)`; `updateTemplate(id, input)`; `softDeleteTemplate(id)` (sets `deletedAt = now()`, filtered to `deletedAt IS NULL` so double-delete is a no-op). All reads use `and(isNull(crmMessageTemplates.deletedAt), ...)`. |
| `src/lib/zod/schemas.ts` | Modify | Add `templateFormSchema = z.object({ title: z.string().min(1, 'Title is required'), category: z.enum(LEAD_CATEGORIES), body: z.string().min(1, 'Message body is required') })` + `export type TemplateForm = z.infer<typeof templateFormSchema>`. Reuse existing `LEAD_CATEGORIES` const. |
| `src/lib/data/templates.ts` | Modify | Change `fillTemplate` signature to `fillTemplate(body, vars: { organizerName: string; eventName: string; repName: string })` using `.replaceAll('{{organizerName}}', …).replaceAll('{{eventName}}', …).replaceAll('{{repName}}', …)`. Keep the pure function. (Static `TEMPLATES` array + old types are removed in Phase 4, not here, to avoid breaking Phase-2/3 typechecks prematurely — see sequencing note.) |
| `src/tests/templates.spec.ts` | Modify | Rewrite the `fillTemplate` cases for the 3-key signature: all-present substitution, empty-value degrade-to-blank (AC-8), repeated-token, and no-token passthrough. **(VALIDATE fix — resolved ambiguity)** Remove the `TEMPLATES`-iteration case (`'every TEMPLATE body is fully resolved...'`) in THIS phase, not deferred to Phase 4 — it exercises the old 2-key `{page,event}` call shape and will not compile once `fillTemplate`'s signature changes in this same phase (item 6). It provides no coverage the dedicated 3-key cases don't already give. Do not keep a hedged/temporary version of it. |
| `src/tests/templates-db.spec.ts` | Create | New `SKIP_DB`-gated DB accessor spec mirroring `leads-db.spec.ts`: create→read roundtrip, update persists, soft-delete removes from `listTemplates`, double-delete no-op. Plus a DB-free `.toSQL()`/condition assertion proving `listTemplates` filters `deleted_at IS NULL` (CI-green backstop for the soft-delete filter). |

### Phase 2 — Manager CRUD surface

| File | Create/Modify | Change |
|---|---|---|
| `src/routes/templates/+page.server.ts` | Create | Manager guard `if (locals.user?.role !== 'manager') error(403, 'Manager only')`; `load` returns `listTemplates()` + a Superforms `superValidate(zod(templateFormSchema))` instance. |
| `src/routes/templates/+page.svelte` | Create | List grouped by category with create/edit/delete actions; Superforms-bound create/edit form (title, category select from `LEAD_CATEGORIES`, body textarea); delete via `fetch('/api/templates', { method: 'DELETE' })`. Mirror `/team` page structure/styles. |
| `src/routes/api/templates/+server.ts` | Create | `POST` (create), `PATCH` (edit), `DELETE` (soft-delete). **Each handler independently** re-checks `if (!locals.user || locals.user.role !== 'manager') throw error(403, 'Manager only')` — mirrors `/api/users`. Validates body with `templateFormSchema` (POST/PATCH); returns `json(row, { status: 201 })` / `200` / `204`. Invalid payload → `400`. |
| `src/tests/templates-guard.spec.ts` | Create | Fully-Automated Vitest: assert the manager-guard predicate (via `src/lib/utils/permissions.ts` helper if one exists, else a pure `isManager(user)` assertion) rejects `rep` and allows `manager`. Documents that the route-level 403 wiring itself is Agent-Probe (SSR/HTTP). |

### Phase 3 — Legacy seed script (parallel-safe with Phase 2)

| File | Create/Modify | Change |
|---|---|---|
| `scripts/seed-templates.ts` | Create | Mirror `scripts/import.ts` conventions: `#!/usr/bin/env bun`, NO `$lib` imports, lazy DB from `process.env.DATABASE_URL`, `--dry-run` (report only, no DB) / `--load` (idempotent insert). Reads the 9 legacy entries (inline the current `TEMPLATES` bodies/labels into this script so it stays runnable after Phase 4 removes them from `templates.ts`), rewrites `{{page}}`→`{{organizerName}}` and `{{event}}`→`{{eventName}}`, inserts each with `category='Other'`, `title=label`. Idempotent via a title-existence check so re-running inserts no dupes. |
| `scripts/seed-templates.spec.ts` OR reuse `src/tests/` | Create (optional, DB-free) | Unit-test the pure token-rewrite + row-mapping helper (extract it as a pure function in the script) so the migration mapping is Fully-Automated even though the DB `--load` step is Hybrid. |
| `package.json` (VALIDATE fix — plan gap) | Modify | Add `"seed-templates": "bun run scripts/seed-templates.ts"` to `"scripts"`, mirroring the existing `"import"` entry. Required for the Phase-3 gate command to resolve. |

### Phase 4 — Composer integration + static-import retirement

| File | Create/Modify | Change |
|---|---|---|
| `src/routes/leads/[id]/+page.server.ts` | Modify | **(VALIDATE fix — resolved ambiguity)** The file has TWO `Promise.all` blocks (`[lead, users]` then `[activities, meetings, leadHistory]`). Add `listTemplates()` to the FIRST one (`const [lead, users, templates] = await Promise.all([getLead(params.id), listUsers(), listTemplates()])`) since it has no dependency on `lead`; return `templates` in the load payload alongside the existing fields. |
| `src/routes/leads/[id]/+page.svelte` | Modify | Pass `templates={data.templates}` and `repName={data.me.name}` into `<LogTouchForm />`. |
| `src/lib/components/leads/LogTouchForm.svelte` | Modify | Remove `import { TEMPLATES, … } from '$lib/data/templates'` (keep `fillTemplate`). Accept `templates: MessageTemplate[]` and `repName: string` props. Group templates by `crm_lead_category`, ordering the lead's own `lead.category` group first (AC-6). `applyTemplate(t)` → `const filled = fillTemplate(t.body, { organizerName: lead.name, eventName: lead.eventName ?? '', repName })`; if `note.trim()` is non-empty, show a confirm dialog/inline warning before **replacing** `note = filled` (AC-9); if empty, replace immediately. Field stays editable (AC-10 — existing `bind:value`). |
| `src/lib/data/templates.ts` | Modify | Now remove the static `TEMPLATES` array + `Template`/`TemplateCategory`/`TEMPLATE_CATEGORY_LABELS` exports (retired). File retains only the extended `fillTemplate` pure function. |

---

## Public Contracts

- **DB schema:** new table `crm_message_templates` (additive; no existing table altered). Enum `crm_lead_category` is reused, not modified.
- **HTTP:** new `/api/templates` endpoints — `POST` (201 + row / 400 / 403), `PATCH` (200 + row / 400 / 403 / 404), `DELETE` (204 / 403 / 404). New page route `/templates` (200 for manager, 403 otherwise).
- **Component prop contract:** `LogTouchForm` gains required `templates: MessageTemplate[]` and `repName: string` props (breaking change to the component signature — only caller is `leads/[id]/+page.svelte`, updated in the same phase).
- **Pure function:** `fillTemplate(body, { organizerName, eventName, repName })` — signature change (old `{ page, event }` retired). Only in-repo callers are `LogTouchForm.svelte` and `templates.spec.ts`, both updated.
- **Type:** new `MessageTemplate` interface in `$lib/types`.

---

## Blast Radius

- **~13 files** across schema, DB accessor, Zod, types, 2 new routes, 1 new API route, 1 new script, composer component + its page, and 3 test files.
- **Packages/areas:** DB schema + migration; manager-auth surface; lead-detail composer; one-time script.
- **Risk class:** MEDIUM-HIGH — schema migration (additive, low risk) + manager-auth guard (copy-paste-per-verb risk, flagged) + a component-signature breaking change (contained to one caller).
- **Rollback:** the migration is additive (drop table to revert); the static `TEMPLATES` retirement (Phase 4) is the only destructive-to-behavior step and is git-revertible. Phases 1–3 are behavior-invisible to reps until Phase 4 wires the composer.

---

## Implementation Checklist

### Phase 1 — Schema + accessor + validators + substitution (foundation)

1. Add `crmMessageTemplates` pgTable to `src/lib/server/db/schema.ts` per Touchpoints (reuse `leadCategory` enum; nullable `deletedAt`).
2. Run `bun run db:generate`; commit the generated migration under `drizzle/`.
3. Add `MessageTemplate` interface to `src/lib/types/index.ts` (reuse the existing `Category` type — VALIDATE fix: not `LeadCategory`, which does not exist).
4. Create `src/lib/server/db/templates.ts`: pure `dbRowToTemplate` + `listTemplates` / `createTemplate` / `updateTemplate` / `softDeleteTemplate`, all reads filtering `isNull(deletedAt)`.
5. Add `templateFormSchema` + `TemplateForm` type to `src/lib/zod/schemas.ts` (reuse `LEAD_CATEGORIES`).
6. Change `fillTemplate` in `src/lib/data/templates.ts` to the 3-key signature (keep static `TEMPLATES` in place for now).
7. Rewrite `src/tests/templates.spec.ts` for the 3-key signature. **(VALIDATE fix)** Drop the `TEMPLATES`-iteration case now (in this phase) — it uses the retired 2-key call shape and won't compile against the new signature; do not keep a temporary/hedged version. `TEMPLATES` itself stays in `templates.ts` until Phase 4 (only the test case referencing it is removed here).
8. Create `src/tests/templates-db.spec.ts` (`SKIP_DB`-gated CRUD/soft-delete + DB-free `.toSQL()` filter assertion).
9. **Phase-1 gate:** `bun run check` clean; `bun run test:unit:ci` green (Zod + fillTemplate + DB-free filter assertion pass; DB roundtrip self-skips without `DATABASE_URL`).

### Phase 2 — Manager CRUD surface

10. Create `src/routes/api/templates/+server.ts` with `POST`/`PATCH`/`DELETE`, each **independently** guarding manager role, validating with `templateFormSchema`.
11. Create `src/routes/templates/+page.server.ts` (manager 403 guard + `listTemplates` + `superValidate`).
12. Create `src/routes/templates/+page.svelte` (grouped list + Superforms create/edit form + delete action), mirroring `/team`.
13. Create `src/tests/templates-guard.spec.ts` (Fully-Automated manager-guard predicate test).
14. **Phase-2 gate:** `bun run check` clean; `bun run test:unit:ci` green; manager-guard test passes. **(VALIDATE fix — added per coverage gap)** Agent-Probe walkthrough of manager create/edit/delete on `/templates` + direct-hit 403 check (rep session on `/templates` and non-manager verb on `/api/templates`) recorded — this phase is `CODE DONE` without it but not `VERIFIED` (see Resume and Execution Handoff §3 completion-rules note).

### Phase 3 — Legacy seed script (parallel-safe with Phase 2; depends only on Phase 1)

15. Create `scripts/seed-templates.ts` mirroring `scripts/import.ts` (`--dry-run`/`--load`, no `$lib`, lazy DB, idempotent by title, token rewrite, `category='Other'`, inline the 9 legacy bodies).
15a. **(VALIDATE fix — plan gap)** Register a `package.json` script entry `"seed-templates": "bun run scripts/seed-templates.ts"`, mirroring the existing `"import": "bun run scripts/import.ts"` entry. No such script exists today — without this the Phase-3 gate command below has nothing to invoke.
16. Extract the token-rewrite + row-mapping as a pure helper and add a DB-free unit test for it.
17. **Phase-3 gate:** `bun run seed-templates --dry-run` prints 9 mapped rows with rewritten tokens and no DB connection; pure-helper unit test green. (Hybrid `--load` run is a manual verification note, not a CI gate.) Requires step 15a to have registered the `seed-templates` script.

### Phase 4 — Composer integration + static retirement

18. Modify `src/routes/leads/[id]/+page.server.ts` to add `listTemplates()` to the FIRST `Promise.all` (the `[lead, users]` one — VALIDATE fix: not the second `[activities, meetings, leadHistory]` block) and return `templates`.
19. Modify `src/routes/leads/[id]/+page.svelte` to pass `templates` and `repName={data.me.name}` into `LogTouchForm`.
20. Modify `LogTouchForm.svelte`: swap static import for props, group-by-category (lead's category first), `applyTemplate` REPLACE + confirm-when-dirty, 3-key `fillTemplate` call.
21. Remove the static `TEMPLATES` array + `Template`/`TemplateCategory`/`TEMPLATE_CATEGORY_LABELS` from `src/lib/data/templates.ts` (keep `fillTemplate`); finalize `templates.spec.ts` (drop the retired `TEMPLATES`-iteration case).
22. **Phase-4 gate:** `bun run check` clean; `bun run test:unit:ci` green; grep-assert `LogTouchForm.svelte` no longer imports `TEMPLATES` (AC-11 Fully-Automated portion); Agent-Probe walkthrough of browse/insert/replace-confirm recorded.

---

## Data Flow

- **Manager create/edit:** `/templates` page form → Superforms POST/PATCH → `/api/templates` (manager guard + `templateFormSchema`) → `createTemplate`/`updateTemplate` in `templates.ts` → `crm_message_templates` row → list re-loads.
- **Manager delete:** page delete action → `DELETE /api/templates` (guard) → `softDeleteTemplate` sets `deletedAt` → row disappears from every `listTemplates` read.
- **Rep compose:** lead detail `load` (auth) → `listTemplates()` (server-side, `deletedAt IS NULL`) → `templates` prop → `LogTouchForm` groups by category → rep picks → `fillTemplate(body, { organizerName: lead.name, eventName: lead.eventName ?? '', repName: me.name })` → REPLACE note (confirm if dirty) → existing log-touch submit unchanged.
- **Migration:** `seed-templates.ts` reads inline legacy bodies → token rewrite → insert `category='Other'` → rep composer thereafter reads DB, never the static array.

---

## Failure Modes & Edge Cases (vc-scenario)

| Edge case | Handling |
|---|---|
| **Delete a template currently open/selected in a rep's popover** | No live reference is kept — once inserted, the message is plain text in the note field (SPEC Q10). If the popover is open when the underlying row is soft-deleted, the rep's `templates` prop is a stale server snapshot from page load; selecting a since-deleted item still fills text (harmless, text is a copy). No error. Next page load drops it. Document: templates prop is load-time snapshot, not live. |
| **Browse when the lead's category has zero templates** | Popover still renders ALL templates grouped by category (lead's category group simply absent/empty), never an empty dead-end (SPEC Q9). The lead-category-first ordering degrades to "other categories shown" — no blocking empty state. |
| **Concurrent manager edits (two managers editing same template)** | Last-write-wins on `updatedAt` (no optimistic-lock column in v1 — no audit table, D1). Accepted: low-contention manager surface; documented known limitation, not a blocker. Soft-delete + edit race → delete wins on read (filter excludes it). |
| **Unresolvable placeholder (missing eventName)** | `fillTemplate` degrades token to `''` (AC-8) — never leaves literal `{{token}}`, never throws. |
| **Dirty note field on template select** | Confirm dialog/inline warning before replace (AC-9); empty field replaces silently. Prevents silent data loss. |
| **Non-manager hits `/templates` or `/api/templates` directly** | 403 via per-route + per-verb guard (AC-4). Copy-paste risk explicitly mitigated by independent guard on POST/PATCH/DELETE. |

---

## Risk Predictions (vc-predict, 5-persona pre-implementation)

- **Integrator:** the highest concrete risk is the per-verb manager guard on `/api/templates` — INNOVATE flagged copy-paste omission. Mitigation: checklist item 10 names "each handler independently"; guard test (item 13) covers the predicate. Route-level 403 wiring itself is Agent-Probe.
- **Data steward:** additive migration is low risk; the only irreversible-ish step is Phase 4's static retirement, which is git-revertible and gated behind the seed script existing.
- **Component owner:** `LogTouchForm` prop-signature change is breaking but single-caller; sequencing (Phase 4 does both files together) prevents a broken intermediate typecheck.
- **Test realist:** DB accessor `*-db.spec.ts` self-skip without `DATABASE_URL` — to avoid vacuous-green, the soft-delete FILTER is additionally proven CI-green via a DB-free `.toSQL()` assertion (item 8). No developed behavior is terminal on Known-Gap.
- **Migration realist:** token rewrite (`{{page}}`/`{{event}}` → new tokens) is easy to forget; item 15 names it explicitly and item 16 unit-tests the pure rewrite helper.

## Security (auth surface — STRIDE quick scan)

- **Spoofing/Elevation:** manager-only enforcement is the core control — mitigated by mirroring the proven `/team` + `/api/users` pattern AND re-checking role on every mutating verb (D3). This is the single most important security requirement.
- **Tampering:** all writes go through `templateFormSchema` validation; no raw FormData.
- **Repudiation:** accepted gap — no audit/history table in v1 (D1, matches `crm_meetings`). Documented, not silent.
- **Info disclosure:** templates are team-global by design (no per-rep scoping, SPEC out-of-scope); read surface (`/leads/[id]`) already requires an authenticated session.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest schema test: `templateFormSchema` accepts valid title/category/body, rejects empty | Fully-Automated | AC-1 (create validation), AC-2 (edit validation) |
| `templates-db.spec.ts` create→read roundtrip (SKIP_DB-gated) | Fully-Automated | AC-1 |
| `templates-db.spec.ts` update persists (SKIP_DB-gated) | Fully-Automated | AC-2 |
| `templates-db.spec.ts` soft-delete removes from `listTemplates` + DB-free `.toSQL()` `deleted_at IS NULL` filter assertion | Fully-Automated | AC-3 |
| `templates-guard.spec.ts` manager-guard predicate rejects rep / allows manager | Fully-Automated | AC-4 |
| Vitest: `templateFormSchema` category enum === `LEAD_CATEGORIES` (schema test) | Fully-Automated | AC-5 |
| Agent-Probe browser walkthrough: open template browser on lead detail, lead's category surfaced first, select one | Agent-Probe | AC-6 |
| `templates.spec.ts` `fillTemplate` 3-key all-present substitution | Fully-Automated | AC-7 |
| `templates.spec.ts` `fillTemplate` empty-value degrades to blank | Fully-Automated | AC-8 |
| Agent-Probe walkthrough: empty-field silent fill vs dirty-field confirm-before-replace | Agent-Probe | AC-9, AC-10 |
| Seed script `--load` run + manual DB verification (Hybrid) AND grep-assert `LogTouchForm.svelte` no longer imports `TEMPLATES` (Fully-Automated portion) + pure token-rewrite unit test | Hybrid + Fully-Automated | AC-11 |
| **(VALIDATE fix — coverage gap)** Agent-Probe walkthrough: manager opens `/templates`, creates a template via the form, sees it appear in the grouped list | Agent-Probe | AC-1 (UI/route level — the Fully-Automated rows above only prove Zod validation + DB persistence, not that the actual page/form/route wiring works, since no component-test harness exists in this repo) |
| **(VALIDATE fix — coverage gap)** Agent-Probe walkthrough: manager edits a template via the form, sees updated values reflected | Agent-Probe | AC-2 (UI/route level, same rationale) |
| **(VALIDATE fix — coverage gap)** Agent-Probe walkthrough: manager deletes a template, it disappears from both the manager list and (separately) the rep-facing browser | Agent-Probe | AC-3 (UI/route level, same rationale) |
| **(VALIDATE fix — coverage gap)** Agent-Probe walkthrough: a signed-in rep hitting `/templates` directly, and a non-manager POST/PATCH/DELETE to `/api/templates`, both return 403 | Agent-Probe | AC-4 (route-level 403 — `templates-guard.spec.ts` only proves the `isManager()` predicate in isolation, not that every route handler actually calls it) |

No SPEC criterion is proven by Known-Gap. Agent-Probe rows are the accepted proving strategy for rep-facing AND manager-facing browser/route flows alike (repo-wide Playwright auth-fixture gap applies equally to `/templates` as it does to `/leads/[id]`; pre-accepted per SPEC and out of scope to build in this plan).

---

## Test Infra Improvement Notes

- Repo-wide Playwright authenticated-session fixture is still missing (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); until it lands, AC-6/AC-9/AC-10 stay Agent-Probe rather than Fully-Automated e2e. Not built here (SPEC out-of-scope).
- No live-DB CI harness: `templates-db.spec.ts` self-skips without `DATABASE_URL` (same posture as `leads-db.spec.ts`). The DB-free `.toSQL()` filter assertion is the CI-green backstop for the soft-delete filter.
- No component-test harness for `LogTouchForm` exists (carried from `touch-log-templates` predecessor) — the replace-confirm logic is Agent-Probe until one exists.

---

## Dependencies & Sequencing

- **Phase 1** blocks all others (table + accessor + types).
- **Phase 2** depends on Phase 1. **Phase 3** depends on Phase 1 only (touches `scripts/` — no file overlap with Phase 2), so **Phases 2 and 3 are parallel-safe**.
- **Phase 4** depends on Phase 1 (accessor) and should land after Phase 3 exists (so the static `TEMPLATES` retirement doesn't strand the migration source — Phase 3 inlines the legacy bodies into the script, making Phase 4's removal safe).
- Recommended order: 1 → (2 ‖ 3) → 4.
- External: `DATABASE_URL` + running Postgres for the Hybrid seed `--load` and the DB roundtrip specs; none required for CI-green Fully-Automated gates.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/outreach-templates/active/outreach-templates_02-07-26/outreach-templates_PLAN_02-07-26.md`
2. **Last completed phase/step:** none — plan just written, no code changes yet.
3. **Validate-contract status:** pending (vc-validate-agent writes the `## Validate Contract` section before EXECUTE).
4. **Supporting context loaded:** SPEC (same folder); `process/context/all-context.md`; `process/context/tests/all-tests.md`; `process/context/planning/all-planning.md`; reference files `schema.ts`, `templates.ts`, `LogTouchForm.svelte`, `team/+page.server.ts`, `api/users/+server.ts`, `leads/[id]/+page.server.ts`, `meetings.ts` accessor, `leads-db.spec.ts`, `import.ts`, `schemas.ts`.
5. **Next step for a fresh agent:** run VALIDATE (V1–V7) on this plan, then EXECUTE Phase 1 checklist items 1–9 and stop at the Phase-1 gate. Use `bun run check` + `bun run test:unit:ci` as the per-phase gate commands; `bun run db:generate` for the migration; `SKIP_DB` self-skips DB specs without `DATABASE_URL`.

---

## Phase Completion Rules

A phase is `CODE DONE` when its checklist items are implemented and its phase gate command (`bun run check` + `bun run test:unit:ci`) is green. A phase is only `VERIFIED` when its phase gate is green AND its mapped Verification Evidence rows are satisfied — Fully-Automated gates passing in CI, Hybrid gates run with a recorded manual verification note, and Agent-Probe walkthroughs recorded. Do NOT mark any phase `✅ VERIFIED` without both the automated gate evidence and (for rep-facing flows) the Agent-Probe walkthrough record; user confirmation of the manager CRUD flow and composer flow is required before the feature as a whole is VERIFIED. Code-only completion is `CODE DONE`, never `VERIFIED`.

## Next Step

Run VALIDATE on this plan (say **ENTER VALIDATE MODE**) before EXECUTE. Per RIPER-5, VALIDATE is mandatory before implementation for this schema-migration + manager-auth surface.

---

## Validate Contract

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 3/7 signals (S2 schema/API/auth surface touched, S6 high-risk class in blast radius — schema migration + manager-auth, S7 13+ files in blast radius) → MEDIUM threshold. Dominant signal: S6 (manager-auth + schema surface). Phase 1 must run first (blocks all) and Phase 4 must run last (depends on Phase 1 + Phase 3's inlined legacy bodies); Phase 2 and Phase 3 are file-disjoint and require no mid-execution coordination, so EXECUTE runs as sequential(Phase 1) → parallel-subagents(Phase 2, Phase 3) → sequential(Phase 4). Agent team is NOT warranted — the two parallel branches never need to exchange information mid-run.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Manager can create a template (title, category, body persist) — schema/DB layer | Fully-Automated | `templateFormSchema` Vitest (valid/invalid) + `templates-db.spec.ts` create→read roundtrip (SKIP_DB-gated) | B |
| AC-1 | Manager can create a template — UI/route layer | Agent-Probe | Walkthrough: open `/templates`, submit create form, see it appear grouped by category | B |
| AC-2 | Manager can edit a template's fields — schema/DB layer | Fully-Automated | `templateFormSchema` Vitest + `templates-db.spec.ts` update-persists (SKIP_DB-gated) | B |
| AC-2 | Manager can edit a template — UI/route layer | Agent-Probe | Walkthrough: edit form, save, updated values reflected in list | B |
| AC-3 | Manager can delete a template — schema/DB layer | Fully-Automated | `templates-db.spec.ts` soft-delete removes from `listTemplates` + DB-free `.toSQL()` `deleted_at IS NULL` filter assertion | B |
| AC-3 | Manager can delete a template — UI/route layer | Agent-Probe | Walkthrough: delete via UI, confirm gone from manager list AND rep browser | B |
| AC-4 | Only managers can create/edit/delete — predicate layer | Fully-Automated | `templates-guard.spec.ts`: `isManager()` rejects rep, allows manager | B |
| AC-4 | Only managers can create/edit/delete — route layer | Agent-Probe | Walkthrough: rep session hits `/templates` directly (403) + non-manager verb to `/api/templates` (403) | B |
| AC-5 | Templates use the existing 20-value category enum, no parallel taxonomy | Fully-Automated | Vitest: `templateFormSchema` category enum === `LEAD_CATEGORIES` | B |
| AC-6 | Rep browses/selects a template on lead detail, lead's category surfaced first | Agent-Probe | Walkthrough: open template browser on lead detail, lead's category group first, select one | B |
| AC-7 | Selecting a template substitutes organizerName/eventName/repName | Fully-Automated | `templates.spec.ts` `fillTemplate` 3-key all-present substitution | B |
| AC-8 | Unresolvable placeholder degrades to blank, no broken tokens | Fully-Automated | `templates.spec.ts` `fillTemplate` empty-value case | B |
| AC-9 | Insert replaces field; confirm only if dirty | Agent-Probe | Walkthrough: empty-field silent fill vs dirty-field confirm-before-replace | B |
| AC-10 | Field remains editable after insertion | Agent-Probe | Covered in the same walkthrough as AC-9 (pre-existing textarea behavior, no new gate) | B |
| AC-11 | Legacy 9 snippets migrated; static import retired | Hybrid + Fully-Automated | `seed-templates --load` run + manual DB verification (Hybrid); grep-assert `LogTouchForm.svelte` no longer imports `TEMPLATES` + pure token-rewrite unit test (Fully-Automated) | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — no criterion above is proven by Known-Gap; the "no audit/history table" v1 scope decision (D1) is a documented product-scope gap, not a test-coverage gap, and is not a proving-strategy row.

Legacy line form (retained so existing validate-contract consumers still parse):
- Schema/DB (templates.ts accessor + Zod): Fully-automated: `bun run test:unit:ci -- src/tests/templates-db.spec.ts src/tests/templates.spec.ts src/tests/templates-guard.spec.ts` exits 0
- Manager CRUD UI/route (`/templates`, `/api/templates`): Agent-probe: manager create/edit/delete walkthrough + non-manager 403 walkthrough (see Test gates table)
- Composer integration (`LogTouchForm`, `leads/[id]`): Agent-probe: rep browse/select/replace-confirm walkthrough (see Test gates table)
- Seed migration (`scripts/seed-templates.ts`): Hybrid: `bun run seed-templates --load` — precondition: `DATABASE_URL` set, Postgres reachable + Fully-automated: grep-assert `LogTouchForm.svelte` no longer imports `TEMPLATES`

Dimension findings:
- Infra fit: CONCERN (resolved in-plan) — plan originally named a nonexistent `src/lib/types.ts` path and a nonexistent `LeadCategory` type (real path: `src/lib/types/index.ts`; real type: `Category`); plan originally referenced a `seed-templates` npm script that didn't exist in `package.json`. Both fixed in Touchpoints/Checklist above (P1, P2, P3).
- Test coverage: CONCERN (resolved in-plan) — manager CRUD UI/route flows (AC-1/2/3/4 at the page/route level, not just schema/DB/predicate level) had no proving tier in the original Verification Evidence table. Added 4 Agent-Probe rows (P7) mirroring the treatment already given to the rep composer flows; also flagged that `templates.spec.ts`'s retiring `TEMPLATES`-iteration case would fail to compile mid-Phase-1 unless dropped in that same phase (P4, resolved).
- Breaking changes: PASS — `fillTemplate` signature change and `LogTouchForm` prop-signature change each confirmed to have exactly one in-repo caller (both updated in the same phase); no other consumers found via grep.
- Security surface: PASS — manager-guard idiom (`if (!locals.user || locals.user.role !== 'manager') throw error(403, ...)`) confirmed present verbatim in `team/+page.server.ts` and `api/users/+server.ts`; per-verb re-check requirement is explicit in D3 and checklist item 10; no raw FormData; no new secrets/PII; no audit table is an accepted v1 known-gap matching `crm_meetings` precedent (SPEC Constraints), not a security FAIL.
- Phase 1 feasibility: PASS — all edit targets (schema.ts, templates.ts, schemas.ts) confirmed present and uniquely matchable; `crmMeetings` pgTable (schema.ts:255-278) confirmed as an accurate structural template; all needed Drizzle imports already present.
- Phase 2 feasibility: PASS — `/templates` and `/api/templates` are new paths (no collision); guard idiom transfers correctly. Noted `/api/users` today implements only `POST` (no PATCH/DELETE to copy verbatim) — only the guard-and-validate idiom is precedent, not full CRUD-verb parity (P5, wording corrected in D3).
- Phase 3 feasibility: CONCERN (resolved in-plan) — `bun run seed-templates` had no backing `package.json` script; added registration step (P2/P3).
- Phase 4 feasibility: CONCERN (resolved in-plan) — `leads/[id]/+page.server.ts` has two `Promise.all` blocks; plan didn't specify which one gets `listTemplates()`. Resolved: the first one (`[lead, users]`), since it has no dependency on `lead` (P6). `LogTouchForm.svelte`'s import block and `applyTemplate` function, and `+page.server.ts`'s `me.name` field, all confirmed as exact, unique edit targets.

Open gaps: none unresolved. All 7 concerns found (P1–P7) were fixed directly in plan text at V6; no concern was deferred to execute-agent-only instructions or backlog.

What This Coverage Does NOT Prove:
- The Fully-Automated schema/DB gates (AC-1/2/3 first rows) prove Zod validation shape and Drizzle persistence/soft-delete behavior in isolation — they do NOT exercise the actual SvelteKit route handlers, Superforms wiring, or rendered UI (no component-test harness exists in this repo — confirmed no `@testing-library/svelte`/jsdom/happy-dom dependency). That gap is why the added Agent-Probe rows exist.
- `templates-guard.spec.ts` proves the `isManager()` predicate in isolation. It does NOT prove that `/templates/+page.server.ts` or every `/api/templates` verb handler actually calls it — that is the added AC-4 route-layer Agent-Probe row's job, and it is a manual walkthrough, not a CI gate.
- The DB-backed specs (`templates-db.spec.ts`) self-skip entirely without `DATABASE_URL` (repo-wide `SKIP_DB` convention) — CI without a live Postgres proves nothing about real persistence; the DB-free `.toSQL()` filter assertion is the only CI-green backstop for the soft-delete WHERE clause.
- Agent-Probe rows (7 total across AC-1/2/3/4/6/9/10) are one-time manual walkthroughs recorded in the phase report — they do not run in CI and do not catch regressions on future changes. This is the same repo-wide limitation documented in `process/context/tests/all-tests.md` (no Playwright auth-fixture harness yet).
- The seed script's Hybrid `--load` tier proves the migration ran once against a specific database at a specific time — it does not prove idempotency under concurrent runs or against a different starting dataset beyond the inline 9 legacy bodies.
- No coverage anywhere proves concurrent-edit / race-condition behavior (documented as an accepted v1 known-limitation in the plan's Failure Modes table, not a gap needing a gate).

Gate: PASS (no FAILs, all 7 concerns fixed directly in plan text: P1 type path, P2 type name, P3 package.json script registration, P4 templates.spec.ts TEMPLATES-iteration removal timing, P5 D3 precedent wording, P6 Promise.all target, P7 manager-CRUD Agent-Probe coverage gap)
Accepted by: session (VALIDATE pass resumed after a transient tool error; all findings were plan-text-fixable CONCERNs, none required user judgment calls or descoping — resolved via direct plan edits per vc-validate-findings §V3 Synthesis Rules Net Gate Derivation: 0 FAILs, 0 unresolved CONCERNs after fixes → PASS)

### Test Coverage Plan (Section III detail)

**Area: `src/lib/server/db/templates.ts` + `src/lib/zod/schemas.ts` (schema + accessor)**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `templateFormSchema` accepts valid input, rejects empty title/body | `bun run test:unit:ci -- src/tests/templates.spec.ts` exits 0 | Zod validation shape is correct | Actual form submission through Superforms/SvelteKit |
| Fully-automated | Category enum matches `LEAD_CATEGORIES` | Same command, schema equality assertion | No parallel taxonomy introduced | — |
| Fully-automated | Create/read/update/soft-delete roundtrip (`SKIP_DB`-gated) + DB-free `.toSQL()` filter assertion | `bun run test:unit:ci -- src/tests/templates-db.spec.ts` exits 0 (roundtrip self-skips without `DATABASE_URL`; filter assertion always runs) | Accessor logic and the `deleted_at IS NULL` WHERE clause are correct | Real Postgres persistence in CI (no live-DB harness) |

Failing stub (TDD skeleton for the first Fully-Automated row above):
```ts
test("should accept a valid template payload and reject an empty title/body", () => {
	throw new Error("NOT IMPLEMENTED — TDD stub: templateFormSchema accepts valid title/category/body, rejects empty");
})
```

**Area: `src/routes/templates/` + `src/routes/api/templates/` (manager CRUD surface)**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `isManager()` predicate rejects rep, allows manager | `bun run test:unit:ci -- src/tests/templates-guard.spec.ts` exits 0 | The permission predicate itself is correct | That every route handler actually calls it |
| Agent-probe | Manager creates/edits/deletes a template via `/templates` UI | Sign in as manager → open `/templates` → submit create form → edit a row → delete a row → confirm list updates each time | Real Superforms + route wiring works end-to-end | Automated regression on future changes (manual, one-time) |
| Agent-probe | Non-manager hits `/templates` and `/api/templates` directly | Sign in as rep → `goto('/templates')` (expect 403) → attempt POST/PATCH/DELETE to `/api/templates` (expect 403 each) | Route-level guard is wired on every verb, not just the predicate | — |

Failing stub (TDD skeleton for the Fully-Automated row above):
```ts
test("should reject rep and allow manager via isManager()", () => {
	throw new Error("NOT IMPLEMENTED — TDD stub: isManager() predicate rejects rep, allows manager")
})
```

Gaps and resolution options:

| Gap | Resolution options |
|---|---|
| No component-test harness for Superforms-rendered pages (repo-wide) | A) Add `@testing-library/svelte` + jsdom — out of this plan's scope. B) Accept Agent-Probe as the proving tier for UI/route behavior (chosen). C) Backlog: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` already tracks the deeper e2e-fixture blocker this depends on. |

**Area: `scripts/seed-templates.ts` (legacy migration)**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Pure token-rewrite + row-mapping helper | New DB-free unit test on the extracted pure function | `{{page}}`→`{{organizerName}}` / `{{event}}`→`{{eventName}}` rewrite and `category='Other'` mapping are correct | The actual DB insert |
| Fully-automated | `LogTouchForm.svelte` no longer imports `TEMPLATES` | `grep -c "from '\$lib/data/templates'" src/lib/components/leads/LogTouchForm.svelte` shows no `TEMPLATES` import (post Phase 4) | Static import retirement completed | — |
| Hybrid | `--load` inserts 9 rows idempotently | `bun run seed-templates --load` — precondition: `DATABASE_URL` set, Postgres reachable | One-time migration succeeded on a real DB | Idempotency under concurrent runs; behavior against a differently-shaped legacy dataset |

Gaps and resolution options:

| Gap | Resolution options |
|---|---|
| No live-DB CI harness to auto-run the Hybrid `--load` gate | A) Manual verification note recorded at Phase-3 gate (chosen — matches repo-wide precedent for `leads-db.spec.ts`/`meetings` Hybrid gates). B) Backlog a CI Postgres harness — tracked repo-wide in `process/context/tests/all-tests.md` Known Gaps, not re-tracked per-feature. |

**High-risk class areas** (auth, billing, schema migration, public API, container/gateway, secrets)

| Area | High-risk class | Minimum tier | Gap rationale if known-gap accepted |
|---|---|---|---|
| `/api/templates` + `/templates` manager guard | auth/identity (authorization) | Hybrid (met: Fully-Automated predicate + Agent-Probe route walkthrough — exceeds minimum) | N/A — not accepted as known-gap |
| `crm_message_templates` schema migration | schema/migration | Hybrid (met: additive-only migration, `db:generate` output committed, no destructive DDL) | N/A — not accepted as known-gap |

**Missing test areas (no coverage possible at any tier within this plan's scope)**

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| True e2e (Playwright) for any rep- or manager-facing flow | Repo-wide Playwright authenticated-session harness does not exist yet | Deferred to `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (pre-existing, not created by this plan) |
| Live-DB CI for Hybrid gates | No CI Postgres harness exists repo-wide | Tracked in `process/context/tests/all-tests.md` Known Gaps (repo-wide, not re-tracked per-feature) |

### High-risk pack
Required: no
Rationale: this plan's high-risk classes (manager-auth surface, additive schema migration) are already covered at Hybrid-or-above tier per the table above with no accepted known-gaps in those specific areas; the `vc-risk-evidence-pack` 5-artifact schema is reserved for cases with an accepted known-gap or irreversible action in a high-risk class, which does not apply here (migration is additive/reversible via table drop; auth guard has both automated-predicate and Agent-Probe route coverage).

### Backlog artifacts to create during durable capture
- None new. This plan reuses the pre-existing `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` backlog item; no new backlog artifact is required.

### Known gaps on record
- No audit/history table for templates in v1 (D1) — matches accepted `crm_meetings` precedent; documented in SPEC Constraints, not a test-coverage gap.
- No live-DB CI harness (repo-wide) — `templates-db.spec.ts` self-skips without `DATABASE_URL`; DB-free `.toSQL()` filter assertion is the CI-green backstop.
- All Agent-Probe rows (7 total) are one-time manual walkthroughs pending the repo-wide Playwright auth-fixture harness — pre-existing repo-wide gap, not created by this plan.

### Accepted by
session — all 7 CONCERNs (P1 wrong type path, P2 wrong type name, P3 missing package.json script, P4 test-compile-ordering ambiguity, P5 imprecise CRUD-mirror wording, P6 Promise.all target ambiguity, P7 missing manager-CRUD-UI coverage tier) were resolved by direct plan-text fixes during this VALIDATE pass, not by descoping or user override — no FAILs were found, so no user judgment call was required for the PASS verdict itself.

---

## Autonomous Goal Block

```
SESSION GOAL: Ship DB-backed, manager-managed outreach message templates (crm_message_templates), replacing the 9 static client-side snippets, with composer replace-with-confirm substitution.
Charter + umbrella plan: N/A — single plan (not a phase program; this plan's own 4 phases run under one validate-contract).
Autonomy: Standard RIPER-5 gates apply — EXECUTE requires explicit "ENTER EXECUTE MODE"; no standing /goal autonomy has been granted for this session. Each phase gate (bun run check + bun run test:unit:ci) must be green before moving to the next phase; Phase 2 and Phase 3 may run in parallel (file-disjoint, no coordination needed) per the Parallel strategy above.
Hard stop conditions / safety constraints:
- Do not hard-delete any row anywhere — crm_message_templates is soft-delete only (deletedAt), matching repo-wide convention.
- Do not skip the per-verb manager-role re-check on POST/PATCH/DELETE in /api/templates — this is the single most important security control in this plan (D3/E1).
- Do not retire the static TEMPLATES array (Phase 4) before scripts/seed-templates.ts exists and has inlined the legacy bodies (Phase 3) — Phase 4 must land after Phase 3.
- Do not mark any phase VERIFIED on automated-gate evidence alone for phases with Agent-Probe rows (Phase 2 and Phase 4) — the Agent-Probe walkthrough must be recorded first.
Next phase: EXECUTE — start at Phase 1 (schema + accessor + validators + substitution), checklist items 1-9, stop at the Phase-1 gate.
Validate contract: inline in plan — process/features/outreach-templates/active/outreach-templates_02-07-26/outreach-templates_PLAN_02-07-26.md, "## Validate Contract" section (Gate: PASS, generated-by: outer-pvl).
Execute start: bun run check && bun run test:unit:ci (per-phase gate) | bun run db:generate (Phase 1 migration) | Agent-Probe: manager /templates CRUD walkthrough (Phase 2) + rep composer browse/insert/replace-confirm walkthrough (Phase 4) | high-risk pack: no (see Validate Contract §High-risk pack rationale — additive migration + already-covered auth guard).
```
