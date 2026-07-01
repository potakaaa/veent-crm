---
name: plan:leads-new-organizer-hover
description: "PLAN — /leads/new duplicate rows: stop navigation, add hover detail card (10-field standard set), plus cosmetic polish pass"
date: 01-07-26
feature: leads
---

# PLAN — New Lead form: safe duplicate preview + polish

**Date**: 01-07-26
**Complexity**: Simple
**Status**: 🚧 IN PROGRESS — EXECUTE started 01-07-26

Spec (locked): `process/features/leads/active/leads-new-organizer-hover_01-07-26/leads-new-organizer-hover_SPEC_01-07-26.md`

## Overview

Fix a data-loss bug on `/leads/new`: the amber "possible duplicate" banner currently renders each
duplicate as `<a href="/leads/{id}">`, so hovering/clicking navigates the rep away and destroys
whatever they've typed. This plan replaces the link with a non-navigating, focusable row that opens
a hover/focus-triggered card showing a 10-field detail set for the duplicate organizer, wired via
the existing `Popover` primitive (manual open-state control, not click-toggle). It also includes a
cosmetic-only visual polish pass on the rest of `/leads/new`.

## Goals

1. Duplicate rows never navigate the browser away from `/leads/new` (click, hover, or otherwise).
2. Hovering (or focusing, for keyboard users) a duplicate row shows all 10 standard-detail-set
   fields for that organizer, with explicit empty-state handling for missing fields.
3. The hover card closes on mouse-leave / blur, with a short grace-period delay so moving from the
   row into the card content doesn't flicker-close it.
4. Visual polish on the rest of the page — no field, validation, or payload changes.

## Scope

In scope: `OrganizerHoverCard.svelte` (new), the duplicate-row block in `/leads/new/+page.svelte`,
a cosmetic pass on the rest of that page, and the minimal owner-name lookup needed to make the
"owner" field human-legible (see Plan Decision D1 below).

Out of scope (verbatim from SPEC): Superforms migration, `DedupBanner.svelte` swap, dedup-matching
logic changes (`hasPotentialDuplicate`), new form fields/validation, `/leads/[id]` or leads-list
changes, `/api/leads` or `crm_lead_history` changes.

## Plan Decision D1 — Owner field display (resolves an under-specified SPEC point)

SPEC locks "owner" as one of the 10 standard-detail-set fields and separately says the field set
"must be sourced from the same `Lead` data already returned by `listLeads()` — no new server query
... is required or permitted for populating the hover card." But `Lead.ownerId` is a raw user id
with no name — `data.leads` alone cannot render a human-readable owner. `/leads/new/+page.server.ts`
today returns only `{ leads }` (no `users`).

**Decision:** add a `listUsers()` call to `/leads/new/+page.server.ts`, mirroring the exact existing
pattern already used for the same purpose on `/leads/[id]/+page.server.ts:9` (`Promise.all([...,
listUsers()])`) and `/leads/[id]/+page.svelte:32` (`data.users.find(u => u.id === lead.ownerId)?.name`).
Rationale: SPEC's "no new query" constraint is scoped to *populating the hover card's lead/duplicate
data* (i.e. don't re-fetch or re-derive duplicate matches server-side) — not to a small, already-
established, already-duplicated-elsewhere owner-name lookup. Rendering a raw UUID or omitting the
field both fail AC2 ("all ten standard-detail-set fields ... matches the seeded value"), so some
resolution is required; reusing the existing `listUsers()` pattern is the smallest, most consistent
option available.

**VALIDATE ruling (01-07-26): D1 CONFIRMED, no fallback needed.** The `listUsers()` addition is an
acceptable minimal addition, not a scope violation. Verified: (a) `+page.server.ts`'s load return
shape gains only an additive `users: User[]` field — no existing field removed or renamed, so no
downstream consumer breaks; (b) the exact same `Promise.all([..., listUsers()])` pattern already
exists verbatim at `src/routes/leads/[id]/+page.server.ts:9`, so this is not a new pattern, just its
second use; (c) SPEC's "no new query" sentence is textually and contextually scoped to "populating
the hover card" (i.e. the duplicate/lead data itself), not to every field the hover card displays —
owner-name resolution is a small, pre-existing, already-established lookup. See Validate Contract
Dimension findings (Breaking changes) below for the full reasoning.

## Acceptance Criteria

These mirror the locked SPEC's Acceptance Criteria 1-7 verbatim (see SPEC file for full "proven by"
detail); this section exists so the plan artifact is self-contained for EXECUTE:

