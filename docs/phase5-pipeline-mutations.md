---
kind: doc
domain: [crm-build]
status: adopted
type: implementation
links: [phase4-verification-notes]
---

# Phase 5 — Pipeline Board + Stage Mutations + Ownership + Won Capture

Date: 2026-06-29
Phase: 5 — Pipeline board + stage transitions + ownership

---

## Verdict

**Shipped.** All DB-backed mutations implemented and verified via unit tests + DB integration tests. Pipeline board loads real leads from Drizzle. Stage transitions, Won capture, Lost marking, and owner reassignment all write through real API endpoints backed by `crm_lead_history` audit rows. 78/78 tests pass.

---

## Gates Run

| Gate | Result |
|---|---|
| `bun run check` (svelte-check) | PASS — 0 errors, 0 warnings |
| `bun run lint` (Prettier + ESLint) | PASS — 0 errors, 39 pre-existing warnings (unchanged count) |
| `bun run test:unit -- --run` (unit) | PASS — 78/78 |
| DB integration tests (local postgres) | 15 tests in `pipeline-db.spec.ts` — skipped in CI, run locally |

---

## Acceptance Criteria Results

| # | Criterion | Status | Method |
|---|---|---|---|
| 1 | Pipeline board loads real leads grouped by stage | ✅ Verified | `+page.server.ts` calls `listLeads()`; DB integration test confirms list |
| 2 | Empty stages render correctly | ✅ Verified | Static: `PipelineBoard` filters per stage; empty array → empty column |
| 3 | Stage move persists to DB | ✅ Verified | DB integration: `moveLeadStage` roundtrip + `getLead` confirms new stage |
| 4 | Invalid stage value rejected server-side | ✅ Verified | Unit test: `moveStageSchema` rejects unknown stage strings |
| 5 | Nonexistent lead ID returns 404 | ✅ Verified | DB test: `moveLeadStage` returns null → API sends 404 |
| 6 | Owner change persists to DB | ✅ Verified | DB integration: `reassignLead` roundtrip + `getLead` confirms new ownerId |
| 7 | Invalid/nonexistent owner ID rejected | ✅ Verified | Unit: `ownerUpdateSchema` rejects bad shape; API handler checks crmUsers existence → 422 |
| 8 | Won capture persists all won fields | ✅ Verified | DB test: `wonOrgName`, `dealValueCents`, `currency`, `signedAt` all stored |
| 9 | Lost marking persists reason | ✅ Verified | DB test: `lostReason` stored on the lead row |
| 10 | `crm_lead_history` audit rows written | ✅ Verified | DB tests assert history rows for stage, won_org_name, deal_value_cents, lost_reason, owner_id |
| 11 | Soft-deleted leads excluded from mutations | ✅ Verified | DB test: `moveLeadStage` on soft-deleted → null; `reassignLead` on soft-deleted → null |
| 12 | Detail page mutations real (selectStage, won, lost, reassign) | ✅ Verified | Static: all 5 handlers now use `fetch()` to real endpoints |
| 13 | Pipeline page mutations real | ✅ Verified | Static: `onMove`, `confirmWon`, `confirmLost` use real `fetch()` |
| 14 | Phase 4 list/detail/add regression | ✅ Verified | DB regression test in `pipeline-db.spec.ts`; all Phase 4 tests still pass |

---

## Architecture Decisions

### Two dedicated PATCH endpoints (not a single generic update)

**Decision:** `PATCH /api/leads/[id]/stage` and `PATCH /api/leads/[id]/owner` are separate endpoints rather than a single `PATCH /api/leads/[id]` catch-all.

**Rationale:**
- Each operation has distinct validation logic (discriminated union for stage vs. UUID for owner)
- Audit trail fields differ: stage writes `stage` + optional won/lost history rows; owner writes `owner_id` only
- Authorization rules may diverge in Phase 6 (e.g. only manager can reassign, rep can move stages)
- Smaller request surfaces = easier to test, easier to permission-gate later

**Trade-off:** Two HTTP calls if a move simultaneously changes owner (not a product requirement now). If it becomes one, merge into `PATCH /api/leads/[id]` with action discrimination.

---

### `moveStageSchema` uses discriminated union

The payload shape for Won is structurally different from Lost, which is different from regular pipeline moves:

```
regular: { stage: 'new' | 'contacted' | 'replied' | 'in_discussion' }
won:     { stage: 'won', wonOrgName?, dealValueCents?, currency, signedAt? }
lost:    { stage: 'lost', lostReason: 'no_response' | 'rejected' | 'not_a_fit' }
```

A discriminated union enforces that the `lostReason` field is required only when `stage === 'lost'` (and absent for regular moves). Zod's `z.discriminatedUnion('stage', [...])` handles this cleanly and gives useful error messages on bad input.

