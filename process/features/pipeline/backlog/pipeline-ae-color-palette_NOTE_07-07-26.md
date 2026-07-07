---
name: report:pipeline-ae-color-palette
description: "BLOCKER note — PIPE-4 pipeline card color-coding is blocked on a per-AE color palette decision from Jela"
date: 07-07-26
metadata:
  node_type: memory
  type: report
  feature: pipeline
  phase: backlog
---

# PIPE-4 — Pipeline AE Color Palette (BLOCKED — waiting on Jela)

**Status:** OPEN — blocks only the color-coding sub-section of PIPE-4. The filter/URL/role-gating work is NOT blocked and can ship independently.

## Bottom line

PIPE-4 wants each pipeline card's left-border colored by its assigned AE (owner), with a legend mapping AE name -> color. We cannot implement the color mapping until Jela defines the palette. Everything else in PIPE-4 (manager dropdown filter + `?rep=` URL persistence + rep-only-own-cards gating) is buildable now.

## What is needed from Jela before this unblocks

1. **Hex value (or design token name) per AE.** One stable color per AE (`crm_users` where `role='rep'`). Provide as a list: `AE display name -> #hex` (or token).
2. **How many AEs need colors.** The current active-rep roster size, and the intended behavior when the roster grows beyond the defined palette (cycle/repeat? reserve a neutral fallback color? require a new color per new AE?).
3. **Fallback color for unassigned / deactivated / unknown owner.** A card with `ownerId = null` (Unassigned) needs a defined neutral border (the standard border is the current default).
4. **Contrast / accessibility requirement for legend text.** Legend swatch + AE name must meet a stated contrast ratio (e.g. WCAG AA 4.5:1 for the label text against panel background). Confirm whether the color is used ONLY as a border accent (decorative, no contrast requirement) or ALSO as legend text/background (contrast-bound).

## Structural readiness (already designed in the plan — drop-in when palette lands)

- Color resolution is a single `Record<ownerId, colorToken>` (or a `ownerId -> CSS custom property`) resolved at render time in `PipelineBoard.svelte` card markup.
- The card container (`PipelineBoard.svelte` ~line 126) gains a `border-l-4` whose color comes from that map; default/unassigned falls back to the existing `border-hairline`.
- No schema change, no query change — color is a pure client-side render concern keyed on the already-present `ownerId`.

## Resume trigger

When Jela delivers the four items above, resume from the **"BLOCKED — color-coding (gated on Jela)"** checklist section of
`process/features/pipeline/active/pipeline-ae-filter-color_07-07-26/pipeline-ae-filter-color_PLAN_07-07-26.md`.
Record the delivered palette in this note (or a follow-up) so the source of truth is durable.

## Cross-surface future work (OUT OF SCOPE for PIPE-4)

Color-per-AE is intended to be consistent across pipeline, calendar, and reports. Only the pipeline side is in PIPE-4's acceptance criteria. If/when the palette is centralized (e.g. a shared `aeColor(ownerId)` util or DB-backed color column), calendar and reports adoption is a separate future ticket.
