#!/usr/bin/env bun
// One-time TSV historical importer. Reads a flat one-row-per-event TSV (organizer + venue
// denormalized onto each row), normalizes + dedups organizers into crm_leads, and folds each
// event into crm_activities (channel='scraped_event'). Idempotent: re-running inserts no dupes.
//
// NO $lib imports — this runs under Bun outside SvelteKit. The DB connection is created lazily
// (only under --load) from process.env.DATABASE_URL.
//
// Usage:
//   bun run scripts/import.ts --file <export.tsv> --dry-run     # report only, opens NO DB connection
//   bun run scripts/import.ts --file <export.tsv> --load        # load into the CRM DB (idempotent)
//
// Pipeline (plan §Implementation Checklist phases 1–9):
//   1 parse+hygiene  2 layout-validate  3 normalize-handle  4 dedup-leads
//   5 map-category   6 owner=null       7 dry-run report     8 load (txn)   9 verify

import { readFileSync } from 'node:fs';
import { tsvRowSchema, type TsvRow } from '../src/lib/zod/schemas';
import { normalizeHandle, mapCategory, normalizePlatform } from './lib/import-utils';

// --- CLI -------------------------------------------------------------------
type Args = { file?: string; dryRun: boolean; load: boolean };

function parseArgs(argv: string[]): Args {
	return {
		file: valueOf(argv, '--file'),
		dryRun: argv.includes('--dry-run'),
		load: argv.includes('--load')
	};
}
function valueOf(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i >= 0 ? argv[i + 1] : undefined;
}

// Column order is fixed and validated by position AND header name (plan Contract 1).
const COLUMNS = [
	'__row_type',
	'export_version',
	'event_id',
	'event_name',
	'event_slug',
	'event_category_raw',
	'event_category_clean',
	'event_starts_at',
	'event_ends_at',
	'event_post_date',
	'event_price',
	'event_source',
	'event_source_url',
	'event_registration_url',
	'event_image_url',
	'event_raw_text',
	'organizer_ref_id',
	'organizer_name',
	'organizer_slug',
	'organizer_status',
	'organizer_facebook_url',
	'organizer_instagram_url',
	'organizer_website',
	'organizer_email',
	'organizer_phone',
	'organizer_source',
	'organizer_enrichment_source',
	'organizer_scraped_at',
	'venue_name',
	'venue_address',
	'venue_city',
	'venue_country',
	'venue_latitude',
	'venue_longitude'
] as const;

const REQUIRED_ROW_TYPE = 'veent_event_v1';
const COLUMN_COUNT = COLUMNS.length; // 34

// --- Phase 1: parse + hygiene ---------------------------------------------

