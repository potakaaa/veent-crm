---
name: plan:standalone-meetings
description: "Allow meetings to be created without a linked lead (standalone meetings) — schema, DB, API, form, calendar, display"
date: 10-07-26
feature: general-plans
---

# Standalone Meetings — Implementation Plan (SIMPLE)

Date: 10-07-26
Status: Active
Complexity: SIMPLE

**TL;DR:** Make `crm_meetings.lead_id` nullable so a meeting can exist without a lead. Change three
`.innerJoin(crmLeads)` reads to `.leftJoin`, relax `createMeeting` + `meetingFormSchema` +
`MeetingFormModal` validation to make lead optional, filter null lead ids in the calendar owner
lookup, and render "No lead" gracefully where a lead name/link is shown. CalDAV/NCAL-3 sync needs
**no code change** — it already keys on `/meetings/{id}` and null-safes the label. One additive
Drizzle migration.

---

## Overview

Meetings today require a lead (`lead_id NOT NULL`). We want "standalone" meetings with no lead. They
must appear on `/meetings` and `/calendar`; they do NOT appear on any lead detail page (no lead to
attach to). When `lead_id` is null the UI shows "No lead" / omits the lead link.

## Goals

1. `crm_meetings.lead_id` becomes nullable (additive migration).
2. A meeting can be created, listed, viewed, and calendar-synced with no lead.
3. Existing lead-linked meetings behave exactly as before (no regression).

## Scope

**In scope:** schema migration, `db/meetings.ts` reads + `createMeeting`, `meetingFormSchema`,
`MeetingFormModal` validation, `calendar/+page.server.ts` null-id filter, meeting-detail lead
display, meetings-list lead display.

**Out of scope:** editing a meeting's lead after create (lead is immutable post-create today; that
stays true — standalone stays standalone). Lead-detail rendering (standalone meetings never appear
there by design). Any n8n/CalDAV write-path change.

