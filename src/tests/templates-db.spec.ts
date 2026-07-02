/**
 * DB integration tests for the message-templates accessor.
 *
 * The CRUD roundtrip tests self-skip when DATABASE_URL is not set (no postgres
 * service — same posture as leads-db.spec.ts). Run locally with:
 *   docker compose up -d db && bun run test:unit:ci
 *
 * The `.toSQL()` filter assertion is DB-FREE and always runs — it is the
 * CI-green backstop proving `listTemplates` filters `deleted_at IS NULL`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	createTemplate,
	getTemplate,
	updateTemplate,
	softDeleteTemplate,
	listTemplates,
	listTemplatesQuery
} from '$lib/server/db/templates';
import { db } from '$lib/server/db/index';
import { crmMessageTemplates } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Skip when DATABASE_URL is not set (no postgres service available).
const SKIP_DB = !process.env.DATABASE_URL;

const TEST_PREFIX = '__inttest__';
const createdIds: string[] = [];

afterAll(async () => {
	if (SKIP_DB) return;
	// Hard-delete only the rows we created (identified by the test prefix on title)
	for (const id of createdIds) {
		await db.delete(crmMessageTemplates).where(eq(crmMessageTemplates.id, id));
	}
});

// --- DB-free backstop: proves the soft-delete filter is in every list read ---
describe('listTemplates query shape (DB-free)', () => {
	it('filters deleted_at IS NULL in the generated SQL', () => {
		const { sql } = listTemplatesQuery().toSQL();
		expect(sql).toMatch(/"deleted_at"\s+is\s+null/i);
	});

	it('orders by category then title', () => {
		const { sql } = listTemplatesQuery().toSQL();
		expect(sql).toMatch(/order by/i);
		expect(sql).toMatch(/"category"/i);
		expect(sql).toMatch(/"title"/i);
	});
});

describe.skipIf(SKIP_DB)('createTemplate + getTemplate roundtrip (DB)', () => {
	it('creates a template and reads it back by ID', async () => {
		const t = await createTemplate({
			title: `${TEST_PREFIX} Roundtrip`,
			category: 'Sports',
			body: 'Hi {{organizerName}} about {{eventName}} — {{repName}}'
		});
		createdIds.push(t.id);

		expect(t.id).toBeTruthy();
		expect(t.title).toBe(`${TEST_PREFIX} Roundtrip`);
		expect(t.category).toBe('Sports');

		const fetched = await getTemplate(t.id);
		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(t.id);
		expect(fetched!.body).toBe(t.body);
	});

	it('getTemplate returns null for a nonexistent UUID', async () => {
		const result = await getTemplate('00000000-0000-0000-0000-ffffffffffff');
		expect(result).toBeNull();
	});
});

describe.skipIf(SKIP_DB)('updateTemplate (DB)', () => {
	it('persists changed fields', async () => {
		const t = await createTemplate({
			title: `${TEST_PREFIX} Editable`,
			category: 'Other',
			body: 'original body'
		});
		createdIds.push(t.id);

		const updated = await updateTemplate(t.id, {
			title: `${TEST_PREFIX} Edited`,
			body: 'new body'
		});
		expect(updated).not.toBeNull();
		expect(updated!.title).toBe(`${TEST_PREFIX} Edited`);
		expect(updated!.body).toBe('new body');
		expect(updated!.category).toBe('Other');
	});
});

describe.skipIf(SKIP_DB)('softDeleteTemplate (DB)', () => {
	it('removes the template from listTemplates', async () => {
		const t = await createTemplate({
			title: `${TEST_PREFIX} ToDelete`,
			category: 'Other',
			body: 'delete me'
		});
		createdIds.push(t.id);

		const ok = await softDeleteTemplate(t.id);
		expect(ok).toBe(true);

		const list = await listTemplates();
		expect(list.find((x) => x.id === t.id)).toBeUndefined();
		expect(await getTemplate(t.id)).toBeNull();
	});

	it('double-delete is a no-op (returns false the second time)', async () => {
		const t = await createTemplate({
			title: `${TEST_PREFIX} DoubleDelete`,
			category: 'Other',
			body: 'x'
		});
		createdIds.push(t.id);

		expect(await softDeleteTemplate(t.id)).toBe(true);
		expect(await softDeleteTemplate(t.id)).toBe(false);
	});
});
