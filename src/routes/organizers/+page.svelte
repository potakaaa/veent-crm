<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import {
		Table,
		TableHeader,
		TableBody,
		TableRow,
		TableHead,
		TableCell
	} from '$lib/components/ui/table';
	import { makeSortTable } from '$lib/utils/tableSort';

	let { data } = $props();

	let paging = $state(false);
	const navLoading = $derived(paging || navigating.to?.url.pathname === '/organizers');

	let searchInput = $derived(data.filters.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

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
		navigate({ [key]: value, page: undefined });
	}

	function onSearchInput(e: Event & { currentTarget: HTMLInputElement }) {
		const val = e.currentTarget.value;
		searchInput = val;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			navigate({ q: val || undefined, page: undefined });
		}, 300);
	}

	function sortToggle(id: string, desc: boolean) {
		navigate({ sort: id, dir: desc ? 'desc' : 'asc', page: undefined });
	}

	const table = $derived(
		makeSortTable({
			data: data.organizers,
			columns: [
				{ id: 'name', header: 'Name' },
				{ id: 'leads', header: 'Leads', sortDescFirst: true }
			],
			sort: data.sort,
			dir: data.dir,
			onToggle: sortToggle
		})
	);
	const headers = $derived(table.getHeaderGroups()[0].headers);
	const nameHeader = $derived(headers.find((h) => h.id === 'name')!);
	const leadsHeader = $derived(headers.find((h) => h.id === 'leads')!);

	function ariaSort(state: false | 'asc' | 'desc'): 'none' | 'ascending' | 'descending' {
		return state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : 'none';
	}
</script>

<svelte:head><title>Organizers · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Organizers"
		subtitle="Every recurring event organizer, with their linked-lead count. Open one to see its full event history."
	/>

	<!-- toolbar -->
	<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
		<Input value={searchInput} oninput={onSearchInput} placeholder="Search…" class="h-8 w-44" />

		{#if data.countries.length > 0}
			<Select
				type="single"
				value={data.filters.country}
				onValueChange={(v: string) => setFilter('country', v)}
			>
				<SelectTrigger
					size="sm"
					class={data.filters.country ? 'border-primary text-primary-strong bg-selected' : ''}
					>{data.filters.country || 'Country'}</SelectTrigger
				>
				<SelectContent>
					<SelectItem value="" label="All countries">All countries</SelectItem>
					{#each data.countries as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
				</SelectContent>
			</Select>
		{/if}
	</div>

	<Card class="gap-0 overflow-hidden rounded-control py-0">
		<Table>
			<TableHeader>
				<TableRow class="bg-[#faf9fb] hover:bg-[#faf9fb]">
					{@const nameSorted = nameHeader.column.getIsSorted()}
					<TableHead aria-sort={ariaSort(nameSorted)}>
						<button
							type="button"
							class="inline-flex items-center gap-1 hover:text-ink"
							onclick={nameHeader.column.getToggleSortingHandler()}
						>
							Name
							<span class="font-mono text-[10px] text-ink-300">
								{nameSorted === 'asc' ? '↑' : nameSorted === 'desc' ? '↓' : ''}
							</span>
						</button>
					</TableHead>
					<TableHead class="normal-case">Handle</TableHead>
					<TableHead class="normal-case">Location</TableHead>
					{@const leadsSorted = leadsHeader.column.getIsSorted()}
					<TableHead class="text-right" aria-sort={ariaSort(leadsSorted)}>
						<button
							type="button"
							class="inline-flex flex-row-reverse items-center gap-1 hover:text-ink"
							onclick={leadsHeader.column.getToggleSortingHandler()}
						>
							Leads
							<span class="font-mono text-[10px] text-ink-300">
								{leadsSorted === 'asc' ? '↑' : leadsSorted === 'desc' ? '↓' : ''}
							</span>
						</button>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#if navLoading}
					{#each Array(6) as _, i (i)}
						<TableRow>
							{#each Array(4) as _, c (c)}
								<TableCell><Skeleton class="h-3.5 w-full" /></TableCell>
							{/each}
						</TableRow>
					{/each}
				{:else if data.organizers.length === 0}
					<TableRow>
						<TableCell colspan={4} class="py-10 text-center text-[13px] text-ink-300">
							No organizers match.
						</TableCell>
					</TableRow>
				{:else}
					{#each data.organizers as org (org.id)}
						<TableRow
							class="cursor-pointer hover:bg-panel"
							onclick={() => goto(`/organizers/${org.id}`)}
						>
							<TableCell class="max-w-[260px] truncate">
								<a
									href={`/organizers/${org.id}`}
									class="block truncate text-[13px] font-semibold text-ink-700 hover:text-primary hover:underline"
									title={org.name}
									onclick={(e) => e.stopPropagation()}
								>
									{org.name}
								</a>
							</TableCell>
							<TableCell
								class="max-w-[220px] truncate font-mono text-[12px] text-ink-500"
								title={org.normalizedHandle ?? undefined}
							>
								{org.normalizedHandle ?? '—'}
							</TableCell>
							<TableCell
								class="max-w-[200px] truncate text-[13px] text-ink-600"
								title={org.location ?? undefined}
							>
								{org.location ?? '—'}
							</TableCell>
							<TableCell class="text-right font-mono text-[13px]">{org.leadCount}</TableCell>
						</TableRow>
					{/each}
				{/if}
			</TableBody>
		</Table>
	</Card>

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
