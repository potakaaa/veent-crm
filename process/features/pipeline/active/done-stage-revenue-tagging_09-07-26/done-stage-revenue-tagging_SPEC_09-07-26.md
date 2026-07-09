---
name: plan:done-stage-revenue-tagging
description: SPEC — GitHub #273: add a "Done" pipeline stage after Live, with post-event revenue capture and per-AE revenue totals on the manager dashboard
date: 09-07-26
feature: pipeline
---

# SPEC — Done Stage with Post-Event Revenue Tagging (GitHub #273)

## Summary

Right now the pipeline pauses at "Live" — once an event goes live, there is no stage that
represents the event actually having happened, and no way to record how much money it
actually made. Sales reps close a deal, get it to Live, and then the trail goes cold: the
projected value they entered at Won is never checked against reality, and nobody can answer
"how much revenue did we actually book this month?" from the CRM itself.

This feature adds a **Done** stage that reps move a lead into once the event has concluded.
Moving to Done requires logging the actual revenue the event brought in (with its currency).
That number then feeds a new "Revenue" figure on the manager dashboard, broken down per AE,
so managers can see real booked revenue per rep for any date range — not just projected deal
value.

## User Stories / Jobs To Be Done

1. **As a sales rep**, I want to mark a lead's event as finished by moving it to a "Done"
   stage, so the pipeline reflects that the work on this lead is fully closed out.
2. **As a sales rep**, when I move a lead to Done, I want to be prompted to enter the actual
   revenue the event generated (amount + currency), so that real results are captured while
   they're fresh — the same way I already log details when I mark a lead Won.
3. **As a sales rep**, if I mis-entered the revenue amount or need to correct it later, I want
   to edit it directly on the lead's detail page, so I don't have to re-run the Done transition
   to fix a typo.
4. **As a manager**, I want to see total revenue per AE on my dashboard for a selected date
   range, so I can evaluate real booked outcomes per rep, not just projected deal value or
   count of won leads.
5. **As a manager**, I want the revenue figure to only reflect leads that have actually reached
   Done, so the number represents confirmed outcomes, not leads still in flight.

## What The User Wants (Behavioral Outcomes)

- The pipeline board shows a new "Done" column/stage positioned after "Live" (before the
  separate terminal "Lost" stage).
- A lead can be moved into Done the same way leads are moved into any other stage today
  (pipeline drag/drop or lead detail stage control).
- Moving a lead to Done opens a small capture form (same interaction pattern as the existing
  "mark as Won" capture flow) asking for a revenue amount and its currency before the move is
  confirmed. The move does not complete until this is submitted.
- Once captured, the revenue amount and currency are visible on the lead's detail page.
- The revenue amount on the lead's detail page can be edited directly, in place, after the
  fact — without re-triggering the Done transition or reopening the capture modal.
- The manager dashboard gains a new metric: total revenue per AE, scoped to the currently
  selected date range, alongside the existing per-AE metrics (e.g. leads won in range).
- Only leads that have reached Done contribute to this revenue total. Leads still in Won or
  Live do not count, even if they have a deal value or a partial revenue entry.
- Existing "deal value" behavior (the projected value captured at Won) is untouched — this is
  a separate, additional figure, not a replacement.

## Flow / State Diagram

### Stage flow (happy path)

```
new -> contacted -> replied -> in_discussion -> won -> live -> done
                                                          \
                                                           -> lost (still reachable from any active stage, unchanged)
```

### Done transition — capture flow

```
[Lead in "live" stage]
        |
   rep drags/moves lead to "Done"
        v
[Done Capture Modal opens]
   - Revenue amount (required)
   - Currency (required, defaults from lead's existing currency)
        |
   rep submits
        v
[Stage updated to "done"]
[revenue_cents + currency persisted]
[crm_lead_history row written: field=stage, oldValue=live, newValue=done]
        |
        v
[Lead detail page shows Revenue: <amount> <currency>, inline-editable]
```

### Dashboard aggregation (per-AE revenue)

```
Manager selects date range on /dashboard
        v
For each AE:
  sum(revenue_cents) WHERE stage = 'done'
    AND [lead reached "done" within selected range]
  -> displayed as "Revenue (range)" card, alongside existing per-AE metrics
```

## Acceptance Criteria (Testable Outcomes)

