/**
 * Shared CRM types for the Veent Outreach Console frontend.
 *
 * Enum string-literal unions are derived from the canonical `as const` arrays in
 * `src/lib/zod/schemas.ts` so there is exactly one source of truth that both the
 * runtime validators and the compile-time types agree on.
 */

import type {
	LEAD_STAGES,
	LEAD_PLATFORMS,
	LEAD_CATEGORIES,
	ACTIVITY_CHANNELS,
	ACTIVITY_OUTCOMES,
	LOST_REASONS,
	USER_ROLES,
	LEAD_SOURCES,
	CURRENCIES
} from '$lib/zod/schemas';

export type Stage = (typeof LEAD_STAGES)[number];
export type Platform = (typeof LEAD_PLATFORMS)[number];
export type Category = (typeof LEAD_CATEGORIES)[number];
export type ActivityChannel = (typeof ACTIVITY_CHANNELS)[number];
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];
export type LostReason = (typeof LOST_REASONS)[number];
export type Role = (typeof USER_ROLES)[number];
export type Visibility = 'only_me' | 'everyone' | 'selected';
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type Currency = (typeof CURRENCIES)[number];

/** Derived urgency bucket used by the Today / Reminders views. */
export type Urgency = 'overdue' | 'due' | 'replied' | 'cold' | 'fresh' | 'normal';

/** Age/attention badge kind (drives color). */
export type AgeType = 'overdue' | 'due' | 'stale' | 'fresh' | 'normal';

export interface User {
	id: string;
	name: string;
	email: string;
	role: Role;
	active: boolean;
	location?: string;
	/** Count of currently-owned leads (denormalized for the team view). */
	leadCount?: number;
}

export interface Lead {
	id: string;
	name: string;
	handle: string;
	category: Category;
	location: string;
	country: string;
	platform: Platform;
	stage: Stage;
	/** Owner user id, or null when the lead is unassigned ("up for grabs"). */
	ownerId: string | null;
	/**
	 * Owner display name, populated by `enrichWithOwnerNames()` at the route-load layer
	 * ("Unassigned" when `ownerId` is null). NOT a DB-native column — undefined until enriched.
	 */
	ownerName?: string;
	/**
	 * Tagged organizer id (crm_organizers, GitHub #188), or null when the lead is not
	 * tagged to any organizer. Maps directly from the `crm_leads.organizer_id` column.
	 */
	organizerId: string | null;
	/**
	 * Organizer display name, resolved at the route-load layer via `getOrganizer()`.
	 * NOT a DB-native column on the lead — undefined until resolved.
	 */
	organizerName?: string;
	/** Per-lead visibility scope (GitHub #87). Defaults to `everyone`. */
	visibility: Visibility;
	/** User ids explicitly granted access when `visibility === 'selected'`. */
	selectedUserIds?: string[];
	/** Last owner kept for attribution after a rep leaves or unclaims. */
	formerOwnerId?: string | null;
	eventName?: string;
	eventDate?: string;
	eventLink?: string;
	firstAnnouncedDate?: string;
	firstReachedOutDate?: string;
	email?: string;
	phone?: string;
	pageUrl?: string;
	socialFacebook?: string;
	socialInstagram?: string;
	/** Count of sibling leads that share the same page (advisory dedup only). */
	siblings?: number;
	source: LeadSource;
	notes?: string;

	// Won capture (manually entered — never read from external systems)
	signedOrg?: string;
	dealValue?: number;
	currency?: Currency;
	signedDate?: string;

	// Onboarding capture (post-won; manual)
	onboardingNotes?: string;
	contractUrl?: string;
	onboardingStartDate?: string;
	goLiveDate?: string;

	// Agreements capture (post-won; manual)
	feeStructure?: 'legacy' | 'new';
	transactionFeePct?: number;
	convenienceFeePesos?: number;
	serviceFeePct?: number;
	serviceFeePerTicketPesos?: number;
	bankChargesAbsorbed?: boolean;

	/** Recurring-organizer / future-events prospect flag (GitHub #94). NOT NULL DEFAULT false. */
	hasFutureEvents: boolean;

	// Lost capture
	lostReason?: LostReason;

	// Timestamps (ISO) + a precomputed age badge for design fidelity
	createdAt: string;
	lastActivityAt: string;
	followUpAt?: string;
	age: { label: string; type: AgeType };
	urgency: Urgency;
}

export interface Activity {
	id: string;
	leadId: string;
	repId: string;
	channel: ActivityChannel;
	outcome: ActivityOutcome;
	note?: string;
	createdAt: string;
	followUpAt?: string;
}

export interface MeetingAttendee {
	userId: string;
	name: string;
}

