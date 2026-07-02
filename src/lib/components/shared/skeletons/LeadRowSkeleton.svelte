<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	// `count` renders multiple stacked row placeholders (default 1).
	let { count = 1 }: { count?: number } = $props();
</script>

<!-- Mirrors a single lead-list row: platform badge, name/handle stack, trailing meta. -->
{#each Array(count) as _, i (i)}
	<div class="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0">
		<Skeleton class="h-8 w-8 shrink-0 rounded-full" />
		<div class="min-w-0 flex-1 space-y-1.5">
			<Skeleton class="h-3.5 w-40" />
			<Skeleton class="h-3 w-28" />
		</div>
		<Skeleton class="h-5 w-16 shrink-0 rounded-chip" />
		<Skeleton class="h-7 w-16 shrink-0 rounded-control" />
	</div>
{/each}
