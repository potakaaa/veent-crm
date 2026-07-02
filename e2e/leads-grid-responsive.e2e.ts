import { expect, test, type Page } from '@playwright/test';

/**
 * Leads / Up-for-Grabs grid responsiveness + perf smoke-check e2e.
 *
 * Phase 2 — sitewide-ux-refresh (AC2 responsive card-switch; PERF-RISK D2 gate).
 *
 * Tier: Hybrid. Preconditions: live Postgres reachable (DATABASE_URL set) and an
 * authenticated session so the protected `/leads` and `/unassigned` routes render.
 * There is currently no shared Playwright authenticated-session fixture (program-wide
 * known-gap — see process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md),
 * so every scenario SELF-SKIPS when the grid does not render, matching the self-skip
 * pattern in loading-ux.e2e.ts and leads-new-dedup-hover.e2e.ts. The assertions that DO
 * run prove the mechanic on whatever the environment can render.
 *
 * Grep tags AC2 / PERF in titles so the validate-contract can select scenarios.
 */

/** Navigate and self-skip when the grid panel does not render (no DB/session in this env). */
async function gotoGrid(page: Page, path: string): Promise<boolean> {
	await page.goto(path);
	const ready = await page
		.locator('.rounded-control.border.bg-panel')
		.first()
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	test.skip(!ready, `${path} did not render (no DB/session reachable in this environment)`);
	return ready;
}

/** Assert the document does not scroll horizontally at the current viewport. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
	const overflow = await page.evaluate(() => {
		const el = document.documentElement;
		// 1px tolerance for sub-pixel rounding.
		return el.scrollWidth - el.clientWidth;
	});
	expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);
}

const MOBILE = { width: 375, height: 800 };
const TABLET = { width: 768, height: 1024 };

test.describe('Leads/Up-for-Grabs grid responsiveness (AC2)', () => {
	for (const [label, size] of [
		['mobile', MOBILE],
		['tablet', TABLET]
	] as const) {
		test(`AC2 — /leads renders without horizontal overflow at ${label} width`, async ({ page }) => {
			await page.setViewportSize(size);
			await gotoGrid(page, '/leads');
			await expectNoHorizontalOverflow(page);
		});

		test(`AC2 — /unassigned renders without horizontal overflow at ${label} width`, async ({
			page
		}) => {
			await page.setViewportSize(size);
			await gotoGrid(page, '/unassigned');
			await expectNoHorizontalOverflow(page);
		});
	}

	test('AC2 — the column-header row is hidden below the lg breakpoint on /leads', async ({
		page
	}) => {
		await page.setViewportSize(MOBILE);
		await gotoGrid(page, '/leads');
		// The header row carries `hidden lg:grid`; at mobile width it must not be visible.
		const header = page.getByText('Organizer / page', { exact: true });
		if ((await header.count()) === 0) test.skip(true, 'no header rendered (empty grid)');
		await expect(header.first()).toBeHidden();
	});
});

test.describe('Leads grid perf smoke-check (PERF-RISK / D2)', () => {
	/**
	 * Records the /leads first-render timing so a >20% regression vs. the pre-phase
	 * baseline can be flagged. Requires a seeded DB with 200+ leads to be meaningful;
	 * self-skips otherwise. The baseline is recorded manually in the phase report this
	 * cycle (Hybrid tier — automatable once the shared auth + seed fixtures land).
	 */
	test('PERF — /leads first-contentful render timing at 200+ rows', async ({ page }) => {
		await gotoGrid(page, '/leads');
		const rowCount = await page.locator('a[href^="/leads/"]').count();
		test.skip(
			rowCount < 200,
			`only ${rowCount} leads seeded — need 200+ for a meaningful perf sample`
		);

		const timing = await page.evaluate(() => {
			const nav = performance.getEntriesByType('navigation')[0] as
				| PerformanceNavigationTiming
				| undefined;
			return nav ? nav.domContentLoadedEventEnd - nav.startTime : null;
		});
		console.log(`[PERF] /leads render (${rowCount} rows): ${timing}ms`);
		expect(timing, 'navigation timing available').not.toBeNull();
	});
});
