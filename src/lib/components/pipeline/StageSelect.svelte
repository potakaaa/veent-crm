<script lang="ts">
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { STAGE_ORDER, stageLabel, stageColor } from '$lib/utils/stages';
	import type { Stage } from '$lib/types';

	// Keyboard-accessible stage-change control (A3). Uses the existing bits-ui `Select`
	// primitive (native arrow-key nav / Enter / Escape) and calls the EXACT same
	// `onMove(leadId, stage)` prop the drag-and-drop path uses — zero new server logic.
	// The parent pipeline page intercepts `won`/`lost` into capture/reason modals, so this
	// control does not special-case them; it just forwards the selected stage.
	let {
		leadId,
		stage,
		onMove
	}: {
		leadId: string;
		stage: Stage;
		onMove?: (leadId: string, stage: Stage) => void;
	} = $props();

	function handle(v: string) {
		const next = v as Stage;
		if (next !== stage) onMove?.(leadId, next);
	}
</script>

<Select type="single" value={stage} onValueChange={handle}>
	<SelectTrigger
		size="sm"
		aria-label="Change stage for this lead"
		class="focus-ring h-7 w-full rounded-control border border-hairline bg-panel px-2 font-mono text-[11px] text-ink-500"
	>
		<span class="flex items-center gap-1.5">
			<span class="h-[6px] w-[6px] shrink-0 rounded-full" style="background:{stageColor(stage)}"
			></span>
			{stageLabel(stage)}
		</span>
	</SelectTrigger>
	<SelectContent>
		{#each STAGE_ORDER as s (s)}
			<SelectItem value={s} label={stageLabel(s)}>{stageLabel(s)}</SelectItem>
		{/each}
	</SelectContent>
</Select>
