/**
 * Lead-source humanizing helper. Shared source of truth for the source badge
 * label + Tailwind color class, extracted from the inline maps that used to
 * live in review/ and unassigned/ so both pages render identical labels.
 */
import type { LeadSource } from '$lib/types';

export type SourceMeta = { label: string; class: string };

const MAP: Record<LeadSource, SourceMeta> = {
	scraper: { label: 'Scraped', class: 'bg-teal-50 text-teal-700' },
	manual: { label: 'Manual', class: 'bg-ink-50 text-ink-500' },
	sheet_import: { label: 'Import', class: 'bg-amber-50 text-amber-700' },
	other: { label: 'Other', class: 'bg-ink-50 text-ink-400' }
};

export const sourceLabel = (source: LeadSource): SourceMeta => MAP[source];
