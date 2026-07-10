<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import LeadCombobox from '$lib/components/meetings/LeadCombobox.svelte';
	import OrganizerCombobox from '$lib/components/meetings/OrganizerCombobox.svelte';
	import { ComboboxFreetext } from '$lib/components/ui/combobox-freetext';
	import { fetchVenueSuggestions } from '$lib/utils/venue-suggest';
	import { FieldError, fieldErrorAttrs } from '$lib/components/ui/field-error';
	import type { Meeting, User } from '$lib/types';

	export interface MeetingFormPayload {
		leadId: string | null;
		startAt: string; // ISO
		organizerId?: string;
		leadOrganizerId?: string | null;
		meetingUrl?: string;
		venue?: string;
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
		// Lead's linked recurring-organizer (crm_organizers, GitHub #188) — the CREATE-mode
		// pre-fill source only. Never used to hydrate an existing meeting on edit.
		leadOrganizerId = undefined,
		leadOrganizerName = undefined,
		meeting = null,
		saving = false,
		onclose,
		onsubmit
	}: {
		open: boolean;
		users: User[];
		leadId?: string | null;
		leadOrganizerId?: string | null;
		leadOrganizerName?: string;
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
	// Lead's linked recurring-organizer (crm_organizers) selection for THIS meeting.
	let selectedLeadOrganizerId = $state<string | undefined>(undefined);
	// Label to seed the combobox trigger: edit → meeting's saved organizer; create → lead's.
	let leadOrganizerLabel = $state<string | undefined>(undefined);
	let meetingUrl = $state('');
	let venue = $state('');
	let notes = $state('');
	let outcome = $state('');
	let attendeeIds = $state<string[]>([]);
	// This modal has NO Zod schema (hand-rolled checks). Field keys are assigned
	// manually per check — `leadId` and `startAt` map to the two validated controls.
	// The Attendees chip-group (E4) has no natural id/for single-field pairing and
	// currently has no validation rule, so it takes no field-error key.
	let fieldErrors = $state<Record<string, string | undefined>>({});

	// Re-seed the form whenever it opens (create → blank; edit → prefilled).
	$effect(() => {
		if (!open) return;
		fieldErrors = {};
		selectedLeadId = meeting?.leadId ?? leadId ?? '';
		startLocal = toLocalInput(meeting?.startAt);
		organizerId = meeting?.organizerId ?? '';
		// Edit: hydrate from the meeting's OWN saved value so editing never overwrites a
		// previously-chosen organizer with the lead's current tag. Create: pre-fill from the
		// lead's linked organizer (GitHub #188 AC1/AC2).
		if (meeting) {
			selectedLeadOrganizerId = meeting.leadOrganizerId ?? undefined;
			leadOrganizerLabel = meeting.leadOrganizerName;
		} else {
			selectedLeadOrganizerId = leadOrganizerId ?? undefined;
			leadOrganizerLabel = leadOrganizerName;
		}
		meetingUrl = meeting?.meetingUrl ?? '';
		venue = meeting?.venue ?? '';
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
		fieldErrors = {};
		const effectiveLeadId = leadId ?? selectedLeadId;
		if (!startLocal) {
			fieldErrors = { startAt: 'Set a date and time.' };
			return;
		}
		const startAt = new Date(startLocal);
		if (isNaN(startAt.getTime())) {
			fieldErrors = { startAt: 'Invalid date/time.' };
			return;
		}
		onsubmit({
			leadId: effectiveLeadId || null,
			startAt: startAt.toISOString(),
			// On edit keep the empty-string value so unassigning is distinct from
			// "field untouched"; on create collapse empty to undefined (omit).
			organizerId: isEdit ? organizerId : organizerId || undefined,
			// null explicitly clears the linked organizer (edit) or persists "no organizer"
			// (create); a chosen id persists the link. Send null (not undefined) so the JSON
			// key survives and the DB layer applies the clear.
			leadOrganizerId: selectedLeadOrganizerId ?? null,
			meetingUrl: meetingUrl.trim() || undefined,
			venue: venue.trim() || undefined,
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
			<LeadCombobox
				mode="assign"
				bind:value={selectedLeadId}
				selectedLabel={meeting?.leadName}
				id="mtg-lead"
				{...fieldErrorAttrs('mtg-lead', fieldErrors.leadId)}
			/>
			<FieldError id="mtg-lead" errors={fieldErrors.leadId} />
		</div>
	{/if}

	<div class="mb-3.5 grid gap-1.5">
		<Label for="mtg-start">Date &amp; time</Label>
		<Input
			id="mtg-start"
			type="datetime-local"
			bind:value={startLocal}
			class="font-mono"
			{...fieldErrorAttrs('mtg-start', fieldErrors.startAt)}
		/>
		<FieldError id="mtg-start" errors={fieldErrors.startAt} />
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
		<Label for="mtg-lead-organizer">Organizer / Contact</Label>
		<OrganizerCombobox
			id="mtg-lead-organizer"
			bind:value={selectedLeadOrganizerId}
			selectedLabel={leadOrganizerLabel}
		/>
		<p class="text-[11px] text-ink-400">
			Linked from the lead's organizer. Change or clear as needed.
		</p>
	</div>

	<div class="mb-3.5 grid gap-1.5">
		<Label id="mtg-attendees-label">Attendees</Label>
		<div class="max-h-32 overflow-y-auto rounded-[8px] border border-hairline bg-panel-subtle p-2">
			<div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="mtg-attendees-label">
				{#each activeUsers as u (u.id)}
					{@const active = attendeeIds.includes(u.id)}
					<button
						type="button"
						aria-pressed={active}
						onclick={() => toggleAttendee(u.id)}
						class="focus-ring h-7 rounded-chip border px-2.5 text-[12px] {active
							? 'border-primary bg-primary/10 font-semibold text-primary'
							: 'border-hairline bg-panel font-medium text-ink-600'}"
					>
						{u.name}
					</button>
				{/each}
			</div>
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
		<Label for="mtg-venue">Venue</Label>
		<ComboboxFreetext
			id="mtg-venue"
			bind:value={venue}
			placeholder="e.g. Ayala Center Cebu"
			search={fetchVenueSuggestions}
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
