---
name: plan:dev-seed
description: "Rewrite scripts/seed.ts to seed 25 leads + activities + history for dev/demo; add db:seed alias and seed doc"
date: 29-06-26
feature: leads
---

# Dev Seed Script — Implementation Plan (SIMPLE)

**Date**: 29-06-26
**Status**: Active — pending VALIDATE
**Complexity**: SIMPLE
**Feature**: leads
**Context loaded**: `process/context/all-context.md` (router), `src/lib/server/db/schema.ts`, `src/lib/server/dates.ts`. Testing conventions: `process/context/tests/all-tests.md`.

**TL;DR:** Rewrite `scripts/seed.ts` to keep the existing 10-user seed and add 25 fixed-UUID leads, ~17 activities, and 3 history rows that light up every DB-backed surface (Today urgency buckets, pipeline stages, won/lost, unassigned, needs-review, dedup candidates, activity-rich timelines). Add `--reset`/`--force` flags + a prod safety guard, an `db:seed` npm alias, and a how-to doc. Idempotent re-seeds via fixed UUIDs. One script file, one doc, three small appends. No schema change, no app-code change.

---

## Overview

Goal: give developers/demos realistic CRM data with one command (`bun run db:seed`) so every DB-backed page renders meaningful content and urgency logic is visibly exercised.

Complexity: **SIMPLE** — single script rewrite + doc + `package.json` alias + two loop-log appends. No migrations, no app-surface changes, no new dependencies (`drizzle-orm` + `postgres` already present).

Non-goals: wiring auth, replacing mock data in service-layer pages (`/unassigned`, `/review`, `/reminders` page bodies stay mock-backed — only their badge counts read DB), or adding DB integration tests (requires live Postgres — recorded as a known gap).

---

## Critical Schema Reconciliation (READ BEFORE CODING)

The research roster uses shorthand that does NOT match the live enums in `src/lib/server/db/schema.ts`. EXECUTE MUST translate:

| Research shorthand | Actual column | Valid enum value to write |
|---|---|---|
| "Facebook" / "FB" | `platform` (`crm_lead_platform`) | `Facebook` |
| "IG" | `platform` | `Instagram` |
| "Twitter" | `platform` | `Twitter/X` |
| "TikTok" | `platform` | `TikTok` |
| city e.g. "Davao", "Cebu" | `location` (text) | free text — NOT an enum |
| category e.g. "Sports", "Workshop" | `category` (`crm_lead_category`) | must be one of the 20 enum members (all roster categories already valid) |

Additional column facts that constrain the seed:
- Lead has BOTH `platform` (channel) AND `source` (`crm_lead_source`: `sheet_import` | `manual` | `scraper` | `other`). Dedup pair L022/L023 differ by `source` (`scraper` vs `manual`).
- `lastActivityAt` on `crm_leads` is maintained-from-activities — the seed MUST set it explicitly per lead (it is not auto-derived at insert time).
- `currency` defaults to `'PHP'`; set it whenever `dealValueCents` is set.
- History table timestamp column is `at` (not `createdAt`); actor FK is `actorUserId`.
- Activity dedupe unique index is `(leadId, repId, occurredAt, channel)`. Use fixed activity `id`s + `onConflictDoUpdate({ target: crmActivities.id, set: { occurredAt, followUpAt } })` so re-seeds refresh relative timestamps without violating the dedupe index.

---

## Touchpoints

| File | Action |
|---|---|
| `scripts/seed.ts` | Rewrite — keep user seed, add leads/activities/history + flags + safety guard + summary |
| `package.json` | Add `"db:seed": "bun scripts/seed.ts"` (line 24 area, after existing `"seed"`) |
| `.jsrl/loop/docs/seed-dev-data.md` | New doc — how to seed, routes covered, login note, safety, known gaps |
| `.jsrl/loop/LOG.md` | Append one terse dated line |
| `.jsrl/loop/domains/crm-build/README.md` | Append one dated timeline line |

Files read for context (no edits): `src/lib/server/db/schema.ts`, `src/lib/server/dates.ts` (urgency logic).

---

## Public Contracts

