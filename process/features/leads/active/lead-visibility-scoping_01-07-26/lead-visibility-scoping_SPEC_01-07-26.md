---
name: plan:lead-visibility-scoping-spec
description: "Product-discovery SPEC for GitHub issue #87 — per-lead visibility/privacy scoping"
date: 01-07-26
feature: leads
---

# SPEC — Lead Visibility / Privacy Scoping

Source: GitHub issue #87

## Summary

Right now every rep can see every lead in the system (except when they filter their own list down
to "mine"). There's no way to keep a lead private to its owner, or to share it with just a chosen
few teammates. This SPEC adds a per-lead visibility setting — "Only me," "Everyone," or "Selected
people" — so lead owners (and managers) can control who sees and can act on a given lead. Leads a
user isn't allowed to see disappear from their lists, queues, and counts everywhere in the app,
while managers keep full visibility and override power over every lead regardless of its setting.

## User Stories / Jobs To Be Done

1. **As a rep creating a new lead**, I want to choose who can see it (just me, everyone, or a
   specific set of people), so that sensitive or personal leads aren't visible to the whole team
   by default.

2. **As a rep or manager viewing a lead I own or manage**, I want to change its visibility later
   from the lead detail page, so that I can loosen or tighten access as circumstances change
   (e.g. bringing in a teammate to help work a deal).

3. **As a rep**, I want leads that aren't visible to me to simply not show up anywhere — not in
   the leads list, not in pipeline, not in Up for Grabs, not on my Today view, not in reminders,
   not in sidebar counts — so that I never see a lead I'm not supposed to have access to, and
   never get a false sense of team-wide totals that include leads I can't act on.

4. **As a manager**, I want to see and act on every lead regardless of its visibility setting,
   including changing who it's visible to, so that visibility settings never lock a manager out
   of leads their team is working.

5. **As any rep browsing Up for Grabs**, I want unclaimed leads to remain visible to me the same
   way they are today, so that the existing "claim a lead" flow isn't broken by this feature.

## What The User Wants (Behavioral Outcomes)

- Every lead has exactly one visibility setting at all times: **Only me**, **Everyone**, or
  **Selected people**. There is no "unset" state for an owned lead.
- The visibility setting is chosen at lead creation time, with a sensible default so the creator
  doesn't have to think about it unless they want to.
- The visibility setting is editable afterward from the lead detail page, by the same people who
  are already allowed to edit that lead's other fields, following the existing edit/audit pattern
  (a visibility change writes an audit history row, same as stage/owner/field changes do today).
- When "Selected people" is chosen, the owner (or a manager) picks specific teammates who should
  also be able to see the lead, in addition to the owner.
- A rep who is not the owner, not on the "selected people" list, and viewing a lead that isn't
  "Everyone" simply never encounters that lead anywhere in the app — it's excluded from every
  list, queue, count, and search a rep can see. It does not appear as a redacted/blurred entry;
  it's absent entirely, the same way soft-deleted leads are absent today.
- **Managers always see and can act on every lead**, no matter its visibility setting. A
  manager can also change any lead's visibility setting at any time, consistent with existing
  manager-override behavior for owner and stage changes elsewhere in the app.
- Unassigned/unclaimed leads (no owner yet, sitting in Up for Grabs) behave exactly as they do
  today — visible to every rep so the claim flow keeps working. This includes freshly
  scraper-ingested leads, which land unassigned and are visible to all reps until someone claims
  them.
- When a lead's owner changes (claimed from Up for Grabs, or reassigned by a manager), the
  lead's visibility resets to "Everyone" — it does not carry forward a previous owner's "Only
  me" setting onto a new owner who may not have intended that restriction. The new owner can
  immediately tighten it again if they want to.
- Reports (funnel, leaderboard, currency totals) continue to aggregate across all leads
  regardless of individual visibility settings — reports are a manager-facing analytics surface,
  not a lead-acting surface, and are not scoped down by this feature.

## Flow / State Diagram

**Visibility lifecycle for a single lead**

