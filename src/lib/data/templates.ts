/**
 * Static snippet templates for the Log Touch form.
 *
 * Client-side only — no DB, no schema, no persistence. Bodies use literal
 * `{{page}}` / `{{event}}` tokens that `fillTemplate` substitutes from the
 * current lead's `name` / `eventName` at selection time.
 */

export type TemplateCategory = 'intro' | 'follow-up' | 'pricing';

export interface Template {
	id: string;
	category: TemplateCategory;
	label: string;
	body: string;
}

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
	intro: 'Intro',
	'follow-up': 'Follow-up',
	pricing: 'Pricing'
};

export const TEMPLATES: Template[] = [
	// --- Intro ---------------------------------------------------------------
	{
		id: 'intro-1',
		category: 'intro',
		label: 'Warm intro',
		body: "Hi! Following up from {{page}} — saw you're organizing {{event}} and wanted to introduce our services."
	},
	{
		id: 'intro-2',
		category: 'intro',
		label: 'Referral opener',
		body: 'Hey! Came across {{page}} while looking into {{event}}. Would love to share how we can help.'
	},
	{
		id: 'intro-3',
		category: 'intro',
		label: 'Short hello',
		body: 'Hi from Veent! Noticed {{page}} is behind {{event}} — mind if I share a quick overview?'
	},
	// --- Follow-up -----------------------------------------------------------
	{
		id: 'follow-up-1',
		category: 'follow-up',
		label: 'Gentle check-in',
		body: 'Hey, just checking in on {{event}} for {{page}} — any updates on your end?'
	},
	{
		id: 'follow-up-2',
		category: 'follow-up',
		label: 'Nudge after silence',
		body: 'Circling back on {{event}} — happy to answer any questions {{page}} still has.'
	},
	{
		id: 'follow-up-3',
		category: 'follow-up',
		label: 'Last touch',
		body: 'Wanted to close the loop on {{event}} for {{page}}. Should I follow up later or is now a good time?'
	},
	// --- Pricing -------------------------------------------------------------
	{
		id: 'pricing-1',
		category: 'pricing',
		label: 'Pricing breakdown',
		body: "Here's our pricing breakdown for {{event}}. Let me know if you'd like a custom quote for {{page}}."
	},
	{
		id: 'pricing-2',
		category: 'pricing',
		label: 'Custom quote offer',
		body: 'For {{event}}, I can put together a tailored quote for {{page}} — what package size are you thinking?'
	},
	{
		id: 'pricing-3',
		category: 'pricing',
		label: 'Discount nudge',
		body: 'Booking {{event}} early for {{page}} unlocks our best rate — want me to send the details?'
	}
];

/**
 * Pure template substitution. Replaces every `{{page}}` and `{{event}}` token
 * in `body` with the provided values. Callers pass `''` for an absent value.
 */
export function fillTemplate(body: string, vars: { page: string; event: string }): string {
	return body.replaceAll('{{page}}', vars.page).replaceAll('{{event}}', vars.event);
}
