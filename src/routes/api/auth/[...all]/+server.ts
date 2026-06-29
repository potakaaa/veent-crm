// Better Auth catch-all: forwards every /api/auth/* request to the auth handler.
import { auth } from '$lib/server/auth';
import { toSvelteKitHandler } from 'better-auth/svelte-kit';

export const GET = toSvelteKitHandler(auth);
export const POST = toSvelteKitHandler(auth);
