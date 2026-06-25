import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Liveness probe for Docker healthcheck + external uptime check (see sales-crm.md §Health & uptime).
// STUB: real impl can also ping the DB pool. Kept dependency-free so it stays green during boot.
export const GET: RequestHandler = async () => {
	return json({ status: 'ok', service: 'veent-crm', version: 'v0-stub' });
};
