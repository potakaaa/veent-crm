/**
 * Role + active-status humanizing helpers. One source of truth for turning the
 * raw `USER_ROLES` enum (`rep`/`manager`) and the boolean active flag into
 * user-facing labels so no raw enum value reaches the UI.
 */
import type { Role } from '$lib/types';

const ROLE_LABEL: Record<Role, string> = {
	rep: 'Rep',
	manager: 'Manager',
	super_manager: 'Super Manager'
};

export const roleLabel = (role: Role): string =>
	ROLE_LABEL[role] ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : role);

export const statusLabel = (active: boolean): string => (active ? 'Active' : 'Inactive');
