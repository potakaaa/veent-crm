---
name: plan:sitewide-ux-refresh-spec
description: Product-discovery SPEC for a site-wide UX enhancement pass — mobile/responsive access, accessibility, and design-system consistency across Veent CRM
date: 02-07-26
feature: ux-enhancement
---

# Site-Wide UX Refresh — SPEC

## Summary

Right now, Veent CRM is unusable below an 880px window (the entire navigation sidebar disappears with no replacement), most interactive elements have no keyboard or screen-reader support, and the visual design is inconsistent from page to page even though a proper design system already exists in the codebase. This SPEC covers a site-wide UX enhancement pass to make the app usable on smaller screens, accessible to keyboard and assistive-technology users, and visually consistent — without introducing a new component library or touching schema/auth/API surfaces. This came out of a 6-agent research sweep across every major page; the findings below are organized into 8 themes so the user can see exactly what's broken, how bad it is, and decide what to prioritize before any implementation approach is chosen.

## Assumptions (stated explicitly — override any of these before INNOVATE/PLAN proceeds)

Because the user was unavailable to confirm scope, the orchestrator proceeded with the broadest reasonable reading of "UX enhancement of the whole website." These are assumptions, not decisions — say so if any should change:

- **Goal assumption:** the objective is visual/UX consistency AND mobile/responsive usability, treated as one combined effort (not two separate asks).
- **Scope-priority assumption:** priority order is driven by research-confirmed severity (Themes A/B first — see Acceptance Criteria), not by an externally-given business priority.
- **Constraint assumption:** stay entirely within the current stack — Tailwind CSS 4 + shadcn-svelte primitives + the existing `tokens.css` design tokens. No new component library, no new CSS framework.
- **Planning-depth assumption:** because this spans 6+ independent problem areas across nearly every route in the app, this is flagged as a strong `vc-generate-phase-program` candidate (umbrella plan + one phase per problem area). This SPEC does **not** decide that — INNOVATE/PLAN own the actual planning-depth decision — but the recommendation is on record here so the next phase isn't starting cold.

## User Stories / Jobs To Be Done

- As a sales rep using a phone or a narrow browser window, I want to see and use the navigation menu, so that I can move between Leads, Pipeline, Calendar, and Reminders without being locked out below 880px.
- As a sales rep viewing the Leads list, Up-for-Grabs queue, Pipeline board, or Calendar on a tablet or phone, I want the layout to adapt to my screen width, so that columns and grids don't overflow or get crushed unreadably.
- As a keyboard-only or screen-reader user, I want to change a lead's pipeline stage without a mouse, so that I'm not blocked from a core workflow action that everyone else can do by dragging a card.
- As a keyboard or screen-reader user anywhere in the app, I want visible focus indicators, correct ARIA roles/labels, and announced state changes (e.g. "claimed"), so that I know where I am and what just happened.
- As a user filling out the Lead creation form, the Meeting create/edit modal, or the Team invite modal, I want validation errors to point at the specific field that's wrong, so that I don't have to guess which field a flat error message refers to.
- As a user browsing any page in the app, I want buttons, spacing, colors, and tab/chip patterns to look and behave the same way everywhere, so that the product feels like one coherent app instead of several different ones stitched together.
- As a user viewing a busy calendar day or an empty month/leaderboard, I want a sensible overflow or empty-state message, so that I'm not looking at a broken-looking blank grid or a cut-off list of entries.

## What The User Wants (Behavioral Outcomes)

