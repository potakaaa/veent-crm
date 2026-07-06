---
name: spec:rem-followup-sections
description: SPEC for REM-1 (follow-up date + owner columns on /reminders) and REM-2 (full sortable/filterable follow-up list tab) — GitHub #204, #205
date: 06-07-26
feature: reminders
---

# Reminders — Follow-Up Date/Owner Columns + Full Follow-Up List Tab (GitHub #204, #205)

Date: 06-07-26
Status: SPEC — locked, pending INNOVATE/PLAN

## Summary

Today, `/reminders` shows four buckets of leads needing a follow-up (Overdue, Due today, Upcoming, Going cold), but each lead's card never tells you **when** the follow-up is due or **who** owns it — you have to open the lead to find out. On top of that, the page only ever shows follow-ups due in the next 7 days; there's no way to see the *complete* list of every pending follow-up, sorted by date or narrowed down to one rep's workload. This SPEC covers two additions: (1) adding a due-date and owner-name label to every lead card already shown on `/reminders`, and (2) a new second tab on the same page that lists **every** pending follow-up (no 7-day cutoff), sortable by due date, and — for managers — filterable down to a single rep. Overdue items in that full list get their own visual flag so nothing urgent gets lost in a longer list.

## User Stories / Jobs To Be Done

1. **As a rep**, I want to see each lead's follow-up due date directly on the reminders card, so I don't have to open every lead just to know when I promised to reach back out.
2. **As a rep or manager**, I want to see who owns each lead on the reminders card, so I can tell at a glance whose follow-up this is (especially useful for managers scanning across the team).
3. **As a manager**, I want a complete, uncapped list of every pending follow-up across the team, so I can see workload and risk beyond the next 7 days.
4. **As a manager**, I want to narrow that full list down to one specific rep, so I can review an individual's follow-up load without scrolling past everyone else's.
5. **As a rep**, I want my own complete follow-up list (not capped at 7 days) without needing any filter control, so I can plan further ahead than the current bucket view allows.
6. **As any user scanning the full follow-up list**, I want overdue items to stand out visually, so I don't miss something already late in a long, unbucketed list.

## What The User Wants (Behavioral Outcomes)

- Every lead card on `/reminders` (in all four existing bucket sections, and in the new full-list tab) shows two additional pieces of information: the follow-up due date, and the name of the lead's owner.
- `/reminders` gains a second tab alongside the existing bucketed view. The existing four-section view (Overdue / Due today / Upcoming / Going cold) is unchanged and remains the default/first tab.
- The new tab shows one combined list of every lead with a pending follow-up, with no 7-day cap — includes everything the bucketed view would show plus anything further out.
- The full list is sorted by follow-up due date, soonest first, by default.
- Reps opening the full-list tab see whatever `visibilityCondition` already allows them elsewhere in the app (owned leads, unassigned leads, `visibility: 'everyone'` leads, and any explicitly-granted leads) — not narrowed to strictly-owned leads. No filter control is shown to them, since their own view already reflects everything they're allowed to see.
- Managers and super managers opening the full-list tab see every rep's follow-ups by default, plus a dropdown that lets them narrow the list down to one specific rep at a time. Selecting a rep shows only that rep's pending follow-ups; clearing the selection returns to the full team view.
- Any lead in the full-list tab whose follow-up date has already passed is visually flagged as overdue (distinct color/badge), independent of which "section" it would have belonged to in the bucketed view.
- Clicking a lead anywhere on either tab still goes to that lead's detail page (`/leads/[id]`) — unchanged from today.
- Snooze/nudge actions on lead cards continue to work the same way in both tabs.

## Flow / State Diagram