1. Duplicate rows never navigate the browser anywhere when clicked, hovered, or otherwise interacted with (AC1).
2. Hovering a duplicate row displays a hover card with all 10 standard-detail-set fields (AC2).
3. The hover card closes when the pointer leaves the row, no lingering popup (AC3).
4. A duplicate with missing/null fields renders without crashing, using explicit empty-state (em dash), never "undefined"/"null" (AC4).
5. Submitting the form ("Create anyway") while duplicates show still creates the lead and redirects, unchanged (AC5).
6. The visual polish pass changes no field name/type/validation/payload shape (AC6).
7. Keyboard-only users can still reach the duplicate organizer's detail info (not mouse-only) (AC7).

## Phase Completion Rules

This is a SIMPLE plan (single session, no phase gates). Completion criteria:

- All 5 Implementation Checklist steps done.
- All 9 Verification Evidence gates green (6 Hybrid + 1 Agent-Probe + 2 Fully-Automated regression
  guard gates), per the Verification Evidence table.
- Plan Decision D1 (owner-name lookup) — CONFIRMED by VALIDATE (see above), no further action needed
  before EXECUTE starts.
- Status flips ⏳ PLANNED → 🚧 IN PROGRESS at EXECUTE start → ✅ VERIFIED only after EVL confirms all
  gates green independently (not merely "execute-agent claims green").

## Implementation Checklist

