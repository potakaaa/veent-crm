import { expect, test, type Page } from '@playwright/test';

/**
 * Up for Grabs country + category filter e2e — GitHub #91.
 *
 * KNOWN-GAP STUB (per validate-contract, Gate: CONDITIONAL). These UI-level ACs
 * (AC#1, AC#5, AC#6, AC#7, AC#8, AC#9-UI-half, AC#10, AC#13) are BLOCKED on a
 * repo-wide, pre-existing e2e-auth-bootstrap gap: real Better Auth (magic-link +
 * Resend + crm_users allowlist) replaced the old DEV_BYPASS stub, and there is no
 * session-seed mechanism for Playwright yet — every page.goto('/unassigned')
 * currently redirects to /login. See:
 *   process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md
 *
 * Every test below is test.fixme() so the suite is collected but reports these as
 * pending, NOT as false-failures. Un-fixme them the moment the auth-bootstrap infra
 * lands — the assertions are written and ready.
 */

async function goToUnassigned(page: Page) {
	await page.goto('/unassigned');
}

test.describe('Up for Grabs — country + category filters (#91)', () => {
	test.fixme('AC#1 — Country and Category filter controls render on load', async ({ page }) => {
		await goToUnassigned(page);
		await expect(page.getByRole('button', { name: /^Country/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Category/ })).toBeVisible();
	});

	test.fixme('AC#5 — filter change causes no full document reload', async ({ page }) => {
		await goToUnassigned(page);
		// Sentinel on window survives soft navigation but not a full reload.
		await page.evaluate(() => ((window as unknown as { __ufg?: boolean }).__ufg = true));
		await page.getByRole('button', { name: /^Category/ }).click();
		await page.getByRole('checkbox', { name: 'Concert' }).check();
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { __ufg?: boolean }).__ufg === true))
			.toBe(true);
	});

	test.fixme('AC#6 — filter selection persists across sort/page/claim', async ({ page }) => {
		await goToUnassigned(page);
		await page.getByRole('button', { name: /^Country/ }).click();
		// After a subsequent sort toggle, the country param must remain in the URL.
		expect(new URL(page.url()).searchParams.get('country')).not.toBeNull();
	});

	test.fixme('AC#7 — filter selection persists across a same-URL reload', async ({ page }) => {
		await page.goto('/unassigned?category=Concert');
		await page.reload();
		expect(new URL(page.url()).searchParams.get('category')).toBe('Concert');
	});

	test.fixme('AC#8 — applying a filter resets to page 1', async ({ page }) => {
		await page.goto('/unassigned?page=2');
		await page.getByRole('button', { name: /^Category/ }).click();
		await page.getByRole('checkbox', { name: 'Concert' }).check();
		expect(new URL(page.url()).searchParams.get('page')).toBeNull();
	});

	test.fixme('AC#9 (UI half) — zero-match shows the distinct empty state', async ({ page }) => {
		await page.goto('/unassigned?country=__NONEXISTENT__');
		await expect(page.getByText('No leads match your filters.')).toBeVisible();
	});

	test.fixme('AC#10 — "Clear all filters" returns to the unfiltered queue', async ({ page }) => {
		await page.goto('/unassigned?category=Concert');
		await page.getByRole('button', { name: 'Clear all filters' }).click();
		const url = new URL(page.url());
		expect(url.searchParams.get('category')).toBeNull();
		expect(url.searchParams.get('country')).toBeNull();
	});

	test.fixme('AC#13 — claim/bulk-claim/sort still work with a filter active', async ({ page }) => {
		await page.goto('/unassigned?category=Concert');
		await expect(page.getByRole('button', { name: 'Claim' }).first()).toBeVisible();
	});
});