- **CLI contract** (`bun scripts/seed.ts [flags]`):
  - no flags → upsert users + leads + history (idempotent), upsert activities (refreshing timestamps).
  - `--reset` → delete known seed rows (history → activities → leads, FK order) for the fixed seed-ID set ONLY, then re-seed. Never truncates tables; never touches non-seed rows.
  - `--force` → required to run when `NODE_ENV === 'production'`.
- **Safety guard:** `NODE_ENV === 'production'` AND no `--force` → print error, `process.exit(1)`, no DB writes.
- **Fixed UUID namespaces** (stable across re-seeds): users `00000000-…`, leads `00000001-…`, activities `00000002-…`, history `00000003-…`.
- No HTTP/API surface, no schema, no exported module API — this is a standalone script.

---

## Blast Radius

- **Scope:** 1 rewritten script, 1 new doc, 3 small appends. ~5 files.
- **Risk class:** writes to a dev database via a standalone postgres client. NOT a high-risk class (no auth/billing/migration/public-API change; no app code path). The only data-mutation risk is `--reset`, bounded to the fixed seed-ID set with a prod guard.
- **Reversibility:** fully reversible — `--reset` removes exactly the seed rows; fixed IDs mean re-runs are deterministic.

---

## Implementation Checklist

1. **`scripts/seed.ts` — preamble & flags.** Keep imports; add `crmLeads, crmActivities, crmLeadHistory` to the schema import. Parse `process.argv` for `--reset` and `--force`. Add prod guard: `if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) { console.error('Refusing to seed in production without --force'); process.exit(1); }`.

2. **`scripts/seed.ts` — user seed (unchanged behavior).** Keep the existing 10-user array and `onConflictDoNothing()`. Capture inserted/seeded count for the summary.

3. **`scripts/seed.ts` — define USER_IDS constants.** `const JOHN = '00000000-…-0001'`, `JONNA = '…-0002'`, `ETHYL = '…-0003'`, `MEYBELLE = '…-0004'`, `SHANE = '…-0005'`, `ELAY = '…-0006'` for readable ownerId/repId references.

4. **`scripts/seed.ts` — relative-time helpers.** Add `const now = new Date();` and helpers `daysAgo(n)`, `hoursAgo(n)`, and `todayEndManila()` (today 23:59 in Asia/Manila → due-bucket). Use fixed `new Date('2026-05-01...')` / `new Date('2026-04-15...')` for the intentionally-cold leads L004/L005.

5. **`scripts/seed.ts` — leads array (25 rows, prefix `00000001-`).** Build `(typeof crmLeads.$inferInsert)[]` per the roster in the Lead Roster table below. Map platform shorthand via the reconciliation table. Set `location` from the city. Set `lastActivityAt` explicitly per lead (matching its newest activity, or the cold fixed date). Set `dealValueCents` + `currency:'PHP'` on L013/L014/L015. Set `ownerId: null` on L017–L019. Set `needsReview: true` on L020/L021. Set `source:'scraper'` on L022 and `source:'manual'` on L023 with matching `socialFacebook`. Set won fields on L015, `lostReason:'no_response'` on L016. Assign a non-null `ownerId` (ELAY) to L022/L023 — never null (a null owner inflates the unassigned badge past 3 and breaks AC6).

6. **`scripts/seed.ts` — activities array (prefix `00000002-`).** Build per the Activity Roster table. Each row: fixed `id`, `leadId`, `repId`, `channel`, `occurredAt`, `outcome`, optional `followUpAt`.

7. **`scripts/seed.ts` — history array (prefix `00000003-`).** Three rows H001–H003 per the History Roster table (`field`, `oldValue`, `newValue`, `actorUserId`).

8. **`scripts/seed.ts` — `--reset` branch.** When `--reset`: inside the try, BEFORE inserts, delete in FK-safe order using `inArray(table.id, [...fixedIds])` from `drizzle-orm` — history first, then activities, then leads. Only the fixed seed-ID arrays; never a bare `delete(table)`.

9. **`scripts/seed.ts` — insert order + conflict strategy.** Insert users (`onConflictDoNothing`) → leads (`onConflictDoNothing` on id) → activities (`onConflictDoUpdate` with `set: { occurredAt, followUpAt, outcome }`) → history (`onConflictDoNothing` on id). Wrap in `try { … } finally { await client.end(); }` (existing pattern).

