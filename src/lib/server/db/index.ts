// Drizzle client over a bounded postgres-js pool (max ~10 — see sales-crm.md §Deployment).
// Connection is LAZY: postgres-js does not open a socket until the first query runs, so the
// stub app boots fine with a placeholder DATABASE_URL. No live DB is required for v0.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const connectionString = env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/veent_crm';

// max ~10 — one long-running process, no PgBouncer needed at this scale.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
