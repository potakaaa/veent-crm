# Sales Outreach CRM (completely standalone — SvelteKit + own PostgreSQL)

Replace the "Centralized List of Events" Google Sheet with a real CRM for the partnership/sales team:
find an event organizer (a Facebook/Instagram page), assign a rep, and track every outreach touch
through a pipeline to a Won/Lost outcome. **Completely standalone** — it does not read from or write
to any external system. Its only input is a one-time import of a TSV export of the sheet.

- **Goal:** convert event organizers into Veent ticketing clients, and make the pipeline visible/measurable instead of a flat, error-prone sheet.
- **Primary success metric:** **count of Won** + per-rep activity (touches / replies / wins) — both reliably captured by stage. `deal_value` is a **bonus signal only** (manual, often unfilled — the funnel never depends on it). Targets/quotas deferred. _Automatic GMV attribution is out of scope_ (would require Veent data — forbidden by the standalone rule).
- **Architecture in one line:** a self-contained SvelteKit app (Bun) with its **own PostgreSQL DB** (direct SQL via Drizzle), on a single self-managed **DigitalOcean droplet** (Docker Compose), in its **own repo**.
- **Scale:** ~2,032 leads from ~2,064 sheet rows; internal-only traffic.
- **Team:** **5 active reps** (Jonna, Ethyl, Meybelle, Shane, Elay) + manager(s). 4 former reps (Angel, Fatima, Divine, Dhen) are record-only. Flat access among reps; `owner` is a field + reporting axis.

## The standalone rule (non-negotiable)

- **No reads from / writes to any external system** (no org/order lookups, no GMV pull, no creating records outside its own DB).
- **No shared database** with Veent; the CRM owns all its data.
- Only external touches: **Better Auth** (login), **Resend** (magic-link + reminder email), **n8n** (reminder digest), **Sentry** (errors) — all independent infra.
- Consequence: closed-loop revenue attribution is manual-only.

## Background — the source sheet (authoritative TSV export, 2026-06-24)

> An earlier profile from the Google Drive connector's _rendering_ was truncated to ~360 rows and is superseded. All figures below are from the real TSV export (`~/Downloads/Copy of Centralized List of Events - Events.tsv`).

- **~2,064 outreach rows** to FB/IG event-organizer pages (file = 2,285 lines incl. date-divider rows, the "SEARCH FOR…" banner, and a **right-side summary legend** the importer must ignore).
- Identifier = the **Facebook/Instagram page** ("Page Name" / "Link"). The sheet's own header says _"SEARCH FOR EVENT AND PAGE NAME BEFORE REACHING OUT"_ → dedup is the #1 pain.
- **9 rep names** appear: **active** = Jonna, Ethyl, Meybelle, Shane, Elay; **former** = Angel, Fatima, Divine, Dhen (Dhen only ever _added_ leads, never did outreach).
- Columns: `(#), Category, Page Name, Location, Event, Link, Event Date, Notes, Added By, Reached Out By, Status, Date Reached Out, Platform`.
- **Data quality:** ~79 un-numbered rows (recoverable), Category heavily polluted (~450 non-canonical), status/date noise leaking into owner columns, ~55 rows with unicode/entity junk, event dates 89% blank.

## Architecture decision

**Completely standalone SvelteKit app + its own PostgreSQL DB (direct SQL via Drizzle).** No external backend, no cross-system reads/writes. The sheet import is the only data ingress and runs once. Trades away automatic GMV (accepted) for total independence, zero coupling to any shared backend, and no chance of the prospect list leaking into other systems.

**Model is deliberately flat** (the data is 92% one-event-per-organizer): a **lead = one organizer-page outreach** (with its event folded in). No separate events table; dedup is _advisory_ (search-warns), not a hard merge.

## Stack (decided)

