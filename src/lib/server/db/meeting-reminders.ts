/**
 * Meeting reminders — per-meeting email reminders at two checkpoints (1 day + 1 hour
 * before `startAt`) to organizer ∪ attendees, deduped, delivered as a batched digest,
 * sent at-most-once per checkpoint.
 *
 * Sibling to `reminders.ts` (follow-up reminders) — deliberately separate: this feature
 * tracks exactly-once delivery per checkpoint via dedicated `crm_meetings` columns
 * (`day_reminder_sent_at` / `hour_reminder_sent_at`), whereas follow-up reminders are
 * idempotent-by-recomputation. Do NOT merge with the follow-up path.
 *
 * The single most important correctness point is `markMeetingReminderSent`: an atomic
 * compare-and-set (`UPDATE ... WHERE <col> IS NULL RETURNING id`) — the sole mechanism
 * guaranteeing at-most-once send under concurrent polling.
 *
 * Pure helpers (`resolveRecipients`, `groupMeetingRemindersByRecipient`) are exported for
 * unit tests and import no DB / no env.
 */
import { db } from './index';
import { crmMeetings, crmMeetingAttendees, crmUsers, crmLeads } from './schema';
import { and, eq, gt, isNull, lte, inArray } from 'drizzle-orm';

export type MeetingReminderCheckpoint = 'day' | 'hour';

export type MeetingReminderDue = {
	meetingId: string;
	leadId: string;
	leadName: string;
	startAt: string; // ISO
	meetingUrl: string | null;
	checkpoint: MeetingReminderCheckpoint;
	recipients: { userId: string; email: string }[]; // organizer ∪ attendees, deduped, active+email
};

const OFFSET_MS: Record<MeetingReminderCheckpoint, number> = {
	day: 24 * 60 * 60 * 1000, // 24h
	hour: 60 * 60 * 1000 // 1h
};

const SENT_COL = {
	day: crmMeetings.dayReminderSentAt,
	hour: crmMeetings.hourReminderSentAt
} as const;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests) — no DB, no env
// ---------------------------------------------------------------------------

/**
 * Organizer ∪ attendees, deduped by `userId` (an organizer who is also an attendee row
 * receives ONE reminder, not two), keeping only `active === true` AND non-null `email`.
 * Pure — no DB, no env.
 */
export function resolveRecipients(
	organizer: { userId: string; email: string | null; active: boolean } | null,
	attendees: { userId: string; email: string | null; active: boolean }[]
): { userId: string; email: string }[] {
	const seen = new Set<string>();
	const out: { userId: string; email: string }[] = [];

	const consider = (u: { userId: string; email: string | null; active: boolean } | null) => {
		if (!u) return;
		if (seen.has(u.userId)) return;
		if (u.active !== true) return;
		if (u.email == null) return;
		seen.add(u.userId);
		out.push({ userId: u.userId, email: u.email });
	};

	consider(organizer);
	for (const a of attendees) consider(a);
	return out;
}

/**
 * Invert a due list into one group per recipient email, preserving input order
 * (mirror `groupRemindersByRep`). Pure — no DB, no env.
 */
export function groupMeetingRemindersByRecipient(
	due: MeetingReminderDue[]
): Array<{ recipientEmail: string; reminders: MeetingReminderDue[] }> {
	const order: string[] = [];
	const byEmail = new Map<string, MeetingReminderDue[]>();

	for (const d of due) {
		for (const r of d.recipients) {
			let group = byEmail.get(r.email);
			if (!group) {
				group = [];
				byEmail.set(r.email, group);
				order.push(r.email);
			}
			group.push(d);
		}
	}

	return order.map((recipientEmail) => ({
		recipientEmail,
		reminders: byEmail.get(recipientEmail)!
	}));
}

// ---------------------------------------------------------------------------
// DB query — read-only; does NOT mark anything sent
// ---------------------------------------------------------------------------

type OrganizerInfo = { userId: string; email: string | null; active: boolean } | null;

/**
 * Fetch attendees (with email + active) for a set of meeting ids in a SINGLE query and
 * group them by meeting id. Prevents N+1 per-meeting attendee lookups (mirror
 * `attendeesByMeeting` in meetings.ts).
 */
async function attendeeInfoByMeeting(
	meetingIds: string[]
): Promise<Map<string, { userId: string; email: string | null; active: boolean }[]>> {
	const map = new Map<string, { userId: string; email: string | null; active: boolean }[]>();
	if (meetingIds.length === 0) return map;

	const rows = await db
		.select({
			meetingId: crmMeetingAttendees.meetingId,
			userId: crmMeetingAttendees.userId,
			email: crmUsers.email,
			active: crmUsers.active
		})
		.from(crmMeetingAttendees)
		.leftJoin(crmUsers, eq(crmMeetingAttendees.userId, crmUsers.id))
		.where(inArray(crmMeetingAttendees.meetingId, meetingIds));

	for (const r of rows) {
		if (!r.userId) continue; // attendee user set-null after removal
		const list = map.get(r.meetingId) ?? [];
		list.push({ userId: r.userId, email: r.email, active: r.active ?? false });
		map.set(r.meetingId, list);
	}
	return map;
}

