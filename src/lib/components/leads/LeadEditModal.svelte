<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { ComboboxFreetext } from '$lib/components/ui/combobox-freetext';
	import { fetchOrganizerNames } from '$lib/utils/organizer-suggest';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatEventDate } from '$lib/utils/dates';
	import { leadUpdateSchema, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import { parseDate, type DateValue } from '@internationalized/date';
	import type { Lead } from '$lib/types';

	let {
		open,
		lead,
		saving = false,
		onclose,
		onsave,
		onresolve
	}: {
		open: boolean;
		lead: Lead;
		saving?: boolean;
		onclose: () => void;
		onsave: (data: Record<string, unknown>) => void;
		onresolve?: (data: Record<string, unknown>) => void;
	} = $props();

	let name = $state('');
	let platform = $state('');
	let location = $state('');
	let pageUrl = $state('');
	let email = $state('');
	let phone = $state('');
	let socialFacebook = $state('');
	let socialInstagram = $state('');
	let eventName = $state('');
	let eventLink = $state('');
	let notes = $state('');
	let hasFutureEvents = $state(false);
	let selectedDate = $state<DateValue | undefined>(undefined);
	let dateOpen = $state(false);
	let tempDate = $state<DateValue | undefined>(undefined);
	let formError = $state('');

	// Reset form to lead data whenever the modal opens.
	$effect(() => {
		if (open) {
			name = lead.name;
			platform = lead.platform ?? '';
			location = lead.location === '—' ? '' : (lead.location ?? '');
			pageUrl = lead.pageUrl ?? '';
			email = lead.email ?? '';
			phone = lead.phone ?? '';
			socialFacebook = lead.socialFacebook ?? '';
			socialInstagram = lead.socialInstagram ?? '';
			eventName = lead.eventName ?? '';
			eventLink = lead.eventLink ?? '';
			notes = lead.notes ?? '';
			hasFutureEvents = lead.hasFutureEvents ?? false;
			selectedDate = lead.eventDate ? parseDate(lead.eventDate) : undefined;
			formError = '';
		}
	});

	$effect(() => {
		if (dateOpen) tempDate = selectedDate;
	});

	const eventDateDisplay = $derived(selectedDate ? formatEventDate(selectedDate) : '');

	function buildPayload() {
		return leadUpdateSchema.safeParse({
			name,
			platform: platform || undefined,
			location: location || undefined,
			pageUrl: pageUrl || '',
			contactEmail: email || '',
			phone: phone || undefined,
			socialFacebook: socialFacebook || '',
			socialInstagram: socialInstagram || '',
			eventName: eventName || undefined,
			eventDate: selectedDate ? selectedDate.toString() : undefined,
			eventDateRaw: eventDateDisplay || undefined,
			eventLink: eventLink || '',
			notes: notes || undefined,
			hasFutureEvents
		});
	}

	function handleSave() {
		const parsed = buildPayload();
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Please check the form.';
			return;
		}
		formError = '';
		onsave(parsed.data);
	}

	function handleResolve() {
		const parsed = buildPayload();
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Please check the form.';
			return;
		}
		formError = '';
		onresolve?.(parsed.data);
	}
</script>

<Modal {open} {onclose} title="Edit lead" subtitle={lead.name} width={620}>
	<div class="max-h-[60vh] overflow-y-auto pr-1">
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="el-name">Page / organizer name</Label>
				<ComboboxFreetext
					id="el-name"
					bind:value={name}
					search={fetchOrganizerNames}
					placeholder="e.g. Christian Concerts PH"
				/>
			</div>
			<div class="grid gap-1.5">
				<Label for="el-platform">Platform</Label>
				<Select type="single" bind:value={platform}>
					<SelectTrigger id="el-platform" class="w-full"
						>{platform || 'Select platform'}</SelectTrigger
					>
					<SelectContent>
						{#each LEAD_PLATFORMS as p (p)}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
					</SelectContent>
				</Select>
			</div>
			<div class="grid gap-1.5">
				<Label for="el-location">Location</Label>
				<Input id="el-location" bind:value={location} placeholder="Manila" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-email">Contact email</Label>
				<Input id="el-email" bind:value={email} placeholder="hello@page.ph" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-phone">Phone</Label>
				<Input id="el-phone" bind:value={phone} placeholder="+63 917 000 0000" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-pageUrl">Page URL</Label>
				<Input id="el-pageUrl" bind:value={pageUrl} placeholder="https://facebook.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-fb">Facebook</Label>
				<Input id="el-fb" bind:value={socialFacebook} placeholder="https://facebook.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-ig">Instagram</Label>
				<Input id="el-ig" bind:value={socialInstagram} placeholder="https://instagram.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-eventName">Event name</Label>
				<Input id="el-eventName" bind:value={eventName} placeholder="Worship Night Vol. 4" />
			</div>
			<div class="grid gap-1.5">
				<Label for="el-eventLink">Event link</Label>
				<Input id="el-eventLink" bind:value={eventLink} placeholder="https://…" />
			</div>
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="el-eventDate">Event date</Label>
				<Dialog.Root bind:open={dateOpen}>
					<Dialog.Trigger
						id="el-eventDate"
						class="flex h-9 w-full items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!eventDateDisplay
							? 'text-ink-400'
							: 'text-ink'}"
					>
						{eventDateDisplay || 'Pick a date'}
					</Dialog.Trigger>
					<Dialog.Content class="w-[min(92vw,400px)] gap-0 p-5" showCloseButton={false}>
						<Dialog.Header class="mb-3 p-0">
							<Dialog.Title>Select event date</Dialog.Title>
						</Dialog.Header>
						<div class="rounded-xl bg-panel-sunken p-3">
							<Calendar
								type="single"
								bind:value={tempDate}
								class="w-full [--cell-size:--spacing(9)]"
							/>
						</div>
						<div class="mt-4 flex justify-end gap-2">
							<Dialog.Close
								class="rounded-control border border-hairline bg-panel px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-panel-sunken"
							>
								Cancel
							</Dialog.Close>
							<button
								onclick={() => {
									selectedDate = tempDate;
									dateOpen = false;
								}}
								class="rounded-control bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
							>
								Done
							</button>
						</div>
					</Dialog.Content>
				</Dialog.Root>
			</div>
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="el-notes">Notes</Label>
				<Textarea id="el-notes" bind:value={notes} placeholder="Anything worth noting…" rows={3} />
			</div>
			<div class="sm:col-span-2">
				<label class="flex items-center gap-2 text-[13px] font-medium text-ink">
					<input type="checkbox" bind:checked={hasFutureEvents} class="size-4" />
					Has future events (recurring organizer)
				</label>
			</div>
			{#if formError}
				<p class="text-[12.5px] text-overdue sm:col-span-2">{formError}</p>
			{/if}
		</div>
	</div>

	{#snippet footer()}
		<Button variant="outline" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button variant="outline" onclick={handleSave} disabled={saving || !name}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
		{#if onresolve}
			<Button onclick={handleResolve} disabled={saving || !name}>
				{saving ? 'Saving…' : 'Resolve'}
			</Button>
		{/if}
	{/snippet}
</Modal>
