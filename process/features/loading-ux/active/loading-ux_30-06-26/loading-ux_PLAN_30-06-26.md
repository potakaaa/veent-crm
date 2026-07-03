---
name: plan:loading-ux
description: Skeleton loaders, button pending states, and optimistic updates across the Veent CRM
date: 30-06-26
feature: loading-ux
---

# Loading UX — Implementation Plan (COMPLEX)

**Date**: 30-06-26
**Status**: Active — ready for VALIDATE
**Complexity**: COMPLEX

**TL;DR:** Add app-wide loading feedback in three layers — (1) reusable Skeleton primitive + composites shown during real SvelteKit navigations, (2) a `loading` prop on both Button components giving every mutation a pending/disabled state with duplicate-submit protection, and (3) optimistic list/record updates with rollback-on-failure for snooze, stage change, claim, reassign, and review actions. Log touch stays pending-only (`invalidateAll`). Verified by `bun run check`, vitest pure-logic tests, and Playwright e2e for pending/optimistic/rollback behavior.

---

## Overview

The CRM currently shows no loading affordance. Every server-loaded page renders only after the SSR load resolves (blank/frozen during navigation), and every mutation uses a hand-rolled `saving = $state(false)` boolean with manual `disabled={saving}` bindings and a hard `await invalidateAll()` reconcile. There is no skeleton primitive and `navigating` from `$app/state` is unused.

This plan introduces three coordinated layers without changing the existing fetch-based mutation architecture or the `svelte-sonner` toast system (`toasts.push/success` via `src/lib/stores/toasts.svelte.ts`).

## Goals

1. **Perceived-speed skeletons** — every server-loaded page shows a structural skeleton during actual navigation, plus a global top-bar progress indicator. Never blank already-loaded content.
2. **Honest button pending states** — a `loading` prop on the shared Button gives every mutation a disabled, width-stable, labeled pending state and blocks duplicate submissions.
3. **Optimistic updates with rollback** — snooze, stage change, claim, reassign, and review actions mutate a local `$state` shadow immediately, reconcile via `invalidateAll()` on success, and roll back + toast on failure.

## Scope

**In scope:** Skeleton primitive + 5 composites; global nav indicator in the app layout; per-page skeleton wiring for 10 routes; `loading` prop on both Button components; pending states on ~10 mutation handlers; optimistic shadow + rollback on 5 mutation classes; vitest + Playwright tests; LOG.md update.

**Out of scope:** Changing the fetch→invalidateAll mutation pattern; replacing `svelte-sonner`; adding a component test harness (`@testing-library/svelte`); auth, schema, API-contract, or DB changes. No new runtime surfaces. Log-touch is explicitly pending-only (too many derived fields to optimistic-update cleanly).

---

## Touchpoints

**Read for context (do not modify unless listed below):**
- `src/lib/components/ui/button/button.svelte` — base shadcn button (tailwind-variants)
- `src/lib/components/shared/Button.svelte` — legacy-variant wrapper
- `src/lib/stores/toasts.svelte.ts` — toast API (`toasts.push/success/dismiss`)
- `src/routes/+layout.svelte` / AppShell — global layout host for nav indicator
- All 10 route `+page.svelte` files + their `+page.server.ts` loaders

**Will be changed or created:** see Blast Radius.

## Public Contracts

These are visible to all call sites and must stay backward-compatible:

1. **`Skeleton` primitive** — `src/lib/components/ui/skeleton/` with `index.ts` barrel. Props: `class?: string` (+ standard `HTMLAttributes<HTMLDivElement>`). Renders a `div` with `animate-pulse` + warm-cream/panel token background. Import: `import { Skeleton } from '$lib/components/ui/skeleton'`.
2. **Skeleton composites** — `LeadRowSkeleton`, `TableSkeleton` (props: `rows?: number`, `cols?: number`), `CardSkeleton`, `DetailSkeleton`, `DashboardSectionSkeleton`. Exported from a `src/lib/components/shared/skeletons/` barrel.
3. **Button `loading` prop (additive, optional)** — added to BOTH `ui/button/button.svelte` and `shared/Button.svelte`. Contract: `loading?: boolean` (default `false`). When `true`: button is `disabled`, width stays stable (no layout shift), a spinner renders, and `loadingText?: string` (optional) replaces children. Default behavior unchanged when prop omitted → existing call sites are unaffected.
4. **Global nav indicator** — top-bar progress bar driven by `navigating` from `$app/state` in the app layout. No new exported API; purely visual.

