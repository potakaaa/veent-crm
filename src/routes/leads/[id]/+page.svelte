<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { DetailSkeleton } from '$lib/components/shared/skeletons';
	import { patchRecord } from '$lib/utils/optimistic';
	import { Button } from '$lib/components/ui/button';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import PlatformBadge from '$lib/components/shared/PlatformBadge.svelte';
	import StageChip from '$lib/components/shared/StageChip.svelte';
	import AgeBadge from '$lib/components/shared/AgeBadge.svelte';
	import FutureEventsBadge from '$lib/components/shared/FutureEventsBadge.svelte';
	import AppealScoreBadge from '$lib/components/AppealScoreBadge.svelte';
	import { computeAppealScore, today } from '$lib/appeal-score';
	import DedupBanner from '$lib/components/leads/DedupBanner.svelte';
	import ActivityTimeline from '$lib/components/leads/ActivityTimeline.svelte';
	import LogTouchForm from '$lib/components/leads/LogTouchForm.svelte';
	import StageControl from '$lib/components/leads/StageControl.svelte';
	import WonCaptureModal from '$lib/components/leads/WonCaptureModal.svelte';
	import LostReasonModal from '$lib/components/leads/LostReasonModal.svelte';
	import ReassignModal from '$lib/components/leads/ReassignModal.svelte';
	import DiscardIssueModal from '$lib/components/leads/DiscardIssueModal.svelte';
	import MeetingsPanel from '$lib/components/meetings/MeetingsPanel.svelte';
	import { Tabs } from '$lib/components/ui/tabs';
	import * as Popover from '$lib/components/ui/popover';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canEditLead, canReassign } from '$lib/utils/permissions';
	import { riskMeta } from '$lib/utils/risk';
	import { formatDate, followUpDate } from '$lib/utils/dates';
	import { stageColor, stageLabel } from '$lib/utils/stages';
	import type { AddActivityInput, LostReason, MoveStagePayload, Stage } from '$lib/types';

	let { data } = $props();

	// Optimistic shadow of the lead record. E1: a writable `$derived` IS the reconcile
	// mechanism — reassign for an optimistic stage/owner change; it auto-resyncs to server
	// truth whenever `data.lead` changes (i.e. after invalidateAll()).
	let lead = $derived(data.lead);
	const canEdit = $derived(canEditLead(data.me, lead));
	const ownerName = $derived(data.users.find((u) => u.id === lead.ownerId)?.name ?? null);
	const risk = $derived(riskMeta(lead.urgency));

	// Most recent ownership change (LEAD-2). leadHistory is ascending by `at`, so reversing
	// and taking the first `owner_id` row gives the latest reassignment. Pure client-side
	// derivation from already-loaded data — no server query.
	const lastReassignment = $derived(
		[...data.leadHistory].reverse().find((h) => h.field === 'owner_id')
	);
	const nameOfOwner = (id: string | null) =>
		id ? (data.users.find((u) => u.id === id)?.name ?? 'Unassigned') : 'Unassigned';
	const reassignmentFromName = $derived(
		lastReassignment ? nameOfOwner(lastReassignment.oldValue) : null
	);

	// Full chronological ownership chain (LEAD-3). owner_id rows are ascending by `at`.
	// Chain = first row's oldValue, then each row's newValue, all resolved to names.
	// Pure client-side derivation from already-loaded data — no server query.
	const ownershipChain = $derived.by(() => {
		const rows = data.leadHistory.filter((h) => h.field === 'owner_id');
		if (rows.length === 0) return [ownerName ?? 'Unassigned'];
		return [nameOfOwner(rows[0].oldValue), ...rows.map((r) => nameOfOwner(r.newValue))];
	});

	// Onboarding surfaces (tab + goLiveDate) are available for won AND live leads (GitHub #194).
	const onboardingStage = (s: string) => s === 'won' || s === 'live';

	let activeTab = $state<'overview' | 'meetings' | 'onboarding'>(
		onboardingStage(lead.stage) ? 'onboarding' : 'overview'
	);

	// Onboarding tab is only available for won/live leads. If the lead moves away from
	// those stages while the onboarding tab is active, fall back to Overview.
	$effect(() => {
		if (!onboardingStage(lead.stage) && activeTab === 'onboarding') activeTab = 'overview';
	});

	// Tab strip definition (shared Tabs component, underline variant). Onboarding is
	// only offered for won/live leads.
	const detailTabs = $derived([
		{ value: 'overview', label: 'Overview' },
		{ value: 'meetings', label: 'Meetings' },
		...(onboardingStage(lead.stage) ? [{ value: 'onboarding', label: 'Onboarding' }] : [])
	]);

	// Editable onboarding form fields — resynced whenever server truth changes.
	let onboardingNotes = $state('');
	let contractUrl = $state('');
	let onboardingStartDate = $state('');
	let goLiveDate = $state('');
	let eventDate = $state('');
	let savingOnboarding = $state(false);

	// Agreements form fields — resynced whenever server truth changes.
	let feeStructure = $state<'legacy' | 'new' | null>(null);
	let transactionFeePct = $state(7);
	let convenienceFeePesos = $state(20);
	let serviceFeePct = $state(3);
	let serviceFeePerTicketPesos = $state(20);
	let bankChargesAbsorbed = $state<boolean | null>(null);
	let hasFutureEvents = $state(false);

	$effect(() => {
		onboardingNotes = lead.onboardingNotes ?? '';
		contractUrl = lead.contractUrl ?? '';
		onboardingStartDate = lead.onboardingStartDate ?? '';
		goLiveDate = lead.goLiveDate ?? '';
		eventDate = lead.eventDate ?? '';
		feeStructure = lead.feeStructure ?? null;
		transactionFeePct = lead.transactionFeePct ?? 7;
		convenienceFeePesos = lead.convenienceFeePesos ?? 20;
		serviceFeePct = lead.serviceFeePct ?? 3;
		serviceFeePerTicketPesos = lead.serviceFeePerTicketPesos ?? 20;
		bankChargesAbsorbed = lead.bankChargesAbsorbed ?? null;
		hasFutureEvents = lead.hasFutureEvents ?? false;
	});

	async function saveOnboarding() {
		if (savingOnboarding) return;
		savingOnboarding = true;
		try {
			const res = await fetch(`/api/leads/${lead.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: lead.name,
					category: lead.category,
					onboardingNotes,
					contractUrl,
					onboardingStartDate,
					goLiveDate,
					eventDate,
					feeStructure: feeStructure ?? undefined,
					transactionFeePct,
					convenienceFeePesos,
					serviceFeePct,
					serviceFeePerTicketPesos,
					bankChargesAbsorbed: bankChargesAbsorbed ?? undefined,
					hasFutureEvents
				})
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Onboarding save failed: ${msg}`);
				return;
			}
		} catch {
			toasts.push('Onboarding save failed — server error');
			return;
		} finally {
			savingOnboarding = false;
		}
		await invalidateAll();
		toasts.success('Onboarding saved');
	}

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
		},
		...(lead.firstAnnouncedDate
			? [{ label: 'First announced', value: lead.firstAnnouncedDate }]
			: []),
		...(lead.firstReachedOutDate
			? [{ label: 'First reached out', value: lead.firstReachedOutDate }]
			: [])
	]);

	async function logTouch(input: AddActivityInput) {
		const followUpAt =
			input.followUpAt ??
			(input.followUpInDays != null ? followUpDate(input.followUpInDays) : undefined);

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
		activeTab = 'onboarding';
		toasts.success('Deal won — fill in onboarding details below 🎉');
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
	<div class="px-7 pb-16 pt-6">
		<a
			href="/leads"
			class="mb-3.5 flex items-center gap-1.5 text-[12.5px] text-ink-400 hover:text-ink"
		>
			<Icon name="back" size={14} stroke={2} /> Back to leads
		</a>

		<!-- header -->
		<div class="mb-4 overflow-hidden rounded-frame border border-hairline bg-panel shadow-frame">
			<div class="h-[3px]" style="background:{stageColor(lead.stage)}"></div>
			<div class="flex flex-col gap-3 px-[18px] py-4 lg:flex-row lg:items-center lg:gap-3.5">
				<!-- avatar + name + badges + subline (always visible, reflows at all widths) -->
				<div class="flex min-w-0 items-start gap-3 lg:flex-1 lg:items-center">
					<PlatformBadge platform={lead.platform} size="lg" />
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
							<h1
								class="text-[20px] font-extrabold tracking-[-0.6px] break-words text-ink sm:text-[23px]"
							>
								{lead.name}
							</h1>
							<StageChip stage={lead.stage} />
							<AgeBadge label={lead.age.label} type={lead.age.type} />
							{#if lead.hasFutureEvents}
								<FutureEventsBadge />
							{/if}
							<AppealScoreBadge
								score={computeAppealScore(
									lead.eventDate,
									lead.firstAnnouncedDate,
									lead.firstReachedOutDate,
									today()
								)}
							/>
						</div>
						<div class="mt-[5px] font-mono text-[12px] text-ink-300">
							{lead.category} · {lead.location}
						</div>
					</div>
				</div>

				<!-- mobile-only: divider + owner/next-action row (own line, never shares the name row) -->
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 lg:hidden"
				>
					<div class="flex items-center gap-2 text-[12.5px] text-ink-500">
						owner <Avatar name={ownerName} />
					</div>
					<div class="text-right">
						<div class="font-mono text-[9.5px] uppercase tracking-[0.6px] text-ink-200">
							next action
						</div>
						<div class="mt-0.5 text-[13.5px] font-bold" style="color:{risk.color}">
							{risk.label}
						</div>
					</div>
				</div>

				<!-- desktop-only: next-action risk block, own column -->
				<div class="hidden text-right lg:block lg:shrink-0">
					<div class="font-mono text-[9.5px] uppercase tracking-[0.6px] text-ink-200">
						next action
					</div>
					<div class="mt-0.5 text-[13.5px] font-bold" style="color:{risk.color}">{risk.label}</div>
				</div>

				<!-- desktop-only: actions + owner, own column -->
				<div class="hidden items-center gap-3 border-l border-hairline pl-3.5 lg:flex lg:shrink-0">
					{#if canEdit}
						<Button href="/leads/{lead.id}/edit" variant="outline" size="sm">Edit</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={mutating}
							onclick={() => (discardOpen = true)}
							class="text-red-500 hover:border-red-300 hover:bg-red-50"
						>
							Discard
						</Button>
					{/if}
					<div class="flex items-center gap-2 text-[12.5px] text-ink-500">
						owner <Avatar name={ownerName} />
					</div>
				</div>

				<!-- mobile-only: edit/discard actions, own row -->
				{#if canEdit}
					<div class="flex items-center gap-2 lg:hidden">
						<Button href="/leads/{lead.id}/edit" variant="outline" size="sm" class="flex-1">
							Edit
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={mutating}
							onclick={() => (discardOpen = true)}
							class="flex-1 text-red-500 hover:border-red-300 hover:bg-red-50"
						>
							Discard
						</Button>
					</div>
				{/if}
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

		<!-- tab bar -->
		<div class="mb-4">
			<Tabs
				variant="underline"
				ariaLabel="Lead detail sections"
				tabs={detailTabs}
				value={activeTab}
				onValueChange={(v) => (activeTab = v as 'overview' | 'meetings' | 'onboarding')}
			/>
		</div>

		{#if activeTab === 'meetings'}
			<MeetingsPanel meetings={data.meetings} users={data.users} me={data.me} leadId={lead.id} />
		{/if}

		{#if activeTab === 'onboarding'}
			<div class="space-y-[18px]">
				<!-- Won context — read-only -->
				<div class="rounded-control border border-hairline bg-panel p-4">
					<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
						Won details
					</div>
					<div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
						<div>
							<div class="mb-0.5 text-[11px] text-ink-300">Signed org</div>
							<div class="font-mono text-[13px] text-ink">{lead.signedOrg ?? '—'}</div>
						</div>
						<!-- TODO(LEAD-1): restore deal value display once un-hidden -->
						<div>
							<div class="mb-0.5 text-[11px] text-ink-300">Signed date</div>
							<div class="font-mono text-[13px] text-ink">
								{lead.signedDate
									? new Date(lead.signedDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})
									: '—'}
							</div>
						</div>
					</div>
				</div>

				<!-- Onboarding editable form -->
				<div class="rounded-control border border-hairline bg-panel p-4">
					<div class="mb-4 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
						Onboarding info
					</div>
					<div class="space-y-4">
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label class="mb-1 block text-[11px] text-ink-300" for="ob-start"
									>Onboarding start date</label
								>
								<input
									id="ob-start"
									type="date"
									bind:value={onboardingStartDate}
									class="h-[34px] w-full rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
							<div>
								<label class="mb-1 block text-[11px] text-ink-300" for="ob-golive"
									>Ticket Sale Start</label
								>
								<input
									id="ob-golive"
									type="date"
									bind:value={goLiveDate}
									class="h-[34px] w-full rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
							<div>
								<label class="mb-1 block text-[11px] text-ink-300" for="ob-eventdate"
									>Event Date</label
								>
								<input
									id="ob-eventdate"
									type="date"
									bind:value={eventDate}
									class="h-[34px] w-full rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>
						</div>
						<div>
							<label class="mb-1 block text-[11px] text-ink-300" for="ob-contract"
								>Contract URL</label
							>
							<input
								id="ob-contract"
								type="url"
								bind:value={contractUrl}
								placeholder="https://…"
								class="h-[34px] w-full rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink placeholder:text-ink-200 focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div>
							<label class="mb-1 block text-[11px] text-ink-300" for="ob-notes"
								>Onboarding notes</label
							>
							<textarea
								id="ob-notes"
								bind:value={onboardingNotes}
								rows="5"
								placeholder="Key contacts, access handover steps, blockers…"
								class="w-full rounded-control border border-hairline bg-panel px-2.5 py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-200 focus:outline-none focus:ring-1 focus:ring-primary"
							></textarea>
						</div>
					</div>
				</div>

				<!-- Agreements -->
				<div class="rounded-control border border-hairline bg-panel p-4">
					<div class="mb-4 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
						Agreements
					</div>
					<div class="space-y-5">
						<!-- Fee structure toggle -->
						<div>
							<div class="mb-2 text-[11px] text-ink-300">Fee structure</div>
							<div
								class="inline-flex rounded-[11px] border border-hairline bg-panel-sunken p-1 gap-0.5"
							>
								<button
									type="button"
									onclick={() => (feeStructure = 'legacy')}
									class="rounded-[6px] px-4 py-1.5 text-[12px] font-medium transition-colors
										{feeStructure === 'legacy' ? 'bg-primary text-white shadow-sm' : 'text-ink-400 hover:text-ink'}"
								>
									Legacy
								</button>
								<button
									type="button"
									onclick={() => (feeStructure = 'new')}
									class="rounded-[6px] px-4 py-1.5 text-[12px] font-medium transition-colors
										{feeStructure === 'new' ? 'bg-primary text-white shadow-sm' : 'text-ink-400 hover:text-ink'}"
								>
									New structure
								</button>
							</div>

							{#if feeStructure === 'legacy'}
								<div class="mt-3 grid grid-cols-2 gap-4 max-w-sm">
									<div>
										<label class="mb-1.5 block text-[11px] text-ink-300" for="fee-txn"
											>Transaction fee</label
										>
										<div
											class="flex items-stretch overflow-hidden rounded-control border border-hairline bg-panel focus-within:ring-1 focus-within:ring-primary"
										>
											<input
												id="fee-txn"
												type="number"
												min="0"
												max="100"
												step="0.1"
												bind:value={transactionFeePct}
												class="h-[48px] w-full border-0 bg-transparent px-3 font-mono text-[22px] font-semibold text-ink focus:outline-none focus:ring-0"
											/>
											<span
												class="flex items-center bg-panel-sunken px-3 font-mono text-[16px] font-medium text-ink-400"
												>%</span
											>
										</div>
									</div>
									<div>
										<label class="mb-1.5 block text-[11px] text-ink-300" for="fee-conv"
											>Convenience fee / ticket</label
										>
										<div
											class="flex items-stretch overflow-hidden rounded-control border border-hairline bg-panel focus-within:ring-1 focus-within:ring-primary"
										>
											<span
												class="flex items-center bg-panel-sunken px-3 font-mono text-[16px] font-medium text-ink-400"
												>₱</span
											>
											<input
												id="fee-conv"
												type="number"
												min="0"
												step="1"
												bind:value={convenienceFeePesos}
												class="h-[48px] w-full border-0 bg-transparent px-3 font-mono text-[22px] font-semibold text-ink focus:outline-none focus:ring-0"
											/>
										</div>
									</div>
								</div>
							{:else if feeStructure === 'new'}
								<div class="mt-3 grid grid-cols-2 gap-4 max-w-sm">
									<div>
										<label class="mb-1.5 block text-[11px] text-ink-300" for="fee-svc"
											>Service fee</label
										>
										<div
											class="flex items-stretch overflow-hidden rounded-control border border-hairline bg-panel focus-within:ring-1 focus-within:ring-primary"
										>
											<input
												id="fee-svc"
												type="number"
												min="0"
												max="100"
												step="0.1"
												bind:value={serviceFeePct}
												class="h-[48px] w-full border-0 bg-transparent px-3 font-mono text-[22px] font-semibold text-ink focus:outline-none focus:ring-0"
											/>
											<span
												class="flex items-center bg-panel-sunken px-3 font-mono text-[16px] font-medium text-ink-400"
												>%</span
											>
										</div>
									</div>
									<div>
										<label class="mb-1.5 block text-[11px] text-ink-300" for="fee-svc-ticket"
											>Per ticket</label
										>
										<div
											class="flex items-stretch overflow-hidden rounded-control border border-hairline bg-panel focus-within:ring-1 focus-within:ring-primary"
										>
											<span
												class="flex items-center bg-panel-sunken px-3 font-mono text-[16px] font-medium text-ink-400"
												>₱</span
											>
											<input
												id="fee-svc-ticket"
												type="number"
												min="0"
												step="1"
												bind:value={serviceFeePerTicketPesos}
												class="h-[48px] w-full border-0 bg-transparent px-3 font-mono text-[22px] font-semibold text-ink focus:outline-none focus:ring-0"
											/>
										</div>
									</div>
								</div>
							{/if}
						</div>

						<!-- Bank charges -->
						<div>
							<div class="mb-2 text-[11px] text-ink-300">Bank charges</div>
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<button
									type="button"
									onclick={() => (bankChargesAbsorbed = false)}
									class="rounded-control border p-4 text-left transition-colors
										{bankChargesAbsorbed === false
										? 'border-primary bg-primary/5'
										: 'border-hairline bg-panel hover:border-primary/40'}"
								>
									<div class="mb-0.5 text-[13px] font-semibold text-ink">Pass on to client</div>
									<div class="text-[11px] text-ink-400">
										Bank charges are added to the client's invoice
									</div>
								</button>
								<button
									type="button"
									onclick={() => (bankChargesAbsorbed = true)}
									class="rounded-control border p-4 text-left transition-colors
										{bankChargesAbsorbed === true
										? 'border-primary bg-primary/5'
										: 'border-hairline bg-panel hover:border-primary/40'}"
								>
									<div class="mb-0.5 text-[13px] font-semibold text-ink">Absorb</div>
									<div class="text-[11px] text-ink-400">Veent covers the bank charges</div>
								</button>
							</div>
						</div>

						<!-- Future events (recurring-organizer flag, GitHub #94) -->
						<div>
							<label class="flex items-center gap-2 text-[13px] font-medium text-ink">
								<input type="checkbox" bind:checked={hasFutureEvents} class="size-4" />
								Has future events (recurring organizer)
							</label>
							<div class="mt-1 text-[11px] text-ink-400">
								Flag this organizer as a future-events prospect so they aren't lost when the current
								deal isn't a fit.
							</div>
						</div>
					</div>

					<div class="mt-5 flex justify-end">
						<Button
							onclick={saveOnboarding}
							loading={savingOnboarding}
							loadingText="Saving…"
							class="h-[34px] px-4 font-mono text-[12.5px] font-semibold"
						>
							Save
						</Button>
					</div>
				</div>
			</div>
		{/if}

		<div
			class="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_320px]"
			class:hidden={activeTab !== 'overview'}
		>
			<!-- LEFT -->
			<div>
				<div class="mb-4 rounded-control border border-hairline bg-panel p-4">
					<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
						Lead &amp; event
					</div>
					<div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
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

				{#if lead.notes}
					<div class="mb-4 rounded-control border border-hairline bg-panel p-4">
						<div class="mb-2 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">
							Notes
						</div>
						<p class="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-600">{lead.notes}</p>
					</div>
				{/if}

				<div class="mb-4">
					<ActivityTimeline
						activities={data.activities}
						leadHistory={data.leadHistory}
						users={data.users}
					/>
				</div>

				{#if canEdit}
					<LogTouchForm
						{lead}
						templates={data.templates}
						repName={data.me.name}
						onSubmit={logTouch}
					/>
				{/if}
			</div>

			<!-- RIGHT RAIL -->
			<div class="flex flex-col gap-3.5">
				<StageControl current={lead.stage} disabled={!canEdit || mutating} onSelect={selectStage} />

				<div class="flex flex-col gap-2.5 rounded-control border border-hairline bg-panel p-4">
					{#if lead.stage !== 'won' && lead.stage !== 'live'}
						<Button
							disabled={!canEdit || mutating}
							onclick={() => (wonOpen = true)}
							variant="success"
							class="h-[38px] w-full gap-1.5 text-[13px]"
						>
							<Icon name="check" size={15} stroke={2.2} />
							Mark won
						</Button>
					{/if}
					<Button
						disabled={!canEdit || mutating}
						onclick={() => (lostOpen = true)}
						variant="outline"
						class="h-9 w-full text-[13px] font-medium text-ink-500"
					>
						Mark lost
					</Button>
				</div>

				<div class="rounded-control border border-hairline bg-panel p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Owner</span>
						{#if ownershipChain.length > 1}
							<Popover.Root>
								<Popover.Trigger
									class="flex h-[22px] items-center gap-1 rounded-[6px] border border-hairline bg-panel px-1.5 font-mono text-[10.5px] text-ink-400 hover:border-primary hover:text-primary"
								>
									History
									<span aria-hidden="true" class="text-[9px] leading-none">▾</span>
								</Popover.Trigger>
								<Popover.Content align="end" class="w-64">
									<div
										class="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.4px] text-ink-300"
									>
										Ownership history
									</div>
									<div
										class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-600"
									>
										{#each ownershipChain as name, i (i)}
											<span class={i === ownershipChain.length - 1 ? 'font-semibold text-ink' : ''}
												>{name}</span
											>
											{#if i < ownershipChain.length - 1}
												<span class="text-ink-200" aria-hidden="true">→</span>
											{/if}
										{/each}
									</div>
								</Popover.Content>
							</Popover.Root>
						{/if}
					</div>
					<div class="mb-3 flex items-center gap-2.5">
						<Avatar name={ownerName} size="lg" />
						<div class="flex flex-col gap-0.5">
							<span class="flex items-center gap-1.5 text-[13px] font-semibold">
								{ownerName ?? 'Unassigned'}
								{#if lastReassignment}
									<span
										class="rounded-[4px] bg-panel-sunken px-1.5 py-px font-mono text-[10.5px] font-medium uppercase tracking-[0.5px] text-ink-400"
										title={`from ${reassignmentFromName} → ${ownerName ?? 'Unassigned'} · ${formatDate(lastReassignment.at)}`}
									>
										Reassigned
									</span>
								{/if}
							</span>
							{#if lastReassignment}
								<span class="text-[11px] text-ink-300">
									Reassigned from {reassignmentFromName}
								</span>
							{/if}
						</div>
					</div>
					<Button
						disabled={!canReassign(data.me) || mutating}
						onclick={() => (reassignOpen = true)}
						variant="outline"
						size="sm"
						class="h-[34px] w-full text-[12.5px] font-medium text-ink-600"
					>
						Reassign
					</Button>
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
					</div>
				</div>
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
