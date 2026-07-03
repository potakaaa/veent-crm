// CRM PostgreSQL schema (Drizzle) — see sales-crm.md §Data model.
// Snake-case tables, UUID PKs, created_at/updated_at everywhere, soft-delete + audit.
// NOTE: Better Auth's user/account/session/verification tables live in the same DB and
// are managed by Better Auth's own migrations (see src/lib/server/auth.ts — stubbed for v0).

import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	doublePrecision,
	timestamp,
	date,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = pgEnum('crm_user_role', ['rep', 'manager', 'super_manager']);

export const leadCategory = pgEnum('crm_lead_category', [
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
]);

export const leadPlatform = pgEnum('crm_lead_platform', [
	'Facebook',
	'Instagram',
	'Twitter/X',
	'TikTok',
	'Other'
]);

export const leadStage = pgEnum('crm_lead_stage', [
	'new',
	'contacted',
	'replied',
	'in_discussion',
	'won',
	'lost'
]);

export const lostReason = pgEnum('crm_lost_reason', ['no_response', 'rejected', 'not_a_fit']);

export const leadSource = pgEnum('crm_lead_source', ['sheet_import', 'manual', 'scraper', 'other']);

// Per-lead visibility scope (GitHub #87). `everyone` is the default and the migration
// backfills all existing rows to it, so the change never reduces visibility for anyone.
export const leadVisibility = pgEnum('crm_lead_visibility', ['only_me', 'everyone', 'selected']);

export const activityChannel = pgEnum('crm_activity_channel', [
	'fb_dm',
	'fb_comment',
	'ig_dm',
	'email',
	'call',
	'meeting',
	'other',
	'scraped_event'
]);

export const activityOutcome = pgEnum('crm_activity_outcome', [
	'sent',
	'replied',
	'no_response',
	'rejected',
	'other'
]);

// ---------------------------------------------------------------------------
// crm_users — reps & managers (9 seeded: 5 active + 4 former)
// ---------------------------------------------------------------------------
export const crmUsers = pgTable(
	'crm_users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		// login + Better Auth link key; null for former reps (record-only, no login)
		email: text('email'),
		role: userRole('role').notNull().default('rep'),
		// former reps are active=false (no login), never deleted
		active: boolean('active').notNull().default(true),
		// IdP `sub` once Authentik/OIDC is on; null for magic-link users
		authSubject: text('auth_subject'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('crm_users_email_uq').on(t.email),
		uniqueIndex('crm_users_auth_subject_uq').on(t.authSubject),
		// At most one ACTIVE super_manager may exist at any time (GitHub #73).
		// Partial unique index over role — the WHERE clause narrows it to active
		// super_manager rows, so a second concurrent promote surfaces as 23505.
		uniqueIndex('crm_users_single_super_manager_uq')
			.on(t.role)
			.where(sql`role = 'super_manager' AND active = true`)
	]
);

