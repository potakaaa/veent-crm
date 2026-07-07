---
name: plan:combobox-suggest-freetext
description: "COMPLEX plan — shared suggest+free-text combobox component, Organizer Name suggestions at 3 entry points, new Meeting Venue free-text field + schema (GitHub #250)"
date: 07-07-26
feature: ux-enhancement
---

# PLAN — Combobox: Suggest + Allow Free-Text (GitHub #250)

- **Date**: 07-07-26
- **Status**: ✅ COMPLETE — EXECUTE + EVL confirmed 07-07-26; archived to `completed/` (UPDATE PROCESS 07-07-26). Known-gaps carried to backlog (see `## Known Gaps` note below); migration `0026` apply is a deploy-time step, not run in this env.
- **Complexity**: COMPLEX
- **Feature:** ux-enhancement
- **Context loaded:** SPEC (same folder) + `process/context/all-context.md` (§Drizzle conventions, §Mandatory conventions) + `process/context/tests/all-tests.md`

**TL;DR:** Build one shared `ComboboxFreetext` component (free-text-first, optional suggestion
source, never blocks) by extending the existing `Command`+`Popover` recipe. Wire it into the
Organizer Name field at 3 entry points (suggestion mode, reusing `GET /api/organizers?q=`). Add a
brand-new free-text **Meeting Venue** field to `MeetingFormModal` backed by a new nullable
`venue` text column on `crm_meetings` (migration `0026`). Section A (component) blocks Sections B
(organizer wiring) and C (venue); B and C are parallel-safe. Complexity: **COMPLEX** — schema
migration + full API/persistence chain + a reusable a11y component + a test-infra addition.

Classification: **COMPLEX** (single plan, not a phase program).

Locked upstream: SPEC `combobox-suggest-freetext_SPEC_07-07-26.md` (6 ACs) + this session's
INNOVATE Decision Summary (extend `Command`+`Popover` recipe; do NOT adopt bits-ui native
`Combobox`; two modes — free-text-only and free-text+suggestions; do NOT touch
`LeadCombobox`/`OrganizerCombobox`; add explicit ARIA combobox attributes as a real task).

---

## Overview

Two user-facing changes plus one shared building block:

1. **Shared component** — `src/lib/components/ui/combobox-freetext/` — a free-text input that
   optionally shows a clickable suggestion dropdown from a supplied async source, and NEVER
   enforces "must match a suggestion." Reuses the 300ms-debounce + latest-wins race-guard recipe
   from `OrganizerCombobox.svelte`. Adds explicit ARIA combobox semantics + keyboard nav (a
   deliberate improvement over the recipe it copies).
2. **Organizer Name (enhanced)** — replace the plain `<Input>` at 3 entry points with the shared
   component in **suggestion mode**, sourcing suggestions from existing organizer names via the
   already-live `GET /api/organizers?q=` endpoint. No schema change (the field is already
   free-text `z.string().trim().min(1)` with no enum).
3. **Meeting Venue (new)** — a new free-text field in `MeetingFormModal.svelte` in
   **free-text-only mode** (no suggestions for v1), persisted to a new nullable `venue` column on
   `crm_meetings`.

## Goals

- Ship one reusable "suggest but never block" component (SPEC AC5).
- Add live organizer-name suggestions without changing free-text acceptance (AC2, AC3, AC4).
- Add a persisted Meeting Venue free-text field (AC1).
- Leave the id-only pickers (`LeadCombobox`, `OrganizerCombobox`) byte-for-byte unchanged (AC6).

## Scope

**In scope:** the shared component; its ARIA + keyboard behavior; organizer-name wiring at the 3
named entry points; the venue field UI; the venue column + migration; the full venue persistence
chain (schema → type → mapper → create/update → Zod → 2 API routes → 2 modal callers); Vitest
schema/logic tests; a minimal Svelte component-test harness (recommended) or a pure-logic fallback.

**Out of scope (per SPEC, do not touch):** every other fixed-list `<Select>`; venue
suggestions/history; `#231` filter-dropdown work; `LeadCombobox.svelte`; `OrganizerCombobox.svelte`;
any new venue entity/table/normalization/geocoding.

---

## Acceptance Criteria

Mapped 1:1 from the SPEC; each names its proving gate + strategy (see Verification Evidence for the
full matrix).

- **AC1 — Meeting Venue field exists and accepts any free-text value.**
  `proven by:` Vitest on `meetingFormSchema`/`meetingUpdateSchema` (venue accepts arbitrary string,
  optional, no format constraint) + Playwright create/edit round-trip (self-skips, known-gap).
  `strategy:` Hybrid
- **AC2 — Organizer Name shows clickable suggestions while typing** (all 3 entry points).
  `proven by:` Playwright e2e type→dropdown (self-skips, known-gap); dropdown-shows logic proven
  Fully-Automated in `combobox-freetext-logic.spec.ts`.
  `strategy:` Hybrid
- **AC3 — Typing a brand-new organizer name (no match) is accepted without error.**
  `proven by:` Vitest asserting `leadCreateSchema.name`/`leadUpdateSchema.name` have no
  enum/"must match" constraint + Playwright unmatched-name submit (self-skips, known-gap).
  `strategy:` Hybrid
