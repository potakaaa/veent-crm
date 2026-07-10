/**
 * Unit tests for NCAL-3 Phase 2 — lead date payload builders and sync orchestrators.
 *
 * Covers:
 *  - AC3: buildGoLiveDatePayload — exact UTC strings, title suffix
 *  - AC4: buildEventDatePayload — exact UTC strings, title suffix
 *  - AC5: syncLeadDatesToNextcloud 6-branch coverage (3 per date field)
 *  - AC7: sync failure propagates from syncLeadDatesToNextcloud
 *  - AC12: both dates null + no prev UIDs → none of create/update/delete called
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock $env/dynamic/private
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
// Mock writer.ts
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

import {
	buildGoLiveDatePayload,
	buildEventDatePayload,
	manilaAllDayRange,
	syncLeadDatesToNextcloud
} from '$lib/server/n8n/calendar-sync';
import { createEvent, updateEvent, deleteEvent, CalDavWebhookError } from '$lib/caldav/writer';
import { updateLeadNextcloudUids } from '$lib/server/db/leads';
import type { Lead } from '$lib/types';

const createEventMock = vi.mocked(createEvent);
const updateEventMock = vi.mocked(updateEvent);
const deleteEventMock = vi.mocked(deleteEvent);
const updateLeadNextcloudUidsMock = vi.mocked(updateLeadNextcloudUids);

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: minimal Lead stub
// ---------------------------------------------------------------------------
function makeLead(overrides: Partial<Lead> = {}): Lead {
	return {
		id: 'lead-001',
		name: 'Test Lead',
		handle: '@test',
		location: '—',
		country: '—',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: 'user-001',
		visibility: 'team',
		source: 'organic',
		organizerName: 'Test Organizer',
		eventName: 'Big Concert',
		...overrides
	} as Lead;
}

// ---------------------------------------------------------------------------
// AC3: buildGoLiveDatePayload — Manila all-day UTC range + title
// ---------------------------------------------------------------------------
describe('buildGoLiveDatePayload (AC3)', () => {
	it('produces exact UTC start T16:00:00Z for the PREVIOUS calendar day (Manila midnight = UTC prev-day 16:00)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: 'Test Organizer',
			goLiveDate: '2026-08-15'
		});
		expect(payload.start).toBe('2026-08-14T16:00:00Z');
	});

	it('produces exact UTC end T15:59:59Z on the SAME calendar day (Manila end-of-day = UTC dateStr 15:59:59)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: 'Test Organizer',
			goLiveDate: '2026-08-15'
		});
		expect(payload.end).toBe('2026-08-15T15:59:59Z');
	});

	it('title contains "Ticket Sale Start"', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: 'Summer Fest',
			goLiveDate: '2026-08-15'
		});
		expect(payload.title).toContain('Ticket Sale Start');
	});

	it('title uses organizerName when present, with 🎟️ prefix (NCAL-5)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: 'Summer Fest',
			eventName: 'Other Name',
			goLiveDate: '2026-08-15'
		});
		expect(payload.title).toBe('\u{1F39F}\u{FE0F} Summer Fest — Ticket Sale Start');
		expect(payload.title.startsWith('\u{1F39F}')).toBe(true);
	});

	it('falls back to eventName when organizerName is null, with 🎟️ prefix (NCAL-5)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: null,
			eventName: 'Rock Night',
			goLiveDate: '2026-08-15'
		});
		expect(payload.title).toBe('\u{1F39F}\u{FE0F} Rock Night — Ticket Sale Start');
	});

	it('falls back to "Lead" when both organizerName and eventName are null, with 🎟️ prefix (NCAL-5)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			organizerName: null,
			eventName: null,
			goLiveDate: '2026-08-15'
		});
		expect(payload.title).toBe('\u{1F39F}\u{FE0F} Lead — Ticket Sale Start');
	});

	it('handles month-boundary correctly (Aug 31: start=Aug 30 T16, end=Aug 31 T15:59:59)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			goLiveDate: '2026-08-31'
		});
		expect(payload.start).toBe('2026-08-30T16:00:00Z');
		expect(payload.end).toBe('2026-08-31T15:59:59Z');
	});

	it('handles year-boundary correctly (Dec 31: start=Dec 30 T16, end=Dec 31 T15:59:59)', () => {
		const payload = buildGoLiveDatePayload({
			id: 'lead-001',
			goLiveDate: '2026-12-31'
		});
		expect(payload.start).toBe('2026-12-30T16:00:00Z');
		expect(payload.end).toBe('2026-12-31T15:59:59Z');
	});
});

// ---------------------------------------------------------------------------
// AC4: buildEventDatePayload — same shape, '— Event Date' suffix
// ---------------------------------------------------------------------------
describe('buildEventDatePayload (AC4)', () => {
	it('produces exact UTC start T16:00:00Z for the PREVIOUS calendar day (Manila midnight = UTC prev-day 16:00)', () => {
		const payload = buildEventDatePayload({
			id: 'lead-001',
			organizerName: 'Jazz Night',
			eventDate: '2026-10-20'
		});
		expect(payload.start).toBe('2026-10-19T16:00:00Z');
	});

	it('produces exact UTC end T15:59:59Z on the SAME calendar day (Manila end-of-day = UTC dateStr 15:59:59)', () => {
		const payload = buildEventDatePayload({
			id: 'lead-001',
			eventDate: '2026-10-20'
		});
		expect(payload.end).toBe('2026-10-20T15:59:59Z');
	});

	it('title contains "Event Date"', () => {
		const payload = buildEventDatePayload({
			id: 'lead-001',
			organizerName: 'Jazz Night',
			eventDate: '2026-10-20'
		});
		expect(payload.title).toContain('Event Date');
	});

	it('title uses organizerName when present, with 🚀 prefix (NCAL-5)', () => {
		const payload = buildEventDatePayload({
			id: 'lead-001',
			organizerName: 'Jazz Night',
			eventName: 'Other',
			eventDate: '2026-10-20'
		});
		expect(payload.title).toBe('🚀 Jazz Night — Event Date');
		expect(payload.title.startsWith('🚀')).toBe(true);
	});

	it('falls back to eventName when organizerName is null, with 🚀 prefix (NCAL-5)', () => {
		const payload = buildEventDatePayload({
			id: 'lead-001',
			organizerName: null,
			eventName: 'Big Festival',
			eventDate: '2026-10-20'
		});
		expect(payload.title).toBe('🚀 Big Festival — Event Date');
	});
});

// ---------------------------------------------------------------------------
// manilaAllDayRange edge cases (supports AC3 + AC4)
// ---------------------------------------------------------------------------
describe('manilaAllDayRange', () => {
	it('converts YYYY-MM-DD to correct UTC bounds (Manila midnight = prev-day T16:00Z, end-of-day = same-day T15:59:59Z)', () => {
		const { start, end } = manilaAllDayRange('2026-08-15');
		// Manila midnight Aug 15 (UTC+8) = UTC Aug 14 16:00
		expect(start).toBe('2026-08-14T16:00:00Z');
		// Manila end-of-day Aug 15 = UTC Aug 15 15:59:59
		expect(end).toBe('2026-08-15T15:59:59Z');
	});
});

// ---------------------------------------------------------------------------
// AC5: syncLeadDatesToNextcloud — 6 branch tests (3 per date field)
// ---------------------------------------------------------------------------
describe('syncLeadDatesToNextcloud (AC5)', () => {
	// goLiveDate Branch 1: date set + no UID → createEvent + write UID
	it('goLiveDate: creates event when date present and no prev UID', async () => {
		createEventMock.mockResolvedValueOnce({ uid: 'go-live-uid-1' });
		const lead = makeLead({ goLiveDate: '2026-11-01' });
		await syncLeadDatesToNextcloud(lead, { nextcloudGoLiveUid: null });
		expect(createEventMock).toHaveBeenCalledTimes(1);
		expect(updateLeadNextcloudUidsMock).toHaveBeenCalledWith('lead-001', {
			nextcloudGoLiveUid: 'go-live-uid-1'
		});
	});

	// goLiveDate Branch 2: date set + UID exists → updateEvent
	it('goLiveDate: updates event when date present and UID exists', async () => {
		updateEventMock.mockResolvedValueOnce(undefined);
		const lead = makeLead({ goLiveDate: '2026-11-01' });
		await syncLeadDatesToNextcloud(lead, { nextcloudGoLiveUid: 'existing-go-live-uid' });
		expect(updateEventMock).toHaveBeenCalledTimes(1);
		expect(updateEventMock).toHaveBeenCalledWith(
			'existing-go-live-uid',
			expect.objectContaining({ title: expect.stringContaining('Ticket Sale Start') })
		);
		expect(createEventMock).not.toHaveBeenCalled();
	});

	// goLiveDate Branch 3: date cleared + UID exists → deleteEvent + clear UID
	it('goLiveDate: deletes event when date cleared and UID exists', async () => {
		deleteEventMock.mockResolvedValueOnce(undefined);
		const lead = makeLead({ goLiveDate: undefined });
		await syncLeadDatesToNextcloud(lead, { nextcloudGoLiveUid: 'old-go-live-uid' });
		expect(deleteEventMock).toHaveBeenCalledWith('old-go-live-uid');
		expect(updateLeadNextcloudUidsMock).toHaveBeenCalledWith('lead-001', {
			nextcloudGoLiveUid: null
		});
	});

	// eventDate Branch 1: date set + no UID → createEvent + write UID
	it('eventDate: creates event when date present and no prev UID', async () => {
		createEventMock.mockResolvedValueOnce({ uid: 'event-uid-1' });
		const lead = makeLead({ eventDate: '2026-12-15' });
		await syncLeadDatesToNextcloud(lead, { nextcloudEventUid: null });
		expect(createEventMock).toHaveBeenCalledTimes(1);
		expect(updateLeadNextcloudUidsMock).toHaveBeenCalledWith('lead-001', {
			nextcloudEventUid: 'event-uid-1'
		});
	});

	// eventDate Branch 2: date set + UID exists → updateEvent
	it('eventDate: updates event when date present and UID exists', async () => {
		updateEventMock.mockResolvedValueOnce(undefined);
		const lead = makeLead({ eventDate: '2026-12-15' });
		await syncLeadDatesToNextcloud(lead, { nextcloudEventUid: 'existing-event-uid' });
		expect(updateEventMock).toHaveBeenCalledTimes(1);
		expect(updateEventMock).toHaveBeenCalledWith(
			'existing-event-uid',
			expect.objectContaining({ title: expect.stringContaining('Event Date') })
		);
		expect(createEventMock).not.toHaveBeenCalled();
	});

	// eventDate Branch 3: date cleared + UID exists → deleteEvent + clear UID
	it('eventDate: deletes event when date cleared and UID exists', async () => {
		deleteEventMock.mockResolvedValueOnce(undefined);
		const lead = makeLead({ eventDate: undefined });
		await syncLeadDatesToNextcloud(lead, { nextcloudEventUid: 'old-event-uid' });
		expect(deleteEventMock).toHaveBeenCalledWith('old-event-uid');
		expect(updateLeadNextcloudUidsMock).toHaveBeenCalledWith('lead-001', {
			nextcloudEventUid: null
		});
	});

	// Both fields processed independently (not short-circuited)
	it('processes both goLiveDate and eventDate in same call', async () => {
		createEventMock
			.mockResolvedValueOnce({ uid: 'go-live-uid-2' })
			.mockResolvedValueOnce({ uid: 'event-uid-2' });
		const lead = makeLead({ goLiveDate: '2026-11-01', eventDate: '2026-12-15' });
		await syncLeadDatesToNextcloud(lead, {
			nextcloudGoLiveUid: null,
			nextcloudEventUid: null
		});
		expect(createEventMock).toHaveBeenCalledTimes(2);
		expect(updateLeadNextcloudUidsMock).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// AC7: sync failure propagates from syncLeadDatesToNextcloud
// ---------------------------------------------------------------------------
describe('syncLeadDatesToNextcloud failure (AC7)', () => {
	it('throws CalDavWebhookError when createEvent fails for goLiveDate', async () => {
		const err = new CalDavWebhookError('Calendar service unavailable');
		createEventMock.mockRejectedValueOnce(err);

		const lead = makeLead({ goLiveDate: '2026-11-01' });
		await expect(syncLeadDatesToNextcloud(lead, { nextcloudGoLiveUid: null })).rejects.toThrow(
			'Calendar service unavailable'
		);
	});

	it('throws CalDavWebhookError when createEvent fails for eventDate', async () => {
		const err = new CalDavWebhookError('Calendar service unavailable');
		createEventMock.mockRejectedValueOnce(err);

		const lead = makeLead({ eventDate: '2026-12-15' });
		await expect(syncLeadDatesToNextcloud(lead, { nextcloudEventUid: null })).rejects.toThrow(
			'Calendar service unavailable'
		);
	});
});

// ---------------------------------------------------------------------------
// AC12: both dates null + no prev UIDs → none of create/update/delete called
// ---------------------------------------------------------------------------
describe('syncLeadDatesToNextcloud no-op (AC12)', () => {
	it('does nothing when both dates are null/undefined and no prev UIDs exist', async () => {
		const lead = makeLead({ goLiveDate: undefined, eventDate: undefined });
		await syncLeadDatesToNextcloud(lead, {
			nextcloudGoLiveUid: null,
			nextcloudEventUid: null
		});
		expect(createEventMock).not.toHaveBeenCalled();
		expect(updateEventMock).not.toHaveBeenCalled();
		expect(deleteEventMock).not.toHaveBeenCalled();
		expect(updateLeadNextcloudUidsMock).not.toHaveBeenCalled();
	});
});
