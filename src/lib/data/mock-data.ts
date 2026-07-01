/**
 * Typed mock CRM data for the Veent Outreach Console frontend.
 *
 * This is the ONLY place raw seed arrays live. Route files must never import
 * from here directly — they go through `$lib/services/crm-client`.
 *
 * TODO(api): delete this module once the backend serves real data.
 */
import type { Activity, Lead, ReviewItem, ReportData, User } from '$lib/types';

export const mockUsers: User[] = [
	{
		id: 'jonna',
		name: 'Jonna',
		email: 'jonna@test.com',
		role: 'rep',
		active: true,
		location: 'Manila',
		leadCount: 142
	},
	{
		id: 'ethyl',
		name: 'Ethyl',
		email: 'ethyl@test.com',
		role: 'rep',
		active: true,
		leadCount: 168
	},
	{
		id: 'meybelle',
		name: 'Meybelle',
		email: 'meybelle@test.com',
		role: 'rep',
		active: true,
		leadCount: 121
	},
	{ id: 'shane', name: 'Shane', email: 'shane@test.com', role: 'rep', active: true, leadCount: 97 },
	{ id: 'elay', name: 'Elay', email: 'elay@test.com', role: 'rep', active: true, leadCount: 110 },
	{ id: 'rafa', name: 'Rafa', email: 'rafa@test.com', role: 'manager', active: true },
	{ id: 'angel', name: 'Angel', email: 'angel@test.com', role: 'rep', active: false, leadCount: 0 },
	{
		id: 'fatima',
		name: 'Fatima',
		email: 'fatima@test.com',
		role: 'rep',
		active: false,
		leadCount: 0
	},
	{
		id: 'divine',
		name: 'Divine',
		email: 'divine@test.com',
		role: 'rep',
		active: false,
		leadCount: 0
	}
];

/** The signed-in user for this prototype session (a rep). */
export const CURRENT_USER_ID = 'jonna';

