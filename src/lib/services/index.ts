/**
 * The active CRM client. Today it is the in-memory mock; swap this single line
 * for the real implementation when the backend lands — nothing else changes.
 */
import { mockCrmClient } from './mock-crm-client';
import type { CrmClient } from './crm-client';

export const crm: CrmClient = mockCrmClient;

// Re-export so callers can `import { crm, type CrmClient } from '$lib/services'`.
export type { CrmClient } from './crm-client';
export { mockCrmClient } from './mock-crm-client';
