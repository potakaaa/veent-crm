<script lang="ts">
	/*
	 * Shared Tab bar — Phase 5 (sitewide-ux-refresh). Unifies the two prior tab visual
	 * languages into one implementation:
	 *   - variant="segment"   → segmented-pill toolbar (was the leads-list filter toolbar,
	 *                           previously zero ARIA)
	 *   - variant="underline" → bordered underline tabs (was the lead-detail tab bar,
	 *                           previously had role="tablist"/role="tab"/aria-selected but no
	 *                           keyboard roving nav and no .focus-ring)
	 * Both variants now carry correct ARIA (role="tablist"/role="tab"/aria-selected), full
	 * keyboard navigation (ArrowLeft/Right/Home/End roving tabindex), and the shared
	 * .focus-ring utility. Content/panels stay owned by the parent — this component only
	 * renders the tab strip and reports the selected value via onValueChange.
	 */
	type Tab = { value: string; label: string };

	let {
		tabs,
		value,
		onValueChange,
		variant = 'underline',
		ariaLabel
	}: {
		tabs: Tab[];
		value: string;
		onValueChange: (value: string) => void;
		variant?: 'segment' | 'underline';
		ariaLabel?: string;
	} = $props();

	let buttons = $state<HTMLButtonElement[]>([]);

	function select(v: string) {
		if (v !== value) onValueChange(v);
	}

	// Roving-tabindex keyboard navigation over the tab strip.
	function onKeydown(e: KeyboardEvent, index: number) {
		const last = tabs.length - 1;
		let next: number;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = last;
		else return;
		e.preventDefault();
		const tab = tabs[next];
		if (!tab) return;
		select(tab.value);
		buttons[next]?.focus();
	}
</script>

{#if variant === 'segment'}
	<div role="tablist" aria-label={ariaLabel} class="flex rounded-control bg-panel-sunken p-[3px]">
		{#each tabs as tab, i (tab.value)}
			{@const selected = value === tab.value}
			<button
				bind:this={buttons[i]}
				role="tab"
				type="button"
				aria-selected={selected}
				tabindex={selected ? 0 : -1}
				onclick={() => select(tab.value)}
				onkeydown={(e) => onKeydown(e, i)}
				class="focus-ring h-[26px] rounded-[6px] px-3 text-[12.5px] {selected
					? 'bg-panel font-semibold text-ink shadow-frame'
					: 'font-medium text-ink-500'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
{:else}
	<div role="tablist" aria-label={ariaLabel} class="flex gap-1 border-b border-hairline">
		{#each tabs as tab, i (tab.value)}
			{@const selected = value === tab.value}
			<button
				bind:this={buttons[i]}
				role="tab"
				type="button"
				aria-selected={selected}
				tabindex={selected ? 0 : -1}
				onclick={() => select(tab.value)}
				onkeydown={(e) => onKeydown(e, i)}
				class="focus-ring border-b-2 px-3 py-2 text-[13px] font-medium {selected
					? 'border-primary text-ink'
					: 'border-transparent text-ink-400 hover:text-ink'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
{/if}
