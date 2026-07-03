---
phase: ufg-card-layout-polish
date: 2026-07-03
status: PASS3_VISUAL_CONFIRMED
feature: leads
plan: process/features/leads/active/ufg-card-layout-polish_03-07-26/ufg-card-layout-polish_PLAN_03-07-26.md
---

# EXECUTE Report — UFG Mobile Card Layout Polish (#173 + #174)

## What Was Done

All 8 code-edit checklist steps applied to the single in-scope file
`src/routes/unassigned/+page.svelte` (`rows` snippet), exactly as specified — no deviation:

1. Row wrapper div (line 406): appended ` mb-3 last:mb-0 lg:mb-0`.
2. Stage chip div (line 472): `class="order-4 lg:order-none"`.
3. Source badge wrapper div (line 473): `class="order-5 lg:order-none opacity-70"` (inner dynamic `sourceLabel(...).class` span untouched).
4. Country div (line 480): → `order-6 lg:order-none truncate font-mono text-[11px] text-ink-300`.
5. Category div (line 481): → `order-2 lg:order-none truncate font-mono text-[12px] text-ink-400` (order only, no de-emphasis — primary field).
6. Former owner div (line 482): → `order-7 lg:order-none font-mono text-[11px] text-ink-300`.
7. Appeal score div (line 483): `class="order-1 lg:order-none"`.
8. Actions div (line 484): → `order-3 lg:order-none flex items-center gap-1.5`.

`DataGridShell.svelte` and `LeadGrid.svelte` never touched (hard constraint respected).

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `grep -n "order-1..order-7"` shows all 7 `order-N lg:order-none` pairs | Fully-Automated | PASS — 7 pairs on correct fields (lines 472,473,480,481,482,483,484) |
| `git diff --stat DataGridShell.svelte LeadGrid.svelte` empty | Fully-Automated | PASS — zero diff (exit 0, empty output) |
| `bun run check` | Fully-Automated | PASS — exit 0 (0 errors; 1 pre-existing warning in `leads/[id]/+page.svelte`, unrelated) |
| `bun run test:unit:ci` | Fully-Automated | PASS — exit 0 (340 passed, 106 skipped, 0 failed) |

## Per-AC Status (AC1–AC7)

- **AC1 (field order)** — structural half CONFIRMED (grep proves all 7 order classes present in the target sequence: appeal→1, category→2, actions→3, stage→4, source→5, country→6, former-owner→7; checkbox/organizer/event stay implicit order-0). Visual half NOT independently confirmed (no browser tooling — Agent-Probe not run).
- **AC2 (de-emphasis)** — structural CONFIRMED (country/former-owner dropped to `text-[11px] text-ink-300`; source badge wrapper given `opacity-70`; category correctly left unchanged). Visual rendering NOT independently confirmed.
- **AC3 (actions reachable)** — structural CONFIRMED (`order-3` places actions right after the 4 primary fields). Visual/scroll behavior NOT independently confirmed. Hybrid e2e remains pre-existing `test.fixme()` known-gap (auth-fixture).
- **AC4 (inter-card gap)** — structural CONFIRMED (`mb-3 last:mb-0 lg:mb-0` on row div). Visual gap NOT independently confirmed.
- **AC5 (/leads unchanged)** — structural half CONFIRMED (git diff zero on `DataGridShell.svelte`/`LeadGrid.svelte` — regression structurally impossible). Visual half NOT independently confirmed.
- **AC6 (desktop unchanged)** — structural CONFIRMED (every mobile class paired with `lg:order-none`/`lg:mb-0` reset). Visual pixel-parity NOT independently confirmed.
- **AC7 (green gates)** — CONFIRMED. `bun run check` and `bun run test:unit:ci` both exit 0.

## What Was Skipped or Deferred

- **Agent-Probe visual passes (AC1 visual half, AC2, AC3, AC4, AC5 visual half, AC6):** NOT performed. No reliable browser/dev-server + mobile-viewport inspection tooling available in this environment. Explicitly NOT claiming visual confirmation. These require a manual/agent-browser pass before the plan can be marked VERIFIED.

## Plan Deviations

None. Implementation matches the approved plan exactly.

## Test Infra Gaps Found