- Below 880px (and at common phone/tablet widths), the user can still reach every nav destination and sign out — via a mobile-appropriate menu (e.g. hamburger/drawer or bottom bar), not the currently-vanishing sidebar.
- Leads list, Up-for-Grabs queue, Pipeline board, Calendar grid, and Reports heatmap resize or reflow at narrow widths instead of overflowing, crushing columns, or requiring horizontal scroll with no visible affordance.
- Every place a mouse-drag is the only way to perform an action (pipeline stage changes) gets a non-drag alternative (e.g. a menu, button, or dropdown) that is fully keyboard-operable.
- Interactive elements across the app (nav links, action buttons, form fields, tabs, tooltips, calendar cells) carry correct ARIA roles/labels/live-region announcements and a visible focus state that meets contrast expectations against both light and dark backgrounds.
- Lead creation, Meeting create/edit, and Team invite forms show validation errors attached to the specific invalid field (not one flat string), consistent with the rest of the app's Superforms+Zod convention.
- Visual language (spacing scale, color tokens, tab style, chip style, zero-value display, component approach) is unified across Leads/Pipeline/Calendar/Reminders/Reports/Team/Auth pages, drawing from the existing `tokens.css` design tokens and shadcn-svelte kit rather than continuing the current mix of arbitrary bracket values and hand-rolled markup.
- Calendar days with many entries show an overflow affordance ("+N more" or a scrollable list) instead of growing the cell indefinitely; empty months and empty leaderboards show explicit "no data yet" messaging instead of blank/header-only output.
- Duplicated UI logic (LeadGrid vs. Up-for-Grabs grid, the 3x-duplicated date picker, the repeated hover-card dedup pattern) converges on a shared implementation so future changes only happen once.

## Flow / State Diagram

Mobile navigation — current (broken) vs. target state:

```
CURRENT (< 880px):
  [Any authenticated route] --window < 880px--> [Sidebar: display:none]
                                                        |
                                                        v
                                            [NO nav, NO sign-out, dead end]

TARGET (< 880px):
  [Any authenticated route] --window < 880px--> [Collapsed nav trigger visible]
                                                        |
                                              tap/keyboard-activate
                                                        v
                                          [Mobile nav surface: all links + sign-out]
                                                        |
                                              select destination
                                                        v
                                          [Navigate + surface auto-closes]
```

Pipeline stage change — current (mouse-only) vs. target (keyboard-accessible):

```
CURRENT:
  [Pipeline card] --mouse drag only--> [Drop zone] --> [Stage updated]
  (keyboard user: no path forward — dead end)

TARGET:
  [Pipeline card] --mouse drag--------> [Drop zone] --> [Stage updated]
                 --keyboard/AT path---> [Stage-change control (menu/dropdown)]
                                              |
                                        select target stage
                                              v
                                        [Stage updated + same audit trail row]
```

Severity/priority ordering of the 8 research themes (informs, does not dictate, phase order):

```
Theme A (mobile/responsive)   ─┐
Theme B (accessibility)        ├─ HIGHEST severity — cross-cutting, blocks basic access
                                ┘
Theme C (design-system bypass) ─┐
Theme D (duplicated UI)         ├─ consistency / maintainability
Theme E (form validation UX)    ┘
Theme F (loading-state gaps)   ─┐
Theme G (empty/overflow states) ┴─ polish
Theme H (doc drift, dead code) ── OUT OF SCOPE for this effort — separate tiny follow-up
```

## Acceptance Criteria (Testable Outcomes)

1. **Global nav is reachable at every viewport width down to common mobile widths (e.g. 375px).**
   proven by: new e2e scenario — load any authenticated route at a mobile viewport, confirm a nav trigger is visible and all top-level destinations + sign-out are reachable via it.
   strategy: Fully-Automated (Playwright viewport emulation)

2. **Leads list, Up-for-Grabs queue, Pipeline board, and Calendar grid render without horizontal overflow or unreadable column-crush at mobile/tablet widths.**
   proven by: e2e scenario per route — viewport resize + visual/layout assertion (no unintended horizontal scrollbar on the page container; column widths adapt or an intentional, affordanced horizontal scroll region is present).
   strategy: Fully-Automated (Playwright)

3. **Pipeline stage can be changed by keyboard alone (no mouse), and the change is reflected in the same audit trail (`crm_lead_history`) as a drag-based change.**
   proven by: e2e scenario — tab to a pipeline card, activate a non-drag stage-change control via keyboard, assert stage updates and a history row is written.
   strategy: Fully-Automated (Playwright keyboard-only interaction + DB assertion)

