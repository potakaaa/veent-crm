import type { OrganizerWithCount } from '$lib/server/db/organizers';

/**
 * [VALIDATE fix — P2] Pure, unit-testable decision logic for tagging / retagging / clearing
 * a lead's organizer. Extracted out of the inline `+page.svelte` handler so the "what body to
 * send + what to optimistically show" decision can be tested without a component-render harness
 * (this repo has none). Does NOT own the async fetch/rollback/toast wiring — that stays in
 * `confirmOrganizerTag`, mirroring the pre-existing `confirmReassign` pattern.
 */
export function buildOrganizerTagPatch(
	organizerId: string | null,
	organizers: OrganizerWithCount[]
): {
	body: { organizerId: string | null };
	optimisticPatch: { organizerId: string | null; organizerName: string | undefined };
} {
	const tagged = organizerId ? organizers.find((o) => o.id === organizerId) : undefined;
	return {
		body: { organizerId },
		optimisticPatch: { organizerId, organizerName: tagged?.name }
	};
}
