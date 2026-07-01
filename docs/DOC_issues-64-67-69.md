# Issues #64 · #67 · #69 — Review Form, Pipeline Pagination, Owner Modal Scroll

Implemented: 2026-07-01
Surfaces: `/review`, `/pipeline`, `/leads/[id]`

---

## Issue #69 — Reassign Owner Modal: Scrollable List

### What It Does

The "Reassign owner" modal now scrolls its rep list instead of growing the modal height
unboundedly when there are many active users. The modal header ("Reassign owner") and
footer (Cancel / Reassign) remain fixed and always visible.

### Change

**File:** `src/lib/components/leads/ReassignModal.svelte`

A single wrapper `<div>` was added around the `{#each reps}` list:

```svelte
<!-- Before -->
<div class="flex flex-col gap-1.5">
  {#each reps as u (u.id)}…{/each}
</div>

<!-- After -->
<div class="max-h-[min(60vh,28rem)] overflow-y-auto pr-1">
  <div class="flex flex-col gap-1.5">
    {#each reps as u (u.id)}…{/each}
  </div>
</div>
```

`max-h-[min(60vh,28rem)]` caps the list at whichever is smaller — 60% of the viewport
height or 28 rem — so the modal remains usable on both short and tall screens. `pr-1`
reserves space for the browser scrollbar so it doesn't overlay the button text.

The `{#snippet footer()}` block is rendered by the shared `Modal` component inside
`DialogFooter`, which sits outside the scrollable region and is therefore unaffected.

### Existing behavior preserved

- Selected-owner highlight (`border-primary bg-[rgba(192,54,44,0.06)]`) unchanged.
- `onconfirm` / `onclose` callbacks, disabled state, and the `$effect` that resets
  `selected` to `currentOwnerId` on open — all untouched.

---

## Issue #67 — Pipeline: Per-Stage Lazy Loading & Remove Lost Column

### What It Does

The pipeline board previously loaded every active lead in a single query and rendered all
cards up front. This changes it to:

1. Load only the **first 10 cards per stage** on the initial page load.
2. Fetch additional cards per stage on demand via an **IntersectionObserver sentinel**
   at the bottom of each column (infinite scroll).
3. Remove the **"lost — collapsed"** side column entirely; the five active-stage columns
   (`New`, `Contacted`, `Replied`, `In Discussion`, `Won`) now expand to fill all available
   horizontal space.

### DB Layer

**File:** `src/lib/server/db/leads.ts` — new exported function

```ts
export async function listPipelineStage(
  stage: Stage,
  page: number = 1,
  limit: number = 10
): Promise<{ leads: Lead[]; total: number }>
```

Queries `crm_leads` filtered to a single stage and a single page. Uses the same
event-date-priority sort order as the original `listPipelineLeads()`:

```sql
CASE WHEN event_date >= CURRENT_DATE THEN 0 ELSE 1 END   -- future events first
event_date ASC NULLS LAST                                  -- soonest event next
COALESCE(last_activity_at, created_at) DESC               -- most recently active last
id ASC                                                     -- stable tie-break
```

Returns `{ leads, total }` — `total` is the full count for that stage (used to compute
"N more" in the column header badge and to stop triggering the observer when all cards
are loaded).

### API Endpoint

**File:** `src/routes/api/leads/pipeline-stage/+server.ts` — new file

```
GET /api/leads/pipeline-stage?stage=<stage>&page=<n>&limit=<n>
```

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `stage` | string | — | Must be one of `new`, `contacted`, `replied`, `in_discussion`, `won`. Returns `400` otherwise. |
| `page` | integer | `1` | Clamped to `>= 1`. |
| `limit` | integer | `10` | Clamped to `1–50`. |

Auth: requires `locals.user`; returns `401` if absent.

Response: `{ leads: Lead[], total: number }` — same shape as `listPipelineStage`.

### Server Load

**File:** `src/routes/pipeline/+page.server.ts` — replaced

Runs `listPipelineStage` for all five board stages in parallel, then flattens results:

```ts
const [stageResults, users] = await Promise.all([
  Promise.all(BOARD_STAGES.map((stage) => listPipelineStage(stage, 1, 10))),
  listUsers()
]);

const leads = stageResults.flatMap((r) => r.leads);           // flat list, 10/stage max
const totalsPerStage = Object.fromEntries(                     // total DB count per stage
  BOARD_STAGES.map((stage, i) => [stage, stageResults[i].total])
) as Record<Stage, number>;

return { leads, totalsPerStage, users };
```