No schema, no API route, no auth surface touched. Risk class: **UI-only, low**.

## Blast Radius

**Risk class:** UI-only, low. No schema / API / auth / billing / migration surface. ~28 files (8 create, ~20 modify). The largest risk is regression in existing mutation handlers (duplicate-submit guard + optimistic rollback logic), mitigated by per-handler Playwright coverage.

### Files to CREATE (8)
1. `src/lib/components/ui/skeleton/skeleton.svelte` — generic primitive (from `npx shadcn-svelte add skeleton`)
2. `src/lib/components/ui/skeleton/index.ts` — barrel export
3. `src/lib/components/shared/skeletons/LeadRowSkeleton.svelte`
4. `src/lib/components/shared/skeletons/TableSkeleton.svelte`
5. `src/lib/components/shared/skeletons/CardSkeleton.svelte`
6. `src/lib/components/shared/skeletons/DetailSkeleton.svelte`
7. `src/lib/components/shared/skeletons/DashboardSectionSkeleton.svelte`
8. `src/lib/components/shared/skeletons/index.ts` — composite barrel

### Files to MODIFY
**Button + layout (3):**
9. `src/lib/components/ui/button/button.svelte` — add `loading` + `loadingText` props, spinner, stable width, disabled-when-loading
10. `src/lib/components/shared/Button.svelte` — pass through `loading`/`loadingText`
11. `src/routes/+layout.svelte` (or AppShell.svelte) — global `navigating` progress bar

**Pages — skeleton + pending + optimistic (10 `+page.svelte`, some with optimistic shadow):**
12. `src/routes/+page.svelte` (Today) — page skeleton; snooze pending + optimistic remove/rollback; nudge pending (stub)
13. `src/routes/leads/+page.svelte` (Leads list) — page skeleton via `navigating` + existing `paging`
14. `src/routes/leads/[id]/+page.svelte` (Lead detail) — DetailSkeleton; pending on logTouch/selectStage/confirmWon/confirmLost/confirmReassign; optimistic stage + owner
15. `src/routes/leads/new/+page.svelte` (New lead) — create pending; existing `saving`/`error` adapted
16. `src/routes/pipeline/+page.svelte` (Pipeline) — page skeleton; stage-change pending + optimistic
17. `src/routes/unassigned/+page.svelte` (Unassigned) — page skeleton; claim/bulkClaim/assignTo pending + optimistic remove
18. `src/routes/review/+page.svelte` (Review) — page skeleton; resolve pending (must ADD `use:enhance` — see step 20) + optimistic remove
19. `src/routes/reminders/+page.svelte` (Reminders) — page skeleton
    > **SUPERSEDED (02-07-26) by sitewide-ux-refresh Phase 5, AC13 (Theme F).** This plan
    > originally scoped Reminders (item 19) to a page skeleton ONLY, deliberately excluding the
    > snooze optimistic-remove/rollback pattern that Today (item 12) received. That exclusion is
    > now reversed by an explicit SPEC decision: Reminders' Snooze button was aligned UP to Today's
    > mature optimistic pattern (`snoozing` pending state, `removeFromList()` optimistic remove,
    > per-lead rollback, `snoozing` prop passed to the shared `LeadListRow`, plus an `aria-live`
    > announcement). See
    > `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-05-token-sweep_PLAN_02-07-26.md`
    > (Step C) and its phase report. Recorded here so the two plans stay reconciled rather than
    > silently diverging.
20. `src/routes/reports/+page.svelte` (Reports) — page skeleton
21. `src/routes/team/+page.svelte` (Team) — page skeleton

**Tests (create/modify):**
22. `src/tests/optimistic.spec.ts` (CREATE) — pure-logic vitest for shadow-mutate/rollback helper
23. `e2e/loading-ux.spec.ts` (CREATE) — Playwright: pending disables, rollback, reconcile, no-duplicate-submit

**Docs:**
24. `LOG.md` — append feature entry (CREATE if absent — file does not currently exist at repo root)

---

## Decision Log (locked by orchestrator/INNOVATE)

