<script lang="ts">
	import type { Stage } from '$lib/types';
	import { stageColor, stageLabel } from '$lib/utils/stages';
	import { Badge } from '$lib/components/ui/badge';

	let { stage }: { stage: Stage } = $props();
	const hex = $derived(stageColor(stage));
</script>

<Badge
	variant="outline"
	class="rounded-chip border px-[7px] py-0.5 font-mono text-[11px] font-medium"
	style="color:{hex};background:{hex}14;border-color:{hex}30"
>
	{stageLabel(stage)}
</Badge>
