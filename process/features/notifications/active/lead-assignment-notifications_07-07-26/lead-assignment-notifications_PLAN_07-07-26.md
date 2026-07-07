---
name: plan:lead-assignment-notifications
description: "In-app notification to an AE when a manager reassigns a lead's ownerId to them (v1, in-app only)"
date: 07-07-26
feature: notifications
metadata:
  node_type: memory
  type: plan
---

# Lead Assignment Notifications — Plan

**Date**: 07-07-26
**Complexity**: SIMPLE
**Feature**: notifications
**Status**: VALIDATED (Gate: CONDITIONAL — see Validate Contract; 5 execute-agent instructions E1-E5, 0 plan-text rewrites, ready for EXECUTE)

## TL;DR

When a manager reassigns a lead (`reassignLead()` in `src/lib/server/db/leads.ts`, called only from
the manager-gated `PATCH /api/leads/[id]/owner`), insert a `crm_notifications` row for the new owner
in the same transaction that already writes the `crm_lead_history` row. A single `readAt` column
doubles as both "read" and "dismissed" state — no separate `dismissedAt`. The existing sidebar
`counts` object (`getNavCounts`) gains an `unread` field driving a new bell nav item that links to a
new `/notifications` flat list page (newest first, unread bold, dismiss button per row → `PATCH
/api/notifications/[id]/read`). Because the insert lives only inside `reassignLead()` — never inside
`claimLead`/`unclaimLead`/bulk-claim — self-claims from Up for Grabs structurally never generate a
notification (AC4), with no runtime "who changed it" detection needed. v1 is in-app only; email via
Resend is an explicit v2 follow-up, out of scope here.

## Overview

`crm_leads.ownerId` changes through exactly one manager-only code path today:
`reassignLead(id, ownerId, actorId)` in `src/lib/server/db/leads.ts` (L1319-1359), called only from
`src/routes/api/leads/[id]/owner/+server.ts`, a `PATCH` endpoint gated by
`isManagerRole(locals.user.role)`. Self-service owner changes (`claimLead`, `unclaimLead`, and
`bulk-claim`) are separate functions and are never touched by this plan — that separation is what
guarantees AC4 without extra logic. This plan adds a new `crm_notifications` table (migration
`0026_*`), a small new `src/lib/server/db/notifications.ts` DB module, a notification insert wired
into `reassignLead()`'s existing transaction, an `unread` count added to `getNavCounts()` (already
consumed by `+layout.server.ts` → `AppSidebar.svelte`'s existing badge-pill rendering), a bell nav
item, a `/notifications` list page reusing the Reminders page's optimistic-dismiss pattern, and a
`PATCH /api/notifications/[id]/read` endpoint. No client polling — the badge/list are correct on next
page load only, consistent with the existing repo-wide absence of any polling mechanism.

## Goals

1. An AE sees an in-app notification (banner/badge + list entry) when a manager assigns a lead to them.
2. The notification links straight to the lead detail page.
3. Read/dismiss is one action, one column (`readAt`), persisted server-side.
4. Self-claims (Up for Grabs) never create a notification — guaranteed structurally, not by runtime detection.
5. No schema/scope creep: `leadId` nullable now for future entity types, but this plan only ever writes `type: 'lead_assigned'`.
6. No new dependency, no email send (v2), no polling/live mechanism.

## Scope

**In scope:** `crm_notifications` table + migration; notification insert inside `reassignLead()`;
`getNavCounts()` unread count; sidebar bell nav item + badge; `/notifications` list page; mark-read
API endpoint.

**Out of scope (explicit):** Resend email delivery (v2 follow-up, not started here); any change to
`claimLead`/`unclaimLead`/bulk-claim; a popover/dropdown notification tray (v1 is a full list page,
not a popover); bulk "mark all as read"; live polling/websockets; notifications for any entity type
other than leads (the `leadId`/nullable design is forward-looking schema only, not exercised by this
plan); pre-existing `drizzle/0014_agreements_fields.sql` journal drift (flagged, not fixed here).

## Locked Design Decisions

1. **Single `readAt` column doubles as read AND dismissed state.** Per the spec's exact schema (no
   `dismissedAt`). "Marking as read" and "dismissing" are the same user action: `PATCH
   .../read` sets `readAt = now()`. Simpler than tracking two independent booleans for behavior the
   spec never distinguishes.
2. **Notification insert lives ONLY inside `reassignLead()`**, in the same `db.transaction` that
   already writes the `crm_lead_history` row (`src/lib/server/db/leads.ts` L1346-1352) — right after
   it. This is the single existing call site gated to managers only
   (`src/routes/api/leads/[id]/owner/+server.ts` L14 `isManagerRole` check). `claimLead` (L641-669),
   `unclaimLead` (L671-699), and bulk-claim are untouched, which is what makes AC4 (no self-assign
   notification) hold structurally rather than via a runtime "was this a self-claim?" check.
3. **Nav UI: extend the existing `counts` badge pattern + a plain bell nav item, no popover.**
   `getNavCounts(userId, role)` (`leads.ts` L1750-1776) already returns `{ overdue, unassigned }`,
   flows through `+layout.server.ts` → `+layout.svelte` → `AppSidebar.svelte`'s existing
   `badge?: number` pill rendering (both `navButton` and `deskNav` snippets, L85-94 / L197-211). Add a
   3rd field `unread` and one new `NavItem` (`{ href: '/notifications', label: 'Notifications', icon:
   'bell', badge: counts.unread || undefined }`) to the `work` array — the `bell` icon already exists
   in `Icon.svelte` (L28). No new component needed for the badge itself; a full `/notifications` list
   page is built instead of a popover (kept simple per spec, v1).
4. **`/notifications` page: single flat list, newest first, unread visually distinguished, no
   bucketing.** Deliberately NOT the reminders'-style multi-section (overdue/due/upcoming/cold)
   pattern — YAGNI, this is one notification type today (`lead_assigned`). Reuses the Reminders
   page's proven optimistic-dismiss shape (`shadowX = removeFromList(...)`, `liveMessage` sr-only
   announcement, rollback-on-failure) collapsed to one list instead of four buckets.
