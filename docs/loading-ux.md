# Loading UX — skeletons, pending states, optimistic updates

Three-layer loading feedback system added across all 10 CRM route surfaces.

---

## Architecture overview

```
Layer 1 — Global nav indicator    +layout.svelte   top-bar progress strip
Layer 2 — Route loading shells    RouteShells.svelte  per-route skeleton during cross-route nav
Layer 3 — Per-page data regions   individual +page.svelte  inline skeleton for same-route changes
```

All three layers coexist and cover distinct cases without overlapping.

---

## Layer 1 — Global nav progress bar

**File:** `src/routes/+layout.svelte`

```svelte
{#if navigating.to}
  <div
    class="bg-primary animate-pulse fixed left-0 right-0 top-0 z-50 h-0.5"
    role="progressbar"
    aria-label="Loading page"
    data-testid="nav-progress"
  ></div>
{/if}
```

- Driven by `navigating` from `$app/state` (Svelte 5, NOT deprecated `$app/stores`).
- Always visible during any SvelteKit navigation: cross-route, same-route filter/pagination, or programmatic `goto()`.
- Thin 2px strip at the top — never covers content.
- `animate-pulse` gives a breathe effect instead of a progress animation (no indeterminate spinner needed).

---

## Layer 2 — Route loading shells

**Key insight:** destination `+page.svelte` components do NOT mount until the server `load()` function
completes. Any `navigating.to` check inside the destination page fires too late — the skeleton is
never visible. Fix: render skeletons from `+layout.svelte`, which persists across all navigations.

**Signal:**

```ts
// in +layout.svelte
const isRouteChange = $derived(
  navigating.to !== null && navigating.to.url.pathname !== page.url.pathname
);
```

`isRouteChange` is `true` only for cross-route navigations. Same-route changes (filter/pagination —
same pathname, different search params) return `false`, so the per-page layer handles those.

**Rendering:**

```svelte
{#if isRouteChange && navigating.to}
  <RouteShells pathname={navigating.to.url.pathname} />
{:else}
  {@render children()}
{/if}
```

`RouteShells` is rendered INSIDE `<AppShell>` — the app shell (sidebar, topbar) stays fully
visible during navigation. Only the main content slot swaps.

### RouteShells.svelte

**File:** `src/lib/components/shared/skeletons/RouteShells.svelte`

Takes a `pathname` prop and renders a route-matched loading shell. Each shell preserves static
structure (real page titles, section headings, tabs, toolbars) and skeletons only the dynamic
data regions.

```
/             → Today skeleton: section headings visible, lead rows + counts skeleton
/leads        → Leads skeleton: toolbar + tabs visible, table rows skeleton
/leads/[id]   → Detail skeleton: back link + header shell visible, detail fields skeleton
/leads/new    → New lead form: mostly static, minimal skeleton
/pipeline     → Pipeline skeleton: column headers visible, cards skeleton
/unassigned   → Unassigned skeleton: header visible, list rows skeleton
/review       → Review skeleton: header visible, table rows skeleton
/reminders    → Reminders skeleton: section headers visible, lead rows skeleton
/reports      → Reports skeleton: title visible, chart/data panels skeleton
/team         → Team skeleton: title + actions visible, table rows skeleton
```

Routes that don't match any case get no shell (layout falls through to `children()`).

**Pattern constraint:** static text is real, only data regions are skeletonized. Example from Today shell:

```svelte
<!-- Static — always visible -->
<div class="font-mono text-[11px] uppercase">Overdue</div>
<!-- Dynamic — skeleton -->
<div class="h-4 w-8 animate-pulse rounded bg-muted"></div>  <!-- count badge -->
<LeadRowSkeleton count={2} />                               <!-- lead rows -->
```

---

## Layer 3 — Per-page data region skeletons

For same-route changes (e.g. leads list filter/pagination), `isRouteChange` is `false` — the
page component stays mounted. Each page manages its own `navLoading` flag:

```ts
// Example: leads list
const navLoading = $derived(
  paging || navigating.to?.url.pathname === '/leads'
);
```

`paging` captures programmatic filter changes. `navigating.to?.url.pathname === '/leads'` would
also fire on cross-route nav to `/leads`, but at that point `isRouteChange` is true and the
layout's `RouteShells` takes over — so there's no double-skeleton.

When `navLoading` is true, only the dynamic content region is replaced:

```svelte
{#if navLoading}
  <TableSkeleton rows={8} cols={5} />
{:else}
  <LeadGrid leads={shadowLeads} ... />
{/if}
```

---

## Skeleton primitive

**File:** `src/lib/components/ui/skeleton/skeleton.svelte`

```svelte
<div class={cn('animate-pulse rounded-md bg-muted', className)} {...restProps}></div>
```

- `bg-muted` — warm cream token from the design system (not generic gray)
- `animate-pulse` — Tailwind's default CSS opacity pulse, 2s ease-in-out infinite

### Composite skeletons

| File | Usage |
|---|---|
| `LeadRowSkeleton.svelte` | Stacked lead row placeholders. `count` prop (default 1). |
| `TableSkeleton.svelte` | Table rows. `rows` and `cols` props. |
| `CardSkeleton.svelte` | Card shape (pipeline column card). |
| `DetailSkeleton.svelte` | Lead detail page: header + two-column body. |
| `DashboardSectionSkeleton.svelte` | Report panel / dashboard section. |

All exported from `src/lib/components/shared/skeletons/index.ts`.

---

## Button pending states

**Files:** `src/lib/components/ui/button/button.svelte`, `src/lib/components/shared/Button.svelte`

Added two optional props:

```ts
loading?: boolean       // disables + shows spinner
loadingText?: string    // text to show while loading (default: label unchanged)
```