export const mockLeads: Lead[] = [
	{
		id: 'christian',
		name: 'Christian Concerts PH',
		handle: '@christianconcertsph',
		category: 'Music Fest',
		location: 'Manila',
		platform: 'Facebook',
		stage: 'in_discussion',
		ownerId: 'jonna',
		eventName: 'Worship Night Vol. 4',
		eventDate: '12 Jul',
		email: 'hello@christianconcerts.ph',
		pageUrl: 'facebook.com/christianconcertsph',
		siblings: 2,
		source: 'sheet_import',
		createdAt: '2026-05-28',
		lastActivityAt: '2026-06-21',
		followUpAt: '2026-06-21',
		age: { label: '3d overdue', type: 'overdue' },
		urgency: 'overdue'
	},
	{
		id: 'cowboys',
		name: 'Cowboys Trail Run',
		handle: '@cowboystrailrun',
		category: 'Sports',
		location: 'Cebu',
		platform: 'Facebook',
		stage: 'replied',
		ownerId: 'elay',
		eventName: 'Cowboys Trail Run 50K',
		eventDate: '14 Sep',
		source: 'manual',
		createdAt: '2026-06-02',
		lastActivityAt: '2026-06-18',
		followUpAt: '2026-06-20',
		age: { label: '4d overdue', type: 'overdue' },
		urgency: 'overdue'
	},
	{
		id: 'bbg',
		name: 'bb_g_runevents',
		handle: '@bb_g_runevents',
		category: 'Sports',
		location: 'Davao',
		platform: 'Instagram',
		stage: 'in_discussion',
		ownerId: 'shane',
		eventName: 'Davao Highlands Ultra',
		eventDate: '2 Aug',
		source: 'scraper',
		createdAt: '2026-06-05',
		lastActivityAt: '2026-06-22',
		followUpAt: '2026-06-24',
		age: { label: 'due today', type: 'due' },
		urgency: 'due'
	},
	{
		id: 'tribu',
		name: 'Tribu Kapampangan',
		handle: '@tribukapampangan',
		category: 'Live Band',
		location: 'Pampanga',
		platform: 'Facebook',
		stage: 'in_discussion',
		ownerId: 'shane',
		eventName: 'Kapampangan Music Night',
		eventDate: '30 Jun',
		source: 'manual',
		createdAt: '2026-06-09',
		lastActivityAt: '2026-06-21',
		followUpAt: '2026-06-24',
		age: { label: 'due today', type: 'due' },
		urgency: 'due'
	},
	{
		id: 'katihan',
		name: 'Katihan Eco Park',
		handle: '@katihanecopark',
		category: 'Workshop',
		location: 'Bohol',
		platform: 'Instagram',
		stage: 'replied',
		ownerId: 'meybelle',
		eventName: 'Eco Camp Weekend',
		eventDate: '20 Jul',
		source: 'sheet_import',
		createdAt: '2026-06-14',
		lastActivityAt: '2026-06-24T07:00:00+08:00',
		age: { label: '2h ago', type: 'fresh' },
		urgency: 'replied'
	},
	{
		id: 'siargao',
		name: 'Siargao Surf Cup',
		handle: '@siargaosurfcup',
		category: 'Sports',
		location: 'Siargao',
		platform: 'Instagram',
		stage: 'replied',
		ownerId: 'elay',
		eventName: 'Surf Cup Open',
		eventDate: '11 Oct',
		source: 'manual',
		createdAt: '2026-06-16',
		lastActivityAt: '2026-06-24T05:00:00+08:00',
		age: { label: '4h ago', type: 'fresh' },
		urgency: 'replied'
	},
	{
		id: 'dlsu',
		name: 'DLSU Innovation & Tech Fair',
		handle: '@dlsu.itf',
		category: 'Expo',
		location: 'Manila',
		platform: 'Facebook',
		stage: 'replied',
		ownerId: 'meybelle',
		eventName: 'Innovation & Tech Fair',
		eventDate: '5 Aug',
		source: 'sheet_import',
		createdAt: '2026-06-12',
		lastActivityAt: '2026-06-23',
		age: { label: '1d ago', type: 'fresh' },
		urgency: 'replied'
	},
	{
		id: 'psits',
		name: 'PSITS Misamis Oriental',
		handle: '@psits.misor',
		category: 'Conference',
		location: 'Cagayan de Oro',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: 'jonna',
		eventName: 'ICT Congress',
		eventDate: '9 Oct',
		source: 'sheet_import',
		createdAt: '2026-03-30',
		lastActivityAt: '2026-04-27',
		age: { label: '58d cold', type: 'stale' },
		urgency: 'cold'
	},
	{
		id: 'baguiobeer',
		name: 'Baguio Craft Beer Fest',
		handle: '@bgocraftbeer',
		category: 'Music Fest',
		location: 'Baguio',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: 'jonna',
		eventName: 'Craft Beer Fest',
		eventDate: '6 Dec',
		source: 'manual',
		createdAt: '2026-04-14',
		lastActivityAt: '2026-05-14',
		age: { label: '41d cold', type: 'stale' },
		urgency: 'cold'
	},
	{
		id: 'cagayanexpo',
		name: 'Cagayan Trade Expo',
		handle: '@cagayantradeexpo',
		category: 'Expo',
		location: 'Cagayan de Oro',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: 'jonna',
		eventName: 'Trade Expo 2026',
		eventDate: '20 Nov',
		source: 'scraper',
		createdAt: '2026-04-21',
		lastActivityAt: '2026-05-21',
		age: { label: '34d cold', type: 'stale' },
		urgency: 'cold'
	},
	{
		id: 'uswag',
		name: 'USWAG Music Festival',
		handle: '@uswagfest',
		category: 'Music Fest',
		location: 'Iloilo',
		platform: 'Facebook',
		stage: 'won',
		ownerId: 'ethyl',
		eventName: 'USWAG 2026',
		eventDate: '4 Mar',
		source: 'manual',
		signedOrg: 'USWAG Productions Inc.',
		dealValue: 85000,
		currency: 'PHP',
		signedDate: '2026-03-04',
		createdAt: '2026-01-18',
		lastActivityAt: '2026-03-04',
		age: { label: 'signed 4 Mar', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'malandeg',
		name: 'Malandeg Outdoors',
		handle: '@malandegoutdoors',
		category: 'Sports',
		location: 'Baguio',
		platform: 'Facebook',
		stage: 'lost',
		ownerId: 'ethyl',
		eventName: 'Trail Series',
		source: 'manual',
		lostReason: 'no_response',
		createdAt: '2026-02-11',
		lastActivityAt: '2026-04-02',
		age: { label: 'lost · no response', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'artcaravan',
		name: 'Art Caravan PH',
		handle: '@artcaravanph',
		category: 'Workshop',
		location: 'Manila',
		platform: 'Instagram',
		stage: 'new',
		ownerId: null,
		eventName: '4 events folded in',
		siblings: 4,
		source: 'scraper',
		createdAt: '2026-06-20',
		lastActivityAt: '2026-06-20',
		age: { label: 'new', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'sinulog',
		name: 'Sinulog Street Party',
		handle: '@sinulogstreet',
		category: 'Bar/DJ',
		location: 'Cebu',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: null,
		formerOwnerId: 'angel',
		eventName: 'Sinulog 2027 Pre-party',
		eventDate: '17 Jan',
		source: 'sheet_import',
		createdAt: '2026-05-20',
		lastActivityAt: '2026-06-05',
		age: { label: '19d', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'grace',
		name: 'Grace Community Church',
		handle: '@gracecommph',
		category: 'Church',
		location: 'Quezon City',
		platform: 'Facebook',
		stage: 'new',
		ownerId: null,
		eventName: 'Easter Worship Conf.',
		eventDate: '5 Apr',
		source: 'manual',
		createdAt: '2026-06-19',
		lastActivityAt: '2026-06-19',
		age: { label: 'new', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'mindanaocup',
		name: 'Mindanao Cup Basketball',
		handle: '@mindanaocup',
		category: 'Sports',
		location: 'Davao',
		platform: 'Facebook',
		stage: 'contacted',
		ownerId: null,
		formerOwnerId: 'fatima',
		eventName: 'Mindanao Cup Finals',
		eventDate: '8 Sep',
		source: 'sheet_import',
		createdAt: '2026-05-01',
		lastActivityAt: '2026-06-01',
		age: { label: '23d', type: 'normal' },
		urgency: 'normal'
	},
	{
		id: 'boholtheater',
		name: 'Bohol Little Theater',
		handle: '@boholtheater',
		category: 'Theater',
		location: 'Tagbilaran',
		platform: 'Facebook',
		stage: 'replied',
		ownerId: null,
		formerOwnerId: 'divine',
		eventName: 'Rep Season Opener',
		eventDate: '12 Aug',
		source: 'sheet_import',
		createdAt: '2026-04-02',
		lastActivityAt: '2026-05-15',
		age: { label: '40d cold', type: 'stale' },
		urgency: 'cold'
	}
];

/** Activity timelines keyed by lead id. Leads without an entry get a seeded first touch. */
export const mockActivities: Record<string, Activity[]> = {
	christian: [
		{
			id: 'a1',
			leadId: 'christian',
			repId: 'jonna',
			channel: 'fb_dm',
			outcome: 'no_response',
			createdAt: '2026-06-21T09:14:00+08:00',
			followUpAt: '2026-06-24',
			note: 'Followed up on pricing tiers + sent the sample contract. No reply yet — booked a 3-day nudge.'
		},
		{
			id: 'a2',
			leadId: 'christian',
			repId: 'jonna',
			channel: 'fb_dm',
			outcome: 'replied',
			createdAt: '2026-06-14T14:40:00+08:00',
			note: 'They asked about per-event fees and payout timeline. Promised a one-pager.'
		},
		{
			id: 'a3',
			leadId: 'christian',
			repId: 'jonna',
			channel: 'fb_comment',
			outcome: 'sent',
			createdAt: '2026-06-10T11:02:00+08:00',
			note: 'Commented on their Worship Night Vol. 4 teaser to warm them up.'
		},
		{
			id: 'a4',
			leadId: 'christian',
			repId: 'jonna',
			channel: 'fb_dm',
			outcome: 'sent',
			createdAt: '2026-06-08T16:25:00+08:00',
			note: 'First touch — intro + Veent ticketing pitch.'
		}
	]
};

export const mockReviewItems: ReviewItem[] = [
	{
		id: 'r1',
		issue: 'Blank page name',
		raw: 'facebook.com/100087431122…',
		rowNo: 1184,
		name: '',
		category: 'Uncategorized',
		platform: 'Facebook'
	},
	{
		id: 'r2',
		issue: 'Malformed row recovered',
		raw: 'CDO Trade Hall;;Expo;;facebook',
		rowNo: 1192,
		name: 'CDO Trade Hall',
		category: 'Expo',
		platform: 'Facebook'
	},
	{
		id: 'r3',
		issue: 'No category',
		raw: 'Iloilo Dragonboat Federation',
		rowNo: 1207,
		name: 'Iloilo Dragonboat Federation',
		category: 'Uncategorized',
		platform: 'Facebook'
	},
	{
		id: 'r4',
		issue: 'Uncategorized handle',
		raw: '@unknown_promoter_cebu',
		rowNo: 1233,
		name: '',
		category: 'Uncategorized',
		platform: 'Instagram'
	}
];

/**
 * Reports are an org-wide aggregate snapshot (thousands of leads), not derived
 * from the demo lead list. Deal value is bucketed per currency, never summed.
 */
export const mockReport: ReportData = {
	conversionRate: 7.7,
	funnel: [
		{ stage: 'new', label: 'new', color: '#64748b', count: 612, pct: 100 },
		{ stage: 'contacted', label: 'contacted', color: '#2563eb', count: 410, pct: 67 },
		{ stage: 'replied', label: 'replied', color: '#7c3aed', count: 224, pct: 37 },
		{ stage: 'in_discussion', label: 'in discussion', color: '#c2710c', count: 138, pct: 23 },
		{ stage: 'won', label: 'won', color: '#0e9f6e', count: 47, pct: 8 }
	],
	leaderboard: [
		{ repId: 'ethyl', name: 'Ethyl', touches: 312, replies: 96, wins: 14 },
		{ repId: 'jonna', name: 'Jonna', touches: 288, replies: 84, wins: 11 },
		{ repId: 'meybelle', name: 'Meybelle', touches: 254, replies: 77, wins: 9 },
		{ repId: 'elay', name: 'Elay', touches: 201, replies: 63, wins: 8 },
		{ repId: 'shane', name: 'Shane', touches: 176, replies: 51, wins: 5 }
	],
	currencyTotals: [
		{ currency: 'PHP', label: 'PHP — Philippine peso', total: 3910000, deals: 47 },
		{ currency: 'SGD', label: 'SGD — Singapore dollar', total: 24500, deals: 3 }
	]
};