// Field-level unicode/entity hygiene. Decodes the handful of HTML entities the scraper emits,
// normalizes smart quotes, strips stray carriage returns, and trims.
function hygiene(value: string): string {
	return value
		.replace(/&#13;/g, '\r')
		.replace(/&#10;/g, '\n')
		.replace(/&amp;/g, '&')
		.replace(/[“”]/g, '"') // “ ” → "
		.replace(/[‘’]/g, "'") // ‘ ’ → '
		.replace(/\r/g, '') // collapse stray CR (incl. decoded &#13;)
		.trim();
}

// RFC-4180 quoting over a tab delimiter. One header row, then one row per event. Quoted fields
// may contain tabs and newlines; "" inside a quoted field is a literal ". Strips a leading BOM.
function parseTsv(content: string): string[][] {
	let s = content;
	if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM

	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let i = 0;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};

	while (i < s.length) {
		const c = s[i];
		if (inQuotes) {
			if (c === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += c;
			i++;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (c === '\t') {
			pushField();
			i++;
			continue;
		}
		if (c === '\r') {
			// normalize CRLF / lone CR to a row break
			if (s[i + 1] === '\n') i++;
			pushRow();
			i++;
			continue;
		}
		if (c === '\n') {
			pushRow();
			i++;
			continue;
		}
		field += c;
		i++;
	}
	// flush trailing field/row unless the content ended exactly on a row break
	if (field.length > 0 || row.length > 0) pushRow();
	return rows;
}

// --- Phase 2: layout validation -------------------------------------------

export type SkipReason = 'column_count' | 'bad_row_type' | 'bad_version' | 'schema';
export type SkippedRow = { lineNo: number; reason: SkipReason; detail?: string };

type ValidateResult = { valid: TsvRow[]; skipped: SkippedRow[] };

// Validate parsed data rows (header already removed). Applies hygiene per field, checks the
// column count, the format sentinel, the major version, then parses through tsvRowSchema.
function validateRows(dataRows: string[][]): ValidateResult {
	const valid: TsvRow[] = [];
	const skipped: SkippedRow[] = [];

	dataRows.forEach((raw, idx) => {
		const lineNo = idx + 2; // +1 for 0-based, +1 for the header row
		if (raw.length !== COLUMN_COUNT) {
			skipped.push({ lineNo, reason: 'column_count', detail: `${raw.length} cols` });
			return;
		}
		const fields = raw.map(hygiene);
		const obj: Record<string, string> = {};
		COLUMNS.forEach((name, c) => (obj[name] = fields[c]));

		if (obj.__row_type !== REQUIRED_ROW_TYPE) {
			skipped.push({ lineNo, reason: 'bad_row_type', detail: obj.__row_type });
			return;
		}
		const major = obj.export_version.split('.')[0];
		if (major !== '1') {
			skipped.push({ lineNo, reason: 'bad_version', detail: obj.export_version });
			return;
		}
		const parsed = tsvRowSchema.safeParse(obj);
		if (!parsed.success) {
			skipped.push({ lineNo, reason: 'schema', detail: parsed.error.issues[0]?.message });
			return;
		}
		valid.push(parsed.data);
	});

	return { valid, skipped };
}

// --- Phase 3/4: handle + dedup --------------------------------------------

function handleOf(row: TsvRow): string {
	return normalizeHandle(
		row.organizer_facebook_url || undefined,
		row.organizer_instagram_url || undefined,
		row.organizer_website || undefined,
		row.organizer_name
	);
}

// One crm_lead per unique normalized_handle; collect ALL events of the group for activity rows.
function groupByHandle(rows: TsvRow[]): Map<string, TsvRow[]> {
	const groups = new Map<string, TsvRow[]>();
	for (const row of rows) {
		const handle = handleOf(row);
		const existing = groups.get(handle);
		if (existing) existing.push(row);
		else groups.set(handle, [row]);
	}
	return groups;
}

// First-non-empty-wins merge of an organizer field across all events of a group.
function firstNonEmpty(events: TsvRow[], key: keyof TsvRow): string {
	for (const e of events) {
		const v = (e[key] ?? '').trim();
		if (v) return v;
	}
	return '';
}

// Representative event: earliest upcoming (starts_at >= now), else latest past by starts_at,
// else first by post_date.
function pickRepresentativeEvent(events: TsvRow[], now: Date = new Date()): TsvRow {
	const withStart = events.filter((e) => e.event_starts_at);
	const upcoming = withStart
		.filter((e) => new Date(e.event_starts_at) >= now)
		.sort((a, b) => +new Date(a.event_starts_at) - +new Date(b.event_starts_at));
	if (upcoming.length) return upcoming[0];

	const past = withStart.sort(
		(a, b) => +new Date(b.event_starts_at) - +new Date(a.event_starts_at)
	);
	if (past.length) return past[0];

	const byPost = [...events].sort((a, b) => {
		const ap = a.event_post_date ? +new Date(a.event_post_date) : 0;
		const bp = b.event_post_date ? +new Date(b.event_post_date) : 0;
		return ap - bp;
	});
	return byPost[0] ?? events[0];
}

// --- Lead/activity build ---------------------------------------------------

const emptyToNull = (v: string): string | null => {
	const t = v.trim();
	return t.length ? t : null;
};
const dateOnly = (iso: string): string | null => {
	const t = iso.trim();
	return t.length ? t.split('T')[0] : null;
};

type LeadInsert = {
	name: string;
	normalizedHandle: string;
	category: ReturnType<typeof mapCategory>['category'];
	needsReview: boolean;
	socialFacebook: string | null;
	socialInstagram: string | null;
	pageUrl: string | null;
	contactEmail: string | null;
	location: string | null;
	platform: ReturnType<typeof normalizePlatform>;
	source: 'scraper';
	stage: 'new';
	ownerId: null;
	eventName: string | null;
	eventDate: string | null;
	eventDateRaw: string | null;
	eventLink: string | null;
	notes: string | null;
};

type ActivityInsert = {
	repId: null;
	channel: 'scraped_event';
	occurredAt: Date;
	eventName: string | null;
	eventDate: string | null;
	eventUrl: string | null;
	eventCategory: string | null;
	eventSource: string;
};

type LeadGroup = { handle: string; lead: LeadInsert; activities: ActivityInsert[] };

function buildActivity(ev: TsvRow): ActivityInsert {
	const occ = ev.event_starts_at || ev.event_post_date || new Date().toISOString();
	return {
		repId: null,
		channel: 'scraped_event',
		occurredAt: new Date(occ),
		eventName: emptyToNull(ev.event_name),
		eventDate: dateOnly(ev.event_starts_at),
		eventUrl: emptyToNull(ev.event_source_url),
		eventCategory: emptyToNull(ev.event_category_clean.split('|')[0] ?? ''),
		eventSource: ev.event_source
	};
}

function buildLeadGroup(handle: string, events: TsvRow[]): LeadGroup {
	const name = firstNonEmpty(events, 'organizer_name');
	const fb = firstNonEmpty(events, 'organizer_facebook_url');
	const ig = firstNonEmpty(events, 'organizer_instagram_url');
	const website = firstNonEmpty(events, 'organizer_website');
	const email = firstNonEmpty(events, 'organizer_email');
	const phone = firstNonEmpty(events, 'organizer_phone');

	const rep = pickRepresentativeEvent(events);
	const { category, needsReview: catReview } = mapCategory(
		(rep.event_category_clean.split('|')[0] ?? '').trim()
	);
	const hasSocials = Boolean(fb || ig);
	const needsReview = catReview || !hasSocials;

	const location =
		[rep.venue_city.trim(), rep.venue_country.trim()].filter(Boolean).join(', ') || null;

	const eventId = firstNonEmpty(events, 'event_id') || rep.event_id;
	const notes =
		[phone ? `phone: ${phone}` : '', `imported scraper event_id=${eventId}`]
			.filter(Boolean)
			.join('\n') || null;

	const lead: LeadInsert = {
		name,
		normalizedHandle: handle,
		category,
		needsReview,
		socialFacebook: emptyToNull(fb),
		socialInstagram: emptyToNull(ig),
		pageUrl: emptyToNull(website),
		contactEmail: email ? email.toLowerCase() : null,
		location,
		platform: normalizePlatform(fb || undefined, ig || undefined),
		source: 'scraper',
		stage: 'new',
		ownerId: null,
		eventName: emptyToNull(rep.event_name),
		eventDate: dateOnly(rep.event_starts_at),
		eventDateRaw: emptyToNull(rep.event_starts_at),
		eventLink: emptyToNull(rep.event_source_url),
		notes
	};

	return { handle, lead, activities: events.map(buildActivity) };
}

// --- Phase 7: dry-run report ----------------------------------------------

type ReconciliationReport = {
	rowsRead: number;
	leadsBuilt: number;
	activitiesBuilt: number;
	eventsPerLead: { min: number; median: number; max: number };
	skipped: Record<string, number>;
	needsReviewCount: number;
	categoryToOtherCount: number;
	categoryHistogram: Record<string, number>;
};

function median(nums: number[]): number {
	if (!nums.length) return 0;
	const s = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function buildReport(
	rowsRead: number,
	groups: LeadGroup[],
	skipped: SkippedRow[]
): ReconciliationReport {
	const perLead = groups.map((g) => g.activities.length);
	const skipByReason: Record<string, number> = {};
	for (const s of skipped) skipByReason[s.reason] = (skipByReason[s.reason] ?? 0) + 1;

	const histogram: Record<string, number> = {};
	for (const g of groups) histogram[g.lead.category] = (histogram[g.lead.category] ?? 0) + 1;

	return {
		rowsRead,
		leadsBuilt: groups.length,
		activitiesBuilt: perLead.reduce((a, b) => a + b, 0),
		eventsPerLead: {
			min: perLead.length ? Math.min(...perLead) : 0,
			median: median(perLead),
			max: perLead.length ? Math.max(...perLead) : 0
		},
		skipped: skipByReason,
		needsReviewCount: groups.filter((g) => g.lead.needsReview).length,
		categoryToOtherCount: groups.filter((g) => g.lead.category === 'Other').length,
		categoryHistogram: histogram
	};
}

// Pure transform: file text → built lead groups + report. No DB access.
function plan(content: string): { groups: LeadGroup[]; report: ReconciliationReport } {
	const allRows = parseTsv(content);
	if (!allRows.length) throw new Error('TSV file is empty');

	// Validate header row matches expected column names and order before processing data rows.
	const headerRow = allRows[0].map((h) => h.trim());
	const mismatches = (COLUMNS as readonly string[]).flatMap((expected, i) =>
		headerRow[i] !== expected
			? [`col ${i}: expected "${expected}", got "${headerRow[i] ?? '(missing)'}"`]
			: []
	);
	if (mismatches.length) throw new Error(`TSV header mismatch:\n${mismatches.join('\n')}`);

	const dataRows = allRows.slice(1); // drop validated header
	const { valid, skipped } = validateRows(dataRows);
	const grouped = groupByHandle(valid);
	const groups = Array.from(grouped.entries()).map(([handle, events]) =>
		buildLeadGroup(handle, events)
	);
	const report = buildReport(dataRows.length, groups, skipped);
	return { groups, report };
}

// --- Phase 8/9: load + verify (lazy DB) -----------------------------------

async function load(groups: LeadGroup[], report: ReconciliationReport): Promise<void> {
	// Lazy imports so --dry-run never touches the DB layer.
	const postgres = (await import('postgres')).default;
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const { and, eq, isNull } = await import('drizzle-orm');
	const schema = await import('../src/lib/server/db/schema');

	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required for --load');

	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	const { crmLeads, crmActivities } = schema;

	let insertedLeads = 0;
	let skippedExisting = 0;
	let insertedActivities = 0;

	try {
		await db.transaction(async (tx) => {
			for (const group of groups) {
				// SELECT-then-insert guard: normalized_handle is advisory (non-unique) index.
				const existing = await tx
					.select({ id: crmLeads.id })
					.from(crmLeads)
					.where(and(eq(crmLeads.normalizedHandle, group.handle), isNull(crmLeads.deletedAt)))
					.limit(1);

				if (existing.length) {
					skippedExisting++;
					continue; // skip activities for already-existing leads (plan Phase 8)
				}

				const now = new Date();
				const [inserted] = await tx
					.insert(crmLeads)
					.values({ ...group.lead, createdAt: now, updatedAt: now })
					.returning({ id: crmLeads.id });
				insertedLeads++;

				if (group.activities.length) {
					const rows = group.activities.map((a) => ({
						...a,
						leadId: inserted.id,
						createdAt: now,
						updatedAt: now
					}));
					const res = await tx
						.insert(crmActivities)
						.values(rows)
						.onConflictDoNothing()
						.returning({ id: crmActivities.id });
					insertedActivities += res.length;
				}
			}
		});

		// Phase 9: verify
		const leadCount = await db
			.select({ id: crmLeads.id })
			.from(crmLeads)
			.where(eq(crmLeads.source, 'scraper'));
		const activityCount = await db
			.select({ id: crmActivities.id })
			.from(crmActivities)
			.where(eq(crmActivities.channel, 'scraped_event'));

		const leadsOk = insertedLeads + skippedExisting === report.leadsBuilt;
		console.log('\n=== Load result ===');
		console.table({
			insertedLeads,
			skippedExisting,
			insertedActivities,
			builtLeads: report.leadsBuilt,
			builtActivities: report.activitiesBuilt,
			dbScraperLeads: leadCount.length,
			dbScrapedActivities: activityCount.length
		});
		console.log(`\nPhase 9 verify: ${leadsOk ? 'PASS' : 'FAIL'} (inserted+skipped vs leadsBuilt)`);
	} finally {
		await client.end();
	}
}

// --- Orchestration ---------------------------------------------------------

async function run(args: Args): Promise<ReconciliationReport> {
	if (!args.file) throw new Error('--file <tsv> is required');
	const content = readFileSync(args.file, 'utf8');
	const { groups, report } = plan(content);

	if (args.load) {
		await load(groups, report);
	}
	return report;
}

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));
	run(args)
		.then((report) => {
			console.log('=== Reconciliation report ===');
			console.table({
				rowsRead: report.rowsRead,
				leadsBuilt: report.leadsBuilt,
				activitiesBuilt: report.activitiesBuilt,
				needsReviewCount: report.needsReviewCount,
				categoryToOtherCount: report.categoryToOtherCount,
				eventsPerLead_min: report.eventsPerLead.min,
				eventsPerLead_median: report.eventsPerLead.median,
				eventsPerLead_max: report.eventsPerLead.max
			});
			console.log('\nskipped by reason:');
			console.table(report.skipped);
			console.log('\ncategory histogram:');
			console.table(report.categoryHistogram);
			if (!args.load) console.log('\n(dry-run: no DB connection opened)');
		})
		.catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
}

export {
	run,
	parseArgs,
	parseTsv,
	hygiene,
	validateRows,
	groupByHandle,
	pickRepresentativeEvent,
	buildLeadGroup,
	plan,
	COLUMNS
};
export type { Args, ReconciliationReport, LeadGroup };
