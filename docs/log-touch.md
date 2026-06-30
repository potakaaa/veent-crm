# Log Touch — Lead Detail Page

**Shipped:** 2026-06-30  
**Gates:** 0 typecheck errors · 0 lint errors · 139/139 unit tests pass

## What it does

"Log a touch" is the primary data-entry action in the CRM. A rep opens a lead's detail page (`/leads/[id]`), picks a channel, picks an outcome, selects a follow-up interval, optionally adds a note, and submits. The result:

- A new row in `crm_activities` (the permanent outreach history)
- The lead's `last_activity_at` is stamped to now
- The lead's active `follow_up_at` is set (drives the Reminders queue)
- If outcome is `replied` and the lead is in `contacted` stage, stage auto-advances to `replied`
- A `crm_lead_history` row records the stage change (if any)
- The activity timeline on the detail page refreshes immediately

---

## User flow

```
/leads/[id]
  └── LogTouchForm
        ├── Channel chips   (FB DM / FB comment / IG DM / Email / Call / Meeting / Other)
        ├── Outcome chips   (sent / replied / no reply / rejected)
        ├── Follow-up chips (1d / 3d / 7d / 14d)  ← always required, default 3d
        ├── Note textarea   (optional free text)
        └── [Log touch] button
              ↓ POST /api/leads/[id]/touch
              ↓ success → success toast + invalidateAll()
              ↓ error   → error toast with server message
```

After success, `invalidateAll()` re-runs `+page.server.ts` so the activity timeline and lead metadata (last activity, follow-up date) refresh without a full page reload.

---

## Architecture

### UI (`src/routes/leads/[id]/+page.svelte`)

`LogTouchForm` calls `onSubmit(AddActivityInput)` where `AddActivityInput` carries:

```ts
{ channel: ActivityChannel; outcome: ActivityOutcome; note?: string; followUpInDays?: number }
```

The page's `logTouch` handler converts `followUpInDays` to a `followUpAt` YYYY-MM-DD string in Asia/Manila timezone before POSTing, then calls `/api/leads/[id]/touch`:

```ts
const followUpAt = input.followUpInDays != null
  ? followUpDate(input.followUpInDays)   // see §followUpDate below
  : undefined;

fetch(`/api/leads/${lead.id}/touch`, {
  method: 'POST',
  body: JSON.stringify({ channel, outcome, followUpAt, notes })
});
```

### API endpoint (`src/routes/api/leads/[id]/touch/+server.ts`)

- Auth-gated: 401 if no session; 403 if rep doesn't own the lead (managers bypass)
- Validates body with `logTouchSchema`
- Parses `followUpAt` as `new Date(dateStr + 'T00:00:00+08:00')` (Manila midnight)
- Calls `logLeadTouch(id, { repId, channel, outcome, followUpAt, notes })`
- Returns 200 with the updated `Lead` object

### DB function (`src/lib/server/db/leads.ts` — `logLeadTouch`)

Runs in a single transaction:

1. `SELECT … FOR UPDATE` on the lead (prevents race with soft-delete)
2. `INSERT INTO crm_activities` with channel, outcome, followUpAt, notes, occurredAt=now
3. Compute new stage: if `outcome='replied'` and current stage is `'contacted'` → `'replied'`
4. `UPDATE crm_leads SET last_activity_at=now, stage=newStage, updated_at=now`
5. If stage changed: `INSERT INTO crm_lead_history` with old/new stage values
6. Returns the updated `Lead` (via `dbRowToLead(row, followUpAt)`)

Returns `null` if the lead doesn't exist or is soft-deleted.

### Zod schema (`src/lib/zod/schemas.ts` — `logTouchSchema`)

```ts
z.object({
  channel: z.enum(ACTIVITY_CHANNELS),          // required
  outcome: z.enum(ACTIVITY_OUTCOMES).default('sent'),
  followUpAt: z.string()                        // YYYY-MM-DD, optional
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(s => !isNaN(new Date(s).getTime()))
    .optional(),
  notes: z.string().optional()
})
```

---

## Timezone handling

Follow-up dates use **Asia/Manila (UTC+8, no DST)** throughout.

| Layer | What happens |
|---|---|
| Client (`followUpDate(days)` in `dates.ts`) | Shifts `now` +8h, adds N days on UTC date fields, returns `YYYY-MM-DD` |
| Server (`/touch` endpoint) | Parses `YYYY-MM-DD` as `new Date(dateStr + 'T00:00:00+08:00')` — Manila midnight |
| Reminders queue | Compares stored `follow_up_at` (timestamptz) to `now()` |

This means "3 days from now" always means 3 calendar days in Manila, not 3 × 86 400 seconds of UTC time — no off-by-one-day bugs across the UTC+8 boundary.