| Layer                        | Choice                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Language / runtime / pkg mgr | TypeScript on **Bun**                                                                                |
| Framework                    | **SvelteKit 2 / Svelte 5** (SSR)                                                                     |
| Styling / components         | **Tailwind CSS + shadcn-svelte**                                                                     |
| Data grids / tables          | **SVAR Svelte** _(dual GPLv3/commercial; fine for this internal, non-distributed app)_               |
| Charts                       | **Apache ECharts**                                                                                   |
| Forms / validation           | **Superforms + Zod** (Zod schemas double as import validators)                                       |
| Database / ORM               | **PostgreSQL** (own) · **Drizzle + drizzle-kit**                                                     |
| Auth                         | **Better Auth** — magic link now → Authentik (OIDC) later                                            |
| Email · Automation · Errors  | **Resend** · **n8n** · **Sentry** (`@sentry/sveltekit`)                                              |
| Testing                      | **Vitest** (import transform) + **Playwright** (e2e)                                                 |
| DevOps                       | **DigitalOcean only** — single **Droplet**, Docker Compose (Bun app + self-managed Postgres + Caddy) |

### Deployment & runtime notes

- Single **DO droplet**, **Docker Compose**: Bun/SvelteKit app (`svelte-adapter-bun` in a Dockerfile) + self-managed Postgres + **Caddy** (auto-TLS). A conventional Bun-on-DigitalOcean Docker setup. **Adapter fallback:** `@sveltejs/adapter-node` under Bun (validate in Phase 1).
- App → Postgres via a **bounded pg pool** (max ~10); one long-running process, so no PgBouncer needed at this scale.
- **Backups self-managed:** nightly `pg_dump` → **DO Spaces** (offsite) with a **tested restore**, plus DO's weekly droplet-backup add-on (the prospect DB has no other copy).
- **Deploy/rollback:** commit-tagged image, `docker compose up -d`; rollback = prior tag. Run `drizzle-kit migrate` as a one-off pre-deploy step.
- **Health & uptime:** `/health` endpoint + Docker healthcheck + external uptime check. Single droplet = no HA → restore drill is mandatory.
- **Ops/security:** ufw firewall, SSH hardening, Postgres compose-internal-only, Caddy TLS. Secrets in compose `.env`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`, `REMINDERS_ENDPOINT_SECRET`. **No external-system references.**
- **Sheet snapshot is PII** → store private (DO Spaces / local, gitignored), never committed; dispose after cutover.

## Scope & non-goals

**In scope (single release):** Postgres schema; one-time TSV import + advisory dedup; lead list w/ search + dedup-warn-on-add; assignment/ownership + an unassigned "up for grabs" pool; pipeline board; outreach activity log; staleness filter; follow-up reminders; manual Won capture; reporting (funnel + per-rep); **bulk actions (claim / reassign / mark-lost)**; **manager CSV export**; team/user admin; review queue.

**Fast-follows (post-v1):** copyable **outreach template library** — intro/follow-up/pricing snippets + `{{page}}`/`{{event}}` vars, **copy-only** in the Log-touch composer (the CRM never posts to FB/IG).

**Non-goals:** any integration with external systems; GMV attribution; **post-won / onboarding tracking** (won is the finish line — onboarding happens in Veent, out of scope); **targets/quotas** (deferred); a separate events/opportunities hierarchy (deferred — data is 92% single-event); individual contact-person records; email sequences; **native mobile** (responsive web only — desktop-first, daily loop mobile-capable). (Scraper intake is **designed but not in the v1 build** — see §Lead ingestion.)

## Data model — CRM PostgreSQL schema (Drizzle)

Snake-case tables in the CRM's own DB. UUID PKs, `created_at`/`updated_at` everywhere.

### `crm_users` (reps & managers — 9 seeded: 5 active + 4 former)

- `id` (uuid, pk); `name` (text, not null)
- `email` (text, **unique, nullable**) — the login + Better Auth link key; **null for former reps** (record-only, no login)
- `role` (text/enum: rep, manager); `active` (boolean, default true) — former reps are `active=false` (no login), never deleted
- `auth_subject` (text, nullable, unique) — IdP `sub` once Authentik/OIDC is on; null for magic-link users

> Plus **Better Auth's** `user/account/session/verification` tables in the same DB; `crm_users` is the domain record, linked by **verified email** (so the Authentik swap is a no-rewrite).

### `crm_leads` (one organizer-page outreach — the lead & advisory-dedup unit)

- `id` (uuid, pk); `name` (text, not null) — page / organizer name
- `category` (text/enum: Sports, Workshop, Church, Theater, Bar/DJ, Conference, Music Fest, Fan Fair, School, Concert, Live Band, Expo, Screening, Camp, Competition, Convention, Film, Modelling, Resort, Other) — unknown/org-name values → `Other` + `needs_review`
- `location` (text); `platform` (text/enum: Facebook, Instagram, Twitter/X, TikTok, Other)
- `social_facebook`, `social_instagram`, `social_tiktok`, `social_twitter` (text); `page_url` (text)
- `normalized_handle` (text, **indexed — NOT unique**) — for **advisory** dedup/search (warn "already contacted"), never a hard merge
- `contact_email` (text)
- **Event (folded in):** `event_name` (text), `event_date` (date, nullable; wall-clock), `event_date_raw` (text), `event_link` (text)
- `stage` (text/enum, **indexed**: new, contacted, replied, in_discussion, won, lost); `lost_reason` (text/enum, nullable: no_response, rejected, not_a_fit)
- `owner_id` (uuid → crm_users, **indexed**, `ON DELETE SET NULL`, **nullable** — null = unassigned "up for grabs"). **Claim = atomic conditional update** (`SET owner_id WHERE owner_id IS NULL`) — race-safe, no locks.
- `source` (text/enum: sheet_import, manual, scraper, other)
- `needs_review` (boolean, default false) — blank page-name, recovered un-numbered rows (no category), unknown/org-name category
- `last_activity_at` (timestamptz, nullable) — maintained from activities; powers **stale filter + fresh-first sort**
- `deleted_at` (timestamptz, nullable) — **soft delete; no hard deletes**
- **Won capture (manual):** `won_org_name` (text), `deal_value_cents` (int), `currency` (text, default `'PHP'`; required when value set), `signed_at` (timestamptz)
- `notes` (text)

### `crm_activities` (each outreach touch — the relationship history)

- `id` (uuid, pk); `lead_id` (uuid → crm_leads, **indexed**, on delete cascade)
- `rep_id` (uuid → crm_users, **nullable**, `ON DELETE SET NULL`) — keeps the original rep even when the lead's owner differs/leaves
- `channel` (text/enum: fb_dm, fb_comment, ig_dm, email, call, meeting, other); `occurred_at` (timestamptz); `outcome` (text/enum: sent, replied, no_response, rejected, other)
- `follow_up_at` (timestamptz, nullable) — drives reminders; **partial index** `WHERE follow_up_at IS NOT NULL`
- `notes` (text)
- **Unique:** `(lead_id, rep_id, occurred_at, channel)` — guard against accidental double-load

### `crm_lead_history` (audit — append-only)

- `id` (uuid, pk); `lead_id` (uuid → crm_leads, **indexed**); `actor_user_id` (uuid → crm_users, nullable)
- `field` (text: stage | owner_id | deal_value_cents | won_org_name | lost_reason | …); `old_value`, `new_value` (text); `at` (timestamptz)
- Written by the app via a shared update helper on every stage/owner/deal/lost change.

## Pipeline stages & status mapping (import)

Stages: **new → contacted → replied → in discussion → won** (+ **lost**). `in discussion` (calls / meetings / pricing — the close phase) has **no sheet equivalent**: it imports empty; reps move leads into it as deals progress. `following_up` is **not** a stage — "needs follow-up" is the reminder mechanism (`follow_up_at` + Today queue). Each lead is one row, so **stage = that row's mapped status** (no multi-touch resolution). Counts approximate (exact via dry-run).

| Sheet status (~count)                                          | → Stage / reason                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Not Yet Reached Out (99), blank (253)                          | new                                                                            |
| Reached Out (~807)                                             | contacted                                                                      |
| Replied (309), Processing (15)                                 | replied                                                                        |
| To Follow Up (38), Followed Up (13)                            | replied + a `follow_up_at` reminder                                            |
| **On Boarded (3)** — #361 USWAG, #411 DAC, Sayaw               | **won**                                                                        |
| Did Not Respond (362)                                          | lost / no_response                                                             |
| Closed Chat (84)                                               | lost / no_response                                                             |
| Rejected (66)                                                  | lost / rejected                                                                |
| Disregard (85)                                                 | lost / not_a_fit                                                               |
| ~79 un-numbered rows (Status slot reads as Facebook/Instagram) | **layout-detect** (offset −2), re-map real status; category→Other+needs_review |

## Won tracking (self-contained, manual)

Moving a lead to **Won** prompts for `won_org_name`, optional `deal_value_cents` + `currency` (default PHP; the Singapore cluster uses SGD), and `signed_at` — typed into the CRM. **Win credit = the current owner** at time of Won (the activity log preserves who did every earlier touch, incl. former reps); the leaderboard shows **wins _and_ activity** so cherry-picking warm leads is visible. Reporting rolls these up per rep; **deal value shown per-currency**, never summed across currencies.

## Migration — one-time TSV import (single load)

**Source rules validated against the real TSV (2026-06-24):**

- **Layout-detect per row** — numbered rows = 13-col layout; rows whose `col0` isn't an integer / whose Status slot holds a platform value = the **−2 offset** (missing index + category) → re-map, `category` → `Other` + `needs_review`. ~79 rows; recoverable, not stubs.
- **Rep allowlist.** 9 names get a `crm_users` record (attribution); only the **5 active** (Jonna, Ethyl, Meybelle, Shane, Elay) get an email + login. `Added By`/`Reached Out By` are polluted with statuses/dates → **junk values ignored** (no user, no flag).
- **3 Won** (`On Boarded`) — matches the sheet's legend.
- **Unicode hygiene before slugify** (strip BOM / smart-quotes / `&#13;`).
- **Dates:** `MM/DD/YYYY` + `M/D` (→ 2026) + `Month D, YYYY` + typos (`6/3/3036`→2026); non-dates → null; ~89% blank.
- **Category unreliable** (~450 non-canonical) → known categories mapped, everything else → `Other` + `needs_review`; never block on category.

