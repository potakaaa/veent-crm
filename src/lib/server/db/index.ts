// Drizzle client over a bounded postgres-js pool (max ~10 — see sales-crm.md §Deployment).
// Connection is LAZY: postgres-js does not open a socket until the first query runs, so the
// stub app boots fine with a placeholder DATABASE_URL. No live DB is required for v0.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const rawUrl = env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/veent_crm';

// postgres-js doesn't understand channel_binding — strip it from the URL.
const connectionString = rawUrl.replace(/[&?]channel_binding=[^&]*/g, '');

// Neon pooler uses PgBouncer in transaction mode which doesn't support prepared
// statements. Detect by checking for the Neon hostname and disable accordingly.
// Local Docker Postgres keeps prepare: true for performance.
const isNeon = connectionString.includes('neon.tech');
const client = postgres(connectionString, { max: 10, prepare: !isNeon });

export const db = drizzle(client, { schema });
export { schema };