- **AC4 — Selecting a suggestion fills the field with the exact suggested value.**
  `proven by:` Vitest logic `applySelection` returns the exact picked string (Fully-Automated) +
  Playwright/component click-to-fill (self-skips OR component harness).
  `strategy:` Hybrid
- **AC5 — The behavior is one shared, reusable component.**
  `proven by:` Vitest logic — dropdown shows given matches, free-text forwarded unchanged, no
  invalid state from unmatched value.
  `strategy:` Fully-Automated
- **AC6 — Existing id-only combobox pickers are unaffected.**
  `proven by:` `git diff --stat` shows `LeadCombobox.svelte`/`OrganizerCombobox.svelte` unchanged;
  existing coverage stays green (regression).
  `strategy:` Hybrid

## Open Question Resolutions (decided in this PLAN)

- **OQ1 — component location:** `src/lib/components/ui/combobox-freetext/` (`ComboboxFreetext.svelte`
  + `index.ts` barrel), matching the `unified-filter-components` shared-UI convention. **Confirmed.**
- **OQ2 — build vs adopt:** Extend the `Command`+`Popover` recipe (locked by INNOVATE). **Confirmed.**
- **OQ3 — venue data model:** New nullable `venue text` column directly on `crm_meetings`
  (mirrors `meetingUrl`/`notes`/`outcome` — all `text()` nullable). No new table. **Decided here.**

---

## Touchpoints

**Section A — shared component (new files):**
- `src/lib/components/ui/combobox-freetext/ComboboxFreetext.svelte` (new)
- `src/lib/components/ui/combobox-freetext/index.ts` (new barrel)
- `src/lib/components/ui/combobox-freetext/combobox-freetext-logic.ts` (new — pure, testable state/reducer helpers)

**Section B — organizer-name wiring (edit):**
- `src/routes/leads/new/+page.svelte` (Input → ComboboxFreetext, ~line 206 `name` field)
- `src/lib/components/leads/LeadEditModal.svelte` (Input → ComboboxFreetext, ~line 122 `name` field)
- `src/routes/leads/[id]/edit/+page.svelte` (Input → ComboboxFreetext, ~line 150 `name` field)
- Reuse (no change): `GET /api/organizers?q=` (`src/routes/api/organizers/+server.ts`), `searchOrganizers` (`src/lib/server/db/organizers.ts`)

**Section C — venue field + persistence chain (edit):**
- `src/lib/server/db/schema.ts` (add `venue: text('venue')` to `crmMeetings`, ~line 352 next to `meetingUrl`)
- `drizzle/0026_*.sql` + `drizzle/meta/_journal.json` (generated by `bun run db:generate`)
- `src/lib/types/index.ts` (add `venue?: string` to `Meeting`, ~line 174)
- `src/lib/server/db/meetings.ts` (mapper `dbRowToMeeting` ~line 102; `createMeeting` input+insert ~line 305–325; `updateMeeting` patch+set ~line 346–366)
- `src/lib/zod/schemas.ts` (`meetingFormSchema` ~line 199; `meetingUpdateSchema` ~line 217)
- `src/routes/api/meetings/+server.ts` (POST — pass `venue`)
- `src/routes/api/meetings/[id]/+server.ts` (PATCH — pass `venue`)
- `src/lib/components/meetings/MeetingFormModal.svelte` (venue state, seed, input, `MeetingFormPayload`, submit)
- `src/lib/components/meetings/MeetingsPanel.svelte` (PATCH body ~line 197 — add `venue`; POST auto-includes via `payload`)
- `src/routes/meetings/[id]/+page.svelte` (PATCH body ~line 64 — add `venue`)

**Test infra:**
- `vite.config.ts` (add a `client` vitest project — happy-dom env — for `*.svelte.{test,spec}`) — *recommended, see Test Infra Notes*
- `package.json` (devDeps `@testing-library/svelte`, `happy-dom`) — *recommended*
- New tests: `src/lib/zod/schemas.spec.ts` additions (or `src/tests/`); `combobox-freetext-logic.spec.ts`; component `.svelte.test.ts` (if harness added)

## Public Contracts

- **`ComboboxFreetext.svelte` props (new public UI contract):**
  - `value: string` (`$bindable`) — the free-text value; the input drives it directly.
  - `search?: (q: string) => Promise<string[]>` — optional. Absent ⇒ free-text-only mode (no
    dropdown). Present ⇒ suggestion mode (debounced query, clickable listbox).
  - `id?`, `placeholder?`, `disabled?`, plus `...restProps` (spread for `aria-invalid`/`aria-describedby` field-error passthrough).
  - Invariant: the component NEVER sets an error/invalid state based on whether `value` matches a
    suggestion. Selecting a suggestion sets `value` to the exact string and closes the dropdown.
- **DB contract:** new nullable `crm_meetings.venue text` — additive, no default, no NOT NULL, no
  backfill. Existing rows read `null` ⇒ mapped to `undefined`.
- **API contract (additive):** `meetingFormSchema`/`meetingUpdateSchema` gain optional
  `venue: z.string().optional()` — no `.url()`/enum/length constraint. Existing callers that omit
  `venue` continue to validate unchanged.
