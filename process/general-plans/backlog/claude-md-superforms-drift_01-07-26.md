---
name: backlog:claude-md-superforms-drift
description: "CLAUDE.md mandates Superforms + Zod for all forms, but the actual established pattern across src/ is fetch + Zod (no Superforms usage found) — durable context-doc accuracy note for a future vc-audit-context pass"
date: 01-07-26
---

# CLAUDE.md / Actual-Practice Drift — Superforms Convention

Discovered during `ufg-inline-edit-review-removal_01-07-26` (GitHub #90) SPEC research. Noted as
out-of-scope for that change (SPEC explicitly deferred it). Recorded here for a future
`vc-audit-context` pass — do not silently rewrite CLAUDE.md without that audit.

## Item: Documented Convention Does Not Match Codebase Reality

**Priority:** Low (documentation accuracy, not a functional bug)

**Problem:** `CLAUDE.md` §Mandatory conventions and `process/context/all-context.md` §Technology
Stack both state "Superforms + Zod for all forms — every form uses `superforms` with a Zod
schema from `src/lib/zod/schemas.ts`. No raw `FormData` handling." No usage of `superforms`
was found anywhere in `src/` during research for this task (e.g. `LeadEditModal.svelte`'s
`saveEdit()` pattern, the Up for Grabs inline-edit flow, and the pre-existing Review Queue page
it was modeled on all use `fetch()` + Zod validation directly — not Superforms).

**Root cause:** Likely a v0 scaffold aspiration (`Superforms` was listed in the intended tech
stack at project setup) that was never actually adopted as implementation proceeded — the
fetch+Zod pattern became the de facto convention instead, and the docs were never updated to
match.

**Fix options:**
1. Update `CLAUDE.md` and `process/context/all-context.md` to document the actual fetch + Zod
   pattern as the mandatory convention, dropping the Superforms requirement (if the team has
   decided against it).
2. If Superforms is still the intended direction, treat every existing form as tech debt and
   plan a migration pass — but this is a much larger undertaking and should be a deliberate
   decision, not incidental to an unrelated feature change.
3. At minimum, run `vc-audit-context` to confirm the full scope of the drift (grep all form
   implementations in `src/routes/**/*.svelte` for their actual submission pattern) before
   deciding between options 1 and 2.

**When to fix:** Next `vc-audit-context` pass, or when a new form is being added and the
convention ambiguity would otherwise cause an agent to guess incorrectly.
