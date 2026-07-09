---
name: plan:user-colors-persistent
description: COMPLEX plan for GitHub #275 — persistent editable per-user colors (crm_users.color) threaded through Avatar.svelte + 10 call sites, a manager-only color picker on /team, and a new pipeline per-AE color-coding feature (supersedes PIPE-4 Section B placeholder)
date: 08-07-26
feature: team
---

# GitHub #275 — Persistent Editable User Colors Across All Color-Coded Surfaces

**Date:** 08-07-26
**Status:** Validated — CONDITIONAL (validate-contract written; render-dimension known-gaps accepted)
**Complexity**: COMPLEX
**Risk class:** schema/data migration (HIGH) + API contract + authorization (HIGH)

**TL;DR:** Add a nullable `crm_users.color` (text) column (migration 0034), give `Avatar.svelte` an optional `color?` prop that falls back to the existing `avatarColor(name)` hash when null, expose a manager-only `<input type="color">` picker in the `/team` edit modal, persist it through the existing PATCH endpoint (with a manager-only auth gate), and thread the stored color through 10 render call sites — including a **new** per-AE left-accent bar on Pipeline cards that finally builds the never-shipped PIPE-4 Section B. Backward-compatible: every call site that can't cheaply obtain a color keeps working via the hash fallback. High-risk class = schema/migration + auth → 5-artifact evidence pack required at EXECUTE.

## Overview

Colors that identify a rep (AE) are currently **derived, not stored** — `avatarColor(name)` (`src/lib/design/tokens.ts:101-106`) hashes the name string into a fixed 6-color palette. There is no way for a manager to choose a rep's color, and the color is not stable if a name changes. This plan makes the color **manager-editable DB data** on `crm_users`, and threads it through every color-coded user surface, with a safe hash fallback for un-set rows.

This dissolves the PIPE-4 Section B blocker (the "Jela's palette decision" note at `process/features/pipeline/backlog/pipeline-ae-color-palette_NOTE_07-07-26.md`): color becomes free-form manager-chosen data, so no fixed palette needs approval.

## Goals

1. Persist a per-user color on `crm_users` (nullable, no backfill).
2. Make `Avatar.svelte` color-aware and backward-compatible (fallback to hash).
3. Manager-only color picker on `/team` (mirrors existing `canManage`/rename gate).
4. Thread stored color through all user color-coded surfaces (avatars everywhere + new Pipeline AE accent bar).
5. Live reflection via the existing `invalidateAll()` (cross-page = "on next load at minimum").

## Acceptance Criteria

| ID | Criterion | Data/logic proof (Fully-Automated core) | Render dimension |
|---|---|---|---|
| AC1 | Team page exposes a color picker per user, editable **manager-only** (reps cannot set color, including their own). | Endpoint manager-only gate unit test: rep-self→403, rep-other→403, manager-other→200. | Picker visibility/render — Agent-Probe / Known-Gap (no component harness / no auth fixture). |
| AC2 | Selected color is validated and saved to the DB record. | Schema hex-accept/reject/null unit + endpoint set-color 200 (`color` in `.set()`) + invalid-hex→400. | Live persistence round-trip — Hybrid (needs live Postgres). |
| AC3 | Pipeline uses the stored color for per-AE color-coding (accent bar). | `ownerColor` helper unit + pipeline query `.toSQL()` (if a select column is added). | Accent-bar render — Agent-Probe / Known-Gap. |
| AC4 | Letter avatar badges use the stored color, else the hash fallback. | `resolveAvatarColor` unit (stored / null-fallback / undefined-null branches). | Avatar render — Agent-Probe / Known-Gap. |
| AC5 | All other color-coded user surfaces (roster, leads, reassign, reports, meetings, lead-detail) reflect the stored color. | `dbUserToUser` maps `color` + per-surface query `.toSQL()` selects color. | Per-surface render — Agent-Probe / Known-Gap. |
| AC6 | Color changes take effect without reload (or on next load at minimum). | Threaded-query next-load path unit. | `invalidateAll()` presence — Agent-Probe (code inspection). |

**Vacuous-green rule (binding):** No AC is declared done on Known-Gap alone. Every AC above has ≥1 Fully-Automated proving scenario for its data/logic core; only the *render* dimension is Known-Gap, and that residual is (a) recorded in a backlog stub and (b) keeps the render-dimension gate CONDITIONAL — never a silent terminal PASS.

## Phase Completion Rules

