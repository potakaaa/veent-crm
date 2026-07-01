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
	platform: Platform;
	stage: Stage;
	/** Owner user id, or null when the lead is unassigned ("up for grabs"). */
	ownerId: string | null;
	/** Last owner kept for attribution after a rep leaves or unclaims. */
	formerOwnerId?: string | null;
	eventName?: string;
	eventDate?: string;
	eventLink?: string;
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
	search?: string;
	/** Hide lost leads unless explicitly requested (product rule). */
	includeLost?: boolean;
	ownerId?: string | null;
}

// --- Reports ----------------------------------------------------------------

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
}

export interface CreateUserInput {
	name: string;
	email: string;
	role: Role;
	active?: boolean;
}

export type UpdateUserInput = Partial<Omit<User, 'id' | 'leadCount'>>;
