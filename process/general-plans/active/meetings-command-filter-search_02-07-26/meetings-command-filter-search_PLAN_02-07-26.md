---
name: plan:meetings-command-filter-search
description: Replace /meetings Organizer + Lead Select filters with shadcn Command comboboxes; rename organizer→reps (labels only); add debounced, session-scoped, paginated leads search; convert MeetingFormModal create-picker to the same combobox
date: 02-07-26
feature: meetings
phase: ""
---

# Meetings Command Filter + Leads Search — PLAN (SIMPLE)

- **Date**: 02-07-26
- **Status**: Active — VALIDATED (CONDITIONAL; supplement cycle 1 applied; ready for EXECUTE)
- **Complexity**: SIMPLE

**TL;DR:** Swap the two `Select` filters on `/meetings` (cross-lead mode) for shadcn `Command` comboboxes inside a `Popover`. Organizer combobox filters the already-loaded `users` prop client-side (pinned "Mine" / "All reps" quick-filters, rename is label-only — URL param stays `organizer`). Lead combobox fetches from a NEW **session-scoped** `GET /api/leads` (debounced 300ms, skeleton while loading, paginate-on-scroll). The debounced/paginated leads-search UI is extracted into a reusable `LeadCombobox.svelte` used by BOTH the `/meetings` filter AND `MeetingFormModal`'s create-meeting lead picker (the modal picker is converted off the eager `leads` prop to the same `GET /api/leads` source). No change to `parseMeetingFilterParams`, the `MeetingFormModal` "Organizer" field, or the meeting-row `Organizer:` display. Verified by `bun run check` + a DB-free unit test proving the GET handler never trusts client-supplied scoping params.

---

## Overview

The `/meetings` cross-lead toolbar (`MeetingsPanel.svelte:224-258`) currently uses two `Select` dropdowns:
- **Organizer**: `Mine` / `All organizers` / one item per user.
- **Lead**: `All leads` / one item per eagerly-loaded lead.

Both eagerly load their full option list server-side (`+page.server.ts:13-21` calls unpaginated `listLeads()`). The same eager `leads` array is ALSO passed down to `MeetingFormModal` (`MeetingsPanel.svelte:373`), where the create-meeting lead picker (`MeetingFormModal.svelte:120-134`) renders it as a `Select`. This plan replaces both filters with searchable `Command` comboboxes, moves lead options to on-demand paginated session-scoped fetching, and converts the modal's create-picker to the same on-demand source so nothing depends on the eager `leads` array anymore.

## Goals

1. Both filters render as `Command`-based comboboxes (`Popover` + `Command`) instead of `Select`.
2. Organizer: client-side filter over the loaded `users` prop; "Mine" + "All reps" pinned in a Quick Filters group; label rename only (URL param `organizer` unchanged).
3. Lead: debounced (300ms) typeahead → `GET /api/leads?q=&page=`, skeleton-while-loading, dedupe/append/paginate on scroll, selection updates `lead` URL param.
4. New `GET /api/leads` derives visibility scoping **only** from `locals.user` — never from client query params.
5. All previously-shipped filter behavior (reset-to-page-1, `loadMoreMeetings` carrying filter params, single-lead mode) keeps working.
6. `MeetingFormModal`'s create-meeting lead picker is converted from the eager `leads` prop to the same `GET /api/leads`-backed combobox, so removing the eager load does not break create-meeting-from-`/meetings`.

## Scope

**In scope:** the two filter controls in `MeetingsPanel.svelte` cross-lead toolbar; a new reusable `LeadCombobox.svelte`; the `MeetingFormModal` create-meeting lead picker (converted to `LeadCombobox`); a new `GET` handler on the existing `src/routes/api/leads/+server.ts`; removing the eager lead load in `src/routes/meetings/+page.server.ts`; scaffolding the shadcn `command` component.

**Out of scope (do NOT touch):**
- `parseMeetingFilterParams` / `listMeetingsPaginated` (already shipped + validated).
- `MeetingFormModal.svelte` "Organizer" field and its label (only the LEAD picker inside the modal changes).
- The meeting-row `Organizer: {name}` display (`MeetingsPanel.svelte:310`).
- The `organizer` URL param key (label-only rename).
- Single-lead mode (`leadId` set, `crossLead === false`).

---

## Acceptance Criteria

All criteria are testable; each is mapped to a proving gate in Verification Evidence (REQ-TEST-LINK).

- **AC1** — Both `/meetings` cross-lead filters render as `Command`-based comboboxes (`Popover` + `Command`), not `Select`. *(proven by: G2 + G5)*
- **AC2** — Organizer combobox: "Mine" and "All reps" pinned in a Quick Filters group; a searchable reps list below (client-side filter over `users`); selecting any option sets the `organizer` URL param to `mine` / `all` / `<userId>` exactly as before (no change to param name or `parseMeetingFilterParams`). *(proven by: G2 + G5)*
- **AC3** — Lead combobox (filter mode): typing debounces 300ms then calls `GET /api/leads?q=...&page=1`; a skeleton row shows while loading; results append/dedupe/paginate via scroll sentinel; selecting a lead sets the `lead` URL param; pinned "All leads" clears it. *(proven by: G5 + G1)*
- **AC4 (SECURITY)** — `GET /api/leads` derives `userId`/`role`/`segment` ONLY from `locals.user` (server-hardcoded `segment:'all'`); a client cannot pass `?userId=`, `?role=`, or `?segment=` to widen visibility; returns `401` when unauthenticated. *(proven by: G1)*
- **AC5** — Previously-shipped filter behavior (reset-to-page-1 on filter change, `loadMoreMeetings` carrying current filter params, single-lead mode unaffected) continues working unchanged. *(proven by: G3 + G5)*
- **AC6** — `bun run check` and `bun run test:unit:ci` pass with no new errors/failures. *(proven by: G2 + G3)*
- **AC7** — Creating a new meeting from `/meetings` still lets the user pick a lead: `MeetingFormModal`'s create picker (rendered when `!leadId`) uses the `LeadCombobox` backed by `GET /api/leads`, binds the chosen lead id to local `selectedLeadId` state (NOT a URL param), and `bun run check` shows no dangling `leads` reference in `MeetingsPanel`/`MeetingFormModal`. *(proven by: G2 + G5)*

