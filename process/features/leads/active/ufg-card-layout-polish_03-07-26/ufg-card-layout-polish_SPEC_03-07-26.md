---
name: plan:ufg-card-layout-polish-spec
description: "Product-discovery SPEC for /unassigned mobile card content priority (#173) and inter-card spacing (#174)"
date: 03-07-26
feature: leads
---

# SPEC — Up for Grabs Mobile Card Layout Polish (GitHub #173 + #174)

## Summary

On phones, the "Up for Grabs" (`/unassigned`) queue currently shows each lead as a tall stack of
fields with no visual separation between one lead and the next, and the fields are shown in an
order that buries the details a rep actually needs (event date, appeal score, category) below
less-useful ones (source, country, former owner) — pushing the Claim/Assign buttons to the very
bottom of a long block. This SPEC covers fixing both problems together: (1) reorder and re-style
the fields inside each mobile card so the decision-relevant information is visible first and
noise is visually quieter, and (2) add a clear visual gap between stacked cards so they read as
separate leads instead of one continuous block. Both changes are mobile-view only and are limited
to the `/unassigned` page.

## User Stories / Jobs To Be Done

- As a rep triaging Up for Grabs on my phone, I want to see a lead's name, event date, appeal
  score, and category right away, so that I can decide whether to claim it without scrolling or
  hunting through less-important details.
- As a rep triaging Up for Grabs on my phone, I want the Claim/Assign actions reachable near the
  top of what I'm reading, so that I don't have to scroll past a full stack of fields just to act
  on a lead I've already decided about.
- As a rep scanning a list of leads on my phone, I want a visible gap between each lead's card,
  so that I can tell at a glance where one lead ends and the next begins, instead of the list
  reading as one unbroken block.
- As a rep, I want source, country, and former-owner information to still be available on the
  card, but visually de-emphasized, so that I can still see them without them competing for
  attention with the fields I check first.

## What The User Wants (Behavioral Outcomes)

- When viewing `/unassigned` on a mobile-width screen, each lead's card shows, in order of visual
  priority from top to bottom: the organizer name, the event name/date, the appeal score, and the
  category — these are the fields a rep uses to decide whether to act.
- Source, country, and former-owner remain visible on the card but are styled less prominently
  (smaller, lighter, or otherwise visually secondary) than the decision-relevant fields above.
- The Claim/Assign/Edit action buttons are positioned so a rep does not have to scroll through the
  full field stack to reach them — they read as an early, reachable part of the card, not a final
  afterthought at the bottom.
- Each lead's mobile card is visually separated from the next by a consistent vertical gap that
  matches the spacing rhythm already used elsewhere in the app (not just a 1px hairline border).
- None of this changes what happens on desktop widths (the existing multi-column grid above the
  `lg` breakpoint is unaffected), and none of this changes the `/leads` page's mobile card
  appearance — only `/unassigned` is affected.
- No data, field values, or actions are added, removed, or behaviorally changed — this is purely
  about what order fields appear in, how prominent they look, and how much space separates cards.

## Flow / State Diagram

```
/unassigned page, mobile width (below `lg` breakpoint)
─────────────────────────────────────────────────────

BEFORE (current):                       AFTER (target):
┌───────────────────────┐               ┌───────────────────────┐
│ [checkbox] Organizer   │               │ [checkbox] Organizer   │  <- primary
│ Event name + date      │               │ Event name + date      │  <- primary
│ Stage chip             │               │ Appeal score           │  <- primary
│ Source badge           │               │ Category               │  <- primary
│ Country                │               │ Stage chip             │
│ Category               │               │ [Edit][Assign][Claim]  │  <- reachable early
│ Former owner           │               │ Source (de-emphasized) │
│ Appeal score           │               │ Country (de-emphasized)│
│ [Edit][Assign][Claim]  │ <- last,      │ Former owner (de-emph) │
│                        │    must       └───────────────────────┘
│                        │    scroll     ↕ visible gap ↕
├───────────────────────┤ <- 1px line   ┌───────────────────────┐
│ [checkbox] Organizer 2 │               │ [checkbox] Organizer 2 │
│ ... (same stack)       │               │ ... (same layout)      │
└───────────────────────┘               └───────────────────────┘

Exact field order and the specific mechanism for de-emphasis / action placement
are "how" decisions -> resolved in INNOVATE, not fixed by this SPEC.

Desktop (`lg` and above): UNCHANGED — existing multi-column grid, no card
stacking, not in scope for either issue.

/leads page (any width): UNCHANGED — not in scope; shares DataGridShell.svelte
with /unassigned but must not be affected by this work.
```

## Acceptance Criteria (Testable Outcomes)

