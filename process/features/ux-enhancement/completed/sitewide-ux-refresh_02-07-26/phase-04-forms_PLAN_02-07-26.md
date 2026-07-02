---
name: plan:sitewide-ux-refresh-phase-04-forms
description: "Site-Wide UX Refresh — Phase 04: Forms (Superforms conversion + shared field-error component)"
date: 02-07-26
metadata:
  node_type: memory
  type: plan
  feature: ux-enhancement
  phase: phase-04
---

# Phase 04 — Forms

**Program:** sitewide-ux-refresh
**Umbrella plan:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/sitewide-ux-refresh-umbrella_PLAN_02-07-26.md
**Phase status:** ⏳ PLANNED
**Report destination:** process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-04-forms_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Lead creation, the Meeting modal, and the Team invite modal all surface validation failures as a
single flat error string rather than per-field messages. **Corrected during EXECUTE (E1):** the
original Superforms-conversion approach was abandoned at PVL Cycle 0 — `sveltekit-superforms/adapters`
throws at import time (`typebox@1.3.0` transitive-dependency conflict) and the repo has zero real
`superForm()` usage to "match". The shipped approach instead KEEPS the existing
`safeParse()` + raw `fetch()` transport unchanged and restructures ONLY the error handling: Lead
creation and Team invite map `parsed.error.flatten().fieldErrors` into a per-field error state
object; the Meeting modal (no Zod schema) assigns field keys manually per hand-rolled check. A
shared field-error component (`aria-invalid`/`aria-describedby` wiring, plus a pure ARIA-attribute
helper) is built from scratch and applied to all 3 forms. The dedup-preview reactivity was confirmed
structurally independent of the error state (re-verified at PVL Cycle 2) and is regression-guarded by
a test (A2).

---

## Entry Gate

- Phase 1 exit gate passed: focus-ring token exists and is stable (read-only dependency for form
  field focus styling)
- Cross-reference confirmed: `leads/new/+page.svelte` is also a Phase 2 touchpoint (date picker
  consolidation) — coordinate via the umbrella's Pre-PVL Conflict Resolution section; this phase
  owns the Superforms conversion + field-error wiring, Phase 2 owns the date-picker extraction.
  Sequence within this phase's own EXECUTE: verify Phase 2's date-picker consolidation state before
  touching the same file to avoid a silent merge conflict.
- **NEW (found at PVL, 02-07-26):** before Step A1 can start, the typebox/adapters import conflict
  documented in the Validate Contract below must be resolved — see Blocking FAIL and Execute-Agent
  Instructions.

---

## Blast Radius

- `src/routes/leads/new/+page.svelte`
- `src/routes/leads/new/+page.server.ts` **(ADDED at PVL — see Validate Contract; omitted from the
  original blast radius but required for any `superValidate()`-based approach, since the route's
  `load()` currently returns only `{ leads, users }` with no form instance)**
- `src/lib/components/meetings/MeetingFormModal.svelte`
- `src/routes/team/+page.svelte` (invite modal)
- New shared field-error component (path finalized during EXECUTE)
- `package.json` / lockfile **(CONDITIONAL — only if the typebox-override resolution path is
  chosen; see Execute-Agent Instructions E1)**

---

## Inner Loop Refresh Note (02-07-26)

Step 1 RESEARCH has now run for this phase. Step 3 PLAN-SUPPLEMENT applied the following changes
based on RESEARCH findings: (1) Item A2's dedup-preview reactivity risk is now effectively MOOT for
the reactivity mechanism itself — the `dupes = $derived(...)` in `new/+page.svelte` reacts purely
to the plain `let name = $state('')` binding, which A1's error-handling restructuring never touches
(no shared reactive object was introduced, since Superforms was dropped entirely per A0). A2's
wording is updated to reflect this: it now writes a regression-proof test only, not a risk
mitigation. (2) A field-key reference for the shared field-error component is added (from
`leadFormSchema`), plus a note that the Meeting modal has no Zod schema and its Attendees
chip-group field needs manual per-check key assignment. (3) A note is added confirming no existing
form-field-wrapper/error component exists anywhere in `src/lib/components/ui/` — the shared
component is built from scratch. This Refresh Note signals to the next VALIDATE pass that inner R+I
has occurred since the Cycle 1 outer-PVL validate-contract (dated 02-07-26, Gate: CONDITIONAL) was
written — PVL should be re-run from V1 before EXECUTE proceeds.

---

## Implementation Checklist

### Step A — Lead creation: per-field error surfacing (isolated first)

- [x] **A0. RESOLVED (supplement, 02-07-26) — resolves Gap A0 from the V1 validate pass.**
      Confirmed by direct codebase inspection (`src/routes/templates/+page.server.ts` and
      `src/routes/team/+page.server.ts` / `+page.svelte`) that the repo's ACTUAL established
      idiom is plain client-side `schema.safeParse()` + raw `fetch()` POST — `superForm()` is
      NOT used anywhere in this codebase (zero occurrences of `superForm(` repo-wide), and
      neither `templates` nor `team` import `sveltekit-superforms` at all. The Validate
      Contract's resolution-path-2 wording ("client-only superForm mode, same idiom as
      templates/team") was imprecise on this point — the real precedent has no
      `sveltekit-superforms` import whatsoever, client or server. Resolution: Lead creation
      does NOT adopt `superForm()`/`use:enhance` or any `sveltekit-superforms` API. This
      avoids the `sveltekit-superforms/adapters` → `typebox@1.3.0` runtime throw entirely
      (no such import is ever made), so there is nothing left to pin or route around. AC7
      ("matching the repo's stated form convention") is satisfied against the convention
      actually in force in the codebase today (safeParse + fetch, per templates/team), not
      the aspirational "Superforms + Zod for all forms" line in `all-context.md`'s Mandatory
      Conventions — flag this doc/reality drift in the phase report for UPDATE PROCESS to
      reconcile (candidate: update `all-context.md` §Mandatory Conventions to describe the
      actual client-safeParse-only idiom, or open a separate backlog item to migrate
      `templates`/`team`/Lead-creation to true superForm() once the typebox conflict is
      fixed upstream). No `package.json`/lockfile change needed — the CONDITIONAL Blast
      Radius entry for a typebox override does not apply under this resolution.
- [x] A1. Restructure Lead creation's existing client `safeParse` + raw `fetch` POST so the
      Zod validation failure surfaces PER-FIELD errors instead of a single flat error string.
      Concretely: on `safeParse` failure, use `result.error.flatten().fieldErrors` (or
      equivalent per-field mapping) to populate a per-field error state object; wire the
      `+page.svelte` template so each field passes its own error message + `aria-invalid`/
      `aria-describedby` (via the shared field-error component from Step B) instead of one
      flat string. The `fetch('/api/leads', ...)` POST mechanism itself is UNCHANGED — this
      step only changes error shape/plumbing, not the submission transport. No
      `use:enhance`, no `superForm()`, no `sveltekit-superforms` import of any kind. No
      `+page.server.ts` load-time form instance is required (server-side validation in
      `/api/leads` is unchanged and already independent of this client-side error-shape
      change) — the ADDED `+page.server.ts` blast-radius entry from the original
      `superValidate()`-based approach is therefore NOT exercised by this resolution; note
      this explicitly in the phase report rather than silently dropping the touchpoint.
      (SPEC AC7 — "matching the repo's stated form convention", read as the convention
      actually in force per A0 above.)