5. **Migration number `0026_*`.** Current highest is `0025_mature_aaron_stack.sql` (journal `idx: 25`
   matches). Drizzle-kit auto-names the file on `db:generate` (e.g. `0026_<random-adjective-noun>.sql`)
   — do not hand-name it. Pre-existing unrelated drift (`drizzle/0014_agreements_fields.sql` missing
   a journal entry) is noted per CLAUDE.md's Drizzle conventions section and explicitly NOT fixed by
   this plan; confirm it before running `db:generate` so it isn't mistaken for new drift this plan caused.
6. **FK `onDelete` behavior (new decision, not in the spec table verbatim — reasoned default):**
   `userId` → `crmUsers.id` `onDelete: 'cascade'` (a deleted user's notifications are meaningless);
   `leadId` → `crmLeads.id` `onDelete: 'cascade'` (a hard-deleted lead's assignment notification is
   meaningless — note: leads are soft-deleted in practice via `deletedAt`, so this FK cascade is a
   defensive rule for the rare hard-delete path, not the normal flow).
7. **No Zod schema needed for the mark-read action.** Per the repo's `safeParse()` + `fetch()`
   convention, but this action takes no user input (no body) — it is a bare `PATCH` keyed off the
   URL param and the session user, exactly like the ownership check pattern already used in
   `snooze/+server.ts`. Ownership enforced server-side: a notification may only be marked read by its
   own `userId`.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `crmNotifications` pgTable (new section) + `export type CrmNotification`. |
| `drizzle/0026_*.sql` (+ `drizzle/meta/_journal.json`) | New migration generated by `bun run db:generate` for the `crm_notifications` table. |
| `src/lib/types/index.ts` | Add `export interface Notification { id, userId, leadId, leadName, type, message, readAt, createdAt }` (thin, mirrors the `Lead`/`Activity` interface style already in this file). |
| `src/lib/server/db/notifications.ts` (new) | `createLeadAssignedNotification(tx, userId, leadId, leadName)` (used inside `reassignLead`'s transaction), `getUnreadNotificationCount(userId)`, `listNotifications(userId)`, `markNotificationRead(id, userId)`. |
| `src/lib/server/db/leads.ts` | Import `crmNotifications`; in `reassignLead()`, widen the initial `existing` select to also grab `name`, and after the `crm_lead_history` insert (L1346-1352), insert a `crm_notifications` row via the new helper inside the same `tx`. Extend `getNavCounts()` (L1750-1776) to also return `unread` (a `COUNT(*)` over `crm_notifications WHERE user_id = userId AND read_at IS NULL`), run in the existing `Promise.all`. |
| `src/routes/+layout.server.ts` | Update the fallback object (`{ overdue: 0, unassigned: 0 }` → `{ overdue: 0, unassigned: 0, unread: 0 }`) to match the widened `getNavCounts()` return type. |
| `src/lib/components/layout/AppSidebar.svelte` | Widen the `counts` prop type to include `unread: number`; add a `Notifications` `NavItem` (bell icon, badge=`counts.unread`) to the `work` array. |
| `src/routes/notifications/+page.server.ts` (new) | `load`: redirect to `/login` if no session; call `listNotifications(locals.user.id)`. |
| `src/routes/notifications/+page.svelte` (new) | Flat list, newest first; unread rows bold/highlighted; each row links to `/leads/[leadId]`; dismiss/mark-read button per row using the Reminders page's optimistic `removeFromList`/rollback/`liveMessage` pattern collapsed to one list. |
| `src/routes/api/notifications/[id]/read/+server.ts` (new) | `PATCH`: 401 if no session; call `markNotificationRead(params.id, locals.user.id)`; 404 if not found/not owned; else `json(result)`. |
| `src/tests/notifications-db.spec.ts` (new) | DB-free pure-mapper tests where feasible + `SKIP_DB`-gated Hybrid tests mirroring `leads-db.spec.ts` / `pipeline-db.spec.ts` conventions for the live-DB-dependent functions. |
| `src/tests/leads-db.spec.ts` / `src/tests/pipeline-db.spec.ts` (existing) | No code change — but their existing `reassignLead(...)` calls (L407 and L233/248/262/278 respectively) now also insert a `crm_notifications` row per invocation; these are `SKIP_DB`-gated Hybrid tests already requiring a live, migrated DB, so no new gate is needed, only confirmation they still pass once `0026` is migrated in the test DB. |

## Public Contracts

- `crm_notifications` table — new, matches the spec's schema verbatim (`id`, `userId` FK, `leadId`
  FK nullable, `type` text, `message` text, `readAt` nullable timestamp, `createdAt`).
- `reassignLead(id, ownerId, actorId)` — return type (`Promise<Lead | null>`) is UNCHANGED; the
  function now has an additional internal side effect (notification insert) inside its existing
  transaction. Backward compatible for all existing callers (`owner/+server.ts`, both spec files).
- `getNavCounts(userId, role)` — return type widens from `{ overdue, unassigned }` to `{ overdue,
  unassigned, unread }`. Backward compatible in the sense that all current call sites (`+layout.server.ts`,
  `/api/nav-counts/+server.ts`) destructure or pass through the whole object — neither needs a code
  change beyond `+layout.server.ts`'s fallback literal.
- `PATCH /api/notifications/[id]/read` — new endpoint. 401 unauthenticated, 404 if the notification
  doesn't exist or isn't owned by the caller, 200 + updated row on success.
- `AppSidebar.svelte` — `counts` prop shape widens (`unread: number` added); no breaking change to
  existing consumers since it's the same object literal source (`+layout.server.ts`).

## Blast Radius

- 10 touched/created files (schema + 1 migration + types + 1 new DB module + 1 modified DB module +
  1 modified layout loader + 1 modified sidebar component + 2 new route files + 1 new API route + 1
  new test file), one package (SvelteKit app), plus zero-code-change confirmation on 2 existing spec
  files. Risk class: **schema/migration** (new table — non-destructive, additive only, no existing
  column touched) + **transactional write path** (extends an existing manager-gated mutation's
  transaction) + no auth/permission logic change (notification ownership check is a simple
  equality, mirroring the existing `snooze` pattern) + no billing surface.
- Non-skippable VALIDATE rationale: this plan adds a new table + migration (schema surface) and
  modifies a transaction on an existing manager-only mutation path (`reassignLead`) — worth a
  breaking-changes/test-coverage look before EXECUTE, per this repo's Drizzle-migration conventions
  (journal drift check) and the general schema-change gate.

## Implementation Checklist

1. `src/lib/server/db/schema.ts` — add a new section (near `crm_lead_history`, after it, following
   the same comment-banner convention) defining `crmNotifications`:
   ```ts
   export const crmNotifications = pgTable(
       'crm_notifications',
       {
           id: uuid('id').primaryKey().defaultRandom(),
           userId: uuid('user_id')
               .notNull()
               .references(() => crmUsers.id, { onDelete: 'cascade' }),
           leadId: uuid('lead_id').references(() => crmLeads.id, { onDelete: 'cascade' }),
           type: text('type').notNull(),
           message: text('message').notNull(),
           readAt: timestamp('read_at', { withTimezone: true }),
           createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
       },
       (t) => [
           index('crm_notifications_user_idx').on(t.userId),
           index('crm_notifications_user_unread_idx').on(t.userId, t.readAt)
       ]
   );
   ```
   Add `export type CrmNotification = typeof crmNotifications.$inferSelect;` next to the other
   `export type Crm*` lines (after L493).
2. Before running `db:generate`: confirm `drizzle/meta/_journal.json`'s last `idx` (25) matches the
   highest `.sql` filename (`0025_mature_aaron_stack.sql`) and note (do not fix) the pre-existing
   `0014_agreements_fields.sql` journal-drift already on record
   (`process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`). Run `bun run
   db:generate` — expect a new `0026_<random>.sql` adding `crm_notifications` + its two indexes. Run
   `bun run db:migrate` against a reachable `DATABASE_URL` (dev/test DB) to apply it.
3. `src/lib/types/index.ts` — add, near the other lead-adjacent interfaces:
   ```ts
   export interface Notification {
       id: string;
       userId: string;
       leadId: string | null;
       leadName: string | null;
       type: string;
       message: string;
       readAt: string | null;
       createdAt: string;
   }
   ```
4. `src/lib/server/db/notifications.ts` (new file) — server-side DB module, same file-header
   docstring convention as `leads.ts`:
   - `createLeadAssignedNotification(tx: Tx, userId: string, leadId: string, leadName: string):
     Promise<void>` — `await tx.insert(crmNotifications).values({ userId, leadId, type:
     'lead_assigned', message: \`${leadName} has been assigned to you\` });`. Accepts the Drizzle
     transaction object (typed via `Parameters<Parameters<typeof db.transaction>[0]>[0]` or an
     equivalent local `Tx` type alias) so it composes inside `reassignLead`'s existing transaction
     rather than opening a second one.
   - `getUnreadNotificationCount(userId: string): Promise<number>` — `SELECT COUNT(*) FROM
     crm_notifications WHERE user_id = userId AND read_at IS NULL`.
   - `listNotifications(userId: string): Promise<Notification[]>` — left-join `crmLeads` for
     `leadName`, `ORDER BY created_at DESC`, cap `LIMIT 200` (reasonable bound; spec does not require
     pagination, a v1 flat list does not need to be literally unbounded).
   - `markNotificationRead(id: string, userId: string): Promise<Notification | null>` — `UPDATE
     crm_notifications SET read_at = now() WHERE id = id AND user_id = userId RETURNING *`; return
     `null` if no row updated (not found or not owned — the endpoint maps this to 404, not
     distinguishing "wrong owner" from "doesn't exist" to avoid leaking existence to a non-owner).
5. `src/lib/server/db/leads.ts`:
   - Import `crmNotifications` from `./schema` and `createLeadAssignedNotification` from
     `./notifications`.
   - In `reassignLead()` (L1319-1359): widen the initial select at L1324-1328 from `{ ownerId:
     crmLeads.ownerId }` to `{ ownerId: crmLeads.ownerId, name: crmLeads.name }`.
   - Immediately after the `crm_lead_history` insert (L1346-1352), inside the same `tx`, add: `await
     createLeadAssignedNotification(tx, ownerId, id, existing.name);`.
   - Extend `getNavCounts()` (L1750-1776): add a third parallel query in the existing `Promise.all`
     — `getUnreadNotificationCount(userId)` — and return `{ overdue, unassigned, unread }`. Update the
     function's return type annotation to `Promise<{ overdue: number; unassigned: number; unread:
     number }>`.
6. `src/routes/+layout.server.ts` — update the fallback object at L9 from `{ overdue: 0, unassigned:
   0 }` to `{ overdue: 0, unassigned: 0, unread: 0 }`.
7. `src/lib/components/layout/AppSidebar.svelte` — widen the `counts` prop type (L25) to `{ overdue:
   number; unassigned: number; unread: number }`; add to the `work` array (after the existing
   `reminders` entry, L54): `{ href: '/notifications', label: 'Notifications', icon: 'bell', badge:
   counts.unread || undefined }`.
8. `src/routes/notifications/+page.server.ts` (new):
   ```ts
   export const load: PageServerLoad = async ({ locals }) => {
       if (!locals.user) throw redirect(303, '/login');
       const notifications = await listNotifications(locals.user.id);
       return { notifications };
   };
   ```
9. `src/routes/notifications/+page.svelte` (new) — mirror the Reminders page's optimistic pattern
   collapsed to one list: `let shadow = $derived(data.notifications)`; `dismissing:
   $state<Record<string, boolean>>`; a `dismiss(n)` fn that optimistically `removeFromList`s the row,
   `PATCH`es `/api/notifications/${n.id}/read`, rolls back + toasts on failure; sr-only `liveMessage`
   announcement ("Dismissed notification" / "Dismiss failed"). Each row: bold/highlighted styling
   when `!n.readAt`, message text, a link (`<a href="/leads/{n.leadId}">`) when `leadId` is present,
   and a dismiss button. `EmptyState` when the list is empty ("No notifications yet").
10. `src/routes/api/notifications/[id]/read/+server.ts` (new):
    ```ts
    export const PATCH: RequestHandler = async ({ params, locals }) => {
        if (!locals.user) throw error(401, 'Unauthorized');
        const result = await markNotificationRead(params.id, locals.user.id);
        if (!result) throw error(404, 'Notification not found');
        return json(result);
    };
    ```
11. `src/tests/notifications-db.spec.ts` (new) — mirror `leads-db.spec.ts` conventions: (a) DB-free
    test that `createLeadAssignedNotification`'s message format is exactly `"${leadName} has been
    assigned to you"` (assert via a `.toSQL()`-style inspection or a thin pure-function extraction if
    the message-building is factored out as testable); (b) `SKIP_DB`-gated Hybrid test: reassigning a
    lead via `reassignLead()` creates exactly one `crm_notifications` row for the new owner with
    `type: 'lead_assigned'` and a null `readAt`; (c) `SKIP_DB`-gated Hybrid test: `claimLead()` and
    `unclaimLead()` create ZERO `crm_notifications` rows (proves AC4 structurally); (d) `SKIP_DB`-gated
    Hybrid test: `markNotificationRead()` sets `readAt` and is a no-op (returns `null`) for a
    mismatched `userId`; (e) `SKIP_DB`-gated Hybrid test: `getUnreadNotificationCount()` reflects
    read/unread state correctly.
