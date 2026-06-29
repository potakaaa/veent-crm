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

export function dbRowToLead(row: DbLead): Lead {
	const createdAt = row.createdAt.toISOString();
	const lastActivityAt = row.lastActivityAt?.toISOString() ?? createdAt;

	const handle = row.normalizedHandle
		? row.normalizedHandle.startsWith('@')
			? row.normalizedHandle
			: `@${row.normalizedHandle}`
		: '@' +
			row.name
				.toLowerCase()
				.replace(/\s+/g, '')
				.replace(/[^a-z0-9@]/g, '');

	const age = computeAge({ lastActivityAt, stage: row.stage as Stage, followUpAt: undefined });

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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listLeads(): Promise<Lead[]> {
	const rows = await db
		.select()
		.from(crmLeads)
		.where(isNull(crmLeads.deletedAt))
		.orderBy(desc(sql`coalesce(${crmLeads.lastActivityAt}, ${crmLeads.createdAt})`));
	return rows.map(dbRowToLead);
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

export async function moveLeadStage(
	id: string,
	stage: Stage,
	payload: MoveStagePayload,
	actorId: string
): Promise<Lead | null> {
	const [existing] = await db
		.select({ stage: crmLeads.stage, ownerId: crmLeads.ownerId })
		.from(crmLeads)
		.where(and(eq(crmLeads.id, id), isNull(crmLeads.deletedAt)))
		.limit(1);

	if (!existing) return null;

	const now = new Date();
	let updated: DbLead;

	if (stage === 'won') {
		[updated] = await db
			.update(crmLeads)
			.set({
				stage: 'won',
				wonOrgName: payload.wonOrgName ?? null,
				dealValueCents: payload.dealValueCents ?? null,
				currency: payload.currency ?? 'PHP',
				signedAt: payload.signedAt ? new Date(payload.signedAt) : now,
				lastActivityAt: now,
				updatedAt: now
			})
			.where(eq(crmLeads.id, id))
			.returning();
	} else if (stage === 'lost') {
		[updated] = await db
			.update(crmLeads)
			.set({
				stage: 'lost',
				lostReason: (payload.lostReason ?? null) as LostReason | null,
				lastActivityAt: now,
				updatedAt: now
			})
			.where(eq(crmLeads.id, id))
			.returning();
	} else {
		[updated] = await db
			.update(crmLeads)
			.set({ stage, updatedAt: now })
			.where(eq(crmLeads.id, id))
			.returning();
	}

	// Audit trail — always record the stage change
	const historyRows: (typeof crmLeadHistory.$inferInsert)[] = [
		{ leadId: id, actorUserId: actorId, field: 'stage', oldValue: existing.stage, newValue: stage }
	];
	if (stage === 'won') {
		if (payload.wonOrgName) {
			historyRows.push({
				leadId: id,
				actorUserId: actorId,
				field: 'won_org_name',
				oldValue: null,
				newValue: payload.wonOrgName
			});
		}
		if (payload.dealValueCents !== undefined) {
			historyRows.push({
				leadId: id,
				actorUserId: actorId,
				field: 'deal_value_cents',
				oldValue: null,
				newValue: String(payload.dealValueCents)
			});
		}
	}
	if (stage === 'lost' && payload.lostReason) {
		historyRows.push({
			leadId: id,
			actorUserId: actorId,
			field: 'lost_reason',
			oldValue: null,
			newValue: payload.lostReason
		});
	}
	await db.insert(crmLeadHistory).values(historyRows);

	return dbRowToLead(updated);
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
	const [updated] = await db
		.update(crmLeads)
		.set({ ownerId, updatedAt: now })
		.where(eq(crmLeads.id, id))
		.returning();

	await db.insert(crmLeadHistory).values({
		leadId: id,
		actorUserId: actorId,
		field: 'owner_id',
		oldValue: existing.ownerId,
		newValue: ownerId
	});

	return dbRowToLead(updated);
}
