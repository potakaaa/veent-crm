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

## Update 03-07-26 — full drift scope measured against the live Neon DB (vercel-deploy-migration EXECUTE)

The `vercel-deploy-migration_03-07-26` EXECUTE session needed a clean `bun run db:generate`
(to add `crm_users.pending_welcome`) and attempted the Section C reconciliation. It STOPPED and
deferred the whole migration back to this backlog item because the drift is materially broader
than any prior note captured. Concrete truth, measured via a **read-only** `information_schema`
probe against the live Neon DB (`ep-still-night-...-pooler...neon.tech`) — no writes, no
`db:push`, no migration applied:

1. **`crm_leads` — snapshot 0019 is missing 10 columns that exist in the live DB and in
   `schema.ts`:** `onboarding_notes`, `contract_url`, `onboarding_start_date`, `go_live_date`
   (onboarding block) + `fee_structure`, `transaction_fee_pct`, `convenience_fee_pesos`,
   `service_fee_pct`, `service_fee_per_ticket_pesos`, `bank_charges_absorbed` (agreements block).
   Live `crm_leads` = 47 cols; snapshot 0019 = 37 cols. All 10 already applied in live DB.
2. **`crm_message_templates` — the entire table is missing from snapshot 0019** (exists in live
   DB and `schema.ts`). A naive `db:generate` emits a `CREATE TABLE crm_message_templates` +
   its unique index, which would fail against the live DB that already has it.
3. **Snapshot `id`/`prevId` chain is corrupt with DUPLICATE ids:** snapshots 15≡16 share
   `id=2123a194`; 17≡18≡19 share `id=e7b44582`. `drizzle-kit generate` hard-errors
   ("pointing to a parent snapshot ... which is a collision") and refuses to run until the chain
   is linearized (each `prevId` = the previous snapshot's unique `id`).

**Why deferred (not fixed here):** reconciling a live-DB-ahead-of-snapshot state requires a
human baseline decision (mark-the-catch-up-migration-as-applied vs. author an idempotent
`IF NOT EXISTS` catch-up vs. `drizzle-kit` baseline reset). That is a HIGH-risk migration-baseline
call on a schema-migration surface with no CI harness — out of scope for an autonomous EXECUTE
pass, and exactly the R1 risk the vercel-deploy plan flagged as manual-first. The EXECUTE session
reverted all its trial `drizzle/` edits back to the committed state; the migration folder is
unchanged from before that session.

**Concrete recipe for the reconciliation pass (all confirmed feasible this session):**
- Fold the 10 `crm_leads` columns + the `crm_message_templates` table (+ its unique index) into
  the head snapshot so it matches `schema.ts`/live.
- Linearize the `id`/`prevId` chain (assign unique ids to the duplicated snapshots 15–19, relink
  `prevId` = previous snapshot id). Metadata-only, git-reversible.
- Decide the catch-up baseline strategy (above) so the catch-up migration is NOT applied to the
  already-migrated live DB.
- THEN add `crm_users.pending_welcome boolean NOT NULL DEFAULT false` to `schema.ts` and
  `db:generate` — it must emit ONLY the single `crm_users` ALTER. Apply manual-first with the
  risk-evidence pack. This unblocks Sections C/D/E of `vercel-deploy-migration_03-07-26`
  (pending_welcome DB column + the in-memory-Set → DB-flag serverless fix).

## Update 07-07-26 — CAT-1 migrations 0026–0028 added snapshot-less by intent

CAT-1 (`cat-1-custom-lead-categories_07-07-26`, GitHub #248) added three HAND-WRITTEN migrations —
`0026_cat1_add_tables`, `0027_cat1_data_migrate`, `0028_cat1_drop_enum_column` — registered at
journal `idx` 26/27/28 with NO matching `meta/00NN_snapshot.json` files. This is intentional:
`db:generate` remains blocked by the duplicate-id snapshot-chain corruption documented above, so
these migrations were authored by hand and ship snapshot-less, continuing the existing documented
drift pattern (0016/0017 already ship snapshot-less). Full snapshot-chain reconciliation remains
the separate backlog item described in this note.
