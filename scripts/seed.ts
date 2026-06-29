// Dev/demo seed: 10 crm_users + 25 crm_leads + 17 crm_activities + 3 crm_lead_history rows.
// Lights up every DB-backed surface (Today urgency buckets, pipeline stages, won/lost,
// unassigned + needs-review badges, activity-rich timelines).
//
// Fixed UUID namespaces (stable across re-seeds → idempotent):
//   users      00000000-…
//   leads      00000001-…
//   activities 00000002-…
//   history    00000003-…
//
// Usage:
//   bun scripts/seed.ts            upsert everything (idempotent)
//   bun scripts/seed.ts --reset    delete known seed rows (FK order) then re-seed
//   bun scripts/seed.ts --force    required when NODE_ENV=production
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inArray, sql } from 'drizzle-orm';
import {
	crmUsers,
	crmLeads,
	crmActivities,
	crmLeadHistory
} from '../src/lib/server/db/schema.ts';

// ---------------------------------------------------------------------------
// Safety guard — refuse to seed production without --force
// ---------------------------------------------------------------------------
const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
const hasForce = process.argv.includes('--force');
const hasReset = process.argv.includes('--reset');
if (isProd && !hasForce) {
	console.error('ERROR: Refusing to seed in production. Pass --force to override.');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// DB client (standalone postgres-js pool)
// ---------------------------------------------------------------------------
const url = process.env.DATABASE_URL ?? 'postgres://crm:crm@127.0.0.1:5432/veent_crm';
const client = postgres(url, { max: 1 });
const db = drizzle(client);

// ---------------------------------------------------------------------------
// User IDs (match existing user seed namespace)
// ---------------------------------------------------------------------------
const U = {
	JOHN: '00000000-0000-0000-0000-000000000001',
	JONNA: '00000000-0000-0000-0000-000000000002',
	ETHYL: '00000000-0000-0000-0000-000000000003',
	MEYBELLE: '00000000-0000-0000-0000-000000000004',
	SHANE: '00000000-0000-0000-0000-000000000005',
	ELAY: '00000000-0000-0000-0000-000000000006'
} as const;

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);
// Today end in Manila (23:59) — keeps "due today" true regardless of seed-run hour.
const todayManila = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const todayEndManila = new Date(todayManila + 'T23:59:00+08:00');

// ---------------------------------------------------------------------------
// Users (unchanged): 1 manager + 5 active reps + 4 former reps (no login)
// ---------------------------------------------------------------------------
const users: (typeof crmUsers.$inferInsert)[] = [
	{ id: U.JOHN, name: 'John Sabuga', email: 'john.sabuga@veent.io', role: 'manager', active: true },
	{ id: U.JONNA, name: 'Jonna', email: 'jonna@veent.io', role: 'rep', active: true },
	{ id: U.ETHYL, name: 'Ethyl', email: 'ethyl@veent.io', role: 'rep', active: true },
	{ id: U.MEYBELLE, name: 'Meybelle', email: 'meybelle@veent.io', role: 'rep', active: true },
	{ id: U.SHANE, name: 'Shane', email: 'shane@veent.io', role: 'rep', active: true },
	{ id: U.ELAY, name: 'Elay', email: 'elay@veent.io', role: 'rep', active: true },
	{ id: '00000000-0000-0000-0000-000000000007', name: 'Angel', email: null, role: 'rep', active: false },
	{ id: '00000000-0000-0000-0000-000000000008', name: 'Fatima', email: null, role: 'rep', active: false },
	{ id: '00000000-0000-0000-0000-000000000009', name: 'Divine', email: null, role: 'rep', active: false },
	{ id: '00000000-0000-0000-0000-000000000010', name: 'Dhen', email: null, role: 'rep', active: false }
];

// ---------------------------------------------------------------------------
// Lead IDs (prefix 00000001-)
// ---------------------------------------------------------------------------
const L = (n: number) => `00000001-0000-0000-0000-${String(n).padStart(12, '0')}`;

