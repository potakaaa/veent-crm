---
name: plan:organizer-listing-detail-spec
description: "Product-discovery SPEC for organizer listing page + nav tab (#189) and organizer detail page with linked leads/event history (#190)"
date: 06-07-26
feature: organizers
---

# SPEC — Organizer Listing & Organizer Detail (GitHub #189, #190)

## Summary

Right now, organizers (the Instagram/Facebook pages we run outreach against) have no dedicated place to view in the CRM — they only exist as a hidden link on individual leads. This work gives the team a proper **Organizers** section: a list of every organizer with how many leads are linked to them, and a detail page per organizer showing every lead (past and present) that has ever targeted that organizer's page, laid out as an event history (event name, date, stage, owner). From the detail page, the team can also jump straight into creating a new lead for that organizer without re-typing which organizer it belongs to.

## User Stories / Jobs To Be Done

1. **As a** sales rep, **I want** to see a list of all organizers with their name, handle, location, and how many leads are tied to them, **so that** I can quickly judge which organizers are worth focusing outreach on.
2. **As a** sales rep, **I want** a nav tab for Organizers, **so that** I don't have to hunt for the page through a lead's detail view.
3. **As a** sales rep, **I want** to click an organizer and land on a detail page, **so that** I can see everything tied to that organizer in one place.
4. **As a** sales rep or manager, **I want** to see the full event history for an organizer (every lead ever linked, with event name/date/stage/owner), **so that** I know what has already been tried with this organizer and by whom, before reaching out again.
5. **As a** sales rep, **I want** an "Add Event" button on the organizer detail page, **so that** I can create a new lead for a fresh event at this organizer without manually searching for and re-linking the organizer afterward.

## What The User Wants (Behavioral Outcomes)

- A new **Organizers** entry appears in the app's navigation (both desktop sidebar and mobile nav, since they share one nav source).
- Visiting the Organizers list shows every organizer as a row/card with: organizer name, social handle, location, and a count of leads currently linked to that organizer.
- Clicking any organizer row navigates to that organizer's own detail page.
- The organizer detail page shows every lead ever linked to this organizer (not just currently open ones) — each shown as one "event history" entry with: the event name, the event date, the lead's current pipeline stage, and the lead's owner.
- The organizer detail page has a clearly visible "Add Event" action. Clicking it opens the existing new-lead creation form, with the organizer already selected/attached — the user does not have to search for or re-select the organizer.
- The linked-leads list on the organizer detail page only shows leads the viewing user is allowed to see, matching how every other lead list in the app already respects visibility rules.
- Everything on both pages reflects live database data — no mock/stub data.

## Flow / State Diagram

```
[Nav bar] ──click "Organizers"──▶ [Organizers List Page]
                                        │  shows: name | handle | location | lead count
                                        │
                                        │ click a row
                                        ▼
                              [Organizer Detail Page]
                                 │                    │
                                 │ shows event         │ click "Add Event"
                                 │ history table:       │
                                 │ event name | date |  ▼
                                 │ stage | owner   [New Lead Form]
                                 │ (all linked leads,   organizerId pre-filled
                                 │  visibility-scoped)  (user fills rest, submits)
                                 │                       │
                                 │                       ▼
                                 │              [New lead created,
                                 │               linked to this organizer]
                                 │                       │
                                 └───────────◀───────────┘
                                   (new lead now appears in this
                                    organizer's event history)
```

Branches / edge states:
- Organizer with 0 linked leads → list shows lead count "0"; detail page shows an empty event-history state (not an error).
- Organizer with leads the current user cannot see (visibility-scoped) → those leads are simply excluded from the detail page list, not shown as "hidden" placeholders.
- Organizer has no `normalizedHandle` value stored → handle column/field renders as blank/em-dash, not an error.

## Acceptance Criteria (Testable Outcomes)

1. **Organizers appears as a nav tab, visible on both desktop and mobile navigation.**
   proven by: Fully-Automated navigation-render check (component/unit test on the shared nav item array) + Agent-Probe manual click-through (repo-wide e2e auth-fixture gap applies — see Constraints).
   strategy: Hybrid

