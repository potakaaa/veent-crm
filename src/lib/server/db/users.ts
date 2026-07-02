/**
 * Server-side DB access for CRM users (the magic-link allowlist) plus the
 * super_manager role machinery (GitHub #73).
 *
 * Re-uses the `dbUserToUser` mapper from leads.ts — do NOT duplicate it.
 * All actor-permission checks live here (server-side, never trust the client).
 */
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { db } from './index';
import { crmUsers, crmLeads, crmLeadHistory, crmLeadVisibilityGrants } from './schema';
import { dbUserToUser } from './leads';
import { isManager, isSuperManager } from '$lib/utils/permissions';
import type { Role, User } from '$lib/types';

/**
 * Thrown when an actor is not allowed to perform a user-management action.
 * The API layer maps this to a 403. Distinct from the postgres `23505`
 * unique-violation path (mapped to 409 by the caller).
 */
export class PermissionError extends Error {
	constructor(message = 'Forbidden') {
		super(message);
		this.name = 'PermissionError';
	}
}

/**
 * Insert a new team member (rep or manager) into `crm_users`.
 * A duplicate email violates the `crm_users_email_uq` unique index and surfaces
 * as a postgres error with code `23505` — this is left to propagate so the
 * caller (POST /api/users) can map it to a 409.
 *
 * `super_manager` is accepted at the type level (Role) but is never created
 * directly through this path in practice — it is only reachable via
 * `promoteSuperManager`, which enforces the singleton invariant transactionally.
 */
export async function createUser(input: {
	name: string;
	email: string;
	role: Role;
}): Promise<User> {
	const [row] = await db
		.insert(crmUsers)
		.values({
			name: input.name,
			email: input.email,
			role: input.role
		})
		.returning();

	return dbUserToUser(row);
}

/** Load a single user row mapped to the app `User` shape, or null. */
async function loadUser(id: string): Promise<User | null> {
	const [row] = await db.select().from(crmUsers).where(eq(crmUsers.id, id)).limit(1);
	return row ? dbUserToUser(row) : null;
}

/**
 * Deactivate (soft-delete) a team member and move their workable leads back to
 * "Up for grabs". Replaces the old client-side mock reassign — the lead move now
 * happens server-side, atomically, in the same transaction as the deactivation.
 *
 * Permission rules (server-enforced):
 *  - actor must be a manager or super_manager (reps cannot deactivate anyone);
 *  - deactivating a manager/super_manager requires a super_manager actor;
 *  - a super_manager cannot deactivate themselves (must transfer the role first).
 */
export async function deactivateUser(actorId: string, targetId: string): Promise<User> {
	const [actor, target] = await Promise.all([loadUser(actorId), loadUser(targetId)]);
	if (!actor) throw new PermissionError('Unknown actor');
	if (!target) throw new PermissionError('Unknown target');

	if (!isManager(actor)) throw new PermissionError('Only managers can deactivate users');
	if ((target.role === 'manager' || target.role === 'super_manager') && !isSuperManager(actor)) {
		throw new PermissionError('Only a super manager can deactivate a manager');
	}
	if (isSuperManager(actor) && actorId === targetId) {
		throw new PermissionError('Transfer the super manager role before deactivating yourself');
	}

	const now = new Date();

	return db.transaction(async (tx) => {
		// Find the target's workable (non-won/non-lost, live) leads BEFORE nulling
		// so we can write accurate audit rows.
		const workable = await tx
			.select({ id: crmLeads.id })
			.from(crmLeads)
			.where(
				and(
					eq(crmLeads.ownerId, targetId),
					isNull(crmLeads.deletedAt),
					notInArray(crmLeads.stage, ['won', 'lost'])
				)
			);
		const leadIds = workable.map((l) => l.id);

		if (leadIds.length) {
			// Owner change resets visibility to `everyone` (mirrors reassignLead).
			await tx
				.update(crmLeads)
				.set({ ownerId: null, visibility: 'everyone', updatedAt: now })
				.where(inArray(crmLeads.id, leadIds));

			await tx
				.delete(crmLeadVisibilityGrants)
				.where(inArray(crmLeadVisibilityGrants.leadId, leadIds));

			await tx.insert(crmLeadHistory).values(
				leadIds.map((leadId) => ({
					leadId,
					actorUserId: actorId,
					field: 'owner_id',
					oldValue: targetId,
					newValue: null
				}))
			);
		}

		const [row] = await tx
			.update(crmUsers)
			.set({ active: false, updatedAt: now })
			.where(eq(crmUsers.id, targetId))
			.returning();

		return dbUserToUser(row);
	});
}

