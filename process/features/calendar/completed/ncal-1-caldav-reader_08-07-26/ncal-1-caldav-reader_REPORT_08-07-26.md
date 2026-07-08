---
phase: ncal-1-caldav-reader
date: 2026-07-08
status: COMPLETE
feature: calendar
plan: process/features/calendar/completed/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md
---

# NCAL-1 Phase Report — CalDAV Read Client + GET /api/calendar/events

## What Was Done

- Added `ical.js`, `rrule`, and `fast-xml-parser` runtime deps to `package.json`.
- Created `src/lib/caldav/constants.ts`: env-driven `calendarCollectionUrl()` + `basicAuthHeader()`. `NEXTCLOUD_URL` includes scheme — no prefix added. `NEXTCLOUD_CALENDAR_SLUG` pre-encoded — no re-`encodeURIComponent`.
- Created `src/lib/caldav/reader.ts`: `fetchCalendarReport({ start, end })` using global `fetch` with WebDAV `REPORT` method. Multistatus XML (207) parsed with `fast-xml-parser` (DOMParser unavailable in Node). Typed `CalDavError` thrown on non-2xx; Nextcloud 401 maps to CalDavError with no credential/status in message. Debug logging added during troubleshooting was stripped before EVL confirmation.
- Created `src/lib/caldav/parser.ts`: `parseIcsToEvents(ics, { start, end })` via ical.js (`ICAL.parse`/`ICAL.Component`/`ICAL.Event`). RRULE expansion uses ical.js native `RecurExpansion` (honors VTIMEZONE — DST-safe). ATTACH/SOUND stripped. CATEGORIES → category mapping; URL → url field; VALUE=DATE → allDay.
- Created `src/routes/api/calendar/events/+server.ts`: session gate before try block; `?start`/`?end` validation produces 400 outside CalDavError catch; Nextcloud CalDavError → 503 generic; success → `{ success: true, events, count }`.
- Created 9 ICS fixture files in `src/tests/fixtures/` covering: folded lines, escaped chars, VTIMEZONE, all-day, RRULE, RRULE across DST, categories+url, no-categories-no-url, collection-multi (207 multistatus wrapper).
- Created `src/tests/caldav-parser.spec.ts`, `src/tests/caldav-reader.spec.ts`, `src/tests/calendar-events-endpoint.spec.ts` — all passing, requireAssertions honored.
- Produced risk evidence pack: 5 JSON files in `harness/` (risk-gate, verification, review-decision, adversarial-validation, context-snippets). Adversarial scenarios covered: Nextcloud-401 cred leak, XML injection via raw ?start/?end, RRULE-expansion DoS via wide window.
- Created `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md` — live CI harness stub.
- VERIFY step: curl against `http://localhost:5173/api/calendar/events` with real session cookie → 200 with real Nextcloud events. Both Hybrid rows (VE-live-report, VE-live-range) confirmed VERIFIED.

## What Was Skipped/Deferred

- Live-Nextcloud CalDAV CI harness (no credentialed harness in CI) — pre-accepted known-gap; backlog stub written.
- `undici REPORT` method acceptance test in CI — bundled into live-harness known-gap; confirmed working in live session.
- Calendar UI consumption of this endpoint — out of scope for NCAL-1 (later NCAL phase).

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `bun run check` | Fully-Automated | PASS (exit 0) |
| `bun run lint` | Fully-Automated | PASS (exit 0) |
| `bun run test:unit:ci` (360 tests) | Fully-Automated | PASS (exit 0) |
| caldav-parser.spec.ts: folded/escaped/vtimezone/allday/rrule/dst/categories/url/attach-strip | Fully-Automated | PASS |
| caldav-reader.spec.ts: buildReportBody/extraction/401-map/url-build | Fully-Automated | PASS |
| calendar-events-endpoint.spec.ts: 401/400/503/200 | Fully-Automated | PASS |
| Live REPORT round-trip (VE-live-report) | Hybrid | VERIFIED 2026-07-08 |
| Live time-range filter (VE-live-range) | Hybrid | VERIFIED 2026-07-08 |

## Plan Deviations

