#!/usr/bin/env bun
// One-time seed migration for the 9 legacy static outreach snippets into the DB-backed
// `crm_message_templates` table (plan: outreach-templates, Phase 3 / D5).
//
// The legacy client-side snippet library (`src/lib/data/templates.ts`) is being retired in
// Phase 4. Its 9 bodies are INLINED here so this script stays runnable after that removal.
// Each legacy entry is mapped to a `crm_message_templates` row:
//   - tokens rewritten: `{{page}}` -> `{{organizerName}}`, `{{event}}` -> `{{eventName}}`
//     (idempotent — already-migrated new-token bodies pass through unchanged)
//   - `category` defaults to 'Other' (the old intro/follow-up/pricing message-type taxonomy
//     does not map 1:1 into the 20-value crm_lead_category enum — a manager recategorizes later)
//   - `title` = the legacy `label`
//
// NO $lib imports — this runs under Bun outside SvelteKit, so the `$lib` alias does not resolve.
// The DB connection + schema are imported lazily (only under --load) so --dry-run opens NO DB
// connection. Insert is done directly against the pure `schema.ts` table def (mirrors
// scripts/import.ts), which is the accessor's underlying write — the accessor itself cannot be
// imported here because it pulls `$lib` type/validator modules.
//
// Idempotent: --load skips any legacy title that already exists as a non-deleted row.
//
// Usage:
//   bun run seed-templates --dry-run   # print the 9 mapped rows, opens NO DB connection
//   bun run seed-templates --load      # insert into the CRM DB (idempotent by title)

// --- Legacy source (inlined from the pre-Phase-4 src/lib/data/templates.ts) ----------------

/** A legacy static snippet entry (old client-side shape). */
export type LegacyEntry = { label: string; body: string };

/**
 * The 9 legacy snippet bodies, inlined verbatim from the current
 * `src/lib/data/templates.ts` static `TEMPLATES` array (Phase-1 already renamed the tokens to
 * the new `{{organizerName}}`/`{{eventName}}` shape; older `{{page}}`/`{{event}}` inputs are
 * still handled by `rewriteTokens` below so the migration is robust to token vintage).
 */
export const LEGACY_ENTRIES: LegacyEntry[] = [
	{
		label: 'Warm intro',
		body: "Hi! Following up from {{organizerName}} — saw you're organizing {{eventName}} and wanted to introduce our services."
	},
	{
		label: 'Referral opener',
		body: 'Hey! Came across {{organizerName}} while looking into {{eventName}}. Would love to share how we can help.'
	},
	{
		label: 'Short hello',
		body: 'Hi from Veent! Noticed {{organizerName}} is behind {{eventName}} — mind if I share a quick overview?'
	},
	{
		label: 'Gentle check-in',
		body: 'Hey, just checking in on {{eventName}} for {{organizerName}} — any updates on your end?'
	},
	{
		label: 'Nudge after silence',
		body: 'Circling back on {{eventName}} — happy to answer any questions {{organizerName}} still has.'
	},
	{
		label: 'Last touch',
		body: 'Wanted to close the loop on {{eventName}} for {{organizerName}}. Should I follow up later or is now a good time?'
	},
	{
		label: 'Pricing breakdown',
		body: "Here's our pricing breakdown for {{eventName}}. Let me know if you'd like a custom quote for {{organizerName}}."
	},
	{
		label: 'Custom quote offer',
		body: 'For {{eventName}}, I can put together a tailored quote for {{organizerName}} — what package size are you thinking?'
	},
	{
		label: 'Discount nudge',
		body: 'Booking {{eventName}} early for {{organizerName}} unlocks our best rate — want me to send the details?'
	}
];

// --- Pure mapping (unit-tested, no DB) -----------------------------------------------------

/** The default category for every seeded legacy row (see file header / plan D5). */
export const SEED_CATEGORY = 'Other' as const;

/** A `crm_message_templates` seed row (matches the table's insertable columns). */
export type SeedRow = { category: typeof SEED_CATEGORY; title: string; body: string };

/**
 * Pure token rewrite: legacy `{{page}}`/`{{event}}` tokens -> the new
 * `{{organizerName}}`/`{{eventName}}` tokens. Idempotent — bodies already using the new tokens
 * pass through unchanged. Never throws.
 */
export function rewriteTokens(body: string): string {
	return body.replaceAll('{{page}}', '{{organizerName}}').replaceAll('{{event}}', '{{eventName}}');
}

/** Pure map of one legacy entry to a seed row (token-rewritten, category 'Other', title=label). */
export function legacyToSeedRow(entry: LegacyEntry): SeedRow {
	return {
		category: SEED_CATEGORY,
		title: entry.label,
		body: rewriteTokens(entry.body)
	};
}

/** Build all seed rows from the inlined legacy entries. Pure, no DB. */
export function buildSeedRows(entries: LegacyEntry[] = LEGACY_ENTRIES): SeedRow[] {
	return entries.map(legacyToSeedRow);
}

// --- CLI ------------------------------------------------------------------------------------

type Args = { dryRun: boolean; load: boolean };

export function parseArgs(argv: string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		load: argv.includes('--load')
	};
}

// --- Load (lazy DB — mirrors scripts/import.ts) --------------------------------------------

async function load(rows: SeedRow[]): Promise<void> {
	// Lazy imports so --dry-run never touches the DB layer or the $lib-free schema module.
	const postgres = (await import('postgres')).default;
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const schema = await import('../src/lib/server/db/schema');

	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required for --load');

	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	const { crmMessageTemplates } = schema;

	let inserted = 0;
	let skippedExisting = 0;

	try {
		for (const row of rows) {
			// Idempotency guard: atomic insert relying on the partial unique index
			// (crm_message_templates_title_active_uq). onConflictDoNothing skips an
			// existing non-deleted title without a separate SELECT round-trip.
			const result = await db
				.insert(crmMessageTemplates)
				.values({ category: row.category, title: row.title, body: row.body })
				.onConflictDoNothing()
				.returning({ id: crmMessageTemplates.id });
			if (result.length) inserted++;
			else skippedExisting++;
		}

		console.log('\n=== Seed result ===');
		console.table({
			inserted,
			skippedExisting,
			total: rows.length
		});
	} finally {
		await client.end();
	}
}

// --- Orchestration -------------------------------------------------------------------------

async function run(args: Args): Promise<SeedRow[]> {
	const rows = buildSeedRows();
	if (args.load) {
		await load(rows);
	}
	return rows;
}

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));
	run(args)
		.then((rows) => {
			console.log(`=== Mapped ${rows.length} legacy templates -> crm_message_templates rows ===`);
			console.table(
				rows.map((r) => ({
					category: r.category,
					title: r.title,
					body: r.body.length > 60 ? r.body.slice(0, 57) + '...' : r.body
				}))
			);
			if (!args.load) console.log('\n(dry-run: no DB connection opened)');
		})
		.catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
}

export { run };
export type { Args };
