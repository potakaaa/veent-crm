---
name: plan:outreach-templates-slash-tokens
description: "Add slash-prefixed placeholder syntax (/orgname, /event, /rep, /repfirst, /replast) to fillTemplate, permanently backward-compatible with {{token}} syntax"
date: 10-07-26
feature: outreach-templates
---

# Slash-Token Placeholder Syntax for Outreach Templates — SIMPLE Plan

**Date**: 10-07-26
**Status**: ACTIVE — pending VALIDATE
**Complexity**: SIMPLE

**TL;DR:** Add 5 new slash-prefixed placeholders (`/orgname`, `/event`, `/rep`, `/repfirst`, `/replast`) to `fillTemplate`, running alongside the existing `{{token}}` calls (permanent dual support — no data migration). Update UI copy + seed bodies to the new syntax, add parallel vitest cases (old cases stay). One critical ordering constraint: `/rep` is a substring prefix of `/repfirst` and `/replast`, so it must be replaced LAST.

---

## Phase Completion Rules

This is a SIMPLE single-phase plan. It is complete only when ALL of:

- All 10 checklist items done (or verify-only items confirmed unchanged).
- All Fully-Automated Verification Evidence gates green: `bun run test:unit:ci`, `bun run check`, `bun run seed-templates --dry-run`.
- Every existing `{{}}` test case in `templates.spec.ts` still passes unchanged (backward-compat proof).
- AC8 (LogTouchForm end-to-end) is a Known-Gap → recorded as a backlog stub, its gate stays CONDITIONAL. Code-only completion is `CODE DONE`, not `VERIFIED`, until the Known-Gap is on record.

---

## Overview

Templates stored in `crm_message_templates.body` are free-text with zero syntax validation. Users type `{{organizerName}}`-style tokens today. This plan adds a shorter, friendlier slash syntax while keeping every existing `{{token}}` working forever (no migration is verifiable in this env, and templates are user data). Pure application-code change: fill logic + UI copy + seed script + tests. No schema, no migration, no new Zod validation.

## Goals

1. `fillTemplate` fills all 5 new `/token`s correctly.
2. `fillTemplate` still fills all 5 old `{{token}}`s correctly (permanent regression guarantee).
3. Mixed-syntax bodies (old + new token in one body) fill both.
4. Unknown/unmatched tokens (neither syntax) pass through unchanged (existing behavior preserved).
5. UI copy and seed bodies showcase the new syntax; old syntax stays valid.

## Scope

**In scope:** `fillTemplate` logic, template-modal UI copy, seed-script bodies, unit tests.

**Out of scope (do NOT implement):**
- Any live-DB body-rewrite migration script. May be proposed as a backlog NOTE only (see Test Infra Improvement Notes), never written or run here.
- Any `crm_message_templates` schema change or Drizzle migration.
- Any Zod validation of placeholder syntax (none exists; none added).
- Removing `{{token}}` support. Dual support is PERMANENT — no ticket/plan schedules its removal.
- **Word-boundary / regex-based slash-token matching to close the undelimited-substring collision (see Public Contracts + Test Infra Improvement Notes). This is an accepted residual of the locked slash-syntax design — do NOT add regex/word-boundary matching in EXECUTE. Revisit only if real substring collisions are reported in production.**

---

## Token Mapping (authoritative — execute-agent reads this table)

| New slash token | Old brace token | `TemplateVars` key |
|---|---|---|
| `/orgname` | `{{organizerName}}` | `organizerName` |
| `/event` | `{{eventName}}` | `eventName` |
| `/rep` | `{{repName}}` | `repName` |
| `/repfirst` | `{{repFirstName}}` | `repFirstName` |
| `/replast` | `{{repLastName}}` | `repLastName` |

---

## Touchpoints

