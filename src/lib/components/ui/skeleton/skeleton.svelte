<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	data-slot="skeleton"
	class={cn('bg-muted animate-pulse rounded-md', className)}
	{...restProps}
></div>