**Prerequisite:** `name → email` map for the **5 active reps** + ≥1 **manager** (e.g. `john.sabuga@veent.io`) to bootstrap login.

**Column → field mapping:** `Page Name`→`name` (+`social_*`/`page_url` if a URL); `Category`→`category`; `Location`→`location`; `Platform`→`platform`; `Notes`→`notes`; `Event`→`event_name`; `Link`→`event_link`; `Event Date`→`event_date`(+`_raw`); `Status`→`stage`/`lost_reason`; `Added By`/`Reached Out By`→owner + seed activity.

Pipeline (standalone TypeScript + Drizzle script; reads the TSV, touches no Veent system):

1. **Extract & snapshot** — local TSV export (Sheets → File → Download → TSV); snapshot for reproducibility. No live Google access.
2. **Filter** — keep data rows; drop dividers/banner and **ignore the right-side legend columns**.
3. **Layout-detect** each row (standard vs −2 offset).
4. **Normalize** — strip unicode junk; build `normalized_handle` (IG/FB handle from URLs, else slugify) for advisory dedup/search.
5. **Build leads** — one lead per row; **collapse exact page+event duplicates** (~30 groups) into one lead, merging their rows as separate activities; same-page/different-event rows stay **sibling leads**.
6. **Map & assign** — `Status`→`stage`/`lost_reason` (incl. On Boarded→won); seed 9 `crm_users` (5 active +email, 4 former no-login); **owner = `Added By`→`Reached Out By`** _only if an active rep_, else **unassigned** (`owner_id=null`); **`activity.rep` = `Reached Out By`** (keeps former reps on history); parse dates; set `last_activity_at`.
7. **Dry-run reconciliation report (no writes)** — leads created, exact-dup collapses, recovered un-numbered rows, **unassigned-pool size (~506)**, per-rep totals (5 active), **exactly 3 Won**, `needs_review` count, category→Other count.
8. **Load** — production = single load into empty tables (post-freeze); **dev = truncate-and-reload** the `sheet_import` rows. Child unique key guards against accidental double-load.
9. **Verify** — row-count reconciliation; exactly 3 Won; ~506 unassigned; spot-check recovered rows + exact-dup merges.

