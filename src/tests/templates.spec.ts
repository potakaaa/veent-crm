import { describe, it, expect } from 'vitest';
import { fillTemplate, TEMPLATES } from '$lib/data/templates';

describe('fillTemplate', () => {
	it('substitutes both {{page}} and {{event}} placeholders when present', () => {
		const out = fillTemplate('Hi {{page}}, about {{event}}.', {
			page: 'USWAG Davao',
			event: 'Kadayawan Fair'
		});
		expect(out).toBe('Hi USWAG Davao, about Kadayawan Fair.');
	});

	it('renders {{event}} as empty string when the event value is empty (missing/undefined eventName)', () => {
		const out = fillTemplate('Following up on {{event}} for {{page}}.', {
			page: 'USWAG Davao',
			event: ''
		});
		expect(out).toBe('Following up on  for USWAG Davao.');
	});

	it('returns the body unchanged when it contains no placeholders', () => {
		const body = 'Just a plain note with no tokens.';
		expect(fillTemplate(body, { page: 'X', event: 'Y' })).toBe(body);
	});

	it('replaces every occurrence when a placeholder repeats in one body', () => {
		const out = fillTemplate('{{page}} and again {{page}} — {{event}}/{{event}}', {
			page: 'Acme',
			event: 'Expo'
		});
		expect(out).toBe('Acme and again Acme — Expo/Expo');
	});

	it('every TEMPLATE body is fully resolved (no {{ tokens left) after filling', () => {
		for (const t of TEMPLATES) {
			const out = fillTemplate(t.body, { page: 'P', event: 'E' });
			expect(out).not.toContain('{{');
		}
	});
});
