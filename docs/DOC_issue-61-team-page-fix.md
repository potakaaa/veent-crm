# Issue #61 — Team Page: Manager-Only Data Mismatches

Verified + fixed: 2026-07-01
Surface: `/team`
Branch: `development`

---

## Background

The `/team` page is manager-only and lets a manager view the rep roster, add new reps, and
deactivate/reactivate existing ones. The page's server load (`+page.server.ts`) and its Svelte
component (`+page.svelte`) had drifted out of sync — the component referenced fields the load
function never returned. This surfaced as three specific, verifiable bugs.

## Verification Method

Before touching any code, a read-only research pass re-checked each of the three reported
mismatches directly against the current `development` branch (not assumed from the original issue
text), citing exact `file:line` evidence. Two of three were confirmed still broken; the third had
already been resolved by an unrelated merge.

---

## Bug #1 — `data.leads` Missing (Runtime Crash on Deactivate)

### What Was Broken

`src/routes/team/+page.server.ts` returned only `{ users, sort, dir }`. But
`src/routes/team/+page.svelte`'s `toggleActive()` handler (used by the Deactivate button) did:

```ts
const theirLeads = data.leads.filter(
	(l) => l.ownerId === u.id && l.stage !== 'won' && l.stage !== 'lost'
);
```

Since `data.leads` was `undefined`, clicking **Deactivate** on any rep threw
`Cannot read properties of undefined (reading 'filter')` — a full runtime crash, not a silent
failure. This blocked the entire pre-reassignment flow (moving a deactivated rep's active leads to
"Up for grabs" before disabling their account).

### Fix

**File:** `src/routes/team/+page.server.ts`

Added `listPipelineLeads()` (an existing query in `$lib/server/db/leads.ts`, already used
elsewhere for the pipeline board) to the load function, fetched in parallel with the users query:

```ts
const [rows, { leads }] = await Promise.all([
	db.select().from(crmUsers).orderBy(fn(COL_MAP[sort]), asc(crmUsers.id)),
	listPipelineLeads()
]);
```

`listPipelineLeads()` already excludes soft-deleted and `lost`-stage leads at the SQL level; the
component's own filter additionally excludes `won`, so the two layers compose correctly with no
double-work. `leads` is returned as-is in the page data.

---

## Bug #2 — `data.currentUser` Missing (Add/Deactivate Buttons Never Render)

### What Was Broken

`+page.svelte` derives:

```ts
const canManage = $derived(canManageUsers(data.currentUser));
```

`+page.server.ts` never returned `currentUser`, so `canManageUsers(undefined)` always evaluated to
`false` — the "Add a rep" button and every row's Deactivate/Reactivate button were invisible even
to a real manager. The manager-only info banner ("Team management is manager-only…") showed
unconditionally instead.

### Why It Wasn't a One-Line Fix

`canManageUsers` (in `$lib/utils/permissions.ts`) expects the app's `User` type, which requires
`id, name, email, role, active`. The session object at `locals.user` is typed `SessionUser`
(`$lib/server/auth.ts`) — `{ id, email, name, role }`, with **no `active` field**. Passing
`locals.user` straight through would not satisfy `User`'s shape.

### Fix

**File:** `src/routes/team/+page.server.ts`

Followed the existing convention already used by `src/routes/leads/[id]/+page.server.ts` (its
`me: User` construction) — build a full `User` from `locals.user`, hardcoding `active: true`:

```ts
const currentUser: User = {
	id: locals.user.id,
	email: locals.user.email,
	name: locals.user.name,
	role: locals.user.role,
	active: true
};
```

`active: true` is safe here (not a lie): `hooks.server.ts` only ever populates `locals.user` from
a `crm_users` row where `active = true` — an inactive user can never reach this code path with a
session at all.

No changes were needed to `+page.svelte` — it already read `data.currentUser` correctly; it was
purely a server-side gap.

---

## Bug #3 — `data.sort` / `data.dir` — Already Fixed (No Action Needed)

The original issue flagged that `feat/table-sorting` (adding `makeSortTable` + `data.sort` /
`data.dir` to the team page) was "not yet merged." By the time of this verification pass, that
branch **had** been merged into `development` via PR #65 (merge commit `ea7fe6b`). `+page.server.ts`
already computed and returned both fields, and `+page.svelte` already consumed them correctly. No
gap existed here — verification confirmed PASS with no code change required.

