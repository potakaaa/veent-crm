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

/**
 * Message-template / lead category accents — one curated hue per `LEAD_CATEGORIES`
 * entry (see `src/lib/zod/schemas.ts`). Desaturated "-600" tones spread across the
 * hue wheel, matching the weight of `STAGE_TOKENS` above. Pure red is intentionally
 * excluded (reserved for `--color-primary` / `--color-overdue`) so a category chip
 * is never mistaken for a signal/brand color.
 */
export const CATEGORY_TOKENS: Record<string, string> = {
	Sports: '#2563eb', // blue-600
	Workshop: '#d97706', // amber-600
	Church: '#7c3aed', // violet-600
	Theater: '#c026d3', // fuchsia-600
	'Bar/DJ': '#9333ea', // purple-600
	Conference: '#0284c7', // sky-600
	'Music Fest': '#ea580c', // orange-600
	'Fan Fair': '#ca8a04', // yellow-600
	School: '#4f46e5', // indigo-600
	Concert: '#db2777', // pink-600
	'Live Band': '#0d9488', // teal-600
	Expo: '#0891b2', // cyan-600
	Screening: '#475569', // slate-600
	Camp: '#16a34a', // green-600
	Competition: '#65a30d', // lime-600
	Convention: '#57534e', // stone-600
	Film: '#52525b', // zinc-600
	Modelling: '#059669', // emerald-600
	Resort: '#525252', // neutral-600
	Other: '#4b5563' // gray-600
};

export const categoryColor = (category: string): string => CATEGORY_TOKENS[category] ?? '#4b5563';

/** Deterministic avatar color for a rep, by name. */
const AVATAR_PALETTE = ['#e11d2a', '#059669', '#d97706', '#2563eb', '#7c3aed', '#9ca3af'];
export const avatarColor = (name: string | null | undefined): string => {
	if (!name) return '#9ca3af';
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};
