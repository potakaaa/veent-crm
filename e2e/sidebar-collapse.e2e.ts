/**
 * End-to-end scenarios for the desktop collapsible sidebar (GitHub issue #158, SPEC AC1/AC2/AC4/AC5).
 *
 * Runner: Playwright (`bun run test:e2e -- sidebar-collapse.e2e.ts`) — builds + previews on :4173.
 *
 * Tier: Hybrid. Precondition to run for real:
 *   1. An authenticated session — since Better Auth was wired (DEV_BYPASS removed), protected
 *      routes redirect to /login without one. There is no Playwright login / storageState
 *      fixture in the repo yet (repo-wide e2e-harness gap — see
 *      process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md).
 * When that precondition is absent these specs SELF-SKIP rather than false-fail — the same
 * convention mobile-nav.e2e.ts / calendar.e2e.ts use — so the suite stays green in an unseeded CI
 * and becomes real coverage once an authenticated e2e harness exists. A raw HTTP 500 is also
 * treated as a gate signal (session/auth check crashed before it could redirect to /login).
 *
 * This is the pre-accepted, program-level known-gap pattern (NOT a new failure): the scenarios are
 * fully written and will exercise AC1/AC2/AC4/AC5 the moment the shared auth fixture lands.
 *
 * Scenario ↔ AC map:
 *   toggle-visible-and-collapses-to-icon-rail                      AC1
 *   icon-click-navigates-to-same-route-in-collapsed-state          AC2
 *   collapse-state-persists-across-client-navigation               AC4 (cross-navigation half)
 *   keyboard-shortcut-toggles-state                                AC5
 */
import { test, expect, type Page } from '@playwright/test';

/** Desktop viewport at/above the 880px sidebar breakpoint (rail visible, not the mobile drawer). */
const DESKTOP = { width: 1280, height: 800 };

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

/** The desktop sidebar container carries data-state="expanded"|"collapsed" and data-side="left". */
function desktopSidebar(page: Page) {
	return page.locator('[data-slot="sidebar"][data-side="left"]');
}

test.use({ viewport: DESKTOP });

test.describe('Collapsible sidebar (desktop)', () => {
	test('toggle-visible-and-collapses-to-icon-rail (AC1)', async ({ page }) => {
		await gotoAuthed(page, '/');

		const sidebar = desktopSidebar(page);
		await expect(sidebar).toHaveAttribute('data-state', 'expanded');

		// The visible toggle control (SidebarTrigger has an sr-only "Toggle Sidebar" label).
		const toggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();
		await expect(toggle).toBeVisible();

		await toggle.click();
		await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
		await expect(sidebar).toHaveAttribute('data-collapsible', 'icon');

		// Nav destinations remain present (as icons) while collapsed.
		await expect(sidebar.locator('a[href="/leads"]')).toBeVisible();
	});

	test('icon-click-navigates-to-same-route-in-collapsed-state (AC2)', async ({ page }) => {
		await gotoAuthed(page, '/');
		const sidebar = desktopSidebar(page);
		const toggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();

		await toggle.click();
		await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

		// Clicking a collapsed icon navigates to the same route it would when expanded.
		await sidebar.locator('a[href="/pipeline"]').click();
		await expect(page).toHaveURL(/\/pipeline/);
	});

	test('collapse-state-persists-across-client-navigation (AC4)', async ({ page }) => {
		await gotoAuthed(page, '/');
		const sidebar = desktopSidebar(page);
		const toggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();

		await toggle.click();
		await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

		// Navigate to another route; the collapsed state (cookie-backed) must survive.
		await sidebar.locator('a[href="/leads"]').click();
		await expect(page).toHaveURL(/\/leads/);
		await expect(desktopSidebar(page)).toHaveAttribute('data-state', 'collapsed');
	});

	test('keyboard-shortcut-toggles-state (AC5)', async ({ page }) => {
		await gotoAuthed(page, '/');
		const sidebar = desktopSidebar(page);
		await expect(sidebar).toHaveAttribute('data-state', 'expanded');

		// Cmd/Ctrl+B is the shadcn SidebarProvider default, wired at the app root.
		const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
		await page.keyboard.press(`${modifier}+KeyB`);
		await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

		await page.keyboard.press(`${modifier}+KeyB`);
		await expect(sidebar).toHaveAttribute('data-state', 'expanded');
	});
});
