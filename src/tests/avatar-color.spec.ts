import { describe, it, expect } from 'vitest';
import { resolveAvatarColor, avatarColor } from '$lib/design/tokens';

// resolveAvatarColor(stored, name) — GitHub #275 AC4
describe('resolveAvatarColor (GitHub #275 AC4)', () => {
	it('returns the stored color when present', () => {
		expect(resolveAvatarColor('#123456', 'Marites Santos')).toBe('#123456');
	});

	it('falls back to avatarColor(name) when stored is null', () => {
		expect(resolveAvatarColor(null, 'Marites Santos')).toBe(avatarColor('Marites Santos'));
	});

	it('falls back to avatarColor(name) when stored is undefined (name also null)', () => {
		expect(resolveAvatarColor(undefined, null)).toBe(avatarColor(null));
	});
});
