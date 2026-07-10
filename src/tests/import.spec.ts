import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	normalizeHandle,
	mapCategory,
	slugify,
	normalizeCountry
} from '../../scripts/lib/import-utils';
import {
	parseTsv,
	hygiene,
	validateRows,
	groupByHandle,
	pickRepresentativeEvent,
	plan,
	COLUMNS
} from '../../scripts/import';
import { tsvRowSchema, type TsvRow } from '$lib/zod/schemas';

const fixturePath = fileURLToPath(new URL('./fixtures/sample-export.tsv', import.meta.url));
const fixture = readFileSync(fixturePath, 'utf8');

// Build a valid TsvRow from partial overrides (all 34 keys present, defaults empty/valid).
function makeRow(o: Partial<TsvRow>): TsvRow {
	const base: Record<string, string> = {};
	for (const c of COLUMNS) base[c] = '';
	base.__row_type = 'veent_event_v1';
	base.export_version = '1.0';
	base.event_id = 'x';
	base.event_name = 'X';
	base.event_source = 'ticketmelon';
	base.organizer_name = 'X Org';
	return tsvRowSchema.parse({ ...base, ...o });
}

describe('normalizeHandle', () => {
	it('prefers the Facebook URL', () => {
		expect(
			normalizeHandle(
				'https://facebook.com/ManilaMarathon',
				'https://instagram.com/ig',
				'https://site.ph/x',
				'Some Name'
			)
		).toBe('manilamarathon');
	});
	it('falls back to Instagram when no FB', () => {
		expect(
			normalizeHandle(undefined, 'https://instagram.com/CebuFest', 'https://site.ph/x', 'N')
		).toBe('cebufest');
	});
	it('falls back to the website path segment when no FB/IG', () => {
		expect(normalizeHandle(undefined, undefined, 'https://example.com/IloiloExpo', 'N')).toBe(
			'iloiloexpo'
		);
	});
	it('falls back to slugified name when no usable URL', () => {
		expect(normalizeHandle(undefined, undefined, undefined, 'Pop Up Bazaar')).toBe('pop-up-bazaar');
	});
	it('falls back to name when website has no path segment', () => {
		expect(
			normalizeHandle(undefined, undefined, 'https://iloilofoodexpo.ph', 'Iloilo Food Expo')
		).toBe('iloilo-food-expo');
	});
	it('derives the handle from a scheme-less FB URL (bare domain paste)', () => {
		expect(normalizeHandle('facebook.com/AcmeEvents', undefined, undefined, 'Fallback Name')).toBe(
			'acmeevents'
		);
	});
	it('derives the handle from a scheme-less www IG URL', () => {
		expect(
			normalizeHandle(undefined, 'www.instagram.com/AcmeEvents', undefined, 'Fallback Name')
		).toBe('acmeevents');
	});
});

describe('mapCategory', () => {
	it('maps known scraper values to the CRM enum', () => {
		expect(mapCategory('Fun Run')).toEqual({ category: 'Sports' });
		expect(mapCategory('Club')).toEqual({ category: 'Bar/DJ' });
		expect(mapCategory('Festival')).toEqual({ category: 'Music Fest' });
	});
	it('maps unknown values to Other', () => {
		expect(mapCategory('Pottery')).toEqual({ category: 'Other' });
		expect(mapCategory('')).toEqual({ category: 'Other' });
	});
	it('trims surrounding whitespace before mapping', () => {
		expect(mapCategory('  Concert  ')).toEqual({ category: 'Concert' });
	});
});

