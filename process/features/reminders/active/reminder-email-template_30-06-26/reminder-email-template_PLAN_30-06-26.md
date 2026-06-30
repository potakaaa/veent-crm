---
name: plan:reminder-email-template
description: "Branded reminder email template + secret-authed per-rep notify dispatch endpoint for the reminders feature"
date: 30-06-26
feature: reminders
---

# Reminder Email Template + Dispatch Integration — Plan

**Date**: 30-06-26
**Complexity**: Simple
**Status**: ⏳ PLANNED
**Feature**: reminders

## Overview

Replace the bare-bones reminder digest HTML with a branded, mobile-friendly email template, and add the
missing dispatch endpoint that actually sends a digest to each rep. Today `sendReminderDigest()` exists but
is never called from any production route, and it emits a minimal `<p>…</p><ul>…</ul>`. This plan delivers:

1. A pure, testable branded HTML builder (`buildReminderDigestHtml`).
2. `sendReminderDigest()` updated to use it (no-throw no-op behavior preserved).
3. A secret-authed `POST /api/reminders/notify` endpoint that groups due reminders by rep and dispatches one
   digest per rep.
4. A pure `groupRemindersByRep()` helper so the endpoint's grouping logic is unit-testable without a DB.

TL;DR: one new template file, one new endpoint, one small grouping helper, edits to `email.ts` + tests +
`_GUIDE.md`. No schema, auth, or migration surface.

## Goals and Success Metrics

**Goals:**
- Branded HTML digest using the veent design palette, inline CSS, 600px single-column, mobile-safe.
- Working per-rep dispatch endpoint (secret-authed, same pattern as `/api/reminders/due`).
- Preserve the no-throw / no-op email behavior exactly (VE-C2 must stay green).
- Grouping logic covered by fast unit tests (no DB needed).

**Success Metrics:**
- `bun run test:unit:ci` green: VE-C2 unchanged + new template + grouping tests pass.
- `bun run check` and `bun run build` exit 0.
- Manual: `POST /api/reminders/notify` with correct Bearer sends one branded email per rep (Hybrid).

## Scope

**In-Scope:**
- New email template builder (pure function).
- New notify dispatch endpoint.
- New pure grouping helper.
- `sendReminderDigest()` refactor to use the template + updated subject + `APP_URL`.
- Unit tests for template + grouping.
- `APP_URL` env var addition (links only; no-op if unset).
- `_GUIDE.md` documentation update.

**Out-of-Scope:**
- Live n8n workflow config + Viber/Telegram delivery (backlog: `n8n-reminders-dispatch_NOTE_29-06-26.md`).
- Any change to `getDueReminders()` query logic.
- Schema, auth, or migration changes.
- A scheduler/cron — the endpoint is triggered externally (n8n), not self-scheduling.

## Assumptions and Constraints

**Assumptions:**
- `getDueReminders()` is the correct and only source of due reminders (already real, returns `DueReminder[]`).
- The notify endpoint follows the SAME secret-auth pattern as `/api/reminders/due` (`REMINDERS_ENDPOINT_SECRET`
  Bearer; allow-all when secret unset in v0).
- Email clients strip `<style>` tags → all CSS must be inline.

**Constraints:**
- Svelte 5 / SvelteKit 2 / Bun conventions (`$env/dynamic/private`, not `process.env`).
- `sendReminderDigest()` must NOT delegate to `sendEmail()` (which throws on missing key).
- The template builder must import nothing from `$env` or Resend → unit-testable with no env setup.
- Vitest only (`bun run test:unit:ci`), not `bun test`.

## Touchpoints

| File | Action | Why |
|---|---|---|
| `src/lib/server/email-templates/reminder.ts` | NEW | Pure branded HTML builder `buildReminderDigestHtml` |
| `src/lib/server/reminders.ts` | EDIT | Add pure `groupRemindersByRep()` helper (colocated with `DueReminder`) |
| `src/lib/server/email.ts` | EDIT | Use template in `sendReminderDigest`; new subject; `APP_URL` |
| `src/routes/api/reminders/notify/+server.ts` | NEW | Secret-authed POST: group by rep, dispatch per rep |
| `src/tests/reminders.spec.ts` | EDIT | Add template + grouping unit tests; VE-C2 stays unchanged |
| `process/features/reminders/_GUIDE.md` | EDIT | Document the new endpoint + `APP_URL` env |

## Public Contracts

