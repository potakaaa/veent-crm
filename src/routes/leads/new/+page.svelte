<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { crm } from '$lib/services';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { hasPotentialDuplicate } from '$lib/utils/dedup';
	import { leadFormSchema, LEAD_CATEGORIES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import type { Category, Platform } from '$lib/types';

	let { data } = $props();

	let name = $state('');
	let category = $state<string>('Other');
	let platform = $state<string>('');
	let location = $state('');
	let pageUrl = $state('');
	let email = $state('');
	let eventName = $state('');
	let eventDate = $state('');
	let error = $state('');
	let saving = $state(false);

	// Advisory only — duplicates are surfaced but never block "Create anyway".
	const dupes = $derived(name.length > 1 ? hasPotentialDuplicate({ name }, data.leads) : []);

	async function create() {
		const parsed = leadFormSchema.safeParse({
			name,
			category,
			platform: platform || undefined,
			location: location || undefined,
			pageUrl: pageUrl || '',
			contactEmail: email || '',
			eventName: eventName || undefined,
			eventDateRaw: eventDate || undefined
		});
		if (!parsed.success) {
			error = parsed.error.issues[0]?.message ?? 'Please check the form.';
			return;
		}
		error = '';
		saving = true;
		try {
			const lead = await crm.createLead({
				name,
				category: category as Category,
				platform: (platform || undefined) as Platform | undefined,
				location: location || undefined,
				pageUrl: pageUrl || undefined,
				email: email || undefined,
				eventName: eventName || undefined,
				eventDate: eventDate || undefined,
				source: 'manual'
			});
			toasts.success(`Created ${lead.name}`);
			await goto(`/leads/${lead.id}`);
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
				<a
					href="/leads/{d.id}"
					class="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 hover:bg-panel"
				>
					<PlatformBadge platform={d.platform} />
					<span class="flex-1 text-[13px] font-semibold">{d.name}</span>
					<span class="font-mono text-[11px] text-ink-400">{d.handle}</span>
					<StageChip stage={d.stage} />
				</a>
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
				<Label for="category">Category</Label>
				<Select type="single" bind:value={category}>
					<SelectTrigger id="category" class="w-full">{category}</SelectTrigger>
					<SelectContent>
						{#each LEAD_CATEGORIES as c}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
					</SelectContent>
				</Select>
			</div>
			<div class="grid gap-1.5">
				<Label for="platform">Platform</Label>
				<Select type="single" bind:value={platform}>
					<SelectTrigger id="platform" class="w-full">{platform || 'Select platform'}</SelectTrigger
					>
					<SelectContent>
						{#each LEAD_PLATFORMS as p}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
					</SelectContent>
				</Select>
			</div>
			<div class="grid gap-1.5">
				<Label for="location">Location</Label>
				<Input id="location" bind:value={location} placeholder="Manila" />
			</div>
			<div class="grid gap-1.5">
				<Label for="email">Contact email</Label>
				<Input id="email" bind:value={email} placeholder="hello@page.ph" />
			</div>
			<div class="grid gap-1.5">
				<Label for="pageUrl">Page URL</Label>
				<Input id="pageUrl" bind:value={pageUrl} placeholder="https://facebook.com/…" />
			</div>
			<div class="grid gap-1.5">
				<Label for="eventName">Event name</Label>
				<Input id="eventName" bind:value={eventName} placeholder="Worship Night Vol. 4" />
			</div>
			<div class="grid gap-1.5 sm:col-span-2">
				<Label for="eventDate">Event date</Label>
				<Input id="eventDate" bind:value={eventDate} placeholder="12 Jul" />
			</div>

			{#if error}<p class="text-[12.5px] text-overdue sm:col-span-2">{error}</p>{/if}

			<div class="flex items-center justify-end gap-2.5 sm:col-span-2">
				<Button variant="outline" href="/leads">Cancel</Button>
				<Button onclick={create} disabled={saving || !name}>
					{dupes.length ? 'Create anyway' : 'Create lead'}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