| # | DECISION | WHY | REJECTED |
|---|----------|-----|----------|
| 1 | Global nav indicator via `navigating` ($app/state) coexists with per-page `paging` | Centralizes most loading feedback; per-page boolean stays for in-page async | Ripping out all per-page booleans (bigger blast radius, no gain) |
| 2 | Generic Skeleton primitive + 5 composites | Reuse + consistent warm-cream style | Per-page bespoke skeletons (duplication) |
| 3 | Optimistic via local mutable `$state` shadow | Required by spec; Svelte 5 runes native | Server-driven optimistic (no infra) |
| 4 | No new component test harness — Playwright + vitest only | `@testing-library/svelte` absent; e2e covers UI behavior | Adding harness (scope creep) |
| 5 | Add `loading` to BOTH Button components | Call sites use either; keep both consistent | Only base button (legacy wrapper misses it) |
| 6 | `invalidateAll()` stays the reconcile mechanism | Existing pattern, proven | Manual cache patching |
| 7 | On optimistic failure: rollback shadow + `toasts.push(errorMsg)` | Matches existing error UX | Silent failure / page reload |
| 8 | Log-touch = pending-only (no optimistic) | Too many derived fields to shadow cleanly | Optimistic log-touch (fragile) |

---

## Optimistic Update Pattern (canonical — apply to all 5 classes)

```
// 1. shadow copy of the list/record
let rows = $derived(data.items)   // writable $derived — auto-resyncs to server truth after invalidateAll()

async function action(target) {
  if (pending) return                 // duplicate-submit guard
  pending = true
  const snapshot = rows               // capture for rollback
  rows = applyOptimistic(rows, target) // mutate shadow immediately
  try {
    const res = await fetch(endpoint, { method: 'POST', ... })
    if (!res.ok) { rows = snapshot; toasts.push(errMsg); return }
    await invalidateAll()             // reconcile shadow with server truth
    toasts.success(okMsg)
  } catch {
    rows = snapshot                    // rollback on network error
    toasts.push('Network error')
  } finally {
    pending = false
  }
}
```

Note: after `invalidateAll()`, the shadow must re-sync from the new `data` prop. Use `$effect`/`$derived` reconciliation so server truth wins after reload. **VALIDATE pinned the exact recipe — see Validate Contract execute-agent instruction E1.** Document this re-sync explicitly in each page during EXECUTE.

### Pending-text map (per spec)
| Action | Pending text |
|--------|--------------|
| logTouch | "Logging…" |
| snooze | "Snoozing…" |
| create | "Creating…" |
| selectStage / stage change | "Moving…" |
| confirmWon / confirmLost | "Saving…" |
| confirmReassign | "Saving…" |
| claim / bulkClaim / assignTo | "Claiming…" |
| resolve (review) | "Saving…" |

### Optimistic classes (with rollback)
| Action | Optimistic effect | Rollback |
|--------|-------------------|----------|
| snooze (Today) | remove/move lead from Today bucket | restore snapshot |
| stage change (detail + pipeline) | set `lead.stage` locally | restore prior stage |
| claim (unassigned) | remove from unassigned list | restore row |
| reassign owner (detail) | update owner display | restore prior owner |
| review resolve | remove from review queue | restore row |
| logTouch | **none** — pending + invalidateAll only | n/a |

---

## Implementation Checklist (ordered, atomic)

### Phase A — Foundation
1. Run `npx shadcn-svelte@latest add skeleton` (or hand-create if non-interactive). Confirm output lands at `src/lib/components/ui/skeleton/skeleton.svelte` + `index.ts`. Adjust background to warm-cream/panel token; keep `animate-pulse`.
2. Create `src/lib/components/shared/skeletons/LeadRowSkeleton.svelte` (one lead-row shaped skeleton).
3. Create `TableSkeleton.svelte` (props `rows=5`, `cols=4`; composes `Skeleton`).
4. Create `CardSkeleton.svelte`.
5. Create `DetailSkeleton.svelte` (lead-detail layout shape).
6. Create `DashboardSectionSkeleton.svelte` (Today/Reports section shape).
7. Create `src/lib/components/shared/skeletons/index.ts` barrel exporting all 5 + re-export `Skeleton`.
8. Run `bun run check` — confirm all new components typecheck.

### Phase B — Button enhancement
9. Edit `src/lib/components/ui/button/button.svelte`: add `loading?: boolean` (default false) + `loadingText?: string` props. When `loading`: set `disabled` (OR with existing `disabled` — see E2: destructure `disabled` out of `restProps` and write `disabled={loading || disabled}` so the spread does not override it), render an inline spinner (`animate-spin` svg sized via existing `[&_svg]` rules), and render `loadingText` snippet/text instead of `children` when provided. Keep width stable (do not shrink content; use `min-w` or render spinner alongside hidden-width children).
10. Edit `src/lib/components/shared/Button.svelte`: accept and forward `loading`/`loadingText` to `UiButton`. The typed `...rest` is `& HTMLButtonAttributes` and DROPS `loading`/`loadingText` (not part of that type) — add them as EXPLICIT props and forward explicitly, do not rely on `{...rest}`.
11. Run `bun run check`.