1. **Decision-relevant fields appear first.** On `/unassigned` at mobile width, organizer name,
   event date, appeal score, and category are visually positioned before source, country, and
   former owner within each card.
   `proven by:` manual/Agent-Probe mobile-viewport visual check of `/unassigned` (no automated
   visual-regression or component-snapshot infra exists in this repo per
   `process/context/tests/all-tests.md` §Known Gaps) + a structural grep/code-read gate confirming
   markup order in `src/routes/unassigned/+page.svelte`.
   `strategy:` Agent-Probe (manual visual) + Fully-Automated (structural order check via `bun run check` / grep on the touched file, since there is no snapshot harness to automate the visual claim itself).

2. **Secondary fields are visually de-emphasized.** Source, country, and former owner are styled
   less prominently than the primary fields (e.g. smaller size, lighter weight/color) rather than
   sharing equal visual weight.
   `proven by:` manual/Agent-Probe mobile-viewport visual check of `/unassigned`.
   `strategy:` Agent-Probe.

3. **Actions are reachable without scrolling past the full field stack.** Claim/Assign/Edit
   controls are positioned so a rep does not need to scroll through all secondary fields to reach
   them.
   `proven by:` manual/Agent-Probe mobile-viewport visual check of `/unassigned`; existing e2e spec
   `e2e/unassigned-filters.e2e.ts` (or a new/updated `e2e/*.e2e.ts` spec covering the claim action)
   continues to locate and successfully invoke the Claim button in a real browser render — subject
   to the existing repo-wide caveat that e2e specs on protected routes currently self-skip pending
   the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
   `strategy:` Hybrid (automated e2e when the auth-fixture gap is resolved; Agent-Probe visual scroll check until then).

4. **Visible gap between stacked cards.** On `/unassigned` at mobile width, consecutive lead cards
   have a clear vertical gap between them (not just the existing 1px `border-b`), and that gap
   visually matches the spacing scale already used elsewhere in the app (not an arbitrary one-off
   value).
   `proven by:` manual/Agent-Probe mobile-viewport visual check of `/unassigned`.
   `strategy:` Agent-Probe.

5. **No change to `/leads` page appearance.** The `/leads` page (via `LeadGrid.svelte` and the
   shared `DataGridShell.svelte`) renders with the exact same mobile card spacing and field
   order/style it had before this work — this SPEC's changes are additive/scoped to `/unassigned`
   only.
   `proven by:` manual/Agent-Probe mobile-viewport visual check of `/leads` before/after, plus a
   code-level check (diff review) confirming `DataGridShell.svelte`'s shared default behavior for
   `/leads` is unchanged (or that any shared-file change is provably a no-op for `/leads`
   consumers).
   `strategy:` Fully-Automated (diff/code review of `DataGridShell.svelte` usage in `LeadGrid.svelte`) + Agent-Probe (visual confirm).

6. **No change to desktop layout.** At `lg` breakpoint and above, `/unassigned`'s existing
   multi-column grid layout, column order, and spacing are unchanged.
   `proven by:` manual/Agent-Probe desktop-viewport visual check of `/unassigned`.
   `strategy:` Agent-Probe.

7. **No data/behavior regression.** `bun run check` and `bun run test:unit` remain green after the
   change (existing `canEditLead` unit tests, lead-fetch logic, and any `/unassigned`-related
   Vitest specs are unaffected since this is presentation-only).
   `proven by:` `bun run check`; `bun run test:unit`.
   `strategy:` Fully-Automated.

## Out Of Scope

- Desktop/`lg`-breakpoint grid layout or column order (both issues are mobile-card-view only).
- The `/leads` page and `LeadGrid.svelte` (must remain visually unchanged even though it shares
  `DataGridShell.svelte` with `/unassigned`).
- Any schema, API, auth, or billing surface changes.
- Adding, removing, or changing what data fields exist on a lead card (only order/prominence/
  spacing changes — no new fields, no removed fields).
- Changing the Claim/Assign/Edit action logic itself (only its position within the card).
- Building automated visual-regression or component-snapshot test infrastructure (tracked as a
  pre-existing repo-wide gap, not part of this task).
- Resolving the shared Playwright auth-fixture gap that causes e2e specs to self-skip on protected
  routes (pre-existing backlog item, referenced but not fixed here).

## Constraints

- Mobile-only: changes apply below the `lg` Tailwind breakpoint; desktop grid is untouched.
- `/unassigned`-only: any change must not alter `/leads` page's mobile rendering. If the
  implementation touches the shared `DataGridShell.svelte`, it must do so in a way that is
  provably a no-op for `/leads` (e.g., a new optional prop with a default matching current
  behavior), not a shared-default change — the exact mechanism is an INNOVATE decision, not fixed
  here.
- No schema, auth, API, or billing surfaces are touched. No new dependencies.
- Must build on the field set and action buttons as they exist today post-
  `ufg-inline-edit-review-removal` (verified 03-07-26: current mobile stacking order is checkbox →
  organizer name+popover → event name+date → stage chip → source badge → country → category →
  former owner → appeal score badge → action buttons [Edit, Assign, Claim] — 10 fields total,
  actions last). That report did not change this field order; it only added the Edit affordance
  into the existing (last) actions block.
