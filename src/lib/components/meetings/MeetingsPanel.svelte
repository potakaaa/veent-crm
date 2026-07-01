<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { formatDate } from '$lib/utils/dates';
	import MeetingFormModal, {
		type MeetingFormPayload
	} from '$lib/components/meetings/MeetingFormModal.svelte';
	import type { Meeting, User } from '$lib/types';

	let {
		meetings,
		users,
		me,
		// Single-lead mode: leadId fixed (no lead column). Cross-lead mode: pass `leads`.
		leadId = undefined,
		leads = undefined
	}: {
		meetings: Meeting[];
		users: User[];
		me: User;
		leadId?: string;
		leads?: { id: string; name: string }[];
	} = $props();

	const crossLead = $derived(leads != null && leadId == null);

	let modalOpen = $state(false);
	let editing = $state<Meeting | null>(null);
	let saving = $state(false);
	let mutating = $state(false);

	function canManage(m: Meeting): boolean {
		return me.role === 'manager' || (m.organizerId != null && m.organizerId === me.id);
	}

	function openCreate() {
		editing = null;
		modalOpen = true;
	}
	function openEdit(m: Meeting) {
		editing = m;
		modalOpen = true;
	}

	function formatStart(iso: string): string {
		return formatDate(iso, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function submit(payload: MeetingFormPayload) {
		if (saving) return;
		saving = true;
		const editingId = editing?.id;
		try {
			const res = editingId
				? await fetch(`/api/meetings/${editingId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							startAt: payload.startAt,
							// Empty string means "unassign" — send explicit null so JSON.stringify
							// keeps the key (undefined would be dropped, leaving organizer unchanged).
							organizerId: payload.organizerId ? payload.organizerId : null,
							meetingUrl: payload.meetingUrl ?? '',
							notes: payload.notes ?? '',
							outcome: payload.outcome ?? '',
							attendeeIds: payload.attendeeIds
						})
					})
				: await fetch('/api/meetings', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`${editingId ? 'Update' : 'Create'} failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Meeting save failed — server error');
			return;
		} finally {
			saving = false;
		}
		modalOpen = false;
		editing = null;
		await invalidateAll();
		toasts.success(editingId ? 'Meeting updated' : 'Meeting created');
	}

	async function remove(m: Meeting) {
		if (mutating) return;
		if (!confirm('Delete this meeting?')) return;
		mutating = true;
		try {
			const res = await fetch(`/api/meetings/${m.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Delete failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Delete failed — server error');
			return;
		} finally {
			mutating = false;
		}
		await invalidateAll();
		toasts.push('Meeting deleted');
	}
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3 flex items-center justify-between">
		<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Meetings</div>
		<Button onclick={openCreate}>New meeting</Button>
	</div>

	{#if meetings.length === 0}
		<div class="py-8 text-center text-[13px] text-ink-400">No meetings yet.</div>
	{:else}
		<div class="flex flex-col gap-2.5">
			{#each meetings as m (m.id)}
				<div class="rounded-control border border-hairline bg-panel-subtle p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="text-[13px] font-semibold text-ink">{formatStart(m.startAt)}</div>
							{#if crossLead && m.leadName}
								<div class="mt-0.5 text-[12px] text-ink-500">{m.leadName}</div>
							{/if}
							<div class="mt-0.5 text-[12px] text-ink-400">
								Organizer: {m.organizerName ?? 'Unassigned'}
							</div>
							{#if m.attendees.length > 0}
								<div class="mt-0.5 text-[12px] text-ink-400">
									Attendees: {m.attendees.map((a) => a.name).join(', ')}
								</div>
							{/if}
							{#if m.outcome}
								<div class="mt-1 text-[12.5px] text-ink">{m.outcome}</div>
							{/if}
							{#if m.notes}
								<div class="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-600">{m.notes}</div>
							{/if}
							{#if m.meetingUrl}
								<a
									href={m.meetingUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-1 inline-block truncate font-mono text-[12.5px] text-blue-600 underline hover:text-blue-800"
								>
									{m.meetingUrl}
								</a>
							{/if}
						</div>
						{#if canManage(m)}
							<div class="flex shrink-0 gap-2">
								<button
									onclick={() => openEdit(m)}
									class="rounded-control border border-hairline bg-panel px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-panel-sunken"
								>
									Edit
								</button>
								<button
									disabled={mutating}
									onclick={() => remove(m)}
									class="rounded-control border border-hairline bg-panel px-2.5 py-1 text-[12px] font-medium text-red-500 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
								>
									Delete
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<MeetingFormModal
	open={modalOpen}
	{users}
	{leadId}
	{leads}
	meeting={editing}
	{saving}
	onclose={() => {
		modalOpen = false;
		editing = null;
	}}
	onsubmit={submit}
/>
