import { describe, expect, it } from 'vitest';
import { matchesQuery } from './pipeline-search';

type SearchableLead = Parameters<typeof matchesQuery>[0];

const lead: SearchableLead = {
	name: 'Acme Corp',
	organizerName: 'Jane Organizer',
	eventName: 'Summer Fest 2026'
};

describe('matchesQuery', () => {
	it('returns true for an empty query (show all)', () => {
		expect(matchesQuery(lead, '')).toBe(true);
	});

	it('matches on lead name (case-insensitive)', () => {
		expect(matchesQuery(lead, 'acme')).toBe(true);
		expect(matchesQuery(lead, 'ACME')).toBe(true);
	});

	it('matches on organizer name', () => {
		expect(matchesQuery(lead, 'jane')).toBe(true);
	});

	it('matches on event name', () => {
		expect(matchesQuery(lead, 'summer fest')).toBe(true);
	});

	it('returns false when nothing matches', () => {
		expect(matchesQuery(lead, 'zzz-nomatch')).toBe(false);
	});

	it('is undefined-safe for missing organizerName/eventName', () => {
		const bare: SearchableLead = { name: 'Solo Lead' };
		expect(() => matchesQuery(bare, 'anything')).not.toThrow();
		expect(matchesQuery(bare, 'solo')).toBe(true);
		expect(matchesQuery(bare, 'anything')).toBe(false);
	});

	it('trims leading/trailing whitespace from the query', () => {
		expect(matchesQuery(lead, '  acme  ')).toBe(true);
		expect(matchesQuery(lead, '   ')).toBe(true);
	});
});
