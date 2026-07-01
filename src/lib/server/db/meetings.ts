/**
 * Server-side DB access for meetings and meeting attendees.
 * Mirrors leads.ts: pure mappers are exported for unit tests; query/mutation
 * functions run against Postgres. All reads filter `deleted_at IS NULL`
 * (soft-delete only). List queries avoid N+1 — one query for meetings, one
 * `inArray` query for attendees, grouped in memory.
 */
import { db } from './index';
import { crmMeetings, crmMeetingAttendees, crmUsers, crmLeads } from './schema';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import type { Meeting, MeetingAttendee } from '$lib/types';

type DbMeeting = typeof crmMeetings.$inferSelect;

// ---------------------------------------------------------------------------
// Pure mapper (exported for unit tests)
// ---------------------------------------------------------------------------

export function dbRowToMeeting(
	row: DbMeeting,
	attendees: MeetingAttendee[],
	organizerName?: string | null,
	leadName?: string | null
): Meeting {
	return {
		id: row.id,
		leadId: row.leadId,
		leadName: leadName ?? undefined,
		organizerId: row.organizerId,
		organizerName: organizerName ?? undefined,
		startAt: row.startAt.toISOString(),
		meetingUrl: row.meetingUrl ?? undefined,
		notes: row.notes ?? undefined,
		outcome: row.outcome ?? undefined,
		attendees,
		createdAt: row.createdAt.toISOString()
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch attendees (with user names) for a set of meeting ids in a SINGLE query
 * and group them by meeting id. Prevents N+1 per-meeting attendee lookups.
 */
async function attendeesByMeeting(meetingIds: string[]): Promise<Map<string, MeetingAttendee[]>> {
	const map = new Map<string, MeetingAttendee[]>();
	if (meetingIds.length === 0) return map;

	const rows = await db
		.select({
			meetingId: crmMeetingAttendees.meetingId,
			userId: crmMeetingAttendees.userId,
			name: crmUsers.name
		})
		.from(crmMeetingAttendees)
		.leftJoin(crmUsers, eq(crmMeetingAttendees.userId, crmUsers.id))
		.where(inArray(crmMeetingAttendees.meetingId, meetingIds));

	for (const r of rows) {
		if (!r.userId) continue; // organizer/attendee set-null after user removal
		const list = map.get(r.meetingId) ?? [];
		list.push({ userId: r.userId, name: r.name ?? '' });
		map.set(r.meetingId, list);
	}
	return map;
}

/**
 * Fetch a single non-deleted meeting fully populated (organizer + lead names +
 * attendees). Used as the return shape for create/update. Two queries, not N+1.
 */
export async function getMeetingDetail(id: string): Promise<Meeting | null> {
	const [row] = await db
		.select({ meeting: crmMeetings, organizerName: crmUsers.name, leadName: crmLeads.name })
		.from(crmMeetings)
		.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
		.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
		.where(and(eq(crmMeetings.id, id), isNull(crmMeetings.deletedAt)))
		.limit(1);

	if (!row) return null;
	const attMap = await attendeesByMeeting([id]);
	return dbRowToMeeting(row.meeting, attMap.get(id) ?? [], row.organizerName, row.leadName);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listMeetingsForLead(leadId: string): Promise<Meeting[]> {
	const rows = await db
		.select({ meeting: crmMeetings, organizerName: crmUsers.name })
		.from(crmMeetings)
		.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
		.where(and(eq(crmMeetings.leadId, leadId), isNull(crmMeetings.deletedAt)))
		.orderBy(desc(crmMeetings.startAt));

	const attMap = await attendeesByMeeting(rows.map((r) => r.meeting.id));
	return rows.map((r) =>
		dbRowToMeeting(r.meeting, attMap.get(r.meeting.id) ?? [], r.organizerName)
	);
}

export async function listAllMeetings(): Promise<Meeting[]> {
	const rows = await db
		.select({ meeting: crmMeetings, organizerName: crmUsers.name, leadName: crmLeads.name })
		.from(crmMeetings)
		.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
		.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
		.where(isNull(crmMeetings.deletedAt))
		.orderBy(desc(crmMeetings.startAt));

	const attMap = await attendeesByMeeting(rows.map((r) => r.meeting.id));
	return rows.map((r) =>
		dbRowToMeeting(r.meeting, attMap.get(r.meeting.id) ?? [], r.organizerName, r.leadName)
	);
}

/**
 * Minimal fetch for the mutation authorization guard: id + organizerId of a
 * non-deleted meeting. Used by PATCH/DELETE before the write. Null if not found.
 */
export async function getMeeting(
	id: string
): Promise<{ id: string; organizerId: string | null } | null> {
	const [row] = await db
		.select({ id: crmMeetings.id, organizerId: crmMeetings.organizerId })
		.from(crmMeetings)
		.where(and(eq(crmMeetings.id, id), isNull(crmMeetings.deletedAt)))
		.limit(1);
	return row ?? null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createMeeting(input: {
	leadId: string;
	startAt: Date;
	organizerId?: string | null;
	meetingUrl?: string | null;
	notes?: string | null;
	outcome?: string | null;
	attendeeIds?: string[];
}): Promise<Meeting> {
	const id = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(crmMeetings)
			.values({
				leadId: input.leadId,
				startAt: input.startAt,
				organizerId: input.organizerId ?? null,
				meetingUrl: input.meetingUrl ?? null,
				notes: input.notes ?? null,
				outcome: input.outcome ?? null
			})
			.returning({ id: crmMeetings.id });

		const attendeeIds = [...new Set(input.attendeeIds ?? [])];
		if (attendeeIds.length > 0) {
			await tx
				.insert(crmMeetingAttendees)
				.values(attendeeIds.map((userId) => ({ meetingId: row.id, userId })))
				.onConflictDoNothing({
					target: [crmMeetingAttendees.meetingId, crmMeetingAttendees.userId]
				});
		}
		return row.id;
	});

	const meeting = await getMeetingDetail(id);
	if (!meeting) throw new Error('createMeeting: row missing immediately after insert');
	return meeting;
}

export async function updateMeeting(
	id: string,
	patch: {
		startAt?: Date;
		organizerId?: string | null;
		meetingUrl?: string | null;
		notes?: string | null;
		outcome?: string | null;
		attendeeIds?: string[];
	}
): Promise<Meeting | null> {
	const found = await db.transaction(async (tx) => {
		const set: Partial<typeof crmMeetings.$inferInsert> = { updatedAt: new Date() };
		if (patch.startAt !== undefined) set.startAt = patch.startAt;
		if (patch.organizerId !== undefined) set.organizerId = patch.organizerId;
		if (patch.meetingUrl !== undefined) set.meetingUrl = patch.meetingUrl;
		if (patch.notes !== undefined) set.notes = patch.notes;
		if (patch.outcome !== undefined) set.outcome = patch.outcome;

		// UPDATE ... RETURNING detects the missing/soft-deleted row without a preliminary SELECT.
		const updated = await tx
			.update(crmMeetings)
			.set(set)
			.where(and(eq(crmMeetings.id, id), isNull(crmMeetings.deletedAt)))
			.returning({ id: crmMeetings.id });
		if (updated.length === 0) return false;

		// Reconcile attendees only when the caller supplied a new set.
		if (patch.attendeeIds !== undefined) {
			const desired = [...new Set(patch.attendeeIds)];
			const current = await tx
				.select({ userId: crmMeetingAttendees.userId })
				.from(crmMeetingAttendees)
				.where(eq(crmMeetingAttendees.meetingId, id));
			const currentIds = current.map((c) => c.userId).filter((x): x is string => x !== null);

			const toRemove = currentIds.filter((u) => !desired.includes(u));
			const toAdd = desired.filter((u) => !currentIds.includes(u));

			if (toRemove.length > 0) {
				await tx
					.delete(crmMeetingAttendees)
					.where(
						and(
							eq(crmMeetingAttendees.meetingId, id),
							inArray(crmMeetingAttendees.userId, toRemove)
						)
					);
			}
			if (toAdd.length > 0) {
				await tx
					.insert(crmMeetingAttendees)
					.values(toAdd.map((userId) => ({ meetingId: id, userId })))
					.onConflictDoNothing({
						target: [crmMeetingAttendees.meetingId, crmMeetingAttendees.userId]
					});
			}
		}
		return true;
	});

	if (!found) return null;
	return getMeetingDetail(id);
}

export async function softDeleteMeeting(id: string): Promise<boolean> {
	const now = new Date();
	const rows = await db
		.update(crmMeetings)
		.set({ deletedAt: now, updatedAt: now })
		.where(and(eq(crmMeetings.id, id), isNull(crmMeetings.deletedAt)))
		.returning({ id: crmMeetings.id });
	return rows.length > 0;
}
