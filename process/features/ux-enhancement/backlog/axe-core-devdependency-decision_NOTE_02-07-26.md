---
name: plan:axe-core-devdependency-decision
description: "Program-level decision needed: add @axe-core/playwright as a devDependency to unblock automated AC4 (accessibility) gates in the ux-enhancement phase program"
date: 02-07-26
feature: ux-enhancement
metadata:
  node_type: memory
  type: backlog
  feature: ux-enhancement
---

# Axe-core devDependency Decision (Program-Level)

## Problem

`@axe-core/playwright` (or an equivalent automated accessibility-audit library) is NOT currently a
dependency of this repo (confirmed via `package.json` grep during Phase 1's VALIDATE pass,
02-07-26). SPEC Acceptance Criterion 4 ("every primary interactive control has an accessible name
and correct role, and focus is visibly indicated") is specified as a Hybrid/Fully-Automated gate
proven by an automated axe-core audit. Without this dependency, AC4 cannot be proven by an
automated gate in ANY phase of the `sitewide-ux-refresh` program — only Agent-Probe (manual axe
DevTools browser review) is available as a fallback.

This affects at minimum:
- **Phase 1 (Nav & Shell Foundation)** — AC4 gate fell back to Agent-Probe (see
  `phase-01-nav-shell_REPORT_02-07-26.md` Test Gate Outcomes + SPEC Achievement — scored **Unmet**
  as a Known-Gap residual per the vacuous-green ban).
- **Phase 3 (Pipeline/Calendar/Reports)** — AC4 gate for pipeline cards, calendar cells, reports
  heatmap.
- **Phase 5 (Token Sweep Completion, Remaining A11y)** — AC4 gate for the remaining ARIA sweep
  across Auth/Reports/Team/Meetings routes.

## Root cause

The dependency was never added because:
1. Adding it mid-EXECUTE for Phase 1 would have been a scope-widening move requiring explicit
   confirmation against the umbrella's "no new dependency" hard safety constraint (the constraint is
   aimed at production/runtime surfaces, and a devDependency arguably doesn't violate it — but this
   needs an explicit program-level decision, not a per-phase unilateral call).
2. Even if added, the axe audit itself is also gated by the shared Playwright authenticated-session
   fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) for any
   authenticated route — so adding the dependency alone would not immediately yield a runnable gate
   for most routes in this program.
3. At the time Phase 1 reached this gate, local disk was at 99% capacity (134Mi free), blocking new
   package installs entirely (environment constraint, not a decision blocker, but compounding).

## Fix options

- **(A) Add `@axe-core/playwright` as a devDependency** (~15 min). Dev-only, does not ship to the
  runtime bundle. Recommended reading: does not violate the "no new dependency" constraint (which
  targets production/runtime surfaces), but flag explicitly since the umbrella states the
  constraint broadly. Still blocked by the shared-auth-fixture gap for authenticated routes until
  that lands separately.
- **(B) Accept as a permanent Known-Gap for this program** and use Agent-Probe (manual axe DevTools
  browser extension review) as the standing AC4 proving strategy for all phases. Downgrades AC4 from
  Hybrid/Fully-Automated to Agent-Probe program-wide — a SPEC-level concession, should be surfaced to
  the user before accepting permanently.
- **(C) Defer the decision** until local disk space is resolved (environment issue, out of scope for
  any agent) and re-visit before Phase 3/5 reach their own AC4 gates.

## Recommendation

Resolve once at the program level (this note) rather than each phase re-litigating it
independently — Phase 3 and Phase 5 should read this note during their own RESEARCH steps before
re-raising the same question.

## Status

Open — no decision made yet. Phase 1 proceeded with Agent-Probe fallback per its validate-contract
Execute-Agent Instruction E2 and recorded AC4 as an Unmet/Known-Gap residual in its SPEC Achievement
scoring. Phases 3 and 5 should reference this note rather than re-opening the question.
