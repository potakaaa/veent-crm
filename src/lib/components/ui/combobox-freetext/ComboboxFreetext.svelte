<script lang="ts">
	import { shouldShowDropdown, applySelection, createRequestGen } from './combobox-freetext-logic';

	let {
		value = $bindable(''),
		search = undefined,
		id = undefined,
		placeholder = undefined,
		disabled = false,
		...restProps
	}: {
		/** Free-text value — the input IS the value (free-text-first). */
		value?: string;
		/**
		 * Optional async suggestion source. Absent ⇒ free-text-only mode (no dropdown,
		 * plain input). Present ⇒ suggestion mode (300ms-debounced query + clickable listbox).
		 * The component NEVER blocks free-text based on whether `value` matches a result.
		 */
		search?: (q: string) => Promise<string[]>;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		[key: string]: unknown;
	} = $props();

	const hasSearch = $derived(search != null);

	let open = $state(false);
	let results = $state<string[]>([]);
	let activeIndex = $state(-1);
	// Latest-wins race guard (copied recipe from OrganizerCombobox.svelte).
	const tracker = createRequestGen();
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	// Stable ids for ARIA wiring. A random suffix avoids collisions when multiple
	// instances render on one page.
	const uid = Math.random().toString(36).slice(2, 8);
	const listboxId = `cbft-list-${uid}`;
	const optionId = (i: number) => `cbft-opt-${uid}-${i}`;

	const showDropdown = $derived(open && shouldShowDropdown(hasSearch, results));
	const activeOptionId = $derived(
		showDropdown && activeIndex >= 0 && activeIndex < results.length
			? optionId(activeIndex)
			: undefined
	);

	async function runSearch(q: string) {
		if (!search) return;
		const gen = tracker.next();
		try {
			const next = await search(q);
			if (tracker.isStale(gen)) return; // out-of-order response, drop it
			results = next;
			activeIndex = -1;
			open = true;
		} catch {
			// silent — the input stays usable as plain free-text; never blocks submit.
		}
	}

	function onInput(v: string) {
		value = v;
		if (!hasSearch) return;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void runSearch(value), 300);
	}

	function choose(picked: string) {
		const r = applySelection(value, picked);
		value = r.value;
		open = r.open; // false
		activeIndex = -1;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!hasSearch) return;
		if (e.key === 'ArrowDown') {
			if (!showDropdown) {
				// Re-open the dropdown from an already-fetched result set.
				if (results.length > 0) open = true;
				return;
			}
			e.preventDefault();
			activeIndex = activeIndex + 1 >= results.length ? 0 : activeIndex + 1;
		} else if (e.key === 'ArrowUp') {
			if (!showDropdown) return;
			e.preventDefault();
			activeIndex = activeIndex - 1 < 0 ? results.length - 1 : activeIndex - 1;
		} else if (e.key === 'Enter') {
			// Enter selects the active option; with no active option it accepts the
			// typed free-text (must NOT swallow the value — just close the dropdown).
			if (showDropdown && activeIndex >= 0 && activeIndex < results.length) {
				e.preventDefault();
				choose(results[activeIndex]);
			} else {
				open = false;
			}
		} else if (e.key === 'Escape') {
			// Close without changing `value`.
			if (open) {
				e.preventDefault();
				open = false;
			}
		}
	}
</script>

{#if hasSearch}
	<div class="relative">
		<input
			{id}
			{placeholder}
			{disabled}
			role="combobox"
			aria-expanded={showDropdown}
			aria-controls={listboxId}
			aria-autocomplete="list"
			aria-activedescendant={activeOptionId}
			autocomplete="off"
			value={value ?? ''}
			oninput={(e) => onInput(e.currentTarget.value)}
			onkeydown={onKeydown}
			onblur={() => setTimeout(() => (open = false), 120)}
			class="focus-ring flex h-9 w-full rounded-control border border-hairline bg-panel px-3 text-[13px] text-ink placeholder:text-ink-400 disabled:cursor-not-allowed disabled:opacity-60"
			{...restProps}
		/>
		{#if showDropdown}
			<ul
				role="listbox"
				id={listboxId}
				class="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-control border border-hairline bg-panel py-1 shadow-nav-popover"
			>
				{#each results as opt, i (opt + i)}
					<li
						role="option"
						id={optionId(i)}
						aria-selected={i === activeIndex}
						onmousedown={(e) => {
							// mousedown (not click) fires before blur closes the list.
							e.preventDefault();
							choose(opt);
						}}
						onmouseenter={() => (activeIndex = i)}
						class="cursor-pointer px-3 py-1.5 text-[13px] text-ink {i === activeIndex
							? 'bg-panel-sunken'
							: ''}"
					>
						{opt}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<!-- Free-text-only mode: plain input, zero dropdown/popover overhead. -->
	<input
		{id}
		{placeholder}
		{disabled}
		autocomplete="off"
		value={value ?? ''}
		oninput={(e) => onInput(e.currentTarget.value)}
		class="focus-ring flex h-9 w-full rounded-control border border-hairline bg-panel px-3 text-[13px] text-ink placeholder:text-ink-400 disabled:cursor-not-allowed disabled:opacity-60"
		{...restProps}
	/>
{/if}
