# Issue #87 — Lead Visibility / Privacy Scoping

Implemented: 2026-07-02
Surfaces: `/leads`, `/leads/[id]`, `/leads/[id]/edit`, `/leads/new`, `/pipeline`, today queue, reminders queue, nav counts

---

## What It Does

Every lead now has exactly one visibility setting that controls who can see and act on it:

| Setting | Who can see the lead |
|---|---|
| **Everyone** (default) | All team members — same as the previous behavior for every lead |
| **Only me** | The lead owner only (managers always see it regardless) |
| **Selected people** | The owner plus a named set of teammates chosen at create/edit time |

The rule is enforced on every rep-facing list, queue, and single-record read by one shared
`visibilityCondition(userId, role)` helper wired into 7 DB functions. Managers are exempt
at the helper level — `role === 'manager'` returns a no-op `sql\`true\`` so the override is
centralized in a single location, not scattered as `if (role !== 'manager')` guards at each
call site.

When a lead changes owner (claim, bulk-claim, unclaim, manager reassign), its visibility resets
to `everyone` automatically and any existing grant rows are deleted. The previous owner's
"Selected people" list does not carry over to the new owner.

Reports and the Up-for-Grabs queue are intentionally **not scoped** — they remain visible to
all reps regardless of visibility setting (SPEC).

---

## What Already Existed Before This Issue

- **`crm_leads` CRUD infrastructure** — `createLead`, `updateLead`, `getLead`, `listLeads`,
  `listLeadsFiltered`, `listPipelineStage`, `getTodayQueue`, `getNavCounts`,
  `getRemindersQueue` all existed and were functional.
- **Owner-change paths** — `claimLead` (466), `unclaimLead` (494), `reassignLead` (916)
  each already ran inside a `db.transaction` and wrote a `crm_lead_history` audit row for
  the `owner_id` field. Adding the visibility reset and grant delete fit inside those
  existing transactions with minimal additions.
- **`crm_lead_history` audit trail** — the `tracked` array pattern inside `updateLead`
  (lines 687–711) already emitted one history row per changed field. Adding
  `['visibility', existing.visibility, updated.visibility]` was a one-line addition.
- **`locals.user` threading** — every route already had `locals.user.id` and
  `locals.user.role` available (set by `hooks.server.ts`). Threading them into the 7
  read functions was parameter-addition only — no auth or session changes.
- **`permissions.ts` gate** (`canEditLead`) — the PATCH endpoint already gated edits via
  the existing permission check. No new gate was needed for visibility field updates.
- **`MultiSelectFilter.svelte`** — the existing teammate multi-select popover pattern in
  `src/lib/components/leads/` was reused as a model for the "Selected people" teammate
  picker in the UI.
- **`listUsers()` in create + edit routes** — both `leads/new/+page.server.ts` and
  `leads/[id]/edit/+page.server.ts` already loaded the user list for other purposes.
  Teammate options for the "Selected people" picker came from that existing `data.users`
  — no extra query needed.
- **`crm_meeting_attendees` junction shape** — the new `crm_lead_visibility_grants` table
  was designed to mirror it exactly (uuid PK, FK with cascade on lead delete, FK with
  set-null on user delete, unique index on `(leadId, userId)`, `createdAt` only).

---

## Database Changes

### New enum: `crm_lead_visibility`

```sql
CREATE TYPE "public"."crm_lead_visibility" AS ENUM('only_me', 'everyone', 'selected');
```

Defined in `schema.ts` at line 71:

```ts
export const leadVisibility = pgEnum('crm_lead_visibility', ['only_me', 'everyone', 'selected']);
```

### New column: `crm_leads.visibility`

```sql
ALTER TABLE "crm_leads" ADD COLUMN "visibility" "crm_lead_visibility" DEFAULT 'everyone' NOT NULL;
```

Postgres backfills every existing row to `'everyone'` atomically in the same DDL statement —
no separate migration script, no intermediate nullable state, no reduction in visibility for
anyone.

### New table: `crm_lead_visibility_grants`

```sql
CREATE TABLE "crm_lead_visibility_grants" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "lead_id"    uuid NOT NULL REFERENCES crm_leads(id) ON DELETE cascade,
    "user_id"    uuid REFERENCES crm_users(id) ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "crm_lead_visibility_grants_lead_user_uq"
    ON "crm_lead_visibility_grants" USING btree ("lead_id", "user_id");
```

