---
name: plan:ncal-3-crm-sync
description: COMPLEX plan for NCAL-3 — wire CRM meeting + lead-date mutations to push/remove Nextcloud events via n8n webhooks (Approach C dedicated calendar-sync.ts module) plus manual sync trigger UI
date: 08-07-26
feature: calendar
---

# NCAL-3 — CRM Calendar Sync PLAN (COMPLEX)

Date: 08-07-26
Status: ACTIVE — awaiting VALIDATE
Complexity: COMPLEX
Feature: calendar
GitHub: #269
SPEC: `process/features/calendar/active/ncal-3-crm-sync_08-07-26/ncal-3-crm-sync_SPEC_08-07-26.md`
Architecture: Approach C (locked in INNOVATE) — dedicated `src/lib/server/n8n/calendar-sync.ts`
Context router: `process/context/all-context.md` (read first) + `process/context/tests/all-tests.md`

---

## TL;DR

Add 3 nullable UID columns (Phase 1), build a dedicated `calendar-sync.ts` orchestration module with pure payload builders + DB write-back helpers and unit tests (Phase 2), wire the 4 CRM mutation routes for fire-and-forget auto-sync plus 2 new awaited manual-sync endpoints (Phase 3), then add "Sync to Nextcloud" buttons to the meeting and lead detail pages (Phase 4). Sync failures never block saves. `writer.ts` (NCAL-2) and all 3 n8n env vars already exist — no new env vars. Execute phases strictly in order; Phase N depends on Phase N-1.

---

## Overview

The CRM has a working Nextcloud write client (`src/lib/caldav/writer.ts`, NCAL-2, live-verified) but nothing calls it automatically. NCAL-3 wires the three CRM mutation surfaces (meeting create/edit/delete, lead go-live date, lead event-start date) so each write pushes or removes a Nextcloud event through the existing n8n webhook. A new UID storage layer (3 nullable schema columns) lets the CRM track which Nextcloud events it created so future edits update the right record. Manual "Sync to Nextcloud" buttons on the meeting detail and lead detail pages provide a backfill path for pre-existing records.

**Goals:** wire auto-sync on all three record types; provide a manual backfill trigger; never let a Nextcloud/n8n outage break a CRM save.

**Design invariants (from SPEC constraints):**
- Auto-sync is fire-and-forget: `void syncFn(...).catch((e) => console.error(...))`. A Nextcloud/n8n outage must never produce a 5xx on a meeting or lead save.
- Manual sync (button endpoints) `await`s and returns 502 on failure so the UI can show a retry message.
- All-day date events use Manila-midnight (UTC+8): `YYYY-MM-DD` → start `YYYY-MM-DDT16:00:00Z`, end `YYYY-MM-DDT15:59:59Z` on the FOLLOWING UTC day (see Phase 2 note for the exact +1-day arithmetic).
- Meeting end = `startAt + 1 hour` (no `endAt` column exists).
- `calendar-sync.ts` imports DB helpers only — never `db` directly (project convention). DB helpers and route handlers stay CalDAV-ignorant.
- `N8N_WEBHOOK_SECRET` never reaches the client (writer.ts already enforces this; routes must not leak `CalDavWebhookError.upstreamStatus` or message detail beyond the client-safe generic).

---

## Phase Completion Rules

- A phase is `CODE DONE` only when its own checklist is implemented and its phase test gate (`bun run test:unit:ci` + `bun run check` + `bun run lint`) passes locally.
- A phase is `VERIFIED` only when its CODE DONE state is confirmed by an independent EVL gate run (vc-tester re-running the validate-contract gate commands) with no failing gate, OR its residual gaps are recorded as pre-accepted known-gaps (see Known Gaps).
- Phases are strictly ordered 1 → 2 → 3 → 4. Do not begin Phase N until Phase N-1 is CODE DONE. Phase 2 requires Phase 1's schema columns + extended `getMeeting()`; Phase 3 requires Phase 2's module + helpers; Phase 4 requires Phase 3's endpoints.
- Known-Gap is a recorded residual, never a terminal PASS for developed behavior. Any behavior resting on a Known-Gap keeps its gate CONDITIONAL and gets a backlog reference.

---

## Touchpoints

**Read for context (do not modify unless listed under Blast Radius):**
- `process/context/all-context.md` (root router — read first) and `process/context/tests/all-tests.md`
- `src/lib/caldav/writer.ts` — `createEvent(payload)`, `updateEvent(uid, payload)`, `deleteEvent(uid)`, `embedCrmHref()`, `CalendarEventPayload`, `CalDavWebhookError`
- `src/lib/server/db/schema.ts` — `crmMeetings` (lines 339–370), `crmLeads` (lines 122–218)
- `drizzle/meta/_journal.json` — last idx = 32 (confirmed); next = 33
- `src/lib/types/index.ts` — `Meeting` type at line 171 (does NOT carry `nextcloud_uid`; sync helpers take the raw DB row or explicit fields, not the mapped `Meeting`) [path corrected in VALIDATE P1 — was `src/lib/types.ts`]
- `src/lib/server/db/leads.ts` — `getLead()`, `updateLead()` signatures

---

## Public Contracts

**New DB columns (Phase 1):**
- `crm_meetings.nextcloud_uid text` — nullable, default null
- `crm_leads.nextcloud_go_live_uid text` — nullable, default null
- `crm_leads.nextcloud_event_uid text` — nullable, default null

**New module `src/lib/server/n8n/calendar-sync.ts` (Phase 2) — server-only exports:**
- `buildMeetingPayload(meeting): CalendarEventPayload` — pure
- `buildGoLiveDatePayload(lead): CalendarEventPayload` — pure
- `buildEventDatePayload(lead): CalendarEventPayload` — pure
- `manilaAllDayRange(dateStr): { start: string; end: string }` — pure helper (exported for direct testing)
- `syncMeetingToNextcloud(meeting): Promise<{ uid: string }>` — create-or-update + UID write-back; returns the effective uid
- `deleteMeetingFromNextcloud(meetingId, uid): Promise<void>` — delete + clear UID
- `syncLeadDatesToNextcloud(lead, prev): Promise<void>` — 3-branch per date field

