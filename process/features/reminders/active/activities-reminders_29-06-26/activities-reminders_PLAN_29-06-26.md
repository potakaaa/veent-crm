---
name: plan:activities-reminders
description: "COMPLEX plan — activity-log touch composer, last_activity_at maintenance, Today due/overdue view, secret-authed reminders endpoint, n8n email-fallback digest"
date: 29-06-26
feature: reminders
---

# Activity Log + Reminders — COMPLEX Plan

**Date**: 29-06-26
**Status**: IN PROGRESS — code-complete, EVL green; manual Hybrid/Agent-Probe gates pending
**Complexity**: COMPLEX
**Feature:** reminders

**TL;DR:** Wire the already-built schema/UI to real DB writes across 3 phases. Phase A makes "log a touch" persist (insert activity + dedup + bump `last_activity_at`). Phase B makes the in-app Today and Reminders views query real data with correct Manila-TZ urgency. Phase C ships the secret-authed `/api/reminders/due` real impl + a Resend email-fallback digest for n8n. **No schema changes** — schema, Zod, types, and indexes already exist. 8 files touched (5 edited, 3 new).

---

## Session Goal

Make the activity-logging and reminder loop functional end-to-end against Postgres, replacing the mock/stub layer, while preserving the existing polished UI. Ship email-fallback reminders; Viber/Telegram chat channel is explicitly deferred (n8n-side, out of code scope).

---

## Overview

The data layer (Drizzle schema, dedup/partial indexes, `last_activity_at` column) and the presentation layer (Today view, Reminders page, `LogTouchForm`, `ActivityTimeline`) already exist. What is missing is the **server glue**: one DB insert function, two API/route-server files for the Today and Reminders views, the real `getDueReminders()`, an email digest sender, and the client wiring that switches `logTouch()` from the mock client to a real `fetch`.

Three phases, sequenced by dependency:

- **Phase A — Core Activity Insertion** (foundation; everything else depends on real activities existing)
- **Phase B — Today + Reminders views** (depends on A so `last_activity_at` / `follow_up_at` are real)
- **Phase C — Reminders endpoint + email fallback** (depends on A for `follow_up_at` data; independent of B)

All date math uses `Asia/Manila` (`REMINDER_TZ`). All DB access stays server-side. API endpoints consume raw JSON (not Superforms) and validate with the existing Zod schemas.

---

## Touchpoints

Files that will be read or changed:

| File | Action | Why |
|---|---|---|
| `src/lib/server/db/leads.ts` | edit | add `insertActivity()`; fix `dbRowToLead()` to accept `followUpAt` |
| `src/routes/api/leads/[id]/activities/+server.ts` | **new** | POST endpoint to log a touch |
| `src/routes/leads/[id]/+page.svelte` | edit | wire `logTouch()` to real `fetch` |
| `src/lib/components/leads/LogTouchForm.svelte` | edit | add `call`, `meeting`, `other` channels |
| `src/routes/+page.server.ts` | **new** | Today view load (due/overdue/replied/cold) |
| `src/routes/reminders/+page.server.ts` | **new** | pending follow-ups for current user |
| `src/lib/server/reminders.ts` | edit | real `getDueReminders()` impl |
| `src/lib/server/email.ts` | edit | add `sendReminderDigest()` |
| `src/routes/api/reminders/due/+server.ts` | read-only | already calls `getDueReminders()`; confirm shape `{ due }` |
| `src/tests/leads.spec.ts` | **edit (added by VALIDATE)** | existing 20+ `dbRowToLead` calls — update if signature changes (see VALIDATE concern C2/E-B1) |

Read for context (no change): `src/lib/server/db/schema.ts`, `src/lib/zod/schemas.ts`, `src/lib/types/index.ts`, `src/lib/server/db/index.ts`.

---

## Public Contracts

Interfaces/behaviors visible to other callers:

1. **`POST /api/leads/[id]/activities`** (new public HTTP contract)
   - Auth: `locals.user` required → `401` if absent.
   - Request body (JSON): `activityFormSchema` shape — `{ leadId, channel, outcome, occurredAt?, followUpAt?, notes? }`. Client also sends `followUpInDays` (preset → computed `followUpAt`); endpoint accepts and resolves it.
   - `201` → `{ activity: Activity }` on insert.
   - `409` → `{ error: 'duplicate' }` when dedup key collides (ON CONFLICT DO NOTHING returns 0 rows).
   - `400` → `{ error, issues }` on Zod parse failure.
   - `401` → `{ error: 'unauthorized' }` when no session.