const leads: (typeof crmLeads.$inferInsert)[] = [
	{ id: L(1), name: 'USWAG Davao Sports Event', category: 'Sports', platform: 'Facebook', location: 'Davao', stage: 'contacted', source: 'scraper', ownerId: U.JOHN, lastActivityAt: daysAgo(5) },
	{ id: L(2), name: 'Sayaw Mindanao Workshop', category: 'Workshop', platform: 'Instagram', location: 'CDO', stage: 'new', source: 'manual', ownerId: U.JOHN, lastActivityAt: daysAgo(3) },
	{ id: L(3), name: 'ENHYPEN Philippines Fan Fair', category: 'Fan Fair', platform: 'Twitter/X', stage: 'replied', source: 'scraper', ownerId: U.JOHN, lastActivityAt: hoursAgo(12) },
	{ id: L(4), name: 'Bar Cumbia Nights CDO', category: 'Bar/DJ', platform: 'Facebook', stage: 'new', source: 'scraper', ownerId: U.JOHN, lastActivityAt: new Date('2026-05-01T00:00:00Z') },
	{ id: L(5), name: 'Baguio Camp Org', category: 'Camp', platform: 'Other', location: 'Baguio', stage: 'contacted', source: 'scraper', ownerId: U.JOHN, lastActivityAt: new Date('2026-04-15T00:00:00Z') },
	{ id: L(6), name: 'Cebu Wedding Expo 2026', category: 'Expo', platform: 'Facebook', location: 'Cebu', stage: 'contacted', source: 'scraper', ownerId: U.JONNA, lastActivityAt: daysAgo(4) },
	{ id: L(7), name: 'Iloilo Music Fest PH', category: 'Music Fest', platform: 'Instagram', location: 'Iloilo', stage: 'new', source: 'manual', ownerId: U.JONNA, lastActivityAt: daysAgo(2) },
	{ id: L(8), name: 'DAC Events Manila', category: 'Concert', platform: 'Instagram', location: 'Manila', stage: 'new', source: 'manual', ownerId: U.JONNA, lastActivityAt: daysAgo(8) },
	{ id: L(9), name: 'Cagayan Convention Center', category: 'Convention', platform: 'Facebook', location: 'Cagayan', stage: 'new', source: 'scraper', ownerId: U.ETHYL, lastActivityAt: daysAgo(6) },
	{ id: L(10), name: 'Mindanao Sports Summit', category: 'Sports', platform: 'Facebook', location: 'Davao', stage: 'contacted', source: 'manual', ownerId: U.JONNA, lastActivityAt: daysAgo(7) },
	{ id: L(11), name: 'QC Science Expo 2026', category: 'Expo', platform: 'Twitter/X', location: 'QC', stage: 'contacted', source: 'scraper', ownerId: U.MEYBELLE, lastActivityAt: daysAgo(10) },
	{ id: L(12), name: 'Batangas Beach Resort Event', category: 'Resort', platform: 'Instagram', location: 'Batangas', stage: 'replied', source: 'manual', ownerId: U.SHANE, lastActivityAt: daysAgo(2) },
	{ id: L(13), name: 'UP Film Screening Org', category: 'Screening', platform: 'TikTok', location: 'Manila', stage: 'in_discussion', source: 'manual', ownerId: U.JOHN, lastActivityAt: daysAgo(3), dealValueCents: 150000, currency: 'PHP' },
	{ id: L(14), name: 'Metro Cebu Live Band', category: 'Live Band', platform: 'Facebook', location: 'Cebu', stage: 'in_discussion', source: 'scraper', ownerId: U.ETHYL, lastActivityAt: daysAgo(4), dealValueCents: 250000, currency: 'PHP' },
	{ id: L(15), name: 'Iloilo Music Fest OKK', category: 'Music Fest', platform: 'Instagram', location: 'Iloilo', stage: 'won', source: 'manual', ownerId: U.JOHN, lastActivityAt: daysAgo(10), dealValueCents: 300000, currency: 'PHP', wonOrgName: 'Iloilo OKK Productions', signedAt: daysAgo(10) },
	{ id: L(16), name: 'Davao Fan Fair 2025', category: 'Fan Fair', platform: 'Twitter/X', location: 'Davao', stage: 'lost', source: 'scraper', ownerId: U.JONNA, lastActivityAt: daysAgo(20), lostReason: 'no_response' },
	{ id: L(17), name: 'Manila School Fiesta Org', category: 'School', platform: 'Facebook', location: 'Manila', stage: 'new', source: 'scraper', ownerId: null, lastActivityAt: daysAgo(5) },
	{ id: L(18), name: 'Pangasinan Convention Expo', category: 'Convention', platform: 'Facebook', location: 'Pangasinan', stage: 'new', source: 'scraper', ownerId: null, lastActivityAt: daysAgo(8) },
	{ id: L(19), name: 'Zamboanga Live Band Festival', category: 'Live Band', platform: 'Instagram', location: 'Zamboanga', stage: 'new', source: 'scraper', ownerId: null, lastActivityAt: daysAgo(3) },
	{ id: L(20), name: 'Tagaytay Church Retreat', category: 'Church', platform: 'Facebook', location: 'Tagaytay', stage: 'new', source: 'manual', ownerId: U.JOHN, lastActivityAt: daysAgo(2), needsReview: true },
	{ id: L(21), name: 'Bacolod Theater Guild', category: 'Theater', platform: 'Instagram', location: 'Bacolod', stage: 'contacted', source: 'manual', ownerId: U.JONNA, lastActivityAt: daysAgo(5), needsReview: true },
	{ id: L(22), name: 'Sayaw Pilipinas Manila', category: 'Workshop', platform: 'Facebook', location: 'Manila', stage: 'new', source: 'scraper', ownerId: U.ELAY, lastActivityAt: daysAgo(14), socialFacebook: 'https://fb.com/SayawPilipinas' },
	{ id: L(23), name: 'Sayaw Pilipinas (MNL)', category: 'Workshop', platform: 'Facebook', location: 'Manila', stage: 'new', source: 'manual', ownerId: U.ELAY, lastActivityAt: daysAgo(9), socialFacebook: 'https://fb.com/SayawPilipinas' },
	{ id: L(24), name: 'Davao Concert Producers', category: 'Concert', platform: 'Instagram', location: 'Davao', stage: 'in_discussion', source: 'manual', ownerId: U.JOHN, lastActivityAt: daysAgo(5) },
	{ id: L(25), name: 'Cebu Modelling Agency', category: 'Modelling', platform: 'Facebook', location: 'Cebu', stage: 'contacted', source: 'manual', ownerId: U.ETHYL, lastActivityAt: daysAgo(2) }
];

