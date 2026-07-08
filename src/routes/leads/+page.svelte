<script lang="ts">
	import { goto, afterNavigate } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadGrid from '$lib/components/leads/LeadGrid.svelte';
	import ImportWizard from '$lib/components/import/ImportWizard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FilterDropdown } from '$lib/components/ui/filter-dropdown';
	import { SearchInput } from '$lib/components/ui/search-input';
	import { WeekRangeControl } from '$lib/components/ui/week-range-control';
	import { Tabs } from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import * as Popover from '$lib/components/ui/popover';
	import RepFilterCombobox from '$lib/components/ui/rep-filter-combobox/RepFilterCombobox.svelte';
	import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import { stageLabel } from '$lib/utils/stages';
	import { isManagerRole } from '$lib/utils/permissions';
	import type { LeadSegment } from '$lib/types';

	let { data } = $props();

	let paging = $state(false);
	let importOpen = $state(false);
	// Optimistic segment: set on click for instant highlight; cleared when navigation
	// settles so the active state falls back to what the server confirmed.
	let pendingSegment = $state<LeadSegment | null>(null);
	const activeSegment = $derived<LeadSegment>(pendingSegment ?? data.filters.segment ?? 'mine');
	afterNavigate(() => {
		paging = false;
		pendingSegment = null;
	});

	// Skeleton while navigating to this route (filter/segment/page changes included).
	const navLoading = $derived(paging || navigating.to?.url.pathname === '/leads');

	// Stage filter options (value = stage key, label = human label). Segment-aware:
	// "lost" only appears while viewing the Lost segment.
	const stageOptions = $derived(
		LEAD_STAGES.filter((s) => s !== 'lost' || data.filters.segment === 'lost').map((s) => ({
			value: s,
			label: stageLabel(s)
		}))
	);

	let weeksInput = $derived(
		data.filters.weeksAhead === null ? '' : String(data.filters.weeksAhead ?? 8)
	);
	let weeksTimer: ReturnType<typeof setTimeout> | null = null;

	const segDefs: { key: LeadSegment; label: string }[] = [
		{ key: 'mine', label: 'Mine' },
		{ key: 'all', label: 'All' },
		{ key: 'unassigned', label: 'Unassigned' },
		{ key: 'lost', label: 'Lost' }
	];

	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '' || v === false || v === 0) {
				params.delete(k);
			} else {
				params.set(k, String(v));
			}
		}
		return goto(`?${params}`, { keepFocus: true });
	}

	function setFilter(key: string, value: string | boolean | number | undefined) {
		navigate({ [key]: value, page: undefined }); // reset page (delete param = default 1)
	}

	// Owner combobox reconciliation (GitHub #226): the server ANDs the `segment==='mine'`
	// condition (scoped to the current session user) with the explicit `ownerId` param, so a
	// specific-owner selection under the default `segment=mine` would contradict and return
	// nothing. Change owner + segment together so the two never fight.
	function setOwnerFilter(id: string) {
		if (id === '' /* "All owners" */) {
			// Show every owner's leads: clear owner, widen segment to `all`.
			navigate({ owner: undefined, segment: 'all', page: undefined });
		} else if (id === data.me.id /* "Mine" quick filter */) {
			// Back to the manager's own leads: drop owner, reset segment to default `mine`.
			navigate({ owner: undefined, segment: undefined, page: undefined });
		} else {
			// A specific other owner: widen segment to `all` so only the explicit owner filter applies.
			navigate({ owner: id, segment: 'all', page: undefined });
		}
	}

	async function setSegment(seg: LeadSegment) {
		pendingSegment = seg;
		try {
			await navigate({ segment: seg === 'mine' ? undefined : seg, page: undefined });
		} catch {
			// Navigation failed or was rejected — clear pending state if not superseded.
			if (pendingSegment === seg) pendingSegment = null;
		}
	}

	// Category filter (CAT-1, GitHub #248): multi-select → comma-joined `categoryIds` param.
	const categoryOptions = $derived(data.allCategories.map((c) => ({ value: c.id, label: c.name })));
	function setCategoryFilter(ids: string[]) {
		navigate({ categoryIds: ids.length ? ids.join(',') : undefined, page: undefined });
	}

	// Search debounce is owned by SearchInput (canonical 300ms) — page only navigates.
	function onSearch(value: string) {
		navigate({ q: value || undefined, page: undefined });
	}

	function setWeeks(w: number | 'all') {
		setFilter('weeksAhead', w === 'all' ? 'all' : w);
	}
	function onWeeksInput(raw: string) {
		weeksInput = raw;
		if (weeksTimer) clearTimeout(weeksTimer);
		const n = parseInt(raw, 10);
		if (!raw) return;
		weeksTimer = setTimeout(() => {
			if (n > 0) setWeeks(n);
		}, 400);
	}

	function sortClick(col: string, sortDir: 'asc' | 'desc') {
		navigate({ sort: col, dir: sortDir, page: undefined });
	}

	// Build export URL using current filter params.
	const exportHref = $derived.by(() => {
		const p = new SvelteURLSearchParams();
		if (data.filters.segment && data.filters.segment !== 'mine')
			p.set('segment', data.filters.segment);
		if (data.filters.stage) p.set('stage', data.filters.stage);
		if (data.filters.platform) p.set('platform', data.filters.platform);
		if (data.filters.country) p.set('country', data.filters.country);
		if (data.filters.staleOnly) p.set('staleOnly', '1');
		if (data.filters.hasFutureEvents) p.set('hasFutureEvents', '1');
		if (data.filters.weeksAhead !== 8) {
			p.set(
				'weeksAhead',
				data.filters.weeksAhead === null ? 'all' : String(data.filters.weeksAhead)
			);
		}
		if (data.filters.search) p.set('q', data.filters.search);
		const qs = p.toString();
		return `/api/leads/export${qs ? '?' + qs : ''}`;
	});

	// Presentational-only derived state for the "Filters" popover badge + Clear-all
	// affordance. Reads the same loaded filters; emits no new URL params.
	const weeksActive = $derived(data.filters.weeksAhead !== 8);
	const secondaryCount = $derived(
		(data.filters.staleOnly ? 1 : 0) +
			(data.filters.hasFutureEvents ? 1 : 0) +
			(weeksActive ? 1 : 0)
	);
	// Href for the popover's own "Clear all" — resets only the 3 controls housed in this
	// popover (stale/future/weeks), preserving stage/platform/country/search/segment.
	const secondaryClearHref = $derived.by(() => {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		params.delete('staleOnly');
		params.delete('hasFutureEvents');
		params.delete('weeksAhead');
		params.delete('page');
		const qs = params.toString();
		return `/leads${qs ? '?' + qs : ''}`;
	});
	// Shared active/inactive chrome for the token-unified filter toggles/pills.
	const chipActive = 'bg-selected border-primary text-primary-strong';
	const chipActiveStale = 'bg-stale/12 border-stale text-ink-700';
	const chipActiveFresh = 'bg-fresh/12 border-fresh text-ink-700';
	const chipInactive = 'border-hairline bg-panel text-ink-500 hover:bg-panel-sunken';
