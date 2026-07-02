---
name: backlog:organizerhovercard-a11y-audit
description: "Manual keyboard/focus a11y audit for OrganizerHoverCard.svelte (dedup-owner hover/popover, leads/new + unassigned)"
date: 02-07-26
feature: leads
---

# OrganizerHoverCard Keyboard/Focus A11y Audit — Backlog Note

**Origin**: `sitewide-ux-refresh` Phase 2 (Leads/UFG Grid Consolidation & Responsiveness),
validate-contract Open Gaps (Cycle 1 and Cycle 2) — flagged twice during VALIDATE, never actually
written until this UPDATE PROCESS closeout.

**Related note**: `process/features/leads/backlog/popover-a11y-audit_NOTE_01-07-26.md` covers a
**different** popover (the Templates popover in `LogTouchForm.svelte`). Confirmed during Phase 2
VALIDATE (C3 check) that there is no overlap — that note does not cover this component. This is a
separate, new backlog item, not a duplicate.

**Priority**: Low — internal rep-facing tool, low-risk, consistent with repo-wide absence of a11y
test tooling (same rationale as the related note above). Not a blocker for any current work.

**Problem**: `src/lib/components/OrganizerHoverCard.svelte` (built by
`leads-new-organizer-hover_01-07-26`, now consolidated as the single hover-card implementation
shared at `leads/new/+page.svelte:205` and `unassigned/+page.svelte:428` via Phase 2's
`createHoverPopover()` hook) has never been tested for keyboard/focus accessibility:

- Tab order into/around the hover-triggering owner name element
- Whether the card is reachable and openable via keyboard alone (not just mouse hover)
- Focus handling while the card is open (dupe-lead list content)
- Closing behavior (Escape, blur) and focus return to the trigger

**Root cause**: No a11y test tooling exists in this repo (same gap noted in
`process/context/tests/all-tests.md` Known Gaps). No automated axe/pa11y integration. Also
tracked at the program level: `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`
(the `@axe-core/playwright` devDependency decision blocks AC4 gates program-wide, including any
future automated audit of this component).

**Fix options**:
- A) Manual audit (~20 min): open `/leads/new` and `/unassigned`, tab to a duplicate-lead owner
  name, confirm the hover/focus-triggered card opens via keyboard (`onfocus`/`onblur` per Phase 2's
  `hover-popover.svelte.ts` implementation), confirm Escape closes it, confirm focus returns cleanly.
- B) Add automated a11y tooling (e.g. `axe-core` + Playwright) — larger scope, would benefit all
  interactive components program-wide, not just this one card. Depends on the axe-core
  devDependency decision above.

**Status**: Open — not yet scheduled. Revisit if a11y compliance becomes a project requirement, if
the axe-core devDependency decision resolves in favor of adding the tool, or if a component-test
harness is built for hover/popover components for other reasons.
