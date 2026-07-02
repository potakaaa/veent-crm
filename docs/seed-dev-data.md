# Phase 7 — Dev seed data (`scripts/seed.ts`)

Seeds realistic CRM data so every DB-backed surface renders meaningful content for manual
testing and demos. One command lights up Today urgency buckets, all pipeline stages,
won/lost deals, unassigned + needs-review queues, and activity-rich lead timelines.

---

## Quick start

```bash
bun run db:seed                            # upsert — safe to re-run
bun scripts/seed.ts --reset               # delete known seed rows then re-seed
NODE_ENV=production bun scripts/seed.ts --force   # bypass prod guard
```

---

## Commands

| Flag | Behaviour |
|---|---|
| _(none)_ | Upsert all rows. Users/leads/history use `onConflictDoNothing`; activities use `onConflictDoUpdate` to refresh `followUpAt` and `occurredAt` so urgency stays accurate. |
| `--reset` | Deletes ONLY the fixed seed-ID set (history → activities → leads, FK order), then re-seeds. Never truncates tables; never touches non-seed rows. |
| `--force` | Required when `NODE_ENV=production`. Without it the script exits 1 and writes nothing. |

---

## Prerequisites

- Docker Compose running: `docker compose up -d`
- Schema applied: `bun run db:push`
- `DATABASE_URL` set in `.env`, or the script falls back to `postgres://crm:crm@127.0.0.1:5432/veent_crm`

---

## Login

No `DEV_BYPASS` — real Better Auth sessions are required.

| Email | Role | What you can test |
|---|---|---|
| `john.sabuga@veent.io` | manager | Today queue, pipeline, lead detail, team management, owner reassignment |
| `jonna@veent.io` | rep | Rep's own Today queue, leads assigned to Jonna |
| `ethyl@veent.io` | rep | Leads assigned to Ethyl |
| `meybelle@veent.io` | rep | Leads assigned to Meybelle |
| `shane@veent.io` | rep | Leads assigned to Shane |
| `elay@veent.io` | rep | Duplicate-candidate leads |

Magic-link delivery is stubbed (Resend not configured in dev). To get the link, watch the dev server terminal — the email body is logged to stdout by the Resend stub.

---

## UUID namespaces

Fixed UUIDs make re-seeds deterministic and allow `--reset` to target exact rows.

| Table | Prefix | Example |
|---|---|---|
| `crm_users` | `00000000-…` | `00000000-0000-0000-0000-000000000001` (John) |
| `crm_leads` | `00000001-…` | `00000001-0000-0000-0000-000000000001` (L001) |
| `crm_activities` | `00000002-…` | `00000002-0000-0000-0000-000000000001` (A001) |
| `crm_lead_history` | `00000003-…` | `00000003-0000-0000-0000-000000000001` (H001) |

---

## Users (10)

### Active (can log in)

| ID suffix | Name | Email | Role |
|---|---|---|---|
| `…000001` | John Sabuga | john.sabuga@veent.io | manager |
| `…000002` | Jonna | jonna@veent.io | rep |
| `…000003` | Ethyl | ethyl@veent.io | rep |
| `…000004` | Meybelle | meybelle@veent.io | rep |
| `…000005` | Shane | shane@veent.io | rep |
| `…000006` | Elay | elay@veent.io | rep |

### Inactive (no login, no email — demonstrate deactivated-rep display on /team)

`…000007` Angel · `…000008` Fatima · `…000009` Divine · `…000010` Dhen

---

## Leads (25)

### John's Today queue (L001–L005)

These leads are designed to populate every urgency bucket on the Today page for `john.sabuga@veent.io`.