**Ownership outcome (from real data):** ~1,051 workable leads land with active reps; **~506 workable leads (296 ex-rep-owned + 210 unowned) → unassigned pool**; dead/won leads keep their attribution (even to former reps) as history.

## Lead ingestion — scraper intake (future; complements the one-time import)

A separate, independent **social-media lead scraper** (FB/IG/etc. — your own scraper repo) can feed prospects in continuously. This is **not** a coupling to any external system — it's another standalone source — so it doesn't touch the standalone rule. **Designed, not in the v1 build.**

- **Ingest endpoint (no DB creds).** The scraper POSTs batches to a **secret-authed** `POST /api/leads/ingest` (`INGEST_SECRET`). The CRM owns validation + dedup; the scraper never gets `DATABASE_URL`. Same clean boundary as `n8n → /api/reminders/due`.
- **Dedup gate (the cardinal rule, at the door).** Each incoming page is matched on `normalized_handle` against existing leads → **match = skip or attach as an advisory sibling; never blindly create.** The scraper _will_ re-find pages already in the CRM (~2,000), so without this the pool floods with duplicates.
- **Validate + normalize** to the lead shape (name=page, social handles, category, location, event, platform). Low-confidence / ambiguous rows → the **Review queue** (`needs_review`) — reuses the existing surface.
- **Source-tagged pool.** Clean new prospects land as `source='scraper'`, `stage='new'`, `owner_id=null` → the **Unassigned "up for grabs"** pool, **filterable by source** ("scraped / new" vs "orphaned from import") so a rep knows the context before claiming. Same claim / bulk-assign flow.
- **Default:** auto-into-pool after dedup; ambiguous → Review. _(Alternative if the scraper is noisy: hold all scraped leads in Review for manager qualification before they reach the pool.)_
- **Ingest contract:** define the ingest JSON (page name, handle(s)/URL, platform, optional category/location/event, source ref) as a **Zod schema reused as the endpoint validator**.