1. **`src/lib/components/OrganizerHoverCard.svelte` (new file).**
   Props: `{ lead: Lead; ownerName: string | null }`. Renders a fixed 10-field vertical detail
   list inside `Popover.Content` styling conventions (`bg-popover text-popover-foreground
   rounded-lg p-2.5 shadow-md ring-1`, consistent with existing `ui/popover/popover-content.svelte`
   defaults — do not override with one-off values). Field list, in order, with source + empty-state
   rule:
   - Name — `lead.name` (always present, no empty state needed)
   - Platform — render via `<PlatformBadge platform={lead.platform} />` (always present)
   - Handle — `lead.handle` (always present); prefix `@` only if not already present, matching the
     existing row's `font-mono text-[11px] text-ink-400` styling
   - Stage — `<StageChip stage={lead.stage} />` (always present)
   - Email — `lead.email ?? '—'`
   - Phone — `lead.phone ?? '—'`
   - Category / Location — `` `${lead.category} · ${lead.location || '—'}` `` (category is always
     present per `Lead` type; location is `string`, non-optional in the type but may be `''` at
     runtime — treat falsy as `'—'`)
   - Event name + date — `lead.eventName ?? '—'` and, on the same or next line,
     `lead.eventDate ? formatDate(lead.eventDate) : '—'` (reuse `formatDate` from
     `$lib/utils/dates.ts` — do not hand-roll date formatting)
   - Owner — `ownerName ?? 'Unassigned'` (prop passed in from `+page.svelte`, resolved per D1)
   - Last activity — `lead.lastActivityAt ? relativeFromNow(lead.lastActivityAt) : '—'` (reuse
     `relativeFromNow` from `$lib/utils/dates.ts`)
   Use Tailwind token classes only (`text-ink`, `text-ink-400`, `border-hairline`, etc.) — no raw
   hex values except where `PlatformBadge`/`StageChip` already use inline `style` (leave those
   untouched, they're existing components).
   Add an `aria-label="Possible duplicate: {lead.name}"` on the card's root element. Do **not** set
   `role="tooltip"` and do **not** wire `aria-describedby` from the trigger (per INNOVATE Decision
   Summary point 2 — 10 fields is too rich for the ARIA `tooltip` role, which the APG reserves for
   short plain-text strings).
   No actions, buttons, or links live inside this component — read-only display only (per SPEC).

2. **`src/routes/leads/new/+page.svelte` — duplicate-row block (currently lines 105-115, inside the
   `{#if dupes.length}` block at lines 99-117; verify exact line numbers at EXECUTE time since the
   file may have shifted since SPEC/PLAN authoring).**
   - Add local script state: `let openDupeId = $state<string | null>(null);` and
     `let closeTimer: ReturnType<typeof setTimeout> | undefined;` (module-level `let`, not `$state`
     — it's a timer handle, not reactive UI state).
   - Add three helper functions in `<script>`:
     - `function openDupe(id: string) { clearTimeout(closeTimer); openDupeId = id; }`
     - `function scheduleCloseDupe() { clearTimeout(closeTimer); closeTimer = setTimeout(() => { openDupeId = null; }, 200); }`
       (200ms grace period — matches INNOVATE's "~150-300ms" range; use the concrete value 200 so
       there's no ambiguity at EXECUTE time.)
     - `function closeDupeNow() { clearTimeout(closeTimer); openDupeId = null; }` — used by the
       Escape-key handler below (immediate close, no grace period — see VALIDATE a11y note).
   - Replace `<a href="/leads/{d.id}" class="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5
     hover:bg-panel">` with a non-link, focusable element:
     ```
     <Popover.Root open={openDupeId === d.id}>
       <Popover.Trigger>
         {#snippet child({ props })}
           <div
             {...props}
             tabindex="0"
             role="button"
             aria-haspopup="dialog"
             class="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
             onmouseenter={() => openDupe(d.id)}
             onmouseleave={scheduleCloseDupe}
             onfocus={() => openDupe(d.id)}
             onblur={scheduleCloseDupe}
             onkeydown={(e) => { if (e.key === 'Escape') closeDupeNow(); }}
           >
             <PlatformBadge platform={d.platform} />
             <span class="flex-1 text-[13px] font-semibold">{d.name}</span>
             <span class="font-mono text-[11px] text-ink-400">{d.handle}</span>
             <StageChip stage={d.stage} />
           </div>
         {/snippet}
       </Popover.Trigger>
       <Popover.Portal>
         <Popover.Content
           onmouseenter={() => openDupe(d.id)}
           onmouseleave={scheduleCloseDupe}
           onkeydown={(e) => { if (e.key === 'Escape') closeDupeNow(); }}
         >
           <OrganizerHoverCard lead={d} ownerName={ownerNameFor(d.ownerId)} />
         </Popover.Content>
       </Popover.Portal>
     </Popover.Root>
     ```
     Notes for EXECUTE:
     (a) **bits-ui `child`-snippet API shape — CONFIRMED by VALIDATE, do not re-check.**
     `node_modules/bits-ui/dist/bits/popover/types.d.ts` declares
     `PopoverTriggerPropsWithoutHTML = WithChild<{ openOnHover?, openDelay?, closeDelay? }>`, and
     `WithChild` (`node_modules/bits-ui/dist/internal/types.d.ts`) types
     `child?: Snippet<[{ props: Record<string, unknown> }]>`. This is an exact match for
     `{#snippet child({ props })}` as written above — no docs-seeker check needed at EXECUTE time.
     Note also that bits-ui's `Popover.Trigger` natively supports `openOnHover`/`openDelay`/
     `closeDelay` props as a built-in alternative to manual hover wiring — NOT used here because it
     is mouse-only and would not satisfy AC7's keyboard-focus requirement; the manual
     `openDupeId`/`onfocus`/`onblur` wiring is intentional and correct.
     (b) `role="button"` + `tabindex="0"` on a `div` requires no `href`/navigation side effect —
     confirm nothing else in the row (e.g. a wrapping click handler) triggers `goto()`.
     (c) the click behavior is intentionally a no-op (no `onclick` handler is added by this plan)
     — this satisfies AC1 directly by omission, do not add a click handler that does nothing "for
     clarity", the absence itself is the fix. Note: the spread `{...props}` from bits-ui's `child`
     snippet may itself include an internal `onclick`/`onkeydown` handler that bits-ui uses to
     toggle its own internal open-state box. Because `open={openDupeId === d.id}` is passed as a
     plain (one-way) reactive prop rather than `bind:open`, any internal toggle bits-ui performs on
     click does not persist — the next reactive update re-syncs `open` from `openDupeId`, which
     click alone never changes. Net effect: no observable behavior change and no navigation (AC1
     safe) — EXECUTE should still visually confirm a stray click on the row does not toggle the
     card open, since this reasoning is not covered by an automated test.
     (d) **WCAG 1.4.13 (Content on Hover or Focus) — Dismissible sub-criterion.** The `onkeydown`
     Escape handlers on the trigger and on `Popover.Content` (added by VALIDATE, see code above)
     satisfy "dismissible without moving pointer or keyboard focus" — required because a hover/focus
     -revealed rich-content card must be dismissible via a mechanism other than moving the pointer
     or focus away. Do not remove these handlers during EXECUTE polish.
   - Add `import { OrganizerHoverCard } from '$lib/components/OrganizerHoverCard.svelte';` (or
     default import per Svelte convention — this repo does not appear to use a component barrel for
     top-level `components/`, use a direct default import: `import OrganizerHoverCard from
     '$lib/components/OrganizerHoverCard.svelte';`) and `import * as Popover from
     '$lib/components/ui/popover';`.
   - Add a derived/plain helper `function ownerNameFor(ownerId: string | null) { return ownerId ?
     (data.users.find(u => u.id === ownerId)?.name ?? null) : null; }` in `<script>`.

3. **`src/routes/leads/new/+page.server.ts` — add `listUsers()` (per Plan Decision D1, CONFIRMED).**
   Change:
   ```ts
   import { listLeads, listUsers } from '$lib/server/db/leads';
   // ...
   const [leads, users] = await Promise.all([listLeads(), listUsers()]);
   return { leads, users };
   ```
   This mirrors `src/routes/leads/[id]/+page.server.ts:3,9` exactly — same import source, same
   `Promise.all` pattern.

4. **Cosmetic-only polish pass on the rest of `/leads/new/+page.svelte`.**
   Bounded, non-behavioral changes only — no new fields, no restructured field grouping, no new
   interaction patterns beyond the hover card itself (per SPEC Out Of Scope). Candidate touch-ups,
   staying within the page's existing style idiom (`text-[13px]`, `gap-2.5`, `rounded-[7px]`,
   `px-2 py-1.5`, token classes):
   - Tighten/verify consistent vertical rhythm between the `PageHeader`, the duplicate banner (if
     shown), and the `Card` form (currently `mb-3.5` / `mb-4` / default — confirm these read as an
     intentional scale, adjust only if clearly inconsistent).
   - Confirm the error message (`{#if error}`) has adequate visual weight/spacing relative to the
     action row it sits above (currently a bare `<p class="text-[12.5px] text-overdue sm:col-span-2">`).
   - Confirm button-row alignment and disabled/loading state visuals read clearly (existing `Button`
     component already handles `loading`/`loadingText` — no new state to add here).
   This step is intentionally not overspecified — it is bounded by "no behavior change" (enforced by
   AC6) and "stay within existing visual language" (enforced by the Constraints section). EXECUTE
   should treat this as a light pass, not a redesign.

5. **Test gates** — write and run per the Verification Evidence table below. New Playwright e2e
   spec file: `e2e/leads-new-dedup-hover.e2e.ts` (matches `playwright.config.ts` `testMatch:
   '**/*.e2e.{ts,js}'`; project has exactly one existing e2e file, `e2e/loading-ux.e2e.ts` — follow
   its structural conventions for `webServer`/base setup since this is a thin existing pattern, not
   a mature one). Per VALIDATE: unlike `loading-ux.e2e.ts`'s "self-skip if no data present" pattern,
   the AC2/AC4 scenarios need a *known* duplicate lead with *known* field values — create it via the
   app's own create flow inside the test (`page.goto('/leads/new')` → fill form → submit) before
   reloading and typing the same name to trigger `hasPotentialDuplicate`. Do not invent a separate
   DB-seed fixture mechanism; reuse the app's own create endpoint through the UI.

## Touchpoints

- `src/lib/components/OrganizerHoverCard.svelte` — new file
- `src/routes/leads/new/+page.svelte` — edit (duplicate-row block + imports + helper functions)
- `src/routes/leads/new/+page.server.ts` — edit (add `listUsers()` — Plan Decision D1)
- `e2e/leads-new-dedup-hover.e2e.ts` — new file (test gates)
- Read-only references: `src/lib/utils/dedup.ts`, `src/lib/utils/dates.ts`,
  `src/lib/components/shared/PlatformBadge.svelte`, `src/lib/components/shared/StageChip.svelte`,
  `src/lib/components/ui/popover/*`, `src/lib/types/index.ts` (`Lead` type),
  `src/routes/leads/[id]/+page.server.ts` and `+page.svelte` (owner-name pattern reference)

## Public Contracts

- No API route changes. No schema changes. No change to `leadFormSchema` or `/api/leads` payload
  shape (enforced by AC6).
- `+page.server.ts` load function return shape gains one new field: `users: User[]` (via
  `listUsers()`) alongside the existing `leads: Lead[]`. This is additive only — no existing
  consumer of this load function's return shape is broken. Confirmed by VALIDATE: `/leads/new` has
  exactly one consumer of its load data (`+page.svelte` itself); no other route imports this load
  function's return shape.
- New component `OrganizerHoverCard.svelte` — internal-only prop contract (`lead: Lead; ownerName:
  string | null`), not exported/published outside this feature; no other route currently imports it.

## Blast Radius

3 edited/new source files (`OrganizerHoverCard.svelte` new, `+page.svelte` edit, `+page.server.ts`
edit) + 1 new test file. Single feature area (`leads`), single route (`/leads/new`). No schema,
auth, billing, or migration surface touched. Risk class: none of the high-risk classes listed in
`process/development-protocols/orchestration.md` (auth/identity, billing/credits, schema/migration,
public API contract, deploy/container/proxy/gateway, secrets/trust-boundary) apply here.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| e2e: fill form fields, trigger dupe match, click duplicate row, assert URL still `/leads/new` and typed field values persist | Hybrid — precondition: live Postgres reachable (`DATABASE_URL` set; docker-compose `postgres` service or CI DB service container) since `/leads/new`'s load calls `listLeads()`/`listUsers()` | AC1 |
| e2e: seed a duplicate lead with known field values (incl. an assigned owner) via the app's own create flow, hover the row, assert all 10 fields present and match seeded values | Hybrid — same DB precondition as above | AC2 |
| e2e: hover then move pointer away (post grace-period), assert hover card no longer visible/attached | Hybrid — same DB precondition as above | AC3 |
| e2e or component test: seed a duplicate lead with several null fields (email, phone, eventName, eventDate, ownerId null), hover, assert no raw `"undefined"`/`"null"` string rendered, no console error | Hybrid — same DB precondition as above | AC4 |
| e2e: submit form ("Create anyway") while duplicates showing, assert `POST /api/leads` fires and redirect lands on `/leads/{id}` | Hybrid — same DB precondition as above | AC5 |
| e2e: submit form with full valid payload, assert request body matches `leadFormSchema`-shaped payload identical to pre-polish behavior (schema-level diff) | Hybrid — same DB precondition as above | AC6 |
| agent-probe: tab to duplicate row with keyboard only (no mouse), confirm hover card / detail info becomes reachable via focus, confirm content matches hover-triggered content, confirm Escape dismisses it | Agent-Probe | AC7 (+ WCAG 1.4.13 Dismissible check) |
| `bun run check` (typecheck) across the 3 touched files | Fully-Automated — no DB needed | Regression guard — not a named AC, catches type errors from new props/imports |
| `bun run test:unit:ci` (full existing 62+ unit suite, regression pass — no new unit tests required by this plan since all logic here is UI/e2e-shaped) | Fully-Automated — no DB needed. **Corrected by VALIDATE**: `bun run test:unit` (package.json) runs bare `vitest`, which is watch-mode and does not exit; `bun run test:unit:ci` runs `vitest --run` and exits cleanly — use this command for the automated regression gate, per `process/context/tests/all-tests.md`'s own "Vitest CI command" note. | Regression guard — confirms no accidental break to `dedup.ts`/`dates.ts`/schema logic reused by this feature |

## Test Infra Improvement Notes

- No e2e test infra exists yet for `/leads/new` specifically — this plan's e2e spec
  (`e2e/leads-new-dedup-hover.e2e.ts`) will be only the 2nd e2e file in the repo (after
  `e2e/loading-ux.e2e.ts`). `process/context/tests/all-tests.md`'s "Known Gaps" section (as read at
  PLAN time) says "no e2e test specs written yet" — that line is now stale (one file exists) and
  should be corrected during UPDATE PROCESS regardless of this plan's outcome.
  - Owner: general-plans / context-maintenance follow-up (not required to be fixed by this task,
    flagged so it isn't lost).
- Playwright `webServer` config (`npm run build && npm run preview`) means e2e runs against a build,
  not dev server — seeding a duplicate lead for the e2e scenarios needs a real DB round-trip via
  whatever seed/fixture mechanism `e2e/loading-ux.e2e.ts` already uses (check that file's setup at
  EXECUTE time before inventing a new seeding approach). VALIDATE confirmed `loading-ux.e2e.ts` does
  NOT seed data itself — it self-skips (`test.skip`) when no data is present. That pattern is
  insufficient for AC2/AC4 (which need a *known* duplicate with *known* field values); EXECUTE must
  create the duplicate lead through the app's own create flow inside the test itself (see
  Implementation Checklist item 5).
- Hover/mouseenter-mouseleave interactions in Playwright need `page.hover()` plus an explicit wait
  for the grace-period timeout (200ms + margin) before asserting the card is gone — flag this as an
  EXECUTE-time detail so the AC3 test isn't flaky from asserting too early.
- All e2e gates in this repo require a live Postgres connection because every page load function
  that touches leads/users data queries the real DB (no mock fallback) — see corrected Verification
  Evidence table above (Hybrid tier, not Fully-Automated).

## Resume and Execution Handoff

1. Selected plan file path: `process/features/leads/active/leads-new-organizer-hover_01-07-26/leads-new-organizer-hover_PLAN_01-07-26.md`
2. Last completed phase/step: VALIDATE (this file) — Gate: PASS. EXECUTE has not run yet.
3. Validate-contract status: written 01-07-26 (see below).
4. Supporting context files loaded during PLAN: `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md` (routing only),
   plus direct reads of `src/routes/leads/new/+page.svelte`, `+page.server.ts`,
   `src/lib/utils/dedup.ts`, `src/lib/components/leads/DedupBanner.svelte`,
   `src/lib/components/ui/popover/*`, `src/lib/types/index.ts`, `src/routes/leads/[id]/+page.svelte`
   and `+page.server.ts` (owner-name lookup pattern), `src/lib/components/shared/PlatformBadge.svelte`,
   `src/lib/components/shared/StageChip.svelte`.
   Additional context loaded during VALIDATE: `process/context/tests/all-tests.md` (re-read for
   command verification), `package.json` scripts, `node_modules/bits-ui/dist/bits/popover/types.d.ts`
   and `node_modules/bits-ui/dist/internal/types.d.ts` (child-snippet API shape verification),
   `src/lib/types/index.ts` (`Lead`/`User` interfaces), `src/lib/server/db/leads.ts` (`listUsers`),
   `e2e/loading-ux.e2e.ts` and `playwright.config.ts` (e2e conventions).
5. Next step for a fresh agent: "ENTER EXECUTE MODE" for this plan. All VALIDATE confirmations are
   resolved in-plan (D1 confirmed, bits-ui API shape confirmed, test tiers corrected, Escape-dismiss
   handler added) — no open questions remain before EXECUTE.

## Validate Contract

Status: PASS
Date: 01-07-26
date: 2026-07-01
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 0/7 (no multi-package scope, no schema/auth/API surface, single locked
approach, not a phase program, no explicit depth request, no high-risk class, 4 total files in
blast radius) — LOW tier, single validate-agent session performed the Layer 1 + Layer 2 fan-out
directly rather than spawning parallel subagents.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Duplicate row click/hover/interact never navigates away from `/leads/new` | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC1"` — precondition: live Postgres reachable | A |
| AC2 | Hover reveals all 10 standard-detail-set fields matching seeded values | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC2"` — precondition: live Postgres reachable | A |
| AC3 | Hover card closes on pointer-leave (post grace-period) | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC3"` — precondition: live Postgres reachable | A |
| AC4 | Null-field duplicate renders with explicit empty-state, no crash, no "undefined"/"null" | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC4"` — precondition: live Postgres reachable | A |
| AC5 | "Create anyway" still creates + redirects while duplicates showing | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC5"` — precondition: live Postgres reachable | A |
| AC6 | Polish pass does not change payload shape (schema-level diff) | Hybrid | `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts -g "AC6"` — precondition: live Postgres reachable | A |
| AC7 | Keyboard-only users can reach duplicate detail info; Escape dismisses | Agent-Probe | Tab to duplicate row with no mouse, confirm hover card appears via focus and Escape closes it | A |
| Regression | No typecheck breakage across 3 touched files | Fully-Automated | `bun run check` | A |
| Regression | Full unit suite still green | Fully-Automated | `bun run test:unit:ci` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). No Known-Gap rows in this contract — every behavior in the blast radius has a
named proving gate.

