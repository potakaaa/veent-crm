<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PipelineBoard from '$lib/components/pipeline/PipelineBoard.svelte';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { stageLabel } from '$lib/utils/stages';
	import type { Lead, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	let wonLead = $state<Lead | null>(null);
	let lostLead = $state<Lead | null>(null);

	async function onMove(leadId: string, stage: Stage) {
		const lead = data.leads.find((l: Lead) => l.id === leadId);
		if (!lead || lead.stage === stage) return;
		if (stage === 'won') return void (wonLead = lead);
		if (stage === 'lost') return void (lostLead = lead);

		try {
			const res = await fetch(`/api/leads/${leadId}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Failed to move stage: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Failed to move stage — server error');
			return;
		}
		await invalidateAll();
		toasts.push(`Moved ${lead.name} to ${stageLabel(stage)}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		if (!wonLead) return;
		const id = wonLead.id;
		const name = wonLead.name;
		wonLead = null;
		try {
			const res = await fetch(`/api/leads/${id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'won', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Won capture failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Won capture failed — server error');
			return;
		}
		await invalidateAll();
		toasts.success(`${name} — deal won 🎉`);
	}

	async function confirmLost(reason: LostReason) {
		if (!lostLead) return;
		const id = lostLead.id;
		lostLead = null;
		try {
			const res = await fetch(`/api/leads/${id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'lost', lostReason: reason })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Mark lost failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Mark lost failed — server error');
			return;
		}
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
				scope: all active leads
			</span>
		{/snippet}
	</PageHeader>
	<p class="-mt-2 mb-4 text-[13.5px] text-ink-500">
		Drag a card to move stages. Dropping into <span class="font-semibold text-fresh">Won</span> opens
		win capture.
	</p>

	<PipelineBoard leads={data.leads} users={data.users} {onMove} />
</div>

{#if wonLead}
	<WonCaptureModal
		open={true}
		leadName={wonLead.name}
		onclose={() => (wonLead = null)}
		onconfirm={confirmWon}
	/>
{/if}
{#if lostLead}
	<LostReasonModal
		open={true}
		leadName={lostLead.name}
		onclose={() => (lostLead = null)}
		onconfirm={confirmLost}
	/>
{/if}
