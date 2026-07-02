import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listTemplates } from '$lib/server/db/templates';
import type { User } from '$lib/types';

// Manager-only: outreach message template management. Mirrors /team's guard.
//
// NOTE: the create/edit form uses the same client-side `templateFormSchema.safeParse`
// + `fetch('/api/templates')` idiom as /team's Add-a-rep form (the mature repo pattern
// item 12 mirrors). We deliberately do NOT return a `superValidate` instance: the repo
// has no superForms server-action usage, mutations go through the REST API (not form
// actions), and importing `sveltekit-superforms/adapters` breaks the vitest gate via a
// broken typebox transitive dep. Validation still happens twice — client safeParse and
// server-side `templateFormSchema` in /api/templates.
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'manager') {
		error(403, 'Manager only');
	}

	const templates = await listTemplates();

	const currentUser: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		role: locals.user.role,
		active: true
	};

	return { templates, currentUser };
};
