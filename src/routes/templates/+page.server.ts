import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listTemplates } from '$lib/server/db/templates';
import { sessionToUser } from '$lib/server/db/users';

// All authenticated users can view templates (reps read-only; managers can add/edit/delete).
// Write actions are gated in /api/templates.
//
// NOTE: the create/edit form uses the same client-side `templateFormSchema.safeParse`
// + `fetch('/api/templates')` idiom as /team's Add-a-rep form (the mature repo pattern
// item 12 mirrors). We deliberately do NOT return a `superValidate` instance: the repo
// has no superForms server-action usage, mutations go through the REST API (not form
// actions), and importing `sveltekit-superforms/adapters` breaks the vitest gate via a
// broken typebox transitive dep. Validation still happens twice — client safeParse and
// server-side `templateFormSchema` in /api/templates.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const templates = await listTemplates();

	const currentUser = sessionToUser(locals.user!);

	return { templates, currentUser };
};
