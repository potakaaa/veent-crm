---
name: plan:leads-page-ux-redesign
description: "UI/UX redesign of the /leads My Leads page — declutter filters, unify active-filter styling, improve empty state and hit-targets, preserve filter URL-param contract"
date: 03-07-26
feature: leads
---

# Leads Page UX Redesign — SIMPLE Plan

- **Date**: 03-07-26
- **Status**: Active — pending VALIDATE
- **Complexity**: SIMPLE
- **Context:** loaded via `process/context/all-context.md` router; testing conventions per `process/context/tests/all-tests.md`

**TL;DR:** Recompose the `/leads` toolbar into a clean primary/secondary filter structure, collapse the 5-control "Beyond N weeks" cluster + the two ad-hoc toggles into one labeled "Filters" popover with an active-count badge, unify four inconsistent active-filter colors into one token-based visual language, upgrade the empty state with an icon + CTA buttons, and enlarge hit-targets. UI-only: the `+page.server.ts` filter URL-param contract is preserved verbatim. No server/DB/schema/auth changes. Verification = `bun run check` (typecheck) + manual visual gate; component/e2e tests are a known-gap (shared auth fixture blocked).

## Overview

The `/leads` "My Leads" page currently has a crowded two-row toolbar with visual inconsistencies:

- A dangling `Separator` after the segment Tabs (lines 143) that separates nothing.
- Four different ad-hoc active-filter color languages: amber (`Stale only`), violet (`Future events`), indigo (weeks preset pills), ink (`All` weeks button).
- A hand-rolled 5-control "Beyond [4w][8w][12w][number][All]" cluster built from raw `<button>`/`<input>` markup instead of a primitive.
- Small 28px (`h-7`) hit-targets on the weeks controls.
- A bare empty state (title + hint, no icon, no action buttons).

This plan restructures the toolbar for clarity and visual hierarchy, unifies the active-filter styling onto the existing token system, and improves the empty state — all by recomposing primitives already installed in `src/lib/components/ui/`.

## Goals

1. Reduce toolbar clutter via clear primary/secondary filter grouping.
2. Collapse the bespoke weeks cluster + secondary toggles into ONE labeled "Filters" popover with an active-count badge.
3. Unify all active/selected-filter visuals onto ONE token-based language (`--color-selected` / `--color-primary` / `--color-hairline`), removing raw `violet-*` / `indigo-*` / amber-literal Tailwind palette usage.
4. Add an icon + clickable CTA buttons to the empty state.
5. Enlarge hit-targets from `h-7` (28px) to `h-8` (32px, matching `Button size="sm"`), add an active-filters "Clear all" affordance, and remove the dangling separator.

## Scope

**In scope (UI only):**
- `src/routes/leads/+page.svelte` — toolbar markup (lines ~134–247), date banner (249–265), empty-state wiring.
- `src/lib/components/leads/LeadGrid.svelte` — the `empty` snippet (lines 134–139).
- `src/lib/components/shared/EmptyState.svelte` — extend with optional `icon` + `actions` snippet (backward compatible).

**Out of scope (DO NOT TOUCH):**
- `src/routes/leads/+page.server.ts`, `src/lib/server/db/leads.ts`, Zod schemas, appeal-score logic, auth, `DataGridShell.svelte` structural grid, any other route.

## Preserved Contract (verbatim — non-negotiable)

The filter URL-param names, values, and default semantics MUST NOT change. The redesigned controls emit the EXACT same params through the EXISTING `navigate()` / `setFilter()` / `setSegment()` / `setWeeks()` / `onWeeksInput()` / `onSearchInput()` helpers (lines 49–96). Preserved params:

`segment`, `stage`, `platform`, `country`, `staleOnly`, `hasFutureEvents`, `weeksAhead` (number | `all`; default 8), `q`, `sort`, `dir`, `page`, `date`, `dateField`.

Semantics that MUST survive: `weeksAhead` default is `8` (omitted param = 8); `weeksAhead=all` maps to `null`; `staleOnly`/`hasFutureEvents` are boolean toggles; setting any filter resets `page` (the existing `setFilter` deletes `page`); `exportHref` (lines 103–121) must continue to reflect current filters unchanged.

## Touchpoints

