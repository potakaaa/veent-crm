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

// Known non-account path prefixes on FB/IG that are not organizer handles.
const NON_ACCOUNT_SEGMENTS = new Set([
	'groups',
	'events',
	'pages',
	'profile.php',
	'p',
	'reel',
	'reels',
	'share',
	'watch',
	'video',
	'videos',
	'photo',
	'photos',
	'stories',
	'hashtag'
]);

export function extractHandleFromUrl(url: string): string | null {
	// Extract the first meaningful path segment from an FB/IG/website URL.
	try {
		const u = new URL(url);
		const parts = u.pathname.split('/').filter(Boolean);
		if (!parts.length) return null;
		const seg = parts[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase();
		if (seg.length < 2 || NON_ACCOUNT_SEGMENTS.has(seg)) return null;
		return seg;
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

export function mapCategory(value: string): { category: CrmLeadCategory } {
	const trimmed = value.trim();
	// Pass through values already valid in the CRM enum (e.g. Camp, Modelling, Resort).
	if ((leadCategory.enumValues as readonly string[]).includes(trimmed)) {
		return { category: trimmed as CrmLeadCategory };
	}
	const mapped = CATEGORY_MAP[trimmed];
	if (mapped) return { category: mapped };
	return { category: 'Other' };
}

const PLATFORM_HOSTNAME_MAP: Array<[string, CrmLeadPlatform]> = [
	['facebook.com', 'Facebook'],
	['instagram.com', 'Instagram'],
	['tiktok.com', 'TikTok'],
	['twitter.com', 'Twitter/X'],
	['x.com', 'Twitter/X']
];

function platformFromUrl(url: string): CrmLeadPlatform | null {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
	for (const [domain, platform] of PLATFORM_HOSTNAME_MAP) {
		if (hostname === domain || hostname.endsWith('.' + domain)) return platform;
	}
	return null;
}

export function normalizePlatform(
	fbUrl?: string,
	igUrl?: string,
	eventSourceUrl?: string
): CrmLeadPlatform | null {
	// Explicit organizer social URLs take priority.
	if (fbUrl) return 'Facebook';
	if (igUrl) return 'Instagram';
	// Fall back to the event source URL — tells us which platform the event was scraped from
	// even when the organizer has no social profile URL (e.g. website-only organizers).
	// Works for any platform — FB, IG, TikTok, Twitter/X.
	if (eventSourceUrl) return platformFromUrl(eventSourceUrl);
	return null;
}

// Variant spellings → canonical country name. Lowercased keys; lookup is case-insensitive.
// Covers Philippines and Singapore (the only two markets in v1); unknown inputs return null.
const COUNTRY_MAP: Record<string, string> = {
	// Philippines
	philippines: 'Philippines',
	ph: 'Philippines',
	pilipinas: 'Philippines',
	'the philippines': 'Philippines',
	'republic of the philippines': 'Philippines',
	phil: 'Philippines',
	phils: 'Philippines',
	rp: 'Philippines',
	// Singapore
	singapore: 'Singapore',
	sg: 'Singapore',
	singapura: 'Singapore',
	'republic of singapore': 'Singapore'
};

export function normalizeCountry(raw?: string | null): string | null {
	if (!raw) return null;
	const key = raw.trim().toLowerCase();
	return COUNTRY_MAP[key] ?? null;
}

// Derive a country segment from the free-text location field: take the last comma-separated
// segment (e.g. "Makati, Philippines" → "Philippines"), or the whole string if no comma.
export function parseCountryFromLocation(location?: string | null): string | null {
	if (!location) return null;
	const parts = location.split(',');
	const derived = parts.length > 1 ? parts[parts.length - 1].trim() : location.trim();
	return derived || null;
}