## Access & auth

App-owned, pluggable login — simple now, swappable to an IdP later with no rewrite. **Better Auth owns its tables; `crm_users` links by verified email.**

- **Now — Better Auth + magic link** (via Resend), entirely in the CRM's own Postgres.
- **Closed door (security-critical):** magic-link **issuance is allowlisted** to `active` `crm_users` (the 5 reps + manager); **no auto-provisioning** of unknown emails; **rate-limited**. It's a prospect list.
- **Session gate:** `hooks.server.ts` rejects any session whose verified email isn't an `active` `crm_users` row, on every route.
- **Later — Authentik (OIDC):** enable Better Auth's SSO plugin → store the IdP `sub` in `auth_subject`; existing reps keep their data.
- **Authorization:** **see-all, edit-own, claim-from-unassigned.** Every rep _sees_ all leads (transparency + dedup), but edits/logs/restages **only leads they own**; **claiming from Unassigned transfers ownership → edit rights**. `role=manager` can edit/reassign/bulk-assign **anything** + full reporting.
- **Former reps:** `active=false` (no login) but keep owning dead/won history; the manager reassigns any workable leads via team management.

### Security & privacy (prospect DB)

- **Sentry** `sendDefaultPii:false` + scrub bodies/emails. **Resend** sending domain SPF/DKIM verified (or magic links spam-filter). Session cookie `httpOnly`+`secure`+`sameSite=lax`, bounded length. `/api/reminders/due` is secret-authed (not cookie) → not CSRF-exposed.

