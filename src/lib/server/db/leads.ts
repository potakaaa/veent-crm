/**
 * Server-side DB access for leads, users, and activities.
 * All public functions run queries; pure mapper helpers are exported for testing.
 */
import { db } from './index';
import { crmLeads, crmUsers, crmActivities, crmLeadHistory } from './schema';
import {
	eq,
	isNull,
	isNotNull,
	desc,
	asc,
	and,
	or,
	ne,
	inArray,
	ilike,
	count,
	sql,
	type SQL
} from 'drizzle-orm';
import type {
	Lead,
	User,
	Activity,
	Stage,
	Urgency,
	LostReason,
	MoveStagePayload,
	ActivityChannel,
	ActivityOutcome
} from '$lib/types';
import { computeAge } from '$lib/utils/dates';

type DbLead = typeof crmLeads.$inferSelect;
type DbUser = typeof crmUsers.$inferSelect;
type DbActivity = typeof crmActivities.$inferSelect;

// ---------------------------------------------------------------------------
// Pure mappers (exported for unit tests)
// ---------------------------------------------------------------------------

export function dbRowToLead(row: DbLead, followUpAt?: string | Date | null): Lead {
	const createdAt = row.createdAt.toISOString();
	const lastActivityAt = row.lastActivityAt?.toISOString() ?? createdAt;

	const followUpIso = followUpAt
		? followUpAt instanceof Date
			? followUpAt.toISOString()
			: followUpAt
		: undefined;

	const handle = row.normalizedHandle
		? row.normalizedHandle.startsWith('@')
			? row.normalizedHandle
			: `@${row.normalizedHandle}`
		: '@' +
			row.name
				.toLowerCase()
				.replace(/\s+/g, '')
				.replace(/[^a-z0-9@]/g, '');

	const age = computeAge({ lastActivityAt, stage: row.stage as Stage, followUpAt: followUpIso });

	const urgency: Urgency = (() => {
		if (age.type === 'overdue') return 'overdue';
		if (age.type === 'due') return 'due';
		if (row.stage === 'replied') return 'replied';
		if (age.type === 'stale') return 'cold';
		if (age.type === 'fresh') return 'fresh';
		return 'normal';
	})();

	return {
		id: row.id,
		name: row.name,
		handle,
		category: row.category as Lead['category'],
		location: row.location ?? '—',
		platform: (row.platform ?? 'Other') as Lead['platform'],
		stage: row.stage as Stage,
		ownerId: row.ownerId,
		eventName: row.eventName ?? undefined,
		eventDate: row.eventDate ?? undefined,
		eventLink: row.eventLink ?? undefined,
		email: row.contactEmail ?? undefined,
		phone: row.contactPhone ?? undefined,
		pageUrl: row.pageUrl ?? undefined,
		socialFacebook: row.socialFacebook ?? undefined,
		socialInstagram: row.socialInstagram ?? undefined,
		source: row.source as Lead['source'],
		needsReview: row.needsReview,
		notes: row.notes ?? undefined,
		signedOrg: row.wonOrgName ?? undefined,
		dealValue: row.dealValueCents != null ? row.dealValueCents / 100 : undefined,
		currency: ((row.currency as Lead['currency']) ?? 'PHP') || 'PHP',
		signedDate: row.signedAt?.toISOString(),
		lostReason: (row.lostReason as Lead['lostReason']) ?? undefined,
		createdAt,
		lastActivityAt,
		followUpAt: followUpIso,
		age,
		urgency
	};
}

export function dbUserToUser(row: DbUser): User {
	return {
		id: row.id,
		name: row.name,
		email: row.email ?? '',
		role: row.role as User['role'],
		active: row.active
	};
}

export function dbActivityToActivity(row: DbActivity): Activity {
	return {
		id: row.id,
		leadId: row.leadId,
		repId: row.repId ?? '',
		channel: row.channel as Activity['channel'],
		outcome: (row.outcome ?? 'sent') as Activity['outcome'],
		note: row.notes ?? undefined,
		createdAt: row.occurredAt.toISOString(),
		followUpAt: row.followUpAt?.toISOString()
	};
}

