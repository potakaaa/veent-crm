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
		edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
		info: 'M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
		palette:
			'M12 2a10 10 0 100 20 2 2 0 002-2 1.5 1.5 0 00-1.5-1.5H11a2 2 0 010-4h3a5 5 0 005-5c0-4-3.5-7.5-6-7.5z',
		calendar:
			'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
		calendarDays:
			'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
		snowflake: 'M12 2v20M4.5 7L19.5 17M19.5 7L4.5 17',
		reply: 'M9 17l-5-5 5-5M4 12h11a4 4 0 014 4v2',
		message: 'M4 5h16v10H9l-4 4V5z',
		bell: 'M12 3a5 5 0 00-5 5v3.5c0 1-.4 2-1.2 2.8L4 16h16l-1.8-1.7c-.8-.8-1.2-1.8-1.2-2.8V8a5 5 0 00-5-5zM9.5 19a2.5 2.5 0 005 0',
		copy: 'M9 9V5a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-4M5 9h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2z',
		arrowUp: 'M12 19V5M5 12l7-7 7 7',
		arrowDown: 'M12 5v14M5 12l7 7 7-7',
		crown: 'M3 19h18M5 19V9l7-5 7 5v10',
		trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
		organizers: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 13h.01M15 13h.01',
		video: 'M15 10l5-3v10l-5-3M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z',
		link: 'M9 15l6-6M11 6l1-1a4 4 0 015.7 5.7l-2 2M13 18l-1 1a4 4 0 01-5.7-5.7l2-2',
		clock: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0z',
		sort: 'M7 3v14M4 6l3-3 3 3M17 21V7M14 18l3 3 3-3'
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
