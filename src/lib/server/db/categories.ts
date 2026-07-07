/**
 * Server-side DB access for editable lead categories (CAT-1, GitHub #248).
 * All functions run Drizzle queries — never import from client-side code.
 *
 * Duplicate-name detection (create/rename) is case-insensitive: we query for an
 * existing non-deleted row with LOWER(name) = LOWER(input) first and throw a typed
 * `Error('DUPLICATE_NAME')` the API route maps to HTTP 409. The DB also carries a
 * LOWER(name) unique index as the backstop against races.
 */
import { db } from './index';
import { crmCategories, crmLeadCategories } from './schema';
import { eq, isNull, asc, and, inArray, sql, type InferSelectModel } from 'drizzle-orm';

export const DUPLICATE_NAME_ERROR = 'DUPLICATE_NAME';

export type Category = InferSelectModel<typeof crmCategories>;

/** All non-deleted categories, alphabetically by name. */
export async function getActiveCategories(): Promise<Category[]> {
	return db
		.select()
		.from(crmCategories)
		.where(isNull(crmCategories.deletedAt))
		.orderBy(asc(crmCategories.name));
}

/** Categories assigned to a specific lead, alphabetically by name. */
export async function getCategoriesForLead(leadId: string): Promise<Category[]> {
	const rows = await db
		.select({ category: crmCategories })
		.from(crmLeadCategories)
		.innerJoin(crmCategories, eq(crmLeadCategories.categoryId, crmCategories.id))
		.where(and(eq(crmLeadCategories.leadId, leadId), isNull(crmCategories.deletedAt)))
		.orderBy(asc(crmCategories.name));
	return rows.map((r) => r.category);
}

/**
 * Bulk-load active categories for many leads in one query (CAT-1 leads list, GitHub #248).
 * Returns a `Map<leadId, Category[]>` (categories alpha-sorted within each lead). Leads with
 * no assignments are simply absent from the map — callers default to an empty array. Avoids
 * the N+1 that per-row `getCategoriesForLead` calls would cause on the leads list. An empty
 * input yields an empty map (no query).
 */
export async function getCategoriesForLeads(leadIds: string[]): Promise<Map<string, Category[]>> {
	const map = new Map<string, Category[]>();
	if (leadIds.length === 0) return map;

	const rows = await db
		.select({ leadId: crmLeadCategories.leadId, category: crmCategories })
		.from(crmLeadCategories)
		.innerJoin(crmCategories, eq(crmLeadCategories.categoryId, crmCategories.id))
		.where(and(inArray(crmLeadCategories.leadId, leadIds), isNull(crmCategories.deletedAt)))
		.orderBy(asc(crmCategories.name));

	for (const { leadId, category } of rows) {
		const list = map.get(leadId);
		if (list) list.push(category);
		else map.set(leadId, [category]);
	}
	return map;
}

/**
 * Insert a new category. Throws `Error(DUPLICATE_NAME_ERROR)` when a non-deleted
 * category already exists with the same name (case-insensitive).
 */
export async function createCategory(
	name: string,
	color: string | null,
	createdById: string
): Promise<Category> {
	const [existing] = await db
		.select({ id: crmCategories.id })
		.from(crmCategories)
		.where(and(sql`LOWER(${crmCategories.name}) = LOWER(${name})`, isNull(crmCategories.deletedAt)))
		.limit(1);
	if (existing) throw new Error(DUPLICATE_NAME_ERROR);

	const [row] = await db
		.insert(crmCategories)
		.values({ name, color, createdBy: createdById })
		.returning();
	return row;
}

/** Assign a category to a lead. Idempotent — ON CONFLICT (lead_id, category_id) DO NOTHING. */
export async function assignCategory(leadId: string, categoryId: string): Promise<void> {
	await db.insert(crmLeadCategories).values({ leadId, categoryId }).onConflictDoNothing();
}

/** Remove a lead↔category assignment. No-op when the pair does not exist. */
export async function removeAssignment(leadId: string, categoryId: string): Promise<void> {
	await db
		.delete(crmLeadCategories)
		.where(and(eq(crmLeadCategories.leadId, leadId), eq(crmLeadCategories.categoryId, categoryId)));
}

/**
 * Rename a category. Throws `Error(DUPLICATE_NAME_ERROR)` when another non-deleted
 * category already uses the target name (case-insensitive). Returns the updated row,
 * or `null` when no active category with `id` exists.
 */
export async function renameCategory(id: string, name: string): Promise<Category | null> {
	const [dup] = await db
		.select({ id: crmCategories.id })
		.from(crmCategories)
		.where(
			and(
				sql`LOWER(${crmCategories.name}) = LOWER(${name})`,
				sql`${crmCategories.id} <> ${id}`,
				isNull(crmCategories.deletedAt)
			)
		)
		.limit(1);
	if (dup) throw new Error(DUPLICATE_NAME_ERROR);

	const [row] = await db
		.update(crmCategories)
		.set({ name, updatedAt: new Date() })
		.where(and(eq(crmCategories.id, id), isNull(crmCategories.deletedAt)))
		.returning();
	return row ?? null;
}

/**
 * Soft-delete a category (set `deletedAt`) and hard-delete all of its join rows,
 * atomically. Returns `false` when no active category with `id` exists.
 */
export async function softDeleteCategory(id: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(crmCategories)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(and(eq(crmCategories.id, id), isNull(crmCategories.deletedAt)))
			.returning({ id: crmCategories.id });
		if (!row) return false;
		await tx.delete(crmLeadCategories).where(eq(crmLeadCategories.categoryId, id));
		return true;
	});
}
