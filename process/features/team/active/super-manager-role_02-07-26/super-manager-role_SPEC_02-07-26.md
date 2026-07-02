---
name: plan:super-manager-role-spec
description: Product-discovery SPEC for GitHub issue #73 — super_manager singleton role above manager
date: 02-07-26
feature: team
---

# SPEC — super_manager singleton role (GitHub #73)

TL;DR: Add a `super_manager` role above `manager`. Exactly one active super_manager at any time (DB-enforced). Only the super_manager can deactivate managers, promote users to manager/super_manager, and transfer the super_manager role (atomic: current holder → manager).

## User goals
- A single top-level owner ("super manager") who controls manager-level actions.
- Managers keep all existing powers over reps.
- Role transfer is atomic and cannot leave the org with zero or two super_managers.

## Permission matrix (locked)
| Action | manager | super_manager | rep |
|---|---|---|---|
| Deactivate a rep | ✅ | ✅ | ❌ |
| Deactivate a manager | ❌ | ✅ | ❌ |
| Promote user → super_manager (transfers role) | ❌ | ✅ | ❌ |
| Promote user → manager | ❌ | ✅ | ❌ |
| Add new rep | ✅ | ✅ | ❌ |
| View team roster | ✅ | ✅ | ✅ (read-only) |

## Key use cases
1. super_manager promotes user B → super_manager; in one transaction B becomes super_manager and the previous holder A becomes manager.
2. manager attempts to deactivate another manager → rejected (403).
3. super_manager attempts to deactivate themselves → rejected (must transfer first).
4. Roster renders a distinct gold/amber badge for super_manager.

## Acceptance criteria
- [ ] Only one active `super_manager` row can exist (DB partial unique index + server transaction).
- [ ] A `manager` cannot deactivate another manager — only `super_manager` can.
- [ ] Promoting B → super_manager sets previous holder A → manager atomically.
- [ ] Team page reflects permission gates (button visibility, gold badge, promote action + confirm modal).
- [ ] All existing manager permissions also apply to `super_manager`.
- [ ] A `super_manager` cannot deactivate themselves.
- [ ] `roleLabel('super_manager')` returns "Super Manager".

## Out of scope
- Notifications/email on role transfer.
- Audit trail for role transfer.
- First-time setup UI for the initial super_manager (seeded/manual for now).

## Constraints
- Soft-delete only (`active=false`), server-side DB only, Svelte 5 runes, Superforms/Zod, no raw FormData.
- e2e verification is a pre-accepted known-gap (no shared authenticated Playwright fixture repo-wide).