**New DB helpers:**
- `updateMeetingNextcloudUid(id, uid | null): Promise<void>` in `meetings.ts`
- `updateLeadNextcloudUids(id, patch: { nextcloudGoLiveUid?: string | null; nextcloudEventUid?: string | null }): Promise<void>` in `leads.ts`
- `getMeeting()` return shape EXTENDED to include `nextcloudUid: string | null`

**New API endpoints (Phase 3):**
- `POST /api/meetings/[id]/sync` — session-gated; awaited; 200 `{ success: true, uid }` / 502 `{ error: 'Calendar sync failed' }`
- `POST /api/leads/[id]/sync` — session-gated; awaited; 200 `{ success: true }` / 502 `{ error: 'Calendar sync failed' }`

---

## Blast Radius

**Risk class:** schema/migration (Phase 1) + public-API-surface (Phase 3 new endpoints). Medium-high. No auth/billing/secret-logic changes (writer.ts already owns the secret boundary).

**Files CREATED (8):**
1. `drizzle/0033_*.sql` — generated migration (idx 33)
2. `src/lib/server/n8n/calendar-sync.ts`
3. `src/routes/api/meetings/[id]/sync/+server.ts`
4. `src/routes/api/leads/[id]/sync/+server.ts`
5. `src/tests/schema-ncal3.spec.ts`
6. `src/tests/ncal3-meeting-sync.spec.ts`
7. `src/tests/ncal3-lead-sync.spec.ts`
8. `e2e/ncal3-lead-sync.e2e.ts` (self-skipping stub)

**Files MODIFIED (9):**
1. `src/lib/server/db/schema.ts` — add 3 columns
2. `drizzle/meta/_journal.json` — new idx 33 entry (auto by `db:generate`)
3. `src/lib/server/db/meetings.ts` — add `updateMeetingNextcloudUid()`; extend `getMeeting()` select
4. `src/lib/server/db/leads.ts` — add `updateLeadNextcloudUids()`; expose prev UID fields on `getLead()` return if not already present (verify during Phase 2)
5. `src/routes/api/meetings/+server.ts` — wire POST auto-sync
6. `src/routes/api/meetings/[id]/+server.ts` — wire PATCH + DELETE auto-sync
7. `src/routes/api/leads/[id]/+server.ts` — wire PATCH auto-sync
8. `src/routes/meetings/[id]/+page.svelte` — sync button
9. `src/routes/leads/[id]/+page.svelte` — sync button

**Files explicitly UNCHANGED (regression-watch):**
- `src/lib/caldav/writer.ts`, `reader.ts`, `parser.ts`, `constants.ts` — consumed, never edited
- NCAL-1 read path (`GET /api/calendar/events`, `src/routes/calendar/*`) — no changes
- In-flight calendar display plans (`cal-2-two-calendar-markers`, `calendar-golive-events`) share `crm_leads` schema + `leads.ts` — the 2 new lead UID columns are additive and must not collide with their column additions. Confirm no name overlap when generating the migration. [VALIDATE P2: verified — neither in-flight plan references `nextcloud*` columns, `ADD COLUMN`, `db:generate`, or idx 0033; both are display-only. No column/migration collision. Downgraded to a Phase-1 confirmation note.]

---

## Acceptance Criteria

The 12 SPEC acceptance criteria (AC1–AC12) are the authoritative bar. Each is mapped to a proving scenario + strategy in the Verification Evidence table below. Summary:

- **AC1** — 3 nullable UID columns exist after migration. `proven by:` `schema-ncal3.spec.ts` (shape) + manual applied-SQL check. `strategy:` Hybrid.
- **AC2** — `buildMeetingPayload` field mapping. `proven by:` `ncal3-meeting-sync.spec.ts`. `strategy:` Fully-Automated.
- **AC3** — `buildGoLiveDatePayload` exact UTC strings + title. `proven by:` `ncal3-lead-sync.spec.ts`. `strategy:` Fully-Automated.
- **AC4** — `buildEventDatePayload` same shape, "— Event Date". `proven by:` `ncal3-lead-sync.spec.ts`. `strategy:` Fully-Automated.
- **AC5** — 3-branch create/update/delete per date field. `proven by:` `ncal3-lead-sync.spec.ts` (6 tests). `strategy:` Fully-Automated.
- **AC6** — meeting create sync failure → route still 200, UID null, no leak. `proven by:` `ncal3-meeting-sync.spec.ts`. `strategy:` Fully-Automated.
- **AC7** — lead sync failure → PATCH still 200. `proven by:` `ncal3-lead-sync.spec.ts`. `strategy:` Fully-Automated.
- **AC8** — meeting sync endpoint 401/create/update/502. `proven by:` `ncal3-meeting-sync.spec.ts` (unit) + `e2e/caldav-write.e2e.ts` (auth gate). `strategy:` Hybrid.
- **AC9** — lead sync endpoint 401/both-fire/502. `proven by:` `ncal3-lead-sync.spec.ts` (unit) + `e2e/ncal3-lead-sync.e2e.ts`. `strategy:` Hybrid.
- **AC10** — meeting detail button render + click. `proven by:` `e2e/caldav-write.e2e.ts` (self-skip) + Agent-Probe. `strategy:` Agent-Probe (known-gap).
- **AC11** — lead detail button render + click. `proven by:` `e2e/ncal3-lead-sync.e2e.ts` (self-skip) + Agent-Probe. `strategy:` Agent-Probe (known-gap).
- **AC12** — both dates null → zero writer calls. `proven by:` `ncal3-lead-sync.spec.ts`. `strategy:` Fully-Automated.

---

## Implementation Checklist

### Phase 1 — Schema migration (UID storage columns)

**Goal:** Add 3 nullable text UID columns and make `getMeeting()` return `nextcloud_uid`. Reconcile Drizzle journal drift first.
**Depends on:** nothing. **Blocks:** Phases 2, 3.

