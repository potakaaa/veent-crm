import { describe, it, expect } from 'vitest';
import { importPreviewRequestSchema, importCommitRequestSchema } from '$lib/zod/schemas';

describe('import request schemas — row cap (E4)', () => {
	it('rejects a preview rows array exceeding the 2000-row cap', () => {
		const rows = Array.from({ length: 2001 }, (_, i) => ({ name: `Org ${i}` }));
		const res = importPreviewRequestSchema.safeParse({ target: 'leads', rows });
		expect(res.success).toBe(false);
	});

	it('accepts exactly 2000 rows', () => {
		const rows = Array.from({ length: 2000 }, (_, i) => ({ name: `Org ${i}` }));
		const res = importPreviewRequestSchema.safeParse({ target: 'leads', rows });
		expect(res.success).toBe(true);
	});

	it('rejects a commit rows array exceeding the 2000-row cap', () => {
		const rows = Array.from({ length: 2001 }, (_, i) => ({
			data: { name: `Org ${i}` },
			skip: false
		}));
		const res = importCommitRequestSchema.safeParse({ target: 'organizers', rows });
		expect(res.success).toBe(false);
	});
});

describe('import request schemas — server re-validation is authoritative', () => {
	it('rejects a tampered preview payload with a missing required name', () => {
		const res = importPreviewRequestSchema.safeParse({
			target: 'leads',
			rows: [{ location: 'Manila' }]
		});
		expect(res.success).toBe(false);
	});

	it('rejects an unknown target discriminator', () => {
		const res = importPreviewRequestSchema.safeParse({ target: 'contacts', rows: [] });
		expect(res.success).toBe(false);
	});

	it('accepts a valid preview payload with extra mapped string fields', () => {
		const res = importPreviewRequestSchema.safeParse({
			target: 'leads',
			rows: [{ name: 'Acme', location: 'Manila', pageUrl: 'https://acme.test' }]
		});
		expect(res.success).toBe(true);
	});
});
