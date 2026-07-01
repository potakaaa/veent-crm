---
name: plan:ufg-inline-edit-review-removal-spec
description: "Product-discovery SPEC for GitHub issue #90 — inline editing in Up for Grabs and removal of the Review Queue"
date: 01-07-26
feature: leads
---

# SPEC — Inline Editing in Up for Grabs + Review Queue Removal

Source: GitHub issue #90

## Summary

Right now, if a rep or manager spots a lead in the "Up for Grabs" list with the wrong location,
category, or other detail, they have to click into the full lead detail page just to fix it —
and there's a whole separate "Review Queue" page whose only real job was catching leads with bad
or missing data so someone could go edit them. This SPEC covers two connected changes: (1) let
people fix a lead's key fields right there in the Up for Grabs list, without leaving the page,
and (2) since Up for Grabs can now do that triage/fix job itself, retire the Review Queue page
and the `needs_review` flag that powered it. The result is one place to catch and fix
low-quality unclaimed leads instead of two overlapping ones.

## User Stories / Jobs To Be Done

1. **As a rep browsing Up for Grabs**, I want to fix an obviously wrong field (like location or
   category) on a lead right in the list, so that I don't have to open the full lead page just
   to make a small correction before claiming it.

2. **As a manager reviewing Up for Grabs**, I want the same inline-edit ability as reps, so I can
   clean up data quality issues across the team's unclaimed leads without extra clicks.

3. **As a rep or manager who spots a lead that's unsalvageable (spam, duplicate, wrong event)**,
   I want to still be able to discard it, so that bad data doesn't linger — even though that
   action now lives on the lead detail page instead of a dedicated Review Queue.

4. **As anyone using the app's navigation**, I want the Review Queue link and its badge to be
   gone once the feature is removed, so the nav doesn't point at a dead page or show a counter
   for a flag that no longer exists.

## What The User Wants (Behavioral Outcomes)

- In the Up for Grabs list, editable fields (location, category, and the other key attributes
  already editable on the lead detail page) show a visible edit affordance. Clicking it opens an
  inline editor without navigating away from the list.
- Saving an inline edit updates the list immediately — no full page reload, and the row reflects
  the new value right away.
- Any authenticated rep or manager can inline-edit a lead in Up for Grabs, specifically because
  every lead shown there is unclaimed (`ownerId` is null). This does not change who can edit
  *claimed* leads elsewhere in the app — that permission rule is unchanged.
  - **Known Gap:** the exact mechanism (a permission-check code change vs. an alternate UI-level
    gate) is an implementation decision — INNOVATE/PLAN will choose it. This SPEC only fixes the
    *outcome*: unclaimed leads are inline-editable by any authenticated rep or manager.
- The Review Queue page (`/review`) no longer exists as a destination. Any nav link or badge that
  pointed to it (sidebar, topbar) is gone — no dead links, no orphaned counters.
- The "discard a bad lead" capability that used to live only on the Review Queue is still
  available somewhere in the app — it moves to the lead detail page (`/leads/[id]`).
- The `needs_review` flag is fully gone: it no longer exists in the data model, nothing sets it,
  nothing reads it, and no page or nav element displays anything derived from it. No replacement
  "needs attention" signal is introduced as part of this change.

## Flow / State Diagram

**Happy path — inline edit in Up for Grabs**

```text
[Up for Grabs list]
   |
   | rep/manager clicks an editable field on a row
   v
[Inline editor opens for that field/lead]
   |
   | user changes value, confirms
   v
[Save request sent in background]
   |
   +-- success --> [Row updates in place, editor closes, no reload]
   |
   +-- failure --> [Error shown inline, prior value stays, editor stays open for retry]
```

**Discard flow — relocated**

```text
Before:                                   After:
[Review Queue row]                        [Lead detail page]
   |-- Discard button --> lead soft-deleted   |-- Discard action --> lead soft-deleted
                                               (Up for Grabs list itself has
                                                no discard affordance)
```

**Review Queue removal — state before/after**

```text
BEFORE                                    AFTER
Nav: Sidebar/Topbar --> /review           Nav: Sidebar/Topbar has no /review entry
/review page exists, shows                /review route does not exist (404/removed)
  leads WHERE needs_review = true
needs_review column exists in schema,     needs_review column removed from schema
  set at ingest, read in 5+ places          and every read/write site
```

## Acceptance Criteria (Testable Outcomes)

1. **Clicking an editable field in the Up for Grabs list opens an inline editor for that field
   (location, category, and the other key attributes already editable via the existing lead-edit
   modal), without navigating to a new page.**
   proven by: new Playwright e2e scenario covering the Up for Grabs inline-edit flow (to be added
   under `src/tests/`, e2e tier — no existing e2e specs exist yet in this repo; this is the first).
   strategy: Fully-Automated

