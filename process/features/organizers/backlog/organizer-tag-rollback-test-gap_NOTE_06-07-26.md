---
name: plan:organizer-tag-rollback-test-gap-note
description: "Backlog test-building stub — confirmOrganizerTag / confirmReassign fetch-failure rollback path has no automated test coverage (no component-render harness in this repo)"
date: 06-07-26
feature: organizers
---

## Organizer tag rollback-path test gap — backlog test-building stub

Date: 06-07-26
Source: VALIDATE (organizer-lead-tagging-ui_06-07-26) — Layer 2 UI-section feasibility check

**Gap:** `confirmOrganizerTag` (new, `src/routes/leads/[id]/+page.svelte`) implements optimistic-update-with-rollback-on-fetch-failure (SPEC AC6), mirroring the pre-existing `confirmReassign` handler exactly. Neither handler is unit-testable as written — both are non-exported functions defined inside a `.svelte` `<script>` block, and this repo has no `@testing-library/svelte` (or equivalent Vitest-Svelte component-render adapter) to drive them via a rendered component. The "what to send" decision was extracted into a plain testable helper (`buildOrganizerTagPatch`, see plan Implementation Checklist item 3) to cover AC1/AC2/AC3, but the fetch-failure → rollback → toast wiring itself remains untested. This is not a new gap introduced by this work — `confirmReassign`'s equivalent rollback path has the same zero-coverage status today.

**Files outside blast-radius:** none — this is a same-repo test-infra gap, not a scope/design issue.

**New API surface:** N/A — no API changes; this is purely a test-tooling gap.

**Resolution options once addressed:**

- **A — Write new test:** requires `@testing-library/svelte` (or `vitest-browser-svelte`) to render `+page.svelte` and drive the confirm flow with a mocked `fetch`. Estimated effort: half a day once the harness dependency decision is made (this is the same decision already flagged in `process/features/ux-enhancement/backlog/axe-core-devdependency-decision_NOTE_02-07-26.md`-adjacent territory — a component-test-harness decision, broader than one feature).
- **B — Set up infra:** add `@testing-library/svelte` + `@testing-library/jest-dom` as devDependencies and wire a Vitest `environment: 'jsdom'` project config. Cross-feature decision, not scoped to this plan.
- **C — Accept as known-gap (current choice):** rationale — parity with the existing, equally-untested `confirmReassign` rollback path; this work does not regress anything that was previously covered; the underlying decision logic (AC1/AC2/AC3) IS covered by the extracted pure-function tests.
- **D — Backlog artifact (this file):** tracks the gap for whenever the component-render harness decision (option B) is made repo-wide; at that point, add rollback-path tests for BOTH `confirmReassign` and `confirmOrganizerTag` in one pass.

**Status:** Open — accepted as a documented, pre-existing-pattern known-gap for the `organizer-lead-tagging-ui_06-07-26` plan's VALIDATE gate (CONDITIONAL). Revisit when a component-test-harness decision is made for the repo.
