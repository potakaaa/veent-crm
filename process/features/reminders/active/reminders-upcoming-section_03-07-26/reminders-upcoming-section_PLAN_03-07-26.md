---
name: plan:reminders-upcoming-section
description: Enrich /reminders with Due-today and Upcoming (next 7 days) sections alongside Overdue and Going-cold
date: 03-07-26
feature: reminders
---

# Reminders — Due Today + Upcoming Sections (GitHub #162)

Date: 03-07-26
Status: CODE DONE — EVL green 03-07-26; manual/agent-probe verification of AC1–AC5 pending
Complexity: SIMPLE — 4 file edits (3 source + 1 test), no schema, no new API route, no new DB column, no new query shape.

## Overview

`/reminders` currently shows only **Overdue** and **Going cold**. Leads whose follow-up is **today** (`urgency === 'due'`) or **within the next 7 days** (future) exist in the same query result (`getTodayQueue`) but are dropped. This plan extracts two new buckets — **Due today** and **Upcoming** — from the already-fetched queue and renders them, without touching the DB, schema, or API. Snooze behavior is unchanged. Context loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`.

**TL;DR:** Add two read-only sections to `/reminders` by bucketing leads already present in `getRemindersQueue`'s source queue; server returns four named arrays, component renders four sections; snooze parity preserved.

## Goals

1. Show a **Due today** section for leads with `urgency === 'due'`.
2. Show an **Upcoming** section for leads with a future `followUpAt` within the next 7 days (exclusive of today).
3. Keep **Overdue** and **Going cold** unchanged.
4. Keep snooze working identically for every section (including the two new ones).
5. Update the empty-state copy to reflect the wider net.

## Non-Goals / Out of Scope

- No schema changes, no new DB columns, no migration.
- No new API routes; `/api/leads/[id]/snooze` is reused as-is.
- No change to `getTodayQueue`, `computeAge`, or the `Urgency` type.
- No change to the snooze fetch contract or the 3-day snooze rule.

## Design Decision — component data shape

**DECISION:** Change `getRemindersQueue` and `+page.server.ts` to return **four named arrays** (`overdue`, `due`, `upcoming`, `cold`), and render each section from its own array in the component.

**WHY:** The `upcoming` bucket has **no single `urgency` value** — those leads carry `urgency: 'normal'` or `'fresh'`. The current component filters one flat `shadowLeads` list by `urgency === g.key`, which cannot express "future within 7 days." Bucketing on the **server** (where the date math already lives via `computeAge` / raw `followUpAt`) keeps the client dumb and avoids re-deriving date windows in the browser.

**REJECTED — tag leads with a synthetic `urgency: 'upcoming'`:** would require widening the `Urgency` type and mutating lead objects, polluting a shared type for one screen. Rejected.

**REJECTED — keep one flat `leads` array + client-side date filter for upcoming:** duplicates the 7-day window logic client-side and diverges from server truth after `invalidateAll()`. Rejected.

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/db/leads.ts` (`getRemindersQueue`, ~line 1471) | Add `due` + `upcoming` buckets extracted from the existing `queue`; widen return type to `{ overdue; due; upcoming; cold }`. |
| `src/routes/reminders/+page.server.ts` | Destructure the four arrays; return them as four page-data keys (not a flat `leads` array). |
| `src/routes/reminders/+page.svelte` | Render four sections; per-bucket optimistic shadow state; pass bucket key to `snooze` for targeted rollback; update empty-state copy. |

## Public Contracts

