/**
 * Server-side DB access for leads, users, and activities.
 * All public functions run queries; pure mapper helpers are exported for testing.
 */
import { db } from './index';
import { crmLeads, crmUsers, crmActivities, crmLeadHistory } from './schema';
import { eq, isNull, desc, and, sql } from 'drizzle-orm';
import type {
	Lead,
	User,
	Activity,
	Stage,
	Urgency,
	LostReason,
	MoveStagePayload
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
		email: row.contactEmail ?? undefined,
		pageUrl: row.pageUrl ?? undefined,
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
		.orderBy(desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`));
	return rows.map((row) => dbRowToLead(row));
}

export async function getLead(id: string): Promise<Lead | null> {
	const [row] = await db
		.select()
		.from(crmLeads)
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
		.limit(1);
	return row ? dbRowToLead(row) : null;
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