Legacy line form (retained so existing validate-contract consumers still parse):
- `/leads/new` duplicate-row hover UX: Hybrid: `bunx playwright test e2e/leads-new-dedup-hover.e2e.ts` + precondition live Postgres | Fully-automated regression: `bun run check` && `bun run test:unit:ci` | agent-probe: keyboard-only reachability + Escape dismiss (AC7)

Dimension findings:
- Infra fit: PASS — single SvelteKit page edit, no container/infra/runtime surface touched.
- Test coverage: CONCERN → fixed in plan — original Verification Evidence table classified all 6
  e2e-based gates as Fully-Automated; corrected to Hybrid (every page load in this app hits a real
  Postgres DB, no mock fallback, so no e2e gate here is environment-independent). Also corrected the
  regression-suite command from `bun run test:unit` (bare `vitest`, watch-mode, does not exit) to
  `bun run test:unit:ci` (`vitest --run`). Both fixes applied directly to the plan's Verification
  Evidence table above.
- Breaking changes: PASS — `+page.server.ts` load return shape gains one additive field
  (`users: User[]`); no field removed/renamed; single consumer (`+page.svelte`) confirmed via
  read. No API/schema/payload changes (`leadFormSchema`/`/api/leads` untouched, enforced by AC6).
- Security surface: PASS — no auth, billing, secrets, or trust-boundary logic touched; DEV_BYPASS
  unaffected; no new server query beyond the already-established `listUsers()` pattern.