- **`getRemindersQueue(userId, role)` return type** changes from `{ overdue: Lead[]; cold: Lead[] }` to `{ overdue: Lead[]; due: Lead[]; upcoming: Lead[]; cold: Lead[] }`. Internal to the app; only caller is `/reminders/+page.server.ts` (verify via grep before editing — see Checklist step 0).
- **Known additive-safe test consumer:** `src/tests/reminders-db.spec.ts` also calls `getRemindersQueue` but destructures **only `overdue` and `cold`** (never the full object shape). Widening the return type to four arrays is **additive** — the existing test keeps compiling and passing unchanged. It runs under `describe.skipIf(SKIP_DB)` (`SKIP_DB = !process.env.DATABASE_URL`), so it self-skips in CI where no live Postgres is present. No edit is *required* here to avoid a break; see E1 (VALIDATE) for the additive test coverage this plan adds for the new `due`/`upcoming` buckets.
- **`/reminders` page data shape** changes from `{ leads: Lead[] }` to `{ overdue: Lead[]; due: Lead[]; upcoming: Lead[]; cold: Lead[] }`. Only consumer is `+page.svelte`.
- No external/HTTP contract changes. Snooze endpoint untouched.

## Blast Radius

- **3 source files**, all inside the reminders feature surface. Risk class: **low** (read-path enrichment; no writes, no auth, no schema, no migration).
- **1 known test consumer** — `src/tests/reminders-db.spec.ts` — is additive-safe (destructures `overdue`/`cold` only; the widened return type keeps it compiling). It is a DB-hybrid spec gated by `describe.skipIf(SKIP_DB)`, so it skips in CI. E1 (VALIDATE) adds `due`/`upcoming` cases to this file.
- The `getRemindersQueue` return-type change is a compile-time break contained to one **app** caller (`+page.server.ts`) — TypeScript (`bun run check`) will flag any missed consumer.

## Implementation Checklist

**0.** Grep to confirm the callers of `getRemindersQueue` and consumers of `data.leads` on this page:
```
grep -rn "getRemindersQueue\|data.leads" src/
```
Expected callers of `getRemindersQueue`: `src/routes/reminders/+page.server.ts` (app caller — will be updated in step 5) and `src/tests/reminders-db.spec.ts` (**known additive-safe test consumer** — destructures `overdue`/`cold` only, keeps compiling under the widened type; no action needed here beyond the E1 additive cases). Expected consumer of `data.leads` on this page: `+page.svelte`. **STOP only** if grep reveals a **new non-test consumer that expects the old exact two-field `{ overdue, cold }` shape** (destructures the whole object, or relies on it having exactly two keys) — that would widen the blast radius beyond SIMPLE. The additive widening does not break consumers that destructure a subset of fields.

**1.** In `src/lib/server/db/leads.ts` `getRemindersQueue` — widen the return type annotation to `Promise<{ overdue: Lead[]; due: Lead[]; upcoming: Lead[]; cold: Lead[] }>`.

**2.** In the same function, after the existing `overdue` filter and before `cold`, add the `due` bucket:
```ts
const due = queue
  .filter((l) => l.urgency === 'due')
  .sort(
    (a, b) =>
      new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime() ||
      a.id.localeCompare(b.id)
  );
```

