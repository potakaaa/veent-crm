# Veent Sales CRM — Build Tasks

Derived from [`docs/sales-crm.md`](docs/sales-crm.md). Follows the spec's phased build order.
Checklist is the durable plan; check items off as they land.

## Decisions for this build (deviations / confirmations)
- **Rep email map:** use **placeholders** (e.g. `jonna@veent.io`) for dev/dry-run; swap real
  addresses before the production load + cutover. (Spec open decision #1.)
- **Data grid:** use **shadcn-svelte data-table**, *not* SVAR DataGrid (avoids GPLv3/commercial dep).
- **Scraper ingest** (`/api/leads/ingest`): designed, **not in v1** (route stub stays; see Backlog).
- **Reminder chat channel** (Viber/Telegram): still TBD — email fallback ships in v1.

## Current state (v0 skeleton — already in repo)
- [x] SvelteKit 2 / Svelte 5 on Bun; Tailwind; Docker Compose + Caddy + Dockerfile; drizzle config
- [x] Full Drizzle schema (`crm_users`/`crm_leads`/`crm_activities`/`crm_lead_history` + enums) + migration `0000`
- [x] All route pages exist as **stubs rendering `src/lib/server/mock.ts`** (no DB queries yet)
- [ ] Everything below replaces those stubs with real implementations

---

## Phase 1 — DB foundation completion
- [ ] Add **Better Auth tables** (user/account/session/verification) to `schema.ts`; regenerate migration
- [ ] Add **`pg_trgm` extension** migration + trigram (GIN) indexes on lead `name`/`normalized_handle`/socials
- [ ] Confirm remaining indexes from spec: `stage`, `owner_id`, `last_activity_at`, activity `(lead_id,rep_id,occurred_at,channel)` unique, `follow_up_at` partial index
- [ ] Replace mock with a real **DB client** path; verify `postgres-js` pool boots against local Docker Postgres
- [ ] **Seed script** — 9 `crm_users` (5 active + placeholder emails, 4 former no-login, 1 manager)
- [ ] **Spike:** `svelte-adapter-bun` build + Docker Compose up on droplet (validate adapter; node-adapter fallback)
- [ ] **Spike:** shadcn-svelte data-table on sample data

## Phase 2 — One-time TSV import (real)
- [ ] Implement transforms in `scripts/import.ts`:
  - [ ] Filter dividers / "SEARCH FOR…" banner / right-side legend columns
  - [ ] **Layout-detect** per row (standard 13-col vs −2 offset); recover ~79 un-numbered rows
  - [ ] **Unicode hygiene** (strip BOM / smart-quotes / `&#13;`) before slugify
  - [ ] Build **`normalized_handle`** (IG/FB handle from URL, else slugify)
  - [ ] **Build leads** — collapse exact page+event dupes (~30 groups) → merged activities; siblings kept
  - [ ] **Map** status → stage / lost_reason (incl. `On Boarded`→won); parse dates (`MM/DD/YYYY`, `M/D`→2026, `Month D, YYYY`, typos)
  - [ ] **Assign owner** = Added By → Reached Out By (active reps only) else unassigned; `activity.rep` = Reached Out By
  - [ ] Category map → canonical, else `Other` + `needs_review`; set `last_activity_at`
- [ ] **Dry-run reconciliation report** (no writes): rows, leads, dup collapses, recovered rows, unassigned pool (~506), per-rep totals, exactly 3 Won, needs_review count, category→Other count
- [ ] **Vitest tests** against the real TSV proving the model
- [ ] **Load** (single load into empty tables) + **verify** (row reconciliation, 3 Won, ~506 unassigned, spot-checks)

## Phase 3 — Auth + admin
- [ ] Wire real **Better Auth** + drizzle adapter (replace `src/lib/server/auth.ts` stub)
- [ ] **Magic-link** plugin via **Resend** (`email.ts`); allowlisted issuance (active `crm_users` only), rate-limited, no auto-provision
- [ ] **Session gate** in `hooks.server.ts` — reject non-allowlisted/inactive emails on every route except `/login`, `/health`, secret-authed `/api/*`; remove `DEV_BYPASS`
- [ ] **Login** page (real flow)
- [ ] **Team/user admin** (manager-only) — add/deactivate reps, set role, bulk reassign (= the allowlist)

## Phase 4 — Lead list + detail + add
- [ ] **Lead list** with shadcn data-table: real queries; default fresh-first (`last_activity_at` desc); excludes `lost`
- [ ] Filters: stage / owner / category / platform; **stale (>30d)** filter
- [ ] **Advisory dedup search** — `pg_trgm` fuzzy match on name/handle/socials, ranked candidates with stage + owner
- [ ] **Bulk-select** → claim / reassign / mark-lost (stage moves stay per-lead)
- [ ] **Add lead** — advisory dedup warning on entry (Superforms + Zod)
- [ ] **Lead detail** — event fields + activity timeline + add-touch; **optimistic `updated_at`** edit check ("changed — reload")

## Phase 5 — Pipeline board + ownership + Won
- [ ] **Kanban** by stage; drag-to-move; quick-assign owner
- [ ] **Unassigned "Up for grabs"** pool (`owner_id=null`) — self-claim, bulk-claim, manager bulk-assign
- [ ] **Race-safe atomic claim** (`SET owner_id WHERE owner_id IS NULL`); lost race → "just claimed by {rep}"
- [ ] **Won capture** prompt — `won_org_name`, optional `deal_value_cents` + `currency` (default PHP), `signed_at`; credit = current owner
- [ ] **Shared update helper** writing `crm_lead_history` on every stage/owner/deal/lost change
- [ ] **Soft-delete** (`deleted_at`) — no hard deletes

## Phase 6 — Activity log + reminders
- [ ] **Add-touch** composer — channels (fb_dm/fb_comment/ig_dm/email/call/meeting/other), outcome, notes
- [ ] Maintain `last_activity_at` from activities; enforce activity unique key
- [ ] **`follow_up_at`** + in-app **Today** due/overdue view (Asia/Manila day boundary)
- [ ] **`/api/reminders/due`** — secret-authed (not cookie); `REMINDERS_ENDPOINT_SECRET`
- [ ] **n8n** daily digest workflow → reps' chat channel (TBD) with email fallback

## Phase 7 — Reporting + review queue
- [ ] **Funnel** by stage (conversion %) — ECharts
- [ ] **Per-rep leaderboard** — wins · touches · replies side-by-side; deal value **per currency** (never summed across)
- [ ] **CSV export** of current view + won-deals export for finance
- [ ] **Review queue** — `needs_review=true` leads for post-import cleanup

## Phase 8 — Ops + cutover
- [ ] **Sentry** real init (`sendDefaultPii:false`, scrub bodies/emails)
- [ ] **`/health`** + Docker healthcheck + external uptime check
- [ ] **Backups** — nightly `pg_dump` → DO Spaces (offsite) + **tested restore drill**; DO weekly droplet backup
- [ ] **Deploy/rollback** — commit-tagged image, `docker compose up -d`, `drizzle-kit migrate` pre-deploy; rollback = prior tag
- [ ] **Hardening** — ufw firewall, SSH hardening, Postgres compose-internal-only, Caddy TLS; secrets in compose `.env`
- [ ] **Cutover** — read-only preview + walkthrough; freeze sheet read-only (2-week reference); CRM = system of record

---

## Backlog (post-v1 / designed-not-built)
- [ ] **Outreach template library** (fast-follow) — copyable intro/follow-up/pricing snippets with `{{page}}`/`{{event}}` vars, copy-only in Log-touch composer
- [ ] **Scraper ingest** (`/api/leads/ingest`) — secret-authed batch POST, `normalized_handle` dedup gate, source-tagged pool, Zod validator; ambiguous → Review queue
- [ ] **Authentik (OIDC)** swap — Better Auth SSO plugin, store IdP `sub` in `auth_subject`

## Definition of done (v1 acceptance — from spec)
- [ ] Import reconciles: ~2,064 rows → ~2,032 leads; 3 Won; ~79 recovered; ~506 unassigned; zero unintended merges
- [ ] Auth: 5 active reps + manager log in via magic link; non-allowlisted rejected; former reps blocked but history intact
- [ ] Core flows: CRUD, kanban move, assign/claim/bulk-reassign, dedup-on-add, Won capture, soft-delete; all changes hit `crm_lead_history`
- [ ] Reporting & reminders render + fire on Asia/Manila boundaries
- [ ] Ops: `/health` green + uptime monitor; backup taken **and restore rehearsed**
- [ ] Cutover complete: sheet frozen read-only; CRM is system of record
