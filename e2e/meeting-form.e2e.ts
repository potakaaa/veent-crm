import { expect, test, type Page } from '@playwright/test';

/**
 * Meeting modal per-field validation error e2e — Phase 4 (sitewide-ux-refresh), SPEC AC6.
 *
 * Tier: Hybrid. Precondition: authenticated session + a reachable lead whose
 * detail page exposes the "New meeting" action (MeetingFormModal). Self-skips
 * when the modal can't be opened — shared auth-fixture known-gap pattern. The
 * modal has NO Zod schema (hand-rolled checks); the `startAt` field key is
 * assigned manually. Deterministic ARIA proof lives in
 * src/tests/field-error.spec.ts (B4).
 *
 * Grep tag AC6 in the title.
 */

async function openMeetingModal(page: Page): Promise<boolean> {
	await page.goto('/leads');
	const firstLead = page.getByRole('link').filter({ hasText: /.+/ }).first();
	const listed = await firstLead
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (!listed) return false;

	// Best-effort: reach a lead detail page and open the New meeting modal.
	await page.goto('/leads');
	const rowLink = page.locator('a[href^="/leads/"]').first();
	const hasRow = await rowLink
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (!hasRow) return false;
	await rowLink.click();

	const newMeeting = page.getByRole('button', { name: /New meeting/i }).first();
	const canOpen = await newMeeting
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (!canOpen) return false;
	await newMeeting.click();

	return page
		.locator('#mtg-start')
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
}

test('AC6 — missing date/time surfaces an adjacent per-field error with aria wiring', async ({
	page
}) => {
	const opened = await openMeetingModal(page);
	test.skip(!opened, 'Meeting modal not reachable (no DB/session reachable in this environment)');

	// Submit with the date/time left blank → per-field error on the startAt control.
	await page.getByRole('button', { name: /Create meeting|Save changes/ }).click();

	const start = page.locator('#mtg-start');
	await expect(start).toHaveAttribute('aria-invalid', 'true');
	await expect(start).toHaveAttribute('aria-describedby', 'mtg-start-error');
	await expect(page.locator('#mtg-start-error')).toBeVisible();
});
