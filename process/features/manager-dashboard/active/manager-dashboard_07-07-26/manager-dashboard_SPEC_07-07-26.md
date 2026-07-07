---
name: plan:manager-dashboard-spec
description: "Product-discovery SPEC for a manager-only per-AE performance dashboard (GitHub issue #244 / DASH-1)"
date: 07-07-26
feature: manager-dashboard
---

# SPEC — Manager Performance Dashboard (Issue #244 / DASH-1)

## Summary

Managers and super-managers currently have no single place to see how each Account Executive (AE)
is performing. To check on a rep's workload or coaching needs today, a manager has to piece
together information from the Leads list, Pipeline board, and Reports page separately. This SPEC
covers a new `/dashboard` page, visible only to managers and super-managers, that shows one row (or
card) per AE with their key numbers — how many leads they own, where those leads sit in the
pipeline, how many they've won, whether they're keeping up with follow-ups, and how many new leads
they've picked up recently — with a date-range filter and a one-click link into that AE's filtered
lead list. This gives managers a fast, trustworthy view for 1:1s, coaching, and team reviews,
without needing to run manual reports.

## User Stories / Jobs To Be Done

- **As a manager**, I want to see, at a glance, every AE's current lead load and win record, so
  that I can spot who's overloaded or underperforming without asking around.
- **As a manager**, I want to see each AE's pipeline stage breakdown (how many leads are in each
  stage), so that I can tell whether someone's leads are stuck versus progressing.
- **As a manager**, I want to see how reliably each AE follows up with leads on time, so that I can
  coach reps who are letting follow-ups slip before it costs us deals.
- **As a manager**, I want to filter the whole dashboard by "this week / this month / all time", so
  that I can review recent performance for a 1:1 or look at long-term trends for a quarterly review.
- **As a manager**, I want to click through from an AE's row straight to their filtered lead list,
  so that I can dig into specifics without re-searching from scratch.
- **As a super-manager**, I want the same dashboard access as a manager, so that leadership has the
  same visibility without a separate build.
- **As a rep**, I should never be able to reach this page — it's a manager/coaching tool, not
  something reps need or should see about themselves or peers.

## What The User Wants (Behavioral Outcomes)

- Visiting `/dashboard` as a manager or super-manager shows a per-AE breakdown: one row/card per
  active AE, each showing their name, leads owned, pipeline-stage distribution, won count
  (all-time and for the selected date range), follow-up adherence rate, and leads added in the
  selected date range.
- Visiting `/dashboard` as a rep is blocked outright — the rep sees a "not authorized" outcome, not
  a partial or read-only view.
- A date-range control lets the manager switch between "this week", "this month", and "all time".
  Changing it immediately updates every AE's numbers on the page to match that range.
- Clicking an AE's row/card (or a dedicated link on it) takes the manager to `/leads` already
  filtered to that AE's leads, so they can drill in without manually re-applying filters.
- The dashboard reflects only non-deleted (soft-deleted leads excluded) and only currently-active
  AEs — this is a live operational view, not a historical export.
- This page effectively replaces the need for the standalone "leads added per rep" ask from issue
  #232 — that metric becomes one column of this richer dashboard rather than a separate report.

## Flow / State Diagram

```
                          ┌─────────────────────────┐
                          │ User navigates to        │
                          │ /dashboard                │
                          └────────────┬─────────────┘
                                       │
                              ┌────────▼─────────┐
                              │ Session role check │
                              └───┬───────────┬───┘
                                  │           │
                     role = rep  │           │ role = manager
                                  │           │ or super_manager
                                  ▼           ▼
                     ┌────────────────┐   ┌──────────────────────────┐
                     │ 403 — blocked   │   │ Load per-AE metrics for   │
                     │ (no dashboard   │   │ default range            │
                     │  content shown) │   │ ("this week", or as       │
                     └────────────────┘   │  decided in INNOVATE)     │
                                          └────────────┬──────────────┘
                                                        │
                                          ┌─────────────▼──────────────┐
                                          │ Render one row/card per AE:  │
                                          │  - leads owned               │
                                          │  - stage distribution         │
                                          │  - won (all-time + range)     │
                                          │  - follow-up adherence %      │
                                          │  - leads added (range)        │
                                          └─────────────┬──────────────┘
                                                        │
                                   ┌────────────────────┼────────────────────┐
                                   │                    │                    │
                          manager changes        manager clicks       (idle / review)
                          date-range filter       an AE row/card
                                   │                    │
                                   ▼                    ▼
                       ┌───────────────────┐  ┌───────────────────────────┐
                       │ Re-fetch + re-render│  │ Navigate to                │
                       │ metrics for new range│  │ /leads?rep=<id>            │
                       └───────────────────┘  │ (pre-filtered to that AE)   │
                                              └───────────────────────────┘
```

## Acceptance Criteria (Testable Outcomes)

