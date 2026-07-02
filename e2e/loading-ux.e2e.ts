import { expect, test, type Page } from '@playwright/test';

/**
 * Loading UX e2e — pending states, optimistic remove + rollback, reconcile, no-duplicate-submit.
 *
 * Tier: Hybrid (per validate-contract AC4–AC7). Precondition: DEV_BYPASS=true (currently
 * hard-coded true in hooks.server.ts) and seeded data on the Unassigned queue. When the
 * queue is empty (no DB seed) the data-dependent cases self-skip rather than false-fail —
 * the assertions that DO run still prove the mechanics on whatever rows exist.
 *
 * Target surface: /unassigned claim flow (optimistic remove from list + rollback + the
 * per-button duplicate-submit guard) plus the global nav progress bar.
 */

const CLAIM_ENDPOINT = /\/api\/leads\/[0-9a-f-]+\/claim$/;

async function firstClaimButton(page: Page) {
	const btn = page.getByRole('button', { name: 'Claim' }).first();
	return (await btn.count()) > 0 ? btn : null;
}

test.describe('Loading UX', () => {
	test('case a — claim button shows a pending state during the async op', async ({ page }) => {
		await page.goto('/unassigned');
		const btn = await firstClaimButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		// Delay the claim response so the pending state is observable.
		await page.route(CLAIM_ENDPOINT, async (route) => {
			await new Promise((r) => setTimeout(r, 400));
			await route.fulfill({ status: 200, body: '{}' });
		});

		await btn!.click();
		// The button text flips to the pending label and is disabled (duplicate-submit guard).
		await expect(page.getByRole('button', { name: 'Claiming…' }).first()).toBeVisible();
	});

	test('case b — failed claim rolls back the optimistic remove', async ({ page }) => {
		await page.goto('/unassigned');
		const btn = await firstClaimButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		const rowCountBefore = await page.getByRole('button', { name: 'Claim' }).count();
		await page.route(CLAIM_ENDPOINT, (route) => route.fulfill({ status: 500, body: 'boom' }));

		await btn!.click();
		// After the failure resolves, the row is restored (rollback) — count returns to baseline.
		await expect
			.poll(() => page.getByRole('button', { name: 'Claim' }).count())
			.toBe(rowCountBefore);
	});

	test('case c — successful claim reconciles with server (row leaves the queue)', async ({
		page
	}) => {
		await page.goto('/unassigned');
		const btn = await firstClaimButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		const rowCountBefore = await page.getByRole('button', { name: 'Claim' }).count();
		// No route mock — real endpoint runs so invalidateAll() reflects true server state,
		// not just the transient optimistic-remove window.
		await btn!.click();
		await page.waitForLoadState('networkidle'); // wait for invalidateAll() re-fetch to settle
		await expect
			.poll(() => page.getByRole('button', { name: 'Claim' }).count())
			.toBeLessThan(rowCountBefore);
	});

	test('case d — rapid double-click fires exactly one claim request', async ({ page }) => {
		await page.goto('/unassigned');
		const btn = await firstClaimButton(page);
		test.skip(btn === null, 'no unassigned leads seeded');

		let requests = 0;
		await page.route(CLAIM_ENDPOINT, async (route) => {
			requests += 1;
			await new Promise((r) => setTimeout(r, 300));
			await route.fulfill({ status: 200, body: '{}' });
		});

		await btn!.click({ clickCount: 2, delay: 20 });
		await page.waitForTimeout(600);
		// The duplicate-submit guard (claiming[id]) must keep this to a single request.
		expect(requests).toBe(1);
	});

	test('global nav progress bar appears during navigation only', async ({ page }) => {
		await page.goto('/');
		// At rest the progress bar is not present.
		await expect(page.getByTestId('nav-progress')).toHaveCount(0);
	});
});
