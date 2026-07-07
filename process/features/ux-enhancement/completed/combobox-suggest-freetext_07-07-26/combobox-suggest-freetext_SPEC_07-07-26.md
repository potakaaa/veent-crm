---
name: plan:combobox-suggest-freetext-spec
description: "Product-discovery SPEC — suggest-as-you-type + accept-free-text combobox pattern for Meeting Venue and Organizer Name (GitHub #250)"
date: 07-07-26
feature: ux-enhancement
---

# SPEC — Combobox: Suggest + Allow Free-Text (GitHub #250)

## Summary

Right now, whenever an AE types a meeting venue or an organizer name, the field either doesn't
exist yet (venue) or is a plain text box with zero help (organizer). AEs want the best of both
worlds: as they type, the app should show matching options they can click to fill in fast — but
if what they're typing isn't in the list yet, that should be totally fine. No red error, no
"value not found," no forced re-selection. This SPEC locks a shared "suggest but never block"
input pattern and applies it to two fields: a brand-new **Meeting Venue/Location** field (built
here for the first time, free-text only for v1 — no history exists yet to suggest from) and the
existing **Organizer Name** field (already free-text; this adds suggestions on top of it without
changing its free-text behavior).

## User Stories / Jobs To Be Done

1. **As an AE scheduling a meeting**, I want to type or pick a venue/location for the meeting, so
   that the meeting record captures where it's happening (a field that doesn't exist today).
2. **As an AE entering an organizer's name** (lead creation or lead edit), I want to see matching
   organizer names appear as I type, so I can click one instead of retyping a name that's already
   in the system.
3. **As an AE entering an organizer's name that isn't in the system yet**, I want to just keep
   typing and save — with no validation error blocking me — so that adding a brand-new organizer
   is exactly as easy as picking an existing one.
4. **As a future developer extending this pattern to another field**, I want a single shared
   component that already knows how to "suggest but never block," so I don't have to re-solve
   this problem field-by-field.

## What The User Wants (Behavioral Outcomes)

- **Meeting Venue field (new):** A text field appears on the meeting create/edit form (currently
  `MeetingFormModal.svelte`) where the AE can type a venue/location freely. For v1, this is
  free-text only — no suggestions, no dropdown, no autocomplete list (there's no venue history to
  suggest from yet). Whatever the AE types is accepted and saved with the meeting. No "must match
  an existing venue" validation exists.
- **Organizer Name field (existing, enhanced):** As the AE types in the organizer name field
  (lead creation, lead edit modal, lead edit page), a small dropdown of matching existing organizer
  names appears below the field, updating as they keep typing. Clicking a suggestion fills the
  field with that exact name. The AE can also ignore every suggestion and keep typing a name that
  matches nothing — that new name is accepted and saved with no error, no red outline, no blocking
  "please select a valid organizer" message.
- **Shared pattern:** Both suggestion-capable pickers (the enhanced Organizer field here, plus the
  existing Lead/Organizer combobox pickers elsewhere) are expected to use one reusable
  suggest+free-text UI building block going forward, rather than each field re-implementing its
  own version of "type ahead, show suggestions, accept anything."
- Suggestions do not gate save/submit in any way — pressing submit with a typed-but-unmatched value
  in Organizer Name always works exactly like it does today.

## Flow / State Diagram

### Organizer Name field (suggest + free-text)

```
[AE focuses Organizer Name field]
        |
        v
[AE types characters] --(debounce ~300ms)--> [query existing organizer names]
        |                                            |
        |                                            v
        |                                 [matches found?] --No--> [no dropdown shown; field stays plain free-text]
        |                                            |
        |                                           Yes
        |                                            v
        |                                 [dropdown of matches shown below field]
        |
        +--(AE clicks a suggestion)--> [field value = clicked name] --> [dropdown closes]
        |
        +--(AE ignores dropdown, keeps typing/finishes typing a name matching nothing)
        |
        v
[AE submits form] --> [value saved as-is, no "not in list" error, regardless of match state]
```

### Meeting Venue field (free-text only, v1)

