---
name: plan:leads-new-organizer-hover
description: "SPEC — stop dedup cards on /leads/new from navigating away and losing unsaved form data; replace with hover detail card, plus light visual polish"
date: 01-07-26
feature: leads
---

# SPEC — New Lead form: safe duplicate preview + polish

## Summary

When a rep is filling out the "New lead" form and the app spots a possible duplicate organizer,
it currently shows that duplicate as a clickable row. Clicking it navigates the rep away from
the form entirely — wiping out whatever they had already typed. This SPEC locks a fix: the
duplicate row stops being a link and instead shows a hover card with the organizer's key details,
so the rep can check "is this the same page?" without ever leaving the form or losing their work.
Alongside that fix, the rest of the New Lead page gets a light visual tidy-up (spacing, hierarchy,
feedback states) — no behavior changes there, just cleaner presentation.

## User Stories / Jobs To Be Done

1. **As a sales rep filling out the New Lead form**, I want to check whether a possible-duplicate
   organizer really is the same page/person, so that I can decide whether to keep going or stop —
   without losing everything I've already typed into the form.

2. **As a sales rep**, I want to see the duplicate organizer's key details (who they are, what
   platform, what stage they're at, who owns them, when they were last touched) right where I'm
   looking, so that I don't have to guess or open a new tab to compare.

3. **As a sales rep using the New Lead form regularly**, I want the page to feel clean and easy to
   scan, so filling it out quickly doesn't feel cluttered or confusing.

## What The User Wants (Behavioral Outcomes)

- When the form detects a possible duplicate (by name match against existing leads), the
  duplicate rows shown in the amber advisory banner are **no longer clickable links**. Hovering,
  clicking, or otherwise interacting with a duplicate row never navigates the rep away from the
  New Lead form and never triggers a route change.
- Hovering over a duplicate row reveals a **hover card** (tooltip-style popup) showing that
  organizer's detail: name, platform, handle, stage, email, phone, category/location, event name
  + event date, owner, and last activity. This is read-only — no actions live inside the hover
  card.
- The hover card appears near the hovered row, is legible, and disappears when the mouse leaves
  the row (or a reasonable equivalent for keyboard/touch users — see Open Questions).
- The rep can still submit the form ("Create anyway") even when duplicates are showing, exactly
  as today — this SPEC does not change the submit/create behavior at all.
- The rest of the New Lead page (field grouping, spacing, labels, button states, error message
  presentation) gets a visual pass for polish — no new fields, no new validation rules, no change
  to what data is collected or how the form submits.

## Flow / State Diagram

```
Rep types organizer name
        │
        ▼
 dupes = matches found? ──No──▶ (banner hidden, nothing else changes)
        │Yes
        ▼
 Amber advisory banner shown
        │
        ▼
 Duplicate row rendered (NOT a link anymore)
        │
        ├── Rep hovers row ──▶ Hover card appears
        │                        (name, platform, handle, stage,
        │                         email, phone, category/location,
        │                         event name + date, owner,
        │                         last activity)
        │                        │
        │                        ▼
        │                   Rep moves mouse away ──▶ Hover card closes
        │                        (form state untouched the whole time)
        │
        └── Rep ignores banner, keeps filling form ──▶ clicks "Create anyway" / "Create lead"
                                                              │
                                                              ▼
                                                     Existing submit flow (unchanged)
```

Before/after contrast for the row itself:

```
BEFORE:  <a href="/leads/{id}">  [PlatformBadge] Name  handle  [StageChip]  </a>
         click ──▶ navigates to /leads/{id} ──▶ form data LOST

AFTER:   <div>  [PlatformBadge] Name  handle  [StageChip]  </div>   (no href, not focusable-as-link)
         hover ──▶ hover card with standard detail set shown
         click ──▶ nothing happens, no navigation, form data SAFE
```

## Acceptance Criteria (Testable Outcomes)

1. Duplicate rows in the possible-duplicate banner on `/leads/new` do not navigate the browser
   anywhere when clicked, hovered, or otherwise interacted with.
   proven by: e2e scenario — fill form fields, trigger a duplicate match, click the duplicate row,
   assert URL is still `/leads/new` and the previously-typed field values are still present.
   strategy: Fully-Automated