```ts
// src/lib/utils/dates.ts
export function followUpDate(days: number, now: Date = new Date()): string {
  const manila = new Date(now.getTime() + 8 * 3_600_000); // shift to Manila clock
  manila.setUTCDate(manila.getUTCDate() + days);           // add days
  return manila.toISOString().slice(0, 10);                // YYYY-MM-DD
}
```

---

## Enum values

### Channels

| UI label | DB value (`ACTIVITY_CHANNELS`) |
|---|---|
| FB DM | `fb_dm` |
| FB comment | `fb_comment` |
| IG DM | `ig_dm` |
| Email | `email` |
| Call | `call` |
| Meeting | `meeting` |
| Other | `other` |

### Outcomes

| UI label | DB value (`ACTIVITY_OUTCOMES`) |
|---|---|
| sent | `sent` |
| replied | `replied` |
| no reply | `no_response` |
| rejected | `rejected` |

`other` is a valid DB value but not shown in the form chips (reserved for snooze activities).

### Follow-up chips

1d / 3d / 7d / 14d — always one is selected (defaults to 3d). There is no "no follow-up" option.

---

## Stage auto-advance

| Current stage | Outcome logged | Result |
|---|---|---|
| `contacted` | `replied` | stage → `replied`; history row written |
| anything else | any | stage unchanged |

Only `contacted → replied` is automatic. All other stage moves are explicit (via the stage picker or Mark Won / Mark Lost buttons).

---

## Activity timeline

`ActivityTimeline.svelte` receives `data.activities` (loaded by `+page.server.ts` via `listActivities(leadId)`). After a successful touch, `invalidateAll()` re-runs the load and the new activity appears at the top (ordered by `occurred_at DESC`).

Each row shows: rep name · channel badge · outcome chip · date/time · note (if any).

---

## Related endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/leads/[id]/touch` | Log an outreach touch (this feature) |
| `POST /api/leads/[id]/snooze` | Defer follow-up without counting as an outreach |
| `POST /api/leads/[id]/activities` | Lower-level insert (used internally; does not auto-advance stage or write history) |

---

## Test coverage

### Unit tests (`src/tests/touch.spec.ts`)

| Suite | Cases |
|---|---|
| `followUpDate` (T-U1) | 1d/3d/7d/14d from fixed base; month boundary; year boundary; UTC midnight picks Manila date; UTC 16:00 picks Manila-next-day |
| `ACTIVITY_CHANNELS` enum coverage (T-U2) | All 7 UI channel keys exist in schema; no extra values |
| `ACTIVITY_OUTCOMES` enum coverage (T-U3) | All 4 UI outcome keys are valid schema values |

### DB integration tests (`src/tests/touch-db.spec.ts`)

Skipped when `DATABASE_URL` is unset. Run with `bun run test:unit:ci` against a live Postgres.

| Suite | Cases |
|---|---|
| Activity row (T-D1) | Channel, outcome, notes, repId stored correctly |
| lastActivityAt (T-D2) | Timestamp bumps after touch |
| followUpAt round-trip (T-D3) | 1d / 3d / 7d / 14d stored and round-trips through Manila timezone offset |
| Stage auto-advance (T-D4) | contacted+replied → replied; contacted+sent → contacted |
| Missing lead (T-D5) | Returns null for non-existent UUID |
| Schema validation (T-D6) | Valid payload; all chip dates; invalid channel; invalid outcome; malformed date; default outcome |

---

## Key files

| File | Role |
|---|---|
| `src/routes/leads/[id]/+page.svelte` | `logTouch()` handler — converts chips to API payload, manages toast/invalidate |
| `src/lib/components/leads/LogTouchForm.svelte` | Chip UI — channel, outcome, follow-up, note textarea |
| `src/lib/components/leads/ActivityTimeline.svelte` | Renders `Activity[]` from page data |
| `src/routes/api/leads/[id]/touch/+server.ts` | POST handler — auth, schema parse, Manila date, calls `logLeadTouch` |
| `src/lib/server/db/leads.ts` — `logLeadTouch` | Transaction: activity insert + lastActivityAt + stage advance + history |
| `src/lib/server/db/leads.ts` — `listActivities` | Fetches activities for the timeline (ordered `occurredAt DESC`) |
| `src/lib/utils/dates.ts` — `followUpDate` | Client-side Manila-aware YYYY-MM-DD computation |
| `src/lib/zod/schemas.ts` — `logTouchSchema` | Validates the POST /touch body |
| `src/tests/touch.spec.ts` | Unit tests (18 cases) |
| `src/tests/touch-db.spec.ts` | DB integration tests (12 cases, DB-skipped in CI) |
