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

	// Loader + lazy-load endpoint both attach derived `appealScore` to each card.
	type LeadWithAppeal = Lead & { appealScore: number | null };

	let { data } = $props();

	// Base leads from server (10 per stage). Reconciled after invalidateAll().
	let shadowLeads = $derived(data.leads);
	// Extra leads loaded lazily beyond the initial 10. Cleared on server reload.
	let extraLeads = $state<LeadWithAppeal[]>([]);
	// Current page per stage (1 = initial server load already covers this).
	let pagesPerStage = $state<Partial<Record<Stage, number>>>({});
	// Loading flag per stage.
	let loadingPerStage = $state<Partial<Record<Stage, boolean>>>({});
	// Lazy-load total overrides — populated from each /api/leads/pipeline-stage response.
	let stageTotalOverrides = $state<Partial<Record<Stage, number>>>({});
	// Live totals: server snapshot merged with any lazy-load updates.
	const totalsPerStage = $derived({ ...data.totalsPerStage, ...stageTotalOverrides });

	// Combined flat list for the board.
	const allLeads = $derived([...shadowLeads, ...extraLeads]);

	// Clear lazy-loaded extras whenever server data refreshes.
	$effect(() => {
		void data.leads; // track
		extraLeads = [];
		pagesPerStage = {};
		stageTotalOverrides = {};
	});

	const navLoading = $derived(navigating.to?.url.pathname === '/pipeline');

	let wonLead = $state<Lead | null>(null);
	let lostLead = $state<Lead | null>(null);
	let savingWon = $state(false);
	let savingLost = $state(false);
	let moving = $state<Record<string, boolean>>({});

	async function loadMoreForStage(stage: Stage) {
		if (loadingPerStage[stage]) return;
		const total = totalsPerStage[stage] ?? 0;
		const currentCount = allLeads.filter((l) => l.stage === stage).length;
		if (currentCount >= total) return;

		const nextPage = (pagesPerStage[stage] ?? 1) + 1;
		loadingPerStage = { ...loadingPerStage, [stage]: true };
		try {
			const res = await fetch(`/api/leads/pipeline-stage?stage=${stage}&page=${nextPage}&limit=10`);
			if (!res.ok) return;
			const { leads: newLeads, total: newTotal } = (await res.json()) as {
				leads: LeadWithAppeal[];
				total: number;
			};
			// Deduplicate: don't add leads already in allLeads.
			const existingIds = new Set(allLeads.map((l) => l.id));
			const fresh = newLeads.filter((l) => !existingIds.has(l.id));
			extraLeads = [...extraLeads, ...fresh];
			pagesPerStage = { ...pagesPerStage, [stage]: nextPage };
			stageTotalOverrides = { ...stageTotalOverrides, [stage]: newTotal };
		} catch {
			// silently ignore — user can scroll again
		} finally {
			loadingPerStage = { ...loadingPerStage, [stage]: false };
		}
	}

	async function onMove(leadId: string, stage: Stage) {
		const lead = allLeads.find((l: Lead) => l.id === leadId);
		if (!lead || lead.stage === stage) return;
		if (stage === 'won') return void (wonLead = lead);
		if (stage === 'lost') return void (lostLead = lead);
		if (moving[leadId]) return;
		moving = { ...moving, [leadId]: true };

		const prevStage = lead.stage;
		// Optimistic move in both lists.
		shadowLeads = patchInList(shadowLeads, leadId, { stage });
		extraLeads = patchInList(extraLeads, leadId, { stage });
		try {
			const res = await fetch(`/api/leads/${leadId}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, leadId, { stage: prevStage });
				extraLeads = patchInList(extraLeads, leadId, { stage: prevStage });
				toasts.push(`Failed to move stage: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, leadId, { stage: prevStage });
			extraLeads = patchInList(extraLeads, leadId, { stage: prevStage });
			toasts.push('Failed to move stage — server error');
			return;
		} finally {
			moving = { ...moving, [leadId]: false };
		}
		await invalidateAll();
		toasts.push(`Moved ${lead.name} to ${stageLabel(stage)}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		if (!wonLead || savingWon) return;
		const lead = wonLead;
		savingWon = true;
		const prevStage = lead.stage;
		shadowLeads = patchInList(shadowLeads, lead.id, { stage: 'won' });
		extraLeads = patchInList(extraLeads, lead.id, { stage: 'won' });
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'won', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
				extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
				toasts.push(`Won capture failed: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
			extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
			toasts.push('Won capture failed — server error');
			return;
		} finally {
			savingWon = false;
		}
		wonLead = null;
		await invalidateAll();
		toasts.success(`${lead.name} — deal won 🎉`);
	}

	async function confirmLost(reason: LostReason) {
		if (!lostLead || savingLost) return;
		const lead = lostLead;
		savingLost = true;
		const prevStage = lead.stage;
		shadowLeads = patchInList(shadowLeads, lead.id, { stage: 'lost' });
		extraLeads = patchInList(extraLeads, lead.id, { stage: 'lost' });
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'lost', lostReason: reason })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
				extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
				toasts.push(`Mark lost failed: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
			extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
			toasts.push('Mark lost failed — server error');
			return;
		} finally {
			savingLost = false;
		}
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
		<PipelineBoard
			leads={allLeads}
			{totalsPerStage}
			{loadingPerStage}
			users={data.users}
			{onMove}
			onLoadMore={loadMoreForStage}
		/>
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
