// Shared, pure import/normalization helpers — NO SvelteKit ($lib/$env) or DB-client imports,
// so this module is safe to import from BOTH SvelteKit routes (via $lib) and the standalone
// `scripts/import.ts` CLI (via relative path). Types are derived from the Drizzle enums in
// db/schema.ts (the single source of truth for the category/platform vocabularies).

import { leadCategory, leadPlatform } from './db/schema';

export type CrmLeadCategory = (typeof leadCategory.enumValues)[number];
export type CrmLeadPlatform = (typeof leadPlatform.enumValues)[number];

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export function extractHandleFromUrl(url: string): string | null {
	// Extract the first meaningful path segment from an FB/IG/website URL.
	try {
		const u = new URL(url);
		const parts = u.pathname.split('/').filter(Boolean);
		if (!parts.length) return null;
		const seg = parts[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase();
		return seg.length >= 2 ? seg : null;
	} catch {
		return null;
	}
}

export function normalizeHandle(
	fbUrl?: string,
	igUrl?: string,
	website?: string,
	name?: string
): string {
	// Priority: FB → IG → website → slugify(name).
	for (const url of [fbUrl, igUrl, website]) {
		if (!url) continue;
		const h = extractHandleFromUrl(url);
		if (h) return h;
	}
	return slugify(name ?? 'unknown');
}

// Full category map: scraper agent_categories value → CRM crm_lead_category enum.
const CATEGORY_MAP: Record<string, CrmLeadCategory> = {
	'Fun Run': 'Sports',
	Sports: 'Sports',
	'Triathlon / Duathlon': 'Sports',
	'Trail Run': 'Sports',
	'Fun Run / Road Race': 'Sports',
	Concert: 'Concert',
	'Live Band': 'Live Band',
	'Music Fest': 'Music Fest',
	Festival: 'Music Fest',
	'Music & Concert': 'Concert',
	Workshop: 'Workshop',
	Webinar: 'Workshop',
	'Workshop / Training': 'Workshop',
	'Course, Training or Workshop': 'Workshop',
	Theater: 'Theater',
	'Theater & Performing Arts': 'Theater',
	Conference: 'Conference',
	'Conference / Seminar': 'Conference',
	Convention: 'Convention',
	Expo: 'Expo',
	Competition: 'Competition',
	Church: 'Church',
	'Fan Fair': 'Fan Fair',
	School: 'School',
	Film: 'Film',
	Screening: 'Screening',
	'Bar/DJ': 'Bar/DJ',
	Club: 'Bar/DJ'
};

export function mapCategory(value: string): { category: CrmLeadCategory; needsReview: boolean } {
	const trimmed = value.trim();
	const mapped = CATEGORY_MAP[trimmed];
	if (mapped) return { category: mapped, needsReview: false };
	return { category: 'Other', needsReview: true };
}

export function normalizePlatform(fbUrl?: string, igUrl?: string): CrmLeadPlatform | null {
	if (fbUrl) return 'Facebook';
	if (igUrl) return 'Instagram';
	return null;
}
