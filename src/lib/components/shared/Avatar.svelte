<script lang="ts">
	import { resolveAvatarColor } from '$lib/design/tokens';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';

	let {
		name,
		size = 'sm',
		color
	}: {
		name: string | null | undefined;
		size?: 'sm' | 'md' | 'lg';
		color?: string | null;
	} = $props();

	const dim = $derived(
		size === 'lg'
			? 'size-[30px] text-[12px]'
			: size === 'md'
				? 'size-7 text-[12px]'
				: 'size-[22px] text-[10px]'
	);
	const hex = $derived(resolveAvatarColor(color, name));
</script>

{#if name}
	<Avatar class={dim} title={name}>
		<AvatarFallback class="font-semibold text-white" style="background:{hex}">
			{name[0]}
		</AvatarFallback>
	</Avatar>
{:else}
	<span class="truncate font-mono text-[11px] italic text-ink-200">— unassigned</span>
{/if}
