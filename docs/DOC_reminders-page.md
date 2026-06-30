# Reminders Page — Feature Documentation

Route: `/reminders`
Implemented: Phase 8 (2026-06-30)
Status: Code-complete, EVL green. Manual UI + live-DB gate pending.

---

## What It Does

The Reminders page shows a rep their leads that need immediate attention — leads they have fallen behind on or are going cold. It is not a general task list; it surfaces specifically:

- **Overdue** — leads where the rep booked a follow-up activity and that date has passed without action.
- **Going cold** — leads that have had no activity for more than 30 days and have no upcoming follow-up scheduled.

Won, lost, and soft-deleted leads never appear. The rep can snooze an overdue lead (push the follow-up 3 days forward) or nudge it (placeholder — no outbound messaging yet).

---

## Architecture

```text
/reminders
  +page.server.ts     ← auth gate; calls getRemindersQueue(userId)
  +page.svelte        ← renders two groups; snooze via fetch; nudge placeholder
```

No `+page.ts` universal loader exists for this route. A prior `+page.ts` was importing mock data from `$lib/services` and silently overwriting the server data on client-side navigation. It was deleted as part of Phase 8.

---

## DB Query — `getRemindersQueue(userId)`

File: `src/lib/server/db/leads.ts`

```ts
export async function getRemindersQueue(userId: string): Promise<{ overdue: Lead[]; cold: Lead[] }>
```

Delegates entirely to `getTodayQueue(userId)` which:

1. Fetches all non-won, non-lost, non-deleted leads owned by `userId`.
2. In a second query, does `SELECT DISTINCT ON (lead_id)` over `crm_activities` ordered by `occurred_at DESC` to get the latest `follow_up_at` per lead.
3. Maps each row via `dbRowToLead(row, followUpAt)` — the second argument is mandatory here so urgency reflects the scheduled follow-up date.

`getRemindersQueue` then filters and sorts the resulting array:

| Bucket | Filter | Sort |
|--------|--------|------|
| `overdue` | `urgency === 'overdue'` | `followUpAt ASC` (most overdue first) |
| `cold` | `urgency === 'cold'` | `lastActivityAt ASC` (coldest first) |

### Why urgency, not a direct date compare?

`dbRowToLead` calls `computeAge()` which owns the Manila-timezone boundary logic for overdue vs due classification. Rather than duplicating that logic, `getRemindersQueue` reuses the computed `urgency` field. This means urgency semantics (including timezone handling) remain in one place.

### Why delegate to `getTodayQueue` instead of a new query?

`getTodayQueue` already contains the `DISTINCT ON` follow-up join which is the expensive part. Writing a separate query would duplicate that join and risk the two going out of sync. The Today page and Reminders page share the same underlying data shape; they differ only in which urgency buckets they display.

---

## Urgency Classification

`computeAge` in `src/lib/utils/dates.ts` produces an `AgeType`:

| Condition | `age.type` | `urgency` |
|-----------|-----------|-----------|
| `followUpAt` is in the past | `overdue` | `overdue` |
| `followUpAt` is today | `due` | `due` |
| Stage is `replied` | `fresh` | `replied` |
| `lastActivityAt` > 30 days ago | `stale` | `cold` |
| `lastActivityAt` ≤ 30 days ago | `fresh` | `fresh` |
| Otherwise | `normal` | `normal` |

The reminders page shows only `overdue` and `cold`. The `due` bucket (follow-up booked for today but not yet past) is intentionally omitted — it belongs on the Today page, not Reminders.

---

## Snooze Flow

1. Rep clicks **Snooze** on an overdue lead card.
2. `+page.svelte` computes `followUpAt = today + 3 days` in `Asia/Manila` local date format (`en-CA` locale = `YYYY-MM-DD`).
3. `POST /api/leads/{id}/snooze` with `{ followUpAt }` JSON body.
4. On success: `await invalidateAll()` re-runs the server load; the lead disappears from Overdue (its new follow-up is in the future).
5. On failure: error toast; no page refresh.

The snooze API (`src/routes/api/leads/[id]/snooze/+server.ts`) calls `snoozeLead()` in `leads.ts`, which inserts a new scheduling activity without updating `lastActivityAt`. The `DISTINCT ON` query picks up the newest activity, so the new future `followUpAt` supersedes the old past one.

---

## Nudge

Nudge does nothing server-side. Clicking it shows a toast:

```text
Nudge: no outbound messaging integration yet (LeadName)
```

This is intentional. There is no Viber/Telegram/email outbound integration. The button exists as a UI affordance for when that integration is built. See backlog note: `process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md`.

---

## Key Files

| File | Role |
|------|------|
| `src/routes/reminders/+page.server.ts` | Auth gate + `getRemindersQueue` call |
| `src/routes/reminders/+page.svelte` | Overdue/cold groups, snooze fetch, nudge toast |
| `src/lib/server/db/leads.ts` | `getRemindersQueue`, `getTodayQueue`, `snoozeLead` |
| `src/lib/utils/dates.ts` | `computeAge` — urgency classification |
| `src/routes/api/leads/[id]/snooze/+server.ts` | POST snooze endpoint |
| `src/tests/reminders.spec.ts` | Unit tests VE-A1, VE-B1, VE-C2, VE-R1 |
| `src/tests/reminders-db.spec.ts` | DB integration tests (10 cases) |

---

## Test Coverage

### Unit (VE-R1) — `src/tests/reminders.spec.ts`

All pure, no DB, always run:

- Overdue lead with past `followUpAt` appears as overdue ✓
- Future `followUpAt` does not appear as overdue ✓
- Lead idle >30 days with no follow-up is cold ✓
- Lead idle exactly 30 days is NOT cold (threshold is strictly >30) ✓
- Won lead excluded (urgency is not overdue or cold) ✓
- Lost lead excluded ✓
- Overdue sort: earlier `followUpAt` first ✓
- Cold sort: earlier `lastActivityAt` first ✓
- Identical `followUpAt` sort is stable (no NaN) ✓

All date arithmetic is relative to `Date.now()`, not a fixed reference date, because `dbRowToLead` calls `computeAge` with live `new Date()`.

### DB Integration — `src/tests/reminders-db.spec.ts`

Skipped when `DATABASE_URL` is unset (`describe.skipIf(SKIP_DB)`):

- Past follow-up appears in overdue bucket ✓
- Future follow-up does not appear in overdue ✓
- Overdue sorted earliest first ✓
- Lead idle >30 days appears in cold ✓
- Lead idle ≤30 days does not appear in cold ✓
- Cold sorted by `lastActivityAt` ascending ✓
- Soft-deleted lead excluded from both buckets ✓
- Won lead excluded ✓
- Lost lead excluded ✓
- Snooze (insert newer activity with future `followUpAt`) removes lead from overdue ✓

---

## Honest Limitations

- **No team view.** Reminders shows only leads owned by `locals.user.id`. Managers cannot see their reps' overdue queues on this page.
- **No outbound nudge.** Nudge is a placeholder toast.
- **Manila TZ only.** The overdue/due boundary is hardcoded to `Asia/Manila` in `computeAge`. Multi-timezone support is not planned.
- **No pagination.** The reminders queue is assumed small (owned + active + overdue/cold). If a rep has hundreds of overdue leads, the page loads them all.
