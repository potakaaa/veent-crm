// Pure organizer-handle normalization helpers. NO SvelteKit ($lib/$env), DB-client, or Node-only
// imports — safe to import from BOTH client code (the import wizard's MappingStep preview) and
// server code (`$lib/server/import-utils.ts` re-exports these). Single source of truth for the
// slugify → handle-extraction → normalizeHandle trio; do not duplicate these bodies elsewhere.

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
		// Accept scheme-less input (e.g. "facebook.com/acme", "www.instagram.com/acme"): a bare
		// domain is the common paste case, and `new URL()` requires a scheme. Prepend https:// when
		// no scheme is present so duplicate detection works on scheme-less URLs.
		const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
		const u = new URL(withScheme);
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
