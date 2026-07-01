---
name: plan:meeting-reminders
description: "Email reminders 1-day + 1-hour before a meeting's startAt — organizer + attendees, batched digest, exactly-once per checkpoint"
date: 01-07-26
feature: reminders
---

# Meeting Reminders — PLAN (COMPLEX)

- **Date**: 01-07-26
- **Status**: Active — ready for VALIDATE
- **Complexity**: COMPLEX
- **Feature:** reminders
- **Context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
  `process/context/tests/all-tests.md` (routing), SPEC (same task folder)

> TL;DR — Add two per-meeting email reminders (1 day + 1 hour before `startAt`) to organizer + all
> attendees, delivered as a batched digest, sent at-most-once per checkpoint. Mechanism: two new
> nullable `timestamptz` columns on `crm_meetings` (`day_reminder_sent_at`, `hour_reminder_sent_at`),
> a new `src/lib/server/db/meeting-reminders.ts` module (due-query with injectable `now` + atomic
> compare-and-set mark-sent + pure recipient/grouping helpers), a new parallel digest template +
> send function, and additive extensions to the two existing secret-authed n8n endpoints. No new
> table, no new endpoint, no new scheduler. The single most important correctness point is the
> atomic `UPDATE ... WHERE <col> IS NULL RETURNING id` mark-sent statement — it is the sole
> mechanism satisfying at-most-once send (Acceptance Criterion 3).

## Complexity Classification

**COMPLEX** (multi-phase within one plan, single artifact). Rationale vs `all-planning.md` calibration:
- Blast radius = 6 source files + 3 new/updated test files (>5 files).
- Touches a **high-risk schema/migration surface** (Phase 1) — auto-elevates above SIMPLE.
- Carries a hard correctness requirement (at-most-once under concurrent polling) needing an explicit
  race-safe design that EXECUTE must not improvise.
- NOT a phase program: the 4 phases are one cohesive feature with a linear dependency chain and a
  single validation gate — no per-phase validation gates, no multi-package/multi-runtime spread.

## Overview

Implements the locked INNOVATE decision **"Columns + Parallel Digest + Extend Existing Endpoints"**
exactly. The existing follow-up-reminder system (`getDueReminders` / `groupRemindersByRep` /
`sendReminderDigest` / `buildReminderDigestHtml`) is idempotent-by-recomputation and cannot express
two distinct one-time sends per meeting. This feature adds a parallel, sibling implementation for
meetings that tracks exactly-once delivery per checkpoint via dedicated columns, and reuses the same
external-poller (n8n → secret-authed endpoint) architecture.

## Goals

1. Two reminders per meeting — "day-before" (~24h) and "hour-before" (~1h) relative to `startAt`.
2. Recipients = organizer ∪ all attendees, deduped by `userId`, filtered to `active = true` +
   non-null `email` (Decisions Q1).
3. Batched digest — one email per recipient per poll cycle (Decisions Q3).
4. At-most-once per checkpoint per meeting — repeat polls never re-send (Acceptance Criterion 3).
5. Soft-deleted / past meetings never produce reminders (Acceptance Criterion 5).
6. CRM-side logic independently unit-testable without a live n8n instance (Acceptance Criterion 6).

## Scope

**In scope:** schema columns + migration, due-query (injectable `now`), atomic mark-sent, recipient
resolution, per-recipient grouping, meeting-reminder digest template + send function, additive
extension of `GET /api/reminders/due` and `POST /api/reminders/notify`, unit tests.

**Out of scope** (from SPEC Out-of-Scope — do not implement): any non-email channel; offsets other
than 1-day/1-hour; building the n8n workflow/cron; per-user opt-out UI; sub-poll-interval precision;
retroactive reminders for already-past meetings; per-meeting timezone selection; **retrofitting
`getDueReminders()`'s hardcoded `new Date()`** (INNOVATE item 9 — explicitly out of scope).

## Acceptance Criteria

Traceable to SPEC Acceptance Criteria 1–7. Each is proven by the correspondingly-named row in the
Verification Evidence table below.

1. **AC1** — A meeting >1 day out produces a "day-before" checkpoint ~24h before `startAt`, addressed
   to organizer ∪ all attendees (organizer included even if not an attendee row). Proven by:
   `resolveRecipients` unit test + day-before due-query window test. Strategy: Fully-Automated + Hybrid.
2. **AC2** — A meeting produces an "hour-before" checkpoint ~1h before `startAt`, independent of the
   day-before, same recipient set. Proven by: hour-before due-query window test. Strategy: Hybrid.
3. **AC3** — Each of the two checkpoints is sent at most once per meeting; repeat/rapid polling and
   reschedule never re-send an already-sent checkpoint. Proven by: atomic mark-sent poll-twice race
   test. Strategy: Hybrid (Postgres row-lock property; CONDITIONAL — no CI DB harness).
4. **AC4** — Reminder content identifies the specific meeting (lead/meeting, start time, CRM link),
   branded consistent with the existing reminder email. Proven by: `buildMeetingReminderDigestHtml`
   template unit test. Strategy: Fully-Automated.
5. **AC5** — Meetings with no future `startAt` or soft-deleted meetings never produce a reminder.
   Proven by: due-query exclusion test (deleted/past). Strategy: Hybrid.
6. **AC6** — CRM-side logic (due, recipients, dedup, grouping) is independently testable without a
   live n8n instance. Proven by: pure-helper + template + `'skipped'`-path unit tests. Strategy:
   Fully-Automated.
