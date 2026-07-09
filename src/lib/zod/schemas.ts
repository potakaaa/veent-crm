// Zod schemas — double as Superforms validators AND import/ingest validators.
// See sales-crm.md §Stack (Superforms + Zod) and §Lead ingestion (ingest contract).

import { z } from 'zod';
import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';

export const LEAD_STAGES = [
	'new',
	'contacted',
	'replied',
	'in_discussion',
	'won',
	'live',
	'done',
	'lost'
] as const;

export const LEAD_PLATFORMS = ['Facebook', 'Instagram', 'Twitter/X', 'TikTok', 'Other'] as const;

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

export const USER_ROLES = ['rep', 'manager', 'super_manager'] as const;

export const LEAD_SOURCES = ['sheet_import', 'manual', 'scraper', 'other'] as const;

export const CURRENCIES = ['PHP', 'SGD'] as const;

export const LEAD_VISIBILITIES = ['only_me', 'everyone', 'selected'] as const;

// Shape-only UUID matcher (see ownerUpdateSchema note): seeded fixed-format UUIDs
// (e.g. 00000000-…-0001) intentionally violate RFC 4122 variant bits, which
// z.string().uuid() would reject. Grant target ids come from listUsers(), so they
// must accept those seeded rows too.
export const LOOSE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Add / edit a lead (Superforms) ---------------------------------------
export const leadFormSchema = z
	.object({
		name: z.string().trim().min(1, 'Page / organizer name is required'),
		platform: z.enum(LEAD_PLATFORMS).optional(),
		location: z.string().optional(),
		pageUrl: z.string().url().optional().or(z.literal('')),
		contactEmail: z.string().email().optional().or(z.literal('')),
		eventName: z.string().optional(),
		eventLink: z.string().url().optional().or(z.literal('')),
		eventDateRaw: z.string().optional(),
		firstAnnouncedDate: z.iso.date().or(z.literal('')).optional(),
		firstReachedOutDate: z.iso.date().or(z.literal('')).optional(),
		notes: z.string().optional(),
		currentPlatform: z.string().optional(),
		competitorNotes: z.string().optional(),
		visibility: z.enum(LEAD_VISIBILITIES).default('everyone'),
		selectedUserIds: z.array(z.string().regex(LOOSE_UUID_RE)).optional(),
		// Recurring-organizer tag pre-fill (GitHub #190). Optional, shape-only UUID check;
		// existence is enforced server-side in the POST handler (see api/leads/+server.ts).
		organizerId: z.string().regex(LOOSE_UUID_RE).optional()
	})
	.refine((d) => d.visibility !== 'selected' || (d.selectedUserIds?.length ?? 0) > 0, {
		message: 'Pick at least one teammate when visibility is "Selected people".',
		path: ['selectedUserIds']
	});
export type LeadForm = z.infer<typeof leadFormSchema>;

