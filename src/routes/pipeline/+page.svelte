<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PipelineBoard from '$lib/components/pipeline/PipelineBoard.svelte';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import { crm } from '$lib/services';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { Lead, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	let wonLead = $state<Lead | null>(null);
	let lostLead = $state<Lead | null>(null);

	async function onMove(leadId: string, stage: Stage) {
		const lead = data.leads.find((l: Lead) => l.id === leadId);
		if (!lead || lead.stage === stage) return;
		if (stage === 'won') return void (wonLead = lead);
		if (stage === 'lost') return void (lostLead = lead);
		await crm.moveLeadStage(leadId, stage);
		await invalidateAll();
		toasts.push(`Moved ${lead.name} to ${stage}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		if (!wonLead) return;
		await crm.moveLeadStage(wonLead.id, 'won', payload);
		wonLead = null;
		await invalidateAll();
		toasts.success('Deal won — captured 🎉');
	}

	async function confirmLost(reason: LostReason) {
		if (!lostLead) return;
		await crm.moveLeadStage(lostLead.id, 'lost', { lostReason: reason });
		lostLead = null;
		await invalidateAll();
		toasts.push('Marked lost — still searchable');
	}
</script>

<svelte:head><title>Pipeline · Veent CRM</title></svelte:head>

<div class="flex h-full flex-col px-7 pb-7 pt-6">
	<PageHeader title="Pipeline">
		{#snippet actions()}
			<span
				class="rounded-control border border-primary/25 bg-[rgba(192,54,44,0.1)] px-2.5 py-[5px] font-mono text-[11.5px] text-primary"
			>
				scope: my active leads
			</span>
		{/snippet}
	</PageHeader>
	<p class="-mt-2 mb-4 text-[13.5px] text-ink-500">
		Drag a card to move stages. Dropping into <span class="font-semibold text-fresh">won</span> opens
		win capture.
	</p>

	<PipelineBoard leads={data.leads} users={data.users} {onMove} />
</div>

<WonCaptureModal
	open={!!wonLead}
	leadName={wonLead?.name ?? ''}
	onclose={() => (wonLead = null)}
	onconfirm={confirmWon}
/>
<LostReasonModal
	open={!!lostLead}
	leadName={lostLead?.name ?? ''}
	onclose={() => (lostLead = null)}
	onconfirm={confirmLost}
/>
