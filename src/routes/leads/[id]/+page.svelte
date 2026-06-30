<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/shared/Icon.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import DedupBanner from '$lib/components/leads/DedupBanner.svelte';
	import ActivityTimeline from '$lib/components/leads/ActivityTimeline.svelte';
	import LogTouchForm from '$lib/components/leads/LogTouchForm.svelte';
	import StageControl from '$lib/components/leads/StageControl.svelte';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canEditLead, canReassign } from '$lib/utils/permissions';
	import { formatDate } from '$lib/utils/dates';
	import type { AddActivityInput, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	const lead = $derived(data.lead);
	const canEdit = $derived(canEditLead(data.me, lead));
	const ownerName = $derived(data.users.find((u) => u.id === lead.ownerId)?.name ?? null);

	let wonOpen = $state(false);
	let lostOpen = $state(false);
	let reassignOpen = $state(false);

	const fields = $derived([
		{ label: 'Category', value: lead.category },
		{ label: 'Location', value: lead.location },
		{ label: 'Platform', value: lead.platform },
		{
			label: 'Page URL',
			value: lead.pageUrl ?? `facebook.com/${lead.handle.replace('@', '')}`,
			href: lead.pageUrl
		},
		...(lead.socialFacebook && lead.socialFacebook !== lead.pageUrl
			? [{ label: 'Facebook', value: lead.socialFacebook, href: lead.socialFacebook }]
			: []),
		...(lead.socialInstagram
			? [{ label: 'Instagram', value: lead.socialInstagram, href: lead.socialInstagram }]
			: []),
		{
			label: 'Contact email',
			value: lead.email ?? '—',
			href: lead.email ? `mailto:${lead.email}` : undefined
		},
		...(lead.phone ? [{ label: 'Phone', value: lead.phone, href: `tel:${lead.phone}` }] : []),
		{
			label: 'Event',
			value: lead.eventDate ? `${lead.eventName} · ${lead.eventDate}` : (lead.eventName ?? '—'),
			href: lead.eventLink
		}
	]);

	async function logTouch(input: AddActivityInput) {
		const occurredAt = new Date().toISOString();
		let res: Response;
		try {
			res = await fetch(`/api/leads/${lead.id}/activities`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					leadId: lead.id,
					channel: input.channel,
					outcome: input.outcome,
					occurredAt,
					followUpInDays: input.followUpInDays,
					notes: input.note
				})
			});
		} catch {
			toasts.push('Touch logging failed — server error');
			throw new Error('network');
		}

		if (res.status === 409) {
			toasts.push('Already logged — touch already recorded for this channel/time');
			throw new Error('duplicate');
		}
		if (!res.ok) {
			toasts.push('Touch logging failed — please try again');
			throw new Error('http');
		}

		await invalidateAll();
		toasts.success('Touch logged · follow-up booked');
	}

	async function selectStage(stage: Stage) {
		if (stage === lead.stage) return;
		if (stage === 'won') return void (wonOpen = true);
		if (stage === 'lost') return void (lostOpen = true);
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Stage update failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Stage update failed — server error');
			return;
		}
		await invalidateAll();
		toasts.push(`Moved to ${stage}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		wonOpen = false;
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'won', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Won capture failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Won capture failed — server error');
			return;
		}
		await invalidateAll();
		toasts.success('Deal won — captured 🎉');
	}

	async function confirmLost(reason: LostReason, note?: string) {
		void note;
		lostOpen = false;
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'lost', lostReason: reason })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Mark lost failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Mark lost failed — server error');
			return;
		}
		await invalidateAll();
		toasts.push('Marked lost — still searchable');
	}

	async function confirmReassign(ownerId: string) {
		reassignOpen = false;
		try {
			const res = await fetch(`/api/leads/${lead.id}/owner`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ownerId })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Reassign failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Reassign failed — server error');
			return;
		}
		await invalidateAll();
		toasts.success('Lead reassigned');
	}
</script>

<svelte:head><title>{lead.name} · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[1080px] px-7 pb-16 pt-5">
	<a
		href="/leads"
		class="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink"
	>
		<Icon name="back" size={14} stroke={2} /> Back to leads
	</a>

	<!-- header -->
	<div class="mb-3.5 flex items-center gap-3.5">
		<PlatformBadge platform={lead.platform} size="lg" />
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2.5">
				<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">{lead.name}</h1>
				<StageChip stage={lead.stage} />
				<AgeBadge label={lead.age.label} type={lead.age.type} />
			</div>
			<div class="mt-1 font-mono text-[12.5px] text-ink-400">
				{lead.handle} · {lead.category} · {lead.location}
			</div>
		</div>
		<div class="flex items-center gap-2 text-[12.5px] text-ink-500">
			owner <Avatar name={ownerName} />
		</div>
	</div>

	{#if lead.siblings}
		<DedupBanner
			message={`${lead.siblings} leads share this page — review siblings before reaching out.`}
		/>
	{/if}

	{#if !canEdit}
		<div
			class="mb-4 rounded-control border border-hairline bg-panel-subtle px-4 py-2.5 text-[12.5px] text-ink-500"
		>
			You don't own this lead. Viewing is open to everyone; only the owner (or a manager) can edit
			it.
		</div>
	{/if}

	<div class="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_320px]">
		<!-- LEFT -->
		<div>
			<div class="mb-4 rounded-control border border-hairline bg-panel p-4">
				<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
					Lead &amp; event
				</div>
				<div class="grid grid-cols-2 gap-x-6 gap-y-3">
					{#each fields as f}
						<div>
							<div class="mb-0.5 text-[11px] text-ink-300">{f.label}</div>
							{#if f.href}
								<a
									href={f.href}
									target="_blank"
									rel="noopener noreferrer"
									class="block truncate font-mono text-[13px] text-blue-600 underline hover:text-blue-800"
									>{f.value}</a
								>
							{:else}
								<div class="font-mono text-[13px] text-ink">{f.value}</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="mb-4">
				<ActivityTimeline activities={data.activities} users={data.users} />
			</div>

			{#if canEdit}
				<LogTouchForm onSubmit={logTouch} />
			{/if}
		</div>

		<!-- RIGHT RAIL -->
		<div class="flex flex-col gap-3.5">
			<StageControl current={lead.stage} disabled={!canEdit} onSelect={selectStage} />

			<div class="flex flex-col gap-2.5 rounded-control border border-hairline bg-panel p-4">
				<button
					disabled={!canEdit}
					onclick={() => (wonOpen = true)}
					class="flex h-[38px] items-center justify-center gap-1.5 rounded-control bg-fresh text-[13px] font-semibold text-white disabled:opacity-50"
				>
					<Icon name="check" size={15} stroke={2.2} /> Mark won
				</button>
				<button
					disabled={!canEdit}
					onclick={() => (lostOpen = true)}
					class="h-9 rounded-control border border-hairline bg-panel text-[13px] font-medium disabled:opacity-50"
					style="color:#71717a"
				>
					Mark lost
				</button>
			</div>

			<div class="rounded-control border border-hairline bg-panel p-4">
				<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Owner</div>
				<div class="mb-3 flex items-center gap-2.5">
					<Avatar name={ownerName} size="lg" />
					<span class="text-[13px] font-semibold">{ownerName ?? 'Unassigned'}</span>
				</div>
				<button
					disabled={!canReassign(data.me)}
					onclick={() => (reassignOpen = true)}
					class="h-[34px] w-full rounded-control border border-hairline bg-panel text-[12.5px] font-medium text-ink-600 disabled:opacity-50"
				>
					Reassign
				</button>
			</div>

			<div class="rounded-control border border-hairline bg-panel p-4">
				<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Meta</div>
				<div class="flex flex-col gap-2 font-mono text-[11.5px]">
					<div class="flex justify-between">
						<span class="text-ink-300">created</span><span>{formatDate(lead.createdAt)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-ink-300">last activity</span><span
							>{formatDate(lead.lastActivityAt)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-ink-300">needs review</span>
						<span style="color:{lead.needsReview ? '#e11d48' : '#0e9f6e'}">
							{lead.needsReview ? 'flagged' : 'clear'}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

{#if wonOpen}
	<WonCaptureModal
		open={true}
		leadName={lead.name}
		onclose={() => (wonOpen = false)}
		onconfirm={confirmWon}
	/>
{/if}
{#if lostOpen}
	<LostReasonModal
		open={true}
		leadName={lead.name}
		onclose={() => (lostOpen = false)}
		onconfirm={confirmLost}
	/>
{/if}
{#if reassignOpen}
	<ReassignModal
		open={true}
		users={data.users}
		currentOwnerId={lead.ownerId}
		onclose={() => (reassignOpen = false)}
		onconfirm={confirmReassign}
	/>
{/if}
