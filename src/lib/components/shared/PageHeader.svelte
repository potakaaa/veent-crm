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

<div
	class="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
>
	<div class="min-w-0">
		<h1 class="text-[25px] font-extrabold tracking-[-0.8px] text-ink">{title}</h1>
		{#if subtitle}
			<p class="mt-1.5 text-[13.5px] text-ink-500">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{:else if meta}
		<div class="font-mono text-[11px] text-ink-300 sm:text-right">{@render meta()}</div>
	{/if}
</div>
