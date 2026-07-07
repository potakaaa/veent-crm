---
name: plan:pipeline-optional-event-dates
description: 'Remove the client-side required-date guard on the New Lead form so leads/organizers can be created with no goLiveDate/eventDate — a one-file bug fix, not a schema/feature change.'
date: 07-07-26
metadata:
  node_type: memory
  type: plan
---

# Pipeline — Optional Event Dates - Plan

Date: 07-07-26
Status: ⏳ PLANNED
Complexity: Simple

## Overview

Spec asked for AEs to be able to attach an organizer/event to a pipeline lead before `goLiveDate`/
`eventDate` are confirmed. RESEARCH (already completed, findings folded into this plan) found the
schema, Zod validators, calendar queries, and the lead-edit form are **already fully optional** —
this is not a multi-surface feature. The only actual defect is in the **New Lead** creation form
(`src/routes/leads/new/+page.svelte`), which has a manual client-side JS guard that blocks
submission when no event date is picked, plus a cosmetic `required` prop on the date-picker field
that visually contradicts the (already-optional) underlying schema.

This plan is scoped as a single-file, QUICK-FIX-shaped correction, even though it originates from
a broader-sounding spec. No schema, Zod, calendar, or edit-form changes are needed — those were
verified during research as already satisfying the acceptance criteria.

## Quick Links

