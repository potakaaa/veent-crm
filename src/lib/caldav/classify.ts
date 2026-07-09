/**
 * Emoji-based classifier for CalDAV events → CalendarEntry (NCAL-5).
 * SERVER-ONLY. Pure function — no DB or network calls.
 *
 * Classification order (first match wins):
 *  1. Emoji prefix on NFC-normalized title
 *  2. Suffix pattern on full raw title
 *  3. Fallback → 'team-event'
 */
import type { CalendarEvent } from './parser';
import { CATEGORY_COLORS } from './constants';
import type { CalendarEntry } from '$lib/types';

// Export CATEGORY_COLORS re-export so tests can import from classify.ts
export { CATEGORY_COLORS };

/** Emoji → CalendarEntry.type mappings (order matters — longest match first for FE0F). */
const EMOJI_MAP: Array<{ prefix: string; type: CalendarEntry['type'] }> = [
	// 🎟️ admission tickets — U+1F39F U+FE0F (with variation selector)
	{ prefix: '\u{1F39F}\u{FE0F}', type: 'golive' },
	// 🎟 admission tickets bare — U+1F39F (without variation selector)
	{ prefix: '\u{1F39F}', type: 'golive' },
	// ✈️ airplane — U+2708 U+FE0F (with variation selector)
	{ prefix: '\u{2708}\u{FE0F}', type: 'travel' },
	// ✈ airplane bare — U+2708 (without variation selector)
	{ prefix: '\u{2708}', type: 'travel' },
	// 💼 briefcase
	{ prefix: '\u{1F4BC}', type: 'meeting' },
	// 👥 busts in silhouette
	{ prefix: '\u{1F465}', type: 'meeting' },
	// 🚀 rocket
	{ prefix: '\u{1F680}', type: 'eventstart' },
	// 🎉 party popper
	{ prefix: '\u{1F389}', type: 'eventstart' }
];

/** Suffix patterns for events without recognized emoji prefixes. */
const SUFFIX_PATTERNS: Array<{ test: (title: string) => boolean; type: CalendarEntry['type'] }> = [
	{
		test: (t) => t.endsWith('— Ticket Sale Start') || t.endsWith('— Ticket Sale Start'),
		type: 'golive'
	},
	{ test: (t) => t.endsWith('— Event Date') || t.endsWith('— Event Date'), type: 'eventstart' },
	{ test: (t) => t.startsWith('Meeting with ') || t === 'Team Meeting', type: 'meeting' }
];

interface ClassifyResult {
	type: CalendarEntry['type'];
	displayTitle: string;
}

function classifyTitle(rawTitle: string): ClassifyResult {
	const normalized = rawTitle.normalize('NFC');

	// 1. Emoji prefix match
	for (const { prefix, type } of EMOJI_MAP) {
		if (normalized.startsWith(prefix)) {
			// Strip emoji + one following space (if present)
			let rest = normalized.slice(prefix.length);
			if (rest.startsWith(' ')) rest = rest.slice(1);
			return { type, displayTitle: rest };
		}
	}

	// 2. Suffix pattern match (on NFC title)
	for (const { test, type } of SUFFIX_PATTERNS) {
		if (test(normalized)) {
			return { type, displayTitle: normalized };
		}
	}

	// 3. Fallback
	return { type: 'team-event', displayTitle: normalized };
}

/**
 * Classifies a list of CalDAV events into typed CalendarEntry[] using emoji prefixes
 * and title suffix patterns.
 *
 * AC2-AC8: emoji and suffix classification rules.
 * AC10: `id` format is `{type}-{uid}`.
 * AC11: field mapping mirrors mapTeamEvents (href, url, description, location, status, categories).
 */
export function classifyCalDavEvents(events: CalendarEvent[]): CalendarEntry[] {
	return events.map((e) => {
		const rawTitle = e.title ?? '';
		const { type, displayTitle } = classifyTitle(rawTitle);
		const entry: CalendarEntry = {
			id: `${type}-${e.uid}`,
			type,
			startAt: e.start,
			title: displayTitle || '(No title)',
			href: e.url ?? '',
			uid: e.uid,
			url: e.url ?? undefined,
			description: e.description ?? undefined,
			location: e.location ?? undefined,
			status: e.status ?? undefined,
			categories: e.category ?? undefined
		};
		return entry;
	});
}

/**
 * Filters CalendarEntry[] by ownership for the current user.
 *
 * Rules:
 *  - Has `/leads/` in href → lead ownership check via ownerMap
 *  - Has `/meetings/` in href → meeting ownership check via meetingOwnerMap
 *  - No CRM link (neither):
 *    - filterRepId set (manager scoped to a rep) → HIDE (can't attribute to a specific rep)
 *    - Rep or unfiltered manager → keep (team-wide event)
 *
 * For CRM-linked entries:
 *    - ownerId unknown → DROP for reps and manager+filterRepId
 *    - Rep: keep only if ownerId === userId
 *    - Manager + filterRepId: keep only if ownerId === filterRepId
 *    - Manager, no filterRepId: keep all
 */
export function filterByOwnership(
	entries: CalendarEntry[],
	params: {
		userId: string;
		role: string;
		filterRepId?: string;
		ownerMap: Map<string, string>; // leadId → ownerId
		meetingOwnerMap?: Map<string, string>; // meetingId → organizerUserId
	}
): CalendarEntry[] {
	const { userId, role, filterRepId, ownerMap, meetingOwnerMap } = params;
	const isManager = role === 'manager' || role === 'super_manager';

	return entries.filter((entry) => {
		const hasLeadUrl = entry.href.includes('/leads/');
		const hasMeetingUrl = entry.href.includes('/meetings/');

		if (!hasLeadUrl && !hasMeetingUrl) {
			// No CRM link — hide when a rep filter is active (can't attribute to a specific rep)
			if (filterRepId) return false;
			return true;
		}

		let ownerId: string | undefined;

		if (hasLeadUrl) {
			const match = entry.href.match(/\/leads\/([^/?#]+)/);
			const leadId = match ? match[1] : null;
			if (!leadId) return true; // Malformed URL — keep
			ownerId = ownerMap.get(leadId);
		} else {
			// /meetings/ entry
			const match = entry.href.match(/\/meetings\/([^/?#]+)/);
			const meetingId = match ? match[1] : null;
			if (!meetingId) return true; // Malformed URL — keep
			ownerId = meetingOwnerMap?.get(meetingId);
		}

		if (!isManager) {
			return ownerId === userId;
		}

		if (filterRepId) {
			return ownerId === filterRepId;
		}

		// Manager, no filter: show all
		return true;
	});
}