/**
 * Reactivate a previously-deactivated team member. Reactivating a
 * manager/super_manager row requires a super_manager actor (symmetric with
 * deactivation); reactivating a rep needs any manager.
 */
export async function reactivateUser(actorId: string, targetId: string): Promise<User> {
	const [actor, target] = await Promise.all([loadUser(actorId), loadUser(targetId)]);
	if (!actor) throw new PermissionError('Unknown actor');
	if (!target) throw new PermissionError('Unknown target');

	if (!isManager(actor)) throw new PermissionError('Only managers can reactivate users');
	if ((target.role === 'manager' || target.role === 'super_manager') && !isSuperManager(actor)) {
		throw new PermissionError('Only a super manager can reactivate a manager');
	}

	const [row] = await db
		.update(crmUsers)
		.set({ active: true, updatedAt: new Date() })
		.where(eq(crmUsers.id, targetId))
		.returning();

	return dbUserToUser(row);
}

/**
 * Change a member's role between `rep` and `manager`. Super_manager actor only.
 * Promotion TO super_manager must go through `promoteSuperManager` (which keeps
 * the singleton invariant); demotion OF the current super_manager must also go
 * through a transfer, so a super_manager target is rejected here.
 */
export async function updateUserRole(
	actorId: string,
	targetId: string,
	newRole: 'rep' | 'manager'
): Promise<User> {
	if ((newRole as Role) === 'super_manager') {
		throw new PermissionError('Use the promote-super flow to assign super manager');
	}

	const [actor, target] = await Promise.all([loadUser(actorId), loadUser(targetId)]);
	if (!actor) throw new PermissionError('Unknown actor');
	if (!target) throw new PermissionError('Unknown target');

	if (!isSuperManager(actor)) throw new PermissionError('Only a super manager can change roles');
	if (target.role === 'super_manager') {
		throw new PermissionError('Transfer the super manager role instead of demoting directly');
	}

	const [row] = await db
		.update(crmUsers)
		.set({ role: newRole, updatedAt: new Date() })
		.where(eq(crmUsers.id, targetId))
		.returning();

	return dbUserToUser(row);
}

/**
 * Transfer the singleton super_manager role to `newId`, atomically demoting the
 * current active super_manager (if any) to `manager` first. The DB partial
 * unique index `crm_users_single_super_manager_uq` is the ultimate guard — a
 * concurrent transfer surfaces as postgres `23505`, which the caller maps to 409.
 */
export async function promoteSuperManager(newId: string): Promise<User> {
	const now = new Date();

	return db.transaction(async (tx) => {
		// Demote the current active super_manager (if one exists) FIRST, so the
		// partial unique index is free when we set the new holder.
		await tx
			.update(crmUsers)
			.set({ role: 'manager', updatedAt: now })
			.where(and(eq(crmUsers.role, 'super_manager'), eq(crmUsers.active, true)));

		const [row] = await tx
			.update(crmUsers)
			.set({ role: 'super_manager', updatedAt: now })
			.where(eq(crmUsers.id, newId))
			.returning();

		if (!row) throw new PermissionError('Unknown target');

		return dbUserToUser(row);
	});
}
