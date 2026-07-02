<script lang="ts">
	import type { AgeType } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge';

	let { label, type }: { label: string; type: AgeType } = $props();

	const COLOR: Record<AgeType, string> = {
		overdue: '#dc2626',
		due: '#e11d2a',
		stale: '#d97706',
		fresh: '#059669',
		normal: '#6b7280'
	};
	const hex = $derived(COLOR[type]);
</script>

<Badge
	variant="outline"
	class="rounded-chip border px-[7px] py-0.5 font-mono text-[11px] font-medium"
	style="color:{hex};background:{hex}14;border-color:{hex}30"
>
	{label}
</Badge>