### Phase C — Global nav indicator
12. Edit `src/routes/+layout.svelte` (or AppShell.svelte): import `navigating` from `$app/state` (the layout already imports `page` from `$app/state`); render a fixed top progress bar shown only while `navigating.to` is truthy. Do NOT cover/hide already-rendered content.
13. Run `bun run check`.

### Phase D — Per-page skeletons + pending + optimistic (one page at a time, A→Z by route)
14. **Today (`/`)**: add DashboardSectionSkeleton during `navigating`; snooze → pending text "Snoozing…" + optimistic remove from Today bucket + rollback; nudge → pending only (toast stub). NOTE: current page reads `data.leads` directly via `$derived(groups)` — convert to a `$state` shadow + E1 reconcile for optimistic.
15. **Leads list (`/leads`)**: page skeleton (TableSkeleton/LeadRowSkeleton) shown during `navigating` or existing `paging`. No mutations.
16. **Lead detail (`/leads/[id]`)**: DetailSkeleton during nav; pending on logTouch ("Logging…", no optimistic), selectStage ("Moving…", optimistic stage + rollback), confirmWon/confirmLost ("Saving…"), confirmReassign ("Saving…", optimistic owner + rollback). All guard duplicate submit.
17. **New lead (`/leads/new`)**: create → "Creating…" pending; reuse/rename existing `saving`/`error` $state; block double-submit; keep goto on success.
18. **Pipeline (`/pipeline`)**: page skeleton; stage-change → "Moving…" pending + optimistic `lead.stage` + rollback.
19. **Unassigned (`/unassigned`)**: page skeleton; claim/bulkClaim/assignTo → "Claiming…" pending + optimistic remove from list + rollback.
20. **Review (`/review`)**: page skeleton; resolve action. NOTE (corrected by VALIDATE): the page currently uses a PLAIN native `<form method="POST" action="?/resolve">` with a raw `<button>` — `use:enhance` is NOT present and must be ADDED. Steps: add `import { enhance } from '$app/forms'`; convert `data.leads` to a local `$state` shadow; wire `use:enhance` with submit/result callbacks for pending + optimistic remove from review queue + rollback on failure; swap the raw `<button>` to the Button component (or wire manual `disabled` during submit). See execute-agent instruction E3.
21. **Reminders (`/reminders`)**: page skeleton during nav.
22. **Reports (`/reports`)**: page skeleton (DashboardSectionSkeleton) during nav; guard ECharts mount until data present.
23. **Team (`/team`)**: page skeleton during nav.
24. Run `bun run check` after every 2–3 pages; final `bun run check` after the last page.

### Phase E — Tests
25. Create `src/tests/optimistic.spec.ts`: extract the shadow-mutate/rollback logic into a tiny pure helper (e.g. `applyOptimistic`/`rollback` in `src/lib/utils` or inline-testable) and unit-test: apply mutates copy not original; rollback restores snapshot; reconcile prefers server data.
26. Create `e2e/loading-ux.spec.ts` (Playwright): (a) pending disables button during async op; (b) failed optimistic action rolls back (route intercept → 500); (c) successful optimistic reconciles with server; (d) rapid double-click fires exactly one request (no duplicate submission).
27. Run `bun run test:unit:ci` (vitest `--run`; NEVER bare `bun run test:unit`, which is watch-mode and hangs), then `bun run test:e2e` (with `DEV_BYPASS=true`). Fix failures inline.

### Phase F — Lint + Log
28. Run `bun run lint` (Prettier + ESLint); run `bun run format` if needed.
29. Append a feature entry to `LOG.md` (what shipped, files, date 30-06-26). Create `LOG.md` if it does not exist (it currently does not — see E4).

---

## Acceptance Criteria (testable)

