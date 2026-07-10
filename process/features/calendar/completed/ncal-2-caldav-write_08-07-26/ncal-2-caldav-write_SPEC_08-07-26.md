---
name: spec:ncal-2-caldav-write
description: SPEC for NCAL-2 — CalDAV write client (create/update/delete Nextcloud calendar events via n8n webhooks) + NCAL-1 parser patch to read back CRM deep-links from DESCRIPTION (GitHub #252)
date: 08-07-26
feature: calendar
---

# NCAL-2 — CalDAV Write Client SPEC

**Date:** 08-07-26
**Branch:** feat/ncal-2-caldav-write-client
**GitHub:** #252

---

## Summary

Right now the CRM can read events from the shared Nextcloud team calendar (NCAL-1), but it cannot write to it. NCAL-2 adds the write side: three API routes (create, update, delete) that accept requests from the CRM, forward them to an n8n webhook with a shared secret, and let n8n handle the actual CalDAV write to Nextcloud. Because n8n cannot emit the standard `URL:` iCalendar field, the CRM embeds its own deep-link (`CRM-HREF:/leads/[id]`) as a line inside the `DESCRIPTION` field when writing — and the existing NCAL-1 parser is patched to extract that line on read-back, so the calendar page can link back to the originating lead. The result: CRM users can create and manage Nextcloud calendar events without the CRM ever holding CalDAV credentials for writing, and calendar event cards in the CRM UI can deep-link to the associated lead.

---

## User Stories / Jobs To Be Done

**US-1 — Create an event:** As a CRM user, I want to create a new calendar event that appears on the shared Nextcloud team calendar, so that my colleagues see upcoming client events without me manually entering them in Nextcloud.

**US-2 — Update an event:** As a CRM user, I want to edit the details of an existing calendar event I created through the CRM, so that changes to meeting times or descriptions are reflected on the team calendar.

**US-3 — Delete an event:** As a CRM user, I want to remove a calendar event I no longer need, so that the team calendar stays accurate and uncluttered.

**US-4 — Click-through from calendar to lead:** As a CRM user viewing the calendar, I want to click on a CRM-created event and be taken directly to the linked lead page, so that I can access full lead context without searching.

---

## What The User Wants (Behavioral Outcomes)

**Writing events:**
- Submitting a create request from the CRM produces a new event on the Nextcloud team calendar within the normal n8n processing delay (a few seconds at most).
- The created event carries the correct title, start/end times, location, category, and a CRM deep-link encoded in the description.
- The server generates a stable unique ID for each new event and returns it to the caller, so subsequent update or delete operations can reference it.
- Submitting an update with the same UID overwrites the existing event on Nextcloud (idempotent PUT semantics).
- Submitting a delete with a UID removes the event from Nextcloud.

**Reading back CRM-created events (parser patch):**
- When the NCAL-1 read path retrieves an event that contains `CRM-HREF:/leads/[id]` in its description, the parser surfaces that value as the `url` field on the returned event object.
- The rest of the description text (lines that are not `CRM-HREF:`) is returned unchanged as the `description` field.
- Events without a `CRM-HREF:` line have `url: null`, exactly as today.

**Security and error behavior:**
- All three write routes require an authenticated CRM session. Unauthenticated requests receive a 401 before any processing occurs.
- Malformed or missing required fields return a 400 with field-level error details; no n8n call is made.
- If n8n returns a non-2xx response, the API route returns a generic 502 to the caller. The n8n webhook URL, the shared secret, and any upstream error detail are never included in any response sent to the client or written to client-visible logs.

---

## Flow / State Diagram

### Write path (create / update / delete)

```
CRM client
    │
    ▼
+-----------------------------------+
| SvelteKit API route               |
| POST /api/calendar/events         |
| PUT  /api/calendar/events/[uid]   |
| DELETE /api/calendar/events/[uid] |
+-----------------------------------+
    │
    ├─── No session ──────────────────► 401 Unauthorized
    │
    ├─── Invalid payload (create/upd) ► 400 Bad Request
    │                                    { errors: { field: msg } }
    │
    ├─── Valid ──────────────────────►
    │                                 writer.ts
    │                                 (x-webhook-secret header)
    │                                     │
    │                                     ▼
    │                              n8n webhook
    │                                     │
    │                    ┌────────────────┴──────────────────┐
    │                    ▼                                   ▼
    │             n8n CalDAV PUT/DELETE             n8n non-2xx
    │             on Nextcloud                             │
    │                    │                                  ▼
    │                    ▼                          ► 502 Bad Gateway
    │       200 { uid } (create)                     (no upstream detail)
    │       200 ok (update)
    │       204 No Content (delete)
    ▼
 CRM client receives response
```

### Read-back path (parser patch — no new API route)

```
NCAL-1 GET /api/calendar/events
    │
    ▼
reader.ts ──► Nextcloud CalDAV REPORT ──► .ics blob
    │
    ▼
parser.ts: parseIcsToEvents()
    │
    ├─── DESCRIPTION contains "CRM-HREF:/leads/abc" line?
    │        YES ──► url = "/leads/abc"
    │                description = (remaining lines, if any)
    │        NO  ──► url = null
    │                description = (full description, as today)
    │
    ▼
CalendarEvent { url: "/leads/abc" | null, description: "...", ... }
```

### Error states table

| Trigger | HTTP status | Body |
|---|---|---|
| No Better Auth session | 401 | `{ error: "Unauthorized" }` |
| Zod validation fail | 400 | `{ errors: { [field]: msg } }` |
| n8n non-2xx | 502 | `{ error: "Calendar service unavailable" }` |
| n8n timeout (if configured) | 502 | same |
| Missing env var (startup) | fail-fast at app boot | N/A — server does not start |

---

## Acceptance Criteria (Testable Outcomes)

### Parser patch — CRM-HREF extraction

**AC1:** When a DESCRIPTION field contains a `CRM-HREF:/leads/[id]` line, `parseIcsToEvents` returns a `CalendarEvent` with `url` set to `/leads/[id]` (the full value after `CRM-HREF:`).

- `proven by:` `src/tests/caldav-parser-crm-href.spec.ts` — Vitest unit test with a synthetic `.ics` fixture containing `CRM-HREF:/leads/test-uuid`
- `strategy:` Fully-Automated

**AC2:** When a DESCRIPTION field contains no `CRM-HREF:` line, `parseIcsToEvents` returns `url: null` and the full description text is preserved in `description` (existing NCAL-1 behavior is unchanged).

- `proven by:` same spec file, negative-case fixture
- `strategy:` Fully-Automated

**AC3:** When a DESCRIPTION field contains both a `CRM-HREF:` line and other text lines, only the `CRM-HREF:` line is consumed as `url`; the remaining lines form the returned `description`.

- `proven by:` same spec file, mixed-content fixture
- `strategy:` Fully-Automated

### Writer module (webhook caller)

**AC4:** The writer module sends a `POST` to the configured n8n webhook URL with `Content-Type: application/json` and an `x-webhook-secret` header whose value matches `N8N_WEBHOOK_SECRET`, plus the event payload in the body.

- `proven by:` `src/tests/caldav-writer.spec.ts` — Vitest unit test with a mocked `fetch`; asserts request URL, method, headers, and body
- `strategy:` Fully-Automated

**AC5:** When n8n responds with a non-2xx status, the writer module throws a `CalDavWebhookError`. The error message and all properties of the thrown error contain no value from `N8N_WEBHOOK_SECRET`, no value from `N8N_CALENDAR_WEBHOOK_URL`, and no upstream response body text.

- `proven by:` `src/tests/caldav-writer.spec.ts` — Vitest test asserts thrown error shape; secret and URL values are not present in `error.message` or any serializable field
- `strategy:` Fully-Automated

### Input validation

**AC6:** The Zod schema for create/update payloads rejects requests missing `title`, `start`, or `end`; and rejects `start` or `end` values that are not valid ISO 8601 strings.

- `proven by:` `src/tests/caldav-writer.spec.ts` or `src/tests/schemas.spec.ts` — Vitest unit test calling `schema.safeParse()` with various invalid inputs
- `strategy:` Fully-Automated

### API route — authentication gate

**AC7:** A request to `POST /api/calendar/events`, `PUT /api/calendar/events/[uid]`, or `DELETE /api/calendar/events/[uid]` without a valid Better Auth session receives a 401 response before any n8n call is made.

- `proven by:` `e2e/caldav-write.e2e.ts` — Playwright e2e test (unauthenticated `fetch()` to each route); self-skips until shared auth fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
- `strategy:` Agent-Probe (known-gap — pre-accepted; same root cause as all calendar e2e known-gaps)

### API route — error mapping

**AC8:** A valid session plus an invalid payload to `POST /api/calendar/events` returns 400 with a body containing a field-errors map; the webhook is not called.

- `proven by:` `e2e/caldav-write.e2e.ts` — Playwright e2e (session required); self-skips pending auth fixture
- `strategy:` Agent-Probe (same known-gap)

**AC9:** A valid session and valid payload, but n8n returning a non-2xx status, causes the route to return 502 with a generic error message; no webhook URL, secret value, or upstream detail appears in the response body.

- `proven by:` `src/tests/caldav-writer.spec.ts` — Vitest test on the writer module's error throw, covering the error-shape invariant; API-route-level 502 mapping is Agent-Probe pending auth fixture
- `strategy:` Hybrid (unit layer Fully-Automated; route-layer Agent-Probe)

### Round-trip contract

**AC10:** An event written via `POST /api/calendar/events` with a `CRM-HREF` description line, when subsequently retrieved via `GET /api/calendar/events`, appears in the response with `url` set to the CRM path embedded in the description.

- `proven by:` Live integration probe against the real n8n + Nextcloud stack (one-time manual verification); covered in spirit by AC1–AC4 unit tests; full automated proof deferred to the same live-DB/live-CalDAV CI harness backlog item (`process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`)
- `strategy:` Agent-Probe (pre-accepted known-gap — live CalDAV CI harness not in scope for NCAL-2)

---

## Out Of Scope

- **n8n flow configuration** — the n8n workflow that receives the webhook and performs the CalDAV PUT/DELETE is maintained by the team outside the CRM codebase. NCAL-2 only covers the CRM side.
- **Calendar write UI** — no new SvelteKit page or component is added in this phase. The three API routes are backend-only; a future UI phase will add buttons/modals that call them.
- **Recurrence (RRULE) write support** — creating recurring events is explicitly deferred. NCAL-2 writes single-occurrence events only.
- **Bulk operations** — batch create/update/delete is not included.
- **CalDAV write direct from CRM** — the CRM never holds CalDAV write credentials. All writes go through n8n.
- **Event ownership scoping on write** — the shared Nextcloud calendar is team-wide. Who may write is governed by the role-restriction open question; until that is answered, all session-authenticated users may call the write routes.
- **Webhook retry logic** — if n8n returns a non-2xx, the CRM returns 502. No automatic retry is implemented in the CRM.
- **Event attachment support** — `ATTACH` properties are not written (consistent with NCAL-1 stripping them on read).

---

## Constraints

1. **No direct CalDAV credentials in the CRM for writing** — the CRM reads CalDAV via NCAL-1 using Nextcloud app-password credentials, but the write path MUST go through n8n. This is an architectural decision, not a technical limit.
2. **`URL:` iCal property cannot be used** — confirmed by live feasibility probe: n8n's "Build ICS Event" node does not emit `URL:`. CRM deep-links MUST be embedded in `DESCRIPTION` as `CRM-HREF:[path]`.
3. **Secret never reaches the client** — `N8N_WEBHOOK_SECRET` must not appear in any response body, error message, or log statement that surfaces to the client or to SvelteKit's client-side error handlers.
4. **Server-only module** — `src/lib/caldav/writer.ts` and `src/lib/caldav/constants.ts` are server-only. They must not be imported from `.svelte` files or client-side code.
5. **Env vars use `$env/dynamic/private`** — not `process.env`. Consistent with existing `constants.ts` pattern.
6. **Session gate before any processing** — all three API routes must check the Better Auth session and short-circuit to 401 before validating input or calling the writer module.
7. **Generic 502 on upstream failure** — the actual n8n error status, body, and upstream detail are logged server-side (non-client-visible) but never echoed to the caller.
8. **TZID: Asia/Manila** — confirmed in the live probe. Time values sent to n8n MUST be ISO 8601; n8n handles the TZID assignment when building the ICS.
9. **UID generated server-side** — on create, the API route generates a UUID (e.g. `crypto.randomUUID()`) and includes it in the n8n payload. The client does not supply a UID for create requests; the generated UID is returned in the 200 response.
10. **Parser patch is additive** — the change to `parser.ts` must not alter `description` or `url` for events that do not contain a `CRM-HREF:` line. Existing NCAL-1 behavior must be fully preserved.
11. **`X-VEENT-SOURCE: sales-crm` custom field** — confirmed present in the stored ICS from the probe. No change needed on the CRM side (n8n adds it); the parser ignores unknown X- properties as before.

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| OQ-1 | **Role restriction on write routes**: Can all session-authenticated CRM users (reps and managers) call the create/update/delete routes, or should write access be limited to managers/super-managers only? | Product (user) | No — PLAN can proceed with "all authenticated users" as the default and add a role guard if answered before EXECUTE |

---

## Background / Research Findings

### Architecture decision (why n8n, not direct CalDAV write)

The CRM's existing Nextcloud app-password credential (`NEXTCLOUD_APP_PASSWORD`) is scoped to the read REPORT operation. Rather than expand the blast radius by adding CalDAV write credentials to the CRM directly, the team decided to route all writes through n8n, which already has the CalDAV PUT/DELETE wiring. The CRM calls n8n webhooks with a shared secret; n8n performs the actual write.

### Live feasibility probe results (08-07-26)

A probe was run against the real n8n instance on 2026-07-08:

1. **CATEGORIES field** — n8n's "Build ICS Event" node stores CATEGORIES correctly and the value persists in the stored `.ics` file on Nextcloud. Write path is confirmed end-to-end viable.
2. **URL property** — n8n's "Build ICS Event" node does NOT emit a `URL:` iCal property. The URL field is not present in the stored `.ics`. This forced the `CRM-HREF:` in DESCRIPTION workaround.
3. **Confirmed metadata in stored .ics**: `TZID=Asia/Manila`, `X-VEENT-SOURCE:sales-crm`, `X-APPLE-CALENDAR-COLOR:#22c55e`.

### Existing NCAL-1 code (touch points)

- `src/lib/caldav/parser.ts` line 106: `const url = (vevent.getFirstPropertyValue('url') as string) ?? null;` — this currently reads the ICS `URL:` property, which n8n never emits. The patch replaces this with `CRM-HREF:` extraction from `DESCRIPTION`.
- `src/lib/caldav/constants.ts` — `calendarCollectionUrl()` and `basicAuthHeader()` cover the read side. The writer will add three new env vars (`N8N_CALENDAR_WEBHOOK_URL`, `N8N_CALENDAR_DELETE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`).
- `CalDavError` in `reader.ts` — typed error for the read path. NCAL-2 adds a parallel `CalDavWebhookError` for the write path.

### New env vars needed

| Var | Purpose |
|---|---|
| `N8N_CALENDAR_WEBHOOK_URL` | n8n create/update webhook URL |
| `N8N_CALENDAR_DELETE_WEBHOOK_URL` | n8n delete webhook URL |
| `N8N_WEBHOOK_SECRET` | Shared secret sent as `x-webhook-secret` header |

### n8n webhook payload (from probe)

| Field | Used for |
|---|---|
| `uid` | Stable event ID; n8n uses it for idempotent PUT |
| `title` / `summary` | Event title |
| `description` | Full description block, including `CRM-HREF:` line |
| `start`, `end` | ISO 8601 strings |
| `location` | Optional venue |
| `categories` | Category string (e.g. `"team-event"`) |
| `uid` only | Delete payload |

### Test context (from `process/context/tests/all-tests.md`)

- Unit tests use Vitest (`bun run test:unit`). `vi.mock('$env/dynamic/private', ...)` is the established pattern for env-var mocking.
- e2e tests (Playwright) all self-skip on protected routes — the shared auth fixture is the single blocking dependency (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- ICS fixture files live in `src/tests/fixtures/*.ics` (established by NCAL-1).
- No live-DB/live-CalDAV CI harness exists; write round-trip verification is an Agent-Probe (one-time manual).

### User brainstorm input

The user specified:
- Architecture: SvelteKit route → n8n webhook (never direct CalDAV write)
- Three operations: create (POST), update (PUT /[uid]), delete (DELETE /[uid])
- Parser patch: `CRM-HREF:` in DESCRIPTION, not a URL iCal field
- New module: `src/lib/caldav/writer.ts` with typed `CalDavWebhookError`
- Hard security constraints: secret never logged, webhook URL never in response, n8n errors → generic 502
- Out of scope: n8n flow itself, UI, recurrence write, bulk ops
