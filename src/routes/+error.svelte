<script lang="ts">
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{isNotFound ? 'Page not found' : 'Something went wrong'} · Veent CRM</title>
</svelte:head>

<div class="flex h-screen items-center justify-center bg-ink p-10 text-white">
	<div class="w-[460px] max-w-full">
		<div class="mb-9 flex items-center gap-2.5">
			<div
				class="flex h-[34px] w-[34px] items-center justify-center rounded-control bg-primary text-[17px] font-bold"
			>
				V
			</div>
			<div>
				<div class="text-[15px] font-bold tracking-[-0.2px]">Veent CRM</div>
				<div class="font-mono text-[10px] uppercase tracking-[1px] text-nav-faint">
					Outreach Console
				</div>
			</div>
		</div>

		<div class="mb-2 font-mono text-[64px] font-semibold leading-none tracking-[-1px] text-primary">
			{page.status}
		</div>

		{#if isNotFound}
			<h1 class="mb-3 font-serif text-[32px] font-semibold leading-[1.2] tracking-[-0.5px]">
				Page not found.
			</h1>
			<p class="mb-7 text-[14px] leading-relaxed text-nav-muted">
				The page you're after doesn't exist or may have moved. Check the address or head back to the
				console.
			</p>
		{:else}
			<h1 class="mb-3 font-serif text-[32px] font-semibold leading-[1.2] tracking-[-0.5px]">
				Something went wrong.
			</h1>
			<p class="mb-2 text-[14px] leading-relaxed text-nav-muted">
				An unexpected error occurred. Try again, or head back to the console.
			</p>
			{#if page.error?.message}
				<p
					class="mb-7 rounded-panel border border-[#312c37] bg-white/5 p-3.5 font-mono text-[12.5px] leading-relaxed text-[#cdbab8]"
				>
					{page.error.message}
				</p>
			{:else}
				<div class="mb-7"></div>
			{/if}
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<a
				href="/"
				class="focus-ring inline-flex h-11 items-center justify-center rounded-control bg-primary px-6 text-[14px] font-semibold text-white hover:bg-primary-strong"
			>
				Go home
			</a>
			<button
				onclick={() => history.back()}
				class="focus-ring inline-flex h-11 items-center justify-center rounded-control border border-[#312c37] px-6 text-[14px] font-medium text-[#cdbab8] hover:text-white"
			>
				Go back
			</button>
		</div>
	</div>
</div>