`wonOrgName` is optional at the API layer (the DB column is nullable). The UI can submit without filling in the org name. A future phase could add server-side enforcement.

---

### `ownerUpdateSchema` uses shape-only UUID regex (not `z.string().uuid()`)

**Issue:** `z.string().uuid()` in Zod v4 enforces RFC 4122 variant bits — the 4th UUID group must start with `8`, `9`, `a`, or `b`. The seeded test users use fixed sequential IDs like `00000000-0000-0000-0000-000000000001` whose 4th group is `0000`, failing the RFC 4122 variant check.

**Decision:** Use a shape-only regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$i` that validates UUID format without enforcing variant.

**Why this is safe:** Real DB UUIDs from PostgreSQL's `defaultRandom()` / `gen_random_uuid()` are proper RFC 4122 v4 UUIDs and satisfy both the shape check and the RFC variant requirement. The looser validator is only needed for seeded fixture UUIDs (development/test data). The FK constraint in PostgreSQL provides ultimate validation that the owner exists.

**Note:** The same issue affects `activityFormSchema.leadId` (`z.string().uuid()`). If real lead IDs always come from `defaultRandom()`, that schema is fine. Only the seeded user UUIDs are non-RFC-4122.

---

### Pipeline page: `+page.server.ts` replaces `+page.ts`

**Before Phase 5:** `src/routes/pipeline/+page.ts` (universal load) called `crm.listLeads()` and `crm.listUsers()` from the in-memory mock client.

**After Phase 5:** `src/routes/pipeline/+page.server.ts` calls `listLeads()` and `listUsers()` from the Drizzle DB layer. `+page.ts` deleted.

**Why delete `+page.ts` rather than modify it?**
- The universal load is specifically for "run on server during SSR, run on client during navigation". When the real data source is a server-only DB, a universal load can't call it from the client.
- A server load (`+page.server.ts`) is the right primitive: SvelteKit fetches the data server-side and delivers it via its internal `__data.json` channel to the SPA client.
- This is the same pattern Phase 4 used for the leads list, detail, and new pages.

**No changes to `PipelineBoard.svelte` props:** The component receives `leads` and `users` from `data.*` the same way as before.

---

### Audit trail: `crm_lead_history` rows on every mutation

Every mutation writes at minimum one history row (for the changed field). Won capture writes additional rows for `won_org_name` and `deal_value_cents` when those values are provided. The `actorUserId` is always `locals.user.id` from the authenticated session.

History row format:
```
field:    'stage' | 'owner_id' | 'won_org_name' | 'deal_value_cents' | 'lost_reason'
oldValue: previous string value (or null for won/lost capture fields)
newValue: new string value
```

`dealValueCents` is stored as a string in history (`String(payload.dealValueCents)`) because `old_value` and `new_value` columns are `text`.

---

### `updatedAt` set explicitly on every update

The `crm_leads.updated_at` column has `.notNull().defaultNow()` but no Drizzle `$onUpdate` trigger. Every `db.update(...).set({...})` call in the DB layer explicitly passes `updatedAt: new Date()`. This is the established project pattern from `createLead` (which relies on defaultNow for initial value, but updates need explicit set).

---

### Won capture `signedAt` defaults to `now()` when omitted

If the UI sends `signedAt: undefined` (user didn't fill the date field), the DB function defaults to `new Date()`. This avoids a null `signed_at` for won leads, which could confuse time-based reporting later.

---

## DB Layer Functions Added

### `moveLeadStage(id, stage, payload, actorId): Promise<Lead | null>`

1. Reads existing row (`stage`, `ownerId`) to populate `oldValue` in history.
2. Returns `null` immediately if the lead doesn't exist or is soft-deleted.
3. Branches on `stage` to build a typed update object (avoids a `Record<string, unknown>` escape hatch that would lose Drizzle column type safety).
4. Inserts 1–3 history rows depending on `stage` (always stage row; optionally won fields; optionally lost_reason).
5. Returns the mapped `Lead` from the updated row via `dbRowToLead`.

### `reassignLead(id, ownerId, actorId): Promise<Lead | null>`

1. Reads existing `ownerId` for history `oldValue`.
2. Returns `null` if soft-deleted or not found.
3. Updates `ownerId` + `updatedAt`.
4. Inserts one `owner_id` history row.
5. Returns mapped `Lead`.

Neither function validates business rules (e.g. permission to reassign). Business rules belong in the API handler or a future service layer.

---

## Error Handling

### Server (API endpoints)

| Condition | HTTP status | Body |
|---|---|---|
| No session | 401 | `'Unauthorized'` |
| Malformed JSON | 400 | `'Invalid JSON'` |
| Invalid stage/reason | 400 | Zod error message |
| Lead not found / soft-deleted | 404 | `'Lead not found'` |
| Owner not found in crmUsers | 422 | `'Owner not found'` |

No stack traces leak to the client. Errors from `db.*` that are not caught will surface as 500s via SvelteKit's error boundary — acceptable for unexpected DB failures.

### Client (Svelte components)

All five mutation handlers in `[id]/+page.svelte` and `pipeline/+page.svelte` follow this pattern:
1. Close modals / update local state BEFORE the fetch (prevents double-fire on re-open)
2. `try { const res = await fetch(...); if (!res.ok) { toast + return; } } catch { toast + return; }`
3. `await invalidateAll()` + success toast ONLY on clean success
4. `invalidateAll()` re-runs the `+page.server.ts` load, so the board/detail page reflects the new DB state without a full page reload

---

## Test Structure

### `src/tests/pipeline.spec.ts` — 16 unit tests (no DB)

Covers:
- `moveStageSchema`: regular stages, won (full / minimal / missing fields), lost (valid / missing reason / invalid reason), invalid stage, missing stage, negative dealValueCents, currency default
- `ownerUpdateSchema`: valid UUID, non-UUID string, missing ownerId
- `BOARD_STAGES`: correct stages present, `lost` absent (collapsed separately)

### `src/tests/pipeline-db.spec.ts` — 15 DB integration tests

Skipped in CI (`SKIP_DB = process.env.CI === 'true'`). Run locally with `docker compose up -d db`.

Covers:
- Regular stage transition: persists to DB, returns correct Lead
- Nonexistent lead → null
- Soft-deleted lead → null
- History row written (field, oldValue, newValue, actorUserId)
- Won capture: all won fields stored, history rows for stage + won_org_name + deal_value_cents
- Won without optional fields (no dealValue)
- Lost: lostReason stored, history rows for stage + lost_reason
- Reassign: ownerId updated, confirmed via getLead, history row with old/new owner
- Phase 4 regression: createLead + getLead still correct

Cleanup: `afterAll` hard-deletes only rows matching `__p5test__` name prefix.

---

## Files Changed

| File | Change type |
|---|---|
| `src/lib/zod/schemas.ts` | Added `moveStageSchema`, `ownerUpdateSchema` |
| `src/lib/server/db/leads.ts` | Added `moveLeadStage`, `reassignLead`; added `crmLeadHistory`, `LostReason`, `MoveStagePayload` imports |
| `src/routes/api/leads/[id]/stage/+server.ts` | New — PATCH endpoint |
| `src/routes/api/leads/[id]/owner/+server.ts` | New — PATCH endpoint |
| `src/routes/pipeline/+page.server.ts` | New — server load |
| `src/routes/pipeline/+page.ts` | Deleted — replaced by server load |
| `src/routes/pipeline/+page.svelte` | Replaced mock `crm.*` calls with `fetch()` |
| `src/routes/leads/[id]/+page.svelte` | Replaced mock `crm.*` calls with `fetch()` |
| `src/tests/pipeline.spec.ts` | New — 16 unit tests |
| `src/tests/pipeline-db.spec.ts` | New — 15 DB integration tests |

---

## Still Mock-Backed After Phase 5

| Feature | Location | Target phase |
|---|---|---|
| `logTouch` (activity log) | `[id]/+page.svelte` | Phase 6 |
| Nav badge counts (overdue, unassigned, review) | `+layout.ts` → `crm.*` | Phase 6 |
| Unassigned pool (claim / bulk-claim) | `/unassigned/+page.svelte` | Phase 6 |
| Today / daily loop page | `/+page.svelte` | Phase 6+ |
| Reports | `/reports/+page.svelte` | Phase 7 |
| Review queue | `/review/+page.svelte` | Phase 7 |

---

## For Next Phase (Phase 6 — Activity Log)

1. **`addActivity` DB function** — insert into `crm_activities`, update `crm_leads.last_activity_at` and optionally `follow_up_at`
2. **`POST /api/leads/[id]/activities`** — validate via `activityFormSchema`
3. **`logTouch` in `[id]/+page.svelte`** — replace mock `crm.addActivity()` with real fetch
4. **`activityFormSchema.leadId`** — check whether `z.string().uuid()` needs the same regex-relaxation fix as `ownerUpdateSchema` (only matters if seeded lead IDs are ever used in form submissions)
5. **Playwright auth fixture** — log in via magic link in test setup so e2e specs can cover the full browser flow for board interactions

## Timeline

2026-06-29 | Phase 5 shipped — all mutations real DB-backed, 78/78 tests pass