10. **`scripts/seed.ts` — summary output.** After inserts, `console.log` counts: users, leads, activities, history. Print suggested routes + the login reminder: "Log in via magic-link as john.sabuga@veent.io or jonna@veent.io to see owned leads on Today (/)."

11. **`package.json` — add alias.** Add `"db:seed": "bun scripts/seed.ts"` after `"seed"` (keep trailing-comma/JSON validity).

12. **`.jsrl/loop/docs/seed-dev-data.md` — new doc.** Sections: How to seed (`bun run db:seed`, `--reset`, `--force`); What gets seeded (counts + roster summary); Routes covered (table mapping each surface → what appears); Login requirement (no DEV_BYPASS — magic-link login needed); Safety (prod guard, `--reset` bounded to seed IDs); Known gaps (service-layer pages still mock-backed; no DB integration test).

13. **`.jsrl/loop/LOG.md` — append.** One terse dated line: `29-06-26 dev seed: scripts/seed.ts now seeds 25 leads + activities + history; db:seed alias added`.

14. **`.jsrl/loop/domains/crm-build/README.md` — append.** One dated timeline line referencing the seed work and the new doc path.

---

## Lead Roster (25 — prefix `00000001-…`)

> `platform`/`location`/`category` already reconciled to valid values. `lastActivityAt` column shown where it drives urgency.

| ID | name | category | platform | location | stage | owner | special | drives |
|---|---|---|---|---|---|---|---|---|
| L001 …0001 | USWAG Davao | Sports | Facebook | Davao | contacted | JOHN | A001 followUp −2d | Today: overdue |
| L002 …0002 | Sayaw Mindanao | Workshop | Instagram | CDO | new | JOHN | A002 followUp today 23:59 | Today: due |
| L003 …0003 | ENHYPEN PH Fan Fair | Fan Fair | Twitter/X | — | replied | JOHN | lastActivityAt −12h, no future followUp | Today: replied |
| L004 …0004 | Bar Cumbia Nights | Bar/DJ | Facebook | — | new | JOHN | lastActivityAt 2026-05-01 | Today: cold/stale |
| L005 …0005 | Baguio Camp Org | Camp | Instagram | Baguio | contacted | JOHN | lastActivityAt 2026-04-15, source scraper | Today: cold/stale |
| L006 …0006 | Cebu Wedding Expo | Expo | Facebook | Cebu | contacted | JONNA | A006 followUp −3d | Jonna overdue |
| L007 …0007 | Iloilo Music Fest PH | Music Fest | Instagram | Iloilo | new | JONNA | A007 followUp today 23:59 | Jonna due |
| L008 …0008 | DAC Events Manila | Concert | Instagram | Manila | new | JONNA | — | pipeline new |
| L009 …0009 | Cagayan Convention Center | Convention | Facebook | Cagayan | new | ETHYL | — | pipeline new |
| L010 …0010 | Mindanao Sports Summit | Sports | Facebook | Davao | contacted | JONNA | A008 email −7d | pipeline contacted |
| L011 …0011 | QC Science Expo 2026 | Expo | Twitter/X | QC | contacted | MEYBELLE | — | pipeline contacted |
| L012 …0012 | Batangas Beach Resort | Resort | Instagram | Batangas | replied | SHANE | A009 ig_dm replied −2d | pipeline replied |
| L013 …0013 | UP Film Screening Org | Screening | TikTok | Manila | in_discussion | JOHN | dealValueCents 150000 PHP | pipeline in_discussion |
| L014 …0014 | Metro Cebu Live Band | Live Band | Facebook | Cebu | in_discussion | ETHYL | dealValueCents 250000 PHP | pipeline in_discussion |
| L015 …0015 | Iloilo Music Fest OKK | Music Fest | Instagram | Iloilo | won | JOHN | wonOrgName "Iloilo OKK Productions", dealValueCents 300000 PHP, signedAt −10d | pipeline won + H001 |
| L016 …0016 | Davao Fan Fair 2025 | Fan Fair | Twitter/X | Davao | lost | JONNA | lostReason no_response | pipeline lost + H002 |
| L017 …0017 | Manila School Fiesta | School | Facebook | Manila | new | null | ownerId null | unassigned badge |
| L018 …0018 | Pangasinan Convention | Convention | Facebook | Pangasinan | new | null | ownerId null | unassigned badge |
| L019 …0019 | Zamboanga Live Band Festival | Live Band | Instagram | Zamboanga | new | null | ownerId null | unassigned badge |
| L020 …0020 | Tagaytay Church Retreat | Church | Facebook | Tagaytay | new | JOHN | needsReview true | review badge |
| L021 …0021 | Bacolod Theater Guild | Theater | Instagram | Bacolod | contacted | JONNA | needsReview true | review badge |
| L022 …0022 | Sayaw Pilipinas Manila | Workshop | Facebook | Manila | new | ELAY | source scraper, socialFacebook fb.com/SayawPilipinas | dedup pair |
| L023 …0023 | Sayaw Pilipinas (MNL) | Workshop | Facebook | Manila | new | ELAY | source manual, socialFacebook fb.com/SayawPilipinas | dedup pair |
| L024 …0024 | Davao Concert Producers | Concert | Instagram | Davao | in_discussion | JOHN | A011–A014 (4 touches) | activity-rich timeline |
| L025 …0025 | Cebu Modelling Agency | Modelling | Facebook | Cebu | contacted | ETHYL | A015–A017 (3 touches) | activity-rich timeline |

