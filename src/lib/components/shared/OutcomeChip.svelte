<script lang="ts">
	import type { ActivityOutcome } from '$lib/types';
	import { OUTCOME_TOKENS } from '$lib/design/tokens';
	import { Badge } from '$lib/components/ui/badge';

	let { outcome }: { outcome: ActivityOutcome } = $props();
	const token = $derived(OUTCOME_TOKENS[outcome] ?? OUTCOME_TOKENS.other);
</script>

<Badge
	variant="outline"
	class="rounded-[4px] border px-1.5 py-px font-mono text-[10.5px] font-normal"
	style="color:{token.hex};background:{token.hex}14;border-color:{token.hex}30"
>
	{token.label}
</Badge>
