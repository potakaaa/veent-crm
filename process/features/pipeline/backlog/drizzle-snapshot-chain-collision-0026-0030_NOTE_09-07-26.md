---
name: plan:drizzle-snapshot-chain-collision-0026-0030-note
description: Backlog note — drizzle-kit generate fails with a snapshot-chain collision between meta/0026 and meta/0030; blocks any new migration generation until reconciled
date: 09-07-26
feature: pipeline
---

# NOTE — Drizzle snapshot chain collision (meta/0026 vs meta/0030)

**Discovered during:** GitHub #273 (done-stage-revenue-tagging) EXECUTE, Group 1 step 4 (`bun run db:generate` for migration 0035).

## Symptom

```text
Error: [drizzle\meta\0026_snapshot.json, drizzle\meta\0030_snapshot.json] are pointing to a
parent snapshot: drizzle\meta\0026_snapshot.json/snapshot.json which is a collision.
```

`bun run db:generate` fails immediately, before any new migration file is produced — this
blocks generating migration `0035` (and any future migration) until fixed.

## Root cause

- `drizzle/meta/_journal.json` has entries for idx 26–29 (`0026_cat1_add_tables`,
  `0027_cat1_data_migrate`, `0028_cat1_drop_enum_column`, `0029_cat1_partial_name_idx`), and the
  corresponding `.sql` files exist on disk.
- The corresponding **meta snapshot files** `drizzle/meta/0027_snapshot.json`,
  `0028_snapshot.json`, `0029_snapshot.json` are **missing from disk** (never committed, or
  deleted). Only `0026_snapshot.json` and `0030_snapshot.json` exist in that range.
- `0026_snapshot.json`: `id: 3115ddc5-…`, `prevId: 3b607973-…`
- `0030_snapshot.json`: `id: 2ff4ed1f-…`, `prevId: 3b607973-…` (SAME `prevId` as 0026)

Both `0026` and `0030` claim the same parent snapshot (`3b607973-…`), i.e. `0030`'s snapshot
was generated as if `0026`'s own parent state were still current — it does not chain through
`0026`→`0027`→`0028`→`0029`→`0030`. This means the `0030` migration (and everything generated
after it, currently through `0034`) was produced with an inconsistent snapshot lineage, even
though the actual applied SQL history (0026→0034) is presumably fine on any DB that ran the
migrations in file order.

## Impact

- `bun run db:generate` cannot run at all until this is reconciled — this is a **harder
  blocker** than the previously-flagged idx/file-numbering drift (`drizzle-migration-journal-drift_02-07-26.md`,
  which covered idx-vs-filename mismatches, not missing/collided snapshot files).
- This is NOT something GitHub #273 introduced — it predates this task. Reconciling it
  safely requires either (a) locating the missing `0027`–`0029` snapshot files from an
  earlier commit/backup, or (b) hand-reconstructing them from the corresponding `.sql`
  files' known end-state (risky — full-table snapshot reconstruction, not a diff), or
  (c) using `drizzle-kit`'s conflict-resolution flow interactively (if supported) to
  relink the chain.
- Attempting a hand-fix inline during a HIGH-RISK schema/migration EXECUTE pass was judged
  out of scope and too risky without dedicated RESEARCH/PLAN — this note registers it as a
  structural fix-me.

## Recommended next step

Route to RESEARCH/PLAN as its own general-plans task: "Reconcile drizzle snapshot chain
0026→0030 collision" before any future `db:generate` is attempted. Until fixed, GitHub #273's
migration `0035` (enum `done` value + `revenue_cents` column) exists ONLY as the schema.ts
source-of-truth code change — the physical migration SQL file could not be generated in this
session.