---

## Decision Log (locked from INNOVATE + supplement — do not re-litigate)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Keep `organizer` URL param key unchanged; only label text changes ("All organizers" → "All reps"; "Mine" unchanged). | No change to already-validated `parseMeetingFilterParams`. |
| 2 | Rename scope = the two `MeetingsPanel` filter controls ONLY (organizer label). | Modal ORGANIZER field label + row display stay out of scope; the modal LEAD picker is converted separately as the breaking-change fix (see decision 8). |
| 3 | Reps combobox = client-side `Command` filter over loaded `users` prop. | Team roster is a small, always-loaded allowlist; no endpoint needed. |
| 4 | Lead combobox = new `GET` on existing `api/leads/+server.ts` wrapping `listLeadsFiltered`, scoped from `locals.user`. | Reuse existing route + query fn; mirror the file's `POST` auth pattern. |
| 5 | Pinned quick-filters via `Command.Group` ("Quick filters" group above a separate search group). | shadcn-idiomatic; keeps pinned items out of the filterable list. |
| 6 | Skeleton row(s) in popover result list while leads fetch is in flight. | Matches the app's established skeleton visual language. |
| 7 (plan-author) | New `GET /api/leads` calls `listLeadsFiltered({ segment: 'all', ... })` with `segment` **hardcoded server-side**. | `'all'` is a valid `ListLeadsParams` segment; yields visibility-scoped, all-owners, non-lost leads — closest match to the old `listLeads` picker while reusing the paginated fn. See Accepted Behavioral Delta below. |
| 8 (supplement — resolves G-FAIL-1) | Convert `MeetingFormModal`'s create-meeting lead picker off the eager `leads` prop to a shared, extracted `LeadCombobox.svelte` backed by `GET /api/leads` (resolution **Option A**). Extract the debounce+fetch+skeleton+sentinel-pagination logic into `LeadCombobox.svelte` used by BOTH the `/meetings` filter and the modal, rather than copy-pasting it twice. | The whole plan moves off eager-loading all leads; keeping a second eager path only for the modal would contradict that and duplicate the delta. One reusable component avoids two copies of identical fetch/debounce/paginate wiring. Option B (retain a scoped `leads` load just for the modal) rejected — reintroduces the eager load this plan removes. Option C (descope the modal picker) rejected — it removes a working feature (creating a meeting for an arbitrary lead from `/meetings`). |
| 9 (supplement) | `LeadCombobox` supports two selection modes via props: **filter mode** (pinned "All leads" clear item; `onselect` sets URL param) and **assign mode** (no clear item, or a "Clear selection" affordance; `onselect` updates a bound local id). Same fetch/debounce/paginate internals; only the pinned-item set + the select callback differ. | The modal ASSIGNS a lead to a new meeting (local `$state`, required), which is a different interaction than filtering an existing list (URL param, optional). Sharing internals while parameterising the two behaviours keeps one source of the costly logic without conflating the two call sites' state. |

### Accepted Behavioral Delta (must surface, not silent)

The old picker used `listLeads(userId, role)` = visibility-scoped, **includes lost leads**. `listLeadsFiltered` adds `stage <> 'lost'` for every non-`lost` segment (`leads.ts:364`). Consequence: **lost leads will no longer appear as lead options** in EITHER the meetings filter OR the create-meeting modal picker (both now use `GET /api/leads`). This is judged acceptable and was explicitly chosen by the user this session ("Exclude lost leads (Recommended)"). If exact parity is required, the alternative is adding an `includeLost` param to `listLeadsFiltered` — deliberately NOT chosen here (YAGNI). EXECUTE must not silently "fix" this; it is the intended behavior. Note the modal delta explicitly: previously the create picker could assign a lost lead to a new meeting; after this change it cannot surface lost leads in search (a user creating a meeting for a lost lead is an accepted edge-case loss).

---

## Touchpoints

