---
name: plan:ufg-inline-edit-review-removal
description: "Inline edit in Up for Grabs + full needs_review/Review Queue removal (GitHub #90)"
date: 01-07-26
feature: leads
---

# PLAN — Inline Editing in Up for Grabs + Review Queue Removal

Source SPEC: `process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_SPEC_01-07-26.md`
Complexity: **SIMPLE** (one feature, one migration, ~15 call sites, no new services/architecture — single-session, checklist-driven)

Date: 01-07-26
Status: CODE DONE — kept in `active/` (not archived). EVL confirmed all Fully-Automated +
grep gates green. Two items remain before this can move to `completed/`:
1. **Migration not applied** — `drizzle/0009_mushy_vapor.sql` (`ALTER TABLE "crm_leads" DROP
   COLUMN "needs_review";`) is generated and reviewed but NOT applied. User explicitly said
   "migrate later just move forward" — run `bun run db:push` against the dev DB when ready.
2. **Full e2e run deferred** — `bun run test:e2e` (`e2e/ufg-inline-edit.e2e.ts`,
   `e2e/leads-discard.e2e.ts`) was not executed; requires a built+seeded+preview environment
   not available during this EXECUTE/EVL pass. Specs are written and confirmed discoverable
   via `playwright test --list`. AC6 manual visual confirm of `AppSidebar`/`AppTopbar` is also
   still pending (Hybrid gate, precondition `bun run dev` running locally).

Neither gap blocks the shipped code — both are explicit user/environment deferrals, not
oversights. See UPDATE PROCESS closeout note below for the full EVL handoff summary.

(Original VALIDATE status line: VALIDATE PASS — plan-text updated during VALIDATE, see
VALIDATE-added items below.)

## MUST-VERIFY findings (resolved before writing checklist)

1. **Server-side permission enforcement** — `src/routes/api/leads/[id]/+server.ts` (PATCH handler,
   lines 23-33) already calls `canEditLead(me, existing)` and throws 403 if false. It is **not**
   a client-only gate. Widening `canEditLead()` in `src/lib/utils/permissions.ts` is sufficient —
   no separate server-side fix needed. This closes the broken-access-control concern from
   INNOVATE item 2. **VALIDATE confirmed by direct read of the handler (not just static grep) —
   claim is accurate.**
2. **Discard wiring on `/leads/[id]`** — `src/routes/leads/[id]/+page.svelte` already fully wires
   `DiscardIssueModal` (import line 18, `discardOpen` state line 37, `confirmDiscard()` line 204
   calling `DELETE /api/leads/{id}/discard`, button at line 292, modal render at line 446). AC #7
   is **already met by existing code** — this plan's work item is "confirm + add test coverage",
   not "build new UI". **VALIDATE confirmed all cited line numbers by direct read — accurate.**


## Acceptance Criteria

This plan carries the 10 SPEC acceptance criteria verbatim — see the SPEC file (header link
above) for full text of AC1-AC10. Each is mapped to its proving gate in the **Verification
Evidence** table below (Proves SPEC criterion column). A criterion without a proven-by/strategy
link in that table is treated as unresolved and blocks VALIDATE PASS.

## Phase Completion Rules

- This is a SIMPLE single plan (not a phase program) — there is one completion state, not
  per-phase states.
- **CODE DONE** — all Implementation Checklist items (1-33 plus VALIDATE-added items 6b, 19b)
  applied; `bun run check` passes; migration generated, reviewed, and applied.
- **VERIFIED** — CODE DONE, plus every Fully-Automated and Hybrid gate in Verification Evidence
  is green (EVL confirmation run via vc-tester, not execute-agent self-report), and the AC6
  Hybrid gate (grep + manual visual confirm) has an explicit confirmation note in the phase
  report. Do not mark VERIFIED without both the automated evidence and this confirmation.

## Overview

Two connected changes, both scoped to `leads` feature:

1. Add inline field editing to the Up for Grabs list (`/unassigned`) by reusing the existing
   `LeadEditModal.svelte` + `PATCH /api/leads/{id}` pattern already proven on the (soon-removed)
   Review Queue page.
2. Fully remove the Review Queue (`/review`) page and the `needs_review` column/flag — schema,
   server, UI, nav, mocks, tests — in one pass (no partial removal).

## Touchpoints

