---
name: plan:meeting-reminders-spec
description: "Product-discovery requirements doc — email reminders for upcoming meetings (1 day + 1 hour before)"
date: 01-07-26
feature: reminders
---

# Meeting Reminders — SPEC

## Summary

Right now, when a sales rep books a meeting with a lead in the CRM, nobody gets an automatic
heads-up before it happens — the only reminders that exist today are for lead follow-ups, not
meetings. This feature adds two automatic email reminders per meeting: one sent about a day
before the meeting, and one sent about an hour before. The goal is simple — reps (and anyone
else invited) shouldn't miss a scheduled meeting because they forgot to check the calendar.

## User Stories / Jobs To Be Done

1. **As a sales rep with a meeting booked**, I want to get an email reminder the day before and
   again an hour before, so that I don't miss or forget about it.
2. **As a sales rep who books a meeting for a colleague or invites teammates as attendees**, I
   want the right people to be notified — not just me — so that everyone involved shows up
   prepared. *(Decided: organizer + all attendees, explicitly both — see Decisions Q1.)*
3. **As a sales rep whose meeting gets rescheduled**, I want reminders to reflect the current
   meeting time, not a stale one, so that I'm not reminded about a meeting at the wrong time (or
   not reminded about the real one at all). *(Decided: already-sent checkpoints do not re-fire on
   reschedule; not-yet-sent checkpoints use the new time — see Decisions Q2. Documented as a known
   v1 limitation.)*
4. **As the system/ops owner**, I want each reminder to be sent exactly once per meeting (no
   duplicate day-before or hour-before emails piling up in someone's inbox), so that reminders
   stay trustworthy and don't get tuned out as spam.

## What The User Wants (Behavioral Outcomes)

- When a meeting is scheduled for a future time, the system tracks two reminder checkpoints for
  it: "1 day before" and "1 hour before" the meeting's start time.
- When either checkpoint is reached, an email reminder goes out automatically — no manual action
  required by the rep.
- The reminder email tells the recipient which meeting it's about, when it starts, and gives them
  a way to get back to the lead/meeting in the CRM (consistent with how the existing follow-up
  reminder emails link back to the lead).
- **Recipients are the meeting organizer plus all attendees**, explicitly both — even if the
  organizer isn't separately present in the attendee list (Decisions Q1).
- **Delivery is batched/digest-style, not one email per meeting.** If a rep has more than one
  meeting-reminder checkpoint due in the same poll cycle, they receive a single email listing all
  of them — following the same batching pattern the existing follow-up reminder digest already
  uses (Decisions Q3). *(This diverges from an earlier "one email per meeting" framing considered
  during SPEC drafting — batching is the locked decision.)*
- Each of the two reminders (day-before, hour-before) fires only once per meeting — checking again
  later does not re-send an already-sent reminder.
- This reuses the same delivery mechanism the CRM already has for follow-up reminders: an external
  scheduler (n8n) periodically asks the CRM "what's due right now?" and the CRM sends the emails.
  No new always-on server process is introduced.
- Meetings that are cancelled/deleted, or whose time changes, are reflected in what "due" means at
  the moment the scheduler checks — the system does not blindly fire a reminder for a meeting time
  that no longer applies. **Reschedule behavior (decided):** an already-sent checkpoint stays sent
  and does not re-fire for the new time; a not-yet-sent checkpoint is evaluated against the new
  time. This is a known, accepted v1 limitation (Decisions Q2).

## Flow / State Diagram

```text
Meeting created/updated (crm_meetings.start_at = T)
        |
        v
   [Reminder checkpoints tracked for this meeting]
        |
        |-- checkpoint: T - 1 day  ---- not yet due ----> (no email)
        |-- checkpoint: T - 1 hour ---- not yet due ----> (no email)
        |
        v  (external scheduler polls CRM periodically)
   Poll: "what meeting reminders are due right now?"
        |
        +-- day-before checkpoint reached AND not yet sent
        |        |
        |        v
        |   Queue "meeting tomorrow" reminder --> mark day-before SENT for this meeting
        |
        +-- hour-before checkpoint reached AND not yet sent
        |        |
        |        v
        |   Queue "meeting in 1 hour" reminder --> mark hour-before SENT for this meeting
        |
        +-- already sent for this checkpoint ----> skip, no duplicate email
        |
        +-- meeting deleted/cancelled before checkpoint ----> no email for that checkpoint
                 (time-change after a reminder already fired: already-sent checkpoint does NOT
                 re-fire for the new time — decided, Decisions Q2, known v1 limitation)

Queued reminder(s) for organizer + all attendees --> grouped into ONE digest email per
recipient per poll cycle (Decisions Q3, same pattern as existing follow-up digest)
        |
        v
Recipient receives digest email --> click through --> lands on the meeting's lead detail page
```

## Acceptance Criteria (Testable Outcomes)

> **Note on delivery shape:** per Decisions Q3, meeting reminders are delivered as part of a
> batched digest email (same pattern as `sendReminderDigest` / `buildReminderDigestHtml`) rather
> than a standalone email per meeting. Acceptance criteria below describe when a reminder
> *checkpoint* is produced/due and who it's addressed to — the exact digest packaging (extending
> the existing follow-up digest to include a "meetings" section, vs. a similar-but-separate
> meeting digest) is an INNOVATE/PLAN decision, not decided here.