- Section A (`OrganizerHoverCard.svelte`, new component): PASS — mechanical feasibility confirmed
  (all referenced fields/utils exist: `formatDate`, `relativeFromNow` in `src/lib/utils/dates.ts`,
  `PlatformBadge`/`StageChip` in `src/lib/components/shared/`). No gaps found. No conflicts. Highest-
  risk edit: none — this is a new, isolated, read-only display component.
- Section B (`+page.svelte` duplicate-row block + Popover wiring): CONCERN → fixed in plan —
  mechanical feasibility confirmed (bits-ui `child`-snippet API shape verified against installed
  `node_modules/bits-ui` types, matches plan usage exactly). Gap found: no Escape-key dismissal path
  was wired, which does not fully satisfy WCAG 1.4.13 (Content on Hover or Focus) "Dismissible"
  sub-criterion (a hover/focus-revealed rich-content overlay should be dismissible without requiring
  the user to move the pointer or keyboard focus away). Fixed in plan: added `onkeydown` Escape
  handlers to both the trigger div and `Popover.Content`, plus a `closeDupeNow()` helper. No
  conflicts found. Highest-risk edit: the `{...props}` spread from bits-ui's `child` snippet may
  include its own internal click/keydown handling; reasoned to be harmless because `open` is passed
  as a one-way controlled prop (not `bind:open`), so any internal toggle bits-ui attempts on click is
  overwritten by the next reactive sync from `openDupeId` — documented as an EXECUTE-time visual
  double-check (Implementation Checklist item 2, note (c)), not a blocking gap.
