---
name: plan:rem-followup-sections
description: Owner-name + due-date enrichment on /reminders cards, plus a new uncapped "All Follow-Ups" tab with manager rep-filter (GitHub #204, #205)
date: 06-07-26
feature: reminders
---

# Reminders — Follow-Up Date/Owner Columns + Full Follow-Up List Tab (GitHub #204, #205)

Date: 06-07-26
Status: PLAN — VALIDATE complete (PASS)
Complexity: SIMPLE — single feature, no schema/migration, no new route, ~6-7 file touches across DB/route/UI layers.

## Overview

Two additive changes to `/reminders`, built in strict dependency order (DB → route → UI):

1. **REM-1**: every lead card gets a follow-up due date + owner-name label (new `enrichWithOwnerNames()` helper, wired in at the route-load layer, not inside `getRemindersQueue`).
2. **REM-2**: a second tab, "All Follow-Ups", showing every pending follow-up with no 7-day cap, sorted soonest-first, with a manager-only single-rep filter dropdown and an inline overdue flag (reusing existing `riskMeta`/`AgeBadge` styling).

Both features are additive on top of the already-shipped `getRemindersQueue` (`reminders-upcoming-section_03-07-26`, CODE DONE) — that function, `getTodayQueue`, `computeAge`, and the `Urgency` type are NEVER modified.

**TL;DR:** New `enrichWithOwnerNames()` + `getAllFollowUpsQueue()` in `db/leads.ts`; `+page.server.ts` loads both queues in parallel; `+page.svelte` gains a `Tabs.svelte`-driven second panel with a rep-filter dropdown; `LeadListRow` gains due-date/owner slots used by both tabs.

## Goals

1. Show follow-up due date on every lead card, both tabs (AC1).
2. Show owner name (or "Unassigned") on every lead card, both tabs (AC2).
3. Keep the existing bucketed ("Sections") tab's membership/ordering/behavior byte-for-byte unchanged aside from the two new display fields (AC3).
4. Add a new "All Follow-Ups" tab: uncapped, sorted by due date ascending (AC4, AC5).
5. Reps see only their own leads in the new tab, no filter control (AC6). Managers/super_managers see everyone by default plus a single-rep filter dropdown (AC7).
6. Overdue leads in the new tab carry a distinct visual flag (AC8).
7. Click-through and snooze/nudge parity in the new tab (AC9).
8. No type/lint regressions (AC10).

## Non-Goals / Out of Scope

(mirrors SPEC "Out Of Scope" verbatim — see SPEC for full list)
- No new route; second tab lives inside `/reminders`.
- No changes to snooze 3-day rule, snooze API contract, `getTodayQueue`, `computeAge`, `Urgency` type.
- No changes to the bucketed view's membership/ordering beyond the two new fields.
- No multi-rep selection, no new sort options, no `visibilityCondition` scoping changes, no schema/migration.
- No automated Playwright e2e proof this cycle (known project-wide gap — see Verification Evidence).
- No changes to `/leads`, `/pipeline`, `/unassigned` beyond whatever shared component enrichment REM-1 requires.

## Design Decisions (carried from INNOVATE — do not re-litigate)

1. **Owner-name enrichment is a separate route-load-layer helper, not a join inside `getRemindersQueue`.** `enrichWithOwnerNames()` lives in `db/leads.ts`, is called from `+page.server.ts` alongside the existing queue calls, and maps `ownerId → ownerName` (or `"Unassigned"` for `null`). This keeps `getRemindersQueue` untouched (hard constraint) and reuses the same enrichment for both tabs since both pull from `+page.server.ts`'s single load function.
2. **REM-2 is `getAllFollowUpsQueue(userId, role, opts?: { filterRepId?: string })`, following the `getFollowUpsInRange` DISTINCT-ON-per-lead precedent** (`db/leads.ts` ~L1342-1370). Fully additive — no edits to `getTodayQueue`/`getRemindersQueue`. `filterRepId` narrows via `crmLeads.ownerId = filterRepId` **additionally** to `visibilityCondition(userId, role)`, never replacing it (security-relevant: a rep must never see another rep's leads via this or any new code path — reps never send `filterRepId`, and the function ignores it for `role === 'rep'` even if somehow supplied).
3. **UI**: `Tabs.svelte` (`src/lib/components/ui/tabs/Tabs.svelte`, `variant="underline"`) wraps two panels: the existing bucketed sections view + the new full sortable list. `+page.server.ts` loads BOTH `getRemindersQueue(...)` and `getAllFollowUpsQueue(...)` via `Promise.all` on every load (no query-param routing, no re-fetch on tab switch — `$state` drives which panel shows).
4. **Rep-filter dropdown source**: query `crmUsers` where `role = 'rep' AND active = true`. **Dedup check performed** (see Checklist step 0) — no existing "list active reps" query exists to reuse; `listUsers()` (`db/leads.ts` ~L696) returns ALL users unfiltered, and the owner-reassign endpoint (`api/leads/[id]/owner/+server.ts` L32-36) only validates a single given id, it doesn't list. A new scoped query is required.
5. **Overdue flag** on the combined list reuses `riskMeta(lead.urgency)` (`src/lib/utils/risk.ts`) / `AgeBadge` styling conditionally — no new badge component.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/leads.ts` | Add `enrichWithOwnerNames()` (~after `listUsers()`, L696-699) and `getAllFollowUpsQueue()` (~after `getRemindersQueue`, which ends L1528 — confirmed exact end line via VALIDATE-time grep) |
| `src/routes/reminders/+page.server.ts` | Load both queues in parallel via `Promise.all`; run owner enrichment across the combined lead set; also list active reps for the manager dropdown |
| `src/routes/reminders/+page.svelte` | Wrap existing sections view + new full-list view in `Tabs.svelte`; add rep-filter dropdown (manager/super_manager only); render due-date/owner on both tabs via `LeadListRow` |
| `src/lib/components/leads/LeadListRow.svelte` | Add two new optional display slots: `followUpAt` due-date line and `ownerName` label; add optional `overdue` flag prop reusing `riskMeta`-driven styling |
| `src/lib/types/index.ts` | Extend `Lead` interface (~L49-59) with `ownerName?: string` (enrichment-populated, not DB-native) — confirm exact insertion point in step 0 |
| `src/tests/reminders-db.spec.ts` (or a new `reminders-followups-db.spec.ts`) | Add Hybrid DB cases for `getAllFollowUpsQueue` (uncapped membership, sort order, rep-filter narrowing, visibility scoping) and `enrichWithOwnerNames` (null-owner case) |

## Public Contracts

- **New: `enrichWithOwnerNames(leads: Lead[]): Promise<Lead[]>`** (or equivalent signature — finalize in EXECUTE) — pure additive helper; returns leads with `ownerName` populated (`"Unassigned"` when `ownerId === null`). No existing caller depends on its absence; it is opt-in at the route-load layer.
- **New: `getAllFollowUpsQueue(userId: string, role: Role, opts?: { filterRepId?: string }): Promise<Lead[]>`** — new function, zero existing callers, so zero breaking-change risk. Applies `visibilityCondition(userId, role)` (same predicate `getTodayQueue` uses, `db/leads.ts` L204) **as its ONLY base scope predicate — deliberately NOT ANDed with `eq(crmLeads.ownerId, userId)`** (see Implementation Checklist Step 1 item 2 guardrail note — this distinction is what makes manager "see the whole team" visibility actually work, unlike `getTodayQueue`/`getFollowUpsInRange` which are single-owner-scoped by design); `filterRepId` (when present AND `role !== 'rep'`) additionally narrows via `eq(crmLeads.ownerId, filterRepId)`.
- **New: rep-list query** (inline in `+page.server.ts` or a small `listActiveReps()` helper in `db/leads.ts`) — `crmUsers` where `role = 'rep' AND active = true`. Only consumed by the manager-facing dropdown; loaded conditionally (or always, cheaply) alongside the two queue calls.
- **`/reminders` page data shape** widens from `{ overdue; due; upcoming; cold }` to `{ overdue; due; upcoming; cold; allFollowUps; activeReps }` (exact key names finalized in EXECUTE — must not collide with existing keys). Only consumer is `+page.svelte`.
- **`LeadListRow` props** widen additively (`followUpAt?`, `ownerName?`, `overdue?` or similar) — existing callers (root `+page.svelte` "Today" page and `/reminders` — see corrected Blast Radius below) that don't pass the new props are unaffected as long as they're optional with sensible defaults (render nothing when absent).
- No external/HTTP contract changes. Snooze endpoint (`/api/leads/[id]/snooze`) untouched.

## Blast Radius

- **~6 files touched**, entirely inside the reminders feature surface plus one shared component (`LeadListRow.svelte`) and one shared type (`Lead` interface). Risk class: **low** — read-path enrichment + one new additive query; no writes, no auth, no schema, no migration.
- **Shared-component risk (CORRECTED at VALIDATE — see Validate Contract):** `LeadListRow.svelte` is actually consumed by the root `+page.svelte` ("Today" / daily-loop home) and `/reminders` **only** — confirmed via `grep -rn "LeadListRow" src/*.svelte`. The plan's original assumption that `/leads`, `/pipeline`, `/unassigned` also consume it was **incorrect**; those routes do not import `LeadListRow` at all. This narrows the actual blast radius versus the original estimate (2 real consumers, not 4). New props must still be optional and no-op when absent (unchanged mitigation) — EXECUTE's Step 0 grep pass must explicitly confirm the root Today page renders unaffected, since it was not previously named as a consumer to check.
- **`Lead` type widening** (`src/lib/types/index.ts`) is additive (`ownerName?: string`) — every existing consumer that doesn't read this field compiles unchanged; `bun run check` will flag anything that destructures the type exhaustively (unlikely for an interface).
- No changes to `getTodayQueue`, `getRemindersQueue`, `computeAge`, `Urgency` — confirmed zero edits to those symbols anywhere in the checklist below.

## Implementation Checklist (dependency-ordered — matches INNOVATE's suggested order)

**Step 0 — grep confirmations (run first, before any edit):**
```bash
grep -rn "getRemindersQueue\|getAllFollowUpsQueue\|LeadListRow" src/
grep -n "role.*rep.*active\|active.*true" src/lib/server/db/leads.ts src/routes/api/leads/\[id\]/owner/+server.ts
```
Confirm: (a) no existing `getAllFollowUpsQueue` symbol exists yet (new function, no name collision) — confirmed at VALIDATE, clean; (b) exact list of every `LeadListRow` consumer — confirmed at VALIDATE: root `+page.svelte` and `src/routes/reminders/+page.svelte` ONLY (not `/leads`, `/pipeline`, `/unassigned` — see corrected Blast Radius above); re-run this grep at EXECUTE start to catch any consumer added between VALIDATE and EXECUTE; (c) confirm no existing "list active reps" query exists (already checked during PLAN and re-confirmed at VALIDATE — none found, `listUsers()` returns all users unfiltered).

**Step 1 — DB layer** (`src/lib/server/db/leads.ts`, no dependencies):
1. Add `enrichWithOwnerNames(leads: Lead[]): Promise<Lead[]>` — batch-fetch `crmUsers.name` for the distinct non-null `ownerId`s present in the input array (single query, `inArray(crmUsers.id, ownerIds)`), map back onto each lead, default to `"Unassigned"` for `ownerId === null`. Follow the same batch-map pattern already used for follow-ups in `getTodayQueue` (L1279-1294: collect ids → one query → `Map` → map back).
2. Add `getAllFollowUpsQueue(userId, role, opts?: { filterRepId?: string })` — model directly on `getFollowUpsInRange` (L1342-1370): select from `crmLeads` with `and(isNull(deletedAt), ne(stage,'won'), ne(stage,'lost'), visibilityCondition(userId, role), isNotNull-equivalent follow-up filter, ...(opts?.filterRepId && role !== 'rep' ? [eq(crmLeads.ownerId, opts.filterRepId)] : []))`, then DISTINCT-ON per-lead latest follow-up (same pattern as `getTodayQueue`/`getFollowUpsInRange`), filter to `followUpAt` present (any date, no window cap — this is the key difference from `getFollowUpsInRange`'s range check), sort ascending by `followUpAt`.
   **Guardrail (VALIDATE finding — read carefully before implementing):** "model directly on `getFollowUpsInRange`" above refers ONLY to the DISTINCT-ON-per-lead structural pattern. Do **NOT** copy `getFollowUpsInRange`'s or `getTodayQueue`'s hardcoded `eq(crmLeads.ownerId, userId)` base predicate into this function. Both of those existing functions are single-owner-scoped BY DESIGN — confirmed via `getTodayQueue`'s own code comment ("Already owner-scoped ... visibilityCondition is defensive/no-op here") and via the existing test suite (`reminders-db.spec.ts` calls `getRemindersQueue(MANAGER_UUID)` with no distinct-team assertion, consistent with single-owner scoping). `getAllFollowUpsQueue`'s base scope must be `visibilityCondition(userId, role)` **ALONE** (exactly as already written in the `and(...)` clause above, with no additional `eq(ownerId, userId)`) — this is what makes AC7 ("managers see the whole team by default") actually true. The Verification Evidence Hybrid DB spec for AC7 ("omitting `filterRepId` returns all reps' leads") is the regression guard for this exact class of mistake — it must assert leads from 2+ distinct `ownerId`s are present in the unfiltered manager-role result.
3. Add a small `listActiveReps(): Promise<{ id: string; name: string }[]>` helper (or equivalent) — `db.select({ id, name }).from(crmUsers).where(and(eq(role,'rep'), eq(active,true))).orderBy(name)`.

**Step 2 — Route layer** (`src/routes/reminders/+page.server.ts`, depends on step 1):
4. Compose the load function: `Promise.all([getRemindersQueue(...), getAllFollowUpsQueue(...), listActiveReps()])`, then run `enrichWithOwnerNames` across the combined lead set (dedupe leads across buckets before enrichment to avoid redundant work, or enrich lazily per-array — finalize in EXECUTE based on whichever keeps the diff smallest). Return the widened page-data shape. Guard `listActiveReps()` — only needed for manager/super_manager role, but cheap enough to always fetch (or gate on `locals.user.role !== 'rep'` to save a query for reps).

**Step 3 — UI layer** (depends on step 2):
5. `LeadListRow.svelte` — add optional `followUpAt?: string | Date | null` and `ownerName?: string` props; render a small due-date + owner line (reuse existing typographic conventions — e.g. the `font-mono text-[9px] uppercase` "next"/risk label block at L110-113 as a visual reference — confirmed accurate at VALIDATE, or a new compact line near the event line). Add optional `overdue?: boolean` prop; when true, apply `riskMeta`-driven overdue styling (reuse `risk.color`/`risk.label` already derived at L25, or accept it as a prop from the caller for the combined-list case where "overdue" isn't always `lead.urgency === 'overdue'` in the traditional bucketed sense — confirm in EXECUTE whether the existing `risk` derivation already covers the combined list's overdue case, since `urgency` is present on every `Lead` regardless of which tab it's rendered in).
6. `+page.svelte` — wire `Tabs.svelte` (`variant="underline"` — confirmed supported, props match exactly: `tabs`, `value`, `onValueChange`, `variant`, `ariaLabel`; two tabs: `{ value: 'sections', label: 'Sections' }`, `{ value: 'all', label: 'All Follow-Ups' }`); `$state` for active tab; existing bucketed render block moves under the `sections` panel unchanged; new panel renders the combined `allFollowUps` list via `LeadListRow` (single flat list, no sub-headers) sorted server-side; add the rep-filter `<select>` (manager/super_manager only, from `data.activeReps`) that re-submits the page's `filterRepId` (via a client `fetch()` + local re-render, OR a `?repId=` query param + server reload — finalize exact mechanism in EXECUTE, but per SPEC/INNOVATE this must NOT require a full extra client-side re-fetch pattern outside the existing load; a `?repId=` search-param triggering `+page.server.ts` to pass `filterRepId` through and SvelteKit's automatic reload-on-navigation is the simplest fit and should be preferred unless EXECUTE finds a blocker).

**Step 4 — overdue-flag styling reuse** (depends on step 3, parallel-safe with dropdown wiring): confirm the combined list's overdue badge renders correctly for a past-due lead and not for a future-due lead using the existing `riskMeta` output — no new component.

## Acceptance Criteria

(mirrors SPEC AC1-AC10 verbatim — see SPEC for full text and `proven by`/`strategy` tags)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Hybrid DB spec: `enrichWithOwnerNames` maps `ownerId → name`, and `ownerId === null → "Unassigned"` | Hybrid | AC2 |
| Hybrid DB spec: `getAllFollowUpsQueue` returns a +10d lead (excluded from bucketed `upcoming`) | Hybrid | AC4 |
| Hybrid DB spec: `getAllFollowUpsQueue` result array is ascending by `followUpAt` | Hybrid | AC5 |
| Hybrid DB spec: `getAllFollowUpsQueue(userId, 'rep')` applies `visibilityCondition(userId,'rep')` identically to `getTodayQueue`'s scoping (rep never sees another rep's lead even if `filterRepId` were supplied) | Hybrid | AC6 |
| Hybrid DB spec: `getAllFollowUpsQueue(managerId, 'manager', { filterRepId })` narrows to that rep's owned leads only; omitting `filterRepId` returns leads spanning **2+ distinct `ownerId`s** (explicit regression guard for the Step 1 guardrail — proves the base predicate is NOT hardcoded to a single owner) | Hybrid | AC7 |
| `bun run test:unit:ci` exits 0 (existing suite, incl. `reminders-db.spec.ts`, stays green) | Fully-Automated | AC3 (regression) |
| `bun run check` exits 0 | Fully-Automated | AC10 — widened `Lead` type + page-data shape + new `LeadListRow` props compile; no missed consumer |
| `bun run lint` exits 0 | Fully-Automated | AC10 |
| Agent-Probe: due date renders on every card, both tabs | Agent-Probe | AC1 |
| Agent-Probe: owner name (or "Unassigned") renders on every card, both tabs | Agent-Probe | AC2 |
| Agent-Probe: bucketed view visually unchanged except the two new fields | Agent-Probe | AC3 |
| Agent-Probe: rep session sees no filter dropdown in "All Follow-Ups" tab | Agent-Probe | AC6 |
| Agent-Probe: manager selects a rep in dropdown → list narrows; clears → list returns to full team | Agent-Probe | AC7 |
| Agent-Probe: past-due lead shows overdue badge in combined list; future-due lead does not | Agent-Probe | AC8 |
| Agent-Probe: click-through to `/leads/[id]` + snooze/nudge parity in new tab | Agent-Probe | AC9 |
| Known-Gap: automated Playwright e2e of render/interaction ACs (AC1, AC2, AC6 render, AC7 UI, AC8, AC9) | Known-Gap (residual, not a proving strategy) | blocked by missing shared Playwright auth fixture — same pre-accepted project-wide gap as `reminders-upcoming-section_03-07-26` |

Notes on tiers: consistent with the SPEC's own tagging and the `reminders-upcoming-section_03-07-26` precedent — query-layer correctness (enrichment mapping, uncapped membership, sort order, visibility scoping, rep-filter narrowing) is provable at the Hybrid DB tier under live Postgres; render/interaction confirmation is Agent-Probe until the shared Playwright authenticated-session fixture lands (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). The Known-Gap row above is a named residual, not a substitute proof — it is carried forward as an accepted, documented gap, consistent with the vacuous-green ban (it does not close any AC on its own).

## Test Infra Improvement Notes

(none identified yet)

## Phase Completion Rules

- **CODE DONE** = Implementation Checklist steps 0-4 applied and `bun run check` + `bun run lint` + `bun run test:unit:ci` all exit 0 (AC10), plus the new Hybrid DB cases for `enrichWithOwnerNames`/`getAllFollowUpsQueue` pass under live Postgres.
- **VERIFIED** = CODE DONE plus AC1-AC9 confirmed. AC4-AC7 (uncapped membership, sort order, visibility scoping, rep-filter narrowing) close via the Hybrid DB specs; AC1, AC2, AC3, AC6 (render), AC7 (UI), AC8, AC9 close via agent probe or user confirmation — the shared Playwright auth fixture is a known project-wide gap (same pattern as `reminders-upcoming-section_03-07-26`), so do not mark VERIFIED without explicit user-confirmed observation of the render/interaction paths.
- This is a single-section SIMPLE plan — no sub-phases to sequence; Implementation Checklist Steps 1-2 (DB, route) are strictly sequential; Steps 3-4 (UI, overdue-flag reuse) may proceed in parallel once Step 2 is done.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reminders/active/rem-followup-sections_06-07-26/rem-followup-sections_PLAN_06-07-26.md`
2. **Last completed phase or step:** VALIDATE complete — Gate: PASS.
3. **Validate-contract status:** written 06-07-26 (see `## Validate Contract` below).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`; source verified: `db/leads.ts` (`visibilityCondition` L204, `getTodayQueue` L1259-1295, `getFollowUpsInRange` L1342-1370, `getRemindersQueue` L1490-1528, `listUsers` L696-699), `schema.ts` (`crmUsers` L96-121, `userRole` L24), `LeadListRow.svelte` (full read, consumer set corrected), `+page.server.ts`/`+page.svelte` for `/reminders` (full read), `Tabs.svelte` (full read, `variant="underline"` confirmed), `api/leads/[id]/owner/+server.ts` (dedup check for rep-list query — none found), `src/lib/types/index.ts` (`Lead` interface L49-71), locked SPEC `rem-followup-sections_SPEC_06-07-26.md`.
5. **Next step for a fresh agent:** run EXECUTE against this plan. Run Checklist Step 0 grep confirmations FIRST (re-confirm `LeadListRow` consumer set is still root `+page.svelte` + `/reminders` only), then apply Steps 1-4 in order (DB → route → UI → overdue-flag reuse) — pay close attention to the Step 1 item 2 guardrail note on `visibilityCondition` scoping — then run the Verification Evidence gates.

## Validate Contract

Status: PASS
Date: 06-07-26
date: 2026-07-06
generated-by: outer-pvl

Parallel strategy: sequential (single-agent direct file verification)
Rationale: Score 2-3/7 (S6 permission/trust-boundary-adjacent scoping logic, S7 6 files in blast radius) — MEDIUM band nominally suggests parallel subagents, but this VALIDATE pass had no Task-tool sub-spawn capability available to the invoked agent; the plan is self-contained (single feature, no phase program, all touchpoints in one repo), so direct sequential file-by-file verification by the validate agent covers the same ground as the Layer 1/Layer 2 fan-out would (each dimension and section below was checked against real on-disk evidence, not inferred).

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | `enrichWithOwnerNames` maps `ownerId → name`; null → "Unassigned" | Hybrid | New spec in `src/tests/reminders-db.spec.ts` (or `reminders-followups-db.spec.ts`) — `describe.skipIf(SKIP_DB)`, asserts name mapping + null-owner case | B |
| AC4 | `getAllFollowUpsQueue` includes a +10d lead excluded from bucketed `upcoming` | Hybrid | New Hybrid DB spec — insert lead with `followUpAt = now+10d`, assert present in `getAllFollowUpsQueue` result, absent from `getRemindersQueue(...).upcoming` | B |
| AC5 | Full list sorted ascending by `followUpAt` | Hybrid | New Hybrid DB spec — mixed-order fixture, assert ascending order | B |
| AC6 | Rep sees only own leads in full list; no filter control | Hybrid | New Hybrid DB spec — `getAllFollowUpsQueue(repUserId, 'rep')` returns only that rep's owned leads, even when `filterRepId` is supplied | B |
| AC6 | Dropdown absent for rep session | Agent-Probe | Manual: rep session, "All Follow-Ups" tab shows no rep-filter control | A |
| AC7 | Manager filter narrows to one rep; omitting returns full team (2+ distinct owners) | Hybrid | New Hybrid DB spec — `getAllFollowUpsQueue(managerId,'manager',{filterRepId})` narrows; omitted case asserts leads from 2+ distinct `ownerId`s present (regression guard for Step 1 guardrail) | B |
| AC7 | Manager dropdown select/clear updates list | Agent-Probe | Manual: select rep → list narrows; clear → full team | A |
| AC1 | Due date renders on every card, both tabs | Agent-Probe | Manual: visual confirm on Sections + All Follow-Ups tabs | A |
| AC2 | Owner name renders on every card, both tabs | Agent-Probe | Manual: visual confirm on Sections + All Follow-Ups tabs | A |
| AC3 | Bucketed view unchanged (regression) | Fully-Automated | `bun run test:unit:ci` exits 0 | A |
| AC3 | Bucketed view visually unchanged | Agent-Probe | Manual visual comparison against pre-change screenshot | A |
| AC8 | Overdue badge on past-due lead only | Agent-Probe | Manual: past-due shows badge, future-due does not | A |
| AC9 | Click-through + snooze/nudge parity in new tab | Agent-Probe | Manual: navigation to `/leads/[id]`, snooze/nudge optimistic update | A |
| AC10 | No type regressions | Fully-Automated | `bun run check` exits 0 | A |
| AC10 | No lint regressions | Fully-Automated | `bun run lint` exits 0 | A |
| (residual) | Automated Playwright e2e of render/interaction ACs | Known-Gap | — no proving test this cycle | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle, once run)
- B — fixed in this plan (gate added by this plan's checklist — new Hybrid specs to be written in EXECUTE Step 1/2)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue) — tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`

C-4 reconciliation: no Fully-Automated row in this contract represents genuinely NEW behavior (the 3 Fully-Automated rows are existing regression gates — `check`/`lint`/`test:unit:ci` — already green today and simply re-run post-change), so no TDD failing stubs are required per the stub-output rule (stubs are only mandated for Fully-Automated rows proving new behavior; Hybrid/Agent-Probe/Known-Gap rows never receive stubs). All genuinely NEW behavior in this plan (`enrichWithOwnerNames`, `getAllFollowUpsQueue` + its 4 sub-scenarios) is Hybrid tier by design (requires live Postgres), consistent with the High-Risk Class minimum-tier rule for the owner/visibility-scoping surface this touches.

Legacy line form (retained so existing validate-contract consumers still parse):
- reminders/db: enrichWithOwnerNames null-owner mapping — [Hybrid: new spec, live Postgres precondition]
- reminders/db: getAllFollowUpsQueue uncapped membership, sort order, visibility scoping, rep-filter narrowing — [Hybrid: new specs, live Postgres precondition]
- reminders/regression: bucketed view unchanged — [Fully-automated: `bun run test:unit:ci`]
- reminders/types: no type/lint regressions — [Fully-automated: `bun run check` + `bun run lint`]
- reminders/ui: due-date/owner render, overdue flag, dropdown behavior, click-through/snooze parity — [agent-probe: manual visual/interaction confirmation, both tabs]
- reminders/e2e: automated render/interaction proof — [known-gap: documented, blocked by missing shared Playwright auth fixture]

Dimension findings:
- Infra fit: PASS — no container/infra/runtime surfaces touched; pure SvelteKit route + DB-layer change; every touchpoint file confirmed present on disk (`src/lib/server/db/leads.ts`, `+page.server.ts`, `+page.svelte`, `LeadListRow.svelte`, `types/index.ts`, `reminders-db.spec.ts`, `Tabs.svelte`, `risk.ts`) via direct Read/Grep.
- Test coverage: PASS — high-risk class (owner/visibility-scoping logic, "permission/trust-boundary" per orchestration.md's high-risk classes) meets the required minimum Hybrid tier (AC6/AC7 both Hybrid-proven); Known-Gap for e2e automation is a named, pre-accepted residual consistent with project-wide precedent, not a substitute proof; vacuous-green check passed — every AC (AC1-AC10) has at least one real proving strategy (Fully-Automated/Hybrid/Agent-Probe), Known-Gap is additive documentation only.
- Breaking changes: PASS (corrected during VALIDATE) — plan's original Blast Radius claim that `LeadListRow` is consumed by `/leads`, `/pipeline`, `/unassigned` was factually incorrect (confirmed via `grep -rn "LeadListRow" src/*.svelte`: actual consumers are root `+page.svelte` and `/reminders` only); corrected in the plan text above. No schema/API/auth contract changes; all new fields/functions/props are additive with safe defaults.
- Security surface: PASS (guardrail added during VALIDATE) — rep-filter is additive on top of `visibilityCondition`, explicitly ignored for `role === 'rep'`. Verified empirically that `getTodayQueue`/`getFollowUpsInRange` are single-owner-scoped by design (hardcoded `eq(ownerId, userId)` makes `visibilityCondition` a documented no-op there) — the plan's own checklist text already correctly avoids copying that hardcode into `getAllFollowUpsQueue`, but the "model directly on `getFollowUpsInRange`" phrasing risked misleading a skimming implementer, so an explicit guardrail note + a hardened Hybrid test assertion (2+ distinct owners in the unfiltered manager case) were added to the plan to make this unambiguous and independently verifiable.
- Section: DB layer (Step 1) feasibility — PASS — mechanical feasibility confirmed: `visibilityCondition` (L204), `getTodayQueue` (L1259-1295), `getFollowUpsInRange` (L1342-1370), `getRemindersQueue` (L1490-1528), `listUsers` (L696-699) all exist at cited/near-cited lines; `crmUsers.{name,role,active}` schema fields confirmed (L100,103,105); no naming collision for `getAllFollowUpsQueue`/`enrichWithOwnerNames`/`listActiveReps`. Highest-risk edit: the `getAllFollowUpsQueue` base-scope predicate (see Security surface finding above) — mitigated via guardrail note + hardened test.
- Section: Route layer (Step 2) feasibility — PASS — `+page.server.ts` load function confirmed simple (5 lines, single `getRemindersQueue` call today); `Promise.all` composition is a straightforward additive change.
- Section: UI layer (Step 3) feasibility — PASS — `Tabs.svelte` `variant="underline"` API confirmed matching the plan's intended usage exactly (props: `tabs`, `value`, `onValueChange`, `variant`, `ariaLabel`); `LeadListRow.svelte` structure and the L110-113 risk-styling visual reference confirmed accurate; consumer list corrected (see Breaking changes finding) — no consumer would break under optional-prop widening.
- Section: Overdue-flag reuse (Step 4) feasibility — PASS — `riskMeta`/`AgeBadge` reuse is a straightforward conditional-render change; no new component needed.

Open gaps:
- Known e2e Playwright auth-fixture gap (pre-accepted, project-wide) — tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`; Agent-Probe substitutes for AC1, AC2 (render), AC6 (dropdown-absent render), AC7 (UI interaction), AC8, AC9 until the fixture lands. This is a documented, accepted residual (gap-resolution D above), not a blocker.

What this coverage does NOT prove:
- The Hybrid DB specs (AC2, AC4-AC7) prove query-layer correctness under live Postgres but do NOT prove the UI actually renders the returned fields correctly, that the rep-filter `<select>` fires the right reload mechanism, or that click-through/snooze parity holds in the browser — those are covered by the Agent-Probe rows only, which require a human or agent-driven manual pass (no automated e2e this cycle).
- `bun run test:unit:ci` (AC3 regression) proves the existing bucketed-view query logic is unchanged; it does NOT prove the bucketed view's *visual* output is unchanged (the two new display fields could visually clutter the layout) — that is Agent-Probe only.
- `bun run check`/`bun run lint` (AC10) prove type-safety and style-rule compliance; they do NOT prove runtime correctness of the new query logic or UI behavior.
- No automated proof exists this cycle that the shared Playwright auth-fixture gap will be resolved — this SPEC/plan does not attempt to close that gap, it only works around it via Agent-Probe, consistent with the pre-accepted project-wide pattern.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs; 2 CONCERNs found during VALIDATE — Blast Radius consumer-list inaccuracy, and a phrasing-clarity risk in the security-relevant scoping instruction — both fully resolved via direct plan-text edits applied in this VALIDATE pass, plus one added Hybrid test-assertion hardening; 0 unresolved CONCERNs remain)
Accepted by: N/A — Gate is PASS; the 2 CONCERNs found during VALIDATE (Blast Radius consumer-list inaccuracy; scoping-instruction phrasing clarity) were both resolved via direct plan-text edits in this VALIDATE pass, not deferred for user acceptance.

## Autonomous Goal Block

SESSION GOAL: Ship REM-1 (owner/due-date columns) + REM-2 (uncapped "All Follow-Ups" tab w/ manager rep-filter) on `/reminders` (GitHub #204, #205)
Charter + umbrella plan: N/A — single plan, not a phase program
Autonomy: Standard RIPER-5 interactive gates apply (no standing /goal active for this task) — EXECUTE requires explicit "ENTER EXECUTE MODE"; EVL confirmation run is mandatory regardless of execute-agent's own gate reports
Hard stop conditions / safety constraints:
- NEVER modify `getTodayQueue`, `getRemindersQueue`, `computeAge`, or the `Urgency` type — all new logic must be additive (hard constraint, verified via diff-check at EVL)
- `getAllFollowUpsQueue`'s base scope predicate MUST be `visibilityCondition(userId, role)` alone — do NOT AND it with `eq(crmLeads.ownerId, userId)` (see Step 1 item 2 guardrail; this is the load-bearing security/correctness constraint for AC7)
- Reps must never receive the rep-filter dropdown and must never have `filterRepId` honored even if supplied
- No new route; no schema/migration changes
Next phase: EXECUTE — `process/features/reminders/active/rem-followup-sections_06-07-26/rem-followup-sections_PLAN_06-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: Checklist Step 0 grep confirmations → Steps 1-4 in order → Verification Evidence gates (`bun run check` | `bun run lint` | `bun run test:unit:ci` | new Hybrid DB specs) | Agent-Probe scenarios: AC1,AC2,AC6(dropdown-absent),AC7(UI),AC8,AC9 | high-risk pack: no (low-risk class per Blast Radius; owner-scoping logic gets a Hybrid gate, not a full risk-evidence-pack — not in the 6 high-risk classes requiring one)

## Next Step

Say "ENTER EXECUTE MODE" to proceed to implementation (validate-contract PASS — no outstanding blockers).