- **`buildReminderDigestHtml({ appUrl, reminders }): string`** — new exported pure function in
  `src/lib/server/email-templates/reminder.ts`. Inputs: `appUrl: string`, `reminders: DueReminder[]`.
  Output: a complete HTML document string. No throw on empty list.
- **`groupRemindersByRep(reminders: DueReminder[]): Array<{ repEmail: string; reminders: DueReminder[] }>`**
  — new exported pure function in `src/lib/server/reminders.ts`. Drops entries with `repEmail === null`.
- **`POST /api/reminders/notify`** — new HTTP contract. Auth: `Authorization: Bearer <REMINDERS_ENDPOINT_SECRET>`
  (allow-all when secret unset, matching `/api/reminders/due`). Response: `200 { sent: number, skipped: number }`
  on success; `401` on bad Bearer when secret set.
- **`APP_URL`** — new private env var (base URL for CTA links). Optional; unset → links omit the domain, no throw.
- `sendReminderDigest()` signature is UNCHANGED — internal implementation only.

## Blast Radius

- **Files:** 6 (2 new source, 1 new endpoint, 1 source edit, 1 test edit, 1 doc edit).
- **Packages/surfaces:** single app (`src/lib/server`, `src/routes/api`). No cross-package impact.
- **Risk class:** LOW-MEDIUM. New public API surface (the notify endpoint) is the only elevated item — it is
  secret-authed and side-effecting (sends email), so it gets a Hybrid gate. No schema/auth/billing/migration.
- **Regression surface:** VE-C2 (`sendReminderDigest` no-op) must remain green after the `email.ts` edit.

## Functional Requirements

### FR1 — Email template (`src/lib/server/email-templates/reminder.ts`)

Export `buildReminderDigestHtml({ appUrl, reminders }: { appUrl: string; reminders: DueReminder[] }): string`.

- Pure function: no imports from `$env` or `resend`.
- Inline CSS only (no `<style>` blocks).
- Brand palette: header `#c0362c`, background `#f3e9e6`, card `#ffffff`, body text `#261617`, overdue badge
  `#e11d48`, due-today badge `#c2710c`.
- Font stack: `'Inter', -apple-system, BlinkMacSystemFont, Arial, sans-serif`.
- Layout: max-width 600px, single column, mobile-safe.
- Structure:
  - Header: "Veent" wordmark in `#c0362c` + tagline "Your follow-up reminders".
  - Overdue section (only if any `overdue === true`): red badge, label "Overdue", list of overdue cards.
  - Due Today section (only if any `overdue === false`): amber badge, label "Due Today", list of cards.
  - Per-reminder card: lead name (bold), formatted date (e.g. "Jun 30, 2026 · 9:00 AM"), urgency chip,
    wine-red CTA button `<a href="${appUrl}/leads/${leadId}">View Lead →</a>`.
  - Footer: "This email was sent by Veent CRM. You're receiving this because you have follow-ups due."
- HTML-escape all interpolated lead names (reuse the escape approach already in `email.ts`).
- Empty `reminders` list → returns non-empty valid HTML (header + footer, no card sections), no crash.

### FR2 — Grouping helper (`src/lib/server/reminders.ts`)

Export `groupRemindersByRep(reminders: DueReminder[]): Array<{ repEmail: string; reminders: DueReminder[] }>`.

- Group by `repEmail`; preserve input order within each group.
- Drop reminders whose `repEmail` is `null` (these are the "skipped" count source).
- Pure, deterministic, no DB, no env.

### FR3 — `sendReminderDigest()` update (`src/lib/server/email.ts`)

- Import `buildReminderDigestHtml`.
- Read `APP_URL` from `$env/dynamic/private`; fall back to `''`.
- Generate `html` via `buildReminderDigestHtml({ appUrl: env.APP_URL ?? '', reminders })`.
- Subject: `` `You have ${reminders.length} reminder${reminders.length > 1 ? 's' : ''} due — Veent` ``.
- Keep the existing no-key no-op (`console.warn`, return) path EXACTLY — do not delegate to `sendEmail()`.
- Keep the try/catch log-don't-throw send path.

### FR4 — Notify dispatch endpoint (`src/routes/api/reminders/notify/+server.ts`)

`POST` handler:
1. Auth: read `REMINDERS_ENDPOINT_SECRET`; if set and Bearer mismatch → `throw error(401, 'unauthorized')`
   (same shape as `/api/reminders/due`).
