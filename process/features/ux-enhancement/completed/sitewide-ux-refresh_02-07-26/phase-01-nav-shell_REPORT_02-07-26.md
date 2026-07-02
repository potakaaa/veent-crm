---
name: report:sitewide-ux-refresh-phase-01-nav-shell
description: "Site-Wide UX Refresh — Phase 01 (Nav & Shell Foundation) EXECUTE report"
date: 02-07-26
metadata:
  node_type: memory
  type: report
  feature: ux-enhancement
  phase: phase-01
---

# Phase 01 — Nav & Shell Foundation — EXECUTE Report

phase: phase-01-nav-shell
date: 2026-07-02
status: COMPLETE_WITH_GAPS
feature: ux-enhancement
plan: process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_PLAN_02-07-26.md

## TL;DR

Mobile nav drawer, nav-surface tokens, and a shared focus-ring token/utility are implemented across
the 4 blast-radius files. All automated gates green: `bun run check` = 0 errors, `bun run
test:unit:ci` = 301 passed / 0 failures (no regression), AC8 hex grep = zero color literals. The new
`mobile-nav.e2e.ts` compiles/serves and self-skips on the auth gate — the pre-accepted program-level
known-gap. Two carried gaps remain (axe-core devDependency decision; e2e shared-auth-fixture), both
pre-accepted. One within-blast-radius implementation-detail deviation (drawer state lifted to
AppShell, drawer rendered inside AppSidebar) — documented below.

## Final Chosen Token Names (E4 — downstream Phases 2-5 discover these mechanically)

Added to `src/lib/styles/tokens.css` `@theme` (colors, after `/* Surfaces */`) + Elevation (shadows)
+ a `@layer components` utility. These are the public contract for Phases 2-5:

Colors (Tailwind utilities: `bg-*`, `text-*`, `border-*`):
- `--color-nav-bg` (#1a171c) — sidebar/topbar/shell base bg + presence-dot border
- `--color-nav-fg` (#f5f3f4) — sidebar default text
- `--color-nav-muted` (#a8a1ab) — inactive nav-link text + badge-fallback text
- `--color-nav-faint` (#8a828f) — footer role text + sign-out icon
- `--color-nav-section` (#6f6873) — nav section-label text
- `--color-nav-border` (#26222b) — footer top hairline
- `--color-nav-active-bg` (rgba(225,29,42,0.14)) — active nav-link background
- `--color-nav-active-fg` (#fca5a0) — active nav-link text
- `--color-nav-badge` (#e11d2a) — default badge background (== primary); used via `var()` in JS
- `--color-nav-badge-fallback` (rgba(255,255,255,0.1)) — badge bg when no colour; used via `var()`
- `--color-nav-presence` (#22c55e) — online presence dot
- `--color-nav-glow` (rgba(225,29,42,0.05)) — shell main radial-gradient accent; used via `var()`

Focus ring:
- `--color-focus-ring` (#e11d2a) — consumed by the `.focus-ring` utility class
- `.focus-ring` — `@layer components` utility: `outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px` on `:focus-visible` (keyboard-only; readable on dark nav + light canvas)

Shadows (Tailwind utilities: `shadow-*`):
- `--shadow-nav-active` (inset 3px 0 0 #e11d2a) — active nav-link left accent
- `--shadow-nav-brand` (0 4px 12px rgba(225,29,42,0.4)) — sidebar brand tile
- `--shadow-nav-cta` (0 4px 12px rgba(225,29,42,0.34)) — topbar "New lead" CTA
- `--shadow-nav-presence` (0 0 0 3px rgba(34,197,94,0.18)) — brand presence-dot ring

Note: hex/rgba literals live ONLY in `tokens.css` (allowed — AC8 grep scopes to
`src/lib/components/layout/`). Every literal value is preserved identically to its prior hardcoded
form, so the token swap is visually a no-op (A3).

## What Was Done

Files changed (all within the 4-file blast radius + 1 new mandated test artifact):
- `src/lib/styles/tokens.css` — added nav-surface color group, focus-ring token, nav shadow group,
  `.focus-ring` component utility.
- `src/lib/components/layout/AppShell.svelte` — `bg-[#1a171c]` → `bg-nav-bg`; radial-gradient
  `rgba(...)` → `var(--color-nav-glow)`; lifted `mobileNavOpen` `$state`; wired `bind:mobileOpen` to
  AppSidebar and `onMenuClick` to AppTopbar.
- `src/lib/components/layout/AppTopbar.svelte` — token swaps (`bg-nav-bg`, `shadow-nav-cta`); added
  `onMenuClick` prop; added viewport-gated hamburger (`hidden max-[880px]:inline-flex`, inline SVG,
  `aria-label="Open navigation menu"`, `.focus-ring`); `.focus-ring` on the CTA.
- `src/lib/components/layout/AppSidebar.svelte` — full token migration; `navButton` snippet gains
  `onNavigate` + `aria-current="page"` + `.focus-ring`; extracted shared `railBody` snippet reused
  by both the desktop `<aside>` and the drawer; `badgeColor` literal → `var(--color-nav-badge)`;
  sign-out gains `aria-label="Sign out"` + `.focus-ring`; added the bits-ui Dialog mobile drawer
  (controlled `bind:open`, sr-only Title/Description, Close button, `slide-in-from-left`).
- `e2e/mobile-nav.e2e.ts` (NEW) — AC1 Fully-Automated gate; 2 scenarios (375px reachability +
  Escape/focus-return; destination-select auto-close), self-skip guard mirroring `calendar.e2e.ts`.

Per-checklist:
- A1/A1b/A2/A3: DONE. E5 fresh grep run — found and tokenized 3 literals beyond the plan's list
  (`#fff` badge text → `var(--color-primary-foreground)`; `rgba(225,29,42,0.34)` CTA shadow;
  `rgba(225,29,42,0.05)` shell glow). E1 honored (AppShell:19 treated as in-scope). A3: token values
  identical to prior literals ⇒ zero visual change by construction.
- B1/B2/B3: DONE. focus-ring token + `.focus-ring` utility; applied to nav links, sign-out,
  hamburger, drawer close, CTA; `aria-current="page"` on active nav; `aria-label` on sign-out.
- C1–C6: DONE. C1: bits-ui Dialog API confirmed via the repo's own `ui/dialog` wrapper +
  `shared/Modal.svelte` controlled-open usage (installed bits-ui ^2.18.1 — stronger evidence than
  external docs; zero `Dialog.Trigger` in-repo confirmed). C6: `max-[880px]:hidden` retained on the
  desktop `<aside>` as an intentional gate (no longer a dead-end — the drawer is the <880px
  replacement), sequenced last; desktop ≥880px markup/classes unchanged.

## What Was Skipped or Deferred

- `@axe-core/playwright` devDependency NOT added. Per contract instruction E2, fell back to
  Agent-Probe for AC4 and recorded it (see Test Gate Outcomes). Adding it now yields no runnable gate
  this phase (the axe audit also needs an authed route, blocked by the shared-auth-fixture gap) and
  the boot-disk is out of space for new installs. Program-level decision remains open — backlog note
  `axe-core-devdependency-decision_NOTE_02-07-26.md` still recommended (not created; outside a clean
  execute scope — orchestrator/update-process action).

## Test Gate Outcomes

| Gate | Tier | Result |
|---|---|---|
| `bun run check` | Fully-Automated | PASS — 0 errors, 1 pre-existing warning in `leads/[id]/+page.svelte` (outside blast radius) |
| `bun run test:unit:ci` | Fully-Automated | PASS — 301 passed / 89 skipped / 0 failures (no regression) |
| `grep -rn "#[0-9a-fA-F]{3,8}" src/lib/components/layout/` (AC8) | Hybrid | PASS — zero color literals; only 2 `{#each` (`#eac`) regex false-positives, present in the original file too |
| `bun run test:e2e -- mobile-nav.e2e.ts` (AC1) | Fully-Automated | SELF-SKIP (2 skipped) — auth gate; pre-accepted program-level known-gap. Build compiled + preview served on chromium; spec parses/lists 2 tests |
| Keyboard operability (Tab/Enter open, Escape close, focus trap+return) (AC1/AC4) | Agent-Probe | PASS by design — bits-ui Dialog defaults; asserted in the (self-skipping) e2e spec |
| axe-core name/role/focus-visible (AC4) | Agent-Probe (E2 fallback) | Addressed by inspection — `aria-current`, `aria-label` (sign-out, hamburger, close), sr-only Dialog Title/Description, `.focus-ring`, semantic `role=dialog`/`button`. Automated axe deferred (dependency + auth-fixture) |
| Desktop ≥880px no-regression after C6 (E3) | Agent-Probe | PASS by inspection — `<aside>` structure/classes unchanged; token values identical; hamburger `hidden` at ≥880px; drawer closed (portal empty) |

Note on e2e environment: `bun run test:e2e` (which runs `playwright install` first) failed with
`ENOSPC` downloading WebKit to the boot-disk cache. Ran the spec directly on the already-installed
chromium (project disk has 548Gi free) to confirm it builds, serves, and self-skips correctly.
Classification: harness/environment gap (boot-disk space + missing WebKit binary), not
product/test breakage.

## Plan Deviations

1. **Within-blast-radius (implementation detail): drawer state lifted to AppShell; drawer rendered
   inside AppSidebar.** The plan's C2/C3 place the hamburger in AppTopbar and "build the drawer"
   (unattributed file). To satisfy C3's "reuse `work[]`/`manager[]` arrays UNCHANGED — no new
   destination logic" without extracting a new shared nav-items module (which would add a file
   outside the 4-file blast radius), I kept the arrays as the single source in AppSidebar, rendered
   the drawer there via a shared `railBody` snippet, and shared open-state via `bind:mobileOpen`
   lifted to AppShell (hamburger in AppTopbar toggles it). All edits stay within the 3 claimed layout
   files + tokens.css. No hard-stop class touched. Rationale: DRY-faithful reading of C3.
2. **New file `e2e/mobile-nav.e2e.ts`.** Not a blast-radius source file but the explicit AC1 gate
   deliverable mandated by the Verification Evidence table / Exit Gate — expected, not scope creep.

No hard-stop-class deviations (no schema/auth/API/container/secret changes).

## Test Infra Gaps Found

- Shared Playwright authenticated-session fixture still absent — `mobile-nav.e2e.ts` self-skips
  against protected routes (same pre-accepted pattern as calendar/loading-ux). Real AC1 CI coverage
  lands when `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` is resolved.
- `@axe-core/playwright` not present — AC4 automated Hybrid gate cannot run program-wide until added
  (open program-level decision; also needed by Phases 3 + 5).
- Boot-disk `ENOSPC` prevents `playwright install` from fetching WebKit; chromium/firefox already
  cached. Environment issue, not repo.

## SPEC Achievement

Scoring against `sitewide-ux-refresh_SPEC_02-07-26.md` acceptance criteria this phase's Verification
Evidence table claims (AC1, AC4, AC8). Per the vacuous-green ban: an Agent-Probe-only or self-skipped
gate is a Known-Gap residual, never a basis for "met."

| AC | Behavior | Gate tier | Gate result | Met? |
|---|---|---|---|---|
| AC1 | Global nav reachable at 375px via mobile trigger | Fully-Automated (e2e) | SELF-SKIP (auth-fixture known-gap) — not exercised in CI; Agent-Probe (manual keyboard walk-through, by inspection) supports it but is not a passing automated/E2E gate | **Unmet** (Known-Gap residual) |
| AC4 | Name/role/focus-visible zero critical/serious violations | Hybrid (axe-core) | Automated axe-core NOT run (`@axe-core/playwright` not installed) — fell back to Agent-Probe (inspection only) per contract instruction E2 | **Unmet** (Known-Gap residual) |
| AC8 | No hardcoded hex/arbitrary-bracket values in AppSidebar/AppTopbar/AppShell | Hybrid (grep + manual review) | Automated grep PASSED (zero literals, independently re-confirmed at EVL); visual-match half satisfied by construction (token values identical to prior literals, documented in Final Chosen Token Names) | **Met** |

Unmet criteria → backlog notes:
- AC1: pre-existing `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (shared
  Playwright authenticated-session fixture) — this is the SAME pre-accepted program-level pattern;
  no new backlog note needed, this phase's self-skip is recorded evidence against that existing note.
- AC4: `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`
  (new, written this UPDATE PROCESS session — see below) — tracks the `@axe-core/playwright`
  devDependency decision blocking AC4's automated gate for this phase and Phases 3/5.

## Closeout Packet

- Selected plan: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_PLAN_02-07-26.md`
- Finished: all checklist items A1-A3, B1-B3, C1-C6; Phase Loop Progress Step 5 (EXECUTE) ticked.
- Verified: `bun run check` (0 err), `bun run test:unit:ci` (0 fail), AC8 grep (clean), e2e
  builds/serves/self-skips. Agent-Probe gates (keyboard, axe, desktop no-regression) verified by
  inspection/spec, not by live manual browser session.
- Unverified/pending: live manual keyboard + axe DevTools walk-through against an authed session;
  automated AC1 e2e (both blocked by the shared-auth-fixture known-gap).
- Classification: **Keep in active/testing** — code-complete, all automated gates green; EVL
  confirmation run (orchestrator vc-tester) and the manual Agent-Probe reviews are the remaining
  work before archival.
- Best next state: orchestrator runs EVL (re-run `bun run check` / `test:unit:ci` / AC8 grep /
  mobile-nav e2e), then commit Phase 1 execution changes, then UPDATE PROCESS.

## Forward Preview

### Test Infra Found
- No Vitest component coverage for AppShell/AppSidebar/AppTopbar (logic-tier runner only) — Phases
  2-5 touching these get no unit-level regression net; rely on `bun run check` + e2e.
- e2e self-skip pattern is the standard; every new authed-route e2e in this program inherits it.

### Blast Radius Changes
- `tokens.css` now owns the `--color-nav-*`, `--color-focus-ring`, `--shadow-nav-*` tokens and the
  `.focus-ring` utility — Phases 2-5 READ these (never redefine). Discover via
  `grep -n "nav-\|focus-ring" src/lib/styles/tokens.css`.
- The 3 layout files are now literal-free (token-only). Phase 5's remaining token sweep excludes
  them.

### Commands to Stay Green
- `bun run check`
- `bun run test:unit:ci`
- `grep -rn "#[0-9a-fA-F]\{3,8\}" src/lib/components/layout/` (expect only `{#each` false positives)
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bunx playwright test e2e/mobile-nav.e2e.ts` (chromium already
  installed; avoids the WebKit ENOSPC)

### Dependency Changes
- None added. `@axe-core/playwright` decision deferred (open program-level item).

## Follow-up Stubs / CONTEXT_PARTIAL
- No follow-up plan stubs created this phase.
- Recommended (orchestrator/update-process action, not created here):
  `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`.
- No CONTEXT_PARTIAL items — all required context loaded.