L022/L023 owner: assign a NON-NULL owner (ELAY above). MUST NOT be null — `getNavCounts` counts every null-owner non-won/lost lead as unassigned, so a null owner here makes the unassigned badge 5 and breaks AC6 (expects 3).

## Activity Roster (prefix `00000002-…`; `onConflictDoUpdate` on id)

| ID | lead | channel | outcome | rep | occurredAt | followUpAt |
|---|---|---|---|---|---|---|
| A001 …0001 | L001 | ig_dm | sent | JOHN | −5d | −2d (overdue) |
| A002 …0002 | L002 | fb_dm | sent | JOHN | −3d | today 23:59 Manila (due) |
| A003 …0003 | L003 | call | replied | JOHN | −12h | — |
| A004 …0004 | L004 | fb_dm | sent | JOHN | 2026-05-01 | — |
| A005 …0005 | L005 | ig_dm | no_response | JOHN | 2026-04-15 | — |
| A006 …0006 | L006 | ig_dm | sent | JONNA | −4d | −3d (overdue) |
| A007 …0007 | L007 | fb_dm | sent | JONNA | −2d | today 23:59 Manila (due) |
| A008 …0008 | L010 | email | sent | JONNA | −7d | — |
| A009 …0009 | L012 | ig_dm | replied | SHANE | −2d | — |
| A010 …0010 | L015 | call | replied | JOHN | −12d | — |
| A011 …0011 | L024 | ig_dm | sent | JOHN | −20d | — |
| A012 …0012 | L024 | email | sent | JOHN | −15d | — |
| A013 …0013 | L024 | call | replied | JOHN | −10d | — |
| A014 …0014 | L024 | meeting | replied | JOHN | −5d | — |
| A015 …0015 | L025 | fb_dm | sent | ETHYL | −14d | — |
| A016 …0016 | L025 | ig_dm | no_response | ETHYL | −7d | — |
| A017 …0017 | L025 | call | sent | ETHYL | −2d | — |

## History Roster (prefix `00000003-…`; `onConflictDoNothing`)

| ID | lead | field | oldValue | newValue | actor |
|---|---|---|---|---|---|
| H001 …0001 | L015 | stage | in_discussion | won | JOHN |
| H002 …0002 | L016 | stage | contacted | lost | JONNA |
| H003 …0003 | L013 | deal_value_cents | 0 | 150000 | JOHN |

---

## Acceptance Criteria

