# Issue #92 — Role-Based Claim / Assign on Up for Grabs

Implemented: 2026-07-01
Surfaces: `/unassigned` (per-row actions only)

---

## What It Does

Differentiates what reps and managers can do with an unowned lead in the Up for Grabs queue
(`/unassigned`):

- **Reps** see one action per row: **Claim** — a lead for themselves only.
- **Managers** see two actions per row: **Claim** (for themselves) and a new **Assign to…** icon
  button that opens a team-member selector and hands the lead directly to any active rep, without
  claiming it for themselves first.

The change is a single-file addition — `src/routes/unassigned/+page.svelte` — plus one purely
cosmetic follow-up (button color) on the same file. No new endpoint, no schema change, no new
server-side logic.

---

## What Already Existed Before This Issue

Most of the plumbing this issue needed was already in place, built for earlier features (bulk
assign, edit, reassign-from-lead-detail). This issue is mostly **exposing existing capability at a
new call site** — a single-lead, per-row "Assign to…" action — rather than building new
infrastructure:

- **Role + permission helpers** (`src/lib/utils/permissions.ts`):
  - `isManager(user)` (line 12) — `user?.role === 'manager'`.
  - `canReassign(user)` (line 25) — `= isManager(user)`. Already the exact gate this issue needed.
  - `canClaimLead(user, lead)` (lines 22–23) — any signed-in user, when the lead is unowned.
  - `canBulkClaim(user)` (line 32) — any signed-in user.
- **Claim endpoint** — `POST /api/leads/[id]/claim/+server.ts` (lines 7–15): requires only a
  session (`locals.user`), no role check. Calls `claimLead(id, userId)`
  (`src/lib/server/db/leads.ts` lines 466–492), which sets `ownerId` to the caller and writes a
  `crm_lead_history` row (`field: 'owner_id'`, `oldValue: null`, `newValue: userId`).
- **Assign/reassign endpoint** — `PATCH /api/leads/[id]/owner/+server.ts`: already manager-gated
  server-side (line 13: `if (locals.user.role !== 'manager') throw error(403, 'Forbidden')`) —
  independent of any UI gate. Calls `reassignLead(id, ownerId, actorId)`
  (`src/lib/server/db/leads.ts` lines 916–953), which writes a `crm_lead_history` row
  (`field: 'owner_id'`, `oldValue: <previous owner>`, `newValue: <new owner>`,
  `actorUserId: <the manager>`, `at: defaultNow()`).
- **`ReassignModal.svelte`** (`src/lib/components/leads/ReassignModal.svelte`): the team-member
  selector already existed. Props: `open: boolean`, `users: User[]`,
  `currentOwnerId?: string | null`, `onclose: () => void`, `onconfirm: (ownerId: string) => void`
  (lines 7–19). It lists active reps only (`users.filter((u) => u.active)`, line 29) as clickable
  rows with a "Reassign" confirm button, disabled until a rep is selected (lines 41–61).
  Unchanged by this issue.
- **A bulk "Assign to rep ▾" header action** (`+page.svelte`, lines 295–302): already existed,
  already `canReassign`-gated, already funneled through the same `ReassignModal` and the same
  `assignTo()` handler. This issue's job was to add the **single-row equivalent**, not to build the
  assign flow from scratch.
- **Audit trail infra**: `crm_lead_history` (`src/lib/server/db/schema.ts` lines 235–250 —
  `leadId`, `actorUserId`, `field`, `oldValue`, `newValue`, `at` with `defaultNow()`) and the
  `crm_user_role` enum (`'rep' | 'manager'`, schema.ts line 23) both predate this issue.

---

## The One Actual Gap and the Fix

**File touched:** `src/routes/unassigned/+page.svelte` only.

Before this issue, the per-row actions were just Edit and Claim — there was no way for a manager
to hand a single unowned lead to a specific rep without either (a) claiming it themselves first and
reassigning afterward, or (b) using the bulk-select "Assign to rep" flow for a single row. Neither
is a real per-row action.

