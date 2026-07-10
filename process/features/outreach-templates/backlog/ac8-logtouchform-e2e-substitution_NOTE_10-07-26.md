---
name: report:ac8-logtouchform-e2e-substitution
description: "Known-Gap — LogTouchForm end-to-end template substitution (AC8) unproven: no Svelte component-test harness + no shared Playwright auth fixture"
date: 10-07-26
metadata:
  node_type: memory
  type: report
  feature: outreach-templates
  phase: outreach-templates-slash-tokens
---

# NOTE — Known-Gap: AC8 LogTouchForm end-to-end substitution (slash-token plan)

**Status:** OPEN — pre-accepted Known-Gap; AC8 gate stays CONDITIONAL, not PASS.

## TL;DR

The slash-token plan (`outreach-templates-slash-tokens_10-07-26`) added 5 `/token` synonyms to
`fillTemplate`. The underlying substitution logic is fully proven Fully-Automated (AC1–AC5, AC7
green in `templates.spec.ts` + `seed-templates.spec.ts`). AC8 — that `LogTouchForm.svelte`'s
`fill()` actually renders the filled text in a real browser composer end-to-end — remains
UNPROVEN and is NOT a vacuous green (the new logic itself is unit-proven; only the DOM/e2e wiring
is ungated).

## Why unproven

- **No Svelte component-test harness** — same root class as
  `process/features/ux-enhancement/backlog/component-test-harness-decision_NOTE_07-07-26.md`.
- **No shared Playwright authenticated-session fixture** — repo-wide documented gap,
  `process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`.

`LogTouchForm.svelte` was VERIFY-ONLY in this plan (item 7) and is unchanged — it passes
`TemplateVars` to `fillTemplate` exactly as before, so no regression risk was introduced; the gap
is purely the absence of an end-to-end proof surface, not a code defect.

## What would close it

Either harness landing:
- a Svelte component test (`@testing-library/svelte` + `happy-dom` vitest `client` project) driving
  `LogTouchForm` select-template → assert filled `note`, or
- a Playwright e2e with the shared auth fixture exercising the Log Touch composer in a browser.

## Decision needed from

Team/orchestrator — group with the two already-open harness/auth-fixture decisions above; no
action required for this plan to be CODE DONE.
