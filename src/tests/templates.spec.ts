import { describe, it, expect } from 'vitest';
import { fillTemplate } from '$lib/data/templates';

describe('fillTemplate (5-key signature)', () => {
	it('substitutes {{organizerName}}, {{eventName}}, and {{repName}} when all present (AC-7)', () => {
		const out = fillTemplate(
			'Hi from {{repName}}! Following up with {{organizerName}} about {{eventName}}.',
			{
				organizerName: 'USWAG Davao',
				eventName: 'Kadayawan Fair',
				repName: 'Jess',
				repFirstName: 'Jess',
				repLastName: ''
			}
		);
		expect(out).toBe('Hi from Jess! Following up with USWAG Davao about Kadayawan Fair.');
	});

	it('degrades a missing value to an empty string, never leaving a literal token (AC-8)', () => {
		const out = fillTemplate('Following up on {{eventName}} for {{organizerName}} — {{repName}}', {
			organizerName: 'USWAG Davao',
			eventName: '',
			repName: 'Jess',
			repFirstName: 'Jess',
			repLastName: ''
		});
		expect(out).toBe('Following up on  for USWAG Davao — Jess');
		expect(out).not.toContain('{{');
	});

	it('returns the body unchanged when it contains no placeholders', () => {
		const body = 'Just a plain note with no tokens.';
		expect(
			fillTemplate(body, {
				organizerName: 'X',
				eventName: 'Y',
				repName: 'Z',
				repFirstName: 'Z',
				repLastName: ''
			})
		).toBe(body);
	});

	it('replaces every occurrence when a placeholder repeats in one body', () => {
		const out = fillTemplate(
			'{{organizerName}} and again {{organizerName}} — {{eventName}}/{{eventName}} by {{repName}}',
			{
				organizerName: 'Acme',
				eventName: 'Expo',
				repName: 'Sam',
				repFirstName: 'Sam',
				repLastName: ''
			}
		);
		expect(out).toBe('Acme and again Acme — Expo/Expo by Sam');
	});

	it('substitutes {{repFirstName}}/{{repLastName}} correctly (AC6)', () => {
		const out = fillTemplate('Hi, this is {{repFirstName}} {{repLastName}}.', {
			organizerName: '',
			eventName: '',
			repName: 'Jane Diaz',
			repFirstName: 'Jane',
			repLastName: 'Diaz'
		});
		expect(out).toBe('Hi, this is Jane Diaz.');
	});

	it('blank {{repLastName}} degrades to empty string, not a literal token (AC6)', () => {
		const out = fillTemplate('From {{repFirstName}} {{repLastName}}', {
			organizerName: '',
			eventName: '',
			repName: 'Jane',
			repFirstName: 'Jane',
			repLastName: ''
		});
		expect(out).toBe('From Jane ');
		expect(out).not.toContain('{{');
	});

	it('{{repName}} substitution is unchanged by the new tokens (AC7 regression)', () => {
		const out = fillTemplate('Regards, {{repName}}', {
			organizerName: '',
			eventName: '',
			repName: 'Jane Diaz',
			repFirstName: 'Jane',
			repLastName: 'Diaz'
		});
		expect(out).toBe('Regards, Jane Diaz');
	});

	it('fills all 5 slash tokens', () => {
		const out = fillTemplate('/orgname /event /rep /repfirst /replast', {
			organizerName: 'USWAG Davao',
			eventName: 'Kadayawan Fair',
			repName: 'Jane Diaz',
			repFirstName: 'Jane',
			repLastName: 'Diaz'
		});
		expect(out).toBe('USWAG Davao Kadayawan Fair Jane Diaz Jane Diaz');
	});

	it('fills a mixed old+new body', () => {
		const out = fillTemplate('Hi {{organizerName}}, about /event — /rep', {
			organizerName: 'Acme',
			eventName: 'Expo',
			repName: 'Sam',
			repFirstName: 'Sam',
			repLastName: ''
		});
		expect(out).toBe('Hi Acme, about Expo — Sam');
	});

	it('/rep does not corrupt /repfirst or /replast', () => {
		const out = fillTemplate('/repfirst /replast /rep', {
			organizerName: '',
			eventName: '',
			repName: 'Jane Diaz',
			repFirstName: 'Jane',
			repLastName: 'Diaz'
		});
		expect(out).toBe('Jane Diaz Jane Diaz');
	});

	it('unknown /slash token is left untouched', () => {
		const out = fillTemplate('Ping /slash here', {
			organizerName: 'X',
			eventName: 'Y',
			repName: 'Z',
			repFirstName: 'Z',
			repLastName: ''
		});
		expect(out).toBe('Ping /slash here');
	});
});
