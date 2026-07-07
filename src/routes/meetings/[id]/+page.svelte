<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import Icon from '$lib/components/shared/Icon.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { formatDate } from '$lib/utils/dates';
	import MeetingFormModal, {
		type MeetingFormPayload
	} from '$lib/components/meetings/MeetingFormModal.svelte';
	import { isManagerRole } from '$lib/utils/permissions';

	let { data } = $props();

	const meeting = $derived(data.meeting);

	// Hero date (weekday · month · day · year) and the time are shown on separate
	// lines so the date reads as the page title and the time as a supporting detail.
	function formatDay(iso: string): string {
		return formatDate(iso, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
	}
	function formatTime(iso: string): string {
		return formatDate(iso, { hour: 'numeric', minute: '2-digit' }).replace(/^.*?,\s*/, '');
	}

	// Relative-day chip ("Today" / "Tomorrow" / "In 5 days" / "3 days ago"), computed
	// from calendar-day difference so a same-day meeting always reads "Today".
	function relativeDay(iso: string, now = new Date()): string {
		const startOfDay = (x: Date) => {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain non-reactive helper, not $state
			const c = new Date(x);
			c.setHours(0, 0, 0, 0);
			return c;
		};
		const days = Math.round(
			(startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 86_400_000
		);
		if (days === 0) return 'Today';
		if (days === 1) return 'Tomorrow';
		if (days === -1) return 'Yesterday';
		return days > 1 ? `In ${days} days` : `${Math.abs(days)} days ago`;
	}

	const relLabel = $derived(relativeDay(meeting.startAt));
	// Future/today meetings get the brand-tinted chip; past ones stay neutral.
	const isUpcoming = $derived(new Date(meeting.startAt).getTime() >= Date.now());

	// Edit is gated the same way as the /meetings list: managers, or the organizer.
	const canManage = $derived(
		isManagerRole(data.me.role) ||
			(meeting.organizerId != null && meeting.organizerId === data.me.id)
	);

	let modalOpen = $state(false);
	let saving = $state(false);

	async function submit(payload: MeetingFormPayload) {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/meetings/${meeting.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startAt: payload.startAt,
					organizerId: payload.organizerId ? payload.organizerId : null,
					meetingUrl: payload.meetingUrl ?? '',
					venue: payload.venue ?? '',
					notes: payload.notes ?? '',
					outcome: payload.outcome ?? '',
					attendeeIds: payload.attendeeIds
				})
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Update failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Meeting save failed — server error');
			return;
		} finally {
			saving = false;
		}
		modalOpen = false;
		await invalidateAll();
		toasts.success('Meeting updated');
	}
</script>

<svelte:head><title>Meeting · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[860px] px-7 pb-16 pt-5">
	<a
		href="/meetings"
		class="focus-ring mb-4 inline-flex items-center gap-1.5 rounded-chip text-[12.5px] font-medium text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} /> All meetings
	</a>

	<!-- Header: date/time hero, linked lead subtitle, relative-day chip, primary actions -->
	<div class="mb-[18px] overflow-hidden rounded-frame border border-hairline bg-panel shadow-frame">
		<div class="h-[3px] bg-primary"></div>
		<div class="flex flex-col gap-4 px-5 py-[18px] sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0">
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.3px]
							{isUpcoming ? 'bg-selected text-primary-strong' : 'bg-panel-sunken text-ink-500'}"
					>
						<Icon name="calendar" size={12} />
						{relLabel}
					</span>
				</div>
				<h1
					class="text-[23px] font-extrabold leading-tight tracking-[-0.6px] text-ink sm:text-[26px]"
				>
					{formatDay(meeting.startAt)}
				</h1>
				<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink-500">
						<Icon name="clock" size={13} />
						{formatTime(meeting.startAt)}
					</span>
					<span class="text-ink-200">·</span>
					<a
						href={`/leads/${meeting.leadId}`}
						class="focus-ring inline-flex items-center gap-1 rounded-chip text-[13px] font-semibold text-primary hover:underline"
					>
						<Icon name="leads" size={13} />
						{meeting.leadName ?? 'View lead'}
					</a>
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				{#if meeting.meetingUrl}
					<a
						href={meeting.meetingUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="{buttonVariants({ variant: 'default' })} gap-1.5"
						aria-label="Join meeting (opens in a new tab)"
					>
						<Icon name="video" size={15} stroke={2} /> Join meeting
					</a>
				{/if}
				{#if canManage}
					<Button
						variant={meeting.meetingUrl ? 'outline' : 'default'}
						onclick={() => (modalOpen = true)}
						class="gap-1.5"
					>
						<Icon name="edit" size={14} stroke={2} /> Edit
					</Button>
				{/if}
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_300px]">
		<!-- LEFT: outcome + notes -->
		<div class="flex flex-col gap-[18px]">
			<section class="rounded-frame border border-hairline bg-panel p-5 shadow-frame">
				<h2 class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
					Outcome
				</h2>
				{#if meeting.outcome}
					<p class="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{meeting.outcome}</p>
				{:else}
					<p class="text-[13px] italic text-ink-300">No outcome recorded yet.</p>
				{/if}
			</section>

			<section class="rounded-frame border border-hairline bg-panel p-5 shadow-frame">
				<h2 class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Notes</h2>
				{#if meeting.notes}
					<p class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-600">
						{meeting.notes}
					</p>
				{:else}
					<p class="text-[13px] italic text-ink-300">No notes recorded.</p>
				{/if}
			</section>
		</div>

		<!-- RIGHT rail: people + meeting link -->
		<div class="flex flex-col gap-[18px]">
			<section class="rounded-frame border border-hairline bg-panel p-5 shadow-frame">
				<h2 class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Host</h2>
				<div class="flex items-center gap-2.5">
					<Avatar name={meeting.organizerName ?? null} size="lg" />
					<span class="text-[13.5px] font-semibold text-ink">
						{meeting.organizerName ?? 'Unassigned'}
					</span>
				</div>

				<h2 class="mb-2.5 mt-5 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
					Attendees
					{#if meeting.attendees.length > 0}
						<span class="text-ink-200">· {meeting.attendees.length}</span>
					{/if}
				</h2>
				{#if meeting.attendees.length > 0}
					<ul class="flex flex-wrap gap-1.5">
						{#each meeting.attendees as a (a.userId)}
							<li
								class="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-panel-subtle py-1 pl-1 pr-2.5"
							>
								<Avatar name={a.name} size="sm" />
								<span class="text-[12.5px] font-medium text-ink-700">{a.name}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-[13px] italic text-ink-300">No attendees added.</p>
				{/if}
			</section>

			<section class="rounded-frame border border-hairline bg-panel p-5 shadow-frame">
				<h2 class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
					Meeting link
				</h2>
				{#if meeting.meetingUrl}
					<a
						href={meeting.meetingUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-chip font-mono text-[12.5px] text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
					>
						<Icon name="link" size={13} />
						<span class="truncate">{meeting.meetingUrl}</span>
					</a>
				{:else}
					<p class="text-[13px] italic text-ink-300">No meeting link set.</p>
				{/if}
			</section>
		</div>
	</div>
</div>

{#if canManage}
	<MeetingFormModal
		open={modalOpen}
		users={data.users}
		leadId={meeting.leadId}
		{meeting}
		{saving}
		onclose={() => (modalOpen = false)}
		onsubmit={submit}
	/>
{/if}