| File | What changes |
|---|---|
| `src/routes/leads/+page.svelte` | Restructure toolbar into primary row (Segment Tabs → Stage/Platform/Country selects → Search) + one secondary "Filters" `Popover` housing Stale-only, Future events, and the weeks-timing group; remove dangling `Separator` (143); add active-filter count badge + "Clear all" link; unify active styling to tokens; enlarge hit-targets to `h-8`. NO changes to the `<script>` helper logic (navigate/setFilter/setWeeks/onWeeksInput/exportHref stay byte-for-byte). |
| `src/lib/components/shared/EmptyState.svelte` | Add optional `icon?: IconName` prop (renders `Icon` above title) and optional `actions` snippet (renders CTA row below hint). Existing 3 call-sites keep working (new props optional). |
| `src/lib/components/leads/LeadGrid.svelte` | Pass `icon="leads"` and an `actions` snippet with two `Button href` CTAs (`/unassigned` "Up for grabs", `/leads/new` "Add lead") into `EmptyState`. |

## Public Contracts

- **`EmptyState.svelte` prop surface (additive, backward-compatible):** current props `{ title, hint?, tone? }` gain `icon?: IconName` and an `actions` snippet. All new props optional → the 3 other call-sites (`calendar`, `reminders`, `reports`) are unaffected. This is the only cross-component contract change; it is purely additive.
- **No API/schema/auth/URL contract change.** The `/leads` query-param contract is explicitly preserved (see Preserved Contract).

## Design Decisions (locked)

