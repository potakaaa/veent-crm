import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { isManagerRole } from '$lib/utils/permissions';
import { isValidRangeBucket } from '$lib/components/ui/range-bucket-control/range-bucket-control';
import { getDashboardData, rangeToStartDate } from '$lib/server/db/dashboard';
import { toDateParam } from '$lib/utils/calendar';

const PAGE_SIZE = 12;

// Manager/super-manager only — mirrors the exact gate at src/routes/team/+page.server.ts.
// The data promise is returned un-awaited (streaming-load idiom, matching /reports); the
// resolved value carries { rows, total }. `total`/`totalPages` are derived in the template
// from the awaited promise, since they aren't known synchronously without awaiting here.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !isManagerRole(locals.user.role)) {
		error(403, 'Manager only');
	}

	const rawRange = url.searchParams.get('range') ?? 'week';
	const range = isValidRangeBucket(rawRange) ? rawRange : 'week';

	const search = url.searchParams.get('q') ?? '';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const rangeStartDate = rangeToStartDate(range);
	const rangeStartParam = rangeStartDate ? toDateParam(rangeStartDate) : null;

	return {
		range,
		rangeStartParam,
		dashboard: getDashboardData(range, { search: search || undefined, page, pageSize: PAGE_SIZE }),
		filters: { search },
		pagination: { page, pageSize: PAGE_SIZE }
	};
};
