<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<!-- Mirrors the lead-detail layout: header + two-column (info/timeline | right rail). -->
<div class="px-7 pb-16 pt-6">
	<Skeleton class="mb-3.5 h-3.5 w-28" />

	<div class="mb-3.5 flex items-center gap-3.5">
		<Skeleton class="h-12 w-12 shrink-0 rounded-control" />
		<div class="min-w-0 flex-1 space-y-2">
			<Skeleton class="h-6 w-64" />
			<Skeleton class="h-3.5 w-48" />
		</div>
		<Skeleton class="h-8 w-24 shrink-0 rounded-full" />
	</div>

	<div class="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_320px]">
		<div class="space-y-4">
			<div class="rounded-control border border-hairline bg-panel p-4">
				<Skeleton class="mb-3 h-3 w-24" />
				<div class="grid grid-cols-2 gap-x-6 gap-y-3">
					{#each Array(6) as _, i (i)}
						<div class="space-y-1.5">
							<Skeleton class="h-2.5 w-16" />
							<Skeleton class="h-3.5 w-32" />
						</div>
					{/each}
				</div>
			</div>
			<div class="rounded-control border border-hairline bg-panel p-4">
				<Skeleton class="mb-3 h-3 w-28" />
				<div class="space-y-3">
					{#each Array(3) as _, i (i)}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-3.5">
			{#each Array(3) as _, i (i)}
				<div class="rounded-control border border-hairline bg-panel p-4">
					<Skeleton class="mb-3 h-3 w-20" />
					<Skeleton class="h-9 w-full" />
				</div>
			{/each}
		</div>
	</div>
</div>
