<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import NotesModal from '$lib/components/shared/NotesModal.svelte';
	import { relativeFromNow } from '$lib/utils/dates';
	import type { Note } from '$lib/types';

	let {
		notes,
		currentUserId,
		onSubmit,
		onEdit
	}: {
		notes: Note[];
		currentUserId: string;
		onSubmit: (content: string) => void | Promise<void>;
		onEdit: (noteId: string, content: string) => void | Promise<void>;
	} = $props();

	// Newest first (GitHub #192/#193 AC) — the server already orders this way, but
	// re-sorting client-side keeps the freshly-added note first without waiting on
	// the invalidateAll() round trip's exact ordering.
	const ordered = $derived([...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

	let modalOpen = $state(false);
	// `null` = composing a new note; otherwise the note being viewed/edited.
	let activeNote = $state<Note | null>(null);

	function openAdd() {
		activeNote = null;
		modalOpen = true;
	}

	function openNote(note: Note) {
		activeNote = note;
		modalOpen = true;
	}
</script>

<div class="rounded-control border border-hairline bg-panel p-4">
	<div class="mb-3 flex items-center justify-between">
		<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Notes</span>
		<Button size="sm" onclick={openAdd}>Add note</Button>
	</div>

	{#if ordered.length === 0}
		<p class="text-[13px] text-ink-300">No notes yet.</p>
	{:else}
		<div class="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
			{#each ordered as note (note.id)}
				<button
					type="button"
					class="w-full rounded-[8px] border-t border-hairline py-3 text-left first:border-t-0 first:pt-0 hover:bg-panel-sunken"
					onclick={() => openNote(note)}
				>
					<div class="mb-1 flex items-center gap-2 px-1">
						<span class="text-[12.5px] font-semibold text-ink-700">{note.authorName}</span>
						<span class="font-mono text-[11px] text-ink-200">{relativeFromNow(note.createdAt)}</span
						>
					</div>
					<p class="line-clamp-3 whitespace-pre-wrap px-1 text-[13px] leading-relaxed text-ink-600">
						{note.content}
					</p>
					<span class="mt-1 block px-1 text-[11.5px] font-medium text-blue-600">View note</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<NotesModal
	open={modalOpen}
	note={activeNote}
	{currentUserId}
	onclose={() => (modalOpen = false)}
	{onSubmit}
	{onEdit}
/>
