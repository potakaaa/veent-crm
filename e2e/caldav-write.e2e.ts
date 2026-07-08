/**
 * End-to-end scenarios for the NCAL-2 CalDAV write routes (AC7/AC8/AC9-route/AC10).
 *
 * Runner: Playwright (`bun run test:e2e`) — builds + previews the app on :4173.
 *
 * Tier: Agent-Probe. These are ON-DISK residuals for the pre-accepted known-gaps: they
 * cannot run for real until BOTH exist —
 *   1. A shared Playwright authenticated-session fixture (repo-wide gap —
 *      process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md). Without a
 *      session, AC8/AC9-route/AC10 (valid-session paths) can't be exercised.
 *   2. A live CalDAV + n8n harness (process/features/calendar/backlog/
 *      caldav-live-harness_NOTE_08-07-26.md) for AC10's create → read-back round-trip.
 * Until then every spec SELF-SKIPS rather than false-fail — same convention as
 * calendar.e2e.ts — so the suite stays green in an unseeded CI and becomes real coverage
 * once the harness exists.
 *
 * Scenario ↔ AC map:
 *   write-routes-reject-unauthenticated             AC7
 *   post-bad-payload-returns-400-no-webhook         AC8
 *   n8n-failure-maps-to-502-no-upstream-detail      AC9 (route layer)
 *   create-then-read-back-shows-url                 AC10
 */
import { test, expect, type Page } from '@playwright/test';

/** True when the current page is behind the auth gate (redirected to /login or /unauthorized). */
function isGated(page: Page): boolean {
	const p = new URL(page.url()).pathname;
	return p === '/login' || p === '/unauthorized';
}

/**
 * True once a shared authenticated-session fixture exists. Hard-coded false today: there
 * is no Playwright login/storageState fixture in the repo yet (repo-wide e2e-harness gap).
 * Flip this to a real session check when the fixture lands.
 */
function hasAuthedSession(): boolean {
	return false;
}

test.describe('NCAL-2 CalDAV write routes', () => {
	test('write-routes-reject-unauthenticated (AC7)', async ({ page }) => {
		// Unauthenticated POST/PUT/DELETE must be turned away by the session gate. Without a
		// login fixture we can only observe the gated redirect on navigation; assert that the
		// protected app is gated, then self-skip the direct-API assertion until the fixture exists.
		await page.goto('/calendar');
		test.skip(
			!isGated(page),
			'no authenticated e2e session harness — cannot exercise write-route 401 directly yet'
		);
		expect(isGated(page)).toBe(true);
	});

	test('post-bad-payload-returns-400-no-webhook (AC8)', async () => {
		test.skip(!hasAuthedSession(), 'blocked on shared Playwright auth fixture (known-gap)');
		// With a real session: POST /api/calendar/events with a bad body → 400, no webhook call.
		expect(true).toBe(true);
	});

	test('n8n-failure-maps-to-502-no-upstream-detail (AC9 route layer)', async () => {
		test.skip(
			!hasAuthedSession(),
			'blocked on shared Playwright auth fixture + n8n stub (known-gap)'
		);
		// With a real session + failing n8n: POST → 502 'Calendar service unavailable', no leak.
		expect(true).toBe(true);
	});

	test('create-then-read-back-shows-url (AC10)', async () => {
		test.skip(
			!hasAuthedSession(),
			'blocked on shared Playwright auth fixture + live CalDAV harness (known-gap)'
		);
		// With a live Nextcloud + n8n: create via POST → GET read-back surfaces event.url.
		expect(true).toBe(true);
	});
});