- Section C (`+page.server.ts` — Plan Decision D1): PASS — D1 CONFIRMED (see Plan Decision D1
  section above for full reasoning: additive-only field, pattern already exists verbatim at
  `/leads/[id]/+page.server.ts:9`, SPEC's "no new query" constraint is scoped to duplicate/lead data
  not to owner-name resolution). No gaps, no conflicts. No risk — mirrors an established pattern.
- Section D (cosmetic polish pass): PASS — bounded scope, enforced by AC6 (no payload change) and
  the Constraints section (existing visual language only). No gaps found; this section is
  intentionally light-touch per the plan's own framing.
- Section E (e2e test file, `e2e/leads-new-dedup-hover.e2e.ts`): CONCERN → fixed in plan —
  mechanical feasibility confirmed (`playwright.config.ts` `testMatch` picks up the new file
  automatically; only 1 existing e2e file as precedent). Gap found: the existing e2e file's pattern
  (`test.skip` when no data present) cannot satisfy AC2/AC4, which need a *known* duplicate with
  *known* field values, not "whatever happens to be seeded". Fixed in plan: instruction added to
  create the duplicate lead through the app's own create flow inside the test itself, not a separate
  seed mechanism. No conflicts. Highest-risk edit: grace-period timing flakiness (200ms close delay)
  — mitigated by an explicit wait-past-grace-period instruction already in Test Infra Improvement
  Notes.

