<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	// `count` renders multiple stacked row placeholders (default 1).
	let { count = 1 }: { count?: number } = $props();
</script>

<!-- Mirrors a single lead-list row: platform badge, name/handle stack, trailing meta.
     Below lg the row stacks as a card (avatar+name on top, trailing chips below). The two
     inner wrappers are `display:contents` at lg+, so the desktop DOM/layout is byte-identical
     to the original single horizontal flex row. -->
{#each Array(count) as _, i (i)}
	<div
		class="flex flex-col items-start gap-2 border-b border-hairline px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:gap-3"
	>
		<div class="flex w-full items-center gap-3 lg:contents">
			<Skeleton class="h-8 w-8 shrink-0 rounded-full" />
			<div class="min-w-0 flex-1 space-y-1.5">
				<Skeleton class="h-3.5 w-40" />
				<Skeleton class="h-3 w-28" />
			</div>
		</div>
		<div class="flex items-center gap-2 lg:contents">
			<Skeleton class="h-5 w-16 shrink-0 rounded-chip" />
			<Skeleton class="h-7 w-16 shrink-0 rounded-control" />
		</div>
	</div>
{/each}
