<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
				outline:
					'border-border bg-background hover:bg-accent hover:text-accent-foreground border shadow-xs',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs',
				success: 'bg-fresh text-white hover:brightness-95 shadow-xs',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
				lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
				icon: 'size-9'
			}
		},
		defaultVariants: { variant: 'default', size: 'default' }
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils';

	type Props = WithElementRef<HTMLButtonAttributes> & {
		href?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		loadingText?: string;
	};

	// E2: `disabled` is destructured OUT of restProps so the explicit
	// `disabled={loading || disabled}` binding below is never overridden by the spread.
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		loading = false,
		loadingText = undefined,
		disabled = undefined,
		children,
		...restProps
	}: Props = $props();
</script>

{#snippet content()}
	{#if loading}
		<svg
			class="size-4 shrink-0 animate-spin"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
			></circle>
			<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			></path>
		</svg>
		{#if loadingText}{loadingText}{:else}{@render children?.()}{/if}
	{:else}
		{@render children?.()}
	{/if}
{/snippet}

{#if href}
	<a
		bind:this={ref}
		class={cn(buttonVariants({ variant, size }), className)}
		{href}
		aria-disabled={loading || disabled ? 'true' : undefined}
		tabindex={loading || disabled ? -1 : undefined}
		onclick={loading || disabled ? (e: MouseEvent) => e.preventDefault() : undefined}
		{...restProps as Record<string, unknown>}
	>
		{@render content()}
	</a>
{:else}
	<button
		bind:this={ref}
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		disabled={loading || disabled}
		{...restProps}
	>
		{@render content()}
	</button>
{/if}
