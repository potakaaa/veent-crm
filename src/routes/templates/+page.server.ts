import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listTemplatesPaginated, TEMPLATES_PAGE_SIZE } from '$lib/server/db/templates';
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
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
	const q = url.searchParams.get('q') ?? undefined;
	const category = url.searchParams.get('category') ?? undefined;
	const rawSort = url.searchParams.get('sort') ?? 'title';
	const sort = (rawSort === 'newest' || rawSort === 'oldest' ? rawSort : 'title') as
		| 'title'
		| 'newest'
		| 'oldest';

	const { templates, total } = await listTemplatesPaginated({ page, q, category, sort });
	const currentUser = sessionToUser(locals.user!);
	const totalPages = Math.ceil(total / TEMPLATES_PAGE_SIZE);

	return {
		templates,
		currentUser,
		filters: { q, category, sort },
		pagination: { page, pageSize: TEMPLATES_PAGE_SIZE, total, totalPages }
	};
};