---

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` (L354–356) | Drop `.notNull()` on `crmMeetings.leadId` |
| `drizzle/0037_*.sql` (new) | Generated migration: `ALTER TABLE crm_meetings ALTER COLUMN lead_id DROP NOT NULL` |
| `src/lib/server/db/meetings.ts` | 3 reads innerJoin→leftJoin (L167, L227, L294); `createMeeting` input `leadId?: string \| null` (L342) + insert value (L356) |
| `src/lib/zod/schemas.ts` (L185) | `meetingFormSchema.leadId` → optional + nullable |
| `src/routes/api/meetings/+server.ts` (L39) | Pass `leadId: data.leadId ?? null` (was `data.leadId`) |
| `src/lib/components/meetings/MeetingFormModal.svelte` (L15–25, L115–147, L157–169) | `MeetingFormPayload.leadId` optional; drop the hard lead-required guard; send `leadId: effectiveLeadId \|\| null` |
| `src/routes/calendar/+page.server.ts` | No change needed — `meetingIds` regex extraction already yields only real `/meetings/{id}` ids; lead-id array (L58–67) already filters non-null. Verify only. |
| `src/routes/meetings/[id]/+page.svelte` (L172–178) | Guard the lead link: render "No lead" when `meeting.leadId` is null |
| `src/lib/types/index.ts` (L185) | `Meeting.leadId` → `string \| null` |

## Public Contracts

- **`crm_meetings.lead_id`**: nullable after migration. Additive/backwards-compatible — every
  existing row keeps its value; no backfill.
- **`meetingFormSchema`** (POST `/api/meetings` body): `leadId` becomes optional/nullable. A missing
  or null `leadId` is now VALID (was a 400). This is a contract widening, not a break — every
  previously-valid body stays valid.
- **`Meeting.leadId`** type: widens `string` → `string | null`. Callers reading `meeting.leadId`
  must handle null (audited: meeting-detail lead link is the only render site; `listMeetingsForLead`
  is lead-scoped and never returns null-lead rows).
- **`createMeeting({ leadId })`**: `string` → `string | null | undefined`.

## Blast Radius

- **Files:** 8 (1 schema, 1 new migration, 1 DB layer, 1 zod, 1 API route, 1 component, 1 display
  page, 1 type). **Risk class: schema/migration** (nullable-drop is additive but is a DDL change).
- **Not touched:** NCAL-3 sync (`calendar-sync.ts` / `writer.ts`) — already `/meetings/{id}`-keyed
  and null-label-safe; PATCH route + `meetingUpdateSchema` (lead is immutable on edit, unchanged);
  `listMeetingsForLead` (lead-scoped, cannot return null-lead rows).

---

## Implementation Checklist

### A. Schema + Migration

1. In `src/lib/server/db/schema.ts` L354–356, remove `.notNull()` from `leadId` (keep the
   `.references(() => crmLeads.id, { onDelete: 'cascade' })`). Keep the `crm_meetings_lead_idx`
   index (still valid for nullable column).
2. **Journal pre-check** (per Drizzle convention): confirm `drizzle/meta/_journal.json` last `idx`
   is `36` and highest `.sql` is `0036_*` (verified: they match). Then run `bun run db:generate`.
   Expect one new file `drizzle/0037_*.sql` containing `ALTER TABLE "crm_meetings" ALTER COLUMN
   "lead_id" DROP NOT NULL;`. Do NOT apply to any live DB (deploy-time step; same convention as
   migration 0026).
3. Verify the generated SQL contains only the `DROP NOT NULL` alter (no unexpected drops/renames);
   if drizzle-kit emits extra statements, stop and reconcile.

### B. DB Layer (`src/lib/server/db/meetings.ts`)

4. `getMeetingDetail` (L167): change `.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))` to
   `.leftJoin(...)`. `row.leadName` is already selected as nullable; `dbRowToMeeting` already maps
   `leadName ?? undefined`. No mapper change needed.
5. `listAllMeetings` (L227): innerJoin→leftJoin (same edit).
6. `listMeetingsPaginated` (L294): innerJoin→leftJoin (same edit). The `count()` query (L301) does
   NOT join leads, so `total` was already lead-independent — no change there.
7. `createMeeting` input type (L342): `leadId: string` → `leadId?: string | null`. Insert value
   (L356): `leadId: input.leadId` → `leadId: input.leadId ?? null`.
8. Confirm `listMeetingsForLead` (L188–214) is unchanged — it filters `eq(crmMeetings.leadId,
   leadId)` so it can never surface a null-lead meeting (correct: standalone meetings never appear
   on lead detail).

### C. Type (`src/lib/types/index.ts`)

9. L185: `Meeting.leadId: string` → `leadId: string | null`. Update the doc comment to note null =
   standalone. (`dbRowToMeeting` already passes `row.leadId` through; no mapper edit.)

### D. Zod + API Layer

10. `src/lib/zod/schemas.ts` L185: `leadId: z.string().uuid()` →
    `leadId: z.string().uuid().optional().nullable()`. Leave `meetingUpdateSchema` untouched (lead
    immutable on edit).
11. `src/routes/api/meetings/+server.ts` L39: `leadId: data.leadId` → `leadId: data.leadId ?? null`.
    L57 already passes `leadId: full.leadId ?? null` to the NCAL-3 sync — no change.

### E. Form / UI (`MeetingFormModal.svelte`)

12. `MeetingFormPayload.leadId` (L16): `string` → `string | null`.
13. `submit()` (L115–121): DELETE the hard lead-required guard (`if (!effectiveLeadId) { fieldErrors
    = { leadId: 'Pick a lead...' }; return; }`). Lead is now optional.
14. `submit()` payload (L132): `leadId: effectiveLeadId` → `leadId: effectiveLeadId || null` (empty
    string → null). Keep the start-time required guard (L122) unchanged.
15. Update the `FieldError` for lead (L167) — the block stays (still useful if a server error ever
    keys `leadId`), but no client rule sets it now. Leave the label as "Lead" but the field is
    optional; no "(required)" affordance exists today, so no visual change is needed.

### F. Calendar Page (`calendar/+page.server.ts`)

16. **Verify-only** (no edit expected): the `meetingIds` array (L71–80) is built from a
    `/meetings/{id}` regex match on CalDAV event hrefs — null lead ids never enter it. The `leadIds`
    array (L58–67) already `.filter((id) => id !== null)`. Confirm both hold; only add a `.filter`
    guard if typecheck flags a null leak. Record the verification in the EXECUTE report.

### G. NCAL-3 Sync Guard (verification checkpoint)

17. **Verify-only, no code change:** `src/lib/server/n8n/calendar-sync.ts` `buildMeetingPayload`
    (L96) keys CRM-HREF on `/meetings/{id}` (not lead), and the title label (L99) falls back to
    "👥 Team Meeting" when `leadName`/`leadOrganizerName` are both null. `writer.ts` `embedCrmHref`
    already handles absent href. Confirm `syncMeetingToNextcloud` is called with `leadId: full.leadId
    ?? null` (already true, L57). If any code path constructs `leadHref:` from `meeting.leadId`
    without a null guard, add `meeting.leadId ? \`/leads/${meeting.leadId}\` : undefined` — audit
    shows none exists today, so this is expected to be a no-op confirmation.

