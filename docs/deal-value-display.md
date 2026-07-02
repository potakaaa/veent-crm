# Deal value display — cents storage vs. display units

Documents the `dealValueCents` storage convention, the `formatMoney` contract, and the bug
that caused reports to show values with two extra zeros.

---

## Storage convention

Deal values are stored as **integer cents** in the database:

```
Schema: dealValueCents  integer('deal_value_cents')
```

A user-entered value of **PHP 100** is stored as **10,000** cents.

The conversion happens in `WonCaptureModal.svelte` at submission time:

```ts
dealValueCents: parsedDealValue !== undefined ? Math.round(parsedDealValue * 100) : undefined
```

The `Math.round` handles floating-point input (e.g. "99.99" → 9999 cents, not 9998.99...).

---

## Display convention

`formatMoney` in `src/lib/utils/currency.ts` expects **whole currency units**, not cents:

```ts
export function formatMoney(value: number | undefined, currency: Currency = 'PHP'): string {
  if (value === undefined || value === null) return '—';
  return `${currencySymbol(currency)}${value.toLocaleString('en-PH')}`;
}
```

Calling `formatMoney(10000, 'PHP')` returns `₱10,000` — which is wrong if the input was
raw `dealValueCents`. The caller must divide by 100 first.

---

## The bug (2026-06-30)

**File:** `src/routes/reports/+page.server.ts`

The reports page queries the sum of `dealValueCents` across all won leads, grouped by currency:

```ts
const currencyRows = await db
  .select({
    currency: crmLeads.currency,
    total: sum(crmLeads.dealValueCents),   // ← raw cents from DB
    deals: count()
  })
  .from(crmLeads)
  .where(and(isNull(crmLeads.deletedAt), eq(crmLeads.stage, 'won')))
  .groupBy(crmLeads.currency);
```

The bug was in the mapping step — `total` was passed to the client as raw cents:

```ts
// BEFORE (bug)
total: Number(r.total),       // 10,000 for a PHP 100 deal
```

`formatMoney(10000, 'PHP')` then rendered `₱10,000` instead of `₱100`.

**Fix — divide by 100 at the server boundary:**

```ts
// AFTER (fix)
total: Number(r.total) / 100,  // 100 for a PHP 100 deal
```

The division happens once at the server/client boundary so all downstream display code can
call `formatMoney(total, currency)` directly without any additional conversion.

---

## Rule: where to convert

```
DB layer      → always cents    (dealValueCents column, integer)
API boundary  → divide by 100   (server load functions, API route responses)
Display layer → whole units     (formatMoney, toLocaleString)
```

Never pass raw cents to `formatMoney`. Never divide by 100 inside a display component.

---

## Other callers

### groupByCurrency (currency.ts)

```ts
export function groupByCurrency(leads: Lead[]): { currency: Currency; total: number; deals: number }[]
```

This utility operates on `Lead` objects from the client, where `dealValue` is already in whole
units (the Lead type carries `dealValue: number | null` mapped from `dealValueCents / 100` during
the DB→type mapping in `src/lib/server/db/leads.ts`). It does NOT use `dealValueCents` directly,
so no division is needed inside this function.

### Lead detail page

The lead detail page displays the deal value via the `Lead` type's `dealValue` field (already
converted), not raw `dealValueCents`. No extra division needed there.

### seed.ts

The seed script hard-codes `dealValueCents` directly:

```ts
dealValueCents: 300_000   // ₱3,000
```

This is correct — seed data goes straight to the DB column, no conversion step.

---

## Affected files

| File | Role | Status |
|---|---|---|
| `src/lib/server/db/schema.ts:158` | `dealValueCents integer` column definition | Source of truth |
| `src/lib/components/leads/WonCaptureModal.svelte:47` | `Math.round(parsedDealValue * 100)` on submit | Correct |
| `src/lib/utils/currency.ts:16` | `formatMoney` — expects whole units | Correct |
| `src/routes/reports/+page.server.ts:100` | `Number(r.total) / 100` | Fixed 2026-06-30 |
| `src/lib/server/db/leads.ts` | DB→Lead mapper divides cents to units | Correct |
