---
name: plan:meetings-filter-ui-polish
description: Restyle /meetings Command combobox filters to app design tokens, add optimistic filter feedback + loading skeleton
date: 02-07-26
feature: meetings
---

# Meetings Filter UI Polish — PLAN (SIMPLE)

Date: 02-07-26
Status: Active — pending VALIDATE
Complexity: SIMPLE
Feature: meetings

## Overview / Context

The `/meetings` filter toolbar shipped functional but visually rough (per user report + screenshots):
a raw browser scrollbar in the Command popover, an over-eager pink highlight on every hovered row,
and unstyled native date inputs. It also lacks the optimistic per-control feedback and loading
skeleton the rest of the app uses (calendar/leads/pipeline). This plan brings the toolbar in line
with the app's design tokens (`src/lib/styles/tokens.css`) and established interaction conventions
without a redesign. Context loaded: `process/context/all-context.md` + `process/context/tests/all-tests.md`.

**TL;DR:** Presentation-only polish of the `/meetings` filter toolbar. Three visual fixes
(pink-highlight overuse, raw scrollbar, unstyled date inputs) + optimistic per-control feedback
+ a meeting-list loading skeleton during filter navigation. 4 files, no data-layer change.
Proof = `bun run check` + `bun run test:unit:ci` green (no regression) + an Agent-Probe visual
pass. E2E interaction proof is a pre-accepted Known-Gap (no shared Playwright auth fixture yet).

## Complexity

SIMPLE — single feature surface (`/meetings` filter toolbar + the shared Command primitive it
uses), presentation + client interaction state only, no schema/API/auth/billing surface, ~4 files,
one session. Not a phase program.

## Goals

1. Command popover items highlight neutral gray on hover/keyboard; reserve pink for the actually-selected value only.
2. Command popover scrollable lists get a subtle token-based thin scrollbar instead of raw browser chrome.
3. Date-range filter inputs match the app's established styled-date-input convention (`font-mono`, focus ring).
4. Changing any filter (organizer / lead / date / sort) shows instant per-control feedback before the navigation resolves (optimistic).
5. While a filter change is in flight: the meeting list shows skeleton rows, and filter controls are disabled to prevent stacking conflicting changes.

## Scope

**In scope (files to touch):**

| File | Change |
|---|---|
| `src/lib/components/ui/command/command-item.svelte` | Distinguish highlighted-vs-chosen: neutral gray for `aria-selected` (hover/keyboard, bits-ui-driven), pink reserved for a bits-ui-untouched `data-chosen` marker on the real chosen value. |
| `src/lib/components/ui/command/command-list.svelte` | Apply a thin custom scrollbar (defined in `layout.css` `@layer utilities`) via the existing className merge. |
| `src/routes/layout.css` | Add a `scrollbar-thin`-style utility class under `@layer utilities` (the `::-webkit-scrollbar` fallback + `scrollbar-width`/`scrollbar-color`), using `hairline`/`ink-300` token colors. |
| `src/lib/components/meetings/MeetingsPanel.svelte` | Fix date-input classes; stamp `data-chosen` on the active organizer item; add `navLoading`/`pendingAction` state; wire per-control pending flags; add skeleton loading state for the list; disable controls during navigation. |
| `src/lib/components/meetings/LeadCombobox.svelte` | Migrate the existing `data-selected` chosen stamp (line 162) to `data-chosen`; accept/forward a `disabled`/`pending` prop so parent `navLoading` can disable it; confirm its existing `chosenLabel` optimistic pattern still works alongside parent `pendingAction`. |

**Out of scope:** `GET /api/leads` and `/api/meetings` endpoints, `MeetingFormModal.svelte`, all
backend/query/loader logic, any Drizzle change. This is presentation + client state only.

## Locked design decisions (do not re-litigate)

