/**
 * Pure template-substitution helper for outreach message templates.
 *
 * The template library itself is now DB-backed (`crm_message_templates`, served via
 * `$lib/server/db/templates.ts`) — the static `TEMPLATES` array was retired in Phase 4.
 * This module retains only the pure `fillTemplate` function, which the Log Touch composer
 * feeds with DB rows.
 */

/**
 * Pure template substitution. Replaces every placeholder token in `body` with the
 * provided values. Two placeholder syntaxes are supported and fill identically:
 *   - Legacy brace tokens: `{{organizerName}}`, `{{eventName}}`, `{{repName}}`,
 *     `{{repFirstName}}`, `{{repLastName}}` (permanent backward compatibility).
 *   - Slash tokens: `/orgname`, `/event`, `/rep`, `/repfirst`, `/replast`.
 * Callers pass `''` for an absent value (missing values degrade to blank —
 * a literal token is never left behind, and this never throws).
 *
 * Known residual (accepted, by design): slash tokens are undelimited bare
 * substrings, so a slash token appearing incidentally inside other text (e.g. a
 * URL `.../events` contains `/event`, `.../reports` contains `/rep`) is also
 * rewritten, and a value inserted by an earlier `.replaceAll` can be re-mangled
 * by a later one (chained substitution). This is an unavoidable consequence of
 * the slash-syntax choice; word-boundary/regex matching is intentionally NOT
 * used. Brace tokens have no such collision (braces delimit them).
 */
export type TemplateVars = {
	organizerName: string;
	eventName: string;
	repName: string;
	repFirstName: string;
	repLastName: string;
};

export function fillTemplate(body: string, vars: TemplateVars): string {
	return (
		body
			.replaceAll('{{organizerName}}', vars.organizerName)
			.replaceAll('{{eventName}}', vars.eventName)
			.replaceAll('{{repName}}', vars.repName)
			.replaceAll('{{repFirstName}}', vars.repFirstName)
			.replaceAll('{{repLastName}}', vars.repLastName)
			// New slash tokens. ORDER MATTERS: /repfirst & /replast MUST precede /rep
			// (/rep is a substring prefix of both — replacing it first would corrupt them).
			.replaceAll('/orgname', vars.organizerName)
			.replaceAll('/event', vars.eventName)
			.replaceAll('/repfirst', vars.repFirstName)
			.replaceAll('/replast', vars.repLastName)
			.replaceAll('/rep', vars.repName)
	);
}