/**
 * Due checkpoints across BOTH reminder offsets, for meetings whose window is currently
 * open and whose checkpoint has not yet been sent. `now` is INJECTABLE (defaults to
 * `new Date()`) — the testability seam.
 *
 * For EACH checkpoint independently:
 *   startAt > now AND startAt <= now + offset AND deleted_at IS NULL AND <col> IS NULL.
 * day offset = 24h, hour offset = 1h.
 *
 * EMPTY-RECIPIENT RULE (Failure Mode #5): a candidate whose `resolveRecipients()` returns
 * `[]` is EXCLUDED from the returned list entirely — it is NOT a due checkpoint this poll,
 * so `markMeetingReminderSent` is never invoked for it and its column stays NULL (a later
 * reactivated/added recipient can still be reached while the window is open).
 */
export async function getDueMeetingReminders(
	now: Date = new Date()
): Promise<MeetingReminderDue[]> {
	const checkpoints: MeetingReminderCheckpoint[] = ['day', 'hour'];
	const out: MeetingReminderDue[] = [];

	for (const checkpoint of checkpoints) {
		const windowEnd = new Date(now.getTime() + OFFSET_MS[checkpoint]);
		const sentCol = SENT_COL[checkpoint];

		const rows = await db
			.select({
				meetingId: crmMeetings.id,
				leadId: crmMeetings.leadId,
				leadName: crmLeads.name,
				startAt: crmMeetings.startAt,
				meetingUrl: crmMeetings.meetingUrl,
				organizerId: crmMeetings.organizerId,
				organizerEmail: crmUsers.email,
				organizerActive: crmUsers.active
			})
			.from(crmMeetings)
			.innerJoin(crmLeads, eq(crmMeetings.leadId, crmLeads.id))
			.leftJoin(crmUsers, eq(crmMeetings.organizerId, crmUsers.id))
			.where(
				and(
					gt(crmMeetings.startAt, now),
					lte(crmMeetings.startAt, windowEnd),
					isNull(crmMeetings.deletedAt),
					isNull(sentCol)
				)
			);

		const attMap = await attendeeInfoByMeeting(rows.map((r) => r.meetingId));

		for (const r of rows) {
			const organizer: OrganizerInfo =
				r.organizerId != null
					? {
							userId: r.organizerId,
							email: r.organizerEmail,
							active: r.organizerActive ?? false
						}
					: null;
			const attendees = attMap.get(r.meetingId) ?? [];
			const recipients = resolveRecipients(organizer, attendees);

			// EMPTY-RECIPIENT RULE — drop candidates that resolve to zero recipients so the
			// checkpoint column is never burned with no one to send to.
			if (recipients.length === 0) continue;

			out.push({
				meetingId: r.meetingId,
				// innerJoin(crmLeads) above guarantees a non-null leadId for reminder candidates
				// (standalone meetings have no lead and never enter this reminder query).
				leadId: r.leadId as string,
				leadName: r.leadName,
				startAt: r.startAt.toISOString(),
				meetingUrl: r.meetingUrl,
				checkpoint,
				recipients
			});
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// Atomic mark-as-sent — THE exactly-once mechanism
// ---------------------------------------------------------------------------

/**
 * Atomic compare-and-set: flip the checkpoint column NULL -> now() iff it is still NULL.
 * Returns `true` iff THIS call won the race (flipped the column); `false` if it was already
 * sent. Postgres row-level locking guarantees exactly one concurrent updater wins.
 *
 * MANDATORY shape — a single compare-and-set, NOT a SELECT-then-UPDATE (which reopens the
 * duplicate-send race window this exists to close). Mirrors `softDeleteMeeting`'s
 * `.returning({ id }).length > 0` idiom.
 */
export async function markMeetingReminderSent(
	meetingId: string,
	checkpoint: MeetingReminderCheckpoint
): Promise<boolean> {
	const sentCol = SENT_COL[checkpoint];
	const rows = await db
		.update(crmMeetings)
		.set({ [checkpoint === 'day' ? 'dayReminderSentAt' : 'hourReminderSentAt']: new Date() })
		.where(and(eq(crmMeetings.id, meetingId), isNull(sentCol), isNull(crmMeetings.deletedAt)))
		.returning({ id: crmMeetings.id });
	return rows.length > 0;
}