7. **AC7** — Real end-to-end delivery via live n8n → real inbox is NOT automatable in this repo.
   Proven by: manual/staging smoke checklist. Strategy: Agent-Probe (known-gap residual).

## Touchpoints

| File | Action | Notes |
|---|---|---|
| `src/lib/server/db/schema.ts` | EDIT | Add 2 nullable `timestamptz` columns to `crmMeetings` block (lines 254–273). |
| `drizzle/00NN_*.sql` + `drizzle/meta/*` | CREATE (generated) | Via `bun run db:generate` — never hand-write. **NOT** a Better-Auth table, so drizzle-managed migration is correct. |
| `src/lib/server/db/meeting-reminders.ts` | CREATE | New module: types, `getDueMeetingReminders(now)`, `markMeetingReminderSent`, pure `resolveRecipients`, pure `groupMeetingRemindersByRecipient`. |
| `src/lib/server/email-templates/meeting-reminder.ts` | CREATE | New pure `buildMeetingReminderDigestHtml` — no `$env`/`resend` imports. |
| `src/lib/server/email.ts` | EDIT | Add `sendMeetingReminderDigest` (sibling to `sendReminderDigest`, same no-throw contract). Do NOT modify `sendReminderDigest`. |
| `src/routes/api/reminders/due/+server.ts` | EDIT | Additive: add `meetingsDue` to JSON response. Read-only — MUST NOT mark-sent. |
| `src/routes/api/reminders/notify/+server.ts` | EDIT | Additive: fetch → atomic mark-sent → group → send meeting digests. Additive response fields. |
| `src/tests/meeting-reminders.spec.ts` | CREATE | Fully-Automated unit tests (pure helpers + template). |
| `src/tests/meeting-reminders-db.spec.ts` | CREATE | Hybrid DB-optional tests (`SKIP_DB` gate) — due-query + atomic race. |

**Read-for-context (not modified):** `src/lib/server/reminders.ts`, `src/lib/server/email-templates/reminder.ts`,
`src/lib/server/db/meetings.ts` (`attendeesByMeeting` pattern), `src/tests/reminders.spec.ts`,
`src/tests/reminders-db.spec.ts`. Context router: `process/context/all-context.md`.

## Public Contracts

### New schema columns (`crm_meetings`)
```
dayReminderSentAt:  timestamp('day_reminder_sent_at',  { withTimezone: true })  // nullable
hourReminderSentAt: timestamp('hour_reminder_sent_at', { withTimezone: true })  // nullable
```
Both default `NULL` (never sent). Matches existing `deletedAt` timestamptz convention exactly.

### New module `src/lib/server/db/meeting-reminders.ts`
```ts
export type MeetingReminderCheckpoint = 'day' | 'hour';

export type MeetingReminderDue = {
  meetingId: string;
  leadId: string;
  leadName: string;
  startAt: string;            // ISO
  meetingUrl: string | null;
  checkpoint: MeetingReminderCheckpoint;
  recipients: { userId: string; email: string }[]; // organizer ∪ attendees, deduped, active+email
};

// DB query. `now` is INJECTABLE (defaults to new Date()) — the testability seam (INNOVATE item 2/9).
// For EACH checkpoint independently: startAt > now AND startAt <= now + offset
//   AND deleted_at IS NULL AND <checkpoint>_reminder_sent_at IS NULL.
// day offset = 24h, hour offset = 1h. Joins organizer (crm_users, left join) + attendees
// (crm_meeting_attendees ⋈ crm_users) selecting email + active, single grouped query (no N+1).
// Read-only: does NOT mark anything sent.
// EMPTY-RECIPIENT RULE (P2-2a): a candidate whose resolveRecipients() returns [] is EXCLUDED
// from the returned list entirely — it is NOT a due checkpoint this poll.
export async function getDueMeetingReminders(now?: Date): Promise<MeetingReminderDue[]>;

// ATOMIC compare-and-set. THE exactly-once mechanism (see Failure Modes).
// UPDATE crm_meetings SET <col> = now() WHERE id = $1 AND <col> IS NULL RETURNING id
// Returns true iff THIS call won the race (flipped NULL→timestamp); false if already sent.
export async function markMeetingReminderSent(
  meetingId: string, checkpoint: MeetingReminderCheckpoint
): Promise<boolean>;

// PURE. Organizer ∪ attendees, dedup by userId (organizer may also be an attendee row),
// keep only active === true AND email != null. No DB, no env.
export function resolveRecipients(
  organizer: { userId: string; email: string | null; active: boolean } | null,
  attendees: { userId: string; email: string | null; active: boolean }[]
): { userId: string; email: string }[];

// PURE. Invert due list into one group per recipient email, preserving input order. No DB, no env.
export function groupMeetingRemindersByRecipient(
  due: MeetingReminderDue[]
): Array<{ recipientEmail: string; reminders: MeetingReminderDue[] }>;
```

### New template `src/lib/server/email-templates/meeting-reminder.ts`
```ts
// PURE — mirrors buildReminderDigestHtml constraints (no $env/resend, inline CSS, Veent palette).
// Sections by checkpoint (e.g. "Tomorrow" / "In 1 hour"); each card links to /leads/{leadId}.
export function buildMeetingReminderDigestHtml(
  args: { appUrl: string; reminders: MeetingReminderDue[] }
): string;
```

