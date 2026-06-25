#!/usr/bin/env bun
// One-time TSV importer — SHELL/STUB for v0. See sales-crm.md §Migration.
//
// This is the pipeline skeleton only; the transforms are TODOs. Running it with --dry-run prints
// a reconciliation report shape (no DB writes). It touches NO Veent system — local TSV in, CRM DB out.
//
// Usage:
//   bun run scripts/import.ts --file ~/Downloads/Copy\ of\ Centralized\ List\ of\ Events\ -\ Events.tsv --dry-run
//   bun run scripts/import.ts --file <tsv> --load        (production: single load into empty tables)
//
// Pipeline (see spec §Migration steps 1–9):
//   1. Extract & snapshot   2. Filter dividers/banner/legend   3. Layout-detect (standard vs -2 offset)
//   4. Normalize (unicode hygiene + normalized_handle)   5. Build leads (collapse exact page+event dupes)
//   6. Map & assign (status->stage, owner = Added By -> Reached Out By if active, else unassigned)
//   7. Dry-run reconciliation report   8. Load   9. Verify

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

type ReconciliationReport = {
	rowsRead: number;
	leadsCreated: number;
	exactDupCollapses: number;
	recoveredUnnumberedRows: number;
	unassignedPoolSize: number;
	perRepTotals: Record<string, number>;
	wonCount: number;
	needsReviewCount: number;
	categoryToOtherCount: number;
};

// TODO: implement the real transforms. Targets from the spec's definition of done.
async function run(args: Args): Promise<ReconciliationReport> {
	if (!args.file) throw new Error('--file <tsv> is required');

	// STUB report — numbers are the spec's expected targets, not measured values yet.
	const report: ReconciliationReport = {
		rowsRead: 0, // ~2,064 expected
		leadsCreated: 0, // ~2,032 expected
		exactDupCollapses: 0, // ~30 groups
		recoveredUnnumberedRows: 0, // ~79
		unassignedPoolSize: 0, // ~506
		perRepTotals: { Jonna: 0, Ethyl: 0, Meybelle: 0, Shane: 0, Elay: 0 },
		wonCount: 0, // exactly 3 (On Boarded)
		needsReviewCount: 0,
		categoryToOtherCount: 0 // ~450
	};

	if (args.load) {
		console.warn('[import] --load is a stub: no DB writes performed in v0.');
	}
	return report;
}

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));
	run(args)
		.then((report) => {
			console.log('=== Reconciliation report (STUB) ===');
			console.table(report);
			console.log('\nNOTE: transforms are not implemented yet — see scripts/import.ts TODOs.');
		})
		.catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
}

export { run, parseArgs };
export type { ReconciliationReport };
