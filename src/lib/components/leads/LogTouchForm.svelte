<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { ACTIVITY_CHANNELS } from '$lib/zod/schemas';
	import type { ActivityChannel, ActivityOutcome, AddActivityInput } from '$lib/types';

	let {
		onSubmit,
		disabled = false
	}: { onSubmit: (input: AddActivityInput) => void | Promise<void>; disabled?: boolean } = $props();

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
	const outcomeOpts: { key: ActivityOutcome; label: string }[] = [
		{ key: 'sent', label: 'sent' },
		{ key: 'replied', label: 'replied' },
		{ key: 'no_response', label: 'no reply' },
		{ key: 'rejected', label: 'rejected' }
	];
	const followOpts = [1, 3, 7, 14];

	let channel = $state<ActivityChannel>('fb_dm');
	let outcome = $state<ActivityOutcome>('replied');
	let followUpInDays = $state(3);
	let note = $state('');
	let submitting = $state(false);

	const pill = (active: boolean, mono = false) =>
		`h-7 px-2.5 rounded-[7px] text-[12px] ${mono ? 'font-mono' : ''} ${active ? 'font-semibold' : 'font-medium'} border ${active ? 'border-primary bg-[rgba(192,54,44,0.08)] text-primary' : 'border-hairline bg-panel text-ink-600'}`;

	async function submit() {
		submitting = true;
		try {
			await onSubmit({ channel, outcome, followUpInDays, note: note.trim() || undefined });
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
				{#each channelOpts as c}
					<button class={pill(channel === c.key)} onclick={() => (channel = c.key)}
						>{c.label}</button
					>
				{/each}
			</div>
		</div>
		<div class="min-w-[130px] flex-1">
			<div class="mb-1.5 text-[11px] text-ink-300">Outcome</div>
			<div class="flex flex-wrap gap-1.5">
				{#each outcomeOpts as o}
					<button class={pill(outcome === o.key)} onclick={() => (outcome = o.key)}
						>{o.label}</button
					>
				{/each}
			</div>
		</div>
		<div class="min-w-[130px]">
			<div class="mb-1.5 text-[11px] text-ink-300">Follow up in</div>
			<div class="flex gap-1.5">
				{#each followOpts as f}
					<button class={pill(followUpInDays === f, true)} onclick={() => (followUpInDays = f)}>
						{f}d
					</button>
				{/each}
			</div>
		</div>
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
