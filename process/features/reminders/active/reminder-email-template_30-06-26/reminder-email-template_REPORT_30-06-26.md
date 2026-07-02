---
phase: reminder-email-template
date: 2026-06-30
status: COMPLETE
feature: reminders
plan: process/features/reminders/active/reminder-email-template_30-06-26/reminder-email-template_PLAN_30-06-26.md
---

# Reminder Email Template + Dispatch — Execute Report

## What Was Done

1. **NEW `src/lib/server/email-templates/reminder.ts`** — pure `buildReminderDigestHtml({ appUrl, reminders })`. No `$env`/`resend` imports. Inline-CSS, table-based 600px single-column layout. Brand palette (header `#c0362c`, page `#f3e9e6`, card `#fff`, body `#261617`, overdue badge `#e11d48`, due badge `#c2710c`). Overdue + Due Today sections rendered only when non-empty. Per-card: bold lead name, formatted date ("Jun 30, 2026 · 9:00 AM"), urgency chip, wine-red CTA `View Lead →` linking `${appUrl}/leads/${leadId}`. HTML-escaped lead names; empty list returns valid header+footer HTML.
2. **EDIT `src/lib/server/reminders.ts`** — added + exported pure `groupRemindersByRep()`. Groups by `repEmail`, preserves input order within group, drops null-rep entries.
3. **EDIT `src/lib/server/email.ts`** — imports the template; reads `env.APP_URL ?? ''`; builds html via `buildReminderDigestHtml`; new subject `You have N reminder(s) due — Veent`. No-key no-op path and try/catch log-don't-throw path unchanged; no `sendEmail()` delegation.
4. **NEW `src/routes/api/reminders/notify/+server.ts`** — POST handler mirroring `/api/reminders/due` secret auth (`REMINDERS_ENDPOINT_SECRET` Bearer; allow-all when unset). Calls `getDueReminders()` + `groupRemindersByRep()`; per-rep dispatch in try/catch; returns `json({ sent: groups.length, skipped })`.
5. **EDIT `src/tests/reminders.spec.ts`** — added `describe('buildReminderDigestHtml')` (lead name + CTA leadId; overdue section; empty list non-empty) and `describe('groupRemindersByRep')` (groups by rep, drops null). VE-C2 block untouched.
6. **EDIT `process/features/reminders/_GUIDE.md`** — added notify endpoint + template file to Key Source Files; added `APP_URL` env note.

## What Was Skipped or Deferred

- AC6 (Hybrid manual gate): `POST /api/reminders/notify` live curl + inbox check — needs live dev server + Postgres + `RESEND_API_KEY`/`RESEND_FROM`. Deferred to manual gate per plan posture.
- Live n8n dispatch + Viber/Telegram — pre-existing backlog (`n8n-reminders-dispatch_NOTE_29-06-26.md`).

## Test Gate Outcomes

- `bun run check` — 0 errors, 0 warnings.
- `bun run test:unit:ci` — 146 passed, 54 skipped (includes new template + grouping tests; VE-C2 still green).
- `bun run build` — exit 0 (only pre-existing `postgres` node-builtin externalization warnings).

## Plan Deviations

- FR4 step 3 (explicit early-return on empty due list): implemented implicitly — empty `due` yields `groups=[]` → `{ sent: 0, skipped: 0 }`, behaviorally identical. Within blast radius.

## Test Infra Gaps Found

- No integration harness for the notify endpoint (live DB + Resend). AC6 remains a manual Hybrid gate. Pure grouping helper (AC5) covers the routing logic in automated tests.

## Closeout Packet

- Selected plan: `process/features/reminders/active/reminder-email-template_30-06-26/reminder-email-template_PLAN_30-06-26.md`
- Finished: all 6 checklist items, all Fully-Automated ACs (AC1–AC5, AC7).
- Verified: check/test/build green. Unverified: AC6 (manual Hybrid).
- Remaining cleanup: UPDATE PROCESS archival + context note once AC6 manual gate is user-confirmed.
- Best next state: Keep in active/testing — code-complete (`CODE DONE`), pending AC6 manual confirmation before `✅ VERIFIED`.

## Forward Preview

- **Test Infra Found:** Vitest `$env/dynamic/private` mocked to `{ env: {} }` at module top — template tests are pure and unaffected.
- **Blast Radius Changes:** added `src/lib/server/email-templates/` dir; new `src/routes/api/reminders/notify/` route.
- **Commands to Stay Green:** `bun run check`, `bun run test:unit:ci`, `bun run build`.
- **Dependency Changes:** none. New optional env var `APP_URL`.