| File | Action | Notes |
|------|--------|-------|
| `src/lib/components/ui/command/` | CREATE (scaffold) | `npx shadcn-svelte@latest add command` — generates the component set. Verify dir exists before proceeding. |
| `src/lib/components/meetings/LeadCombobox.svelte` | CREATE | Reusable `Popover` + `Command` lead picker. Encapsulates: 300ms debounce, `GET /api/leads?q=&page=` fetch, skeleton-while-loading, scroll-sentinel dedupe/append pagination, out-of-order-response race guard, `shouldFilter={false}`. Props parameterise filter-mode vs assign-mode (see Public Contracts / decision 9). |
| `src/lib/components/meetings/MeetingsPanel.svelte` | MODIFY | Replace the Organizer `Select` (lines ~224-242) with a `Popover` + `Command` reps combobox (client-side filter over `users`). Replace the Lead `Select` (lines ~244-258) with `<LeadCombobox mode="filter" .../>`. Remove the `leads` prop; fix `crossLead` derivation (currently `leads != null && leadId == null` at `:41`) to `leadId == null`. Stop passing `{leads}` to `MeetingFormModal` (`:373`); instead pass a signal that the modal is in cross-lead/create mode (the modal already keys the picker off `!leadId`). Remove now-unused `Select*` imports if no longer used elsewhere in the file (verify first). |
| `src/lib/components/meetings/MeetingFormModal.svelte` | MODIFY | Convert the create-meeting lead picker (`:120-134`, currently `{#if leads && !leadId}` + `Select` bound to `selectedLeadId`) to `<LeadCombobox mode="assign" bind:value={selectedLeadId} .../>` rendered when `!leadId`. Remove the `leads` prop from `$props()` (`:25`, `:34`) and its doc comment (`:23`). The modal's ORGANIZER `Select` and all other fields are UNCHANGED. `selectedLeadId` local `$state` and the `effectiveLeadId = leadId ?? selectedLeadId` submit logic (`:85`) stay as-is — `LeadCombobox` assign-mode just writes into `selectedLeadId`. |
| `src/routes/api/leads/+server.ts` | MODIFY | Add `GET` handler: auth-gate (`if (!locals.user) throw error(401)`), read `q`/`page` from query, call `listLeadsFiltered` with server-derived scoping, return `{ leads: {id,name}[], total }`. |
| `src/routes/meetings/+page.server.ts` | MODIFY | Drop the full `listLeads()` eager load for the picker. Instead, when `filters.lead` is set, resolve ONLY the selected lead's `{id,name}` (single-row, visibility-scoped) for the filter trigger label; pass as `selectedLead`. Pass no full `leads` array. (The modal no longer needs a seeded list — it fetches on demand.) |
| `src/lib/server/db/leads.ts` | READ ONLY | `listLeadsFiltered` (`:333`), `visibilityCondition` (`:204`), single-lead lookup for `selectedLead` — reuse an existing scoped single-lead fetch if one exists; otherwise add a minimal visibility-scoped `getVisibleLeadName(id, userId, role)` helper (see Public Contracts). |

**Read for pattern reference (do not modify):** `MeetingsPanel.svelte:82-122` (loadMore/sentinel dedupe/append/IntersectionObserver — the pattern `LeadCombobox` reuses), `leads/+page.svelte:57-64` (300ms debounce). **Call sites of `MeetingsPanel` (verify prop change):** cross-lead mount `src/routes/meetings/+page.svelte:15`; single-lead mount `src/routes/leads/[id]/+page.svelte:470` (passes `leadId`, does NOT pass `leads`). *(Note: `meetings/[id]/+page.svelte` is a meeting-detail read view and does NOT mount `MeetingsPanel` — earlier drafts misidentified it.)*

## Public Contracts

**New: `GET /api/leads`**
- Query params (client-supplied, TRUSTED for search/pagination ONLY): `q` (string, optional search term), `page` (int, default 1).
- Response: `200 { leads: { id: string; name: string }[]; total: number }`.
- Auth: `401` when `!locals.user`.
- **Scoping (SECURITY — non-negotiable):** `userId = locals.user.id`, `role = locals.user.role`, `segment = 'all'` — all three hardcoded from session/server. The handler MUST NOT read `userId`, `role`, or `segment` from `url.searchParams`. Page size: 25 (the `listLeadsFiltered` default).

**New component: `LeadCombobox.svelte` (internal to the app — not a cross-package contract)**
- Props:
  - `mode: 'filter' | 'assign'` — filter mode pins an "All leads" clear item and calls `onselect` with `undefined` to clear; assign mode has no "All leads" pin (a lead is required for a new meeting) and may expose a "Clear selection" affordance.
  - `value?: string` — currently-selected lead id (filter: the `lead` URL param value; assign: `bind:value` local id).
  - `selectedLabel?: string` — trigger label for an already-selected lead when the id is known but the row is not in the fetched page (filter mode uses server-resolved `selectedLead.name`; assign mode may start empty → "Select a lead").
  - `onselect: (lead: { id: string; name: string } | undefined) => void` — filter mode wires to `setFilter('lead', ...)`; assign mode wires to `selectedLeadId = ...`.
- Internal state (not exposed): `leadQuery`, debounce timer, `results`, `page`, `loading`, `total`, request-generation token (latest-wins race guard). Uses `shouldFilter={false}` (server already filtered).

**Possibly-new helper (only if no scoped single-lead fetch exists):** `getVisibleLeadName(id, userId, role): Promise<{ id, name } | null>` in `leads.ts` — single row, `WHERE id = ? AND deleted_at IS NULL AND <visibilityCondition>`. EXECUTE: check for an existing scoped single-lead getter first and reuse it.

**Prop contract change — `MeetingsPanel.svelte`:** remove the `leads?: {id,name}[]` full-list prop entirely. The filter trigger label now comes from a new `selectedLead?: { id; name } | null` prop (server-resolved). `crossLead` derivation must no longer key off `leads != null` — change `crossLead = leads != null && leadId == null` (`:41`) to `crossLead = leadId == null` (the panel is cross-lead exactly when no fixed `leadId` is passed — verified against both mounts: `meetings/+page.svelte:15` cross-lead / `leads/[id]/+page.svelte:470` single-lead).

