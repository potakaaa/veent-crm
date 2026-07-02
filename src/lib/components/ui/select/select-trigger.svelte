<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		children,
		...restProps
	}: SelectPrimitive.TriggerProps & { size?: 'sm' | 'default'; children: Snippet } = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"border-input bg-background data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="size-4 opacity-50"
		aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
	>
</SelectPrimitive.Trigger>
