import type { User } from '$lib/types';

/**
 * Resolve an owner user id to that user's display name.
 *
 * Shared helper consolidating the `ownerNameFor` logic that was independently
 * duplicated in `leads/new/+page.svelte` and `unassigned/+page.svelte`
 * (Phase 2 — sitewide-ux-refresh, Step C2). Returns `null` when the id is null
 * or the user is not found so callers can render an empty state.
 */
export function ownerNameFor(
	users: Pick<User, 'id' | 'name'>[],
	ownerId: string | null | undefined
): string | null {
	return ownerId ? (users.find((u) => u.id === ownerId)?.name ?? null) : null;
}