2. **`GET /api/reminders/due`** (existing contract, now backed by real data)
   - Auth: `Authorization: Bearer ${REMINDERS_ENDPOINT_SECRET}` (NOT cookie).
   - Response: `{ due: DueReminder[] }`, sorted `followUpAt ASC`. `DueReminder = { leadId, leadName, repEmail, followUpAt, overdue }`.
   - This is the n8n polling contract.

3. **`insertActivity(input)`** (internal server contract in `db/leads.ts`)
   - Transactional: inserts activity (dedup) + updates `crm_leads.last_activity_at` + `updated_at` in one tx.
   - Returns `Activity | null` (`null` on dedup conflict).

4. **`sendReminderDigest({ repEmail, reminders })`** (internal email contract)
   - Sends a Resend digest; no-ops with a warning when `RESEND_API_KEY` unset.

5. **`getDueReminders(): Promise<DueReminder[]>`** — unchanged signature; real impl behind it.

No DB schema or migration changes. No auth-flow changes. The `/api/reminders/due` secret auth already exists.

---

## Blast Radius

- **Scope:** 8 files (5 edited, 3 new) + `src/tests/leads.spec.ts` (existing test, added to scope by VALIDATE). Single package (the SvelteKit app). No multi-package fan-out.
- **Risk class:** API contract addition (new POST endpoint) + secret-authed endpoint behavior change (`/api/reminders/due` now returns real rows). No schema migration, no auth-flow change, no billing/credits. Medium risk — concentrated in the new endpoint's input validation, the dedup/conflict path, and the Manila-TZ boundary math.
- **Compatibility:** Additive. `dbRowToLead()` change is a bugfix (passing `followUpAt` that was previously dropped) — **must be backward-compatible** (optional 2nd param) so the 5 existing single-arg callers and `src/tests/leads.spec.ts` keep working.
- **Rollback:** All changes are code-only with no migrations. Revert the commit to restore mock/stub behavior; no data cleanup needed (inserted activities are valid rows, harmless if feature reverted).

---

## Implementation Checklist

Execute strictly in order A1 → C2. Each item is atomic and paired with its verification.

### Phase A — Core Activity Insertion

**A1. Add `insertActivity()` to `src/lib/server/db/leads.ts`**
- Signature: `insertActivity(input: { leadId, repId, channel, outcome, occurredAt?, followUpInDays?, followUpAt?, notes? }): Promise<Activity | null>`.
- Resolve `occurredAt`: use provided value or `new Date()`.
- Resolve `followUpAt`: if `followUpAt` provided use it; else if `followUpInDays` provided compute `new Date(occurredAt.getTime() + followUpInDays * 86400000)`; else `null`.
  - **VALIDATE (E-A1):** extract this resolution into an exported pure helper `resolveFollowUpAt(occurredAt, followUpInDays?, followUpAt?): Date | null` so VE-A1 can unit-test it WITHOUT a DB.
- Wrap in `db.transaction(async (tx) => { ... })`:
  1. `INSERT INTO crm_activities` with `.onConflictDoNothing({ target: [crmActivities.leadId, crmActivities.repId, crmActivities.occurredAt, crmActivities.channel] })` (matches `crm_activities_dedupe_uq`), `.returning()`. **Use the actual Drizzle column references**, not bare identifiers.
  2. If insert returned 0 rows → `return null` (caller maps to 409). Do NOT update the lead on a dedup no-op.
  3. `UPDATE crm_leads SET last_activity_at = occurredAt, updated_at = now() WHERE id = leadId`.
  4. Return `dbActivityToActivity(insertedRow)`.
- Follow the existing `moveLeadStage()` / `reassignLead()` transaction pattern in the same file.
- **Verify:** `bun run check` passes; unit test for the `resolveFollowUpAt` computation (see Verification Evidence VE-A1).

**A2. Create `POST /api/leads/[id]/activities` — `src/routes/api/leads/[id]/activities/+server.ts`**
- Export `POST: RequestHandler`.
- Auth: if `!locals.user` → `return json({ error: 'unauthorized' }, { status: 401 })`. **VALIDATE (E-A2):** note that `hooks.server.ts` redirects unauthenticated non-public requests with a 303 to `/login` BEFORE the handler runs — so the in-handler 401 is a defense-in-depth fallback, not the primary path for cookie clients. See VALIDATE concern C5.
- Parse: `const body = await request.json()`; `const parsed = activityFormSchema.safeParse(body)`; on failure `return json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })`.
- **VALIDATE (E-A2b):** validate `followUpInDays` from raw body before passing — coerce/guard to a finite number (e.g. `typeof body.followUpInDays === 'number'`) or ignore; it is NOT in `activityFormSchema`.
- Call `insertActivity({ ...parsed.data, repId: locals.user.id, followUpInDays: <validated> })`.
- If result is `null` → `return json({ error: 'duplicate' }, { status: 409 })`.
- Else → `return json({ activity: result }, { status: 201 })`.
- Use `params.id` as the lead id; cross-check it equals `parsed.data.leadId` (reject 400 mismatch).
- **Verify:** manual `curl` POST returns 201 then 409 on replay (VE-A2); `bun run check`.