**New/modified UI (inline edit):**
- `src/routes/unassigned/+page.svelte` — add `editTarget`/`editSaving` state, `LeadEditModal`
  import + render, click-to-edit affordance on row, `saveEdit()` handler (mirrors
  `src/routes/review/+page.svelte` lines 27-52, minus the `saveAndResolve`/resolve-action path
  which doesn't apply here — Up for Grabs has no "resolve" concept)
- `src/lib/utils/permissions.ts` — `canEditLead()` line 14-18: add `|| lead.ownerId === null`
- **[VALIDATE-added]** `src/lib/components/leads/LeadEditModal.svelte` — make `onresolve` prop
  optional and conditionally render the footer's "Resolve" button. See checklist item 6b. This
  file moves from "reused unmodified" to "modified" — see Blast Radius correction below.

**Review Queue removal:**
- `src/routes/review/+page.server.ts` — delete
- `src/routes/review/+page.svelte` — delete
- `src/lib/components/layout/AppSidebar.svelte` — remove `/review` nav item + badge (lines ~19,
  52-55)
- `src/lib/components/layout/AppTopbar.svelte` — remove `reviewCount` prop + review icon button +
  badge (lines 4, 12-21)
- `src/lib/components/layout/AppShell.svelte` — remove `review` from counts type (line 14) and
  `reviewCount={counts.review}` prop pass (line 22)
- `src/lib/components/shared/skeletons/RouteShells.svelte` — remove `isReview` branch (lines 23,
  114-116)
- `src/routes/api/nav-counts/+server.ts` + `src/lib/server/db/leads.ts` `getNavCounts()`
  (lines 1048-1075) — remove `review` key/query entirely (drop the `reviewRow` query, return type,
  and destructure)

**`needs_review` full removal — schema/migration:**
- `src/lib/server/db/schema.ts` line 150 — drop `needsReview: boolean('needs_review')...` column
  definition

**`needs_review` full removal — server/data layer:**
- `src/lib/server/db/leads.ts`:
  - line 92 `dbRowToLead()` — remove `needsReview: row.needsReview`
  - line 367 `listReviewLeads()` — delete entire function (only consumer is `/review`, being removed)
  - line 600 — remove `needsReview: false` from insert/seed shape
  - `getNavCounts()` (1048-1075) — remove review query (see above)
- `src/routes/api/leads/ingest/+server.ts` line 20 comment + line 102 `needsReview:` field — update
  comment, remove field from insert payload. **[VALIDATE-added] Also remove the `review` counter
  (`let review = 0`, its increment block, and the `review` field in the returned JSON) — see
  checklist item 19b and Public Contracts correction below. This was missed by the original
  touchpoint entry.**
- `src/lib/server/import-utils.ts`:
  - `mapCategory()` line 100 — narrow return type from `{ category, needsReview }` to
    `{ category }`; remove `needsReview` from both return statements (lines 104-108)
- `scripts/import.ts`:
  - line 278 type field, line 333 destructure `catReview`, line 337 `needsReview` combine logic,
    line 352 field on insert payload, line 386 `needsReviewCount` on report type, line 420 report
    computation, line 558 report field — remove all; category mapping becomes
    `const { category } = mapCategory(...)` with no review-derived logic (note: current
    `needsReview = catReview || !hasSocials` combines category-mapping signal with
    missing-contact-method signal — verify no other consumer depends on the `!hasSocials` check
    surviving in another form; SPEC confirms no replacement signal, so this logic is deleted
    outright, not migrated)
  - **[VALIDATE confirmed]** `scripts/lib/import-utils.ts` re-exports `mapCategory` unchanged
    (pure passthrough, no code needs editing there — the narrowed return type flows through
    automatically).

**`needs_review` full removal — types:**
- `src/lib/types/index.ts` line 71 (`Lead.needsReview: boolean`) and line 126
  (`?: boolean` — likely a filter/DTO type) — remove both

**`needs_review` full removal — mock data (isolated per repo convention, still must stay
consistent with real `Lead` type):**
- `src/lib/server/mock.ts` — remove `needsReview: boolean` type field (line 41) and all 10
  `needsReview:` value lines (55-151)
- `src/lib/data/mock-data.ts` — remove all 16 `needsReview: false,` value lines (78-377)
- `src/lib/services/mock-crm-client.ts` — remove `filters.needsReview` filter branch (line 97) and
  `needsReview: false` value (line 136)

**`needs_review` full removal — leads detail page display:**
- `src/routes/leads/[id]/+page.svelte` lines 408-409 — remove the `lead.needsReview ? 'flagged' :
  'clear'` status display block entirely (no replacement — per SPEC Out of Scope, no new signal)

**`needs_review` full removal — tests:**
- `src/tests/leads.spec.ts` — remove `needsReview: false,` fixture field (line 44) and
  `expect(lead.needsReview).toBe(false)` assertion (line 156)
- `src/tests/leads-db.spec.ts` — remove `expect(lead.needsReview).toBe(false)` assertion (line 49)
- `src/tests/import.spec.ts` — update `mapCategory()` tests (lines 70-79) to assert
  `{ category }` only (no `needsReview` in expected shape); update lines 287, 290 report-shape
  assertions (`bazaar.lead.needsReview` / `clay.lead.needsReview`) — these assert on ingest report
  shape, must be removed or replaced per whatever the report type becomes after `needsReviewCount`
  removal (see `scripts/import.ts` above)
- `src/tests/reminders.spec.ts` — remove `needsReview: false,` fixture field (line 47)

**`needs_review` full removal — dev scripts:**
- `scripts/seed.ts` — **[VALIDATE confirmed exact locations]** remove `needsReview: true` fields
  at lines 339 and 351 (leads 20 and 21). Also update the doc comment (line 3, "needs-review
  badges") and the printed usage notes (lines 654, 658 — "`/review` Badge: 2 needs-review leads"
  and "`/unassigned` and `/review` page content...") to drop `/review`/needs-review mentions.
- `scripts/verify-routes.ts` — **[VALIDATE confirmed exact location]** remove the entire "review
  badge (`/review`)" check block (lines 82-88), which queries `crmLeads.needsReview`.

**Drizzle migration:**
- Generate via `bun run db:generate` after the schema.ts edit — produces a new
  `drizzle/NNNN_*.sql` + matching `drizzle/meta/NNNN_snapshot.json`. Review the generated SQL
  before applying: it must be a single `ALTER TABLE crm_leads DROP COLUMN needs_review;` with no
  unintended side effects (Drizzle sometimes bundles unrelated pending schema drift into one
  migration — if that happens, stop and reconcile schema.ts first rather than applying a mixed
  migration). Apply with `bun run db:push` (dev) or `bun run db:migrate` (if a migration-runner
  script is configured — confirm which convention this repo uses before applying, per Drizzle
  conventions in `process/context/all-context.md`). **[VALIDATE confirmed]** `package.json`
  defines both `db:push` (`drizzle-kit push`) and `db:migrate` (`drizzle-kit migrate`) — use
  `db:push` for this dev-only change per existing repo convention (no migration-runner is wired
  to a deploy pipeline yet). **[VALIDATE confirmed]** the current schema snapshot
  (`drizzle/meta/0008_snapshot.json`) shows `needs_review` as a plain `notNull default(false)`
  boolean column with **no index and no FK** — the drop is a clean single-column operation.
  No prior migration file references `needs_review` outside its addition, confirming no other
  migration-time dependents exist (verified beyond static grep — snapshot JSON inspected directly).

## Public Contracts

- `canEditLead(user, lead): boolean` — behavior change: now also returns `true` when
  `lead.ownerId === null`, for ANY authenticated user (not just managers). This is a widened
  contract consumed by `PATCH /api/leads/{id}` (server-enforced) and any UI gating edit affordances.
- `PATCH /api/leads/{id}` — no request/response shape change; only the authorization outcome
  changes for unclaimed leads.
- `mapCategory(value: string): { category: CrmLeadCategory }` — return shape narrows (removes
  `needsReview` key). **[VALIDATE-corrected]** The sole real call site is `scripts/import.ts`
  (line 333). `src/routes/api/leads/ingest/+server.ts` only references `mapCategory` in a code
  comment (line 74) — it does **not** call the function (ingest uses the scraper-supplied enum
  value as-is) — so no code change is needed there for this specific contract.
  `scripts/lib/import-utils.ts` re-exports `mapCategory` unchanged (pure passthrough); the
  narrowed return type flows through automatically with no edit required.
- **[VALIDATE-added]** `POST /api/leads/ingest` response shape narrows: removes the `review` key
  from `{ received, created, skipped, patched, review }`. This is a duplicate/orphaned
  needs-review-style counter (computed independently of the `needsReview:` DB field, using the
  same predicate) that is not covered by `bun run check` since it is a local variable, not a
  schema-typed field — it must be removed explicitly (checklist item 19b) or the ingest endpoint
  will keep silently exposing a "needs attention" signal after `needs_review` removal, which
  violates SPEC's explicit "no replacement signal" requirement (AC8). Consumed only by the
  external scraper client (outside this repo) — best-effort compatibility note, not independently
  testable from this repo.
- **[VALIDATE-added]** `LeadEditModal.svelte` prop contract: `onresolve` changes from a required
  prop (`onresolve: (data: Record<string, unknown>) => void`) to optional
  (`onresolve?: (data: Record<string, unknown>) => void`), and the footer's "Resolve" button
  renders conditionally on `onresolve` being provided. Confirmed via direct read: the modal
  currently renders an unconditional "Resolve" button (line 229 area) whose click handler calls
  `onresolve(parsed.data)` directly (line 110) with no guard. The plan's original checklist item 6
  claimed this component "requires no changes" — that is incorrect; without this fix, either
  `bun run check` fails (required prop omitted) or a dummy handler is passed and the Up for Grabs
  modal shows a meaningless/broken "Resolve" button, contradicting the SPEC's explicit statement
  that "Up for Grabs has no 'resolve' concept." Confirmed the **only** consumer of
  `LeadEditModal.svelte` in the repo is `src/routes/review/+page.svelte`, which is deleted in
  Section B of this same plan — so no other caller is affected by loosening this prop.
- `getNavCounts(userId): Promise<{ overdue: number; unassigned: number }>` — return shape narrows
  (removes `review` key). Consumed by `src/routes/api/nav-counts/+server.ts` and
  `AppShell.svelte`.
- DB schema: `crm_leads.needs_review` column removed — irreversible without a new migration to
  re-add it. No other table references this column (single-table scope). **[VALIDATE confirmed]**
  no index or FK exists on this column per the current schema snapshot.

## Blast Radius

- **Risk class:** schema/migration (DB column drop) + permission logic change (auth-adjacent,
  narrow scope). Per `process/development-protocols/orchestration.md` High-Risk Classes, this
  plan touches "schema/data migration" and "permission... logic" — VALIDATE must apply the
  hybrid-minimum test gate rule for these two areas. **[VALIDATE confirmed]** both are satisfied:
  permission logic exceeds the hybrid floor (Fully-Automated unit tests for both the positive and
  regression case, plus e2e); schema/migration is covered by an explicit Hybrid gate (manual SQL
  diff review + apply) since no DB-integration test harness exists in this repo yet.
- **Files touched:** ~26 files (schema, 2 server data-layer files, 1 permissions file, 1 shared
  component file modified (`LeadEditModal.svelte` — VALIDATE-added), 1 API route file modified +
  2 route files deleted, 4 nav/layout components, 1 skeleton component, 1 types file, 3 mock
  files, 1 lead-detail page, 4 test files, 2 dev scripts, 1 generated migration pair). All within
  `src/` + `scripts/` + `drizzle/` — single package (this is not a monorepo; whole repo is one
  SvelteKit app), so no cross-package blast radius.
  - **Cross-feature note (documented dependency, not resolved by this plan):**
    `process/features/reports/active/reports-echarts-review-queue_29-06-26/` has open AC8/AC9
    targeting `/review` as a deliverable. This plan does not edit that file. **[VALIDATE
    confirmed]** that plan's AC8/AC9, resolve-action design, and DB query text are deeply
    dependent on `/review` and `needs_review` — it becomes fully obsolete once this plan's
    EXECUTE lands (target files deleted, target column dropped). Flag for UPDATE PROCESS to mark
    that plan superseded once this plan's EXECUTE lands — this is correctly deferred, not a
    VALIDATE blocker.
- **Irreversibility:** the DB migration is the only irreversible step (column drop loses data on
  `db:push`/`db:migrate`). All other changes are reversible via git revert. No production data
  concern — dev/staging only per current project state (v0, mock/dev DB).

## Implementation Checklist

### Section A — Widen permission + build inline edit (Up for Grabs)

1. `src/lib/utils/permissions.ts` — in `canEditLead()` (lines 14-18), change:
   ```
   if (isManager(user)) return true;
   return lead.ownerId === user.id;
   ```
   to:
   ```
   if (isManager(user)) return true;
   if (lead.ownerId === null) return true;
   return lead.ownerId === user.id;
   ```
   (Explicit `null` check, not `||` chained into the return, for clarity and to avoid altering the
   existing owner-match line.)
2. `src/routes/unassigned/+page.svelte` — add imports: `LeadEditModal` from
   `$lib/components/leads/LeadEditModal.svelte`. Add state: `let editTarget = $state<Lead | null>(null);`
   `let editSaving = $state(false);`
3. Add `saveEdit()` async function mirroring `src/routes/review/+page.svelte` lines 30-52
   (PATCH `/api/leads/{id}`, on success clear `editTarget`, `invalidateAll()`, toast; on failure
   toast + keep modal open). Up for Grabs has no "resolve" action, so only the plain save path is
   needed (no `saveAndResolve` equivalent).
4. Add click-to-edit affordance: wrap the existing row content (or add an explicit edit
   icon/button per-row) that sets `editTarget = l` on click, without breaking the existing
   `<a href="/leads/{l.id}">` navigation link or the row-select checkbox / claim button
   interactions. Use a distinct small edit-icon button (consistent with the repo's existing
   `Icon` component usage) rather than making the whole row clickable, to avoid conflicting with
   the name-link navigation.
5. Render `<LeadEditModal>` conditionally on `editTarget`, mirroring
   `src/routes/review/+page.svelte` lines 315-324, WITHOUT passing an `onresolve` prop (see
   checklist item 6b — this is now mechanically valid once `onresolve` is made optional).
6. `LeadEditModal.svelte` field/prop contract for `open`, `lead`, `saving`, `onclose`, `onsave` is
   reused unmodified — it accepts a lead with `ownerId === null` without special-casing since it
   only edits shared fields. **Correction: item 6b below is required** — the component is NOT
   fully unmodified; only `onresolve` needs to change.
6b. **[VALIDATE-added — required, not optional]** `src/lib/components/leads/LeadEditModal.svelte`:
    - Change the prop type from `onresolve: (data: Record<string, unknown>) => void;` to
      `onresolve?: (data: Record<string, unknown>) => void;`
    - Guard the call in `handleResolve()`: change `onresolve(parsed.data);` to
      `onresolve?.(parsed.data);`
    - Wrap the footer's "Resolve" `<Button>` in `{#if onresolve}...{/if}` so it only renders when
      a caller supplies the prop.
    - Confirmed sole consumer today is `src/routes/review/+page.svelte` (deleted in Section B) —
      no other caller is affected by this change.

### Section B — Remove `/review` route + nav surfaces

7. Delete `src/routes/review/+page.server.ts` and `src/routes/review/+page.svelte`.
8. `src/lib/components/layout/AppSidebar.svelte` — remove the `/review` nav item object (href,
   label, icon, badge — lines ~52-55) and the `review` key from the `counts` prop type (line 19).
9. `src/lib/components/layout/AppTopbar.svelte` — remove `reviewCount` prop (line 4), the review
   icon button + badge markup (lines 12-21).
10. `src/lib/components/layout/AppShell.svelte` — remove `review` from the `counts` prop type
    (line 14) and the `reviewCount={counts.review}` prop pass to `AppTopbar` (line 22).
11. `src/lib/components/shared/skeletons/RouteShells.svelte` — remove the `isReview` derived
    (line 23) and its skeleton branch (lines 114-116).
12. `src/lib/server/db/leads.ts` — remove `listReviewLeads()` (starting line 367) entirely, and
    update `getNavCounts()` (lines 1048-1075) to drop the `reviewRow` query and `review` field
    from both the return type and the returned object.
13. `src/routes/api/nav-counts/+server.ts` — confirm no direct `review` reference beyond the
    `getNavCounts()` return value it passes through (read during EXECUTE; if it destructures
    `review` explicitly, remove that too).

### Section C — Remove `needs_review` from data/type layer

14. `src/lib/server/db/schema.ts` line 150 — remove the `needsReview` column definition.
15. `src/lib/server/db/leads.ts` — remove `needsReview: row.needsReview` from `dbRowToLead()`
    (line 92) and `needsReview: false` from the insert/seed shape (line 600).
16. `src/lib/types/index.ts` — remove `needsReview: boolean` (line 71) and `needsReview?: boolean`
    (line 126).
17. `src/routes/api/leads/ingest/+server.ts` — update the comment on line 20 (remove
    "needs_review=true" clause) and remove `needsReview:` from the insert payload (line 102).
18. `src/lib/server/import-utils.ts` — narrow `mapCategory()` signature to
    `(value: string): { category: CrmLeadCategory }`; both return statements (lines 104, 107-108)
    drop `needsReview`.
19. `scripts/import.ts` — update the `mapCategory()` call site to destructure only `{ category }`
    (line 333 area, removing `catReview`); remove the `needsReview = catReview || !hasSocials`
    line (337) and the `needsReview,` field on the insert payload (line 352); remove
    `needsReviewCount` from the report type (line 386), its computation (line 420), and its
    inclusion in the final report object (line 558).
19b. **[VALIDATE-added — required]** `src/routes/api/leads/ingest/+server.ts` — in addition to
    item 17, remove the `review` counter entirely: the `let review = 0;` declaration, the
    increment block (`if (!lead.category || lead.category === 'Other' || (!lead.url && ...))
    review++;`), and the `review` field in the handler's final `json({ received, created, skipped,
    patched, review })` response. This is a duplicate needs-review-style signal computed
    independently of the DB field and is NOT caught by `bun run check` (it's a local variable, not
    schema-typed) — leaving it in place silently reintroduces a "needs attention" signal via the
    API response after `needs_review` is otherwise fully removed.
20. `src/lib/server/mock.ts` — remove the `needsReview: boolean` type field (line 41) and all 10
    `needsReview:` value lines from mock fixtures.
21. `src/lib/data/mock-data.ts` — remove all 16 `needsReview: false,` value lines.
22. `src/lib/services/mock-crm-client.ts` — remove the `filters.needsReview` filter branch
    (line 97) and the `needsReview: false` value (line 136).
23. `src/routes/leads/[id]/+page.svelte` — remove the flagged/clear status display block
    (lines 408-409) that reads `lead.needsReview`.
24. `scripts/seed.ts` and `scripts/verify-routes.ts` — **[VALIDATE confirmed exact lines]**
    `scripts/seed.ts`: remove `needsReview: true` at lines 339 and 351; update doc comment (line
    3) and printed usage notes (lines 654, 658) that mention "needs-review"/`/review`.
    `scripts/verify-routes.ts`: remove the entire "review badge (`/review`)" check block
    (lines 82-88).

### Section D — Migration

25. Run `bun run db:generate`. Read the generated SQL diff. Confirm it is exactly
    `ALTER TABLE "crm_leads" DROP COLUMN "needs_review";` (or equivalent single-column drop) with
    no unrelated schema drift bundled in. If unrelated drift appears, stop and reconcile
    `schema.ts` against the DB before proceeding — do not apply a mixed migration. **This step is
    the Hybrid test gate for the schema/migration high-risk class — see Verification Evidence.**
26. Apply the migration (`bun run db:push` for dev — confirmed via `package.json` this is the dev
    convention; `db:migrate` exists but no migration-runner pipeline is wired to it yet).

### Section E — Tests

27. `src/tests/leads.spec.ts` — remove `needsReview: false,` fixture field (line 44) and the
    `expect(lead.needsReview).toBe(false)` assertion (line 156).
28. `src/tests/leads-db.spec.ts` — remove `expect(lead.needsReview).toBe(false)` assertion
    (line 49).
29. `src/tests/import.spec.ts` — update `mapCategory()` unit tests (lines 70-79) to assert
    `{ category }` only; update or remove the ingest-report assertions at lines 287 and 290
    (`bazaar.lead.needsReview` / `clay.lead.needsReview`) to match the new report shape (no
    `needsReviewCount`).
30. `src/tests/reminders.spec.ts` — remove `needsReview: false,` fixture field (line 47).
31. Add unit test coverage for the widened `canEditLead()` in `src/tests/leads.spec.ts` (co-locate
    near existing permission-adjacent assertions, or create a dedicated block): (a) rep can edit
    an unclaimed lead (`ownerId: null`); (b) rep cannot edit a claimed lead owned by someone else
    (regression case — must still return `false`); (c) manager can still edit anything
    (unchanged, but assert to lock the contract).
32. **[VALIDATE-corrected file path]** Add the first Playwright e2e spec for this repo —
    `e2e/ufg-inline-edit.e2e.ts` (NOT `src/tests/e2e/...spec.ts` as originally drafted — VALIDATE
    confirmed `playwright.config.ts` uses `testMatch: '**/*.e2e.{ts,js}'`, and an existing e2e
    spec already establishes the repo-root `e2e/` directory + `.e2e.ts` suffix convention:
    `e2e/loading-ux.e2e.ts`. The original plan's claim "no prior e2e specs exist to pattern-match
    against" was incorrect — use `e2e/loading-ux.e2e.ts` as the structural reference). Scenario:
    navigate to `/unassigned`, click the edit affordance on an unclaimed lead, change a field
    (e.g. category), save, assert the row reflects the new value without a full navigation event,
    assert no `/review` route exists (visiting `/review` does not render Review Queue UI — 404 or
    SvelteKit's default not-found handling, confirm actual behavior once the route files are
    deleted). Also assert the "Resolve" button is absent from the inline edit modal (confirms
    checklist item 6b landed correctly).
33. **[VALIDATE-corrected file path]** Add e2e coverage (same or a second scenario) for the
    discard flow on `/leads/[id]` at `e2e/leads-discard.e2e.ts` (same naming-convention correction
    as item 32) — this is largely a **confirmation test** per the MUST-VERIFY finding above
    (feature already implemented), not new UI: open a lead detail page, trigger discard, confirm,
    assert `deletedAt` is set / lead disappears from active lists.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| New e2e: Up for Grabs inline-edit flow (`e2e/ufg-inline-edit.e2e.ts`) | Fully-Automated | AC1 |
| Same e2e — asserts row updates post-save, no navigation event | Fully-Automated | AC2 |
| `src/tests/optimistic.spec.ts` (existing, reused pattern — no new file needed; confirms optimistic-update helper behavior already covers the shape used by `saveEdit()`) | Fully-Automated | AC2 (supporting) |
| Unit test: `canEditLead` — rep can edit unclaimed lead (new, `leads.spec.ts`) | Fully-Automated | AC3 |
| Same e2e run under a rep session (auth fixture) | Fully-Automated | AC3 |
| Unit test: `canEditLead` — rep cannot edit claimed lead owned by another (new, `leads.spec.ts`) | Fully-Automated | AC4 |
| e2e: visiting `/review` does not render old UI (post route-deletion) | Fully-Automated | AC5 |
| `src/tests/leads.spec.ts` — confirm no `listReviewLeads` reference remains | Fully-Automated | AC5 |
| Component check: `AppSidebar.svelte` / `AppTopbar.svelte` markup has no `/review` link/badge | Hybrid (manual visual confirm + grep gate — no existing component-snapshot test infra in this repo; grep gate is the automatable half) | AC6 |
| e2e: discard flow on `/leads/[id]` (new — confirmation test per MUST-VERIFY finding 2, `e2e/leads-discard.e2e.ts`) | Fully-Automated | AC7 |
| `bun run check` (TypeScript compile) | Fully-Automated | AC8 |
| `grep -rn "needs_review\|needsReview" src/ scripts/` returns no matches | Fully-Automated | AC8 |
| **[VALIDATE-added]** `grep -n "review" src/routes/api/leads/ingest/+server.ts` returns no matches (confirms the orphaned `review` counter/field from checklist item 19b is fully removed) | Fully-Automated | AC8 |
| **[VALIDATE-added]** Manual SQL diff review of `bun run db:generate` output confirms a single `ALTER TABLE ... DROP COLUMN needs_review` statement, then `bun run db:push` applies cleanly against a dev DB | Hybrid — precondition: dev Postgres running, `DATABASE_URL` set (satisfies the schema/migration high-risk-class hybrid-minimum requirement) | AC8 (schema/migration portion) |
| `src/tests/import.spec.ts` updated `mapCategory()` assertions | Fully-Automated | AC8 (supporting) |
| Unit test: nav-counts function/endpoint return shape has no `review` key (new, co-locate near existing nav-counts test if one exists, else add to `leads-db.spec.ts`) | Fully-Automated | AC9 |
| `bun run test:unit` — full suite green, including updated `import.spec.ts`, `leads.spec.ts`, `leads-db.spec.ts`, `reminders.spec.ts` | Fully-Automated | AC10 |
| **[VALIDATE-added]** `e2e/ufg-inline-edit.e2e.ts` asserts the "Resolve" button is absent from the Up for Grabs inline-edit modal (confirms checklist item 6b's conditional-render fix landed) | Fully-Automated | AC1 (supporting — confirms no stray Review Queue affordance leaked into the reused component) |

## Post-Phase Testing

See `process/context/tests/all-tests.md` for the runner/command conventions applied above. Section E of the Implementation Checklist plus the Verification Evidence table constitute the Test Procedure for this plan.

## Test Infra Improvement Notes

- This is the **first Playwright e2e spec added under the established `e2e/*.e2e.ts` convention
  for THIS feature** (`e2e/loading-ux.e2e.ts` already exists as the pattern — VALIDATE corrected
  the plan's original claim that no e2e specs existed). `bun run test:e2e` (`playwright install &&
  playwright test`) is wired in `package.json` and matches `testMatch: '**/*.e2e.{ts,js}'` in
  `playwright.config.ts` — confirmed the new files will actually be picked up.
