<script lang="ts">
	import { onMount } from 'svelte';
	import { cn, type WithElementRef } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		showIcon = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		showIcon?: boolean;
	} = $props();

	// Deterministic default width for SSR + first client render (avoids a hydration mismatch).
	// Randomised variety is applied client-only, post-mount, so server and client agree initially.
	let width = $state('70%');
	onMount(() => {
		width = `${Math.floor(Math.random() * 40) + 50}%`;
	});
</script>

<div
	bind:this={ref}
	data-slot="sidebar-menu-skeleton"
	data-sidebar="menu-skeleton"
	class={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
	{...restProps}
>
	{#if showIcon}
		<Skeleton class="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
	{/if}
	<Skeleton
		class="h-4 max-w-(--skeleton-width) flex-1"
		data-sidebar="menu-skeleton-text"
		style="--skeleton-width: {width};"
	/>
	{@render children?.()}
</div>