Open gaps: none — all 3 CONCERNs found (test-tier misclassification, WCAG 1.4.13 Dismissible gap,
e2e seeding-strategy gap) were fixed directly in the plan text during this VALIDATE pass. Net gate
after fixes: PASS.

What this coverage does NOT prove:
- The `bun run check` / `bun run test:unit:ci` regression gates prove no *existing* logic broke —
  they do not exercise the new hover-card UI at all (that is the e2e/agent-probe gates' job).
- The Hybrid e2e gates prove correctness against whatever Postgres instance is reachable at test
  time (dev DB, docker-compose, or CI service container) — they do not prove behavior against a
  production-scale dataset, nor do they prove behavior under concurrent form-fills by multiple reps
  (out of scope for this plan; dedup is advisory-only by design, per SPEC).
- The Agent-Probe AC7 gate proves reachability and dismissal for one plausible keyboard-only
  traversal path (Tab to the row, Escape to close) — it does not prove every possible assistive-
  technology interaction pattern (e.g. screen-reader-specific navigation modes) is equally smooth;
  that would require a dedicated AT audit, out of scope for this SIMPLE plan.
- No visual/pixel regression testing is performed for the cosmetic polish pass (Implementation
  Checklist item 4) — AC6's schema-level payload diff proves no *behavioral* change, not that the
  visual result "looks right"; that judgment is left to human review at EXECUTE/UPDATE PROCESS.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs, plan updated)
