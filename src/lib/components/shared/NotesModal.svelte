<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { relativeFromNow } from '$lib/utils/dates';
	import type { Note } from '$lib/types';

	// Universal notes modal — one component covers all three interactions (GitHub
	// #192/#193 follow-up): `note` absent = composing a brand-new note; `note` present
	// = viewing it read-only first, with an in-place "Edit" toggle for the author only.
	let {
		open,
		note = null,
		currentUserId,
		onclose,
		onSubmit,
		onEdit
	}: {
		open: boolean;
		note?: Note | null;
		currentUserId: string;
		onclose: () => void;
		onSubmit: (content: string) => void | Promise<void>;
		onEdit: (noteId: string, content: string) => void | Promise<void>;
	} = $props();

	const isNew = $derived(note === null);
	const canEdit = $derived(note !== null && note.authorId === currentUserId);

	let content = $state('');
	let editing = $state(false);
	let submitting = $state(false);

	// Reset composing state to match whichever note (or "new") the panel opened us
	// for — re-opening the same modal instance for a different note must not leak
	// the previous note's draft.
	$effect(() => {
		if (open) {
			content = note?.content ?? '';
			editing = isNew;
		}
	});

	async function submit() {
		const trimmed = content.trim();
		if (!trimmed || submitting) return;
		submitting = true;
		try {
			if (isNew) {
				await onSubmit(trimmed);
			} else if (note) {
				await onEdit(note.id, trimmed);
			}
			onclose();
		} catch {
			// errors already surfaced as toasts by the onSubmit/onEdit handler
		} finally {
			submitting = false;
		}
	}

	function startEdit() {
		content = note?.content ?? '';
		editing = true;
	}
</script>

<Modal
	{open}
	title={isNew ? 'Add note' : editing ? 'Edit note' : 'Note'}
	subtitle={note ? `${note.authorName} · ${relativeFromNow(note.createdAt)}` : undefined}
	width={480}
	{onclose}
>
	{#if isNew || editing}
		<Textarea
			bind:value={content}
			placeholder="Add a note…"
			class="min-h-40 resize-y"
			disabled={submitting}
		/>
	{:else if note}
		<p class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-600">{note.content}</p>
	{/if}

	{#snippet footer()}
		{#if isNew || editing}
			<Button variant="outline" class="flex-1" onclick={onclose} disabled={submitting}
				>Cancel</Button
			>
			<Button
				class="flex-[2]"
				disabled={!content.trim()}
				loading={submitting}
				loadingText="Saving…"
				onclick={submit}
			>
				{isNew ? 'Add note' : 'Save changes'}
			</Button>
		{:else if canEdit}
			<Button variant="outline" class="flex-1" onclick={onclose}>Close</Button>
			<Button class="flex-[2]" onclick={startEdit}>Edit</Button>
		{:else}
			<Button class="w-full" onclick={onclose}>Close</Button>
		{/if}
	{/snippet}
</Modal>
