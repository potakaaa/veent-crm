---
name: plan:nested-worktree-playwright-env-blocker
description: "Playwright e2e cannot run from the main tree — nested sibling worktree module duplication + disk-space exhaustion, distinct from the pre-accepted shared-auth-fixture known-gap"
date: 02-07-26
feature: ux-enhancement
metadata:
  node_type: memory
  type: backlog
  feature: ux-enhancement
---

# Nested-Worktree Playwright Module Duplication + ENOSPC — Test Infra Gap

**Origin**: Recurred across `sitewide-ux-refresh` Phase 1, Phase 2, Phase 3, and Phase 4 execution
and EVL passes (see each phase's report / `results.tsv`). Flagged in Phase 2's closeout as a
distinct, non-blocking Test Infra Gap that deserves its own backlog entry rather than being folded
into the existing shared-auth-fixture known-gap.

**Priority**: Medium — it silently blocks the actual EVL confirmation of every new/regression e2e
scenario this program adds (Leads/UFG responsive check, inline-edit/filter regression specs,
pipeline/calendar specs, forms specs), independent of whether the shared Playwright auth fixture
ever lands. Until fixed, "e2e self-skip" and "e2e couldn't even load" are being conflated in phase
reports — they are different failure modes and should not both be waved through as the same
pre-accepted gap.

**Problem**:
1. **Nested-worktree module duplication**: a sibling worktree at
   `.claude/worktrees/feat+lead-appeal-score/node_modules/playwright` causes Playwright's config
   loader to throw `"Requiring @playwright/test second time"` when `bun run test:e2e` is invoked
   from the main tree. This affects ALL e2e specs equally — it is not specific to any one phase's
   code changes.
2. **ENOSPC (disk space exhaustion)**: local disk has repeatedly been reported near 99% capacity
   during this program's execution, blocking `playwright install` and intermittently blocking shell
   output entirely. Disk usage has fluctuated (Phase 2's follow-up pass noted it cleared to ~42%
   used at one point), but the worktree module-duplication issue persists independent of disk space.

**Root cause**: Claude Code worktree scaffolding (`.claude/worktrees/`) creates full sibling
`node_modules` installs, and Playwright's single-global-require assumption breaks when more than
one copy of `@playwright/test` is resolvable from the process's module graph. This is an
environment/tooling issue, not a defect in any phase's shipped code.

**Impact on this program's SPEC Achievement scoring**: Any AC whose `proven by:` clause requires a
Playwright e2e run (AC1-AC3, AC5-AC7, AC10-AC13) cannot be scored as fully "met" by Fully-Automated
evidence while this blocker is active — even where the pre-accepted shared-auth-fixture self-skip
would otherwise be the only caveat. Phase reports should distinguish "self-skipped due to missing
auth fixture" (pre-accepted, documented in
`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) from "could not run at all due
to this env blocker" (this note) — they are not the same known-gap.

**Fix options**:
- A) Run e2e verification from a clean checkout/tree with no sibling `.claude/worktrees/*` present
  (side-steps the module-duplication issue without code changes).
- B) Configure Playwright (or the worktree scaffolding) to isolate `node_modules` per worktree more
  strictly, or exclude worktree directories from Playwright's module resolution / `testDir` scan.
- C) Free disk space proactively before each e2e run (short-term mitigation for the ENOSPC half of
  this problem only — does not fix the module-duplication half).

**Status**: Open — not yet scheduled. Should be resolved before any phase in this program (or a
future program) claims a Playwright-gated AC as "met" purely on the strength of a self-skip; until
fixed, e2e-gated ACs in this program remain Known-Gap/Unmet for scoring purposes, not silently
treated as passing.
