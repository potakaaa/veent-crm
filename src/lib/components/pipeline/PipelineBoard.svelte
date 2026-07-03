<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import StageSelect from './StageSelect.svelte';
	import { BOARD_STAGES, stageColor, stageLabel } from '$lib/utils/stages';
	import { riskMeta } from '$lib/utils/risk';
	import type { Lead, Stage, User } from '$lib/types';

	// Loader attaches derived `appealScore` to each lead at runtime (spread + extra field);
	// widen the prop type to reflect it.
	type LeadWithAppeal = Lead & { appealScore: number | null };

	let {
		leads,
		totalsPerStage = {},
		loadingPerStage = {},
		users,
		onMove,
		onLoadMore
	}: {
		leads: LeadWithAppeal[];
		totalsPerStage?: Partial<Record<Stage, number>>;
		loadingPerStage?: Partial<Record<Stage, boolean>>;
		users: User[];
		onMove?: (leadId: string, stage: Stage) => void;
		onLoadMore?: (stage: Stage) => void;
	} = $props();

	const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
	const ownerActive = (id: string | null) =>
		id ? (users.find((u) => u.id === id)?.active ?? false) : false;

	const columns = $derived(
		BOARD_STAGES.map((stage) => {
			const cards = leads.filter((l) => l.stage === stage);
			const need = cards.filter((l) => riskMeta(l.urgency).atRisk).length;
			const urgent = cards.some((l) => l.urgency === 'overdue' || l.urgency === 'due');
			const healthColor = need ? (urgent ? '#dc2626' : '#d97706') : '#12a150';
			const healthLabel =
				stage === 'won'
					? 'closed'
					: need
						? `${need} need${need === 1 ? 's' : ''} action`
						: cards.length
							? 'all healthy'
							: 'empty';
			const healthPct = cards.length ? Math.round((need / cards.length) * 100) : 0;
			return { stage, color: stageColor(stage), cards, need, healthColor, healthLabel, healthPct };
		})
	);

	let dragId = $state<string | null>(null);

	// A1: only show the right-edge scroll fade when the board actually overflows
	// horizontally, so it never renders over blank trailing canvas on wide screens.
	let scrollEl = $state<HTMLElement | null>(null);
	let canScroll = $state(false);

	function checkScroll() {
		if (scrollEl) canScroll = scrollEl.scrollWidth > scrollEl.clientWidth + 1;
	}

	// Re-check when the board data changes (columns/cards added or removed).
	$effect(() => {
		void columns;
		checkScroll();
	});

	// Re-check on viewport/layout resize.
	$effect(() => {
		if (!scrollEl) return;
		const ro = new ResizeObserver(() => checkScroll());
		ro.observe(scrollEl);
		return () => ro.disconnect();
	});

	function drop(stage: Stage) {
		if (dragId && onMove) onMove(dragId, stage);
		dragId = null;
	}

	function sentinel(el: HTMLElement, stage: Stage) {
		const obs = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onLoadMore?.(stage);
			},
			{ threshold: 0.1 }
		);
		obs.observe(el);
		return { destroy: () => obs.disconnect() };
	}
</script>

