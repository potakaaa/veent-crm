<script lang="ts">
	// Small pill/chip for a single lead category (CAT-1, GitHub #248). When `color`
	// is set it tints the chip with a light background + colored border; otherwise it
	// falls back to the neutral `secondary` badge look. The optional ✕ button is shown
	// only when `removable` is true AND an `onRemove` handler is provided.
	import { Badge } from '$lib/components/ui/badge';

	let {
		category,
		onRemove,
		removable = false
	}: {
		// Only name + color are rendered here; callers may pass a full Category (id is ignored).
		category: { name: string; color: string | null };
		onRemove?: () => void;
		removable?: boolean;
	} = $props();

	const showRemove = $derived(removable && !!onRemove);

	// `{color}20` is an 8-digit hex (RRGGBBAA) — `20` ≈ 12.5% alpha for a light tint.
	const tintStyle = $derived(
		category.color
			? `background-color:${category.color}20;border-color:${category.color};color:inherit`
			: ''
	);
</script>

<Badge
	variant={category.color ? 'outline' : 'secondary'}
	class="gap-1 py-0.5 pl-2 {showRemove ? 'pr-1' : 'pr-2'}"
	style={tintStyle}
>
	<span class="truncate">{category.name}</span>
	{#if showRemove}
		<button
			type="button"
			aria-label="Remove {category.name}"
			class="flex size-4 items-center justify-center rounded-full leading-none text-ink-400 hover:bg-black/10 hover:text-ink"
			onclick={onRemove}
		>
			×
		</button>
	{/if}
</Badge>
