<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import EventBadge from '$lib/components/shared/EventBadge.svelte';
	import { BOARD_STAGES, stageColor, stageLabel } from '$lib/utils/stages';
	import type { Lead, Stage, User } from '$lib/types';

	let {
		leads,
		lostCount = 0,
		users,
		onMove
	}: {
		leads: Lead[];
		lostCount?: number;
		users: User[];
		onMove?: (leadId: string, stage: Stage) => void;
	} = $props();

	const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
	const columns = $derived(
		BOARD_STAGES.map((stage) => ({
			stage,
			color: stageColor(stage),
			cards: leads.filter((l) => l.stage === stage)
		}))
	);

	let dragId = $state<string | null>(null);
	function drop(stage: Stage) {
		if (dragId && onMove) onMove(dragId, stage);
		dragId = null;
	}
</script>

<div class="flex min-h-0 flex-1 gap-3.5 overflow-x-auto pb-2">
	{#each columns as col (col.stage)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex w-[268px] shrink-0 flex-col"
			ondragover={(e) => e.preventDefault()}
			ondrop={() => drop(col.stage)}
		>
			<div class="flex items-center gap-2 px-1 pb-2.5">
				<span class="h-[9px] w-[9px] rounded-full" style="background:{col.color}"></span>
				<span class="text-[13px] font-bold tracking-[-0.2px]">{stageLabel(col.stage)}</span>
				<span
					class="rounded-[5px] bg-panel-sunken px-[7px] py-px font-mono text-[11px] text-ink-300"
				>
					{col.cards.length}
				</span>
			</div>
			<div
				class="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-control border border-hairline bg-[#f4f2ed] p-2"
			>
				{#each col.cards as c (c.id)}
					<a
						href="/leads/{c.id}"
						draggable="true"
						ondragstart={() => (dragId = c.id)}
						class="cursor-grab rounded-control border border-hairline bg-panel p-[11px] shadow-frame hover:shadow-raised"
						style="border-left:3px solid {col.color}"
					>
						<div class="mb-1.5 flex items-center gap-1.5">
							<PlatformBadge platform={c.platform} />
							<span class="truncate text-[12.5px] font-semibold">{c.name}</span>
						</div>
						<div class="mb-1.5 flex items-center gap-1.5">
							<span class="truncate font-mono text-[11px] text-ink-400">{c.eventName ?? '—'}</span>
							<EventBadge date={c.eventDate} />
						</div>
						{#if c.eventDate}
							<div class="mb-2 font-mono text-[11px] text-ink-300">
								{new Date(c.eventDate + 'T00:00:00').toLocaleDateString('en-PH', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
						{/if}
						<div class="flex items-center justify-between">
							<AgeBadge label={c.age.label} type={c.age.type} />
							<Avatar name={ownerName(c.ownerId)} />
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}

	<!-- collapsed lost column -->
	<div
		class="flex w-14 shrink-0 flex-col items-center gap-2.5 rounded-control border border-hairline bg-[#f4f2ed] py-3"
	>
		<span
			class="rounded-[5px] border border-hairline bg-panel px-[7px] py-px font-mono text-[11px] text-[#71717a]"
		>
			{lostCount}
		</span>
		<div
			class="text-[12px] font-semibold tracking-[0.5px] text-[#71717a]"
			style="writing-mode:vertical-rl;transform:rotate(180deg)"
		>
			lost — collapsed
		</div>
	</div>
</div>
