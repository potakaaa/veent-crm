<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Calendar } from '$lib/components/ui/calendar';
	import { today, type DateValue } from '@internationalized/date';
	import { ACTIVITY_CHANNELS } from '$lib/zod/schemas';
	import { OUTCOME_TOKENS } from '$lib/design/tokens';
	import type { ActivityChannel, ActivityOutcome, AddActivityInput, Lead } from '$lib/types';
	import {
		TEMPLATES,
		TEMPLATE_CATEGORY_LABELS,
		fillTemplate,
		type Template,
		type TemplateCategory
	} from '$lib/data/templates';

	let {
		lead,
		onSubmit,
		disabled = false
	}: {
		lead: Pick<Lead, 'name' | 'eventName'>;
		onSubmit: (input: AddActivityInput) => void | Promise<void>;
		disabled?: boolean;
	} = $props();

	const templateGroups = (['intro', 'follow-up', 'pricing'] as const).map((category) => ({
		category,
		label: TEMPLATE_CATEGORY_LABELS[category],
		items: TEMPLATES.filter((t) => t.category === category)
	})) satisfies { category: TemplateCategory; label: string; items: Template[] }[];

	let templatesOpen = $state(false);

	function applyTemplate(t: Template) {
		const filled = fillTemplate(t.body, { page: lead.name, event: lead.eventName ?? '' });
		note = note.trim() ? `${note.trimEnd()}\n\n${filled}` : filled;
		templatesOpen = false;
	}

	const channelLabels: Record<ActivityChannel, string> = {
		fb_dm: 'FB DM',
		fb_comment: 'FB comment',
		ig_dm: 'IG DM',
		email: 'Email',
		call: 'Call',
		meeting: 'Meeting',
		other: 'Other'
	};
	const channelOpts: { key: ActivityChannel; label: string }[] = ACTIVITY_CHANNELS.map((key) => ({
		key,
		label: channelLabels[key]
	}));
	const FORM_OUTCOMES = [
		'sent',
		'replied',
		'no_response',
		'rejected'
	] as const satisfies readonly ActivityOutcome[];
	const outcomeOpts = FORM_OUTCOMES.map((key) => ({ key, label: OUTCOME_TOKENS[key].label }));
	const followOpts = [1, 3, 7, 14];

	let channel = $state<ActivityChannel>('fb_dm');
	let outcome = $state<ActivityOutcome>('replied');
	let followUpInDays = $state<number | null>(3);
	let customFollowUpDate = $state<DateValue | undefined>(undefined);
	let calendarOpen = $state(false);
	let calendarTemp = $state<DateValue | undefined>(undefined);
	let note = $state('');
	let submitting = $state(false);

	const minDate = $derived(today('Asia/Manila'));

	const customDateDisplay = $derived(
		customFollowUpDate
			? new Date(customFollowUpDate.toString() + 'T00:00:00').toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				})
			: ''
	);

	const pill = (active: boolean, mono = false) =>
		`h-7 px-2.5 rounded-[7px] text-[12px] ${mono ? 'font-mono' : ''} ${active ? 'font-semibold' : 'font-medium'} border ${active ? 'border-primary bg-[rgba(192,54,44,0.08)] text-primary' : 'border-hairline bg-panel text-ink-600'}`;

	async function submit() {
		submitting = true;
		try {
			await onSubmit({
				channel,
				outcome,
				followUpInDays: customFollowUpDate ? undefined : (followUpInDays ?? undefined),
				followUpAt: customFollowUpDate ? customFollowUpDate.toString() : undefined,
				note: note.trim() || undefined
			});
			note = '';
		} catch {
			// errors already surfaced as toasts by the onSubmit handler
		} finally {
			submitting = false;
		}
	}
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Log a touch</div>
	<div class="mb-3 flex flex-wrap gap-2.5">
		<div class="min-w-[130px] flex-1">
			<div class="mb-1.5 text-[11px] text-ink-300">Channel</div>
			<div class="flex flex-wrap gap-1.5">
				{#each channelOpts as c (c.key)}
					<button class={pill(channel === c.key)} onclick={() => (channel = c.key)}
						>{c.label}</button
					>
				{/each}
			</div>
		</div>
		<div class="min-w-[130px] flex-1">
			<div class="mb-1.5 text-[11px] text-ink-300">Outcome</div>
			<div class="flex flex-wrap gap-1.5">
				{#each outcomeOpts as o (o.key)}
					<button class={pill(outcome === o.key)} onclick={() => (outcome = o.key)}
						>{o.label}</button
					>
				{/each}
			</div>
		</div>
		<div class="min-w-[130px]">
			<div class="mb-1.5 text-[11px] text-ink-300">Follow up in</div>
			<div class="flex flex-wrap gap-1.5">
				{#each followOpts as f (f)}
					<button
						class={pill(followUpInDays === f && !customFollowUpDate, true)}
						onclick={() => {
							followUpInDays = f;
							customFollowUpDate = undefined;
						}}
					>
						{f}d
					</button>
				{/each}
				{#if customFollowUpDate}
					<button
						class={pill(true)}
						onclick={() => {
							customFollowUpDate = undefined;
							followUpInDays = 3;
						}}
						aria-label="Clear custom date"
					>
						{customDateDisplay} ×
					</button>
				{:else}
					<Dialog.Root
						bind:open={calendarOpen}
						onOpenChange={(o) => {
							if (o) calendarTemp = customFollowUpDate;
						}}
					>
						<Dialog.Trigger class={pill(false)} aria-label="Pick a specific follow-up date">
							Pick date
						</Dialog.Trigger>
						<Dialog.Content class="w-[min(92vw,360px)] gap-0 p-5" showCloseButton={false}>
							<Dialog.Header class="mb-3 p-0">
								<Dialog.Title>Follow-up date</Dialog.Title>
							</Dialog.Header>
							<div class="rounded-xl bg-panel-sunken p-3">
								<Calendar
									type="single"
									bind:value={calendarTemp}
									minValue={minDate}
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
										if (calendarTemp) {
											customFollowUpDate = calendarTemp;
											followUpInDays = null;
										}
										calendarOpen = false;
									}}
									class="rounded-control bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
								>
									Done
								</button>
							</div>
						</Dialog.Content>
					</Dialog.Root>
				{/if}
			</div>
		</div>
	</div>
	<div class="mb-2 flex items-center justify-between">
		<div class="text-[11px] text-ink-300">Notes</div>
		<Popover.Root bind:open={templatesOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						disabled={disabled || submitting}
						class="h-7 rounded-[7px] border border-hairline bg-panel px-2.5 text-[12px] font-medium text-ink-600 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Templates
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" sideOffset={6} class="w-80">
				{#each templateGroups as group (group.category)}
					<div>
						<div class="mb-1 font-mono text-[10px] uppercase tracking-[0.5px] text-ink-300">
							{group.label}
						</div>
						<div class="flex flex-col gap-1">
							{#each group.items as t (t.id)}
								<button
									class="rounded-[7px] border border-hairline bg-panel px-2.5 py-1.5 text-left text-[12px] text-ink-600 hover:border-primary hover:text-primary"
									onclick={() => applyTemplate(t)}
								>
									{t.label}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</Popover.Content>
		</Popover.Root>
	</div>
	<Textarea
		bind:value={note}
		placeholder="What did you say / what happened? (e.g. sent pricing tiers + sample contract)"
		class="min-h-16 resize-y"
	/>
	<div class="mt-3 flex items-center justify-between">
		<span class="text-[12px] text-ink-200">
			Logs a touch and books a follow-up reminder (Asia/Manila).
		</span>
		<Button {disabled} loading={submitting} loadingText="Logging…" onclick={submit}
			>Log touch</Button
		>
	</div>
</div>