1. **A meeting scheduled more than 1 day out produces a "day-before" reminder checkpoint around
   24 hours before its start time**, addressed to the meeting organizer plus all attendees
   (organizer included even if not separately listed as an attendee — Decisions Q1). The
   checkpoint may be delivered inside a batched digest email rather than a dedicated single email
   (Decisions Q3).
   `proven by:` meeting-reminders day-before dispatch scenario (new Vitest unit test on the due-query function, analogous to `src/tests/reminders.spec.ts`)
   `strategy:` Fully-Automated

2. **A meeting produces an "hour-before" reminder checkpoint around 1 hour before its start
   time**, independent of whether the day-before reminder fired, addressed to the same
   organizer + all-attendees recipient set (Decisions Q1), and subject to the same digest-batching
   behavior (Decisions Q3).
   `proven by:` meeting-reminders hour-before dispatch scenario (new Vitest unit test)
   `strategy:` Fully-Automated

3. **Each of the two reminder types is sent at most once per meeting** — polling the due-check
   endpoint repeatedly after a reminder has already been sent does not produce a second email for
   that same checkpoint. Rescheduling a meeting does not re-fire a checkpoint that already sent
   (Decisions Q2, known v1 limitation).
   `proven by:` idempotent-send unit test (poll-twice, assert single send) — mechanism TBD in PLAN
   `strategy:` Fully-Automated

4. **The reminder content identifies the specific meeting** (lead/meeting context, start time, and
   a link back into the CRM), consistent with the existing branded reminder email look, whether
   delivered standalone or as one item inside a digest (Decisions Q3).
   `proven by:` email-template unit test (pure template function, analogous to existing `reminder.ts` template tests)
   `strategy:` Fully-Automated

5. **Meetings with no `start_at` in the future, or soft-deleted meetings, never produce a
   reminder.**
   `proven by:` due-query filter unit test (deleted/past meetings excluded)
   `strategy:` Fully-Automated