- No existing component-snapshot or markup-assertion test pattern exists for `AppSidebar.svelte` /
  `AppTopbar.svelte` (AC6) — the plan uses a grep-gate + manual visual confirm as a Hybrid
  substitute. If this repo later adopts a component test harness (e.g. `@testing-library/svelte`),
  AC6 should be upgraded to Fully-Automated.
- No DB-integration test harness exists in this repo (`process/context/tests/all-tests.md` §Known
  Gaps) — this is why the migration-apply step is a Hybrid gate rather than Fully-Automated. This
  is a pre-existing repo-wide gap, not something introduced by this plan.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_PLAN_01-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (this document updated in place with
   VALIDATE-added fixes). No EXECUTE steps started.
3. **Validate-contract status:** written — see `## Validate Contract` below. Gate: PASS.
4. **Supporting context files loaded:** SPEC (source doc, see header), `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `src/lib/utils/permissions.ts`, `src/routes/api/leads/[id]/+server.ts`,
   `src/routes/review/+page.svelte`, `src/routes/review/+page.server.ts`,
   `src/routes/unassigned/+page.svelte`, `src/routes/leads/[id]/+page.svelte` (discard wiring
   confirmation), `src/lib/server/db/schema.ts`, `src/lib/server/db/leads.ts`,
   `src/lib/server/import-utils.ts`, `scripts/lib/import-utils.ts`,
   `src/routes/api/leads/ingest/+server.ts`, `scripts/import.ts`, `scripts/seed.ts`,
   `scripts/verify-routes.ts`, `src/lib/components/layout/{AppSidebar,AppTopbar,AppShell}.svelte`,
   `src/lib/components/shared/skeletons/RouteShells.svelte`, `src/lib/components/leads/LeadEditModal.svelte`,
   mock files (`mock.ts`, `mock-data.ts`, `mock-crm-client.ts`), `src/lib/types/index.ts`,
   `src/lib/zod/schemas.ts`, `playwright.config.ts`, `package.json`,
   `drizzle/meta/0008_snapshot.json`, all 4 named test spec files, the conflicting
   `reports-echarts-review-queue` plan.
5. **Next step for a fresh agent picking up mid-execution:** EXECUTE Section A → B → C → D → E in
   order (D — the migration — must happen after C's schema.ts edit, before E's test run, since
   tests may hit the DB). All previously-flagged MUST-VERIFY-AT-EXECUTE items for
   `scripts/seed.ts` / `scripts/verify-routes.ts` are now resolved with exact line numbers (see
   checklist item 24) — no further discovery needed there. Item 6b (`LeadEditModal.svelte`) is
   REQUIRED, not optional — do not skip it.

## Validate Contract

Status: PASS
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 3/7 (S1 no — single package; S2 yes — schema+permission surface; S6 yes — schema/migration + permission high-risk classes present; S7 yes — 26 files in blast radius; S3/S4/S5 no). Score is MEDIUM band by count, but this VALIDATE pass was executed as a single deep-investigation sequential pass rather than a Layer1/Layer2 parallel fan-out, because the plan is a single SIMPLE plan (not a phase program) and the highest-value activity was direct source verification of MUST-VERIFY claims (permission enforcement, component prop contracts, ingest route logic, migration snapshot) rather than breadth-parallelized dimension review. All four Layer 1 dimensions and all five Layer 2 sections were still evaluated (see Dimension findings below), just via one continuous investigation rather than concurrent subagents. For EXECUTE, recommend sequential (checklist-ordered Section A→B→C→D→E execution, single execute-agent) given the plan explicitly requires strict cross-section ordering (D after C, before E).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Inline editor opens on Up for Grabs row click, no navigation | Fully-Automated | `bun run test:e2e` — `e2e/ufg-inline-edit.e2e.ts` | A |
| AC2 | Save persists + updates row without full reload | Fully-Automated | `bun run test:e2e` (same spec) + `bun run test:unit -- src/tests/optimistic.spec.ts` | A |
| AC3 | Rep can edit unclaimed lead | Fully-Automated | `bun run test:unit -- src/tests/leads.spec.ts` (new `canEditLead` case) + e2e rep-session run | A |
| AC4 | Rep cannot edit claimed lead owned by another (regression) | Fully-Automated | `bun run test:unit -- src/tests/leads.spec.ts` (new regression case) | A |
| AC5 | `/review` route no longer resolves | Fully-Automated | `bun run test:e2e` (404/removed check) + `bun run test:unit -- src/tests/leads.spec.ts` (no `listReviewLeads` ref) | A |
| AC6 | No nav surface links to `/review`, no needs-review badge | Hybrid — precondition: none (grep is automatable; visual confirm is manual) | `grep -rn "/review\|reviewCount\|isReview" src/lib/components/layout/ src/lib/components/shared/skeletons/` returns no matches + manual visual confirm noted in phase report | A |
| AC7 | Discard action available on `/leads/[id]` | Fully-Automated | `bun run test:e2e` — `e2e/leads-discard.e2e.ts` | A |
| AC8 | `needs_review` fully removed from schema + all code | Fully-Automated + Hybrid | `bun run check` + `grep -rn "needs_review\|needsReview" src/ scripts/` (no matches) + `grep -n "review" src/routes/api/leads/ingest/+server.ts` (no matches) + Hybrid: manual `db:generate` SQL diff review + `db:push` apply | A |
| AC9 | `getNavCounts` no longer exposes review count | Fully-Automated | `bun run test:unit -- src/tests/leads-db.spec.ts` (new nav-counts shape assertion) | A |
| AC10 | Updated spec files (`import`, `leads`, `leads-db`, `reminders`) all pass | Fully-Automated | `bun run test:unit` (full suite) | A |

Legacy line form (retained so existing validate-contract consumers still parse):
- Permission (`canEditLead`): Fully-automated: `bun run test:unit -- src/tests/leads.spec.ts` (new unclaimed-lead + regression cases) | hybrid: n/a — exceeds hybrid floor | agent-probe: n/a | known-gap: none
- Inline edit e2e flow: Fully-automated: `bun run test:e2e` (`e2e/ufg-inline-edit.e2e.ts`, new) | hybrid: n/a | agent-probe: n/a | known-gap: none — first e2e spec landed under confirmed `e2e/*.e2e.ts` convention
- Discard flow confirmation: Fully-automated: `bun run test:e2e` (`e2e/leads-discard.e2e.ts`, new) | hybrid: n/a | agent-probe: n/a | known-gap: none
- `needs_review` removal completeness: Fully-automated: `bun run check` + `grep -rn "needs_review\|needsReview" src/ scripts/` + `grep -n "review" src/routes/api/leads/ingest/+server.ts` | hybrid: manual `db:generate`/`db:push` SQL review + apply | agent-probe: n/a | known-gap: none
- Nav badge/link removal (AC6): Fully-automated: `grep -rn "/review\|reviewCount\|isReview" src/lib/components/layout/ src/lib/components/shared/skeletons/` | hybrid: manual visual confirm (no component-snapshot infra in this repo) — precondition: `bun run dev` running locally | agent-probe: n/a | known-gap: none (documented Test Infra Improvement Note for future upgrade to Fully-Automated)
- Full regression suite: Fully-automated: `bun run test:unit` | hybrid: n/a | agent-probe: n/a | known-gap: none

Failing stubs (Fully-Automated rows):

```
test("should open inline editor on Up for Grabs row click without navigating", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1 — e2e/ufg-inline-edit.e2e.ts")
})
test("should persist save and update row without full page reload", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2 — e2e/ufg-inline-edit.e2e.ts")
})
test("should allow a rep to edit an unclaimed lead (ownerId === null)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3 — src/tests/leads.spec.ts canEditLead case")
})
test("should NOT allow a rep to edit a claimed lead owned by another rep", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4 — src/tests/leads.spec.ts canEditLead regression case")
})
test("should not render the old Review Queue UI when visiting /review", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5 — e2e/ufg-inline-edit.e2e.ts")
})
test("should complete the discard flow from the lead detail page", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7 — e2e/leads-discard.e2e.ts")
})
test("should expose no needs_review/review references anywhere after removal", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8 — grep gates + bun run check")
})
test("should return nav counts with no review key from getNavCounts", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC9 — src/tests/leads-db.spec.ts")
})
```

Dimension findings:
- Infra fit: PASS — single SvelteKit app, no container/infra/port surfaces touched; `bun` scripts for check/test/db all confirmed present in `package.json`.
- Test coverage: CONCERN → fixed in plan — e2e spec location/naming (`src/tests/e2e/*.spec.ts`) did not match the confirmed Playwright `testMatch: '**/*.e2e.{ts,js}'` pattern and would have silently produced 0 matched tests (false-green risk) on 5 of 10 ACs; corrected to `e2e/*.e2e.ts` matching the existing `e2e/loading-ux.e2e.ts` precedent, which the original plan incorrectly claimed did not exist.
- Breaking changes: CONCERN → fixed in plan — (1) `mapCategory` call-site claim was inaccurate (ingest route only comments on it, doesn't call it) — corrected, no functional risk; (2) ingest route's `review` counter/response-field was an unlisted orphaned needs-review-style signal not caught by `bun run check` — added as required checklist item 19b + new grep gate, closing a real SPEC-violation risk (AC8's "no replacement signal" requirement).
- Security surface: CONCERN → fixed in plan — server-side `canEditLead` enforcement in the PATCH handler was verified accurate (no broken-access-control risk). Separately, `LeadEditModal.svelte`'s `onresolve` prop is required (not optional) and the modal unconditionally renders a "Resolve" button wired to it — reusing the component "unmodified" as originally planned would either fail `bun run check` or leak a broken/meaningless "Resolve" affordance into Up for Grabs, contradicting the SPEC. Fixed via checklist item 6b (make `onresolve` optional, conditionally render the button); confirmed the only consumer of this component is the page being deleted in this same plan, so no other caller is affected.
- Section A feasibility (permission + inline edit): CONCERN → fixed — mechanically feasible once item 6b lands; gap was the `LeadEditModal` prop contract (see Security surface above); no conflicts with repo conventions found.
- Section B feasibility (route/nav removal): PASS — all edit targets confirmed to exist at the stated (or near-stated) locations via direct file reads (AppSidebar, AppTopbar, AppShell, RouteShells, getNavCounts); no gaps found.
- Section C feasibility (needs_review data/type layer removal): CONCERN → fixed — ingest route `review` counter gap (see Breaking changes above) was the significant finding; all other ~15 touchpoints in this section confirmed accurate by direct read (schema.ts, leads.ts, types/index.ts, both mock files, mock-crm-client.ts, leads/[id] display block, all 4 test spec files); highest-risk edit is the schema.ts column drop, mitigated by the Section D SQL-diff-review step.
- Section D feasibility (migration): PASS — confirmed no index/FK on `needs_review` via direct inspection of `drizzle/meta/0008_snapshot.json` (exceeds the plan's own static-grep-only claim); `db:generate`/`db:push`/`db:migrate` scripts all confirmed present in `package.json` exactly as described.
- Section E feasibility (tests): CONCERN → fixed — e2e file path/naming convention mismatch (see Test coverage above) was the highest-risk finding in this plan; all other test-file touchpoints (leads.spec.ts, leads-db.spec.ts, import.spec.ts, reminders.spec.ts) confirmed accurate by direct read.

Open gaps: none unresolved — all 4 substantive CONCERNs found during VALIDATE (e2e naming/location, ingest `review` counter, `LeadEditModal` `onresolve` prop, `mapCategory` call-site precision) were fixed directly in the plan text above (checklist items 6b, 19b; corrected items 32-33; corrected Public Contracts and Blast Radius sections). `scripts/seed.ts` / `scripts/verify-routes.ts` exact line numbers (previously flagged as MUST-VERIFY-AT-EXECUTE) are now resolved with confirmed line numbers, removing that EXECUTE-time discovery risk.

What this coverage does NOT prove:
- The Fully-Automated e2e gates (AC1, AC2, AC3, AC5, AC7) prove the happy-path flows and the specific assertions written into the two new spec files. They do NOT prove every possible field-edit combination in `LeadEditModal` works from Up for Grabs (only the scenario fields chosen for the spec, e.g. category) — other editable fields (location, platform, socials, event fields) are exercised by the reused, already-tested `PATCH /api/leads/{id}` handler and existing Zod schema validation, but not independently re-asserted from the Up for Grabs UI context.
- The AC6 Hybrid gate (nav-link grep + manual visual confirm) proves the markup no longer contains `/review`/`reviewCount`/`isReview` references and relies on a human confirming the rendered UI looks correct — it does NOT prove pixel-perfect layout stability after removing the review nav item (e.g., possible flex/spacing shift in `AppTopbar.svelte` from removing one icon button). No visual regression tooling exists in this repo to catch that automatically.
- The AC8 migration Hybrid gate proves the generated SQL is a clean single-column drop and applies successfully to a dev database. It does NOT prove behavior against a production-scale dataset or under concurrent writes during the drop — acceptable per this plan's documented Irreversibility note (dev/staging only, v0 project state, no production data yet).
- The `bun run check` + grep gates for AC8 prove no lingering **source-code** references to `needs_review`/`needsReview`/the ingest `review` field. They do NOT prove the DB migration itself was applied in any given environment — that is the separate Hybrid gate above, and both must be confirmed together per the plan's own VERIFIED completion rule.
- No test in this plan proves the cross-feature consequence (the `reports-echarts-review-queue` plan becoming obsolete) — that is explicitly deferred to UPDATE PROCESS per the Blast Radius section, not a gap in this plan's own coverage.

Gate: PASS (no FAILs; all 4 identified CONCERNs fixed directly in the plan text during this VALIDATE pass — see Dimension findings and Open gaps above)
Accepted by: session (VALIDATE pass, 01-07-26) — all CONCERNs resolved via plan-text fixes rather than left as accepted residual gaps; no CONDITIONAL acceptance was required.

## Autonomous Goal Block

```
SESSION GOAL: Ship inline field editing on Up for Grabs (/unassigned) and fully remove the Review Queue (/review) + needs_review flag (GitHub #90)
Charter + umbrella plan: N/A — single SIMPLE plan, not a phase program
Autonomy: Standard RIPER-5 gates apply (no standing /goal for this task). EXECUTE requires explicit "ENTER EXECUTE MODE". Within EXECUTE, execute-agent may proceed section-by-section (A->B->C->D->E, strict order) without re-pausing between checklist items, since VALIDATE resolved all open CONCERNs and no architecture decisions remain.
Hard stop conditions / safety constraints:
- Do not apply the Drizzle migration (db:generate output) if the generated SQL is anything other than a single ALTER TABLE ... DROP COLUMN needs_review statement — stop and reconcile schema.ts first (checklist item 25).
- Do not skip checklist item 6b (LeadEditModal.svelte onresolve prop fix) — omitting it either breaks bun run check or ships a broken/meaningless "Resolve" button into Up for Grabs.
- Do not skip checklist item 19b (ingest route review counter removal) — omitting it silently re-introduces a "needs attention" signal via the public ingest API response, violating the SPEC's explicit no-replacement-signal requirement.
- This plan does not touch or archive process/features/reports/active/reports-echarts-review-queue_29-06-26/ — that supersession is explicitly deferred to UPDATE PROCESS, not this EXECUTE pass.
- No production data is at risk (dev/staging only, v0 project state) but the column drop is irreversible without a new migration — confirm dev DB target before running db:push.
Next phase: EXECUTE — process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_PLAN_01-07-26.md
Validate contract: inline in plan (see ## Validate Contract section above)
Execute start: fully-auto: bun run check then bun run test:unit | hybrid: bun run db:generate (review SQL diff) then bun run db:push against dev DB, plus manual visual confirm of AppSidebar/AppTopbar (AC6) | e2e probe: bun run test:e2e (e2e/ufg-inline-edit.e2e.ts, e2e/leads-discard.e2e.ts) | high-risk pack: no (schema/permission risk is dev-only, no production data, evidence pack not required — see Blast Radius Irreversibility note)
```

## UPDATE PROCESS Closeout Note (01-07-26)

EVL confirmation run (independent of execute-agent self-report) confirmed green:
`bun run check`, `bun run test:unit`, AC8 grep gate, item-19b grep gate, AC6 grep gate,
migration SQL content review, Playwright `--list` discovery of both new e2e specs.

**Classification:** Keep in active/testing — code-complete, migration + full e2e run
deferred (see Status block above). NOT archived to `completed/`.

**Explicit next actions for the user:**
1. Run `bun run db:push` against the dev DB to apply `drizzle/0009_mushy_vapor.sql`.
2. Run `bun run test:e2e` in a built + seeded + preview environment, and manually confirm
   the AC6 visual check (`AppSidebar`/`AppTopbar` layout after icon removal).

Once both are done, this plan is eligible for archival to `completed/` (task folder moves
as a unit — plan + spec + report).

**Cross-feature supersession:** `process/features/reports/active/reports-echarts-review-queue_29-06-26/`
has been marked superseded by this plan's EXECUTE landing (its AC8/AC9 target `/review` and
`needs_review`, both now removed). See that plan's header note.