// ---------------------------------------------------------------------------
// Activities (prefix 00000002-)
// ---------------------------------------------------------------------------
const A = (n: number) => `00000002-0000-0000-0000-${String(n).padStart(12, '0')}`;

const activities: (typeof crmActivities.$inferInsert)[] = [
	{ id: A(1), leadId: L(1), repId: U.JOHN, channel: 'ig_dm', outcome: 'sent', occurredAt: daysAgo(5), followUpAt: daysAgo(2), notes: 'Sent intro DM.' },
	{ id: A(2), leadId: L(2), repId: U.JOHN, channel: 'fb_dm', outcome: 'sent', occurredAt: daysAgo(3), followUpAt: todayEndManila, notes: 'Sent event inquiry.' },
	{ id: A(3), leadId: L(3), repId: U.JOHN, channel: 'call', outcome: 'replied', occurredAt: hoursAgo(12), followUpAt: null, notes: 'Called — rep confirmed interest.' },
	{ id: A(4), leadId: L(4), repId: U.JOHN, channel: 'fb_dm', outcome: 'sent', occurredAt: new Date('2026-05-01T08:00:00Z'), followUpAt: null, notes: 'Sent first contact. No response.' },
	{ id: A(5), leadId: L(5), repId: U.JOHN, channel: 'ig_dm', outcome: 'no_response', occurredAt: new Date('2026-04-15T08:00:00Z'), followUpAt: null, notes: 'Sent DM. No reply.' },
	{ id: A(6), leadId: L(6), repId: U.JONNA, channel: 'ig_dm', outcome: 'sent', occurredAt: daysAgo(4), followUpAt: daysAgo(3), notes: 'Followed up on expo enquiry.' },
	{ id: A(7), leadId: L(7), repId: U.JONNA, channel: 'fb_dm', outcome: 'sent', occurredAt: daysAgo(2), followUpAt: todayEndManila, notes: 'Intro message sent.' },
	{ id: A(8), leadId: L(10), repId: U.JONNA, channel: 'email', outcome: 'sent', occurredAt: daysAgo(7), followUpAt: null, notes: 'Emailed event brief.' },
	{ id: A(9), leadId: L(12), repId: U.SHANE, channel: 'ig_dm', outcome: 'replied', occurredAt: daysAgo(2), followUpAt: null, notes: 'They replied — interested in package.' },
	{ id: A(10), leadId: L(15), repId: U.JOHN, channel: 'call', outcome: 'replied', occurredAt: daysAgo(12), followUpAt: null, notes: 'Finalised deal on call.' },
	{ id: A(11), leadId: L(24), repId: U.JOHN, channel: 'ig_dm', outcome: 'sent', occurredAt: daysAgo(20), followUpAt: null, notes: 'Initial outreach.' },
	{ id: A(12), leadId: L(24), repId: U.JOHN, channel: 'email', outcome: 'sent', occurredAt: daysAgo(15), followUpAt: null, notes: 'Sent proposal deck.' },
	{ id: A(13), leadId: L(24), repId: U.JOHN, channel: 'call', outcome: 'replied', occurredAt: daysAgo(10), followUpAt: null, notes: 'Call — they want a meeting.' },
	{ id: A(14), leadId: L(24), repId: U.JOHN, channel: 'meeting', outcome: 'replied', occurredAt: daysAgo(5), followUpAt: null, notes: 'Met in person. Discussing contract.' },
	{ id: A(15), leadId: L(25), repId: U.ETHYL, channel: 'fb_dm', outcome: 'sent', occurredAt: daysAgo(14), followUpAt: null, notes: 'First DM sent.' },
	{ id: A(16), leadId: L(25), repId: U.ETHYL, channel: 'ig_dm', outcome: 'no_response', occurredAt: daysAgo(7), followUpAt: null, notes: 'Follow-up DM — no reply.' },
	{ id: A(17), leadId: L(25), repId: U.ETHYL, channel: 'call', outcome: 'sent', occurredAt: daysAgo(2), followUpAt: null, notes: 'Left voicemail.' }
];