- **Unchanged contracts (must stay identical — AC6):** `LeadCombobox`, `OrganizerCombobox`,
  `searchOrganizers`, and the organizer-name lead Zod fields (`leadCreateSchema.name`,
  `leadUpdateSchema.name`).

## Blast Radius

- **~16 files** (3 new component files + up to 2 test-infra config edits + ~11 edits across
  schema/db/api/zod/svelte) + 1 generated migration.
- **Packages/surfaces:** DB schema + migration, server DB layer, Zod validators, 2 API routes, 5
  Svelte surfaces, shared UI lib.
- **Risk class:** schema/data-migration (additive, low-risk — nullable column, no backfill) + UI.
  No auth, no billing, no destructive mutation, no public-external API. `GET /api/organizers`
  already session-authed; no auth surface change.

---

## Implementation Checklist

Execution order: **Section A first** (blocks B and C). B and C are independent — either order or
parallel-safe. Run the per-section test gate at the end of each section before moving on.

### Section A — Shared `ComboboxFreetext` component  (proves AC5; foundation for AC2/AC4)

1. Create `src/lib/components/ui/combobox-freetext/combobox-freetext-logic.ts` — pure, DOM-free
   helpers that encode the "never block" contract so it is unit-testable under the existing `node`
   vitest project:
   - `shouldShowDropdown(hasSearch: boolean, results: string[]): boolean` (false when no `search`
     source or zero results).
   - `applySelection(current: string, picked: string): { value: string; open: false }` (returns the
     exact picked string; no reformat/partial).
   - a `nextRequestGen` counter helper OR document the latest-wins guard inline.
   - Export a constant/comment asserting no code path derives an `invalid`/`error` state from match
     status (the AC5(c) invariant lives here, in testable code).
