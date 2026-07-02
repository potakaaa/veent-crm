#!/usr/bin/env bun
/**
 * import-sheet.ts — One-time CSV importer for the team's "Centralized List of Events" spreadsheet.
 *
 * WHAT IT IMPORTS
 * ───────────────
 * Events.csv   → crm_leads   (one row per outreach target / organizer page)
 * Meeting.csv  → crm_meetings + crm_meeting_attendees (cross-referenced to the imported leads)
 *
 * COLUMN MAPPING (Events.csv)
 * ───────────────────────────
 * Sheet column       → CRM field
 * Category           → category     (unmapped values fall back to "Other")
 * Page Name          → name         (if a URL, social fields are set instead and name falls back to Event)
 * Location           → location
 * Event              → eventName
 * Link               → eventLink    (post/event URLs) or socialFacebook/socialInstagram (profile URLs)
 * Event Date         → eventDateRaw + eventDate (start date parsed from free-text ranges)
 * Notes              → notes
 * Reached Out By     → ownerId      (resolved interactively at load time — see Rep Mapping below)
 * Status             → stage        (see Status → Stage table below)
 * Date Reached Out   → firstReachedOutDate
 * Platform           → platform
 *
 * STATUS → STAGE MAPPING
 * ──────────────────────
 * Not Yet Reached Out → new
 * Reached Out         → contacted
 * Followed Up         → contacted
 * To Follow Up        → contacted
 * Did Not Respond     → contacted
 * Replied             → replied
 * Closed Chat         → replied
 * Processing          → in_discussion
 * On Boarded          → won
 * Rejected            → lost
 * Disregard           → lost
 *
 * REP MAPPING (interactive, --load only)
 * ───────────────────────────────────────
 * The sheet uses short names / nicknames (Elay, Divine, Jonna, …). When --load runs,
 * the script connects to the DB, lists all active crm_users, then prompts you to pick
 * which user each nickname maps to. Names where the first name auto-matches a crm_user
 * are pre-filled — press Enter to accept. Enter 0 to leave a name unassigned.
 *
 * IDEMPOTENCY
 * ───────────
 * Leads:    deduped by (source='sheet_import', normalizedHandle). Re-running skips existing rows.
 * Meetings: deduped by (leadId, startAt). Re-running skips existing rows.
 * Safe to re-run after partial failures — already-inserted rows are never duplicated.
 *
 * PREREQUISITES
 * ─────────────
 * - DATABASE_URL env var must be set (only needed for --load)
 * - crm_users must already exist in the DB before --load (reps are not created by this script)
 * - Reps log in via magic link at /login once their email is in crm_users
 *
 * USAGE
 * ─────
 * # Preview what will be imported — no DB connection opened:
 * bun scripts/import-sheet.ts --dry-run \
 *   --events   "/path/to/Events.csv" \
 *   --meetings "/path/to/Meeting.csv"
 *
 * # Run the actual import (interactive rep-mapping prompt included):
 * bun scripts/import-sheet.ts --load \
 *   --events   "/path/to/Events.csv" \
 *   --meetings "/path/to/Meeting.csv"
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

// ---------------------------------------------------------------------------
// Column indices for Events.csv (0-based, after header rows are stripped)
// Headers: [idx, Category, Page Name, Location, Event, Link, Event Date,
//           Notes, Added By, Reached Out By, Status, Date Reached Out, Platform, _, _]
// ---------------------------------------------------------------------------
const E = {
	IDX: 0,
	CATEGORY: 1,
	PAGE_NAME: 2,
	LOCATION: 3,
	EVENT: 4,
	LINK: 5,
	EVENT_DATE: 6,
	NOTES: 7,
	ADDED_BY: 8,
	REACHED_OUT_BY: 9,
	STATUS: 10,
	DATE_REACHED_OUT: 11,
	PLATFORM: 12
} as const;

// ---------------------------------------------------------------------------
// Column indices for Meeting.csv (0-based)
// Headers: [Meeting date, Time, Client, Category, Description, Attendee, Status, Notes]
// ---------------------------------------------------------------------------
const M = {
	DATE: 0,
	TIME: 1,
	CLIENT: 2,
	CATEGORY: 3,
	DESCRIPTION: 4,
	ATTENDEE: 5,
	STATUS: 6,
	NOTES: 7
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CRM_CATEGORIES = new Set([
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
]);

const CATEGORY_MAP: Record<string, string> = {
	'Adventure Parks': 'Other',
	Art: 'Other',
	Cabin: 'Resort',
	'Car Pool': 'Other',
	Celebration: 'Other',
	Community: 'Other',
	'Fun Run': 'Sports',
	Health: 'Other',
	'Hotel/Inn/ Airbnb': 'Resort',
	Playground: 'Other',
	Rentals: 'Other',
	Restaurant: 'Other',
	Salon: 'Other',
	Studio: 'Other',
	'Travel and Tours ': 'Other',
	'Water Park': 'Other',
	Webinar: 'Conference',
	farm: 'Other'
};

const STATUS_TO_STAGE: Record<string, string> = {
	'Not Yet Reached Out': 'new',
	'Reached Out': 'contacted',
	'Followed Up': 'contacted',
	'To Follow Up': 'contacted',
	'Did Not Respond': 'contacted',
	Replied: 'replied',
	'Closed Chat': 'replied',
	Processing: 'in_discussion',
	'On Boarded': 'won',
	Rejected: 'lost',
	Disregard: 'lost',
	'': 'new'
};

const MEETING_STATUS_TO_OUTCOME: Record<string, string> = {
	Met: 'completed',
	Postponed: 'rescheduled',
	Cancelled: 'cancelled',
	'Not started': 'scheduled',
	'': 'scheduled'
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Normalize handle for dedup (strip non-alnum, lowercase). */
export function normalizeHandle(s: string): string {
	return s
		.toLowerCase()
		.replace(/https?:\/\/[^\s]*/g, '')
		.replace(/[^a-z0-9]/g, '')
		.trim();
}

