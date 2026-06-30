---
name: plan:error-pages
description: "Branded 404 + unauthenticated (/unauthorized) pages for veent-crm — SvelteKit +error.svelte, new /unauthorized route, hooks redirect + bare-mode layout"
date: 30-06-26
feature: general
phase: "SIMPLE"
---

# Error & Unauthenticated Pages — Implementation Plan

**TL;DR:** Add a branded global `+error.svelte` (404 + generic errors), a new chrome-less `/unauthorized` route, redirect protected-route misses to `/unauthorized?from=[path]` instead of `/login`, and extend the layout `bare` check. ~5 files, no DB/auth/dependency changes. Verification is mostly visual (agent-probe) + `bun run check` (automated) + manual nav (hybrid).

---

**Date**: 30-06-26
**Status**: CODE DONE — implementation complete; VALIDATE skipped (user: UI-only, low-risk); `bun run check` green; visual gates G1-G8 pending browser confirmation. Archived to completed/.
**Complexity**: SIMPLE

## Phase Completion Rules

This is a SIMPLE single-session plan (one phase). The plan is complete when:
- All 7 Implementation Checklist steps are done.
- G-CHECK (`bun run check`) exits 0 and all Verification Evidence gates (G1–G8, G-VISUAL) pass.
- A SIMPLE plan is marked `✅ VERIFIED` ONLY after User Confirmation that the pages work in-browser (user confirmed) — code-only completion is `CODE DONE`, not `VERIFIED`.

## Overview

veent-crm has no global error page — unmatched routes show SvelteKit's generic fallback — and the auth gate dumps users straight at `/login` with no context. This plan adds two branded, chrome-less pages styled to the existing wine-on-cream design system, and changes the auth-gate redirect to a context-carrying `/unauthorized` page. Pure UI + routing; no schema, no auth-logic, no new dependencies.

## Goals

1. Branded 404 page for unmatched routes (replaces SvelteKit fallback).
2. Branded generic-error page for non-404 HTTP errors (500 etc.).
3. New branded `/unauthorized` page with a clear sign-in CTA.
4. Auth gate redirects to `/unauthorized?from=[path]` (not `/login`), with `from` sanitized server-side.
5. Both new pages render chrome-less (no AppShell) and match the design system.

## Scope

**In scope:** `+error.svelte`, `/unauthorized` route (page + server load), `hooks.server.ts` redirect target, `+layout.svelte` bare check.

**Out of scope:** DB/Drizzle changes, Better Auth wiring, `DEV_BYPASS` removal, `/login` page changes, nested per-route `+error.svelte`.

---

## Touchpoints

| File | Action | What changes |
|---|---|---|
| `src/routes/+error.svelte` | CREATE | Global SvelteKit error page; reads `page.status` / `page.error.message` from `$app/state`; 404 vs generic branching; chrome-less dark `bg-ink` design. |
| `src/routes/unauthorized/+page.svelte` | CREATE | Branded "Access restricted" page; sign-in CTA → `/login`; optional "you were trying to reach X" using sanitized `from`. |
| `src/routes/unauthorized/+page.server.ts` | CREATE | `load` reads `?from`, validates same-origin relative path, returns `from` (or `null`). |
| `src/hooks.server.ts` | MODIFY | Add `/unauthorized` to `PUBLIC_PREFIXES`; change `redirect(303, '/login')` → `redirect(303, '/unauthorized?from=' + encodeURIComponent(path))`. |
| `src/routes/+layout.svelte` | MODIFY | Extend `bare` derived to also be true for `/unauthorized`. |

**Context read for execution:** `process/context/all-context.md` (design tokens, Svelte 5 / Superforms / server-only conventions), `src/routes/login/+page.svelte` (visual reference), `src/lib/components/ui/` (button/card primitives), `src/lib/components/shared/EmptyState.svelte` (Card usage pattern).

## Public Contracts

