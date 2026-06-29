<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';

	let { message, link = undefined }: { message: string; link?: string } = $props();
</script>

<!-- Advisory only — dedup never merges records and never blocks saving. -->
<div
	class="mb-4 flex items-center gap-2.5 rounded-control border border-stale/30 bg-[rgba(194,113,12,0.08)] px-3.5 py-[11px]"
>
	<span class="shrink-0 text-stale"><Icon name="alert" size={17} stroke={2} /></span>
	<div class="flex-1 text-[13px] text-[#92560b]">
		{message}
		{#if link}<span class="font-semibold text-stale underline">{link}</span>{/if}
	</div>
	<span
		class="rounded-[5px] bg-[rgba(194,113,12,0.12)] px-2 py-[3px] font-mono text-[10.5px] text-stale"
	>
		advisory — never merged
	</span>
</div>
