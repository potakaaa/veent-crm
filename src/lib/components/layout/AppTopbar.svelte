<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';

	// Opens the mobile nav drawer (state lives in AppShell, drawer renders in AppSidebar).
	let { onMenuClick }: { onMenuClick: () => void } = $props();
</script>

<header class="relative z-30 flex h-[60px] shrink-0 items-center gap-3.5 bg-nav-bg px-[18px]">
	<!--
		Hamburger — the mobile entry point to the nav that the sidebar hides below 880px.
		Viewport-gated (`hidden max-[880px]:inline-flex`) so it has zero effect at >=880px where
		the desktop sidebar is present. Inline SVG (no Icon-set dependency) keeps this in blast radius.
	-->
	<button
		type="button"
		onclick={onMenuClick}
		aria-label="Open navigation menu"
		class="focus-ring hidden h-9 w-9 items-center justify-center rounded-control text-nav-fg hover:bg-white/5 max-[880px]:inline-flex"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M3 6h18M3 12h18M3 18h18" />
		</svg>
	</button>
	<div class="ml-auto flex items-center gap-2">
		<a
			href="/leads/new"
			class="focus-ring flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-[15px] text-[13px] font-semibold text-white shadow-nav-cta hover:bg-primary-strong"
		>
			<Icon name="plus" size={15} stroke={2.2} />
			New lead
		</a>
	</div>
</header>