```text
/reminders
│
├── Tab: "Sections" (existing, default, unchanged)
│     │
│     ├── Overdue          [card: name, event, owner, due date, stage, age]
│     ├── Due today        [card: name, event, owner, due date, stage, age]
│     ├── Upcoming (7d)     [card: name, event, owner, due date, stage, age]
│     └── Going cold       [card: name, event, owner, due date, stage, age]
│
└── Tab: "All Follow-Ups" (NEW)
      │
      ├── [rep]     → sees own leads only, no filter control, sorted by due date asc
      │
      └── [manager / super_manager]
            ├── (no rep selected) → sees ALL reps' pending follow-ups, sorted by due date asc
            └── (rep selected in dropdown) → sees only that rep's pending follow-ups, sorted by due date asc
      │
      └── any row past its follow-up date → shown with an "Overdue" visual flag

Both tabs: click a card → /leads/[id]
Both tabs: Snooze / Nudge buttons behave as today
```

State transitions for the rep filter (manager/super_manager only):

```text
[All reps] --select rep X--> [Rep X only] --clear/select "All"--> [All reps]
```

## Acceptance Criteria (Testable Outcomes)

1. **AC1 — Follow-up due date visible on every card.** Every lead card on `/reminders` (both tabs, all sections) displays the lead's follow-up due date.
   - `proven by:` Hybrid DB spec asserting the query layer returns a follow-up date field alongside each lead in `getRemindersQueue`/full-list query results; Agent-Probe confirming the date renders on the card.
   - `strategy:` Hybrid (query correctness) + Agent-Probe (render confirmation, blocked by known e2e-auth gap below)

2. **AC2 — Owner name visible on every card.** Every lead card on `/reminders` (both tabs, all sections) displays the name of the lead's current owner (or a clear "Unassigned" state when `ownerId` is null).
   - `proven by:` Hybrid DB spec asserting the enrichment step correctly maps `ownerId` → owner display name (including the null-owner case); Agent-Probe confirming the name renders on the card.
   - `strategy:` Hybrid + Agent-Probe

3. **AC3 — Existing bucketed view unchanged.** The existing Overdue / Due today / Upcoming / Going cold sections keep their current membership, ordering, and behavior — the only visible change to that tab is the two new fields per card.
   - `proven by:` `bun run test:unit:ci` (existing reminders unit/DB-hybrid suite stays green); Agent-Probe visual comparison.
   - `strategy:` Fully-Automated (regression) + Agent-Probe (visual)

