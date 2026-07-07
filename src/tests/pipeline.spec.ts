/**
 * Unit tests for Phase 5 — pipeline schema validators and stage grouping logic.
 * Pure-function tests only (no DB required).
 */
import { describe, it, expect } from 'vitest';
import { moveStageSchema, ownerUpdateSchema } from '$lib/zod/schemas';
import { BOARD_STAGES } from '$lib/utils/stages';
import { resolvePipelineRepFilter } from '$lib/server/db/leads';

// ---------------------------------------------------------------------------
// moveStageSchema — server-side validation for PATCH /api/leads/[id]/stage
// ---------------------------------------------------------------------------

describe('moveStageSchema (stage transition validator)', () => {
	it('accepts a regular pipeline stage', () => {
		for (const stage of ['new', 'contacted', 'replied', 'in_discussion']) {
			const r = moveStageSchema.safeParse({ stage });
			expect(r.success, `stage=${stage}`).toBe(true);
		}
	});

	it('accepts won with all optional fields', () => {
		const r = moveStageSchema.safeParse({
			stage: 'won',
			wonOrgName: 'USWAG Events Inc.',
			dealValueCents: 8500000,
			currency: 'PHP',
			signedAt: '2026-06-29'
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.stage).toBe('won');
		}
	});

	it('accepts won without optional won fields', () => {
		const r = moveStageSchema.safeParse({ stage: 'won' });
		expect(r.success).toBe(true);
	});

	it('accepts lost with a valid reason', () => {
		for (const lostReason of ['no_response', 'rejected', 'not_a_fit']) {
			const r = moveStageSchema.safeParse({ stage: 'lost', lostReason });
			expect(r.success, `lostReason=${lostReason}`).toBe(true);
		}
	});

	it('rejects lost without a reason', () => {
		const r = moveStageSchema.safeParse({ stage: 'lost' });
		expect(r.success).toBe(false);
	});

	it('rejects lost with an invalid reason', () => {
		const r = moveStageSchema.safeParse({ stage: 'lost', lostReason: 'bad_reason' });
		expect(r.success).toBe(false);
	});

	it('rejects an invalid stage value', () => {
		const r = moveStageSchema.safeParse({ stage: 'funnel' });
		expect(r.success).toBe(false);
	});

	it('rejects a missing stage field', () => {
		const r = moveStageSchema.safeParse({});
		expect(r.success).toBe(false);
	});

	it('rejects a negative dealValueCents for won', () => {
		const r = moveStageSchema.safeParse({ stage: 'won', dealValueCents: -100 });
		expect(r.success).toBe(false);
	});

	it('defaults currency to PHP when not supplied for won', () => {
		const r = moveStageSchema.safeParse({ stage: 'won' });
		expect(r.success).toBe(true);
		if (r.success && r.data.stage === 'won') {
			expect(r.data.currency).toBe('PHP');
		}
	});
});

// ---------------------------------------------------------------------------
// ownerUpdateSchema — server-side validation for PATCH /api/leads/[id]/owner
// ---------------------------------------------------------------------------

describe('ownerUpdateSchema (owner reassignment validator)', () => {
	it('accepts a valid UUID', () => {
		const r = ownerUpdateSchema.safeParse({ ownerId: '00000000-0000-0000-0000-000000000001' });
		expect(r.success).toBe(true);
	});

	it('rejects a non-UUID string', () => {
		const r = ownerUpdateSchema.safeParse({ ownerId: 'not-a-uuid' });
		expect(r.success).toBe(false);
	});

	it('rejects a missing ownerId', () => {
		const r = ownerUpdateSchema.safeParse({});
		expect(r.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Pipeline board stage grouping (BOARD_STAGES constant)
// ---------------------------------------------------------------------------

describe('BOARD_STAGES (pipeline column order)', () => {
	it('matches the expected ordered columns (new → contacted → replied → in_discussion → won → live)', () => {
		expect(BOARD_STAGES).toEqual(['new', 'contacted', 'replied', 'in_discussion', 'won', 'live']);
	});
});

describe('moveStageSchema — live stage (GitHub #194)', () => {
	it('accepts the live stage', () => {
		const r = moveStageSchema.safeParse({ stage: 'live' });
		expect(r.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// resolvePipelineRepFilter — manager-only AE-filter trust-boundary DECISION (PIPE-4, AC1/AC4)
// Pure function: which owner id (if any) the `?rep=` param resolves to per role/input.
// ---------------------------------------------------------------------------

describe('resolvePipelineRepFilter', () => {
	const REP_ID = '00000000-0000-0000-0000-0000000000aa';
	const OTHER_REP_ID = '00000000-0000-0000-0000-0000000000bb';
	const MANAGER_ID = '00000000-0000-0000-0000-0000000000cc';

	it('(a) manager + valid UUID → that UUID', () => {
		expect(resolvePipelineRepFilter('manager', REP_ID)).toBe(REP_ID);
	});

	it('(b) manager + own UUID → own UUID ("Mine")', () => {
		expect(resolvePipelineRepFilter('manager', MANAGER_ID)).toBe(MANAGER_ID);
	});

	it('(c) manager + malformed string → undefined', () => {
		expect(resolvePipelineRepFilter('manager', 'not-a-uuid')).toBeUndefined();
	});

	it('(d) rep + valid UUID → undefined (trust boundary — a rep can never filter)', () => {
		expect(resolvePipelineRepFilter('rep', OTHER_REP_ID)).toBeUndefined();
	});

	it('(e) no param → undefined', () => {
		expect(resolvePipelineRepFilter('manager', null)).toBeUndefined();
		expect(resolvePipelineRepFilter('manager', undefined)).toBeUndefined();
	});

	it('(f) super_manager + valid UUID → that UUID', () => {
		expect(resolvePipelineRepFilter('super_manager', REP_ID)).toBe(REP_ID);
	});
});
