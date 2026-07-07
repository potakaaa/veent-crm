<script lang="ts">
	import { computeAriaPressed, isAllActive } from './week-range-control';

	let {
		presets,
		value,
		onchange,
		overrideValue,
		onOverrideInput,
		label = 'Event timing',
		leadingLabel
	}: {
		presets: number[];
		value: number | null;
		onchange: (weeks: number | 'all') => void;
		overrideValue: string;
		onOverrideInput: (value: string) => void;
		label?: string;
		leadingLabel?: string;
	} = $props();
</script>

<!--
	Toggle-group of week presets + free-text number override + "All".
	role="radiogroup" with aria-pressed toggle buttons (NOT tablist/tab — a text
	input cannot live cleanly inside a roving-tabindex tab strip). Visually
	borrows Tabs' variant="segment" segmented-pill styling.
-->
<div role="radiogroup" aria-label={label} class="flex flex-wrap items-center gap-1.5">
	{#if leadingLabel}
		<span class="text-[12px] text-ink-400">{leadingLabel}</span>
	{/if}
	{#each presets as w (w)}
		<button
			type="button"
			onclick={() => onchange(w)}
			aria-pressed={computeAriaPressed(w, value)}
			class="focus-ring h-8 rounded-[6px] border px-2.5 font-mono text-[11.5px] transition-colors {computeAriaPressed(
				w,
				value
			)
				? 'border-primary bg-selected font-semibold text-primary-strong'
				: 'border-hairline bg-panel text-ink-500 hover:bg-panel-sunken'}">{w}w</button
		>
	{/each}
	<input
		type="number"
		min="1"
		value={overrideValue}
		oninput={(e) => onOverrideInput(e.currentTarget.value)}
		placeholder="—"
		aria-label="Minimum weeks until event"
		class="h-8 w-14 rounded-[6px] border border-hairline bg-panel px-2 font-mono text-[11.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
	/>
	<button
		type="button"
		onclick={() => onchange('all')}
		aria-pressed={isAllActive(value)}
		class="focus-ring h-8 rounded-[6px] border px-2.5 font-mono text-[11.5px] transition-colors {isAllActive(
			value
		)
			? 'border-primary bg-selected font-semibold text-primary-strong'
			: 'border-hairline bg-panel text-ink-500 hover:bg-panel-sunken'}">All</button
	>
</div>
