/**
 * Fetch all events from the local scraper API and push them to the local CRM ingest endpoint.
 * Idempotent: existing leads get their country backfilled (patched); true new leads get created.
 *
 * Usage:
 *   bun run scripts/push-from-scraper.ts [--dry-run]
 *   bun run scripts/push-from-scraper.ts --country=Philippines
 *   bun run scripts/push-from-scraper.ts --country=Singapore
 */

const SCRAPER_BASE  = 'http://localhost:8000';
const CRM_INGEST    = 'http://localhost:5173/api/leads/ingest';
const INGEST_SECRET = process.env.INGEST_SECRET ?? 'dev-scraper-secret';
const BATCH_SIZE    = 100;
const FETCH_LIMIT   = 100;

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const countryArg = args.find(a => a.startsWith('--country='))?.split('=')[1];

// Valid CRM category enum values
const CRM_CATEGORIES = new Set([
	'Sports', 'Workshop', 'Church', 'Theater', 'Bar/DJ', 'Conference', 'Music Fest',
	'Fan Fair', 'School', 'Concert', 'Live Band', 'Expo', 'Screening', 'Camp',
	'Competition', 'Convention', 'Film', 'Modelling', 'Resort', 'Other',
]);

// Map scraper category strings to CRM enum (exact match first, then synonyms, else omit)
const CATEGORY_SYNONYMS: Record<string, string> = {
	'convention': 'Convention',
	'theatre': 'Theater',
	'music': 'Concert',
	'music fest': 'Music Fest',
	'fun run': 'Sports',
	'webinar': 'Workshop',
	'workshop / training': 'Workshop',
	'science & technology': 'Conference',
	'exhibitions': 'Expo',
};

function mapCategory(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (CRM_CATEGORIES.has(trimmed)) return trimmed;
	return CATEGORY_SYNONYMS[trimmed.toLowerCase()] ?? undefined;
}

// ---------------------------------------------------------------------------
// Platform mapping: scraper source → CRM enum
// ---------------------------------------------------------------------------
const PLATFORM_MAP: Record<string, string> = {
	facebook:  'Facebook',
	instagram: 'Instagram',
	tiktok:    'TikTok',
	twitter:   'Twitter/X',
	x:         'Twitter/X',
};

function mapPlatform(src: string | null): string | undefined {
	if (!src) return undefined;
	return PLATFORM_MAP[src.toLowerCase()] ?? undefined; // meetup/luma/etc → omit (CRM will leave null)
}

// ---------------------------------------------------------------------------
// Date parsing: "M/D/YYYY HH:MM:SS" → "YYYY-MM-DD"
// ---------------------------------------------------------------------------
function parseEventDate(raw: string | null): string | undefined {
	if (!raw) return undefined;
	// "6/30/2026 08:00:00" or "6/30/2026"
	const [datePart] = raw.split(' ');
	const parts = datePart.split('/');
	if (parts.length !== 3) return undefined;
	const [m, d, y] = parts;
	const yyyy = y.padStart(4, '0');
	const mm   = m.padStart(2, '0');
	const dd   = d.padStart(2, '0');
	const iso  = `${yyyy}-${mm}-${dd}`;
	return isNaN(new Date(iso).getTime()) ? undefined : iso;
}

function validUrl(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const t = raw.trim();
	return t.startsWith('http://') || t.startsWith('https://') ? t : undefined;
}

function validEmail(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const t = raw.trim();
	return t.includes('@') && t.includes('.') ? t : undefined;
}

// ---------------------------------------------------------------------------
// Combine city + country into a single location string
// ---------------------------------------------------------------------------
function buildLocation(city: string | null, country: string | null): string | undefined {
	const c = city?.trim();
	const n = country?.trim();
	if (c && n) return `${c}, ${n}`;
	return c || n || undefined;
}