### `src/lib/server/email.ts` (additive)
```ts
// Sibling to sendReminderDigest. Same no-throw contract: 'sent' | 'skipped' | 'failed'.
// 'skipped' when RESEND_API_KEY / RESEND_FROM / APP_URL unset.
export async function sendMeetingReminderDigest(
  args: { recipientEmail: string; reminders: MeetingReminderDue[] }
): Promise<'sent' | 'skipped' | 'failed'>;
```

### Endpoint response shapes (additive — MUST NOT break existing consumers)
- `GET /api/reminders/due` → `{ due, meetingsDue }` (existing `due` key unchanged; `meetingsDue` new).
- `POST /api/reminders/notify` → `{ sent, skipped, meetingSent, meetingSkipped }` (existing
  `sent`/`skipped` unchanged; two new additive counters).

## Blast Radius

- **Files:** 6 source (1 schema edit, 2 new modules, 1 email edit, 2 endpoint edits) + 1 generated
  migration + 2 test files.
- **Packages/surfaces:** single app (SvelteKit) — `src/lib/server/*` and `src/routes/api/reminders/*`.
- **Risk class: HIGH — schema/migration (Phase 1)** + data-write on the notify endpoint (mark-sent).
  No auth/billing/secrets surface beyond the already-existing `REMINDERS_ENDPOINT_SECRET` gate (reused
  unchanged). Public API contract change is additive-only.
- **Backwards compatibility:** new columns default NULL (existing rows unaffected — will simply be
  eligible for their next un-passed checkpoint). Response shapes are additive. `getDueReminders`,
  `sendReminderDigest`, `buildReminderDigestHtml`, `DueReminder` are NOT touched.

## Data Flow

```
n8n poll ──GET /api/reminders/due──► getDueMeetingReminders(now)   [read-only preview, no marking]
                                       └─ returns MeetingReminderDue[]  (empty-recipient candidates excluded)

n8n poll ──POST /api/reminders/notify──►
   1. getDueMeetingReminders(now)                    → candidate checkpoints (sentAt IS NULL, recipients non-empty)
   2. for each candidate: markMeetingReminderSent()  → keep ONLY winners (atomic CAS) *** exactly-once
   3. groupMeetingRemindersByRecipient(winners)      → one group per recipient email
   4. for each group: sendMeetingReminderDigest()    → one digest email per recipient
   5. return { sent, skipped, meetingSent, meetingSkipped }
```

**Ordering decision (explicit):** mark-sent happens in step 2, BEFORE send in step 4. This
prioritizes *no-duplicates* over *guaranteed-delivery* — correct for AC3 which requires "sent at most
once", and consistent with the existing `sendReminderDigest` no-throw/best-effort contract. Trade-off:
a mark-succeeds-but-send-fails case loses that one reminder (accepted v1 behavior; `'failed'` is
logged, not retried). Documented so EXECUTE does not reorder to send-then-mark (which would reopen a
duplicate-send window).

## Failure Modes & the Critical Correctness Point

**#1 — Concurrent/rapid polling duplicate send (Acceptance Criterion 3) — THE most important point.**
Two overlapping `notify` calls both run `getDueMeetingReminders` and both see `<col> IS NULL`. A
naive check-then-write (`SELECT ... IF null THEN UPDATE`) has a race window → two emails. The ONLY
sanctioned mechanism is the single atomic compare-and-set:
```
UPDATE crm_meetings SET day_reminder_sent_at = now()
  WHERE id = $1 AND day_reminder_sent_at IS NULL
  RETURNING id;   -- empty result set ⇒ lost the race ⇒ do NOT send
```
(identical shape for `hour_reminder_sent_at`). Postgres row-level locking guarantees exactly one
concurrent updater flips NULL→timestamp; the other gets zero rows. EXECUTE MUST implement this exact
Drizzle `.update(...).set(...).where(and(eq(id), isNull(col))).returning({id})` shape and gate the
send on a non-empty return. This is a hard checklist item (P2-4), not an interpretation.

**#2 — Recipient with no/invalid email or inactive user.** `resolveRecipients` filters `active===true`
AND `email!=null` — must be explicit (vc-predict risk item). An organizer that is also an attendee is
deduped by `userId` so they receive one card, not two.

**#3 — Soft-deleted / past meeting.** Due-query `WHERE deleted_at IS NULL AND startAt > now` — a
soft-deleted or already-started meeting is never returned (AC5).

**#4 — Reschedule after a checkpoint fired.** Column stays set; that checkpoint never re-fires for the
new time (Decisions Q2, known v1 limitation). A not-yet-sent checkpoint naturally uses the new
`startAt` because the query reads current `startAt`. No special handling needed — documented, not coded.

**#5 — Empty resolved-recipient set for a due candidate (checkpoint-burn hazard) — DECISION LOCKED.**
A meeting can reach a checkpoint window with `<col> IS NULL` yet resolve to ZERO recipients — e.g.
the organizer and every attendee are `active = false` or have a null `email`. If such a candidate were
still treated as due and passed through the atomic mark-sent UPDATE, the checkpoint column would flip
NULL→timestamp while producing zero emails — **silently burning that checkpoint forever**: a later-
reactivated recipient or a newly-added attendee could never receive that reminder, because the "sent"
column is already set. **Locked decision:** `getDueMeetingReminders()` EXCLUDES any meeting/checkpoint
whose `resolveRecipients()` returns `[]` from the returned due list entirely for that poll — the
mark-sent UPDATE is therefore NEVER invoked for it. The checkpoint column stays `NULL`, so on a later
poll — after a recipient is reactivated, gets an email, or a new attendee is added, and while the
checkpoint window is still open — the meeting becomes due again and can still be reached. Trade-off:
if the recipient set stays empty until the checkpoint window closes (`startAt` passes), the reminder
is simply never sent (correct — there is no one to send to). This prioritizes *reachability of a
later-valid recipient* over eagerly consuming the checkpoint. EXECUTE MUST implement the exclusion in
`getDueMeetingReminders` (P2-2a) — do NOT mark-sent an empty-recipient candidate. Proven by a
Fully-Automated unit test (P2-6a).