| File | Change |
|---|---|
| `src/lib/data/templates.ts` (`fillTemplate`, lines 24–31) | Add 5 new `.replaceAll('/token', value)` calls; keep the 5 existing `{{}}` calls. `TemplateVars` type (16–22) unchanged. |
| `src/routes/templates/+page.svelte` (line 523 subtitle, line 547 textarea placeholder) | Update copy to show new `/token` syntax; note old `{{...}}` still works. |
| `scripts/seed-templates.ts` (`LEGACY_ENTRIES`, lines 37–74) | Rewrite the 9 seed bodies from `{{organizerName}}`/`{{eventName}}` to `/orgname`/`/event`. |
| `src/tests/templates.spec.ts` (7 cases) | ADD parallel `/token` cases + a mixed-syntax case; keep all 7 existing `{{}}` cases unchanged. |
| `src/lib/components/leads/LogTouchForm.svelte` (`fill()`, lines 59–68) | **VERIFY ONLY** — consumes `fillTemplate` unchanged; no edit expected. |
| `src/tests/seed-templates.spec.ts` | **UPDATE** — add a positive assertion that seed bodies contain the new `/orgname` and `/event` syntax and contain NO `{{organizerName}}`/`{{eventName}}` (see Implementation Checklist item 6). `rewriteTokens` (`{{page}}`→`{{organizerName}}`) is untouched. |
| `src/tests/schemas.spec.ts` (line ~475) | **VERIFY ONLY** — incidental `{{organizerName}}` fixture; schema doesn't validate placeholder syntax, so unaffected. Confirm no assertion breaks. |

## Public Contracts

- `fillTemplate(body: string, vars: TemplateVars): string` — signature UNCHANGED. Behavior is **backward-compatible for all `{{}}`-token and slash-free bodies**: every body containing only brace tokens and/or text with none of the slash-token substrings produces the exact same output as before, plus new `/token`s now resolve.
  - **NOT a strict superset — known residual (do not overstate):** slash tokens are undelimited bare substrings, so `fillTemplate` now rewrites `/orgname`, `/event`, `/rep`, `/repfirst`, `/replast` **wherever they appear as incidental substrings**, not only as intended placeholders. Concrete breakage cases: a body containing a URL like `.../events` (contains `/event`) or `.../reports` (contains `/rep`) will be rewritten; and because the 10 `.replaceAll` calls chain sequentially, a VALUE inserted by an earlier replace (e.g. an organizer name containing `/event`) can itself be mangled by a later replace. This is an accepted, unavoidable consequence of the locked slash-syntax choice — see the cross-linked residual note in **Test Infra Improvement Notes**. The syntax choice is NOT being reverted; the plan is only honest about the residual.
- `TemplateVars` type — UNCHANGED (same 5 keys).
- No API route, no DB schema, no exported-symbol changes.

## Blast Radius

- **Files changed:** 5 (`templates.ts`, `+page.svelte`, `seed-templates.ts`, `templates.spec.ts`, `seed-templates.spec.ts`). 2 verify-only (`LogTouchForm.svelte`, `schemas.spec.ts`).
- **Packages:** 1 (the SvelteKit app).
- **Risk class:** LOW. String-substitution extension (backward-compatible for `{{}}`/slash-free bodies; undelimited-substring residual documented in Public Contracts). No auth/billing/schema/migration/API surface. No new dependency.

---

## Implementation Detail — `fillTemplate` (execute-agent: implement exactly)

Keep the existing chained-`.replaceAll()` style (matches the file). Append 5 new calls after the 5 existing ones. **Ordering constraint (critical):** `/rep` is a substring prefix of `/repfirst` and `/replast`. If `/rep` is replaced before them, `/repfirst` becomes `<repName>first`. Therefore replace `/repfirst` and `/replast` BEFORE `/rep`.

The `{{}}` tokens have no collision (braces delimit them), so their order is free and they stay as-is. Only the slash group has the ordering rule.

> Scope guard (do NOT act on this in EXECUTE): the undelimited-substring collision described in Public Contracts is an accepted residual of the locked slash syntax. Do not consider adding word-boundary/regex-based matching to close it — out of scope for this change, revisit only if real collisions are reported.

Required resulting function shape (10 chained calls, `/rep` LAST within the slash group):

```
export function fillTemplate(body: string, vars: TemplateVars): string {
	return body
		// Legacy brace tokens (unchanged — permanent backward compatibility)
		.replaceAll('{{organizerName}}', vars.organizerName)
		.replaceAll('{{eventName}}', vars.eventName)
		.replaceAll('{{repName}}', vars.repName)
		.replaceAll('{{repFirstName}}', vars.repFirstName)
		.replaceAll('{{repLastName}}', vars.repLastName)
		// New slash tokens. ORDER MATTERS: /repfirst & /replast MUST precede /rep
		// (/rep is a substring prefix of both — replacing it first would corrupt them).
		.replaceAll('/orgname', vars.organizerName)
		.replaceAll('/event', vars.eventName)
		.replaceAll('/repfirst', vars.repFirstName)
		.replaceAll('/replast', vars.repLastName)
		.replaceAll('/rep', vars.repName);
}
```