`lostCount` is no longer returned — the lost column is removed.

### Pipeline Page (`+page.svelte`)

**File:** `src/routes/pipeline/+page.svelte` — replaced

Three new pieces of state manage lazy loading:

```ts
// Lazily fetched cards beyond the initial 10/stage. Cleared on every invalidateAll().
let extraLeads = $state<Lead[]>([]);

// Tracks which page was last fetched per stage (1 = server already covered this).
let pagesPerStage = $state<Partial<Record<Stage, number>>>({});

// Per-stage loading flag (prevents double-fetch while a request is in-flight).
let loadingPerStage = $state<Partial<Record<Stage, boolean>>>({});

// Combined list passed to the board.
const allLeads = $derived([...shadowLeads, ...extraLeads]);
```

A `$effect` clears `extraLeads` and `pagesPerStage` whenever `data.leads` changes
(i.e. after any `invalidateAll()`), so the board always resets to server truth after
a stage move or won/lost capture:

```ts
$effect(() => {
  void data.leads; // track the derived value
  extraLeads = [];
  pagesPerStage = {};
});
```

`loadMoreForStage(stage)` is the lazy-fetch handler:

```
1. Guard: return if already loading this stage
2. Count current cards for the stage across allLeads
3. Return early if count >= totalsPerStage[stage] (all loaded)
4. Compute nextPage = (pagesPerStage[stage] ?? 1) + 1
5. fetch GET /api/leads/pipeline-stage?stage=…&page=…&limit=10
6. Deduplicate against allLeads (prevents duplicates from concurrent fetches)
7. Append fresh leads to extraLeads
8. Increment pagesPerStage[stage]
```

Optimistic stage moves patch both `shadowLeads` and `extraLeads` so a card dragged from
one column to another moves correctly even when it came from a lazily-loaded page.
Rollback on failure patches both lists back to the original stage.

### PipelineBoard Component

**File:** `src/lib/components/pipeline/PipelineBoard.svelte` — replaced

#### New props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `totalsPerStage` | `Partial<Record<Stage, number>>` | `{}` | Total DB count per stage |
| `loadingPerStage` | `Partial<Record<Stage, boolean>>` | `{}` | In-flight flag per stage |
| `onLoadMore` | `(stage: Stage) => void` | — | Called by the sentinel observer |

#### Column layout

Columns changed from `w-[268px] shrink-0` to `min-w-[220px] flex-1` so all five active
columns share the available space instead of scrolling horizontally at a fixed width.

#### Count badge

The header count badge shows `loaded/total` when more cards remain, or just `loaded` when
all are visible:

```svelte
{col.cards.length}{hasMore ? `/${total}` : ''}
```

#### Infinite-scroll sentinel

An action-based `IntersectionObserver` is attached to a sentinel `<div>` at the bottom of
each column's card list. The sentinel renders only when `hasMore` is true:

```ts
function sentinel(el: HTMLElement, stage: Stage) {
  const obs = new IntersectionObserver(
    (entries) => { if (entries[0]?.isIntersecting) onLoadMore?.(stage); },
    { threshold: 0.1 }
  );
  obs.observe(el);
  return { destroy: () => obs.disconnect() };
}
```

```svelte
{#if hasMore}
  <div use:sentinel={col.stage} class="flex items-center justify-center py-2">
    {#if loading}
      <span class="font-mono text-[11px] text-ink-400">Loading…</span>
    {:else}
      <span class="font-mono text-[11px] text-ink-300">{total - col.cards.length} more</span>
    {/if}
  </div>
{/if}
```

The `{ destroy }` return value from the action ensures the observer is disconnected when
the component unmounts (Svelte calls the destroy function automatically).

#### Lost column removed

The entire "lost — collapsed" sidebar column has been removed. Lost leads are still
reachable through the leads list (`?segment=lost`) and the lead detail page.

### Pagination behaviour after invalidateAll

After any mutation (stage move, won capture, lost capture), `invalidateAll()` triggers a
server reload. The server always returns the first 10 per stage. The `$effect` in the page
clears `extraLeads`, so the board resets to exactly the server-fresh state. Users who had
scrolled deeper will see columns reset to 10 cards; they can scroll to reload more.

---

## Issue #64 — Review Queue: Resolve Button Opens Prefilled Edit Form

### What It Does

The **Resolve** button in the review table no longer immediately marks a lead as resolved.
Instead it opens a modal containing the full lead edit form, prefilled with the lead's
current data. The modal has three footer choices:

