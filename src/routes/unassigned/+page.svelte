<script lang="ts">
	import { goto, afterNavigate, invalidateAll } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { makeSortTable } from '$lib/utils/tableSort';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import LeadEditModal from '$lib/components/leads/LeadEditModal.svelte';
	import MultiSelectFilter from '$lib/components/leads/MultiSelectFilter.svelte';
	import DataGridShell from '$lib/components/leads/DataGridShell.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import { canReassign } from '$lib/utils/permissions';
	import { sourceLabel } from '$lib/utils/sources';
	import { ownerNameFor } from '$lib/utils/owner';
	import { createHoverPopover } from '$lib/utils/hover-popover.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import OrganizerHoverCard from '$lib/components/OrganizerHoverCard.svelte';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	// Loader-enriched lead: base Lead + derived `appealScore` attached in +page.server.ts.
	type UnassignedLead = (typeof data.leads)[number];

	// Optimistic shadow of the unassigned queue. E1: a writable `$derived` IS the reconcile
	// mechanism — reassign for an optimistic remove; it auto-resyncs to server truth when
	// `data.leads` changes after invalidateAll().
	let shadowLeads = $derived(data.leads);

	// Pending guards.
	let claiming = $state<Record<string, boolean>>({});
	let bulkPending = $state(false);
	let assignPending = $state(false);

	let paging = $state(false);
	afterNavigate(() => {
		paging = false;
	});

	let editTarget = $state<Lead | null>(null);
	let assignTarget = $state<Lead | null>(null);
	let editSaving = $state(false);

	async function saveEdit(leadData: Record<string, unknown>) {
		if (!editTarget || editSaving) return;
		editSaving = true;
		try {
			const res = await fetch(`/api/leads/${editTarget.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(leadData)
			});
			if (!res.ok) {
				const msg = await res
					.json()
					.then((body) => body?.message ?? 'Server error')
					.catch(() => 'Server error');
				toasts.push(`Could not save: ${msg}`);
				return; // keep modal open
			}
		} catch {
			toasts.push('Could not save — please try again');
			return;
		} finally {
			editSaving = false;
		}
		editTarget = null;
		try {
			await invalidateAll();
			toasts.success('Lead updated');
		} catch {
			toasts.push('Saved, but the list could not refresh — reload to see the change');
		}
	}

	const navLoading = $derived(paging || navigating.to?.url.pathname === '/unassigned');

	function navigate(patch: Record<string, string | number | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) params.delete(k);
			else params.set(k, String(v));
		}
		goto(`?${params}`, { keepFocus: true });
	}

	// Filters: comma-join the selection into the URL param (or drop it when empty), and always
	// reset to page 1 so the filtered result starts at the beginning.
	function setFilter(key: 'country' | 'category', values: string[]) {
		navigate({ [key]: values.join(',') || undefined, page: undefined });
	}
	function clearAllFilters() {
		navigate({ country: undefined, category: undefined, page: undefined });
	}
	const hasActiveFilters = $derived(
		data.filters.country.length > 0 || data.filters.category.length > 0
	);

	const WEEKS_PRESETS = [4, 8, 12] as const;
	let weeksInput = $derived(
		data.filters.weeksAhead === null ? '' : String(data.filters.weeksAhead ?? 8)
	);
	let weeksTimer: ReturnType<typeof setTimeout> | null = null;
	function setWeeks(w: number | 'all') {
		navigate({ weeksAhead: w === 'all' ? 'all' : w, page: undefined });
	}
	function onWeeksInput(e: Event & { currentTarget: HTMLInputElement }) {
		const raw = e.currentTarget.value;
		weeksInput = raw;
		if (weeksTimer) clearTimeout(weeksTimer);
		const n = parseInt(raw, 10);
		if (!raw) return;
		weeksTimer = setTimeout(() => {
			if (n > 0) setWeeks(n);
		}, 400);
	}

	const table = $derived(
		makeSortTable({
			data: shadowLeads,
			columns: [
				{ id: '_select', header: '', enableSorting: false },
				{ id: 'name', header: 'Organizer / page' },
				{ id: 'event', header: 'Event' },
				{ id: 'stage', header: 'Stage' },
				{ id: 'source', header: 'Source' },
				{ id: 'country', header: 'Country', enableSorting: false },
				{ id: 'category', header: 'Category', enableSorting: false },
				{ id: '_lastOwner', header: 'Last owner', enableSorting: false },
				{ id: 'appeal', header: 'Appeal', sortDescFirst: true },
				{ id: '_actions', header: '', enableSorting: false }
			],
			sort: data.sort ?? '',
			dir: data.dir,
			onToggle(id, desc) {
				navigate({ sort: id, dir: desc ? 'desc' : 'asc', page: undefined });
			}
		})
	);

	let selected = $state<Record<string, boolean>>({});
	let assignOpen = $state(false);
	const selectedIds = $derived(
		shadowLeads.filter((lead) => selected[lead.id]).map((lead) => lead.id)
	);

	const formerOwner = (id: string | null | undefined) =>
		id ? `was ${data.users.find((u) => u.id === id)?.name ?? 'former rep'}` : 'never assigned';

	function toggle(id: string) {
		selected = { ...selected, [id]: !selected[id] };
	}

	async function claim(lead: UnassignedLead) {
		if (claiming[lead.id]) return; // duplicate-submit guard
		claiming = { ...claiming, [lead.id]: true };
		shadowLeads = removeFromList(shadowLeads, lead.id); // optimistic remove
		try {
			const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'POST' });
			if (!res.ok) {
				// Targeted rollback: restore only this lead so concurrent claims aren't undone.
				if (!shadowLeads.some((l) => l.id === lead.id)) shadowLeads = [...shadowLeads, lead];
				toasts.push(`Failed to claim ${lead.name}`);
				return;
			}
		} catch {
			if (!shadowLeads.some((l) => l.id === lead.id)) shadowLeads = [...shadowLeads, lead];
			toasts.push(`Failed to claim ${lead.name} — server error`);
			return;
		} finally {
			claiming = { ...claiming, [lead.id]: false };
		}
		await invalidateAll(); // $effect reconciles shadow with server truth
		toasts.push(`Claimed ${lead.name}`, {
			tone: 'success',
			timeout: 6000,
			action: {
				label: 'Undo',
				run: async () => {
					try {
						const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'DELETE' });
						if (res.ok) {
							shadowLeads = [...shadowLeads, lead];
							await invalidateAll();
							toasts.success(`Unclaimed ${lead.name}`);
						} else {
							toasts.push(`Could not undo — ${lead.name} may have changed`);
						}
					} catch {
						toasts.push(`Could not undo — ${lead.name} may have changed`);
					}
				}
			}
		});
	}

	async function bulkClaim() {
		if (bulkPending) return; // duplicate-submit guard
		if (selectedIds.length > 200) {
			toasts.push('Cannot bulk claim more than 200 leads at once');
			return;
		}
		bulkPending = true;
		const ids = selectedIds;
		const snapshot = shadowLeads;
		shadowLeads = shadowLeads.filter((l) => !selected[l.id]); // optimistic remove
		try {
			const res = await fetch('/api/leads/bulk-claim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!res.ok) {
				shadowLeads = snapshot; // rollback
				toasts.push('Bulk claim failed');
				return;
			}
			const { claimed } = await res.json();
			toasts.success(`Claimed ${claimed} lead${claimed === 1 ? '' : 's'}`);
		} catch {
			shadowLeads = snapshot; // rollback on network error
			toasts.push('Bulk claim failed — server error');
			return;
		} finally {
			bulkPending = false;
		}
		selected = {};
		await invalidateAll(); // $effect reconciles shadow with server truth
	}

	async function assignTo(ownerId: string) {
		if (assignPending) return; // duplicate-submit guard
		assignPending = true;
		// Capture BEFORE mutating shadowLeads/assignTarget — selectedIds is $derived and
		// assignTarget resets on close, so both must be captured up front.
		const target = assignTarget;
		const ids = target ? [target.id] : selectedIds;
		const count = ids.length;
		const snapshot = shadowLeads;
		shadowLeads = shadowLeads.filter((l) => !ids.includes(l.id)); // optimistic remove
		let responses: Response[];
		try {
			responses = await Promise.all(
				ids.map((id) =>
					fetch(`/api/leads/${id}/owner`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ownerId })
					})
				)
			);
		} catch {
			shadowLeads = snapshot; // rollback on network error (bulk op — all-or-nothing)
			toasts.push('Some assignments failed — refresh and try again');
			return;
		} finally {
			assignPending = false;
		}
		if (responses.some((r) => !r.ok)) {
			shadowLeads = snapshot; // rollback (bulk op — all-or-nothing)
			toasts.push('Some assignments failed — refresh and try again');
			return;
		}
		assignOpen = false;
		assignTarget = null;
		const name = data.users.find((u) => u.id === ownerId)?.name ?? 'rep';
		toasts.success(target ? `Assigned ${target.name} to ${name}` : `Assigned ${count} to ${name}`);
		selected = {};
		await invalidateAll(); // $effect reconciles shadow with server truth
	}

	// Desktop column template (10 cells). Below `lg` the DataGridShell collapses this
	// into a stacked single-column card.
	const cols = 'lg:grid-cols-[36px_2fr_1.6fr_1fr_90px_90px_90px_1fr_130px_150px]';

	// Shared hover/focus popover timer hook (200ms grace period) — consolidates the
	// former local openHoverId/hoverCloseTimer state + handlers.
	const hover = createHoverPopover();
</script>

<svelte:head><title>Up for grabs · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Up for grabs"
		subtitle={`${data.pagination.total} leads with no active owner. Claim one to start working it.`}
	>
		{#snippet actions()}
			{#if selectedIds.length}
				<span class="font-mono text-[12px] text-primary">{selectedIds.length} selected</span>
				<button
					onclick={bulkClaim}
					disabled={bulkPending}
					aria-label="Claim {selectedIds.length} selected leads"
					class="focus-ring h-[34px] rounded-control bg-primary px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
				>
					{bulkPending ? 'Claiming…' : `Claim ${selectedIds.length}`}
				</button>
				{#if canReassign(data.currentUser)}
					<button
						onclick={() => (assignOpen = true)}
						class="h-[34px] rounded-control border border-hairline bg-panel px-3.5 text-[12.5px] font-medium text-ink-600"
					>
						Assign to rep ▾
					</button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mb-3.5 flex flex-wrap items-center gap-2">
		<MultiSelectFilter
			label="Country"
			options={data.countryOptions}
			selected={data.filters.country}
			onchange={(values) => setFilter('country', values)}
		/>
		<MultiSelectFilter
			label="Category"
			options={data.categoryOptions}
			selected={data.filters.category}
			onchange={(values) => setFilter('category', values)}
		/>
		{#if hasActiveFilters}
			<button
				onclick={clearAllFilters}
				class="h-[34px] rounded-control px-2.5 text-[12.5px] font-medium text-ink-400 hover:text-primary hover:underline"
			>
				Clear all filters
			</button>
		{/if}
		<div class="ml-auto flex items-center gap-1.5">
			<span class="text-[12px] text-ink-400">Beyond</span>
			{#each WEEKS_PRESETS as w (w)}
				<button
					onclick={() => setWeeks(w)}
					aria-pressed={data.filters.weeksAhead !== null && (data.filters.weeksAhead ?? 8) === w}
					class="h-7 rounded-[5px] border px-2 font-mono text-[11.5px] transition-colors {data
						.filters.weeksAhead !== null && (data.filters.weeksAhead ?? 8) === w
						? 'border-indigo-400 bg-indigo-50 font-semibold text-indigo-700'
						: 'border-hairline bg-panel text-ink-500 hover:bg-panel-sunken'}">{w}w</button
				>
			{/each}
			<input
				type="number"
				min="1"
				value={weeksInput}
				oninput={onWeeksInput}
				placeholder="—"
				aria-label="Minimum weeks until event"
				class="h-7 w-12 rounded-[5px] border border-hairline bg-panel px-2 font-mono text-[11.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
			/>
			<button
				onclick={() => setWeeks('all')}
				aria-pressed={data.filters.weeksAhead === null}
				class="h-7 rounded-[5px] border px-2 font-mono text-[11.5px] transition-colors {data.filters
					.weeksAhead === null
					? 'border-ink-300 bg-panel-sunken font-semibold text-ink'
					: 'border-hairline bg-panel text-ink-400 hover:bg-panel-sunken'}">All</button
			>
		</div>
	</div>

	<DataGridShell
		{cols}
		loading={navLoading}
		skeletonCells={10}
		isEmpty={shadowLeads.length === 0}
		mobileBare
	>
		{#snippet header()}
			{#each table.getHeaderGroups()[0].headers as header (header.id)}
				<div
					role="columnheader"
					aria-sort={header.column.getCanSort()
						? header.column.getIsSorted() === 'asc'
							? 'ascending'
							: header.column.getIsSorted() === 'desc'
								? 'descending'
								: 'none'
						: undefined}
				>
					{#if header.column.getCanSort()}
						<button
							onclick={header.column.getToggleSortingHandler()}
							class={header.column.getIsSorted()
								? 'cursor-pointer text-left font-semibold text-ink-600 underline underline-offset-2'
								: 'cursor-pointer text-left text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2'}
						>
							{header.column.columnDef.header}{header.column.getIsSorted() === 'asc'
								? ' ↑'
								: header.column.getIsSorted() === 'desc'
									? ' ↓'
									: ''}
						</button>
					{:else}
						<span>{header.column.columnDef.header}</span>
					{/if}
				</div>
			{/each}
		{/snippet}

		{#snippet rows(rowClass)}
			{#each shadowLeads as l (l.id)}
				<div
					class="{rowClass} relative mb-3 min-h-11 items-center rounded-[11px] border border-hairline-strong bg-panel px-4 py-3.5 shadow-frame hover:bg-[#fcfbfd] [&:nth-child(2)]:mt-3 lg:mb-0 lg:rounded-none lg:border-l-0 lg:border-r-0 lg:border-t-0 lg:border-b lg:border-panel-sunken lg:bg-transparent lg:py-0 lg:shadow-none lg:last:border-b-0 lg:[&:nth-child(2)]:mt-0"
				>
					<button
						onclick={() => toggle(l.id)}
						aria-label="Select {l.name}"
						class="absolute right-3.5 top-3.5 z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] lg:static lg:right-auto lg:top-auto {selected[
							l.id
						]
							? 'border-primary bg-primary'
							: 'border-hairline-strong bg-panel'}"
					>
						{#if selected[l.id]}<Icon name="check" size={12} stroke={3} />{/if}
					</button>
					<Popover.Root
						open={hover.openId === l.id}
						onOpenChange={(open) => {
							if (!open) hover.closeNow();
						}}
					>
						<Popover.Trigger>
							{#snippet child({ props })}
								<div
									{...props}
									class="min-w-0 pr-7 lg:pr-0"
									onmouseenter={() => hover.open(l.id)}
									onmouseleave={hover.scheduleClose}
									onkeydown={hover.handleEscape}
								>
									<a href="/leads/{l.id}" class="min-w-0 block">
										<div
											class="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold lg:text-[13px]"
										>
											<span class="truncate">{l.name}</span>
											{#if l.siblings}<span
													class="shrink-0 rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale"
													>{l.siblings} events</span
												>{/if}
										</div>
									</a>
								</div>
							{/snippet}
						</Popover.Trigger>
						<Popover.Portal>
							<Popover.Content
								side="right"
								onmouseenter={() => hover.open(l.id)}
								onmouseleave={hover.scheduleClose}
								onkeydown={hover.handleEscape}
							>
								<OrganizerHoverCard lead={l} ownerName={ownerNameFor(data.users, l.ownerId)} />
							</Popover.Content>
						</Popover.Portal>
					</Popover.Root>
					<div class="min-w-0">
						<div class="flex items-center gap-1.5">
							<span class="truncate text-[13px] text-ink-700 lg:text-[12.5px] lg:text-ink-600"
								>{l.eventName ?? '—'}</span
							>
							<EventBadge date={l.eventDate} />
						</div>
						{#if l.eventDate}
							<div class="font-mono text-[11px] text-ink-400">
								{new Date(l.eventDate + 'T00:00:00').toLocaleDateString('en-PH', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
						{/if}
					</div>
					<div
						class="order-2 truncate font-mono text-[12px] text-ink-600 lg:order-4 lg:text-ink-400"
					>
						{l.category}
					</div>
					<div class="order-1 lg:order-6"><AppealScoreBadge score={l.appealScore} /></div>
					<div class="order-3 lg:order-7 flex items-center gap-1.5">
						<button
							onclick={() => (editTarget = l)}
							disabled={claiming[l.id] || editSaving}
							aria-label="Edit {l.name}"
							title="Edit lead"
							class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-hairline text-ink-500 hover:border-primary hover:text-primary disabled:opacity-50"
						>
							<Icon name="edit" size={14} stroke={2} />
						</button>
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
						<button
							onclick={() => claim(l)}
							disabled={claiming[l.id]}
							aria-label="Claim {l.name}"
							class="focus-ring h-[30px] flex-1 rounded-[7px] bg-primary text-[12.5px] font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
						>
							{claiming[l.id] ? 'Claiming…' : 'Claim'}
						</button>
					</div>
					<div
						class="order-4 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-panel-sunken pt-2.5 lg:contents"
					>
						<div class="lg:order-1"><StageChip stage={l.stage} /></div>
						<div class="opacity-70 lg:order-2">
							<span
								class="rounded-[5px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium {sourceLabel(
									l.source
								).class}">{sourceLabel(l.source).label}</span
							>
						</div>
						<div class="truncate font-mono text-[11px] text-ink-300 lg:order-3">{l.country}</div>
						<div class="font-mono text-[11px] text-ink-300 lg:order-5">
							{formerOwner(l.formerOwnerId)}
						</div>
					</div>
				</div>
			{/each}
		{/snippet}

		{#snippet empty()}
			<div class="p-12 text-center text-[13px] text-ink-200">
				{#if hasActiveFilters}
					No leads match your filters.
				{:else}
					No leads up for grabs — queue clear.
				{/if}
			</div>
		{/snippet}
	</DataGridShell>

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

	<div class="mt-3.5 flex items-center gap-2 text-[12px] text-ink-200">
		<Icon name="info" size={14} stroke={2} />
		Former reps stay on history for attribution — their workable leads land here.
	</div>
</div>

{#if assignOpen}
	<ReassignModal
		open={true}
		users={data.users}
		onclose={() => {
			assignOpen = false;
			assignTarget = null;
		}}
		onconfirm={assignTo}
	/>
{/if}

{#if editTarget}
	<LeadEditModal
		open={true}
		lead={editTarget}
		saving={editSaving}
		onclose={() => (editTarget = null)}
		onsave={saveEdit}
	/>
{/if}
