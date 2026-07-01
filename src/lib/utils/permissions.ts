/**
 * Permission helpers — pure functions over the current user + a lead.
 *
 * Product rules:
 *  - Reps can SEE all leads.
 *  - Reps can only EDIT leads they own.
 *  - Reps can CLAIM unassigned leads.
 *  - Managers can edit and reassign anything; managers access team management.
 */
import type { Lead, User } from '$lib/types';

export const isManager = (user: User | null | undefined): boolean => user?.role === 'manager';

export const canEditLead = (user: User | null | undefined, lead: Lead): boolean => {
	if (!user) return false;
	if (isManager(user)) return true;
	if (lead.ownerId === null) return true;
	return lead.ownerId === user.id;
};

/** Anyone can claim a lead that currently has no owner. */
export const canClaimLead = (user: User | null | undefined, lead: Lead): boolean =>
	!!user && lead.ownerId === null;

export const canReassign = (user: User | null | undefined): boolean => isManager(user);

export const canAccessTeam = (user: User | null | undefined): boolean => isManager(user);

export const canManageUsers = (user: User | null | undefined): boolean => isManager(user);

/** Bulk claim is available to any signed-in user (over unassigned leads). */
export const canBulkClaim = (user: User | null | undefined): boolean => !!user;
