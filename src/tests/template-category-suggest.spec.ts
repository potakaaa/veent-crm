import { describe, it, expect } from 'vitest';
import { filterTemplateCategories } from '$lib/utils/template-category-suggest';
import { TEMPLATE_CATEGORIES } from '$lib/data/template-categories';

describe('filterTemplateCategories (GitHub #274 AC2)', () => {
	it('returns the full list on an empty query', async () => {
		const r = await filterTemplateCategories('');
		expect(r).toEqual([...TEMPLATE_CATEGORIES]);
	});

	it('matches by prefix', async () => {
		const r = await filterTemplateCategories('Con');
		expect(r).toEqual(expect.arrayContaining(['Conference', 'Concert', 'Convention']));
	});

	it('matches by substring (not just prefix)', async () => {
		const r = await filterTemplateCategories('cert');
		expect(r).toEqual(['Concert']);
	});

	it('is case-insensitive', async () => {
		const r = await filterTemplateCategories('con');
		expect(r).toEqual(expect.arrayContaining(['Conference', 'Concert', 'Convention']));
	});

	it('returns an empty array when nothing matches', async () => {
		const r = await filterTemplateCategories('zzz-no-match');
		expect(r).toEqual([]);
	});
});
