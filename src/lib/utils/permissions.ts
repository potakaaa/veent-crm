/**
 * Permission helpers — pure functions over the current user + a lead.
 *
 * Product rules:
 *  - Reps see only leads that are theirs, `everyone`-visible, unowned, or explicitly
 *    granted to them (per-lead visibility scoping — GitHub #87; enforced at the query
 *    layer via visibilityCondition(), not here).
 *  - Reps can only EDIT leads they own.
 *  - Reps can CLAIM unassigned leads.
 *  - Managers can edit and reassign anything; managers access team management.
 */
import type { Lead, Role, User } from '$lib/types';

/**
 * Role-only helpers accept any object carrying a `role` (the app `User` OR the
 * lighter `SessionUser` from auth) so server endpoints can pass `locals.user`
 * directly without constructing a full `User`.
 */
type RoleBearer = { role: Role };

export const isSuperManager = (user: RoleBearer | null | undefined): boolean =>
	user?.role === 'super_manager';

/**
 * `isManager` intentionally includes super_manager: a super_manager holds every
 * power a manager holds (GitHub #73 AC — "all existing manager permissions also
 * apply to super_manager"), plus the singleton-only powers below. All manager
 * gates (canReassign / canAccessTeam / canManageUsers) cascade from here.
 */
export const isManager = (user: RoleBearer | null | undefined): boolean =>
	user?.role === 'manager' || user?.role === 'super_manager';

/** Only a super_manager may deactivate a manager (or another super_manager). */
export const canDeactivateManager = (actor: RoleBearer | null | undefined): boolean =>
	isSuperManager(actor);

/** Only the current super_manager may transfer the super_manager role. */
export const canPromoteToSuperManager = (actor: RoleBearer | null | undefined): boolean =>
	isSuperManager(actor);

export const canEditLead = (user: User | null | undefined, lead: Lead): boolean => {
	if (!user) return false;
	if (isManager(user)) return true;
	if (lead.ownerId === null) return true;
	return lead.ownerId === user.id;
};

/** Anyone can claim a lead that currently has no owner. */
export const canClaimLead = (user: User | null | undefined, lead: Lead): boolean =>
	!!user && lead.ownerId === null;

export const canReassign = (user: RoleBearer | null | undefined): boolean => isManager(user);

export const canAccessTeam = (user: RoleBearer | null | undefined): boolean => isManager(user);

export const canManageUsers = (user: RoleBearer | null | undefined): boolean => isManager(user);

/** Bulk claim is available to any signed-in user (over unassigned leads). */
export const canBulkClaim = (user: User | null | undefined): boolean => !!user;
