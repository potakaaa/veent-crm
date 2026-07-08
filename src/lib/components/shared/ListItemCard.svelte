<script lang="ts">
	import type { Snippet } from 'svelte';

	// Reusable mobile list-item card — a table-row alternative for narrow viewports.
	// Composes via snippets so any list page (organizers, team, etc.) can reuse it.
	let {
		href,
		onclick,
		title,
		titleTitle,
		meta,
		trailing
	}: {
		href?: string;
		onclick?: () => void;
		title: string;
		titleTitle?: string;
		meta?: Snippet;
		trailing?: Snippet;
	} = $props();

	// The href-less case renders as a div with role="button" — Enter/Space must trigger the
	// same action a native button would give it for free.
	function onkeydown(e: KeyboardEvent) {
		if (href || !onclick) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onclick();
		}
	}
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	{onclick}
	{onkeydown}
	role={!href && onclick ? 'button' : undefined}
	tabindex={!href && onclick ? 0 : undefined}
	class="flex items-center justify-between gap-3 rounded-control border border-hairline bg-panel px-3.5 py-3 {href ||
	onclick
		? 'cursor-pointer hover:bg-panel-sunken'
		: ''}"
>
	<div class="min-w-0 flex-1">
		<div class="truncate text-[13px] font-semibold text-ink-700" title={titleTitle}>{title}</div>
		{#if meta}
			<div class="mt-1 flex flex-col gap-0.5">{@render meta()}</div>
		{/if}
	</div>
	{#if trailing}
		<div class="shrink-0 text-right">{@render trailing()}</div>
	{/if}
</svelte:element>
