# Issue #50 — Discard Lead

Implemented: 2026-06-30
Surfaces: `/review`, `/leads/[id]`

---

## What It Does

Adds a **Discard** action that soft-deletes a lead — setting its `deleted_at` timestamp — without
permanently removing the row from the database. Discarded leads disappear from every active queue
(leads list, pipeline, unassigned, review, reminders, today) immediately, but the row and its full
audit history remain in the database and can be recovered by querying `WHERE deleted_at IS NOT NULL`.

The action appears in two places:

| Surface | Location | Confirmation |
|---------|----------|--------------|
| `/review` | Beside the **Resolve** button on each row | `DiscardIssueModal` |
| `/leads/[id]` | Beside the **Edit** button in the page header | `DiscardIssueModal` |

Both surfaces share a single modal component and the same API endpoint.

---

## Data Model

No schema change was required. `crm_leads` already carries a `deleted_at` column used for
soft-deletes throughout the application:

```ts
// src/lib/server/db/schema.ts
deletedAt: timestamp('deleted_at', { withTimezone: true })
```

Every existing read query in the codebase filters `WHERE deleted_at IS NULL`, so setting this
field to a non-null timestamp is sufficient to hide the lead from all surfaces without touching
any query.

The discard action additionally writes one audit row to `crm_lead_history`:

| field | value |
|-------|-------|
| `field` | `'discarded'` |
| `old_value` | `null` |
| `new_value` | `'true'` |

This makes the discard event traceable in the same audit trail as stage changes, owner reassignments,
and deal-value updates.

---

## API Endpoint

**`DELETE /api/leads/[id]/discard`**

File: `src/routes/api/leads/[id]/discard/+server.ts`

### Auth

Requires an authenticated session (`locals.user`). Returns `401` if the user is not logged in.
In v0, `DEV_BYPASS` in `hooks.server.ts` injects a fake manager session so the endpoint is
reachable without a real login.

### Request

No request body. The lead ID is taken from the URL path segment `[id]`.

### Logic

```
1. Guard: 401 if locals.user is absent
2. UPDATE crm_leads
     SET deleted_at = NOW(), updated_at = NOW()
   WHERE id = :id AND deleted_at IS NULL
   RETURNING id
3. 404 if no row was updated (lead not found or already discarded)
4. INSERT INTO crm_lead_history
     (lead_id, actor_user_id, field, old_value, new_value)
   VALUES (:id, :actorId, 'discarded', null, 'true')
5. Return 200 JSON { id }
```

The `WHERE deleted_at IS NULL` predicate on the UPDATE makes the operation idempotent-safe: a
double-submit or race condition cannot discard an already-discarded lead, and a 404 is returned
instead of silently succeeding.

### Responses

| Status | Condition |
|--------|-----------|
| `200 { id }` | Lead soft-deleted and audit row written |
| `401` | No authenticated session |
| `404` | Lead not found or already discarded |

---

## Shared Modal Component

**`src/lib/components/leads/DiscardIssueModal.svelte`**

A thin wrapper over the project's shared `Modal` + shadcn `Button` components. It has no internal
state beyond what is passed in via props — all loading and open/close state is owned by the parent.

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | `boolean` | yes | Controls modal visibility |
| `leadName` | `string` | yes | Displayed in the confirmation message |
| `onclose` | `() => void` | yes | Called when the user clicks Cancel or the overlay |
| `onconfirm` | `() => void` | yes | Called when the user clicks "Yes, discard" |
| `saving` | `boolean` | no (default `false`) | Disables buttons and shows spinner on the confirm button |

### Structure

```
Modal (width=420, title="Discard this lead?")
  body:  "Are you sure you want to discard {leadName}? …"
  footer:
    [Cancel]           variant=outline  flex-1
    [Yes, discard]     variant=destructive  flex-2  loading={saving}
```