2. Create `src/lib/components/ui/combobox-freetext/ComboboxFreetext.svelte`:
   - Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$bindable`) — no Svelte 4 stores.
   - A visible `<input>` bound to `value` (the input IS the value — free-text-first). This is the
     structural reason bits-ui's item-based `Combobox` was rejected.
   - Debounced (300ms) call to `search(query)` with a `requestGen` latest-wins race guard, copied
     from `OrganizerCombobox.svelte` lines 36–75. Stale responses drop.
   - Dropdown listbox rendered below the input ONLY when `search` is provided AND results exist
     (use `shouldShowDropdown`). Free-text-only mode (`search` undefined) renders a plain input
     with zero dropdown/popover overhead.
   - Clicking a suggestion calls `applySelection` → sets `value` to the exact string, closes dropdown.
3. Add explicit ARIA combobox semantics (SPEC/INNOVATE-flagged, real task — not "polish"):
   - Input: `role="combobox"`, `aria-expanded={open}`, `aria-controls={listboxId}`,
     `aria-autocomplete="list"`, `aria-activedescendant={activeOptionId}`.
   - Listbox container: `role="listbox"` `id={listboxId}`; each option `role="option"`
     `id={optionId(i)}` `aria-selected`.
   - Keyboard: ArrowDown/ArrowUp move `activeIndex`, Enter selects the active option (falls back to
     accepting the typed free-text when no option active), Escape closes without changing `value`.
4. Create `src/lib/components/ui/combobox-freetext/index.ts` barrel exporting `ComboboxFreetext`
   (and the logic helpers for test import).
5. **Section A test gate** — write + run Fully-Automated logic tests
   (`combobox-freetext-logic.spec.ts`): (a) dropdown shows when given matches, (b) free-text value
   not in the list is forwarded unchanged, (c) no invalid/error state from an unmatched value,
   (d) `applySelection` returns the exact string. Run `bun run check` + `bun run test:unit:ci`.
   If the component-test harness is added (Test Infra Notes), also add a `.svelte.test.ts`
   rendering assertion for AC2/AC4.

### Section B — Organizer Name suggestion wiring  (proves AC2, AC3, AC4)

6. Add a small suggestion-fetcher (inline per call site or a tiny shared helper) that calls
   `GET /api/organizers?q=${encodeURIComponent(q)}`, reads `{ organizers: {id,name}[] }`, and maps
   to `organizers.map(o => o.name)` (dedupe if desired). Reuse the existing endpoint — do NOT build
   a new one (it already serves name-only lookup; id is ignored for free-text).
7. `src/routes/leads/new/+page.svelte` (~line 206): replace `<Input id="name" bind:value={name} …>`
   with `<ComboboxFreetext id="name" bind:value={name} search={fetchOrganizerNames} placeholder="e.g. Christian Concerts PH" {...fieldErrorAttrs('name', fieldErrors.name)} />`. Keep the `<Label>` and `<FieldError>` exactly as-is.
8. `src/lib/components/leads/LeadEditModal.svelte` (~line 122): same replacement for the `el-name` input.
9. `src/routes/leads/[id]/edit/+page.svelte` (~line 150): same replacement for the `name` input.
10. Confirm NO Zod change: `leadCreateSchema.name` / `leadUpdateSchema.name` stay
    `z.string().trim().min(1)` (no enum/foreign-key). AC3 requires the field remain free-text.
11. **Section B test gate** — Fully-Automated Vitest asserting the lead name Zod fields have no
    enum/`.refine` "must match" constraint (AC3). Hybrid e2e (type→dropdown→click→fill, AC2/AC4)
    written with a `test.skip()` self-guard per the `calendar.e2e.ts` pattern (known-gap: shared
    auth fixture). Run `bun run check` + `bun run test:unit:ci`.

### Section C — Meeting Venue field + persistence chain  (proves AC1)

12. **Drizzle migration-journal drift pre-flight (MANDATORY before `db:generate`)** — per
    `all-context.md` §Drizzle conventions:
    - Confirm `drizzle/meta/_journal.json` last `idx` (currently **25**) matches the
      highest-numbered `.sql` by filename (currently **`0025_mature_aaron_stack.sql`**) — they match.
    - Scan `drizzle/` for duplicate-prefix/stray files. **Known pre-existing drift:** two `0014_*`
      files (`0014_agreements_fields.sql`, `0014_nasty_master_mold.sql`) — already tracked in
      `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`. Do NOT reconcile
      it here (out of scope); only confirm it has NOT grown (no new duplicate/stray beyond the known
      pair). If new drift is found → STOP and flag before generating.
13. `src/lib/server/db/schema.ts`: add `venue: text('venue'),` to `crmMeetings` (next to
    `meetingUrl`, ~line 352). Nullable, no default.
14. Run `bun run db:generate` → produces `drizzle/0026_*.sql` registered at journal `idx: 26`.
    Verify the generated SQL is a single additive `ALTER TABLE crm_meetings ADD COLUMN venue text;`
    and nothing else. (Do NOT run `db:push`/`db:migrate` here — no live DB in this env; migration
    apply is a deploy-time/Hybrid step.)
15. `src/lib/types/index.ts`: add `venue?: string;` to `interface Meeting` (~line 174).
16. `src/lib/server/db/meetings.ts`:
    - Mapper `dbRowToMeeting` (~line 102): add `venue: row.venue ?? undefined,`.
    - `createMeeting` input type + insert `.values({…})`: add `venue?: string | null;` and
      `venue: input.venue ?? null,`.
    - `updateMeeting` patch type + `set`: add `venue?: string | null;` and
      `if (patch.venue !== undefined) set.venue = patch.venue;`.
17. `src/lib/zod/schemas.ts`: add `venue: z.string().optional(),` to BOTH `meetingFormSchema`
    (~line 209) and `meetingUpdateSchema` (~line 226). Free-text — no `.url()`, no enum, no length.
18. `src/routes/api/meetings/+server.ts` POST (~line 43): add `venue: data.venue || undefined,` to
    the `createMeeting({…})` call.
19. `src/routes/api/meetings/[id]/+server.ts` PATCH (~line 34): add
    `venue: data.venue !== undefined ? data.venue || null : undefined,` to the `updateMeeting({…})`
    call (mirrors the `meetingUrl` empty→null pattern).
20. `src/lib/components/meetings/MeetingFormModal.svelte`:
    - Add `venue?: string;` to `MeetingFormPayload`.
    - Add `let venue = $state('');`.
    - In the re-seed `$effect`: `venue = meeting?.venue ?? '';`.
    - Add a labeled venue input. **Decision: use `ComboboxFreetext` with no `search` prop** (free-text-only
      mode) to exercise the shared component's free-text path and keep one input idiom. Place it
      near the Meeting URL field.
    - In `submit()`: add `venue: venue.trim() || undefined,` to the `onsubmit({…})` payload.
21. `src/lib/components/meetings/MeetingsPanel.svelte` (~line 197): add `venue: payload.venue ?? '',`
    to the hand-built PATCH body. (The POST branch sends `JSON.stringify(payload)` directly, so
    venue flows automatically there — no edit needed for POST.)
22. `src/routes/meetings/[id]/+page.svelte` (~line 64): add `venue: payload.venue ?? '',` to the
    hand-built PATCH body.
23. **Section C test gate** — Fully-Automated Vitest on `meetingFormSchema`/`meetingUpdateSchema`:
    venue accepts an arbitrary string, accepts empty/omitted (optional), and imposes no format
    constraint (AC1 logic). Hybrid e2e for the create/edit modal round-trip written with
    `test.skip()` self-guard (known-gap: shared auth fixture + live DB). Run `bun run check` +
    `bun run test:unit:ci`.

### Section D — Regression + final gate

24. **AC6 regression:** confirm `LeadCombobox.svelte` and `OrganizerCombobox.svelte` files are
    untouched (`git diff --stat` shows no change to those two paths). Run any existing unit coverage
    for them; confirm green.
25. Full verification order: `bun run check` → `bun run test:unit:ci` → `bun run lint`.
    e2e (`bun run test:e2e`) runs but the new specs self-skip (known-gap).

---

## Phase Completion Rules

This is a single COMPLEX plan with 4 execution sections (A–D). Status vocabulary:

- A section is **CODE DONE** when all its checklist steps are implemented and its per-section test
  gate (the Fully-Automated tier) is green under `bun run check` + `bun run test:unit:ci`.
- A section is **VERIFIED** only when its CODE DONE gates are green AND its Hybrid gates are either
  green or recorded as the pre-accepted known-gap (shared auth fixture / live-DB harness) — never
  silently skipped.
- **Section A must be CODE DONE before Section B or C begins** (hard dependency — B and C import the
  shared component). B and C are parallel-safe once A is done.
- The plan is **complete** only when Sections A–D are VERIFIED (or CONDITIONAL with recorded
  known-gaps), every AC in the Verification Evidence table has a green Fully-Automated OR Hybrid
  gate, and no AC rests on a Known-Gap alone (vacuous-green ban).
- Code-only completion is **CODE DONE**, not VERIFIED — do not mark VERIFIED without the test-gate
  evidence recorded.

---

## Data Flow

**Organizer Name (suggestion mode):**
`AE types → ComboboxFreetext input updates value → 300ms debounce → search(q) → GET /api/organizers?q= → searchOrganizers (ilike, cap 20) → {id,name}[] → map to name[] → latest-wins guard drops stale → listbox renders → click → applySelection sets value to exact name → dropdown closes → form submit posts value as the lead name (unchanged free-text path, no match check).`

**Meeting Venue (free-text-only mode):**
`AE opens MeetingFormModal → types in venue input (ComboboxFreetext, no search prop → no dropdown) → submit() → onsubmit payload.venue → MeetingsPanel POST (JSON.stringify payload) or PATCH body (venue added) → meetingFormSchema/meetingUpdateSchema validate (optional string) → createMeeting/updateMeeting → INSERT/UPDATE crm_meetings.venue → dbRowToMeeting maps row.venue ?? undefined → back to client on invalidateAll.`

## Failure Modes & Edge Cases

- **Stale suggestion response** (fast typing) → `requestGen` latest-wins guard drops out-of-order
  responses (copied recipe). Test at logic level.
- **Empty/whitespace organizer name** → still governed by existing `z.string().trim().min(1)` at
  submit; the component does not add or remove that rule (AC3 unchanged).
- **Suggestion source errors / network fail** → swallow silently (recipe precedent), input stays
  usable as plain free-text. Never blocks submit.
- **Venue empty string vs null** → modal collapses empty→`undefined`; POST omits/undefined→`null`
  in DB; PATCH maps `'' → null` (mirrors `meetingUrl`). Distinguishes "cleared" from "untouched"
  on edit via the `!== undefined` guard.
- **Existing rows have no venue** → nullable column, read as `null`→`undefined`; no backfill; no
  UI breakage on edit of pre-existing meetings.
- **Keyboard-only user** → arrow/enter/escape nav must work; Enter with no active option accepts
  typed free-text (must not swallow the value). Explicit test/probe.
- **Migration journal drift grows** → pre-flight step 12 stops execution before `db:generate` if a
  NEW duplicate/stray appears beyond the known `0014` pair.

## Risk Predictions (COMPLEX pre-implementation scan)

- **Optimist:** Additive schema + copy of a proven recipe → low integration risk; organizer
  wiring is a 1-for-1 Input swap.
- **Pessimist / highest risks:**
  1. **Component-test infra gap** — SPEC AC4/AC5 assume Vitest component tests, but no Svelte
     component-test harness exists (see Test Infra Notes). Mitigation: pure-logic extraction (step 1)
     carries the AC5 "never block" proof Fully-Automated regardless; harness is the recommended
     add for render/click proof.
  2. **Free-text-first value model** — the input must BE the value (not a Popover-trigger label like
     `OrganizerCombobox`). Getting the two-way bind + suggestion overlay right is the core design
     work; mitigated by keeping free-text-only mode dead simple (plain input, no popover).
  3. **Venue PATCH plumbing** — two hand-built PATCH bodies (MeetingsPanel + meetings/[id]) are easy
     to miss; the POST path auto-includes venue, creating an asymmetry. Checklist steps 21–22 name
     both explicitly.
- **Security reviewer:** no auth/billing/secret surface; `GET /api/organizers` already authed; venue
  is a plain text column with no injection path beyond Drizzle-parameterized writes. No STRIDE
  concerns.
- **Maintainer:** one shared component with two modes is DRY-positive; do not fork a second
  venue-specific component.
- **UX:** dropdown must never trap focus or block typing; Escape must preserve typed text.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest: `meetingFormSchema`+`meetingUpdateSchema` accept arbitrary venue string, accept omitted, no format constraint | Fully-Automated | AC1 (venue accepts any free-text, persists) |
| Playwright e2e: create+edit meeting with venue round-trips (self-skips — shared auth fixture known-gap) | Hybrid | AC1 (persistence end-to-end) |
| Playwright e2e: type in organizer name → dropdown appears → shows matches (self-skips known-gap) | Hybrid | AC2 (clickable suggestions while typing) |
| Vitest: `leadCreateSchema.name`/`leadUpdateSchema.name` have no enum/"must match" constraint | Fully-Automated | AC3 (brand-new name accepted, no error) |
| Playwright e2e: submit unmatched organizer name end-to-end (self-skips known-gap) | Hybrid | AC3 (unmatched name saves) |
| Vitest logic: `applySelection(current, picked)` returns the exact picked string | Fully-Automated | AC4 (selecting fills exact value) |
| Playwright e2e / component render: click suggestion fills field + closes dropdown (self-skips OR needs component harness) | Hybrid | AC4 (click-to-fill UI) |
| Vitest logic: dropdown shows given matches; free-text value forwarded unchanged; no invalid state from unmatched value | Fully-Automated | AC5 (one shared component, never blocks) |
| `git diff --stat` shows `LeadCombobox.svelte` + `OrganizerCombobox.svelte` unchanged; their existing coverage stays green | Fully-Automated (regression) | AC6 (id-only pickers unaffected) |
| Existing id-picker e2e (self-skips known-gap) | Hybrid | AC6 (no behavior change) |

Every AC has at least one Fully-Automated OR Hybrid proving gate. AC4's DOM-render/click and AC2's
dropdown render are Hybrid (e2e self-skip today); their **core logic** (selection returns exact
value, dropdown-shows decision) is separately proven Fully-Automated via the extracted logic
module — so no AC rests on a Known-Gap alone (vacuous-green ban honored).

## Test Infra Improvement Notes

- **No Svelte component-test harness exists.** `vite.config.ts` defines only a `server` vitest
  project (`environment: 'node'`) that **explicitly excludes** `src/**/*.svelte.{test,spec}.{js,ts}`.
  There is no `client`/browser project, no `jsdom`/`happy-dom`, and no `@testing-library/svelte`
  dependency. Consequence: SPEC AC4/AC5's "Vitest component test importing the shared component
  directly" (render/click assertions) is **not runnable today**.
  - **Resolution A (recommended, in-scope task):** add a second vitest `client` project with
    `environment: 'happy-dom'` + include `*.svelte.{test,spec}` + devDeps `@testing-library/svelte`
    and `happy-dom`. Makes AC2/AC4/AC5 render/click Fully-Automated. This is a **new devDependency
    decision** — surface to the user/orchestrator (the ux-enhancement program already carries one
    open devDep decision re: `@axe-core/playwright`).
  - **Resolution B (fallback, always applied):** extract the "never block" + selection + dropdown
    decision logic into `combobox-freetext-logic.ts` (checklist step 1) and unit-test it under the
    existing `node` project — this proves the AC5 core contract Fully-Automated with zero new infra.
  - **Backlog stub to write if Resolution A is deferred:** `component-test-harness-decision_NOTE_07-07-26.md`
    in `process/features/ux-enhancement/backlog/` recording the deferred harness + which render/click
    assertions remain e2e-only (CONDITIONAL) until then.
- **Shared Playwright auth fixture** — pre-existing repo-wide known-gap; all new e2e specs here
  self-skip via `test.skip()` (per `all-tests.md` + `e2e-auth-bootstrap_NOTE_01-07-26.md`). Not
  introduced by this plan; inherited and pre-accepted.
- **Live-DB CI harness** — venue persistence round-trip (AC1 Hybrid) needs a live Postgres; deferred
  to the existing live-DB-harness gap. Additive migration is verifiable statically (generated SQL
  review) without a live DB.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ux-enhancement/active/combobox-suggest-freetext_07-07-26/combobox-suggest-freetext_PLAN_07-07-26.md`
