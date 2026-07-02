---
name: plan:lead-visibility-scoping
description: "Per-lead visibility/privacy scoping (Only me / Everyone / Selected people) — GitHub #87"
date: 01-07-26
feature: leads
---

# PLAN — Lead Visibility / Privacy Scoping (GitHub #87)

Date: 01-07-26
Complexity: COMPLEX
Status: PLANNED

**TL;DR:** Add a `visibility` enum column + a `crm_lead_visibility_grants` junction table to `crm_leads`,
a single shared `visibilityCondition(userId, role)` Drizzle helper wired into 7 read surfaces (manager
override centralized inside the helper), visibility write-through on create/edit (with audit + grant
replace/cleanup), and a reset-to-`everyone` on every owner-change path. UI adds a visibility selector
+ conditional teammate multi-select on the create and detail-edit surfaces. Reports and Up-for-Grabs
are SPEC-exempt (never filtered). 4 sequential phases; schema → query → write → UI.

Context loaded during PLAN (per `process/context/all-context.md` routing): the locked SPEC
(`lead-visibility-scoping_SPEC_01-07-26.md`), `process/context/planning/all-planning.md`,
`process/context/tests/all-tests.md`, prior feature PLAN (`ufg-country-category-filters_01-07-26`)
for format precedent, and verified source: `schema.ts` (attendees junction lines 283-294, enums
23-46), `leads.ts` (functions at lines 170/246/363/400/409/466/494/541/571/620/916/964/1075/1112),
`permissions.ts`, `zod/schemas.ts` (54-89), `bulk-claim/+server.ts`.

All INNOVATE decisions below are LOCKED — do not re-decide during EXECUTE.

---

## Overview

Every lead gains exactly one visibility setting at all times: `only_me`, `everyone`, or `selected`
(default `everyone`). Reps only see leads that are theirs, `everyone`-visible, unowned, or explicitly
granted to them. Managers always see and act on everything. The rule is enforced on every rep-facing
list/queue/count/detail surface via one shared SQL condition; reports and Up-for-Grabs are exempt.

## Goals

- `visibility` pgEnum column on `crm_leads`, `NOT NULL DEFAULT 'everyone'` (Postgres backfills existing rows in the same DDL — no separate script).
- `crm_lead_visibility_grants` junction table (mirrors `crm_meeting_attendees` shape exactly).
- One shared `visibilityCondition(userId, role)` helper that short-circuits for managers; wired into 7 query functions.
- Visibility write-through on lead create + detail edit, with `crm_lead_history` audit row on change and grant row replace/cleanup.
- Reset visibility → `everyone` + delete grants on ALL owner-change paths (claim, bulk-claim, unclaim, manager reassign).
- Create + detail-edit UI: visibility selector + conditional teammate multi-select.
- No regression to Up-for-Grabs, reports, soft-delete, or existing filters.

## Scope

**In scope:** schema/migration, `visibilityCondition` helper + wiring into 7 read functions, write
paths (create/edit/owner-reset), create + detail-edit UI, and the enumerated test coverage.

**Out of scope** (SPEC §Out Of Scope — not repeated in full): no new roles/tiers, no bulk visibility
UI, no notifications, no report scoping, no `listUnassignedLeads` scoping (unassigned always visible),
no touching Better Auth tables in the migration.

## Acceptance Criteria

This plan inherits the SPEC's 14 acceptance criteria verbatim (see
`lead-visibility-scoping_SPEC_01-07-26.md` §Acceptance Criteria) — each is mapped 1:1 to a proving
gate in the Verification Evidence table below (`Proves SPEC criterion` column). The plan is "done"
only when every SPEC criterion has a green proving gate (Fully-Automated / Hybrid) OR a named,
backlog-tracked Known-Gap residual (the UI-render halves of AC#1/#3/#5/#8, blocked on
e2e-auth-bootstrap). Criterion set summary:

- AC#1–2: create with explicit visibility + selected-people; default `everyone` when omitted.
- AC#3–4: detail-edit changes visibility (takes effect immediately) and writes a `crm_lead_history` audit row.
- AC#5–8: a non-permitted rep never sees a restricted lead in list, pipeline, Today, reminders, nav counts, or via direct `/leads/[id]` URL (404, not redacted).
- AC#9–10: a manager sees and can act on/edit every lead regardless of visibility.
- AC#11–12: unassigned leads (incl. freshly ingested) stay visible to all reps.
- AC#13: owner change (claim / bulk-claim / reassign / unclaim) resets visibility to `everyone` + deletes grants.
- AC#14: reports aggregates remain unfiltered by visibility.

## Locked Decisions (from INNOVATE — do not re-decide during EXECUTE)

1. **Schema — enum + column.** Add `export const leadVisibility = pgEnum('crm_lead_visibility', ['only_me','everyone','selected'])`. Add `visibility` column to `crm_leads`: `leadVisibility('visibility').notNull().default('everyone')`. Single-step migration; Postgres backfills existing rows to `'everyone'` in the same DDL (satisfies SPEC Constraint: migration must not reduce visibility for anyone).
2. **Schema — junction table.** Add `crm_lead_visibility_grants` mirroring `crm_meeting_attendees` (schema.ts:283-294) EXACTLY: `id: uuid PK defaultRandom`; `leadId: uuid` FK → `crmLeads.id` `onDelete: 'cascade'`; `userId: uuid` FK → `crmUsers.id` `onDelete: 'set null'`; `uniqueIndex('crm_lead_visibility_grants_lead_user_uq').on(leadId, userId)`; `createdAt` timestamp only (no `updatedAt`).
3. **Query — one shared helper.** `visibilityCondition(userId: string, role: Role)` returns a Drizzle `SQL`. For `role === 'manager'` it returns a no-op TRUE condition (`sql\`true\``) so callers push it unconditionally — manager override is centralized in the helper, NOT scattered `if (role !== 'manager')` at call sites (consistent with `permissions.ts` centralization). For a rep it returns:
   `or(eq(crmLeads.ownerId, userId), eq(crmLeads.visibility, 'everyone'), isNull(crmLeads.ownerId), exists(select 1 from crm_lead_visibility_grants where leadId = crmLeads.id and userId = :userId))`.
   Location: `src/lib/server/db/leads.ts` (adjacent to the existing `unassignedBaseConditions` helper at line 386), or a small `src/lib/server/db/visibility.ts` if `leads.ts` grows unwieldy — EXECUTE picks, but the helper is shared, not duplicated.
