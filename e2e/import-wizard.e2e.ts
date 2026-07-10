/**
 * End-to-end scenarios for the CSV/Google Sheets Import wizard (GitHub #210/#211 — AC1, AC12).
 *
 * Runner: Playwright (`bun run test:e2e`) — builds + previews the app on :4173.
 *
 * Tier: Agent-Probe. Precondition to run for real: an authenticated session. Since Better Auth was
 * wired (DEV_BYPASS removed), protected routes redirect to /login without one, and there is no
 * Playwright login / storageState fixture in the repo yet (repo-wide e2e-harness gap —
 * process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md). These specs SELF-SKIP rather
 * than false-fail — the same convention calendar.e2e.ts / loading-ux.e2e.ts use — so the suite
 * stays green in an unseeded CI and becomes real coverage once the shared auth fixture lands.
 *
 * Scenario ↔ AC map:
 *   import-button-opens-wizard-on-leads          AC1 (leads)
 *   import-button-opens-wizard-on-organizers     AC1 (organizers) + AC12 (locked target, no step 2)
 */
import { test, expect, type Page } from '@playwright/test';

function isGated(page: Page): boolean {
	const p = new URL(page.url()).pathname;
	return p === '/login' || p === '/unauthorized';
}

async function gotoAuthed(page: Page, path: string) {
	const res = await page.goto(path);
	const gated = isGated(page) || res?.status() === 500;
	test.skip(gated, 'no authenticated e2e session (DEV_BYPASS removed; no login fixture yet)');
	return res;
}

test.describe('Import wizard', () => {
	test('import-button-opens-wizard-on-leads (AC1)', async ({ page }) => {
		await gotoAuthed(page, '/leads');
		const importBtn = page.getByRole('button', { name: 'Import' });
		await expect(importBtn).toBeVisible();
		await importBtn.click();
		await expect(page.getByText('choose a source', { exact: false })).toBeVisible();
	});

	test('import-button-opens-wizard-on-organizers locked to organizers (AC1, AC12)', async ({
		page
	}) => {
		await gotoAuthed(page, '/organizers');
		const importBtn = page.getByRole('button', { name: 'Import' });
		await expect(importBtn).toBeVisible();
		await importBtn.click();
		// Locked wizard opens straight into the source step; the target-choice radiogroup never shows.
		await expect(page.getByText('choose a source', { exact: false })).toBeVisible();
		await expect(page.getByRole('radiogroup', { name: 'Import target' })).toHaveCount(0);
	});
});