```svelte
<Button loading={submitting} loadingText="Saving…">Save</Button>
```

- `disabled={loading || !!disabled}` — the `disabled` prop must be destructured explicitly from
  `$$restProps` to prevent the spread from overriding `loading`-induced disable.
- Width is stable (no layout shift) because the spinner and loadingText replace the label in-place.
- Prevents duplicate submissions: the disabled state blocks further clicks while the async is pending.

### Pages that use button pending states

| Surface | State var | Buttons |
|---|---|---|
| Lead detail | `savingWon`, `savingLost`, `reassigning`, `stageMoving` | Mark won, Mark lost, Reassign |
| Pipeline | `savingWon`, `savingLost` | Won/Lost modal confirm |
| Unassigned | `claiming`, `bulkClaiming`, `assigning` | Claim, Bulk claim, Assign |
| Review | `resolving[leadId]` (per-row map) | Resolve |
| Today | `snoozingId` | Snooze |
| Log touch form | `submitting` | Log touch |

---

## Optimistic updates

**Helper file:** `src/lib/utils/optimistic.ts`

```ts
removeFromList(list, id)          // remove item by id — for claim/resolve
patchInList(list, id, patch)      // patch one item in a list — for stage move / pipeline
patchRecord(record, patch)        // patch a single record — for lead detail stage/owner
reconcile(shadow, serverData)     // merge server truth over shadow (reconcile helper)
```

All are pure functions — no side effects, fully testable in Vitest without DOM.
Tests: `src/tests/optimistic.spec.ts` (5 cases: apply + rollback + reconcile).

### Pattern used on every optimistic surface

```ts
const snapshot = shadowLeads;
shadowLeads = removeFromList(shadowLeads, id);  // 1. optimistic update

try {
  const res = await fetch(...);
  if (!res.ok) {
    shadowLeads = snapshot;                     // 2a. rollback on server error
    toasts.push('...');
    return;
  }
} catch {
  shadowLeads = snapshot;                       // 2b. rollback on network error
  toasts.push('...');
  return;
}

await invalidateAll();                          // 3. reconcile with server truth
```

`shadowLeads` is a Svelte 5 writable `$derived`:

```ts
let shadowLeads = $derived(data.leads);
```

This satisfies ESLint's `svelte/prefer-writable-derived` (rejected `$effect` reassignment pattern).
The derived auto-resyncs to `data.leads` whenever the parent `data` prop changes — which happens
after `invalidateAll()` triggers a server `load()` re-run.

### Optimistic surfaces

| Surface | Mutation | Helper used |
|---|---|---|
| Today — snooze | Remove lead from Today queue | `removeFromList` |
| Lead detail — stage move | Patch stage on current lead record | `patchRecord` |
| Lead detail — owner reassign | Patch ownerId on current lead record | `patchRecord` |
| Pipeline — stage move | Patch stage in board list | `patchInList` |
| Pipeline — won/lost | Patch stage + modal confirm | `patchInList` |
| Unassigned — claim | Remove lead from queue | `removeFromList` |
| Unassigned — bulk claim | Remove multiple leads | `removeFromList` in loop |
| Unassigned — assign | Remove lead from queue | `removeFromList` |
| Review — resolve | Remove lead from queue | `removeFromList` via `use:enhance` |

### Review page — use:enhance conversion

The review page originally used a plain `<form method="POST">` with no client-side interactivity.
To add optimistic behavior it was converted to `use:enhance` with a per-row `SubmitFunction`:

```ts
function resolveEnhance(leadId: string): SubmitFunction {
  return ({ cancel }) => {
    if (resolving[leadId]) return cancel();        // duplicate-submit guard
    resolving = { ...resolving, [leadId]: true };
    const snapshot = shadowLeads;
    shadowLeads = removeFromList(shadowLeads, leadId);

    return async ({ result }) => {
      resolving = { ...resolving, [leadId]: false };
      if (result.type === 'success' || result.type === 'redirect') {
        await invalidateAll();
      } else {
        shadowLeads = snapshot;                   // rollback
        toasts.push('Could not resolve — please try again');
      }
    };
  };
}
```

`resolving` is a `Record<string, boolean>` (not a single boolean) because multiple rows can be
mid-resolve simultaneously.

---

## What does NOT skeleton

- App shell (sidebar + topbar) — always visible
- Page titles and static headings — always visible
- Filter toolbars, tabs, column headers — always visible
- The `/leads/new` form — static form, only the submit button uses pending state
- Error states — `+error.svelte` renders outside the layout tree (chrome-less by design)

---

## E2e tests

**File:** `e2e/loading-ux.e2e.ts` (`.e2e.ts` suffix — matches `playwright.config.ts` glob `**/*.e2e.{ts,js}`)

5 cases:
1. Global nav progress bar visible during navigation
2. Skeleton visible on leads route during navigation
3. Button disabled while loading
4. Optimistic remove (unassigned claim) — row disappears before server responds
5. Rollback — row reappears if server returns error

Cases 2–5 self-skip when the DB queue is unseeded (Hybrid known-gap — data-dependent tests require
`bun run db:seed` first). Case 1 (nav bar) runs unconditionally.

---

## Known limitations

| Area | Gap |
|---|---|
| Log touch | Pending state only — no optimistic update. Activity list refreshes after `invalidateAll()`. |
| New lead form | No skeleton — form is static. Redirect after submit is the UX. |
| Won/Lost modal | No optimistic stage patch while modal is open (patch fires only on confirm). |
| RouteShells `/leads/[id]/[anything]` | Detail shell matches on prefix — nested routes (if added later) get the detail shell automatically. |