1. **Reconcile journal drift (PREREQUISITE — do before `db:generate`).** Run `ls drizzle/*.sql` and compare against `drizzle/meta/_journal.json` entries. Confirm every `.sql` file has a matching `idx` in the journal and no two `.sql` files share a numeric prefix. The SPEC names `0014_agreements_fields.sql` as an unregistered stray — verify whether it exists on disk. If it exists and is unregistered: reconcile per `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md` (either fold its DDL into the schema-of-record and delete the stray, or register it) BEFORE generating idx 33. If it does not exist (already reconciled in an earlier phase), note "no drift found" and proceed. Do NOT layer idx 33 on top of unreconciled drift. [VALIDATE E5: drift is REAL and present — `0014_agreements_fields.sql` AND `0014_nasty_master_mold.sql` both share prefix 0014; 34 `.sql` files vs 33 journal entries (idx 0–32). This reconciliation is MANDATORY before `db:generate`.]
2. In `src/lib/server/db/schema.ts`, add to `crmMeetings` (after `outcome`, before `deletedAt`): `nextcloudUid: text('nextcloud_uid'),`.
3. In `src/lib/server/db/schema.ts`, add to `crmLeads` (near the onboarding block, after `goLiveDate`): `nextcloudGoLiveUid: text('nextcloud_go_live_uid'),` and `nextcloudEventUid: text('nextcloud_event_uid'),`. All three are nullable (no `.notNull()`, no default → default null).
4. Run `bun run db:generate`. Confirm exactly ONE new file `drizzle/0033_*.sql` is produced and the journal gains an `idx: 33` entry. Inspect the generated SQL — it must be 3 `ALTER TABLE ... ADD COLUMN ... text;` statements and nothing else (no destructive DDL). If the diff includes anything beyond the 3 additive columns, STOP — the schema-of-record has unexpected drift.
5. Run `bun run db:migrate` against the local DB IF a local Postgres is available in this environment. If no live DB is available (expected — same as NCAL-1/NCAL-2), note the apply as a deploy-time step and mark the apply-and-query proof a known-gap (see Known Gaps). The generated `.sql` file is committed regardless.
6. Extend `getMeeting()` in `src/lib/server/db/meetings.ts`: add `nextcloudUid: crmMeetings.nextcloudUid` to the `.select({...})` object and update the return type to `{ id: string; organizerId: string | null; nextcloudUid: string | null } | null`.

**Phase 1 test gate:** `bun run check` must pass; `db:generate` produces the expected 3-column-only diff. (schema-ncal3.spec — written in Phase 2 — gates the schema shape via `bun run test:unit:ci`.)

### Phase 2 — calendar-sync.ts module + payload builders + DB helpers + unit tests

**Goal:** Build the pure payload builders, orchestration functions, and the two UID write-back DB helpers. Full unit coverage for AC2–AC5, AC12, AC1 (shape).
**Depends on:** Phase 1. **Blocks:** Phase 3.

7. Create `src/lib/server/n8n/calendar-sync.ts`. Add the server-only header comment mirroring `writer.ts`. Import `createEvent, updateEvent, deleteEvent, embedCrmHref, type CalendarEventPayload, CalDavWebhookError` from `$lib/caldav/writer`, and the two new UID helpers from the DB layer.
8. **`manilaAllDayRange(dateStr: string): { start: string; end: string }`** (pure, exported). Implement EXACTLY per SPEC AC3/Constraint 5: `start = ${dateStr}T16:00:00Z`; `end = ${nextUtcDay(dateStr)}T15:59:59Z` where `nextUtcDay` = `new Date(dateStr + 'T00:00:00Z').getTime() + 86400000`, `.toISOString().slice(0,10)`. Do NOT hand-roll month rollover. The unit test asserts exact strings.
9. **`buildMeetingPayload(meeting): CalendarEventPayload`** (pure). Input = raw `crm_meetings` row (or `{ id, leadId, startAt, venue, notes, nextcloudUid }`). Output: `uid` = `meeting.nextcloudUid ?? crypto.randomUUID()`; `title` = deterministic meeting-title fallback (no `title` column exists — decide exact fallback string, e.g. `'Meeting'` or `Meeting — ${leadName}`, and assert it in the test per AC2 — see VALIDATE E4); `start` = `new Date(meeting.startAt).toISOString()`; `end` = `new Date(new Date(meeting.startAt).getTime() + 3600_000).toISOString()`; `location` = `meeting.venue ?? undefined`; `description` = `embedCrmHref('/leads/' + meeting.leadId, 'CRM-HREF... meeting-href composition')` — note `embedCrmHref` prepends `CRM-HREF:${leadHref}` and strips extra `CRM-HREF:` lines, so embed the meeting deep-link `/meetings/${meeting.id}` as a plain second description line; confirm exact composition in the test (AC2 requires the description include `/meetings/[id]` and `leadHref` = `/leads/[leadId]`).
10. **`buildGoLiveDatePayload(lead): CalendarEventPayload`** (pure; caller guards `lead.goLiveDate` non-null). `uid` = `lead.nextcloudGoLiveUid ?? crypto.randomUUID()`; `title` = `${organizerNameOrEventName} — Ticket Sale Start` (organizer name preferred, fall back to lead `eventName`/`name` — assert precedence per AC3); `start`/`end` = `manilaAllDayRange(lead.goLiveDate)`; `description` = `embedCrmHref('/leads/' + lead.id, undefined)`.
11. **`buildEventDatePayload(lead): CalendarEventPayload`** (pure). Same as step 10 with title suffix `— Event Date`, source date `lead.eventDate`, uid source `lead.nextcloudEventUid`.
12. **`syncMeetingToNextcloud(meeting): Promise<{ uid: string }>`**. If `meeting.nextcloudUid` present → `await updateEvent(meeting.nextcloudUid, payloadWithoutUid)`, return `{ uid: meeting.nextcloudUid }`. Else → `const { uid } = await createEvent(payload); await updateMeetingNextcloudUid(meeting.id, uid); return { uid }`. Null uid always takes the create branch (covers the update-fallback-when-uid-missing behavior).
13. **`deleteMeetingFromNextcloud(meetingId, uid): Promise<void>`**. `await deleteEvent(uid); await updateMeetingNextcloudUid(meetingId, null)`. Caller only invokes when `uid` non-null.
14. **`syncLeadDatesToNextcloud(lead, prev): Promise<void>`** where `prev = { goLiveDate, eventDate, nextcloudGoLiveUid, nextcloudEventUid }` (pre-update snapshot). For EACH date field apply the 3-branch decision on NEW lead state vs prev UID: (a) date set + no UID → `createEvent(build...Payload(lead))` → `updateLeadNextcloudUids(lead.id, { nextcloud{GoLive|Event}Uid: uid })`; (b) date set + UID exists → `updateEvent(prevUid, build...PayloadWithoutUid)` (no write-back); (c) date cleared + UID exists → `deleteEvent(prevUid)` → `updateLeadNextcloudUids(lead.id, { nextcloud{...}Uid: null })`; (d) date null + no UID → no-op (AC12). Structure so BOTH field branches are attempted even if one throws (so the manual endpoint can 502 on any failure while still attempting the other); a per-field try around the writer call, re-throwing after both attempted, is acceptable. [VALIDATE E3: `syncLeadDatesToNextcloud` needs the new `nextcloud*` fields on the `lead` object. `getLead` returns a mapped `Lead` via `dbRowToLead`; the mapper does NOT yet surface these columns. Extending only the select is insufficient — `dbRowToLead` (and the `Lead` type in `src/lib/types/index.ts`) MUST be extended to map `nextcloudGoLiveUid`/`nextcloudEventUid` so they reach the orchestrator. Do this in Phase 2/3 when wiring the lead PATCH route.]
15. Add `updateMeetingNextcloudUid(id: string, uid: string | null): Promise<void>` to `meetings.ts`: `await db.update(crmMeetings).set({ nextcloudUid: uid, updatedAt: new Date() }).where(eq(crmMeetings.id, id));`.
16. Add `updateLeadNextcloudUids(id, patch): Promise<void>` to `leads.ts`: build a partial set object from `patch` (only include keys present), always bump `updatedAt`, `where(eq(crmLeads.id, id))`.
17. Write `src/tests/schema-ncal3.spec.ts` (AC1): assert `crmMeetings.nextcloudUid`, `crmLeads.nextcloudGoLiveUid`, `crmLeads.nextcloudEventUid` exist on the schema objects and their `.name` maps to the snake_case column. No live DB needed.
18. Write `src/tests/ncal3-meeting-sync.spec.ts` (AC2, AC5-meeting): fixture row → assert `buildMeetingPayload` fields exactly. Mock `createEvent`/`updateEvent`/`deleteEvent` via `vi.mock('$lib/caldav/writer', …)` to assert `syncMeetingToNextcloud` create vs update branch + UID write-back. Use the `vi.mock('$env/dynamic/private', …)` pattern from NCAL-2 specs.
19. Write `src/tests/ncal3-lead-sync.spec.ts` (AC3, AC4, AC5, AC12): fixed-date fixtures → assert builder UTC start/end strings EXACTLY. Six branch tests (3 per date field) for `syncLeadDatesToNextcloud`. One AC12 test: both dates null + no prev UID → assert none of create/update/delete called.

