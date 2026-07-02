<script lang="ts">
	import { appealTier, type AppealTier } from '$lib/appeal-score';
	import { Badge } from '$lib/components/ui/badge';

	let { score }: { score: number | null | undefined } = $props();

	const tier = $derived(appealTier(score ?? null));

	// Tier → semantic design token hex (mirrors AgeBadge.svelte inline-hex pattern):
	// high = fresh/green (chase now), mid = stale/amber (warm), low = overdue/red (low priority),
	// none = ink-300/gray (unscoreable). Background = hex+14 alpha, border = hex+30 alpha.
	const COLOR: Record<AppealTier, string> = {
		high: '#059669', // --color-fresh
		mid: '#d97706', // --color-stale
		low: '#dc2626', // --color-overdue
		none: '#9b95a0' // --color-ink-300
	};
	const hex = $derived(COLOR[tier]);
</script>

{#if score == null}
	<Badge
		variant="outline"
		class="rounded-chip border px-[7px] py-0.5 font-mono text-[11px] font-medium"
		style="color:{hex};background:{hex}14;border-color:{hex}30"
		title="Not enough data — needs an announce date and event date to score"
	>
		Not enough data
	</Badge>
{:else}
	<Badge
		variant="outline"
		class="rounded-chip border px-[7px] py-0.5 font-mono text-[11px] font-medium"
		style="color:{hex};background:{hex}14;border-color:{hex}30"
		title="Appeal score {score}/100"
	>
		{score}
	</Badge>
{/if}
