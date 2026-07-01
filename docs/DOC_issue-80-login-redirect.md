# Issue #80 — Redirect Unauthenticated Users to Login

Implemented: 2026-07-01
Surfaces: global session gate (`hooks.server.ts`), `/login`, `/unauthorized`

---

## What It Does

The global SvelteKit `handle` hook already gated every protected route behind a session
check. This change closes the two gaps issue #80 asked for on top of that existing gate:

1. **Redirect target preserves the originally-requested URL.** Hitting a protected route
   while unauthenticated now redirects to `/login?from=[encoded-path]` instead of a bare
   `/login`.
2. **Login carries the user back after sign-in.** The `/login` page reads `from`, sanitizes
   it, and passes it as the magic-link `callbackURL` — so completing sign-in returns the
   user to the page they originally wanted instead of always landing on `/`.

Two outcomes were already true before this change and are treated here as regression
guards, not new work:

- No protected content ever flashes before the redirect — the check runs in `handle`,
  server-side, before any page renders.
- No redirect loop on `/login` itself — `/login` is in `PUBLIC_PREFIXES`, so an
  unauthenticated hit on `/login` resolves normally instead of redirecting again.

---

## Session Gate (`src/hooks.server.ts`)

```ts
if (!isPublic && !event.locals.user) {
	if (!session?.user?.email) {
		// No Better Auth session at all — send to login.
		redirect(303, '/login?from=' + encodeURIComponent(path));
	}
	// Session exists but email isn't an active crm_users row — allowlist rejection.
	redirect(303, '/unauthorized?from=' + encodeURIComponent(path));
}
```

Two branches, decided by whether a Better Auth session exists at all:

| Case | Redirect target |
|---|---|
| No session (never signed in / invalid session cookie) | `/login?from=[path]` |
| Valid session, email has no active `crm_users` row (not allowlisted) | `/unauthorized?from=[path]` |
| Valid session, email has an active `crm_users` row | No redirect — `event.locals.user` is populated, request proceeds |

The allowlist lookup itself (`crmUsers` query, role/id resolution) is untouched — this
change only adds a query param to the destination of an already-correct redirect branch.

---

## Shared Helper: `sanitizeFrom`

**File:** `src/lib/server/sanitize-redirect.ts` (new)

```ts
export function sanitizeFrom(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith('/')) return null;
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
	if (raw.includes(':')) return null;
	return raw;
}
```

This function pre-existed as a private, inline copy inside `unauthorized/+page.server.ts`.
Since `/login` now needs the exact same open-redirect guard, it was extracted to a shared
module rather than duplicated — two independent copies of security-relevant
sanitization logic drifting out of sync (fix one, forget the other) was judged a real risk
for a ~6-line function.

