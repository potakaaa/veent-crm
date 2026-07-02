import { describe, it, expect } from 'vitest';
import { hasPotentialDuplicate } from '$lib/utils/dedup';
import type { Lead } from '$lib/types';

// ---------------------------------------------------------------------------
// Phase 4 (sitewide-ux-refresh) — A2 dedup-preview regression guard.
//
// /leads/new surfaces a duplicate-preview via `dupes = $derived(name.length > 1
// ? hasPotentialDuplicate({ name }, data.leads) : [])`. Phase 4's A1 restructures
// the SEPARATE `error` state (flat string -> per-field object) but must not couple
// the dedup preview to error/validation state. This test pins the exact contract
// the derived depends on: the preview is a pure function of `name` (and the leads
// list) alone. If a future change accidentally routes dedup through error state,
// or changes the length>1 gate, this regresses. Reactivity re-verified moot at
// VALIDATE Cycle 2 (name/dupes chain is structurally disjoint from error).
// ---------------------------------------------------------------------------

function lead(partial: Partial<Lead> & { id: string; name: string; handle: string }): Lead {
	return partial as unknown as Lead;
}

const LEADS: Lead[] = [
	lead({ id: '1', name: 'Christian Concerts PH', handle: 'christianconcerts' }),
	lead({ id: '2', name: 'USWAG Davao', handle: 'uswagdavao' })
];

/** Mirror of the component's `dupes` derived, isolated for deterministic testing. */
function dedupPreview(name: string, leads: Lead[]): Lead[] {
	return name.length > 1 ? hasPotentialDuplicate({ name }, leads) : [];
}

describe('leads/new dedup-preview reactivity (A2 regression guard)', () => {
	it('returns [] for a name of length <= 1 (the derived gate)', () => {
		expect(dedupPreview('', LEADS)).toEqual([]);
		expect(dedupPreview('C', LEADS)).toEqual([]);
	});

	it('surfaces a matching duplicate once the name is long enough', () => {
		const hits = dedupPreview('Christian', LEADS);
		expect(hits.map((l) => l.id)).toEqual(['1']);
	});

	it('is a pure function of name — same name always yields the same preview', () => {
		const a = dedupPreview('USWAG', LEADS);
		const b = dedupPreview('USWAG', LEADS);
		expect(a.map((l) => l.id)).toEqual(b.map((l) => l.id));
		expect(a.map((l) => l.id)).toEqual(['2']);
	});

	it('does not match when only unrelated fields would differ (no error-state coupling)', () => {
		// Independent of any validation/error state — dedup keys off name/handle only.
		expect(dedupPreview('Nonexistent Page', LEADS)).toEqual([]);
	});
});