- A phase is complete only when its inline test gate passes (`bun run check` green + the phase's named Fully-Automated test file green).
- Phase A (data layer) must complete and its migration idx confirmed before any later phase reads `row.color`.
- The final regression gate (step 18) must pass before the plan is eligible for UPDATE PROCESS.
- Render-dimension scenarios (picker visibility, avatar render, accent-bar render) do NOT block phase completion — they are logged as bounded Known-Gaps against the two standing harness gaps (no component test harness; no shared Playwright auth fixture) and keep the render gate CONDITIONAL, never terminal-PASS.
- High-risk (schema/migration + auth): the 5-artifact evidence pack (incl. `adversarial-validation.json`) must exist before the work is treated as finalize-ready.

## Scope

**In scope:** `crm_users.color` column + migration 0034; `Avatar.svelte` color prop; `resolveAvatarColor` pure helper; PATCH endpoint color field + manager-only gate; `/team` edit-modal color picker; color threading through 10 call sites incl. Pipeline AE accent bar; extend two name-only queries (`meetings/[id]`, `leads/[id]`) to also fetch color.

**Out of scope (explicit):**
- Contrast/accessibility auto-calculation — `Avatar.svelte`'s `text-white` stays as-is; managers choose legible colors (LOCKED decision 8).
- Fixed palette / color-library UI — native `<input type="color">` only (LOCKED decision 1).
- Self-service color editing by reps — manager-only (LOCKED decisions 1, 7).
- Any new realtime/websocket reactivity — rely on existing `invalidateAll()` (LOCKED decision 9).

## Locked Decisions (do not re-litigate — orchestrator judgment, this session)

1. Free-form hex via native `<input type="color">` in `/team` edit modal, manager-only.
2. Column `crm_users.color` — `text`, nullable, no default, no backfill (null → hash fallback).
3. `Avatar.svelte` gains optional `color?: string | null`; null/absent → `avatarColor(name)`.
4. Thread stored color through call sites that already hold a user object.
5. Extend name-only queries (`meetings/[id]`, `leads/[id]`) to also fetch color.
6. Build the Pipeline per-AE color-coding (supersedes never-built PIPE-4 Section B) as a **left accent bar**, additive to the existing neutral `border border-hairline` card border and distinct from the stage-color header dot (`col.color`).
7. Manager-only color editing — mirror the rename auth gate in the PATCH endpoint.
8. Contrast/accessibility explicitly out of scope.
9. Live update via existing `invalidateAll()` in the team PATCH success handler — no new reactivity.

## Touchpoints

Grounded against current source (line numbers **re-verified 09-07-26 post-#277 merge**; where drift was found the corrected anchor is shown, and EXECUTE must still re-locate by content):

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/server/db/schema.ts` (crmUsers block **L75-101**, was L77-90) | Add `color: text('color')` column (nullable). |
| 2 | `drizzle/0034_*.sql` + `drizzle/meta/_journal.json` | Generated migration adding `crm_users.color` (idx 34 — journal confirmed last idx = 33). |
| 3 | `src/lib/design/tokens.ts` (**L99-106**, fn at 101-106) | Add pure `resolveAvatarColor(stored, name)` = `stored ?? avatarColor(name)`. `avatarColor` unchanged. |
| 4 | `src/lib/components/shared/Avatar.svelte` (props L5, `hex` L15) | Add optional `color?: string \| null` prop; `hex = resolveAvatarColor(color, name)`. |
| 5 | `src/lib/types/index.ts` (User, **L36-47**, was L36-44) | Add `color?: string \| null`. |
| 6 | `src/lib/server/db/leads.ts` (`dbUserToUser` L144-154) | Map `color: row.color ?? null`. |
| 7 | `src/lib/zod/schemas.ts` (userFormSchema L240-247; userNameEditSchema L250) | Add `color` (hex regex `^#[0-9a-fA-F]{6}$`, optional/nullable) to `userFormSchema`; extend the name-edit pick (or add `userColorEditSchema`) to include color. Reuse the existing category hex pattern convention. |
| 8 | `src/routes/api/users/[id]/+server.ts` (patchSchema L11-16; self-branch L28-33; other-branch L34-49; `.set()` L53-58 — **all anchors byte-accurate**) | Add `color` to schema; manager-only gate (see Public Contracts); thread into `.set()`. |
| 9 | `src/routes/team/+page.svelte` (edit modal L658-687; success handler ~L242; roster Avatar L412) | Add `editColor` state + `<input type="color">` field; thread into `saveEditName` PATCH body; retitle modal ("Edit member"). Pass `color` to roster Avatar. |
| 10 | `src/lib/components/pipeline/PipelineBoard.svelte` (card div **L126-130**; Avatar L170) | Add `ownerColor(ownerId)` helper (lookup `users[]` color, fallback `avatarColor(name)`); render left-accent bar as a **distinct element** (see Phase D step 12 — NOT inline `border-left`); pass `color` to Avatar. |
| 11 | `src/lib/components/leads/LeadGrid.svelte` (Avatar L154) | Pass owner `color` (has `users[]`+`ownerId`). |
| 12 | `src/lib/components/leads/ReassignModal.svelte` (Avatar L49) | Pass `user.color` (full User object). |
| 13 | `src/routes/reports/+page.svelte` (Avatar L453) | `reports/+page.server.ts` does NOT currently select color (L43-45, L180-184) → extend the query; thread color. |
| 14 | `src/routes/meetings/[id]/+page.server.ts` + `src/lib/server/db/meetings.ts` (organizer/attendee selects at L140/L172/L201/L227/L297) | Extend organizer/attendee name-only joins to also select color; add `organizerColor`/attendee color; thread to Avatar (`+page.svelte:192,210`). |
| 15 | `src/routes/leads/[id]/+page.server.ts` + `src/lib/server/db/leads.ts` (ownerName denorm) | Add `ownerColor` alongside `ownerName`; thread to Avatar (`+page.svelte:552,587,1131`). |

## Public Contracts

- **DB schema:** `crm_users` gains `color text` (nullable, no default). Additive, backward-compatible; existing rows read as `NULL`.
- **`User` type:** gains optional `color?: string | null`. Additive — no existing consumer breaks.
- **`Avatar.svelte` props:** `{ name, size, color? }` — `color` optional; omission preserves current behavior exactly (hash fallback). **All 10 existing shared-Avatar call sites** (team/+page L412, reports L453, leads/[id] L552/L587/L1131, meetings/[id] L192/L210, PipelineBoard L170, LeadGrid L154, ReassignModal L49) remain valid without change; the plan threads color into all 10 in Phases D–E.
- **PATCH `/api/users/[id]` payload:** adds optional `color` field. Validation: `^#[0-9a-fA-F]{6}$` or `null` (null clears color → reverts to hash). **Authorization gate (manager-only):**
  - Reps (non-manager) may **not** set `color` on anyone (including self) → `403`.
  - Manager / super_manager may set `color` on any user (self or other).
  - Rationale: LOCKED decisions 1 + 7 make color a manager-administered attribute; unlike name (self-editable), color is NOT self-editable by reps. Implement by (a) in the **self branch** (L28-33) rejecting `color !== undefined` unless the actor `isManagerRole`, AND (b) in the **other-user branch** (L34-49) requiring `isManagerRole` when `color !== undefined` (mirror the rename check at L46).
- **`resolveAvatarColor(stored, name)`:** pure function, `stored ?? avatarColor(name)`. Never throws.

## Blast Radius

- **Files:** ~15 (1 schema, 1 migration, 1 type, 2 zod, 1 endpoint, 1 helper, 1 shared component, call-site/query files). 10 distinct render call sites threaded.
- **Packages:** single app (`src/`). No multi-package spread.
- **Risk class:** **schema/data migration (HIGH-RISK)** — additive nullable column, no backfill, no destructive change. Also touches an **API contract** (PATCH payload + authorization) → security-relevant. Both flagged for the 5-artifact evidence pack at EXECUTE (see High-Risk Evidence Pack Note).
- **Sibling-plan collision watch:** `name-split-first-last_08-07-26` (#277) and `team-member-profile-edit_07-07-26` touch the SAME files (schema `crmUsers`, `+server.ts` patchSchema, `zod/schemas.ts` `userFormSchema`, `/team` edit modal, `dbUserToUser`, `meetings.ts`/`leads.ts` organizer/owner joins). **#277 has LANDED in the working tree** (verified 09-07-26: `crmUsers` now has `firstName`/`lastName`, `formatFullName` exists, migration `0033_name_split_first_last` is journal idx 33). This plan's changes are **purely additive** on top of #277's shape; EXECUTE must still re-locate anchors by content, not by the line numbers verbatim.

## Phased Implementation Checklist

Phases are ordered by dependency: data layer → render primitive → write path → thread through read call sites. Each phase has an inline test gate.

### Phase A — Data layer (schema, migration, type, zod)

1. Add `color: text('color')` to the `crmUsers` column block in `src/lib/server/db/schema.ts` (after `lastName`, before `email`, or grouped with display fields — placement cosmetic, column is nullable).
2. Run `bun run db:generate` to produce `drizzle/0034_*.sql`. **Pre-check first** (per CLAUDE.md Drizzle convention): confirm `_journal.json` last `idx === 33` (verified) and no duplicate-prefix `.sql` files before generating. Verify the generated SQL is a single `ALTER TABLE "crm_users" ADD COLUMN "color" text;` — no unexpected drops.
3. Add `color?: string | null` to the `User` interface in `src/lib/types/index.ts` (L36-47).
4. Map `color: row.color ?? null` in `dbUserToUser` (`src/lib/server/db/leads.ts:144-154`).
5. Add `color` to `userFormSchema` (`src/lib/zod/schemas.ts:240`): `color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional()`. Ensure the edit path (`userNameEditSchema` pick, L250) also carries `color` (extend the `.pick()` or create a `userColorEditSchema`).
   - **Test gate A:** `bun run check` (types) + `bun run test:unit -- src/tests/schemas.spec.ts` (add hex-accept + hex-reject + null-accept cases). Fully-Automated.

### Phase B — Render primitive (backward-compatible)

6. Add `resolveAvatarColor(stored: string | null | undefined, name: string | null | undefined): string` to `src/lib/design/tokens.ts` returning `stored ?? avatarColor(name)`. Do NOT modify `avatarColor`.
7. Add optional `color?: string | null` prop to `src/lib/components/shared/Avatar.svelte`; change `const hex = $derived(avatarColor(name))` → `const hex = $derived(resolveAvatarColor(color, name))`. No other markup change (keeps `text-white`, decision 8).
   - **Test gate B:** new `src/tests/avatar-color.spec.ts` — assert `resolveAvatarColor('#123456', 'X') === '#123456'`, `resolveAvatarColor(null, 'X') === avatarColor('X')`, `resolveAvatarColor(undefined, null) === avatarColor(null)`. Fully-Automated. + `bun run check`.

### Phase C — Write path (endpoint + picker)

8. In `src/routes/api/users/[id]/+server.ts`: add `color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional()` to `patchSchema` (L11-16).
9. Add the manager-only authorization gate: in the **self branch** (L28-33), reject `color !== undefined` unless actor `isManagerRole(locals.user.role)` (reps cannot set own color → 403); in the **other-user branch** (L34-49), require `isManagerRole` when `color !== undefined` (mirror the rename check at L46 → rep-other 403). Thread `color` into the `.set()` object (L53-58) via `...(color !== undefined ? { color } : {})`.
   - **Test gate C:** new/extended endpoint unit test (pattern: existing `src/tests/*-gate.spec.ts` + `calendar-events-endpoint.spec.ts`) — invoke the PATCH handler with mocked `locals` for ALL FOUR cases: (a) rep setting own color → **403**, (b) rep setting other's color → **403**, (c) manager setting other's color → **200 + `color` in update**, (d) invalid hex → **400**. Fully-Automated. + `bun run check`.
10. In `src/routes/team/+page.svelte` edit modal (L658-687): add `editColor` `$state`, initialized from the target's current color (or `resolveAvatarColor(current, name)` so a null-color user shows their current hash color as the starting swatch — `<input type="color">` requires a hex, cannot be null); add a `<Label>` + `<input type="color" bind:value={editColor}>` field; retitle modal to "Edit member". Include `color: editColor` in the `saveEditName` PATCH body. Gate the picker's visibility/enable on the same `canManage` used for the edit action (managers only reach this modal already, but assert the gate explicitly).

### Phase D — Thread color through user-object call sites

11. `src/routes/team/+page.svelte:412` roster Avatar — pass `color={u.color}`.
12. `src/lib/components/pipeline/PipelineBoard.svelte`: add `ownerColor(ownerId)` helper (find user in `users[]`, return `resolveAvatarColor(user?.color, user?.name)`); pass `color={ownerColor(c.ownerId)}` to the Avatar at L170; render the **left accent bar** on the card div (L126-130). **BINDING (see VALIDATE concern C-D1): use a distinct absolutely-positioned bar element (e.g. `<span class="absolute inset-y-0 left-0 w-[3px] rounded-l-[10px]" style="background:{ownerColor(c.ownerId)}">` inside a `relative`-positioned card) — do NOT use inline `border-left`.** The current card div class is `border border-hairline` (uniform all-sides border); an inline `border-left` would override the hairline's left edge. Keep the neutral hairline border intact; the accent bar sits on top. Do NOT touch `col.color` (stage header dot). The L119-125 comment mentions "border-left" but no such Tailwind utility exists in the current card CSS — the concern is the uniform hairline, not a literal border-left class.
13. `src/lib/components/leads/LeadGrid.svelte:154` — pass owner `color` (lookup from `users[]` by `ownerId`).
14. `src/lib/components/leads/ReassignModal.svelte:49` — pass `user.color` (full User object in scope).
15. `src/routes/reports/+page.svelte:453` — `reports/+page.server.ts` selects only `{ id, firstName, lastName }` from `crmUsers` (L43-45, L180-184) → extend BOTH selects to include `color`, surface it in the mapped user objects (L87, L184), pass `color` to Avatar.
   - **Test gate D:** `bun run check` + `bun run test:unit -- src/tests/pipeline-db.spec.ts` if the pipeline query changes (use `.toSQL()` assertion pattern if a select column is added). Render verification is Agent-Probe/Known-Gap (no component harness).

### Phase E — Extend name-only queries

16. `src/lib/server/db/meetings.ts` (organizer/attendee lookups; selects + `formatFullName` maps at L140/L172/L201/L227/L297): add `color` to the selected columns of the organizer + attendee joins. `src/routes/meetings/[id]/+page.server.ts`: surface `organizerColor` / attendee colors; thread to Avatar at `+page.svelte:192,210`.
17. `src/lib/server/db/leads.ts` (`ownerName` denormalization) + `src/routes/leads/[id]/+page.server.ts`: add `ownerColor` alongside `ownerName`; thread to Avatar at `+page.svelte:552,587,1131`.
   - **Test gate E:** `bun run check` + relevant `*-db.spec.ts` `.toSQL()` assertion for the added color column if such a DB-free query test exists. Fully-Automated where a DB-free query test exists; render is Known-Gap.

### Final regression gate (after all phases)

18. `bun run check` (full typecheck) → `bun run test:unit:ci` (full Vitest suite — must stay green, target ≥ prior 263 passed) → `bun run lint` (scoped to touched files; flag pre-existing drift, do not fix unrelated files).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `schemas.spec.ts` — color hex accept/reject/null cases | Fully-Automated | AC2 (valid color saved) — input validation |
| `avatar-color.spec.ts` — `resolveAvatarColor` stored-present / null-fallback / undefined-null branches | Fully-Automated | AC4 (badges use stored color, else fallback) |
| Endpoint unit test — rep-self 403, rep-other 403, manager-other 200+color, invalid-hex 400 | Fully-Automated | AC1 (manager-only picker gate) + AC2 (saved to DB record) |
| `dbUserToUser` maps `color` | Fully-Automated | AC5 (surfaces reflect stored color) — data plumbing |
| Pipeline query `.toSQL()` includes color column; `ownerColor` helper unit | Fully-Automated | AC3 (pipeline AE color-coding) — data path |
| `meetings.ts`/`leads.ts`/`reports` query `.toSQL()` selects color | Fully-Automated | AC5 (all other surfaces) — data path |
| Migration 0034 apply + real UPDATE round-trip | Hybrid (needs live Postgres) | AC2 (persisted to DB) — see live-DB note below |
| Color picker renders + manager-only visibility in `/team` modal | Agent-Probe / Known-Gap | AC1 render (no Svelte component harness / no auth fixture) |
| Avatar + pipeline accent bar render with stored color | Agent-Probe / Known-Gap | AC3/AC4/AC5 render (same infra gap) |
| Cross-page reflection after edit (`invalidateAll()` present; next-load path via threaded queries) | Agent-Probe (code inspection) + Fully-Automated (query threading) | AC6 (takes effect without reload / on next load) |

### REQ-TEST-LINK — SPEC criterion → proving scenario

- **AC1** Team page exposes color picker per user (manager-only) — proven by: endpoint manager-only gate unit test (`strategy: Fully-Automated`) for the authorization; picker render/visibility (`strategy: Agent-Probe`, Known-Gap residual → backlog stub, gate CONDITIONAL).
- **AC2** Selected color saved to DB — proven by: schema hex-validation unit + endpoint set-color 200 unit (`strategy: Fully-Automated`); persistence round-trip (`strategy: Hybrid`).
- **AC3** Pipeline uses stored color for AE color-coding — proven by: `ownerColor` helper + query `.toSQL()` unit (`strategy: Fully-Automated`); accent-bar render (`strategy: Agent-Probe`, Known-Gap residual → CONDITIONAL).
- **AC4** Letter avatar badges use stored color — proven by: `resolveAvatarColor` unit (`strategy: Fully-Automated`); render (`strategy: Agent-Probe`, Known-Gap residual → CONDITIONAL).
- **AC5** All other color-coded user surfaces reflect stored color — proven by: `dbUserToUser` + per-surface query `.toSQL()` unit (`strategy: Fully-Automated`); render (`strategy: Agent-Probe`, Known-Gap residual → CONDITIONAL).
- **AC6** Color changes take effect without reload (or on next load at minimum) — proven by: threaded-query next-load path unit (`strategy: Fully-Automated`) + `invalidateAll()` presence (`strategy: Agent-Probe`, code inspection).

**Vacuous-green note:** No developed behavior is declared done on Known-Gap alone. Every AC has ≥1 Fully-Automated proving scenario for its data/logic core; only the *render* dimension is Known-Gap, and that residual is (a) recorded in a backlog stub (see Test Infra Improvement Notes) and (b) keeps the render-dimension gate CONDITIONAL — never a silent terminal PASS.

## High-Risk Evidence Pack Note (schema/migration + API-contract)

This plan is a **schema/data migration** AND an **API-contract + authorization** change → both high-risk classes. At EXECUTE, the orchestrator must require the manual-first 5-artifact evidence pack (`vc-risk-evidence-pack`) before treating the work as finalize-ready. **All 5 artifacts are required, including `adversarial-validation.json`** (the API touches an authorization boundary — the adversarial scenario "a rep bypasses the manager-only gate via a direct PATCH to set `color`" MUST be documented as ruled-out, backed by the rep-self-403 + rep-other-403 Fully-Automated tests). Migration-specific evidence: the exact generated `0034_*.sql`, journal idx increment to 34, and — if a live/staging DB is available this session (see note) — proof of `bun run db:migrate` apply + a real `UPDATE crm_users SET color=...` round-trip + rollback consideration (column is additive nullable → drop-column rollback is safe).

## Live-DB Verification Flag (raise at EXECUTE)

The migration-apply + persistence round-trip is normally the repo's standing Hybrid known-gap (no live Postgres in this dev env — same class as manager-dashboard/calendar). **However**, per the RESEARCH handoff, #277's migration WAS applied to a real dev/staging DB this session on explicit user confirmation. So at EXECUTE, **ask the user** whether a live DB is available/configured for `bun run db:migrate` — if yes, this plan's migration 0034 and the color round-trip can ALSO be verified live (upgrading the Hybrid gate from known-gap to proven). Do not assume no-live-DB.

## Dependencies

- **#277 (`name-split-first-last`)** owns the current `crmUsers` shape, patchSchema, and `dbUserToUser` — **LANDED in the working tree** (verified 09-07-26). EXECUTE must read the latest state of those files (not this plan's captured line numbers) and layer color additively. Migration ordering: 0033 (applied) before 0034.
- **`team-member-profile-edit_07-07-26`** owns the `/team` edit modal — color field is added to that same modal.
- No new npm dependencies (native `<input type="color">`, existing zod/drizzle).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration journal drift (duplicate idx, as flagged in CLAUDE.md) | Run the pre-`db:generate` journal check (idx===33 confirmed, no dup-prefix `.sql`) before generating 0034. |
| Sibling-plan (#277) merge collision on shared files | #277 has landed; EXECUTE rebases against live file state; treat this plan's line numbers as indicative, re-locate anchors by content. |
| Pipeline accent bar colliding with the uniform `border border-hairline` card border | **Use a distinct absolutely-positioned bar element (NOT inline `border-left`).** Keep the neutral hairline border intact; the accent bar overlays it. See Phase D step 12 (binding). |
| Rep bypassing manager-only gate via direct PATCH | Endpoint-level gate (not just UI hiding); covered by Fully-Automated 403 tests for rep-self and rep-other; documented as ruled-out in `adversarial-validation.json`. |
| Invalid/garbage hex reaching DB | Hex regex in BOTH zod schemas (form + endpoint patchSchema); 400 test case. |
| `<input type="color">` initial-swatch UX (needs a hex even when color is null) | Seed the picker from `resolveAvatarColor(current, name)` so a null user shows their current hash color as the starting swatch. |

## Test Infra Improvement Notes

- **Render-dimension known-gap** (Avatar/pipeline/picker visual verification): blocked by (a) no Svelte component-test harness (open decision — `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`) and (b) no shared Playwright authenticated-session fixture (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). EXECUTE must write a backlog NOTE recording the #275 render scenarios (color picker visibility, avatar color rendering, pipeline accent bar) as deferred against these two harness gaps, and keep the render-dimension gates CONDITIONAL. Do not mark render behavior terminal-PASS.
- **Live-DB Hybrid gap** for migration 0034 apply + round-trip — same class as manager-dashboard/calendar; may be upgradable to proven this session (see Live-DB Verification Flag).

## Validate Contract

Status: CONDITIONAL
Date: 09-07-26
date: 2026-07-09
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 6/7 signals (S2 schema/API/auth, S6 high-risk class, S7 5+ files; single-app so S1 absent; not a phase program so S4 absent). Layer 1 (4 dimensions) + Layer 2 (5 phase feasibility) fan-out; independent read-only reviews, no mid-run coordination → parallel subagents.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC2 | color hex accepted / rejected / null accepted at input validation | Fully-Automated | `bun run test:unit -- src/tests/schemas.spec.ts` (hex-accept + hex-reject + null-accept cases) | B |
| AC4 | `resolveAvatarColor` returns stored when present, hash fallback when null/undefined | Fully-Automated | `bun run test:unit -- src/tests/avatar-color.spec.ts` (3 branch cases) | B |
| AC1 | PATCH manager-only color gate: rep-self 403, rep-other 403, manager-other 200, invalid-hex 400 | Fully-Automated | `bun run test:unit -- src/tests/users-color-gate.spec.ts` (new endpoint unit — 4 cases, mocked `locals`) | B |
| AC2 | `dbUserToUser` maps `color: row.color ?? null` | Fully-Automated | `bun run check` + covered by endpoint test returning mapped user | B |
| AC3 | pipeline `ownerColor` helper + query selects color | Fully-Automated | `bun run test:unit -- src/tests/pipeline-db.spec.ts` (`.toSQL()` if select column added) + `ownerColor` unit | B |
| AC5 | meetings/leads/reports queries select color | Fully-Automated | `bun run check` + relevant `*-db.spec.ts` `.toSQL()` assertion where a DB-free test exists | B/C |
| AC2 | migration 0034 apply + real UPDATE round-trip | Hybrid | `bun run db:migrate` + manual `UPDATE crm_users SET color=...` — precondition: live Postgres (DATABASE_URL) | C (D if no live DB this session) |
| AC1 | color picker renders + manager-only visibility in `/team` modal | Agent-Probe | manual/probe review of `/team` edit modal — no component harness / no auth fixture | D |
| AC3/AC4/AC5 | Avatar + pipeline accent-bar render with stored color | Agent-Probe | manual/probe visual review — same harness gaps | D |
| AC6 | color change reflected on next load (`invalidateAll()` + threaded queries) | Hybrid | threaded-query next-load unit (Fully-Automated core) + `invalidateAll()` presence (code inspection) | B |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — the render residuals are carried as gap-resolution D (backlog stub), not as a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- Phase A (schema/zod/type): Fully-automated: `bun run check` + `bun run test:unit -- src/tests/schemas.spec.ts`
- Phase B (render primitive): Fully-automated: `bun run test:unit -- src/tests/avatar-color.spec.ts` + `bun run check`
- Phase C (endpoint auth gate): Fully-automated: `bun run test:unit -- src/tests/users-color-gate.spec.ts` (4 cases) + `bun run check`
- Phase D (threading + pipeline): Fully-automated: `bun run check` + `bun run test:unit -- src/tests/pipeline-db.spec.ts`
- Phase E (name-only queries): Fully-automated: `bun run check` + `*-db.spec.ts` `.toSQL()` where present
- Migration 0034 apply + round-trip: hybrid: `bun run db:migrate` + `UPDATE crm_users` — precondition: live Postgres
- Render (picker/avatar/accent-bar visibility): agent-probe / known-gap: documented — no component harness, no shared auth fixture
- Final regression: Fully-automated: `bun run check` → `bun run test:unit:ci` → `bun run lint`

Failing stub (Phase A — AC2 hex validation):
test("should accept valid hex, reject bad hex, accept null for userFormSchema.color", () => { throw new Error("NOT IMPLEMENTED — TDD stub: color hex accept/reject/null") })

Failing stub (Phase B — AC4 resolveAvatarColor):
test("should return stored color when present, else avatarColor(name) fallback", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resolveAvatarColor branches") })

Failing stub (Phase C — AC1 manager-only gate):
test("should 403 rep-self, 403 rep-other, 200 manager-other, 400 invalid-hex on PATCH color", () => { throw new Error("NOT IMPLEMENTED — TDD stub: color auth gate 4 cases") })

Failing stub (Phase D — AC3 pipeline ownerColor / query):
test("should resolve ownerColor from users[] and select color in pipeline query", () => { throw new Error("NOT IMPLEMENTED — TDD stub: pipeline ownerColor + query") })

Dimension findings:
- Infra fit: PASS — single app, no container/port surface; migration idx confirmed (journal last=33 → 0034 correct); additive nullable `ALTER TABLE crm_users ADD COLUMN color text`; genuinely lower-risk than #277's destructive name-split.
- Test coverage: CONCERN — every AC has a Fully-Automated data/logic core; render dimension is a bounded Known-Gap against two standing harness gaps (no component harness, no shared auth fixture); plan originally lacked an explicit Acceptance Criteria section (added during VALIDATE V6).
- Breaking changes: CONCERN — Avatar `color?` addition is backward-compatible (all call sites currently pass only `name`); the plan's call-site COUNT was wrong (stated 6/8, actual 10) but all 10 are covered by the threading checklist (corrected during V6). PATCH payload change is additive + gated.
- Security surface: PASS — manager-only auth gate asymmetry (color NOT self-editable, unlike name) correctly specified in BOTH branches; defense-in-depth endpoint gate (not UI-only); hex regex in both zod layers; all 4 gate cases (rep-self-403, rep-other-403, manager-other-200, invalid-400) covered by a Fully-Automated test; adversarial-validation.json required.
- Section A (data layer) feasibility: PASS — schema block re-verified L75-101; migration idx 34 correct; `dbUserToUser` anchor L144-154 byte-accurate; highest-risk edit is the migration (mitigated by pre-generate journal check + additive-nullable safety).
- Section B (render primitive) feasibility: PASS — current Avatar props `{name,size}`, `hex=avatarColor(name)` confirmed; optional `color?` + `resolveAvatarColor` fallback is backward-compatible.
- Section C (write path) feasibility: PASS — endpoint anchors (patchSchema L11-16, self L28-33, other L34-49, `.set()` L53-58) ALL byte-accurate against current source; gate design sound; highest-risk edit is the self-branch color rejection (must add explicit `isManagerRole` check, covered by rep-self-403 test).
- Section D (threading + pipeline) feasibility: CONCERN — accent-bar mitigation was internally inconsistent (offered colliding inline `border-left` as an equal option vs "keep hairline intact"); resolved to a binding instruction: distinct absolutely-positioned element, never inline border-left. Card div re-anchored L126-130 (uniform `border border-hairline`, no literal border-left utility exists).
- Section E (name-only queries) feasibility: PASS — `meetings.ts` selects firstName/lastName for organizer+attendees (adding color is mechanical); `reports/+page.server.ts` does NOT select color (L43-45,180-184) → plan's "extend query" is correct and required; `formatFullName` present confirms #277 landed.

Open gaps:
- Render dimension (color picker visibility, avatar color render, pipeline accent-bar render): known-gap — no Svelte component-test harness AND no shared Playwright auth fixture (repo-wide, same class as calendar/manager-dashboard/ux-enhancement). Resolution D — EXECUTE writes a backlog NOTE stub; gate stays CONDITIONAL, never terminal-PASS.
- Live-DB migration-apply + persistence round-trip: hybrid — needs live Postgres. May be upgradable to proven this session (Live-DB Verification Flag) — EXECUTE must ask the user.
- Line-anchor drift on 3 files (schema block, User type, pipeline card div): minor, mitigated by the plan's "re-locate by content" instruction; corrected anchors written into Touchpoints during V6.

What this coverage does NOT prove:
- `bun run test:unit -- src/tests/schemas.spec.ts` proves hex validation accepts/rejects strings; it does NOT prove the color persists to a real DB column, nor that the picker renders.
- `bun run test:unit -- src/tests/avatar-color.spec.ts` proves the pure `resolveAvatarColor` branches; it does NOT prove the Avatar component visually renders the resolved hex.
- `bun run test:unit -- src/tests/users-color-gate.spec.ts` proves the authorization branches return the right status codes with mocked `locals`; it does NOT prove a real signed-in rep is blocked end-to-end (no auth fixture), nor that the color reaches Postgres.
- `.toSQL()` query assertions prove the SELECT/UPDATE statement shape includes the color column; they do NOT prove the query returns correct rows against a live DB.
- `bun run db:migrate` (Hybrid) proves the migration applies against live Postgres IF run; it is NOT run in the no-live-DB dev env (known-gap unless the Live-DB flag is exercised).
- No gate proves the pipeline accent-bar renders without colliding with the hairline border, nor that the color picker is visible only to managers in the actual DOM — both are render-dimension Agent-Probe/Known-Gap residuals.

Gate: CONDITIONAL (no logic FAILs; render-dimension known-gaps named and bounded; structural + concern fixes applied to plan during V6)
Accepted by: session (autonomous, outer-pvl VALIDATE delegation) — accepted concerns: (1) render-dimension known-gap against no-component-harness + no-auth-fixture (resolution D, backlog stub at EXECUTE); (2) live-DB Hybrid gap for migration 0034 apply/round-trip (resolution C, ask user at EXECUTE); (3) minor line-anchor drift on 3 files (corrected in Touchpoints; EXECUTE re-locates by content).

## Autonomous Goal Block

```
SESSION GOAL: Ship GitHub #275 — persistent manager-editable per-user colors (crm_users.color) threaded through Avatar + 10 call sites + new Pipeline AE accent bar
Charter + umbrella plan: N/A — single plan
Autonomy: outer-pvl delegated; CONDITIONAL accepted autonomously (render known-gaps + live-DB Hybrid gap on record). Follow feedback_autonomous_phase_execution rules — reversible decisions auto-proceed; hard stop only on irreversible/outward-facing actions.
Hard stop conditions / safety constraints:
- Do NOT apply migration 0034 to any live DB without explicit user confirmation of live-DB availability (Live-DB Verification Flag).
- HIGH-RISK schema/migration + auth: do NOT treat work as finalize-ready until the 5-artifact evidence pack (incl. adversarial-validation.json) exists and the reviewer decision is recorded.
- Manager-only color gate must be enforced at the ENDPOINT (not UI-only); rep-self and rep-other MUST 403.
- Pre-generate journal check (idx===33, no dup-prefix .sql) before `bun run db:generate`.
Next phase: EXECUTE: process/features/team/active/user-colors-persistent_08-07-26/user-colors-persistent_PLAN_08-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate CONDITIONAL)
Execute start: Phase A→E in order. Fully-auto gates: `bun run check`; `bun run test:unit -- src/tests/schemas.spec.ts`; `bun run test:unit -- src/tests/avatar-color.spec.ts`; `bun run test:unit -- src/tests/users-color-gate.spec.ts`; `bun run test:unit -- src/tests/pipeline-db.spec.ts`; final `bun run check` → `bun run test:unit:ci` → `bun run lint`. Hybrid: `bun run db:migrate` (ask user re live DB). Agent-probe: render (picker/avatar/accent-bar) — known-gap. High-risk pack: yes (5 artifacts incl. adversarial-validation.json).
```

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/team/active/user-colors-persistent_08-07-26/user-colors-persistent_PLAN_08-07-26.md`
2. **Last completed step:** VALIDATE (V1–V7) complete — validate-contract written, Gate CONDITIONAL. No code changes yet.
3. **Validate-contract status:** written 09-07-26 (Gate CONDITIONAL — render known-gaps + live-DB Hybrid gap accepted; structural/concern fixes applied).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; grounded re-reads (09-07-26) of `schema.ts` (crmUsers L75-101), `tokens.ts` (avatarColor L101-106), `Avatar.svelte` (props L5), `api/users/[id]/+server.ts` (full — anchors byte-accurate), `zod/schemas.ts` (userFormSchema L240-247), `leads.ts` (`dbUserToUser` L144-154), `types/index.ts` (User L36-47), `team/+page.svelte` (edit modal L658-687), `PipelineBoard.svelte` (card div L126-130, Avatar L170), `meetings.ts` (organizer/attendee selects), `reports/+page.server.ts` (user selects L43-45/L180-184); migration journal (idx 33 → next 0034 confirmed); Avatar call-site census (10 sites).
5. **Next step for a fresh agent:** EXECUTE phase-by-phase (A→E) with per-phase test gates; at EXECUTE start, (a) re-locate file anchors by content against latest state, (b) run the pre-`db:generate` journal check, (c) ask the user about live-DB availability for the migration/round-trip Hybrid gate, (d) require the 5-artifact high-risk evidence pack incl. `adversarial-validation.json`, and (e) write the render-dimension known-gap backlog NOTE. Final regression: `bun run check` → `bun run test:unit:ci` → `bun run lint`.
