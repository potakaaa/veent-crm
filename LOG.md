# Change Log

Reverse-chronological log of shipped feature work.

## 2026-06-30 — Loading UX (skeletons, button pending states, optimistic updates)

App-wide loading feedback in three layers:

- **Skeleton primitive + composites** — new `ui/skeleton` primitive (warm-cream `bg-muted`
  `animate-pulse`) plus `LeadRowSkeleton`, `TableSkeleton`, `CardSkeleton`, `DetailSkeleton`,
  `DashboardSectionSkeleton` (barrel at `lib/components/shared/skeletons`). Wired into all 10
  route pages, shown only while navigating TO that route (already-loaded content is never blanked).
- **Global nav indicator** — top-bar progress strip in `+layout.svelte` driven by `navigating`
  from `$app/state`; visible during real navigations only.
- **Button pending states** — additive optional `loading` / `loadingText` props on both
  `ui/button/button.svelte` and `shared/Button.svelte` (disabled + spinner + stable width;
  duplicate-submit protection). Existing call sites unchanged when props are omitted.
- **Optimistic updates with rollback** — snooze (Today), stage change (detail + pipeline),
  claim/bulk-claim/assign (unassigned), reassign owner (detail), and review resolve mutate a
  local writable `$derived` shadow immediately, reconcile via `invalidateAll()` on success, and
  roll back + toast on failure. Log-touch stays pending-only. Review page converted from a plain
  native form to `use:enhance` for client-side pending + optimistic remove.

Files: created `lib/components/ui/skeleton/{skeleton.svelte,index.ts}`,
`lib/components/shared/skeletons/{LeadRowSkeleton,TableSkeleton,CardSkeleton,DetailSkeleton,DashboardSectionSkeleton}.svelte`

- `index.ts`, `lib/utils/optimistic.ts`, `src/tests/optimistic.spec.ts`, `e2e/loading-ux.e2e.ts`.
  Modified: `ui/button/button.svelte`, `shared/Button.svelte`, `leads/LeadListRow.svelte`,
  `leads/LogTouchForm.svelte`, `leads/StageControl` (caller), `+layout.svelte`, and all 10 route
  `+page.svelte` files.

Verification: `bun run check` 0 errors, `bun run lint` 0 errors, `bun run test:unit:ci` green
(incl. `optimistic.spec.ts` 5/5). e2e (`loading-ux.e2e.ts`) runs green — nav-bar case passes;
the 4 data-dependent optimistic/pending cases self-skip when the Unassigned queue is unseeded
(Hybrid known-gap).