1. **A `done` stage exists in the pipeline, positioned after `live`.**
   The pipeline board and any stage-selection UI include "Done" as a valid stage, ordered
   between Live and the separate Lost stage.
   - proven by: schema/enum unit assertion confirming `done` is a valid `crm_lead_stage`
     value ordered after `live` (`src/tests/schemas.spec.ts` extension)
   - strategy: Fully-Automated

2. **Moving a lead to Done requires a revenue amount and currency before the transition
   completes.**
   Attempting to move to Done without submitting the capture form leaves the lead's stage
   unchanged.
   - proven by: `moveStageSchema` discriminated-union unit test for the new `done` branch
     (valid payload accepted, missing revenue/currency rejected)
   - strategy: Fully-Automated

3. **A successful Done transition persists the revenue amount and currency on the lead, and
   writes an audit-trail row for the stage change.**
   - proven by: `moveLeadStage` unit/integration test asserting `revenue_cents`/`currency` are
     written and a `crm_lead_history` row is created for the stage change
   - strategy: Hybrid (DB-backed; self-skips without live Postgres per existing project
     convention — same known-gap class as other DB-write tests in this repo)

4. **The revenue amount is visible and independently editable on the lead detail page after
   capture, without needing to re-trigger the Done transition.**
   - proven by: manual/agent-probe UI walkthrough of `/leads/[id]` inline edit (blocked from
     full e2e automation by the pre-existing shared Playwright auth-fixture gap)
   - strategy: Agent-Probe (known-gap: e2e-auth-bootstrap, pre-accepted per project convention)

5. **The manager dashboard shows a per-AE revenue total for the selected date range.**
   - proven by: new `getRevenuePerAe`-style aggregation unit test (mirrors existing
     `getWonInRangePerAe` test pattern in dashboard test suite) confirming correct per-AE
     sums for a given range
   - strategy: Hybrid (DB-backed aggregation; self-skips without live Postgres, same
     known-gap class as the existing manager-dashboard aggregation tests)

6. **Only leads in the Done stage contribute to the dashboard revenue total** — leads still in
   Won or Live, even with a revenue or deal-value figure present, are excluded.
   - proven by: same aggregation test as AC5, asserting a Won-stage lead with a
     `revenue_cents` value present is excluded from the sum
   - strategy: Hybrid (same known-gap as AC5)

7. **Existing `deal_value_cents` behavior is unaffected** — its existing null-on-non-won-
   transition logic and Won-stage capture flow continue to work exactly as before.
   - proven by: existing `moveLeadStage` regression tests for the `won` stage branch
     continuing to pass unchanged
   - strategy: Fully-Automated

## Out Of Scope

- Modifying or reusing `deal_value_cents` for revenue storage — revenue is a new,
  separate column (`revenue_cents`); `deal_value_cents`'s existing clearing logic is untouched.
- A new events/revenue-entries table — the current 1-lead-per-event data model is used as-is;
  revenue is a scalar field on the lead.
- Any changes to `/reports` — this feature is dashboard-only, consistent with the existing
  project convention that Reports and Dashboard are separate surfaces with separate scope.
- Any changes to Better Auth tables or migration tooling.
- Bulk-editing or bulk-import of revenue figures.
- Revenue currency conversion or multi-currency rollups on the dashboard (the dashboard shows
  per-AE totals; cross-currency aggregation behavior, if any leads use different currencies
  than others, is not addressed here and is called out as an Open Question below).

## Constraints

- Enum change must follow the established Postgres native-enum migration pattern (`ALTER TYPE
  ... ADD VALUE ... AFTER 'live'`), matching precedent set by migration `0021` — this is an
  additive, non-destructive migration.
- Next available migration number is `0035`.
- `moveStageSchema`'s existing discriminated-union structure (`z.discriminatedUnion('stage', [...])`)
  must be extended with a new `done` branch following the same shape as the existing `won`/
  `live`/`lost` branches — no restructuring of the existing branches.
- Currency must reuse the existing `currency` column / `CURRENCIES` enum (`['PHP','SGD']`) —
  no new currency enum.
- All new DB writes must respect the existing soft-delete and audit-trail conventions
  (`crm_lead_history` row per stage/field change).
- The dashboard's existing 6-query `Promise.all` aggregation pattern in
  `src/lib/server/db/dashboard.ts` must be extended with a 7th query following the same
  range-scoping approach as `getWonInRangePerAe`, not a structurally different pattern.
- Zod's `LEAD_STAGES` (`src/lib/zod/schemas.ts`) and the `Stage` type
  (`src/lib/types/index.ts`) must be updated in sync with the schema enum change — these are
  maintained manually and do not auto-derive from the DB enum.

