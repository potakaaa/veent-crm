---
name: plan:organizer-lead-tagging-ui-spec
description: "Product-discovery SPEC for tagging/untagging a lead to an organizer from the lead detail page, reusing the existing PATCH /api/leads/[id]/organizer endpoint"
date: 06-07-26
feature: organizers
---

# SPEC — Tag Lead to Organizer (Lead Detail UI)

## Summary

Leads can already be linked to an organizer in the database, and the Organizers feature (#189/#190) now gives the team a place to view organizers and their linked leads — but there is still no way for a person to actually set or change that link from a lead's own page. This work adds a simple "pick from existing organizers" control to the lead detail page, so a sales rep can tag a lead to the organizer it belongs to, change that tag, or clear it, without needing developer/database access. No new backend work is needed — the endpoint that saves this change already exists and is already tested.

## User Stories / Jobs To Be Done

1. **As a** sales rep, **I want** to tag a lead to the organizer it belongs to from the lead's own page, **so that** the lead shows up correctly in that organizer's event history without anyone editing the database by hand.
2. **As a** sales rep, **I want** to change which organizer a lead is tagged to, **so that** I can correct a mistake or re-tag a lead if it was linked to the wrong organizer.
3. **As a** sales rep, **I want** to remove the organizer tag from a lead, **so that** a lead that isn't actually tied to a specific organizer doesn't show up as linked to the wrong one.
4. **As a** sales rep, **I want** to pick from a plain list of existing organizers (not type-to-search), **so that** the picker matches how small/manageable the current organizer list is, and I don't need to learn a new search UI for this.

## What The User Wants (Behavioral Outcomes)

- On a lead's detail page, there is a visible "Organizer" field showing the organizer currently tagged to this lead (or a clear "not tagged" state if none).
- Next to/on that field there is a way to open a picker showing every existing organizer as a simple list of choices (mirroring the app's existing "Reassign Owner" picker pattern — a plain list of buttons, not a search box).
- Choosing an organizer from the list immediately tags the lead to that organizer — the displayed value updates right away, and the change is saved in the background.
- If saving fails, the displayed value reverts to what it was before, and the user sees an error message telling them the change didn't save.
- There is also a way to clear the tag entirely (untag), leaving the lead with no organizer.
- The picker only ever shows organizers that already exist — there is no "create a new organizer" option anywhere in this flow.
- After a successful tag/untag, the lead's data is refreshed so the new organizer value is reflected everywhere else on the page without a manual reload.
- This same change is recorded in the lead's history/audit trail, the same way other field changes (like owner reassignment) already are.

## Flow / State Diagram

```
[Lead Detail Page]
     │
     │  "Organizer" row shows: current organizer name  (or "Not tagged")
     │
     ▼
  click "Tag" / "Change" ──────────────▶ [Organizer Picker Modal]
                                            │  plain list of existing organizers
                                            │  (+ "Clear tag" option if one is set)
                                            │
                          choose organizer  │  choose "Clear tag"
                                ▼            ▼
                    [Optimistic update:      [Optimistic update:
                     row shows new name       row shows "Not tagged"
                     immediately]              immediately]
                                │                       │
                                ▼                       ▼
                    PATCH /api/leads/[id]/organizer  { organizerId }
                                │
                    ┌───────────┴────────────┐
                    ▼                        ▼
              200 success              4xx/5xx failure
              │                              │
              │ invalidateAll()              │ rollback row to
              │ toast: saved                 │ previous value
              │ crm_lead_history row         │ toast: error,
              │ written (field:              │ nothing saved
              │ 'organizer_id')              │
              ▼                              ▼
     [Lead detail reflects new       [Lead detail unchanged,
      organizer everywhere]          user can retry]
```

Branches / edge states:
- Lead has no organizer tagged yet → row shows "Not tagged" / similar empty state, picker opens with no pre-selected organizer and no "Clear tag" option (nothing to clear).
- Lead already has an organizer tagged → row shows that organizer's name, picker opens with a "Clear tag" option available alongside the full organizer list.
- Organizer list is empty (no organizers exist yet in the system) → picker shows an empty state, not an error; user simply cannot tag anything until organizers exist.
- Network/API failure on save → optimistic UI change is rolled back, error toast shown, lead detail stays exactly as it was before the attempt.

## Acceptance Criteria (Testable Outcomes)

1. **A sales rep can tag a lead that currently has no organizer to an existing organizer, and the lead detail page then shows that organizer's name.**
   proven by: Fully-Automated Vitest unit test on the client-side PATCH call/optimistic-update handler logic + existing Fully-Automated schema/route-handler tests for `PATCH /api/leads/[id]/organizer` (already covered pre-existing) + Agent-Probe manual click-through (blocked by repo-wide missing Playwright auth-fixture — pre-accepted known-gap, same pattern as #189/#190).
   strategy: Hybrid

2. **A sales rep can change a lead's tagged organizer to a different existing organizer, and the displayed value updates to the new organizer.**
   proven by: Fully-Automated unit test on the picker's selection handler (confirms it sends the newly chosen organizer's id, not the previous one) + Agent-Probe click-through (known-gap, e2e auth-fixture).
   strategy: Hybrid

3. **A sales rep can clear (untag) an organizer from a lead, and the lead detail page then shows the "not tagged" state.**
   proven by: Fully-Automated unit test confirming the "Clear tag" action sends `{ organizerId: null }` and the UI updates to the empty state + Agent-Probe click-through (known-gap).
   strategy: Hybrid

4. **The organizer picker only shows existing organizers as a plain selectable list — there is no way to create a new organizer from this UI.**
   proven by: Fully-Automated component-level test/code-review check confirming the picker component renders only from the loaded organizer list and contains no create/add-new affordance.
   strategy: Fully-Automated

5. **The picker is a plain button-list (no search/filter/combobox input), consistent with the existing Reassign Owner picker pattern on the same page.**
   proven by: Fully-Automated component-level test/code-review check confirming no text-input/search element is rendered inside the picker.
   strategy: Fully-Automated

6. **If the save (PATCH) fails, the lead detail page reverts to showing the organizer value it had before the attempted change, and an error message is shown.**
   proven by: Fully-Automated unit test simulating a failed fetch response and asserting rollback of the optimistic value + toast/error call.
   strategy: Fully-Automated

7. **After a successful tag or untag, the change is reflected in the lead's history/audit trail the same way other field changes are.**
   proven by: Fully-Automated — reuses the already-existing, already-tested backend behavior (endpoint writes to `crm_lead_history` with `field: 'organizer_id'` in a transaction); no new test needed beyond confirming the UI calls the existing endpoint correctly (covered by AC1-AC3 unit tests).
   strategy: Fully-Automated

8. **The organizer field/picker is placed as its own visible row in the lead detail page's info-card area (not hidden inside the separate onboarding edit form).**
   proven by: Fully-Automated component-level test/code-review check confirming the organizer row renders in the info-card grid section, independent of the onboarding form's edit mode.
   strategy: Fully-Automated

## Out Of Scope

- Creating a brand-new organizer from this UI. Organizer creation is handled separately by the import/ingest pipeline (a parallel, separate SPEC) — this UI only ever selects among organizers that already exist or clears the link.
- A searchable/typeahead combobox picker. The organizer list is currently small and unpaginated (per the #189/#190 SPEC's no-search/no-pagination decision); this SPEC locks in a plain button-list picker instead.
- Any change to the `PATCH /api/leads/[id]/organizer` endpoint, its Zod schema, or its response codes — the endpoint is complete and reusable as-is.
- Any change to the Organizers listing or Organizer detail pages (#189/#190) — this SPEC only adds the tagging control on the lead detail page.
- Bulk-tagging multiple leads to an organizer at once — this SPEC covers tagging one lead at a time from that lead's own detail page.
- Any schema or database migration — `organizerId` already exists on `crm_leads` and needs no changes.

## Constraints

- Must reuse the existing `PATCH /api/leads/[id]/organizer` endpoint exactly as-is (body `{ organizerId: string | null }`); no backend changes.
- Must follow the existing `ReassignModal.svelte` + `confirmReassign` UI pattern already used on the lead detail page (`src/routes/leads/[id]/+page.svelte`) — shared `Modal.svelte`, plain list of button rows, optimistic update with rollback-on-failure, toast feedback, `invalidateAll()` on success — rather than inventing a new interaction pattern.
- Must support untagging (setting `organizerId` to `null`), since the existing endpoint explicitly supports this.
- The `Lead` type already has `organizerId: string | null` and `organizerName?: string` — no type changes are expected to be needed, but this should be confirmed at PLAN time (see Open Questions).
- All server-side data loading changes must go through `+page.server.ts` per repo convention — no client-side DB access.
- e2e verification for the click-through flow will hit the same repo-wide missing-Playwright-auth-fixture gap every recent feature has hit — this is a pre-accepted known-gap, not a new blocker introduced by this work.

## Open Questions

None blocking. One item is flagged for PLAN-time verification, not a SPEC-level decision:

- **PLAN-time verification item:** Confirm whether `dbRowToLead` / `enrichWithOwnerNames`-equivalent logic in `src/lib/server/db/leads.ts` already resolves `organizerName` from `organizerId` for the lead detail load, or whether that resolution needs to be added as part of this work's implementation. This does not change any acceptance criterion above (the UI must show the current organizer's name either way) — it only affects where in the implementation that name-resolution logic lives, which is a PLAN/EXECUTE-time detail, not a product requirement.

## Background / Research Findings

- Backend contract is complete and reusable as-is: `PATCH /api/leads/[id]/organizer` — body `{ organizerId: string | null }` (Zod `organizerTagSchema`), 401 no auth, 400 bad shape, 404 lead not found, 422 organizer id doesn't exist, 200 + updated lead on success. Writes an audit row to `crm_lead_history` (`field: 'organizer_id'`) inside a transaction. No backend changes needed for this SPEC.
- Established UI pattern to mirror: `ReassignModal.svelte` + `confirmReassign` handler in `src/routes/leads/[id]/+page.svelte` (~lines 351-378) — modal built on the shared `Modal.svelte`, plain list of `<Button>` rows (no search box), optimistic update (`lead = patchRecord(...)`) + fetch PATCH + rollback-on-failure + toast, `invalidateAll()` on success.
- User has confirmed (via clarification) that a simple button-list picker is correct — not a searchable combobox — matching the current small/unpaginated organizer data volume (`listOrganizersWithLeadCount()` is explicitly no-pagination/no-search per the #189/#190 SPEC).
- `Lead` type (`src/lib/types/index.ts:141-142`) already has `organizerId: string | null` and `organizerName?: string` — no type changes are expected to be needed.
- Lead detail `+page.server.ts` currently loads zero organizer data. Implementation will need to load the organizer list (for the picker) and confirm/resolve `organizerName` for display — flagged as a PLAN-time verification item above rather than decided here, since it's an implementation detail, not a behavioral requirement.
- Placement: this SPEC locks in a new "Organizer" row in the lead detail page's info-card grid (~lines 796-818 in the current file), with a tag/change affordance next to it — rather than folding it into the existing onboarding edit form near "Has future events" (~lines 763-773). This is more discoverable as a standalone field, consistent with how other lead-level fields (like owner) are already surfaced as info-card rows, and avoids forcing the user to open the full onboarding form just to tag an organizer.
- Explicitly out of scope: creating a brand-new organizer inline from this UI. Organizer creation is handled separately via the import/ingest pipeline (a parallel SPEC). This UI only lets a user pick from EXISTING organizers or clear the link (`organizerId: null`).
- Untagging (clearing `organizerId`) must be supported, per the existing endpoint's `null` support.
- Test tier: Hybrid for schema/server-side logic reuse verification; e2e is a pre-accepted Known-Gap per the repo-wide missing Playwright auth-fixture (same pattern already accepted for #189/#190 and other recent features — see `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- No prior plans/artifacts exist for this specific tagging-UI task; the sibling `organizer-listing-detail_06-07-26` task folder (#189/#190) is the direct predecessor and its SPEC/pattern choices (visibility scoping, no-search organizer list, plain list UI) directly informed this SPEC.