2. **Last completed step:** none — plan just authored; awaiting VALIDATE.
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes it before EXECUTE).
4. **Supporting context loaded:** SPEC (same folder); `process/context/all-context.md`
   §Drizzle/§Mandatory conventions; `process/context/tests/all-tests.md`; source:
   `OrganizerCombobox.svelte`, `MeetingFormModal.svelte`, `meetings.ts`, `organizers.ts`,
   `schemas.ts`, `schema.ts`, both meeting API routes, both modal callers, the 3 organizer-name
   entry points, drizzle journal.
5. **Next step for a fresh agent:** start at **Section A step 1** (build the shared component +
   logic module) — it blocks B and C. Do the migration-journal drift pre-flight (step 12) before
   any `db:generate`. B and C are parallel-safe after A. Do NOT touch `LeadCombobox`/`OrganizerCombobox`.

---

## Validate Contract

Status: CONDITIONAL
Date: 07-07-26
date: 2026-07-07
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 schema/API surface, S6 schema-migration high-risk class, S7 5+ files). Single self-contained COMPLEX plan, all context in-window, no cross-agent coordination needed — sequential deep-investigation fan-out fits (MEDIUM tier, but fit-over-tier per strategy-compare).

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Meeting Venue schema accepts any free-text, optional, no format constraint | Fully-Automated | Vitest on `meetingFormSchema`/`meetingUpdateSchema`: `venue` accepts arbitrary string, accepts omitted/empty, rejects nothing on format — `bun run test:unit:ci` | A |
| AC1 | Venue persists end-to-end (create + edit round-trip) | Hybrid | Playwright create/edit meeting w/ venue — precondition: shared auth fixture + live Postgres — `bun run test:e2e` (self-skips) | D |
| AC2 | Dropdown-shows decision given matches | Fully-Automated | Vitest `shouldShowDropdown(hasSearch, results)` true only with source + results — `bun run test:unit:ci` | A |
| AC2 | Type→dropdown renders (all 3 entry points) | Hybrid | Playwright type→dropdown appears — precondition: shared auth fixture — `bun run test:e2e` (self-skips) | D |
| AC3 | Lead name Zod field has no enum/must-match | Fully-Automated | Vitest asserts `leadCreateSchema.name`/`leadUpdateSchema.name` = `z.string().trim().min(1)`, no enum/refine — `bun run test:unit:ci` | A |
| AC3 | Unmatched name submits end-to-end | Hybrid | Playwright submit unmatched organizer name — precondition: shared auth fixture — `bun run test:e2e` (self-skips) | D |
| AC4 | Selecting a suggestion returns the exact picked string | Fully-Automated | Vitest `applySelection(current, picked)` returns exact `picked`, `open:false` — `bun run test:unit:ci` | A |
| AC4 | Click-to-fill DOM behavior (render + click + close) | Hybrid | Playwright click-to-fill OR component `.svelte.test.ts` — precondition: shared auth fixture OR happy-dom harness — (self-skips) | C |
| AC5 | One shared component, never blocks (dropdown shows, free-text forwarded, no invalid state) | Fully-Automated | Vitest logic: matches shown, unmatched value forwarded unchanged, no error/invalid state derived from match status — `bun run test:unit:ci` | A |
| AC6 | Id-only pickers (`LeadCombobox`/`OrganizerCombobox`) byte-for-byte unchanged | Fully-Automated | `git diff --stat` shows both paths unchanged; existing unit coverage stays green | A |
| AC6 | Id-picker e2e behavior unchanged | Hybrid | Existing id-picker Playwright coverage — precondition: shared auth fixture — (self-skips) | D |

