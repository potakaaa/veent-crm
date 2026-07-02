<script lang="ts">
	import type { HTMLThAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLThAttributes, HTMLTableCellElement> = $props();
</script>

<th
	bind:this={ref}
	data-slot="table-head"
	class={cn(
		'text-muted-foreground h-10 px-3 text-left align-middle font-mono text-[10.5px] font-medium tracking-[0.4px] uppercase whitespace-nowrap',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</th>
