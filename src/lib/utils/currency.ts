/**
 * Currency helpers. Deal value is ALWAYS shown per-currency and NEVER summed
 * across currencies (product rule) — `groupByCurrency` enforces that shape.
 */
import type { Currency, Lead } from '$lib/types';

const SYMBOL: Record<Currency, string> = { PHP: '₱', SGD: 'S$' };
const LABEL: Record<Currency, string> = {
	PHP: 'PHP — Philippine peso',
	SGD: 'SGD — Singapore dollar'
};

export const currencySymbol = (c: Currency): string => SYMBOL[c] ?? '';
export const currencyLabel = (c: Currency): string => LABEL[c] ?? c;

export function formatMoney(value: number | undefined, currency: Currency = 'PHP'): string {
	if (value === undefined || value === null) return '—';
	return `${currencySymbol(currency)}${value.toLocaleString('en-PH')}`;
}

/** Sum won-deal values bucketed by currency — never a single cross-currency total. */
export function groupByCurrency(
	leads: Lead[]
): { currency: Currency; total: number; deals: number }[] {
	const buckets = new Map<Currency, { total: number; deals: number }>();
	for (const l of leads) {
		if (l.stage !== 'won' || !l.dealValue || !l.currency) continue;
		const b = buckets.get(l.currency) ?? { total: 0, deals: 0 };
		b.total += l.dealValue;
		b.deals += 1;
		buckets.set(l.currency, b);
	}
	return [...buckets.entries()].map(([currency, b]) => ({ currency, ...b }));
}