```
[AE opens Meeting Form (create or edit)]
        |
        v
[AE types venue/location text] --> [no suggestions, no dropdown]
        |
        v
[AE submits form] --> [venue text saved with the meeting record]
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — Meeting Venue field exists and accepts any free-text value.**
The meeting create/edit form shows a venue/location input. Any text typed there — matching nothing
in particular, since there is no existing list — is accepted and persisted with the meeting record
when the form is submitted. No validation error blocks submission based on venue content.
`proven by:` new Vitest schema test for the venue field on the meeting Zod schema (Fully-Automated
tier) + Playwright e2e for the create/edit modal round-trip (Hybrid — self-skips pending shared
auth fixture, known-gap per `all-tests.md`).
`strategy:` Hybrid

**AC2 — Organizer Name field shows clickable suggestions while typing.**
On all three organizer-name entry points (`leads/new`, `LeadEditModal.svelte`,
`leads/[id]/edit/+page.svelte`), typing into the organizer name field triggers a debounced lookup
against existing organizer names, and matches appear in a clickable dropdown below the field.
`proven by:` Playwright e2e exercising type → dropdown appears → click → field fills (Hybrid —
self-skips pending shared auth fixture, known-gap).
`strategy:` Hybrid

**AC3 — Typing a brand-new organizer name (no match) is accepted without error.**
When the AE types a name with zero matching suggestions and submits the form, the value saves
successfully. No "must select a valid organizer" or similar blocking validation exists on this
field, before or after this change.
`proven by:` Vitest unit test asserting the organizer-name Zod field has no enum/foreign-key-style
constraint (Fully-Automated) + Playwright e2e submitting an unmatched name end-to-end (Hybrid,
known-gap per shared-auth-fixture note).
`strategy:` Hybrid

**AC4 — Selecting a suggestion fills the field with the exact suggested value.**
Clicking any suggestion in the Organizer Name dropdown sets the field's value to that exact
organizer name (not a partial or reformatted version), and the dropdown closes.
`proven by:` Playwright e2e (Hybrid — self-skips pending shared auth fixture, known-gap); component-level
Vitest/Testing-Library assertion on the shared combobox's click-to-fill behavior (Fully-Automated)
covers the same logic without the auth dependency.
`strategy:` Hybrid

**AC5 — The suggest+free-text behavior is implemented as one shared, reusable component.**
Both the Organizer Name suggestion behavior in this SPEC and any future reuse are built on a single
named component (not copy-pasted per field). The component takes free-text input, optionally shows
a suggestion list from a supplied source, and never enforces "must match a suggestion" as a
validation rule.
`proven by:` Vitest component test importing the shared component directly and asserting: (a) it
renders suggestions when given matches, (b) it accepts and forwards free-text values not in the
suggestion list, (c) no validation error state is triggered by an unmatched value (Fully-Automated).
`strategy:` Fully-Automated

**AC6 — Existing organizer combobox pickers (Lead/Organizer id-pickers) are unaffected.**
`LeadCombobox.svelte` and `OrganizerCombobox.svelte` (the id-only pickers used elsewhere, e.g. in
meeting filters) continue to behave exactly as before — this SPEC does not change their
select-an-existing-record-only behavior. They are out of scope for the free-text change.
`proven by:` Existing Vitest/Playwright coverage for those components continuing to pass unchanged
(regression check, Fully-Automated for any existing unit coverage, Hybrid for existing e2e known-gaps).
`strategy:` Hybrid

## Out Of Scope

- **Every other fixed-list `<Select>` field in the app** (category, platform, visibility, currency,
  stage, role, and various filter dropdowns). The GitHub issue explicitly calls these "future
  work" — none of them are touched by this SPEC.
- **Venue suggestions/history in this pass.** The new Venue field is free-text only for v1. Once
  meetings accumulate venue values, a follow-up SPEC can layer suggest-as-you-type onto Venue the
  same way this SPEC does for Organizer Name.
- **#231-style "uniform components" filter-dropdown work.** The completed
  `unified-filter-components_06-07-26` effort covered multi-select filter dropdowns (a different
  interaction pattern — filtering a list view). This SPEC is about single-value data-entry fields
  with suggest+free-text, not filter UI.
- **Changing the existing id-only combobox pickers** (`LeadCombobox.svelte`,
  `OrganizerCombobox.svelte`) to accept free-text. Those remain "must pick an existing record"
  pickers; this SPEC does not touch their contract.
- **Choosing whether to build on the existing `Command`-based recipe vs. adopt `bits-ui`'s native
  `Combobox` primitive.** That is an implementation-approach decision, explicitly deferred to
  INNOVATE.
- **Deciding the exact file location for the new shared component.** A placement recommendation is
  offered below as an Open Question for INNOVATE/PLAN to confirm, not a locked decision here.
- **Backfilling a venue table, venue normalization, or geocoding.** The new field stores a raw
  text value on the meeting record; no new venue entity/table is introduced by this SPEC.

## Constraints

- **Free-text must never be blocked.** Both fields (Venue and Organizer Name) must accept any
  string value with no "must match an existing option" validation, now or after this change —
  this is the core ask driving the issue.
- **No schema-breaking change to Organizer Name.** The field is already free-text at the DB/Zod
  level (`crm_leads` / lead schemas) — this SPEC only adds a suggestion UI layer on top; it must
  not introduce a new constraint on that column.
- **New Venue field needs new schema surface.** Since no meeting-venue field or table exists
  today, this SPEC requires a new column (or equivalent) on the meetings surface to persist the
  value — the exact DB/schema mechanics are a PLAN-phase decision, not decided here.
- **Reuse Svelte 5 runes + server-side DB access conventions** already mandated project-wide (see
  `process/context/all-context.md` §Mandatory conventions) — no client-side DB imports, no
  Superforms (the project's real form idiom is client `safeParse()` + `fetch()`).
- **Debounce parity with existing comboboxes.** The suggestion lookup should follow the same
  300ms-debounce, server-search, latest-wins-race-guard pattern already used by
  `LeadCombobox.svelte`/`OrganizerCombobox.svelte`, so behavior feels consistent across the app.
- **Known test-infra gap applies.** Per `process/context/tests/all-tests.md`, every Playwright e2e
  spec against a protected route currently self-skips (no shared authenticated-session fixture
  yet). Hybrid-tier ACs above inherit this pre-accepted known-gap; they are not blocked by it.

## Open Questions

1. **Where does the new shared combobox component live?** Recommendation: alongside the other
   shared UI primitives from the `unified-filter-components_06-07-26` effort
   (`src/lib/components/ui/`), e.g. a new `src/lib/components/ui/combobox-freetext/` (or similar),
   since this is a cross-cutting UI primitive, not a single-feature concern. This is a placement
   recommendation, not a locked decision — INNOVATE/PLAN should confirm or override it based on
   the chosen build-vs-adopt approach. **Owner: next-phase (INNOVATE).**
2. **Build on existing `Command`+`Popover` recipe vs. adopt `bits-ui`'s native `Combobox`
   primitive?** Both are viable; this is purely an engineering/approach decision with no product-facing
   difference the user would notice. **Owner: next-phase (INNOVATE).**
3. **Where does the new Venue value live on the data model** — a new column directly on the
   meetings table, or something else? No product-facing behavior depends on the answer (the AE
   just sees a text field either way), so this is deferred. **Owner: next-phase (PLAN).**

All three open questions are engineering/implementation decisions with no impact on the locked
user-facing behavior above — none of them block SPEC completion or user sign-off on intent.

## Background / Research Findings

- **Trigger:** AE feedback — dropdowns should suggest matches while typing, be clickable, and
  accept free-text with no "not in list" error.
- **v1 scope, user-decided:** exactly two fields — Meeting Venue/Location (new) and Organizer Name
  (existing, enhanced with suggestions).
- **Meeting Venue does not exist today.** No field in `MeetingFormModal.svelte`; no venue table in
  the DB. Only raw `venue_name/address/city/country/lat/long` columns exist in the scraper TSV
  import schema (`src/lib/zod/schemas.ts:406-411`), never surfaced in any form. This is GitHub's
  MTG-5, which #250 references as if already built — it isn't; this SPEC is the vehicle that
  builds it. User decision: free-text only for v1, no suggestions (no venue history exists yet).
- **Organizer Name is already free-text** at three entry points: `src/routes/leads/new/+page.svelte:206`,
  `src/lib/components/leads/LeadEditModal.svelte:122`, `src/routes/leads/[id]/edit/+page.svelte:150`.
  The ask is to layer suggest-as-you-type onto this already-free-text field without changing its
  free-text acceptance.
- **Existing combobox infra:** `src/lib/components/meetings/LeadCombobox.svelte` and
  `OrganizerCombobox.svelte` — both `Command` (cmdk) + `Popover`, debounced 300ms server search,
  latest-wins race guard — but both are id-only pickers (`value = record.id`); neither has a
  free-text fallback. This is the exact gap #250 fills.
- **`bits-ui` (v2.18.1, already a dependency)** ships an unused `Combobox` primitive — whether to
  extend the existing `Command`-based recipe or adopt it natively is deferred to INNOVATE.
- **No existing plan/issue claims this work.** #231 ("uniform components") was completed as
  `unified-filter-components_06-07-26` and covered multi-select filter dropdowns — a different
  interaction pattern, not single-value suggest+free-text entry.
- **Other fixed-list `<Select>` fields** (category, platform, visibility, currency, stage, role,
  filter dropdowns) are fully inventoried in research and explicitly out of scope per the issue
  text itself ("Any other fixed-list field where free entry makes sense" = future work).
- **Test-infra grounding (from `process/context/tests/all-tests.md`):** Fully-Automated tier =
  Vitest (`bun run test:unit`) for schema/component logic with no live DB or browser session
  needed. Hybrid tier = Playwright e2e (`bun run test:e2e`), which currently self-skips against
  protected routes pending the shared auth fixture (pre-accepted, tracked known-gap). No
  Agent-Probe tier is needed for this SPEC's ACs — everything here is either pure logic
  (schema/component) or a standard e2e user flow, both already covered by the existing two-tier
  split.