</script>

<svelte:head><title>My Leads · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="My Leads">
		{#snippet actions()}
			<span class="font-mono text-[12px] text-ink-300">{data.total} matching</span>
			<Button variant="outline" size="sm" onclick={() => (importOpen = true)}>Import</Button>
			<Button variant="outline" size="sm" href={exportHref}>Export CSV</Button>
		{/snippet}
	</PageHeader>

	<ImportWizard open={importOpen} onOpenChange={(v) => (importOpen = v)} />

	<!-- toolbar -->
	<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
		<Tabs
			variant="segment"
			ariaLabel="Filter leads by segment"
			tabs={segDefs.map((s) => ({ value: s.key, label: s.label }))}
			value={activeSegment}
			onValueChange={(v) => setSegment(v as LeadSegment)}
		/>

		<FilterDropdown
			label="Stage"
			multiple={false}
			options={stageOptions}
			selected={data.filters.stage ?? ''}
			onchange={(v) => setFilter('stage', (v as string) || undefined)}
		/>
		<FilterDropdown
			label="Platform"
			multiple={false}
			options={LEAD_PLATFORMS}
			selected={data.filters.platform ?? ''}
			onchange={(v) => setFilter('platform', (v as string) || undefined)}
		/>

		{#if data.countries.length > 0}
			<FilterDropdown
				label="Country"
				multiple={false}
				options={data.countries}
				selected={data.filters.country ?? ''}
				onchange={(v) => setFilter('country', (v as string) || undefined)}
			/>
		{/if}

		{#if categoryOptions.length > 0}
			<FilterDropdown
				label="Category"
				multiple={true}
				options={categoryOptions}
				selected={data.filters.categoryIds ?? []}
				onchange={(v) => setCategoryFilter(v as string[])}
			/>
		{/if}

		{#if isManagerRole(data.me.role)}
			<RepFilterCombobox
				users={data.users}
				selectedId={data.filters.owner || (data.filters.segment === 'mine' ? data.me.id : '')}
				currentUserId={data.me.id}
				allLabel="All owners"
				placeholder="Search owners..."
				onSelect={setOwnerFilter}
			/>
		{/if}

		<!-- Secondary "Filters" popover: Stale-only, Future events, and weeks-timing group -->
		<Popover.Root>
			<Popover.Trigger
				class="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors {secondaryCount >
				0
					? chipActive
					: chipInactive}"
			>
				Filters
				{#if secondaryCount > 0}
					<Badge variant="default" class="h-4 min-w-4 px-1 text-[10px]">{secondaryCount}</Badge>
				{/if}
			</Popover.Trigger>
			<Popover.Content align="start" class="w-72">
				<div class="flex items-center justify-between pb-0.5">
					<span class="font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
						>Filters</span
					>
					{#if secondaryCount > 0}
						<a
							href={secondaryClearHref}
							class="font-mono text-[11.5px] text-primary hover:underline">Clear all</a
						>
					{/if}
				</div>

				<button
					onclick={() => setFilter('staleOnly', data.filters.staleOnly ? undefined : '1')}
					aria-pressed={data.filters.staleOnly}
					class="flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-[12.5px] transition-colors {data
						.filters.staleOnly
						? chipActiveStale
						: chipInactive}"
				>
					<span class="h-[7px] w-[7px] rounded-full bg-stale"></span> Stale only (&gt;30d)
				</button>

				<button
					onclick={() =>
						setFilter('hasFutureEvents', data.filters.hasFutureEvents ? undefined : '1')}
					aria-pressed={data.filters.hasFutureEvents}
					class="flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-[12.5px] transition-colors {data
						.filters.hasFutureEvents
						? chipActiveFresh
						: chipInactive}"
				>
					<span class="h-[7px] w-[7px] rounded-full bg-fresh"></span> Future events
				</button>

				<div class="flex flex-col gap-1.5">
					<span class="font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
						>Event timing</span
					>
					<WeekRangeControl
						label="Minimum weeks until event"
						presets={[4, 8, 12]}
						value={data.filters.weeksAhead}
						onchange={setWeeks}
						overrideValue={weeksInput}
						onOverrideInput={onWeeksInput}
					/>
				</div>
			</Popover.Content>
		</Popover.Root>

		<SearchInput
			value={data.filters.search ?? ''}
			oninput={onSearch}
			placeholder="Search…"
			ariaLabel="Search My Leads"
			class="ml-auto h-8 w-44"
		/>
	</div>

	{#if data.filters.date}
		<div
			class="mb-3 flex items-center gap-2 rounded-control border border-hairline bg-panel-sunken px-3 py-2 text-[12.5px]"
		>
			<span class="text-ink-500">Filtered by date:</span>
			<span class="font-mono font-semibold text-ink">{data.filters.date}</span>
			<span class="text-ink-400"
				>({data.filters.dateField === 'created_at' ? 'created' : 'event date'})</span
			>
			<a
				href="/leads?segment={data.filters.segment}"
				class="ml-auto font-mono text-[11.5px] text-primary hover:underline"
			>
				Clear
			</a>
		</div>
	{/if}

	{#if data.filters.createdFrom}
		<div
			class="mb-3 flex items-center gap-2 rounded-control border border-hairline bg-panel-sunken px-3 py-2 text-[12.5px]"
		>
			<span class="text-ink-500">Showing leads added since:</span>
			<span class="font-mono font-semibold text-ink">{data.filters.createdFrom}</span>
			<button
				type="button"
				onclick={() => navigate({ createdFrom: undefined, page: undefined })}
				class="ml-auto font-mono text-[11.5px] text-primary hover:underline"
			>
				Clear
			</button>
		</div>
	{/if}

	<LeadGrid
		leads={data.leads}
		users={data.users}
		sort={data.sort}
		dir={data.dir}
		loading={navLoading}
		onSortChange={sortClick}
	/>

	<!-- pagination -->
	{#if data.pagination.totalPages > 1}
		{@const { page: pg, pageSize, total, totalPages } = data.pagination}
		{@const start = (pg - 1) * pageSize + 1}
		{@const end = Math.min(pg * pageSize, total)}
		<div class="mt-5 flex items-center justify-between text-[13px] text-ink-300">
			<span class="font-mono">{start}–{end} of {total}</span>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={pg <= 1 || paging}
					onclick={() => {
						paging = true;
						navigate({ page: pg - 1 });
					}}>← Prev</Button
				>
				<span class="font-mono">Page {pg} of {totalPages}</span>
				<Button
					variant="outline"
					size="sm"
					disabled={pg >= totalPages || paging}
					onclick={() => {
						paging = true;
						navigate({ page: pg + 1 });
					}}>Next →</Button
				>
			</div>
		</div>
	{/if}
</div>
