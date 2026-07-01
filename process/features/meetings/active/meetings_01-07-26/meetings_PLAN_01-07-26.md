---
name: plan:meetings
description: "Meetings feature — crm_meetings + crm_meeting_attendees tables, 5 CRUD API endpoints, lead-detail Meetings tab, top-level /meetings page"
date: 01-07-26
feature: meetings
---

# Meetings — Implementation Plan (COMPLEX)

**Date**: 01-07-26
**Status**: VALIDATED (CONDITIONAL — re-validation cycle 1; G1 closed; EXECUTE-ready)
**Complexity**: COMPLEX
**Feature**: meetings
**Context**: grounded in `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`

**TL;DR:** Add a Meetings feature to the CRM: two new soft-deletable Drizzle tables (`crm_meetings` + `crm_meeting_attendees` join), five JSON CRUD API endpoints, a new Meetings tab on the lead detail page (requires building the page's first tab scaffold), and a new top-level `/meetings` cross-lead page. Follows the repo's real `fetch → +server.ts → Zod safeParse → Drizzle → optimistic UI + invalidateAll() + toast` pattern (NOT Superforms). Calendar integration is explicitly out of scope (backlog stub written). Four ordered phases; schema/migration is the one high-risk touchpoint.

## Complexity Classification

**COMPLEX.** Calibrated against `process/context/planning/all-planning.md`:
- 2 new DB tables + a generated migration (schema surface — high-risk class)
- 5 new API endpoints across 3 route files
- 2 new/edited UI surfaces, one of which needs brand-new tab scaffolding (no tabs exist on the lead detail page today)
- New server query module (`meetings.ts`) mirroring `leads.ts`
- Cross-cutting Zod + types changes

This is beyond a one-session SIMPLE plan but is a single cohesive feature (single-session-to-multi-session), NOT a phase program — there are no independent validation gates between milestones and no multi-package/multi-runtime split. One plan artifact with 4 ordered phases.

## Overview / Goals

Give reps and managers a way to log, view, edit, and delete meetings with leads, both scoped to a single lead (lead detail tab) and team-wide (top-level page).

Goals:
1. Persist meetings in real Postgres via Drizzle (no mock data).
2. Full CRUD from both surfaces.
3. Meeting URL is manual free-text, accepts any URL, opens in a new tab.
4. Attendees are `crm_users` (team members); organizer is a distinct FK, not just an attendee flag.

## Scope

**In scope:** schema + migration + Zod + types, 5 API endpoints, lead-detail Meetings tab (incl. tab scaffold), top-level `/meetings` page.

**Explicitly OUT OF SCOPE (do NOT build in this plan):**
- **Calendar view / calendar integration.** No calendar UI, no `/calendar` route, no ECharts calendar. The user's third acceptance criterion ("Meetings appear in the calendar view") is descoped to a backlog stub: `process/features/meetings/backlog/calendar-integration_NOTE_01-07-26.md`. A future calendar feature must be separately spec'd. Do not treat this as a Known-Gap inside this plan's own scope — it is a scoped-out future feature.
- **Meeting end time / duration** — only a single `startAt` timestamptz is stored (not requested).
- **Auto-integration with Google Meet / Zoom / Teams** — `meetingUrl` is manual paste only.
- **Building DB integration-test harness** — pre-existing gap; DB-write behaviour is Hybrid-tier (manual) in this plan.

## Acceptance Criteria

Testable, from the feature request:

1. A meeting can be **created** from the lead-detail Meetings tab AND from the top-level `/meetings` page (persisted to `crm_meetings` in Postgres).
2. A meeting can be **edited** from both surfaces (`PATCH /api/meetings/[id]`), including changing attendees.
3. A meeting can be **deleted** from both surfaces — soft-delete only (`deletedAt` set; row not hard-deleted; hidden by `WHERE deleted_at IS NULL`).
4. Meeting record captures: date/time (`startAt`), attendees (`crm_meeting_attendees`), organizer (`organizerId`), outcome/notes, and a manual meeting URL.
5. The meeting URL field accepts any URL and its link opens in a new tab (`target="_blank" rel="noopener noreferrer"`).
6. The lead-detail page shows only that lead's meetings; the top-level page shows all meetings across all leads.
7. No duplicate attendee rows for a given `(meetingId, userId)`.
8. Calendar acceptance criterion is **descoped** (backlog stub) — NOT required for this plan to be "done."

## Phase Completion Rules

- A phase is `CODE DONE` when its checklist items are implemented and `bun run check` passes for the touched files.
- A phase is only `VERIFIED` after its Verification-Evidence gates (Fully-Automated + applicable Hybrid/Agent-Probe) pass — code-only completion is `CODE DONE`, never `VERIFIED`.
- Phase 1 (schema/migration, high-risk) additionally requires the generated migration SQL to be inspected and confirmed additive-only before `db:push`/`db:migrate` is run.
- Do not advance to a dependent phase until the prerequisite phase is at least `CODE DONE` with `bun run check` green.

## Touchpoints

| File | Action | Notes |
|---|---|---|
| `src/lib/server/db/schema.ts` | edit | Add `crmMeetings` + `crmMeetingAttendees` tables + `$inferSelect` type exports |
| `src/lib/server/db/meetings.ts` | create | Query/mutation module mirroring `leads.ts` (pure mappers + query fns) |
| `src/lib/zod/schemas.ts` | edit | Add `meetingFormSchema` + `meetingUpdateSchema` (mirror `activityFormSchema` style) |
| `src/lib/types/index.ts` | edit | Add `Meeting` + `MeetingAttendee` interfaces (mirror `Activity`) |
| `src/routes/api/meetings/+server.ts` | create | `GET` (cross-lead list) + `POST` (create) |
| `src/routes/api/meetings/[id]/+server.ts` | create | `PATCH` (edit) + `DELETE` (soft-delete) |
| `src/routes/api/leads/[id]/meetings/+server.ts` | create | `GET` (meetings for one lead) |
| `src/routes/leads/[id]/+page.server.ts` | edit | Load meetings for the lead |
| `src/routes/leads/[id]/+page.svelte` | edit | Add tab scaffold + Meetings tab UI |
| `src/routes/meetings/+page.server.ts` | create | Top-level cross-lead list loader |
| `src/routes/meetings/+page.svelte` | create | Top-level Meetings page UI |
| `drizzle/<generated>.sql` | generate | `bun run db:generate` output — do NOT hand-edit |
| `process/features/meetings/backlog/calendar-integration_NOTE_01-07-26.md` | create | Backlog stub for descoped calendar feature |

## Public Contracts

New HTTP API surface (all session-authed; JSON body; Zod-validated):

| Method + Path | Purpose | Auth | Body / Response |
|---|---|---|---|
| `GET /api/leads/[id]/meetings` | Meetings for one lead | session; 401 if none | Response: `Meeting[]` (with attendees, single joined query) |
| `GET /api/meetings` | Cross-lead team-wide list | session; 401 if none | Response: `Meeting[]` (with attendees + lead name, single joined query) |
| `POST /api/meetings` | Create meeting | session; 401 if none | Body: `meetingFormSchema`; Response: created `Meeting` |
| `PATCH /api/meetings/[id]` | Edit meeting | session; 401; **403 unless manager-or-organizer**; 404 if not found/deleted | Body: `meetingUpdateSchema`; Response: updated `Meeting` |
| `DELETE /api/meetings/[id]` | Soft-delete (set `deletedAt`) | session; 401; **403 unless manager-or-organizer**; 404 | Response: `{ ok: true }` |

New DB contract:
- `crm_meetings`: `id` uuid PK, `leadId` FK→`crm_leads.id` `onDelete: cascade` NOT NULL, `organizerId` FK→`crm_users.id` `onDelete: set null` nullable, `startAt` timestamptz NOT NULL, `meetingUrl` text nullable, `notes` text nullable, `outcome` text nullable, `deletedAt` timestamptz nullable, `createdAt`/`updatedAt` timestamptz NOT NULL defaultNow. Index on `leadId`; partial index on `deletedAt IS NULL` optional for query perf.
- `crm_meeting_attendees`: `id` uuid PK, `meetingId` FK→`crm_meetings.id` `onDelete: cascade` NOT NULL, `userId` FK→`crm_users.id` `onDelete: set null` nullable, `createdAt` timestamptz NOT NULL defaultNow. **`uniqueIndex` on `(meetingId, userId)`** to prevent duplicate attendee rows.

**Authorization (resolves V7 Gap G1 — mutation authz).** Decision: **mirror the `touch`/`owner` endpoint precedent** (Option 1). Rationale: the plan's INNOVATE decision makes `organizerId` a first-class FK — the meeting-level equivalent of a lead's `ownerId` — so meeting mutations gate on organizer-or-manager exactly like `touch` gates on lead-owner-or-manager. Rejected Option 2 (team-open mutation) because it would diverge from the sole existing authorization precedent in this codebase without a stronger access-model reason; team-wide *visibility* (open reads) does not imply team-wide *edit/delete* rights.

| Route | Authorization rule |
|---|---|
| `GET /api/leads/[id]/meetings`, `GET /api/meetings` | Authenticated only (401 guard). Reads stay open to any team member — matches existing open lead-read patterns and the team-wide `/meetings` visibility goal. |
| `POST /api/meetings` | Authenticated only (401 guard). Any authenticated user may create a meeting; if `organizerId` is omitted it defaults to the creator (`locals.user.id`). No 403 — no meeting exists yet to own. |
| `PATCH /api/meetings/[id]` | 401 + **403 unless manager-or-organizer**: `if (locals.user.role !== 'manager' && meeting.organizerId !== locals.user.id) throw error(403, 'Forbidden');` (mirrors `touch/+server.ts` line 11 shape, with `meeting.organizerId` in place of `lead.ownerId`). |
| `DELETE /api/meetings/[id]` | 401 + **403 unless manager-or-organizer**: same guard as `PATCH`. |

Guard requires the meeting's `organizerId` before the write, so `PATCH`/`DELETE` handlers must fetch it first (see Phase 2 `getMeeting`).

## Blast Radius

- **Files:** 13 (7 create, 5 edit, 1 generated).
- **Packages/surfaces:** single SvelteKit app — DB layer, Zod, types, API routes, 2 route pages.
- **Risk class — HIGH-RISK on schema/migration only:** `src/lib/server/db/schema.ts` edit + generated Drizzle migration is the sole high-risk touchpoint (schema/data-migration surface). All FKs on new tables reference existing tables; no existing table columns are altered, so blast risk to existing data is low, but the migration must be reviewed before `db:push`/`db:migrate`. Everything else is additive (new files) with no change to existing behaviour.
- **No `crm_lead_history` writes** — meeting CRUD does NOT log to lead history (matches activities precedent; INNOVATE decision #4).

## Implementation Checklist

### Phase 1 — Schema + Migration + Zod + Types (no dependencies) — HIGH-RISK

1. In `src/lib/server/db/schema.ts`, add `crmMeetings` pgTable per the DB contract above (`id`, `leadId` FK cascade NOT NULL, `organizerId` FK set-null nullable, `startAt` timestamptz NOT NULL, `meetingUrl`/`notes`/`outcome` text nullable, `deletedAt` timestamptz nullable, `createdAt`/`updatedAt`). Add `index('crm_meetings_lead_idx').on(t.leadId)`.
2. In the same file, add `crmMeetingAttendees` pgTable (`id`, `meetingId` FK cascade NOT NULL, `userId` FK set-null nullable, `createdAt`) with `uniqueIndex('crm_meeting_attendees_meeting_user_uq').on(t.meetingId, t.userId)` — the vc-predict duplicate-attendee guard.
3. Export `export type CrmMeeting = typeof crmMeetings.$inferSelect;` and `export type CrmMeetingAttendee = typeof crmMeetingAttendees.$inferSelect;`.
4. Run `bun run db:generate` to produce the migration SQL. Inspect the generated file — confirm it only CREATEs the two new tables + the unique index and does not touch existing tables. Do NOT hand-edit.
5. In `src/lib/zod/schemas.ts`, add `meetingFormSchema` (mirror `activityFormSchema`): `leadId: z.string().uuid()`, `startAt: z.string()` (ISO), `organizerId: z.string().uuid().optional()`, `meetingUrl: z.string().url().optional().or(z.literal(''))`, `notes: z.string().optional()`, `outcome: z.string().optional()`, `attendeeIds: z.array(z.string().uuid()).default([])`. Export `export type MeetingForm = z.infer<typeof meetingFormSchema>;`.
6. Add `meetingUpdateSchema` — same fields as `meetingFormSchema` but all optional (partial edit), no `leadId` (lead is immutable after create). Export `MeetingUpdate` type.
7. In `src/lib/types/index.ts`, add `Meeting` interface (id, leadId, organizerId, organizerName, startAt ISO string, meetingUrl, notes, outcome, attendees: `MeetingAttendee[]`) and `MeetingAttendee` interface (userId, name). Mirror the `Activity` interface shape.

### Phase 2 — Server query module + API routes (depends on Phase 1)

8. Create `src/lib/server/db/meetings.ts` mirroring `leads.ts` structure:
   - Pure exported mapper `dbRowToMeeting(row, attendees, organizerName?)` (exported for unit tests).
   - `listMeetingsForLead(leadId)` — meetings WHERE `leadId = ? AND deleted_at IS NULL`, ordered `startAt desc`, **attendees fetched in a single joined/relational query (NOT N+1 per meeting)** — vc-predict action item.
   - `listAllMeetings()` — cross-lead, WHERE `deleted_at IS NULL`, joined with lead name + attendees in **one query, NOT N+1** — vc-predict action item.
   - `createMeeting(input)` — **transaction**: insert `crm_meetings` row, then bulk-insert `crm_meeting_attendees` rows (dedup by unique index; use `onConflictDoNothing`). Return `dbRowToMeeting`.
   - `updateMeeting(id, patch)` — transaction if attendees change: update meeting row, reconcile attendee join rows (delete removed, insert added with `onConflictDoNothing`). Filter `deleted_at IS NULL`; return null if not found.
   - `softDeleteMeeting(id)` — set `deletedAt = now()` WHERE `id = ? AND deleted_at IS NULL`; return boolean.
   - `getMeeting(id)` — fetch a single non-deleted meeting (at minimum `id` + `organizerId`) for the mutation authorization guard; return null if not found/deleted. Used by `PATCH`/`DELETE` before the write.
9. Create `src/routes/api/leads/[id]/meetings/+server.ts` — `GET`: `if (!locals.user) throw error(401)`; return `json(await listMeetingsForLead(params.id))`.
10. Create `src/routes/api/meetings/+server.ts`:
    - `GET`: 401 guard; `return json(await listAllMeetings())`.
    - `POST`: 401 guard (authenticated-only — any user may create; no 403). Parse JSON (400 on bad JSON); `meetingFormSchema.safeParse` (400 on fail); if `organizerId` is omitted, default it to `locals.user.id`; call `createMeeting`; return created meeting. Mirror `touch/+server.ts` error handling exactly.
11. Create `src/routes/api/meetings/[id]/+server.ts` (both mutations gate on manager-or-organizer per Public Contracts §Authorization):
    - `PATCH`: 401 guard; `const meeting = await getMeeting(params.id); if (!meeting) throw error(404, 'Meeting not found');` then authz guard `if (locals.user.role !== 'manager' && meeting.organizerId !== locals.user.id) throw error(403, 'Forbidden');` (mirrors `touch/+server.ts` lines 11–13, `meeting.organizerId` for `lead.ownerId`); parse + `meetingUpdateSchema.safeParse`; `updateMeeting`; 404 if null; return updated.
    - `DELETE`: 401 guard; `const meeting = await getMeeting(params.id); if (!meeting) throw error(404, 'Meeting not found');` then the SAME manager-or-organizer 403 guard as `PATCH`; `softDeleteMeeting`; return `json({ ok: true })`.

### Phase 3 — Lead detail Meetings tab (depends on Phase 2)

12. In `src/routes/leads/[id]/+page.server.ts`, load meetings: add `listMeetingsForLead(lead.id)` to the load (alongside existing `listActivities`), include in the returned object. Keep existing `{ lead, activities, me, users }` and add `meetings`.
13. In `src/routes/leads/[id]/+page.svelte`, add a **tab container scaffold** (this page currently has NO tabs — build the minimal tab UI: `$state` selected-tab rune, tab buttons, conditional panels). Tabs: an "Overview" tab wrapping the existing left-column content, and a "Meetings" tab. Keep the existing two-column layout intact under the Overview tab (do not delete existing ActivityTimeline / LogTouchForm).
14. Build the Meetings tab body: list of the lead's meetings (date/time, organizer, attendees, outcome/notes, meeting URL as `<a target="_blank" rel="noopener noreferrer">` — reuse the existing external-link precedent on this page), plus create/edit/delete controls.
15. Wire CRUD via the repo pattern: client `fetch()` to the API endpoints → on success `patchRecord`-style optimistic update + `invalidateAll()` + toast. Attendee/organizer pickers source from the already-loaded `users` prop. Mirror `LogTouchForm` interaction.

### Phase 4 — Top-level /meetings page (depends on Phase 2; parallelizable with Phase 3)

16. Create `src/routes/meetings/+page.server.ts` — mirror `pipeline/+page.server.ts`: `if (!locals.user) throw error(401)`; parallel Drizzle queries (`listAllMeetings()`, `listUsers()`); typed return.
17. Create `src/routes/meetings/+page.svelte` — cross-lead meetings list (show lead name per row, date/time, organizer, attendees, outcome, meeting URL opens in new tab). Full CRUD reusing the same fetch → API → optimistic + invalidateAll() + toast pattern and the same create/edit form component as Phase 3 where practical.

### Post-implementation

18. Run the full verification gate suite (see Verification Evidence).
19. Confirm the backlog stub `calendar-integration_NOTE_01-07-26.md` exists.

## Dependencies & Sequencing

- Phase 1 → 2 → (3 ∥ 4). Phases 3 and 4 both depend only on Phase 2 and may run in parallel (they touch disjoint route files; the shared create/edit form component, if extracted, is the only coordination point — build it in Phase 3 and reuse in Phase 4).
- External: needs live Postgres (`DATABASE_URL`) for `db:push`/`db:migrate` and all Hybrid gates. No new env vars, no new dependencies.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration alters/breaks existing tables | Phase 1 step 4: inspect generated SQL before applying; confirm additive-only (CREATE TABLE + CREATE INDEX only). |
| N+1 attendee queries degrade list perf | vc-predict item folded into steps 8 — both list fns use a single joined/relational query; call out in code review. |
| Duplicate attendee rows | `uniqueIndex(meetingId, userId)` (step 2) + `onConflictDoNothing` on insert (step 8). |
| Partial write (meeting created, attendees fail) | `createMeeting`/`updateMeeting` wrap meeting+attendee writes in a Drizzle transaction (step 8). |
| Tab scaffold regresses existing lead detail layout | Phase 3 step 13: wrap existing content unchanged under an Overview tab; do not delete existing components. |
| Unauthorized edit/delete of another rep's meeting | Public Contracts §Authorization: `PATCH`/`DELETE` gate on manager-or-organizer (403), guard fetched via `getMeeting` before the write (steps 8/11). Mirrors `touch/+server.ts`. |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | Type-safety across new schema/types/routes; compile-time contract integrity |
| Vitest: `meetingFormSchema`/`meetingUpdateSchema` accept valid + reject invalid input (new cases in `src/tests/schemas.spec.ts`) | Fully-Automated | "Meeting URL accepts any URL"; required-field validation on create/edit |
| Vitest: `dbRowToMeeting` maps a DB row + attendees → `Meeting` correctly (new cases in a `src/tests/meetings.spec.ts`) | Fully-Automated | Correct meeting shape returned to both surfaces |
| Manual: create/edit/soft-delete a meeting against dev Postgres; verify `deletedAt` set, row not hard-deleted, `WHERE deleted_at IS NULL` hides it | Hybrid (manual, dev Postgres) | "Meetings can be created, edited, and deleted from both surfaces" |
| Manual: add duplicate attendee → unique index blocks 2nd row; delete lead → meetings cascade-delete; delete user → organizer/attendee set null | Hybrid (manual, dev Postgres) | Attendee join integrity; FK cascade/set-null behaviour (INNOVATE #1/#2) |
| Manual: `GET /api/meetings` and `GET /api/leads/[id]/meetings` issue a single joined query (inspect logs/query count), not N+1 | Hybrid (manual, dev Postgres) | vc-predict perf action item |
| Manual: as a non-organizer rep, `PATCH`/`DELETE` another user's meeting → 403; as organizer or manager → 200 | Hybrid (manual, dev Postgres) | Mutation authorization (G1) — organizer-or-manager 403 gate |
| Agent-probe: render lead-detail Meetings tab + top-level `/meetings` page; confirm tab switching works, meetings list renders, meeting URL link has `target="_blank" rel="noopener noreferrer"` and opens in new tab | Agent-Probe | "Meeting URL opens in a new tab"; both-surface visibility |
| Calendar acceptance criterion ("Meetings appear in the calendar view") | Descoped — backlog stub | Explicitly out of scope; see `calendar-integration_NOTE_01-07-26.md`. NOT a Known-Gap within this plan's scope. |

REQ-TEST-LINK (SPEC criterion → proving gate):
- "Create/edit/delete from both surfaces" — proven by: create/edit/soft-delete Hybrid gate + tab/page Agent-Probe — strategy: Hybrid + Agent-Probe.
- "Meeting URL accepts any URL and opens in new tab" — proven by: Zod schema Vitest case + external-link Agent-Probe — strategy: Fully-Automated + Agent-Probe.
- "Only organizer/manager may edit/delete" — proven by: 403 authorization Hybrid gate (manual dev Postgres) — strategy: Hybrid.
- "Meetings appear in calendar view" — descoped to backlog (not proven this plan; scoped-out future feature).

## Test Infra Improvement Notes

- No DB integration-test harness exists (pre-existing gap noted in `process/context/tests/all-tests.md` §Known Gaps). All meeting DB-write behaviour (insert/edit/soft-delete/cascade/attendee-join/N+1/403-authz) is Hybrid-tier manual against dev Postgres in this plan. Building a real DB test harness is explicitly NOT scoped here — recommend a future infra task so these Hybrid gates can become Fully-Automated.
- No e2e Playwright specs exist yet; the Meetings-tab and `/meetings` render checks are Agent-Probe rather than automated e2e. A future Playwright spec could automate them.

## Note for UPDATE PROCESS

- **Superforms doc/code drift:** `CLAUDE.md` / context docs claim "Superforms + Zod for all forms," but zero route files use `superForm`/`superValidate` — the real pattern is `fetch → +server.ts → Zod safeParse → Drizzle → optimistic + invalidateAll() + toast` (confirmed by RESEARCH grep). This plan follows the REAL pattern. Flag for a `vc-audit-context` follow-up to reconcile the docs; do NOT fix the drift in this feature's EXECUTE.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/meetings/active/meetings_01-07-26/meetings_PLAN_01-07-26.md`
2. **Last completed step:** VALIDATE re-validation cycle 1 complete (G1 closed). Plan written; no source code written.
3. **Validate-contract status:** Written — Gate CONDITIONAL (terminal; re-validation cycle 1; ≥1 recorded fix cycle). EXECUTE may proceed.
4. **Supporting context loaded:** `schema.ts`, `leads.ts` (head + `dbRowToLead`), `zod/schemas.ts` (`activityFormSchema`), `types/index.ts`, `api/leads/[id]/touch/+server.ts`, lead-detail `+page.server.ts`, `all-tests.md`, `all-planning.md`.
5. **Next step for a fresh agent:** EXECUTE Phase 1 first (schema is the dependency root and the sole high-risk touchpoint — get the migration reviewed before applying). Carry execute-instructions E1–E3.

## Validate Contract

Status: CONDITIONAL
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl
supersedes: 01-07-26 (outer-pvl) — re-validation cycle 1 has current evidence (G1 closed); prior first-pass contract was CONDITIONAL with G1 open
re-validation: cycle 1 (see meetings-pvl-iteration-001_REPORT_01-07-26.md). Prior net gate CONDITIONAL (0 FAILs / 5 CONCERNs); this cycle closed G1 (the sole supplement-worthy gap). Remaining concerns are pre-accepted execute-instructions + named known-gap residuals — no supplement-worthy defect remains.

Parallel strategy: sequential (VALIDATE fan-out ran inline — self-contained single-app plan, full context available)
Rationale: 3/7 signals (S2 schema/API surface, S6 high-risk schema/migration, S7 13-file blast radius). MEDIUM band; single SvelteKit app, no cross-agent coordination needed. Unchanged from cycle 0.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1..3 (both surfaces) | Type-safety across new schema/types/routes/Zod | Fully-Automated | `bun run check` exits 0 | A — proven by gate |
| AC-5 (URL accepts any URL) | `meetingFormSchema`/`meetingUpdateSchema` accept valid + reject invalid | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` (new cases) | B — test added by Phase 1 |
| AC-4/6 (meeting shape) | `dbRowToMeeting` maps row+attendees → `Meeting` | Fully-Automated | `bun run test:unit -- src/tests/meetings.spec.ts` (new file) | B — test added by Phase 2 |
| AC-1/2/3 (create/edit/soft-delete persist) | Insert / edit / soft-delete against real Postgres; `deletedAt` set, row not hard-deleted, hidden by `WHERE deleted_at IS NULL` | Hybrid | Manual against dev Postgres (`DATABASE_URL`); inspect rows | D — backlog test-building stub (no DB integration harness) |
| AC-7 (no dup attendees) + FK behavior | Unique index blocks 2nd `(meetingId,userId)`; delete lead → meetings cascade; delete user → organizer/attendee set null | Hybrid | Manual against dev Postgres | D — backlog test-building stub |
| authz (G1) — 403 gate | `PATCH`/`DELETE` deny non-organizer rep (403); allow organizer or manager | Hybrid | Manual against dev Postgres — as non-organizer rep expect 403; as organizer/manager expect 200 | D — backlog test-building stub (no DB integration harness) |
| perf (N+1 avoidance) | Both list routes issue ONE joined/grouped query, not N+1 | Hybrid | Manual: inspect query count/logs on `GET /api/meetings` + `GET /api/leads/[id]/meetings` | D — backlog test-building stub |
| AC-5/6 (tab + new-tab link) | Tab switching works; lists render; meeting URL link has `target="_blank" rel="noopener noreferrer"` and opens new tab | Agent-Probe | Render lead-detail Meetings tab + `/meetings`; agent judges | C — deferred (no Playwright specs yet) |

gap-resolution legend: A — proven now; B — gate added by this plan; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; keep-active).

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — DB-write + authz behavior is proven via Hybrid (manual), a named proving strategy, so this contract is NOT vacuously green.

Legacy line form (retained for existing consumers):
- Type/contract integrity: Fully-automated: `bun run check` exits 0
- Zod schema validation: Fully-automated: `bun run test:unit -- src/tests/schemas.spec.ts`
- Mapper correctness: Fully-automated: `bun run test:unit -- src/tests/meetings.spec.ts`
- DB write/cascade/attendee-join/N+1/403-authz: Hybrid: manual against dev Postgres (precondition: `DATABASE_URL` set, `db:migrate` applied)
- Tab + new-tab-link render: Agent-probe: render both surfaces, judge tab switching + link attributes

Failing stub (Fully-Automated rows only):
```
test("should accept a valid meetingForm and reject missing startAt/bad uuid", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: meetingFormSchema/meetingUpdateSchema accept valid + reject invalid input")
})
test("should map a db meeting row + attendees to a Meeting", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: dbRowToMeeting maps row+attendees -> Meeting")
})
```

Dimension findings:
- Infra fit: PASS — Single SvelteKit app; all 9 edit-target files exist; 6 new-file paths collision-free; FK targets `crm_users`/`crm_leads` exist; test runners (`bun run check` / `test:unit` / Playwright) match all-tests.md. No container/port/worker surface.
- Test coverage: CONCERN — Fully-Automated tier correctly covers types + Zod + mapper (no DB needed). All DB-write behavior (incl. the new 403-authz gate) is Hybrid (manual) because no DB integration harness exists (pre-existing repo-wide gap, confirmed in all-tests.md §Known Gaps). Named residual with Hybrid proving strategy + backlog stub — not a plan defect; out of scope to fix here. N+1-avoidance wording carried as execute-instruction E1.
- Breaking changes: CONCERN — All new tables/files are additive; no existing API contract or column altered. Sole regression risk is the lead-detail `+page.svelte` tab refactor wrapping existing Overview content (mitigated by plan step 13; carried as execute-instruction E2). Not supplement-worthy.
- Security surface: PASS (upgraded from CONCERN at cycle 0) — Schema/migration high-risk class handled correctly (additive-only, FK-to-existing, migration-review gate at Phase 1 step 4). Authentication (401) on all 5 routes. **AUTHORIZATION now specified (G1 closed):** `PATCH`/`DELETE` gate on manager-or-organizer (403) via `getMeeting` fetch-then-guard, verbatim-mirroring `touch/+server.ts:11-13` with valid `crm_user_role` enum values (`rep`/`manager`); `POST` correctly auth-only with organizer defaulting to creator. `meetingUrl: z.string().url()` scheme hardening remains a pre-existing repo-wide observation (G3), not a meetings blocker.
- Section 1 feasibility (Schema/Migration/Zod/Types): PASS — Table defs, FK cascade/set-null, `uniqueIndex(meetingId,userId)`, and `$inferSelect` exports all match verbatim repo precedent (`crm_activities`, `crm_lead_history`). Highest-risk edit: generated migration — mitigated by the additive-only inspection gate.
- Section 2 feasibility (Query module + API routes): PASS (upgraded from CONCERN at cycle 0) — Mechanically feasible (mirrors `leads.ts` + `touch/+server.ts` error handling). G1 (mutation authz) now closed: `getMeeting(id)` helper added (step 8), `PATCH`/`DELETE` fetch-then-403 guards added (step 11) consistent with the FK model and role enum. G2 (concrete N+1-safe pattern) remains an execute-instruction (E1), not a plan defect — step 8 wording already says "single joined/relational query (NOT N+1)".
- Section 3 feasibility (Lead-detail Meetings tab): CONCERN — First-ever tab scaffold. Approach (Svelte 5 `$state` selected-tab rune, Overview-wraps-existing, Meetings tab) is correct and mechanically executable; visual/component styling decisions are normal EXECUTE latitude. Acceptable; execute follows repo UI conventions. Not supplement-worthy.
- Section 4 feasibility (Top-level /meetings page): PASS — Mirrors `pipeline/+page.server.ts` load pattern; reuses Phase 3 form component. Shared authz decision (G1) now resolved.

Open gaps:
- G1 (RESOLVED — cycle 1 supplement): Meeting mutation authorization. Closed by the §Authorization subsection + Phase 2 steps 8/10/11 — `PATCH`/`DELETE` gate on `locals.user.role === 'manager' || meeting.organizerId === locals.user.id`, mirroring `src/routes/api/leads/[id]/touch/+server.ts:11-13`; guard verified consistent with the `crm_user_role` enum (`rep`/`manager`) and the nullable `organizerId` FK. No longer open.
- G2 (execute-instruction, CONCERN — perf): "single joined query" is ambiguous for a parent + many-children shape (a naive join multiplies meeting rows by attendee count). Pin the pattern: fetch meetings, then all attendees via `inArray(attendees.meetingId, meetingIds)` in one query and group in-memory (2 queries, not N+1); OR a join with in-memory de-dupe. Execute-agent must not implement per-meeting attendee lookups. Carried as E1.
- G3 (known repo-wide observation, NOTE — not a blocker): `z.string().url()` accepts non-http(s) schemes (e.g. `javascript:`) that become an href sink. This is the established repo pattern (`pageUrl`/`eventLink`/`socialFacebook`), not a meetings-plan defect. Flag for the same future `vc-audit-context`/hardening follow-up already noted for the Superforms drift; do NOT fix in this feature's EXECUTE.
- Test-coverage known-gap (named residual): DB-write + 403-authz behavior is Hybrid-manual only (no DB integration harness — pre-existing repo-wide gap). Backlog stub recommended (see Backlog artifacts). Out of scope to close in this plan.

Execute-agent instructions:
- E1 (from G2): In `meetings.ts` `listMeetingsForLead`/`listAllMeetings`, avoid N+1 — one meetings query + one `inArray` attendees query grouped in memory (or a join with de-dupe). Do NOT fetch attendees per-meeting in a loop. Confirm query count in the Hybrid gate.
- E2 (from Breaking changes): When adding the tab scaffold to `leads/[id]/+page.svelte`, wrap the ENTIRE existing left/right column content under the "Overview" tab unchanged; do NOT delete or restructure `ActivityTimeline` / `LogTouchForm`. Verify existing lead-detail behavior is visually unchanged under Overview before marking Phase 3 CODE DONE.
- E3 (schema/migration, high-risk): After `bun run db:generate`, inspect the generated SQL and confirm it contains ONLY `CREATE TABLE crm_meetings`, `CREATE TABLE crm_meeting_attendees`, and the indexes — no `ALTER`/`DROP` on existing tables and nothing touching Better Auth tables (`user`/`account`/`session`/`verification`). Do not run `db:push`/`db:migrate` until confirmed additive-only.
- E4 (from G1, authz): Implement `getMeeting(id)` (step 8) returning at minimum `id` + `organizerId`, and place the 403 guard AFTER the 404 not-found check and BEFORE parsing/writing in both `PATCH` and `DELETE`. Do NOT gate `POST` with 403; default `organizerId` to `locals.user.id` when omitted. Guard string must match `touch/+server.ts:11-13` exactly with `meeting.organizerId` substituted for `lead.ownerId`.

What this coverage does NOT prove:
- `bun run check`: proves types compile; does NOT prove any runtime DB behavior, query correctness, that migrations apply, or that the 403 guard fires at runtime.
- Zod schema Vitest: proves input validation shape; does NOT prove the API handler wires the schema correctly or that persistence succeeds.
- `dbRowToMeeting` Vitest: proves pure-mapper output shape; does NOT prove the DB query feeding it returns correct rows.
- Hybrid (manual dev Postgres): proves insert/edit/soft-delete/cascade/set-null/unique-index/N+1/403-authz only in the manual session run; NOT reproducible in CI, NOT regression-protected (no automated integration harness).
- Agent-Probe: proves tab switching + link attributes by judgment; does NOT prove cross-browser behavior or automated e2e (no Playwright specs).

Backlog artifacts:
- Recommend `meetings-db-integration-harness_NOTE_01-07-26.md` in `process/features/meetings/backlog/` — track promoting the 4 Hybrid DB gates (write/cascade/N+1/403-authz) to Fully-Automated once a DB test harness exists (pre-existing repo-wide gap).

Gate: CONDITIONAL (0 FAILs; re-validation cycle 1 — G1 closed; remaining concerns are pre-accepted execute-instructions E1/E2/E3 + named known-gap residual (DB integration harness). No supplement-worthy defect remains; ≥1 recorded fix cycle in results.tsv → terminal, EXECUTE-ready.)
Accepted by: session (autonomous re-validation cycle 1). Accepted concerns by name: Test-coverage known-gap (DB-write + 403-authz Hybrid-manual only — out of scope, Hybrid proving gate + backlog stub); G2/E1 (N+1 pattern — execute-instruction); Breaking-changes/E2 (tab refactor regression — execute-instruction); Section-3 (first-tab UI styling — normal EXECUTE latitude). G1 (mutation authorization) RESOLVED, not accepted-open.

## Autonomous Goal Block

```
SESSION GOAL: Ship the Meetings feature — 2 soft-deletable Drizzle tables (crm_meetings + crm_meeting_attendees), 5 JSON CRUD API routes, lead-detail Meetings tab (first-ever tab scaffold), top-level /meetings page. Real Postgres via Drizzle, repo fetch→+server.ts→Zod→Drizzle→optimistic+invalidateAll+toast pattern (NOT Superforms). Calendar view is OUT OF SCOPE (backlog stub).
Charter + umbrella plan: N/A — single plan (process/features/meetings/active/meetings_01-07-26/meetings_PLAN_01-07-26.md)
Autonomy: reversible edits auto-proceed; per feedback_autonomous_phase_execution — CONDITIONAL → apply fixes and continue; BLOCKED → backlog + continue.
Hard stop conditions / safety constraints:
- Do NOT run db:push/db:migrate until the generated migration SQL is inspected and confirmed additive-only (CREATE TABLE + indexes only; nothing touching existing or Better Auth tables). (E3)
- Do NOT hand-edit generated Drizzle migration SQL.
- G1 RESOLVED in-plan: meeting mutations (PATCH/DELETE) MUST enforce the manager-or-organizer 403 guard (getMeeting fetch-then-guard, mirrors touch/+server.ts:11-13). Do NOT ship edit/delete without it. (E4)
Next phase: EXECUTE — Phase 1 (schema/migration/Zod/types) first; it is the dependency root and sole high-risk touchpoint.
Validate contract: inline in plan (## Validate Contract; Gate: CONDITIONAL — re-validation cycle 1; EXECUTE-ready)
Execute start: fully-auto: `bun run check` + `bun run test:unit` | hybrid: manual dev-Postgres CRUD/cascade/N+1/403-authz | agent-probe: render Meetings tab + /meetings link | high-risk pack: yes (schema/migration — inspect migration before apply)
EXECUTE strategy: Phases 1→2 sequential (dependency chain); Phases 3∥4 parallelizable (disjoint route files, shared create/edit form built in Phase 3). Model: opus for EXECUTE legs, sonnet elsewhere.
```