// --- Update an existing lead (PATCH) ---------------------------------------
export const leadUpdateSchema = z
	.object({
		name: z.string().trim().min(1, 'Page / organizer name is required'),
		platform: z.enum(LEAD_PLATFORMS).optional(),
		location: z.string().optional(),
		pageUrl: z.string().url().optional().or(z.literal('')),
		contactEmail: z.string().email().optional().or(z.literal('')),
		phone: z.string().optional(),
		socialFacebook: z.string().url().optional().or(z.literal('')),
		socialInstagram: z.string().url().optional().or(z.literal('')),
		eventName: z.string().optional(),
		eventDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDate must be YYYY-MM-DD')
			.optional()
			.or(z.literal('')),
		eventDateRaw: z.string().optional(),
		eventLink: z.string().url().optional().or(z.literal('')),
		firstAnnouncedDate: z
			.union([z.iso.date(), z.literal(''), z.null()])
			.optional()
			.transform((v) => (v === '' ? null : v)),
		firstReachedOutDate: z
			.union([z.iso.date(), z.literal(''), z.null()])
			.optional()
			.transform((v) => (v === '' ? null : v)),
		notes: z.string().optional(),
		visibility: z.enum(LEAD_VISIBILITIES).optional(),
		selectedUserIds: z.array(z.string().regex(LOOSE_UUID_RE)).optional(),
		// Onboarding fields (surfaced only when stage = 'won'); all optional so a normal
		// lead edit that omits them is unaffected.
		onboardingNotes: z.string().optional(),
		contractUrl: z.string().url().optional().or(z.literal('')),
		onboardingStartDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional()
			.or(z.literal('')),
		goLiveDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional()
			.or(z.literal('')),
		// Agreements fields (surfaced only when stage = 'won'); all optional.
		feeStructure: z.enum(['legacy', 'new']).optional(),
		transactionFeePct: z.number().min(0).max(100).optional(),
		convenienceFeePesos: z.number().min(0).optional(),
		serviceFeePct: z.number().min(0).max(100).optional(),
		serviceFeePerTicketPesos: z.number().min(0).optional(),
		bankChargesAbsorbed: z.boolean().optional(),
		// Recurring-organizer / future-events prospect flag (GitHub #94).
		hasFutureEvents: z.boolean().optional(),
		currentPlatform: z.string().optional(),
		competitorNotes: z.string().optional(),
		// Done-stage post-event revenue (GitHub #273) — inline-editable on /leads/[id];
		// both optional so a normal edit that omits them is unaffected.
		revenueCents: z.number().int().nonnegative().optional(),
		currency: z.enum(CURRENCIES).optional()
	})
	.refine((d) => d.visibility !== 'selected' || (d.selectedUserIds?.length ?? 0) > 0, {
		message: 'Pick at least one teammate when visibility is "Selected people".',
		path: ['selectedUserIds']
	});
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

// --- Onboarding capture (post-won; PATCH subset) ---------------------------
export const onboardingUpdateSchema = z.object({
	onboardingNotes: z.string().optional(),
	contractUrl: z.string().url().optional().or(z.literal('')),
	onboardingStartDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.or(z.literal('')),
	goLiveDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.or(z.literal('')),
	eventDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.or(z.literal('')),
	// Agreements fields
	feeStructure: z.enum(['legacy', 'new']).optional(),
	transactionFeePct: z.number().min(0).max(100).optional(),
	convenienceFeePesos: z.number().min(0).optional(),
	serviceFeePct: z.number().min(0).max(100).optional(),
	serviceFeePerTicketPesos: z.number().min(0).optional(),
	bankChargesAbsorbed: z.boolean().optional(),
	hasFutureEvents: z.boolean().optional()
});
export type OnboardingUpdate = z.infer<typeof onboardingUpdateSchema>;

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

// --- Create a meeting (API endpoint: POST /api/meetings) --------------------
export const meetingFormSchema = z.object({
	leadId: z.string().uuid(),
	startAt: z.string().datetime(), // ISO datetime
	organizerId: z.string().uuid().optional(),
	// Lead's linked recurring-organizer entity (crm_organizers, GitHub #188). Distinct from
	// organizerId (internal crm_users). Optional + nullable so create-without-organizer and
	// explicit-clear both validate.
	leadOrganizerId: z.string().uuid().optional().nullable(),
	meetingUrl: z.string().url().optional().or(z.literal('')),
	// Free-text meeting venue (GitHub #250) — no format/enum/length constraint.
	venue: z.string().optional(),
	notes: z.string().optional(),
	outcome: z.string().optional(),
	attendeeIds: z.array(z.string().uuid()).default([])
});
export type MeetingForm = z.infer<typeof meetingFormSchema>;

// --- Update a meeting (PATCH /api/meetings/[id]) ----------------------------
// Same fields as meetingFormSchema but all optional (partial edit); lead is
// immutable after create so `leadId` is intentionally absent.
export const meetingUpdateSchema = z.object({
	startAt: z.string().datetime().optional(),
	// Accept null so the unassign path (organizer cleared on edit) reaches the DB layer.
	organizerId: z.string().uuid().nullable().optional(),
	// Lead's linked recurring-organizer entity (crm_organizers). Nullable-optional mirrors
	// organizerId: null clears the saved link on edit, undefined leaves it untouched.
	leadOrganizerId: z.string().uuid().nullable().optional(),
	meetingUrl: z.string().url().optional().or(z.literal('')),
	// Free-text meeting venue (GitHub #250) — no format/enum/length constraint.
	venue: z.string().optional(),
	notes: z.string().optional(),
	outcome: z.string().optional(),
	attendeeIds: z.array(z.string().uuid()).optional()
});
export type MeetingUpdate = z.infer<typeof meetingUpdateSchema>;

