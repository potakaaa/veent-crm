<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<!-- Generic card-shaped skeleton: title + a few content lines. -->
<div class="rounded-control border border-hairline bg-panel p-5">
	<Skeleton class="mb-4 h-4 w-32" />
	<div class="space-y-2.5">
		<Skeleton class="h-3.5 w-full" />
		<Skeleton class="h-3.5 w-5/6" />
		<Skeleton class="h-3.5 w-2/3" />
	</div>
</div>
