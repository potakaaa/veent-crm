---
name: context:root
description: Root context router for veent-crm — read first before any substantial task
metadata:
  node_type: root
  type: context
  read_order: 1
  required: true
  read_when: any substantial planning, research, review, or implementation task
---

# veent-crm - All Context

Last updated: 2026-07-08

This file is the root context entrypoint for the repo.

Use it for two things:

1. Quick routing to the right context pack or root file
2. Broad architecture and repository understanding

Start here before loading deeper context files.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick router for that domain. This root file (`all-context.md`) is the top-level router. Context groups each have their own `all-{group}.md` entrypoint.

**The pattern:**

```
process/context/
  all-context.md                      <-- THIS FILE: root router
  planning/
    all-planning.md                   <-- group router for planning
  tests/
    all-tests.md                      <-- group router for tests
```

**How agents use it:**

1. Agent reads `all-context.md` first (this file)
2. Finds the relevant context group from the routing tables below
3. Reads that group's `all-{group}.md` entrypoint
4. Only then loads the specific deep doc needed

---

## Quick Start

For most substantial tasks:

1. Read this file first
2. Choose the smallest relevant root file or context group from the tables below
3. Only then load deeper files

---

## Current Root Entry Points

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/planning/all-planning.md` | creating a new plan, calibrating SIMPLE vs COMPLEX plan shape, or checking planning conventions |
| `process/context/tests/all-tests.md` | task involves testing, verification, running tests, or debugging test failures |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `planning/` | `process/context/planning/all-planning.md` | Plan shape calibration and planning conventions for veent-crm |
| `tests/` | `process/context/tests/all-tests.md` | Test runner selection, commands, and verification guide for veent-crm |
<!-- /GENERATED:routing -->

## Task Routing Table

| If the task involves...                 | Start with                                        |
| --------------------------------------- | ------------------------------------------------- |
| architecture or stack questions         | this file                                         |
| testing or verification                 | `process/context/tests/all-tests.md`              |
| creating a new plan                     | `process/context/planning/all-planning.md`        |
| auth / Better Auth wiring               | this file + `process/features/auth/_GUIDE.md`     |
| leads CRUD, pipeline, stage transitions | this file + relevant feature `_GUIDE.md`          |
| DB schema changes (Drizzle)             | this file — see Key Patterns §Drizzle conventions |
| import / ingest pipeline                | `process/features/import/_GUIDE.md`               |
| reminders / n8n                         | `process/features/reminders/_GUIDE.md`            |
| reports / layerchart charts              | `process/features/reports/_GUIDE.md`              |
| calendar (meetings + follow-ups grid)   | `process/features/calendar/_GUIDE.md`              |
| CalDAV / Nextcloud integration          | this file — see §CalDAV conventions + `src/lib/caldav/` |

## Feature Folders

| Feature   | Guide                                  | Status                                   |
| --------- | -------------------------------------- | ---------------------------------------- |
| auth      | `process/features/auth/_GUIDE.md`      | not-started (v0 stub, DEV_BYPASS active) |
| leads     | `process/features/leads/_GUIDE.md`     | in-progress (leads list, lead detail, lead creation, and Up for Grabs query the real DB via `src/lib/server/db/leads.ts`; Review Queue removed 01-07-26; recurring-organizer "Has future events" flag — `has_future_events` column, badge on list/detail, edit checkbox, /leads filter toggle — live 02-07-26, badge/checkbox rendering pending shared e2e auth fixture) |
| pipeline  | `process/features/pipeline/_GUIDE.md`  | in-progress (`/pipeline` also queries the real DB via `src/lib/server/db/leads.ts`; PIPE-3 client-side search filter code-complete, EVL green 07-07-26 — `listPipelineStage` now left-joins `crm_organizers`, pure `matchesQuery` predicate fully-automated-tested; DOM render/`?q=` URL-sync known-gap pending shared Playwright auth fixture, plan stays active — **superseded 07-07-26** by the server-reach follow-up below. PIPE-3 follow-up (`pipeline-search-server-reach_07-07-26`, 07-07-26): search now also reaches unloaded/unscrolled leads via a server-side 3-field escaped-ILIKE path (`buildPipelineStageWhereClause` gained optional `search?`), composes as AND with `?rep=`; also fixed a pre-existing latent bug where the lazy-load endpoint's stage allow-list omitted `'live'`. All Fully-Automated gates green, EVL confirmed clean (no fix cycles); same DOM/e2e known-gap, plan stays active. PIPE-4 Section A (manager AE filter, `?rep=` persistence, role-gated re-query) code-complete + EVL-confirmed 07-07-26 — `resolvePipelineRepFilter` + `buildPipelineStageWhereClause` both Fully-Automated; dropdown-render/`?rep=`-persistence e2e is a known-gap pending the same shared auth fixture; Section B (per-AE color-coding) BLOCKED on Jela's palette decision, not started; plan stays active) |
| import    | `process/features/import/_GUIDE.md`    | not-started (stub pipeline)              |
| reminders | `process/features/reminders/_GUIDE.md` | in-progress (code-complete, EVL green; /reminders now shows four sections: overdue, due today, upcoming 7 days, going cold — `getRemindersQueue` returns `{ overdue, due, upcoming, cold }` — EVL green 03-07-26; AC1–AC5 render/snooze verification pending manual gates) |
| reports   | `process/features/reports/_GUIDE.md`   | in-progress (real-DB-backed via Drizzle `reports/+page.server.ts`; `layerchart` charts) |
| calendar  | `process/features/calendar/completed/calendar_01-07-26/` | calendar grid (meetings + follow-ups): code-complete, EVL green; e2e written but self-skipping pending shared auth e2e harness (2 known-gaps, pre-accepted). NCAL-1 CalDAV reader (`src/lib/caldav/*`) + `GET /api/calendar/events`: ✅ VERIFIED 2026-07-08 — live Nextcloud round-trip confirmed; 360 tests green; plan at `process/features/calendar/completed/ncal-1-caldav-reader_08-07-26/`; known-gap for live CI harness in `backlog/caldav-live-harness_NOTE_08-07-26.md` |
| manager-dashboard | `process/features/manager-dashboard/_GUIDE.md` | in-progress (GitHub #244/DASH-1 — manager/super-manager-only `/dashboard`; 6 per-AE aggregation queries in `src/lib/server/db/dashboard.ts`, new `range-bucket-control` filter component, gate mirrors `/team`. EVL-confirmed 07-07-26: gate test PASS 5/5, typecheck PASS, scoped lint clean. Known gaps: Hybrid DB aggregation test self-skips — no live Postgres in this env, needs a live-DB CI harness run before full sign-off; AC5 e2e click-through is the pre-accepted shared-auth-fixture known-gap (same as calendar/reminders); repo-wide pre-existing prettier drift in 7 unrelated files flagged, see `process/general-plans/backlog/lint-drift-pre-existing-files_07-07-26_NOTE.md`) |
| calendar  | `process/features/calendar/_GUIDE.md` | code-complete (CAL-1 base grid + CAL-3 owner filter), EVL green; CAL-3: reps scoped to own leads, managers get `?repId` combobox — `getFollowUpsInRange`/`getGoLiveDatesInRange`/`getEventDatesInRange` now accept `role` + optional `filterRepId`; meetings always team-wide; e2e self-skipping pending shared auth fixture (known-gaps pre-accepted) |
| ux-enhancement | `process/features/ux-enhancement/completed/sitewide-ux-refresh_02-07-26/` + `process/features/ux-enhancement/completed/unified-filter-components_06-07-26/` + `process/features/ux-enhancement/completed/combobox-suggest-freetext_07-07-26/` | code-complete, EVL-confirmed across all 5 phases of `sitewide-ux-refresh_02-07-26` (program COMPLETE 02-07-26) — mobile nav drawer + design tokens (`--color-nav-*`/`--color-focus-ring`/`--shadow-nav-*`), consolidated Leads/UFG grid + date-picker + hover-popover, keyboard-accessible pipeline stage change, responsive Pipeline/Calendar/Reports, shared per-field form-error component, shared `Tabs.svelte` + chip token contract, Reminders/Today snooze parity, program-wide ARIA sweep. **Follow-on `unified-filter-components_06-07-26` (EVL-confirmed 06-07-26)** unified the duplicated search/filter/week-range toolbar UI across Up for Grabs/My Leads/Reports/Reminders into 3 shared components now in `src/lib/components/ui/`: `filter-dropdown/` (generalized `MultiSelectFilter` behind a `multiple` prop), `search-input/` (canonical 300ms debounce), `week-range-control/` (new `role="radiogroup"` component, not a `Tabs.svelte` reuse). `src/lib/components/leads/MultiSelectFilter.svelte` is retired (deleted, zero remaining references). **Follow-on `combobox-suggest-freetext_07-07-26` (GitHub #250, EVL-confirmed 07-07-26)** added a new shared `src/lib/components/ui/combobox-freetext/ComboboxFreetext.svelte` ("suggest but never block" free-text input, two modes: free-text-only and suggestion-mode with 300ms debounce + latest-wins race guard + explicit ARIA combobox semantics/keyboard nav) — wired as Organizer Name suggestions at 3 entry points (`leads/new`, `LeadEditModal`, `leads/[id]/edit`) via `src/lib/utils/organizer-suggest.ts` (reuses live `GET /api/organizers?q=`), and a brand-new persisted **Meeting Venue** free-text field on `MeetingFormModal.svelte` backed by a new nullable `crm_meetings.venue text` column (migration `drizzle/0026_careless_captain_britain.sql` — additive, generated but NOT applied to any live DB in this env; deploy-time step). `LeadCombobox.svelte`/`OrganizerCombobox.svelte` (id-only pickers) confirmed byte-for-byte unchanged (AC6). Known-gaps (all three plans, same root causes, none new): shared Playwright auth-fixture (pre-existing, blocks most e2e proof — `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`), `@axe-core/playwright` devDependency decision (open — `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`), nested-worktree Playwright env blocker (open), Svelte component-test harness decision for `ComboboxFreetext` render/click coverage (open — `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`), live-DB CI harness for migration `0026` apply-and-query (pre-accepted, same class as manager-dashboard/calendar) — see each program's own `*_CLOSEOUT_*.md`/`*_REPORT_*.md` for full SPEC scoring and known-gaps detail |

---

## Repository Structure

```
veent-crm/
  src/
    hooks.server.ts            # session gate — real Better Auth session + crm_users allowlist check
    app.d.ts                   # TypeScript locals augmentation (user: SessionUser | null)
    app.html                   # HTML shell
    lib/
      assets/favicon.svg
      components/
        StubNote.svelte        # visual stub indicator (remove as surfaces go live)
      data/
        templates.ts            # static Log Touch snippet templates + fillTemplate() helper
      index.ts
      server/
        auth.ts                # Better Auth stub (getSession + sendMagicLink placeholders)
        db/
          index.ts             # Drizzle client (lazy postgres-js pool, max 10)
          schema.ts            # Full CRM schema — source of truth for all tables
        email.ts               # Resend stub
        mock.ts                # Placeholder data behind every surface (keep isolated)
        reminders.ts           # Reminder logic stub
        sentry.ts              # Sentry init stub
      caldav/
        constants.ts           # Env-driven CalDAV URL builder (`calendarCollectionUrl()`) + `basicAuthHeader()`
        reader.ts              # `fetchCalendarReport({ start, end })` — sends REPORT request; extracts `.ics` blobs via fast-xml-parser; throws `CalDavError` on non-2xx
        parser.ts              # `parseIcsToEvents(ics, { start, end })` — ical.js + rrule; ATTACH/SOUND stripped; RRULE DST-safe via ical.js RecurExpansion
      zod/
        schemas.ts             # Zod validators (forms + import/ingest)
    routes/
      +layout.server.ts        # App shell load (passes user to all routes)
      +layout.svelte           # Nav + global layout
      +page.server.ts          # Today / daily loop home
      +page.svelte
      +error.svelte            # Global branded error page (404 + generic; chrome-less, outside layout)
      login/+page.svelte       # Magic-link login page
      unauthorized/
        +page.server.ts        # Sanitizes ?from= param (same-origin relative paths only)
        +page.svelte           # Branded "Access restricted" page; sign-in CTA → /login
      leads/
        +page.server.ts        # Leads list
        +page.svelte
        new/+page.svelte       # Lead creation
        [id]/
          +page.server.ts      # Lead detail
          +page.svelte
      pipeline/
        +page.server.ts        # Pipeline Kanban/list
        +page.svelte
      unassigned/
        +page.server.ts        # Unassigned leads queue (claim flow)
        +page.svelte
      review/
        +page.server.ts        # Needs-review queue (needs_review=true leads)
        +page.svelte
      reminders/+page.svelte   # Follow-up reminders list
      reports/
        +page.server.ts        # Analytics / layerchart charts
        +page.svelte
      calendar/
        +page.server.ts        # Month/week grid: team meetings + owner-scoped follow-ups
        +page.svelte
      meetings/
        [id]/
          +page.server.ts      # Meeting detail (read-first; Edit opens MeetingFormModal)
          +page.svelte
      team/
        +page.server.ts        # Team management
        +page.svelte
      health/+server.ts        # Liveness probe (no auth required)
      api/
        reminders/due/+server.ts    # Secret-authed endpoint polled by n8n
        leads/ingest/+server.ts     # Secret-authed scraper ingest
        calendar/events/+server.ts  # Session-gated GET — reads Nextcloud CalDAV via src/lib/caldav/, returns CalendarEvent[] JSON
      layout.css               # Global CSS (Tailwind imports)
    tests/
      schemas.spec.ts          # Vitest schema tests
  scripts/
    import.ts                  # One-time TSV importer (stub pipeline)
  drizzle/                     # Generated Drizzle migrations
  process/
    context/                   # This context system
    general-plans/             # Cross-feature plans
    features/                  # Feature-scoped storage
    development-protocols/     # RIPER-5 methodology docs
  Dockerfile
  docker-compose.yml           # app + postgres + caddy services
  Caddyfile
  drizzle.config.ts
  vite.config.ts
  playwright.config.ts
  package.json
  bun.lock
```

---

## Technology Stack

- **Framework:** SvelteKit 2 with Svelte 5 (SSR, `+page.server.ts` pattern)
- **Language:** TypeScript 6.x (strict mode)
- **Runtime:** Bun (primary), Node fallback via `@sveltejs/adapter-node`
- **Adapter:** `svelte-adapter-bun` (primary), `@sveltejs/adapter-node` (fallback)
- **Database:** PostgreSQL via Drizzle ORM 0.45.x + `postgres` 3.x (postgres-js)
- **Schema migration:** drizzle-kit 0.31.x (`bun run db:push` / `db:generate` / `db:migrate`)
- **Auth:** Better Auth 1.6.x — magic-link plugin + Resend email (live-wired)
- **Forms:** Zod 4.x schemas (`src/lib/zod/schemas.ts`) + client `safeParse()` + `fetch()` — Superforms 2.x is installed but unusable (`typebox@1.3.0` conflict breaks `sveltekit-superforms/adapters`); see Key Patterns §Mandatory conventions
- **UI:** Tailwind CSS 4.x + `@tailwindcss/forms` + `@tailwindcss/typography`
- **Charts:** `layerchart` 2.0.0-next.48 (shadcn-svelte chart primitives — bar/line/pie/area; reports page). ECharts is NOT installed — do not assume it is present.
- **CalDAV / ICS parsing:** `ical.js` 2.x (iCalendar parse via `ICAL.parse`/`ICAL.Component`/`ICAL.Event` + `RecurExpansion` — ships own TS types), `rrule` (RRULE recurrence expansion; used for bounded window expansion when not using ical.js native RecurExpansion), `fast-xml-parser` (CalDAV multistatus XML extraction — server-only; NOT `DOMParser` which is undefined in Node/Vercel runtime)
- **Email:** Resend 6.x (magic-link delivery — live; real Resend client in `src/lib/server/email.ts`, `RESEND_API_KEY`/`RESEND_FROM`)
- **Error tracking:** Sentry 10.x (`@sentry/sveltekit` — stubbed)
- **Testing:** Vitest 4.x (unit) + Playwright 1.60.x (e2e)
- **Package manager:** Bun (lockfile: `bun.lock`)
- **Deployment:** Docker Compose (app + PostgreSQL + Caddy) — single-server target (TBD)

---

## Key Patterns and Conventions

### Mandatory conventions (agents must follow)

**Svelte 5 runes only** — use `$state`, `$derived`, `$effect`. No Svelte 4 `writable()`/`readable()` stores.

**Server-side DB access only** — all Drizzle queries go inside `+page.server.ts` or API route handlers (`+server.ts`). Never import `db` from client-side code (`.svelte` files without `<script context="module">` or `lang="ts"` server-only pattern).

**Client `safeParse()` + `fetch()` for forms (not Superforms)** — despite the package being installed, `sveltekit-superforms/adapters` is unusably broken in this repo (a `typebox@1.3.0` transitive-dependency conflict throws at import time — confirmed via direct test run during `sitewide-ux-refresh` Phase 4). Zero real `superForm()` usage exists anywhere in `src/`. The actual, consistent idiom across every form (`templates`, `team`, `leads/new`, `MeetingFormModal`) is: client-side `schema.safeParse()` from `src/lib/zod/schemas.ts`, then a raw `fetch()` POST, with per-field errors rendered via the shared `FieldError` component (`src/lib/components/ui/field-error/`) using `aria-invalid`/`aria-describedby`. No raw unvalidated `FormData` handling. (Doc corrected 02-07-26 — see `process/features/ux-enhancement/backlog/superforms-convention-doc-drift_NOTE_02-07-26.md` for the full investigation; that note's Status should be treated as Resolved once this edit lands.)

**Soft-delete only** — records are never hard-deleted. Use `deletedAt: timestamp` on `crm_leads`. Always filter `WHERE deleted_at IS NULL` in queries.

**Mock data isolation** — `src/lib/server/mock.ts` is stub-only. Real Drizzle queries must never import from or depend on `mock.ts`.

### Drizzle conventions

- Table naming: snake*case, prefixed with `crm*`(e.g.,`crm_leads`, `crm_activities`)
- All PKs: `uuid().primaryKey().defaultRandom()`
- All tables: `createdAt` + `updatedAt` timestamps with timezone
- **Never write Drizzle migrations for Better Auth tables** (`user`, `account`, `session`, `verification`) — those are managed by Better Auth's own migration system
- **Before running `bun run db:generate`**, confirm `drizzle/meta/_journal.json`'s last `idx` matches the highest-numbered `.sql` file in `drizzle/` by filename, AND scan `drizzle/` for duplicate-prefix or stray files — multiple `.sql` files sharing one numeric prefix (e.g. two `0015_*.sql`), or any `.sql` file not represented by an `idx` entry in the journal. A mismatch means an earlier commit added a migration file without registering it, or two branches independently claimed the same `idx` (known instances: `drizzle/0014_agreements_fields.sql` and a merge-time `idx: 15` collision — see `process/general-plans/backlog/drizzle-migration-journal-drift_02-07-26.md`) — flag and reconcile before layering a new migration on top of untracked drift

### SvelteKit conventions

- Import alias: `$lib` → `src/lib/` (SvelteKit default)
- Private env vars: `import { env } from '$env/dynamic/private'` (no `process.env`)
- Public env vars: `import { env } from '$env/dynamic/public'`
- Locals type: `app.d.ts` declares `interface Locals { user: SessionUser | null }`

### Auth / session conventions

- Better Auth is live-wired in `src/lib/server/auth.ts` (real `betterAuth()` config: `drizzleAdapter` + `magicLink` plugin + Resend email delivery via `email.ts`). `hooks.server.ts` has no `DEV_BYPASS` reference — that stub was removed.
- Public routes (no auth required): `/login`, `/unauthorized`, `/health`, `/api/reminders/due`, `/api/reminders/notify`, `/api/leads/ingest`, `/api/auth`
- `/api/reminders/due` and `/api/leads/ingest` use secret-based auth (not session-based)
- Unauthenticated hits on protected routes split into two branches: no Better Auth session at all → `/login?from=[encoded-path]`; session exists but the email has no active `crm_users` allowlist row → `/unauthorized?from=[encoded-path]`. The `from` param is sanitized server-side via the shared `sanitizeFrom` helper (`src/lib/server/sanitize-redirect.ts`, used by both `/login` and `/unauthorized`) — only same-origin relative paths (single leading `/`) pass through; off-origin and scheme-containing values are stripped to `null`.
- `src/routes/+error.svelte` is the global SvelteKit error page (404 + generic errors). It renders outside the layout tree — chrome-less by default, no bare-mode edit needed.

### CalDAV conventions

- `src/lib/caldav/` is server-only — never imported from `.svelte` files.
- `NEXTCLOUD_URL` already contains `https://`; never prepend a scheme. `NEXTCLOUD_CALENDAR_SLUG` is pre-encoded; never re-`encodeURIComponent`.
- Multistatus XML (`207`) parsed with `fast-xml-parser`; `DOMParser` is undefined in the Node/Vercel runtime.
- `fetch` global supports the WebDAV `REPORT` method (not on the Fetch forbidden-method list) — confirmed against live Nextcloud.
- Nextcloud `401` (bad app password) → throw `CalDavError`; endpoint maps it to `503` generic. Credentials/upstream status MUST NOT reach the client or logs.
- Format CalDAV `time-range` from parsed `Date` objects (`YYYYMMDDTHHMMSSZ`), never from raw query string values (XML-injection guard).
- RRULE expansion: use ical.js native `RecurExpansion` (honors `VTIMEZONE`) or convert `DTSTART` to UTC before `rrule` — a naive mix produces wrong instants across DST.
- ICS fixture files live in `src/tests/fixtures/*.ics`; reuse them for future NCAL phases.
- Default date window (when `?start`/`?end` absent): current-month `[first-of-month 00:00:00Z, first-of-next-month 00:00:00Z)`.

### Audit trail

- All stage changes, owner changes, deal value changes write a row to `crm_lead_history`
- `field` column names the changed field; `oldValue`/`newValue` are stringified

---

## Environment and Configuration

**Config files:** `drizzle.config.ts`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `.env` (git-ignored)

**Env var groups (names only — never values):**

- Database: `DATABASE_URL`
- API secrets: `INGEST_SECRET` (scraper ingest endpoint), `REMINDERS_ENDPOINT_SECRET` (n8n reminders)
- Email: `RESEND_API_KEY`
- Error tracking: `SENTRY_DSN`
- Better Auth (TBD when wired): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- CalDAV / Nextcloud: `NEXTCLOUD_URL` (includes `https://` scheme — do NOT prepend scheme), `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD`, `NEXTCLOUD_CALENDAR_SLUG` (pre-encoded slug — do NOT re-`encodeURIComponent`)

---

## Current Project State (v0 → v1)

**Current state (as of 08-07-26):** Better Auth (magic-link + `crm_users` allowlist) is live-wired in `hooks.server.ts` — `DEV_BYPASS` no longer exists. Leads, pipeline, meetings, reminders, calendar, and reports all query the real DB via Drizzle (reports via `reports/+page.server.ts`). Resend email is live-wired. No real Sentry yet (accepted known-gap). CalDAV read client (`src/lib/caldav/`) + `GET /api/calendar/events` live-wired to Nextcloud — NCAL-1 VERIFIED 08-07-26.

**Remaining v1 work (in priority order):**

1. Shared Playwright authenticated-session fixture — currently blocks e2e verification for 2+ features (see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`)
2. Live-DB CI harness for Hybrid-tier test gates (several features carry pre-accepted known-gaps for this)

---

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- A topic has 3+ durable docs
- A single doc exceeds roughly 800 lines with separable subtopics
- Multiple agents repeatedly need only one slice of a large context file
- The topic maps to a stable operational domain (tests, infra, database, auth, UI, etc.)

Do not create a group when:

- The content is a temporary report
- The content is a plan or execution artifact
- The topic is feature-specific and belongs in `process/features/...`

Move or split one group at a time. Use `all-{group}.md` entrypoints. Run the `audit-context` skill after every context organization change.

---

## Scan Metadata

- Generated: 2026-06-25
- HEAD: 07053eb
- Mode: setup (Flow A — new project)
- Package manager: Bun