### H. Display / UX (`meetings/[id]/+page.svelte`)

18. L172–178: the lead link currently renders `<a href={`/leads/${meeting.leadId}`}>{meeting.leadName
    ?? 'View lead'}</a>` unconditionally. Wrap in `{#if meeting.leadId}` … `{:else}<span
    class="text-ink-400">No lead</span>{/if}` so a standalone meeting shows "No lead" instead of a
    dead `/leads/null` link. Move the `·` separator INSIDE the `{#if meeting.leadId}` guard so a
    standalone meeting shows no dangling separator (per validate-contract E4).
19. Meetings-list lead column (`/meetings/+page.svelte`, not opened here): confirm the list renders
    `leadName` defensively (falls back gracefully when undefined). If it renders a hard `/leads/{id}`
    link, apply the same `{#if}` guard. Record the check in EXECUTE (list already receives
    `leadName?: string`, so likely already safe).

### I. Tests

20. Run the fully-automated gates (see Verification Evidence). Add a `createMeeting`/mapper unit
    assertion for null lead if the existing `meetings-organizer-db.spec.ts` covers the create path;
    otherwise record as known-gap (no live DB in this env — same class as other features).

---

## Acceptance Criteria

- **AC1:** `crm_meetings.lead_id` is nullable; migration `0037` contains ONLY the `DROP NOT NULL`
  alter. — proven by: migration-content grep gate. strategy: Fully-Automated.
- **AC2:** A meeting can be created with no lead (POST `/api/meetings` with `leadId` absent/null
  returns 201, not 400). — proven by: `meetingFormSchema` validation + standalone create e2e.
  strategy: Agent-Probe (e2e known-gap; zod widening covered by typecheck).
- **AC3:** Standalone meetings appear on `/meetings` and `/calendar` (leftJoin reads include
  null-lead rows). — proven by: `meetings-filters.spec.ts` + standalone-create e2e. strategy:
  Fully-Automated (query) + Agent-Probe (render, known-gap).
- **AC4:** Meeting detail renders "No lead" (no `/leads/null` link) when `leadId` is null. — proven
  by: `{#if meeting.leadId}` guard + typecheck. strategy: Fully-Automated (typecheck) + Agent-Probe
  (visual, known-gap).
- **AC5:** Existing lead-linked meetings render, list, filter, and sync exactly as before (no
  regression). — proven by: `meetings-filters.spec.ts` + `meetings-organizer-db.spec.ts`. strategy:
  Fully-Automated.
- **AC6:** `check` passes — `Meeting.leadId: string | null` is consistently handled everywhere.
  — proven by: `bun run check`. strategy: Fully-Automated.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | AC6 — type widening (`Meeting.leadId`, `createMeeting` input, `MeetingFormPayload`) consistent across all call sites; no `/leads/null` type leak |
| `bun run test:unit -- src/tests/meetings-filters.spec.ts` | Fully-Automated | AC3, AC5 — `parseMeetingFilterParams` + list filtering unaffected by the nullable-lead change (no filter/sort/pagination regression) |
| `bun run test:unit -- src/tests/meetings-organizer-db.spec.ts` | Fully-Automated | AC5 — `dbRowToMeeting` mapper + organizer resolution still correct with a null `leadName`/`leadId` row |
| Migration `0037_*.sql` contains only `ALTER COLUMN lead_id DROP NOT NULL` | Fully-Automated (grep) | AC1 — migration additive/backwards-compatible; no destructive DDL |
| Create a standalone meeting via `MeetingFormModal` (no lead) → appears on `/meetings` + `/calendar`, meeting detail shows "No lead" | Agent-Probe / e2e | AC2, AC3, AC4 — end-to-end standalone creation/display — **known-gap** (shared Playwright auth fixture missing) |

