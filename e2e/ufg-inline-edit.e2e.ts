import { expect, test, type Page } from '@playwright/test';

/**
 * Up for Grabs inline-edit e2e — proves AC1, AC2, AC5, and the item-6b Resolve-button
 * removal for the reused LeadEditModal.
 *
 * Tier: Fully-Automated (per validate-contract). Precondition: DEV_BYPASS=true (hard-coded
 * true in hooks.server.ts) and seeded data on the Unassigned queue. When the queue is empty
 * (no DB seed) the data-dependent cases self-skip rather than false-fail — matching the
 * established e2e/loading-ux.e2e.ts convention.
 *
 * Target surface: /unassigned inline edit (edit affordance → LeadEditModal → PATCH save),
 * plus the confirmation that /review no longer resolves the old Review Queue UI.
 */

async function firstEditButton(page: Page) {
	const btn = page.getByRole('button', { name: /^Edit / }).first();
	return (await btn.count()) > 0 ? btn : null;
}

test.describe('Up for Grabs inline edit', () => {
	test('AC1 — opens the inline editor on edit-affordance click without navigating', async ({
		page
	}) => {
		await page.goto('/unassigned');
		const btn = await firstEditButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		await btn!.click();
		// Modal is open (Save changes control is visible) and we did NOT navigate away.
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/unassigned');
	});

	test('AC1 (item 6b) — inline edit modal has NO Resolve button', async ({ page }) => {
		await page.goto('/unassigned');
		const btn = await firstEditButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		await btn!.click();
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
		// Up for Grabs has no "resolve" concept — the button must be absent (onresolve not passed).
		await expect(page.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
	});

	test('AC2 — saving persists via PATCH and closes the modal without a full page reload', async ({
		page
	}) => {
		await page.goto('/unassigned');
		const btn = await firstEditButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		await btn!.click();
		const save = page.getByRole('button', { name: 'Save changes' });
		await expect(save).toBeVisible();

		// Assert the save goes through the PATCH endpoint (no navigation event).
		const patch = page.waitForRequest(
			(req) => /\/api\/leads\/[0-9a-f-]+$/.test(req.url()) && req.method() === 'PATCH'
		);
		await save.click();
		await patch;
		// Modal closes on success — the editor control is gone.
		await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
		// Still on /unassigned (client-side invalidateAll, not a full navigation to a new route).
		expect(new URL(page.url()).pathname).toBe('/unassigned');
	});

	test('AC5 — visiting /review no longer renders the Review Queue UI', async ({ page }) => {
		const res = await page.goto('/review');
		// Route files are deleted — SvelteKit returns its not-found handling (no 2xx page render).
		expect(res?.status()).toBeGreaterThanOrEqual(400);
		// The old Review Queue heading must not be present.
		await expect(page.getByRole('heading', { name: 'Review queue' })).toHaveCount(0);
	});
});
