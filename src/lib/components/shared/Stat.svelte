<script lang="ts">
	import { Card } from '$lib/components/ui/card';

	let {
		value,
		label,
		accent = '#c0362c',
		emphasize = false
	}: { value: string | number; label: string; accent?: string; emphasize?: boolean } = $props();
</script>

<Card class="gap-0 rounded-control p-4" style="border-left:3px solid {accent}">
	<div
		class="font-mono text-[26px] font-semibold tracking-[-1px] tnum"
		style={emphasize ? `color:${accent}` : ''}
	>
		{value}
	</div>
	<div class="mt-0.5 text-[12px] text-ink-500">{label}</div>
</Card>
