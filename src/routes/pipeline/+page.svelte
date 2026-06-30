<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PipelineBoard from '$lib/components/pipeline/PipelineBoard.svelte';
	import { CardSkeleton } from '$lib/components/shared/skeletons';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { stageLabel } from '$lib/utils/stages';
	import { patchInList } from '$lib/utils/optimistic';
	import type { Lead, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	// Optimistic shadow of the board. E1: a writable `$derived` IS the reconcile mechanism —
	// reassign for an optimistic move; it auto-resyncs to server truth when `data.leads`
	// changes after invalidateAll().
	let shadowLeads = $derived(data.leads);

	// Per-lead move pending state (also the duplicate-submit guard).
	let moving = $state<Record<string, boolean>>({});

	const navLoading = $derived(navigating.to?.url.pathname === '/pipeline');

	let wonLead = $state<Lead | null>(null);
	let lostLead = $state<Lead | null>(null);
	let savingWon = $state(false);
	let savingLost = $state(false);

	async function onMove(leadId: string, stage: Stage) {
		const lead = shadowLeads.find((l: Lead) => l.id === leadId);
		if (!lead || lead.stage === stage) return;
		if (stage === 'won') return void (wonLead = lead);
		if (stage === 'lost') return void (lostLead = lead);
		if (moving[leadId]) return; // duplicate-submit guard
		moving = { ...moving, [leadId]: true };

		const prevStage = lead.stage; // capture for targeted rollback
		shadowLeads = patchInList(shadowLeads, leadId, { stage }); // optimistic move
		try {
			const res = await fetch(`/api/leads/${leadId}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				// Targeted rollback: restore only this lead's stage so concurrent moves aren't undone.
				shadowLeads = patchInList(shadowLeads, leadId, { stage: prevStage });
				toasts.push(`Failed to move stage: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, leadId, { stage: prevStage });
			toasts.push('Failed to move stage — server error');
			return;
		} finally {
			moving = { ...moving, [leadId]: false };
		}
		await invalidateAll(); // $effect reconciles shadow with server truth
		toasts.push(`Moved ${lead.name} to ${stageLabel(stage)}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		if (!wonLead || savingWon) return;
		const lead = wonLead;
		// Don't clear wonLead yet — modal stays open (showing "Saving…") so user input is
		// preserved if the request fails and the user needs to retry.
		savingWon = true;
		const prevStage = lead.stage;
		shadowLeads = patchInList(shadowLeads, lead.id, { stage: 'won' }); // optimistic
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'won', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage }); // targeted rollback
				toasts.push(`Won capture failed: ${msg}`);
				return; // wonLead stays set → modal stays open
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
			toasts.push('Won capture failed — server error');
			return;
		} finally {
			savingWon = false;
		}
		wonLead = null; // close modal only on success
		await invalidateAll();
		toasts.success(`${lead.name} — deal won 🎉`);
	}

	async function confirmLost(reason: LostReason) {
		if (!lostLead || savingLost) return;
		const lead = lostLead;
		// Same pattern: keep modal open until success so user's reason isn't lost on failure.
		savingLost = true;
		const prevStage = lead.stage;
		shadowLeads = patchInList(shadowLeads, lead.id, { stage: 'lost' }); // optimistic
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'lost', lostReason: reason })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage }); // targeted rollback
				toasts.push(`Mark lost failed: ${msg}`);
				return; // lostLead stays set → modal stays open
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
			toasts.push('Mark lost failed — server error');
			return;
		} finally {
			savingLost = false;
		}
		lostLead = null; // close modal only on success
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

	{#if navLoading}
		<div class="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each Array(5) as _, i (i)}
				<CardSkeleton />
			{/each}
		</div>
	{:else}
		<PipelineBoard leads={shadowLeads} users={data.users} {onMove} />
	{/if}
</div>

{#if wonLead}
	<WonCaptureModal
		open={true}
		leadName={wonLead.name}
		saving={savingWon}
		onclose={() => (wonLead = null)}
		onconfirm={confirmWon}
	/>
{/if}
{#if lostLead}
	<LostReasonModal
		open={true}
		leadName={lostLead.name}
		saving={savingLost}
		onclose={() => (lostLead = null)}
		onconfirm={confirmLost}
	/>
{/if}
