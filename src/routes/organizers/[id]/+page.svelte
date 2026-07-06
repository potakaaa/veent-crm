<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import NotesPanel from '$lib/components/shared/NotesPanel.svelte';
	import { createNoteHandlers } from '$lib/utils/note-actions';
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
	import { formatDate } from '$lib/utils/dates';
	import { stageLabel } from '$lib/utils/stages';
	import { makeSortTable } from '$lib/utils/tableSort';
	import type { Stage } from '$lib/types';

	let { data } = $props();
	const org = $derived(data.organizer);

	// $derived (not a one-time call) so the create URL follows `org.id` if this
	// page instance is ever reused across id → id navigations.
	const noteHandlers = $derived(createNoteHandlers(`/api/organizers/${org.id}/notes`));

	let paging = $state(false);
	const navLoading = $derived(paging || !!navigating.to);

	let searchInput = $derived(data.filters.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(pageState.url.searchParams);
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
			data: data.leads,
			columns: [
				{ id: 'event', header: 'Event' },
				{ id: 'eventDate', header: 'Event date', sortDescFirst: true }
			],
			sort: data.sort,
			dir: data.dir,
			onToggle: sortToggle
		})
	);
	const headers = $derived(table.getHeaderGroups()[0].headers);

	function ariaSort(state: false | 'asc' | 'desc'): 'none' | 'ascending' | 'descending' {
		return state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : 'none';
	}
</script>

<svelte:head><title>{org.name} · Organizers · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<a
		href="/organizers"
		class="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} stroke={2} /> Back to organizers
	</a>

	<PageHeader
		title={org.name}
		subtitle={[org.normalizedHandle, org.location].filter(Boolean).join(' · ') || undefined}
	>
		{#snippet actions()}
			<Button href={`/leads/new?organizerId=${org.id}&name=${encodeURIComponent(org.name)}`}>
				<Icon name="plus" size={15} stroke={2.2} /> Add Event
			</Button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_320px]">
		<!-- LEFT -->
		<div>
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

				{#if data.owners.length > 0}
					<Select
						type="single"
						value={data.filters.owner}
						onValueChange={(v: string) => setFilter('owner', v)}
					>
						<SelectTrigger
							size="sm"
							class={data.filters.owner ? 'border-primary text-primary-strong bg-selected' : ''}
							>{data.owners.find((o) => o.id === data.filters.owner)?.name ||
								'Owner'}</SelectTrigger
						>
						<SelectContent>
							<SelectItem value="" label="All owners">All owners</SelectItem>
							{#each data.owners as o (o.id)}<SelectItem value={o.id} label={o.name}
									>{o.name}</SelectItem
								>{/each}
						</SelectContent>
					</Select>
				{/if}

				<Select
					type="single"
					value={data.filters.stage}
					onValueChange={(v: string) => setFilter('stage', v)}
				>
					<SelectTrigger
						size="sm"
						class={data.filters.stage ? 'border-primary text-primary-strong bg-selected' : ''}
						>{data.filters.stage ? stageLabel(data.filters.stage as Stage) : 'Stage'}</SelectTrigger
					>
					<SelectContent>
						<SelectItem value="" label="All stages">All stages</SelectItem>
						{#each data.stages as s (s)}<SelectItem value={s} label={stageLabel(s)}
								>{stageLabel(s)}</SelectItem
							>{/each}
					</SelectContent>
				</Select>
			</div>

			<Card class="gap-0 overflow-hidden rounded-control py-0">
				<Table>
					<TableHeader>
						<TableRow class="bg-[#faf9fb] hover:bg-[#faf9fb]">
							{#each headers as header (header.id)}
								{@const sorted = header.column.getIsSorted()}
								<TableHead aria-sort={ariaSort(sorted)}>
									<button
										type="button"
										class="inline-flex items-center gap-1 hover:text-ink"
										onclick={header.column.getToggleSortingHandler()}
									>
										{header.column.columnDef.header}
										<span class="font-mono text-[10px] text-ink-300">
											{sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}
										</span>
									</button>
								</TableHead>
							{/each}
							<TableHead class="normal-case">Stage</TableHead>
							<TableHead class="normal-case">Owner</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#if navLoading}
							{#each Array(6) as _, i (i)}
								<TableRow>
									{#each Array(4) as _, c (c)}
										<TableCell><span class="text-ink-200">—</span></TableCell>
									{/each}
								</TableRow>
							{/each}
						{:else if data.leads.length === 0}
							<TableRow>
								<TableCell colspan={4} class="py-10 text-center text-[13px] text-ink-300">
									No events match.
								</TableCell>
							</TableRow>
						{:else}
							{#each data.leads as lead (lead.id)}
								<TableRow>
									<TableCell>
										<a
											href={`/leads/${lead.id}`}
											class="text-[13px] font-semibold text-ink-700 hover:text-primary hover:underline"
										>
											{lead.eventName ?? lead.name}
										</a>
									</TableCell>
									<TableCell class="text-[13px] text-ink-600"
										>{formatDate(lead.eventDate)}</TableCell
									>
									<TableCell><StageChip stage={lead.stage} /></TableCell>
									<TableCell class="text-[13px] text-ink-600"
										>{lead.ownerName ?? 'Unassigned'}</TableCell
									>
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

		<!-- RIGHT RAIL -->
		<div>
			<NotesPanel
				notes={data.notes}
				currentUserId={data.currentUserId}
				onSubmit={noteHandlers.addNote}
				onEdit={noteHandlers.editNote}
			/>
		</div>
	</div>
</div>