## Risk Predictions (vc-predict — folded into checklist)

| Prediction | Mitigation (checklist item) |
|---|---|
| EXECUTE implements check-then-write instead of atomic CAS → duplicate sends | P2-4 specifies the exact `UPDATE ... WHERE col IS NULL RETURNING` Drizzle shape as a hard gate. |
| Recipient filter forgets `active`/null-email → emails to dead addresses | P2-3 requires `active===true` AND `email!=null` explicitly; unit test P2-6 asserts exclusion. |
| Empty-recipient candidate gets marked-sent → checkpoint silently burned forever | P2-2a excludes empty-recipient candidates from the due list (no mark-sent); Failure Mode #5; unit test P2-6a asserts exclusion + no mark-sent invocation. |
| Two-digest ambiguity silently baked in | OI-1 CONFIRMED (user, 2026-07-01) = two separate emails; documented, no longer an open decision. |
| Injectable `now` omitted → due-query untestable | P2-2 makes `now` a defaulted parameter; Fully-Automated tests depend on it. |

## Open Items (require visibility / confirmation)

**OI-1 — Unified vs two separate emails when a recipient is due for BOTH a follow-up reminder AND a
meeting reminder in the same poll cycle (INNOVATE item 7).** **CONFIRMED (user, 2026-07-01) — two
separate emails** (one follow-up digest via existing `sendReminderDigest` + one meeting digest via new
`sendMeetingReminderDigest`) when a recipient is due for both types in the same poll cycle. Locked
decision; no further sign-off required. Rationale on record: merging would require modifying
`buildReminderDigestHtml`/`DueReminder`, which INNOVATE explicitly rejected (template-coupling risk,
rejected Approaches 2/3). EXECUTE implements two separate sends (Data-Flow + P4-2) — do not merge.

**OI-2 — Timezone:** the 1-day/1-hour windows are relative offsets from `startAt` (a `timestamptz`),
NOT calendar-day boundaries, so `REMINDER_TZ` (Asia/Manila) does not affect due-eligibility. It is
only used for *display* formatting inside the digest template (mirroring `reminder.ts`'s
`formatReminderDate`). Confirmed minor per SPEC — no special handling in the query.

## Implementation Checklist

### Phase 1 — Schema migration  ⚠️ HIGH-RISK (schema/migration surface)
1. **P1-1** In `src/lib/server/db/schema.ts` `crmMeetings` block (after `deletedAt`, line 268), add:
   `dayReminderSentAt: timestamp('day_reminder_sent_at', { withTimezone: true })` and
   `hourReminderSentAt: timestamp('hour_reminder_sent_at', { withTimezone: true })` (both nullable).
2. **P1-2** Run `bun run db:generate` to produce the next `drizzle/00NN_*.sql` migration + `meta`
   update. Do NOT hand-edit the SQL. Verify the generated SQL is `ALTER TABLE ... ADD COLUMN` for
   both columns, nullable, no default backfill needed.
3. **P1-3** Verify `bun run check` (drizzle/TS types) passes — `CrmMeeting` inferred type now includes
   the two new fields.

### Phase 2 — Due-query + recipient resolution + atomic mark-sent  (depends on Phase 1)
4. **P2-1** Create `src/lib/server/db/meeting-reminders.ts` with the types from Public Contracts
   (`MeetingReminderCheckpoint`, `MeetingReminderDue`).
5. **P2-2** Implement `getDueMeetingReminders(now: Date = new Date())`: for each checkpoint (day=24h,
   hour=1h) build `startAt > now AND startAt <= now + offset AND deleted_at IS NULL AND
   <col> IS NULL`; join organizer (`crm_users` left join) + attendees (`crm_meeting_attendees` ⋈
   `crm_users`) selecting `email` + `active` in a single grouped query (mirror `attendeesByMeeting`
   no-N+1 pattern); map rows through `resolveRecipients`. `now` MUST be the defaulted injectable param.
