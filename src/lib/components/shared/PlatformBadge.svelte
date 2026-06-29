<script lang="ts">
	import type { Platform } from '$lib/types';
	import { platformToken } from '$lib/design/tokens';

	let { platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'lg' } = $props();
	const token = $derived(platformToken(platform));
	const dim = $derived(
		size === 'lg'
			? 'h-[34px] w-[34px] text-[12px] rounded-control'
			: 'h-6 w-6 text-[10px] rounded-chip'
	);
</script>

<span
	class="inline-flex shrink-0 items-center justify-center border font-mono font-semibold {dim}"
	style="color:{token.hex};background:{token.hex}14;border-color:{token.hex}30"
	title={platform}
>
	{token.abbr}
</span>