6. **The due-reminders retrieval works without a live n8n instance** — i.e., the CRM-side logic
   (what's due, who to notify, dedup, digest grouping) is independently testable and correct
   regardless of how or when the external scheduler polls it.
   `proven by:` unit tests directly against the due-query and grouping functions (no live poller needed)
   `strategy:` Fully-Automated

7. **End-to-end delivery via the real external n8n poller** (the actual scheduled email hitting a
   real inbox on a live provider) is NOT verifiable by an automated test in this codebase — it
   depends on infrastructure outside this repo's control.
   `proven by:` manual verification checklist / staging smoke test after deploy
   `strategy:` Agent-Probe (known-gap residual — same pattern as the existing `n8n-reminders-dispatch` backlog note for follow-up reminders)

## Out Of Scope

- Any reminder channel other than email (no SMS, Viber, Telegram, push notification, in-app
  toast reminder for meetings specifically).
- Reminder timing windows other than 1-day and 1-hour before (no configurable/custom reminder
  offsets, no reminder-after-meeting/no-show follow-up).
- Building or configuring the actual n8n workflow/cron schedule (this repo does not own the n8n
  instance — it only exposes/consumes secret-authed endpoints, matching the existing
  `/api/reminders/due` pattern).
- A user-facing UI to customize or opt out of meeting reminders (v1 sends to everyone eligible,
  no per-user preference toggle).
- Real-time/instant push the moment a meeting is created close to its start time in a way that
  requires sub-poll-interval precision (Decisions Q4 — precision depends on external poll cadence,
  not something this repo controls; no max-lateness guarantee required).
- Retroactive reminders for meetings already in the past at the time this feature ships.
- Timezone selection per meeting/user — this SPEC assumes the existing fixed `Asia/Manila` offset
  convention used elsewhere in reminders continues to apply for any day-boundary-style logic (the
  1-hour/1-day windows themselves are relative to `start_at`, not tied to a calendar day boundary,
  so timezone impact here is expected to be minor — flagged for INNOVATE/PLAN to confirm).

## Constraints

- Must reuse the existing `crm_meetings` table's `start_at` as the source of truth for timing —
  no new meeting-time field.
- Must reuse the existing Resend-backed email sending path (`src/lib/server/email.ts`) — no new
  email provider.
- Must follow the existing "external scheduler polls a secret-authed CRM endpoint" architecture —
  no new always-on scheduler/cron process introduced inside this repo.
- Recipient email addresses must come from `crm_users.email` (already the source of truth for
  rep/user email elsewhere in reminders).
- Recipients are organizer + all attendees, explicitly both (Decisions Q1).
- Delivery is batched/digest-style per recipient per poll cycle, following the existing
  `sendReminderDigest`/`buildReminderDigestHtml` batching pattern (Decisions Q3). The exact digest
  packaging mechanism (extend the existing follow-up digest vs. a separate meeting-reminder
  digest) is deliberately left to INNOVATE/PLAN.
- Soft-delete convention applies: a soft-deleted meeting (`crm_meetings.deleted_at` set) must
  never produce a reminder.
- Exactly-once-per-checkpoint delivery is a hard requirement (Acceptance Criterion 3) — the
  specific tracking mechanism (new column(s) vs. a send-log table) is explicitly NOT decided here;
  that is an INNOVATE/PLAN decision informed by this requirement.
- Reschedule handling: already-sent checkpoints do not re-fire for a new time; not-yet-sent
  checkpoints use the new time (Decisions Q2, known v1 limitation).
- Timing precision is window-based, accepting poll-interval-bound slop; no specific max-lateness
  guarantee is required (Decisions Q4).
- This SPEC's working location is `process/features/reminders/active/meeting-reminders_01-07-26/`
  because `reminders` already owns the reusable dispatch/email machinery (n8n endpoints, email
  templates, due-query patterns) that this feature builds on. INNOVATE/PLAN may reconsider whether
  the eventual code changes should instead live under (or be split across) the `meetings` feature
  folder, since `crm_meetings` is the data source being read.

## Decisions

The following product decisions are locked. PLAN may proceed against these.

**Q1 — Recipients: who gets the reminder emails?**
**Decided: (c) Organizer + all attendees, explicitly both** — the meeting organizer
(`crm_meetings.organizerId`) always receives the reminder, plus everyone in
`crm_meeting_attendees`, even if the organizer isn't separately present in the attendee list.
Matches how a real calendar invite works and avoids a rep missing their own meeting because they
weren't marked as an "attendee."

**Q2 — What happens if a meeting is edited or deleted after a reminder window has already
passed/fired?**
**Decided: (a) — dedup/tracking is keyed to the meeting record and checkpoint type only**, not
the specific `start_at` value at send time. If a meeting is rescheduled, an already-sent
checkpoint stays sent (no re-fire), but a not-yet-sent checkpoint is evaluated against the new
time. Meeting deletion simply removes it from future due-checks. **This is documented as a known
v1 limitation**: if you reschedule after a reminder already fired, that reminder is not resent for
the new time.

**Q3 — One email per meeting, or a digest of multiple meetings in one email (like today's
follow-up reminders)?**
**Decided: (b) Digest/batch**, same pattern as the existing follow-up reminder digest
(`sendReminderDigest` / `buildReminderDigestHtml`). If a rep has multiple meeting-reminder
checkpoints due in the same poll cycle, they receive ONE email listing all of them. **This is the
non-default choice** — the SPEC's own analysis had recommended one-email-per-meeting to avoid
burying an urgent hour-before reminder inside a longer digest, but the user explicitly chose
batching for consistency with the existing reminder UX. **Flag for INNOVATE/PLAN:** this means
meeting reminders will need either (i) an extension of the existing follow-up digest email to
include a "meetings" section alongside follow-ups, or (ii) a similar-but-separate digest
specifically for meeting reminders. Which of these two shapes to build is explicitly an
INNOVATE/PLAN decision — this SPEC only locks that batching (not per-meeting individual emails) is
the required behavior.

**Q4 — Delivery timing precision: is a tolerance window acceptable?**
**Decided: (a) Window-based, accept slop.** A checkpoint is "due" if the meeting's `start_at`
falls within a defined window relative to now (e.g., due when `now` is within 1 hour of
`start_at` for the hour-before checkpoint), and hasn't been sent yet. Precision is bounded by n8n
poll frequency, which is outside this repo's control. No specific max-lateness guarantee is
required.

**Q5 — Scope confirmation.**
**Decided: confirmed as scoped.** This feature is exactly the two reminder timings (1-day,
1-hour) described above, with no other reminder types, reusing the existing
n8n-polls-a-CRM-endpoint architecture (no new scheduler infrastructure) — same as how the current
follow-up-reminders feature works.

## Background / Research Findings

- **Existing reminder system is follow-up-based, not meeting-based.** `getDueReminders()` in
  `src/lib/server/reminders.ts` queries `crm_activities` rows where `follow_up_at <= now()`,
  joined to lead + rep. No meeting-based reminder exists today; this is new ground built on the
  same pattern.
- **Email sending is real, not stubbed.** `src/lib/server/email.ts` is fully wired to Resend
  (`sendEmail`, `sendReminderDigest`), gated by `RESEND_API_KEY`/`RESEND_FROM`/`APP_URL` env vars;
  no-ops gracefully (`'skipped'`) if unset.
- **A reusable branded email template pattern exists** at
  `src/lib/server/email-templates/reminder.ts` (`buildReminderDigestHtml`) — pure, unit-testable,
  Veent-branded inline-CSS table with per-item cards + CTA. A meeting-reminder email needs its own
  template (different content: meeting time, meeting URL, attendees) but should follow this same
  pure-function, unit-testable pattern. Given the Q3 digest decision, this existing digest
  template is now the most directly relevant precedent for PLAN to build on.
- **Two secret-authed n8n pull endpoints already exist**: `GET /api/reminders/due` and
  `POST /api/reminders/notify`. No n8n workflow/cron config lives in this repo — an external n8n
  instance polls these endpoints on an interval unknown to the codebase. Meeting reminders will
  inherit this same "external poller" architecture; there is no in-repo scheduler today or
  proposed.
- **Critical gap — no exactly-once send tracking exists anywhere yet.** The current follow-up
  reminder model is idempotent-by-recomputation (same due item returned on every poll — no dedup
  needed because a human rep just keeps seeing the same due item until they act on it). This does
  NOT work for meeting reminders, which need two DISTINCT one-time sends per meeting. Closing this
  gap is a genuine schema/migration decision, deliberately left to INNOVATE/PLAN (see Constraints).
- **Recipient data exists but isn't fully selected today.** `crm_meetings` has `organizerId` (FK
  to `crm_users`) and `crm_meeting_attendees` (M:N to `crm_users`). `crm_users.email` exists, but
  the current meetings query code only selects attendee `name`, not `email` — trivial to extend.
  Recipient scope is now locked (Decisions Q1: organizer + all attendees).