## Surfaces (SvelteKit app)

_Desktop-first; the daily loop (Today · Log touch · Search) is fully usable on mobile — responsive, not native._

- **Login** + rep gate.
- **Lead list** (SVAR DataGrid) — search, filter by stage/owner/category/platform; **default sort = fresh-first (`last_activity_at` desc)**; **"stale" filter** (>30d no touch); the search box also does **advisory dedup — fuzzy (`pg_trgm`) match** on name/handle/socials, ranked candidates with stage + owner ("ENHYPEN-Philippines · lost · Angel"); default view excludes `lost`. **Bulk-select → claim / reassign / mark-lost** (stage moves stay per-lead). Edits use an `updated_at` optimistic check (warn "changed — reload").
- **Add lead** — advisory dedup warning on entry.
- **Pipeline board** — kanban by stage; drag to move; quick-assign owner; Won prompts for org name + deal value.
- **Unassigned ("Up for grabs")** — `owner_id=null`; reps **self-claim** (single or **bulk-claim**); manager **bulk-assigns**. Claim is race-safe (atomic) — losing a race shows "just claimed by {rep}".
- **Lead detail** — event fields + activity timeline (SVAR) + add-touch.
- **Reminders view** — `follow_up_at` due/overdue (Asia/Manila day boundary).
- **Reports** (ECharts) — funnel by stage (conversion %), per-rep leaderboard (**wins · touches · replies** side-by-side, so cherry-picking is visible; win credited to current owner), deal value where filled (per currency). **Export current view → CSV** (+ won-deals export for finance).
- **Team management (manager-only)** — add/deactivate reps, set role, **bulk reassign** (this _is_ the magic-link allowlist).
- **Review queue** — `needs_review=true` leads to clean up post-import.

## Reminders

`crm_activities.follow_up_at` powers the in-app **Today** "due" view (home surface); "due/overdue" computed in **Asia/Manila**. The proactive daily nudge goes **where reps already are** — an **n8n** workflow pushes each rep's due/overdue list to their **team chat (Viber/Telegram — TBD)**, email as fallback — by calling a thin authenticated **`/api/reminders/due`** endpoint (**n8n holds no `DATABASE_URL`**). The chat nudge just drives them back to the Today queue.

## Phased delivery (one release; internal build order)

1. CRM DB: full Drizzle schema (`crm_users`/`crm_leads`/`crm_activities`/`crm_lead_history` — incl. `last_activity_at`, `needs_review`, `deleted_at`, activity unique key, `follow_up_at` partial index) + migrations + droplet provisioned. **Spikes:** `svelte-adapter-bun` hello-world via Docker Compose on the droplet; SVAR DataGrid on sample data. **Prereq:** 5-rep + manager email map.
2. Import script + **dry-run reconciliation report** + Vitest tests (proves the model on real data early).
3. App scaffold + Better Auth (magic link, allowlisted) + rep gate + DB client + **team/user admin** (allowlist).
4. Lead list (search, dedup-warn, stale filter, fresh-first) + detail + add.
5. Pipeline board + assignment + **Unassigned pool (claim/bulk-assign)** + Won capture.
6. Activity log + reminders.
7. Reporting.

**Cut line if time runs short:** reminders (6) + reporting (7) last.

## Definition of done (v1 acceptance)