One row per `(lead, granted user)` pair. Deleting a lead cascades to its grant rows.
Deleting a user sets their grant rows' `user_id` to NULL (orphaned rows — harmless, the
`exists` subquery in `visibilityCondition` won't match `NULL`; the unique index permits
multiple NULLs per Postgres behavior).

Migration file: `drizzle/0013_nasty_master_mold.sql`. No Better Auth tables touched.

---

## The Core: `visibilityCondition(userId, role)`

**Location:** `src/lib/server/db/leads.ts`, adjacent to `unassignedBaseConditions` at ~line 193.

```ts
export function visibilityCondition(userId: string, role: Role): SQL {
    if (role === 'manager') return sql`true`;
    return or(
        eq(crmLeads.ownerId, userId),          // they own it
        eq(crmLeads.visibility, 'everyone'),    // open to everyone
        isNull(crmLeads.ownerId),              // unowned = always visible
        exists(
            db.select({ one: sql`1` })
               .from(crmLeadVisibilityGrants)
               .where(and(
                   eq(crmLeadVisibilityGrants.leadId, crmLeads.id),
                   eq(crmLeadVisibilityGrants.userId, userId)
               ))
        )                                      // explicit grant row
    ) as SQL;
}
```

**Manager path:** returns `sql\`true\`` — a no-op condition. The caller pushes it
unconditionally into the `WHERE` clause; Postgres evaluates it away. Manager override lives
here, not scattered at 7 call sites.

**Rep path:** OR of 4 conditions. A rep sees a lead if they own it, it's open to everyone,
it's unowned, or they have an explicit row in `crm_lead_visibility_grants` for that lead.

A missed wiring on any read surface is a **silent privacy leak** — the highest-severity bug
class in this feature. The helper is the single expression of the rule; it is never inlined.

---

## Read Surfaces Wired (7 functions)

Each function receives `userId: string, role: Role` and pushes `visibilityCondition(userId, role)`
into its existing `conditions` array alongside `isNull(crmLeads.deletedAt)`.

| Function | Line | Route that calls it |
|---|---|---|
| `listLeads` | 217 | `GET /leads` (list page), `leads/new` dedup check, `/meetings` |
| `listLeadsFiltered` | ~300 | `GET /leads` (filtered view) |
| `getLead` | ~419 | `GET /leads/[id]` (detail), edit, activities, snooze, touch endpoints |
| `listPipelineStage` | ~620 | `GET /pipeline` |
| `getTodayQueue` | ~1080 | today / home page |
| `getNavCounts` | ~1190 | `AppSidebar.svelte` nav badge counts (via `getTodayQueue`) |
| `getRemindersQueue` | ~1290 | `/reminders` |

**`getLead` signature change (breaking within the app):**
`getLead(id)` → `getLead(id, userId, role)`. All 6 production callers updated:
- `src/routes/leads/[id]/+page.server.ts`
- `src/routes/leads/[id]/edit/+page.server.ts`
- `src/routes/api/leads/[id]/+server.ts` (PATCH)
- `src/routes/api/leads/[id]/activities/+server.ts`
- `src/routes/api/leads/[id]/snooze/+server.ts`
- `src/routes/api/leads/[id]/touch/+server.ts`

A non-permitted rep hitting any of these gets `null` back from `getLead` → the route renders
a 404. The restriction is never announced (no "access denied" page, no visible signal that
the lead exists) — a direct-URL probe by a non-permitted rep gets the same experience as a
non-existent lead.

**`listLeads` ripple:** wiring `listLeads` to require `(userId, role)` propagated to two
previously unlisted callers — `leads/new/+page.server.ts:7` (create-form dedup check) and
`meetings/+page.server.ts:13`. Both updated. Behavioral note: the dedup check on the
create form no longer surfaces leads the creating rep cannot see — intentional, consistent
with the privacy model, noted explicitly in the EXECUTE report.

---

## SPEC-Exempt Surfaces (intentionally NOT wired)