Failing stub (Fully-Automated — mapper null-lead):
```
test("dbRowToMeeting maps a null-lead meeting to leadId=null, leadName=undefined", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: null-lead meeting mapper")
})
```

**High-risk (schema/migration) note:** the DDL is a `DROP NOT NULL` — strictly widening, no data
rewrite, reversible via `SET NOT NULL` only if no null rows exist. Minimum tier met by the
fully-automated migration-content grep + typecheck. Live-DB apply is deploy-time (known-gap: no live
Postgres in this env, same pre-accepted class as migration 0026 / manager-dashboard).

---

## Test Infra Improvement Notes

(none identified yet — the standalone e2e path is blocked by the same pre-existing shared Playwright
auth fixture gap tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)

---

## Phase Completion Rules

SIMPLE plan — single phase. This plan is `CODE DONE` when checklist A–I are applied and all three
Fully-Automated gates (`bun run check`, `bun run test:unit -- src/tests/meetings-filters.spec.ts`,
`bun run test:unit -- src/tests/meetings-organizer-db.spec.ts`) plus the migration-content grep pass
green. It is NOT `VERIFIED` until the standalone-create e2e runs (blocked on the shared Playwright
auth fixture — pre-accepted known-gap; document in the EVL report). Post-phase testing runs after
every risk-bearing section (B, D, E, H), not batched to the end.

---

## Dependencies, Risks, Backwards Compatibility

- **Dependency:** `bun run db:generate` must produce exactly one migration; journal must be clean
  (verified: last idx 36 matches highest sql 0036).
- **Risk — null leak to `/leads/null`:** mitigated by the `{#if meeting.leadId}` guard (step 18) +
  typecheck catching any un-guarded `/leads/${leadId}` template on a nullable value.
- **Risk — `total` count drift:** none — the count query never joined leads.
- **Backwards compatibility:** fully additive. Existing rows keep `lead_id`; existing lead-linked
  meetings render and sync identically. The zod change only widens accepted input.
- **Rollback:** revert the 8 file edits; the migration is not applied in this env, so no DB rollback
  needed until deploy. Post-deploy rollback = `SET NOT NULL` (safe only if no standalone rows exist).

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/standalone-meetings_10-07-26/standalone-meetings_PLAN_10-07-26.md`
2. **Last completed step:** PLAN written; VALIDATE complete (CONDITIONAL gate, contract below).
3. **Validate-contract status:** written (10-07-26) — CONDITIONAL, accepted.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`;
   source files read: `db/meetings.ts`, `api/meetings/+server.ts`, `MeetingFormModal.svelte`,
   `calendar/+page.server.ts`, `meetings/[id]/+page.svelte`, `meetings/+page.server.ts`, `schema.ts`
   (L350–384), `zod/schemas.ts` (L184–213), `types/index.ts` (L183–207), `n8n/calendar-sync.ts`.
5. **Next step for a fresh agent:** EXECUTE checklist A→I in order, following execute-agent
   instructions E1–E4 in the validate-contract. Start with A (schema + migration) since B/C/D depend
   on the nullable column. Run test gates after each section (B, D, E, H are the risk-bearing
   sections). NCAL-3 (G) and calendar (F) are verify-only — confirm and report, do not force an edit.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-07-26