2. **The Organizers listing page renders every organizer with name, social handle, location, and linked-lead count.**
   proven by: Fully-Automated unit test on the new organizers-list DB query (Vitest, DB-free `.toSQL()`/condition assertions per existing repo pattern) + Agent-Probe for full-page render (blocked by e2e auth-fixture gap, pre-accepted known-gap).
   strategy: Hybrid

3. **Clicking an organizer row navigates to that organizer's detail page.**
   proven by: Agent-Probe manual click-through (e2e auth-fixture gap blocks automated e2e; pre-accepted known-gap pattern).
   strategy: Agent-Probe

4. **The organizer detail page lists every lead ever linked to the organizer (open and closed/won/lost), not only currently active ones.**
   proven by: Fully-Automated unit test on the linked-leads-by-organizer DB query, asserting no implicit stage filter is applied.
   strategy: Fully-Automated

5. **Each event-history row shows event name, event date, current stage, and owner name — sourced from the lead record, not from `crm_meetings`.**
   proven by: Fully-Automated unit test confirming the query/mapping pulls `eventName`/`eventDate`/`stage`/owner-name-via-enrichment from `crm_leads`, with no join to `crm_meetings`.
   strategy: Fully-Automated

6. **The organizer detail page's linked-leads list respects the same visibility scoping (`crmLeads.visibility`) as every other lead-list surface in the app.**
   proven by: Fully-Automated unit test verifying the query applies the same visibility filter used by `listLeadsFiltered`.
   strategy: Fully-Automated

7. **"Add Event" opens the new-lead form with the organizer already attached — no manual organizer search/selection required.**
   proven by: Fully-Automated unit test on the `?organizerId=` query-param read + `leadFormSchema` pre-fill logic + Agent-Probe for the full click-through UI confirmation (e2e auth-fixture gap; pre-accepted known-gap).
   strategy: Hybrid

8. **Submitting the pre-filled new-lead form creates a lead whose `organizerId` matches the organizer the user started from, and that lead subsequently appears in that organizer's event history.**
   proven by: Fully-Automated integration-style unit test on `createLead()` confirming `organizerId` is persisted from the pre-filled value; DB-free per existing test convention.
   strategy: Fully-Automated

9. **Organizers with zero linked leads show lead count "0" on the list and an empty (not broken) event-history state on detail — no error thrown.**
   proven by: Fully-Automated unit test with a zero-lead organizer fixture.
   strategy: Fully-Automated

10. **All data on both pages comes from the real Postgres/Drizzle-backed tables — no mock/stub data path is used.**
    proven by: Fully-Automated code-review-style check (no import from `src/lib/server/mock.ts` in the new routes/queries) enforced at PR/EXECUTE review time.
    strategy: Fully-Automated

## Out Of Scope