/**
 * Resolve a follow-up timestamp for a logged touch (pure — unit-testable without a DB).
 * Precedence: explicit `followUpAt` > computed from `followUpInDays` > null.
 */
export function resolveFollowUpAt(
	occurredAt: Date,
	followUpInDays?: number,
	followUpAt?: Date | string
): Date | null {
	if (followUpAt != null) {
		return followUpAt instanceof Date ? followUpAt : new Date(followUpAt);
	}
	if (followUpInDays != null && Number.isFinite(followUpInDays)) {
		return new Date(occurredAt.getTime() + followUpInDays * 86_400_000);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listLeads(): Promise<Lead[]> {
	const rows = await db
		.select()
		.from(crmLeads)
		.where(isNull(crmLeads.deletedAt))
		.orderBy(
			// Leads with upcoming events float to the top, soonest first.
			// Leads with no future event fall back to last-activity order.
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
			sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
			desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`)
		);
	return rows.map((row) => dbRowToLead(row));
}

const PIPELINE_STAGES = ['new', 'contacted', 'replied', 'in_discussion', 'won'] as const;

export async function listPipelineLeads(): Promise<{ leads: Lead[]; lostCount: number }> {
	const eventOrder = [
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
		desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`)
	];

	const [rows, [{ lostCount }]] = await Promise.all([
		db
			.select()
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), inArray(crmLeads.stage, [...PIPELINE_STAGES])))
			.orderBy(...eventOrder),
		db
			.select({ lostCount: count() })
			.from(crmLeads)
			.where(and(isNull(crmLeads.deletedAt), sql`${crmLeads.stage} = 'lost'`))
	]);

	return { leads: rows.map((row) => dbRowToLead(row)), lostCount };
}

/**
 * Distinct non-null lead locations ("countries"), alphabetically sorted.
 * Powers the country filter dropdown on the leads page.
 */
export async function getLeadCountries(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ location: crmLeads.location })
		.from(crmLeads)
		.where(and(isNull(crmLeads.deletedAt), isNotNull(crmLeads.location)))
		.orderBy(asc(crmLeads.location));
	return rows.map((r) => r.location as string);
}

export interface ListLeadsParams {
	userId: string;
	segment?: 'mine' | 'all' | 'unassigned' | 'lost';
	stage?: string;
	platform?: string;
	country?: string;
	staleOnly?: boolean;
	search?: string;
	page?: number;
	pageSize?: number;
}

/**
 * Server-backed, SQL-level filtered + paginated lead listing.
 * Preserves the listLeads() invariants: sort by COALESCE(last_activity_at, created_at) DESC,
 * hide lost leads unless the 'lost' segment is active, exclude soft-deleted rows.
 */
export async function listLeadsFiltered(
	params: ListLeadsParams
): Promise<{ leads: Lead[]; total: number }> {
	const {
		userId,
		segment = 'mine',
		stage,
		platform,
		country,
		staleOnly = false,
		search,
		page = 1,
		pageSize = 25
	} = params;

	const offset = (Math.max(1, page) - 1) * pageSize;

	const conditions: SQL[] = [isNull(crmLeads.deletedAt) as SQL];

	// Segment
	if (segment === 'mine') conditions.push(eq(crmLeads.ownerId, userId));
	else if (segment === 'unassigned') conditions.push(isNull(crmLeads.ownerId) as SQL);
	else if (segment === 'lost') conditions.push(sql`${crmLeads.stage} = 'lost'`);

	// Product rule: hide lost unless explicitly in the lost segment
	if (segment !== 'lost') conditions.push(sql`${crmLeads.stage} <> 'lost'`);

	// Stage filter
	if (stage) conditions.push(sql`${crmLeads.stage} = ${stage}`);

	// Platform filter
	if (platform) conditions.push(sql`${crmLeads.platform} = ${platform}`);

	// Country filter (location column)
	if (country) conditions.push(eq(crmLeads.location, country));

	// Stale only: no activity for > 30 days
	if (staleOnly) {
		conditions.push(
			sql`COALESCE(${crmLeads.lastActivityAt}, ${crmLeads.createdAt}) < NOW() - INTERVAL '30 days'`
		);
	}

	// Search: case-insensitive against name and normalizedHandle.
	// Ingest stores handles without '@' (e.g. 'acmefb'); manual creation stores with '@'.
	// Strip a leading '@' so "copied handle" queries match both storage formats.
	if (search) {
		const nameLike = `%${search}%`;
		const handleSearch = search.startsWith('@') ? search.slice(1) : search;
		const handleLike = `%${handleSearch}%`;
		conditions.push(
			or(
				ilike(crmLeads.name, nameLike),
				ilike(sql`COALESCE(${crmLeads.normalizedHandle}, '')`, handleLike)
			)!
		);
	}

	const where = and(...conditions);

	const [countResult, rows] = await Promise.all([
		db.select({ total: count() }).from(crmLeads).where(where),
		db
			.select()
			.from(crmLeads)
			.where(where)
			.orderBy(
				desc(sql`COALESCE(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`),
				asc(crmLeads.id) // stable secondary sort: prevents duplicate/missing rows across pages
			)
			.limit(pageSize)
			.offset(offset)
	]);

	return {
		leads: rows.map((row) => dbRowToLead(row)),
		total: countResult[0].total
	};
}

