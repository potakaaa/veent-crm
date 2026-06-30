import { describe, it, expect } from 'vitest';
import { welcomeEmail, loginEmail } from '$lib/server/email-templates';

// email-templates.ts is import-pure (no $env/db/auth), so these run without mocks.
describe('email templates', () => {
	it('welcomeEmail returns branded html with the CTA url, name, palette, and expiry note', () => {
		const { subject, html } = welcomeEmail('Alice', 'https://example.com/magic');
		expect(subject).toBeTruthy();
		expect(html).toContain('https://example.com/magic');
		expect(html).toContain('#c0362c');
		expect(html).toContain('expires in 5 minutes');
		expect(html).toContain('Alice');
	});

	it('loginEmail returns branded html with the CTA url, palette, and expiry note', () => {
		const { subject, html } = loginEmail('https://example.com/magic');
		expect(subject).toBeTruthy();
		expect(html).toContain('https://example.com/magic');
		expect(html).toContain('#c0362c');
		expect(html).toContain('expires in 5 minutes');
	});
});
