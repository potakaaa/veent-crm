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
	timestamp,
	date,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = pgEnum('crm_user_role', ['rep', 'manager']);

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

export const activityChannel = pgEnum('crm_activity_channel', [
	'fb_dm',
	'fb_comment',
	'ig_dm',
	'email',
	'call',
	'meeting',
	'other'
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
		uniqueIndex('crm_users_auth_subject_uq').on(t.authSubject)
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

		// event (folded in)
		eventName: text('event_name'),
		eventDate: date('event_date'), // wall-clock, nullable
		eventDateRaw: text('event_date_raw'),
		eventLink: text('event_link'),

		stage: leadStage('stage').notNull().default('new'),
		lostReason: lostReason('lost_reason'),

		// null = unassigned "up for grabs"; claim = atomic conditional update
		ownerId: uuid('owner_id').references(() => crmUsers.id, { onDelete: 'set null' }),

		source: leadSource('source').notNull().default('manual'),
		needsReview: boolean('needs_review').notNull().default(false),

		// maintained from activities; powers stale filter + fresh-first sort
		lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
		// soft delete; no hard deletes
		deletedAt: timestamp('deleted_at', { withTimezone: true }),

		// Won capture (manual)
		wonOrgName: text('won_org_name'),
		dealValueCents: integer('deal_value_cents'),
		currency: text('currency').default('PHP'), // required when value set (enforced in app)
		signedAt: timestamp('signed_at', { withTimezone: true }),

		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('crm_leads_normalized_handle_idx').on(t.normalizedHandle),
		index('crm_leads_stage_idx').on(t.stage),
		index('crm_leads_owner_idx').on(t.ownerId),
		index('crm_leads_last_activity_idx').on(t.lastActivityAt)
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
			.where(sql`${t.followUpAt} IS NOT NULL`)
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

export type CrmUser = typeof crmUsers.$inferSelect;
export type CrmLead = typeof crmLeads.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type CrmLeadHistory = typeof crmLeadHistory.$inferSelect;
