/**
 * Unit tests for buildOrganizerTagPatch (organizer-lead-tagging-ui).
 *
 * Pure decision-logic tests — prove the correct PATCH body + optimistic patch are computed
 * for the tag / retag / clear paths (AC1 / AC2 / AC3). The fetch/rollback/toast wiring itself
 * (AC6) lives in the inline `+page.svelte` handler and is a documented Known-Gap — this repo
 * has no component-render harness (parity with the equally-untested `confirmReassign` path).
 */
import { describe, it, expect } from 'vitest';
import { buildOrganizerTagPatch } from '$lib/components/leads/organizer-tag';
import type { OrganizerWithCount } from '$lib/server/db/organizers';

const organizers: OrganizerWithCount[] = [
	{ id: 'org-a', name: 'Organizer A', normalizedHandle: '@orga', location: 'Manila', leadCount: 3 },
	{ id: 'org-b', name: 'Organizer B', normalizedHandle: '@orgb', location: null, leadCount: 0 }
];

describe('buildOrganizerTagPatch', () => {
	it('should build patch for tag path (no current organizer -> target organizer)', () => {
		const result = buildOrganizerTagPatch('org-a', organizers);
		expect(result).toEqual({
			body: { organizerId: 'org-a' },
			optimisticPatch: { organizerId: 'org-a', organizerName: 'Organizer A' }
		});
	});

	it("should build patch for retag path (current organizer A -> target organizer B, uses B's id)", () => {
		// The function is stateless — retag just means the target id differs from the current one.
		const result = buildOrganizerTagPatch('org-b', organizers);
		expect(result.body.organizerId).toBe('org-b');
		expect(result.optimisticPatch.organizerId).toBe('org-b');
		expect(result.optimisticPatch.organizerName).toBe('Organizer B');
	});

	it('should build patch for clear path (organizerId: null)', () => {
		const result = buildOrganizerTagPatch(null, organizers);
		expect(result).toEqual({
			body: { organizerId: null },
			optimisticPatch: { organizerId: null, organizerName: undefined }
		});
	});

	it('leaves organizerName undefined when the target id is not in the list', () => {
		const result = buildOrganizerTagPatch('org-missing', organizers);
		expect(result.body.organizerId).toBe('org-missing');
		expect(result.optimisticPatch.organizerName).toBeUndefined();
	});
});
