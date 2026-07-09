import { test } from '@playwright/test';

test.describe('NCAL-3 sync buttons (AC10, AC11)', () => {
	test.skip(true, 'AC10/AC11: skipped — pending shared Playwright auth fixture');

	test('AC10: meeting sync button calls /api/meetings/[id]/sync and shows Synced', async ({
		page: _page
	}) => {
		// stub body
	});

	test('AC11: lead sync button calls /api/leads/[id]/sync and shows Synced', async ({
		page: _page
	}) => {
		// stub body
	});
});
