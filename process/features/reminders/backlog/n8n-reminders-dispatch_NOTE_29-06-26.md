---
name: note:n8n-reminders-dispatch
description: "Known-gap residual — live n8n dispatch + Viber/Telegram delivery for reminders (out of code scope)"
date: 29-06-26
feature: reminders
metadata:
  node_type: backlog
  type: note
  feature: reminders
---

# n8n Reminders Dispatch — NEW PLAN REQUIRED

Date: 2026-06-29
Source: VALIDATE (activities-reminders plan, Gate CONDITIONAL) — vacuous-green ban named residual
Status: deferred (known-gap)

## Gap

The live n8n dispatch leg of the reminders loop has no code-side test and is out of the current plan's code scope:

- n8n polls `GET /api/reminders/due` (Bearer `REMINDERS_ENDPOINT_SECRET`) and dispatches per rep — the n8n workflow itself is configured in the n8n UI, not in this repo.
- Real Viber/Telegram chat-channel delivery is TBD (v1 = email fallback only).

## What IS proven by the activities-reminders plan (NOT this gap)

- `GET /api/reminders/due` returns the correct `{ due: DueReminder[] }` shape, sorted, secret-authed (VE-C1, Hybrid).
- `sendReminderDigest()` email-fallback code path no-ops safely without a key and sends via Resend when configured (VE-C2, Fully-Automated).

## Residual (this note)

- Live n8n workflow config + dispatch behavior (external).
- Viber/Telegram delivery channel.

## Files outside blast-radius / new API surface

- N/A — no repo code; external n8n UI config + chat-channel provider integration.

## Suggested follow-up

A separate plan once the chat-channel provider is chosen: define the n8n workflow contract, add a smoke probe (agent-probe) that hits `/api/reminders/due` from an n8n test execution, and document the per-rep dispatch fan-out.
