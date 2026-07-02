import { expect, test, type Page } from '@playwright/test';

/**
 * /leads/new per-field validation error e2e — Phase 4 (sitewide-ux-refresh), SPEC AC6.
 *
 * Tier: Hybrid. Precondition: live Postgres + authenticated session so /leads/new
 * renders. Self-skips when the page does not render — same shared auth-fixture
 * known-gap pattern as leads-new-dedup-hover.e2e.ts / loading-ux.e2e.ts. The
 * deterministic, non-e2e proof of the ARIA wiring lives in
 * src/tests/field-error.spec.ts (B4).
 *
 * Grep tag AC6 in the title so the validate-contract's `-g "AC6"` selects it.
 */

async function gotoLeadsNew(page: Page): Promise<void> {
	await page.goto('/leads/new');
	const ready = await page
		.locator('#name')
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	test.skip(!ready, '/leads/new did not render (no DB/session reachable in this environment)');
}

test('AC6 — invalid field surfaces an adjacent per-field error with aria wiring', async ({
	page
}) => {
	await gotoLeadsNew(page);

	// Fill name (enables the Create button) but leave the required event date unset;
	// submitting drives a per-field error onto the eventDate control specifically.
	await page.fill('#name', 'Phase 4 AC6 Probe');
	await page.getByRole('button', { name: /^Create/ }).click();

	const eventDate = page.locator('#eventDate');
	await expect(eventDate).toHaveAttribute('aria-invalid', 'true');
	await expect(eventDate).toHaveAttribute('aria-describedby', 'eventDate-error');

	const errorMsg = page.locator('#eventDate-error');
	await expect(errorMsg).toBeVisible();
	await expect(errorMsg).toHaveText(/event date is required/i);
});
