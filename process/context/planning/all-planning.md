---
name: context:planning
description: Plan shape calibration and planning conventions for veent-crm
metadata:
  node_type: group-entrypoint
  type: context
  read_order: 3
  required: false
  read_when: creating a new plan, calibrating SIMPLE vs COMPLEX plan shape, or checking planning conventions
  keywords: [planning, plan, SIMPLE plan, COMPLEX plan, generate-plan, plan shape, PRD]
---

# Planning Context

This file is the canonical planning context entrypoint for veent-crm.

Use it after `process/context/all-context.md` when the task needs plan-shape calibration,
planning conventions, or implementation-plan examples.

## Scope

This group covers:

- Example plan shapes
- SIMPLE vs COMPLEX plan calibration
- Durable planning references that should not stay at the `process/context/` root

It does not cover:

- Active implementation plans
- Feature reports
- Backlog items

Those belong under `process/general-plans/` or `process/features/`.

## Read When

Read this entrypoint when:

- Creating a new plan with `generate-plan`
- Checking whether work should be `SIMPLE` or `COMPLEX`
- Comparing an active plan against the repo's example plan shapes

## Quick Routing

- Use `.claude/skills/vc-generate-plan/references/example-simple-prd.md` to calibrate a one-session plan
- Use `.claude/skills/vc-generate-plan/references/example-complex-prd.md` to calibrate a complex or multi-phase plan

## Source Paths

- `.claude/skills/vc-generate-plan/references/example-simple-prd.md`
- `.claude/skills/vc-generate-plan/references/example-complex-prd.md`

## Update Triggers

Update this group when:

- The plan artifact contract changes
- `generate-plan` expects different plan sections or statuses
- The example plan shapes move, split, or become stale
