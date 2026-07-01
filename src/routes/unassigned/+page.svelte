<script lang="ts">
	import { goto, afterNavigate, invalidateAll } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { makeSortTable } from '$lib/utils/tableSort';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import LeadEditModal from '$lib/components/leads/LeadEditModal.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { removeFromList } from '$lib/utils/optimistic';
	import { canReassign } from '$lib/utils/permissions';
	import { sourceLabel } from '$lib/utils/sources';
	import { Button } from '$lib/components/ui/button';
	import type { Lead } from '$lib/types';

	let { data } = $props();

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
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Could not save: ${msg}`);
				return; // keep modal open
			}
			editTarget = null;
			await invalidateAll();
			toasts.success('Lead updated');
		} catch {
			toasts.push('Could not save — please try again');
		} finally {
			editSaving = false;
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

	const table = $derived(
		makeSortTable({
			data: shadowLeads,
			columns: [
				{ id: '_select', header: '', enableSorting: false },
				{ id: 'name', header: 'Organizer / page' },
				{ id: 'event', header: 'Event' },
				{ id: 'stage', header: 'Stage' },
				{ id: 'source', header: 'Source' },
				{ id: '_lastOwner', header: 'Last owner', enableSorting: false },
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

	async function claim(lead: Lead) {
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
		// Capture IDs BEFORE mutating shadowLeads — selectedIds is $derived and re-computes
		// to [] immediately after the filter below, so using it later in Promise.all sends nothing.
		const ids = selectedIds;
		const count = ids.length;
		const snapshot = shadowLeads;
		shadowLeads = shadowLeads.filter((l) => !selected[l.id]); // optimistic remove
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
		const name = data.users.find((u) => u.id === ownerId)?.name ?? 'rep';
		toasts.success(`Assigned ${count} to ${name}`);
		selected = {};
		await invalidateAll(); // $effect reconciles shadow with server truth
	}

	const grid = 'grid grid-cols-[36px_2.2fr_1.8fr_1fr_90px_1.1fr_110px] gap-3';
</script>

<svelte:head><title>Up for grabs · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Up for grabs"
		subtitle={`${data.pagination.total} leads with no active owner — former-rep leads and never-assigned pages. Claim one to start working it.`}
	>
		{#snippet actions()}
			{#if selectedIds.length}
				<span class="font-mono text-[12px] text-primary">{selectedIds.length} selected</span>
				<button
					onclick={bulkClaim}
					disabled={bulkPending}
					class="h-[34px] rounded-control bg-primary px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
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

	<div class="overflow-hidden rounded-control border border-hairline bg-panel">
		<div
			class="{grid} items-center border-b border-hairline bg-[#fdf7f5] px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
		>
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
								? 'text-left font-semibold text-ink-600 underline underline-offset-2 cursor-pointer'
								: 'text-left text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2 cursor-pointer'}
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
		</div>
		{#if navLoading}
			{#each Array(8) as _, i (i)}
				<div class="{grid} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0">
					{#each Array(7) as _, c (c)}
						<Skeleton class="h-3.5 w-full" />
					{/each}
				</div>
			{/each}
		{:else}
			{#each shadowLeads as l (l.id)}
				<div
					class="{grid} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fdf7f5]"
				>
					<button
						onclick={() => toggle(l.id)}
						aria-label="Select {l.name}"
						class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] {selected[
							l.id
						]
							? 'border-primary bg-primary'
							: 'border-hairline-strong bg-panel'}"
					>
						{#if selected[l.id]}<Icon name="check" size={12} stroke={3} />{/if}
					</button>
					<a href="/leads/{l.id}" class="min-w-0">
						<div class="flex items-center gap-1.5 text-[13px] font-semibold">
							{l.name}
							{#if l.siblings}<span
									class="rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale"
									>{l.siblings} events</span
								>{/if}
						</div>
						<div class="font-mono text-[11px] text-ink-400">{l.handle} · {l.category}</div>
					</a>
					<div class="min-w-0">
						<div class="flex items-center gap-1.5">
							<span class="truncate text-[12.5px] text-ink-600">{l.eventName ?? '—'}</span>
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
					<div><StageChip stage={l.stage} /></div>
					<div>
						<span
							class="rounded-[5px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium {sourceLabel(
								l.source
							).class}">{sourceLabel(l.source).label}</span
						>
					</div>
					<div class="font-mono text-[12px] text-ink-400">{formerOwner(l.formerOwnerId)}</div>
					<div class="flex items-center gap-1.5">
						<button
							onclick={() => (editTarget = l)}
							disabled={claiming[l.id] || editSaving}
							aria-label="Edit {l.name}"
							title="Edit lead"
							class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-hairline text-ink-500 hover:border-primary hover:text-primary disabled:opacity-50"
						>
							<Icon name="edit" size={14} stroke={2} />
						</button>
						<button
							onclick={() => claim(l)}
							disabled={claiming[l.id]}
							class="h-[30px] flex-1 rounded-[7px] bg-primary text-[12.5px] font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
						>
							{claiming[l.id] ? 'Claiming…' : 'Claim'}
						</button>
					</div>
				</div>
			{:else}
				<div class="p-12 text-center text-[13px] text-ink-200">
					No leads up for grabs — queue clear.
				</div>
			{/each}
		{/if}
	</div>

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
		onclose={() => (assignOpen = false)}
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