---

## Bonus Fix — `leadCount` Always Showed `—`

Not part of the original issue, but discovered during verification: `+page.svelte` renders
`{u.leadCount ?? '—'}` in the Leads column, but the mapper `dbUserToUser()` (a pure, unit-tested
function in `$lib/server/db/leads.ts`) never set `leadCount` — so the column showed `—` for every
rep, always.

Since the leads list was already being fetched for Bug #1, a per-owner count was computed in the
load function (not inside `dbUserToUser`, to keep that mapper pure and untouched):

```ts
const users = rows.map(dbUserToUser).map((u) => ({
	...u,
	leadCount: leads.filter((l) => l.ownerId === u.id).length
}));
```

This counts leads across `listPipelineLeads()`'s full set (including `won`) — the count column is
a general workload indicator, distinct from the narrower "active, reassignable" filter used inside
`toggleActive()`.

---

## Manager-Only Server-Side Gate — Confirmed Present

Verified as already correct, no change needed:

- **Page load:** `+page.server.ts` — `if (locals.user?.role !== 'manager') error(403, 'Manager only');`
  A real server-side 403, not merely a client-side UI hide.
- **Create-rep endpoint:** `src/routes/api/users/+server.ts` — the `POST` handler checks
  `!locals.user || locals.user.role !== 'manager'` and returns `403` otherwise.

**Known gap (not fixed here, flagged for awareness):** the deactivate/reactivate/reassign
mutations in `toggleActive()` call `crm.updateUser()` / `crm.reassignLeads()`, and `crm` currently
resolves to `mockCrmClient` (`$lib/services/index.ts`) — an in-memory mock, not a real API route.
There is no dedicated `PATCH /api/users/[id]` endpoint yet, so those specific mutations have no
real server-side role check today. This is consistent with the repo's documented v0 state (mock
data behind most mutating surfaces) and is not a regression introduced by this fix — it will need
to be addressed when the team-management mutation path moves off the mock client.

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/team/+page.server.ts` | Added `listPipelineLeads` + `User` type imports; fetch users and pipeline leads in parallel; merged per-owner `leadCount` onto each mapped user; built `currentUser: User` from `locals.user`; return shape is now `{ users, leads, sort, dir, currentUser }` |

`src/routes/team/+page.svelte` required **no changes** — it already expected exactly this data
shape; only the server load was out of sync with it.

## Verification / Checks Run

- Scoped type check: `bun run check` (project's `svelte-check` script) — **0 errors** (one
  pre-existing, unrelated warning in `leads/[id]/edit/+page.svelte`).
- Manual verification recommended before considering this fully closed: sign in as a manager,
  open `/team`, confirm the Add/Deactivate buttons render, the Leads column shows real counts, and
  clicking Deactivate on a rep with active leads succeeds without a console error.

---

## Honest Limitations

- **Deactivation mutations are still mock-backed.** `crm.updateUser` / `crm.reassignLeads` operate
  on `mockCrmClient`'s in-memory data, not Postgres. Even with this fix, a deactivation performed
  today does not persist across a server restart. This mirrors the rest of the repo's v0 state
  (see `process/context/all-context.md` — "Current Project State").
- **No real server-side role check on the mutation path.** Because deactivation goes through the
  mock client rather than an API route, there is currently no server-enforced 403 specifically
  guarding *who* can deactivate a rep — only the page load and rep-creation endpoint have a real
  gate today. A client with `canManage` forced true (e.g. via devtools) could still invoke
  `toggleActive()`; the blast radius is limited to the mock in-memory store.
- **Same bug pattern exists on a different page, not fixed here.** `src/routes/unassigned/+page.svelte`
  also calls `canReassign(data.currentUser)`, and `src/routes/unassigned/+page.server.ts` does not
  return `currentUser` either — meaning the "Reassign" control on `/unassigned` may have the same
  always-false permission gate. This was intentionally left out of scope for issue #61 (a
  different route/feature area) and is flagged here for a follow-up fix.
