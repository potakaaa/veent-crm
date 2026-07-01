<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';

	let { reviewCount = 0 }: { reviewCount?: number } = $props();
</script>

<header class="relative z-30 flex h-[60px] shrink-0 items-center gap-3.5 bg-[#1a171c] px-[18px]">
	<div class="ml-auto flex items-center gap-2">
		<a
			href="/review"
			title="Review queue"
			class="relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#312c37] bg-[#221e27] text-[#c9c4ce] hover:bg-[#2a2530]"
		>
			<Icon name="alert" size={18} />
			{#if reviewCount > 0}
				<span
					class="absolute -right-[5px] -top-[5px] flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-[#1a171c] bg-primary px-1 font-mono text-[9.5px] font-semibold text-white"
				>
					{reviewCount}
				</span>
			{/if}
		</a>
		<a
			href="/leads/new"
			class="flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-[15px] text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(225,29,42,0.34)] hover:bg-primary-strong"
		>
			<Icon name="plus" size={15} stroke={2.2} />
			New lead
		</a>
	</div>
</header>
