# Team Invite — Magic Link Welcome Email

**Date**: 2026-06-30
**Complexity**: SIMPLE
**Feature**: team
**Plan path**: `process/features/team/active/team-invite_30-06-26/team-invite_PLAN_30-06-26.md`
**Status**: ⏳ PLANNED

---

## Quick Links

- [Overview](#overview)
- [Goals and Success Metrics](#goals-and-success-metrics)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Functional Requirements](#functional-requirements)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

---

## Overview

When a manager adds a rep or manager on the `/team` route, the system immediately sends that person
a **welcome email containing a ready-to-use magic link**. The new team member can click the link to
sign in without going through the manual "request a link" flow themselves.

As part of this work, all transactional emails — the welcome/invite email and the regular
sign-in magic-link email — are rebuilt with **beautiful, design-system-consistent HTML templates**
that use the Veent warm wine-on-cream palette (primary `#c0362c`, canvas `#f3e9e6`, Inter + Spectral
typography).

Currently the team page calls the mocked `crm.createUser()`. This plan wires it to a real
`POST /api/users` endpoint backed by Drizzle (`crm_users` table).

---

## Goals and Success Metrics

| Goal | Metric |
|------|--------|
| New users receive a welcome email on creation | Email delivered within 5 s of manager submitting the form |
| Email is on-brand and readable on mobile | Tested manually in Gmail / Mailhog |
| Regular sign-in link email is also beautified | Compared visually to the welcome email — consistent look |
| Real DB write on user creation | Row visible in `crm_users` after add |
| No regressions on team page UX | Deactivate/reactivate still works; form validation unchanged |

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** — Works with other system pieces
2. **Manual Test** — User can perform the action in the real UI
3. **Data Verification** — DB/state changes confirmed
4. **Error Handling** — Failure cases handled gracefully
5. **User Confirmation** — User says "it works"

| Marker | Meaning |
|--------|---------|
| ⏳ PLANNED | Not started |
| 🔨 CODE DONE | Code written, NOT tested E2E |
| 🧪 TESTING | Code done, currently testing |
| ✅ VERIFIED | Tested AND user confirmed working |
| 🚧 BLOCKED | Has issues preventing completion |

---

## Execution Brief

### Phase 1 — DB function + API endpoint ⏳ PLANNED

**What happens:** Create `src/lib/server/db/users.ts` with `createUser()` (Drizzle insert into
`crm_users`). Create `POST /api/users` endpoint that validates with `userFormSchema`, inserts the
user, marks the email as a pending welcome invite, then calls `auth.api.signInMagicLink()` to
trigger Better Auth's magic link flow (which fires `sendMagicLink` — handled in Phase 2).

**Test:** `curl -X POST /api/users` with valid + invalid payloads; check `crm_users` table.
**Verify:** `SELECT * FROM crm_users WHERE email = '<new_email>';` — row exists.
**Done when:** Inserting via the API writes to DB; duplicate email returns 409.

### Phase 2 — Email templates ⏳ PLANNED

**What happens:** Create `src/lib/server/email-templates.ts` with two exported functions:
`welcomeEmail(name, url)` and `loginEmail(url)`. Both return `{ subject, html }`. The HTML is
fully inlined CSS matching the Veent design system — warm wine palette, Inter body, Spectral
display heading, branded footer. Update `auth.ts` `sendMagicLink` callback to (a) use the
`loginEmail` template by default, and (b) detect the welcome context via a module-level
`pendingWelcomeEmails: Set<string>` set in `POST /api/users` before the `signInMagicLink` call —
if the email is in the set, dequeue it and use `welcomeEmail` instead.

**Test:** In dev, trigger a sign-in from `/login` → console log shows nice template. Add a new
user from `/team` → a different welcome email is logged/sent.
**Verify:** Inspect `console.log` output in dev (RESEND_API_KEY not required for visual review
of the HTML string).
**Done when:** Both template HTML outputs are visually correct when pasted into an HTML previewer.

### Phase 3 — Wire team page to real API ⏳ PLANNED

**What happens:** Update `addRep()` in `src/routes/team/+page.svelte` to call
`fetch('/api/users', { method: 'POST', body: JSON.stringify({...}) })` directly instead of
`crm.createUser()`. Handle `409 Conflict` (duplicate email) as a user-facing form error. Update
modal subtitle to "They'll receive a welcome email with a sign-in link." Update `+page.server.ts`
already reads from the real DB — confirm it still works after the new user is added.

**Test:** Open `/team`, add a new user via the modal, confirm the row appears in the table.
**Verify:** `SELECT name, email, role FROM crm_users ORDER BY created_at DESC LIMIT 5;`
**Done when:** New user row appears in the team table immediately after adding; email is triggered.

**Expected Outcome (all phases done):**
- Manager adds user via `/team` modal → `crm_users` row created → beautiful welcome email sent
- Regular sign-in from `/login` → beautiful login email sent
- Duplicate email → clear 409 error in the modal
- `bun run check` passes with zero type errors
- `bun run test:unit:ci` green (existing 62 tests still pass — non-watch; `test:unit` alone runs vitest in watch mode and never exits)

---

## Scope

### In Scope

- `POST /api/users` — create user + trigger welcome magic link
- `src/lib/server/db/users.ts` — `createUser()` Drizzle insert
- `src/lib/server/email-templates.ts` — `welcomeEmail()` + `loginEmail()` HTML templates
- `src/lib/server/auth.ts` — update `sendMagicLink` to use templates + welcome detection
- `src/routes/team/+page.svelte` — wire `addRep()` to real API; update modal copy
- `src/lib/server/email.ts` — no changes required (already has `sendEmail()`)
- Feature folder `process/features/team/` — created as part of this plan

### Out of Scope

- Re-sending invite emails (resend button on team page)
- Email open/click tracking
- Reactivate-user sending a new link (separate concern)
- Better Auth `ba_user` table pre-population (BA creates it on first sign-in)
- `crm.CrmClient` real implementation (the mock stays for all non-team flows)
- UI redesign of the team page beyond the modal copy change

---

## Assumptions and Constraints

- `RESEND_API_KEY` and `RESEND_FROM` are configured in `.env`; if absent, email silently no-ops in
  dev (existing `sendEmail()` throws — plan logs the error but does NOT block user creation)
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are set
- `auth.api.signInMagicLink()` is available on the `auth` proxy object — if the method name
  differs in this BA version, research the correct method name before EXECUTE
- Email templates use fully-inlined CSS (no `<link>` tags) for maximum client compatibility
- `pendingWelcomeEmails` Set is module-level in `email-templates.ts` (imported into `auth.ts`) — safe in single-process Bun/Node;
  not safe in multi-replica deploys. For v0 single-server target this is fine.

---

## Functional Requirements

- `POST /api/users` requires manager session (`locals.user.role === 'manager'`), returns 403 otherwise
- Body validated with existing `userFormSchema`: `{ name, email, role, active? }`
- Duplicate email → HTTP 409 with `{ error: 'email_taken' }` message
- `createUser()` inserts one row into `crm_users`; `updatedAt` defaults to `defaultNow()`
- After insert, `POST /api/users` adds email to `pendingWelcomeEmails` then calls
  `auth.api.signInMagicLink({ body: { email, callbackURL: '/' } })`
- `sendMagicLink` callback: if email in `pendingWelcomeEmails` → delete → send `welcomeEmail`;
  else send `loginEmail`
- `welcomeEmail(name, url)` — subject: `"Welcome to Veent CRM — here's your sign-in link"`
- `loginEmail(url)` — subject: `"Your Veent CRM sign-in link"`
- Both templates: fully-inlined CSS, responsive (max-width 600 px), brand-consistent, link
  expiry note ("Link expires in 5 minutes"), plain-text fallback not required for v0
- Team page modal subtitle updated to reflect that an email will be sent
- If `auth.api.signInMagicLink()` call fails: log error; still return 201 with the created user
  (welcome email failure must NOT roll back the user creation)

---

## Acceptance Criteria

- [ ] Adding a user via `/team` inserts a row in `crm_users`
- [ ] Adding a user triggers a welcome email (verified via Resend dashboard or dev log)
- [ ] Welcome email HTML is visually consistent with the Veent design system
- [ ] Login magic-link email (from `/login` page) uses the new `loginEmail` template
- [ ] Duplicate email returns a user-visible error in the modal (not a JS crash)
- [ ] Manager-only guard on `POST /api/users` returns 403 for rep sessions
- [ ] `bun run check` passes (zero TypeScript errors)
- [ ] `bun run test:unit:ci` passes (all 62 existing tests green — use `:ci`, plain `test:unit` is watch mode)
- [ ] Team table refreshes immediately after adding a user (existing `invalidateAll()` still works)

---

## Implementation Checklist

> Execute strictly in order. Stop after each phase and verify before continuing.

### Phase 1 — DB function + API endpoint

- [ ] Create `process/features/team/` folder structure (active / completed / backlog) — done at plan-write time
- [ ] Create `src/lib/server/db/users.ts`:
  - `createUser(input: { name: string; email: string; role: 'rep' | 'manager' }): Promise<User>`
  - Drizzle `db.insert(crmUsers).values({...}).returning()`
  - Re-use `dbUserToUser` from `src/lib/server/db/leads.ts`
  - Throw on unique constraint violation (postgres error code `23505`) → caller catches as 409
- [ ] Create `src/routes/api/users/+server.ts`:
  - `POST` handler — manager-only guard, `userFormSchema` validation, `createUser()`, then
    welcome-invite trigger, returns `json(user, { status: 201 })`
  - Catch postgres unique constraint error → `json({ error: 'email_taken' }, { status: 409 })`
  - Catch `signInMagicLink` error → `console.error` only; still return 201
- [ ] `bun run check` — zero errors before continuing

### Phase 2 — Email templates + auth wiring

- [ ] Create `src/lib/server/email-templates.ts`:
  - `export const pendingWelcomeEmails = new Set<string>()`
  - `export function welcomeEmail(name: string, url: string): { subject: string; html: string }`
  - `export function loginEmail(url: string): { subject: string; html: string }`
  - Both: fully-inlined CSS, max-width 600 px, responsive, Veent palette
  - See design spec below
- [ ] Update `src/lib/server/auth.ts` `sendMagicLink` callback:
  - `import { pendingWelcomeEmails, welcomeEmail, loginEmail } from './email-templates'`
  - If `pendingWelcomeEmails.has(email)` → delete → send `welcomeEmail(name?, url)` (name
    lookup: `db.select().from(crmUsers).where(eq(crmUsers.email, email))` for personalization)
  - Else → send `loginEmail(url)`
- [ ] In `POST /api/users` handler: `pendingWelcomeEmails.add(email)` before calling `signInMagicLink`
- [ ] Visual check: print HTML to console / open in browser preview
- [ ] `bun run check` — zero errors

### Phase 3 — Team page wiring

- [ ] Update `src/routes/team/+page.svelte` `addRep()`:
  - Replace `await crm.createUser(...)` with:
    ```ts
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role })
    });
    if (res.status === 409) { formError = 'This email is already registered.'; return; }
    if (!res.ok) { formError = 'Unable to add user — try again.'; return; }
    ```
  - Update toast: `toasts.success('Invite sent — they'll receive a sign-in link by email')`
- [ ] Update modal subtitle: `"They'll receive a welcome email with a sign-in link."`
- [ ] `bun run check` — zero errors
- [ ] `bun run test:unit:ci` — all tests green (non-watch)

---

## Email Template Design Spec

### Shared structure (both templates)

```
┌─────────────────────────────────────────────────────┐
│  [top bar: 4px solid #c0362c]                       │
│                                                     │
│  ╔═══════════════════════════════════════════════╗  │
│  ║  Veent  (Spectral bold, #c0362c, 22px)        ║  │
│  ║  Outreach Console  (Inter, #5a4a48, 11px)     ║  │
│  ╚═══════════════════════════════════════════════╝  │
│                                                     │
│  [Hero heading — Spectral 600, 26px, #261617]       │
│                                                     │
│  [Body copy — Inter 400, 15px, #43282a, lh 1.6]    │
│                                                     │
│  ╔═══════════════════════════════════════════════╗  │
│  ║  [CTA button — bg #c0362c, white, 16px bold]  ║  │
│  ╚═══════════════════════════════════════════════╝  │
│                                                     │
│  Fallback link (font-mono, 12px, #6e5c5a)          │
│  "Link expires in 5 minutes."                       │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Footer: "Veent · this link is single-use"         │
│  (11px, #a89490, text-align center)                │
└─────────────────────────────────────────────────────┘
```

**Welcome email specifics:**
- Heading: "Welcome to Veent CRM, [Name]"
- Subhead: "Your manager has added you to the team. Click below to sign in and get started."
- CTA label: "Sign in to Veent"

**Login email specifics:**
- Heading: "Here's your sign-in link"
- Subhead: "Click below to sign in to Veent CRM. This link is single-use and expires in 5 minutes."
- CTA label: "Sign in"

**CSS palette (inline):**
- Background: `#f3e9e6` (canvas)
- Panel (card): `#ffffff`
- Primary / CTA background: `#c0362c`
- Top accent bar: `#c0362c`
- Heading text: `#261617` (ink)
- Body text: `#43282a` (ink-700)
- Muted / footer: `#a89490` (ink-200)
- Mono fallback link: `#6e5c5a` (ink-500)
- Border / hairline: `#efe2e0`
- CTA button radius: 8px
- Card radius: 12px

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `auth.api.signInMagicLink` method name differs in installed BA version | Check BA version in `package.json`; grep `auth.api.*` usage in codebase before EXECUTE |
| `pendingWelcomeEmails` race in multi-replica deploy | Acceptable for single-server v0; document in code comment |
| `RESEND_API_KEY` not set in dev → `sendEmail()` throws | Wrap welcome-email call in try/catch in `POST /api/users`; log but don't fail the 201 |
| BA `signInMagicLink` sends email BEFORE we return 201 (blocking) | Acceptable — Resend is fast; no async queue needed for v0 |
| Duplicate email during concurrent adds | Unique index on `crm_users.email` → postgres `23505` → caught and returned as 409 |

---

## Integration Notes

- `dbUserToUser` lives in `src/lib/server/db/leads.ts` — import from there in `users.ts`
- `userFormSchema` lives in `src/lib/zod/schemas.ts` — reuse in `POST /api/users`
- `getAuth()` / `auth` proxy lives in `src/lib/server/auth.ts` — `POST /api/users` calls
  `(await getAuth()).api.signInMagicLink(...)` to avoid circular imports
- `crm.createUser()` in the mock client is NOT removed — other tests/stubs may use it
- `sendEmail()` in `email.ts` throws on missing keys — `POST /api/users` must catch
- `+page.server.ts` for team already queries `crm_users` from the real DB; no changes needed there
  unless the `dbUserToUser` shape changes (it doesn't)

---

## Touchpoints

| File | Change type | Notes |
|------|-------------|-------|
| `src/lib/server/db/users.ts` | **NEW** | `createUser()` Drizzle insert |
| `src/routes/api/users/+server.ts` | **NEW** | `POST /api/users` handler |
| `src/lib/server/email-templates.ts` | **NEW** | `welcomeEmail`, `loginEmail`, `pendingWelcomeEmails` |
| `src/lib/server/auth.ts` | **EDIT** | `sendMagicLink` — use templates + welcome detection |
| `src/routes/team/+page.svelte` | **EDIT** | `addRep()` → real API; modal copy |
| `src/lib/server/db/leads.ts` | **READ** | `dbUserToUser` import source — no changes |
| `src/lib/zod/schemas.ts` | **READ** | `userFormSchema` import source — no changes |

---

## Public Contracts

| Contract | Details |
|----------|---------|
| `POST /api/users` | Body: `UserForm` (`name`, `email`, `role`, `active?`). Responses: 201 `User`, 400 validation error, 403 not-manager, 409 email taken |
| `welcomeEmail(name, url)` | Returns `{ subject: string; html: string }` |
| `loginEmail(url)` | Returns `{ subject: string; html: string }` |
| `pendingWelcomeEmails` | `Set<string>` exported from `email-templates.ts`; set in `POST /api/users`, consumed in `sendMagicLink` |
| `crm_users` DB schema | No schema changes — existing columns only |

---

## Blast Radius

- **Files changed:** 5 (2 new, 3 edits)
- **Packages:** `src/lib/server/` (email + auth + db), `src/routes/api/users/`, `src/routes/team/`
- **Risk class:** Low-medium — no schema migration, no auth flow change (BA magic link still owns
  token issuance), no breaking API changes. Risk is in the `sendMagicLink` edit (affects all sign-ins)
  and the `POST /api/users` endpoint (new surface, manager-only guard)
- **Regression surfaces:** `/team` page UX, `/login` magic-link email delivery

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|-----------------|----------|-----------------------|
| `POST /api/users` with valid body → 201 + `crm_users` row | Hybrid (curl + DB query) | User creation writes to DB |
| `POST /api/users` with duplicate email → 409 | Automated (unit test or curl) | Duplicate email returns clear error |
| `POST /api/users` as rep session → 403 | Hybrid (curl with rep session cookie) | Manager-only guard enforced |
| `POST /api/users` with missing name → 400 | Automated (curl) | `userFormSchema` validation enforced |
| Welcome email HTML visually correct (Veent palette, button, expiry note) | Agent-Probe (HTML preview) | Template matches design spec |
| Login email HTML visually correct and distinct from welcome | Agent-Probe (HTML preview) | Both templates on-brand and distinct |
| Team page: add user → row appears in table immediately | Manual (browser) | `invalidateAll()` still triggers reload |
| Team page: duplicate email → form error, no crash | Manual (browser) | 409 handled gracefully in UI |
| `bun run check` passes | Fully-Automated | Zero TypeScript errors |
| `bun run test:unit:ci` passes (62 existing tests) | Fully-Automated | No regressions in existing unit tests |

---

## Test Infra Improvement Notes

(none identified yet — updated during EVL if test infrastructure gaps are found)

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/team/active/team-invite_30-06-26/team-invite_PLAN_30-06-26.md`
2. **Last completed phase:** (none — ⏳ PLANNED)
3. **Validate-contract status:** pending — vc-validate-agent writes this before EXECUTE
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - `src/lib/server/auth.ts` — BA magic link plugin wiring
   - `src/lib/server/email.ts` — Resend `sendEmail()` pattern
   - `src/lib/server/db/leads.ts` — `dbUserToUser` + Drizzle pattern
   - `src/lib/styles/tokens.css` — design tokens for email templates
   - `src/routes/team/+page.svelte` — current `addRep()` implementation
   - `src/routes/team/+page.server.ts` — current team load function
   - `src/lib/zod/schemas.ts` — `userFormSchema`
5. **Next step for fresh executor:** Read this plan top-to-bottom. Grep `auth.api` usages in the
   codebase to confirm the correct method name for programmatic magic-link issuance. Then execute
   Phase 1 checklist items in order. After Phase 1, run `bun run check` before moving to Phase 2.

**Key risk to confirm before EXECUTE:** verify `auth.api.signInMagicLink` is the correct call.
Run: `grep -r "auth\.api\." src/ | head -20` and check Better Auth version in `package.json`.

---

## Validate Contract

Status: CONDITIONAL
Date: 30-06-26
date: 2026-06-30
generated-by: inner-pvl: phase-1

Parallel strategy: sequential
Rationale: EXECUTE signal score 3/7 (S2 API/auth surface, S6 auth/identity high-risk class, S7 5 files). Strictly-ordered 3-phase sequence on 5 files in one package — sequential is the correct fit despite MEDIUM band. One vc-execute-agent (opus).

Test gates (C3 5-column table — additive; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-check | New files type-check; templates return `{subject, html}` | Fully-Automated | `bun run check` exits 0 | A |
| AC-regress | 62 existing unit tests still pass | Fully-Automated | `bun run test:unit:ci` exits 0 | A |
| AC-tmpl | `welcomeEmail`/`loginEmail` return non-empty branded HTML containing the CTA url + `#c0362c` | Fully-Automated | NEW `src/tests/email-templates.spec.ts` asserts both functions return html with url + palette color + expiry note | B |
| AC-create | `POST /api/users` valid body → 201 + `crm_users` row | Hybrid | `curl -X POST /api/users` (manager session) then `SELECT * FROM crm_users WHERE email=…` — precondition: dev server + Postgres | A |
| AC-dup | Duplicate email → 409 `{error:'email_taken'}` via pg `23505` | Hybrid | `curl` same email twice — precondition: dev server + Postgres | A |
| AC-400 | Missing name/invalid email → 400 | Hybrid | `curl` invalid body — precondition: dev server | A |
| AC-403 | `POST /api/users` as rep session → 403 | Agent-Probe | Manual: needs a real rep session; `DEV_BYPASS=true` injects a fake manager so a rep session cannot be simulated locally | D |
| AC-login-regress | Normal `/login` sign-in still sends `loginEmail` (not broken by sendMagicLink edit) | Agent-Probe | Manual: trigger sign-in from `/login`, confirm console/dev log shows the loginEmail template, distinct from welcome | D |
| AC-tmpl-visual | Welcome + login email HTML render on-brand (palette, button, mobile ≤600px, expiry note) | Agent-Probe | Paste rendered html into an HTML previewer / Mailhog; compare to design spec | C |
| AC-ui-add | `/team` modal add → row appears immediately (invalidateAll) | Agent-Probe | Manual: browser add-user flow | C |
| AC-ui-dup | `/team` duplicate email → form error, no crash | Agent-Probe | Manual: browser, add existing email | C |

gap-resolution legend: A — proven now; B — fixed in this plan (gate added by checklist); C — deferred to a named later phase/plan; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the strategy column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — residual rows are carried via gap-resolution D.

Legacy line form (retained so existing consumers still parse):
- type-check: Fully-automated: `bun run check`
- regression: Fully-automated: `bun run test:unit:ci`
- email templates: Fully-automated: `bun run test:unit:ci` (after adding `src/tests/email-templates.spec.ts`)
- API create/dup/400: hybrid: `curl -X POST /api/users` + DB query — precondition: dev server + Postgres
- manager-guard 403: agent-probe: cannot simulate rep session under DEV_BYPASS — known-gap
- login regression: agent-probe: manual `/login` sign-in, confirm loginEmail still fires
- email visual: agent-probe: HTML previewer / Mailhog visual review

Dimension findings:
- Infra fit: PASS — SvelteKit route conventions correct; new route `src/routes/api/users/+server.ts` has no collision with Better Auth (`/api/auth/[...all]`); no container/port surface; `$lib` imports resolve.
- Test coverage: CONCERN — gate command corrected to `bun run test:unit:ci` (plain `test:unit` is vitest watch mode and never exits); manager-guard 403 and login-regression have no automated coverage (DEV_BYPASS + no DB harness).
- Breaking changes: CONCERN — `auth.ts` `sendMagicLink` edit affects EVERY sign-in email, not just welcomes; no automated regression gate proves the normal `/login` path still sends `loginEmail`. No public-contract break (`POST /api/users` is new; `sendEmail({to,subject,html})` unchanged; no schema migration).
- Security surface: PASS — `POST /api/users` is manager-only (`locals.user.role === 'manager'` → 403); Zod-validated; magic-link token issuance still owned by Better Auth. Low note: an authenticated manager can trigger magic-link emails to arbitrary addresses (by-design invite flow; acceptable for internal v0).
- Phase 1 feasibility: PASS — edit targets exist; `crm_users_email_uq` unique index confirmed (schema:107); `dbUserToUser` accepts `crmUsers.$inferSelect`; `auth.api.signInMagicLink({ body:{ email, callbackURL } })` confirmed in better-auth 1.6.20 (`dist/plugins/magic-link/index.d.mts:93`).
- Phase 2 feasibility: CONCERN — keep `email-templates.ts` import-pure (no `auth.ts`/`db` import) so no circular import; name lookup for personalization stays inside `auth.ts`'s `sendMagicLink` callback. Doc inconsistency (Assumptions) corrected to name `email-templates.ts` as the Set's home.
- Phase 3 feasibility: PASS — `addRep()`, `toasts.success`, and modal subtitle edit targets all present in `src/routes/team/+page.svelte`; `+page.server.ts` already reads real DB via `dbUserToUser` (no change needed).

Open gaps:
- Manager-guard 403: known-gap: cannot simulate a rep session under `DEV_BYPASS=true`; verify manually when real sessions land (auth feature) — backlog test-building stub.
- Login-email regression: known-gap: no automated proof the normal `/login` path still sends `loginEmail` after the `sendMagicLink` edit; manual probe required this cycle — backlog test-building stub.

What this coverage does NOT prove:
- `bun run check`: proves types compile — does NOT prove runtime behavior, DB writes, or email delivery.
- `bun run test:unit:ci`: proves the 62 existing tests + (new) template unit test pass — does NOT prove the API endpoint, DB insert, 409 mapping, or session guards (no DB/session harness in unit tests).
- `src/tests/email-templates.spec.ts` (to be added): proves template functions return branded html with url/palette/expiry — does NOT prove the email actually renders correctly in real mail clients (that is the agent-probe visual gate).
- Hybrid curl + DB gates: prove the happy path + 409 + 400 against a live dev server — do NOT prove the rep→403 guard (DEV_BYPASS blocks simulating a rep) and do NOT run in CI.
- Agent-probe visual gates: prove on-brand rendering by human/agent judgment — do NOT mechanically assert pixel/markup correctness.

Execute-agent instructions:
- E1: Keep `src/lib/server/email-templates.ts` free of imports from `auth.ts` and `db` — export only `pendingWelcomeEmails`, `welcomeEmail`, `loginEmail`. The crm_users name lookup for personalization belongs in `auth.ts`'s `sendMagicLink` callback. This guarantees no circular import.
- E2: Call the endpoint as `(await getAuth()).api.signInMagicLink({ body: { email, callbackURL: '/' } })` (server-side `api` call shape; matches better-auth 1.6.20). Wrap in try/catch — on failure `console.error` and still return 201 (welcome-email failure must NOT roll back user creation).
- E3: After Phase 2, ADD `src/tests/email-templates.spec.ts` asserting `welcomeEmail`/`loginEmail` return html containing the CTA url, `#c0362c`, and the expiry note. This closes the only cheap automated coverage gap for the new code (gap-resolution B).
- E4: Use `bun run test:unit:ci` (NOT `bun run test:unit`) for every gate — plain `test:unit` is vitest watch mode and will hang the run.
- E5: Manually verify the login-email regression: after the `sendMagicLink` edit, trigger a normal `/login` sign-in and confirm the dev console/log shows the `loginEmail` template (distinct from welcome). Record the observation in the phase report.

Gate: CONDITIONAL (3 CONCERNs, accepted on record; 0 FAILs)
Accepted by: session (orchestrator directive: "write the Validate Contract when Gate: PASS or Gate: CONDITIONAL is reached") — accepted concerns: (1) test-gate command corrected to `test:unit:ci`; (2) `sendMagicLink` affects all sign-ins, login-email regression manual-only this cycle; (3) manager-guard 403 not testable under DEV_BYPASS.

## Autonomous Goal Block

```
SESSION GOAL: Team Invite — magic-link welcome email + real POST /api/users (feature: team)
Charter + umbrella plan: N/A — single SIMPLE plan (process/features/team/active/team-invite_30-06-26/team-invite_PLAN_30-06-26.md)
Autonomy: standing EXECUTE consent for this plan only; reversible edits auto-proceed; surface hard stops (per feedback_autonomous_phase_execution.md / orchestration.md §Autonomy Mode)
Hard stop conditions / safety constraints:
- Do NOT roll back user creation on email-send failure — log and still return 201 (welcome email is best-effort)
- Do NOT modify Better Auth tables or token issuance — BA still owns the magic-link flow
- Do NOT remove the manager-only guard on POST /api/users (403 for non-managers)
- Keep email-templates.ts import-pure (no auth.ts/db import) to avoid circular imports
- No schema migration in this plan — crm_users columns are used as-is
Next phase: EXECUTE — process/features/team/active/team-invite_30-06-26/team-invite_PLAN_30-06-26.md (Phase 1 → 2 → 3, strictly in order)
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL)
Execute start: bun run check | bun run test:unit:ci | add src/tests/email-templates.spec.ts | curl POST /api/users (manager) + SELECT crm_users | high-risk pack: no (auth-adjacent but BA owns token issuance; manual login-regression probe required)
```


---

## Cursor + RIPER-5 Guidance

- **Cursor Plan mode:** Import the Implementation Checklist. Execute phase by phase; run `bun run check` after each phase before continuing.
- **RIPER-5:** This plan is output of PLAN phase. Next: `ENTER VALIDATE MODE` → vc-validate-agent writes the Validate Contract → `ENTER EXECUTE MODE`.
- **After each phase:** stop, run the verification steps listed in Execution Brief, confirm before proceeding.
- **If scope expands mid-EXECUTE** (e.g., BA method name differs): pause, update this plan, re-validate the new approach.