### New state

```ts
let assignTarget = $state<Lead | null>(null); // line 41
```

### Generalized `assignTo()` — same endpoint, dual mode

`assignTo(ownerId)` (lines 211–250) was generalized to target either a single row
(`assignTarget`) or the existing bulk selection (`selectedIds`), through the **same** endpoint,
`PATCH /api/leads/${id}/owner` — no new endpoint, no schema change:

```ts
const target = assignTarget;
const ids = target ? [target.id] : selectedIds;
```

The success toast distinguishes single vs. bulk (line 247):

```ts
toasts.success(target ? `Assigned ${target.name} to ${name}` : `Assigned ${count} to ${name}`);
```

`assignTarget` resets to `null` on both a successful confirm (line 245) and on modal
close/cancel (line 540), so a stale single-row target can never leak into the next bulk-assign
call.

### New manager-only per-row button

A third per-row icon button, gated by `canReassign(data.currentUser)`, inserted between Edit and
Claim (lines 463–476):

```svelte
{#if canReassign(data.currentUser)}
	<button
		onclick={() => {
			assignTarget = l;
			assignOpen = true;
		}}
		disabled={claiming[l.id]}
		aria-label="Assign {l.name}"
		title="Assign to…"
		class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-50"
	>
		<Icon name="team" size={14} stroke={2} />
	</button>
{/if}
```

It reuses the existing `team` icon (`src/lib/components/shared/Icon.svelte`) and the existing
`ReassignModal` — no new icon asset, no new modal component.

### Grid — correction vs. the #91 doc

The grid template (line 252) is currently a **9-track** grid:

```
grid grid-cols-[36px_2fr_1.6fr_1fr_90px_100px_110px_1fr_150px] gap-3
```

Two of those nine tracks (country, category) were added by the **prior** issue, #91 — see
[`DOC_issue-91-country-category-filters.md`](./DOC_issue-91-country-category-filters.md) — not by
this issue. Issue #92 did not grow the column count; it only **widened the trailing `_actions`
track from `110px` to `150px`** to fit the third per-row button (Edit / Assign / Claim) without
crowding. This document does not claim #92 grew the grid from 8→9 columns — that growth happened
in #91.

---

## Follow-Up: Red Button Styling (Cosmetic Only)

After the functional change shipped, the "Assign to…" button's border/text color was changed on
explicit user request, from a neutral style (matching the Edit button —
`border-hairline text-ink-500`) to the app's primary red token:

```
border border-primary text-primary hover:bg-primary hover:text-white
```

(line 472, `--color-primary: #e11d2a`, `src/lib/styles/tokens.css`) — the same token already used
for the Claim button's solid fill. This is a **separate, purely cosmetic** change: no behavior,
no gating logic, no endpoint, no state change. It only affects the button's visual appearance.

---

## Acceptance Criteria → Code

| AC | Requirement | Satisfied by |
|----|-------------|--------------|
| AC1 | Rep view shows a "Claim" action only | `canReassign(data.currentUser)` (`+page.svelte` line 463) evaluates `false` for `role: 'rep'` (`isManager`, `permissions.ts` line 12) — the Assign button block never renders. Reps see Edit + Claim only. |
| AC2 | Manager view shows both "Claim" and "Assign to…" actions | For `role: 'manager'`, `canReassign` is `true` — both the existing Claim button (lines 477–483) and the new Assign button (lines 463–476) render on every row. |
| AC3 | "Assign to…" opens a team member selector | Click sets `assignTarget = l; assignOpen = true` (lines 465–468), rendering `ReassignModal` (lines 534–543) with `users={data.users}` — the modal lists active reps as selectable rows (`ReassignModal.svelte` lines 29–53). |
| AC4 | Assignment is recorded in lead history (who, to whom, when) | `assignTo()` calls `PATCH /api/leads/{id}/owner`, which is itself manager-gated server-side (`owner/+server.ts` line 13, independent defense-in-depth check) and calls `reassignLead(id, ownerId, actorId)` (`leads.ts` lines 916–953), inserting a `crm_lead_history` row: `actorUserId` = who, `newValue` = to whom (new owner id), `oldValue` = previous owner, `at` = when (`defaultNow()`). |

