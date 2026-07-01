<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { DetailSkeleton } from '$lib/components/shared/skeletons';
	import { patchRecord } from '$lib/utils/optimistic';
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
	import DiscardIssueModal from '$lib/components/leads/DiscardIssueModal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canEditLead, canReassign } from '$lib/utils/permissions';
	import { formatDate, followUpDate } from '$lib/utils/dates';
	import { stageLabel } from '$lib/utils/stages';
	import type { AddActivityInput, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	// Optimistic shadow of the lead record. E1: a writable `$derived` IS the reconcile
	// mechanism — reassign for an optimistic stage/owner change; it auto-resyncs to server
	// truth whenever `data.lead` changes (i.e. after invalidateAll()).
	let lead = $derived(data.lead);
	const canEdit = $derived(canEditLead(data.me, lead));
	const ownerName = $derived(data.users.find((u) => u.id === lead.ownerId)?.name ?? null);

	let wonOpen = $state(false);
	let lostOpen = $state(false);
	let reassignOpen = $state(false);
	let discardOpen = $state(false);

	// Single shared mutation guard — prevents any two actions from running concurrently.
	let mutating = $state(false);

	// DetailSkeleton while navigating to any lead-detail route (incl. id → id switches).
	const navLoading = $derived(navigating.to?.route?.id === '/leads/[id]');

	const fields = $derived([
		{ label: 'Category', value: lead.category },
		{ label: 'Location', value: lead.location },
		{ label: 'Platform', value: lead.platform },
		{
			label: 'Page URL',
			value: lead.pageUrl ?? '—',
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
		const followUpAt =
			input.followUpInDays != null ? followUpDate(input.followUpInDays) : undefined;

		let res: Response;
		try {
			res = await fetch(`/api/leads/${lead.id}/touch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channel: input.channel,
					outcome: input.outcome,
					followUpAt,
					notes: input.note
				})
			});
		} catch {
			toasts.push('Touch logging failed — server error');
			throw new Error('network');
		}

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			let msg = 'Touch logging failed — please try again';
			try {
				const j = JSON.parse(text) as Record<string, unknown>;
				if (typeof j?.message === 'string') msg = j.message;
			} catch {
				/* ignore parse error */
			}
			toasts.push(msg);
			throw new Error('http');
		}

		await invalidateAll();
		toasts.success('Touch logged · follow-up booked');
	}

	async function selectStage(stage: Stage) {
		if (stage === lead.stage) return;
		if (stage === 'won') return void (wonOpen = true);
		if (stage === 'lost') return void (lostOpen = true);
		if (mutating) return; // duplicate-submit guard
		mutating = true;
		const snapshot = lead;
		lead = patchRecord(lead, { stage }); // optimistic stage
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				lead = snapshot; // rollback
				toasts.push(`Stage update failed: ${msg}`);
				return;
			}
		} catch {
			lead = snapshot; // rollback on network error
			toasts.push('Stage update failed — server error');
			return;
		} finally {
			mutating = false;
		}
		await invalidateAll(); // $effect reconciles shadow with server truth
		toasts.push(`Moved to ${stageLabel(stage)}`);
	}

	async function confirmWon(payload: MoveStagePayload) {
		if (mutating) return;
		mutating = true;
		// Don't close wonOpen yet — modal stays open (showing "Saving…") so the user's
		// input (org name, deal value, date) is preserved if the request fails.
		const snapshot = lead;
		lead = patchRecord(lead, { stage: 'won' }); // optimistic stage update
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'won', ...payload })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				lead = snapshot; // rollback
				toasts.push(`Won capture failed: ${msg}`);
				return; // wonOpen stays true → modal remains with user's data intact
			}
		} catch {
			lead = snapshot; // rollback on network error
			toasts.push('Won capture failed — server error');
			return;
		} finally {
			mutating = false;
		}
		wonOpen = false; // close modal only on success
		await invalidateAll();
		toasts.success('Deal won — captured 🎉');
	}

	async function confirmLost(reason: LostReason, note?: string) {
		void note;
		if (mutating) return;
		mutating = true;
		// Same pattern: keep lostOpen = true until save succeeds so user's reason is preserved.
		const snapshot = lead;
		lead = patchRecord(lead, { stage: 'lost' }); // optimistic stage update
		try {
			const res = await fetch(`/api/leads/${lead.id}/stage`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stage: 'lost', lostReason: reason })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				lead = snapshot; // rollback
				toasts.push(`Mark lost failed: ${msg}`);
				return; // lostOpen stays true → modal remains open
			}
		} catch {
			lead = snapshot; // rollback on network error
			toasts.push('Mark lost failed — server error');
			return;
		} finally {
			mutating = false;
		}
		lostOpen = false; // close modal only on success
		await invalidateAll();
		toasts.push('Marked lost — still searchable');
	}

	async function confirmDiscard() {
		if (mutating) return;
		mutating = true;
		try {
			const res = await fetch(`/api/leads/${lead.id}/discard`, { method: 'DELETE' });
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Discard failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Discard failed — server error');
			return;
		} finally {
			mutating = false;
		}
		discardOpen = false; // close modal only on success
		await goto('/leads');
	}

	async function confirmReassign(ownerId: string) {
		if (mutating) return; // duplicate-submit guard
		mutating = true;
		reassignOpen = false; // reassign modal has a single select — safe to close immediately
		const snapshot = lead;
		lead = patchRecord(lead, { ownerId }); // optimistic owner
		try {
			const res = await fetch(`/api/leads/${lead.id}/owner`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ownerId })
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				lead = snapshot; // rollback
				toasts.push(`Reassign failed: ${msg}`);
				return;
			}
		} catch {
			lead = snapshot; // rollback on network error
			toasts.push('Reassign failed — server error');
			return;
		} finally {
			mutating = false;
		}
		await invalidateAll(); // $effect reconciles shadow with server truth
		toasts.success('Lead reassigned');
	}
</script>

<svelte:head><title>{lead.name} · Veent CRM</title></svelte:head>

{#if navLoading}
	<DetailSkeleton />
{:else}
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
					<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">
						{lead.name}
					</h1>
					<StageChip stage={lead.stage} />
					<AgeBadge label={lead.age.label} type={lead.age.type} />
				</div>
				<div class="mt-1 font-mono text-[12.5px] text-ink-400">
					{lead.handle} · {lead.category} · {lead.location}
				</div>
			</div>
			<div class="flex items-center gap-3">
				{#if canEdit}
					<a
						href="/leads/{lead.id}/edit"
						class="rounded-control border border-hairline bg-panel px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-panel-sunken"
					>
						Edit
					</a>
					<button
						disabled={mutating}
						onclick={() => (discardOpen = true)}
						class="rounded-control border border-hairline bg-panel px-3 py-1.5 text-[12.5px] font-medium text-red-500 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
					>
						Discard
					</button>
				{/if}
				<div class="flex items-center gap-2 text-[12.5px] text-ink-500">
					owner <Avatar name={ownerName} />
				</div>
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
						{#each fields as f (f.label)}
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

				{#if canEdit}
					<LogTouchForm onSubmit={logTouch} />
				{/if}
			</div>

			<!-- RIGHT RAIL -->
			<div class="flex flex-col gap-3.5">
				<StageControl current={lead.stage} disabled={!canEdit || mutating} onSelect={selectStage} />

				<div class="flex flex-col gap-2.5 rounded-control border border-hairline bg-panel p-4">
					<button
						disabled={!canEdit || mutating}
						onclick={() => (wonOpen = true)}
						class="flex h-[38px] items-center justify-center gap-1.5 rounded-control bg-fresh text-[13px] font-semibold text-white disabled:opacity-50"
					>
						<Icon name="check" size={15} stroke={2.2} />
						Mark won
					</button>
					<button
						disabled={!canEdit || mutating}
						onclick={() => (lostOpen = true)}
						class="h-9 rounded-control border border-hairline bg-panel text-[13px] font-medium disabled:opacity-50"
						style="color:#71717a"
					>
						Mark lost
					</button>
				</div>

				<div class="rounded-control border border-hairline bg-panel p-4">
					<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
						Owner
					</div>
					<div class="mb-3 flex items-center gap-2.5">
						<Avatar name={ownerName} size="lg" />
						<span class="text-[13px] font-semibold">{ownerName ?? 'Unassigned'}</span>
					</div>
					<button
						disabled={!canReassign(data.me) || mutating}
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

				<ActivityTimeline
					activities={data.activities}
					leadHistory={data.leadHistory}
					users={data.users}
				/>
			</div>
		</div>
	</div>
{/if}

{#if wonOpen}
	<WonCaptureModal
		open={true}
		leadName={lead.name}
		saving={mutating}
		onclose={() => (wonOpen = false)}
		onconfirm={confirmWon}
	/>
{/if}
{#if lostOpen}
	<LostReasonModal
		open={true}
		leadName={lead.name}
		saving={mutating}
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
{#if discardOpen}
	<DiscardIssueModal
		open={true}
		leadName={lead.name}
		saving={mutating}
		onclose={() => (discardOpen = false)}
		onconfirm={confirmDiscard}
	/>
{/if}
