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

import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

// Canonical DB type is postgres-js — both drivers share the same Drizzle query API at
// runtime, so we cast the Neon instance rather than exposing a union type (a union would
// incorrectly intersect method signatures like .returning() and break callers).
type Database = ReturnType<typeof drizzlePg<typeof schema>>;

function createDb(): Database {
	if (!env.DATABASE_URL && !process.env.VITEST) {
		throw new Error('DATABASE_URL env var is not set');
	}

	// postgres-js doesn't understand channel_binding — strip it from the URL.
	const rawUrl =
		env.DATABASE_URL ?? 'postgres://placeholder:placeholder@localhost:5432/placeholder';
	const connectionString = rawUrl.replace(/[&?]channel_binding=[^&]*/g, '');

	if (connectionString.includes('neon.tech')) {
		// Neon (Vercel / serverless): HTTP driver avoids TCP handshake overhead.
		// Each query is an HTTP fetch — no persistent connection needed, ~20-50ms vs ~200ms cold TCP.
		return drizzleNeon(neon(connectionString), { schema }) as unknown as Database;
	}

	// Local Docker / self-hosted Postgres: keep postgres-js TCP pool with prepared statements.
	return drizzlePg(postgres(connectionString, { max: 10, prepare: true }), { schema });
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
