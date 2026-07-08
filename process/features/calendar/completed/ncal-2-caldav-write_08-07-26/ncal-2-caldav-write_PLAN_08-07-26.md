---
name: plan:ncal-2-caldav-write
description: COMPLEX plan for NCAL-2 — CalDAV write client (create/update/delete Nextcloud events via n8n webhooks) + NCAL-1 parser CRM-HREF patch (GitHub #252)
date: 08-07-26
feature: calendar
---

# NCAL-2 — CalDAV Write Client PLAN

Date: 08-07-26
Status: ✅ VERIFIED — EVL-confirmed 08-07-26; live round-trip confirmed (POST→Nextcloud, GET read-back, PUT update, DELETE confirmed); 544 tests green
Complexity: COMPLEX (new server module, 3 new env vars, 2 new API routes, 1 route extension, parser behavior change, security-sensitive surface)

**SPEC:** `process/features/calendar/active/ncal-2-caldav-write_08-07-26/ncal-2-caldav-write_SPEC_08-07-26.md`
**Branch:** `feat/ncal-2-caldav-write-client` (current: `feat/lead-notifications-and-optional-event-dates` — confirm/switch before EXECUTE)
**GitHub:** #252

**TL;DR:** Add a server-only `writer.ts` that POSTs event payloads to n8n webhooks with a shared secret, wire three session-gated API routes (POST create / PUT update / DELETE delete), patch the NCAL-1 parser to read CRM deep-links from `DESCRIPTION` (`CRM-HREF:`) instead of the never-emitted `URL:` property, and add two Zod schemas. Secret/URL/upstream detail must never reach the client; n8n failures map to 502.

---

## Overview

Right now the CRM can read the shared Nextcloud team calendar (NCAL-1) but cannot write to it. NCAL-2 adds the write side without ever giving the CRM CalDAV write credentials: the CRM POSTs event payloads to n8n webhooks (with a shared secret), and n8n performs the actual CalDAV PUT/DELETE. Because n8n's ICS builder cannot emit the `URL:` property, CRM deep-links are embedded in `DESCRIPTION` as `CRM-HREF:/leads/[id]`, and the NCAL-1 parser is patched to read that line back so calendar cards can link to the originating lead.

## Goals

1. CRM can create/update/delete Nextcloud events via n8n without holding CalDAV write credentials.
2. NCAL-1 read path surfaces CRM deep-links (`CRM-HREF:/leads/[id]`) as `event.url`, preserving all existing behavior for events without that line.
3. Hard security invariants hold: secret, webhook URL, and upstream detail never appear in any client-visible response, error, or log.

## Scope

**In scope:** parser patch, writer module + typed error, 3 env-var accessors, 2 Zod schemas, POST handler (extend existing file), PUT+DELETE handler (new file), unit tests, self-skipping e2e spec.
**Out of scope (from SPEC):** n8n flow config, write UI, RRULE write, bulk ops, direct CalDAV write, write-side role scoping (OQ-1 default = all authenticated users), webhook retry, ATTACH write.

---

## Phase Completion Rules

This is a single-phase COMPLEX plan (not a phase program). Completion bar:

- **CODE DONE** = all 10 checklist items implemented; `bun run check` clean; new unit specs + existing `caldav-parser.spec.ts` green via `bun run test:unit:ci`.
- **VERIFIED** = CODE DONE **plus** validate-contract gates recorded green **plus** the self-skipping `e2e/caldav-write.e2e.ts` committed (records the pre-accepted e2e known-gap). Do NOT mark ✅ VERIFIED without user confirmation of the accepted Agent-Probe known-gaps (AC7/AC8/AC9-route/AC10).
- Known-gap Agent-Probe criteria keep their gate CONDITIONAL — they never count as PASS on their own.

---

## Touchpoints

| File | Change | Type |
|---|---|---|
| `src/lib/caldav/parser.ts` | Replace line 106 `url` read with `CRM-HREF:` extraction from DESCRIPTION; strip the CRM-HREF line from returned `description` | Modify |
| `src/lib/caldav/constants.ts` | Add three env-accessor helpers: `n8nCalendarWebhookUrl()`, `n8nCalendarDeleteWebhookUrl()`, `n8nWebhookSecret()` | Modify |
| `src/lib/caldav/writer.ts` | NEW — `CalDavWebhookError` + `createEvent()` / `updateEvent()` / `deleteEvent()` webhook callers | Create |
| `src/lib/zod/schemas.ts` | Add `createCalendarEventSchema` + `updateCalendarEventSchema` | Modify |
| `src/routes/api/calendar/events/+server.ts` | Add `POST` handler (file currently only has `GET`) | Modify |
| `src/routes/api/calendar/events/[uid]/+server.ts` | NEW — `PUT` + `DELETE` handlers | Create |
| `src/tests/caldav-parser-crm-href.spec.ts` | NEW — parser CRM-HREF unit tests | Create |
| `src/tests/caldav-writer.spec.ts` | NEW — writer module unit tests | Create |
| `src/tests/fixtures/event-crm-href.ics` | NEW — fixture with CRM-HREF DESCRIPTION line | Create |
| `e2e/caldav-write.e2e.ts` | NEW — self-skipping e2e spec (records AC7/AC8 known-gap on disk; skips until shared Playwright auth fixture exists) | Create |

## Public Contracts

**HTTP routes (all session-gated; 401 before any processing):**

| Method + path | Request body | Success | Errors |
|---|---|---|---|
| `POST /api/calendar/events` | `createCalendarEventSchema` JSON | `200 { success: true, uid }` | 401 / 400 `{ errors }` / 502 `{ error: "Calendar service unavailable" }` |
| `PUT /api/calendar/events/[uid]` | `updateCalendarEventSchema` JSON | `200 { success: true, uid }` | 401 / 400 / 502 |
| `DELETE /api/calendar/events/[uid]` | none | `200 { success: true }` | 401 / 502 |

**Response envelope:** consistent with the existing GET (`{ success, events, count }`) — success uses `{ success: true, ... }`. **DECISION: use `json({ success: false, errors }, { status: 400 })` for validation** to expose the per-field map (matches SPEC error table `{ errors: { field: msg } }`); use `error(401)` / `error(502)` for the generic auth/upstream cases.

**Module API (`writer.ts`, server-only):**
- `class CalDavWebhookError extends Error` — client-safe `message`; internal `upstreamStatus?: number` (server-log only, mirrors `CalDavError` in `reader.ts`).
- `createEvent(payload): Promise<{ uid: string }>` — caller supplies `uid`; returns it on 2xx.
- `updateEvent(uid, payload): Promise<void>` — POSTs to the create/update webhook with `uid` set.
- `deleteEvent(uid): Promise<void>` — POSTs `{ uid }` to the delete webhook.

**Parser contract change (`parser.ts`):** `event.url` now derives from a `CRM-HREF:<path>` line inside DESCRIPTION rather than the ICS `URL:` property. Additive/behavior-preserving for events with no CRM-HREF line (`url: null`, `description` unchanged).

**New env vars (`$env/dynamic/private`, NOT `process.env`):** `N8N_CALENDAR_WEBHOOK_URL`, `N8N_CALENDAR_DELETE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`.

## Blast Radius

- **Files:** 6 modified/created source files + 4 test artifacts (`caldav-parser-crm-href.spec.ts`, `caldav-writer.spec.ts`, `event-crm-href.ics` fixture, `e2e/caldav-write.e2e.ts` self-skipping spec) = **10 files**, single app (`veent-crm`), no workspace-package fan-out. (P1 correction 08-07-26: prior count of "9 files / 3 test artifacts" omitted the required self-skipping `e2e/caldav-write.e2e.ts` deliverable named in the Completion Rules and Verification Evidence — now counted and listed in Touchpoints.)
- **Risk class:** HIGH — secrets/trust-boundary (shared webhook secret), public API contract (3 new routes), auth gate. Triggers the STRIDE scan below.
- **Regression surface:** NCAL-1 read path (`GET /api/calendar/events`, `parseIcsToEvents`) — the parser edit is the only place existing verified behavior can break. Existing `caldav-parser.spec.ts` fixtures (`event-categories-url.ics`, `event-no-categories-no-url.ics`) are the regression guard: they must still pass unchanged.

---

## Security Scan (STRIDE — secrets/trust-boundary surface)

| Threat | Vector | Mitigation (enforced by plan) |
|---|---|---|
| Information disclosure | Secret/webhook URL leaking to client via error | `CalDavWebhookError.message` is a fixed client-safe string; secret/URL only in server-side log, never in thrown message or response body (AC5). Route maps any writer throw to `error(502, 'Calendar service unavailable')`. |
| Information disclosure | Upstream n8n body echoed | Writer never attaches `res.text()` to the error; route never forwards upstream detail (Constraint 7). |
| Spoofing / tampering | Unauthenticated write | Session gate (`if (!locals.user) throw error(401)`) is the FIRST statement in every handler, before parse/validate/writer (Constraint 6, AC7). |
| Tampering | XML/header injection via payload | Payload is JSON to n8n (not XML); `x-webhook-secret` is a constant env value, never request-derived. Zod validates shape before send. |
| Elevation | Any user writes to team calendar | Accepted per OQ-1 default (all authenticated users). Role guard is a documented follow-up if OQ-1 answered before EXECUTE. |

---

## Data Flow

**Write:** client → route handler → (1) session gate → (2) `schema.safeParse(body)` → (3) route generates `uid` (`crypto.randomUUID()`, POST only) + builds `description` embedding `CRM-HREF:${leadHref}` when present → (4) `writer.createEvent/updateEvent/deleteEvent` → `fetch(webhookUrl, { headers: { 'x-webhook-secret', 'content-type: application/json' }, body })` → 2xx returns / non-2xx throws `CalDavWebhookError` → route catch maps to 502.

**Read-back (parser patch):** `GET` → reader REPORT → `.ics` → `parseIcsToEvents` → for each VEVENT, scan DESCRIPTION lines: first line matching `^CRM-HREF:(.+)$` → `url = captured path`, remove that line from `description` (trim leftover blank); no match → `url = null`, `description` unchanged.

## Failure Modes

| Mode | Handling |
|---|---|
| n8n unreachable (network throw) | writer catches, throws `CalDavWebhookError('Calendar service unavailable')`; route → 502 |
| n8n non-2xx | writer throws with internal `upstreamStatus` (log only); route → 502 |
| Missing env var | accessor returns `undefined` → webhook call fails → 502 (runtime guard; fail-fast-at-boot is aspirational) |
| Malformed DESCRIPTION (no CRM-HREF, multi-line, empty) | parser returns `url: null`, description preserved (AC2/AC3) |
| CRM-HREF present but empty value | `url: null` (guard: captured group must be non-empty after trim) |

---

## Acceptance Criteria

Full testable statements live in the SPEC (AC1–AC10). Mapping to proving gates is in **Verification Evidence** below. Summary:

- **AC1–AC3** (parser CRM-HREF extraction) — Fully-Automated, `proven by:` `caldav-parser-crm-href.spec.ts` — `strategy:` Fully-Automated.
- **AC4** (writer sends correct URL/method/`x-webhook-secret`/body) — `proven by:` `caldav-writer.spec.ts` — `strategy:` Fully-Automated.
- **AC5** (non-2xx → `CalDavWebhookError`; secret/URL/upstream absent) — `proven by:` `caldav-writer.spec.ts` — `strategy:` Fully-Automated.
- **AC6** (Zod rejects missing/invalid fields) — `proven by:` `caldav-writer.spec.ts` / `schemas.spec.ts` — `strategy:` Fully-Automated.
- **AC7** (401 on all 3 routes when unauth) — `proven by:` `e2e/caldav-write.e2e.ts` — `strategy:` Agent-Probe (pre-accepted known-gap).
- **AC8** (valid session + bad payload → 400, no webhook) — `proven by:` `e2e/caldav-write.e2e.ts` — `strategy:` Agent-Probe (pre-accepted known-gap).
- **AC9** (n8n failure → 502, no upstream detail) — `proven by:` `caldav-writer.spec.ts` (unit layer) — `strategy:` Hybrid (unit Fully-Automated; route layer Agent-Probe).
- **AC10** (round-trip create → GET read-back shows `url`) — `proven by:` live one-time probe — `strategy:` Agent-Probe (pre-accepted known-gap).

---

## Implementation Checklist

1. **`src/lib/zod/schemas.ts`** — add `createCalendarEventSchema` (`title: z.string().trim().min(1)`, `start: z.iso.datetime()`, `end: z.iso.datetime()`, `location: z.string().optional()`, `description: z.string().optional()`, `categories: z.string().optional()`, `leadHref: z.string().optional()`) and `updateCalendarEventSchema` (same shape; `uid` comes from path param, not body). Export both. Confirm `z.iso.datetime()` is the correct v4 API for ISO 8601 date-time (existing file uses `z.iso.date()`).
2. **`src/lib/caldav/constants.ts`** — add `n8nCalendarWebhookUrl()`, `n8nCalendarDeleteWebhookUrl()`, `n8nWebhookSecret()` reading `env.N8N_CALENDAR_WEBHOOK_URL` / `env.N8N_CALENDAR_DELETE_WEBHOOK_URL` / `env.N8N_WEBHOOK_SECRET`. Keep JSDoc server-only note.
3. **`src/lib/caldav/writer.ts`** (new) — export `CalDavWebhookError` (mirror `CalDavError`: client-safe message + internal `upstreamStatus?`). Private `postWebhook(url, secret, body)`: `fetch` `method: 'POST'`, headers `{ 'Content-Type': 'application/json', 'x-webhook-secret': secret }`, `body: JSON.stringify(body)`, `AbortSignal.timeout(10_000)`; on network throw or `!res.ok` throw `CalDavWebhookError('Calendar service unavailable', res?.status)` — NEVER include secret/url/upstream body. Export `createEvent(payload)`, `updateEvent(uid, payload)`, `deleteEvent(uid)`.
4. **`src/lib/caldav/parser.ts`** — replace line 106 with a helper `extractCrmHref(description)` that splits on `\n`, finds first line matching `/^CRM-HREF:(.+)$/`, returns `{ url: match[1].trim() || null, description: remainingLinesJoined || null }`. Assign both `url` and cleaned `description` into `base`. Preserve `null` behavior exactly for no-match (Constraint 10).
5. **`src/routes/api/calendar/events/+server.ts`** — add `export const POST`: session gate → `await request.json()` (guard parse error → 400) → `createCalendarEventSchema.safeParse` → on fail `json({ success: false, errors }, { status: 400 })` → `uid = crypto.randomUUID()` → build `description` with `CRM-HREF:` line when `leadHref` present → `await createEvent(...)` in try/catch → catch `CalDavWebhookError` → `error(502, 'Calendar service unavailable')` → success `json({ success: true, uid })`.
6. **`src/routes/api/calendar/events/[uid]/+server.ts`** (new) — `export const PUT` (session gate → parse+validate → `updateEvent(params.uid, payload)` → 200/502) and `export const DELETE` (session gate → `deleteEvent(params.uid)` → 200/502). Import `RequestHandler` from `./$types`.
7. **`src/tests/fixtures/event-crm-href.ics`** (new) — VEVENT with `DESCRIPTION:CRM-HREF:/leads/test-uuid\nSome notes here`.
8. **`src/tests/caldav-parser-crm-href.spec.ts`** (new) — AC1 (CRM-HREF → url), AC2 (no CRM-HREF → url null, description preserved), AC3 (mixed content → url extracted + remaining description). Reuse an existing fixture for the negative case.
9. **`src/tests/caldav-writer.spec.ts`** (new) — mock `$env/dynamic/private` (`vi.mock('$env/dynamic/private', () => ({ env: {...} }))`) and global `fetch`. AC4 (URL/method/headers/body), AC5 (non-2xx → throws `CalDavWebhookError`; assert secret + url + upstream body absent from `error.message` and all serialized fields), AC6 (`safeParse` rejects missing `title`/`start`/`end` + invalid ISO), AC9 unit layer (error-shape invariant on throw).
10. **Verify + regression** — `bun run check`; `bun run test:unit:ci`; targeted `bun run test:unit -- src/tests/caldav-parser.spec.ts` (NCAL-1 regression) + new specs. Write self-skipping `e2e/caldav-write.e2e.ts` (records AC7/AC8 known-gap on disk; skips until shared Playwright auth fixture exists). Fix inline until green.

### TDD stubs (Fully-Automated rows — red-first starting points)

```
Failing stub:
test("CRM-HREF line in DESCRIPTION surfaces as event.url", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC1")
})
Failing stub:
test("writer posts x-webhook-secret header and JSON body to n8n", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC4")
})
Failing stub:
test("non-2xx from n8n throws CalDavWebhookError without secret or url", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC5")
})
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `caldav-parser-crm-href.spec.ts` — CRM-HREF fixture → `url === '/leads/test-uuid'` | Fully-Automated | AC1 |
| `caldav-parser-crm-href.spec.ts` — no-CRM-HREF fixture → `url === null`, description unchanged | Fully-Automated | AC2 |
| `caldav-parser-crm-href.spec.ts` — mixed content → url extracted, remaining lines = description | Fully-Automated | AC3 |
| `caldav-writer.spec.ts` — mocked fetch asserts URL/method/`x-webhook-secret`/body | Fully-Automated | AC4 |
| `caldav-writer.spec.ts` — non-2xx → throws `CalDavWebhookError`; secret+URL+upstream absent | Fully-Automated | AC5, AC9 (unit layer) |
| `caldav-writer.spec.ts` / `schemas.spec.ts` — `safeParse` rejects missing/invalid fields | Fully-Automated | AC6 |
| `caldav-parser.spec.ts` (existing) still green | Fully-Automated (regression) | NCAL-1 preservation (Constraint 10) |
| `e2e/caldav-write.e2e.ts` — unauth → 401 on all 3 routes | Agent-Probe (known-gap, pre-accepted) | AC7 |
| `e2e/caldav-write.e2e.ts` — valid session + bad payload → 400, no webhook | Agent-Probe (known-gap, pre-accepted) | AC8 |
| Route-layer 502 mapping on n8n failure | Agent-Probe (known-gap, pre-accepted) | AC9 (route layer) |
| Live create → GET read-back shows `url` | Agent-Probe (known-gap, pre-accepted) | AC10 |

**Known-gap handling:** AC7/AC8/AC9-route/AC10 are Agent-Probe because they depend on the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) and the live CalDAV harness (`process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`) — both pre-existing, pre-accepted repo-wide gaps, not new. These criteria's gates stay CONDITIONAL: write the self-skipping `e2e/caldav-write.e2e.ts` (records the residual as an on-disk backlog stub) rather than dropping them silently. Every developed behavior (AC1–AC6, AC9 unit) has a Fully-Automated proving gate — the plan is not vacuously green.

**Test commands (from `process/context/tests/all-tests.md`):** `bun run check`, `bun run test:unit:ci`, `bun run test:unit -- src/tests/caldav-parser.spec.ts`.

## Test Infra Improvement Notes

(none identified yet — AC7/AC8/AC10 blocked on the two existing pre-accepted backlog items: shared Playwright auth fixture + live CalDAV CI harness. No NEW infra gap introduced by NCAL-2.)

---

## Dependencies & Risks

- **Dependency:** three env vars must exist at runtime for write routes to function (deploy-time step; not applied in this env). Unit tests mock them.
- **Dependency:** OQ-1 (write-route role restriction) — PLAN proceeds with "all authenticated users" default. If answered "managers only" before EXECUTE, add a role guard after the session gate in each handler (small, additive).
- **Risk (medium):** `z.iso.datetime()` API surface — confirm the Zod v4 method name during EXECUTE (checklist step 1); the repo uses `z.iso.date()` so the `z.iso` namespace is present.
- **Risk (low):** parser edit breaking NCAL-1 — mitigated by existing `caldav-parser.spec.ts` regression run (step 10) and additive-only design (Constraint 10).
- **Risk (low):** `crypto.randomUUID()` availability — global in the Node/Vercel runtime (same runtime that provides `Buffer` in `constants.ts`).

## Rollback

All changes are additive except the single parser line. To roll back: revert `parser.ts` line 106 to the `URL:` read, remove `writer.ts` + `[uid]/+server.ts` + POST handler + two schemas + three env accessors. No migrations, no schema changes, no data mutation — pure code revert.

---

## Resume and Execution Handoff

1. **Selected plan file (primary execute anchor):** `process/features/calendar/active/ncal-2-caldav-write_08-07-26/ncal-2-caldav-write_PLAN_08-07-26.md` (no supporting phase files — single-plan work).
2. **Last completed step:** VALIDATE (Gate CONDITIONAL, contract below). No code changed yet.
3. **Validate-contract status:** written 08-07-26 — Gate CONDITIONAL (user-accepted known-gaps AC7/AC8/AC9-route/AC10).
4. **Supporting context loaded:** SPEC (above path), `process/context/all-context.md`, `process/context/tests/all-tests.md`, `src/lib/caldav/{constants,parser,reader}.ts`, `src/routes/api/calendar/events/+server.ts`, `src/lib/zod/schemas.ts`.
5. **Next step for a fresh agent:** confirm branch `feat/ncal-2-caldav-write-client`, then execute checklist steps 1→10 in order; each source step is followed by its unit-test step; run `bun run check` + `bun run test:unit:ci` as the final gate; do NOT write live-dependent e2e assertions (self-skip only). Follow execute-agent instructions E1/E2 in the contract.

## Next Step

Gate is CONDITIONAL with user-accepted known-gaps. Ready for **ENTER EXECUTE MODE** against this plan path.

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 3/7 (S2 schema/API/auth surface, S6 high-risk class secrets+public-API, S7 5+ files). Single app, 10 files, one implementer, no cross-agent coordination needed — sequential vc-execute-agent is the fit; parallelism adds no benefit on a single interdependent code slice.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | CRM-HREF line in DESCRIPTION surfaces as `event.url` | Fully-Automated | `bun run test:unit:ci` → `caldav-parser-crm-href.spec.ts` (CRM-HREF fixture → `url === '/leads/test-uuid'`) | A |
| AC2 | No CRM-HREF → `url: null`, description unchanged | Fully-Automated | `bun run test:unit:ci` → `caldav-parser-crm-href.spec.ts` negative case | A |
| AC3 | Mixed DESCRIPTION → url extracted, remaining lines = description | Fully-Automated | `bun run test:unit:ci` → `caldav-parser-crm-href.spec.ts` mixed case | A |
| AC4 | Writer sends correct URL/method/`x-webhook-secret`/JSON body | Fully-Automated | `bun run test:unit:ci` → `caldav-writer.spec.ts` (mocked fetch) | A |
| AC5 | Non-2xx → `CalDavWebhookError`; secret/URL/upstream absent from error | Fully-Automated | `bun run test:unit:ci` → `caldav-writer.spec.ts` error-shape assertions | A |
| AC6 | Zod rejects missing/invalid `title`/`start`/`end` + bad ISO | Fully-Automated | `bun run test:unit:ci` → `caldav-writer.spec.ts` / `schemas.spec.ts` `safeParse` cases | A |
| AC9 (unit) | Error-shape invariant on writer throw (no leak) | Fully-Automated | `bun run test:unit:ci` → `caldav-writer.spec.ts` | A |
| NCAL-1 regression | Existing read path preserved | Fully-Automated | `bun run test:unit -- src/tests/caldav-parser.spec.ts` still green | A |
| AC7 | Unauth → 401 on all 3 write routes | Agent-Probe | `e2e/caldav-write.e2e.ts` (self-skipping until shared Playwright auth fixture) | D |
| AC8 | Valid session + bad payload → 400, no webhook call | Agent-Probe | `e2e/caldav-write.e2e.ts` (self-skipping) | D |
| AC9 (route) | Route-layer maps n8n failure → 502, no upstream detail | Agent-Probe | route-layer manual/e2e probe (blocked on auth fixture) | D |
| AC10 | Round-trip create → GET read-back shows `url` | Agent-Probe | live one-time probe against Nextcloud (blocked on live CalDAV harness) | D |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to named later phase; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here). Known-Gap is not a strategy; AC7/AC8/AC9-route/AC10 are Agent-Probe residuals carried via gap-resolution D (self-skipping on-disk stub `e2e/caldav-write.e2e.ts`).

Legacy line form (retained for existing consumers):
- Parser CRM-HREF (AC1–AC3): Fully-automated: `bun run test:unit:ci` (caldav-parser-crm-href.spec.ts)
- Writer module (AC4/AC5/AC6/AC9-unit): Fully-automated: `bun run test:unit:ci` (caldav-writer.spec.ts / schemas.spec.ts)
- NCAL-1 regression: Fully-automated: `bun run test:unit -- src/tests/caldav-parser.spec.ts`
- Route auth/validation/502 (AC7/AC8/AC9-route): agent-probe: self-skipping `e2e/caldav-write.e2e.ts` — precondition: shared Playwright auth fixture (known-gap)
- Round-trip read-back (AC10): agent-probe: live Nextcloud probe — precondition: live CalDAV harness (known-gap)

Failing stub (AC1):
test("CRM-HREF line in DESCRIPTION surfaces as event.url", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: CRM-HREF line in DESCRIPTION surfaces as event.url")
})

Failing stub (AC4):
test("writer posts x-webhook-secret header and JSON body to n8n", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: writer posts x-webhook-secret header and JSON body to n8n")
})

Failing stub (AC5):
test("non-2xx from n8n throws CalDavWebhookError without secret or url", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: non-2xx from n8n throws CalDavWebhookError without secret or url")
})

Dimension findings:
- Infra fit: PASS — 3 new env vars read via `$env/dynamic/private` (not `process.env`), no container/port/runtime-lifecycle surface; deploy-time env-var step is documented, unit tests mock the env. No infra conflict.
- Test coverage: CONCERN — every developed behavior (AC1–AC6, AC9-unit) has a Fully-Automated gate; AC7/AC8/AC9-route/AC10 are Agent-Probe blocked on the pre-existing shared Playwright auth fixture + live CalDAV harness (both pre-accepted repo-wide backlog items, no NEW gap). Not vacuously green.
- Breaking changes: CONCERN — `parser.ts` line 106 change is the sole NCAL-1 regression surface; guarded by existing `caldav-parser.spec.ts` (must pass unchanged). The 3 new API routes are additive (new paths / new method on existing GET file). No consumer of the current parser contract breaks (additive `url` derivation, `null`-preserving).
- Security surface: PASS (with E2 enforcement) — HIGH risk class (shared webhook secret / trust-boundary + public API + auth gate). STRIDE scan complete; invariants (secret/URL/upstream never client-visible; session-gate-first; JSON-not-XML to n8n) are enforced via `CalDavWebhookError` fixed message + `error(502)` mapping + AC5 assertions. Manual-first risk-evidence-pack (`vc-risk-evidence-pack`) is required at EXECUTE before marking VERIFIED — see E2.
- Section feasibility (writer + constants + schemas): CONCERN — mechanically feasible (edit targets present: `constants.ts` mirrors `reader.ts`, `schemas.ts` already uses `z.iso` namespace). Gap: `z.iso.datetime()` v4 method name unconfirmed (see E1). Highest-risk edit: `writer.ts` secret handling — mitigated by AC5 leak assertions.
- Section feasibility (parser patch): CONCERN — mechanically feasible (line 106 `url` read is a unique matchable target). Highest-risk edit: the single parser line (only NCAL-1 regression surface); mitigated by additive design + regression spec (step 10).
- Section feasibility (routes): PASS — POST extends existing GET file (no collision); `[uid]/+server.ts` is a new file; session-gate-first pattern matches existing GET handler.

Execute-agent instructions:
- E1: Before writing `createCalendarEventSchema`/`updateCalendarEventSchema` (checklist step 1), confirm `z.iso.datetime()` is the correct Zod v4 API for ISO-8601 date-time. If the method name differs, use the correct v4 method — do NOT drop date-time validation or fall back to a bare `z.string()`. Document the confirmed/corrected method in the phase report. Trigger: schemas.ts edit (step 1).
- E2: Session gate (`if (!locals.user) throw error(401)`) MUST be the FIRST statement in every one of the 3 handlers, before `request.json()`, validation, or any writer call. `CalDavWebhookError.message` must be a fixed client-safe string; NEVER attach the webhook secret, webhook URL, or upstream response body to the thrown error or any response. Route catch maps every writer throw to `error(502, 'Calendar service unavailable')`. Produce the manual-first `vc-risk-evidence-pack` (risk-gate / context-snippets / verification / review-decision / adversarial-validation) in the task folder `harness/` before reporting the high-risk work DONE. Trigger: routes + writer edits (steps 3, 5, 6).

Open gaps:
- AC7 (unauth → 401 on 3 routes): known-gap: Agent-Probe, blocked on shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) — pre-accepted, recorded as self-skipping `e2e/caldav-write.e2e.ts` on-disk stub.
- AC8 (bad payload → 400, no webhook): known-gap: same Agent-Probe root cause and self-skipping stub.
- AC9 route-layer (n8n failure → 502): known-gap: Agent-Probe route layer; unit layer IS Fully-Automated-proven.
- AC10 (round-trip read-back): known-gap: Agent-Probe, blocked on live CalDAV harness (`process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md`) — pre-accepted.

What this coverage does NOT prove:
- The Fully-Automated unit suite (`caldav-parser-crm-href.spec.ts`, `caldav-writer.spec.ts`, `schemas.spec.ts`) proves parser extraction logic, writer request shape/headers/body, error-leak invariants, and Zod rejection — it does NOT prove any HTTP-route behavior end-to-end: not the 401 session gate firing on a real unauth request (AC7), not the 400 validation response with a real session (AC8), not the route-layer 502 mapping on a real n8n failure (AC9-route).
- The NCAL-1 regression run proves the existing parser fixtures still pass — it does NOT prove behavior against real Nextcloud ICS payloads beyond the committed fixtures.
- No gate proves the live round-trip (create via n8n → CalDAV PUT → GET read-back surfaces `url`) — AC10 requires a live Nextcloud + n8n environment absent in this repo.
- No gate proves the deploy-time env-var wiring (`N8N_CALENDAR_WEBHOOK_URL` / `N8N_CALENDAR_DELETE_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET`) is present in any live environment — unit tests mock these.

Gate: CONDITIONAL (concerns noted, user accepted)
Accepted by: user (session, 08-07-26) — accepted concerns: AC7 (unauth-401 e2e known-gap), AC8 (bad-payload-400 e2e known-gap), AC9-route (502 route-layer known-gap), AC10 (live round-trip known-gap). All four are pre-existing, pre-accepted repo-wide Agent-Probe gaps (shared Playwright auth fixture + live CalDAV harness); no NEW gap introduced by NCAL-2. E1/E2 recorded as execute-agent instructions. P1 (Blast Radius file-count correction) applied to plan.

## Autonomous Goal Block

```
SESSION GOAL: NCAL-2 — CalDAV write client (create/update/delete Nextcloud events via n8n webhooks) + NCAL-1 parser CRM-HREF patch (GitHub #252)
Charter + umbrella plan: N/A — single COMPLEX plan
Autonomy: standard interactive — ENTER EXECUTE MODE required before implementation; per process/development-protocols/orchestration.md §Autonomy Mode
Hard stop conditions / safety constraints:
- Secret, webhook URL, and upstream n8n response detail must NEVER appear in any client-visible response, error message, or log (CalDavWebhookError fixed client-safe message + error(502) mapping).
- Session gate (401) must be the FIRST statement in every write handler, before parse/validate/writer.
- HIGH-risk class (webhook secret / trust-boundary + public API): produce the manual-first vc-risk-evidence-pack before marking work VERIFIED.
- Do NOT write live-dependent e2e assertions — self-skip only (AC7/AC8/AC9-route/AC10 stay CONDITIONAL known-gaps).
Next phase: EXECUTE: process/features/calendar/active/ncal-2-caldav-write_08-07-26/ncal-2-caldav-write_PLAN_08-07-26.md
Validate contract: inline in plan (Gate CONDITIONAL — user-accepted known-gaps)
Execute start: bun run check | bun run test:unit:ci | bun run test:unit -- src/tests/caldav-parser.spec.ts | e2e: e2e/caldav-write.e2e.ts (self-skipping) | high-risk pack: yes
```