date: 2026-07-10
generated-by: inner-pvl: standalone-meetings
Parallel strategy: sequential
Rationale: Signal score 2/7 (S2 schema surface, S6 schema/migration risk class) — but blast radius is 8 tightly-coupled files with one linear dependency chain (schema → DB → type → zod → form → display); sequential single-agent EXECUTE fits. No independent parallel workstreams.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC6 | Type widening (`Meeting.leadId: string \| null`, `createMeeting` input, `MeetingFormPayload`) consistent at all call sites; no `/leads/null` type leak | Fully-Automated | `bun run check` exits 0 | A |
| AC3, AC5 | `parseMeetingFilterParams` + list filtering unaffected by nullable-lead change (no filter/sort/pagination regression) | Fully-Automated | `bun run test:unit -- src/tests/meetings-filters.spec.ts` | A |
| AC5 | `dbRowToMeeting` mapper + organizer resolution correct with a null `leadName`/`leadId` row | Fully-Automated | `bun run test:unit -- src/tests/meetings-organizer-db.spec.ts` | A |
| AC1 | Migration `0037` additive/backwards-compatible; no destructive DDL | Fully-Automated | grep `0037_*.sql` for exactly `ALTER COLUMN "lead_id" DROP NOT NULL` and no `DROP COLUMN`/`DROP TABLE`/FK-action change | A |
| AC2, AC3, AC4 | Standalone meeting created via `MeetingFormModal` (no lead) → appears on `/meetings` + `/calendar`; detail shows "No lead" | Agent-Probe | standalone-create e2e | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — the two known-gaps below are named residual rows (gap-resolution D), not strategies that prove a behavior.

Legacy line form (retained for existing consumers):
- typecheck: Fully-automated: `bun run check`
- filter regression: Fully-automated: `bun run test:unit -- src/tests/meetings-filters.spec.ts`
- mapper null-lead: Fully-automated: `bun run test:unit -- src/tests/meetings-organizer-db.spec.ts`
- migration content: Fully-automated (grep): `0037_*.sql` contains ONLY `ALTER COLUMN "lead_id" DROP NOT NULL`
- standalone create/display: known-gap: documented (shared Playwright auth fixture missing, pre-accepted)

Failing stub (Fully-Automated — mapper null-lead):
```
test("dbRowToMeeting maps a null-lead meeting to leadId=null, leadName=undefined", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: null-lead meeting mapper")
})
```

Dimension findings:
- Infra fit: CONCERN — test/typecheck commands in the plan (`bun test ...`, `bun run typecheck`) did not match the repo's real scripts. Resolved via P1+P2 (corrected to `bun run test:unit -- <file>` and `bun run check`). Now PASS.
- Test coverage: CONCERN — standalone-create end-to-end path (AC2/AC4) has no automated gate; only Fully-Automated query/typecheck coverage exists. Resolved as pre-accepted known-gap (shared Playwright auth fixture — same class blocking calendar/reminders/manager-dashboard e2e). Fully-Automated gates prove the query/type/migration layers; the render/create leg is the named residual.
- Breaking changes: PASS — every contract change is a widening (nullable column, optional/nullable zod field, `string`→`string | null` type). No existing valid input becomes invalid; no downstream consumer breaks. `listMeetingsForLead` audited lead-scoped (never returns null-lead rows).
- Security surface: PASS — no auth/billing/secret/trust-boundary change. Schema/migration risk class present (DDL `DROP NOT NULL`) but strictly additive and non-destructive; no live-DB apply in this env (deploy-time).
- Section A (Schema + Migration) feasibility: CONCERN — highest-risk edit; drizzle-kit could emit unexpected DDL. Resolved via E2 (grep-verify 0037 contains ONLY the `DROP NOT NULL` alter, STOP-and-reconcile on any extra statement).
- Section B–E (DB/type/zod/form) feasibility: PASS — edit targets uniquely matchable at named line numbers; linear dependency chain. E1 sequences the type-widening edits together before `bun run check`.
- Section F (Calendar) feasibility: PASS — verify-only no-op; null lead ids never enter `meetingIds`; `leadIds` already `.filter`s null. Confirmed null-safe during VALIDATE (E3).
- Section G (NCAL-3 sync) feasibility: PASS — verify-only no-op; CRM-HREF keys on `/meetings/{id}`, title label null-safe. Confirmed null-safe during VALIDATE (E3).
- Section H (Display) feasibility: CONCERN — dangling `·` separator if only the link is guarded. Resolved via E4 (move separator inside the `{#if meeting.leadId}` guard).