**Prop contract change — `MeetingFormModal.svelte`:** remove the `leads?: {id,name}[]` prop (`:25`,`:34`) and its comment (`:23`). The create picker now renders `<LeadCombobox mode="assign" bind:value={selectedLeadId} />` gated on `!leadId` (same condition as before, minus the `leads &&` guard). No change to `selectedLeadId`, `submit()`, or `effectiveLeadId`.

## Blast Radius

- **Files:** 6 hand-authored (`LeadCombobox.svelte` NEW, `MeetingsPanel.svelte`, `MeetingFormModal.svelte`, `api/leads/+server.ts`, `meetings/+page.server.ts`, `leads.ts` maybe) + 1 scaffolded component dir (`ui/command/`, generated).
- **Packages:** 1 (single SvelteKit app).
- **Risk class:** auth / visibility-scoping (new authenticated endpoint exposing lead data). This is the dominant risk — the GET handler must not widen any rep's lead visibility.
- **Call-site risk:** removing the `MeetingsPanel` `leads` prop touches (a) the cross-lead mount `src/routes/meetings/+page.svelte:15`, (b) the single-lead mount `src/routes/leads/[id]/+page.svelte:470` (must stay unaffected — passes only `leadId`), and (c) the SECOND consumer `MeetingsPanel.svelte:373` → `MeetingFormModal` create picker (`MeetingFormModal.svelte:120-134`). Consumer (c) is now resolved by decision 8 (modal converted to `LeadCombobox`); it was the G-FAIL-1 breaking change.

---

## Implementation Checklist

1. **Scaffold the component.** Run `npx shadcn-svelte@latest add command`. Verify `src/lib/components/ui/command/` exists (contains the `Command` primitives) before any other step. If the CLI prompts for config, accept existing project defaults. Do NOT hand-write the component.
2. **Add `GET /api/leads`** to `src/routes/api/leads/+server.ts`: export `GET: RequestHandler`; `if (!locals.user) throw error(401, 'Unauthorized')`; read `q = url.searchParams.get('q') ?? undefined` and `page = Number(url.searchParams.get('page')) || 1`; call `listLeadsFiltered({ userId: locals.user.id, role: locals.user.role, segment: 'all', search: q, page })`; map to `{ id, name }`; return `json({ leads, total })`. Do NOT read userId/role/segment from query.
3. **Add scoped single-lead resolver** (only if none exists): `getVisibleLeadName(id, userId, role)` in `leads.ts` per Public Contracts. Otherwise reuse the existing scoped getter.
4. **Create `LeadCombobox.svelte`** (`src/lib/components/meetings/`): `Popover` + `Command` picker with `mode`/`value`/`selectedLabel`/`onselect` props (Public Contracts). Implement internals: `Command.Input` bound to local `leadQuery`; on input, debounce 300ms (mirror `leads/+page.svelte:57-64`) then `fetch('/api/leads?q=' + encodeURIComponent(leadQuery) + '&page=1')`, reset page to 1; `shouldFilter={false}`; render `Skeleton` row(s) while a fetch is in flight; results render as `Command.Item`s; scroll sentinel at list bottom triggers `page+1` fetch, dedupe by id, append, track `page`/`loading`/`total`; guard against out-of-order responses with a latest-wins request-generation token; reset all list state when `leadQuery` changes. Pinned group: filter mode → "All leads" item calling `onselect(undefined)`; assign mode → no "All leads" pin. Selecting a result calls `onselect(lead)` and closes the popover.
5. **Update `meetings/+page.server.ts`:** remove `listLeads(...)` from the `Promise.all` and the `leads` mapping. When `filters.lead` is truthy, resolve `selectedLead` via the step-3 helper (visibility-scoped); else `selectedLead = null`. Return `selectedLead` instead of `leads`. Keep `users` (still needed for the reps combobox) and everything else unchanged.
6. **Update `MeetingsPanel.svelte` props:** remove the `leads` prop; add `selectedLead?: { id; name } | null`; fix `crossLead` derivation to `leadId == null` (`:41`); update the `$props()` type block; stop passing `{leads}` to `MeetingFormModal` at `:373` (the modal now fetches on demand — pass only `{leadId}`/`{users}` as before).
7. **Replace the Organizer `Select`** (lines ~224-242) with a `Popover` + `Command` combobox:
   - Trigger button (size sm) shows current label: `filters.organizer === 'all' ? 'All reps' : filters.organizer === 'mine' ? 'Mine' : users.find(u => u.id === filters.organizer)?.name ?? 'Rep'`.
   - `Command.Group` heading "Quick filters" with two always-visible items: "Mine" (`onSelect` → `setFilter('organizer','mine')`) and "All reps" (`setFilter('organizer','all')`). Keep existing sentinel values.
   - Separate `Command.Group` heading "Search reps" with a `Command.Input` and one `Command.Item` per `users` entry (client-side filter — `Command` filters items by their text; keep `shouldFilter` default ON here). Selecting → `setFilter('organizer', u.id)` and close popover.
   - Preserve the `organizer` param values `'mine'` / `'all'` / `<userId>` exactly.
