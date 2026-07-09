<script lang="ts">
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PipelineBoard from '$lib/components/pipeline/PipelineBoard.svelte';
	import SearchInput from '$lib/components/ui/search-input/SearchInput.svelte';
	import RepFilterCombobox from '$lib/components/ui/rep-filter-combobox/RepFilterCombobox.svelte';
	import { matchesQuery } from './pipeline-search';
	import { CardSkeleton } from '$lib/components/shared/skeletons';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import DoneCaptureModal from '$lib/components/leads/DoneCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { stageLabel, BOARD_STAGES } from '$lib/utils/stages';
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

	// Client-side search over already-loaded cards. `query` is `$state` (NOT `$derived`)
	// so an invalidateAll()-driven reload (stage moves) never clobbers the typed term (E1).
	let query = $state(data.initialQuery ?? '');
	const filteredLeads = $derived(allLeads.filter((l) => matchesQuery(l, query)));

	// Server-side search hybrid layer (PIPE-3 follow-up). Keeps the instant client pre-filter
	// (filteredLeads) for zero-latency keystroke feedback while fetching the authoritative full
	// match set per stage from the server so leads on un-scrolled lazy pages still appear.
	// This layer NEVER mutates shadowLeads/extraLeads — clearing the box just discards it.
	let searchLeadsPerStage = $state<Partial<Record<Stage, LeadWithAppeal[]>>>({});
	let searchTotalsPerStage = $state<Partial<Record<Stage, number>>>({});
	let searchLoading = $state(false);
	// Monotonic token: only the latest debounced fetch's response is honored (stale-guard).
	let searchSeq = 0;

	const searchActive = $derived(query.trim().length > 0);

	// Board leads: when searching AND server results have arrived, show the flattened server
	// match set; while the fetch is still in flight, fall back to the instant client filter;
	// when not searching, show the normal lazy-loaded list.
	const boardLeads = $derived(
		searchActive
			? Object.keys(searchLeadsPerStage).length > 0
				? Object.values(searchLeadsPerStage).flat()
				: filteredLeads
			: allLeads
	);
	// Search-aware totals: under active search with server results, show per-stage match counts
	// (from each search response's `total`) instead of the base lazy-load stage totals.
	const boardTotals = $derived(
		searchActive && Object.keys(searchTotalsPerStage).length > 0
			? searchTotalsPerStage
			: totalsPerStage
	);

	// Fetch the full server-side match set for every board stage in parallel. `term` is the
	// trimmed non-empty search string. Fans out over BOARD_STAGES (incl. `live`); a stale token
	// (a newer keystroke or a clear) discards the result.
	async function runSearch(term: string) {
		const seq = ++searchSeq;
		searchLoading = true;
		try {
			const repParam = data.filterRepId ? `&rep=${data.filterRepId}` : '';
			const responses = await Promise.all(
				BOARD_STAGES.map(async (stage) => {
					try {
						const res = await fetch(
							`/api/leads/pipeline-stage?stage=${stage}&page=1&limit=50&q=${encodeURIComponent(term)}${repParam}`
						);
						if (!res.ok) return { stage, leads: [] as LeadWithAppeal[], total: 0 };
						const body = (await res.json()) as { leads: LeadWithAppeal[]; total: number };
						return { stage, leads: body.leads, total: body.total };
					} catch {
						return { stage, leads: [] as LeadWithAppeal[], total: 0 };
					}
				})
			);
			// Stale-guard: a newer search/clear bumped the token — discard this response.
			if (seq !== searchSeq) return;
			const nextLeads: Partial<Record<Stage, LeadWithAppeal[]>> = {};
			const nextTotals: Partial<Record<Stage, number>> = {};
			for (const r of responses) {
				nextLeads[r.stage] = r.leads;
				nextTotals[r.stage] = r.total;
			}
			searchLeadsPerStage = nextLeads;
			searchTotalsPerStage = nextTotals;
		} finally {
			if (seq === searchSeq) searchLoading = false;
		}
	}

	// Manager-only AE filter (`?rep=`). navigateRepFilter mirrors calendar's navigate() convention:
	// preserve every other existing param (including `?q=` from PIPE-3), goto with keepFocus.
	// A falsy id (`''` from "All AEs" OR undefined) drops `?rep=` and returns to the team-wide board (E4).
	function navigateRepFilter(repId: string | undefined) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (!repId) params.delete('rep');
		else params.set('rep', repId);
		goto(`?${params}`, { keepFocus: true });
	}

	function handleSearch(v: string) {
		query = v;
		// Sync `?q=` via replaceState — NOT goto() (goto re-invalidates + re-runs load,
		// defeating "no full page reload"). Set when non-empty, delete when empty (E2).
		const url = new URL(page.url);
		if (v.trim()) url.searchParams.set('q', v);
		else url.searchParams.delete('q');
		replaceState(url, {});

		// SearchInput already debounces at 200ms, so handleSearch IS the debounced trigger.
		const term = v.trim();
		if (term) {
			runSearch(term);
		} else {
			// Clear branch: bump the token FIRST (E1) so any in-flight pre-clear fetch's response
			// is discarded by runSearch's stale-guard, THEN discard both layers. The base
			// allLeads was never mutated, so boardLeads reverts to the normal lazy-loaded state.
			++searchSeq;
			searchLeadsPerStage = {};
			searchTotalsPerStage = {};
			searchLoading = false;
		}
	}

	// Clear lazy-loaded extras whenever server data refreshes. A server reload also invalidates
	// any prior client-side search result set, so discard both search layers here too.
	$effect(() => {
		void data.leads; // track
		extraLeads = [];
		pagesPerStage = {};
		stageTotalOverrides = {};
		searchLeadsPerStage = {};
		searchTotalsPerStage = {};
	});

	const navLoading = $derived(navigating.to?.url.pathname === '/pipeline');

	let wonLead = $state<Lead | null>(null);
	let doneLead = $state<Lead | null>(null);
	let lostLead = $state<Lead | null>(null);
	let savingWon = $state(false);
	let savingDone = $state(false);
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
			// Thread the active AE filter so lazily-loaded pages respect it too (server re-guards it).
			const repParam = data.filterRepId ? `&rep=${data.filterRepId}` : '';
			const res = await fetch(
				`/api/leads/pipeline-stage?stage=${stage}&page=${nextPage}&limit=10${repParam}`
			);
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
		if (stage === 'done') return void (doneLead = lead);
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

	async function confirmDone(payload: MoveStagePayload) {
		if (!doneLead || savingDone) return;
		const lead = doneLead;
		savingDone = true;
		const prevStage = lead.stage;
		shadowLeads = patchInList(shadowLeads, lead.id, { stage: 'done' });
		extraLeads = patchInList(extraLeads, lead.id, { stage: 'done' });
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'done', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
				extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
				toasts.push(`Done capture failed: ${msg}`);
				return;
			}
		} catch {
			shadowLeads = patchInList(shadowLeads, lead.id, { stage: prevStage });
			extraLeads = patchInList(extraLeads, lead.id, { stage: prevStage });
			toasts.push('Done capture failed — server error');
			return;
		} finally {
			savingDone = false;
		}
		doneLead = null;
		await invalidateAll();
		toasts.success(`${lead.name} — marked done`);
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
			<SearchInput
				value={query}
				oninput={handleSearch}
				debounceMs={200}
				ariaLabel="Search pipeline"
				placeholder="Search leads, organizers, events…"
			/>
			{#if searchLoading}
				<span class="font-mono text-[11px] text-ink-400" role="status" aria-live="polite"
					>Searching…</span
				>
			{/if}
			{#if data.isManager}
				<RepFilterCombobox
					users={data.activeReps}
					selectedId={data.filterRepId ?? undefined}
					currentUserId={data.currentUser?.id}
					allLabel="All AEs"
					onSelect={navigateRepFilter}
					placeholder="Search AEs…"
				/>
			{/if}
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
		<!-- A2: skeleton mirrors the real board's actual layout — a horizontal row of
		     dynamic-width (min-w-[260px] flex-1) columns that stretch to fill the row when
		     few fit and fall back to horizontal scrolling once too many are present. -->
		<div class="flex min-h-0 flex-1 gap-3.5 overflow-x-auto pb-2" data-testid="pipeline-skeleton">
			{#each Array(5) as _, i (i)}
				<div
					class="flex w-[380px] shrink-0 flex-col gap-2 rounded-frame border border-hairline bg-panel-subtle p-2"
				>
					<CardSkeleton />
					<CardSkeleton />
				</div>
			{/each}
		</div>
	{:else}
		<PipelineBoard
			leads={boardLeads}
			isFiltering={searchActive}
			totalsPerStage={boardTotals}
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
{#if doneLead}
	<DoneCaptureModal
		open={true}
		leadName={doneLead.name}
		defaultCurrency={doneLead.currency ?? 'PHP'}
		saving={savingDone}
		onclose={() => (doneLead = null)}
		onconfirm={confirmDone}
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
