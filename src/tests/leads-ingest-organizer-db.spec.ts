/**
 * DB integration tests for organizer auto-linking on the ingest endpoint
 * (organizer-ingest-seeding plan, AC1–AC4). Requires a live Postgres.
 * Run: docker compose up -d db && bun run test:unit:ci
 *
 * Skipped automatically when DATABASE_URL is not set (matches every other *-db.spec.ts).
 *
 * The endpoint's auth guard reads INGEST_SECRET from $env/dynamic/private; the real `db`
 * client reads DATABASE_URL from the same module. Both are supplied via a single vi.mock of
 * $env/dynamic/private (DATABASE_URL copied from process.env so the real client still
 * connects), following the src/tests/reminders-due-endpoint.spec.ts precedent for driving a
 * +server.ts handler directly.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';

const SKIP_DB = !process.env.DATABASE_URL;

// Hoisted so the vi.mock factory (also hoisted) can reference it without a TDZ error.
const { INGEST_SECRET } = vi.hoisted(() => ({ INGEST_SECRET: 'test-ingest-secret' }));

vi.mock('$env/dynamic/private', () => ({
	env: { INGEST_SECRET, DATABASE_URL: process.env.DATABASE_URL }
}));

import { POST } from '../routes/api/leads/ingest/+server';
import { db } from '$lib/server/db/index';
import { crmLeads, crmOrganizers } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

const TEST_PREFIX = '__ingestorgtest__';
const createdLeadIds: string[] = [];
const createdOrgIds: string[] = [];

type PostParams = Parameters<typeof POST>[0];

function runPost(body: unknown, bearer: string | undefined = INGEST_SECRET) {
	const headers = new Headers();
	if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
	const request = {
		headers,
		json: async () => body
	} as unknown as Request;
	return POST({ request } as unknown as PostParams);
}

async function trackByHandle(handle: string) {
	const leadRows = await db
		.select({ id: crmLeads.id })
		.from(crmLeads)
		.where(eq(crmLeads.normalizedHandle, handle));
	for (const r of leadRows) createdLeadIds.push(r.id);
	const orgRows = await db
		.select({ id: crmOrganizers.id })
		.from(crmOrganizers)
		.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
	for (const r of orgRows) createdOrgIds.push(r.id);
}

afterAll(async () => {
	if (SKIP_DB) return;
	for (const id of createdLeadIds) await db.delete(crmLeads).where(eq(crmLeads.id, id));
	for (const id of createdOrgIds) await db.delete(crmOrganizers).where(eq(crmOrganizers.id, id));
});

describe.skipIf(SKIP_DB)('POST /api/leads/ingest — organizer auto-linking (DB)', () => {
	it('AC1: no existing organizer for handle → creates one and links it', async () => {
		const handle = `${TEST_PREFIX}ac1handle`;
		await runPost({ leads: [{ pageName: 'AC1 Org', handle }] });
		await trackByHandle(handle);

		const [org] = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
		expect(org).toBeTruthy();

		const [lead] = await db
			.select({ organizerId: crmLeads.organizerId })
			.from(crmLeads)
			.where(eq(crmLeads.normalizedHandle, handle));
		expect(lead.organizerId).toBe(org.id);
	});

	it('AC2: existing organizer for handle → reuses it, no duplicate created', async () => {
		const handle = `${TEST_PREFIX}ac2handle`;
		const [seeded] = await db
			.insert(crmOrganizers)
			.values({ name: `${TEST_PREFIX} AC2`, normalizedHandle: handle })
			.returning({ id: crmOrganizers.id });
		createdOrgIds.push(seeded.id);

		await runPost({ leads: [{ pageName: 'AC2 Org', handle }] });
		await trackByHandle(handle);

		const orgs = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
		expect(orgs.length).toBe(1);

		const [lead] = await db
			.select({ organizerId: crmLeads.organizerId })
			.from(crmLeads)
			.where(eq(crmLeads.normalizedHandle, handle));
		expect(lead.organizerId).toBe(seeded.id);
	});

	it('AC3: duplicate lead path unaffected — no organizer side-effect on the second POST', async () => {
		const handle = `${TEST_PREFIX}ac3handle`;
		const sourceRef = `${TEST_PREFIX}-ac3-ref`;
		const res1 = await runPost({ leads: [{ pageName: 'AC3 Org', handle, sourceRef }] });
		await trackByHandle(handle);
		const body1 = await res1.json();
		expect(body1.created).toBe(1);

		const orgsAfterFirst = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
		expect(orgsAfterFirst.length).toBe(1);

		// Second POST is a sourceRef duplicate → hits skip/patch path, no new organizer.
		const res2 = await runPost({ leads: [{ pageName: 'AC3 Org', handle, sourceRef }] });
		const body2 = await res2.json();
		expect(body2.created).toBe(0);
		expect(body2.skipped + body2.patched).toBe(1);

		const orgsAfterSecond = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
		expect(orgsAfterSecond.length).toBe(1);
	});

	it('AC4: response shape parity ({ received, created, skipped, patched })', async () => {
		const handle = `${TEST_PREFIX}ac4handle`;
		const res = await runPost({ leads: [{ pageName: 'AC4 Org', handle }] });
		await trackByHandle(handle);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual(['created', 'patched', 'received', 'skipped']);
		expect(body.received).toBe(1);
	});

	it('AC4: secret-auth 401 short-circuits before any organizer logic runs', async () => {
		const handle = `${TEST_PREFIX}ac4authhandle`;
		let thrown: unknown;
		try {
			await runPost({ leads: [{ pageName: 'AC4 Auth', handle }] }, 'wrong-secret');
		} catch (e) {
			thrown = e;
		}
		expect((thrown as { status: number })?.status).toBe(401);

		// No organizer and no lead should have been created for this handle.
		const orgs = await db
			.select({ id: crmOrganizers.id })
			.from(crmOrganizers)
			.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${handle})`);
		expect(orgs.length).toBe(0);
	});
});
