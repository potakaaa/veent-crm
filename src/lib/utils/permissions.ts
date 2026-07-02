/**
 * Permission helpers — pure functions over the current user + a lead.
 *
 * Product rules:
 *  - Reps see only leads that are theirs, `everyone`-visible, unowned, or explicitly
 *    granted to them (per-lead visibility scoping — GitHub #87; enforced at the query
 *    layer via visibilityCondition(), not here).
 *  - Reps can only EDIT leads they own.
 *  - Reps can CLAIM unassigned leads.
 *  - Managers and super_managers can edit and reassign anything; they access team management.
 *    Use isManagerRole() for raw role-string checks (e.g. in API routes / DB layer).
 */
import type { Lead, User } from '$lib/types';

/** True for both 'manager' and 'super_manager'. Prefer this over raw role string comparisons. */
export const isManagerRole = (role: string | null | undefined): boolean =>
	role === 'manager' || role === 'super_manager';

export const isManager = (user: User | null | undefined): boolean => isManagerRole(user?.role);

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