2. Call `getDueReminders()`.
3. If empty → `return json({ sent: 0, skipped: 0 })`.
4. `groupRemindersByRep(due)` → groups. `skipped = due.length - sum(group reminders length)` (i.e. count of
   null-rep reminders).
5. For each group: `await sendReminderDigest({ repEmail, reminders })` inside a per-rep try/catch (log, do not
   throw — one rep failure must not abort the rest).
6. `return json({ sent: groups.length, skipped })`.

### FR5 — Env + docs

- Add `APP_URL` to `_GUIDE.md` env section (base CRM URL, e.g. `https://crm.veent.io`; optional, no-op if unset).
- Add the `/api/reminders/notify` endpoint to `_GUIDE.md` Key Source Files.

## Acceptance Criteria

- **AC1** — `buildReminderDigestHtml` renders each lead name, a formatted date, and a CTA link containing
  `/leads/${leadId}`. _proven by:_ "template renders lead name + CTA leadId" — _strategy:_ Fully-Automated.
- **AC2** — Overdue reminders appear under the Overdue section (output contains the overdue marker/label).
  _proven by:_ "template overdue section" — _strategy:_ Fully-Automated.
- **AC3** — Empty reminders list returns non-empty HTML without crashing. _proven by:_ "template empty list"
  — _strategy:_ Fully-Automated.
- **AC4** — `sendReminderDigest` still no-ops (logs, no throw) when `RESEND_API_KEY` unset (VE-C2 unchanged).
  _proven by:_ VE-C2 — _strategy:_ Fully-Automated.
- **AC5** — `groupRemindersByRep` groups by rep and drops null-rep reminders. _proven by:_ "grouping by rep +
  null drop" — _strategy:_ Fully-Automated.
- **AC6** — `POST /api/reminders/notify` with correct Bearer returns `{ sent, skipped }` and sends one branded
  email per rep; wrong Bearer (secret set) → 401. _proven by:_ manual curl + inbox check — _strategy:_ Hybrid.
- **AC7** — `bun run check` and `bun run build` exit 0. _proven by:_ typecheck + build — _strategy:_
  Fully-Automated.

## Implementation Checklist

1. **Create `src/lib/server/email-templates/reminder.ts`** — implement `buildReminderDigestHtml` per FR1:
   pure function, inline-CSS branded HTML, overdue/due sections, per-card CTA, HTML-escaped lead names, safe
   on empty list. Import `DueReminder` type from `$lib/server/reminders`.
2. **Add `groupRemindersByRep()` to `src/lib/server/reminders.ts`** — pure helper per FR2 (group by
   `repEmail`, drop nulls, preserve order). Export it.
3. **Edit `src/lib/server/email.ts`** — import `buildReminderDigestHtml`; add `APP_URL` read with `''`
   fallback; build `html` via the template; update subject line; keep the no-key no-op and try/catch paths
   unchanged (do NOT route through `sendEmail`).
4. **Create `src/routes/api/reminders/notify/+server.ts`** — `POST` handler per FR4: secret auth (mirror
   `/api/reminders/due`), `getDueReminders()`, `groupRemindersByRep()`, per-rep dispatch in try/catch,
   `json({ sent, skipped })`.
5. **Edit `src/tests/reminders.spec.ts`** — add `describe('buildReminderDigestHtml')` (lead name + CTA
   leadId; overdue section; empty list non-empty) and `describe('groupRemindersByRep')` (groups by rep; drops
   null repEmail). Leave VE-C2 untouched. (Note: the file mocks `$env/dynamic/private` to `{ env: {} }` at
   module top — template tests are pure and unaffected.)
6. **Edit `process/features/reminders/_GUIDE.md`** — add the notify endpoint to Key Source Files and document
   `APP_URL` in an env note.
