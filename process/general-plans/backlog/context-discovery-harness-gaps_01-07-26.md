---
name: backlog:context-discovery-harness-gaps
description: "Pre-existing validate-context-discovery.mjs / discover-context.mjs gaps found during login-redirect-callback UPDATE PROCESS closeout — not caused by that session, not fixed there"
date: 01-07-26
---

# Context Discovery Harness Gaps — Follow-Up

Discovered during the `login-redirect-callback_01-07-26` UPDATE PROCESS closeout (2026-07-01) while
running `validate-context-discovery.mjs` per the mandatory regression-validator step. Not caused by
that session's changes (only `process/context/all-context.md` prose and
`process/features/auth/_GUIDE.md` prose were edited) — pre-existing harness/tooling drift. Address in
a dedicated `vc-audit-vc` / `vc-audit-context` maintenance session.

---

## Item 1: `.agents/skills/*` Symlink Targets Missing (Windows)

**Priority:** Medium

**Problem:** `validate-context-discovery.mjs` reports dozens of `.agents/skills/{skill}/SKILL.md
missing` failures (e.g. `vc-audit-context`, `vc-audit-plans`, `vc-generate-context`,
`vc-generate-plan`, `vc-agent-browser`, `vc-agent-strategy-compare`, and ~25 more). `.agents/skills`
is documented as a symlink to `.claude/skills` for Codex discovery — on this Windows checkout the
symlink either wasn't created or doesn't resolve.

**Root cause:** Likely a Windows-specific symlink creation/permission issue (`.agents/skills` was
probably created as a regular directory or the symlink didn't survive a git checkout/clone on this
platform) rather than a content gap — `.claude/skills/*/SKILL.md` files themselves exist.

**Fix options:**
1. Recreate `.agents/skills` as a proper symlink to `.claude/skills` (may need to run as
   Administrator on Windows, or use `git config core.symlinks true` + re-checkout).
2. If Windows symlinks are unreliable in this environment long-term, consider a junction
   (`mklink /J`) or a small sync script as a fallback, documented in `vc-audit-vc`.

**When to fix:** Next `vc-audit-vc` maintenance pass.

---

## Item 2: ~30 `.claude/skills/*/SKILL.md` Files Missing `name`/`description` Frontmatter

**Priority:** Medium

**Problem:** `validate-context-discovery.mjs` reports missing `name`/`description` frontmatter (or a
`name` mismatch) for roughly 30 skills, including `vc-audit-context`, `vc-audit-plans`,
`vc-generate-context`, `vc-generate-plan`, `vc-agent-browser`, `vc-agent-strategy-compare`,
`vc-audit-vc`, `vc-autopilot`, `vc-autoresearch`, `vc-context-discovery`, `vc-debug`,
`vc-docs-seeker`, `vc-feasibility-test`, `vc-frontend-design`, `vc-generate-closeout`,
`vc-generate-phase-program`, `vc-generate-spec`, `vc-intent-clarify`, `vc-plan-discovery`,
`vc-predict`, `vc-problem-solving`, `vc-publish`, `vc-review-situation`, `vc-risk-evidence-pack`,
`vc-scenario`, `vc-scout`, `vc-security`, `vc-sequential-thinking`, `vc-setup`,
`vc-test-coverage-plan`, `vc-update`, `vc-validate-findings`, `vc-web-testing`.

**Root cause:** Unknown without inspecting each file — likely a batch of skills added or last edited
before the `name`/`description` frontmatter convention was enforced by the validator.

**Fix options:**
1. Batch-add the standard `name: {skill-slug}` / `description: "..."` frontmatter header to each
   flagged `SKILL.md`.
2. Re-run `validate-context-discovery.mjs` after each batch to confirm the count drops to 0.

**When to fix:** Next `vc-audit-vc` maintenance pass — this is a mechanical fix across many files,
best done as its own scoped session rather than folded into an unrelated feature closeout.

---

## Item 3: `discover-context.mjs --emit-routing` Drops Existing Context Groups

**Priority:** Low-Medium (data-loss risk if run carelessly)

**Problem:** Running `node .claude/skills/vc-context-discovery/scripts/discover-context.mjs
--emit-routing` on this repo regenerated the `<!-- GENERATED:routing -->` block in
`process/context/all-context.md` but reported "0 group entrypoint(s)" and wiped the `planning/` and
`tests/` group rows from "Current Context Groups", even though both groups exist with valid
`all-{group}.md` entrypoints. The change was caught and reverted during the `login-redirect-callback`
closeout — not committed.

**Root cause:** The script's group-detection logic does not recognize `process/context/planning/`
and `process/context/tests/` as valid groups — possibly expects a frontmatter field on the
`all-{group}.md` files that they don't currently carry, or a different directory-naming heuristic.

**Fix options:**
1. Inspect `discover-context.mjs`'s group-detection logic and compare against
   `process/context/planning/all-planning.md` / `process/context/tests/all-tests.md` frontmatter to
   find the mismatch.
2. Add whatever frontmatter field the script expects to both group entrypoints, or fix the
   detection heuristic in the script.
3. Re-run `--check-routing` to confirm the staleness warning clears without data loss.

**When to fix:** Before anyone relies on `--emit-routing` again for this repo — flag prominently in
`vc-audit-context` until fixed. `validate-context-discovery.mjs`'s "GENERATED:routing block is stale"
warning can otherwise be safely ignored (hand-maintained block already correct) until this is fixed.