**A3. Wire `logTouch()` in `src/routes/leads/[id]/+page.svelte`**
- Replace `crm.addActivity(lead.id, input)` (line ~45) with:
  ```
  const res = await fetch(`/api/leads/${lead.id}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leadId: lead.id,
      channel: input.channel,
      outcome: input.outcome,
      followUpInDays: input.followUpInDays,
      notes: input.note
    })
  });
  ```
- Handle non-ok: if `res.status === 409` show "Already logged" toast; if `!res.ok` show error toast; on 201 parse `{ activity }`, append to timeline, reset form.
- Remove the stub toast "Activity logging will be wired in Phase 6." (confirmed present at line 47).
- Keep Svelte 5 runes (`$state`) for any local UI state — no stores.
- **Verify:** manual UI smoke (VE-A3); `bun run check`.

**A4. Fix `LogTouchForm.svelte` — add missing channels**
- `channelOpts` currently lists only 4 (`fb_dm`, `fb_comment`, `ig_dm`, `email`) — confirmed at lines 11–16. Add `call`, `meeting`, `other` so all 7 `ACTIVITY_CHANNELS` are selectable. Source labels from `ACTIVITY_CHANNELS` rather than hardcoding to stay in sync.
- **Verify:** `bun run check`; manual — dropdown shows 7 channels (VE-A4).

### Phase B — Today View + Reminders List

**B1. Create `src/routes/+page.server.ts` (Today view load)**
- `load` async, requires `locals.user` (redirect to `/login` if absent, matching app convention).
- Compute Manila "start of today": derive the Asia/Manila calendar day boundary and convert to a UTC `Date` for comparison. Reuse `REMINDER_TZ` from `reminders.ts`.
- Query `crm_leads` WHERE `deleted_at IS NULL` AND (`follow_up_at <= now()` (overdue/due) OR `stage = 'replied'` OR `last_activity_at < now() - interval '30 days'` (cold)).
- **VALIDATE (E-B1):** `crm_leads` has NO `follow_up_at` column — `follow_up_at` lives on `crm_activities`. The query MUST LEFT JOIN `crm_activities` (latest/relevant `follow_up_at` per lead) to obtain `follow_up_at`, then pass it as the 2nd arg to `dbRowToLead(row, followUpAt)`. Without this, overdue/due urgency cannot be computed (acceptance #4).
- Map each row with `dbRowToLead(row, followUpAt)` (signature fixed in B1b).
- Return `{ leads, me: locals.user }`. (The existing `src/routes/+page.svelte` already consumes `data.leads` + `data.me` — shape confirmed compatible.)

**B1b. Fix `dbRowToLead()` in `src/lib/server/db/leads.ts`**
- Current call: `computeAge({ lastActivityAt, stage, followUpAt: undefined })` (line 41) — drops `followUpAt`.
- **VALIDATE (E-B1, corrects original `row.followUpAt` instruction which would NOT compile):** change the signature to `dbRowToLead(row: DbLead, followUpAt?: string): Lead` (optional 2nd param, defaulting to `undefined`). Pass that param into `computeAge`. This is backward-compatible: the 5 existing single-arg callers (`listLeads`, `getLead`, `createLead`, `moveLeadStage`, `reassignLead`) and the 20+ calls in `src/tests/leads.spec.ts` keep their existing behavior (followUpAt stays undefined). Do NOT use `row.followUpAt` — `DbLead` has no such field.
- After the change, update `src/tests/leads.spec.ts` only if a new urgency case is added; existing assertions must still pass unchanged.
- **Verify:** unit test asserting `dbRowToLead(row, pastFollowUpAt)` → `urgency: 'overdue'`, future → `'due'` (VE-B1); `bun run check`.

**B2. Create `src/routes/reminders/+page.server.ts`**
- `load` requires `locals.user`.
- Query `crm_activities` WHERE `follow_up_at IS NOT NULL` AND `follow_up_at >= now()` AND `rep_id = locals.user.id`, JOIN `crm_leads` for lead data.
- **VALIDATE (E-B2):** the existing `src/routes/reminders/+page.svelte` consumes `data.leads` (a `Lead[]`, grouped by `urgency`) — NOT `data.reminders`. Return `{ leads }` where each item is a `Lead` mapped via `dbRowToLead(leadRow, activity.follow_up_at)` so urgency is correct. The original B2 `{ reminders }` shape would break the page.
- **Verify:** manual page render with seeded follow-up (VE-B2); `bun run check`.

### Phase C — Reminders Endpoint + Email Fallback

**C1. Implement real `getDueReminders()` in `src/lib/server/reminders.ts`**
- Query `crm_activities` WHERE `follow_up_at <= now()` AND `follow_up_at IS NOT NULL`, JOIN `crm_leads` (leadName, skip soft-deleted `deleted_at IS NULL`), JOIN `crm_users` for `repEmail`.
- Map to `DueReminder[]`: `{ leadId, leadName, repEmail, followUpAt: <ISO string>, overdue }`.
- `overdue = followUpAt < startOfToday_Manila` (everything `<= now()` is at least "due"; "overdue" means before today's Manila start-of-day).
- Sort `followUpAt ASC`.
- Keep the existing `getDueReminders` signature (the `/api/reminders/due` endpoint already calls it and returns `{ due }` — shape confirmed).
- **Verify:** `GET /api/reminders/due` with correct Bearer returns non-empty sorted JSON (VE-C1); `bun run check`.

**C2. Add `sendReminderDigest()` to `src/lib/server/email.ts`**
- Signature: `sendReminderDigest({ repEmail, reminders }: { repEmail: string; reminders: DueReminder[] }): Promise<void>`.
- If `!env.RESEND_API_KEY` (or `!env.RESEND_FROM`) → `console.warn` and `return` (stub-safe, matching the no-throw fallback intent — note the existing `sendEmail` THROWS on missing key, so `sendReminderDigest` must NOT call `sendEmail` on the no-key path).
- Else build a digest body (lead name + followUpAt + overdue flag per row) and send via Resend.
- Use `$env/dynamic/private` for `RESEND_API_KEY` / `RESEND_FROM`. Do not throw on send failure — log and return (n8n is the primary path; this is the fallback).
- **Verify:** `bun run check`; unit test that no-API-key path logs + returns without throwing (VE-C2).

**n8n integration (documentation only — no code):**
n8n polls `GET /api/reminders/due` with `Authorization: Bearer ${REMINDERS_ENDPOINT_SECRET}`, receives `{ due: DueReminder[] }`, and dispatches per rep. v1 = email fallback only; Viber/Telegram TBD. The email fallback path is `sendReminderDigest()` (callable by a webhook node or by extending the endpoint). The n8n workflow itself is configured in the n8n UI and is out of code scope.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| VE-A1: `bun run test:unit:ci` — `resolveFollowUpAt` computes `followUpAt` from `followUpInDays` (pure helper) | Fully-Automated | "Add-touch composer" follow-up computation |
| VE-A1b: dedup no-op returns null (`insertActivity` second identical insert) | Hybrid (needs DB) | "enforce activity unique key" |
| VE-A2: manual `curl` POST `/api/leads/:id/activities` → 201, replay → 409, no-auth → 401/redirect, bad body → 400 | Hybrid (needs running app + DB) | "Add-touch composer" + unique-key enforcement |
| VE-A2b: manual — after POST, lead's `last_activity_at` updated to `occurredAt` | Hybrid | "Maintain `last_activity_at` from activities" |
| VE-A3: manual UI — log a touch from lead detail, timeline updates, no stub toast | Agent-Probe | "Add-touch composer" UX |
| VE-A4: manual — `LogTouchForm` shows all 7 channels (fb_dm/fb_comment/ig_dm/email/call/meeting/other) | Agent-Probe | "channels (...)" coverage |
| VE-B1: `bun run test:unit:ci` — `dbRowToLead(row, pastFollowUpAt)` yields `urgency: 'overdue'`; future → `'due'` | Fully-Automated | "in-app Today due/overdue view (Asia/Manila day boundary)" |
| VE-B2: manual — Today view + Reminders page render due/overdue/replied/cold groups from real data | Agent-Probe | "Today due/overdue view" + `follow_up_at` |
| VE-C1: manual `GET /api/reminders/due` with correct Bearer → non-empty `{ due }` sorted ASC; wrong/no token → 401 | Hybrid (needs DB + secret) | "`/api/reminders/due` — secret-authed" |
| VE-C2: `bun run test:unit:ci` — `sendReminderDigest` no-ops (logs, no throw) when `RESEND_API_KEY` unset | Fully-Automated | "n8n daily digest ... with email fallback" |
| VE-BUILD: `bun run build` succeeds | Fully-Automated | whole-feature integration |
| VE-CHECK: `bun run check` passes (TypeScript) | Fully-Automated | whole-feature type safety |

REQ-TEST-LINK (each SPEC criterion → proving scenario + strategy):
- **Add-touch composer (7 channels, outcome, notes):** proven by VE-A1 + VE-A3 + VE-A4 — strategy: Fully-Automated (A1) + Agent-Probe (A3/A4).
- **Maintain `last_activity_at` + unique key:** proven by VE-A1b (dedup) + VE-A2b (last_activity_at) — strategy: Hybrid.
- **`follow_up_at` + Today due/overdue (Manila boundary):** proven by VE-B1 + VE-B2 — strategy: Fully-Automated (B1) + Agent-Probe (B2).
- **`/api/reminders/due` secret-authed:** proven by VE-C1 — strategy: Hybrid.
- **n8n daily digest + email fallback:** proven by VE-C2 (code path) + integration contract doc — strategy: Fully-Automated for fallback; n8n workflow itself is a **Known-Gap** (n8n UI config, out of code scope) → backlog stub below; gate stays CONDITIONAL for the live n8n dispatch leg.

Known-Gap (per vacuous-green ban — recorded, not silently dropped):
- **Live n8n dispatch + real Viber/Telegram delivery** — no code-side test possible (n8n-side config; chat channel TBD). Backlog stub: `n8n-reminders-dispatch_NOTE_29-06-26.md` in `process/features/reminders/backlog/`. The n8n-dispatch gate remains CONDITIONAL — the code-side fallback (`sendReminderDigest` + endpoint shape) IS proven; only the live external dispatch is the residual.

---

## Test Gates (commands for validate-contract)

- `bun run test:unit:ci` — unit tests (Vitest, `vitest --run`): VE-A1, VE-B1, VE-C2. **(VALIDATE corrected from `bun test`, which invokes Bun's native runner, NOT Vitest.)**
- `bun run check` — TypeScript type-check (all items)
- `bun run build` — production build succeeds
- Manual: POST `/api/leads/:id/activities` → verify 201/409/401/400 + `last_activity_at` update (VE-A2, VE-A2b)
- Manual: `GET /api/reminders/due` with correct Bearer → non-empty sorted response (VE-C1)

---

## Dependencies & Sequencing

- A1 must land before A2 (endpoint calls it), A2 before A3 (client calls endpoint).
- B1 depends on A (real `last_activity_at`/`follow_up_at` rows) and on B1b (`dbRowToLead` fix).
- B1b is shared by B1 and any other `dbRowToLead` caller — do it once (backward-compatible), re-run full check + `src/tests/leads.spec.ts`.
- C1 depends on A (real `follow_up_at`). C is independent of B and can proceed in parallel after A.
- No new env vars required (`REMINDERS_ENDPOINT_SECRET`, `RESEND_API_KEY` already defined).

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Manila TZ boundary off-by-one (overdue vs due) | Centralize start-of-Manila-day helper in `reminders.ts`; unit-test VE-B1 with explicit past/future fixtures |
| `dbRowToLead` fix changes urgency for existing pages | Backward-compatible optional param; existing 5 callers + `src/tests/leads.spec.ts` keep current behavior; VE-B1 locks new behavior |
| Dedup ON CONFLICT silently updating lead on no-op | A1 explicitly returns null and skips lead update when 0 rows returned |
| Endpoint accepts `followUpInDays` not in `activityFormSchema` | Read + validate `followUpInDays` from raw `body`, pass separately to `insertActivity`; schema validates the rest |
| Resend send failure breaking n8n flow | `sendReminderDigest` logs and returns; never throws |
| Frozen `NOW` in `dates.ts` (2026-06-24) makes urgency stale | See VALIDATE concern C6 — swap `NOW` to `new Date()` (or inject a reference time) so badge urgency matches SQL `now()` |

---

## Phase Completion Rules

A phase is `CODE DONE` when all its checklist items are implemented and `bun run check` + `bun run build` pass. A phase is `VERIFIED` only when its Verification Evidence rows (VE-*) are green — Fully-Automated gates pass, Hybrid/manual gates are run and recorded, and Agent-Probe gates are judged acceptable. Do not mark a phase VERIFIED on code-completion alone.

- **Phase A VERIFIED:** VE-A1, VE-A1b, VE-A2, VE-A2b, VE-A3, VE-A4 all pass/judged.
- **Phase B VERIFIED:** VE-B1, VE-B2 pass/judged (depends on A VERIFIED).
- **Phase C VERIFIED:** VE-C1, VE-C2 pass/judged; live n8n dispatch remains CONDITIONAL (Known-Gap backlog stub).
- **Feature VERIFIED:** all phases VERIFIED + VE-BUILD + VE-CHECK green.

## Acceptance Criteria

1. Logging a touch from lead detail persists a `crm_activities` row (all 7 channels selectable) and updates the lead's `last_activity_at` to `occurredAt`.
2. Re-posting an identical touch (same leadId+repId+occurredAt+channel) returns 409 and does NOT re-update the lead.
3. Unauthenticated POST → 401 (handler) or 303 redirect to `/login` (hooks layer, for cookie clients — see VALIDATE concern C5); malformed body → 400.
4. Today view shows correct due/overdue/replied/cold grouping using the Asia/Manila day boundary, driven by real DB data (requires the B1 activities JOIN — concern C3/E-B1).
5. Reminders page lists the current user's pending future follow-ups sorted ascending.
6. `GET /api/reminders/due` with the correct Bearer secret returns `{ due: DueReminder[] }` sorted by `followUpAt ASC`; wrong/missing token → 401.
7. `sendReminderDigest` sends via Resend when configured and no-ops (logs, no throw) when `RESEND_API_KEY` is unset.
8. `bun run test:unit:ci`, `bun run check`, and `bun run build` all pass.

## Test Infra Improvement Notes

- No integration-test harness (real Postgres) exists — the Hybrid gates (VE-A1b, VE-A2, VE-A2b, VE-C1) are manual until a test DB fixture is set up. Tracked as a known infra gap.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reminders/active/activities-reminders_29-06-26/activities-reminders_PLAN_29-06-26.md`
2. **Last completed step:** VALIDATE complete (validate-contract written below, Gate: CONDITIONAL); no code changes yet.
3. **Validate-contract status:** written 29-06-26 — Gate CONDITIONAL (6 concerns documented with execute-agent corrections E-A1…E-B2).
4. **Supporting context loaded:** research findings inline; `process/context/all-context.md`; tests routing (`process/context/tests/all-tests.md`).
5. **Next step for a fresh agent:** EXECUTE Phase A → B → C in checklist order, applying the VALIDATE execute-agent instructions (E-*). Start at A1 (`insertActivity` + `resolveFollowUpAt` helper in `src/lib/server/db/leads.ts`). No schema migration needed.