2. **Saving an inline edit persists the change and updates the visible row without a full page
   reload.**
   proven by: same Up for Grabs inline-edit e2e scenario (asserts row value updates post-save,
   no navigation event) + existing `src/tests/optimistic.spec.ts` pattern reused for the
   optimistic-update unit behavior.
   strategy: Fully-Automated

3. **A rep (non-owner, non-manager) can open and save an inline edit on an unclaimed lead
   (`ownerId === null`) in Up for Grabs.**
   proven by: unit test on the updated `canEditLead` permission function (extends
   `src/tests/leads.spec.ts` or `src/tests/leads-db.spec.ts` — exact file decided in PLAN) +
   the same e2e scenario run under a rep session.
   strategy: Fully-Automated

4. **A rep cannot use this same mechanism to edit a lead that already has an owner other than
   themselves — the scoped permission exception applies only to unclaimed leads.**
   proven by: unit test asserting `canEditLead` still returns false for a rep on a claimed lead
   they don't own (regression case in the same permission test file as #3).
   strategy: Fully-Automated

5. **The `/review` route no longer resolves as a page — visiting it does not render the old
   Review Queue UI.**
   proven by: e2e or integration check asserting the route is gone (404 or redirect, per
   PLAN's chosen removal mechanism) + `src/tests/leads.spec.ts` no longer references
   `listReviewLeads`.
   strategy: Fully-Automated

6. **No navigation surface (sidebar or topbar) links to `/review`, and no nav badge derived from
   `needs_review` counts is rendered.**
   proven by: component-level check on `AppSidebar.svelte` / `AppTopbar.svelte` (unit or
   snapshot-style test) confirming absence of the review link/badge markup.
   strategy: Fully-Automated

7. **The discard-a-lead action (previously only reachable from Review Queue) is available on the
   lead detail page (`/leads/[id]`).**
   proven by: e2e scenario opening a lead detail page and completing the discard flow
   (soft-delete confirmed via `deletedAt` set, lead disappears from active lists).
   strategy: Fully-Automated

8. **The `needs_review` column is removed from the schema (migration applied) and no query,
   route handler, or import script sets or reads it anywhere in the codebase.**
   proven by: `bun run check` (TypeScript compile — any lingering reference to a removed field
   fails the build) + a repo-wide grep gate (`grep -r needs_review src/ scripts/` returns no
   matches) run as part of the validate-contract test gates + updated
   `src/tests/import.spec.ts` no longer asserting `needs_review` values.
   strategy: Fully-Automated

9. **`getNavCounts` (or its replacement) no longer computes or exposes a "needs review" count.**
   proven by: unit test on the nav-counts endpoint/function confirming the field is absent from
   its return shape.
   strategy: Fully-Automated

10. **Existing test suites that reference `needs_review` (`import.spec.ts`, `leads.spec.ts`,
    `leads-db.spec.ts`, `reminders.spec.ts`) are updated and pass — no lingering assertions on a
    field that no longer exists.**
    proven by: full `bun run test:unit` run (validate-contract gate) — all four spec files pass
    with `needs_review` assertions removed or replaced.
    strategy: Fully-Automated

## Out Of Scope

- **No replacement "needs attention" signal.** This change removes `needs_review` outright. It
  does not introduce any new flag, badge, or queue that re-creates the same triage concept under
  a different name. If a future need for a data-quality signal arises, that is a separate,
  future SPEC.
- **No discard affordance added to Up for Grabs.** Up for Grabs gets inline *editing* only. The
  discard/soft-delete action is relocated to the lead detail page, not duplicated into the Up for
  Grabs list itself.
- **No migration to Superforms.** The existing Review Queue edit pattern (fetch + Zod,
  `PATCH /api/leads/{id}`, optimistic UI, `invalidateAll()`) is the established convention for
  this kind of edit and is reused as-is for Up for Grabs. This SPEC does not change that pattern
  to match CLAUDE.md's stated (but not actually followed) Superforms convention.
  - **Note for reviewer:** CLAUDE.md documents Superforms as the mandatory form pattern, but the
    Review Queue's actual, already-shipped edit implementation uses fetch+Zod instead. This SPEC
    intentionally reuses the real established pattern rather than the documented-but-unused one,
    to avoid introducing a second, inconsistent edit mechanism. This gap between documented
    convention and actual practice is flagged for `UPDATE PROCESS` to reconcile later — it is not
    something this feature's implementation should silently "fix" as a side effect.
- **No changes to how leads are claimed, staged, or otherwise transitioned.** Only field-level
  editing and the Review Queue removal are in scope.
- **No permission changes beyond the scoped unclaimed-lead exception.** `canEditLead` behavior for
  claimed leads (owner-only or manager) is unchanged.
- **Archival of the conflicting `reports-echarts-review-queue` plan is not performed by this
  SPEC.** This SPEC only notes the conflict (see Constraints); actual archival/supersession is a
  housekeeping action for a later phase (PLAN or UPDATE PROCESS).

## Constraints

- **Reuse, don't rebuild:** the inline editor for Up for Grabs must be built on the existing
  `LeadEditModal.svelte` + `PATCH /api/leads/{id}` pattern already proven in Review Queue — not a
  new, separate editing mechanism.
- **Permission scope is narrow:** the `canEditLead` change is limited to `ownerId === null`
  leads. It must not broaden edit access to claimed leads for non-owners/non-managers.
- **Full `needs_review` removal touches many files** (per RESEARCH): schema/migration, ingest
  route (`src/routes/api/leads/ingest/+server.ts`), `scripts/import.ts` /
  `src/lib/server/import-utils.ts` (`mapCategory()`), `listReviewLeads`, `getNavCounts`,
  `AppSidebar.svelte`, `AppTopbar.svelte`, `AppShell.svelte`, `RouteShells` skeleton, types,
  both mock data files, `leads/[id]/+page.svelte`, and test files `import.spec.ts`,
  `leads.spec.ts`, `leads-db.spec.ts`, `reminders.spec.ts`, plus seed/verify scripts. All of
  these must be updated consistently — a partial removal (e.g. schema column dropped but a query
  still references it) is not acceptable.
- **Discard capability must not be lost.** `DiscardIssueModal.svelte` currently only exists wired
  into `/review`. Removing `/review` without relocating this modal would silently remove the only
  way to discard a bad lead — this is called out explicitly as a hard requirement, not a nice-to-have.
- **Existing conflicting plan:** `process/features/reports/active/reports-echarts-review-queue_29-06-26/`
  has open acceptance criteria (AC8/AC9) that target `/review` as a deliverable. That plan must be
  marked superseded once this work proceeds — noted here as a dependency, not resolved by this SPEC.
- **Soft-delete only, per repo convention:** the relocated discard action must continue to soft-delete
  (`deletedAt`), never hard-delete, consistent with existing repo-wide convention.

## Open Questions

None. All decisions needed to lock this SPEC were made by the user this session (see below) and
are captured in the sections above.

## Background / Research Findings

- Up for Grabs (`src/routes/unassigned/`) currently has no edit affordance — rows show name,
  handle, category, event, stage, source only.
- Review Queue (`src/routes/review/`) already implements the exact edit pattern needed:
  `LeadEditModal.svelte` (edits name, category, platform, location, email, phone, pageUrl,
  socials, eventName/link/date, notes) via `PATCH /api/leads/{id}` — fetch + Zod, optimistic UI,
  `invalidateAll()`. This is directly reusable for Up for Grabs, and is the actual established
  pattern despite CLAUDE.md documenting Superforms as the convention.
- `needs_review` is set at ingest time (`src/routes/api/leads/ingest/+server.ts`,
  `scripts/import.ts` via `mapCategory()` in `src/lib/server/import-utils.ts`) as a data-quality
  flag (bad/missing category OR no contact method) — not purely a queue-membership flag. It's
  read in `listReviewLeads`, `getNavCounts` (nav badges), `dbRowToLead`, and displayed on
  `leads/[id]/+page.svelte`. Full removal touches 15+ files, enumerated in Constraints above.
- `canEditLead` (`src/lib/utils/permissions.ts`) currently returns true only for managers or the
  lead's owner — it blocks reps from editing unclaimed leads (`ownerId === null`). Since Up for
  Grabs shows only unclaimed leads, this blocks the feature entirely unless resolved.
- `DiscardIssueModal.svelte` (soft-delete a bad lead) currently only exists wired into `/review`
  — nowhere else in the app. Deleting `/review` without relocating this modal removes the
  capability entirely.
- Active plan `process/features/reports/active/reports-echarts-review-queue_29-06-26/` still has
  open acceptance criteria (AC8/AC9) targeting `/review` as a deliverable — will need to be
  marked superseded once this work lands.
- Two nav surfaces link to `/review`: `AppSidebar.svelte` (nav item + badge) and
  `AppTopbar.svelte` (icon button + badge), both wired through `AppShell.svelte` →
  `getNavCounts()`.

**Decisions locked this session (user-confirmed, not to be re-litigated in INNOVATE/PLAN):**

- Discard flow moves to `/leads/[id]` (lead detail page). Up for Grabs stays scoped to inline
  field editing only.
- `canEditLead` gets a scoped exception: `ownerId === null` leads are editable by any
  authenticated rep or manager. Claimed-lead permissions are unchanged.
- `needs_review` gets full removal with no replacement signal.
- The conflicting `reports-echarts-review-queue` plan will be marked superseded (noted here;
  actual archival happens later in the workflow, not as part of this SPEC).
