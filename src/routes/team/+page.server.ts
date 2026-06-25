import type { PageServerLoad } from './$types';
import { MOCK_REPS } from '$lib/server/mock';

// STUB (manager-only): add/deactivate reps, set role, bulk reassign. This list IS the
// magic-link allowlist (active + email). Real impl gates on locals.user.role === 'manager'.
export const load: PageServerLoad = async () => {
	return { reps: MOCK_REPS };
};
