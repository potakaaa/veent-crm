<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import {
		Command,
		CommandInput,
		CommandList,
		CommandGroup,
		CommandItem,
		CommandEmpty
	} from '$lib/components/ui/command';
	import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover';
	import LeadCombobox from '$lib/components/meetings/LeadCombobox.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { formatDate } from '$lib/utils/dates';
	import MeetingFormModal, {
		type MeetingFormPayload
	} from '$lib/components/meetings/MeetingFormModal.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { isManagerRole } from '$lib/utils/permissions';
	import type { Meeting, User } from '$lib/types';

	let {
		meetings,
		total = undefined,
		users,
		me,
		// Single-lead mode: leadId fixed (no lead column). Cross-lead mode: leadId omitted.
		leadId = undefined,
		// Cross-lead mode only: server-resolved label for the currently-selected lead filter.
		selectedLead = undefined,
		// Cross-lead mode only: hydrates the filter/sort toolbar from the SSR loader.
		filters = undefined
	}: {
		meetings: Meeting[];
		total?: number;
		users: User[];
		me: User;
		leadId?: string;
		selectedLead?: { id: string; name: string } | null;
		filters?: {
			organizer: string;
			lead: string;
			dateFrom: string;
			dateTo: string;
			sortDir: 'asc' | 'desc';
		};
	} = $props();

	const crossLead = $derived(leadId == null);

	// Reps combobox popover open state + client-side search over the loaded roster.
	let orgOpen = $state(false);
	let orgQuery = $state('');
	const filteredUsers = $derived(
		orgQuery.trim()
			? users.filter((u) => u.name.toLowerCase().includes(orgQuery.trim().toLowerCase()))
			: users
	);

	// URL-param filter/sort navigation — mirrors leads/+page.svelte:37-51.
	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '' || v === false || v === 0) {
				params.delete(k);
			} else {
				params.set(k, String(v));
			}
		}
		goto(`?${params}`, { keepFocus: true });
	}

	function setFilter(key: string, value: string | boolean | number | undefined) {
		navigate({ [key]: value, page: undefined }); // reset page (delete param = default 1)
	}

	// Optimistic filter feedback — mirrors calendar/+page.svelte:24-29. Filter changes are
	// same-pathname goto() navigations, so the global route progress bar doesn't fire; this
	// per-control state gives instant spinner feedback until the navigation resolves.
	const navLoading = $derived(navigating.to?.url.pathname === '/meetings');
	let pendingAction = $state<string | null>(null);
	$effect(() => {
		if (!navLoading) pendingAction = null;
	});

	// Infinite-scroll state (cross-lead mode only) — mirrors the Pipeline board pattern.
	let extraMeetings = $state<Meeting[]>([]);
	let pageNum = $state(1);
	let loadingMore = $state(false);
	let totalOverride = $state<number | undefined>(undefined);

	const allMeetings = $derived([...meetings, ...extraMeetings]);
	const liveTotal = $derived(totalOverride ?? total ?? allMeetings.length);
	const hasMore = $derived(crossLead && allMeetings.length < liveTotal);

	// Clear client-appended extras whenever the SSR `meetings` prop refreshes
	// (create/update/delete already call invalidateAll()).
	// NOTE: this ALSO handles reset-to-page-1 on filter/sort change for free —
	// every filter/sort change is a full SvelteKit navigation that replaces the
	// SSR `meetings` prop, re-firing this effect. Do NOT remove without replacing.
	$effect(() => {
		void meetings; // track
		extraMeetings = [];
		pageNum = 1;
		totalOverride = undefined;
	});

	async function loadMoreMeetings() {
		if (loadingMore) return;
		if (allMeetings.length >= liveTotal) return;
		const nextPage = pageNum + 1;
		loadingMore = true;
		try {
			// Build the fetch URL from the CURRENT URL params so organizer/lead/
			// dateFrom/dateTo/sortDir carry through every "load more" fetch (infinite
			// scroll stays within the filtered/sorted view). Reflecting the live URL
			// is DRY — no hand-copying of individual filter keys.
			const params = new SvelteURLSearchParams(page.url.searchParams);
			params.set('page', String(nextPage));
			params.set('limit', '8');
			const res = await fetch(`/api/meetings?${params}`);
			if (!res.ok) return;
			const { meetings: newMeetings, total: newTotal } = (await res.json()) as {
				meetings: Meeting[];
				total: number;
			};
			const existingIds = new Set(allMeetings.map((m) => m.id));
			const fresh = newMeetings.filter((m) => !existingIds.has(m.id));
			extraMeetings = [...extraMeetings, ...fresh];
			pageNum = nextPage;
			totalOverride = newTotal;
		} catch {
			// silently ignore — user can scroll again
		} finally {
			loadingMore = false;
		}
	}

	function sentinel(el: HTMLElement) {
		const obs = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMoreMeetings();
			},
			{ threshold: 0.1 }
		);
		obs.observe(el);
		return { destroy: () => obs.disconnect() };
	}

	let modalOpen = $state(false);
	let editing = $state<Meeting | null>(null);
	let saving = $state(false);
	let mutating = $state(false);

	function canManage(m: Meeting): boolean {
		return isManagerRole(me.role) || (m.organizerId != null && m.organizerId === me.id);
	}

	function openCreate() {
		editing = null;
		modalOpen = true;
	}
	function openEdit(m: Meeting) {
		editing = m;
		modalOpen = true;
	}

	function formatStart(iso: string): string {
		return formatDate(iso, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function submit(payload: MeetingFormPayload) {
		if (saving) return;
		saving = true;
		const editingId = editing?.id;
		try {
			const res = editingId
				? await fetch(`/api/meetings/${editingId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							startAt: payload.startAt,
							// Empty string means "unassign" — send explicit null so JSON.stringify
							// keeps the key (undefined would be dropped, leaving organizer unchanged).
							organizerId: payload.organizerId ? payload.organizerId : null,
							meetingUrl: payload.meetingUrl ?? '',
							notes: payload.notes ?? '',
							outcome: payload.outcome ?? '',
							attendeeIds: payload.attendeeIds
						})
					})
				: await fetch('/api/meetings', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`${editingId ? 'Update' : 'Create'} failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Meeting save failed — server error');
			return;
		} finally {
			saving = false;
		}
		modalOpen = false;
		editing = null;
		await invalidateAll();
		toasts.success(editingId ? 'Meeting updated' : 'Meeting created');
	}

	async function remove(m: Meeting) {
		if (mutating) return;
		if (!confirm('Delete this meeting?')) return;
		mutating = true;
		try {
			const res = await fetch(`/api/meetings/${m.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Delete failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Delete failed — server error');
			return;
		} finally {
			mutating = false;
		}
		await invalidateAll();
		toasts.push('Meeting deleted');
	}
</script>

{#snippet spinner(size: number)}
	<svg
		class="shrink-0 animate-spin"
		style="width:{size}px;height:{size}px"
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
		></circle>
		<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
		></path>
	</svg>
{/snippet}

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3 flex items-center justify-between">
		<div class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Meetings</div>
		<Button onclick={openCreate}>New meeting</Button>
	</div>

	{#if crossLead && filters}
		<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
			<Popover bind:open={orgOpen}>
				<PopoverTrigger
					disabled={navLoading}
					class="flex h-8 items-center gap-1 rounded-control border border-hairline bg-panel px-2.5 text-[12.5px] text-ink hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
				>
					{#if navLoading && pendingAction === 'organizer'}{@render spinner(12)}{/if}
					{filters.organizer === 'all'
						? 'All reps'
						: filters.organizer === 'mine'
							? 'Mine'
							: (users.find((u) => u.id === filters.organizer)?.name ?? 'Rep')}
				</PopoverTrigger>
				<PopoverContent class="w-64 p-0" align="start">
					<!-- shouldFilter disabled so the pinned Quick filters stay visible while typing;
					     the reps list is filtered client-side via filteredUsers. -->
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search reps…"
							value={orgQuery}
							oninput={(e) => (orgQuery = e.currentTarget.value)}
						/>
						<CommandList>
							<CommandGroup heading="Quick filters">
								<CommandItem
									value="__mine__"
									data-chosen={filters.organizer === 'mine' ? '' : undefined}
									onSelect={() => {
										pendingAction = 'organizer';
										setFilter('organizer', 'mine');
										orgOpen = false;
									}}>Mine</CommandItem
								>
								<CommandItem
									value="__all__"
									data-chosen={filters.organizer === 'all' ? '' : undefined}
									onSelect={() => {
										pendingAction = 'organizer';
										setFilter('organizer', 'all');
										orgOpen = false;
									}}>All reps</CommandItem
								>
							</CommandGroup>
							<CommandGroup heading="Search reps">
								{#if filteredUsers.length === 0}
									<CommandEmpty>No reps found.</CommandEmpty>
								{:else}
									{#each filteredUsers as u (u.id)}
										<CommandItem
											value={u.id}
											data-chosen={filters.organizer === u.id ? '' : undefined}
											onSelect={() => {
												pendingAction = 'organizer';
												setFilter('organizer', u.id);
												orgOpen = false;
											}}>{u.name}</CommandItem
										>
									{/each}
								{/if}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			<LeadCombobox
				mode="filter"
				value={filters.lead}
				selectedLabel={selectedLead?.name}
				disabled={navLoading}
				onselect={(l) => {
					pendingAction = 'lead';
					setFilter('lead', l?.id);
				}}
			/>

			<div class="relative flex items-center">
				<input
					type="date"
					value={filters.dateFrom}
					disabled={navLoading}
					onchange={(e) => {
						pendingAction = 'dateFrom';
						setFilter('dateFrom', e.currentTarget.value);
					}}
					aria-label="From date"
					class="h-8 rounded-control border border-hairline bg-panel px-2 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-wait disabled:opacity-60"
				/>
				{#if navLoading && pendingAction === 'dateFrom'}
					<span class="pointer-events-none absolute right-2 text-ink-400"
						>{@render spinner(12)}</span
					>
				{/if}
			</div>
			<div class="relative flex items-center">
				<input
					type="date"
					value={filters.dateTo}
					disabled={navLoading}
					onchange={(e) => {
						pendingAction = 'dateTo';
						setFilter('dateTo', e.currentTarget.value);
					}}
					aria-label="To date"
					class="h-8 rounded-control border border-hairline bg-panel px-2 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-wait disabled:opacity-60"
				/>
				{#if navLoading && pendingAction === 'dateTo'}
					<span class="pointer-events-none absolute right-2 text-ink-400"
						>{@render spinner(12)}</span
					>
				{/if}
			</div>

			<Button
				variant="outline"
				size="sm"
				disabled={navLoading}
				onclick={() => {
					pendingAction = 'sortDir';
					setFilter('sortDir', filters.sortDir === 'asc' ? undefined : 'asc');
				}}
			>
				{#if navLoading && pendingAction === 'sortDir'}{@render spinner(12)}{/if}
				{filters.sortDir === 'asc' ? 'Oldest first' : 'Newest first'}
			</Button>
		</div>
	{/if}

	{#if navLoading}
		<div class="flex flex-col gap-2.5">
			{#each Array(5) as _, i (i)}
				<div class="rounded-control border border-hairline bg-panel-subtle p-3">
					<Skeleton class="h-3.5 w-32" />
					<Skeleton class="mt-1 h-3 w-24" />
				</div>
			{/each}
		</div>
	{:else if allMeetings.length === 0}
		<div class="py-8 text-center text-[13px] text-ink-400">No meetings yet.</div>
	{:else}
		<div class="flex flex-col gap-2.5">
			{#each allMeetings as m (m.id)}
				<div
					role="link"
					tabindex="0"
					onclick={() => goto(`/meetings/${m.id}`)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							goto(`/meetings/${m.id}`);
						}
					}}
					class="rounded-control border border-hairline bg-panel-subtle p-3 cursor-pointer transition-colors hover:bg-panel"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="text-[13px] font-semibold text-ink">{formatStart(m.startAt)}</div>
							{#if crossLead && m.leadName}
								<div class="mt-0.5 text-[12px] text-ink-500">{m.leadName}</div>
							{/if}
							<div class="mt-0.5 text-[12px] text-ink-400">
								Organizer: {m.organizerName ?? 'Unassigned'}
							</div>
							{#if m.attendees.length > 0}
								<div class="mt-0.5 text-[12px] text-ink-400">
									Attendees: {m.attendees.map((a) => a.name).join(', ')}
								</div>
							{/if}
							{#if m.outcome}
								<div class="mt-1 text-[12.5px] text-ink">{m.outcome}</div>
							{/if}
							{#if m.notes}
								<div class="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-600">{m.notes}</div>
							{/if}
							{#if m.meetingUrl}
								<a
									href={m.meetingUrl}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => e.stopPropagation()}
									class="mt-1 inline-block truncate font-mono text-[12.5px] text-blue-600 underline hover:text-blue-800"
								>
									{m.meetingUrl}
								</a>
							{/if}
						</div>
						{#if canManage(m)}
							<div class="flex shrink-0 gap-2">
								<button
									onclick={(e) => {
										e.stopPropagation();
										openEdit(m);
									}}
									class="rounded-control border border-hairline bg-panel px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-panel-sunken"
								>
									Edit
								</button>
								<button
									disabled={mutating}
									onclick={(e) => {
										e.stopPropagation();
										remove(m);
									}}
									class="rounded-control border border-hairline bg-panel px-2.5 py-1 text-[12px] font-medium text-red-500 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
								>
									Delete
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
			{#if hasMore}
				<div use:sentinel aria-hidden="true">
					{#if loadingMore}
						<div class="rounded-control border border-hairline bg-panel-subtle p-3">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="mt-1 h-3 w-24" />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<MeetingFormModal
	open={modalOpen}
	{users}
	{leadId}
	meeting={editing}
	{saving}
	onclose={() => {
		modalOpen = false;
		editing = null;
	}}
	onsubmit={submit}
/>
