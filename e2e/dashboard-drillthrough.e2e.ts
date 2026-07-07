import { expect, test, type Page } from '@playwright/test';

/**
 * Manager dashboard drill-through e2e — GitHub #244 / DASH-1, SPEC AC5.
 *
 * Tier: Agent-Probe. Precondition: an authenticated manager session so /dashboard renders
 * with at least one AE card. Self-skips when the page/cards do not render — the shared
 * auth-fixture known-gap pattern used by every protected-route e2e in this repo
 * (see process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md). This spec is
 * intentionally NOT wired to new auth infra; it converts to Fully-Automated once the shared
 * Playwright authenticated-session fixture lands.
 *
 * Grep tag AC5 in the title.
 */

async function openDashboard(page: Page): Promise<boolean> {
	await page.goto('/dashboard');
	const firstCard = page.locator('a[href^="/leads?segment=all&owner="]').first();
	return firstCard
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
}

test('AC5 — clicking an AE card lands on /leads pre-filtered to that AE', async ({ page }) => {
	const ready = await openDashboard(page);
	test.skip(!ready, '/dashboard not available (no manager session/DB in this environment)');

	const firstCard = page.locator('a[href^="/leads?segment=all&owner="]').first();
	const href = await firstCard.getAttribute('href');
	expect(href).toMatch(/^\/leads\?segment=all&owner=/);

	await firstCard.click();
	await page.waitForURL(/\/leads\?segment=all&owner=/);
	expect(new URL(page.url()).searchParams.get('segment')).toBe('all');
	expect(new URL(page.url()).searchParams.get('owner')).toBeTruthy();
});
