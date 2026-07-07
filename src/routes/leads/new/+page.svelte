<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { FieldError, fieldErrorAttrs } from '$lib/components/ui/field-error';
	import { ComboboxFreetext } from '$lib/components/ui/combobox-freetext';
	import { fetchOrganizerNames } from '$lib/utils/organizer-suggest';
	import * as Popover from '$lib/components/ui/popover';
	import OrganizerHoverCard from '$lib/components/OrganizerHoverCard.svelte';
	import DatePickerField from '$lib/components/leads/DatePickerField.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { hasPotentialDuplicate } from '$lib/utils/dedup';
	import { createHoverPopover } from '$lib/utils/hover-popover.svelte';
	import { ownerNameFor } from '$lib/utils/owner';
	import { formatEventDate } from '$lib/utils/dates';
	import { leadFormSchema, LEAD_PLATFORMS, LOOSE_UUID_RE } from '$lib/zod/schemas';
	import type { DateValue } from '@internationalized/date';

	let { data } = $props();

	// Add Event pre-fill (GitHub #190): read `?organizerId=` from the URL client-side and
	// keep it only when it is UUID-shaped. Existence is enforced server-side in the POST
	// handler; a missing/malformed param is silently ignored (form loads normally, no error UI).
	const prefillOrganizerId = $derived.by(() => {
		const raw = page.url.searchParams.get('organizerId');
		return raw && LOOSE_UUID_RE.test(raw) ? raw : undefined;
	});

	// Add Event pre-fill (GitHub #190): seed the organizer name from `?name=` when present.
	// URLSearchParams.get() already decodes; a missing/empty param falls back to '' (no error UI).
	let name = $state(page.url.searchParams.get('name') ?? '');
	let platform = $state<string>('');
	let location = $state('');
	let pageUrl = $state('');
	let email = $state('');
	let eventName = $state('');
	let eventLink = $state('');
	let notes = $state('');
	let currentPlatform = $state('');
	let visibility = $state<'only_me' | 'everyone' | 'selected'>('everyone');
	let selectedUserIds = $state<string[]>([]);

	const VISIBILITY_LABELS: Record<string, string> = {
		only_me: 'Only me',
		everyone: 'Everyone',
		selected: 'Selected people'
	};
	// Teammates who can be granted access — active users.
	const grantableUsers = $derived(data.users.filter((u) => u.active));
	function toggleGrant(id: string) {
		selectedUserIds = selectedUserIds.includes(id)
			? selectedUserIds.filter((x) => x !== id)
			: [...selectedUserIds, id];
	}
	// Date-picker values. The open/temp state, dialog, and calendar markup now live
	// inside the shared `DatePickerField` component (Phase 2 — Step C1).
	let selectedDate = $state<DateValue | undefined>(undefined);
	let announcedDate = $state<DateValue | undefined>(undefined);
	let reachedOutDate = $state<DateValue | undefined>(undefined);
	// Per-field validation errors, keyed by field name (matches leadFormSchema keys +
	// the manual `eventDateRaw` required check). Populated from
	// `parsed.error.flatten().fieldErrors` so each field surfaces its own message with
	// aria-invalid/aria-describedby (Phase 4). `submitError` holds transport/server-level
	// failures that are not tied to a single field.
	let fieldErrors = $state<Record<string, string[] | undefined>>({});
	let submitError = $state('');
	let saving = $state(false);

	// Still needed for the manual `eventDateRaw` value submitted to the schema.
	const eventDateDisplay = $derived(selectedDate ? formatEventDate(selectedDate) : '');

	// Advisory only — duplicates are surfaced but never block "Create anyway".
	const dupes = $derived(name.length > 1 ? hasPotentialDuplicate({ name }, data.leads) : []);

	// Hover/focus-controlled duplicate detail card. The 200ms grace-period close
	// timer + handlers now live in the shared `createHoverPopover` hook (Phase 2 —
	// Step C2), keeping the card from flicker-closing as the pointer travels from
	// the row into the card content.
	const dupeHover = createHoverPopover();

	async function create() {
		if (saving) return; // duplicate-submit guard
		if (!selectedDate) {
			fieldErrors = { eventDateRaw: ['Event date is required.'] };
			submitError = '';
			return;
		}
		const parsed = leadFormSchema.safeParse({
			name,
			platform: platform || undefined,
			location: location || undefined,
			pageUrl: pageUrl || '',
			contactEmail: email || '',
			eventName: eventName || undefined,
			eventLink: eventLink || '',
			eventDateRaw: eventDateDisplay || undefined,
			firstAnnouncedDate: announcedDate ? announcedDate.toString() : undefined,
			firstReachedOutDate: reachedOutDate ? reachedOutDate.toString() : undefined,
			notes: notes.trim() || undefined,
			currentPlatform: currentPlatform.trim() || undefined,
			visibility,
			selectedUserIds: visibility === 'selected' ? selectedUserIds : undefined,
			organizerId: prefillOrganizerId
		});
		if (!parsed.success) {
			// Per-field errors from Zod's flatten(); each field renders its own message.
			fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
			submitError = '';
			return;
		}
		fieldErrors = {};
		submitError = '';
		saving = true;
		try {
			const res = await fetch('/api/leads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data)
			});
			if (!res.ok) {
				submitError = (await res.text().catch(() => '')) || 'Could not create lead.';
				return;
			}
			const { id, name: leadName } = (await res.json()) as { id: string; name: string };
			toasts.success(`Created ${leadName}`);
			await goto(`/leads/${id}`);
		} catch {
			submitError = 'Could not create lead. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New lead · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[680px] px-7 pb-16 pt-6">
	<a
		href="/leads"
		class="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} stroke={2} /> Back to leads
	</a>
	<PageHeader title="New lead" />

	{#if dupes.length}
		<div class="mb-4 rounded-control border border-stale/30 bg-[rgba(194,113,12,0.08)] p-3">
			<div class="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#92560b]">
				<Icon name="alert" size={14} stroke={2} /> Possible duplicate — review before creating (you can
				still create anyway).
			</div>
			{#each dupes as d (d.id)}
				<Popover.Root
					open={dupeHover.openId === d.id}
					onOpenChange={(open) => {
						if (!open) dupeHover.closeNow();
					}}
				>
					<Popover.Trigger>
						{#snippet child({ props })}
							<div
								{...props}
								tabindex="0"
								role="button"
								aria-haspopup="dialog"
								class="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
								onmouseenter={() => dupeHover.open(d.id)}
								onmouseleave={dupeHover.scheduleClose}
								onfocus={() => dupeHover.open(d.id)}
								onblur={dupeHover.scheduleClose}
								onkeydown={dupeHover.handleEscape}
							>
								<PlatformBadge platform={d.platform} />
								<span class="flex-1 text-[13px] font-semibold">{d.name}</span>
								<span class="font-mono text-[11px] text-ink-400">{d.handle}</span>
								<StageChip stage={d.stage} />
							</div>
						{/snippet}
					</Popover.Trigger>
					<Popover.Portal>
						<Popover.Content
							side="right"
							onmouseenter={() => dupeHover.open(d.id)}
							onmouseleave={dupeHover.scheduleClose}
							onkeydown={dupeHover.handleEscape}
						>
							<OrganizerHoverCard lead={d} ownerName={ownerNameFor(data.users, d.ownerId)} />
						</Popover.Content>
					</Popover.Portal>
				</Popover.Root>
			{/each}
		</div>
	{/if}

	<Card class="rounded-control py-5">
		<CardContent class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="name">Page / organizer name</Label>
				<ComboboxFreetext
					id="name"
					bind:value={name}
					search={fetchOrganizerNames}
					placeholder="e.g. Christian Concerts PH"
					{...fieldErrorAttrs('name', fieldErrors.name)}
				/>
				<FieldError id="name" errors={fieldErrors.name} />
			</div>
			<div class="grid gap-1.5">
				<Label for="platform">Platform <span class="text-ink-400">(optional)</span></Label>
				<Select type="single" bind:value={platform}>
					<SelectTrigger id="platform" class="w-full">{platform || 'Select platform'}</SelectTrigger
					>
					<SelectContent>
						{#each LEAD_PLATFORMS as p (p)}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
					</SelectContent>
				</Select>
			</div>
			<div class="grid gap-1.5">
				<Label for="location">Location <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="location"
					bind:value={location}
					placeholder="Manila"
					{...fieldErrorAttrs('location', fieldErrors.location)}
				/>
				<FieldError id="location" errors={fieldErrors.location} />
			</div>
			<div class="grid gap-1.5">
				<Label for="email">Contact email <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="email"
					bind:value={email}
					placeholder="hello@page.ph"
					{...fieldErrorAttrs('email', fieldErrors.contactEmail)}
				/>
				<FieldError id="email" errors={fieldErrors.contactEmail} />
			</div>
			<div class="grid gap-1.5">
				<Label for="pageUrl">Page URL <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="pageUrl"
					bind:value={pageUrl}
					placeholder="https://facebook.com/…"
					{...fieldErrorAttrs('pageUrl', fieldErrors.pageUrl)}
				/>
				<FieldError id="pageUrl" errors={fieldErrors.pageUrl} />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventName">Event name <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="eventName"
					bind:value={eventName}
					placeholder="Worship Night Vol. 4"
					{...fieldErrorAttrs('eventName', fieldErrors.eventName)}
				/>
				<FieldError id="eventName" errors={fieldErrors.eventName} />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventLink">Event link <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="eventLink"
					bind:value={eventLink}
					placeholder="https://facebook.com/events/…"
					{...fieldErrorAttrs('eventLink', fieldErrors.eventLink)}
				/>
				<FieldError id="eventLink" errors={fieldErrors.eventLink} />
			</div>
			<DatePickerField
				id="eventDate"
				label="Event date"
				title="Select event date"
				bind:value={selectedDate}
				required
				fullWidth
				errors={fieldErrors.eventDateRaw}
			/>

			<DatePickerField
				id="firstAnnouncedDate"
				label="First announced"
				title="First announced date"
				bind:value={announcedDate}
			/>

			<DatePickerField
				id="firstReachedOutDate"
				label="First reached out"
				title="First reached out date"
				bind:value={reachedOutDate}
			/>

			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="visibility">Visibility</Label>
				<Select type="single" bind:value={visibility}>
					<SelectTrigger id="visibility" class="w-full">
						{VISIBILITY_LABELS[visibility]}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="only_me" label="Only me">Only me</SelectItem>
						<SelectItem value="everyone" label="Everyone">Everyone</SelectItem>
						<SelectItem value="selected" label="Selected people">Selected people</SelectItem>
					</SelectContent>
				</Select>
				{#if visibility === 'selected'}
					<div class="mt-1 rounded-control border border-hairline bg-panel-sunken p-3">
						<p class="mb-2 text-[12px] text-ink-400">
							Pick who else can see this lead. Managers always see everything.
						</p>
						<div class="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
							{#each grantableUsers as u (u.id)}
								<label class="flex items-center gap-2 rounded-[7px] px-2 py-1.5 hover:bg-panel">
									<input
										type="checkbox"
										checked={selectedUserIds.includes(u.id)}
										onchange={() => toggleGrant(u.id)}
									/>
									<span class="text-[13px]">{u.name}</span>
								</label>
							{/each}
						</div>
						{#if grantableUsers.length === 0}
							<p class="text-[12px] text-ink-400">No teammates available to grant.</p>
						{/if}
					</div>
					<FieldError id="visibility" errors={fieldErrors.selectedUserIds} />
				{/if}
			</div>

			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="notes">Notes <span class="text-ink-400">(optional)</span></Label>
				<Textarea
					id="notes"
					bind:value={notes}
					placeholder="Anything worth noting about this lead…"
					class="min-h-[72px] resize-y"
				/>
			</div>

			<div class="grid gap-1.5">
				<Label for="current-platform"
					>Current platform <span class="text-ink-400">(optional)</span></Label
				>
				<Input
					id="current-platform"
					bind:value={currentPlatform}
					placeholder="e.g. Ticketbase, Eventbrite…"
				/>
			</div>

			{#if submitError}<p class="text-[12.5px] font-medium text-overdue sm:col-span-2">
					{submitError}
				</p>{/if}

			<div class="flex items-center justify-end gap-2.5 sm:col-span-2">
				<Button variant="outline" href="/leads">Cancel</Button>
				<Button onclick={create} disabled={!name} loading={saving} loadingText="Creating…">
					{dupes.length ? 'Create anyway' : 'Create lead'}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
