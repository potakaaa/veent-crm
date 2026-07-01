---
name: note:meetings-db-integration-harness
description: "Backlog — promote the 4 meetings Hybrid DB gates to Fully-Automated once a DB integration test harness exists"
date: 01-07-26
feature: meetings
---

# Meetings — DB integration harness (backlog test-building stub)

## Why this exists

The meetings feature ships with four **Hybrid (manual, dev Postgres)** gates because the
repo has no DB integration-test harness (pre-existing repo-wide gap, see
`process/context/tests/all-tests.md` §Known Gaps). These four gates are currently verified
by hand and are NOT regression-protected in CI:

1. **DB write/soft-delete** — create / edit / soft-delete against real Postgres; `deletedAt`
   set, row not hard-deleted, hidden by `WHERE deleted_at IS NULL`.
2. **FK + unique-index integrity** — duplicate `(meetingId, userId)` blocked by unique index;
   delete lead → meetings cascade-delete; delete user → organizer/attendee set null.
3. **N+1 avoidance** — `GET /api/meetings` and `GET /api/leads/[id]/meetings` each issue a
   single joined query + one `inArray` attendee query, not N+1.
4. **403 authorization** — `PATCH`/`DELETE /api/meetings/[id]` deny a non-organizer rep (403),
   allow the organizer or a manager (200).

## What to do when picked up

Once a DB integration test harness exists (e.g. a disposable Postgres container + a seeded
fixture), promote all four gates above from Hybrid-manual to Fully-Automated. This is a
shared infra task, not meetings-specific — building the harness is explicitly out of scope
for the meetings plan.

## Source

- Plan: `process/features/meetings/active/meetings_01-07-26/meetings_PLAN_01-07-26.md`
  (Validate Contract → Backlog artifacts).