4. **Every primary interactive control (nav links, sign-out, claim button, form fields, tabs, calendar day cells) has an accessible name and correct role, and focus is visibly indicated.**
   proven by: automated accessibility audit (axe-core via Playwright) run against each major route, asserting zero critical/serious violations for name/role/focus-visible rules.
   strategy: Fully-Automated (axe-core integration)

5. **State-changing actions that don't cause navigation (e.g. claiming a lead) announce the result to assistive technology.**
   proven by: e2e scenario asserting an `aria-live` region (or equivalent) updates text content after the claim action completes.
   strategy: Fully-Automated (Playwright DOM assertion)

6. **Lead creation, Meeting create/edit, and Team invite forms surface validation errors attached to the specific invalid field, using the existing Superforms + Zod convention (not a flat string).**
   proven by: per-form e2e scenario — submit with one invalid field, assert the error is rendered adjacent to that field with `aria-invalid`/`aria-describedby` wiring, not only as a page-level message.
   strategy: Fully-Automated (Playwright form interaction)

7. **Lead creation form uses `superForm()`/`use:enhance` instead of manual `fetch` + JSON body, matching the repo's stated form convention.**
   proven by: code-level check (no manual fetch-based submit handler remains) + the existing Vitest schema tests continue to pass + new e2e submit-success scenario.
   strategy: Fully-Automated (Vitest + Playwright)

8. **Visual tokens (color, spacing, radius) on Nav/Topbar/Auth pages/Reports use the existing `tokens.css` `@theme` values instead of arbitrary bracket/hex values.**
   proven by: static check — no matches for hardcoded hex colors or arbitrary-bracket spacing/type values in the audited files (grep-based regression check); visual snapshot review for the audited pages.
   strategy: Hybrid (automated grep-based regression check + manual visual review, since "matches the intended look" ultimately needs human sign-off)

9. **Tab and chip visual patterns are unified into one implementation each, used consistently across Leads/Lead-detail and Calendar/Meeting-modal respectively.**
   proven by: code-level check confirming a single shared tab component and a single shared chip component are used at all prior call sites; visual regression review.
   strategy: Hybrid (automated usage check + manual visual review)

10. **Duplicated grid logic (LeadGrid vs. Up-for-Grabs grid) and the 3x-duplicated date-picker pattern converge on shared implementations with no behavior loss.**
    proven by: existing Leads/Up-for-Grabs Vitest+Playwright coverage continues to pass unchanged after the consolidation; a code-level check confirms one shared component is imported at all former call sites.
    strategy: Fully-Automated

11. **Calendar days with many entries show an overflow affordance ("+N more" or scrollable list) instead of unbounded cell growth.**
    proven by: e2e scenario — seed a day with entries exceeding the visible threshold, assert an overflow control renders and reveals the remaining entries on interaction.
    strategy: Fully-Automated (Playwright + DB seed)

12. **Empty states (zero-meeting month, zero-row leaderboard) show explicit "no data yet" messaging instead of blank cells or a header-only table.**
    proven by: e2e scenario against a seeded empty-data scenario for each surface, asserting the empty-state copy renders.
    strategy: Fully-Automated (Playwright + DB seed)

13. **The Reminders-page Snooze button behavior (optimistic pending/rollback vs. plain) is made consistent across Today and Reminders, per an explicit decision recorded in the eventual PLAN (not decided in this SPEC).**
    proven by: e2e scenario asserting the same `LeadListRow` snooze interaction produces the same loading/rollback behavior on both pages.
    strategy: Fully-Automated (Playwright) — contingent on the PLAN phase's explicit decision of which behavior is the target.

## Out Of Scope