| # | Criterion | proven by | strategy |
|---|-----------|-----------|----------|
| AC1 | Skeleton primitive + 5 composites exist, typecheck, and use warm-cream/pulse style | `bun run check` green + e2e visual presence of skeleton nodes during nav | Hybrid |
| AC2 | Every server-loaded page shows a skeleton during real navigation; already-loaded content is never blanked | Playwright: trigger nav, assert skeleton visible then content; assert no blank on in-place updates | Hybrid (Agent-Probe for "warm style") |
| AC3 | Global top-bar progress bar appears during navigation only | Playwright: assert progress bar visible on nav, hidden at rest | Hybrid |
| AC4 | Button `loading` prop disables button + shows pending text + keeps width stable | Playwright "pending state" test (AC e2e case a) + vitest width assertion not feasible → e2e | Hybrid |
| AC5 | Duplicate submissions blocked on rapid clicks | Playwright double-click → exactly one network request (case d) | Hybrid |
| AC6 | Failed optimistic action rolls back to prior state + error toast | Playwright route-intercept 500 → assert UI reverts + toast (case b) | Hybrid |
| AC7 | Successful optimistic action reconciles with server | Playwright happy path → assert UI matches server after invalidateAll (case c) | Hybrid |
| AC8 | Optimistic shadow/rollback logic is correct in isolation | `src/tests/optimistic.spec.ts` vitest | Fully-Automated |
| AC9 | Log-touch uses pending + invalidateAll, NOT optimistic | Code review + e2e pending-state assertion on logTouch | Hybrid |
| AC10 | No type/lint regressions | `bun run check` + `bun run lint` exit 0 | Fully-Automated |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|-----------------|----------|-----------------------|
| `bun run check` exits 0 | Fully-Automated | AC1, AC10 |
| `bun run lint` exits 0 | Fully-Automated | AC10 |
| `bun run test:unit:ci` (incl. `src/tests/optimistic.spec.ts`) exits 0 | Fully-Automated | AC8 |
| `bun run test:e2e` `e2e/loading-ux.spec.ts` case a (pending disables) | Hybrid (DEV_BYPASS=true, browsers installed) | AC4, AC9 |
| `bun run test:e2e` case b (failed action rolls back) | Hybrid (route intercept → 500) | AC6 |
| `bun run test:e2e` case c (success reconciles) | Hybrid | AC7 |
| `bun run test:e2e` case d (no duplicate submit) | Hybrid | AC5 |
| Playwright skeleton-during-nav assertion | Hybrid | AC2, AC3 |
| Warm-cream/pulse visual style matches app | Agent-Probe | AC1, AC2 (style judgment) |

**Failing stubs (TDD, Fully-Automated tier — destined for validate-contract Test Gates, not on-disk yet):**
```
test("applyOptimistic mutates the copy and leaves the original snapshot intact", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: apply mutates copy not original")
})
test("rollback restores the captured snapshot after a failed action", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rollback restores snapshot")
})
test("reconcile prefers server data after invalidateAll", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reconcile prefers server data")
})
```

---

## Dependencies

- **Tooling:** `npx shadcn-svelte@latest add skeleton` must succeed; if the CLI is non-interactive in this environment, hand-create the primitive (pure CSS `animate-pulse`, no bits-ui dependency — confirmed by research and by VALIDATE: `components.json` + registry are configured, 15 ui components already added, so the CLI path is viable but the hand-create fallback is mechanical and certain).
- **Runtime:** `$app/state` `navigating` (Svelte 5 / SvelteKit 2 — present, currently unused; layout already imports `page` from the same module).
- **e2e:** Playwright browsers installed (`bunx playwright install` if missing); `DEV_BYPASS=true` to bypass auth gate during e2e.
- **No ordering hazard:** Phase A (skeletons) and Phase B (button) are independent; Phase C depends on layout existing; Phase D depends on A+B; Phase E depends on D. Strictly sequential A→F is safe.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| shadcn-svelte CLI non-interactive / fails in sandbox | Medium | Hand-create the primitive (research + VALIDATE confirm it is pure CSS, no bits dependency) |
| Optimistic shadow desyncs from server after `invalidateAll` | Medium | Use the E1 reconcile recipe (`$effect` re-sync so server `data` wins post-reload); covered by e2e case c |
| Button width shift when text swaps to pending label | Medium | Reserve width (min-w or spinner-beside-hidden-children); e2e/visual check |
| `use:enhance` review page wiring differs from fetch pages — and enhance is NOT yet present (must be added) | Medium-High | E3: add `use:enhance` + `$state` shadow + enhance callbacks; isolate in page 20 |
| Duplicate-submit guard missed on a handler | Low | Guard is first line of every handler; e2e case d covers detail/list representative |
| Regression in existing mutation success path | Low | `invalidateAll` reconcile unchanged; per-page `bun run check` + e2e happy path |

## Failure Modes / Rollback

