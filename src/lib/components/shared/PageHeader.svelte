<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle = undefined,
		actions,
		meta
	}: {
		title: string;
		subtitle?: string;
		actions?: Snippet;
		meta?: Snippet;
	} = $props();
</script>

<div class="mb-4 flex items-end justify-between gap-4">
	<div>
		<h1 class="text-[25px] font-extrabold tracking-[-0.8px] text-ink">{title}</h1>
		{#if subtitle}
			<p class="mt-1.5 text-[13.5px] text-ink-500">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex items-center gap-2">{@render actions()}</div>
	{:else if meta}
		<div class="text-right font-mono text-[11px] text-ink-300">{@render meta()}</div>
	{/if}
</div>
