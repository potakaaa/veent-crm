/**
 * End-to-end scenarios for NCAL-4 calendar event UI (AC1/AC2/AC4/AC5/AC6/AC7/AC8).
 *
 * Runner: Playwright (`bun run test:e2e`) — builds + previews the app on :4173.
 *
 * Tier: Known-Gap. All tests SELF-SKIP until BOTH blockers are resolved:
 *   1. Shared Playwright authenticated-session fixture (repo-wide gap —
 *      process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md).
 *      Without a session, no authenticated calendar page can be visited.
 *   2. Live CalDAV + n8n harness for team-event creation round-trip
 *      (process/features/calendar/backlog/caldav-live-harness_NOTE_08-07-26.md).
 *
 * Scenario ↔ AC map:
 *   create-event-button-visible          AC1
 *   event-form-fields-present            AC2
 *   team-event-chip-renders-purple       AC4
 *   chip-click-opens-detail-modal        AC5
 *   edit-event-submits-put               AC6
 *   delete-event-removes-chip            AC7
 *   link-to-lead-flow                    AC8
 */
import { test, expect } from '@playwright/test';

const SKIP_REASON =
	'Skipped — pending shared Playwright auth fixture ' +
	'(process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md)';

test.describe('NCAL-4 calendar event UI', () => {
	test('AC1 — "Create event" button is visible on calendar page for authenticated users', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		await expect(page.getByTestId('calendar-create-event')).toBeVisible();
	});

	test('AC2 — EventFormModal shows all required fields; all-day toggle hides time inputs', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		await page.getByTestId('calendar-create-event').click();

		// Required fields present
		await expect(page.locator('#event-title')).toBeVisible();
		await expect(page.locator('#event-start')).toBeVisible();
		await expect(page.locator('#event-end')).toBeVisible();
		await expect(page.locator('#event-location')).toBeVisible();
		await expect(page.locator('#event-description')).toBeVisible();
		await expect(page.locator('#event-color')).toBeVisible();
		await expect(page.locator('#event-status')).toBeVisible();

		// All-day toggle hides time portion
		await page.locator('#event-allday').check();
		// After checking, start/end should be date-only pickers
		await expect(page.locator('#event-start')).toHaveAttribute('type', 'date');
		await expect(page.locator('#event-end')).toHaveAttribute('type', 'date');
	});

	test('AC4 — Team-event chips render in purple (#7c3aed) in the calendar grid', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		// After creating a team event, at least one chip with team-event type should exist
		const chip = page.locator('[data-entry-type="team-event"]').first();
		await expect(chip).toBeVisible();
		const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
		// #7c3aed = rgb(124, 58, 237)
		expect(bg).toBe('rgb(124, 58, 237)');
	});

	test('AC5 — Clicking a team-event chip opens EventDetailModal with event data', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		const chip = page.locator('[data-entry-type="team-event"]').first();
		await chip.click();
		// Detail modal should open
		await expect(page.getByRole('dialog')).toBeVisible();
		// Should show date/time section
		await expect(page.locator('text=Date & Time')).toBeVisible();
	});

	test('AC6 — Edit event from modal submits PUT /api/calendar/events/[uid]; grid updates', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		const chip = page.locator('[data-entry-type="team-event"]').first();
		await chip.click();
		// Click Edit button in detail modal
		await page.getByRole('button', { name: 'Edit' }).click();
		// EventFormModal should open in edit mode
		await expect(page.locator('text=Edit Event')).toBeVisible();
		// Change title
		await page.locator('#event-title').fill('Updated Title');
		// Submit
		await page.getByRole('button', { name: 'Save changes' }).click();
		// Grid should update
		await expect(page.locator('text=Updated Title')).toBeVisible();
	});

	test('AC7 — Delete event from modal removes chip from grid', async ({ page }) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		const chip = page.locator('[data-entry-type="team-event"]').first();
		const title = await chip.textContent();
		await chip.click();
		// Click Delete, then confirm
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();
		// Modal closes and chip is gone
		await expect(page.getByRole('dialog')).not.toBeVisible();
		if (title) {
			await expect(page.locator(`text=${title.trim()}`)).not.toBeVisible();
		}
	});

	test('AC8 — Link-to-lead flow creates crm_meetings row and shows linked lead', async ({
		page
	}) => {
		test.skip(true, SKIP_REASON);
		await page.goto('/calendar');
		const chip = page.locator('[data-entry-type="team-event"]').first();
		await chip.click();
		// "Link to Lead" section should be visible (no existing url)
		await expect(page.locator('text=Link to Lead')).toBeVisible();
		// Open lead combobox, pick first result
		await page.locator('button', { hasText: 'Select a lead' }).click();
		await page.locator('[placeholder="Search leads…"]').fill('');
		await page.locator('[data-testid="command-item"]').first().click();
		// Click Link button
		await page.getByRole('button', { name: 'Link' }).click();
		// After success, modal should show "Linked Lead" section
		await expect(page.locator('text=Linked Lead')).toBeVisible();
	});
});
