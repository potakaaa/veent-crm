import { describe, it, expect } from 'vitest';
import {
	rewriteTokens,
	legacyToSeedRow,
	buildSeedRows,
	LEGACY_ENTRIES,
	SEED_CATEGORY
} from '../../scripts/seed-templates';

describe('rewriteTokens (pure legacy token rewrite)', () => {
	it('rewrites legacy {{page}} -> {{organizerName}} and {{event}} -> {{eventName}}', () => {
		expect(rewriteTokens('Hi {{page}} about {{event}}')).toBe(
			'Hi {{organizerName}} about {{eventName}}'
		);
	});

	it('rewrites every occurrence of a repeated legacy token', () => {
		expect(rewriteTokens('{{page}} {{page}} — {{event}}/{{event}}')).toBe(
			'{{organizerName}} {{organizerName}} — {{eventName}}/{{eventName}}'
		);
	});

	it('is idempotent on already-migrated new-token bodies (no double-rewrite)', () => {
		const body = 'Following up from {{organizerName}} about {{eventName}}';
		expect(rewriteTokens(body)).toBe(body);
	});

	it('passes through bodies with no tokens unchanged', () => {
		expect(rewriteTokens('Plain text, no tokens.')).toBe('Plain text, no tokens.');
	});

	it('never leaves a legacy token behind after rewrite', () => {
		const out = rewriteTokens('{{page}} hosts {{event}}');
		expect(out).not.toContain('{{page}}');
		expect(out).not.toContain('{{event}}');
	});
});

describe('legacyToSeedRow (pure row mapping)', () => {
	it("maps title=label, category='Other', and rewrites the body", () => {
		const row = legacyToSeedRow({ label: 'Warm intro', body: 'Hey {{page}} — {{event}}' });
		expect(row).toEqual({
			category: 'Other',
			title: 'Warm intro',
			body: 'Hey {{organizerName}} — {{eventName}}'
		});
	});
});

describe('buildSeedRows (all 9 legacy entries)', () => {
	const rows = buildSeedRows();

	it('produces exactly 9 mapped rows', () => {
		expect(rows).toHaveLength(9);
		expect(LEGACY_ENTRIES).toHaveLength(9);
	});

	it("assigns category 'Other' to every row", () => {
		expect(rows.every((r) => r.category === SEED_CATEGORY)).toBe(true);
	});

	it('preserves each legacy label as the row title', () => {
		expect(rows.map((r) => r.title)).toEqual(LEGACY_ENTRIES.map((e) => e.label));
	});

	it('leaves no legacy {{page}}/{{event}} tokens in any body', () => {
		for (const r of rows) {
			expect(r.body).not.toContain('{{page}}');
			expect(r.body).not.toContain('{{event}}');
		}
	});
});