12. Run `bun run check` + `bun run lint` + `bunx vitest run` (or `bun run test:unit`); fix any
    failures in blast radius; confirm the existing `reassignLead(...)` calls in `leads-db.spec.ts`
    (L407) and `pipeline-db.spec.ts` (L233/248/262/278) still pass against a migrated test DB (they
    now also write a `crm_notifications` row per call — this only matters for the `SKIP_DB`-gated
    Hybrid runs, not the DB-free unit tier).

## Acceptance Criteria

_Copied verbatim from the locked spec:_

- [ ] AE sees a notification when a lead is assigned to them by a manager
- [ ] Notification links to the lead detail page
- [ ] Marking as read / dismissing clears the badge
- [ ] No notification is created when an AE self-assigns (Up for Grabs claim)
- [ ] `bun run check` + `bun run lint` exit 0

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bunx vitest run src/tests/notifications-db.spec.ts` — (b) `reassignLead` creates one `lead_assigned` row for the new owner | Hybrid (`SKIP_DB`-gated) | AC1 |
| `bunx vitest run src/tests/notifications-db.spec.ts` — (c) `claimLead`/`unclaimLead` create zero rows | Hybrid (`SKIP_DB`-gated) | AC4 |
| `bunx vitest run src/tests/notifications-db.spec.ts` — (d) `markNotificationRead` sets `readAt`, no-ops for wrong owner | Hybrid (`SKIP_DB`-gated) | AC3 |
| `bunx vitest run src/tests/notifications-db.spec.ts` — (e) unread count reflects read/unread state | Hybrid (`SKIP_DB`-gated) | AC3 (badge correctness) |
| `bunx vitest run src/tests/notifications-db.spec.ts` — (a) message format exact string | Fully-Automated | AC1 (message text) |
| `bun run check` | Fully-Automated | AC5 (typecheck half) |
| `bun run lint` | Fully-Automated | AC5 (lint half) |
| Existing `leads-db.spec.ts:407` / `pipeline-db.spec.ts:233,248,262,278` `reassignLead` calls stay green post-migration | Hybrid (`SKIP_DB`-gated, regression) | no regression on the modified transaction |
| Code review — `/leads/[leadId]` link present on each notification row; bell nav item + badge wired from `counts.unread` | Agent-Probe | AC2, AC3 (badge wiring) |
| Manual: manager reassigns a lead, AE reloads any page, sees badge + list entry, clicks through to lead detail, dismisses, badge clears | Known-Gap | AC1/AC2/AC3 DOM (blocked: shared Playwright auth fixture, same repo-wide gap as every other feature) |

## Test Infra Improvement Notes

(none identified yet — DOM/e2e proof remains blocked on the pre-existing shared Playwright auth
fixture gap, tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`; not new
to this plan.)