---

## Validate Contract

Status: CONDITIONAL
Date: 29-06-26
date: 2026-06-29
generated-by: inner-pvl: phase-1

Parallel strategy: sequential
Rationale: 1/7 signals (S2 — new API contract surface). Single package, 8 files, dependency-ordered checklist; one execute-agent in strict A→B→C order is the fit. No fan-out benefit.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| VE-A1 | `resolveFollowUpAt` computes followUpAt from followUpInDays | Fully-Automated | `bun run test:unit:ci` — pure helper test in `src/tests/` exits 0 | B (gate added by this plan) |
| VE-A1b | dedup no-op returns null | Hybrid | `insertActivity` twice (same key) → 2nd returns null — precondition: live Postgres | D (backlog test-building stub — no integration DB harness) |
| VE-A2 | POST endpoint 201 / 409 / 401 / 400 | Hybrid | manual `curl` against running app — precondition: app + DB up | D (manual until integration harness exists) |
| VE-A2b | `last_activity_at` bumped on insert | Hybrid | manual SQL read after POST — precondition: app + DB | D (backlog) |
| VE-A3 | log-touch UI persists, no stub toast | Agent-Probe | open lead detail, log a touch, observe timeline update + no "Phase 6" toast | A (judged this cycle at EXECUTE) |
| VE-A4 | LogTouchForm shows all 7 channels | Agent-Probe | open composer, count channel pills = 7 | A (judged at EXECUTE) |
| VE-B1 | `dbRowToLead(row, followUpAt)` urgency overdue/due | Fully-Automated | `bun run test:unit:ci` — assert overdue for past, due for future | B (gate added by this plan) |
| VE-B2 | Today + Reminders pages render real groups | Agent-Probe | render both pages with seeded data, verify grouping | A (judged at EXECUTE) |
| VE-C1 | `/api/reminders/due` real sorted `{ due }`, secret-authed | Hybrid | manual `GET` with Bearer — precondition: DB + REMINDERS_ENDPOINT_SECRET | D (manual until integration harness) |
| VE-C2 | `sendReminderDigest` no-throw no-op without key | Fully-Automated | `bun run test:unit:ci` — assert no throw, console.warn called | B (gate added by this plan) |
| VE-BUILD | production build succeeds | Fully-Automated | `bun run build` exits 0 | A (proven each cycle) |
| VE-CHECK | TypeScript type-check passes | Fully-Automated | `bun run check` exits 0 | A (proven each cycle) |
| n8n-dispatch | live n8n dispatch + Viber/Telegram delivery | Agent-Probe | n/a — external n8n UI config, no code-side test | C (deferred — backlog `n8n-reminders-dispatch_NOTE_29-06-26.md`) |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to named later phase/plan; D — backlog test-building stub (named residual; continue).

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — the n8n-dispatch row is proven by no strategy and carried as gap-resolution C/D (named residual).