**3.** Add the `upcoming` bucket (future follow-up within 7 days, excluding today's `due` leads). The `&& l.urgency !== 'due'` guard is **unconditional** — it guarantees a lead never appears in both `due` and `upcoming` regardless of intra-day timestamp ordering:
```ts
const now = new Date();
const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000);
const upcoming = queue
  .filter((l) => {
    if (!l.followUpAt) return false;
    if (l.urgency === 'due') return false;
    const t = new Date(l.followUpAt).getTime();
    return t > now.getTime() && t <= sevenDaysOut.getTime();
  })
  .sort(
    (a, b) =>
      new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime() ||
      a.id.localeCompare(b.id)
  );
```

**4.** Change the return statement to `return { overdue, due, upcoming, cold };`.

**5.** In `src/routes/reminders/+page.server.ts` — destructure and return the four arrays:
```ts
const { overdue, due, upcoming, cold } = await getRemindersQueue(locals.user.id, locals.user.role);
return { overdue, due, upcoming, cold };
```

**6.** In `src/routes/reminders/+page.svelte` — replace the single `shadowLeads` derived with four per-bucket derived shadows:
```ts
let shadowOverdue = $derived(data.overdue);
let shadowDue = $derived(data.due);
let shadowUpcoming = $derived(data.upcoming);
let shadowCold = $derived(data.cold);
```

**7.** Rebuild `groups` to include the two new sections, each bound to its shadow array (drop the `urgency`-filter grouping):
```ts
const groups = $derived([
  { key: 'overdue',  title: 'Overdue',    color: '#dc2626', hint: 'past their booked follow-up date', rows: shadowOverdue },
  { key: 'due',      title: 'Due today',  color: '#d97706', hint: 'follow-up due today',              rows: shadowDue },
  { key: 'upcoming', title: 'Upcoming',   color: '#2563eb', hint: 'follow-up booked in the next 7 days', rows: shadowUpcoming },
  { key: 'cold',     title: 'Going cold', color: '#9ca3af', hint: 're-touch before they lapse',       rows: shadowCold }
]);
const total = $derived(groups.reduce((n, g) => n + g.rows.length, 0));
```
Keep the existing `{#each groups as g (g.key)}` render block — it already guards on `g.rows.length` and renders `g.color`/`g.title`/`g.hint`/`g.rows`.

**8.** Update `snooze` to take the bucket key and do targeted optimistic remove + rollback on the correct shadow array (mirrors the existing single-list logic, one array at a time):
```ts
async function snooze(l: Lead, bucket: 'overdue' | 'due' | 'upcoming' | 'cold') {
  // ... duplicate-submit guard unchanged ...
  const remove = () => { /* set the matching shadow* array via removeFromList(...) */ };
  const restore = () => { /* re-add l to the matching shadow* array if absent */ };
  // optimistic remove -> fetch -> rollback via restore() on failure -> invalidateAll on success
}
```
Update the `LeadListRow` call site to pass the bucket: `onSnooze={(lead) => snooze(lead, g.key)}`. Keep `nudge` unchanged.

**9.** Update the empty-state copy: change `title="Nothing due"` to `title="Nothing due or coming up soon"` (keep `tone="success"`; adjust `hint` if the wording now reads oddly).

**10.** Run the verification gates (see Verification Evidence).

## Acceptance Criteria

1. **AC1 (Goal 1):** A lead with `urgency === 'due'` appears under a **Due today** section and nowhere else.
2. **AC2 (Goal 2):** A lead with `followUpAt` within +1..+7 days appears under **Upcoming**; a lead at +8 days or later does not appear at all.
3. **AC3 (Goal 3):** Overdue and Going-cold sections render exactly as before (same membership, order, styling).
4. **AC4 (Goal 4):** Snooze on a lead in any of the four sections optimistically removes it from that section and rolls back to the same section on failure.
5. **AC5 (Goal 5):** With no due/upcoming/overdue/cold leads, the empty-state reads "Nothing due or coming up soon".
6. **AC6:** `bun run check` and `bun run lint` both exit 0.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | AC6 — return-type + page-data shape change compiles; no missed `getRemindersQueue` / `data.leads` consumer |
| `bun run lint` exits 0 | Fully-Automated | AC6 — no unused-var / style regression from removed `shadowLeads` |
| `bun run test:unit:ci` exits 0 (62+ passing) | Fully-Automated | Existing suite (incl. `reminders-db.spec.ts` DB cases self-skipped via `skipIf(SKIP_DB)`) stays green after the return-type widening |
| `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` exits 0 (after E1) | Hybrid (live Postgres) | AC1/AC2 — new `due`/`upcoming` DB bucket cases pass against a real queue |
| Agent probe: lead with `followUpAt` = today → appears under **Due today** only | Agent-Probe | AC1 |
| Agent probe: lead at +3 days → under **Upcoming**; lead at +10 days → absent | Agent-Probe | AC2 |
| Agent probe: Overdue + Going-cold render unchanged vs before | Agent-Probe | AC3 |
| Agent probe: snooze a lead in each of the 4 sections → optimistic remove + rollback to correct section | Agent-Probe | AC4 |
| Agent probe: empty DB state → "Nothing due or coming up soon" | Agent-Probe | AC5 |

Notes on tiers: the four sections render from real DB rows behind session auth, so full end-to-end render proof is **Hybrid/Agent-Probe** — it depends on the shared Playwright authenticated-session fixture, a **known project-wide gap** (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). The bucket-partition logic (AC1/AC2) IS provable at the DB tier via `reminders-db.spec.ts` under live Postgres (E1). Fully-automated CI proof is limited to `bun run check` + `bun run lint` + `test:unit:ci` (DB cases self-skip). Snooze-per-section rollback (AC4) and full four-section render remain Agent-Probe until the shared e2e auth fixture lands. Test context: `process/context/tests/all-tests.md`.

## Test Infra Improvement Notes

- The four-section render and snooze-per-section rollback are only mechanically provable via a Playwright authenticated-session run, blocked by the missing shared e2e auth fixture (pre-existing, tracked in `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). When that fixture lands, add a `/reminders` e2e spec asserting: (a) a today-dated lead lands in Due today only, (b) a +3d lead lands in Upcoming and a +10d lead does not, (c) snooze removes from the correct section. Until then the render/snooze paths remain Agent-Probe / known-gap.
- The bucket-partition assertions (Due today vs Upcoming membership) do NOT need the e2e fixture — they are provable at the DB integration tier and are added by E1 to `reminders-db.spec.ts`.

## Phase Completion Rules

- **CODE DONE** = checklist steps 0–9 applied and `bun run check` + `bun run lint` + `bun run test:unit:ci` all exit 0 (AC6).
- **VERIFIED** = CODE DONE plus AC1–AC5 confirmed. AC1/AC2 close via the E1 DB cases (`SKIP_DB=false` run against live Postgres); AC3–AC5 close via agent probe or user against real `/reminders` data. Because the shared e2e auth fixture is a known gap, the full-render AC3–AC5 close via manual/agent probe or user confirmation, not automated e2e — do not mark ✅ VERIFIED without explicit user-confirmed observation of the render paths.
- This is a single-section SIMPLE plan; there are no sub-phases to sequence.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reminders/active/reminders-upcoming-section_03-07-26/reminders-upcoming-section_PLAN_03-07-26.md`
2. **Last completed step:** VALIDATE complete (CONDITIONAL, inner-pvl phase-1). No code changed yet.
3. **Validate-contract status:** written (03-07-26) — CONDITIONAL, see `## Validate Contract`.
4. **Context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; source verified: `+page.svelte`, `+page.server.ts`, `getRemindersQueue` (leads.ts ~1471), `Urgency` type, `reminders-db.spec.ts`.
5. **Next step for a fresh agent:** run checklist step 0 (grep) FIRST; if only the known consumers appear, apply steps 1–9 in order, then run the test gates. Apply E1 (add `due`/`upcoming` DB cases to `reminders-db.spec.ts`) as part of EXECUTE.

## Next Step

Contract written — proceed to ENTER EXECUTE MODE.

## Validate Contract

Status: CONDITIONAL
Date: 03-07-26
date: 2026-07-03
generated-by: inner-pvl: phase-1

Parallel strategy: sequential
Rationale: 1/7 signals (single low-risk read-path feature, 3 source files, no schema/auth/API surface) — sequential is the fit; no fan-out benefit.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC6 | Return-type + page-data shape change compiles; no missed consumer | Fully-Automated | `bun run check` (exits 0) | A |
| AC6 | No unused-var / style regression from removed `shadowLeads` | Fully-Automated | `bun run lint` (exits 0) | A |
| AC3 | Existing suite stays green under the widened return type (DB cases self-skip via `skipIf(SKIP_DB)`) | Fully-Automated | `bun run test:unit:ci` (exits 0, 62+ passing) | A |
| AC1/AC2 | New `due`/`upcoming` DB buckets partition correctly against a real queue | Hybrid | `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` (exits 0 — precondition: live Postgres, cases added by E1) | B |
| AC1 | Today-dated lead renders under Due today only | Agent-Probe | Probe `/reminders` with a today-dated lead; confirm single-section membership | C |
| AC2 | +3d lead under Upcoming; +10d lead absent | Agent-Probe | Probe `/reminders` with +3d and +10d leads | C |
| AC4 | Snooze optimistic remove + rollback to correct section | Agent-Probe | Probe snooze in each of the 4 sections | C |
| AC5 | Empty state reads "Nothing due or coming up soon" | Agent-Probe | Probe `/reminders` with empty queue | C |
| AC3/AC4/AC5 | Automated e2e of four-section render + snooze | Known-Gap | — (blocked by shared Playwright auth fixture) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — E1)
- C — deferred to agent-probe / user confirmation (no live e2e fixture)
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Compile/shape: Fully-automated: `bun run check` (exits 0)
- Lint: Fully-automated: `bun run lint` (exits 0)
- Unit suite: Fully-automated: `bun run test:unit:ci` (exits 0, 62+ passing)
- DB bucket partition: hybrid: `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` (exits 0) + precondition: live Postgres; E1 adds `due`/`upcoming` cases
- Four-section render + snooze rollback: agent-probe: manual/agent probe against real `/reminders` data
- Automated e2e of four-section render: known-gap: documented — blocked by shared Playwright auth fixture (project-wide pre-accepted gap)

Failing stub (for `bun run test:unit:ci` — additive `due`/`upcoming` unit coverage, red-first for E1):
```
test("should place a today-dated lead in the due bucket and nowhere else", () => { throw new Error("NOT IMPLEMENTED — TDD stub: due bucket partition") })
```
```
test("should place a +3d lead in upcoming and exclude a +10d lead", () => { throw new Error("NOT IMPLEMENTED — TDD stub: upcoming bucket window") })
```

Dimension findings:
- Infra fit: PASS — no container/port/runtime surface; read-path enrichment inside existing SvelteKit `+page.server.ts` + component; runner is Vitest (`bun run test:unit`) already present.
- Test coverage: CONCERN — bucket-partition (AC1/AC2) had no automated gate before this cycle; E1 adds `due`/`upcoming` DB cases to `reminders-db.spec.ts` (Hybrid, needs live Postgres). Render/snooze (AC3–AC5) remain Agent-Probe until the shared e2e auth fixture lands.
- Breaking changes: PASS — `getRemindersQueue` return-type widening is additive; only app caller (`+page.server.ts`) updated in the same plan; `reminders-db.spec.ts` destructures `overdue`/`cold` only and keeps compiling. `bun run check` flags any missed consumer.
- Security surface: PASS — no auth, secrets, billing, or trust-boundary changes; snooze endpoint untouched.
- Section feasibility (single SIMPLE section): PASS — edit targets (`getRemindersQueue` ~line 1471, `+page.server.ts` line 8, `+page.svelte` line 18) confirmed present and uniquely matchable via grep; highest-risk edit is the `+page.svelte` shadow-state refactor (four derived arrays + per-bucket snooze rollback) — mitigation: mirror the existing single-list optimistic pattern one array at a time, `bun run check` gates the type change.

Accepted concerns (CONDITIONAL):
- E1 test gap: before this cycle, the new `due`/`upcoming` bucket partition (AC1/AC2) had no automated proof. Accepted with mitigation — E1 requires EXECUTE to add `due`/`upcoming` DB cases to `src/tests/reminders-db.spec.ts`, making AC1/AC2 provable at the Hybrid tier under live Postgres. The render/snooze paths (AC3–AC5) remain Agent-Probe (no live e2e auth fixture — pre-accepted project-wide gap).

Plan updates applied:
- P1 — Amended Blast Radius, Public Contracts, and Checklist step 0 to acknowledge `src/tests/reminders-db.spec.ts` as a known additive-safe consumer (destructures `overdue`/`cold` only; the widened return type keeps it compiling; `skipIf(SKIP_DB)` self-skips in CI). Step-0 STOP reframed to fire only for a **new non-test consumer expecting the old exact two-field `{ overdue, cold }` shape**.
- P2 — Made `&& l.urgency !== 'due'` (as `if (l.urgency === 'due') return false;`) **unconditional** in Checklist step 3's `upcoming` filter, guaranteeing single-bucket membership regardless of intra-day timestamp ordering. Removed the prior "add only if overlap observed" conditional wording.

Execute-agent instructions:
- E1 (REQUIRED): Add `describe.skipIf(SKIP_DB)` DB cases to `src/tests/reminders-db.spec.ts` for the new `due` and `upcoming` buckets — assert a today-dated (`urgency === 'due'`) lead lands in `due` and not `upcoming`, and a +3d lead lands in `upcoming` while a +10d lead lands in neither. Run `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` against live Postgres to confirm exit 0. Cases self-skip in CI (no `DATABASE_URL`).
- E2: Run checklist step 0 (`grep -rn "getRemindersQueue\|data.leads" src/`) FIRST. Expect exactly `+page.server.ts` (app caller) and `reminders-db.spec.ts` (additive-safe test). STOP only if a NEW non-test consumer expecting the old two-field shape appears.
- E3: The `+page.svelte` refactor (single `shadowLeads` → four per-bucket shadows + bucket-keyed `snooze`) is the highest-risk edit — mirror the existing single-list optimistic remove/rollback one array at a time; do not batch. Confirm `bun run check` exits 0 after the type-shape change before touching the component.

Test gates (exact commands):
- `bun run check` (exits 0) — Fully-automated
- `bun run lint` (exits 0) — Fully-automated
- `bun run test:unit:ci` (exits 0, 62+ passing) — Fully-automated
- `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` (exits 0 after E1 adds cases) — Hybrid, needs live Postgres

Open gaps: No automated e2e of the four-section render or snooze-per-section rollback — blocked by the missing shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), a pre-accepted project-wide gap. Carried as known-gap: documented; render/snooze verification closes via agent probe or user confirmation until the fixture lands.

