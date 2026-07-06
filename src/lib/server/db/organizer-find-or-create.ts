/**
 * Shared find-or-create for organizer records (GitHub #189/#190 follow-on).
 *
 * Lives in its OWN file (NOT organizers.ts) on purpose: organizers.ts transitively imports
 * `$env/dynamic/private` via ./index, a SvelteKit virtual module that only resolves inside
 * Vite. This module imports ONLY schema.ts (zero $env dependency) and takes the DB client as
 * an explicit parameter (type-only import of its shape), so it is safe to import from BOTH
 * SvelteKit routes AND plain `bun run scripts/*.ts` CLIs.
 */
import { crmOrganizers } from './schema';
import { sql } from 'drizzle-orm';
import type { db } from './index';

// Type-only import — erased at compile time, so no runtime $env pull-in.
type Db = typeof db;

export interface FindOrCreateOrganizerInput {
	normalizedHandle: string;
	name: string;
	socialFacebook?: string | null;
	socialInstagram?: string | null;
	website?: string | null;
	email?: string | null;
	phone?: string | null;
	location?: string | null;
}

export interface FindOrCreateOrganizerOptions {
	/**
	 * When true, do NOT insert a new organizer if none is found — return `null` instead. An
	 * existing match still returns its real id (that's a read, not a write). Used by the
	 * dry-run backfill path so `--dry-run` performs zero writes.
	 */
	dryRun?: boolean;
}

/**
 * Case-insensitive lookup by normalizedHandle; insert if missing. Returns the organizer id
 * (existing or newly-created). No DB uniqueness constraint / transaction — matches the
 * existing lead-dedup race tolerance (accepted risk). Never throws on "not found" — only on a
 * real DB error (callers decide catch-vs-propagate) or when normalizedHandle is empty.
 *
 * Overloads keep the default (no-opts / dryRun-absent) callers getting `Promise<string>`
 * non-null; only the explicit `{ dryRun: true }` path widens to `string | null`.
 */
export async function findOrCreateOrganizer(
	input: FindOrCreateOrganizerInput,
	dbClient: Db
): Promise<string>;
export async function findOrCreateOrganizer(
	input: FindOrCreateOrganizerInput,
	dbClient: Db,
	opts: FindOrCreateOrganizerOptions
): Promise<string | null>;
export async function findOrCreateOrganizer(
	input: FindOrCreateOrganizerInput,
	dbClient: Db,
	opts?: FindOrCreateOrganizerOptions
): Promise<string | null> {
	if (!input.normalizedHandle) {
		throw new Error('findOrCreateOrganizer: normalizedHandle is required');
	}

	const [existing] = await dbClient
		.select({ id: crmOrganizers.id })
		.from(crmOrganizers)
		.where(sql`lower(${crmOrganizers.normalizedHandle}) = lower(${input.normalizedHandle})`)
		.limit(1);

	if (existing) return existing.id;

	// Dry-run: no match found → report-only, perform no write.
	if (opts?.dryRun) return null;

	const [created] = await dbClient
		.insert(crmOrganizers)
		.values({
			name: input.name,
			normalizedHandle: input.normalizedHandle,
			socialFacebook: input.socialFacebook ?? null,
			socialInstagram: input.socialInstagram ?? null,
			website: input.website ?? null,
			email: input.email ?? null,
			phone: input.phone ?? null,
			location: input.location ?? null
		})
		.returning({ id: crmOrganizers.id });

	return created.id;
}
