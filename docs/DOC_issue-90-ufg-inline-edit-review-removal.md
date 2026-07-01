# Issue #90 — Inline Edit in Up for Grabs + Review Queue Removal

Implemented: 2026-07-01
Surfaces: `/unassigned`, `/leads/[id]`, nav (sidebar + topbar); removes `/review`

---

## What It Does

Two connected changes shipped in one pass:

1. **Inline editing in Up for Grabs (`/unassigned`).** Each unclaimed-lead row now has a small
   pencil (edit) button. Clicking it opens the existing `LeadEditModal` prefilled with that lead's
   data — no navigation to the lead detail page. Saving PATCHes the lead and refreshes the list in
   place. Any authenticated rep or manager can do this, because every lead in Up for Grabs is
   unclaimed (`ownerId === null`).

2. **Full removal of the Review Queue.** The `/review` page, its nav link and badge, and the
   `needs_review` column/flag that powered it are all gone — schema, server, UI, nav, mocks, tests,
   and dev scripts. The "discard a bad lead" capability that used to live only on Review Queue
   already lives on the lead detail page (`/leads/[id]`), so no capability is lost.

The product logic: Up for Grabs can now do the triage-and-fix job the Review Queue existed for, so
the second overlapping surface was retired rather than kept in sync.

---

## Permission Model

The single behavioral change is in `canEditLead()`.

**File:** `src/lib/utils/permissions.ts`

```ts
export const canEditLead = (user: User | null | undefined, lead: Lead): boolean => {
	if (!user) return false;
	if (isManager(user)) return true;
	if (lead.ownerId === null) return true;
	return lead.ownerId === user.id;
};
```

The added line is `if (lead.ownerId === null) return true;` — an explicit `null` check placed
before the owner-match line (deliberately not folded into a `||` on the return, to leave the
existing owner-match logic untouched).

| Who | Can edit an unclaimed lead (`ownerId === null`) | Can edit a claimed lead they don't own |
|-----|-------------------------------------------------|----------------------------------------|
| Manager | yes (unchanged) | yes (unchanged) |
| Owner | yes (unchanged) | n/a |
| Any other rep | **yes (new)** | **no (unchanged — regression-locked by test)** |

The scope is narrow on purpose: it only widens edit access to *unclaimed* leads. Claimed-lead
permissions for non-owner reps are unchanged.

### Server-side enforcement (not client-only)

`canEditLead()` is enforced server-side in the PATCH handler, so widening the helper is sufficient —
no separate server fix was needed.

**File:** `src/routes/api/leads/[id]/+server.ts` (PATCH)

```ts
const existing = await getLead(params.id);
if (!existing) throw error(404, 'Lead not found');

const me = {
	id: locals.user.id,
	email: locals.user.email,
	name: locals.user.name,
	role: locals.user.role,
	active: true
};
if (!canEditLead(me, existing)) throw error(403, 'Forbidden');
```

The endpoint requires an authenticated session (`401` otherwise), validates the body against
`leadUpdateSchema` (`400` on failure), fetches the lead (`404` if missing), and only then runs the
permission check (`403` on failure). No request/response shape changed — only the authorization
outcome for unclaimed leads changed.

---

## Inline Edit — Up for Grabs (`/unassigned`)

**File:** `src/routes/unassigned/+page.svelte`

The inline editor reuses the existing `LeadEditModal` + `PATCH /api/leads/{id}` pattern already
proven on the (now-deleted) Review Queue. No new editing mechanism was built.

### State added

```ts
let editTarget = $state<Lead | null>(null);   // which lead the modal is open for; null = closed
let editSaving = $state(false);               // blocks the edit + claim buttons while a save runs
```

### Edit affordance (per row)

A dedicated pencil button sits to the left of the existing **Claim** button, inside the row's
actions cell. It is a distinct icon button rather than a whole-row click, so it does not conflict
with the row's name-link navigation (`<a href="/leads/{l.id}">`) or the select checkbox.