- **Timezone convention**: existing reminders use `REMINDER_TZ = 'Asia/Manila'` (fixed +08:00) for
  day-boundary logic in the follow-up system. Meeting `startAt` is a plain `timestamptz`. Since
  the 1-day/1-hour windows here are relative offsets from `start_at` rather than calendar-day
  boundaries, timezone impact is expected to be minor, but flagged for INNOVATE/PLAN to confirm.
- **Feature-folder ambiguity noted, not resolved.** Both `process/features/reminders/` (owns
  dispatch/email machinery) and `process/features/meetings/` (owns the `crm_meetings` data
  source) are plausible homes. This SPEC lives under `reminders/active/` because the dominant new
  surface is dispatch/email logic, but INNOVATE/PLAN may reconsider the eventual code split.
- **Existing test pattern for this domain**: `src/tests/reminders.spec.ts` covers the follow-up
  reminders logic (VE-A1 `resolveFollowUpAt`, VE-B1 `dbRowToLead` urgency, VE-C2
  `sendReminderDigest` no-key path) — 62 unit tests total as of 2026-06-29 per
  `process/context/tests/all-tests.md`. New meeting-reminder logic should follow the same
  Vitest-first, DB-optional testing pattern (`src/lib/server/db/index.ts` uses a lazy pool; unit
  tests never open a real DB connection). Integration tests against a live DB remain a known gap
  for the whole reminders domain (4 Hybrid gates still manual per that doc) — Agent-Probe/manual
  verification for true end-to-end n8n delivery (Acceptance Criterion 7) is consistent with the
  existing `n8n-reminders-dispatch` backlog note pattern for follow-up reminders.
