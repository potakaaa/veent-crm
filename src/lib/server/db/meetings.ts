/**
 * Server-side DB access for meetings and meeting attendees.
 * Mirrors leads.ts: pure mappers are exported for unit tests; query/mutation
 * functions run against Postgres. All reads filter `deleted_at IS NULL`
 * (soft-delete only). List queries avoid N+1 — one query for meetings, one
 * `inArray` query for attendees, grouped in memory.
 */
import { db } from './index';
import { crmMeetings, crmMeetingAttendees, crmUsers, crmLeads, crmOrganizers } from './schema';
import { eq, and, isNull, isNotNull, desc, asc, inArray, count, sql, ilike } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Meeting, MeetingAttendee } from '$lib/types';

type DbMeeting = typeof crmMeetings.$inferSelect;

// ---------------------------------------------------------------------------
// Filter/sort param parsing (pure, exported for unit tests)
// ---------------------------------------------------------------------------

const MEETING_FILTER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MeetingListFilters {
	organizerId?: string;
	leadId?: string;
	dateFrom?: string;
	dateTo?: string;
	sortDir?: 'asc' | 'desc';
	outcome?: string;
}

/**
 * Parse the /meetings filter/sort URL params into resolved DB filter values.
 * SINGLE source of truth shared by the page loader and the API route, so SSR
 * page-1 and infinite-scroll fetches never drift. DB-free + pure so the
 * security-sensitive organizer resolution is unit-testable.
 *
 * SECURITY: `meId` is a TRUSTED server-derived arg (locals.user.id) — never a
 * client value. `organizer` absent/empty/'mine'/junk ALL resolve to `meId`
 * (the safe default self-view), so a client can never redirect 'mine' to
 * another identity. 'all' clears the organizer condition; a valid foreign UUID
 * is used as-is (a normal explicit filter over already-team-visible meetings).
 */
export function parseMeetingFilterParams(
	searchParams: URLSearchParams,
	meId: string
): {
	organizerId?: string;
	leadId?: string;
	dateFrom?: string;
	dateTo?: string;
	sortDir: 'asc' | 'desc';
	outcome?: string;
} {
	const rawOrganizer = searchParams.get('organizer');
	const organizerId =
		rawOrganizer === 'all'
			? undefined
			: rawOrganizer && rawOrganizer !== 'mine' && MEETING_FILTER_UUID_RE.test(rawOrganizer)
				? rawOrganizer
				: meId; // absent, 'mine', or junk → the caller's own id (safe default)

	const rawLead = searchParams.get('lead');
	const leadId = rawLead && MEETING_FILTER_UUID_RE.test(rawLead) ? rawLead : undefined;

	const validDate = (raw: string | null): string | undefined => {
		if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
		const d = new Date(raw + 'T00:00:00Z');
		return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? undefined : raw;
	};
	const dateFrom = validDate(searchParams.get('dateFrom'));
	const dateTo = validDate(searchParams.get('dateTo'));

	const sortDir: 'asc' | 'desc' = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

	// Free-text outcome filter: trim and coerce empty → undefined (mirrors dateFrom/dateTo).
	const rawOutcome = searchParams.get('outcome')?.trim();
	const outcome = rawOutcome ? rawOutcome : undefined;

	return { organizerId, leadId, dateFrom, dateTo, sortDir, outcome };
}

// ---------------------------------------------------------------------------
// Pure mapper (exported for unit tests)
// ---------------------------------------------------------------------------

