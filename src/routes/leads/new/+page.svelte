<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import OrganizerHoverCard from '$lib/components/OrganizerHoverCard.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { hasPotentialDuplicate } from '$lib/utils/dedup';
	import { formatEventDate } from '$lib/utils/dates';
	import { leadFormSchema, LEAD_CATEGORIES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import type { DateValue } from '@internationalized/date';

	let { data } = $props();

	let name = $state('');
	let category = $state<string>('Other');
	let platform = $state<string>('');
	let location = $state('');
	let pageUrl = $state('');
	let email = $state('');
	let eventName = $state('');
	let eventLink = $state('');
	let notes = $state('');
	let selectedDate = $state<DateValue | undefined>(undefined);
	let dateOpen = $state(false);
	let tempDate = $state<DateValue | undefined>(undefined);
	let announcedDate = $state<DateValue | undefined>(undefined);
	let announcedDateOpen = $state(false);
	let announcedDateTemp = $state<DateValue | undefined>(undefined);
	let reachedOutDate = $state<DateValue | undefined>(undefined);
	let reachedOutDateOpen = $state(false);
	let reachedOutDateTemp = $state<DateValue | undefined>(undefined);
	let error = $state('');
	let saving = $state(false);

	const eventDateDisplay = $derived(selectedDate ? formatEventDate(selectedDate) : '');
	const announcedDateDisplay = $derived(announcedDate ? formatEventDate(announcedDate) : '');
	const reachedOutDateDisplay = $derived(reachedOutDate ? formatEventDate(reachedOutDate) : '');

	$effect(() => {
		if (dateOpen) tempDate = selectedDate;
	});
	$effect(() => {
		if (announcedDateOpen) announcedDateTemp = announcedDate;
	});
	$effect(() => {
		if (reachedOutDateOpen) reachedOutDateTemp = reachedOutDate;
	});

	// Advisory only — duplicates are surfaced but never block "Create anyway".
	const dupes = $derived(name.length > 1 ? hasPotentialDuplicate({ name }, data.leads) : []);

	// Hover/focus-controlled duplicate detail card. `openDupeId` holds the id of the
	// row whose card is open; a short grace-period timer keeps the card from
	// flicker-closing when the pointer travels from the row into the card content.
	let openDupeId = $state<string | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	function openDupe(id: string) {
		clearTimeout(closeTimer);
		openDupeId = id;
	}
	function scheduleCloseDupe() {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			openDupeId = null;
		}, 200);
	}
	function closeDupeNow() {
		clearTimeout(closeTimer);
		openDupeId = null;
	}
	function ownerNameFor(ownerId: string | null) {
		return ownerId ? (data.users.find((u) => u.id === ownerId)?.name ?? null) : null;
	}

	async function create() {
		if (saving) return; // duplicate-submit guard
		if (!selectedDate) {
			error = 'Event date is required.';
			return;
		}
		const parsed = leadFormSchema.safeParse({
			name,
			category,
			platform: platform || undefined,
			location: location || undefined,
			pageUrl: pageUrl || '',
			contactEmail: email || '',
			eventName: eventName || undefined,
			eventLink: eventLink || '',
			eventDateRaw: eventDateDisplay || undefined,
			firstAnnouncedDate: announcedDate ? announcedDate.toString() : undefined,
			firstReachedOutDate: reachedOutDate ? reachedOutDate.toString() : undefined,
			notes: notes.trim() || undefined
		});
		if (!parsed.success) {
			error = parsed.error.issues[0]?.message ?? 'Please check the form.';
			return;
		}
		error = '';
		saving = true;
		try {
			const res = await fetch('/api/leads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data)
			});
			if (!res.ok) {
				error = (await res.text().catch(() => '')) || 'Could not create lead.';
				return;
			}
			const { id, name: leadName } = (await res.json()) as { id: string; name: string };
			toasts.success(`Created ${leadName}`);
			await goto(`/leads/${id}`);
		} catch {
			error = 'Could not create lead. Please try again.';
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
	<PageHeader
		title="New lead"
		subtitle="Search the command bar first — dedup is advisory, but two reps shouldn't DM the same page."
	/>

	{#if dupes.length}
		<div class="mb-4 rounded-control border border-stale/30 bg-[rgba(194,113,12,0.08)] p-3">
			<div class="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#92560b]">
				<Icon name="alert" size={14} stroke={2} /> Possible duplicate — review before creating (you can
				still create anyway).
			</div>
			{#each dupes as d (d.id)}
				<Popover.Root open={openDupeId === d.id}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<div
								{...props}
								tabindex="0"
								role="button"
								aria-haspopup="dialog"
								class="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
								onmouseenter={() => openDupe(d.id)}
								onmouseleave={scheduleCloseDupe}
								onfocus={() => openDupe(d.id)}
								onblur={scheduleCloseDupe}
								onkeydown={(e) => {
									if (e.key === 'Escape') closeDupeNow();
								}}
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
							onmouseenter={() => openDupe(d.id)}
							onmouseleave={scheduleCloseDupe}
							onkeydown={(e) => {
								if (e.key === 'Escape') closeDupeNow();
							}}
						>
							<OrganizerHoverCard lead={d} ownerName={ownerNameFor(d.ownerId)} />
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
				<Input id="name" bind:value={name} placeholder="e.g. Christian Concerts PH" />
			</div>
			<div class="grid gap-1.5">
				<Label for="category">Category <span class="text-ink-400">(optional)</span></Label>
				<Select type="single" bind:value={category}>
					<SelectTrigger id="category" class="w-full">{category}</SelectTrigger>
					<SelectContent>
						{#each LEAD_CATEGORIES as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
					</SelectContent>
				</Select>
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
				<Input id="location" bind:value={location} placeholder="Manila" />
			</div>
			<div class="grid gap-1.5">
				<Label for="email">Contact email <span class="text-ink-400">(optional)</span></Label>
				<Input id="email" bind:value={email} placeholder="hello@page.ph" />
			</div>
			<div class="grid gap-1.5">
				<Label for="pageUrl">Page URL <span class="text-ink-400">(optional)</span></Label>
				<Input id="pageUrl" bind:value={pageUrl} placeholder="https://facebook.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventName">Event name <span class="text-ink-400">(optional)</span></Label>
				<Input id="eventName" bind:value={eventName} placeholder="Worship Night Vol. 4" />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventLink">Event link <span class="text-ink-400">(optional)</span></Label>
				<Input id="eventLink" bind:value={eventLink} placeholder="https://facebook.com/events/…" />
			</div>
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="eventDate">Event date <span class="text-red-500">*</span></Label>
				<Dialog.Root bind:open={dateOpen}>
					<Dialog.Trigger
						id="eventDate"
						class="flex h-9 w-full items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!eventDateDisplay
							? 'text-ink-400'
							: 'text-ink'}"
					>
						{eventDateDisplay || 'Pick a date'}
						<Icon name="calendar" size={15} />
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

			<div class="grid gap-1.5">
				<Label for="firstAnnouncedDate"
					>First announced <span class="text-ink-400">(optional)</span></Label
				>
				<Dialog.Root bind:open={announcedDateOpen}>
					<Dialog.Trigger
						id="firstAnnouncedDate"
						class="flex h-9 w-full items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!announcedDateDisplay
							? 'text-ink-400'
							: 'text-ink'}"
					>
						{announcedDateDisplay || 'Pick a date'}
						<Icon name="calendar" size={15} />
					</Dialog.Trigger>
					<Dialog.Content class="w-[min(92vw,400px)] gap-0 p-5" showCloseButton={false}>
						<Dialog.Header class="mb-3 p-0">
							<Dialog.Title>First announced date</Dialog.Title>
						</Dialog.Header>
						<div class="rounded-xl bg-panel-sunken p-3">
							<Calendar
								type="single"
								bind:value={announcedDateTemp}
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
									announcedDate = announcedDateTemp;
									announcedDateOpen = false;
								}}
								class="rounded-control bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
							>
								Done
							</button>
						</div>
					</Dialog.Content>
				</Dialog.Root>
			</div>

			<div class="grid gap-1.5">
				<Label for="firstReachedOutDate"
					>First reached out <span class="text-ink-400">(optional)</span></Label
				>
				<Dialog.Root bind:open={reachedOutDateOpen}>
					<Dialog.Trigger
						id="firstReachedOutDate"
						class="flex h-9 w-full items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!reachedOutDateDisplay
							? 'text-ink-400'
							: 'text-ink'}"
					>
						{reachedOutDateDisplay || 'Pick a date'}
						<Icon name="calendar" size={15} />
					</Dialog.Trigger>
					<Dialog.Content class="w-[min(92vw,400px)] gap-0 p-5" showCloseButton={false}>
						<Dialog.Header class="mb-3 p-0">
							<Dialog.Title>First reached out date</Dialog.Title>
						</Dialog.Header>
						<div class="rounded-xl bg-panel-sunken p-3">
							<Calendar
								type="single"
								bind:value={reachedOutDateTemp}
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
									reachedOutDate = reachedOutDateTemp;
									reachedOutDateOpen = false;
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
				<Label for="notes">Notes <span class="text-ink-400">(optional)</span></Label>
				<Textarea
					id="notes"
					bind:value={notes}
					placeholder="Anything worth noting about this lead…"
					class="min-h-[72px] resize-y"
				/>
			</div>

			{#if error}<p class="text-[12.5px] font-medium text-overdue sm:col-span-2">{error}</p>{/if}

			<div class="flex items-center justify-end gap-2.5 sm:col-span-2">
				<Button variant="outline" href="/leads">Cancel</Button>
				<Button onclick={create} disabled={!name} loading={saving} loadingText="Creating…">
					{dupes.length ? 'Create anyway' : 'Create lead'}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
