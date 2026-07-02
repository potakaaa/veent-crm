# Phase 6 — Today page + activity log

**Shipped:** 2026-06-29  
**Gates:** 0 typecheck errors · 0 new lint errors · 72/72 unit tests pass

## What was built

### Server-side (DB read model + mutations)

| Function | File | What it does |
|---|---|---|
| `getTodayQueue(userId)` | `src/lib/server/db/leads.ts` | Fetches non-won/lost/deleted leads for the user; batch-fetches MAX(follow_up_at) from activities; returns leads with correct urgency via `dbRowToLead(row, followUpAt?)` |
| `logLeadTouch(id, input)` | same | Transaction: insert activity, auto-advance `contacted→replied` when outcome='replied', update `lastActivityAt`, write `crm_lead_history` row if stage changed |
| `snoozeLead(id, repId, followUpAt, notes?)` | same | Insert `channel='other'/outcome='other'` scheduling activity with new followUpAt; does NOT update `lastActivityAt` so staleness timer is preserved |

### New Zod schemas

- `logTouchSchema` — `{ channel, outcome (default='sent'), followUpAt? (YYYY-MM-DD), notes? }`
- `snoozeSchema` — `{ followUpAt (YYYY-MM-DD, required), notes? }`

### API endpoints

- `POST /api/leads/[id]/touch` — auth-gated; validates `logTouchSchema`; parses `followUpAt` as `T00:00:00+08:00`; calls `logLeadTouch`
- `POST /api/leads/[id]/snooze` — auth-gated; validates `snoozeSchema`; parses date same way; calls `snoozeLead`

### Route changes

- `src/routes/+page.server.ts` (NEW) — loads Today queue via `getTodayQueue(locals.user.id)`
- `src/routes/+page.ts` (DELETED) — was the old universal mock-backed load
- `src/routes/+page.svelte` — snooze calls real `/api/leads/${l.id}/snooze` (3 days out); nudge shows honest "no outbound messaging integration yet" toast; `invalidateAll()` after success
- `src/routes/leads/[id]/+page.svelte` — `logTouch` calls real `/api/leads/${lead.id}/touch`; converts `followUpInDays → followUpAt YYYY-MM-DD`; removed `crm` import

### Bug fixes during this phase

- `dates.ts`: duplicate `addDays` export removed
- `dates.ts`: removed `NOW` constant export (was a hardcoded prototype reference moment)
- `WonCaptureModal.svelte`: updated to use `new Date()` instead of imported `NOW`
- `leads.ts` `listLeads`: fixed `.map(dbRowToLead)` arity collision → `.map(row => dbRowToLead(row))`

## Design decisions

**followUpAt not on leads table** — solved via two-query pattern in `getTodayQueue`: fetch leads first, then batch `MAX(follow_up_at)` from activities grouped by leadId. Avoids schema migration.

**Snooze preserves staleness timer** — deliberately does not update `lastActivityAt` so scheduling an outreach doesn't reset the 30-day cold countdown.

**YYYY-MM-DD parsed as Manila midnight** — `T00:00:00+08:00` suffix appended server-side. Client sends plain date string; timezone handling is server-only.

## Test coverage

`src/tests/today.spec.ts`:
- `logTouchSchema` (5 cases) — valid/invalid channel, followUpAt format, default outcome
- `snoozeSchema` (4 cases) — required field, non-date rejection, optional notes
- `computeAge` urgency grouping (5 cases) — overdue, due (future time same day), stale, fresh (≤1 day), replied
- Summary count derivation (4 cases) — overdue/due/replied/cold counts

DB integration tests (`today-db.spec.ts`) not created — requires live postgres. Covered by existing `leads-db.spec.ts` roundtrip patterns.