## Known-Gap

The actual DOM/browser behavior — a manager reassigns a lead, the AE's next page load shows the
badge and list entry, the link navigates to the correct lead, dismissing clears the badge — remains a
Known-Gap for automated proof. Reason (same as every other feature in this repo): no
Playwright authenticated-session harness exists yet
(`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). DB-level behavior (notification
row created/not created, read-state transitions, unread count) is Hybrid-tier tested against a live,
migrated test DB.

## Dependencies & Risks

- **Dependency:** none new (no new npm package). Relies on existing Drizzle imports (`pgTable`,
  `uuid`, `text`, `timestamp`, `index`), the existing `crmUsers`/`crmLeads` tables, and the existing
  `db.transaction` already used by `reassignLead`.
- **Risk (migration):** additive-only new table, no existing column/table altered — low risk. Confirm
  the pre-existing `0014` journal drift before running `db:generate` so it isn't conflated with new
  drift.
- **Risk (transaction growth):** `reassignLead`'s transaction gains one more insert. No behavior
  change to its existing statements; failure of the notification insert would roll back the whole
  reassignment (same all-or-nothing semantics as the existing history insert) — this is intentional
  (a lead reassignment without a notification would be a silent partial success, worse than failing
  the whole PATCH).
- **Risk (notification spam):** none new — exactly one notification per `reassignLead` call, no loop
  or batch path touches it.
- **Backwards compatibility:** `reassignLead`'s public return type is unchanged; `getNavCounts`'s
  return type widens additively; `AppSidebar`'s `counts` prop widens additively (existing 2-field
  shape remains a valid subset conceptually, but the prop TYPE itself changes to require `unread` —
  the sole call site, `+layout.svelte`, already passes through the whole `data.counts` object from
  `+layout.server.ts`, so both are updated together in this plan; no other component reads `counts`).

## Phase Completion Rules

- This is a SIMPLE single-phase plan. The phase is `CODE DONE` when all checklist items (1-12) are
  applied and `bun run check`, `bun run lint`, `bunx vitest run` (or `bun run test:unit`) are green.
- The phase is NOT `VERIFIED` until the DOM/e2e Known-Gap is closed (blocked on the shared Playwright
  auth fixture) — the plan stays in `active/` after EXECUTE pending manual DOM verification, same
  pattern as every other in-progress feature in this repo.
- Fully-Automated + Hybrid gates (checklist item 12) MUST be green before EXECUTE is considered
  complete; a red gate blocks completion.

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/notifications/active/lead-assignment-notifications_07-07-26/lead-assignment-notifications_PLAN_07-07-26.md`
2. **Last completed step:** PLAN written (INNOVATE folded in — design decisions locked above). No
   code changed yet.
3. **Validate-contract status:** written 07-07-26 — Gate: CONDITIONAL (accepted). 5 execute-agent
   instructions (E1-E5) on record, 0 plan-text rewrites needed, 3 known-gaps accepted (DOM/e2e —
   pre-existing repo-wide gap; manager-self-reassignment self-notification; route-level HTTP mapping
   untested — consistent with repo convention). Cleared for `ENTER EXECUTE MODE`.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`;
   `src/lib/server/db/schema.ts` (crmUsers L98-123, crmLeads L145-, crmLeadHistory L316-331);
   `src/lib/server/db/leads.ts` (reassignLead L1319-1359, getNavCounts L1750-1776, claimLead L641-669,
   unclaimLead L671-699); `src/routes/api/leads/[id]/owner/+server.ts`; `src/routes/+layout.server.ts`;
   `src/lib/components/layout/AppSidebar.svelte`; `src/routes/reminders/+page.svelte` (optimistic
   dismiss pattern reference); `src/lib/utils/optimistic.ts`; `src/lib/types/index.ts`.
5. **Next step for a fresh agent:** run VALIDATE (V1-V7) against this plan, then EXECUTE checklist
   items 1-12 in order — schema/migration first (1-2), then server-side DB layer (3-5), then nav
   wiring (6-7), then the new route + API (8-10), then tests (11), then run the gates (12).

## Validate Contract

> **What V1-V3 did:**
> - **V1 (pre-check):** Plan file structurally complete — TL;DR, Overview, Goals, Scope, Locked Design
>   Decisions, Touchpoints, Public Contracts, Blast Radius, Implementation Checklist, Acceptance
>   Criteria, Verification Evidence, Known-Gap, Dependencies & Risks, Resume/Handoff all present.
>   Blast radius: 10 touched/created files, 1 package (SvelteKit app), 0 phase-program context. Signal
>   score computed below. Every line-number anchor the plan cites was re-verified against the live
>   repo (see V2 Layer 2 mechanical-feasibility row) — all matched exactly.
> - **V2 (fan-out):** Ran 4 Layer 1 dimension agents (infra fit, test coverage, breaking changes,
>   security) + 1 Layer 2 per-section feasibility pass (single SIMPLE plan, one section), plus a
>   targeted re-read of every touchpoint file's current state (schema.ts, leads.ts, +layout.server.ts,
>   AppSidebar.svelte, owner/+server.ts, snooze/+server.ts, reminders/+page.svelte, optimistic.ts,
>   leads-db.spec.ts, pipeline-db.spec.ts, drizzle/meta/_journal.json + all 26 snapshot files).
> - **V3 (synthesis):** 0 FAILs, 2 CONCERNs, 1 note-only observation. Both concerns are fixable as plan
>   text / execute-agent instructions — no return to PLAN needed. Net gate derived below.

### I. Validation Findings → Net Gate

#### Layer 1 — Dimension Findings

**Infra / Setup Fit**

| Finding | Severity | Proposed fix |
|---|---|---|
| All file paths and line-number anchors in Touchpoints/Implementation Checklist re-verified against the live repo: `leads.ts` `reassignLead` (L1319-1359, history insert L1346-1352), `claimLead` (L641-669), `unclaimLead` (L671-699), `getNavCounts` (L1750-1774); `schema.ts` `crmUsers` L98, last `export type Crm*` line L493; `+layout.server.ts` fallback L9; `AppSidebar.svelte` `counts` prop type L25, `reminders` nav entry L54; `Icon.svelte` `bell` L28 — every anchor matched exactly | ✅ PASS | — |
| `removeFromList` (the optimistic-dismiss primitive the plan cites) exists exactly as described in `src/lib/utils/optimistic.ts` L25-27 | ✅ PASS | — |
| No new npm dependency, no new runtime surface, no container/proxy change | ✅ PASS | — |
| Migration numbering `0026_*` — journal `idx: 25` matches `0025_mature_aaron_stack.sql`; but the plan under-describes the actual historical drift severity | CONCERN | See dedicated finding below (Breaking Changes / infra crossover) |

**Test Coverage**

| Finding | Severity | Proposed fix |
|---|---|---|
| Plan's Verification Evidence table already assigns all 4 tiers (Fully-Automated, Hybrid `SKIP_DB`-gated, Agent-Probe, Known-Gap) correctly per the Test Tier Waterfall | ✅ PASS | — |
| Checklist item 12 test command `bunx vitest run` (or `bun run test:unit`) — `bun run test:unit` runs plain `vitest` (interactive/watch mode per `package.json`), NOT a one-shot CI run; only `test:unit:ci` (`vitest --run`) or `bunx vitest run` exit after completion | CONCERN | Execute-agent instruction: always use `bunx vitest run src/tests/notifications-db.spec.ts` (or `bun run test:unit:ci`) — never bare `bun run test:unit` — to avoid hanging in watch mode during an unattended EXECUTE/EVL run |
| Existing regression exposure (`leads-db.spec.ts:407`, `pipeline-db.spec.ts:233/248/262/278`) correctly identified and will now also insert a `crm_notifications` row per `reassignLead` call — SKIP_DB-gated, no new gate needed, already on the plan's checklist | ✅ PASS | — |
| High-risk class (schema/migration) — minimum tier is Hybrid; plan meets this (checklist item 11b/c/d/e are `SKIP_DB`-gated Hybrid) | ✅ PASS | — |

**Breaking Changes**

| Finding | Severity | Proposed fix |
|---|---|---|
| `reassignLead`'s actual current transaction (L1334-1355) does MORE than the plan's Overview implies: it also resets `visibility: 'everyone'` and deletes `crmLeadVisibilityGrants` rows (SPEC AC#13, unrelated to this plan) before the history insert. The plan's proposed notification insert (placed "immediately after the history insert") lands after both of these — no conflict, just under-documented context | CONCERN | No plan-text change required (edit target and sequencing are still correct); execute-agent instruction: the notification insert must remain the LAST statement added to this transaction, after the existing visibility-reset + grant-delete + history-insert sequence — do not reorder |
| `getNavCounts` return-type widen (`{ overdue, unassigned }` → `{ overdue, unassigned, unread }`) — both current call sites (`+layout.server.ts`, and any `/api/nav-counts` route) verified; only `+layout.server.ts` actually calls it in this repo (no separate `/api/nav-counts/+server.ts` route exists — plan's Public Contracts section over-lists a non-existent consumer, harmless since the real consumer IS updated) | ✅ PASS | — |
| `bulk-claim` (`src/routes/api/leads/bulk-claim/+server.ts`) confirmed to call `claimLead` per-id (not a raw bypass update) — AC4 (no self-claim notification) holds structurally as the plan asserts | ✅ PASS | — |
| Drizzle migration journal/snapshot chain: the plan only flags the known `0014_agreements_fields.sql` un-registered-file drift (already on backlog). Deeper investigation this session found the **more severe** drift documented in `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`'s 03-07-26 update (duplicate snapshot `id`s at 15≡16 and 17≡18≡19, 10 missing `crm_leads` columns and a missing `crm_message_templates` table in snapshot 0019) **appears already resolved as of the current repo state** — verified: `drizzle/meta/0025_snapshot.json` has a fully linear, unique `id`/`prevId` chain through all 26 snapshots, contains `crm_message_templates`, and `crm_leads` has 48 columns matching `schema.ts`. The backlog note itself is NOT marked resolved/closed, so this is stale-but-good news, not a formally closed item | CONCERN | Execute-agent instruction: before running `bun run db:generate` for `0026_*`, run a dry check first (`bun run db:generate` in a scratch/disposable checkout, or inspect the generated SQL diff before applying `db:migrate`) to confirm it emits ONLY the new `crm_notifications` table + its 2 indexes — no unexpected `ALTER`/`CREATE` for unrelated tables. If anything besides the new table appears, STOP and re-open the drizzle-migration-journal-drift backlog note rather than applying |

**Security Surface**

| Finding | Severity | Proposed fix |
|---|---|---|
| `PATCH /api/notifications/[id]/read` authorization: `markNotificationRead(id, userId)` design is `UPDATE ... WHERE id = id AND user_id = userId RETURNING *`, returning `null` (mapped to 404) on no-match — this is a single atomic ownership-scoped statement, safe against IDOR (a user cannot read or dismiss another user's notification; the 404-for-both-cases behavior deliberately avoids leaking existence to a non-owner, same pattern already used by `markNotificationRead`'s sibling design) | ✅ PASS | — |
| `listNotifications(userId)` / `getUnreadNotificationCount(userId)` both take `userId` as their sole scoping parameter and are called with `locals.user.id` only (`+page.server.ts` load, `getNavCounts`) — no cross-user read path exists in the plan | ✅ PASS | — |
| No new auth bypass, no secret/token handling, no billing surface; `crm_notifications` insert path is reachable only through the existing `isManagerRole`-gated `PATCH /api/leads/[id]/owner` endpoint (confirmed: `reassignLead` has exactly one call site in `src/`) | ✅ PASS | — |
| Manager-reassigns-lead-to-self edge case: `owner/+server.ts` does not check `ownerId !== locals.user.id` before calling `reassignLead`. A manager reassigning a lead to themselves would receive a "this lead was assigned to you" notification about their own action. Not an authorization defect (a manager IS a legitimate future owner) and does not violate AC4 (which is scoped to Up-for-Grabs self-*claim*, a structurally different code path) — this is a pre-existing repo behavior anyway: `src/tests/leads-db.spec.ts:407` already exercises `reassignLead(lead.id, MANAGER_UUID, MANAGER_UUID)` today, before this plan | CONCERN | Accept as known-gap / product-sense quirk, not a defect: execute-agent should note in the phase report that self-reassignment-by-manager produces a (harmless, structurally-correct-per-spec) self-notification; no code change required — out of scope for v1 per the plan's own "no runtime who-changed-it detection" design decision |

---

#### Layer 2 — Per-Section Feasibility

**Section A — Implementation Checklist (single SIMPLE-plan section, items 1-12)**

| Question | Verdict | Detail |
|---|---|---|
| Mechanical feasibility | PASS | Every edit target string/line anchor (schema.ts L493, leads.ts L1324-1352 and L1750-1774, +layout.server.ts L9, AppSidebar.svelte L25/L54, Icon.svelte L28, types/index.ts L493-region) is present and uniquely matchable in the current repo state — re-verified directly, not assumed from research notes |
| Plan gaps | CONCERN | (1) `reassignLead`'s transaction already contains a visibility-reset + grant-delete step the plan's Overview doesn't mention — sequencing still correct, but execute-agent should be told explicitly not to reorder (see Breaking Changes finding above). (2) The `Tx` parameter type for `createLeadAssignedNotification` is described only as "`Parameters<Parameters<typeof db.transaction>[0]>[0]` or an equivalent local `Tx` type alias" — no such alias currently exists elsewhere in `leads.ts`/`notifications.ts` to copy from; this is a create-new-pattern step, not a copy-existing-pattern step. Not blocking, just flagged so execute-agent doesn't search for a non-existent existing `Tx` type |
| Conflicts | PASS | No contradiction found between this plan's design and current file state, other plan sections, or repo conventions (soft-delete, `safeParse()`+`fetch()` form convention, Drizzle snake_case/uuid/index conventions all followed) |
| Highest-risk edit | The `db:generate` step (checklist item 2) is the highest-risk single step, given the historical migration-journal drift precedent in this repo (even though currently resolved) | Mitigation: run the dry-check instruction above before `db:migrate`; if the generated SQL touches anything beyond `crm_notifications` + 2 indexes, stop and escalate to the drizzle-migration-journal-drift backlog note instead of proceeding |

Proposed fixes for this section:
- Execute-agent instruction: notification insert must be the last statement in `reassignLead`'s transaction (after the existing visibility-reset/grant-delete/history-insert sequence) — do not reorder.
- Execute-agent instruction: use `Parameters<Parameters<typeof db.transaction>[0]>[0]` as a local type alias in `notifications.ts` (no existing alias to reuse; this is new).
- Execute-agent instruction: dry-check the `db:generate` diff before `db:migrate` (see Breaking Changes finding).
- Execute-agent instruction: always invoke vitest via `bunx vitest run <file>` or `bun run test:unit:ci`, never bare `bun run test:unit` (watch-mode hang risk).

---

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | CONCERN (1) |
| Test coverage | CONCERN (1) |
| Breaking changes | CONCERN (2) |
| Security surface | CONCERN (1) |

| Layer 2 sections | Status |
|---|---|
| Section A — Implementation Checklist | CONCERN (2) |

**Totals: 0 FAILs / 5 distinct CONCERNs (some overlapping across dimensions) / 9 PASSes**

**→ Net Gate: CONDITIONAL**

0 FAILs. 5 concerns, all resolved via execute-agent instructions (no plan-text rewrite required — the plan's design and line anchors are already correct, the gaps are "tell execute-agent to do X" items) + 1 accepted known-gap/product-note (manager self-reassignment self-notification). Proceed to EXECUTE with these instructions on record.

---

### II. Execution Strategy

**Signal Score: 1/7** — dominant signal: S6 (schema surface touched — new table), but everything else scores low (single package, no phase program, SIMPLE plan, no 3+ INNOVATE directions, plan already precise).

| Signal | Present |
|---|---|
| S1: Multi-package scope (3+ workspace packages) | — |
| S2: Schema/API/auth surface touched | ✅ (new table + new endpoint, no auth-logic change) |
| S3: 3+ viable directions surfaced in INNOVATE | — (INNOVATE folded into plan; single approach) |
| S4: Phase program classification (3+ phases) | — |
| S5: User requested depth explicitly | — |
| S6: High-risk class in blast radius | ✅ (schema/migration — additive only) |
| S7: 5+ files in blast radius | ✅ (10 files) |

Score: **2/7 → threshold: 2-3 = parallel-subagents** (borderline with sequential)

**Recommendation: Sequential — 1 agent.** Despite scoring 2/7, this is a single SIMPLE plan with a strictly ordered checklist (schema → migration → types → DB module → leads.ts wiring → nav → routes → tests) where later steps depend on earlier ones (e.g. the notification insert in `reassignLead` requires the new table to exist; the nav badge requires `getNavCounts` to return `unread`). There is no independent-section fan-out opportunity — parallel subagents would need to coordinate on shared files (`leads.ts`, `schema.ts`) anyway, which is worse than one sequential executor. Workflow/agent-team are overkill for a 10-file, single-package, single-phase SIMPLE plan.

---

### III. Test Coverage Plan

(Plan's own Verification Evidence table already assigns all 4 tiers correctly per the Test Tier Waterfall — reproduced/confirmed here, no changes needed.)

**Area: `src/lib/server/db/notifications.ts` + `reassignLead` (schema/migration + transactional write path)**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `createLeadAssignedNotification` message format is exactly `"${leadName} has been assigned to you"` | `bunx vitest run src/tests/notifications-db.spec.ts` (DB-free case (a)) exits 0 | Message string construction is correct | Does not prove the row is actually persisted |
| Hybrid (`SKIP_DB`-gated) | `reassignLead()` creates exactly one `crm_notifications` row for the new owner, `type: 'lead_assigned'`, null `readAt` | `bunx vitest run src/tests/notifications-db.spec.ts` — precondition: reachable migrated `DATABASE_URL` | AC1 (notification created on manager reassignment) | Does not prove UI badge renders (DOM/e2e known-gap) |
| Hybrid (`SKIP_DB`-gated) | `claimLead()`/`unclaimLead()` create ZERO `crm_notifications` rows | Same file/precondition | AC4 structurally (no self-claim notification) | Does not prove no OTHER future code path could add one (regression risk if a new caller of `reassignLead`-adjacent logic appears later) |
| Hybrid (`SKIP_DB`-gated) | `markNotificationRead()` sets `readAt`; no-ops (`null`) for mismatched `userId` | Same file/precondition | AC3 (mark-read + ownership enforcement) | Does not prove the API layer's 404 mapping (that's the route file, untested at unit tier — see Agent-Probe row below) |
| Hybrid (`SKIP_DB`-gated) | `getUnreadNotificationCount()` reflects read/unread state | Same file/precondition | AC3 badge-count correctness | Does not prove the badge re-renders after navigation (DOM known-gap) |
| Agent-Probe | Code review: `/leads/[leadId]` link present on each row; bell nav item + badge wired from `counts.unread`; `PATCH /api/notifications/[id]/read` returns 401/404/200 correctly per the code (not runtime-executed) | Read the diff post-EXECUTE | AC2, AC3 (wiring correctness) | Does not prove real browser rendering |
| Known-gap | Full DOM/e2e flow: manager reassigns, AE reloads, sees badge+entry, clicks through, dismisses, badge clears | — | — | Blocked on the shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — repo-wide pre-existing gap, not new to this plan |

Gaps and resolution options:

| Gap | Resolution options |
|---|---|
| DOM/e2e proof of the full notification flow | C) Accept as known-gap — same repo-wide blocker as every other feature; plan already documents this correctly. No new backlog artifact needed (existing `e2e-auth-bootstrap_NOTE_01-07-26.md` already tracks it). |
| `PATCH /api/notifications/[id]/read`'s HTTP-layer 401/404/200 mapping has no automated test (only the DB-layer `markNotificationRead` function is Hybrid-tested) | A) Optionally add a thin route-level test if a precedent exists for other `+server.ts` routes in this repo (checked: none of the sibling routes — `owner`, `snooze`, `claim` — have dedicated route-level HTTP tests either; this repo's convention is DB-layer testing + Agent-Probe for route wiring). C) Accept as known-gap, consistent with existing repo convention — recommended. |

**High-risk class areas**

| Area | High-risk class | Minimum tier | Gap rationale if known-gap accepted |
|---|---|---|---|
| `crm_notifications` table + migration | schema/migration | Hybrid | N/A — plan meets Hybrid minimum (SKIP_DB-gated tests against a live migrated DB) |
| `reassignLead` transaction extension | transactional write path (adjacent to auth-gated mutation) | Hybrid | N/A — met |

**Missing test areas**

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Full DOM/e2e notification flow | No Playwright authenticated-session harness exists yet | Deferred to the existing `e2e-auth-bootstrap_NOTE_01-07-26.md` backlog item (pre-existing, repo-wide) |

---

### IV. Proposed Plan Updates (execute-agent instructions only — no plan-text rewrite needed)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | The notification insert must be the LAST statement added inside `reassignLead`'s transaction — after the existing visibility-reset (`.set({ ownerId, visibility: 'everyone', ... })`), the `crmLeadVisibilityGrants` delete, and the `crmLeadHistory` insert. Do not reorder relative to these three existing statements. | Checklist item 5, `leads.ts` `reassignLead()` edit |
| E2 | Use `Parameters<Parameters<typeof db.transaction>[0]>[0]` as a local `Tx` type alias inside `notifications.ts` — no existing alias exists elsewhere in the codebase to copy; this is a new pattern, not a copy of prior art. | Checklist item 4, `notifications.ts` creation |
| E3 | Before running `bun run db:migrate` against the generated `0026_*.sql`, inspect the diff/SQL to confirm it touches ONLY `crm_notifications` (new table) + its 2 new indexes. If anything else appears (unrelated ALTER/CREATE), STOP and escalate to `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md` rather than applying. | Checklist item 2, migration generation |
| E4 | Always invoke vitest for this plan's tests via `bunx vitest run src/tests/notifications-db.spec.ts` or `bun run test:unit:ci` — never bare `bun run test:unit` (interactive watch mode, will hang an unattended EXECUTE/EVL run). | Checklist item 12, test gate execution |
| E5 | Manager-reassigns-lead-to-self will generate a self-notification. This is expected/harmless per the plan's own scope (no runtime "who changed it" detection) and already exercised today by `leads-db.spec.ts:407`. Note it in the phase report as an accepted known-gap/product-note, not a defect requiring a code change. | Checklist item 5 completion, phase report |

Backlog artifacts to create during durable capture: none new — the one relevant pre-existing artifact (`drizzle-migration-journal-drift_02-07-26.md`) already exists and is referenced by E3 above; no new artifact needed unless E3's dry-check surfaces something unexpected.

---

### V. User Decision (V5 Gate)

**A — Accept (apply fixes + write contract + proceed to EXECUTE).** No plan-text changes needed (P1-PN empty — all 5 concerns resolve as execute-agent instructions E1-E5, not plan rewrites). Test plan (Section III) confirmed against the plan's own Verification Evidence table — no changes. Gate: **CONDITIONAL**.

---

## Validate Contract

Status: CONDITIONAL
Date: 2026-07-07
Gate: CONDITIONAL — 0 FAILs; 5 concerns resolved as 5 execute-agent instructions (E1-E5), 0 plan-text
rewrites needed, 1 of the 5 doubles as an accepted known-gap/product-note (E5 — manager
self-reassignment self-notification, harmless per spec scope).

generated-by: outer-pvl

### Parallel strategy
Choice: sequential
Signals: 2/7 — dominant: S6 (schema surface) / S7 (10-file blast radius)
Agent count: 1 (single sequential executor — checklist has strict ordering dependencies, no
independent-section fan-out opportunity)

### Plan updates applied
(none — plan text was already accurate; all fixable concerns route to execute-agent instructions
below instead of plan-text edits)

### Execute-agent instructions
- E1: Notification insert must be the LAST statement in `reassignLead`'s transaction (after the
  existing visibility-reset + grant-delete + history-insert sequence, `leads.ts` L1334-1355). Do not
  reorder.
- E2: Use `Parameters<Parameters<typeof db.transaction>[0]>[0]` as the local `Tx` type alias in the
  new `notifications.ts` — no existing alias to copy; this is new.
- E3: Before `bun run db:migrate` on the generated `0026_*.sql`, confirm the diff touches ONLY
  `crm_notifications` + its 2 indexes. Anything else → STOP, escalate to
  `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`, do not apply.
- E4: Run tests via `bunx vitest run src/tests/notifications-db.spec.ts` or `bun run test:unit:ci` —
  never bare `bun run test:unit` (watch-mode hang risk in unattended EXECUTE/EVL).
- E5: Manager-reassign-to-self will self-notify — expected/harmless, already latent in
  `leads-db.spec.ts:407`; record as an accepted known-gap/product-note in the phase report, not a
  defect.

### Test gates (run after each section; regression suite after all sections)

**`src/lib/server/db/notifications.ts` + `reassignLead` (schema/migration + transactional write path)**
- Fully-automated: `bunx vitest run src/tests/notifications-db.spec.ts` (case a — message format) exits 0
  Proves: AC1 message text
- Hybrid: `bunx vitest run src/tests/notifications-db.spec.ts` (case b — reassignLead creates 1 row) exits 0
  Precondition: reachable migrated `DATABASE_URL` (`SKIP_DB` unset)
  Proves: AC1
- Hybrid: `bunx vitest run src/tests/notifications-db.spec.ts` (case c — claim/unclaim create 0 rows) exits 0
  Precondition: same as above
  Proves: AC4
- Hybrid: `bunx vitest run src/tests/notifications-db.spec.ts` (case d — markNotificationRead + ownership) exits 0
  Precondition: same as above
  Proves: AC3
- Hybrid: `bunx vitest run src/tests/notifications-db.spec.ts` (case e — unread count) exits 0
  Precondition: same as above
  Proves: AC3 badge correctness
- Hybrid (regression): `bunx vitest run src/tests/leads-db.spec.ts src/tests/pipeline-db.spec.ts` exits 0
  Precondition: same DB, migrated with `0026_*`
  Proves: no regression on the modified `reassignLead` transaction
- Agent-probe: code review — `/leads/[leadId]` link present per row; bell nav item + badge wired from `counts.unread`; route 401/404/200 mapping correct by inspection
- Known-gap: full DOM/e2e flow — resolution: deferred to `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (pre-existing, repo-wide)

**Regression suite (after all sections complete)**
- `bun run check` exits 0
- `bun run lint` exits 0
- `bun run test:unit:ci` exits 0 (or `bunx vitest run`)

### High-risk pack
Required: no
Risk class is schema/migration (additive-only new table) + transactional write-path extension, but
no auth/billing/destructive-migration surface — the E3 dry-check instruction above substitutes for a
full high-risk evidence pack. If E3's dry-check surfaces unexpected drift, escalate to a high-risk
pack before proceeding with `db:migrate`.

### Backlog artifacts to create during durable capture
(none new — E3 references the existing `drizzle-migration-journal-drift_02-07-26.md`, no new artifact needed)

### Known gaps on record
- Full DOM/e2e notification flow (badge render, list render, dismiss-clears-badge) — accepted,
  same repo-wide Playwright auth-fixture blocker as every other feature.
- Manager-reassigns-lead-to-self produces a self-notification — accepted as harmless/expected per
  plan scope (E5), not a defect.
- `PATCH /api/notifications/[id]/read` HTTP-layer 401/404/200 mapping has no dedicated route-level
  test — accepted, consistent with this repo's existing convention (no sibling route has one either).

### Accepted by
session (this VALIDATE pass) — all 5 concerns (E1-E5) and all 3 known-gaps above.
