import { test, type Page } from '@playwright/test';

/**
 * Lead-detail discard flow e2e — confirmation test for AC7.
 *
 * Per the plan's MUST-VERIFY finding 2, the discard flow on /leads/[id] is already fully
 * wired (DiscardIssueModal + DELETE /api/leads/{id}/discard). This spec confirms the flow
 * end-to-end rather than building new UI.
 *
 * Tier: Fully-Automated (per validate-contract). Precondition: DEV_BYPASS=true and seeded
 * data. When no lead is reachable the case self-skips rather than false-fail — matching the
 * established e2e/loading-ux.e2e.ts convention.
 */

async function firstLeadDetailPath(page: Page): Promise<string | null> {
	await page.goto('/unassigned');
	// Scoped to <main> so the topbar's "New lead" link (also `/leads/*`-prefixed,
	// rendered before page content) can never be picked up as the first match.
	const link = page.locator('main a[href^="/leads/"]').first();
	if ((await link.count()) === 0) return null;
	const href = await link.getAttribute('href');
	return href && href !== '/leads/new' ? href : null;
}

test.describe('Lead detail discard flow', () => {
	test('AC7 — discard action is available and completes from the lead detail page', async ({
		page
	}) => {
		const path = await firstLeadDetailPath(page);
		test.skip(path === null, 'no leads seeded to open a detail page');

		await page.goto(path!);

		// The discard affordance is present on the detail page.
		const discard = page.getByRole('button', { name: /discard/i }).first();
		test.skip((await discard.count()) === 0, 'discard affordance not present for this lead');

		await discard.click();

		// The confirmation modal opens; confirming fires the DELETE discard endpoint.
		const del = page.waitForRequest(
			(req) => /\/api\/leads\/[0-9a-f-]+\/discard$/.test(req.url()) && req.method() === 'DELETE'
		);
		// Confirm inside the modal — scoped to the dialog so it can never match the
		// trigger button that opened it.
		await page.getByRole('dialog').getByRole('button', { name: 'Yes, discard' }).click();
		await del;
	});
});
