/**
 * Shared field-error wiring — Phase 4 (sitewide-ux-refresh).
 *
 * Pure helpers that compute the ARIA wiring for a per-field validation error.
 * Kept framework-free (no Svelte imports) so the `aria-invalid`/`aria-describedby`
 * contract is unit-testable in the existing node vitest project, without a
 * component-render / jsdom harness (none is configured in this repo).
 *
 * Error inputs accept the shape produced by Zod's `error.flatten().fieldErrors`
 * (a `Record<string, string[] | undefined>` — one entry per field), as well as a
 * plain string for hand-rolled checks (Meeting modal has no Zod schema).
 */

export type FieldErrorValue = string[] | string | undefined | null;

/** Stable id for the error message element, derived from the control's own id. */
export function fieldErrorId(fieldId: string): string {
	return `${fieldId}-error`;
}

/** Collapse a Zod fieldErrors entry (or plain string) to a single message, or undefined. */
export function firstFieldError(errors: FieldErrorValue): string | undefined {
	if (!errors) return undefined;
	if (typeof errors === 'string') return errors || undefined;
	return errors[0] || undefined;
}

/**
 * Attributes to spread onto the invalid control. When there is no message both
 * attributes are `undefined` so nothing is rendered on a valid field.
 */
export function fieldErrorAttrs(
	fieldId: string,
	errors: FieldErrorValue
): { 'aria-invalid': 'true' | undefined; 'aria-describedby': string | undefined } {
	const message = firstFieldError(errors);
	return {
		'aria-invalid': message ? 'true' : undefined,
		'aria-describedby': message ? fieldErrorId(fieldId) : undefined
	};
}
