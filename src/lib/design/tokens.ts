/**
 * Design token reference for the Veent Outreach Console moodboard.
 *
 * These mirror the CSS custom properties declared in `src/lib/styles/tokens.css`.
 * Use the Tailwind utilities (e.g. `bg-stage-won`, `text-overdue`) in markup;
 * use these maps when a value is needed in script (charts, inline SVG, etc.).
 *
 * NOTE: the CRM domain enums (Stage, etc.) will be defined under `src/lib/types`
 * when the full frontend lands. This file only carries the *visual* vocabulary.
 */

/** Pipeline stages, in funnel order, with their moodboard accent colors. */
export const STAGE_TOKENS = [
	{ key: 'new', label: 'New', color: 'var(--color-stage-new)', hex: '#6b7280' },
	{ key: 'contacted', label: 'Contacted', color: 'var(--color-stage-contacted)', hex: '#2563eb' },
	{ key: 'replied', label: 'Replied', color: 'var(--color-stage-replied)', hex: '#7c3aed' },
	{
		key: 'in_discussion',
		label: 'In discussion',
		color: 'var(--color-stage-discussion)',
		hex: '#d97706'
	},
	{ key: 'won', label: 'Won', color: 'var(--color-stage-won)', hex: '#059669' },
	{ key: 'lost', label: 'Lost', color: 'var(--color-stage-lost)', hex: '#9ca3af' }
] as const;

export type StageKey = (typeof STAGE_TOKENS)[number]['key'];

/** Lead-age / attention badges. */
export const AGE_TOKENS = [
	{ key: 'fresh', label: 'Fresh', color: 'var(--color-fresh)', hex: '#059669' },
	{ key: 'stale', label: 'Stale', color: 'var(--color-stale)', hex: '#d97706' },
	{ key: 'overdue', label: 'Overdue', color: 'var(--color-overdue)', hex: '#dc2626' }
] as const;

export type AgeKey = (typeof AGE_TOKENS)[number]['key'];

/** Convenience lookups. */
export const stageColor = (key: StageKey): string =>
	STAGE_TOKENS.find((s) => s.key === key)?.color ?? 'var(--color-stage-new)';

export const stageLabel = (key: StageKey): string =>
	STAGE_TOKENS.find((s) => s.key === key)?.label ?? key;

/** Platform badges — abbreviation + brand-ish hex (matches the design). */
export const PLATFORM_TOKENS: Record<string, { abbr: string; hex: string }> = {
	Facebook: { abbr: 'FB', hex: '#2563eb' },
	Instagram: { abbr: 'IG', hex: '#db2777' },
	TikTok: { abbr: 'TT', hex: '#1e1a1f' },
	'Twitter/X': { abbr: 'X', hex: '#1e1a1f' },
	Other: { abbr: '•', hex: '#9ca3af' }
};

export const platformToken = (platform: string) =>
	PLATFORM_TOKENS[platform] ?? PLATFORM_TOKENS.Other;

/** Activity-outcome chip colors. */
export const OUTCOME_TOKENS: Record<string, { label: string; hex: string }> = {
	sent: { label: 'Sent', hex: '#6b7280' },
	replied: { label: 'Replied', hex: '#059669' },
	no_response: { label: 'No response', hex: '#d97706' },
	rejected: { label: 'Rejected', hex: '#dc2626' },
	other: { label: 'Other', hex: '#9ca3af' }
};

/** Deterministic avatar color for a rep, by name. */
const AVATAR_PALETTE = ['#e11d2a', '#059669', '#d97706', '#2563eb', '#7c3aed', '#9ca3af'];
export const avatarColor = (name: string | null | undefined): string => {
	if (!name) return '#9ca3af';
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};
