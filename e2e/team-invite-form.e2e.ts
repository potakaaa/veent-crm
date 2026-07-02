import { expect, test, type Page } from '@playwright/test';

/**
 * /team add-a-rep per-field validation error e2e — Phase 4 (sitewide-ux-refresh), SPEC AC6.
 *
 * Tier: Hybrid. Precondition: authenticated manager session so /team renders and
 * the "Add a rep" modal is available. Self-skips when the page/modal does not
 * render — shared auth-fixture known-gap pattern. Deterministic ARIA proof lives
 * in src/tests/field-error.spec.ts (B4).
 *
 * Grep tag AC6 in the title.
 */

async function openAddRep(page: Page): Promise<void> {
	await page.goto('/team');
	const addBtn = page.getByRole('button', { name: /Add a rep/i });
	const ready = await addBtn
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	test.skip(!ready, '/team Add-a-rep not available (no manager session/DB in this environment)');
	await addBtn.click();
	await page.locator('#rep-email').waitFor({ state: 'visible', timeout: 5000 });
}

test('AC6 — invalid email surfaces an adjacent per-field error with aria wiring', async ({
	page
}) => {
	await openAddRep(page);

	await page.fill('#rep-name', 'Marites');
	await page.fill('#rep-email', 'not-an-email');
	await page.getByRole('button', { name: /^Add rep$/ }).click();

	const email = page.locator('#rep-email');
	await expect(email).toHaveAttribute('aria-invalid', 'true');
	await expect(email).toHaveAttribute('aria-describedby', 'rep-email-error');

	await expect(page.locator('#rep-email-error')).toBeVisible();
});
