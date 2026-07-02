<script lang="ts">
	import { Card } from '$lib/components/ui/card';
	import Icon, { type IconName } from '$lib/components/shared/Icon.svelte';

	let {
		value,
		label,
		icon,
		accent = '#e11d2a'
	}: { value: string | number; label: string; icon: IconName; accent?: string } = $props();
</script>

<Card class="gap-0 overflow-hidden rounded-frame p-0">
	<div class="flex items-center gap-2 px-4 pb-2.5 pt-3" style="background:{accent}14">
		<span class="flex shrink-0" style="color:{accent}"><Icon name={icon} size={15} /></span>
		<span class="truncate text-[12px] font-semibold" style="color:{accent}">{label}</span>
	</div>
	<div class="px-4 pb-4 pt-3">
		<div class="tnum text-[32px] font-extrabold leading-none tracking-[-1.2px] text-ink">
			{value}
		</div>
	</div>
</Card>
