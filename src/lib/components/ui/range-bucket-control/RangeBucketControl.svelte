<script lang="ts">
	import { computeAriaPressed, type RangeBucket } from './range-bucket-control';

	let {
		value,
		onchange,
		label = 'Date range'
	}: {
		value: RangeBucket;
		onchange: (bucket: RangeBucket) => void;
		label?: string;
	} = $props();

	const OPTIONS: { bucket: RangeBucket; text: string }[] = [
		{ bucket: 'week', text: 'This week' },
		{ bucket: 'month', text: 'This month' },
		{ bucket: 'year', text: 'This year' },
		{ bucket: 'all', text: 'All time' }
	];
</script>

<!--
	4-bucket segmented pill (this week / this month / this year / all time). role="radiogroup" with
	aria-pressed toggle buttons, mirroring WeekRangeControl.svelte's accessibility + token
	pattern structurally (not a modification of it).
-->
<div role="radiogroup" aria-label={label} class="flex flex-wrap items-center gap-1.5">
	{#each OPTIONS as opt (opt.bucket)}
		<button
			type="button"
			onclick={() => onchange(opt.bucket)}
			aria-pressed={computeAriaPressed(opt.bucket, value)}
			class="focus-ring h-8 rounded-[6px] border px-2.5 font-mono text-[11.5px] transition-colors {computeAriaPressed(
				opt.bucket,
				value
			)
				? 'border-primary bg-selected font-semibold text-primary-strong'
				: 'border-hairline bg-panel text-ink-500 hover:bg-panel-sunken'}">{opt.text}</button
		>
	{/each}
</div>
