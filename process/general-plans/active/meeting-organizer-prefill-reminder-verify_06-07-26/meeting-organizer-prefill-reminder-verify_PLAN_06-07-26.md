---
name: plan:meeting-organizer-prefill-reminder-verify
description: "Bundled plan for two independent GitHub issues: (A) pre-fill meeting organizer/contact from lead's linked crm_organizers entity, (B) verify meeting day/hour reminder delivery paths"
date: 06-07-26
feature: general
phase: "n/a — not a phase program"
---

# Meeting Organizer Pre-fill + Reminder Verification — PLAN

**Classification:** COMPLEX (single plan, NOT a phase program — two independent phases/sections, no shared files, bundled because both are small self-contained GitHub issues delegated together)

Date: 06-07-26
Status: VALIDATED — Gate PASS, pending EXECUTE
Complexity: COMPLEX

**Bundling rationale:** This plan bundles two unrelated GitHub issues into one file because both are small, independently scoped, and were delegated together by the orchestrator. They touch disjoint files (Phase A: schema + leads/meetings data layer + UI; Phase B: verification-only, no planned source edits) and have no execution-order dependency — see **Dependencies & Sequencing** below.

**INNOVATE skip note:** INNOVATE was intentionally skipped for Phase A (Auto Mode active). The one real design choice — how to persist "which lead-organizer is linked to this meeting" — was resolved by the orchestrator during scoping/research handoff rather than a formal INNOVATE round, because it was narrow (a single additive-schema decision with an obvious low-risk shape matching a precedent already in this codebase — the `dayReminderSentAt`/`hourReminderSentAt` additive-column pattern). Rationale for the chosen design is documented inline in Phase A Design Decision below. Phase B required no design decision (it is a verification task against already-implemented code) — INNOVATE does not apply to it either.

---

## Overview

Two independent GitHub issues, bundled for planning efficiency:

