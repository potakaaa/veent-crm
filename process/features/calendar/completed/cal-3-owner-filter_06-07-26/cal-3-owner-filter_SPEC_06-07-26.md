---
name: spec:cal-3-owner-filter
description: "SPEC for CAL-3 — Calendar owner filter: reps see only their own leads; managers get a rep dropdown to narrow the calendar to one rep (GitHub #208)"
date: 06-07-26
feature: calendar
---

# Calendar — My Leads / Owner Filter (GitHub #208, CAL-3)

Date: 06-07-26
Status: SPEC — locked, pending INNOVATE/PLAN

## Summary

Right now, every user's calendar mixes together everyone's go-live milestones and event-start
dates regardless of who owns the lead — a rep's calendar shows the full team's milestones
alongside their own follow-ups. The same scoping inconsistency exists for managers who want to
quickly check one specific rep's workload instead of the entire team's. This feature brings the
calendar in line with how the rest of the app (Reminders, Today queue) handles data scoping:
reps always see only their own leads' entries, and managers get a dropdown to filter the
calendar down to a single rep's view. Meetings remain team-wide at all times — they are never
filtered by owner.

## User Stories / Jobs To Be Done

1. **US1 (rep):** As a sales rep, I want the calendar to show only follow-ups and milestones for leads I own by default, so my calendar isn't cluttered with other reps' work.
2. **US2 (manager / super_manager):** As a manager, I want to see the full team's follow-ups and milestones on the calendar by default, so I can monitor everyone's workload in one view.
3. **US3 (manager / super_manager):** As a manager, I want to narrow the calendar down to a single rep using a dropdown, so I can review one rep's lead activity without the whole team's data in the way.
4. **US4 (manager / super_manager):** As a manager, I want to be able to view only my own leads on the calendar (the same view a rep gets), so I can check my personal pipeline without seeing the rest of the team.
5. **US5 (any user):** As any user, I want meetings to always show on the calendar regardless of whose leads I am viewing, so I never lose visibility of shared team meetings when switching filters.

## What The User Wants (Behavioral Outcomes)

- When a rep opens the calendar, follow-ups and milestones (go-live dates, event-start dates) shown are restricted to leads that rep owns. No filter control is visible.
- When a manager opens the calendar, follow-ups and milestones for all leads are shown by default. A rep-selection dropdown appears that lets the manager narrow the view to one specific rep at a time.
- Selecting a rep in the manager dropdown updates the calendar to show only that rep's follow-ups and milestones. Clearing the selection (or selecting "All reps") returns to the full team view.
- A manager can select themselves in the dropdown to see their own leads only — the same view a rep would get.
- The selected rep (if any) is preserved in the page URL so the filtered view is bookmarkable and survives a page refresh.
- Meetings are never affected by the owner filter — every user always sees all scheduled team meetings on every view of the calendar, whether a rep filter is active or not.
- The four calendar entry types (follow-ups, go-live milestones, event-start milestones, meetings) keep their existing visual styling. No new entry types are introduced.
- Switching between month and week views preserves the active rep filter.

## Flow / State Diagram

```
[User opens /calendar]
        |
        +--- [role = rep] ----------------------------------+
        |                                                   |
        |    No filter control shown.                       |
        |    follow-ups:  own leads only                    |
        |    go-live:     own leads only                    |
        |    event-start: own leads only                    |
        |    meetings:    all team (unchanged)              |
        |                                                   |
        +--- [role = manager / super_manager] -------------+
                                                           |
             Rep dropdown visible: "All reps" (default)   |
             follow-ups:  all reps                         |
             go-live:     all reps                         |
             event-start: all reps                         |
             meetings:    all team (unchanged)             |
                    |
                    v
           [Manager selects rep X from dropdown]
                    |
                    v
            URL: ?repId=<rep-X-uuid>
            follow-ups:  rep X only
            go-live:     rep X only
            event-start: rep X only
            meetings:    all team (unchanged, always)
                    |
                    +--- [Manager selects own uuid] → same as rep X but for manager's leads
                    |
                    +--- [Manager clears selection] → back to "All reps" default
                                                      URL: ?repId removed

Month/week toggle: preserves ?repId param in URL (no reset on view switch)
```

State transitions for the rep filter (manager only):

