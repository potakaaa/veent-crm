/**
 * Integration tests for listMeetingsPaginated filter/sort behaviour
 * (DB integration — skipped when DATABASE_URL is absent), mirroring
 * leads-filters.spec.ts. Proves: organizer filter, lead filter, inclusive
 * date-range bounds, sort direction, and filtered `total`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { listMeetingsPaginated, createMeeting } from '$lib/server/db/meetings';
import { createLead } from '$lib/server/db/leads';
import { db } from '$lib/server/db/index';
import { crmMeetings, crmUsers, crmLeads } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const SEED = '__mtgflttest__';

// Two organizers + two leads seeded for this suite; cleaned up in afterAll.
const ORG_A = 'a1a1a1a1-1111-4111-8111-aaaaaaaaaaaa';
const ORG_B = 'b2b2b2b2-2222-4222-8222-bbbbbbbbbbbb';
const meetingIds: string[] = [];
const leadIds: string[] = [];
const userIds: string[] = [];

async function mkMeeting(leadId: string, organizerId: string, startAt: string, outcome?: string) {
	const m = await createMeeting({ leadId, startAt: new Date(startAt), organizerId, outcome });
	meetingIds.push(m.id);
	return m;
}

let leadA = '';
let leadB = '';

describe.skipIf(SKIP_DB)('listMeetingsPaginated — filter/sort (DB)', () => {
	beforeAll(async () => {
		// Two organizer users (createMeeting requires a real organizer FK).
		await db
			.insert(crmUsers)
			.values([
				{ id: ORG_A, name: `${SEED} OrgA`, role: 'rep' },
				{ id: ORG_B, name: `${SEED} OrgB`, role: 'rep' }
			])
			.onConflictDoNothing();
		userIds.push(ORG_A, ORG_B);

		const la = await createLead({ name: `${SEED} LeadA`, category: 'Sports' }, ORG_A);
		const lb = await createLead({ name: `${SEED} LeadB`, category: 'Sports' }, ORG_A);
		leadA = la.id;
		leadB = lb.id;
		leadIds.push(la.id, lb.id);

		// Varied startAt across two organizers + two leads.
		await mkMeeting(leadA, ORG_A, '2026-08-01T10:00:00.000Z'); // A / leadA / early
		await mkMeeting(leadA, ORG_A, '2026-08-15T10:00:00.000Z'); // A / leadA / mid
		await mkMeeting(leadB, ORG_B, '2026-08-31T23:00:00.000Z'); // B / leadB / late (same day boundary)
		// Distinctive outcome for the substring-filter test. Seeded under ORG_B + leadA
		// with an out-of-range (Sep) startAt so it doesn't disturb the organizer-count
		// (ORG_A=2), lead-count (leadB=1), or date-range assertions above.
		await mkMeeting(leadA, ORG_B, '2026-09-05T10:00:00.000Z', `${SEED} — Won Deal`);
	});

	afterAll(async () => {
		if (meetingIds.length) await db.delete(crmMeetings).where(inArray(crmMeetings.id, meetingIds));
		if (leadIds.length) await db.delete(crmLeads).where(inArray(crmLeads.id, leadIds));
		if (userIds.length) await db.delete(crmUsers).where(inArray(crmUsers.id, userIds));
	});

	it('organizer filter returns only that organizer', async () => {
		const { meetings } = await listMeetingsPaginated(1, 50, { organizerId: ORG_A });
		const seeded = meetings.filter((m) => meetingIds.includes(m.id));
		expect(seeded.length).toBe(2);
		expect(seeded.every((m) => m.organizerId === ORG_A)).toBe(true);
	});

	it('lead filter returns only that lead', async () => {
		const { meetings } = await listMeetingsPaginated(1, 50, { leadId: leadB });
		const seeded = meetings.filter((m) => meetingIds.includes(m.id));
		expect(seeded.length).toBe(1);
		expect(seeded.every((m) => m.leadId === leadB)).toBe(true);
	});

	it('date range is inclusive of the whole dateTo day (startAt is a timestamp)', async () => {
		// dateTo=2026-08-31 must include the 23:00 meeting on that day.
		const { meetings } = await listMeetingsPaginated(1, 50, {
			dateFrom: '2026-08-31',
			dateTo: '2026-08-31'
		});
		const seeded = meetings.filter((m) => meetingIds.includes(m.id));
		expect(seeded.length).toBe(1);
		expect(new Date(seeded[0].startAt).toISOString()).toBe('2026-08-31T23:00:00.000Z');
	});

	it('date range excludes rows outside the bounds', async () => {
		const { meetings } = await listMeetingsPaginated(1, 50, {
			dateFrom: '2026-08-01',
			dateTo: '2026-08-15'
		});
		const seeded = meetings.filter((m) => meetingIds.includes(m.id));
		expect(seeded.length).toBe(2); // the two early/mid Aug meetings, not the Aug 31 one
		expect(
			seeded.some((m) => new Date(m.startAt).toISOString() === '2026-08-31T23:00:00.000Z')
		).toBe(false);
	});

	it('sortDir asc/desc orders seeded meetings chronologically', async () => {
		const asc = await listMeetingsPaginated(1, 50, { organizerId: ORG_A, sortDir: 'asc' });
		const seededAsc = asc.meetings.filter((m) => meetingIds.includes(m.id));
		expect(new Date(seededAsc[0].startAt).getTime()).toBeLessThan(
			new Date(seededAsc[1].startAt).getTime()
		);

		const desc = await listMeetingsPaginated(1, 50, { organizerId: ORG_A, sortDir: 'desc' });
		const seededDesc = desc.meetings.filter((m) => meetingIds.includes(m.id));
		expect(new Date(seededDesc[0].startAt).getTime()).toBeGreaterThan(
			new Date(seededDesc[1].startAt).getTime()
		);
	});

	it('outcome filter returns only meetings whose outcome contains the substring (case-insensitive)', async () => {
		// Mixed-case, partial substring of the seeded `${SEED} — Won Deal` outcome.
		const { meetings } = await listMeetingsPaginated(1, 50, { outcome: 'won deal' });
		const seeded = meetings.filter((m) => meetingIds.includes(m.id));
		expect(seeded.length).toBe(1);
		expect(seeded[0].outcome).toBe(`${SEED} — Won Deal`);
	});

	it('total reflects the filtered set, not all meetings', async () => {
		const { total: totalA } = await listMeetingsPaginated(1, 1, { organizerId: ORG_A });
		const { total: totalAll } = await listMeetingsPaginated(1, 1, {});
		expect(totalA).toBeGreaterThanOrEqual(2);
		expect(totalAll).toBeGreaterThanOrEqual(totalA);
	});
});
