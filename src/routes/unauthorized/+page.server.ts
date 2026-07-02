import type { PageServerLoad } from './$types';
import { sanitizeFrom } from '$lib/server/sanitize-redirect';

export const load: PageServerLoad = ({ url }) => {
	const from = sanitizeFrom(url.searchParams.get('from'));
	return { from };
};
