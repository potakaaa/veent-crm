---
phase: lead-appeal-score
date: 2026-07-01
status: COMPLETE
feature: leads
plan: process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md
---

# Lead Appeal Score — EXECUTE Report

**TL;DR:** All 17 touchpoints implemented exactly per plan. Fully-Automated gates green (`bun run check` 0 errors; `bun run test:unit -- --run` 10/10 pass incl. 6 new formula cases; `bun run db:generate` produced one additive-nullable migration). Both Agent-Probe gates (badge on 5 views incl. null state + `?sort=appeal` null-bottom ordering) verified at the data layer. No deviations. Code state: `CODE DONE` (promote to VERIFIED after user confirms in the running app).

## What Was Done

- **Schema (T1-2):** added `announcedAt: date('announced_at')` + `firstReachedOutAt: timestamp('first_reached_out_at', {withTimezone:true})` (both nullable) to `crmLeads`. Generated `drizzle/0001_rainy_patriot.sql` — exactly 2 `ADD COLUMN` (`date`, `timestamp with time zone`), no NOT NULL, no default, no Better Auth tables.
- **Scoring (T3):** `src/lib/appeal-score.ts` — pure `computeAppealScore` + `diffDays`, `clamp`, `appealTier`. Primitive args, no `db` import. Returns `null` when eventDate/announcedAt missing; uses delay-so-far when firstReachedOutAt missing.
- **Tests (T4):** `src/tests/appeal-score.spec.ts` — 6 cases (both-max→100, near-event→low, long-delay→low, missing→null, no-reachout→delay-so-far=80, boundaries 30d/60d/past). Green.
- **Mock data (T5):** extended `MockLead` + all 9 rows with `eventDate`/`announcedAt`/`firstReachedOutAt`, including l-7 (announcedAt null), l-8 (both null), l-6/l-9 (firstReachedOutAt null → delay-so-far), near-event + long-delay rows.
- **Badge (T6):** `AppealScoreBadge.svelte` — numeric score with green/amber/red tier colors + gray "Not enough data" null state. Runes only.
- **SortToggle (T7):** `SortToggle.svelte` — Default/Appeal toggle preserving other query params via `$app/state`.
- **Wiring (T8-17):** badge in all 5 views (leads list, lead detail card header, unassigned, pipeline card, review); SortToggle in leads/unassigned/pipeline only. `?sort=appeal` (score desc, null bottom) in leads/unassigned/pipeline loads (pipeline sorts within each column); review + detail loads supply `appealScore` display-only. Defaults preserved (leads: `lastActivityAt` desc).

## What Was Skipped or Deferred

- New Playwright e2e specs — out of scope per accepted plan (no e2e specs exist in repo). Backlog stub remains (gap-resolution D). Badge/sort proven via Agent-Probe.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Scoring formula | `bun run test:unit -- --run src/tests/appeal-score.spec.ts` | PASS (6/6) |
| Full unit suite | `bun run test:unit -- --run` | PASS (10/10, 2 files) |
| Typecheck | `bun run check` | PASS (0 errors, 0 warnings) |
| Migration additivity | `bun run db:generate` → `drizzle/0001_rainy_patriot.sql` | PASS (2 additive-nullable ADD COLUMN only) |
| Badge on 5 views + null state | Agent-Probe (data layer) | PASS — tiers high/mid/low/none all exercised; l-7 & l-8 → "Not enough data" |
| `?sort=appeal` null-bottom order | Agent-Probe (data layer) | PASS — desc order, 2 null leads at bottom |

## Plan Deviations

None. Operational note (not a code change): `bun run db:generate` needed a placeholder `DATABASE_URL` because `drizzle.config.ts` throws when the var is unset (generate does not open a connection). Added an "Appeal" column header to the leads table to host the badge cell — within blast radius.

## Test Infra Gaps Found

- No Playwright e2e specs — badge/sort remain Agent-Probe. Backlog: add `e2e/appeal-score.spec.ts` to promote to Fully-Automated (carried from plan, unchanged).

## Closeout Packet