2. Hovering a duplicate row displays a hover card containing all ten standard-detail-set fields:
   name, platform, handle, stage, email, phone, category/location, event name, event date, owner,
   last activity.
   proven by: e2e scenario — trigger a duplicate match against a seeded lead with known field
   values, hover the row, assert each of the ten fields is present and matches the seeded value.
   strategy: Fully-Automated

3. The hover card closes when the pointer leaves the duplicate row (no lingering popup blocking
   the rest of the form).
   proven by: e2e scenario — hover then move pointer away, assert hover card is no longer visible/attached.
   strategy: Fully-Automated

4. A duplicate organizer with a missing/null field (e.g. no phone, no event date) renders the
   hover card without crashing and shows a clear empty-state per missing field (e.g. em dash or
   "—") rather than "undefined" or a blank gap.
   proven by: e2e or component scenario — seed a duplicate lead with several null fields, hover,
   assert no raw "undefined"/"null" string rendered and no console error.
   strategy: Fully-Automated

5. Submitting the form ("Create anyway" / "Create lead") while duplicates are showing still
   creates the lead and redirects to the new lead's detail page, identical to current behavior.
   proven by: existing/extended e2e create-lead flow — assert POST /api/leads still fires and
   redirect still lands on `/leads/{id}`.
   strategy: Fully-Automated

6. The New Lead page visual polish pass does not change any field's name, type, validation
   behavior, or the request payload sent to `/api/leads`.
   proven by: e2e scenario — submit the form with a full valid payload, assert the same
   `leadFormSchema`-shaped body reaches the API as before the polish pass (schema-level diff, not
   pixel diff).
   strategy: Fully-Automated

7. Keyboard-only users (no mouse) can still access the duplicate organizer's detail information
   in some form — the hover-only interaction does not silently hide this information from
   keyboard/assistive-tech users.
   proven by: manual/agent-probe accessibility pass — tab to the duplicate row, confirm detail is
   reachable (via focus-triggered reveal or equivalent) per the mechanism INNOVATE selects.
   strategy: Agent-Probe
   (Flagged because the concrete keyboard-access mechanism is an INNOVATE-phase design decision —
   see Open Questions #1. This criterion locks the *outcome* — info must not be mouse-only — not
   the mechanism.)

## Out Of Scope

- No migration of this form from manual `fetch()` + `safeParse` to Superforms. (Research flagged
  this as a friction point; user explicitly declined it for this task.)
- No swap to the shared `DedupBanner.svelte` component if one exists/is planned elsewhere in the
  app. This SPEC only touches the inline banner already on `/leads/new`.
- No change to the dedup **matching logic** itself (`hasPotentialDuplicate`) — still name-based,
  still advisory-only, still never blocks submission. No handle-based or fuzzy matching added.
- No new fields added to the New Lead form. No new validation rules.
- No changes to the lead detail page (`/leads/[id]`), the leads list, or any other route — the
  hover card is a self-contained read-only preview, not a navigation shortcut to those pages.
- No changes to `/api/leads` (the create endpoint) or to `crm_lead_history` audit-trail writes.
- Visual polish is cosmetic only — no new interaction patterns beyond the hover card itself, no
  layout restructuring that changes which fields exist or how they're grouped conceptually.

## Constraints

- Must be built with the existing Svelte 5 runes pattern already used on this page (`$state`,
  `$derived`, `$effect`) — no introduction of Svelte 4 stores.
- Must use the project's Tailwind CSS token conventions (`bg-panel`, `text-ink-400`,
  `bg-popover`/`text-popover-foreground`, `rounded-control`, etc.) rather than one-off hex values,
  consistent with the rest of the codebase.
- The ten-field "standard detail set" must be sourced from the same `Lead` data already returned
  by `listLeads()` — no new server query or new database round-trip is required or permitted for
  populating the hover card (the data is already present client-side via `data.leads`).