Also update the JSDoc block (lines 10–15) to mention both syntaxes are supported.

> Note for future maintainers: any NEW slash token that shares a prefix with an existing one must be ordered longest-first. With today's fixed 5-key set, only `/rep` vs `/repfirst`/`/replast` collides. Add this as a one-line code comment (already in the block above), not a design section.

## Implementation Detail — UI copy

- **Subtitle (line 523):** Change to show the new syntax as primary, e.g. `Use /orgname, /event, /rep, /repfirst, /replast as placeholders. (Legacy {{organizerName}}-style tokens still work.)` — use good UX copy; keep the `{'{{...}}'}` escaping form Svelte requires only where literal braces are shown.
- **Textarea placeholder (line 547):** Change example to new syntax, e.g. `Hi /orgname, …`.

## Implementation Detail — seed bodies

Rewrite each of the 9 `LEGACY_ENTRIES` bodies: `{{organizerName}}` → `/orgname`, `{{eventName}}` → `/event`. Do NOT touch `rewriteTokens()` (its `{{page}}`/`{{event}}`→`{{organizerName}}`/`{{eventName}}` legacy mapping is a separate concern and stays). Known limitation to note in the plan (not a bug): `onConflictDoNothing` by title (line 144) means re-running `--load` against an already-seeded DB will NOT overwrite existing old-syntax bodies — that's fine because dual support keeps them working.

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | All 5 new `/token`s fill correctly with present values | `templates.spec.ts` new case "fills all 5 slash tokens" | Fully-Automated |
| AC2 | All 5 old `{{token}}`s still fill correctly (regression) | `templates.spec.ts` existing 7 cases unchanged + still green | Fully-Automated |
| AC3 | Mixed-syntax body (one old + one new token) fills both | `templates.spec.ts` new case "fills a mixed old+new body" | Fully-Automated |
| AC4 | `/rep` does not clobber `/repfirst` / `/replast` (ordering) | `templates.spec.ts` new case "/rep does not corrupt /repfirst or /replast" — pinned to `repName="Jane Diaz"`, `repFirstName="Jane"`, `repLastName="Diaz"` on body `"/repfirst /replast /rep"`, asserting exact output `"Jane Diaz Jane Diaz"` (distinct values + exact-string assertion so a broken ordering that clobbered `/repfirst`→`Jane Diazfirst` would fail) | Fully-Automated |
| AC5 | Unknown tokens (neither syntax) pass through unchanged | `templates.spec.ts` existing "no placeholders" case + new "unknown /slash token untouched" | Fully-Automated |
| AC6 | UI modal copy shows new syntax; old noted as still valid | manual read of `+page.svelte` 523/547 | Agent-Probe (visual copy) |
| AC7 | Seed bodies emit new `/token` syntax; script still runs dry-run | `seed-templates.spec.ts` (`buildSeedRows`) asserts bodies CONTAIN `/orgname` and `/event` and contain NO `{{organizerName}}`/`{{eventName}}` | Fully-Automated |
| AC8 | LogTouchForm still fills templates end-to-end in the UI | (Known-Gap — no component-test harness / no shared Playwright auth fixture) | Known-Gap → backlog stub, gate CONDITIONAL |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit:ci` — `templates.spec.ts` (7 existing + new slash/mixed/ordering/unknown cases) all green | Fully-Automated | AC1, AC2, AC3, AC4, AC5 |
| `bun run test:unit:ci` — `seed-templates.spec.ts` (`buildSeedRows` positive `/orgname`+`/event` assertions + no-`{{organizerName}}`/`{{eventName}}` assertions) green | Fully-Automated | AC7 |
| `bun run check` — typecheck clean across all touched files | Fully-Automated | AC1–AC7 (compile-level) |
| `bun run seed-templates --dry-run` — prints 9 rows with `/orgname`/`/event` bodies, opens NO DB connection | Fully-Automated | AC7 |
| Manual read of `+page.svelte` modal subtitle + textarea placeholder | Agent-Probe | AC6 |
| `templates-db.spec.ts` DB round-trip (self-skips — no live Postgres in this env) | Hybrid (self-skipping) | AC8 (partial — DB persistence path) |
| LogTouchForm end-to-end substitution in browser | Known-Gap | AC8 (no component-test harness, no shared auth fixture — repo-wide documented gap) |

**Failing stubs (TDD red-first, for execute-agent — new Fully-Automated cases):**

```
test("fills all 5 slash tokens", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: fills all 5 slash tokens")
})
test("fills a mixed old+new body", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: fills a mixed old+new body")
})
test("/rep does not corrupt /repfirst or /replast", () => {
  // Pinned values (collision-proof): repName="Jane Diaz", repFirstName="Jane", repLastName="Diaz"
  // body="/repfirst /replast /rep" MUST render exactly "Jane Diaz Jane Diaz"
  throw new Error("NOT IMPLEMENTED — TDD stub for: /rep does not corrupt /repfirst or /replast")
})
test("unknown /slash token is left untouched", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: unknown /slash token is left untouched")
})
```

---

## Implementation Checklist

1. `src/lib/data/templates.ts` — add 5 new `.replaceAll('/token', vars.key)` calls to `fillTemplate` AFTER the 5 existing `{{}}` calls, with `/repfirst` and `/replast` BEFORE `/rep` (see Implementation Detail). Add the one-line ordering comment. Update the JSDoc (lines 10–15) to mention both syntaxes. Do NOT add word-boundary/regex matching for the undelimited-substring residual — out of scope (see Public Contracts + Scope).
2. `src/tests/templates.spec.ts` — add 4 new cases (all 5 slash tokens; mixed old+new; `/rep` non-corruption of `/repfirst`+`/replast` — pin `repName="Jane Diaz"`, `repFirstName="Jane"`, `repLastName="Diaz"`, body `"/repfirst /replast /rep"`, assert exact output `"Jane Diaz Jane Diaz"`; unknown `/slash` untouched). Do NOT modify or remove the 7 existing `{{}}` cases.
3. `src/routes/templates/+page.svelte` line 523 — update modal subtitle to slash syntax + "legacy still works" note.
4. `src/routes/templates/+page.svelte` line 547 — update textarea placeholder example to `Hi /orgname, …`.
5. `scripts/seed-templates.ts` — rewrite the 9 `LEGACY_ENTRIES` bodies: `{{organizerName}}`→`/orgname`, `{{eventName}}`→`/event`. Do NOT touch `rewriteTokens`.
6. `src/tests/seed-templates.spec.ts` — ADD a positive assertion inside the `buildSeedRows` describe block that the emitted seed bodies use the new syntax. The current suite only asserts ABSENCE of `{{page}}`/`{{event}}` (legacy tokens) — it does NOT assert the new `/orgname`/`/event` syntax is present. Add a case asserting: (a) at least one seed body CONTAINS `/orgname`, (b) at least one seed body CONTAINS `/event`, and (c) NO seed body contains `{{organizerName}}` or `{{eventName}}`. This makes AC7 a real positive proof of the seed-body rewrite, not just absence-of-legacy. (The existing `{{page}}`/`{{event}}` absence assertions stay.)
7. `src/lib/components/leads/LogTouchForm.svelte` — VERIFY no change needed (it passes `TemplateVars` to `fillTemplate` unchanged). Do not edit.
8. `src/tests/schemas.spec.ts` line ~475 — VERIFY the incidental `{{organizerName}}` fixture still passes (schema doesn't validate placeholder syntax). Do not edit unless red.
9. Run gates: `bun run test:unit:ci` (all green), `bun run check` (clean), `bun run seed-templates --dry-run` (new-syntax bodies, no DB).
10. If DB round-trip / component / e2e coverage remains a gap, record as Known-Gap backlog stubs (see Test Infra Improvement Notes) and keep AC8 gate CONDITIONAL — do not mark AC8 PASS.

---

## Test Infra Improvement Notes

- **Undelimited-substring + chained-substitution collision (accepted residual of the slash-token design)** — Known-Gap / accepted risk. Because slash tokens are bare substrings with no closing delimiter (unlike `{{ }}`), `fillTemplate` now rewrites any body or inserted value that *contains* the substrings `/orgname`, `/event`, `/rep`, `/repfirst`, or `/replast` — e.g. a URL `.../events` (matches `/event`), `.../reports` (matches `/rep`), or an organizer name value containing `/event` that a later `.replaceAll` then re-mangles (chained substitution). This is an unavoidable consequence of the locked slash-syntax choice (do NOT revert the syntax; do NOT add regex/word-boundary matching in EXECUTE — see Scope + Public Contracts cross-link). It cannot be verified against real user-authored custom template rows in this env (no live Postgres). Accepted risk; revisit only if real substring collisions are reported in production. Cross-linked from **Public Contracts** (`fillTemplate` residual) and **Scope** (out-of-scope regex guard).
- **AC8 (LogTouchForm end-to-end substitution)** — Known-Gap: no Svelte component-test harness and no shared Playwright auth fixture (repo-wide documented gaps — see `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md` and `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Execute-agent: write/confirm a backlog stub noting this behavior remains unproven; keep the AC8 gate CONDITIONAL, do not declare it PASS on Known-Gap alone.
- **`templates-db.spec.ts` DB round-trip** — Hybrid, self-skips (no live Postgres in this env). Consistent with the existing repo-wide live-DB CI harness gap. Not a blocker for this plan.
- **Optional follow-up (out of scope here):** a live-DB body-rewrite migration to convert existing stored `{{token}}` rows to `/token` could be proposed as a backlog NOTE (`slash-token-body-migration_NOTE_10-07-26.md`). Not implemented or run in this plan; dual support makes it non-urgent.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/outreach-templates/active/outreach-templates-slash-tokens_10-07-26/outreach-templates-slash-tokens_PLAN_10-07-26.md`
2. **Last completed step:** PLAN written + PVL-supplement applied (4 gaps addressed 10-07-26). Line numbers verified against working tree 10-07-26.
3. **Validate-contract status:** pending (vc-validate-agent writes `## Validate Contract` before EXECUTE).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md` (runner conventions), `process/context/planning/all-planning.md`. Source files read: `templates.ts`, `seed-templates.ts`, `templates.spec.ts`, `seed-templates.spec.ts`, `+page.svelte` (515–558), `LogTouchForm.svelte` (10–79).
5. **Next step for a fresh agent:** Run VALIDATE, then EXECUTE the 10-item checklist in order. The token mapping table, the `fillTemplate` ordering rule (`/rep` LAST), and the accepted undelimited-substring residual (Public Contracts + Test Infra Improvement Notes) are the only non-obvious details — all fully specified above. Test runner is `vitest` via `bun run test:unit:ci`; typecheck via `bun run check`.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-07-26
date: 2026-07-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — 5 files in blast radius). LOW threshold → one vc-execute-agent (opus) applies the 10-item checklist in order.