Execute-agent instructions:
- **E1:** Apply Section B step 7 (`createMeeting` input widen), Section C (type widen), and Section D (zod + API) together as one edit group BEFORE running `bun run check`. Running check mid-group produces spurious type errors from a half-widened contract.
- **E2:** After `bun run db:generate`, grep-verify the new `0037_*.sql` contains ONLY `ALTER COLUMN "lead_id" DROP NOT NULL`. If any `DROP COLUMN`, `DROP TABLE`, or FK-action change appears, STOP and reconcile the drizzle journal drift before proceeding — do not layer the change on top.
- **E3:** Sections F (calendar) and G (NCAL-3) are verify-only no-ops — confirmed null-safe during VALIDATE. Confirm in-file state during EXECUTE and record the confirmation in the phase report; do NOT force an edit unless typecheck flags a real null leak.
- **E4:** Section H step 18 — move the `·` separator INSIDE the `{#if meeting.leadId}` guard so standalone meetings do not show a dangling separator.

Open gaps:
- Standalone-create e2e (AC2/AC4): known-gap — shared Playwright auth fixture missing (pre-existing, pre-accepted; tracked at `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- Live-DB migration apply (AC1 deploy leg): known-gap — no live Postgres in this env (pre-accepted, same class as migration 0026 / manager-dashboard). Migration-content grep proves the DDL shape; live apply is deploy-time.

What this coverage does NOT prove:
- `bun run check` (typecheck): proves type consistency across all call sites; does NOT prove runtime behavior, DOM render, or that a standalone meeting actually persists/appears in the UI.
- `bun run test:unit -- src/tests/meetings-filters.spec.ts`: proves filter/sort/pagination parsing is unaffected; does NOT prove the leftJoin actually returns null-lead rows from a live DB.
- `bun run test:unit -- src/tests/meetings-organizer-db.spec.ts`: proves the `dbRowToMeeting` mapper handles a null-lead row; does NOT prove the DB query itself, the API 201 response, or end-to-end create.
- Migration-content grep: proves the generated SQL is additive/non-destructive; does NOT prove the migration applies cleanly against a live Postgres (deploy-time, no live DB here).
- No automated gate proves the standalone-create → list → calendar → "No lead" detail render path end-to-end (the two known-gaps above).

Gate: CONDITIONAL (4 CONCERNs, all resolved via P1+P2 plan corrections + E1–E4 execute-agent instructions; 0 FAILs; 2 pre-accepted known-gaps on record)
Accepted by: user (accepted CONDITIONAL gate this session) — concerns accepted: (1) Infra-fit command mismatch [resolved P1+P2], (2) Test-coverage standalone e2e gap [pre-accepted known-gap], (3) Section A migration-DDL risk [resolved E2], (4) Section H dangling-separator [resolved E4]

## Autonomous Goal Block

```
SESSION GOAL: Standalone meetings — allow crm_meetings without a linked lead (schema nullable-drop → DB leftJoin reads → type/zod/form widening → calendar/NCAL-3 verify → "No lead" display).
Charter + umbrella plan: N/A — single plan.
Autonomy: reversible edits auto-proceed; hard stop only on the E2 migration-DDL reconcile trigger or any irreversible/outward-facing action not in this contract. No live-DB apply.
Hard stop conditions / safety constraints:
- E2: if generated 0037_*.sql contains anything beyond `ALTER COLUMN "lead_id" DROP NOT NULL` (any DROP COLUMN / DROP TABLE / FK-action change), STOP and reconcile drizzle journal drift before proceeding.
- Do NOT apply migration 0037 to any live/dev Postgres — it is a deploy-time step.
- Do NOT touch meetingUpdateSchema / PATCH route (lead is immutable on edit).
Next phase: EXECUTE — process/general-plans/active/standalone-meetings_10-07-26/standalone-meetings_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract, CONDITIONAL, accepted).
Execute start:
- Fully-auto gates: `bun run check` | `bun run test:unit -- src/tests/meetings-filters.spec.ts` | `bun run test:unit -- src/tests/meetings-organizer-db.spec.ts` | grep 0037_*.sql
- e2e (known-gap): standalone-create via MeetingFormModal — blocked on shared Playwright auth fixture (pre-accepted)
- high-risk pack: no (schema/migration additive, non-destructive, no live-DB apply)
Execute order: A → (E1: B step7 + C + D together) → E → (E3: F + G verify-only) → (E4: H) → I. Run gates after B, D, E, H.
```