/** Return true if the string looks like an HTTP URL. */
function isUrl(s: string): boolean {
	return /^https?:\/\//i.test(s.trim());
}

/** Classify a URL into 'facebook' | 'instagram' | 'other'. */
function urlPlatform(url: string): 'facebook' | 'instagram' | 'other' {
	if (/facebook\.com|fb\.com/i.test(url)) return 'facebook';
	if (/instagram\.com/i.test(url)) return 'instagram';
	return 'other';
}

/** Map spreadsheet category to a valid CRM category. */
export function mapCategory(raw: string): string {
	const trimmed = raw.trim();
	if (CRM_CATEGORIES.has(trimmed)) return trimmed;
	return CATEGORY_MAP[trimmed] ?? 'Other';
}

/** Normalize platform value ('facebook' → 'Facebook', etc.). */
export function normalizePlatform(raw: string): string | null {
	const p = raw.trim().toLowerCase();
	if (p === 'facebook') return 'Facebook';
	if (p === 'instagram') return 'Instagram';
	if (p === 'twitter/x') return 'Twitter/X';
	if (p === 'tiktok') return 'TikTok';
	return null;
}

/**
 * Parse a loose date string from the sheet into ISO YYYY-MM-DD.
 * Handles: "March 7, 2026", "August 13-15, 2026", "August 29–30, 2026",
 *           "M/D/YYYY", "4/10/2026 0:00:00". Returns null if unparseable.
 */
export function parseDate(raw: string): string | null {
	if (!raw || !raw.trim()) return null;
	const s = raw.trim();

	// Timestamp "4/10/2026 0:00:00" → take date part only
	const tsMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (tsMatch) {
		const [, m, d, y] = tsMatch;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}

	// "Month D, YYYY" or "Month D-D, YYYY" or "Month D–D, YYYY"
	const longMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:[–\-]\d{1,2})?,?\s+(\d{4})/);
	if (longMatch) {
		const [, mon, d, y] = longMatch;
		const monthNum = new Date(`${mon} 1, 2000`).getMonth() + 1;
		if (!isNaN(monthNum)) {
			return `${y}-${String(monthNum).padStart(2, '0')}-${d.padStart(2, '0')}`;
		}
	}

	return null;
}