1. **Highlight color** — neutral `bg-panel-sunken` (#f1eff3) for hover/keyboard-highlighted-but-not-chosen; pink `bg-selected` (#fdeceb) reserved ONLY for the item matching the currently-active filter value.
   - **Chosen-marker mechanism (VALIDATE-corrected, Gap 1):** the chosen/active-value pink is keyed off a NEW consumer-owned custom attribute **`data-chosen`**, NOT `data-selected`. Reason: bits-ui internally owns `data-selected` (and `aria-selected`) and drives them from its own hover/keyboard `isSelected` state, overriding any consumer-stamped `data-selected` via `mergeProps(restProps, itemState.props)` (internal props win). A `data-[selected]:bg-selected` rule would therefore paint the *hovered* row pink — reproducing the exact bug being fixed. `data-chosen` is untouched by bits-ui, so it reliably marks only the active filter value.
   - Correct class split in `command-item.svelte`: `aria-selected:bg-panel-sunken aria-selected:text-ink` for the gray hover/keyboard-highlight (bits-ui-driven — this part was already correct), PLUS `data-[chosen]:bg-selected data-[chosen]:text-ink` for the actually-chosen filter value.
   - Both consumers of the shared primitive use the same working mechanism: the organizer combobox stamps `data-chosen`, and `LeadCombobox:162`'s existing `data-selected` stamp is migrated to `data-chosen` (see checklist steps 2–3).
2. **Scrollbar** — minimal thin custom scrollbar scoped to the Command popover list only, using `hairline`/`ink-300`-family token colors. No global scrollbar redesign.
   - **Delivery mechanism (VALIDATE-corrected, Gap 2):** the scrollbar CSS lives in `src/routes/layout.css` under an `@layer utilities` block (confirmed imported via `layout.css:11` per RESEARCH), applied to `command-list.svelte` via its existing `className`/class-merge prop. The previously-listed "inline via class merge" alternative for the `::-webkit-scrollbar` fallback is **rejected** — a Svelte component-scoped `<style>` block cannot reliably reach the bits-ui-rendered `::-webkit-scrollbar` pseudo-elements (the scoping hash does not reach that element). The Firefox-standard `scrollbar-width`/`scrollbar-color` properties MAY remain plain Tailwind arbitrary-value classes if preferred, but the `::-webkit-scrollbar` part MUST live in the global CSS `@layer utilities`.
3. **Date inputs** — apply established styled-input classes (`font-mono`, `focus:outline-none focus:ring-1 focus:ring-primary`) used at `reports/+page.svelte:165` and `leads/[id]/+page.svelte:523,534`; keep compact `h-8` height (intentional toolbar match). No custom date-picker build — native `<input type="date">` chrome stays.
4. **Optimistic feedback** — replicate calendar's `navLoading`/`pendingAction` mechanic (`calendar/+page.svelte:24-29,59,64,69`) for the `/meetings` filter toolbar. `/meetings` filters use `goto()` with query params (same pathname) → same-route change → `navLoading = navigating.to?.url.pathname === '/meetings'`.
5. **Loading state** — SKELETON for the meeting list (reuse the exact meeting-row skeleton shape from `RouteShells.svelte` lines 215-218: `rounded-control border border-hairline bg-panel-subtle p-3` containing `Skeleton h-3.5 w-32` + `Skeleton mt-1 h-3 w-24`), PLUS per-control spinners via `pendingAction`, PLUS disabled controls during navigation — all three combined.

## Touchpoints

- **Reads:** `src/routes/calendar/+page.svelte` (navLoading/pendingAction reference pattern), `src/lib/components/shared/skeletons/RouteShells.svelte` (meeting-row skeleton shape), `src/lib/styles/tokens.css` (token names), `src/lib/components/ui/skeleton` (existing Skeleton primitive), `src/routes/layout.css:11` (confirms global CSS import point for the scrollbar utility).
- **Writes:** the 5 files in Scope (`command-item.svelte`, `command-list.svelte`, `layout.css`, `MeetingsPanel.svelte`, `LeadCombobox.svelte`).
- **Runtime:** client-side Svelte 5 runes (`$state`, `$derived`, `$effect`) + `navigating` from `$app/state`. No server code path changes.

## Public Contracts

- `LeadCombobox.svelte` gains ONE new optional prop: `disabled?: boolean` (default `false`). Additive, non-breaking — existing call sites (assign mode in `MeetingFormModal`, filter mode in `MeetingsPanel`) keep working without passing it. Confirm `MeetingFormModal`'s LeadCombobox usage still type-checks (new prop is optional).
- `command-item.svelte` / `command-list.svelte` are shared UI primitives. Grep confirms Command is consumed ONLY by `MeetingsPanel.svelte` and `LeadCombobox.svelte` (both meetings-scoped) — so the primitive edits have no cross-page blast radius today. The chosen-marker convention changes from `data-selected` to `data-chosen` across BOTH consumers simultaneously (no half-migrated state), keeping the primitives internally consistent. Marker/class API stays backward-compatible (only added/adjusted classes, no removed props).

## Blast Radius

- **Files:** 5. **Packages:** 1 (the single SvelteKit app). **Risk class:** low — presentation + client interaction state, no schema/auth/API/billing/migration surface.
- **Shared-primitive caveat:** `command-item`/`command-list` are shared, but current consumers are meetings-only (verified by grep). If a future page adopts Command, the neutral-highlight + `data-chosen` behavior is the intended default, so this is a net improvement, not a regression risk. `layout.css` is global, but the added `@layer utilities` scrollbar class is opt-in (only applied where its class is added), so it cannot regress existing scrollbars.

## Implementation Checklist

1. **`command-item.svelte`** — Replace `aria-selected:bg-accent aria-selected:text-accent-foreground` with neutral highlight `aria-selected:bg-panel-sunken aria-selected:text-ink` (bits-ui-driven hover/keyboard highlight); ADD chosen-state style keyed off the bits-ui-untouched custom attribute: `data-[chosen]:bg-selected data-[chosen]:text-ink` so ONLY the active value shows pink. **Do NOT use `data-[selected]`** — bits-ui overrides consumer-stamped `data-selected` via `mergeProps` and would paint the hovered row pink. Preserve all existing layout/disabled/svg classes and the `className` merge.
2. **Organizer combobox chosen marker (`MeetingsPanel.svelte:264-291`)** — stamp `data-chosen={filters.organizer === <this item's value> ? '' : undefined}` (value is `'mine'`, `'all'`, or a user id) on the CommandItem matching the active organizer filter, so the current organizer filter renders pink while hovered rows render gray. Use `data-chosen` (the new bits-ui-untouched attribute), NOT `data-selected`.
3. **`LeadCombobox.svelte` chosen-marker migration (line 162)** — migrate the EXISTING `data-selected={value === lead.id}` stamp to `data-chosen={value === lead.id ? '' : undefined}`, bringing the already-existing LeadCombobox stamp in line with the corrected attribute name so both consumers of the shared `command-item.svelte` primitive use the same working mechanism.
4. **`command-list.svelte` + `layout.css`** — add a `scrollbar-thin`-style utility class ONCE in `src/routes/layout.css` under an `@layer utilities` block (`scrollbar-width: thin; scrollbar-color: var(--color-ink-300) transparent;` PLUS a `::-webkit-scrollbar` fallback with `hairline`/`ink-300` token colors), then apply that class to the CommandPrimitive.List via the existing `className`/class-merge prop in `command-list.svelte`. Do NOT use a component-scoped `<style>` block for the `::-webkit-scrollbar` part (scoping hash cannot reach the bits-ui-rendered element). Keep `max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto` intact.
5. **Date inputs (`MeetingsPanel.svelte:306-319`)** — add `font-mono focus:outline-none focus:ring-1 focus:ring-primary` to both `<input type="date">` class strings; keep `h-8 rounded-control border border-hairline bg-panel px-2 text-[12.5px] text-ink`.
6. **MeetingsPanel optimistic state** — import `navigating` from `$app/state`. Add `const navLoading = $derived(navigating.to?.url.pathname === '/meetings')`, `let pendingAction = $state<string | null>(null)`, and `$effect(() => { if (!navLoading) pendingAction = null })`. (Mirrors calendar lines 24-29.)
7. **Set `pendingAction` synchronously before navigation** — in `setFilter` (or at each call site) set `pendingAction` to the control name (`'organizer' | 'lead' | 'dateFrom' | 'dateTo' | 'sortDir'`) BEFORE calling `navigate()`, so feedback is instant. Simplest: give `setFilter` an optional `action` arg, or set `pendingAction` at each of the 5 call sites (organizer Mine/All/rep, lead onselect, both date onchange, sort toggle).
8. **Per-control spinner + disable** — add a small inline spinner snippet (copy the `spinner` snippet shape from `calendar/+page.svelte:74+`) shown when `navLoading && pendingAction === '<control>'`; add `disabled={navLoading}` to the organizer PopoverTrigger, sort Button, and both date inputs; pass `disabled={navLoading}` to `<LeadCombobox>`.
9. **`LeadCombobox.svelte` disabled prop** — add `disabled = false` to `$props()` (typed `disabled?: boolean`); apply `disabled` + `disabled:opacity-50 disabled:pointer-events-none` (or wrap trigger) so the parent `navLoading` can freeze it. Verify the internal `chosenLabel` optimistic label (line 108) still displays correctly during parent-driven navigation.
10. **Meeting-list skeleton (`MeetingsPanel.svelte:331-411`)** — while `navLoading` is true, render skeleton rows in place of the real list using the RouteShells meeting-row shape (`{#each Array(5)}` of `rounded-control border border-hairline bg-panel-subtle p-3` with `Skeleton h-3.5 w-32` + `Skeleton mt-1 h-3 w-24`). Guard so it does not clobber the empty state; skeleton takes precedence over both the empty and populated branches while `navLoading`.
11. **Verify** — run `bun run check` and `bun run test:unit:ci`; fix any type/Svelte errors introduced. Then run the Agent-Probe visual pass (see Verification Evidence).

## Acceptance Criteria (testable)

- AC1: Hover/keyboard-navigating a Command popover item shows neutral gray; only the active filter value (`data-chosen`) shows pink. — proven by: "Dev-server visual probe: hover items" — strategy: Agent-Probe
- AC2: Command popover scrollable lists show a subtle custom scrollbar, not the raw default. — proven by: "Dev-server visual probe: scroll list" — strategy: Agent-Probe
- AC3: Date-range inputs are visually consistent with the app's date-input styling (font-mono + focus ring). — proven by: "Dev-server visual probe: date inputs" — strategy: Agent-Probe
- AC4: Changing any filter immediately shows a spinner on the specific control changed before navigation resolves. — proven by: "Dev-server interaction probe" — strategy: Agent-Probe
- AC5: During an in-flight filter change the meeting list shows skeleton rows (not blank/frozen) and controls are disabled. — proven by: "Dev-server interaction probe" — strategy: Agent-Probe
- AC6: No visual regression to other pages using `command-item`/`command-list` (moot — meetings-only consumer, confirm by grep). — proven by: "grep Command consumers" + "test:unit:ci" — strategy: Fully-Automated
- AC7: `bun run check` and `bun run test:unit:ci` pass with no new errors/failures. — proven by: "check + test:unit:ci" — strategy: Fully-Automated

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | AC7 (no type/Svelte regression from class + prop + `data-chosen` changes) |
| `bun run test:unit:ci` exits 0 (263+ pass) | Fully-Automated | AC7 + AC6 (existing meetings/optimistic suites still green; no logic regression) |
| `grep -rln "components/ui/command" src/` returns only MeetingsPanel + LeadCombobox | Fully-Automated | AC6 (confirms shared-primitive edit has no other-page blast radius) |
| Dev-server visual probe: hover organizer/lead items → gray; active value (`data-chosen`) → pink; hovered non-active row stays gray | Agent-Probe | AC1 (also confirms Gap-1 fix: hover does NOT go pink) |
| Dev-server visual probe: scroll a long reps/leads list → thin token scrollbar (webkit `::-webkit-scrollbar` styling applied) | Agent-Probe | AC2 |
| Dev-server visual probe: date inputs render mono + focus ring on focus | Agent-Probe | AC3 |
| Dev-server interaction probe: change each filter → per-control spinner appears instantly, list shows skeleton, controls disabled until nav resolves | Agent-Probe | AC4 + AC5 |
| Playwright e2e for filter interaction (spinner/skeleton/disable) | Known-Gap | AC4/AC5 automated — see backlog stub below |

**Vacuous-green note:** AC1–AC5 are proven by the Agent-Probe rows (a real proving strategy), not
left on Known-Gap. The Known-Gap row is only the *automation* residual for AC4/AC5 and is recorded
as a backlog stub; the behaviors themselves are proven at execute time by the visual/interaction probe.
The AC1 probe explicitly re-verifies the Gap-1 correction (hovered rows must NOT turn pink — only the
`data-chosen` active value does).

**Pre-accepted Known-Gaps (matching this session's established pattern):**
- No shared Playwright authenticated-session fixture → any `/meetings` e2e self-skips against the auth gate (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Filter-interaction e2e is deferred until that fixture lands.
- No live-DB CI harness → not relevant here (no query change), noted for completeness.
- **Backlog stub to write at UPDATE-PROCESS:** `meetings-filter-interaction-e2e_NOTE_02-07-26.md` — Playwright spec asserting per-control spinner + list skeleton + disabled controls on filter change, blocked on the shared auth fixture.

## Test Infra Improvement Notes

(none identified yet — visual/interaction behaviors are Agent-Probe by nature; the only automation
gap is the pre-existing shared-Playwright-auth-fixture backlog item, already tracked.)

## Phase Completion Rules

- This is a SIMPLE single-phase plan. It is `CODE DONE` when checklist steps 1–10 are implemented and step 11's Fully-Automated gates (`bun run check` + `bun run test:unit:ci`) are green.
- It is `VERIFIED` only after the Agent-Probe visual/interaction pass confirms AC1–AC5 at runtime (dev server), including the Gap-1 check that hovered rows stay gray. Green compile + unit suite alone is `CODE DONE`, not `VERIFIED`.
- Known-Gap e2e automation does NOT block completion (pre-accepted); the backlog stub must be written at UPDATE-PROCESS.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/meetings-filter-ui-polish_02-07-26/meetings-filter-ui-polish_PLAN_02-07-26.md`
2. **Last completed step:** plan written + VALIDATE gap 1/2 supplement applied (PVL-supplement mode) + PVL re-run PASS (contract below written). No code changed yet.
3. **Validate-contract status:** PASS (see `## Validate Contract` below). First-pass VALIDATE returned BLOCKED (Gap 1 FAIL: `data-selected` mechanism; Gap 2 CONCERN: scrollbar delivery); both gaps addressed in the 02-07-26 PVL-supplement and verified against bits-ui source in this PVL re-run. No prior PASS contract existed — this is the initial contract write.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; read files — `command-item.svelte`, `command-list.svelte`, `layout.css`, `calendar/+page.svelte`, `MeetingsPanel.svelte`, `LeadCombobox.svelte`, `RouteShells.svelte`, `tokens.css`, and bits-ui `command.svelte.js` + `components/command-item.svelte`.
5. **Next step for a fresh agent:** EXECUTE checklist steps 1→11 in order (primitive edits + `data-chosen` migration first, then `layout.css` scrollbar utility, then MeetingsPanel state, then skeleton, then verify). Grep-confirm Command consumers before touching the primitives.

## Validate Contract

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 0/7 — single SvelteKit package, no schema/API/auth surface, 5 files in one confined feature surface, no independent directions, low risk. Sequential (one vc-execute-agent) fits; fan-out would add cost with no benefit.

Test gates (C3 5-column table — ADDITIVE; the legacy line form below is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 | No TS/Svelte type regression from class + prop + `data-chosen` edits | Fully-Automated | `bun run check` exits 0 | A |
| AC6/AC7 | Existing unit suites still green; no logic regression | Fully-Automated | `bun run test:unit:ci` exits 0 (263+ pass) | A |
| AC6 | Command shared-primitive edit has no cross-page blast radius | Fully-Automated | `grep -rln "components/ui/command" src/` returns only MeetingsPanel + LeadCombobox | A |
| AC1 | Hovered/keyboard rows render neutral gray; only the `data-chosen` active value renders pink (Gap-1 re-verify: hover must NOT go pink) | Agent-Probe | Dev-server visual probe: hover organizer/lead items → gray; active value → pink; hovered non-active row stays gray | A |
| AC2 | Command popover scroll list shows a thin token-based scrollbar | Agent-Probe | Dev-server visual probe: scroll a long reps/leads list → `::-webkit-scrollbar` styling applied | A |
| AC3 | Date inputs render mono font + focus ring | Agent-Probe | Dev-server visual probe: focus each date input | A |
| AC4/AC5 | Filter change shows instant per-control spinner + list skeleton + disabled controls until nav resolves | Agent-Probe | Dev-server interaction probe: change each filter | A |
| AC4/AC5 | Automated regression coverage for filter-interaction feedback | (residual) | Playwright e2e (self-skips: no shared auth fixture) | D |

gap-resolution legend: A — proven now (in this cycle) · B — fixed by this plan's checklist · C — deferred to named later phase · D — backlog test-building stub (named residual; keep-active)

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe here; no Hybrid applies). Known-Gap is NOT a strategy — the AC4/AC5 automation residual is carried as a gap-resolution D backlog stub, never as a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Type/Svelte compile: Fully-automated: `bun run check` exits 0
- Unit suite regression: Fully-automated: `bun run test:unit:ci` exits 0
- Blast-radius confinement: Fully-automated: `grep -rln "components/ui/command" src/` → only MeetingsPanel + LeadCombobox
- Highlight/scrollbar/date/optimistic visuals (AC1–AC5): agent-probe: dev-server visual + interaction pass (precondition: `bun run dev` + authenticated session)
- Filter-interaction e2e automation: known-gap: documented — no shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

Failing stubs: N/A for the Fully-Automated rows — these are pre-existing suite/command gates (`bun run check`, `bun run test:unit:ci`) and a grep-assertion, not new per-behavior red-first unit scenarios. The developed behaviors (AC1–AC5) are visual/interaction and are Agent-Probe by nature, which do not receive TDD stubs.

Dimension findings:
- Infra fit: PASS — Presentation-only, client-side Svelte 5 runes + `navigating`; no container/port/runtime surface. All 5 edit-target files exist. `layout.css` confirmed importing `tailwindcss` (line 9) + `tokens.css` (line 11), so an `@layer utilities` block resolves correctly under Tailwind v4.
- Test coverage: PASS — `bun run check` + `bun run test:unit:ci` are the automated regression gates; visual/interaction ACs are Agent-Probe (correct tier for cosmetic behavior). E2E automation is a named, pre-accepted Known-Gap (D) with a backlog stub — not vacuously green (AC1–AC5 proven by Agent-Probe, AC6/AC7 fully-automated).
- Breaking changes: PASS — Only additive change is `LeadCombobox` optional `disabled?: boolean`. The `data-selected`→`data-chosen` marker convention migrates across BOTH Command consumers simultaneously (no half-migration). Grep confirms Command consumers are meetings-only (`ui/calendar/*` `data-selected` hits belong to a different bits-ui component and are untouched). No schema/API/auth.
- Security surface: PASS — No auth/identity, billing/credits, secrets, or trust-boundary logic. Pure presentation + client navigation state. No evidence pack required.
- Section A — Command primitive edits + `data-chosen` migration (steps 1–3): PASS — Verified against bits-ui source: `command-item.svelte` line 36 does `mergeProps(restProps, itemState.props)`; `itemState.props` (lines 1195–1208) owns `aria-selected`/`data-selected` keyed off `isSelected` (line 1141, flipped by `onpointermove`→`setValue`) but contains NO `data-chosen`, so a consumer-supplied `data-chosen` passes through untouched. Edit targets present: `command-item.svelte:16` exact string, `LeadCombobox.svelte:162` exact stamp. Highest-risk edit: the primitive class change — mitigated by grep-confirmed meetings-only consumer.
- Section B — scrollbar via `layout.css` `@layer utilities` (step 4): PASS — `command-list.svelte:15` already merges `className` via `cn(...)`; `layout.css` import chain confirmed. `::-webkit-scrollbar` in global `@layer utilities` is the correct route (component-scoped `<style>` cannot reach the bits-ui-rendered pseudo-element — sound reasoning). No conflicts.
- Section C — date inputs (step 5): PASS — Exact class baseline present at `MeetingsPanel.svelte:306-319`; additive class-only change.
- Section D — optimistic state + spinner + disable (steps 6–9): PASS — Calendar reference pattern (`navLoading`/`pendingAction`/`spinner`) verified present; `navigate()` uses same-pathname `goto()` so the `navLoading` derivation is valid. Highest-risk edit: wiring `pendingAction` at 5 call sites — mitigated by the optional-arg `setFilter` approach in step 7.
- Section E — meeting-list skeleton (step 10): PASS — The RouteShells meeting-row skeleton shape is already mirrored at `MeetingsPanel.svelte:403-406`, so the shape reference is consistent; skeleton-precedence guard over empty+populated branches is a straightforward conditional.

Open gaps:
- Filter-interaction e2e automation (AC4/AC5): known-gap: documented — no shared Playwright auth fixture. Backlog stub `meetings-filter-interaction-e2e_NOTE_02-07-26.md` to be written at UPDATE-PROCESS. Excluded from CONCERN/FAIL count (pre-classified, named residual).

What this coverage does NOT prove:
- `bun run check`: does NOT prove any runtime visual appearance (colors, scrollbar chrome, focus ring) — type/compile only.
- `bun run test:unit:ci`: does NOT prove any of the new visual/interaction behaviors (AC1–AC5) — only that existing unit logic is unregressed.
- `grep` consumer check: does NOT prove runtime rendering — only that the shared-primitive edit's static blast radius is confined to the two meetings consumers.
- Agent-Probe visual/interaction pass: does NOT provide automated regression protection — a future change could silently reintroduce the pink-on-hover bug or break the skeleton without a failing CI gate (this is the AC4/AC5 Known-Gap residual, deferred on the shared auth fixture).

Execute-agent instructions:
- E1 (Section A, step 2): stamp `data-chosen` on the organizer items by comparing against the ORGANIZER FILTER VALUE (`filters.organizer` ∈ `'mine' | 'all' | userId`), NOT against the CommandItem `value` attribute (which is the sentinel string `"__mine__"` / `"__all__"` for the quick-filter items). Map: Mine item → `filters.organizer === 'mine'`; All-reps item → `filters.organizer === 'all'`; per-rep item → `filters.organizer === u.id`. The plan step-2 parenthetical already states this; instruction repeated to prevent mis-stamping off the sentinel `value`.
- E2 (Section A, step 1): when the currently-`data-chosen` item is ALSO hovered, both `aria-selected:bg-panel-sunken` (gray, bits-ui hover) and `data-[chosen]:bg-selected` (pink) variants apply to the same element; Tailwind resolves by generated-CSS source order, not class-attribute order. Decide the intended winner during EXECUTE (recommended: chosen stays pink even when hovered) and confirm it in the AC1 Agent-Probe pass. Cosmetic, non-regressive either way — the original bug (ALL hovered rows pink) does not recur regardless.

Gate: PASS (no FAILs; the two blocking first-pass gaps are verified resolved against bits-ui source; two minor cosmetic/semantic items captured as execute-agent instructions E1/E2 with defined resolution paths; E2E automation is a pre-accepted named Known-Gap residual).
Accepted by: session (autonomous PVL re-run, /goal-style execution) — no unresolved CONCERNs; E1/E2 are execute-instructions, not accepted-concern gaps.

## Autonomous Goal Block

```
SESSION GOAL: Polish the /meetings filter toolbar — neutral hover highlight + pink only on the chosen value (data-chosen), thin token scrollbar, styled date inputs, optimistic per-control feedback + meeting-list skeleton during filter navigation.
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: reversible presentation-only edits — auto-proceed on all decisions (feedback_autonomous_phase_execution.md). No hard-stop surfaces present.
Hard stop conditions / safety constraints:
- None applicable — no schema/auth/API/billing/migration/secrets surface. Pure presentation + client nav state.
Next phase: EXECUTE: process/general-plans/active/meetings-filter-ui-polish_02-07-26/meetings-filter-ui-polish_PLAN_02-07-26.md
Validate contract: inline in plan (## Validate Contract) — Gate: PASS
Execute start:
- Fully-automated gates: `bun run check` && `bun run test:unit:ci` (both exit 0); `grep -rln "components/ui/command" src/` → only MeetingsPanel + LeadCombobox
- Agent-Probe (dev server + auth session): hover items → gray, chosen → pink; scroll → thin scrollbar; date inputs → mono+focus ring; filter change → spinner+skeleton+disabled
- High-risk pack: no
- Order: steps 1–3 (primitive edits + data-chosen migration) → step 4 (layout.css scrollbar) → step 5 (date inputs) → steps 6–9 (optimistic state) → step 10 (skeleton) → step 11 (verify). Apply execute-instructions E1 (organizer stamp maps to filters.organizer, not the __mine__/__all__ sentinel value) + E2 (decide chosen-vs-hover class precedence).
```
