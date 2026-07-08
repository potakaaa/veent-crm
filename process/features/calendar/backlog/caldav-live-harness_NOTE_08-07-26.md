---
name: report:caldav-live-harness-note
description: Known-gap — no credentialed live-Nextcloud CalDAV integration harness for NCAL-1 (REPORT round-trip + time-range + REPORT-method acceptance)
date: 08-07-26
metadata:
  node_type: memory
  type: report
  feature: calendar
  phase: NCAL-1
---

# NCAL-1 — Live Nextcloud CalDAV Harness (Known-Gap)

**TL;DR:** NCAL-1's CalDAV read client is CODE DONE with full Fully-Automated unit coverage, but three behaviors can only be proven against a real Nextcloud instance and have no CI harness. This is the same class as the repo's existing live-DB CI harness gap. Not a blocker for CODE DONE; blocks VERIFIED end-to-end.

## What is NOT proven automatically

1. **Live REPORT round-trip** — the real Nextcloud "Veent Team" calendar accepts a `REPORT calendar-query`, returns a well-formed 207 multistatus body, and lists all `.ics` resources.
2. **Live `time-range` filter honored** — the server actually applies the `c:time-range` filter server-side (our unit tests only prove we emit the correct filter).
3. **undici `REPORT` method acceptance** — global `fetch`/undici dispatches the non-standard WebDAV `REPORT` method to `team.veent.io` without rejecting it as a forbidden method.

## What IS proven (Fully-Automated, in CI)

- `buildReportBody` emits a correctly UTC-formatted `time-range` derived from Date args (no XML injection).
- `extractCalendarData`/`fetchCalendarReport` extract each `<c:calendar-data>` blob from a 207 multistatus fixture body.
- Upstream 401 → leak-free `CalDavError`; endpoint remaps to a generic 503 with no credential/status leak.
- `parseIcsToEvents` handles folded lines, `\n`/`\,` escapes, VTIMEZONE, all-day, RRULE (incl. a DST-crossing fixture), CATEGORIES/URL mapping, and ATTACH/SOUND stripping.

## How to close the gap

Options (pick one when a credentialed harness becomes worthwhile):
- A recorded-HTTP fixture (e.g. capture one real 207 response, replay it) — cheapest; proves parse but not live server behavior.
- A mock CalDAV server in CI (e.g. Radicale/xandikos container) — proves REPORT-method + multistatus shape without real creds.
- A gated live-integration test using a real Nextcloud app password from CI secrets, run out-of-band (not on every PR) — proves the true end-to-end round-trip.

## References

- Plan: `process/features/calendar/active/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md`
- Same-class gap: repo live-DB CI harness (calendar / reminders / manager-dashboard Hybrid gates).
