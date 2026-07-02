/**
 * Pure template-substitution helper for outreach message templates.
 *
 * The template library itself is now DB-backed (`crm_message_templates`, served via
 * `$lib/server/db/templates.ts`) — the static `TEMPLATES` array was retired in Phase 4.
 * This module retains only the pure `fillTemplate` function, which the Log Touch composer
 * feeds with DB rows.
 */

/**
 * Pure template substitution. Replaces every `{{organizerName}}`,
 * `{{eventName}}`, and `{{repName}}` token in `body` with the provided values.
 * Callers pass `''` for an absent value (missing values degrade to blank —
 * a literal token is never left behind, and this never throws).
 */
export function fillTemplate(
	body: string,
	vars: { organizerName: string; eventName: string; repName: string }
): string {
	return body
		.replaceAll('{{organizerName}}', vars.organizerName)
		.replaceAll('{{eventName}}', vars.eventName)
		.replaceAll('{{repName}}', vars.repName);
}
