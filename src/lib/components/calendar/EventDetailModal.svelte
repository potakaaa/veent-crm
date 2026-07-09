<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';
	import LeadCombobox from '$lib/components/meetings/LeadCombobox.svelte';
	import type { CalendarEntry } from '$lib/types';

	let {
		open,
		event,
		saving = false,
		serverError = '',
		onclose,
		onedit,
		ondelete,
		onlink
	}: {
		open: boolean;
		event: CalendarEntry | null;
		saving?: boolean;
		serverError?: string;
		onclose: () => void;
		onedit: () => void;
		ondelete: (uid: string) => void;
		onlink: (uid: string, leadId: string, startAt: string) => void;
	} = $props();

	let confirmingDelete = $state(false);
	let selectedLeadId = $state<string | undefined>(undefined);
	let linkError = $state('');

	// Reset per-open state
	$effect(() => {
		if (open) {
			confirmingDelete = false;
			selectedLeadId = undefined;
			linkError = '';
		}
	});

	function formatDateTime(iso: string): string {
		try {
			return new Date(iso).toLocaleString('en-PH', {
				weekday: 'short',
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function handleDeleteClick() {
		confirmingDelete = true;
	}

	function handleDeleteConfirm() {
		if (event?.uid) {
			ondelete(event.uid);
		}
	}

	function handleLink() {
		if (!selectedLeadId) {
			linkError = 'Please select a lead to convert this event.';
			return;
		}
		if (!event?.uid) return;
		linkError = '';
		onlink(event.uid, selectedLeadId, event.startAt);
	}

	const hasLinkedLead = $derived(!!event?.url);

	// Extract lead ID from URL path like /leads/<uuid>
	const linkedLeadId = $derived(() => {
		if (!event?.url) return null;
		const match = event.url.match(/\/leads\/([^/]+)$/);
		return match ? match[1] : null;
	});
</script>

<Modal {open} title={event?.title ?? 'Team Event'} {onclose} width={500}>
	{#if event}
		<div class="space-y-4">
			<!-- Date/time -->
			<div>
				<p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">Date & Time</p>
				<p class="mt-0.5 text-[13.5px] text-ink">{formatDateTime(event.startAt)}</p>
			</div>

			<!-- Location -->
			{#if event.location}
				<div>
					<p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">Location</p>
					<p class="mt-0.5 text-[13.5px] text-ink">{event.location}</p>
				</div>
			{/if}

			<!-- Description -->
			{#if event.description}
				<div>
					<p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">Description</p>
					<p class="mt-0.5 whitespace-pre-wrap text-[13.5px] text-ink">{event.description}</p>
				</div>
			{/if}

			<!-- Status -->
			{#if event.status}
				<div>
					<p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">Status</p>
					<p class="mt-0.5 text-[13.5px] capitalize text-ink">{event.status}</p>
				</div>
			{/if}

			<!-- Linked lead -->
			{#if hasLinkedLead}
				<div>
					<p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">Linked Lead</p>
					<p class="mt-0.5 text-[13.5px] text-ink">
						{#if linkedLeadId()}
							<a
								href="/leads/{linkedLeadId()}"
								class="text-blue-600 underline hover:text-blue-800"
								onclick={onclose}
							>
								View lead →
							</a>
						{:else}
							<span class="text-ink-400">Linked</span>
						{/if}
					</p>
				</div>
			{:else}
				<!-- Link-to-lead section -->
				<div class="rounded-lg border border-border bg-panel-sunken p-3.5">
					<p class="mb-2.5 text-[12.5px] font-medium text-ink">Convert to CRM Meeting</p>
					<p class="mb-3 text-[12px] text-ink-400">
						Link this event to a lead to convert it into a CRM meeting. It will appear in the lead's
						timeline and meeting history.
					</p>
					<div class="flex items-center gap-2">
						<LeadCombobox mode="assign" bind:value={selectedLeadId} disabled={saving} />
						<Button onclick={handleLink} disabled={saving || !selectedLeadId} class="shrink-0">
							{saving ? 'Converting…' : 'Convert'}
						</Button>
					</div>
					{#if linkError}
						<p class="mt-1.5 text-[12px] text-destructive">{linkError}</p>
					{/if}
				</div>
			{/if}

			<!-- Delete confirmation inline -->
			{#if confirmingDelete}
				<div class="rounded-lg border border-destructive/20 bg-destructive/5 p-3.5">
					<p class="mb-2.5 text-[13px] font-medium text-destructive">Delete this event?</p>
					<p class="mb-3 text-[12.5px] text-ink-400">
						This will permanently delete the calendar event from Nextcloud. This action cannot be
						undone.
					</p>
					<div class="flex gap-2">
						<Button variant="destructive" onclick={handleDeleteConfirm} disabled={saving}>
							{saving ? 'Deleting…' : 'Confirm delete'}
						</Button>
						<Button variant="outline" onclick={() => (confirmingDelete = false)} disabled={saving}>
							Cancel
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<p class="text-[13px] text-ink-400">No event selected.</p>
	{/if}

	{#snippet footer()}
		{#if serverError}
			<p class="mr-auto text-[12px] text-destructive">{serverError}</p>
		{/if}
		{#if !confirmingDelete}
			<Button variant="outline" onclick={onclose} disabled={saving}>Close</Button>
			<Button variant="outline" onclick={onedit} disabled={saving}>Edit</Button>
			<Button variant="destructive" onclick={handleDeleteClick} disabled={saving}>Delete</Button>
		{/if}
	{/snippet}
</Modal>
