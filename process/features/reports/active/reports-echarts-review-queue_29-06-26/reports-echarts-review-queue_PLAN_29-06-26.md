# Reports (ECharts) + Review Queue — Implementation Plan

> **⚠️ SUPERSEDED (01-07-26):** RFC-004 (Review Queue Real Data + Resolve Action) and its
> acceptance criteria AC8/AC9 target `/review` and the `needs_review` column. Both were
> **fully removed** by
> `process/features/leads/active/ufg-inline-edit-review-removal_01-07-26/ufg-inline-edit-review-removal_PLAN_01-07-26.md`
> (GitHub #90) — `src/routes/review/` deleted, `crm_leads.needs_review` column dropped
> (migration generated, not yet applied — see that plan's Status block). RFC-004's scope,
> resolve-action design, and DB queries referencing `needs_review`/`listReviewLeads` are
> **obsolete and must not be resumed**. RFC-001/002/003 (Reports page real-data wiring, CSV
> export) are unaffected and remain valid — do not treat the whole plan as dead, only
> RFC-004 + AC8/AC9. Do not resume RFC-004 work from this file; if the Reports feature still
> needs a "leads needing attention" surface, that requires a new SPEC (no replacement signal
> currently exists per the superseding plan's SPEC).

**Date**: 29-06-26
**Complexity**: COMPLEX (multi-RFC, multi-session)
**Feature folder**: `process/features/reports/`
**Status**: 🔨 CODE DONE — RFC-004 superseded/obsolete (see note above); RFC-001/002/003 status unaffected

---

## Quick Links

- [Overview](#overview)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Functional Requirements](#functional-requirements)
- [Architecture Notes](#architecture-notes)
- [RFC-001 — Server Data Layer](#rfc-001--server-data-layer)
- [RFC-002 — Reports UI Wiring](#rfc-002--reports-ui-wiring)
- [RFC-003 — CSV Export Endpoint](#rfc-003--csv-export-endpoint)
- [RFC-004 — Review Queue Real Data + Resolve Action](#rfc-004--review-queue-real-data--resolve-action)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

---

## Overview

Convert both the Reports page (`/reports`) and the Review Queue page (`/review`) from mock data
to real Drizzle-backed data. The funnel is rendered as HTML bars; ECharts is used only for the
leaderboard. Add server-side CSV export for finance, and make the review queue actionable
(resolve flag clears `needs_review`).

**Why this matters:**
- Funnel and rep-leaderboard are already fully designed in `+page.svelte` — they just receive mock
  data today. This plan swaps in real SQL aggregations without changing the UI shape.
- Deal value is deliberately shown **per currency** (PHP separate from SGD etc.) — never summed.
  This constraint is already encoded in `CurrencyTotal` type and must not be violated.
- `needs_review=true` leads accumulate on every sheet import — managers have no UI to clear them
  without going into individual lead detail pages.

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration test** — works end-to-end with the real DB
2. **Manual test** — user can perform the action in the browser
3. **Data verification** — DB query confirms correct data shape
4. **Error handling** — failure cases handled gracefully
5. **User confirmation** — user says "it works"

Status meanings:
- ⏳ PLANNED — not started
- 🔨 CODE DONE — written but not E2E tested
- 🧪 TESTING — currently being tested
- ✅ VERIFIED — tested AND confirmed working
- 🚧 BLOCKED — has issues

After each RFC, document:
- [ ] What was tested manually
- [ ] Data verified in DB (show query + result)
- [ ] Errors encountered and fixed
- [ ] User confirmation received

---

## Execution Brief

### RFC-001 + RFC-004 (Server Data Layer + Review Queue)
**What happens:** Create `+page.server.ts` for both `/reports` and `/review`, removing the
client-side `+page.ts` loaders. Write Drizzle SQL aggregations: funnel counts by stage,
per-rep touch/reply/win counts, per-currency deal totals, and `needs_review=true` lead list.
Add a `resolve` form action on the review page that clears the flag.

**Integration points:** `src/lib/server/db/index.ts` (Drizzle pool), `schema.ts` (crmLeads,
crmActivities, crmUsers), `$lib/types` (ReportData, LeaderboardRow, CurrencyTotal, FunnelStage).

**Test:** Load `/reports` and `/review` in the browser — both must show real data (not the mock
count of 234 leads). Run a DB count query to verify row counts match.

**Verify:** `SELECT stage, COUNT(*) FROM crm_leads WHERE deleted_at IS NULL GROUP BY stage;`
— numbers must match the funnel.

**Done when:** User sees real lead counts in the funnel bars; no mock data indicator visible.

---

### RFC-002 (Reports UI Wiring)
**What happens:** The funnel and leaderboard are already rendered via HTML bars (not ECharts yet).
This RFC replaces those bars with ECharts `bar` charts and wires the leaderboard to real
`LeaderboardRow[]` data. Currency totals are displayed in separate currency cards (never combined).

**Integration points:** ECharts 6.x (already in `package.json`), `+page.svelte` (reports),
`$lib/utils/currency.ts` (formatMoney).

**Test:** Open `/reports` — ECharts canvas must render; leaderboard must show per-rep rows.

**Done when:** User sees bar charts with real data and per-currency deal value cards.

---

### RFC-003 (CSV Export)
**What happens:** Add `GET /api/reports/export` with two modes via `?type=view` (current filtered
leads) and `?type=won` (won deals for finance). Returns a `text/csv` response that triggers
browser download. Uses `$lib/utils/csv.ts` (already exists).

**Integration points:** `src/routes/api/reports/export/+server.ts` (new), `csv.ts`, Drizzle.

**Test:** Click the export button on `/reports` — browser must download a valid CSV file.

**Done when:** Finance team can open the won-deals CSV in Excel without errors.

---

## Scope

**In scope:**
- `/reports` funnel by stage with real counts + ECharts visualization
- `/reports` per-rep leaderboard (wins, touches, replies) from real DB
- `/reports` currency totals — PHP total, SGD total etc. shown separately
- CSV export (current view = current `LeadFilters` shape; won-deals = `stage='won'` rows)
- `/review` real `needs_review=true` lead list with resolve action

**Out of scope (v1):**
- Date-range filter wiring to the funnel query (date picker is a stub — always queries all-time for now)
- ECharts for the review queue (plain table is fine)
- Batch resolve on the review queue
- Historical trend charts
- Export scheduling / email delivery

---

## Functional Requirements

1. **Funnel** — query `crm_leads WHERE deleted_at IS NULL` grouped by `stage`; compute
   `conversionRate = won_count / new_count * 100` (0 when new_count = 0).
2. **Leaderboard** — query `crm_activities` joined to `crm_users`; count touches = total rows per
   rep, replies = rows where `outcome = 'replied'`, wins = `crm_leads WHERE stage = 'won'` per
   owner.
3. **Currency totals** — query `crm_leads WHERE stage = 'won' AND deal_value_cents IS NOT NULL`
   grouped by `currency`; sum `deal_value_cents` per group; **never sum across currencies**.
4. **CSV export view** — applies the same `LeadFilters` that power `/leads`; all non-deleted
   columns except internal UUIDs; UTF-8 BOM for Excel compatibility.
5. **CSV export won** — `name, won_org_name, deal_value_cents, currency, signed_at, owner_name`;
   sorted by `signed_at DESC`.
6. **Review queue** — query `crm_leads WHERE needs_review = true AND deleted_at IS NULL`; show
   name, category, platform, stage, created_at.
7. **Resolve action** — form action `?/resolve` takes `leadId`; sets `needs_review = false` and
   `updated_at = now()` via Drizzle update; redirects back to `/review`.

---

## Architecture Notes

### Route file conversion

Current routes use `+page.ts` (universal/client-side loaders calling the mock `crm` service).
Switching to real DB access requires `+page.server.ts` (server-only). The pattern:

```
REMOVE:  src/routes/reports/+page.ts
ADD:     src/routes/reports/+page.server.ts   (server load + optional actions)

REMOVE:  src/routes/review/+page.ts
ADD:     src/routes/review/+page.server.ts    (server load + actions.resolve)
```

`/reports` `+page.svelte` is unchanged — it already consumes `data.report` which is exactly
what the server loader provides. `/review` `+page.svelte` must be updated to consume `data.leads`
(not `data.items` from the old mock loader) per RFC-004.

### Drizzle query patterns

Follow `src/lib/server/db/leads.ts` patterns:
- Import `db` from `$lib/server/db`
- Import table references from `$lib/server/db/schema`
- Use `eq`, `sql`, `count`, `sum`, `and`, `isNull` from `drizzle-orm`
- Always filter `isNull(crmLeads.deletedAt)` on soft-deleted tables

### ECharts in Svelte 5

ECharts requires a DOM element. Use `$effect(() => { ... })` (not `onMount`) to initialize the
chart after the element is mounted. Destroy on cleanup: `$effect(() => { return () => chart.dispose(); })`.
Import ECharts with named imports to avoid bundling the full 1MB:

```ts
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
```

---

## RFC-001 — Server Data Layer

**Status:** ⏳ PLANNED
**Dependencies:** Live DB (`DATABASE_URL` must be set)

### Stage 0: Pre-phase research
- [ ] Confirm `bun run check` passes on current code
- [ ] Confirm live DB is accessible: `bun run db:push` dry-run
- [ ] Read `src/lib/server/db/leads.ts` for query patterns
- [ ] Confirm `crmActivities` has enough data for leaderboard (or will show zeros)

### Stage 1: Reports server loader

File: `src/routes/reports/+page.server.ts`

```ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmActivities, crmUsers } from '$lib/server/db/schema';
import { eq, isNull, count, sum, and, sql } from 'drizzle-orm';
import type { ReportData, FunnelStage } from '$lib/types';

const STAGE_META: Record<string, { label: string; color: string; order: number }> = {
  new:           { label: 'New',          color: '#6366f1', order: 0 },
  contacted:     { label: 'Contacted',    color: '#f59e0b', order: 1 },
  replied:       { label: 'Replied',      color: '#3b82f6', order: 2 },
  in_discussion: { label: 'In discussion',color: '#8b5cf6', order: 3 },
  won:           { label: 'Won',          color: '#22c55e', order: 4 },
  lost:          { label: 'Lost',         color: '#ef4444', order: 5 },
};

export const load: PageServerLoad = async () => {
  // 1. Funnel counts
  const stageCounts = await db
    .select({ stage: crmLeads.stage, count: count() })
    .from(crmLeads)
    .where(isNull(crmLeads.deletedAt))
    .groupBy(crmLeads.stage);

  const total = stageCounts.reduce((s, r) => s + Number(r.count), 0);
  const wonRow = stageCounts.find(r => r.stage === 'won');
  const newRow = stageCounts.find(r => r.stage === 'new');
  const conversionRate =
    newRow && Number(newRow.count) > 0
      ? Math.round((Number(wonRow?.count ?? 0) / Number(newRow.count)) * 100)
      : 0;

  const stageCountMap = Object.fromEntries(stageCounts.map(r => [r.stage, Number(r.count)]));
  const funnel: FunnelStage[] = Object.entries(STAGE_META)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([stage, meta]) => {
      const c = stageCountMap[stage] ?? 0;
      return {
        stage: stage as FunnelStage['stage'],
        label: meta.label,
        color: meta.color,
        count: c,
        pct: total > 0 ? Math.round((c / total) * 100) : 0,
      };
    });

  // 2. Leaderboard — touches + replies per rep
  const touchRows = await db
    .select({
      repId: crmActivities.repId,
      total: count(),
      replies: sql<number>`SUM(CASE WHEN ${crmActivities.outcome} = 'replied' THEN 1 ELSE 0 END)`,
    })
    .from(crmActivities)
    .groupBy(crmActivities.repId);

  const winRows = await db
    .select({ ownerId: crmLeads.ownerId, wins: count() })
    .from(crmLeads)
    .where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
    .groupBy(crmLeads.ownerId);

  const users = await db
    .select({ id: crmUsers.id, name: crmUsers.name })
    .from(crmUsers)
    .where(eq(crmUsers.active, true));

  const winMap = Object.fromEntries(winRows.map(r => [r.ownerId, Number(r.wins)]));
  const touchMap = Object.fromEntries(
    touchRows.map(r => [r.repId, { total: Number(r.total), replies: Number(r.replies) }])
  );

  const leaderboard = users
    .map(u => ({
      repId: u.id,
      name: u.name,
      touches: touchMap[u.id]?.total ?? 0,
      replies: touchMap[u.id]?.replies ?? 0,
      wins: winMap[u.id] ?? 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.touches - a.touches);

  // 3. Currency totals (NEVER sum across currencies)
  const currencyRows = await db
    .select({
      currency: crmLeads.currency,
      total: sum(crmLeads.dealValueCents),
      deals: count(),
    })
    .from(crmLeads)
    .where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
    .groupBy(crmLeads.currency);

  const currencyTotals = currencyRows
    .filter(r => r.currency && r.total)
    .map(r => ({
      currency: r.currency!,
      label: r.currency!,
      total: Number(r.total),
      deals: Number(r.deals),
    }));

  const report: ReportData = { funnel, leaderboard, currencyTotals, conversionRate };
  return { report };
};
```

- [ ] Delete `src/routes/reports/+page.ts`
- [ ] Add `src/routes/reports/+page.server.ts` (above)
- [ ] Run `bun run check` — zero type errors

### Stage 2: Review queue server loader

File: `src/routes/review/+page.server.ts`

```ts
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { crmLeads } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const leads = await db
    .select({
      id: crmLeads.id,
      name: crmLeads.name,
      category: crmLeads.category,
      platform: crmLeads.platform,
      stage: crmLeads.stage,
      source: crmLeads.source,
      createdAt: crmLeads.createdAt,
    })
    .from(crmLeads)
    .where(and(isNull(crmLeads.deletedAt), eq(crmLeads.needsReview, true)))
    .orderBy(crmLeads.createdAt);

  return { leads };
};

export const actions: Actions = {
  resolve: async ({ request }) => {
    const data = await request.formData();
    const leadId = data.get('leadId');
    if (typeof leadId !== 'string' || !leadId) return fail(400, { error: 'Missing leadId' });

    await db
      .update(crmLeads)
      .set({ needsReview: false, updatedAt: new Date() })
      .where(eq(crmLeads.id, leadId));

    redirect(303, '/review');
  },
};
```

- [ ] Delete `src/routes/review/+page.ts`
- [ ] Add `src/routes/review/+page.server.ts` (above)
- [ ] Update `src/routes/review/+page.svelte` to use `data.leads` (not `data.items`)

### Verification checklist — RFC-001
- [ ] `bun run check` — zero type errors
- [ ] Load `/reports` in browser — real data, no mock indicator
- [ ] Load `/review` in browser — shows needs_review leads
- [ ] DB verify: `SELECT stage, COUNT(*) FROM crm_leads WHERE deleted_at IS NULL GROUP BY stage;` matches funnel
- [ ] DB verify: `SELECT COUNT(*) FROM crm_leads WHERE needs_review = true AND deleted_at IS NULL;` matches review list count

---

## RFC-002 — Reports UI Wiring

**Status:** ⏳ PLANNED
**Dependencies:** RFC-001 complete

### Stage 0: Pre-phase research
- [ ] Read `src/routes/reports/+page.svelte` in full — identify which sections need ECharts vs which are already pure HTML bars
- [ ] Check ECharts is in `package.json` and importable

### Stage 1: Funnel ECharts chart

The current funnel renders as HTML `<div>` bars. Optionally replace with ECharts horizontal
bar chart for richer visual. If the HTML bars already look correct with real data, ECharts
may only be needed for the leaderboard grouped-bar.

**Decision:** The funnel HTML bars in `+page.svelte` are already well-designed and data-driven.
Only replace with ECharts if the user requests it. For now, confirm the HTML bars work with
real data — they derive width from `(f.count / maxCount) * 100` which is correct.

- [ ] Confirm funnel renders correctly with real data (no ECharts needed if bars look right)

### Stage 2: Leaderboard grouped bar (ECharts)

Current leaderboard renders as a grid table. Add an ECharts `BarChart` above the table
showing wins / touches / replies as grouped horizontal bars per rep.

File: `src/routes/reports/+page.svelte`

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import * as echarts from 'echarts/core';
  import { BarChart } from 'echarts/charts';
  import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';
  echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

  let { data } = $props();
  const report = $derived(data.report);

  let chartEl: HTMLDivElement | undefined;
  let chart: echarts.ECharts | undefined;

  $effect(() => {
    if (!chartEl) return;
    chart = echarts.init(chartEl);
    const names = report.leaderboard.map(r => r.name);
    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Wins', 'Touches', 'Replies'] },
      grid: { left: 16, right: 16, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: names },
      series: [
        { name: 'Wins',    type: 'bar', data: report.leaderboard.map(r => r.wins),    itemStyle: { color: '#22c55e' } },
        { name: 'Touches', type: 'bar', data: report.leaderboard.map(r => r.touches), itemStyle: { color: '#6366f1' } },
        { name: 'Replies', type: 'bar', data: report.leaderboard.map(r => r.replies), itemStyle: { color: '#3b82f6' } },
      ],
    });
    return () => chart?.dispose();
  });
</script>
```

Add `<div bind:this={chartEl} class="h-[220px] w-full mb-4"></div>` inside the leaderboard card,
above the existing grid table.

### Stage 3: Currency totals verification

The currency cards block already exists in `+page.svelte` and iterates `report.currencyTotals`.
No new UI block is needed — verify that `report.currencyTotals` is populated correctly from the
server load and that the existing cards render with real data (currency label, formatted total,
deal count).

### Verification checklist — RFC-002
- [ ] ECharts grouped bar renders without console errors
- [ ] Leaderboard table still shows below the chart
- [ ] Currency totals cards appear only when there are won deals
- [ ] `bun run check` — zero type errors

---

## RFC-003 — CSV Export Endpoint

**Status:** ⏳ PLANNED
**Dependencies:** RFC-001 complete

### Stage 1: Export API route

File: `src/routes/api/reports/export/+server.ts`

```ts
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crmLeads, crmUsers } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
  const type = url.searchParams.get('type') ?? 'view';

  let rows: Record<string, unknown>[];

  if (type === 'won') {
    // Won-deals export for finance
    const data = await db
      .select({
        name: crmLeads.name,
        wonOrgName: crmLeads.wonOrgName,
        dealValueCents: crmLeads.dealValueCents,
        currency: crmLeads.currency,
        signedAt: crmLeads.signedAt,
        ownerId: crmLeads.ownerId,
        category: crmLeads.category,
      })
      .from(crmLeads)
      .where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')));

    // Resolve owner names
    const users = await db.select({ id: crmUsers.id, name: crmUsers.name }).from(crmUsers);
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    rows = data.map(r => ({
      'Lead Name':     r.name,
      'Org (Won)':     r.wonOrgName ?? '',
      'Deal Value':    r.dealValueCents != null ? r.dealValueCents / 100 : '',
      'Currency':      r.currency ?? '',
      'Signed At':     r.signedAt ? r.signedAt.toISOString().split('T')[0] : '',
      'Rep':           r.ownerId ? (userMap[r.ownerId] ?? '') : '',
      'Category':      r.category,
    }));
  } else {
    // View export — all active leads
    const data = await db
      .select({
        id: crmLeads.id,
        name: crmLeads.name,
        category: crmLeads.category,
        platform: crmLeads.platform,
        stage: crmLeads.stage,
        location: crmLeads.location,
        pageUrl: crmLeads.pageUrl,
        source: crmLeads.source,
        createdAt: crmLeads.createdAt,
      })
      .from(crmLeads)
      .where(isNull(crmLeads.deletedAt));

    rows = data.map(r => ({
      'Name':       r.name,
      'Category':   r.category,
      'Platform':   r.platform ?? '',
      'Stage':      r.stage,
      'Location':   r.location ?? '',
      'Page URL':   r.pageUrl ?? '',
      'Source':     r.source,
      'Created At': r.createdAt.toISOString().split('T')[0],
    }));
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csvRows = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];
  // UTF-8 BOM for Excel
  const csv = '﻿' + csvRows.join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="veent-${type}-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
};
```

### Stage 2: Wire export buttons in UI

In `src/routes/reports/+page.svelte`, add two export buttons to the PageHeader actions snippet:

```svelte
{#snippet actions()}
  <a
    href="/api/reports/export?type=won"
    class="h-[34px] rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600 inline-flex items-center"
    download
  >Won deals CSV</a>
  <a
    href="/api/reports/export?type=view"
    class="h-[34px] rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600 inline-flex items-center"
    download
  >Export view CSV</a>
  <button
    class="h-[34px] rounded-control border border-hairline bg-panel px-3 font-mono text-[12.5px] text-ink-600"
  >
    1 Mar – 24 Jun 2026 ▾
  </button>
{/snippet}
```

### Verification checklist — RFC-003
- [ ] `GET /api/reports/export?type=won` returns CSV with BOM, correct columns
- [ ] `GET /api/reports/export?type=view` returns CSV with all active leads
- [ ] Browser download triggers on button click
- [ ] File opens correctly in Excel (no encoding errors)
- [ ] `bun run check` — zero type errors

---

## RFC-004 — Review Queue Real Data + Resolve Action

**Status:** ⏳ PLANNED
**Dependencies:** RFC-001 complete (review server loader already written there)

### Stage 1: Update review page svelte

`src/routes/review/+page.svelte` currently uses `data.items` (type `ReviewItem[]`) from the mock
client. The server loader in RFC-001 provides `data.leads` with a different shape. Update the
svelte file to use `data.leads`.

The current review page renders a table of import issues. Replace it with a table of
`needs_review=true` leads with a Resolve button per row.

Key change: remove references to `data.items`, add resolve form, keep the existing page structure.

```svelte
<script lang="ts">
  let { data } = $props();
  const leads = $derived(data.leads);
</script>

<svelte:head><title>Review Queue · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
  <PageHeader title="Review Queue" subtitle="{leads.length} leads need attention" />

  {#if leads.length === 0}
    <EmptyState title="All clear" message="No leads flagged for review." />
  {:else}
    <div class="rounded-control border border-hairline bg-panel overflow-hidden">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-hairline font-mono text-[10px] uppercase tracking-wider text-ink-300">
            <th class="px-4 py-2.5 text-left">Name</th>
            <th class="px-4 py-2.5 text-left">Category</th>
            <th class="px-4 py-2.5 text-left">Platform</th>
            <th class="px-4 py-2.5 text-left">Stage</th>
            <th class="px-4 py-2.5 text-left">Source</th>
            <th class="px-4 py-2.5 text-left">Added</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {#each leads as lead (lead.id)}
            <tr class="border-b border-hairline last:border-0 hover:bg-panel-sunken">
              <td class="px-4 py-2.5 font-medium">{lead.name}</td>
              <td class="px-4 py-2.5 text-ink-600">{lead.category}</td>
              <td class="px-4 py-2.5 text-ink-600">{lead.platform ?? '—'}</td>
              <td class="px-4 py-2.5"><StageChip stage={lead.stage} /></td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">{lead.source}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-500">
                {new Date(lead.createdAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-2.5 text-right">
                <form method="POST" action="?/resolve">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <button
                    class="h-[28px] rounded-control border border-hairline px-2.5 font-mono text-[11px] text-ink-600 hover:border-fresh hover:text-fresh"
                  >
                    Resolve
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
```

- [ ] Remove all references to `ReviewItem` type and `data.items` in `+page.svelte`
- [ ] Import `StageChip` and `EmptyState` components
- [ ] Verify resolve form posts correctly

### Verification checklist — RFC-004
- [ ] `/review` shows correct count of `needs_review=true` leads from DB
- [ ] Clicking "Resolve" clears the flag and removes the row from the list
- [ ] DB verify after resolve: `SELECT needs_review FROM crm_leads WHERE id = '[id]';` → `false`
- [ ] Empty state shows when all leads are resolved
- [ ] `bun run check` — zero type errors

---

## Touchpoints

| File | Change type |
|------|-------------|
| `src/routes/reports/+page.ts` | **DELETE** (replaced by server loader) |
| `src/routes/reports/+page.server.ts` | **ADD** — funnel, leaderboard, currency Drizzle queries |
| `src/routes/reports/+page.svelte` | **MODIFY** — ECharts init, currency cards, export buttons |
| `src/routes/review/+page.ts` | **DELETE** (replaced by server loader) |
| `src/routes/review/+page.server.ts` | **ADD** — needs_review query + resolve action |
| `src/routes/review/+page.svelte` | **MODIFY** — use data.leads shape, resolve form |
| `src/routes/api/reports/export/+server.ts` | **ADD** — CSV export endpoint |
| `src/lib/server/db/schema.ts` | **READ ONLY** — no schema changes |
| `src/lib/types/index.ts` | **READ ONLY** — types already match |
| `src/lib/utils/csv.ts` | **READ ONLY** (or use inline CSV builder) |

---

## Public Contracts

| Contract | Notes |
|----------|-------|
| `GET /api/reports/export?type=won\|view` | New public endpoint. Returns `text/csv` with UTF-8 BOM. Not secret-authed — relies on SvelteKit session gate. |
| `POST /review?/resolve` | New form action. Takes `leadId` field; redirects 303 to `/review`. |
| `ReportData` type | Shape is stable — Drizzle queries must output identical structure to what UI already expects. |
| `data.leads` in review page | Shape change from `data.items: ReviewItem[]` to `data.leads: DbLead[]`. This is an internal page shape change only — not exposed externally. |

---

## Blast Radius

- **Risk class:** Medium (new API endpoints + UI changes, no schema changes)
- **Files changed:** 7 (2 deleted, 3 added, 2 modified)
- **Packages affected:** `src/routes` only — no changes to `src/lib/server/db/schema.ts` or `src/lib/types/index.ts`
- **No DB migrations required** — all queries use existing tables and columns
- **No auth changes** — export endpoint is behind the same session gate as all routes

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|-----------------|----------|-----------------------|
| `bun run check` passes with zero TS errors | Fully-Automated | Types match between server loaders and page components |
| `/reports` funnel counts match `SELECT stage, COUNT(*) FROM crm_leads WHERE deleted_at IS NULL GROUP BY stage` | Hybrid (manual DB query) | Funnel query is correct and complete |
| `/reports` leaderboard shows real reps (not mock names) | Manual | Leaderboard joins correctly |
| Currency totals show PHP and SGD in separate cards — no combined total | Manual | Deal value never summed across currencies |
| `GET /api/reports/export?type=won` downloads a `.csv` with correct columns | Hybrid | Won-deals export is usable by finance |
| `GET /api/reports/export?type=view` downloads a `.csv` with all non-deleted leads | Hybrid | View export covers correct rows |
| `/review` shows correct count matching DB `needs_review=true` count | Hybrid | Review queue is complete and accurate |
| Clicking "Resolve" on a row → row disappears + DB `needs_review = false` | Hybrid (manual + DB query) | Resolve action works end-to-end |
| `bun run test:unit` — existing 62 tests still pass | Fully-Automated | No regressions in Zod schema or reminder logic |

---

## Test Infra Improvement Notes

(none identified at plan-write time — no new server functions amenable to unit testing without a live DB; Hybrid gates above cover the critical paths)

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/reports/active/reports-echarts-review-queue_29-06-26/reports-echarts-review-queue_PLAN_29-06-26.md`
2. **Last completed phase:** None (⏳ PLANNED — not started)
3. **Validate-contract status:** Pending — vc-validate-agent writes this section before EXECUTE
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/features/reports/_GUIDE.md`
   - `process/context/tests/all-tests.md`
   - `src/lib/server/db/schema.ts`
   - `src/lib/types/index.ts`
   - `src/lib/services/crm-client.ts`
   - `src/routes/reports/+page.svelte` (first 60 lines)
   - `src/routes/reports/+page.ts`
   - `src/routes/review/+page.ts`
5. **Next step for a fresh executor:**
   - Confirm `DATABASE_URL` is set and live DB is reachable
   - Start with RFC-001 Stage 1 (create `src/routes/reports/+page.server.ts`)
   - Delete `src/routes/reports/+page.ts` after adding the server loader
   - Run `bun run check` after each file change
   - Execute RFCs in order: 001 → 002 → 003 → 004

---

## Acceptance Criteria

1. `/reports` funnel shows real stage counts from `crm_leads` — numbers differ from the mock
2. Funnel `conversionRate` equals `won_count / new_count * 100` (integer, 0 when no new leads)
3. Leaderboard rows are real `crm_users` (active only) sorted by wins desc, then touches desc
4. Deal value cards are rendered **per currency** — PHP total and SGD total are separate; no combined figure exists anywhere on the page
5. `GET /api/reports/export?type=won` returns a UTF-8 BOM CSV with columns: Lead Name, Org (Won), Deal Value, Currency, Signed At, Rep, Category
6. `GET /api/reports/export?type=view` returns a UTF-8 BOM CSV covering all non-deleted leads
7. CSV files open in Excel without mojibake (BOM present)
8. `/review` lists all leads where `needs_review = true AND deleted_at IS NULL`
9. Clicking "Resolve" on a row sets `needs_review = false` on that lead and removes it from the list
10. `bun run check` passes with zero TypeScript errors after all changes
11. `bun run test:unit` — all 62 existing unit tests still pass (no regressions)

---

## Phase Loop Progress

- [ ] Step 1: RESEARCH
- [ ] Step 2: INNOVATE
- [ ] Step 3: PLAN-SUPPLEMENT
- [x] Step 4: PVL (validate)
- [ ] Step 5: EXECUTE
- [ ] Step 6: EVL
- [x] Step 7: UPDATE PROCESS — archived; context updated; committed

---

## Validate Contract

Status: CONDITIONAL
Date: 29-06-26
date: 2026-06-29
generated-by: inner-pvl: reports

Parallel strategy: sequential
Rationale: 3/7 signals (S2 new API + form action, S6 new public API endpoint, S7 7 files) — MEDIUM. RFCs are dependency-chained (001 -> 002/003/004) and RFC-002/003 both edit `reports/+page.svelte`, so parallel execute agents would collide. One sequential vc-execute-agent (opus), RFCs in order.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC10 | Server loaders' types match page-component shapes (incl. currency cast) | Fully-Automated | `bun run check` exits 0 | B — fix in this plan (currency `as Currency` cast, note E1) |
| AC11 | No regression in existing 62 unit tests | Fully-Automated | `bun run test:unit` all pass | A — proven now |
| AC1, AC2 | Funnel real stage counts + `conversionRate = won/new*100` | Hybrid | Load `/reports`; `SELECT stage, COUNT(*) FROM crm_leads WHERE deleted_at IS NULL GROUP BY stage;` matches funnel bars | D — no Drizzle DB test harness in scope |
| AC3 | Leaderboard = active `crm_users`, sorted wins desc then touches desc | Hybrid | Load `/reports`; compare rows to `crm_activities`/`crm_leads` aggregates per rep | D — no Drizzle DB test harness in scope |
| AC4 | Currency totals per-currency, never summed across currencies | Hybrid | Visual: PHP and SGD in separate cards; cross-check `... GROUP BY currency` | D — no Drizzle DB test harness in scope |
| AC5, AC7 | `?type=won` CSV: correct columns + UTF-8 BOM, opens clean in Excel | Hybrid | `curl '/api/reports/export?type=won'` (authed session) -> inspect header row + BOM bytes; open in Excel | D — no Drizzle DB test harness in scope |
| AC6, AC7 | `?type=view` CSV: all non-deleted leads + BOM | Hybrid | `curl '/api/reports/export?type=view'` -> row count matches `SELECT COUNT(*) ... WHERE deleted_at IS NULL` | D — no Drizzle DB test harness in scope |
| AC8 | **OBSOLETE (see superseded banner)** — `/review` lists `needs_review=true AND deleted_at IS NULL` | Hybrid | Load `/review`; `SELECT COUNT(*) FROM crm_leads WHERE needs_review = true AND deleted_at IS NULL;` matches list | D — no Drizzle DB test harness in scope |
| AC9 | **OBSOLETE (see superseded banner)** — Resolve clears flag + removes row | Hybrid | Click Resolve; `SELECT needs_review FROM crm_leads WHERE id = '[id]';` -> false; row gone after reload | D — no Drizzle DB test harness in scope |

Failing stubs: N/A. The two Fully-Automated rows are aggregate command gates (`bun run check`, `bun run test:unit`), not new per-scenario unit functions — this plan introduces no DB-free pure function amenable to a TDD stub (all new logic lives in server loaders/endpoints that require a live DB). No `test(...)` stub is generated; the command gates are the red-first signal (`bun run check` currently fails on the currency type until note E1 is applied).

Legacy line form (retained for existing validate-contract consumers):
- Type contract (loaders <-> UI): Fully-automated: `bun run check`
- Regression: Fully-automated: `bun run test:unit`
- Funnel / leaderboard / currency / CSV / review / resolve data correctness: hybrid: load page or curl endpoint + matching `SELECT` DB query — precondition: live Postgres with `DATABASE_URL` set and seeded data
- Drizzle query unit coverage: known-gap: documented (no DB test harness in plan scope)

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual via gap-resolution D, never a strategy.

Dimension findings:
- Infra fit: PASS — `src/routes` only; SvelteKit `+page.server.ts`/`+server.ts` pattern; ECharts 6.x already in deps; no container/port/worker surface; no migrations.
- Test coverage: CONCERN — type contract + regression are fully automated, but all data-correctness behaviors are Hybrid (live DB) only; no Drizzle test harness exists (consistent with `all-tests.md` Known Gaps). Named residual, not vacuously green.
- Breaking changes: PASS — `data.items`->`data.leads` and `ReviewItem` removal are internal page-shape changes only; `ReportData` shape unchanged; no external consumer.
- Security surface: PASS — `/api/reports/export` is NOT in `PUBLIC_PREFIXES`, so the session handle gates it like every route; no new auth/secret surface; no schema change. (Minor note: export exposes all-lead data + deal values to any logged-in user with no rep/manager split — consistent with the existing reports page; not blocking.)
- RFC-001 (Server Data Layer) feasibility: CONCERN — mechanically feasible; tables/columns all verified present (`stage`, `deletedAt`, `currency`, `dealValueCents`, `needsReview`, `repId`, `outcome`, `ownerId`, `crmUsers.active`). Highest-risk edit: currency `string`->`Currency` type gap (note E1) which fails `bun run check` without a cast.
- RFC-002 (Reports UI Wiring) feasibility: CONCERN — feasible; highest-risk edit: the illustrative `<script>` block omits existing imports + `maxCount`; must MERGE not replace (note E2). Currency cards already exist — Stage 3 add would duplicate (note E3).
- RFC-003 (CSV Export) feasibility: PASS — new isolated endpoint; all selected columns verified in schema; inline CSV builder; BOM correct. Merge export links into the existing `actions` snippet (note E4).
- RFC-004 (Review Queue + Resolve) feasibility: CONCERN — feasible; `StageChip`/`EmptyState` exist (verified); highest-risk edit: `EmptyState` prop is `hint` not `message` (note E5), and the rich edit-before-resolve UX is intentionally dropped for v1 — confirm with user at handoff.

Execute-agent instructions (concerns recorded for EXECUTE — not plan-blocking FAILs):
- E1 — RFC-001 currency: cast `currency: r.currency as Currency` (and `label`) so the `CurrencyTotal.currency: Currency` field type-checks. `.filter()` does not narrow. Verify with `bun run check`.
- E2 — RFC-002 script: MERGE ECharts imports + chart `$effect` into the EXISTING `+page.svelte` `<script>`; preserve current `PageHeader`/`Avatar`/`formatMoney`/`FunnelStage` imports, `let { data } = $props()`, `const report = $derived(...)`, and `maxCount`. Do NOT wholesale-replace.
- E3 — RFC-002 Stage 3: SKIP adding currency cards — they already exist (~lines 78-97). Only verify they render against real data.
- E4 — RFC-003 Stage 2: MERGE the two export `<a>` links into the EXISTING `{#snippet actions()}`; do not declare a duplicate `actions` snippet; keep the date button.
- E5 — RFC-004 svelte: use `EmptyState` prop `hint` (not `message`); add the `PageHeader`/`StageChip`/`EmptyState` imports the code block needs; confirm the v1 resolve-only (no edit) UX is intended before closing.

Open gaps:
- Drizzle query data-correctness coverage: known-gap: documented — no DB integration test harness exists in this plan's scope; all 7 data behaviors verified via Hybrid (live DB) gates only. Resolution D (backlog stub). Consistent with `process/context/tests/all-tests.md` Known Gaps.
- Date-range filter to funnel query: out of scope (v1) — funnel queries all-time; date picker is a visual stub. Documented in Scope.

What this coverage does NOT prove:
- `bun run check` proves only that types align (loaders <-> components) and catches the currency cast bug — it does NOT prove any SQL aggregation is semantically correct (funnel counts, conversion math, leaderboard join, currency grouping, CSV row set).
- `bun run test:unit` proves only that the existing 62 unit tests (Zod schemas + reminder logic) still pass — it exercises NONE of the new loaders, the export endpoint, or the resolve action (no DB-backed tests exist).
- No gate proves: ECharts renders without runtime console errors (Manual), CSV opens in Excel without mojibake (Manual), the 303 redirect + row removal after resolve (Hybrid manual), or that "never sum across currencies" holds at runtime (Manual visual). These require the Hybrid/manual steps listed above.

Gate: CONDITIONAL (4 CONCERNs, 0 FAILs; concerns recorded as execute-agent instructions E1–E5 + one documented known-gap; data-correctness behaviors carried on Hybrid gates with a named test-harness residual)
Accepted by: session (orchestrator single-pass VALIDATE directive) — accepted concerns: E1 currency cast, E2 script merge, E3 duplicate currency cards, E4 actions snippet merge, E5 EmptyState prop + v1 resolve UX; accepted known-gap: Drizzle data-correctness coverage (Hybrid-only, no DB test harness).

---

## Autonomous Goal Block

```
SESSION GOAL: Convert /reports and /review from mock data to real Drizzle-backed data — funnel + leaderboard + per-currency totals (ECharts), CSV export endpoint, and an actionable review queue (resolve clears needs_review).
Charter + umbrella plan: N/A — single plan
Autonomy: Standard interactive RIPER-5. On EXECUTE, apply VALIDATE notes E1–E5. Reversible edits auto-proceed; surface only the v1 resolve-UX scope cut (E5) for user confirmation at handoff.
Hard stop conditions / safety constraints:
- Never sum deal value across currencies (PHP and SGD stay separate cards/columns) — product rule.
- No schema changes / no migrations — queries use existing columns only.
- Keep /api/reports/export behind the session gate (do NOT add it to PUBLIC_PREFIXES).
- Soft-delete respected: every lead query filters isNull(deletedAt).
Next phase: EXECUTE: process/features/reports/active/reports-echarts-review-queue_29-06-26/reports-echarts-review-queue_PLAN_29-06-26.md (sequential, one vc-execute-agent, opus, RFCs 001->002->003->004)
Validate contract: inline in plan (## Validate Contract — Gate CONDITIONAL, 29-06-26)
Execute start: fully-auto: bun run check then bun run test:unit | hybrid: load /reports + /review and run the matching SELECT queries against live DB; curl both /api/reports/export modes | probe: ECharts render + CSV-in-Excel visual check | high-risk pack: no
```

---

## Agent Routing Reference

- **Next phase:** "ENTER EXECUTE MODE" -> spawn `vc-execute-agent` (opus) with this plan path (Gate is CONDITIONAL — accepted; EXECUTE may proceed)
- **Execution:** Sequential, RFCs 001->002->003->004; apply VALIDATE notes E1–E5
- **Test runner:** `bun run check` -> `bun run test:unit` (no e2e yet)
- **Commit branch:** `main` (per project commit policy — no feature branch)
