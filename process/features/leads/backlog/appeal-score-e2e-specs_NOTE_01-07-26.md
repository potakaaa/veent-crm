---
name: plan:appeal-score-e2e-specs
description: Backlog stub — add Playwright e2e coverage for Lead Appeal Score badge render + sort ordering
date: 01-07-26
feature: leads
---

# Backlog: Promote Appeal-Score Agent-Probe Gates to Fully-Automated

**Deferred from:** `process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md` (validate-contract AC3/AC4, gap-resolution D)

**Why deferred:** No Playwright e2e specs exist anywhere in the repo yet (`test:e2e` is configured, zero spec files). Writing the first e2e spec is a repo-wide test-infra investment, not a Lead Appeal Score-specific task, so it was kept out of that SIMPLE plan's scope. Both gates were verified via Agent-Probe (data-layer check) and confirmed visually in-browser at EXECUTE/EVL time.

**What to build:**
- `e2e/appeal-score.spec.ts` asserting:
  1. `AppealScoreBadge` renders with correct tier color/text on leads list, lead detail card, unassigned, pipeline, and review views, including the null "Not enough data" state.
  2. `?sort=appeal` produces descending score order with null-score leads pinned to the bottom (pipeline: within each stage column); removing the param restores the prior default order.

**Priority:** Low — functionality is implemented and manually verified; this closes a coverage gap, not a bug.

**Suggested owner path:** Whoever first stands up the repo's Playwright e2e harness (first spec file) should fold this in, since most of the setup cost is shared infra, not this feature.