// ---------------------------------------------------------------------------
// Scraper lead → CRM ingest payload item
// ---------------------------------------------------------------------------
interface ScraperLead {
	db_id:              number;
	category:           string | null;
	page_name:          string;
	location_city:      string | null;
	location_country:   string | null;
	event:              string | null;
	link:               string | null;
	event_date:         string | null;
	organizer_email:    string | null;
	organizer_phone:    string | null;
	organizer_facebook: string | null;
	platform:           string | null;
}

function toIngestLead(s: ScraperLead) {
	return {
		pageName:    s.page_name?.trim() || s.event?.trim() || `Event #${s.db_id}`,
		sourceRef:   String(s.db_id),
		location:    buildLocation(s.location_city, s.location_country),
		category:    mapCategory(s.category),
		platform:    mapPlatform(s.platform),
		eventName:   s.event ?? undefined,
		eventDate:   parseEventDate(s.event_date),
		eventLink:   validUrl(s.link),
		email:       validEmail(s.organizer_email),
		phone:       s.organizer_phone ?? undefined,
		facebookUrl: validUrl(s.organizer_facebook),
	};
}

// ---------------------------------------------------------------------------
// Fetch one page from the scraper
// ---------------------------------------------------------------------------
async function fetchPage(page: number): Promise<{ results: ScraperLead[]; pages: number; total: number }> {
	const params = new URLSearchParams({ limit: String(FETCH_LIMIT), page: String(page) });
	if (countryArg) params.set('country', countryArg);
	const res = await fetch(`${SCRAPER_BASE}/api/leads/?${params}`);
	if (!res.ok) throw new Error(`Scraper returned ${res.status}`);
	return res.json() as any;
}

// ---------------------------------------------------------------------------
// POST a batch to the CRM
// ---------------------------------------------------------------------------
async function postBatch(leads: ReturnType<typeof toIngestLead>[]): Promise<{
	received: number; created: number; skipped: number; patched: number; review: number;
}> {
	if (DRY_RUN) {
		return { received: leads.length, created: 0, skipped: 0, patched: 0, review: 0 };
	}
	const res = await fetch(CRM_INGEST, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INGEST_SECRET}` },
		body:    JSON.stringify({ leads }),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`CRM ingest returned ${res.status}: ${text}`);
	}
	return res.json() as any;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${countryArg ? ` | country filter: ${countryArg}` : ''}`);
	console.log(`Scraper: ${SCRAPER_BASE}  →  CRM: ${CRM_INGEST}\n`);

	const totals = { received: 0, created: 0, skipped: 0, patched: 0, review: 0 };

	// First page to learn total count
	const first = await fetchPage(1);
	const totalPages = first.pages;
	console.log(`Scraper has ${first.total} events across ${totalPages} pages (limit ${FETCH_LIMIT})\n`);

	let batch: ReturnType<typeof toIngestLead>[] = [];

	const flush = async () => {
		if (!batch.length) return;
		const result = await postBatch(batch);
		totals.received += result.received;
		totals.created  += result.created;
		totals.skipped  += result.skipped;
		totals.patched  += result.patched;
		totals.review   += result.review;
		process.stdout.write(`  → received ${result.received} | created ${result.created} | patched ${result.patched} | skipped ${result.skipped}\n`);
		batch = [];
	};

	for (let page = 1; page <= totalPages; page++) {
		const data = page === 1 ? first : await fetchPage(page);
		process.stdout.write(`Page ${page}/${totalPages} (${data.results.length} events) `);
		for (const s of data.results) {
			batch.push(toIngestLead(s));
			if (batch.length >= BATCH_SIZE) await flush();
		}
		if (batch.length && (page === totalPages || batch.length >= BATCH_SIZE)) await flush();
	}
	await flush();

	console.log('\n=== Summary ===');
	console.log(`Received : ${totals.received}`);
	console.log(`Created  : ${totals.created}`);
	console.log(`Patched  : ${totals.patched}  ← country backfilled on existing leads`);
	console.log(`Skipped  : ${totals.skipped}  ← already had country or no location`);
	console.log(`Review   : ${totals.review}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
