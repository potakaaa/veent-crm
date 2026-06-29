<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import {
		Button as UiButton,
		type ButtonVariant,
		type ButtonSize
	} from '$lib/components/ui/button';

	// Backwards-compatible wrapper around shadcn ui/button. Existing call sites keep
	// their semantic variant names; we map them to the shadcn variants.
	type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
	type Size = 'sm' | 'md';

	let {
		variant = 'secondary',
		size = 'md',
		href = undefined,
		class: extra = '',
		children,
		...rest
	}: {
		variant?: Variant;
		size?: Size;
		href?: string;
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes = $props();

	const variantMap: Record<Variant, ButtonVariant> = {
		primary: 'default',
		secondary: 'outline',
		ghost: 'ghost',
		success: 'success',
		danger: 'destructive'
	};
	const sizeMap: Record<Size, ButtonSize> = { sm: 'sm', md: 'default' };
</script>

<UiButton variant={variantMap[variant]} size={sizeMap[size]} {href} class={extra} {...rest}>
	{@render children()}
</UiButton>
