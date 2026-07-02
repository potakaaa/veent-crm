# reminders

<!-- Part of veent-crm -->

## Scope

Follow-up reminder system. Reps set `follow_up_at` on activities; the secret-authed
`/api/reminders/due` endpoint is polled by n8n to surface due reminders. Covers: follow-up
timestamp management on `crm_activities`, the reminder query (partial index on follow_up_at),
n8n webhook integration, and the reminders UI page.

## Key Source Files

- `src/routes/reminders/+page.svelte` — reminders list UI
- `src/routes/reminders/+page.server.ts` — pending follow-ups load (current user, future follow_up_at)
- `src/routes/+page.server.ts` — Today view load (due/overdue/replied/cold, Manila TZ boundary)
- `src/routes/api/reminders/due/+server.ts` — secret-authed endpoint polled by n8n
- `src/routes/api/reminders/notify/+server.ts` — POST endpoint: groups due reminders by rep, sends branded email digest per rep (secret-authed, same pattern as /api/reminders/due)
- `src/lib/server/email-templates/reminder.ts` — pure `buildReminderDigestHtml()` branded digest builder (inline CSS, no env imports)
- `src/routes/api/leads/[id]/activities/+server.ts` — POST endpoint for logging a touch (201/409/401/400)
- `src/lib/server/reminders.ts` — real `getDueReminders()` + `startOfManilaDayUTC()` helper
- `src/lib/server/db/leads.ts` — `insertActivity()` (dedup tx), `resolveFollowUpAt()`, `dbRowToLead()` (optional 2nd param)
- `src/lib/server/email.ts` — `sendReminderDigest()` (Resend, no-op when key unset)
- `src/lib/utils/dates.ts` — `computeAge(lead, now?)` optional `now` param (fixes server-side urgency staleness)
- `src/lib/components/leads/LogTouchForm.svelte` — all 7 channels sourced from `ACTIVITY_CHANNELS`
- `src/lib/server/db/schema.ts` — `crm_activities.follow_up_at` + partial index; `crm_activities_dedupe_uq`
- `src/tests/reminders.spec.ts` — unit tests for VE-A1, VE-B1, VE-C2

## Env

- `APP_URL` — base CRM URL used for CTA links in reminder emails (e.g. `https://crm.veent.io`). Optional; links degrade gracefully if unset (relative `/leads/...` path, no throw).

## Related Context

- `process/context/all-context.md` — stack and conventions
- `process/features/leads/_GUIDE.md` — activities belong to leads

## Current Status

Status: in-progress (code-complete, EVL green; manual Hybrid/Agent-Probe gates pending)

Automated gates green (EVL confirmed):
- `bun run check` — 0 errors
- `bun run test:unit:ci` — 62 passed
- `bun run build` — exit 0

Pending manual gates (need live Postgres + dev server):
- VE-A1b — dedup no-op (insertActivity second identical insert returns null)
- VE-A2 / VE-A2b — curl POST endpoint; last_activity_at update
- VE-A3 / VE-A4 — UI smoke (log touch, 7-channel dropdown)
- VE-B2 — Today view + Reminders page render from real data
- VE-C1 — GET /api/reminders/due with correct Bearer

Known gap (backlog): live n8n dispatch + Viber/Telegram delivery.
Backlog note: `process/features/reminders/backlog/n8n-reminders-dispatch_NOTE_29-06-26.md`

## Key Patterns (from activities-reminders implementation)

- **`crm_leads` has NO `follow_up_at` column** — `follow_up_at` lives on `crm_activities`. Any view that needs this field must LEFT JOIN `crm_activities` and pass it as the 2nd arg to `dbRowToLead(row, followUpAt)`.
- **Manila TZ boundary** — use `startOfManilaDayUTC()` from `reminders.ts` (`REMINDER_TZ = 'Asia/Manila'`) to compute start-of-day for overdue vs due classification.
- **`dbRowToLead(row, followUpAt?)` optional 2nd param** — callers that use `.map(dbRowToLead)` MUST wrap in an arrow `(row) => dbRowToLead(row)` to prevent array index from leaking in as `followUpAt`.
- **`computeAge(lead, now?)` optional `now` param** — pass `now` explicitly in tests/mocks that need a frozen timestamp; server-side callers use the default (`new Date()`) for live urgency.
- **`sendReminderDigest()` must NOT delegate to `sendEmail()`** — `sendEmail` throws on missing key; `sendReminderDigest` silently no-ops with a `console.warn`. Keep these paths separate.
- **Vitest `$env/dynamic/private` mock** — import the module in your test and mock it to `{ env: {} }` to deterministically exercise no-key code paths without environment setup.

## Folder Contents

```
process/features/reminders/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
