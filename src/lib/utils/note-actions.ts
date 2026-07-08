/**
 * Shared add/edit-note fetch handlers for the lead and organizer detail pages
 * (GitHub #192/#193). Both pages wire the same `NotesPanel`/`NotesModal` pair to
 * a per-parent "add" endpoint plus the shared `/api/notes/[id]` PATCH endpoint —
 * this is the one place that logic lives, so the two pages don't drift.
 */
import { invalidateAll } from '$app/navigation';
import { toasts } from '$lib/stores/toasts.svelte';

/**
 * POST/PATCH `body` to `url`, surfacing the server's own error message (as sent by
 * SvelteKit's `error(status, message)` — JSON `{ message }`) when the request
 * fails, falling back to a generic message only when the body can't be parsed.
 */
async function submitNote(url: string, method: 'POST' | 'PATCH', body: unknown, action: string) {
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		toasts.push(`${action} failed — server error`);
		throw new Error('network');
	}

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		let msg = `${action} failed — please try again`;
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
}

/** `addUrl` is the parent-scoped create endpoint, e.g. `/api/leads/[id]/notes`. */
export function createNoteHandlers(addUrl: string) {
	return {
		addNote: (content: string) => submitNote(addUrl, 'POST', { content }, 'Note'),
		editNote: (noteId: string, content: string) =>
			submitNote(`/api/notes/${noteId}`, 'PATCH', { content }, 'Note update')
	};
}
