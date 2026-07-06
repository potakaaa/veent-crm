/**
 * Server-side DB access for notes (GitHub #191/#192/#193). A note is attached to
 * exactly one lead OR one organizer (XOR enforced by the crm_notes_target_ck check
 * constraint). Mirrors the leads.ts/organizers.ts convention: plain Drizzle queries,
 * no mock data.
 */
import { db } from './index';
import { crmNotes, crmUsers } from './schema';
import { eq, and, desc } from 'drizzle-orm';
import type { Note } from '$lib/types';

const noteSelection = {
	id: crmNotes.id,
	content: crmNotes.content,
	authorId: crmNotes.authorId,
	authorName: crmUsers.name,
	leadId: crmNotes.leadId,
	organizerId: crmNotes.organizerId,
	createdAt: crmNotes.createdAt
};

function dbRowToNote(row: {
	id: string;
	content: string;
	authorId: string;
	authorName: string | null;
	leadId: string | null;
	organizerId: string | null;
	createdAt: Date;
}): Note {
	return {
		id: row.id,
		content: row.content,
		authorId: row.authorId,
		authorName: row.authorName ?? 'Unknown',
		leadId: row.leadId,
		organizerId: row.organizerId,
		createdAt: row.createdAt.toISOString()
	};
}

/** Notes for a lead, newest first. */
export async function listNotesForLead(leadId: string): Promise<Note[]> {
	const rows = await db
		.select(noteSelection)
		.from(crmNotes)
		.innerJoin(crmUsers, eq(crmNotes.authorId, crmUsers.id))
		.where(eq(crmNotes.leadId, leadId))
		.orderBy(desc(crmNotes.createdAt));
	return rows.map(dbRowToNote);
}

/** Notes for an organizer, newest first. */
export async function listNotesForOrganizer(organizerId: string): Promise<Note[]> {
	const rows = await db
		.select(noteSelection)
		.from(crmNotes)
		.innerJoin(crmUsers, eq(crmNotes.authorId, crmUsers.id))
		.where(eq(crmNotes.organizerId, organizerId))
		.orderBy(desc(crmNotes.createdAt));
	return rows.map(dbRowToNote);
}

/**
 * Shared insert path for addNoteToLead/addNoteToOrganizer — only the target column
 * differs between them. `authorName` comes from the caller's already-loaded session
 * (`locals.user.name`, itself resolved from crm_users at login) rather than a fresh
 * lookup here, since it's always the acting user's own name.
 */
async function insertNote(
	target: { leadId: string; organizerId?: never } | { organizerId: string; leadId?: never },
	authorId: string,
	authorName: string,
	content: string
): Promise<Note> {
	const [inserted] = await db
		.insert(crmNotes)
		.values({ ...target, authorId, content })
		.returning({ id: crmNotes.id, createdAt: crmNotes.createdAt });
	return {
		id: inserted.id,
		content,
		authorId,
		authorName,
		leadId: target.leadId ?? null,
		organizerId: target.organizerId ?? null,
		createdAt: inserted.createdAt.toISOString()
	};
}

/** Add a note to a lead. Returns the created note with the given author name. */
export async function addNoteToLead(
	leadId: string,
	authorId: string,
	authorName: string,
	content: string
): Promise<Note> {
	return insertNote({ leadId }, authorId, authorName, content);
}

/** Add a note to an organizer. Returns the created note with the given author name. */
export async function addNoteToOrganizer(
	organizerId: string,
	authorId: string,
	authorName: string,
	content: string
): Promise<Note> {
	return insertNote({ organizerId }, authorId, authorName, content);
}

/**
 * Edit a note's content. Only the original author may edit — the WHERE clause scopes
 * the update to `id AND author_id`, so a non-owner's attempt matches zero rows and this
 * returns `null` (treated as 404 by the caller) rather than silently editing someone
 * else's note. `authorName` is the caller's own session name (see insertNote above) —
 * an update can never change ownership, so there's no need to re-resolve it from the DB.
 */
export async function updateNote(
	noteId: string,
	authorId: string,
	authorName: string,
	content: string
): Promise<Note | null> {
	const [updated] = await db
		.update(crmNotes)
		.set({ content, updatedAt: new Date() })
		.where(and(eq(crmNotes.id, noteId), eq(crmNotes.authorId, authorId)))
		.returning();
	if (!updated) return null;

	return {
		id: updated.id,
		content: updated.content,
		authorId: updated.authorId,
		authorName,
		leadId: updated.leadId,
		organizerId: updated.organizerId,
		createdAt: updated.createdAt.toISOString()
	};
}
