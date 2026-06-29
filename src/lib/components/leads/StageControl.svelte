<script lang="ts">
	import { STAGE_ORDER, stageLabel, stageColor } from '$lib/utils/stages';
	import type { Stage } from '$lib/types';

	let {
		current,
		disabled = false,
		onSelect
	}: { current: Stage; disabled?: boolean; onSelect: (stage: Stage) => void } = $props();
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
		Stage — click to move
	</div>
	<div class="flex flex-col gap-1.5">
		{#each STAGE_ORDER as s (s)}
			{@const isCurrent = current === s}
			{@const hex = stageColor(s)}
			<button
				{disabled}
				onclick={() => onSelect(s)}
				class="flex h-[34px] items-center gap-2.5 rounded-[7px] border px-[11px] text-[13px] text-ink disabled:opacity-50 {isCurrent
					? 'font-semibold'
					: 'font-medium'}"
				style={isCurrent
					? `border-color:${hex}55;background:${hex}12`
					: 'border-color:var(--color-hairline);background:#fff'}
			>
				<span class="h-2 w-2 rounded-full" style="background:{hex}"></span>
				{stageLabel(s)}
				{#if isCurrent}
					<span class="ml-auto font-mono text-[10px]" style="color:{hex}">current</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
