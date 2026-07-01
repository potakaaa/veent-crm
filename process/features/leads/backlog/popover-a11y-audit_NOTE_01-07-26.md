---
name: backlog:popover-a11y-audit
description: "Manual keyboard/focus a11y audit for the Templates popover in LogTouchForm.svelte"
date: 01-07-26
feature: leads
---

# Popover Keyboard/Focus A11y Audit — Backlog Note

**Origin**: `touch-log-templates` plan (`process/features/leads/completed/touch-log-templates_01-07-26/`),
Known-Gap-1 in the validate-contract.

**Priority**: Low — internal rep-facing tool, low-risk, consistent with repo-wide absence of a11y
test tooling. Not a blocker for any current work.

**Problem**: The Templates popover added to `LogTouchForm.svelte` (bits-ui `Popover` composition)
has never been tested for keyboard/focus accessibility:

- Tab order into the Templates trigger button
- Opening the popover with Enter/Space
- Tab traversal through snippet rows while open
- Closing with Escape
- Focus returning to the trigger button after close

**Root cause**: No a11y test tooling exists in this repo (confirmed via `process/context/tests/all-tests.md`
Known Gaps at plan time). No automated axe/pa11y integration, no component-test harness for
interactive Popover behavior.

**Fix options**:
- A) Manual audit (~30 min): open `/leads/[id]`, tab into the Templates button, open with
  Enter/Space, tab through snippet rows, close with Escape, confirm focus returns to trigger.
- B) Add automated a11y tooling (e.g. `axe-core` + Playwright) — larger scope, would benefit all
  interactive components, not just this one popover.

**Status**: Open — not yet scheduled. Revisit if a11y compliance becomes a project requirement or
if a component-test harness is built for `LogTouchForm.svelte` for other reasons.
