---
name: plan:name-split-first-last-spec
description: "Product-discovery SPEC for GitHub issue #277 — split crm_users.name into first_name + last_name with template variable support"
date: 08-07-26
feature: team
---

# Name Split (First/Last) — SPEC

**GitHub issue:** #277 — "feat: Split user name into first_name + last_name with template variable support"
**Date:** 2026-07-08
**Feature:** team (primary), templates touchpoint (leads feature)
**Status:** Locked — ready for INNOVATE/PLAN

---

## Summary

Today every team member (rep, manager, super manager) has one plain-text `name` field. This
makes it awkward to write personalized outreach templates ("Hi, this is {{repName}}") when a
sales rep wants to sign off with just their first name, or a template wants both first and last
name in different places. This change adds a proper **first name** and **last name** to every
team member, lets managers/self-service editors fill them in as two separate fields instead of
one, and gives template writers two new building blocks — `{{repFirstName}}` and
`{{repLastName}}` — while every screen and template that already shows a person's full name
keeps working exactly as it does today, with no visible change and no re-typing required.

---

## User Stories / Jobs To Be Done

1. **As a manager editing a team member's profile**, I want to enter their first name and last
   name as two separate fields, so that the system has properly structured name data going
   forward instead of one free-text blob.

2. **As a rep editing my own profile** (`/profile`), I want to enter my first and last name
   separately, so my name is stored consistently with everyone else's.

3. **As a manager adding a new team member**, I want the "add team member" form to ask for
   first name and last name (not one combined name field), so new records start out
   structured correctly.

4. **As a rep writing an outreach message from a template**, I want to use `{{repFirstName}}`
   or `{{repLastName}}` when I only want part of my name to appear, in addition to the
   existing `{{repName}}` token that already inserts my full name, so I have more flexibility
   in how my message reads.

5. **As any user of the CRM (viewing pipeline, leads, calendar, dashboard, meetings,
   reminders, reports, or activity history)**, I want every screen that currently shows a
   person's name to keep showing the same name after this change ships, so nothing looks
   broken or blank the day this goes live.

---

## What The User Wants (Behavioral Outcomes)

- Every existing team member, immediately after this ships, has a first name automatically
  filled in with their current full name exactly as it was before (nothing is lost, nothing is
  guessed or split apart) and an empty last name. No one needs to fix anything for the app to
  keep working.
- The `/team` per-member edit screen, the `/profile` self-edit screen, and the "add team
  member" screen now show two inputs — First Name and Last Name — instead of one Name input.
  First Name is required (can't be left blank); Last Name is optional.
- Every place in the app that currently displays a person's name (pipeline board, leads list,
  lead detail, calendar, dashboard, meetings, reminders, reports, activity/audit history, the
  rep filter dropdown, etc.) continues to display the same combined name as before — with no
  code changes needed on those screens and no visual difference to the end user.
- Outreach message templates that already use `{{repName}}` keep working unchanged and keep
  inserting the rep's full name.
- Outreach message templates can now ALSO use `{{repFirstName}}` and `{{repLastName}}` to
  insert just one part of a rep's name. The template-editing help text is updated so writers
  know these two new tokens exist.
- Nobody needs to touch Better Auth's own login/session system for this to work — it is
  unaffected.

---

## Flow / State Diagram

### Data shape change (one-time, automatic)

```
BEFORE                                  AFTER (this feature)
┌─────────────────────┐                ┌─────────────────────────────────┐
│ crm_users            │                │ crm_users                        │
│  name: "Jane Diaz"    │   ──ships──▶   │  first_name: "Jane Diaz" (kept   │
│                       │                │              verbatim, required)│
│                       │                │  last_name:  NULL (empty)       │
└─────────────────────┘                └─────────────────────────────────┘
                                         (no name column is deleted — the
                                          app still shows a combined name,
                                          computed on the fly, see below)
```

### Editing flow (manager or self-service)

```
 [/team row] or [/profile] or [add team member form]
        │
        ▼
 Edit screen now shows:
   First Name*  [___________]   (required)
   Last Name    [___________]   (optional)
        │
        ▼ Save
 Validation: First Name required → error shown inline if blank
 Last Name optional → blank is fine
        │
        ▼ success
 Screen refreshes; combined display name updates everywhere that person
 appears (pipeline, leads, calendar, etc.) automatically
```

### Template variable flow

