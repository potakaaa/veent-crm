// Mock/placeholder data for the v0 skeleton. NO database is queried yet.
// Every surface below renders from these stubs so the structure is reviewable end-to-end.
// Replace each consumer with real Drizzle queries against src/lib/server/db.

export type MockRep = {
	id: string;
	name: string;
	email: string | null;
	role: 'rep' | 'manager';
	active: boolean;
};

export const MOCK_REPS: MockRep[] = [
	{ id: 'u-jonna', name: 'Jonna', email: 'jonna@example.com', role: 'rep', active: true },
	{ id: 'u-ethyl', name: 'Ethyl', email: 'ethyl@example.com', role: 'rep', active: true },
	{ id: 'u-meybelle', name: 'Meybelle', email: 'meybelle@example.com', role: 'rep', active: true },
	{ id: 'u-shane', name: 'Shane', email: 'shane@example.com', role: 'rep', active: true },
	{ id: 'u-elay', name: 'Elay', email: 'elay@example.com', role: 'rep', active: true },
	{ id: 'u-angel', name: 'Angel', email: null, role: 'rep', active: false },
	{ id: 'u-fatima', name: 'Fatima', email: null, role: 'rep', active: false },
	{ id: 'u-divine', name: 'Divine', email: null, role: 'rep', active: false },
	{ id: 'u-dhen', name: 'Dhen', email: null, role: 'rep', active: false },
	{ id: 'u-manager', name: 'John (Manager)', email: 'john.sabuga@veent.io', role: 'manager', active: true }
];

export type MockLead = {
	id: string;
	name: string;
	category: string;
	platform: string;
	location: string;
	stage: (typeof import('$lib/zod/schemas').LEAD_STAGES)[number];
	ownerName: string | null;
	lastActivityAt: string | null;
	needsReview: boolean;
	source: string;
	// appeal-score inputs (all nullable — score is null "Not enough data" when eventDate/announcedAt missing)
	eventDate: string | null;
	announcedAt: string | null;
	firstReachedOutAt: string | null;
};

export const MOCK_LEADS: MockLead[] = [
	// high-appeal: announced recently, reached out same day, event still far out
	{ id: 'l-1', name: 'USWAG Davao', category: 'Sports', platform: 'Facebook', location: 'Davao', stage: 'won', ownerName: 'Jonna', lastActivityAt: '2026-05-02T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-11-01', announcedAt: '2026-06-20', firstReachedOutAt: '2026-06-21T03:00:00Z' },
	{ id: 'l-2', name: 'DAC Events', category: 'Concert', platform: 'Instagram', location: 'Cebu', stage: 'won', ownerName: 'Ethyl', lastActivityAt: '2026-05-10T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-10-15', announcedAt: '2026-06-10', firstReachedOutAt: '2026-06-18T03:00:00Z' },
	{ id: 'l-3', name: 'Sayaw Mindanao', category: 'Theater', platform: 'Facebook', location: 'CDO', stage: 'won', ownerName: 'Shane', lastActivityAt: '2026-05-18T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-09-01', announcedAt: '2026-05-01', firstReachedOutAt: '2026-05-25T03:00:00Z' },
	// near-event → low runway
	{ id: 'l-4', name: 'ENHYPEN-Philippines', category: 'Fan Fair', platform: 'Twitter/X', location: 'Manila', stage: 'lost', ownerName: 'Angel', lastActivityAt: '2026-03-01T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-07-05', announcedAt: '2026-04-01', firstReachedOutAt: '2026-05-20T03:00:00Z' },
	{ id: 'l-5', name: 'Bar Cumbia Nights', category: 'Bar/DJ', platform: 'Instagram', location: 'Makati', stage: 'in_discussion', ownerName: 'Meybelle', lastActivityAt: '2026-06-20T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-08-15', announcedAt: '2026-06-15', firstReachedOutAt: '2026-06-18T03:00:00Z' },
	// firstReachedOutAt null but both other dates set → still scores via delay-so-far
	{ id: 'l-6', name: 'Iloilo Music Fest', category: 'Music Fest', platform: 'Facebook', location: 'Iloilo', stage: 'replied', ownerName: 'Elay', lastActivityAt: '2026-06-22T03:00:00Z', needsReview: false, source: 'sheet_import', eventDate: '2026-12-01', announcedAt: '2026-06-25', firstReachedOutAt: null },
	// unscoreable: announcedAt null → "Not enough data"
	{ id: 'l-7', name: 'Unknown Org (recovered row)', category: 'Other', platform: 'Facebook', location: '', stage: 'contacted', ownerName: null, lastActivityAt: null, needsReview: true, source: 'sheet_import', eventDate: '2026-09-10', announcedAt: null, firstReachedOutAt: null },
	// unscoreable: both eventDate and announcedAt null → "Not enough data"
	{ id: 'l-8', name: 'Cagayan Expo 2026', category: 'Expo', platform: 'Facebook', location: 'CDO', stage: 'new', ownerName: null, lastActivityAt: null, needsReview: false, source: 'sheet_import', eventDate: null, announcedAt: null, firstReachedOutAt: null },
	// long delay + not reached out yet → low early-mover
	{ id: 'l-9', name: 'Scraped: Baguio Camp Org', category: 'Camp', platform: 'Instagram', location: 'Baguio', stage: 'new', ownerName: null, lastActivityAt: null, needsReview: false, source: 'scraper', eventDate: '2026-08-01', announcedAt: '2026-04-01', firstReachedOutAt: null }
];

export const MOCK_FUNNEL = [
	{ stage: 'new', count: 352 },
	{ stage: 'contacted', count: 807 },
	{ stage: 'replied', count: 375 },
	{ stage: 'in_discussion', count: 0 },
	{ stage: 'won', count: 3 },
	{ stage: 'lost', count: 597 }
];

export const MOCK_LEADERBOARD = MOCK_REPS.filter((r) => r.active && r.role === 'rep').map(
	(r, i) => ({ rep: r.name, wins: [1, 1, 0, 1, 0][i] ?? 0, touches: [210, 180, 150, 140, 90][i] ?? 0, replies: [60, 50, 40, 35, 20][i] ?? 0 })
);

export type MockActivity = {
	id: string;
	leadId: string;
	repName: string | null;
	channel: string;
	outcome: string;
	occurredAt: string;
	notes: string;
};

export const MOCK_ACTIVITIES: MockActivity[] = [
	{ id: 'a-1', leadId: 'l-5', repName: 'Meybelle', channel: 'ig_dm', outcome: 'sent', occurredAt: '2026-06-18T03:00:00Z', notes: 'Sent intro DM.' },
	{ id: 'a-2', leadId: 'l-5', repName: 'Meybelle', channel: 'ig_dm', outcome: 'replied', occurredAt: '2026-06-19T03:00:00Z', notes: 'They asked about pricing.' },
	{ id: 'a-3', leadId: 'l-5', repName: 'Meybelle', channel: 'call', outcome: 'other', occurredAt: '2026-06-20T03:00:00Z', notes: 'Scheduled a demo.' }
];