```svelte
<button
	onclick={() => (editTarget = l)}
	disabled={claiming[l.id] || editSaving}
	aria-label="Edit {l.name}"
	title="Edit lead"
	class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-hairline text-ink-500 hover:border-primary hover:text-primary disabled:opacity-50"
>
	<Icon name="edit" size={14} stroke={2} />
</button>
```

The `edit` (pencil) icon path did not previously exist and was added to `Icon.svelte` — see
[Files Changed](#files-changed) and [Honest Limitations](#honest-limitations).

### `saveEdit(leadData)` flow

```
1. Guard: return if editTarget is null or editSaving is true
2. editSaving = true
3. fetch PATCH /api/leads/{editTarget.id} with JSON body
   - non-ok  → read error text, push toast, return (modal STAYS open for retry)
   - ok      → editTarget = null (close modal), await invalidateAll(), success toast
4. editSaving = false (finally)
```

There is no `saveAndResolve` path — Up for Grabs has no "resolve" concept (that was a Review Queue
idea). Only the plain save path exists.

### Modal render

```svelte
{#if editTarget}
	<LeadEditModal
		open={true}
		lead={editTarget}
		saving={editSaving}
		onclose={() => (editTarget = null)}
		onsave={saveEdit}
	/>
{/if}
```

Note: **no `onresolve` prop is passed** — this is what suppresses the "Resolve" button (see below).

### Server load unchanged

`src/routes/unassigned/+page.server.ts` was not modified for the inline-edit feature — it still
loads `listUnassignedLeads(...)` + `listUsers()`. The edit flow is entirely client JS calling the
existing PATCH endpoint.

---

## `LeadEditModal` — `onresolve` Made Optional

**File:** `src/lib/components/leads/LeadEditModal.svelte`

The reused modal previously required an `onresolve` callback and unconditionally rendered a
"Resolve" footer button. Reusing it "unmodified" in Up for Grabs would either fail `bun run check`
(required prop omitted) or leak a meaningless "Resolve" button into a surface that has no resolve
concept. Three small changes fixed this (VALIDATE-added checklist item 6b).

### Prop contract change

```ts
// before: onresolve: (data: Record<string, unknown>) => void;
onresolve?: (data: Record<string, unknown>) => void;   // now optional
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | `boolean` | yes | Controls modal visibility |
| `lead` | `Lead` | yes | Prefill source; also shown as the modal subtitle |
| `saving` | `boolean` | no (default `false`) | Disables footer buttons, shows "Saving…" |
| `onclose` | `() => void` | yes | Cancel / overlay close |
| `onsave` | `(data) => void` | yes | "Save changes" with validated payload |
| `onresolve` | `(data) => void` | **no (now optional)** | "Resolve" with validated payload; button renders only when provided |

### Guarded call

```ts
function handleResolve() {
	const parsed = buildPayload();
	if (!parsed.success) { formError = parsed.error.issues[0]?.message ?? 'Please check the form.'; return; }
	formError = '';
	onresolve?.(parsed.data);   // optional-chained
}
```

### Conditional footer button

```svelte
{#snippet footer()}
	<Button variant="outline" onclick={onclose} disabled={saving}>Cancel</Button>
	<Button variant="outline" onclick={handleSave} disabled={saving || !name}>
		{saving ? 'Saving…' : 'Save changes'}
	</Button>
	{#if onresolve}
		<Button onclick={handleResolve} disabled={saving || !name}>
			{saving ? 'Saving…' : 'Resolve'}
		</Button>
	{/if}
{/snippet}
```

The only consumer of `LeadEditModal` was `src/routes/review/+page.svelte`, which is deleted in this
same change — so loosening this prop affects no other caller.

---

## Discard — Already on the Lead Detail Page (`/leads/[id]`)

Per the SPEC's hard requirement that discard must not be lost when `/review` is removed, this was
verified rather than built. The discard flow was **already fully wired** on the lead detail page and
needed no new code — only confirmation test coverage.

**File:** `src/routes/leads/[id]/+page.svelte` (existing wiring, confirmed)

| Element | Line (approx) |
|---------|---------------|
| `import DiscardIssueModal` | 18 |
| `let discardOpen = $state(false)` | 37 |
| `confirmDiscard()` → `fetch DELETE /api/leads/{id}/discard` | 204 / 208 |
| Discard button (`onclick={() => (discardOpen = true)}`) | 292 |
| `<DiscardIssueModal ... onconfirm={confirmDiscard} />` render | 440–446 |

The underlying `DELETE /api/leads/[id]/discard` endpoint and `DiscardIssueModal` component are
documented in `docs/DOC_issue-50-discard-lead.md`. This change does not modify either.

---

## Review Queue Removal

### Route deleted

`src/routes/review/+page.server.ts` and `src/routes/review/+page.svelte` were deleted (the now-empty
`src/routes/review/` directory is gone). Visiting `/review` now falls through to SvelteKit's
not-found handling (HTTP ≥ 400) rather than rendering any Review Queue UI.

### Nav surfaces cleaned

| File | Change |
|------|--------|
| `src/lib/components/layout/AppSidebar.svelte` | Removed `/review` nav item (href/label/icon/badge) + `review` key from the `counts` prop type |
| `src/lib/components/layout/AppTopbar.svelte` | Removed `reviewCount` prop + the review icon button and its badge |
| `src/lib/components/layout/AppShell.svelte` | Removed `review` from the `counts` type + the `reviewCount={counts.review}` prop pass |
| `src/lib/components/shared/skeletons/RouteShells.svelte` | Removed the `isReview` derived + its skeleton branch |
| `src/routes/+layout.ts` | Removed `review` from the `counts` type + both default objects (deviation — see below) |

### `getNavCounts` narrowed

**File:** `src/lib/server/db/leads.ts`

The `review` count query and key were removed. The return shape narrowed from
`{ overdue, unassigned, review }` to:

```ts
export async function getNavCounts(
	userId: string
): Promise<{ overdue: number; unassigned: number }> {
	// ...
	return {
		overdue: todayLeads.filter((l) => l.urgency === 'overdue').length,
		unassigned: Number(unassignedRow?.count ?? 0)
	};
}
```

`listReviewLeads()` and its private sort helpers (`REVIEW_SORT_COLS`, `ReviewSortCol`,
`REVIEW_COL_MAP`) were also removed — they were used exclusively by that function and the deleted
`/review` page. `src/routes/api/nav-counts/+server.ts` needed no change beyond the narrowed
pass-through (it just returns whatever `getNavCounts` returns).

---

## `needs_review` Full Removal

`needs_review` was a data-quality signal (set at ingest time when category was bad/missing OR the
lead had no contact method) — not merely a queue-membership flag. It was removed everywhere, with
**no replacement signal** (a deliberate product decision — see [Honest Limitations](#honest-limitations)).

### Schema + migration

**File:** `src/lib/server/db/schema.ts` — the `needsReview: boolean('needs_review')...` column
definition was removed.

**Migration:** `drizzle/0009_mushy_vapor.sql` (generated + reviewed):

```sql
ALTER TABLE "crm_leads" DROP COLUMN "needs_review";
```

The generated SQL is exactly one clean single-column drop with no bundled schema drift. The current
schema snapshot confirmed `needs_review` had no index and no FK, so the drop is a clean operation.

> **The migration is NOT yet applied.** See [Honest Limitations](#honest-limitations).

### Server / data layer

| File | Change |
|------|--------|
| `src/lib/server/db/leads.ts` | Removed `needsReview` from `dbRowToLead()` and the create/insert shape |
| `src/lib/types/index.ts` | Removed `needsReview: boolean` from `Lead` and `needsReview?: boolean` from `LeadFilters` |
| `src/routes/api/leads/ingest/+server.ts` | Removed the `needsReview:` insert field + comment, **and** the orphaned `review` counter/response field (item 19b) |
| `src/lib/server/import-utils.ts` | Narrowed `mapCategory()` return shape (item 18) |
| `scripts/import.ts` | Removed all needs-review logic + report field |

#### `mapCategory()` return-shape narrowing

**File:** `src/lib/server/import-utils.ts`

The return type narrowed from `{ category, needsReview }` to `{ category }`:

```ts
export function mapCategory(value: string): { category: CrmLeadCategory } {
	const trimmed = value.trim();
	if ((leadCategory.enumValues as readonly string[]).includes(trimmed)) {
		return { category: trimmed as CrmLeadCategory };
	}
	const mapped = CATEGORY_MAP[trimmed];
	if (mapped) return { category: mapped };
	return { category: 'Other' };
}
```

The sole real call site is `scripts/import.ts` (which now destructures only `{ category }`). The
ingest route only *mentions* `mapCategory` in a comment — it does not call the function (it uses the
scraper-supplied enum value directly), so no ingest change was needed for this contract.
`scripts/lib/import-utils.ts` re-exports `mapCategory` unchanged; the narrowed type flows through
automatically.

#### Orphaned ingest `review` counter removed (item 19b)

The ingest handler previously computed a `review` counter independently of the DB field (same
predicate: bad/missing category or no contact method) and returned it in its JSON response. Because
it was a local variable — not a schema-typed field — `bun run check` would not have caught it.
Leaving it in place would have silently re-exposed a "needs attention" signal via the public ingest
API after `needs_review` was otherwise removed, violating the SPEC's explicit no-replacement-signal
requirement (AC8). It was removed. The current response shape is:

```ts
return json({ received: parsed.data.leads.length, created, skipped, patched });
```

The `review` key is gone. This response is consumed only by the external scraper client (outside
this repo) — a best-effort compatibility note, not independently testable from here.

### Mock data, UI display, dev scripts

| File | Change |
|------|--------|
| `src/lib/server/mock.ts` | Removed the `needsReview` type field + all 10 fixture value lines |
| `src/lib/data/mock-data.ts` | Removed all 16 `needsReview: false` value lines |
| `src/lib/services/mock-crm-client.ts` | Removed the `filters.needsReview` filter branch + `needsReview: false` value |
| `src/routes/leads/[id]/+page.svelte` | Removed the `lead.needsReview ? 'flagged' : 'clear'` status display block (no replacement) |
| `scripts/seed.ts` | Removed `needsReview: true` fixtures + updated needs-review/`/review` doc comments and usage notes |
| `scripts/verify-routes.ts` | Removed the entire "review badge (`/review`)" check block |
| `src/lib/utils/sources.ts` | Updated a stale doc comment referencing the deleted `review/` dir (cosmetic — deviation) |

---

## Public Contract Changes

| Contract | Change | Consumers |
|----------|--------|-----------|
| `canEditLead(user, lead)` | Now returns `true` for `lead.ownerId === null` for any authenticated user | `PATCH /api/leads/{id}` (server-enforced), edit-gating UI |
| `PATCH /api/leads/{id}` | No request/response shape change; only the authz outcome for unclaimed leads changed | Up for Grabs inline edit, lead edit page |
| `mapCategory(value)` | Return shape narrows to `{ category }` (drops `needsReview`) | `scripts/import.ts` |
| `POST /api/leads/ingest` | Response shape narrows: removes the `review` key | External scraper client (out of repo) |
| `LeadEditModal` `onresolve` prop | Required → optional; "Resolve" button renders only when provided | Was `/review` (deleted); now `/unassigned` (without `onresolve`) |
| `getNavCounts(userId)` | Return shape narrows: removes `review` key | `/api/nav-counts`, `AppShell` / `+layout.ts` |
| `crm_leads.needs_review` | Column removed (irreversible without a new migration) | — |

---

## Tests

### Unit (`bun run test:unit`)

- `src/tests/leads.spec.ts` — removed the `needsReview` fixture field + assertion; added 5
  `canEditLead` cases including (a) rep can edit an unclaimed lead, (b) rep **cannot** edit a claimed
  lead owned by another (regression lock), (c) manager can still edit anything.
- `src/tests/leads-db.spec.ts` — removed the `needsReview` assertion; added a nav-counts shape
  assertion (no `review` key).
- `src/tests/import.spec.ts` — updated `mapCategory()` assertions to `{ category }` only; updated
  the ingest-report-shape assertions.
- `src/tests/reminders.spec.ts` — removed the `needsReview` fixture field.

Result at EXECUTE/EVL: **188 passed, 54 skipped** (the skipped are DB-integration tests gated behind
`SKIP_DB`).

### End-to-end (Playwright, `e2e/*.e2e.ts`)

Two new specs were added (the first e2e specs for this feature, following the existing
`e2e/loading-ux.e2e.ts` convention). Both self-skip on empty data rather than false-fail.

**`e2e/ufg-inline-edit.e2e.ts`** — describe block "Up for Grabs inline edit":

| Test | Asserts |
|------|---------|
| `AC1 — opens the inline editor on edit-affordance click without navigating` | Modal's "Save changes" is visible; URL path stays `/unassigned` |
| `AC1 (item 6b) — inline edit modal has NO Resolve button` | "Save changes" visible; "Resolve" button count is 0 |
| `AC2 — saving persists via PATCH and closes the modal without a full page reload` | A `PATCH /api/leads/{id}` request fires; modal closes; still on `/unassigned` |
| `AC5 — visiting /review no longer renders the Review Queue UI` | Response status ≥ 400; no "Review queue" heading |

**`e2e/leads-discard.e2e.ts`** — describe block "Lead detail discard flow":

| Test | Asserts |
|------|---------|
| `AC7 — discard action is available and completes from the lead detail page` | Discard affordance present; confirming fires `DELETE /api/leads/{id}/discard` |

### Grep gates (Fully-Automated, all green at EVL)

- `grep -rn "needs_review\|needsReview" src/ scripts/` → no matches
- `grep -n "review" src/routes/api/leads/ingest/+server.ts` → no matches (confirms item 19b)
- `grep -rn "/review\|reviewCount\|isReview" src/lib/components/layout/ src/lib/components/shared/skeletons/` → no matches (AC6)

`bun run check` — PASS (0 errors; 1 pre-existing unrelated warning in `leads/[id]/edit/+page.svelte`).

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/utils/permissions.ts` | `canEditLead()` widened with `lead.ownerId === null` branch |
| `src/routes/unassigned/+page.svelte` | Added `editTarget`/`editSaving` state, `saveEdit()`, per-row edit button, `LeadEditModal` render |
| `src/lib/components/leads/LeadEditModal.svelte` | Made `onresolve` optional; guarded call; conditional "Resolve" button |
| `src/lib/components/shared/Icon.svelte` | **Added** `edit` (pencil) icon path (deviation — required for the edit affordance) |
| `src/routes/review/+page.server.ts` | **Deleted** |
| `src/routes/review/+page.svelte` | **Deleted** |
| `src/lib/components/layout/AppSidebar.svelte` | Removed `/review` nav item + `review` count |
| `src/lib/components/layout/AppTopbar.svelte` | Removed `reviewCount` prop + review icon button + badge |
| `src/lib/components/layout/AppShell.svelte` | Removed `review` from counts type + prop pass |
| `src/lib/components/shared/skeletons/RouteShells.svelte` | Removed `isReview` branch |
| `src/routes/+layout.ts` | Removed `review` from counts type + defaults (deviation) |
| `src/lib/server/db/leads.ts` | Removed `listReviewLeads()` + sort helpers; narrowed `getNavCounts()`; removed `needsReview` from `dbRowToLead`/insert |
| `src/lib/server/db/schema.ts` | Dropped the `needs_review` column definition |
| `src/routes/api/leads/ingest/+server.ts` | Removed `needsReview` insert field/comment + orphaned `review` counter/response field |
| `src/lib/server/import-utils.ts` | Narrowed `mapCategory()` return shape |
| `scripts/import.ts` | Removed all needs-review logic + report field |
| `src/lib/types/index.ts` | Removed `needsReview` from `Lead` + `LeadFilters` |
| `src/lib/server/mock.ts` | Removed `needsReview` type field + all fixture values |
| `src/lib/data/mock-data.ts` | Removed all `needsReview` value lines |
| `src/lib/services/mock-crm-client.ts` | Removed `needsReview` filter branch + value |
| `src/routes/leads/[id]/+page.svelte` | Removed the flagged/clear `needsReview` display block |
| `src/lib/utils/sources.ts` | Updated stale doc comment referencing deleted `review/` (cosmetic) |
| `scripts/seed.ts` | Removed `needsReview` fixtures + updated notes |
| `scripts/verify-routes.ts` | Removed the review-badge check block |
| `src/tests/leads.spec.ts` | Removed `needsReview` fixture/assertion; added 5 `canEditLead` cases |
| `src/tests/leads-db.spec.ts` | Removed `needsReview` assertion; added nav-counts shape assertion |
| `src/tests/import.spec.ts` | Updated `mapCategory()` + ingest-report assertions |
| `src/tests/reminders.spec.ts` | Removed `needsReview` fixture field |
| `drizzle/0009_mushy_vapor.sql` | **New** — `DROP COLUMN needs_review` (generated + reviewed, NOT applied) |
| `e2e/ufg-inline-edit.e2e.ts` | **New** — inline-edit + `/review`-removal e2e |
| `e2e/leads-discard.e2e.ts` | **New** — discard-flow confirmation e2e |

---

## Honest Limitations

- **The migration is generated and reviewed but NOT applied.** `drizzle/0009_mushy_vapor.sql`
  (`ALTER TABLE "crm_leads" DROP COLUMN "needs_review";`) has not been run. Applying it was
  deferred by explicit user decision ("migrate later, just move forward"), pending `bun run db:push`
  against a confirmed dev-Postgres target. Until it runs, the shipped code assumes a column that
  still physically exists on the dev DB. The DROP is irreversible without a new migration to re-add
  the column.

- **Full `bun run test:e2e` was never run.** It needs a built + seeded + preview environment
  (webserver + browser download + seeded DB) that was not available during EXECUTE/EVL. Only
  Playwright discovery (`playwright test --list`) was confirmed — both specs are picked up. The
  e2e assertions themselves have not executed against a live app. The data-dependent cases also
  self-skip when the Unassigned queue is empty, so even a future run proves nothing on an unseeded DB.

- **AC6's visual confirmation is still pending.** The grep gate proves the markup no longer contains
  `/review` / `reviewCount` / `isReview`, but a human has not visually confirmed that
  `AppSidebar` / `AppTopbar` still lay out correctly after the review nav item / icon button were
  removed (e.g. no flex/spacing shift). No visual-regression tooling exists in this repo to catch
  that automatically.

- **No rep-session auth fixture exists in this repo.** `DEV_BYPASS` injects a manager session, so
  AC3's "same e2e under a rep session" cannot be exercised end-to-end. The rep-can-edit-unclaimed
  behavior is instead covered by unit tests directly on `canEditLead()` (the positive case, the
  claimed-lead regression case, and the manager case) — not by an authenticated rep browser session.

- **`needs_review` removal drops a data-quality signal with no replacement.** It flagged leads with
  a bad/missing category OR no contact method at ingest time. Removing it eliminates that signal
  entirely — no new flag, badge, or queue re-creates it. This is a deliberate product decision per
  the SPEC's explicit out-of-scope statement, not an oversight. If a data-quality signal is needed
  later, it is a separate future SPEC.

- **The plan that originally built `/review` has been marked superseded for its `/review` scope
  only.** `process/features/reports/active/reports-echarts-review-queue_29-06-26/` — specifically
  RFC-004 (Review Queue Real Data + Resolve Action) and its AC8/AC9 — is now obsolete because its
  `/review` and `needs_review` targets were removed here. The other RFCs in that plan
  (RFC-001/002/003, the ECharts reports work) are unaffected.

- **This plan's task folder is intentionally still in `active/`, not archived.** It is code-complete
  and EVL-green on every Fully-Automated + grep gate, but "VERIFIED" status is blocked on the three
  deferred items above (migration apply, full e2e run, AC6 visual confirm).
</content>
</invoke>