| ID | Name | Urgency | Stage | Reason |
|---|---|---|---|---|
| L001 | USWAG Davao Sports Event | **overdue** | contacted | Activity A001 set `followUpAt` 2 days ago |
| L002 | Sayaw Mindanao Workshop | **due today** | new | Activity A002 sets `followUpAt` to Manila 23:59 today |
| L003 | ENHYPEN Philippines Fan Fair | **replied** | replied | Stage = `replied`; last activity 12 h ago |
| L004 | Bar Cumbia Nights CDO | **cold** | new | `lastActivityAt` = 2026-05-01 (~59 days ago) |
| L005 | Baguio Camp Org | **cold** | contacted | `lastActivityAt` = 2026-04-15 (~75 days ago) |

Three additional leads owned by John (L013, L020, L024) won't appear in Today groups because they have `fresh` or `normal` urgency (no overdue follow-up, last touched within 30 days).

### Jonna's Today queue (L006–L007)

| ID | Name | Urgency | Stage | Reason |
|---|---|---|---|---|
| L006 | Cebu Wedding Expo 2026 | **overdue** | contacted | Activity A006 set `followUpAt` 3 days ago |
| L007 | Iloilo Music Fest PH | **due today** | new | Activity A007 sets `followUpAt` to Manila 23:59 today |

### Pipeline — all 6 stages

| Stage | Count | Key examples |
|---|---|---|
| `new` | 11 | L002 L004 L007 L008 L017 L018 L019 L020 L022 L023 |
| `contacted` | 7 | L001 L005 L006 L010 L011 L021 L025 |
| `replied` | 2 | L003 L012 |
| `in_discussion` | 3 | L013 L014 L024 |
| `won` | 1 | L015 (Iloilo Music Fest OKK — ₱3 000) |
| `lost` | 1 | L016 (Davao Fan Fair 2025 — `no_response`) |

### Won / Lost

| ID | Name | Stage | Detail |
|---|---|---|---|
| L015 | Iloilo Music Fest OKK | won | `wonOrgName` = "Iloilo OKK Productions"; `dealValueCents` = 300 000 (₱3 000); `signedAt` = 10 days ago; history row H001 |
| L016 | Davao Fan Fair 2025 | lost | `lostReason` = `no_response`; history row H002 |

### Unassigned / Up for grabs (L017–L019)

`ownerId = null`. Badge on `/unassigned` = **3**.

| ID | Name | Platform |
|---|---|---|
| L017 | Manila School Fiesta Org | Facebook |
| L018 | Pangasinan Convention Expo | Facebook |
| L019 | Zamboanga Live Band Festival | Instagram |

### Needs review (L020–L021)

`needsReview = true`. Badge on `/review` = **2**.

| ID | Name | Owner |
|---|---|---|
| L020 | Tagaytay Church Retreat | John |
| L021 | Bacolod Theater Guild | Jonna |

### Duplicate candidates (L022–L023)

Both share the name pattern "Sayaw Pilipinas" and the same Facebook URL. Assigned to Elay (not null) so they don't inflate the unassigned count.

| ID | Name | socialFacebook |
|---|---|---|
| L022 | Sayaw Pilipinas Manila | https://fb.com/SayawPilipinas |
| L023 | Sayaw Pilipinas (MNL) | https://fb.com/SayawPilipinas |

### Activity-rich leads (L024–L025)

Good for testing the lead detail timeline.

| ID | Name | Owner | Activity count |
|---|---|---|---|
| L024 | Davao Concert Producers | John | 4 (A011–A014): DM → email → call → meeting |
| L025 | Cebu Modelling Agency | Ethyl | 3 (A015–A017): DM → no-response → voicemail |

---

## Activities (17)