7. **Run gates** — `bun run check`, then `bun run test:unit:ci`, then `bun run build`. Fix failures inline.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:unit:ci` — `buildReminderDigestHtml` renders lead name + CTA contains `/leads/${leadId}` | Fully-Automated | AC1 |
| `bun run test:unit:ci` — overdue reminder appears in Overdue section | Fully-Automated | AC2 |
| `bun run test:unit:ci` — empty `reminders` returns non-empty HTML (no crash) | Fully-Automated | AC3 |
| `bun run test:unit:ci` — VE-C2 `sendReminderDigest` no-key no-op still passes | Fully-Automated | AC4 |
| `bun run test:unit:ci` — `groupRemindersByRep` groups by rep + drops null repEmail | Fully-Automated | AC5 |
| Manual: `curl -X POST -H "Authorization: Bearer $REMINDERS_ENDPOINT_SECRET" /api/reminders/notify` → `{sent,skipped}`; wrong Bearer → 401; inbox shows one branded email per rep (precondition: live dev server + Postgres + `RESEND_API_KEY`/`RESEND_FROM` set) | Hybrid | AC6 |
| `bun run check` exits 0; `bun run build` exits 0 | Fully-Automated | AC7 |

### TDD failing stubs (Fully-Automated rows → consumed by execute-agent red-first)

```
test("buildReminderDigestHtml renders lead name and CTA with leadId", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: template renders lead name + CTA leadId")
})
test("buildReminderDigestHtml puts overdue reminders in the Overdue section", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: template overdue section")
})
test("buildReminderDigestHtml returns non-empty HTML for empty reminders", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: template empty list")
})
test("groupRemindersByRep groups by rep and drops null repEmail", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: grouping by rep + null drop")
})
```

### Gap resolution

| Gap | Resolution options |
|---|---|
| Endpoint integration + real email send is Hybrid (needs live DB + dev server + Resend key) — no DB test harness exists | A) Defer to manual Hybrid gate (chosen — matches existing reminders feature posture). B) Add an integration harness (out of this plan's scope). C) Accept endpoint wiring as known-gap for automated coverage; the pure grouping helper (AC5) covers the routing logic. D) Backlog note already exists for live n8n dispatch. |

## Test Infra Improvement Notes

(none identified yet)

## Risks and Mitigations

- **Risk: `email.ts` edit breaks VE-C2.** Mitigation: keep the no-key no-op path byte-for-byte; build the
  template only inside the post-key-check try block; run VE-C2 first.
- **Risk: email clients render inline CSS inconsistently.** Mitigation: single-column 600px, inline styles,
  no flex/grid reliance; verify in the Hybrid manual gate.
- **Risk: one rep's send failure aborts the whole dispatch.** Mitigation: per-rep try/catch (FR4 step 5).
- **Risk: `APP_URL` unset produces broken `/leads/...` links.** Mitigation: documented no-op (relative path
  still works in most clients); not a throw.

## Integration Notes

- Endpoint auth mirrors `/api/reminders/due` exactly — copy the secret-check block.
- `getDueReminders()` already returns sorted `DueReminder[]`; do not re-sort in the endpoint.
- Keep process/plan commits separate from execution commits.

## Phase Loop Progress

- [ ] 1a. Research updated — context and codebase scan complete (done — inline research + code read)
- [ ] 1b. Plan supplemented — checklist reflects research findings
- [ ] 2. Validate contract written — vc-validate-agent gate verdict is green
- [ ] 3. Execute complete — all checklist items done, tests pass
- [ ] 4. Update process — plan archived, context docs updated, memory notes written
- [ ] 5. Report written — execute report filed to the task folder

> **IMPORTANT:** Step 2 is never skippable. A placeholder Validate Contract is a blocker — do not proceed to
> step 3 until a vc-validate-agent gate verdict is present.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reminders/active/reminder-email-template_30-06-26/reminder-email-template_PLAN_30-06-26.md`
2. **Last completed step:** PLAN written; awaiting VALIDATE.
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent must write before EXECUTE).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/features/reminders/_GUIDE.md`, `src/lib/server/email.ts`, `src/lib/server/reminders.ts`,
   `src/routes/api/reminders/due/+server.ts`, `src/tests/reminders.spec.ts`.
5. **Next step for a fresh agent:** run VALIDATE on this plan; then EXECUTE checklist 1→7 in order, running
   `bun run check` → `bun run test:unit:ci` → `bun run build` at step 7.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Phase Completion Rules

This is a SIMPLE (one-session) plan — the checklist runs continuously, not as gated phases. The single
completion gate is: all Fully-Automated gates green (`bun run check`, `bun run test:unit:ci`, `bun run build`)
AND VE-C2 unchanged. Status may only become `✅ VERIFIED` after the Hybrid manual gate (AC6) is user confirmed working — code-complete alone is `CODE DONE`, not `VERIFIED`.

## Next Step

Run VALIDATE on this plan (`ENTER VALIDATE MODE`) before EXECUTE. Do not route to EXECUTE until the Validate
Contract section is written with a green gate verdict.
