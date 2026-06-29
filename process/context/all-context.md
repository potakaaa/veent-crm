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

Last updated: 2026-06-25

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

| File                                       | Read when                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `process/context/all-context.md`           | any substantial planning, research, review, or implementation task                              |
| `process/context/planning/all-planning.md` | creating a new plan, calibrating SIMPLE vs COMPLEX plan shape, or checking planning conventions |
| `process/context/tests/all-tests.md`       | task involves testing, verification, running tests, or debugging test failures                  |

## Current Context Groups

| Group       | Entry point                                | Scope                                                                 |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `planning/` | `process/context/planning/all-planning.md` | Plan shape calibration and planning conventions for veent-crm         |
| `tests/`    | `process/context/tests/all-tests.md`       | Test runner selection, commands, and verification guide for veent-crm |

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
| reports / ECharts                       | `process/features/reports/_GUIDE.md`              |

## Feature Folders

| Feature   | Guide                                  | Status                                   |
| --------- | -------------------------------------- | ---------------------------------------- |
| auth      | `process/features/auth/_GUIDE.md`      | not-started (v0 stub, DEV_BYPASS active) |
| leads     | `process/features/leads/_GUIDE.md`     | not-started (mock data only)             |
| pipeline  | `process/features/pipeline/_GUIDE.md`  | not-started (mock data only)             |
| import    | `process/features/import/_GUIDE.md`    | not-started (stub pipeline)              |
| reminders | `process/features/reminders/_GUIDE.md` | not-started (stub)                       |
| reports   | `process/features/reports/_GUIDE.md`   | not-started (mock data only)             |

---

## Repository Structure

```
veent-crm/
  src/
    hooks.server.ts            # session gate (DEV_BYPASS stub — injects fake manager)
    app.d.ts                   # TypeScript locals augmentation (user: SessionUser | null)
    app.html                   # HTML shell
    lib/
      assets/favicon.svg
      components/
        StubNote.svelte        # visual stub indicator (remove as surfaces go live)
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
      zod/
        schemas.ts             # Zod validators (forms + import/ingest)
    routes/
      +layout.server.ts        # App shell load (passes user to all routes)
      +layout.svelte           # Nav + global layout
      +page.server.ts          # Today / daily loop home
      +page.svelte
      login/+page.svelte       # Magic-link login page
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
        +page.server.ts        # Analytics / ECharts
        +page.svelte
      team/
        +page.server.ts        # Team management
        +page.svelte
      health/+server.ts        # Liveness probe (no auth required)
      api/
        reminders/due/+server.ts    # Secret-authed endpoint polled by n8n
        leads/ingest/+server.ts     # Secret-authed scraper ingest
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
- **Auth:** Better Auth 1.6.x — magic-link plugin + Resend email (currently stubbed)
- **Forms:** Superforms 2.x + Zod 4.x (all forms use this pattern — no raw FormData)
- **UI:** Tailwind CSS 4.x + `@tailwindcss/forms` + `@tailwindcss/typography`
- **Charts:** ECharts 6.x (reports page)
- **Email:** Resend 6.x (magic-link delivery — stubbed)
- **Error tracking:** Sentry 10.x (`@sentry/sveltekit` — stubbed)
- **Testing:** Vitest 4.x (unit) + Playwright 1.60.x (e2e)
- **Package manager:** Bun (lockfile: `bun.lock`)
- **Deployment:** Docker Compose (app + PostgreSQL + Caddy) — single-server target (TBD)

---

## Key Patterns and Conventions

### Mandatory conventions (agents must follow)

**Svelte 5 runes only** — use `$state`, `$derived`, `$effect`. No Svelte 4 `writable()`/`readable()` stores.

**Server-side DB access only** — all Drizzle queries go inside `+page.server.ts` or API route handlers (`+server.ts`). Never import `db` from client-side code (`.svelte` files without `<script context="module">` or `lang="ts"` server-only pattern).

**Superforms + Zod for all forms** — every form uses `superforms` with a Zod schema from `src/lib/zod/schemas.ts`. No raw `FormData` handling.

**Soft-delete only** — records are never hard-deleted. Use `deletedAt: timestamp` on `crm_leads`. Always filter `WHERE deleted_at IS NULL` in queries.

**Mock data isolation** — `src/lib/server/mock.ts` is stub-only. Real Drizzle queries must never import from or depend on `mock.ts`.

### Drizzle conventions

- Table naming: snake*case, prefixed with `crm*`(e.g.,`crm_leads`, `crm_activities`)
- All PKs: `uuid().primaryKey().defaultRandom()`
- All tables: `createdAt` + `updatedAt` timestamps with timezone
- **Never write Drizzle migrations for Better Auth tables** (`user`, `account`, `session`, `verification`) — those are managed by Better Auth's own migration system

### SvelteKit conventions

- Import alias: `$lib` → `src/lib/` (SvelteKit default)
- Private env vars: `import { env } from '$env/dynamic/private'` (no `process.env`)
- Public env vars: `import { env } from '$env/dynamic/public'`
- Locals type: `app.d.ts` declares `interface Locals { user: SessionUser | null }`

### Auth / session conventions (current v0)

- `DEV_BYPASS = true` in `hooks.server.ts` injects a fake manager — remove when Better Auth is wired
- Public routes (no auth required): `/login`, `/health`, `/api/reminders/due`, `/api/leads/ingest`
- `/api/reminders/due` and `/api/leads/ingest` use secret-based auth (not session-based)

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

---

## Current Project State (v0 → v1)

**v0 (current):** All 10 route surfaces render mock data from `src/lib/server/mock.ts`. Auth is bypassed via `DEV_BYPASS`. No real DB queries. No real email. No real Sentry.

**v1 target (in priority order):**

1. Better Auth magic-link login — real sessions replacing DEV_BYPASS
2. Full leads CRUD — Drizzle queries replacing all mock data (leads list, detail, create, unassigned, review)
3. Pipeline stage transitions — real DB writes + `crm_lead_history` audit trail
4. TSV import end-to-end, n8n reminders (`follow_up_at`), ECharts reports with real data

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