```text
[Lead created]
   |
   | owner picks visibility (default: Everyone)
   v
[Only me] <----> [Everyone] <----> [Selected people]
   ^                                     |
   |         owner/manager edits         |
   +-------------------------------------+
              (any transition allowed, any time,
               by owner or manager; audit row written)

[Owner reassigned] --> visibility resets to [Everyone]
   (whether via claim-from-unassigned or manager reassignment)
```

**Who sees a lead, by role and setting**

```text
                    Only me         Everyone        Selected people
Owner (rep)           YES              YES               YES
Selected rep           NO              YES               YES (if selected)
Other rep               NO              YES               NO
Any manager            YES              YES               YES  (always, override)
Unclaimed (no owner)    n/a         YES (all reps)          n/a
```

**Where visibility is enforced (every surface a lead can appear on for a rep)**

```text
Leads list (/leads, all segments)  ---\
Pipeline (/pipeline)                   \
Up for Grabs (/unassigned)              >--- visibility filter applied
Today / daily-loop home (/)            /      (except: unclaimed leads always visible;
Reminders queue                       /        reports aggregate unfiltered;
Lead detail single-record (/leads/[id])        managers always see all)
Sidebar nav counts                  --/
Reports (funnel/leaderboard/currency) ---- NOT filtered (manager analytics, unaffected)
```

## Acceptance Criteria (Testable Outcomes)

1. **A new lead can be created with an explicit visibility choice of "Only me," "Everyone," or
   "Selected people," and if "Selected people" is chosen, at least one teammate can be picked
   as part of that same creation flow.**
   proven by: extends the existing lead-creation test coverage (e.g. `leads.spec.ts` /
   `leads-db.spec.ts` — exact file decided in PLAN) with a new visibility-on-create case, plus a
   Playwright e2e scenario for the create-lead form.
   strategy: Fully-Automated

2. **A lead created without an explicit visibility choice defaults to "Everyone."**
   proven by: unit test on lead creation asserting the default value when visibility is omitted.
   strategy: Fully-Automated

3. **From the lead detail page, an owner or manager can change a lead's visibility setting, and
   the new setting takes effect immediately (subsequent reads by non-permitted users reflect the
   change).**
   proven by: e2e scenario exercising the lead detail edit flow (visibility change) + unit test
   on the underlying update path (parallel to existing owner/field edit tests in
   `leads.spec.ts` / `leads-db.spec.ts`).
   strategy: Fully-Automated

4. **A rep who edits a lead's visibility setting has that change recorded in the lead's audit
   history (`crm_lead_history`), the same way stage, owner, and field changes are recorded
   today.**
   proven by: unit test asserting a history row is written on visibility change, following the
   existing pattern in `leads-db.spec.ts` for other audited fields.
   strategy: Fully-Automated

5. **A rep who is not the owner and not on the "selected people" list does not see a
   "Only me" or restricted "Selected people" lead in the leads list (`/leads`, any segment).**
   proven by: extends `leads-filters.spec.ts` (or `leads-db.spec.ts`) with visibility-scoped
   query cases, plus an e2e scenario logged in as a non-permitted rep confirming the lead is
   absent from the rendered list.
   strategy: Fully-Automated

6. **The same non-permitted rep does not see that lead in pipeline (`/pipeline`), on the
   Today/daily-loop home (`/`), or in the reminders queue.**
   proven by: extends `pipeline.spec.ts` / `pipeline-db.spec.ts`, `today.spec.ts`, and
   `reminders.spec.ts` / `reminders-db.spec.ts` with visibility-scoped assertions for each
   surface's query layer.
   strategy: Fully-Automated

7. **Sidebar nav counts do not include leads the current user cannot see.**
   proven by: unit test on the nav-counts function confirming counts are scoped to
   visibility-permitted leads for a rep session, contrasted with an unscoped count for a
   manager session.
   strategy: Fully-Automated

8. **A non-permitted rep who directly navigates to a restricted lead's detail URL
   (`/leads/[id]`) cannot view or act on it** (treated the same as any other not-visible/not-
   accessible record — not a redacted partial view).
   proven by: e2e or integration test hitting `/leads/[id]` as a non-permitted rep and asserting
   the record is not returned/rendered.
   strategy: Fully-Automated