Re-validation note: This is PVL cycle 1 (re-validation after a plan-supplement cycle). The prior pass was CONDITIONAL with 0 FAIL / 2 CONCERNs. Both CONCERNs are now RESOLVED (verified by hand — see Dimension findings). The only remaining item is the pre-existing, pre-accepted AC8 Known-Gap, which is why the gate is CONDITIONAL rather than PASS — consistent with the plan's own Phase Completion Rules.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | All 5 new `/token`s fill correctly | Fully-Automated | `bun run test:unit:ci` — templates.spec.ts "fills all 5 slash tokens" | A |
| AC2 | All 5 old `{{token}}`s still fill (regression) | Fully-Automated | `bun run test:unit:ci` — templates.spec.ts 7 existing cases unchanged + green | A |
| AC3 | Mixed old+new body fills both | Fully-Automated | `bun run test:unit:ci` — templates.spec.ts "fills a mixed old+new body" | A |
| AC4 | `/rep` does not clobber `/repfirst`/`/replast` (ordering) | Fully-Automated | `bun run test:unit:ci` — templates.spec.ts "/rep does not corrupt /repfirst or /replast" (pinned Jane Diaz / Jane / Diaz → exact "Jane Diaz Jane Diaz") | A |
| AC5 | Unknown tokens pass through unchanged | Fully-Automated | `bun run test:unit:ci` — templates.spec.ts unknown-slash + existing no-placeholder cases | A |
| AC6 | UI modal copy shows new syntax; old noted valid | Agent-Probe | manual read of `+page.svelte` lines 523 (subtitle) + 547 (placeholder) | A |
| AC7 | Seed bodies emit `/token` + no legacy `{{organizerName}}`/`{{eventName}}` | Fully-Automated | `bun run test:unit:ci` — seed-templates.spec.ts `buildSeedRows` positive `/orgname`+`/event` assertions + no-legacy assertions; `bun run seed-templates --dry-run` | B |
| AC8 | LogTouchForm fills templates end-to-end in the UI | Agent-Probe → not provable here (Known-Gap) | — (no component-test harness, no shared Playwright auth fixture) | D |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist (item 6); C — deferred to named later phase; D — backlog test-building stub (named residual, keep-active).

