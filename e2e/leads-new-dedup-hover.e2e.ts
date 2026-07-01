import { expect, test, type Page } from '@playwright/test';

/**
 * /leads/new duplicate-row hover UX e2e.
 *
 * Tier: Hybrid. Precondition: live Postgres reachable (DATABASE_URL set) and
 * DEV_BYPASS=true (currently hard-coded true in hooks.server.ts) so the create
 * flow and page loads succeed. Navigation to /leads/new self-skips when the
 * page does not render (no DB/session reachable in this environment), matching
 * loading-ux.e2e.ts's self-skip pattern. Beyond that, these scenarios create a
 * KNOWN duplicate lead through the app's own create flow inside the test,
 * because AC2/AC4 need known field values to assert on.
 *
 * Grep tags AC1..AC6 in the titles so the validate-contract's
 * `-g "AC{n}"` commands select the right scenario.
 */

const LEAD_URL = /\/leads\/[0-9a-f-]+$/;

type LeadFields = {
	name: string;
	location?: string;
	email?: string;
	eventName?: string;
};

/** Navigate to /leads/new and self-skip when the page doesn't render (no DB/session reachable in this environment). */
async function gotoLeadsNew(page: Page): Promise<void> {
	await page.goto('/leads/new');
	const ready = await page
		.locator('#name')
		.waitFor({ state: 'visible', timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	test.skip(!ready, '/leads/new did not render (no DB/session reachable in this environment)');
}

/** Create a lead through the app's own /leads/new flow, return once redirected. */
async function createLead(page: Page, fields: LeadFields): Promise<void> {
	await gotoLeadsNew(page);
	await page.fill('#name', fields.name);
	if (fields.location) await page.fill('#location', fields.location);
	if (fields.email) await page.fill('#email', fields.email);
	if (fields.eventName) await page.fill('#eventName', fields.eventName);
	await page.getByRole('button', { name: /^Create/ }).click();
	await page.waitForURL(LEAD_URL);
}

/** Type a name on a fresh /leads/new form to surface the duplicate banner row. */
async function triggerDupe(page: Page, name: string) {
	await gotoLeadsNew(page);
	await page.fill('#name', name);
	const row = page.getByRole('button').filter({ hasText: name });
	await expect(row.first()).toBeVisible();
	return row.first();
}

function uniqueName(prefix: string): string {
	return `${prefix} ${Date.now()}`;
}

test.describe('/leads/new duplicate hover card', () => {
	test('AC1 — clicking a duplicate row does not navigate and keeps typed form data', async ({
		page
	}) => {
		const name = uniqueName('Dedup Hover AC1');
		await createLead(page, { name });

		const row = await triggerDupe(page, name);
		// Also type into another field to prove nothing is wiped.
		await page.fill('#location', 'Cebu');

		await row.click();
		// Give any (buggy) navigation a chance to fire before asserting.
		await page.waitForTimeout(300);

		await expect(page).toHaveURL(/\/leads\/new$/);
		await expect(page.locator('#name')).toHaveValue(name);
		await expect(page.locator('#location')).toHaveValue('Cebu');
	});

	test('AC2 — hovering a duplicate row reveals the 10-field detail card matching seeded values', async ({
		page
	}) => {
		const name = uniqueName('Dedup Hover AC2');
		const email = `ac2-${Date.now()}@example.com`;
		const location = 'Davao';
		const eventName = 'Worship Night AC2';
		await createLead(page, { name, email, location, eventName });

		const row = await triggerDupe(page, name);
		await row.hover();

		const card = page.locator(`[aria-label="Possible duplicate: ${name}"]`);
		await expect(card).toBeVisible();

		// Seeded values present.
		await expect(card).toContainText(name);
		await expect(card).toContainText(email);
		await expect(card).toContainText(location);
		await expect(card).toContainText(eventName);
		// Owner of a freshly-created lead is unassigned.
		await expect(card).toContainText('Unassigned');
		// Field labels for the standard set are all present.
		for (const label of ['Email', 'Phone', 'Category', 'Event', 'Owner', 'Last activity']) {
			await expect(card).toContainText(label);
		}
	});

	test('AC3 — hover card closes after the pointer leaves the row', async ({ page }) => {
		const name = uniqueName('Dedup Hover AC3');
		await createLead(page, { name });

		const row = await triggerDupe(page, name);
		await row.hover();

		const card = page.locator(`[aria-label="Possible duplicate: ${name}"]`);
		await expect(card).toBeVisible();

		// Move the pointer well away from the row and the card.
		await page.mouse.move(0, 0);
		// Wait past the 200ms grace-period plus margin.
		await page.waitForTimeout(500);

		await expect(card).toHaveCount(0);
	});

	test('AC4 — a duplicate with null fields renders empty-state, no "undefined"/"null", no console error', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});

		// Create with ONLY a name — email/phone/eventName/eventDate/owner all null.
		const name = uniqueName('Dedup Hover AC4');
		await createLead(page, { name });

		const row = await triggerDupe(page, name);
		await row.hover();

		const card = page.locator(`[aria-label="Possible duplicate: ${name}"]`);
		await expect(card).toBeVisible();

		const text = (await card.textContent()) ?? '';
		expect(text).not.toContain('undefined');
		expect(text).not.toContain('null');
		// Explicit empty-state marker present for the missing fields.
		await expect(card).toContainText('—');
		expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
	});

	test('AC5 — "Create anyway" still creates and redirects while duplicates are showing', async ({
		page
	}) => {
		const name = uniqueName('Dedup Hover AC5');
		await createLead(page, { name });

		// Re-open /leads/new and type the same name to surface the banner.
		await triggerDupe(page, name);
		// The submit button label flips to "Create anyway" when dupes show.
		const submit = page.getByRole('button', { name: 'Create anyway' });
		await expect(submit).toBeVisible();

		await submit.click();
		await page.waitForURL(LEAD_URL);
		await expect(page).toHaveURL(LEAD_URL);
	});

	test('AC6 — submitting sends an unchanged leadFormSchema-shaped payload to /api/leads', async ({
		page
	}) => {
		const name = uniqueName('Dedup Hover AC6');

		await gotoLeadsNew(page);
		await page.fill('#name', name);
		await page.fill('#location', 'Iloilo');
		await page.fill('#email', `ac6-${Date.now()}@example.com`);

		const [request] = await Promise.all([
			page.waitForRequest((req) => req.url().endsWith('/api/leads') && req.method() === 'POST'),
			page.getByRole('button', { name: /^Create/ }).click()
		]);

		const body = request.postDataJSON() as Record<string, unknown>;
		// Only leadFormSchema keys are allowed in the payload.
		const allowed = new Set([
			'name',
			'category',
			'platform',
			'location',
			'pageUrl',
			'contactEmail',
			'eventName',
			'eventLink',
			'eventDateRaw',
			'notes'
		]);
		for (const key of Object.keys(body)) {
			expect(allowed.has(key), `unexpected payload key: ${key}`).toBe(true);
		}
		expect(body.name).toBe(name);
		expect(body.category).toBeTruthy();
	});
});