The modal renders nothing beyond this — no form, no select, no textarea. It is a pure
confirmation dialog.

### Usage

```svelte
<DiscardIssueModal
  open={discardOpen}
  leadName={lead.name}
  saving={mutating}
  onclose={() => (discardOpen = false)}
  onconfirm={confirmDiscard}
/>
```

---

## Integration: Review Page (`/review`)

File: `src/routes/review/+page.svelte`

### State added

```ts
// Which lead is being targeted for discard; null when modal is closed
let discardTarget = $state<{ id: string; name: string } | null>(null);

// Per-lead in-flight guard (prevents double-submit while the API call is in-flight)
let discarding = $state<Record<string, boolean>>({});
```

### Button placement

The Discard button is placed inside a `<div class="flex items-center justify-end gap-2">` wrapper
that also contains the existing Resolve form. Both buttons disable when either action is in-flight
for that row (using `resolving[lead.id] || discarding[lead.id]`), preventing a resolve and discard
from racing.

```svelte
<div class="flex items-center justify-end gap-2">
  <!-- existing Resolve form -->
  <form ...>...</form>

  <!-- new Discard button -->
  <button
    disabled={resolving[lead.id] || discarding[lead.id]}
    onclick={() => (discardTarget = { id: lead.id, name: lead.name })}
    ...
  >
    {discarding[lead.id] ? 'Discarding…' : 'Discard'}
  </button>
</div>
```

### `confirmDiscard()` flow

```
1. Guard: return if discardTarget is null or already in-flight
2. Set discarding[target.id] = true
3. Capture the lead as failedLead (rollback point)
4. Optimistically remove from shadowLeads via removeFromList()
5. Close modal immediately (discardTarget = null)
6. fetch DELETE /api/leads/{id}/discard
   - success → invalidateAll() (reconciles shadow with server truth)
   - failure → restore failedLead into shadowLeads, push toast
7. Set discarding[target.id] = false (finally)
```

The optimistic remove uses the same `removeFromList` utility and rollback pattern as the existing
`resolveEnhance` function.

### No server action needed

Unlike Resolve (which uses a SvelteKit form action `?/resolve`), Discard uses a direct `fetch`
call to the REST endpoint. This avoids adding a second form action to `+page.server.ts` and keeps
the modal-gated confirm flow entirely in client JS.

---

## Integration: Lead Detail Page (`/leads/[id]`)

File: `src/routes/leads/[id]/+page.svelte`

### State added

```ts
let discardOpen = $state(false);
```

No separate loading state is needed — the page already has a single shared `mutating` guard that
blocks all concurrent actions (stage change, won, lost, reassign). Discard plugs into the same
guard.

### Button placement

The Discard button is placed immediately after the Edit link, inside the `{#if canEdit}` block:

```svelte
{#if canEdit}
  <a href="/leads/{lead.id}/edit" ...>Edit</a>

  <button
    disabled={mutating}
    onclick={() => (discardOpen = true)}
    class="... text-red-500 hover:border-red-300 hover:bg-red-50 ..."
  >
    Discard
  </button>
{/if}
```

The button is red-tinted to signal a destructive action, consistent with the project's use of
red for `Mark lost` and `destructive` button variants.

### `confirmDiscard()` flow

```
1. Guard: return if mutating
2. mutating = true
3. discardOpen = false (close modal immediately)
4. fetch DELETE /api/leads/{id}/discard
   - success → goto('/leads')  (lead is now hidden; staying on the detail page would 404)
   - failure → push toast, return
5. mutating = false (finally)
```

After a successful discard the page navigates to `/leads` using SvelteKit's `goto`. Staying on
the detail page would cause a 404 on the next server load because the lead would no longer match
`WHERE deleted_at IS NULL` in `getLead()`.

### Import changes

```ts
// Added to existing imports
import { invalidateAll, goto } from '$app/navigation'; // goto added
import DiscardIssueModal from '$lib/components/leads/DiscardIssueModal.svelte'; // new
```

