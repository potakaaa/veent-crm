<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import {
		toggleOption,
		optionValue,
		optionLabel,
		singleTriggerLabel,
		type FilterOption
	} from './filter-dropdown';

	let {
		label,
		options,
		selected,
		multiple,
		onchange
	}: {
		label: string;
		options: readonly FilterOption[];
		selected: string[] | string;
		multiple: boolean;
		onchange: (values: string[] | string) => void;
	} = $props();

	// Controlled popover open-state — single-select closes on pick, multi stays open.
	let open = $state(false);

	// Multi-select works on an array; single-select on a string. Derive both views
	// so the markup stays branch-light.
	const selectedArray = $derived(Array.isArray(selected) ? selected : selected ? [selected] : []);
	const selectedSingle = $derived(Array.isArray(selected) ? (selected[0] ?? '') : selected);

	function isChecked(value: string): boolean {
		return multiple ? selectedArray.includes(value) : selectedSingle === value;
	}

	function choose(value: string) {
		onchange(toggleOption(multiple, selected, value));
		if (!multiple) open = false;
	}

	function clear() {
		if (multiple) {
			if (selectedArray.length > 0) onchange([]);
		} else if (selectedSingle) {
			onchange('');
		}
		if (!multiple) open = false;
	}

	// Trigger text + active styling, matching the two prior chromes 1:1.
	const activeCount = $derived(multiple ? selectedArray.length : selectedSingle ? 1 : 0);
	const triggerText = $derived(
		multiple
			? `${label}${selectedArray.length ? ` (${selectedArray.length})` : ''}`
			: singleTriggerLabel(label, options, selectedSingle)
	);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex h-[34px] items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-600 hover:border-primary hover:text-primary {activeCount
			? 'border-primary text-primary'
			: ''}"
	>
		{triggerText}
		<span aria-hidden="true" class="text-[10px] leading-none">▾</span>
	</Popover.Trigger>
	<Popover.Content align="start" class="w-60 max-h-80 overflow-y-auto">
		<div class="flex items-center justify-between pb-1">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300">{label}</span>
			{#if activeCount}
				<button onclick={clear} class="text-[11.5px] font-medium text-primary hover:underline">
					Clear
				</button>
			{/if}
		</div>
		{#if options.length === 0}
			<p class="py-2 text-[12px] text-ink-200">No options available.</p>
		{:else}
			<ul class="flex flex-col">
				{#each options as option (optionValue(option))}
					{@const value = optionValue(option)}
					<li>
						{#if multiple}
							<label
								class="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-[5px] text-[12.5px] text-ink-600 hover:bg-[#fcfbfd]"
							>
								<input
									type="checkbox"
									checked={isChecked(value)}
									onchange={() => choose(value)}
									class="h-[15px] w-[15px] rounded-[4px] border-hairline-strong text-primary focus:ring-primary"
								/>
								<span class="truncate">{optionLabel(option)}</span>
							</label>
						{:else}
							<button
								type="button"
								aria-pressed={isChecked(value)}
								onclick={() => choose(value)}
								class="flex w-full cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-[5px] text-left text-[12.5px] hover:bg-[#fcfbfd] {isChecked(
									value
								)
									? 'font-semibold text-primary'
									: 'text-ink-600'}"
							>
								<span class="truncate">{optionLabel(option)}</span>
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>
