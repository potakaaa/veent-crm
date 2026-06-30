<script lang="ts">
	import { goto, afterNavigate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canReassign } from '$lib/utils/permissions';
	import { Button } from '$lib/components/ui/button';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	let paging = $state(false);
	afterNavigate(() => {
		paging = false;
	});

	function navigate(patch: Record<string, string | number | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) params.delete(k);
			else params.set(k, String(v));
		}
		goto(`?${params}`, { keepFocus: true });
	}

	let selected = $state<Record<string, boolean>>({});
	let assignOpen = $state(false);
	const selectedIds = $derived(
		data.leads.filter((lead) => selected[lead.id]).map((lead) => lead.id)
	);

	const formerOwner = (id: string | null | undefined) =>
		id ? `was ${data.users.find((u) => u.id === id)?.name ?? id}` : 'never assigned';

	function toggle(id: string) {
		selected = { ...selected, [id]: !selected[id] };
	}

	async function claim(lead: Lead) {
		const res = await fetch(`/api/leads/${lead.id}/claim`, { method: 'POST' });
		if (!res.ok) {
			toasts.push(`Failed to claim ${lead.name}`);
			return;
		}
		await invalidateAll();
		toasts.success(`Claimed ${lead.name}`);
	}

	async function bulkClaim() {
		const res = await fetch('/api/leads/bulk-claim', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: selectedIds })
		});
		if (!res.ok) {
			toasts.push('Bulk claim failed');
			return;
		}
		const { claimed } = await res.json();
		toasts.success(`Claimed ${claimed} lead${claimed === 1 ? '' : 's'}`);
		selected = {};
		await invalidateAll();
	}

	async function assignTo(ownerId: string) {
		await Promise.all(
			selectedIds.map((id) =>
				fetch(`/api/leads/${id}/owner`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ownerId })
				})
			)
		);
		assignOpen = false;
		const name = data.users.find((u) => u.id === ownerId)?.name ?? 'rep';
		toasts.success(`Assigned ${selectedIds.length} to ${name}`);
		selected = {};
		await invalidateAll();
	}

	const grid = 'grid grid-cols-[36px_2.2fr_1.8fr_1fr_90px_1.1fr_110px] gap-3';

	const sourceLabel: Record<string, { label: string; class: string }> = {
		scraper: { label: 'Scraped', class: 'bg-teal-50 text-teal-700' },
		manual: { label: 'Manual', class: 'bg-ink-50 text-ink-500' },
		sheet_import: { label: 'Import', class: 'bg-amber-50 text-amber-700' },
		other: { label: 'Other', class: 'bg-ink-50 text-ink-400' }
	};
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
					class="h-[34px] rounded-control bg-primary px-3.5 text-[12.5px] font-semibold text-white"
				>
					Claim {selectedIds.length}
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
			<span></span><span>Organizer / page</span><span>Event</span><span>Stage</span><span
				>Source</span
			><span>Last owner</span><span></span>
		</div>
		{#each data.leads as l (l.id)}
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
						class="rounded-[5px] px-[6px] py-[2px] font-mono text-[10.5px] font-medium {(
							sourceLabel[l.source] ?? sourceLabel.other
						).class}">{(sourceLabel[l.source] ?? sourceLabel.other).label}</span
					>
				</div>
				<div class="font-mono text-[12px] text-ink-400">{formerOwner(l.formerOwnerId)}</div>
				<div>
					<button
						onclick={() => claim(l)}
						class="h-[30px] w-full rounded-[7px] bg-primary text-[12.5px] font-semibold text-white hover:bg-primary-strong"
					>
						Claim
					</button>
				</div>
			</div>
		{:else}
			<div class="p-12 text-center text-[13px] text-ink-200">
				No leads up for grabs — queue clear.
			</div>
		{/each}
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
