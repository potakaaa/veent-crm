---
slug: csv-sheets-import-ui
date: 2026-07-07
verdict: VIABLE
originating-phase: spec
---

# Feasibility Probe: Google Sheets CSV export CORS support

## Hypothesis

Google's public Sheets CSV export endpoint
(`https://docs.google.com/spreadsheets/d/{id}/export?format=csv`) sends
`Access-Control-Allow-Origin` response headers permitting a same-origin-restricted
browser `fetch()` from an arbitrary web app origin.

## Mechanism Under Test

Whether `docs.google.com`'s `export?format=csv` endpoint (and the `googleusercontent.com`
redirect target it 307s to) include CORS headers that a browser's `fetch()` CORS-mode
check would accept, for BOTH the intermediate redirect hop and the final content
response — a cross-origin fetch that follows a redirect must pass the CORS check at
every hop, not just the final one.

## Probe Family

1 — Local process / Node script (plain HTTP request via `curl`, no library/runtime needed)

## Probe Cost Class

`cheap-local` — anonymous GET/HEAD requests to a public Google Sheets export URL, no auth,
no billing, no container. Gate: met, no opt-in required.

## Probe Method

Used a well-known public example Google Sheet (Google's own "Example Spreadsheet - Class Data"
template, ID `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`), which is publicly viewable and
commonly used in Google's own API documentation/samples.

```bash
# 1. No Origin header (simulates a non-browser / same-origin request)
curl -sD - -o /dev/null "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv"

# 2. Follow the redirect fully, inspect headers at both hops
curl -sD - -o /tmp/sheet.csv -L "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv"

# 3. Explicit cross-origin Origin header (simulates what a browser sends on a cross-origin fetch)
curl -sD - -o /dev/null -H "Origin: https://example.com" "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv"
```

## Evidence Captured

**Hop 1 — `docs.google.com/.../export?format=csv` (307 redirect), no Origin header sent:**
```
HTTP/1.1 307 Temporary Redirect
Content-Type: text/html; charset=UTF-8
Location: https://doc-08-4o-sheets.googleusercontent.com/export/.../?format=csv
...
(no Access-Control-Allow-Origin header present)
```

**Hop 1 — same request, WITH `Origin: https://example.com` header:**
```
HTTP/1.1 307 Temporary Redirect
Access-Control-Allow-Origin: https://example.com
Access-Control-Expose-Headers: Cache-Control,Content-Length,Content-Type,Date,Expires,Location,Pragma,Server
...
```

**Hop 2 — final response from `googleusercontent.com` (200 OK, reached via `-L` follow):**
```
HTTP/1.1 200 OK
Content-Type: text/csv
Content-Disposition: attachment; filename="ExampleSpreadsheet-ClassData.csv"; ...
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Cache-Control,Content-Disposition,Content-Encoding,Content-Length,Content-Type,Date,Expires,Pragma,Server,Transfer-Encoding
...
```

**Interpretation:**
- Google's server only emits `Access-Control-Allow-Origin` when an `Origin` request header
  is present (standard CORS server behavior — a plain `curl` HEAD without `Origin` correctly
  omits it; this is NOT evidence of "no CORS support," it's evidence the server is
  origin-header-driven, which is exactly what a browser cross-origin `fetch()` triggers).
- When an `Origin` header IS sent (as every browser does automatically on a cross-origin
  `fetch()`), BOTH hops respond with a valid `Access-Control-Allow-Origin`:
  - The `docs.google.com` redirect hop reflects the exact request `Origin` (not `*`).
  - The final `googleusercontent.com` content hop uses a wildcard `Access-Control-Allow-Origin: *`.
- Per the Fetch spec, a `mode: 'cors'` fetch that follows a redirect must pass the CORS
  check at each hop it traverses. Both hops here pass. No `Access-Control-Allow-Credentials`
  header is present, but none is needed since public-sheet export requires no credentials.

## Verdict

**VIABLE**

## Resulting Design Constraint

- **What this licenses:** The CSV/Sheets import wizard MAY fetch a published/publicly-viewable
  Google Sheet's CSV export directly from client-side JS via `fetch(url)` (default `mode: 'cors'`,
  default `redirect: 'follow'`) — no SvelteKit server-side proxy route is required purely to
  satisfy CORS for this case. `credentials: 'omit'` (the fetch default when not same-origin)
  is correct and sufficient; do not add `credentials: 'include'`.
- **What this forbids:** Do NOT design the import flow assuming CORS blocks direct browser
  access — that assumption is false for public/published sheets. Do NOT rely on this for
  **private** (non-public, permission-restricted) sheets: this probe only tested a publicly
  viewable sheet. A private sheet's export endpoint will 401/redirect to a Google login page,
  which will fail differently (and likely still lack usable CORS for an authenticated flow) —
  that is a distinct, untested case.
- **What remains uncertain (known-gap):** (1) Behavior for a *private* or *restricted* Google
  Sheet was not probed — if the import wizard must support importing sheets the requesting
  user has access to but that aren't fully public, a server-side proxy fetch (with the user's
  OAuth token) is likely still required, and this probe does not settle that path. (2) Long-term
  stability of Google's CORS behavior on this undocumented/unofficial export endpoint is not
  guaranteed by any public API contract — treat it as best-effort, and consider a server-side
  fallback path for resilience even though the client-direct path is currently viable.

**Status:** DONE
**Summary:** Empirically confirmed (via `curl` against Google's own public example Sheet) that both the `docs.google.com` redirect hop and the `googleusercontent.com` CSV-content hop return valid `Access-Control-Allow-Origin` headers when a cross-origin `Origin` header is present — VIABLE for client-side direct fetch of public/published sheets. Private/restricted sheet CORS behavior is an untested known-gap.
**Concerns/Blockers:** None blocking. Known-gap noted above (private sheet CORS behavior untested) should be revisited if the import wizard needs to support non-public sheets.

VC-FEASIBILITY-VERDICT-READY: VIABLE — process/features/import/active/csv-sheets-import-ui_07-07-26/csv-sheets-import-ui_FEASIBILITY_07-07-26.md