Failing stubs (Fully-Automated rows only — TDD red-first, for execute-agent):

AC1:
```
test("fills all 5 slash tokens", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: fills all 5 slash tokens")
})
```
AC3:
```
test("fills a mixed old+new body", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: fills a mixed old+new body")
})
```
AC4:
```
test("/rep does not corrupt /repfirst or /replast", () => {
  // Pinned (collision-proof): repName="Jane Diaz", repFirstName="Jane", repLastName="Diaz"
  // body="/repfirst /replast /rep" MUST render exactly "Jane Diaz Jane Diaz"
  throw new Error("NOT IMPLEMENTED — TDD stub for: /rep does not corrupt /repfirst or /replast")
})
```
AC5:
```
test("unknown /slash token is left untouched", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: unknown /slash token is left untouched")
})
```
AC7:
```
test("seed bodies emit new /orgname and /event syntax and no legacy {{organizerName}}/{{eventName}}", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: seed bodies emit new-syntax tokens")
})
```
(Hybrid / Agent-Probe / Known-Gap rows — AC6, AC8 — do NOT receive stubs.)

Dimension findings:
- Infra fit: PASS — All commands are real and match `all-tests.md` (uses `bun run test:unit:ci`, NOT `bun test`). Single SvelteKit package, no container/port/runtime surface. All 6 referenced files resolve on disk with line numbers matching the plan (templates.ts 24–31, seed-templates.ts, templates.spec.ts, seed-templates.spec.ts, +page.svelte 523/547, LogTouchForm.svelte 59–68).
- Test coverage: PASS — AC1–AC5, AC7 Fully-Automated with exact commands + failing stubs. AC4 hand-verified collision-proof: correct ordering yields "Jane Diaz Jane Diaz"; wrong ordering (`/rep` first) yields "Jane Diazfirst Jane Diazlast Jane Diaz" — a visibly distinct string, so the exact-string assertion genuinely fails on broken ordering. Item 6 makes AC7 a real positive proof (verified rewriteTokens only maps `{{page}}`/`{{event}}`, so after item 5 the seed bodies contain `/orgname`/`/event` and no `{{organizerName}}`/`{{eventName}}` — assertions (a)(b)(c) all hold). AC8 is the only Known-Gap.
- Breaking changes: PASS — Prior FALSE "strict superset" claim is RESOLVED. Public Contracts now precisely scopes backward compatibility ("backward-compatible for all `{{}}`-token and slash-free bodies") and honestly names the undelimited-substring residual with correct concrete cases (URL `.../events` contains `/event`; `.../reports` contains `/rep`; chained substitution of an inserted value). `fillTemplate` signature + `TemplateVars` unchanged; no API/schema/route change; `{{}}` support permanent.
- Security surface: PASS — No auth/billing/data/secrets/trust-boundary. Plain string substitution over user-authored template text rendered in a message composer; the undelimited-substring quirk is a correctness residual, not an injection/trust-boundary issue. No STRIDE/OWASP finding.
- Section A (fillTemplate feasibility): PASS — Edit target (10 chained `.replaceAll`) mechanically feasible; ordering rule (`/rep` LAST within slash group) is correct and enforced by AC4. Highest-risk edit: the ordering; mitigated by the collision-proof test + inline comment. Scope guard against regex/word-boundary redesign present in 4 places (Scope, Public Contracts, Impl Detail, Checklist item 1).
- Section B (seed feasibility): PASS — Verified the `rewriteTokens` interaction; item 5/6 instructions are internally consistent (no re-introduction of `{{organizerName}}`/`{{eventName}}`). Existing "no `{{page}}`/`{{event}}`" test stays green.
- Section C (UI copy feasibility): PASS — Lines 523/547 confirmed; Svelte `{'{{...}}'}` brace-escaping guidance matches existing code.
- Section D (templates.spec feasibility): PASS — 7 existing cases confirmed present and unchanged by the plan; 4 new cases well-specified.