gap-resolution legend: A — proven now · B — fixed in this plan · C — deferred to a named later phase/plan · D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: `strategy:` column carries ONLY Fully-Automated / Hybrid. Known-Gap is never a strategy — the residual DOM/e2e coverage is carried via gap-resolution C/D.

**Failing stubs (Fully-Automated rows only):**

AC1:
```
test("should accept arbitrary venue free-text, optional, with no format constraint", () => { throw new Error("NOT IMPLEMENTED — TDD stub: meetingFormSchema/meetingUpdateSchema venue accepts any string + omitted") })
```
AC2:
```
test("should show dropdown only when a search source is present and results are non-empty", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shouldShowDropdown(hasSearch, results)") })
```
AC3:
```
test("should keep lead name field free-text with no enum/must-match constraint", () => { throw new Error("NOT IMPLEMENTED — TDD stub: leadCreateSchema.name/leadUpdateSchema.name no enum") })
```
AC4:
```
test("should return the exact picked string when a suggestion is selected", () => { throw new Error("NOT IMPLEMENTED — TDD stub: applySelection returns exact picked value, open:false") })
```
AC5:
```
test("should forward unmatched free-text unchanged and never derive an invalid state from match status", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC5 never-block invariant") })
```
AC6:
```
test("should leave LeadCombobox.svelte and OrganizerCombobox.svelte unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub: git diff --stat regression on id-only pickers") })
```

