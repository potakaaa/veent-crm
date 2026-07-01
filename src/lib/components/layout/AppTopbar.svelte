<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';

	let { reviewCount = 0 }: { reviewCount?: number } = $props();
</script>

<header
	class="relative z-30 flex h-[60px] shrink-0 items-center gap-4 border-b border-hairline bg-panel px-5"
>
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
