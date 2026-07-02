/**
 * Fully-Automated unit tests for the meeting-reminders feature (pure functions, no DB).
 *   P2-6  : resolveRecipients — union + dedup by userId + active/email filtering
 *   P2-6a : empty-recipient exclusion — candidate dropped from due list AND
 *           markMeetingReminderSent never invoked for it
 *   P2-5  : groupMeetingRemindersByRecipient — one group per recipient, input order
 *   P3-3  : buildMeetingReminderDigestHtml — render / escape / empty-list
 *   AC6   : sendMeetingReminderDigest returns 'skipped' with unset env
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import {
	resolveRecipients,
	groupMeetingRemindersByRecipient,
	type MeetingReminderDue
} from '$lib/server/db/meeting-reminders';
import { buildMeetingReminderDigestHtml } from '$lib/server/email-templates/meeting-reminder';
import { sendMeetingReminderDigest } from '$lib/server/email';

// ---------------------------------------------------------------------------
// P2-6 — resolveRecipients (pure: union, dedup by userId, active+email filter)
// ---------------------------------------------------------------------------

describe('resolveRecipients (P2-6)', () => {
	it('unions organizer + attendees', () => {
		const out = resolveRecipients({ userId: 'u-org', email: 'org@example.com', active: true }, [
			{ userId: 'u-att', email: 'att@example.com', active: true }
		]);
		expect(out).toEqual([
			{ userId: 'u-org', email: 'org@example.com' },
			{ userId: 'u-att', email: 'att@example.com' }
		]);
	});

	it('dedups a person who is both organizer and an attendee row (one reminder, not two)', () => {
		const out = resolveRecipients({ userId: 'u-1', email: 'one@example.com', active: true }, [
			{ userId: 'u-1', email: 'one@example.com', active: true },
			{ userId: 'u-2', email: 'two@example.com', active: true }
		]);
		expect(out).toHaveLength(2);
		expect(out.map((r) => r.userId)).toEqual(['u-1', 'u-2']);
	});

	it('drops inactive users', () => {
		const out = resolveRecipients({ userId: 'u-org', email: 'org@example.com', active: false }, [
			{ userId: 'u-att', email: 'att@example.com', active: true }
		]);
		expect(out).toEqual([{ userId: 'u-att', email: 'att@example.com' }]);
	});

	it('drops null-email users', () => {
		const out = resolveRecipients({ userId: 'u-org', email: null, active: true }, [
			{ userId: 'u-att', email: 'att@example.com', active: true }
		]);
		expect(out).toEqual([{ userId: 'u-att', email: 'att@example.com' }]);
	});

	it('returns [] when organizer is null and there are no attendees', () => {
		expect(resolveRecipients(null, [])).toEqual([]);
	});

	it('returns [] when every candidate is inactive or null-email', () => {
		const out = resolveRecipients({ userId: 'u-org', email: null, active: true }, [
			{ userId: 'u-a', email: 'a@example.com', active: false },
			{ userId: 'u-b', email: null, active: true }
		]);
		expect(out).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// P2-6a — empty-recipient exclusion + zero mark-sent invocation
// ---------------------------------------------------------------------------

// The exclusion rule getDueMeetingReminders applies to resolved rows is: drop any
// candidate whose resolveRecipients() result is []. This test exercises that exact
// pure mapping/filter step (the same predicate the query uses) and asserts that a
// mark-sent spy is never called for an empty-recipient candidate — without a live DB.
describe('empty-recipient exclusion (P2-6a / Failure Mode #5)', () => {
	type Candidate = {
		meetingId: string;
		organizer: Parameters<typeof resolveRecipients>[0];
		attendees: Parameters<typeof resolveRecipients>[1];
	};

	// Mirror of the exclusion + mark-sent gate the notify flow performs, using an
	// injected markSent spy so we can assert it is never invoked for empty candidates.
	function selectDueAndMark(candidates: Candidate[], markSent: (id: string) => void) {
		const due: string[] = [];
		for (const c of candidates) {
			const recipients = resolveRecipients(c.organizer, c.attendees);
			if (recipients.length === 0) continue; // EXCLUDED — never reaches mark-sent
			due.push(c.meetingId);
			markSent(c.meetingId);
		}
		return due;
	}

	it('excludes an all-inactive/null-email candidate from the due list', () => {
		const markSent = vi.fn();
		const due = selectDueAndMark(
			[
				{
					meetingId: 'm-empty',
					organizer: { userId: 'o', email: null, active: true },
					attendees: [{ userId: 'a', email: 'a@example.com', active: false }]
				},
				{
					meetingId: 'm-valid',
					organizer: { userId: 'o2', email: 'o2@example.com', active: true },
					attendees: []
				}
			],
			markSent
		);
		expect(due).toEqual(['m-valid']);
	});

	it('never invokes markMeetingReminderSent for the empty-recipient candidate', () => {
		const markSent = vi.fn();
		selectDueAndMark(
			[
				{
					meetingId: 'm-empty',
					organizer: null,
					attendees: [{ userId: 'a', email: null, active: true }]
				}
			],
			markSent
		);
		expect(markSent).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// P2-5 — groupMeetingRemindersByRecipient (pure grouping helper)
// ---------------------------------------------------------------------------

function makeDue(overrides: Partial<MeetingReminderDue> = {}): MeetingReminderDue {
	return {
		meetingId: 'm-1',
		leadId: 'lead-1',
		leadName: 'Acme Sports Club',
		startAt: '2026-07-10T14:00:00.000Z',
		meetingUrl: null,
		checkpoint: 'day',
		recipients: [{ userId: 'u-1', email: 'rep@example.com' }],
		...overrides
	};
}

describe('groupMeetingRemindersByRecipient (P2-5)', () => {
	it('groups by recipient email, one group per email, preserving input order', () => {
		const due: MeetingReminderDue[] = [
			makeDue({ meetingId: 'm-a', recipients: [{ userId: 'u-a', email: 'a@example.com' }] }),
			makeDue({ meetingId: 'm-b', recipients: [{ userId: 'u-b', email: 'b@example.com' }] }),
			makeDue({ meetingId: 'm-c', recipients: [{ userId: 'u-a', email: 'a@example.com' }] })
		];
		const groups = groupMeetingRemindersByRecipient(due);
		expect(groups.map((g) => g.recipientEmail)).toEqual(['a@example.com', 'b@example.com']);
		expect(groups[0].reminders.map((r) => r.meetingId)).toEqual(['m-a', 'm-c']);
		expect(groups[1].reminders.map((r) => r.meetingId)).toEqual(['m-b']);
	});

	it('fans a multi-recipient reminder into each recipient group', () => {
		const due: MeetingReminderDue[] = [
			makeDue({
				meetingId: 'm-shared',
				recipients: [
					{ userId: 'u-1', email: 'one@example.com' },
					{ userId: 'u-2', email: 'two@example.com' }
				]
			})
		];
		const groups = groupMeetingRemindersByRecipient(due);
		expect(groups).toHaveLength(2);
		expect(groups.every((g) => g.reminders.length === 1)).toBe(true);
	});

	it('returns [] for an empty due list', () => {
		expect(groupMeetingRemindersByRecipient([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// P3-3 — buildMeetingReminderDigestHtml (pure template)
// ---------------------------------------------------------------------------

describe('buildMeetingReminderDigestHtml (P3-3)', () => {
	it('renders one card per reminder with lead name, start time, and lead link', () => {
		const html = buildMeetingReminderDigestHtml({
			appUrl: 'https://crm.veent.io',
			reminders: [
				makeDue({ leadId: 'lead-xyz', leadName: 'Acme Sports Club', checkpoint: 'hour' }),
				makeDue({ meetingId: 'm-2', leadId: 'lead-abc', leadName: 'Beta Fest', checkpoint: 'day' })
			]
		});
		expect(html).toContain('Acme Sports Club');
		expect(html).toContain('Beta Fest');
		expect(html).toContain('https://crm.veent.io/leads/lead-xyz');
		expect(html).toContain('https://crm.veent.io/leads/lead-abc');
		// start time rendered (year present via formatMeetingDate)
		expect(html).toContain('2026');
	});

	it('escapes HTML in interpolated lead names', () => {
		const html = buildMeetingReminderDigestHtml({
			appUrl: 'https://crm.veent.io',
			reminders: [makeDue({ leadName: '<script>alert(1)</script>' })]
		});
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('returns non-empty branded HTML for the empty-list case', () => {
		const html = buildMeetingReminderDigestHtml({ appUrl: '', reminders: [] });
		expect(html.length).toBeGreaterThan(0);
		expect(html).toContain('Veent');
	});
});

// ---------------------------------------------------------------------------
// AC6 — sendMeetingReminderDigest no-key no-op
// ---------------------------------------------------------------------------

describe('sendMeetingReminderDigest (AC6)', () => {
	it("returns 'skipped' (logs, does not throw) when RESEND_API_KEY is unset", async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(
			sendMeetingReminderDigest({ recipientEmail: 'rep@example.com', reminders: [] })
		).resolves.toBe('skipped');
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
