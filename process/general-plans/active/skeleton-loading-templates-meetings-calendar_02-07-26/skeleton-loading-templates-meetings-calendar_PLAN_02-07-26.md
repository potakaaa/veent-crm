---
name: plan:skeleton-loading-templates-meetings-calendar
description: "Add matching RouteShells skeleton branches for /templates, /meetings, /meetings/[id], /calendar (issue #132)"
date: 02-07-26
feature: general
---

# Skeleton Loading — Templates, Meetings, Calendar (issue #132)

TL;DR: Add 4 new `{:else if}` branches (plus 4 derived pathname booleans) to the single file `RouteShells.svelte` so the cross-route loading skeleton for `/templates`, `/meetings`, `/meetings/[id]`, and `/calendar` visually mirrors each real page instead of hitting the generic `{:else}` fallback. Following this repo's established skeleton convention: **static/hardcoded text renders as real text; only genuinely server-fetched/dynamic content gets a `Skeleton` block.** Single-file blast radius, mechanical pattern extension, no schema/auth/API changes. Gate: `bun run check`.

**Date**: 02-07-26
**Status**: Active — SUPERSEDED + RE-VALIDATION-PENDING (bugfix supplement #3, 02-07-26): user screenshot shows the `/calendar` skeleton grid + prev/next buttons are nearly invisible (bare `bg-muted` fill has too little contrast against the page background in this theme). The prior Validate Contract (PVL cycle 2, PASS) is marked **SUPERSEDED** because it validated a calendar grid that does not render visibly. Checklist step 5 (`isCalendar` only) is corrected to mirror the REAL bordered `CalendarGrid.svelte` structure (visibility via borders, not fill contrast). Requires re-validation from V1 before re-EXECUTE. Only the `isCalendar` branch body changes; the other 3 branches (isTemplates/isMeetings/isMeetingDetail) are shipped/correct — do not touch.
**Complexity**: SIMPLE
**Issue**: #132

## Supplement History

- **02-07-26 (initial):** Static-vs-skeleton convention correction (real static text vs skeleton).
- **02-07-26 (post-EXECUTE bugfix #1 — meetings shape):** The 4 branches were EXECUTE'd and EVL-passed, but the user reported the `/meetings` skeleton did not match the real page. Orchestrator read-only scout confirmed: the shipped `isMeetings` branch renders `<TableSkeleton rows={8} cols={5} />` (a columnar grid), but the REAL Meetings list (`src/lib/components/meetings/MeetingsPanel.svelte:120–185`) is a single bordered panel container holding a vertical **card-stack** of meeting-item cards — NOT a table. Corrected checklist step 4 (`isMeetings` only) to a bespoke card-stack mirroring the real panel.
- **02-07-26 (PVL cycle 2 re-validation):** The corrected step 4 was re-validated from V1 against on-disk source. Fresh Gate: PASS.
- **02-07-26 (bugfix #1 EXECUTE'd):** The corrected card-stack `isMeetings` branch was shipped (`RouteShells.svelte:210–221` now renders the panel container + card-stack, no `TableSkeleton`) and EVL-passed.
- **02-07-26 (post-EXECUTE bugfix #2 — new-meeting button removal):** (prior supplement — resolved.)
- **02-07-26 (post-EXECUTE bugfix #3 — calendar grid visibility, THIS supplement):** User screenshot of the `/calendar` skeleton shows the shell IS structurally rendering (title "Calendar", subtitle, Month/Week toggle, "Today" button, faint 7×5 grid) but the grid cells and prev/next buttons are nearly INVISIBLE — extremely low contrast against the page background, distinguishable only by faint 1px gridlines. The "Today" button (which HAS a real `border border-hairline bg-panel`) is clearly visible by contrast, proving the defect: the bare `Skeleton` blocks (no border, relying only on `bg-muted` fill color) have too little contrast against this app's page background in this theme. Root cause confirmed against the REAL `CalendarGrid.svelte` (`src/lib/components/calendar/CalendarGrid.svelte:45–93`): the real grid gets its visibility from an OUTER bordered container (`overflow-hidden rounded-control border border-hairline bg-panel`, L48), a bordered weekday header row (`border-b border-hairline bg-panel-sunken`, L51) with 7 real static day labels, and bordered day cells (`border-b border-r border-hairline`, L67–72) — NOT from fill contrast. The current shipped skeleton (`RouteShells.svelte:255–259`) uses a completely different unbordered `grid grid-cols-7 gap-px` of 35 bare `<Skeleton class="h-24 w-full" />` blocks with NO container/header/cell borders. Same issue on prev/next (`:243–244` bare `Skeleton h-8 w-8` with no border). This supplement corrects ONLY checklist step 5 (`isCalendar`): borders for visibility mirroring the real component. Scope, blast radius (`RouteShells.svelte` only, no new imports), and all other branches UNCHANGED. Prior Validate Contract marked SUPERSEDED; re-validation from V1 required.

## Overview

`src/routes/+layout.svelte` swaps page children for `<RouteShells pathname={navigating.to.url.pathname} />` during cross-route navigation. `RouteShells.svelte` derives one boolean per known route and renders a matching shell. Four routes have no branch today and fall through to the generic fallback (a title Skeleton + `TableSkeleton rows={5} cols={4}`), which mismatches their real layouts — this is issue #132. Fix: add the four missing branches, each mirroring the target page's outer wrapper + title + content arrangement so there is no layout jump on mount.

Context loaded per `process/context/all-context.md` conventions (Svelte 5 runes only — `$derived`; presentational component, no server/DB code). Testing routing per `process/context/tests/all-tests.md` — see Post-Phase Testing below.

## Goals

- Add `/templates`, `/meetings`, `/meetings/[id]`, `/calendar` skeleton branches to `RouteShells.svelte`.
- Each branch matches the real page's outer wrapper padding, title shape, and content block arrangement.
- **Follow the repo's skeleton convention: real static text stays real; only dynamic data is skeleton-blocked.**
- **Skeleton content must be VISIBLE — where the real page derives visibility from borders (not fill), the skeleton mirrors those borders rather than relying on `bg-muted` fill contrast alone.**
- No layout jump between skeleton and real page mount.
- Existing branches and the generic fallback stay untouched.

## Scope

**In scope:** Adding 4 derived booleans + 4 `{:else if}` branches to `RouteShells.svelte`. Reuse existing primitives (`CardSkeleton`, `TableSkeleton`) where they fit; add small bespoke inline markup within `RouteShells.svelte` where no primitive fits (meeting-detail narrow column, meetings card-stack, calendar bordered 7-col grid).

**Out of scope (resolved, do not re-litigate):**
- No changes to any `+page.svelte` / `+page.server.ts` of the 4 target routes. (`MeetingsPanel.svelte` and `CalendarGrid.svelte` are read-only reference — they define the shape the skeleton must mirror; they are NOT modified.)
- Calendar's separate same-route (query-param) `navLoading` dim/spinner pattern is NOT touched.
- No new test file (matches existing untested convention for `RouteShells.svelte`).
- No new reusable primitive files unless a shape is clearly reusable elsewhere (none identified — prefer inline in `RouteShells.svelte`).

## Static-vs-Skeleton Convention (governing principle for all 4 branches)

`RouteShells.svelte`'s own header comment (lines 12–14) states the rule: *"Each branch mirrors the real page's loading branch (same outer wrapper + PageHeader title) so there is no layout jump when the real page mounts. Skeletons appear ONLY where server data lands."* The existing `isLeads` branch proves it — the tab labels `['Mine','All','Unassigned','Lost']` render as real `<span>` text (not skeleton blocks), because they are hardcoded, role-independent, data-independent strings; only the filter/search controls and the `TableSkeleton` (server-fetched rows) are skeleton'd.

**Rule for the 4 new branches:** Any text that is a hardcoded, role-independent, data-independent string in the real page (titles, subtitles, fixed tab/toggle labels, fixed field names, fixed weekday header labels) renders as **real text** in the skeleton branch — never as a `Skeleton` block. Only genuinely server-fetched or otherwise data-dependent content renders as a `Skeleton` block, or is **omitted** when its very presence is data-dependent.

**Visibility corollary (added by bugfix #3):** structural chrome that the real page renders with borders (grid containers, header rows, cells, control buttons) must be mirrored with those SAME borders in the skeleton — because in this theme the bare `bg-muted` `Skeleton` fill has too little contrast against the page background to be visible on its own. Do NOT render structural chrome as bare unbordered `Skeleton` blocks; use the real bordered container/cell markup and place `Skeleton` blocks only where dynamic content lands INSIDE that bordered chrome. The `Skeleton` component merges an extra `class` via `cn()`, so `border border-hairline bg-panel` may be added directly to a `Skeleton` for a bordered pulse (bg-panel wins the tailwind-merge over bg-muted; animate-pulse is preserved).

## Touchpoints

- **Modify:** `src/lib/components/shared/skeletons/RouteShells.svelte` — add 4 booleans, 4 branches (and correct the `isCalendar` branch body per bugfix #3). (Only file changed.)
- **Read for reference (no change):** `src/routes/templates/+page.svelte`, `src/routes/meetings/+page.svelte`, `src/lib/components/meetings/MeetingsPanel.svelte`, `src/routes/meetings/[id]/+page.svelte`, `src/routes/calendar/+page.svelte`, `src/lib/components/calendar/CalendarGrid.svelte` (the real bordered month/week grid — border-structure source for `isCalendar`), `src/lib/components/shared/skeletons/{CardSkeleton,TableSkeleton,DetailSkeleton}.svelte`, `src/lib/components/shared/PageHeader.svelte`, `src/lib/components/ui/skeleton/skeleton.svelte` (confirms `class` merges via `cn()`).

Note: `CardSkeleton`, `TableSkeleton`, `Skeleton`, and `PageHeader` are already imported in `RouteShells.svelte` — no new imports needed for any of the 4 branches. The corrected `isCalendar` branch adds NO new imports (`Skeleton` already imported; the bordered structure uses only plain HTML + `Skeleton`).

## Public Contracts

- `RouteShells.svelte` public prop unchanged: `{ pathname: string }`. No new props, no new exports, no barrel change.
- No API, schema, DB, or auth surface. Purely presentational component markup.

## Blast Radius

- **Files:** 1 (`RouteShells.svelte`).
- **Packages:** none (single SvelteKit app, one component).
- **Risk class:** LOW — presentational-only, no data flow, no server code, additive branches that cannot affect existing routes. Bugfix #3's actual code delta is narrow: only the `isCalendar` branch body (prev/next `Skeleton` squares at ~L243–244 gain a border; grid at ~L255–259 is replaced with the bordered container/header/cell structure). The range label (L252) is deliberately left unchanged.

## Acceptance Criteria

- **AC1:** Navigating to `/templates`, `/meetings`, `/meetings/[id]` (any meeting id), and `/calendar` from a different route shows a skeleton shell that visually mirrors that page's real layout instead of the generic fallback. For `/calendar` specifically, "mirrors the real layout" means a bordered grid container with a bordered weekday header row (7 real day labels) and bordered day cells — matching `CalendarGrid.svelte` — NOT an unbordered `gap-px` block grid.
- **AC2:** No visual layout jump between skeleton and real page mount (matching outer wrapper classes).
- **AC3:** Existing branches (isToday, isLeads, isPipeline, etc.) and the generic `{:else}` fallback remain unchanged/untouched for any other route; unknown routes still hit the generic fallback.
- **AC4:** `bun run check` (svelte-check / typecheck) passes with no new errors.
- **AC5:** Static/hardcoded text — titles, subtitles, fixed tab/toggle labels, fixed field names, weekday header labels — renders as **real text**, never a `Skeleton` block, in all 4 new branches; only genuinely server-fetched/dynamic content renders as a `Skeleton` block (or is omitted when its presence is data-dependent).
- **AC6 (added by bugfix #3):** The `/calendar` skeleton grid and its prev/next controls are VISIBLE against the page background — visibility comes from real borders (`border-hairline` container/header/cells; bordered prev/next squares) mirroring `CalendarGrid.svelte`, NOT from `bg-muted` fill contrast alone. No structural chrome renders as a bare unbordered `Skeleton` block.

## Implementation Checklist

1. In `src/lib/components/shared/skeletons/RouteShells.svelte`, add 4 derived booleans alongside the existing ones (after line 25, `isTeam`):
   - `const isTemplates = $derived(pathname === '/templates');`
   - `const isMeetings = $derived(pathname === '/meetings');`
   - `const isMeetingDetail = $derived(pathname.startsWith('/meetings/') && pathname !== '/meetings');`
   - `const isCalendar = $derived(pathname === '/calendar');`
   (STATUS: already shipped and correct on disk.)

2. `{:else if isTemplates}` branch. (STATUS: already shipped and correct on disk — do NOT touch.)

3. `{:else if isMeetingDetail}` branch. (STATUS: already shipped and correct on disk — do NOT touch.)

4. `{:else if isMeetings}` branch (card-stack panel mirroring `MeetingsPanel.svelte`). (STATUS: already shipped and correct on disk — do NOT touch.)

5. **[CORRECTED — post-EXECUTE bugfix #3; RE-VALIDATION-PENDING. THIS IS THE ONLY BRANCH THAT CHANGES AT RE-EXECUTE.]** `{:else if isCalendar}` branch. Mirrors `src/routes/calendar/+page.svelte:92–177` and the REAL `src/lib/components/calendar/CalendarGrid.svelte:45–93`. Keep the outer wrapper `px-7 pb-16 pt-6`, the `PageHeader title="Calendar" subtitle="Team meetings and your follow-ups on one grid."` (real text) with the Month/Week toggle real-static-span snippet (all already present and correct — keep). Two corrections to the branch BODY:
   - **5a. Prev/next controls — add borders for visibility.** Change BOTH prev/next skeleton squares from bare `<Skeleton class="h-8 w-8 rounded-control" />` to bordered `<Skeleton class="h-8 w-8 rounded-control border border-hairline bg-panel" />`. Rationale: the `Skeleton` component merges `class` via `cn()`; the added border renders regardless of the muted fill's low contrast, matching the real prev/next buttons' `border border-hairline bg-panel` weight. (`bg-panel` wins the tailwind-merge over `bg-muted`; `animate-pulse` is preserved.)
   - **5b. Grid — replace the unbordered block grid with the real bordered structure.** Remove the current `<div class="grid grid-cols-7 gap-px">` of 35 bare `<Skeleton class="h-24 w-full" />` blocks entirely. Replace with a structure mirroring `CalendarGrid.svelte`:
     - Outer bordered container: `<div class="overflow-hidden rounded-control border border-hairline bg-panel">` (mirrors `CalendarGrid.svelte:48`).
     - Weekday header row with REAL static labels (matches the Static-vs-Skeleton Convention — hardcoded weekday text renders as real text, not skeleton): `<div class="grid grid-cols-7 border-b border-hairline bg-panel-sunken">` (mirrors L51) containing 7 `<div class="px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[1px] text-ink-400">{label}</div>` (mirrors L53–57) for `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`. Either 7 literal spans or an inline `{#each ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as label (label)}` loop is acceptable (matches the real component's `WEEKDAYS` each-loop).
     - Day cells grid: `<div class="grid grid-cols-7">` (mirrors L62) containing `{#each Array(35) as _, i (i)}` of a bordered cell `<div class="flex flex-col gap-1 border-b border-r border-hairline p-1.5 min-h-[104px] bg-panel">` (mirrors the month-view cell shape at L67–72; use the month `min-h-[104px]` since `RouteShells` only has `pathname`, not the `view` query param). Each cell contains a day-number-circle skeleton placeholder `<Skeleton class="h-5 w-5 rounded-full" />` (the day NUMBER is genuinely unknown at skeleton time — `RouteShells` has no `date`/`view` params — so a skeleton circle is correct here, mirroring the real day-number circle at L74–83, NOT real text).
   - **5c. Range label — leave unchanged.** The `<Skeleton class="ml-1 h-4 w-40" />` range label (dynamic, depends on `date`/`view` query params) stays as-is; it is a secondary/smaller element, not the dominant visibility issue reported. (Considered and intentionally left unchanged.)
   - No new imports (`Skeleton` already imported; bordered structure uses only plain HTML + `Skeleton`).

6. Verify branch placement: all 4 new branches sit inside the existing `{#if}...{:else if}...{:else}` chain, BEFORE the generic `{:else}` fallback. Existing branches and the generic fallback remain byte-for-byte unchanged.

7. Run `bun run check` and confirm it passes (svelte-check / typecheck, no new errors from the corrected branch).

8. Manual visual spot-check (agent-probe): from a different route, navigate to `/templates`, `/meetings`, an existing `/meetings/[id]`, and `/calendar`; confirm each skeleton shell visually mirrors the real page with no layout jump on mount. **For `/calendar` specifically (bugfix #3 focus): confirm the grid renders as a VISIBLE bordered container — bordered weekday header row with 7 real day labels (`Sun`–`Sat`), bordered day cells each with a small skeleton day-number circle — and that the prev/next controls are VISIBLE bordered squares (AC6). The grid must NOT appear as faint near-invisible blocks.** Also verify AC5 (real static text) and that other routes' skeletons are unchanged.

## Phase Completion Rules

This is a single-phase SIMPLE plan. The phase is complete only when:

- All 4 branches + 4 booleans are present in `RouteShells.svelte`, following the Static-vs-Skeleton Convention and the Visibility corollary, INCLUDING the corrected bordered-grid `isCalendar` branch (step 5).
- `bun run check` passes (step 7, AC4) — this is the hard automated gate.
- The agent-probe visual spot-check (step 8) confirms AC1/AC2/AC3/AC5/AC6, including the corrected `/calendar` visible-bordered-grid.
- Code-only completion is `CODE DONE`; promotion to VERIFIED requires the visual spot-check outcome recorded (agent-probe judgment), since no automated component test exists.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | AC4 — typecheck/svelte-check passes; no errors introduced. Also structurally proves the corrected `isCalendar` branch compiles as valid Svelte. |
| Navigate from another route to `/templates` → real PageHeader text + real `Cards`/`List` toggle spans + card-grid skeleton renders, no jump | Agent-Probe | AC1 + AC2 + AC5 (templates). |
| Navigate to `/meetings` → real "Meetings" h1 + bordered panel with card-stack of ~5 skeleton meeting-row cards (NOT a TableSkeleton), no jump | Agent-Probe | AC1 + AC2 + AC5 (meetings list — card-stack). |
| Navigate to `/meetings/[id]` (existing id) → narrow centered column, real "All meetings" back-text + real `Organizer`/`Attendees` labels, dynamic values skeleton'd | Agent-Probe | AC1 + AC2 + AC5 (meeting detail). |
| Navigate to `/calendar` → real PageHeader "Calendar" + real `Month`/`Week`/`Today` static text + VISIBLE bordered grid container (`border-hairline`) with bordered weekday header row (7 real `Sun`–`Sat` labels) + 35 bordered day cells each with a skeleton day-number circle; prev/next render as VISIBLE bordered squares; range label skeleton'd; no jump | Agent-Probe | AC1 + AC2 + AC5 + AC6 (calendar — corrected bordered/visible grid structure). |
| Spot-check: static/hardcoded text renders as real text (never a Skeleton block) in all 4 branches; only dynamic content is skeleton'd | Agent-Probe | AC5 — static-vs-skeleton convention honored. |
| Spot-check: calendar grid + prev/next controls are visible via real borders, NOT faint bare `bg-muted` blocks | Agent-Probe | AC6 — visibility corollary (bugfix #3). |
| Navigate to `/leads`, `/pipeline`, `/reports` (regression) → existing skeletons unchanged; unknown route still hits generic fallback | Agent-Probe | AC3 — existing branches and generic fallback untouched. |

Known-gap: No automated visual/component test for `RouteShells.svelte`. Accepted per RESEARCH scope decision — matches existing convention; adding component-render test infra is out of scope for this mechanical change. Recorded as a backlog-eligible note (Test Infra Improvement Notes), NOT a blocker. AC1/AC2/AC3/AC5/AC6 rest on Agent-Probe visual verification; AC4 is Fully-Automated. Because developed behavior is proven by Agent-Probe (a real proving strategy) rather than Known-Gap, this is not a vacuous-green state. (This known-gap is precisely why both the `/meetings` shape mismatch and the `/calendar` visibility defect were not caught automatically — the corrected branches depend on the same Agent-Probe spot-check for their proof.)

## Post-Phase Testing

Per `process/context/tests/all-tests.md`: this repo uses Vitest (unit) + Playwright (e2e). Neither applies to a presentational skeleton branch with no existing component-test harness. The operative gate is `bun run check` (svelte-check/typecheck) plus the manual agent-probe visual verification in checklist step 8. No new test file is written (matches existing `RouteShells.svelte` untested convention).

## Test Infra Improvement Notes

- No component-render test harness exists for `RouteShells.svelte` (or any skeleton component). A future improvement would be a Vitest + `@testing-library/svelte` test asserting each `pathname` renders the matching branch's marker element (and that hardcoded labels render as real text, not skeleton blocks — AC5) rather than the generic fallback. Out of scope for #132; candidate backlog artifact if skeleton branches grow further.
- **Shape-fidelity gap (surfaced by bugfix #1):** the Agent-Probe-only convention did not catch that the shipped `isMeetings` branch used a table when the real page is a card-stack. A shape-assertion test would have caught it.
- **Visibility-fidelity gap (surfaced by bugfix #3):** the Agent-Probe-only convention did not catch that the shipped `isCalendar` grid was near-invisible (bare `bg-muted` blocks with no borders, too low contrast against the page background in this theme). An assertion that structural chrome (grid container/header/cells) carries `border-hairline` — i.e. renders with borders, not just fill — would have caught it. Reinforces the same backlog candidate: a snapshot/visual-regression or DOM-structure assertion for skeleton branches. Non-blocking.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/skeleton-loading-templates-meetings-calendar_02-07-26/skeleton-loading-templates-meetings-calendar_PLAN_02-07-26.md`
2. **Last completed step:** Original plan EXECUTE'd + EVL-passed; bugfix #1 (meetings card-stack) EXECUTE'd + EVL-passed; bugfix #2 (new-meeting button) resolved. BUGFIX #3 SUPPLEMENT applied 02-07-26 (THIS supplement) — user screenshot showed `/calendar` skeleton grid + prev/next near-invisible; checklist step 5 (`isCalendar` only) corrected to mirror the REAL bordered `CalendarGrid.svelte` structure. Prior Validate Contract (PVL cycle 2, PASS) marked SUPERSEDED. This is a bugfix cycle on already-shipped code, NOT the original PLAN pass.
3. **Validate-contract status:** SUPERSEDED — re-validation from V1 REQUIRED before re-EXECUTE (the prior PASS validated a calendar grid that does not render visibly). The current contract section below is marked SUPERSEDED; a fresh V1–V7 pass must be run against the corrected step-5 spec and on-disk `CalendarGrid.svelte:45–93`.
4. **Supporting context files loaded:** `RouteShells.svelte` (current shipped state read — `isCalendar` branch confirmed: prev/next bare `Skeleton` at L243–244, unbordered `grid grid-cols-7 gap-px` of 35 bare `Skeleton h-24 w-full` at L255–259, `isMeetings` card-stack at L210–221 confirmed shipped/correct), `src/lib/components/calendar/CalendarGrid.svelte:45–93` (real bordered grid — authoritative structure source: outer container L48, weekday header L51–58, day cells L62–92), `src/lib/components/ui/skeleton/skeleton.svelte` (confirms `class` merges via `cn()` so `border ... bg-panel` is valid on a `Skeleton`), `process/context/all-context.md` conventions.
5. **Next step for a fresh agent:** Re-validate from V1 (VALIDATE mode) against corrected step 5. After PASS, open `RouteShells.svelte`: (5a) add `border border-hairline bg-panel` to BOTH prev/next `Skeleton` squares (~L243–244); (5b) replace the `<div class="grid grid-cols-7 gap-px">`+35 bare blocks (~L255–259) with the bordered container/header/cell structure from step 5b (leave range label L252 unchanged). Do NOT touch the outer wrapper, PageHeader, Month/Week toggle, the other 3 branches, existing branches, or the generic fallback. Then run `bun run check` (step 7) and the visual spot-check (step 8, focusing on `/calendar` grid visibility + AC6). Single file — no new imports.

## Next Step

Bugfix #3 supplement applied. Prior Validate Contract SUPERSEDED. Ready for RE-VALIDATION from V1 (VALIDATE mode) of the corrected `isCalendar` branch, then re-EXECUTE of the `isCalendar` branch body only. Change remains single-file, LOW risk, no schema/auth/API surface.

## Validate Contract

**Status: SUPERSEDED (bugfix #3, 02-07-26)** — the PVL cycle 2 PASS below validated a calendar skeleton grid that renders near-invisibly (bare `bg-muted` blocks, no borders) against this theme's page background. The user's `/calendar` screenshot is the disproving evidence. This contract is retained for audit only; a fresh V1–V7 re-validation must be run against corrected checklist step 5 (bordered grid mirroring `CalendarGrid.svelte:45–93`) and new AC6 before re-EXECUTE. Do NOT treat the PASS below as authorizing EXECUTE.

---
(SUPERSEDED — audit record of PVL cycle 2)

Status: PASS (SUPERSEDED)
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — prior contract superseded by the meetings-shape bugfix; this PVL cycle 2 record is now itself SUPERSEDED by bugfix #3 (calendar grid visibility).

Parallel strategy: sequential
Rationale: 0/7 signals — single-file, presentational-only, no schema/auth/API/billing surface, LOW risk class.

Test gates (audit record — validated the card-stack `isMeetings` branch; did NOT catch the `isCalendar` visibility defect because AC6 did not yet exist and the Agent-Probe spot-check was described but not performed against a rendered screenshot):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | The 4 branches + 4 booleans compile as valid Svelte; no new type/svelte-check errors | Fully-Automated | `bun run check` exits 0 | A — proven |
| AC1+AC2+AC5 (meetings) | `/meetings` skeleton is a bordered card-stack panel (not a table) | Agent-Probe | Manual nav spot-check | A — proven at re-EXECUTE |
| AC1+AC2+AC5 (calendar) | `/calendar` skeleton: PageHeader + Month/Week/Today real text + 7-col grid skeleton | Agent-Probe | Manual nav spot-check | **SUPERSEDED — the grid was near-invisible; new AC6 added by bugfix #3** |
| (residual) | Automated visual/component-render assertion | — | Known-Gap (no component-render harness) | D — backlog test-building stub |

Gate: PASS (SUPERSEDED) — the calendar row's proof was insufficient (no AC6 visibility criterion; spot-check not performed against a rendered view). Re-validation required.

---

**Fresh contract (bugfix #3 re-validation):**

## Validate Contract

Status: PASS
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — bugfix #3 calendar-visibility re-validation has current evidence; the prior PVL cycle 2 PASS (audit record above) validated a near-invisible unbordered grid and is SUPERSEDED. Corrected step 5 now mirrors the REAL bordered `CalendarGrid.svelte:45–93` (verified against on-disk source this cycle).

Parallel strategy: sequential
Rationale: 0/7 signals — single-file, presentational-only, no schema/auth/API/billing surface, LOW risk class, no multi-package, no 3+ directions.

Test gates (C3 5-column table — additive; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | Corrected isCalendar branch (bordered prev/next + bordered grid container/header/cells) compiles as valid Svelte; no new type/svelte-check errors | Fully-Automated | `bun run check` exits 0 | A — proven at re-EXECUTE |
| AC6 (calendar visibility) | `/calendar` skeleton grid + prev/next render VISIBLE via real `border-hairline` chrome (bordered container mirroring CalendarGrid.svelte:48, bordered weekday header L51 with 7 real Sun–Sat labels, bordered day cells L67–72 with skeleton day-number circles), NOT via bg-muted fill contrast | Agent-Probe | Navigate from another route to `/calendar`; confirm grid is a visible bordered container + visible bordered prev/next squares, no faint near-invisible blocks, no layout jump | A — proven at re-EXECUTE (probe MUST be performed against a rendered view — see E1) |
| AC1+AC2+AC5 (calendar) | Real PageHeader "Calendar" + Month/Week/Today real static text + 7 real weekday labels render as real text (never Skeleton); range label + day-number stay skeleton'd; outer wrapper matches real page (no jump) | Agent-Probe | Same nav spot-check | A — proven at re-EXECUTE |
| AC3 (regression) | Other 3 new branches (isTemplates/isMeetings/isMeetingDetail), existing branches, and generic {:else} fallback stay byte-for-byte unchanged; unknown routes still hit fallback | Agent-Probe | Navigate to /templates,/meetings,/meetings/[id],/leads,/pipeline,/reports + an unknown route | A — proven at re-EXECUTE |
| (residual) | Automated visual-regression / DOM-structure assertion that skeleton structural chrome carries border-hairline | Known-Gap | — (no component-render harness exists) | D — backlog test-building stub |

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Agent-Probe here). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained for existing consumers):
- isCalendar branch compile: Fully-automated: `bun run check`
- isCalendar visibility (AC6) + layout (AC1/AC2/AC5): agent-probe: navigate to /calendar from another route; confirm visible bordered grid + bordered prev/next, real static text, no jump
- regression (AC3): agent-probe: navigate to other 4 branches + 3 existing + unknown route; confirm unchanged
- automated visual-regression: known-gap: documented (no component-render harness) — backlog-eligible

Dimension findings:
- Infra fit: PASS — single SvelteKit presentational component, correct file path (`src/lib/components/shared/skeletons/RouteShells.svelte`), no runtime/port/container surface. Skeleton class-merge via `cn()` confirmed on-disk (`skeleton.svelte:10`), so `border border-hairline bg-panel` on a `<Skeleton>` is valid (bg-panel wins tailwind-merge over bg-muted; animate-pulse preserved).
- Test coverage: PASS — AC4 Fully-Automated (`bun run check`) proves compilation; AC6/AC1/AC2/AC5/AC3 proven by Agent-Probe (valid strategy). Automated visual-regression is a named Known-Gap residual, not sole coverage → not vacuously green. Residual risk: the same Agent-Probe gap let bugfix #1 and #3 slip; mitigated by E1 (probe MUST be performed against a rendered view this cycle, not merely described).
- Breaking changes: PASS — public prop unchanged (`{ pathname: string }`); no new exports/barrel change; no API/schema/DB/auth surface. Corrective branch-body change only.
- Security surface: PASS — no auth/identity/billing/credits/data-migration/secrets/trust-boundary touched (vc-security STRIDE/OWASP scan: nothing to flag). Presentational-only.
- isCalendar section feasibility: PASS — edit targets uniquely matchable on-disk: prev/next `<Skeleton class="h-8 w-8 rounded-control" />` x2 (L243–244) and grid `<div class="grid grid-cols-7 gap-px">` + `{#each Array(35) ...}` of `<Skeleton class="h-24 w-full" />` (L255–259). Spec 5a/5b matches CalendarGrid.svelte:45–93 exactly. Highest-risk edit = grid replacement (5b, largest delta); mitigation = replace ONLY the L255–259 block + L243–244 squares, leave outer wrapper/PageHeader/Month-Week toggle/Today button (L246–250)/range label (L252)/generic fallback byte-for-byte unchanged.

Open gaps:
- Automated visual/component-render assertion for RouteShells skeleton branches: known-gap: documented — no component-render harness exists for this repo's skeleton components; matches prior cycles; backlog-eligible (Test Infra Improvement Notes). NOT a blocker.

What this coverage does NOT prove:
- `bun run check` (AC4): proves the corrected branch compiles as valid Svelte and introduces no type/svelte-check errors. Does NOT prove the grid renders VISIBLY, that borders show against the theme background, that weekday labels read as real text, that there is no layout jump, or that other branches are visually unchanged — all of that rests on the Agent-Probe spot-check.
- Agent-Probe (AC6/AC1/AC2/AC5/AC3): proves, by human/agent visual judgment against a rendered `/calendar`, that the grid + prev/next are visible bordered chrome and other routes are unchanged. Does NOT provide an automated regression guard — a future code change could silently re-break visibility with no failing test (this is the documented known-gap and the exact reason bugfix #1 and #3 slipped).

Execute-agent instructions:
- E1: The `/calendar` Agent-Probe spot-check MUST be performed against an actually-rendered view (browser/screenshot), not merely described. This is the root-cause mitigation — both bugfix #1 (meetings shape) and bugfix #3 (calendar visibility) slipped because the probe was described but not executed against a rendered page. Do not mark VERIFIED until the rendered check confirms AC6.
- E2: Change ONLY the isCalendar branch body — the two prev/next `<Skeleton>` squares (add `border border-hairline bg-panel`) and the grid block (replace with the bordered container/header/cell structure per step 5b). Leave the outer wrapper (L224), PageHeader (L225–239), Month/Week toggle snippet, Today button (L246–250), range label (L252), all other branches, and the generic `{:else}` fallback byte-for-byte unchanged. No new imports.

Gate: PASS (no FAILs, no unresolved CONCERNs; plan mechanically verified against on-disk source; probe execution enforced via E1)
Accepted by: session (autonomous, bugfix #3 re-validation) — no CONCERNs to accept; PASS is unconditional. Automated visual-regression recorded as a pre-accepted known-gap residual (not a CONCERN).

## Autonomous Goal Block

```
SESSION GOAL: Add matching RouteShells skeleton branches for /templates, /meetings, /meetings/[id], /calendar (issue #132). BUGFIX #3 (SUPERSEDED prior PASS): the isCalendar branch grid + prev/next controls render near-invisibly (bare bg-muted, no borders); correct the isCalendar branch to mirror the REAL bordered CalendarGrid.svelte structure (visibility via border-hairline container/header/cells + bordered prev/next squares), NOT fill contrast.
Charter + umbrella plan: N/A — single plan
Autonomy: single-file SIMPLE presentational change; standing EXECUTE consent for this plan AFTER re-validation. Reversible-only edits; no schema/auth/API/billing surface. Auto-proceed on all EXECUTE/EVL steps once V1–V7 re-validation is PASS.
Hard stop conditions / safety constraints:
- Do NOT modify any +page.svelte / +page.server.ts of the 4 target routes; do NOT modify MeetingsPanel.svelte or CalendarGrid.svelte (read-only references — they define the shape).
- Do NOT touch existing RouteShells branches, the calendar outer wrapper/PageHeader/Month-Week toggle, the other 3 new branches (isTemplates/isMeetings/isMeetingDetail), or the generic {:else} fallback (all must stay byte-for-byte unchanged). Bugfix #3 touches ONLY the isCalendar branch body: prev/next Skeleton squares (add border) + the grid block (replace with bordered structure). Leave the range label Skeleton unchanged.
- Do NOT add new test files or new primitive component files, and NO new imports (no Button, no Icon, no spinner).
- Static/hardcoded text renders as real text (never a Skeleton block); weekday labels Sun–Sat render as real text. Structural chrome (grid container/header/cells, prev/next) renders WITH borders (AC6), never as bare unbordered bg-muted blocks.
Next phase: EXECUTE: process/general-plans/active/skeleton-loading-templates-meetings-calendar_02-07-26/skeleton-loading-templates-meetings-calendar_PLAN_02-07-26.md (bugfix #3 re-validation PASS, 02-07-26)
Validate contract: inline in plan — fresh bugfix #3 re-validation Gate: PASS (02-07-26); prior PVL cycle 2 PASS SUPERSEDED (audit record retained). Cleared for re-EXECUTE of the isCalendar branch body only.
Execute start: fully-auto: `bun run check` (exits 0) | agent-probe: navigate from another route to /calendar — confirm the grid is a VISIBLE bordered container (bordered weekday header with 7 real labels + bordered day cells + skeleton day-number circles) and prev/next are visible bordered squares (AC6), no layout jump; confirm /templates,/meetings,/meetings/[id] + /leads,/pipeline,/reports + unknown-route fallback unchanged | high-risk pack: no
```
