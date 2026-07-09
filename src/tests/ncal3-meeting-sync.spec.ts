/**
 * Unit tests for NCAL-3 Phase 2 — meeting payload builder and sync orchestrators.
 *
 * Covers:
 *  - AC2: buildMeetingPayload field mapping (title, end=start+1h, location, description CRM-HREF)
 *  - AC6: sync failure → CalDavWebhookError propagates from createEvent mock
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock $env/dynamic/private (required before any import that reads env)
// ---------------------------------------------------------------------------
vi.mock('$env/dynamic/private', () => ({
	env: {
		N8N_CALENDAR_WEBHOOK_URL: 'http://mock-n8n/webhook',
		N8N_CALENDAR_DELETE_WEBHOOK_URL: 'http://mock-n8n/delete',
		N8N_WEBHOOK_SECRET: 'mock-secret',
		DATABASE_URL: 'postgres://mock',
		NEXTCLOUD_URL: 'https://mock.nextcloud',
		NEXTCLOUD_USER: 'mock',
		NEXTCLOUD_APP_PASSWORD: 'mock',
		NEXTCLOUD_CALENDAR_SLUG: 'mock-cal'
	}
}));

// ---------------------------------------------------------------------------
// Mock writer.ts so tests never hit n8n
// ---------------------------------------------------------------------------
vi.mock('$lib/caldav/writer', () => ({
	createEvent: vi.fn(),
	updateEvent: vi.fn(),
	deleteEvent: vi.fn(),
	embedCrmHref: vi.fn((href: string | undefined, desc: string | undefined) =>
		href ? `CRM-HREF:${href}${desc ? `\n${desc}` : ''}` : desc
	),
	CalDavWebhookError: class CalDavWebhookError extends Error {
		readonly upstreamStatus?: number;
		constructor(message: string, upstreamStatus?: number) {
			super(message);
			this.name = 'CalDavWebhookError';
			this.upstreamStatus = upstreamStatus;
		}
	}
}));

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------
vi.mock('$lib/server/db/meetings', () => ({
	updateMeetingNextcloudUid: vi.fn()
}));
vi.mock('$lib/server/db/leads', () => ({
	updateLeadNextcloudUids: vi.fn()
}));

import { buildMeetingPayload, syncMeetingToNextcloud } from '$lib/server/n8n/calendar-sync';
import { createEvent, CalDavWebhookError } from '$lib/caldav/writer';
import { updateMeetingNextcloudUid } from '$lib/server/db/meetings';

const createEventMock = vi.mocked(createEvent);
const updateMeetingNextcloudUidMock = vi.mocked(updateMeetingNextcloudUid);

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// AC2: buildMeetingPayload field mapping
// ---------------------------------------------------------------------------
describe('buildMeetingPayload (AC2)', () => {
	const BASE = {
		id: 'mtg-123',
		leadId: 'lead-456',
		startAt: '2026-09-01T10:00:00Z',
		venue: 'Makati Ballroom',
		notes: 'Bring contracts',
		nextcloudUid: null
	};

	it('sets title to "Team Meeting"', () => {
		const payload = buildMeetingPayload(BASE);
		expect(payload.title).toBe('Team Meeting');
	});

	it('sets end to exactly startAt + 1 hour', () => {
		const payload = buildMeetingPayload(BASE);
		const startMs = new Date(payload.start).getTime();
		const endMs = new Date(payload.end).getTime();
		expect(endMs - startMs).toBe(60 * 60 * 1000);
		// toISOString() includes milliseconds; accept both '...Z' and '...000Z'
		expect(new Date(payload.end).toISOString()).toBe('2026-09-01T11:00:00.000Z');
	});

	it('sets location from venue', () => {
		const payload = buildMeetingPayload(BASE);
		expect(payload.location).toBe('Makati Ballroom');
	});

	it('description contains CRM-HREF:/leads/[leadId] when leadId is present', () => {
		const payload = buildMeetingPayload(BASE);
		expect(payload.description).toContain('CRM-HREF:/leads/lead-456');
	});

	it('description falls back to CRM-HREF:/meetings/[id] when leadId is null', () => {
		const payload = buildMeetingPayload({ ...BASE, leadId: null });
		expect(payload.description).toContain('CRM-HREF:/meetings/mtg-123');
	});

	it('includes notes in description', () => {
		const payload = buildMeetingPayload(BASE);
		expect(payload.description).toContain('Bring contracts');
	});

	it('omits location when venue is null', () => {
		const payload = buildMeetingPayload({ ...BASE, venue: null });
		expect(payload.location).toBeUndefined();
	});

	it('generates a uid when nextcloudUid is null', () => {
		const payload = buildMeetingPayload(BASE);
		expect(typeof payload.uid).toBe('string');
		expect(payload.uid.length).toBeGreaterThan(0);
	});

	it('uses existing nextcloudUid when provided', () => {
		const payload = buildMeetingPayload({ ...BASE, nextcloudUid: 'existing-uid' });
		expect(payload.uid).toBe('existing-uid');
	});

	it('handles Date object for startAt', () => {
		const payload = buildMeetingPayload({ ...BASE, startAt: new Date('2026-09-01T10:00:00Z') });
		expect(new Date(payload.start).getTime()).toBe(new Date('2026-09-01T10:00:00Z').getTime());
		expect(new Date(payload.end).getTime() - new Date(payload.start).getTime()).toBe(
			60 * 60 * 1000
		);
	});
});

// ---------------------------------------------------------------------------
// AC6: sync failure → CalDavWebhookError thrown by createEvent propagates
// ---------------------------------------------------------------------------
describe('syncMeetingToNextcloud failure (AC6)', () => {
	it('re-throws CalDavWebhookError when createEvent fails', async () => {
		const err = new CalDavWebhookError('Calendar service unavailable');
		createEventMock.mockRejectedValueOnce(err);

		const meeting = {
			id: 'mtg-999',
			leadId: 'lead-001',
			startAt: '2026-10-01T09:00:00Z',
			venue: null,
			notes: null,
			nextcloudUid: null
		};

		await expect(syncMeetingToNextcloud(meeting)).rejects.toThrow('Calendar service unavailable');
		expect(createEventMock).toHaveBeenCalledTimes(1);
		// DB write-back should NOT have been called since createEvent threw
		expect(updateMeetingNextcloudUidMock).not.toHaveBeenCalled();
	});

	it('writes UID to DB on successful create', async () => {
		createEventMock.mockResolvedValueOnce({ uid: 'new-uid-abc' });

		const meeting = {
			id: 'mtg-888',
			leadId: 'lead-002',
			startAt: '2026-10-02T09:00:00Z',
			venue: 'SM Aura',
			notes: null,
			nextcloudUid: null
		};

		const uid = await syncMeetingToNextcloud(meeting);
		expect(uid).toBe('new-uid-abc');
		expect(updateMeetingNextcloudUidMock).toHaveBeenCalledWith('mtg-888', 'new-uid-abc');
	});
});