- Editing or creating organizer records themselves (name, handle, location, contact fields) — this SPEC only covers reading/listing organizers and linking new leads to an existing organizer. Organizer CRUD is presumed to be a separate, later issue.
- Soft-deleting organizers — `crmOrganizers` has no `deletedAt` column; deletion/archival behavior is not part of this SPEC.
- Linking `crm_notes` to organizers (GitHub #191) — explicitly a separate issue, not addressed here.
- Pulling event history from `crm_meetings` (scheduled meetings) — event history in this SPEC is lead-derived only, per the RESEARCH finding that one `crm_leads` row = one outreach event.
- Any change to the existing `PATCH /api/leads/[id]/organizer` tag/untag endpoint — it already exists and is reusable but is not modified by this work.
- Search, sort, or filter controls on the Organizers listing page — the listing page in this SPEC is a plain list/table; sorting/filtering can be a follow-up if requested.
- Pagination behavior/strategy for the Organizers list or the detail page's linked-leads list — left to INNOVATE/PLAN to decide following existing app patterns (out of scope for this requirements doc to dictate).

## Constraints

- Must reuse the existing `normalizedHandle` column as the "social handle" displayed value — there is no separate plain `handle` column.
- Lead count and event history must be computed only from leads where `deletedAt IS NULL` (repo-wide soft-delete convention).
- Event history must be sourced from `crm_leads` fields (`eventName`/`name`, `eventDate`, `stage`, owner via existing owner-name enrichment) — never from `crm_meetings`.
- The linked-leads list must apply the same visibility scoping used elsewhere in the app (`crmLeads.visibility`, GitHub #87) for consistency with other lead-list surfaces.
- New nav tab must be added via the single shared `NavItem[]` array (`AppSidebar.svelte`) so both desktop and mobile nav pick it up from one edit — no separate mobile-only nav entry.
- "Add Event" must reuse the existing `/leads/new` page and its existing creation flow — not a new duplicate lead-creation UI.
- All server-side DB access must go through `+page.server.ts`/`+server.ts` per repo convention (no client-side DB imports).
- No new soft-delete column, migration for Better Auth tables, or schema change beyond what's needed to support `organizerId` pre-fill plumbing (which uses the existing `organizerId` column already on `crm_leads`).
- e2e verification for click-through flows will hit the same repo-wide missing-Playwright-auth-fixture gap every recent feature has hit — this is a pre-accepted known-gap, not a new blocker introduced by this work.

## Open Questions

None. All ambiguous interpretations from the source issues (handle field, event-history source, Add Event pre-fill mechanism, visibility scoping) were resolved using RESEARCH findings and locked into the Acceptance Criteria and Constraints above.

## Background / Research Findings

- `crmOrganizers` schema (`schema.ts:128-140`): id, name, `normalizedHandle`, socialFacebook, socialInstagram, website, email, phone, location, createdAt, updatedAt. No plain `handle` column — `normalizedHandle` is the "social handle" field for display. No `deletedAt` — organizers aren't soft-deletable.
- `crm_leads` is the event unit: one lead = one organizer-page outreach attempt, with its own `eventName`, `eventDate`, `stage`, `ownerId`. "Event history" in #190 means each `crm_leads` row linked via `organizerId` renders as one history entry (event name = `lead.eventName`/`lead.name`, date = `lead.eventDate`, stage = `lead.stage`, owner = `lead.ownerName` via `enrichWithOwnerNames`). Explicitly NOT sourced from `crm_meetings` (a separate, unrelated concept tied to `leadId`).
- No existing lead-count-per-organizer aggregation helper exists; a new `GROUP BY` query is needed, most naturally in a new `src/lib/server/db/organizers.ts` module (mirroring the `leads.ts`/`meetings.ts` convention), filtering `crmLeads.deletedAt IS NULL`.
- Nav: one shared `NavItem[]` array in `src/lib/components/layout/AppSidebar.svelte` (~lines 37-61, `work` array) feeds both desktop and mobile nav renders — a single array edit adds the tab everywhere.
- `PATCH /api/leads/[id]/organizer` (tag/untag with audit trail) already exists and is reusable, but isn't required for these two issues' read-only listing views.
- "Add Event" pre-fill has no existing plumbing anywhere in the app. It requires: a `?organizerId=` query param read on `/leads/new`, `organizerId` added to `leadFormSchema` (schemas.ts) and the `LeadForm` type, threaded through `createLead()` insert values (`leads.ts`) and the POST handler (`api/leads/+server.ts`).
- Visibility scoping (`crmLeads.visibility`, GitHub #87) already exists on other lead-list surfaces (`listLeadsFiltered`) — this SPEC locks in that the organizer detail page's linked-leads list should respect the same scoping, for consistency with every other lead-list surface in the app.
- Test infra: e2e verification will hit the same repo-wide missing-Playwright-auth-fixture gap as every recent feature (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — a pre-accepted known-gap pattern, not new to this work. Vitest/DB-free unit tests (via `.toSQL()`/condition-array assertions) are the established fallback pattern for DB-query verification per `process/context/tests/all-tests.md`.
- No existing plans/artifacts found in `process/features/organizers/` — this SPEC is the first task-folder artifact for this feature.