export interface Meeting {
	id: string;
	leadId: string;
	/** Lead name — populated on the cross-lead /meetings list. */
	leadName?: string;
	organizerId: string | null;
	organizerName?: string;
	/**
	 * The lead's linked recurring-organizer entity (crm_organizers, GitHub #188) — DISTINCT
	 * from `organizerId` (internal crm_users organizer). Pre-filled from the lead on create,
	 * overridable/clearable. Null when unset.
	 */
	leadOrganizerId?: string | null;
	/** Linked organizer display name for the saved `leadOrganizerId` (join-populated). */
	leadOrganizerName?: string;
	/** ISO datetime the meeting starts. */
	startAt: string;
	meetingUrl?: string;
	notes?: string;
	outcome?: string;
	attendees: MeetingAttendee[];
	createdAt: string;
}

/**
 * Unified calendar entry — the common shape both meetings and follow-up reminders
 * map into before reaching the calendar grid. `type` drives visual distinction (AC4)
 * and `href` drives click-through (AC5 meeting → /meetings/[id], AC6 followup → /leads/[id],
 * golive → /leads/[id]).
 */
export interface CalendarEntry {
	id: string;
	type: 'meeting' | 'followup' | 'golive';
	/** ISO datetime the entry falls on (meeting start, or follow-up due date). */
	startAt: string;
	title: string;
	href: string;
	/** Optional secondary line (e.g. organizer name, lead handle). */
	subtitle?: string;
}

/**
 * A manager-managed outreach message template. `deletedAt` is intentionally
 * absent from the surface type — soft-delete is an internal filter concern.
 */
export interface MessageTemplate {
	id: string;
	category: Category;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}

/** A row from the sheet import that needs a human before it joins the pool. */
export interface ReviewItem {
	id: string;
	issue: string;
	raw: string;
	rowNo: number;
	name: string;
	category: Category | 'Uncategorized';
	platform: Platform;
}

// --- Filters & query shapes -------------------------------------------------

export type LeadSegment = 'mine' | 'all' | 'unassigned' | 'lost';

export interface LeadFilters {
	segment?: LeadSegment;
	stage?: Stage;
	platform?: Platform;
	category?: Category;
	staleOnly?: boolean;
	hasFutureEvents?: boolean;
	search?: string;
	/** Hide lost leads unless explicitly requested (product rule). */
	includeLost?: boolean;
	ownerId?: string | null;
}

// --- Lead ownership history -------------------------------------------------

export interface OwnerHistoryRow {
	id: string;
	field: string;
	actorUserId: string | null;
	oldValue: string | null;
	newValue: string | null;
	at: string;
}

// --- Reports ----------------------------------------------------------------

export type HeatmapRow = { date: string; stage: string; count: number };
export type HeatmapDay = { date: string; total: number; stages: Record<string, number> };

export interface FunnelStage {
	stage: Stage;
	label: string;
	color: string;
	count: number;
	pct: number;
}

export interface LeaderboardRow {
	repId: string;
	name: string;
	touches: number;
	replies: number;
	wins: number;
}

export interface CurrencyTotal {
	currency: Currency;
	label: string;
	total: number;
	deals: number;
}

export interface OutreachMetrics {
	leadsReachedOut: number;
	leadsThatReplied: number;
	leadsWithMeeting: number;
}

export interface ReportData {
	funnel: FunnelStage[];
	leaderboard: LeaderboardRow[];
	currencyTotals: CurrencyTotal[];
	conversionRate: number;
}

// --- Service input payloads -------------------------------------------------

export interface CreateLeadInput {
	name: string;
	category: Category;
	platform?: Platform;
	location?: string;
	pageUrl?: string;
	email?: string;
	eventName?: string;
	eventDate?: string;
	notes?: string;
	source?: LeadSource;
	visibility?: Visibility;
	selectedUserIds?: string[];
}

export type UpdateLeadInput = Partial<
	Omit<Lead, 'id' | 'createdAt' | 'age' | 'urgency' | 'siblings'>
>;

export interface MoveStagePayload {
	// Required when moving to `won`
	wonOrgName?: string;
	dealValueCents?: number;
	currency?: Currency;
	signedAt?: string;
	// Required when moving to `lost`
	lostReason?: LostReason;
}

export interface AddActivityInput {
	channel: ActivityChannel;
	outcome: ActivityOutcome;
	note?: string;
	followUpInDays?: number;
	followUpAt?: string; // YYYY-MM-DD; takes precedence over followUpInDays when set
}

export interface CreateUserInput {
	name: string;
	email: string;
	role: Role;
	active?: boolean;
}

export type UpdateUserInput = Partial<Omit<User, 'id' | 'leadCount'>>;
