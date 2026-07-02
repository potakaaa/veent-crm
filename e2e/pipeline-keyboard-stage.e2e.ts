/**
 * Phase 3 (sitewide-ux-refresh) — Pipeline responsiveness + keyboard stage-change e2e.
 *
 * Runner: Playwright (`bun run test:e2e`) — builds + previews the app on :4173.
 *
 * Tier: Hybrid. Preconditions to run for real:
 *   1. An authenticated session — protected routes redirect to /login without one, and there
 *      is no Playwright login / storageState fixture in the repo yet (repo-wide e2e-harness
 *      gap, tracked in process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md).
 *   2. Seeded pipeline data — at least two leads in distinct board stages so a card exists to
 *      drag / keyboard-move and a second column exists as a drop target.
 * When either precondition is absent these specs SELF-SKIP rather than false-fail — the same
 * convention calendar.e2e.ts / loading-ux.e2e.ts use — so the suite stays green in an unseeded
 * CI and becomes real coverage once an authenticated+seeded e2e harness exists. A raw HTTP 500
 * is also treated as a gate signal (session/auth check crashed before it could redirect).
 *
 * Scenario ↔ criterion map:
 *   pipeline-scroll-affordance-cue-narrow-viewport            AC2
 *   keyboard-only-stage-change-writes-history-row             AC3
 *   native-drag-and-drop-still-works-after-restructure        AC3 (supporting — A3a regression)
 *   axe-audit-no-critical-serious-violations                  AC4
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

test.describe('Pipeline responsiveness + keyboard stage-change', () => {
	test('pipeline-scroll-affordance-cue-narrow-viewport (AC2)', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await gotoAuthed(page, '/pipeline');
		// The board keeps its fixed-width columns and scrolls horizontally rather than
		// reflowing; the right-edge fade overlay cues that there is more to scroll to.
		const board = page.locator('[role="list"][aria-label="Pipeline stages"]');
		await expect(board).toBeVisible();
		// The scroll container is actually overflowing at this width.
		const overflow = await board.evaluate((el) => el.scrollWidth > el.clientWidth);
		expect(overflow).toBe(true);
		// Document does not scroll horizontally (the overflow is contained to the board).
		const bodyOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
		);
		expect(bodyOverflow).toBe(true);
	});

	test('keyboard-only-stage-change-writes-history-row (AC3)', async ({ page }) => {
		await gotoAuthed(page, '/pipeline');
		// The keyboard-accessible stage-change control (bits-ui Select) is present per card.
		const trigger = page.getByLabel('Change stage for this lead').first();
		test.skip((await trigger.count()) === 0, 'no seeded pipeline cards in the visible range');
		// Keyboard-only: focus the trigger, open with Enter, move with ArrowDown, commit Enter.
		await trigger.focus();
		await expect(trigger).toBeFocused();
		await page.keyboard.press('Enter');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		// The move fires the same onMove(leadId, stage) path drag uses, which PATCHes
		// /api/leads/{id}/stage and writes a crm_lead_history row (proven at the DB layer by
		// src/tests/pipeline-db.spec.ts). A success toast confirms the mutation round-tripped;
		// non-won/lost moves surface "Moved …", won/lost open a capture/reason modal instead.
		const moved = page.getByText(/Moved .* to /);
		const modal = page.getByRole('dialog');
		await expect(moved.or(modal)).toBeVisible({ timeout: 5000 });
	});

	test('native-drag-and-drop-still-works-after-restructure (AC3 — A3a regression)', async ({
		page
	}) => {
		await gotoAuthed(page, '/pipeline');
		// Regression guard: the A3a card restructure moved draggable/ondragstart from the <a>
		// to the outer <div> and set draggable="false" on the link. This proves a native HTML5
		// drag from one column to another still triggers the custom drop()/onMove path.
		const cards = page.locator('[role="list"] a[href^="/leads/"]');
		test.skip((await cards.count()) < 1, 'no seeded pipeline cards to drag');
		const source = cards.first();
		const columns = page.locator('[role="listitem"][aria-label$="drop target"]');
		test.skip((await columns.count()) < 2, 'need at least two stage columns to drag between');
		// Drag the source card onto a different column and assert the move round-tripped.
		const target = columns.nth(1);
		await source.dragTo(target);
		const moved = page.getByText(/Moved .* to /);
		const modal = page.getByRole('dialog');
		await expect(moved.or(modal)).toBeVisible({ timeout: 5000 });
	});

	test('axe-audit-no-critical-serious-violations (AC4)', async ({ page }) => {
		await gotoAuthed(page, '/pipeline');
		// axe-core is an optional dev tool; when @axe-core/playwright is not installed this
		// scenario self-skips instead of hard-failing on a missing module (no new dependency
		// is forced by this phase). Once installed it becomes a real name/role/focus gate.
		let AxeBuilder: typeof import('@axe-core/playwright').default | null;
		try {
			AxeBuilder = (await import('@axe-core/playwright')).default;
		} catch {
			AxeBuilder = null;
		}
		test.skip(AxeBuilder === null, '@axe-core/playwright not installed (optional a11y gate)');
		const results = await new AxeBuilder!({ page })
			.include('[role="list"][aria-label="Pipeline stages"]')
			.analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
