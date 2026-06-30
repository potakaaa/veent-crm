// CLI-side re-export of the shared import helpers. The canonical implementation lives in
// src/lib/server/import-utils.ts (so the SvelteKit route can import it via $lib without a
// cross-`src/` relative import). Scripts may reach into src/ via a relative path because the
// shared module is pure (no $lib/$env). Single source of truth — no duplication/drift.
export {
	slugify,
	extractHandleFromUrl,
	normalizeHandle,
	mapCategory,
	normalizePlatform,
	normalizeCountry,
	type CrmLeadCategory,
	type CrmLeadPlatform
} from '../../src/lib/server/import-utils';
