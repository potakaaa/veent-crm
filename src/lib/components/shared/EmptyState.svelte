<script lang="ts">
	import { Card } from '$lib/components/ui/card';

	let {
		title,
		hint = undefined,
		tone = 'muted'
	}: { title: string; hint?: string; tone?: 'muted' | 'success' } = $props();
</script>

<Card class="gap-0 rounded-control p-12 text-center">
	<div class="text-[15px] font-semibold {tone === 'success' ? 'text-fresh' : 'text-ink-600'}">{title}</div>
	{#if hint}
		<div class="mt-1 text-[13px] text-ink-200">{hint}</div>
	{/if}
</Card>
