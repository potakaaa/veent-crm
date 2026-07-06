/**
 * Server-side DB access for recurring-organizer entities (crm_organizers, GitHub #188).
 * Read-only lookup used by the meeting-create organizer pre-fill combobox.
 */
import { db } from './index';
import { crmOrganizers } from './schema';
import { ilike, asc, type SQL } from 'drizzle-orm';

/**
 * Case-insensitive name search over crm_organizers. Empty/blank query returns the first
 * `limit` organizers alphabetically. Escapes LIKE metacharacters so literal input never
 * acts as a wildcard. Returns the minimal `{ id, name }` shape the combobox needs.
 */
export async function searchOrganizers(
	q: string | null | undefined,
	limit = 20
): Promise<{ id: string; name: string }[]> {
	const term = (q ?? '').trim();
	const where: SQL | undefined = term
		? ilike(crmOrganizers.name, `%${term.replace(/[\\%_]/g, '\\$&')}%`)
		: undefined;
	return db
		.select({ id: crmOrganizers.id, name: crmOrganizers.name })
		.from(crmOrganizers)
		.where(where)
		.orderBy(asc(crmOrganizers.name))
		.limit(limit);
}
