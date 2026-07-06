import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// unified-filter-components — import-consolidation guards (AC1/AC3/AC6/AC7/AC8).
//
// Source-text assertions only: they prove the shared components replaced the
// duplicated implementations at each call site. They do NOT prove rendered
// behavior (no component-render harness in this repo — see plan Known-Gap).
// ---------------------------------------------------------------------------

const root = fileURLToPath(new URL('../routes/', import.meta.url));
const read = (rel: string) => readFileSync(root + rel, 'utf8');

const unassigned = read('unassigned/+page.svelte');
const leads = read('leads/+page.svelte');
const reports = read('reports/+page.svelte');
const reminders = read('reminders/+page.svelte');

describe('AC1 — one shared SearchInput on every page that has a text search box', () => {
	it('Up for Grabs and My Leads import SearchInput from the single shared path', () => {
		// These are the only two in-scope pages with a free-text search input.
		for (const src of [unassigned, leads]) {
			expect(src).toContain('$lib/components/ui/search-input');
		}
	});

	it('Reports has no text search box, so it must not import SearchInput (date + rep filters only)', () => {
		expect(reports).not.toContain('$lib/components/ui/search-input');
	});

	it('Reminders keeps its own CommandInput search-as-you-type (restyle-only, out of the SearchInput fold-in)', () => {
		// AC7: Reminders is explicitly NOT migrated to SearchInput — it uses Command.
		expect(reminders).toContain('$lib/components/ui/command');
	});
});

describe('AC3 — FilterDropdown replaces MultiSelectFilter + raw Select', () => {
	it('Up for Grabs imports FilterDropdown, not MultiSelectFilter', () => {
		expect(unassigned).toContain('$lib/components/ui/filter-dropdown');
		expect(unassigned).not.toContain('MultiSelectFilter');
	});

	it('My Leads imports FilterDropdown and no longer uses shadcn Select for list filters', () => {
		expect(leads).toContain('$lib/components/ui/filter-dropdown');
		expect(leads).not.toContain("from '$lib/components/ui/select'");
	});

	it('My Leads passes multiple={false} explicitly at every FilterDropdown call site', () => {
		const calls = leads.match(/multiple=\{false\}/g) ?? [];
		// Stage + Platform + Country = 3 explicit single-select call sites.
		expect(calls.length).toBe(3);
	});
});

describe('AC6 — one shared WeekRangeControl', () => {
	it('Up for Grabs and My Leads import WeekRangeControl', () => {
		expect(unassigned).toContain('$lib/components/ui/week-range-control');
		expect(leads).toContain('$lib/components/ui/week-range-control');
	});
});

describe('AC8 — Reports adopts shared components; date inputs untouched', () => {
	it('Reports imports FilterDropdown for the rep filter', () => {
		expect(reports).toContain('$lib/components/ui/filter-dropdown');
	});

	it('Reports keeps both native <input type="date"> elements', () => {
		const dateInputs = reports.match(/type="date"/g) ?? [];
		expect(dateInputs.length).toBe(2);
	});
});
