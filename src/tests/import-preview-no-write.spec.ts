import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db client so we can assert the preview endpoint performs ZERO writes. select() returns a
// chainable that resolves to an empty existing-record set; insert/update are spies that must never
// be called. Spies are created via vi.hoisted so the vi.mock factory (hoisted to top) can see them.
const { insertSpy, updateSpy } = vi.hoisted(() => ({
	insertSpy: vi.fn(),
	updateSpy: vi.fn()
}));
vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => ({
			from: () => ({
				where: async () => []
			})
		})),
		insert: insertSpy,
		update: updateSpy
	}
}));

import { POST } from '../routes/api/import/preview/+server';

beforeEach(() => {
	insertSpy.mockClear();
	updateSpy.mockClear();
});

function event(body: unknown, user: unknown = { id: 'u1', role: 'manager' }) {
	return {
		request: new Request('http://localhost/api/import/preview', {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' }
		}),
		locals: { user }
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/import/preview — zero-write guarantee', () => {
	it('never calls db.insert or db.update while flagging duplicates', async () => {
		const res = await POST(
			event({ target: 'leads', rows: [{ name: 'Acme', pageUrl: 'https://acme.test' }] })
		);
		const bodyJson = await res.json();
		expect(bodyJson.previews.length).toBe(1);
		expect(insertSpy).not.toHaveBeenCalled();
		expect(updateSpy).not.toHaveBeenCalled();
	});

	it('never calls db.insert or db.update for the organizers target', async () => {
		const res = await POST(
			event({
				target: 'organizers',
				rows: [{ name: 'Acme Events', socialFacebook: 'https://facebook.com/acme' }]
			})
		);
		const bodyJson = await res.json();
		expect(bodyJson.previews.length).toBe(1);
		expect(insertSpy).not.toHaveBeenCalled();
		expect(updateSpy).not.toHaveBeenCalled();
	});

	it('rejects an unauthenticated request with 401 (E1)', async () => {
		await expect(
			POST(event({ target: 'leads', rows: [{ name: 'Acme' }] }, null))
		).rejects.toMatchObject({ status: 401 });
		expect(insertSpy).not.toHaveBeenCalled();
	});
});
