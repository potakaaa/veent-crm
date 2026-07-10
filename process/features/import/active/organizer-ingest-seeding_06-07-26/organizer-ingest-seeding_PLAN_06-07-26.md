---
name: plan:organizer-ingest-seeding
description: Auto-create/link organizer records during lead ingest, one-time backfill for existing leads, and dev-seed sample organizer data
date: 06-07-26
feature: import
---

# PLAN — Organizer Creation & Backfill for Import/Ingest Pipeline

**Date**: 06-07-26
**Complexity**: Simple
**Status**: ⏳ PLANNED

Spec: `process/features/import/active/organizer-ingest-seeding_06-07-26/organizer-ingest-seeding_SPEC_06-07-26.md`

## Phase Completion Rules

This is a SIMPLE, single-session plan — no phase gates. "Done" = all 5 Implementation
Checklist items complete, their per-section test gates green (see Verification Evidence),
and the Validate Contract gate is PASS or an explicitly accepted CONDITIONAL. Code-only
completion (checklist items written, gates not yet run) is "CODE DONE", never "VERIFIED".

## Overview

Add a single shared `findOrCreateOrganizer()` function and wire it into three call sites:
live ingest (`/api/leads/ingest`), a new one-time backfill script, and `scripts/seed.ts`.
No schema changes. No new dependencies. Matching is case-insensitive `normalizedHandle`
lookup (find-then-create, no DB constraint, matches existing lead-dedup risk tolerance).

## Goals

1. New leads ingested from the scraper get auto-linked to a found-or-created organizer.
2. Existing leads get the same linkage via a one-time, idempotent, re-runnable backfill script.
3. Local dev seed shows sample organizer data out of the box.
4. Zero duplicated find-or-create logic — one function, three callers.
5. Zero behavior change to: ingest response shape/secret-auth, manual organizer-tagging
   endpoint, or the three existing organizer read functions.

## Scope

In scope: `src/lib/server/db/organizer-find-or-create.ts` (new export — see PVL fix Deviation
Note below), `src/routes/api/leads/ingest/+server.ts` (wire-in), `scripts/backfill-organizers.ts`
(new file), `scripts/seed.ts` (small addition), `src/tests/leads-ingest-organizer-db.spec.ts` (new).

Out of scope (confirmed, see Deviation Note below): `scripts/import.ts` (TSV importer),
any DB migration/constraint, `scraperOrgId` as a dedup key, organizer CRUD UI, reconciliation
of manually-tagged organizers with a different computed handle.

## Acceptance Criteria

Carried verbatim from the locked SPEC (`organizer-ingest-seeding_SPEC_06-07-26.md`) — AC1
through AC10. Each is mapped to a proving gate in `## Verification Evidence` below; none are
modified or reduced by this plan. See the SPEC file for full AC text; summary:

1. **AC1** — new lead, no matching organizer → creates one, links it.
2. **AC2** — new lead, matching organizer exists → reuses it, no duplicate.
3. **AC3** — duplicate-lead path is unaffected (no organizer side-effect).
4. **AC4** — ingest response shape / secret-auth contract unchanged.
5. **AC5** — backfill links every eligible existing lead.
6. **AC6** — backfill is idempotent (safe re-run, no-op on second pass).
7. **AC7** — backfill does not touch leads that already have an organizer.
8. **AC8** — backfill gracefully skips + counts leads with no usable handle.
9. **AC9** — dev-seed produces sample organizer data with linked leads.
10. **AC10** — `/organizers` page + manual-tagging endpoint unaffected, render new data via
    existing unmodified read queries.

## Deviation Note — `scripts/import.ts` confirmation (resolves SPEC Open Question)

Checked: `package.json` still exposes `"import": "bun run scripts/import.ts"`, and the script
is a fully-formed one-time TSV pipeline (dry-run/--load flags, its own organizer-level MERGE
logic at the lead-grouping stage). No evidence of scheduled/ongoing invocation was found
(no cron reference, no CI job, no other script or route imports it) — it is a manually-run,
one-time historical tool, consistent with the SPEC's default assumption.
**Decision: confirmed out of scope, no deviation, no user check-in needed.** If real
ongoing use is discovered later, wiring `findOrCreateOrganizer()` into it is a small
follow-up (its handle/merge logic already produces the same shape of input this plan's
function needs).

## Deviation Note — no pre-existing ingest regression suite

The SPEC's AC3/AC4 proving strategy assumed an existing `src/tests/leads-ingest-db.spec.ts`
regression suite. **No such file exists** (`find`/`grep` over `src/tests/` confirms zero
ingest test files today — only `schemas.spec.ts` touches ingest, and only at the schema
level). This plan creates ingest test coverage from scratch in the single new
`leads-ingest-organizer-db.spec.ts` file, covering both the new organizer-linking behavior
AND a baseline duplicate-path regression case (AC3), rather than modifying a pre-existing
suite. This is a net-positive test-infra improvement, not a scope reduction — see
`## Test Infra Improvement Notes`.

