/**
 * CSV export helpers for the reports / leads views.
 */
import type { Lead } from '$lib/types';
import { stageLabel } from './stages';

const escape = (v: unknown): string => {
	const s = v === null || v === undefined ? '' : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CsvColumn<T> {
	header: string;
	value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
	const head = columns.map((c) => escape(c.header)).join(',');
	const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(',')).join('\n');
	return `${head}\n${body}`;
}

export const LEAD_CSV_COLUMNS: CsvColumn<Lead>[] = [
	{ header: 'Name', value: (l) => l.name },
	{ header: 'Handle', value: (l) => l.handle },
	{ header: 'Platform', value: (l) => l.platform },
	{ header: 'Category', value: (l) => l.category },
	{ header: 'Location', value: (l) => l.location },
	{ header: 'Stage', value: (l) => stageLabel(l.stage) },
	{ header: 'Owner', value: (l) => l.ownerId ?? 'unassigned' },
	{ header: 'Event', value: (l) => l.eventName ?? '' },
	{ header: 'Last activity', value: (l) => l.lastActivityAt },
	{ header: 'Deal value', value: (l) => l.dealValue ?? '' },
	{ header: 'Currency', value: (l) => l.currency ?? '' }
];

export const leadsToCsv = (leads: Lead[]): string => toCsv(leads, LEAD_CSV_COLUMNS);

/** Browser-only: trigger a download of CSV text. */
export function downloadCsv(filename: string, csv: string): void {
	if (typeof document === 'undefined') return;
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
