/**
 * Hybrid (DB-optional) round-trip tests for the meeting → lead-organizer link (GitHub #188).
 *
 * Prerequisites:
 *   docker compose up -d db && bun run db:push && bun run db:seed
 *
 * Skipped when DATABASE_URL is not set (no postgres service in CI — repo-wide known gap;
 * mirrors meeting-reminders-db.spec.ts). To run locally: ensure DATABASE_URL is in .env, then
 *   bun run test:unit:ci -- src/tests/meetings-organizer-db.spec.ts
 *
 * Covers (A-persist Hybrid gate):
 *   - create a meeting from a lead tagged to an organizer → crm_meetings.lead_organizer_id set
 *   - create a meeting from a lead with no organizer → column stays null (no crash)
 *   - update clears the saved leadOrganizerId when passed null
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createMeeting, updateMeeting } from '$lib/server/db/meetings';
import { db } from '$lib/server/db/index';
import { crmLeads, crmMeetings, crmOrganizers } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

const SKIP_DB = !process.env.DATABASE_URL;
const TEST_PREFIX = '__mtgorgtest__';

const createdLeadIds: string[] = [];
const createdMeetingIds: string[] = [];
const createdOrganizerIds: string[] = [];

afterAll(async () => {
	if (createdMeetingIds.length > 0) {
		await db.delete(crmMeetings).where(inArray(crmMeetings.id, createdMeetingIds));
	}
	if (createdLeadIds.length > 0) {
		await db.delete(crmLeads).where(inArray(crmLeads.id, createdLeadIds));
	}
	if (createdOrganizerIds.length > 0) {
		await db.delete(crmOrganizers).where(inArray(crmOrganizers.id, createdOrganizerIds));
	}
});

async function makeOrganizer(name: string): Promise<string> {
	const [org] = await db
		.insert(crmOrganizers)
		.values({ name: `${TEST_PREFIX} ${name}` })
		.returning({ id: crmOrganizers.id });
	createdOrganizerIds.push(org.id);
	return org.id;
}

async function makeLead(name: string, organizerId?: string): Promise<string> {
	const [lead] = await db
		.insert(crmLeads)
		.values({
			name: `${TEST_PREFIX} ${name}`,
			organizerId: organizerId ?? null
		})
		.returning({ id: crmLeads.id });
	createdLeadIds.push(lead.id);
	return lead.id;
}

async function readLeadOrganizerId(meetingId: string): Promise<string | null> {
	const [row] = await db
		.select({ leadOrganizerId: crmMeetings.leadOrganizerId })
		.from(crmMeetings)
		.where(eq(crmMeetings.id, meetingId))
		.limit(1);
	return row?.leadOrganizerId ?? null;
}

describe.skipIf(SKIP_DB)('meeting → lead-organizer link persistence (DB)', () => {
	it('persists lead_organizer_id when creating a meeting for a lead tagged to an organizer', async () => {
		const organizerId = await makeOrganizer('Acme');
		const leadId = await makeLead('Tagged Lead', organizerId);
		const meeting = await createMeeting({
			leadId,
			startAt: new Date('2026-08-01T10:00:00.000Z'),
			leadOrganizerId: organizerId
		});
		createdMeetingIds.push(meeting.id);
		expect(meeting.leadOrganizerId).toBe(organizerId);
		expect(await readLeadOrganizerId(meeting.id)).toBe(organizerId);
	});

	it('leaves lead_organizer_id null when the lead has no organizer (no crash)', async () => {
		const leadId = await makeLead('Untagged Lead');
		const meeting = await createMeeting({
			leadId,
			startAt: new Date('2026-08-01T11:00:00.000Z'),
			leadOrganizerId: null
		});
		createdMeetingIds.push(meeting.id);
		expect(meeting.leadOrganizerId).toBeNull();
		expect(await readLeadOrganizerId(meeting.id)).toBeNull();
	});

	it('clears the saved lead_organizer_id when updated with null', async () => {
		const organizerId = await makeOrganizer('Beta');
		const leadId = await makeLead('Editable Lead', organizerId);
		const meeting = await createMeeting({
			leadId,
			startAt: new Date('2026-08-01T12:00:00.000Z'),
			leadOrganizerId: organizerId
		});
		createdMeetingIds.push(meeting.id);
		expect(await readLeadOrganizerId(meeting.id)).toBe(organizerId);

		const updated = await updateMeeting(meeting.id, { leadOrganizerId: null });
		expect(updated?.leadOrganizerId).toBeNull();
		expect(await readLeadOrganizerId(meeting.id)).toBeNull();
	});
});