describe('normalizeCountry', () => {
	// Table-driven: every supported alias from COUNTRY_MAP
	const PH_ALIASES = [
		'Philippines',
		'ph',
		'PH',
		'Pilipinas',
		'pilipinas',
		'the Philippines',
		'the philippines',
		'Republic of the Philippines',
		'republic of the philippines',
		'Phil',
		'phil',
		'Phils',
		'phils',
		'RP',
		'rp'
	];
	const SG_ALIASES = [
		'Singapore',
		'sg',
		'SG',
		'Singapura',
		'singapura',
		'Republic of Singapore',
		'republic of singapore'
	];

	for (const alias of PH_ALIASES) {
		it(`maps "${alias}" → Philippines`, () => {
			expect(normalizeCountry(alias)).toBe('Philippines');
		});
	}
	for (const alias of SG_ALIASES) {
		it(`maps "${alias}" → Singapore`, () => {
			expect(normalizeCountry(alias)).toBe('Singapore');
		});
	}

	it('returns null for countries other than Philippines / Singapore', () => {
		expect(normalizeCountry('United States')).toBeNull();
		expect(normalizeCountry('Malaysia')).toBeNull();
	});
	it('returns null for undefined / null / empty input', () => {
		expect(normalizeCountry(undefined)).toBeNull();
		expect(normalizeCountry(null)).toBeNull();
		expect(normalizeCountry('')).toBeNull();
	});
	it('ignores leading/trailing whitespace when matching', () => {
		expect(normalizeCountry('  Philippines  ')).toBe('Philippines');
		expect(normalizeCountry('  sg  ')).toBe('Singapore');
	});
});

describe('slugify', () => {
	it('lowercases and dashes spaces', () => {
		expect(slugify('Manila Marathon')).toBe('manila-marathon');
	});
	it('strips special characters and collapses dashes', () => {
		expect(slugify('Pop-Up!! Bazaar & Co.')).toBe('pop-up-bazaar-co');
	});
	it('trims leading/trailing dashes', () => {
		expect(slugify('  Hello World  ')).toBe('hello-world');
	});
});

describe('hygiene', () => {
	it('normalizes smart quotes', () => {
		expect(hygiene('“Hello” ‘world’')).toBe('"Hello" \'world\'');
	});
	it('decodes &#13; / &#10; / &amp; and strips stray CR', () => {
		expect(hygiene('A&#13;&#10;B')).toBe('A\nB');
		expect(hygiene('Tom &amp; Jerry')).toBe('Tom & Jerry');
	});
	it('trims', () => {
		expect(hygiene('  padded  ')).toBe('padded');
	});
});

describe('parseTsv', () => {
	it('parses a basic header + row', () => {
		const rows = parseTsv('a\tb\tc\n1\t2\t3\n');
		expect(rows[0]).toEqual(['a', 'b', 'c']);
		expect(rows[1]).toEqual(['1', '2', '3']);
	});
	it('respects quoted fields containing tabs and newlines', () => {
		const rows = parseTsv('a\tb\n"has\ttab\nand newline"\tplain\n');
		expect(rows[1]).toEqual(['has\ttab\nand newline', 'plain']);
	});
	it('unescapes doubled quotes inside a quoted field', () => {
		const rows = parseTsv('a\n"she said ""hi"""\n');
		expect(rows[1]).toEqual(['she said "hi"']);
	});
	it('strips a leading BOM', () => {
		const rows = parseTsv('﻿a\tb\n1\t2\n');
		expect(rows[0]).toEqual(['a', 'b']);
	});
});

describe('validateRows (layout validation)', () => {
	const goodFields: string[] = COLUMNS.map((c) => {
		if (c === '__row_type') return 'veent_event_v1';
		if (c === 'export_version') return '1.0';
		if (c === 'event_id') return 'e';
		if (c === 'event_name') return 'Name';
		if (c === 'event_source') return 'ticketmelon';
		if (c === 'organizer_name') return 'Org';
		return '';
	});

	it('accepts a well-formed 34-column row', () => {
		const { valid, skipped } = validateRows([goodFields]);
		expect(valid).toHaveLength(1);
		expect(skipped).toHaveLength(0);
	});
	it('skips rows with the wrong column count', () => {
		const { valid, skipped } = validateRows([['too', 'few']]);
		expect(valid).toHaveLength(0);
		expect(skipped[0].reason).toBe('column_count');
	});
	it('skips rows with a bad __row_type sentinel', () => {
		const bad = [...goodFields];
		bad[0] = 'not_veent';
		const { valid, skipped } = validateRows([bad]);
		expect(valid).toHaveLength(0);
		expect(skipped[0].reason).toBe('bad_row_type');
	});
	it('skips rows with an incompatible major version', () => {
		const bad = [...goodFields];
		bad[1] = '2.0';
		const { valid, skipped } = validateRows([bad]);
		expect(valid).toHaveLength(0);
		expect(skipped[0].reason).toBe('bad_version');
	});
});

