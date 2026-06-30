---
name: backlog:error-pages-adjacency
description: "Two adjacency items discovered during error-pages implementation — not bugs, but future clean-up needed post-auth-wiring"
date: 30-06-26
---

# Error Pages — Adjacency Follow-Up Items

Discovered during `error-pages_30-06-26` implementation. Not plan deviations — intentionally left untouched per scope boundary. Address during auth-wiring (v1) or a dedicated cleanup pass.

---

## Item 1: `+layout.ts` Does Not Skip CRM Data Fetching for `/unauthorized`

**Priority:** Low

**Problem:** `src/routes/+layout.ts` (or `+layout.server.ts`) fetches CRM data (user profile, team info, etc.) on every route load, including `/unauthorized`. Under v0 mock data this is harmless — the fetch is cheap and the data is ignored. Post-auth-wiring it will attempt a real DB query for an unauthenticated session, which will either return null or throw, depending on how the server load is guarded.

**Root cause:** The layout server load does not check `event.locals.user` before querying and does not have an early-exit for public/bare routes.

**Fix options:**
1. Add an `if (!locals.user) return {}` guard at the top of the layout server load — return empty data for unauthenticated sessions. The bare pages (login, unauthorized) will receive no layout data, which is correct since they don't render the AppShell.
2. Alternatively, make layout data fetching conditional on `url.pathname` not matching `PUBLIC_PREFIXES`.

**When to fix:** Before Better Auth is wired live (v1 milestone). Not urgent under DEV_BYPASS.

---

## Item 2: Dead `redirect('/login')` Guards in Per-Route `+page.server.ts` Files

**Priority:** Low

**Problem:** Some per-route `+page.server.ts` files contain their own `redirect(303, '/login')` guards (e.g., `if (!locals.user) redirect(...)`). These are now dead code — `hooks.server.ts` runs first and redirects unauthenticated users to `/unauthorized?from=...` before any route load executes. The per-route guards will never fire.

**Root cause:** Route-level guards were written before the hooks-level gate was in place. Now both exist and the hooks gate takes precedence.

**Fix options:**
1. Remove per-route `redirect('/login')` guards from all `+page.server.ts` files — rely solely on `hooks.server.ts` for the auth gate. Reduces duplication.
2. Keep them as a defence-in-depth fallback (acceptable but misleading — they would redirect to `/login`, not `/unauthorized`, if somehow reached).

**Recommendation:** Remove the dead guards in the same pass that wires Better Auth (v1). Grep pattern: `redirect(303, '/login')` in `src/routes/**/*.server.ts`.

**When to fix:** Auth-wiring (v1) cleanup pass. Not urgent.
