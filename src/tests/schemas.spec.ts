import { describe, it, expect } from 'vitest';
import { leadFormSchema, ingestBatchSchema, LEAD_STAGES } from '$lib/zod/schemas';

// Placeholder unit tests — prove the Zod validators (which double as import/ingest validators) load.
describe('zod schemas (stub)', () => {
	it('accepts a minimal valid lead', () => {
		const r = leadFormSchema.safeParse({ name: 'USWAG Davao' });
		expect(r.success).toBe(true);
	});

	it('rejects a lead with no name', () => {
		const r = leadFormSchema.safeParse({ name: '' });
		expect(r.success).toBe(false);
	});

	it('validates an ingest batch', () => {
		const r = ingestBatchSchema.safeParse({ leads: [{ pageName: 'Some Page' }] });
		expect(r.success).toBe(true);
	});

	it('has the six pipeline stages', () => {
		expect(LEAD_STAGES).toContain('in_discussion');
		expect(LEAD_STAGES.length).toBe(6);
	});
});
