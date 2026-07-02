import { describe, it, expect } from 'vitest';
import { fillTemplate } from '$lib/data/templates';

describe('fillTemplate (3-key signature)', () => {
	it('substitutes {{organizerName}}, {{eventName}}, and {{repName}} when all present (AC-7)', () => {
		const out = fillTemplate(
			'Hi from {{repName}}! Following up with {{organizerName}} about {{eventName}}.',
			{ organizerName: 'USWAG Davao', eventName: 'Kadayawan Fair', repName: 'Jess' }
		);
		expect(out).toBe('Hi from Jess! Following up with USWAG Davao about Kadayawan Fair.');
	});

	it('degrades a missing value to an empty string, never leaving a literal token (AC-8)', () => {
		const out = fillTemplate('Following up on {{eventName}} for {{organizerName}} — {{repName}}', {
			organizerName: 'USWAG Davao',
			eventName: '',
			repName: 'Jess'
		});
		expect(out).toBe('Following up on  for USWAG Davao — Jess');
		expect(out).not.toContain('{{');
	});

	it('returns the body unchanged when it contains no placeholders', () => {
		const body = 'Just a plain note with no tokens.';
		expect(fillTemplate(body, { organizerName: 'X', eventName: 'Y', repName: 'Z' })).toBe(body);
	});

	it('replaces every occurrence when a placeholder repeats in one body', () => {
		const out = fillTemplate(
			'{{organizerName}} and again {{organizerName}} — {{eventName}}/{{eventName}} by {{repName}}',
			{ organizerName: 'Acme', eventName: 'Expo', repName: 'Sam' }
		);
		expect(out).toBe('Acme and again Acme — Expo/Expo by Sam');
	});
});