6. **P2-2a** ⭐ Empty-recipient exclusion (Failure Mode #5): within `getDueMeetingReminders`, after
   mapping each candidate meeting/checkpoint through `resolveRecipients()`, **DROP any candidate whose
   resolved recipient set is empty (`recipients.length === 0`)** — do NOT include it in the returned
   `MeetingReminderDue[]`. Because the notify endpoint only calls `markMeetingReminderSent` on returned
   candidates (Data-Flow step 2), an empty-recipient meeting is therefore NEVER marked-sent and its
   checkpoint column stays `NULL`, so a later-reactivated recipient / newly-added attendee can still be
   reached on a subsequent poll while the window is open. This exclusion lives in the due-query module,
   NOT in the endpoint — keep the endpoint dumb.
7. **P2-3** Implement pure `resolveRecipients(organizer, attendees)`: union, dedup by `userId`
   (Map/Set keyed by userId), keep only `active === true && email != null`. No DB, no env imports.
8. **P2-4** ⭐ Implement `markMeetingReminderSent(meetingId, checkpoint)` as the atomic
   compare-and-set: `db.update(crmMeetings).set({ [col]: new Date() }).where(and(eq(crmMeetings.id,
   meetingId), isNull(crmMeetings[col]))).returning({ id: crmMeetings.id })`; return
   `rows.length > 0`. **This exact shape is mandatory — no check-then-write.** (Failure Mode #1.)
9. **P2-5** Implement pure `groupMeetingRemindersByRecipient(due)`: one group per recipient email,
   preserving input order (mirror `groupRemindersByRep` structure).
10. **P2-6** Add Fully-Automated unit tests in `src/tests/meeting-reminders.spec.ts`: `resolveRecipients`
    dedup + active/email filtering; `groupMeetingRemindersByRecipient` grouping/order.
11. **P2-6a** ⭐ Add Fully-Automated unit test (Failure Mode #5 / P2-2a) asserting empty-recipient
    exclusion: given a meeting whose organizer + all attendees are all filtered out
    (`active === false` or null `email`) so `resolveRecipients()` returns `[]`, the due-query result
    EXCLUDES that meeting AND `markMeetingReminderSent` is never invoked for it. Structure the test so
    the recipient-resolution/exclusion path is unit-testable without a live DB — e.g. assert the
    exclusion on the pure mapping/filter step that `getDueMeetingReminders` applies to resolved rows
    (spy/mock `markMeetingReminderSent` to assert zero calls for the empty-recipient candidate). If the
    exclusion cannot be exercised without a real query, add the DB-side assertion to
    `meeting-reminders-db.spec.ts` (SKIP_DB) as well, but the pure exclusion assertion here is the
    Fully-Automated gate of record.
12. **P2-7** Add Hybrid DB-optional tests in `src/tests/meeting-reminders-db.spec.ts` (`SKIP_DB =
    !process.env.DATABASE_URL` gate, mirror `reminders-db.spec.ts`): due-query window filtering with
    injectable `now` (day/hour/past/deleted cases), and the atomic mark-sent race (poll-twice →
    single winner). Clean up test rows in `afterAll`.

### Phase 3 — Digest template + send function  (parallel-safe with Phase 2; needs Phase 2 types)
13. **P3-1** Create `src/lib/server/email-templates/meeting-reminder.ts` with pure
    `buildMeetingReminderDigestHtml({ appUrl, reminders })` — reuse the Veent palette/inline-CSS/table
    layout of `reminder.ts`; section by checkpoint; per-card link `${appUrl}/leads/{leadId}`; escape
    all interpolated strings via an `esc` helper. NO `$env`/`resend` imports.
14. **P3-2** Add `sendMeetingReminderDigest({ recipientEmail, reminders })` to `src/lib/server/email.ts`
    — copy `sendReminderDigest`'s structure: `'skipped'` when env unset, try/catch → `'failed'`,
    else `'sent'`. Subject e.g. `You have N meeting reminder(s) — Veent`. Do NOT touch `sendReminderDigest`.
15. **P3-3** Add Fully-Automated template tests to `src/tests/meeting-reminders.spec.ts`:
    `buildMeetingReminderDigestHtml` renders one card per reminder, includes start time + lead link,
    escapes HTML, and handles the empty-list case; `sendMeetingReminderDigest` returns `'skipped'`
    with unset env (mirror existing VE-C2 pattern).

### Phase 4 — Endpoint integration  (depends on Phases 2 and 3)
16. **P4-1** `GET /api/reminders/due/+server.ts`: after existing `due`, add
    `const meetingsDue = await getDueMeetingReminders();` and return `json({ due, meetingsDue })`.
    Keep read-only — MUST NOT call `markMeetingReminderSent`.
17. **P4-2** `POST /api/reminders/notify/+server.ts`: after the existing follow-up block, add the
    Data-Flow steps 1–4: fetch due → atomic mark each (keep winners) → `groupMeetingRemindersByRecipient`
    → `sendMeetingReminderDigest` per recipient (two separate emails per OI-1 CONFIRMED). Track
    `meetingSent` / `meetingSkipped`. Return `json({ sent, skipped, meetingSent, meetingSkipped })`.
18. **P4-3** Confirm no regression: `bun run check` + full `bun run test:unit:ci` green; existing
    `reminders.spec.ts` / endpoint consumers unaffected (additive-only response fields).

## Phase Completion Rules

- A phase is **CODE DONE** when its checklist items are implemented and `bun run check` passes for the
  touched files. It is **VERIFIED** only when its in-blast-radius test tiers (per Verification
  Evidence) are green — Fully-Automated gates must pass; Hybrid gates are run when `DATABASE_URL` is
  set (otherwise recorded as SKIP_DB known-gap, keeping AC3/AC5 CONDITIONAL).
- Phase 1 must be VERIFIED (migration generated + `bun run check` green) before Phase 2 starts —
  Phases 2/3 reference the new columns/types.
- Phases 2 and 3 may proceed in parallel (disjoint files) but both must be CODE DONE before Phase 4.
- The plan is **complete** only when: all 4 phases VERIFIED at their available tiers, `bun run
  test:unit:ci` fully green, and AC7 recorded as the accepted Agent-Probe known-gap. (OI-1 is already
  CONFIRMED — no pre-EXECUTE sign-off outstanding.)
- Do not mark any phase VERIFIED on Fully-Automated coverage alone where a Hybrid gate exists for that
  behavior — record the Hybrid outcome (run or SKIP_DB) explicitly.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `resolveRecipients` dedup + active/email filter unit test (`meeting-reminders.spec.ts`) | Fully-Automated | AC1/AC2 (recipient set = organizer ∪ attendees, deduped) + Failure Mode #2 |
| Empty-recipient candidate excluded from due list + mark-sent never invoked (`meeting-reminders.spec.ts`, P2-6a) | Fully-Automated | AC3 (no checkpoint burned with zero recipients) + Failure Mode #5 |
| Due-query window filter unit test — day-before ~24h, injectable `now` (`meeting-reminders-db.spec.ts`, SKIP_DB) | Hybrid | AC1 (day-before checkpoint produced) |
| Due-query window filter unit test — hour-before ~1h, independent of day (`-db.spec.ts`, SKIP_DB) | Hybrid | AC2 (hour-before checkpoint, independent) |
| Atomic mark-sent poll-twice race test — single winner (`-db.spec.ts`, SKIP_DB) | Hybrid | AC3 (at-most-once per checkpoint) |
| Due-query excludes soft-deleted + past meetings (`-db.spec.ts`, SKIP_DB) | Hybrid | AC5 (no reminder for deleted/past) |
| `buildMeetingReminderDigestHtml` renders meeting + time + lead link, escapes HTML (`meeting-reminders.spec.ts`) | Fully-Automated | AC4 (content identifies the meeting) |
| Pure helpers (grouping, recipient) tested with no DB / no env (`meeting-reminders.spec.ts`) | Fully-Automated | AC6 (logic testable without live n8n) |
| `sendMeetingReminderDigest` returns `'skipped'` with unset env | Fully-Automated | AC6 (graceful no-op path) |
| Real n8n → live inbox end-to-end delivery | Agent-Probe (known-gap residual) | AC7 (manual/staging smoke; matches `n8n-reminders-dispatch` backlog note) |

**Note on AC3 (idempotent-send):** the poll-twice unit assertion is Hybrid (DB-optional, requires
`DATABASE_URL` for the real atomic-update behavior) because the guarantee is a Postgres row-lock
property, not a pure-function property. The pure winner-filtering *logic* around it (which winners get
grouped/sent) is covered Fully-Automated, as is the empty-recipient exclusion (P2-6a). Known-gap for
AC3 = concurrent-poll behavior against a live Postgres has no CI harness (repo-wide gap) — kept
CONDITIONAL via the Hybrid gate, backlog stub below.

## Test Infra Improvement Notes

- No integration-DB harness exists in CI (repo-wide known gap — 4 Hybrid reminders gates already
  manual per `process/context/tests/all-tests.md`). The new `meeting-reminders-db.spec.ts` follows the
  same `SKIP_DB` pattern and is manual-run-only until that harness exists.
- Backlog stub (residual for AC3/AC7 Hybrid+Agent-Probe gaps): the existing
  `process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md` already tracks the
  live-delivery + integration-DB gap for the reminders domain; append a meeting-reminders line there
  during UPDATE PROCESS rather than creating a duplicate note.

## Dependencies & Sequencing

- Phase 1 → Phase 2 (columns must exist before the query/mark reference them).
- Phase 2 types → Phase 3 (template/send consume `MeetingReminderDue`); Phase 3 is otherwise
  parallel-safe with Phase 2 (disjoint files).
- Phases 2 + 3 → Phase 4 (endpoints wire both together).
- External: none new. Reuses `REMINDERS_ENDPOINT_SECRET`, Resend env (`RESEND_API_KEY`/`RESEND_FROM`/
  `APP_URL`), existing n8n poller (out of repo).

## Rollback Safety

- Phase 1 migration is purely additive (`ADD COLUMN` nullable) — reversible by dropping the two
  columns; no data loss, no backfill. Existing rows and queries unaffected.
- Phases 2–4 add new modules/functions and additive response fields — reverting is file-level (delete
  new files, revert 3 edits) with no data migration.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reminders/active/meeting-reminders_01-07-26/meeting-reminders_PLAN_01-07-26.md`
2. **Last completed step:** none — plan authored + PVL-supplemented (2 gaps addressed), not yet executed.
3. **Validate-contract status:** pending (VALIDATE re-runs V1 after this supplement; not written yet).
4. **Supporting context loaded:** SPEC (same folder), `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md` (routing), and the
   read-for-context source files listed under Touchpoints.
5. **Next step for a fresh agent:** re-run VALIDATE on this plan. OI-1 is CONFIRMED (two separate
   emails) — no pre-EXECUTE sign-off outstanding. Then execute Phase 1 first (schema+migration,
   high-risk), running `bun run check` + `bun run test:unit:ci` after each phase; enforce the exact
   atomic mark-sent shape at P2-4 and the empty-recipient exclusion at P2-2a.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl
re-validation-cycle: 1 (references meeting-reminders-pvl-iteration-001_REPORT_01-07-26.md + results.tsv in this task folder; baseline cycle 0 + fix cycle 1 recorded)

Parallel strategy: sequential (re-validation executed inline; delta = 2 supplement gaps on a self-contained plan)
Rationale: signal score 3/7 (S2 schema/API surface, S6 high-risk schema/migration, S7 5+ files) — MEDIUM; single self-contained COMPLEX plan, fresh context, narrow re-validation delta.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC2 (recipients) | resolveRecipients union+dedup by userId, keep active===true && email!=null | Fully-Automated | `bun run test:unit:ci` — resolveRecipients dedup + active/email filter (src/tests/meeting-reminders.spec.ts, P2-6) | B |
| AC3 (no-burn) / FM#5 | empty-recipient candidate excluded from due list AND markMeetingReminderSent never invoked for it | Fully-Automated | `bun run test:unit:ci` — P2-6a empty-recipient exclusion + zero mark-sent calls (src/tests/meeting-reminders.spec.ts) | B |
| AC4 (content) | buildMeetingReminderDigestHtml renders meeting + start time + lead link, escapes HTML, empty-list case | Fully-Automated | `bun run test:unit:ci` — template test (src/tests/meeting-reminders.spec.ts, P3-3) | B |
| AC6 (testable logic) | pure helpers + sendMeetingReminderDigest 'skipped' path with unset env | Fully-Automated | `bun run test:unit:ci` — grouping/recipient + skipped-path tests (src/tests/meeting-reminders.spec.ts) | B |
| Phase 1 (schema types) | CrmMeeting inferred type includes the 2 new nullable columns; migration additive ADD COLUMN | Fully-Automated | `bun run check` green after P1-1/P1-2 (svelte-check + tsc) | B |
| AC1 (day window) | due-query day-before ~24h window with injectable now | Hybrid | `bun run test:unit:ci` with DATABASE_URL set — day-window test (src/tests/meeting-reminders-db.spec.ts, SKIP_DB, P2-7) | C |
| AC2 (hour window) | due-query hour-before ~1h window, independent of day | Hybrid | `bun run test:unit:ci` with DATABASE_URL set — hour-window test (-db.spec.ts, SKIP_DB) | C |
| AC3 (race) | atomic mark-sent poll-twice -> single winner (Postgres row-lock) | Hybrid | `bun run test:unit:ci` with DATABASE_URL set — poll-twice race test (-db.spec.ts, SKIP_DB, P2-7) | D |
| AC5 (exclusions) | due-query excludes soft-deleted + past meetings | Hybrid | `bun run test:unit:ci` with DATABASE_URL set — deleted/past exclusion test (-db.spec.ts, SKIP_DB) | C |
| AC7 (live delivery) | real n8n -> live inbox end-to-end delivery | Agent-Probe | manual/staging smoke checklist (matches n8n-reminders-dispatch_NOTE_29-06-26.md) | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase/plan (CI-DB harness, repo-wide, tracked in n8n-reminders-dispatch backlog note); D — backlog test-building stub (named residual; keep-active).

C-4 reconciliation: strategy column carries only Fully-Automated / Hybrid / Agent-Probe. Known-Gap is not a strategy — the AC3/AC5/AC7 residuals are carried as gap-resolution C/D rows.

Legacy line form (retained for existing consumers):
- Pure helpers (recipients, exclusion, grouping, template, skipped-path): Fully-automated: `bun run test:unit:ci`
- Schema types + migration: Fully-automated: `bun run check`
- Due-query windows + atomic race + deleted/past exclusion: Hybrid: `bun run test:unit:ci` + precondition: DATABASE_URL set (SKIP_DB gate)
- Real n8n -> live inbox: known-gap: documented (Agent-Probe; n8n-reminders-dispatch backlog note)

Failing stub (P2-6 resolveRecipients, Fully-Automated):
test("should dedup organizer+attendees by userId and drop inactive/null-email", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveRecipients dedup + active/email filter") })

Failing stub (P2-6a empty-recipient exclusion, Fully-Automated):
test("should exclude empty-recipient candidate from due list and never invoke markMeetingReminderSent for it", () => { throw new Error("NOT IMPLEMENTED — TDD stub: empty-recipient exclusion + zero mark-sent calls") })

Failing stub (P3-3 template, Fully-Automated):
test("should render one card per meeting reminder with start time + lead link and escape HTML", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildMeetingReminderDigestHtml render/escape/empty-list") })

Failing stub (AC6 skipped-path, Fully-Automated):
test("should return 'skipped' from sendMeetingReminderDigest when env unset", () => { throw new Error("NOT IMPLEMENTED — TDD stub: sendMeetingReminderDigest skipped path") })

Failing stub (Phase 1 schema types, Fully-Automated):
test("should include dayReminderSentAt/hourReminderSentAt on CrmMeeting inferred type", () => { throw new Error("NOT IMPLEMENTED — TDD stub: bun run check passes with 2 new nullable columns") })

### Dimension findings

- Infra fit: PASS — additive nullable columns + drizzle-generated migration; reuses existing n8n poller, REMINDERS_ENDPOINT_SECRET, and Resend env; no new endpoint/scheduler/runtime surface. Insertion point (crmMeetings after deletedAt) confirmed in source.
- Test coverage: CONCERN — AC3/AC5 (and AC1/AC2) due-query/race behaviors are Hybrid SKIP_DB with no CI-DB harness (repo-wide known gap per all-tests.md Known Gaps). Pre-accepted cycle 0; not a new defect. Empty-recipient behavior now has a Fully-Automated gate (P2-6a).
- Breaking changes: PASS — response shapes additive only (meetingsDue, meetingSent, meetingSkipped); getDueReminders/sendReminderDigest/buildReminderDigestHtml/DueReminder untouched; new columns default NULL.
- Security surface: PASS — no new auth/billing/secret surface; reuses existing secret gate unchanged; mark-sent is a bounded additive data-write.
- Phase 1 (schema/migration) feasibility: CONCERN — high-risk schema/migration class, but mechanically clean (additive ADD COLUMN nullable, no backfill, reversible). Carried as execute-agent instruction E1.
- Phase 2 (due-query + atomic mark-sent + exclusion) feasibility: PASS — empty-recipient checkpoint-burn gap CLOSED (exclusion pre-filters in the read-only due-query before the atomic CAS is ever reached; race-safety property intact). Highest-risk edit = P2-4 atomic CAS; exact Drizzle shape mandated.
- Phase 3 (digest template + send) feasibility: PASS — pure template + no-throw send sibling; mirrors reminder.ts/sendReminderDigest.
- Phase 4 (endpoint integration) feasibility: PASS — additive wiring; GET stays read-only, POST marks-then-sends per locked ordering; two separate emails per OI-1 CONFIRMED.

### Execute-agent instructions

- E1 (Phase 1 entry): After `bun run db:generate`, verify generated SQL is `ALTER TABLE crm_meetings ADD COLUMN ...` for both columns, nullable, no default backfill. Do NOT hand-edit the SQL. Run `bun run check` before Phase 2.
- E2 (Phase 2, P2-4): Implement mark-sent as the exact atomic compare-and-set db.update(crmMeetings).set({[col]: new Date()}).where(and(eq(crmMeetings.id, id), isNull(crmMeetings[col]))).returning({id}); gate the send on non-empty return. No check-then-write.
- E3 (Phase 2, P2-2a): Implement empty-recipient exclusion INSIDE getDueMeetingReminders (drop recipients.length === 0 candidates before returning) — never in the endpoint. Guarantees markMeetingReminderSent is never invoked for an empty-recipient candidate.
- E4 (Phase 4, P4-1): GET /api/reminders/due stays read-only — MUST NOT call markMeetingReminderSent.

Open gaps:
- AC3/AC5 (and AC1/AC2) live-Postgres due-query/race coverage: known-gap: documented as backlog-tracked — no CI-DB harness (repo-wide); Hybrid SKIP_DB tests run manually with DATABASE_URL. Tracked in process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md (append meeting-reminders line at UPDATE PROCESS).
- AC7 real n8n -> live inbox delivery: known-gap: documented — out of repo control; manual/staging smoke only.

What this coverage does NOT prove:
- `bun run test:unit:ci` (Fully-Automated) proves: pure recipient resolution/dedup/filter, empty-recipient exclusion + zero mark-sent invocation, template rendering/escaping/empty-list, grouping order, and the 'skipped' env-unset path. It does NOT prove: any real Postgres query behavior, the day/hour due-window boundary math against a live DB, the atomic mark-sent race under concurrent polls, or soft-deleted/past exclusion at the DB layer (all Hybrid, DB-gated).
- `bun run check` (Fully-Automated) proves: the 2 new columns typecheck into CrmMeeting and the migration compiles. It does NOT prove: the migration applies cleanly against a real database or that ADD COLUMN executes without lock contention.
- Hybrid gates (`bun run test:unit:ci` + DATABASE_URL) prove the DB behaviors ONLY when a developer runs them locally with a live Postgres — they are SKIP_DB (skipped) in CI, so CI never proves them.
- No gate proves real end-to-end email delivery via live n8n -> a real inbox (AC7 Agent-Probe residual).

Gate: CONDITIONAL (0 FAILs; empty-recipient + OI-1 supplement gaps closed and re-verified; remaining CONCERNs limited to the 2 pre-accepted known-gaps; >=1 recorded PVL fix cycle satisfies V7 condition b)
Accepted by: session (PVL re-validation cycle 1, autonomous). Accepted concerns: (1) AC3/AC5/AC1/AC2 no CI-DB harness — repo-wide known gap, Hybrid SKIP_DB manual-run, backlog-tracked; (2) AC7 real n8n live-inbox delivery — out of repo control, manual smoke only. Both pre-accepted at cycle 0; no new supplement-worthy gaps this cycle.

## Autonomous Goal Block

```
SESSION GOAL: Meeting reminders — two per-meeting email reminders (1 day + 1 hour before startAt) to organizer + attendees, batched digest, exactly-once per checkpoint.
Charter + umbrella plan: N/A — single self-contained COMPLEX plan (not a phase program)
Autonomy: standard RIPER-5 — EXECUTE requires explicit "ENTER EXECUTE MODE"; validate-contract is CONDITIONAL (terminal, >=1 PVL fix cycle recorded).
Hard stop conditions / safety constraints:
- Phase 1 is a schema/migration surface — verify generated migration is additive ADD COLUMN nullable before running; never hand-edit generated SQL.
- Implement mark-sent ONLY as the atomic compare-and-set (UPDATE ... WHERE col IS NULL RETURNING id); never check-then-write.
- Empty-recipient exclusion lives in getDueMeetingReminders (P2-2a) — never mark-sent an empty-recipient candidate.
- GET /api/reminders/due stays read-only — never marks sent.
- Do not modify sendReminderDigest / buildReminderDigestHtml / getDueReminders / DueReminder (additive-only).
Next phase: EXECUTE — process/features/reminders/active/meeting-reminders_01-07-26/meeting-reminders_PLAN_01-07-26.md
Validate contract: inline in plan (## Validate Contract) — Gate CONDITIONAL
Execute start: Phase 1 first (schema+migration, high-risk). Gates: bun run check + bun run test:unit:ci (Fully-Automated) after each phase; Hybrid DB tests (SKIP_DB) run manually with DATABASE_URL; AC7 manual smoke. High-risk pack: schema/migration — verify additive migration.
```