// ---------------------------------------------------------------------------
// crm_leads — one organizer-page outreach (lead & advisory-dedup unit)
// ---------------------------------------------------------------------------
export const crmLeads = pgTable(
	'crm_leads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(), // page / organizer name
		category: leadCategory('category').notNull().default('Other'),
		location: text('location'),
		country: text('country'),
		platform: leadPlatform('platform'),

		// socials
		socialFacebook: text('social_facebook'),
		socialInstagram: text('social_instagram'),
		socialTiktok: text('social_tiktok'),
		socialTwitter: text('social_twitter'),
		pageUrl: text('page_url'),

		// advisory dedup/search — indexed, NOT unique
		normalizedHandle: text('normalized_handle'),
		contactEmail: text('contact_email'),
		contactPhone: text('contact_phone'),

		// event (folded in)
		eventName: text('event_name'),
		eventDate: date('event_date'), // wall-clock, nullable
		eventDateRaw: text('event_date_raw'),
		eventLink: text('event_link'),
		firstAnnouncedDate: date('first_announced_date'), // when event was first publicly announced
		firstReachedOutDate: date('first_reached_out_date'), // when team first contacted organizer

		stage: leadStage('stage').notNull().default('new'),
		lostReason: lostReason('lost_reason'),

		// null = unassigned "up for grabs"; claim = atomic conditional update
		ownerId: uuid('owner_id').references(() => crmUsers.id, { onDelete: 'set null' }),

		// Per-lead visibility scope (GitHub #87). Enforced on every rep-facing read via
		// visibilityCondition(); managers always bypass it. Reset to 'everyone' on owner change.
		visibility: leadVisibility('visibility').notNull().default('everyone'),

		source: leadSource('source').notNull().default('manual'),

		// maintained from activities; powers stale filter + fresh-first sort
		lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
		// soft delete; no hard deletes
		deletedAt: timestamp('deleted_at', { withTimezone: true }),

		// Won capture (manual)
		wonOrgName: text('won_org_name'),
		dealValueCents: integer('deal_value_cents'),
		currency: text('currency').default('PHP'), // required when value set (enforced in app)
		signedAt: timestamp('signed_at', { withTimezone: true }),

		// Onboarding capture (post-won; manual) — only surfaced when stage = 'won'
		onboardingNotes: text('onboarding_notes'),
		contractUrl: text('contract_url'),
		onboardingStartDate: date('onboarding_start_date'), // wall-clock
		goLiveDate: date('go_live_date'), // wall-clock

		// Agreements capture (post-won; manual) — fee structure + bank-charge handling
		feeStructure: text('fee_structure'),
		transactionFeePct: doublePrecision('transaction_fee_pct').default(7),
		convenienceFeePesos: doublePrecision('convenience_fee_pesos').default(20),
		serviceFeePct: doublePrecision('service_fee_pct').default(3),
		serviceFeePerTicketPesos: doublePrecision('service_fee_per_ticket_pesos').default(20),
		bankChargesAbsorbed: boolean('bank_charges_absorbed'),

		// Recurring-organizer / future-events prospect flag (GitHub #94) — internal visibility marker
		hasFutureEvents: boolean('has_future_events').notNull().default(false),

		// scraper provenance — event ID from the scraper DB; unique per non-null value
		sourceRef: text('source_ref'),
		// stable link back to the Neon organizer row; drives event-date reconciliation
		scraperOrgId: integer('scraper_org_id'),

		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('crm_leads_normalized_handle_idx').on(t.normalizedHandle),
		index('crm_leads_stage_idx').on(t.stage),
		index('crm_leads_owner_idx').on(t.ownerId),
		index('crm_leads_last_activity_idx').on(t.lastActivityAt),
		index('crm_leads_country_idx').on(t.country),
		uniqueIndex('crm_leads_source_ref_uq')
			.on(t.sourceRef)
			.where(sql`source_ref IS NOT NULL AND deleted_at IS NULL`)
	]
);

// ---------------------------------------------------------------------------
// crm_activities — each outreach touch (relationship history)
// ---------------------------------------------------------------------------
export const crmActivities = pgTable(
	'crm_activities',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => crmLeads.id, { onDelete: 'cascade' }),
		// keeps the original rep even when the lead's owner differs/leaves
		repId: uuid('rep_id').references(() => crmUsers.id, { onDelete: 'set null' }),
		channel: activityChannel('channel').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
		outcome: activityOutcome('outcome'),
		// drives reminders; partial index WHERE follow_up_at IS NOT NULL
		followUpAt: timestamp('follow_up_at', { withTimezone: true }),
		notes: text('notes'),

		// scraper-event provenance (D-1) — nullable; populated only for channel='scraped_event'
		eventName: text('event_name'),
		eventDate: date('event_date'),
		eventUrl: text('event_url'),
		eventCategory: text('event_category'),
		eventSource: text('event_source'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('crm_activities_lead_idx').on(t.leadId),
		// guard against accidental double-load
		uniqueIndex('crm_activities_dedupe_uq').on(t.leadId, t.repId, t.occurredAt, t.channel),
		// partial index for the reminder query
		index('crm_activities_follow_up_idx')
			.on(t.followUpAt)
			.where(sql`${t.followUpAt} IS NOT NULL`),
		// dedupe scraper events: re-running the importer / re-POSTing to /api/leads/ingest
		// must never create duplicate activity rows. Partial (event_url IS NOT NULL) so
		// rep-touch activities (event_url null) are unaffected — still deduped by
		// crm_activities_dedupe_uq above.
		uniqueIndex('crm_activities_scraped_event_uq')
			.on(t.leadId, t.eventUrl)
			.where(sql`${t.eventUrl} IS NOT NULL`)
	]
);