| ID | Lead | Rep | Channel | Outcome | `followUpAt` | Purpose |
|---|---|---|---|---|---|---|
| A001 | L001 | John | `ig_dm` | `sent` | **2 days ago** | Drives L001 → overdue |
| A002 | L002 | John | `fb_dm` | `sent` | **today 23:59 Manila** | Drives L002 → due today |
| A003 | L003 | John | `call` | `replied` | — | Stage context for L003 |
| A004 | L004 | John | `fb_dm` | `sent` | — | Old outreach; no reply |
| A005 | L005 | John | `ig_dm` | `no_response` | — | Old outreach; no reply |
| A006 | L006 | Jonna | `ig_dm` | `sent` | **3 days ago** | Drives L006 → overdue |
| A007 | L007 | Jonna | `fb_dm` | `sent` | **today 23:59 Manila** | Drives L007 → due today |
| A008 | L010 | Jonna | `email` | `sent` | — | Pipeline: contacted |
| A009 | L012 | Shane | `ig_dm` | `replied` | — | Pipeline: replied |
| A010 | L015 | John | `call` | `replied` | — | Finalised the won deal |
| A011–A014 | L024 | John | dm/email/call/meeting | mixed | — | Rich timeline for detail page |
| A015–A017 | L025 | Ethyl | dm/dm/call | mixed | — | Multi-touch outreach |

### Why activities use `onConflictDoUpdate`

`followUpAt` and `occurredAt` are computed relative to the current date (`daysAgo`, `todayEndManila`).
If they used `onConflictDoNothing`, re-running the seed would leave stale timestamps (e.g. "due today"
becoming "overdue" the next day). The upsert refreshes just those two columns so urgency stays correct.

---

## History rows (3)

| ID | Lead | Actor | Field | Old → New |
|---|---|---|---|---|
| H001 | L015 | John | `stage` | `in_discussion` → `won` |
| H002 | L016 | Jonna | `stage` | `contacted` → `lost` |
| H003 | L013 | John | `deal_value_cents` | `0` → `150000` |

---

## Urgency computation

`getTodayQueue` in `src/lib/server/db/leads.ts` batch-fetches `MAX(follow_up_at)` per lead
from `crm_activities`, then passes that value to `dbRowToLead`. `computeAge` in
`src/lib/utils/dates.ts` classifies the result:

| Condition | Urgency |
|---|---|
| `followUpAt` set and `daysBetween(now, followUpAt) < 0` | `overdue` |
| `followUpAt` set and `daysBetween(now, followUpAt) === 0` | `due` |
| `stage === 'replied'` | `replied` |
| `lastActivityAt` > 30 days ago | `cold` |
| `lastActivityAt` ≤ 1 day ago | `fresh` |
| otherwise | `normal` |

Only `overdue`, `due`, `replied`, and `cold` appear in Today groups. `fresh` and `normal` leads
are owned by the logged-in user but don't surface on the Today page — they're visible on `/leads`.

**Manila timezone detail:** `todayEndManila` is computed as `new Date(todayManila + 'T23:59:00+08:00')`.
This ensures "due today" urgency holds regardless of what hour the seed script runs.

---

## Routes — what to expect after login

| Route | What you see | Notes |
|---|---|---|
| `/` (Today) | 5 groups for John: 1 overdue · 1 due · 1 replied · 2 cold | 3 of John's leads are fresh/normal and won't appear |
| `/leads` | All 25 leads; Mine tab shows John's 8 non-won/lost | Lost hidden unless Lost tab active |
| `/leads/new` | Add-lead form; duplicate advisory triggers for "Sayaw" name variants | |
| `/pipeline` | 6 columns: new(11) · contacted(7) · replied(2) · in_discussion(3) · won(1) · lost(1) | Drag or use stage dropdown to move; persists via PATCH /api/leads/[id]/stage |
| `/leads/…0015` | Won lead: Iloilo Music Fest OKK, ₱3 000, history row H001 | |
| `/leads/…0024` | Davao Concert Producers: 4-entry timeline (DM → email → call → meeting) | |
| `/leads/…0025` | Cebu Modelling Agency: 3-entry timeline | |
| `/unassigned` | **Badge = 3**; page body still mock-backed | |
| `/review` | **Badge = 2**; page body still mock-backed | |
| `/team` | 6 active (John + 5 reps) then 4 inactive; sorted active-first by name | Manager-only; 403 for reps |
| `/reports` | Mock aggregate data | Not yet wired to DB |
| `/reminders` | Mock data; snooze is stub toast | Not yet wired to DB |