describe('groupByHandle', () => {
	it('collapses a multi-event organizer into one group with N events', () => {
		const rows = [
			makeRow({ event_id: 'e1', organizer_facebook_url: 'https://facebook.com/ManilaMarathon' }),
			makeRow({ event_id: 'e2', organizer_facebook_url: 'https://facebook.com/ManilaMarathon' }),
			makeRow({ event_id: 'e3', organizer_facebook_url: 'https://facebook.com/ManilaMarathon' })
		];
		const groups = groupByHandle(rows);
		expect(groups.size).toBe(1);
		expect(groups.get('manilamarathon')).toHaveLength(3);
	});
	it('separates distinct organizers', () => {
		const rows = [
			makeRow({ organizer_facebook_url: 'https://facebook.com/AlphaOrg' }),
			makeRow({ organizer_instagram_url: 'https://instagram.com/BetaOrg' })
		];
		expect(groupByHandle(rows).size).toBe(2);
	});
});

describe('pickRepresentativeEvent', () => {
	const now = new Date('2026-06-01T00:00:00Z');
	it('picks the earliest upcoming event', () => {
		const events = [
			makeRow({ event_id: 'past', event_starts_at: '2026-01-01T00:00:00Z' }),
			makeRow({ event_id: 'soon', event_starts_at: '2026-07-01T00:00:00Z' }),
			makeRow({ event_id: 'later', event_starts_at: '2026-09-01T00:00:00Z' })
		];
		expect(pickRepresentativeEvent(events, now).event_id).toBe('soon');
	});
	it('falls back to the latest past event when none are upcoming', () => {
		const events = [
			makeRow({ event_id: 'old', event_starts_at: '2025-01-01T00:00:00Z' }),
			makeRow({ event_id: 'recent', event_starts_at: '2026-02-01T00:00:00Z' })
		];
		expect(pickRepresentativeEvent(events, now).event_id).toBe('recent');
	});
	it('falls back to post_date ordering when no starts_at exists', () => {
		const events = [
			makeRow({ event_id: 'b', event_post_date: '2026-03-01T00:00:00Z' }),
			makeRow({ event_id: 'a', event_post_date: '2026-01-01T00:00:00Z' })
		];
		expect(pickRepresentativeEvent(events, now).event_id).toBe('a');
	});
});

describe('plan (fixture integration)', () => {
	const { groups, report } = plan(fixture);

	it('reads all 20 data rows', () => {
		expect(report.rowsRead).toBe(20);
	});
	it('collapses the multi-event Manila Marathon organizer to one lead with 3 activities', () => {
		const mm = groups.find((g) => g.handle === 'manilamarathon');
		expect(mm).toBeDefined();
		expect(mm!.activities).toHaveLength(3);
		expect(mm!.lead.source).toBe('scraper');
		expect(mm!.lead.platform).toBe('Facebook');
	});
	it('lowercases the contact email and folds phone into notes', () => {
		const mm = groups.find((g) => g.handle === 'manilamarathon')!;
		expect(mm.lead.contactEmail).toBe('info@manilamarathon.ph');
		expect(mm.lead.notes).toContain('phone: 0917000');
		expect(mm.lead.notes).toContain('imported scraper event_id=');
	});
	it('maps unmapped scraper categories to Other', () => {
		const clay = groups.find((g) => g.lead.name === 'Clay Studio')!;
		expect(clay.lead.category).toBe('Other'); // unmapped "Pottery"
	});
	it('builds one activity per source event row (20 total)', () => {
		expect(report.activitiesBuilt).toBe(20);
	});
	it('every built activity uses the scraped_event channel', () => {
		for (const g of groups) for (const a of g.activities) expect(a.channel).toBe('scraped_event');
	});
});
