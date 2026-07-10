<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	let {
		rows = 5,
		cols = 4,
		header = false,
		variant = 'default'
	}: {
		rows?: number;
		cols?: number;
		header?: boolean;
		variant?: 'default' | 'stack' | 'scroll';
	} = $props();

	// Container chrome.
	// - default: today's bordered panel (byte-identical, unchanged).
	// - scroll (/team): keep the bordered panel but give it a min-width so columns keep
	//   their size and scroll inside the overflow-x-auto wrapper below lg; min-w-0 at lg+
	//   makes it collapse back to today's exact layout.
	// - stack (/leads, /unassigned): drop the panel chrome below lg so each row can render
	//   as a standalone card (flex-col gap); at lg+ restore the exact bordered block panel.
	const containerClass = $derived(
		variant === 'stack'
			? 'flex flex-col gap-2 lg:block lg:gap-0 lg:overflow-hidden lg:rounded-control lg:border lg:border-hairline lg:bg-panel'
			: variant === 'scroll'
				? 'min-w-[720px] overflow-hidden rounded-control border border-hairline bg-panel lg:min-w-0'
				: 'overflow-hidden rounded-control border border-hairline bg-panel'
	);

	// Header row (only when header=true). For stack it's hidden below lg (cards have no
	// column header); at lg+ it renders identically to today.
	const headerRowClass = $derived(
		variant === 'stack'
			? 'hidden gap-4 border-b border-hairline bg-[#faf9fb] px-4 py-2.5 lg:flex'
			: 'flex gap-4 border-b border-hairline bg-[#faf9fb] px-4 py-2.5'
	);

	// Body row. For stack: a bordered single-column card below lg, reset to today's
	// horizontal bordered row at lg+.
	const bodyRowClass = $derived(
		variant === 'stack'
			? 'flex flex-col gap-2 rounded-[8px] border border-hairline bg-panel px-4 py-3 lg:flex-row lg:gap-4 lg:rounded-none lg:border-0 lg:border-b lg:border-hairline lg:bg-transparent lg:py-3 lg:last:border-0'
			: 'flex gap-4 border-b border-hairline px-4 py-3 last:border-0'
	);

	// Cells. For stack, cells are full-width blocks below lg (avoid flex-basis:0 collapsing
	// their height in a column), reset to flex-1 at lg+ (identical to today).
	const cellClass = $derived(
		variant === 'stack' ? 'h-3.5 w-full lg:w-auto lg:flex-1' : 'h-3.5 flex-1'
	);
	const headerCellClass = $derived(
		variant === 'stack' ? 'h-3 w-full lg:w-auto lg:flex-1' : 'h-3 flex-1'
	);
</script>

<!-- Generic table-shaped skeleton: header row + N body rows × M columns.
     `variant` controls mobile shape only; the lg+ (desktop) output is byte-identical
     across all three variants. -->
{#snippet tableInner()}
	<div class={containerClass}>
		{#if header}
			<div class={headerRowClass}>
				{#each Array(cols) as _, i (i)}
					<Skeleton class={headerCellClass} />
				{/each}
			</div>
		{/if}
		{#each Array(rows) as _, r (r)}
			<div class={bodyRowClass}>
				{#each Array(cols) as _, c (c)}
					<Skeleton class={cellClass} />
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#if variant === 'scroll'}
	<div class="overflow-x-auto">
		{@render tableInner()}
	</div>
{:else}
	{@render tableInner()}
{/if}
