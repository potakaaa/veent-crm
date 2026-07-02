---
name: backlog:drizzle-migration-journal-drift
description: "drizzle/0014_agreements_fields.sql was committed without a matching drizzle/meta journal entry or snapshot — reconcile before the next migration collision"
date: 02-07-26
---

# Drizzle Migration Journal Drift — Follow-Up

Discovered during the `recurring-organizer-tag_02-07-26` (GitHub #94) EXECUTE session
(2026-07-02) while running `bun run db:generate` for the new `has_future_events` column. Not
caused by that session — pre-existing drift from an earlier commit.

## Problem

`drizzle/0014_agreements_fields.sql` (added in commit `f00d0ab`, "feat(leads): add
agreements/fee-structure fields to lead onboarding tab") was never registered in
`drizzle/meta/_journal.json` and has no matching `drizzle/meta/0014_snapshot.json`. The
journal's last entry before this session was `idx: 13, tag: "0013_youthful_virginia_dare"`.

When `bun run db:generate` ran this session, drizzle-kit correctly computed the diff against
the actual current schema state (ignoring the unregistered file, since it isn't tracked) and
produced a new migration at `idx: 14`, tagged `0014_curious_pet_avengers`, with its own
`drizzle/meta/0014_snapshot.json`. Both files now exist on disk with the literal `0014_`
filename prefix, but only `0014_curious_pet_avengers.sql` is journal-registered:

- `drizzle/0014_agreements_fields.sql` — un-registered, un-snapshotted (from `f00d0ab`)
- `drizzle/0014_curious_pet_avengers.sql` — registered at journal idx 14 (from this session)

## Risk

- The next `bun run db:generate` will produce `idx: 15`, so no immediate collision — but the
  drift means `0014_agreements_fields.sql`'s changes are not part of drizzle's tracked
  migration history. If a fresh database is provisioned by replaying `drizzle/*.sql` files in
  filename order rather than via `drizzle-kit migrate` (which reads the journal), the
  `0014_agreements_fields.sql` changes may or may not be applied depending on the tooling used.
- Anyone doing a `drizzle-kit` history diff, rollback, or snapshot-based tooling operation will
  not see `0014_agreements_fields.sql` in the tracked chain.

## Suggested resolution (not decided — needs a short INNOVATE/PLAN pass)

1. Confirm whether `0014_agreements_fields.sql`'s columns are already present in the live/dev
   database (likely applied via `bun run db:push` at the time, bypassing migration tracking).
2. If already applied everywhere that matters, retroactively register it in the journal history
   (may require manually authoring its `meta/00XX_snapshot.json` and journal entry, or asking
   drizzle-kit to regenerate a consolidated snapshot) — a data-safety-sensitive operation,
   requires care.
3. If not yet applied in some environment, decide whether to fold it into a corrected sequential
   migration or apply it directly before regularizing the journal.

## Process guardrail for future plans/execute-agents

Before running `bun run db:generate`, verify `drizzle/meta/_journal.json`'s last `idx` matches
the highest-numbered `.sql` file in `drizzle/` by filename. A mismatch means an earlier commit
introduced a migration file without registering it — flag and reconcile before generating a new
one, rather than layering a second migration on top of untracked drift.

## Update 02-07-26 — merge conflict + second drift instance found on `development`

While merging `development` into `feat/recurring-org-tag`, both branches had independently
claimed journal `idx: 15` (`0015_amusing_eternity` here vs `development`'s
`0015_milky_human_fly` + `0016_message_template_title_uq`, from PR #128 outreach-templates).
Resolved by keeping this branch's `idx: 15` as-is and renumbering `development`'s two entries to
`idx: 16` (`0016_milky_human_fly`) and `idx: 17` (`0017_message_template_title_uq`), with matching
file renames.

While reconciling, found `development`'s own committed `drizzle/meta/0015_snapshot.json` is
**missing** `crm_lead_visibility_grants`, the `crm_leads.visibility` column, and the
`crm_lead_visibility` enum — even though `development`'s `schema.ts` has all three (PR #127,
merged before the outreach-templates branch). This is a second, independent instance of the same
drift pattern described above, native to `development`, not introduced by this merge. This
branch's own `0015_snapshot.json` (`0015_amusing_eternity`) is correct/complete and was used as
the base for the new `idx: 16` snapshot instead of `development`'s broken one.

Also: no `drizzle/meta/0017_snapshot.json` was created for `0017_message_template_title_uq`
(the partial unique index migration) — mirroring `development`'s own precedent of never
snapshotting that migration (`development` shipped `idx: 16` with no `0016_snapshot.json` either).
This is intentional parity with existing practice, not an oversight, but it means the same
"next `db:generate` diffs against a stale snapshot" risk applies here too.

**Follow-up still needed:** a proper reconciliation pass (per the original Suggested Resolution
above) that confirms live DB state and regenerates a fully consistent snapshot chain, covering
both this drift instance and the original `0014_agreements_fields.sql` one.
