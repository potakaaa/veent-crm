/**
 * Tests the NeonPool WebSocket path (same driver the app uses) against the
 * current DATABASE_URL. Use this to surface the real cause behind "Failed query".
 * Usage: bun run scripts/test-neon-pool.ts
 */
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const connectionString = DATABASE_URL.replace(/[&?]channel_binding=[^&]*/g, '');
console.log('endpoint:', connectionString.replace(/:[^:@]+@/, ':***@'));

const pool = new Pool({ connectionString });
const db = drizzle(pool);

try {
	const result = await db.execute(sql`
		SELECT m.id, m.nextcloud_uid, u.first_name, u.color, o.name
		FROM crm_meetings m
		LEFT JOIN crm_users u ON m.organizer_id = u.id
		LEFT JOIN crm_organizers o ON m.lead_organizer_id = o.id
		LIMIT 1
	`);
	console.log('✓ query succeeded, rows:', result.rows.length);
} catch (e: unknown) {
	console.error('✗ query failed');
	if (e instanceof Error) {
		console.error('message:', e.message);
		if ('cause' in e && e.cause instanceof Error) {
			console.error('cause:', e.cause.message);
		}
		if ('cause' in e) console.error('cause (raw):', e.cause);
	}
} finally {
	await pool.end();
}
