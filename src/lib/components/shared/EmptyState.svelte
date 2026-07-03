<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import Icon, { type IconName } from '$lib/components/shared/Icon.svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		hint = undefined,
		tone = 'muted',
		icon = undefined,
		actions = undefined
	}: {
		title: string;
		hint?: string;
		tone?: 'muted' | 'success';
		icon?: IconName;
		actions?: Snippet;
	} = $props();
</script>

<Card class="gap-0 rounded-control p-12 text-center">
	{#if icon}
		<div
			class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full {tone ===
			'success'
				? 'bg-fresh/10 text-fresh'
				: 'bg-primary/10 text-primary'}"
		>
			<Icon name={icon} size={22} />
		</div>
	{/if}
	<div class="text-[15px] font-semibold {tone === 'success' ? 'text-fresh' : 'text-ink-600'}">
		{title}
	</div>
	{#if hint}
		<div class="mt-1 text-[13px] text-ink-200">{hint}</div>
	{/if}
	{#if actions}
		<div class="mt-4 flex items-center justify-center gap-2">
			{@render actions()}
		</div>
	{/if}
</Card>