---

## Public Contract Changes

| Contract | Change | Consumers |
|----------|--------|-----------|
| `+page.svelte` local state | Gains `assignTarget: Lead \| null` | `assignTo()`, the new per-row Assign button, `ReassignModal` `onclose` |
| `assignTo(ownerId)` | Generalized to accept either a single `assignTarget` row or the existing `selectedIds` bulk selection — same endpoint, same request shape, distinct success toast wording | `+page.svelte` (sole caller) |
| `PATCH /api/leads/[id]/owner` | No change — reused as-is (manager-gated, calls `reassignLead`) | `+page.svelte` (now called for both bulk and single-row assign) |
| Grid template (`+page.svelte` line 252) | Trailing `_actions` track widened `110px → 150px`; column count unchanged (9 tracks, 2 of which came from #91) | `+page.svelte` header row + body rows |

No changes to `src/lib/server/db/leads.ts`, `src/lib/server/db/schema.ts`, `ReassignModal.svelte`,
or any API route signature. No changes to `/leads` or `/pipeline`.

---

## Tests

This went through the orchestrator's **QUICK FIX lane**, not full RIPER-5 — no plan file, no
validate-contract, no EVL, and no e2e run. Per the QUICK FIX lane protocol, only a scoped check on
the touched file was run:

- `bun run check` — **PASS** (0 errors, matches baseline).
- `bun run lint` — **PASS** on the touched file's own content.

During the follow-up red-styling verification pass, a **repo-wide CRLF/prettier line-ending drift**
was observed across roughly 30 files. This is pre-existing and unrelated to this feature — it was
not introduced by this change and was not fixed here, since resolving it repo-wide is out of
quick-fix scope.

**Manual browser verification of the rep-vs-manager view has not yet been performed.** No dev
server was run this session to visually confirm: (a) reps see only Claim, (b) managers see Assign +
Claim side by side without layout crowding at the new `150px` action-column width, and (c) the
`ReassignModal` opens correctly with the right lead pre-targeted when launched from a single row
vs. from bulk selection. This gap should be closed with a manual pass (or, longer-term, e2e once
the repo's e2e-auth-bootstrap gap — see
[`DOC_issue-91-country-category-filters.md`](./DOC_issue-91-country-category-filters.md#honest-limitations) —
is resolved) before this is considered fully verified.

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/unassigned/+page.svelte` | Added `assignTarget` state; generalized `assignTo()` to support single-row targeting; added manager-only per-row "Assign to…" icon button between Edit and Claim; widened the `_actions` grid track `110px → 150px`; follow-up: changed the new button's border/text color to the primary red token |

---

## Known Limitations / Follow-Ups

- **No manual browser verification yet.** See Tests section above — this is the primary open item
  before considering this issue fully verified, not just code-complete.
- **Repo-wide CRLF/prettier line-ending drift** (~30 files) was observed during this work but is
  pre-existing and out of scope for this change. Flagged here for future cleanup, matching how
  [`DOC_issue-91-country-category-filters.md`](./DOC_issue-91-country-category-filters.md) flags
  its own pending verification items rather than silently absorbing them.
- **No plan file / validate-contract / EVL exist for this change** — it ran through the QUICK FIX
  lane by design (single-file, small bounded scope, no schema/auth/API/billing/migration surface).
  If this scope grows (e.g. a new bulk-vs-single distinction in the audit trail, or a permission
  beyond manager/rep), route the next change through full RIPER-5 instead of quick-fix.
