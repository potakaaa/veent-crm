<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { FieldError, fieldErrorAttrs } from '$lib/components/ui/field-error';
	import type { CalendarEntry } from '$lib/types';

	export interface EventFormPayload {
		title: string;
		start: string; // ISO datetime
		end: string; // ISO datetime
		allDay: boolean;
		location?: string;
		description?: string;
		color?: string;
		status?: string;
	}

	let {
		open,
		event = null,
		saving = false,
		serverError = '',
		onclose,
		onsubmit
	}: {
		open: boolean;
		event?: CalendarEntry | null;
		saving?: boolean;
		serverError?: string;
		onclose: () => void;
		onsubmit: (payload: EventFormPayload) => void;
	} = $props();

	// Form state
	let title = $state('');
	let start = $state('');
	let end = $state('');
	let allDay = $state(false);
	let location = $state('');
	let description = $state('');
	let color = $state('#7c3aed');
	let status = $state('');

	// Validation errors
	let errors = $state<Record<string, string>>({});

	// Seed fields when modal opens or event changes
	$effect(() => {
		if (open) {
			if (event) {
				// Edit mode — pre-populate from existing entry
				title = event.title ?? '';
				const s = event.startAt ? new Date(event.startAt) : new Date();
				start = toDatetimeLocal(s);
				const eEnd = event.endAt ? new Date(event.endAt) : new Date(s.getTime() + 60 * 60 * 1000);
				end = toDatetimeLocal(eEnd);
				allDay = event.allDay ?? false;
				location = event.location ?? '';
				description = event.description ?? '';
				color = '#7c3aed';
				status = event.status ?? '';
			} else {
				// Create mode — reset to defaults
				const now = new Date();
				const later = new Date(now.getTime() + 60 * 60 * 1000);
				title = '';
				start = toDatetimeLocal(now);
				end = toDatetimeLocal(later);
				allDay = false;
				location = '';
				description = '';
				color = '#7c3aed';
				status = '';
			}
			errors = {};
		}
	});

	function toDatetimeLocal(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function toIso(datetimeLocal: string): string {
		return new Date(datetimeLocal).toISOString();
	}

	function validate(): boolean {
		const errs: Record<string, string> = {};
		if (!title.trim()) errs.title = 'Title is required';
		if (!start) {
			errs.start = 'Start date and time is required';
		} else if (isNaN(new Date(start).getTime())) {
			errs.start = 'Start must be a valid date and time';
		}
		if (!end) {
			errs.end = 'End date and time is required';
		} else if (isNaN(new Date(end).getTime())) {
			errs.end = 'End must be a valid date and time';
		} else if (start && new Date(end) <= new Date(start)) {
			errs.end = 'End must be after start';
		}
		errors = errs;
		return Object.keys(errs).length === 0;
	}

	function handleSubmit() {
		if (!validate()) return;
		const payload: EventFormPayload = {
			title: title.trim(),
			start: toIso(start),
			end: toIso(end),
			allDay,
			location: location.trim() || undefined,
			description: description.trim() || undefined,
			color: color || undefined,
			status: status || undefined
		};
		onsubmit(payload);
	}

	function handleAllDayToggle() {
		if (allDay && start) {
			const d = new Date(start);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			start = `${dateStr}T00:00`;
			end = `${dateStr}T23:59`;
		}
	}

	const isEditMode = $derived(event != null);
</script>

<Modal
	{open}
	title={isEditMode ? 'Edit Event' : 'Create Event'}
	subtitle={isEditMode ? 'Update calendar event details.' : 'Add a new event to the team calendar.'}
	{onclose}
>
	<div class="space-y-4">
		<!-- Title -->
		<div class="space-y-1.5">
			<Label for="event-title">Title <span class="text-destructive">*</span></Label>
			<Input
				id="event-title"
				bind:value={title}
				placeholder="Event title"
				disabled={saving}
				{...fieldErrorAttrs('event-title-error', errors.title)}
			/>
			<FieldError id="event-title-error" errors={errors.title} />
		</div>

		<!-- All-day toggle -->
		<div class="flex items-center gap-2">
			<input
				id="event-allday"
				type="checkbox"
				bind:checked={allDay}
				onchange={handleAllDayToggle}
				disabled={saving}
				class="h-4 w-4 rounded border-border"
			/>
			<Label for="event-allday" class="cursor-pointer text-[13px] font-normal">All day</Label>
		</div>

		<!-- Start -->
		<div class="space-y-1.5">
			<Label for="event-start">Start <span class="text-destructive">*</span></Label>
			{#if allDay}
				<Input
					id="event-start"
					type="date"
					value={start.slice(0, 10)}
					oninput={(e) => {
						start = `${e.currentTarget.value}T00:00`;
					}}
					disabled={saving}
					{...fieldErrorAttrs('event-start-error', errors.start)}
				/>
			{:else}
				<Input
					id="event-start"
					type="datetime-local"
					bind:value={start}
					disabled={saving}
					{...fieldErrorAttrs('event-start-error', errors.start)}
				/>
			{/if}
			<FieldError id="event-start-error" errors={errors.start} />
		</div>

		<!-- End -->
		<div class="space-y-1.5">
			<Label for="event-end">End <span class="text-destructive">*</span></Label>
			{#if allDay}
				<Input
					id="event-end"
					type="date"
					value={end.slice(0, 10)}
					oninput={(e) => {
						end = `${e.currentTarget.value}T23:59`;
					}}
					disabled={saving}
					{...fieldErrorAttrs('event-end-error', errors.end)}
				/>
			{:else}
				<Input
					id="event-end"
					type="datetime-local"
					bind:value={end}
					disabled={saving}
					{...fieldErrorAttrs('event-end-error', errors.end)}
				/>
			{/if}
			<FieldError id="event-end-error" errors={errors.end} />
		</div>

		<!-- Location -->
		<div class="space-y-1.5">
			<Label for="event-location">Location</Label>
			<Input
				id="event-location"
				bind:value={location}
				placeholder="Optional location"
				disabled={saving}
			/>
		</div>

		<!-- Description -->
		<div class="space-y-1.5">
			<Label for="event-description">Description</Label>
			<Textarea
				id="event-description"
				bind:value={description}
				placeholder="Optional description"
				disabled={saving}
				class="min-h-[80px]"
			/>
			<p class="text-[11.5px] text-ink-400">
				Note: some fields may not appear in all calendar clients.
			</p>
		</div>

		<!-- Color -->
		<div class="space-y-1.5">
			<Label for="event-color">Color</Label>
			<div class="flex items-center gap-2">
				<input
					id="event-color"
					type="color"
					bind:value={color}
					disabled={saving}
					class="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
				/>
				<span class="text-[12px] text-ink-400">May not sync to all calendar clients.</span>
			</div>
		</div>

		<!-- Status -->
		<div class="space-y-1.5">
			<Label for="event-status">Status</Label>
			<Select type="single" value={status || undefined} onValueChange={(v) => (status = v ?? '')}>
				<SelectTrigger id="event-status" disabled={saving}>
					{status ? status.charAt(0).toUpperCase() + status.slice(1) : 'None'}
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="confirmed">Confirmed</SelectItem>
					<SelectItem value="tentative">Tentative</SelectItem>
					<SelectItem value="cancelled">Cancelled</SelectItem>
				</SelectContent>
			</Select>
		</div>
	</div>

	{#snippet footer()}
		{#if serverError}
			<p class="mr-auto text-[12px] text-destructive">{serverError}</p>
		{/if}
		<Button variant="outline" onclick={onclose} disabled={saving}>Cancel</Button>
		<Button onclick={handleSubmit} disabled={saving}>
			{#if saving}Saving…{:else}{isEditMode ? 'Save changes' : 'Create event'}{/if}
		</Button>
	{/snippet}
</Modal>
