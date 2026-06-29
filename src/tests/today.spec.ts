import { describe, it, expect } from 'vitest';
import { logTouchSchema, snoozeSchema } from '$lib/zod/schemas';
import { computeAge } from '$lib/utils/dates';
import type { Lead } from '$lib/types';

// ---------------------------------------------------------------------------
// logTouchSchema
// ---------------------------------------------------------------------------
describe('logTouchSchema', () => {
	it('accepts a minimal valid touch (no followUpAt)', () => {
		const r = logTouchSchema.safeParse({ channel: 'fb_dm', outcome: 'sent' });
		expect(r.success).toBe(true);
	});

	it('accepts touch with YYYY-MM-DD followUpAt', () => {
		const r = logTouchSchema.safeParse({
			channel: 'email',
			outcome: 'replied',
			followUpAt: '2026-07-15'
		});
		expect(r.success).toBe(true);
	});

	it('rejects invalid channel', () => {
		const r = logTouchSchema.safeParse({ channel: 'smoke_signal', outcome: 'sent' });
		expect(r.success).toBe(false);
	});

	it('rejects followUpAt not in YYYY-MM-DD format', () => {
		const r = logTouchSchema.safeParse({
			channel: 'fb_dm',
			outcome: 'sent',
			followUpAt: '07/15/2026'
		});
		expect(r.success).toBe(false);
	});

	it('defaults outcome to sent when omitted', () => {
		const r = logTouchSchema.safeParse({ channel: 'fb_dm' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.outcome).toBe('sent');
	});
});

// ---------------------------------------------------------------------------
// snoozeSchema
// ---------------------------------------------------------------------------
describe('snoozeSchema', () => {
	it('accepts a valid YYYY-MM-DD date', () => {
		const r = snoozeSchema.safeParse({ followUpAt: '2026-07-01' });
		expect(r.success).toBe(true);
	});

	it('rejects missing followUpAt', () => {
		const r = snoozeSchema.safeParse({});
		expect(r.success).toBe(false);
	});

	it('rejects non-date string', () => {
		const r = snoozeSchema.safeParse({ followUpAt: 'next week' });
		expect(r.success).toBe(false);
	});

	it('accepts optional notes', () => {
		const r = snoozeSchema.safeParse({ followUpAt: '2026-07-01', notes: 'call on holiday' });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.notes).toBe('call on holiday');
	});
});

// ---------------------------------------------------------------------------
// Queue classification — computeAge urgency mapping
// ---------------------------------------------------------------------------
describe('computeAge urgency grouping', () => {
	const NOW = new Date('2026-06-29T02:00:00.000Z'); // Mon 10:00 Manila

	function makeLead(
		overrides: Partial<Pick<Lead, 'followUpAt' | 'lastActivityAt' | 'stage'>>
	): Pick<Lead, 'followUpAt' | 'lastActivityAt' | 'stage'> {
		return {
			stage: 'contacted',
			lastActivityAt: new Date('2026-06-25T02:00:00.000Z').toISOString(), // 4 days ago
			followUpAt: undefined,
			...overrides
		};
	}

	it('returns overdue when followUpAt is in the past', () => {
		const lead = makeLead({ followUpAt: '2026-06-27T00:00:00+08:00' });
		const age = computeAge(lead, NOW);
		expect(age.type).toBe('overdue');
	});

	it('returns due when followUpAt is later today (Manila)', () => {
		// NOW = 02:00 UTC = 10:00 Manila; followUpAt at 23:00 Manila is still future → due today
		const lead = makeLead({ followUpAt: '2026-06-29T23:00:00+08:00' });
		const age = computeAge(lead, NOW);
		expect(age.type).toBe('due');
	});

	it('returns stale when lastActivityAt is >30 days ago and no followUpAt', () => {
		const old = new Date(NOW.getTime() - 31 * 86400 * 1000).toISOString();
		const lead = makeLead({ lastActivityAt: old });
		const age = computeAge(lead, NOW);
		expect(age.type).toBe('stale');
	});

	it('returns fresh when lastActivityAt is within 1 day', () => {
		// computeAge threshold: idle <= 1 day → fresh
		const recent = new Date(NOW.getTime() - 12 * 3600 * 1000).toISOString();
		const lead = makeLead({ lastActivityAt: recent });
		const age = computeAge(lead, NOW);
		expect(age.type).toBe('fresh');
	});

	it('replied stage returns normal age type (urgency mapping is in dbRowToLead, not computeAge)', () => {
		// makeLead defaults: lastActivityAt 4 days ago, no followUpAt.
		// computeAge: not won/lost, no followUpAt, idle=4d (>1, ≤30) → 'normal'.
		// The 'replied' urgency bucket is applied in dbRowToLead after computeAge.
		const lead = makeLead({ stage: 'replied' });
		const age = computeAge(lead, NOW);
		expect(age.type).toBe('normal');
	});
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------
describe('summary count derivation', () => {
	const leads = [
		{ urgency: 'overdue' },
		{ urgency: 'overdue' },
		{ urgency: 'due' },
		{ urgency: 'replied' },
		{ urgency: 'cold' },
		{ urgency: 'normal' }
	];

	const count = (k: string) => leads.filter((l) => l.urgency === k).length;

	it('counts overdue correctly', () => expect(count('overdue')).toBe(2));
	it('counts due correctly', () => expect(count('due')).toBe(1));
	it('counts replied correctly', () => expect(count('replied')).toBe(1));
	it('counts cold correctly', () => expect(count('cold')).toBe(1));
});