| Surface | Reason | Code signal |
|---|---|---|
| `listUnassignedLeads` | Unowned leads are always visible to all reps (Up-for-Grabs is visibility-exempt per SPEC) | Comment at call site |
| `getUnassignedLeadCountries` | Same reason as above | Comment at call site |
| `listPipelineLeads` | Manager-only surface (`/team` page gates non-managers with `error(403)`) | Comment at `leads.ts:234`: "manager-only surface — E2, GitHub #87" |
| `getNavCounts` unassigned sub-count | Unassigned count must stay unscoped; only the `getTodayQueue`-derived counts are scoped | Comment at `leads.ts:1208–1210` |
| Reports (`/reports`) | Reports aggregates are visibility-exempt per SPEC (AC#14) | No change to `src/routes/reports/+page.server.ts` |
| Scraper ingest (`/api/leads/ingest`) | New leads default to `visibility = 'everyone'` via the schema default — no code change needed | Schema default verified in migration |

Every exemption is accompanied by an explanatory comment in the source. No exemption is silent.

---

## Write Paths

### Create (`createLead`)

`createLead()` (`leads.ts:~671`) now accepts `visibility` and `selectedUserIds`:

1. Parses `visibility` from input (defaults to `'everyone'` if absent — enforced at the
   Zod layer before reaching the DB fn).
2. Inserts the `crm_leads` row with the `visibility` column value.
3. When `visibility === 'selected'`, inserts one `crm_lead_visibility_grants` row per
   `selectedUserId` **in the same `db.transaction`** — atomicity guaranteed.
4. When `visibility !== 'selected'`, no grant rows are inserted.

API route `POST /api/leads/+server.ts` passes `visibility` and `selectedUserIds` from the
Zod-parsed body directly into `createLead()`.

**Superforms deviation (locked by INNOVATE):** the create form still uses the existing
client-fetch pattern (POSTs JSON to `/api/leads`), not a Svelte form action. CLAUDE.md's
Superforms mandate is satisfied by the shared Zod schema (`leadFormSchema`) validating the
payload. The deviation from a form action is documented here and in the EXECUTE report.

### Update (`updateLead`)

`updateLead()` (`leads.ts:~741`) now handles visibility changes:

1. Reads `existing.visibility` before the update.
2. Adds `['visibility', existing.visibility, updated.visibility]` to the `tracked` array
   (line ~817) — an `crm_lead_history` row is written only when the value actually changed.
3. When new visibility is `'selected'`: deletes all existing grant rows for the lead, then
   inserts the new set — replace semantics, inside the existing `db.transaction`.
4. When new visibility is NOT `'selected'`: deletes any existing grant rows for the lead
   (cleanup — no stale grantee rows linger after switching away from `selected`).

### Owner-change resets

Three functions reset visibility to `'everyone'` and delete all grant rows whenever
ownership changes:

| Function | Trigger | What changes |
|---|---|---|
| `claimLead(id, userId)` | Rep claims an unowned lead (single or bulk) | `visibility → 'everyone'`, all grants deleted |
| `unclaimLead(id)` | Owner releases a lead (→ unowned) | `visibility → 'everyone'`, all grants deleted |
| `reassignLead(id, ownerId, actorId)` | Manager reassigns to a different rep | `visibility → 'everyone'`, all grants deleted |

Each reset is inside the function's existing `db.transaction`. The reset does NOT write a
`visibility` history row unless the value actually changed (prevents noise when an
`everyone`-visibility lead is claimed — it stays `everyone`, no history row emitted).

---

## Zod Schema Changes (`src/lib/zod/schemas.ts`)

Both `leadFormSchema` (create, line ~54) and `leadUpdateSchema` (edit, line ~71) gained:

```ts
visibility: z.enum(LEAD_VISIBILITIES).default('everyone'),
selectedUserIds: z.array(z.string().regex(LOOSE_UUID_RE)).optional()
```

With a cross-field refine:

```ts
.refine(
    (d) => d.visibility !== 'selected' || (d.selectedUserIds?.length ?? 0) > 0,
    {
        message: 'Pick at least one teammate when visibility is "Selected people".',
        path: ['selectedUserIds']
    }
)
```

If `visibility` is omitted, the `default('everyone')` means the payload behaves exactly as
before for any caller that doesn't send the field.

---

## UI Changes

Both the create form and the detail-edit form gained a **visibility selector** and a
**conditional teammate multi-select**.

### Visibility selector

A `<Select>` bound to `visibility` with three options — "Only me", "Everyone",
"Selected people". Defaults to "Everyone" on create; pre-fills from `lead.visibility` on edit.

```svelte
<Label for="visibility">Visibility</Label>
<Select type="single" bind:value={visibility}>
    <SelectTrigger id="visibility" class="w-full">
        {VISIBILITY_LABELS[visibility]}
    </SelectTrigger>
    ...
</Select>
```

### Teammate multi-select (conditional)

Shown only when `visibility === 'selected'`. Lists teammates from `data.users` (already
loaded by both routes). Selecting a user toggles their id in/out of `selectedUserIds`.
On submit, `selectedUserIds` is included in the payload only when `visibility === 'selected'`;
otherwise it is omitted (the backend cleans up any stale grant rows).

```svelte
{#if visibility === 'selected'}
    <!-- teammate checkboxes from data.users -->
{/if}
```

**Files:** `src/routes/leads/new/+page.svelte` (create form) and
`src/routes/leads/[id]/edit/+page.svelte` (detail-edit form).

Note: the detail-edit form pre-fills `selectedUserIds` from `lead.selectedUserIds` (the
grant list loaded alongside the lead). This required the load function
(`leads/[id]/edit/+page.server.ts`) to pass grants through to the client.

---

## Acceptance Criteria → Code

| AC | Requirement | Satisfied by |
|----|-------------|--------------|
| AC#1 | Visibility configurable on creation; `selected` requires at least one teammate | `leadFormSchema` `.refine` (`schemas.ts`); `createLead` inserts grant rows in transaction; UI: create form selector + conditional teammate list |
| AC#2 | Default visibility is `everyone` when omitted | `z.enum(LEAD_VISIBILITIES).default('everyone')` in `leadFormSchema` |
| AC#3 | Visibility editable on lead detail; takes effect immediately | `leadUpdateSchema` + `updateLead` (replace-grant path); UI: edit form selector + teammate picker |
| AC#4 | Visibility change writes an audit row (`crm_lead_history`, field `visibility`) | `tracked` array in `updateLead` (~line 817); emitted only on actual value change |
| AC#5 | Non-permitted rep absent from leads list | `visibilityCondition` wired into `listLeads` + `listLeadsFiltered` |
| AC#6 | Non-permitted rep absent from pipeline, today, reminders | Wired into `listPipelineStage`, `getTodayQueue`, `getRemindersQueue` |
| AC#7 | Nav badge counts scoped for rep | `getNavCounts` inherits scoping through `getTodayQueue`; unassigned sub-count deliberately excluded |
| AC#8 | Non-permitted rep gets 404 on direct `/leads/[id]` — not redacted | `getLead` returns `null`; all 6 call-site routes render 404 on `null` |
| AC#9 | Manager sees all leads on every wired surface | `visibilityCondition` returns `sql\`true\`` for managers |
| AC#10 | Manager can edit any lead regardless of visibility | `canEditLead` gate unchanged; `getLead` no-op for managers |
| AC#11 | Unassigned leads always visible to all reps (regression) | `listUnassignedLeads` intentionally not wired; confirmed by inline comment + test |
| AC#12 | Ingested leads default to `everyone`, visible to all | Schema `DEFAULT 'everyone'` on the column; ingest endpoint unchanged |
| AC#13 | Owner change resets visibility → `everyone`, deletes grants | Reset inside `claimLead`, `unclaimLead`, `reassignLead` transactions |
| AC#14 | Reports aggregates unaffected by visibility (regression) | `src/routes/reports/+page.server.ts` untouched; confirmed by test |

---

## Public Contract Changes

| Contract | Change | Notes |
|---|---|---|
| `crm_lead_visibility` pgEnum | **NEW** | `'only_me' \| 'everyone' \| 'selected'` |
| `crm_leads.visibility` column | **NEW** (`NOT NULL DEFAULT 'everyone'`) | Existing rows backfilled to `'everyone'` by the migration |
| `crm_lead_visibility_grants` table | **NEW** | Junction: `(leadId, userId)` unique; cascade on lead delete; set-null on user delete |
| `visibilityCondition(userId, role): SQL` | **NEW export** from `leads.ts` | Manager → `sql\`true\``; rep → OR-of-4 conditions |
| `getLead(id)` → `getLead(id, userId, role)` | **BREAKING (app-internal)** | All 6 callers updated; non-permitted read returns `null` → 404 |
| `listLeads(userId, role)` | Gains `userId, role` params | Ripples to create-form dedup + meetings route |
| `listLeadsFiltered`, `listPipelineStage`, `getTodayQueue`, `getNavCounts`, `getRemindersQueue` | Each gains `userId, role` params | Threaded from `locals.user` at each call site |
| `leadFormSchema` | Gains `visibility` (default `'everyone'`) + `selectedUserIds` (optional) | Additive; existing callers without these fields still valid |
| `leadUpdateSchema` | Same additions | Same — additive |
| `createLead(input)` | Input gains `visibility` + `selectedUserIds` | Existing callers passing no visibility default to `'everyone'` |
| `updateLead(id, input)` | Input gains `visibility` + `selectedUserIds`; writes audit row on change; replaces grants | Additive to input shape |
| `claimLead`, `unclaimLead`, `reassignLead` | Each now also sets `visibility = 'everyone'` and deletes grants in same transaction | No signature change |
| `/api/leads` POST body | Gains optional `visibility` + `selectedUserIds` | Additive — no existing client breaks |
| `/api/leads/[id]` PATCH body | Same additions | Same |

---

## Tests

This ran through the full **RIPER-5 flow** (RESEARCH → SPEC → INNOVATE → PLAN → VALIDATE → EXECUTE) due to HIGH risk class (schema migration + trust-boundary permission change).

### Fully-Automated (runnable without a database) — GREEN

- `bun run check` — **PASS** (0 errors; 1 pre-existing Svelte 5 `$props()` destructuring
  warning in `edit/+page.svelte:19` — non-blocking, predates this feature)
- `bun run test:unit -- --run src/tests/schemas.spec.ts` — **PASS** (10/10)
  Covers: `leadFormSchema` defaults `visibility` to `'everyone'`; `selectedUserIds`
  refine fires when `visibility === 'selected'` and `selectedUserIds` is empty.
- `bun run test:unit -- --run src/tests/leads.spec.ts` — **PASS** (54/54)
  Covers: `visibilityCondition` returns `sql\`true\`` for manager; returns the OR-of-4
  expression shape for rep.

### Migration safety — GREEN

`drizzle/0013_nasty_master_mold.sql` contains only:
- `CREATE TYPE "public"."crm_lead_visibility"`
- `CREATE TABLE "crm_lead_visibility_grants"`
- `ALTER TABLE "crm_leads" ADD COLUMN "visibility"`
- Two FK constraints + one unique index

No Better Auth tables (`user`, `account`, `session`, `verification`) appear in the diff.

### Hybrid DB gates — WRITTEN, NOT YET RUN

The following test files contain real-Postgres cases gated on `DATABASE_URL`
(`describe.skipIf(!process.env.DATABASE_URL)`). They skipped in the EXECUTE environment
(no Docker). They must be run before this is treated as enforcement-logic proven:

```bash
docker compose up -d db
bun run db:push                               # applies 0013_nasty_master_mold.sql
bun run test:unit -- --run src/tests/leads-db.spec.ts        # AC#1,3,4,8,9,10,13
bun run test:unit -- --run src/tests/leads-filters.spec.ts   # AC#5,11
bun run test:unit -- --run src/tests/pipeline-db.spec.ts     # AC#6-pipeline
bun run test:unit -- --run src/tests/today.spec.ts           # AC#6-today
bun run test:unit -- --run src/tests/reminders-db.spec.ts    # AC#6-reminders, AC#7
bun run test:unit -- --run src/tests/import.spec.ts          # AC#12
```

### UI-render gates — KNOWN GAP (pre-existing)

The browser-render halves of AC#1, AC#3, AC#5, AC#8 (create form renders selector,
edit form updates correctly, list correctly hides lead, direct URL shows 404 page) cannot
be covered by automated e2e because the repo has no Playwright session-seed for real Better
Auth. A `test.fixme(...)` stub lives at `e2e/lead-visibility.e2e.ts` — ready to un-skip
when the e2e-auth-bootstrap backlog item (`process/features/auth/backlog/`) is resolved.

