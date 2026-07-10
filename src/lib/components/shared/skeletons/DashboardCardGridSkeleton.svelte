<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	// Mirrors the real /dashboard per-AE card grid (src/routes/dashboard/+page.svelte):
	// same responsive grid (1 col < sm, 2 cols sm, 3 cols lg), and per-card the name+count
	// line, a 3-stat row, and a wrapped stage-chip row.
	let { cards = 6 }: { cards?: number } = $props();

	// Placeholder chip widths (px) to give the wrapped chip row a natural ragged shape.
	const chipWidths = [44, 56, 40, 60, 48];
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	{#each Array(cards) as _, i (i)}
		<div class="rounded-[10px] border border-hairline bg-panel p-4">
			<!-- name + leads-owned count -->
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<Skeleton class="h-3.5 w-28" />
				<Skeleton class="h-3 w-14" />
			</div>

			<!-- 3-stat row (Won all / Won range / Adherence) -->
			<div class="grid grid-cols-3 gap-2">
				{#each Array(3) as _, s (s)}
					<div class="flex flex-col items-center gap-1">
						<Skeleton class="h-2.5 w-12" />
						<Skeleton class="h-4 w-8" />
					</div>
				{/each}
			</div>

			<!-- added-in-range line + wrapped stage chips -->
			<div class="mt-3 border-t border-hairline pt-2">
				<div class="mb-1.5 flex items-center justify-between">
					<Skeleton class="h-2.5 w-20" />
					<Skeleton class="h-3 w-8" />
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each chipWidths as w, c (c)}
						<Skeleton class="h-4 rounded-[5px]" style={`width:${w}px`} />
					{/each}
				</div>
			</div>
		</div>
	{/each}
</div>