---

## Permission Model

| Who can discard | Where |
|-----------------|-------|
| The lead's owner | `/leads/[id]` (guarded client-side by `canEdit`) |
| Any manager | `/leads/[id]` (guarded client-side by `canEdit`) |
| Anyone (no client guard) | `/review` |

The review page does not have a `me` context in its current server load, so the Discard button
there is unguarded on the client. The API endpoint itself only checks for an authenticated session,
not ownership or role. This mirrors how the existing Resolve action on the review page works —
the review queue is considered a manager surface.

> **Future hardening:** when Better Auth is live, the `/api/leads/[id]/discard` endpoint should
> verify that `locals.user.role === 'manager' || lead.ownerId === locals.user.id` before
> proceeding, consistent with the pattern in `canEditLead()`.

---

## Soft-Delete Behavior

Once `deleted_at` is set:

| Query / surface | Behavior |
|-----------------|----------|
| `listLeads()` | Lead excluded (`WHERE deleted_at IS NULL`) |
| `listLeadsFiltered()` | Lead excluded |
| `listPipelineLeads()` | Lead excluded |
| `listUnassignedLeads()` | Lead excluded |
| `getLead(id)` | Returns `null` → `404` on the detail page |
| `getTodayQueue()` | Lead excluded |
| `getRemindersQueue()` | Lead excluded |
| Review queue load | Lead excluded |
| `getNavCounts()` | Lead excluded from all badge counts |
| `claimLead()` | UPDATE targets `WHERE deleted_at IS NULL` — no-op |
| `updateLead()` | UPDATE targets `WHERE deleted_at IS NULL` — no-op |
| `moveLeadStage()` | UPDATE targets `WHERE deleted_at IS NULL` — no-op |
| `logLeadTouch()` | SELECT FOR UPDATE targets `WHERE deleted_at IS NULL` — returns null |

**No existing query needed to be changed.** Every read path already carried `isNull(deletedAt)`.

The row itself — including all `crm_activities` and `crm_lead_history` rows — is retained in the
database. Recovery requires a direct SQL update: `UPDATE crm_leads SET deleted_at = NULL WHERE id = '...'`.

---

## Optimistic UI Summary

| Surface | Optimistic action | Rollback trigger |
|---------|------------------|-----------------|
| `/review` | Row removed from `shadowLeads` immediately on confirm | `fetch` non-ok or network error |
| `/leads/[id]` | Modal closes, page navigates to `/leads` | `fetch` non-ok: toast shown, no navigation |

The review page rolls back by re-inserting the captured `failedLead` into `shadowLeads`.
The lead detail page does not apply an optimistic remove — navigation happens only on success.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/components/leads/DiscardIssueModal.svelte` | **New** — shared confirm modal |
| `src/routes/api/leads/[id]/discard/+server.ts` | **New** — `DELETE` handler |
| `src/routes/review/+page.svelte` | Added Discard button, `discardTarget`/`discarding` state, `confirmDiscard()`, modal |
| `src/routes/leads/[id]/+page.svelte` | Added Discard button, `discardOpen` state, `confirmDiscard()`, modal, `goto` import |

---

## Honest Limitations

- **No ownership check on the API.** Any authenticated user can discard any lead via a direct
  `DELETE` call. The client-side `canEdit` guard on `/leads/[id]` is not enforced server-side.
- **No undo in the UI.** Recovery requires a direct DB query. A future "Restore" action could
  clear `deleted_at` via a symmetric endpoint.
- **Review page has no auth guard on the client.** All review-queue visitors see the Discard
  button regardless of role. Suitable for a manager-only surface; would need a role check if the
  review queue is opened to reps.
- **`discard` history field is a plain string.** The `crm_lead_history.field` column is `text`,
  not an enum. The value `'discarded'` is a convention, not a DB-enforced constraint.
