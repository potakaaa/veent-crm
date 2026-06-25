# Veent Sales Outreach CRM (`veent-crm`)

Standalone SvelteKit + own PostgreSQL CRM that replaces the "Centralized List of Events" Google
Sheet. Find an event organizer (a FB/IG page), assign a rep, and track every outreach touch through
a pipeline to Won/Lost. **Completely standalone** — no reads/writes to any external system; its only
data ingress is a one-time TSV import. See [`../sales-crm.md`](../sales-crm.md) for the full spec.

> **Status: v0 skeleton.** Structure only — every surface renders mock data and all integrations
> (DB queries, Better Auth, Resend, Sentry, n8n) are **stubs/placeholders**. Nothing external is wired.

## Stack

Bun · SvelteKit 2 / Svelte 5 (SSR) · Tailwind CSS · Drizzle + drizzle-kit (PostgreSQL) ·
Superforms + Zod · Better Auth (magic link → Authentik later) · Resend · Sentry · ECharts ·
Vitest + Playwright · `svelte-adapter-bun` (adapter-node fallback) · Docker Compose (app + Postgres + Caddy).

## Develop

```sh
bun install
bun run dev          # http://localhost:5173 — boots with no live DB (lazy pool)
```

The dev session gate (`src/hooks.server.ts`) injects a fake manager so every surface is reachable;
flip `DEV_BYPASS = false` once Better Auth is wired.

## Useful scripts

```sh
bun run check        # svelte-check (types)
bun run test:unit    # Vitest (stub schema tests)
bun run db:generate  # regenerate Drizzle migration from schema (no DB needed)
bun run db:migrate   # apply migrations (needs a live Postgres)
bun run import -- --file <tsv> --dry-run   # one-time TSV importer (STUB pipeline)
```

## Layout

```
src/
  hooks.server.ts            # session gate (stub: injects dev manager)
  lib/
    zod/schemas.ts           # Zod validators (also import/ingest validators)
    components/StubNote.svelte
    server/
      db/{index,schema}.ts   # Drizzle client (lazy pool) + full CRM schema
      auth.ts email.ts sentry.ts reminders.ts   # integration stubs
      mock.ts                # placeholder data behind every surface
  routes/
    +layout.svelte           # app shell + nav
    +page.svelte             # Today (home / daily loop)
    login/ leads/ leads/new/ leads/[id]/ pipeline/ unassigned/
    reminders/ reports/ team/ review/
    health/+server.ts                 # liveness probe
    api/reminders/due/+server.ts      # secret-authed (n8n)
    api/leads/ingest/+server.ts       # secret-authed (future scraper)
scripts/import.ts            # one-time TSV importer (stub pipeline + reconciliation report)
drizzle/                     # generated migrations
Dockerfile docker-compose.yml Caddyfile   # single-droplet deploy
```

## What's NOT done yet (next milestones, per spec §Phased delivery)

1. Wire Better Auth (magic link, allowlisted) + real session gate + Resend.
2. Implement the TSV import transforms + reconciliation report + Vitest coverage.
3. Replace each surface's mock load with real Drizzle queries (search, dedup, claim, Won capture, audit).
4. SVAR DataGrid + ECharts; reminders (`follow_up_at` + n8n); Sentry init; backups + restore drill.