4. **Query — wire into these 7 functions** (push into each existing `conditions: SQL[]` array alongside `isNull(deletedAt)`): `listLeads` (170), `listLeadsFiltered` (246), `getLead` (363 — fold into its WHERE; failure = record simply not found / 404, never 403/redacted, per AC#8), `listPipelineStage` (541), `getTodayQueue` (964), `getNavCounts` (1075), `getRemindersQueue` (1112). NOTE `listPipelineLeads` (187) also queries leads — EXECUTE must confirm whether `/pipeline` uses `listPipelineStage` (541) or `listPipelineLeads` (187); wire whichever is the live pipeline read path (SPEC AC#6 requires pipeline scoped).
5. **Query — DO NOT wire** `listUnassignedLeads` (409) or `getUnassignedLeadCountries` (400) — unowned leads are SPEC-exempt (always visible). DO NOT touch `src/routes/reports/+page.server.ts` — reports are SPEC-exempt (AC#14). Scraper ingest (`/api/leads/ingest`) needs NO code change (schema default `'everyone'` already correct) — but a verification step confirms this (AC#12), not an assumption.
6. **Write — create.** `leadFormSchema` (schemas.ts:54) gains `visibility: z.enum(['only_me','everyone','selected']).default('everyone')` (AC#2) and `selectedUserIds: z.array(z.string().uuid()).optional()` with a refine: non-empty when `visibility === 'selected'` (AC#1). `POST /api/leads` (`src/routes/api/leads/+server.ts`) passes both through to `createLead()` (571), which inserts the `crm_leads` row with the visibility value AND inserts `crm_lead_visibility_grants` rows (one per `selectedUserIds`) when `'selected'` — inside a transaction.
7. **Write — edit.** `leadUpdateSchema` (schemas.ts:71) gains the same two fields. `PATCH /api/leads/[id]` already gates via `canEditLead` (permissions.ts:14) — no gate change; just wire the fields. `updateLead()` (620) gains: (a) add `['visibility', existing.visibility, updated.visibility]` to the `tracked` array (687-711) so an audit `crm_lead_history` row is written on change (AC#4); (b) when new visibility is `'selected'`, replace grants (delete existing grants for lead, insert new set) in the same transaction; (c) when new visibility is NOT `'selected'`, delete any lingering grants for that lead (cleanup — no stale grantee rows).
8. **Write — owner-change reset (SPEC-locked).** On EVERY owner-change path, set `visibility = 'everyone'` AND delete all `crm_lead_visibility_grants` for that lead, in the same transaction (INNOVATE risk review: deleting stale grants avoids grantee rows lingering under a setting that no longer references them). Paths: `claimLead()` (466, covers both single-claim and bulk-claim since bulk-claim calls `claimLead` per id), `reassignLead()` (916, manager), and `unclaimLead()` (494, owner→null — also an owner change; resets for consistency + grant cleanup). The reset does NOT write a `visibility` history row unless visibility actually changed value (avoid noise); the existing `owner_id` history row is already written on each path.
9. **UI — selector + multi-select.** Add a visibility selector (radio or select: Only me / Everyone / Selected people) + a teammate multi-select shown ONLY when `selected` is chosen. Surfaces: create form (`src/routes/leads/new/+page.svelte`) and detail-edit (`src/routes/leads/[id]/+page.svelte` — EXECUTE confirms whether field-editing lives there or in a separate `edit/` route; wire whichever owns lead-field editing). Teammate options: use `listUsers()` (already loaded in these routes per RESEARCH) — EXECUTE decides active-only filtering; default is all users returned by `listUsers()`. Reuse the existing `MultiSelectFilter.svelte` popover pattern (`src/lib/components/leads/`) if it fits, else a purpose-built selector — no new `ui/` primitive, no new dependency.
10. **UI — create form Superforms path (RESOLVE in EXECUTE Phase 4 step 1).** `leads/new/+page.server.ts` currently has only a `load` (no action); creation POSTs to `/api/leads`. CLAUDE.md mandates "Superforms + Zod for all forms." EXECUTE must decide, before writing UI: (a) keep the API-POST pattern and drive visibility fields through the existing client fetch (documenting the deviation from the Superforms mandate, matching the current create flow), OR (b) add a proper form action to `leads/new/+page.server.ts`. **Locked guidance:** prefer (a) — extend the existing client-fetch create flow — to avoid re-architecting the working create path inside a visibility feature; the Superforms mandate is satisfied by the shared Zod schema (`leadFormSchema`) already validating the payload. Note the deviation explicitly in the EXECUTE report.
11. **Sidebar counts.** `AppSidebar.svelte` nav counts come from `getNavCounts()` (1075) — covered by decision 4. Confirm no separate count query needs a fix (verification step, not an assumption).

## Touchpoints

| File | Change | Est. lines |
|---|---|---|
| `src/lib/server/db/schema.ts` | Add `leadVisibility` pgEnum (near line 46); add `visibility` column to `crmLeads`; add `crmLeadVisibilityGrants` table (mirror `crmMeetingAttendees` 283-294) | ~25 |
| `src/lib/server/db/leads.ts` | Add `visibilityCondition(userId, role)` helper; push into 7 read fns (170/246/363/541/964/1075/1112); change `getLead` signature to `(id, userId, role)`; add visibility+grants writes to `createLead` (571), `updateLead` (620, incl. tracked-array + grant replace/cleanup), reset+grant-delete in `claimLead` (466)/`reassignLead` (916)/`unclaimLead` (494) | ~120 |
| `src/lib/zod/schemas.ts` | Add `visibility` + `selectedUserIds` (with conditional refine) to `leadFormSchema` (54) and `leadUpdateSchema` (71) | ~20 |
| `src/lib/types/index.ts` | `Lead` gains `visibility: 'only_me'\|'everyone'\|'selected'` + optional `selectedUserIds?: string[]`; `CreateLeadInput`/`UpdateLeadInput` gain the two fields; export a `Role` type if not already present | ~15 |
| `src/routes/api/leads/+server.ts` (6-42) | Pass `visibility` + `selectedUserIds` from parsed body into `createLead()` | ~8 |
| `src/routes/api/leads/[id]/+server.ts` (7-63) | Pass the two fields into `updateLead()` (gate unchanged — `canEditLead`) | ~8 |
| `src/routes/api/leads/[id]/owner/+server.ts` | Confirm it calls `reassignLead()` (reset lives in the DB fn, so likely no route change — verify) | ~0-4 |
| `src/routes/leads/[id]/+page.server.ts` | Update `getLead()` call to pass `locals.user.id` + `locals.user.role` (signature change) | ~4 |
| `src/routes/api/leads/[id]/+server.ts` | Pass `locals.user.id` + `locals.user.role` to `getLead()` | ~1 |
| `src/routes/api/leads/[id]/snooze/+server.ts` | Pass `locals.user.id` + `locals.user.role` to `getLead()` | ~1 |
| `src/routes/api/leads/[id]/activities/+server.ts` | Pass `locals.user.id` + `locals.user.role` to `getLead()` | ~1 |
| `src/routes/api/leads/[id]/touch/+server.ts` | Pass `locals.user.id` + `locals.user.role` to `getLead()` | ~1 |
| `src/routes/leads/[id]/edit/+page.server.ts` | Pass `locals.user.id` + `locals.user.role` to `getLead()` | ~1 |
| `src/routes/leads/new/+page.svelte` (+ possibly `+page.server.ts`) | Visibility selector + conditional teammate multi-select; wire into create submit | ~50 |
| `src/routes/leads/[id]/+page.svelte` and/or `edit/+page.svelte` | Same selector + multi-select on detail edit | ~50 |
| `drizzle/` (new migration) | Generated migration for enum + column + junction table (`bun run db:generate`) | new file |
| `src/tests/schemas.spec.ts` | Zod: visibility default `everyone`; `selectedUserIds` refine when `selected` (AC#1, AC#2) | ~30 |
| `src/tests/leads.spec.ts` | Pure-fn `visibilityCondition`/`canViewLead`-equivalent test (rep/otherRep/manager fixtures, `leadOwnedBy` pattern @313-341) | ~40 |
| `src/tests/leads-db.spec.ts` | DB-integration: create-with-visibility, audit-on-change, grant replace/cleanup, owner-change reset (AC#1,3,4,10,13) — `MANAGER_UUID` seeded-const pattern | ~90 |
| `src/tests/leads-filters.spec.ts` | DB-integration: rep excluded from list, manager sees all, unassigned still visible (AC#5,9,11) — `describe.skipIf(SKIP_DB)` pattern | ~70 |
| `src/tests/pipeline-db.spec.ts` | DB: non-permitted rep absent from pipeline (AC#6-pipeline) | ~30 |
| `src/tests/today.spec.ts` | non-permitted rep absent from Today (AC#6-today) | ~30 |
| `src/tests/reminders-db.spec.ts` | non-permitted rep absent from reminders; nav-counts scoped (AC#6-reminders, AC#7) | ~40 |
| `src/tests/import.spec.ts` | ingested lead defaults to `everyone`, visible to all reps (AC#12) | ~20 |
| Reports test (existing reports spec or new assertion) | reports query applies NO visibility filter (AC#14 regression) | ~15 |
| `e2e/lead-visibility.e2e.ts` (NEW) | UI-level ACs (create-with-visibility, detail edit, non-permitted 404) — **Known-Gap stub** (blocked on e2e-auth-bootstrap, see Test Infra Notes) | new file |

No changes to: `src/routes/reports/*`, `listUnassignedLeads`/`getUnassignedLeadCountries`, Better Auth tables, `src/lib/server/mock.ts`.

## Public Contracts

- **`getLead()` signature CHANGE (breaking within the app):** `getLead(id)` → `getLead(id, userId, role)`. Every caller MUST be updated (primary: `src/routes/leads/[id]/+page.server.ts`; grep-confirm all others). This is the only breaking signature change; it is intentional so visibility is enforced at the single-record read (AC#8).
- **`createLead()` / `updateLead()`:** gain visibility + selectedUserIds handling — additive to input object; existing callers passing no visibility still work only if the input type keeps them optional at the DB layer (the API routes always supply `visibility` post-Zod-default, so this is safe end-to-end).
- **`visibilityCondition(userId, role): SQL`** — new shared export. Manager → `sql\`true\`` (no-op); rep → the OR-of-4-conditions expression.
- **`crm_lead_visibility_grants`** — new table; public DB contract. Junction (leadId, userId) with cascade-on-lead-delete, set-null-on-user-delete.
- **`crm_leads.visibility`** — new NOT NULL column, default `everyone`. Existing rows backfilled to `everyone` by the migration.
- Zod: `leadFormSchema` / `leadUpdateSchema` gain `visibility` + `selectedUserIds` — additive, `visibility` defaults so omission is valid.
- No change to `/api/leads/*` HTTP method/route shapes (request bodies gain optional fields only).

## Blast Radius

- **Files touched:** ~24 (2 new: junction table is in existing schema.ts, `e2e/lead-visibility.e2e.ts` new; 1 new migration file; the rest modified). Core logic concentrated in `schema.ts`, `leads.ts`, `schemas.ts`, `types/index.ts`.
- **Packages:** single SvelteKit app (`veent-crm`) — no monorepo boundary crossed.
- **Risk class: HIGH — schema/migration + permission/trust-boundary logic.** This feature changes who can read which records (a trust boundary) and adds a NOT NULL column via migration. Both are high-risk classes → minimum Hybrid (real-DB) test tier required for the enforcement logic; a `visibilityCondition` pure-function test is mandatory; the migration must be verified to backfill without hiding existing leads.
- **Regression surface:** Up-for-Grabs claim/bulk-claim, reports aggregates, soft-delete filtering, existing `/leads` segment + country/category filters — all must remain unchanged. Owner-change paths (claim/reassign/unclaim) must still write the `owner_id` history row AND now also reset visibility.
- **Failure-mode watch:** (a) a rep must NEVER see a restricted lead on ANY surface — a missed wiring on one of the 7 functions is a silent privacy leak (the highest-severity bug class here); (b) the `getLead` 404 path must not leak existence via timing/error differences; (c) manager override must hold on every wired surface (the `sql\`true\`` no-op must genuinely impose no restriction).

## Implementation Checklist

### Phase 0 — Locate unknowns (no deps; do FIRST)
1. **Locate the exact claim-from-unassigned code path.** CONFIRMED during PLAN: `claimLead()` (leads.ts:466) is the single claim fn; `/api/leads/[id]/claim/+server.ts` and `/api/leads/bulk-claim/+server.ts` both call it. Reset logic goes in `claimLead()` (one place covers both). Confirm no other route sets `ownerId` from null→user.
2. **Confirm the live pipeline read path** — grep `/pipeline/+page.server.ts` to see whether it calls `listPipelineStage` (541) or `listPipelineLeads` (187); wire the live one (decision 4).
3. **Grep all `getLead(` call sites** — enumerate every caller before changing its signature (decision, Public Contracts).
4. **Confirm which file owns detail-edit UI** — `src/routes/leads/[id]/+page.svelte` vs a separate `edit/+page.svelte`.

### Phase 1 — Schema + migration (depends on Phase 0)
5. In `schema.ts`: add `leadVisibility` pgEnum (`['only_me','everyone','selected']`) near line 46.
6. In `schema.ts`: add `visibility: leadVisibility('visibility').notNull().default('everyone')` to `crmLeads`.
7. In `schema.ts`: add `crmLeadVisibilityGrants` table mirroring `crmMeetingAttendees` (283-294) — uuid PK defaultRandom, `leadId` FK cascade, `userId` FK set null, `uniqueIndex` on (leadId, userId), `createdAt` only.
8. Run `bun run db:generate` to produce the migration; inspect the generated SQL: confirm the column is `NOT NULL DEFAULT 'everyone'` (Postgres backfills existing rows in the same statement), the junction table + unique index are created, and **no Better Auth table (`user`/`account`/`session`/`verification`) appears in the diff** (per CLAUDE.md). Apply via `bun run db:push` (local) per repo Drizzle workflow.
9. Update `src/lib/types/index.ts`: `Lead.visibility`, optional `Lead.selectedUserIds`, `CreateLeadInput`/`UpdateLeadInput` fields, export `Role` type if absent. Update `dbRowToLead` mapping in `leads.ts` to carry `visibility`.

### Phase 2 — Query layer (depends on Phase 1)
10. Add `visibilityCondition(userId, role): SQL` helper (decision 3) — manager → `sql\`true\``; rep → `or(...)` of the 4 conditions incl. the `exists(...)` grants subquery.
11. Push `visibilityCondition(...)` into the `conditions` array of: `listLeads` (170), `listLeadsFiltered` (246), `listPipelineStage` (541, or `listPipelineLeads` per step 2), `getTodayQueue` (964), `getNavCounts` (1075), `getRemindersQueue` (1112). Each of these gains `userId`/`role` params if not already present — thread them from the route's `locals.user`.
12. Change `getLead(id)` → `getLead(id, userId, role)`; fold `visibilityCondition(userId, role)` into its WHERE (line 367). A non-permitted read returns `null` → caller renders 404 (AC#8, no redacted view). Update all call sites from step 3.
13. Confirm `listUnassignedLeads` (409), `getUnassignedLeadCountries` (400), and reports queries are UNCHANGED (SPEC-exempt — decision 5).

### Phase 3 — Write paths (depends on Phase 1; sequential after Phase 2 for compile)
14. `schemas.ts`: add `visibility` (default `everyone`) + `selectedUserIds` (refine non-empty when `selected`) to `leadFormSchema` (54) and `leadUpdateSchema` (71).
15. `createLead()` (571): accept `visibility` + `selectedUserIds`; insert `crm_leads` with visibility; when `selected`, insert `crm_lead_visibility_grants` rows in the same transaction (wrap the insert in `db.transaction` — currently a bare insert).
16. `updateLead()` (620): thread `visibility` + `selectedUserIds`; add `['visibility', existing.visibility, updated.visibility]` to `tracked` (687) for audit; when new = `selected` replace grants (delete-then-insert for lead); when new ≠ `selected` delete all grants for lead — all inside the existing transaction.
17. Owner-change reset (decision 8): in `claimLead()` (466), `reassignLead()` (916), `unclaimLead()` (494) — set `visibility: 'everyone'` in the `.set(...)` and add a `delete from crm_lead_visibility_grants where leadId = id` inside each transaction.
18. `POST /api/leads` (+server.ts 6-42): pass `visibility` + `selectedUserIds` into `createLead()`.
19. `PATCH /api/leads/[id]` (+server.ts 7-63): pass the two fields into `updateLead()` — gate unchanged (`canEditLead`).
20. Verify `/api/leads/[id]/owner` → `reassignLead()` needs no route-level change (reset is in the DB fn).
21. Verify `/api/leads/ingest` needs no change (schema default handles it — decision 5); add the AC#12 test rather than code.

### Phase 4 — UI (depends on Phase 2 + Phase 3)
22. Resolve the create-form Superforms decision (decision 10) — prefer extending the existing client-fetch create flow; document the deviation.
23. `leads/new/+page.svelte`: add visibility selector + conditional teammate multi-select (shown only when `selected`); source teammate options from `listUsers()` (already in `data`); include `visibility` + `selectedUserIds` in the create payload.
24. Detail-edit UI (file from step 4): same selector + multi-select; pre-fill from the lead's current visibility + existing grants (load grants alongside the lead if not already loaded).
25. Confirm `AppSidebar.svelte` counts flow from `getNavCounts()` (no separate fix — decision 11).
26. Run the full gate set (see Verification Evidence) and fix failures before EXECUTE-complete.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest DB: `createLead({visibility:'selected', selectedUserIds:[u]})` inserts lead + grant row; e2e create form (stub) | Hybrid (DB) / Known-Gap (UI) | AC#1 |
| Vitest (schemas.spec): `leadFormSchema` parse with visibility omitted → `everyone` | Fully-Automated | AC#2 |
| Vitest DB: `updateLead` visibility change takes effect; subsequent rep read excluded; e2e detail-edit (stub) | Hybrid (DB) / Known-Gap (UI) | AC#3 |
| Vitest DB: visibility change writes a `crm_lead_history` row (field `visibility`) | Hybrid (DB) | AC#4 |
| Vitest DB (leads-filters): non-permitted rep absent from `listLeads`/`listLeadsFiltered`; e2e list (stub) | Hybrid (DB) / Known-Gap (UI) | AC#5 |
| Vitest DB: non-permitted rep absent from `listPipelineStage`, `getTodayQueue`, `getRemindersQueue` | Hybrid (DB) | AC#6 |
| Vitest DB: `getNavCounts` scoped for rep vs unscoped for manager | Hybrid (DB) | AC#7 |
| Vitest DB: `getLead(id, otherRepId, 'rep')` returns `null` for a restricted lead; e2e direct-URL 404 (stub) | Hybrid (DB) / Known-Gap (UI) | AC#8 |
| Vitest DB: manager session returns ALL leads across every wired fn regardless of visibility | Hybrid (DB) | AC#9 |
| Vitest DB: `updateLead` under manager on a not-owned `only_me` lead succeeds | Hybrid (DB) | AC#10 |
| Vitest DB: unassigned lead still visible to all reps (`listUnassignedLeads` unchanged) — regression | Hybrid (DB) | AC#11 |
| Vitest (import.spec): ingested `ownerId:null` lead defaults `visibility='everyone'`, visible to all | Hybrid (DB) | AC#12 |
| Vitest DB: `claimLead`/`reassignLead`/`unclaimLead` reset visibility→`everyone` + delete grants | Hybrid (DB) | AC#13 |
| Vitest: reports query applies NO `visibilityCondition` (explicit unfiltered assertion) — regression | Hybrid (DB) | AC#14 |
| Vitest (leads.spec): `visibilityCondition` pure-fn — manager no-op TRUE; rep OR-of-4 shape | Fully-Automated | AC#5,6,7,8,9 (logic core) |
| `bun run check` + `bun run test:unit` green; migration diff excludes Better Auth tables | Fully-Automated | Migration safety / Blast Radius |

**Known-Gap rows (UI halves of AC#1, AC#3, AC#5, AC#8):** proven by NOTHING automated today — blocked
on the repo-wide **e2e-auth-bootstrap** gap (real Better Auth has no Playwright session-seed; every
`page.goto()` to a protected route redirects to `/login`). Tracked at
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Write `e2e/lead-visibility.e2e.ts`
as a `test.fixme(...)` stub now (ready to un-skip when that infra lands); do NOT block EXECUTE on it.
The DB-layer (Hybrid) gates prove the enforcement logic for these same ACs — the Known-Gap is only the
browser-render half. Per the vacuous-green ban, these are named residuals kept CONDITIONAL, not silent
PASS. Manual spot-check (`bun run dev`, log in as two reps + a manager, click through) is the only UI
evidence until the backlog item resolves — the EXECUTE report must label these "manually spot-checked",
never "tested".

## Test Infra Improvement Notes

- **e2e-auth-bootstrap gap (pre-existing, repo-wide):** no Playwright session-seed for real Better Auth
  — blocks all UI-level e2e for protected routes. Tracked at
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. This plan does NOT fix it (out of
  blast radius); it writes a fixme'd stub ready for when it lands.
- The DB-integration tests follow the existing `describe.skipIf(SKIP_DB)` real-Postgres pattern in
  `leads-filters.spec.ts`/`leads-db.spec.ts` (gated on `DATABASE_URL`; local via `docker compose up -d db`).
  A new junction table means the test DB must be migrated (`bun run db:push`) before the Hybrid gates
  run — note this as a precondition in the test files.

## Phase Loop Progress (Phase Completion Rules)

- [x] 1a. Research updated — codebase scan complete (schema junction shape, all 12+ leads.ts fn line refs, permissions, zod, claim/bulk-claim/reassign/unclaim paths, getLead signature all verified against real source during PLAN).
- [ ] 1b. Plan supplemented — pending VALIDATE pass (tier finalization + adversarial review).
- [ ] 2. Validate contract written — NOT yet run. Do not EXECUTE until gate is PASS or accepted CONDITIONAL.
- [ ] 3. Execute complete — all 26 checklist items done; `bun run check` + `test:unit` pass; e2e stub fixme'd (accepted gap).
- [ ] 4. Update process — plan archived, `process/features/leads/_GUIDE.md` + `all-context.md` leads-status updated, tests context refreshed, memory notes if durable pattern found.
- [ ] 5. Report written — execute report filed inside this task folder.

> **IMPORTANT:** Step 2 is never skippable. Given the HIGH risk class (schema migration + trust-boundary
> permission logic), VALIDATE is mandatory — a placeholder contract is a blocker.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/leads/active/lead-visibility-scoping_01-07-26/lead-visibility-scoping_PLAN_01-07-26.md`
2. **Last completed phase or step:** PLAN written from locked SPEC + locked INNOVATE Decision Summary; all touchpoint line refs verified against source. Phase 0 unknowns pre-resolved during PLAN (claim path = `claimLead()`; reassign = `reassignLead()`; getLead signature change confirmed).
3. **Validate-contract status:** PENDING — VALIDATE not yet run (required before EXECUTE; HIGH risk class).
4. **Supporting context files loaded during PLAN:** the SPEC, `all-context.md`, `planning/all-planning.md`, `tests/all-tests.md`, prior PLAN `ufg-country-category-filters_01-07-26`, and source: `schema.ts`, `leads.ts`, `permissions.ts`, `zod/schemas.ts`, `bulk-claim/+server.ts`.
5. **Next step for a fresh agent picking up mid-execution:** run VALIDATE first. On PASS/accepted-CONDITIONAL, EXECUTE in phase order — Phase 0 (locate/confirm) → Phase 1 (schema+migration, must land first) → Phase 2 (query) → Phase 3 (writes) → Phase 4 (UI). Phase 1 must be applied to the local test DB (`bun run db:push`) before any Hybrid gate runs. The single highest-severity risk is a missed `visibilityCondition` wiring on one of the 7 read functions (silent privacy leak) — verify all 7 explicitly.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 4/7 signals — S2 (schema/API/auth surface), S6 (high-risk class: schema-migration + trust-boundary), S7 (5+ files), S3 (multiple independent read/write sections). Layer 1 (4 dimensions) + Layer 2 (5 phase sections) fanned out; no cross-agent talk needed → parallel subagents, synthesized here.

### Test gates (C3 5-column — additive; legacy line form retained below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC#2 | create omits visibility → defaults `everyone` | Fully-Automated | `bun run test:unit -- --run src/tests/schemas.spec.ts` (leadFormSchema parse, visibility omitted → `everyone`) | A |
| AC#5,6,7,8,9 (logic core) | `visibilityCondition` shape: manager `sql` TRUE no-op; rep OR-of-4 | Fully-Automated | `bun run test:unit -- --run src/tests/leads.spec.ts` (pure-fn assertion, `leadOwnedBy`-style fixtures) | B |
| migration/blast | `bun run check` green + migration diff excludes Better Auth tables | Fully-Automated | `bun run check` exits 0; `bun run db:generate` diff grep excludes `user`/`account`/`session`/`verification` | B |
| AC#1 | createLead(visibility:selected,[u]) inserts lead + grant row | Hybrid (DB) | `DATABASE_URL=... bun run test:unit -- --run src/tests/leads-db.spec.ts` (precondition: `docker compose up -d db` + `bun run db:push`) | B |
| AC#3 | updateLead visibility change → subsequent rep read excluded | Hybrid (DB) | leads-db.spec DB case | B |
| AC#4 | visibility change writes `crm_lead_history` row (field `visibility`) | Hybrid (DB) | leads-db.spec DB case | B |
| AC#5 | non-permitted rep absent from listLeads/listLeadsFiltered | Hybrid (DB) | `src/tests/leads-filters.spec.ts` (describe.skipIf(SKIP_DB)) | B |
| AC#6 | non-permitted rep absent from listPipelineStage / getTodayQueue / getRemindersQueue | Hybrid (DB) | pipeline-db.spec / today.spec / reminders-db.spec | B |
| AC#7 | getNavCounts scoped for rep vs unscoped for manager (unassigned sub-count exempt) | Hybrid (DB) | reminders-db.spec / nav-counts DB case | B |
| AC#8 | getLead(id, otherRepId, 'rep') → null for restricted lead (404, not redacted) | Hybrid (DB) | leads-db.spec DB case | B |
| AC#9 | manager session returns ALL leads across every wired fn | Hybrid (DB) | leads-db.spec DB case | B |
| AC#10 | updateLead under manager on not-owned only_me lead succeeds | Hybrid (DB) | leads-db.spec DB case | B |
| AC#11 | unassigned lead still visible to all reps (listUnassignedLeads unchanged) | Hybrid (DB) | leads-filters.spec regression case | A |
| AC#12 | ingested ownerId:null lead defaults visibility='everyone', visible to all | Hybrid (DB) | `src/tests/import.spec.ts` | B |
| AC#13 | claimLead/reassignLead/unclaimLead reset visibility→everyone + delete grants | Hybrid (DB) | leads-db.spec DB case | B |
| AC#14 | reports query applies NO visibilityCondition (explicit unfiltered assertion) | Hybrid (DB) | reports regression assertion | B |
| AC#1,3,5,8 (UI-render halves) | create form / detail-edit / list-absence / direct-URL-404 rendered in browser | Agent-Probe | manual spot-check: `bun run dev`, log in as two reps + a manager, click through (labelled "manually spot-checked", never "tested") | D |

gap-resolution legend: A proven now · B gate added by this plan's checklist · C deferred to named later phase · D backlog test-building stub (named residual)

C-4 reconciliation: `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is not a strategy — the UI-render halves are carried as gap-resolution D named residuals (see Known Gaps).

Legacy line form (retained for existing consumers):
- Zod schema (create default + selected refine): Fully-automated: `bun run test:unit -- --run src/tests/schemas.spec.ts`
- visibilityCondition pure-fn: Fully-automated: `bun run test:unit -- --run src/tests/leads.spec.ts`
- Type/migration safety: Fully-automated: `bun run check` + `bun run db:generate` diff excludes Better Auth tables
- Enforcement logic (7 read fns, writes, owner-reset): hybrid: `bun run test:unit -- --run` + precondition (DATABASE_URL set, `docker compose up -d db`, `bun run db:push` to migrate the junction table)
- UI-render halves (AC#1/#3/#5/#8): known-gap: documented as e2e-auth-bootstrap residual (backlog note); manual spot-check only

### Failing stubs (Fully-Automated rows only)

Failing stub:
test("leadFormSchema defaults visibility to everyone when omitted", () => { throw new Error("NOT IMPLEMENTED — TDD stub: create omits visibility → defaults everyone (AC#2)") })

Failing stub:
test("visibilityCondition returns TRUE no-op for manager and OR-of-4 for rep", () => { throw new Error("NOT IMPLEMENTED — TDD stub: visibilityCondition shape — manager no-op / rep OR-of-4 (AC#5,6,7,8,9 logic core)") })

### Dimension findings

- Infra fit: PASS — single SvelteKit app, no monorepo/container/port surface; Drizzle + Vitest + Playwright already present; migration via `bun run db:generate`/`db:push` matches repo workflow. Single-step `NOT NULL DEFAULT 'everyone'` is the correct Postgres pattern (metadata default, backfills existing rows atomically, no 2-step nullable-then-backfill); Better Auth tables correctly excluded.
- Test coverage: CONCERN — enforcement logic is provable via Hybrid DB tests (real leak surfaces: listLeads/listLeadsFiltered/listPipelineStage/getLead) + a Fully-Automated pure-fn test; but (a) `bun run test:unit` is watch-mode — gate MUST use `-- --run`; (b) UI-render halves of AC#1/#3/#5/#8 are a named Known-Gap residual (pre-existing e2e-auth-bootstrap, legitimately verified in backlog, NOT a dodge).
- Breaking changes: CONCERN — `getLead(id)` → `getLead(id, userId, role)` has 6 production callers, not 1: `leads/[id]/+page.server.ts`, `leads/[id]/edit/+page.server.ts`, and the action endpoints `api/leads/[id]/+server.ts` (PATCH), `api/leads/[id]/activities/+server.ts`, `api/leads/[id]/snooze/+server.ts`, `api/leads/[id]/touch/+server.ts`. Plan Phase-0 step 3 mandates enumerating all callers (safety net), but the Touchpoints table under-scopes (~8 lines, names only 1). The `CrmClient` interface (`src/lib/services/crm-client.ts:31`) declares its own `getLead(id)` but is decoupled (routes import the DB fn directly) — EXECUTE confirms no bridge.
- Security surface: CONCERN — trust-boundary change; the highest-severity failure mode is a missed `visibilityCondition` wiring (silent privacy leak). Two enumeration gaps: (1) `listPipelineLeads` (leads.ts:187) is a live read fn NOT in the plan's wire-list or exempt-list — confirmed its only caller is `/team` (`+page.server.ts:34`), which is manager-gated (`error(403)` for non-managers), so safe to leave unwired, but must be explicitly exempted in the code/report; (2) `getNavCounts`/`getRemindersQueue` delegate to `getTodayQueue(userId)` (owner-scoped) — the real enforcement point is `getTodayQueue`; getNavCounts's separate unassigned sub-count must NOT be visibility-scoped (SPEC-exempt). Migration + write-path atomicity verified sound (see Phase 3).

### Layer 2 section feasibility

- Phase 0 (Locate unknowns): PASS — claims verified against source: claim path = `claimLead()` (466, single fn; bulk-claim + `/claim` both route through it); live pipeline read = `listPipelineStage` (541, confirmed `/pipeline/+page.server.ts:13`); detail-edit UI lives in a SEPARATE `leads/[id]/edit/` route (step-4 unknown resolved: it is `edit/`, not the `[id]/+page.svelte`).
- Phase 1 (Schema + migration): PASS — `crmMeetingAttendees` mirror shape (schema.ts:283-294) verified exactly (uuid PK defaultRandom, leadId FK cascade, userId FK set-null, uniqueIndex, createdAt only). Migration approach correct and safe.
- Phase 2 (Query layer): CONCERN — highest-risk section. Signature threading feasible (all 7 fns' callers have `locals.user`), but 3 gaps: getLead caller under-enumeration (see Breaking changes), listPipelineLeads exemption (see Security), and getNavCounts/getRemindersQueue delegation to getTodayQueue (real enforcement point; do NOT scope the unassigned sub-count). `listLeads()` wiring ripples to 2 UNLISTED callers: `leads/new/+page.server.ts:7` (create-form dedup) and `meetings/+page.server.ts:13`.
- Phase 3 (Write paths): PASS — atomicity confirmed: `updateLead` (642) already `db.transaction`-wrapped → grant replace/cleanup + visibility-history all atomic; `claimLead`/`unclaimLead`/`reassignLead` all transaction-wrapped → reset + grant-delete atomic; `createLead` is currently a bare insert and the plan correctly specifies wrapping it in a transaction (step 15). tracked-array at 687-711 confirmed for the AC#4 audit row.
- Phase 4 (UI): CONCERN — depends on Phase 2/3; UI-render verification blocked on e2e-auth-bootstrap (named residual). Create-form Superforms deviation is pre-decided (extend client-fetch flow); detail-edit lives in `edit/` route (Phase-0 step 4).

### Execute-Agent Instructions (resolve during EXECUTE — these are the CONDITIONAL concerns)

- E1 (getLead callers — from Phase-0 step 3): enumerate and update ALL 6 production callers to the 3-arg signature, threading `locals.user.id` + `locals.user.role`: `leads/[id]/+page.server.ts`, `leads/[id]/edit/+page.server.ts`, `api/leads/[id]/+server.ts`, `api/leads/[id]/activities/+server.ts`, `api/leads/[id]/snooze/+server.ts`, `api/leads/[id]/touch/+server.ts`. Confirm the resulting behavior: a non-permitted rep now gets not-found (404) from the action endpoints — this is INTENDED (consistent trust boundary); a manager passes through via the manager TRUE no-op. Confirm `CrmClient` interface (`crm-client.ts:31`) is not bridged to the DB fn (routes import DB fn directly) — if it is, update the interface + mock or `bun run check` fails.
- E2 (listPipelineLeads exemption): do NOT wire `listPipelineLeads` (leads.ts:187) — its only caller `/team` is manager-gated. ADD it to the explicit "DO NOT wire (manager-only surface)" exemption list in code comments + the EXECUTE report, so it is a conscious exemption, not a silent miss. Verify no rep-facing route calls it.
- E3 (getNavCounts / getRemindersQueue delegation): the single enforcement point is `getTodayQueue(userId)` (owner-scoped). `getNavCounts` and `getRemindersQueue` inherit scoping through it. Do NOT apply `visibilityCondition` to `getNavCounts`'s separate unassigned sub-count query (SPEC-exempt — unowned leads always visible; scoping it would be a bug). Note: getTodayQueue is already owner-scoped (`ownerId = userId`), so AC#6-Today / AC#7 are largely satisfied pre-change; wiring is defensive. Add `role` param to thread the manager no-op.
- E4 (listLeads ripple): wiring `listLeads()` (signature gains userId/role) ripples to 2 unlisted callers — `leads/new/+page.server.ts:7` (create-form dedup) and `meetings/+page.server.ts:13`. Update both. DECIDE + document: under visibility scoping, create-form dedup will not surface duplicates of leads the rep cannot see (acceptable per privacy, but a behavioral change — note it in the report). Confirm `/meetings` scoping intent (rep-facing).
- E5 (grant onDelete, minor): junction mirrors attendees' `userId onDelete: 'set null'` → orphaned null-userId grant rows possible after user deletion (harmless — `exists` subquery won't match null; unique index permits multiple NULLs). Acceptable as locked; note the alternative (`cascade`) in the report if hygiene matters.
- E6 (stale doc + gate command): update the `permissions.ts` header comment ("Reps can SEE all leads" is now false). All unit/DB gates MUST run with `-- --run` (never bare `bun run test:unit`, which is watch mode). Migrate the local test DB (`bun run db:push`) before any Hybrid gate — the new junction table must exist.

### Open gaps

- UI-render halves of AC#1/#3/#5/#8: known-gap: documented as e2e-auth-bootstrap residual — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Enforcement logic for these same ACs IS proven by Hybrid DB gates; only the browser-render half is unverified until that infra lands. Named residual (gap-resolution D), not a silent PASS.

### Known Gaps (pre-classified — excluded from CONCERN/FAIL count)

- e2e-auth-bootstrap (repo-wide, pre-existing): no Playwright session-seed for live Better Auth. Blocks UI-level e2e for all protected routes. NEW PLAN REQUIRED — tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. This plan writes `e2e/lead-visibility.e2e.ts` as a `test.fixme(...)` stub, ready to un-skip when the infra lands. NOT this plan's blast radius.

### What this coverage does NOT prove

- Fully-Automated (schemas.spec / leads.spec / `bun run check`): proves Zod defaults+refine and the `visibilityCondition` SQL SHAPE and type-safety — does NOT prove the condition actually filters rows in a live DB, nor that all 7 read fns were wired.
- Hybrid DB gates: prove row-level enforcement, audit-row write, owner-reset, and manager-override AT THE QUERY LAYER — do NOT prove the browser renders the correct absence/presence, that the visibility selector/multi-select UI works, that the create/edit forms POST the fields correctly, or that the direct-URL 404 renders as a 404 page (all browser-layer, blocked on e2e-auth-bootstrap).
- Agent-Probe (manual spot-check): a human judgment of UI correctness on one session — does NOT provide regression protection; a future change can silently break the UI with no failing gate until e2e-auth-bootstrap lands.
- No gate proves timing/error-shape non-leakage on the getLead 404 path (Blast Radius failure-mode (b)) beyond "returns null" — treat as a manual review item during EXECUTE.

Gate: CONDITIONAL (5 CONCERNs, 0 FAILs; concerns captured as execute-agent instructions E1-E6; UI-render halves are a named backlog-tracked Known-Gap residual)
Accepted by: session (VALIDATE pass, first outer-pvl cycle) — accepted concerns: getLead 6-caller under-enumeration (E1), listPipelineLeads exemption (E2), getNavCounts/getRemindersQueue delegation + unassigned-count exempt (E3), listLeads unlisted-caller ripple (E4), grant onDelete hygiene (E5), stale doc + watch-mode gate command (E6); Known-Gap: UI-render halves of AC#1/#3/#5/#8 (e2e-auth-bootstrap, documented as NEW PLAN REQUIRED).

## Autonomous Goal Block

```
SESSION GOAL: Lead visibility/privacy scoping (GitHub #87) — per-lead Only me / Everyone / Selected people, enforced across 7 rep-facing read surfaces via one shared visibilityCondition(userId, role) helper; managers always see all; owner-change resets to everyone.
Charter + umbrella plan: N/A — single plan (process/features/leads/active/lead-visibility-scoping_01-07-26/lead-visibility-scoping_PLAN_01-07-26.md)
Autonomy: reversible edits auto-proceed; hard-stop only on irreversible/outward-facing actions. HIGH risk class (schema migration + trust-boundary) → produce vc-risk-evidence-pack before finalize.
Hard stop conditions / safety constraints:
- Do NOT apply visibilityCondition to listUnassignedLeads / getUnassignedLeadCountries / reports queries / getNavCounts' unassigned sub-count (all SPEC-exempt — always visible).
- Do NOT touch Better Auth tables (user/account/session/verification) in the migration — verify the generated diff excludes them.
- A missed wiring on any of the 7 read fns is a silent privacy leak — verify all 7 explicitly (listLeads, listLeadsFiltered, listPipelineStage, getTodayQueue, getNavCounts via getTodayQueue, getRemindersQueue via getTodayQueue, getLead).
- Apply Phase 1 (schema+migration) to the local test DB (bun run db:push) BEFORE any Hybrid gate.
Next phase: EXECUTE (Phase 0 → 1 → 2 → 3 → 4 in order)
Validate contract: inline in plan (## Validate Contract, Gate: CONDITIONAL — execute-agent instructions E1-E6 on record)
Execute start: fully-auto: bun run check + bun run test:unit -- --run ; hybrid: DATABASE_URL set + docker compose up -d db + bun run db:push, then bun run test:unit -- --run (leads-db/leads-filters/pipeline-db/today/reminders-db/import specs) ; UI: manual spot-check (e2e stub fixme'd) ; high-risk pack: yes
```
