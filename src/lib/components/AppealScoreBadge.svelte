<script lang="ts">
	import { appealTier } from '$lib/appeal-score';

	let { score }: { score: number | null } = $props();

	const tier = $derived(appealTier(score));

	// Color bands by tier: green = chase now, amber = warm, red = low priority, gray = unscoreable.
	const tierClass: Record<string, string> = {
		high: 'bg-green-100 text-green-700',
		mid: 'bg-amber-100 text-amber-800',
		low: 'bg-red-100 text-red-700',
		none: 'bg-gray-100 text-gray-500'
	};
</script>

{#if score == null}
	<span
		class="inline-block rounded px-2 py-0.5 text-xs {tierClass.none}"
		title="Not enough data — needs an announce date and event date to score"
	>
		Not enough data
	</span>
{:else}
	<span
		class="inline-block rounded px-2 py-0.5 text-xs font-medium {tierClass[tier]}"
		title="Appeal score {score}/100"
	>
		{score}
	</span>
{/if}