8. **Replace the Lead `Select`** (lines ~244-258, cross-lead only) with `<LeadCombobox mode="filter" value={filters.lead} selectedLabel={selectedLead?.name} onselect={(l) => setFilter('lead', l?.id)} />`. Filter mode's pinned "All leads" clears the param via `onselect(undefined)` → `setFilter('lead', undefined)`.
9. **Convert `MeetingFormModal` lead picker** (`:120-134`): replace the `{#if leads && !leadId}` + `Select` block with `{#if !leadId}` + `<LeadCombobox mode="assign" bind:value={selectedLeadId} />`. Remove the `leads` prop from `$props()` (`:25`,`:34`) and its comment (`:23`). Leave the ORGANIZER field and all other modal fields untouched. Confirm `selectedLeadId`/`effectiveLeadId`/`submit()` still work (assign-mode writes into `selectedLeadId`).
10. **Clean imports:** remove `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` imports from `MeetingsPanel.svelte` and `MeetingFormModal.svelte` if no longer used in each file (verify via grep first — the modal still uses `Select` for the Organizer field, so its `Select*` imports stay). Add `Command*` + `Popover*` imports where needed (mostly inside `LeadCombobox.svelte`).
11. **Run gates:** `bun run check`, then the new unit test (step 12) + `bun run test:unit:ci`.
12. **Write the security unit test** (DB-free) for `GET /api/leads` — see Verification Evidence G1. Assert the handler passes `locals.user.id`/`locals.user.role`/`segment:'all'` to a mocked `listLeadsFiltered` and IGNORES `?userId=`/`?role=`/`?segment=` query params.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|-----------------|----------|-----------------------|
| G1 — `GET /api/leads` unit test: mock `listLeadsFiltered`, call handler with a `locals.user` fixture AND adversarial `?userId=X&role=manager&segment=all` query; assert the mock was called with `locals.user.id`/`locals.user.role`/`segment:'all'` and NEVER the query values; assert `401` when `locals.user` null. | Fully-Automated | AC4 (security — scoping derived only from session) + auth-gate. |
| G2 — `bun run check` exits 0 (svelte-check + tsc), including the `MeetingsPanel` + `MeetingFormModal` prop removals, the new `LeadCombobox`, and all three call sites (no dangling `leads` reference anywhere). | Fully-Automated | AC1, AC2, AC6, AC7 — comboboxes compile; both prop contract changes consistent; modal picker rewired. |
| G3 — `bun run test:unit:ci` stays green (no new failures; 263+ passing baseline). | Fully-Automated | AC5, AC6 — existing behavior (schemas, filter parsing) unregressed. |
| G4 — Live-DB check: signed-in rep A cannot see rep B's private leads via `GET /api/leads?q=`; `page`/`total` paginate correctly. | Hybrid (needs live Postgres + real session) | AC4 runtime proof of visibility scoping + AC3 pagination correctness. **Known-gap** — no live-DB CI harness (pre-accepted). Compensating: G1 proves the scoping SOURCE deterministically DB-free. |
| G5 — Combobox UX probe: open each popover; "Mine"/"All reps" pinned above search group; typing in leads search debounces then shows skeleton then results; scroll appends more (dedupe, no dupes); selecting updates the `organizer`/`lead` URL param; reset-to-page-1 on filter change still works; AND opening `MeetingFormModal` from `/meetings` (new meeting, no fixed lead) shows the `LeadCombobox` assign picker, searching + selecting sets the lead, and the meeting saves against it. | Agent-Probe | AC1, AC2, AC3, AC5, AC7 — interaction + pinned quick-filters + skeleton + paginate-on-scroll + modal assign picker. **Known-gap for automated e2e** — no shared Playwright auth fixture (pre-accepted); any e2e spec must self-skip per `all-tests.md`. |

**REQ-TEST-LINK (acceptance criterion → proving scenario):**
- **AC1** Both filters are Command comboboxes — proven by: G2 + G5; strategy: Fully-Automated (compile) + Agent-Probe (render).
- **AC2** Organizer client-side filter + pinned Mine/All reps + label rename + unchanged `organizer` param — proven by: G2 + G5; strategy: Fully-Automated + Agent-Probe.
- **AC3** Lead combobox debounce→GET, skeleton, paginate-on-scroll, updates `lead` param — proven by: G5 + G1; strategy: Agent-Probe + Fully-Automated.
- **AC4** Security: GET derives scoping only from `locals.user` — proven by: G1; strategy: Fully-Automated.
- **AC5** Existing filter behavior unchanged — proven by: G3 + G5; strategy: Fully-Automated + Agent-Probe.
- **AC6** `bun run check` + `bun run test:unit:ci` pass — proven by: G2 + G3; strategy: Fully-Automated.
- **AC7** Modal create picker uses `LeadCombobox`/`GET /api/leads`, binds to local state, no dangling `leads` — proven by: G2 (compile, no dangling ref) + G5 (assign-picker interaction); strategy: Fully-Automated + Agent-Probe.

**High-risk class handling (auth/visibility):** the class requires ≥ Hybrid minimum. Live-DB Hybrid (G4) is a pre-accepted known-gap (no CI harness). Compensating: G1 is a Fully-Automated deterministic proof that the handler never sources scoping from client input — this is the strong alternative coverage rationale the tier rules require to accept the Hybrid-DB gap. The security property is therefore proved DB-free; only end-to-end runtime confirmation is deferred. **AC4 (security) keeps its gate CONDITIONAL until G1 is green** — it is never PASS on the Known-Gap G4 alone.

**TDD stub (G1, red-first for EXECUTE):**
```
Failing stub:
test("GET /api/leads ignores client-supplied userId/role/segment and scopes from locals.user", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: session-only scoping of GET /api/leads")
})
```

## Test Infra Improvement Notes

