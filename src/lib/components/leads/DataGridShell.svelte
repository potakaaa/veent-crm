<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { Snippet } from 'svelte';

	/**
	 * Shared grid shell for the Leads list (`LeadGrid.svelte`) and the Up-for-Grabs
	 * queue (`unassigned/+page.svelte`). Consolidates the panel chrome, the header
	 * row container, the loading skeleton, and the empty-state slot that were
	 * hand-duplicated between the two near-identical grid implementations
	 * (Phase 2 — sitewide-ux-refresh, Theme D consolidation).
	 *
	 * Responsive behaviour (Theme A): below the `lg` breakpoint each row collapses
	 * from a multi-column grid into a single stacked "card" (`grid-cols-1`), and the
	 * column-header row is hidden — matching the proven `lg:grid-cols-[...]` →
	 * `grid-cols-1` card-switch pattern already used on the Lead-detail page.
	 *
	 * The two call sites have different row shapes (`LeadGrid` rows are `<a>` links;
	 * `/unassigned` rows are `<div>`s with nested checkbox/popover/buttons), so the
	 * actual header cells and rows are supplied by the caller via snippets. The shell
	 * owns only the shared chrome and hands the caller the computed responsive
	 * `rowClass` so headers and rows stay column-aligned.
	 */
	let {
		cols,
		loading = false,
		isEmpty = false,
		skeletonCells = 8,
		skeletonRows = 8,
		mobileBare = false,
		header,
		rows,
		empty
	}: {
		/** Desktop grid-template-columns utility, `lg:`-prefixed e.g. `lg:grid-cols-[28px_2.4fr_...]`. */
		cols: string;
		loading?: boolean;
		isEmpty?: boolean;
		skeletonCells?: number;
		skeletonRows?: number;
		/**
		 * Opt-in, default `false` (unchanged behaviour — `LeadGrid.svelte`/`/leads` never passes
		 * this, so it always keeps the current panel chrome). When `true`, drops the shell's own
		 * outer panel box (border/bg/rounded/overflow) below `lg`, applying it only at `lg+`. Use
		 * when each row already renders its own card chrome on mobile (e.g. `/unassigned`) and an
		 * outer box around the whole list would double up with the per-row cards.
		 */
		mobileBare?: boolean;
		/** Header cells (rendered inside the shell's responsive, mobile-hidden header container). */
		header: Snippet;
		/** Data rows. Receives the shared responsive `rowClass` to apply to each row. */
		rows: Snippet<[string]>;
		/** Empty-state content, shown when `isEmpty` and not loading. */
		empty: Snippet;
	} = $props();

	// Stack into a single-column card below `lg`, expand to the full column grid at `lg+`.
	// gap-4 (not gap-3) — deliberate spacing fix from feat/leads-page-ux-redesign (04c8bbe)
	// for the event+date column; preserved across the mobileBare merge from development.
	const rowClass = $derived(`grid grid-cols-1 gap-1.5 lg:gap-4 ${cols}`);

	const outerClass = $derived(
		mobileBare
			? 'lg:overflow-hidden lg:rounded-control lg:border lg:border-hairline lg:bg-panel'
			: 'overflow-hidden rounded-control border border-hairline bg-panel'
	);

	// Loading skeleton: when mobileBare, give each skeleton row its own small card so it doesn't
	// look broken floating directly on the canvas with no outer box behind it (temporary state,
	// doesn't need full per-row card treatment — just enough to read cleanly).
	const skeletonRowClass = $derived(
		mobileBare
			? `${rowClass} min-h-[42px] items-center rounded-[8px] border border-hairline bg-panel px-4 py-2.5 mb-2 last:mb-0 lg:mb-0 lg:rounded-none lg:border-0 lg:border-b lg:border-panel-sunken lg:bg-transparent lg:py-0 lg:last:border-b-0`
			: `${rowClass} min-h-[42px] items-center border-b border-panel-sunken px-4 last:border-b-0`
	);
</script>

<div class={outerClass}>
	<div
		class="{rowClass} hidden items-center border-b border-hairline bg-panel-subtle px-4 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300 lg:grid"
	>
		{@render header()}
	</div>
	{#if loading}
		{#each Array(skeletonRows) as _, i (i)}
			<div class={skeletonRowClass}>
				{#each Array(skeletonCells) as _, c (c)}
					<Skeleton class="h-3.5 w-full" />
				{/each}
			</div>
		{/each}
	{:else if isEmpty}
		{@render empty()}
	{:else}
		{@render rows(rowClass)}
	{/if}
</div>
