<script lang="ts" module>
	/** Stroke-icon path data (24x24, currentColor). */
	export const ICONS = {
		today: 'M3 12h3.5l2 6 4-13 2.5 9H21',
		leads: 'M4 6h16M4 12h16M4 18h11',
		pipeline: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z',
		unassigned: 'M12 12a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM5 20a7 7 0 0114 0',
		reminders: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
		reports: 'M5 19V10M12 19V5M19 19v-6',
		team: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M16 11a3 3 0 000-6M21 20a6 6 0 00-5-5.9',
		review: 'M12 9v4M12 17h.01M10.3 4.3l-7 12A1 1 0 004 18h16a1 1 0 00.9-1.5l-7-12a1 1 0 00-1.7 0z',
		alert: 'M12 9v4M12 17h.01M10.3 4.3l-7 12A1 1 0 004 18h16a1 1 0 00.9-1.5l-7-12a1 1 0 00-1.7 0z',
		plus: 'M12 5v14M5 12h14',
		logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
		back: 'M15 18l-6-6 6-6',
		check: 'M20 6L9 17l-5-5',
		info: 'M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
		palette: 'M12 2a10 10 0 100 20 2 2 0 002-2 1.5 1.5 0 00-1.5-1.5H11a2 2 0 010-4h3a5 5 0 005-5c0-4-3.5-7.5-6-7.5z'
	} as const;
	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	let {
		name,
		size = 17,
		stroke = 1.8
	}: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={ICONS[name]} />
</svg>
