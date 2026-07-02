---
name: plan:sitewide-ux-refresh-phase-01-nav-shell
description: "Site-Wide UX Refresh — Phase 01: Nav & Shell Foundation"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: phase-01
---

# Phase 01 — Nav & Shell Foundation

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ✅ VERIFIED (code-complete, EVL-confirmed 02-07-26; 2 known-gaps recorded — see Phase Loop Progress Step 6/7 and phase report)
**Report destination:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Nav is currently the #1 mobile blocker: `AppSidebar.svelte` hides the entire nav below 880px
(`max-[880px]:hidden`) with no replacement, and there is no design-token vocabulary for the 5-6
repeated "arbitrary" nav-surface hex values (`#1a171c`, `#f5f3f4`, `#a8a1ab`, `#8a828f`, `#6f6873`,
`#26222b`) used across Sidebar/Topbar/Shell. This phase builds the foundation every later phase
depends on: a working mobile nav drawer, the missing nav-surface tokens in `tokens.css`, and a
centralized focus-ring token/utility that shared primitives (button, nav links, form inputs,
calendar cells) will consume in later phases. This phase runs FIRST because Phases 2-4 need the
token names to exist (read-only) before their own responsive/consolidation work, and Phase 5 needs
this phase's shell changes finalized before its token sweep.

---

## Entry Gate

- Locked SPEC exists: `sitewide-ux-refresh_SPEC_02-07-26.md`
- Umbrella plan created with Phase 1 listed first in the sequence
- No prior phase (Phase 1 is first) — entry gate is program kickoff only

---

## Blast Radius

- `src/lib/components/layout/AppShell.svelte`
- `src/lib/components/layout/AppSidebar.svelte`
- `src/lib/components/layout/AppTopbar.svelte`
- `src/lib/styles/tokens.css`

---

## Inner Loop Refresh Note (02-07-26)

Step 1 RESEARCH has now run for this phase. Step 3 PLAN-SUPPLEMENT applied the following changes
based on RESEARCH findings (see diffs below): (1) Step A1's token list expanded from 6 to 12
hex/rgba values (6 additional undocumented values found in `AppSidebar.svelte`), with the decision
to do the full local token migration across AppSidebar/AppTopbar/AppShell in this phase rather than
a partial pass; (2) an explicit note added under Step C confirming bits-ui's Dialog is a 100%
controlled-open pattern repo-wide — the mobile drawer must use local `$state` + `onOpenChange`, not
`Dialog.Trigger`; (3) a note added under Step A on where new nav-surface tokens fit in
`tokens.css`'s `@theme` block. This Refresh Note signals to the next VALIDATE pass that inner R+I
has occurred since the outer-PVL validate-contract (dated 02-07-26) was written — PVL should be
re-run from V1 before EXECUTE proceeds.

---

## Implementation Checklist

### Step A — Nav-surface design tokens

- [x] A1. **Scope expanded at RESEARCH (02-07-26):** Add nav-surface tokens to the `@theme` block
      in `src/lib/styles/tokens.css` for ALL 12 hex/rgba values confirmed across
      AppSidebar/AppTopbar/AppShell — while touching these 3 files anyway, doing the full local
      token migration once is more efficient than a partial pass now plus a return trip in Phase
      5's remaining sweep (which stays scoped to Auth pages + Reports only, unchanged). The 12
      values and their confirmed locations:
      - `#1a171c` — `AppSidebar.svelte:136` (border color) and elsewhere (base bg)
      - `#f5f3f4`, `#a8a1ab`, `#8a828f`, `#6f6873`, `#26222b` — repeated nav-surface values
        (original 6, minus `#1a171c` counted above; confirm remaining exact lines during EXECUTE)
      - `#fca5a0` — `AppSidebar.svelte:69` (active nav text color)
      - `rgba(225,29,42,0.14)` — `AppSidebar.svelte:69` (active nav background)
      - `#e11d2a` — `AppSidebar.svelte:36` (badge default color) and `AppSidebar.svelte:69`
        (active-state inset shadow)
      - `rgba(225,29,42,0.4)` — `AppSidebar.svelte:94` (badge shadow)
      - `#22c55e` — `AppSidebar.svelte:104` and `AppSidebar.svelte:136` (presence dot)
      - `rgba(34,197,94,0.18)` — `AppSidebar.svelte:104` (presence dot shadow ring)
      - `rgba(255,255,255,0.1)` — `AppSidebar.svelte:79` (badge fallback background)
      Name all new tokens semantically (e.g. `--color-nav-bg`, `--color-nav-fg`,
      `--color-nav-muted`, `--color-nav-active-bg`, `--color-nav-active-fg`, `--color-nav-badge`,
      `--color-nav-presence`, etc.), not by literal hex value.
