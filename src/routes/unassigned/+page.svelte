<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { crm } from '$lib/services';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canReassign } from '$lib/utils/permissions';
	import type { Lead } from '$lib/types';

	let { data } = $props();

	let selected = $state<Record<string, boolean>>({});
	let assignOpen = $state(false);
	const selectedIds = $derived(Object.keys(selected).filter((id) => selected[id]));

	const formerOwner = (id: string | null | undefined) =>
		id ? `was ${data.users.find((u) => u.id === id)?.name ?? id}` : 'never assigned';

	function toggle(id: string) {
		selected = { ...selected, [id]: !selected[id] };
	}

	async function claim(lead: Lead) {
		await crm.claimLead(lead.id);
		await invalidateAll();
		toasts.success(`Claimed ${lead.name}`);
	}

	async function bulkClaim() {
		await crm.bulkClaim(selectedIds);
		toasts.success(`Claimed ${selectedIds.length} leads`);
		selected = {};
		await invalidateAll();
	}

	async function assignTo(ownerId: string) {
		await crm.reassignLeads(selectedIds, ownerId);
		assignOpen = false;
		const name = data.users.find((u) => u.id === ownerId)?.name ?? 'rep';
		toasts.success(`Assigned ${selectedIds.length} to ${name}`);
		selected = {};
		await invalidateAll();
	}

	const grid = 'grid grid-cols-[36px_2.2fr_1.6fr_1fr_1.1fr_110px] gap-3';
</script>

<svelte:head><title>Up for grabs · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Up for grabs"
		subtitle={`${data.leads.length} leads with no active owner — former-rep leads and never-assigned pages. Claim one to start working it.`}
	>
		{#snippet actions()}
			{#if selectedIds.length}
				<span class="font-mono text-[12px] text-primary">{selectedIds.length} selected</span>
				<button onclick={bulkClaim} class="h-[34px] rounded-control bg-primary px-3.5 text-[12.5px] font-semibold text-white">
					Claim {selectedIds.length}
				</button>
				{#if canReassign(data.currentUser)}
					<button onclick={() => (assignOpen = true)} class="h-[34px] rounded-control border border-hairline bg-panel px-3.5 text-[12.5px] font-medium text-ink-600">
						Assign to rep ▾
					</button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	<div class="overflow-hidden rounded-control border border-hairline bg-panel">
		<div class="{grid} items-center border-b border-hairline bg-[#fdf7f5] px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300">
			<span></span><span>Organizer / page</span><span>Event</span><span>Stage</span><span>Last owner</span><span></span>
		</div>
		{#each data.leads as l (l.id)}
			<div class="{grid} min-h-11 items-center border-b border-panel-sunken px-4 last:border-b-0 hover:bg-[#fdf7f5]">
				<button
					onclick={() => toggle(l.id)}
					aria-label="Select {l.name}"
					class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] {selected[l.id]
						? 'border-primary bg-primary'
						: 'border-hairline-strong bg-panel'}"
				>
					{#if selected[l.id]}<Icon name="check" size={12} stroke={3} />{/if}
				</button>
				<a href="/leads/{l.id}" class="min-w-0">
					<div class="flex items-center gap-1.5 text-[13px] font-semibold">
						{l.name}
						{#if l.siblings}<span class="rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale">{l.siblings} events</span>{/if}
					</div>
					<div class="font-mono text-[11px] text-ink-400">{l.handle} · {l.category}</div>
				</a>
				<div class="truncate text-[12.5px] text-ink-600">{l.eventName ?? '—'}</div>
				<div><StageChip stage={l.stage} /></div>
				<div class="font-mono text-[12px] text-ink-400">{formerOwner(l.formerOwnerId)}</div>
				<div>
					<button onclick={() => claim(l)} class="h-[30px] w-full rounded-[7px] bg-primary text-[12.5px] font-semibold text-white hover:bg-primary-strong">
						Claim
					</button>
				</div>
			</div>
		{:else}
			<div class="p-12 text-center text-[13px] text-ink-200">No leads up for grabs — queue clear.</div>
		{/each}
	</div>

	<div class="mt-3.5 flex items-center gap-2 text-[12px] text-ink-200">
		<Icon name="info" size={14} stroke={2} />
		Former reps stay on history for attribution — their workable leads land here.
	</div>
</div>

<ReassignModal open={assignOpen} users={data.users} onclose={() => (assignOpen = false)} onconfirm={assignTo} />
