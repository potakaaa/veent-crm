// Zod schemas — double as Superforms validators AND import/ingest validators.
// See sales-crm.md §Stack (Superforms + Zod) and §Lead ingestion (ingest contract).

import { z } from 'zod';

export const LEAD_STAGES = ['new', 'contacted', 'replied', 'in_discussion', 'won', 'lost'] as const;

export const LEAD_PLATFORMS = ['Facebook', 'Instagram', 'Twitter/X', 'TikTok', 'Other'] as const;

export const LEAD_CATEGORIES = [
	'Sports',
	'Workshop',
	'Church',
	'Theater',
	'Bar/DJ',
	'Conference',
	'Music Fest',
	'Fan Fair',
	'School',
	'Concert',
	'Live Band',
	'Expo',
	'Screening',
	'Camp',
	'Competition',
	'Convention',
	'Film',
	'Modelling',
	'Resort',
	'Other'
] as const;

export const ACTIVITY_CHANNELS = [
	'fb_dm',
	'fb_comment',
	'ig_dm',
	'email',
	'call',
	'meeting',
	'other'
] as const;

export const ACTIVITY_OUTCOMES = ['sent', 'replied', 'no_response', 'rejected', 'other'] as const;

// --- Add / edit a lead (Superforms) ---------------------------------------
export const leadFormSchema = z.object({
	name: z.string().min(1, 'Page / organizer name is required'),
	category: z.enum(LEAD_CATEGORIES).default('Other'),
	platform: z.enum(LEAD_PLATFORMS).optional(),
	location: z.string().optional(),
	pageUrl: z.string().url().optional().or(z.literal('')),
	contactEmail: z.string().email().optional().or(z.literal('')),
	eventName: z.string().optional(),
	eventDateRaw: z.string().optional(),
	notes: z.string().optional()
});
export type LeadForm = z.infer<typeof leadFormSchema>;

// --- Log a touch (activity) -----------------------------------------------
export const activityFormSchema = z.object({
	leadId: z.string().uuid(),
	channel: z.enum(ACTIVITY_CHANNELS),
	outcome: z.enum(ACTIVITY_OUTCOMES).default('sent'),
	occurredAt: z.string().optional(), // ISO; defaults to now in handler
	followUpAt: z.string().optional(),
	notes: z.string().optional()
});
export type ActivityForm = z.infer<typeof activityFormSchema>;

// --- Won capture (manual) --------------------------------------------------
export const wonFormSchema = z.object({
	leadId: z.string().uuid(),
	wonOrgName: z.string().min(1),
	dealValueCents: z.number().int().nonnegative().optional(),
	currency: z.string().default('PHP'),
	signedAt: z.string().optional()
});
export type WonForm = z.infer<typeof wonFormSchema>;

// --- Scraper ingest contract (future; reused as the /api/leads/ingest validator) ---
export const ingestLeadSchema = z.object({
	pageName: z.string().min(1),
	handle: z.string().optional(),
	url: z.string().url().optional(),
	facebookUrl: z.string().url().optional(),
	platform: z.enum(LEAD_PLATFORMS).optional(),
	category: z.enum(LEAD_CATEGORIES).optional(),
	location: z.string().optional(),
	eventName: z.string().optional(),
	eventLink: z.string().url().optional(),
	sourceRef: z.string().optional(),
	email: z.string().email().optional()
});
export const ingestBatchSchema = z.object({
	leads: z.array(ingestLeadSchema).max(1000)
});
export type IngestLead = z.infer<typeof ingestLeadSchema>;

// --- One-time TSV export row (scripts/import.ts layout validation) ---------
// One Zod object validating a parsed TSV row (all 34 columns). Required columns use
// `.min(1)`; nullable columns allow empty string. See the TSV Export Schema contract in
// process/features/import/.../tsv-importer-contract_PLAN_29-06-26.md.
export const tsvRowSchema = z.object({
	__row_type: z.string().min(1),
	export_version: z.string().min(1),
	event_id: z.string().min(1),
	event_name: z.string().min(1),
	event_slug: z.string(),
	event_category_raw: z.string(),
	event_category_clean: z.string(),
	event_starts_at: z.string(),
	event_ends_at: z.string(),
	event_post_date: z.string(),
	event_price: z.string(),
	event_source: z.string().min(1),
	event_source_url: z.string(),
	event_registration_url: z.string(),
	event_image_url: z.string(),
	event_raw_text: z.string(),
	organizer_ref_id: z.string(),
	organizer_name: z.string().min(1),
	organizer_slug: z.string(),
	organizer_status: z.string(),
	organizer_facebook_url: z.string(),
	organizer_instagram_url: z.string(),
	organizer_website: z.string(),
	organizer_email: z.string(),
	organizer_phone: z.string(),
	organizer_source: z.string(),
	organizer_enrichment_source: z.string(),
	organizer_scraped_at: z.string(),
	venue_name: z.string(),
	venue_address: z.string(),
	venue_city: z.string(),
	venue_country: z.string(),
	venue_latitude: z.string(),
	venue_longitude: z.string()
});
export type TsvRow = z.infer<typeof tsvRowSchema>;
