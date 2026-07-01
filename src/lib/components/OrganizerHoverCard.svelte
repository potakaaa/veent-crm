<script lang="ts">
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import { formatDate, relativeFromNow } from '$lib/utils/dates';
	import type { Lead } from '$lib/types';

	let { lead, ownerName }: { lead: Lead; ownerName: string | null } = $props();

	const handle = $derived(lead.handle.startsWith('@') ? lead.handle : `@${lead.handle}`);
	const email = $derived(lead.email ?? '—');
	const phone = $derived(lead.phone ?? '—');
	const categoryLocation = $derived(`${lead.category} · ${lead.location || '—'}`);
	const eventName = $derived(lead.eventName ?? '—');
	const eventDate = $derived(lead.eventDate ? formatDate(lead.eventDate) : '—');
	const owner = $derived(ownerName ?? 'Unassigned');
	const lastActivity = $derived(lead.lastActivityAt ? relativeFromNow(lead.lastActivityAt) : '—');
</script>

<div class="flex flex-col gap-2" aria-label="Possible duplicate: {lead.name}">
	<div class="flex items-center gap-2.5">
		<PlatformBadge platform={lead.platform} />
		<span class="flex-1 text-[13px] font-semibold text-ink">{lead.name}</span>
		<StageChip stage={lead.stage} />
	</div>
	<div class="font-mono text-[11px] text-ink-400">{handle}</div>

	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[12px]">
		<dt class="text-ink-400">Email</dt>
		<dd class="text-ink">{email}</dd>

		<dt class="text-ink-400">Phone</dt>
		<dd class="text-ink">{phone}</dd>

		<dt class="text-ink-400">Category</dt>
		<dd class="text-ink">{categoryLocation}</dd>

		<dt class="text-ink-400">Event</dt>
		<dd class="text-ink">{eventName} · {eventDate}</dd>

		<dt class="text-ink-400">Owner</dt>
		<dd class="text-ink">{owner}</dd>

		<dt class="text-ink-400">Last activity</dt>
		<dd class="text-ink">{lastActivity}</dd>
	</dl>

	<div class="flex justify-end border-t border-hairline pt-2">
		<a
			href="/leads/{lead.id}"
			class="inline-flex items-center gap-1 rounded-control px-2 py-1 text-[12px] font-medium text-primary hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
		>
			Go to lead
			<span aria-hidden="true">→</span>
		</a>
	</div>
</div>
