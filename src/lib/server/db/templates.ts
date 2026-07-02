/**
 * Server-side DB access for outreach message templates.
 * Mirrors meetings.ts / leads.ts: the pure mapper is exported for unit tests;
 * query/mutation functions run against Postgres. All reads filter
 * `deleted_at IS NULL` (soft-delete only) — a double-delete is a no-op.
 */
import { db } from './index';
import { crmMessageTemplates, leadCategory } from './schema';
import { eq, and, isNull, asc, desc, ilike, or, count, sql } from 'drizzle-orm';
import type { MessageTemplate } from '$lib/types';
import type { TemplateForm } from '$lib/zod/schemas';

type DbTemplate = typeof crmMessageTemplates.$inferSelect;

export class TemplateTitleConflictError extends Error {
	constructor() {
		super('A template with this title already exists');
		this.name = 'TemplateTitleConflictError';
	}
}

// ---------------------------------------------------------------------------
// Pure mapper (exported for unit tests)
// ---------------------------------------------------------------------------

export function dbRowToTemplate(row: DbTemplate): MessageTemplate {
	return {
		id: row.id,
		category: row.category,
		title: row.title,
		body: row.body,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All non-deleted templates, ordered by category then title. */
export function listTemplatesQuery() {
	return db
		.select()
		.from(crmMessageTemplates)
		.where(isNull(crmMessageTemplates.deletedAt))
		.orderBy(asc(crmMessageTemplates.category), asc(crmMessageTemplates.title));
}

export async function listTemplates(): Promise<MessageTemplate[]> {
	const rows = await listTemplatesQuery();
	return rows.map(dbRowToTemplate);
}

export const TEMPLATES_PAGE_SIZE = 20;

export async function listTemplatesPaginated(opts: {
	page: number;
	q?: string;
	category?: string;
	sort: 'title' | 'newest' | 'oldest';
}): Promise<{ templates: MessageTemplate[]; total: number }> {
	const { page, q, category, sort } = opts;

	type CategoryValue = (typeof leadCategory.enumValues)[number];
	const conditions = [isNull(crmMessageTemplates.deletedAt)];
	if (category && (leadCategory.enumValues as readonly string[]).includes(category)) {
		conditions.push(eq(crmMessageTemplates.category, category as CategoryValue));
	}
	if (q) {
		conditions.push(
			or(ilike(crmMessageTemplates.title, `%${q}%`), ilike(crmMessageTemplates.body, `%${q}%`)) ??
				sql`false`
		);
	}
	const where = and(...conditions);

	const orderBy =
		sort === 'newest'
			? [desc(crmMessageTemplates.createdAt)]
			: sort === 'oldest'
				? [asc(crmMessageTemplates.createdAt)]
				: [asc(crmMessageTemplates.category), asc(crmMessageTemplates.title)];

	const [rows, [{ total }]] = await Promise.all([
		db
			.select()
			.from(crmMessageTemplates)
			.where(where)
			.orderBy(...orderBy)
			.limit(TEMPLATES_PAGE_SIZE)
			.offset((page - 1) * TEMPLATES_PAGE_SIZE),
		db.select({ total: count() }).from(crmMessageTemplates).where(where)
	]);

	return { templates: rows.map(dbRowToTemplate), total };
}

/** Single non-deleted template by id, or null. */
export async function getTemplate(id: string): Promise<MessageTemplate | null> {
	const [row] = await db
		.select()
		.from(crmMessageTemplates)
		.where(and(eq(crmMessageTemplates.id, id), isNull(crmMessageTemplates.deletedAt)))
		.limit(1);
	return row ? dbRowToTemplate(row) : null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createTemplate(input: TemplateForm): Promise<MessageTemplate> {
	try {
		const [row] = await db
			.insert(crmMessageTemplates)
			.values({
				category: input.category,
				title: input.title,
				body: input.body
			})
			.returning();
		return dbRowToTemplate(row);
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			throw new TemplateTitleConflictError();
		}
		throw err;
	}
}

export async function updateTemplate(
	id: string,
	patch: Partial<TemplateForm>
): Promise<MessageTemplate | null> {
	const set: Partial<typeof crmMessageTemplates.$inferInsert> = { updatedAt: new Date() };
	if (patch.category !== undefined) set.category = patch.category;
	if (patch.title !== undefined) set.title = patch.title;
	if (patch.body !== undefined) set.body = patch.body;

	try {
		const rows = await db
			.update(crmMessageTemplates)
			.set(set)
			.where(and(eq(crmMessageTemplates.id, id), isNull(crmMessageTemplates.deletedAt)))
			.returning();
		return rows[0] ? dbRowToTemplate(rows[0]) : null;
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			throw new TemplateTitleConflictError();
		}
		throw err;
	}
}

/** Sets `deletedAt = now()`. Filtered to non-deleted rows so double-delete is a no-op. */
export async function softDeleteTemplate(id: string): Promise<boolean> {
	const now = new Date();
	const rows = await db
		.update(crmMessageTemplates)
		.set({ deletedAt: now, updatedAt: now })
		.where(and(eq(crmMessageTemplates.id, id), isNull(crmMessageTemplates.deletedAt)))
		.returning({ id: crmMessageTemplates.id });
	return rows.length > 0;
}
