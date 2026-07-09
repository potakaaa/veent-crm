---
name: report:user-colors-render-verification-note
description: Backlog stub for render-dimension verification gaps in GitHub #275 (persistent user colors) — blocked on the two standing repo-wide harness gaps
date: 09-07-26
metadata:
  node_type: memory
  type: report
  feature: team
  phase: backlog
---

# Backlog: Render-dimension verification for GitHub #275 (persistent user colors)

**Status:** Known-Gap, pre-accepted at VALIDATE (resolution D). Not blocking phase completion.

## What is deferred

The following render/visual scenarios from `user-colors-persistent_PLAN_08-07-26.md` (AC1, AC3,
AC4, AC5) have Fully-Automated data/logic proof but no render-dimension proof:

1. Color picker visibility/render in the `/team` edit modal, manager-only gating in the actual DOM.
2. `Avatar.svelte` visually rendering the resolved hex color (vs. the pure `resolveAvatarColor`
   function proof, which only proves the branch logic, not the visual result).
3. Pipeline card accent-bar rendering without colliding with the existing `border-hairline` card
   border (code inspection confirms the implementation uses a distinct absolutely-positioned
   overlay `<span>`, not inline `border-left` — but no visual/DOM snapshot proves this at runtime).
4. Cross-page reflection of a saved color change without a full reload (code inspection confirms
   `invalidateAll()` is called in `saveEditName()`, but no e2e proves the visual result).

## Why deferred

Blocked by two standing, repo-wide, already-documented harness gaps (same root cause class as
calendar, manager-dashboard, and ux-enhancement plans):

- No Svelte component-test harness decision has been made —
  `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`
- No shared Playwright authenticated-session fixture exists —
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

## Resolution path

Once either harness gap is resolved (component-test decision made, or shared auth fixture built),
this stub converts into:
- A Svelte component test rendering `Avatar.svelte` with a stored `color` prop, asserting the
  swatch's inline `background` style matches the prop.
- A Playwright e2e test: manager sees color picker, sets a color, saves, and asserts (a) the
  roster Avatar swatch updates, (b) a rep does not see/cannot interact with the color picker,
  (c) the pipeline accent bar renders with the correct color and the card's hairline border is
  still visible on all four sides.

## Related plan

`process/features/team/active/user-colors-persistent_08-07-26/user-colors-persistent_PLAN_08-07-26.md`
