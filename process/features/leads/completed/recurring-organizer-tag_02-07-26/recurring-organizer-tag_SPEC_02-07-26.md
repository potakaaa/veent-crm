---
name: plan:recurring-organizer-tag-spec
description: Product-discovery SPEC for GitHub issue #94 — tag an organizer as a recurring/future-events prospect on the lead record
date: 02-07-26
feature: leads
---

# SPEC — Recurring Organizer Tag (GitHub #94)

## Summary

Some organizers we talk to aren't a fit for the event we're currently discussing with them — but they clearly run events regularly, so they're worth staying in touch with for the future. Right now there's no way to mark "this organizer isn't right for this deal, but keep them on the radar" — that signal lives only in someone's memory or scattered notes. This feature adds a simple, visible flag — "Has future events" — that a team member can check on a lead, so recurring organizers are never accidentally dropped, and anyone scanning the lead list can immediately see who the long-term prospects are.

## User Stories / Jobs To Be Done

1. **As a sales/outreach rep**, I want to flag an organizer as "likely to run future events" when their current event isn't a fit, so that I don't lose track of a good long-term prospect just because the current deal doesn't work out.

2. **As a rep scanning the leads list**, I want to see at a glance which organizers are flagged as recurring/future prospects, so that I can prioritize re-engaging with them later without re-reading every lead's notes.

3. **As a manager reviewing the pipeline**, I want to filter the leads list down to just the flagged recurring organizers, so that I can build a targeted outreach list for a future campaign.

4. **As a rep viewing a lead's detail page**, I want the flag to be clearly visible on the organizer's record itself, so that anyone opening the lead later immediately understands why we're still tracking them.

## What The User Wants (Behavioral Outcomes)

- A lead/organizer record can be marked with a "Has future events" flag — a simple on/off marker, not a multi-choice tag system.
- The flag is set (checked) or cleared (unchecked) through the same editing screen used for other lead details today — no new special-purpose screen.
- Once set, the flag shows up as a small, distinct badge on:
  - The lead's row/card in the main leads list
  - The lead's detail page header
- The leads list can be filtered to show only flagged organizers (or only unflagged), the same way other list filters work today.
- The flag is independent of pipeline stage — a lead can be "Lost" or "Not a fit" for the current event and still carry the flag, since the point is to track them for a *future* opportunity regardless of the current deal's outcome.
- No email/data is sent anywhere as a result of flagging — this is purely an internal visibility marker for this iteration.

## Flow / State Diagram

```text
                     ┌────────────────────────────┐
                     │   Lead / Organizer record   │
                     │   (any pipeline stage)       │
                     └──────────────┬───────────────┘
                                    │
                     Rep opens lead edit screen
                                    │
                                    v
                     ┌────────────────────────────┐
                     │  Checkbox: "Has future      │
                     │  events" (default: off)     │
                     └──────────────┬───────────────┘
                          check │        │ uncheck
                                v        v
                     ┌─────────────┐  ┌─────────────┐
                     │ Flag = ON   │  │ Flag = OFF  │
                     └──────┬──────┘  └──────┬──────┘
                            │                │
                            v                v
              ┌─────────────────────────────────────────┐
              │  Badge appears/disappears on:             │
              │   - Lead list row/card                    │
              │   - Lead detail page header                │
              └──────────────────┬─────────────────────────┘
                                 │
                    Rep applies "Has future events"
                    filter on /leads list
                                 │
                                 v
              ┌─────────────────────────────────────────┐
              │  List shows only flagged (or unflagged)   │
              │  organizers, same as any other list filter │
              └─────────────────────────────────────────┘
```

## Acceptance Criteria (Testable Outcomes)

1. **A rep can mark a lead as a recurring/future-events organizer from the lead edit screen.**
   The flag persists after save and is reflected immediately when the lead is reopened.
   proven by: lead-edit save/reload scenario (schema + persistence layer)
   strategy: Fully-Automated

2. **A rep can unmark a previously flagged lead**, and the flag disappears from all surfaces (list badge, detail badge) after the change is saved.
   proven by: lead-edit toggle-off scenario
   strategy: Fully-Automated

3. **The flag is visible as a distinct badge on the /leads list** for every flagged lead, visually distinguishable from the existing stage chip and age badge (not confusable with pipeline stage).
   proven by: leads-list rendering scenario (component test)
   strategy: Fully-Automated

4. **The flag is visible as a badge on the lead detail page header** for every flagged lead.
   proven by: lead-detail rendering scenario (component test)
   strategy: Fully-Automated

5. **The /leads list can be filtered to show only flagged organizers**, using the same filter-row mechanism already on that page (mirroring the existing boolean toggle filter).
   proven by: leads-list filter scenario (query + URL param round-trip)
   strategy: Fully-Automated

6. **Flagging or unflagging a lead does not change its pipeline stage, owner, or any other field** — it is a fully independent attribute.
   proven by: lead-edit isolated-field-update scenario (regression check on adjacent fields)
   strategy: Fully-Automated

