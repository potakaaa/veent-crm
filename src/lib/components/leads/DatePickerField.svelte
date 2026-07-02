<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Dialog from '$lib/components/ui/dialog';
	import Icon from '$lib/components/shared/Icon.svelte';
	import {
		FieldError,
		fieldErrorAttrs,
		type FieldErrorValue
	} from '$lib/components/ui/field-error';
	import { formatEventDate } from '$lib/utils/dates';
	import type { DateValue } from '@internationalized/date';

	/**
	 * Single parameterised date-picker field. Replaces the 3x-duplicated ~90-line
	 * Dialog+Calendar block in `leads/new/+page.svelte` (event date, first announced,
	 * first reached out) with one component. Phase 2 — sitewide-ux-refresh, Step C1.
	 *
	 * Only the label text, dialog title, target state, and required/optional marker
	 * differed between the three instances — all captured as props here. Behaviour is
	 * preserved exactly: a temp value is committed to `value` only on "Done", and
	 * reset to the current `value` each time the dialog opens.
	 */
	let {
		id,
		label,
		title,
		value = $bindable(),
		required = false,
		fullWidth = false,
		errors = undefined
	}: {
		id: string;
		label: string;
		/** Dialog heading shown above the calendar. */
		title: string;
		value: DateValue | undefined;
		/** Renders a red `*` marker instead of the grey `(optional)` marker. */
		required?: boolean;
		/** Spans both columns of the parent 2-col form grid (`sm:col-span-2`). */
		fullWidth?: boolean;
		/**
		 * Optional per-field validation errors (Phase 4 wiring). When present, the
		 * trigger gains `aria-invalid`/`aria-describedby` + the invalid ring styling,
		 * and a `<FieldError>` message renders below. Undefined = no error surface.
		 */
		errors?: FieldErrorValue;
	} = $props();

	let open = $state(false);
	let temp = $state<DateValue | undefined>(undefined);
	const display = $derived(value ? formatEventDate(value) : '');

	$effect(() => {
		if (open) temp = value;
	});
</script>

<div class="grid gap-1.5 {fullWidth ? 'sm:col-span-2' : ''}">
	<Label for={id}>
		{label}
		{#if required}
			<span class="text-red-500">*</span>
		{:else}
			<span class="text-ink-400">(optional)</span>
		{/if}
	</Label>
	<Dialog.Root bind:open>
		<Dialog.Trigger
			{id}
			{...fieldErrorAttrs(id, errors)}
			class="flex h-9 w-full items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary aria-invalid:border-overdue aria-invalid:ring-1 aria-invalid:ring-[var(--color-focus-ring)] {!display
				? 'text-ink-400'
				: 'text-ink'}"
		>
			{display || 'Pick a date'}
			<Icon name="calendar" size={15} />
		</Dialog.Trigger>
		<Dialog.Content class="w-[min(92vw,400px)] gap-0 p-5" showCloseButton={false}>
			<Dialog.Header class="mb-3 p-0">
				<Dialog.Title>{title}</Dialog.Title>
			</Dialog.Header>
			<div class="rounded-xl bg-panel-sunken p-3">
				<Calendar type="single" bind:value={temp} class="w-full [--cell-size:--spacing(9)]" />
			</div>
			<div class="mt-4 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-control border border-hairline bg-panel px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-panel-sunken"
				>
					Cancel
				</Dialog.Close>
				<button
					onclick={() => {
						value = temp;
						open = false;
					}}
					class="rounded-control bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
				>
					Done
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
	<FieldError {id} {errors} />
</div>