Legacy line form (retained for existing consumers):
- Venue schema (AC1): Fully-automated: `bun run test:unit:ci`
- Venue persistence (AC1): hybrid: `bun run test:e2e` + precondition: shared auth fixture + live Postgres (self-skips — known-gap)
- Dropdown-shows logic (AC2): Fully-automated: `bun run test:unit:ci`
- Organizer type→dropdown (AC2): hybrid: `bun run test:e2e` + precondition: shared auth fixture (self-skips — known-gap)
- Lead name no-enum (AC3): Fully-automated: `bun run test:unit:ci`
- Unmatched submit (AC3): hybrid: `bun run test:e2e` + precondition: shared auth fixture (self-skips — known-gap)
- applySelection (AC4): Fully-automated: `bun run test:unit:ci`
- Click-to-fill DOM (AC4): hybrid: `bun run test:e2e` OR component harness (self-skips OR needs happy-dom — known-gap)
- Shared-component never-block (AC5): Fully-automated: `bun run test:unit:ci`
- AC6 regression: Fully-automated: `git diff --stat` on the two id-picker paths
- Final verification order: `bun run check` → `bun run test:unit:ci` → `bun run lint`; `bun run test:e2e` runs (new specs self-skip)

Dimension findings:
- Infra fit: CONCERN — component location/convention correct; migration `0026` correctly sequenced (journal idx 25 + tag `0025_mature_aaron_stack` independently confirmed, known `0014` drift pair has NOT grown; drift pre-flight is real checklist step 12); reuses live `GET /api/organizers`. CONCERN: adding the vitest `client` project + `@testing-library/svelte`+`happy-dom` devDeps (both confirmed ABSENT) is a new-devDependency decision (Resolution A, "recommended") — same root as the test-coverage concern.
- Test coverage: CONCERN — all Fully-Automated logic + schema gates (AC1/AC3/AC4/AC5/AC6) are runnable today under the existing `node` vitest project; AC2/AC4 DOM render/click have NO component-level automated proof because no Svelte component-test harness exists (`vite.config.ts` single `node` project excludes `*.svelte.{test,spec}` — confirmed). Routed around via pure-logic extraction (Resolution B, always applied) so no AC rests on Known-Gap alone. Pre-accepted test-infra gap class (directly analogous to axe-core devDep precedent).
- Breaking changes: PASS — all additive: nullable `venue` column (no default/NOT NULL/backfill), optional Zod field, additive component. AC6 hard constraint is a real checklisted regression gate (step 24); lead name Zod fields confirmed unchanged; existing callers omitting `venue` still validate.
- Security surface: PASS — venue is plain text via Drizzle-parameterized writes (no injection); `GET /api/organizers` already session-authed, no auth surface change; no billing/secrets/trust-boundary; migration additive (no destructive mutation). Schema/migration high-risk class satisfied by the Hybrid venue-persistence gate + static generated-SQL review (step 14).
- Section A (shared component) feasibility: PASS — new dir does not collide (confirmed absent); recipe source `OrganizerCombobox.svelte` L37/L74 confirmed; ARIA task is real checklist step 3; highest-risk edit = free-text-first value model (input IS the value), mitigated by dead-simple free-text-only mode.
- Section B (organizer wiring) feasibility: PASS — all 3 entry points exist; endpoint shape `{organizers:{id,name}[]}` confirmed; no Zod change (step 10); highest-risk edit = 3 near-identical Input→ComboboxFreetext swaps (low, mechanical).
- Section C (venue chain) feasibility: PASS — every chain target verified (schema L352, types, meetings.ts mapper L102/create L323/update L364, both schemas L199/L217, both API routes, both PATCH bodies). The two flagged hand-built PATCH bodies (MeetingsPanel L197 + meetings/[id] L64) are BOTH explicitly checklisted (steps 21, 22); POST auto-includes via `JSON.stringify(payload)`. Highest-risk edit = PATCH/POST asymmetry, named explicitly and mitigated.
- Section D (regression + final gate) feasibility: PASS — AC6 `git diff --stat` (step 24) + full verification order (step 25).

