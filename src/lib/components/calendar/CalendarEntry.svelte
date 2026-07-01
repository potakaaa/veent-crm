<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
	import type { CalendarEntry } from '$lib/types';

	let { entry }: { entry: CalendarEntry } = $props();

	// AC4: meeting vs follow-up are visually distinct — blue calendar-dot vs amber clock,
	// distinct border/background classes, plus a machine-readable data-entry-type attribute.
	const isMeeting = $derived(entry.type === 'meeting');
</script>

<a
	href={entry.href}
	data-entry-type={entry.type}
	data-testid="calendar-entry"
	title={entry.subtitle ? `${entry.title} — ${entry.subtitle}` : entry.title}
	class="flex items-center gap-1 truncate rounded-[5px] border-l-2 px-1.5 py-0.5 text-[11px] font-medium transition-colors {isMeeting
		? 'border-l-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
		: 'border-l-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'}"
>
	<Icon name={isMeeting ? 'calendar' : 'reminders'} size={11} />
	<span class="truncate">{entry.title}</span>
</a>
