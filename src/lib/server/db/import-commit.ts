/**
 * Server-side import-commit write logic for the CSV/Sheets import wizard (GitHub #210/#211).
 *
 * Lives in its OWN file and takes the DB client as an explicit parameter (type-only import of its
 * shape) — same pattern as organizer-find-or-create.ts — so it is directly DB-testable
 * (src/tests/import-commit-db.spec.ts, real-DB-or-skip) without going through the HTTP handler.
 *
 * AC8 (structural): writes ONLY the chosen target entity type — one top-level if/else branch, no
 * shared insert path, never both crm_leads and crm_organizers in one call. AC11: skipped rows never
 * reach the DB and are counted as skipped, not errored.
 */
import { crmLeads } from './schema';
import type { db as dbType } from './index';
import { findOrCreateOrganizer } from './organizer-find-or-create';
import {
	importLeadRowSchema,
	importOrganizerRowSchema,
	type ImportCommitRequest
} from '$lib/zod/schemas';
import {
	buildCommitSummary,
	deriveNormalizedHandle,
	type CommitError,
	type CommitSummary
} from '$lib/utils/import-mapping';
import {
	normalizePlatform,
	normalizeCountry,
	parseCountryFromLocation,
	inferCurrentPlatform
} from '../import-utils';

type Db = typeof dbType;

export async function runImportCommit(
	input: ImportCommitRequest,
	dbClient: Db
): Promise<CommitSummary> {
	const errors: CommitError[] = [];
	let created = 0;
	let skipped = 0;

	if (input.target === 'leads') {
		const now = new Date();
		const values: (typeof crmLeads.$inferInsert)[] = [];
		input.rows.forEach((row, index) => {
			if (row.skip) {
				skipped++;
				return;
			}
			const parsed = importLeadRowSchema.safeParse(row.data);
			if (!parsed.success) {
				errors.push({ index, message: parsed.error.issues[0]?.message ?? 'Invalid row' });
				return;
			}
			const data = parsed.data;
			values.push({
				name: data.name,
				normalizedHandle: deriveNormalizedHandle(data, 'leads'),
				location: data.location || null,
				country: normalizeCountry(parseCountryFromLocation(data.location)),
				pageUrl: data.pageUrl || null,
				contactEmail: data.contactEmail || null,
				contactPhone: data.contactPhone || null,
				socialFacebook: data.socialFacebook || null,
				socialInstagram: data.socialInstagram || null,
				eventName: data.eventName || null,
				eventLink: data.eventLink || null,
				notes: data.notes || null,
				sourceRef: data.sourceRef || null,
				platform: normalizePlatform(data.socialFacebook, data.socialInstagram, data.pageUrl),
				currentPlatform: inferCurrentPlatform(data.pageUrl, data.eventLink),
				source: 'sheet_import',
				stage: 'new',
				ownerId: null,
				createdAt: now,
				updatedAt: now
			});
		});
		if (values.length) {
			await dbClient.insert(crmLeads).values(values);
			created = values.length;
		}
	} else {
		for (let index = 0; index < input.rows.length; index++) {
			const row = input.rows[index];
			if (row.skip) {
				skipped++;
				continue;
			}
			const parsed = importOrganizerRowSchema.safeParse(row.data);
			if (!parsed.success) {
				errors.push({ index, message: parsed.error.issues[0]?.message ?? 'Invalid row' });
				continue;
			}
			const data = parsed.data;
			const normalizedHandle = deriveNormalizedHandle(data, 'organizers');
			if (!normalizedHandle) {
				errors.push({ index, message: 'Could not derive an organizer handle from this row' });
				continue;
			}
			try {
				await findOrCreateOrganizer(
					{
						normalizedHandle,
						name: data.name,
						socialFacebook: data.socialFacebook || null,
						socialInstagram: data.socialInstagram || null,
						website: data.website || null,
						email: data.email || null,
						phone: data.phone || null,
						location: data.location || null
					},
					dbClient
				);
				created++;
			} catch (e) {
				errors.push({
					index,
					message: e instanceof Error ? e.message : 'Failed to create organizer'
				});
			}
		}
	}

	return buildCommitSummary(created, skipped, errors);
}
