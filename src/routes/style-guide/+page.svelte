<script lang="ts">
	import { STAGE_TOKENS, AGE_TOKENS } from '$lib/design/tokens';

	// Moodboard data — mirrors the "Style guide" section of the imported
	// "Veent Outreach Console - Board" design.
	const surfaces = [
		{ name: 'Primary', var: '--color-primary', hex: '#C0362C', note: 'Brand · CTAs' },
		{ name: 'Ink / rail', var: '--color-ink', hex: '#261617', note: 'Text · sidebar' },
		{ name: 'Canvas', var: '--color-canvas', hex: '#F3E9E6', note: 'App background' },
		{ name: 'Panel', var: '--color-panel', hex: '#FFFFFF', note: 'Cards · frames' },
		{ name: 'Panel sunken', var: '--color-panel-sunken', hex: '#F5ECEA', note: 'Rows · wells' },
		{ name: 'Hairline', var: '--color-hairline', hex: '#EFE2E0', note: 'Borders' }
	];

	const signals = [
		{ name: 'Overdue', var: '--color-overdue', hex: '#E11D48' },
		{ name: 'Stale', var: '--color-stale', hex: '#C2710C' },
		{ name: 'Fresh / won', var: '--color-fresh', hex: '#0E9F6E' }
	];

	const inkRamp = [
		{ var: '--color-ink', hex: '#261617' },
		{ var: '--color-ink-600', hex: '#5A4A48' },
		{ var: '--color-ink-400', hex: '#8E7C78' },
		{ var: '--color-ink-300', hex: '#9C8A86' },
		{ var: '--color-ink-200', hex: '#A89490' }
	];

	const typeScale = [
		{ label: 'Screen title', spec: 'Spectral 26 / 600', cls: 'font-serif text-[26px] font-semibold', sample: 'Today' },
		{ label: 'Group head', spec: 'Spectral 15 / 600', cls: 'font-serif text-[15px] font-semibold', sample: 'Overdue follow-ups' },
		{ label: 'Row name', spec: 'Inter 13 / 600', cls: 'font-sans text-[13px] font-semibold', sample: 'Christian Concerts PH' },
		{ label: 'Body / secondary', spec: 'Inter 13 / 400', cls: 'font-sans text-[13px] font-normal text-ink-600', sample: 'Strike while the reply is warm.' },
		{ label: 'Data / meta', spec: 'IBM Plex Mono', cls: 'font-mono text-[12px] text-ink-400', sample: '@christianconcertsph · 3d overdue' }
	];
</script>

<svelte:head><title>Style guide · Veent CRM</title></svelte:head>

<div class="space-y-10">
	<!-- Masthead -->
	<header class="space-y-2">
		<p class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
			Moodboard · imported from Claude Design
		</p>
		<h1 class="font-serif text-[32px] font-bold leading-tight text-ink">
			Veent Outreach Console
		</h1>
		<p class="max-w-xl text-[14px] text-ink-600">
			Warm, editorial wine-on-cream system for event-organizer outreach. Spectral sets the
			voice, Inter carries the work, IBM Plex Mono marks every piece of data.
		</p>
	</header>

	<!-- Color tokens -->
	<section class="space-y-4">
		<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
			Color tokens
		</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each surfaces as c}
				<div class="overflow-hidden rounded-frame border border-hairline bg-panel shadow-frame">
					<div class="h-20 border-b border-hairline" style="background:var({c.var})"></div>
					<div class="p-3">
						<div class="text-[13px] font-semibold text-ink">{c.name}</div>
						<div class="font-mono text-[11px] uppercase text-ink-400">{c.hex}</div>
						<div class="mt-1 text-[11px] text-ink-500">{c.note}</div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Signal + ink ramp -->
	<section class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4">
			<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
				Signal / age
			</h2>
			<div class="flex flex-wrap gap-3">
				{#each signals as s}
					<div class="flex items-center gap-2 rounded-control border border-hairline bg-panel px-3 py-2 shadow-frame">
						<span class="size-3.5 rounded-full" style="background:var({s.var})"></span>
						<span class="text-[13px] font-medium text-ink">{s.name}</span>
						<span class="font-mono text-[11px] uppercase text-ink-400">{s.hex}</span>
					</div>
				{/each}
			</div>
		</div>
		<div class="space-y-4">
			<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
				Ink ramp
			</h2>
			<div class="flex overflow-hidden rounded-frame border border-hairline shadow-frame">
				{#each inkRamp as i}
					<div class="flex h-16 flex-1 items-end p-1.5" style="background:var({i.var})">
						<span class="font-mono text-[9px] uppercase text-white/80">{i.hex}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Typography -->
	<section class="space-y-4">
		<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
			Type scale
		</h2>
		<div class="divide-y divide-hairline overflow-hidden rounded-frame border border-hairline bg-panel shadow-frame">
			{#each typeScale as t}
				<div class="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6">
					<div class="w-40 shrink-0">
						<div class="text-[13px] font-semibold text-ink">{t.label}</div>
						<div class="font-mono text-[11px] text-ink-400">{t.spec}</div>
					</div>
					<div class={t.cls}>{t.sample}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Stage chips -->
	<section class="space-y-4">
		<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
			Stage chips
		</h2>
		<div class="flex flex-wrap gap-2">
			{#each STAGE_TOKENS as s}
				<span
					class="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 font-mono text-[11px] font-medium"
					style="color:{s.color}; background:color-mix(in srgb, {s.color} 10%, transparent)"
				>
					<span class="size-1.5 rounded-full" style="background:{s.color}"></span>
					{s.key}
				</span>
			{/each}
		</div>
	</section>

	<!-- Age badges -->
	<section class="space-y-4">
		<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
			Age badges
		</h2>
		<div class="flex flex-wrap gap-2">
			{#each AGE_TOKENS as a}
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
					style="color:{a.color}; background:color-mix(in srgb, {a.color} 12%, transparent)"
				>
					{a.label}
				</span>
			{/each}
		</div>
	</section>

	<!-- Buttons + frames -->
	<section class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4">
			<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
				Buttons
			</h2>
			<div class="flex flex-wrap items-center gap-3">
				<button
					class="rounded-control bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-frame transition hover:bg-primary-strong"
				>
					Log touch
				</button>
				<button
					class="rounded-control border border-hairline-strong bg-panel px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-panel-sunken"
				>
					Snooze
				</button>
				<button
					class="rounded-control px-4 py-2 text-[13px] font-semibold text-ink-500 transition hover:bg-panel-sunken"
				>
					Skip
				</button>
				<button
					class="rounded-control border border-fresh/30 px-4 py-2 text-[13px] font-semibold text-fresh transition hover:bg-fresh/10"
				>
					Mark won
				</button>
			</div>
		</div>
		<div class="space-y-4">
			<h2 class="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-300">
				Frame · elevation
			</h2>
			<div class="rounded-panel border border-hairline bg-panel p-5 shadow-pop">
				<div class="font-serif text-[15px] font-semibold text-ink">Christian Concerts PH</div>
				<div class="mt-0.5 font-mono text-[11px] text-ink-400">
					@christianconcertsph · 3d overdue
				</div>
				<p class="mt-3 text-[13px] text-ink-600">
					Cards sit on the cream canvas with a hairline edge and a soft, warm-tinted shadow.
				</p>
			</div>
		</div>
	</section>
</div>