- **New public route `/unauthorized`** — reachable without a session (added to `PUBLIC_PREFIXES`). Accepts optional `?from=` query param.
- **Redirect behavior change** — unauthenticated hits on protected routes now 303 → `/unauthorized?from=[path]` instead of `/login`. Any code/tests asserting the old `/login` redirect target must be updated (none found in research; confirm during EXECUTE).
- **`from` param contract** — server load only echoes back same-origin relative paths (must start with `/`, must NOT start with `//` or `/\`, no scheme). Anything else → `null` (page renders without the "trying to reach" line).

## Blast Radius

- **Files:** 5 (3 new, 2 modified). **Packages:** 1 (the SvelteKit app). **Risk class:** low — UI + one redirect-target change. No schema, no auth-decision logic (the gate condition `!isPublic && !event.locals.user` is unchanged — only the redirect *destination* changes), no new dependencies, no DB.
- **Behavioral risk:** the redirect-target change touches the auth gate's output. The gate *decision* is untouched; only where rejected users land changes. `/unauthorized` must be public or the redirect loops — covered by the `PUBLIC_PREFIXES` edit (verify in gate scenario below).

---

## Implementation Checklist

1. **CREATE `src/routes/unauthorized/+page.server.ts`** — export `load` that reads `url.searchParams.get('from')`; sanitize: keep only if it is a non-empty string starting with a single `/` (reject values starting with `//` or `/\` and reject any with a scheme/`:`); otherwise set to `null`. Return `{ from }`. Use SvelteKit `PageServerLoad` type.
2. **CREATE `src/routes/unauthorized/+page.svelte`** — Svelte 5 runes (`let { data } = $props()`). Dark `bg-ink text-white` full-bleed layout mirroring `/login` aesthetic. Monospace label (e.g. `font-mono` "ACCESS RESTRICTED"), serif (`font-serif`) headline, sans body. Primary CTA button (wine `bg-primary`, `rounded-control`) linking to `/login`. If `data.from`, show a muted line "You were trying to reach `{data.from}`". Use existing `ui/button` primitive where it fits; raw `<a>` is acceptable for the CTA.
3. **CREATE `src/routes/+error.svelte`** — Svelte 5; `import { page } from '$app/state'`. Branch on `page.status === 404`: 404 → "Page not found" headline + helpful copy; else → "Something went wrong" + show `page.status` and `page.error?.message`. Dark `bg-ink` chrome-less design matching `/unauthorized`. Include a "Go home" link to `/` and a "Go back" button (`onclick={() => history.back()}`). Wine-red primary accent, correct radii (`rounded-control`/`rounded-panel`), Spectral/Inter/IBM Plex Mono fonts via token classes.
4. **MODIFY `src/hooks.server.ts`** — (a) add `'/unauthorized'` to `PUBLIC_PREFIXES`; (b) replace `redirect(303, '/login')` with `redirect(303, '/unauthorized?from=' + encodeURIComponent(path))` where `path = event.url.pathname`.
5. **MODIFY `src/routes/+layout.svelte`** — change `const bare = $derived(page.url.pathname === '/login')` to also be true when `page.url.pathname.startsWith('/unauthorized')`. (No change needed for `+error.svelte` — SvelteKit renders it outside the layout tree, so it is already chrome-less; confirm visually in gate G3.)
6. **Run `bun run check`** — fix any type errors (e.g. `PageServerLoad`/`PageData` typing, `page.error` nullability).
7. **Manual nav verification** (hybrid) — run gates G1–G8 below in a browser/dev server.

---

## Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | `/does-not-exist` shows branded 404 (no generic fallback) | G1 |
| AC2 | 404 page has "Go home" (→`/`) + "Go back" | G2 |
| AC3 | 404 renders without AppShell (no sidebar/topbar) | G3 |
| AC4 | Non-404 errors show "Something went wrong" + status code | G4 |
| AC5 | Unauthenticated hit on protected route → `/unauthorized?from=%2Fleads` (not `/login`); decoded `from` value at page load is `/leads` | G5 |
| AC6 | `/unauthorized` shows "Sign in" CTA → `/login` | G6 |
| AC7 | `/unauthorized` renders chrome-less | G7 |
| AC8 | `from` validated server-side — only same-origin relative paths pass; absolute/off-origin stripped | G8 |
| AC9 | `bun run check` passes with zero type errors | G-CHECK |
| AC10 | Both pages visually consistent with design system | G-VISUAL |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G-CHECK: `bun run check` exits 0 | Fully-Automated | AC9 |
| G1: navigate `/does-not-exist` → branded 404 visible | Agent-Probe | AC1 |
| G2: 404 page shows "Go home" link to `/` + working "Go back" button | Agent-Probe | AC2 |
| G3: 404 page has no sidebar/topbar (chrome-less) | Agent-Probe | AC3 |
| G4: trigger a 500 (or thrown error route) → "Something went wrong" + status code shown | Hybrid | AC4 |
| G5: with no session (DEV_BYPASS off / unauth), GET `/leads` → 303 to `/unauthorized?from=%2Fleads`; after redirect, page `from` prop decodes to `/leads` | Hybrid | AC5 |
| G6: `/unauthorized` shows "Sign in" CTA linking to `/login` | Agent-Probe | AC6 |
| G7: `/unauthorized` renders without AppShell | Agent-Probe | AC7 |
| G8: `from` sanitization — `?from=/leads` echoes; `?from=https://evil.com` and `?from=//evil.com` strip to none | Hybrid | AC8 |
| G-VISUAL: both pages match wine-on-cream palette, fonts (Spectral/Inter/IBM Plex Mono), radii | Agent-Probe | AC10 |

**Note on G5 (DEV_BYPASS):** `DEV_BYPASS` injects a fake manager, so the gate normally won't fire in dev. To prove AC5, either temporarily force `event.locals.user = null` during a manual check, or assert the redirect-construction logic by code review of the hooks edit. Record which method was used. No DB or auth-config change is permitted to test this.

**Tier rationale (vc-test-coverage-plan):** No automated test runner covers SvelteKit page rendering or redirect behavior in this repo's current test surface (per `process/context/tests/all-tests.md`, Vitest covers `src/lib/zod/schemas.ts` only; Playwright exists but no specs target these routes). Therefore: AC9 is the only Fully-Automated gate; redirect + `from` sanitization are Hybrid (deterministic but need a running server / forced-unauth state); visual + chrome-less checks are Agent-Probe. The `from` sanitization is the one piece of real logic — see Test Infra Improvement Notes for the backlog stub to lift it to Fully-Automated.

---

## Dependencies

- None external. All design tokens, fonts, and `ui/` primitives already exist (research confirmed).
- No new npm packages. No migration. No env vars.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Redirect loop if `/unauthorized` not public | Low | `PUBLIC_PREFIXES` edit (step 4a) is in the same change; gate G5 catches it. |
| `from` open-redirect / XSS via reflected param | Low | Server-side sanitization (step 1) — reject anything not a single-leading-slash relative path; covered by G8. |
| `+error.svelte` unexpectedly inheriting AppShell | Low | SvelteKit renders root `+error.svelte` outside layout; confirm via G3. If it does inherit, no layout edit can fix it — error pages are outside the layout tree by design. |
| Existing test/code asserts old `/login` redirect | Low | Research found none; re-grep during EXECUTE; if found, update to `/unauthorized`. |

## Integration Notes / Backwards Compatibility

- `/login` is unchanged and still reachable directly. `/unauthorized` is purely additive.
- The redirect-target change is the only outward behavior change. Bookmarked deep links while unauthenticated now land on `/unauthorized?from=...` (with a clear path forward) instead of `/login` — a UX improvement, not a breaking change.
- No rollback complexity: reverting the 5-file diff fully restores prior behavior.

---

## Test Infra Improvement Notes

- The `from`-param sanitizer (`+page.server.ts` load) is pure, testable logic but has no automated coverage because no test targets SvelteKit server loads here. **Backlog stub:** extract the sanitize function (or add a Vitest unit test importing the load logic) to make AC8 Fully-Automated — covers `/leads`, `//evil.com`, `https://evil.com`, `/\evil.com`, empty, and `null` cases. Until then AC8 stays Hybrid and is a known residual (not a terminal PASS-on-known-gap; it has Hybrid coverage).
- No Playwright spec covers these routes; a future `e2e/error-pages.spec.ts` could lift G1–G7 from Agent-Probe to Hybrid/Fully-Automated.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/error-pages_30-06-26/error-pages_PLAN_30-06-26.md`
2. **Last completed step:** plan written (no implementation started).
3. **Validate-contract status:** pending — `## Validate Contract` placeholder below; run VALIDATE before EXECUTE.
4. **Context files loaded:** `process/context/all-context.md`; inspected `src/hooks.server.ts`, `src/routes/+layout.svelte`. EXECUTE should also read `src/routes/login/+page.svelte` for visual parity.
5. **Next step for a fresh agent:** run VALIDATE on this plan; then EXECUTE checklist steps 1→7 in order. Steps 1–3 (creates) are independent; step 4–5 (modifies) gate G5/G7. Run `bun run check` (step 6) before manual gates.

---

## Validate Contract

VALIDATE skipped — user explicitly approved skip before EXECUTE (stated: low-risk UI-only change; no schema/auth/API/billing surface changes; no new dependencies).

## Implementation Outcome

All 7 checklist steps completed in EXECUTE session (30-06-26):
1. ✅ `src/routes/unauthorized/+page.server.ts` — `from` param sanitizer created
2. ✅ `src/routes/unauthorized/+page.svelte` — branded unauthorized page created
3. ✅ `src/routes/+error.svelte` — branded 404 + generic error page created
4. ✅ `src/hooks.server.ts` — `/unauthorized` added to PUBLIC_PREFIXES; redirect target changed
5. ✅ `src/routes/+layout.svelte` — `bare` extended to cover `/unauthorized`
6. ✅ `bun run check` → 0 errors, 0 warnings (G-CHECK green)
7. Manual nav verification: pending user browser confirmation (G1-G8 + G-VISUAL)

Known adjacency items (not plan deviations — follow-up only):
- `src/routes/+layout.ts` does not skip CRM data fetching for `/unauthorized` — harmless under v0 mock data; relevant post-auth-wiring (see backlog)
- Per-route `redirect('/login')` guards in some `+page.server.ts` files are now dead code (hooks gate runs first) — left untouched per scope; see backlog