- No live-DB CI harness → G4 (runtime scoping/pagination) cannot be automated; tracked repo-wide in `all-context.md` remaining-v1 work.
- No shared Playwright authenticated-session fixture → G5 cannot be an automated e2e (this now also covers the modal assign-picker path AC7); blocks behavioral verification for this and other features (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`). Both are pre-accepted known-gaps matching prior plans this session.

---

## Dependencies

- `bits-ui` present (shadcn `Command` dependency) — confirmed in `package.json`. `popover/` already scaffolded.
- Requires `npx shadcn-svelte@latest add command` (step 1) before any component work.
- `listLeadsFiltered` (`leads.ts:333`) — exists, unchanged.
- `LeadCombobox.svelte` (step 4) must exist before steps 8 + 9 (both consume it).

## Risks

| Risk | Mitigation |
|------|------------|
| shadcn CLI overwrites/modifies shared config (`components.json`, `utils`) | Accept existing defaults; review the CLI diff; the command is additive (new `command/` dir). |
| `Command` client-side filtering double-filters server-returned leads | `shouldFilter={false}` inside `LeadCombobox`; keep default ON for the reps combobox. |
| Prop removal breaks single-lead mount | `crossLead = leadId == null`; verify `src/routes/leads/[id]/+page.svelte:470` still passes only `leadId` (no `leads`/`selectedLead`); single-lead toolbar block is already gated by `crossLead && filters`. |
| Prop removal breaks the modal create picker (the G-FAIL-1 second consumer) | Decision 8: modal converted to `<LeadCombobox mode="assign">`; `bun run check` (G2) proves no dangling `leads` reference remains in `MeetingsPanel:373` or `MeetingFormModal`. |
| Modal assign-mode vs filter-mode state conflation | `LeadCombobox` parameterises mode (decision 9): filter mode → URL param via `setFilter`; assign mode → `bind:value={selectedLeadId}` local `$state`. No shared mutable state between the two call sites. |
| Losing lost-lead options silently (filter AND modal) | Documented Accepted Behavioral Delta — intended, user-chosen, not a bug. |
| Rapid typing races (out-of-order fetch responses) | `LeadCombobox` guards appends by a current request-generation token (latest-wins; drop stale responses). Implement in step 4. |

## Rollback

Single logical change; revert the 6 file edits (incl. deleting `LeadCombobox.svelte`) + delete `ui/command/` to restore the `Select`-based filters and modal picker. No schema/migration involved — clean git revert.

---

## Phase Completion Rules

This is a SIMPLE single-phase plan. The plan is complete only when ALL hold:

- All 12 checklist items applied.
- G1, G2, G3 (Fully-Automated gates) are green — `bun run check` clean (no dangling `leads` ref), new security unit test passing, `bun run test:unit:ci` unregressed.
- AC4 (security) gate is CONDITIONAL→PASS only after G1 green; it must never be marked PASS on the Known-Gap G4 alone.
- AC7 (modal picker) is compile-proven by G2; its interactive confirmation rides G5 (known-gap e2e).
- G4 (Hybrid live-DB) and G5 (Agent-Probe e2e) are recorded as pre-accepted Known-Gaps with backlog references — code-complete status is `CODE DONE`, not `VERIFIED`, until those runtime confirmations are possible.
- The Accepted Behavioral Delta (lost leads absent from filter AND modal picker) is confirmed intended in the EXECUTE report, not "fixed".

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/meetings-command-filter-search_02-07-26/meetings-command-filter-search_PLAN_02-07-26.md`
2. **Last completed step:** PLAN written + supplement cycle 1 applied (G-FAIL-1 + G-CONCERN-1 resolved). No EXECUTE yet.
3. **Validate-contract status:** SUPERSEDED — the inline BLOCKED contract below is stale; re-run VALIDATE (V1–V7) against this supplemented plan before EXECUTE.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md` (full routing chain), touchpoint files read (`MeetingsPanel.svelte`, `MeetingFormModal.svelte`, `api/leads/+server.ts`, `meetings/+page.server.ts`, `leads.ts` `listLeadsFiltered`/`visibilityCondition`/`listLeads`, `leads/+page.svelte` debounce).
5. **Next step for a fresh agent:** re-run VALIDATE (V1–V7) to produce a fresh validate-contract, then EXECUTE step 1 (scaffold `command`). Start EXECUTE with the G1 red stub (TDD Mode A). Build `LeadCombobox.svelte` (step 4) before wiring the filter (step 8) and modal (step 9).

## Validate Contract

Status: CONDITIONAL
Date: 02-07-26
date: 2026-07-02
generated-by: outer-pvl
supersedes: 02-07-26 (outer-pvl) — re-validation after supplement cycle 1; cycle-0 BLOCKED verdict superseded by fresh V1–V7 pass against the supplemented plan

Parallel strategy: parallel-subagents (fan-out); sequential for EXECUTE
Rationale: 2/7 signals (S2 auth/API surface — new GET endpoint; S6 high-risk auth/visibility class). MEDIUM → 4 Layer-1 dimension checks + 5 Layer-2 section checks, no cross-agent coordination. EXECUTE is a single sequential vc-execute-agent (opus): 6-file blast radius, one logical change, TDD red-first from the G1 stub.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | GET /api/leads scopes userId/role/segment ONLY from locals.user; ignores client ?userId/?role/?segment; 401 when unauthenticated | Fully-Automated | G1 unit test (mock listLeadsFiltered, adversarial query params) | B |
| AC1/AC2/AC6/AC7 | Comboboxes compile; MeetingsPanel + MeetingFormModal prop contracts + all 3 call sites consistent (no dangling `leads`) | Fully-Automated | `bun run check` (G2) exits 0 | A |
| AC5/AC6 | Existing filter/schema behavior unregressed | Fully-Automated | `bun run test:unit:ci` (G3) green, 263+ baseline | A |
| AC4 (runtime) | Rep A cannot see rep B private leads at runtime; pagination correct | Hybrid | G4 live-Postgres + real session | C |
| AC1/AC2/AC3/AC5/AC7 | Combobox UX: pinned quick-filters, debounce then skeleton then results, paginate-on-scroll dedupe, param updates, modal assign picker | Agent-Probe | G5 manual/probe (e2e self-skips pending auth fixture) | D |

gap-resolution legend: A — proven now (green when EXECUTE's gate runs); B — gate added by this plan's checklist (G1 written in step 12); C — deferred to named later phase (live-DB CI harness); D — backlog test-building stub (named residual, keep-active).

C-4 reconciliation: the strategy column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy — G4/G5 residuals are carried via gap-resolution C/D, never as a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- GET /api/leads security scoping: Fully-automated: `bun run test:unit:ci` (G1 security unit test)
- Compile + prop contract (both consumers + 3 call sites): Fully-automated: `bun run check` (G2)
- Regression: Fully-automated: `bun run test:unit:ci` (G3)
- Runtime visibility scoping/pagination: hybrid: live Postgres + real session (G4) — known-gap, no live-DB CI harness (pre-accepted; G1 compensates DB-free)
- Combobox UX + modal assign picker: agent-probe: manual popover interaction (G5) — known-gap for automated e2e, no shared Playwright auth fixture (pre-accepted)

Inline failing stub (G1, Fully-Automated — red-first for EXECUTE):
```
test("GET /api/leads ignores client-supplied userId/role/segment and scopes from locals.user", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: session-only scoping of GET /api/leads")
})
```
(G2, G3 are whole-suite/compile gates — no per-scenario stub. G4 Hybrid + G5 Agent-Probe receive no stub.)

Dimension findings (re-validation cycle 1 — supersedes the cycle-0 audit):
- Infra fit: PASS — cycle-0 CONCERN (single-lead call site misidentified as `meetings/[id]/+page.svelte`) is RESOLVED and verified on-disk: `grep -rn MeetingsPanel src/routes` returns exactly two mounts — single-lead `src/routes/leads/[id]/+page.svelte:470` (passes `leadId={lead.id}`, no `leads`) and cross-lead `src/routes/meetings/+page.svelte:15` (passes `leads={data.leads}`). `meetings/[id]/+page.svelte` has 0 MeetingsPanel references (confirms the corrected note). `crossLead` derivation at `MeetingsPanel.svelte:41` confirmed present; the `leadId == null` fix is coherent against both mounts. Bonus de-risk: a visibility-scoped single-lead getter `getLead(id, userId, role)` already exists at `leads.ts:466` — EXECUTE should reuse it for `selectedLead` (map to `{id,name}`) rather than add `getVisibleLeadName` (step 3 already instructs "reuse if one exists").
- Test coverage: PASS — G1 is a deterministic DB-free proof of the security scoping SOURCE; G4/G5 are pre-accepted known-gaps with documented compensating control. `listLeadsFiltered` (`leads.ts:333`) confirmed to accept `userId`/`role`/`segment`/`search`/`page`/`pageSize=25`; the GET call `listLeadsFiltered({ userId, role, segment:'all', search:q, page })` maps query `q`→param `search` correctly.
- Breaking changes: PASS — cycle-0 FAIL (unaddressed second `leads` consumer: `MeetingsPanel.svelte:373` → `MeetingFormModal` create picker `:120-134`) is RESOLVED via Decision 8. On-disk `MeetingFormModal.svelte` matches the plan's stated "before" exactly: `{#if leads && !leadId}`+Select at :120-134, `selectedLeadId` local `$state` at :52, `effectiveLeadId = leadId ?? selectedLeadId` at :85, `leads` prop at :25/:34 (comment :23), separate ORGANIZER `Select` at :141-152. The planned conversion to `<LeadCombobox mode="assign" bind:value={selectedLeadId}>` gated on `!leadId` cleanly replaces the picker without touching submit logic or the ORGANIZER field.
- Security surface: PASS — dominant risk cleared. The GET handler design hardcodes `userId`/`role`/`segment:'all'` from `locals.user`, reads ONLY `q`/`page` from query, and `throw error(401)` when unauthenticated — mirroring the existing POST at `api/leads/+server.ts` verbatim (`if (!locals.user) throw error(401, 'Unauthorized')` then `locals.user.id`). G1 proves this deterministically DB-free.

Layer 2 sections (re-validation cycle 1):
- Section A — GET /api/leads handler: PASS (mirrors POST auth pattern; listLeadsFiltered param shape confirmed).
- Section B — MeetingsPanel prop change + meetings/+page.server.ts + modal consumer: PASS (cycle-0 FAIL resolved; all 3 call sites verified; scoped single-lead getter exists for `selectedLead`).
- Section C — Organizer combobox + label-only rename: PASS (no touch to `parseMeetingFilterParams`; `organizer` param key unchanged).
- Section D — Lead combobox debounce/paginate (shared LeadCombobox): PASS (300ms debounce pattern confirmed at `leads/+page.svelte:57-64`; sentinel dedupe/append pattern referenced at `MeetingsPanel.svelte:82-122`; `shouldFilter={false}` + latest-wins race guard specified).
- Section E — MeetingFormModal assign-mode conversion (NEW from supplement): PASS. Decision 9's mode parameterization is coherent and does NOT conflate state: filter mode → `onselect` writes the `lead` URL param via `setFilter`; assign mode → `bind:value={selectedLeadId}` writes the modal's local `$state`. No shared mutable state between the two call sites; internals (fetch/debounce/paginate) are shared, only the pinned-item set + select callback differ.

Totals (re-validation cycle 1): 0 FAILs / 0 CONCERNs / 9 PASSes → Net Gate: CONDITIONAL (held below terminal PASS only by the two pre-accepted known-gaps + the plan's own "AC4 CONDITIONAL until G1 green" rule).

Net-gate vacuous-green check: every developed behavior has a real proving strategy — AC1/AC2/AC6/AC7 by G2 (Fully-Automated compile), AC4 by G1 (Fully-Automated), AC5 by G3 (Fully-Automated), AC3 interaction by G5 (Agent-Probe). No developed behavior rests on Known-Gap alone; G4 (Hybrid runtime) and G5 (automated-e2e form) are named residuals with written justification, not silent gaps.

Open gaps (pre-accepted known-gaps — NOT counted toward the gate):
- G4 runtime visibility scoping + pagination (Hybrid, live Postgres): known-gap — no live-DB CI harness; tracked in `all-context.md` remaining-v1 work. Compensating control: G1 proves the scoping SOURCE Fully-Automated DB-free.
- G5 automated combobox/modal e2e (Agent-Probe): known-gap — no shared Playwright auth fixture; `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`. Any e2e spec must self-skip per `all-tests.md`.

Accepted Behavioral Delta (locked, NOT a gap): lost leads are excluded from BOTH the filter AND the modal create picker (both now use `GET /api/leads` → `listLeadsFiltered` which adds `stage <> 'lost'`). User explicitly chose "Exclude lost leads (Recommended)" this session. Confirmed accepted; EXECUTE must not silently "fix" it — confirm as intended in the EXECUTE report.

What this coverage does NOT prove:
- G1 (`bun run test:unit:ci`, security unit): proves the handler never SOURCES scoping from client input; does NOT prove real DB row-visibility at runtime (G4, deferred) nor pagination against real data.
- G2 (`bun run check`): proves the code compiles and both prop contracts + all 3 call sites are type-consistent (no dangling `leads`); does NOT prove any runtime behavior.
- G3 (`bun run test:unit:ci`): proves existing unit suites still pass; does NOT cover the new combobox UI, the modal assign picker, or the GET handler wiring beyond G1.
- G4 (Hybrid, deferred): would prove runtime cross-rep visibility isolation + pagination; NOT runnable without a live-DB CI harness.
- G5 (Agent-Probe, deferred): would prove interactive UX (pinned filters, debounce then skeleton then results, scroll-append dedupe, param updates, modal assign picker); NOT automatable without a shared Playwright auth fixture.

Gate: CONDITIONAL (0 FAILs; both cycle-0 FAILs + the CONCERN resolved by supplement cycle 1; two pre-accepted known-gaps on record). EXECUTE-eligible: this is a post-supplement CONDITIONAL (≥1 recorded fix cycle) with user-pre-accepted gaps — proceed to EXECUTE with gaps on record. AC4's gate is CONDITIONAL→PASS only after G1 is green in EXECUTE; never PASS on the Known-Gap G4 alone.
Accepted by: session — pre-accepted known-gaps carried forward: (1) G4 live-DB runtime visibility/pagination (no CI harness; G1 compensates DB-free); (2) G5 automated combobox/modal e2e (no shared Playwright auth fixture); (3) Accepted Behavioral Delta — lost leads excluded from filter + modal picker (user chose "Exclude lost leads (Recommended)").

## Autonomous Goal Block

```
SESSION GOAL: Meetings Command filter comboboxes + session-scoped debounced leads search (/meetings), incl. shared LeadCombobox for the create-meeting modal picker
Charter + umbrella plan: N/A — single plan
Autonomy: interactive (user answered clarifications this session). feedback_autonomous_phase_execution rules apply if re-run under /goal.
Hard stop conditions / safety constraints:
- Security (auth/visibility): GET /api/leads must derive userId/role/segment ONLY from locals.user; never from query params. Any code path reading ?userId/?role/?segment is a hard stop.
- Do not touch parseMeetingFilterParams or the `organizer` URL param key (label-only rename), or the modal's ORGANIZER field.
- Lost-leads-excluded (filter AND modal picker) is a locked, user-accepted design decision — do not "fix" it.
- AC4 (security) stays CONDITIONAL until G1 is green; never mark PASS on the Known-Gap G4 alone.
Next phase: EXECUTE (validate-contract CONDITIONAL, ready). Sequential vc-execute-agent (opus).
Validate contract: inline in plan (## Validate Contract — Status: CONDITIONAL; generated-by: outer-pvl)
Execute start: scaffold `npx shadcn-svelte@latest add command` (verify src/lib/components/ui/command/ exists) → write G1 red stub FIRST (TDD Mode A) → build LeadCombobox.svelte (step 4) → wire filter (step 8) + modal (step 9). Gates: `bun run check`, `bun run test:unit:ci`. high-risk pack: yes (auth/visibility — G1 is the DB-free compensating proof).
```
