<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription,
		DialogFooter
	} from '$lib/components/ui/dialog';

	// Convenience wrapper over shadcn ui/dialog. Public API is unchanged so all
	// existing modal call sites keep working.
	let {
		open = false,
		title,
		subtitle = undefined,
		tone = 'default',
		width = 460,
		onclose,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		subtitle?: string;
		tone?: 'default' | 'success';
		width?: number;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	function onOpenChange(next: boolean) {
		if (!next) onclose?.();
	}
</script>

<Dialog {open} {onOpenChange}>
	<DialogContent
		class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0"
		style="max-width:{width}px"
	>
		<div
			class={tone === 'success'
				? 'shrink-0 bg-fresh px-[22px] py-[18px] text-white'
				: 'shrink-0 border-b border-border px-[22px] py-[18px]'}
		>
			<DialogTitle class={tone === 'success' ? 'text-white' : 'text-ink'}>{title}</DialogTitle>
			{#if subtitle}
				<DialogDescription class={tone === 'success' ? 'mt-1 text-white/90' : 'mt-1 text-ink-400'}>
					{subtitle}
				</DialogDescription>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto px-[22px] py-5">
			{@render children()}
		</div>

		{#if footer}
			<DialogFooter class="shrink-0 flex-row gap-2.5 px-[22px] pb-[22px]">
				{@render footer()}
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