- AC1: `bun run db:seed` against a clean dev DB exits 0 and prints a summary with users/leads/activities/history counts.
- AC2: Running `bun run db:seed` twice produces no duplicate rows and no unique-index violation (idempotent).
- AC3: 25 leads exist with valid enum values for `category`, `platform`, `stage`, `source` (no enum errors on insert).
- AC4: Today page (`/`) logged in as John shows L001 in overdue, L002 in due, L003 in replied, L004/L005 in cold buckets.
- AC5: Pipeline page (`/pipeline`) shows leads across all 6 stages (new, contacted, replied, in_discussion, won, lost).
- AC6: Unassigned badge counts 3 (L017–L019); Review badge counts 2 (L020–L021).
- AC7: `bun scripts/seed.ts --reset` removes only the fixed seed IDs then re-inserts; non-seed rows untouched.
- AC8: `NODE_ENV=production bun scripts/seed.ts` (no `--force`) exits 1 with an error and writes nothing.
- AC9: `bun run check` passes (no TypeScript errors in the rewritten script).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run check` exits 0 | Fully-Automated | AC9 — script typechecks against schema `$inferInsert` types (catches enum/column mismatches at compile time) |
| `bun run db:seed` then `bun run db:seed` (clean dev DB), exit 0 both times | Hybrid (precondition: running Postgres at `DATABASE_URL`) | AC1, AC2, AC3 — seed succeeds and is idempotent |
| `NODE_ENV=production bun scripts/seed.ts` exits 1, DB row count unchanged | Hybrid (precondition: dev Postgres) | AC8 — prod safety guard blocks writes |
| `bun scripts/seed.ts --reset` then query seed-ID counts vs non-seed counts | Hybrid (precondition: dev Postgres) | AC7 — reset bounded to seed IDs |
| Manual: magic-link login as john.sabuga@veent.io → inspect Today buckets, Pipeline columns, Unassigned/Review badges | Agent-Probe (judgment: visual bucket/stage/badge correctness) | AC4, AC5, AC6 — seeded data renders in the right surfaces with correct urgency |

Failing stub (AC9 / typecheck gate):
```
test("should typecheck scripts/seed.ts against drizzle $inferInsert", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: bun run check passes on rewritten seed.ts")
})
```

Tier note: there is NO automated unit test for the seed itself (it has no pure exported function and requires a live DB). Idempotency/reset/prod-guard are Hybrid (need Postgres); surface rendering is Agent-Probe (needs login + visual judgment). Recorded as known gaps below — none are high-risk classes, so no hybrid-minimum is forced.

Testing context: see `process/context/tests/all-tests.md` for runner selection (Vitest unit + Playwright e2e); the seed has no automated tier, so post-phase testing is the Hybrid + Agent-Probe gates above.

---

## Test Infra Improvement Notes

(none identified yet — seed has no automated test harness; a future `scripts/__tests__` against an ephemeral Postgres container would close AC1–AC3/AC7/AC8 as Fully-Automated, but that infra does not exist in this repo and is out of scope for this SIMPLE plan.)

---

## Phase Completion Rules

This is a single-phase SIMPLE plan. The phase is complete only when:

- All 14 checklist items are applied (script rewrite + alias + doc + 2 loop-log appends).
- AC9 is green (`bun run check` exits 0) — this is the mandatory automated gate before any DB run.
- The Hybrid gates (AC1/AC2/AC3, AC7, AC8) are run against a dev Postgres and pass, OR are explicitly recorded as deferred with reason (no reachable dev DB) in the EVL handoff.
- Status is `CODE DONE` after the checklist + AC9. It is NOT `VERIFIED` until the Agent-Probe surface check (AC4–AC6) is confirmed by a user logged in via magic-link. Do not mark `✅ VERIFIED` without that user confirmation.

---

## Dependencies, Risks, Known Gaps

- **Dependencies:** `drizzle-orm` (for `inArray`, `sql`), `postgres` — both already in `package.json`. A reachable dev Postgres at `DATABASE_URL` (defaults to `postgres://crm:crm@127.0.0.1:5432/veent_crm`).
- **Risk — enum drift:** if EXECUTE uses research shorthand ("IG"/"Twitter") instead of mapped enum values, inserts fail. Mitigated by the Schema Reconciliation table + `$inferInsert` typing caught by `bun run check`.
- **Risk — `lastActivityAt` not set:** Today urgency (stale/cold) depends on it; if left null, cold-bucket ACs fail. Mitigated by checklist step 5 (set explicitly per lead).
- **Known gap (documented in seed doc):** `/unassigned`, `/review`, `/reminders` page BODIES remain service-layer/mock-backed; only badge counts (`/api/nav-counts`) read DB.
- **Known gap:** no DEV_BYPASS — developer must magic-link login with a seed user email to see owned-lead surfaces.
- **Known gap:** no DB integration test for the seed (requires live Postgres; not added in this plan).

---

## Validate Contract

