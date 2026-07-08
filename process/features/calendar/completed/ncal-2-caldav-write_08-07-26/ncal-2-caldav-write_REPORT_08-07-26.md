---
phase: ncal-2-caldav-write
date: 2026-07-08
status: COMPLETE
feature: calendar
plan: process/features/calendar/completed/ncal-2-caldav-write_08-07-26/ncal-2-caldav-write_PLAN_08-07-26.md
---

# NCAL-2 CalDAV Write Client — EXECUTE Report

**TL;DR:** All 10 checklist items implemented. Post-EVL live-probe fix applied: `writer.ts` gained `toManilaDateTime()` (UTC+8 fixed offset) + `toN8nBody()` after live curl probing revealed n8n "Parse Input" node expects `date` (YYYY-MM-DD Manila local), `startTime` (HH:MM), `endTime` (HH:MM) — NOT ISO 8601 UTC. Live round-trip confirmed: POST→Nextcloud, GET read-back (url extracted from CRM-HREF, description clean), PUT update, DELETE confirmed deleted. 544 tests green. Categories known-gap: n8n does NOT store CATEGORIES in ICS despite receiving the field — non-blocking, backlog note added. All 17 existing Nextcloud events untouched. Plan: ✅ VERIFIED.

## What Was Done

| # | Item | File |
|---|---|---|
| 1 | `createCalendarEventSchema` + `updateCalendarEventSchema` (E1: `z.iso.datetime()` confirmed valid in zod 4.4.3) | `src/lib/zod/schemas.ts` |
| 2 | `n8nCalendarWebhookUrl()` / `n8nCalendarDeleteWebhookUrl()` / `n8nWebhookSecret()` | `src/lib/caldav/constants.ts` |
| 3 | `CalDavWebhookError` + `createEvent`/`updateEvent`/`deleteEvent` + private `postWebhook` (fail-closed on missing env) | `src/lib/caldav/writer.ts` (new) |
| 4 | `extractCrmHref()` — reads `CRM-HREF:` from DESCRIPTION, strips the line; `url` now derives from it | `src/lib/caldav/parser.ts` |
| 5 | `POST` handler — session-gate-first, Zod validate, uid gen, CRM-HREF embed, 502 mapping | `src/routes/api/calendar/events/+server.ts` |
| 6 | `PUT` + `DELETE` handlers — session-gate-first; PUT mirrors POST CRM-HREF embed (E2) | `src/routes/api/calendar/events/[uid]/+server.ts` (new) |
| 7 | CRM-HREF fixture | `src/tests/fixtures/event-crm-href.ics` (new) |
| 8 | Parser CRM-HREF spec (AC1/AC2/AC3) | `src/tests/caldav-parser-crm-href.spec.ts` (new) |
| 9 | Writer spec (AC4/AC5/AC6/AC9-unit) — mocked `$env/dynamic/private` via `vi.hoisted` + mocked fetch | `src/tests/caldav-writer.spec.ts` (new) |
| 10 | Gates run green; self-skipping e2e stub written (E3) | `e2e/caldav-write.e2e.ts` (new) |

Also (E1): updated the NCAL-1 regression assertion in `src/tests/caldav-parser.spec.ts` — the `URL:`-only fixture now expects `url: null` (deliberate contract change, raw `URL:` property no longer read).

## Post-EVL Fix (live probe revealed body format mismatch)

During EVL live curl probing, n8n's "Parse Input" node rejected ISO 8601 UTC datetimes. Root cause: n8n expects Manila-local date fields, not UTC. Fix applied to `writer.ts`:

- Added `toManilaDateTime(iso: string): { date: string; time: string }` — converts ISO 8601 UTC to UTC+8 fixed offset, returns `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`.
- Added `toN8nBody(payload)` — builds the n8n-expected body shape using `toManilaDateTime` for `date`/`startTime`/`endTime`.
- `postWebhook` now calls `toN8nBody` before `JSON.stringify`.

Categories known-gap: n8n receives the `categories` field but does NOT write `CATEGORIES` to the ICS — the field is silently discarded by n8n. Non-blocking (categories are metadata-only in this CRM). Backlog note: `process/features/calendar/backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`.

## What Was Skipped or Deferred

AC7 / AC8 / AC9-route / AC10 — pre-accepted Agent-Probe known-gaps. Blocked on the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) and the live CalDAV harness (`process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`). Recorded on disk as the self-skipping `e2e/caldav-write.e2e.ts`. No NEW gap introduced.

