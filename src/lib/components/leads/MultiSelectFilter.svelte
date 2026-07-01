<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';

	let {
		label,
		options,
		selected,
		onchange
	}: {
		label: string;
		options: string[];
		selected: string[];
		onchange: (values: string[]) => void;
	} = $props();

	// Toggle a single option in/out of the current selection, then notify the parent.
	function toggle(option: string) {
		const next = selected.includes(option)
			? selected.filter((v) => v !== option)
			: [...selected, option];
		onchange(next);
	}

	// Clear only this filter's selection.
	function clear() {
		if (selected.length > 0) onchange([]);
	}
</script>

<Popover.Root>
	<Popover.Trigger
		class="flex h-[34px] items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-600 hover:border-primary hover:text-primary {selected.length
			? 'border-primary text-primary'
			: ''}"
	>
		{label}{selected.length ? ` (${selected.length})` : ''}
		<span aria-hidden="true" class="text-[10px] leading-none">▾</span>
	</Popover.Trigger>
	<Popover.Content align="start" class="w-60 max-h-80 overflow-y-auto">
		<div class="flex items-center justify-between pb-1">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300">{label}</span>
			{#if selected.length}
				<button onclick={clear} class="text-[11.5px] font-medium text-primary hover:underline">
					Clear
				</button>
			{/if}
		</div>
		{#if options.length === 0}
			<p class="py-2 text-[12px] text-ink-200">No options available.</p>
		{:else}
			<ul class="flex flex-col">
				{#each options as option (option)}
					<li>
						<label
							class="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-[5px] text-[12.5px] text-ink-600 hover:bg-[#fcfbfd]"
						>
							<input
								type="checkbox"
								checked={selected.includes(option)}
								onchange={() => toggle(option)}
								class="h-[15px] w-[15px] rounded-[4px] border-hairline-strong text-primary focus:ring-primary"
							/>
							<span class="truncate">{option}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>
