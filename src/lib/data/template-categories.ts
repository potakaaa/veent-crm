// TEMPLATE_CATEGORIES — frozen vocabulary for message-template + import category grouping (CAT-1).
//
// This is DELIBERATELY a closed, local constant — NOT the editable crm_categories table.
// Message-template categories group outreach snippets (a separate concept from editable lead
// categories) and must stay stable: coupling them to the mutable crm_categories table would let
// a manager's rename/delete silently break template grouping. See the CAT-1 plan §Design Decisions.
//
// Zero imports — client-safe (usable in .svelte components) AND safe for the standalone
// `scripts/import.ts` CLI via relative path, mirroring the import-utils.ts constraint.
//
// The 20 names are the verbatim values that previously lived in the `leadCategory` pgEnum.
export const TEMPLATE_CATEGORIES = [
	'Sports',
	'Workshop',
	'Church',
	'Theater',
	'Bar/DJ',
	'Conference',
	'Music Fest',
	'Fan Fair',
	'School',
	'Concert',
	'Live Band',
	'Expo',
	'Screening',
	'Camp',
	'Competition',
	'Convention',
	'Film',
	'Modelling',
	'Resort',
	'Other'
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
