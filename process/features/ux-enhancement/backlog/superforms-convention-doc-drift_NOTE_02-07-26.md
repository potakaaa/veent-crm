---
name: plan:superforms-convention-doc-drift
description: "process/context/all-context.md's Mandatory Convention 'Superforms + Zod for all forms' does not match actual repo practice — zero real superForm() usage found anywhere"
date: 02-07-26
feature: ux-enhancement
metadata:
  node_type: memory
  type: backlog
  feature: ux-enhancement
---

# Superforms Convention Doc Drift (all-context.md)

## Problem

`process/context/all-context.md` §Key Patterns and Conventions states as a Mandatory Convention:

> "Superforms + Zod for all forms — every form uses `superforms` with a Zod schema from
> `src/lib/zod/schemas.ts`. No raw `FormData` handling."

This does not match actual repo practice. Confirmed independently across two separate PVL cycles
during Phase 4 (Forms) of the `sitewide-ux-refresh` phase program (`sitewide-ux-refresh-umbrella_PLAN_02-07-26.md`):

- `grep -rn "superForm(" src/` → zero matches repo-wide.
- `grep -rn "sveltekit-superforms" src/` → exactly one hit, a code comment in
  `src/routes/templates/+page.server.ts` documenting why the package is deliberately NOT used
  (importing `sveltekit-superforms/adapters` breaks the Vitest gate via a `typebox@1.3.0`
  transitive-dependency conflict — the barrel has no subpath export other than `.`/`./client`/
  `./server`/`./adapters`, and the adapters barrel unconditionally re-exports `typebox.js`, which
  throws at import time: `TypeError: The superclass is not a constructor.`).
- `templates`, `team`, `leads/new`, and `MeetingFormModal` all use plain client-side
  `schema.safeParse()` + raw `fetch()` POST instead — this is the actual, consistent idiom in force
  today, not Superforms.

## Root cause

The convention line in `all-context.md` appears aspirational (written when Superforms was intended
to be adopted) but was never updated after the `typebox@1.3.0` conflict made
`sveltekit-superforms/adapters` unusable, and the repo settled on `safeParse()` + `fetch()` as its
real, working idiom everywhere forms exist.

## Fix options

- **(A) Update `all-context.md` §Mandatory Conventions** to describe the actual client-`safeParse()`
  + `fetch()` idiom (matching `templates`, `team`, `leads/new`, `MeetingFormModal`), and drop or
  reframe the "Superforms + Zod for all forms" line. Lowest-risk, purely a documentation fix.
- **(B) Open a separate migration effort** to actually adopt `superForm()`/`use:enhance` across all
  forms once the `typebox`/`sveltekit-superforms/adapters` conflict is fixed upstream (or safely
  pinned) — larger scope, not a quick fix, and not required by any current SPEC.
- **(C) Do nothing** — leave the doc/reality mismatch as-is. Not recommended; misleads any future
  agent or contributor reading `all-context.md` into believing Superforms is the working convention.

## Recommendation

(A) — update the documented convention to match reality. This was explicitly flagged during Phase 4
PVL (Cycle 0/1) and EXECUTE (E1) as a doc-drift item for UPDATE PROCESS to reconcile, but the actual
`all-context.md` edit was deliberately deferred to this backlog note per the UPDATE PROCESS task
instructions for this session (no direct edit made in this pass).

## Status

Resolved 02-07-26 — `all-context.md` §Key Patterns and Conventions and §Technology Stack both
updated (during the whole-program `sitewide-ux-refresh` UPDATE PROCESS closeout) to describe the
actual client `safeParse()` + `fetch()` idiom and drop the "Superforms + Zod for all forms" claim.
Option (A) from the Fix options above was applied verbatim.