- [x] A1b. **RESEARCH finding (02-07-26):** `tokens.css`'s `@theme` block is a single flat token
      set (lines 15-101), grouped by comment headers. The new nav-surface tokens fit best as their
      own group either (a) right after `/* Surfaces */` or (b) right before the shadcn bridge
      block — both are viable; EXECUTE should pick whichever reads best once the new tokens are
      actually written, not force a decision now.
- [x] A2. Swap the arbitrary-bracket/hex usages in `AppSidebar.svelte` and `AppTopbar.svelte` to
      the new tokens. `AppShell.svelte` only if it directly references these values (verify during
      RESEARCH — do not assume).
      **[VALIDATE V2 confirms]:** read-only file check during this validate pass confirms
      `AppShell.svelte` line 19 DOES contain `bg-[#1a171c]` directly — this is no longer a "maybe,"
      it is a confirmed in-scope edit. RESEARCH should treat it as committed, not conditional.
- [x] A3. Confirm no visual regression via manual review (documented in phase report, since "matches
      the intended look" needs human sign-off per SPEC AC8's Hybrid strategy).

### Step B — Centralized focus-ring token/utility

- [x] B1. Add a focus-ring token/utility to `tokens.css` (e.g. `--focus-ring` color value + a
      `.focus-ring` or `focus-visible:` Tailwind utility class) that meets contrast expectations
      against both light and dark backgrounds (SPEC "What The User Wants" — focus states).
- [x] B2. Apply the focus-ring utility to shared nav primitives in this phase's blast radius: nav
      links and the sign-out button in `AppSidebar.svelte`/`AppTopbar.svelte`. (Broader application
      to ui/button, form inputs, calendar cells is Phase 5's remaining-sweep responsibility — do
      not widen this phase's scope to cover those files.)
- [x] B3. Add `aria-current="page"` to the active nav item (currently missing per research) and
      `aria-label` to the sign-out button (currently only has `title`).

### Step C — Mobile nav drawer

- [x] C1. Confirm the `bits-ui` Dialog primitive's exact API surface for a drawer/sheet pattern
      via `vc-docs-seeker` before writing implementation code (chosen approach per INNOVATE:
      off-canvas drawer via existing `bits-ui` Dialog primitive). **RESEARCH finding (02-07-26):**
      bits-ui's Dialog is confirmed 100% controlled-open pattern repo-wide — zero `Dialog.Trigger`
      usage anywhere in the codebase. The mobile drawer's hamburger button MUST follow the same
      convention (local `$state` boolean bound to `open` + `onOpenChange` callback), NOT
      `Dialog.Trigger` — do not invent a different pattern during EXECUTE.
- [x] C2. Add a hamburger trigger to `AppTopbar.svelte`, visible below the same breakpoint where
      `AppSidebar.svelte` currently vanishes (`880px`).
- [x] C3. Build the mobile nav drawer surface reusing AppSidebar's existing `work[]`/`manager[]`
      nav-item arrays UNCHANGED — no new nav destination logic, just a new rendering surface.
      Include sign-out in the drawer.
- [x] C4. Wire keyboard operability: drawer opens/closes via keyboard (Escape to close, focus
      trapped inside while open, focus returns to trigger on close) — this is bits-ui Dialog's
      default behavior; confirm it during C1's docs check rather than reimplementing.
- [x] C5. Wire drawer auto-close on destination selection (per SPEC flow diagram: "Navigate +
      surface auto-closes").
- [x] C6. Remove or gate the old `max-[880px]:hidden` dead-end behavior on `AppSidebar.svelte` now
      that a replacement exists. **[VALIDATE V2 instruction]:** sequence C6 LAST, only after C2-C5
      are built and verified — this is the single highest-blast-radius edit in the whole program
      (AppSidebar/AppTopbar render on every authenticated route), so there must be no window where
      nav is unreachable at any viewport during EXECUTE. Also explicitly verify the desktop
      (>880px) rendering path is visually unchanged after C6 — the plan does not currently have an
      explicit desktop no-regression check (see Validate Contract Open Gaps).

---

## Exit Gate

```bash
bun run check
# Expected: 0 type errors

bun run test:unit:ci
# Expected: existing suite green, no new failures

bun run test:e2e -- mobile-nav.e2e.ts
# Expected: new mobile-nav e2e scenario green (self-skip guard applies until shared auth fixture
# lands — see Test Infra Improvement Notes)
```

- All checklist items (A1-A3, B1-B3, C1-C6) checked
- Mobile nav trigger visible and functional at 375px viewport (AC1 proven-by scenario passes or is
  a consistently-recorded known-gap per the shared-auth-fixture pattern)
- nav-surface + focus-ring tokens exist in `tokens.css` and are consumed by AppSidebar/AppTopbar
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- `bits-ui` Dialog primitive does not support focus-trap/Escape-close behavior needed for AC1's
  keyboard-accessibility bar (would require a different primitive — escalate to INNOVATE re-run)
- The 5-6 hex values found in research turn out to be more numerous/inconsistent than research
  indicated, requiring a token-naming redesign that widens this phase's scope materially
- Existing e2e/Vitest coverage for AppSidebar/AppTopbar breaks in a way that cannot be fixed
  in-blast-radius

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note if sections changed (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: CONDITIONAL, 02-07-26 (outer-pvl, first pass — 2 concerns, both resolved in-contract via Execute-Agent Instructions; no plan-text supplement needed; accepted as-is)**
- [x] 5. EXECUTE — all checklist items done; per-section test gates run and green (or gaps documented) — **DONE 02-07-26; see phase-01-nav-shell_REPORT_02-07-26.md**
- [x] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written — **DONE 02-07-26 (orchestrator confirmation run, results.tsv iteration 4): `bun run check` PASS, `test:unit:ci` PASS (301/0 fail), AC8 hex grep PASS, `git diff --stat` matches blast radius. 1 gate BLOCKED by env infra (Playwright WebKit install ENOSPC, local disk 99% full) — accepted as known-gap layered on the pre-existing shared-auth-fixture known-gap; no product/test regression.**
- [x] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done — **DONE 02-07-26; see phase-01-nav-shell_REPORT_02-07-26.md. Commit NOT created by this agent — recommended to user, requires explicit instruction.**

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

**Note (outer PVL, this pass):** Step 4 is ticked because this Outer PVL pass produced a complete,
non-placeholder validate-contract (below). Steps 1-3 (RESEARCH/INNOVATE/PLAN-SUPPLEMENT) still run
normally per the inner 7-step loop before EXECUTE — this PVL pass validates the plan artifact as
written, it does not substitute for the inner-loop RESEARCH/INNOVATE steps. If inner RESEARCH later
surfaces material drift, an `## Inner Loop Refresh Note` will trigger PVL re-run per protocol.

---

## Touchpoints

- `src/lib/components/layout/AppShell.svelte` (verify during RESEARCH whether direct token
  references exist here)
- `src/lib/components/layout/AppSidebar.svelte` (token swap, drawer removal of dead-end hidden
  state, aria-current)
- `src/lib/components/layout/AppTopbar.svelte` (hamburger trigger, mobile drawer host, token swap,
  aria-label on sign-out)
- `src/lib/styles/tokens.css` (new nav-surface tokens + focus-ring token/utility — WRITE, other
  phases READ-ONLY)

---

## Public Contracts

- Existing nav item arrays (`work[]`/`manager[]`) in `AppSidebar.svelte` are reused UNCHANGED by
  the mobile drawer — no new destination or routing logic.
- No schema, auth, or API contract changes.
- Token names introduced here (`--color-nav-*`, focus-ring token) become a public contract for
  Phases 2-5 — do not rename or remove them after this phase's exit gate without updating the
  umbrella's Pre-PVL Conflict Resolution section and notifying downstream phases.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Playwright viewport-emulation scenario: load an authenticated route at 375px, confirm nav trigger visible + all destinations + sign-out reachable | Fully-Automated | AC1 |
| axe-core audit against AppSidebar/AppTopbar/mobile drawer for name/role/focus-visible | Fully-Automated | AC4 |
| Grep-based check: no hardcoded hex/arbitrary-bracket values remain in AppSidebar.svelte/AppTopbar.svelte | Hybrid (grep + manual visual review) | AC8 |
| Manual keyboard walk-through: Tab into drawer trigger, Enter to open, Escape to close, focus returns to trigger | Agent-Probe | AC1, AC4 |

```bash
bun run test:e2e -- mobile-nav.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-01-nav-shell_PLAN_02-07-26.md`
- Last completed step: PVL (this outer-PVL validate pass) — RESEARCH/INNOVATE/PLAN-SUPPLEMENT still pending
- Validate-contract status: written (02-07-26) — Gate: CONDITIONAL
- Next step: Spawn vc-research-agent for RESEARCH (Step 1)

---

## Test Infra Improvement Notes

- `@axe-core/playwright` (or equivalent) is NOT currently a dependency of this repo (confirmed via
  `package.json` grep during this validate pass). AC4's axe-core-based gate (this phase, and later
  Phase 3/Phase 5) needs this resolved once, program-wide — see Validate Contract Open Gaps below.
- No existing Vitest unit tests reference `AppShell`/`AppSidebar`/`AppTopbar` — Vitest gate does not
  provide component-level regression coverage for this phase's changes (consistent with
  `all-tests.md`'s guidance that Vitest covers non-UI logic, not Svelte component rendering).

---

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 for this plan's internal V2 fan-out (only S4 "phase-program
classification" present; no multi-package/schema-auth/high-risk/5+-file/3+-direction signals) —
front-end-only, 4-file blast radius, single locked approach. Dimension + section checks were
performed directly by this validate-agent pass (sequential synthesis); no sub-agent spawn tool was
available in this session, which is consistent with the LOW score recommendation anyway. The
5-way outer-PVL fan-out across all 5 phase plans (this agent = the Phase-1 assignment) is the
correct-tier parallel dispatch already performed by the orchestrator.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Mobile nav trigger + drawer reachable at 375px, all destinations + sign-out reachable | Fully-Automated | `bun run test:e2e -- mobile-nav.e2e.ts` (Playwright viewport emulation, new spec) | B |
| AC1, AC4 | Keyboard operability of drawer (Tab/Enter open, Escape close, focus trap + return) | Agent-Probe | Manual keyboard walk-through, documented in phase report | B |
| AC4 | Name/role/focus-visible zero critical/serious violations on AppSidebar/AppTopbar/drawer | Hybrid | axe-core Playwright integration — PRECONDITION: `@axe-core/playwright` (or equivalent) dependency confirmed/added; also gated by shared-auth-fixture | C |
| AC8 | No hardcoded hex/arbitrary-bracket values remain in AppSidebar.svelte/AppTopbar.svelte/AppShell.svelte | Hybrid | `grep -rn "#[0-9a-fA-F]\{3,8\}" src/lib/components/layout/` (checklist A3) + manual visual review | B |
| (regression) | Existing suite unaffected by token/drawer changes | Fully-Automated | `bun run check` && `bun run test:unit:ci` | A |
| (risk mitigation — protects AC1) | Desktop (>880px) layout visually unchanged after C6 removes the `max-[880px]:hidden` dead-end | Agent-Probe | Manual pre/post screenshot compare at ≥880px, documented in phase report (not currently an explicit checklist item — added as execute-agent instruction E3 below) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — it is a named residual row carried via gap-resolution D, never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Nav/Shell mobile drawer: Fully-automated: `bun run test:e2e -- mobile-nav.e2e.ts` | Agent-probe: manual keyboard walk-through | Hybrid: axe-core audit (pending dependency confirmation) | known-gap: e2e self-skip until shared-auth-fixture lands (pre-accepted program-level pattern, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- Token/hex migration: Hybrid: `grep -rn "#[0-9a-fA-F]\{3,8\}" src/lib/components/layout/` + manual visual review
- Regression baseline: Fully-automated: `bun run check` && `bun run test:unit:ci`

Failing stub (Fully-Automated row — AC1):
```
test("should reach all nav destinations and sign out via a mobile nav trigger at 375px viewport", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: mobile nav reachable at 375px viewport")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/runtime surface touched; pure front-end SvelteKit component + CSS token change; all 4 blast-radius files confirmed to exist on disk.
- Test coverage: CONCERN — (1) no existing Vitest coverage of AppShell/AppSidebar/AppTopbar (Vitest is logic-tier only, per repo convention); (2) new e2e self-skips pending shared-auth-fixture (pre-accepted known-gap, not new); (3) `@axe-core/playwright` dependency is NOT present in `package.json` — AC4's Hybrid/Fully-Automated claim needs this resolved before it can run for real.
- Breaking changes: PASS — no schema/auth/API contract change; `work[]`/`manager[]` nav arrays reused unchanged (confirmed in Public Contracts). Elevated regression *risk* (not a contract break) because AppShell/AppSidebar/AppTopbar render on every authenticated route — mitigated by sequencing C6 last and adding an explicit desktop no-regression check (execute-agent instruction E3).
- Security surface: PASS — no auth/secrets/trust-boundary logic touched; sign-out button behavior (`signOut` call) is unchanged, only its accessible name/label changes.
- Section — Implementation Checklist feasibility: CONCERN — mechanical feasibility confirmed (all edit targets grep-verified present, including the previously-conditional `AppShell.svelte:19 bg-[#1a171c]` reference — now confirmed, not hypothetical; `bits-ui` Dialog primitive confirmed installed at `node_modules/bits-ui/dist/bits/dialog`). Gaps found: axe-core dependency undecided; no explicit desktop-viewport regression check in the checklist. Conflicts found: none. Highest-risk edit + mitigation: Step C6 (removing the `max-[880px]:hidden` dead-end) — mitigated by sequencing it last (after C2-C5) and adding an explicit desktop no-regression check.

Open gaps:
- `@axe-core/playwright` (or equivalent) dependency is not present in `package.json`. AC4 also needs this in Phase 3 and Phase 5 — this is a program-level decision, not Phase-1-only. Resolution options: (A) add as a devDependency (~15 min) — dev-only, does not ship to the runtime bundle, arguably does not violate the "no new dependency" hard safety constraint which is aimed at production/runtime surfaces, but needs explicit confirmation since the umbrella states the constraint broadly; (C) accept as known-gap for now and use Agent-Probe (manual axe DevTools browser extension) instead of an automated Hybrid gate; (D) write a backlog note (e.g. `axe-core-devdependency-decision_NOTE_02-07-26.md` in `process/features/ux-enhancement/backlog/`) so Phases 3 and 5 don't re-litigate this independently. **Recommendation to orchestrator: resolve this once at the program level before Phase 1 EXECUTE reaches the axe-core gate, not independently per phase.**
- No explicit desktop (>880px) no-regression check in the current checklist for Step C6. Execute-agent instruction E3 (below) covers this as an instruction rather than requiring a plan-text edit.
- known-gap: e2e self-skip for `mobile-nav.e2e.ts` until the shared Playwright authenticated-session fixture lands — documented as NEW PLAN REQUIRED — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (pre-existing, pre-accepted at umbrella Program Goal Charter level; not a new finding from this validate pass).

Cross-phase consistency findings (per this task's specific ask):
- Phase 1's plan does NOT lock final literal token names (Step A1 gives illustrative examples only:
  "e.g. `--color-nav-bg`, `--color-nav-fg`, `--color-nav-muted`"). Checked all 4 downstream phase
  plans (02, 03, 04, 05) and the registry: NONE of them reference a specific literal token name —
  they all reference the concept generically ("nav-surface tokens", "focus-ring token/utility",
  "focus-ring utility (from Phase 1)"). This is a soft, name-agnostic contract and is internally
  consistent — no mismatch found. Phase 1's own Public Contracts section already commits to the
  naming *convention* (`--color-nav-*` prefix + "focus-ring token") as the public contract, which is
  what downstream phases actually depend on.
- Phase 5 Step D1 explicitly says "Phase 1 only covered nav links + sign-out" for the focus-ring
  utility — this matches Phase 1's own Step B2 scope-limiting note verbatim. No drift.
- No other phase references a Phase-1-owned component/pattern that Phase 1's plan does not commit
  to producing. The only advisory: Phase 1's execute-agent should record the FINAL exact token
  names chosen (not just the illustrative examples) in both the `tokens.css` comments and the phase
  report, since Phases 2-5's own RESEARCH steps will need to discover the real names mechanically
  (grep) rather than assume the illustrative example names from this plan text. See execute-agent
  instruction E4 below.
- `tokens.css` WRITE (Phase 1) vs READ-ONLY (Phases 2-4) vs sweep-completion (Phase 5) classification
  in the registry is consistent with Phase 1's own Blast Radius and Public Contracts sections. No
  conflict.

Execute-agent instructions (from this validate pass, embedded in the contract per
`vc-validate-findings` §Section IV since these are not plan-checklist edits):
- E1: Before starting Step A2, treat `AppShell.svelte`'s `bg-[#1a171c]` reference (line 19,
  confirmed during this validate pass) as an in-scope edit target, not a conditional one.
- E2: Confirm whether `@axe-core/playwright` (or equivalent) is available before relying on the
  axe-core gate in the Verification Evidence table. If not resolved at the program level by the
  time this phase reaches its axe-core check, fall back to Agent-Probe (manual axe DevTools review)
  and record the fallback explicitly in the phase report — do not silently skip the accessibility
  check.
- E3: Add an explicit desktop (≥880px) visual no-regression check immediately after Step C6 (removal
  of `max-[880px]:hidden`) — a before/after screenshot or manual walk-through confirming the desktop
  sidebar renders unchanged. Record the result in the phase report.
- E4: Record the FINAL exact nav-surface token names (not just the illustrative examples from Step
  A1) in `tokens.css` comments and in the phase report's Public Contracts / Resume section, so
  Phases 2-5 can discover them mechanically during their own RESEARCH steps.

Backlog artifacts (recommended, not created by this validate pass — orchestrator/execute-agent to
action; this agent's write access is restricted to this single plan file):
- `axe-core-devdependency-decision_NOTE_02-07-26.md` (recommended path:
  `process/features/ux-enhancement/backlog/`) — tracks the open "add @axe-core/playwright as a
  devDependency?" program-level decision referenced above, so Phase 3 and Phase 5 don't re-litigate
  it independently.

What this coverage does NOT prove:
- The `bun run check` / `bun run test:unit:ci` regression gate proves no type errors and no
  regression in existing logic-level (schema/util) tests — it does NOT prove the mobile drawer or
  token swap render or behave correctly, since no unit test currently touches these Svelte
  components.
- The `mobile-nav.e2e.ts` Fully-Automated gate, if it self-skips (expected, pending the shared
  auth fixture), does NOT prove AC1 end-to-end in CI — only the Agent-Probe manual keyboard
  walk-through provides real evidence until the fixture lands.
- The axe-core Hybrid gate, until the dependency question is resolved, does NOT prove zero
  critical/serious a11y violations automatically — only a manual Agent-Probe review does, in the
  interim.
- The grep-based hex-value check proves the *token migration is textually complete* — it does NOT
  prove the visual result "matches the intended look" (that is the explicit manual-review half of
  AC8's Hybrid strategy, and is out of scope for any automated gate).
- No gate in this contract proves desktop (≥880px) layout is unchanged after Step C6 — this is
  covered only by execute-agent instruction E3 (Agent-Probe), not by an automated gate.

Gate: CONDITIONAL (0 FAILs; 2 CONCERNs — test coverage dimension + section feasibility gaps, both
addressed via execute-agent instructions/open-gap tracking rather than a plan-checklist rewrite;
no high-risk class present; front-end-only blast radius)
Accepted by: session (outer-PVL autonomous pass, ux-enhancement phase program — per umbrella's
"Autonomous Execution Rules (During /goal)": CONDITIONAL net gate proceeds autonomously with fixes
applied in-flight and gaps on record). Concerns accepted: (1) axe-core dependency resolution
deferred to program-level decision before the axe-core gate is actually exercised; (2) desktop
no-regression check added as an execute-agent instruction rather than a plan-checklist rewrite,
since this validate pass is restricted to appending this contract only, not editing the checklist.

---

## Validate Contract (Cycle 2 — Inner Loop Re-Validate)

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — outer-PVL cycle 2 has current evidence (Inner Loop Refresh Note dated 02-07-26, appended after inner Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT ran; note is temporally later than the Cycle 1 contract it documents, even though both share the same calendar date)

**Trigger:** `## Inner Loop Refresh Note` found with a description of changes made after the Cycle 1 contract was written. Per V1 Step 4, this is a `V1 RE-VALIDATE TRIGGERED` case — full V1 structural checks re-run (all passed, see below), followed by V2-V3 re-synthesis (this section), not an early-exit.

### V1 structural re-confirm (all re-run this cycle)

- Plan file exists and is readable: confirmed.
- `vc-scout`-equivalent file-path check — all 4 blast-radius files confirmed present on disk: `src/lib/components/layout/AppShell.svelte`, `AppSidebar.svelte`, `AppTopbar.svelte`, `src/lib/styles/tokens.css`.
- Structural validation: `validate-plan-artifact.mjs` reports 4 FAILs (missing overview/context, Complexity metadata, Phase Completion Rules, Acceptance Criteria) + 3 warnings — these are expected for this plan's shape: it is a phase-program phase-stub (Purpose/Entry Gate/Blast Radius/Implementation Checklist/Exit Gate/Blockers/Phase Loop Progress), not a standalone SIMPLE/COMPLEX plan, so `validate-plan-artifact.mjs`'s standalone-plan schema does not apply cleanly. Cross-checked with `validate-phase-stub.mjs` (the correct validator for this shape): **0 failures, 0 warnings.** No real structural gap.
- Dependency-BLOCKED guard: no `## Phase Ordering` section in this plan (Phase 1 is first in the program — entry gate is program kickoff only); registry shows `Phase 1` status `(no field — not yet started)`, not BLOCKED. N/A, passes vacuously.
- Action-field completion check: umbrella's `## Pre-PVL Conflict Resolution` has no `Action: update Phase [X] blast-radius claim` entries for Phase 1. N/A, passes vacuously.
- Branch/situation: `development` branch, working tree clean for this task folder (only an unrelated pre-existing modification to `process/context/all-context.md` and the untracked new `ux-enhancement/` folder itself — both expected, not touched by this pass).

### Materiality assessment — does 6→12/13 token-count expansion warrant full V2-V7 re-fan-out?

**Verdict: NO — this is a scope-tightening/clarification, not a risk-profile change. A light re-confirm (this section) closes it out. Full multi-agent Layer 1 + Layer 2 re-spawn is not warranted.** Reasoning:

1. **Mechanism unchanged.** All 3 Inner Loop Refresh Note changes are same-mechanism, same-files: (a) more hex/rgba literals extracted to CSS custom properties in the identical 3 files already in blast radius — no new file, no new technique; (b) the bits-ui controlled-open note clarifies HOW an already-chosen INNOVATE approach is implemented — it does not change the approach; (c) the `@theme` placement note is purely informational.
2. **The proving gate is count-agnostic.** AC8's Hybrid strategy is a grep-based check (`grep -rn "#[0-9a-fA-F]{3,8}" src/lib/components/layout/`) that proves "zero hardcoded hex values remain" regardless of whether the true count is 6, 12, or 16 — the gate does not need re-scoping when the count changes, it just needs to run after EXECUTE completes the migration.
3. **Independent re-check found the count is still under-stated, but the finding is additive, not structural.** I independently grepped all 3 blast-radius files. Confirmed present exactly as listed: all values under Step A1 for `AppSidebar.svelte` (lines 36, 69, 70, 78-79, 89, 94, 100, 104, 111, 115/119/123, 128, 136, 141, 145) and `AppTopbar.svelte:5` (`#1a171c`), `AppShell.svelte:19` (`#1a171c`, already flagged Cycle 1). However, three additional literals are NOT in the plan's enumerated list and would still be caught (correctly) by the AC8 grep gate:
   - `AppSidebar.svelte:78` — `color:#fff` (badge fallback text color, in the same template-literal line as the already-listed `item.badgeColor`)
   - `AppTopbar.svelte:9` — `rgba(225,29,42,0.34)` (CTA button shadow) — a distinct alpha value from the already-listed `rgba(225,29,42,0.4)` (AppSidebar badge shadow)
   - `AppShell.svelte:25` — `rgba(225,29,42,0.05)` (background radial-gradient accent)
   Also: the plan's prose says "ALL 12" but the Step A1 bullet list itself enumerates 13 distinct values (bullet 2 alone bundles 5) — a minor internal counting inconsistency, not a blocker.
4. **None of the above requires a naming-scheme redesign** (the "Blockers That Would Justify BLOCKED Status" condition is "requiring a token-naming redesign that widens scope materially" — not triggered; all 3 additional values fit the same red-primary / white-gray token families already being named in Step A1) — so this does not cross into BLOCKED territory.
5. **No Layer 1 dimension finding changes.** Infra fit, Breaking changes, and Security surface reasoning (front-end-only, no schema/auth/API change, `work[]`/`manager[]` reused unchanged) are unaffected by hex-literal count. Test coverage's CONCERN (no Vitest component coverage, axe-core dependency undecided, e2e self-skip pending shared-auth-fixture) is also unaffected by count — it was never about token count.

Given (1)-(5), this cycle's re-validate is a **structural + gap-tracking re-confirm**, not a fresh multi-agent fan-out. Consistent with Cycle 1's own approach (sequential single-agent synthesis — no Agent/Task spawn tool available in this session either), I performed the Layer 1 + Layer 2 re-check directly.

### Net Gate Derivation (Cycle 2)

| Layer 1 dimensions | Status | Change from Cycle 1? |
|---|---|---|
| Infra fit | PASS | unchanged |
| Test coverage | CONCERN | unchanged (same 3 sub-findings: no Vitest component coverage, axe-core dependency undecided, e2e self-skip) |
| Breaking changes | PASS | unchanged |
| Security surface | PASS | unchanged |

| Layer 2 sections | Status | Change from Cycle 1? |
|---|---|---|
| Section — Implementation Checklist feasibility | CONCERN | **updated**: prior 2 gaps (axe-core dependency, no explicit desktop-regression check) carried forward unchanged; **+1 new gap** — token enumeration still undercounts true hex/rgba literal count (13 listed vs ~16 present); addressed via execute-agent instruction E5 below, not a plan-checklist rewrite |

**Totals: 0 FAILs / 2 CONCERNs / 3 PASSes (dimension-level); section-level CONCERN carries one additional sub-finding**

**→ Net Gate: CONDITIONAL** (unchanged from Cycle 1 — same class of living, execute-agent-instruction-mitigated gaps; no new FAIL; no dimension crossed into FAIL)

Test gates: unchanged from Cycle 1 (see original 5-row table above) — AC8's Hybrid gate (`grep -rn "#[0-9a-fA-F]{3,8}" src/lib/components/layout/`) is re-confirmed count-agnostic and remains the correct proving mechanism regardless of the corrected literal count.

Dimension findings: unchanged from Cycle 1 (Infra fit PASS / Test coverage CONCERN / Breaking changes PASS / Security surface PASS) — see full text under Cycle 1's `## Validate Contract` above; not repeated verbatim here to avoid duplication drift.

Open gaps (Cycle 2 — carries forward Cycle 1's 3 gaps unchanged, adds 1 new):
- (carried) `@axe-core/playwright` dependency not present in `package.json` — program-level decision, unresolved.
- (carried) No explicit desktop (>880px) no-regression check in the checklist text — mitigated via execute-agent instruction E3 (Cycle 1).
- (carried) known-gap: `mobile-nav.e2e.ts` self-skip until shared Playwright auth fixture lands — documented as NEW PLAN REQUIRED, see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.
- **(new)** Step A1's token enumeration (13 listed, prose says "12") still undercounts the actual distinct hex/rgba literal count across the 3 blast-radius files — at least 3 more confirmed present (`AppSidebar.svelte:78 color:#fff`, `AppTopbar.svelte:9 rgba(225,29,42,0.34)`, `AppShell.svelte:25 rgba(225,29,42,0.05)`). Not a redesign trigger (same token families), but EXECUTE must not treat Step A1's list as exhaustive. See execute-agent instruction E5.

Execute-agent instructions (Cycle 2 addition — E1-E4 from Cycle 1 remain in force, not repeated):
- E5: Before starting Step A1/A2, run a fresh `grep -rn "#[0-9a-fA-F]\{3,8\}\|rgba(" src/lib/components/layout/AppShell.svelte src/lib/components/layout/AppSidebar.svelte src/lib/components/layout/AppTopbar.svelte` and treat its actual output as the authoritative value list — do NOT rely solely on Step A1's enumerated 12/13 values, which this validate pass confirmed is still short by at least 3 (`#fff`, `rgba(225,29,42,0.34)`, `rgba(225,29,42,0.05)`). Name tokens for every distinct value the fresh grep returns before considering Step A1/A2 complete. The AC8 gate (same grep pattern) will fail post-EXECUTE if any literal is missed, so resolving this at A1 avoids a late EVL-cycle bounce.

Backlog artifacts: unchanged from Cycle 1 (`axe-core-devdependency-decision_NOTE_02-07-26.md`, still not created — orchestrator/execute-agent action item, outside this agent's write scope).

What this coverage does NOT prove (Cycle 2 addition — Cycle 1's 5 items remain in force):
- This re-validate pass proves the Cycle 1 plan-text token count was under-stated by grepping the 3 files directly — it does NOT prove EXECUTE will correctly name/migrate all values (that is Step A1/A2's job, gated by AC8 post-EXECUTE, per instruction E5).

Gate: CONDITIONAL (0 FAILs; 2 CONCERNs carried/updated — test coverage dimension unchanged, section feasibility gains one additive sub-finding; no high-risk class; front-end-only blast radius; no naming-redesign trigger crossed)
Accepted by: session (autonomous, /goal execution — ux-enhancement phase program, per umbrella's "Autonomous Execution Rules (During /goal)": CONDITIONAL net gate proceeds autonomously with fixes applied in-flight and gaps on record). Concerns accepted: (1)-(3) carried forward from Cycle 1 unchanged; (4) new token-undercount finding accepted via execute-agent instruction E5 (fresh grep at EXECUTE time) rather than a plan-checklist rewrite, consistent with this agent's write scope being restricted to appending this contract section only.
