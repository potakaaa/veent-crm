import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listUsers, getLead } from '$lib/server/db/leads';
import { listMeetingsPaginated, parseMeetingFilterParams } from '$lib/server/db/meetings';
import type { User } from '$lib/types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Trusted server-side meId (locals.user.id) — never client-provided.
	const parsed = parseMeetingFilterParams(url.searchParams, locals.user.id);

	const [{ meetings, total }, users, selectedLeadRow] = await Promise.all([
		listMeetingsPaginated(1, 8, parsed),
		listUsers(),
		// The lead options are now fetched on demand by LeadCombobox (GET /api/leads).
		// Only resolve the currently-selected lead's label for the filter trigger, using
		// the VALIDATED lead id (parsed.leadId — undefined for junk/invalid) so bad ids
		// never reach getLead, and keep it visibility-scoped (GitHub #87).
		parsed.leadId ? getLead(parsed.leadId, locals.user.id, locals.user.role) : Promise.resolve(null)
	]);

	const selectedLead = selectedLeadRow
		? { id: selectedLeadRow.id, name: selectedLeadRow.name }
		: null;

	const me: User = {
		id: locals.user.id,
		email: locals.user.email,
		name: locals.user.name,
		firstName: locals.user.firstName,
		lastName: locals.user.lastName,
		role: locals.user.role,
		active: true
	};

	// Raw string values to hydrate the toolbar controls. Absent organizer → 'mine'
	// so the toolbar shows "Mine" selected — consistent with the parser treating
	// absent as meId (= the "Mine" default view).
	const filters = {
		organizer: url.searchParams.get('organizer') || 'mine',
		lead: url.searchParams.get('lead') ?? '',
		dateFrom: url.searchParams.get('dateFrom') ?? '',
		dateTo: url.searchParams.get('dateTo') ?? '',
		// Reuse the already-parsed, allow-listed value instead of re-deriving it.
		sortDir: parsed.sortDir,
		outcome: url.searchParams.get('outcome') ?? ''
	};

	return { meetings, total, users, selectedLead, me, filters };
};