- **No new component library or CSS framework.** All work stays within Tailwind CSS 4 + shadcn-svelte + the existing `tokens.css` token set.
- **No schema, auth, or API contract changes.** This is a front-end/UX effort only.
- **No changes to the Reports chart-library migration's scope** (`reports-echarts-review-queue_29-06-26` and `reports-shadcn-chart-migration_30-06-26` active plans already own moving off hand-rolled charts). This SPEC's chart-related findings (leaderboard duplication, hardcoded colors, no legends) are relevant input for those plans — cross-reference them, do not duplicate or absorb their scope here.
- **No duplication of already-tracked leads-area work.** `lead-visibility-scoping`, `leads-new-organizer-hover`, `ufg-country-category-filters`, `ufg-inline-edit-review-removal`, and the `popover-a11y-audit_NOTE_01-07-26.md` backlog note are active/tracked elsewhere — reference, don't re-plan.
- **Theme H (documentation drift, dead code) is explicitly deferred.** The orphaned `StubNote.svelte` component and the stale "mock data" claims in `process/features/reports/_GUIDE.md` and `process/features/pipeline/_GUIDE.md` are real findings but are not a UX change — recommend a separate, small follow-up task (a `vc-generate-context`/`vc-audit-context` pass) rather than bundling into this effort.
- **No re-scoping of the loading-ux plan's intentional exclusions.** The Reminders-page snooze button was deliberately excluded from optimistic behavior in `process/features/loading-ux/active/loading-ux_30-06-26/`; this SPEC flags it as worth an explicit decision (Acceptance Criterion 13) but does not override that plan's existing scope unilaterally.
- **No changes to the calendar/meetings e2e known-gaps.** The 2 pre-accepted known-gaps blocked on a shared authenticated Playwright fixture are out of scope here; this effort may add new e2e scenarios that will face the same fixture blocker and should be recorded as known-gaps consistently, not solved as a side effect.

## Constraints

- Stack constraint: Tailwind CSS 4, shadcn-svelte, Svelte 5 runes, SvelteKit 2, Superforms + Zod — no new dependencies for UI primitives.
- Design tokens: must draw from the existing `src/lib/styles/tokens.css` `@theme` block rather than introducing a second token system.
- Soft-delete and audit-trail conventions (`crm_lead_history` writes on stage/owner/value changes) must be preserved for any non-drag stage-change alternative added for Theme B.
- Existing e2e/known-gap acceptances (calendar/meetings shared-auth-fixture gap) remain in force; new scenarios that hit the same blocker should be recorded the same way, not treated as new failures.
- Must not regress any currently-passing Vitest/Playwright coverage for Leads, Pipeline, Calendar, Reminders, or Reports.
- Cross-reference (do not duplicate) the two active Reports chart-migration plans for any chart-rendering-specific findings.

## Open Questions

None — all scope/goal/constraint/planning-depth questions that would normally block this SPEC were answered by orchestrator-assumed defaults (see "Assumptions" section above) because the user was unavailable. These assumptions are explicitly flagged for user override at the Phase-End Recommendation Gate rather than left as blocking questions.

## Background / Research Findings

Source: a 6-agent parallel read-only RESEARCH sweep across the app (all agents returned DONE or DONE_WITH_CONCERNS), synthesized into 8 themes:

- **Theme A — Mobile/responsive (highest severity):** `AppSidebar.svelte` hides the entire nav below 880px with `max-[880px]:hidden` and no replacement. `LeadGrid.svelte` (7-col) and the Up-for-Grabs grid (9-col) are fixed-width with no breakpoints. Pipeline board is a single-row horizontal-scroll Kanban with fixed `w-[286px]` columns and no scroll affordance; its loading skeleton is misleadingly more responsive than the real board. `CalendarGrid.svelte` has zero responsive classes. Reminders list has exactly one breakpoint (hides a column, doesn't stack rows). Reports heatmap is fixed-pixel-cell with no `overflow-x-auto` wrapper. Lead detail page is the one page that already does this correctly (`lg:grid-cols-[1fr_320px]` → single column), proving the pattern is known internally but inconsistently applied.
- **Theme B — Accessibility (highest severity):** Pipeline stage changes are drag-and-drop ONLY — no button/dropdown alternative, no `tabindex`/`role`/`aria-label`/`onkeydown` on cards or drop zones (hard keyboard blocker). Zero ARIA attributes across AppSidebar/AppTopbar/auth pages except one progressbar. No `aria-current="page"` on active nav item. Sign-out button has only `title`, not `aria-label`. No visible focus-ring styling confirmed on several action-button clusters. Claim button has no `aria-live` announcement. Calendar day cells have no grid/ARIA semantics. Meeting/follow-up type on calendar is color+icon only, no text label. Form validation across 3 forms is a single flat error string, no per-field `aria-invalid`/`aria-describedby`. Heatmap tooltips are mouse-only, not keyboard reachable.
- **Theme C — Design-system bypass:** `tokens.css` has a real Tailwind v4 `@theme` block (colors, radius, shadows, pipeline-stage colors, shadcn bridge), but Nav/Topbar/auth/reports pages heavily use arbitrary bracket values and hardcoded hex instead. No spacing-scale discipline in several surfaces. Reports uses hand-rolled markup with inline styles while Team page uses the full shadcn-svelte kit — same app, two component philosophies. Auth pages form their own internally-consistent but visually disconnected "chrome." Two different tab visual languages (segmented pill vs. bordered tablist) for the same concept. Two different chip systems (calendar entries vs. attendee selector) with no shared token. Zero-value display is inconsistent ("0" vs "—").
- **Theme D — Duplicated UI via copy-paste:** LeadGrid and the Up-for-Grabs grid are near-identical hand-duplicated implementations. The date picker in Lead creation is a ~90-line bespoke pattern duplicated 3 times instead of one shared component. The hover/dupe-detection popover (200ms close-timer) is copy-pasted between two files instead of a shared hook/component. Reports leaderboard renders the same data twice (bar chart + full table directly below) — apparently incidental duplication.
- **Theme E — Form/validation inconsistency:** Lead creation form bypasses the repo's own "Superforms + Zod for all forms" convention — does client `safeParse` then a raw `fetch` POST with manual JSON, single flat error string. Meeting modal and Team invite modal have similarly minimal, non-per-field validation UX despite otherwise correct label/id association.
- **Theme F — Feedback/loading-state asymmetry:** The shared `LeadListRow` snooze button has pending/optimistic-rollback behavior on Today but not on Reminders (same component, different wiring) — a known, deliberate scoping choice from the loading-ux plan, not an oversight, but still worth an explicit consistency decision. Calendar's per-button loading treatment (disabled+spinner+grid dim) is a well-implemented pattern that could serve as the reference standard elsewhere.
- **Theme G — Missing empty/overflow states:** Calendar has no "+N more"/scroll handling for busy days and no empty-month messaging. Reports leaderboard shows a header-only table with no "no data yet" copy when empty.
- **Theme H — Dead code / doc drift (deferred, not part of this SPEC's scope):** `StubNote.svelte` has zero remaining import sites. `process/context/all-context.md` and `process/features/reports/_GUIDE.md` / `process/features/pipeline/_GUIDE.md` still describe Reports/Pipeline as mock-data/not-started, but the code is fully DB-backed — a context-doc staleness bug, flagged here but recommended for a separate tiny follow-up rather than folding into this UX effort.

Explicitly NOT re-flagged as new gaps (already tracked elsewhere, confirmed during research): the `loading-ux` plan (skeleton loaders/pending states/optimistic updates across ~10 routes); the calendar/meetings e2e known-gaps (2 items, blocked on a shared authenticated Playwright fixture); the leads-area in-flight plans (`lead-visibility-scoping`, `leads-new-organizer-hover`, `ufg-country-category-filters`, `ufg-inline-edit-review-removal`) and the `popover-a11y-audit_NOTE_01-07-26.md` backlog note; the two Reports chart-migration plans (`reports-echarts-review-queue_29-06-26`, `reports-shadcn-chart-migration_30-06-26`); and the confirmed-complete Review Queue removal.

Codebase/stack facts used to scope constraints: SvelteKit 2 + Svelte 5 runes, Tailwind CSS 4 + shadcn-svelte + `@tailwindcss/forms`/`typography`, Superforms 2.x + Zod 4.x as the mandated form pattern, Drizzle ORM with soft-delete + audit-trail (`crm_lead_history`) conventions, Vitest + Playwright as the test stack. Note: `all-context.md` currently states Reports "renders mock data" — research confirms this is stale; Reports is fully DB-backed (real Drizzle queries for funnel/leaderboard/outreach/heatmap). This drift is captured under Theme H and flagged for a documentation-refresh follow-up, not folded into this SPEC's scope.