<!-- Scroll region wrapper — a right-edge fade cues that the board scrolls horizontally (A1). -->
<div class="relative min-h-0 flex-1">
	<div
		bind:this={scrollEl}
		class="flex h-full gap-3.5 overflow-x-auto pb-2"
		role="list"
		aria-label="Pipeline stages"
	>
		{#each columns as col (col.stage)}
			{@const total = totalsPerStage[col.stage] ?? col.cards.length}
			{@const loading = loadingPerStage[col.stage] ?? false}
			{@const hasMore = col.cards.length < total}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex min-w-[260px] flex-1 flex-col"
				role="listitem"
				aria-label="{stageLabel(col.stage)} stage — drop target"
				ondragover={(e) => e.preventDefault()}
				ondrop={() => drop(col.stage)}
			>
				<div class="px-1 pb-[11px]">
					<div class="flex items-center gap-2">
						<span class="h-[7px] w-[7px] rounded-full" style="background:{col.color}"></span>
						<span class="text-[13px] font-semibold tracking-[-0.1px] text-ink-800"
							>{stageLabel(col.stage)}</span
						>
						<span class="font-mono text-[11px] text-ink-400">
							{col.cards.length}{hasMore ? `/${total}` : ''}
						</span>
						<span class="flex-1"></span>
						<span class="font-mono text-[10px]" style="color:{col.healthColor}"
							>{col.healthLabel}</span
						>
					</div>
					<div class="mt-2.5 h-[2px] overflow-hidden rounded-[2px] bg-panel-sunken">
						{#if col.need > 0}
							<div
								class="h-full rounded-[2px]"
								style="width:{col.healthPct}%;background:{col.healthColor}"
							></div>
						{/if}
					</div>
				</div>
				<div
					class="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-frame border border-hairline bg-panel-subtle p-2"
				>
					{#each col.cards as c (c.id)}
						{@const risk = riskMeta(c.urgency)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!--
						A3a: the outer <div> is the drag source (carries draggable + ondragstart +
						the card's visual styling/border-left) so the interactive StageSelect can sit
						as a sibling of the link instead of nested inside an <a> (invalid HTML / breaks
						tab order). The inner <a> is draggable="false" (E2) so the browser's native
						link-drag doesn't hijack the custom dragstart/dataTransfer path drop() relies on.
					-->
						<div
							draggable="true"
							ondragstart={() => (dragId = c.id)}
							class="cursor-grab rounded-[10px] border border-hairline bg-panel shadow-frame hover:shadow-raised"
						>
							<a
								href="/leads/{c.id}"
								draggable="false"
								aria-label="Open {c.name} lead detail"
								class="focus-ring block p-3"
							>
								<div class="flex items-center gap-[7px]">
									<PlatformBadge platform={c.platform} />
									<span class="flex-1 truncate text-[13px] font-semibold">{c.name}</span>
									<AppealScoreBadge score={c.appealScore} />
									{#if risk.atRisk}
										<span
											class="shrink-0 font-mono text-[10px] font-semibold"
											style="color:{risk.color}">{c.age.label}</span
										>
									{/if}
								</div>
								<div class="mt-1.5 flex items-center gap-1.5">
									<span
										class="shrink-0 rounded-[4px] bg-panel-sunken px-[5px] py-px font-mono text-[9px] text-ink-400"
										>{c.category}</span
									>
									<span class="truncate font-mono text-[10.5px] text-ink-300"
										>{c.eventName ?? '—'}{c.eventDate ? ` · ${c.eventDate}` : ''}</span
									>
									<EventBadge date={c.eventDate} />
								</div>
								{#if risk.atRisk}
									<div class="mt-2.5 flex items-center gap-[7px]">
										<span
											class="h-[5px] w-[5px] shrink-0 rounded-full"
											style="background:{risk.color}"
										></span>
										<span
											class="flex-1 truncate text-[11.5px] font-medium"
											style="color:{risk.color}">{risk.label}</span
										>
										<span class="font-mono text-[10px] text-ink-200">{risk.due}</span>
									</div>
								{/if}
								<div class="mt-2.5 flex items-center gap-[7px] border-t border-panel-sunken pt-2.5">
									<span class="relative shrink-0">
										<Avatar name={ownerName(c.ownerId)} />
										<span
											class="absolute -bottom-px -right-px h-[7px] w-[7px] rounded-full border-[1.5px] border-white"
											style="background:{ownerActive(c.ownerId) ? '#22c55e' : '#b7b1bc'}"
										></span>
									</span>
									<span class="flex-1 truncate text-[11.5px] text-ink-500"
										>{ownerName(c.ownerId) ?? 'Unassigned'}</span
									>
									<span class="font-mono text-[10px] text-ink-200">{c.age.label}</span>
								</div>
							</a>
							<!-- Keyboard-accessible stage-change control (A3). draggable="false" (spot-check
						     in E2 note) keeps a drag gesture started on the Select from initiating a card
						     drag on the outer div. -->
							<div class="px-3 pb-3" draggable="false">
								<StageSelect leadId={c.id} stage={c.stage} {onMove} />
							</div>
						</div>
					{/each}

					{#if hasMore}
						<div use:sentinel={col.stage} class="flex items-center justify-center py-2">
							{#if loading}
								<span class="font-mono text-[11px] text-ink-400">Loading…</span>
							{:else}
								<span class="font-mono text-[11px] text-ink-300"
									>{total - col.cards.length} more</span
								>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	{#if canScroll}
		<div
			class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent"
			aria-hidden="true"
		></div>
	{/if}
</div>