- [Goals and Success Metrics](#goals-and-success-metrics)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Research Findings (Already Satisfied vs Needs Fix)](#research-findings-already-satisfied-vs-needs-fix)
- [Assumptions and Constraints](#assumptions-and-constraints)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Risks and Mitigations](#risks-and-mitigations)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Phase Completion Rules](#phase-completion-rules)
- [Phase Loop Progress](#phase-loop-progress)
- [Validate Contract](#validate-contract)

## Goals and Success Metrics

**Goals:**

- A lead can be created with an organizer linked (via `?organizerId=` pre-fill or the post-create
  tag-via-organizer endpoint) but no `goLiveDate`/`eventDate`.
- The New Lead form no longer blocks submission when the event date is left blank.
- The visual "required" marker on the event-date field no longer contradicts the schema.

**Success Metrics:**

- `bun run check` and `bun run lint` both exit 0.
- No client-side guard forces an event date before lead creation.
- Existing already-optional surfaces (edit form, calendar, organizer-tag endpoint) remain
  unchanged and unbroken.

---

## Execution Brief

**IMPORTANT:** This is a SIMPLE (one-session) plan — implement continuously without approval
gates beyond the standard VALIDATE → EXECUTE gate. There is only one real phase here.

Before EXECUTE begins, vc-validate-agent must write the Validate Contract section. Do not start
EXECUTE with an empty placeholder.

### Phase 1: Remove the client-side required-date guard

**What happens:** In `src/routes/leads/new/+page.svelte`:

1. Delete the manual guard block (current lines 90–94) inside `create()`:

   ```ts
   if (!selectedDate) {
   	fieldErrors = { eventDateRaw: ['Event date is required.'] };
   	submitError = '';
   	return;
   }
   ```

   This guard runs BEFORE the Zod `safeParse()` call and is the only reason an undated lead
   currently cannot be created — `leadFormSchema.eventDateRaw` (schemas.ts L80) is already
   `z.string().optional()`.

2. On the `DatePickerField` instance for `eventDate` (current lines 283–291), remove the
   `required` prop (or explicitly pass `required={false}`, which is already the component
   default — either is acceptable, prefer just deleting the line since `false` is the default).
   Update the field `label` text if useful for clarity (e.g. keep `label="Event date"`, the
   component already renders `(optional)` automatically when `required` is falsy — see
   `DatePickerField.svelte` L60–66). No other prop changes needed.

That is the entire functional change. No other file needs to be touched.

### Test Gates

1. `bun run check` — TypeScript/Svelte check, exit 0 `[fully-automated]`
2. `bun run lint` — lint, exit 0 `[fully-automated]`
3. Manual/e2e: create a lead via `/leads/new` with no event date selected → succeeds, redirects
   to the new lead's detail page `[agent-probe / known-gap — see Verification section]`
4. Manual/e2e: create a lead via `/leads/new?organizerId=<uuid>` with no event date → lead is
   created with `organizerId` set and `eventDate`/`goLiveDate` null `[agent-probe / known-gap]`

(tier: fully-automated | hybrid | agent-probe — assigned per item above)

### Expected Outcome

- New Lead form accepts submission with the event date left blank.
- The visual asterisk next to "Event date" is gone (or replaced by "(optional)"), matching the
  schema's actual optionality.
- All other already-optional surfaces (edit form, calendar exclusion of undated leads, organizer
  tag endpoint) continue to work exactly as before — untouched.

---

## Scope

**In-Scope:**

- `src/routes/leads/new/+page.svelte` — remove the pre-Zod required-date guard; remove/adjust the
  cosmetic `required` prop on the `eventDate` `DatePickerField`.

**Out-of-Scope (confirmed already-satisfied by research — no touchpoint):**

- `src/lib/server/db/schema.ts` — `eventDate`, `goLiveDate`, `organizerId` are already nullable
  columns. No migration.
- `src/lib/zod/schemas.ts` — `leadFormSchema`, `leadUpdateSchema`, `onboardingUpdateSchema` are
  already fully optional on date fields, no required refine.
- `src/routes/leads/new/+page.server.ts`, `src/routes/api/leads/+server.ts` — no server-side date
  requirement exists today.
- `src/routes/leads/[id]/+page.svelte` (edit form) — already renders plain optional
  `<input type="date">` for `goLiveDate`/`eventDate`, no `required` attribute.
- `src/routes/api/leads/[id]/+server.ts` (PATCH) — already accepts blank/absent dates.
- `src/routes/api/leads/[id]/organizer/+server.ts` (post-create organizer tag endpoint) — already
  has zero date coupling.
- `src/lib/server/db/leads.ts` calendar queries (`getGoLiveDatesInRange`, `getEventDatesInRange`)
  — already gate on `isNotNull(...)`, so undated leads never produce a calendar milestone.

## Research Findings (Already Satisfied vs Needs Fix)

| Surface | Status | Evidence |
| --- | --- | --- |
| DB schema nullability | Already satisfied | `schema.ts` L169 (`eventDate`), L207 (`goLiveDate`), L182–184 (`organizerId`) all nullable |
| Create-form Zod (`leadFormSchema`) | Already satisfied | `schemas.ts` L80 `eventDateRaw: z.string().optional()` |
| Edit-form Zod (`leadUpdateSchema`) | Already satisfied | `schemas.ts` L109–113 (`eventDate`), L136–140 (`goLiveDate`), both `.optional().or(z.literal(''))` |
| Onboarding Zod (`onboardingUpdateSchema`) | Already satisfied | same optional pattern |
| Create-form client guard | **Needs fix (this plan)** | `leads/new/+page.svelte` L90–94, manual pre-Zod block |
| Create-form cosmetic marker | **Needs fix (this plan)** | `leads/new/+page.svelte` L283–291 `required` prop → renders red `*` in `DatePickerField.svelte` L60–66; not wired to native HTML validation, purely cosmetic, but visually contradicts the optional schema |
| Create-form server route (`+page.server.ts`, `api/leads/+server.ts`) | Already satisfied | no date requirement server-side; L69 already does `eventDateRaw: data.eventDateRaw \|\| undefined` |
| Edit form (`leads/[id]/+page.svelte`) | Already satisfied | plain `<input type="date">`, no `required` attr, L610–638 |
| PATCH endpoint (`api/leads/[id]/+server.ts`) | Already satisfied | no date requirement, L49/50/65 |
| Post-create organizer tag endpoint (`api/leads/[id]/organizer/+server.ts`) | Already satisfied | zero date coupling |
| Calendar go-live milestones (`getGoLiveDatesInRange`) | Already satisfied | `buildGoLiveRangeConditions()` L1526–1532 includes `isNotNull(crmLeads.goLiveDate)` (L1530) |
| Calendar event milestones (`getEventDatesInRange`) | Already satisfied | `isNotNull(crmLeads.eventDate)` (L1616), function at L1648+ |
| "Event" concept mapping | Confirmed, no ambiguity | No separate "event" table — `eventName`/`eventDate`/`eventDateRaw`/`eventLink` are columns on `crm_leads`; `organizerId` is an optional FK to `crm_organizers`; `goLiveDate` is a separate post-won onboarding field |

## Assumptions and Constraints

**Assumptions:**

- The `DatePickerField` component's `required` prop is purely cosmetic (asterisk vs. "(optional)"
  label) and carries no native HTML `required` enforcement — confirmed by reading
  `DatePickerField.svelte` L24–48 and L59–67; there is no `required` attribute anywhere in the
  rendered `Dialog.Trigger` button markup.
- Removing the prop/guard does not need a corresponding change to `firstAnnouncedDate` or
  `firstReachedOutDate` — those `DatePickerField` instances (L293–305) never passed `required` and
  are already optional; out of scope.

**Constraints:**

- Single-file change, no schema/migration/API-contract change — this plan intentionally stays
  narrow per research findings, not because acceptance criteria were descoped.
- Do not touch the two unrelated active pipeline plans already in this feature folder
  (`pipeline-search-filter_07-07-26`, `pipeline-ae-filter-color_07-07-26`,
  `pipeline-search-server-reach_07-07-26`).

## Acceptance Criteria

Copied verbatim from the spec, each annotated with how it is satisfied:

- [ ] **Lead can be saved with organizer linked but no `goLiveDate` or `eventDate`** — Satisfied
  by this fix. Covers both linking paths: (a) create-time pre-fill via `?organizerId=` query param
  (`leads/new/+page.svelte` L31–34, `prefillOrganizerId`, enforced server-side in
  `api/leads/+server.ts` L53–56) with no date — unblocked once the L90–94 guard is removed; (b)
  post-create tag-via-organizer flow (`api/leads/[id]/organizer/+server.ts`) — already has zero
  date coupling, verified as already-satisfied, no change needed.
- [ ] **No validation error when dates are blank on the lead edit form** — Already satisfied,
  verified during research. `leads/[id]/+page.svelte` L610–638 and `leadUpdateSchema` (`schemas.ts`
  L109–113, L136–140) already treat `eventDate`/`goLiveDate` as optional. No touchpoint in this
  plan.
- [ ] **Calendar does not show a milestone entry for a lead with no date** — Already satisfied,
  verified during research. `getGoLiveDatesInRange`/`getEventDatesInRange` in
  `src/lib/server/db/leads.ts` already filter with `isNotNull(...)`. No touchpoint in this plan.
- [ ] **Dates can be added later via the lead edit form** — Already satisfied, verified during
  research. Edit form + PATCH endpoint (`api/leads/[id]/+server.ts`) already accept setting
  `eventDate`/`goLiveDate` on an existing lead with no coupling to creation-time state. No
  touchpoint in this plan.
- [ ] **`bun run check` + `bun run lint` exit 0** — Covered by this fix's test gates (see
  Verification / Test Plan below). Fully-automated.

## Implementation Checklist

1. Open `src/routes/leads/new/+page.svelte`.
2. Delete the guard block currently at lines 90–94 inside `create()` (the `if (!selectedDate) { … return; }` block that runs before `leadFormSchema.safeParse(...)`).
3. On the `eventDate` `DatePickerField` instance currently at lines 283–291, remove the `required`
   prop line so the field falls back to the component's default `required = false` (renders
   "(optional)" instead of the red asterisk). Leave `id`, `label`, `title`, `bind:value`,
   `fullWidth`, and `errors` untouched.
4. Re-read the surrounding `create()` function to confirm no other reference to the removed guard
   remains (e.g. no leftover comment implying a required date), and that `fieldErrors.eventDateRaw`
   is still correctly populated by Zod's `flatten().fieldErrors` on validation failure for
   malformed (not just missing) values.
5. Run `bun run check` and `bun run lint`; fix any incidental issues surfaced (none expected —
   this is a pure deletion).
6. Manually verify (or note as known-gap per below) that submitting the New Lead form with no
   event date now succeeds.

## Risks and Mitigations

**Risk 1:** Removing the guard silently breaks some downstream assumption that `eventDateRaw` is
always present (e.g. a sort/display path that assumes a date exists).
- **Mitigation:** Research already confirmed the calendar queries and lead-list/detail rendering
  paths are null-safe (`isNotNull` filters exclude undated leads from calendar views; no other
  surface was found assuming a non-null `eventDate` at read time). If EXECUTE turns up a
  contradicting read-path assumption, treat it as a `CONTEXT_PARTIAL` finding and flag for
  follow-up rather than expanding this plan's scope silently.

**Risk 2:** Removing the `required` prop changes visual layout (asterisk vs. "(optional)" text
width).
- **Mitigation:** Low risk, cosmetic only, consistent with how every other field on this form
  already renders "(optional)" (e.g. `category`, `platform`, `location` labels use the same
  pattern at L215/224/234). No layout special-casing needed.

## Touchpoints

- `src/routes/leads/new/+page.svelte` — the ONLY file this plan modifies. Two edits: delete the
  L90–94 required-date guard inside `create()`; remove the `required` prop from the `eventDate`
  `DatePickerField` instance at L283–291.

## Public Contracts

None. No API route, Zod schema, DB schema, or exported function signature changes. The Zod
`leadFormSchema` (`src/lib/zod/schemas.ts`) and the `POST /api/leads` request/response contract are
unchanged — `eventDateRaw` was already optional there; this plan only removes a client-side guard
that pre-empted the already-optional server contract.

## Blast Radius

_List the files, packages, and runtime surfaces this plan touches. Update before EXECUTE begins._

- `src/routes/leads/new/+page.svelte` — remove the pre-Zod required-date guard (L90–94) and the
  cosmetic `required` prop on the `eventDate` `DatePickerField` (L283–291). This is the ONLY file
  modified by this plan.

No schema, migration, Zod, API route, or calendar-query changes. No new dependencies.

## Verification Evidence / Test Plan

| Acceptance criterion | Verification method |
| --- | --- |
| Lead can be saved with organizer linked but no `goLiveDate`/`eventDate` | Covered by this fix — `bun run check`/`bun run lint` (fully-automated) confirm no type/lint regressions; full DOM/browser submission flow is an **agent-probe / known-gap** (see below), pre-accepted per repo convention, since the New Lead form's client interaction can't be exercised by Vitest (node-only, no jsdom) and e2e is blocked on the shared Playwright auth fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`, referenced by every other pipeline plan in this feature folder). |
| No validation error when dates are blank on the lead edit form | Already-satisfied — verified by reading `leads/[id]/+page.svelte` + `leadUpdateSchema` during research; no code path changed, no new test needed. |
| Calendar does not show a milestone entry for a lead with no date | Already-satisfied — verified by reading `getGoLiveDatesInRange`/`getEventDatesInRange` during research (existing `isNotNull` filters, unchanged by this plan); no new test needed. |
| Dates can be added later via the lead edit form | Already-satisfied — verified by reading the edit form + PATCH endpoint during research; no code path changed, no new test needed. |
| `bun run check` + `bun run lint` exit 0 | Fully-automated — run both commands post-edit, must exit 0. |

**Known-gap (pre-accepted):** DOM-level / browser verification of the New Lead form's submit flow
(both the plain no-date case and the `?organizerId=`-prefilled no-date case) cannot run under
Vitest (node-only, no jsdom in this repo) and e2e is blocked on the shared Playwright
authenticated-session fixture — the same repo-wide known-gap already recorded for every other
active pipeline plan (`pipeline-search-filter_07-07-26`, `pipeline-ae-filter-color_07-07-26`,
`pipeline-search-server-reach_07-07-26`) and tracked centrally in
`process/context/all-context.md` §Current Project State. This plan does not attempt to solve that
infra gap; it inherits the existing pre-acceptance.

## Resume and Execution Handoff

- Selected plan file: this file
  (`process/features/pipeline/active/pipeline-optional-event-dates_07-07-26/pipeline-optional-event-dates_PLAN_07-07-26.md`).
- Next step: `ENTER VALIDATE MODE` for this plan (single-file, well under the 15-line/no-surface
  trivial-fix threshold in raw diff size, but VALIDATE is still recommended per orchestration.md
  default auto-suggestion — the change touches a form users rely on for lead creation, so a quick
  V1-only pass is worthwhile even if it fast-exits).
- If VALIDATE is skipped, document the skip reason inline in this plan before EXECUTE.
- EXECUTE should modify exactly one file: `src/routes/leads/new/+page.svelte`. No other file
  should be touched under this plan.
- Do not confuse this plan with the other 3 active pipeline plans in this feature folder — they
  are unrelated (search filter, server-reach search follow-up, AE color/manager filter).

## Phase Completion Rules

- This plan has exactly one implementation phase (Phase 1 above). It is complete when both
  edits in Touchpoints are applied and both test gates (`bun run check`, `bun run lint`) exit 0.
- VALIDATE must write a real (non-placeholder) Validate Contract before EXECUTE starts — see
  `process/development-protocols/orchestration.md` §VALIDATE Gate.
- Refer to `process/context/all-context.md` (root context router) and
  `process/context/tests/all-tests.md` (test runner/verification guide) before EXECUTE and
  vc-tester runs — both are the standard context passed per orchestration.md §Gather Context for
  Execute and Tester.
- EXECUTE is done only when both checklist edits are applied AND `bun run check` + `bun run lint`
  both exit 0 (Post-Phase Testing gate — no manual test procedure beyond the pre-accepted
  DOM/e2e known-gap noted above).

## Phase Loop Progress

- [ ] 1a. Research updated — context and codebase scan complete (done in RESEARCH prior to this
      PLAN pass; findings folded in above, no re-research needed)
- [ ] 1b. Plan supplemented — checklist reflects research findings (n/a — research clean, folded
      directly into this plan)
- [x] 2. Validate contract written — vc-validate-agent gate verdict is green (Gate: PASS, 07-07-26)
- [ ] 3. Execute complete — all checklist items done, tests pass
- [ ] 4. Update process — plan archived, context docs updated, memory notes written
- [ ] 5. Report written — execute report filed inside this task folder

> **IMPORTANT:** Step 2 is never skippable. A placeholder Validate Contract is a blocker — do not
> proceed to step 3 until a vc-validate-agent gate verdict is present.

## Validate Contract

> **Calibration note:** blast radius is a single file, no schema/auth/API/billing surface — this
> plan is VALIDATE-skip-eligible under `orchestration.md` §VALIDATE Gate skip conditions. The user
> explicitly requested VALIDATE mode, so the full sequence ran below, but Layer 1/Layer 2 fan-out
> was run as a single lightweight pass (no parallel agent spawn) proportional to plan size.

**What V1-V3 did:**
- **V1 (pre-check):** Plan file structurally complete — touchpoints, blast radius, acceptance
  criteria, verification plan, resume/handoff, and phase-loop-progress all present. Blast radius
  is 1 file, 0 packages beyond the app itself. Signal score: 0/7 (no schema/auth/API/billing
  surface, single file, no multi-phase, no user-requested depth beyond the standard gate).
- **V2 (fan-out, lightweight):** Ran the 4 Layer 1 dimensions inline (infra fit, test coverage,
  breaking changes, security) plus 1 Layer 2 pass over the plan's single implementation section.
  Additionally re-verified — against the live repo, not just the plan's claims — every "already
  satisfied, no touchpoint" claim: `leadFormSchema`/`leadUpdateSchema`/`onboardingUpdateSchema` in
  `src/lib/zod/schemas.ts`, the `isNotNull` calendar-range guards in `src/lib/server/db/leads.ts`,
  the edit form (`src/routes/leads/[id]/+page.svelte`), the PATCH endpoint
  (`src/routes/api/leads/[id]/+server.ts`), the create POST endpoint (`src/routes/api/leads/+server.ts`),
  and the organizer-tag endpoint (`src/routes/api/leads/[id]/organizer/+server.ts`) — specifically
  hunting for any required-date check the plan might have missed (native HTML `required` attrs,
  server-side action checks, or endpoint-level validation).
- **V3 (synthesis):** 0 FAILs, 0 CONCERNs, all PASS. No plan fixes needed.

### I. Validation Findings → Net Gate

**Layer 1 — Dimension Findings**

**Infra / Setup Fit**

| Finding | Severity | Proposed fix |
|---|---|---|
| Touchpoint file `src/routes/leads/new/+page.svelte` exists; guard block at L90-94 matches plan verbatim (confirmed by direct read of the live file just now) | ✅ PASS | — |
| `DatePickerField` instance for `eventDate` at L283-291 matches plan verbatim, `required` prop present exactly as described | ✅ PASS | — |
| No new dependency, route, service, or runtime surface introduced | ✅ PASS | — |

**Test Coverage**

| Finding | Severity | Proposed fix |
|---|---|---|
| `bun run check` and `bun run lint` are real package.json scripts (`svelte-kit sync && svelte-check ...` / `prettier --check . && eslint .`) — plan's fully-automated gates are real and runnable | ✅ PASS | — |
| DOM/browser submission flow cannot be exercised by Vitest (no jsdom in this repo) and e2e is blocked on the repo-wide missing Playwright auth fixture | ✅ PASS (pre-accepted known-gap, consistent with every other active pipeline plan in this feature folder) | — |

**Breaking Changes**

| Finding | Severity | Proposed fix |
|---|---|---|
| No API route, Zod schema, DB schema, or exported function signature changes — `leadFormSchema.eventDateRaw` was already `z.string().optional()` before this plan; only a client-side pre-Zod guard and a cosmetic prop are removed | ✅ PASS | — |
| No downstream consumers depend on the removed guard (guard only threw a local field error, never called an API or emitted an event) | ✅ PASS | — |

**Security Surface**

| Finding | Severity | Proposed fix |
|---|---|---|
| No auth, billing, secrets, or trust-boundary surface touched | ✅ PASS | — |
| Removing a client-only validation guard does not create a server-side gap — confirmed the POST `/api/leads` handler and Zod schema already accepted undated leads before this change; this is a UX-only fix, not a validation-bypass | ✅ PASS | — |

**Layer 2 — Per-Section Feasibility**

**Section A — Phase 1: Remove the client-side required-date guard**

| Question | Verdict | Detail |
|---|---|---|
| Mechanical feasibility | PASS | Both edit targets (guard block L90-94, `DatePickerField` `required` prop at L283-291) are present and uniquely matchable in the live file, confirmed by direct read during this VALIDATE pass — line numbers in the plan are accurate against current repo state. |
| Plan gaps | PASS — none found | Re-checked every "already satisfied" claim independently rather than trusting the plan's own research summary: `schemas.ts` (leadFormSchema L80, leadUpdateSchema L109-113/L136-140, onboardingUpdateSchema L166-175) — all optional, no `.min(1)`/required refine on date fields. `leads/[id]/+page.svelte` — `grep -n "required"` on the file returned zero matches (no native `required` attribute anywhere). `api/leads/+server.ts`, `api/leads/[id]/+server.ts` — no date-presence check found; both use `data.eventDate \|\| undefined` / `\|\| null` fallback patterns, never a required-guard. `api/leads/[id]/organizer/+server.ts` — read in full; zero date coupling of any kind (only validates organizer existence + permission). `leads.ts` calendar functions — `buildGoLiveRangeConditions()` (L1526) and the `eventDate` range builder (L1616) both confirmed to include `isNotNull(...)` guards; a third `isNotNull(crmLeads.eventDate)` guard also found at L2038 (an additional call site not named in the plan, but it only reinforces the same already-satisfied conclusion — not a gap). |
| Conflicts | PASS — none found | No contradiction with other active pipeline plans in this feature folder (`pipeline-search-filter_07-07-26`, `pipeline-ae-filter-color_07-07-26`, `pipeline-search-server-reach_07-07-26`) — none of them touch `leads/new/+page.svelte`. |
| Highest-risk edit | Deleting the L90-94 guard block. Mitigation: the block is a simple early-return with no side effects to unwind: risk is fully bounded to "did we leave a dangling reference to `selectedDate` elsewhere assuming non-null" — re-read confirms `eventDateDisplay` (L77) already handles `selectedDate` being `undefined` via its ternary (`selectedDate ? formatEventDate(selectedDate) : ''`), so no follow-up fix is needed. |

Proposed fixes for this section: none — plan is accurate as written, no plan-text changes required.

### Net Gate Derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| Section A — Remove client-side required-date guard | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 5 PASSes**

**→ Net Gate: PASS**

All plan claims independently re-verified against live repo state. No plan fixes needed, no execute-agent instructions beyond following the existing checklist, no new known-gaps beyond the one already documented in the plan (DOM/e2e verification, pre-accepted repo-wide gap).

### II. Execution Strategy

**Signal Score: 0/7**

| Signal | Present |
|---|---|
| S1: Multi-package scope (3+ workspace packages) | — |
| S2: Schema/API/auth surface touched | — |
| S3: 3+ viable directions surfaced in INNOVATE | — |
| S4: Phase program classification (3+ phases) | — |
| S5: User requested depth explicitly | — |
| S6: High-risk class in blast radius | — |
| S7: 5+ files in blast radius | — |

Score: **0 → threshold: sequential**

**Recommendation: Sequential — 1 agent.** Single-file, single-phase, mechanical deletion. No independent workstreams to parallelize; a single `vc-execute-agent` invocation is strictly correct here — spawning parallel or team agents for a 2-edit single-file plan would be pure overhead.

### III. Test Coverage Plan

**Area: `src/routes/leads/new/+page.svelte` — New Lead form**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Type/Svelte-check passes after edit | `bun run check` exits 0 | No TS/Svelte type regressions from the two deletions | Does not exercise the actual browser submit flow |
| Fully-automated | Lint passes after edit | `bun run lint` exits 0 | No formatting/lint regressions | Same as above |
| Agent-probe / known-gap | Submit New Lead form with no event date selected → succeeds, redirects to lead detail | Manual browser walkthrough (or e2e once auth fixture exists): fill required fields, leave event date blank, click Create, confirm redirect to `/leads/{id}` with `eventDate` null | That the guard removal actually unblocks submission end-to-end in a real browser | Automated regression coverage — currently no automated path exists (no jsdom, e2e blocked) |
| Agent-probe / known-gap | Submit `/leads/new?organizerId=<uuid>` with no event date → lead created with `organizerId` set, dates null | Manual browser walkthrough (or e2e once auth fixture exists) | Combined organizer-prefill + no-date path works | Same infra gap as above |

Gaps and resolution options:

| Gap | Resolution options |
|---|---|
| DOM/browser submission flow (both scenarios above) cannot run under Vitest or Playwright today | A) Write new Playwright spec — blocked until shared auth fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). B) N/A — no lower-effort automated option exists in this repo today. **C) Accept as known-gap — this is the repo-wide, already-accepted e2e blocker shared by every other active plan in this feature folder; re-litigating it per-plan adds no value.** D) No new backlog artifact needed — already tracked centrally in `process/context/all-context.md` §Current Project State and the auth backlog note. |

**High-risk class areas:** none. This plan touches no auth, billing, migration, public-API-contract, deploy/runtime, or secret/trust-boundary surface — the high-risk-class table is intentionally omitted (N/A).

**Missing test areas (no coverage possible at any tier within this plan's scope):** none beyond the known-gap above, which is fully documented with its resolution.

### IV. Proposed Plan Updates

None. No plan-text fixes were required — every claim in the plan (touchpoints, already-satisfied surfaces, line numbers) was independently re-verified against the live repo and confirmed accurate.

**Execute-agent instructions:**

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Confirm the guard block and `DatePickerField` prop are still at the stated line numbers immediately before editing (line numbers can drift between VALIDATE and EXECUTE if other work lands on this file in between) — if they've moved, update the edit target by content match, do not skip the edit. | Before Phase 1 edits |
| E2 | Do not touch any file listed in Out-of-Scope — they are confirmed already-satisfied; touching them would expand blast radius beyond this plan's approved scope. | Throughout EXECUTE |

**Backlog artifacts:** none new — the only known-gap (DOM/e2e verification) is already tracked centrally; no per-plan backlog note needed.

### V. User Decision (V5 Gate)

Given orchestrator-issued instruction to run full VALIDATE at proportional depth: **A — Accept.** Gate: PASS. No plan fixes to apply (none were needed). Proceeding to EXECUTE per the plan's own Resume and Execution Handoff section.

---

Status: PASS
Date: 2026-07-07
Gate: PASS — no FAILs, no CONCERNs, all plan claims independently re-verified against live repo state.
generated-by: outer-pvl
date: 2026-07-07

### Parallel strategy
Choice: sequential
Signals: 0/7 — dominant: none (trivial single-file scope)
Agent count: 1 (single vc-execute-agent invocation)

### Plan updates applied
- [x] None required — plan verified accurate as written; no plan-text changes made.

### Execute-agent instructions
- Before Phase 1 edits: reconfirm guard block (create-form pre-Zod required-date check) and `DatePickerField` `required` prop are at the stated locations by content match (not just line number) in case line numbers drifted since VALIDATE.
- Throughout EXECUTE: do not touch any Out-of-Scope file (schema.ts, schemas.ts, +page.server.ts, api/leads/+server.ts, leads/[id]/+page.svelte, api/leads/[id]/+server.ts, api/leads/[id]/organizer/+server.ts, leads.ts calendar queries) — all confirmed already-satisfied during this VALIDATE pass.

### Test gates (run after the section; regression suite after)

**`src/routes/leads/new/+page.svelte` — New Lead form**
- fully-automated: `bun run check` exits 0
  Proves: no TS/Svelte type regressions
- fully-automated: `bun run lint` exits 0
  Proves: no formatting/lint regressions
- agent-probe / known-gap: manual browser walkthrough of both no-date submission scenarios (plain + `?organizerId=` prefill) — resolution: accepted as known-gap, pre-existing repo-wide e2e-auth-fixture blocker, tracked in `process/context/all-context.md` §Current Project State and `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

**Regression suite (after section complete)**
- `bun run check` exits 0
- `bun run lint` exits 0

### High-risk pack
Required: no

### Backlog artifacts to create during durable capture
- None — known-gap already tracked centrally; no new artifact needed.

### Known gaps on record
- DOM/browser submission flow verification (both no-date scenarios) — pre-accepted, repo-wide shared Playwright auth-fixture blocker, same as every other active pipeline plan in this feature folder.

### Accepted by
session (orchestrator-issued VALIDATE run, 2026-07-07) — known-gap accepted per repo-wide precedent already established across `pipeline-search-filter_07-07-26`, `pipeline-ae-filter-color_07-07-26`, and `pipeline-search-server-reach_07-07-26`.
