// Browser-side Better Auth client (magic-link). Imported by .svelte components.
import { createAuthClient } from 'better-auth/svelte';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	plugins: [magicLinkClient()]
});
