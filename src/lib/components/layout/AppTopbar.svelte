<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { findDuplicates } from '$lib/utils/dedup';
	import type { Lead, User } from '$lib/types';

	let {
		leads,
		users,
		reviewCount = 0
	}: { leads: Lead[]; users: User[]; reviewCount?: number } = $props();

	let command = $state('');
	const matches = $derived(findDuplicates(command, leads));
	const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'unassigned';

	function openLead(id: string) {
		command = '';
		goto(`/leads/${id}`);
	}
</script>

<header
	class="relative z-30 flex h-[60px] shrink-0 items-center gap-4 border-b border-hairline bg-panel px-5"
>
	<!-- command / dedup search: "Search a page before reaching out" -->
	<div class="relative max-w-[560px] flex-1">
		<div
			class="flex h-10 items-center gap-2.5 rounded-control border border-hairline bg-panel-subtle px-3"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="#9c8a86"
				stroke-width="2"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
			</svg>
			<input
				bind:value={command}
				placeholder="Search a page before reaching out…"
				class="flex-1 border-none bg-transparent font-mono text-[13.5px] text-ink outline-none"
			/>
			<div
				class="flex shrink-0 items-center gap-1.5 rounded-[5px] border border-fresh/30 bg-fresh/10 px-[7px] py-[3px]"
			>
				<span class="h-1.5 w-1.5 rounded-full bg-fresh"></span>
				<span class="font-mono text-[10px] font-semibold text-fresh">dedup on</span>
			</div>
		</div>

		{#if matches.length > 0}
			<div
				class="absolute left-0 right-0 top-12 z-40 rounded-control border border-hairline bg-panel p-2 shadow-pop"
			>
				<div class="flex items-center gap-2 px-2 pb-2 pt-1.5">
					<Icon name="alert" size={14} stroke={2} />
					<span class="text-[11.5px] font-semibold text-stale">
						Already in the system — don't double-contact.
					</span>
				</div>
				{#each matches as m (m.id)}
					<button
						onclick={() => openLead(m.id)}
						class="flex w-full items-center gap-2.5 rounded-[7px] p-2 text-left hover:bg-panel-subtle"
					>
						<PlatformBadge platform={m.platform} />
						<div class="min-w-0 flex-1">
							<div class="text-[13px] font-semibold">{m.name}</div>
							<div class="font-mono text-[11px] text-ink-400">{m.handle}</div>
						</div>
						<StageChip stage={m.stage} />
						<span class="text-[11.5px] text-ink-300">{ownerName(m.ownerId)}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex-1"></div>

	<div class="flex items-center gap-2">
		<a
			href="/review"
			title="Review queue"
			class="relative flex h-[38px] w-[38px] items-center justify-center rounded-control border border-hairline bg-panel text-ink-600 hover:bg-panel-sunken"
		>
			<Icon name="alert" size={18} />
			{#if reviewCount > 0}
				<span
					class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-lg bg-overdue px-1 font-mono text-[9.5px] font-semibold text-white"
				>
					{reviewCount}
				</span>
			{/if}
		</a>
		<a
			href="/leads/new"
			class="flex h-[38px] items-center gap-1.5 rounded-control bg-primary px-3.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
		>
			<Icon name="plus" size={15} stroke={2.2} />
			New lead
		</a>
	</div>
</header>