/** First-name extract for fuzzy rep matching ("Jonnavien Grace Asuelo" → "jonnavien"). */
function firstName(name: string): string {
	return name.trim().split(/\s+/)[0].toLowerCase();
}

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields with embedded commas/newlines)
// ---------------------------------------------------------------------------
function parseCsv(content: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		const next = content[i + 1];

		if (ch === '"') {
			if (inQuotes && next === '"') {
				field += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes) {
			row.push(field);
			field = '';
		} else if ((ch === '\r' || ch === '\n') && !inQuotes) {
			if (ch === '\r' && next === '\n') i++;
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
		} else {
			field += ch;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
export type LeadRow = {
	name: string;
	category: string;
	location: string | null;
	platform: string | null;
	pageUrl: string | null;
	socialFacebook: string | null;
	socialInstagram: string | null;
	eventName: string | null;
	eventLink: string | null;
	eventDateRaw: string | null;
	eventDate: string | null;
	firstReachedOutDate: string | null;
	stage: string;
	notes: string | null;
	repNameRaw: string | null; // "Elay", "Divine", etc — resolved to ownerId at load time
	normalizedHandle: string;
	source: 'sheet_import';
	// derived for reporting
	statusRaw: string;
	categoryRaw: string;
	rowNum: string;
};

export type MeetingRow = {
	clientNameRaw: string; // matched to lead.name at load time
	attendeeNameRaw: string;
	startAt: Date | null;
	outcome: string;
	notes: string | null;
	categoryHint: string | null;
};

// ---------------------------------------------------------------------------
// Parse Events.csv → LeadRow[]
// ---------------------------------------------------------------------------
export function parseEvents(content: string): { leads: LeadRow[]; skipped: number } {
	const all = parseCsv(content);
	// Row 0 = headers, Row 1 = instruction text, Row 2 = first section date row
	// Data rows: col[0] is a numeric string
	const leads: LeadRow[] = [];
	let skipped = 0;

	for (const row of all) {
		const idx = row[0]?.trim() ?? '';
		if (!idx || !/^\d+$/.test(idx)) {
			skipped++;
			continue;
		}

		const pageNameRaw = (row[E.PAGE_NAME] ?? '').trim();
		const linkRaw = (row[E.LINK] ?? '').trim();
		const eventNameRaw = (row[E.EVENT] ?? '').trim();

		// Determine name, socialFacebook, socialInstagram, pageUrl from Page Name + Link
		let name = pageNameRaw;
		let socialFacebook: string | null = null;
		let socialInstagram: string | null = null;
		let pageUrl: string | null = null;
		let eventLink: string | null = null;

		if (isUrl(pageNameRaw)) {
			const type = urlPlatform(pageNameRaw);
			if (type === 'instagram') socialInstagram = pageNameRaw;
			else if (type === 'facebook') socialFacebook = pageNameRaw;
			else pageUrl = pageNameRaw;
			// Fall back name to eventName; if that's also empty, use the domain
			name = eventNameRaw || new URL(pageNameRaw).hostname.replace(/^www\./, '');
		}

		if (!name) {
			name = eventNameRaw || `Row ${idx}`;
		}

		if (isUrl(linkRaw)) {
			const type = urlPlatform(linkRaw);
			if (type === 'facebook' && !socialFacebook) socialFacebook = linkRaw;
			else if (type === 'instagram' && !socialInstagram) socialInstagram = linkRaw;
			else eventLink = linkRaw;
			// If it looks like an event post rather than an organizer page, keep as eventLink
			if (/share|photo|story|posts|video|permalink/i.test(linkRaw)) {
				eventLink = linkRaw;
				// Don't override the social field already set above
				if (type === 'facebook' && socialFacebook === linkRaw) socialFacebook = null;
				if (type === 'instagram' && socialInstagram === linkRaw) socialInstagram = null;
			}
		}

		const categoryRaw = (row[E.CATEGORY] ?? '').trim();
		const statusRaw = (row[E.STATUS] ?? '').trim();
		const platformRaw = (row[E.PLATFORM] ?? '').trim();
		const eventDateRaw = (row[E.EVENT_DATE] ?? '').trim() || null;
		const reachedOutDateRaw = (row[E.DATE_REACHED_OUT] ?? '').trim();
		const location = (row[E.LOCATION] ?? '').trim() || null;
		const notes = (row[E.NOTES] ?? '').trim() || null;
		const repNameRaw = (row[E.REACHED_OUT_BY] ?? '').trim() || null;

		leads.push({
			rowNum: idx,
			name,
			category: mapCategory(categoryRaw),
			categoryRaw,
			location,
			platform: normalizePlatform(platformRaw),
			pageUrl,
			socialFacebook,
			socialInstagram,
			eventName: eventNameRaw || null,
			eventLink,
			eventDateRaw,
			eventDate: parseDate(eventDateRaw ?? ''),
			firstReachedOutDate: parseDate(reachedOutDateRaw),
			stage: STATUS_TO_STAGE[statusRaw] ?? 'new',
			statusRaw,
			notes,
			repNameRaw,
			normalizedHandle: normalizeHandle(name),
			source: 'sheet_import'
		});
	}

	return { leads, skipped };
}

// ---------------------------------------------------------------------------
// Parse Meeting.csv → MeetingRow[]
// ---------------------------------------------------------------------------
export function parseMeetings(content: string): MeetingRow[] {
	const all = parseCsv(content);
	const rows: MeetingRow[] = [];

	for (let i = 1; i < all.length; i++) {
		const row = all[i];
		if (!row || !row[M.CLIENT]?.trim()) continue;

		const dateStr = (row[M.DATE] ?? '').trim();
		const timeStr = (row[M.TIME] ?? '').trim();
		const statusRaw = (row[M.STATUS] ?? '').trim();

		// Combine date + time → JS Date in PH timezone (+08:00)
		let startAt: Date | null = null;
		const isoDate = parseDate(dateStr);
		if (isoDate) {
			const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
			if (timeMatch) {
				let [, hh, mm] = timeMatch;
				const ampm = timeMatch[4]?.toUpperCase();
				let h = parseInt(hh, 10);
				const m = parseInt(mm, 10);
				if (ampm === 'PM' && h !== 12) h += 12;
				if (ampm === 'AM' && h === 12) h = 0;
				// Build as UTC offset +08:00 (Philippine time)
				const dtStr = `${isoDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`;
				startAt = new Date(dtStr);
			} else {
				// No time — use noon PH time as sentinel
				startAt = new Date(`${isoDate}T12:00:00+08:00`);
			}
		}

		rows.push({
			clientNameRaw: row[M.CLIENT].trim(),
			attendeeNameRaw: (row[M.ATTENDEE] ?? '').trim(),
			startAt,
			outcome: MEETING_STATUS_TO_OUTCOME[statusRaw] ?? 'scheduled',
			notes: (row[M.NOTES] ?? '').trim() || null,
			categoryHint: (row[M.DESCRIPTION] ?? '').trim() || null
		});
	}

	return rows;
}

// ---------------------------------------------------------------------------
// Dry-run report
// ---------------------------------------------------------------------------
function dryRun(leads: LeadRow[], meetings: MeetingRow[]): void {
	console.log(`\n=== LEADS (Events.csv) — ${leads.length} rows ===\n`);

	const stageCounts: Record<string, number> = {};
	const catCounts: Record<string, number> = {};
	const unmappedCats = new Set<string>();
	let noName = 0;
	let hasDate = 0;
	let hasReachedOutDate = 0;

	for (const l of leads) {
		stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;
		catCounts[l.category] = (catCounts[l.category] ?? 0) + 1;
		if (!CRM_CATEGORIES.has(l.categoryRaw)) unmappedCats.add(l.categoryRaw);
		if (l.name.startsWith('Row ')) noName++;
		if (l.eventDate) hasDate++;
		if (l.firstReachedOutDate) hasReachedOutDate++;
	}

	console.log('Stage distribution:');
	for (const [s, n] of Object.entries(stageCounts).sort()) {
		console.log(`  ${s.padEnd(15)} ${n}`);
	}

	console.log('\nCategory distribution (top 10):');
	for (const [c, n] of Object.entries(catCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)) {
		console.log(`  ${c.padEnd(20)} ${n}`);
	}

	if (unmappedCats.size) {
		console.log('\nCategories mapped to "Other":');
		for (const c of unmappedCats) console.log(`  "${c}"`);
	}

	console.log(`\nRows with parsed event date:        ${hasDate}/${leads.length}`);
	console.log(`Rows with first-reached-out date:   ${hasReachedOutDate}/${leads.length}`);
	if (noName) console.log(`Rows with no extractable name:      ${noName} (will use "Row N")`);

	// Sample first 5
	console.log('\nFirst 5 lead rows:');
	console.table(
		leads.slice(0, 5).map((l) => ({
			row: l.rowNum,
			name: l.name.slice(0, 30),
			category: l.category,
			stage: l.stage,
			eventDate: l.eventDate ?? '—',
			platform: l.platform ?? '—'
		}))
	);

	console.log(`\n=== MEETINGS (Meeting.csv) — ${meetings.length} rows ===\n`);
	const outcomeCounts: Record<string, number> = {};
	for (const m of meetings) {
		outcomeCounts[m.outcome] = (outcomeCounts[m.outcome] ?? 0) + 1;
	}
	console.log('Outcome distribution:');
	for (const [o, n] of Object.entries(outcomeCounts)) {
		console.log(`  ${o.padEnd(15)} ${n}`);
	}

	console.log('\nMeetings sample:');
	console.table(
		meetings.slice(0, 5).map((m) => ({
			client: m.clientNameRaw.slice(0, 25),
			attendee: m.attendeeNameRaw.slice(0, 20),
			startAt: m.startAt?.toISOString().slice(0, 16) ?? '—',
			outcome: m.outcome
		}))
	);

	console.log('\n(dry-run: no DB connection opened)');
}

// ---------------------------------------------------------------------------
// Load into DB
// ---------------------------------------------------------------------------
async function promptRepMapping(
	sheetNames: string[],
	users: { id: string; name: string }[]
): Promise<Map<string, string | null>> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const mapping = new Map<string, string | null>();

	console.log('\n── Rep name mapping ──────────────────────────────────────');
	console.log('The sheet uses these names. Pick which CRM user each one is.\n');

	for (let i = 0; i < users.length; i++) {
		console.log(`  ${i + 1}. ${users[i].name}`);
	}
	console.log('  0. Leave unassigned\n');

	for (const sheetName of sheetNames) {
		// Auto-resolve: try exact first-name match first
		const fn = firstName(sheetName);
		const autoMatch = users.find((u) => firstName(u.name) === fn);
		const hint = autoMatch ? ` [auto: ${autoMatch.name}]` : '';

		const answer = await rl.question(
			`"${sheetName}"${hint} → enter number (or press Enter to accept): `
		);
		const trimmed = answer.trim();

		if (trimmed === '' && autoMatch) {
			mapping.set(sheetName, autoMatch.id);
			console.log(`  ✓ mapped to ${autoMatch.name}`);
		} else if (trimmed === '0' || trimmed === '') {
			mapping.set(sheetName, null);
			console.log(`  – left unassigned`);
		} else {
			const idx = parseInt(trimmed, 10) - 1;
			if (idx >= 0 && idx < users.length) {
				mapping.set(sheetName, users[idx].id);
				console.log(`  ✓ mapped to ${users[idx].name}`);
			} else {
				console.log(`  ! invalid — left unassigned`);
				mapping.set(sheetName, null);
			}
		}
	}

	rl.close();
	console.log('──────────────────────────────────────────────────────────\n');
	return mapping;
}

async function loadToDb(leads: LeadRow[], meetings: MeetingRow[]): Promise<void> {
	const postgres = (await import('postgres')).default;
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const { eq, and, isNull } = await import('drizzle-orm');
	const schema = await import('../src/lib/server/db/schema.js');

	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required for --load');

	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });

	const { crmLeads, crmUsers, crmMeetings, crmMeetingAttendees } = schema;

	try {
		// --- 1. Load active users from DB ---
		process.stdout.write('Connecting to database... ');
		const users = await db
			.select({ id: crmUsers.id, name: crmUsers.name })
			.from(crmUsers)
			.where(eq(crmUsers.active, true));
		console.log(`done (${users.length} active users found)`);

		// --- 2. Collect distinct rep names from the CSV data ---
		const distinctSheetNames = [
			...new Set(
				[...leads.map((l) => l.repNameRaw), ...meetings.map((m) => m.attendeeNameRaw)].filter(
					(n): n is string => !!n
				)
			)
		].sort();

		// --- 3. Interactive mapping prompt ---
		const repMapping = await promptRepMapping(distinctSheetNames, users);

		function resolveRepId(nameRaw: string | null): string | null {
			if (!nameRaw) return null;
			return repMapping.get(nameRaw) ?? null;
		}

		// --- 4. Fetch existing sheet-import leads for idempotency ---
		process.stdout.write('Checking for existing sheet-import leads... ');
		const existingLeads = await db
			.select({ id: crmLeads.id, name: crmLeads.name, normalizedHandle: crmLeads.normalizedHandle })
			.from(crmLeads)
			.where(and(eq(crmLeads.source, 'sheet_import'), isNull(crmLeads.deletedAt)));

		const existingByHandle = new Map<string, string>();
		for (const l of existingLeads) {
			if (l.normalizedHandle) existingByHandle.set(l.normalizedHandle, l.id);
		}
		console.log(`${existingLeads.length} already in DB`);

		// --- 5. Insert leads ---
		console.log(`\nInserting leads (${leads.length} total)...`);
		let leadsInserted = 0;
		let leadsSkipped = 0;
		const importedLeadIds = new Map<string, string>();
		const PRINT_EVERY = 50;

		for (const l of leads) {
			if (existingByHandle.has(l.normalizedHandle)) {
				leadsSkipped++;
				importedLeadIds.set(l.normalizedHandle, existingByHandle.get(l.normalizedHandle)!);
				continue;
			}

			const [inserted] = await db
				.insert(crmLeads)
				.values({
					name: l.name,
					category: l.category as Parameters<typeof db.insert>[0] extends never ? never : string,
					location: l.location,
					platform: l.platform as string | null,
					pageUrl: l.pageUrl,
					socialFacebook: l.socialFacebook,
					socialInstagram: l.socialInstagram,
					eventName: l.eventName,
					eventLink: l.eventLink,
					eventDateRaw: l.eventDateRaw,
					eventDate: l.eventDate,
					firstReachedOutDate: l.firstReachedOutDate,
					stage: l.stage as Parameters<typeof db.insert>[0] extends never ? never : string,
					notes: l.notes,
					ownerId: resolveRepId(l.repNameRaw),
					normalizedHandle: l.normalizedHandle,
					source: 'sheet_import',
					visibility: 'everyone'
				} as typeof crmLeads.$inferInsert)
				.returning({ id: crmLeads.id });

			importedLeadIds.set(l.normalizedHandle, inserted.id);
			leadsInserted++;

			if (leadsInserted % PRINT_EVERY === 0) {
				console.log(`  ${leadsInserted}/${leads.length - leadsSkipped} inserted...`);
			}
		}

		console.log(
			`✓ Leads done: ${leadsInserted} inserted, ${leadsSkipped} skipped (already existed)`
		);

		// --- 4. Build name → lead id map for meeting cross-reference ---
		// Query all sheet_import leads (including pre-existing) for name matching
		const allSheetLeads = await db
			.select({ id: crmLeads.id, name: crmLeads.name })
			.from(crmLeads)
			.where(and(eq(crmLeads.source, 'sheet_import'), isNull(crmLeads.deletedAt)));

		const leadByName = new Map<string, string>(); // lowerName → id
		for (const l of allSheetLeads) {
			leadByName.set(l.name.toLowerCase().trim(), l.id);
		}

		// --- 5. Insert meetings ---
		console.log(`\nInserting meetings (${meetings.length} total)...`);
		let meetingsInserted = 0;
		let meetingsSkipped = 0;
		let meetingsUnmatched = 0;

		for (const m of meetings) {
			if (!m.startAt) {
				meetingsUnmatched++;
				console.warn(`  SKIP meeting "${m.clientNameRaw}" — unparseable date`);
				continue;
			}

			// Resolve lead
			const leadId = leadByName.get(m.clientNameRaw.toLowerCase().trim()) ?? null;
			if (!leadId) {
				meetingsUnmatched++;
				console.warn(`  SKIP meeting "${m.clientNameRaw}" — no matching lead found`);
				continue;
			}

			// Idempotency: check (leadId, startAt) already exists
			const existingMeeting = await db
				.select({ id: crmMeetings.id })
				.from(crmMeetings)
				.where(
					and(
						eq(crmMeetings.leadId, leadId),
						eq(crmMeetings.startAt, m.startAt),
						isNull(crmMeetings.deletedAt)
					)
				)
				.limit(1);

			if (existingMeeting.length) {
				meetingsSkipped++;
				continue;
			}

			const organizerId = resolveRepId(m.attendeeNameRaw);

			const [meeting] = await db
				.insert(crmMeetings)
				.values({
					leadId,
					organizerId,
					startAt: m.startAt,
					outcome: m.outcome,
					notes: m.notes
				} as typeof crmMeetings.$inferInsert)
				.returning({ id: crmMeetings.id });

			// Add attendee row
			if (organizerId) {
				await db
					.insert(crmMeetingAttendees)
					.values({
						meetingId: meeting.id,
						userId: organizerId
					} as typeof crmMeetingAttendees.$inferInsert)
					.onConflictDoNothing();
			}

			meetingsInserted++;
			console.log(
				`  [${meetingsInserted + meetingsSkipped}/${meetings.length}] ${m.clientNameRaw}`
			);
		}

		console.log(
			`✓ Meetings done: ${meetingsInserted} inserted, ${meetingsSkipped} skipped, ${meetingsUnmatched} unmatched`
		);
		console.log('\nImport complete.');
	} finally {
		await client.end();
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
type Args = {
	dryRun: boolean;
	load: boolean;
	eventsFile: string | undefined;
	meetingsFile: string | undefined;
};

function parseArgs(argv: string[]): Args {
	const valueOf = (flag: string) => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	return {
		dryRun: argv.includes('--dry-run'),
		load: argv.includes('--load'),
		eventsFile: valueOf('--events'),
		meetingsFile: valueOf('--meetings')
	};
}

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));

	if (!args.dryRun && !args.load) {
		console.error('Pass --dry-run or --load');
		process.exit(1);
	}
	if (args.dryRun && args.load) {
		console.error('--dry-run and --load are mutually exclusive');
		process.exit(1);
	}
	if (!args.eventsFile || !args.meetingsFile) {
		console.error(
			'Usage: bun scripts/import-sheet.ts [--dry-run|--load] --events <path> --meetings <path>'
		);
		process.exit(1);
	}

	const eventsContent = readFileSync(args.eventsFile, 'utf8');
	const meetingsContent = readFileSync(args.meetingsFile, 'utf8');

	const { leads, skipped } = parseEvents(eventsContent);
	const meetings = parseMeetings(meetingsContent);

	console.log(`Parsed ${leads.length} lead rows (${skipped} non-data rows skipped)`);
	console.log(`Parsed ${meetings.length} meeting rows`);

	if (args.dryRun) {
		dryRun(leads, meetings);
	} else {
		await loadToDb(leads, meetings);
	}
}
