// Seed 10 crm_users: 1 manager + 5 active reps + 4 former reps (no login).
// Emails for active reps are placeholders — update when rep email map is confirmed
// (open decision in docs/sales-crm.md).
// UUIDs are fixed so reruns are idempotent (ON CONFLICT DO NOTHING).
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { crmUsers } from '../src/lib/server/db/schema.ts';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL ?? 'postgres://crm:crm@127.0.0.1:5432/veent_crm';
const client = postgres(url, { max: 1 });
const db = drizzle(client);

const users: (typeof crmUsers.$inferInsert)[] = [
	{
		id: '00000000-0000-0000-0000-000000000001',
		name: 'John Sabuga',
		email: 'john.sabuga@test.com',
		role: 'manager',
		active: true
	},
	{
		id: '00068e3d-13ba-4251-96f9-947ed18c64b5',
		name: 'Hans Matthew Del Mundo',
		email: 'delmundo.hansmatthew@gmail.com',
		role: 'manager',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000002',
		name: 'Jonna',
		email: 'jonna@test.com',
		role: 'rep',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000003',
		name: 'Ethyl',
		email: 'ethyl@test.com',
		role: 'rep',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000004',
		name: 'Meybelle',
		email: 'meybelle@test.com',
		role: 'rep',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000005',
		name: 'Shane',
		email: 'shane@test.com',
		role: 'rep',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000006',
		name: 'Elay',
		email: 'elay@test.com',
		role: 'rep',
		active: true
	},
	{
		id: '00000000-0000-0000-0000-000000000007',
		name: 'Angel',
		email: null,
		role: 'rep',
		active: false
	},
	{
		id: '00000000-0000-0000-0000-000000000008',
		name: 'Fatima',
		email: null,
		role: 'rep',
		active: false
	},
	{
		id: '00000000-0000-0000-0000-000000000009',
		name: 'Divine',
		email: null,
		role: 'rep',
		active: false
	},
	{
		id: '00000000-0000-0000-0000-000000000010',
		name: 'Dhen',
		email: null,
		role: 'rep',
		active: false
	}
];

try {
	await db
		.insert(crmUsers)
		.values(users)
		.onConflictDoUpdate({
			target: crmUsers.id,
			set: {
				name: sql`EXCLUDED.name`,
				email: sql`EXCLUDED.email`,
				role: sql`EXCLUDED.role`,
				active: sql`EXCLUDED.active`
			}
		});
	console.log(`Seeded ${users.length} users`);
} finally {
	await client.end();
}
