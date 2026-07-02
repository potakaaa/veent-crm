<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { formatDate } from '$lib/utils/dates';
	import MeetingFormModal, {
		type MeetingFormPayload
	} from '$lib/components/meetings/MeetingFormModal.svelte';

	let { data } = $props();

	const meeting = $derived(data.meeting);

	function formatStart(iso: string): string {
		return formatDate(iso, {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Edit is gated the same way as the /meetings list: managers, or the organizer.
	const canManage = $derived(
		data.me.role === 'manager' ||
			(meeting.organizerId != null && meeting.organizerId === data.me.id)
	);

	let modalOpen = $state(false);
	let saving = $state(false);

	async function submit(payload: MeetingFormPayload) {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/meetings/${meeting.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startAt: payload.startAt,
					organizerId: payload.organizerId ? payload.organizerId : null,
					meetingUrl: payload.meetingUrl ?? '',
					notes: payload.notes ?? '',
					outcome: payload.outcome ?? '',
					attendeeIds: payload.attendeeIds
				})
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Update failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Meeting save failed — server error');
			return;
		} finally {
			saving = false;
		}
		modalOpen = false;
		await invalidateAll();
		toasts.success('Meeting updated');
	}
</script>

<svelte:head><title>Meeting · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[760px] px-7 pb-16 pt-5">
	<a
		href="/meetings"
		class="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} /> All meetings
	</a>

	<div class="mb-5 flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">
				{formatStart(meeting.startAt)}
			</h1>
			<a
				href={`/leads/${meeting.leadId}`}
				class="mt-1 inline-block text-[13px] font-medium text-primary hover:underline"
			>
				{meeting.leadName ?? 'View lead'}
			</a>
		</div>
		{#if canManage}
			<Button onclick={() => (modalOpen = true)}>Edit</Button>
		{/if}
	</div>

	<div class="grid gap-3 rounded-control border border-hairline bg-panel p-4">
		<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
			<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Organizer</span>
			<span class="text-ink">{meeting.organizerName ?? 'Unassigned'}</span>
		</div>

		<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
			<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Attendees</span>
			<span class="text-ink">
				{meeting.attendees.length > 0 ? meeting.attendees.map((a) => a.name).join(', ') : 'None'}
			</span>
		</div>

		{#if meeting.meetingUrl}
			<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
				<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Link</span>
				<a
					href={meeting.meetingUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="truncate font-mono text-[12.5px] text-blue-600 underline hover:text-blue-800"
				>
					{meeting.meetingUrl}
				</a>
			</div>
		{/if}

		{#if meeting.outcome}
			<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
				<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Outcome</span>
				<span class="text-ink">{meeting.outcome}</span>
			</div>
		{/if}

		{#if meeting.notes}
			<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
				<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Notes</span>
				<span class="whitespace-pre-wrap text-ink-600">{meeting.notes}</span>
			</div>
		{/if}
	</div>
</div>

{#if canManage}
	<MeetingFormModal
		open={modalOpen}
		users={data.users}
		leadId={meeting.leadId}
		{meeting}
		{saving}
		onclose={() => (modalOpen = false)}
		onsubmit={submit}
	/>
{/if}