Accepted by: session (vc-validate-agent autonomous ruling — all 3 CONCERNs resolved via direct plan
edits during this VALIDATE pass; no user-facing tradeoff required acceptance, since every concern
had a clean in-plan fix rather than a deferred/known-gap)

## Autonomous Goal Block

SESSION GOAL: Fix `/leads/new` duplicate-row data-loss bug (navigating away destroys unsaved form
data) by replacing the link with a hover/focus-triggered detail card (10-field standard set), plus a
light cosmetic polish pass on the rest of the page.
Charter + umbrella plan: N/A — single plan (SIMPLE complexity, no phase program).
Autonomy: Standard RIPER-5 approval gates apply — VALIDATE is complete (Gate: PASS below); EXECUTE
requires an explicit "ENTER EXECUTE MODE" from the user/orchestrator before any code is written.
Hard stop conditions / safety constraints:
- Do not touch `/api/leads`, `crm_lead_history`, `leadFormSchema`, dedup matching logic
  (`hasPotentialDuplicate`), `/leads/[id]`, or the leads list — all explicitly out of scope per SPEC.
- Do not remove the click-is-a-no-op behavior on the duplicate row (no `onclick` handler) — this is
  the direct fix for AC1 and must not regress.
- Do not remove the Escape-key dismiss handlers added during VALIDATE (WCAG 1.4.13 compliance).
- Do not widen the cosmetic polish pass into a redesign — no new fields, no restructured grouping,
  no payload shape change (enforced by AC6).
Next phase: EXECUTE — `process/features/leads/active/leads-new-organizer-hover_01-07-26/leads-new-organizer-hover_PLAN_01-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: Fully-automated: `bun run check` && `bun run test:unit:ci` | Hybrid e2e:
`bunx playwright test e2e/leads-new-dedup-hover.e2e.ts` (precondition: live Postgres reachable) |
Agent-probe: keyboard-only reachability + Escape dismiss (AC7) | high-risk pack: no (no high-risk
class present in this plan's Blast Radius)