| Button | Action |
|--------|--------|
| **Cancel** | Close modal, nothing changes |
| **Save changes** | PATCH the lead's data; lead stays in the review queue |
| **Resolve** | PATCH the lead's data, then mark `needs_review = false`; lead is removed from the queue |

The **Discard** button in each row is unchanged.

### New Component: `LeadEditModal`

**File:** `src/lib/components/leads/LeadEditModal.svelte` — new file

A modal wrapper for the same form fields used on `src/routes/leads/[id]/edit/+page.svelte`.
The form is controlled (all fields are `$state` variables); values are reset to the incoming
`lead` prop whenever `open` becomes `true`.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | `boolean` | yes | Controls modal visibility |
| `lead` | `Lead` | yes | Source of prefill data; also shown as the modal subtitle |
| `saving` | `boolean` | no (default `false`) | Disables all footer buttons and shows "Saving…" label |
| `onclose` | `() => void` | yes | Called when the user clicks Cancel or the overlay |
| `onsave` | `(data) => void` | yes | Called on "Save changes" with the validated payload |
| `onresolve` | `(data) => void` | yes | Called on "Resolve" with the validated payload |

#### Prefill logic

```ts
$effect(() => {
  if (open) {
    name      = lead.name;
    category  = lead.category;
    platform  = lead.platform ?? '';
    location  = lead.location === '—' ? '' : (lead.location ?? '');
    pageUrl   = lead.pageUrl ?? '';
    email     = lead.email ?? '';
    phone     = lead.phone ?? '';
    // … all other fields
    selectedDate = lead.eventDate ? parseDate(lead.eventDate) : undefined;
    formError = '';
  }
});
```

The `if (open)` guard ensures the fields are only reset when the modal is opened, not on
every reactive update while it is already open.

#### Validation

Both "Save changes" and "Resolve" run the same client-side validation via
`leadUpdateSchema.safeParse()` before calling the parent callback. Validation failures set
`formError` and keep the modal open without calling either callback. The validated `parsed.data`
object (not raw state variables) is passed to the callback so the parent always receives a
correctly typed payload.

#### Scrollable body

The form grid is wrapped in `max-h-[60vh] overflow-y-auto pr-1` so the modal remains
usable on short screens without pushing the footer off-screen.

#### Date picker

The event-date field reuses the same nested `Dialog.Root` (shadcn calendar picker) pattern
from the edit page. The inner dialog opens on top of the modal — Radix's portal system
stacks them correctly.

#### Footer structure

```svelte
{#snippet footer()}
  <Button variant="outline" onclick={onclose} disabled={saving}>Cancel</Button>
  <Button variant="outline" onclick={handleSave} disabled={saving || !name}>
    {saving ? 'Saving…' : 'Save changes'}
  </Button>
  <Button onclick={handleResolve} disabled={saving || !name}>
    {saving ? 'Saving…' : 'Resolve'}
  </Button>
{/snippet}
```

`saving` blocks all three buttons simultaneously, preventing a second action from being
triggered while the first fetch is in-flight.

### Review Page Changes

**File:** `src/routes/review/+page.svelte`

#### State added

```ts
let editTarget = $state<Lead | null>(null);   // which lead the modal is open for
let editSaving = $state(false);               // blocks all buttons while any modal action runs
```

#### Row action buttons

The previous layout had three elements per row (Edit button · Resolve form · Discard button).
It is now two (Resolve button · Discard button):

```svelte
<!-- Resolve: opens the modal -->
<button
  disabled={resolving[lead.id] || discarding[lead.id] || editSaving}
  onclick={() => (editTarget = lead)}
  ...
>
  {resolving[lead.id] ? 'Resolving…' : 'Resolve'}
</button>

<!-- Discard: unchanged -->
<button
  disabled={resolving[lead.id] || discarding[lead.id] || editSaving}
  onclick={() => (discardTarget = { id: lead.id, name: lead.name })}
  ...
>
  {discarding[lead.id] ? 'Discarding…' : 'Discard'}
</button>
```

The `<form method="POST" action="?/resolve" use:enhance>` wrapper and the `resolveEnhance`
function were removed. The `enhance` and `SubmitFunction` imports were removed as they are
no longer referenced.

#### `saveEdit(leadData)` — "Save changes" handler

```
1. Guard: return if editTarget is null or editSaving is true
2. Set editSaving = true
3. fetch PATCH /api/leads/{editTarget.id} with JSON payload
   - failure: push toast, return (modal stays open)
   - success: set editTarget = null (close modal), invalidateAll(), push success toast
4. Set editSaving = false (finally)
```

