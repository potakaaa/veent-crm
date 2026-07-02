<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import LeadCombobox from '$lib/components/meetings/LeadCombobox.svelte';
	import type { Meeting, User } from '$lib/types';

	export interface MeetingFormPayload {
		leadId: string;
		startAt: string; // ISO
		organizerId?: string;
		meetingUrl?: string;
		notes?: string;
		outcome?: string;
		attendeeIds: string[];
	}

	let {
		open,
		users,
		// Single-lead mode: leadId fixed, no lead selector. Cross-lead/create mode: leadId omitted;
		// the lead is chosen via LeadCombobox (assign mode) backed by GET /api/leads.
		leadId = undefined,
		meeting = null,
		saving = false,
		onclose,
		onsubmit
	}: {
		open: boolean;
		users: User[];
		leadId?: string;
		meeting?: Meeting | null;
		saving?: boolean;
		onclose: () => void;
		onsubmit: (payload: MeetingFormPayload) => void;
	} = $props();

	const isEdit = $derived(meeting != null);

	// Convert an ISO string to a value the datetime-local input accepts (local time).
	function toLocalInput(iso: string | undefined): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let selectedLeadId = $state('');
	let startLocal = $state('');
	let organizerId = $state('');
	let meetingUrl = $state('');
	let notes = $state('');
	let outcome = $state('');
	let attendeeIds = $state<string[]>([]);
	let errorMsg = $state('');

	// Re-seed the form whenever it opens (create → blank; edit → prefilled).
	$effect(() => {
		if (!open) return;
		errorMsg = '';
		selectedLeadId = meeting?.leadId ?? leadId ?? '';
		startLocal = toLocalInput(meeting?.startAt);
		organizerId = meeting?.organizerId ?? '';
		meetingUrl = meeting?.meetingUrl ?? '';
		notes = meeting?.notes ?? '';
		outcome = meeting?.outcome ?? '';
		attendeeIds = meeting?.attendees.map((a) => a.userId) ?? [];
	});

	const activeUsers = $derived(users.filter((u) => u.active));
	const organizerName = $derived(users.find((u) => u.id === organizerId)?.name ?? 'Unassigned');

	function toggleAttendee(id: string) {
		attendeeIds = attendeeIds.includes(id)
			? attendeeIds.filter((a) => a !== id)
			: [...attendeeIds, id];
	}

	function submit() {
		errorMsg = '';
		const effectiveLeadId = leadId ?? selectedLeadId;
		if (!effectiveLeadId) {
			errorMsg = 'Pick a lead for this meeting.';
			return;
		}
		if (!startLocal) {
			errorMsg = 'Set a date and time.';
			return;
		}
		const startAt = new Date(startLocal);
		if (isNaN(startAt.getTime())) {
			errorMsg = 'Invalid date/time.';
			return;
		}
		onsubmit({
			leadId: effectiveLeadId,
			startAt: startAt.toISOString(),
			// On edit keep the empty-string value so unassigning is distinct from
			// "field untouched"; on create collapse empty to undefined (omit).
			organizerId: isEdit ? organizerId : organizerId || undefined,
			meetingUrl: meetingUrl.trim() || undefined,
			notes: notes.trim() || undefined,
			outcome: outcome.trim() || undefined,
			attendeeIds
		});
	}
</script>

<Modal
	{open}
	{onclose}
	title={isEdit ? 'Edit meeting' : 'New meeting'}
	subtitle={isEdit ? undefined : 'Log a meeting with this lead'}
	width={520}
>
	{#if !leadId}
		<div class="mb-3.5 grid gap-1.5">
			<Label for="mtg-lead">Lead</Label>
			<LeadCombobox mode="assign" bind:value={selectedLeadId} />
		</div>
	{/if}

	<div class="mb-3.5 grid gap-1.5">
		<Label for="mtg-start">Date &amp; time</Label>
		<Input id="mtg-start" type="datetime-local" bind:value={startLocal} class="font-mono" />
	</div>

	<div class="mb-3.5 grid gap-1.5">
		<Label for="mtg-organizer">Organizer</Label>
		<Select type="single" bind:value={organizerId}>
			<SelectTrigger id="mtg-organizer" class="w-full">{organizerName}</SelectTrigger>
			<SelectContent>
				<SelectItem value="" label="Unassigned">Unassigned</SelectItem>
				{#each activeUsers as u (u.id)}
					<SelectItem value={u.id} label={u.name}>{u.name}</SelectItem>
				{/each}
			</SelectContent>
		</Select>
	</div>

	<div class="mb-3.5 grid gap-1.5">
		<Label>Attendees</Label>
		<div class="flex flex-wrap gap-1.5">
			{#each activeUsers as u (u.id)}
				{@const active = attendeeIds.includes(u.id)}
				<button
					type="button"
					onclick={() => toggleAttendee(u.id)}
					class="h-7 rounded-[7px] border px-2.5 text-[12px] {active
						? 'border-primary bg-[rgba(192,54,44,0.08)] font-semibold text-primary'
						: 'border-hairline bg-panel font-medium text-ink-600'}"
				>
					{u.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="mb-3.5 grid gap-1.5">
		<Label for="mtg-url">Meeting URL</Label>
		<Input
			id="mtg-url"
			bind:value={meetingUrl}
			placeholder="https://meet.google.com/…"
			class="font-mono"
		/>
	</div>

	<div class="mb-3.5 grid gap-1.5">
		<Label for="mtg-outcome">Outcome</Label>
		<Input id="mtg-outcome" bind:value={outcome} placeholder="e.g. Agreed to a follow-up demo" />
	</div>

	<div class="grid gap-1.5">
		<Label for="mtg-notes">Notes</Label>
		<Textarea id="mtg-notes" bind:value={notes} class="min-h-16 resize-y" />
	</div>

	{#if errorMsg}
		<div class="mt-3 text-[12px] text-red-500">{errorMsg}</div>
	{/if}

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button
			class="flex-[2]"
			onclick={submit}
			loading={saving}
			loadingText="Saving…"
			disabled={saving}
		>
			{isEdit ? 'Save changes' : 'Create meeting'}
		</Button>
	{/snippet}
</Modal>
