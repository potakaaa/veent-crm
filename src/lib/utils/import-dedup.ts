// Pure in-memory duplicate-flagging for the import wizard preview step (AC7). NO DB import — the
// server endpoint runs ONE batched query per target to build the existing-handle/source-ref sets,
// then hands them here. Matching is done entirely in memory.

import type { PreviewRow } from './import-mapping';

/**
 * Flag each preview row as a duplicate when its `normalizedHandle` matches an existing record
 * (case-insensitive) or its `sourceRef` matches an existing lead source reference. `sourceRef`
 * takes priority as the more specific key. Returns a NEW array; input rows are not mutated.
 *
 * `existingHandles` MUST contain already-lowercased handles; `existingSourceRefs` contains exact
 * source-ref strings.
 */
export function flagDuplicates(
	previewRows: PreviewRow[],
	existingHandles: Set<string>,
	existingSourceRefs: Set<string>
): PreviewRow[] {
	return previewRows.map((row) => {
		if (row.sourceRef && existingSourceRefs.has(row.sourceRef)) {
			return { ...row, isDuplicate: true, duplicateReason: 'sourceRef' };
		}
		if (row.normalizedHandle && existingHandles.has(row.normalizedHandle.toLowerCase())) {
			return { ...row, isDuplicate: true, duplicateReason: 'normalizedHandle' };
		}
		return { ...row, isDuplicate: false, duplicateReason: undefined };
	});
}
