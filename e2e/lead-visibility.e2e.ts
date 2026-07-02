import { test, expect } from '@playwright/test';

/**
 * Lead visibility / privacy scoping (GitHub #87) — UI-render e2e.
 *
 * KNOWN-GAP STUB (test.fixme). These cases prove the browser-render halves of AC#1, AC#3,
 * AC#5, and AC#8 — the only halves NOT already proven by the Hybrid DB gates in
 * src/tests/leads-db.spec.ts / leads-filters.spec.ts / pipeline-db.spec.ts.
 *
 * They are fixme'd because of the repo-wide e2e-auth-bootstrap gap: real Better Auth has no
 * Playwright session-seed, so every page.goto() to a protected route redirects to /login and
 * we cannot log in as two distinct reps + a manager to assert per-user visibility. Tracked at
 * process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md. Un-skip (remove .fixme)
 * once that infra lands — the assertions below are written against the intended final UI.
 *
 * Until then these ACs' UI halves are verified only by manual spot-check (labelled
 * "manually spot-checked", never "tested"). The enforcement LOGIC for the same ACs IS proven
 * automatically at the query layer by the Hybrid DB gates.
 */

test.describe('lead visibility — UI render (blocked on e2e-auth-bootstrap)', () => {
	test.fixme('AC#1: create form persists Selected-people visibility + grants', async ({ page }) => {
		// Log in as rep A → /leads/new → set visibility = Selected people → pick rep B →
		// create → reopen the lead's edit page → expect visibility "Selected people" with rep B checked.
		await page.goto('/leads/new');
		await expect(page.getByLabel('Visibility')).toBeVisible();
	});

	test.fixme('AC#3: detail-edit changes visibility and it takes effect', async ({ page }) => {
		// As owner rep, edit a lead → set visibility = Only me → save → as a non-permitted rep,
		// the lead is absent from /leads and /leads/[id] returns 404.
		await page.goto('/leads');
		await expect(page).toHaveURL(/\/leads/);
	});

	test.fixme('AC#5: a non-permitted rep never sees a restricted lead in the list', async ({
		page
	}) => {
		// As rep B (no grant), an `only_me` lead owned by rep A must not appear in the /leads list.
		await page.goto('/leads');
		await expect(page).toHaveURL(/\/leads/);
	});

	test.fixme('AC#8: direct /leads/[id] URL to a restricted lead renders a 404 (not redacted)', async ({
		page
	}) => {
		// As rep B, navigating directly to a restricted lead's URL renders the branded 404 page —
		// existence is not leaked via a redacted/403 view.
		await page.goto('/leads/00000000-0000-0000-0000-ffffffffffff');
		await expect(page).toHaveURL(/\/leads\//);
	});
});