```
 Template body contains tokens, e.g.:
   "Hi, this is {{repFirstName}} from Veent. {{repName}} will follow up."

 At send/preview time:
   {{repFirstName}}  →  "Jane"
   {{repLastName}}   →  "Diaz"      (blank if last name not set)
   {{repName}}        →  "Jane Diaz" (unchanged existing behavior)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC1 — Existing team members keep their name after the change ships.**
Every current team member's displayed full name is identical before and after this change —
nothing is blank, nothing is re-split or guessed.
`proven by:` schema-migration backfill verification (row-level check: `first_name` for every
pre-existing row equals its prior `name` value verbatim; `last_name` is empty).
`strategy:` Hybrid (live-DB check; no live DB in this dev environment — known-gap until a
live-DB harness run, same class as other recent features per current project state).

**AC2 — Managers can edit a team member's first and last name from `/team`.**
Opening the edit screen for any team member on `/team` shows separate First Name and Last
Name inputs; saving persists both and the row's displayed name updates immediately.
`proven by:` manual/hybrid verification of the `/team` edit modal (mirrors existing
`team-member-profile-edit_07-07-26` Hybrid live-DB gate pattern).
`strategy:` Hybrid.

**AC3 — Reps can edit their own first and last name from `/profile`.**
The self-service `/profile` page shows the same two-field editor for the signed-in user's own
name; saving persists both fields.
`proven by:` manual/hybrid verification of `/profile` self-edit.
`strategy:` Hybrid.

**AC4 — Adding a new team member asks for first and last name.**
The "add team member" form (wherever a new user's name is currently entered) shows First Name
(required) and Last Name (optional) instead of a single Name field.
`proven by:` manual/hybrid verification of the add-team-member form.
`strategy:` Hybrid.

**AC5 — First Name is required; Last Name is optional, everywhere it's edited.**
Submitting any of the three edit surfaces above with a blank First Name is rejected with a
visible inline error; submitting with a blank Last Name succeeds.
`proven by:` automated schema/unit test on the new/updated Zod validation schema (empty first
name fails, blank last name passes, both filled passes).
`strategy:` Fully-Automated.

**AC6 — `{{repFirstName}}` and `{{repLastName}}` work as new template tokens.**
Inserting `{{repFirstName}}` into a template body and filling it for a given rep produces that
rep's first name; `{{repLastName}}` produces their last name (or blank if unset).
`proven by:` automated unit test on the template-substitution helper (`fillTemplate`) covering
both new tokens, including the blank-last-name case.
`strategy:` Fully-Automated.

**AC7 — `{{repName}}` keeps working unchanged.**
Existing templates that use `{{repName}}` continue to produce the rep's full combined name
exactly as before, with no editing required on any existing template.
`proven by:` automated unit test asserting `{{repName}}` substitution is unchanged (regression
test alongside AC6's new-token tests).
`strategy:` Fully-Automated.

**AC8 — No visual regression on any existing name-display surface.**
Every existing screen that shows a person's name (pipeline, leads list, lead detail, calendar,
dashboard, meetings, reminders, reports, activity/audit history, rep-filter dropdown) shows the
same name after this change as before, without those screens' own code being edited.
`proven by:` full regression run of the existing automated test suite (`bun run test:unit:ci`)
plus a targeted check that the derived/computed full-name field used by session and user
mapper functions produces the same string as the old stored `name` value for every seeded
user.
`strategy:` Fully-Automated (unit/regression suite) + Hybrid (live-DB row-level spot check).

**AC9 — Template help text documents the new tokens.**
The placeholder help text shown to template authors (on the templates page) lists
`{{repFirstName}}` and `{{repLastName}}` alongside the existing token list.
`proven by:` manual visual check of the templates page help text.
`strategy:` Manual (browser).

**AC10 — Better Auth's own user table is untouched.**
No migration or code change targets Better Auth's `user`/`account`/`session`/`verification`
tables; only `crm_users` (our own Drizzle-managed table) is modified.
`proven by:` migration-file review — confirms the generated migration only touches
`crm_users`.
`strategy:` Fully-Automated (code/migration review as part of typecheck + migration diff read).

---

## Out Of Scope

- **Better Auth's own `user` table.** Never touched — it is not this app's display-name
  source and project convention forbids Drizzle migrations on Better Auth-managed tables.
- **Splitting existing multi-word names into first + last automatically.** No heuristic or
  word-splitting logic is applied to existing data. Every existing row's entire current `name`
  value becomes its `first_name` verbatim; `last_name` stays empty until a human edits it.
- **Any new "full name" UI input beyond the internal derived/computed field.** Users only ever
  type First Name / Last Name in the UI — there is no separate raw "full name" text box
  anywhere.
- **Snake_case template tokens** (`{{rep_first_name}}`, `{{rep_last_name}}`) as literally
  written in the original GitHub issue — this SPEC uses camelCase (`{{repFirstName}}`,
  `{{repLastName}}`) to match the existing `{{repName}}`/`{{organizerName}}`/`{{eventName}}`
  convention.
- **Editing every individual render surface that currently shows `.name`** (~20 places across
  pipeline/leads/calendar/dashboard/etc.). These are satisfied by the derived/computed name at
  the mapper/type layer, not by touching each screen.
- **Any change to the non-self name-edit permission model** (already a documented,
  pre-existing accepted gap from `team-member-profile-edit_07-07-26` — actor-role-only check,
  not target-role-aware). This SPEC does not reopen or fix that.

---

## Constraints

- **Migration number:** next migration is 0033 (journal last idx=32). Existing unrelated
  drift (duplicate `0014` prefix) does not block this and is not this SPEC's concern.
- **`first_name` is NOT NULL; `last_name` is nullable.** Backfill for `first_name` copies the
  entire existing `name` value verbatim for every row — no word-splitting or heuristics.
  `last_name` is NULL for all pre-existing rows.
- **Backward compatibility is achieved via a derived/computed field, not a stored column.**
  `SessionUser`/`User` (and any place that reads `.name`) keep working through a computed value
  = `firstName + (lastName ? ' ' + lastName : '')`, populated in the mapper layer
  (`dbUserToUser`, `sessionToUser`, session hydration) — not by keeping a redundant stored
  `name` column that could drift out of sync.
- **Only three UI surfaces gain new first/last inputs:** the `/team` per-row edit modal, the
  `/profile` self-service page, and the add-team-member form. No other UI surface changes.
- **New template tokens use camelCase**, matching the existing convention
  (`{{repFirstName}}`, `{{repLastName}}`), and sit alongside the unchanged `{{repName}}`.
- **Never write Drizzle migrations for Better Auth-managed tables** — a standing project rule,
  not new to this feature.
- **Soft-delete / no destructive change** — this is an additive column change; no existing data
  is deleted or overwritten destructively.

---

## Open Questions

None. All decisions needed to write this SPEC were locked by the user before this session
(migration approach, backward-compat strategy, which UI surfaces change, token naming, and
migration number) and are captured above as settled Constraints, not open items.

---

## Background / Research Findings

- **Target table:** `crm_users` (`src/lib/server/db/schema.ts:75-100`, our own Drizzle-managed
  table). Currently `name: text('name').notNull()`. Better Auth's own `user.name` is a
  different table entirely and is out of scope.
- **Next migration number:** 0033 (journal last idx=32); pre-existing unrelated drift
  (duplicate 0014 prefix) does not block this work.
- **Template variable system:** `fillTemplate()` at `src/lib/data/templates.ts:18-23` (confirmed
  current — file docstring notes the template *library* itself moved to DB-backed storage in a
  prior phase, but `fillTemplate` itself, the function this SPEC extends, is unchanged and
  still the pure substitution helper). `TemplateVars` type currently
  `{ organizerName, eventName, repName }`. Caller chain: `leads/[id]/+page.svelte:1063`
  (`repName={data.me.name}`) → `LogTouchForm.svelte:56-61`. Template help text lives at
  `src/routes/templates/+page.svelte:538`.
- **Prior shipped surface this extends:** `team-member-profile-edit_07-07-26` (CODE DONE) —
  added the `/team` per-row edit-name modal, the new `/profile` self-service page, and
  `userNameEditSchema` (`src/lib/zod/schemas.ts:249`, currently
  `userFormSchema.pick({ name: true })`), plus `PATCH /api/users/[id]` (already accepts
  `name`). That plan's validate-contract also recorded a known, accepted gap: the non-self
  name-edit permission check is actor-role-only (not target-role-aware) — this SPEC inherits
  that gap unchanged and does not attempt to fix it (see Out Of Scope).
- **`name` field threads through:** `SessionUser`
  (`src/lib/server/auth.ts:23-28`), `User` (`src/lib/types/index.ts:36-45`),
  `dbUserToUser` (`src/lib/server/db/leads.ts:143-151`), `sessionToUser`
  (`src/lib/server/db/users.ts:240-247`), and roughly 20 render surfaces across pipeline,
  leads, calendar, dashboard, meetings, reminders, reports, activity audit, and the rep-filter
  combobox. The locked backward-compat strategy (derived/computed `name` field populated in
  these four mapper/hydration points) means none of those ~20 render surfaces need individual
  edits.
- **User's locked decisions (verbatim, from the orchestrator's task brief):**
  1. Migration approach — no name splitting; `first_name` (NOT NULL, backfilled verbatim from
     `name`) + `last_name` (nullable, NULL for existing rows).
  2. Backward-compat via a derived/computed `name` field (not a stored column) in the mapper
     layer — zero changes needed across ~20 existing display surfaces.
  3. Only `/team` edit modal, `/profile`, and the add-team-member form get new first/last
     inputs.
  4. Template tokens are camelCase (`{{repFirstName}}`/`{{repLastName}}`), matching existing
     convention; `{{repName}}` keeps working unchanged; help text at
     `templates/+page.svelte:538` gets updated.
  5. Migration number: 0033.