Status: CONDITIONAL
Date: 29-06-26
date: 2026-06-29
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7 only: ~5 files in blast radius). Single-app, no schema/auth/API surface, no high-risk class.

Test gates (C3 5-column table — ADDITIVE; legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | 25 leads insert with valid enum values (category/platform/stage/source/channel/outcome) | Hybrid | `bun run db:seed` on dev Postgres inserts with no enum/column error — precondition: Postgres at DATABASE_URL. NOTE: `bun run check` does NOT cover scripts/ (svelte-kit tsconfig include omits scripts/), so enum correctness is proven at DB-run time, not compile time | C |
| AC1, AC2 | seed exits 0 and is idempotent (no dup rows / no unique-index violation on re-run) | Hybrid | `bun run db:seed` twice on a clean dev DB, exit 0 both times — precondition: dev Postgres | C |
| AC7 | `--reset` removes only the fixed seed IDs; non-seed rows untouched | Hybrid | `bun scripts/seed.ts --reset` then compare seed-ID vs non-seed row counts — precondition: dev Postgres | C |
| AC8 | prod safety guard blocks writes without `--force` | Hybrid | `NODE_ENV=production bun scripts/seed.ts` exits 1, DB row count unchanged — precondition: dev Postgres | C |
| AC4 | Today buckets render correctly (L001 overdue, L002 due, L003 replied, L004/L005 cold) | Agent-Probe | magic-link login as john.sabuga@veent.io → inspect Today urgency buckets | C |
| AC5, AC6 | Pipeline shows all 6 stages; unassigned badge=3, review badge=2 | Agent-Probe | login → inspect Pipeline columns + sidebar nav badges | C |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to a named later step (here: run at EXECUTE/EVL when dev Postgres is reachable; recorded as environmental known-gap if no DB); D — backlog test-building stub.

C-4 reconciliation: the strategy column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy here — it appears only as the named residual below.

Legacy line form (retained for existing consumers):
- seed enum/column correctness: hybrid: `bun run db:seed` (precondition: dev Postgres) — NOT covered by `bun run check` (scripts/ outside svelte-check)
- idempotency/reset/prod-guard: hybrid: `bun run db:seed` x2 / `--reset` / `NODE_ENV=production ...` (precondition: dev Postgres)
- surface rendering (Today/Pipeline/badges): agent-probe: magic-link login + visual bucket/stage/badge check
- fully-automated compile gate for scripts/seed.ts: known-gap: documented — scripts/ is outside the svelte-kit tsconfig include

Dimension findings:
- Infra fit: PASS — standalone postgres-js client matches the existing scripts/seed.ts pattern; DATABASE_URL default correct; no container/worker/runtime surface touched.
- Test coverage: CONCERN — the only would-be automated gate (`bun run check`) does NOT typecheck scripts/seed.ts (confirmed: .svelte-kit/tsconfig.json include covers src/ + tests/ + config files, not scripts/). Enum/column correctness is therefore a Hybrid (DB-run) proof, not compile-time. Live-DB and Agent-Probe gates are environment-deferred. No high-risk class, so no hybrid-minimum is forced.
- Breaking changes: PASS — no schema/API/auth/contract change; preserves the existing 10-user seed; adds rows + a `db:seed` npm alias only.
- Security surface: PASS — not a high-risk class. `--reset` is bounded to the fixed seed-ID set; prod guard exits 1 without `--force`; no auth/billing/secret/migration surface. (Note: the script reads `process.env` directly rather than SvelteKit `$env` — acceptable and consistent with the existing standalone seed.)
- Section — schema reconciliation + roster: PASS — every roster enum value verified against live src/lib/server/db/schema.ts (category 20 members, platform, stage, source, channel, outcome all match the plan's reconciliation table).
- Section — lead roster / nav counts: CONCERN (resolved in plan) — L022/L023 with a null owner would make `getNavCounts.unassigned` count 5, not 3, breaking AC6. Fixed in this plan by pinning ELAY as owner for both.
- Section — CLI idempotency/reset/guard: PASS — `onConflictDoNothing(id)` (users/leads/history) + `onConflictDoUpdate(id)` (activities) is sound; no dedupe-index collision on re-seed because the only multi-activity leads (L024/L025) use distinct channels per row.
- Section — doc + loop-log appends: PASS — all target paths exist (.jsrl/loop/docs/, LOG.md, domains/crm-build/README.md).

Open gaps:
- No fully-automated compile gate covers scripts/seed.ts: known-gap: documented — to close, add tsconfig.scripts.json + a `check:scripts` npm script (`tsc --noEmit`); deferred (gap-resolution D).
- Live-Postgres gates (AC1, AC2, AC3, AC7, AC8) are not runnable in this validate session (no DB) — run at EXECUTE/EVL when a dev Postgres is reachable; record as environmental known-gap if no DB is available.
- Agent-Probe surface checks (AC4, AC5, AC6) require magic-link login — manual verification, not automatable now.
- The plan's "dedup pair" intent (L022/L023) has no rendering surface — no dedup route exists in src/routes/; the data is inert. Not an AC; minor.

What this coverage does NOT prove:
- `bun run check`: proves only that src/ + tests/ still typecheck — it proves NOTHING about scripts/seed.ts (the file is outside the typecheck scope).
- Hybrid DB run: proves nothing until a dev Postgres is reachable; does not prove production behavior, concurrent re-seed safety, or migration state.
- Agent-Probe: proves subjective bucket/stage/badge correctness only; does not prove DB-level row correctness independent of the rendering layer.

Accepted by: session (autonomous execution per orchestrator instruction). Accepted concerns by name: (1) test-coverage — no fully-automated gate covers scripts/seed.ts; enum/column proof is Hybrid (DB run); (2) live-Postgres gates AC1/AC2/AC3/AC7/AC8 deferred to EXECUTE/EVL (environmental); (3) Agent-Probe surface checks AC4/AC5/AC6 are manual. Resolved in plan (not carried as accepted gap): L022/L023 owner pinned to ELAY so AC6 (unassigned=3) holds.

Gate: CONDITIONAL (concerns noted and accepted in session; the roster/owner concern is fixed in the plan)

## Autonomous Goal Block

SESSION GOAL: Dev seed — rewrite scripts/seed.ts to seed 25 leads + ~17 activities + 3 history rows across all CRM states; add the db:seed alias + a seed how-to doc.
Charter + umbrella plan: N/A — single plan
Autonomy: standard RIPER-5; EXECUTE requires explicit ENTER EXECUTE MODE. Fully reversible (`--reset` bounded to the fixed seed-ID set).
Hard stop conditions / safety constraints:
- Never run the seed against production (NODE_ENV=production) without `--force`; the prod guard MUST exit 1 and write nothing.
- `--reset` must delete ONLY the fixed seed-ID set in FK order (history -> activities -> leads) — never a bare delete(table) / truncate.
- Write mapped enum values only (Facebook / Instagram / Twitter/X / TikTok) — never raw research shorthand (IG / FB / Twitter).
- L022/L023 must have a non-null owner (ELAY) — a null owner breaks the unassigned badge count (AC6).
Next phase: EXECUTE — process/general-plans/active/dev-seed_29-06-26/dev-seed_PLAN_29-06-26.md
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL)
Execute start: edit scripts/seed.ts (checklist 1-10) -> package.json db:seed alias (11) -> .jsrl/loop docs (12-14). Gates: Hybrid `bun run db:seed` x2 + `--reset` + prod-guard (need dev Postgres); Agent-Probe magic-link login surface check (AC4-AC6). Fully-automated: none (scripts/ outside svelte-check). high-risk pack: no.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/dev-seed_29-06-26/dev-seed_PLAN_29-06-26.md`
2. **Last completed step:** PLAN written. No EXECUTE work started.
3. **Validate-contract status:** pending (not written).
4. **Context files loaded:** `process/context/all-context.md` (router), `src/lib/server/db/schema.ts` (enums + all 4 tables, exact columns), `scripts/seed.ts` (current 10-user seed), `package.json` (scripts block). Research findings supplied by orchestrator (roster, urgency logic from `src/lib/server/dates.ts`).
5. **Next step for a fresh agent:** Run VALIDATE on this plan, then **ENTER EXECUTE MODE** for the 14-step checklist. Start with `scripts/seed.ts` (steps 1–10), then `package.json` (step 11), then the doc + loop-log appends (steps 12–14). Honor the Schema Reconciliation table — do NOT write raw research shorthand for `platform`. Verify with `bun run check` then `bun run db:seed` against dev Postgres.
