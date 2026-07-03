// Drizzle client over a bounded postgres-js pool (max ~10 — see sales-crm.md §Deployment).
// Connection is LAZY: postgres-js does not open a socket until the first query runs.
// The client is also lazily CONSTRUCTED behind a Proxy so that importing `db` never
// requires DATABASE_URL (unit specs import `db` and self-skip when it is unset). The first
// real query fails fast with a clear message when DATABASE_URL is not set — no silent
// fallback to a phantom localhost DB.
//
// Exception: under Vitest, construction falls back to an inert placeholder string instead
// of throwing. Some specs build Drizzle query objects via `.toSQL()` to assert generated SQL
// shape without ever executing a query (e.g. templates-db.spec.ts, leads.spec.ts,
// calendar-db.spec.ts) — they need a constructible client but never open a socket, so a
// placeholder is safe here even though it would be unsafe in production.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

type Database = ReturnType<typeof createDb>;

function createDb() {
	if (!env.DATABASE_URL && !process.env.VITEST) {
		throw new Error('DATABASE_URL env var is not set');
	}

	// postgres-js doesn't understand channel_binding — strip it from the URL.
	const rawUrl =
		env.DATABASE_URL ?? 'postgres://placeholder:placeholder@localhost:5432/placeholder';
	const connectionString = rawUrl.replace(/[&?]channel_binding=[^&]*/g, '');

	// Neon pooler uses PgBouncer in transaction mode which doesn't support prepared
	// statements. Detect by checking for the Neon hostname and disable accordingly.
	// Local Docker Postgres keeps prepare: true for performance.
	const isNeon = connectionString.includes('neon.tech');
	const client = postgres(connectionString, { max: 10, prepare: !isNeon });

	return drizzle(client, { schema });
}

let _db: Database | undefined;

function getDb(): Database {
	if (!_db) _db = createDb();
	return _db;
}

// Import-safe Proxy: constructing this never touches DATABASE_URL, so modules (and unit
// specs) can import `db` freely. Any property access triggers lazy construction, which
// throws fast if DATABASE_URL is unset.
export const db = new Proxy({} as Database, {
	get(_target, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	}
});

export { schema };