Supplement-integrity check (no new concerns introduced): PASS — Edits confined to the 4 named sections + their necessary cross-references (Scope, Impl Detail, Touchpoints, AC7, Verification Evidence, failing stubs). No scope creep, no new file paths outside the 5-changed/2-verify-only blast radius, no new dependencies.

Open gaps:
- AC8 (LogTouchForm end-to-end substitution): known-gap — no Svelte component-test harness and no shared Playwright auth fixture (repo-wide documented gaps: `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`, `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Execute-agent must write/confirm a backlog stub and keep AC8 CONDITIONAL — do not mark PASS on Known-Gap alone. The underlying new logic (fillTemplate slash tokens) IS fully-automated-proven, so this is a named residual, not a vacuous green.
- Undelimited-substring + chained-substitution collision: accepted residual of the locked slash-syntax design (documented in Public Contracts + Test Infra Improvement Notes). Do NOT add regex/word-boundary matching in EXECUTE. Revisit only if real substring collisions are reported in production.
- Optional live-DB body-rewrite migration (existing `{{token}}` rows → `/token`): out of scope; may be proposed as a backlog NOTE only. Dual support makes it non-urgent.

What this coverage does NOT prove:
- `bun run test:unit:ci` (templates.spec.ts): proves the pure `fillTemplate` substitution + ordering at the unit level. Does NOT prove the LogTouchForm composer renders the filled text in a real browser (AC8 known-gap), nor behavior against real user-authored template rows stored in a live DB (no live Postgres in this env).
- `bun run test:unit:ci` (seed-templates.spec.ts) + `bun run seed-templates --dry-run`: proves the pure `buildSeedRows` mapping emits new-syntax bodies with no legacy tokens. Does NOT prove a live `--load` insert (idempotent-by-title path, `onConflictDoNothing`) against a real DB, nor that already-seeded old-syntax rows get rewritten (they intentionally do not — dual support covers them).
- `bun run check`: proves type-level correctness across touched files. Does NOT prove runtime substitution correctness (covered by the unit tests above).
- Manual read of `+page.svelte` (AC6): proves the copy strings show new syntax. Does NOT prove the modal renders correctly in a browser.

Gate: CONDITIONAL (0 FAIL, 0 unresolved CONCERN; both prior CONCERNs resolved; single pre-accepted AC8 Known-Gap keeps the gate CONDITIONAL per the plan's Phase Completion Rules) — proceed to EXECUTE with AC8 on record.
Accepted by: session (PVL cycle 1 re-validation) — AC8 (LogTouchForm end-to-end substitution) pre-accepted as a documented Known-Gap per the plan's own Phase Completion Rules (line 25), AC8 row (line 148), Checklist item 10 (line 196), and Test Infra Improvement Notes (line 203). Execute-agent must record the AC8 backlog stub; completion status stays CODE DONE (not VERIFIED) until that stub is on record.

---

## Autonomous Goal Block

```
SESSION GOAL: Add slash-prefixed placeholder syntax (/orgname, /event, /rep, /repfirst, /replast) to fillTemplate, permanently backward-compatible with the existing {{token}} syntax.
Charter + umbrella plan: N/A — single SIMPLE plan
Autonomy: Standard RIPER-5. VALIDATE gate CONDITIONAL (AC8 pre-accepted Known-Gap). One vc-execute-agent (opus) applies the 10-item Implementation Checklist in order; EVL confirmation run (vc-tester) required after EXECUTE.
Hard stop conditions / safety constraints:
- Do NOT remove or schedule removal of {{token}} support — dual support is PERMANENT.
- Do NOT add word-boundary/regex-based slash-token matching to close the undelimited-substring residual — accepted residual, out of scope for EXECUTE.
- Do NOT modify the 7 existing {{}} test cases in templates.spec.ts (backward-compat proof).
- Do NOT touch rewriteTokens() in seed-templates.ts, or any schema/migration/API surface.
- fillTemplate slash group ordering: /repfirst and /replast MUST be replaced BEFORE /rep.
Next phase: EXECUTE — process/features/outreach-templates/active/outreach-templates-slash-tokens_10-07-26/outreach-templates-slash-tokens_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate CONDITIONAL)
Execute start: Fully-Automated gates — `bun run test:unit:ci` | `bun run check` | `bun run seed-templates --dry-run`. Agent-Probe: manual read of +page.svelte 523/547. Known-Gap: AC8 (backlog stub). High-risk pack: no.
```