- **Phase A — Meeting organizer pre-fill from lead** (depends on #188 `crm_organizers` table, which already exists in schema but is only half-wired). Adds a genuinely persisted link from a meeting to the lead's tagged `crm_organizers` row, pre-filled on meeting creation, overridable by the user.
- **Phase B — Meeting reminder verification.** The reminder system (`crmMeetings.dayReminderSentAt`/`hourReminderSentAt`) is already fully implemented and code-complete per `process/features/reminders/active/meeting-reminders_01-07-26/`. This phase is a verification-and-enablement task, not a build task: confirm the implementation is correct (already done via code review) and produce the exact runbook to run the pending Hybrid DB tests against a real database.

## Goals

- Phase A: reduce redundant re-typing on meeting creation by pre-filling the lead's linked organizer; keep the field overridable; do not conflate this with the existing internal-user `organizerId` (crm_users) field on `crm_meetings`.
- Phase B: produce verifiable proof (not just code review) that day-before/hour-before meeting reminders fire correctly and do not double-send, or clearly document why that proof is currently blocked and hand over an exact runbook.

## Scope

**In scope:** schema addition (Phase A), leads/meetings data-layer changes (Phase A), `MeetingFormModal` pre-fill UI (Phase A), Zod schema + API persistence (Phase A), a verification runbook + live-DB Hybrid test run (Phase B).

**Out of scope:** building any organizer picker beyond a minimal combobox, building an n8n workflow (Phase B AC7-equivalent stays a pre-accepted Agent-Probe known-gap exactly as the original `meeting-reminders` plan already accepts), backfilling `crm_organizers` seed data, fixing the unrelated `drizzle-migration-journal-drift` backlog item (noted, not touched — see Phase B research note).

---

# PHASE A — Meeting Organizer Pre-fill from Lead

### Original GitHub Issue

> Depends on #188 (crm_organizers table)
> **What to build:** When creating a meeting from leads/[id], pre-populate the organizer/contact field with the lead's organizer name and linked organizer (if organizerId is set). User should not need to re-type what's already known from the lead context.
> **Acceptance criteria:**
> - [ ] Organizer name pre-filled when opening "New Meeting" from a lead
> - [ ] crm_meetings.organizerId (or equivalent) linked automatically
> - [ ] User can still override the pre-filled value

### Confirmed Research Findings (read-only investigation; re-verified during PLAN)

- Two DISTINCT `organizerId` concepts exist and must never be conflated:
  - `crmLeads.organizerId` (`schema.ts` — FK → `crmOrganizers.id`, onDelete `set null`) — the lead's linked recurring-event/organizer entity (GitHub #188 subject).
  - `crmMeetings.organizerId` (`schema.ts` L344 area — FK → `crmUsers.id`) — the INTERNAL team member who organizes the meeting. Unrelated; do not touch.
- `crmOrganizers` table (`schema.ts`, comment: "recurring event-organizer entity a lead can be tagged to (GitHub #188)") exists with: `id, name, normalizedHandle, socialFacebook, socialInstagram, website, email, phone, location, createdAt, updatedAt`.
- GitHub #188 is only half-wired: `src/routes/api/leads/[id]/organizer/+server.ts` (`PATCH`) tags/untags a lead to a `crmOrganizers` row via `organizerTagSchema`, with audit trail (`crmLeadHistory` insert). This endpoint is reusable as-is — **no changes needed to it in this plan.**
- **Re-verified during PLAN (not just claimed by research):** `src/lib/types/index.ts` Lead type ALREADY declares `organizerId: string | null` and `organizerName?: string` fields (lines 141-142) — this is further along than the original research summary stated. HOWEVER, `dbRowToLead()` in `src/lib/server/db/leads.ts` (the single mapper used by every leads-list/detail query path, confirmed via `grep` — 15+ call sites) does **NOT** set `organizerId` or `organizerName` on the returned object anywhere in its body. The DB query functions also do not join `crmOrganizers`. So the type contract exists but is entirely unpopulated — this is the real, current gap.
- Meeting creation flow: `src/lib/components/meetings/MeetingFormModal.svelte` (hand-rolled validation, no client Zod — consistent with this repo's actual form convention, see `all-context.md` §Mandatory conventions) renders fields: lead, date/time, **Organizer** (a `crm_users` `Select`, L151-162 — this is the INTERNAL organizer picker, unrelated to `crm_organizers`), attendees, meeting URL, outcome, notes. Rendered from `src/routes/leads/[id]/+page.svelte:519` via `<MeetingsPanel meetings={data.meetings} users={data.users} me={data.me} leadId={lead.id} />` with a fixed `leadId` prop. Currently pre-fills ONLY `leadId`.
- `meetingFormSchema` (`src/lib/zod/schemas.ts`, confirmed lines ~189-199): `leadId, startAt, organizerId (uuid, crm_users, optional), meetingUrl, notes, outcome, attendeeIds`. No field exists today for the lead's `crm_organizers` entity on a meeting. `meetingUpdateSchema` mirrors this with `organizerId` nullable-optional for the crm_users unassign path — same pattern to follow for the new field.
- Open testing caveat confirmed still true: no seed/import path for `crmOrganizers` rows was found — pre-fill logic must degrade gracefully (no crash, nothing pre-filled) when the lead has no `organizerId`, which will be the common case in real data today.

### Phase A Design Decision (resolves the single INNOVATE-skipped choice)

**Decision:** Add a NEW nullable column `crmMeetings.leadOrganizerId` (`uuid`, FK → `crmOrganizers.id`, `onDelete: 'set null'`) — distinct from the existing `crmMeetings.organizerId` (crm_users FK, unchanged, untouched).

**Why this over alternatives:**
- A UI-only pre-fill hint (no new column) would satisfy AC1 but NOT AC2 ("crm_meetings.organizerId (or equivalent) linked automatically") — the acceptance criteria explicitly requires a persisted link, not just a display convenience.
- Reusing the existing `crmMeetings.organizerId` column was rejected — it is already load-bearing for a completely different concept (the internal crm_users organizer) and overloading it would break every existing internal-organizer read/write path.
- The additive nullable-column shape mirrors the already-precedented low-risk migration pattern in this repo (`dayReminderSentAt`/`hourReminderSentAt` — see `drizzle/0011_previous_spencer_smythe.sql`): `ADD COLUMN`, nullable, no backfill, no data migration risk.

**Naming:** `leadOrganizerId` (not `organizerId2` or similar) — chosen specifically to avoid any reader confusion with the existing internal-user `organizerId` field, per the explicit two-concepts distinction above.

**Risk class:** schema/migration (additive, low-risk — same shape as prior precedent) + possible new minimal API surface (organizer search) if no reusable lookup exists.

### Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `leadOrganizerId: uuid('lead_organizer_id').references(() => crmOrganizers.id, { onDelete: 'set null' })` to `crmMeetings` table definition |
| `drizzle/` (generated) | New migration via `bun run db:generate` — verify additive-only (`ADD COLUMN`), do not hand-edit |
| `src/lib/server/db/leads.ts` | `dbRowToLead()` must set `organizerId`/`organizerName` on the returned `Lead` (currently silently dropped despite the type declaring them); underlying lead-fetch queries must join `crmOrganizers` on `crmLeads.organizerId` to select `crmOrganizers.name` |
| `src/lib/types/index.ts` | No change needed — `organizerId`/`organizerName` fields already exist on `Lead` (confirmed) |
| `src/routes/leads/[id]/+page.server.ts` | Confirm the lead's `organizerId`/`organizerName` pass through the loader (should now flow automatically once `dbRowToLead` populates them) |
| `src/routes/leads/[id]/+page.svelte` | Pass `organizerId`/`organizerName` as new props into `<MeetingsPanel>` (create-mode pre-fill source only) |
| `src/lib/components/meetings/MeetingsPanel.svelte` | Accept and forward the new pre-fill props to `MeetingFormModal` when opening "New Meeting" (create mode only — never on edit) |
| `src/lib/components/meetings/MeetingFormModal.svelte` | New "Organizer/Contact" section: pre-fills `leadOrganizerId` state from the lead's `organizerId` in create mode only; shows the organizer name; allows clear/override; does NOT touch the existing crm_users `Organizer` `Select` (L151-162) |
| `src/lib/zod/schemas.ts` | `meetingFormSchema` gains `leadOrganizerId: z.string().uuid().optional().nullable()`; `meetingUpdateSchema` gains the same field (nullable-optional, matching the existing crm_users `organizerId` unassign pattern) |
| `src/lib/server/db/meetings.ts` | `createMeeting`/`updateMeeting` persist `leadOrganizerId` |
| `src/routes/api/meetings/+server.ts` | `POST` persists `leadOrganizerId` on create |
| `src/routes/api/meetings/[id]/+server.ts` | `PATCH` persists `leadOrganizerId` on edit (including explicit clear via `null`) |
| `src/routes/api/organizers/+server.ts` (NEW, conditional) | Minimal `GET /api/organizers?q=` search endpoint — only add if step 1 of the checklist below confirms no reusable organizer-lookup endpoint exists; keep minimal, do not over-build |

### Public Contracts

- New DB column `crm_meetings.lead_organizer_id` (nullable uuid, FK → `crm_organizers.id`).
- New Zod schema field `leadOrganizerId` on `meetingFormSchema`/`meetingUpdateSchema` — additive, optional, backward compatible (existing callers omitting the field see no behavior change).
- `Lead` type contract (`organizerId`/`organizerName`) already existed but was unpopulated — this plan makes it a real, honored contract for the first time. Any other code already reading `lead.organizerName` expecting a value will start receiving real data instead of `undefined` (checked: no other call sites currently read it, since it was never populated — confirmed via grep, no behavior-change risk elsewhere).
- Conditional new API surface: `GET /api/organizers?q=` (only if added) — session-authed, read-only search, minimal response shape `{ id, name }[]`.

### Blast Radius

~11 files (schema, 1 migration, leads data layer, 1 lead-detail route pair, 2 meeting components, zod schemas, meetings data layer, 2 meeting API routes) + 1 conditional new file. All within `src/lib/server/db/`, `src/routes/leads/`, `src/routes/api/meetings/`, `src/lib/components/meetings/`, `src/lib/zod/`. No cross-feature blast radius beyond leads+meetings (both already covered by the `general` plan scope chosen for this bundle). Risk class: schema/migration (additive) + minor new read-only API surface (conditional).

### Implementation Checklist (Phase A)

1. Check `src/routes/api/leads/[id]/organizer/+server.ts` and any existing lead/organizer list endpoints for a reusable organizer-search query pattern before deciding whether step 11 (new endpoint) is needed. Confirm: does `crmOrganizers` currently have any query helper (e.g., a `listOrganizers`/`searchOrganizers` function in `src/lib/server/db/`)? If yes, reuse it.
2. Add `leadOrganizerId` column to `crmMeetings` in `src/lib/server/db/schema.ts` (uuid, FK → `crmOrganizers.id`, `onDelete: 'set null'`, nullable — no `.notNull()`).
3. Before running `db:generate`: confirm `drizzle/meta/_journal.json`'s last `idx` (currently 24) matches the highest-numbered `.sql` file (`0024_glamorous_blob.sql` — confirmed matching, no drift as of this PLAN's research pass) per `all-context.md` §Drizzle conventions.
4. Run `bun run db:generate`; inspect the generated `.sql` file — confirm it is a single additive `ALTER TABLE crm_meetings ADD COLUMN lead_organizer_id uuid REFERENCES crm_organizers(id) ON DELETE SET NULL;` with no other unexpected statements.
5. Update `dbRowToLead()` in `src/lib/server/db/leads.ts` to populate `organizerId: row.organizerId` and `organizerName` (requires the underlying select query to join `crmOrganizers` — add a left join wherever `crmLeads` is selected via the shared query builder, or add a targeted follow-up `crmOrganizers` lookup keyed by `row.organizerId` if a shared join point doesn't exist cleanly; prefer the join if the query structure allows it without destabilizing existing query shape).
6. Confirm (or wire) `organizerId`/`organizerName` flow through `src/routes/leads/[id]/+page.server.ts` → `+page.svelte` → `<MeetingsPanel>` as new props, used only when rendering the "New Meeting" create flow (never overwrite an existing meeting's saved `leadOrganizerId` on edit).
7. Add `leadOrganizerId: z.string().uuid().optional().nullable()` to `meetingFormSchema` and to `meetingUpdateSchema` in `src/lib/zod/schemas.ts`.
8. Add a new "Organizer/Contact" UI block to `MeetingFormModal.svelte`: in create mode, pre-fill from the lead's `organizerId`/`organizerName` props (read-only display + "change" action, or a minimal combobox); in edit mode, hydrate from the meeting's own saved `leadOrganizerId` (never from the lead prop) so editing never silently overwrites a previously-chosen value. Ensure the user can clear the field (set to `null`) and it persists as cleared.
9. Update `createMeeting`/`updateMeeting` in `src/lib/server/db/meetings.ts` to accept and persist `leadOrganizerId` (including explicit `null` on clear — mirror the existing crm_users `organizerId` unassign handling pattern already present for `updateMeeting`).
10. Update `POST /api/meetings/+server.ts` and `PATCH /api/meetings/[id]/+server.ts` to pass `leadOrganizerId` through to the data layer.
11. **Conditional:** if step 1 found no reusable lookup, add a minimal `GET /api/organizers?q=` endpoint (session-authed, `ilike` search on `crmOrganizers.name`, returns `{ id, name }[]`, capped result count e.g. 20) for the combobox in step 8. Skip this step entirely if step 1 found a reusable pattern — do not over-build.
12. Add unit tests: `dbRowToLead` organizer-join mapping (Fully-Automated, DB-free via existing mapper-testing pattern in this file's test suite), `meetingFormSchema`/`meetingUpdateSchema` validation of `leadOrganizerId` (Fully-Automated).
13. Run `bun run test:unit:ci` — confirm all existing + new tests green, no regressions in `leads.ts`/`schemas.spec.ts` coverage.

### Dependencies & Sequencing (Phase A)

- Depends on GitHub #188's `crm_organizers` table — **already exists in schema, confirmed** (no blocker).
- No dependency on Phase B — disjoint files, can run in either order or in parallel with a separate execute pass.
- Step 3 (journal drift check) must complete cleanly before step 4 (db:generate) — if drift is found (unexpected, not seen during this PLAN's research), stop and reconcile per `all-context.md` §Drizzle conventions before proceeding; do not layer a new migration on top of untracked drift.

### Verification Evidence (Phase A)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `dbRowToLead` maps `organizerId`/`organizerName` correctly when `crmOrganizers` row present/absent | Fully-Automated (`bun run test:unit:ci -- src/tests/leads.spec.ts` or equivalent existing mapper test file) | AC1 (organizer name available to pre-fill) |
| `meetingFormSchema`/`meetingUpdateSchema` accept valid `leadOrganizerId` uuid, accept `null`, reject malformed uuid | Fully-Automated (`bun run test:unit:ci -- src/tests/schemas.spec.ts`) | AC2 (field can be linked automatically), AC3 (override/clear path validated) |
| Persistence round-trip: create meeting from a lead with `organizerId` set → `crm_meetings.lead_organizer_id` matches; create from a lead with no `organizerId` → column stays null (no crash) | Hybrid — `SKIP_DB`-gated, mirrors existing pattern in `meeting-reminders-db.spec.ts` | AC2 (linked automatically), graceful-degrade caveat |
| `MeetingFormModal` create-mode pre-fill renders organizer name from lead prop; user can clear/override before submit; edit-mode does NOT overwrite existing saved value from lead prop | Agent-Probe (no component-test tooling confirmed in this repo — see `all-tests.md`; manual/agent-driven UI walkthrough scenario: open lead with tagged organizer → New Meeting → confirm pre-fill → clear → confirm clears → re-open → set → save → edit same meeting → confirm original saved value shown, not lead's current tag) | AC1, AC3 |
| End-to-end flow (login → lead detail → new meeting → submit → verify DB) | Known-gap (pre-accepted) — blocked on the shared Playwright authenticated-session fixture gap tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`, same as every other feature in this repo | full AC1-AC3 e2e proof (documented known-gap, consistent precedent) |

### Test Infra Improvement Notes (Phase A)

(none identified yet beyond the already-tracked shared-Playwright-auth-fixture gap, which is a pre-existing cross-feature gap, not new to this plan)

---

# PHASE B — Meeting Reminder Verification (Day-Before / Hour-Before)

### Original GitHub Issue

> **Background:** crm_meetings has `dayReminderSentAt` and `hourReminderSentAt` columns, implying reminder logic exists or was planned. Needs verification that reminders actually fire.
> **What to do:** Trace the reminder job/cron: confirm it reads upcoming meetings and sends notifications; verify `dayReminderSentAt` is stamped correctly after sending; test both the day-before and hour-before reminder paths; fix any broken paths found.
> **Acceptance criteria:**
> - [ ] Day-before reminder fires and `dayReminderSentAt` is stamped
> - [ ] Hour-before reminder fires and `hourReminderSentAt` is stamped
> - [ ] No duplicate reminders sent on re-run

### Confirmed Research Findings — Feature Is Already Implemented (Code-Complete)

**Reference (do not duplicate):** `process/features/reminders/active/meeting-reminders_01-07-26/meeting-reminders_PLAN_01-07-26.md` and its companion `meeting-reminders_REPORT_01-07-26.md` carry the full original plan and execute report. Read those for complete implementation detail — this section summarizes only what changes the scope of the current GitHub issue.

- `src/lib/server/db/meeting-reminders.ts` implements `getDueMeetingReminders`, `markMeetingReminderSent` (atomic compare-and-set: `UPDATE ... WHERE and(eq(id), isNull(sentCol), isNull(deletedAt)) RETURNING id`), `resolveRecipients`, `groupMeetingRemindersByRecipient`. Re-confirmed correct during this PLAN's research pass — no bug found, exactly-once semantics hold via the CAS pattern.
- `src/routes/api/reminders/due/+server.ts` (read-only preview) and `src/routes/api/reminders/notify/+server.ts` (mark-then-send; breaks on mark failure so unmarked rows stay `NULL` for retry) both correctly implement the intended flow per the original plan.
- Migration confirmed registered and applied to the journal: `idx 11` → `drizzle/0011_previous_spencer_smythe.sql` (additive `ADD COLUMN day_reminder_sent_at` / `hour_reminder_sent_at`, nullable `timestamptz`). **[VALIDATE-corrected 06-07-26]** The prior research claim that the duplicate-`0014`/journal-drift issue (`process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`) "does NOT reproduce" was re-checked directly at VALIDATE and is **factually incorrect** — `drizzle/0014_agreements_fields.sql` and `drizzle/0014_nasty_master_mold.sql` both still exist on disk; `drizzle/meta/_journal.json` idx 14 registers only `0014_nasty_master_mold`, so `0014_agreements_fields.sql` remains an orphaned, unregistered file (confirmed via direct `_journal.json` read — `drizzle-kit migrate` would never apply it). This does NOT block this plan's own migration (idx 24→25 has no collision with either 0014 file or with idx 11) and is unrelated to `crm_meetings`/`crm_organizers`, but the backlog note is **still open, not resolved-or-stale** — do not close it. Out of scope to fix as part of this plan; the backlog note text should be updated to reflect this re-confirmation at UPDATE PROCESS.
- `src/tests/meeting-reminders.spec.ts` — 15 Fully-Automated tests, confirmed 15/15 PASS on a fresh run during research.
- `src/tests/meeting-reminders-db.spec.ts` — **[VALIDATE-corrected 06-07-26: 9, not 8]** 9 Hybrid `SKIP_DB`-gated tests (day/hour window filtering, atomic poll-twice race — this is the direct AC3 "no duplicate reminders" proof, checkpoint independence, deleted/past exclusion, plus a 9th case: meeting soft-deleted after being fetched as due still fails `markMeetingReminderSent`). Confirmed at VALIDATE via a live run: `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts` → "1 skipped (1) / 9 skipped (9)" (SKIP_DB path, no `DATABASE_URL` in this environment, no reachable dev Postgres — confirmed, not just assumed). Migration not confirmed applied to any currently-reachable live DB.
- No n8n workflow, cron, or scheduler exists inside this repo. Scheduling/polling of `/api/reminders/due` and `/api/reminders/notify` is entirely external (n8n, out-of-repo per `_GUIDE.md`). There is nothing further to "trace" in-repo beyond the two endpoint handlers, which are already read and confirmed correct.

### Scope Correction (documented explicitly, per plan-writing instructions)

**No code bug was found.** The GitHub issue's literal instruction ("fix any broken paths found") does not apply — nothing broken was found via code review. This phase's deliverable is corrected from a build/fix task to:

1. **Enable and run the real proof** — provision or confirm a dev Postgres + `DATABASE_URL`, apply migration `0011`, run the 9 Hybrid tests against a real DB. This is the actual gate that proves AC1/AC2/AC3 for real (code review alone is not sufficient proof — the Hybrid tests exist specifically because the CAS race and window-filtering logic need a real DB to exercise).
2. **If a dev DB is genuinely unavailable in this EXECUTE session** — document the Hybrid run as a known-gap exactly as the original `meeting-reminders` plan already does (do not duplicate that documentation — reference it), and produce a manual verification runbook (exact commands + expected output) so a human with DB access can complete AC1-AC3 without re-deriving the steps.

AC "no n8n end-to-end delivery proof" (the real external-delivery path) stays an accepted Agent-Probe known-gap, same as the original `meeting-reminders` plan — this plan does not attempt to build or fake an n8n workflow.

### Touchpoints (verification-only; source edits expected to be zero unless the live-DB run surfaces a real, previously-undetected bug)

| File | Expected action |
|---|---|
| `src/lib/server/db/meeting-reminders.ts` | Read-only re-confirmation; edit only if the live-DB run surfaces an actual defect |
| `src/routes/api/reminders/due/+server.ts`, `src/routes/api/reminders/notify/+server.ts` | Read-only re-confirmation; edit only if the live-DB run surfaces an actual defect |
| `src/tests/meeting-reminders-db.spec.ts` | Execute (not edit) against a real DB; edit only if a genuine test bug (not a code bug) is found |
| `drizzle/0011_previous_spencer_smythe.sql` | Read-only — confirm applied to the target DB via `bun run db:migrate` or `db:push` |
| `process/features/reminders/active/meeting-reminders_01-07-26/` | Reference only — do not duplicate its content in new files |

### Public Contracts / Blast Radius (Phase B)

No new public contracts. Blast radius is effectively zero source files (verification-only) unless the live-DB run finds a real defect, in which case the blast radius stays confined to `src/lib/server/db/meeting-reminders.ts` and/or the two reminder API route handlers (already covered above). Risk class: none (read-only verification) escalating to low (targeted bugfix) only if a genuine defect surfaces.

### Implementation Checklist (Phase B — verification runbook, not a build checklist)

1. Confirm a dev Postgres instance is reachable; set `DATABASE_URL` in the execution environment (do not print or log the value — env var names only, per `all-context.md` §Environment).
2. Apply pending migrations: `bun run db:push` **[VALIDATE-resolved 06-07-26: confirmed the correct command]** — `db:push` (not `db:migrate`) is this repo's established dev-DB apply convention, confirmed by: (a) `src/tests/meeting-reminders-db.spec.ts`'s own header comment (`docker compose up -d db && bun run db:push && bun run db:seed`), and (b) repo-wide precedent across `ufg-inline-edit-review-removal`, `lead-visibility-scoping`, and `bundled-migration-188-191-194-199` plans, all of which explicitly use `db:push` for dev-DB apply. `db:migrate` (`drizzle-kit migrate`, journal-driven) is reserved for the CI/CD production deploy pipeline (see `process/features/ci-cd/_GUIDE.md`) and for hand-authored migrations targeting Better-Auth-adjacent tables (see `ba-account-unique-constraint` plan) — neither applies here. Confirm `crm_meetings.day_reminder_sent_at` / `hour_reminder_sent_at` columns exist post-migration (spot-check via `\d crm_meetings` or an equivalent introspection query).
3. Run the full Hybrid suite: `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts`. Expected: 8/8 pass. Record actual pass/fail count in the phase report.
4. If all 8 pass: AC1 (day-before fires + stamped), AC2 (hour-before fires + stamped), and AC3 (no duplicate on re-run, via the atomic poll-twice race test) are proven. Mark Phase B `VERIFIED`.
5. If any test fails: classify per the Hybrid Failure Resolution Priority (fix now if in blast radius and small; new phase plan if out of scope; backlog note if non-trivial and deferral-acceptable). Do not silently mark VERIFIED with failing tests.
6. Re-run the Fully-Automated suite as a regression check: `bun run test:unit:ci -- src/tests/meeting-reminders.spec.ts` — expected 15/15 pass (already confirmed once during research; re-confirm post any DB-related changes).
7. If a dev DB is genuinely unavailable in the EXECUTE session (step 1 blocked): skip to writing the manual verification runbook as the phase's deliverable — the exact commands from steps 1-3 above, plus expected output ("8 passed (8)" from vitest), stamped as a known-gap consistent with the original `meeting-reminders` plan's existing known-gap language. Do not fabricate a passing result.

### Dependencies & Sequencing (Phase B)

- No dependency on Phase A — fully disjoint files (Phase A touches `crm_meetings`/`crm_organizers`/leads/meetings UI; Phase B touches only the reminder-column read paths and test execution). Can run in either order, or as two separate parallel EXECUTE passes.
- Depends only on dev-DB availability, which is an environment precondition, not a code dependency.

### Verification Evidence (Phase B)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit:ci -- src/tests/meeting-reminders.spec.ts` (15 tests, DB-free) | Fully-Automated | Baseline regression confirmation (not itself AC1-3, but must stay green) |
| `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts` (9 tests, real DB) | Hybrid — precondition: `DATABASE_URL` set + migration `0011` applied | AC1 (day-before fires+stamped), AC2 (hour-before fires+stamped), AC3 (no duplicate on re-run, via poll-twice race test) |
| Real n8n → `/api/reminders/due` → `/api/reminders/notify` → actual email delivery | Known-gap (pre-accepted, matches original `meeting-reminders` plan's own accepted known-gap) | External delivery proof — out of repo scope |

### Test Infra Improvement Notes (Phase B)

If step 1 (dev DB provisioning) is blocked in every future EXECUTE attempt, consider a durable CI-wired live-DB harness (already flagged as repo-wide remaining v1 work in `all-context.md` §Current Project State — "Live-DB CI harness for Hybrid-tier test gates"). This plan does not build that harness; it only surfaces the need again if step 1 blocks.

---

## Acceptance Criteria

**Phase A (GitHub issue AC, verbatim):**
- [ ] Organizer name pre-filled when opening "New Meeting" from a lead
- [ ] `crm_meetings.leadOrganizerId` (the "or equivalent" persisted link) is set automatically from the lead's `organizerId`
- [ ] User can still override (change or clear) the pre-filled value

**Phase B (GitHub issue AC, verbatim, re-scoped to verification per Scope Correction):**
- [ ] Day-before reminder fires and `dayReminderSentAt` is stamped (proven via live-DB Hybrid test run, or documented as known-gap with runbook if DB unavailable)
- [ ] Hour-before reminder fires and `hourReminderSentAt` is stamped (same proof path)
- [ ] No duplicate reminders sent on re-run (proven via the existing atomic poll-twice race test)

## Touchpoints

See per-phase **Touchpoints** tables: Phase A (line ~75, ~11 files across schema/data-layer/UI/API) and Phase B (verification-only, effectively 0 planned source edits). No file overlap between the two phases.

## Public Contracts

See per-phase **Public Contracts** sections. Phase A introduces one new nullable DB column (`crm_meetings.lead_organizer_id`), one new optional Zod field (`leadOrganizerId`), and activates a previously-unpopulated `Lead` type contract (`organizerId`/`organizerName`). Phase B introduces no new public contracts (verification-only).

## Blast Radius

Phase A: ~11 files, schema/migration + minor new read-only API surface (conditional), risk class = schema/migration (additive, low-risk). Phase B: effectively 0 files (verification-only), risk class = none, escalating to low only if a genuine defect is found. Combined blast radius across both phases has zero file overlap — see Dependencies & Sequencing in each phase for why they can run independently.

## Verification Evidence

See per-phase **Verification Evidence** tables (Phase A, Phase B) for the full `| Gate / Scenario | Strategy | Proves SPEC criterion |` mapping. Summary: Phase A has 3 Fully-Automated/Hybrid gates + 1 Agent-Probe gate + 1 documented e2e known-gap. Phase B has 1 Fully-Automated regression gate + 1 Hybrid gate (the actual AC1-3 proof) + 1 documented known-gap (n8n delivery).

## Phase Completion Rules

- Phase A is `CODE DONE` when all 13 checklist steps are implemented and `bun run test:unit:ci` is green (Fully-Automated + new tests). Phase A is `VERIFIED` only after the Hybrid persistence-round-trip gate passes AND a human/agent-probe walkthrough of the create/edit pre-fill behavior is confirmed (per Verification Evidence table) — code-only completion must never be reported as `VERIFIED`.
- Phase B is `CODE DONE` immediately (no source changes are expected) once the code-review re-confirmation in this plan is accepted. Phase B is `VERIFIED` only after the 9 Hybrid DB tests in `meeting-reminders-db.spec.ts` are actually run against a live DB and pass 9/9 — a code-review-only pass does NOT constitute `VERIFIED`. If DB is unavailable, Phase B stays `CODE DONE (known-gap: live-DB Hybrid run pending)` with the runbook handed off, never silently marked `VERIFIED`.
- Neither phase blocks the other — each may independently reach `VERIFIED` on its own schedule.

---

## Overall Test Infra Improvement Notes

(none identified yet beyond what is captured per-phase above)

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 2/7 (S1 multi-file-ish but single package; S6 schema/migration surface present in Phase A). Two independent, disjoint-file, small-scope phases bundled in one plan — a single vc-validate-agent pass covering both Layer 1 dimensions once plus two Layer 2 section checks was sufficient; no fan-out warranted (score < 4).

### Open Items Resolved at VALIDATE

1. **Migration apply command (Phase A step 2 / Phase B step 2):** Resolved to `bun run db:push`. Confirmed three ways: (a) `src/tests/meeting-reminders-db.spec.ts`'s own header comment documents `docker compose up -d db && bun run db:push && bun run db:seed` as the precondition; (b) repo-wide precedent — `ufg-inline-edit-review-removal`, `lead-visibility-scoping`, and `bundled-migration-188-191-194-199` plans all use `db:push` for dev-DB apply, explicitly noting no migration-runner pipeline is wired to `db:migrate` for dev; (c) `db:migrate` (`drizzle-kit migrate`, journal-driven) is reserved for the CI/CD production deploy pipeline and hand-authored migrations on Better-Auth-adjacent tables (neither applies here). Plan text corrected at Phase A step 2/4 area is not needed (checklist never named `db:migrate`); Phase B checklist step 2 corrected in-plan to state `db:push` directly instead of "confirm which command."
2. **Live-DB availability for Phase B Hybrid gate:** Confirmed genuinely unavailable in this VALIDATE session — `DATABASE_URL` is unset (checked via `env`), no Postgres container is running (checked via `docker ps`). This validates the plan's known-gap + runbook fallback (Phase B checklist step 7) as the correct, adequate outcome — not a blocking FAIL. Re-ran the Fully-Automated regression suite live during VALIDATE: `bun run test:unit:ci -- src/tests/meeting-reminders.spec.ts` → **15/15 passed**. Re-ran the Hybrid suite live: `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts` → **9/9 skipped** (SKIP_DB path fires correctly, no crash, no false-pass). Also re-ran `bun run check` → **0 errors, 1 pre-existing unrelated warning** (svelte `state_referenced_locally` in `leads/[id]/+page.svelte`, not introduced by this plan).

### Two Corrections Applied Directly to Plan Text (in-plan fixes, not deferred)

Both found during Layer 2 review and fixed in the plan file before this contract was written (converts what would otherwise be CONCERNs into a clean PASS):

1. **Journal-drift claim was factually wrong.** Phase B research originally claimed the duplicate-`0014` journal-drift backlog item (`process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`) "does NOT reproduce" and should be "treated as resolved-or-stale." Direct inspection at VALIDATE (`ls drizzle/*.sql` + reading `drizzle/meta/_journal.json`) shows this is incorrect: `drizzle/0014_agreements_fields.sql` and `drizzle/0014_nasty_master_mold.sql` both still exist on disk; the journal's idx 14 entry registers only `0014_nasty_master_mold`, leaving `0014_agreements_fields.sql` an orphaned, unregistered file. This does NOT block this plan's own migration (new file lands at idx 25, no collision with idx 11, 14, or 24) and is unrelated to `crm_meetings`/`crm_organizers` (the 0014 files touch `crm_leads` fee columns and lead-visibility grants respectively) — but the backlog note must stay open, not be closed as stale. Plan text corrected in place; execute-agent must NOT re-close that backlog note as part of this plan (out of scope) but should flag the correction at UPDATE PROCESS.
2. **Hybrid test count was off by one.** Plan stated "8 Hybrid `SKIP_DB`-gated tests" in three places; a live run confirms **9** (`src/tests/meeting-reminders-db.spec.ts` — the 9th case is "meeting soft-deleted after being fetched as due still fails `markMeetingReminderSent`"). All three references corrected in-plan (research findings bullet, scope-correction step 1, phase-completion-rules line, verification-evidence table).

### Test Gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| A-mapper | `dbRowToLead` populates `organizerId`/`organizerName` from `crmOrganizers` join (present + absent cases) | Fully-Automated | `bun run test:unit:ci -- src/tests/leads.spec.ts` (new test, checklist step 12) | B |
| A-schema | `meetingFormSchema`/`meetingUpdateSchema` accept valid `leadOrganizerId` uuid, accept `null`, reject malformed uuid | Fully-Automated | `bun run test:unit:ci -- src/tests/schemas.spec.ts` (new cases, checklist step 12) | B |
| A-persist | Create meeting from lead with `organizerId` set → `crm_meetings.lead_organizer_id` matches; lead with no `organizerId` → column stays null, no crash | Hybrid — precondition: `DATABASE_URL` set + `bun run db:push` applied (new migration) | `bun run test:unit:ci` — new `SKIP_DB`-gated persistence round-trip spec (checklist step 12, mirrors `meeting-reminders-db.spec.ts` pattern) | B |
| A-ui-prefill | Create-mode pre-fill renders organizer name from lead prop; user can clear/override before submit; edit-mode does NOT overwrite saved value from lead prop | Agent-Probe | Manual/agent-driven walkthrough: open lead with tagged organizer → New Meeting → confirm pre-fill → clear → confirm clears → re-open → set → save → edit same meeting → confirm original saved value shown, not lead's current tag | B |
| A-e2e | Full flow: login → lead detail → new meeting → submit → verify DB | Known-Gap | — blocked on shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), repo-wide pre-accepted gap | D |
| B-regression | Reminder due-query + CAS mark-sent logic (pure/DB-free paths) stay correct | Fully-Automated | `bun run test:unit:ci -- src/tests/meeting-reminders.spec.ts` — **confirmed 15/15 PASS, run live during this VALIDATE pass** | A — proven now |
| B-hybrid | Day-before fires+stamped (AC1), hour-before fires+stamped (AC2), no duplicate on re-run via poll-twice race (AC3) | Hybrid — precondition: `DATABASE_URL` set + migration `0011` applied via `bun run db:push` | `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts` — **confirmed self-skips correctly (9/9 skipped) in this environment**; runbook: `docker compose up -d db && bun run db:push && bun run db:seed` then re-run, expect "9 passed (9)" | C — deferred: no dev Postgres reachable in this session; runbook handed to a developer with DB access |
| B-n8n | Real n8n → `/api/reminders/due` → `/api/reminders/notify` → actual email delivery | Known-Gap | — pre-accepted, matches original `meeting-reminders` plan's own accepted known-gap | D |

gap-resolution legend: A — proven now (gate passes in this cycle) · B — fixed in this plan (gate added by this plan's checklist) · C — deferred to a named later phase/plan · D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: `strategy:` column above carries only Fully-Automated / Hybrid / Agent-Probe. Known-Gap rows (A-e2e, B-n8n) are named residuals via gap-resolution D, not a proving strategy.

**Vacuous-green check:** Phase A's blast radius (mapper join, schema validation, persistence, UI pre-fill) each carry at least one Fully-Automated/Hybrid/Agent-Probe gate — no developed behavior rests on Known-Gap alone. Phase B introduces no new developed behavior (verification-only); its AC1-3 proof path is Hybrid (gap-resolution C, environment-blocked with runbook, not a missing gate). Net gate is a legitimate PASS, not vacuously green.

Legacy line form (retained for existing consumers):
- Phase A organizer mapping/schema/persistence/UI: Fully-automated: `bun run test:unit:ci -- src/tests/leads.spec.ts src/tests/schemas.spec.ts` | Hybrid: `bun run test:unit:ci` + precondition `DATABASE_URL` + `db:push` | Agent-probe: manual create/edit pre-fill walkthrough | known-gap: e2e blocked on shared auth fixture (documented)
- Phase B reminder verification: Fully-automated: `bun run test:unit:ci -- src/tests/meeting-reminders.spec.ts` (confirmed 15/15 green) | Hybrid: `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts` + precondition `DATABASE_URL` + `db:push` (confirmed 9/9 self-skip, no DB in this env) | known-gap: n8n delivery (pre-accepted, documented)

#### Failing stubs (Fully-Automated rows only)

**A-mapper:**
```
test("should populate organizerId and organizerName on dbRowToLead when crmOrganizers row is present", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: dbRowToLead populates organizerId/organizerName from crmOrganizers join (present + absent cases)")
})
```

**A-schema:**
```
test("should accept valid leadOrganizerId uuid, accept null, reject malformed uuid", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: meetingFormSchema/meetingUpdateSchema leadOrganizerId validation")
})
```

**B-regression:** No stub — this is a pre-existing, already-green Fully-Automated gate (`src/tests/meeting-reminders.spec.ts`, 15/15 pass, confirmed live at VALIDATE). Phase B is verification-only with zero planned source edits; a red-first TDD stub does not apply to a gate that already proves passing, unmodified behavior. Do not create a duplicate/competing stub for this gate.

### Dimension findings

- Infra fit: PASS — single SvelteKit app, no container/port/worker surface touched by either phase. Migration-apply convention resolved to `bun run db:push` (see Open Items Resolved #1) and corrected in-plan.
- Test coverage: PASS (2 CONCERNs found, both fixed in-plan before this contract was written — see corrections above: Hybrid test count 8→9, journal-drift mischaracterization). Tier assignments (Fully-Automated/Hybrid/Agent-Probe/Known-Gap) are realistic and complete for both phases.
- Breaking changes: PASS — Phase A's schema column and Zod fields are additive/optional/backward-compatible; confirmed via direct `grep` that no existing call site reads `Lead.organizerId`/`organizerName` today (all other `organizerId`/`organizerName` matches in the codebase are the structurally distinct `crmMeetings.organizerId` → `crmUsers` concept), so populating the `Lead` fields is genuinely non-breaking. Phase B introduces no public contracts.
- Security surface: PASS — no auth/session/billing/secret surface touched. Conditional new `GET /api/organizers?q=` endpoint (only if built) is session-authed, read-only, minimal `{id, name}[]` response shape — consistent with the existing session-gated pattern (e.g. `src/routes/api/leads/[id]/organizer/+server.ts` requires `locals.user`).
- Section A feasibility (Phase A — organizer pre-fill): PASS (mechanically feasible; all named edit targets confirmed present and uniquely matchable via direct file reads — `crmMeetings.organizerId` at schema.ts:344 confirmed structurally distinct from the new `leadOrganizerId` column; no reusable organizer-search endpoint exists, confirming checklist step 11's conditional new-endpoint branch will be needed; highest-risk edit is the `dbRowToLead` join change in `src/lib/server/db/leads.ts` — 15+ existing call sites depend on this shared mapper, so the join must not change existing row shape; mitigation: prefer a targeted left-join, add both organizer-present and organizer-absent unit test cases (already in checklist step 12)).
- Section B feasibility (Phase B — reminder verification): PASS (verification-only, zero planned source edits; live-re-ran both the Fully-Automated suite — 15/15 pass — and the Hybrid suite — 9/9 correct self-skip — during this VALIDATE pass, confirming the plan's code-review claims empirically rather than by re-reading source alone; CAS pattern in `markMeetingReminderSent` re-confirmed via direct source read: `UPDATE ... WHERE isNull(sentCol) ... RETURNING`).

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Apply the Phase A migration with `bun run db:push` (NOT `db:migrate`) against the target dev DB. Inspect the generated SQL before applying — confirm it is a single additive `ALTER TABLE crm_meetings ADD COLUMN lead_organizer_id uuid REFERENCES crm_organizers(id) ON DELETE SET NULL;` with no other statements. | Phase A checklist step 4 |
| E2 | Do not close or mark resolved `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md` as part of this plan. Flag at UPDATE PROCESS that the VALIDATE pass re-confirmed the drift is still live (orphaned `0014_agreements_fields.sql`, unregistered in journal) so the backlog note can be corrected/kept-open by a human, not silently closed. | Phase B research reference; UPDATE PROCESS handoff |
| E3 | Phase B: if a dev Postgres becomes available during EXECUTE, run `docker compose up -d db && bun run db:push && bun run db:seed` then `bun run test:unit:ci -- src/tests/meeting-reminders-db.spec.ts`, expect **9/9 pass** (not 8). Record actual pass/fail count in the phase report. If it stays unavailable, hand off the runbook exactly as scoped — do not fabricate a passing result. | Phase B checklist steps 1-3, 7 |
| E4 | Phase A step 5 (`dbRowToLead` join): prefer adding the `crmOrganizers` left-join at the existing shared query builder point if the query structure allows it without changing existing row shape for the 15+ other call sites; if not cleanly possible, use a targeted follow-up lookup instead. Either way, add both organizer-present and organizer-absent unit test cases. | Phase A checklist step 5, 12 |
| E5 | Phase A and Phase B share no files and have no execution-order dependency — may run as two separate EXECUTE passes (sequential or parallel), in either order. | EXECUTE kickoff |

### Backlog Artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| (existing, not new) `drizzle-migration-journal-drift_02-07-26.md` | `process/general-plans/backlog/` | Re-confirmed still open at this VALIDATE pass (see E2) — needs a human correction pass, not a new artifact from this plan |
| (existing, not new) `e2e-auth-bootstrap_NOTE_01-07-26.md` | `process/features/auth/backlog/` | Shared Playwright auth-fixture gap — blocks A-e2e; no new note needed, already tracked |

Open gaps:
- A-e2e (full e2e flow): known-gap: documented as tracked in existing backlog — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md` (repo-wide, pre-existing, not new to this plan)
- B-hybrid (live-DB Hybrid run): known-gap: documented — no `DATABASE_URL`/reachable dev Postgres in this VALIDATE session; runbook handed off per E3; gap-resolution C (deferred, not D — the gate itself exists and is well-defined, only environment-blocked)
- B-n8n (external delivery proof): known-gap: documented as pre-accepted, matches original `meeting-reminders` plan's own accepted known-gap — out of scope for this plan

What this coverage does NOT prove:
- A-mapper/A-schema (Fully-Automated, not yet written): prove correct mapping/validation logic in isolation; do NOT prove the full UI pre-fill/override/clear round-trip (that is A-ui-prefill, Agent-Probe) or real-DB persistence (that is A-persist, Hybrid).
- A-persist (Hybrid): proves the DB column round-trip for organizer-present and organizer-absent cases; does NOT prove UI-level clear/override behavior, and is NOT run in CI (SKIP_DB).
- A-ui-prefill (Agent-Probe): proves a single manual/agent-driven walkthrough scenario; does NOT prove behavior across browsers, does NOT prove concurrent-edit conflicts, and is not automated/repeatable in CI.
- B-regression (Fully-Automated, confirmed green): proves DB-free due-query/CAS logic in isolation; does NOT itself prove AC1-3 against a real database (that requires B-hybrid).
- B-hybrid (Hybrid, environment-blocked in this session): when eventually run, proves day/hour window filtering + atomic no-duplicate guarantee against a real Postgres; does NOT prove behavior under production-scale concurrent load, and does NOT prove the external n8n scheduling/delivery path (that is B-n8n, known-gap).

Gate: PASS (no FAILs; 2 CONCERNs found were fixed directly in plan text before this contract was written — see "Two Corrections Applied Directly to Plan Text" above)
Accepted by: N/A — Gate is PASS; no CONDITIONAL concerns remain to accept (both CONCERNs found during V2/V3 were fixed directly in plan text, see corrections above).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/meeting-organizer-prefill-reminder-verify_06-07-26/meeting-organizer-prefill-reminder-verify_PLAN_06-07-26.md`
2. **Last completed phase or step:** VALIDATE complete, Gate: PASS (06-07-26). No EXECUTE has occurred for either Phase A or Phase B.
3. **Validate-contract status:** written — Gate: PASS (see `## Validate Contract` above). Two plan-text corrections applied in-plan during VALIDATE (Hybrid test count 8→9; journal-drift mischaracterization); both open items from the VALIDATE handoff resolved (migration command = `bun run db:push`; dev DB confirmed unavailable in this environment, known-gap+runbook path validated as adequate).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `process/features/reminders/active/meeting-reminders_01-07-26/meeting-reminders_PLAN_01-07-26.md` (+ its `_REPORT_`), `src/lib/server/db/schema.ts`, `src/lib/server/db/leads.ts`, `src/lib/zod/schemas.ts`, `src/routes/api/leads/[id]/organizer/+server.ts`, `drizzle/meta/_journal.json`, `src/tests/meeting-reminders-db.spec.ts`, `src/tests/meeting-reminders.spec.ts`.
5. **Next step for a fresh agent picking up mid-execution:** Run `ENTER EXECUTE MODE` against this plan. Phase A and Phase B may run in either order, or as two parallel execute passes, since they share no files (see Execute-Agent Instructions E5 in the Validate Contract). Follow E1-E4 for the specific corrections/conventions confirmed at VALIDATE.

---

## Autonomous Goal Block

SESSION GOAL: Ship GitHub issues — (A) pre-fill meeting organizer/contact from a lead's linked crm_organizers entity, and (B) verify meeting day/hour reminder delivery paths against a live DB (or hand off a runbook if unavailable).
Charter + umbrella plan: N/A — single plan (not a phase program).
Autonomy: Auto Mode active this session — proceed without pausing for clarifying questions on reversible decisions; stop only for genuinely blocked/irreversible calls.
Hard stop conditions / safety constraints:
- Do not conflate `crmMeetings.organizerId` (crm_users, internal) with the new `crmMeetings.leadOrganizerId` (crm_organizers) — they are distinct concepts.
- Do not hand-edit generated Drizzle SQL; inspect and confirm additive-only before applying.
- Do not run `db:migrate` for this dev-DB apply — use `bun run db:push` (see Execute-Agent Instruction E1).
- Do not close `drizzle-migration-journal-drift_02-07-26.md` as part of this plan — it is out of scope and still open (see E2).
- Do not fabricate a passing Hybrid test result for Phase B if no dev DB is reachable — hand off the runbook instead (see E3).
Next phase: EXECUTE — `process/general-plans/active/meeting-organizer-prefill-reminder-verify_06-07-26/meeting-organizer-prefill-reminder-verify_PLAN_06-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: fully-auto: `bun run check` + `bun run test:unit:ci -- src/tests/leads.spec.ts src/tests/schemas.spec.ts src/tests/meeting-reminders.spec.ts` | hybrid: `bun run db:push` (Phase A migration) then new persistence spec + `src/tests/meeting-reminders-db.spec.ts` (Phase B, precondition: `DATABASE_URL` + dev Postgres) | agent-probe: manual create/edit organizer pre-fill walkthrough (A-ui-prefill) | high-risk pack: no (additive schema, dev-only, no production data at risk)

---

**PHASE_COMPLETE: VALIDATE — validate-contract written. Proceed to EXECUTE.**