## Open Questions

None. All decisions were locked by the user prior to this SPEC (see Background below). If a
cross-currency dashboard rollup edge case is discovered during INNOVATE/PLAN, it will be
raised there as a scoped follow-up rather than blocking this SPEC.

## Background / Research Findings

- Pipeline stage is a Postgres **native enum** `crm_lead_stage`
  (`src/lib/server/db/schema.ts:35`): `['new','contacted','replied','in_discussion','won',
  'live','lost']`. Zod mirrors it separately via `LEAD_STAGES`
  (`src/lib/zod/schemas.ts:7`) and the `Stage` type (`src/lib/types/index.ts:20`) — both are
  maintained by hand and must be kept in sync with any enum change.
- Precedent migration for adding an enum value: `drizzle/0021_third_ulik.sql` added `'live'`
  via `ALTER TYPE "crm_lead_stage" ADD VALUE 'live' BEFORE 'lost'` — an established,
  low-risk pattern. This feature's migration (`0035`, next available idx) follows the same
  approach: `ALTER TYPE "crm_lead_stage" ADD VALUE 'done' AFTER 'live'`.
- `moveStageSchema` (`schemas.ts:278`) is a `z.discriminatedUnion('stage', [...])` — `won`,
  `live`, and `lost` each have their own literal branch with stage-specific payload fields. A
  `'done'` branch follows the same established pattern.
- `deal_value_cents` (`schema.ts:178`) already exists on `crm_leads`, nullable and
  unconstrained — but `moveLeadStage` (`src/lib/server/db/leads.ts:1277-1321`) currently NULLs
  it on every non-won transition. Issue #279 (same session) commented out its input in
  `WonCaptureModal.svelte` with `TODO(#273)` markers pointing at this exact issue — confirming
  the team's intent to separate "projected value at Won" from "actual revenue at Done."
  **User decision:** these stay semantically distinct; `revenue_cents` is a new column, not a
  reuse of `deal_value_cents`.
- `WonCaptureModal.svelte` is the direct UI template for a new `DoneCaptureModal.svelte`
  (same prop shape: open/leadName/onclose/onconfirm/saving; small form emitting a
  `MoveStagePayload`-shaped object).
- `crm_leads` has no separate events table — event fields (`eventName`, `eventDate`,
  `eventLink`) are inline columns on the lead itself. One lead = one event in the current
  data model, confirmed sufficient for a single scalar `revenue_cents` column (no new
  revenue-entries table needed).
- Dashboard aggregation lives in `src/lib/server/db/dashboard.ts`: 6 per-AE queries composed
  via `Promise.all` in `getDashboardData(range)`. The closest analog for the new revenue query
  is `getWonInRangePerAe` (`dashboard.ts:182`), which uses `.selectDistinctOn()` on
  `crm_lead_history` to find each lead's most recent stage-transition timestamp for
  range-scoping. A 7th query (e.g. `getRevenuePerAe`) follows this same range-scoping approach,
  summing `revenue_cents` grouped by `ownerId` for leads whose most recent transition into
  `done` falls in the selected range.
- Dashboard UI (`src/routes/dashboard/+page.svelte`) renders per-AE metrics in a `<dl>` card
  grid — the new "Revenue (range)" metric fits as an additional card, formatted from cents to
  a currency display, consistent with existing card rendering.
- Locked user decisions carried into this SPEC verbatim:
  1. `done` stage is added AFTER `live` in the enum ordering.
  2. Revenue is stored in a NEW `revenue_cents` column, not a reuse of `deal_value_cents`.
  3. Revenue is edited inline on `/leads/[id]` (not via the separate edit form, not by
     reopening the capture modal) — mirroring whatever inline-edit pattern that page already
     uses for other fields (to be confirmed at PLAN time).
  4. Currency reuses the existing `currency` column / `CURRENCIES` enum.
  5. "Per event" = "per lead," given the confirmed 1-event-per-lead data model.
- Test-context grounding: per `process/context/tests/all-tests.md`, Vitest covers schema/
  Zod/server-logic without a live DB (Fully-Automated tier); DB-write and aggregation logic
  is Hybrid-tier and self-skips without a live Postgres connection (existing, pre-accepted
  known-gap pattern shared with the manager-dashboard and other features); any full e2e
  click-through remains Agent-Probe/known-gap until the shared Playwright auth fixture
  (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) is resolved.
