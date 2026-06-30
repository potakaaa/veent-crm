<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	let {
		rows = 5,
		cols = 4,
		header = false
	}: { rows?: number; cols?: number; header?: boolean } = $props();
</script>

<!-- Generic table-shaped skeleton: header row + N body rows × M columns. -->
<div class="overflow-hidden rounded-control border border-hairline bg-panel">
	{#if header}
		<div class="flex gap-4 border-b border-hairline bg-[#fdf7f5] px-4 py-2.5">
			{#each Array(cols) as _, i (i)}
				<Skeleton class="h-3 flex-1" />
			{/each}
		</div>
	{/if}
	{#each Array(rows) as _, r (r)}
		<div class="flex gap-4 border-b border-hairline px-4 py-3 last:border-0">
			{#each Array(cols) as _, c (c)}
				<Skeleton class="h-3.5 flex-1" />
			{/each}
		</div>
	{/each}
</div>
