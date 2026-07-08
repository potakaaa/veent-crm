import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crmLeads, crmOrganizers } from '$lib/server/db/schema';
import { importPreviewRequestSchema } from '$lib/zod/schemas';
import { deriveNormalizedHandle, type PreviewRow } from '$lib/utils/import-mapping';
import { flagDuplicates } from '$lib/utils/import-dedup';

// POST /api/import/preview — dedup-check ONLY, zero writes. Server re-validates every row (client
// data is never trusted) and runs ONE batched query per target (E3 — never a per-row loop) to
// build the existing-handle/source-ref sets, then flags duplicates in memory.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = importPreviewRequestSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Invalid import payload';
		throw error(400, msg);
	}

	const { target, rows } = parsed.data;

	// Build preview rows with their advisory dedup keys (mirrors the client, recomputed server-side).
	const previewRows: PreviewRow[] = rows.map((data, index) => ({
		index,
		data,
		normalizedHandle: deriveNormalizedHandle(data, target),
		sourceRef: target === 'leads' && data.sourceRef ? data.sourceRef.trim() || null : null,
		isDuplicate: false
	}));

	const handles = [
		...new Set(
			previewRows.map((r) => r.normalizedHandle?.toLowerCase()).filter((h): h is string => !!h)
		)
	];
	const sourceRefs = [
		...new Set(previewRows.map((r) => r.sourceRef).filter((s): s is string => !!s))
	];

	const existingHandles = new Set<string>();
	const existingSourceRefs = new Set<string>();

	if (target === 'leads') {
		const conds = [];
		if (handles.length) {
			conds.push(inArray(sql`lower(${crmLeads.normalizedHandle})`, handles));
		}
		if (sourceRefs.length) {
			conds.push(inArray(crmLeads.sourceRef, sourceRefs));
		}
		if (conds.length) {
			const existing = await db
				.select({ handle: crmLeads.normalizedHandle, sourceRef: crmLeads.sourceRef })
				.from(crmLeads)
				.where(and(isNull(crmLeads.deletedAt), or(...conds)));
			for (const row of existing) {
				if (row.handle) existingHandles.add(row.handle.toLowerCase());
				if (row.sourceRef) existingSourceRefs.add(row.sourceRef);
			}
		}
	} else {
		if (handles.length) {
			const existing = await db
				.select({ handle: crmOrganizers.normalizedHandle })
				.from(crmOrganizers)
				.where(inArray(sql`lower(${crmOrganizers.normalizedHandle})`, handles));
			for (const row of existing) {
				if (row.handle) existingHandles.add(row.handle.toLowerCase());
			}
		}
	}

	const flagged = flagDuplicates(previewRows, existingHandles, existingSourceRefs);

	return json({
		previews: flagged.map((p) => ({
			index: p.index,
			data: p.data,
			isDuplicate: p.isDuplicate,
			duplicateReason: p.duplicateReason
		}))
	});
};