9. **A manager can see and act on every lead in the system regardless of its visibility setting,
   including "Only me" leads owned by other reps.**
   proven by: unit + e2e coverage asserting manager-session queries return all leads
   independent of visibility, mirroring existing manager-override test patterns for
   `canEditLead` / owner reassignment.
   strategy: Fully-Automated

10. **A manager can change the visibility setting on any lead, even one they don't own and
    weren't selected on.**
    proven by: unit test on the visibility-update path run under a manager session against a
    lead the manager doesn't own.
    strategy: Fully-Automated

11. **Unassigned leads (no owner) remain visible to every rep in Up for Grabs, unaffected by
    this feature.**
    proven by: extends existing Up for Grabs test coverage confirming unclaimed-lead visibility
    is unchanged (regression case).
    strategy: Fully-Automated

12. **A freshly scraper-ingested lead (via `/api/leads/ingest`, `ownerId: null`) is visible to
    all reps in Up for Grabs immediately after ingest, the same as today.**
    proven by: extends `import.spec.ts` (or the ingest route's existing test coverage) with a
    visibility-default assertion on newly ingested leads.
    strategy: Fully-Automated

13. **When a lead is claimed from Up for Grabs (owner set from null to a rep) or reassigned by a
    manager (owner changed from one rep to another), the lead's visibility resets to
    "Everyone."**
    proven by: unit test on the claim/reassign path asserting visibility is reset, covering both
    the claim-from-unassigned case and the manager-reassignment case (parallel to existing
    owner-change tests in `leads-db.spec.ts`).
    strategy: Fully-Automated

14. **Reports aggregates (funnel, leaderboard, currency totals) are unaffected by this feature —
    they continue to include all leads regardless of visibility setting.**
    proven by: regression test/assertion on the reports query layer confirming no visibility
    filter is applied (explicit "this surface is intentionally unfiltered" test case).
    strategy: Fully-Automated

## Out Of Scope

- **No new roles or permission tiers.** This feature works within the existing two-role model
  (`rep`, `manager`). It does not introduce a third role, a "shared with" notification, or any
  finer-grained permission system.
- **No UI for bulk visibility changes.** Changing visibility on many leads at once (e.g. from a
  list view) is not covered — only single-lead visibility changes from lead detail (and the
  initial choice at creation) are in scope.
- **No visibility-based notifications.** Adding/removing someone from a lead's "Selected people"
  list does not trigger any email, in-app notification, or reminder to that person as part of
  this SPEC.
- **No historical backfill decision.** This SPEC does not specify what visibility value existing
  leads in the database get when this feature ships — that migration/backfill approach is a
  technical decision for INNOVATE/PLAN, though whatever default is chosen must not silently hide
  leads that were previously visible to everyone (see Constraints).
- **No change to reports scope.** Reports remain manager-facing, unfiltered analytics as they are
  today — this SPEC does not add per-user report scoping.
- **No technical/schema design.** How "Selected people" is stored (junction table, array column,
  or otherwise) and the exact query/WHERE-clause strategy for filtering by visibility are
  explicitly deferred to INNOVATE and PLAN. This SPEC defines only the observable behavior.

## Constraints

- **Visibility changes must be audited.** Every visibility change writes a row to
  `crm_lead_history`, consistent with the existing product invariant that all stage, owner, and
  deal-value changes are audited (per CLAUDE.md).
- **Edit permission for visibility follows the existing `canEditLead` gate**, plus the
  manager-override that already applies to every other editable field/owner/stage change in this
  codebase — no new, separate permission mechanism is introduced for visibility specifically.
- **Every surface that lists or queries leads must respect the new visibility rule**, including
  surfaces that currently bypass the shared query layer and query `crmLeads` directly (reports'
  funnel/leaderboard/currency aggregates are the one explicit, stated exception — see Out Of
  Scope/Behavioral Outcomes).
- **The scraper ingest endpoint (`/api/leads/ingest`) must set a sensible visibility default**
  ("Everyone," consistent with unassigned-lead visibility today) since it currently sets no
  visibility value at all.
- **Migration/backfill of existing leads must not reduce visibility for anyone who currently has
  it.** Whatever default value existing leads get when this ships, it must not retroactively hide
  leads from reps who can see them today (i.e. default existing leads to "Everyone," not "Only
  me").
- **Soft-delete and other existing lead-list filters remain layered on top of** — not replaced
  by — the new visibility filter (e.g. a soft-deleted lead stays excluded regardless of
  visibility).

## Open Questions

None. The four open product questions flagged for this SPEC were resolved with reasonable
defaults consistent with existing manager-override precedent and the Up for Grabs claim flow (see
Background below for the reasoning). If any of these defaults are wrong, correct them here before
INNOVATE begins — they are locked assumptions for the rest of the workflow otherwise.

## Background / Research Findings

- Roles: only two exist today, `rep` and `manager` (`USER_ROLES` in `schemas.ts`, `crm_user_role`
  pg enum). No finer-grained role system to build on or extend.
- Current read model: reps currently see ALL leads with no visibility restriction at all, except
  the `segment='mine'` filter which scopes by `ownerId`. `crm_leads` has no visibility field
  today. `ownerId: uuid` is nullable — null means unassigned/"Up for Grabs."
- Surfaces enumerated as needing visibility enforcement (from RESEARCH): leads list (`/leads`,
  all segments), pipeline (`/pipeline`), Up for Grabs (`/unassigned`), Today/daily-loop home
  (`/`), reminders queue, sidebar nav counts, lead detail single-record read (`/leads/[id]`), and
  the scraper ingest endpoint (`/api/leads/ingest` — currently inserts with `ownerId: null` and no
  visibility value). Reports (funnel/leaderboard/currency) currently query `crmLeads` directly,
  bypassing the shared query layer — explicitly called out as the one surface this SPEC decides
  to leave unfiltered (see decision below). Review Queue was already removed from the codebase
  (01-07-26) and is not part of this scope.
- Existing edit/audit precedent: stage/owner changes go through
  `PATCH /api/leads/[id]/owner` (manager-only); other field edits go through
  `PATCH /api/leads/[id]` gated by `canEditLead` (`src/lib/utils/permissions.ts`). Every scalar
  field change writes a `crm_lead_history` row. Visibility changes follow this same
  pattern per CLAUDE.md's stated audit invariant.

**Decisions locked this session (defaults chosen from the issue's stated AC and existing product
conventions — flagged here for user correction if wrong):**

1. **"Only me" vs. managers:** managers always see and can act on every lead, and can always
   change any lead's visibility setting, regardless of what the setting currently is. This
   mirrors existing manager-override precedent already present throughout the codebase
   (`canEditLead`, `moveLeadStage`, lead reassignment all already give managers universal
   override) and directly matches the issue's stated AC: "Managers can override visibility
   settings."
2. **Unassigned/Up for Grabs leads:** unowned leads (`ownerId: null`), including freshly
   scraper-ingested leads, are effectively "Everyone"-visible until claimed — unchanged from
   today's behavior. An owner-only default would break the existing "any rep can claim an
   unassigned lead" flow, which depends on universal visibility of unclaimed leads.
3. **Reports aggregates:** funnel/leaderboard/currency totals are NOT scoped by the new
   visibility rule — they continue to aggregate across all leads. Reports are manager-facing
   analytics, not a lead-acting surface, and scoping them down would silently produce incomplete
   business metrics, which is a worse outcome than the (already-accepted) fact that they're a
   manager-only surface.
4. **Visibility on owner reassignment:** when a lead's owner changes (claim from Up for Grabs, or
   manager reassignment), visibility resets to "Everyone" rather than carrying forward the
   previous owner's setting. This avoids a new owner unintentionally inheriting a restrictive
   "Only me" setting they didn't choose, and avoids a lead silently becoming invisible to a
   manager's team after a reassignment they initiated.

**Technical design explicitly deferred:** the schema shape for "Selected people" (junction table
vs. array column vs. other), the exact WHERE-clause/query strategy for applying the visibility
filter across every listed surface, and the migration/backfill mechanism for existing leads are
all deferred to INNOVATE and PLAN. This SPEC defines only the observable behavior and constraints
those technical decisions must satisfy.