1. **A rep session hitting `/dashboard` is refused access (403), with no metric data rendered.**
   proven by: server-side load-function unit test asserting `error(403, ...)` is thrown for
   `role='rep'`, mirroring the existing `/team` gate test pattern.
   strategy: Fully-Automated (Vitest).

2. **A manager or super-manager session hitting `/dashboard` successfully loads the page and sees
   every active AE represented.**
   proven by: load-function unit test asserting both roles pass the gate and the returned data set
   includes one entry per active AE.
   strategy: Fully-Automated (Vitest) for the gate; Hybrid (live-Postgres query test, matching the
   `reminders-db.spec.ts` pattern) for the actual per-AE data assembly.

3. **Each AE's entry shows, at minimum: name, leads owned count, pipeline stage distribution, won
   count (all-time), won count (selected range), follow-up adherence rate, and leads-added count
   for the selected range.**
   proven by: Hybrid DB-backed unit test seeding known leads/activities/history fixtures per AE and
   asserting the computed numbers match hand-calculated expectations.
   strategy: Hybrid (live Postgres required for realistic aggregation).

4. **Changing the date-range filter (this week / this month / all time) changes the range-bound
   numbers shown (won-in-range, leads-added-in-range) without altering the all-time numbers.**
   proven by: Hybrid DB-backed test asserting the same seeded data set yields different range-bound
   figures for each of the three range values, and unchanged all-time figures across all three.
   strategy: Hybrid.