- **Import reconciles:** ~2,064 rows → ~2,032 leads (exact dupes collapsed); per-rep totals reconcile across the 5 active reps; **all 3 Won present**; ~79 un-numbered rows recovered; **~506 leads in the unassigned pool**; `needs_review` count reported; zero unintended merges.
- **Auth:** all 5 active reps + ≥1 manager log in via magic link; non-allowlisted emails rejected; former reps cannot log in but their history is intact.
- **Core flows:** lead CRUD, kanban stage move, owner assign/claim/bulk-reassign, advisory dedup-on-add, Won capture, soft-delete — all work; every stage/owner/deal change lands in `crm_lead_history`.
- **Reporting & reminders:** funnel + per-rep leaderboard (won count + activity; deal-value where filled) render; in-app "due" view + n8n chat nudge fire on Asia/Manila boundaries.
- **Ops:** `/health` green + uptime monitor; backup taken **and restore rehearsed**.
- **Cutover (hard):** pre-cutover read-only preview + walkthrough; sheet frozen read-only and kept as a 2-week reference; manager is week-1 champion; CRM is the system of record.

## Open decisions

1. **Rep email map (INPUT NEEDED — user providing later)** — `name → email` for the **5 active reps** (Jonna, Ethyl, Meybelle, Shane, Elay) + ≥1 **manager** (default: `john.sabuga@veent.io`). Hard prerequisite for import + login; dry-run uses placeholders until then.

**Decided:** flat model (lead+activity+user+history; no events table; advisory dedup); import everything, active-default views; owner = Added By→Reached Out By→unassigned (active reps only); collapse exact dupes / keep siblings; single load (no source-gating); roster (5 active / 4 former / manager = you); 506 workable no-active-owner leads → unassigned pool; staleness filter + fresh-first sort; stack (§Stack); DevOps = single DO droplet; separate repo; Better Auth magic-link (allowlisted) → Authentik; Resend; n8n; Sentry; "Closed Chat"=lost; "On Boarded"=won; currency default PHP; soft-delete + audit; reminder tz Asia/Manila. **Grill-2:** stages new→contacted→replied→in discussion→won/lost (dropped following_up-as-stage; To Follow Up/Followed Up→replied+follow_up_at); activity channels +Call/+Meeting; **fuzzy pg_trgm dedup (required)**; **see-all / edit-own / claim-from-unassigned / manager-override**; **desktop-first + mobile-capable daily loop**; hard cutover + read-only preview + 2-week read-only-sheet fallback; self-managed Postgres on droplet; **headline metric = count of Won** (deal-value bonus, targets deferred); daily nudge via reps' chat channel; **won = finish line** (onboarding out of scope). **Grill-3:** win credit = current owner (leaderboard shows wins+activity so cherry-picking is visible); **bulk claim/reassign/mark-lost** (stage moves per-lead); basic **manager CSV export** (v1); **optimistic concurrency** (atomic claim + `updated_at` edits, no locks); **copyable template library = fast-follow** (post-v1).

## Touched / new files

- **New repo** (e.g. `veent-crm`, separate from the monorepo) — SvelteKit 2 / Svelte 5 on Bun; Tailwind + shadcn-svelte; SVAR + ECharts; Better Auth (magic-link, allowlisted) + `hooks.server.ts` gate; Drizzle client + `schema.ts` (incl. `crm_lead_history`); drizzle-kit migrations; Resend + Sentry init; Superforms+Zod; `/api/reminders/due`; pages above.
- **Deploy:** `svelte-adapter-bun` + Dockerfile + `docker-compose.yml` (app + Postgres + Caddy) + droplet provisioning + nightly `pg_dump`→Spaces backup.
- **CRM database:** self-managed Postgres + Drizzle migrations (CRM tables + Better Auth tables).
- **Import script:** one-time TSV importer + reconciliation report + Vitest tests.
- **n8n workflow:** daily reminder digest (calls `/api/reminders/due` → Resend).
- **No external-system changes** (nothing outside this app is touched).