## Deviation Note — `findOrCreateOrganizer` moved to a new standalone file (PVL fix)

VALIDATE (V2 Layer 2, mechanical feasibility check) found and reproduced a real break: this
plan originally proposed adding `findOrCreateOrganizer()` as an export of the *existing*
`src/lib/server/db/organizers.ts`. That file has a top-level `import { db } from './index'`,
and `./index.ts` has a top-level `import { env } from '$env/dynamic/private'` — a SvelteKit
virtual module that only resolves inside SvelteKit's Vite pipeline. It does **not** resolve
under plain `bun run scripts/*.ts` execution (confirmed by direct reproduction: a probe script
importing `organizers.ts` throws `error: Cannot find module '$env/dynamic/private'`). Since
`scripts/backfill-organizers.ts` and `scripts/seed.ts` both run via bare `bun scripts/*.ts` (no
Vite/SvelteKit context — see `package.json`'s `"seed"` script), importing `findOrCreateOrganizer`
from `organizers.ts` would crash both scripts at import time, before any DB call. Neither
existing backfill script (`backfill-event-dates.ts`, `backfill-reps.ts`) imports `db/index.ts`
for exactly this reason — both import `schema.ts` directly (zero `$env` dependency, confirmed)
and construct their own standalone `postgres()`+`drizzle()` client.

**Fix:** `findOrCreateOrganizer(input, dbClient)` lives in a new file,
`src/lib/server/db/organizer-find-or-create.ts`, importing only `crmOrganizers` from `./schema`
+ `sql` from `drizzle-orm` (no `$env`, no `./index`). It takes the DB client as an explicit
parameter typed via a **type-only** import (`import type { db } from './index'; type Db =
typeof db;` — type-only imports are erased at compile time and do not trigger the runtime `$env`
import; confirmed by reproduction). Callers:
- Ingest route (`+server.ts`): passes its own already-imported `db` (SvelteKit context — safe).
- `scripts/backfill-organizers.ts`: constructs its own standalone client (same pattern as
  `backfill-reps.ts`) and passes it in.
- `scripts/seed.ts`: passes its own already-existing local `db` variable (already constructed
  standalone at the top of the script — no new client needed).

This still satisfies Goal #4 ("one function, three callers") and the Constraint "must not
modify `organizers.ts`'s existing read functions" — `organizers.ts` is untouched entirely.

## Deviation Note — AC9 proving mechanism differs from SPEC (documented, not silent)

The locked SPEC names `src/tests/seed-organizers.spec.ts` as AC9's proving artifact. This plan
does not create that file — `scripts/seed.ts` is a non-modular, side-effecting top-level script
(no exported functions to import into a spec, same shape as `backfill-reps.ts`/
`backfill-event-dates.ts`), so there is no cheap unit-level hook to assert against without
running the whole script against a real DB. The one repo precedent for testing a seed script's
*logic* (`seed-templates.spec.ts`) works only because `scripts/seed-templates.ts` has an
extracted pure-function core (`buildSeedRows()`, `rewriteTokens()`); this plan's organizer-seed
addition has no equivalent pure logic to extract — it is 2 calls to the already-unit-tested
`findOrCreateOrganizer()` (covered by AC1/AC2 in `leads-ingest-organizer-db.spec.ts`) plus
setting `organizerId` on 3 known seed-lead objects. AC9 is instead proven by the manual Hybrid
step in `## Verification Evidence` (run `bun run scripts/seed.ts`, check `/organizers` page or
`listOrganizersWithLeadCount()`), consistent with the pre-existing repo-wide gap in `## Known Gap`
below. This is a scoped, justified substitution, not a silent test-coverage reduction.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/organizer-find-or-create.ts` | **New file** (not `organizers.ts` — see PVL fix Deviation Note above). Houses `findOrCreateOrganizer(input, dbClient)`. Imports only `crmOrganizers` from `./schema` + `sql` from `drizzle-orm` — zero `$env`/SvelteKit dependency, safe from both plain `bun run scripts/*.ts` and SvelteKit routes. |
| `src/lib/server/db/organizers.ts` | **No changes.** Existing read exports (`listOrganizersWithLeadCount`, `getOrganizer`, `listLinkedLeadsForOrganizer`) untouched. |
| `src/routes/api/leads/ingest/+server.ts` | Import `findOrCreateOrganizer` from the new file; call it on the new-lead path only, before the `crmLeads` insert, passing the route's own already-imported `db`; set `organizerId` on the insert. Best-effort try/catch. |
| `scripts/backfill-organizers.ts` | New file. `--dry-run`/`--load` flag pattern mirrored from `scripts/backfill-event-dates.ts`. Constructs its own standalone `postgres()`+`drizzle()` client (matching `backfill-reps.ts`/`backfill-event-dates.ts` convention) and passes it to `findOrCreateOrganizer`. |
| `scripts/seed.ts` | Add sample organizer creation via `findOrCreateOrganizer()` (imported from the new file, called with `seed.ts`'s own already-existing local `db` client) + set `organizerId` on 2–3 existing seed leads before insert. |
| `src/tests/leads-ingest-organizer-db.spec.ts` | New Hybrid `*-db.spec.ts`, `SKIP_DB`-gated. |

Not touched (explicitly, per Constraints): `PATCH /api/leads/[id]/organizer`, `listOrganizersWithLeadCount`/`getOrganizer`/`listLinkedLeadsForOrganizer`, `scripts/import.ts`, `src/lib/server/db/schema.ts` (no migration).

## Public Contracts

- **New export**: `findOrCreateOrganizer(input, dbClient): Promise<string>` in
  `src/lib/server/db/organizer-find-or-create.ts` (new file — see PVL fix Deviation Note; not
  `organizers.ts`). `dbClient` is typed via a type-only import of `db`'s shape from `./index`
  (`import type { db } from './index'; type Db = typeof db;`) — erased at compile time, so the
  module has zero runtime `$env` dependency. Input shape:
  ```
  {
    normalizedHandle: string;
    name: string;
    socialFacebook?: string | null;
    socialInstagram?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
  }
  ```
  Returns the organizer's `id` (existing or newly-created). Never throws on "not found" — only
  throws on a real DB error, which callers must catch (ingest) or let propagate (backfill —
  intentional, so a real DB failure stops the run instead of silently skipping rows).
- **Ingest endpoint contract unchanged**: request schema (`ingestBatchSchema`), response shape
  (`{ received, created, skipped, patched }`), and secret-auth check are untouched (AC4).
- **New CLI**: `bun run scripts/backfill-organizers.ts --dry-run|--load`, prints a summary
  (`N leads linked, M organizers created, K leads skipped`).

## Blast Radius

- 6 files changed/added (1 new pure module: `organizer-find-or-create.ts`; 1 modified:
  ingest/+server.ts; 2 new: backfill script, test file; 1 small addition: seed.ts;
  `organizers.ts` is untouched per the PVL fix Deviation Note).
- Risk class: none of the high-risk classes (no auth, no billing, no schema/migration, no public
  API contract change, no deploy/container surface, no secrets). Data-write risk only
  (organizer creation + `organizerId` backfill on `crm_leads`), scoped to a nullable, non-destructive
  FK column with `onDelete: 'set null'` — reversible by design.
- No new dependencies, no new runtime surfaces.

## Implementation Checklist

1. **`src/lib/server/db/organizer-find-or-create.ts`** (new file — PVL fix, see Deviation Note) — add `findOrCreateOrganizer(input, dbClient)`:
   - Imports: `import { crmOrganizers } from './schema'; import { sql } from 'drizzle-orm'; import type { db } from './index'; type Db = typeof db;` (type-only `db` import — no runtime `$env` dependency).
   - Signature: `export async function findOrCreateOrganizer(input: {...}, dbClient: Db): Promise<string>`.
   - Case-insensitive lookup: `dbClient.select({ id }).from(crmOrganizers).where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${input.normalizedHandle})`).limit(1)`.
   - If found, return `row.id`.
   - Else `dbClient.insert(crmOrganizers).values({ name: input.name, normalizedHandle: input.normalizedHandle, socialFacebook: input.socialFacebook ?? null, socialInstagram: input.socialInstagram ?? null, website: input.website ?? null, email: input.email ?? null, phone: input.phone ?? null, location: input.location ?? null }).returning({ id: crmOrganizers.id })`, return the new id.
   - Guard: if `input.normalizedHandle` is falsy/empty, throw a clear `Error('findOrCreateOrganizer: normalizedHandle is required')` — callers decide catch-vs-propagate (ingest catches; backfill treats as a "skip, no derivable handle" case per AC8, checking this case explicitly before calling rather than relying on the throw).
   - Test gate for this section: unit-level assertions can live in `leads-ingest-organizer-db.spec.ts` (item 5) rather than a separate file — no separate gate command for this step alone.

2. **`src/routes/api/leads/ingest/+server.ts`** — in the "new lead" branch (after the `dupHit.length` check, before the `db.insert(crmLeads)` call):
   - Reuse the already-computed `normalizedHandle` variable (do not recompute).
   - `let organizerId: string | null = null;`
   - Import `findOrCreateOrganizer` from `$lib/server/db/organizer-find-or-create` (NOT `organizers` — see PVL fix Deviation Note).
   - `try { organizerId = await findOrCreateOrganizer({ normalizedHandle, name: lead.pageName, socialFacebook: lead.facebookUrl ?? null, socialInstagram: lead.instagramUrl ?? null, website: lead.url ?? null, email: lead.email ?? null, phone: lead.phone ?? null, location: lead.location ?? null }, db); } catch (e) { console.error('findOrCreateOrganizer failed, continuing without organizer link', e); }` — passing this route's own already-imported `db` (from `$lib/server/db`) as the second argument.
   - Add `organizerId` to the `crmLeads` insert values object.
   - Test gate for this section: run `bun run test:unit -- src/tests/schemas.spec.ts` (must stay green — no schema/contract change) immediately after this edit.

3. **`scripts/backfill-organizers.ts`** — new file, modeled on `scripts/backfill-event-dates.ts`:
   - `--dry-run` / `--load` mutually-exclusive flag parsing (copy the exact guard block from `backfill-event-dates.ts` lines 12–22).
   - Construct a standalone `postgres()`+`drizzle()` client (same pattern as `backfill-reps.ts` — a single-DB, non-Vite bun script) and import `findOrCreateOrganizer` from the new `organizer-find-or-create.ts` file, passing this script's own client. **Do NOT** import the shared `db` from `src/lib/server/db/index.ts` (directly or via `organizers.ts`) — it has a top-level `$env/dynamic/private` import that only resolves inside SvelteKit's Vite pipeline and throws under plain `bun run scripts/*.ts` (confirmed by reproduction; see PVL fix Deviation Note).
   - Select: `db.select({ id, normalizedHandle, name, socialFacebook, socialInstagram, pageUrl, location, contactEmail, contactPhone }).from(crmLeads).where(and(isNull(crmLeads.organizerId), isNull(crmLeads.deletedAt)))`.
   - For each row: if `!row.normalizedHandle` → count as skipped (AC8), continue.
   - Else call `findOrCreateOrganizer({ normalizedHandle: row.normalizedHandle, name: row.name, socialFacebook: row.socialFacebook, socialInstagram: row.socialInstagram, website: row.pageUrl, email: row.contactEmail, phone: row.contactPhone, location: row.location }, db)`.
   - `if (load) await db.update(crmLeads).set({ organizerId, updatedAt: new Date() }).where(eq(crmLeads.id, row.id))`.
   - Track counters: `linked`, `organizersCreated` (only increment when `findOrCreateOrganizer` actually inserted — capture via a `{ id, created }` return-shape tweak, OR do a pre-count of `crmOrganizers` rows before/after the loop and diff at the end — prefer the pre/post count-diff approach to avoid changing `findOrCreateOrganizer`'s public return shape for the ingest caller), `skipped` (AC8).
   - Print summary: `console.log(\`${linked} leads linked, ${organizersCreated} organizers created, ${skipped} skipped\`)`.
   - Single-pass, no batching: `crm_leads` has no documented row-count evidence suggesting this is impractical (seed data is 25 rows; no migration/doc references a large historical volume beyond what `scripts/import.ts` already processes in one pass) — matches the existing scripts' convention.
   - Idempotent by construction: re-running only ever selects rows still matching `organizer_id IS NULL`, so a second run naturally becomes a no-op (AC6) without extra guard logic.
   - Test gate for this section: manual `--dry-run` then `--load` run against a local Postgres (see Verification Evidence AC5–AC8 rows) — no automated spec exists for this convention repo-wide (see Known Gap note).

4. **`scripts/seed.ts`** — add after `users` is defined, before `leads` array is used in the insert (must run before `db.insert(crmLeads)` since organizer IDs must exist first, and after `client`/`db` are constructed since `findOrCreateOrganizer` needs the DB):
   - Import `findOrCreateOrganizer` from `../src/lib/server/db/organizer-find-or-create.ts` (NOT `organizers.ts` — see PVL fix Deviation Note); call it with `seed.ts`'s own already-existing local `db` variable (already constructed standalone at the top of this script — no new client needed).
   - Create 2 sample organizers via `findOrCreateOrganizer`:
     - one for the `SayawPilipinas` handle already shared by seed leads `L(22)` and `L(23)` (both already carry `socialFacebook: 'https://fb.com/SayawPilipinas'` — reuse this existing duplicate as the "recurring organizer" demo case, computing `normalizedHandle` via the same `normalizeHandle()` helper from `src/lib/server/import-utils.ts` fed with that URL, so both leads resolve to the SAME organizer through the real find-or-create path, not a hardcoded shared ID).
     - one new standalone sample organizer for `L(15)` (won deal) using its existing fields, to demonstrate a single-event organizer.
   - Set `organizerId: <resolved id>` on the `leads` array entries for `L(22)`, `L(23)`, and `L(15)` before the array is passed to `db.insert(crmLeads)`.
   - No changes to `--reset`/`--force` guard logic, insert order, or other seed rows.
   - Test gate for this section: manual `bun run scripts/seed.ts` against a local Postgres (see Verification Evidence AC9 row).

5. **`src/tests/leads-ingest-organizer-db.spec.ts`** — new file, `SKIP_DB`-gated (`!process.env.DATABASE_URL`), mirrors `organizers-db.spec.ts` cleanup conventions (tracked created IDs, `afterAll` cleanup, `__test__`-prefixed names):
   - Case AC1: POST a batch with a lead whose handle matches no existing organizer → assert a new `crm_organizers` row was created and the new `crm_leads` row's `organizerId` points at it.
   - Case AC2: seed an organizer row directly, then POST a lead with a matching handle → assert the SAME organizer id is reused, and no second organizer row with that handle exists.
   - Case AC3 (baseline + regression): POST the same lead twice (second is a `sourceRef`/`normalizedHandle` duplicate) → assert the second call hits the existing skip/patch path and does NOT create or touch any organizer row.
   - Case AC4 (endpoint-level): assert the JSON response shape (`{ received, created, skipped, patched }`) is unchanged and the secret-auth 401 case still short-circuits before any organizer logic runs.
   - VALIDATE confirmed the repo DOES have a precedent for driving a `+server.ts` handler
     directly in a Vitest spec: `src/tests/reminders-due-endpoint.spec.ts` imports the exported
     handler (`GET`) directly, calls it with a hand-built fake event object, and uses
     `vi.mock('$env/dynamic/private', () => ({ env: envState }))` to control env vars (that
     spec is a fully-mocked unit test, no real DB). For this Hybrid `*-db.spec.ts` (real DB),
     the equivalent approach is: import `POST` from `../routes/api/leads/ingest/+server`,
     `vi.mock('$env/dynamic/private', ...)` supplying BOTH `INGEST_SECRET` (for the auth guard)
     AND `DATABASE_URL` (copied from `process.env.DATABASE_URL` so the real `db` Proxy still
     connects), then call `POST({ request } as any)` with a hand-built `Request`. If this proves
     awkward in practice, fall back to the DB-level assertion approach (call
     `findOrCreateOrganizer` + a raw insert directly) — note whichever approach was used in the
     EXECUTE report.
   - Test gate for this section: `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` (self-skips without `DATABASE_URL`; run against local Postgres for real confirmation).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `leads-ingest-organizer-db.spec.ts` — "no existing organizer for handle → creates one and links it" | Hybrid | AC1 |
| `leads-ingest-organizer-db.spec.ts` — "existing organizer for handle → reuses it, no duplicate created" | Hybrid | AC2 |
| `leads-ingest-organizer-db.spec.ts` — "duplicate lead path unaffected, no organizer side-effect" | Hybrid | AC3 |
| `bun run test:unit -- src/tests/schemas.spec.ts` (unchanged `ingestBatchSchema`/`ingestLeadSchema` cases) | Fully-Automated | AC4 (schema half) |
| `leads-ingest-organizer-db.spec.ts` — response-shape parity + secret-auth-401-short-circuit case | Hybrid | AC4 (endpoint half) |
| Manual run: `bun run scripts/backfill-organizers.ts --dry-run` against seeded DB, then `--load`, assert via `bun run db` query / seed script's own log that all organizer-less leads gained an `organizerId` | Hybrid (script has no test harness convention in this repo — see Known Gap note below) | AC5 |
| Manual re-run: `bun run scripts/backfill-organizers.ts --load` a second time, assert `organizersCreated: 0` and no `updatedAt` changes on already-linked leads | Hybrid | AC6 |
| Manual: seed one lead with a pre-set `organizerId` pointing at organizer X whose handle would recompute to a DIFFERENT organizer Y; run backfill; assert lead still points at X | Hybrid | AC7 |
| Manual: seed one lead with `normalizedHandle: null`/empty; run backfill; assert it is not linked and is counted in the printed `skipped` total | Hybrid | AC8 |
| `bun run scripts/seed.ts` then manual check of `/organizers` page (or `listOrganizersWithLeadCount()` query result) — assert ≥2 sample organizer rows exist and ≥1 seeded lead has non-null `organizerId` pointing at one | Hybrid | AC9 |
| `organizers-db.spec.ts` continuing to pass unmodified (regression, no new assertions) + code-read confirmation no changes touch `listOrganizersWithLeadCount`/`getOrganizer`/`listLinkedLeadsForOrganizer` or the manual-tagging `PATCH` route | Hybrid (existing suite) + Agent-Probe (code-read confirmation) | AC10 |

## Known Gap — backfill/seed script test coverage

Neither `scripts/backfill-event-dates.ts` nor `scripts/backfill-reps.ts` has an automated test in
this repo today (confirmed via `find`/`grep` over `src/tests/` — zero backfill-related spec
files exist). This plan follows that same repo-wide convention: `scripts/backfill-organizers.ts`
and the `scripts/seed.ts` addition are verified via the **manual Hybrid steps in the table above**
(dry-run + load + re-run against a real local Postgres), not an automated spec. This is a
pre-existing repo-wide gap, not new debt introduced by this plan — see `Test Infra Improvement
Notes` for the improvement option if a future plan wants to close it for all backfill scripts at once.
The core find-or-create logic these scripts depend on (`findOrCreateOrganizer`) IS covered by
automated Hybrid tests (AC1/AC2 in `leads-ingest-organizer-db.spec.ts`) — only the scripts'
own select/loop/summary-counting glue is uncovered by automation.

## Test Infra Improvement Notes

- No test harness exists for validating `scripts/*.ts` one-time backfill scripts in isolation
  (no shared test convention, no fixture DB reset helper scoped to backfill runs). A future
  improvement could extract each backfill script's core "select → resolve → update" logic into
  a plain importable function (mirroring how `normalizeHandle()` was extracted for shared reuse),
  making it unit-testable without spinning up the CLI. Out of scope for this plan — flagged for
  a future test-infra plan covering all three backfill scripts at once (event-dates, reps,
  organizers) rather than one-off per script.
- This plan is the first to add ingest-endpoint-level DB tests (`leads-ingest-organizer-db.spec.ts`)
  — previously only schema-level ingest tests existed. `src/tests/reminders-due-endpoint.spec.ts`
  is the repo's existing precedent for driving a `+server.ts` handler directly (via `vi.mock`
  of `$env/dynamic/private` + direct handler import) — see Implementation Checklist item 5 for
  how to adapt that pattern to a real-DB Hybrid test. Note whichever approach EXECUTE actually
  uses in the phase/EXECUTE report so later ingest-adjacent plans reuse it instead of re-deciding.

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/import/active/organizer-ingest-seeding_06-07-26/organizer-ingest-seeding_PLAN_06-07-26.md`
2. **Last completed phase/step**: PLAN written + VALIDATE (V1–V7) complete, plan updated with PVL fixes. No implementation started.
3. **Validate-contract status**: written below — Gate: CONDITIONAL (see `## Validate Contract`).
4. **Supporting context files loaded during PLAN**: SPEC (co-located), `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `src/routes/api/leads/ingest/+server.ts`, `src/lib/server/import-utils.ts`,
   `src/lib/server/db/organizers.ts`, `src/lib/server/db/schema.ts` (crmOrganizers/crmLeads.organizerId),
   `scripts/backfill-event-dates.ts`, `scripts/backfill-reps.ts`, `scripts/seed.ts`, `scripts/import.ts`,
   `src/tests/organizers-db.spec.ts` (test convention reference).
5. **Supporting context files loaded during VALIDATE**: `src/lib/server/db/index.ts` (confirmed the
   `$env/dynamic/private` import chain), `src/tests/seed-templates.spec.ts`,
   `src/tests/reminders-due-endpoint.spec.ts`, `package.json` (scripts block), `.svelte-kit/tsconfig.json`.
6. **Next step for a fresh agent**: EXECUTE checklist items 1→5 in order (organizer-find-or-create.ts
   function first — items 2–4 all depend on it). Test gates run per-section as each checklist item
   completes, not batched to the end.

## Validate Contract

Status: CONDITIONAL
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 4 Layer 1 dimension agents + 5 Layer 2 section agents (organizer-find-or-create.ts,
ingest endpoint wire-in, backfill script, seed.ts, test file) — independent, no cross-agent
communication needed; simulated as a single-pass synthesis in this session given the plan's
small blast radius (5-signal score: 0/7 — no multi-package scope, no phase program, <5 files,
no user-requested depth beyond standard VALIDATE fan-out).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | New lead, no matching organizer → new organizer created + linked | Hybrid | `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` — case "creates one and links it" | A |
| AC2 | New lead, matching organizer → reused, no duplicate | Hybrid | `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` — case "reuses it, no duplicate" | A |
| AC3 | Duplicate-lead path unaffected, no organizer side-effect | Hybrid | `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` — case "duplicate unaffected" | B (new coverage, no pre-existing suite — see Deviation Note) |
| AC4 (schema half) | Ingest request/response schema unchanged | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` (confirmed green baseline: 21/21 passed during VALIDATE) | A |
| AC4 (endpoint half) | Ingest response shape parity + 401 short-circuit unaffected | Hybrid | `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` — response-shape + 401 case | B |
| AC5 | Backfill links every eligible existing lead | Hybrid | Manual `bun run scripts/backfill-organizers.ts --dry-run` then `--load` against local Postgres | D (no script-test convention repo-wide; core find-or-create logic proven via AC1/AC2) |
| AC6 | Backfill idempotent (safe re-run) | Hybrid | Manual second `--load` run, assert `organizersCreated: 0` | D |
| AC7 | Backfill skips leads with existing organizerId | Hybrid | Manual seeded-lead + backfill run | D |
| AC8 | Backfill skips + counts leads with no derivable handle | Hybrid | Manual seeded-lead (null handle) + backfill run | D |
| AC9 | Dev-seed produces sample organizer data | Hybrid | Manual `bun run scripts/seed.ts` + `/organizers` page check | D (SPEC named an automated spec file; PLAN substitutes manual verification — see Deviation Note) |
| AC10 | `/organizers` page + manual-tagging endpoint unaffected | Hybrid + Agent-Probe | `organizers-db.spec.ts` regression (unmodified) + code-read confirmation | A |

Failing stubs (Fully-Automated row only):

```
test("should keep ingestBatchSchema/ingestLeadSchema cases passing unmodified", () => {
  // schemas.spec.ts already exists and is green (21/21) — this is a regression gate,
  // not a new-behavior stub. No NOT-IMPLEMENTED stub applies.
})
```

gap-resolution legend: A — proven now. B — fixed in this plan (new test file created by this
plan's own checklist item 5). D — backlog test-building stub / named residual (backfill+seed
script glue has no automated coverage convention repo-wide; documented, not silent).

Legacy line form:
- Ingest organizer-linking (new + duplicate + endpoint-shape): Hybrid: `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts` (SKIP_DB-gated)
- Schema regression: Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- Backfill script (AC5-AC8): known-gap: documented — manual `--dry-run`/`--load` verification, no automated spec (repo-wide convention gap, not new debt)
- Dev-seed (AC9): known-gap: documented — manual verification; SPEC's named `seed-organizers.spec.ts` substituted per Deviation Note
- Organizers page regression (AC10): hybrid: existing `organizers-db.spec.ts` unmodified + agent-probe: code-read confirmation

Dimension findings:
- Infra fit: CONCERN (fixed in plan) — original design had `findOrCreateOrganizer()` living in
  `organizers.ts`, which transitively imports `$env/dynamic/private` via `./index.ts`. This
  module is unresolvable under plain `bun run scripts/*.ts` execution (confirmed by direct
  reproduction: import throws `Cannot find module '$env/dynamic/private'`). Both
  `scripts/backfill-organizers.ts` and the `scripts/seed.ts` wiring would have crashed at
  import time. **Fixed in plan**: `findOrCreateOrganizer` moved to a new pure module
  (`organizer-find-or-create.ts`) with a type-only `db` type import and an explicit `dbClient`
  parameter — verified via reproduction that `import type` avoids the runtime `$env` pull-in.
- Test coverage: CONCERN (documented) — AC5-AC9 (backfill + seed) rest entirely on manual
  Hybrid verification with zero automated gate, consistent with the pre-existing repo-wide
  convention for one-time scripts (`backfill-event-dates.ts`, `backfill-reps.ts` have no specs
  either). This is a real, accepted residual — not silent (see Known Gap section + per the
  net-gate vacuous-green rule, this alone prevents a terminal PASS). AC9 additionally deviates
  from the SPEC's named proving file (`seed-organizers.spec.ts`) — documented via a new
  Deviation Note rather than silently dropped. AC1-AC4, AC10 have real automated/hybrid
  coverage.
- Breaking changes: PASS — confirmed by direct code read of `+server.ts`: response shape
  (`{ received, created, skipped, patched }`), secret-auth check, and dedup logic are
  unmodified; the new `organizerId` computation is inserted only in the "new lead" branch
  before the existing insert call. `organizers.ts`'s three read exports and the
  `PATCH /api/leads/[id]/organizer` route are untouched (confirmed by grep — no other plan
  section references them). No schema/migration changes (schema fields already exist from
  GitHub #188).
- Security surface: PASS — no auth/identity, billing, migration, public-API-contract, or
  deploy/container surface touched. `INGEST_SECRET` check is unmodified and unconditionally
  precedes the new logic (confirmed: the secret check at the top of `POST` throws before the
  per-lead loop runs). No new secrets or trust-boundary logic introduced.
- Section — organizer-find-or-create.ts (item 1): CONCERN → fixed in plan (see Infra fit above
  and Deviation Note). Mechanical feasibility now confirmed: `crmOrganizers`/`sql` imports are
  script-safe (schema.ts has zero `$env` dependency, confirmed by grep); the case-insensitive
  `lower()` SQL comparison and insert-if-missing logic match the existing Drizzle query style
  used elsewhere in `organizers.ts`.
- Section — ingest endpoint wire-in (item 2): PASS — the described insertion point (after
  `dupHit.length` check, before `db.insert(crmLeads)`) is correct against the real file; the
  already-computed `normalizedHandle` variable is in scope at that point and is correctly
  reused (not recomputed); the guard against falsy/empty `normalizedHandle` correctly handles
  the rare edge case where `lead.handle` strips to an empty string. The try/catch correctly
  wraps only the `findOrCreateOrganizer` call so a thrown error cannot block lead creation —
  confirmed this matches the "best-effort, must not block lead creation" requirement.
- Section — backfill script (item 3): CONCERN → fixed in plan (same $env issue as item 1,
  compounded by originally citing the wrong pattern — the plan had it backwards: it should NOT
  use the shared client, and SHOULD use a standalone pool like `backfill-reps.ts`, not like
  `backfill-event-dates.ts`'s dual-DB pattern). Idempotency-by-construction claim (re-run only
  selects `organizer_id IS NULL` rows) is correctly reasoned and requires no extra guard logic.
  AC7 test design (existing `organizerId` never touched because the row is never selected) is
  correctly reasoned.
- Section — seed.ts (item 4): CONCERN → fixed in plan (same $env issue; seed.ts already
  constructs its own standalone client at the top of the script, so the fix is a straightforward
  import-source change, no new client needed). AC9 test-file substitution documented via new
  Deviation Note.
- Section — leads-ingest-organizer-db.spec.ts (item 5): PASS — `SKIP_DB` gating and
  `__test__`-prefixed cleanup convention correctly mirror `organizers-db.spec.ts`. VALIDATE found
  and added a concrete precedent (`reminders-due-endpoint.spec.ts`) resolving the plan's
  previously-open question about whether any repo convention drives a `+server.ts` handler
  directly — added as an execute-agent option in the checklist, with the DB-level fallback kept.

Open gaps:
- AC5-AC9 (backfill + seed script core logic) have no Fully-Automated or Hybrid *script-level*
  gate — manual verification only. Named residual, pre-existing repo-wide convention gap
  (see Known Gap section in plan). Accepted for this plan; a future test-infra plan may extract
  pure logic from all 3 backfill scripts at once.
- AC9's proving file differs from what the locked SPEC named (`seed-organizers.spec.ts` was not
  created; manual verification substituted) — documented via Deviation Note, not a silent gap.

What this coverage does NOT prove:
- The Hybrid `leads-ingest-organizer-db.spec.ts` gate (AC1-AC4) proves the DB-level find-or-create
  behavior and response-shape parity when a live `DATABASE_URL` is available; it self-skips
  otherwise (`SKIP_DB`), so CI without a live Postgres proves nothing for AC1-AC4 until a live-DB
  CI harness exists (pre-existing repo-wide gap, not new to this plan).
- The Fully-Automated `schemas.spec.ts` gate proves the Zod schema shapes are unchanged; it does
  NOT prove the endpoint's actual JSON response shape at runtime (that half of AC4 is Hybrid).
- The manual AC5-AC9 verification steps prove correctness for the specific scenarios an operator
  manually runs during EXECUTE; they do NOT prove correctness against the full scale/shape of
  real historical `crm_leads` data (only seed-scale, ~25 rows) — a real backfill run against
  production-scale data before go-live is a manual operational step, not automated by this plan.
- Agent-Probe code-read confirmation (AC10) proves the specific files this plan touches were not
  modified; it does not re-run the `/organizers` page's own test suite (out of this plan's scope).

Gate: CONDITIONAL (0 unresolved FAILs after in-plan fixes; CONCERNs either fixed in plan or
accepted as documented known-gaps — see Open gaps above; the AC5-AC9 known-gap is a real residual
that, per the net-gate vacuous-green rule, keeps this plan below a terminal PASS)
Accepted by: session — vc-validate-agent applied the PVL fix (organizer-find-or-create.ts
extraction) directly to plan text per the standard VALIDATE "plan fixes applied" path; the
AC5-AC9 manual-verification known-gap and the AC9 SPEC-deviation are accepted as documented
residuals consistent with this repo's pre-existing one-time-script test-convention gap. Both
concerns were named explicitly, not silently passed. A human reviewer should re-confirm this
CONDITIONAL acceptance before EXECUTE if a live-DB CI harness becomes available and changes the
cost/benefit of the AC5-AC9 known-gap.

## Autonomous Goal Block

```
SESSION GOAL: Auto-create/link CRM organizer records during lead ingest, backfill existing
leads, and seed sample organizer data for local dev (GitHub #189/#190 follow-on).
Charter + umbrella plan: N/A — single SIMPLE plan (no phase program, no umbrella).
Autonomy: Standard VALIDATE→EXECUTE handoff. EXECUTE must implement checklist items 1-5 in
order (item 1 first — items 2-4 depend on it). No creative deviation from the plan as written
(including the PVL-fixed design: findOrCreateOrganizer lives in the NEW
organizer-find-or-create.ts file, NOT organizers.ts).
Hard stop conditions / safety constraints:
- Do not add findOrCreateOrganizer to organizers.ts — it will break both scripts/backfill-organizers.ts
  and scripts/seed.ts (confirmed $env/dynamic/private import-chain failure under bare `bun run`).
- Do not modify organizers.ts's 3 existing read exports, the PATCH /api/leads/[id]/organizer
  route, or src/lib/server/db/schema.ts (no migration in scope).
- Do not change the ingest endpoint's request/response schema or secret-auth check.
- No DB uniqueness constraint on normalizedHandle (accepted race-condition risk, matches
  existing lead-dedup tolerance) — do not add one without a new plan.
Next phase: EXECUTE: process/features/import/active/organizer-ingest-seeding_06-07-26/organizer-ingest-seeding_PLAN_06-07-26.md
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: fully-auto commands: `bun run test:unit -- src/tests/schemas.spec.ts` (baseline
green, re-run after item 2) then `bun run test:unit -- src/tests/leads-ingest-organizer-db.spec.ts`
(item 5, SKIP_DB-gated) | e2e spec: none in scope | probe scenario: manual
`bun run scripts/backfill-organizers.ts --dry-run|--load` + `bun run scripts/seed.ts` against
local Postgres (AC5-AC9) | high-risk pack: no (no high-risk class present)
```
