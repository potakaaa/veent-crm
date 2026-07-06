---
name: plan:organizer-listing-detail
description: "Organizers list + nav tab (#189) and organizer detail + event history + Add Event (#190)"
date: 06-07-26
feature: organizers
---

# PLAN — Organizer Listing & Organizer Detail (GitHub #189, #190)

Complexity: **SIMPLE** (single feature, one plan file, four sequential checklist phases — not a
multi-phase program; no separate validate-contract per phase).

SPEC: `process/features/organizers/active/organizer-listing-detail_06-07-26/organizer-listing-detail_SPEC_06-07-26.md`
Decision Summary: INNOVATE (already final, embedded below — not re-decided here).

**Date**: 06-07-26
**Status**: VALIDATED — Gate: PASS, ready for EXECUTE

## Overview

Build a new `Organizers` section: a plain (unpaginated) list page showing every organizer with
name / handle / location / linked-lead count, a nav tab that surfaces it, and a per-organizer
detail page showing full event history (every linked lead, all stages, visibility-scoped) plus an
"Add Event" button that pre-fills `/leads/new` with the organizer already attached.

## Acceptance Criteria

Verbatim from the locked SPEC (AC1–AC10) — see SPEC file for full 'proven by'/'strategy' detail per
criterion; summarized here for plan-level traceability:

1. Organizers nav tab visible on desktop + mobile nav.
2. Organizers list renders name, handle, location, linked-lead count for every organizer.
3. Clicking an organizer row navigates to its detail page.
4. Organizer detail lists every linked lead ever (all stages, not just open).
5. Each event-history row shows event name, event date, stage, owner — sourced from `crm_leads`, never `crm_meetings`.
6. Linked-leads list respects the same visibility scoping (`crmLeads.visibility`) as other lead-list surfaces.
7. "Add Event" opens `/leads/new` with the organizer already attached — no manual re-selection.
8. Submitting the pre-filled form creates a lead with the correct `organizerId`, which then appears in that organizer's event history.
9. Zero-lead organizers show count "0" and an empty (non-error) event-history state.
10. All data is live-DB-backed — no mock/stub import path in any new route/query.

Each criterion's proving gate and strategy tag is enumerated in Verification Evidence below.

## Goals

- New `src/lib/server/db/organizers.ts` module (mirrors `leads.ts`/`meetings.ts` convention).
- `/organizers` list route + nav tab in the shared `work` array.
- `/organizers/[id]` detail route with event-history table + "Add Event" button.
- `organizerId` pre-fill plumbing: query param → form pre-select → persisted on create.
- All reads live-DB only, visibility-scoped where the SPEC requires it (linked-leads list only).

## Scope