The lead stays in the review queue — only the data is updated. The next server reload
returns the refreshed lead still with `needs_review = true`.

#### `saveAndResolve(leadData)` — "Resolve" handler

```
1. Guard: return if editTarget is null or editSaving is true
2. Set editSaving = true, capture leadId
3. fetch PATCH /api/leads/{leadId} with JSON payload
   - failure: push toast, return (modal stays open, no optimistic change)
4. Close modal (editTarget = null)
5. Capture failedLead (rollback point) and optimistically remove from shadowLeads
6. Set resolving[leadId] = true
7. POST to ?/resolve via FormData { leadId, page }
   - success (res.ok): invalidateAll(), push success toast
   - failure: restore failedLead into shadowLeads, push warning toast
8. Set editSaving = false, resolving[leadId] = false (finally)
```

The two-step approach (PATCH first, then resolve) means data changes are always persisted
before the lead is removed from the queue. If the PATCH fails the lead stays in the queue
with the modal still open. If the PATCH succeeds but the resolve call fails, the data is
saved but the lead remains in the queue — a retry is safe because the PATCH is idempotent
and the resolve action guards against already-resolved leads.

#### Calling `?/resolve` via `fetch`

The existing `resolve` server action uses `redirect(303, ...)` on success and `fail(4xx)`
on error. Calling it with `fetch + FormData` works because:

- SvelteKit CSRF protection checks the `Origin` header; a same-origin browser fetch sets
  `Origin` to the same value as the server's host, so the check passes.
- `fetch` follows the 303 redirect automatically; the final response is the redirect
  target's `200` page, so `res.ok === true` signals success.
- `fail(...)` returns a 4xx response; `res.ok === false` signals failure.

```ts
const formData = new FormData();
formData.set('leadId', leadId);
formData.set('page', String(data.pagination.page));
const resolveRes = await fetch('?/resolve', { method: 'POST', body: formData });
```

#### Modal usage

```svelte
{#if editTarget}
  <LeadEditModal
    open={true}
    lead={editTarget}
    saving={editSaving}
    onclose={() => (editTarget = null)}
    onsave={saveEdit}
    onresolve={saveAndResolve}
  />
{/if}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/components/leads/ReassignModal.svelte` | Added `max-h / overflow-y-auto` wrapper around owner list |
| `src/lib/server/db/leads.ts` | Added `listPipelineStage(stage, page, limit)` |
| `src/routes/api/leads/pipeline-stage/+server.ts` | **New** — `GET` handler for per-stage lazy loading |
| `src/routes/pipeline/+page.server.ts` | Replaced — loads 10/stage + `totalsPerStage` |
| `src/routes/pipeline/+page.svelte` | Replaced — lazy-load state, `allLeads` derived, `loadMoreForStage` |
| `src/lib/components/pipeline/PipelineBoard.svelte` | Replaced — sentinel observer, flex-1 columns, lost column removed |
| `src/lib/components/leads/LeadEditModal.svelte` | **New** — prefilled edit form modal with 3-button footer |
| `src/routes/review/+page.svelte` | Resolve opens modal; `saveEdit` + `saveAndResolve` handlers; removed `resolveEnhance` |

---

## Honest Limitations

- **Pipeline reset on mutation.** After a drag-and-drop or won/lost capture, `invalidateAll()`
  reloads the server data (10/stage) and clears `extraLeads`. Users who scrolled past 10 in a
  column will see it reset. A future improvement could re-fetch previously loaded pages after
  reconciliation.

- **No server-side guard on the resolve call from `saveAndResolve`.** If `PATCH` succeeds but
  `?/resolve` fails (e.g. the lead was deleted between the two calls), the optimistic removal is
  rolled back and a warning toast is shown. The PATCH data change is already persisted at this
  point and is not rolled back.

- **IntersectionObserver not available in SSR.** The `sentinel` action uses
  `IntersectionObserver` which is browser-only. The action is wired via `use:` inside the
  component and only runs client-side — SvelteKit's SSR pass never calls it, so there is no
  server-side error. Cards beyond the first 10 are simply not rendered during SSR.

- **`LeadEditModal` does not validate uniqueness or server-side constraints.** The
  `leadUpdateSchema` runs only client-side Zod validation. Any server-side constraint violations
  (e.g. a name uniqueness rule added in the future) surface as a generic error toast.

- **"lost — collapsed" sidebar permanently removed.** Lost leads are no longer surfaced on the
  pipeline board at all. Access them via `/leads?segment=lost`.