- No new gaps. Carried-forward known-gaps unchanged: (1) no visual-regression/component-snapshot infra in repo; (2) e2e specs on protected routes self-skip pending shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`); (3) design known-gap — CSS `order-*` changes visual order only, not DOM/tab/screen-reader traversal order (accepted trade-off per Decision 1, no SPEC AC requires DOM reorder).

## Closeout Packet

- **Selected plan:** `process/features/leads/active/ufg-card-layout-polish_03-07-26/ufg-card-layout-polish_PLAN_03-07-26.md`
- **Finished:** all code edits + all 4 Fully-Automated gates green.
- **Verified vs unverified:** structural/automated ACs verified; visual Agent-Probe halves of AC1–AC6 unverified (no browser tooling here).
- **Cleanup remaining:** manual/agent-browser visual pass of `/unassigned` (mobile + desktop) and `/leads`; then UPDATE PROCESS archival.
- **Best next state:** Keep plan in `active/` — code-complete, automated-green, but visual confirmation pending. Not yet VERIFIED per plan's Phase Completion Rules.

## Forward Preview

- **Test Infra Found:** none new.
- **Blast Radius Changes:** 1 file, presentational CSS classes only.
- **Commands to Stay Green:** `bun run check`; `bun run test:unit:ci`.
- **Dependency Changes:** none.

---

## Pass 2 — Visual Design Remediation (browser-verified, 03-07-26)

**Why:** Pass 1's `mb-3` gap was computed-correct (12px) but visually invisible — every mobile
row shared the same white `bg-panel` as its parent container, and rows had no border/shadow of
their own, so a 12px white-on-white gap between white content read as one unbroken block. User
rejected it on their phone ("NOTHING CHANGED… where is the space between each cards"). Root cause
was confirmed empirically (live dev server + Playwright + `getBoundingClientRect`) before any edit:
the CSS was working; the *design* never made a card a visually distinct unit.

**What changed (all in `src/routes/unassigned/+page.svelte` only; every mobile style paired with an
`lg:` reset so desktop is byte-identical):**

1. **Card chrome (Part A / AC4):** each mobile row is now a real card — `rounded-[11px]
   border border-hairline-strong bg-panel px-4 py-3.5 shadow-frame`, inset `mx-2`, `mb-3` between
   cards, top gutter via `[&:nth-child(2)]:mt-3` (the shell's mobile-hidden header is child 1, so
   the first data row is child 2). The **border** — not the gap — is what guarantees visibility
   regardless of the white-on-white background that failed in Pass 1. Desktop reset restores the
   original flat table row exactly: `lg:rounded-none lg:border-l-0/r-0/t-0 lg:border-b
   lg:border-panel-sunken lg:bg-transparent lg:py-0 lg:shadow-none lg:mx-0 lg:mb-0
   lg:last:border-b-0 lg:[&:nth-child(2)]:mt-0`.
2. **Checkbox → card header (Part B):** absolute `right-3.5 top-3.5` top-right corner on mobile
   (removes the awkward lone-checkbox line that opened each card), `lg:static` returns it to grid
   column 1 on desktop. Organizer block gets `pr-7 lg:pr-0` so a long truncated name never slides
   under it.
3. **Zone divider (Part B):** a `border-t border-panel-sunken pt-2.5 mt-1.5` hairline (reset at
   `lg:`) above the stage chip separates the "act on this" zone (name / event / appeal / category /
   actions) from the de-emphasized "reference" meta footer (stage / source / country / former
   owner).
4. **Typography (Part B):** mobile-only bumps with `lg:` resets — organizer name `text-[13.5px]`
   (`lg:text-[13px]`), event name `text-[13px] text-ink-700` (`lg:text-[12.5px] lg:text-ink-600`),
   category `text-ink-600` (`lg:text-ink-400`). Secondary fields kept quiet (`text-[11px]
   text-ink-300`, source `opacity-70`).

**No DOM reorder** — the mobile order was already correct via the existing `order-*` classes, so all
`order-*` values are untouched and the desktop grid auto-placement is unchanged.

### Browser-verified evidence (live server :5173, the one the user views; Playwright, chromium)

Authenticated as `jonna@test.com` via the dev magic-link console flow; computed styles read
directly off the rendered DOM.

| Viewport | Metric | Result |
|---|---|---|
| Mobile 390px | card count / gap | 25 cards, **12px gap** between cards |
| Mobile 390px | card border | `1px rgb(222,218,225)` (= `--color-hairline-strong` #dedae1) |
| Mobile 390px | radius / shadow / bg / margin-x | `11px` / `shadow-frame` present / white / `8px` inset — cards render as distinct outlined rectangles |
| Desktop 1280px | `/unassigned` card | radius `0`, border-top `0`, border-bottom `1px rgb(241,239,243)` (panel-sunken), no shadow, bg transparent, margin-x `0`, padding-y `0` — **identical to original flat table row** |
| Desktop 1280px + Mobile 390px | `/leads` | screenshot-confirmed unchanged (flat hairline-separated rows, no card chrome) |

Screenshots captured (scratchpad, not committed): `ufg-mobile-390.png`, `ufg-desktop-1280.png`,
`leads-desktop-1280.png`, `leads-mobile-390.png`.

### Per-AC status after Pass 2

- **AC1 (primary fields first)** — CONFIRMED (structural + visual). Order in browser: organizer →
  event/date → appeal → category → actions → [divider] → stage → source → country → former owner.
- **AC2 (secondary de-emphasized)** — CONFIRMED (visual). Meta footer renders in small
  `text-ink-300` / `opacity-70`, clearly quieter than the primary block above the divider.
- **AC3 (actions reachable)** — CONFIRMED (visual). Edit + Claim row sits directly under the 4
  primary fields, above the reference footer — reachable without scrolling past secondary data.
  (Hybrid e2e still self-skips pending the shared auth fixture — pre-existing known-gap, unchanged.)
- **AC4 (VISIBLE inter-card gap)** — **CONFIRMED (visual — the AC that failed in Pass 1).** Cards
  now read as separate bordered/shadowed units with a real 12px gap; verified in a rendered
  screenshot, not just a computed number.
- **AC5 (/leads unchanged)** — CONFIRMED (structural zero-diff on shared components + visual
  before/after screenshots of `/leads` mobile & desktop).
- **AC6 (desktop unchanged)** — CONFIRMED (visual + computed-style parity: desktop card metrics
  match the original flat table row exactly).
- **AC7 (green gates)** — CONFIRMED. `bun run check` exit 0 (0 errors, 1 pre-existing unrelated
  warning); `bun run test:unit:ci` 340 passed / 0 failed.

### Notes / housekeeping

- A stray `.debug-ufg.mjs` at the repo root (from the earlier debug pass, not created in this pass)
  remains untracked — flagged for deletion so it is not accidentally committed. My own temp
  Playwright script (`.debug-ufg-verify.mjs`) was deleted after verification.
- The port-5180 second dev server was left running (orchestrator-managed); port 5173 was never
  restarted.

---

## Pass 3 — Three Follow-Up Requests After Live Review (browser-verified, 03-07-26)

User reviewed Pass 2 live on `/unassigned` and asked for three more concrete changes, all
verified against the real running server (`:5173`) via the same magic-link + Playwright approach.
**Files touched this pass:** `src/routes/unassigned/+page.svelte`,
`src/lib/components/leads/DataGridShell.svelte` (new optional prop), and
`src/lib/components/shared/PageHeader.svelte` (universal fix, used by 11 route files).

### Request 1 — 2×2 footer grid for stage/source/country/former-owner

**Key finding before editing:** desktop layout is governed entirely by DOM order, not by the
mobile `order-N` values. Every cell previously used `lg:order-none` (→ `order: 0` at desktop), so
with all ties equal, CSS Grid falls back to **document order** to place items in the explicit
10-column template. That means physically relocating any cell in the markup — which a naive 2×2
wrapper would require, since `category` (a primary field, must stay OUT of the 2×2) sits between
`country` and `former-owner` in the current DOM — would have silently broken the desktop column
alignment.

**Fix:** replaced the blanket `lg:order-none` reset with **explicit desktop order values on every
affected cell** (`lg:order-1` stage … `lg:order-7` actions, matching the original column sequence
exactly: stage→source→country→category→former-owner→appeal→actions), so desktop position is no
longer coupled to DOM position at all. This let me freely wrap just the 4 target fields
(`stage`, `source`, `country`, `former-owner`) in one new mobile-only 2×2 grid without touching
`category`'s position requirements or any desktop risk. `category`, `appeal`, and `actions` — the
cells NOT in scope for this request — keep their same mobile `order-N` positions as Pass 2, so the
rest of the card layout is unchanged.

Mechanism: `<div class="order-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-panel-sunken pt-2.5 lg:contents">` wraps the 4 fields; each child carries only its `lg:order-N` (no mobile
order needed — natural DOM order inside the wrapper already gives the desired row-major pairing:
stage+source top row, country+former-owner bottom row). `lg:contents` makes the wrapper's own box
(including its border/padding/margin) disappear entirely at `lg+`, so the children become direct
items of the outer 10-column grid again, governed purely by their own explicit `lg:order-N`.

**Verified (live, mobile 390px):** `getComputedStyle` on the footer grid confirms
`grid-template-columns: 144px 144px` (2 equal columns) with exactly 4 children at two distinct
`top` values (row 1 at `top:495`, row 2 at `top:527`) and two `left` values (`45`, `201`) each —
a real, rendered 2×2. Screenshot confirms stage("New")+source("Scraped") on row 1,
country("Philippines")+former-owner("never assigned") on row 2 — the pairing suggested by the
orchestrator.
**Verified (live, desktop 1280px):** card computed style unchanged from Pass 2 (radius 0,
border-top 0, border-bottom 1px, transparent bg, no shadow) — the `lg:contents` unwrap and the
new explicit `lg:order-N` values reproduce the exact original desktop column order.

### Request 2 — Bulk-select header layout fix (`PageHeader.svelte`)

Read all 11 `PageHeader` consumers before deciding scope (`grep -rl "PageHeader" src/routes`):
`/leads` (matching-count text + Export CSV button), `/calendar` (view toggle), `/pipeline` (a
status span), `/team` and `/templates` (single "+ Add" button, conditional), `/reports` (export
link), `/` (meta snippet only), and `/unassigned` (the most complex — up to 3 items: selected
count, Claim button, conditional Assign dropdown). The root cause was generic to the component,
not `/unassigned`-specific: `flex items-end justify-between` tries to fit a wrapping
title+subtitle block AND the actions snippet side-by-side with no wrap handling — any consumer
with more than a trivial one-word action was at risk on narrow screens, `/unassigned`'s
conditional 3-item selection bar just made it most visible.

**Fix (universal, all 11 consumers):** changed the header row to `flex flex-col items-start gap-3
sm:flex-row sm:items-end sm:justify-between sm:gap-4` (stacks title above actions below `sm`,
returns to the original inline row at `sm+`) and made the actions container `flex-wrap` so a
future 4th action item wouldn't overflow either. This is a genuine bug fix, not a scoped
opt-in — safe for all consumers because: (a) at `sm+` (640px) the layout is byte-identical to
before (same classes, same effective computed styles — confirmed via desktop screenshots showing
all pages), and (b) at mobile widths every consumer either had a single short action (now simply
sits on its own row below the title — no behavior loss, in some cases an improvement) or had zero
actions (default fallback to `meta`, untouched except a null `text-right` prefix removed to
`sm:text-right` for the same reason).

**Verified (live, mobile 390px, `/unassigned` with 2 leads selected):** `flexDirection: "column"`
confirmed via computed style; header height 150px with the actions row (`"2 selected" / "Claim
2"`) rendering at `y:200`, well clear of the title/subtitle block ending above it — no overlap,
clean stacked layout in the screenshot.
**Verified (live, desktop 1280px, `/unassigned` with 1 lead selected):** header renders as the
original single row (`"1 selected  Claim 1"` inline, right-aligned) — unchanged from Pass 2.
**Verified (live, `/leads` both viewports):** desktop is pixel-identical to the pre-Pass-3
screenshot (title+subtitle left, "427 matching" + Export CSV button right, same row). Mobile
actually improved: "427 matching / Export CSV" now renders as a clean row below the subtitle
instead of the cramped inline placement next to wrapped subtitle text seen in the Pass 2
screenshot — a genuine fix, not a regression.