- `fast-xml-parser` added as a third runtime dep (plan named only `ical.js` + `rrule`). Mandated by validate-contract E1 instruction (DOMParser unavailable in Node — multistatus parse mechanism decision required at EXECUTE). No surprise: plan step 3 explicitly stated "add `fast-xml-parser`" as option (a); execute-agent followed it.
- Debug console.log statements were added to `reader.ts` during troubleshooting, then stripped before EVL. Net state is clean.
- VE-live-report and VE-live-range were projected as known-gaps (CONDITIONAL status) but were VERIFIED this session via curl with real session cookie — plan upgraded from CODE DONE → VERIFIED.

## Test Infra Gaps Found

- No live-Nextcloud CalDAV CI harness — same class as repo's live-DB CI harness gap. Backlog stub: `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`.
- No shared ICS fixture util — `src/tests/fixtures/*.ics` files added here are the reusable base for future NCAL phases.

## SPEC Achievement

No separate `*_SPEC_*.md` for NCAL-1 (single-phase inner-loop plan). Acceptance criteria scored from plan:

| AC | Criterion | Status |
|---|---|---|
| AC1 | 200 + `{ success, events, count }` for authenticated session | MET — VE-ep-200 green; live curl confirmed |
| AC2 | Event shape (category/url/allDay/attendees/etc.) | MET — VE-parse-multi/VE-categories/VE-url green |
| AC3 | Deterministic parse via ical.js (folded, escaped, VTIMEZONE) | MET — parser spec green |
| AC4 | RRULE expansion bounded to [start, end) | MET — VE-rrule/VE-rrule-dst green |
| AC5 | Security: no cred leak; 401→503; bad dates→400; no session→401 | MET — VE-ep-401/VE-ep-400/VE-ep-503/VE-reader-401 green; adversarial-validation on record |
| AC6 | All Fully-Automated gates green; Hybrid rows VERIFIED | MET — 360 tests green; live round-trip VERIFIED 2026-07-08 |

All 6 acceptance criteria: MET. No SPEC gaps.

## Closeout Packet

1. **Selected plan path:** `process/features/calendar/completed/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival
3. **What was finished:** 4 source files (constants/reader/parser/endpoint), 3 spec files, 9 fixture files, risk-evidence pack (5 JSON), backlog stub; `ical.js` + `rrule` + `fast-xml-parser` deps added
4. **Verified:** All 15 Fully-Automated gates green (360 tests); both Hybrid rows VERIFIED live this session. Nothing unverified.
4b. **Validate-contract:** Present (inline in plan, Gate: CONDITIONAL; all gaps now satisfied or VERIFIED)
5. **Cleanup done:** debug logging stripped; task folder archived to completed/; all-context.md updated (calendar status, caldav/ module, env vars, deps, CalDAV conventions section)
6. **Next valid state:** DONE — user commits separately
7. **Commit checkpoint:** Process commit belongs after UPDATE PROCESS (source commit already complete at EVL-green; this session = plan archival + context updates)
8. **Regression status:** First NCAL phase — no prior NCAL verified surfaces to regress against. N/A.
9. **SPEC achievement:** All 6 AC criteria MET (see table above)

**Drift score: HIGH (5 signals — 12+ files touched (+2), 3+ memory-worthy observations (+1), feature-folder structural change (+1), validate-contract status exceeded projected CONDITIONAL (+1))**

**Strongly recommend UPDATE PROCESS -- harness/protocol files touched.**

## Forward Preview

### Test Infra Found

- `src/tests/fixtures/*.ics` — 9 real ICS fixture files; reusable for future NCAL phases
- `caldav-parser.spec.ts` / `caldav-reader.spec.ts` — fixture-driven unit test patterns established

### Blast Radius Changes

- Files added vs. plan: `fast-xml-parser` dep (extra, mandated by validate-contract E1 instruction). All other files exactly as planned.
- No existing source files modified (only `package.json`/`bun.lock`).

### Commands to Stay Green

```
bun run check
bun run lint
bun run test:unit:ci
```

### Dependency Changes

Added to `dependencies`:
- `ical.js` — ICS parsing
- `rrule` — RRULE recurrence expansion
- `fast-xml-parser` — CalDAV multistatus XML extraction (server-only)