export async function getLead(id: string): Promise<Lead | null> {
	const [row] = await db
		.select()
		.from(crmLeads)
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
		.limit(1);
	return row ? dbRowToLead(row) : null;
}

export async function listUnassignedLeads(
	page = 1,
	pageSize = 25
): Promise<{ leads: Lead[]; total: number }> {
	const where = and(
		isNull(crmLeads.ownerId),
		isNull(crmLeads.deletedAt),
		ne(crmLeads.stage, 'won'),
		ne(crmLeads.stage, 'lost')
	);
	const order = [
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN 0 ELSE 1 END`,
		sql`CASE WHEN ${crmLeads.eventDate} >= CURRENT_DATE THEN ${crmLeads.eventDate} END ASC NULLS LAST`,
		desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`)
	];

	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(crmLeads)
			.where(where)
			.orderBy(...order)
			.limit(pageSize)
			.offset((Math.max(1, page) - 1) * pageSize),
		db.select({ total: count() }).from(crmLeads).where(where)
	]);

	return { leads: rows.map((row) => dbRowToLead(row)), total };
}

export async function claimLead(id: string, userId: string): Promise<Lead | null> {
	const now = new Date();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(crmLeads)
			.set({ ownerId: userId, updatedAt: now })
			.where(
				and(
					eq(crmLeads.id, id),
					isNull(crmLeads.deletedAt),
					isNull(crmLeads.ownerId),
					ne(crmLeads.stage, 'won'),
					ne(crmLeads.stage, 'lost')
				)
			)
			.returning();
		if (!row) return null;
		await tx.insert(crmLeadHistory).values({
			leadId: id,
			actorUserId: userId,
			field: 'owner_id',
			oldValue: null,
			newValue: userId
		});
		return dbRowToLead(row);
	});
}

export async function listUsers(): Promise<User[]> {
	const rows = await db.select().from(crmUsers).orderBy(crmUsers.name);
	return rows.map(dbUserToUser);
}

