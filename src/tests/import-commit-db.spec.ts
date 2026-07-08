/**
 * DB integration tests for the CSV/Sheets import commit path (GitHub #210/#211) — requires the
 * docker postgres container to be running.
 * Run: docker compose up -d db && bun run test:unit:ci
 *
 * Skipped automatically when DATABASE_URL is not set (mirrors every other *-db.spec.ts in this
 * repo — real-DB-or-skip, never a mocked db module). Tests runImportCommit against the real Drizzle
 * layer directly (no HTTP, auth bypassed).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { runImportCommit } from '$lib/server/db/import-commit';
import { db } from '$lib/server/db/index';
import { crmLeads, crmOrganizers } from '$lib/server/db/schema';
import { eq, like } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const PREFIX = `__importtest__${Date.now()}`;

afterAll(async () => {
	await db.delete(crmLeads).where(like(crmLeads.name, `${PREFIX}%`));
	await db.delete(crmOrganizers).where(like(crmOrganizers.name, `${PREFIX}%`));
});

describe.skipIf(SKIP_DB)('runImportCommit — single-target writes (AC8)', () => {
	it('target=leads creates only crm_leads rows, none in crm_organizers', async () => {
		const name = `${PREFIX} LeadsOnly`;
		const summary = await runImportCommit(
			{ target: 'leads', rows: [{ data: { name }, skip: false }] },
			db
		);
		expect(summary.created).toBe(1);

		const leads = await db.select().from(crmLeads).where(eq(crmLeads.name, name));
		expect(leads.length).toBe(1);
		const orgs = await db.select().from(crmOrganizers).where(eq(crmOrganizers.name, name));
		expect(orgs.length).toBe(0);
	});

	it('target=organizers creates only crm_organizers rows, none in crm_leads', async () => {
		const name = `${PREFIX} OrgsOnly`;
		const summary = await runImportCommit(
			{
				target: 'organizers',
				rows: [{ data: { name, socialFacebook: 'https://facebook.com/orgsonly' }, skip: false }]
			},
			db
		);
		expect(summary.created).toBe(1);

		const orgs = await db.select().from(crmOrganizers).where(eq(crmOrganizers.name, name));
		expect(orgs.length).toBe(1);
		const leads = await db.select().from(crmLeads).where(eq(crmLeads.name, name));
		expect(leads.length).toBe(0);
	});
});

describe.skipIf(SKIP_DB)('runImportCommit — source tagging (AC9)', () => {
	it("leads created via this path have source = 'sheet_import'", async () => {
		const name = `${PREFIX} SourceTag`;
		await runImportCommit({ target: 'leads', rows: [{ data: { name }, skip: false }] }, db);
		const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.name, name));
		expect(lead.source).toBe('sheet_import');
		expect(lead.stage).toBe('new');
		expect(lead.ownerId).toBeNull();
	});
});

describe.skipIf(SKIP_DB)('runImportCommit — skip accounting (AC11)', () => {
	it('a user-skipped row is absent from the DB and counted as skipped, not errored', async () => {
		const kept = `${PREFIX} Kept`;
		const skippedName = `${PREFIX} Skipped`;
		const summary = await runImportCommit(
			{
				target: 'leads',
				rows: [
					{ data: { name: kept }, skip: false },
					{ data: { name: skippedName }, skip: true }
				]
			},
			db
		);
		expect(summary.created).toBe(1);
		expect(summary.skipped).toBe(1);
		expect(summary.errored).toBe(0);

		const skippedRows = await db.select().from(crmLeads).where(eq(crmLeads.name, skippedName));
		expect(skippedRows.length).toBe(0);
		const keptRows = await db.select().from(crmLeads).where(eq(crmLeads.name, kept));
		expect(keptRows.length).toBe(1);
	});
});