- Each page is an independent edit — if one page's optimistic logic breaks, revert that single `+page.svelte` without affecting others.
- Button `loading` prop is additive/optional → omitting it restores prior behavior; safe to revert components 9–10 independently.
- No DB/schema/migration → no data rollback concern. Pure git revert of touched files recovers any state.

## Backwards Compatibility

- Button changes are additive (optional props, defaults preserve current rendering) — all existing call sites unaffected.
- No API, schema, or auth surface changes. No migration. Existing fetch→invalidateAll mutation flow preserved; optimistic shadow wraps it.

---

## Test Infra Improvement Notes

- No component test harness (`@testing-library/svelte`) exists — pending/optimistic UI behavior is covered by Playwright e2e (Hybrid) rather than fast component unit tests. Consider adding the harness in a future plan if component-level coverage becomes frequent (backlog candidate, not blocking).
- `e2e/loading-ux.spec.ts` is the first Playwright spec in the repo (Playwright configured but no specs yet) — establishes the e2e directory/pattern other features can reuse.
- Gate-command correctness: use `bun run test:unit:ci` (vitest `--run`) for automated gates. Bare `bun run test:unit` is watch-mode and will hang a non-interactive run.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/loading-ux/active/loading-ux_30-06-26/loading-ux_PLAN_30-06-26.md`
2. **Last completed phase or step:** PLAN written; VALIDATE complete (validate-contract below, gate CONDITIONAL); checklist steps 1–29 not started.
3. **Validate-contract status:** written — gate CONDITIONAL (see below).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `src/lib/components/ui/button/button.svelte`, `src/lib/components/shared/Button.svelte`.
5. **Next step for a fresh agent:** EXECUTE phase A→F strictly in order, honoring execute-agent instructions E1–E4. Implementation entrypoint = checklist step 1 (skeleton primitive). Run `bun run check` after each phase; e2e requires `DEV_BYPASS=true` + Playwright browsers.

---

## Phase Completion Rules

A phase counts as complete only when its exit gate is green — code-only completion is `CODE DONE`, never `VERIFIED`.

- **Phase A (Foundation):** all 8 skeleton files created; `bun run check` exits 0.
- **Phase B (Button):** `loading`/`loadingText` on both Button components; `bun run check` exits 0; existing call sites unchanged.
- **Phase C (Nav indicator):** progress bar shows during nav only; `bun run check` exits 0.
- **Phase D (Pages):** all 10 pages wired (skeleton + pending + optimistic where specified); `bun run check` exits 0 after final page.
- **Phase E (Tests):** `bun run test:unit:ci` green (incl. optimistic.spec.ts); `bun run test:e2e` cases a-d green (DEV_BYPASS=true).
- **Phase F (Lint+Log):** `bun run lint` exits 0; LOG.md entry appended.
- A phase is only `VERIFIED` after its gate evidence is recorded AND (for behaviorally-risky pages) user confirmation that the loading UX works as intended. Until then mark `CODE DONE`.

**Next Step:** EXECUTE (`ENTER EXECUTE MODE`). RIPER-5: PLAN -> VALIDATE -> EXECUTE.

## Validate Contract

Status: CONDITIONAL
Date: 30-06-26
date: 2026-06-30
generated-by: inner-pvl: loading-ux
supersedes: (none — first validate-contract for this plan)

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 28 files in blast radius). No multi-package scope, no schema/API/auth surface, no high-risk class, single locked design. Sequential vc-execute-agent (opus) for EXECUTE; no fan-out benefit.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC8 | Optimistic shadow/rollback/reconcile logic correct in isolation | Fully-Automated | `bun run test:unit:ci` incl. `src/tests/optimistic.spec.ts` exits 0 | B (tests added by this plan, step 25) |
| AC10 | No type/lint regressions | Fully-Automated | `bun run check` exits 0 AND `bun run lint` exits 0 | B (gate added by this plan, steps 24/28) |
| AC1 | Skeleton primitive + 5 composites exist + typecheck | Fully-Automated | `bun run check` exits 0 after Phase A | B |
| AC4 | Button `loading` disables + pending text + stable width | Hybrid | `bun run test:e2e e2e/loading-ux.spec.ts` case a — precondition: `DEV_BYPASS=true` + Playwright browsers | B |
| AC5 | Duplicate submit blocked on rapid clicks | Hybrid | e2e case d (exactly one network request) — same precondition | B |
| AC6 | Failed optimistic action rolls back + error toast | Hybrid | e2e case b (route intercept → 500) — same precondition | B |
| AC7 | Successful optimistic action reconciles with server | Hybrid | e2e case c (happy path matches server after invalidateAll) — same precondition | B |
| AC9 | Log-touch uses pending + invalidateAll, NOT optimistic | Hybrid | e2e pending-state assertion on logTouch + code review | B |
| AC2 | Skeleton shown during nav; loaded content never blanked | Hybrid | Playwright skeleton-during-nav assertion — same precondition | B |
| AC3 | Global top-bar progress bar during nav only | Hybrid | Playwright progress-bar assertion — same precondition | B |
| AC1/AC2 (style) | Warm-cream/pulse style matches app | Agent-Probe | Visual judgment by reviewing agent/user during EVL | C (deferred to manual UI confirmation) |

Failing stub: (AC8 — applies to the single Fully-Automated behavioral row; placed after the AC8 row's table group)
```
test("applyOptimistic mutates the copy and leaves the original snapshot intact", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: apply mutates copy not original")
})
test("rollback restores the captured snapshot after a failed action", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rollback restores snapshot")
})
test("reconcile prefers server data after invalidateAll", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reconcile prefers server data")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Type/Svelte check: Fully-automated: `bun run check` exits 0
- Lint: Fully-automated: `bun run lint` exits 0
- Optimistic logic unit: Fully-automated: `bun run test:unit:ci` exits 0 (incl. `src/tests/optimistic.spec.ts`)
- e2e pending/optimistic/rollback/no-dup: hybrid: `bun run test:e2e e2e/loading-ux.spec.ts` — precondition: `DEV_BYPASS=true` + `bunx playwright install`
- Warm-cream/pulse visual style: agent-probe: reviewer judges skeleton style matches app tokens

Dimension findings:
- Infra fit: PASS — shadcn-svelte configured (components.json + registry, bits-ui present, 15 ui components already added); `$app/state navigating` available and unused (layout already imports `page`); vitest 4 + Playwright 1.60 present. shadcn CLI may be non-interactive but the hand-create fallback (pure-CSS `animate-pulse` div) is mechanical and certain.
- Test coverage: CONCERN — only AC8 + AC10/AC1 are fully-automated; all skeleton/pending/optimistic UI behavior (AC2–AC7, AC9) rests on Playwright Hybrid (browsers + DEV_BYPASS, not guaranteed in CI). Acceptable (no fast component harness exists) but most behavior is Hybrid-gated. Plan's watch-mode `test:unit` command corrected to `test:unit:ci`.
- Breaking changes: PASS — Button props additive/optional (defaults preserve rendering); no API/schema/auth; existing fetch→invalidateAll preserved.
- Security surface: PASS — UI-only, no auth/billing/data/secrets/trust-boundary. No risk evidence pack required. `DEV_BYPASS` is test-only.
- Section A (Skeletons) feasibility: PASS — 8 new files, no collision (skeleton dir absent); CLI or hand-create both viable.
- Section B (Button) feasibility: CONCERN — base button spreads `...restProps` (includes `disabled`); loading-disable requires destructure+merge (E2). shared/Button typed `...rest` drops `loading`/`loadingText` → must add explicit props (E2/plan step 10). Highest-risk: disabled-merge correctness.
- Section C (Nav indicator) feasibility: PASS — `navigating.to` from `$app/state`, additive top bar.
- Section D (Pages/optimistic) feasibility: CONCERN — review page currently plain native form + raw button, NOT `use:enhance` (must be ADDED, E3); optimistic reconcile recipe must be pinned (E1, the highest-risk edit class). Highest-risk: shadow desync after invalidateAll.
- Section E (Tests) feasibility: CONCERN — optimistic helper does not exist yet (TDD, fine); first Playwright spec in repo; gate command must be `test:unit:ci`.
- Section F (Lint+Log) feasibility: PASS — `LOG.md` absent at root → create-if-absent (E4).

Execute-agent instructions:
- E1 (Section D entry — REQUIRED): Pin the optimistic reconcile recipe. A `$state` shadow initialized from `data.leads` does NOT auto-update after `invalidateAll()`. Add `$effect(() => { shadow = data.<list> })` so the shadow re-syncs to server truth on every `data` change (server wins post-reload). The optimistic mutation and the `$effect` re-sync do not race: during the optimistic window `data` is unchanged so the effect does not fire; after `invalidateAll()` resolves, `data` changes and the effect reconciles. Document the chosen recipe in each optimistic page during EXECUTE. Prove via e2e case c.
- E2 (Phase B entry — REQUIRED): In `ui/button/button.svelte`, destructure `disabled` out of `restProps` and write `disabled={loading || disabled}` BEFORE spreading `{...restProps}` (or omit `disabled` from the spread) so the explicit loading-disable is not overridden. In `shared/Button.svelte`, declare `loading`/`loadingText` as explicit props (they are not in `HTMLButtonAttributes` and are dropped by the typed `...rest`) and forward them explicitly to `UiButton`.
- E3 (Step 20 / Review page — REQUIRED): The review page does NOT currently use `use:enhance`. Add `import { enhance } from '$app/forms'`, apply `use:enhance` to the resolve form, convert `data.leads` to a `$state` shadow, and wire pending + optimistic remove + rollback in the enhance submit/result callbacks. Swap the raw `<button>` to the Button component (or wire manual `disabled` during submit). Do NOT skip — without enhance there is no client-side pending state.
- E4 (Step 29 — minor): `LOG.md` does not exist at repo root. Create it if absent before appending the feature entry.

Open gaps: none blocking. Residual: most behavioral verification is Hybrid (Playwright requires browsers + DEV_BYPASS); style correctness (AC1/AC2 warm-cream) is Agent-Probe only — deferred to manual/EVL confirmation.

What this coverage does NOT prove:
- `bun run check` / `bun run lint`: prove zero type/lint regressions only — NOT runtime behavior, NOT visual rendering, NOT optimistic correctness in the live UI.
- `bun run test:unit:ci` (optimistic.spec.ts): proves the EXTRACTED pure helper's apply/rollback/reconcile logic — NOT that pages wire the helper correctly, NOT real fetch/invalidateAll integration, NOT render or pending-state behavior.
- `bun run test:e2e` cases a–d: prove pending-disable, rollback, reconcile, and no-duplicate-submit ONLY when Playwright browsers are installed and `DEV_BYPASS=true`. When browsers are absent the e2e gate cannot run — these behaviors are then unproven.
- Skeleton-during-nav / progress-bar assertions: prove DOM presence during navigation — NOT that the skeleton shape matches each page's real content, NOT warm-cream style fidelity.
- Agent-Probe (warm-cream/pulse style): a human/agent judgment, proves nothing mechanically.
- No gate proves: cross-browser behavior, slow-network skeleton timing, accessibility of pending/disabled states, or that every one of the ~10 mutation handlers received the duplicate-submit guard (e2e covers representative handlers only).

Gate: CONDITIONAL (5 concerns recorded as execute-agent instructions E1–E4 + corrected test command; no FAILs; plan updated with P1/P2)
Accepted by: session (ENTER VALIDATE MODE directive — user explicitly requested the contract be written and the gate emitted). Accepted concerns by name: C1 test-gate-command (fixed in plan, P1), C2 review-use-enhance-missing (E3 + plan note P2), C3 optimistic-reconcile-recipe (E1), C4 button-disabled-merge (E2), C5 LOG.md-absent (E4).

## Autonomous Goal Block

```
SESSION GOAL: Loading UX — skeleton loaders, button pending states, optimistic updates across the Veent CRM
Charter + umbrella plan: N/A — single plan (process/features/loading-ux/active/loading-ux_30-06-26/loading-ux_PLAN_30-06-26.md)
Autonomy: standard RIPER-5; EXECUTE requires explicit ENTER EXECUTE MODE. Under /goal, self-decide reversible UI choices; hard-stop only on irreversible/outward-facing actions (none expected — UI-only, no schema/auth/API/migration).
Hard stop conditions / safety constraints:
- Do NOT touch schema, auth, API contracts, billing, or migrations (plan is UI-only, low risk — any drift into these surfaces is a hard stop).
- Button changes must stay additive/optional — existing call sites must render unchanged when the new props are omitted.
- Do NOT change the fetch→invalidateAll mutation pattern or replace svelte-sonner.
Next phase: EXECUTE — process/features/loading-ux/active/loading-ux_30-06-26/loading-ux_PLAN_30-06-26.md (phases A→F strictly in order, honoring E1–E4)
Validate contract: inline in plan (## Validate Contract — gate CONDITIONAL)
Execute start: Fully-automated gates → `bun run check`, `bun run lint`, `bun run test:unit:ci`. Hybrid e2e → `bun run test:e2e e2e/loading-ux.spec.ts` (precondition: DEV_BYPASS=true + bunx playwright install). High-risk pack: no (UI-only). First step: checklist item 1 (skeleton primitive).
```