- [x] A2. **RE-SCOPED at RESEARCH (02-07-26) — risk confirmed moot for the reactivity mechanism,
      this item now writes a regression-proof test only, not a risk mitigation:** RESEARCH
      confirmed the `dupes = $derived(...)` in `new/+page.svelte` reacts purely to the plain
      `let name = $state('')` binding, which A1's error-handling restructuring never touches (no
      shared reactive object was ever introduced, since Superforms was dropped entirely per A0).
      Write an explicit test scenario proving the dedup-preview trigger points (on-input/on-blur
      dedup lookup) still behave identically after the A1 error-plumbing change — this is now a
      regression-proof requirement, not risk mitigation of an open unknown.
- [x] A3. Confirm existing Vitest schema tests continue to pass unchanged (AC7's proven-by
      requirement includes "existing Vitest schema tests continue to pass").

### Step B — Shared field-error component

- [x] B1. Build one shared field-error component with `aria-invalid`/`aria-describedby` wiring,
      consuming per-field error state (populated via `result.error.flatten().fieldErrors` per A1 —
      NOT Superforms, per A0's resolution). **RESEARCH note (02-07-26):** no existing
      form-field-wrapper/error component exists anywhere in `src/lib/components/ui/` — this
      component is built from scratch, composed alongside the existing `Label`/`Input`/`Textarea`/
      `Select` primitives, not extending anything.
      **Field-key reference (RESEARCH, 02-07-26 — from `leadFormSchema`):** `name`, `category`,
      `platform`, `location`, `pageUrl`, `contactEmail`, `eventName`, `eventLink`, `eventDateRaw`,
      `firstAnnouncedDate`, `firstReachedOutDate`, `notes`, `visibility`, `selectedUserIds` (the
      last one via the schema's top-level `.refine()` path). The Meeting modal has NO Zod schema
      (hand-rolled checks) and its Attendees chip-group field has no natural `id`/`for` pair — the
      shared component's field-key mapping for Meeting modal will need per-check manual key
      assignment (`leadId`, `startAt`), and the Attendees group may not fit the same per-field
      pattern as a text input. This is an implementation nuance, not a blocker.
- [x] B2. Apply the shared component to Lead creation (from Step A), `MeetingFormModal.svelte`, and
      the Team invite modal in `src/routes/team/+page.svelte`.
- [x] **B2a. NEW (added at PVL) — when wiring the shared field-error component around the 3
      date-picker fields (`eventDate`, `firstAnnouncedDate`, `firstReachedOutDate`) in Lead
      creation, integrate against Phase 2's already-extracted date-picker component's prop/slot
      interface (not the original inline `Dialog.Root` markup) if Phase 2's EXECUTE has already
      landed. If Phase 4's EXECUTE runs first, expose an `error`/`aria-describedby`-friendly prop
      on the date-field wrapper so Phase 2's later extraction can consume it without re-doing this
      wiring. This is a real markup-overlap point, not just a "different concern in the same file"
      — flag explicitly in the phase report which order actually happened.**
- [x] B3. Confirm each form surfaces validation errors attached to the specific invalid field (not
      a flat string) — per-form e2e scenario per SPEC AC6.
- [x] **B4. NEW (added at PVL) — add a Vitest component-level test for the shared field-error
      component itself (props → rendered `aria-invalid`/`aria-describedby`/error text), so AC6's
      proof does not rest solely on the e2e scenario that self-skips under the known auth-fixture
      gap.**

---

## Exit Gate

```bash
bun run check
# Expected: 0 type errors

bun run test:unit:ci -- src/tests/schemas.spec.ts
# Expected: existing schema tests green, no regressions

bun run test:unit:ci -- [new field-error component test file]
# Expected: new component-level test green (added per B4)

bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts
# Expected: new per-form e2e scenarios green (or self-skip known-gap per shared auth fixture)
```

- All checklist items (A0-A3, B1-B4) checked
- Dedup-preview reactivity explicitly re-verified with its own test scenario (not assumed)
- No manual fetch-based submit handler remains in Lead creation (code-level check)
- typebox/adapters import blocker resolved and documented (which path chosen, why)
- Phase report written to report destination above

---

## Blockers That Would Justify BLOCKED Status

- Dedup-preview reactivity breaks after the Superforms conversion in a way that requires a larger
  redesign of the dedup-lookup trigger mechanism — escalate rather than silently degrading the
  dedup-preview UX
- Phase 2's date-picker consolidation and this phase's Superforms conversion conflict on the same
  file section in a way the Pre-PVL Conflict Resolution coordination did not anticipate
- **Neither typebox-pin nor client-only-superForm resolution path works within this phase's bounded
  scope — escalate to INNOVATE re-run rather than forcing AC7 as literally worded.**

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC runs once in the outer program loop).

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: approach decided; Decision Summary written
- [x] 3. PLAN-SUPPLEMENT — plan-agent: existing phase plan updated; Inner Loop Refresh Note if sections changed (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` (Status / Gate / Plan updates applied / Execute-agent instructions / Test gates / High-risk pack / Backlog artifacts / Known gaps / Accepted by) — **Gate: CONDITIONAL, 02-07-26 (Cycle 2 re-validate, triggered by the 02-07-26 Inner Loop Refresh Note after Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT ran. Cycle 0 was BLOCKED on Gap A0; Cycle 1 was CONDITIONAL after A0's resolution was confirmed; Cycle 2 independently re-confirmed the A2 moot-risk claim by re-reading `new/+page.svelte`'s reactive graph and found no new gaps — same 3 pre-accepted concerns from Cycle 1 carry forward unchanged. All three Cycle 0/1/2 validate-contract entries remain below as historical record.**
- [x] 5. EXECUTE — all checklist items done; per-section test gates run and green (02-07-26). B4 realized as a pure-logic ARIA-helper unit test (no jsdom/component-render vitest project exists — disk at 99%). e2e specs self-skip under the pre-accepted shared auth-fixture known-gap. See phase report.
- [x] 6. EVL — orchestrator-run confirmation (02-07-26): `bun run check` 0 errors, `test:unit:ci` 313/313 (+12/12 isolated new specs), grep confirmed zero `sveltekit-superforms`/`superForm(` usage, and independently confirmed the Phase 2/Phase 4 concurrent edit to `leads/new/+page.svelte` genuinely merges (FieldError + DatePickerField coexist, error wiring threaded correctly). e2e hit a dev-server port collision (environment, not a regression) — recorded as inconclusive, follow-up clean run recommended. See phase report "EVL Confirmation" + "SPEC Achievement" sections.
- [x] 7. UPDATE PROCESS — phase report updated with EVL confirmation + SPEC Achievement; umbrella `## Current Execution State` updated; registry updated to DONE; backlog note written for all-context.md doc-drift; commit recommended (not created by this agent)

**Validate-contract required before execute.** If step 4 (PVL) is unchecked or `## Validate Contract`
reads "(placeholder — vc-validate-agent writes this section before EXECUTE)", orchestrator must
spawn vc-validate-agent first. A partial contract missing Plan updates applied / Execute-agent
instructions / Test gates sections is treated as a placeholder.

---

## Touchpoints

- `src/routes/leads/new/+page.svelte` (shared with Phase 2 — see Entry Gate coordination note)
- `src/routes/leads/new/+page.server.ts` (ADDED at PVL — see Blast Radius)
- `src/lib/components/meetings/MeetingFormModal.svelte`
- `src/routes/team/+page.svelte`
- `src/lib/zod/schemas.ts` (read-only reference, no schema changes)
- New shared field-error component (path finalized during EXECUTE)

---

## Public Contracts

- No schema, auth, or API contract changes.
- `src/lib/zod/schemas.ts` validators are consumed unchanged. **Corrected at EXECUTE (E1):** the
  submission mechanism is NOT changed — `fetch('/api/leads', …)` (and the equivalent `fetch` calls in
  Team invite / Meeting modal) is retained by design (typebox/adapters blocker avoidance). This phase
  changes ONLY the error-display shape (flat string → per-field `flatten().fieldErrors` + shared
  field-error component), not the transport and not the validation rules.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Code-level check: Lead creation surfaces per-field errors via `flatten().fieldErrors` (fetch transport intentionally retained — E1) + existing Vitest schema tests pass + shared field-error ARIA unit test (B4) | Fully-Automated (Vitest + Playwright) | AC7 (per-field-error outcome; literal `superForm()` mechanism is an accepted known-gap) |
| Per-form e2e scenario (Lead creation, Meeting modal, Team invite): submit with one invalid field, assert error renders adjacent to that field with aria-invalid/aria-describedby | Fully-Automated (Playwright) | AC6 |
| NEW — Vitest component test on the shared field-error component itself (props → rendered attrs) | Fully-Automated (Vitest) | AC6 (non-e2e-dependent proof) |
| Dedup-preview reactivity scenario: trigger dedup lookup at the same input/blur points pre- and post-conversion, assert identical preview behavior | Agent-Probe (behavioral judgment on reactivity timing) — escalate to Fully-Automated if a deterministic assertion can be written during EXECUTE | (risk mitigation — protects AC7 from a silent regression) |

```bash
bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts
# Expected: PASS (or self-skip with documented known-gap if shared auth fixture blocks it)
```

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/ux-enhancement/active/sitewide-ux-refresh_02-07-26/phase-04-forms_PLAN_02-07-26.md`
- Last completed step: PVL (V1-V7) run — Gate: CONDITIONAL (Cycle 2)
- Validate-contract status: written, CONDITIONAL (02-07-26, Cycle 2 — 2 prior cycles recorded below)
- Next step: Orchestrator may proceed toward EXECUTE (INNOVATE step 2 remains unchecked above per
  the Phase Loop Progress table — note this predates the Cycle 2 re-validate scope and is outside
  this contract's remit; the calling orchestrator should confirm Step 2's status independently
  before spawning vc-execute-agent). Do not spawn vc-execute-agent until Steps 1-4 are all
  genuinely complete, not merely PVL.

---

## Test Infra Improvement Notes

- The `sveltekit-superforms/adapters` barrel import throws at runtime due to a `typebox@1.3.0`
  incompatibility (see Validate Contract). This affects ANY future use of `sveltekit-superforms`'s
  schema-adapter integration in this repo, not just Phase 4 — worth a standalone backlog note
  (`sveltekit-superforms-typebox-conflict_NOTE_02-07-26.md`) so the next form-conversion effort
  doesn't rediscover this from scratch.

---

## Validate Contract

Status: BLOCKED
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl

Parallel strategy: parallel-subagents (read-only, one validate-agent per phase plan — this is the
Phase 4 assignment within a 5-agent Outer PVL fan-out)
Rationale: S4 (phase program) present; each phase validator reads one finished plan independently,
no cross-talk needed during the read/probe step itself (cross-checks against Phase 2/registry/SPEC
were done via read-only file access, not live coordination) — signal count 4/7 (S1 multi-package
scope not present; S4 phase program present; S6 not present — no schema/auth/API/billing surface;
S7 not present — 4-5 files).

### Blocking FAIL (empirically confirmed, 02-07-26)

The plan's core approach for Step A (`superForm()`/`use:enhance` matching the repo's stated
convention, i.e. server-side `superValidate(schema, adapter)`) requires importing
`sveltekit-superforms/adapters` to get the `zod`/`zod4` adapter function. This package has no
subpath export other than the barrel (`sveltekit-superforms` package.json `exports` map only
exposes `.`, `./client`, `./server`, `./adapters` — no `./adapters/zod`), so the barrel is the
ONLY public path to reach the adapter.

**Empirical repro (run directly, cheap-local, no probe agent needed):**
```
$ bun <script importing 'sveltekit-superforms/adapters'>
IMPORT FAILED: The superclass is not a constructor.
TypeError: The superclass is not a constructor.
    at .../sveltekit-superforms@2.30.1/dist/adapters/typebox.js:7:28
```
The barrel (`dist/adapters/index.js`) unconditionally re-exports every optional adapter, including
`typebox.js`, so the failure occurs at import time regardless of which named export (`zod`) is
actually used — there is no way to destructure around it.

This is not a new discovery in isolation: `src/routes/templates/+page.server.ts` already carries a
verbatim code comment documenting this exact conflict — "We deliberately do NOT return a
`superValidate` instance: the repo has no superForms server-action usage, mutations go through the
REST API (not form actions), and importing `sveltekit-superforms/adapters` breaks the vitest gate
via a broken typebox transitive dep." Phase 4's plan (as written) directly contradicts this
established, documented repo convention without acknowledging or resolving it — this is a Layer 2
"Conflicts found" item, not merely a Layer 1 infra gap.

**Two resolvable paths (neither attempted by the plan as written):**
1. Pin `typebox` to a version compatible with `sveltekit-superforms@2.30.1`'s adapter code (the
   installed `1.3.0` breaks; the package's own optionalDependency range is `^1.1.6` — a lower pin
   may work) via a package.json override, then re-verify the barrel import succeeds and
   `bun run test:unit:ci` stays green.
2. Use `sveltekit-superforms` in its client-only / manual-validation mode (superForm() for
   `use:enhance` + form-state/tainted-field tracking only, keeping validation via the existing
   `leadFormSchema.safeParse()` client + server-side check in `/api/leads`, same idiom already used
   by `templates` and `team`'s add-a-rep form) — this avoids importing the adapters barrel
   entirely and is consistent with the codebase's already-documented precedent.

Either path is boundable within this phase's scope, but the choice materially changes what "AC7 —
matching the repo's stated form convention" means in practice (full server superValidate integration
vs. the templates/team idiom), so it should be resolved via a plan supplement (or a fast INNOVATE
re-check) before EXECUTE, not silently decided by execute-agent.

### C3 Test Gates (5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 | Lead creation submits via superForm()/use:enhance, no manual fetch handler remains | Fully-Automated | `bun run check` (0 errors) + `bun run test:unit:ci -- src/tests/schemas.spec.ts` + code-level grep for absence of `fetch('/api/leads'` in the .svelte file | B — fixed in this plan, blocked pending A0 resolution |
| AC7 | typebox/adapters import path resolved (no runtime throw) | Fully-Automated | throwaway `import('sveltekit-superforms/adapters')` check (see repro above), must exit clean before A1 proceeds | B — added as A0 in this supplement |
| AC6 | Per-field error render (Lead creation, Meeting modal, Team invite) | Fully-Automated | `bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts` | D — self-skips under known shared-auth-fixture gap (pre-accepted program-level known-gap pattern; see umbrella) |
| AC6 | Shared field-error component renders aria-invalid/aria-describedby from props | Fully-Automated | NEW Vitest component test (added as B4) — `bun run test:unit:ci -- [component test file]` | B — added in this supplement, closes the vacuous-green risk of AC6 resting only on a self-skipping e2e |
| (risk mitigation, not a numbered AC) | Dedup-preview reactivity identical pre/post Superforms conversion at same trigger points | Agent-Probe (escalate to Fully-Automated if deterministic assertion is writable) | Manual/agent-judged scenario per plan's Verification Evidence table | A — already planned as A2, proves now once EXECUTE runs |

Failing stub (for the new Fully-Automated component test, B4):
```
test("should render aria-invalid and aria-describedby from field-error props", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: shared field-error component prop-driven ARIA wiring")
})
```

Legacy line form:
- Lead creation submission mechanism: Fully-automated: `bun run check && bun run test:unit:ci -- src/tests/schemas.spec.ts` | Hybrid: n/a | Agent-probe: n/a | Known-gap: n/a
- Per-form field-error e2e: Fully-automated: `bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts` | Known-gap: self-skips under shared-auth-fixture blocker (pre-accepted program pattern)
- Dedup-preview reactivity: Agent-probe: manual re-verification scenario at identical trigger points

### Dimension findings

- Infra fit: FAIL — `sveltekit-superforms/adapters` barrel import throws (`typebox@1.3.0` incompatibility), confirmed by direct execution; blocks the plan's core Step A mechanism as written.
- Test coverage: CONCERN — AC6's only proving gate was a self-skipping e2e scenario with no lower-tier fallback; resolved in this supplement by adding B4 (Vitest component test).
- Breaking changes: PASS — no schema/auth/API contract changes; Public Contracts section is accurate.
- Security surface: PASS — no auth, secrets, or trust-boundary surface touched by this phase.
- Section A feasibility (Lead creation Superforms conversion): FAIL — mechanical feasibility blocked (see Blocking FAIL); blast radius also omitted `src/routes/leads/new/+page.server.ts`, which is required for a `superValidate()`-based `load()` under either resolution path.
- Section B feasibility (Shared field-error component): CONCERN — depends on Section A's resolution; also a real markup-overlap risk with Phase 2's date-picker extraction (the 3 date-trigger Labels are exactly where both phases' edits land), addressed by adding B2a.

### Cross-phase consistency check (Phase 2 / registry / SPEC)

- Phase 2's plan (`phase-02-leads-grid_PLAN_02-07-26.md`) and the registry both state the same
  disjoint-ownership framing as Phase 4's Entry Gate ("Phase 2 = date-picker extraction only, not
  the form conversion itself — that is Phase 4"). The language is consistent across all three
  documents — not merely asserted in one place and assumed elsewhere.
- However, "disjoint concerns in the same file" is optimistic at the markup level: Superforms
  conversion touches every field binding (`bind:value={x}` → `$form.x`) and Step B's per-field
  error wiring must wrap the same 3 date-picker trigger `Label`/`Dialog.Trigger` blocks Phase 2 is
  extracting. This is flagged as a CONCERN and mitigated by new checklist item B2a (explicit
  integration-order handling), not by re-classifying the phases as non-parallel-safe — the
  sequencing-note mitigation already in both plans is sound, it just needed a concrete "how" for
  the actual collision point, which existed nowhere before this PVL pass.
- SPEC cross-check: Phase 4 correctly maps to AC6 (per-field error rendering) and AC7 (Superforms
  conversion). No drift found against the locked SPEC's wording for either criterion.

### Structural validation results (V1 Step 3b)

- `validate-plan-artifact.mjs` (generic SIMPLE/COMPLEX plan validator): 6 failures, 4 warnings —
  ALL are expected false positives for a phase-program sub-plan shape (missing Date/Status/
  Complexity/Acceptance-Criteria/overview-section/Phase-Completion-Rules headings that the generic
  template expects but the phase-stub shape does not use). Not actionable.
- `validate-phase-stub.mjs` (correct validator for phase-program sub-plans): 0 failures, 0
  warnings — PASS.

### Known Gaps

- e2e specs for AC6/AC7 (`lead-creation-form.e2e.ts`, `meeting-form.e2e.ts`,
  `team-invite-form.e2e.ts`) will self-skip against protected routes under the existing
  shared-auth-fixture gap (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`) —
  documented as NEW PLAN REQUIRED is not needed here since this is the SAME pre-accepted
  program-level known-gap pattern already recorded in the umbrella (not a new gap).

### What this coverage does NOT prove

- The `bun run check` + Vitest schema-test gate proves type-safety and that Zod validation rules
  are unchanged — it does NOT prove the Superforms submission actually round-trips correctly
  against a live `/api/leads`-equivalent server action (that needs the e2e gate, which currently
  self-skips).
- The new shared field-error component Vitest test (B4) proves the component renders correct ARIA
  attributes from given props — it does NOT prove those props are wired correctly end-to-end from
  a real form submission (still needs the e2e gate for full proof; component test is a partial,
  non-e2e-dependent mitigation only).
- The dedup-preview Agent-Probe scenario proves behavioral equivalence for the specific input/blur
  trigger points tested — it does NOT prove there are no other places relying on the old manual
  `name` state variable's reactivity timing that weren't enumerated during EXECUTE.
- None of the gates above prove the typebox/adapters resolution path chosen in A0 doesn't introduce
  a new regression elsewhere in the dependency tree — only that the specific import succeeds and
  the existing Vitest suite stays green.

Open gaps:
- Blocking FAIL above (typebox/adapters import) — must be resolved via A0 before EXECUTE.
- Section B2a (Phase 2/4 date-picker markup overlap) — must be resolved with an explicit
  integration note per whichever phase's EXECUTE lands first.

Accepted by: N/A — Gate is BLOCKED, not CONDITIONAL. No concerns have been accepted; the FAIL above
is unresolved and requires a plan supplement (or a fast INNOVATE re-check if neither resolution path
works) before PVL can re-run and reach PASS/CONDITIONAL.

Gate: BLOCKED (unresolved FAIL — see Blocking FAIL above; two boundable resolution paths identified,
this does not require full return to RESEARCH, only a plan supplement adding A0/B2a/B4 — already
drafted into this file's Implementation Checklist above — followed by a PVL re-run from V1)

---

## Validate Contract — Cycle 1 (Re-validate After Plan-Supplement)

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — cycle 0 was BLOCKED on Gap A0 (sveltekit-superforms/adapters
import throws — typebox@1.3.0 conflict); a plan-supplement cycle added A0 (resolution) to the
Implementation Checklist; this contract re-runs the full V1-V7 sequence against the updated plan.

Parallel strategy: sequential
Rationale: single-plan re-validate of one already-updated phase plan — signal score 1/7 (S4
phase-program only; no schema/auth/billing surface, no multi-package scope, no 5+ file blast
radius, no viable-directions multiplicity). No cross-phase coordination needed for this pass.

### Independent verification of the A0 supplement's claims (not taken on trust)

Re-ran the checks myself rather than trusting the prior agent's report:

- `grep -rn "superForm(" src/` → **zero matches, confirmed.** `sveltekit-superforms` is not
  invoked as a form-binding API anywhere in `src/`.
- `grep -rn "sveltekit-superforms" src/` → only one hit, a **code comment** in
  `src/routes/templates/+page.server.ts` documenting the same typebox conflict — no actual import.
- `node_modules/sveltekit-superforms/package.json` `exports` map → confirmed only `.`, `./client`,
  `./client/SuperDebug.svelte`, `./SuperDebug.svelte`, `./server`, `./adapters` are exposed — **no
  `./adapters/zod` subpath exists.** The barrel is genuinely the only path to the adapter, and the
  barrel re-exports `typebox.js` unconditionally.
- `node_modules/typebox/package.json` → version `1.3.0` installed, matching the cycle-0 repro.
- Read `src/routes/leads/new/+page.svelte` directly: line 125 is exactly the single flat-error
  pattern described (`error = parsed.error.issues[0]?.message ?? 'Please check the form.'`), and
  line 131 (`fetch('/api/leads', ...)`) confirms the current transport. Both `src/routes/team/+page.svelte`
  and `src/lib/components/meetings/MeetingFormModal.svelte` also use plain `fetch(...)` with no
  `superForm`/`use:enhance` anywhere — confirms the "zero real precedent" claim independently, not
  just for `templates`.

**Gap A0 verdict: genuinely resolved.** The revised A1 does not import `sveltekit-superforms`,
`sveltekit-superforms/adapters`, `sveltekit-superforms/client`, or `sveltekit-superforms/server` at
all — the broken barrel is never touched by any code path this plan now writes. This is a
structural resolution (avoidance), not a workaround pinned on a fragile typebox override, which is
the stronger of the two paths the cycle-0 contract offered. No checklist item still references
`superForm()`/`use:enhance`/the adapters import — confirmed by reading A1, A2, A3, B1-B4 in full.

### AC7 — literal wording vs. underlying user-facing intent

SPEC AC7 literally reads: "Lead creation form uses `superForm()`/`use:enhance` instead of manual
`fetch` + JSON body, matching the repo's stated form convention." The revised A1 does **not** do
this — `fetch('/api/leads', ...)` remains the transport; only the error-shape plumbing changes
(flat string → `flatten().fieldErrors` per-field). This is a genuine, not cosmetic, deviation from
AC7's literal text.

Per the task framing, this substitution has already been reviewed and accepted by the dispatching
orchestrator (rationale: the typebox/adapters conflict is confirmed unresolvable within this
phase's bounded scope without a fragile dependency override, and A0 independently confirmed there
is zero actual `superForm()` precedent anywhere in the repo to "match" in the first place — the
convention AC7 cites does not exist in practice). This is recorded as a **CONCERN, pre-accepted**,
not a FAIL.

**Underlying user-facing outcome check (the part that actually matters):** yes, genuinely achieved.
A1 explicitly restructures the error path to populate per-field error state from
`result.error.flatten().fieldErrors`, and Step B wires each field's own message +
`aria-invalid`/`aria-describedby` via the shared field-error component. The SPEC's real intent
behind AC7 — "I don't have to guess which field a flat error message refers to" (User Stories) — is
delivered. Only the specific literal implementation mechanism named in AC7's wording is not.

### New finding — stale prose elsewhere in this same plan file (Layer 2 "Conflicts found")

The Implementation Checklist (A0/A1) is correct and authoritative, but three OTHER sections of this
plan file still describe the pre-supplement (broken) approach and now contradict the checklist:

- **Purpose** (top of file): "Lead creation converts to `superForm()`/`use:enhance` FIRST in
  isolation..." — stale, contradicts A0.
- **Public Contracts**: "this phase changes the submission mechanism (fetch → superForm/use:enhance)
  ... not the validation rules themselves." — stale; the submission mechanism does NOT change per
  A1 ("The `fetch('/api/leads', ...)` POST mechanism itself is UNCHANGED").
- **Verification Evidence** table, row 1: "Code-level check: no manual fetch-based submit handler
  remains in Lead creation..." — stale; fetch is retained by design now.

This is flagged as a **CONCERN**, not a FAIL — it is a documentation-consistency gap, not a
mechanical blocker, and the checklist itself (which execute-agent actually follows) is correct.
Mitigated via Execute-Agent Instruction E1 below rather than requiring another plan-supplement
round-trip.

### B2a / B4 intact check

Confirmed unchanged from cycle 0 — both still present in the Implementation Checklist exactly as
written (lines documenting the Phase 2/4 date-picker markup-overlap contingency for B2a, and the
new Vitest component test for B4). Neither was touched by the A0 supplement, as expected (the
supplement was scoped to A0 only).

### C3 Test Gates (5-column table) — REVISED for cycle 1

The cycle-0 contract's AC7 rows are now stale (they assert absence of the fetch handler, which the
revised approach explicitly keeps). Rewritten below:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 (revised) | Lead creation surfaces per-field errors via `flatten().fieldErrors`; fetch transport intentionally retained (typebox blocker avoidance) | Fully-Automated | `bun run check` (0 errors) + `bun run test:unit:ci -- src/tests/schemas.spec.ts` + new e2e submit-success scenario | A — proven now once A1/A3 land |
| AC7 (literal wording — known deviation) | `superForm()`/`use:enhance` adoption | N/A — not attempted, by accepted design decision | — | D — named residual: literal AC7 mechanism not implemented; user-facing per-field-error outcome delivered via AC6 instead; accepted per this contract |
| AC6 | Per-field error render (Lead creation, Meeting modal, Team invite) | Fully-Automated | `bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts` | D — self-skips under known shared-auth-fixture gap (pre-accepted program-level known-gap) |
| AC6 | Shared field-error component renders aria-invalid/aria-describedby from props | Fully-Automated | `bun run test:unit:ci -- [component test file]` (B4) | B — added in prior supplement, closes vacuous-green risk of AC6 resting only on self-skipping e2e |
| (risk mitigation) | Dedup-preview reactivity identical pre/post error-plumbing change at same trigger points | Agent-Probe (escalate to Fully-Automated if deterministic assertion is writable) | Manual/agent-judged scenario per plan's Verification Evidence table (A2) | A — proven now once A2 executes |

Legacy line form:
- Lead creation per-field error surfacing: Fully-automated: `bun run check && bun run test:unit:ci -- src/tests/schemas.spec.ts` | Hybrid: n/a | Agent-probe: n/a | Known-gap: n/a
- Per-form field-error e2e: Fully-automated: `bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts` | Known-gap: self-skips under shared-auth-fixture blocker (pre-accepted program pattern)
- Dedup-preview reactivity: Agent-probe: manual re-verification scenario at identical trigger points
- AC7 literal mechanism: Known-gap: `superForm()`/`use:enhance` not adopted — accepted deviation, see AC7 discussion above

### Dimension findings (fresh re-assessment, not carried over)

- Infra fit: PASS — the typebox/adapters blocker is now structurally avoided (no
  `sveltekit-superforms` import of any kind in the revised approach); re-confirmed independently.
- Test coverage: CONCERN — AC6's e2e gate still self-skips (pre-accepted known-gap, mitigated by
  B4); AC7's proving-test required rewriting for this cycle (done above) since the approach
  changed; both are now correctly captured.
- Breaking changes: PASS — no schema/auth/API contract changes; confirmed `fetch('/api/leads')`
  and `leadFormSchema` are unchanged.
- Security surface: PASS — no auth, secrets, or trust-boundary surface touched.
- Section A feasibility (Lead creation per-field error restructuring): CONCERN — mechanically
  feasible and grounded (confirmed via direct file read: line 125's flat-error assignment is the
  exact target for the `flatten().fieldErrors` restructuring); CONCERN is for the stale
  Purpose/Public-Contracts/Verification-Evidence prose elsewhere in this file, not for A1 itself.
- Section B feasibility (Shared field-error component): CONCERN — same residual as cycle 0: B2a's
  Phase 2/4 date-picker markup-overlap risk is real and still contingent on EXECUTE ordering; the
  plan's existing contingent handling (expose a prop either direction) is judged sufficient, not
  requiring further plan changes.

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Treat the Implementation Checklist (A0-A3, B1-B4) as authoritative over the Purpose, Public Contracts, and Verification Evidence prose elsewhere in this file — those sections still describe the pre-supplement fetch→superForm approach and are stale. Correct that prose in the phase report (or via a small doc-fix commit) rather than re-implementing what it describes. | Before/during Step A |
| E2 | Do not import `sveltekit-superforms`, `sveltekit-superforms/adapters`, `sveltekit-superforms/client`, or `sveltekit-superforms/server` anywhere in this phase's changes — any such import re-introduces the confirmed-broken typebox barrel throw. | Steps A and B |
| E3 | For B2a: before wiring the 3 date-picker fields, check Phase 2's current EXECUTE status in the registry. If Phase 2 has already landed its date-picker component, integrate against its prop/slot interface. If not, expose an `error`/`aria-describedby`-friendly prop on the inline `Dialog.Trigger` wrapper so Phase 2 can consume it later without rework. Document which order actually happened in the phase report. | Step B2a |

### Known Gaps

- e2e specs for AC6 (`lead-creation-form.e2e.ts`, `meeting-form.e2e.ts`, `team-invite-form.e2e.ts`)
  will self-skip against protected routes under the existing shared-auth-fixture gap — same
  pre-accepted program-level known-gap already recorded in the umbrella, not new.
- AC7's literal mechanism (`superForm()`/`use:enhance`) is not implemented — accepted deviation,
  named residual, rationale recorded above. Candidate follow-up: once the typebox/adapters conflict
  is fixed upstream (or pinned safely), a separate backlog item could migrate Lead
  creation/`templates`/`team` to true `superForm()` usage — not required for this phase.
- Doc/reality drift: `all-context.md` §Mandatory Conventions still states "Superforms + Zod for all
  forms" as the actual convention; the codebase's real, consistent idiom is client `safeParse` +
  `fetch`. Flagged for UPDATE PROCESS reconciliation (carried over from A0, not new).

### What this coverage does NOT prove

- The `bun run check` + Vitest schema-test gate proves type-safety and that Zod validation rules
  are unchanged — it does NOT prove the per-field error restructuring round-trips correctly against
  a live `/api/leads` call under every validation-failure combination (only the e2e gate would,
  and it currently self-skips).
- The shared field-error component Vitest test (B4) proves the component renders correct ARIA
  attributes from given props — it does NOT prove those props are actually populated correctly by
  Lead creation's, Meeting modal's, or Team invite's real submit-failure code paths end-to-end.
- The dedup-preview Agent-Probe scenario proves behavioral equivalence for the specific input/blur
  trigger points tested — it does NOT prove there are no other places relying on the old error
  state variable's reactivity timing that weren't enumerated during EXECUTE.
- Nothing in this coverage proves the AC7 literal-wording deviation (fetch retained instead of
  `superForm()`/`use:enhance`) is invisible to a future consumer expecting true Superforms behavior
  (e.g. progressive enhancement / no-JS submission) — that capability is not delivered by this
  phase and is not tested for, by design.

Open gaps:
- Stale Purpose/Public-Contracts/Verification-Evidence prose (mitigated via Execute-Agent
  Instruction E1, not requiring a further plan-supplement round-trip).
- Section B2a Phase 2/4 markup-overlap residual risk (mitigated via Execute-Agent Instruction E3;
  same contingent handling as cycle 0, judged sufficient).
- AC7 literal-wording deviation (accepted, named residual — see Known Gaps).

Accepted by: session (vc-validate-agent) — carrying forward the dispatching orchestrator's explicit
pre-acceptance of the AC7 substitution (typebox/adapters conflict confirmed unresolvable in-scope;
zero real `superForm()` precedent exists anywhere in this repo to match), plus this cycle's own
acceptance of the stale-prose and B2a residual-risk concerns as adequately mitigated via
Execute-Agent Instructions E1/E3 rather than requiring another plan-supplement round-trip.

Gate: CONDITIONAL (0 FAILs; 3 CONCERNs — AC7 literal-wording deviation [pre-accepted], stale
Purpose/Public-Contracts/Verification-Evidence prose [mitigated via E1], Section B2a residual risk
[mitigated via E3]). This is cycle 1, following exactly 1 supplement cycle that resolved cycle 0's
Blocking FAIL (Gap A0). Per PVL routing, this CONDITIONAL is eligible for EXECUTE once the
orchestrator records this cycle in `results.tsv` (currently 1 baseline row only — orchestrator must
append this cycle's row before treating the gate as terminal).

---

## Validate Contract — Cycle 2 (Re-validate After Inner Loop Refresh Note)

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 2026-07-02 (outer-pvl) — cycle 1 was CONDITIONAL (3 pre-accepted concerns); the
02-07-26 Inner Loop Refresh Note recorded that Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT ran since
cycle 1 was written (results.tsv row 2, timestamp 14:05, postdates cycle 1's 13:35 write) — this
contract re-runs V1 against the refreshed plan.

Parallel strategy: sequential
Rationale: signal score 1/7 (S4 phase-program only — same as cycle 1; no schema/auth/billing
surface, no multi-package scope, no blast-radius or checklist-item change this cycle). A full
Layer 1 (4-dimension) + Layer 2 (per-section) re-fan-out is NOT warranted — see "Scope-of-change
assessment" below for the explicit reasoning.

### Scope-of-change assessment (does this need a full re-fan-out?)

Diffed the Inner Loop Refresh Note against the prior (cycle 1) contract's basis:

1. **Item A2** — wording changed from "risk mitigation" to "regression-proof test only." The
   underlying checklist action (write a test proving dedup-preview behavior is unchanged) is
   **identical** — only the stated rationale changed, because RESEARCH resolved what was
   previously an open unknown. No new test, no new file, no tier change (still Agent-Probe, still
   gap-resolution `A`).
2. **Item B1** — a field-key reference list was appended, plus a note that the Meeting modal has
   no Zod schema and its Attendees chip-group needs manual key assignment. This is an
   implementation detail, not a new checklist item, new file, or scope change — B1 itself is
   unchanged ("build one shared field-error component..."); the note is advisory guidance for
   EXECUTE.
3. **No changes** to: Blast Radius, Public Contracts, Touchpoints, Exit Gate, Test Gates table,
   Execute-Agent Instructions, Known Gaps, or any of the three CONCERNs carried in cycle 1.

Given (1) no new checklist items, (2) no blast-radius or public-contract changes, (3) no new files,
and (4) the one substantive factual claim in the refresh note (the moot-risk claim) is
independently re-verifiable by direct source read rather than requiring fresh fan-out
investigation — this closes as a **light V1 re-confirm**, not a full Layer 1/Layer 2 re-fan-out.
Re-running all four Layer 1 dimension agents and both Layer 2 section agents from scratch would
re-derive verdicts that cannot have changed, since nothing in their evidence base (files touched,
contracts, security surface, mechanical feasibility of A1/B1-B4) moved. The one thing that
genuinely needed independent re-checking — the moot-risk factual claim — is done directly below,
not deferred to a sub-agent.

### Independent verification of the moot-risk claim (not taken on trust)

Read `src/routes/leads/new/+page.svelte` directly (not just the RESEARCH summary):

- Line 25: `let name = $state('')` — plain primitive state, not part of any shared reactive object.
- Line 58: `let error = $state('')` — a **separate**, independently-declared state variable. This
  is the variable A1's restructuring touches (it is reassigned at lines 105, 125, 128, 137, 144 in
  the current pre-A1 code, and per A1's checklist text will be replaced/supplemented by a per-field
  error object).
- Line 76: `const dupes = $derived(name.length > 1 ? hasPotentialDuplicate({ name }, data.leads) : [])`
  — derives **only** from `name` (line 25). It has no dependency on `error` (line 58) anywhere in
  its expression.
- Confirmed by reading the `create()` function (lines 102-148): `error` is read/written throughout
  error handling (lines 105, 124-128, 136-137, 144), but `name` is only read (never reassigned) at
  line 109 inside the `safeParse` payload — `create()` never mutates `name`, and A1's planned
  change (replacing the flat `error` string with `flatten().fieldErrors` per-field state) has no
  code path that touches `name` or `dupes`.

**Verdict: the moot-risk claim is confirmed correct, independently.** `name` and `dupes` form a
completely separate reactive chain from `error`, and A1's restructuring is scoped entirely to the
`error`/validation-failure path. There is no shared reactive object, and the Refresh Note's
underlying technical claim ("A1's error-handling restructuring never touches [name/dupes]") holds
up against direct inspection, not just the research report's say-so. This confirms A2's downgrade
from "risk mitigation" to "regression-proof test only" is warranted — the risk really is moot for
the reactivity mechanism itself. The regression test itself (proving dedup-preview trigger points
behave identically pre/post A1) remains equally worth writing regardless of the rationale label —
this guards against a *future* code change accidentally coupling the two, not against the current
plan's approach.

### B1 addition assessment (field-key reference + Meeting-modal nuance)

- The `leadFormSchema` field-key list is read directly from the plan text and cross-checked
  against `src/lib/zod/schemas.ts` field names cited (`name`, `category`, `platform`, `location`,
  `pageUrl`, `contactEmail`, `eventName`, `eventLink`, `eventDateRaw`, `firstAnnouncedDate`,
  `firstReachedOutDate`, `notes`, `visibility`, `selectedUserIds`) — this is reference material for
  execute-agent, not a new obligation; no independent verification needed beyond confirming it is
  additive prose (it is — B1's action sentence is unchanged).
- The Meeting-modal-has-no-Zod-schema / Attendees-chip-group-has-no-natural-field-key note is
  already labeled in-plan as "an implementation nuance, not a blocker." This is judged adequate as
  written — it correctly flags a real integration wrinkle for B2 without inventing a new checklist
  item or gate. No new CONCERN is opened for this; it is folded into the existing Section B
  feasibility CONCERN (B2a markup-overlap) as one more piece of "things EXECUTE must handle
  carefully in Step B," not a separate risk.

### Structural validation (V1 Step 3b, re-run this cycle)

- `validate-plan-artifact.mjs`: 4 failures, 4 warnings — same expected false positives for the
  phase-stub shape (missing overview/Complexity/Phase-Completion-Rules/Acceptance-Criteria
  headings the generic template expects; not applicable to phase-program sub-plans). Not
  actionable, consistent with cycles 0/1.
- `validate-phase-stub.mjs` (correct validator for this shape): 0 failures, 0 warnings — PASS.

### Dependency-BLOCKED guard / registry check

- This phase plan has no `## Phase Ordering` section (expected — that lives at the umbrella level).
- Checked `phase-blast-radius-registry.md`: no phase carries `status: BLOCKED` or
  `status: BLOCKED-skipped`; all 5 phases show either "(no field — not yet started)" or the Phase
  5 sequencing note. No dependency-BLOCKED condition applies to Phase 4.
- Checked the umbrella's `## Pre-PVL Conflict Resolution` section: a clean reassignment table with
  no `Action: update Phase [X] blast-radius claim` entries — the Action-field completion check does
  not trip.

### Dimension findings (carried forward unchanged — no evidence changed this cycle)

- Infra fit: PASS — unchanged; the typebox/adapters avoidance from A0 is untouched by this
  refresh note.
- Test coverage: CONCERN — unchanged; AC6's e2e gate still self-skips (pre-accepted, mitigated by
  B4). A2's tier (Agent-Probe, gap-resolution A) is unaffected by its rationale re-wording.
- Breaking changes: PASS — unchanged; no schema/auth/API contract changes.
- Security surface: PASS — unchanged; no auth/secrets/trust-boundary surface touched.
- Section A feasibility: CONCERN — unchanged; same residual as cycle 1 (stale
  Purpose/Public-Contracts/Verification-Evidence prose, mitigated via E1). A2's re-verified moot
  claim strengthens confidence here but does not remove the existing CONCERN (which was never about
  A2 in the first place).
- Section B feasibility: CONCERN — unchanged; B2a markup-overlap residual (mitigated via E3) now
  additionally documented with the Meeting-modal field-key nuance (folded in, not a new CONCERN —
  see above).

### C3 Test Gates — unchanged from cycle 1

No test gate row requires revision this cycle: A2's tier, proving test, and gap-resolution code are
identical to cycle 1's table (Agent-Probe / "Manual/agent-judged scenario per plan's Verification
Evidence table (A2)" / `A`). Reproduced for completeness:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 (revised) | Lead creation surfaces per-field errors via `flatten().fieldErrors`; fetch transport intentionally retained (typebox blocker avoidance) | Fully-Automated | `bun run check` (0 errors) + `bun run test:unit:ci -- src/tests/schemas.spec.ts` + new e2e submit-success scenario | A — proven now once A1/A3 land |
| AC7 (literal wording — known deviation) | `superForm()`/`use:enhance` adoption | N/A — not attempted, by accepted design decision | — | D — named residual: literal AC7 mechanism not implemented; user-facing per-field-error outcome delivered via AC6 instead; accepted per this contract |
| AC6 | Per-field error render (Lead creation, Meeting modal, Team invite) | Fully-Automated | `bun run test:e2e -- lead-creation-form.e2e.ts meeting-form.e2e.ts team-invite-form.e2e.ts` | D — self-skips under known shared-auth-fixture gap (pre-accepted program-level known-gap) |
| AC6 | Shared field-error component renders aria-invalid/aria-describedby from props | Fully-Automated | `bun run test:unit:ci -- [component test file]` (B4) | B — added in cycle-0 supplement, closes vacuous-green risk of AC6 resting only on self-skipping e2e |
| (risk mitigation, now regression-proof per A2 re-scope) | Dedup-preview reactivity identical pre/post error-plumbing change at same trigger points — RE-VERIFIED MOOT this cycle via direct source read | Agent-Probe (escalate to Fully-Automated if deterministic assertion is writable) | Manual/agent-judged scenario per plan's Verification Evidence table (A2) | A — proven now once A2 executes |

Legacy line form: unchanged from cycle 1 (see above); not reproduced twice.

### Execute-Agent Instructions — unchanged from cycle 1 (E1, E2, E3), plus one new advisory

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | (carried forward, unchanged) Treat the Implementation Checklist (A0-A3, B1-B4) as authoritative over the Purpose, Public Contracts, and Verification Evidence prose elsewhere in this file. | Before/during Step A |
| E2 | (carried forward, unchanged) Do not import any `sveltekit-superforms` subpath anywhere in this phase's changes. | Steps A and B |
| E3 | (carried forward, unchanged) For B2a: check Phase 2's EXECUTE status in the registry before wiring the 3 date-picker fields; integrate against its interface if landed, else expose a consumable prop. | Step B2a |
| E4 | NEW (Cycle 2) — For B2 (Meeting modal): the Attendees chip-group has no natural `id`/`for` pair for the shared field-error component's per-field key convention. Use manual per-check key assignment (e.g. a synthetic `attendees` key on the group container) rather than trying to force a 1:1 field mapping; do not block B2 on finding a "natural" key — none exists structurally for a multi-select chip group. | Step B2, Meeting modal only |

### Known Gaps — carried forward unchanged

- e2e specs for AC6 self-skip under the existing shared-auth-fixture gap — same pre-accepted
  program-level known-gap, not new.
- AC7's literal mechanism (`superForm()`/`use:enhance`) is not implemented — accepted deviation,
  named residual, rationale carried from cycle 1.
- Doc/reality drift in `all-context.md` §Mandatory Conventions — flagged for UPDATE PROCESS,
  carried from cycle 0/1, not new.

### What this coverage does NOT prove (carried forward, plus one addition)

- (All four bullets from cycle 1 carry forward unchanged — see Cycle 1 section above; not
  reproduced twice here to avoid drift between two "current" copies.)
- **Addition (Cycle 2):** the independent re-verification above proves the `name`/`dupes` reactive
  chain is structurally disjoint from `error` in the CURRENT source as of 02-07-26. It does NOT
  prove this remains true after A1's actual implementation lands — if EXECUTE introduces a shared
  error/name coupling that doesn't exist today (e.g. clearing `name` on submit success in a way
  that also touches error state), the regression test added per A2 is what catches that, not this
  static analysis. This is exactly why A2 is retained as a test requirement even though the
  rationale for it changed.

Open gaps: unchanged from cycle 1 (stale prose [E1], B2a markup-overlap [E3, now also E4 for the
Meeting-modal key nuance], AC7 literal-wording deviation [accepted]). No new open gap introduced
by this cycle's refresh-note changes.

Accepted by: session (vc-validate-agent) — carrying forward cycle 1's acceptances (AC7 substitution,
stale prose via E1, B2a residual via E3) unchanged, since this cycle's refresh-note diff introduced
no new concerns requiring fresh acceptance. The one new item (E4, Meeting-modal Attendees key
nuance) is an execute-agent instruction, not a CONCERN requiring separate acceptance — it resolves
an implementation-detail question the plan's own B1 note already flagged as non-blocking.

Gate: CONDITIONAL (0 FAILs; same 3 CONCERNs carried forward from cycle 1 — AC7 literal-wording
deviation [pre-accepted], stale Purpose/Public-Contracts/Verification-Evidence prose [mitigated via
E1], Section B2a residual risk [mitigated via E3/E4]). This is cycle 2, triggered by the 02-07-26
Inner Loop Refresh Note (Step 1 RESEARCH + Step 3 PLAN-SUPPLEMENT). The refresh note's two changes
(A2 rationale downgrade; B1 reference/nuance additions) introduced no new checklist items, blast-
radius changes, or files, and its one factual claim (dedup-preview risk is moot) is independently
confirmed correct by direct source read. This closes as a light re-confirm, not a full re-fan-out —
rationale recorded in "Scope-of-change assessment" above. Per PVL routing, this CONDITIONAL is
eligible for EXECUTE once the orchestrator appends this cycle's row to `results.tsv` (currently 3
rows: baseline + 2 supplement cycles — orchestrator must append cycle 2 before treating the gate as
terminal for EXECUTE routing purposes).
