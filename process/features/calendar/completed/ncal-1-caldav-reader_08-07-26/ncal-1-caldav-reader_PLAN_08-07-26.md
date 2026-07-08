---
name: plan:ncal-1-caldav-reader
description: NCAL-1 — CalDAV read client (src/lib/caldav/*) + session-gated GET /api/calendar/events reading the shared Nextcloud "Veent Team" calendar and returning parsed event JSON
date: 08-07-26
feature: calendar
---

# NCAL-1 — CalDAV Read Client + GET /api/calendar/events

- **Date**: 08-07-26
- **Status**: ✅ VERIFIED — all gates green; live Nextcloud round-trip confirmed 2026-07-08 (curl → real events, 200 OK); known-gaps satisfied
- **Complexity**: SIMPLE (one-session, ~4 new source files + fixtures + tests, no schema/auth-surface change)
- **Feature:** calendar
- **Context:** routed from `process/context/all-context.md` + `process/context/tests/all-tests.md`

**TL;DR:** Add a server-only CalDAV HTTP read client under `src/lib/caldav/` that issues a `REPORT calendar-query` against the shared Nextcloud "Veent Team" calendar, parses returned `.ics` via `ical.js` (recurrence expanded with `rrule`), and exposes the results as a defined JSON shape through a new session-gated `GET /api/calendar/events` endpoint. Credentials stay server-side; ATTACH/SOUND stripped on parse; 401 from Nextcloud → 503 (never leak creds). Proven by Vitest fixture-driven unit tests + endpoint guard tests.

---

## Overview

NCAL-1 introduces read-only integration with Nextcloud's CalDAV so the CRM calendar surface can eventually render the shared team calendar. This plan covers ONLY the server client + endpoint + tests. No UI wiring, no writes, no schema changes.

## Goals

- Server-only CalDAV read client (URL builder, Basic Auth header, REPORT request, ICS parse).
- New `GET /api/calendar/events` endpoint, session-gated via existing Better Auth `locals.user`.
- Deterministic `.ics` → JSON parsing (folded lines, escapes, VTIMEZONE, all-day, RRULE, CATEGORIES, URL) using a battle-tested library — never a hand-rolled ICS parser.
- Security: credentials never reach the browser; ATTACH + SOUND stripped; Nextcloud 401 masked as 503.
- Fully-automated Vitest coverage for parsing + endpoint auth/error handling.

## Scope

**In scope:** `src/lib/caldav/{constants,reader,parser}.ts`, `src/routes/api/calendar/events/+server.ts`, `.ics` fixtures + specs in `src/tests/`, two new deps (`ical.js`, `rrule`), plus a multistatus-XML parse mechanism decision (see checklist step 3).

**Out of scope:** Calendar UI consumption of this endpoint (later NCAL phase), CalDAV writes/sync, per-user calendars, `hooks.server.ts` changes, DB persistence, live-Nextcloud integration test harness.

---

## Acceptance Criteria

- **AC1** — `GET /api/calendar/events` returns `200 { success: true, events: CalendarEvent[], count }` for an authenticated session, with `count === events.length`.
- **AC2** — Every returned event matches the Public Contracts shape; `category` maps from `CATEGORIES` (`null` when absent), `url` from `URL` (`null` when absent), `allDay` true only for `VALUE=DATE` `DTSTART`, `attendees` `[]` when none.
- **AC3** — Parsing is deterministic across folded lines, escaped `\n`/`\,`, `VTIMEZONE`, all-day, and `RRULE` (including an RRULE crossing a DST boundary), using `ical.js` — never a hand-rolled parser.
- **AC4** — `RRULE` occurrences are expanded and bounded to `[start, end)`; the default window is the current month when `?start`/`?end` are omitted.
- **AC5** — Security: `NEXTCLOUD_*` credentials never reach the client or a plaintext log; `ATTACH`/`SOUND` are stripped on parse; Nextcloud `401` surfaces to the client as `503` generic; unparseable `?start`/`?end` → `400` (not `503`); no CRM session → `401`.
- **AC6** — All Fully-Automated Verification Evidence rows are green (`bun run check`, `bun run lint`, `bun run test:unit:ci` exit 0). The two live-Nextcloud Hybrid rows are recorded as accepted known-gaps with the backlog stub written (CODE DONE), or satisfied against a live instance (VERIFIED).

## Touchpoints

Files to CREATE:

- `src/lib/caldav/constants.ts` — env-driven calendar collection URL builder + `basicAuthHeader()` helper.
- `src/lib/caldav/reader.ts` — `fetchCalendarReport({ start, end })`: builds + sends the REPORT request, extracts `.ics` blobs from the multistatus response (or throws a typed CalDAV error on non-2xx).
- `src/lib/caldav/parser.ts` — `parseIcsToEvents(ics, { start, end })`: `.ics` → typed `CalendarEvent[]` via `ical.js`; RRULE expansion via `rrule`; strips ATTACH/SOUND; maps CATEGORIES/URL.
- `src/routes/api/calendar/events/+server.ts` — `GET` handler: session gate → reader → parser → `json({ success, events, count })`.
- `src/tests/fixtures/*.ics` — real fixtures (folded lines, escaped `\n`/`\,`, VTIMEZONE, all-day `VALUE=DATE`, RRULE, CATEGORIES, URL, plus a minimal multi-VEVENT multistatus collection response).
- `src/tests/caldav-parser.spec.ts` — parser unit tests.
- `src/tests/caldav-reader.spec.ts` — reader unit tests (REPORT body XML shape + multistatus `.ics` extraction + 401→CalDavError mapping, `fetch` mocked). **(added at VALIDATE)**
- `src/tests/calendar-events-endpoint.spec.ts` — endpoint session-gate + Nextcloud-error-mapping + invalid-date tests (mock reader + `$env/dynamic/private`).

Files to READ for context (not modified):

- `src/routes/api/nav-counts/+server.ts` — canonical `if (!locals.user) throw error(401)` + `json()` pattern.
- `src/tests/reminders-due-endpoint.spec.ts` — `vi.hoisted` + `vi.mock('$env/dynamic/private')` + direct-`GET`-import endpoint test pattern.
- `src/app.d.ts` — `Locals.user: SessionUser | null` shape.
- `package.json` — add deps.

Config touched:

- `package.json` / `bun.lock` — add `ical.js` and `rrule` runtime deps (`bun add ical.js rrule`), plus the chosen multistatus-XML parser if a dep is used (see step 3).

## Public Contracts

**HTTP:** `GET /api/calendar/events?start=<ISO8601>&end=<ISO8601>` (both optional; defaults documented below). Session-gated — unauthenticated → `401`.

Success (`200`):

```json
{
  "success": true,
  "events": [
    {
      "uid": "...", "title": "...", "start": "...", "end": "...", "allDay": false,
      "location": "...", "description": "...", "color": "#22c55e", "status": "CONFIRMED",
      "organizer": { "name": "...", "email": "..." },
      "attendees": [{ "name": "...", "email": "..." }],
      "lastModified": "...", "category": "meeting", "url": "/meetings/abc-123"
    }
  ],
  "count": 1
}
```

Field rules:
- `category` — from iCal `CATEGORIES`; `null` when absent; allowed values `meeting | golive | eventstart | team-event`.
- `url` — from iCal `URL`; `null` when absent.
- `start`/`end`/`lastModified` — ISO 8601 strings.
- `allDay` — `true` when `DTSTART` uses `VALUE=DATE`.
- `attendees` — `[]` when none.
- ATTACH and SOUND properties are never emitted (stripped on parse).

Error contract:
- Missing/invalid CRM session → `401` (SvelteKit `error(401, 'Unauthorized')`).
- Unparseable `?start`/`?end` → `400` (SvelteKit `error(400, ...)`) — must NOT be remapped to 503.
- Nextcloud returns `401` (bad app password) → endpoint returns `503` with a generic message; the upstream credential/status is NEVER echoed to the client or logged in plaintext.
- Any other Nextcloud non-2xx → `503` generic message.

**Env vars (in `.env`, never committed):** `NEXTCLOUD_URL` (includes scheme), `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD`, `NEXTCLOUD_CALENDAR_SLUG` (pre-encoded — do NOT re-`encodeURIComponent`).

**Default date range:** when `?start`/`?end` are absent, default to the current month window `[first-of-month 00:00:00Z, first-of-next-month 00:00:00Z)`. Range is passed both to the CalDAV `time-range` filter AND to the parser's RRULE expansion window.

## Blast Radius

- **Files:** 4 new source + 3+ new fixtures + 3 new spec files. Zero existing source files edited (only `package.json`/`bun.lock` for deps).
- **Packages:** single app (`veent-crm`). No workspace fan-out.
- **Risk class:** LOW-MEDIUM. New outbound HTTP to an external service + credential handling (secrets/trust-boundary). No DB, no schema, no auth-flow change (reuses existing session gate). New runtime deps are the main supply-chain surface.
- **Reversibility:** fully reversible — new isolated files; deleting them + the route removes the feature.

## Implementation Checklist

1. `bun add ical.js rrule` — add the two runtime deps; confirm they land in `dependencies` (not `devDependencies`) in `package.json` and `bun.lock` updates. Confirm the installed `ical.js` major version ships its own TypeScript types (v2 does); if `bun run check` reports missing types, add the appropriate `@types` package or a local `.d.ts` shim — do NOT proceed with a red typecheck. Verify the installed `ical.js` API surface (`ICAL.parse` / `ICAL.Component` / `ICAL.Event`) matches what step 4 uses before writing the parser.
2. Create `src/lib/caldav/constants.ts`:
   - `import { env } from '$env/dynamic/private'`.
   - `calendarCollectionUrl()` → `` `${env.NEXTCLOUD_URL}/remote.php/dav/calendars/${env.NEXTCLOUD_USER}/${env.NEXTCLOUD_CALENDAR_SLUG}/` `` (NEXTCLOUD_URL already includes `https://` — do NOT prepend a scheme; NEXTCLOUD_CALENDAR_SLUG is pre-encoded — do NOT `encodeURIComponent`).
   - `basicAuthHeader()` → `` `Basic ${Buffer.from(`${env.NEXTCLOUD_USER}:${env.NEXTCLOUD_APP_PASSWORD}`).toString('base64')}` `` (`Buffer` is a Node global — confirmed available in the Vercel nodejs22.x runtime).
   - Export the `CATEGORIES`→category mapping and default event color(s).
3. Create `src/lib/caldav/reader.ts`:
   - Export a typed `CalDavError` (carries an internal status but a client-safe message).
   - `buildReportBody(start, end)` → the `calendar-query` XML with a `c:time-range`. Format `start`/`end` to `YYYYMMDDTHHMMSSZ` **from the parsed Date objects, never from the raw query strings** (prevents XML injection into the calendar-query body).
   - `fetchCalendarReport({ start, end })` → `fetch(calendarCollectionUrl(), { method: 'REPORT', headers: { Authorization, Depth: '1', 'Content-Type': 'application/xml' }, body })` (global `fetch`/undici permits the WebDAV `REPORT` method — it is not on the Fetch forbidden-method list; confirm empirically once against the live server, tracked as a known-gap below).
   - **Multistatus parse mechanism (REQUIRED decision — do not skip):** `DOMParser` is NOT available in the Node/Vercel runtime (confirmed `undefined` at VALIDATE). Choose ONE and document it in the phase report: (a) add a small server-only XML parser dep (`fast-xml-parser` recommended — deterministic, typed, no DOM), or (b) a namespace-aware, escape-safe extraction of every `<cal:calendar-data>`/`<c:calendar-data>` payload from the multistatus body. Do NOT rely on browser `DOMParser`.
   - On `res.status === 401` → throw `CalDavError` (upstream-auth). On any other non-2xx → throw `CalDavError` (upstream). On 2xx → extract each `<c:calendar-data>` payload from the multistatus XML and return `string[]` of `.ics` blobs.
4. Create `src/lib/caldav/parser.ts`:
   - `parseIcsToEvents(ics, { start, end })` using `ical.js` (`ICAL.parse` → `ICAL.Component` → `VEVENT` iteration).
   - Strip `ATTACH` and `SOUND` properties before reading any fields.
   - Map fields to the `CalendarEvent` contract; `category` from `CATEGORIES` (→ mapping, else `null`); `url` from `URL` (else `null`); `allDay` from `DTSTART` `VALUE=DATE`.
   - Expand `RRULE` bounded to `[start, end)`; emit one event per occurrence with per-occurrence `start`/`end`, shared `uid`. **Timezone caution:** ical.js parses `VTIMEZONE`; `rrule` operates in UTC/floating time. Either use ical.js native recurrence (`ICAL.Event`/`RecurExpansion`, which honors `VTIMEZONE`) OR convert `DTSTART` to an absolute UTC instant (tz applied) before handing to `rrule` — a naive mix produces wrong instants across DST. Cover this with a DST-crossing RRULE fixture in step 7.
   - Return `CalendarEvent[]`.
5. Create `src/routes/api/calendar/events/+server.ts`:
   - `export const GET: RequestHandler = async ({ locals, url }) => { ... }`.
   - `if (!locals.user) throw error(401, 'Unauthorized')` (BEFORE the try block).
   - Parse `?start`/`?end` (fallback to current-month window); validate they are parseable ISO dates, else `throw error(400, ...)`. Place this validation so the resulting `HttpError` is NOT caught by the CalDavError catch below (a SvelteKit `HttpError` is not an instance of `CalDavError`, so the `instanceof` guard already re-throws it — keep it that way).
   - `try { const blobs = await fetchCalendarReport(range); const events = blobs.flatMap((b) => parseIcsToEvents(b, range)); return json({ success: true, events, count: events.length }); } catch (e) { if (e instanceof CalDavError) throw error(503, 'Calendar service unavailable'); throw e; }`.
   - Ensure no credential/upstream-status value is included in any thrown message.
6. Add fixtures under `src/tests/fixtures/`: `event-folded.ics`, `event-escaped.ics`, `event-vtimezone.ics`, `event-allday.ics`, `event-rrule.ics`, `event-rrule-dst.ics` (an RRULE spanning a DST transition), `event-categories-url.ics`, `event-no-categories-no-url.ics`, and `collection-multi.ics` (a multistatus REPORT response wrapping ≥2 VEVENTs) — real, spec-valid samples.
7. Create `src/tests/caldav-parser.spec.ts` (Vitest, every test asserts):
   - Parses folded lines and escaped `\n`/`\,` correctly.
   - Handles a `VTIMEZONE` block (start/end resolve to correct instants).
   - All-day (`VALUE=DATE`) → `allDay: true`.
   - `RRULE` expands to the expected occurrence count within the window.
   - `RRULE` crossing a DST boundary expands to the correct instants (uses `event-rrule-dst.ics`).
   - `CATEGORIES` → correct `category`; absent → `null`.
   - `URL` → correct `url`; absent → `null`.
   - ATTACH/SOUND present in fixture are NOT emitted on the output object.
8. Create `src/tests/caldav-reader.spec.ts` (Vitest — `fetch` and `$env/dynamic/private` mocked via `vi.hoisted`/`vi.mock`): **(added at VALIDATE — closes the reader coverage gap)**
   - `buildReportBody(start, end)` emits a `time-range` with correctly `YYYYMMDDTHHMMSSZ`-formatted UTC bounds derived from the Date args (assert an injection-y raw string cannot reach the body).
   - Given `collection-multi.ics` as a 207 multistatus body, `fetchCalendarReport` extracts each `<c:calendar-data>` and returns `string[]` of length ≥2.
   - Mocked `fetch` → 401 response ⇒ `fetchCalendarReport` throws `CalDavError` and the error message contains no credential/`401`/upstream detail.
   - `calendarCollectionUrl()` builds the expected URL from mocked env (no double scheme; slug not re-encoded).
9. Create `src/tests/calendar-events-endpoint.spec.ts` (mock `reader` + `$env/dynamic/private` via `vi.hoisted`/`vi.mock`, import `GET` directly):
   - No `locals.user` → 401 (assert via `isHttpError` + status).
   - `?start=not-a-date` → 400 (assert via `isHttpError` + status; assert it is NOT 503).
   - Reader throws `CalDavError` (simulated Nextcloud 401) → endpoint throws 503; assert the thrown message contains no credential/`401`/upstream detail.
   - Reader resolves blobs → 200 with `{ success, events, count }` and `count === events.length`.
10. **Risk-evidence pack (high-risk: secrets/trust-boundary — required before marking DONE):** write the `vc-risk-evidence-pack` artifacts into `process/features/calendar/active/ncal-1-caldav-reader_08-07-26/harness/` — at minimum `risk-gate.json` (riskClass `permission, secret, or trust-boundary logic`), `verification.json` (credential-mask happy + failure cases from step 9), `review-decision.json`, and `adversarial-validation.json` (scenarios: Nextcloud-401 cred leak, XML injection via `?start`/`?end`, RRULE-expansion DoS via a very wide window — each ruled out with rationale).
11. Run gates: `bun run check`, `bun run lint`, `bun run test:unit:ci` — fix to green.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `caldav-parser.spec.ts`: multi-VEVENT parse | Fully-Automated | Each `.ics` VEVENT parsed to JSON shape |
| `caldav-parser.spec.ts`: CATEGORIES present/absent | Fully-Automated | `category` mapped; `null` when `CATEGORIES` absent |
| `caldav-parser.spec.ts`: URL present/absent | Fully-Automated | `url` parsed; `null` when `URL` absent |
| `caldav-parser.spec.ts`: RRULE expansion within window | Fully-Automated | Date-range filter (`?start=&end=`) works correctly (parser side) |
| `caldav-parser.spec.ts`: RRULE across DST boundary | Fully-Automated | Recurrence instants correct across DST (tz correctness) |
| `caldav-parser.spec.ts`: ATTACH/SOUND stripped | Fully-Automated | Security — ATTACH/SOUND stripped on parse |
| `caldav-reader.spec.ts`: buildReportBody time-range format | Fully-Automated | REPORT body carries correct UTC `time-range`; no raw-string injection |
| `caldav-reader.spec.ts`: multistatus `.ics` extraction | Fully-Automated | 207 multistatus body → N `.ics` blobs extracted (wire-format proxy for the live REPORT) |
| `caldav-reader.spec.ts`: Nextcloud 401 → CalDavError, no leak | Fully-Automated | Reader maps upstream 401 to typed error; no credential/status in message |
| `calendar-events-endpoint.spec.ts`: no session → 401 | Fully-Automated | Unauthenticated CRM session → 401 from endpoint |
| `calendar-events-endpoint.spec.ts`: bad `?start` → 400 (not 503) | Fully-Automated | Invalid date → 400, not remapped to 503 |
| `calendar-events-endpoint.spec.ts`: Nextcloud 401 → 503, no cred leak | Fully-Automated | 401 from Nextcloud → 503 + generic message, never exposes credentials |
| `calendar-events-endpoint.spec.ts`: success 200 shape | Fully-Automated | Each event returned in the JSON shape with count |
| `bun run check` exits 0 | Fully-Automated | `bun run check` exit 0 |
| `bun run lint` exits 0 | Fully-Automated | `bun run lint` exit 0 |
| Live REPORT round-trip against real Nextcloud "Veent Team" calendar | Hybrid (VERIFIED 2026-07-08) | End-to-end REPORT lists all `.ics` files — curl against http://localhost:5173/api/calendar/events with real session cookie returned 200 with real Nextcloud calendar events |
| Live `?start=&end=` reaches CalDAV `time-range` filter on the server | Hybrid (VERIFIED 2026-07-08) | Server-side time-range honored — confirmed in live round-trip above |

Note: the two Hybrid rows require a live Nextcloud instance + real app password and cannot run in CI without a credentialed harness. They are recorded as known-gaps below and kept CONDITIONAL (not silently dropped). After the reader unit tests (step 8), the REPORT wire format and multistatus extraction ARE Fully-Automated — the Hybrid rows now cover only the live network round-trip, not the (now unit-proven) code logic.

## Test Infra Improvement Notes

- No live-Nextcloud CalDAV test harness exists. Two Hybrid gates (live REPORT round-trip; live `time-range` filter) are known-gaps pending a credentialed integration harness (or a recorded HTTP fixture / mock CalDAV server). Backlog stub to write at EXECUTE/UPDATE: `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md` (create the `backlog/` dir — it does not yet exist). This is the same class as the repo's existing live-DB CI harness gap.
- `ical.js` and `rrule` are new deps — first use in the repo; no shared test util exists for ICS fixtures yet. Fixtures added here become the reusable base for future NCAL phases.
- Multistatus-XML parsing has no repo precedent; if a dep is chosen (`fast-xml-parser`) it is the first XML parser in the tree — record the choice + rationale in the phase report.

## Phase Completion Rules

This is a SIMPLE single-phase plan. It is complete only when ALL of the following hold:

- Checklist steps 1–11 are done.
- All Fully-Automated Verification Evidence rows are green (`bun run check`, `bun run lint`, `bun run test:unit:ci` all exit 0; parser + reader + endpoint specs pass).
- The two Hybrid rows are either satisfied against a live Nextcloud instance OR explicitly recorded as accepted known-gaps with the backlog stub written — the plan is CODE DONE (not VERIFIED end-to-end) until a live REPORT is observed.
- The risk-evidence pack (step 10) exists in the task folder's `harness/` with a recorded review decision.
- No credential/upstream-status value appears in any client-visible response or log (security gate).

Status vocabulary: `CODE DONE` = checklist + Fully-Automated gates green with Hybrid rows as accepted known-gaps; `VERIFIED` = additionally confirmed against a live Nextcloud calendar.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/calendar/completed/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md`
2. **Last completed step:** VALIDATE complete (CONDITIONAL). Checklist steps 1–11 pending EXECUTE.
3. **Validate-contract status:** written (08-07-26) — see `## Validate Contract` below.
4. **Supporting context loaded:** `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (vitest `requireAssertions` on; `test:unit:ci`; `$env/dynamic/private` mock pattern), `src/routes/api/nav-counts/+server.ts` (session-gate pattern), `src/tests/reminders-due-endpoint.spec.ts` (endpoint test pattern), `src/app.d.ts` (`Locals.user`).
5. **Next step for a fresh agent:** EXECUTE the checklist top-to-bottom (deps first). Gate commands: `bun run check`, `bun run lint`, `bun run test:unit:ci`. Honor the execute-agent instructions in the validate-contract (multistatus parse mechanism, tz correctness, XML-injection formatting, evidence pack).

## Open Questions / Assumptions

- **Scheme in URL builder:** the issue's raw REPORT snippet shows `https://{NEXTCLOUD_URL}/...` but `NEXTCLOUD_URL=https://team.veent.io` already includes the scheme. Plan assumes NO extra scheme prefix (concatenate directly). Confirm at EXECUTE — now covered by a `calendarCollectionUrl()` unit assertion (step 8).
- **Default date window:** issue does not specify default range when `?start`/`?end` omitted; plan assumes current-month window. Confirm acceptable.
- **`color` source:** issue shows `"color": "#22c55e"` but no iCal source property is named; plan assumes color is derived from `category` mapping (constants), not read from ICS. Confirm mapping table with design owner if needed.

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 new public API endpoint, S6 secrets/trust-boundary credential handling, S7 9+ blast-radius files). Implementation is a single dependent sequence (deps → constants → reader → parser → endpoint → tests) in one package/one context window — sequential is the correct fit; parallelizing would fragment tightly-coupled files.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| VE-parse-multi | Each `.ics` VEVENT parsed to JSON shape | Fully-Automated | `caldav-parser.spec.ts`: multi-VEVENT parse | A |
| VE-categories | `category` mapped; `null` when absent | Fully-Automated | `caldav-parser.spec.ts`: CATEGORIES present/absent | A |
| VE-url | `url` parsed; `null` when absent | Fully-Automated | `caldav-parser.spec.ts`: URL present/absent | A |
| VE-rrule | RRULE expands within window | Fully-Automated | `caldav-parser.spec.ts`: RRULE expansion within window | A |
| VE-rrule-dst | RRULE instants correct across DST | Fully-Automated | `caldav-parser.spec.ts`: RRULE across DST boundary | B |
| VE-strip | ATTACH/SOUND stripped on parse | Fully-Automated | `caldav-parser.spec.ts`: ATTACH/SOUND stripped | A |
| VE-body-xml | REPORT body carries correct UTC time-range, no injection | Fully-Automated | `caldav-reader.spec.ts`: buildReportBody time-range format | B |
| VE-extract | 207 multistatus → N `.ics` blobs extracted | Fully-Automated | `caldav-reader.spec.ts`: multistatus `.ics` extraction | B |
| VE-reader-401 | Reader maps upstream 401 → CalDavError, no leak | Fully-Automated | `caldav-reader.spec.ts`: Nextcloud 401 → CalDavError | B |
| VE-ep-401 | Unauthenticated CRM session → 401 | Fully-Automated | `calendar-events-endpoint.spec.ts`: no session → 401 | A |
| VE-ep-400 | Invalid date → 400, not remapped to 503 | Fully-Automated | `calendar-events-endpoint.spec.ts`: bad `?start` → 400 | B |
| VE-ep-503 | Nextcloud 401 → 503, no credential leak | Fully-Automated | `calendar-events-endpoint.spec.ts`: Nextcloud 401 → 503 | A |
| VE-ep-200 | Event JSON shape + count returned | Fully-Automated | `calendar-events-endpoint.spec.ts`: success 200 shape | A |
| VE-check | `bun run check` exit 0 | Fully-Automated | `bun run check` exits 0 | A |
| VE-lint | `bun run lint` exit 0 | Fully-Automated | `bun run lint` exits 0 | A |
| VE-live-report | Live REPORT round-trip lists all `.ics` on real server | Hybrid | Live REPORT vs real Nextcloud "Veent Team" calendar | D |
| VE-live-range | Live server honors `time-range` filter | Hybrid | Live `?start=&end=` vs real Nextcloud CalDAV | D |

gap-resolution legend: A — proven now (gate exists) · B — gate added by this plan's checklist · C — deferred to named later phase · D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy; the two live rows are Hybrid with gap-resolution D (named residual, backlog stub).

Failing stub (VE-body-xml):
test("should format buildReportBody time-range as YYYYMMDDTHHMMSSZ from Date args", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildReportBody time-range format") })

Failing stub (VE-extract):
test("should extract each c:calendar-data blob from a 207 multistatus body", () => { throw new Error("NOT IMPLEMENTED — TDD stub: multistatus .ics extraction") })

Failing stub (VE-reader-401):
test("should throw CalDavError with no credential/401 detail on upstream 401", () => { throw new Error("NOT IMPLEMENTED — TDD stub: reader 401 → CalDavError") })

Failing stub (VE-ep-400):
test("should return 400 (not 503) on an unparseable ?start", () => { throw new Error("NOT IMPLEMENTED — TDD stub: bad date → 400") })

Failing stub (VE-rrule-dst):
test("should expand an RRULE crossing a DST boundary to the correct instants", () => { throw new Error("NOT IMPLEMENTED — TDD stub: RRULE across DST") })

Legacy line form (retained so existing validate-contract consumers still parse):
- CalDAV parser (`src/lib/caldav/parser.ts`): Fully-automated: `bun run test:unit:ci` (caldav-parser.spec.ts — folded/escaped/vtimezone/allday/rrule/dst/categories/url/attach-strip)
- CalDAV reader (`src/lib/caldav/reader.ts`): Fully-automated: `bun run test:unit:ci` (caldav-reader.spec.ts — body-xml/extraction/401-map/url-build)
- Calendar events endpoint (`src/routes/api/calendar/events/+server.ts`): Fully-automated: `bun run test:unit:ci` (calendar-events-endpoint.spec.ts — 401/400/503/200)
- Typecheck + lint: Fully-automated: `bun run check` + `bun run lint`
- Live Nextcloud REPORT round-trip + live time-range: known-gap: documented — no credentialed CalDAV harness in CI; backlog stub `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`

Dimension findings:
- Infra fit: CONCERN — `DOMParser` is `undefined` in the Node/Vercel nodejs22.x runtime (confirmed); the multistatus-XML `.ics` extraction needs an explicit mechanism (add `fast-xml-parser`, or a namespace/escape-safe extractor) — step 3 now mandates the decision. `fetch`+`Buffer` confirmed global. undici `REPORT` method not forbidden (live-verify tracked as known-gap). `ical.js` TS types must satisfy `bun run check`.
- Test coverage: CONCERN (resolved in-plan) — reader logic (`buildReportBody`, multistatus extraction, 401→CalDavError) originally had NO automated gate and rested only on the live Hybrid rows (vacuous-green). Now closed by the new `caldav-reader.spec.ts` (steps 8 + VE-body-xml/VE-extract/VE-reader-401). `requireAssertions: true` honored — every test asserts.
- Breaking changes: PASS — additive route (`/api/calendar/*` did not exist); no schema/migration/existing-consumer impact. Note: in production, unauthenticated hits get a 303 redirect from `hooks.server.ts` BEFORE reaching the handler's `401` (defense-in-depth); the handler 401 is still unit-testable directly.
- Security surface: CONCERN — high-risk secrets/trust-boundary class. Credential masking (Nextcloud 401 → 503, no leak) is well-designed and Fully-Automated tested. Residual: (1) format `time-range` from parsed Date not raw query (XML-injection) — now in step 3; (2) clamp/limit RRULE expansion window (authenticated-DoS) — adversarial-validation item; (3) risk-evidence pack required before finalize (step 10).
- Section A (deps): CONCERN — ical.js TS types + installed-major API verification (step 1).
- Section B (constants): PASS — Buffer/env confirmed; URL-builder assertion added (step 8).
- Section C (reader): CONCERN (highest risk) — multistatus parse mechanism unnamed + DOMParser unavailable; coverage added (step 8), mechanism decision mandated (step 3).
- Section D (parser): CONCERN — ical.js(`VTIMEZONE`)+rrule(UTC) DST interplay; DST fixture + test added (steps 6–7).
- Section E (endpoint): PASS — session-gate matches `nav-counts`; 400 validation kept out of the CalDavError catch; 400 test added (step 9).
- Section F (fixtures/tests): CONCERN (resolved in-plan) — reader.spec + 400 + DST tests added.

Open gaps:
- Live Nextcloud REPORT round-trip: known-gap: documented as backlog stub `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md` (create `backlog/` dir at EXECUTE) — same class as the repo's live-DB CI harness gap; kept CONDITIONAL, not dropped.
- Live server `time-range` filter honored: known-gap: same backlog stub.
- undici `REPORT` method accepted by the live server: verify empirically on first live run (bundled into the live-harness known-gap).

What this coverage does NOT prove:
- `caldav-parser.spec.ts` / `caldav-reader.spec.ts` (Fully-Automated): do NOT prove the live Nextcloud server accepts the `REPORT` method, returns a well-formed multistatus body, or honors the `time-range` filter — only that our code produces the correct request wire-format and correctly parses a fixture response.
- `calendar-events-endpoint.spec.ts` (Fully-Automated): reader is mocked — does NOT prove real network behavior, real credential validity, or real TLS to `team.veent.io`. Proves only the handler's gate/error-mapping/shape logic.
- `bun run check` / `bun run lint`: prove types + style only; no runtime behavior.
- No gate proves the RRULE-expansion DoS clamp or the plaintext-logging-avoidance behavior automatically — both are adversarial-validation/review items in the risk-evidence pack (step 10).

Execute-agent instructions:
- E1 (step 3): choose + document the multistatus-XML parse mechanism; `fast-xml-parser` recommended. Do NOT use `DOMParser` (undefined in Node). If a dep is added, land it in `dependencies`.
- E2 (step 3/reader): format the CalDAV `time-range` from parsed Date objects, never from raw `?start`/`?end` strings (XML-injection guard).
- E3 (step 4/parser): resolve `VTIMEZONE` to absolute UTC before `rrule` expansion (or use ical.js native `RecurExpansion`); prove with the DST fixture. Bound expansion to `[start, end)` and clamp an abusively wide window.
- E4 (step 1): confirm `ical.js` ships TS types (or add `@types`/shim) so `bun run check` stays green; verify the installed `ical.js` API before writing the parser.
- E5 (step 5): keep `error(401)` before the try and `error(400)` outside the CalDavError remap so HttpErrors are not converted to 503.
- E6 (step 10): produce the `vc-risk-evidence-pack` artifacts in `.../harness/` before reporting DONE (secrets/trust-boundary high-risk class); include the cred-leak, XML-injection, and RRULE-DoS adversarial scenarios.

Backlog artifacts:
- `process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md` — tracks the credentialed live-CalDAV integration harness (REPORT round-trip + time-range + REPORT-method acceptance). Create the `backlog/` dir.

Gate: CONDITIONAL (concerns noted; test-coverage + section CONCERNs resolved via in-plan checklist additions; residual = pre-accepted live-integration known-gaps + execute-agent instructions)
Accepted by: session (autonomous validate pass — live-CalDAV harness gaps are the repo's pre-accepted known-gap class, same as calendar/reminders/manager-dashboard; substantive plan gaps were resolved in-plan rather than deferred). Concerns on record: infra-DOMParser/parse-mechanism, security-evidence-pack, parser-DST-tz, reader-coverage (resolved in-plan), live-CalDAV round-trip (known-gap), live time-range (known-gap).

## Autonomous Goal Block

```
SESSION GOAL: NCAL-1 — server-only CalDAV read client + session-gated GET /api/calendar/events returning parsed Nextcloud "Veent Team" calendar events as JSON.
Charter + umbrella plan: N/A — single plan (process/features/calendar/active/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md)
Autonomy: proceed autonomously on reversible, in-scope edits (new files under src/lib/caldav/, src/routes/api/calendar/, src/tests/; deps via bun add). Follow feedback_autonomous_phase_execution rules: CONDITIONAL → apply fixes + proceed; BLOCKED → backlog + continue.
Hard stop conditions / safety constraints:
- Never let NEXTCLOUD_USER / NEXTCLOUD_APP_PASSWORD (or any Basic Auth value) reach the browser, a client response, or a plaintext log.
- Nextcloud 401 (bad app password) must surface to the client as 503 generic — never echo upstream status/credentials.
- No live billed/credentialed calls to team.veent.io as part of CI gates (live REPORT is a known-gap, not a CI step).
- No schema/migration/auth-flow changes — reuse the existing session gate only.
- Produce the risk-evidence pack before reporting DONE (secrets/trust-boundary high-risk class).
Next phase: EXECUTE: process/features/calendar/active/ncal-1-caldav-reader_08-07-26/ncal-1-caldav-reader_PLAN_08-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL)
Execute start: bun add ical.js rrule → constants.ts → reader.ts (choose multistatus parser; NOT DOMParser) → parser.ts (tz-safe RRULE) → endpoint → fixtures + parser/reader/endpoint specs → risk-evidence pack. Fully-auto gates: bun run check | bun run lint | bun run test:unit:ci. E2E: live Nextcloud REPORT (known-gap). Probe scenario: n/a. High-risk pack: yes (secrets/trust-boundary).
```