export function dbRowToMeeting(
	row: DbMeeting,
	attendees: MeetingAttendee[],
	organizerName?: string | null,
	leadName?: string | null,
	leadOrganizerName?: string | null
): Meeting {
	return {
		id: row.id,
		leadId: row.leadId,
		leadName: leadName ?? undefined,
		organizerId: row.organizerId,
		organizerName: organizerName ?? undefined,
		leadOrganizerId: row.leadOrganizerId ?? null,
		leadOrganizerName: leadOrganizerName ?? undefined,
		startAt: row.startAt.toISOString(),
		meetingUrl: row.meetingUrl ?? undefined,
		venue: row.venue ?? undefined,
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
		.select({
			meeting: crmMeetings,
			organizerName: crmUsers.name,
			leadName: crmLeads.name,
			leadOrganizerName: crmOrganizers.name
		})
		.from(crmMeetings)
		.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
		.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
		.leftJoin(crmOrganizers, eq(crmMeetings.leadOrganizerId, crmOrganizers.id))
		.where(and(eq(crmMeetings.id, id), isNull(crmMeetings.deletedAt)))
		.limit(1);

	if (!row) return null;
	const attMap = await attendeesByMeeting([id]);
	return dbRowToMeeting(
		row.meeting,
		attMap.get(id) ?? [],
		row.organizerName,
		row.leadName,
		row.leadOrganizerName
	);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listMeetingsForLead(leadId: string): Promise<Meeting[]> {
	const rows = await db
		.select({
			meeting: crmMeetings,
			organizerName: crmUsers.name,
			leadOrganizerName: crmOrganizers.name
		})
		.from(crmMeetings)
		.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
		.leftJoin(crmOrganizers, eq(crmMeetings.leadOrganizerId, crmOrganizers.id))
		.where(and(eq(crmMeetings.leadId, leadId), isNull(crmMeetings.deletedAt)))
		.orderBy(desc(crmMeetings.startAt));

	const attMap = await attendeesByMeeting(rows.map((r) => r.meeting.id));
	return rows.map((r) =>
		dbRowToMeeting(
			r.meeting,
			attMap.get(r.meeting.id) ?? [],
			r.organizerName,
			null,
			r.leadOrganizerName
		)
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
 * Offset-paginated cross-lead meetings listing (8 per page by default).
 * Mirrors listPipelineStage: one page query (limit/offset) + one count() query
 * in Promise.all. Ordering `startAt DESC, id ASC` — the id tiebreaker is
 * REQUIRED so meetings sharing a startAt never duplicate/skip across pages.
 * Reuses the shared attendeesByMeeting helper + dbRowToMeeting mapper.
 */
export async function listMeetingsPaginated(
	page: number = 1,
	limit: number = 8,
	filters: MeetingListFilters = {}
): Promise<{ meetings: Meeting[]; total: number }> {
	// Build the conditions array (mirrors listLeadsFiltered). The organizer DEFAULT
	// (absent/'mine' → meId) lives in parseMeetingFilterParams, not here — this
	// function applies no organizer condition when filters.organizerId is undefined.
	const conditions: SQL[] = [isNull(crmMeetings.deletedAt) as SQL];
	if (filters.organizerId) conditions.push(eq(crmMeetings.organizerId, filters.organizerId));
	if (filters.leadId) conditions.push(eq(crmMeetings.leadId, filters.leadId));
	// Anchor the date bounds to UTC midnight (`AT TIME ZONE 'UTC'`) so the comparison
	// is stable regardless of the Postgres session timezone, matching the UTC parsing
	// in parseMeetingFilterParams (`new Date(raw + 'T00:00:00Z')`).
	if (filters.dateFrom)
		conditions.push(sql`${crmMeetings.startAt} >= (${filters.dateFrom}::date AT TIME ZONE 'UTC')`);
	// dateTo uses `< dateTo + 1 day` (not `<= dateTo`) so the "to" date is inclusive
	// of the whole day given startAt is a timestamp.
	if (filters.dateTo)
		conditions.push(
			sql`${crmMeetings.startAt} < ((${filters.dateTo}::date + INTERVAL '1 day') AT TIME ZONE 'UTC')`
		);
	// Case-insensitive substring match on outcome. `ilike` is parameterized (no
	// injection risk). Rows with NULL outcome are excluded naturally — ILIKE against
	// NULL evaluates to NULL (falsy) in Postgres, so no explicit isNotNull guard needed.
	if (filters.outcome) conditions.push(ilike(crmMeetings.outcome, `%${filters.outcome}%`) as SQL);
	// Single shared `where` applied to BOTH the page query and the count() query so
	// `total` (and therefore hasMore) reflects the filtered set.
	const where = and(...conditions);
	const sortFn = filters.sortDir === 'asc' ? asc : desc;
	const offset = (Math.max(1, page) - 1) * limit;
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				meeting: crmMeetings,
				organizerName: crmUsers.name,
				leadName: crmLeads.name,
				leadOrganizerName: crmOrganizers.name
			})
			.from(crmMeetings)
			.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
			.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
			.leftJoin(crmOrganizers, eq(crmMeetings.leadOrganizerId, crmOrganizers.id))
			.where(where)
			// asc(id) tiebreaker ALWAYS present (both directions) so pages never dup/skip.
			.orderBy(sortFn(crmMeetings.startAt), asc(crmMeetings.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(crmMeetings).where(where)
	]);

	const attMap = await attendeesByMeeting(rows.map((r) => r.meeting.id));
	const meetings = rows.map((r) =>
		dbRowToMeeting(
			r.meeting,
			attMap.get(r.meeting.id) ?? [],
			r.organizerName,
			r.leadName,
			r.leadOrganizerName
		)
	);
	return { meetings, total };
}

/**
 * Minimal fetch for the mutation authorization guard: id + organizerId of a
 * non-deleted meeting. Used by PATCH/DELETE before the write. Null if not found.
 */
export async function getMeeting(
	id: string
): Promise<{ id: string; organizerId: string | null; nextcloudUid: string | null } | null> {
	const [row] = await db
		.select({
			id: crmMeetings.id,
			organizerId: crmMeetings.organizerId,
			nextcloudUid: crmMeetings.nextcloudUid
		})
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
	leadOrganizerId?: string | null;
	meetingUrl?: string | null;
	venue?: string | null;
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
				leadOrganizerId: input.leadOrganizerId ?? null,
				meetingUrl: input.meetingUrl ?? null,
				venue: input.venue ?? null,
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
		leadOrganizerId?: string | null;
		meetingUrl?: string | null;
		venue?: string | null;
		notes?: string | null;
		outcome?: string | null;
		attendeeIds?: string[];
	}
): Promise<Meeting | null> {
	const found = await db.transaction(async (tx) => {
		const set: Partial<typeof crmMeetings.$inferInsert> = { updatedAt: new Date() };
		if (patch.startAt !== undefined) set.startAt = patch.startAt;
		if (patch.organizerId !== undefined) set.organizerId = patch.organizerId;
		// undefined leaves the saved link untouched; explicit null clears it (mirrors organizerId).
		if (patch.leadOrganizerId !== undefined) set.leadOrganizerId = patch.leadOrganizerId;
		if (patch.meetingUrl !== undefined) set.meetingUrl = patch.meetingUrl;
		if (patch.venue !== undefined) set.venue = patch.venue;
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

/**
 * Case-insensitive DISTINCT venue search over crm_meetings. Empty/blank query returns the
 * first `limit` venues alphabetically. Backs the meeting-create/edit venue free-text combobox
 * (GitHub #249, MTG-5) — suggestions layered on top of a field that stays fully free-text.
 * Read-only; filters soft-deleted rows and drops null venues.
 */
/**
 * Writes the Nextcloud UID back to a meeting row after a successful CalDAV create,
 * or clears it (null) after a successful CalDAV delete. Called by calendar-sync.ts only.
 */
export async function updateMeetingNextcloudUid(id: string, uid: string | null): Promise<void> {
	await db.update(crmMeetings).set({ nextcloudUid: uid }).where(eq(crmMeetings.id, id));
}

export async function searchVenues(q: string | null | undefined, limit = 20): Promise<string[]> {
	const term = (q ?? '').trim();
	const where: SQL | undefined = and(
		isNull(crmMeetings.deletedAt),
		isNotNull(crmMeetings.venue),
		term ? ilike(crmMeetings.venue, `%${term.replace(/[\\%_]/g, '\\$&')}%`) : undefined
	);
	const rows = await db
		.selectDistinct({ venue: crmMeetings.venue })
		.from(crmMeetings)
		.where(where)
		.orderBy(asc(crmMeetings.venue))
		.limit(limit);
	return rows.map((r) => r.venue).filter((v): v is string => v != null);
}
