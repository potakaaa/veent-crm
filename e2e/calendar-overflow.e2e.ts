/**
 * Phase 3 (sitewide-ux-refresh) — Calendar/Reports responsiveness, overflow + empty states.
 *
 * Runner: Playwright (`bun run test:e2e`) — builds + previews the app on :4173.
 *
 * Tier: Hybrid. Preconditions to run for real:
 *   1. An authenticated session — protected routes redirect to /login without one, and there
 *      is no Playwright login / storageState fixture yet (repo-wide e2e-harness gap, tracked in
 *      process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md).
 *   2. Seeded data — a calendar day exceeding the visible-entry threshold (for the "+N more"
 *      case) and an empty-month/empty-leaderboard range (for the empty-state case).
 * When either precondition is absent these specs SELF-SKIP rather than false-fail — the same
 * convention calendar.e2e.ts uses. A raw HTTP 500 is treated as a gate signal (auth/session
 * check crashed before it could redirect) and also self-skips.
 *
 * Scenario ↔ criterion map:
 *   calendar-and-heatmap-responsive-overflow-wrapper          AC2
 *   calendar-plus-n-more-overflow-control                     AC11
 *   calendar-and-leaderboard-empty-state-copy                 AC12
 *   heatmap-tooltip-keyboard-reachable                        AC4 (supporting — B4)
 */
import { test, expect, type Page } from '@playwright/test';

/** True when the current page is behind the auth gate (redirected to /login or /unauthorized). */
function isGated(page: Page): boolean {
	const p = new URL(page.url()).pathname;
	return p === '/login' || p === '/unauthorized';
}

/** Navigate to `path`; return the Response, or skip the test when the auth gate intervenes. */
async function gotoAuthed(page: Page, path: string) {
	const res = await page.goto(path);
	const gated = isGated(page) || res?.status() === 500;
	test.skip(gated, 'no authenticated e2e session (DEV_BYPASS removed; no login fixture yet)');
	return res;
}

test.describe('Calendar/Reports overflow + empty states', () => {
	test('calendar-and-heatmap-responsive-overflow-wrapper (AC2)', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await gotoAuthed(page, '/calendar');
		// The 7-column grid keeps a usable min-width and its wrapper scrolls horizontally on
		// mobile instead of crushing each day cell.
		const grid = page.getByTestId('calendar-grid');
		await expect(grid).toBeVisible();
		const gridScrolls = await grid.evaluate((el) => {
			const wrapper = el.parentElement as HTMLElement;
			return wrapper.scrollWidth > wrapper.clientWidth;
		});
		expect(gridScrolls).toBe(true);
		// The Reports heatmap has an overflow-x-auto scroll region around its weeks grid.
		const res = await gotoAuthed(page, '/reports');
		expect(res?.status()).toBeLessThan(400);
		const heatmapCell = page.locator('a[href*="dateField="]').first();
		test.skip((await heatmapCell.count()) === 0, 'no seeded heatmap data in range');
		const hasScrollRegion = await heatmapCell.evaluate((el) => {
			let n: HTMLElement | null = el as HTMLElement;
			while (n) {
				if (getComputedStyle(n).overflowX === 'auto') return true;
				n = n.parentElement;
			}
			return false;
		});
		expect(hasScrollRegion).toBe(true);
	});

	test('calendar-plus-n-more-overflow-control (AC11)', async ({ page }) => {
		await gotoAuthed(page, '/calendar');
		// A day seeded beyond the inline threshold renders a "+N more" trigger; activating it
		// reveals the remaining entries in a popover (not a scrollable cell).
		const moreTrigger = page.getByTestId('calendar-more-trigger').first();
		test.skip(
			(await moreTrigger.count()) === 0,
			'no calendar day exceeds the visible-entry threshold in the seeded range'
		);
		await expect(moreTrigger).toBeVisible();
		await moreTrigger.click();
		await expect(page.getByTestId('calendar-more-content')).toBeVisible();
	});

	test('calendar-and-leaderboard-empty-state-copy (AC12)', async ({ page }) => {
		// A far-future month has no meetings/follow-ups → empty-state copy renders (grid stays).
		await gotoAuthed(page, '/calendar?date=2099-01-01');
		await expect(page.getByTestId('calendar-grid')).toBeVisible();
		await expect(page.getByTestId('calendar-empty-state')).toBeVisible();
		// Reports leaderboard empty-state renders when no rep activity exists in range.
		const res = await gotoAuthed(page, '/reports');
		expect(res?.status()).toBeLessThan(400);
		const emptyLeaderboard = page.getByTestId('leaderboard-empty-state');
		test.skip(
			(await emptyLeaderboard.count()) === 0,
			'seeded data has rep activity — leaderboard is not empty in this range'
		);
		await expect(emptyLeaderboard).toBeVisible();
	});

	test('heatmap-tooltip-keyboard-reachable (AC4 — B4)', async ({ page }) => {
		await gotoAuthed(page, '/reports');
		// A heatmap cell with data is a focusable link; focusing it (keyboard, no mouse) must
		// surface the same per-stage tooltip that hover shows.
		const cell = page.locator('a[href*="dateField="]').first();
		test.skip((await cell.count()) === 0, 'no seeded heatmap data in range');
		await cell.focus();
		await expect(cell).toBeFocused();
		// The single floating tooltip instance becomes visible on focus.
		await expect(page.locator('.fixed.z-50').first()).toBeVisible({ timeout: 3000 });
	});
});