// --- Create / update a Nextcloud calendar event (NCAL-2, GitHub #252) -------
// POST /api/calendar/events + PUT /api/calendar/events/[uid]. The CRM never holds
// CalDAV write credentials — these payloads are POSTed to an n8n webhook which
// performs the actual CalDAV PUT. `leadHref` is embedded as a `CRM-HREF:` line in
// the event DESCRIPTION (n8n's ICS builder cannot emit the `URL:` property), and the
// NCAL-1 parser reads it back so calendar cards can deep-link to the lead.
// `z.iso.datetime()` is the Zod v4 ISO-8601 date-time validator (confirmed v4.4.3).
export const createCalendarEventSchema = z
	.object({
		title: z.string().trim().min(1),
		start: z.iso.datetime(),
		end: z.iso.datetime(),
		location: z.string().optional(),
		description: z.string().optional(),
		categories: z.string().optional(),
		leadHref: z.string().optional(),
		attendees: z.array(z.string().email()).optional(),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/)
			.optional(),
		status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
		rrule: z.string().optional()
	})
	.refine((v) => new Date(v.end) > new Date(v.start), {
		message: 'end must be after start',
		path: ['end']
	});
export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;

// Same shape as create; `uid` comes from the path param, never the body.
export const updateCalendarEventSchema = z
	.object({
		title: z.string().trim().min(1),
		start: z.iso.datetime(),
		end: z.iso.datetime(),
		location: z.string().optional(),
		description: z.string().optional(),
		categories: z.string().optional(),
		leadHref: z.string().optional(),
		attendees: z.array(z.string().email()).optional(),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/)
			.optional(),
		status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
		rrule: z.string().optional()
	})
	.refine((v) => new Date(v.end) > new Date(v.start), {
		message: 'end must be after start',
		path: ['end']
	});
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;

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
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().optional(),
	email: z.string().email('A valid work email is required'),
	role: z.enum(USER_ROLES).default('rep'),
	active: z.boolean().default(true),
	// Manager-only display color (GitHub #275); null clears to hash fallback.
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #a1b2c3')
		.nullable()
		.optional()
});
export type UserForm = z.infer<typeof userFormSchema>;

// --- Edit an existing team member's name (managers editing others, or self) ---
export const userNameEditSchema = userFormSchema.pick({ firstName: true, lastName: true });
export type UserNameEditForm = z.infer<typeof userNameEditSchema>;

// --- Edit an existing team member's color (manager-only, GitHub #275) ---
export const userColorEditSchema = userFormSchema.pick({ color: true });
export type UserColorEditForm = z.infer<typeof userColorEditSchema>;