// ---------------------------------------------------------------------------
// History (prefix 00000003-)
// ---------------------------------------------------------------------------
const H = (n: number) => `00000003-0000-0000-0000-${String(n).padStart(12, '0')}`;

const history: (typeof crmLeadHistory.$inferInsert)[] = [
	{ id: H(1), leadId: L(15), actorUserId: U.JOHN, field: 'stage', oldValue: 'in_discussion', newValue: 'won' },
	{ id: H(2), leadId: L(16), actorUserId: U.JONNA, field: 'stage', oldValue: 'contacted', newValue: 'lost' },
	{ id: H(3), leadId: L(13), actorUserId: U.JOHN, field: 'deal_value_cents', oldValue: '0', newValue: '150000' }
];

const leadIds = leads.map((l) => l.id as string);

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
try {
	if (hasReset) {
		// Delete only the known seed rows, FK-safe order: history → activities → leads.
		await db.delete(crmLeadHistory).where(inArray(crmLeadHistory.leadId, leadIds));
		await db.delete(crmActivities).where(inArray(crmActivities.leadId, leadIds));
		await db.delete(crmLeads).where(inArray(crmLeads.id, leadIds));
		console.log('Reset: deleted existing seed lead/activity/history rows.');
	}

	await db.insert(crmUsers).values(users).onConflictDoNothing();
	await db.insert(crmLeads).values(leads).onConflictDoNothing();
	await db
		.insert(crmActivities)
		.values(activities)
		.onConflictDoUpdate({
			target: crmActivities.id,
			set: {
				followUpAt: sql`excluded.follow_up_at`,
				occurredAt: sql`excluded.occurred_at`
			}
		});
	await db.insert(crmLeadHistory).values(history).onConflictDoNothing();

	console.log(`\n✓ ${users.length} users seeded`);
	console.log(`✓ ${leads.length} leads seeded`);
	console.log(`✓ ${activities.length} activities seeded`);
	console.log(`✓ ${history.length} history rows seeded`);

	console.log(`
Routes to visit after logging in:
  /              Today queue (overdue, due, cold, replied)
  /leads         All 25 leads
  /pipeline      Kanban: new(11), contacted(7), replied(2), in_discussion(3), won(1), lost(1)
  /leads/[id]    Detail with history — try lead IDs ending in ...0015, ...0024, ...0025
  /unassigned    Badge: 3 unassigned leads (page content still mock-backed)
  /review        Badge: 2 needs-review leads (page content still mock-backed)
  /team          All users

Login: magic-link to john.sabuga@veent.io or jonna@veent.io
NOTE: /unassigned and /review page content is still mock-backed — only badge counts are real DB.`);
} finally {
	await client.end();
}