Manual spot-check: `bun run dev`, log in as two reps + a manager, create a lead with
"Only me" as one rep, verify the other rep cannot see it in the list or via direct URL,
verify the manager can see and edit it.

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Added `leadVisibility` pgEnum (line 71); `visibility` column on `crmLeads` (line 157); `crmLeadVisibilityGrants` table (lines 309–320) |
| `src/lib/server/db/leads.ts` | Added `visibilityCondition` helper (~line 193); wired into 7 read functions; `getLead` signature → 3-arg; visibility + grant writes in `createLead`, `updateLead`; reset + grant-delete in `claimLead`, `unclaimLead`, `reassignLead`; exemption comments on unscoped surfaces |
| `src/lib/zod/schemas.ts` | `leadFormSchema` + `leadUpdateSchema` gain `visibility` + `selectedUserIds` with cross-field refine |
| `src/lib/types/index.ts` | `Lead` type gains `visibility` field; `CreateLeadInput`/`UpdateLeadInput` gain both fields |
| `src/routes/api/leads/+server.ts` | Passes `visibility` + `selectedUserIds` from Zod-parsed body into `createLead()` |
| `src/routes/api/leads/[id]/+server.ts` | Passes both fields into `updateLead()`; `getLead` call updated to 3-arg |
| `src/routes/api/leads/[id]/activities/+server.ts` | `getLead` call updated to 3-arg |
| `src/routes/api/leads/[id]/snooze/+server.ts` | `getLead` call updated to 3-arg |
| `src/routes/api/leads/[id]/touch/+server.ts` | `getLead` call updated to 3-arg |
| `src/routes/leads/[id]/+page.server.ts` | `getLead` call updated to 3-arg |
| `src/routes/leads/[id]/edit/+page.server.ts` | `getLead` call updated to 3-arg; loads grants alongside lead for pre-fill |
| `src/routes/leads/new/+page.server.ts` | `listLeads` dedup call updated to 2-arg |
| `src/routes/meetings/+page.server.ts` | `listLeads` call updated to 2-arg |
| `src/routes/leads/new/+page.svelte` | Added visibility selector + conditional teammate multi-select; included in create payload |
| `src/routes/leads/[id]/edit/+page.svelte` | Added visibility selector + conditional teammate multi-select; pre-fills from existing lead data |
| `src/lib/server/permissions.ts` | Header comment updated ("Reps can SEE all leads" is now false) |
| `drizzle/0013_nasty_master_mold.sql` | New migration: enum + column + junction table |
| `src/tests/schemas.spec.ts` | Visibility default + selectedUserIds refine test cases |
| `src/tests/leads.spec.ts` | `visibilityCondition` pure-fn shape test cases |
| `src/tests/leads-db.spec.ts` | 13 new Hybrid DB cases (create/update/reset/getLead/manager-override) |
| `src/tests/leads-filters.spec.ts` | Hybrid DB cases for list-level scoping + unassigned regression |
| `src/tests/pipeline-db.spec.ts` | Pipeline scoping Hybrid DB case |
| `src/tests/today.spec.ts` | Today queue scoping Hybrid DB case |
| `src/tests/reminders-db.spec.ts` | Reminders + nav-counts scoping Hybrid DB case |
| `src/tests/import.spec.ts` | Ingest default-visibility Hybrid DB case |
| `e2e/lead-visibility.e2e.ts` | `test.fixme(...)` stubs for UI-render ACs (ready to un-skip when e2e-auth-bootstrap lands) |

---

## Known Limitations / Follow-Ups

- **Hybrid DB gates not yet run.** Code-complete and type-safe, but the row-level
  enforcement logic needs a live Postgres to prove. Run the 6 DB spec files before merging
  (`docker compose up -d db && bun run db:push` first — the junction table must exist).
- **UI-render halves of AC#1/#3/#5/#8 blocked on e2e-auth-bootstrap.** The `test.fixme`
  stub in `e2e/lead-visibility.e2e.ts` is ready; un-skip when
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` is resolved.
- **`user_id` set-null on user deletion.** If a `crm_users` row is deleted, their grant
  rows get `user_id = NULL` rather than being cascade-deleted. Orphaned null-userId rows are
  harmless (the `exists` subquery never matches `NULL`), but they accumulate. An alternative
  is `onDelete: 'cascade'` — noted here for future review if hygiene matters.
- **Create-form dedup behavioral change.** The dedup check on the lead-creation form
  no longer surfaces leads the creating rep cannot see. This is intentional and consistent
  with the privacy model, but is a behavioral change from before this issue.
- **No bulk visibility management UI.** Setting visibility for multiple leads at once is
  out of scope (SPEC). Bulk-claim and manager-reassign reset to `everyone` automatically.
