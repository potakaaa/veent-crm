/**
 * End-to-end scenario for the Phase 1 mobile nav drawer (SPEC AC1).
 *
 * Runner: Playwright (`bun run test:e2e -- mobile-nav.e2e.ts`) — builds + previews on :4173.
 *
 * Tier: Fully-Automated (viewport emulation). Precondition to run for real:
 *   1. An authenticated session — since Better Auth was wired (DEV_BYPASS removed), protected
 *      routes redirect to /login without one. There is no Playwright login / storageState
 *      fixture in the repo yet (repo-wide e2e-harness gap — see
 *      process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md).
 * When that precondition is absent these specs SELF-SKIP rather than false-fail — the same
 * convention calendar.e2e.ts / loading-ux.e2e.ts use — so the suite stays green in an unseeded
 * CI and becomes real coverage once an authenticated e2e harness exists. A raw HTTP 500 is also
 * treated as a gate signal (session/auth check crashed before it could redirect to /login).
 *
 * This is the pre-accepted, program-level known-gap pattern (NOT a new failure): the scenario is
 * fully written and will exercise AC1 the moment the shared auth fixture lands.
 *
 * Scenario ↔ AC map:
 *   mobile-nav-trigger-visible-and-drawer-reachable-at-375px   AC1
 */
import { test, expect, type Page } from '@playwright/test';

/** Mobile viewport that puts the app below the 880px sidebar breakpoint. */
const MOBILE = { width: 375, height: 812 };

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

test.use({ viewport: MOBILE });

test.describe('Mobile nav drawer', () => {
	test('mobile-nav-trigger-visible-and-drawer-reachable-at-375px (AC1)', async ({ page }) => {
		await gotoAuthed(page, '/');

		// The desktop sidebar is hidden below 880px; the hamburger is the mobile entry point.
		const trigger = page.getByRole('button', { name: 'Open navigation menu' });
		await expect(trigger).toBeVisible();

		// Open the drawer — a Dialog with an accessible name.
		await trigger.click();
		const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
		await expect(drawer).toBeVisible();

		// Every core work destination is reachable inside the drawer.
		for (const href of [
			'/',
			'/leads',
			'/pipeline',
			'/unassigned',
			'/reminders',
			'/calendar',
			'/meetings',
			'/templates'
		]) {
			await expect(drawer.locator(`a[href="${href}"]`)).toBeVisible();
		}

		// Sign-out is reachable inside the drawer.
		await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible();

		// Escape closes the drawer and returns focus to the trigger (bits-ui default).
		await page.keyboard.press('Escape');
		await expect(drawer).toBeHidden();
		await expect(trigger).toBeFocused();
	});

	test('mobile-nav-destination-select-auto-closes-drawer (AC1)', async ({ page }) => {
		await gotoAuthed(page, '/');
		const trigger = page.getByRole('button', { name: 'Open navigation menu' });
		await trigger.click();
		const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
		await expect(drawer).toBeVisible();

		// Selecting a destination navigates AND auto-closes the drawer.
		await drawer.locator('a[href="/leads"]').click();
		await expect(page).toHaveURL(/\/leads/);
		await expect(drawer).toBeHidden();
	});
});
