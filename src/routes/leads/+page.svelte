<script lang="ts">
	import { goto, afterNavigate } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadGrid from '$lib/components/leads/LeadGrid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import { stageLabel } from '$lib/utils/stages';
	import type { LeadSegment, Stage } from '$lib/types';

	let { data } = $props();

	let paging = $state(false);
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

	// Local search state — writable derived: resets when the loaded filter changes
	// (back/forward navigation), but still assignable for live typing before debounce.
	let searchInput = $derived(data.filters.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

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
		goto(`?${params}`, { keepFocus: true });
	}

	function setFilter(key: string, value: string | boolean | number | undefined) {
		navigate({ [key]: value, page: undefined }); // reset page (delete param = default 1)
	}

	function setSegment(seg: LeadSegment) {
		pendingSegment = seg;
		navigate({ segment: seg === 'mine' ? undefined : seg, page: undefined });
	}

	function onSearchInput(e: Event & { currentTarget: HTMLInputElement }) {
		const val = e.currentTarget.value;
		searchInput = val;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			navigate({ q: val || undefined, page: undefined });
		}, 300);
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
		if (data.filters.search) p.set('q', data.filters.search);
		const qs = p.toString();
		return `/api/leads/export${qs ? '?' + qs : ''}`;
	});
</script>

<svelte:head><title>My Leads · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader title="My Leads" subtitle="Search the command bar before adding a page.">
		{#snippet actions()}
			<span class="font-mono text-[12px] text-ink-300">{data.total} matching</span>
			<Button variant="outline" size="sm" href={exportHref}>Export CSV</Button>
		{/snippet}
	</PageHeader>

	<!-- toolbar -->
	<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
		<div class="flex rounded-control bg-panel-sunken p-[3px]">
			{#each segDefs as s (s.key)}
				<button
					onclick={() => setSegment(s.key)}
					class="h-[26px] rounded-[6px] px-3 text-[12.5px] {activeSegment === s.key
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					{s.label}
				</button>
			{/each}
		</div>
		<Separator orientation="vertical" class="h-[22px]" />

		<Select
			type="single"
			value={data.filters.stage}
			onValueChange={(v: string) => setFilter('stage', v)}
		>
			<SelectTrigger size="sm"
				>{data.filters.stage ? stageLabel(data.filters.stage as Stage) : 'Stage'}</SelectTrigger
			>
			<SelectContent>
				<SelectItem value="" label="All stages">All stages</SelectItem>
				{#each LEAD_STAGES.filter((s) => s !== 'lost' || data.filters.segment === 'lost') as s (s)}<SelectItem
						value={s}
						label={stageLabel(s)}>{stageLabel(s)}</SelectItem
					>{/each}
			</SelectContent>
		</Select>
		<Select
			type="single"
			value={data.filters.platform}
			onValueChange={(v: string) => setFilter('platform', v)}
		>
			<SelectTrigger size="sm">{data.filters.platform || 'Platform'}</SelectTrigger>
			<SelectContent>
				<SelectItem value="" label="All platforms">All platforms</SelectItem>
				{#each LEAD_PLATFORMS as p (p)}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
			</SelectContent>
		</Select>

		{#if data.countries.length > 0}
			<Select
				type="single"
				value={data.filters.country}
				onValueChange={(v: string) => setFilter('country', v)}
			>
				<SelectTrigger size="sm">{data.filters.country || 'Country'}</SelectTrigger>
				<SelectContent>
					<SelectItem value="" label="All countries">All countries</SelectItem>
					{#each data.countries as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
				</SelectContent>
			</Select>
		{/if}

		<Button
			variant="outline"
			size="sm"
			onclick={() => setFilter('staleOnly', data.filters.staleOnly ? undefined : true)}
			class={data.filters.staleOnly ? 'border-stale bg-[rgba(194,113,12,0.08)] text-[#92560b]' : ''}
		>
			<span class="h-[7px] w-[7px] rounded-full bg-stale"></span> Stale only (&gt;30d)
		</Button>

		<Button
			variant="outline"
			size="sm"
			onclick={() => setFilter('hasFutureEvents', data.filters.hasFutureEvents ? undefined : '1')}
			class={data.filters.hasFutureEvents ? 'border-violet-400 bg-violet-100 text-violet-700' : ''}
		>
			<span class="h-[7px] w-[7px] rounded-full bg-violet-500"></span> Future events
		</Button>

		<Input
			value={searchInput}
			oninput={onSearchInput}
			placeholder="Filter…"
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