// ---------------------------------------------------------------------------
// crm_lead_history — audit, append-only
// ---------------------------------------------------------------------------
export const crmLeadHistory = pgTable(
	'crm_lead_history',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => crmLeads.id, { onDelete: 'cascade' }),
		actorUserId: uuid('actor_user_id').references(() => crmUsers.id, { onDelete: 'set null' }),
		// field: stage | owner_id | deal_value_cents | won_org_name | lost_reason | …
		field: text('field').notNull(),
		oldValue: text('old_value'),
		newValue: text('new_value'),
		at: timestamp('at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('crm_lead_history_lead_idx').on(t.leadId)]
);

// ---------------------------------------------------------------------------
// crm_meetings — scheduled/logged meetings with a lead (organizer + attendees)
// ---------------------------------------------------------------------------
export const crmMeetings = pgTable(
	'crm_meetings',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => crmLeads.id, { onDelete: 'cascade' }),
		// distinct FK (not just an attendee flag); null if the organizing user leaves
		organizerId: uuid('organizer_id').references(() => crmUsers.id, { onDelete: 'set null' }),
		startAt: timestamp('start_at', { withTimezone: true }).notNull(),
		meetingUrl: text('meeting_url'),
		notes: text('notes'),
		outcome: text('outcome'),
		// soft delete; no hard deletes
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		// meeting-reminder checkpoints — nullable until the reminder for that checkpoint
		// is sent; flipped NULL->timestamp via an atomic compare-and-set (at-most-once send).
		dayReminderSentAt: timestamp('day_reminder_sent_at', { withTimezone: true }),
		hourReminderSentAt: timestamp('hour_reminder_sent_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('crm_meetings_lead_idx').on(t.leadId)]
);

// ---------------------------------------------------------------------------
// crm_meeting_attendees — join of crm_users to a meeting (no dup rows)
// ---------------------------------------------------------------------------
export const crmMeetingAttendees = pgTable(
	'crm_meeting_attendees',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		meetingId: uuid('meeting_id')
			.notNull()
			.references(() => crmMeetings.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').references(() => crmUsers.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('crm_meeting_attendees_meeting_user_uq').on(t.meetingId, t.userId)]
);

// crm_lead_visibility_grants — join of crm_users to a `selected`-visibility lead.
// Mirrors crm_meeting_attendees exactly: one row per (lead, granted user), no dups.
// A grant lets the named rep see a lead they wouldn't otherwise (GitHub #87).
// ---------------------------------------------------------------------------
export const crmLeadVisibilityGrants = pgTable(
	'crm_lead_visibility_grants',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		leadId: uuid('lead_id')
			.notNull()
			.references(() => crmLeads.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').references(() => crmUsers.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('crm_lead_visibility_grants_lead_user_uq').on(t.leadId, t.userId)]
);

// ---------------------------------------------------------------------------
// crm_message_templates — manager-managed outreach snippets, keyed on event category
// ---------------------------------------------------------------------------
export const crmMessageTemplates = pgTable(
	'crm_message_templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// reuse the existing 20-value event-category enum — no parallel taxonomy
		category: leadCategory('category').notNull().default('Other'),
		title: text('title').notNull(),
		body: text('body').notNull(),
		// soft delete; no hard deletes
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('crm_message_templates_title_active_uq')
			.on(t.title)
			.where(sql`deleted_at is null`)
	]
);

// ---------------------------------------------------------------------------
// Better Auth tables (managed by drizzle-kit)
// ---------------------------------------------------------------------------
export const baUser = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const baSession = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => baUser.id, { onDelete: 'cascade' })
});

// Composite unique constraint (provider_id, account_id) is enforced via
// drizzle/0003_ba_account_unique.sql — not managed by Drizzle schema diff
// per project convention (Better Auth owns this table's migration lifecycle).
// NOTE: Better Auth is live-wired, but whether the adapter handles a
// (provider_id, account_id) unique violation gracefully (ON CONFLICT) rather
// than surfacing a 500 remains unverified.
export const baAccount = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => baUser.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const baVerification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

export type CrmUser = typeof crmUsers.$inferSelect;
export type CrmLead = typeof crmLeads.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type CrmLeadHistory = typeof crmLeadHistory.$inferSelect;
export type CrmMeeting = typeof crmMeetings.$inferSelect;
export type CrmMeetingAttendee = typeof crmMeetingAttendees.$inferSelect;
export type CrmLeadVisibilityGrant = typeof crmLeadVisibilityGrants.$inferSelect;
export type CrmMessageTemplate = typeof crmMessageTemplates.$inferSelect;
