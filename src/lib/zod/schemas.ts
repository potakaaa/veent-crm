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

export const LOST_REASONS = ['no_response', 'rejected', 'not_a_fit'] as const;

export const USER_ROLES = ['rep', 'manager'] as const;

export const LEAD_SOURCES = ['sheet_import', 'manual', 'scraper', 'other'] as const;

export const CURRENCIES = ['PHP', 'SGD'] as const;

// --- Add / edit a lead (Superforms) ---------------------------------------
export const leadFormSchema = z.object({
	name: z.string().trim().min(1, 'Page / organizer name is required'),
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

// --- Mark lost (requires a reason) ----------------------------------------
export const lostFormSchema = z.object({
	leadIds: z.array(z.string()).min(1),
	reason: z.enum(LOST_REASONS),
	note: z.string().optional()
});
export type LostForm = z.infer<typeof lostFormSchema>;

// --- Reassign owner --------------------------------------------------------
export const reassignFormSchema = z.object({
	leadIds: z.array(z.string()).min(1),
	ownerId: z.string().min(1)
});
export type ReassignForm = z.infer<typeof reassignFormSchema>;

// --- Add / edit a team member (the magic-link allowlist) -------------------
export const userFormSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	email: z.string().email('A valid work email is required'),
	role: z.enum(USER_ROLES).default('rep'),
	active: z.boolean().default(true)
});
export type UserForm = z.infer<typeof userFormSchema>;

// --- Move lead stage (pipeline + detail page) ---------------------------------
const PIPELINE_STAGES = ['new', 'contacted', 'replied', 'in_discussion'] as const;

export const moveStageSchema = z.discriminatedUnion('stage', [
	z.object({ stage: z.enum(PIPELINE_STAGES) }),
	z.object({
		stage: z.literal('won'),
		wonOrgName: z.string().optional(),
		dealValueCents: z.number().int().nonnegative().optional(),
		currency: z.enum(CURRENCIES).default('PHP'),
		signedAt: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'signedAt must be YYYY-MM-DD')
			.optional()
	}),
	z.object({
		stage: z.literal('lost'),
		lostReason: z.enum(LOST_REASONS)
	})
]);
export type MoveStageInput = z.infer<typeof moveStageSchema>;

// --- Update lead owner -------------------------------------------------------
// Use a shape-only UUID regex rather than z.string().uuid() so that seeded
// fixed-format UUIDs (e.g. 00000000-…-0001) also pass. Real DB UUIDs from
// defaultRandom() satisfy both; z.string().uuid() enforces RFC 4122 variant
// bits which the seeded rows intentionally violate.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ownerUpdateSchema = z.object({
	ownerId: z.string().regex(UUID_RE, 'Invalid owner ID')
});
export type OwnerUpdate = z.infer<typeof ownerUpdateSchema>;

// --- Log a touch (API endpoint: POST /api/leads/[id]/touch) ---------------------
const dateString = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
	.refine((s) => !isNaN(new Date(s).getTime()), 'Not a valid calendar date');

export const logTouchSchema = z.object({
	channel: z.enum(ACTIVITY_CHANNELS),
	outcome: z.enum(ACTIVITY_OUTCOMES).default('sent'),
	followUpAt: dateString.optional(),
	notes: z.string().optional()
});
export type LogTouchInput = z.infer<typeof logTouchSchema>;

// --- Snooze (defer follow-up): POST /api/leads/[id]/snooze ----------------------
export const snoozeSchema = z.object({
	followUpAt: dateString,
	notes: z.string().optional()
});
export type SnoozeInput = z.infer<typeof snoozeSchema>;

// --- Scraper ingest contract (future; reused as the /api/leads/ingest validator) ---
export const ingestLeadSchema = z.object({
	pageName: z.string().min(1),
	handle: z.string().optional(),
	url: z.string().url().optional(),
	facebookUrl: z.string().url().optional(),
	instagramUrl: z.string().url().optional(),
	platform: z.enum(LEAD_PLATFORMS).optional(),
	category: z.enum(LEAD_CATEGORIES).optional(),
	location: z.string().optional(),
	eventName: z.string().optional(),
	eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	eventLink: z.string().url().optional(),
	sourceRef: z.string().optional(),
	scraperOrgId: z.number().int().positive().optional(),
	email: z.string().email().optional(),
	phone: z.string().optional()
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