7. **Flagging or unflagging a lead is recorded in the lead's audit history** (consistent with how other field changes on the lead are tracked today).
   proven by: lead-history audit-row scenario
   strategy: Fully-Automated

8. **The flag can be set regardless of the lead's current pipeline stage**, including "Lost"/closed-lost stages.
   proven by: lead-edit cross-stage scenario
   strategy: Fully-Automated

## Out Of Scope

- **Ingest/export pipelines** — `/api/leads/ingest` and any lead export/reporting endpoints are not modified to read or write this flag in this iteration.
- **Multi-value tagging system** — this is a single boolean flag ("has future events" / not), not a general-purpose tagging or labeling feature. No tag colors, custom tag names, or multiple simultaneous tags.
- **Filters on /pipeline (Kanban) and /unassigned (Up for Grabs)** — the primary filter surface for this iteration is the /leads list. Adding the same filter/badge to /pipeline and /unassigned is a candidate follow-up, not committed here (see Open Questions #2).
- **Inline/on-card toggle editing** — the flag is edited through the existing lead edit screen only, not via a quick-toggle directly on the list card.
- **Automated flagging logic** — nothing in this iteration infers or auto-sets the flag based on organizer history, past events, or scraped data. It is manually set by a team member.
- **Notifications or reminders tied to the flag** — no reminder, email, or task is auto-created when a lead is flagged.

## Constraints

- Must reuse the existing lead edit form/modal pattern already used for similar boolean fields (e.g. the existing "bank charges absorbed" style field) — no new editing UI paradigm.
- Must reuse the existing shared badge UI component already used elsewhere in the app, styled distinctly from the stage/age badges so it reads as a separate signal.
- Must follow the project's soft-delete and audit-trail conventions — flag changes go through the same change-tracking path as other lead field edits.
- Must not alter existing pipeline-stage, ownership, or scoring logic — this is an additive, independent field.
- No new dependency, library, or runtime surface may be introduced to deliver this feature (it is additive to the existing schema/data layer).

## Open Questions

The following are product decisions with a recommended default. None of these block writing this SPEC — they are documented here as explicit assumptions the user can override before or during INNOVATE/PLAN.

1. **Column semantics: required (always true/false) vs. optional (nullable)?**
   Recommended default: the flag is always either "on" or "off" (never blank/unknown) — this keeps the future filter simple ("show flagged" / "show unflagged") without a confusing third "unset" state.
   Owner: user (confirm or override before PLAN)

2. **Which list views need the filter/badge in this iteration?**
   Recommended default: /leads list only for now (it already has a similar boolean filter to mirror). /pipeline (Kanban) and /unassigned (Up for Grabs) are noted as strong follow-up candidates if full parity is wanted sooner.
   Owner: user (confirm scope — one list or three)

3. **Badge label and visual style?**
   Recommended default: a short label such as "Future Events" or "Recurring", visually distinct (different color) from the existing stage and age badges, so it reads as a prospect signal rather than a pipeline-stage or freshness signal.
   Owner: user (confirm wording/branding preference)

4. **How is the flag edited — checkbox in the existing edit form, or an inline toggle on the list/card?**
   Recommended default: a checkbox inside the existing lead edit screen, consistent with how similar boolean fields are edited today. No inline-on-card toggle in this iteration.
   Owner: user (confirm before PLAN)

5. **Does this touch the ingest or export pipeline?**
   Recommended default: no — out of scope for this issue. The flag starts as an internally-set field only.
   Owner: user (confirm out-of-scope decision holds)

## Background / Research Findings

- This is an additive feature: the codebase already has a precedent for a single boolean field on the lead record (a similar "yes/no" attribute already stored alongside other lead fields), including how such a field is added to the data layer, surfaced in the edit form, and persisted with an audit-history entry. This SPEC assumes the same pattern applies here.
- There is currently no multi-value tag or label system on leads — the "Review Queue"/"needs review" flag that once existed was removed recently, and nothing has replaced it. This confirms the ask in issue #94 is for a *new*, single-purpose flag, not an extension of an existing tagging system.
- The closest existing filter precedent is a recent addition of multi-select filters (country/category) to the Up for Grabs queue, plus an existing simple boolean toggle filter already present on the main /leads list. The /leads list's existing boolean-toggle filter is the closest, simplest structural match for "flagged / not flagged" filtering, which is why it's recommended as the primary surface for this iteration.
- The main /leads list already displays a small cluster of badges/chips (pipeline stage + age) on each row/card, giving a natural place to add one more small, visually distinct badge without redesigning the row layout.
- The lead detail page already has a header area used for at-a-glance lead status information, giving a natural place to surface the flag there too.
- Editing of similar boolean fields today happens through the lead edit screen/modal — there is no existing precedent for editing fields via a quick inline toggle directly on a list row for this type of attribute (a different, more complex inline-edit mechanism exists elsewhere for a different purpose, and is not the pattern to reuse here).
- Ingest and export endpoints for leads exist but are intentionally left untouched for this iteration per the issue's scope — the flag is understood as an internally-managed field for now.