```
[No repId param]   -- select rep X  --> [?repId=<uuid-X>]
[?repId=<uuid-X>]  -- select rep Y  --> [?repId=<uuid-Y>]
[?repId=<uuid-X>]  -- clear / "All" --> [no repId param]
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — Reps see only their own leads' follow-ups, go-live dates, and event-start dates.**
A rep with owned leads that have follow-ups, go-live dates, and event-start dates sees those entries on the calendar. Entries from leads owned by a different rep do not appear on the calendar for the first rep.
- `proven by:` Hybrid: unit test asserting `getFollowUpsInRange`, `getGoLiveDatesInRange`, and `getEventDatesInRange` with a rep user ID return only that rep's owned leads' entries; a second rep's entries are absent.
- `strategy:` Hybrid

**AC2 — Reps see no owner-filter control.**
When signed in as a rep, the calendar page renders with no rep-selection dropdown or filter control.
- `proven by:` Agent-Probe: inspect rendered calendar page as a rep session and confirm no dropdown matching the rep-filter pattern is present.
- `strategy:` Agent-Probe (blocked by shared Playwright auth fixture — see Known Gap)

**AC3 — Managers see all reps' follow-ups, go-live dates, and event-start dates by default (no repId param).**
When a manager opens `/calendar` with no `?repId` parameter, follow-ups and milestones from all reps' leads appear.
- `proven by:` Hybrid: unit test asserting `getFollowUpsInRange`, `getGoLiveDatesInRange`, and `getEventDatesInRange` with a manager user and no `filterRepId` return entries from leads owned by multiple different reps.
- `strategy:` Hybrid

**AC4 — Manager rep dropdown shows the active rep list.**
When signed in as a manager, a rep-selection dropdown is visible on the calendar page. The list of options in the dropdown matches the set of active reps returned by `listActiveReps()`.
- `proven by:` Agent-Probe: inspect the calendar page as a manager session and verify the dropdown is present and populated with rep names from the active reps list.
- `strategy:` Agent-Probe (blocked by shared Playwright auth fixture — see Known Gap)

**AC5 — Selecting a rep in the dropdown filters follow-ups and milestones to that rep only.**
When a manager selects a specific rep from the dropdown, the calendar shows only that rep's follow-ups, go-live dates, and event-start dates. Entries from other reps disappear.
- `proven by:` Hybrid: unit test asserting `getFollowUpsInRange`, `getGoLiveDatesInRange`, and `getEventDatesInRange` with a manager user and an explicit `filterRepId` return only leads owned by that rep.
- `strategy:` Hybrid

**AC6 — Selected rep is reflected in the URL as `?repId=<uuid>`.**
After a manager selects a rep, the page URL updates to include `?repId=<selected-rep-uuid>`. Refreshing the page with that URL applied re-applies the same filter without losing the selection.
- `proven by:` Agent-Probe: after rep selection, confirm the URL param is set and a page reload renders the same filtered state.
- `strategy:` Agent-Probe (blocked by shared Playwright auth fixture — see Known Gap)

**AC7 — Clearing the rep filter returns to the full team view and removes `?repId` from the URL.**
After a manager clears the rep selection (or selects "All reps"), all reps' entries return to the calendar and `?repId` is absent from the URL.
- `proven by:` Agent-Probe: confirm dropdown clear restores full-team entries and URL reverts.
- `strategy:` Agent-Probe (blocked by shared Playwright auth fixture — see Known Gap)

**AC8 — Meetings always show for all users regardless of the rep filter.**
When no filter is active, meetings appear. When a rep filter is active (any `?repId`), meetings still appear — the meeting count on visible days does not change when `?repId` is set or cleared.
- `proven by:` Hybrid: unit test asserting that the meetings query (`listAllMeetings` equivalent scoped to date range) is called without any `filterRepId` argument regardless of whether `filterRepId` is set on the page; meetings entries in the data returned are independent of the rep filter.
- `strategy:` Hybrid

**AC9 — Month/week view toggle preserves the active rep filter.**
Switching the calendar between month view and week view while a rep filter is active (`?repId` set) keeps `?repId` in the URL and the filter remains applied after the view change.
- `proven by:` Agent-Probe: confirm `?repId` param survives a view toggle interaction.
- `strategy:` Agent-Probe (blocked by shared Playwright auth fixture — see Known Gap)

**AC10 — No regressions to type-safety or lint.**
`bun run check` and `bun run lint` both exit 0 after all changes.
- `proven by:` `bun run check`; `bun run lint`
- `strategy:` Fully-Automated

**AC11 — Existing calendar entry visual styling unchanged.**
Follow-up (amber), go-live (green), event-start (purple), and meeting (blue) chip colors and styles are unmodified by this change.
- `proven by:` Agent-Probe: visual inspection confirms chip colors match pre-filter behavior.
- `strategy:` Agent-Probe

## Out Of Scope

- No owner filter on meetings — meetings remain team-wide always and are never narrowed by `?repId`.
- No "My Leads" toggle button for reps — reps always see only their own leads; there is no toggle to switch to a team-wide view. This is consistent with how Reminders and the Today queue work.
- No multi-rep selection — one rep at a time in the manager dropdown, not multi-select.
- No saved / persistent filter preference — the filter lives in the URL only; closing the browser resets it.
- No changes to how follow-up, go-live, or event-start entries are displayed (chips, click-through, colors) — this SPEC changes only the data scoping, not the rendering.
- No changes to the meetings query, the meetings data shape, or the meeting detail click-through.
- No changes to any other route (`/leads`, `/reminders`, `/pipeline`, etc.) — this filter is calendar-only.
- No role other than `manager` / `super_manager` gets the rep dropdown — `rep` users never see it.
- No filter by event category, stage, or date range beyond the existing month/week window.
- No "All reps" label text is locked by this SPEC — exact copy is an INNOVATE/PLAN decision.

## Constraints

- Must mirror the security boundary already enforced by the `/reminders` page: rep `userId` is never passed as a query param from a rep's own session; only manager sessions may supply `?repId`. If a rep manually adds `?repId=<other-uuid>` to the URL, the server-side route must ignore or drop it — repId is only honored when `isManager = true` server-side.
- `isManager` is defined as `role === 'manager' || role === 'super_manager'` (same definition used by the reminders rep filter — must be consistent).
- `listActiveReps()` is the authoritative source for the manager dropdown options — no new query needed; it is already used by reminders.
- The `navigate(patch)` pattern already present in `calendar/+page.svelte` (applies URL param patches via `goto()`) is the established mechanism for adding `?repId` — the SPEC does not prescribe how exactly it is wired, but it must use the same URL-param architecture the rest of the calendar and reminders use.
- No schema changes required — `ownerId` is already present on `crm_leads` and all three query functions (`getFollowUpsInRange`, `getGoLiveDatesInRange`, `getEventDatesInRange`) already have an identified insertion point for `filterRepId`.
- Soft-delete filter (`deletedAt IS NULL`) already present in all underlying queries — must not be removed or bypassed.
- Follows repo conventions: server-side DB access only (`+page.server.ts`); Svelte 5 runes; no Superforms.

## Open Questions

None. All three key design questions from research are resolved by explicit decision recorded in this SPEC:

- **Toggle vs. dropdown:** Mirrors reminders pattern — reps always scoped to own (no toggle), managers get dropdown. No separate "My Leads" toggle button.
- **Meetings in filter:** Meetings excluded from owner filter — always team-wide.
- **Manager "my leads" URL:** `?repId=<own-uuid>` — manager selects themselves from the dropdown; no special URL value.

## Background / Research Findings

**Pattern to mirror — `/reminders` rep filter:**
The `/reminders` page already implements the same ownership scoping model: `isManager = role === 'manager' || role === 'super_manager'` determines whether a rep-filter dropdown appears. Reps always see only their own leads; managers see all by default and can narrow via `?repId=<uuid>`. `listActiveReps()` supplies the dropdown options (`{ id, name }[]` for `role='rep' AND active=true`). This SPEC adopts the identical model for the calendar.

**Four calendar entry sources and what changes:**

| Source | Current scoping | Change |
|---|---|---|
| Follow-ups (`getFollowUpsInRange`) | Hard-scoped to `ownerId = signed-in user` | Accepts optional `filterRepId` for manager override |
| Go-live milestones (`getGoLiveDatesInRange`) | Team-wide + visibilityCondition | Add optional `filterRepId` owner-narrowing predicate |
| Event-start milestones (`getEventDatesInRange`) | Team-wide + visibilityCondition | Add optional `filterRepId` owner-narrowing predicate |
| Meetings (`listAllMeetings` range variant) | Team-shared, no scoping (per calendar SPEC AC2) | No change — meetings are never filtered by owner |

**URL-param architecture:** Calendar `+page.svelte` already has a `navigate(patch)` function that applies patches to URLSearchParams then calls `goto()`. Adding `?repId` slots directly into this pattern.

**DB helpers already available:** `listActiveReps()` returns `{ id, name }[]` and is already imported/used by the reminders page — no new query needed.

**Known project-wide gap (dependency, not solved here):** No shared Playwright authenticated-session fixture exists yet (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Every e2e spec hitting a protected route currently self-skips. AC2, AC4, AC6, AC7, AC9, and AC11 close via Agent-Probe / manual confirmation until the fixture lands — the same pattern accepted across calendar (prior spec AC2, AC3), reminders, and ux-enhancement features.

**Active calendar work in flight:** Two active plans (`cal-2-two-calendar-markers_06-07-26` and `calendar-golive-events_06-07-26`) are in progress on the same calendar feature. CAL-3 depends on the `getGoLiveDatesInRange` and `getEventDatesInRange` functions those plans introduce — this SPEC is sequenced after those plans land.

**Test-context grounding:** Vitest (`bun run test:unit:ci`) is the Fully-Automated / Hybrid tier for server-side query-scoping logic. Query-layer tests (`filterRepId` acceptance, owner narrowing, meetings invariance) are Hybrid specs that self-skip without `DATABASE_URL`. Agent-Probe covers render/interaction AC verification until the Playwright auth fixture lands.