## Test Gate Outcomes

- `bun run check` — PASS (0 errors, 2560 files; 5 pre-existing unrelated warnings).
- `bun run test:unit:ci` — PASS (50 files, 544 tests passed, 165 pre-existing skips).
- `bun run test:unit -- src/tests/caldav-parser.spec.ts` — PASS (NCAL-1 regression).
- New specs (`caldav-writer.spec.ts`, `caldav-parser-crm-href.spec.ts`) — 23/23 assertions green.

## Plan Deviations

None. All items match the plan and validate-contract exactly. E1/E2/E3 execute instructions applied as specified. (One implementation detail within blast radius: writer-spec env mock uses `vi.hoisted` to satisfy vitest's mock-factory hoisting — required by the mocking framework, no behavioral impact.)

## Test Infra Gaps Found

None new. The two pre-existing pre-accepted backlog items (shared Playwright auth fixture + live CalDAV CI harness) remain the only blockers for AC7/AC8/AC9-route/AC10.

## SPEC Achievement

| Criterion | Strategy | Gate | Status |
|---|---|---|---|
| AC1 — CRM-HREF → event.url | Fully-Automated | `caldav-parser-crm-href.spec.ts` | MET |
| AC2 — No CRM-HREF → url null, description unchanged | Fully-Automated | `caldav-parser-crm-href.spec.ts` | MET |
| AC3 — Mixed DESCRIPTION → url extracted + remaining desc | Fully-Automated | `caldav-parser-crm-href.spec.ts` | MET |
| AC4 — Writer sends correct URL/method/secret/body | Fully-Automated | `caldav-writer.spec.ts` | MET |
| AC5 — Non-2xx → CalDavWebhookError; secret/upstream absent | Fully-Automated | `caldav-writer.spec.ts` | MET |
| AC6 — Zod rejects missing/invalid fields | Fully-Automated | `caldav-writer.spec.ts` / `schemas.spec.ts` | MET |
| AC7 — Unauth → 401 on all 3 routes | Agent-Probe (known-gap) | `e2e/caldav-write.e2e.ts` self-skipping | UNMET (pre-accepted) |
| AC8 — Bad payload → 400, no webhook | Agent-Probe (known-gap) | `e2e/caldav-write.e2e.ts` self-skipping | UNMET (pre-accepted) |
| AC9 unit — Error-shape invariant on throw | Fully-Automated | `caldav-writer.spec.ts` | MET |
| AC9 route — 502 mapping on n8n failure | Agent-Probe (known-gap) | blocked on auth fixture | UNMET (pre-accepted) |
| AC10 — Round-trip create → GET read-back shows url | Live probe (EVL) | Live Nextcloud confirmed | MET (EVL-confirmed) |
| NCAL-1 regression — existing read path preserved | Fully-Automated | `caldav-parser.spec.ts` green | MET |

SPEC Gaps (unmet, backlog stubs): AC7, AC8, AC9-route — all three are the same pre-existing shared Playwright auth fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). No new gap class introduced.

## Closeout Packet

- **Selected plan:** `process/features/calendar/completed/ncal-2-caldav-write_08-07-26/ncal-2-caldav-write_PLAN_08-07-26.md`
- **Finished:** all 10 checklist items + post-EVL body-format fix (`toManilaDateTime` + `toN8nBody`); high-risk evidence pack (`harness/`, validator-clean).
- **Verified:** Fully-Automated gates (AC1–AC6, AC9-unit, NCAL-1 regression) green; AC10 EVL live-round-trip confirmed.
- **Unverified:** AC7/AC8/AC9-route (pre-accepted Agent-Probe known-gaps — same shared auth fixture as all other features).
- **Classification:** Ready for UPDATE PROCESS archival — user confirmed known-gaps; EVL complete; live round-trip confirmed.

## Forward Preview

- **Test Infra Found:** none new; env vars `N8N_CALENDAR_WEBHOOK_URL` / `N8N_CALENDAR_DELETE_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET` are deploy-time wiring (unit tests mock them).
- **Blast Radius Changes:** 6 source files (2 new) + 4 test artifacts + 1 regression-assertion edit. Single app, no workspace fan-out.
- **Commands to Stay Green:** `bun run check`; `bun run test:unit:ci`; `bun run test:unit -- src/tests/caldav-parser.spec.ts`.
- **Dependency Changes:** none (no new packages; `crypto.randomUUID` + `fetch` are runtime globals).
