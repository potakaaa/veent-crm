/**
 * Compose a display-ready full name from separate first/last name fields.
 *
 * Pure, total (never throws). Falsy `lastName` (null, undefined, or empty
 * string) yields just the first name — no trailing space.
 */
export function formatFullName(firstName: string, lastName: string | null | undefined): string {
	return firstName + (lastName ? ` ${lastName}` : '');
}