// --- Add / edit an outreach message template (Superforms) ------------------
export const templateFormSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	// Template category vocabulary is the frozen TEMPLATE_CATEGORIES list (CAT-1), not the
	// editable crm_categories table. Tightened to an enum (GitHub #274 Option A) so an
	// off-list category is rejected rather than silently accepted as free text.
	category: z.enum(TEMPLATE_CATEGORIES, { error: 'Choose a valid category' }),
	body: z.string().min(1, 'Message body is required')
});
export type TemplateForm = z.infer<typeof templateFormSchema>;

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
		// GitHub #194 — a won lead can advance to `live` (no extra capture required).
		stage: z.literal('live')
	}),
	z.object({
		// GitHub #273 — moving to Done requires post-event revenue + currency.
		stage: z.literal('done'),
		revenueCents: z.number().int().nonnegative(),
		currency: z.enum(CURRENCIES).default('PHP')
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

// --- Tag / untag a lead to a recurring organizer (GitHub #188) ----------------
// null clears the tag. Shape-only UUID matcher (see ownerUpdateSchema note).
export const organizerTagSchema = z.object({
	organizerId: z.string().regex(UUID_RE, 'Invalid organizer ID').nullable()
});
export type OrganizerTag = z.infer<typeof organizerTagSchema>;

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

// --- Add a note (GitHub #191/#192/#193): POST /api/leads/[id]/notes,
// POST /api/organizers/[id]/notes ------------------------------------------------
export const addNoteSchema = z.object({
	content: z.string().trim().min(1, 'Note cannot be empty').max(5000, 'Note is too long')
});
export type AddNoteInput = z.infer<typeof addNoteSchema>;

// --- Scraper ingest contract (future; reused as the /api/leads/ingest validator) ---
export const ingestLeadSchema = z.object({
	pageName: z.string().min(1),
	handle: z.string().optional(),
	url: z.string().url().optional(),
	facebookUrl: z.string().url().optional(),
	instagramUrl: z.string().url().optional(),
	platform: z.enum(LEAD_PLATFORMS).optional(),
	category: z.string().min(1).optional(),
	location: z.string().optional(),
	eventName: z.string().optional(),
	eventDate: dateString.optional(),
	eventLink: z.string().url().optional(),
	firstAnnouncedDate: dateString.optional(),
	sourceRef: z.string().optional(),
	scraperOrgId: z.number().int().positive().optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	currentPlatform: z.string().optional()
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

// --- Custom lead categories (CAT-1, GitHub #248) --------------------------------
// Create/rename an editable category; `color` is an optional 6-digit hex (e.g. #1a2b3c).
export const categoryCreateSchema = z.object({
	// trim BEFORE length checks so a blank/whitespace-only name is rejected (not coerced to '').
	name: z.string().trim().min(1).max(50),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional()
		.nullable()
});
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;

export const categoryRenameSchema = z.object({
	name: z.string().trim().min(1).max(50),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional()
		.nullable()
});
export type CategoryRename = z.infer<typeof categoryRenameSchema>;

// Assign/remove a single category to/from a lead.
export const assignCategoriesSchema = z.object({
	categoryId: z.string().uuid()
});
export type AssignCategories = z.infer<typeof assignCategoriesSchema>;

// --- CSV / Google Sheets import UI (GitHub #210, #211) --------------------------
// Server-side re-validation for the /api/import/preview and /api/import/commit endpoints. Client
// data is UX-only and NEVER a trust boundary — both endpoints re-run these schemas on every
// request. `rows` is capped at 2000 (E4) to bound the batched dedup query and batch insert,
// mirroring ingestBatchSchema.leads.max(1000).

const IMPORT_ROW_CAP = 2000;

// Strict per-target mapped-row shape: only `name` (DB notNull) is hard-required; every other
// mapped column is an optional string. `category` is intentionally not a recognized field.
export const importLeadRowSchema = z
	.object({ name: z.string().trim().min(1, 'Name is required') })
	.catchall(z.string());
export const importOrganizerRowSchema = z
	.object({ name: z.string().trim().min(1, 'Name is required') })
	.catchall(z.string());

// Lenient row shape for the commit payload: skipped rows may be incomplete, so the request-level
// schema only checks the {data, skip} envelope. Non-skipped rows are strictly re-validated per-row
// in the handler (drives the `errored` count).
const importCommitRowSchema = z.object({
	data: z.record(z.string(), z.string()),
	skip: z.boolean()
});

export const importPreviewRequestSchema = z.discriminatedUnion('target', [
	z.object({ target: z.literal('leads'), rows: z.array(importLeadRowSchema).max(IMPORT_ROW_CAP) }),
	z.object({
		target: z.literal('organizers'),
		rows: z.array(importOrganizerRowSchema).max(IMPORT_ROW_CAP)
	})
]);
export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;

export const importCommitRequestSchema = z.discriminatedUnion('target', [
	z.object({
		target: z.literal('leads'),
		rows: z.array(importCommitRowSchema).max(IMPORT_ROW_CAP)
	}),
	z.object({
		target: z.literal('organizers'),
		rows: z.array(importCommitRowSchema).max(IMPORT_ROW_CAP)
	})
]);
export type ImportCommitRequest = z.infer<typeof importCommitRequestSchema>;
