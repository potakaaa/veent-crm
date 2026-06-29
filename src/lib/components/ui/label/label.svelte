<script lang="ts">
	import type { HTMLLabelAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLLabelAttributes, HTMLLabelElement> = $props();
</script>

<label
	bind:this={ref}
	data-slot="label"
	class={cn(
		'flex select-none items-center gap-2 text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</label>
