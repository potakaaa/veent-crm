# QA pass — Phases 4–7 (2026-06-29)

Covers all DB-backed routes after seeding with `bun run db:seed`.

## Setup used

```bash
bun run db:seed          # 10 users + 25 leads + 17 activities + 3 history rows
# Log in via magic-link as john.sabuga@veent.io (manager)
```

## DB counts verified (docker exec psql)

| metric | expected | actual |
|---|---|---|
| total leads | 25 | 25 |
| unassigned (no owner, not won/lost) | 3 | 3 |
| needs_review | 2 | 2 |
| stage: new | 11 | 11 |
| stage: contacted | 7 | 7 |
| stage: replied | 2 | 2 |
| stage: in_discussion | 3 | 3 |
| stage: won | 1 | 1 |
| stage: lost | 1 | 1 |
| active users | 6 | 6 |
| inactive users | 4 | 4 |

## John's Today queue (DB verified)

| lead | urgency | reason |
|---|---|---|
| USWAG Davao Sports Event | overdue | follow_up_at Jun 27 (2 days ago) |
| Sayaw Mindanao Workshop | due | follow_up_at Jun 29 23:59 Manila |
| ENHYPEN Philippines Fan Fair | replied | stage = replied, 0.5d ago |
| Baguio Camp Org | cold | last_activity_at 75 days ago |
| Bar Cumbia Nights CDO | cold | last_activity_at 59 days ago |
| Davao Concert Producers | (normal — not in Today groups) | 5 days, no follow-up |
| UP Film Screening Org | (normal — not in Today groups) | 3 days, no follow-up |
| Tagaytay Church Retreat | (normal — not in Today groups) | 2 days, no follow-up |

## Routes checked

| route | data layer | browser verified | notes |
|---|---|---|---|
| `/` (Today) | DB ✅ | manual only (magic-link) | DB counts match; urgency buckets confirmed via psql |
| `/leads` | DB ✅ | manual only | listLeads() from Drizzle; 25 rows expected |
| `/leads/new` | DB ✅ | manual only | creates via POST /api/leads |
| `/leads/[id]` | DB ✅ | manual only | getLead + listActivities; history rows from seed |
| `/pipeline` | DB ✅ | manual only | 6 stages, counts match seed |
| `/team` | DB ✅ (after fix) | manual only | was partially mock-overriding on client nav |
| `/unassigned` | MOCK ❌ | N/A | badge count = 3 (real DB); page body = mock |
| `/review` | MOCK ❌ | N/A | badge count = 2 (real DB); page body = mock |
| `/reminders` | MOCK ❌ | N/A | page body mock; snooze is stub toast only |
| `/reports` | MOCK ❌ | N/A | ECharts over mock aggregate data |

## Actions tested (server-side code review + API logic)

| action | endpoint | persistence | notes |
|---|---|---|---|
| Log touch | POST /api/leads/[id]/touch | ✅ real DB | inserts activity, updates lastActivityAt, auto-advances contacted→replied |
| Snooze | POST /api/leads/[id]/snooze | ✅ real DB | inserts scheduling-only activity; preserves staleness timer |
| Nudge | (none) | stub toast | honest placeholder; does not pretend to send |
| Stage move | PATCH /api/leads/[id]/stage | ✅ real DB | writes crm_lead_history audit row |
| Mark Won | PATCH /api/leads/[id]/stage | ✅ real DB | clears lost metadata; writes deal value history row |
| Mark Lost | PATCH /api/leads/[id]/stage | ✅ real DB | clears won metadata; writes lost_reason history row |
| Owner reassign | PATCH /api/leads/[id]/owner | ✅ real DB | manager-only; now rejects inactive users |
| Create lead | POST /api/leads | ✅ real DB | Zod validated; 422 on duplicate detection |

## Browser coverage note

All route and action verification is **code-review + DB-query based**. Playwright cannot
automate magic-link login without an email interception setup. To fully verify in-browser:

1. `bun run dev`
2. Visit `/login`, enter `john.sabuga@veent.io`
3. Intercept magic-link from server logs (Resend is stubbed — log it)
4. Navigate each route manually and confirm seeded data renders

## Bugs found and fixed

### Bug 1: `src/routes/team/+page.ts` — mock loader shadows real DB users on client nav
- **Symptom**: On initial SSR, team page shows real DB users. After any client-side navigation to `/team`, the universal `+page.ts` runs and replaces `data.users` with mock data.
- **Fix**: Deleted `src/routes/team/+page.ts`. Server loader (`+page.server.ts`) is the single source of truth.
- **Type cascade**: Raw Drizzle rows exposed two type errors (`email: string | null`, missing `leadCount`). Fixed by mapping through `dbUserToUser()` in `+page.server.ts`.

### Bug 2: `src/routes/team/+page.server.ts` — inactive reps sorted first
- **Symptom**: `orderBy(asc(crmUsers.active))` → `false < true` → inactive reps at top of list.
- **Fix**: Changed to `desc(crmUsers.active)` so active reps appear first.

### Bug 3: `src/routes/api/leads/[id]/owner/+server.ts` — inactive reps assignable
- **Symptom**: Owner validation checked existence but not `active = true`. Inactive reps could be assigned new leads.
- **Fix**: Added `eq(crmUsers.active, true)` to the owner lookup; now returns `422 Owner not found or inactive`.

## Remaining mock-backed / unverified gaps

- `/unassigned`, `/review`, `/reminders`, `/reports` page bodies — still `$lib/services` (mock). Future phases.
- `+layout.ts` `currentUser` is mock-sourced (real session user not passed to layout client load). Affects team page `canManage` check and deactivation flow on client.
- `listLeads()` does not join `follow_up_at` from activities — overdue/due urgency won't show on `/leads` or `/pipeline` lead cards. Acceptable since those pages don't show urgency; only `/` (Today) is correct.
- No snooze ownership check on `POST /api/leads/[id]/snooze` — any authenticated user can snooze any lead.

## Gates run

| gate | result |
|---|---|
| `bun run db:seed` | ✅ 10 users + 25 leads + 17 activities + 3 history |
| `bun run check` | ✅ 0 errors (before fix: 2 type errors in team/+page.svelte) |
| `bun run test:unit -- --run` | ✅ 72/72 passed |
| DB row count verification (psql) | ✅ all counts match seed spec |