Legacy line form (retained so existing validate-contract consumers still parse):
- Phase A activity insert: hybrid: `bun run test:unit:ci` (VE-A1, pure helper) + manual curl 201/409/401/400 (precondition: app + Postgres running)
- Phase B Today/Reminders urgency: fully-automated: `bun run test:unit:ci` (VE-B1) + agent-probe: render pages (VE-B2)
- Phase C reminders endpoint + email: hybrid: manual `GET /api/reminders/due` with Bearer (precondition: DB + secret) + fully-automated: `bun run test:unit:ci` (VE-C2)
- Whole feature: fully-automated: `bun run check` + `bun run build`
- n8n live dispatch: known-gap: documented as backlog NOTE (n8n-side, out of code scope)

Failing stubs (Fully-Automated rows only — TDD red-first, for execute-agent; NOT written to disk during VALIDATE):

VE-A1 stub:
```
test("should compute followUpAt from followUpInDays via resolveFollowUpAt", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: resolveFollowUpAt(occurredAt, followUpInDays) returns occurredAt + N days")
})
```

VE-B1 stub:
```
test("should yield urgency 'overdue' for a past followUpAt and 'due' for today", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: dbRowToLead(row, pastFollowUpAt).urgency === 'overdue'")
})
```

VE-C2 stub:
```
test("should no-op (log, not throw) when RESEND_API_KEY is unset", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: sendReminderDigest resolves without throwing when no API key")
})
```