- No existing semantic "primary vs secondary field" style token exists in the codebase today —
  today's per-field text styling (`text-ink-400`/`text-ink-600`/`text-ink-300`) is ad hoc. Whether
  to introduce a small shared token/class or continue with per-field utility classes is an
  INNOVATE decision.
- Must respect the project's mandatory conventions (Svelte 5 runes, no new client-side DB access,
  Tailwind-only styling) per `process/context/all-context.md`.

## Open Questions

None. The two "how" decisions below are explicitly deferred to INNOVATE, not treated as blocking
open questions for SPEC sign-off:

- Exact new field order/visual hierarchy for the mobile card (INNOVATE decision — this SPEC fixes
  the *outcome* via AC1–AC3, not the specific ordering or styling values).
- Exact mechanism for the `/unassigned`-only inter-card spacing change (page-scoped wrapper vs. an
  optional `DataGridShell.svelte` prop/slot vs. another approach) — INNOVATE must check the
  component's current prop surface (confirmed during SPEC research: `DataGridShell.svelte` today
  exposes no per-consumer spacing prop; `rowClass`, including `gap-1.5 lg:gap-3`, is fully
  internal to the shell and applied identically to every consumer) before choosing.

## Background / Research Findings

- Real files involved: `src/routes/unassigned/+page.svelte` (row/card markup, mobile stacking
  block) and `src/lib/components/leads/DataGridShell.svelte` (shared responsive shell, also used
  by `/leads` via `LeadGrid.svelte`).
- Mobile breakpoint mechanism: `grid-cols-1` below `lg` collapses the 10-column desktop grid into
  one stacked column per lead; the header row (`hidden lg:grid`) is hidden on mobile.
- `DataGridShell.svelte` currently computes `rowClass` internally as a single derived string
  (`grid grid-cols-1 gap-1.5 lg:gap-3 ${cols}`) with no prop or slot for a consumer to override
  gap/spacing independently — confirmed by reading the component's `$props()` destructure (only
  `cols`, `loading`, `isEmpty`, `skeletonCells`, `skeletonRows`, `header`, `rows`, `empty`). Any
  `/unassigned`-only spacing change must therefore either add a new optional prop (defaulting to
  current behavior for `/leads`) or apply a page-level CSS/wrapper override — both are viable, the
  choice is INNOVATE's.
- `gap-1.5 lg:gap-3` is *internal* spacing between the 10 stacked fields inside one card, not
  spacing between different leads' cards. This was tuned once during `sitewide-ux-refresh`
  phase-02-leads-grid, but only for internal field gap — inter-card gap (#174) was never
  addressed and is confirmed as a genuinely open gap.
- Adjacent cards today are separated only by a 1px `border-b border-panel-sunken` on each row div,
  which reads poorly now that each "row" is a multi-line stacked card.
- Current mobile field order (verified directly from `src/routes/unassigned/+page.svelte`, current
  as of 03-07-26, i.e. post `ufg-inline-edit-review-removal`): checkbox → organizer name+popover →
  event name+date → stage chip → source badge → country (plain text) → category (plain text) →
  former owner (plain text) → appeal score badge → action buttons (Edit icon button, Assign icon
  button if `canReassign`, Claim full-width button). Appeal score is field 9 of 10; actions are
  last. No existing primary/secondary field styling token exists — field text uses ad hoc
  `text-ink-400`/`text-ink-600`/`text-ink-300` classes per field.
- Confirmed via reading `ufg-inline-edit-review-removal_REPORT_01-07-26.md`: that prior
  code-complete work added the inline-edit permission logic and the Edit button into the existing
  actions block, and removed the Review Queue/`needs_review` surface — it did NOT reorder or
  restyle the mobile field stack. The field order/priority problem described in issue #173 is
  therefore still present and unaddressed.
- Test infra context (`process/context/tests/all-tests.md`): no component-snapshot or automated
  visual-regression infra exists in this repo; e2e specs on protected routes (including any
  `/unassigned` specs) currently self-skip pending a shared Playwright auth fixture
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is why the
  visually-oriented acceptance criteria above are tagged Agent-Probe/Hybrid rather than
  Fully-Automated — there is no automated way to assert visual field order/prominence/spacing in
  this codebase today, and this SPEC does not build that infra (out of scope).
- Orchestrator-locked scope constraint (not re-litigated here): the spacing fix (#174) must be
  scoped to `/unassigned` only and must not change `/leads`'s mobile spacing, since `/leads` was
  not mentioned in either GitHub issue and a shared-shell-level default change would silently
  alter an unrelated page's visual rhythm.
