// Pure column-mapping + preview/commit builders for the import wizard. NO SvelteKit or DB imports
// — safe to unit-test in the node vitest project. `category` is deliberately absent from every
// mappable-field list (dropped in migration 0028; SPEC Out of Scope).

import { normalizeHandle } from '$lib/utils/normalize';

export type ImportTarget = 'leads' | 'organizers';

export interface MappableField {
	key: string;
	label: string;
}

// Lead-target mappable CRM fields. NOTE: `category` intentionally excluded (migration 0028).
export const LEAD_IMPORT_FIELDS: readonly MappableField[] = [
	{ key: 'name', label: 'Name (organizer / page)' },
	{ key: 'location', label: 'Location' },
	{ key: 'pageUrl', label: 'Page URL' },
	{ key: 'contactEmail', label: 'Contact email' },
	{ key: 'contactPhone', label: 'Contact phone' },
	{ key: 'socialFacebook', label: 'Facebook URL' },
	{ key: 'socialInstagram', label: 'Instagram URL' },
	{ key: 'eventName', label: 'Event name' },
	{ key: 'eventLink', label: 'Event link' },
	{ key: 'notes', label: 'Notes' },
	{ key: 'sourceRef', label: 'Source reference (dedup key)' }
] as const;

// Organizer-target mappable CRM fields.
export const ORGANIZER_IMPORT_FIELDS: readonly MappableField[] = [
	{ key: 'name', label: 'Name' },
	{ key: 'socialFacebook', label: 'Facebook URL' },
	{ key: 'socialInstagram', label: 'Instagram URL' },
	{ key: 'website', label: 'Website' },
	{ key: 'email', label: 'Email' },
	{ key: 'phone', label: 'Phone' },
	{ key: 'location', label: 'Location' }
] as const;

// True entity-minimum fields (DB `notNull`): only `name` for both targets.
const MINIMUM_FIELDS: Record<ImportTarget, string[]> = {
	leads: ['name'],
	organizers: ['name']
};

export function fieldsForTarget(target: ImportTarget): readonly MappableField[] {
	return target === 'leads' ? LEAD_IMPORT_FIELDS : ORGANIZER_IMPORT_FIELDS;
}

/**
 * A column mapping: header name (from the parsed CSV/Sheet) → CRM field key. A header mapped to
 * `''`/absent means "Don't import" that column.
 */
export type ColumnMapping = Record<string, string>;

export interface MappingValidation {
	valid: boolean;
	reason?: string;
}

/**
 * A mapping is valid when every one of the target's minimum-required fields is assigned to some
 * column. Partial mappings (extra columns skipped) are allowed — only true entity-minimum fields
 * are hard-required (AC5).
 */
export function validateMapping(mapping: ColumnMapping, target: ImportTarget): MappingValidation {
	const assigned = new Set(Object.values(mapping).filter((f) => f && f.length > 0));
	for (const required of MINIMUM_FIELDS[target]) {
		if (!assigned.has(required)) {
			const label = fieldsForTarget(target).find((f) => f.key === required)?.label ?? required;
			return { valid: false, reason: `"${label}" must be mapped to a column before importing.` };
		}
	}
	return { valid: true };
}

export interface PreviewRow {
	index: number;
	data: Record<string, string>;
	normalizedHandle: string | null;
	sourceRef: string | null;
	isDuplicate: boolean;
	duplicateReason?: 'normalizedHandle' | 'sourceRef';
}

/**
 * Build preview rows from parsed data + the current column mapping. Pure — performs ZERO writes and
 * imports no DB client (AC6). Computes a `normalizedHandle`/`sourceRef` per row (used later by the
 * dedup pass) but does not itself flag duplicates.
 */
export function buildPreviewRows(
	rows: string[][],
	headers: string[],
	mapping: ColumnMapping,
	target: ImportTarget
): PreviewRow[] {
	return rows.map((cols, index) => {
		const data: Record<string, string> = {};
		headers.forEach((header, colIdx) => {
			const field = mapping[header];
			if (field && field.length > 0) {
				const value = cols[colIdx] ?? '';
				data[field] = value.trim();
			}
		});
		return {
			index,
			data,
			normalizedHandle: deriveNormalizedHandle(data, target),
			sourceRef: data.sourceRef ? data.sourceRef.trim() || null : null,
			isDuplicate: false
		};
	});
}

/**
 * Derive the advisory dedup handle for a mapped row, mirroring the server ingest path's priority
 * (Facebook → Instagram → website/pageUrl → slugify(name)). Returns null when there is nothing to
 * key on (no name and no URLs).
 */
export function deriveNormalizedHandle(
	data: Record<string, string>,
	target: ImportTarget
): string | null {
	const name = data.name?.trim();
	const fb = data.socialFacebook?.trim() || undefined;
	const ig = data.socialInstagram?.trim() || undefined;
	const web = (target === 'leads' ? data.pageUrl : data.website)?.trim() || undefined;
	if (!name && !fb && !ig && !web) return null;
	const handle = normalizeHandle(fb, ig, web, name);
	return handle || null;
}

// --- Commit-side pure builders (AC7 payload builder, AC10 result summary) ------------------

export interface CommitRow {
	data: Record<string, string>;
	skip: boolean;
}

/**
 * Partition user-decided commit rows into the ones to actually import vs the count the user chose
 * to skip. Honors the per-row skip/import choice (AC7) — a skipped row never reaches the insert
 * path and is counted as skipped, not errored (AC11).
 */
export function partitionCommitRows(rows: CommitRow[]): {
	toImport: Array<{ index: number; data: Record<string, string> }>;
	skipped: number;
} {
	const toImport: Array<{ index: number; data: Record<string, string> }> = [];
	let skipped = 0;
	rows.forEach((row, index) => {
		if (row.skip) {
			skipped++;
		} else {
			toImport.push({ index, data: row.data });
		}
	});
	return { toImport, skipped };
}

export interface CommitError {
	index: number;
	message: string;
}

export interface CommitSummary {
	created: number;
	skipped: number;
	errored: number;
	errors: CommitError[];
}

/**
 * Build the final result summary (AC10) from the number of successfully-created rows, the skipped
 * count, and the collected per-row errors. Pure counting — no DB access.
 */
export function buildCommitSummary(
	created: number,
	skipped: number,
	errors: CommitError[]
): CommitSummary {
	return { created, skipped, errored: errors.length, errors };
}