**Phase 2 test gate:** `bun run test:unit:ci` (new specs green) + `bun run check` + `bun run lint`.

### Phase 3 — Route handler wiring + manual sync endpoints + unit tests

**Goal:** Fire-and-forget auto-sync on the 4 mutation routes; 2 new awaited manual-sync endpoints. Cover AC6–AC9.
**Depends on:** Phase 2. **Blocks:** Phase 4.

20. **`POST /api/meetings/+server.ts`** — after `const meeting = await createMeeting(...)`, before `return json(...)`: `void syncMeetingToNextcloud({ id: meeting.id, leadId: meeting.leadId, startAt: meeting.startAt, venue: meeting.venue, nextcloudUid: null }).catch((e) => console.error('meeting create sync failed', e));`. A freshly created meeting always has null UID → create branch. Response unchanged (201).
21. **`PATCH /api/meetings/[id]/+server.ts`** — the route already calls `getMeeting(params.id)` for auth (now returns `nextcloudUid`). After `updateMeeting(...)` + null-check: `void syncMeetingToNextcloud({ id: params.id, leadId: updated.leadId, startAt: updated.startAt, venue: updated.venue, nextcloudUid: meeting.nextcloudUid }).catch((e) => console.error('meeting update sync failed', e));`. Response unchanged. (`updated` is the full `Meeting` from `updateMeeting` → `getMeetingDetail`, so `leadId/startAt/venue` are available here; `meeting.nextcloudUid` comes from the extended `getMeeting`.)
22. **`DELETE /api/meetings/[id]/+server.ts`** — `meeting` (from `getMeeting`) now carries `nextcloudUid`. After `softDeleteMeeting` succeeds: `if (meeting.nextcloudUid) void deleteMeetingFromNextcloud(params.id, meeting.nextcloudUid).catch((e) => console.error('meeting delete sync failed', e));`. Response unchanged.
23. **`PATCH /api/leads/[id]/+server.ts`** — route already fetches `existing = await getLead(...)` before update. Capture prev snapshot from `existing`: `{ goLiveDate, eventDate, nextcloudGoLiveUid, nextcloudEventUid }`. Verify `getLead()` returns those 4 fields — if the two UID fields are not in the `getLead` select, add them (small select extension in `leads.ts`) AND extend `dbRowToLead` to map them (see VALIDATE E3 — the mapper, not just the select, is the actual work). After `updateLead(...)` succeeds, build the updated lead state (id + new dates + current UIDs) and call `void syncLeadDatesToNextcloud(updatedLeadState, prevSnapshot).catch((e) => console.error('lead date sync failed', e));`. Response unchanged (200).
24. Create **`src/routes/api/meetings/[id]/sync/+server.ts`** — `POST`: `if (!locals.user) throw error(401)`; fetch the FULL meeting via `getMeetingDetail(params.id)` (NOT `getMeeting`, which returns only `{id, organizerId, nextcloudUid}` and lacks `leadId/startAt/venue`) — see VALIDATE E1; `if (!meeting) throw error(404)`; **enforce ownership parity with PATCH/DELETE**: `if (!isManagerRole(locals.user.role) && meeting.organizerId !== locals.user.id) throw error(403)` — see VALIDATE E2 (the sync endpoint must NOT be a weaker gate than the mutation routes it backfills); `try { const { uid } = await syncMeetingToNextcloud({ id: params.id, leadId: meeting.leadId, startAt: meeting.startAt, venue: meeting.venue, nextcloudUid: meeting.nextcloudUid }); return json({ success: true, uid }); } catch (e) { if (e instanceof CalDavWebhookError) throw error(502, 'Calendar sync failed'); throw e; }`.
25. Create **`src/routes/api/leads/[id]/sync/+server.ts`** — `POST`: session gate → `const lead = await getLead(params.id, locals.user.id, locals.user.role); if (!lead) throw error(404)` (visibility trust boundary enforced inside `getLead`); `try { await syncLeadDatesToNextcloud(lead, { goLiveDate: lead.goLiveDate, eventDate: lead.eventDate, nextcloudGoLiveUid: lead.nextcloudGoLiveUid, nextcloudEventUid: lead.nextcloudEventUid }); return json({ success: true }); } catch (e) { if (e instanceof CalDavWebhookError) throw error(502, 'Calendar sync failed'); throw e; }`. Null dates skipped inside the orchestrator (AC9/AC12).
26. Write route-handler unit tests into the Phase 2 spec files: `ncal3-meeting-sync.spec.ts` — AC6 (mock `createEvent` throws `CalDavWebhookError` → POST still returns success, UID null, no error detail in body) + AC8 (sync endpoint 401/create-200-`{success,uid}`/update-200-`{success}`/throw-502-`{error}`). `ncal3-lead-sync.spec.ts` — AC7 (PATCH still 200 when sync throws) + AC9 (sync endpoint 401/both-fire/any-throw-502). Test route handlers by importing the `POST`/`PATCH`/`DELETE` exports and invoking with a mock `RequestEvent` (`locals.user`, `params`, `request.json()`). [VALIDATE P3: this route-unit pattern EXISTS in the repo — `src/tests/calendar-events-endpoint.spec.ts` imports `GET` directly and casts `{ locals, params } as unknown as` the handler param type. AC8/AC9 route-level coverage is therefore Fully-Automated, NOT contingent. Known Gap #5 is RESOLVED — do not fall back to module-level-only coverage.]

**Phase 3 test gate:** `bun run test:unit:ci` (AC6–AC9 green) + `bun run check` + `bun run lint`.

### Phase 4 — Manual sync UI buttons

**Goal:** "Sync to Nextcloud" buttons on meeting + lead detail pages with loading/success/error states. Cover AC10, AC11 (e2e self-skip known-gap).
**Depends on:** Phase 3. **Blocks:** nothing.

27. **`src/routes/meetings/[id]/+page.svelte`** — add a "Sync to Nextcloud" button. Svelte 5 runes: `let syncState = $state<'idle'|'loading'|'ok'|'err'>('idle')`. On click: `syncState='loading'`; `fetch('/api/meetings/' + id + '/sync', { method:'POST' })`; on `res.ok` → `'ok'`; else → `'err'`. Spinner while loading, success badge on ok, short "Calendar sync failed — try again" on err. Reset after a few seconds or on next click.
28. **`src/routes/leads/[id]/+page.svelte`** — same button in the dates section (near go-live / event date display). Same `$state` pattern; POST to `/api/leads/' + id + '/sync'`.
29. Reuse existing shared UI in `src/lib/components/ui/` (button, spinner, field-error patterns) before hand-rolling; match existing detail-page styling.
30. Create **`e2e/ncal3-lead-sync.e2e.ts`** — Playwright stub for AC11; self-skips until the shared auth fixture lands (mirror `e2e/caldav-write.e2e.ts` / `e2e/calendar.e2e.ts` `test.skip(gated, ...)` guard). AC10 (meeting button) covered by the existing `e2e/caldav-write.e2e.ts` self-skipping test per SPEC — add the meeting-sync scenario there or note as covered.
31. Manual Agent-Probe: run the dev build, load a meeting detail + a lead detail page, confirm the button renders and (with real n8n available) a click round-trips. Record in the phase report (same class as NCAL-2 AC10 live round-trip).

**Phase 4 test gate:** `bun run check` + `bun run lint` + `bun run test:unit:ci` (no regressions) + `bun run test:e2e` (NCAL-3 spec self-skips cleanly, does not error).

---

## Test Procedure / Verification Strategy

Run at each phase boundary and as final regression:

| Gate | Command |
|---|---|
| Unit tests | `bun run test:unit:ci` |
| Typecheck | `bun run check` |
| Lint | `bun run lint` |
| e2e (self-skip confirm) | `bun run test:e2e` (NCAL-3 specs self-skip; must not error) |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `schema-ncal3.spec.ts` — 3 columns exist on Drizzle schema objects | Fully-Automated | AC1 (schema shape half) |
| Applied-migration SQL manual inspection + live-DB apply | Agent-Probe (known-gap: no live-DB CI harness) | AC1 (apply-and-query half) |
| `ncal3-meeting-sync.spec.ts` — `buildMeetingPayload` field assertions | Fully-Automated | AC2 |
| `ncal3-lead-sync.spec.ts` — `buildGoLiveDatePayload` exact UTC strings | Fully-Automated | AC3 |
| `ncal3-lead-sync.spec.ts` — `buildEventDatePayload` exact UTC strings | Fully-Automated | AC4 |
| `ncal3-lead-sync.spec.ts` — 6 branch tests (create/update/delete × 2 fields) | Fully-Automated | AC5 |
| `ncal3-meeting-sync.spec.ts` — create throws → route still 200, UID null, no leak | Fully-Automated | AC6 |
| `ncal3-lead-sync.spec.ts` — sync throw → lead PATCH still 200 | Fully-Automated | AC7 |
| `ncal3-meeting-sync.spec.ts` — meeting sync endpoint 401/create/update/502 | Fully-Automated (unit — pattern confirmed via calendar-events-endpoint.spec.ts) | AC8 (unit half) |
| `e2e/caldav-write.e2e.ts` — meeting sync auth-gate e2e | Agent-Probe (known-gap: shared auth fixture) | AC8 (e2e half) |
| `ncal3-lead-sync.spec.ts` — lead sync endpoint 401/both-fire/502 | Fully-Automated (unit — pattern confirmed) | AC9 (unit half) |
| `e2e/ncal3-lead-sync.e2e.ts` — lead sync auth-gate e2e | Agent-Probe (known-gap: shared auth fixture) | AC9 (e2e half) |
| Meeting detail button render + click round-trip | Agent-Probe (known-gap: shared auth fixture) | AC10 |
| Lead detail button render + click round-trip | Agent-Probe (known-gap: shared auth fixture) | AC11 |
| `ncal3-lead-sync.spec.ts` — both dates null → zero writer calls | Fully-Automated | AC12 |

---

## Known Gaps

1. **AC10 / AC11 Playwright e2e self-skip** — all protected-route Playwright tests self-skip until the shared authenticated-session fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Button-render + click round-trip proven by Agent-Probe on the dev build instead. Pre-accepted, same root as NCAL-2 AC7/AC8/AC9. Gates stay CONDITIONAL; no terminal PASS on this residual.
2. **Live-DB CI harness for schema apply (AC1 apply-and-query half)** — no live Postgres in this environment; `bun run db:migrate` apply-and-query is a deploy-time step. Schema SHAPE is Fully-Automated-proven via Drizzle introspection; the applied-column proof is a one-time manual Agent-Probe. Pre-accepted, same class as NCAL-1/NCAL-2.
3. **Drizzle journal-drift prerequisite** — `0014_agreements_fields.sql` stray must be reconciled before `bun run db:generate` (Phase 1 step 1). If unreconciled, do NOT layer idx 33 on top. Backlog ref: `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`. [VALIDATE: confirmed present — this is NOT a residual to defer; it is a mandatory Phase-1 prerequisite. See E5.]
4. **n8n silently drops CATEGORIES** — inherited non-blocking known-gap from NCAL-2 (`process/features/calendar/backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`). NCAL-3 sends no CATEGORIES, so unaffected.
5. **Route-handler unit-test invocation pattern** — RESOLVED in VALIDATE (P3). The repo DOES have an established mock-`RequestEvent` route-unit pattern (`src/tests/calendar-events-endpoint.spec.ts` imports the handler export directly). AC8/AC9 route-level coverage is Fully-Automated, not a fallback-to-module-level residual. No backlog stub needed.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/calendar/active/ncal-3-crm-sync_08-07-26/ncal-3-crm-sync_PLAN_08-07-26.md`
2. **Last completed phase or step:** VALIDATE complete — validate-contract written (inner-PVL phase-1). Awaiting EXECUTE Phase 1.
3. **Validate-contract status:** written (08-07-26) — see `## Validate Contract` below. Gate: CONDITIONAL.
4. **Supporting context files loaded:** SPEC (same task folder), `src/lib/caldav/writer.ts`, `src/lib/server/db/meetings.ts`, meeting/lead API routes, `schema.ts` (crm_leads + crm_meetings), `drizzle/meta/_journal.json` (idx 32 confirmed).
5. **Next step for a fresh agent mid-execution:** Phases are strictly ordered (1→2→3→4); each depends on the prior. Confirm which phase's test gate last passed via `bun run test:unit:ci` + `bun run check`. If mid-Phase-2, verify `calendar-sync.ts` exports match the Public Contracts section. If mid-Phase-3, verify each of the 4 mutation routes uses `void …catch(…)` (fire-and-forget) and the 2 sync endpoints `await` + map `CalDavWebhookError` → 502. Never let auto-sync throw into a save path.

---

## Validate Contract

Status: CONDITIONAL
Date: 08-07-26
date: 2026-07-08
generated-by: inner-pvl: phase-1

Parallel strategy: sequential
Rationale: 4/7 signals (schema/migration + public-API + phase-program + 5+ blast-radius files); dominant signal = schema/migration + public-API high-risk class. EXECUTE runs sequential — phases are strictly ordered (Phase N depends on Phase N-1), so parallelism adds no benefit. VALIDATE fan-out itself ran as resident-context sequential synthesis (full context already loaded; avoided redundant subagent re-loading).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1-shape | 3 nullable UID columns exist on Drizzle schema objects | Fully-Automated | `bun run test:unit:ci` — `src/tests/schema-ncal3.spec.ts` asserts `crmMeetings.nextcloudUid`, `crmLeads.nextcloudGoLiveUid`, `crmLeads.nextcloudEventUid` `.name` map to snake_case | A |
| AC1-apply | migration applies + columns queryable in live DB | Agent-Probe | `bun run db:migrate` + manual applied-SQL inspection (no live Postgres in env) | D |
| AC2 | `buildMeetingPayload` field mapping (title/start/end+1h/location/description CRM-HREF) | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-meeting-sync.spec.ts` field-by-field assertions | B |
| AC3 | `buildGoLiveDatePayload` exact Manila-midnight UTC strings + title | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` exact `T16:00:00Z`/`T15:59:59Z` assertions | B |
| AC4 | `buildEventDatePayload` same shape, "— Event Date" suffix | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` separate block | B |
| AC5 | 3-branch create/update/delete per date field (6 tests) | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` mocked writer, 6 branch tests | B |
| AC6 | meeting create sync failure → route still 200, UID null, no leak | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-meeting-sync.spec.ts` mock createEvent throws | B |
| AC7 | lead sync failure → PATCH still 200 | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` sync-throw case | B |
| AC8-unit | meeting sync endpoint 401/create-200/update-200/502 | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-meeting-sync.spec.ts` route-unit (pattern per `calendar-events-endpoint.spec.ts`) | B |
| AC8-e2e | meeting sync auth-gate end-to-end | Agent-Probe | `e2e/caldav-write.e2e.ts` self-skips pending shared auth fixture | D |
| AC9-unit | lead sync endpoint 401/both-fire/502 | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` route-unit | B |
| AC9-e2e | lead sync auth-gate end-to-end | Agent-Probe | `e2e/ncal3-lead-sync.e2e.ts` self-skips pending shared auth fixture | D |
| AC10 | meeting detail "Sync to Nextcloud" button render + click | Agent-Probe | dev-build visual probe + `e2e/caldav-write.e2e.ts` (self-skip) | D |
| AC11 | lead detail "Sync to Nextcloud" button render + click | Agent-Probe | dev-build visual probe + `e2e/ncal3-lead-sync.e2e.ts` (self-skip) | D |
| AC12 | both dates null → zero writer calls | Fully-Automated | `bun run test:unit:ci` — `src/tests/ncal3-lead-sync.spec.ts` asserts no create/update/delete called | B |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase; D — backlog test-building stub / named residual (keep-active).

C-4 reconciliation: the strategy column carries ONLY the 3 proving strategies (Fully-Automated / Agent-Probe here; no Hybrid rows). Known-Gap is never a strategy — the D-resolution rows (AC1-apply, AC8/AC9-e2e, AC10, AC11) are named residuals, not proofs.

Legacy line form (retained for existing consumers):
- Schema shape (AC1): Fully-automated: `bun run test:unit:ci` (schema-ncal3.spec.ts) | apply-and-query: known-gap: documented (no live-DB CI harness — deploy-time)
- Payload builders (AC2–AC5, AC12): Fully-automated: `bun run test:unit:ci` (ncal3-meeting-sync.spec.ts + ncal3-lead-sync.spec.ts)
- Fire-and-forget save isolation (AC6, AC7): Fully-automated: `bun run test:unit:ci`
- Sync endpoints unit (AC8, AC9): Fully-automated: `bun run test:unit:ci` (route-unit pattern per calendar-events-endpoint.spec.ts)
- Sync endpoints e2e auth-gate (AC8/AC9 e2e half): known-gap: documented (shared Playwright auth fixture)
- Button render/click (AC10, AC11): agent-probe: dev-build visual + self-skipping e2e | known-gap: documented (shared auth fixture)
- Typecheck/lint (all phases): Fully-automated: `bun run check` + `bun run lint`

Failing stubs (Fully-Automated rows only — TDD red-first for execute-agent):

Failing stub (AC1-shape):
test("schema exposes 3 nullable nextcloud UID columns", () => { throw new Error("NOT IMPLEMENTED — TDD stub: crmMeetings.nextcloudUid + crmLeads.nextcloudGoLiveUid + crmLeads.nextcloudEventUid exist and map to snake_case names") })

Failing stub (AC2):
test("buildMeetingPayload maps startAt/end+1h/venue/CRM-HREF description", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildMeetingPayload field mapping") })

Failing stub (AC3):
test("buildGoLiveDatePayload emits Manila-midnight T16:00:00Z start and T15:59:59Z next-day end", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildGoLiveDatePayload exact UTC strings + Ticket Sale Start title") })

Failing stub (AC4):
test("buildEventDatePayload same shape with Event Date suffix", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildEventDatePayload") })

Failing stub (AC5):
test("syncLeadDatesToNextcloud runs create/update/delete branch per date field", () => { throw new Error("NOT IMPLEMENTED — TDD stub: 6 branch tests, 3 per date field") })

Failing stub (AC6):
test("meeting create sync failure leaves route 200, UID null, no leak", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createEvent throws CalDavWebhookError → POST still success") })

Failing stub (AC7):
test("lead sync failure leaves PATCH 200", () => { throw new Error("NOT IMPLEMENTED — TDD stub: sync throw → lead PATCH still 200") })

Failing stub (AC8-unit):
test("meeting sync endpoint 401/create-200/update-200/502", () => { throw new Error("NOT IMPLEMENTED — TDD stub: POST /api/meetings/[id]/sync route-unit branches") })

Failing stub (AC9-unit):
test("lead sync endpoint 401/both-fire/502", () => { throw new Error("NOT IMPLEMENTED — TDD stub: POST /api/leads/[id]/sync route-unit branches") })

Failing stub (AC12):
test("both dates null triggers zero writer calls", () => { throw new Error("NOT IMPLEMENTED — TDD stub: no create/update/delete when both dates null and no prev UID") })

Dimension findings:
- Infra fit: PASS — test runner (`bun run test:unit:ci`, not `bun test`), `$env/dynamic/private` mock, server-only `src/lib/server/n8n/` placement, no new env vars (all 3 n8n vars + constants.ts accessors confirmed present); no container/port surfaces.
- Test coverage: CONCERN → resolved — AC2–AC12 Fully-Automated at unit + route-unit level (route pattern confirmed to exist); only AC1-apply + AC8/AC9-e2e + AC10/AC11 rest on pre-accepted known-gaps (live-DB harness + shared auth fixture).
- Breaking changes: CONCERN (LOW) — schema is purely additive (3 nullable columns); `getMeeting()` extension is additive (existing callers read only `.organizerId`); new endpoints are net-new routes. Cross-plan `crm_leads` overlap verified NON-colliding (P2). No breaking change.
- Security surface: CONCERN → mitigated by E2 — secret boundary intact (`CalDavWebhookError` client-safe, routes map to generic 502); both sync endpoints session-gated; lead endpoint respects `getLead` visibility trust boundary. Gap: meeting sync endpoint must add organizer-ownership parity with PATCH/DELETE (E2) — captured as execute-agent instruction.
- Phase 1 (Schema migration): CONCERN — schema anchors valid; Drizzle journal drift REAL and present (0014 duplicate prefix, 34 sql vs 33 journal entries) — mandatory prerequisite before `db:generate` (E5).
- Phase 2 (calendar-sync.ts module): CONCERN — `embedCrmHref`/`CalendarEventPayload`/writer exports confirmed; `manilaAllDayRange` arithmetic sound. Gaps: title fallback undecided (E4); `dbRowToLead` mapping extension under-specified (E3).
- Phase 3 (Route wiring + sync endpoints): CONCERN — all 4 mutation routes + fetch points confirmed; sync endpoint must use `getMeetingDetail` not `getMeeting` (E1) and add ownership check (E2); route-unit test pattern confirmed to exist (P3, resolves former Known Gap #5).
- Phase 4 (UI buttons): PASS — both detail pages exist; Svelte 5 `$state` pattern + shared-UI reuse; e2e self-skip stub mirrors established `caldav-write.e2e.ts`/`calendar.e2e.ts` pattern; AC10/AC11 pre-accepted known-gap.

Execute-agent instructions:
- E1: `POST /api/meetings/[id]/sync` MUST fetch the meeting via `getMeetingDetail(params.id)` (returns full `Meeting` with `leadId/startAt/venue`), NOT `getMeeting` (returns only `{id, organizerId, nextcloudUid}`). Building the sync payload from `getMeeting` alone will fail — the fields are absent.
- E2: `POST /api/meetings/[id]/sync` MUST enforce organizer-ownership parity with the PATCH/DELETE routes: `if (!isManagerRole(locals.user.role) && meeting.organizerId !== locals.user.id) throw error(403)`. The plan's step 24 originally showed only session-gate + 404 — a weaker gate than the mutation routes it backfills. Do not ship the endpoint without this check.
- E3: extend `dbRowToLead` (and the `Lead` type in `src/lib/types/index.ts`) to map `nextcloudGoLiveUid`/`nextcloudEventUid`, not only the `getLead` select. `getLead` already selects the full `crmLeads` row, so the columns are present in the row after Phase 1 — the missing work is the mapper surfacing them into the returned `Lead`, so `syncLeadDatesToNextcloud` receives them.
- E4: `buildMeetingPayload` has no `title` column source — pick the exact fallback title string, document it in the phase report, and assert that exact string in the AC2 test.
- E5: reconcile Drizzle journal drift BEFORE `bun run db:generate` (Phase 1 step 1). Drift is confirmed present (`0014_agreements_fields.sql` + `0014_nasty_master_mold.sql` duplicate prefix; journal has 33 entries, disk has 34 `.sql` files). Reconcile per `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`; do NOT layer idx 33 on unreconciled drift.
- E6 (high-risk evidence): this plan touches schema/migration + public-API high-risk classes. Per `vc-risk-evidence-pack`, produce the manual-first evidence pack (`risk-gate.json` + `verification.json` + `review-decision.json` at minimum) inside the task folder's `harness/` dir before marking Phase 1 + Phase 3 finalized.

Open gaps:
- AC1 apply-and-query: known-gap: documented — no live Postgres in env; deploy-time `db:migrate` apply. Same class as NCAL-1/NCAL-2. Ref: `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (test-infra), live-DB harness backlog.
- AC8/AC9 e2e auth-gate: known-gap: documented — shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- AC10/AC11 button render/click e2e: known-gap: documented — same shared auth fixture. These two behaviors rest on Known-Gap alone → gates stay CONDITIONAL (vacuous-green ban); Agent-Probe on dev build is the interim proof.
- n8n silently drops CATEGORIES: known-gap: documented — non-blocking, NCAL-3 sends no CATEGORIES (`process/features/calendar/backlog/ncal-2-categories-n8n_NOTE_08-07-26.md`).

What this coverage does NOT prove:
- `bun run test:unit:ci` (schema-ncal3.spec.ts) proves the 3 columns exist on the Drizzle schema OBJECT — it does NOT prove the migration applied to a real Postgres or that the columns are queryable in a live DB (AC1-apply known-gap).
- `bun run test:unit:ci` (ncal3-*.spec.ts payload/branch tests) prove the pure builders and mocked-writer branch logic — they do NOT prove the real n8n webhook accepts the payload or that Nextcloud renders the event correctly (that is the AC10/AC11 live Agent-Probe).
- `bun run test:unit:ci` route-unit tests (AC8/AC9-unit) prove the handler's session-gate/branch/error mapping with a mock `RequestEvent` — they do NOT prove the real Better Auth session gate rejects an unauthenticated browser request end-to-end (AC8/AC9-e2e known-gap, shared auth fixture).
- `bun run check` + `bun run lint` prove types + style — they prove NO runtime behavior.
- The Agent-Probe rows (AC10/AC11) prove a human/agent judged the button renders and a click round-trips on the dev build — they do NOT provide a repeatable automated regression guard (blocked on shared auth fixture).

Gate: CONDITIONAL (6 CONCERNs, 0 FAILs; all resolvable as plan-updates P1–P3 + execute-agent instructions E1–E6; AC10/AC11 rest on pre-accepted Known-Gap → those gates stay CONDITIONAL per vacuous-green ban)
Accepted by: session (autonomous, /goal execution — inner-PVL phase-1) — accepted concerns: test-coverage (route-unit pattern confirmed, resolved), breaking-changes-cross-plan-overlap (verified non-colliding), security-meeting-endpoint-ownership (E2 instruction), phase1-journal-drift (E5 prerequisite), phase2-title-fallback (E4) + dbRowToLead-mapping (E3), phase3-getMeetingDetail (E1); pre-accepted known-gaps: AC1-apply (live-DB harness), AC8/AC9-e2e + AC10/AC11 (shared auth fixture), n8n-CATEGORIES

---

## Autonomous Goal Block

```
SESSION GOAL: NCAL-3 — wire CRM meeting + lead-date mutations to auto-sync (create/update/delete) Nextcloud events via n8n webhooks, with manual backfill sync buttons; sync failures never block saves.
Charter + umbrella plan: N/A — single plan (calendar feature, GitHub #269)
Autonomy: /goal autonomous execution — inner-PVL phase-1. Self-decide at V5/EXECUTE gates; CONDITIONAL → apply E1–E6 fixes and proceed; BLOCKED → backlog note + continue. Subagent delegation stays mandatory (no inline execution). Cite feedback_autonomous_phase_execution.md.
Hard stop conditions / safety constraints:
- Never let auto-sync throw into a save path — auto-sync is fire-and-forget `void fn().catch(console.error)`; a Nextcloud/n8n outage must never 5xx a meeting or lead save.
- N8N_WEBHOOK_SECRET must never reach the client, a response body, or a logged error surfaced to the client (routes map CalDavWebhookError → generic 502).
- Reconcile Drizzle journal drift (0014 duplicate prefix) BEFORE db:generate idx 33 — do not layer a new migration on unreconciled drift.
- Meeting sync endpoint must enforce organizer-ownership parity with PATCH/DELETE (E2) — do not ship a weaker auth gate.
- Schema changes stay additive (3 nullable columns, no default) — no destructive DDL.
Next phase: EXECUTE Phase 1 (schema migration) — strictly ordered 1→2→3→4; Phase N depends on Phase N-1.
Validate contract: inline in plan (## Validate Contract) — Gate: CONDITIONAL, generated-by: inner-pvl: phase-1.
Execute start: Fully-auto gates: `bun run test:unit:ci` + `bun run check` + `bun run lint` | e2e self-skip: `bun run test:e2e` | probe: dev-build button render/click (AC10/AC11) + live n8n round-trip | high-risk pack: yes (schema/migration + public-API — risk-gate.json/verification.json/review-decision.json in task-folder harness/)
```