1. **Weeks cluster collapse → grouped inside a "Filters" popover.** Replace the raw `<button>/<input>` cluster (lines 210–239) with a labeled control group inside the secondary `Popover`: preset options `All future` / `4w+` / `8w+` / `12w+` rendered as a token-styled segmented/radio group, plus the existing custom number `Input` (relabeled, `h-8`). Each option calls the UNCHANGED `setWeeks()` / `onWeeksInput()` helpers. Rationale: one labeled affordance replaces five loose controls while preserving every contract value including arbitrary custom weeks.
2. **Unified active-filter language.** Active toggles/pills use `bg-selected` (`--color-selected` #fdeceb) + `border-primary` + `text-primary` (or `text-primary-strong` for contrast). Inactive use `border-hairline bg-panel text-ink-500 hover:bg-panel-sunken`. Remove all `violet-*`, `indigo-*`, and amber-literal (`bg-[rgba(194,113,12,...)]`, `text-[#92560b]`) classes from the toolbar toggles. The stale-dot / future-event-dot may keep a small semantic color chip (`bg-stale` / `bg-fresh` token) but the button chrome unifies.
3. **Empty state.** Icon (`leads` glyph) above the title, two CTA `Button`s below the hint: `href="/unassigned"` variant `outline` "Up for grabs" and `href="/leads/new"` variant `default` "Add lead".
4. **Hit-targets + affordances.** All interactive filter controls ≥ `h-8` (32px). Add an active-filter count `Badge` on the "Filters" popover trigger and a "Clear all" link (navigates to `/leads?segment={activeSegment}`, mirroring the existing date-banner Clear pattern at lines 258–263). Remove the dangling `Separator` at line 143.
5. **Responsive.** Keep existing `flex flex-wrap` behavior and the `DataGridShell` `lg` card-collapse untouched — no new mobile pattern.

## Reused Primitives (do not reinvent)

`ui/tabs` (Tabs, `variant="segment"`), `ui/select`, `ui/button` (`size="sm"` = `h-8`), `ui/input`, `ui/separator`, `ui/badge`, `ui/popover`, `shared/Icon` (`IconName` incl. `leads`, `plus`), `shared/PageHeader`. Tokens from `src/lib/styles/tokens.css`: `--color-primary`, `--color-primary-strong`, `--color-selected`, `--color-panel`, `--color-panel-sunken`, `--color-hairline`, `--color-focus-ring`, `--color-stale`, `--color-fresh`.

## Implementation Checklist

1. **`EmptyState.svelte` — extend props (backward-compatible).** Add `icon?: import('$lib/components/shared/Icon.svelte').IconName` and `actions` snippet to `$props()`. Render `<Icon name={icon} size={28} />` in a muted circle/centered block above the title when `icon` is set; render `{@render actions?.()}` in a centered flex row (`mt-4 gap-2`) below the hint when provided. Keep `title`/`hint`/`tone` behavior identical.
2. **`LeadGrid.svelte` — enrich empty snippet (lines 134–139).** Import `Button` (`$lib/components/ui/button`). Pass `icon="leads"` to `EmptyState` and add an `actions` snippet: `<Button variant="outline" size="sm" href="/unassigned">Up for grabs</Button>` + `<Button size="sm" href="/leads/new">Add lead</Button>`. Keep title/hint text (or lightly refine hint copy to match CTAs).
3. **`+page.svelte` — remove dangling separator.** Delete the `<Separator orientation="vertical" class="h-[22px]" />` at line 143 (the segment Tabs become the standalone primary row-1, or merge Tabs into the same wrap as the primary selects — pick the merge that reads cleanest, no functional change).
4. **`+page.svelte` — primary filter row.** Keep Stage / Platform / Country `Select`s and the Search `Input` as the always-visible primary controls (Selects left, Search `ml-auto` right). Ensure `SelectTrigger size="sm"` stays (`h-8`).
5. **`+page.svelte` — secondary "Filters" popover.** Replace the Stale-only button (191–198), Future-events button (200–207), the two flanking `Separator`s (189, 209), and the entire weeks cluster (210–239) with ONE `Popover`: trigger is a `Button variant="outline" size="sm"` labeled "Filters" with a `Badge` showing the active-secondary-filter count (compute from `staleOnly` + `hasFutureEvents` + non-default `weeksAhead`). Popover content contains: (a) Stale-only toggle row, (b) Future-events toggle row, (c) weeks-timing group (`All future` / `4w+` / `8w+` / `12w+` segmented options + custom number `Input`), (d) a "Clear all" link. Every control calls the UNCHANGED `setFilter`/`setWeeks`/`onWeeksInput` helpers.
6. **`+page.svelte` — unify active-filter styling.** In the popover toggles and weeks options, use active = `bg-selected border-primary text-primary-strong`, inactive = `border-hairline bg-panel text-ink-500 hover:bg-panel-sunken`. Remove every `violet-*` / `indigo-*` / amber-literal class. Enlarge weeks option + custom input to `h-8` (from `h-7`).
7. **`+page.svelte` — "Clear all" affordance.** Add a link inside the popover (and/or beside the search) that navigates to `/leads?segment={activeSegment}` to reset all filters, shown only when ≥1 filter is active. Mirror the existing date-banner Clear anchor style (`font-mono text-[11.5px] text-primary hover:underline`).
8. **Preserve `exportHref` + date banner.** Do NOT touch the `exportHref` derivation (103–121) or the date banner block (249–265) beyond optional token-consistency tweaks; verify they still compile and reflect filters.
9. **Typecheck gate.** Run `bun run check` — must exit 0 (no new Svelte/TS errors introduced).
10. **Manual visual gate.** Start dev server, load `/leads`, exercise each segment/filter/weeks/search/clear path, confirm URL params match the Preserved Contract table and the empty state renders icon + CTAs (force empty via an unmatched search term).

## Blast Radius

- **Files changed:** 3 (`+page.svelte`, `EmptyState.svelte`, `LeadGrid.svelte`).
- **Packages:** 1 (the SvelteKit app, `src/`).
- **Risk class:** LOW — presentational/markup only; no schema, auth, API, billing, or migration surface. The only cross-file contract is the additive `EmptyState` prop extension (3 other call-sites unaffected because new props are optional). Primary correctness risk is accidentally altering emitted URL params — mitigated by leaving all `<script>` filter helpers untouched and verifying via the manual param-parity gate.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | No type/compile regression from markup + `EmptyState` prop changes (Goals 1–5 don't break the build) |
| Manual: each control emits unchanged URL params (`segment`/`stage`/`platform`/`country`/`staleOnly`/`hasFutureEvents`/`weeksAhead`/`q`) incl. `weeksAhead=all`→null and custom number | Agent-Probe (manual) | Preserved Contract intact (proves the redesign is UI-only) |
| Manual: weeks cluster is now one labeled control inside "Filters" popover with active count badge | Agent-Probe (manual) | Goal 2 (declutter/collapse) |
| Manual: active toggles/pills all use one `--color-selected`/`--color-primary` language; no violet/indigo/amber literals remain (`grep -n "violet-\|indigo-\|92560b\|194,113,12" src/routes/leads/+page.svelte` returns nothing) | Fully-Automated (grep) + Agent-Probe | Goal 3 (unified visual language) |
| Manual: empty state shows `leads` icon + "Up for grabs" and "Add lead" CTA buttons that navigate correctly | Agent-Probe (manual) | Goal 4 (empty-state CTAs) |
| Manual: all filter controls ≥ 32px (`h-8`); dangling separator gone; "Clear all" resets filters | Agent-Probe (manual) | Goal 5 (hit-targets + affordances) |

Component-level and Playwright e2e assertions are a **known-gap**: the `/leads` route is auth-gated and no shared authenticated-session Playwright fixture exists yet (see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Automated proof is limited to typecheck + grep; visual behavior is proven by the manual dev-server gate.

## Test Infra Improvement Notes

(none identified yet — the missing shared Playwright auth fixture that blocks e2e for this page is already tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`; no new infra gap surfaced by this plan.)

## Dependencies & Risks

- **Dependency:** none new. All primitives already installed.
- **Risk (LOW):** Popover-based grouping hides secondary filters behind a click — mitigated by the active-count badge so users see when secondary filters are engaged. Accept as intended declutter tradeoff (decision #1 locked with user).
- **Risk (LOW):** accidental URL-param drift — mitigated by not touching `<script>` helpers and the manual param-parity gate.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/leads/active/leads-page-ux-redesign_03-07-26/leads-page-ux-redesign_PLAN_03-07-26.md`
2. **Last completed step:** VALIDATE complete (validate-contract written; no code changes yet).
3. **Validate-contract status:** written 03-07-26 — Gate: PASS.
4. **Supporting context loaded:** `src/routes/leads/+page.svelte`, `LeadGrid.svelte`, `EmptyState.svelte`, `button.svelte`, `Icon.svelte`, `tokens.css`; feature file listing under `process/features/leads/`.
5. **Next step for a fresh agent:** EXECUTE checklist items 1→10 in order. Hard constraint during EXECUTE: do NOT edit `+page.server.ts` or any server/DB file, and do NOT modify the `<script>` filter helpers in `+page.svelte` — only markup/styling and the `EmptyState` prop extension.

## Validate Contract

Status: PASS
Date: 03-07-26
date: 2026-07-03
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7 not met — 3 files; no schema/auth/API/multi-package surface). Single validate-agent; UI-only presentational change.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | No type/compile regression from markup + EmptyState prop changes | Fully-Automated | `bun run check` exits 0 | A |
| AC4 | No violet/indigo/amber literals remain in leads toolbar | Fully-Automated | `grep -nE "violet-\|indigo-\|92560b\|194,113,12" src/routes/leads/+page.svelte` returns nothing | A |
| AC2 | Every control emits unchanged URL params (incl. `weeksAhead=all`→null + custom number) | Agent-Probe | Manual dev-server gate: exercise each segment/stage/platform/country/staleOnly/hasFutureEvents/weeks/search/clear path; confirm URL params match Preserved Contract table | A |
| AC3 | Weeks cluster + Stale-only + Future-events grouped in one "Filters" popover with active-count badge | Agent-Probe | Manual: open Filters popover; confirm all 3 secondary filters inside + badge count reflects active secondary filters | A |
| AC5 | Empty state renders `leads` icon + working "Up for grabs" + "Add lead" CTAs | Agent-Probe | Manual: force empty via unmatched search term; confirm icon + both CTA buttons navigate to /unassigned and /leads/new | A |
| AC6 | All filter controls ≥ 32px (`h-8`); dangling Separator removed; "Clear all" resets filters | Agent-Probe | Manual: inspect control heights; confirm no dangling separator; "Clear all" navigates to `/leads?segment={activeSegment}` | A |

gap-resolution legend: A — proven now (gate passes in this cycle). B — fixed in this plan. C — deferred to named later phase. D — backlog test-building stub.

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here). Known-Gap is a named residual (see Open gaps), never a strategy that proves a behavior.

Legacy line form:
- Typecheck (AC1): Fully-automated: `bun run check`
- Color-literal removal (AC4): Fully-automated: `grep -nE "violet-|indigo-|92560b|194,113,12" src/routes/leads/+page.svelte` (expect no output)
- URL-param parity / popover grouping / empty-state CTAs / hit-targets (AC2/AC3/AC5/AC6): agent-probe: manual dev-server visual gate
- Component + Playwright e2e assertions: known-gap: documented (shared auth fixture blocked repo-wide)

Failing stub (AC1 — Fully-Automated):
```
test("should pass bun run check with no new type errors after leads toolbar + EmptyState changes", () => { throw new Error("NOT IMPLEMENTED — TDD stub: bun run check exits 0") })
```

Failing stub (AC4 — Fully-Automated):
```
test("should have no violet/indigo/amber color literals in leads +page.svelte toolbar", () => { throw new Error("NOT IMPLEMENTED — TDD stub: grep for violet-|indigo-|92560b|194,113,12 returns nothing") })
```

Dimension findings:
- Infra fit: PASS — UI-only SvelteKit markup recompose; no container/port/runtime surface. All primitives installed; the 9 referenced design tokens are registered in `src/lib/styles/tokens.css` `@theme` and resolve as Tailwind utilities (`bg-selected`/`text-primary-strong`/`border-primary` verified against existing usages).
- Test coverage: PASS — AC1 typecheck + AC4 grep are Fully-Automated; AC2/AC3/AC5/AC6 are legitimate Agent-Probe (manual visual) tiers for UI behavior, not silent skips. Component/e2e is a pre-accepted repo-wide known-gap (shared Playwright auth fixture) carried as a named residual — no developed behavior rests on Known-Gap alone.
- Breaking changes: PASS — EmptyState's `icon?`/`actions` additions are optional; the 3 other callers (calendar +page.svelte:181, reminders:133, reports:349) pass only title/hint/tone and are unaffected. No API/schema/auth/URL contract change; `+page.server.ts` and `<script>` filter helpers untouched → the 13-param filter contract is byte-preserved.
- Security surface: PASS — STRIDE scan clean: presentational markup only; no auth, billing, data, secrets, or trust boundary; no new inputs reach the server; URL params unchanged and already server-validated in `+page.server.ts`.
- Section (Toolbar recompose + EmptyState feasibility): PASS — mechanical feasibility confirmed: EmptyState props at lines 4-8; LeadGrid empty snippet 134-139; dangling Separator at line 143; toggles/weeks cluster 189-239; removable color literals at 195/204/206/218 (match AC4 grep). Icon names `leads`+`plus` exist. Highest-risk edit = checklist item 5 (collapse 5-control weeks cluster + 2 toggles + 2 separators into one Popover): mitigate by wiring every new control to the UNCHANGED setWeeks/onWeeksInput/setFilter helpers and proving param parity via AC2 manual gate.

Open gaps:
- Component + Playwright e2e coverage for the redesigned `/leads` toolbar and empty state: known-gap: documented — shared authenticated-session Playwright fixture does not exist repo-wide (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Pre-accepted; automated proof limited to typecheck + grep; visual behavior proven by the manual dev-server gate.

What this coverage does NOT prove:
- `bun run check` (AC1): proves no TS/Svelte type regression; does NOT prove runtime visual correctness, that emitted URL params are unchanged, or that CTAs navigate.
- Color-literal grep (AC4): proves the four literal palette classes are absent from `+page.svelte`; does NOT prove the replacement token classes render the intended color, nor does it scan LeadGrid/other files (out of scope).
- Manual param-parity gate (AC2): proves observed URL params match the contract during the tester's session; does NOT provide automated regression protection against future param drift (no e2e).
- Manual popover/empty-state/hit-target gates (AC3/AC5/AC6): prove one-time human-observed behavior; do NOT provide repeatable CI assertion, cross-browser coverage, or a11y/keyboard-focus verification of the new Popover (see `process/features/leads/backlog/popover-a11y-audit_NOTE_01-07-26.md` for the analogous manual a11y follow-up pattern).

Execute-agent instructions:
- E1 (Section item 5 — highest risk): When replacing the weeks cluster + toggles with the Popover, wire every new control to the EXISTING setWeeks/onWeeksInput/setFilter/navigate helpers byte-for-byte. Do NOT edit any `<script>` helper. Preserve all contract values: `weeksAhead` default 8, `weeksAhead=all`→null, arbitrary custom number, and page-reset on filter change.
- E2: Do NOT touch `+page.server.ts`, `src/lib/server/db/leads.ts`, Zod schemas, or `DataGridShell.svelte`. UI/markup and the EmptyState prop extension only.
- E3: Keep EmptyState's new props optional and do not alter existing title/hint/tone rendering — the other 3 callers must remain untouched and compiling.
- E4: After code changes, run AC1 (`bun run check`) and AC4 (grep) as the automated gates; both must be green before reporting CODE DONE. Manual gate (item 10) is required for VERIFIED but does not block CODE DONE.

Gate: PASS (no FAILs, plan structurally validated, contract feasible)
Accepted by: n/a (PASS — no CONDITIONAL concerns to accept)

## Acceptance Criteria

- **AC1:** `bun run check` exits 0 with no new errors.
- **AC2:** All `/leads` URL filter params (`segment`, `stage`, `platform`, `country`, `staleOnly`, `hasFutureEvents`, `weeksAhead` incl. `all`→null + custom number, `q`, `sort`, `dir`, `page`, `date`, `dateField`) are emitted identically to before the redesign (Preserved Contract holds).
- **AC3:** The weeks cluster + Stale-only + Future-events toggles are grouped inside one labeled "Filters" popover carrying an active-filter count badge.
- **AC4:** No `violet-*`, `indigo-*`, or amber-literal (`92560b`, `194,113,12`) classes remain in `src/routes/leads/+page.svelte`; active filter chrome uses one `--color-selected`/`--color-primary` language.
- **AC5:** The empty state renders the `leads` icon plus working "Up for grabs" (`/unassigned`) and "Add lead" (`/leads/new`) CTA buttons.
- **AC6:** All filter controls are ≥ 32px (`h-8`); the dangling `Separator` is removed; a "Clear all" affordance resets filters to `/leads?segment={activeSegment}`.

## Phase Completion Rules

This is a single-phase SIMPLE plan. Completion status vocabulary:

- **CODE DONE:** checklist items 1–8 implemented and item 9 (`bun run check`) exits 0.
- **VERIFIED:** CODE DONE plus the manual visual gate (item 10) passes for all AC2–AC6 scenarios on the dev server.
- Testing per `process/context/tests/all-tests.md`: automated coverage is limited to typecheck + grep (see Verification Evidence); component/e2e coverage is a documented known-gap and does NOT block VERIFIED for this UI-only change. Do not mark VERIFIED on code-completion alone — the manual gate is required.

## Autonomous Goal Block

```
SESSION GOAL: Leads Page UX Redesign — declutter the /leads toolbar (primary/secondary filter split + one "Filters" popover with active-count badge), unify active-filter styling onto design tokens, upgrade the empty state (icon + CTAs), enlarge hit-targets — UI-only, filter URL-param contract preserved verbatim.
Charter + umbrella plan: N/A — single plan.
Autonomy: standard single-plan; EXECUTE requires explicit "ENTER EXECUTE MODE". No autonomous phase program.
Hard stop conditions / safety constraints:
- Do NOT edit src/routes/leads/+page.server.ts, src/lib/server/db/leads.ts, Zod schemas, appeal-score logic, auth, or DataGridShell.svelte.
- Do NOT modify the <script> filter helpers in +page.svelte (navigate/setFilter/setSegment/setWeeks/onWeeksInput/onSearchInput/exportHref) — they must stay byte-for-byte so the 13-param URL contract is preserved.
- Keep EmptyState's new icon?/actions props optional — the calendar/reminders/reports callers must not break.
Next phase: EXECUTE — process/features/leads/active/leads-page-ux-redesign_03-07-26/leads-page-ux-redesign_PLAN_03-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: PASS, generated-by: outer-pvl)
Execute start: implement checklist items 1→10; automated gates: `bun run check` (AC1) + `grep -nE "violet-|indigo-|92560b|194,113,12" src/routes/leads/+page.svelte` (AC4, expect no output); manual visual gate (AC2/AC3/AC5/AC6); high-risk pack: no.
```
