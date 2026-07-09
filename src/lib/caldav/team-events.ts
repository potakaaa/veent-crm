import type { CalendarEvent } from './parser';
import type { CalendarEntry } from '$lib/types';

// CRM-synced events already appear as blue meeting chips from the DB query.
// Exclude them here to avoid duplicates.
const CRM_CATEGORIES = new Set(['meeting', 'golive', 'go-live', 'eventstart', 'event-start']);

/**
 * Maps parsed CalendarEvent[] to CalendarEntry[] for team-event chips.
 * Shows all Nextcloud events that aren't already synced CRM entries (those
 * appear as DB-backed blue chips). Manual events have category=null and
 * team-events created via the UI have category='team-event'.
 * Pure function — no server-side imports — so Vitest can import it directly.
 */
export function mapTeamEvents(
	events: CalendarEvent[],
	_range: { start: Date; end: Date }
): CalendarEntry[] {
	return events
		.filter((e) => !CRM_CATEGORIES.has(e.category ?? ''))
		.map((e) => ({
			id: `team-event-${e.uid}`,
			type: 'team-event' as const,
			startAt: e.start,
			title: e.title ?? '(No title)',
			href: e.url ?? '',
			uid: e.uid,
			url: e.url ?? undefined,
			description: e.description ?? undefined,
			location: e.location ?? undefined,
			status: e.status ?? undefined,
			categories: e.category ?? undefined
		}));
}
