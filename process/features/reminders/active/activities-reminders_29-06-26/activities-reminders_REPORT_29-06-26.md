---
phase: activities-reminders
date: 2026-06-29
status: COMPLETE_WITH_GAPS
feature: reminders
plan: process/features/reminders/active/activities-reminders_29-06-26/activities-reminders_PLAN_29-06-26.md
---

# Activity Log + Reminders — EXECUTE Report

## What Was Done

All checklist items A1 → C2 implemented in strict order, plus the C6 fix.

- **A1** `resolveFollowUpAt()` (exported pure helper) + `insertActivity()` (transactional: `onConflictDoNothing` on the dedup target → returns `null` on 0 rows without touching the lead; else bumps `last_activity_at`/`updated_at`) in `src/lib/server/db/leads.ts`.
- **A2** New `POST /api/leads/[id]/activities` (`src/routes/api/leads/[id]/activities/+server.ts`): 401 no-session, 400 invalid body / leadId mismatch, validated `followUpInDays` from raw body, 409 duplicate, 201 created.
- **A3** `logTouch()` in `src/routes/leads/[id]/+page.svelte` rewired to real `fetch` (409 + error toasts, `invalidateAll()` on 201); removed the "Phase 6" stub toast and the now-unused `crm` import.
- **A4** `LogTouchForm.svelte` now sources all 7 channels from `ACTIVITY_CHANNELS` (added `call`, `meeting`, `other`).
- **B1b** `dbRowToLead(row, followUpAt?: string | Date | null)` — passes `followUpAt` into `computeAge`; adds `followUpAt` to the returned Lead. Backward-compatible (optional 2nd param). Fixed `listLeads`' `.map(dbRowToLead)` → `.map((row) => dbRowToLead(row))` (prevented array index leaking in as `followUpAt`).
- **B1** New root `src/routes/+page.server.ts` (Today view): non-deleted leads joined to latest booked `follow_up_at` (per-lead `max` aggregate), mapped via `dbRowToLead`, filtered to overdue/due/replied/cold. Returns `{ leads, me }`.
- **B2** New `src/routes/reminders/+page.server.ts`: current user's future follow-ups (`follow_up_at >= now`, not null, `rep_id = user`, lead not deleted), sorted ASC, mapped to `Lead[]`. Returns `{ leads }`.
- **C1** Real `getDueReminders()` + `startOfManilaDayUTC()` in `src/lib/server/reminders.ts`: activities → leads (inner) → users (left) join, `follow_up_at <= now`, sorted ASC, `overdue = followUpAt < Manila start-of-day`.
- **C2** `sendReminderDigest()` in `src/lib/server/email.ts`: no-ops with `console.warn` when `RESEND_API_KEY` unset; never throws (catches send errors, logs).
- **C6** `computeAge(lead, now = new Date())` — urgency now computed against live time, not the frozen `NOW` anchor. `mock-crm-client.ts` updated to pass `NOW` explicitly to preserve prototype mock fidelity.

New tests: `src/tests/reminders.spec.ts` (VE-A1, VE-B1, VE-C2).

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `bun run check` | PASS — 0 errors, 0 warnings (1984 files) |
| `bun run test:unit:ci` | PASS — 62 passed, 22 skipped |
| `bun run build` | PASS — exit 0 |
| VE-A1 `resolveFollowUpAt` | PASS (automated) |
| VE-B1 `dbRowToLead` overdue/due | PASS (automated) |
| VE-C2 `sendReminderDigest` no-key no-op | PASS (automated, `$env/dynamic/private` mocked to force the contract path) |

## What Was Skipped or Deferred

- **Hybrid gates VE-A1b / VE-A2 / VE-A2b / VE-C1** — require a running app + live Postgres; no integration-DB harness exists. Not executed in this session (manual). Pre-existing known infra gap.
- **Agent-Probe gates VE-A3 / VE-A4 / VE-B2** — UI/visual judgment; need a running app + seeded DB. Not run here.
- **Live n8n dispatch + Viber/Telegram** — Known-Gap, backlog `process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md` (already present).

## Plan Deviations

All within blast radius (leads.ts / dates.ts named in checklist).

1. **C6 implemented as optional `now` param on `computeAge` (default `new Date()`)** rather than removing the `NOW` constant. `NOW` is retained for display helpers (`relativeFromNow`, `todayLabel`, `formatDate`) and the mock client (passes `NOW` explicitly). Rationale: targeted, backward-compatible, fixes server-side urgency staleness without disturbing the design-frozen prototype surfaces.
2. **Fixed `listLeads().map(dbRowToLead)` → arrow wrapper.** Required: with the new optional 2nd param, `.map` would pass the array index as `followUpAt`. Correctness fix, not in the literal checklist.
3. **Added `followUpAt` to the `Lead` object returned by `dbRowToLead`** (the `Lead` type already declares it optional). Additive, harmless.

## Test Infra Gaps Found

- No integration-DB (real Postgres) harness — the 4 Hybrid gates stay manual. Tracked in the plan's Test Infra Improvement Notes.

## Observations (non-blocking)

- **Reminders page coverage:** B2 queries `follow_up_at >= now`; the existing `reminders/+page.svelte` only renders `overdue`/`due`/`cold` groups. A follow-up booked for a future day maps to urgency `normal` (per `computeAge`'s rolling-24h `due===0` rule) and therefore will not render — effectively only today's follow-ups show. This follows the plan/E-B2 literally; flagged for Agent-Probe judgment (acceptance #5) and possible future refinement.

## Closeout Packet

- **Selected plan:** `process/features/reminders/active/activities-reminders_29-06-26/activities-reminders_PLAN_29-06-26.md`
- **Finished:** A1–C2 + C6; 3 new automated tests; all 3 automated gates green.
- **Verified:** Fully-Automated gates (check/build/test, VE-A1/B1/C2). **Unverified:** Hybrid (DB) + Agent-Probe (UI) gates — require running app + Postgres.
- **Remaining cleanup:** UPDATE PROCESS archival after EVL + manual Hybrid/Agent-Probe runs.
- **Closeout classification:** Keep in active/testing (code-complete; runtime/manual verification pending).
- **Follow-up stubs created:** none new (n8n backlog NOTE already existed).
- **CONTEXT_PARTIAL:** none.

## Forward Preview

### Test Infra Found
- Vitest project `server` (node env, `requireAssertions: true`). `$env/dynamic/private` resolvable in tests; mock it to `{ env: {} }` to exercise no-key code paths deterministically.

### Blast Radius Changes
- Edited: `src/lib/server/db/leads.ts`, `src/lib/utils/dates.ts`, `src/lib/services/mock-crm-client.ts`, `src/lib/server/reminders.ts`, `src/lib/server/email.ts`, `src/routes/leads/[id]/+page.svelte`, `src/lib/components/leads/LogTouchForm.svelte`.
- New: `src/routes/api/leads/[id]/activities/+server.ts`, `src/routes/+page.server.ts`, `src/routes/reminders/+page.server.ts`, `src/tests/reminders.spec.ts`.

### Commands to Stay Green
- `bun run check` · `bun run test:unit:ci` · `bun run build`

### Dependency Changes
- None (no new npm packages, no schema/migration changes).