export async function listActivities(leadId: string): Promise<Activity[]> {
	const rows = await db
		.select()
		.from(crmActivities)
		.where(eq(crmActivities.leadId, leadId))
		.orderBy(desc(crmActivities.occurredAt));
	return rows.map(dbActivityToActivity);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createLead(
	input: {
		name: string;
		category: DbLead['category'];
		platform?: DbLead['platform'];
		location?: string;
		pageUrl?: string;
		contactEmail?: string;
		eventName?: string;
		eventDateRaw?: string;
		notes?: string;
	},
	ownerId: string
): Promise<Lead> {
	const normalizedHandle =
		'@' +
		input.name
			.toLowerCase()
			.replace(/\s+/g, '')
			.replace(/[^a-z0-9@]/g, '');

	const [row] = await db
		.insert(crmLeads)
		.values({
			name: input.name,
			category: input.category,
			platform: input.platform ?? null,
			location: input.location ?? null,
			pageUrl: input.pageUrl ?? null,
			contactEmail: input.contactEmail ?? null,
			eventName: input.eventName ?? null,
			eventDateRaw: input.eventDateRaw ?? null,
			notes: input.notes ?? null,
			normalizedHandle,
			ownerId,
			source: 'manual',
			stage: 'new',
			needsReview: false
		})
		.returning();

	return dbRowToLead(row);
}

/**
 * Insert an outreach touch and bump the lead's `last_activity_at`, transactionally.
 * Returns the created Activity, or `null` on a dedup conflict (caller maps to 409).
 * On a dedup no-op the lead is NOT updated.
 */
export async function insertActivity(input: {
	leadId: string;
	repId: string;
	channel: DbActivity['channel'];
	outcome?: DbActivity['outcome'];
	occurredAt?: Date;
	followUpInDays?: number;
	followUpAt?: Date;
	notes?: string;
}): Promise<Activity | null> {
	const ts = input.occurredAt ?? new Date();
	const followUpAt = resolveFollowUpAt(ts, input.followUpInDays, input.followUpAt);

	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(crmActivities)
			.values({
				leadId: input.leadId,
				repId: input.repId,
				channel: input.channel,
				outcome: input.outcome ?? null,
				occurredAt: ts,
				followUpAt,
				notes: input.notes ?? null
			})
			.onConflictDoNothing({
				target: [
					crmActivities.leadId,
					crmActivities.repId,
					crmActivities.occurredAt,
					crmActivities.channel
				]
			})
			.returning();

		// Dedup no-op: identical touch already recorded — do NOT touch the lead.
		if (inserted.length === 0) return null;

		await tx
			.update(crmLeads)
			.set({
				lastActivityAt: sql`GREATEST(COALESCE(${crmLeads.lastActivityAt}, ${ts}), ${ts})`,
				updatedAt: new Date()
			})
			.where(eq(crmLeads.id, input.leadId));

		return dbActivityToActivity(inserted[0]);
	});
}