- Hover-card mechanism must not introduce a new page navigation, route, or modal-style focus trap
  — it is an inline, transient, read-only overlay.
- Must not regress the existing "advisory only, never blocks create" dedup guarantee already
  documented in the page's own subtitle copy and the `dupes` derived-state comment.
- The component/pattern chosen for the hover card is an INNOVATE-phase decision (wrap bits-ui
  `Tooltip` vs. reuse `Popover` with hover-open wiring) — SPEC does not mandate which.

## Open Questions

None. (One implementation-mechanism question — which underlying primitive, `Tooltip` vs.
`Popover`, and how to satisfy keyboard accessibility — is intentionally left for INNOVATE per
Acceptance Criterion 7 and the Constraints section; it does not block SPEC lock because the
user-facing *outcome* is already fully specified here.)

## Background / Research Findings

- `src/routes/leads/new/+page.svelte` (217 lines): Svelte 5 runes; shadcn-style `ui/` primitives
  (Card, Input, Label, Button, Select, Calendar, Dialog). Client-side `leadFormSchema.safeParse`
  followed by manual `fetch('/api/leads', POST)` — not Superforms. Noted as a friction point by
  research but explicitly out of scope for this task per user decision.
- Duplicate detection: `dupes = $derived(name.length > 1 ? hasPotentialDuplicate({ name },
  data.leads) : [])` (line 43). Rendered inside an amber advisory banner (lines 99-117). Each
  duplicate row is currently `<a href="/leads/{d.id}" class="flex items-center gap-2.5
  rounded-[7px] px-2 py-1.5 hover:bg-panel">` containing `PlatformBadge`, name, handle
  (`text-[11px] font-mono text-ink-400`), `StageChip`. Clicking this `<a>` is the exact bug this
  SPEC fixes — it navigates away and destroys the half-filled form.
- The `data.leads` prop is backed by a **real** Drizzle query (`listLeads()` in
  `src/lib/server/db/leads.ts:152-165`), not mock data. The `Lead` type
  (`src/lib/types/index.ts:48-89`) already carries every field needed for the standard detail
  set: name, handle, category, location, platform, stage, ownerId, eventName, eventDate, email,
  phone, lastActivityAt. No new server-side query is needed.
- No existing tooltip/hover-card component exists in this codebase today. A `Popover` primitive
  exists at `src/lib/components/ui/popover/` (bits-ui 2.18) — click-triggered by default
  (`Popover.Root/.Trigger/.Content/.Header/.Title/.Description/.Close/.Portal`), default content
  styling `bg-popover text-popover-foreground rounded-lg p-2.5 shadow-md ring-1`. bits-ui also
  ships a `Tooltip` primitive (hover/focus-triggered natively) that is not yet wrapped anywhere in
  this repo. INNOVATE will decide whether to wrap `Tooltip` or reuse `Popover` with hover-open
  wiring — both are viable; the choice affects keyboard-accessibility mechanics (Tooltip is
  focus-triggered natively, which is why AC7 exists).
- Tailwind conventions: CSS custom-property tokens live in `src/lib/styles/tokens.css`
  (`bg-panel`, `bg-panel-sunken`, `border-hairline`, `text-ink`, `text-ink-400`, `text-stale`,
  `bg-popover`/`text-popover-foreground`, `rounded-control`). This page's existing style idiom
  uses `text-[13px]`, `gap-2.5`, `rounded-[7px]`, `px-2 py-1.5` — the polish pass should stay
  consistent with these, not introduce a new visual language.
- No test coverage exists today for `/leads/new` or the popover component — this is a pre-existing
  test-infrastructure gap, not something this SPEC is responsible for closing beyond the
  acceptance-criteria scenarios listed above.
- User explicitly scoped this task to three things only: (1) stop dupe-card navigation, replace
  with hover detail card; (2) lock the ten-field standard detail set; (3) light cosmetic polish on
  the rest of the page. Superforms migration, `DedupBanner.svelte` reuse, and handle-based
  matching were surfaced by research as adjacent friction points but explicitly declined by the
  user for this task — captured verbatim in Out Of Scope above.