5. **Clicking through from an AE's row/card lands on `/leads` pre-filtered to that AE's leads
   (equivalent to `/leads?rep=<id>`), showing only that AE's owned leads.**
   proven by: Playwright e2e navigation spec (click-through + resulting filtered list assertion).
   strategy: Agent-Probe — currently blocked by the repo's pre-existing gap (no shared Playwright
   authenticated-session fixture; every protected-route e2e spec self-skips per
   `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). This is a known,
   pre-accepted repo-wide gap, not new to this feature — treat as Known-Gap until the shared fixture
   lands, at which point this criterion converts to Fully-Automated.

6. **Deleted (soft-deleted) leads are excluded from every metric on the dashboard.**
   proven by: Hybrid DB-backed test seeding a soft-deleted lead alongside active ones and asserting
   it is excluded from owned-count, won-count, and leads-added-count.
   strategy: Hybrid.

7. **`bun run check` and `bun run lint` both exit 0 after the feature is implemented.**
   proven by: CI/local command run as part of the EXECUTE/EVL gate.
   strategy: Fully-Automated.

## Out Of Scope

- Choosing the exact definition/formula for "follow-up adherence rate" (e.g., which activities
  count, what "on time" means precisely) — this is an INNOVATE-stage decision (see Open Design
  Questions below), not decided here.
- Choosing the boundary field for "won last 30 days" (e.g. `signedAt` vs. `crm_lead_history`
  stage-transition rows) — deferred to INNOVATE.
- Choosing whether to reuse/extend `WeekRangeControl.svelte` or build a new three-bucket control for
  "this week / this month / all time" — deferred to INNOVATE.
- Any new database schema/migration to add a dedicated "follow-up completed on time" flag — if
  INNOVATE determines a schema change is warranted, that is new scope requiring its own
  plan/validate cycle, not assumed here.
- Historical/point-in-time snapshots, exports (CSV/PDF), or scheduled email delivery of dashboard
  data — this SPEC covers a live, on-demand view only.
- Per-AE goal-setting, targets, or alerting/notifications based on dashboard metrics.
- Any UI for reps to see their own or peers' metrics — the page is manager/super-manager only, full
  stop.
- Superseding or removing the existing `/reports` page — `/dashboard` is a new, additional
  manager-only surface; `/reports` continues to exist unchanged.
- Custom/arbitrary date ranges beyond the three specified buckets (this week / this month / all
  time) — no date-picker for arbitrary start/end dates in v1.

## Constraints

- **Role gating must reuse the existing pattern**: `isManagerRole()` from
  `src/lib/utils/permissions.ts` + `error(403, 'Manager only')`, exactly as
  `src/routes/team/+page.server.ts` does today. Do not introduce a new authorization helper or
  redirect to `/unauthorized` (that route is reserved for allowlist rejection, not role
  authorization).
- **Soft-delete discipline**: every metric query must filter `deleted_at IS NULL` on
  `crm_leads`, per repo-wide convention.
- **Server-side DB access only**: all Drizzle queries live in `+page.server.ts` (or a server-only
  helper module), never in client-side `.svelte` code — repo-wide mandatory convention.
- **No mock data**: metrics must be computed from real Drizzle queries against the live schema;
  `src/lib/server/mock.ts` must not be touched or depended on.
- **Test tiering must follow repo convention**: DB-dependent aggregation tests are Hybrid-tier
  (live Postgres), matching existing patterns like `reminders-db.spec.ts`. E2E click-through is
  currently blocked by the repo-wide missing Playwright auth fixture — this is a pre-existing,
  accepted gap, not something this feature must solve.
- **Issue #232 relationship**: this SPEC's "leads added this week/month" per-AE metric absorbs the
  intent of issue #232 ("leads added per rep" in Reports). INNOVATE/PLAN should treat #232 as
  satisfied by this feature rather than building a separate reports column, unless the user
  explicitly wants both.
- **Existing `/reports` leaderboard** (`fetchReport()` in `src/routes/reports/+page.server.ts`)
  already computes per-rep touches/replies/wins (all-time only). Any new dashboard query work
  should be evaluated against reusing or extending this existing computation versus writing a
  parallel one — an INNOVATE-stage decision, not resolved here.

## Open Questions

None blocking SPEC — the user-facing intent (what the dashboard shows, who can see it, and how
filtering/drill-down behave) is clear from the issue text and confirmed by research. The following
items are explicitly **implementation-approach questions deferred to INNOVATE** (per this SPEC's
Out Of Scope section) and are not open intent questions:

- Owner: INNOVATE — exact definition of "follow-up adherence rate" (which activities/fields count,
  what "on time" means, whether a schema change is needed).
- Owner: INNOVATE — which field/table is authoritative for "won" and its date boundary
  (`signedAt` vs. `crm_lead_history` stage-transition audit rows).
- Owner: INNOVATE — reuse `WeekRangeControl.svelte` vs. build a new three-bucket
  (week/month/all-time) control.

## Background / Research Findings

- Role model: `crm_user_role` enum = `['rep', 'manager', 'super_manager']` (`schema.ts:25`);
  default role is `'rep'`. The existing `/team` route (`src/routes/team/+page.server.ts:23-26`)
  already implements the exact manager-only gate this SPEC needs: `isManagerRole()` +
  `error(403, 'Manager only')`. `/unauthorized` is reserved for allowlist (session-exists-but-not-
  a-crm-user) rejection, not role-based authorization — do not conflate the two.
- `/reports` (`fetchReport()`) already computes a per-rep `leaderboard: { repId, name, touches,
  replies, wins }`, but `wins` is all-time only (no date bound), and there is no per-rep "leads
  added" metric anywhere in the codebase — issue #232 is confirmed not implemented. There is also no
  existing per-rep, per-stage pipeline distribution query; this is straightforward net-new
  aggregation (`groupBy(ownerId, stage)`).
- Leads schema: `crmLeads.ownerId` (nullable uuid — null means "up for grabs, unowned"), `.stage`
  (enum `leadStage`), `.createdAt`, `.deletedAt` (soft delete — always filter
  `deleted_at IS NULL`), `.dealValueCents`, `.signedAt` (won capture, but research found this field
  is sparsely populated in practice). There is no dedicated `wonAt` column.
- "Won last 30 days" needs a date-bounded query. Two candidate sources exist: `signedAt` (sparse
  coverage today) or `crm_lead_history` stage-change audit rows (`oldValue`/`newValue`, which
  reliably capture every stage transition including transitions into "won"). This tradeoff — data
  completeness vs. using the field that's semantically "designed for this" — is exactly the kind of
  decision INNOVATE exists to weigh; SPEC intentionally does not pick a side.
- Follow-ups: there is no separate reminders table. `followUpAt` lives on `crm_activities` (one row
  per outreach touch). No existing "completed on time / late / missed" flag exists anywhere.
  `getDueReminders()` and `getRemindersQueue()` (`src/lib/server/db/leads.ts`) only bucket
  *currently* due/overdue activities — they do not retroactively track whether a past follow-up was
  actioned on time. Computing an adherence rate will require new query logic (e.g., a self-join on
  `crm_activities` per lead: was there a subsequent activity's `occurredAt` before the prior
  activity's `followUpAt` lapsed?). This is the single biggest open design question in the whole
  feature — flagged here for INNOVATE, not resolved.
- Reusable date-range filter UI: `src/lib/components/ui/week-range-control/`
  (`WeekRangeControl.svelte`) is a shared `role="radiogroup"` component (from
  `unified-filter-components_06-07-26`) already used on `/leads` and `/unassigned`, but it's
  currently framed around week ranges, not a three-bucket "this week / this month / all time"
  selector. Whether to extend it or build new is an INNOVATE-stage UI decision.
- No existing plan or context conflicts: `process/features/manager-dashboard/` was empty prior to
  this SPEC; no competing plan exists anywhere in `process/general-plans/active/` or other feature
  folders.
- Test tiering (from research, grounded in `process/context/tests/all-tests.md`): 403 gate is
  Fully-Automated (Vitest load-function unit test, same shape as existing `/team` gate coverage);
  per-AE aggregation queries are Hybrid (needs live Postgres, matching the existing
  `reminders-db.spec.ts` pattern); follow-up adherence calculation is Hybrid/Agent-Probe pending the
  INNOVATE decision on its definition; click-through navigation is Agent-Probe and currently blocked
  by the repo's pre-existing, accepted gap: no shared Playwright authenticated-session fixture yet
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` — the same gap affecting
  every other feature's e2e coverage, not unique to this one).