Rejection rules (in order): empty/`null`, missing leading `/`, protocol-relative (`//`) or
backslash-relative (`/\`) targets, and anything containing a scheme (`:`). Anything that
survives all four checks is returned unchanged — a same-origin relative path.

Both consumers now import it:

```ts
// src/routes/unauthorized/+page.server.ts
import { sanitizeFrom } from '$lib/server/sanitize-redirect';
export const load: PageServerLoad = ({ url }) => {
	const from = sanitizeFrom(url.searchParams.get('from'));
	return { from };
};

// src/routes/login/+page.server.ts (new)
import type { PageServerLoad } from './$types';
import { sanitizeFrom } from '$lib/server/sanitize-redirect';
export const load: PageServerLoad = ({ url }) => ({ from: sanitizeFrom(url.searchParams.get('from')) });
```

---

## Login Page: Redirect-Back Wiring

**File:** `src/routes/login/+page.svelte`

```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	let { data } = $props();
	// ...
	async function sendMagic() {
		// ...
		const { error: err } = await authClient.signIn.magicLink({
			email: normalizedEmail,
			callbackURL: data.from ?? '/'
		});
		// ...
	}
</script>
```

`data.from` comes from the new `login/+page.server.ts` load function above. When present
(and sanitized), it becomes the magic-link `callbackURL`; otherwise sign-in falls back to
`/` (the prior hardcoded behavior).

When `data.from` is set, the page also shows a small "You were trying to reach `{data.from}`"
line above the email field — mirroring the existing messaging pattern already used on
`/unauthorized`. This is cosmetic and was optional per the plan; included because it was
trivial to add.

---

## Tests

**File:** `src/tests/hooks-server.spec.ts` (new — 13 Vitest cases)

`hooks.server.ts`'s exported `handle` function had zero automated coverage before this
change (confirmed gap — no live-DB or live-server dependency needed to test it directly).
`auth.api.getSession` and the Drizzle allowlist chain (`db.select().from().where().limit()`)
are mocked; `@sveltejs/kit`'s `isRedirect()` is used to assert on the thrown redirect since
`redirect()` throws rather than returns.

| Case | Scenario | Asserts |
|---|---|---|
| 7a | Unauthenticated request to a protected route (`/leads`) | Throws 303 → `/login?from=%2Fleads` |
| 7b | Authenticated + allowlisted request to a protected route | No redirect; `resolve` called; `locals.user` populated |
| 7c | Session exists, no active `crm_users` row | Throws 303 → `/unauthorized?from=%2Fleads` (regression guard — unrelated, pre-existing branch) |
| 7d | Unauthenticated request to `/login` itself | No redirect — proves no self-redirect loop |
| 7e | `sanitizeFrom` — all 4 rejection branches + valid pass-through | Direct unit coverage of the shared helper |
| 7f | `login/+page.server.ts` `load()` | Sanitized `from` passthrough, `null` for malicious/absent input |

7a/7b/7d map directly to the three test scenarios issue #80 asked for (unauthenticated →
login, authenticated → allowed, login route doesn't redirect to itself). 7c/7e/7f are
regression + new-helper coverage added during VALIDATE so the extraction and new load
function aren't left on an unverified "vacuous green."

Run: `bun run test:unit -- src/tests/hooks-server.spec.ts`

### What this coverage does NOT prove

The full magic-link round trip — clicking the emailed link and landing back on the
originally-requested page — is not automated. Better Auth and Resend are live-wired in this
repo (not stubbed), but no live Postgres + Resend test harness exists in this development
environment, so the end-to-end click-through remains a documented, accepted known-gap.
Everything up to sending the magic link (the `callbackURL` wiring itself) is proven by the
code above plus 7f's direct load-function test.

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/server/sanitize-redirect.ts` | **New** — extracted `sanitizeFrom` open-redirect guard |
| `src/routes/unauthorized/+page.server.ts` | Removed local `sanitizeFrom`; imports the shared helper (no behavior change) |
| `src/routes/login/+page.server.ts` | **New** — loads and sanitizes `?from=` |
| `src/routes/login/+page.svelte` | Accepts `data` prop; uses `data.from ?? '/'` as `callbackURL`; shows "trying to reach" message when present |
| `src/hooks.server.ts` | One line — `/login` redirect now carries `?from=[encoded-path]` |
| `src/tests/hooks-server.spec.ts` | **New** — 13 Vitest cases covering the session gate, the shared helper, and the login load function |

---

## Prior Art / Related Work

The unauthenticated-vs-unallowlisted redirect split (the core "send to `/login`" behavior)
landed via a separate, earlier plan —
`process/features/auth/active/root-login-redirect-fix_01-07-26/` — which is still open
pending its own EVL confirmation and archival. This work did not touch or close that plan;
it only builds on the redirect target it already established.

---

## Honest Limitations

- **End-to-end magic-link redirect-back is not automated.** See "What this coverage does
  NOT prove" above — accepted known-gap, not a code stub. Verifying it requires a live
  Postgres + Resend environment this sandbox doesn't have.
- **No authenticated-user redirect-away-from-`/login`.** If an already-signed-in user
  navigates to `/login` directly, nothing bounces them to `/`. Issue #80 didn't ask for
  this and it was kept out of scope to keep the diff minimal.
- **`sanitizeFrom` only guards against off-origin/scheme-based open redirects** — it does
  not verify the target path actually exists as a route. A `from` value like
  `/this-route-does-not-exist` passes sanitization and will 404 after login. This matches
  the pre-existing behavior already shipped for `/unauthorized`'s `from` param.
