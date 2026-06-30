<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	let { sections = 3, rows = 3 }: { sections?: number; rows?: number } = $props();
</script>

<!-- Mirrors a dashboard section list (Today / Reports): heading + grouped rows. -->
<div class="space-y-5">
	{#each Array(sections) as _, s (s)}
		<div>
			<div class="mb-2.5 flex items-center gap-2.5">
				<Skeleton class="h-2 w-2 rounded-full" />
				<Skeleton class="h-4 w-44" />
				<Skeleton class="h-4 w-8 rounded-[5px]" />
			</div>
			<div class="overflow-hidden rounded-control border border-hairline bg-panel">
				{#each Array(rows) as _, r (r)}
					<div class="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0">
						<Skeleton class="h-8 w-8 shrink-0 rounded-full" />
						<div class="min-w-0 flex-1 space-y-1.5">
							<Skeleton class="h-3.5 w-40" />
							<Skeleton class="h-3 w-28" />
						</div>
						<Skeleton class="h-7 w-16 shrink-0 rounded-control" />
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