Open gaps:
- Svelte component-test harness absent — AC2/AC4 DOM render/click cannot be component-level automated without adding `@testing-library/svelte`+`happy-dom` (new devDep decision). CONDITIONAL-accepted; core logic proven Fully-Automated. Backlog stub to write if Resolution A is deferred: `component-test-harness-decision_NOTE_07-07-26.md` in `process/features/ux-enhancement/backlog/`.
- Shared Playwright auth fixture (inherited repo-wide known-gap) — all new e2e specs self-skip. Not introduced by this plan; pre-accepted.
- Live-DB CI harness — venue persistence round-trip (AC1 Hybrid) needs live Postgres; additive SQL statically verifiable meanwhile. Pre-accepted.

What this coverage does NOT prove:
- `bun run test:unit:ci` (AC1/AC3): proves the Zod schema shape (venue optional/free-text; lead name no-enum) — does NOT prove the value actually round-trips through the DB column, nor that the migration was applied.
- `bun run test:unit:ci` (AC2/AC4/AC5 logic): proves `shouldShowDropdown`/`applySelection`/never-block invariant as pure functions — does NOT prove the rendered `<input>` binds two-way, the dropdown renders visually, a real click fills the field, or ARIA attributes/keyboard nav behave in a browser.
- `git diff --stat` (AC6): proves the two id-picker files are untouched on disk — does NOT prove their runtime behavior is unchanged (relies on their existing coverage staying green).
- `bun run test:e2e` (all Hybrid): currently self-skips — proves nothing until the shared auth fixture + live-DB harness exist.

Gate: CONDITIONAL (concerns noted, orchestrator-accepted; 0 FAILs)
Accepted by: session (autonomous, /goal execution) — accepted concerns: (1) Svelte component-test harness absent → AC2/AC4 DOM render/click carried as Hybrid known-gap, core logic proven Fully-Automated; (2) new-devDependency decision for `@testing-library/svelte`+`happy-dom` deferred (Resolution B fallback always applied). Both are the same root gap and match the pre-accepted axe-core devDep precedent (`process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`).

## Autonomous Goal Block

```
SESSION GOAL: Combobox suggest + free-text (GitHub #250) — one shared free-text-first ComboboxFreetext component; organizer-name suggestions at 3 entry points; new persisted Meeting Venue field + migration 0026.
Charter + umbrella plan: N/A — single COMPLEX plan
Autonomy: /goal autonomous execution authorized (feedback_autonomous_phase_execution.md). CONDITIONAL gaps accepted autonomously; drive plan-validate-fix loop up to 10-cycle cap; no per-gate user check-in.
Hard stop conditions / safety constraints:
- Do NOT touch LeadCombobox.svelte or OrganizerCombobox.svelte (SPEC AC6 hard constraint).
- Run the Drizzle migration-journal drift pre-flight (checklist step 12) BEFORE `bun run db:generate`; STOP if new duplicate/stray beyond the known 0014 pair appears.
- Do NOT run `db:push`/`db:migrate` (no live DB in this env); migration apply is deploy-time.
- Both hand-built PATCH bodies (MeetingsPanel L197 + meetings/[id] L64) MUST add `venue` (checklist steps 21, 22).
Next phase: EXECUTE — process/features/ux-enhancement/active/combobox-suggest-freetext_07-07-26/combobox-suggest-freetext_PLAN_07-07-26.md
Validate contract: inline in plan (## Validate Contract, gate CONDITIONAL)
Execute start: Section A first (blocks B and C). Fully-auto gates: `bun run check` → `bun run test:unit:ci` → `bun run lint`. E2e: `bun run test:e2e` (new specs self-skip). High-risk pack: no (additive nullable schema only).
```
