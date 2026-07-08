<script lang="ts">
	import { createDebouncer, DEFAULT_DEBOUNCE_MS } from './search-input';

	let {
		value,
		oninput,
		placeholder = 'Search…',
		ariaLabel,
		debounceMs = DEFAULT_DEBOUNCE_MS,
		class: className = ''
	}: {
		value: string;
		oninput: (value: string) => void;
		placeholder?: string;
		ariaLabel: string;
		debounceMs?: number;
		class?: string;
	} = $props();

	// Local, live-typed mirror so the box updates instantly while the debounced
	// callback trails behind. Resets when the bound `value` changes (navigation).
	let local = $derived(value);

	// One debouncer instance per component; re-created if debounceMs changes.
	const debounced = $derived(createDebouncer((v) => oninput(v), debounceMs));

	function handle(e: Event & { currentTarget: HTMLInputElement }) {
		local = e.currentTarget.value;
		debounced(local);
	}
</script>

<input
	type="text"
	value={local}
	oninput={handle}
	{placeholder}
	aria-label={ariaLabel}
	class="h-[34px] w-56 rounded-control border border-ink-200 bg-white px-2.5 text-[12.5px] text-ink-700 placeholder:text-ink-400 focus:border-primary focus:outline-none {className}"
/>