In scope: read-only listing + detail views, nav tab, Add Event pre-fill plumbing (schema, form,
API, DB insert). Out of scope (per SPEC): organizer CRUD, organizer soft-delete, notes-to-organizer
linking (#191), meetings-derived event history, changes to `PATCH /api/leads/[id]/organizer`,
list search/sort/filter, pagination.

## Decision Summary (INNOVATE — implement exactly)

- New `src/lib/server/db/organizers.ts` module — NOT added into `leads.ts`.
- Plain unpaginated organizer list (no infinite scroll/pagination) — matches `listPipelineLeads()`
  / `listLeads()` "load everything, filter client-side" pattern, not the `team` paginated pattern.
- Add Event pre-fill with stale/invalid `organizerId`: silently ignore — form loads in normal
  empty-organizer state, no error UI.
- Nav tab "Organizers" inserted into the shared `work` array in `AppSidebar.svelte`, positioned
  after "Pipeline".
- `organizerId` query-param read is **client-side** in `leads/new/+page.svelte` (matches the
  existing all-client-state form pattern) — no `+page.server.ts` load changes for this.
- `organizerId` plumbing touches: `leadFormSchema` (schemas.ts) + `LeadForm` type, `createLead()`
  insert values (leads.ts), POST handler (`api/leads/+server.ts`), client read in
  `leads/new/+page.svelte`.
- The organizer detail page's linked-leads list **reuses** the existing `visibilityCondition()`
  helper (already exported from `src/lib/server/db/leads.ts:204`, GitHub #87) — no duplicate
  WHERE-clause logic in `organizers.ts`. Import and call it directly.
- Lead-count-per-organizer uses a `GROUP BY` aggregation over `crmLeads` (`deletedAt IS NULL`).
  `crm_leads_organizer_idx` (schema.ts:233) already exists on `organizerId` — reuse it, do not add
  a duplicate index.
- Suggested execution ordering: (1) `organizers.ts` DB module, (2) list route + nav tab, (3) detail
  route + event history + Add Event button, (4) `organizerId` pre-fill plumbing (file-disjoint from
  2–3; can run in parallel with them if the execute agent wants, but sequential is fine for one
  agent).

## Touchpoints

**New files:**
- `src/lib/server/db/organizers.ts` — DB module: `listOrganizersWithLeadCount()`,
  `getOrganizer(id)`, `listLinkedLeadsForOrganizer(organizerId, userId, role)`.
- `src/routes/organizers/+page.server.ts` — list load.
- `src/routes/organizers/+page.svelte` — list UI.
- `src/routes/organizers/[id]/+page.server.ts` — detail load.
- `src/routes/organizers/[id]/+page.svelte` — detail UI (event-history table + Add Event button).
- `src/tests/organizers-db.spec.ts` — **Hybrid-tier** integration tests (VALIDATE correction,
  06-07-26: confirmed by reading `leads-db.spec.ts`, `pipeline-db.spec.ts`, and
  `meeting-reminders-db.spec.ts` headers that every `*-db.spec.ts` file in this repo is a live-DB
  integration suite gated by `const SKIP_DB = !process.env.DATABASE_URL` and auto-skipped when
  `process.env.CI === 'true'` — there is no DB-free `.toSQL()`-only pattern anywhere in
  `src/tests/`. Mirror that exact convention: precondition = `docker compose up -d db` +
  `DATABASE_URL` set locally; auto-skips in CI. Do NOT write these as DB-free `.toSQL()` assertions).

**Modified files:**
- `src/lib/components/layout/AppSidebar.svelte` — add `{ href: '/organizers', label: 'Organizers',
  icon: 'organizers' }` to the `work` array, after the Pipeline entry (line ~46).
- `src/lib/components/shared/Icon.svelte` — add a new `organizers` entry to the `ICONS` map (no
  existing icon fits; follow the existing 24×24 stroke-path convention — e.g. a simple
  building/storefront glyph). This is a small additive change, not a redesign.
- `src/lib/zod/schemas.ts` — add `organizerId: z.string().regex(LOOSE_UUID_RE).optional()` to
  `leadFormSchema` (and therefore `LeadForm` type via inference — no separate type edit needed).
- `src/lib/server/db/leads.ts` — `createLead()`: accept `organizerId?: string` in the input object,
  pass through to the `crmLeads` insert `values` (`organizerId: input.organizerId ?? null`).
- `src/routes/api/leads/+server.ts` — POST handler: pass `data.organizerId` through to `createLead()`
  per the locked stale-ID handling rule below (validate via `getOrganizer()` first).
- `src/routes/leads/new/+page.svelte` — read `?organizerId=` from the URL client-side
  (`page.url.searchParams.get('organizerId')`) on mount/derived, validate it is a syntactically
  loose UUID before using it (reuse `LOOSE_UUID_RE` or a simple regex check), include it in the
  `leadFormSchema.safeParse()` payload. If the value is missing/malformed, silently omit it (no
  error UI) — per Decision Summary. **VALIDATE confirmed:** `page` from `$app/state` is currently
  NOT imported in this file (only `goto` from `$app/navigation`) — add the import.
- `src/routes/leads/new/+page.server.ts` — **no changes** (per Decision Summary — client-side read
  only). Confirm during EXECUTE that no organizer name needs surfacing on this page for this SPEC's
  scope (SPEC does not require displaying which organizer is being pre-filled — only silent
  attachment). If a future AC needs the organizer name shown, that is a follow-up, not in this
  plan's scope.

**Read-only references (no changes):**
- `src/lib/server/db/schema.ts` (`crmOrganizers`, `crmLeads.organizerId`, `crm_leads_organizer_idx`)
- `src/lib/server/db/leads.ts` (`visibilityCondition`, `enrichWithOwnerNames`, `dbRowToLead`)
- `src/lib/utils/owner.ts` (`ownerNameFor`)
- `src/routes/api/leads/[id]/organizer/+server.ts` (existing tag/untag endpoint — untouched)

## Public Contracts

- New DB module exports: `listOrganizersWithLeadCount(): Promise<OrganizerWithCount[]>`,
  `getOrganizer(id: string): Promise<CrmOrganizer | null>`,
  `listLinkedLeadsForOrganizer(organizerId: string, userId: string, role: Role): Promise<Lead[]>`.
  These are new server-only exports; no existing signatures change.
- `createLead()` input type gains one new **optional** field (`organizerId?: string`) — additive,
  non-breaking. VALIDATE confirmed via grep: `api/leads/+server.ts` is the only production caller
  of `createLead()` in the codebase (other matches are test files), and it is edited by this same
  plan — no other production caller is impacted.
- `leadFormSchema` gains one new **optional** field (`organizerId`) — additive, non-breaking for
  the POST `/api/leads` request body contract.
- No changes to `PATCH /api/leads/[id]/organizer` (existing, untouched — confirmed via grep, not
  referenced by any Touchpoints entry) or `GET /api/leads`.
- New routes `/organizers` and `/organizers/[id]` are new public app pages, not new API surface —
  standard SvelteKit page + server load pattern, session-gated same as all other routes.

## Blast Radius

- **Risk class:** none of the high-risk classes (no auth/identity, no billing, no schema migration,
  no public API contract *break* — only additive optional fields, no destructive mutation, no
  deploy/container change, no secrets/trust-boundary logic). Standard feature-add risk profile.
- **Files touched:** 5 new files + 5 modified files + 1 new test file = 11 files. All within
  `src/routes/organizers/**` (new), `src/lib/server/db/` (1 new + 1 modified), `src/lib/zod/`
  (1 modified), `src/lib/components/layout/` + `src/lib/components/shared/` (2 modified),
  `src/routes/api/leads/` (1 modified), `src/routes/leads/new/` (1 modified), `src/tests/` (1 new).
- **No schema/migration change** — `organizerId` column and its index already exist on `crm_leads`;
  `crmOrganizers` table already exists. Zero `drizzle-kit` migrations needed.
- **No new dependency, agent, or runtime surface.**

## Implementation Checklist

### Phase 1 — `organizers.ts` DB module

1. Create `src/lib/server/db/organizers.ts`. Import `db`, `crmOrganizers`, `crmLeads` from
   `./schema`; import `visibilityCondition` from `./leads` (reuse, do not duplicate); import
   `eq`, `isNull`, `and`, `count`, `sql` from `drizzle-orm` as needed.
2. Implement `listOrganizersWithLeadCount()`:
   - `LEFT JOIN crmLeads ON crmLeads.organizerId = crmOrganizers.id AND crmLeads.deletedAt IS NULL`
   - `GROUP BY crmOrganizers.id`
   - `SELECT crmOrganizers.*, count(crmLeads.id) AS leadCount`
   - Order by `crmOrganizers.name ASC` (plain list, no pagination per Decision Summary).
   - Return shape: `{ id, name, normalizedHandle, location, leadCount }[]` (or full organizer row +
     `leadCount` — keep it simple, do not over-select columns the SPEC doesn't need for the list:
     name, normalizedHandle, location, leadCount are the only SPEC-required columns; still return
     `id` for the link).
3. Implement `getOrganizer(id: string)`: simple `db.select().from(crmOrganizers).where(eq(id))`
   single-row lookup, return `null` if not found (no soft-delete filter — organizers have no
   `deletedAt`).
4. Implement `listLinkedLeadsForOrganizer(organizerId, userId, role)`:
   - `WHERE crmLeads.organizerId = organizerId AND crmLeads.deletedAt IS NULL AND
     visibilityCondition(userId, role)` — call the imported helper directly, do not reimplement.
   - **No stage filter** — must include all stages (open, won, lost) per SPEC AC4.
   - Map rows via the existing `dbRowToLead` mapper (import from `./leads`) so `eventName`,
     `eventDate`, `stage`, `ownerId` come through consistently; then enrich with `enrichWithOwnerNames`
     (import from `./leads`) so each entry has `ownerName` for the event-history table.
   - Order by `eventDate DESC NULLS LAST` (most recent event first — reasonable default per repo's
     other event-date sorts; SPEC does not mandate an order, so pick the existing repo convention).
5. Export `CrmOrganizer` type re-export or a small `OrganizerWithCount` type as needed by the routes.

### Phase 2 — Organizers list route + nav tab

6. Create `src/routes/organizers/+page.server.ts`: session-gate (`if (!locals.user) throw
   error(401, 'Unauthorized')` — matches every other route), call
   `listOrganizersWithLeadCount()`, return `{ organizers }`.
7. Create `src/routes/organizers/+page.svelte`: render each organizer as a row/card
   (name, handle — render `normalizedHandle` or em-dash if null per SPEC edge case, location or
   em-dash, lead count). Use existing `PageHeader`, `Card`, `Table`/`TableRow` components
   (mirror `team/+page.svelte` table structure, minus pagination/sort). Each row links to
   `/organizers/[id]`.
8. Edit `src/lib/components/shared/Icon.svelte`: add an `organizers` key to `ICONS` (simple
   building/storefront stroke path, 24×24, consistent with existing entries).
9. Edit `src/lib/components/layout/AppSidebar.svelte`: insert `{ href: '/organizers', label:
   'Organizers', icon: 'organizers' }` into the `work` array immediately after the `/pipeline`
   entry (after line 46, before the `/unassigned` entry).
10. Update `isActive()` in `AppSidebar.svelte` if needed so `/organizers/[id]` also highlights the
    Organizers tab (add `if (href === '/organizers') return p === '/organizers' ||
    p.startsWith('/organizers/');` following the existing `/leads` special-case pattern at line 66).
    **VALIDATE note:** the existing generic fallback (`return p.startsWith(href)`, line 67) already
    highlights `/organizers` correctly for both the list and `/organizers/[id]` since no other route
    shares that prefix — this special case is optional/harmless redundancy, not a functional
    requirement. Keep it for consistency with the `/leads` pattern if convenient; skipping it is not
    a defect.

### Phase 3 — Organizer detail route + event history + Add Event

11. Create `src/routes/organizers/[id]/+page.server.ts`: session-gate, call `getOrganizer(params.id)`
    (404 if null), call `listLinkedLeadsForOrganizer(organizer.id, locals.user.id, locals.user.role)`,
    return `{ organizer, leads }`.
12. Create `src/routes/organizers/[id]/+page.svelte`: render organizer header (name, handle,
    location), an "Add Event" `Button` linking to `/leads/new?organizerId={organizer.id}`, and an
    event-history table with columns: event name (`lead.eventName ?? lead.name`), event date
    (`lead.eventDate`, formatted via existing `formatEventDate`/date util), stage (`StageChip`
    component, already used elsewhere), owner (`ownerNameFor` or the pre-enriched `lead.ownerName`).
    Empty state (0 linked leads): render a plain "No events yet" message, not an error (SPEC edge
    case).

### Phase 4 — `organizerId` pre-fill plumbing (file-disjoint from Phases 2–3)

13. Edit `src/lib/zod/schemas.ts`: add `organizerId: z.string().regex(LOOSE_UUID_RE).optional()` to
    `leadFormSchema`'s object shape (near `selectedUserIds`). Confirm `LOOSE_UUID_RE` is already
    defined in this file (used by `selectedUserIds`) and reuse it — do not define a second regex.
14. Edit `src/lib/server/db/leads.ts` `createLead()`: add `organizerId?: string` to the input type,
    add `organizerId: input.organizerId ?? null` to the `tx.insert(crmLeads).values({...})` call.
15. Edit `src/routes/api/leads/+server.ts` POST handler: **LOCKED (VALIDATE resolved the open
    question below)** — if `data.organizerId` is present, call `getOrganizer(data.organizerId)`
    first; only pass `organizerId` into `createLead()` if it resolves to a real row, otherwise omit
    it silently. This is now a required step, not an EXECUTE-time judgment call.
16. Edit `src/routes/leads/new/+page.svelte`: read `page.url.searchParams.get('organizerId')`
    (via `$app/state`'s `page` — VALIDATE confirmed this import does not yet exist in this file;
    add `import { page } from '$app/state';`). Validate the value against `LOOSE_UUID_RE` before
    using it (if the param is missing or fails the UUID-shape check, treat it as `undefined` — same
    as visiting `/leads/new` with no param). Include `organizerId` in the
    `parsed = leadFormSchema.safeParse({...})` call's payload when present and UUID-shaped.

**Locked decision — stale/invalid `organizerId` handling (VALIDATE resolved 06-07-26, was
previously "Flag for EXECUTE confirmation"):** the client-side read in step 16 only checks
UUID *shape* (cheap, no DB round-trip) — a UUID-shaped-but-nonexistent organizer still reaches the
POST handler. The POST handler (step 15) is the single enforcement point: it calls `getOrganizer()`
server-side and drops `organizerId` silently if the row doesn't resolve, before calling
`createLead()`. This avoids a raw FK-violation 500 while still satisfying "silently ignore invalid"
end-to-end. Do not implement a second existence check anywhere else (client-side existence lookup
is explicitly out — see Decision Summary "silently ignore, no error UI").

### Phase 5 — Test coverage (per Verification Evidence below)

17. Write `src/tests/organizers-db.spec.ts` following the exact `describe.skipIf(SKIP_DB)` /
    `const SKIP_DB = !process.env.DATABASE_URL` convention used by `leads-db.spec.ts` /
    `pipeline-db.spec.ts` (Hybrid tier — see corrected Touchpoints note above), covering: list query
    returns correct lead counts (including a zero-lead organizer), detail query excludes no stages
    (won/lost included), detail query applies `visibilityCondition` (reuses the same helper — assert
    it's imported/called, or assert query condition array includes the same shape used in
    `leads-filters.spec.ts` / `leads-db.spec.ts` for visibility), `createLead()` persists
    `organizerId` when provided and `null` when omitted.
18. Extend/verify `leadFormSchema` unit coverage in `src/tests/schemas.spec.ts` (this one IS
    DB-free — pure Zod, Fully-Automated, no `SKIP_DB` gate needed):
    `organizerId` accepted when UUID-shaped, omitted/undefined accepted (optional), rejected when
    non-UUID garbage is passed (schema-level regex rejection — this is the "invalid" case handled
    at the schema boundary, separate from the "stale-but-valid-shape" case handled at the DB/FK
    boundary in step 15's locked decision).
19. Add nav-tab coverage: extend or create a small component/unit test asserting the `work` array
    (or its equivalent exported test seam, if one exists — check whether `AppSidebar.svelte`'s nav
    array is currently unit-testable; if not, this becomes an Agent-Probe item, not
    Fully-Automated — confirm during EXECUTE and update the Verification Evidence table's strategy
    for AC1 accordingly, it is already marked Hybrid to anticipate this).
20. Run `bun run check` (typecheck) and `bun run test:unit` before considering Phase 5 complete.
    Note: `bun run test:unit` runs `vitest --run`, which will execute (not skip) the
    `organizers-db.spec.ts` Hybrid suite only when `DATABASE_URL` is set locally
    (`docker compose up -d db` first) — CI runs will skip it per repo convention.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest (Hybrid — `SKIP_DB`-gated): `listOrganizersWithLeadCount()` returns correct `leadCount` per organizer, including a 0-lead organizer | Hybrid | AC2, AC9 |
| Vitest (Hybrid — `SKIP_DB`-gated): `listOrganizersWithLeadCount()` / `getOrganizer()` render blank/em-dash for null `normalizedHandle` | Hybrid | AC2 (edge case), SPEC Flow/State "no normalizedHandle" branch |
| Vitest (Hybrid — `SKIP_DB`-gated): `listLinkedLeadsForOrganizer()` includes leads in every stage (new/replied/won/lost), no implicit stage filter | Hybrid | AC4 |
| Vitest (Hybrid — `SKIP_DB`-gated): event-history mapping pulls `eventName`/`eventDate`/`stage`/owner-name from `crm_leads` fields only, no `crm_meetings` join | Hybrid | AC5 |
| Vitest (Hybrid — `SKIP_DB`-gated): `listLinkedLeadsForOrganizer()` applies the same `visibilityCondition()` used by `listLeadsFiltered` (same helper reused, not duplicated) | Hybrid | AC6 |
| Vitest (DB-free): `leadFormSchema.safeParse()` accepts a UUID-shaped `organizerId`, accepts undefined, rejects non-UUID garbage | Fully-Automated | AC7 (schema half) |
| Vitest (Hybrid — `SKIP_DB`-gated): `createLead()` persists `organizerId` from input when provided; persists `null` when omitted | Hybrid | AC8 |
| Vitest (Hybrid — `SKIP_DB`-gated): zero-lead organizer fixture — list shows count 0, detail query returns empty array (no throw) | Hybrid | AC9 |
| Code-review check at EXECUTE: no import from `src/lib/server/mock.ts` in any new route/query file | Fully-Automated (grep-style check) | AC10 |
| Agent-Probe: nav shows "Organizers" tab on desktop + mobile, clicking navigates to `/organizers` | Hybrid (unit test on nav array data if testable + manual click-through; blocked live-click confirmation by repo-wide e2e auth-fixture gap — pre-accepted known-gap) | AC1 |
| Agent-Probe: clicking an organizer row on `/organizers` navigates to `/organizers/[id]` and renders the correct organizer's data | Agent-Probe (manual click-through; e2e auth-fixture gap blocks automation — pre-accepted known-gap) | AC3 |
| Agent-Probe: "Add Event" button navigates to `/leads/new?organizerId=...` and the resulting form submission creates a lead with that `organizerId`, visible in the organizer's event history afterward | Hybrid (Hybrid DB pieces above + Agent-Probe for the full click-through; e2e auth-fixture gap — pre-accepted known-gap) | AC7, AC8 |
| `bun run check` (typecheck) green after all phases | Fully-Automated | Cross-cutting — no criterion-specific but required regression gate |

**VALIDATE correction (06-07-26):** all `organizers-db.spec.ts` rows above were corrected from
"Fully-Automated" to "Hybrid" — this repo's `*-db.spec.ts` files are live-DB integration suites
(`SKIP_DB`-gated, auto-skip in CI), not DB-free `.toSQL()` assertions. Only the pure-Zod
`schemas.spec.ts` coverage (AC7 schema half), the grep-style mock-import check (AC10), and
`bun run check` are genuinely Fully-Automated with no DB precondition. See Test Gates table in the
Validate Contract below for the canonical 5-column form.

## Test Infra Improvement Notes

(none identified yet)

## Phase Completion Rules

This is a SIMPLE plan (single artifact, no phase-program umbrella) — 'phase' here means the
five checklist Phases above, not a phase-program inner loop. Completion rule for each:

- A checklist Phase is CODE DONE when its numbered items are implemented and `bun run check` passes with no new errors.
- A checklist Phase is VERIFIED only after its corresponding Verification Evidence row(s) are
  green (Fully-Automated commands pass; Hybrid gates pass when `DATABASE_URL` is set locally —
  Agent-Probe items are manually confirmed).
- The plan as a whole is complete only when Phases 1–5 are VERIFIED and the EVL confirmation run
  (independent vc-tester re-run of the validate-contract gates) is green.
- Known-gaps (repo-wide e2e auth-fixture gap; Hybrid gates requiring local `DATABASE_URL` that CI
  cannot run) are pre-accepted per SPEC Constraints and repo-wide precedent — they do not block
  VERIFIED status for the criteria they partially cover, but must stay listed in the Verification
  Evidence table, not silently dropped.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/organizers/active/organizer-listing-detail_06-07-26/organizer-listing-detail_PLAN_06-07-26.md` (this file)
2. **Last completed phase or step:** VALIDATE — Gate: PASS (06-07-26). No EXECUTE work has started.
3. **Validate-contract status:** written, Gate: PASS (see below).
4. **Supporting context files loaded:** `process/features/organizers/active/organizer-listing-detail_06-07-26/organizer-listing-detail_SPEC_06-07-26.md`, `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `src/lib/server/db/schema.ts`, `src/lib/server/db/leads.ts`, `src/lib/components/layout/AppSidebar.svelte`, `src/lib/components/shared/Icon.svelte`, `src/routes/leads/new/+page.svelte` + `+page.server.ts`, `src/routes/api/leads/+server.ts`, `src/lib/zod/schemas.ts`, `src/routes/team/+page.server.ts` + `+page.svelte` (list pattern reference), `src/tests/leads-db.spec.ts` / `pipeline-db.spec.ts` (test convention reference, re-confirmed at VALIDATE).
5. **Next step for a fresh agent picking up mid-execution:** run `ENTER EXECUTE MODE` for this plan. Resume at the first unchecked Implementation Checklist item (Phase 1 item 1, if nothing has been implemented yet). The stale-organizerId handling (step 15) is now a locked decision — no further confirmation needed before touching Phase 4.

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential (single-agent synthesis)
Rationale: Signal score 2/7 (S2 — additive schema/API surface touched; S7 — 11 files in blast
radius). Score falls in the MEDIUM band (parallel-subagents threshold), but this is a SIMPLE
single-feature plan with no phase-program classification (S4 absent), no high-risk class (S6
absent), and no multi-package scope (S1 absent) — the four Layer 1 dimensions + five Layer 2
per-phase checks were run directly by the validate-agent against real repo evidence (file reads,
greps) rather than fanned out to separate subagents, since every check was a mechanical
file/line verification rather than independent-direction research. Cost guard not triggered
(effective agent-equivalent count well under 30).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2, AC9 | `listOrganizersWithLeadCount()` returns correct lead count per organizer incl. 0-lead org | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (precondition: `docker compose up -d db` + `DATABASE_URL` set) | A |
| AC2 (edge) | null `normalizedHandle` renders blank/em-dash | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC4 | linked-leads query includes every stage, no implicit filter | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC5 | event-history fields sourced from `crm_leads` only, no `crm_meetings` join | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC6 | linked-leads query applies `visibilityCondition()` (reused, not duplicated) | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC7 (schema half) | `leadFormSchema` accepts UUID-shaped `organizerId`, accepts undefined, rejects garbage | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` | A |
| AC8 | `createLead()` persists `organizerId` when provided, `null` when omitted | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC9 (empty state) | zero-lead organizer fixture — no throw, empty array | Hybrid | `bun run test:unit -- src/tests/organizers-db.spec.ts` (same precondition) | A |
| AC10 | no `src/lib/server/mock.ts` import in any new route/query file | Fully-Automated | grep-style check at EXECUTE (e.g. `grep -r "from '\$lib/server/mock'" src/routes/organizers src/lib/server/db/organizers.ts`, expect no matches) | A |
| AC1 | Organizers nav tab renders desktop + mobile, click navigates | Hybrid | unit test on `work` array (if testable) + manual click-through | D |
| AC3 | organizer row click navigates to correct detail page | Agent-Probe | manual click-through | D |
| AC7, AC8 (full flow) | Add Event → pre-filled form submit → lead created with correct `organizerId` → appears in event history | Hybrid | DB-free/Hybrid pieces above + manual click-through | D |
| cross-cutting | typecheck green after all phases | Fully-Automated | `bun run check` | A |

gap-resolution legend: A = proven now (gate passes in this cycle); D = backlog test-building stub
(named residual — repo-wide e2e-auth-fixture gap, pre-accepted, see
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).

C-4 reconciliation: `strategy` column above carries only Fully-Automated / Hybrid / Agent-Probe —
no row uses "Known-Gap" as a strategy; the AC1/AC3/AC7+8-full-flow rows are Hybrid/Agent-Probe
strategies with a named residual (D) for the click-through portion specifically, not the whole row.

Legacy line form (retained for existing validate-contract consumers):
- organizers.ts DB queries (AC2,4,5,6,8,9): Hybrid: `bun run test:unit -- src/tests/organizers-db.spec.ts` — precondition: `docker compose up -d db` + `DATABASE_URL` set locally; auto-skips in CI (repo-wide convention, not a new gap).
- leadFormSchema (AC7 schema half): Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- mock-import check (AC10): Fully-automated: grep for `$lib/server/mock` imports in new files, expect none
- nav tab / row click / full Add-Event click-through (AC1, AC3, AC7-8 full flow): agent-probe: manual click-through — known-gap: documented as pre-accepted repo-wide e2e-auth-fixture gap (not new to this plan)
- typecheck: Fully-automated: `bun run check`

Failing stub — AC7 schema half (Fully-Automated):
```
test("should reject a non-UUID organizerId and accept a UUID-shaped or undefined one", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: leadFormSchema.safeParse() organizerId validation")
})
```

Failing stub — AC10 mock-import check (Fully-Automated):
```
test("should contain zero imports from $lib/server/mock in any new organizers route/query file", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: grep-style check, no src/lib/server/mock import in src/routes/organizers/** or src/lib/server/db/organizers.ts")
})
```

Failing stub — cross-cutting typecheck (Fully-Automated):
```
test("should pass bun run check with zero new type errors after all phases", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: bun run check clean")
})
```

Dimension findings:
- Infra fit: PASS — no container/runtime/infra surface touched; all new routes are standard
  SvelteKit page + server-load pairs; AppSidebar.svelte `work` array (lines 37-57) and Icon.svelte
  `ICONS` map confirmed to exist exactly as the plan describes, insertion point (after Pipeline,
  line 46) verified correct.
- Test coverage: CONCERN → RESOLVED IN PLAN — plan originally mis-described `organizers-db.spec.ts`
  as "DB-free `.toSQL()`" tests; confirmed by reading `leads-db.spec.ts`, `pipeline-db.spec.ts`
  headers that every `*-db.spec.ts` file in this repo is a live-DB integration suite
  (`SKIP_DB`-gated, auto-skips in CI). Corrected the Touchpoints note and all affected Verification
  Evidence rows from Fully-Automated to Hybrid, in-plan, before writing this contract.
- Breaking changes: PASS — `createLead()` and `leadFormSchema` both gain additive optional fields
  only; grep confirmed `api/leads/+server.ts` is the sole production caller of `createLead()` and
  is updated in the same plan; `PATCH /api/leads/[id]/organizer` and `GET /api/leads` are
  untouched (confirmed via grep, not referenced by any edited file).
- Security surface: PASS — linked-leads query reuses the existing exported `visibilityCondition()`
  (confirmed at `leads.ts:204`) rather than duplicating WHERE-clause logic; all new server loads
  follow the repo's standard `if (!locals.user) throw error(401, ...)` session gate; the one open
  design question (stale/invalid `organizerId` handling) was resolved in-plan (see below) rather
  than left as a silent EXECUTE-time judgment call.
- Phase 1 (organizers.ts DB module): PASS — `visibilityCondition`, `dbRowToLead`,
  `enrichWithOwnerNames` all confirmed exported from `leads.ts`; `crmOrganizers`,
  `crm_leads_organizer_idx` confirmed in `schema.ts` at the cited lines.
- Phase 2 (list route + nav tab): PASS — `team/+page.server.ts`/`+page.svelte` reference pattern
  exists; minor observational note: the `isActive()` special-case (checklist item 10) is optional
  redundancy since the existing generic fallback already highlights `/organizers` correctly — not
  a defect, harmless either way.
- Phase 3 (detail route + event history + Add Event): PASS — `StageChip`, `ownerNameFor`,
  `formatEventDate` all confirmed available and already used in `leads/new/+page.svelte`.
- Phase 4 (organizerId pre-fill plumbing): CONCERN → RESOLVED IN PLAN — the stale/invalid
  `organizerId` handling was flagged as an open "confirm at EXECUTE" question; VALIDATE locked it
  to the plan's own recommended default (POST handler calls `getOrganizer()` first, omits silently
  if not found) and updated checklist steps 15-16 accordingly. `page` from `$app/state` confirmed
  NOT currently imported in `leads/new/+page.svelte` — plan now states the import must be added
  (previously only flagged as "confirm").
- Phase 5 (test coverage): PASS — resolved by the same Test coverage dimension fix above; Phase 5
  checklist items 17-20 updated to reflect the Hybrid `SKIP_DB` convention explicitly.

Open gaps: none unresolved. Known residuals (pre-existing, pre-accepted, not new to this plan):
repo-wide missing Playwright authenticated-session fixture blocks Agent-Probe/e2e click-through
confirmation for AC1, AC3, and the full AC7/AC8 click-through flow — see
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Hybrid DB gates require a
local `DATABASE_URL` (`docker compose up -d db`) and will not run in CI — this matches every other
`*-db.spec.ts` file in the repo and is not a new gap introduced by this plan.

What This Coverage Does NOT Prove:
- Fully-Automated gates (schema validation, mock-import grep, typecheck) prove type-level and
  static-analysis correctness only — they do not exercise the real Postgres query planner, actual
  `GROUP BY` aggregation correctness, or FK behavior at insert time.
- Hybrid gates (organizers-db.spec.ts) prove real-DB query behavior but only when run locally with
  `DATABASE_URL` set — they do not run in CI, so a CI-green build does not by itself prove these
  behaviors; a human/agent must have run them locally at least once per Phase Completion Rules.
- Agent-Probe items (nav click, row click, full Add-Event click-through) are manually judged, not
  mechanically asserted — they do not protect against regression without a human/agent re-running
  the click-through after subsequent changes.
- No test proves concurrent-write behavior (two reps editing the same organizer's leads
  simultaneously) — out of scope for this SPEC and not claimed anywhere in the plan.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs; both CONCERNs identified during V2/V3 were resolved via in-plan fixes before
this contract was written — see Dimension findings above for each resolution)
Accepted by: N/A — Gate is PASS. Both CONCERNs identified during V2/V3 (test-tier misclassification;
open stale-organizerId decision) were resolved via in-plan fixes before this contract was written,
not accepted as open concerns. No CONDITIONAL acceptance was needed.

## Autonomous Goal Block

SESSION GOAL: Ship Organizers list + detail pages with event history and Add Event pre-fill (GitHub #189, #190)
Charter + umbrella plan: N/A — single SIMPLE plan, no phase-program umbrella exists for the `organizers` feature.
Autonomy: Standard RIPER-5 gates apply (no standing /goal was declared for this session). EXECUTE requires explicit "ENTER EXECUTE MODE". CONDITIONAL/BLOCKED handling per `process/development-protocols/orchestration.md` §VALIDATE Gate if re-validation is ever needed.
Hard stop conditions / safety constraints:
- No schema/migration changes are in scope — if EXECUTE discovers a migration is actually needed, stop and return to PLAN.
- Do not implement a second stale-organizerId existence check anywhere other than the POST handler (locked decision in checklist step 15) — no client-side existence lookup.
- Do not import from `src/lib/server/mock.ts` in any new route/query file (AC10, mock-data isolation is a mandatory repo convention).
- Do not modify `PATCH /api/leads/[id]/organizer` — explicitly out of scope.
Next phase: EXECUTE: process/features/organizers/active/organizer-listing-detail_06-07-26/organizer-listing-detail_PLAN_06-07-26.md
Validate contract: inline in plan (see `## Validate Contract` section above, Gate: PASS, dated 06-07-26)
Execute start: `bun run check` + `bun run test:unit -- src/tests/schemas.spec.ts` (fully-auto) | Hybrid: `bun run test:unit -- src/tests/organizers-db.spec.ts` (needs `docker compose up -d db` + `DATABASE_URL`) | Agent-Probe: manual click-through for AC1/AC3/AC7-8 full flow (blocked by pre-accepted e2e-auth-fixture gap) | high-risk pack: no (no high-risk class present)