VE-BUILD stub:
```
test("should build successfully (bun run build exits 0)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: production build succeeds")
})
```

VE-CHECK stub:
```
test("should pass type-check (bun run check exits 0)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: svelte-check + tsc clean")
})
```

Dimension findings:
- Infra fit: PASS — single SvelteKit app, server-side DB only, no container/port/worker surface. New route `api/leads/[id]/activities/+server.ts` does NOT conflict with the static `api/leads/ingest` route (SvelteKit resolves static before dynamic). Structural plan validator: 0 failures.
- Test coverage: CONCERN — plan's `bun test` gate is wrong (Bun's native runner ≠ Vitest; repo uses `vitest` via `bun run test:unit:ci`). Corrected in contract. VE-A1 dedup-null is not a pure unit test (needs DB → split to VE-A1b Hybrid); only `resolveFollowUpAt` is Fully-Automated. No integration-DB harness → 4 Hybrid gates are manual.
- Breaking changes: CONCERN — `dbRowToLead` change touches existing `src/tests/leads.spec.ts` (20+ calls) not in the original blast radius. Signature change MUST be backward-compatible (optional 2nd param) to avoid breaking 5 callers + the test file. Added to blast radius.
- Security surface: CONCERN — unauthenticated POST to non-public `/api/leads/[id]/activities` is intercepted by `hooks.server.ts` with a 303 redirect to `/login` BEFORE the handler runs, so the in-handler 401 (contract/VE-A2) is unreachable for cookie clients. Not a vulnerability (request still rejected) but acceptance #3 must accept 303-or-401. No high-risk evidence pack required (no new auth flow, no schema/billing).

