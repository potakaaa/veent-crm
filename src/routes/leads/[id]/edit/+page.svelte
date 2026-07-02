<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { formatEventDate } from '$lib/utils/dates';
	import {
		leadUpdateSchema,
		LEAD_CATEGORIES,
		LEAD_PLATFORMS,
		LEAD_VISIBILITIES
	} from '$lib/zod/schemas';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { untrack } from 'svelte';

	let { data } = $props();
	const lead = untrack(() => data.lead);

	let name = $state(lead.name);
	let category = $state<string>(lead.category);
	let platform = $state<string>(lead.platform ?? '');
	let location = $state(lead.location === '—' ? '' : (lead.location ?? ''));
	let pageUrl = $state(lead.pageUrl ?? '');
	let email = $state(lead.email ?? '');
	let phone = $state(lead.phone ?? '');
	let socialFacebook = $state(lead.socialFacebook ?? '');
	let socialInstagram = $state(lead.socialInstagram ?? '');
	let eventName = $state(lead.eventName ?? '');
	let eventLink = $state(lead.eventLink ?? '');
	let notes = $state(lead.notes ?? '');
	let hasFutureEvents = $state(lead.hasFutureEvents ?? false);
	let visibility = $state<(typeof LEAD_VISIBILITIES)[number]>(lead.visibility ?? 'everyone');
	let selectedUserIds = $state<string[]>(lead.selectedUserIds ?? []);

	const VISIBILITY_LABELS: Record<string, string> = {
		only_me: 'Only me',
		everyone: 'Everyone',
		selected: 'Selected people'
	};
	const grantableUsers = $derived(data.users.filter((u) => u.active));
	function toggleGrant(id: string) {
		selectedUserIds = selectedUserIds.includes(id)
			? selectedUserIds.filter((x) => x !== id)
			: [...selectedUserIds, id];
	}

	let selectedDate = $state<DateValue | undefined>(
		lead.eventDate ? parseDate(lead.eventDate) : undefined
	);
	let dateOpen = $state(false);
	let tempDate = $state<DateValue | undefined>(undefined);
	let announcedDate = $state<DateValue | undefined>(
		lead.firstAnnouncedDate ? parseDate(lead.firstAnnouncedDate) : undefined
	);
	let announcedDateOpen = $state(false);
	let announcedDateTemp = $state<DateValue | undefined>(undefined);
	let reachedOutDate = $state<DateValue | undefined>(
		lead.firstReachedOutDate ? parseDate(lead.firstReachedOutDate) : undefined
	);
	let reachedOutDateOpen = $state(false);
	let reachedOutDateTemp = $state<DateValue | undefined>(undefined);
	let formError = $state('');
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

	async function save() {
		const parsed = leadUpdateSchema.safeParse({
			name,
			category,
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
			firstAnnouncedDate: announcedDate ? announcedDate.toString() : null,
			firstReachedOutDate: reachedOutDate ? reachedOutDate.toString() : null,
			notes: notes || undefined,
			hasFutureEvents,
			visibility,
			selectedUserIds: visibility === 'selected' ? selectedUserIds : undefined
		});
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Please check the form.';
			return;
		}
		formError = '';
		saving = true;
		try {
			const res = await fetch(`/api/leads/${lead.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data)
			});
			if (!res.ok) {
				formError = (await res.text().catch(() => '')) || 'Could not save changes.';
				return;
			}
			toasts.success('Lead updated');
			await goto(`/leads/${lead.id}`);
		} catch {
			formError = 'Could not save changes. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Edit {lead.name} · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[680px] px-7 pb-16 pt-6">
	<a
		href="/leads/{lead.id}"
		class="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} stroke={2} /> Back to lead
	</a>
	<PageHeader title="Edit lead" subtitle={lead.name} />

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
				<Label for="phone">Phone <span class="text-ink-400">(optional)</span></Label>
				<Input id="phone" bind:value={phone} placeholder="+63 917 000 0000" />
			</div>
			<div class="grid gap-1.5">
				<Label for="pageUrl">Page URL <span class="text-ink-400">(optional)</span></Label>
				<Input id="pageUrl" bind:value={pageUrl} placeholder="https://facebook.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="socialFacebook">Facebook <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="socialFacebook"
					bind:value={socialFacebook}
					placeholder="https://facebook.com/…"
				/>
			</div>
			<div class="grid gap-1.5">
				<Label for="socialInstagram">Instagram <span class="text-ink-400">(optional)</span></Label>
				<Input
					id="socialInstagram"
					bind:value={socialInstagram}
					placeholder="https://instagram.com/…"
				/>
			</div>
			<div class="grid gap-1.5">
				<Label for="eventName">Event name <span class="text-ink-400">(optional)</span></Label>
				<Input id="eventName" bind:value={eventName} placeholder="Worship Night Vol. 4" />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventLink">Event link <span class="text-ink-400">(optional)</span></Label>
				<Input id="eventLink" bind:value={eventLink} placeholder="https://…" />
			</div>
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="eventDate">Event date <span class="text-ink-400">(optional)</span></Label>
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
				<div class="flex items-center gap-1.5">
					<Dialog.Root bind:open={announcedDateOpen}>
						<Dialog.Trigger
							id="firstAnnouncedDate"
							class="flex h-9 flex-1 items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!announcedDateDisplay
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
					{#if announcedDate}
						<button
							type="button"
							onclick={() => (announcedDate = undefined)}
							class="shrink-0 text-[12px] text-ink-400 hover:text-ink"
							aria-label="Clear first announced date"
						>
							Clear
						</button>
					{/if}
				</div>
			</div>
			<div class="grid gap-1.5">
				<Label for="firstReachedOutDate"
					>First reached out <span class="text-ink-400">(optional)</span></Label
				>
				<div class="flex items-center gap-1.5">
					<Dialog.Root bind:open={reachedOutDateOpen}>
						<Dialog.Trigger
							id="firstReachedOutDate"
							class="flex h-9 flex-1 items-center justify-between rounded-control border border-hairline bg-panel px-3 py-2 text-left text-[13px] shadow-sm transition hover:bg-panel-sunken focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary {!reachedOutDateDisplay
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
					{#if reachedOutDate}
						<button
							type="button"
							onclick={() => (reachedOutDate = undefined)}
							class="shrink-0 text-[12px] text-ink-400 hover:text-ink"
							aria-label="Clear first reached out date"
						>
							Clear
						</button>
					{/if}
				</div>
			</div>
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
				{/if}
			</div>

			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="notes">Notes <span class="text-ink-400">(optional)</span></Label>
				<Textarea id="notes" bind:value={notes} placeholder="Anything worth noting…" rows={3} />
			</div>

			<div class="sm:col-span-2">
				<label class="flex items-center gap-2 text-[13px] font-medium text-ink">
					<input type="checkbox" bind:checked={hasFutureEvents} class="size-4" />
					Has future events (recurring organizer)
				</label>
				<p class="mt-1 text-[11.5px] text-ink-400">
					Flag this organizer as a future-events prospect regardless of the current deal's stage.
				</p>
			</div>

			{#if formError}<p class="text-[12.5px] text-overdue sm:col-span-2">{formError}</p>{/if}

			<div class="flex items-center justify-end gap-2.5 sm:col-span-2">
				<Button variant="outline" href="/leads/{lead.id}">Cancel</Button>
				<Button onclick={save} disabled={saving || !name}>Save changes</Button>
			</div>
		</CardContent>
	</Card>
</div>