export async function moveLeadStage(
	id: string,
	stage: Stage,
	payload: MoveStagePayload,
	actorId: string,
	actorRole: 'rep' | 'manager'
): Promise<Lead | null | 'forbidden'> {
	const now = new Date();

	// SELECT, auth check, update, and history insert all run inside one transaction
	// so the authorization predicate is evaluated atomically with the mutation.
	const result = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({
				stage: crmLeads.stage,
				ownerId: crmLeads.ownerId,
				wonOrgName: crmLeads.wonOrgName,
				dealValueCents: crmLeads.dealValueCents,
				lostReason: crmLeads.lostReason
			})
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1);

		if (!existing) return null;

		if (actorRole !== 'manager' && existing.ownerId !== actorId) {
			return 'forbidden' as const;
		}

		let rows: DbLead[];

		if (stage === 'won') {
			rows = await tx
				.update(crmLeads)
				.set({
					stage: 'won',
					wonOrgName: payload.wonOrgName ?? null,
					dealValueCents: payload.dealValueCents ?? null,
					currency: payload.currency ?? 'PHP',
					signedAt: payload.signedAt ? new Date(payload.signedAt) : now,
					lostReason: null, // clear stale lost metadata
					lastActivityAt: now,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		} else if (stage === 'lost') {
			rows = await tx
				.update(crmLeads)
				.set({
					stage: 'lost',
					lostReason: payload.lostReason as LostReason,
					wonOrgName: null, // clear stale won metadata
					dealValueCents: null,
					currency: null,
					signedAt: null,
					lastActivityAt: now,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		} else {
			rows = await tx
				.update(crmLeads)
				.set({
					stage,
					wonOrgName: null, // clear stale won/lost metadata when moving back to active
					dealValueCents: null,
					currency: null,
					signedAt: null,
					lostReason: null,
					updatedAt: now
				})
				.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
				.returning();
		}

		if (rows.length === 0) return null;

		const historyRows: (typeof crmLeadHistory.$inferInsert)[] = [
			{
				leadId: id,
				actorUserId: actorId,
				field: 'stage',
				oldValue: existing.stage,
				newValue: stage
			}
		];

		if (stage === 'won') {
			if (payload.wonOrgName !== undefined) {
				historyRows.push({
					leadId: id,
					actorUserId: actorId,
					field: 'won_org_name',
					oldValue: existing.wonOrgName,
					newValue: payload.wonOrgName ?? null
				});
			}
			if (payload.dealValueCents !== undefined) {
				historyRows.push({
					leadId: id,
					actorUserId: actorId,
					field: 'deal_value_cents',
					oldValue: existing.dealValueCents !== null ? String(existing.dealValueCents) : null,
					newValue: String(payload.dealValueCents)
				});
			}
		}

		if (stage === 'lost' && payload.lostReason !== undefined) {
			historyRows.push({
				leadId: id,
				actorUserId: actorId,
				field: 'lost_reason',
				oldValue: existing.lostReason ?? null,
				newValue: payload.lostReason
			});
		}

		await tx.insert(crmLeadHistory).values(historyRows);

		return rows[0];
	});

	if (result === null || result === undefined) return null;
	if (result === 'forbidden') return 'forbidden';
	return dbRowToLead(result);
}

export async function reassignLead(
	id: string,
	ownerId: string,
	actorId: string
): Promise<Lead | null> {
	const [existing] = await db
		.select({ ownerId: crmLeads.ownerId })
		.from(crmLeads)
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
		.limit(1);

	if (!existing) return null;

	const now = new Date();

	const updated = await db.transaction(async (tx) => {
		const rows = await tx
			.update(crmLeads)
			.set({ ownerId, updatedAt: now })
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.returning();

		if (rows.length === 0) return null;

		await tx.insert(crmLeadHistory).values({
			leadId: id,
			actorUserId: actorId,
			field: 'owner_id',
			oldValue: existing.ownerId,
			newValue: ownerId
		});

		return rows[0];
	});

	if (!updated) return null;
	return dbRowToLead(updated);
}

// ---------------------------------------------------------------------------
// Today queue — real DB read model for the Today page
// ---------------------------------------------------------------------------

/**
 * Returns all active (non-won/lost/deleted) leads owned by `userId`, with the
 * latest follow-up date from activities so urgency is computed correctly.
 * The caller (Today page) filters by urgency bucket.
 */
export async function getTodayQueue(userId: string): Promise<Lead[]> {
	const rows = await db
		.select()
		.from(crmLeads)
		.where(
			and(
				isNull(crmLeads.deletedAt),
				eq(crmLeads.ownerId, userId),
				ne(crmLeads.stage, 'won'),
				ne(crmLeads.stage, 'lost')
			)
		)
		.orderBy(desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`));

	if (rows.length === 0) return [];

	// Batch-fetch the follow_up_at from each lead's most recent activity that has one scheduled.
	// DISTINCT ON (lead_id) ordered by occurred_at DESC picks the latest touch's follow-up,
	// so a rep's newest scheduling decision wins over older ones.
	const leadIds = rows.map((r) => r.id);
	const followUps = await db
		.selectDistinctOn([crmActivities.leadId], {
			leadId: crmActivities.leadId,
			followUpAt: crmActivities.followUpAt
		})
		.from(crmActivities)
		.where(and(inArray(crmActivities.leadId, leadIds), isNotNull(crmActivities.followUpAt)))
		.orderBy(crmActivities.leadId, desc(crmActivities.occurredAt));

	const followUpMap = new Map(followUps.map((f) => [f.leadId, f.followUpAt ?? null]));

	return rows.map((row) => dbRowToLead(row, followUpMap.get(row.id) ?? undefined));
}

// ---------------------------------------------------------------------------
// Log touch — persist a real outreach activity
// ---------------------------------------------------------------------------

export async function logLeadTouch(
	id: string,
	input: {
		repId: string;
		channel: ActivityChannel;
		outcome: ActivityOutcome;
		followUpAt?: Date;
		notes?: string;
	}
): Promise<Lead | null> {
	const now = new Date();

	return db.transaction(async (tx) => {
		// Lock the row so a concurrent soft-delete can't sneak in between the existence
		// check and the subsequent activity/history inserts.
		const [existing] = await tx
			.select({ id: crmLeads.id, stage: crmLeads.stage })
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1)
			.for('update');

		if (!existing) return null;

		await tx.insert(crmActivities).values({
			leadId: id,
			repId: input.repId,
			channel: input.channel,
			outcome: input.outcome,
			followUpAt: input.followUpAt ?? null,
			notes: input.notes ?? null,
			occurredAt: now
		});

		// Auto-advance stage: contacted → replied when the outcome is 'replied'.
		const historyRows: (typeof crmLeadHistory.$inferInsert)[] = [];
		const newStage: Stage =
			input.outcome === 'replied' && existing.stage === 'contacted'
				? 'replied'
				: (existing.stage as Stage);

		if (newStage !== existing.stage) {
			historyRows.push({
				leadId: id,
				actorUserId: input.repId,
				field: 'stage',
				oldValue: existing.stage,
				newValue: newStage
			});
		}

		const [updated] = await tx
			.update(crmLeads)
			.set({
				lastActivityAt: now,
				...(newStage !== existing.stage ? { stage: newStage } : {}),
				updatedAt: now
			})
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.returning();

		if (historyRows.length > 0) {
			await tx.insert(crmLeadHistory).values(historyRows);
		}

		return updated ? dbRowToLead(updated, input.followUpAt) : null;
	});
}

// ---------------------------------------------------------------------------
// Nav counts — sidebar badge values (real DB, server-only)
// ---------------------------------------------------------------------------

export async function getNavCounts(
	userId: string
): Promise<{ overdue: number; unassigned: number; review: number }> {
	const [todayLeads, [unassignedRow], [reviewRow]] = await Promise.all([
		getTodayQueue(userId),
		db
			.select({ count: sql<number>`COUNT(*)` })
			.from(crmLeads)
			.where(
				and(
					isNull(crmLeads.ownerId),
					isNull(crmLeads.deletedAt),
					ne(crmLeads.stage, 'won'),
					ne(crmLeads.stage, 'lost')
				)
			),
		db
			.select({ count: sql<number>`COUNT(*)` })
			.from(crmLeads)
			.where(and(eq(crmLeads.needsReview, true), isNull(crmLeads.deletedAt)))
	]);

	return {
		overdue: todayLeads.filter((l) => l.urgency === 'overdue').length,
		unassigned: Number(unassignedRow?.count ?? 0),
		review: Number(reviewRow?.count ?? 0)
	};
}

// ---------------------------------------------------------------------------
// Reminders queue — overdue + going-cold leads for the current user
// ---------------------------------------------------------------------------

/**
 * Returns two pre-sorted reminder buckets for `userId`:
 *   overdue — leads with a past follow-up date, earliest first (most overdue)
 *   cold    — active leads with no future follow-up that have gone stale (>30d),
 *             sorted by last-activity ascending (coldest first)
 *
 * Won, lost, soft-deleted, and unassigned leads are excluded.
 * Cold threshold mirrors computeAge: idle > 30 days without a booked follow-up.
 */
export async function getRemindersQueue(
	userId: string
): Promise<{ overdue: Lead[]; cold: Lead[] }> {
	const queue = await getTodayQueue(userId);

	const overdue = queue
		.filter((l) => l.urgency === 'overdue')
		.sort(
			(a, b) =>
				new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime() ||
				a.id.localeCompare(b.id)
		);

	const cold = queue
		.filter((l) => l.urgency === 'cold')
		.sort(
			(a, b) =>
				new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime() ||
				a.id.localeCompare(b.id)
		);

	return { overdue, cold };
}

// ---------------------------------------------------------------------------
// Snooze — defer follow-up without counting as an outreach touch
// ---------------------------------------------------------------------------

export async function snoozeLead(
	id: string,
	repId: string,
	followUpAt: Date,
	notes?: string
): Promise<Lead | null> {
	return db.transaction(async (tx) => {
		// Lock the lead row so a concurrent soft-delete can't orphan the activity insert.
		const [existing] = await tx
			.select()
			.from(crmLeads)
			.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
			.limit(1)
			.for('update');

		if (!existing) return null;

		// Snooze inserts a scheduling-only activity.  We do NOT update lastActivityAt
		// so the lead's staleness timer is not reset by a snooze.
		await tx.insert(crmActivities).values({
			leadId: id,
			repId,
			channel: 'other',
			outcome: 'other',
			followUpAt,
			notes: notes ?? 'Snoozed — deferred follow-up',
			occurredAt: new Date()
		});

		return dbRowToLead(existing, followUpAt);
	});
}