Section feasibility:
- Phase A (A1–A4): CONCERN — dedup `target` maps correctly to `crm_activities_dedupe_uq` (use real Drizzle column refs, not bare identifiers). `repId` is nullable but always set to `locals.user.id` so dedup works. `followUpInDays` arrives via raw body (not in schema) — validate it. A3 stub toast ("Phase 6") + `crm.addActivity` confirmed at lines 45/47; A4 4-of-7 channels confirmed at LogTouchForm lines 11–16. Highest-risk edit: A1 transaction dedup/no-op path — mitigation: return null + skip lead update on 0 rows (already specified).
- Phase B (B1/B1b/B2): CONCERN (mechanical defects, corrected via E-B1/E-B2) — original B1b `row.followUpAt` would NOT compile (`DbLead`/`crm_leads` has no `follow_up_at`; it is on `crm_activities`). Fix: `dbRowToLead(row, followUpAt?: string)` + B1 must LEFT JOIN `crm_activities` to source `follow_up_at`. B2 original `{ reminders }` return breaks `reminders/+page.svelte` which consumes `data.leads` (Lead[]) — return `{ leads }` instead. Root `+page.svelte` already consumes `{ leads, me }` — compatible. Highest-risk edit: B1 JOIN correctness for urgency (acceptance #4).
- Phase C (C1/C2): PASS — `getDueReminders` join (activities→leads→users) maps cleanly to `DueReminder`; endpoint already returns `{ due }` (confirmed). `sendReminderDigest` no-key no-op feasible — must NOT delegate to `sendEmail` (which throws) on the no-key path.

Open gaps:
- Live n8n dispatch + Viber/Telegram delivery: known-gap: documented as NEW PLAN REQUIRED — see `process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md` (to be created). Excluded from CONCERN/FAIL count per vacuous-green ban (named residual, code-side fallback IS proven).
- Integration-DB test harness absent: Hybrid gates (VE-A1b, VE-A2, VE-A2b, VE-C1) are manual until a test Postgres fixture exists. Backlog candidate.
- Frozen `NOW` (`dates.ts` = 2026-06-24): badge urgency via `computeAge` is computed against a stale anchor while SQL uses real `now()`. Recommend swapping `NOW` to `new Date()` (or injecting a reference time) — flagged as concern C6, not blocking.

What this coverage does NOT prove:
- `bun run test:unit:ci` (VE-A1/B1/C2): proves the pure helpers (`resolveFollowUpAt`, `dbRowToLead` urgency, `sendReminderDigest` no-key path). Does NOT prove: the real DB transaction, the ON CONFLICT dedup behavior against live Postgres, the `last_activity_at` write, the HTTP endpoint status codes, the secret-auth path, or any SQL JOIN correctness.
- `bun run check`: proves TypeScript/Svelte types compile. Does NOT prove runtime behavior, query correctness, or that the JOINs return the intended rows.
- `bun run build`: proves the app bundles. Does NOT prove any feature works at runtime.
- Manual Hybrid gates (VE-A1b/A2/A2b/C1): not automated — depend on a human running them against a live app + DB; regressions will not be caught in CI until an integration harness exists.
- Agent-Probe gates (VE-A3/A4/B2): UX/visual judgment only — do NOT prove data correctness, only that the surfaces render and behave plausibly.
- n8n live dispatch: entirely unproven by any code-side gate (external config).

Gate: CONDITIONAL (6 concerns documented, fixes provided as execute-agent instructions E-A1…E-B2; no unresolvable FAILs; architecture/schema sound; live-n8n known-gap is a named residual)
Accepted by: session (vc-validate-agent, single-plan inner-pvl) — concerns recorded with execute-agent corrections: C1 test-gate command (bun test → bun run test:unit:ci), C2 leads.spec.ts in blast radius, C3/E-B1 dbRowToLead signature + B1 JOIN, C4/E-B2 B2 return shape, C5 401-vs-303 auth path, C6 frozen NOW. Orchestrator/user may instead run one PVL supplement cycle (see SUPPLEMENT REQUEST in handoff) before EXECUTE.

---

## Autonomous Goal Block

```
SESSION GOAL: Wire activity-logging + reminders to real Postgres (Phases A→B→C), preserving existing UI; ship email-fallback reminders. Viber/Telegram deferred (n8n-side).
Charter + umbrella plan: N/A — single plan (process/features/reminders/active/activities-reminders_29-06-26/activities-reminders_PLAN_29-06-26.md)
Autonomy: standard RIPER-5; no-inline-execution (spawn vc-execute-agent for edits, vc-tester for gates); reversible decisions auto-proceed.
Hard stop conditions / safety constraints:
- No DB schema/migration changes (schema, Zod, types, indexes already exist) — if any edit implies a migration, stop.
- Do not break the 5 existing dbRowToLead callers or src/tests/leads.spec.ts — dbRowToLead signature change must be backward-compatible (optional 2nd param).
- sendReminderDigest must never throw (logs + returns when RESEND_API_KEY unset).
- Apply VALIDATE execute-agent instructions E-A1…E-B2 — do NOT use the original `row.followUpAt` (won't compile) or `{ reminders }` return shape (breaks the page).
Next phase: EXECUTE (after CONDITIONAL acceptance or one PVL supplement cycle) — Phase A → B → C in checklist order, start at A1.
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL)
Execute start: fully-auto: bun run test:unit:ci, bun run check, bun run build | hybrid (manual, needs app+DB): curl POST /api/leads/:id/activities (201/409/401/400), GET /api/reminders/due (Bearer) | agent-probe: log-touch UI, 7 channels, Today/Reminders render | high-risk pack: no
```