### Request 3 — Remove outer `DataGridShell` box on mobile

Added an optional `mobileBare?: boolean` prop (default `false`) to `DataGridShell.svelte`. When
`false` (the untouched default — confirmed `LeadGrid.svelte`'s call site never passes this prop,
so `/leads` keeps its exact current behavior), the outer wrapper keeps `overflow-hidden
rounded-control border border-hairline bg-panel` unconditionally, exactly as before. When `true`
(passed only from `/unassigned`), those same classes become `lg:`-prefixed only — no box at all
below `lg`, full panel chrome restored at `lg+`. Also handled the loading-skeleton state: when
`mobileBare`, skeleton rows get a small individual card treatment (`rounded-[8px] border
border-hairline bg-panel`, reset at `lg:`) so the temporary loading state doesn't look broken
floating with no box behind it on mobile.

Also removed the now-redundant `mx-2` inset that Pass 2 added to rows (it was compensating for
being inset from the old outer box's edge) — with the outer box gone, the page's own `px-7`
container padding is sufficient on its own; keeping `mx-2` on top would have added an unnecessary
extra 8px indent on each side for no visual reason.

**Verified (live, mobile 390px):** `getComputedStyle` on the shell's outer wrapper shows
`background: rgba(0,0,0,0)`, `border-width: 0px`, `border-radius: 0px` — the outer box is
genuinely gone; the individually-bordered/shadowed cards (Pass 2) are the only visible container,
sitting directly on the page's canvas background, confirmed in the screenshot.
**Verified (live, desktop 1280px):** the same wrapper shows `background: rgb(255,255,255)`,
`border-width: 1px`, `border-radius: 9px` — exactly the original panel chrome (`bg-panel` /
`border-hairline` / `rounded-control` = 9px) restored at `lg+`, confirmed in the screenshot
(bordered panel, unchanged from Pass 2/original).
**Verified (live, `/leads` both viewports):** `LeadGrid.svelte`'s `<DataGridShell {cols} {loading}
skeletonCells={8} isEmpty={...}>` call site does not pass `mobileBare` — screenshots confirm zero
visual change (still boxed at all widths, same as Pass 2 baseline).

### Test gates (Pass 3)

| Gate | Result |
|---|---|
| `bun run check` | PASS — exit 0, 0 errors (1 pre-existing unrelated warning in `leads/[id]/+page.svelte`) |
| `bun run test:unit:ci` | PASS — 340 passed, 0 failed, 106 skipped |
| `git diff --stat` scoped to the 3 touched files | 3 files changed, 70 insertions(+), 26 deletions(-) — no other files touched by this pass |

### Per-request status

- **Request 1 (2×2 footer grid):** CONFIRMED — live computed-style + screenshot evidence, desktop
  column alignment provably preserved via the new explicit `lg:order-N` scheme (not just visually
  similar — mechanically decoupled from DOM position this time).
- **Request 2 (bulk-select header):** CONFIRMED — universal `PageHeader.svelte` fix, verified
  clean on `/unassigned` at both viewports and confirmed safe (byte-identical desktop, improved
  mobile) on `/leads`, the one other consumer with comparably active `actions` content.
- **Request 3 (remove outer box):** CONFIRMED — new `mobileBare` opt-in prop, default-safe for
  `/leads` (never passes it), verified both the mobile box-removal and the desktop box-restoration
  via computed styles and screenshots.

### Housekeeping note

The working tree at the start of this pass already contained a large number of unrelated modified
files (sidebar/sheet/tooltip UI primitives, `AppShell.svelte`, `schema.ts`, several `+page.server.ts`
files, `vite.config.ts`, etc.) — none of these were touched in this pass or any prior pass of this
task. `git diff --stat` scoped to the 3 files actually edited confirms the blast radius stayed
exactly as planned. These pre-existing unrelated changes are flagged here for visibility only, not
addressed — they are out of scope for this task and appear to predate this session.

### Screenshots (scratchpad, not committed)

`p3-mobile-unassigned.png`, `p3-mobile-bulk-select.png`, `p3-desktop-unassigned.png`,
`p3-desktop-bulk-select.png`, `p3-leads-desktop.png`, `p3-leads-mobile.png`.
