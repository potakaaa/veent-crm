<script lang="ts">
	import { avatarColor } from '$lib/design/tokens';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';

	let {
		name,
		size = 'sm'
	}: { name: string | null | undefined; size?: 'sm' | 'md' | 'lg' } = $props();

	const dim = $derived(
		size === 'lg' ? 'size-[30px] text-[12px]' : size === 'md' ? 'size-7 text-[12px]' : 'size-[22px] text-[10px]'
	);
	const hex = $derived(avatarColor(name));
</script>

{#if name}
	<Avatar class={dim} title={name}>
		<AvatarFallback class="font-semibold text-white" style="background:{hex}">
			{name[0]}
		</AvatarFallback>
	</Avatar>
{:else}
	<span class="font-mono text-[11px] italic text-ink-200">— up for grabs</span>
{/if}