- **Selected plan:** `process/general-plans/completed/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md`
- **Finished:** all 17 touchpoints; all Fully-Automated + Agent-Probe gates.
- **Verified vs unverified:** Fully-Automated gates independently runnable; Agent-Probe verified at data layer. Not yet visually confirmed in a running browser by the user.
- **Cleanup remaining:** user visual confirmation of badge/sort in-app; then UPDATE PROCESS archival.
- **Best next state:** Keep in active/testing until user confirms in running app; then `ENTER UPDATE PROCESS MODE`.

## Forward Preview

- **Test Infra Found:** vitest 4 works with `--run`; no e2e harness — Playwright configured, zero specs.
- **Blast Radius Changes:** `crm_leads` +2 nullable columns; new `src/lib/appeal-score.ts`, 2 new components; 5 views + 5 loads touched. `src/lib/zod/schemas.ts` and `crm_lead_history` untouched.
- **Commands to Stay Green:** `bun run check`; `bun run test:unit -- --run`.
- **Dependency Changes:** none.

---

## UPDATE PROCESS Closeout (01-07-26)

**Selected plan:** `process/general-plans/active/lead-appeal-score_01-07-26/lead-appeal-score_PLAN_01-07-26.md` → archived to `process/general-plans/completed/lead-appeal-score_01-07-26/`.

**Closeout classification:** Ready for UPDATE PROCESS archival — user visually confirmed the badge + `?sort=appeal` behavior in the running app; all Fully-Automated gates green; validate-contract present (`Gate: CONDITIONAL`, both concerns mitigated in-plan).

**SPEC achievement** (no separate locked `*_SPEC_*.md` for this SIMPLE plan — scored against the plan's own `## Acceptance Criteria` / validate-contract test-gate table):

| Criterion | Proving strategy | Result |
|---|---|---|
| AC1 — scoring formula (both-max/near-event/long-delay/missing/no-reachout/boundaries) | Fully-Automated (`appeal-score.spec.ts`, 6/6 green) | **met** |
| AC2a/AC2b — additive-nullable columns + type-check + migration shape | Fully-Automated (`bun run check`, `db:generate` inspection) | **met** |
| AC3 — badge renders on all 5 views incl. null state | Agent-Probe + human visual confirmation in running app (no automated e2e exists) | **met operationally; not yet regression-safe** — residual automated-e2e gap tracked as backlog (see below), not treated as vacuously green |
| AC4 — `?sort=appeal` ordering (null-bottom, per-column for pipeline) | Agent-Probe + human visual confirmation in running app (no automated e2e exists) | **met operationally; not yet regression-safe** — same residual as AC3 |
| AC5 — no persistence, no history rows, no Zod/form changes | Fully-Automated (`bun run check` + review) | **met** |

AC3/AC4 have no automated/E2E gate — only Agent-Probe plus a one-time human visual check. Per the archival vacuous-green rule this residual is NOT silently accepted as "done forever"; it is carried forward as an explicit backlog test-building stub rather than closed:
`process/features/leads/backlog/appeal-score-e2e-specs_NOTE_01-07-26.md`

**Cleanup done:** plan archived; `process/context/tests/all-tests.md` corrected (`test:unit` watch-mode footgun); `process/context/all-context.md` updated (repo structure, derived-value convention note, project-state exception note); backlog stub written for e2e coverage.

**Cleanup still needed:** none blocking. When a Playwright harness is stood up, fold in the appeal-score e2e spec from the backlog stub.

**Commit-checkpoint recommendation:** Execution commit (source files: schema, migration, `appeal-score.ts`, components, route loads/views, spec file) should be committed first as a feature commit; this UPDATE PROCESS pass (archived plan + context docs) should be a separate, second process-only commit. Per the calling instructions, no commit is made in this pass — both are left for a follow-up git step.

**Drift score:** MEDIUM (3 signals: 12 files touched in EXECUTE; 3+ memory-worthy observations — watch-mode footgun, missing lead-card touchpoint caught by VALIDATE, derived-value pattern; feature-folder backlog note created). `Recommend UPDATE PROCESS -- significant changes detected.` (already actioned by this session)

**Next valid state:** Feature is closed out. No further phase is queued for Lead Appeal Score. The only queued follow-up is the backlog e2e stub (low priority, best folded into the first repo-wide Playwright harness effort).