---

## Actions to test manually

### Log touch (Today page or lead detail)

1. Open a lead with `overdue` or `due` urgency.
2. Click **Log touch** → fill channel/outcome/follow-up date → submit.
3. Reload the page — the activity appears in the timeline and `lastActivityAt` updates.
4. If outcome = `replied` and stage = `contacted`, stage auto-advances to `replied`.

### Snooze (Today page)

1. On Today page, click **Snooze** on any lead.
2. Reload — the lead's `followUpAt` shifts 3 days forward.
3. If it was `overdue` it may become `due` or disappear from Today depending on the new date.

### Stage move (pipeline)

1. Open `/pipeline`.
2. Move a lead to `won` — a modal captures org name, deal value, signed date.
3. Move a lead to `lost` — a modal captures loss reason.
4. Reload — stage persists; history row written to `crm_lead_history`.

### Owner reassign (lead detail, manager only)

1. Open any lead as John (manager).
2. Change owner to an active rep — confirm it saves.
3. Try an inactive rep (Angel/Fatima/Divine/Dhen) — should get `422 Owner not found or inactive`.

### Add lead

1. Open `/leads/new`.
2. Enter name "Sayaw" — duplicate advisory should surface L022/L023.
3. Submit a valid lead — confirm it appears on `/leads` and opens on detail page.
4. Submit with empty required fields — confirm validation error; no DB row created.

---

## Known gaps

| Area | Gap |
|---|---|
| `/unassigned` `/review` `/reminders` `/reports` page bodies | Still `$lib/services` (mock client) — seeded DB rows don't appear in page content |
| `/api/nav-counts` | Badge counts ARE real DB for unassigned and review |
| `scripts/` typecheck | `bun run check` (svelte-check) excludes `scripts/` — enum/column correctness proven at DB-run time only |
| Playwright e2e | Magic-link login blocks automated browser coverage; no email interception in dev |
| Snooze ownership | `POST /api/leads/[id]/snooze` has no ownership check — any authenticated user can snooze any lead |

---

## Extending the seed

- **Add a lead:** append a row to the `leads` array with `id: L(26)`, any owner from `U`, correct `stage` and `category` enum values.
- **Add an activity:** append a row to `activities` with `id: A(18)`, a `leadId` from `L(...)`, correct `channel`/`outcome` enum values. Set `followUpAt` only if you want urgency to trigger.
- **Add a user:** append a row to `users` with `id: '00000000-0000-0000-0000-000000000011'`, supply an email for magic-link login eligibility.
- **Enum values (exact strings required):**
  - `stage`: `new` · `contacted` · `replied` · `in_discussion` · `won` · `lost`
  - `platform`: `Facebook` · `Instagram` · `Twitter/X` · `TikTok` · `Other`
  - `channel`: `fb_dm` · `ig_dm` · `tiktok_dm` · `email` · `call` · `meeting` · `other`
  - `outcome`: `sent` · `replied` · `no_response` · `other`
  - `lostReason`: `no_response` · `price` · `competitor` · `timing` · `other`
  - `category`: `Concert` · `Sports` · `Workshop` · `Fan Fair` · `Expo` · `Convention` · `Live Band` · `Resort` · `Screening` · `Bar/DJ` · `Camp` · `Church` · `Theater` · `Modelling` · `School` · `Music Fest`

After adding rows, run `bun run db:seed` (idempotent) or `bun scripts/seed.ts --reset` for a clean slate.

---

## Safety

- Refuses to run when `NODE_ENV=production` without `--force` (exits 1, no writes).
- `--reset` only deletes the fixed seed-ID set — never a bare `DELETE FROM table` or TRUNCATE.
- `onConflictDoNothing` on users/leads/history means non-seed rows are never overwritten.
- Activities use targeted `onConflictDoUpdate` on only `followUpAt` and `occurredAt` — all other activity fields are unchanged on re-seed.
