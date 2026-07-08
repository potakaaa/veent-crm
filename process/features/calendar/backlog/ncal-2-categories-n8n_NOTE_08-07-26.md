---
name: note:ncal-2-categories-n8n
description: n8n silently discards CATEGORIES field — ICS written by Nextcloud has no CATEGORIES line
date: 08-07-26
metadata:
  node_type: memory
  type: note
  feature: calendar
---

# Backlog: n8n Drops CATEGORIES in ICS

**Priority:** Low
**Discovered:** NCAL-2 EVL live probe (08-07-26)
**Status:** Non-blocking known-gap

## Problem

When the CRM sends a `categories` field to the n8n "Create/Update Calendar Event" webhook, n8n receives the value but does NOT write a `CATEGORIES:` line to the ICS it passes to Nextcloud CalDAV PUT. The resulting event in Nextcloud has no CATEGORIES property.

## Root Cause

n8n's ICS builder template does not map the `categories` input field to a CATEGORIES ICS property. This is an n8n flow configuration limitation, not a CRM code issue.

## Impact

Calendar events created via NCAL-2 will not carry CATEGORIES metadata in Nextcloud. In this CRM, `categories` is a metadata-only field (no feature depends on filtering or displaying event categories). Non-blocking.

## Fix Options

1. Update the n8n flow to include `CATEGORIES:${categories}` in the ICS template — requires n8n flow config change outside the CRM codebase.
2. Drop `categories` from `createCalendarEventSchema` / `updateCalendarEventSchema` to avoid misleading callers — low-value cleanup.

## Out of Scope for NCAL-2

NCAL-2 is VERIFIED. This gap is a deploy-time n8n config concern, not a CRM code defect. Reopening NCAL-2 is not warranted.