What this coverage does NOT prove:
- `bun run check` — proves the code type-checks; does NOT prove any bucket contains the correct leads at runtime, nor that sections render.
- `bun run lint` — proves style/no-unused-var; proves nothing about behavior.
- `bun run test:unit:ci` — proves the existing suite is green and the widening did not regress it; the `reminders-db.spec.ts` DB cases SELF-SKIP here (no `DATABASE_URL`), so it does NOT prove bucket partition in CI.
- `SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts` — proves `due`/`upcoming`/`overdue`/`cold` partition correctly against a real queue; does NOT prove the component renders four sections, nor that snooze optimistic-remove/rollback targets the correct section, nor the empty-state copy.
- Agent probes — human/agent judgment of render + snooze; NOT a deterministic regression gate. No automated e2e exists for the four-section render (known-gap).

Gate: CONDITIONAL (concerns noted, user accepted — E1 test gap accepted with mitigation)
Accepted by: user (session) — accepted concern: E1 bucket-partition test gap (mitigated by required E1 DB cases); known-gap: automated e2e of four-section render (pre-accepted project-wide Playwright auth-fixture gap)

## Autonomous Goal Block

```
SESSION GOAL: Enrich /reminders with Due-today + Upcoming (next 7 days) sections alongside Overdue and Going-cold (GitHub #162)
Charter + umbrella plan: N/A — single plan
Autonomy: single-plan CONDITIONAL contract; EXECUTE applies checklist steps 0–9 + E1 exactly; no creative deviation. Auto-proceed on reversible edits; hard-stop only on an unexpected non-test consumer of the old two-field getRemindersQueue shape (step 0 STOP).
Hard stop conditions / safety constraints:
- STOP if grep step 0 reveals a NEW non-test consumer expecting the old exact { overdue, cold } two-field shape (would widen blast radius beyond SIMPLE).
- Do NOT change getTodayQueue, computeAge, the Urgency type, the snooze fetch contract, or the 3-day snooze rule.
- No schema / DB column / migration / new API route.
Next phase: EXECUTE: process/features/reminders/active/reminders-upcoming-section_03-07-26/reminders-upcoming-section_PLAN_03-07-26.md
Validate contract: inline in plan (## Validate Contract — CONDITIONAL, generated-by inner-pvl: phase-1)
Execute start: bun run check | bun run lint | bun run test:unit:ci | SKIP_DB=false bun run test:unit -- src/tests/reminders-db.spec.ts (Hybrid, after E1) | agent-probe: four-section render + snooze rollback | high-risk pack: no
```