4. **AC4 — New "All Follow-Ups" tab exists and lists every pending follow-up with no 7-day cap.** A lead with a follow-up date further than 7 days out (which is excluded from the bucketed view's Upcoming section) appears in the new tab's list.
   - `proven by:` Hybrid DB spec: a lead with `followUpAt` at +10 days is absent from the bucketed `upcoming` array but present in the new uncapped query result.
   - `strategy:` Hybrid

5. **AC5 — Full list sorted by due date, soonest first, by default.** Given leads with follow-up dates in mixed order, the full list renders in ascending due-date order.
   - `proven by:` Hybrid DB spec asserting the returned array order matches ascending `followUpAt`.
   - `strategy:` Hybrid

6. **AC6 — Reps see only their own leads in the full list, with no filter control.** A rep-role user opening the "All Follow-Ups" tab sees only leads they own (or leads visible to them under the existing `visibilityCondition` scoping rules) and is never shown a rep-selection dropdown.
   - `proven by:` Hybrid DB spec asserting the full-list query applies `visibilityCondition(userId, 'rep')` identically to the existing reminders queue; Agent-Probe confirming the dropdown is absent for a rep session.
   - `strategy:` Hybrid + Agent-Probe

7. **AC7 — Managers/super managers can filter the full list to one specific rep via a dropdown.** A manager selecting a specific rep in the dropdown sees only that rep's pending follow-ups; clearing the selection returns to the full team list.
   - `proven by:` Hybrid DB spec asserting the query, when given an explicit `filterRepId`, narrows results to that rep's owned leads only; Agent-Probe confirming the dropdown interaction and resulting list change.
   - `strategy:` Hybrid + Agent-Probe

8. **AC8 — Overdue items in the full list carry a distinct visual flag.** Any lead in the "All Follow-Ups" list whose follow-up date is in the past is rendered with a visually distinct overdue indicator (e.g., badge/color), independent of the list's single combined (non-bucketed) presentation.
   - `proven by:` Agent-Probe confirming the overdue badge/color appears on a past-due lead and not on a future-due lead in the full list.
   - `strategy:` Agent-Probe

9. **AC9 — Click-through and snooze/nudge parity in the new tab.** Clicking a lead card in the "All Follow-Ups" tab navigates to `/leads/[id]`; snooze and nudge controls behave the same as in the existing bucketed tab.
   - `proven by:` Agent-Probe confirming navigation and snooze/nudge optimistic-update behavior in the new tab.
   - `strategy:` Agent-Probe

10. **AC10 — No regressions to type-safety or lint.** `bun run check` and `bun run lint` both exit 0 after all changes.
    - `proven by:` `bun run check`; `bun run lint`
    - `strategy:` Fully-Automated

## Out Of Scope

- No new route — the "All Follow-Ups" tab lives inside the existing `/reminders` route (not a separate URL/page).
- No changes to the snooze 3-day rule, the snooze API contract (`/api/leads/[id]/snooze`), `getTodayQueue`, `computeAge`, or the `Urgency` type.
- No changes to the existing 7-day-capped bucketed view's membership, ordering, or section semantics beyond adding the two display fields.
- No multi-rep selection in the manager filter (single rep at a time only, per user decision) — a "select multiple reps" or saved-filter feature is not in scope.
- No new sort options beyond "due date ascending" (e.g., sort by owner, by stage, by age) — those are not requested and are explicitly deferred.
- No changes to how `visibilityCondition` scopes managers/super_managers (they already see everything) — this SPEC only adds an optional narrowing filter on top of that existing scope.
- No schema/migration changes are assumed necessary (owner name is derivable via existing `crmUsers.name` + `crmLeads.ownerId` FK; how that lookup is implemented is an INNOVATE/PLAN decision, not a SPEC decision).
- No automated end-to-end (Playwright) proof of render/interaction behavior in this cycle — see Known Gap below.
- No changes to `/leads`, `/pipeline`, `/unassigned`, or other routes' use of `LeadListRow` beyond what's needed to support the new due-date/owner fields on shared card component(s), if that's how INNOVATE chooses to implement it.

## Constraints

- Must reuse the existing owner-scoping rule (`visibilityCondition(userId, role)` in `src/lib/server/db/leads.ts`) for the full list's default (unfiltered) view — reps get their existing scoped view; managers/super_managers get everything, same as today.
- The manager rep-filter is additive on top of `visibilityCondition`, not a replacement for it.
- Must not duplicate the 7-day window logic incorrectly — the full list is a superset of the bucketed view's members (anything with a pending follow-up, not just the next 7 days).
- Follow-up due date and owner name must be visible in **both** tabs, not just the new one (per REM-1 requirement covering the whole page).
- Must preserve existing snooze/nudge behavior and optimistic UI update pattern already used on `/reminders`.
- Owner name lookup must correctly handle a `null` `ownerId` (unassigned lead) without erroring.
- Follows repo conventions: server-side DB access only, Svelte 5 runes, soft-delete filtering (`deletedAt IS NULL`) already present in the underlying queries.

## Open Questions

None. Prior open items were resolved by explicit user decision (enrich existing card layout rather than a new table component; build the full list as a second tab, not a new route; manager filter is a single-rep dropdown, not an all-vs-mine toggle). Minor unspecified details (default sort direction, "Unassigned" label copy for null-owner leads) are settled above as reasonable product defaults consistent with existing `/reminders` conventions; INNOVATE/PLAN may adjust copy without needing a new SPEC round.

## Background / Research Findings

**Current implemented state (REM-1 mechanics, already done):**
- `getRemindersQueue(userId, role)` in `src/lib/server/db/leads.ts` (~line 1490) returns `{ overdue, due, upcoming, cold }` — each `Lead[]`, built from `getTodayQueue`.
- "Upcoming" = `followUpAt` within `(now, now+7d]`; explicitly excludes `due` and `cold` urgencies to avoid dual-bucket membership.
- Owner-scoping already works via `visibilityCondition(userId, role)` (`src/lib/server/db/leads.ts` ~line 204): managers/super_managers bypass scoping (`sql\`true\``); reps see only leads where they are the owner, visibility is `'everyone'`, `ownerId` is null, or an explicit `crmLeadVisibilityGrants` row exists for them. This is real DB-level scoping — already correct for both "reps see own by default" and "managers see all."
- Click-through to `/leads/[id]` already implemented in `LeadListRow.svelte` (`src/lib/components/leads/LeadListRow.svelte`) for both mobile and desktop layouts.
- Route: `src/routes/reminders/+page.server.ts` + `+page.svelte`, currently renders 4 color-coded sections via `LeadListRow.svelte`.

**Gap 1 — missing columns (REM-1):** `LeadListRow.svelte` currently renders: platform badge, stage chip, age badge, future-events badge, lead name, event line (name + date), siblings count. It never renders follow-up due date or owner name. `Lead.ownerId` exists (`src/lib/types/index.ts` line 59, FK to `crmUsers.id`) but there is no owner display-name enrichment anywhere in the query layer or the `Lead` type. `crmUsers` (schema.ts ~line 96) has a `name: text('name').notNull()` column, so the display name is a straightforward join/lookup, not a new field to invent. **User decision: enrich the existing card (`LeadListRow`) — do not build a new table component.**

**Gap 2 — REM-2 almost entirely unbuilt:** No full/uncapped pending-follow-up list exists; no sort-by-due-date option (the buckets are pre-sorted only within each bucket, not exposed as a full combined sortable list); no owner filter of any kind exists on `/reminders`. **User decision: build as a second tab on the existing `/reminders` route** (not a new route). **User decision: owner filter is a manager-facing single-rep dropdown** (not a toggle) — reps get no filter control and always see only their own leads.

**Gap 3 — overdue visual flag for the new combined list:** Today, "overdue" is expressed purely by section placement (the Overdue bucket). The new full list is not bucketed the same way (it's one combined, sorted list), so it needs its own inline indicator marking overdue leads directly (e.g., a badge or distinct color), independent of which of the 4 traditional buckets a lead would have fallen into.

**Known project-wide gap (dependency, not solved here):** No shared Playwright authenticated-session fixture exists yet (tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Every e2e spec hitting a protected route currently self-skips via `test.skip()` guards, per `process/context/tests/all-tests.md` §Known Gaps and §Debugging Quick Reference. This blocks fully-automated e2e proof of render and interaction ACs (AC1, AC2, AC6 render check, AC7 UI interaction, AC8, AC9) in this cycle — those close via Agent-Probe / manual confirmation until the fixture lands, same pattern already accepted for `reminders-upcoming-section_03-07-26` (predecessor plan, CODE DONE but not yet AC-verified for the same reason).

**Related precedent — `reminders-upcoming-section_03-07-26` plan:** This prior plan added the `due`/`upcoming` buckets to `getRemindersQueue` and is CODE DONE (EVL green 03-07-26) but NOT yet AC-verified — it is a precondition/dependency for this SPEC, not something to re-derive. This SPEC builds on top of its four-bucket return shape; it does not modify `getTodayQueue`, `computeAge`, or the `Urgency` type, consistent with that plan's constraints.

**Test-context grounding (`process/context/tests/all-tests.md`):** Vitest (`bun run test:unit` / `test:unit:ci`) is the Fully-Automated/Hybrid tier for server-side query logic (DB-gated specs use `describe.skipIf(SKIP_DB)`, self-skip without `DATABASE_URL`). Playwright (`bun run test:e2e`) is the intended tier for full render/interaction flows but currently self-skips against protected routes site-wide (no auth fixture) — this is the single highest-leverage test-infra gap in the repo per that doc, already affecting reminders, calendar, and other features identically.
