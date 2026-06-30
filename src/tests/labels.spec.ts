import { describe, it, expect } from 'vitest';
import { LEAD_STAGES, USER_ROLES, LEAD_SOURCES } from '$lib/zod/schemas';
import { stageLabel } from '$lib/utils/stages';
import { roleLabel, statusLabel } from '$lib/utils/roles';
import { sourceLabel } from '$lib/utils/sources';

// Enum-coverage regression tests: every enum member must map to a humanized,
// non-empty label that is NOT identical to the raw member. This locks in full
// coverage so a future enum addition cannot silently re-introduce a raw label.

describe('label humanization coverage', () => {
	it('every LEAD_STAGES member humanizes via stageLabel', () => {
		for (const stage of LEAD_STAGES) {
			const label = stageLabel(stage);
			expect(label).toBeTruthy();
			expect(label).not.toBe(stage);
		}
	});

	it('every USER_ROLES member humanizes via roleLabel', () => {
		for (const role of USER_ROLES) {
			const label = roleLabel(role);
			expect(label).toBeTruthy();
			expect(label).not.toBe(role);
		}
	});

	it('every LEAD_SOURCES member humanizes via sourceLabel', () => {
		for (const source of LEAD_SOURCES) {
			const meta = sourceLabel(source);
			expect(meta.label).toBeTruthy();
			expect(meta.label).not.toBe(source);
			expect(meta.class).toBeTruthy();
		}
	});

	it('statusLabel maps boolean to Active/Inactive', () => {
		expect(statusLabel(true)).toBe('Active');
		expect(statusLabel(false)).toBe('Inactive');
	});
});
